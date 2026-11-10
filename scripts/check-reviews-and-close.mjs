#!/usr/bin/env node
// check-reviews-and-close.mjs — 2026-10-20, approved phase3_4_reviews_close_v1 (final review R5). RUNS the review policy, the
// Month 1 report builder and the done-record fallback on fakes, and pins:
//   13 reviews   — a request never asks the customer to name/mention a staff member (Google, April 2026); past 10 asks in a day
//                  the client is TOLD to spread them (never refused)
//   14 videos    — optional: never "your next step", "Skip videos" is a real answer (skipped, read back, undoable), no wait on
//                  website access
//   15 close-out — the Month 1 report waits only on the KPI baseline, runs from kickoff + 27 on what's done, and lists what's
//                  still open; admin says skip the call after day 35 so Month 2 starts
//   every step   — a done row that would say nothing gets who finished it + when, in plain words (never "Not recorded", 10-26)
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const read = (p) => { try { return fs.readFileSync(p.startsWith("/") ? p : `${SITE}/${p}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (m) => { try { return req(`${SITE}/netlify/functions/${m}`); } catch (e) { console.error(`⚠️  ${m} won't load: ${e.message}`); process.exit(2); } };
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), PB = JSON.parse(read("data/playbooks/playbooks.json")), M1 = read(`${SCR}/flow/playbooks/month1.mjs`);
const RR = read("netlify/functions/portal-review-requests.js"), VC = read("netlify/functions/portal-video-clip.js"), EX = read("netlify/functions/flow-execute.js");
const F = [], fail = (m) => F.push(m);
const A = Object.fromEntries([...PB.month1, ...PB.month2plus].map((s) => [s.id, s]));
// ── 13 · reviews
const R = load("_review-policy.js");
for (const bad of ["Could you mention your technician in the review? {{review_link}}", "Please name the tech who came out {{review_link}}", "Give a shout-out to our crew member {{review_link}}", "Tell us by name who helped {{review_link}}"])
  if (!R.reviewMessageProblems(bad).some((x) => /staff member/.test(x))) fail(`step 13: a staff-name ask passes the policy ("${bad.slice(0, 40)}…")`);
for (const ok of ["Hi Sam, thanks for choosing Rocket Plumbing! Would you leave a quick review? {{review_link}} Thanks, Ana", "Thanks again from the whole team. A review helps others find us: {{review_link}}"])
  if (R.reviewMessageProblems(ok).length) fail(`step 13: an honest request is refused (${R.reviewMessageProblems(ok).join("; ")})`);
if (!/if \(today > 10\) pace = \{ today, note:/.test(RR) || /today > 10\) return json\(4/.test(RR)) fail("step 13: past 10 asks in a day the client isn't told, or the save is refused");
if (!/j\.pace && j\.pace\.note \? j\.pace\.note/.test(P) || !/asking them to name a staff member/.test(P)) fail("step 13: the portal doesn't show the pace note or the staff rule");
// ── 14 · videos
const y = A["m1.brand.youtube_setup"] || {};
if (!y.clientOptional || (y.dependsOn || []).includes("m1.access.website")) fail("step 14: videos aren't optional, or still wait on website access");
if (/id: "m1\.brand\.youtube_setup"[^\n]*\n\s*type: "[a-z]+", dependsOn: \[[^\]]*"m1\.access\.website"/.test(M1)) fail("step 14: the canonical SOP still makes videos wait on website access");
if (!/if \(b\.kind === "skip" \|\| b\.kind === "unskip"\)/.test(VC) || !/b\.kind === "skip" \? st0 !== "skipped" : st0 === "skipped"\) return jsonRes\(500/.test(VC)) fail("step 14: Skip videos isn't saved as skipped (read back) or can't be undone");
if (!/isOpenRow\(r\) && (?:r\.status !== "flagged" && )?theirs\(r\) && !r\.step\.clientOptional/.test(P) || !/theirsToAct && step\.clientOptional \? \{ text: "Optional"/.test(P)) fail("step 14: an optional step can be \"your next step\" or reads \"Your turn\"");
if (!/data-video-skip=/.test(P) || !/Google doesn't rank you on them/.test(P)) fail("step 14: the card lost Skip or the honest why");
// ── 15 · close-out, RUN the report
if (JSON.stringify(A["m1.report.month1"]?.dependsOn) !== JSON.stringify(["m1.audit.kpi_baseline"])) fail("step 15: the Month 1 report waits on more than the KPI baseline (photos / reviews / the build hold Month 1 again)");
if (!/id: "m1\.report\.month1"[^\n]*\n\s*type: "[a-z]+", dependsOn: \["m1\.audit\.kpi_baseline"\]/.test(M1)) fail("step 15: the canonical SOP disagrees on the report's dependsOn");
if (!/const opensAt = kAt \+ 27 \* 86400000;\s*if \(Date\.now\(\) < opensAt\) return \{/.test(EX)) fail("step 15: the report can run before kickoff + 27");
const MR = load("_month1-report.js");
const tasks = { "m1.kickoff.call": { status: "done", completed_at: "2026-09-20T15:00:00Z" }, "m1.gbp.photos": { status: "in_progress", detected: { n: 14, threshold: 20, noun: "photo" } },
  "m1.review.first_5": { status: "pending" }, "m1.gbp.hours_attributes": { status: "done", completed_at: "2026-09-25T10:00:00Z" }, "m1.brand.youtube_setup": { status: "pending" } };
const rep = MR.buildMonth1Report({ client: { business_name: "Rocket Plumbing" }, tasks, playbook: PB.month1, months: [], baseline: {}, kickoffAt: tasks["m1.kickoff.call"].completed_at });
const open = (rep.sections.find((s) => s.key === "open") || {}).lines || [];
if (!open.some((l) => /20\+ business photos.*\(14 of 20 photos\)/.test(l))) fail(`step 15: "Still open" doesn't list the photos with their count (${open.join(" | ")})`);
if (!open.some((l) => /customers/i.test(l))) fail("step 15: \"Still open\" misses the review asks");
if (open.some((l) => /video/i.test(l))) fail("step 15: an optional step (videos) is listed as still open");
if (open.some((l) => /hours/i.test(l))) fail("step 15: a done step is listed as still open");
if (/still open/i.test(rep.text) && !/carries into month 2/i.test(rep.text)) fail("step 15: \"Still open\" doesn't say it carries into Month 2");
// ── month1_report_v2 (approved, the owner 11-9): the report stops contradicting itself
{
  const kt = { ...tasks, "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T15:00:00Z" }, "m1.review.response": { status: "done", completed_at: "2026-11-09T10:00:00Z", outcome_data: { reviews: { total: 0 } } },
    "m1.gbp.photos": { status: "skipped", skipped_at: "2026-11-09T11:00:00Z", skipped_by: "rga" }, "m1.gbp.hours_attributes": { status: "skipped", skipped_at: "2026-11-09T11:00:00Z", skipped_by: "rga", skip_reason: "the client has no set hours" } };
  const blk = { business_name: "Rocket Plumbing" }, NOW9 = new Date("2026-11-09T18:00:00Z");
  const R2 = MR.buildMonth1Report({ client: blk, tasks: kt, playbook: PB.month1, months: [], now: NOW9, kickoffAt: kt["m1.kickoff.call"].completed_at,
    baseline: { gsc_impressions: 9471, gsc_clicks: 1, gsc_window: "28d", captured_at: "2026-09-15T10:00:00Z" },
    pageMeasures: [{ url: "https://x.example/a", published_at: "2026-11-08T10:00:00Z", measure: { state: "ok", windows: [{ weeks: 2, state: "not_yet" }, { weeks: 4, state: "not_yet" }, { weeks: 8, state: "not_yet" }] } },
      { url: "https://x.example/b", published_at: "2026-09-01T10:00:00Z", measure: { state: "ok", windows: [{ weeks: 2, state: "ok", clicks: 1234, impressions: 56789, position: 4.2 }] } }] });
  const sec = (k) => (R2.sections.find((x) => x.key === k) || { lines: [] }).lines;
  if (!/covering the work from the start through Nov 9\./.test(sec("summary")[0]) || /since the kickoff/.test(R2.text)) fail(`report v2: the summary says "since the kickoff" or doesn't name the build date (${sec("summary")[0]})`);
  if (!sec("baseline").some((l) => /^Google Search in the 28 days before Sep 15: 9,471 impressions, 1 click$/.test(l))) fail(`report v2: the search baseline doesn't name its period with thousands commas (${sec("baseline").join(" | ")})`);
  if (!sec("work").some((l) => /^Checked your Google reviews: none yet, nothing to reply to \(Nov 9\)$/.test(l)) || sec("work").some((l) => /Respond to all existing reviews/i.test(l))) fail(`report v2: zero reviews isn't "Checked your Google reviews: none yet" (the client's words, client_monthly_v1) (${sec("work").join(" | ")})`);
  if (!sec("skipped").includes("Provide 20+ business photos: skipped for now; we'll come back to it") || !sec("skipped").some((l) => /: the client has no set hours$/.test(l))) fail(`report v2: a skip with no reason isn't "skipped for now; we'll come back to it", or a reason is lost (${sec("skipped").join(" | ")})`);
  if (!sec("pages").includes("https://x.example/a went live Nov 8. Too new for Search Console numbers; they show in next month's report.")) fail(`report v2: a page with no Search Console data isn't the one honest line (${sec("pages").join(" | ")})`);
  if (!sec("pages").some((l) => /1,234 clicks, 56,789 impressions/.test(l))) fail(`report v2: real page numbers lost, or lack thousands commas (${sec("pages").join(" | ")})`);
  if (R2.subject !== "Your Month 1 report: Rocket Plumbing" || /—/.test(R2.subject)) fail(`report v2: the subject is "${R2.subject}"`);
  if (MR.FORBIDDEN.test(R2.text)) fail("report v2: the report trips the forbidden-claims rule");
  const R3 = MR.buildMonth1Report({ client: blk, tasks: kt, playbook: PB.month1, months: [], now: NOW9, baseline: { gsc_impressions: 12000, gsc_clicks: 3, captured_at: "2026-09-15T10:00:00Z" } });
  if (R3.sections.find((x) => x.key === "baseline").lines.some((l) => /^Google Search|as measured/.test(l))) fail("report v2: a baseline with no recorded window must leave the search line out (client_monthly_v1), never sit a longer stretch beside a month figure");
  // the admin card: counts, no green ticks, no stale grey box
  const SV = req(`${SITE}/shared/steps-57-64.js`), v = SV.reportView({ outcome_data: { report: { subject: R2.subject, sections: R2.sections, built_at: "2026-11-09T18:00:00Z" } } }, {});
  if (!v.rows.every((r) => r.state === "off" && r.mark === "·") || !v.rows.some((r) => /^Work completed in Month 1 \(\d+\)$/.test(r.title))) fail(`report v2: the 62 card's section rows lack counts or still carry green ticks (${v.rows.map((r) => r.title).join(" | ")})`);
  if (!/UNI_NO_RULE_BOX = new Set\(\["m1\.report\.month1"/.test(ADM) || !/doneWhenLine && !UNI_NO_RULE_BOX\.has\(o\.flowId\)/.test(ADM)) fail("report v2: the grey 'Done when ... Mark step complete' box is drawn on the report step");
  if (!/gsc_window: gsc\?\.window/.test(EX)) fail("report v2: the baseline step doesn't keep the window of its search numbers");
}
// ── month1_email_v1 + portal_after_month1_v1 (approved, the owner 11-9): the EMAIL is the short letter; the portal says Month 1 is done
{
  const NOT_WORK_RE = /^m1\.(close|kickoff|handoff|audit|report|call|access)\./, ME = load("_month1-email.js"), SENDER = read("netlify/functions/admin-month1-report.js");
  const T = {}, plain = (id, at) => { T[id] = { status: "done", completed_at: at }; };
  for (const s of PB.month1) if (!/^m1\.(close|kickoff|handoff|audit|report|call|access)\./.test(s.id)) plain(s.id, "2026-11-05T10:00:00Z");
  T["m1.review.response"] = { status: "done", completed_at: "2026-11-09T10:00:00Z", outcome_data: { reviews: { total: 0 } } };
  T["m1.gbp.photos"] = { status: "skipped", skipped_by: "rga", skipped_at: "2026-11-09T11:00:00Z", skip_reason: "Chris said to wait for the new photographer" };
  for (const id of ["m1.cit.priority_top10", "m1.cit.industry_specific", "m1.platform.yelp", "m1.platform.mentions", "m1.platform.bing_apple"]) T[id] = { status: "skipped", skipped_by: "rga", skipped_at: "2026-11-09T11:00:00Z", skip_reason: "Chris: sign-ups wait" };
  T["m1.web.blog_seed"] = { status: "skipped", skipped_by: "rga", skip_reason: "Nobody has time for blogs, Chris" };
  const NOW9 = new Date("2026-11-09T18:00:00Z");
  const months = [{ reporting_month: "2026-09-01", gsc_clicks: 6, gbp_impressions: 60, gbp_calls: null, review_count: 0 }, { reporting_month: "2026-10-01", gsc_clicks: 11, gbp_impressions: 55, gbp_calls: null, review_count: 0 }];
  const rep = MR.buildMonth1Report({ client: { business_name: "Rocket Plumbing" }, tasks: T, playbook: PB.month1, months, now: NOW9, kickoffAt: "2026-10-09T15:00:00Z", baseline: { reviews: 0, captured_at: "2026-10-09T10:00:00Z" } });
  const M = ME.buildMonth1Email({ rep, client: { primary_contact_name: "Dana Lee" }, now: NOW9 });
  const txt = M.lines.join("\n"), stored = { ...rep, comparisons: undefined, items: undefined };
  // the hero + the three numbers, each with its change
  if (!/^✓ Month 1 complete · Nov 9$/m.test(txt) || !/^Your foundation is built, Dana\.$/m.test(txt)) fail(`email: the hero isn't "Month 1 complete · <date>" + "Your foundation is built, <first name>." (${txt.split("\n").slice(0, 2)})`);
  if (!/^WHERE THINGS STAND · OCTOBER VS SEPTEMBER$/m.test(txt) || !/^Clicks from Google Search: 11 \(▲ 5 from 6\)$/m.test(txt) || !/^Google profile views: 55 \(▼ 5 from 60\)$/m.test(txt) || !/^Google reviews: 0 \(same as at the start\)$/m.test(txt)) fail(`email: the three headline numbers lack their change (${txt.split("\n").slice(4, 9).join(" | ")})`);
  const noG = ME.buildMonth1Email({ rep: { ...rep, comparisons: [] }, client: {}, now: NOW9 }).lines.join("\n");
  if (!/^Clicks from Google Search: n\/a \(Google didn't give this number\)$/m.test(noG) || /^Clicks from Google Search: 0\b/m.test(noG)) fail("email: a number Google didn't give is shown as 0 or isn't said so");
  if (ME.buildMonth1Email({ rep: stored, client: {}, now: NOW9, playbook: PB.month1, tasks: T }).lines.join("\n") !== ME.buildMonth1Email({ rep: stored, client: {}, now: NOW9, playbook: PB.month1, tasks: T }).lines.join("\n") || !/Clicks from Google Search: 11 \(▲ 5 from 6\)/.test(ME.buildMonth1Email({ rep: stored, client: {}, now: NOW9, playbook: PB.month1, tasks: T }).lines.join("\n"))) fail("email: a report stored before the comparison data existed can't be read back for its numbers");
  // what we did: grouped, client words, top 3 + "+ N more", counts computed
  const nW = rep.items.done.length, byG = (g) => rep.items.done.filter((d) => d.group === g).length;
  if (!new RegExp(`^WHAT WE DID · ${nW} THINGS$`, "m").test(txt) || !new RegExp(`^Your Google profile \\(${byG("gbp")} done\\)$`, "m").test(txt) || !new RegExp(`^Your website \\(${byG("web")} done\\)$`, "m").test(txt) || !new RegExp(`^Reviews, tracking and your brand \\(${byG("other")} done\\)$`, "m").test(txt)) fail("email: the groups or their counts aren't computed from the work done");
  { // each group shows its TOP 3 and no more (the rest is the "+ N more" line)
    const sect = txt.split(/^WHAT WE DID[^\n]*\n/m)[1] || "", parts = sect.split(/^.*\(\d+ done\)$/m).slice(1);
    const counts = parts.map((blk) => (blk.split(/^[A-Z][A-Z ·]+$/m)[0].match(/^- /gm) || []).length);
    if (!counts.length || counts.some((n) => n > 3)) fail(`email: a group lists more than its top 3 items (${counts.join(",")})`); }
  if (byG("gbp") < 4 || !new RegExp(`^  \\+ ${byG("gbp") - 3} more$`, "m").test(txt) || (txt.match(/^- /gm) || []).length < 9) fail("email: a group shows more than its top 3, or the '+ N more' count is wrong");
  const FEED = Object.fromEntries(PB.month1.filter((s) => s.clientFeed).map((s) => [s.id, s.clientFeed])), internal = PB.month1.filter((s) => s.clientFeed && !NOT_WORK_RE.test(s.id) && T[s.id] && T[s.id].status === "done").map((s) => s.title);
  for (const d of rep.items.done) if (FEED[d.id] && d.text !== FEED[d.id] && d.id !== "m1.review.response") fail(`email: ${d.id} isn't in the client's own words (${d.text})`);
  if (internal.some((t) => txt.includes(t)) || /Lock primary|Match NAP|header\/footer|schema|GSC|GA4|GBP/.test(txt)) fail("email: an internal step title or jargon reached the client");
  if (!rep.items.done.some((d) => d.id === "m1.review.response" && d.text === "Checked your Google reviews: none yet, nothing to reply to") || /Replied to your Google reviews/.test(txt)) fail("email: zero reviews reads as 'Replied to your Google reviews'");
  const clean = ME.buildMonth1Email({ rep: { ...rep, items: { done: [], carried: [] } }, client: {}, now: NOW9 }).lines.join("\n");
  if (/\bundefined\b|NaN/.test(txt + clean)) fail("email: undefined or NaN reached the letter");
  // coming next: client words, no internal reason, no name; the five directory steps are one line
  if (!/^COMING NEXT$/m.test(txt) || !/^- A new photo and a Google post each week, and more review asks$/m.test(txt) || !/^- Business photos: whenever you're ready to share them$/m.test(txt)) fail("email: 'Coming next' lacks the weekly line or the photos line");
  if ((txt.match(/^- Listings on directories \(Yelp, Bing, Apple Maps and others\): scheduled for a later month$/gm) || []).length !== 1 || /Yelp profile|Bing Places|citations?\b/i.test(txt.replace(/Listings on directories[^\n]*/, ""))) fail("email: the directory steps aren't one collapsed line");
  if (/photographer|sign-ups wait|Nobody has time|Chris said|Chris:/.test(txt) || /skipped by rga/i.test(txt)) fail("email: an internal skip reason or a person's name reached the client");
  if (!/: later$/m.test(txt)) fail("email: a carried item isn't '<client words>: later'");
  // the button, the sign-off, no em dash
  if (!/href="https:\/\/www\.rocketgrowthagency\.com\/portal\/#month1-report"/.test(M.html) || !/See the full report in your portal/.test(M.html) || M.url !== "https://www.rocketgrowthagency.com/portal/#month1-report") fail("email: the one button doesn't open the portal's Reports on this report");
  if (!/^Questions\? Just reply to this email\.$/m.test(txt) || !/^Chris, Rocket Growth Agency$/m.test(txt) || /—/.test(txt + M.html)) fail("email: the sign-off is missing or an em dash is in the letter");
  // the shell: logo cell left of the wordmark and in the footer, and NO street address for a client email
  const doc = await import(`${SITE}/shared/email-doc.js`);
  const html = doc.buildBrandedEmail({ title: "", preheader: M.preheader, intro: "", bodyHtml: M.html }), twin = doc.plainTwin({ title: "Your Month 1 report", intro: "", lines: M.lines, cta: { url: M.url, label: "See the full report in your portal" } });
  if ((html.match(/bgcolor="#2457e6"[^>]*><img src="https:\/\/www\.rocketgrowthagency\.com\/images\/assets\/rga_icon-header\.png/g) || []).length !== 2 || html.indexOf('bgcolor="#2457e6"') > html.indexOf("Growth</span>")) fail("email: the blue rocket square isn't a table cell with the hosted PNG in the header (before the wordmark) and the footer");
  if (/Jefferson|Culver City|\b90232\b/.test(html + twin)) fail("email: a client email prints the street address");
  if (!/Jefferson/.test(doc.buildBrandedEmail({ title: "x", postalAddress: true })) || !/Jefferson/.test(doc.plainTwin({ title: "x", postalAddress: true })) || /Jefferson/.test(doc.buildBrandedEmail({ title: "x" })) || /Jefferson/.test(doc.plainTwin({ title: "x" }))) fail("email: the street address isn't kept for a sender that passes postalAddress (marketing / outreach), or is printed by default");
  if (!/hello@rocketgrowthagency\.com/.test(html) || !/\(424\) 242-2040/.test(twin)) fail("email: the footer lost the contact line");
  for (const f of ["netlify/functions/send-invoice-email.js", "netlify/functions/send-monthly-report.js", "netlify/functions/_mature-deps.js", "netlify/functions/admin-month1-report.js"]) if (/postalAddress/.test(read(f))) fail(`email: ${f}, a client sender, prints the street address`);
  if (!/require\("\.\/_month1-email"\)/.test(SENDER) || !/bodyHtml: m\.html/.test(SENDER) || /rep\.sections\.map\(\(s\) => `<h3/.test(SENDER)) fail("email: the Month 1 sender still sends the whole report as the email");
  if (!/kind: "flow_step_done", payload: \{ step_id: STEP, status: "done"/.test(SENDER) || !FEED["m1.report.month1"] || FEED["m1.report.month1"] !== "Sent your Month 1 report") fail("feed: the send doesn't write the line 'What RGA did' reads (flow_step_done + the playbook's 'Sent your Month 1 report')");
  if (!/comparisons: r\.comparisons, items: r\.items/.test(EX)) fail("email: the stored report doesn't keep its comparison data and items");
  // the portal, RUN: the card, the badge, the report view
  const lf = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}" && --d === 0) return P.slice(at, i + 1); } };
  const pc = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;"), _m1Letter: new Map(), csCard: (o) => `<div data-cs>${o.head}|${o.side}|${o.body}</div>`, pcFold: (lab, html, attrs = "") => `<details${attrs}><summary>${lab}</summary>${html}</details>`, monthDay: (v) => ({ "2026-11-09T18:00:00Z": "Nov 9" }[v] || String(v)) });
  // the card helpers are stubbed: this gate checks WHAT the card holds, the design is the browser gate's
  vm.runInContext(["month1SentOf", "monthlyWorkStarted", "month1ReportCardHtml"].map(lf).join("\n"), pc);
  const sentOb = { data: { tasks: { "m1.report.month1": { status: "done", auto_result: { sent_message_id: "g1", sent_at: "2026-11-09T18:00:00Z" }, outcome_data: { report: { subject: rep.subject, sections: rep.sections } } }, "m1.handoff.month2": { status: "done" } } } };
  pc.__a = sentOb; pc.__b = { data: { tasks: { "m1.report.month1": { status: "done", outcome_data: { report: { sections: rep.sections } } } } } };
  const run = (e) => vm.runInContext(e, pc);
  if (!run("month1SentOf(__a)") || run("month1SentOf(__b)") || run("month1SentOf(null)") || !run("monthlyWorkStarted(__a)") || run("monthlyWorkStarted(__b)")) fail("portal: 'sent' isn't the send's own proof (the Gmail id), or the hand-off check is wrong");
  const card = run("month1ReportCardHtml(__a)");
  // client_monthly_v1 (11-9): ONE card, "Month 1 ... Sent Nov 9", and a fold that opens the LETTER (in the client's words, from the server); the stored sections are no longer dumped into the page
  if (!/id="month1-report"/.test(card) || !/data-m1-letter/.test(card) || !/Read your report/.test(card) || !/data-m1-letter-body/.test(card) || !/Sent Nov 9/.test(card) || /Skipped by RGA|Work completed in Month 1|<h5/.test(card) || run("month1ReportCardHtml(__b)") !== "") fail("portal: the Reports view must be one Month 1 card with a Read your report fold (and nothing before it was sent)");
  if (!/title: "Month 1 is done\. Your report is ready\."/.test(P) || !/\$\{m1Sent\.at \? `Sent \$\{monthDay\(m1Sent\.at\)\}\. ` : ""\}Your report is under Reports\./.test(P) || /a Google post and a photo each week/.test(P) || !/btn: "Read your report", goto: "reports", scroll: "month1-report"/.test(P)) fail("portal: the 'Your next step' card doesn't read 'Month 1 is done. Your report is ready.' with 'Read your report' (and never promises a weekly post and photo)");
  if (!/monthlyWorkStarted\(onboarding\) \? "Monthly work" : "Setup in progress"/.test(P) || !/renderStatusPill\(single, sMonths, single\.client\?\.client_portal_stage, onboardingByClient\[single\.client_id\]/.test(P)) fail("portal: the badge doesn't become 'Monthly work' once the hand-off step is done");
  if (!/\^#month1-report\$/.test(P) || !/function openMonth1Report\(\)/.test(P) || !/month1ReportCardHtml\(onboarding/.test(P)) fail("portal: the email's #month1-report link doesn't open Reports on the report");
}
// 🔄 10-26 (steps_6_20_clean_v1, step 15 waiting): the band says "Opens about <date>"
if (!/title: end \? `Opens about \$\{/.test(P) || !/Anything still open carries into Month 2; nothing waits for it/.test(P)) fail("step 15: the portal still says the call waits until everything is done");
const BK = read("netlify/functions/portal-book-kickoff.js");
if (!/const rp = recs\[0\]\?\.data\?\.tasks\?\.\["m1\.report\.month1"\];\s*if \(!rp \|\| rp\.status !== "done"\) \{\s*return jsonRes\(409,/.test(BK)) fail("step 15: a close-out time can be booked before the Month 1 report is ready (report first)");
if (!/No close-out call yet: skip this row to start Month 2/.test(ADM)) fail("step 15: admin doesn't say to skip the call after day 35");
// ── the done-record fallback, RUN
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
// 🔄 done_without_record_v2 (approved 10-26): the fallback IS the no-record done card (doneNoRecordHtml), run for real with the
// card helpers lifted from portal.js: the band + "Finished with RGA" / "Finished by you" + when — never "Marked done" / "Not recorded"
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), monthDay: (v) => String(v).slice(5, 10), fmtDateShort: (v) => String(v).slice(0, 10) });
const consts = ["PC_TICK", "PC_OPEN", "PC_PLUS", "pcCard", "pcFact", "pcTl", "pcDate", "pcActs", "doneWho", "doneByTl"].map((n) => { const m = P.match(new RegExp(`^const ${n} = [^\\n]*`, "m")); if (!m) { console.error(`⚠️  ${n} moved`); process.exit(2); } return m[0].replace(/^const /, "var "); });
vm.runInContext(consts.join("\n") + "\n" + lift("doneNoRecordHtml") + "\n" + lift("doneFallbackHtml"), ctx);
const fb = (s, t) => { ctx.__s = s; ctx.__t = t; return vm.runInContext("doneFallbackHtml(__s, __t)", ctx).replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|"); };
const h1 = fb({ clientLabel: "Confirm your business hours", clientDoneConfirm: "Your hours are on Google" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "rga" });
if (!/\|Your hours are on Google\|finished 09-22\|/.test(h1) || !/\|Finished with RGA\|09-22\|/.test(h1) || /Marked done|not recorded|not on record/i.test(h1)) fail(`fallback: a done step with no answer doesn't say who + when in plain words, or shows our bookkeeping (${h1})`);
const h2 = fb({ clientLabel: "X" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "client", client_input: { a: 1 } });
if (/not recorded/i.test(h2) || !/\|Finished by you\|/.test(h2)) fail(`fallback: an answer we have reads Not recorded, or the client isn't named as who did it (${h2})`);
const h3 = fb({ clientLabel: "X" }, { status: "done" });
// a done line that says the CLIENT did it is never the band of a step RGA finished (it read "You gave us your hours" over "Finished with RGA")
const h4 = fb({ clientLabel: "Confirm your business hours", clientDoneConfirm: "You gave us your hours" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "rga" });
if (/You gave us/.test(h4) || !/\|This step is done\|finished 09-22\|/.test(h4) || !/\|Finished with RGA\|09-22\|/.test(h4)) fail(`fallback: a step RGA finished says the client did it (${h4})`);
const h5 = fb({ clientLabel: "Confirm your business hours", clientDoneConfirm: "You gave us your hours" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "client" });
if (!/\|You gave us your hours\|/.test(h5) || !/\|Finished by you\|/.test(h5)) fail(`fallback: a step the client finished lost its own done line (${h5})`);
if (!/\|Finished with RGA\|/.test(h3) || /finished \||not recorded|undefined|NaN|Invalid/i.test(h3)) fail(`fallback: a missing date is invented, or reads "not recorded" (${h3})`);
if (!/fillBlankDoneRows\(listEl, numbered\);/.test(P) || !/if \(\(c\.textContent \|\| ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.length >= 25\) continue;/.test(P)) fail("fallback: the list no longer fills blank done rows (measured like the walk)");
// month1_email_v1 (11-9 review): the portal's report view never shows RGA's skip reasons or who skipped; it reads "Coming next"
{ const PJ = fs.readFileSync(path.join(SITE, "shared/client-monthly.js"), "utf8");
  if (!/s\.key === "open" \|\| s\.key === "skipped"\) continue;/.test(PJ) || !/title: "Coming next"/.test(PJ)) fail("portal report: 'Skipped by RGA' with our internal reasons is back in the client's view (the letter turns open and skipped into one Coming next, in client words)"); }
// month1_email_v1 (11-9 review): the email matches the approved mockup's layout: three number tiles side by side, round check badges, blue "+ N more"
{ const ME = fs.readFileSync(path.join(SITE, "netlify/functions/_month1-email.js"), "utf8");
  if (!/<tr>\$\{numbers\.map\(numTile\)\.join\(""\)\}<\/tr>/.test(ME)) fail("email: the three numbers aren't tiles side by side (the approved layout)");
  if (!/const badge = \(mark, later\) =>/.test(ME) || !/\$\{badge\(mark, mark !== "✓"\)\}/.test(ME)) fail("email: the items lost their round check badges");
  if (!/color:\$\{BRAND\};">\+ \$\{g\.more\} more/.test(ME)) fail("email: '+ N more' isn't the brand blue"); }
// send_me_a_test_v1 (11-9): the test goes to the signed-in admin only, "[Test]" in the subject, and returns before any record or activity write
{ const FN = fs.readFileSync(path.join(SITE, "netlify/functions/admin-month1-report.js"), "utf8"), AJ = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  if (!/const to = isTest \? String\(gate\.email \|\| ""\)\.trim\(\) :/.test(FN)) fail("test send: it isn't addressed to the signed-in admin");
  const ret = FN.indexOf("if (isTest) return json(200, { ok: true, test: true"), write = FN.indexOf("tasks[STEP] = { ...cur, status: \"done\"");
  if (ret < 0 || write < 0 || ret > write) fail("test send: it reaches the record write (it must return before marking anything sent)");
  if (!/subject: `\$\{isTest \? "\[Test\] " : ""\}/.test(FN)) fail("test send: no [Test] in the subject");
  if (!/data-m1-report-test=/.test(AJ) || !/acts: send \+ test \}/.test(AJ)) fail("test send: the 'Send me a test' link is missing from step 62"); }
if (F.length) { console.error("🔴 reviews + the Month 1 close regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ reviews + close hold: no staff-name asks, pace told past 10 · videos optional, skippable, never next · report waits on the baseline only, opens at kickoff + 27, lists what's still open (not optional, not done) · day-35 skip · blank done rows say who finished it + when, in plain words");
