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

const FNS = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/netlify/functions";
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
  if (SABOTAGE && f === "admin-record-payment.js") {
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
console.log(`✅ all ${checked} advancing transition(s) notify the client`);
