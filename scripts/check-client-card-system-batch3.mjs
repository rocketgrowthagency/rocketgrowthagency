#!/usr/bin/env node
// check-client-card-system-batch3.mjs — 2026-10-30. Batch 3 of the client card system: the ONGOING WORK tab. Chris approved one page per
// card (reports/mockups/client_step16_weekly_list_v1 · client_step17_numbers_v1 · client_step18_new_photos_v1 · client_step19_video_v1 ·
// client_step20_monthly_call_v1 · client_ongoing_reviews_v1 · client_ongoing_google_posts_v1 · client_ongoing_review_replies_v1 ·
// client_ongoing_win_story_v1). → project_client_card_system · the reviews card itself is check-reviews-feed.
//
// RUNS the real renderers (vm for OG_CARD and the rows, Chrome for the tile grid and the phone width) and what each page promises:
//   · 16: the period pill follows their cadence (never "Week of"), "due <the real date>", the done card says the real next date and keeps
//     Remind once / They reviewed / They asked me to stop; missed says so once; a list with someone still to ask stays open, no stale period
//   · 17: "You sent your numbers" until rga_confirmed, then "Used in your report" + the lock; not this quarter = "Next: Jan 1", not to do
//   · 18: no quota words anywhere; With RGA · N to review; "On Google" counts what's ON Google, never what was sent; the tiles never overlap
//   · 19: Send my video + Skip this quarter under the card; skipped says "your choice" only when it was theirs; "received" only once RGA has it
//   · 20: the wait is a card with no "Month 1" in it; the picker's words; held = a question, no lock line, no "Change"
//   · posts: "For your approval" only when the deliverable exists (RGA cleared it); "live" per post, from the queue; the crumb isn't Live early
//   · replies: rows name a review only when Google's unanswered list IS what was drafted; posted = what Google shows replied; nothing = no card
//   · win story: a form + Done; the server takes the story; a client can skip; server: the skip checks the owner first and has an allow-list
// Businesses are NOT RGA: a Denver plumber, a Toronto dentist, a London cleaner; names with accents and apostrophes; three time zones.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 indeterminate (code moved)
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), C = read("portal/portal.css"), PB = JSON.parse(read("data/playbooks/playbooks.json")), CS = JSON.parse(read("data/playbooks/client-steps.json"));
const SC = read("netlify/functions/portal-step-choice.js"), SI = read("netlify/functions/portal-step-input.js"), SL = read("netlify/functions/portal-step-later.js"), AD = read("admin/admin.js"), KA = read("netlify/functions/kickoff-availability.js"), RR = read("netlify/functions/portal-review-requests.js");
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — ${w} moved; re-read it before trusting this gate`); process.exit(2); };
const fn = (n) => { const m = new RegExp(`^(?:async )?function ${n}\\(`, "m").exec(P); if (!m) moved(`function ${n}`); const e = P.indexOf("\n}\n", m.index); if (e < 0) moved(`the end of ${n}`); return P.slice(m.index, e + 2); };
const line = (n) => { const m = new RegExp(`^const ${n} = [^\\n]*$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0].replace(/^const /, "var "); };
const STEP_LOCK = createRequire(import.meta.url)(`${SITE}/shared/step-lock.js`);
const stepsById = Object.fromEntries((CS.month2plus || []).map((s) => [s.id, s]));
const IDS = ["m2.exec.review_push", "m2.snap.business_outcomes", "m2.exec.gbp_photos", "m2.exec.youtube_video", "m2.call.monthly", "m2.win_story.capture"];
for (const id of IDS) if (!stepsById[id]) fail(`${id} isn't in the client's projection (client-steps.json)`);

