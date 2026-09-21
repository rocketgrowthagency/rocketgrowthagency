#!/usr/bin/env node
/**
 * check-review-requests-can-actually-be-sent.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 THE PROMISE HAD NO MECHANISM BEHIND IT, FOR AS LONG AS IT EXISTED.
 *
 * Found 2026-09-21. Two client-facing steps told a paying client:
 *
 *   step 12: "we send each one a personal request from you — you never have to chase anybody"
 *   step 16: "We auto-send personalized review requests"
 *
 * Nothing sent anything. `flow-execute` drafts the templates with AI, the client APPROVES them,
 * and the chain stops there. No SMS provider exists anywhere in the codebase — Quo is call
 * tracking, not messaging — and `client_customer_lists` had zero rows. The copy had been written
 * against an intention and never revisited against the code.
 *
 * 🔑 WHAT REPLACED IT. We write each message; the client sends it from their own number in one tap.
 * That is not a fallback — a review request in a thread the customer recognises outperforms an
 * agency shortcode, which is why Podium and Birdeye work the same way. It needs no provider, no
 * per-client number, and no opt-out handling to get wrong.
 *
 * This gate holds the three things that make it honest:
 *   1. no client-facing copy claims WE send review requests while no sender exists
 *   2. the endpoint refuses to hand over a request with no review link behind it
 *   3. "sent" is recorded as the CLIENT'S claim, never as our observation
 *
 * → feedback_we_never_promise_what_we_dont_do · feedback_an_excluded_classification_is_a_claim
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
const code = (s) => s.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── a review request we promise is one the client can actually send ──");

// ── 1. Does a real sender exist? ───────────────────────────────────────────────────────────────
// 🔑 If one is ever built, the copy may legitimately say "we send" again — so this asks the code,
// not a hardcoded answer. Quo is EXCLUDED by name: it is call tracking, and finding its key here
// was what made this look like a solved problem at a glance.
const fnDir = path.join(SITE, "netlify/functions");
const fns = fs.readdirSync(fnDir).filter((f) => f.endsWith(".js"));
const SMS_SENDER = /twilio|messagebird|vonage|telnyx|sinch|clicksend|\bsms\.send\b|messages\.create/i;
const hasSmsSender = fns.some((f) => SMS_SENDER.test(fs.readFileSync(path.join(fnDir, f), "utf8")));

// ── 2. Client-facing copy must match that answer ───────────────────────────────────────────────
const pb = JSON.parse(read("data/playbooks/playbooks.json"));
const steps = [...(pb.month1 || []), ...(pb.month2plus || [])];
// "we send / we auto-send / we'll text them" — a claim that WE are the sender.
const CLAIMS_WE_SEND = /\b(we|we'll|we will)\s+(auto-?send|send|text|email)\b[^.]{0,60}\b(request|review|them|each)\b/i;
for (const s of steps) {
  for (const field of ["clientHint", "clientLabel", "clientInstructions"]) {
    const v = String(s[field] || "");
    if (!v) continue;
    if (CLAIMS_WE_SEND.test(v) && !hasSmsSender) {
      bad(`${s.id} ${field} claims WE send ("${v.match(CLAIMS_WE_SEND)[0].slice(0, 54)}…") and no sender exists in the code`);
    }
  }
}
const portalSrc = read("portal/portal.js");
if (!hasSmsSender && /automatically text\/email each one/i.test(portalSrc)) {
  bad("the customer-list card still says we automatically text/email each customer, and nothing does");
}

// ── 3. The endpoint that hands over the requests ───────────────────────────────────────────────
let rr = "";
try { rr = code(read("netlify/functions/portal-review-requests.js")); }
catch { bad("portal-review-requests.js is missing — the client has no prepared requests to send"); }
if (rr) {
  if (!/requirePortalOwner\s*\(/.test(rr)) bad("portal-review-requests is not gated — a stranger could read a client's customer list");
  // 🔴 A request with no link sends the customer nowhere, which is worse than not sending.
  if (!/blocked/.test(rr) || !/reviewLinkFor/.test(rr)) {
    bad("it does not refuse to hand over requests when there is no review link — a message asking for a "
      + "review with nowhere to leave one is worse than no message");
  }
  // 🔴 Never our observation. Tapping sms: hands off to the phone and nothing reports back.
  if (!/marked_sent_by_client/.test(rr)) {
    bad('a send is not recorded as the CLIENT\'s claim — we cannot see an sms: hand-off, so calling it "sent" asserts what we cannot know');
  }
  if (/\bsent: true\b/.test(rr) || /delivered: true/.test(rr)) {
    bad("it records a send as delivered — nothing reports back from the phone's messaging app");
  }
  // 🔴 Indexes, not caller-supplied names: a name would be text we later render.
  if (!/Number\.isInteger/.test(rr)) bad("marks are not restricted to integer indexes — a caller could write arbitrary text into the list");
  // 🔴 Scoped to this client, or a valid session could mark another business's list.
  if (!/client_id=eq\.\$\{clientId\}&select=id,customers/.test(rr)) {
    bad("the list lookup is not scoped to the authenticated client — one session could mark another business's list");
  }
  // 🔴 A PATCH that matched nothing returns success.
  if (!/return=representation/.test(rr) || !/if \(!saved\)/.test(rr)) {
    bad("the mark is not read back — a PATCH that matched no row returns success and the client would be told it saved");
  }
}

// ── 4. And the portal actually offers it ───────────────────────────────────────────────────────
if (!/data-review-send/.test(portalSrc)) bad("the portal renders no tap-to-send control — the prepared requests would sit unused");
if (!/href="sms:/.test(portalSrc)) bad("no sms: link — the client would have to retype the message we wrote");
if (!/loadReviewRequests\(/.test(portalSrc)) bad("nothing loads the prepared requests");
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A LOADER MUST NOT CAPTURE ITS HOSTS BEFORE THE SURFACE EXISTS. Hit twice in one week: the
// Support card, then this. Both ran alongside the client section's render, both did
// `querySelectorAll` at the TOP of the function, and at that moment the card was not in the DOM —
// so the function returned immediately and the card rendered permanently empty. The element
// existed by the time the fetch resolved; the reference taken before it did not.
// → feedback_an_element_that_exists_is_not_one_they_can_see
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const fn = (portalSrc.match(/async function loadReviewRequests[\s\S]*?\n\}/) || [""])[0];
  const q = fn.indexOf('querySelectorAll("[data-review-requests]")');
  const fetched = fn.indexOf("await fetch");
  if (q >= 0 && fetched >= 0 && q < fetched) {
    bad("loadReviewRequests resolves its hosts BEFORE awaiting the data — the customer-list card is not "
      + "in the DOM at call time, so it would find nothing and render empty forever");
  }
}

console.log(fail
  ? `\n🔴 ${fail} problem(s). A review request we promise must be one the client can actually send.`
  : `\n✅ ${hasSmsSender ? "a sender exists" : "no sender exists, and nothing claims one"}; `
    + "every prepared request carries a live review link, and a send is recorded as the client's own word.");
process.exit(fail ? 1 : 0);
