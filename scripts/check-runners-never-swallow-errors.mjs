#!/usr/bin/env node
/**
 * check-runners-never-swallow-errors.mjs — no SOP runner may discard an error silently.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-08/09, auditing all 88 delivery-SOP steps: 17 runners in `flow-execute.js` wrapped a fetch
 * in `try { … } catch {}`. Every one of them turned a network failure into a confident wrong answer,
 * because the code downstream cannot tell "there is nothing there" from "I could not look":
 *
 *   m1.web.nap_consistency        all fetches fail → allPhones empty → `consistent = (0 <= 1)`
 *                                 → reported "Consistency: ✓" having read NOTHING
 *   m1.web.internal_linking       a failed page contributes no outbound links
 *                                 → every page it linked to reported an ORPHAN
 *   m2.exec.site_audit_recurring  no sitemap → "0 pages checked, 0 broken, Broken URLs: none"
 *                                 → reads as a clean site audit of a site never touched
 *   m2.exec.cannibalization_audit unread pages cannot collide → "No collisions detected"
 *   m2.plan.rotating_focus        loses the "avoid repeating" list → can hand the client the SAME
 *                                 focus area two months running, with nothing saying why
 *
 * 🔑 THE RULE: **an error is a result.** Catch it if you like — but then the output must SAY the
 * data is missing. Absence of evidence is never reported as evidence of absence
 * ([[feedback-indeterminate-is-not-a-finding]], [[feedback-verification-gates-must-be-strict]]).
 *
 * 🔴 THE PROBE TRAP, hit twice while writing this: a comment containing the words `catch {}` matches
 * a naive scan, and the comments explaining these very fixes are full of them. Comments are stripped
 * before scanning. A gate that flags its own documentation is a gate that gets muted.
 *
 * Exit 0 = no runner swallows · 1 = one does · 2 = could not tell.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const EXEC = `${__SITE}/netlify/functions/flow-execute.js`;
const PB = `${__SITE}/data/playbooks/playbooks.json`;
const SABOTAGE = process.env.SABOTAGE === "1";

for (const f of [EXEC, PB]) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing: ${f}`); process.exit(2); }
}

let raw = fs.readFileSync(EXEC, "utf8");
if (SABOTAGE) {
  raw = raw.replace(/\} catch \(e\) \{ ctxErr = e\.message[^\n]*\}/, "} catch {}");
  console.log("  ⚠️  SABOTAGE=1 — an empty catch has been re-injected");
}

// 🔴 Strip comments FIRST. Block comments and line comments become spaces so offsets are preserved.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

const pb = JSON.parse(fs.readFileSync(PB, "utf8"));
const steps = [...(pb.month1 || []), ...(pb.month2plus || [])];

function runnerBody(id) {
  const i = src.indexOf(`"${id}": async`);
  if (i < 0) return null;
  // Brace-match from the ARROW — starting at the id closes on the `({ client })` destructuring.
  const arrow = src.indexOf("=>", i);
  if (arrow < 0) return null;
  const open = src.indexOf("{", arrow);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

console.log("── no SOP runner may discard an error silently ──");

const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/;
const offenders = [];
let scanned = 0;
for (const s of steps) {
  const body = runnerBody(s.id);
  if (!body) continue;
  scanned++;
  if (EMPTY_CATCH.test(body)) offenders.push(s.id);
}

// 🔑 Sanity-check the probe. Scanning ~0 runners would pass vacuously, which is exactly how a
// broken extractor looks like a clean codebase.
if (scanned < 40) {
  console.error(`  ✗ only ${scanned} runner bodies parsed — the extractor is probably broken, not the code`);
  process.exit(2);
}
console.log(`  runners scanned: ${scanned}`);

console.log("");
if (offenders.length) {
  console.error(`🔴 ${offenders.length} runner(s) swallow an error:`);
  offenders.forEach((o) => console.error(`     ${o}`));
  console.error("   Record the failure and SAY SO in the summary. A caught-and-dropped fetch turns");
  console.error("   'I could not look' into 'there is nothing there' — a false finding, stated confidently.");
  process.exit(1);
}
console.log(`✅ ${scanned} SOP runners: every caught error is recorded and surfaced`);
