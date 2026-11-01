#!/usr/bin/env node
// check-month-log-and-proof-links.mjs — THE MONTHLY REPORT'S "WHAT ELSE HAPPENED" LOG AND ITS PROOF LINKS (approved report_and_measurement_v1, Chris 11-1).
// FILE-ONLY: nothing real is called, no browser, no database. Every Supabase call is a stub. The report's own wording is still proved by the browser
// gate check-the-monthly-report-reads-true; this one proves the writer and the two reader functions without a browser, so a vm lift of two small
// pure functions stands in for the page (feedback_the_harness_i_wrote_to_check_my_work_can_lie: that is a lift, not the browser).
//  (1) hours, closed days and phone drifts become one dated line each; every other drift becomes nothing; no line says "caused".
//  (2) the line goes on the month's record only: no record = nothing written and it says why; earlier data stays; the same day isn't doubled; capped; a failure returns, never throws.
//  (3) the nightly watch calls the writer inside its own try, after the change is stamped; the real job supplies it; it makes no Google call.
//  (4) the report prints the lines (dated, as written, escaped) and keeps the sentence that not everything is logged.
//  (5) proof links: only the pages the work log lists, web addresses only, no repeats, at most ten, escaped, opened safely; none = nothing printed.
// Exit 0 = holds · 1 = broken · 2 = moved (indeterminate).
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { return null; } };
const F = [];
const ok = (c, m) => { if (!c) F.push(m); };
const idk = (m) => { console.error(`INDETERMINATE: ${m}`); process.exit(2); };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let ME; try { ME = req("./_month-events.js"); } catch (e) { idk(`_month-events.js won't load: ${e.message}`); }
const meSrc = read("netlify/functions/_month-events.js"), watchSrc = read("netlify/functions/_gbp-watch.js"), jobSrc = read("netlify/functions/gbp-profile-watch.js"), rep = read("portal/report/report.js");
if ([meSrc, watchSrc, jobSrc, rep].some((x) => x == null)) idk("a file moved");

// (1)
const NOW = Date.parse("2026-11-03T04:00:00Z");
const L = (what) => ME.linesFromDrift({ what }, NOW);
ok(L("weekly hours").length === 1 && L("weekly hours")[0].kind === "hours" && L("weekly hours")[0].at === "2026-11-03T04:00:00.000Z", "(1) a weekly-hours change doesn't become one dated hours line");
ok(L("closed days").length === 1 && /closed days/.test(L("closed days")[0].text), "(1) a closed-days change isn't logged as closed days");
ok(L("phone").length === 1 && L("phone")[0].kind === "phone" && /phone number/.test(L("phone")[0].text), "(1) a phone change isn't logged");
ok(L("business name, phone, website").length === 1 && L("phone, weekly hours").length === 2, "(1) a mixed change logs the hours and phone parts and nothing else");
ok(["booking link", "services", "details", "business name", "service area", "website", ""].every((w) => L(w).length === 0) && ME.linesFromDrift(null, NOW).length === 0 && ME.linesFromDrift({}, NOW).length === 0, "(1) a drift that isn't hours or phone was logged for the client's report");
ok([...L("weekly hours"), ...L("phone"), ...L("closed days")].every((l) => !/caus|because|thanks to|ranking|calls/i.test(l.text) && !/[—]/.test(l.text) && /Our nightly check saw it/.test(l.text)), "(1) a logged line says caused, a result, or something the check didn't see");

