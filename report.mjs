#!/usr/bin/env node
// Generate + publish a monthly client report.
// Pulls all data from Supabase, renders HTML, saves locally, AND inserts into client_portal_content.
//
// Usage:
//   node report.mjs <client_id>                              # current month
//   node report.mjs <client_id> --month=2026-04              # specific month (YYYY-MM)
//   node report.mjs <client_id> --month=2026-04 --no-publish # local only, don't push to portal

import { saveAndPublishReport } from "./lib/report-generator.mjs";

const args = process.argv.slice(2);
const clientId = args[0];
if (!clientId) { console.error("Usage: node report.mjs <client_id> [--month=YYYY-MM] [--no-publish]"); process.exit(1); }

const monthArg = args.find((a) => a.startsWith("--month="))?.slice(8);
const reportingMonth = monthArg ? `${monthArg}-01` : null;
const publish = !args.includes("--no-publish");

const { filePath, summary, portalRow } = await saveAndPublishReport(clientId, { reportingMonth, publish });

console.log(`\n✓ Report generated: ${filePath}`);
console.log(`  Open in browser: file://${process.cwd()}/${filePath.replace(/^\.\//, "")}`);
console.log(`  Client: ${summary.business_name}`);
console.log(`  Period: ${summary.reporting_month}`);
console.log(`  Stats: ${summary.tasks_done} tasks done, ${summary.new_reviews} new reviews, ${summary.rankings_count} keywords tracked`);
if (publish) {
  console.log(`\n✓ Published to client portal (id: ${portalRow?.id})`);
} else {
  console.log(`\n(--no-publish: did not push to client portal)`);
}
