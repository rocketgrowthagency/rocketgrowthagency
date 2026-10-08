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
console.log(`  ${rendered} stage emails rendered (paid + beta)`);
if (fails.length) { console.error("🔴 a client email says something untrue:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every stage email tells the truth: no \"nothing needed\", stage 4 retired, beta never told it paid");
