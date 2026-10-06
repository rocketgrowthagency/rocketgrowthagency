#!/usr/bin/env node
/**
 * check-contract-doc-gets-every-field-it-renders.mjs
 *
 * Every field the contract document RENDERS must be a field the query actually FETCHES.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * Chris, looking at his own agreement: *"the client contract CREATED — is this supposed to show a
 * date?"* It rendered an em dash. `buildContractDoc()` reads `contract.created_at` and falls back to
 * "—" when it is absent; `portal-get-contracts.js` never selected the column. So **every contract,
 * for every client, since the viewer shipped** showed no created date.
 *
 * Chasing it found three worse ones on the SIGNED document. The signature block renders
 * `signer_email`, `signer_ip` and the browser derived from `signer_user_agent`. None were selected,
 * so the legally-operative audit line read:
 *
 *     Signed via secure portal · IP ? · Hash 8f2c…
 *
 * with a blank signer email — on a signature where the database held the name, the email, the IP
 * `76.91.52.179` and the full user agent. **The document was not wrong about the data. It was never
 * given the data.**
 *
 * 🔑 A projection that omits a field the renderer reads DOES NOT ERROR. It silently renders the
 * fallback and looks finished. This is the same shape as the send-queue gate counting suppressed
 * leads, and as the admin SELECTing a column that did not exist.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 * Every `contract.<field>` read in shared/contract-doc.js appears in the `cols` list in
 * netlify/functions/portal-get-contracts.js — or is listed below as deliberately derived.
 *
 * Exit 0 = the document gets everything it renders · 1 = a rendered field is never fetched · 2 = could not read.
 */
import fs from 'node:fs';
import path from 'node:path';

const SELF_TEST = process.argv.includes('--self-test');
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. A gate nobody can make fail is a gate nobody has
// checked. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const DOC = path.join(SITE, 'shared/contract-doc.js');
const FN = path.join(SITE, 'netlify/functions/portal-get-contracts.js');

// Fields the renderer reads that are NOT columns — computed by the function before it responds.
// Each needs a reason, so "it is derived" is a decision on the record rather than an oversight.
const DERIVED = {
  addons: 'derived from audit_log by portal-get-contracts before responding',
  project_total: 'derived from audit_log by portal-get-contracts before responding',
  html: 'not a field — matches the word "contract-doc.html" inside a comment',
};

function fieldsRead(src) {
  // Strip comments so prose describing a field is not mistaken for code reading it.
  const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set([...code.matchAll(/\bcontract\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]))];
}

function colsOf(src) {
  // The list may be split across concatenated string literals.
  const m = src.match(/const cols\s*=\s*((?:"[^"]*"\s*\+?\s*)+)/);
  if (!m) return null;
  return new Set(m[1].split('+').map((s) => s.trim().replace(/^"|"$/g, '')).join('').split(',').map((s) => s.trim()).filter(Boolean));
}

if (SELF_TEST) {
  const cases = [
    ['a field that is selected', 'contract.created_at', 'id,created_at', 0],
    ['THE BUG: rendered but never selected', 'contract.created_at', 'id,sent_at', 1],
    ['a field named only in a comment is ignored', '/* contract.signer_ip is private */', 'id', 0],
    ['a derived field is allowed', 'contract.addons', 'id', 0],
    ['split cols literal is parsed', 'contract.signer_ip', '"id," +\n    "signer_ip"', 0],
  ];
  let bad = 0;
  for (const [label, doc, cols, want] of cases) {
    const src = cols.includes('"') ? `const cols = ${cols};` : `const cols = "${cols}";`;
    const c = colsOf(src) || new Set();
    const missing = fieldsRead(doc).filter((f) => !c.has(f) && !DERIVED[f]);
    const ok = (missing.length > 0) === (want === 1);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${missing.length})`);
  }
  console.log(`\n[contract] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

let docSrc, fnSrc;
try { docSrc = fs.readFileSync(DOC, 'utf8'); fnSrc = fs.readFileSync(FN, 'utf8'); }
catch (e) { console.error(`[contract] INDETERMINATE — ${e.message}`); process.exit(2); }

const cols = colsOf(fnSrc);
if (!cols) { console.error('[contract] INDETERMINATE — could not find the `const cols = "…"` projection'); process.exit(2); }

const read = fieldsRead(docSrc);
const missing = read.filter((f) => !cols.has(f) && !DERIVED[f]);

console.log(`[contract] document reads ${read.length} field(s); projection fetches ${cols.size}`);
if (missing.length) {
  console.error('\n✗ the contract document renders fields the query never fetches:');
  for (const f of missing) console.error(`    contract.${f} — rendered, not selected. It will show its fallback on EVERY contract.`);
  console.error('\n  Add them to `cols` in portal-get-contracts.js, or record them in DERIVED with a reason.');
  process.exit(1);
}
console.log('✅ every field the contract document renders is fetched by the query.');
process.exit(0);
