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

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
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

// ---- report ----
const stats = { tabs: PB.length, blocks: PB.reduce((a, s) => a + (s.blocks || []).length, 0) };
if (JSON_OUT) { console.log(JSON.stringify({ ...stats, defects: bad }, null, 2)); process.exit(bad.length ? 1 : 0); }

console.log('\n===== SALES PLAYBOOK INTEGRITY =====');
console.log(`  tabs    ${stats.tabs}`);
console.log(`  blocks  ${stats.blocks}`);
console.log(`  ${PB.map((s) => s.tab).join(' · ')}`);

if (!bad.length) { console.log('\n✅ structure sound · locked rules held · prices match the single source.'); process.exit(0); }

console.error(`\n✗ ${bad.length} defect(s):`);
for (const d of bad) console.error(`     ${d.type.padEnd(28)} ${d.detail}`);
console.error('\n   A broken playbook block renders as NOTHING — a rep mid-call just sees a gap.');
process.exit(1);
