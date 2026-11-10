// Shared by the monthly gates (monthly_fix_v2, 11-9). The earlier gates asked "is the NEW piece there?" and never "is the OLD piece gone?" or "was the real page rendered?".
// This asks the second question of the SOURCE: for a Monthly row the legacy producers must be switched off at ONE decision point (monthlyOwn), and the state/tab fixes must be wired.
// The browser half is check-monthly-one-card-in-a-browser.mjs (run once after a deploy). Returns an array of failure strings (empty = holds).
import fs from "node:fs";
import path from "node:path";

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
  has(js, "return runsOn(O.readsOn(sel))", "B3: a waiting runs-itself step has no \"Runs itself · <date>\" chip");
  has(js, "(UNI_OWN_CARD.has(id) || monthlyOwn(id) ||", "B3: the Monthly row pill is not routed to the card's own chip (so a waiting runs-itself step says \"Active now\")");
  // C · the Every quarter line opens a read-only preview
  has(js, "data-cm-qprev=\"${escapeAttribute(sec.key)}\"", "C: the folded Every quarter line is not a button");
  has(js, "Starts in Month ${nextQ}${escapeHtml(when)}", "C: the preview is not headed \"Starts in Month N (<month>)\"");
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
  has(html, "admin.js?v=20261109t", "the admin.js ?v= was not bumped");
  return F;
}
