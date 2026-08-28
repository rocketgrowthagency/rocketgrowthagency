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
 * Chris, 2026-08-28: *"save last used file as I am asking you for the code. so you save record then
 * when we replace it you just replace in the file system."*
 *
 * So `docs/apps-scripts/last-pasted/` holds a **byte-exact copy of the code that is actually running
 * in each live project**. Not a hash of it — the file itself, openable and diffable. This compares
 * the working file against that copy.
 *
 * > **A hash tells you THAT something changed. A saved copy tells you WHAT changed.** The snapshot is
 * > what makes a pre-paste review possible at all.
 *
 * `PASTED_STATE.json` alongside it carries the metadata (project name, date, who confirmed).
 *
 * ── THE WORKFLOW ─────────────────────────────────────────────────────────────────────────────────
 *   1. edit    docs/apps-scripts/gmail-to-airtable.gs   (the working file)
 *   2. review  node scripts/check-apps-script-paste-owed.mjs --diff
 *   3. Chris pastes into the live editor and confirms
 *   4. promote node scripts/check-apps-script-paste-owed.mjs --promote
 *              → copies working file over the snapshot + updates PASTED_STATE.json
 *
 * 🔴 Step 4 ONLY after a confirmed paste. Promoting early makes the record lie, and a lying record is
 * worse than none because it reads as verified.
 *
 * Usage:  node scripts/check-apps-script-paste-owed.mjs [--diff] [--promote] [--json]
 * Exit 0 = every live project matches its repo file · 1 = a paste is owed · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const SNAP_DIR = path.join(WEBSITE, 'docs', 'apps-scripts', 'last-pasted');
const STATE = path.join(WEBSITE, 'docs', 'apps-scripts', 'PASTED_STATE.json');

const JSON_OUT = process.argv.includes('--json');
const SHOW_DIFF = process.argv.includes('--diff');
const PROMOTE = process.argv.includes('--promote');

if (!fs.existsSync(STATE)) {
  console.error('✗ PASTED_STATE.json is missing — there is now no record of what is live in any Apps');
  console.error('  Script project. Refusing to report OK; that is exactly the blind spot this exists for.');
  process.exit(2);
}
if (!fs.existsSync(SNAP_DIR)) {
  console.error(`✗ ${SNAP_DIR} is missing — the saved copies of the live code are gone.`);
  console.error('  Restore from git; without them a pre-paste diff is impossible.');
  process.exit(2);
}

let state;
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); }
catch (e) { console.error(`✗ PASTED_STATE.json is unparseable: ${e.message}`); process.exit(2); }

const owed = [], broken = [], ok = [];
for (const p of state.projects || []) {
  const live = path.join(WEBSITE, p.file);
  const snap = path.join(SNAP_DIR, path.basename(p.file));
  if (!fs.existsSync(live)) { broken.push({ ...p, why: 'working file missing' }); continue; }
  // 🔴 A missing snapshot must NOT read as "matches". Without it there is nothing to compare to.
  if (!fs.existsSync(snap)) { broken.push({ ...p, why: 'no saved copy of the live code' }); continue; }
  const a = fs.readFileSync(live), b = fs.readFileSync(snap);
  // Match `wc -l` — a trailing newline terminates the last line, it does not start a new one.
  const txt = a.toString('utf8');
  const entry = { ...p, live, snap, nowLines: txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0) };
  if (a.equals(b)) ok.push(entry); else owed.push(entry);
}

if (PROMOTE) {
  if (broken.length) { console.error('✗ refusing to promote while files are missing — fix those first.'); process.exit(2); }
  if (!owed.length) { console.log('Nothing to promote — every snapshot already matches.'); process.exit(0); }
  for (const o of owed) {
    fs.copyFileSync(o.live, o.snap);
    const proj = state.projects.find((x) => x.file === o.file);
    proj.lines = o.nowLines;
    proj.lastPasted = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    console.log(`  ✓ promoted ${o.project} → ${o.nowLines} lines, pasted ${proj.lastPasted}`);
  }
  delete state.sha256;
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  console.log('\nSnapshots updated. Commit them WITH the code change.');
  console.log('⚠️  Only correct if Chris actually pasted. If not, `git checkout` this and try again.');
  process.exit(0);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: ok.length, owed: owed.map((o) => ({ project: o.project, file: o.file, wasLines: o.lines, nowLines: o.nowLines })), broken: broken.map((b) => ({ file: b.file, why: b.why })) }, null, 2));
  process.exit(owed.length || broken.length ? 1 : 0);
}

console.log('\n===== APPS SCRIPT: working file vs the code actually running =====');
for (const p of ok) console.log(`  ✓ ${p.project.padEnd(30)} ${String(p.nowLines).padStart(5)} lines  pasted ${p.lastPasted}`);
for (const o of owed) console.log(`  ⚠ ${o.project.padEnd(30)} ${String(o.lines).padStart(5)} → ${o.nowLines}  PASTE OWED (live is from ${o.lastPasted})`);
for (const b of broken) console.log(`  ✗ ${b.project.padEnd(30)} ${b.why}: ${b.file}`);

if (broken.length) {
  console.error(`\n✗ ${broken.length} project(s) cannot be checked. Reconcile before trusting anything here.`);
  process.exit(2);
}
if (!owed.length) {
  console.log('\n✅ every project matches the code that is running. Nothing owed.');
  process.exit(0);
}

console.error(`\n✗ ${owed.length} SCRIPT(S) EDITED BUT NOT PASTED — production is running the OLD code.`);
for (const o of owed) {
  console.error(`\n   ${o.project}`);
  console.error(`     1. review  node scripts/check-apps-script-paste-owed.mjs --diff`);
  console.error(`     2. open    ${o.file}  →  Cmd+A, Cmd+C`);
  console.error(`     3. paste   Apps Script → ${o.project} → Code.gs → Cmd+A, Cmd+V, Cmd+S`);
  console.error(`     4. promote node scripts/check-apps-script-paste-owed.mjs --promote`);
  if (SHOW_DIFF) {
    console.error(`\n   ── what changed since the live version ──`);
    try {
      execFileSync('diff', ['-u', o.snap, o.live], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (d) {
      const body = String(d.stdout || '').split('\n').slice(2, 80).join('\n');
      console.error(body || '   (diff produced no output)');
    }
  }
}
if (!SHOW_DIFF) console.error('\n   Re-run with --diff to see exactly what would change in production.');
console.error('\n   🔴 Only --promote AFTER Chris confirms the paste. A record that lies reads as verified.');
process.exit(1);
