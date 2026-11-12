#!/usr/bin/env node
// check-leads-count-missed-callers.mjs — A MISSED CALL IS A LEAD, EACH CALLER COUNTS ONCE, EVERYWHERE (Chris 11-12, "all recommended").
//
// 🔴 WHY. Tier 3 (shared/leads.js) counted a missed call as a lead while the monthly Leads number (shared/metrics.js leadsOf) counted only answered calls of 30
// seconds or more, so the same month showed two different "leads". The approved rule: forms + each NEW CALLER ONCE per month, missed calls INCLUDED; the caller is the
// last 4 digits (the only identity kept; a row without them is its own caller); wherever the Leads number is shown it says "including N missed" when N > 0.
//
// WHAT IT HOLDS (website repo):
//   A. ONE caller function: `function callLeadsOf` / `function dedupeCallers` exist in shared/leads.js and nowhere else; shared/metrics.js has ONE `function leadsOf`; the call
//      sync writes data.calls.caller_leads / caller_missed from callLeadsOf; metrics.leadsOf reads them (no second sum of calls + missed in any other file).
//   B. RUN: callLeadsOf on fixtures (a missed-only caller counts; the same caller twice counts once; a caller with a counted AND a missed call is not "missed"; rows with no last 4
//      are separate callers; a short answered call is no lead), summaryOf agrees with it, metrics.leadsOf adds it to forms and returns {missed}, and the old record shape
//      (no caller_leads) falls back to connected calls + the provider's missed count. LEADS_EXP / missedWords say "including N missed" only when N > 0.
//   C. THE SUB-LINE EXISTS on every surface that shows a Leads number: portal Leads tile + KPI Snapshot, admin KPI grid + Customer Value, report page (month in one line, Jobs and
//      money), client monthly tiles, the monthly email, the Tier 3 tiles/report/band, and System health's leads line. No Leads tile still prints the bare LEADS_DEF.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m), ok = (c, m) => { if (!c) fail(m); };
const indet = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const rd = (rel) => { try { return fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { return null; } };
const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const FILES = { leads: "shared/leads.js", metrics: "shared/metrics.js", sync: "netlify/functions/call-tracking-sync.js", portal: "portal/portal.js", admin: "admin/admin.js",
  report: "portal/report/report.js", monthly: "shared/client-monthly.js", mail: "netlify/functions/send-monthly-report.js", value: "netlify/functions/_monthly-value.js" };
const S = {};
for (const [k, rel] of Object.entries(FILES)) { S[k] = rd(rel); if (S[k] == null) indet(`${rel} can't be read in ${SITE}`); }
const C = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, strip(v)]));

// A. one function each
const defs = (src, name) => (src.match(new RegExp(`function\\s+${name}\\s*\\(`, "g")) || []).length;
ok(defs(C.leads, "callLeadsOf") === 1 && defs(C.leads, "dedupeCallers") === 1, "shared/leads.js must define callLeadsOf and dedupeCallers exactly once");
ok(defs(C.metrics, "leadsOf") === 1, "shared/metrics.js must define leadsOf exactly once");
for (const [k, src] of Object.entries(C)) if (k !== "leads") ok(defs(src, "callLeadsOf") <= (k === "metrics" ? 1 : 0), `${FILES[k]} defines its own callLeadsOf (a second caller rule)`);
ok(/callLeadsOf\(res\.rows\)/.test(C.sync) && /caller_leads/.test(C.sync) && /caller_missed/.test(C.sync), "call-tracking-sync writes data.calls.caller_leads / caller_missed from callLeadsOf");
ok(/num\(c\.caller_leads\)/.test(C.metrics) && /caller_missed/.test(C.metrics), "metrics.leadsOf reads caller_leads / caller_missed");
ok(/value:\s*forms \+ cl\.value/.test(C.metrics), "metrics.leadsOf adds the callers to the forms");
ok(/dedupeCallers\(all\)\.filter\(isLead\)/.test(C.leads), "Tier 3 summaryOf counts leads over callers (dedupeCallers), not over raw call rows");
ok(/callLeadsOf\(all\)\.missed/.test(C.leads), "Tier 3 summaryOf takes its missed count from callLeadsOf");

