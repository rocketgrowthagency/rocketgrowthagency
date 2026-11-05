#!/usr/bin/env node
// check-onboarding-and-leaving.mjs — the approved parts of Onboarding and Leaving (reports/mockups/onboarding_and_offboarding_v1.html, 11-01).
//
// WHAT IT HOLDS (runs the SHIPPED modules against fake Supabase and fake pages: no network, no production data, no email)
//  1. WORDING: no "Website / CMS login" in the welcome email or the kickoff invite; the kickoff hint promises no confirmation time; hello@ vs access@ is stated once.
//  2. ANNOUNCED REMINDERS (_step-reminders.js, notify-step-open.js): OFF unless STEP_REMINDERS_EMAIL=on, and then the first ask names its reminder, at most TWO
//     follow, the second offers help, a step the client put off themselves or that is done or too old gets none, the hour is named only when the time zone is known,
//     the stamp is written before the send, and RGA is told once with delivery checked. No em dash in the words.
//  3. THE OUTCOME CONTROL (shared/call-outcome.js): three words, stored on m2.call.monthly; nothing noted is "not noted", never "retained"; the churn read counts At risk.
//  4. THE CLOSING LIST (_closing-list.js, admin-closing-list.js): only while a notice stands, marks only from that notice on, 5 business days from the end date, a person marks
//     every item, "not applicable" needs a reason, and nothing here calls Stripe, a client's account or an email.
//  5. LOWER ROLES: GA4 Editor and Search Console Full user in every source, the contract's Section 5 line still true, and the Google sign-in scopes unchanged.
//  6. FIRST-WEEK AND DAY-50 (_onboarding-notes.js): only what an audit read, a partial crawl adds no website line, no "you have no X", day 50 only inside its window and only
//     with a first payment on record; the terms come from the plan; the drafts are text and nothing is sent.
//  7. THE CANCEL CARD (portal-cancel.js, _leaving-terms.js): the owner's sign-in only, today's date is the notice date whatever the request says, the terms come from the plan
//     (standard 30 days prorated, founding minimum), an unreadable plan is never the standard terms, the notice is read back, RGA is told with delivery checked, a second
//     press changes nothing, and nothing is held over a departure.
// Exit 0 holds · 1 broke · 2 cannot read.
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "s", RGA_SUPPRESS_CLIENT_EMAIL: "1" });
delete process.env.STEP_REMINDERS_EMAIL;
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (f) => { try { return req(f); } catch (e) { console.error(`⚠️  INDETERMINATE — ${f} did not load: ${e.message}`); process.exit(2); } };
const DASH = /[—–]/;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => body });

