#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-waiting-on-the-client-is-built.mjs
//
// 🔴 WHY (Chris, 2026-10-08): "should step 31 say something like (WAITING ON CLIENT) or notify
// client. i think it needs to show more of an emphasis on this HAS TO BE DONE BY CLEINT and all we
// do is nudge them." Approved as reports/mockups/step31_waiting_on_client_v1.html (v2).
//
// HOLDS THE CHAIN, link by link — each one is a place this design can quietly stop being true:
//   1. the card says "Waiting on client" ONLY when our part is done (else it is still ours)
//   2. the nudge draft states facts from the record, links to the step, invents no number
//   3. "waiting since" is the later of the prior steps finishing and our own draft
//   4. the nudge goes through the ONE send path, allow-listed to steps the client acts on
//   5. a nudge does not stamp the step's one-email "Sent" marker
//   6. the client can SEE a nudge — `step_nudge_sent` is in the portal thread's allow-list
//   7. the measurement carries where it counted (`source`) through to the stored detection
//   8. the client's how-to has no "Done when" line (banned 2026-09-29), and the step link opens it
//   9. the photo badge never calls our uploads "on Google"
// The look itself is held by check-the-waiting-band-matches-the-mockup (browser, live).
//
// exit 0 = the chain holds · 1 = a link is broken · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);
const read = (rel) => {
  try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); }
};
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const admin = read("admin/admin.js");
const portal = read("portal/portal.js");
const send = strip(read("netlify/functions/send-step-email.js"));
const thread = read("netlify/functions/portal-thread.js");
const recheck = strip(read("netlify/functions/portal-step-recheck.js"));

// ── lift two pure functions by their own boundaries ─────────────────────────────────────────────
const lift = (name) => {
  const a = admin.indexOf(`function ${name}(`);
  if (a < 0) return null;
  const b = admin.indexOf("\n}\n", a);
  return b < 0 ? null : admin.slice(a, b + 3);
};
const srcSince = lift("stepWaitingSince");
const srcDraft = lift("stepNudgeDraft");
if (!srcSince || !srcDraft) {
  console.error(`⚠️  INDETERMINATE — could not lift ${!srcSince ? "stepWaitingSince" : "stepNudgeDraft"} from admin.js`);
  process.exit(2);
}
const ctx = { state: { selectedClient: { primary_contact_name: "Dana Ruiz" } } };
vm.createContext(ctx);
vm.runInContext(`${srcSince}\n${srcDraft}\nthis.since = stepWaitingSince; this.draft = stepNudgeDraft;`, ctx);

// 3 · waiting since
{
  const steps = [{ task: { completed_at: "2026-09-18T06:00:00Z" } }, { task: { completed_at: "2026-10-01T10:00:00Z" } }, {}];
  const got = ctx.since(steps, 2, { ran_at: "2026-10-08T14:07:00Z" });
  if (got !== Date.parse("2026-10-08T14:07:00Z")) F(`waiting since took ${got && new Date(got).toISOString()}, expected our draft (Oct 8) — the later of prior steps and the draft`);
  const got2 = ctx.since(steps, 2, {});
  if (got2 !== Date.parse("2026-10-01T10:00:00Z")) F("with no draft, waiting since must be the latest prior step to finish");
  if (ctx.since([{}, {}], 1, {}) !== null) F("with nothing recorded, waiting since must be null (\"Not recorded\"), never a guess");
}

// 2 · the nudge draft
{
  const o = { flowId: "m1.gbp.photos", clientLabel: "Provide 20+ business photos" };
  const m = ctx.draft(o, { detected: { n: 1, threshold: 20, evidence: "Your Google Business Profile has 1 photo — 20 are needed." } });
  if (m.subject !== "Provide 20+ business photos: 19 to go") F(`measured subject was "${m.subject}"`);
  if (!m.body.startsWith("Hi Dana,")) F("the nudge does not greet the contact by first name");
  if (!m.body.includes("Your Google Business Profile has 1 photo")) F("the nudge does not carry the measurement's own words");
  if (!m.body.includes("/portal/#step-m1.gbp.photos")) F("the nudge does not link to the step itself");
  const u = ctx.draft({ flowId: "m1.gbp.messaging", clientLabel: "Turn on GBP messaging" }, {});
  if (u.subject !== "Turn on GBP messaging: your turn") F(`an unmeasured step's subject was "${u.subject}"`);
  if (/\d+ of \d+|to go/.test(u.body + u.text)) F("an unmeasured step's nudge contains a count — an invented number");
  ctx.state.selectedClient = {};
  if (!ctx.draft(o, {}).body.startsWith("Hi there,")) F("with no contact name the nudge must say \"Hi there\", not \"Hi undefined\"");
}

