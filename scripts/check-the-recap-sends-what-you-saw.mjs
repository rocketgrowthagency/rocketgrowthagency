// check-the-recap-sends-what-you-saw.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔒 Approved 2026-09-28 — reports/mockups/admin_send_recap_in_product_v1.html
//
// The recap now sends from the product instead of handing off to Gmail. That moves a client email
// one button-press away, so the properties that make it safe are worth pinning:
//
//   1. WHAT LEAVES IS WHAT WAS ON SCREEN. The server must send the composed body, not re-compose
//      one — a server that rebuilt the text would silently discard Chris's edits after a real call.
//   2. IT CANNOT GO TO THE WRONG PERSON. The address is checked against the client's record.
//   3. NOTHING SENDS WITHOUT ASKING, and the ask names the recipient.
//   4. THE ESCAPE HATCH STAYS. Gmail remains reachable for the day the sender is down.
//   5. A 200 IS NOT A SEND, and "sent" on the pane is read from a recorded timestamp.
// → feedback_never_send_client_email_without_asking · feedback_the_escape_hatch_stays_in_the_product
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = (...p) => path.join(SITE, ...p);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const pass = [], fail = [];

const fn = read(F("netlify", "functions", "send-kickoff-recap.js"));
const admin = read(F("admin", "admin.js"));
if (!fn) { console.error("🔴 FAIL — netlify/functions/send-kickoff-recap.js is gone; the recap cannot send from the product."); process.exit(1); }
if (!admin) { console.error("⚠️  INDETERMINATE — admin.js not found."); process.exit(2); }

// ── 1. THE SERVER SENDS THE COMPOSED BODY ──────────────────────────────────────────────────────
const sendCall = fn.match(/sendAsRga\(\{[\s\S]*?\}\)/);
if (!sendCall) fail.push("send-kickoff-recap.js — nothing calls sendAsRga, so the recap cannot go at all.");
else {
  if (!/body:\s*text\b/.test(sendCall[0]))
    fail.push("send-kickoff-recap.js — the body sent is not the composed `text` from the request, so Chris's edits after the call are discarded.");
  else pass.push("what leaves is the body that was on screen");
  if (!/suppress:/.test(sendCall[0]))
    fail.push("send-kickoff-recap.js — no suppress flag, so a test run against a real client would mail them.");
  else pass.push("a suppressed environment cannot mail a real client");
}

// ── 2. IT CANNOT GO TO THE WRONG PERSON ────────────────────────────────────────────────────────
if (!/primary_contact_email/.test(fn) || !/onRecord/.test(fn))
  fail.push("send-kickoff-recap.js — the recipient is not read from the client's record, so a mistyped composer could mail anyone.");
else if (!/toLowerCase\(\)\s*!==\s*to\.toLowerCase\(\)|to\.toLowerCase\(\)\s*!==/.test(fn))
  fail.push("send-kickoff-recap.js — the posted address is never compared against the record, so it is decorative.");
else pass.push("the address is checked against the client's own record");
// 🔴 SCOPED TO THE SEND CALL. This first tested the WHOLE FILE for `to: onRecord` — which also
// appears in the success response — so mutating the actual recipient to the posted address passed
// the gate. A check about a call has to read the call.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
if (!sendCall || !/to:\s*onRecord/.test(sendCall[0]))
  fail.push("send-kickoff-recap.js — it sends to the posted address rather than the one on the record.");
else pass.push("it sends to the record's address, not the browser's");

