// Shared by the monthly gates (monthly_fix_v2, 11-9). The earlier gates asked "is the NEW piece there?" and never "is the OLD piece gone?" or "was the real page rendered?".
// This asks the second question of the SOURCE: for a Monthly row the legacy producers must be switched off at ONE decision point (monthlyOwn), and the state/tab fixes must be wired.
// The browser half is check-monthly-one-card-in-a-browser.mjs (run once after a deploy). Returns an array of failure strings (empty = holds).
import fs from "node:fs";
import path from "node:path";
import { visibleRulesSelfTest } from "./_monthly-visible-rules.mjs";

export function oldChromeFailures(SITE) {
  const F = [], fail = (m) => F.push(m);
  const rd = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { fail(`cannot read ${r}`); return ""; } };
  const js = rd("admin/admin.js"), html = rd("admin/index.html"), moves = rd("netlify/functions/admin-open-moves.js"), wid = rd("data/playbooks/what-it-does.json"), pb = rd("data/playbooks/playbooks.json");
  const has = (src, s, why) => { if (!src.includes(s)) fail(why); };
  const lacks = (src, s, why) => { if (src.includes(s)) fail(why); };
  // A · one decision point, every legacy producer behind it
  has(js, "function monthlyOwn(", "A: there is no single decision point (monthlyOwn) saying a Monthly step draws its own card");
  has(js, "const detHtml = monthlyOwn(o) ? \"\" : obDetectionHtml(o, s.task);", "A: the old detection block (WE MEASURED / Check again) is not switched off for Monthly rows");
  has(js, "!UNI_NO_RULE_BOX.has(o.flowId) && !monthlyOwn(o)", "A: the grey Done-when box is not switched off for Monthly rows");
  has(js, "const uniNoRowRun = (id) => monthlyOwn(id) ||", "A: a Monthly row can still draw the old Draft / Run button");
  has(js, "monthlyOwn(o) ? \"\" : detHtml ||", "A: the old Run / Done / OVERRIDE actions row is not switched off for Monthly rows");
  has(js, "${monthlyOwn(o) ? \"\" : `<div class=\"ob-ovr\">", "A: the waiting-row OVERRIDE is not switched off for Monthly rows");
  has(js, "const qActions = monthlyOwn(o) ? \"\" :", "A: a queued Monthly row can still draw Run again / Done / Skip");
  has(js, "!monthlyOwn(o) && clientOverride(o, s.task)", "A: a locked Monthly row can still draw the client override cluster");
  has(js, "const undoBtn = monthlyOwn(o) ||", "A: a done Monthly row can still draw Undo / Run again");
  lacks(js.slice(js.indexOf("function wklRepliesCardHtml"), js.indexOf("function wklPostsCardHtml")), "repliesLiveAdminHtml()", "A: the old \"Not checked yet\" replies card is still appended to Review replies");
  has(js, "!html.includes(`data-uni-skip=\"${o.flowId}\"`)", "A: uniWrapRow adds a second \"Skip this step…\" under a card that already has one");
  has(js, "const howHtml = o.flowId === UNI_YT || monthlyOwn(o) ?", "A: \"How this step works\" is not under the one small More for Monthly rows");
  has(js, "if (o.flowId === \"m1.brand.youtube_setup\" || monthlyOwn(o)) {", "A: \"See what the client sees\" is not under the one small More for Monthly rows");
  has(js, "(optional)` } : s.obj;", "A: step 24's row title is not the card's \"Monthly call (optional)\" / \"Quarterly review (optional)\"");
  lacks(pb, "\"title\": \"Run monthly call\"", "A: the playbook still titles step 24 \"Run monthly call\"");
  for (const stale of ["Measure movement so the report", "One source of truth for the report", "Each month rotates a focus", "Retention happens on the call", "The client's proof of ROI", "Fresh GBP activity signals", "Review velocity is a top map-pack"])
    lacks(js, stale, `A: a stale internal why-line is back: "${stale}"`);
  lacks(wid, "Posts 4 updates on the Google profile", "A: what-it-does still says \"Posts 4 updates on the Google profile\"");
  has(wid, "About 4 a month, drafted from this month's focus; the client approves each.", "A: what-it-does has not the approved Google posts line");
  // B · state bugs
  has(moves, "monthNumber(String(r.reporting_month).slice(0, 10), m1ClosedAt) == null) continue;", "B1: the To do \"Send the report\" is not limited to numbered months (RGA's Sep/Oct/Nov rows would show LATE items)");
  has(js, "\"m2.start.open_month\": { status: \"done\", completed_at: at, done_by: \"system\" }", "B2: a month row that exists is not settled as Open the month done on the record");
  has(js, "if (id === \"m2.start.open_month\") return task.status === \"done\" ?", "B2: the Open the month card reads Done from something other than its own status (the count then disagrees)");
  has(js, "return runsOn(monthlyNextText(id))", "B3: a waiting runs-itself step has no \"Runs itself\" chip fed by the card's own next date");
  lacks(js, "runsOn(O.readsOn(sel))", "B3: the chip date is the generic month-open date again (Dec 1 on every runs-itself row); it must come from monthlyNextText, the card's own date");
  lacks(js, "C.dayOfNext(sel, C.DAYS[id])", "B3: the chip date for the freeze step is computed apart from the card");
  has(js, "function monthlyNextMs(id)", "B3: there is no single function giving the next date of a runs-itself Monthly step");
  has(js, "d.scan.nextAt", "B3: the scans chip date is not the scans card's nextAt");
  has(js, "const mqQuiet = ", "B4: a waiting runs-itself Monthly row has no quiet (neutral) styling");
  has(js, "step4Waits ? \"waits\" : mqQuiet ? \"queued\" : \"active\"", "B4: the quiet Monthly row still gets the orange active row class");
  has(js, "step4Waits || mqQuiet ? \"queued\" : \"active\"", "B4: the quiet Monthly row's chip is still the orange one");
  has(js, "id === \"m2.exec.review_responses\" && task.status !== \"done\" && wklW()", "B5: Review replies has no chip of its own (it wears Active now while waiting)");
  has(js, "if (body) body.insertAdjacentHTML(\"beforeend\", mh)", "B6: step 24's More link is appended outside the padded row body (flush left, between cards)");
  has(js, "(row && (row.opened_at || row.created_at))", "B7: the Open the month card is not given the month row's date");
  lacks(rd("shared/monthly-start.js"), "It never makes two.", "B7: the Open the month line still ends with \"It never makes two.\"");
  const qm = rd("shared/monthly-quarter.js");
  has(js, "QP[o.flowId]", "C: the Every quarter preview does not use the approved titles and plain lines");
  for (const t of ["Their numbers: booked jobs and revenue", "Links and local press", "Review the Google profile details", "Keyword overlap check", "Win story", "Video", "Lead-handling test"]) has(qm, `t: "${t}"`, `C: the quarter preview lacks the approved title "${t}"`);
  for (const bad of ["Publishes 1 or 2 YouTube videos", "Records the client's leads, calls, jobs and revenue", "(quarterly)", "(optional)", "(only with call tracking)"]) lacks(qm.slice(qm.indexOf("const PREVIEW")), bad, `C: the quarter preview carries internal text: "${bad}"`);
  has(js, "(UNI_OWN_CARD.has(id) || monthlyOwn(id) ||", "B3: the Monthly row pill is not routed to the card's own chip (so a waiting runs-itself step says \"Active now\")");
  // C · the Every quarter line opens a read-only preview
  has(js, "data-cm-qprev=\"${escapeAttribute(sec.key)}\"", "C: the folded Every quarter line is not a button");
  has(js, "Starts ${escapeHtml(startsOn)} · `", "C: the preview header is not \"Starts <date> · Month N\"");
  has(js, "Preview only.</b> These open in Months 3, 6, 9 and 12. Nothing here can be done or skipped yet.", "C: the preview has no Preview only band");
  has(js, "Results go into that month's report under \"This quarter\".", "C: the preview has no footer");
  has(js, "\"not for \" + cname", "C: the lead-handling test has no \"not for <client>\" tag when it does not apply");
  has(js, "nums.get(i)", "C: the preview rows are not numbered from the page numbers (14-20)");
  for (const w of ["Client", "RGA", "Runs itself", "Client · optional"]) has(qm, `"${w}"`, `C: the preview lacks the who tag "${w}"`);
  // monthly_audit_v2 (11-9): the approved audit
  has(rd("shared/monthly-start.js"), "t0 < startMs", "AUDIT 1: Open the month can still show a date before the month starts");
  has(js, "{ text: \"Client's move\", cls: \"queued\" }", "AUDIT 2: a client's-move weekly row has no Client's move chip");
  has(js, "Client's move \\u00B7 optional", "AUDIT 2: New photos has no \"Client's move · optional\" chip");
  lacks(js, "is a ranking signal", "AUDIT 3: the Review replies subtitle still makes a ranking claim");
  has(js, "o.flowId === \"m2.exec.gbp_posts\" ? \"both\"", "AUDIT 4: Google posts is not tagged You + client");
  const sec = rd("shared/monthly-sections.js"), mm = rd("shared/monthly-monthly.js");
  has(sec, "\"m2.exec.profile_watch\", \"m2.exec.tracking_check\"", "AUDIT 7/8: the two new steps are not in Once a month");
  has(sec, "const APPENDED", "AUDIT 7/8: the new steps are not numbered after the existing 25");
  has(js, "app.forEach((id) =>", "AUDIT 7/8: the admin does not number the appended steps 26 and 27");
  has(mm, "[ID.NUMBERS]: \"This month so far\"", "AUDIT 5: step 8 is not called This month so far");
  has(mm, "partial · updated", "AUDIT 5: step 8 does not say partial and updated");
  has(rd("netlify/functions/_monthly-once.js"), "nowMs - Date.parse(sf.at) >= 7 * 86400000", "AUDIT 5: the month-to-date numbers are not refreshed weekly");
  has(mm, "nothing changed", "AUDIT 6: the listings card has no read-back wording");
  has(rd("netlify/functions/_monthly-once.js"), "d.readListingLinks", "AUDIT 6: the morning run does not re-read the listing links");
  has(rd("netlify/functions/_citation-build.js"), "async function readLiveLinks", "AUDIT 6: no live-link re-read exists");
  has(js, "admin-gbp-drift", "AUDIT 7: the profile watch card does not use the existing Accept / Put it back path");
  has(rd("netlify/functions/_monthly-plan.js"), "async function freezeState", "AUDIT 9: the plan does not wait for last month's freeze");
  has(rd("netlify/functions/_morning-run.js"), "d.suggestPlan", "AUDIT 9: the morning run does not compute the suggestion the day the freeze lands");
  const pv = js.slice(js.indexOf("const foldedQ ="), js.indexOf("const html = buckets.filter"));
  if (/<button[^>]*(Skip|data-uni|data-onboard)/.test(pv.slice(pv.indexOf("cm-q-prev"))) ) fail("C: the quarter preview has buttons (it must be read-only)");
  // D · bottom blocks
  lacks(html, "automated when Twilio is wired", "D: \"What the client sent\" still says review requests are sent \"automated when Twilio is wired\" (RGA never sends them)");
  has(html, "data-tab=\"websitework\"", "D: there is no Website Work tab");
  has(html, "id=\"panel-websitework\"", "D: there is no Website Work panel");
  const mp = html.slice(html.indexOf("id=\"panel-monthlynew\""), html.indexOf("id=\"panel-websitework\""));
  lacks(mp, "websiteSections", "D: the Website Work block is still inside the Monthly tab");
  lacks(mp, "Optional add-on", "D: an \"Optional add-on\" block is still inside the Monthly tab");
  has(js, "\"monthlynew\", \"websitework\"", "D: websitework is not a known client tab");
  if (!(((html.match(/admin\.js\?v=([0-9a-z]+)/) || [])[1] || "") >= "20261109w")) F.push("the admin.js ?v= was not bumped");
  F.push(...visibleRulesSelfTest());   // the browser gate's rules fire on the 11-9 live state and stay quiet on the fixed one
  return F;
}