// (2)
const mk = (rows, over = {}) => { const calls = []; const supa = async (p, init = {}) => { calls.push({ p, init }); if (over.throw) throw new Error("Supabase 500: down"); return init.method ? null : rows; }; supa.calls = calls; return supa; };
{ const s = mk([]); const r = await ME.addLines("c1", L("phone"), { supa: s, now: NOW });
  ok(r.ok === false && /no monthly record/.test(r.reason) && s.calls.every((c) => !c.init.method), "(2) with no monthly record for the month a line was written, or the reason wasn't given");
  ok(/reporting_month=eq\.2026-11-01/.test(s.calls[0].p), "(2) the line looked for a month other than the one it happened in"); }
{ const s = mk([{ id: 7, data: { metrics_errors: { ga4: "x" }, keep: 1 } }]); const r = await ME.addLines("c1", L("weekly hours"), { supa: s, now: NOW });
  const patch = s.calls.find((c) => c.init.method === "PATCH"), body = patch && JSON.parse(patch.init.body);
  ok(r.ok && r.added === 1 && patch && /client_monthly_records\?id=eq\.7$/.test(patch.p) && body.data.keep === 1 && body.data.metrics_errors.ga4 === "x" && body.data.what_else.length === 1, "(2) the line replaced the month's other data, or went to the wrong row");
  ok(Object.keys(body).join() === "data", "(2) the write touched a column other than data"); }
{ const have = L("weekly hours"); const s = mk([{ id: 7, data: { what_else: have } }]); const r = await ME.addLines("c1", have, { supa: s, now: NOW });
  ok(r.ok && r.added === 0 && s.calls.every((c) => !c.init.method), "(2) the same change on the same day was logged twice"); }
{ const old = Array.from({ length: ME.MAX_LINES }, (_, i) => ({ kind: "hours", field: "weekly hours", at: `2026-11-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, text: `x${i}` }));
  const s = mk([{ id: 7, data: { what_else: old.map((o, i) => ({ ...o, field: `f${i}` })) } }]); await ME.addLines("c1", L("phone"), { supa: s, now: NOW });
  const body = JSON.parse(s.calls.find((c) => c.init.method === "PATCH").init.body);
  ok(body.data.what_else.length === ME.MAX_LINES && body.data.what_else.at(-1).kind === "phone", "(2) the log grows past its cap, or drops the new line"); }
{ let threw = false, r; try { r = await ME.addLines("c1", L("phone"), { supa: mk([], { throw: true }), now: NOW }); } catch { threw = true; }
  ok(!threw && r && r.ok === false && r.reason, "(2) a database failure threw out of the writer, or came back as success"); }
ok(!/fetch\(|googleapis|serpapi|mybusiness/i.test(meSrc.replace(/\/\/.*$/gm, "")), "(2) the writer calls out to Google or a search provider");

// (3)
{ const a = watchSrc.indexOf("out.drift.push(stepId)"), b = watchSrc.indexOf("d.logEvent"), c = watchSrc.indexOf("d.notifyRga(clientId, `${stepId} — the ${drift.what} on Google changed");
  ok(a > 0 && b > a && c > b, "(3) the watch logs the change before it is stamped, or after RGA is told");
  ok(/if \(d\.logEvent\) \{\s*try \{[^]*?\}\s*catch \(e\) \{ out\.errors\.push/.test(watchSrc), "(3) the watch's log call isn't in its own try that reports a failure");
  ok(/logEvent: \(id, drift, nowMs\) => require\("\.\/_month-events"\)\.addLines/.test(jobSrc), "(3) the real nightly job doesn't supply the writer, so nothing would ever be logged"); }

// (4)
ok(/data\?\.what_else/.test(rep) && /\^\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(rep) && /seenOn\.forEach\(\(l\) => items\.push\(`\$\{formatDay\(l\.at\)\}: \$\{l\.text\}`\)\)/.test(rep) && /typeof l\.text === "string"/.test(rep), "(4) the report doesn't read the dated lines from the month's record");
ok(/Google updates and ad changes are not logged for your account yet, so none are listed here\./.test(rep) && /listed only when our nightly check saw them\. That does not mean none happened\./.test(rep), "(4) the report stopped saying that unlogged changes may still have happened");
ok(!/hours or phone changes (?:and ad changes )?are not logged/.test(rep), "(4) the report still says hours or phone changes are not logged at all");

// (5)
{ const a = rep.indexOf("const PROOF_LINK_MAX"), b = rep.indexOf("// What we did, from the month's work log");
  if (a < 0 || b < a) idk("proofLinks moved");
  const P = vm.runInNewContext(`${rep.slice(a, b)}; ({ proofLinks, PROOF_LINK_MAX })`, { URL, String, Set });
  const K = "month2new::3.7.11 Backlinks Earned This Month - List Of URLs";
  const get = (s) => P.proofLinks({ [K]: s });
  ok(get("https://a.example/x\nhttp://b.example/\nhttps://a.example/x").length === 2, "(5) a repeated page was listed twice");
  ok(get("javascript:alert(1) ftp://x.example/a mailto:a@b.co not-a-url //evil.example data:text/html,x https://ok.example/p").map((x) => x.href).join() === "https://ok.example/p", "(5) something that isn't a web address was printed as a link");
  ok(P.proofLinks({}).length === 0 && P.proofLinks(null).length === 0 && get("").length === 0 && P.proofLinks({ [K]: null }).length === 0, "(5) with no list on record a link was printed");
  ok(get(Array.from({ length: 30 }, (_, i) => `https://s${i}.example/`).join(",")).length === P.PROOF_LINK_MAX && P.PROOF_LINK_MAX === 10, "(5) more than ten links were printed");
  ok(get("https://www.site.example/blog/").at(0).label === "site.example/blog/" && get("https://site.example/").at(0).label === "site.example", "(5) the link's visible text isn't the page it goes to");
  ok(get("https://a.example/?q=\"><script>").length === 1, "(5) a hostile address broke the list");
  ok(/href="\$\{escapeHtml\(p\.href\)\}" target="_blank" rel="noopener noreferrer"/.test(rep) && /\$\{escapeHtml\(p\.label\)\}/.test(rep), "(5) a proof link isn't escaped or doesn't open safely");
  ok(/proof\.length \?/.test(rep) && /Pages that link to your site/.test(rep), "(5) the links section prints when the log holds none, or isn't named for what it is");
  ok(!/"month2new::[^"]*"\s*\]\s*[^;]*href/.test(rep.replace(/\/\/.*$/gm, "")) && (rep.match(/<a /g) || []).length === 1, "(5) the report has a link other than the proof links"); }

if (F.length) { console.error(`check-month-log-and-proof-links: ${F.length} problem${F.length === 1 ? "" : "s"}`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log("check-month-log-and-proof-links: hours and phone changes are logged on the month's record only, the report prints them dated, and proof links are web addresses from the work log only (stubbed, no browser)");
