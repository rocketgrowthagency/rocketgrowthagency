#!/usr/bin/env node
// check-one-leads-formula.mjs — LEADS AND WHAT THEY ARE WORTH ARE COUNTED ONE WAY, EVERYWHERE (master audit #8, the owner 11-11 "do all recommended").
//
// 🔴 WHY. Audit #8 found the same month's Leads computed FOUR ways: the portal (null unless both pieces were known), the report page ((forms||0)+(calls||0), a partial
// total), the admin's "Total leads" (the stored total_leads column, whose rows before 10-31 hold Google's call-button taps) and the monthly tiles. And it added a
// 28-day form count to a calendar-month call count and labelled the sum "this month". Lead value had two formulas from two sets of inputs: a client who filled one
// set saw a value on one screen and "Not shown" on the other.
//
// THE RULE (shared/metrics.js):
//   leadsOf(rec, client)       forms + tracked calls over the SAME window (the calendar month; data.ga4.forms_window === "month"). Forms only when the client's calls are
//                              not leads (call_tracking_attributed false, or call tracking turned off). Anything unknown is null WITH a reason, never 0, never partial.
//                              Never Google's taps, never the stored total_leads column.
//   leadValueOf(rec, client)   leads x (close rate / 10) x customer value. Inputs: the CLIENT ROW first (canonical: the Customer Value tab), the MONTH ROW as the
//                              fallback, a close rate MEASURED from 2+ months of real closed jobs over both.
// WHAT IT HOLDS:
//   A. STATIC: every surface that shows leads or their value calls the one function (portal tiles, KPI Snapshot, report page, admin KPI grid + Customer Value,
//      the client monthly tiles, the email builder, the stored column's writer); no partial-total pattern ((forms || 0) + ...); no reader of the stored total_leads;
//      no second lead-value formula (rate / 100 * worth, closeRate x customerValue) outside shared/metrics.js; the form count is the calendar month and a click is
//      not a submission; Organic sessions are GA4's Organic Search channel only.
//   B. RUN: shared/metrics.js against fixtures (any trade, any phone setup, recurring and one-off customers), then the portal's portalMonthLeads, the report's
//      countLeads and shared/client-monthly's monthTiles are lifted/loaded and must give the SAME answer as leadsOf for every fixture; _metrics.js's form and
//      organic rules are run on event and channel names.
//   C. SELF-PROOF: the static checker MUST fail on the website before this build (BEFORE_REV, or --against=<rev>). A mutation copy has no git: there the suite is the proof.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BEFORE_REV = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10) || "0033ac30";
const F = [], fail = (m) => F.push(m);
const indet = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const FILES = { portal: "portal/portal.js", report: "portal/report/report.js", admin: "admin/admin.js", metrics: "shared/metrics.js", monthly: "shared/client-monthly.js",
  mail: "netlify/functions/send-monthly-report.js", pull: "netlify/functions/_metrics.js" };
const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([;,{}()\]`"'])\s*\/\/ .*$/gm, "$1");
function readAt(rev) {
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) {
    try { out[k] = rev ? execFileSync("git", ["-C", SITE, "show", `${rev}:${rel}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }) : fs.readFileSync(path.join(SITE, rel), "utf8"); }
    catch { out[k] = null; }
  }
  return out;
}
function fnBody(src, name) {
  const m = new RegExp(`(^|\\n)(async\\s+)?function\\s+${name}\\s*\\(`).exec(src || "");
  if (!m) return "";
  const start = m.index + m[1].length, end = src.indexOf("\n}\n", start);
  return end < 0 ? "" : src.slice(start, end + 2);
}
/** A function declared inside another (indented `function name(`): from its line to the first line that closes at the same indent. */
function innerFn(src, name) {
  const m = new RegExp(`\\n([ \\t]+)function\\s+${name}\\s*\\(`).exec(src || "");
  if (!m) return "";
  const start = m.index + 1, end = src.indexOf(`\n${m[1]}}\n`, start);
  return end < 0 ? "" : src.slice(start, end + m[1].length + 3);
}

