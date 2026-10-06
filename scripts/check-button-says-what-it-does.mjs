#!/usr/bin/env node
/**
 * check-button-says-what-it-does.mjs — a button that reaches OUTSIDE RGA must say so, and must ask.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09, walking SOP step 1 with Chris. The button on step 1 read:
 *
 *     ⚡ Draft this for me
 *
 * It does not draft anything. It **sends a real email to a real client**, immediately, with no
 * confirmation. The label was not per-step at all:
 *
 *     o.sopType === "auto" ? "⚡ Run automatically" : "⚡ Draft this for me"
 *
 * — so EVERY hybrid step claimed to draft. Step 2 said it too, and that one makes Google email the
 * client a calendar invite. Chris pressed "Draft this for me" expecting a draft.
 *
 * 🔑 **NOTHING IRREVERSIBLE AND OUTWARD-FACING SHOULD BE DISCOVERED BY CLICKING IT.** A label is a
 * promise about what happens next. When the action leaves the building — an email to a client, a
 * write to their public Google Business Profile — the label must name the act, and the click must be
 * confirmed with the CONSEQUENCE and the RECIPIENT, not the step id.
 *
 * WHAT THIS CHECKS
 *   1. Every runnable SOP step has an `actionLabel` — no step falls back to a generic verb.
 *   2. Every runner whose body sends mail / writes to GBP carries an `actionConfirm`.
 *   3. A step with `actionConfirm` never claims to "draft".
 *   4. The admin actually USES both fields (renders actionLabel, asks on actionConfirm).
 *
 * Exit 0 = labels and confirmations are honest · 1 = a button lies · 2 = could not tell.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = `${__SITE}`;
const PB = `${WEB}/data/playbooks/playbooks.json`;
const EXEC = `${WEB}/netlify/functions/flow-execute.js`;
const ADMIN = `${WEB}/admin/admin.js`;
const SABOTAGE = process.env.SABOTAGE === "1";

for (const f of [PB, EXEC, ADMIN]) {
  if (!fs.existsSync(f)) { console.error(`  ✗ missing ${f}`); process.exit(2); }
}
const pb = JSON.parse(fs.readFileSync(PB, "utf8"));
const exec = fs.readFileSync(EXEC, "utf8");
const admin = fs.readFileSync(ADMIN, "utf8");

const steps = [...(pb.month1 || []), ...(pb.month2plus || [])].filter((s) => s.hasRunner);
if (steps.length < 20) { console.error(`  ✗ only ${steps.length} runnable steps parsed — probe is wrong`); process.exit(2); }

function body(id) {
  const i = exec.indexOf(`"${id}": async`);
  if (i < 0) return null;
  const a = exec.indexOf("=>", i);
  const o = exec.indexOf("{", a);
  let d = 0;
  for (let j = o; j < exec.length; j++) {
    if (exec[j] === "{") d++;
    else if (exec[j] === "}") { d--; if (d === 0) return exec.slice(i, j + 1); }
  }
  return null;
}

// Reaching outside RGA = mail to a person, or a write to the client's public Google presence.
// These always reach a human the moment they run — no further test needed.
const ALWAYS_OUT = /send-confirmation-email|gmail\.googleapis|send-kickoff-invite|calendar\/v3|push-gbp|localpost/i;

// 🔴 A Google Business API call is outward only when it MUTATES. `m1.gbp.optimize_categories` GETs
// Google's global category taxonomy (v1/categories) so the model can only ever propose real category
// names — that call touches no client and changes nothing, and flagging it as an unconfirmed outward
// action was a false positive that would have trained someone to add a confirmation dialog to a
// read. The write it feeds lives in gbp-publish, which is hand-run and gated on an approval.
// 🔑 Keep the mutation test STRICT: any PATCH/POST/PUT/DELETE in the same runner re-arms this.
const GBP_API = /mybusiness/i;
const MUTATES = /method:\s*["'`](PATCH|POST|PUT|DELETE)["'`]/i;
const reachesOut = (b) => ALWAYS_OUT.test(b) || (GBP_API.test(b) && MUTATES.test(b));

console.log("── a button that reaches outside RGA must say so, and must ask ──");
const fails = [];

const unlabelled = steps.filter((s) => !String(s.actionLabel || "").trim()).map((s) => s.id);
if (unlabelled.length) {
  fails.push("unlabelled steps");
  console.log(`  🔴 ${unlabelled.length} runnable step(s) have no actionLabel — they fall back to a generic verb:`);
  unlabelled.slice(0, 8).forEach((i) => console.log(`       ${i}`));
} else console.log(`  ✅ all ${steps.length} runnable steps carry an explicit actionLabel`);

const outward = [];
for (const s of steps) {
  const b = body(s.id);
  if (b && reachesOut(b)) outward.push(s);
}
if (!outward.length) { console.error("  ✗ no outward-facing runner found — probe is wrong"); process.exit(2); }

let unconfirmed = outward.filter((s) => !String(s.actionConfirm || "").trim()).map((s) => s.id);
if (SABOTAGE) { unconfirmed = ["(sabotage) pretend one is unconfirmed"]; }
if (unconfirmed.length) {
  fails.push("outward action with no confirmation");
  console.log(`  🔴 ${unconfirmed.length} step(s) email a client or write to their GBP with NO confirmation:`);
  unconfirmed.forEach((i) => console.log(`       ${i}`));
} else {
  console.log(`  ✅ all ${outward.length} outward-facing step(s) require confirmation: ${outward.map((s) => s.id).join(", ")}`);
}

const lying = outward.filter((s) => /draft/i.test(s.actionLabel || "")).map((s) => s.id);
if (lying.length) {
  fails.push("outward action labelled as a draft");
  console.log(`  🔴 ${lying.length} step(s) send/write but say "draft": ${lying.join(", ")}`);
} else console.log("  ✅ no outward-facing step describes itself as a draft");

if (!/o\.actionLabel/.test(admin)) {
  fails.push("admin ignores actionLabel");
  console.log("  🔴 the admin never reads actionLabel — the field exists but the button still lies");
} else console.log("  ✅ the admin renders actionLabel");

if (!/actionConfirm/.test(admin) || !/rgaConfirm/.test(admin)) {
  fails.push("admin ignores actionConfirm");
  console.log("  🔴 the admin never asks on actionConfirm — a click still fires straight through");
} else console.log("  ✅ the admin asks before running a step that carries actionConfirm");

console.log("");
if (fails.length) {
  console.error(`🔴 a button does not say what it does (${fails.join(", ")}).`);
  console.error("   Nothing irreversible and outward-facing should be discovered by clicking it.");
  process.exit(1);
}
console.log(`✅ ${steps.length} runnable steps labelled · ${outward.length} outward-facing, all confirmed`);
