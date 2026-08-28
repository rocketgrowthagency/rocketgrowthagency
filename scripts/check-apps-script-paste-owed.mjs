#!/usr/bin/env node
/**
 * check-apps-script-paste-owed.mjs — has an Apps Script been edited but never pasted?
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Apps Script has NO auto-deploy. Editing the repo file changes NOTHING in production until a human
 * copies it into the live editor. The repo therefore lies by default: it looks like the source of
 * truth while the live project runs something else.
 *
 * That gap has already cost real money. A 2026-07-07 commit dropped three auth lines from the FGA
 * delivery script; nobody could tell what was actually running, and report delivery was dead for
 * **37 days**. `Contact_Auto_Reply.gs` was worse — it existed ONLY in the live project.
 *
 * Chris, 2026-08-28: *"make sure youre saving the last full script code so when we need to update it
 * you have note of the last edited version."*
 *
 * `docs/apps-scripts/PASTED_STATE.json` records the sha256 of exactly what was last pasted. This
 * recomputes it. A mismatch means the repo moved and production did not.
 *
 * > **A line count can collide; a hash cannot.** The old registry tracked line counts, so a same-size
 * > edit would have passed unnoticed.
 *
 * Any pasted version is retrievable, because the hash always corresponds to a committed state:
 *     git log --oneline -- <file>   →   git show <sha>:<file>
 *
 * Usage:  node scripts/check-apps-script-paste-owed.mjs [--json]
 * Exit 0 = every live project matches its repo file · 1 = a paste is owed · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const STATE = path.join(WEBSITE, 'docs', 'apps-scripts', 'PASTED_STATE.json');
const JSON_OUT = process.argv.includes('--json');

if (!fs.existsSync(STATE)) {
  console.error('✗ PASTED_STATE.json is missing — there is now no record of what is live in any Apps');
  console.error('  Script project. Refusing to report OK; that is exactly the blind spot this exists for.');
  process.exit(2);
}

let state;
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); }
catch (e) { console.error(`✗ PASTED_STATE.json is unparseable: ${e.message}`); process.exit(2); }

const short = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const owed = [], missing = [], ok = [];

for (const p of state.projects || []) {
  const abs = path.join(WEBSITE, p.file);
  if (!fs.existsSync(abs)) { missing.push(p); continue; }
  const raw = fs.readFileSync(abs);
  const hash = short(raw);
  const lines = raw.toString('utf8').split('\n').length - (raw.toString('utf8').endsWith('\n') ? 1 : 0);
  if (hash !== p.sha256) owed.push({ ...p, nowHash: hash, nowLines: lines });
  else ok.push(p);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: ok.length, owed: owed.map((o) => ({ project: o.project, file: o.file, wasLines: o.lines, nowLines: o.nowLines })), missing: missing.map((m) => m.file) }, null, 2));
  process.exit(owed.length || missing.length ? 1 : 0);
}

console.log('\n===== APPS SCRIPT: repo vs last pasted =====');
for (const p of ok) console.log(`  ✓ ${p.project.padEnd(30)} ${String(p.lines).padStart(5)} lines  pasted ${p.lastPasted}`);
for (const o of owed) console.log(`  ⚠ ${o.project.padEnd(30)} ${String(o.lines).padStart(5)} → ${o.nowLines}  PASTE OWED (last ${o.lastPasted})`);
for (const m of missing) console.log(`  ✗ ${m.project.padEnd(30)} FILE MISSING: ${m.file}`);

if (missing.length) {
  console.error(`\n✗ ${missing.length} recorded file(s) no longer exist. Either the path changed or a script`);
  console.error('  was deleted while still running live. Reconcile PASTED_STATE.json.');
  process.exit(2);
}
if (!owed.length) {
  console.log('\n✅ every project matches what was last pasted. Nothing owed.');
  process.exit(0);
}

console.error(`\n✗ ${owed.length} SCRIPT(S) EDITED BUT NOT PASTED — production is running the OLD code.`);
for (const o of owed) {
  console.error(`\n   ${o.project}`);
  console.error(`     open   ${o.file}  →  Cmd+A, Cmd+C`);
  console.error(`     paste  Apps Script → ${o.project} → Code.gs → Cmd+A, Cmd+V, Cmd+S`);
  console.error(`     then   update sha256 to ${o.nowHash} + lastPasted in PASTED_STATE.json`);
}
console.error('\n   Do NOT update PASTED_STATE.json without a confirmed paste — a lying record is worse');
console.error('   than no record, because it reads as verified.');
process.exit(1);