// ── lift ──
const ctx = vm.createContext({ Date, JSON, Number, Set, Map, Array, String, Object, Math, RegExp, Intl, Boolean, parseInt, isNaN, console, CSS: { escape: (x) => String(x) }, document: { querySelectorAll: () => [] },
  escapeHtml: (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;"),
  fmtDateShort: (x) => String(x || "").slice(0, 10), closeCallHtml: () => '<div class="pm-cc" data-closeout-call="c~m2"></div>', stepLockOf: (id, t) => STEP_LOCK.stepLock(id, t, {}) });
try {
  const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) moved("the plan-card pieces");
  const hand = P.slice(a, b);
  for (const code of [line("monthDay"), hand, csBlock(P, hand), fn("portalReportingMonth"), line("sameReportingMonth"), line("photoOnGoogle"), line("laterDay"), line("siteShow"), line("rcRow"), line("REVIEW_GOAL"), line("CADENCE"), line("_reviewCadence"), line("_lastCustomerLists"), line("smsHref"), fn("m2VideoScriptHtml"), fn("reviewSlotsHtml")]) vm.runInContext(code.replace(/^const /gm, "var "), ctx);
  { const rc = /^const r5CardHtml = [\s\S]*?<\/div>`;$/m.exec(P); if (!rc) moved("r5CardHtml"); vm.runInContext(rc[0].replace(/^const /, "var "), ctx); }
  const ga = P.indexOf("const ogMonth = "), gb = P.indexOf("const GBP_DAY = ", ga); if (ga < 0 || gb < 0) moved("the OG block");
  vm.runInContext(P.slice(ga, gb).replace(/^const /gm, "var "), ctx);
} catch (e) { console.error(`⚠️  INDETERMINATE — the Ongoing cards don't load (${e.message})`); process.exit(2); }
const run = (code) => vm.runInContext(code, ctx);
const card = (id, c = {}) => { ctx.__c = { clientId: "c1", status: c.status || (c.isDone ? "done" : "pending"), isDone: !!c.isDone, task: c.task || {}, notDue: c.notDue || null, later: c.later || null, tasks: c.tasks || {}, photos: c.photos || [], lists: c.lists || [], cadence: c.cadence || "weekly", locked: c.locked || null };
  ctx.__s = stepsById[id];
  try { return run(`OG_CARD["${id}"](__s, __c)`); } catch (e) { fail(`${id}: the card threw (${e.message})`); return { pills: [], tone: "", html: "" }; } };
const pills = (o) => o.pills.map((p) => p[0]).join(" | ");
const DAY = 864e5, now = Date.now(), ago = (d) => new Date(now - d * DAY).toISOString();
const textOf = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

// ── 0 · the rows are on the system ──
{ const m = /^const CS_STEPS = new Set\(\[([^\]]*)\]\);$/m.exec(P); if (!m) moved("CS_STEPS");
  for (const id of IDS) if (!m[1].includes(`"${id}"`)) fail(`${id} isn't on the card system (CS_STEPS)`);
  if (!/const csRow = CS_STEPS\.has\(step\.id\);/.test(P)) fail("csRow still leaves out the Month 2 rows");
  if (!/const completionCtlLive = og \? og\.html :/.test(P)) fail("a row doesn't draw its OG card");
  if (!/const csTone = og && !askLk \? og\.tone :/.test(P)) fail("the disc doesn't take the card's tone");
  if (!/\$\{og && !csAsk \? og\.pills\.map/.test(P)) fail("the pills aren't the card's own");
  if (!/rgaWait && !og \?/.test(P) || !/const rgaFoot = !og &&/.test(P)) fail("a row with a card still draws the old wait band or foot under it");
  if (!/const stepLk = og && og\.noLock \? null : stepLockOf/.test(P)) fail("a held call's page draws a lock line it doesn't have");
  if (!/\(\["m1\.review\.first_5", "m1\.brand\.youtube_setup", "m1\.call\.close", "m1\.gbp\.photos"\]\.includes\(step\.id\) \|\| !!OG_CARD\[step\.id\]\) && !flagged;/.test(P)) fail("Check again / Change sit beside an Ongoing card again");
  if (!/list\.classList\.contains\("pm-ongoing-ground"\) \? \[row\]/.test(P)) fail("closing one Ongoing card closes all the others");
}

// ── 16 · the weekly list ──
{ const id = "m2.exec.review_push";
  const C1 = (n, o = {}) => ({ first_name: n, phone: "7205550131", ...o }), asked = (d, o = {}) => ({ marked_sent_by_client: true, marked_sent_at: ago(d), ...o });
  for (const [cad, lab] of [["weekly", "Weekly"], ["biweekly", "Every 2 weeks"], ["monthly", "Monthly"]]) {
    const o = card(id, { cadence: cad });
    if (!new RegExp(`^Your turn \\| ${lab} · `).test(pills(o))) fail(`16: on ${cad} the period doesn't say the cadence (${pills(o)})`);
    if (/Week of/.test(pills(o) + o.html)) fail(`16: on ${cad} the card still says "Week of"`);
    if (!/Who did you finish jobs for\?/.test(o.html) || !/asked · due [A-Z][a-z]{2}, [A-Z][a-z]{2} \d/.test(o.html)) fail(`16: on ${cad} the ask isn't "Who did you finish jobs for? · N asked · due <date>"`);
    if (!/data-review-five/.test(o.html) || !/data-r5-weekly/.test(o.html) || !/name="first_name"/.test(o.html) || !/name="phone"/.test(o.html) || !/name="service_done"/.test(o.html)) fail("16: the form isn't step 13's");
    if (!/data-r5-send disabled>Write the request/.test(o.html) || !/data-r5-all>Add all at once/.test(o.html)) fail("16: no Write the request / Add all at once under the card");
    if (!/Change how often · weekly \/ every 2 weeks \/ monthly/.test(o.html) || !/data-rc-cadence="monthly"/.test(o.html)) fail("16: Change how often isn't on the ask");
    if (/data-customer-card/.test(o.html)) fail("16: the card carries the old card's hook (refreshAfterCustomers would swap it for the old one)");
  }
  // the real next date, for any cadence: the list's date + the cadence, weekday included
  const listAt = now - 3 * DAY; const L = { id: "L1", created_at: new Date(listAt).toISOString(), customers: [C1("María", asked(2)), C1("O'Brien", asked(1, { reviewed_mark: true })), C1("Lee", { stopped: true })] };
  for (const [cad, days] of [["weekly", 7], ["biweekly", 14], ["monthly", 30]]) {
    const o = card(id, { cadence: cad, lists: [L], isDone: true });
    const want = new Date(listAt + days * DAY).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (!o.html.includes(`Next list due <b>${want}</b>`)) fail(`16: on ${cad} the done card doesn't say the real next date (${want})`);
    if (/Monday/.test(textOf(o.html))) fail("16: the done card says Monday whatever the cadence");
    if (!/^Done \| /.test(pills(o)) || o.tone !== "ok") fail(`16: the done row isn't Done + its period (${pills(o)})`);
    if (!/2 customers asked/.test(o.html)) fail("16: a customer who asked to stop counts as asked");
    if (!/data-review-requests data-rv-ev data-rv-since=/.test(o.html)) fail("16: the done card's rows don't load (or lost the event shape)");
  }
  // the done rows keep their controls, and say what the reminder does
  { ctx.__d = { requests: [{ index: 0, list_id: "L1", name: "María", phone: "7205550131", email: "", already_marked: true, marked_at: ago(1), reminder: "Hi" }, { index: 1, list_id: "L1", name: "Jo", phone: "", email: "jo@x.co", already_marked: true, marked_at: ago(5), reminder: "Hi" }, { index: 2, list_id: "L1", name: "Lee", phone: "1", already_marked: true, marked_at: ago(5), reviewed_mark: true }, { index: 3, list_id: "L1", name: "Sam", phone: "1", already_marked: true, marked_at: ago(5), stopped: true }, { index: 4, list_id: "L1", name: "Ann", phone: "1", already_marked: true, marked_at: ago(5), reminded_at: ago(1), reminder: "Hi" }], matches: [] };
    const h = run("reviewEvRowsHtml(__d)");
    if (!/María<\/b> · asked · remind once from /.test(h)) fail("16: a recent ask doesn't say when it can be reminded");
    if (!/data-review-remind="1"[^>]*>Remind Jo once/.test(h) || !/href="mailto:/.test(h)) fail("16: the done card lost Remind once (or an email customer gets a text link)");
    if ((h.match(/data-review-reviewed=/g) || []).length !== 3 || (h.match(/data-review-stop=/g) || []).length !== 3) fail("16: They reviewed / They asked me to stop aren't on every open row of the done card");
    if (!/Lee<\/b> · reviewed ★/.test(h) || !/Sam<\/b> · asked not to be contacted/.test(h) || !/Ann<\/b> · asked · reminded /.test(h)) fail("16: the settled rows don't say what happened"); }
  // sending
  { const o = card(id, { cadence: "biweekly", lists: [{ id: "L", created_at: ago(2), customers: [C1("A", asked(1)), C1("B", asked(1, { reviewed_mark: true })), C1("C")] }] });
    if (!/2 of 3 asked/.test(o.html) || !/1 to go/.test(o.html) || !/^Your turn \| Every 2 weeks · /.test(pills(o))) fail("16: sending isn't \"2 of 3 asked · 1 to go\"");
    if ((o.html.match(/class="pm-rv-s /g) || []).length !== 3) fail(`16: the circles aren't one per customer on the list (${(o.html.match(/class="pm-rv-s /g) || []).length})`);
    if (!/<div data-review-requests data-rv-since=/.test(o.html)) fail("16: sending doesn't draw step 13's request rows"); }
  // two lists in a period are one period (a customer added later keeps the earlier ones on screen)
  { const o = card(id, { cadence: "biweekly", lists: [{ id: "L1", created_at: ago(5), customers: [C1("A", asked(4))] }, { id: "L2", created_at: ago(1), customers: [C1("B")] }] });
    if (!/1 of 2 asked/.test(o.html)) fail("16: a customer added mid-period pushes the earlier list off the card"); }
  // missed
  { const old = { id: "L", created_at: ago(20), customers: [C1("A", asked(19))] };
    const o = card(id, { cadence: "biweekly", lists: [old] });
    if (pills(o) !== "Your turn · missed last list") fail(`16: a missed list's pill isn't "Your turn · missed last list" (${pills(o)})`);
    const due = new Date(Date.parse(old.created_at) + 14 * DAY).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (!o.html.includes(`Your last list was due ${due}`)) fail("16: the missed card doesn't say when it was due");
    if (!/one missed list is fine/.test(o.html) || !/data-og-add>Add a customer/.test(o.html)) fail("16: the missed card isn't the page's");
    if (!/pm-og-addf/.test(o.html) || !/data-review-five/.test(o.html)) fail("16: Add a customer has no form to open");
    const none = card(id, { cadence: "weekly", lists: [] }); if (/missed/.test(pills(none))) fail("16: a client who never had a list reads as having missed one"); }
  // someone still to ask, past its date: stays open, without a period that's over
  { const o = card(id, { cadence: "weekly", lists: [{ id: "L", created_at: ago(30), customers: [C1("A", asked(29)), C1("B")] }] });
    if (pills(o) !== "Your turn" || !/1 of 2 asked/.test(o.html)) fail(`16: a list with someone still to ask dropped off the card (${pills(o)})`); }
  // a clock change inside the period (any zone): the due date stays on the calendar
  { const was = process.env.TZ;
    for (const tz of ["America/Denver", "America/Toronto", "Europe/London"]) { process.env.TZ = tz;
      ctx.__n = Date.parse("2026-10-30T18:00:00Z");   // both North American zones change clocks Nov 1, inside this period
      const c = run(`listCycle([], "biweekly", __n)`);
      const start = new Date(c.start), due = new Date(c.due);
      if (start.getDay() !== 1 || due.getDay() !== 1 || due.getHours() !== 0) fail(`16: in ${tz} the period doesn't run Monday to Monday (${start} → ${due})`); }
    if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
  if (!/const weekly = form\.hasAttribute\("data-r5-weekly"\)/.test(P) || !/if \(!weekly\) _openStep\.set\(clientId, "m1\.review\.first_5"\)/.test(P)) fail("16: saving the list touches step 13's state");
  if (!/h\.hasAttribute\("data-rv-ev"\) \? reviewEvRowsHtml\(data\) : html/.test(P)) fail("16: the done card's host doesn't draw the event rows");
  if (!/if \(listEl\.querySelector\("\[data-review-requests\]"\)\) loadReviewRequests\(clientId\);/.test(P)) fail("16: a redraw leaves the request rows empty");
  if (!/const sinceMs = Date\.parse\(body\.since \|\| ""\);/.test(RR) || !/lists\.flatMap\(\(l\) =>/.test(RR)) fail("16: the server returns only the newest list of a period");
}

// ── 17 · numbers ──
{ const id = "m2.snap.business_outcomes", q = "2027-01-01T12:00:00.000Z";
  const nd = card(id, { notDue: q });
  if (pills(nd) !== "Next: Jan 1" || !/Nothing needed now · we ask again in the first week of January/.test(nd.html) || /data-in-submit/.test(nd.html) || nd.tone !== "wait") fail(`17: not this quarter isn't the grey "Next: Jan 1" card (${pills(nd)})`);
  if (!/i\.status !== "skipped" && !i\.notDue\)\.length;/.test(P) || !/&& !i\.notDue\n/.test(P) || !/!r\.withRga && !r\.notDue &&/.test(P)) fail("17: not this quarter still counts as to do (the counter, the next-step card or the orange row)");
  const open = card(id);
  if (!/^Your turn \| [A-Z][a-z]{2} – [A-Z][a-z]{2}$/.test(pills(open))) fail(`17: your turn doesn't say the quarter (${pills(open)})`);
  if (!/2 numbers · about 2 minutes/.test(open.html) || !/for your quarterly report/.test(open.html) || !/Estimates are fine\./.test(open.html)) fail("17: the ask isn't the page's");
  if (!/placeholder="e\.g\. 12 of 20"/.test(open.html) || !/placeholder="e\.g\. 450"/.test(open.html) || !/<i>\$<\/i>/.test(open.html)) fail("17: the fields lost their examples or the $ sign");
  if ((open.html.match(/data-in-notsure-all/g) || []).length !== 1 || !/Not sure \(that's fine\)/.test(open.html)) fail("17: not one Not sure box");
  if (!/data-in-field="anything_unusual"/.test(open.html)) fail("17: the \"anything unusual\" note was dropped (it explains a dip in the report)");
  if (!/class="pm-k5-acts"><button type="button" class="pm-act is-go" data-in-submit>Send my numbers/.test(open.html)) fail("17: the button isn't under the card");
  const sent = card(id, { isDone: true, task: { status: "done", client_input: { jobs_from_leads: 12, jobs_from_leads_of: 20, avg_job_value: 450 }, client_input_at: ago(1) } });
  if (!/You sent your numbers/.test(sent.html) || /Used in your report/.test(sent.html) || /used them/.test(sent.html)) fail("17: it claims RGA used them the moment they're sent");
  if (pills(sent) !== "Done | RGA adds them to your report" || sent.tone !== "rga") fail(`17: sent isn't Done + RGA adds them (${pills(sent)})`);
  if (!/12 of 20/.test(sent.html) || !/\$450/.test(sent.html) || !/Leads that became jobs/.test(sent.html)) fail("17: the sent card doesn't read back what they gave");
  if (!/data-step-reopen="m2\.snap\.business_outcomes">Change something/.test(sent.html)) fail("17: sent has no Change something");
  const unsure = card(id, { isDone: true, task: { status: "done", client_input: { jobs_from_leads: 7, not_sure: ["avg_job_value"] }, client_input_at: ago(1) } });
  if (!/Not sure/.test(unsure.html) || /\$0/.test(unsure.html)) fail("17: \"Not sure\" reads as a number");
  const t2 = { status: "done", client_input: { jobs_from_leads: 12, avg_job_value: 450 }, client_input_at: ago(8), rga_confirmed: { at: ago(1), by: "rga" } };
  const used = card(id, { isDone: true, task: t2, locked: STEP_LOCK.stepLock(id, t2, {}) });
  if (!/Used in your report/.test(used.html) || pills(used) !== "Done" || used.tone !== "ok" || /data-step-reopen/.test(used.html)) fail("17: used isn't \"Used in your report\" (no reopen)");
  if (!/Locked · \$\{escapeHtml\(stepId === "m2\.snap\.business_outcomes" \? "in your report"/.test(P)) fail("17: the lock doesn't read \"Locked · in your report\"");
  if (!/data-in-notsure-all\]"\)\?\.checked/.test(P)) fail("17: the one Not sure box isn't sent");
  // the server: free text has no format
  const vs = /function validate\(spec, raw\) \{/.exec(SI); if (!vs) moved("validate in portal-step-input");
  const ve = SI.indexOf("\n}\n", vs.index); const vctx = vm.createContext({ Number, String, Array, Object, URL, require: () => ({}) });
  try { vm.runInContext(SI.slice(vs.index, ve + 2), vctx); } catch (e) { console.error(`⚠️  INDETERMINATE — validate doesn't load (${e.message})`); process.exit(2); }
  vctx.__s = (PB.month2plus.find((s) => s.id === id) || {}).clientInput;
  const tryV = (v) => { vctx.__v = v; return vm.runInContext("validate(__s, __v)", vctx); };
  for (const [v, jobs, of] of [["12 of 20", 12, 20], ["12/20", 12, 20], ["12 out of 20", 12, 20], ["about 12", 12, undefined], ["12", 12, undefined], ["12 jobs", 12, undefined], ["1,200", 1200, undefined]]) {
    const r = tryV({ jobs_from_leads: v, avg_job_value: "$450" });
    if (r.error || r.value.jobs_from_leads !== jobs || r.value.jobs_from_leads_of !== of || r.value.avg_job_value !== 450) fail(`17: "${v}" isn't read as ${jobs}${of ? ` of ${of}` : ""} (${JSON.stringify(r)})`); }
  if (!tryV({ jobs_from_leads: "a few", avg_job_value: "450" }).error) fail("17: \"a few\" is stored as a number");
  if (!tryV({ jobs_from_leads: "12", avg_job_value: "10 of 20" }).error) fail("17: \"of\" is taken on a field that doesn't mean it");
  const ns = tryV({ jobs_from_leads: "", avg_job_value: "", not_sure: ["jobs_from_leads", "avg_job_value"] });
  if (ns.error || (ns.value.not_sure || []).length !== 2) fail("17: Not sure on both isn't an answer");
  if (!tryV({ jobs_from_leads: "", avg_job_value: "450" }).error) fail("17: a blank with no Not sure is taken as an answer");
  vctx.__s = (PB.month2plus.find((s) => s.id === "m2.win_story.capture") || {}).clientInput || { kind: "x" };
  const st = tryV({ job: "  burst pipe at O'Brien's ", what: "Fixed it.", ok_first_name: true });
  if (st.error || st.value.job !== "burst pipe at O'Brien's" || st.value.ok_first_name !== true) fail(`win story: the server doesn't take a story (${JSON.stringify(st)})`);
  if (!tryV({ job: "", what: "x" }).error || !tryV({ job: "x", what: "" }).error) fail("win story: a blank story is saved");
  if (tryV({ job: "x", what: "y", ok_first_name: "yes" }).value?.ok_first_name !== false) fail("win story: anything but a real tick reads as OK to use their name");
  if (!/spec\.kind === "story"/.test(AD)) fail("win story: admin can't read the story");
  if (!/\$\{v\[`\$\{f\.key\}_of`\] != null/.test(AD) || !/\(v\.not_sure \|\| \[\]\)\.includes\(f\.key\) \? "Not sure"/.test(AD)) fail("17: admin drops \"of 20\" or shows a dash for Not sure");
}

// ── 18 · photos ──
{ const id = "m2.exec.gbp_photos", ph = (o) => ({ id: "p", created_at: ago(1), storage_path: "c/x.jpg", category: "at_work", shot_n: null, ...o });
  const open = card(id);
  if (pills(open) !== `Optional | ${run("ogMonth()")}` || open.tone !== "you") fail(`18: open isn't Optional + the month (${pills(open)})`);
  if (!/New photos keep your profile fresh/.test(open.html) || !/0 this month/.test(open.html) || !/Suggested, no deadline\./.test(open.html) || !/A before and after/.test(open.html)) fail("18: the open card isn't the page's");
  if (/\b5 (new )?photos|of 5|quota/i.test(textOf(open.html))) fail("18: quota wording contradicts \"suggested\"");
  if (!/data-og-photos/.test(open.html) || !/pm-act is-go">Add photos/.test(open.html) || !/Remind me later/.test(open.html) || !/data-later-step="m2\.exec\.gbp_photos"/.test(open.html)) fail("18: Add photos / Remind me later aren't under the card");
  if (/We'll email|by email/i.test(open.html)) fail("18: it promises a reminder email (the nightly only sends step 10's)");
  if (/data-photo-upload-form|pm-m18-up/.test(open.html) || /Check again/.test(open.html)) fail("18: the legacy upload form or Check again came back");
  const rev = card(id, { photos: [ph({ publish_state: "in_review" }), ph({ publish_state: "in_review", category: "team" })] });
  if (pills(rev) !== "With RGA · 2 to review" || rev.tone !== "rga" || !/2 photos with RGA for review/.test(rev.html) || !/RGA checks each, usually the same day/.test(rev.html)) fail(`18: uploaded photos don't show as with RGA (${pills(rev)})`);
  if (!/>Job</.test(rev.html) || !/>Team</.test(rev.html)) fail("18: a tile doesn't name its kind");
  const on = (n, x = {}) => Array.from({ length: n }, () => ph({ publish_state: "published", pushed_to_gbp: true, pushed_at: ago(1), ...x }));
  const dn = card(id, { isDone: true, photos: [...on(2), ph({ publish_state: "in_review" })] });
  if (!/2 added this month/.test(dn.html) || !/2 photos/.test(dn.html) || !/With RGA · 1 to review/.test(pills(dn))) fail(`18: done doesn't count what's on Google (${pills(dn)})`);
  const nx = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!dn.html.includes(`Next month opens ${nx}.`)) fail(`18: "Next month opens" isn't the 1st, in the client's own time zone (${nx})`);
  if (!/pm-amend">Add more/.test(dn.html)) fail("18: done has no Add more");
  const back = card(id, { photos: [ph({ publish_state: "turned_down", review_note: "Too dark.\nHow to fix: Retake it." })] });
  if (!/RGA couldn't use 1 photo/.test(back.html) || !/Too dark\./.test(back.html) || /How to fix/.test(back.html) || !/^Your turn/.test(pills(back))) fail("18: a photo RGA turned down doesn't say so");
  const old = card(id, { photos: [{ ...ph({ publish_state: "published", pushed_to_gbp: true }), created_at: ago(70) }] });
  if (!/0 this month/.test(old.html)) fail("18: last month's photos count as this month's");
  const lat = card(id, { later: { until: ago(-7) } });
  if (!/^Later · /.test(pills(lat)) || !/Add photos/.test(lat.html)) fail("18: a later row can't add a photo");
  if (!/LATER_STEPS = \[[^\]]*"m2\.exec\.gbp_photos"/.test(SL) || !/"m2\.exec\.gbp_photos": "new photos"/.test(P)) fail("18: the server or the portal refuses Remind me later");
  if (!/input\[data-og-photos\]/.test(P) || !/uploadClientPhotos\(clientId, files, \{ category: "additional" \}/.test(P)) fail("18: the upload isn't the shared uploader (RGA's review)");
}

// ── 19 · video ──
{ const id = "m2.exec.youtube_video", SCRIPT = { summary: "TITLE: Why\nHOOK: Is it?\nSCRIPT: Here is what to check.\nCTA: Call us." };
  const ns = card(id);
  if (pills(ns) !== "Optional | RGA writes the script" || ns.tone !== "rga" || /data-in-submit/.test(ns.html) || !/It shows here when it's ready/.test(ns.html)) fail(`19: no script yet isn't "RGA writes your script first" with nothing to do (${pills(ns)})`);
  const go = card(id, { task: SCRIPT });
  if (pills(go) !== "Optional | Script ready" || go.tone !== "you" || !/1 short video/.test(go.html) || !/Read the script/.test(go.html) || !/Here is what to check\./.test(go.html)) fail(`19: script ready isn't the page's (${pills(go)})`);
  if (!/<div class="pm-k5-acts"><button type="button" class="pm-act is-go" data-in-submit>Send my video<\/button>/.test(go.html)) fail("19: the button isn't under the card");
  if (!/data-og-skip="m2\.exec\.youtube_video">Skip this quarter/.test(go.html)) fail("19: the client can't skip a quarter");
  if (!/Paste a Google Drive, Dropbox or YouTube link/.test(go.html)) fail("19: the field's words aren't the page's");
  const sk = card(id, { isDone: true, status: "skipped", task: { status: "skipped", skipped_by: "client", skipped_at: ago(1) } });
  if (!/No video this quarter · your choice/.test(sk.html) || pills(sk) !== "Skipped" || !/data-step-reopen="m2\.exec\.youtube_video">Send one after all/.test(sk.html) || /RGA received/.test(sk.html)) fail("19: skipped isn't the page's");
  const adminSk = card(id, { isDone: true, status: "skipped", task: { status: "skipped" } });
  if (/your choice/.test(adminSk.html)) fail("19: \"your choice\" over a skip RGA made");
  const sent = card(id, { isDone: true, task: { status: "done", client_input: "https://drive.google.com/x", client_input_at: ago(1) } });
  if (!/You sent your video/.test(sent.html) || /RGA received/.test(sent.html) || !/data-step-reopen=/.test(sent.html)) fail("19: \"received\" before RGA has it");
  const t2 = { status: "done", client_input: { value: "https://drive.google.com/x" }, client_input_at: ago(3), rga_confirmed: { at: ago(1) } };
  const got = card(id, { isDone: true, task: t2, locked: STEP_LOCK.stepLock(id, t2, {}) });
  if (!/RGA received your video/.test(got.html) || !/drive\.google\.com\/x ↗/.test(got.html) || !/RGA edits and posts it/.test(got.html) || /data-step-reopen/.test(got.html) || !got.noAsk) fail("19: received isn't the page's (an object link read wrong, or it can still be changed)");
  const nd = card(id, { notDue: "2027-01-01T12:00:00.000Z" });
  if (pills(nd) !== "Optional | Next: Jan 1" || /data-in-submit/.test(nd.html)) fail("19: outside its quarter it still asks");
  const adone = card(id, { notDue: "2027-01-01T12:00:00.000Z", isDone: true, status: "skipped", task: { status: "skipped", skipped_by: "client" } });
  if (!/your choice/.test(adone.html)) fail("19: a skip reads as not due");
  // the server's skip
  const si = SC.indexOf("if (body.skip_period === true)"); if (si < 0) moved("skip_period");
  const se = SC.indexOf("\n  }\n", si), blk = SC.slice(si, se);
  if (SC.indexOf("requirePortalOwner(event, clientId)") > si || SC.indexOf("requirePortalOwner(event, clientId)") < 0) fail("19: the skip runs before the owner check");
  if (!/const SKIP_PERIOD = new Set\(\["m2\.exec\.youtube_video", "m2\.win_story\.capture"\]\);/.test(blk) || !/!SKIP_PERIOD\.has\(stepId\)/.test(blk)) fail("19: the skip has no allow-list");
  if (!/stepLock\(stepId, prev, rec\.data\)/.test(blk) || !/prev\.status === "done"/.test(blk)) fail("19: a locked or answered step can be skipped");
  if (!/after\?\.tasks\?\.\[stepId\]\?\.status !== "skipped"/.test(blk) || !/skipped_by: "client"/.test(blk) || !/recordMeta\(rec\)/.test(blk)) fail("19: the skip isn't read back or doesn't say who");
  if (!/skip_period: true/.test(P) || !/\[data-og-skip\]/.test(P)) fail("19: the link posts nothing");
}

// ── 20 · the monthly call ──
{ const id = "m2.call.monthly", rep = { "m2.report.deliver": { status: "done", completed_at: ago(1) } };
  const w = card(id);
  if (pills(w) !== "Opens when your report is out" || w.tone !== "wait" || !/First: your monthly report/.test(w.html) || !/about [A-Z][a-z]{2} 3/.test(w.html) || /Month 1/.test(w.html) || /pm-lock/.test(w.html)) fail(`20: the wait isn't a card (${pills(w)})`);
  const pk = card(id, { tasks: rep });
  if (pills(pk) !== "Your turn | 20 min" || pk.tone !== "you" || !/data-closeout-call/.test(pk.html)) fail(`20: report out isn't the picker (${pills(pk)})`);
  const dn = card(id, { isDone: true, tasks: rep, task: { status: "done", completed_at: ago(1) } });
  if (!/Call held/.test(dn.html) || !/Read [A-Z][a-z]+'s report ›/.test(dn.html) || !/Notes from the call show here when RGA records them\./.test(dn.html) || !dn.noLock || /Change/.test(dn.html)) fail("20: held isn't the page's");
  const dn2 = card(id, { isDone: true, task: { status: "done" } });
  if (/report ›/.test(dn2.html)) fail("20: a report link with no report behind it");
  const cc = fn("closeCallStateHtml");
  if (/Month 1/.test(cc.replace(/rec\.why === "report" \? "your Month 1 report is ready the day before\." :[^`]*`/, "").replace(/\? "Your Month 1 report" /g, "").replace(/"<b>Your Month 1 report<\/b>"/, "")) && !/ccPurpose\(clientId\) !== "m2_monthly" \? `RGA recommends/.test(cc)) fail("20: the picker's reason can say Month 1");
  if (!/rec && ccPurpose\(clientId\) !== "m2_monthly" \? `RGA recommends/.test(cc)) fail("20: the picker's reason text can say Month 1");
  if (!/" · the day after your report"/.test(cc) || !/state: m2 \? "ok" : "rga"/.test(cc) || !/csEv\("<b>In your calendar<\/b> · invite sent"\)/.test(cc) || !/`\$\{escapeHtml\(ogMonth\(\)\)\} report`/.test(cc)) fail("20: the picker / booked card aren't the page's");
  if (!/\{ text: "Booked", cls: "done", tone: "ok" \}/.test(fn("closeCallPill")) || !/text: "RGA confirms your time"/.test(fn("closeCallPill"))) fail("20: the pill doesn't follow the card");
  if (!/monthlyRecommendation\(rows\?\.\[0\]\?\.data\?\.tasks\?\.\["m2\.report\.deliver"\], slots\)/.test(KA)) fail("20: nothing asks for RGA's recommended time");
  { const ma = /function monthlyRecommendation\(deliver, slots\) \{/.exec(KA); if (!ma) moved("monthlyRecommendation");
    const kc = vm.createContext({ Date, Number }); vm.runInContext(KA.slice(ma.index, KA.indexOf("\n}\n", ma.index) + 2), kc);
    const sent = Date.parse("2026-11-01T09:00:00Z"), sl = [{ start: "2026-11-01T17:00:00Z" }, { start: "2026-11-02T10:00:00Z" }, { start: "2026-11-02T17:00:00Z" }];
    kc.__a = { status: "done", completed_at: new Date(sent).toISOString() }; kc.__s = sl;
    const rec = vm.runInContext("monthlyRecommendation(__a, __s)", kc);
    if (!rec || rec.start !== "2026-11-02T10:00:00.000Z".replace(".000", "") || rec.why !== "report") fail(`20: RGA recommends isn't the first time from the day after the report (${JSON.stringify(rec)})`);
    kc.__a = { status: "pending" }; if (vm.runInContext("monthlyRecommendation(__a, __s)", kc)) fail("20: a recommendation with no report behind it");
    kc.__a = { status: "done", completed_at: new Date(sent + 90 * DAY).toISOString() }; if (vm.runInContext("monthlyRecommendation(__a, __s)", kc)) fail("20: it recommends a time before the report"); }
  if (!/if \(j\.unavailable && host\.closest\("\.pm-cs"\)\)/.test(P)) fail("20: \"We'll book this call\" is still the old card on a system row");
}

// ── posts + replies ──
{ const m = run("ogMonth()"), Q = (st) => st.map((s, i) => ({ week: i + 1, status: s, due: ago(-i), posted_at: s === "live" ? ago(1) : null }));
  const D0 = { key: "m2.exec.gbp_posts", prepared_at: ago(1), approval: null };
  const row = (d) => { ctx.__d = d; return run("ogPostsRow(__d)"); };
  const dr = row({ tasks: {}, deliverables: [] });
  if (!new RegExp(`RGA is writing ${m}'s 4 posts`).test(textOf(dr)) || !/RGA is on it/.test(dr)) fail("posts: no draft isn't \"RGA is writing\"");
  // a draft RGA hasn't cleared isn't "ready": the deliverable is the truth, not the task
  const un = row({ tasks: { "m2.exec.gbp_posts": { status: "done", outcome_data: { posts: [1, 2, 3, 4] } } }, deliverables: [] });
  if (/ready for your approval/.test(un)) fail("posts: a draft RGA hasn't cleared reads as ready for approval");
  const rd = row({ tasks: { "m2.exec.gbp_posts": { outcome_data: { posts: [1, 2, 3, 4] } } }, deliverables: [D0] });
  if (!/4 posts ready for your approval/.test(rd) || !/data-goto-approve>Open For your approval/.test(rd) || !/>For your approval</.test(rd) || /data-ib-do|data-ap=/.test(rd)) fail("posts: ready doesn't point to the one place to approve");
  const ok = { approval: { decision: "approved", at: ago(2) } };
  const ap = row({ tasks: { "m2.exec.gbp_posts": { ...ok, post_queue: Q(["live", "queued", "queued", "queued"]) } }, deliverables: [{ ...D0, ...ok }], maps: "https://maps.google.com/x" });
  if (!/1 of 4 live/.test(ap) || (ap.match(/live on Google/g) || []).length !== 1 || (ap.match(/· goes up/g) || []).length !== 3 || />Live</.test(ap) || !/>Approved</.test(ap)) fail("posts: an approved post reads as live before it is");
  if (!/See it on Google Maps/.test(ap) || !/How this step works/.test(ap)) fail("posts: the approved card has no foot");
  const bad = row({ tasks: { "m2.exec.gbp_posts": { ...ok, post_queue: Q(["live", "failed", "processing", "rejected"]) } }, deliverables: [{ ...D0, ...ok }] });
  if ((bad.match(/live on Google/g) || []).length !== 1 || !/Google said no/.test(bad) || !/Google is checking it/.test(bad)) fail("posts: a refused or processing post isn't said as that");
  const al = row({ tasks: { "m2.exec.gbp_posts": { ...ok, post_queue: Q(["live", "live", "live", "live"]) } }, deliverables: [{ ...D0, ...ok }] });
  if (!/4 of 4 live/.test(al) || !/>Live</.test(al)) fail("posts: all live doesn't say Live");
  const noq = row({ tasks: { "m2.exec.gbp_posts": { ...ok } }, deliverables: [{ ...D0, ...ok }] });
  if (/live/.test(textOf(noq)) || !/RGA is getting your approved posts ready/.test(noq)) fail("posts: approved with nothing queued reads as live");
  const ch = row({ tasks: {}, deliverables: [{ ...D0, approval: { decision: "changes", at: ago(1) } }] });
  if (!new RegExp(`RGA is rewriting ${m}'s posts`).test(textOf(ch))) fail("posts: asked-for changes reads as anything else");
  if (!/const goesUpLater = d\.key === "m2\.exec\.gbp_posts" \? !\(d\.live && d\.live\.total && d\.live\.posted === d\.live\.total\)/.test(P) || !/const at = d\.site_live \? 4 : c \|\| goesUpLater \? 2 : 4;/.test(P)) fail("posts: For your approval's crumb says Live the moment they're approved");
  // replies
  const R0 = { key: "m2.exec.review_responses", prepared_at: ago(1), approval: null };
  const rep = (d) => { ctx.__d = d; return run("ogRepliesRow(__d)"); };
  const open2 = { feed: { reviews: [{ id: "1", name: "María G.", stars: 5, at: ago(2) }, { id: "2", name: null, anonymous: true, stars: 4, at: ago(3) }] } };
  const r1 = rep({ tasks: { "m2.exec.review_responses": { outcome_data: { unanswered: 2 } } }, deliverables: [R0], feed: open2 });
  if (!/2 replies ready for your approval/.test(r1) || !/María G\./.test(r1) || !/A Google user/.test(r1) || (r1.match(/reply drafted/g) || []).length !== 2 || !/data-goto-approve/.test(r1)) fail("replies: ready isn't the page's");
  const r2 = rep({ tasks: { "m2.exec.review_responses": { outcome_data: { unanswered: 5 } } }, deliverables: [R0], feed: open2 });
  if (/reply drafted/.test(r2) || !/5 replies ready/.test(r2)) fail("replies: a row names a review we can't tie to the draft");
  const r3 = rep({ tasks: {}, deliverables: [R0], feed: open2 });
  if (/\d replies ready/.test(r3) || /NaN/.test(r3)) fail("replies: a number with nothing behind it");
  const pst = rep({ tasks: {}, deliverables: [], feed: { feed: { reviews: [{ id: "1", name: "Ana", replied_at: ago(0), at: ago(4) }, { id: "2", name: "Lee", replied_at: ago(40), at: ago(50) }] } } });
  if (!/1 reply posted on Google/.test(pst) || !/Ana<\/b> · replied/.test(pst) || /Lee/.test(pst) || !/>Posted</.test(pst)) fail("replies: posted isn't what Google shows replied this month");
  if (rep({ tasks: {}, deliverables: [], feed: { feed: { reviews: [] } } })) fail("replies: a card with nothing to say");
  const ra = rep({ tasks: {}, deliverables: [{ ...R0, approval: { decision: "approved" } }], feed: { feed: { reviews: [] } } });
  if (/posted on Google/.test(ra)) fail("replies: approved reads as posted");
  if (!/ogHost\("replies"\)\}\$\{month2StepsHtml\}\$\{ogHost\("posts"\)\}/.test(P)) fail("replies + posts aren't on Ongoing work");
  if (!/ogSet\(clientId, \{ deliverables: data\.deliverables \|\| \[\] \}\)/.test(P) || !/ogSet\(clientId, \{ feed: data \}\)/.test(P)) fail("the cards don't hear about the approvals or the reviews");
  if (!/No reply yet · RGA drafts one for your approval/.test(fn("reviewsFeedHtml"))) fail("reviews: \"No reply yet\" doesn't say what happens");
}

// ── win story ──
{ const id = "m2.win_story.capture", s = PB.month2plus.find((x) => x.id === id) || {};
  if (s.clientBucket !== "supply" || s.clientDone !== "client" || (s.clientInput || {}).kind !== "story" || !s.clientNumberless) fail("win story: the step isn't the client's in the playbook");
  if (!/const ONGOING_ORDER = \[[^\]]*"m2\.win_story\.capture"\]/.test(P)) fail("win story: not in the card order");
  const o = card(id);
  if (pills(o) !== `Your turn | ${run("ogMonth()")}` || !/One job you're proud of this month/.test(textOf(o.html)) || !/about 2 min/.test(o.html)) fail(`win story: the ask isn't the page's (${pills(o)})`);
  if (!/data-in-field="job"/.test(o.html) || !/data-in-field="what"/.test(o.html) || !/data-in-story-name/.test(o.html) || !/OK to use their first name/.test(o.html)) fail("win story: the form lost a field");
  if (!/data-in-kind="story"/.test(o.html) || !/data-in-submit>Send my story/.test(o.html) || !/data-og-skip="m2\.win_story\.capture">Skip this month/.test(o.html)) fail("win story: no Send my story / Skip this month");
  if (!/kind === "story"/.test(P) || !/ok_first_name: !!wrap\.querySelector\("\[data-in-story-name\]"\)\?\.checked/.test(P)) fail("win story: the form sends nothing");
  const dn = card(id, { isDone: true, task: { status: "done", client_input: { job: "x", what: "y" }, client_input_at: ago(1) } });
  if (!/Story received/.test(dn.html) || !/RGA writes it up as a Google post/.test(dn.html) || !/It comes to For your approval\./.test(dn.html)) fail("win story: done isn't the page's");
  const sk = card(id, { isDone: true, status: "skipped", task: { status: "skipped", skipped_by: "client", skipped_at: ago(1) } });
  if (!/No story this month · your choice/.test(sk.html) || !/Send one after all/.test(sk.html)) fail("win story: skipped isn't said");
}

// ── in Chrome: tiles never overlap (2 and 20), nothing pushes a 400px page sideways ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
{ const ph = (i) => ({ id: "p" + i, created_at: ago(1), storage_path: "", category: ["at_work", "team", "exterior", "additional"][i % 4], publish_state: "in_review", shot_n: null });
  const longPlumber = "Bartholomew-Featherstonehaugh";
  const htmls = {
    tiles2: card("m2.exec.gbp_photos", { photos: [ph(0), ph(1)] }).html, tiles20: card("m2.exec.gbp_photos", { photos: Array.from({ length: 20 }, (_, i) => ph(i)) }).html,
    numbers: card("m2.snap.business_outcomes").html,
    list: card("m2.exec.review_push", { cadence: "biweekly" }).html,
    done: card("m2.exec.review_push", { cadence: "monthly", isDone: true, lists: [{ id: "L", created_at: ago(1), customers: [{ first_name: longPlumber, marked_sent_by_client: true, marked_sent_at: ago(1) }] }] }).html,
    story: card("m2.win_story.capture").html, video: card("m2.exec.youtube_video", { task: { summary: "SCRIPT: Do it." } }).html };
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 900 });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${C}</style></head><body style="margin:0"><div id="h"></div></body></html>`);
    for (const [k, h] of Object.entries(htmls)) {
      const r = await page.evaluate((h) => { const w = document.getElementById("h"); w.innerHTML = `<div class="pm-step-row pm-cs cs-you" style="box-sizing:border-box;padding:16px"><div class="pm-doit">${h}</div></div>`;
        const ts = [...w.querySelectorAll(".pm-og-t")].map((e) => e.getBoundingClientRect()); let overlap = 0;
        for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (ts[i].left < ts[j].right - .5 && ts[j].left < ts[i].right - .5 && ts[i].top < ts[j].bottom - .5 && ts[j].top < ts[i].bottom - .5) overlap++;
        const clip = [...w.querySelectorAll(".pm-og-t .lab")].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        return { overlap, clip, tiles: ts.length, sw: document.scrollingElement.scrollWidth }; }, h);
      if (k === "tiles2" && r.tiles !== 2) fail("18: not one tile per photo");
      if (k === "tiles20" && r.tiles !== 20) fail("18: not one tile per photo (20)");
      if (r.overlap || r.clip) fail(`${k}: ${r.overlap} tile(s) overlap, ${r.clip} label(s) clipped`);
      if (r.sw > 400) fail(`${k}: a 400px page scrolls sideways (${r.sw})`);
    }
    if (/overflow-wrap:\s*anywhere/.test(C.slice(C.indexOf(".pm-cs .pm-og-tiles"), C.indexOf(".pm-cs .pm-og-t .lab")))) fail("18: tiles break a word mid-letter");
  } finally { await browser.close(); }
}
if (!/document\.addEventListener\("change", async \(e\) => \{\n  const input = e\.target && e\.target\.closest && e\.target\.closest\("input\[data-og-photos\]"\);/.test(P)) fail("18: nothing handles the upload");
if (P.indexOf('e.target.closest("input[data-og-photos]")') > P.indexOf('closest("[data-p10-t], [data-p10-kind]")')) fail("the Ongoing handlers sit after step 10's (which must stay last)");

if (F.length) { console.error(`🔴 the Ongoing work cards drifted from the approved pages — ${F.length} problem(s):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Ongoing work is on the one card design (client_step16–20 + client_ongoing_* approved 10-29): 16's period + due date follow the cadence, done keeps its controls, missed says so once; 17 sent ≠ used; 18 no quota, With RGA, counted on Google; 19 skips itself; 20's wait is a card; posts live only when live; replies from Google; win story reaches the client");