function sourceFailures(S) {
  const out = [], need = (c, m) => { if (!c) out.push(`MISSING: ${m}`); }, gone = (c, m) => { if (c) out.push(`STILL THERE: ${m}`); };
  const p = strip(S.portal), r = strip(S.report), a = strip(S.admin), mt = strip(S.metrics), cm = strip(S.monthly), ml = strip(S.mail), pu = strip(S.pull);
  need(!!S.metrics && /function leadsOf\(/.test(mt) && /function leadValueOf\(/.test(mt) && /windows_differ/.test(mt), "shared/metrics.js with leadsOf (refusing two windows) and leadValueOf");
  // every surface calls the one function
  need(/rgaMetrics\.leadsOf\(rec, client\)\.value/.test(fnBody(p, "portalMonthLeads")), "portal portalMonthLeads is the shared leadsOf");
  need(/MET\(\)\.leadValueOf\(cur, client, months\)/.test(fnBody(p, "caAnalyticsBody")) && /MET\(\)\.leadsOf\(cur, client\)/.test(fnBody(p, "caAnalyticsBody")), "portal Leads & return: leadsOf + leadValueOf");
  need(/M\.leadsOf\(current, kpiClient\)/.test(fnBody(p, "buildKpiSnapshotHtml")), "portal KPI Snapshot: leadsOf");
  need(/M\(\)\.leadsOf\(current, client\)/.test(fnBody(r, "countLeads")) && /M\(\)\.leadsOf\(r, client\)/.test(fnBody(r, "leadsHistorySection")) && /M\(\)\.leadsOf\(current, client\)/.test(fnBody(r, "monthInOneLine")), "report page: countLeads, the 12-month line and the month in one line all use leadsOf");
  need(/M\(\)\.leadValueOf\(current, client, series\)/.test(fnBody(r, "valueSection")), "report page Pipeline value: leadValueOf");
  need(/M\.leadsOf\(cur, state\.selectedClient\)/.test(fnBody(a, "renderKpiHeadline")), "admin KPI grid Leads: leadsOf");
  need(/rgaMetrics\.leadsOf\(cur, client\)/.test(fnBody(a, "refreshCustomerValueDerived")) && /closeRateOf\(/.test(fnBody(a, "renderCustomerValueMeasured")), "admin Customer Value: leadsOf + closeRateOf");
  need(/Met\(\)\.leadsOf\(/.test(innerFn(cm, "monthTiles")), "client monthly tiles: leadsOf");
  need(/leadsOf\(/.test(ml), "the email builder (send-monthly-report): leadsOf");
  need(/METRICS\.leadsOf\(/.test(pu), "the stored total_leads is written from leadsOf (_metrics.js)");
  // no partial total, no stored column read, no second value formula
  for (const [k, src] of [["portal.js", p], ["report.js", r], ["admin.js", a], ["client-monthly.js", cm], ["send-monthly-report.js", ml]]) {
    gone(/\(\s*forms\s*\|\|\s*0\s*\)\s*\+\s*\(\s*calls\s*\|\|\s*0\s*\)/.test(src), `a partial leads total ((forms || 0) + (calls || 0)) in ${k}`);
    gone(/expect\.reduce\(\(n, k\) => n \+ num\(L\[k\]\)/.test(src), `a second leads sum in ${k} (monthTiles)`);
  }
  for (const [k, src] of [["portal.js", p], ["report.js", r], ["admin.js", a]]) gone(/\.total_leads\b/.test(src), `${k} reads the stored total_leads (rows before 10-31 hold Google taps)`);
  gone(/ga4\.formSubmissions \+ trackedCalls/.test(pu), "_metrics.js writes total_leads as forms + a 0 standing in for unknown calls");
  gone(/leads \* \(rate \/ 100\) \* worth/.test(r), "report page: a second lead-value formula (lead_to_customer_rate %)");
  gone(/leads \* \(closeRate \/ 10\) \* customerValue/.test(p), "portal: its own lead-value formula");
  gone(/Number\(r\.total_leads\)/.test(a), "admin Customer Value reads total_leads");
  // the pieces are what their names say
  need(/const ORGANIC_SEARCH = \/\^organic search\$\/i;/.test(pu) && /ORGANIC_SEARCH\.test\(channel\)/.test(pu), "Organic sessions count GA4's Organic Search channel only");
  gone(/\/organic\/i\.test\(channel\)/.test(pu), "/organic/i (also counts Organic Social, Video and Shopping)");
  need(/const NOT_A_SUBMISSION = \/\(start\|click\|view\|open/.test(pu) && /isFormSubmission\(name\)/.test(pu), "a form count excludes clicks, views, opens and starts");
  need(/ga4FormSubmissions\(url, accessToken, formsMonth \|\| startDate, "today"\)/.test(pu) && /forms_window: "month"/.test(pu), "the form count is the calendar month (forms_window month)");
  gone(/from organic search/.test(p), 'portal says form submissions come "from organic search" (they are every channel)');
  return out;
}

const NOW = readAt(null);
if (!NOW.portal || !NOW.report || !NOW.admin) indet(`could not read the website at ${SITE}`);
sourceFailures(NOW).forEach(fail);
let selfProof = "skipped (no git here: a mutation copy)";
{
  const before = readAt(BEFORE_REV);
  if (before.portal && before.report && before.admin) {
    const bf = sourceFailures(before);
    if (bf.length < 8) { console.error(`⚠️  the checker finds only ${bf.length} problems on ${BEFORE_REV} (before the build): it can't tell the old code from the new`); process.exit(2); }
    selfProof = `fails on ${BEFORE_REV} with ${bf.length} problems`;
  }
}

// ───────────────────────── B · run it ─────────────────────────
const req = createRequire(path.join(SITE, "x.js"));
let M = null;
try { M = req("./shared/metrics.js"); } catch (e) { fail(`MISSING: shared/metrics.js can't be loaded (${e.message})`); }
if (M) {
  const ok = (c, m) => { if (!c) fail(`RUN: ${m}`); };
  const MONTH = "2026-10-01", W = { ga4: { forms_window: "month", forms_month: MONTH } };
  const row = (o) => ({ reporting_month: MONTH, data: W, ...o });
  const CLIENTS = { tracked: { kpi_config: { call_tracking: true } }, none: {}, line: { call_tracking_attributed: false }, off: { kpi_config: { call_tracking: false } } };
  // [name, rec, client, expected value]
  const CASES = [
    ["3 forms + 2 tracked calls, same month", row({ form_leads: 3, total_calls: 2, total_leads: 23 }), CLIENTS.tracked, 5],
    ["a 28-day form count beside a month of calls", { reporting_month: MONTH, form_leads: 3, total_calls: 2, data: { ga4: { window: "28d" } } }, CLIENTS.tracked, null],
    ["calls never recorded for a client with call tracking", row({ form_leads: 3, total_calls: null }), CLIENTS.tracked, null],
    ["a tracked month whose call read failed", row({ form_leads: 3, total_calls: null, data: { ...W, calls_read: { ok: false } } }), CLIENTS.none, null],
    ["no call tracking at all: the form leads", row({ form_leads: 3, total_calls: null, gbp_calls: 20 }), CLIENTS.none, 3],
    ["forms never recorded", row({ form_leads: null, total_calls: 4 }), CLIENTS.tracked, null],
    ["a phone system's whole line is not leads", row({ form_leads: 3, total_calls: 40 }), CLIENTS.line, 3],
    ["call tracking turned off: forms only", row({ form_leads: 2, total_calls: null }), CLIENTS.off, 2],
    ["a recorded 0 and 0", row({ form_leads: 0, total_calls: 0 }), CLIENTS.tracked, 0],
    ["no row", null, CLIENTS.tracked, null],
    ["an empty row", {}, CLIENTS.tracked, null],
    ["the stored total_leads (with Google taps) is never read", row({ form_leads: 1, total_calls: 1, total_leads: 99, gbp_calls: 40 }), CLIENTS.tracked, 2],
    ["the forms window belongs to another month", { reporting_month: MONTH, form_leads: 1, total_calls: 1, data: { ga4: { forms_window: "month", forms_month: "2026-09-01" } } }, CLIENTS.tracked, null],
  ];
  for (const [name, rec, client, want] of CASES) {
    const got = M.leadsOf(rec, client);
    ok(got.value === want, `leadsOf: ${name} (got ${got.value}, want ${want})`);
    if (want === null && rec) ok(typeof M.leadsWhy(got) === "string" && M.leadsWhy(got).length > 10, `leadsOf: ${name} says why`);
  }
  // lead value: one formula, client row canonical, month row fallback, measured close rate over both
  const lv = (rec, client, months) => M.leadValueOf(rec, client, months || []).value;
  ok(lv(row({ form_leads: 3, total_calls: 2 }), { close_rate_per_10: 4, avg_job_value: 500 }) === 1000, "lead value: 5 leads x 4/10 x $500 = $1,000 from the client's own numbers");
  ok(lv(row({ form_leads: 3, total_calls: 2, lead_to_customer_rate: 40, avg_revenue_per_job: 500 }), {}) === 1000, "lead value: the month row's 40% and $500 give the SAME $1,000 when the client row is empty");
  ok(lv(row({ form_leads: 3, total_calls: 2, lead_to_customer_rate: 90, avg_revenue_per_job: 9000 }), { close_rate_per_10: 4, avg_job_value: 500 }) === 1000, "lead value: the client row wins over the month row");
  ok(lv(row({ form_leads: 3, total_calls: 2 }), { billing_model: "recurring", monthly_value: 100, avg_retention_months: 10, close_rate_per_10: 2 }) === 1000, "lead value: a recurring customer is monthly x months (5 x 2/10 x $1,000)");
  ok(lv(row({ form_leads: 3, total_calls: 2 }), { avg_job_value: 500 }) === null, "lead value: no close rate anywhere = not shown, never assumed");
  ok(lv(row({ form_leads: 3, total_calls: null }), { close_rate_per_10: 4, avg_job_value: 500, kpi_config: { call_tracking: true } }) === null, "lead value: unknown leads (a tracked client whose calls were not read) = not shown");
  const hist = [row({ form_leads: 5, total_calls: 5, closed_jobs: 2 }), { ...row({ form_leads: 5, total_calls: 5, closed_jobs: 4 }), reporting_month: "2026-09-01", data: { ga4: { forms_window: "month", forms_month: "2026-09-01" } } }];
  const mv = M.leadValueOf(hist[0], { close_rate_per_10: 9, avg_job_value: 100 }, hist);
  ok(mv.rate.source === "measured" && mv.rate.per10 === 3 && mv.value === 300, `lead value: 6 closed of 20 leads over 2 months = 3 in 10, measured beats the typed 9 (${mv.rate.per10}, $${mv.value})`);
  // every surface gives the SAME answer: the portal's portalMonthLeads and the report's countLeads, lifted; client-monthly's monthTiles, loaded
  const lifted = [];
  const pml = fnBody(NOW.portal, "portalMonthLeads");
  if (pml) lifted.push(["portal portalMonthLeads", new Function("globalThis", `${pml}; return portalMonthLeads;`)({ rgaMetrics: M })]);
  else fail("RUN: portal portalMonthLeads can't be found");
  const cl = fnBody(NOW.report, "countLeads");
  if (cl) { const f = new Function("M", `${cl}; return countLeads;`)(() => M); lifted.push(["report countLeads", (rec, c) => { const x = rec ? f(rec, c) : null; return x ? x.total : null; }]); }
  else fail("RUN: report countLeads can't be found");
  for (const [who, fn] of lifted) for (const [name, rec, client, want] of CASES) {
    let got; try { got = fn(rec, client); } catch (e) { got = `threw ${e.message}`; }
    ok(got === want, `${who}: ${name} (got ${got}, want ${want}) disagrees with leadsOf`);
  }
  try {
    const CM = req("./shared/client-monthly.js");
    const T = (leads) => CM.monthTiles({ cur: { month: MONTH, monthName: "October", number: 2 }, rank: null, taps: { value: null }, reviews: { value: null }, nextScan: null, leads }).leads.value;
    ok(T({ row: row({ form_leads: 3, total_calls: 2 }), calls: 2, forms: 3, trackingTask: { status: "done" } }) === 5, "monthTiles: the month's row reads 5, as leadsOf");
    ok(T({ row: { reporting_month: MONTH, form_leads: 3, total_calls: 2, data: { ga4: { window: "28d" } } }, calls: 2, forms: 3, trackingTask: { status: "done" } }) === null, "monthTiles: a 28-day form count beside a month of calls is not added");
    ok(T({ row: row({ form_leads: 2, total_calls: 30 }), calls: 30, forms: 2, callTracking: false, trackingTask: { status: "done" } }) === 2, "monthTiles: no call tracking = forms only, as leadsOf");
  } catch (e) { fail(`RUN: shared/client-monthly.js monthTiles can't be run (${e.message})`); }
  try {
    const P = req("./netlify/functions/_metrics.js");
    for (const [n, want] of [["form_submit", true], ["generate_lead", true], ["contact_form_submit", true], ["quote_request", true], ["contact_click", false], ["click_contact", false], ["form_start", false], ["contact_page_view", false], ["booking_open", false], ["page_view", false]])
      ok(P.isFormSubmission(n) === want, `_metrics: "${n}" is ${want ? "" : "not "}a form submission`);
    for (const [c, want] of [["Organic Search", true], ["organic search", true], ["Organic Social", false], ["Organic Video", false], ["Organic Shopping", false], ["Paid Search", false]])
      ok(P.ORGANIC_SEARCH.test(c) === want, `_metrics: "${c}" is ${want ? "" : "not "}organic search`);
  } catch (e) { fail(`RUN: _metrics.js can't be loaded (${e.message})`); }
}

if (F.length) {
  console.error(`🔴 check-one-leads-formula: ${F.length} problem${F.length === 1 ? "" : "s"}`);
  F.forEach((m) => console.error(`   ✗ ${m}`));
  process.exit(1);
}
console.log(`✅ check-one-leads-formula: Leads are forms plus tracked calls over the same calendar month (or null with a reason), and their value one formula from the client's own numbers first, on the portal, the report page, the admin, the monthly tiles, the email and the stored column; organic = Organic Search, a click is not a form; self-proof ${selfProof}.`);
