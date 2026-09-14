#!/usr/bin/env node
/**
 * check-no-invisible-controls.mjs — a control must never be able to render invisible.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * The green **"Call"** button — the single control the whole Call console exists for — rendered as
 * an EMPTY WHITE BOX in Chris's browser, in both the queue table and the lead card.
 *
 *     #callsView .dial     { background: var(--cc-good); color:#fff; }
 *     #callsView .ob.good  { background: var(--cc-good); color:#fff; }
 *
 * If `--cc-good` fails to resolve for any reason, `background` falls away, the card underneath is
 * white, and `color:#fff` puts white text on it. The button is still in the DOM, still clickable,
 * still correct — and completely invisible. **Nothing errors. No gate fired. It just disappears.**
 *
 * The markup, the CSS, the variable declaration, the cache-busters and the served files were each
 * verified correct, so the resolve failure was never reproduced. That is precisely the argument for
 * this rule: **a control whose visibility depends on one custom property resolving is a control that
 * can vanish for a reason you cannot see.** `var()` takes a fallback for exactly this.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 * No CSS rule may pair a hardcoded near-white/near-black `color` with a `background: var(--x)` that
 * has no fallback. Either give the var a literal fallback, or set the colour literally.
 *
 * Exit 0 = every control keeps its contrast · 1 = a control can render invisible · 2 = could not read.
 */
import fs from 'node:fs';
import path from 'node:path';

const SELF_TEST = process.argv.includes('--self-test');
const SITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const FILES = ['admin/admin.css', 'portal/portal.css', 'portal/report/report.css', 'styles.css'];

// Colours that vanish against the surface they usually sit on.
const RISKY_COLOR = /color\s*:\s*(#fff(f{3})?\b|#f{3}\b|white\b|#000\b|#000000\b|black\b)/i;
// A background that comes from a custom property with NO fallback: var(--x) — not var(--x, #hex).
const BG_VAR_NO_FALLBACK = /background(-color)?\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/i;

function findings(css, label) {
  const out = [];
  // 🔴 Strip comments FIRST. A comment explaining this very bug contained the offending snippet
  // verbatim, and the gate flagged its own documentation — a check that cannot tell code from prose
  // will eventually be muted by the person it keeps waking. → feedback_a_check_must_not_validate_itself
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Split on rule boundaries; good enough for flat stylesheets and keeps the check readable.
  for (const chunk of css.split('}')) {
    // 🔴 Use the LAST '{' so a rule nested inside an at-rule is still examined. Taking the FIRST
    // one made "@media print{ .x{ …" parse as selector "@media print", which the at-rule guard then
    // skipped — silently exempting every rule inside a media query. Caught by the self-test.
    const i = chunk.lastIndexOf('{');
    if (i < 0) continue;
    const sel = chunk.slice(0, i).split('{').pop().replace(/\s+/g, ' ').trim();
    const body = chunk.slice(i + 1);
    if (!sel || sel.startsWith('@')) continue;
    const bg = body.match(BG_VAR_NO_FALLBACK);
    if (!bg) continue;
    if (!RISKY_COLOR.test(body)) continue;
    out.push(`${label}: ${sel.slice(0, 80)} — background:var(${bg[2]}) has no fallback but colour is hardcoded`);
  }
  return out;
}

if (SELF_TEST) {
  const cases = [
    ['the Call button bug', '.dial{ background:var(--cc-good); color:#fff; }', 1],
    ['fixed with a fallback', '.dial{ background:var(--cc-good,#16a34a); color:#fff; }', 0],
    ['var background, inherited colour is fine', '.x{ background:var(--c); }', 0],
    ['literal background, white text is fine', '.x{ background:#16a34a; color:#fff; }', 0],
    ['black text on an unresolvable background', '.y{ background:var(--z); color:#000; }', 1],
    ['a rule INSIDE an at-rule is still checked', '@media print{ .x{ background:var(--c); color:#fff; } }', 1],
    ['a COMMENT describing the bug is not the bug', ':root{ /* background:var(--a); color:#fff; */ --a:#2457e6; }', 0],
  ];
  let bad = 0;
  for (const [label, css, want] of cases) {
    const got = findings(css, 't').length;
    const ok = (want === 0) === (got === 0);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${got})`);
  }
  console.log(`\n[contrast] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

let all = [], read = 0;
for (const f of FILES) {
  const p = path.join(SITE, f);
  if (!fs.existsSync(p)) continue;
  read++;
  all = all.concat(findings(fs.readFileSync(p, 'utf8'), f));
}
if (!read) { console.error('[contrast] INDETERMINATE — no stylesheets found'); process.exit(2); }

console.log(`[contrast] ${read} stylesheet(s) scanned`);
if (all.length) {
  console.error('\n✗ these controls can render invisible if one custom property fails to resolve:');
  for (const a of all) console.error(`    ${a}`);
  console.error('\n  Give the var() a literal fallback: background:var(--x,#16a34a).');
  process.exit(1);
}
console.log('✅ no control depends on an unresolvable custom property for its contrast.');
process.exit(0);
