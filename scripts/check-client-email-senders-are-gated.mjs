#!/usr/bin/env node
/**
 * check-client-email-senders-are-gated.mjs — nothing that mails a client is open to the internet.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11 security pass. `send-invoice-email.js` had **no authentication at all**. Anyone who
 * knew the URL could POST a client_id and make RGA's own Gmail send that client a real invoice or
 * receipt. The only thing in the way was the id being a UUID — and obscurity is not a control.
 *
 * The damage is not hypothetical: unexpected mail from our domain, a client who receives an invoice
 * nobody issued, and the **daily send cap burned** so the next legitimate receipt silently fails.
 * → feedback_a_swallowed_send_failure_is_an_outage
 *
 * 🔑 It was found by asking a different question than "is the code correct?" — namely *"who is
 * allowed to call this?"* Every review of that file had been about what it SENDS.
 *
 * 🔴 AND THE FIRST VERSION OF THIS AUDIT OVERSTATED IT. `send-monthly-report.js` looked equally open
 * and its dispatcher mode mails EVERY client — but it is a SCHEDULED function, and Netlify refuses
 * HTTP invocation of those (403) regardless of the code. It was never reachable. A gate was added
 * anyway as defence-in-depth, because "unreachable because of a platform behaviour" is a property
 * of today's config, not of the function. → feedback_an_excluded_classification_is_a_claim
 *
 * Exit 0 = every client-email sender is gated · 1 = one is open · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const DIR = `${__SITE}/netlify/functions`;

// Any of these means the function decided WHO may call it.
// 🔴 The first version only knew the _auth helpers and flagged three functions that ARE gated, just
// differently: portal-invoice-pay verifies a Supabase bearer token inline, stripe-webhook verifies
// Stripe's signature (the correct gate for a webhook), fga-intake checks a shared webhook secret.
// A gate that cries wolf gets muted, so it now recognises the real mechanisms rather than one
// spelling of them. → feedback_a_check_must_not_validate_itself
const GATES = new RegExp([
  "require(WorkspaceForClient|PortalOwner|InternalSecret|User|CronOrInternal|WorkspaceForClientOrInternal|WorkspaceUser)\\s*\\(",
  "auth/v1/user",                    // inline Supabase bearer verification
  "verifyStripeSignature|stripe-signature",   // a signed webhook
  "invalid_webhook_secret|WEBHOOK_SECRET",    // shared-secret webhook
  "TURNSTILE_SECRET|siteverify",              // human-verified public form
].join("|"));
// Signals that this function actually mails a CLIENT (not an internal alert to RGA).
const SENDS_CLIENT_MAIL = /gmail\.googleapis\.com|messages\/send|toRaw\(|primary_contact_email/;
// Internal-only notifiers to RGA's own inbox are a different risk class and say so themselves.
const INTERNAL_ONLY = /notify-rga|ALERT|internal only/i;

console.log("── nothing that emails a client is callable by a stranger ──");

let files;
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js") && !f.startsWith("_")); }
catch (e) { console.log(`  ⚠️  cannot read ${DIR}: ${e.message}`); process.exit(2); }

const senders = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  if (!SENDS_CLIENT_MAIL.test(src)) continue;
  if (INTERNAL_ONLY.test(f)) continue;
  senders.push([f, src]);
}

if (!senders.length) {
  // A mass-empty result means the probe broke, not that we stopped emailing clients.
  console.log("  ⚠️  found NO client-email senders at all — the probe must be wrong.");
  process.exit(2);
}

let fails = 0;
for (const [f, src] of senders) {
  if (GATES.test(src)) {
    const which = (src.match(GATES) || [])[0].replace(/\s*\($/, "");
    console.log(`  ✅ ${f.padEnd(30)} gated by ${which}()`);
  } else {
    console.log(`  🔴 ${f.padEnd(30)} NO auth gate — a stranger can make us email a client`);
    fails++;
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} client-email sender(s) are open to the internet.`);
  console.log("   Add requireWorkspaceForClientOrInternal(event, clientId) — and remember every");
  console.log("   server-to-server caller then needs x-internal-secret, or the mail silently stops.");
  process.exit(1);
}
console.log(`\n✅ all ${senders.length} client-email sender(s) decide who may call them.`);
process.exit(0);
