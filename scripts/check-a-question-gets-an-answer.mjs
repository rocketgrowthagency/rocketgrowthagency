#!/usr/bin/env node
/**
 * check-a-question-gets-an-answer.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 ONE THREAD, TWO SURFACES. A CONVERSATION SPLIT ACROSS TWO INBOXES IS NOT A CONVERSATION.
 *
 * Chris, 2026-09-18: *"whats industry standard should this be email only, email with message in app
 * combo, or just message in the app only… on both admin and client side"*.
 *
 * The answer every serious tool converges on — Intercom, Zendesk, Help Scout, Front, Linear — is a
 * single canonical thread that lives in the PRODUCT, with email as a transport rather than a second
 * inbox. Email-only loses context and state: which client, which step, answered or not. In-app-only
 * loses attention, because nobody logs into a portal daily. The failure to design against is two
 * inboxes that drift, each holding half the conversation.
 *
 * RGA had only the inbound half. A client could ask; there was no way to ANSWER from admin, so a
 * reply could only be sent from a mailbox — invisible to the portal, leaving the client's question
 * sitting in their checklist looking ignored while our inbox said it was handled.
 *
 * This gate holds the shape that fixes it:
 *   1. a reply is ONE act with TWO effects — the thread AND the email, never one alone
 *   2. the record is written BEFORE the send, and a failed email is reported, not swallowed
 *   3. the client can read their own thread, through a PROJECTION, never the raw activity row
 *   4. both surfaces render it: a reply box in admin, the conversation on the step in the portal
 *   5. `Reply-To` is set, because mail from us to us otherwise replies to OURSELVES
 *
 * → feedback_an_alert_nobody_reads_is_not_an_alert · feedback_the_escape_hatch_stays_in_the_product
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
// 🔑 Strip only LINE-LEADING comments: the obvious block-comment regex eats the `/*` inside strings
// like a route glob and deletes live code after it. → feedback_a_gate_window_measured_in_characters_will_lie
const code = (s) => s.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── a client question reaches us, and our answer reaches them ──");

// ── 1 & 2. The reply: record first, email second, both reported ────────────────────────────────
let reply = "";
try { reply = code(read("netlify/functions/portal-reply.js")); }
catch { bad("portal-reply.js is missing — there is no way to answer a client from admin"); }
if (reply) {
  if (!/requireWorkspaceForClient\s*\(/.test(reply)) {
    bad("portal-reply is not gated to an admin whose workspace owns the client — anyone could write into a client's thread");
  }
  if (!/kind: "rga_reply"/.test(reply)) bad("the reply is not stored as rga_reply — the thread would only ever hold one side");
  // 🔴 The write must be CONFIRMED before we send, and refuse if it did not land.
  if (!/if \(!logged\)/.test(reply)) {
    bad("portal-reply does not check the activity row landed — a reply could be emailed and never recorded, "
      + "which is the two-inbox drift this whole design exists to prevent");
  }
  // 🔑 THE CALL, NOT THE IMPORT. `indexOf("sendAsRga")` finds the require() at the top of the file
  // and reported a correct ordering as broken. An identifier appears wherever it is named; only the
  // invocation tells you when it runs. → feedback_a_check_must_not_validate_itself
  const writeAt = reply.indexOf('kind: "rga_reply"');
  const sendAt = reply.search(/await sendAsRga\s*\(/);
  if (writeAt < 0 || sendAt < 0 || writeAt > sendAt) {
    bad("portal-reply emails before it records — if the write then fails, the client has an answer we have no copy of");
  }
  // 🔴 A half-success must not report as a success — and the check must read the CATCH block, not
  // the file. `emailed: false` appears twice; replacing one of them left the other to satisfy a
  // whole-file match, so the gate passed on a mutation that hid a failed send.
  // 🔑 ANY catch, not the FIRST one. portal-reply has two: the activity write and the send. Matching
  // the first found the wrong block and reported a correct failure path as missing.
  const catches = [...reply.matchAll(/\} catch \(e\) \{[\s\S]*?\n  \}/g)].map((m) => m[0]);
  const reportsHalfSuccess = catches.some((b) => /emailed: false/.test(b) && /warning:/.test(b));
  if (!reportsHalfSuccess) {
    bad("portal-reply's failure path does not report `emailed: false` with a warning — "
      + "a half-success reported as a success is how people stop trusting a tool");
  }
}

// ── 3. The client's read is a projection, not the row ──────────────────────────────────────────
let thread = "";
try { thread = code(read("netlify/functions/portal-thread.js")); }
catch { bad("portal-thread.js is missing — the portal promises a reply it cannot show"); }
if (thread) {
  if (!/requirePortalOwner\s*\(/.test(thread)) bad("portal-thread is not gated — a stranger could read a client's conversation");
  if (!/kind=in\.\(/.test(thread)) {
    bad("portal-thread does not restrict which activity KINDS it returns — client_activity holds every "
      + "robot event, admin action and Stripe webhook for that client");
  }
  // 🔑 It must map to named fields. Returning `payload` would leak `by`, `email_error`, `gmail_id`
  // and whatever a future writer adds.
  if (/payload: r\.payload/.test(thread) || /\.\.\.r\.payload/.test(thread)) {
    bad("portal-thread returns the raw payload — widening that column would silently widen what a client reads");
  }
  if (!/message: String\(r\.payload\?\.message/.test(thread)) {
    bad("portal-thread no longer projects the message field explicitly — the allow-list has gone");
  }
  // 🔴 A failed read must not render as an empty thread — asserted against the CATCH, because a
  // whole-file search for `json(500` also matches the "Server misconfigured" guard at the top and
  // passed on a mutation that turned a failed read into an empty list.
  const readCatches = [...thread.matchAll(/\} catch \(e\) \{[\s\S]*?\n  \}/g)].map((m) => m[0]);
  if (!readCatches.some((b) => /json\(500/.test(b))) {
    bad("portal-thread's catch does not report a failed read — 'no messages' because a query failed "
      + "tells a client we never answered them");
  }
}

// ── 4. Both surfaces render it ─────────────────────────────────────────────────────────────────
const admin = code(read("admin/admin.js"));
if (!/rga_reply:\s*\{ cls/.test(admin)) bad("admin has no label for rga_reply — our own answers would render as a raw slug");
if (!/data-send-reply/.test(admin)) bad("admin has no reply control — answering would mean leaving for a mailbox");
if (!/r\.kind !== "client_message" \? "" :/.test(admin)) {
  bad("the reply box is not restricted to client messages — a Reply box under a Stripe webhook is noise");
}
if (!/portal-reply/.test(admin)) bad("admin's reply control posts nowhere");
// 🔑 A fresh token per call. The activity panel can sit open for hours.
if (!/auth\.getSession\(\)\)\?\.data\?\.session\?\.access_token/.test(admin)) {
  bad("admin's reply uses no freshly-read session token — after an hour every reply would 401");
}

const portal = code(read("portal/portal.js"));
if (!/function threadHtml\s*\(/.test(portal)) bad("the portal has no thread renderer — the reply would arrive only by email");
if (!/threadHtml\(step\.id\)/.test(portal)) {
  bad("the thread is not rendered on the step it belongs to — a client who asked from step 2 looks for the answer on step 2");
}
if (!/portal-thread/.test(portal)) bad("the portal never loads the thread");
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A MESSAGE WITH NO STEP MUST STILL HAVE A HOME. The first version filtered on
// `m.step_id === stepId`, so anything sent from the SUPPORT card — which carries no step — was
// stored, returned by the endpoint, and rendered nowhere. The client saw no record of asking, and
// our reply would have been invisible to them, in the one place a client goes when they do not
// know which step their problem belongs to.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔑 IN THE SUPPORT CARD, not merely somewhere in the file. The first version of this assertion
// matched the `threadHtml(null)` inside repaintSupportThread(), so deleting the card's own render
// left the gate green. Scope the window to the card.
{
  const card = (portal.match(/pm-card pm-support[\s\S]{0,1200}?<\/div>\s*<\/div>/) || [""])[0];
  if (!/\$\{threadHtml\(null\)\}/.test(card)) {
    bad("the Support card does not render the step-less conversation — a message sent from there would "
      + "vanish from the client's view, in the one place they go when they do not know which step it belongs to");
  }
}
if (!/stepId \? m\.step_id === stepId : !m\.step_id/.test(portal)) {
  bad("threadHtml does not handle the step-less case — passing no step id must select the messages that belong to no step");
}
// 🔑 And it must be filled BEFORE the Support card renders, or that card paints empty and is never redrawn.
if (!/loadPortalThread\(row\.client_id\)/.test(portal)) {
  bad("the thread is not loaded before the client section is built — the Support card would render empty on first paint");
}
if (!/function repaintSupportThread\s*\(/.test(portal)) {
  bad("no repaint for the Support card — the thread would arrive after the card was already drawn");
}
// 🔴 A failed load must keep what we had rather than blanking it.
if (!/catch[\s\S]{0,160}could not load your messages/.test(portal)) {
  bad("a failed thread load is not handled distinctly — blanking on error would read as 'we never answered you'");
}
const css = read("portal/portal.css");
if (!/\.pm-thread\{/.test(css)) bad(".pm-thread has no styles — the conversation would render as unstyled text");
if (!/\.pm-msg\.is-rga\{/.test(css)) bad("our replies are not visually distinguished from theirs");

// ── 5. Reply-To, so "reply" is true ────────────────────────────────────────────────────────────
let gmail = "";
try { gmail = code(read("netlify/functions/_gmail.js")); }
catch { bad("_gmail.js is missing"); }
if (gmail) {
  if (!/Reply-To: \$\{replyTo\}/.test(gmail)) {
    bad("no Reply-To header — mail we send from our own address to our own address replies to OURSELVES, "
      + 'while the body says "reply to them directly"');
  }
  // 🔴 A header value carrying a newline lets a caller append headers of their own.
  if (!/isEmail\(replyTo\)/.test(gmail)) {
    bad("Reply-To is not validated as a bare address — a CR/LF in it would let a caller inject mail headers");
  }
  if (!/gmail\\.send/.test(gmail)) bad("_gmail does not check the send scope before trying — a 403 three calls later is not an instruction");
}

// 🔑 AND THE HEADER IS ACTUALLY EMITTED. Asserting the source contains a template is not the same
// as the function producing it — this builds a message and reads the bytes back.
try {
  const { toRaw } = await import(path.join(SITE, "netlify/functions/_gmail.js"));
  const decoded = Buffer.from(
    toRaw({ to: "a@b.com", from: "c@d.com", subject: "s", body: "b", replyTo: "client@example.com" })
      .replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  if (!/^Reply-To: client@example\.com$/m.test(decoded)) bad("toRaw() does not emit the Reply-To header it appears to build");
  const injected = Buffer.from(
    toRaw({ to: "a@b.com", from: "c@d.com", subject: "s", body: "b", replyTo: "x@y.com\r\nBcc: evil@z.com" })
      .replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  if (/Bcc:/i.test(injected)) bad("toRaw() lets a crafted Reply-To inject extra mail headers");
} catch (e) {
  console.error(`[thread] INDETERMINATE — could not exercise toRaw(): ${e.message}`);
  process.exit(2);
}

console.log(fail
  ? `\n🔴 ${fail} way(s) a client question goes unanswered or an answer goes unseen.`
  : "\n✅ a question is stored, emailed and answerable from admin; the answer lands in their portal and their inbox.");
process.exit(fail ? 1 : 0);
