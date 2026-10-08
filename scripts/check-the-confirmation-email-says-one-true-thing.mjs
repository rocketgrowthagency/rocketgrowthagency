#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-confirmation-email-says-one-true-thing.mjs
//
// 🔴 WHY (2026-09-24). Chris read the confirmation email that actually landed in his inbox. Three
// lines apart it said:
//
//     PLAN SELECTED
//     Beta Engagement (unbilled) — no charge. ... Nothing bills ...
//     NEXT STEPS
//     ... I'll counter-sign, send your first invoice, ...
//
// An invoice, promised to a client the same email calls free. The branch keyed only on
// signed-vs-unsigned and knew nothing about the tier — the identical shape to the defect that made
// this email wrong for three of four plans, where the one tier RGA happens to be on was the one
// that read correctly, so the live send looked perfect.
//
// It also promised a COUNTER-SIGNATURE on an agreement signed two months earlier, and nothing in
// the product counter-signs anything.
//
// And three further failures of the same family, all found in that one reading:
//
//   · A SECOND COPY OF THE EMAIL lived in admin.js, feeding the "Open a draft instead" hatch. It
//     had rotted: still "Agreement — arriving separately in the next few minutes" (the exact line
//     Chris caught months earlier, fixed in the sender and never here), still the cut "no
//     long-term contract" line, still the removed WHAT I NEED FROM YOU block, still the old
//     subject. The hand path would have sent a materially wronger email, recording nothing.
//
//   · THE DUPLICATE-SEND GUARD WAS DEAD. It read `auto_result.gmail_message_id`; flow-execute
//     re-wraps a runner's return, so the artifact sits at `auto_result.outcome_data.…`. The guard
//     saw undefined, so "Run again" would have emailed the client TWICE while the step's own
//     instructions promised "It will not send twice."
//
//   · A BANNER QUOTED A SENTENCE THE EMAIL NO LONGER CONTAINED — “Calendar invite is on its way”,
//     removed from the sender on 09-10. For two weeks the product told the operator the client had
//     been promised something they were never told.
//
// WHAT THIS CHECKS — by RUNNING the real template, not by reading it for shape:
//   1. no plan is told about an invoice unless its own schedule bills something
//   2. nothing promises a counter-signature
//   3. every variant clears the ~500-char spam floor and wraps at <= 78 for plain text
//   4. an unknown/unstateable plan still REFUSES rather than inventing terms
//   5. admin.js holds no second copy of the email body
//   6. the duplicate-send guard reaches the artifact where flow-execute actually writes it
//   7. the promise banner reads the STORED body instead of hardcoding a quote
//
// exit 0 = the email says one true thing · 1 = it does not · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_the_shown_price_must_be_the_charged_price
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = process.env.CONFIRM_GATE_SITE_DIR || `${__SITE}`;
const FNS = path.join(SITE, "netlify", "functions");
const SENDER = path.join(FNS, "send-confirmation-email.js");
const ADMIN = path.join(SITE, "admin", "admin.js");

const indeterminate = (m, ...x) => { console.error(`⚠️  INDETERMINATE — ${m}`); x.forEach((l) => console.error(`   ${l}`)); process.exit(2); };
for (const f of [SENDER, ADMIN]) if (!fs.existsSync(f)) indeterminate(`${path.basename(f)} not found.`);

const problems = [];
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const senderSrc = fs.readFileSync(SENDER, "utf8");
const adminSrc = strip(fs.readFileSync(ADMIN, "utf8"));

