#!/usr/bin/env node
/**
 * check-admin-sees-what-the-client-sees.mjs
 *
 * The admin and the client portal must be looking at ONE list of deliverables.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * Chris: *"admin must always match and know what is done and showing on client side and when
 * approved."*
 *
 * 🔑 The failure this prevents is silent and expensive: if each side keeps its own idea of "what is
 * awaiting approval", they drift, and the first symptom is a **client approving something the admin
 * never displayed** — an approval nobody can trace, on work nobody knew was out.
 *
 * Both endpoints now import `_deliverables.js`. This gate asserts that stays true: neither side may
 * grow a private copy of the allow-list, and neither may reach into a task's fields the other does
 * not know about.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. `_deliverables.js` exists and exports a non-empty CLIENT_APPROVABLE.
 *   2. BOTH portal-deliverables and admin-deliverables import it.
 *   3. NEITHER declares its own `CLIENT_APPROVABLE = {` literal.
 *   4. The portal never returns the fields that are ours, not the client's.
 *
 * Exit 0 = one shared list · 1 = they can drift · 2 = could not read.
 */
import fs from 'node:fs';
import path from 'node:path';

const SELF_TEST = process.argv.includes('--self-test');
const SITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const SHARED = path.join(SITE, 'netlify/functions/_deliverables.js');
const SIDES = {
  portal: path.join(SITE, 'netlify/functions/portal-deliverables.js'),
  admin: path.join(SITE, 'netlify/functions/admin-deliverables.js'),
};

// 🔴 Fields that describe HOW the work is produced. The portal must never return them — that is the
// locked admin/portal boundary, and a leak here hands a client our method.
const METHOD_FIELDS = ['dependsOn', 'step_status', 'outcome_code', 'findings', 'checklist_position'];

export function verdict({ sharedSrc, sides }) {
  const problems = [];
  if (!sharedSrc) return ['netlify/functions/_deliverables.js is missing — there is no shared list'];
  if (!/CLIENT_APPROVABLE\s*=\s*\{[\s\S]*?m1\./.test(sharedSrc)) problems.push('_deliverables.js does not define a populated CLIENT_APPROVABLE');
  if (!/module\.exports\s*=\s*\{[^}]*CLIENT_APPROVABLE/.test(sharedSrc)) problems.push('_deliverables.js does not export CLIENT_APPROVABLE');

  for (const [name, src] of Object.entries(sides)) {
    if (!src) { problems.push(`${name}-deliverables.js is missing`); continue; }
    if (!/require\(["']\.\/_deliverables["']\)/.test(src)) {
      problems.push(`${name}-deliverables.js does not import the shared list — it can drift from the other side`);
    }
    if (/const\s+CLIENT_APPROVABLE\s*=\s*\{/.test(src)) {
      problems.push(`${name}-deliverables.js declares its OWN CLIENT_APPROVABLE — two lists, guaranteed to diverge`);
    }
  }
  const portal = sides.portal || '';
  for (const f of METHOD_FIELDS) {
    // Only flag it being RETURNED, not merely mentioned in a comment explaining the exclusion.
    if (new RegExp(`^\\s*${f}\\s*:`, 'm').test(portal.replace(/\/\/.*$/gm, ''))) {
      problems.push(`portal-deliverables returns "${f}" — that is method, not deliverable`);
    }
  }
  return problems;
}

if (SELF_TEST) {
  const good = { sharedSrc: 'const CLIENT_APPROVABLE = { "m1.web.priority_pages": {} };\nmodule.exports = { CLIENT_APPROVABLE };',
    sides: { portal: 'const { CLIENT_APPROVABLE } = require("./_deliverables");', admin: 'const { CLIENT_APPROVABLE } = require("./_deliverables");' } };
  const cases = [
    ['both import the shared list', good, 0],
    ['THE BUG: admin keeps its own copy', { ...good, sides: { ...good.sides, admin: 'const CLIENT_APPROVABLE = { "m1.x": {} };' } }, 1],
    ['a side forgets to import it', { ...good, sides: { ...good.sides, admin: '// nothing' } }, 1],
    ['shared file missing entirely', { sharedSrc: null, sides: good.sides }, 1],
    ['portal leaks a method field', { ...good, sides: { ...good.sides, portal: good.sides.portal + '\n      step_status: t.status,' } }, 1],
    ['a COMMENT naming the field is fine', { ...good, sides: { ...good.sides, portal: good.sides.portal + '\n      // step_status: never returned' } }, 0],
  ];
  let bad = 0;
  for (const [label, input, want] of cases) {
    const got = verdict(input).length;
    const ok = (got > 0) === (want === 1);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${got})`);
  }
  console.log(`\n[match] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const problems = verdict({ sharedSrc: read(SHARED), sides: { portal: read(SIDES.portal), admin: read(SIDES.admin) } });

if (problems.length) {
  console.error('✗ admin and the client portal can show different things:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\n  A client approving something the admin never displayed is an approval nobody can trace.');
  process.exit(1);
}
console.log('✅ admin and the client portal share one deliverable list, and the portal leaks no method.');
process.exit(0);
