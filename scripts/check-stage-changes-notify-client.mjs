#!/usr/bin/env node
/**
 * check-stage-changes-notify-client.mjs — moving a client forward must tell the client.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09 audit of the Setup phase. FOUR functions advanced a client's lifecycle stage and NOT
 * ONE of them told the client:
 *
 *     contract-sign.js          → stage_1b_admin_review   silence
 *     admin-record-payment.js   → stage_3_setup           silence
 *     stripe-webhook.js         → stage_3_setup           silence
 *     oauth-google-callback.js  → stage_4_onboarding      silence
 *
 * So after the intro email a new client heard NOTHING — through signing, through paying, through
 * setup. Each of those is a moment they expect acknowledgement, and "did that go through?" is how a
 * warm client goes cold. Chris: *"each stage is a connection point they can deny."*
 *
 * 🔑 A STAGE CHANGE IS A PROMISE TO THE CLIENT, not just a database write. If code moves them
 * forward it must either notify them or say plainly why no message is due.
 *
 * Exit 0 = every advancing transition notifies · 1 = one is silent · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${__SITE}/netlify/functions`;
const SABOTAGE = process.env.SABOTAGE === "1";
if (!fs.existsSync(FNS)) { console.error("  ✗ functions dir not found"); process.exit(2); }

// Stages where silence is CORRECT — the client has nothing to do and no news to receive.
const NO_MESSAGE_DUE = new Set([
  "stage_1_contract",   // covered by the intro email sent with the agreement
  "stage_5_monthly",    // steady state; the monthly report is the communication
  "stage_6_mature",
]);

console.log("── a stage change must tell the client ──");
const fails = [];
let checked = 0;

for (const f of fs.readdirSync(FNS).filter((x) => x.endsWith(".js") && fs.statSync(path.join(FNS, x)).isFile())) {
  let src = fs.readFileSync(path.join(FNS, f), "utf8");
  // 🔴 Scoped so it does not shadow the "browser" case below. An unscoped sabotage block makes
  // every later case "pass" by tripping this earlier assertion — proving nothing about the case
  // you meant to test. Second time today.
  if (SABOTAGE && (process.env.SABOTAGE_CASE || "fn") === "fn" && f === "admin-record-payment.js") {
    src = src.replace(/await notifyClientStage\(clientId, "stage_3_setup"\);/, "");
  }
  // Strip comments — this file's own documentation names the offending functions.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));

  const writes = [...code.matchAll(/client_portal_stage:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const advancing = [...new Set(writes)].filter((s) => !NO_MESSAGE_DUE.has(s));
  if (!advancing.length) continue;
  checked++;

  // 🔴 CHECK FOR A CALL, PER STAGE — not for the word appearing somewhere. The first version
  // matched /notifyClientStage/ anywhere, which the helper's own DEFINITION satisfies: deleting the
  // call left the definition behind and the gate still passed its own sabotage test. A definition
  // is not an invocation.
  const notified = new Set(
    [...code.matchAll(/notifyClientStage\(\s*[^,]+,\s*"([a-z0-9_]+)"\s*\)/g)].map((m) => m[1]),
  );
  const silent = advancing.filter((s) => !notified.has(s));
  if (!silent.length) {
    console.log(`  ✅ ${f.padEnd(30)} advances to ${advancing.join(", ")} and notifies each`);
  } else {
    fails.push(`${f} → ${silent.join(", ")}`);
    console.log(`  🔴 ${f} advances a client to ${silent.join(", ")} in SILENCE`);
    console.log("     they are moved forward and never told — that is where a warm client goes cold");
  }
}

if (!checked) { console.error("  ✗ no advancing transitions found — probe is wrong"); process.exit(2); }

console.log("");
if (fails.length) {
  console.error(`🔴 ${fails.length} silent stage transition(s):`);
  fails.forEach((x) => console.error(`     ${x}`));
  console.error("   A stage change is a promise to the client, not just a database write.");
  process.exit(1);
}
// ── BROWSER-SIDE STAGE WRITES (added 2026-09-10) ───────────────────────────────────────────────
// 🔴 This gate scanned netlify/functions/ ONLY, and passed green while admin.js advanced a client's
// stage with a direct supabase.from("clients").update({ client_portal_stage }) in the BROWSER — no
// function involved, so no notifier ran and nothing here could see it.
//
// Proven live: the admin accepted a signed contract, the client moved to stage_2_payment, and was
// told NOTHING. The confirm dialog even read "the client will see the payment banner on their next
// portal visit" — the silent-transition problem written down as if it were the design.
// 🔑 An in-app banner is not a notification: it only reaches people already coming back.
// 🔑 A gate that scans one directory cannot vouch for behaviour that lives in another.
// 🔴 billing-daily-check escalated active → overdue → warning → paused over 18 days and sent ZERO
// emails — it flipped a flag and drew a portal banner. A BILLING state change is a stage change
// as far as the client is concerned, so it belongs to the same rule.
const BILLING_JS = `${__SITE}/netlify/functions/billing-daily-check.js`;
if (fs.existsSync(BILLING_JS)) {
  let b = fs.readFileSync(BILLING_JS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (process.env.SABOTAGE === "1" && process.env.SABOTAGE_CASE === "billing") b = b.replace(/notify-client-stage/g, "nope");
  const writes = /billing_status: newBillingStatus/.test(b);
  const notifies = /notify-client-stage/.test(b);
  if (writes && !notifies) {
    console.error("🔴 billing-daily-check changes billing_status but never calls notify-client-stage.");
    console.error("   A client can be escalated to PAUSED without a single email.");
    process.exit(1);
  }
  console.log(writes ? "✅ billing-daily-check escalates AND emails the client" : "▫️  billing-daily-check no longer writes billing_status");
}

const ADMIN_JS = `${__SITE}/admin/admin.js`;
if (fs.existsSync(ADMIN_JS)) {
  let asrc = fs.readFileSync(ADMIN_JS, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (process.env.SABOTAGE === "1" && process.env.SABOTAGE_CASE === "browser") {
    asrc = asrc.replace(/notify-client-stage/g, "some-other-endpoint");
  }
  const writesStage = /update\(\s*\{\s*client_portal_stage/.test(asrc);
  const notifies = /notify-client-stage/.test(asrc);
  if (writesStage && !notifies) {
    console.error("🔴 admin.js writes client_portal_stage directly from the browser but never calls");
    console.error("   notify-client-stage — the stage moves and nobody tells the client.");
    process.exit(1);
  }
  console.log(writesStage
    ? "✅ admin.js writes the stage in-browser AND calls notify-client-stage"
    : "▫️  admin.js no longer writes client_portal_stage directly");
}

console.log(`✅ all ${checked} advancing transition(s) notify the client`);