// B. run it
const req = createRequire(path.join(SITE, "x.js"));
let L, M;
try { L = req("./shared/leads.js"); M = req("./shared/metrics.js"); } catch (e) { indet(`can't load shared/leads.js or shared/metrics.js (${e.message})`); }
const call = (o) => ({ kind: "call", provider: "callrail", answered: true, counted: true, seconds: 90, ...o });
const miss = (o) => call({ answered: false, counted: false, seconds: 0, ...o });
const short = (o) => call({ counted: false, seconds: 8, ...o });
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
eq(L.callLeadsOf([miss({ lead_key: "m1", last4: "1111" })]), { callers: 1, missed: 1 }, "a missed-only caller is a lead");
eq(L.callLeadsOf([miss({ lead_key: "m1", last4: "1111" }), miss({ lead_key: "m2", last4: "1111" })]), { callers: 1, missed: 1 }, "the same caller missed twice counts once");
eq(L.callLeadsOf([call({ lead_key: "a", last4: "1111" }), miss({ lead_key: "b", last4: "1111" })]), { callers: 1, missed: 0 }, "a caller who was answered AND missed is one answered lead, not a missed one");
eq(L.callLeadsOf([call({ lead_key: "a", last4: "1111" }), miss({ lead_key: "b", last4: "1111", mark: "booked" })]), { callers: 1, missed: 0 }, "a caller whose MISSED call carries the mark but who was also answered is still not a missed lead");
eq(L.callLeadsOf([call({ lead_key: "a", last4: "1111" }), call({ lead_key: "b", last4: "1111" }), call({ lead_key: "c", last4: "2222" })]), { callers: 2, missed: 0 }, "two answered calls from one caller are one lead");
eq(L.callLeadsOf([miss({ lead_key: "a" }), miss({ lead_key: "b" })]), { callers: 2, missed: 2 }, "rows with no last 4 are separate callers");
eq(L.callLeadsOf([short({ lead_key: "s", last4: "3333" })]), { callers: 0, missed: 0 }, "a short answered call (a misdial) is not a lead");
eq(L.callLeadsOf([]), { callers: 0, missed: 0 }, "no rows, no leads");
const month = "2026-10-01", rows = [call({ month, lead_key: "a", last4: "1111" }), miss({ month, lead_key: "b", last4: "2222" }), miss({ month, lead_key: "c", last4: "2222" }), { kind: "form", month, lead_key: "f", day: "2026-10-03" }];
const sm = L.summaryOf({ month, now: Date.parse("2026-11-12T12:00:00Z"), rows, record: {}, provider: { key: "callrail", label: "CallRail", attributed: true }, forms: { connected: true } });
ok(sm.leads === 3 && sm.leadsMissed === 1, `Tier 3 summaryOf: 1 answered caller + 1 missed caller (called twice) + 1 form = 3 leads, 1 missed (got ${sm.leads}, ${sm.leadsMissed})`);
const rec = (data, extra) => ({ reporting_month: month, form_leads: 3, total_calls: 1, data: { ga4: { forms_window: "month", forms_month: month }, ...data }, ...extra });
const l1 = M.leadsOf(rec({ calls: { caller_leads: 3, caller_missed: 2 } }), null);
ok(l1.value === 6 && l1.missed === 2 && l1.callers === 3, `leadsOf: 3 forms + 3 callers (2 only missed) = 6, missed 2 (got ${l1.value}, ${l1.missed})`);
const l2 = M.leadsOf(rec({ calls: { missed: 4 } }), null);
ok(l2.value === 8 && l2.missed === 4, `leadsOf, a month read before caller_leads: 3 forms + 1 connected + 4 missed = 8 (got ${l2.value})`);
const l3 = M.leadsOf(rec({ calls: { caller_leads: 0, caller_missed: 0 } }), null);
ok(l3.value === 3 && l3.missed === 0, `leadsOf: zero callers is forms only (got ${l3.value})`);
ok(M.leadsOf(rec({ calls: { caller_leads: 3, caller_missed: 2 } }), { call_tracking_attributed: false }).value === 3, "a phone system's whole line still is not a lead source");
ok(M.leadsOf({ ...rec({}), form_leads: null }, null).value === null, "unknown forms stay null, never 0");
ok(M.LEADS_MISSED_WORDS(l1) === "including 2 missed", `LEADS_MISSED_WORDS says "including 2 missed" (got "${M.LEADS_MISSED_WORDS(l1)}")`);
ok(M.LEADS_MISSED_WORDS(l3) === "" && M.LEADS_MISSED_WORDS({ value: null, missed: 5 }) === "", "no missed line when N is 0, and none on an unknown number");
ok(/^Including 2 missed\. /.test(M.LEADS_EXP(l1, null)) && !/missed\. Form/.test(M.LEADS_EXP(l3, null).slice(0, 12)) && !/^Including/.test(M.LEADS_EXP(l3, null)), "LEADS_EXP leads with 'Including N missed.' only when N > 0");
ok(L.missedWords(2) === "including 2 missed" && L.missedWords(0) === "" && L.missedWords(null) === "", "Tier 3 missedWords says the same words");

