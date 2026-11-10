#!/usr/bin/env node
// check-call-to-client.mjs: FROM THE INTRO CALL TO A SIGNED CLIENT (approved call_to_client_v1 + call2_console_v1, Chris 11-10).
// HOLDS, on the WEBSITE repo (fixtures run against the real modules with a fake fetch; nothing is sent, created or charged):
//   1  BOOKING FROM THE CALL CARD: the walkthrough is held in the SAME ledger (purpose 'walkthrough', a lead_ref, no client_id), titled "Audit walkthrough: <business> × Rocket Growth Agency",
//      logs the Airtable outcome "Callback scheduled" with the Next Action Date, and the press is the send (refused without confirm_to naming the recipient; refused with no email).
//   2  REMINDERS: 24 hours and 1 hour emails for a walkthrough the prospect ACCEPTED and for a booked kickoff; none for a walkthrough with no reply or a decline; none for a cancelled call;
//      each sent once (claim first); "Call them now" from start + 2 minutes with nobody joined; texts OFF by default with the words "Texts are off: Quo key not working"; scheduled in netlify.toml.
//   3  THE CONSOLE: the beats come from the playbook's call2 section (one source), with the findings, intro-call answers, objection chips, notes, timer, Open Meet, and the outcomes Yes / Not yet / No
//      each saved in ONE write (walkthrough-outcome). Yes then offers Start as a client.
//   4  START AS A CLIENT: one press = client record at stage Contract + agreement on the FOUNDING plan (through contract-generate) + the portal invite email; the founding places left come from the real
//      cap count; with the cap reached the plan is the STANDARD plan; BETA is an admin-only "Other plans" choice and is NEVER in the website, the pricing page, the FAQ or any client-visible text.
//   5  OPENED, NOT SIGNED: the first time the client opens a sent agreement it is recorded; 24 hours later ONE reminder email (recorded, never a second), only if opened and not signed; To do shows a row.
//   6  THE FAQ AGREES WITH THE PRICING PAGE: the standard plan has no minimum term, founding has a 3-month minimum (data/offer-pricing.json).
//   7  LEFTOVERS: month cards carry no step number for the customer list; "Foundation work in progress" is not the title of a COMPLETE step; the Setup header does not say results unlock "once setup is done"
//      to a client past setup.
//   8  NO EMOJI / NO EM DASH in anything a client reads from these builds (reminder emails, the agreement reminder).
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default 6c340245) in 10+ places, else exit 2 INDETERMINATE.
//   node scripts/check-call-to-client.mjs [--against=<rev>] [--no-before]
import fs from "node:fs";
import { runGate, reader, loader } from "./lib/site-rev.mjs";

