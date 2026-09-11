#!/usr/bin/env node
/**
 * check-invoice-dates-are-business-time.mjs — two copies of one invoice must never disagree.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. Chris paid at 5:28 PM Pacific. The emailed receipt said:
 *
 *     PAID September 11, 2026
 *
 * for a payment made on the 10th — because 00:28 UTC is already tomorrow, and the email is rendered
 * inside a Netlify function whose clock is UTC. The portal, rendered in his browser, said
 * September 10. Same invoice, same instant, two different dates depending on where you read it.
 *
 * 🔑 A receipt dated tomorrow is wrong in a way that matters: it is the document a client hands to
 * their accountant. And a document that changes meaning based on the reader's timezone is not a
 * record. The invoice is RGA's document, so it speaks in RGA's time.
 *
 * THE TEST: render the same invoice under several TZ settings and assert the output is IDENTICAL.
 * That is the property — not "the code contains a timeZone option", which is what a grep would
 * check and what a refactor would quietly break.
 *
 * Exit 0 = every zone renders the same dates · 1 = the document drifts · 2 = could not tell.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── the invoice renders the same dates in every timezone ──");

const DOC = path.join(SITE, "shared/invoice-doc.js");
if (!fs.existsSync(DOC)) { console.log(`  ⚠️  missing: ${DOC}`); process.exit(2); }

// 5:28 PM Pacific on Sep 10 == 00:28 UTC on Sep 11 — the exact instant that produced the bug.
const PAID_AT = "2026-09-11T00:28:36.124Z";
const ZONES = ["UTC", "America/Los_Angeles", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"];

const RENDER = `
  const plans = require(${JSON.stringify(path.join(SITE, "data/plans.json"))});
  import(${JSON.stringify(DOC)}).then((m) => {
    const html = m.buildInvoiceDoc({
      tier: "commit_3mo", invoiceNum: 1, plans, addons: {},
      businessName: "T", contactName: "T", contactEmail: "t@t.t",
      contractId: "6c32e26f-0000-0000-0000-000000000000",
      issuedAt: ${JSON.stringify(PAID_AT)}, paidAt: ${JSON.stringify(PAID_AT)},
      dueDate: "2026-10-11", status: "paid", mode: "email",
    });
    const issued = (html.match(/Issued ([A-Z][a-z]+ \\d+, \\d{4})/) || [])[1] || "?";
    const paid   = (html.match(/PAID ([A-Z][a-z]+ \\d+, \\d{4})/) || [])[1] || "?";
    process.stdout.write(JSON.stringify({ issued, paid }));
  }).catch((e) => { process.stdout.write(JSON.stringify({ error: e.message })); });
`;

// Sabotage: strip the explicit timeZone so the runtime's zone decides again.
let restore = null;
if (SABOTAGE) {
  const src = fs.readFileSync(DOC, "utf8");
  const patched = src.replace(/year: "numeric", month: "long", day: "numeric", timeZone: BUSINESS_TZ,/,
                              'year: "numeric", month: "long", day: "numeric",');
  if (patched === src) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
  restore = src;
  fs.writeFileSync(DOC, patched);
}

const results = {};
let failed = false;
try {
  for (const tz of ZONES) {
    let out;
    try {
      out = execFileSync(process.execPath, ["-e", RENDER], {
        encoding: "utf8", env: { ...process.env, TZ: tz }, stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (e) { console.log(`  ⚠️  render failed under TZ=${tz}: ${e.message}`); process.exit(2); }
    let parsed;
    try { parsed = JSON.parse(out); } catch { console.log(`  ⚠️  unparseable output under TZ=${tz}`); process.exit(2); }
    if (parsed.error) { console.log(`  ⚠️  ${tz}: ${parsed.error}`); process.exit(2); }
    results[tz] = parsed;
  }
} finally {
  if (restore !== null) fs.writeFileSync(DOC, restore);
}

const ref = results[ZONES[0]];
for (const tz of ZONES) {
  const r = results[tz];
  const same = r.issued === ref.issued && r.paid === ref.paid;
  if (!same) failed = true;
  console.log(`  ${same ? "✅" : "🔴"} TZ=${tz.padEnd(22)} issued ${r.issued} · PAID ${r.paid}`);
}

// And it must be the BUSINESS date, not merely a consistent one — pinning to UTC would be stable
// and still print tomorrow's date on a 5 PM Pacific payment.
if (!failed && ref.paid !== "September 10, 2026") {
  console.log(`\n  🔴 stable, but wrong: a 5:28 PM Pacific payment renders as "${ref.paid}".`);
  console.log("     The document must speak in RGA's business timezone (America/Los_Angeles).");
  failed = true;
}

if (failed) {
  console.log("\n🔴 The same invoice reads differently depending on where it is rendered.");
  console.log("   The emailed copy comes from a UTC Netlify function; the portal copy from a browser.");
  process.exit(1);
}
console.log(`\n✅ all ${ZONES.length} zones agree, and on RGA's own business date.`);
process.exit(0);
