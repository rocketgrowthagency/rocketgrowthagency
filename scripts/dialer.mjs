#!/usr/bin/env node
/**
 * dialer.mjs — the RGA call console. A local "call-center" workspace over the Airtable queue.
 *
 * WHY: Quo's API can READ calls but cannot PLACE them, so a true auto-dialer isn't possible on their
 * platform. This gets ~90% of the way there: the queue is ordered for you, every lead arrives with the
 * context you need mid-call, dialing is one click (tel: → Quo), logging the outcome is one click, and it
 * auto-advances. No hunting through Airtable, no forgetting to log.
 *
 * QUEUE ORDER (highest intent first):
 *   1. CALLBACKS DUE  — they asked you to call back (Next Action Date <= today). Never let one slip.
 *   2. WARM           — clicked through to their video, never replied. Sorted most-recent click first.
 *
 * DIVISION OF LABOUR WITH THE WEBHOOK (important — do not duplicate):
 *   `netlify/functions/quo-call-webhook.js` owns the Outreach Log row + Call Count + Last Call At on
 *   call.completed (mechanical outcome: Connected / No answer / Left voicemail). This console only writes
 *   the REP's judgement — Call Outcome, Next Action Date, and a dated note. If it also wrote Outreach Log
 *   rows, every call would be double-counted in the digest's call metrics.
 *
 * Usage:  node scripts/dialer.mjs          → http://localhost:4321
 *         PORT=5000 node scripts/dialer.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const KEY = env.AIRTABLE_API_KEY;
const BASE = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const TABLE = 'Leads';
const PORT = Number(process.env.PORT || 4321);
const AT = (p = '') => `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}${p}`;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
// Pacific, not UTC (see sales-call-queue.js) — RGA operates on PT.
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function fetchAll(formula) {
  const out = []; let off = null;
  do {
    const u = new URL(AT());
    u.searchParams.set('pageSize', '100');
    if (formula) u.searchParams.set('filterByFormula', formula);
    if (off) u.searchParams.set('offset', off);
    const r = await fetch(u, { headers: H });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    out.push(...(d.records || [])); off = d.offset;
  } while (off);
  return out;
}

const CLOSED_FUNNEL = ['closed_not_interested', 'closed_dnc', 'closed_bounced', 'converted_to_client'];
/** A lead is callable if nothing has closed it and it hasn't already replied. */
function callable(f) {
  if (!f) return false;
  if (f.Replied || f['Reply Date']) return false;
  if (f.Status === 'dead' || f.Suppressed) return false;
  if (String(f['Email Status'] || '').match(/bounce|invalid|blocked|unsubscribed/)) return false;
  if (CLOSED_FUNNEL.includes(f['Funnel State'])) return false;
  if (!(f.Phone || f['Business Phone'])) return false;          // nothing to dial
  return true;
}

function shape(r, reason) {
  const f = r.fields || {};
  return {
    id: r.id,
    reason,                                    // 'callback' | 'warm'
    business: f['Business Name'] || '(unknown)',
    phone: f.Phone || f['Business Phone'] || '',
    city: f.City || '',
    rank: f['Map Rank'] ?? '',
    searchTerm: f['Search Term'] || '',
    videoUrl: f['Video URL'] || '',
    website: f['Website URL'] || f.Website || '',
    email: f.Email || '',
    auditSummary: f['Audit Summary'] || '',
    clicked: String(f['Day 1 Clicked At'] || '').slice(0, 10),
    due: String(f['Next Action Date'] || '').slice(0, 10),
    lastOutcome: f['Call Outcome'] || '',
    callCount: Number(f['Call Count'] || 0),
  };
}

