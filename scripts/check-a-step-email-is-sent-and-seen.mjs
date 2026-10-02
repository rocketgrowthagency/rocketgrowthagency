#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP'S EMAIL CAN BE SENT, ASKS FIRST, AND THE CLIENT SEES IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-01: *"never got the email"* … *"i want the system to send it and also make it
 * update in client side"*.
 *
 * Four runners generate an email to the client. `flow-execute` has NO send path at all — it returns
 * the text and stores it — so the draft was generated, shown in a toast that read "Done — step 9 ·
 * Email to Chris Kapranos: SUBJECT: …", and then sat there. Nothing was ever sent. At ~540 chars it
 * rendered as a note, and the Copy button only existed on the document weight, so it could not even
 * be copied. **A draft nobody can send is a dead end, and a toast that reads like a receipt for an
 * email nobody sent is worse.**
 *
 * WHAT IS PINNED
 *   1. The sender exists, and the auth guard's refusal is RETURNED, never swallowed by a catch.
 *   2. The step id is allow-listed SERVER-SIDE — only the four runners whose output is an email.
 *   3. The recipient is re-checked against the client's record; a mismatch is refused.
 *   4. The client SEES it: `step_email_sent` is allow-listed in portal-thread's VISIBLE, and the
 *      send writes a client_activity row carrying step_id and the message.
 *   5. The card says "Draft — not sent" until it goes — never "Done" over an unsent email.
 *   6. It ASKS FIRST, in an outward dialog naming the recipient, and reads what the server said.
 *
 * Exit 0 pass · 1 a real defect · 2 could not read a file.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(path.join(SITE, p), "utf8"); } catch { return null; } };

const fail = [];
const F = (m) => fail.push(m);

const send = read("netlify/functions/send-step-email.js");
const thread = read("netlify/functions/portal-thread.js");
const admin = read("admin/admin.js");
// 🔴 STRIP COMMENTS BEFORE MATCHING. The first version looked for "Draft — not sent" anywhere in
// admin.js and found it in the COMMENT that explains the rule — so removing the string from the
// CODE left the gate green. A gate that is satisfied by its own documentation checks nothing.
// → feedback_a_check_must_not_validate_itself
const flow = read("netlify/functions/flow-execute.js");
if (!send || !thread || !admin || !flow) {
  console.error("⚠️  could not read one of send-step-email.js / portal-thread.js / admin.js / flow-execute.js");
  process.exit(2);
}

