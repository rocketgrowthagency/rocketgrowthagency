#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-client-messages-build.mjs — the client-messages build (master client-messages page, approved by Chris 11-11), RUN on fakes.
//
// 🔒 WHY. The audit (reports/master-audit/comms.md) found: three emails in a minute at first payment (C6 + C7 + C8); two "Tomorrow" emails before
// the kickoff (K2 + K3); a second late invoice or a second lost Google connection emailing NOTHING (R4-R6, C11 keyed by stage for the client's
// lifetime); no written acknowledgment when a client gives notice; no hold-and-undo window on any automatic stage email, though the never-email
// rule's own note asks for one; the first-week and day-50 notes hand-sent from Gmail; the monthly report never proposing the check-in.
// HOLDS (each by running the real module; nothing is sent, the database and Google are fakes):
//   1. C6 retired for a paying client (beta keeps theirs); stage 3 for a paying client sends nothing
//   2. R4-R6 and C11 keyed per OCCURRENCE (invoice / connection): two occurrences = two keys; no occurrence = refused, never keyed by the stage;
//      the callers pass it (billing-daily-check: the invoice, WITH the internal secret; disconnect: the removed connection, only when one was removed)
//   3. the HOLD: an event email is queued, not sent; the sweep sends nothing before the window, sends once after it, never twice; Hold stops it
//      for good (until RGA's Send); Drop means never; a note (press) is never sent by the sweep; a mid-month note (design pending) is never listed;
//      two sweeps claiming at once send ONE; a failed one is re-armed by the next event; the To do rows say Hold / Send / Drop
//   4. the notice acknowledgment: the notice date, the end date, the last bill (or "nothing more"), the 5-business-day promise; a withdrawn
//      notice is not acknowledged; the client's own notice queues it (portal-cancel), keyed to that notice
//   5. the notes RGA approves: letter markup, drafted into To do (client-notes-draft), sent through the queue on RGA's press, kept in the portal
//      thread (rga_note_sent); the mid-month note says what was done, nothing when nothing was
//   6. the monthly report proposes ONE check-in time at send (the same slot rule as the portal's "RGA recommends"); no time = the report as built,
//      no mark left; the kept copy is the copy sent
//   7. the wiring: both jobs scheduled in netlify.toml and on System health's job list; admin To do has Hold / Send / Drop on the queue's rows
// exit 0 holds · 1 regressed · 2 can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const IND = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { IND(`cannot read ${r}`); } };
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
process.env.RGA_SUPPRESS_CLIENT_EMAIL = "1";
globalThis.fetch = async (u) => { throw new Error(`the gate's fake world has no ${u}: nothing leaves this machine`); };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (m) => { try { return req(`${SITE}/netlify/functions/${m}`); } catch (e) { IND(`${m} did not load: ${e.message}`); } };
const quiet = async (fn) => { const k = ["log", "warn", "error"], old = k.map((x) => console[x]); k.forEach((x) => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = old[i]; }); } };

// ── 1 · C6 retired for a paying client ──
const N = load("notify-client-stage.js");
if (typeof N.messageFor !== "function" || typeof N.keyFor !== "function" || typeof N.deliver !== "function") IND("notify-client-stage no longer exports messageFor / keyFor / deliver");
if (N.messageFor("stage_3_setup", { first: "Pat", beta: false, amount: 625 })) fail("C6 is back for a paying client: three emails at first payment again (the payment welcome is the one email)");
if (!N.messageFor("stage_3_setup", { first: "Pat", beta: true })) fail("a BETA client lost their stage-3 email: they never pay, so the payment welcome never reaches them");

