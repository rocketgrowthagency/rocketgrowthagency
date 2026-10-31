#!/usr/bin/env node
// check-monthly-asks.mjs — 2026-10-20, approved monthly_asks_v1 (final review R6). Monthly steps 16–20: ask less, never stall.
// RUNS the portal's list rule + quarter maths + script parse on fakes, and pins:
//   16 list     — a cadence the client picks (weekly / 2 weeks / monthly, owner only, read back); done = EVERYONE on this
//                 period's list asked (or asked not to be), never "a list arrived"; a cell OR an email per customer
//   17 numbers  — every 3 months, two fields, "Not sure" stored as not_sure (never 0); not due outside a quarter's first month;
//                 the monthly report no longer waits on them; numbers a client saved before still show
//   18 photos   — a suggestion: counted ON GOOGLE, no 5-a-month quota
//   19 video    — optional + quarterly; RGA's script shows above the link (or "RGA writes it first")
//   20 call     — report first, RGA emails times; next month never waits on the call; the SQL file for in-portal booking exists
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const read = (p) => { try { return fs.readFileSync(p.startsWith("/") ? p : `${SITE}/${p}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), PB = JSON.parse(read("data/playbooks/playbooks.json")), M2 = read(`${SCR}/flow/playbooks/month2plus.mjs`);
const CAD = read("netlify/functions/portal-review-cadence.js"), INP = read("netlify/functions/portal-step-input.js");
const F = [], fail = (m) => F.push(m);
const A = Object.fromEntries([...PB.month1, ...PB.month2plus].map((s) => [s.id, s]));
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
const block = (start) => { const a = P.indexOf(start); if (a < 0) { console.error(`⚠️  ${start.slice(0, 30)} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", a); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(a, i + 2); } } };
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), Date, Number, String, Array, Math });
vm.runInContext(block("const CADENCE = {").replace(/^const /, "var ") + "\n" + lift("periodListDone") + "\n" + lift("nextQuarterStart") + "\n" + lift("m2VideoScriptHtml"), ctx);
const run = (expr, vars = {}) => { Object.assign(ctx, vars); return vm.runInContext(expr, ctx); };
// ── 16
const NOW = Date.parse("2026-10-20T12:00:00Z"), ago = (d) => new Date(NOW - d * 86400000).toISOString();
const L = (d, cs) => ({ created_at: ago(d), customers: cs });
const cases = [["none", [], "weekly", false], ["all asked this week", [L(2, [{ marked_sent_by_client: true }, { stopped: true }])], "weekly", true],
  ["a list, nobody asked", [L(2, [{}, {}])], "weekly", false], ["asked, but 10 days ago, weekly", [L(10, [{ marked_sent_by_client: true }])], "weekly", false],
  ["asked 10 days ago, every 2 weeks", [L(10, [{ marked_sent_by_client: true }])], "biweekly", true], ["newest list half asked", [L(1, [{ marked_sent_by_client: true }, {}]), L(5, [{ marked_sent_by_client: true }])], "weekly", false]];
