#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-client-emails-have-no-em-dash.mjs
//
// 🔒 WHY (2026-11-11, master client-messages page, approved by Chris): Chris's standing rule is US English and NO EM DASH in client text. The
// audit (reports/master-audit/comms.md, rule:no_em_dash) found em dashes in most client senders: the stage emails (C4-C6, C11, R4-R6), the
// agreement and "You're connected" emails (C2, C10), the invoice and receipt subjects (C8, R3, R7), the kickoff invite (K1), the nudge subject
// (M7), the kickoff-passed note (K6). Nothing checked it: check-client-emails-have-one-format checks caps, indents, raw links, the sign-off and
// British words, not dashes. So a dash written into a new email next month would ship unseen.
//
// HOLDS:
//   1. RENDERED (the real builders, fixtures, nothing sent): every stage email (every stage, paid and beta, card and no card), the payment
//      welcome and its reminder, every call reminder (every call, 24 h and 1 h, client and prospect) and every reminder text, the agreement
//      reminder, the agreement / welcome email (every plan), the receipt and every invoice tone (subject, HTML and plain twin), the notice
//      acknowledgment, the first-week, day-50 and mid-month notes, the end-of-service confirmation. Subject, plain twin and HTML each.
//   2. SCANNED (code that only a browser or a handler runs): the kickoff/call invite descriptions, the call titles, the admin's client-email
//      drafts (nudge, kickoff-passed note, recap composer, reminder draft, setting note), the monthly and Month 1 report letters, the step
//      reminders, the step-open emails, the access-step drafts, the invoice document and the branded email shell. Comments are not client text.
//   3. COVERED: every file in netlify/functions that sends mail or a calendar invite (sendAsRga, Gmail's send, letter(), sendGmail, a calendar
//      event) is listed here, rendered, scanned or excused with its reason. A NEW sender that isn't listed fails, so it can't ship unscanned.
//   4. SELF-PROOF: the detector is run on a dash it must catch and on the placeholder it must allow ("—" alone in a table cell = no value),
//      before anything else. A detector that can't see a dash would pass everything.
// An em dash ALONE as a value (a table cell or a whole line: "no number") is allowed: it is the documents' no-value mark, not punctuation.
// Parked outreach (Apps Script) is out of scope by Chris's rule; FGA is parked too.
// exit 0 = no em dash in client text · 1 = one is there (or an unlisted sender) · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const IND = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { IND(`cannot read ${r}`); } };
const F = [], fail = (m) => F.push(m);
const DASH = /—|&mdash;|&#8212;|&#x2014;/i;

/** Where a prose em dash is in a string, or null. A dash alone in a cell or on a line is the no-value mark and is allowed. */
function dashIn(s) {
  const t = String(s == null ? "" : s).replace(/>\s*(?:—|&mdash;)\s*</g, "><").split("\n").filter((l) => !/^\s*(?:—|&mdash;)\s*$/.test(l)).join("\n");
  const m = DASH.exec(t);
  return m ? t.slice(Math.max(0, m.index - 48), m.index + 24).replace(/\s+/g, " ").trim() : null;
}
/** Source with comments gone: a comment is not client text. */
const codeOnly = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, "")).join("\n");

// ── 4 · the detector proves itself first ──
if (!dashIn("Payment received — thank you") || !dashIn("<p>Paid — thanks</p>") || !dashIn("a &mdash; b")) IND("the detector can't see an em dash; fix it before trusting a pass");
if (dashIn("<td>—</td>") || dashIn("Calls\n—\nViews") || dashIn("Payment received. Thank you")) IND("the detector flags the no-value mark or clean text; fix it before trusting a pass");