const BEFORE = "6c340245";
Object.assign(process.env, { SUPABASE_URL: "http://supa.test", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon", AIRTABLE_API_KEY: "at", RGA_SUPPRESS_CLIENT_EMAIL: "1", INTERNAL_FN_SECRET: "s", QUO_TEXTS_ENABLED: "" });
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const need = (p, why) => { const s = rd(p); if (s == null) fail(`${p} does not exist (${why})`); return s; };

  // 1 · booking from the call card (source rules; the live double-booking run is in check-master-schedule)
  const wb = need("netlify/functions/walkthrough-book.js", "book the walkthrough from the call card");
  if (wb) {
    if (!/purpose: "walkthrough"/.test(wb) || !/lead_ref/.test(wb)) fail("the walkthrough hold is not purpose 'walkthrough' with a lead_ref");
    if (/client_id:/.test((wb.split("const holdRow")[1] || "").split("\n")[0] || "")) fail("a prospect's hold carries a client_id");
    if (!/Callback scheduled/.test(wb) || !/nextActionDate/.test(wb)) fail('the Airtable outcome "Callback scheduled" + Next Action Date is not logged');
    if (!/confirm_to/.test(wb)) fail("the invite does not require the press to name its recipient");
    if (!/conferenceData/.test(wb)) fail("the invite has no Google Meet link");
    if (/sendUpdates=all/.test(wb) === false) fail("Google does not email the guest");
  }
  need("netlify/functions/walkthrough-slots.js", "the next free times");
  need("netlify/functions/walkthrough-rsvp.js", "the Accepted check");
  const wr = rd("netlify/functions/walkthrough-rsvp.js");
  if (wr && !/responseStatus/.test(wr)) fail("the RSVP check does not read the guest's answer");
  const panel = need("admin/walkthrough.js", "the call card panel + console");
  if (panel) {
    if (!/Send the invite/.test(panel) || !/Waiting for their reply/.test(panel) || !/Accepted/.test(panel)) fail("the call card lacks Send the invite / Waiting for their reply / Accepted");
    if (!/data-wt-slot/.test(panel) || !/wt-taken/.test(panel)) fail("the call card does not show a taken time greyed");
    // 3 · the console
    if (!/RGAPlaybook/.test(panel) || !/id === "call2"/.test(panel)) fail("the console's beats do not come from the playbook's call2 section");
    for (const [re, w] of [[/auditSummary/, "their audit findings"], [/lastNote/, "their intro call answers"], [/data-wt-obj/, "objection chips"], [/data-wt-notes/, "notes"], [/data-wt-timer/, "a timer"], [/Open Meet/, "Open Meet"], [/data-wt-out="yes"/, "Yes"], [/data-wt-out="not_yet"/, "Not yet"], [/data-wt-out="no"/, "No"], [/Start as a client/, "Start as a client"]]) if (!re.test(panel)) fail(`the console lacks ${w}`);
  }
  const calls = rd("admin/calls.js") || "";
  if (!/wireWalkthroughPanel/.test(calls)) fail("the Calls tab does not show the walkthrough panel on the call card");
  const adm = rd("admin/admin.js") || "";
  if (!/todoCallRowsHtml/.test(adm) || !/Call them now/.test(adm) || !/data-todo-wt/.test(adm)) fail("To do has no console / Call them now / unsigned rows");
  const out = need("netlify/functions/walkthrough-outcome.js", "the three outcomes in one write");
  if (out && (!/Interested/.test(out) || !/Callback scheduled/.test(out) || !/Not interested/.test(out) || !/updateCall/.test(out))) fail("walkthrough-outcome does not save Yes / Not yet / No to Airtable and the call row");

  // 2 · reminders
  const rm = need("netlify/functions/_call-reminders.js", "what is due and what it says");
  const cr = need("netlify/functions/call-reminders.js", "the scheduled sender");
  if (cr) {
    if (!/claimReminder/.test(cr)) fail("the reminder sender does not claim before it sends (not idempotent)");
    if (!/sendAsRga/.test(cr)) fail("the reminders do not go through the one Gmail sender");
    if (/Quo|sms|sendText/i.test(cr.replace(/\/\/.*$/gm, ""))) fail("the reminder sender can text (texts must stay off until Quo works)");
  }
  if (!/\[functions\."call-reminders"\]\s*\n\s*schedule\s*=/.test(rd("netlify.toml") || "")) fail("call-reminders is not scheduled in netlify.toml");
  let C = null; try { C = req("./netlify/functions/_call-reminders.js"); } catch (e) { if (rm) fail(`_call-reminders.js does not load: ${e.message.slice(0, 80)}`); }
  if (C) {
    const now = new Date("2026-11-12T17:30:00Z"), base = { status: "booked", kind: "walkthrough", starts_at: "2026-11-13T17:00:00Z", created_at: "2026-11-10T10:00:00Z" };
    const eq = (a, b, w) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${w}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); };
    eq(C.dueEmails({ ...base, rsvp: "accepted" }, now), ["email_24h"], "an accepted walkthrough 23.5 hours out gets the 24-hour email");
    eq(C.dueEmails({ ...base, rsvp: "needsAction" }, now), [], "a walkthrough with no reply gets no reminder");
    eq(C.dueEmails({ ...base, rsvp: "declined" }, now), [], "a declined walkthrough gets no reminder");
    eq(C.dueEmails({ ...base, rsvp: "accepted", status: "cancelled" }, now), [], "a cancelled call gets no reminder");
    eq(C.dueEmails({ ...base, rsvp: "accepted" }, now, new Set(["email_24h"])), [], "a reminder already sent is not sent twice");
    eq(C.dueEmails({ ...base, rsvp: "accepted" }, new Date("2026-11-13T16:10:00Z")), ["email_1h"], "the 1-hour email goes out in the hour before");
    eq(C.dueEmails({ ...base, rsvp: "accepted", created_at: "2026-11-13T00:00:00Z" }, now), [], "a call booked inside 24 hours skips the 24-hour email");
    eq(C.dueEmails({ ...base, kind: "kickoff", rsvp: null }, now), ["email_24h"], "a booked kickoff is reminded without an RSVP");
    eq(C.callNowDue({ status: "booked", kind: "walkthrough", starts_at: base.starts_at }, new Date("2026-11-13T17:03:00Z")), true, "Call them now at start + 3 minutes with nobody joined");
    eq(C.callNowDue({ status: "booked", kind: "walkthrough", starts_at: base.starts_at }, new Date("2026-11-13T17:01:00Z")), false, "no Call them now before start + 2 minutes");
    eq(C.callNowDue({ status: "booked", kind: "walkthrough", starts_at: base.starts_at, joined: true }, new Date("2026-11-13T17:05:00Z")), false, "no Call them now once someone joined");
    const t = C.textsAvailable({}); if (t.on || t.why !== "Texts are off: Quo key not working") fail('texts are not OFF with the words "Texts are off: Quo key not working"');
    for (const [kind, o] of [["email_24h", {}], ["email_1h", { forClient: true }]]) {
      const m = C.reminderEmail(base, kind, { business: "Acme", name: "Dana Lee", theirTz: "Pacific/Honolulu", joinLink: "https://meet.google.com/x", ...o });
      if (emoji.test(m.subject + m.markup) || /—/.test(m.subject + m.markup)) fail(`the ${kind} email has an emoji or em dash`);
      if (!/HST|PT/.test(m.markup)) fail(`the ${kind} email does not show a time zone`);
      if (!/audit walkthrough/.test(m.markup)) fail(`the ${kind} email does not use the call's name`);
    }
    // 5 · opened, not signed
    const day = 86400000, nowT = new Date("2026-11-12T12:00:00Z");
    eq(C.agreementUnsignedDue({ status: "sent", opened_at: new Date(nowT - 25 * 3600000).toISOString() }, nowT), true, "an agreement opened 25 hours ago and unsigned is due its one reminder");
    eq(C.agreementUnsignedDue({ status: "sent", opened_at: new Date(nowT - 5 * 3600000).toISOString() }, nowT), false, "not due 5 hours after opening");
    eq(C.agreementUnsignedDue({ status: "sent", opened_at: new Date(nowT - 3 * day).toISOString(), reminded_at: "x" }, nowT), false, "never a second reminder");
    eq(C.agreementUnsignedDue({ status: "sent" }, nowT), false, "never opened = no 'opened, not signed' reminder");
    eq(C.agreementUnsignedDue({ status: "signed", opened_at: new Date(nowT - 3 * day).toISOString() }, nowT), false, "signed = no reminder");
    const a = C.agreementReminderEmail({ name: "Dana Lee", business: "Acme", portalUrl: "https://x/portal/" });
    if (emoji.test(a.subject + a.markup) || /—/.test(a.subject + a.markup)) fail("the agreement reminder has an emoji or em dash");
  }
  const pg = rd("netlify/functions/portal-get-contracts.js") || "";
  if (!/event: "opened"/.test(pg)) fail("the first time a client opens a sent agreement is not recorded");
  if (!/unsigned_reminder/.test(cr || "")) fail("the one 'agreement waiting' reminder is not recorded");

  // 4 · start as a client
  const sc = need("netlify/functions/start-as-client.js", "one press creates the client, the agreement and the invite");
  if (sc) {
    if (!/stage_1_contract/.test(sc)) fail("the new client is not created at stage Contract");
    if (!/contract-generate/.test(sc)) fail("the agreement does not go through contract-generate");
    if (!/confirm_to/.test(sc)) fail("Start as a client does not require the press to name its recipient");
    if (!/foundingPlacesTaken|foundingCount/.test(sc)) fail("the founding places left are not counted from the real cap");
    const getBranch = (sc.split('event.httpMethod === "GET"')[1] || "").split('event.httpMethod !== "POST"')[0];
    if (/beta/i.test(getBranch)) fail("the plans offered by GET name the beta plan");
  }
  let S = null; try { S = req("./netlify/functions/start-as-client.js"); } catch (e) { if (sc) fail(`start-as-client.js does not load: ${e.message.slice(0, 80)}`); }
  if (S) { if (S._test.planFor(4) !== "founding") fail("with places left the plan is not founding"); if (S._test.planFor(5) !== "commit_3mo") fail("with the cap reached the plan is not the standard plan"); }
  let CG = null; try { CG = req("./netlify/functions/contract-generate.js"); } catch { /* reported above */ }
  if (CG) { if (CG.foundingPlacesTaken([{ client_id: "a", status: "signed" }, { client_id: "b", status: "voided" }, { client_id: "c", status: "sent" }]) !== 2) fail("the founding cap count includes a voided agreement"); }
  // BETA is never client-visible (except the beta client's own agreement, which is contract text)
  for (const p of ["index.html", "pricing/index.html", "faq/index.html", "growth-audit.html", "start-growth-plan/index.html"]) {
    const s = rd(p); if (s && /beta_unbilled|Beta \(no invoice\)|Other plans/i.test(s)) fail(`${p} shows the beta plan`);
  }
  const portal = rd("portal/portal.js") || "";
  if (/Beta \(no invoice\)|Other plans/.test(portal)) fail("the client portal shows the Other plans / beta choice");
  const pricing = JSON.parse(rd("data/offer-pricing.json") || "{}");
  if (JSON.stringify(pricing).includes("beta")) fail("data/offer-pricing.json (the public price schedule) mentions beta");

  // 6 · FAQ agrees with pricing
  const faq = rd("faq/index.html") || "", pr = rd("pricing/index.html") || "";
  if (/(^|[^:\w] )There's no minimum term\./.test(faq.replace(/Not on the standard plan: there's no minimum term\./g, "").replace(/On the standard plan there's no minimum term/g, ""))) fail("the FAQ still says flatly there is no minimum term");
  if (!/Founding clients have a 3-month minimum/.test(faq)) fail("the FAQ does not say founding clients have a 3-month minimum");
  if (!/Founding clients have a 3-month minimum/.test(pr)) fail("the pricing page lost its founding minimum line");
  if ((pricing.founding || {}).minimum_months !== 3) fail("data/offer-pricing.json no longer says 3 minimum months");

  // 7 · leftovers
  if (/ogCustomersRowHtml\(clientId, lists\);\s*\n\s*const rowHtml/.test(portal)) fail("the between-months card still numbers the customer list");
  if (!/monthly: inMonth \|\| !!between/.test(portal)) fail('the reviews card still says "Go to step 8" between months');
  if (!/setupDoneTitle/.test(portal) || /<h4>\$\{escapeHtml\(SETUP_STEP_COPY\[step\.num\]\?\.title \|\| step\.name\)\}<\/h4>\s*<\/div>\s*<button type="button" class="pm-btn sec" data-stage-done-toggle="\$\{detailId\}">\$\{s2ToggleLabel\}/.test(portal)) fail('a COMPLETE Setup step 4 is still titled "Foundation work in progress"');
  if (!/Setup is done\. Your results are unlocked/.test(portal)) fail('the Setup header still says "We\'ll unlock your results once setup is done" to a client past setup');

  // 8 · the SQL file for Chris
  const sql = rd("docs/supabase/RGA_CALLS_AND_STAFF_2026-11-10.sql");
  if (!sql) fail("the SQL file for Chris does not exist");
  else {
    if (!/create table if not exists public\.rga_call_reminders/.test(sql)) fail("the SQL has no reminder ledger");
    if (!/insert into public\.rga_calls/.test(sql) || !/from public\.kickoff_slot_holds/.test(sql) || !/client_onboarding_records/.test(sql)) fail("the SQL does not backfill the existing bookings and kickoff records");
    if (!/insert into public\.rga_staff/.test(sql)) fail("the SQL does not seed RGA's one admin row");
  }
  return F;
}
try {
  await runGate({ name: "check-call-to-client", beforeRev: BEFORE, checkTree, minBefore: 10 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
