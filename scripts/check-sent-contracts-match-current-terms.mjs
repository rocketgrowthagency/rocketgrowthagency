#!/usr/bin/env node
/**
 * check-sent-contracts-match-current-terms.mjs — a contract is frozen the moment it is generated.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. commit_3mo's agreement said "Client may not terminate during Months 1–3" on a plan
 * whose own subtitle is "(discounted, no lock-in)" and whose data is early_termination:"anytime".
 * Sections 3 and 11 were rewritten — but `contract_html` is STORED per contract at generation time.
 * Every already-sent, not-yet-signed agreement kept the old wording, and Chris signed one minutes
 * after the fix deployed.
 *
 * 🔑 Fixing the GENERATOR does not fix the contracts it already generated. They are documents, not
 * views: correcting the template changes what the next client signs, never what this one is looking
 * at right now.
 *
 * A stale unsigned contract is worse than a stale page — someone is about to put their name on it.
 *
 * WHAT IT CHECKS: every contract still in `sent` (unsigned) against wording the current generator
 * would never produce. Signed contracts are deliberately EXCLUDED: they are executed records and
 * must never be rewritten — if one is wrong the remedy is an amendment, not an UPDATE.
 *
 * Exit 0 = nothing stale is awaiting a signature · 1 = someone may sign old terms · 2 = unknown.
 */
import fs from "node:fs";
import path from "node:path";

const SCRAPER = "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

// Wording the CURRENT generator would never emit. Add a line whenever contract terms change.
const RETIRED = [
  [/may not terminate this Agreement during Months/i, "the lock-in clause removed 2026-09-10 (commit_3mo is cancel-anytime)"],
  [/Client commits to the full three-month term in exchange/i, "the 'commits to the full term' wording removed 2026-09-10"],
  [/\$1,500 one-time fee/i, "pre-discount Website Lite fee (now $750)"],
  [/\$3,500 one-time fee/i, "pre-discount Website Full fee (now $1,750)"],
];

console.log("── no unsigned contract is awaiting a signature on retired terms ──");

let env;
try { env = fs.readFileSync(path.join(SCRAPER, ".env"), "utf8"); }
catch { console.log("  ⚠️  no .env — cannot reach Supabase"); process.exit(2); }
const g = (n) => (env.match(new RegExp("^" + n + "=(.*)$", "m")) || [])[1]?.trim();
const URL = g("SUPABASE_URL");
const KEY = g("SUPABASE_SERVICE_ROLE_KEY") || g("SUPABASE_SERVICE_KEY");
if (!URL || !KEY) { console.log("  ⚠️  Supabase credentials missing"); process.exit(2); }

let rows;
try {
  const r = await fetch(`${URL}/rest/v1/client_contracts?status=eq.sent&select=id,client_id,tier,contract_html`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) { console.log(`  ⚠️  Supabase returned ${r.status}`); process.exit(2); }
  rows = await r.json();
} catch (e) { console.log(`  ⚠️  could not reach Supabase: ${e.message}`); process.exit(2); }
if (!Array.isArray(rows)) { console.log("  ⚠️  unexpected response shape"); process.exit(2); }

if (SABOTAGE) rows = [...rows, { id: "sab-0000", client_id: "sab", tier: "commit_3mo", contract_html: "<p>Client may not terminate this Agreement during Months 1-3.</p>" }];

const stale = [];
for (const c of rows) {
  for (const [re, why] of RETIRED) {
    if (re.test(String(c.contract_html || ""))) { stale.push({ id: c.id, tier: c.tier, why }); break; }
  }
}

console.log(`  ${rows.length} contract(s) sent and unsigned`);
if (!stale.length) {
  console.log("  ✅ none carry retired terms");
  console.log("\n✅ nobody is about to sign wording we no longer stand behind.");
  process.exit(0);
}
console.log(`\n  🔴 ${stale.length} unsigned contract(s) carry RETIRED terms:`);
stale.forEach((s) => console.log(`       ${String(s.id).slice(0, 8)}  ${s.tier}  — ${s.why}`));
console.log("\n     Void each one and re-send it. Regenerating is the ONLY fix: contract_html is");
console.log("     stored per contract, so correcting the generator does nothing for these.");
console.log("     🔴 Do NOT rewrite a SIGNED contract — that is an executed record. Amend instead.");
process.exit(1);
