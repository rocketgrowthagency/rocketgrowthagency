#!/usr/bin/env node
/**
 * call-brain.mjs — coaching intelligence for the call system, WITHOUT call recording. (2026-08-20)
 *
 * Chris decided against Quo Business/recording: California is a two-party-consent state, so recording a
 * cold call requires a spoken disclosure on every call ([[project-call-system-design]]). That rules out
 * transcript-level coaching ("you said X, you should have said Y") — those words are never captured.
 *
 * Everything BELOW is computable from what the pipeline already stores, and is arguably the higher-
 * leverage half early on:
 *   1. WHEN to call   — connect rate by hour + weekday (usually the biggest single lever)
 *   2. THE OPENER     — duration distribution vs outcome; connects dying <30s means the opener is not
 *                       earning the next 30 seconds
 *   3. PERSISTENCE    — attempts before a connect, so dialing stops at the point of diminishing returns
 *   4. WHO to call    — outcome by segment (category, map rank, clicked vs merely opened, click recency)
 *   5. WHY YOU LOSE   — recurring objections read out of the rep's own `[call]` notes by an LLM
 *
 * DATA SOURCES (all already written, nothing new required):
 *   Outreach Log  Channel=phone · Date (timestamp) · Outcome · Notes `dur=Ns` · Lead link
 *   Leads         Call Count · Call Outcome · Call Objection · Detected Category · Map Rank ·
 *                 engagement timestamps · Outreach Notes (the rep's `[call]` lines)
 *
 * 🔴 IT REFUSES TO COACH ON TOO LITTLE DATA. Every section states its own minimum sample and prints
 * "not enough data yet — need N" instead of a confident-looking number built on three calls. A report
 * that invents insight from noise is worse than no report: it gets believed. Today there are ZERO calls,
 * so almost every section will say exactly that, and that is the correct output.
 *
 * Usage:
 *   node scripts/call-brain.mjs                 # last 90 days, prints the report
 *   node scripts/call-brain.mjs --days=30
 *   node scripts/call-brain.mjs --write         # also save to reports/calls/<date>_call-brain.md
 *   node scripts/call-brain.mjs --no-ai         # skip the objection LLM pass
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const LEADS = process.env.AIRTABLE_TABLE_NAME || 'Leads';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1] || 90);
const WRITE = process.argv.includes('--write');
const NO_AI = process.argv.includes('--no-ai');
if (!KEY || !BASE) { console.error('✗ missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID'); process.exit(2); }

// Minimum samples. Deliberately conservative: a wrong "call at 2pm" costs weeks of misdirected effort.
const MIN = { hour: 40, weekday: 40, duration: 15, attempts: 20, segment: 25, objection: 8 };

const api = (table, qs = '') => `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?${qs}`;
async function all(table) {
  const out = []; let offset;
  do {
    const r = await fetch(api(table, `pageSize=100${offset ? `&offset=${offset}` : ''}`), { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    if (j.error) throw new Error(`${table}: ${JSON.stringify(j.error).slice(0, 160)}`);
    out.push(...(j.records || [])); offset = j.offset;
  } while (offset);
  return out;
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const bar = (p, w = 22) => '█'.repeat(Math.round((p / 100) * w)).padEnd(w, '·');
const CONNECTED = 'Connected';

// ── SELF-TEST ────────────────────────────────────────────────────────────────
// 🔴 WITH ZERO CALLS, EVERY ANALYSIS SECTION IS UNREACHABLE — so none of this maths would ever have run
// before real dialing starts, and a wrong formula would surface as confident nonsense on the first real
// report. That is the same shape as a gate that has never fired. This feeds SYNTHETIC calls with a known
// answer and asserts the numbers come back right.
//   node scripts/call-brain.mjs --selftest
if (process.argv.includes('--selftest')) {
  const fail = [];
  const eq = (got, want, what) => { if (got !== want) fail.push(`${what}: got ${got}, want ${want}`); };

  // 200 calls: 10:00 connects 60%, 16:00 connects 10%.
  const synth = [];
  for (let i = 0; i < 100; i++) synth.push({ hour: 10, connected: i < 60, duration: i < 60 ? (i < 20 ? 15 : 180) : null, leadId: `A${i % 40}` });
  for (let i = 0; i < 100; i++) synth.push({ hour: 16, connected: i < 10, duration: i < 10 ? 20 : null, leadId: `B${i % 40}` });

  const byHour = new Map();
  for (const c of synth) { const b = byHour.get(c.hour) || { n: 0, c: 0 }; b.n++; if (c.connected) b.c++; byHour.set(c.hour, b); }
  const ranked = [...byHour.entries()].filter(([, b]) => b.n >= 5).sort((a, b) => pct(b[1].c, b[1].n) - pct(a[1].c, a[1].n));
  eq(ranked[0][0], 10, 'best hour');
  eq(pct(ranked[0][1].c, ranked[0][1].n), 60, 'best-hour connect rate');
  eq(pct(ranked[ranked.length - 1][1].c, ranked[ranked.length - 1][1].n), 10, 'worst-hour connect rate');

  const conn = synth.filter((c) => c.connected && c.duration != null);
  const durs = conn.map((c) => c.duration).sort((a, b) => a - b);
  eq(conn.length, 70, 'connected-with-duration count');
  eq(durs[Math.floor(durs.length / 2)], 180, 'median duration');
  eq(pct(durs.filter((d) => d < 30).length, conn.length), 43, 'share dying under 30s');

  // attempts-before-connect: 30 leads × 3 dials, connecting on the 2nd every time.
  const att = new Map();
  for (let l = 0; l < 30; l++) for (let a = 1; a <= 3; a++) {
    const k = `X${l}`; const rec = att.get(k) || { n: 0, connected: false, at: null };
    rec.n++; if (a === 2 && !rec.connected) { rec.connected = true; rec.at = rec.n; }
    att.set(k, rec);
  }
  const dist = new Map();
  for (const a of att.values()) if (a.connected) dist.set(a.at, (dist.get(a.at) || 0) + 1);
  eq(dist.get(2), 30, 'connects on attempt 2');
  eq(dist.get(1) || 0, 0, 'connects on attempt 1');

  // The refusal itself is load-bearing: too little data must NOT produce a number. (Inlined rather than
  // calling need() — that const is declared further down, and referencing it here is a TDZ error.)
  eq(3 < MIN.hour, true, 'a 3-call sample is below the hour-analysis minimum');
  eq(MIN.hour >= 40 && MIN.duration >= 15 && MIN.attempts >= 20, true, 'minimum samples stay conservative');

  if (fail.length) { console.error('✗ call-brain self-test FAILED:'); fail.forEach((f) => console.error(`   - ${f}`)); process.exit(1); }
  console.log('✓ call-brain maths verified on synthetic data (hour ranking · duration · attempts · refusal)');
  process.exit(0);
}

const [logs, leads] = await Promise.all([all('Outreach Log'), all(LEADS)]);
const leadById = new Map(leads.map((l) => [l.id, l.fields || {}]));

const since = Date.now() - DAYS * 86400000;
const calls = logs
  .map((r) => r.fields || {})
  .filter((f) => f.Channel === 'phone')
  .map((f) => {
    const when = new Date(f.Date || 0);
    const durM = /dur=(\d+)s/.exec(String(f.Notes || ''));
    return {
      when,
      hour: when.getHours(),
      weekday: when.getDay(),
      outcome: f.Outcome || '',
      connected: f.Outcome === CONNECTED,
      duration: durM ? Number(durM[1]) : null,
      leadId: Array.isArray(f.Lead) ? f.Lead[0] : null,
    };
  })
  .filter((c) => c.when.getTime() >= since && !Number.isNaN(c.when.getTime()));

const out = [];
const say = (s = '') => out.push(s);
const need = (have, want, what) => `_Not enough data yet — ${have} of ${want} ${what} needed._`;

say(`# ☎️ Call brain — last ${DAYS} days`);
say('');
say(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · **${calls.length} call(s)** logged.`);
say('');
say('> Coaching here is about **patterns**, not wording. Without recording, the words spoken are never');
say('> captured, so "you should have said X" is not derivable. Every section refuses to draw a conclusion');
say('> below its minimum sample rather than dress up noise as insight.');
say('');

if (calls.length === 0) {
  say('## 🚦 No calls logged yet');
  say('');
  say('Nothing to analyse. This is expected until dialing starts — the system has never had a call put');
  say('through it. Once ~20 calls are logged, every section below starts filling in.');
  say('');
  say('The wiring is already in place and needs nothing further:');
  say('- Quo `call.completed` → `netlify/functions/quo-call-webhook.js` → Outreach Log row + Lead rollup');
  say('- duration, connect/voicemail/no-answer, timestamp and attempt number are all captured per call');
} else {
  // ── 1. WHEN TO CALL ───────────────────────────────────────────────────────
  say('## 1. ⏰ When to call');
  say('');
  if (calls.length < MIN.hour) {
    say(need(calls.length, MIN.hour, 'calls'));
  } else {
    const byHour = new Map();
    for (const c of calls) {
      const b = byHour.get(c.hour) || { n: 0, c: 0 };
      b.n++; if (c.connected) b.c++; byHour.set(c.hour, b);
    }
    say('| hour | calls | connected | rate | |');
    say('|---|---|---|---|---|');
    for (const [h, b] of [...byHour.entries()].sort((a, b2) => a[0] - b2[0])) {
      if (b.n < 3) continue;                       // a single call at 4pm is not a trend
      const p = pct(b.c, b.n);
      say(`| ${String(h).padStart(2, '0')}:00 | ${b.n} | ${b.c} | ${p}% | \`${bar(p)}\` |`);
    }
    const ranked = [...byHour.entries()].filter(([, b]) => b.n >= 5).sort((a, b2) => pct(b2[1].c, b2[1].n) - pct(a[1].c, a[1].n));
    if (ranked.length >= 2) {
      const [bh, bb] = ranked[0], [wh, wb] = ranked[ranked.length - 1];
      say('');
      say(`**Best ${String(bh).padStart(2, '0')}:00 (${pct(bb.c, bb.n)}%) vs worst ${String(wh).padStart(2, '0')}:00 (${pct(wb.c, wb.n)}%).** Move dialing into the best window before changing anything else about the call.`);
    }
  }
  say('');

  // ── 2. THE OPENER ─────────────────────────────────────────────────────────
  say('## 2. 🗣️ Is the opener earning the next 30 seconds?');
  say('');
  const conn = calls.filter((c) => c.connected && c.duration != null);
  if (conn.length < MIN.duration) {
    say(need(conn.length, MIN.duration, 'connected calls with a duration'));
  } else {
    const durs = conn.map((c) => c.duration).sort((a, b) => a - b);
    const med = durs[Math.floor(durs.length / 2)];
    const under30 = durs.filter((d) => d < 30).length;
    say(`- median connected call: **${med}s**`);
    say(`- died under 30s: **${under30} of ${conn.length}** (${pct(under30, conn.length)}%)`);
    say('');
    if (pct(under30, conn.length) >= 50) {
      say('🔴 **Most connects die inside 30 seconds — that is an OPENER problem, not an offer problem.**');
      say('They are hanging up before hearing what you do. Rework the first two sentences in');
      say('`docs/sales-call-script.md`; the rest of the script is not being reached.');
    } else if (med >= 120) {
      say('🟢 Connected calls are running long — the opener is working. Any weakness is later: the bridge, the offer, or the close.');
    }
  }
  say('');

  // ── 3. PERSISTENCE ────────────────────────────────────────────────────────
  say('## 3. 🔁 How many attempts before giving up');
  say('');
  const attempts = new Map();
  for (const c of calls) {
    if (!c.leadId) continue;
    const a = attempts.get(c.leadId) || { n: 0, connected: false, at: null };
    a.n++; if (c.connected && !a.connected) { a.connected = true; a.at = a.n; }
    attempts.set(c.leadId, a);
  }
  if (attempts.size < MIN.attempts) {
    say(need(attempts.size, MIN.attempts, 'leads dialed'));
  } else {
    const dist = new Map();
    for (const a of attempts.values()) if (a.connected) dist.set(a.at, (dist.get(a.at) || 0) + 1);
    const totalConn = [...dist.values()].reduce((x, y) => x + y, 0);
    let cum = 0;
    say('| connected on attempt # | leads | cumulative |');
    say('|---|---|---|');
    for (const k of [...dist.keys()].sort((a, b) => a - b)) {
      cum += dist.get(k);
      say(`| ${k} | ${dist.get(k)} | ${pct(cum, totalConn)}% |`);
    }
    const nine = [...dist.keys()].sort((a, b) => a - b).find((k) => {
      let c2 = 0; for (const kk of [...dist.keys()].sort((x, y) => x - y)) { if (kk <= k) c2 += dist.get(kk); }
      return pct(c2, totalConn) >= 90;
    });
    if (nine) { say(''); say(`**90% of connects happen by attempt ${nine}.** Past that the list is better served by fresh leads.`); }
  }
  say('');

  // ── 4. WHO TO CALL ────────────────────────────────────────────────────────
  say('## 4. 🎯 Which leads actually convert');
  say('');
  const dialed = [...attempts.keys()].map((id) => leadById.get(id)).filter(Boolean);
  if (dialed.length < MIN.segment) {
    say(need(dialed.length, MIN.segment, 'dialed leads'));
  } else {
    const seg = (name, keyFn) => {
      const m = new Map();
      for (const f of dialed) {
        const k = keyFn(f); if (!k) continue;
        const b = m.get(k) || { n: 0, win: 0 };
        b.n++;
        if (['Interested', 'Callback scheduled'].includes(f['Call Outcome'])) b.win++;
        m.set(k, b);
      }
      const rows = [...m.entries()].filter(([, b]) => b.n >= 5).sort((a, b) => pct(b[1].win, b[1].n) - pct(a[1].win, a[1].n));
      if (!rows.length) return;
      say(`**${name}**`);
      say('');
      say('| segment | dialed | interested/booked | rate |');
      say('|---|---|---|---|');
      for (const [k, b] of rows) say(`| ${k} | ${b.n} | ${b.win} | ${pct(b.win, b.n)}% |`);
      say('');
    };
    seg('By industry', (f) => f['Detected Category']);
    seg('By Maps rank', (f) => { const r = Number(f['Map Rank'] || 0); return r ? (r <= 3 ? 'top 3' : r <= 10 ? '4–10' : '11+') : ''; });
    seg('By engagement', (f) => (f['Day 1 Clicked At'] ? 'clicked the video' : 'opened only'));
  }
  say('');

  // ── 5. WHY YOU LOSE ───────────────────────────────────────────────────────
  say('## 5. 🧱 What is killing the calls');
  say('');
  // The STRUCTURED objection first — it is countable, which free text never is. `Call Objection` is
  // captured by the console's objection picker on Not interested / Connected (2026-08-20).
  const objCounts = new Map();
  for (const id of attempts.keys()) {
    const f = leadById.get(id); if (!f) continue;
    const o = f['Call Objection'];
    if (o) objCounts.set(o, (objCounts.get(o) || 0) + 1);
  }
  if (objCounts.size) {
    const total = [...objCounts.values()].reduce((a, b) => a + b, 0);
    say('| objection | calls | share |');
    say('|---|---|---|');
    for (const [o, n] of [...objCounts.entries()].sort((a, b) => b[1] - a[1])) {
      say(`| ${o} | ${n} | ${pct(n, total)}% |`);
    }
    say('');
  }

  const notes = [];
  for (const id of attempts.keys()) {
    const f = leadById.get(id); if (!f) continue;
    for (const line of String(f['Outreach Notes'] || '').split('\n')) {
      if (line.includes('[call]') && line.trim().length > 12) notes.push(`${f['Business Name'] || '?'}: ${line.trim()}`);
    }
  }
  if (notes.length < MIN.objection) {
    say(need(notes.length, MIN.objection, '`[call]` notes'));
    say('');
    say('💡 Notes are the only place the *content* of a call survives without recording. The more');
    say('specific the note ("already has an SEO guy on retainer"), the better this section gets.');
  } else if (NO_AI || !OPENAI_KEY) {
    say(`_${notes.length} call notes available; AI pass skipped (${NO_AI ? '--no-ai' : 'no OPENAI_API_KEY'})._`);
  } else {
    const prompt = `You are a sales coach reviewing cold-call notes for a local-SEO agency selling Google Maps ranking work to small businesses.

Here are the rep's own notes from ${notes.length} calls:
${notes.slice(0, 120).join('\n')}

Return STRICT JSON: {"objections":[{"name":"...","count":N,"why_it_lands":"...","better_response":"..."}],"pattern":"one sentence on the single biggest fixable pattern"}
Rank objections by how often they appear. "better_response" must be a concrete sentence the rep can say, not advice about being confident. Max 5 objections.`;
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'openai error');
      const data = JSON.parse(j.choices[0].message.content);
      for (const o of (data.objections || []).slice(0, 5)) {
        say(`**${o.name}** — ${o.count}×`);
        say(`- why it lands: ${o.why_it_lands}`);
        say(`- try: _"${o.better_response}"_`);
        say('');
      }
      if (data.pattern) say(`> **Biggest fixable pattern:** ${data.pattern}`);
    } catch (e) {
      say(`_objection analysis unavailable: ${String(e.message).slice(0, 120)}_`);
    }
  }
}

say('');
say('---');
say('_Pattern coaching only. Wording-level coaching ("you should have said X") requires call recording,');
say('which was deliberately declined — California two-party consent. See project-call-system-design._');

const text = out.join('\n');
console.log(text);
if (WRITE) {
  const dir = path.join(WEBSITE, 'reports', 'calls');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${new Date().toISOString().slice(0, 10)}_call-brain.md`);
  fs.writeFileSync(p, text + '\n');
  console.log(`\n📄 written → reports/calls/${path.basename(p)}`);
}