// ── load the REAL buildEmail ──────────────────────────────────────────────────────────────────
// 🔑 Run the template, do not pattern-match it. A gate that greps for "first invoice" passes the
// moment someone rewords the sentence while keeping the bug.
// The sender does not export buildEmail, so stage a copy in the OS temp dir (never in the repo)
// alongside the modules it requires, and append one export line.
let buildEmail, PLANS;
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rga-confirm-gate-"));
  try {
    for (const f of fs.readdirSync(FNS)) {
      const src = path.join(FNS, f);
      if (!fs.statSync(src).isFile()) continue;
      if (!/\.js$/.test(f)) continue;
      fs.copyFileSync(src, path.join(tmp, f));
    }
    fs.appendFileSync(path.join(tmp, "send-confirmation-email.js"), "\nmodule.exports.buildEmail = buildEmail;\n");
    const req = createRequire(path.join(tmp, "x.js"));
    buildEmail = req("./send-confirmation-email.js").buildEmail;
    PLANS = req("./contract-generate.js").PLANS;
  } catch (e) {
    indeterminate("could not load the real email template.", String(e.message).split("\n")[0]);
  }
  if (typeof buildEmail !== "function" || !PLANS) indeterminate("buildEmail or PLANS did not load.");
}

const render = (tier, status, kickoffWhen) => buildEmail({
  client: { primary_contact_name: "Test Client" },
  contract: { tier, status },
  kickoffWhen, tasks: {}, portalUrl: "https://www.rocketgrowthagency.com/portal/",
});

// ── 1-4. behaviour, across every plan x contract state x kickoff state ────────────────────────
let rendered = 0;
for (const tier of Object.keys(PLANS)) {
  const schedule = PLANS[tier].schedule || [];
  const billed = schedule.length ? schedule.reduce((s, r) => s + Number(r.amount || 0), 0) > 0 : null;
  for (const status of ["signed", "sent"]) {
    for (const kickoffWhen of [null, "Friday, September 26 at 10:00 AM"]) {
      let out;
      try { out = render(tier, status, kickoffWhen); }
      catch (e) {
        // 4. An unstateable plan MUST refuse. done_for_you has no schedule on purpose.
        if (billed === null) continue;
        problems.push(`${tier}/${status} threw for a plan that HAS a schedule: ${e.message}`);
        continue;
      }
      if (!out?.body) { problems.push(`${tier}/${status} produced no body.`); continue; }
      if (billed === null) {
        problems.push(`${tier} has no stateable schedule yet an email was produced. It must refuse — `
          + `an absent schedule is "we cannot state the terms", not "no charge", and a PAYING project `
          + `client would be told they owe nothing.`);
        continue;
      }
      rendered++;
      const body = out.body;
      const when = `${tier}/${status}/${kickoffWhen ? "booked" : "unbooked"}`;

      // 1. no invoice promised to an unbilled plan
      if (!billed && /invoice/i.test(body)) {
        problems.push(`${when} — the email mentions an INVOICE for a plan whose schedule totals $0. `
          + `This email also tells them "no charge", so it contradicts itself in the same message.`);
      }
      // 🔄 2026-10-08 (approved client_sequence_and_kickoff_v1 + client_emails_yes_to_kickoff_v1): the signed
      // email is now the WELCOME email at the start of Onboarding — AFTER payment. Its job is the
      // kickoff booking; an invoice line there would describe money already paid.
      if (status === "signed") {
        if (/invoice/i.test(body)) problems.push(`${when} — the welcome email mentions an invoice; it goes out after payment, so that is already done.`);
        if (!kickoffWhen && !/BOOK YOUR KICKOFF CALL/.test(body)) problems.push(`${when} — the welcome email never asks them to book the kickoff call — the one thing this email is for.`);
        if (kickoffWhen && !/YOUR KICKOFF CALL/.test(body)) problems.push(`${when} — a booked client's welcome email does not state the booked call.`);
        if (/nothing (else )?(is )?needed from you|everything I need from you|last thing I need/i.test(body)) problems.push(`${when} — the welcome email claims nothing more is needed from them.`);
      }
      // 2. nothing counter-signs
      if (/counter-sign/i.test(body)) {
        problems.push(`${when} — the email promises to "counter-sign". Nothing in the product `
          + `counter-signs anything, and for a signed agreement it already happened.`);
      }
      // 3. plain-text shape
      const longest = Math.max(...body.split("\n").map((l) => l.length));
      if (longest > 78) {
        problems.push(`${when} — longest line is ${longest} chars. This is a PLAIN-TEXT email that `
          + `nothing re-flows; clients that hard-wrap at 78 break it mid-word.`);
      }
      if (body.length < 500) {
        problems.push(`${when} — body is ${body.length} chars. Under ~500 trips spam filters `
          + `(Email on Acid), the floor recorded in reference_welcome_email_evidence.`);
      }
    }
  }
}
if (!rendered) indeterminate("no plan produced an email — the harness is not exercising the template.");

