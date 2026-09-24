#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-withdrawn-contract-is-not-offered.mjs
//
// 🔴 WHY (2026-09-24). RGA's own client portal was offering an agreement nobody meant to sell: an
// unsigned `commit_3mo` at $625/mo, generated 09-12 during testing and never withdrawn. It sat
// beside the signed `beta_unbilled` agreement, in a portal whose whole purpose is "here is your
// contract, sign it".
//
// Nothing was going to CHARGE on it — billing-daily-check, send-invoice-email and
// portal-payment-intent all filter `status=eq.signed`. But the client could have signed it.
//
// 🔑 The capability to withdraw already existed (the admin's Void button writes
// status="voided" + voided_at + voided_reason + an audit entry). The failure was that nothing
// enforced the other half: that a withdrawn contract STOPS BEING OFFERED, and that the portal's
// allow-list of statuses cannot quietly widen to include one.
// → feedback_what_you_create_you_must_be_able_to_withdraw
//
// WHAT THIS CHECKS
//   1. the portal's contract query is an ALLOW-LIST of statuses, never a blocklist and never "all"
//   2. that allow-list contains only statuses a client should be able to act on (sent, signed)
//   3. the void path still writes a real withdrawal — status, timestamp, reason AND an audit entry
//   4. live: no client is currently being offered a voided contract
//
// exit 0 = a withdrawn contract is not offered · 1 = it is · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const PORTAL_FN = path.join(SITE, "netlify", "functions", "portal-get-contracts.js");
const ADMIN = path.join(SITE, "admin", "admin.js");

const indeterminate = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
for (const f of [PORTAL_FN, ADMIN]) if (!fs.existsSync(f)) indeterminate(`${path.basename(f)} not found.`);

const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const portal = strip(fs.readFileSync(PORTAL_FN, "utf8"));
const admin = strip(fs.readFileSync(ADMIN, "utf8"));
const problems = [];

// A client may only ever act on a contract that is on offer or already agreed.
const CLIENT_SAFE = new Set(["sent", "signed"]);

// ── 1 + 2. the portal query ───────────────────────────────────────────────────────────────────
{
  const q = portal.match(/client_contracts\?[^`"']*/);
  if (!q) {
    indeterminate("could not find the client_contracts query in portal-get-contracts.js.");
  }
  const query = q[0];
  const allow = query.match(/status=in\.\(([^)]*)\)/);
  const eq = query.match(/status=eq\.([a-z_]+)/);
  if (!allow && !eq) {
    problems.push(`portal-get-contracts does not filter contracts by status at all, so every row — `
      + `including VOIDED ones and drafts — is returned to the client as a contract. The withdrawal `
      + `is written but never honoured.`);
  } else {
    const statuses = allow ? allow[1].split(",").map((s) => s.trim().replace(/['"]/g, "")) : [eq[1]];
    for (const s of statuses) {
      if (!CLIENT_SAFE.has(s)) {
        problems.push(`portal-get-contracts offers contracts with status "${s}" to the client. Only `
          + `${[...CLIENT_SAFE].join(" / ")} are safe — anything else (voided, draft) is either `
          + `withdrawn or not yet an offer, and the portal presents it as signable.`);
      }
    }
    if (/status=not\.|neq\./.test(query)) {
      problems.push(`portal-get-contracts uses a BLOCKLIST for contract status. A new status added `
        + `later is then offered to clients by default. Allow-list only.`);
    }
  }
}

// ── 3. the void path still performs a real withdrawal ─────────────────────────────────────────
{
  const at = admin.indexOf('action === "void"');
  if (at < 0) {
    problems.push(`The admin has no "void" action. A contract can be generated and sent with no way `
      + `to take it back — what you can create you must be able to withdraw.`);
  } else {
    // 🔴 SCOPE IT TO THE UPDATE, NOT A WINDOW. A 1200-character slice from `action === "void"` runs
    // straight into the `action === "audit"` branch below it, which also mentions `audit_log` — so
    // deleting the void's own audit entry still "passed". Caught by mutation-testing this gate.
    // → feedback_a_gate_window_measured_in_characters_will_lie
    const upd = admin.slice(at).match(/\.update\(\s*\{[\s\S]*?\}\s*\)/);
    const blk = upd ? upd[0] : "";
    if (!blk) problems.push(`The void action does not call .update() — nothing is written, so a `
      + `contract cannot actually be withdrawn.`);
    for (const [needle, why] of [
      [/status:\s*["']voided["']/, `it does not set status to "voided", so the portal keeps offering it`],
      [/voided_at/, `it records no timestamp, so nothing can say when it was withdrawn`],
      [/voided_reason/, `it records no reason, so the audit trail cannot explain the withdrawal`],
      [/audit_log/, `it appends no audit entry, and a contract's history is the point of the audit log`],
    ]) {
      if (!needle.test(blk)) problems.push(`The void action is incomplete: ${why}.`);
    }
  }
}

// ── 4. live: nobody is being offered a withdrawn contract ─────────────────────────────────────
let liveNote = "", checked = 0;
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) liveNote = "no Supabase credentials";
else {
  try {
    const r = await fetch(`${U}/rest/v1/client_contracts?select=id,client_id,tier,status,voided_at&limit=500`,
      { headers: { apikey: K, Authorization: `Bearer ${K}` } });
    const rows = r.ok ? await r.json() : null;
    if (!Array.isArray(rows)) liveNote = "could not read client_contracts";
    else {
      checked = rows.length;
      for (const c of rows) {
        // withdrawn but still wearing a status the portal offers
        if (c.voided_at && CLIENT_SAFE.has(String(c.status))) {
          problems.push(`LIVE — contract ${String(c.id).slice(0, 8)} (${c.tier}) was VOIDED at `
            + `${String(c.voided_at).slice(0, 10)} but still has status "${c.status}", so the portal `
            + `is offering a withdrawn agreement as signable.`);
        }
      }
    }
  } catch { liveNote = "could not reach Supabase"; }
}

if (problems.length) {
  console.error("🔴 A WITHDRAWN CONTRACT IS STILL BEING OFFERED\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  netlify/functions/portal-get-contracts.js · admin/admin.js (the void action)");
  process.exit(1);
}

console.log("✅ a withdrawn contract is not offered");
console.log("   the portal allow-lists contract status (sent/signed only, never a blocklist)");
console.log("   the void action writes status, timestamp, reason and an audit entry");
console.log(checked ? `   live: ${checked} contract(s) checked, none voided-but-still-offered`
  : `   ⚠️  live half did not run — ${liveNote}`);
