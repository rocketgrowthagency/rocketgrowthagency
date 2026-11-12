#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-client-emails-tell-the-truth.mjs
//
// 🔴 WHY (2026-10-08, approved client_emails_yes_to_kickoff_v1): the automatic stage emails told a
// client "That is everything I need from you… Nothing is needed from you" (stage 4) and "the last
// thing I need from you" (stages 2-3) while the kickoff booking, photos and logins were all still to
// come — and a BETA client, who never paid, was told "Payment received".
//
// HOLDS (each email RENDERED through the real messageFor, for a paid and a beta client):
//   1. the stage-4 automatic email stays retired (the step-1 welcome email is the one email then)
//   2. no stage email claims nothing more is needed / "the last thing"
//   3. a beta client is never told "Payment received"; a paying one is
//   4. stage 3 tells them the kickoff booking comes next
//
// exit 0 = every stage email tells the truth · 1 = one does not · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/netlify/functions/notify-client-stage.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read notify-client-stage.js"); process.exit(2); }
const at = src.indexOf("function messageFor(");
const end = at < 0 ? -1 : src.indexOf("\n}\n", at);
if (at < 0 || end < 0) { console.error("⚠️  INDETERMINATE — messageFor() not found"); process.exit(2); }
const ctx = { PORTAL: "https://www.rocketgrowthagency.com/portal/", out: null };
vm.createContext(ctx);
try { vm.runInContext(`${src.slice(at, end + 3)}\nthis.mf = messageFor;`, ctx); }
catch (e) { console.error(`🔴 messageFor would not run: ${e.message}`); process.exit(1); }

const fails = []; const F = (m) => fails.push(m);
const STAGES = ["stage_1b_admin_review", "stage_2_payment", "stage_3_setup", "stage_4_onboarding"];
const LIE = /nothing (else )?(is )?needed from you|everything I need from you|last thing I need|one last thing/i;
let rendered = 0;
for (const beta of [false, true]) {
  for (const stage of STAGES) {
    let m;
    try { m = ctx.mf(stage, { first: "Sam", kickoffWhen: null, beta }); } catch (e) { F(`${stage} (beta=${beta}) threw: ${e.message}`); continue; }
    if (stage === "stage_4_onboarding") { if (m) F(`the stage-4 automatic email is back (beta=${beta}) — it said nothing was needed while the kickoff was still to book; the step-1 welcome email is the one email at that moment`); continue; }
    // 🔒 11-11 (master client-messages decision 1): C6 is retired for a PAYING client; the payment welcome (_payment-welcome.js) is the one
    // email at first payment, so the truths stage 3 had to tell a paying client are checked on THAT email below
    if (stage === "stage_3_setup" && !beta) { if (m) F("the paying client's stage-3 email (C6) is back: at first payment they'd get three emails again, two asking the same thing"); continue; }
    if (!m) { F(`${stage} (beta=${beta}) sends nothing — it must`); continue; }
    rendered++;
    const all = `${m.subject}\n${m.body}`;
    if (LIE.test(all)) F(`${stage} (beta=${beta}) claims nothing more is needed / "the last thing": "${(all.match(LIE) || [""])[0]}"`);
    if (stage === "stage_3_setup") {
      if (beta && /payment received/i.test(all)) F("a BETA client is told \"Payment received\" — they never paid");
      if (!beta && !/payment received/i.test(all)) F("a paying client is not told their payment was received");
      if (!/kickoff/i.test(m.body)) F("stage 3 does not say the kickoff booking comes next");
    }
  }
}
// the paying client's email at first payment: the ONE letter (the receipt for invoice #1 carrying the next step), rendered through the real builders
try {
  const { createRequire } = await import("node:module");
  const rq = createRequire(import.meta.url);
  const PW = rq(`${SITE}/netlify/functions/_payment-welcome.js`), SI = rq(`${SITE}/netlify/functions/send-invoice-email.js`);
  for (const on of [false, true]) {
    const fp = await PW.firstPaymentNextStep({ client: { id: "c1", primary_contact_name: "Sam" }, supa: async () => [], nowMs: Date.parse("2026-11-11T18:00:00Z"), env: on ? { STEP_REMINDERS_EMAIL: "on" } : {} });
    const w = await SI.buildEmail({ kind: "receipt", tone: "due", invoiceNum: 1, client: { id: "c1", primary_contact_name: "Sam Lee", business_name: "Sam's", primary_contact_email: "s@x.test" }, contract: { id: "k1", tier: "founding", audit_log: [{ event: "generated_and_sent", addons: {} }] }, inv: { id: "i1", amount: 625, status: "paid", due_date: "2026-11-11", created_at: "2026-11-11T00:00:00Z" }, firstPayment: fp });
    const all = `${w.subject}\n${w.text}`;
    rendered++;
    if (LIE.test(all)) F(`the first-payment letter claims nothing more is needed: "${(all.match(LIE) || [""])[0]}"`);
    if (!/payment received/i.test(all)) F("a paying client is not told their payment was received (the first-payment letter)");
    if (!/kickoff/i.test(w.text)) F("the first-payment letter does not say the kickoff booking comes next");
    if (!/no access to your website/i.test(w.text)) F("the first-payment letter lost the truth about Google access: it gives no access to their website");
  }
} catch (e) { console.error(`⚠️  INDETERMINATE: the first-payment letter did not render: ${e.message}`); process.exit(2); }
console.log(`  ${rendered} stage emails rendered (paid + beta, and the payment welcome)`);
if (fails.length) { console.error("🔴 a client email says something untrue:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every stage email tells the truth: no \"nothing needed\", stage 4 retired, beta never told it paid");