const adminCode = String(admin || "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("── a step's email is sent, asked for, and seen ──");

// ── 1 · the guard returns its refusal ──────────────────────────────────────────────────────────
if (!/requireWorkspaceForClient/.test(send)) F("send-step-email.js does not call requireWorkspaceForClient — the endpoint is unguarded");
else if (!/const gate = await requireWorkspaceForClient[\s\S]{0,120}?if \(gate\.error\) return gate\.error;/.test(send))
  F("send-step-email.js does not RETURN the guard's refusal. requireWorkspaceForClient RETURNS {error}, it never throws — a try/catch lets an unauthenticated POST through. → project_security_the_guard_that_answered_into_a_void");

// ── 2 · the allow-list, server-side, and it matches the runners that really emit an email ──────
const listed = [...(send.match(/"m1\.[a-z0-9_.]+"/g) || [])].map((s) => s.replace(/"/g, ""));
const emailRunners = [];
{
  const re = /"(m1\.[a-z0-9_.]+)":\s*async[\s\S]*?summary:\s*`([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(flow))) if (/^Email to /.test(m[2])) emailRunners.push(m[1]);
}
if (!emailRunners.length) F("no runner in flow-execute returns an email draft any more — this gate is auditing nothing");
for (const id of emailRunners) if (!listed.includes(id)) F(`${id} generates an email but is not in send-step-email's allow-list, so it can never be sent`);
for (const id of listed) if (!emailRunners.includes(id)) F(`${id} is mailable but its runner no longer returns an email — the allow-list has drifted from flow-execute`);

// ── 3 · the recipient is the one on the record ─────────────────────────────────────────────────
if (!/primary_contact_email/.test(send)) F("send-step-email.js never reads the client's recorded address");
if (!/onRecord[\s\S]{0,200}?toLowerCase\(\) !== to\.toLowerCase\(\)[\s\S]{0,160}?Nothing was sent/.test(send))
  F("send-step-email.js does not refuse a recipient that differs from the client's record — an edited To field could redirect a client email");

// ── 4 · the client sees it ─────────────────────────────────────────────────────────────────────
if (!/VISIBLE\s*=\s*\[[^\]]*"step_email_sent"/.test(thread))
  F('portal-thread does not allow-list "step_email_sent", so the client\'s thread will never show the email that was sent to them');
if (!/kind:\s*"step_email_sent"/.test(send)) F("send-step-email.js never writes a step_email_sent row — the send is invisible in the portal");
if (!/payload:\s*\{[^}]*step_id/.test(send)) F("the client_activity row carries no step_id, so the message cannot attach to the step");
if (!/payload:\s*\{[^}]*message:/.test(send)) F("the client_activity row carries no `message` — portal-thread drops rows whose message is empty");

// ── 5 · the card never calls an unsent email "Done" ────────────────────────────────────────────
// 🔴 PIN IT TO THE ELEMENT, NOT TO A PHRASE. The first version searched admin.js for the words
// "Draft — not sent" and matched an unrelated statusBadge map ("Draft — not sent yet"), so removing
// the text from THIS bar left the gate green. A phrase is not an identifier.
if (!/is-draft">Draft \\u2014 not sent/.test(adminCode))
  F('the email bar no longer says "Draft — not sent" before an email goes — an unsent email must never read as done');
if (!/email_sent_at/.test(adminCode)) F("the admin card does not read email_sent_at, so it cannot tell a sent email from a draft");
if (!/parseStepEmail/.test(adminCode)) F("parseStepEmail is gone — the card cannot tell an email draft from any other output");

// ── 6 · it asks first, and reads the answer ────────────────────────────────────────────────────
const handler = (() => {
  const at = adminCode.indexOf("data-mail-send");
  if (at < 0) return "";
  const open = adminCode.lastIndexOf("document.addEventListener", at);
  let d = 0, i = adminCode.indexOf("{", open), end = -1;
  for (; i >= 0 && i < adminCode.length; i++) { if (adminCode[i] === "{") d++; else if (adminCode[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
  return end > 0 ? adminCode.slice(open, end) : "";
})();
if (!handler) F("cannot find the send handler — this gate is auditing a fragment");
else {
  if (!/rgaDialog\(\{[\s\S]{0,400}?tone: "outward"/.test(handler)) F("the step email does not ask through an outward dialog before sending to a client");
  if (!/k: "To", v: to/.test(handler)) F("the dialog does not name the recipient, so it can be fired at the wrong client by reflex");
  if (!/if \(!r\.ok \|\| !resp\.ok\)/.test(handler)) F("the result is not checked before reporting the email sent — a 200 is not a send");
  if (!/altLabel:/.test(handler)) F("the Gmail escape hatch is gone — if the sender is down there is no way out");
}

if (fail.length) {
  console.error(`\n🔴 ${fail.length} problem(s) with sending a step's email:\n`);
  fail.forEach((f) => console.error("   • " + f));
  process.exit(1);
}
console.log(`  ✅ ${emailRunners.length} email runners, all allow-listed server-side`);
console.log("  ✅ the guard's refusal is returned, and the recipient is checked against the record");
console.log("  ✅ the client sees it — step_email_sent is visible, with step_id and a message");
console.log('  ✅ the card says "Draft — not sent" until it goes, and the send asks first');
console.log("\n✅ a step's email can be sent, asks first, and reaches the client's portal.");
