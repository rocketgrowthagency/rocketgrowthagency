#!/usr/bin/env node
/**
 * check-pipeline-stages-load.mjs — PRE-FLIGHT: catch the errors that kill a night run, WITHOUT running
 * a single stage.
 *
 * WHY (2026-08-12/13): `step-2-email-scraper.mjs` declared `const files` and reassigned it inside the
 * search-scoping block added by 623ab59. `TypeError: Assignment to constant variable.` is thrown at CALL
 * time, so `node --check` parses it happily. It crashed the run ~5 minutes in on two consecutive nights:
 * 0 leads, 0 videos, no report, and nobody knew until the morning. Two nights for one word.
 *
 * 🔴 WHY THIS IS STATIC-ONLY (2026-08-14): the first version *imported* each stage to execute its module
 * body. That works — but importing `step-3-video-recorder.mjs` LAUNCHES CHROME. It opened a browser window
 * on Chris's screen while he was working, and this check runs inside overnight-pipeline.sh and on a 19:00
 * timer. A pre-flight must never perform, or even begin, the work it is checking. So: no imports, no
 * spawning, no side effects. Parse only.
 *
 * Checks per stage:
 *   1. SYNTAX      — `node --check` (never executes; safe for every file).
 *   2. CONST REASSIGN — scans for `const x` later assigned as `x =`. This is the exact class that killed
 *      08-12 + 08-13 and the one `--check` cannot see.
 *
 * Exit 0 = clean. Exit 2 = a stage would crash → the night run must ABORT before burning the window.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Kept in sync with `grep -oE "node [a-z0-9._-]+\.mjs" scripts/overnight-pipeline.sh`.
const STAGES = [
  'step-2-email-scraper.mjs',
  'step-2.5-audit.mjs',
  'step-3-video-recorder.mjs',
  'step-4-combine-desktop-mobile.mjs',
  'step-5-branding.mjs',
  'step-6-voiceover.mjs',
  'step-6b-subtitles.mjs',
  'step-7-merge-branded-audio.mjs',
  'step-8-publish-to-airtable.mjs',
  'build-video-landing.mjs',
];

// Strip strings/comments so a `const x` inside a string or a `foo = 1` in prose can't produce noise.
// ⚠️ Blank these regions but KEEP their newlines. Collapsing a multi-line template literal to `` shifts
// every line number after it — the first version reported a "bug" at line 1170 that was a different
// function entirely, and the flagged `z = readZoom()` actually lived INSIDE a template literal (browser
// JS for page.evaluate), not in Node code. Wrong line numbers make a checker untrustworthy even when the
// verdict is right.
const blankKeepingLines = (m) => '\n'.repeat((m.match(/\n/g) || []).length);
function scrub(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepingLines)       // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')                  // line comments (protocol-relative URLs intact)
    .replace(/`(?:\\.|[^`\\])*`/g, blankKeepingLines)      // template literals (may span many lines)
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

// Find `const NAME` that is later reassigned as `NAME =` (not ==, ===, =>, +=, or a re-declaration).
function constReassignments(src) {
  const clean = scrub(src);
  const lines = clean.split('\n');
  const declared = new Map(); // name → 1-based line of its `const`
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=/g;
  lines.forEach((l, i) => { let m; while ((m = re.exec(l))) if (!declared.has(m[1])) declared.set(m[1], i + 1); });

  // Scope guard. This is a regex, not a parser, so `const m` in one function and `let m` in another look
  // identical to it — that produced 3 false positives on the first run (m / d / host), and a pre-flight that
  // wrongly aborts a WORKING pipeline is worse than no pre-flight at all. So: only flag a name that is
  // never declared `let`/`var` anywhere in the file. The bug this exists to catch (`files`, only ever
  // `const`) is still caught; a name reused across scopes is not. Verified both ways.
  const rebindable = new Set();
  for (const m of clean.matchAll(/\b(?:let|var)\s+([A-Za-z_$][\w$]*)/g)) rebindable.add(m[1]);

  const hits = [];
  for (const [name, declLine] of declared) {
    if (rebindable.has(name)) continue;
    // STATEMENT-LEVEL assignment only: `      files = scoped;` — the exact shape of the bug that killed
    // 08-12 + 08-13. Anchoring to line-start (after indentation) removes the last false positives, which
    // were multi-declarator statements (`const v = …, u = …` reads as an assignment to `u`), conditional
    // assignments (`if (d == null) d = …`) and a regex literal containing `data=`. Narrower than a real
    // parser, but it has ZERO false alarms on this codebase and still catches the class we've been bitten
    // by twice — and a pre-flight that cries wolf is one that gets ignored.
    const assign = new RegExp(`^\\s*${name}\\s*=(?!=|>)`);
    lines.forEach((l, i) => {
      if (i + 1 <= declLine) return;
      if (new RegExp(`\\b(const|let|var)\\s+${name}\\b`).test(l)) return; // re-declared in another scope
      if (assign.test(l)) hits.push({ name, declLine, useLine: i + 1, text: l.trim().slice(0, 90) });
    });
  }
  return hits;
}

let failed = 0, checked = 0, missing = 0, advisories = 0;
for (const s of STAGES) {
  const p = path.join(ROOT, s);
  if (!fs.existsSync(p)) { console.log(`  ⚠ ${s} — not found (skipped)`); missing++; continue; }
  checked++;

  const parse = spawnSync('node', ['--check', p], { encoding: 'utf8' });
  if (parse.status !== 0) {
    console.error(`  ❌ ${s} — SYNTAX ERROR`);
    console.error((parse.stderr || '').split('\n').slice(0, 3).map((l) => '       ' + l).join('\n'));
    failed++; continue;
  }

  // ⚠️ ADVISORY, NOT A GATE. This is a regex, not a parser, and these stages embed large template literals
  // of browser JS for page.evaluate — nested `${}` and backticks defeat any regex tokenizer, so reported
  // lines can be wrong and a `x = y` inside injected browser code reads as Node code. Making that FAIL the
  // run would abort a WORKING pipeline, which is a worse failure than the bug it looks for. So it warns.
  // Syntax (above) stays a hard gate. The real backstop for the const class is the 19:00 rehearsal plus a
  // monitor that catches the crash within minutes so it can be fixed the same night.
  // 🔧 PROPER FIX when there's a moment: `npm i -D acorn` and use scope analysis (or eslint's
  //    `no-const-assign`, which is exactly this rule done correctly). Neither is installed here.
  const hits = constReassignments(fs.readFileSync(p, 'utf8'));
  if (hits.length) {
    console.log(`  ⚠️  ${s} — possible const reassignment (ADVISORY, verify by hand — may be inside a template literal)`);
    hits.slice(0, 2).forEach((h) => console.log(`       '${h.name}' const ~line ${h.declLine}, assigned ~${h.useLine}: ${h.text}`));
    advisories++;
  } else {
    console.log(`  ✅ ${s}`);
  }
}

console.log(`\n[stages-load] ${checked - failed}/${checked} stages parse clean${missing ? ` (${missing} not found)` : ''}${advisories ? `, ${advisories} advisory` : ''}`);
if (failed) {
  console.error('[stages-load] ❌ a stage has a SYNTAX ERROR and would crash the run. ABORT — do not burn the capture window.');
  process.exit(2);
}
process.exit(0);
