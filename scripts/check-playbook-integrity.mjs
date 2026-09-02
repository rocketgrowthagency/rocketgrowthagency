#!/usr/bin/env node
/**
 * check-playbook-integrity.mjs — the sales playbook is a live call tool; a broken one is invisible.
 *
 * ─── WHY (2026-09-02) ──────────────────────────────────────────────────────────────────────────
 * `admin/playbook.js` is pure DATA read by a dumb renderer. That makes it easy to extend and easy to
 * break silently: an unsupported block kind renders as NOTHING, a ragged table row drops a cell, and
 * a duplicate tab id shadows a whole tab. None of it throws. A rep mid-call just sees a gap where the
 * answer should be — and nobody finds out until a deal is lost.
 *
 * It also enforces the rules Chris has locked that a future edit would otherwise quietly undo:
 *   - the cache-buster must be bumped when playbook.js changes, or browsers serve the OLD file
 *   - the openers must never be "improved" into apologising ones (Gong: 0.9% vs 1.5% baseline)
 *   - no instruction may depend on call RECORDINGS — CA is two-party consent, we never record
 *   - prices must match the single source of truth, never be retyped from memory
 *
 * Usage:  node scripts/check-playbook-integrity.mjs [--json]
 * Exit 0 = sound · 1 = a defect · 2 = could not read the playbook (never reported as healthy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const SCRAPER_ENV = path.dirname(path.dirname(fileURLToPath(import.meta.url)));  // NOT .pathname — spaces arrive %20-encoded and the .env is never found
const PB_PATH = path.join(WEBSITE, 'admin/playbook.js');
const HTML_PATH = path.join(WEBSITE, 'admin/index.html');
const JSON_OUT = process.argv.includes('--json');

let src, html;
try { src = fs.readFileSync(PB_PATH, 'utf8'); html = fs.readFileSync(HTML_PATH, 'utf8'); }
catch (e) { console.error(`✗ cannot read the playbook (${e.message}) — indeterminate, not healthy.`); process.exit(2); }

const m = src.match(/const PB = \[[\s\S]*?\n {2}\];/);
if (!m) { console.error('✗ could not locate the PB data array — refusing to report healthy.'); process.exit(2); }

let PB;
try {
  PB = eval('(function(){const SAY=t=>({k:"say",t}),DONT=t=>({k:"dont",t}),WHY=t=>({k:"why",t}),'
    + 'NOTE=t=>({k:"note",t}),BRANCH=i=>({k:"branch",items:i});' + m[0] + 'return PB;})()');
} catch (e) { console.error(`✗ PB array does not evaluate (${e.message}) — the playbook is BROKEN.`); process.exit(1); }
if (!Array.isArray(PB) || PB.length < 8) { console.error(`✗ PB has ${PB?.length} tabs — implausibly few, refusing to pass.`); process.exit(2); }

const KINDS = new Set(['h', 'say', 'dont', 'why', 'note', 'kpi', 'branch', 'table', 'obj']);
const bad = [];
const add = (t, d) => bad.push({ type: t, detail: d });

// ---- structural integrity ----
const ids = new Set();
for (const s of PB) {
  if (!s.id || !s.tab || !s.title) add('tab-missing-fields', JSON.stringify(s.id || s.tab || '?'));
  if (ids.has(s.id)) add('duplicate-tab-id', s.id);
  ids.add(s.id);
  if (!s.guided && !(s.blocks || []).length) add('empty-tab', s.tab);

  const walk = (blocks, where) => {
    for (const b of blocks) {
      if (!KINDS.has(b.k)) { add('unsupported-block-kind', `${where}: "${b.k}" renders as NOTHING`); continue; }
      if (b.k === 'h' && typeof b.n !== 'number') add('heading-without-number', where);
      if (b.k === 'table') {
        if (!Array.isArray(b.head) || !Array.isArray(b.rows)) add('malformed-table', where);
        else for (const r of b.rows) if (r.length !== b.head.length) add('ragged-table-row', `${where}: ${r.length} cells vs ${b.head.length} headers`);
      }
      if (b.k === 'branch' && (!Array.isArray(b.items) || b.items.some((i) => i.length !== 2))) add('malformed-branch', where);
      if (b.k === 'kpi' && (!Array.isArray(b.items) || b.items.some((i) => i.length !== 2))) add('malformed-kpi', where);
      if (b.k === 'obj') { if (!b.q || !Array.isArray(b.a) || !b.a.length) add('empty-objection', where); else walk(b.a, `${where} › ${String(b.q).slice(0, 40)}`); }
    }
  };
  walk(s.blocks || [], s.tab);
}

// ---- the locked rules ----
const allText = JSON.stringify(PB);

// 1. Cache-buster. If playbook.js changed more recently than index.html, the ?v= was not bumped.
const vMatch = html.match(/\/admin\/playbook\.js\?v=([A-Za-z0-9]+)/);
if (!vMatch) add('no-cache-buster', 'playbook.js is loaded without ?v= — browsers will serve a stale copy');
else {
  try {
    const pbT = fs.statSync(PB_PATH).mtimeMs, htT = fs.statSync(HTML_PATH).mtimeMs;
    if (pbT > htT + 60000) add('stale-cache-buster', `playbook.js is newer than index.html (?v=${vMatch[1]}) — bump it or browsers serve the OLD playbook`);
  } catch {}
}

// 2. The apologising opener. Gong: 0.9% vs a 1.5% baseline. It may appear ONLY as a warning.
for (const s of PB) {
  for (const b of s.blocks || []) {
    if (b.k !== 'say') continue;
    if (/did i catch you at a bad time|is (?:now|this) a bad time|sorry to bother/i.test(b.t || '')) {
      add('apologising-opener-as-script', `${s.tab}: "${String(b.t).slice(0, 60)}…" — worst measured opener, must never be a SAY`);
    }
  }
}

// 3. Nothing may instruct anyone to use call recordings — we never record (CA two-party consent).
if (/listen to \d+ recorded|recorded calls|call recording|review the recording/i.test(allText)) {
  add('depends-on-recordings', 'an instruction references call recordings — we do NOT record (CA two-party consent), so the step is impossible');
}

// 4. Prices must match the single source of truth.
let prices = null;
try { prices = JSON.parse(fs.readFileSync(path.join(WEBSITE, 'data/offer-pricing.json'), 'utf8')); } catch {}
if (prices) {
  const flat = JSON.stringify(prices);
  const quoted = [...allText.matchAll(/\$([0-9],?[0-9]{3})\b/g)].map((x) => x[1].replace(',', ''));
  const known = new Set([...flat.matchAll(/([0-9]{3,5})/g)].map((x) => x[1]));
  const unknown = [...new Set(quoted)].filter((q) => !known.has(q) && !known.has(String(+q)));
  if (unknown.length) add('price-not-in-source-of-truth', `playbook quotes $${unknown.join(', $')} — not present in data/offer-pricing.json`);
} else {
  add('pricing-source-unreadable', 'data/offer-pricing.json could not be read — cannot verify quoted prices');
}

// ---- the GUIDED CALL decision tree ----
// A dead end mid-call is worse than no tree at all: the rep is left staring at a button that does
// nothing while a prospect is talking. The in-page checkFlow() only logs to the console, which
// nobody is reading during a live call — so it is checked here, where it can fail a deploy.
const fm = src.match(/const FLOW = \{[\s\S]*?\n {2}\};/);
if (!fm) add('flow-missing', 'the guided-call FLOW tree could not be located');
else {
  let FLOW;
  try {
    FLOW = eval('(function(){const SAY=t=>({k:"say",t}),DONT=t=>({k:"dont",t}),WHY=t=>({k:"why",t}),'
      + 'NOTE=t=>({k:"note",t}),BRANCH=i=>({k:"branch",items:i});' + fm[0] + 'return FLOW;})()');
  } catch (e) { add('flow-broken', `FLOW does not evaluate: ${e.message}`); }

  if (FLOW) {
    const nodes = Object.keys(FLOW);
    if (!FLOW.start) add('flow-no-start', 'FLOW has no `start` node');
    for (const [id, n] of Object.entries(FLOW)) {
      for (const [label, to] of n.o || []) {
        if (!FLOW[to]) add('flow-dead-link', `${id} → "${to}" (from "${String(label).slice(0, 30)}") does not exist`);
      }
      if (!(n.o || []).length && !n.out) add('flow-dead-end', `${id} has no options and no outcome`);
      if (!n.t) add('flow-untitled', id);
    }
    // Every node must be reachable from start, or it is dead weight nobody can ever see.
    const seen = new Set(['start']); const queue = ['start'];
    while (queue.length) {
      const cur = FLOW[queue.shift()]; if (!cur) continue;
      for (const [, to] of cur.o || []) if (FLOW[to] && !seen.has(to)) { seen.add(to); queue.push(to); }
    }
    const orphans = nodes.filter((n) => !seen.has(n));
    if (orphans.length) add('flow-unreachable-node', `${orphans.join(', ')} — cannot be reached from start`);

    // The guided tree is the LIVE path. If the reference spine gained beats, the tree must have them
    // too, or a rep following the buttons silently gets the old call.
    for (const [node, why] of [['dig', 'problem depth (duration + cause)'], ['tried', 'solution awareness'],
                               ['cost', 'consequence'], ['want', 'the commitment question']]) {
      if (!FLOW[node]) add('flow-missing-beat', `no "${node}" node — ${why} is in the reference tabs but NOT in the live guided call`);
    }
  }
}

// ---- script sources that can drift apart ----
// The call card renders its own opener/voicemail rather than reading the playbook (deliberate: the
// Calls tab is self-contained so it can lift into /sales/ later). That makes drift possible, so the
// INVARIANTS are asserted here rather than the exact wording.
try {
  const calls = fs.readFileSync(path.join(WEBSITE, 'admin/calls.js'), 'utf8');
  const fn = calls.match(/function opener\(lead\)[\s\S]*?\n}/);
  if (!fn) add('calls-opener-missing', 'admin/calls.js has no opener() — the call card would show no script');
  else {
    if (/bad time|sorry to bother|is now a good time/i.test(fn[0])) add('calls-opener-apologises', 'the call-card opener apologises — worst measured opener');
    if (!/video/i.test(fn[0])) add('calls-opener-lost-the-video', 'the call-card opener no longer mentions the video — that is our entire reason for calling');
  }
  const vm = calls.match(/function voicemail\(lead\)[\s\S]*?\n}/);
  if (vm && !/424-242-2040/.test(vm[0])) add('voicemail-missing-number', 'the voicemail script no longer says the callback number');
} catch { add('calls-unreadable', 'admin/calls.js could not be read'); }

// ---- Airtable consistency: the console, the server, and the guided tree must agree ----
// The console writes Call Outcome / Call Objection into Airtable singleSelects. A value that is not
// an allowed option is REJECTED by Airtable — so a rep taps the button, sees no error, and the call
// is never logged. Silent data loss, and the call brain is blind to it.
try {
  const fnSrc = fs.readFileSync(path.join(WEBSITE, 'netlify/functions/sales-call-queue.js'), 'utf8');
  const calls = fs.readFileSync(path.join(WEBSITE, 'admin/calls.js'), 'utf8');
  const arr = (s, name) => { const m = s.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`)); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null; };

  const outcomes = arr(fnSrc, 'VALID_OUTCOMES');
  const objServer = arr(fnSrc, 'VALID_OBJECTIONS');
  const objClient = arr(calls, 'OBJECTIONS');

  if (!outcomes) add('outcomes-unreadable', 'VALID_OUTCOMES not found in sales-call-queue.js');
  if (!objServer || !objClient) add('objections-unreadable', 'objection list not found in one of the two files');
  else if (JSON.stringify(objServer) !== JSON.stringify(objClient)) {
    const only = (a, b) => a.filter((x) => !b.includes(x));
    add('objection-list-drift', `client vs server differ — client-only: [${only(objClient, objServer)}] server-only: [${only(objServer, objClient)}]. A client-only value is REJECTED by Airtable and the call logs nothing.`);
  }

  // Every guided-tree terminal names an outcome in prose; its leading phrase must be a real option.
  if (outcomes && fm) {
    for (const mm of src.matchAll(/out: "([^"]+)"/g)) {
      const prose = mm[1].replace(/\\u2014/g, '—');
      if (!outcomes.some((o) => prose.startsWith(o))) {
        add('guided-outcome-not-in-airtable', `"${prose.slice(0, 46)}…" does not start with a valid Call Outcome (${outcomes.join(' / ')})`);
      }
    }
  }
} catch (e) { add('airtable-consistency-unreadable', String(e.message).slice(0, 90)); }

// ---- every admin module's cache-buster must be newer than the file it loads ----
// 🔴 2026-09-02 — calls.js is imported with `?v=` from TWO places in admin.js. Bumping one and not
// the other ships a browser the OLD module from whichever import wins, with no error anywhere. The
// same trap as the playbook's ?v=, but worse, because the version lives in a DIFFERENT file from the
// tag and there is more than one of it.
for (const [file, loadedIn] of [['admin/calls.js', 'admin/admin.js'], ['admin/admin.js', 'admin/index.html'], ['admin/playbook.js', 'admin/index.html']]) {
  try {
    const base = file.split('/').pop();
    const holder = fs.readFileSync(path.join(WEBSITE, loadedIn), 'utf8');
    const refs = [...holder.matchAll(new RegExp(`${base.replace('.', '\\.')}\\?v=([A-Za-z0-9]+)`, 'g'))].map((x) => x[1]);
    if (!refs.length) { add('module-not-versioned', `${file} is loaded from ${loadedIn} with no ?v= — browsers will cache it forever`); continue; }
    const uniq = [...new Set(refs)];
    if (uniq.length > 1) {
      add('module-version-mismatch', `${file} is imported ${refs.length}× from ${loadedIn} with DIFFERENT versions (${uniq.join(', ')}) — one of them serves a stale module`);
    }
    const fT = fs.statSync(path.join(WEBSITE, file)).mtimeMs;
    const hT = fs.statSync(path.join(WEBSITE, loadedIn)).mtimeMs;
    if (fT > hT + 60000) add('module-cache-buster-stale', `${file} is newer than ${loadedIn} (?v=${uniq[0]}) — bump it or browsers serve the OLD module`);
  } catch (e) { add('module-version-uncheckable', `${file}: ${String(e.message).slice(0, 60)}`); }
}

// ---- the ACTUAL Airtable field options (the only authority that can reject a write) ----
// The two code lists agreeing with EACH OTHER proves nothing — they can both be wrong together.
// Airtable's own field config is the contract. Read it and assert against it.
let fieldCheck = 'skipped';
try {
  const dotenv = await import('dotenv').catch(() => null);
  if (dotenv) dotenv.config({ path: path.join(SCRAPER_ENV, '.env') });
  const KEY = process.env.AIRTABLE_API_KEY, BASE = process.env.AIRTABLE_BASE_ID;
  const TABLE = process.env.AIRTABLE_TABLE_NAME;

  if (!KEY || !BASE) {
    fieldCheck = 'NO CREDS — the live field options were NOT verified';
  } else {
    const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) fieldCheck = `Airtable meta API ${r.status} — options NOT verified`;
    else {
      const d = await r.json();
      const tbl = (d.tables || []).find((t) => t.name === TABLE) || (d.tables || []).find((t) => t.name === 'Leads');
      if (!tbl) fieldCheck = 'Leads table not found in the base — options NOT verified';
      else {
        const opts = (name) => {
          const f = (tbl.fields || []).find((x) => x.name === name);
          return f?.options?.choices ? f.options.choices.map((c) => c.name) : null;
        };
        const fnSrc2 = fs.readFileSync(path.join(WEBSITE, 'netlify/functions/sales-call-queue.js'), 'utf8');
        const listOf = (s, n) => { const m = s.match(new RegExp(`const ${n} = \\[([\\s\\S]*?)\\];`)); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []; };

        for (const [field, constName] of [['Call Outcome', 'VALID_OUTCOMES'], ['Call Objection', 'VALID_OBJECTIONS']]) {
          const live = opts(field);
          if (!live) { add('airtable-field-missing', `"${field}" is not a select on the Leads table — every write to it is rejected`); continue; }
          const code = listOf(fnSrc2, constName);
          const notInAirtable = code.filter((v) => !live.includes(v));
          if (notInAirtable.length) {
            add('value-airtable-will-reject', `${constName} contains ${JSON.stringify(notInAirtable)} — NOT options on "${field}". Airtable rejects these and the call logs NOTHING, with no error shown to the rep.`);
          }
        }
        fieldCheck = 'verified against the live Airtable field options';
      }
    }
  }
} catch (e) { fieldCheck = `could not verify (${String(e.message).slice(0, 50)})`; }

// ---- no forked copy of the playbook may drift unmarked ----
try {
  const mock = path.join(WEBSITE, 'mockup-sales-playbook.html');
  if (fs.existsSync(mock)) {
    const h = fs.readFileSync(mock, 'utf8');
    if (!/SUPERSEDED|superseded/.test(h)) {
      add('unmarked-playbook-fork', 'mockup-sales-playbook.html is a second copy of the playbook and is NOT marked superseded — it will drift and someone will train from it');
    }
  }
} catch {}

// ---- report ----
const stats = { tabs: PB.length, blocks: PB.reduce((a, s) => a + (s.blocks || []).length, 0) };
if (JSON_OUT) { console.log(JSON.stringify({ ...stats, defects: bad }, null, 2)); process.exit(bad.length ? 1 : 0); }

console.log('\n===== SALES PLAYBOOK INTEGRITY =====');
console.log(`  tabs    ${stats.tabs}`);
console.log(`  blocks  ${stats.blocks}`);
console.log(`  ${PB.map((s) => s.tab).join(' · ')}`);
console.log(`  airtable  ${fieldCheck}`);

if (!bad.length) { console.log('\n✅ structure sound · locked rules held · prices match the single source.'); process.exit(0); }

console.error(`\n✗ ${bad.length} defect(s):`);
for (const d of bad) console.error(`     ${d.type.padEnd(28)} ${d.detail}`);
console.error('\n   A broken playbook block renders as NOTHING — a rep mid-call just sees a gap.');
process.exit(1);
