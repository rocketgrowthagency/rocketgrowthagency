#!/usr/bin/env node
/**
 * check-call-tracking-path-is-whole.mjs — opting in to call tracking actually leads somewhere.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * Chris tapped "Add call tracking" and nothing happened. The choice was stored and that was the end
 * of it: no flag was flipped, nobody was told, no number was provisioned, and the Tracked calls tile
 * had nothing to show. A card that asks a client to decide and then drops the decision is worse than
 * one that never asked. → feedback_a_finding_must_be_actionable_inside_the_product
 *
 * ─── THE CHAIN THIS PROTECTS ─────────────────────────────────────────────────────────────────────
 *   tap → kpi_config.call_tracking = true → RGA is notified → CallRail company provisioned
 *       → callrail-sync pulls the month → client_monthly_records.total_calls → "Tracked calls" tile
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every choice on a decision step declares what it switches (clientChoiceSets), so a choice
 *      cannot be silently inert.
 *   2. The opt-in notifies RGA and carries the action we owe them.
 *   3. The endpoint writes the flag and reads it back.
 *   4. callrail-sync writes total_calls and NEVER gbp_calls, and returns indeterminate rather than
 *      writing a 0 when it cannot tell — a 0 is a claim that nobody rang.
 *   5. The step has an executor, so it is runnable rather than a dead Run button.
 *
 * Exit 0 = the chain is whole · 1 = a link is missing · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");

let PB, choiceFn, sync, flow, prov;
try {
  PB = JSON.parse(read("data/playbooks/playbooks.json"));
  choiceFn = read("netlify/functions/portal-step-choice.js");
  sync = read("netlify/functions/call-tracking-sync.js");
  flow = read("netlify/functions/flow-execute.js");
  prov = read("netlify/functions/call-tracking-provision.js");
} catch (e) { console.error(`[calltrack] INDETERMINATE — ${e.message}`); process.exit(2); }

const fail = [];
console.log("── opting in to call tracking leads somewhere ──");

const steps = [...(PB.month1 || []), ...(PB.month2plus || [])];
const decisionSteps = steps.filter((s) => Array.isArray(s.clientChoices) && s.clientChoices.length);

// 1 ─ a choice must declare what it switches
for (const s of decisionSteps) {
  if (!s.clientChoiceSets) {
    fail.push(`${s.id} offers choices but declares no clientChoiceSets — whichever the client picks changes nothing`);
    continue;
  }
  for (const c of s.clientChoices) {
    if (!(c.key in s.clientChoiceSets)) fail.push(`${s.id}.${c.key} has no entry in clientChoiceSets`);
  }
}

// 2 ─ the opt-in tells us, and says what we owe
const call = steps.find((s) => s.id === "m1.tracking.call_setup");
if (!call) fail.push("m1.tracking.call_setup is gone");
else {
  const optIn = (call.clientChoices || []).find((c) => c.key === "rga_sets_up");
  if (!optIn) fail.push("the call-tracking opt-in choice is gone");
  else {
    if (!optIn.notifyRga) fail.push("opting in no longer notifies RGA — a client could opt in and wait a fortnight");
    if (!optIn.rgaAction || optIn.rgaAction.length < 60) fail.push("the opt-in carries no description of what RGA must then do");
  }
  // Either way of opting in must set the flag — "set one up for me" and "I already have one".
  for (const key of ["rga_sets_up", "already_have"]) {
    if (call.clientChoiceSets?.[key]?.kpi_config?.call_tracking !== true) {
      fail.push(`"${key}" no longer sets kpi_config.call_tracking — every downstream surface would carry on as though they had not opted in`);
    }
  }
  if (call.clientChoiceSets?.skip?.kpi_config?.call_tracking !== false) {
    fail.push("skipping no longer clears kpi_config.call_tracking — changing their mind would not take effect");
  }
}

// 3 ─ the endpoint writes the flag and verifies it
if (!/clientChoiceSets/.test(choiceFn)) fail.push("portal-step-choice ignores clientChoiceSets — the switch is never flipped");
if (!/kpi_config/.test(choiceFn)) fail.push("portal-step-choice never writes kpi_config");
if (!/did not stick/.test(choiceFn)) fail.push("portal-step-choice does not read the flag back — a PATCH that matched no row returns success");
if (!/notify-rga/.test(choiceFn)) fail.push("portal-step-choice never notifies RGA");

// 4 ─ the pull is honest
const code = sync.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
if (/gbp_calls/.test(code)) fail.push("callrail-sync touches gbp_calls — that column is the Google listing metric, not tracked calls");
if (!/total_calls/.test(code)) fail.push("callrail-sync never writes total_calls");
if (!/indeterminate/.test(code)) fail.push("callrail-sync has no indeterminate path — it would write a 0 when it could not tell, and a 0 claims nobody rang");
if (!/did not save/.test(code)) fail.push("callrail-sync does not read its write back");

// 4b ─ every provider we OFFER must be one we can actually pull from
try {
  const req = createRequire(path.join(SITE, "package.json"));
  const provs = req("./netlify/functions/_call-providers.js");
  const named = provs.allProviders();
  if (!named.length) fail.push("no call-tracking providers are defined at all");
  for (const p of named) {
    const impl = provs.PROVIDERS[p.key];
    if (typeof impl?.fetchMonth !== "function") {
      fail.push(`${p.key} is listed as a provider but has no fetchMonth — we could not read a single call from it`);
    }
    if (!impl?.envKey || !impl?.envAccount) fail.push(`${p.key} declares no credentials to check for`);
  }
  console.log(`  providers: ${named.map((p) => `${p.label}${p.configured ? "" : " (no key yet)"}`).join(" · ")}`);
} catch (e) {
  fail.push(`cannot load the provider adapters: ${e.message}`);
}

// 4c ─ provisioning must refuse to give a second number to a client who already has one
{
  const pcode = prov.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (!/already_have/.test(pcode)) {
    fail.push("call-tracking-provision does not check the client's choice — it would create a SECOND number for a client who already pays for one, splitting their reporting and billing them twice");
  }
  if (!/already_provisioned/.test(pcode)) {
    fail.push("call-tracking-provision does not check for an existing company id — running it twice would create two numbers");
  }
  if (!/did NOT save to the client record/.test(pcode)) {
    fail.push("call-tracking-provision does not verify the id reached the client record — a number that exists at the provider but not on the client is invisible to the monthly pull");
  }
  if (!/requireWorkspaceForClientOrInternal/.test(pcode)) {
    fail.push("call-tracking-provision is not admin-gated — a client could spend money at our provider");
  }
}

// 4d ─ a provider that cannot swap numbers must be flagged as unattributed, and the client record
// must carry that fact — the portal is browser-side and cannot read the registry.
{
  const req2 = createRequire(path.join(SITE, "package.json"));
  const provs = req2("./netlify/functions/_call-providers.js");
  const quo = provs.PROVIDERS.quo;
  if (quo && quo.attributed !== false) {
    fail.push("Quo/OpenPhone is marked attributed — it has no number swapping, so it cannot tie a call to a search, and its calls would be reported as if search produced them");
  }
  const pcode2 = prov.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (!/call_tracking_attributed/.test(pcode2)) {
    fail.push("provisioning does not copy the attribution fact onto the client — the portal would label a phone system's calls as search-driven");
  }
  const portal = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8");
  if (!/call_tracking_attributed/.test(portal)) {
    fail.push("the portal ignores call_tracking_attributed — both kinds of provider would share one label");
  }
  if (!/Calls to your business line/.test(portal)) {
    fail.push("the unattributed tile label is gone — a phone system's total would read as tracked calls");
  }
}

// 4e ─ the pull must RUN ON ITS OWN. A sync nobody triggers leaves the tile showing whatever the
// last manual run left behind, and a client reads a stale number as this month's.
{
  const cron = fs.readFileSync(path.join(SITE, "netlify/functions/metrics-daily-refresh.js"), "utf8");
  if (!/call-tracking-sync/.test(cron)) {
    fail.push("the nightly refresh no longer calls call-tracking-sync — the pull would only ever run when someone remembered");
  }
  if (!/kpi_config\?\.call_tracking/.test(cron)) {
    fail.push("the nightly refresh does not filter on kpi_config.call_tracking — it would sync clients who never opted in");
  }
  // 🔑 It must walk the CLIENT list, not the Google-OAuth list: a client can have call tracking
  // without ever connecting Google.
  if (!/rest\/v1\/clients\?select=/.test(cron)) {
    fail.push("the nightly call sync reads the OAuth list rather than the client list — a client with tracking but no Google connection would be skipped");
  }
  // and the report must show it, labelled by what the provider can see
  const report = fs.readFileSync(path.join(SITE, "portal/report/report.js"), "utf8");
  if (!/total_calls/.test(report)) fail.push("the monthly report does not show tracked calls at all");
  if (!/call_tracking_attributed/.test(report)) {
    fail.push("the monthly report ignores call_tracking_attributed — a phone system's total would read as search-driven in the document the client judges the retainer by");
  }
}

// 5 ─ the step is runnable
if (!/"m1\.tracking\.call_setup":\s*async/.test(flow)) {
  fail.push("m1.tracking.call_setup has no executor — the admin Run button would fall through");
}

console.log(`  ${decisionSteps.length} decision step(s) · flag + notify + pull + executor checked`);
if (fail.length) {
  console.error(`\n✗ the call-tracking path has a hole — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  A card that asks a client to decide and drops the decision is worse than one that never asked.");
  process.exit(1);
}
console.log("  ✅ tap → flag → notify → pull → total_calls → tile, every link present");
process.exit(0);