// ── 1 · wording ──
{
  const sc = read("netlify/functions/send-confirmation-email.js"), ad = read("admin/admin.js");
  if (/Website \/ CMS login/.test(code("netlify/functions/send-confirmation-email.js"))) fail("the welcome email still asks for a 'Website / CMS login'");
  if (!/An invite on your website builder \(no password\)/.test(sc)) fail("the welcome email doesn't say 'An invite on your website builder (no password)'");
  if (/•\s*Website \/ CMS login/.test(ad)) fail("the kickoff invite still lists 'Website / CMS login'");
  if (!/•\s*An invite on your website builder \(no password\)/.test(ad)) fail("the kickoff invite doesn't say 'An invite on your website builder (no password)'");
  const PB = JSON.parse(read("data/playbooks/playbooks.json")), CS = JSON.parse(read("data/playbooks/client-steps.json"));
  const csAll = Object.values(CS).flatMap((v) => (Array.isArray(v) ? v : Array.isArray(v?.steps) ? v.steps : []));
  const all = [...PB.month1, ...PB.month2plus];
  for (const [src, list] of [["playbooks.json", all], ["client-steps.json", csAll]]) {
    const k = list.find((s) => s.id === "m1.kickoff.call");
    if (!k) { fail(`${src} lost m1.kickoff.call`); continue; }
    if (/business day/i.test(k.clientHint || "")) fail(`${src}: the kickoff hint promises a confirmation time ("business day") the system doesn't keep`);
    if (!/once we confirm it/.test(k.clientHint || "")) fail(`${src}: the kickoff hint doesn't say the invite follows once RGA confirms`);
  }
  if (/calendar invite[^"`\n]{0,80}usually within a business day/i.test(read("portal/portal.js"))) fail("the portal still promises a calendar invite 'usually within a business day'");
  const g = all.find((s) => s.id === "m1.access.gbp"), w = all.find((s) => s.id === "m1.access.website");
  if (!/Two RGA addresses, on purpose/.test(g?.instructions || "") || !/hello@/.test(g?.instructions || "") || !/access@/.test(g?.instructions || "")) fail("m1.access.gbp doesn't state hello@ vs access@ once");
  if (!/hello@ is for the profile, access@ is for website builders/.test(w?.instructions || "")) fail("m1.access.website doesn't point back to hello@ for the Google profile");
}

// ── 2 · announced reminders ──
const REM = load("./_step-reminders.js");
const tz = "America/New_York", told = Date.parse("2026-11-02T15:00:00Z");   // a Monday
{
  if (REM.enabled({})) fail("announced reminders are ON without STEP_REMINDERS_EMAIL=on");
  if (!REM.enabled({ STEP_REMINDERS_EMAIL: "on" })) fail("STEP_REMINDERS_EMAIL=on doesn't switch reminders on");
  if (REM.clientLine({ state: "wait", next: "Thursday at 10 AM" }, {})) fail("the portal names a reminder date while reminders are off");
  if (!/Thursday at 10 AM/.test(REM.clientLine({ state: "wait", next: "Thursday at 10 AM" }, { STEP_REMINDERS_EMAIL: "on" }) || "")) fail("the portal line doesn't name the reminder day");
  const t = { open_told_at: new Date(told).toISOString() };
  const P = (o) => REM.plan({ task: t, tz, ...o });
  const at = (iso) => Date.parse(iso);
  if (P({ nudges: [], now: at("2026-11-04T20:00:00Z") }).state !== "wait") fail("a reminder is due before day 3");
  if (REM.firstReminderLabel(told, tz) !== "Thursday at 10 AM") fail(`the first reminder is named "${REM.firstReminderLabel(told, tz)}", not Thursday at 10 AM`);
  if (P({ nudges: [], now: at("2026-11-05T14:00:00Z") }).state !== "wait") fail("a reminder is due before 10 AM on the day");
  if (P({ nudges: [], now: at("2026-11-05T16:00:00Z") }).state !== "due") fail("the first reminder isn't due at 11 AM on day 3");
  if (P({ nudges: [], now: at("2026-11-06T01:00:00Z") }).state === "due") fail("a reminder is due at 8 PM");
  if (P({ nudges: [], now: at("2026-11-06T09:00:00Z") }).state === "due") fail("a reminder is due at 4 AM");
  const n1 = ["2026-11-05T16:00:00Z"];
  if (P({ nudges: n1, now: at("2026-11-06T16:00:00Z") }).state !== "wait") fail("the second reminder comes before day 7 / 3 days after the first");
  if (P({ nudges: n1, now: at("2026-11-09T16:00:00Z") }).state !== "due" || P({ nudges: n1, now: at("2026-11-09T16:00:00Z") }).n !== 1) fail("the second reminder isn't due on day 7");
  const n2 = [...n1, "2026-11-09T16:00:00Z"];
  if (P({ nudges: n2, now: at("2026-11-10T16:00:00Z") }).state === "due") fail("a THIRD automated reminder is due");
  if (P({ nudges: n2, now: at("2026-11-11T16:00:00Z") }).state === "due") fail("a third reminder is due on day 9");
  if (P({ nudges: n2, now: at("2026-11-12T17:00:00Z") }).state !== "route") fail("RGA isn't told 3 days after the second reminder");
  if (REM.plan({ task: { ...t, reminders_routed_at: "x" }, nudges: n2, tz, now: at("2026-11-20T17:00:00Z") }).state !== "person") fail("RGA is told twice");
  if (P({ nudges: [], now: at("2026-11-05T16:00:00Z"), finished: true }).state !== "none") fail("a finished step gets a reminder");
  if (REM.plan({ task: { ...t, later: { until: "2026-11-20" } }, nudges: [], tz, now: at("2026-11-05T16:00:00Z") }).state !== "none") fail("a step the client put off themselves gets the automated reminder too");
  if (REM.plan({ task: {}, nudges: [], tz, now: at("2026-11-05T16:00:00Z") }).state !== "none") fail("a step that was never announced gets a reminder");
  if (P({ nudges: [], now: told + 20 * 86400000 }).state !== "none") fail("a step announced 20 days ago gets a reminder when reminders are switched on (it floods old steps)");
  if (/ at \d/.test(REM.firstReminderLabel(told, tz, false))) fail("a client whose time zone is unknown is told a clock time");
  if (REM.plan({ task: t, nudges: [], tz, exact: false, now: at("2026-11-04T14:00:00Z") }).next !== "Thursday") fail("an unknown time zone names the day with an hour");
  const mail1 = REM.buildReminderEmail({ primary_contact_name: "Sam Lee" }, [{ id: "m1.gbp.photos", clientLabel: "Provide 20+ business photos", clientHint: "Add photos.", clientForm: "photo_upload" }], 1, () => "https://x.test/#a");
  const mail2 = REM.buildReminderEmail({ primary_contact_name: "Sam Lee" }, [{ id: "a", clientLabel: "A", clientHint: "B." }], 2, () => "https://x.test/#a");
  if (!/three photos from your phone/.test(mail1.markup)) fail("the photo reminder doesn't offer the smallest next action");
  if (!/hand|help/i.test(mail2.subject + mail2.markup) || !/Reply to this email/.test(mail2.markup)) fail("the second reminder doesn't offer help");
  if (!/last automated reminder/.test(mail2.markup) || !/reach out/.test(mail2.markup)) fail("the second reminder doesn't say what happens after it");
  if (DASH.test(mail1.markup + mail1.subject + mail2.markup + mail2.subject)) fail("a reminder email has a dash");
  if (/\b(guarantee|will rank|rankings? will|results? (in|within))\b/i.test(mail1.markup + mail2.markup)) fail("a reminder promises a result");
  // the first email
  const N = load("./notify-step-open.js");
  const step = N.CANDIDATES[0];
  const off = N.buildEmail({ primary_contact_name: "Sam" }, [step]);
  if (/remind you/.test(off.markup)) fail("the first email names a reminder while reminders are off");
  const on = N.buildEmail({ primary_contact_name: "Sam" }, [step], { remindLabel: "Thursday at 10 AM" });
  if (!/We will remind you Thursday at 10 AM if you have not had a chance\. One ask, one link\./.test(on.markup)) fail("the first email doesn't name its reminder");
  if (DASH.test("We will remind you")) fail("n/a");
  const on2 = N.buildEmail({ primary_contact_name: "Sam" }, [N.CANDIDATES[0], N.CANDIDATES[1]], { remindLabel: "Thursday at 10 AM" });
  if (!/remind you Thursday at 10 AM/.test(on2.markup)) fail("a first email for several steps doesn't name its reminder");
  { // the real sendFor: the first email names its reminder only while reminders are ON
    const acts = []; globalThis.fetch = async (url, init = {}) => { if (/client_activity/.test(String(url)) && init.method === "POST") acts.push(JSON.parse(init.body)); return res(200, []); };
    const cl = { id: "11111111-1111-1111-1111-111111111111", primary_contact_email: "o@acme.test", primary_contact_name: "Sam", primary_market: "Austin, TX" };
    await N.sendFor(cl, [step], { at: "2026-11-02T15:00:00Z" }).catch((e) => fail(`sendFor failed: ${e.message}`));
    if (acts.some((a) => /remind you/.test(a.payload.message))) fail("the first email sent names a reminder while reminders are off");
    process.env.STEP_REMINDERS_EMAIL = "on"; acts.length = 0;
    await N.sendFor(cl, [step], { at: "2026-11-02T15:00:00Z" }).catch((e) => fail(`sendFor failed: ${e.message}`));
    if (!acts.some((a) => /We will remind you Tuesday at 10 AM if you have not had a chance/.test(a.payload.message) || /We will remind you \w+day at 10 AM/.test(a.payload.message))) fail("the first email sent doesn't name its reminder while reminders are on");
    const cl2 = { ...cl, primary_market: "Toronto, ON" }; acts.length = 0;
    await N.sendFor(cl2, [step], { at: "2026-11-02T15:00:00Z" }).catch(() => {});
    if (acts.some((a) => /remind you \w+ at \d/.test(a.payload.message)) || !acts.some((a) => /remind you \w+day if/.test(a.payload.message))) fail("a client whose time zone is unknown is told a clock time in the first email");
    delete process.env.STEP_REMINDERS_EMAIL;
  }
  const SRC = read("netlify/functions/notify-step-open.js");
  const k = SRC.indexOf("if (REM.enabled()) {"), d = SRC.indexOf("if (!due.length) continue;");
  if (k < 0 || d < 0 || k > d) fail("the reminder block isn't guarded by REM.enabled() ahead of the first-email send");
  const blk = SRC.slice(k, d);
  if (!/reminders_sent: \[\.\.\.[\s\S]*?await writeTasks\(rec\.id, data, tasks\);[\s\S]*?await sendReminder\(/.test(blk)) fail("the reminder stamp isn't written (and saved) before the send");
  if (!/reminders_routed_at: at/.test(blk) || blk.indexOf("reminders_routed_at: at") > blk.indexOf("await notifyRgaStalled(")) fail("RGA's stalled notice isn't stamped before it is sent");
  if (!/delivered === false/.test(SRC.slice(SRC.indexOf("async function notifyRgaStalled")))) fail("the stalled notice to RGA doesn't check delivery");
  { const sr = SRC.slice(SRC.indexOf("async function sendReminder"), SRC.indexOf("async function notifyRgaStalled"));
    if (!/kind: "step_nudge_sent"/.test(sr) || !/reason: "auto_reminder"/.test(sr)) fail("an automated reminder isn't logged as a step nudge (the admin's reminder count wouldn't see it)"); }
  if (!/REM\.enabled\(\)/.test(read("netlify/functions/portal-open-moves.js"))) fail("the portal names a reminder without checking they are switched on");
  if (!/mvRemindable/.test(read("admin/admin.js")) || !/2 reminders sent, no reply, next a person reaches out/.test(read("admin/admin.js"))) fail("admin doesn't show a stalled step as 'next a person reaches out'");
  // the sweep with reminders OFF must send nothing and ask for no reminder data
  const calls = []; globalThis.fetch = async (url, init = {}) => { calls.push(`${init.method || "GET"} ${url}`); if (/\/clients\?/.test(url)) return res(200, []); return res(200, []); };
  const out = await N.handler({ headers: { "x-internal-secret": "s" } }).catch((e) => ({ body: JSON.stringify({ error: e.message }) }));
  if (calls.some((c) => /step_nudge_sent|gmail|notify-rga/.test(c))) fail("a sweep with reminders OFF read or sent reminder data");
}

// ── 3 · the outcome control ──
{
  const C = await import(pathToFileURL(`${SITE}/shared/call-outcome.js`).href);
  if (C.CALL_OUTCOMES.map((o) => o.key).join() !== "retained,at_risk,churned") fail("the outcome words aren't Retained, At risk, Churned");
  if (C.callOutcomeOf({}) !== null || C.callOutcomeOf(null) !== null || C.callOutcomeOf({ call_outcome: "happy" }) !== null) fail("an outcome nobody noted (or an unknown word) reads as a verdict");
  if (C.callOutcomeOf({ call_outcome: "at_risk" })?.label !== "At risk") fail("a noted outcome isn't read back");
  if (C.outcomePatch("nope", null) !== null) fail("an unknown outcome word can be saved");
  const p = C.outcomePatch("churned", null, "2026-11-02T00:00:00Z"); if (p.call_outcome !== "churned" || p.call_outcome_at !== "2026-11-02T00:00:00Z") fail("the outcome patch doesn't carry the word and the time");
  if (C.outcomePatch("churned", "churned").call_outcome !== null) fail("pressing the chosen word again doesn't clear it");
  const L = C.latestCallOutcome([{ reporting_month: "2026-09-01", data: { tasks: { "m2.call.monthly": { call_outcome: "retained" } } } }, { reporting_month: "2026-10-01", data: { tasks: { "m2.call.monthly": { call_outcome: "at_risk" } } } }, { reporting_month: "2026-11-01", data: { tasks: {} } }]);
  if (!L || L.key !== "at_risk" || L.month !== "2026-10-01") fail("the latest NOTED outcome isn't read (a month with none must be skipped, not read as retained)");
  const M = load("./_mature.js");
  if (M.CALL_OUTCOME_KEYS.join() !== C.CALL_OUTCOMES.map((o) => o.key).join()) fail("the Mature read and the control disagree on the outcome words");
  const ad = read("admin/admin.js");
  if (!/updateFlowTask\(client, "month2plus", "m2\.call\.monthly", patch\)/.test(ad)) fail("the outcome control doesn't save on the monthly call step");
  if (!/data-ob-outcome/.test(ad)) fail("the outcome control isn't drawn");
  const PB = JSON.parse(read("data/playbooks/playbooks.json"));
  if (/retained \/ at_risk \/ churned/.test(PB.month2plus.find((s) => s.id === "m2.call.monthly")?.instructions || "")) fail("the monthly call's text still tells a person to remember the outcome in a sentence");
}

// ── 4 · the closing list ──
{
  const CL = load("./_closing-list.js");
  const notice = { event: "cancel_notice", notice_on: "2026-11-02", ends_on: "2026-12-02" };   // a Wednesday
  if (CL.closingState({ audit_log: [] }) !== null) fail("a closing list appears with no notice");
  if (CL.closingState({ audit_log: [notice, { event: "cancel_withdrawn" }] }) !== null) fail("a closing list stays after the notice is withdrawn");
  const s = CL.closingState({ audit_log: [notice] }, { today: "2026-11-10" });
  if (s.due_by !== "2026-12-09") fail(`written confirmation is due ${s.due_by}, not 5 business days after the end date (2026-12-09)`);
  if (CL.plusBusinessDays("2026-12-04", 5) !== "2026-12-11") fail("5 business days from a Friday skips the weekend wrong");
  if (s.items.map((i) => i.key).join() !== "refund,gbp,google,site,confirm") fail("the closing list isn't the five items");
  if (s.items.some((i) => i.status !== "open") || s.overdue) fail("a fresh closing list isn't all open");
  if (!/person does it/.test(s.items[0].detail) || /automatic/i.test(s.items[0].detail)) fail("the refund line doesn't say a person does it");
  const mk = CL.markEvent({ key: "gbp", status: "done", at: "2026-12-03T00:00:00Z", by: "a@b.test" });
  const s2 = CL.closingState({ audit_log: [notice, mk] }, { today: "2026-12-20" });
  if (s2.items[1].status !== "done" || s2.open !== 4 || !s2.overdue) fail("a mark isn't read, or an unfinished list past its date isn't overdue");
  if (CL.closingState({ audit_log: [notice, mk] }, { today: "2026-12-05" }).overdue) fail("a list is overdue before its date");
  const s3 = CL.closingState({ audit_log: [mk, notice] });
  if (s3.items[1].status !== "open") fail("a mark made before the notice counts toward the new one");
  const undo = CL.closingState({ audit_log: [notice, mk, CL.markEvent({ key: "gbp", status: "open" })] });
  if (undo.items[1].status !== "open") fail("a mark can't be undone");
  if (CL.markEvent({ key: "wipe", status: "done" }) !== null || CL.markEvent({ key: "gbp", status: "paid" }) !== null) fail("an unknown item or status is accepted");
  if (CL.markEvent({ key: "site", status: "na", note: "  we never had it  " }).note !== "we never had it") fail("a not-applicable reason isn't kept");
  const adm = read("netlify/functions/admin-closing-list.js"), ct = code("netlify/functions/admin-closing-list.js") + code("netlify/functions/_closing-list.js");
  if (!/const gate = await requireWorkspaceForClient\(event, clientId\);\s*if \(gate\.error\) return gate\.error;/.test(adm)) fail("the closing list endpoint isn't staff only");
  if (/api\.stripe|stripe\.(refunds|charges)|require\(["']stripe|sendAsRga|notify-rga|oauth|googleapis/i.test(ct)) fail("the closing list touches Stripe, an email, Google or a client account");
  if (!/Not applicable/.test(read("admin/admin.js")) || !/rgaPrompt\("Why does this not apply/.test(read("admin/admin.js"))) fail("admin's 'Not applicable' doesn't ask why");
  if (!/Nothing here touches the client's own accounts/.test(read("admin/admin.js"))) fail("the closing list doesn't say it touches no client account");
  if (!/data-closing-list/.test(read("admin/admin.js")) || !/data-contract-action="record_notice"/.test(read("admin/admin.js"))) fail("the closing list or 'Record cancellation notice' left the contract card");
}

// ── 5 · lower roles ──
{
  const PB = JSON.parse(read("data/playbooks/playbooks.json")), CS = JSON.parse(read("data/playbooks/client-steps.json"));
  const csAll = Object.values(CS).flatMap((v) => (Array.isArray(v) ? v : Array.isArray(v?.steps) ? v.steps : []));
  const SCR = process.env.SCRAPER_COPY_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
  const AM = (() => { try { return fs.readFileSync(`${SCR}/flow/playbooks/_actor-map.mjs`, "utf8"); } catch { return ""; } })();
  for (const [src, list] of [["playbooks.json", [...PB.month1]], ["client-steps.json", csAll]]) {
    const ga = list.find((s) => s.id === "m1.access.analytics"), gs = list.find((s) => s.id === "m1.access.search_console");
    const txt = (s) => `${s?.clientHint || ""} ${s?.instructions || ""}`;
    if (!/Editor/.test(txt(ga)) || /grant Administrator|Role: Administrator\./.test(txt(ga))) fail(`${src}: the GA4 step doesn't ask for Editor`);
    if (!/Full user/.test(txt(gs)) || /grant Owner|Permission: Owner\./.test(txt(gs))) fail(`${src}: the Search Console step doesn't ask for Full user`);
    if (!/set up or fix your tracking/.test(txt(ga)) || !/set up or fix your tracking/.test(txt(gs))) fail(`${src}: the role request doesn't say it is only for where RGA sets up or fixes tracking`);
  }
  if (AM && (/grant Administrator|grant Owner access/.test(AM))) fail("the canonical actor map still asks for Administrator or Owner");
  const cg = read("netlify/functions/contract-generate.js");
  if (!/Editor-level access to Client's Google Analytics 4 property and Full-level access to Client's Google Search Console property[^<]*needed only where RGA is setting up or fixing tracking/.test(cg)) fail("the contract's Section 5 line no longer says Editor / Full, needed only where RGA sets up or fixes tracking");
  const oi = read("netlify/functions/oauth-google-init.js");
  if (/analytics\.edit|analytics\.manage|webmasters["']|auth\/webmasters(?!\.readonly)/.test(code("netlify/functions/oauth-google-init.js"))) fail("the Google sign-in asks for a write scope");
  for (const f of ["netlify/functions/_google-consent.js", "netlify/functions/_core-change.js"]) if (read(f).length < 200) fail(`${f} looks gutted`);
}

// ── 6 · first-week and day-50 ──
{
  const ON = load("./_onboarding-notes.js"), LT = load("./_leaving-terms.js");
  const gbp = { "m1.audit.gbp_baseline": { ran_at: "2026-11-01T10:00:00Z", auto_result: { outcome_data: { categories: { primaryCategory: { displayName: "Plumber" }, additionalCategories: [{}, {}] } } } } };
  const crawl = { pages_audited: 10, unreachable: 0, issues: [{ id: "title.missing", count: 2 }, { id: "desc.missing", count: 0 }] };
  const now = Date.parse("2026-11-03T00:00:00Z");
  if (ON.firstWeek({ tasks: {}, onpage: null, now }) !== null) fail("a first-week list appears with nothing read");
  if (ON.firstWeek({ tasks: {}, onpage: { ...crawl, partial: true }, now }) !== null) fail("a partial crawl (home page only) produced website lines");
  if (ON.firstWeek({ tasks: {}, onpage: { ...crawl, unreachable: 1 }, now }) !== null) fail("a crawl with unreachable pages produced website lines");
  if (ON.firstWeek({ tasks: {}, onpage: { pages_audited: 0, issues: [] }, now }) !== null) fail("a crawl of zero pages produced lines");
  const fw = ON.firstWeek({ tasks: gbp, onpage: crawl, now });
  const texts = fw.lines.map((l) => l.text).join(" | ");
  if (!/main category on Google is Plumber/.test(texts) || !/2 more categories/.test(texts)) fail("the profile lines aren't read from the profile");
  if (!/no title tag in the page source of 2 pages/.test(texts)) fail("the website line doesn't say what was read");
  if (/meta description/.test(texts)) fail("a count of zero produced a line");
  if (/\byou (have|don't have|do not have) no\b|\byou(?:'| a)re missing\b|\byou lack\b/i.test(texts)) fail("a first-week line states an absence as the client's fact");
  if (DASH.test(texts)) fail("a first-week line has a dash");
  if (!ON.firstWeek({ tasks: gbp, onpage: null, now: Date.parse("2026-12-20T00:00:00Z") }).expired) fail("the first-week card never expires");
  if (ON.firstWeek({ tasks: { "m1.audit.gbp_baseline": { auto_result: { outcome_data: { categories: {} } } } }, onpage: null, now }) !== null) fail("a profile read with no category produced a line");
  const terms = LT.leavingTerms({ tier: "commit_3mo", firstYmd: "2026-10-01", today: "2026-11-02" });
  const D = (day) => ON.day50({ anchorIso: "2026-10-01T00:00:00Z", now: Date.parse("2026-10-01T00:00:00Z") + (day * 86400000) + 3600000, tasks: {}, steps: [], terms });
  if (ON.day50({ anchorIso: null, tasks: {}, steps: [], terms }) !== null) fail("day 50 is drawn with no first payment on record");
  if (D(49).show || !D(50).show || !D(65).show || D(66).show) fail("day 50 shows outside its window (50 to 65)");
  const dd = D(50);
  if (!dd.terms_sentence || /30/.test(String(dd.terms_sentence).replace(/30 days/, ""))) fail("the day-50 terms aren't read from the plan");
  const dr = ON.day50Draft({ primary_contact_name: "Sam" }, { day: 51, done: ["a"], terms_sentence: terms.sentence });
  if (!/cannot tell you when/.test(dr.body) || !/Rankings take time/.test(dr.body)) fail("the day-50 note doesn't say rankings take time and it can't say when");
  if (/\b(has moved|have moved|improved|increased|ranked|up \d|guarantee)\b/i.test(dr.body.replace(/what has moved and what has not/g, ""))) fail("the day-50 note claims movement");
  if (DASH.test(dr.body + dr.subject + ON.firstWeekDraft({ business_name: "X" }, fw).body)) fail("a draft has a dash");
  const ms = code("netlify/functions/_onboarding-notes.js") + code("netlify/functions/portal-onboarding-notes.js");
  if (/sendAsRga|gmail|nodemailer|notify-rga|fetch\(.*(POST|method)/i.test(ms.replace(/headers: \{ apikey/g, ""))) fail("the onboarding notes send something");
  if (!/gate\.viaWorkspace/.test(read("netlify/functions/portal-onboarding-notes.js"))) fail("the email drafts are handed to the client, not only to staff");
  // the draft's function and its click handler, up to the next card (a fixed 4000-character window went blind when the function grew past it)
  { const A = read("admin/admin.js"), a = A.indexOf("function notesDraftHtml"), b = A.indexOf("function rowStepCardsHtml", a);
    if (a < 0 || b < 0) { console.error("⚠️  INDETERMINATE — notesDraftHtml / rowStepCardsHtml moved"); process.exit(2); }
    if (!/Open as a Gmail draft/.test(A) || /Send (it|now)/i.test(A.slice(a, b))) fail("the note drafts offer a send button, not a draft"); }
}

// ── 7 · the Cancel card ──
{
  const LT = load("./_leaving-terms.js");
  const std = LT.leavingTerms({ tier: "commit_3mo", firstYmd: "2026-10-01", today: "2026-11-02" });
  if (!std.known || std.minimum_applies || std.notice_days !== 30 || std.ends_on !== "2026-12-02" || !/30 days after you give notice/.test(std.sentence) || !/prorated/.test(std.sentence)) fail("the standard terms aren't 30 days, prorated");
  const fnd = LT.leavingTerms({ tier: "founding", firstYmd: "2026-10-01", today: "2026-11-02" });
  if (!fnd.minimum_applies || fnd.ends_on !== "2027-01-01" || !/3-month minimum/.test(fnd.sentence) || !/still due/.test(fnd.sentence)) fail("the founding terms don't state the 3-month minimum and that its fees are due");
  if (LT.leavingTerms({ tier: "founding", firstYmd: "2026-10-01", today: "2027-02-02" }).minimum_applies) fail("the founding minimum still applies after it has passed");
  if (LT.leavingTerms({ tier: "founding", firstYmd: null, today: "2026-11-02" }).minimum_applies) fail("a minimum is claimed with no first payment to count from");
  const unk = LT.leavingTerms({ tier: "mystery", firstYmd: null, today: "2026-11-02" });
  if (unk.known || unk.sentence) fail("an unreadable plan is given terms");
  if (/\b30\b|three|3-month|\b3\b/.test(code("netlify/functions/_leaving-terms.js").replace(/endDateFromNotice|addDays\(on, 30\)/g, ""))) fail("_leaving-terms.js types a number instead of reading the plan");
  if (DASH.test(std.sentence + fnd.sentence)) fail("the terms sentence has a dash");

  const PC = read("netlify/functions/portal-cancel.js"), pcc = code("netlify/functions/portal-cancel.js");
  if (!/requirePortalOwner\(/.test(pcc) || /requireWorkspace|requirePortalOwnerOrWorkspace/.test(pcc)) fail("the Cancel card isn't the owner's sign-in only");
  if (/notice_date|body\.date|body\.notice/.test(pcc)) fail("the Cancel card takes the notice date from the request");
  if (!/cancellation\.apply\(clientId, "notice", businessYmd\(\)/.test(pcc)) fail("the Cancel card doesn't record today's date through the same code RGA uses");
  if (!/delivered === false/.test(pcc)) fail("the Cancel card doesn't check that RGA was told");
  if (!/after\.state !== "notice"/.test(pcc)) fail("the Cancel card doesn't read the notice back");
  if (/api\.stripe|stripe|refund\(|delete|purge|destroy|\.remove\(/i.test(pcc.replace(/refund/g, ""))) fail("the Cancel card touches Stripe, deletes data or removes something");
  if (/sendAsRga|_gmail/.test(pcc)) fail("the Cancel card emails the client");
  const AR = code("netlify/functions/admin-record-cancellation.js");
  if (!/exports\.apply = apply/.test(AR) || !/return apply\(client_id, action, notice_date\);/.test(AR)) fail("the admin's Record cancellation notice and the client's Cancel card no longer share one function");
  const pj = read("portal/portal.js");
  if (!/data-cx-go/.test(pj) || !/Keep my agreement/.test(pj) || !/Give notice/.test(pj)) fail("the Cancel card's buttons aren't drawn");
  if (!/Nothing is held back if you leave/.test(pj) || !/always yours/.test(pj)) fail("the Cancel card doesn't say nothing is held back");
  if (/refund(ed)? (is )?(automatic|instant)/i.test(pj)) fail("the Cancel card promises an automatic refund");
  if (!/v\.state === "unreadable"\) return csCard\([\s\S]{0,700}data-ask data-ask-where="I would like to cancel"/.test(pj) || !/d && d\.error\) return csCard\([\s\S]{0,700}data-ask data-ask-where="I would like to cancel"/.test(pj)) fail("a client whose plan can't be read (or whose card failed to load) has no other way to leave");
  for (const step of ["m1.access.gbp", "m1.access.analytics", "m1.access.search_console"]) if (!JSON.parse(read("data/playbooks/client-steps.json")) ) fail("client-steps.json unreadable");
  if (!/class="pm-cs pm-tabcs" data-cx-card/.test(pj)) fail("the Cancel card has no home on the dashboard");

  // ── the runtime: the real handler against a fake Supabase ──
  const A = load("./_auth.js"); A.requirePortalOwner = async () => ({ email: "owner@acme.test" });
  const BD = load("./_billing-dates.js");
  const today = BD.businessYmd(), long = BD.addDays(today, -40);
  const world = (tier, { notice = null, paid = true } = {}) => {
    const w = { contract: { id: "k1", tier, signed_at: `${long}T10:00:00Z`, audit_log: notice ? [notice] : [] }, invoices: paid ? [{ id: "i1", invoice_num: 1, amount: tier === "founding" ? 625 : 1250, status: "paid", due_date: long, paid_at: `${long}T10:00:00Z` }, { id: "i2", invoice_num: 2, amount: 625, status: "upcoming", due_date: BD.addMonths(long, 1), paid_at: null }] : [],
      writes: [], told: [], emails: [] };
    globalThis.fetch = async (url, init = {}) => {
      url = String(url); const m = init.method || "GET";
      if (/notify-rga/.test(url)) { w.told.push(JSON.parse(init.body)); return res(200, { delivered: w.notifyDelivered !== false }); }
      if (/gmail|sendgrid|smtp/.test(url)) { w.emails.push(url); return res(200, {}); }
      if (/api\.stripe/.test(url)) { w.stripe = true; return res(200, {}); }
      if (/\/client_contracts\?/.test(url) && m === "GET") return res(200, [w.contract]);
      if (/\/client_contracts\?id=/.test(url) && m === "PATCH") { w.writes.push(["contract", JSON.parse(init.body)]); w.contract = { ...w.contract, ...JSON.parse(init.body) }; return res(200, ""); }
      if (/\/clients\?/.test(url)) return res(200, [{ workspace_id: "w1" }]);
      if (/\/client_invoices\?/.test(url) && m === "GET") return res(200, w.invoices);
      if (/\/client_invoices/.test(url) && m !== "GET") { w.writes.push(["invoice", m]); return res(200, ""); }
      if (/\/client_activity/.test(url)) { w.writes.push(["activity", JSON.parse(init.body).kind]); return res(201, ""); }
      return res(404, {});
    };
    return w;
  };
  const PCm = load("./portal-cancel.js");
  const call = (body) => PCm.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111", ...body }) });
  let w = world("commit_3mo");
  let r = await call({ action: "read" }); let j = JSON.parse(r.body);
  if (j.view?.state !== "none" || !/30 days after you give notice/.test(j.view?.terms?.sentence || "")) fail("a standard client's card doesn't read 30 days from the plan");
  r = await call({ action: "notice", reason: "  Closing   the shop  ", notice_date: "2020-01-01", date: "2020-01-01" }); j = JSON.parse(r.body);
  const ev = w.contract.audit_log.find((e) => e.event === "cancel_notice");
  if (r.statusCode !== 200 || !ev) fail(`the notice wasn't recorded (${r.statusCode} ${r.body.slice(0, 120)})`);
  else {
    if (ev.notice_on !== today) fail(`the notice date is ${ev.notice_on}, not today (${today}); a date in the request must be ignored`);
    if (ev.by !== "client" || ev.by_email !== "owner@acme.test") fail("the notice doesn't record that the client gave it, through the owner's sign-in");
    if (ev.reason !== "Closing the shop") fail("the optional reason isn't kept tidily");
    if (ev.ends_on !== BD.addDays(today, 30)) fail(`a standard client's last day is ${ev.ends_on}, not 30 days on`);
  }
  if (j.view?.state !== "notice" || j.rga_told !== true) fail("the card doesn't read the recorded notice back, or RGA wasn't told");
  if (w.told.length !== 1 || w.told[0].kind !== "client_gave_notice" || !/Work the closing list/.test(w.told[0].message)) fail("RGA isn't told with the closing-list pointer");
  if (w.stripe || w.emails.length) fail("recording a notice reached Stripe or sent an email");
  if (w.writes.some((x) => x[0] === "invoice" && x[1] === "POST")) fail("recording a notice created an invoice");
  r = await call({ action: "notice" }); if (r.statusCode !== 409 || w.contract.audit_log.filter((e) => e.event === "cancel_notice").length !== 1) fail("a second press recorded a second notice");
  // RGA not reachable: still recorded, said plainly
  w = world("commit_3mo"); w.notifyDelivered = false; r = await call({ action: "notice" }); j = JSON.parse(r.body);
  if (r.statusCode !== 200 || j.rga_told !== false || !w.contract.audit_log.some((e) => e.event === "cancel_notice")) fail("a failed RGA notice blocks the client leaving, or is hidden");
  // founding: the minimum
  w = world("founding"); r = await call({ action: "read" }); j = JSON.parse(r.body);
  if (!j.view?.terms?.minimum_applies || !/3-month minimum/.test(j.view.terms.sentence)) fail("a founding client's card doesn't state the 3-month minimum");
  await call({ action: "notice" });
  const evf = w.contract.audit_log.find((e) => e.event === "cancel_notice");
  if (!evf || evf.ends_on !== BD.addMonths(long, 3)) fail(`a founding client's last day is ${evf?.ends_on}, not the end of the 3-month minimum`);
  // not applicable / unreadable plan
  w = world("done_for_you"); r = await call({ action: "read" }); if (JSON.parse(r.body).view?.state !== "not_applicable") fail("a project client gets a monthly Cancel card");
  r = await call({ action: "notice" }); if (w.contract.audit_log.length) fail("a notice was recorded on a project");
  w = world("mystery_plan"); r = await call({ action: "read" }); j = JSON.parse(r.body);
  if (j.view?.state !== "unreadable" || j.view.terms) fail("an unreadable plan is shown terms");
  r = await call({ action: "notice" }); if (r.statusCode === 200 || w.contract.audit_log.length) fail("a notice was recorded on a plan that can't be read");
  // before the first payment: no minimum can be counted, still can leave
  w = world("founding", { paid: false }); r = await call({ action: "notice" });
  if (r.statusCode !== 200 || !w.contract.audit_log.length) fail("a client who hasn't paid yet can't leave");
  // a request without the owner's sign-in
  A.requirePortalOwner = async () => ({ error: { statusCode: 403, headers: {}, body: "{}" } });
  const PCm2 = (delete req.cache[req.resolve("./portal-cancel.js")], load("./portal-cancel.js"));
  w = world("commit_3mo"); r = await PCm2.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111", action: "notice" }) });
  if (r.statusCode !== 403 || w.contract.audit_log.length) fail("a notice was recorded without the owner's sign-in");
}

// ── 8 · nothing emails a client on its own, beyond the existing approved send ──
for (const f of ["netlify/functions/_step-reminders.js", "netlify/functions/_onboarding-notes.js", "netlify/functions/portal-onboarding-notes.js", "netlify/functions/_closing-list.js", "netlify/functions/admin-closing-list.js", "netlify/functions/portal-cancel.js", "netlify/functions/_leaving-terms.js", "shared/call-outcome.js"])
  if (/sendAsRga|_gmail|nodemailer|sendgrid/i.test(code(f))) fail(`${f} sends an email`);

if (F.length) { console.error(`❌ ${F.length} problem(s):\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ Onboarding and leaving hold: wording fixed, reminders off until approved and capped at two, the outcome control stores three plain words, the closing list is a person's marks, roles are lowered, the notes read only what was read, and the Cancel card records the client's own notice from their plan");
