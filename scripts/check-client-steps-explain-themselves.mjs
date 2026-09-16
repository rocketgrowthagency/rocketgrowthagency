#!/usr/bin/env node
/**
 * check-client-steps-explain-themselves.mjs — a "Show me how" button must have a how behind it.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * Every client action step with `clientForm: "generic"` rendered a "Show me how →" button. The panel
 * behind it fell back to `clientHint` — the SAME sentence already printed above it. So the client
 * read the hint, pressed a button promising instructions, and was shown the hint again.
 *
 * All 15 steps did this. Chris found it on step 6, where a client choosing between CallRail,
 * OpenPhone and Skip was offered no comparison, no costs and no recommendation.
 * → feedback_we_never_promise_what_we_dont_do · feedback_a_clean_payload_is_not_a_clean_page
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. The portal never renders the button unless `clientInstructions` exists.
 *   2. The detail panel never falls back to `clientHint` — duplicating it is what started this.
 *   3. Instructions, where present, are not a restatement of the hint.
 *   4. It REPORTS how many client steps still lack instructions, so the backlog is visible rather
 *      than forgotten. That number must not grow.
 *
 * Exit 0 = no step promises what it lacks · 1 = one does · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// The backlog on the day this gate was written. It may shrink, never grow.
const BASELINE_MISSING = 0;   // all 15 written 2026-09-16 — this may never grow again

let js, PB;
try {
  js = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8");
  PB = JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/playbooks.json"), "utf8"));
} catch (e) { console.error(`[steps] INDETERMINATE — ${e.message}`); process.exit(2); }

const fail = [];
console.log("── every client step explains itself ──");

// 1 ─ the button is conditional on there being something behind it
if (!/step\.clientForm === "generic" && step\.clientInstructions/.test(js)) {
  fail.push('the "Show me how" button no longer requires clientInstructions — it would promise a panel that only repeats the hint');
}
// 2 ─ the panel must not fall back to the hint
const panel = js.match(/data-action-detail="\$\{escapeAttribute\(step\.id\)\}"[\s\S]{0,700}?<\/div>/);
if (panel && /clientHint/.test(panel[0])) {
  fail.push("the detail panel falls back to clientHint again — that is the duplicate the client saw twice");
}

const steps = [...(PB.month1 || []), ...(PB.month2plus || [])];
const clientSteps = steps.filter((s) => s.clientForm === "generic");
const missing = clientSteps.filter((s) => !s.clientInstructions);

// 3 ─ instructions must add something
for (const s of clientSteps) {
  if (!s.clientInstructions) continue;
  const norm = (x) => String(x || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(s.clientInstructions) === norm(s.clientHint)) {
    fail.push(`${s.id}: clientInstructions is a copy of clientHint — the panel would show the same words again`);
  }
  if (s.clientInstructions.length < 120) {
    fail.push(`${s.id}: clientInstructions is ${s.clientInstructions.length} chars — too short to be a how-to`);
  }
}

// 4 ─ the backlog is visible and must not grow
if (missing.length > BASELINE_MISSING) {
  fail.push(`${missing.length} client steps lack instructions, up from ${BASELINE_MISSING}: ${missing.slice(0, 4).map((s) => s.id).join(", ")}…`);
}

console.log(`  ${clientSteps.length} client action steps · ${clientSteps.length - missing.length} with instructions · ${missing.length} still to write`);
if (missing.length) console.log(`  backlog: ${missing.map((s) => s.id).join(", ")}`);

if (fail.length) {
  console.error(`\n✗ a client step promises what it does not have — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  These are the things only the client can do. If the instructions are missing, they guess.");
  process.exit(1);
}
console.log("  ✅ no step offers instructions it does not have");
process.exit(0);
