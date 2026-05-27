#!/usr/bin/env node
// scripts/scrub-legacy-emails.mjs
//
// Tier 1 follow-up (locked 2026-05-27). The placeholder-email filter in
// lib/email-validation.cjs shipped on 2026-05-22, but legacy leads scraped
// BEFORE that date weren't validated. Example: Air-Tech HVAC had
// `someone@example.com` saved in Airtable (scraped 2026-05-21) that kept
// getting follow-ups despite obviously being a placeholder — contributing
// to the 10.34% 7d bounce rate that suppressed the daily cap.
//
// This script:
//   1. Loads every Lead from Airtable
//   2. Runs each Email through lib/email-validation.cjs's sanitizeScrapedEmail
//   3. Any email the filter rejects → mark Suppressed=true + Email Status='invalid'
//      so it stops receiving outreach + never bounces again.
//
// Safe-by-default: dry-run mode is the default. Pass `--apply` to PATCH Airtable.
// Idempotent: re-running is a no-op once leads are suppressed.
//
// Usage:
//   node scripts/scrub-legacy-emails.mjs               # dry-run, list what would change
//   node scripts/scrub-legacy-emails.mjs --apply       # apply the changes

import "dotenv/config";
import { sanitizeScrapedEmail, RFC2606_DOMAIN_RE, STRICTLY_PLACEHOLDER_LOCAL_RE, PLACEHOLDER_EMAIL_RE } from "../lib/email-validation.cjs";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const TABLE = process.env.AIRTABLE_TABLE_NAME || "Leads";
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

async function paginate(formula = "") {
  let all = [];
  let offset = null;
  do {
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}?pageSize=100`;
    if (formula) url += `&filterByFormula=${encodeURIComponent(formula)}`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const d = await r.json();
    if (d.error) {
      console.error("Airtable error:", JSON.stringify(d.error));
      return all;
    }
    all = all.concat(d.records);
    offset = d.offset;
  } while (offset);
  return all;
}

async function batchPatch(records) {
  // Airtable PATCH supports up to 10 records per call.
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`;
    const r = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch }),
    });
    const d = await r.json();
    if (d.error) {
      console.warn("  PATCH batch failed:", JSON.stringify(d.error));
    }
  }
}

function classifyReason(email) {
  if (!email) return "empty";
  const lower = String(email).toLowerCase();
  if (RFC2606_DOMAIN_RE.test(lower)) return "RFC2606 reserved domain (example.com / test.org / etc)";
  const local = lower.split("@")[0] || "";
  if (STRICTLY_PLACEHOLDER_LOCAL_RE.test(local)) return `placeholder local-part "${local}"`;
  if (PLACEHOLDER_EMAIL_RE.test(lower)) return "generic placeholder pattern";
  // sanitizeScrapedEmail will reject for other reasons (invalid syntax, blocked TLD, etc.)
  return "rejected by sanitizeScrapedEmail (invalid / blocked)";
}

async function main() {
  console.log(`[scrub-legacy] mode=${APPLY ? "APPLY" : "DRY-RUN"} — loading leads…`);
  const leads = await paginate(`{Email}!=""`);
  console.log(`[scrub-legacy] scanning ${leads.length} leads with non-empty Email\n`);

  const toFix = [];
  for (const rec of leads) {
    const f = rec.fields || {};
    const email = String(f.Email || "");
    // Skip already-suppressed or terminal — no need to re-mark
    if (f.Suppressed) continue;
    if (["invalid", "bounced", "blocked", "unsubscribed", "no-replacement-found", "permanent-bounce"].includes(f["Email Status"])) continue;
    // Run through the validator; if sanitize returns empty string, it's a placeholder/junk
    const clean = sanitizeScrapedEmail(email);
    if (clean === email.trim().toLowerCase()) continue; // passes — keep
    const reason = classifyReason(email);
    toFix.push({ id: rec.id, name: f["Business Name"] || "(unknown)", email, reason });
  }

  console.log(`[scrub-legacy] found ${toFix.length} lead${toFix.length === 1 ? "" : "s"} with invalid/placeholder emails:`);
  for (const t of toFix.slice(0, 50)) {
    console.log(`  ${APPLY ? "PATCH" : "WOULD-PATCH"}  ${t.name} | ${t.email} | ${t.reason}`);
  }
  if (toFix.length > 50) console.log(`  …and ${toFix.length - 50} more`);

  if (toFix.length > 0 && APPLY) {
    const records = toFix.map((t) => ({
      id: t.id,
      fields: { Suppressed: true, "Email Status": "invalid" },
    }));
    await batchPatch(records);
    console.log(`\n[scrub-legacy] PATCHED ${records.length} lead${records.length === 1 ? "" : "s"} → Suppressed=true, Email Status='invalid'`);
  } else if (toFix.length === 0) {
    console.log("\n[scrub-legacy] no invalid emails found — base is already clean.");
  } else {
    console.log("\n[scrub-legacy] dry-run only. add --apply to actually patch Airtable.");
  }
}

main().catch((err) => {
  console.error("[scrub-legacy] fatal:", err.message || err);
  process.exit(1);
});