// ── 3. THE GUARD IS THE ONE EVERY CLIENT-FACING SENDER USES ────────────────────────────────────
// 🔴 AN IMPORT IS NOT A CALL. This tested for the identifier, which is also on the require() line,
// so deleting the actual guard passed the gate. Require the awaited call.
if (!/await\s+requireWorkspaceForClient\s*\(\s*event\s*,/.test(fn))
  fail.push("send-kickoff-recap.js — no workspace auth is actually CALLED. A client email endpoint must be gated like every other one.");
else pass.push("it is gated by the same guard as the other client senders");

// ── 3b. AND ITS ANSWER IS READ ─────────────────────────────────────────────────────────────────
// 🔴🔴 CALLING A GUARD IS NOT BEING GUARDED. This function shipped with the call wrapped in a
// try/catch — but `requireWorkspaceForClient` RETURNS `{ error }`, it never throws, so the refusal
// went into a void and an unauthenticated POST reached the client lookup on production.
// The gate above passed the whole time, because the call was right there.
// 🔑 Every caller of these guards must branch on the returned `.error`.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
{
  const RETURNING_GUARDS = ["requireWorkspaceForClient", "requireUser", "requireWorkspaceUser", "requirePortalOwner"];
  for (const g of RETURNING_GUARDS) {
    const call = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*await\\s+${g}\\s*\\(`).exec(fn);
    if (!call) continue;
    const name = call[1];
    if (!new RegExp(`if\\s*\\(\\s*${name}\\.error\\s*\\)`).test(fn))
      fail.push(`send-kickoff-recap.js — ${g}() is called and its refusal is never read. It RETURNS { error }, it does not throw, so an unauthenticated caller walks straight past it.`);
    else pass.push(`the ${g}() refusal is actually read`);
  }
  if (/try\s*\{\s*(?:const|let|\w+)?\s*\w*\s*=?\s*await\s+require(?:WorkspaceForClient|User|PortalOwner)/.test(fn))
    fail.push("send-kickoff-recap.js — an auth guard is wrapped in try/catch. These guards return their refusal rather than throwing, so a catch silently allows the request.");
  else pass.push("no auth guard is wrapped in a catch that would swallow its refusal");
}

// ── 4. NOTHING SENDS WITHOUT ASKING, AND THE ASK NAMES THE RECIPIENT ───────────────────────────
// 🔴🔴 A WINDOW MEASURED IN CHARACTERS WILL LIE — AND IT ACCUSES CORRECT CODE. This was
// `anchor + 6000`. On 2026-10-01 a three-line comment was added inside the handler and pushed the
// `if (!r.ok || !j.ok)` result check to anchor+6091 — 91 characters past the cut — so this gate
// reported "the result is not checked before reporting the recap sent" about code that checks it.
// Bounded on a REAL EDGE now: the close of the delegated listener the anchor sits in.
// → feedback_a_gate_window_measured_in_characters_will_lie
const handler = (() => {
  const at = admin.indexOf("data-kickoff-recap]");
  if (at < 0) return "";
  // walk back to the listener this anchor lives in, then brace-match forward to its close
  const open = admin.lastIndexOf("document.addEventListener", at);
  const from = open >= 0 ? open : at;
  let d = 0, i = admin.indexOf("{", from), end = -1;
  for (; i >= 0 && i < admin.length; i++) {
    if (admin[i] === "{") d++;
    else if (admin[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  // 🔑 If the braces do not balance, say so rather than silently auditing a fragment.
  if (end < 0 || end <= at) { fail.push("could not bound the recap handler — this gate is auditing a fragment, not the handler."); return admin.slice(at, at + 12000); }
  return admin.slice(from, end);
})();
if (!/rgaDialog\(\{[\s\S]{0,600}?tone: "outward"/.test(handler))
  fail.push("admin/admin.js — the recap does not ask through an outward dialog before sending to a client.");
else pass.push("it asks first, in an outward dialog");
// 🔴 PIN THE PROPERTY — "the recipient is named where the send is committed" — NOT the button's
// label. This demanded `okLabel: \`Send to ${first}\``. Chris, 2026-09-30: *"can we change Send to
// Chris to just 'Send'"*, and the dialog already names the recipient in full on its To row, three
// lines above the button — a better place for it than a derived first name, which also reads oddly
// when the client shares a first name with the sender. A gate written from a principle must never
// outrank what Chris actually asked for.
// → feedback_a_gate_written_from_a_slogan_defends_the_misreading · feedback_do_what_chris_asked_not_the_principled_version
{
  const namesInDialog = /fields:\s*\[[\s\S]{0,300}?k:\s*"To"\s*,\s*v:\s*to\b/.test(handler);
  const namesOnButton = /okLabel:\s*`Send to \$\{[^}]+\}`/.test(handler);
  if (!namesInDialog && !namesOnButton) {
    fail.push("admin/admin.js — nothing names the recipient at the moment of sending: the dialog has no To row showing the address, and the button does not name them either. It can be fired at the wrong client by reflex.");
  } else {
    pass.push(namesInDialog
      ? "the recipient is named on the dialog's To row, above the button"
      : "the send button names the recipient");
  }
}
if (!/altLabel: "Open in Gmail instead"/.test(handler))
  fail.push("admin/admin.js — the Gmail escape hatch is gone; if the sender is down there is no way to send the recap at all.");
else pass.push("the Gmail escape hatch is still there");
// 🔴 Enter in a textarea is a NEWLINE. If the dialog fires on Enter, the composer sends on the
// first paragraph break — at a client.
if (!/const area = isPrompt && inputType === "textarea"/.test(admin) || !/!area &&/.test(admin))
  fail.push("admin/admin.js — Enter is not suppressed for a textarea dialog, so the composer can send on a paragraph break.");
else pass.push("Enter cannot send a multi-line body");

// ── 5. A 200 IS NOT A SEND ─────────────────────────────────────────────────────────────────────
if (!/!r\.ok \|\| !j\.ok/.test(handler))
  fail.push("admin/admin.js — the result is not checked before reporting the recap sent.");
else pass.push("the reported result comes from what the server said");
if (!/recap_sent_at/.test(fn) || !/recap_sent_at/.test(admin))
  fail.push("the after-call pane's \"sent\" state is not backed by a recorded timestamp.");
else pass.push("the pane reads a recorded send, not an assumption");

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with sending the recap:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ the recap sends exactly what you saw, to the person on the record, and only when asked (${pass.length} checks).`);