for (const [name, lists, cad, want] of cases) if (run("periodListDone(__l, __c, __n)", { __l: lists, __c: cad, __n: NOW }) !== want) fail(`step 16: "${name}" → ${!want}, want ${want}`);
if (!/requirePortalOwner\(event, clientId\)/.test(CAD) || !/review_cadence\.at !== at\) return json\(500/.test(CAD) || !/const CADENCES = \["weekly", "biweekly", "monthly"\];/.test(CAD)) fail("step 16: the cadence isn't the client's own, isn't read back, or accepts other values");
if (!/const hasRecentCustomerList = periodListDone\(customerLists, _reviewCadence\.get\(clientId\)\);/.test(P)) fail("step 16: the row's done rule isn't \"everyone on this period's list asked\"");
if (!/const second = parts\[1\] \|\| "", isMail = \/@\/\.test\(second\);/.test(P)) fail("step 16: the paste only takes a phone, not an email");
if (!/Ask every customer from the period, not only the happy ones/.test(P)) fail("step 16: the card dropped the ask-everyone line (review gating)");
// ── 17
const b = A["m2.snap.business_outcomes"] || {};
const keys = (b.clientInput?.fields || []).map((f) => f.key);
if (!b.clientQuarterly || keys.join() !== "jobs_from_leads,avg_job_value" || !(b.clientInput.fields || []).every((f) => f.allowNotSure)) fail("step 17: the numbers aren't two quarterly fields that allow Not sure");
if ((A["m2.report.generate"]?.dependsOn || []).includes("m2.snap.business_outcomes") || /id: "m2\.report\.generate"[^\n]*\n\s*type: "[a-z]+", dependsOn: \[[^\]]*"m2\.snap\.business_outcomes"/.test(M2)) fail("step 17: the monthly report waits on the client's numbers again");
if (!/if \(f\.allowNotSure && notSure\.includes\(f\.key\)\) \{ out\.not_sure = /.test(INP)) fail("step 17: Not sure isn't stored as an answer (it could read as 0)");
for (const [iso, want] of [["2026-10-20T12:00:00Z", "2027-01-01"], ["2026-12-31T12:00:00Z", "2027-01-01"], ["2026-01-15T12:00:00Z", "2026-04-01"], ["2026-03-31T12:00:00Z", "2026-04-01"]])
  if (run("nextQuarterStart(new Date(__d))", { __d: iso }).slice(0, 10) !== want) fail(`step 17: the next quarter after ${iso.slice(0, 10)} isn't ${want}`);
if (!/s\.clientQuarterly && status !== "done" && !\[0, 3, 6, 9\]\.includes\(new Date\(\)\.getUTCMonth\(\)\)/.test(P) || !/notDue && !isDone \? \{ text: "Every 3 months"/.test(P)) fail("step 17: a quarterly step reads due outside a quarter's first month");
// 🔒 EVERY place that draws the numbers keeps them (10-30: the Ongoing card became a second one; "appears somewhere" passed with either dropped)
const legacyOf = (re) => (P.match(re) || []).length;
if (!legacyOf(/const LEGACY = \[\{ key: "enquiries"/g) || legacyOf(/const all = \[\.\.\.fields, \.\.\.LEGACY\.filter\(/g) !== legacyOf(/const LEGACY = \[\{ key: "enquiries"/g)) fail("step 17: numbers a client saved in the old monthly fields stop showing");
// ── 18
const g = A["m2.exec.gbp_photos"] || {};
if (!g.clientOptional || !/photosOnGoogleThisMonth >= 1\) status = "done"/.test(P) || /photosThisMonth >= 5\) status = "done"/.test(P)) fail("step 18: monthly photos are a 5-a-month quota again, or count uploads");
// ── 19
const y = A["m2.exec.youtube_video"] || {};
if (!y.clientOptional || !y.clientQuarterly) fail("step 19: the video isn't optional + quarterly");
const sc = run("m2VideoScriptHtml(__t)", { __t: { summary: "KIT 1\n**TITLE:** Before you call a plumber\nDESCRIPTION: d\nHOOK: Water on the floor?\nSCRIPT: Turn off the valve first.\nCTA: Call\n" } });
if (!/Before you call a plumber/.test(sc) || !/Turn off the valve first\./.test(sc) || /<p>d<\/p>/.test(sc)) fail("step 19: RGA's script isn't shown right (DESCRIPTION read as the script?)");
if (!/RGA writes your script first/.test(run("m2VideoScriptHtml(__t)", { __t: {} }))) fail("step 19: with no script yet the card shows an empty box instead of saying RGA writes it first");
// ── 20
if ((A["m2.handoff.next_month"]?.dependsOn || []).includes("m2.call.monthly") || /id: "m2\.handoff\.next_month"[^\n]*\n\s*type: "[a-z]+", dependsOn: \[[^\]]*"m2\.call\.monthly"/.test(M2)) fail("step 20: next month waits on the call again");
if (/We'll book this with you each month/.test(JSON.stringify(A["m2.call.monthly"] || {}))) fail("step 20: the card promises a booking that nothing does");
if (!fs.existsSync(`${SITE}/docs/supabase/RGA_SLOT_HOLD_PURPOSE_M2_2026-10-20.sql`) || !/'m2_monthly'/.test(read("docs/supabase/RGA_SLOT_HOLD_PURPOSE_M2_2026-10-20.sql"))) fail("step 20: the SQL file for the monthly booking is gone");
// 🔒 ready_to_sell_plan_v1 D5 (10-21): the client picks the time in the portal once the report is out; row 26 shows "report
// first" until then, and the client's request (Confirm / Decline) after — never "email times" by hand
if (!/title: "The client picks a call time once this month's report is out"/.test(ADM) || !/: closeoutAdminHtml\("m2_monthly"\)/.test(ADM)) fail("step 20: admin row 26 doesn't say report first, then the client's request");
if (F.length) { console.error("🔴 Monthly (steps 16–20) regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Monthly holds: list cadence (client's, read back) + done = everyone asked + cell or email · numbers quarterly, Not sure stored, never block the report, old numbers kept · photos a suggestion counted on Google · video optional + quarterly with RGA's script · call = report first, RGA emails times, next month never waits, SQL file ready");
