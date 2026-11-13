#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-company-numbers-skip-test-clients.mjs
//
// 🔒 WHY (Chris's 11-13 screenshot of the admin Dashboard): "Active clients 3", "In monthly cycle 2", the funnel's "Clients 3" and
// "Client portals live 1 of 3" counted the acceptance walk's TEST records (Lone Star `source=test:acceptance-walk-new-client`,
// Granite State `test:acceptance-walk-month2`) as clients. With Los Angeles Landscape Co added the company would read 4 clients for 2
// real ones. The scheduled jobs already skip test records (`source.not.like.test:*`); the company numbers did not. This holds:
//   1. the REAL shared/metrics.js isActiveClient / isTestClient / mrrOf on rows shaped like the live ones (and edge cases);
//   2. every company-wide count in admin.js (Dashboard live list + portal logins, the KPI row, the Pipeline header, the averages)
//      goes through isTestClient.
// exit 0 = the company's numbers count only real clients · 1 = a test record can be counted · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let M, A;
try { M = createRequire(import.meta.url)(`${SITE}/shared/metrics.js`); A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
catch (e) { console.error(`⚠️  INDETERMINATE — cannot load metrics.js / admin.js: ${e.message}`); process.exit(2); }
if (typeof M.isActiveClient !== "function" || typeof M.isTestClient !== "function" || typeof M.mrrOf !== "function") { console.error("⚠️  INDETERMINATE — metrics.js no longer exports isActiveClient / isTestClient / mrrOf"); process.exit(2); }
const F = [];

// 1. the rule, on real-shaped rows
const RGA = { id: "r", status: "active", source: "manual_admin", client_portal_stage: "stage_5_monthly" };
const LA = { id: "la", status: "onboarding", source: null, client_portal_stage: "stage_1_contract" };   // a real client, no source
const LONE = { id: "ls", status: "onboarding", source: "test:acceptance-walk-new-client" };
const GRAN = { id: "gs", status: "active", source: "test:acceptance-walk-month2" };
const CASES = [
  [RGA, true, "RGA (manual_admin)"], [LA, true, "a real client with no source"], [LONE, false, "Lone Star (test:)"], [GRAN, false, "Granite State (test:)"],
  [{ status: "active", source: "contest:import" }, true, "a source that merely CONTAINS test"], [{ status: "active", source: "TEST:x" }, true, "TEST: in capitals is not the marker the jobs use"],
  [{ status: "active", source: "test:x", archived_at: "2026-01-01" }, false, "an archived test record"], [null, false, "no row"],
];
for (const [c, want, name] of CASES) if (M.isActiveClient(c) !== want) F.push(`isActiveClient(${name}) is ${!want}, want ${want}`);
const mrr = M.mrrOf([{ client: RGA, subscription: { monthly_price: 0, status: "active" } }, { client: GRAN, subscription: { monthly_price: 900, status: "active" } }]);
if (mrr.total !== 0) F.push(`a test record's $900 subscription reaches MRR (total ${mrr.total})`);
if (!/not a test record/.test(String((M.DEFS || {}).activeClients || ""))) F.push("the on-screen definition of Active clients doesn't say test records are left out");

// 2. every company-wide count in admin.js uses it
const need = [
  [/const live = clients\.filter\(\(c\) => !isTerm\(c\) && !isArchived\(c\) && !globalThis\.rgaMetrics\.isTestClient\(c\)\);/, "the Dashboard's live list (Clients, Monthly cycle, In onboarding) counts test records"],
  [/const testIds = new Set\(clients\.filter\(\(c\) => globalThis\.rgaMetrics\.isTestClient\(c\)\)\.map\(\(c\) => c\.id\)\);\n\s*const accounts = \(state\.portalAccounts \|\| \[\]\)\.filter\(\(a\) => !testIds\.has\(/, "the Dashboard's \"Client portals live\" counts a test record's login"],
  [/const liveForKpi = clients\.filter\(\(c\) => !c\.archived_at && !M8\.isTestClient\(c\)\);/, "the Pipeline header's onboarding count includes test records"],
];
for (const [re, msg] of need) if (!re.test(A)) F.push(msg);
const loops = (A.match(/\(clients\.filter\(\(c\) => !c\.archived_at\)\)\.forEach/g) || []).length;
if (loops) F.push(`${loops} company average loop(s) still take every non-archived client, test records included`);
if ((A.match(/\(clients\.filter\(\(c\) => !c\.archived_at && !M8\.isTestClient\(c\)\)\)\.forEach/g) || []).length < 2) F.push("the rank / top-3 averages no longer leave test records out");

if (F.length) { console.log(`❌ THE COMPANY'S NUMBERS CAN COUNT A TEST RECORD (${F.length}):`); for (const x of F) console.log("   • " + x); process.exit(1); }
console.log(`✅ the company's numbers count only real clients: the one rule on ${CASES.length} rows + MRR, and every company-wide count in admin goes through it`);
process.exit(0);