// C. the sub-line is on every surface
ok(/LEADS_EXP\(curL, client\)/.test(C.portal) && /M\.LEADS_EXP\(L, kpiClient\)/.test(C.portal), "portal: the Leads tile and the KPI Snapshot show the missed sub-line (LEADS_EXP)");
ok(/M\.LEADS_EXP\(L, state\.selectedClient\)/.test(C.admin) && /LEADS_MISSED_WORDS\(leadsL\)/.test(C.admin), "admin: the KPI grid Leads and the Customer Value 'leads' box show the missed sub-line");
ok(/missedWords: M\(\)\.LEADS_MISSED_WORDS\(L\)/.test(C.report) && /\(M\(\)\.LEADS_MISSED_WORDS\(L\) \? `, \$\{M\(\)\.LEADS_MISSED_WORDS\(L\)\}`/.test(C.report), "report page: the month in one line and Jobs and money show the missed sub-line");
ok(/small: `\$\{Met\(\)\.LEADS_MISSED_WORDS\(LL\)/.test(C.monthly), "client monthly tiles: Leads tracked shows the missed sub-line");
ok(/including \$\{nowL\.missed\} missed/.test(C.mail), "the monthly email's Leads row says including N missed");
ok(/LM\.LEADS_MISSED_WORDS\(LL\) \? `, \$\{LM\.LEADS_MISSED_WORDS\(LL\)\}`/.test(C.value), "System health's leads line says including N missed");
ok((C.leads.match(/missedWords\(/g) || []).length >= 3, "Tier 3: the Booked jobs tile, the band and the report row all use missedWords");
for (const k of ["portal", "admin"]) ok(!/M(ET\(\))?\.LEADS_DEF\(/.test(C[k]) || /LEADS_EXP/.test(C[k]) && !/(buildKpiTile|caTile|tile)\("Leads"[^\n]*LEADS_DEF/.test(C[k]), `${FILES[k]}: a Leads tile still prints the bare LEADS_DEF`);
ok(!/\(nowCalls \|\| 0\) \+ \(nowForms \|\| 0\)/.test(C.report) && !/\(wasCalls \|\| 0\) \+ \(wasForms \|\| 0\)/.test(C.report), "report page: no second leads sum beside leadsOf");

if (F.length) { console.error(`🔴 check-leads-count-missed-callers: ${F.length} problem${F.length === 1 ? "" : "s"}\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ check-leads-count-missed-callers: Leads = forms + each caller once, missed calls included, ONE caller function, and 'including N missed' is on every surface that shows the number");