const req = createRequire(`${SITE}/netlify/functions/x.js`);
process.removeAllListeners("warning");   // the shared docs are ESM without "type": node's notice about it is noise here
// a fake world: no request leaves this machine (any address but the fake database throws)
Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
process.env.RGA_SUPPRESS_CLIENT_EMAIL = "1";
globalThis.fetch = async (u) => {
  if (String(u).startsWith("https://supa.test/")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  throw new Error(`the gate's fake world has no ${u}: nothing leaves this machine`);
};
const load = (m) => { try { return req(`${SITE}/netlify/functions/${m}`); } catch (e) { IND(`${m} did not load: ${e.message}`); } };
const L = load("_letter.js");
const check = (name, { subject = "", markup = null, text = "", html = "" }) => {
  const parts = { subject, text: markup != null ? L.letter(markup).text : text, html: markup != null ? L.letter(markup).html : html };
  for (const [k, v] of Object.entries(parts)) { const d = dashIn(v); if (d) fail(`${name} (${k}): an em dash in client text: "…${d}…"`); }
  return 1;
};
let rendered = 0;

// ── 1 · rendered ──
const N = load("notify-client-stage.js");
if (typeof N.messageFor !== "function") IND("notify-client-stage no longer exports messageFor");
for (const st of ["stage_1b_admin_review", "stage_2_payment", "stage_3_setup", "stage_4_onboarding", "billing_overdue", "billing_warning", "billing_paused", "google_disconnected"])
  for (const beta of [false, true]) for (const hasCard of [false, true]) { const m = N.messageFor(st, { first: "Pat", beta, amount: 625, hasCard }); if (m) rendered += check(`stage email ${st}${beta ? " (beta)" : ""}${hasCard ? " (card)" : ""}`, { subject: m.subject, markup: m.body }); }

const PW = load("_payment-welcome.js");
for (const env of [{}, { STEP_REMINDERS_EMAIL: "on" }]) { const w = PW.buildWelcome({ nowMs: Date.parse("2026-11-11T18:00:00Z"), tz: "America/Los_Angeles", env, first: "Pat" }); rendered += check("the payment welcome", { subject: w.subject, markup: w.markup }); }
{ const r = PW.buildConnectReminder({ primary_contact_name: "Pat" }); rendered += check("the connect-Google reminder", { subject: r.subject, markup: r.markup }); }

const CR = load("_call-reminders.js");
const facts = CR.kickoffFacts ? CR.kickoffFacts({ business_name: "Pat's Plumbing", identity_phone: "3105551234", website_url: "https://pats.test" }) : [];
for (const kind of CR.EMAIL_KINDS || []) for (const r of ["email_24h", "email_1h"]) for (const forClient of [true, false]) {
  const call = { kind, status: "booked", starts_at: "2026-11-13T18:00:00Z", created_at: "2026-11-01T00:00:00Z", rsvp: "accepted" };
  const m = CR.reminderEmail(call, r, { business: "Pat's Plumbing", name: "Pat Lee", theirTz: "America/Los_Angeles", joinLink: "https://meet.google.com/x", forClient, agendaFacts: facts });
  rendered += check(`the ${kind} reminder (${r}${forClient ? "" : ", prospect"})`, { subject: m.subject, markup: m.markup });
  const tk = CR.TEXT_OF && CR.TEXT_OF[r];
  if (tk) rendered += check(`the ${kind} reminder text (${tk})`, { text: CR.reminderText(call, tk, { theirTz: "America/Los_Angeles", joinLink: "https://meet.google.com/x" }) });
}
{ const a = CR.agreementReminderEmail({ name: "Pat Lee", business: "Pat's Plumbing", portalUrl: "https://www.rocketgrowthagency.com/portal/" }); rendered += check("the agreement reminder", { subject: a.subject, markup: a.markup }); }

const SC = load("send-confirmation-email.js");
if (typeof SC.buildEmail !== "function") IND("send-confirmation-email no longer exports buildEmail");
for (const tier of ["monthly", "commit_3mo", "founding", "done_for_you", "beta_unbilled"]) for (const status of ["sent", "signed"]) for (const kickoffWhen of [null, "Friday, November 13 at 10:00 AM"]) {
  const contract = { id: "c1", tier, status, sent_at: status === "sent" ? "2026-11-01T00:00:00Z" : null, audit_log: [{ event: "generated_and_sent", addons: { website_lite: tier === "monthly" }, project_total: 3000 }] };
  let m; try { m = SC.buildEmail({ client: { primary_contact_name: "Pat Lee", business_name: "Pat's Plumbing" }, contract, kickoffWhen, tasks: {}, portalUrl: "https://www.rocketgrowthagency.com/portal/" }); } catch (e) { fail(`the agreement / welcome email (${tier}, ${status}) would not render: ${e.message}`); continue; }
  rendered += check(`the ${status === "signed" ? "welcome" : "agreement"} email (${tier}${kickoffWhen ? ", kickoff booked" : ""})`, { subject: m.subject, markup: m.body });
}

const SI = load("send-invoice-email.js");
if (typeof SI.buildEmail !== "function") IND("send-invoice-email no longer exports buildEmail");
for (const [kind, tone] of [["receipt", "due"], ["invoice", "upcoming"], ["invoice", "due"], ["invoice", "overdue"], ["invoice", "warning"], ["invoice", "paused"]]) {
  let m; try { m = await SI.buildEmail({ kind, tone, invoiceNum: 2, client: { id: "x", primary_contact_name: "Pat Lee", business_name: "Pat's Plumbing", primary_contact_email: "pat@x.test" }, contract: { id: "c1", tier: "monthly", audit_log: [{ event: "generated_and_sent", addons: {} }] }, inv: { id: "i1", amount: 625, due_date: "2026-12-01", status: kind === "receipt" ? "paid" : "due", created_at: "2026-11-01T00:00:00Z" } }); }
  catch (e) { fail(`the ${kind} (${tone}) would not render: ${e.message}`); continue; }
  rendered += check(`the ${kind === "receipt" ? "receipt" : `invoice email (${tone})`}`, { subject: m.subject, text: m.text, html: m.html });
}

const A = load("_notice-ack.js");
for (const invoices of [[{ invoice_num: 4, amount: 322.58, status: "upcoming", due_date: "2026-12-01" }], []]) {
  const a = A.buildAck({ client: { primary_contact_name: "Pat" }, notice: { notice_on: "2026-11-11", ends_on: "2026-12-11" }, invoices });
  if (!a.ok) { fail(`the notice acknowledgment would not build: ${a.why}`); continue; }
  rendered += check("the notice acknowledgment", { subject: a.subject, markup: a.markup });
}
const ON = load("_onboarding-notes.js");
{ const fw = ON.firstWeekDraft({ primary_contact_name: "Pat", business_name: "Pat's" }, { lines: [{ text: "Your main category on Google is Plumber.", source: "Read from your Google profile" }] });
  const d5 = ON.day50Draft({ primary_contact_name: "Pat" }, { day: 52, done: ["Categories"], terms_sentence: "You can stop with 30 days' notice." });
  rendered += check("the first-week note", { subject: fw.subject, markup: fw.markup }) + check("the day-50 note", { subject: d5.subject, markup: d5.markup }); }
const MM = load("_mid-month-note.js");
{ let PB; try { PB = JSON.parse(read("data/playbooks/playbooks.json")).month2plus || []; } catch { PB = []; }
  const tasks = Object.fromEntries(PB.slice(0, 12).map((s) => [s.id, { status: "done", completed_at: "2026-11-05T10:00:00Z" }]));
  const mm = MM.buildMidMonth({ client: { primary_contact_name: "Pat", business_name: "Pat's" }, month: "2026-11-01", playbook: PB, tasks });
  if (mm) rendered += check("the mid-month note", { subject: mm.subject, markup: mm.markup }); }
const OC = load("admin-offboarding-confirm.js");
{ const d = OC.draftFor({ primary_contact_name: "Pat Lee" }, { ends_on: "2026-12-11", items: [{ key: "gbp", label: "Removed us from your Google profile", status: "done", evidence: "read back", at: "2026-12-12T10:00:00Z" }, { key: "web", label: "Your website", status: "na", note: "none" }] });
  rendered += check("the service-ended confirmation (E3)", { subject: d.subject, markup: d.body }); }
const ME = load("_monthly-report-email.js");
if (typeof ME.withCall === "function") { const w = ME.withCall({ subject: "November report", html: `<p>x</p>${ME.CALL_MARK}`, text: `x\n${ME.TEXT_MARK}\n` }, { words: "Tuesday, December 9 at 10:00 AM PST" }); rendered += check("the monthly report's check-in line", { subject: w.subject, text: w.text, html: w.html }); }

// ── 2 · scanned ──
const ADM = codeOnly(read("admin/admin.js"));
const region = (src, startRe, endStr, name) => { const i = src.search(startRe); if (i < 0) { IND(`could not find ${name}`); } const j = src.indexOf(endStr, i + 1); return src.slice(i, j < 0 ? i + 6000 : j); };
const SCANS = {
  "the nudge (admin step reminder)": region(ADM, /function stepNudgeDraft\(/, "\nfunction ", "stepNudgeDraft"),
  "the kickoff-passed note": region(ADM, /async function kickoffPassedNote\(/, "const edited =", "kickoffPassedNote"),
  "the kickoff recap composer": region(ADM, /e\.target\.closest\("\[data-kickoff-recap\]"\)/, '].join("\\n");', "the recap composer"),
  "the To do reminder draft": region(ADM, /const subject = n === 1 \? `Your next step: /, "const edited = await rgaDialog(", "the To do reminder draft"),
  "the call invite descriptions": region(codeOnly(read("netlify/functions/send-kickoff-invite.js")), /description: purpose\.id === "m3_quarterly"/, "start: { dateTime", "the invite description"),
  "the call titles (_call-purpose.js)": codeOnly(read("netlify/functions/_call-purpose.js")),
  "the walkthrough invite": codeOnly(read("netlify/functions/walkthrough-book.js")).split("\n").filter((l) => /summary:|description:|subject:|markup:|`[^`]*`/.test(l) && !/console\.|error:|throw |summary: `[A-Z]+ /.test(l)).join("\n"),
  "the monthly report letter": codeOnly(read("netlify/functions/_monthly-report-email.js")),
  "the Month 1 report letter": codeOnly(read("netlify/functions/_month1-email.js")),
  "the step reminders": codeOnly(read("netlify/functions/_step-reminders.js")),
  "the step-open emails": region(codeOnly(read("netlify/functions/notify-step-open.js")), /function buildEmail\(/, "\nasync function ", "notify-step-open buildEmail"),
  "the duplicate-cleared email": region(codeOnly(read("netlify/functions/notify-step-open.js")), /function buildDupClearedEmail\(/, "\nasync function ", "buildDupClearedEmail"),
  // the email drafts are the `Email to …: SUBJECT … Hi …` summaries (the other summaries in that block are RGA's own step results)
  "the access-step drafts (flow-execute)": (() => { const r = region(codeOnly(read("netlify/functions/flow-execute.js")), /m1\.access\.analytics/, "\n};", "the access drafts").split("\n").filter((l) => /Email to \$\{/.test(l)); if (r.length < 2) IND("the access-step email drafts moved (fewer than 2 found)"); return r.join("\n"); })(),
  "the invoice document": codeOnly(read("shared/invoice-doc.js")).replace(/(["'`])—\1/g, "$1$1"),   // "—" alone = the no-value mark
  "the branded email shell": codeOnly(read("shared/email-doc.js")).replace(/(["'`])—\1/g, "$1$1"),
  "the letter renderer": codeOnly(read("shared/letter.js")),
  // the step-open email's own words come from the playbook (clientOpenEmail on each step)
  "the playbook's step-open email words": (() => { const P = JSON.parse(read("data/playbooks/playbooks.json")); const v = Object.values(P).filter(Array.isArray).flat().filter((s) => s && s.clientOpenEmail).map((s) => JSON.stringify(s.clientOpenEmail)); if (!v.length) IND("no step carries clientOpenEmail any more: re-read where the step-open words live"); return v.join("\n"); })(),
};
for (const [name, src] of Object.entries(SCANS)) { const d = dashIn(src); if (d) fail(`${name}: an em dash in client text: "…${d}…"`); }

// ── 3 · covered: every sender is rendered, scanned or excused ──
const COVERED = {
  "notify-client-stage.js": "rendered", "_payment-welcome.js": "rendered", "call-reminders.js": "rendered (_call-reminders.js)", "send-confirmation-email.js": "rendered",
  "send-invoice-email.js": "rendered", "_notice-ack.js": "rendered", "admin-offboarding-confirm.js": "rendered", "_client-email-queue.js": "rendered (its notes are _onboarding-notes / _mid-month-note; its stage emails are notify-client-stage)",
  "_monthly-close.js": "scanned (_monthly-report-email.js + the check-in line rendered)", "send-monthly-report.js": "scanned (_monthly-report-email.js)", "admin-month1-report.js": "scanned (_month1-email.js)",
  "notify-step-open.js": "scanned (buildEmail, buildDupClearedEmail; _step-reminders.js)", "send-kickoff-invite.js": "scanned (the descriptions; titles in _call-purpose.js)",
  "walkthrough-book.js": "scanned", "send-step-email.js": "sends the words RGA reviewed in admin (scanned there: the nudge and the reminder draft) and flow-execute's access drafts (scanned)",
  "send-kickoff-recap.js": "sends the recap composer's words (scanned in admin.js)",
  "portal-reply.js": "RGA's own typed reply to the client's question: free text a person writes, never a template",
  "_monthly-health.js": "the quarterly letter block rides inside the monthly report (scanned there)",
};
const EXCUSED = {
  "_gmail.js": "the one sender itself: no words of its own", "job-watcher.js": "emails RGA (hello@), never a client", "rga-notify-email-background.js": "emails RGA, never a client",
  "rga-todo-morning.js": "emails RGA's morning To do list, never a client", "cancel-kickoff-invite.js": "Google writes the canceled-event email; our words there are RGA's activity rows",
  "kickoff-rsvp-check.js": "reads Google's RSVP; its words are RGA's activity rows", "schedule-call-action.js": "moves/cancels a call on Google (Google writes that email)",
  "walkthrough-rsvp.js": "reads Google's RSVP, sends nothing",
};
const SENDER = /sendAsRga\(|users\/me\/messages\/send|[^a-zA-Z.]letter\(|sendGmail\(|calendar\/v3\/calendars\/primary\/events/;
let files; try { files = fs.readdirSync(`${SITE}/netlify/functions`).filter((f) => f.endsWith(".js")); } catch { IND("cannot list netlify/functions"); }
const senders = files.filter((f) => SENDER.test(codeOnly(fs.readFileSync(`${SITE}/netlify/functions/${f}`, "utf8"))));
if (senders.length < 10) IND(`found only ${senders.length} senders: the probe must be wrong`);
for (const f of senders) if (!COVERED[f] && !EXCUSED[f]) fail(`${f} sends mail or an invite and this gate neither renders, scans nor excuses it: add it to COVERED (rendered or scanned) or EXCUSED (with why)`);
for (const f of [...Object.keys(COVERED), ...Object.keys(EXCUSED)]) if (!files.includes(f)) fail(`${f} is listed here but no longer exists: re-read the list`);

if (rendered < 60) IND(`only ${rendered} emails rendered: a builder stopped answering`);
if (F.length) { console.error(`🔴 an em dash in client text (${F.length}):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ no em dash in client text: ${rendered} emails rendered (subject, plain twin, HTML), ${Object.keys(SCANS).length} producers scanned, ${senders.length} senders all covered`);