// ── 5. no second copy of the body in admin.js ─────────────────────────────────────────────────
for (const fragment of [
  ["WHAT I NEED FROM YOU BEFORE THE KICKOFF", "the requirements block that was cut from the sender"],
  ["Agreement — arriving separately", "the line Chris caught: told a client who had already signed that it was still coming"],
  ["Either way there's no long-term contract", "a line cut from the sender"],
  ["Welcome aboard — here's what happens next", "the OLD subject; the sender now uses \"You're all set\""],
]) {
  if (adminSrc.includes(fragment[0])) {
    problems.push(`admin.js still contains "${fragment[0]}" — ${fragment[1]}. The confirmation email `
      + `must exist in ONE place. Build the draft hatch from the sender's preview instead.`);
  }
}
if (/data-open-draft/.test(adminSrc) && !/preview:\s*true/.test(adminSrc)) {
  problems.push(`admin.js has the "Open a draft instead" hatch but never requests preview: true. `
    + `It is composing its own body again — that is exactly how the two copies drifted.`);
}

// ── 6. the duplicate-send guard reaches the real artifact ─────────────────────────────────────
{
  const at = senderSrc.indexOf("const priorTask");
  const guard = at >= 0 ? senderSrc.slice(at, at + 900) : "";
  if (!guard || !/auto_result\?\.\s*outcome_data/.test(guard)) {
    problems.push(`The duplicate-send guard does not look at auto_result.outcome_data. flow-execute `
      + `re-wraps what a runner returns, so the gmail_message_id lands one level deeper than the `
      + `shape this function returns — the guard reads undefined and lets a SECOND real client `
      + `email go out, while the step's instructions promise "It will not send twice."`);
  }
}

// ── 7. the promise banner reads what was sent ─────────────────────────────────────────────────
{
  if (/The confirmation email told the client\s*<strong>[“"]Calendar invite is on its way/.test(adminSrc)) {
    problems.push(`admin.js still quotes “Calendar invite is on its way” as something the email said. `
      + `That sentence was removed from the sender on 2026-09-10 — a hardcoded quote of another `
      + `file's copy goes stale silently and tells the operator the client was promised something `
      + `they never were.`);
  }
  const at = adminSrc.indexOf("const promiseGap");
  const blk = at >= 0 ? adminSrc.slice(Math.max(0, at - 700), at + 300) : "";
  if (at >= 0 && !/sentBody|promisedInvite/.test(blk)) {
    problems.push(`The promise banner does not read the STORED sent body. It must check what was `
      + `actually emailed, so it is true by construction rather than true until someone edits the `
      + `copy in the other repo file.`);
  }
}

if (problems.length) {
  console.error("🔴 THE CONFIRMATION EMAIL CONTRADICTS ITSELF, OR EXISTS TWICE\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  netlify/functions/send-confirmation-email.js · admin/admin.js (phase0Links, promiseWarn)");
  process.exit(1);
}

console.log("✅ the confirmation email says one true thing, in one place");
console.log(`   ${rendered} plan/contract/kickoff variants rendered from the REAL template`);
console.log("   no invoice promised to an unbilled plan · nothing counter-signs · unstateable plans refuse");
console.log("   every variant wraps <=78 and clears the 500-char spam floor");
console.log("   admin.js holds no second copy · the draft hatch uses the sender's preview");
console.log("   the duplicate-send guard reaches the artifact · the banner reads what was sent");