// ── 2 · per occurrence ──
for (const st of ["billing_overdue", "billing_warning", "billing_paused", "google_disconnected"]) {
  if (N.keyFor(st, "inv-1") === N.keyFor(st, "inv-2")) fail(`${st}: two occurrences share one key, so the second is never emailed`);
  if (N.keyFor(st, "inv-1") === st) fail(`${st}: keyed by the stage name for the client's lifetime`);
}
if (N.keyFor("stage_1b_admin_review", "x") !== "stage_1b_admin_review") fail("a once-per-client stage email is keyed per occurrence (it could go twice)");
{ const r = await quiet(() => N.deliver({ clientId: "c", stage: "billing_overdue", occurrence: null }));
  if (r.statusCode !== 400) fail(`a per-occurrence stage with no occurrence was not refused (HTTP ${r.statusCode}): it would be keyed for the lifetime again`); }
{ const B = code(read("netlify/functions/billing-daily-check.js")), blk = B.slice(B.indexOf("/.netlify/functions/notify-client-stage"), B.indexOf("/.netlify/functions/notify-client-stage") + 500);
  if (!/occurrence: invoice\.id/.test(blk)) fail("billing-daily-check doesn't key the notice to the invoice (occurrence)");
  if (!/"x-internal-secret": process\.env\.INTERNAL_FN_SECRET/.test(blk)) fail("billing-daily-check calls notify-client-stage without the internal secret: it answers 401 and no overdue notice ever goes");
  const D = code(read("netlify/functions/oauth-google-disconnect.js"));
  if (!/occurrence: lost\.id \|\| lost\.connected_at/.test(D) || !/if \(lost\) try \{/.test(D) || !/Prefer: "return=representation"/.test(D)) fail("the disconnect email isn't keyed to the connection removed, or goes when nothing was removed"); }

// ── 3 · the hold ──
const Q = load("_client-email-queue.js");
const world = () => {
  const rows = []; let seq = 0, clock = Date.parse("2026-11-11T18:00:00Z"); const sent = [];
  const supa = async (path, init = {}) => {
    const [t, qs = ""] = path.replace(/^\//, "").split("?");
    if (t !== "client_activity") throw new Error(`no table ${t}`);
    if ((init.method || "GET") === "POST") { const r = JSON.parse(init.body); rows.push({ id: ++seq, created_at: new Date(clock + seq).toISOString(), ...r }); return null; }
    const p = new URLSearchParams(qs);
    return rows.filter((r) => [...p.entries()].every(([k, v]) => (k === "client_id" && v.startsWith("eq.") ? r.client_id === v.slice(3) : k === "client_id" && v.startsWith("in.(") ? v.slice(4, -1).split(",").includes(r.client_id) : k === "kind" && v.startsWith("in.(") ? v.slice(4, -1).split(",").includes(r.kind) : true)));
  };
  const d = { supa, now: () => new Date(clock).toISOString(), env: {}, dispatch: async (it) => { sent.push(it.key); return { result: "sent", gmail_id: `g${sent.length}` }; } };
  return { rows, sent, d, tick: (min) => { clock += min * 60000; } };
};
{
  const W = world(), C = "c1";
  const q = await Q.enqueue({ clientId: C, key: "stage:billing_overdue:inv-1", kind: "stage", mode: "timer", subject: "Your invoice is past due", markup: "Hi", args: { stage: "billing_overdue", occurrence: "inv-1" } }, W.d);
  if (!q.queued || !q.send_after) fail("an event email was not queued with its send time");
  if (Date.parse(q.send_after) - Date.parse(W.d.now()) < 5 * 60000) fail("the hold window is under 5 minutes: RGA has no time to Hold it");
  W.tick(2); await Q.sweep(W.d);
  if (W.sent.length) fail("the sweep sent an email before its hold window ran out");
  const mv = Q.movesOf(Q.fold(W.rows), { now: W.d.now() });
  if (!mv.length || mv[0].email.state !== "waiting" || !/unless you hold it/.test(mv[0].what)) fail("a waiting email isn't in To do as \"sends at … unless you hold it\"");
  W.tick(10); await Q.sweep(W.d); await Q.sweep(W.d);
  if (W.sent.length !== 1) fail(`after the window the sweep sent it ${W.sent.length} times (want exactly once)`);
  if (Q.movesOf(Q.fold(W.rows), { now: W.d.now() }).length) fail("a sent email still sits in To do");
  const again = await Q.enqueue({ clientId: C, key: "stage:billing_overdue:inv-1", kind: "stage", mode: "timer", subject: "x", markup: "x" }, W.d);
  if (again.queued) fail("the same email was queued a second time after it went");
}
{
  const W = world(), C = "c2";
  await Q.enqueue({ clientId: C, key: "welcome", kind: "welcome", mode: "timer", subject: "You're connected. Book your kickoff call", markup: "Hi" }, W.d);
  const h = await Q.hold({ clientId: C, key: "welcome", by: "chris@rga" }, W.d);
  if (!h.ok) fail(`Hold didn't take: ${h.error}`);
  W.tick(30); await Q.sweep(W.d);
  if (W.sent.length) fail("a HELD email was sent by the sweep");
  const mv = Q.movesOf(Q.fold(W.rows), { now: W.d.now() });
  if (!mv.length || mv[0].email.state !== "held") fail("a held email isn't in To do waiting for Send or Drop");
  const s = await Q.sendOne({ clientId: C, key: "welcome", by: "chris@rga" }, W.d);
  if (!s.ok || W.sent.length !== 1) fail("RGA's Send on a held email didn't send it once");
  const W2 = world();
  await Q.enqueue({ clientId: C, key: "notice_ack:a", kind: "notice_ack", mode: "timer", subject: "We received your cancellation notice", markup: "Hi" }, W2.d);
  const dr = await Q.drop({ clientId: C, key: "notice_ack:a", by: "chris@rga" }, W2.d);
  W2.tick(30); await Q.sweep(W2.d);
  if (!dr.ok || W2.sent.length) fail("a DROPPED email was sent (or the drop didn't take)");
  // a hold that comes after the send says so, never "held"
  const W3 = world();
  await Q.enqueue({ clientId: C, key: "k", kind: "stage", mode: "timer", subject: "s", markup: "m", args: { stage: "stage_1b_admin_review" } }, W3.d);
  W3.tick(11); await Q.sweep(W3.d);
  const late = await Q.hold({ clientId: C, key: "k" }, W3.d);
  if (late.ok || !/already went/.test(late.error || "")) fail("Hold on an email that already went reads as held");
}
{
  // a note: never on a timer, never by the sweep; RGA's edited words go
  const W = world(), C = "c3";
  let threw = false; try { await Q.enqueue({ clientId: C, key: "first_week", kind: "first_week", mode: "timer", subject: "s", markup: "m" }, W.d); } catch { threw = true; }
  if (!threw) fail("a note was allowed onto the timer: it would send without RGA's press");
  await Q.enqueue({ clientId: C, key: "first_week", kind: "first_week", mode: "press", subject: "What we found in your first week", markup: "Hi" }, W.d);
  W.tick(60 * 24); await Q.sweep(W.d);
  if (W.sent.length) fail("the sweep sent a note RGA hadn't approved");
  const mv = Q.movesOf(Q.fold(W.rows), { now: W.d.now() });
  if (!mv.length || mv[0].email.state !== "draft" || !/read it, then send it/.test(mv[0].what)) fail("a drafted note isn't in To do for RGA to read and send");
  let words = null; const d2 = { ...W.d, dispatch: async (it) => { words = it.markup; W.sent.push(it.key); return { result: "sent" }; } };
  await Q.sendOne({ clientId: C, key: "first_week", by: "chris@rga", words: { subject: "What we found in your first week", markup: "Hi Pat, edited." } }, d2);
  if (words !== "Hi Pat, edited.") fail("RGA's edited words were not the ones sent");
  // design pending: kept, never listed
  await Q.enqueue({ clientId: C, key: "mid_month:2026-11", kind: "mid_month", mode: "press", subject: "x", markup: "y", design_pending: true }, W.d);
  if (Q.movesOf(Q.fold(W.rows), { now: W.d.now() }).some((m) => m.email.key === "mid_month:2026-11")) fail("the mid-month note shows in To do before its design is drawn");
}
{
  // two sweeps at once: one send
  const W = world(), C = "c4";
  await Q.enqueue({ clientId: C, key: "k", kind: "stage", mode: "timer", subject: "s", markup: "m" }, W.d);
  W.tick(11);
  let n = 0; const slow = { ...W.d, dispatch: async () => { n++; await new Promise((r) => setTimeout(r, 5)); return { result: "sent" }; } };
  await Promise.all([Q.sweep(slow), Q.sweep(slow)]);
  if (n !== 1) fail(`two sweeps at once sent it ${n} times`);
  // a failed one: shown as failed, armed again by its next event
  const W2 = world(), fails = { ...W2.d, dispatch: async () => ({ result: "failed", error: "Gmail refused" }) };
  await Q.enqueue({ clientId: C, key: "payment_welcome", kind: "payment_welcome", mode: "timer", subject: "You're set", markup: "Hi" }, W2.d);
  W2.tick(11); await Q.sweep(fails);
  const f1 = Q.movesOf(Q.fold(W2.rows), { now: W2.d.now() });
  if (!f1.length || f1[0].email.state !== "failed") fail("a failed send isn't in To do as failed (Send / Drop)");
  const re = await Q.enqueue({ clientId: C, key: "payment_welcome", kind: "payment_welcome", mode: "timer", subject: "You're set", markup: "Hi" }, W2.d);
  W2.tick(11); await Q.sweep(W2.d);
  if (!re.queued || W2.sent.length !== 1) fail("a failed email was not armed again by its next event (the senders retried on the next event before the hold)");
  // not due any more: never sent, said why
  const W3 = world(), gone = { ...W3.d, dispatch: async () => ({ result: "not_due", why: "the account is active now" }) };
  await Q.enqueue({ clientId: C, key: "x", kind: "stage", mode: "timer", subject: "s", markup: "m" }, W3.d);
  W3.tick(11); await Q.sweep(gone);
  const st = Q.fold(W3.rows).get("x");
  if (!st || st.state !== "dropped" || !/active/.test(st.why || "")) fail("an email no longer true at send time isn't dropped with its reason");
}
{
  const Qs = code(read("netlify/functions/_client-email-queue.js")), NS = code(read("netlify/functions/notify-client-stage.js"));
  if (!/holdOk && HOLD_STAGES\.has\(stage\)/.test(NS) || !/holdOk: auth\.internal === true/.test(NS)) fail("notify-client-stage doesn't hold an EVENT's stage email (or holds RGA's own press)");
  for (const s of ["stage_1b_admin_review", "billing_overdue", "billing_warning", "billing_paused", "google_disconnected"]) if (!N.HOLD_STAGES.has(s)) fail(`${s} has no hold window`);
  if (N.HOLD_STAGES.has("stage_2_payment")) fail("the first-invoice email (RGA's Accept press) is held: RGA already pressed it");
  if (!/client\.billing_status !== BILL\[stage\]/.test(NS)) fail("a billing notice paid during the hold would still go (the state isn't re-read at send)");
  if (!/it\.kind === "stage"[\s\S]{0,200}require\("\.\/notify-client-stage"\)\.deliver\(/.test(Qs)) fail("the queue doesn't send a stage email through notify-client-stage");
  if (!/it\.kind === "notice_ack"[\s\S]{0,200}require\("\.\/_notice-ack"\)\.sendAck\(/.test(Qs)) fail("the queue doesn't send the notice acknowledgment through _notice-ack");
  if (!/kind: "rga_note_sent"/.test(Qs)) fail("a note RGA sends leaves no copy in the client's portal thread");
  if (!/"rga_note_sent"\]/.test(code(read("netlify/functions/portal-thread.js")))) fail("the portal thread doesn't show the notes RGA sends (rga_note_sent)");
  const ADM = read("admin/admin.js");
  // the To do row itself (mvRgaRowHtml): a waiting email's main button is Hold; a held / failed / drafted one has Send and Drop
  if (!/em\.state === "waiting" \? `<button type="button" class="admin-button mv-main" data-mv-email="hold" \$\{emAttr\}>Hold<\/button>`/.test(ADM)
    || !/data-mv-email="send" \$\{emAttr\}>Send<\/button><button type="button" class="admin-button admin-button-secondary" data-mv-email="drop" \$\{emAttr\}>Drop<\/button>/.test(ADM)
    || !/\/\.netlify\/functions\/admin-client-email/.test(ADM)) fail("admin To do has no Hold / Send / Drop on the client-email rows");
  const OM = code(read("netlify/functions/admin-open-moves.js"));
  if (!/Q\.movesOf\(its/.test(OM)) fail("the queue's rows never reach admin To do");
  if (!/client_email_unread/.test(OM)) fail("a failed read of the queue is silence in To do, not a row");
}

// ── 4 · the notice acknowledgment ──
{
  const A = load("_notice-ack.js");
  const a = A.buildAck({ client: { primary_contact_name: "Pat Lee" }, notice: { notice_on: "2026-11-11", ends_on: "2026-12-11" }, invoices: [{ invoice_num: 3, amount: 500, status: "paid" }, { invoice_num: 4, amount: 322.58, status: "upcoming", due_date: "2026-12-01" }] });
  if (!a.ok) fail(`the acknowledgment doesn't build: ${a.why}`);
  else {
    if (!/November 11, 2026/.test(a.markup)) fail("the acknowledgment doesn't state the notice date");
    if (!/ends on [A-Z][a-z]+day, December 11, 2026/.test(a.markup)) fail("the acknowledgment doesn't state the end date");
    if (!/\$322\.58/.test(a.markup) || !/December 1, 2026/.test(a.markup)) fail("the acknowledgment doesn't state the last bill (amount and due date)");
    if (!/five business days/.test(a.markup) || !/December 18, 2026/.test(a.markup)) fail("the acknowledgment doesn't make the 5-business-day promise with its date");
    if (/—/.test(a.subject + a.markup)) fail("the acknowledgment has an em dash");
  }
  const none = A.buildAck({ client: {}, notice: { notice_on: "2026-11-11", ends_on: "2026-12-11" }, invoices: [{ invoice_num: 4, amount: 500, status: "paid" }] });
  if (!none.ok || !/Nothing more is billed/.test(none.markup)) fail("with every invoice paid, the acknowledgment doesn't say nothing more is billed");
  if (A.buildAck({ client: {}, notice: null, invoices: [] }).ok) fail("an acknowledgment builds with no notice");
  const deps = (log) => ({ supa: async (p) => (/client_contracts/.test(p) ? [{ id: "k", tier: "monthly", audit_log: log }] : /clients\?/.test(p) ? [{ id: "c", primary_contact_email: "pat@x.test", primary_contact_name: "Pat" }] : []), send: async () => { throw new Error("sent a withdrawn notice"); } });
  const w = await A.sendAck({ clientId: "c" }, deps([{ event: "cancel_notice", notice_on: "2026-11-11", ends_on: "2026-12-11" }, { event: "cancel_withdrawn" }]));
  if (w.sent || w.why !== "withdrawn") fail("a notice withdrawn during the hold is still acknowledged");
  const PC = code(read("netlify/functions/portal-cancel.js"));
  if (!/if \(pv\.ok\) ack = await require\("\.\/_client-email-queue"\)\.enqueue\(\{[^}]*key: `notice_ack:\$\{after\.notice\.notice_on\}:\$\{after\.notice\.ends_on\}`, kind: "notice_ack", mode: "timer"/.test(PC)) fail("the client's own notice doesn't queue its acknowledgment (keyed to that notice)");
}

// ── 5 · the notes ──
{
  const ON = load("_onboarding-notes.js"), MM = load("_mid-month-note.js"), L = load("_letter.js");
  const fw = ON.firstWeekDraft({ primary_contact_name: "Pat", business_name: "Acme" }, { lines: [{ text: "Your main category on Google is Plumber.", source: "Read from your Google profile" }] });
  if (!fw || !fw.markup || /Talk soon/.test(fw.markup)) fail("the first-week note isn't letter markup with the one sign-off");
  if ((L.letter(fw.markup).text.match(/Rocket Growth Agency · \(/g) || []).length !== 1) fail("the first-week note doesn't sign exactly once");
  if (MM.buildMidMonth({ client: {}, month: "2026-11-01", playbook: [{ id: "m2.exec.gbp_posts", title: "Google posts" }], tasks: {} })) fail("a mid-month note is written when nothing is done yet");
  const mm = MM.buildMidMonth({ client: { primary_contact_name: "Pat" }, month: "2026-11-01", playbook: [{ id: "m2.exec.gbp_posts", title: "Google posts", clientLabel: "Posted an update to your Google profile" }], tasks: { "m2.exec.gbp_posts": { status: "done", completed_at: "2026-11-05T00:00:00Z" } } });
  if (!mm || !/November/.test(mm.subject) || !mm.items.length) fail("the mid-month note doesn't say what was done this month");
  const CN = load("client-notes-draft.js");
  const drafted = await CN.draftsFor({ id: "c", primary_contact_name: "Pat" }, new Date("2026-11-15T16:00:00Z"), { notesFor: async () => ({ first_week: { lines: [1] }, first_week_expired: false, day50: null, drafts: { first_week: fw, day50: null } }), month1ClosedAt: async () => "2026-10-02T00:00:00Z", monthTasks: async () => ({ "m2.exec.gbp_posts": { status: "done", completed_at: "2026-11-05T00:00:00Z" } }), playbook: () => [{ id: "m2.exec.gbp_posts", title: "Google posts", clientLabel: "Posted an update" }] });
  if (!drafted.some((x) => x.key === "first_week")) fail("the first-week note isn't drafted into To do");
  const mid = drafted.find((x) => x.kind === "mid_month");
  if (!mid || mid.design_pending !== true) fail("the mid-month note isn't queued, or is queued without design_pending (it would show before its design)");
  const CNs = code(read("netlify/functions/client-notes-draft.js"));
  if (!/mode: "press"/.test(CNs) || /mode: "timer"/.test(CNs)) fail("client-notes-draft queues a note on a timer: it must wait for RGA's press");
}

// ── 6 · the monthly report proposes a check-in ──
{
  const ME = load("_monthly-report-email.js"), MC = load("_monthly-close.js");
  const draft = { subject: "November report: Acme", html: `<p>a</p>${ME.CALL_MARK}<p>b</p>`, text: `a\n${ME.TEXT_MARK}\nb` };
  const w = ME.withCall(draft, { words: "Tuesday, December 9 at 10:00 AM PST" });
  if (!/Tuesday, December 9 at 10:00 AM PST/.test(w.html) || !/#step-m2\.call\.monthly/.test(w.html) || !/Book this time/.test(w.text)) fail("the report's check-in line doesn't name the time and link the booking");
  const n = ME.withCall(draft, null);
  if (/rga:monthly-call/.test(n.html + n.text)) fail("with no time to offer, the mark is left in the report");
  const built = ME.buildMonthlyEmail({ month: "2026-11-01", frozen: null, withoutGoogle: true, client: { primary_contact_name: "Pat", business_name: "Acme" }, playbook: [], tasks: {} });
  if (!built.ok || !built.html.includes(ME.CALL_MARK) || !built.lines.includes(ME.TEXT_MARK)) fail("the built report has no place for the check-in line");
  // sendReport on fakes: the email that goes carries the time; the kept copy is the copy sent
  const sentMail = [], kept = [];
  const deps = { now: () => Date.parse("2026-12-05T17:00:00Z"), readStepRecord: async () => ({ tasks: {}, data: { report_draft: draft, frozen: {} } }), readClient: async () => ({ id: "c", workspace_id: "w", primary_contact_email: "pat@x.test", billing_status: "active" }),
    gmail: async (m) => { sentMail.push(m); return { ok: true, id: "g1" }; }, keepReport: async (o) => { kept.push(o); return { ok: true, kept: true }; }, monthNumber: async () => 3, writeStepTasks: async () => true,
    suggestCall: async () => ({ start: "2026-12-09T18:00:00Z", words: "Tuesday, December 9 at 10:00 AM PST" }) };
  const r = await quiet(() => MC.sendReport({ clientId: "c", month: "2026-11-01", deps }));
  if (r.status !== 200 || !sentMail.length || !/December 9 at 10:00 AM/.test(sentMail[0].html)) fail("the report that went doesn't propose the check-in time");
  if (!kept.length || kept[0].html !== sentMail[0].html) fail("the kept copy isn't the report as sent (with its check-in line)");
  const sent2 = []; const r2 = await quiet(() => MC.sendReport({ clientId: "c", month: "2026-11-01", deps: { ...deps, gmail: async (m) => { sent2.push(m); return { ok: true, id: "g2" }; }, suggestCall: async () => ({ none: "no open time" }) } }));
  if (r2.status !== 200 || !sent2.length || /rga:monthly-call|monthly check-in/i.test(sent2[0].html)) fail("with no time to offer, the report doesn't go exactly as built");
  const SC = code(read("netlify/functions/_suggested-call.js"));
  if (!/require\("\.\/kickoff-availability"\)\.monthlyRecommendation\(/.test(SC) || !/freeSlots\(/.test(SC)) fail("the suggested time isn't the portal's own \"RGA recommends\" rule over the same slot finder");
  if (!/suggestCall: \(\{ clientId, nowMs \}\) => require\("\.\/_suggested-call"\)\.suggestMonthlyCall\(/.test(code(read("netlify/functions/_monthly-close.js")))) fail("the real report send has no check-in time wired");
}

// ── 7 · the jobs are scheduled and watched ──
{
  const T = read("netlify.toml"), M = read("netlify/functions/_job-manifest.js");
  for (const [job, cron] of [["client-email-queue", "*/5 * * * *"], ["client-notes-draft", "0 16 * * *"]]) {
    if (!new RegExp(`\\[functions\\."${job}"\\]\\s*\\n\\s*schedule = "${cron.replace(/\*/g, "\\*")}"`).test(T)) fail(`${job} isn't scheduled (${cron}) in netlify.toml`);
    if (!M.includes(`job: "${job}"`) || !M.includes(`cron: "${cron}"`)) fail(`${job} isn't on System health's job list`);
  }
  const J = code(read("netlify/functions/client-email-queue.js"));
  if (!/requireCronOrInternal\(event\)/.test(J) || !/withCheckin\("client-email-queue"/.test(J)) fail("the sweep isn't scheduler-only, or doesn't check in");
}

if (F.length) { console.error(`🔴 the client-messages build regressed (${F.length}):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ client messages: C6 retired (beta kept), late notices + disconnects once per occurrence, every event email held with Hold/Send/Drop, notes on RGA's press in one format, the notice acknowledged, the report proposes a check-in");