async function buildQueue() {
  const all = await fetchAll('');
  const callbacks = [], warm = [];
  for (const r of all) {
    const f = r.fields || {};
    if (!callable(f)) continue;
    const due = typeof f['Next Action Date'] === 'string' ? f['Next Action Date'].slice(0, 10) : '';
    if (due && due <= today()) { callbacks.push(shape(r, 'callback')); continue; }
    if (typeof f['Day 1 Clicked At'] === 'string' && f['Day 1 Clicked At']) warm.push(shape(r, 'warm'));
  }
  callbacks.sort((a, b) => a.due.localeCompare(b.due));           // most overdue first
  warm.sort((a, b) => b.clicked.localeCompare(a.clicked));        // freshest intent first
  return [...callbacks, ...warm];
}

/** Write the REP's judgement to the lead. The webhook owns the Outreach Log row + call counters. */
async function logOutcome({ id, outcome, nextActionDate, note }) {
  const cur = await (await fetch(AT(`/${id}`), { headers: H })).json();
  const prevNotes = String(cur.fields?.['Outreach Notes'] || '');
  const line = `[${today()}] [call] ${outcome}${nextActionDate ? ` — callback ${nextActionDate}` : ''}${note ? `: ${note}` : ''}`;
  const fields = {
    'Call Outcome': outcome,
    'Outreach Notes': [prevNotes, line].filter(Boolean).join('\n').slice(0, 95000),
  };
  if (nextActionDate) fields['Next Action Date'] = nextActionDate;
  const r = await fetch(AT(`/${id}`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields, typecast: true }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { ok: true };
}

// ── the console ──────────────────────────────────────────────────────────────
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>RGA Call Console</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box} body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f8fc;color:#0f172a}
.wrap{max-width:940px;margin:0 auto;padding:20px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.top h1{font-size:18px;margin:0;color:#2457e6}
.prog{font-size:13px;color:#64748b}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:22px;box-shadow:0 6px 20px rgba(15,23,42,.06)}
.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 9px;border-radius:999px;margin-bottom:10px}
.tag.callback{background:#fee2e2;color:#991b1b} .tag.warm{background:#dbeafe;color:#1e40af}
h2{margin:0 0 4px;font-size:26px} .meta{color:#64748b;font-size:14px;margin-bottom:16px}
.dial{display:inline-block;background:#2457e6;color:#fff;text-decoration:none;font-size:22px;font-weight:700;padding:14px 26px;border-radius:10px;margin:4px 0 14px}
.links a{color:#2457e6;margin-right:14px;font-size:14px}
.sec{margin-top:18px;padding-top:14px;border-top:1px solid #eef2f7}
.sec h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 8px}
.script{background:#f8fafc;border-left:3px solid #2457e6;padding:12px 14px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.5}
.audit{font-size:13px;color:#475569;white-space:pre-wrap;line-height:1.5;max-height:150px;overflow:auto}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
button{font:inherit;font-size:14px;font-weight:600;padding:11px 15px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
button:hover{border-color:#2457e6;color:#2457e6}
button.good{background:#16a34a;color:#fff;border-color:#16a34a} button.warn{background:#f59e0b;color:#fff;border-color:#f59e0b}
button.bad{background:#ef4444;color:#fff;border-color:#ef4444} button.ghost{color:#64748b}
.skip{margin-top:14px} .empty{text-align:center;padding:60px 20px;color:#64748b}
#note{width:100%;margin-top:10px;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:14px}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:9px;font-size:14px;opacity:0;transition:.2s}
.toast.on{opacity:1}
</style></head><body><div class="wrap">
<div class="top"><h1>RGA Call Console</h1><div class="prog" id="prog"></div></div>
<div id="app"></div></div><div class="toast" id="toast"></div>
<script>
let Q=[],i=0;
const $=s=>document.querySelector(s);
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),1800)};
async function load(){Q=await(await fetch('/api/queue')).json();i=0;render()}
function render(){
  $('#prog').textContent = Q.length? \`\${i+1} of \${Q.length}\` : '';
  const l=Q[i];
  if(!l){$('#app').innerHTML='<div class="card empty"><h2>Queue clear</h2><p>No callbacks due and no un-called warm leads.</p></div>';return}
  const tel=String(l.phone).replace(/[^0-9+]/g,'');
  const opener = l.reason==='callback'
    ? \`"Hi, it's Chris from Rocket Growth Agency — you asked me to give you a call back."\`
    : \`"Hi, is this \${l.business}? It's Chris from Rocket Growth Agency — I sent over a short video showing where you're ranking on Google Maps. Did you get a chance to look at it?"\`;
  $('#app').innerHTML=\`<div class="card">
    <span class="tag \${l.reason}">\${l.reason==='callback'?'Callback due '+l.due:'Warm — clicked '+l.clicked}</span>
    <h2>\${l.business}</h2>
    <div class="meta">\${[l.city, l.rank!==''?'Map rank #'+l.rank:'', l.searchTerm?'"'+l.searchTerm+'"':''].filter(Boolean).join(' · ')}
      \${l.callCount?' · '+l.callCount+' prior call(s)':''}\${l.lastOutcome?' · last: '+l.lastOutcome:''}</div>
    <a class="dial" href="tel:\${tel}">Call \${l.phone}</a>
    <div class="links">\${l.videoUrl?\`<a href="\${l.videoUrl}" target="_blank">Their video</a>\`:''}\${l.website?\`<a href="\${l.website}" target="_blank">Website</a>\`:''}\${l.email?\`<a href="mailto:\${l.email}">\${l.email}</a>\`:''}</div>
    <div class="sec"><h3>Opener</h3><div class="script">\${opener}</div></div>
    \${l.auditSummary?\`<div class="sec"><h3>Audit findings (what they heard)</h3><div class="audit">\${l.auditSummary}</div></div>\`:''}
    <div class="sec"><h3>Log outcome</h3>
      <input id="note" placeholder="Optional note (what they said)">
      <div class="btns">
        <button class="good" onclick="log('Interested')">Interested</button>
        <button class="good" onclick="cb()">Callback scheduled</button>
        <button onclick="log('Connected')">Connected</button>
        <button class="warn" onclick="log('Left voicemail')">Left voicemail</button>
        <button onclick="log('No answer')">No answer</button>
        <button class="bad" onclick="log('Not interested')">Not interested</button>
        <button class="bad" onclick="log('Wrong number')">Wrong number</button>
        <button class="bad" onclick="log('Do not call')">Do not call</button>
      </div>
      <div class="skip"><button class="ghost" onclick="next()">Skip for now</button></div>
    </div></div>\`;
}
function next(){i++;render();window.scrollTo(0,0)}
async function log(outcome,nextActionDate){
  const l=Q[i];
  const r=await fetch('/api/outcome',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:l.id,outcome,nextActionDate,note:$('#note')?.value||''})});
  if(r.ok){toast(outcome+' logged');next()} else {toast('FAILED to log — check terminal')}
}
function cb(){const d=prompt('Callback date (YYYY-MM-DD):',new Date(Date.now()+864e5).toISOString().slice(0,10));if(d)log('Callback scheduled',d)}
load();
</script></body></html>`;

http.createServer(async (req, res) => {
  try {
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE);
    }
    if (req.url === '/api/queue') {
      const q = await buildQueue();
      console.log(`[dialer] queue: ${q.length} (${q.filter((x) => x.reason === 'callback').length} callbacks due)`);
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(q));
    }
    if (req.url === '/api/outcome' && req.method === 'POST') {
      let body = ''; for await (const c of req) body += c;
      const p = JSON.parse(body || '{}');
      await logOutcome(p);
      console.log(`[dialer] ${p.outcome} → ${p.id}${p.nextActionDate ? ' (callback ' + p.nextActionDate + ')' : ''}`);
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error('[dialer] ' + e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message }));
  }
}).listen(PORT, () => console.log(`\n  RGA Call Console → http://localhost:${PORT}\n  (Ctrl+C to stop)\n`));