// 1 · waiting only when our part is done; the pill says so
if (!/const waiting = stepKind\(o\) === "client" && !band && \(!runnable \|\| !!result\);/.test(admin)) {
  F("the card can say \"Waiting on client\" while our own draft is still undone — the waiting test lost its our-part-done clause");
}
if (!/\$\{waiting \? "Waiting on client"/.test(admin)) F("the pill no longer says \"Waiting on client\" when it is the client's move");

// 4 · 5 · one send path, allow-listed, no "Sent" stamp
if (!/kind: "nudge", clientId: c\.id, stepId/.test(admin)) F("the admin's nudge does not go through send-step-email with kind \"nudge\"");
if (!/s\.clientBucket === "act" \|\| s\.clientBucket === "supply"/.test(send) || !/isNudge \? !NUDGE_STEPS\.has\(stepId\)/.test(send)) {
  F("send-step-email does not limit nudges to steps the client acts on or supplies");
}
if (!/if \(!isNudge\) try \{/.test(send)) F("a nudge stamps the step's one-email \"Sent\" marker");
if (!/isNudge \? "step_nudge_sent" : "step_email_sent"/.test(send)) F("a nudge is not recorded as step_nudge_sent");

// 6 · the client can see it
const vis = (thread.match(/const VISIBLE = \[([^\]]*)\]/) || [])[1] || "";
if (!/"step_nudge_sent"/.test(vis)) F("step_nudge_sent is not in the portal thread's allow-list — the client never sees a nudge");

// 7 · source travels
if (!/source: probe\.source \|\| null/.test(recheck)) F("the stored detection drops the probe's source — the label falls back to a guess");
if (!/noun: "photo", source: "google_profile"/.test(recheck)) F("the profile photo probe no longer says it counted the Google profile");

// 8 · how-to: no done-when, deep link
const how = (() => { const a = portal.indexOf("function clientHowHtml("); const b = portal.indexOf("\n}\n", a); return a < 0 || b < 0 ? null : portal.slice(a, b); })();
if (!how) { console.error("⚠️  INDETERMINATE — clientHowHtml not found in portal.js"); process.exit(2); }
if (/done\s+when/i.test(how)) F("the client's how-to renders a \"Done when\" line — Chris deleted that strip from every client card (2026-09-29)");
// 🔴 THE FIRST VERSION OF THIS CHECK PASSED WHILE THE LINK WAS BROKEN LIVE — it confirmed a regex for
// `#step-` existed, not that the step survived signing in. What matters is ORDER: the step must be
// read before anything that can clear the fragment (the token strip, the signed-out redirect), and
// held across the sign-in round trip. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
{
  const cap = portal.search(/let _deepStep = \(\(\) => \{/);
  const clear1 = portal.indexOf("window.history.replaceState");
  const clear2 = portal.indexOf('window.location.replace("/client-login/');
  if (cap < 0) F("the portal does not capture a /portal/#step-<id> link at all — a nudge lands on the dashboard");
  else {
    if ((clear1 >= 0 && cap > clear1) || (clear2 >= 0 && cap > clear2)) F("the step link is read AFTER the code that clears the fragment — signing in loses it");
    const capSrc = portal.slice(cap, portal.indexOf("})();", cap));
    if (!/localStorage\.setItem\(DEEP_STEP_KEY/.test(capSrc) || !/localStorage\.getItem\(DEEP_STEP_KEY/.test(capSrc)) F("the step link is not held across sign-in — a signed-out client loses it at /client-login/");
    if (!/#step-row-\$\{CSS\.escape\(_deepStep\)\}/.test(portal)) F("nothing opens the captured step when the rows draw");
  }
}

// 9 · the badge
if (/onGoogle\} on Google/.test(portal)) F("the photo badge counts our uploads as \"on Google\" again");

console.log("  9 links checked: waiting test, draft, waiting-since, send path, Sent stamp, thread, source, how-to, badge");
if (fails.length) {
  console.error("🔴 the waiting-on-client chain is broken:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ waiting on the client: the card, the nudge and the client's how-to each say what is true");
