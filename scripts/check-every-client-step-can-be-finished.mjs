#!/usr/bin/env node
/**
 * check-every-client-step-can-be-finished.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 A CLIENT STEP WITH NO WAY TO FINISH IT IS A DEAD END WITH INSTRUCTIONS ATTACHED.
 *
 * Chris, 2026-09-16, looking at step 7: *"ok so if 6 is done why cant i do 7?"* The audit that
 * followed found FOURTEEN of twenty-one client-visible steps with no completion control at all —
 * a client read the instructions, went and did the work, came back, and the row still said To do.
 *
 * Step 7 was worse than missing a button: its own instructions read "WHAT YOU DO: Nothing" because
 * WE install form tracking. The portal had been showing our work as the client's homework.
 *
 * This gate asserts the contract that replaced it:
 *   1. every client-visible step DECLARES how it finishes (`clientDone`)
 *   2. every declared mechanism is one the renderer actually handles
 *   3. a `client` step carries the words for its own button and its own confirmation
 *   4. an `rga` step carries the line that says why it is sitting there
 *   5. a `choice` step actually offers choices; a non-choice step does not
 *   6. the renderer branches on all five, and the endpoint accepts a self-attested completion
 *   7. 🔴 the endpoint REFUSES to mark done any step not declared `client`
 *
 * → project_client_admin_boundary · feedback_a_fix_without_a_gate_regresses
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 Overridable so this gate can be MUTATION-TESTED against a sandbox copy. A gate that can
// only read the live repo cannot be proven to fail when the thing it guards breaks.
const SITE = process.env.CSF_SITE || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");

const MECHANISMS = new Set(["detected", "choice", "client", "rga", "approval"]);
const INPUT_KINDS = new Set(["url", "numbers", "checklist", "hours", "text"]);

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };
const ok = (m) => console.log(`  ✅ ${m}`);

console.log("── every client-visible step can be finished ──");

// ── 1-5. the data declares itself ──────────────────────────────────────────────────────────────
const pb = JSON.parse(read("data/playbooks/playbooks.json"));
const steps = [...(pb.month1 || []), ...(pb.month2plus || [])]
  .filter((s) => !s.ongoing && s.clientLabel && (s.clientBucket === "supply" || s.clientBucket === "act"));

if (steps.length < 15) bad(`only ${steps.length} client steps found — the filter has drifted from the portal's`);

const counts = {};
for (const s of steps) {
  const m = s.clientDone;
  if (!m) { bad(`${s.id} does not declare clientDone — a client would have no way to finish it`); continue; }
  if (!MECHANISMS.has(m)) { bad(`${s.id} declares clientDone="${m}", which the portal cannot render`); continue; }
  counts[m] = (counts[m] || 0) + 1;

  const hasChoices = Array.isArray(s.clientChoices) && s.clientChoices.length > 0;
  if (m === "choice" && !hasChoices) bad(`${s.id} is clientDone="choice" but offers no clientChoices`);
  if (m !== "choice" && hasChoices) bad(`${s.id} offers choices but is clientDone="${m}" — answering would not finish it`);

  if (m === "client") {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴🔴 EITHER THE PORTAL TAKES THE THING, OR THEY ATTEST THEY DID IT ELSEWHERE — and taking
    // it is always better. Chris, 2026-09-16: *"everything must be able to be done in the portal
    // thats the point of it. how does the user provide this in the portal"*, looking at a step
    // that told him to visit onetimesecret.com and then email us.
    //
    // A step that declares `clientInput` is finished by SUBMITTING it, so it needs no separate
    // attestation button — two controls for one act is the Save-button mistake again.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const inp = s.clientInput;
    if (inp) {
      if (!INPUT_KINDS.has(inp.kind)) bad(`${s.id} declares clientInput.kind="${inp.kind}", which the portal cannot render`);
      if (!inp.cta) bad(`${s.id} takes an input but its submit button has no label`);
      // 🔑 A PROMPT, OR A PLATFORM QUESTION THAT LABELS THE SAME BLOCK. 2026-09-25: the CMS-login
      // step's prompt repeated its own ask word for word — "Create a one-time secure link at
      // onetimesecret.com, then paste it below" was the row's first line AND the field's label, so
      // the client read it twice under two stacked small-caps headings. The approved mockup says it
      // once and labels the block with the platform question instead.
      // 🔴 The rule still holds: SOMETHING visible must say what is being asked. It just does not
      // have to be `prompt` when `platform.prompt` heads the same control block.
      if (!inp.prompt && !inp.platform?.prompt) {
        bad(`${s.id} takes an input and nothing labels it — no prompt and no platform question`);
      }
      if (s.clientDoneCta) bad(`${s.id} has BOTH an input and an attestation button — two controls for one act`);
      if (inp.kind === "checklist" && !(inp.options || []).length) bad(`${s.id} is a checklist with nothing to tick`);
      if (inp.kind === "numbers" && !(inp.fields || []).length) bad(`${s.id} asks for numbers but names no figures`);
    // 🔴 An hours step must offer REAL upcoming holidays. Free text cannot be published to Google
    // `specialHours`; a ticked date can. And the window is rolling — a list computed at a past
    // deploy and never rebuilt would offer a client holidays that have already gone by.
    // (the hours step's holiday list is asserted against the PROJECTION below — it is injected at
    //  build time, so the source correctly carries none)
      // 🔴 A step that takes a SECRET must never ask for the secret itself. Step 5 takes a
      // one-time link, which destroys itself on first read, so nothing lands in our database.
      // ═══════════════════════════════════════════════════════════════════════════════════
      // 🔑 A PLATFORM PICKER MUST OFFER REAL INSTRUCTIONS, NOT JUST LABELS. The point of asking
      // which platform they run is that the step can then say what to actually DO — "Users → Add
      // New. Role: Administrator" rather than "WordPress / Wix / Shopify admin login", which is a
      // list of possibilities. An option with no hint is a control promising what it lacks.
      // → feedback_we_never_promise_what_we_dont_do
      // ═══════════════════════════════════════════════════════════════════════════════════
      if (inp.platform) {
        const opts = inp.platform.options || [];
        if (opts.length < 3) bad(`${s.id} offers a platform picker with ${opts.length} option(s) — too few to be worth asking`);
        if (!inp.platform.prompt) bad(`${s.id} has a platform picker that never says what it is asking`);
        for (const o of opts) {
          if (!o.key || !o.label) bad(`${s.id} has a platform option missing its key or label`);
          if (!o.hint) bad(`${s.id} platform "${o.key}" offers no instructions — picking it would change nothing on screen`);
        }
        const keys = opts.map((o) => o.key);
        if (new Set(keys).size !== keys.length) bad(`${s.id} has duplicate platform keys — two chips would store the same answer`);
      }
      if (/password|login|credential/i.test(s.clientLabel || "") && inp.kind !== "url") {
        bad(`${s.id} asks for credentials as "${inp.kind}" — it must take a one-time LINK, never the password`);
      }
    } else {
      // 🔑 A clientForm can BE the control. 2026-09-24: the kickoff step finishes by booking a time
      // in a calendar rendered inside its own row — submitting it completes the step, exactly like
      // clientInput, so demanding a separate "✓ I did it" button would be demanding a second
      // control that could mark the step done WITHOUT the booking ever happening.
      //
      // 🔴 NOT a free pass for any clientForm value. The portal must actually render a control for
      // it — otherwise this branch would excuse the very dead end the gate exists to catch.
      // → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
      const PORTAL = fs.readFileSync(path.join(SITE, "portal", "portal.js"), "utf8");
      const formRendersAControl = s.clientForm
        && s.clientForm !== "generic"
        && new RegExp(`clientForm === "${s.clientForm}"`).test(PORTAL);
      if (!s.clientDoneCta && !formRendersAControl) {
        bad(`${s.id} is the client's to finish but has no clientDoneCta, takes no input, and its `
          + `clientForm (${s.clientForm || "none"}) renders no control in portal.js — nothing to press`);
      }
      // 🔑 Only meaningful when a CTA exists — a form-controlled step legitimately has none, and
      // the previous `else if` read .trim() off undefined the moment that became possible.
      else if (s.clientDoneCta && /^mark (as )?done$/i.test(s.clientDoneCta.trim())) {
        bad(`${s.id} clientDoneCta is generic ("${s.clientDoneCta}") — it must name what they actually did`);
      }
    }
    if (!s.clientDoneConfirm) bad(`${s.id} has no clientDoneConfirm — nothing to read back afterwards`);
  }
  if (m === "rga" && !s.clientWaitingNote) {
    bad(`${s.id} sits with RGA but says nothing — silence is exactly what made step 7 read as blocked`);
  }
  // 🔴🔴 AN APPROVAL STEP MUST BE ABLE TO REACH THE APPROVALS QUEUE. `CLIENT_APPROVABLE` in
  // _deliverables.js is built from `clientBucket === "approve"` — so pointing a client at that tab
  // from a supply/act step sends them to a queue that can NEVER contain the item. Step 8 shipped
  // with exactly that on 2026-09-16: "Review & approve →" to a destination that does not exist.
  // → feedback_we_never_promise_what_we_dont_do · feedback_a_guard_must_reach_the_thing_it_guards
  if (m === "approval" && s.clientBucket !== "approve") {
    bad(`${s.id} points at the approvals queue but its bucket is "${s.clientBucket}" — the queue is built from bucket "approve", so the item could never appear there`);
  }
}
if (!fail) ok(`all ${steps.length} client steps declare a mechanism: ` +
  Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", "));

// 🔴 A step whose instructions say the client does nothing must NOT be theirs to do. This is the
// exact defect: step 7's copy and step 7's classification disagreed for as long as it existed.
for (const s of steps) {
  const says = /WHAT YOU DO\s*\n\s*Nothing\b/i.test(s.clientInstructions || "");
  // 🔑 The rule is "not the client's work", not "must be rga". A step we DETECT is not their work
  // either — step 7 became `detected` on 2026-09-16 (GA4 tells us the form events are arriving)
  // while still asking nothing of them, and the literal form of this check called that a defect.
  const theirs = s.clientDone === "client" || s.clientDone === "choice" || Boolean(s.clientInput);
  if (says && theirs) {
    bad(`${s.id} tells the client "WHAT YOU DO: Nothing" but is classified "${s.clientDone}"${s.clientInput ? " and asks them for input" : ""}`);
  }
  // 🔴 A step that asks NOTHING of the client must say why it is sitting there. Silence is what
  // made step 7 read as blocked in the first place — and that is true whether it is ours to do or
  // ours to detect.
  if (!theirs && !s.clientWaitingNote && s.clientDone !== "detected") {
    bad(`${s.id} asks nothing of the client and says nothing about why`);
  }
}

// ── 6. the renderer handles every mechanism ────────────────────────────────────────────────────
const portal = read("portal/portal.js");

// 🔑 Scoped to rowHtml, not to the file. A mechanism name appearing in a comment elsewhere would
// otherwise pass this gate while the renderer ignored it. → feedback_dead_check_selector_gap
// 🔑 Anchor on the DECLARATION, not on its exact parameter list. The first version pinned the full
// destructure `({ step, status, taskState, num })` and went blind the moment a field was added —
// reporting nine false failures at once, which is always the probe before it is the code.
// → feedback_a_check_must_not_validate_itself
const rowStart = portal.indexOf("const rowHtml = ({");
const rowEnd = portal.indexOf("// 🔴 SETUP POINTS, IT DOES NOT DUPLICATE", rowStart);
if (rowStart < 0 || rowEnd < 0) bad("could not locate rowHtml — this gate is not reading the renderer");
const rowSrc = rowStart >= 0 && rowEnd > rowStart ? portal.slice(rowStart, rowEnd) : "";

// 🔑 `step.clientDone\b` — NOT `step.clientDone`. The loose form matched `step.clientDoneCta`
// two lines below and passed while the renderer had stopped reading the declaration entirely.
// → feedback_dead_check_selector_gap
if (!/step\.clientDone\b(?!Cta|Confirm)/.test(rowSrc)) {
  bad("rowHtml does not read step.clientDone — it is guessing the mechanism again");
}
if (/const OBSERVED = new Set/.test(portal)) {
  bad("the hardcoded OBSERVED set is back — a second source of truth for a fact the step declares");
}
for (const m of ["client", "rga", "approval", "detected"]) {
  if (m === "detected") continue; // detected is the default settled branch, not a named one
  if (!new RegExp(`mech === "${m}"`).test(rowSrc)) bad(`rowHtml never branches on mech === "${m}"`);
}
if (!/data-step-attest=/.test(rowSrc)) bad('rowHtml renders no "I\'ve done this" control');

// 🔴 ONE ACTION ZONE PER ROW. Decided 2026-09-17 after Chris asked whether the amend control
// belonged under or beside View. It sits in the HEADER, immediately before the row's own action,
// so a settled row has a single place to look — the trailing edge, where every other action on
// this page already lives. Putting it back in the body costs a whole line on every settled row
// and gives the eye two targets across twenty-one of them.
{
  // 🔑 Two SEPARATE facts, so the message names the one that actually broke. The first version
  // checked only `${amendBtn}${actionBtn}`, so reversing the order reported "no longer beside" —
  // true, but a misleading diagnosis for someone reading the failure.
  const adjacent = /\$\{amendBtn\}\$\{actionBtn\}/.test(rowSrc) || /\$\{actionBtn\}\$\{amendBtn\}/.test(rowSrc);
  if (!adjacent) {
    bad("the amend control is no longer beside the row's action — a settled row would have two action zones again");
  } else if (!/\$\{amendBtn\}\$\{actionBtn\}/.test(rowSrc)) {
    // Quieter control FIRST: on mobile the pair wraps together and the primary ends nearest the thumb.
    bad("the primary action renders before the quiet one — reverse them so the primary sits at the edge");
  }
}
// 🔑 Signature-agnostic, for the third time today. Pinning `inputHtml(step)` went blind the
// moment the function took a second argument. Anchor on the DECISION, not the call's arity.
if (!/step\.clientInput \? inputHtml\(/.test(rowSrc)) {
  bad("rowHtml does not render the input a step declares — the client would be back to attesting they did it elsewhere");
}
{
  const ih = portal.indexOf("function inputHtml(");
  const ihBody = ih >= 0 ? portal.slice(ih, portal.indexOf("\n  }", ih)) : "";
  if (!ihBody) bad("inputHtml is gone — no step could render its input");
  else for (const k of INPUT_KINDS) {
    if (!new RegExp(`s\\.kind === "${k}"`).test(ihBody)) bad(`inputHtml cannot render a "${k}" input`);
  }
  const sub = portal.indexOf('closest("[data-in-submit]")');
  if (sub < 0) bad("nothing listens for the input submit button");
  else {
    const end = portal.indexOf("\n});", sub);
    const b = portal.slice(sub, end > sub ? end : sub + 4000);
    if (!/portal-step-input/.test(b)) bad("the input submit does not call portal-step-input");
    if (!/_rerender/.test(b)) bad("submitting an input does not settle the row");
    // 🔴 A failed submit must NOT re-render: that rebuilds the form empty and throws away what
    // the client typed. Assert the catch reports without re-rendering.
    const c = b.indexOf("} catch (err)");
    const tail = c > 0 ? b.slice(c) : "";
    if (!tail) bad("the input submit has no catch — a rejected answer would vanish silently");
    else if (/_rerender/.test(tail)) bad("a failed submit re-renders the row — it would wipe what the client typed");
    // 🔑 ANY way of telling the client, not one spelling. This pinned `alert(` and therefore FAILED
    // the day the 56 native dialogs were replaced with the branded ones — a gate that fails a
    // correct refactor teaches the next person to "fix" it by reverting the improvement.
    else if (!/msg\.textContent|portalAlert\(|portalConfirm\(|alert\(/.test(tail)) bad("a failed submit reports nothing");
  }
}
{
  let ife = "";
  try { ife = read("netlify/functions/portal-step-input.js"); }
  catch { bad("portal-step-input.js is missing — every input surface would 404"); }
  if (ife) {
    if (!/requirePortalOwner/.test(ife)) bad("portal-step-input is not auth-gated");
    if (!/s\.clientInput && s\.clientInput\.kind/.test(ife)) bad("portal-step-input is not allow-listed to steps that declare an input");
    if (!/after\?\.data\?\.tasks\?\.\[stepId\]\?\.client_input/.test(ife)) bad("portal-step-input does not read its write back");
    if (!/protocol !== "https:"/.test(ife)) bad("the url validator accepts any scheme — javascript: is a url too");
    if (!/Number\.isFinite/.test(ife)) bad("the numbers validator does not reject non-numbers — Number(\"\") is 0, and a silent 0 in a revenue field is a claim");
    if (!/allowed\.has/.test(ife)) bad("the checklist validator does not restrict to the offered options");
    // 🔴 Allow-listed against the SAME module the build injects, or a client could post any key
    // and we would publish it to their Google listing.
    if (!/require\(["']\.\/_holidays["']\)/.test(ife)) bad("portal-step-input does not import the holiday module — it cannot be validating the keys");
    if (!/isHolidayKey\(k\)/.test(ife)) bad("the holiday keys are not allow-listed — any string would be stored and published");
    // 🔴🔴 RECURRING, NOT DATED. Storing `thanksgiving:2026` meant re-asking every client every
    // year, and a listing that went quietly stale when nobody did.
    if (/key: k, date:/.test(ife)) bad("holidays are stored with a date again — that answer expires and has to be re-asked annually");
    if (!/k\.split\(":"\)\[0\]/.test(ife)) bad("the validator does not strip a legacy year from a stored key — answers saved before the change would be refused");
    // 🔴 A one-off closure needs REAL dates; prose is as unpublishable as the holidays were.
    if (!/out\.oneOffs/.test(ife)) bad("one-off closures are not accepted — a trip or a shutdown week has nowhere to go");
    if (!/to < from/.test(ife)) bad("a closure that ends before it starts is accepted");
    const build = read("scripts/build-client-steps.mjs");
    if (!/_holidays\.js/.test(build)) bad("the build does not inject the holidays — the pills would never render");

    // 🔴 Asserted on the PROJECTION, which is what the portal actually serves. The source carries
    // no holidays by design — they are computed at build time because most of them float, so a
    // list written into the playbook would be wrong the following year with nothing to say so.
    const csH = JSON.parse(read("data/playbooks/client-steps.json"));
    const hoursStep = [...(csH.month1 || []), ...(csH.month2plus || [])].find((x) => x.clientInput?.kind === "hours");
    if (!hoursStep) bad("no hours step in the projection");
    else {
      const hols = hoursStep.clientInput.holidays || [];
      if (!hols.length) bad("the hours step offers no holidays to tick — the client is back to typing prose we cannot publish");
      // 🔴🔴 NO DATES ON A RECURRING CHOICE. A date beside a tick that means "every year" tells the
      // client something untrue about what they are agreeing to — and goes stale the moment the
      // year turns, which is the whole reason this became a rule instead of an instance.
      else if (hols.some((h) => h.date)) {
        bad("the holiday options carry dates again — a dated option expires, and re-asking every client every year is what this replaced");
      }
      else if (hols.some((h) => /:\d{4}$/.test(h.key))) {
        bad("a holiday key carries a year — it would mean one specific Christmas rather than every Christmas");
      }
    }
    if (/payload: \{[^}]*client_input/.test(ife)) bad("the activity row stores the submitted value — a one-time link would outlive the secret it points at");
  }
}
if (!/pm-waiting/.test(rowSrc)) bad("rowHtml renders no with-RGA line for steps that are ours");
if (!/data-jump-approvals/.test(rowSrc)) bad("an approval step does not point at the approvals tab");

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE NUMBER BELONGS TO THE STEP, NOT TO THE ARRAY. The renderer used `idx + 1` over whatever
// happened to be rendered — directly beneath a comment asserting "the numbers do NOT renumber".
// Both were true of COMPLETION and neither of FILTERING: collapsing three rows on 2026-09-17 moved
// every number after them, and the step Chris had spent the day calling "5" became "2".
//
// 🔑 A comment is not an assertion. That one had been right there, and wrong, for two days.
// → feedback_position_is_not_identity · feedback_correct_is_not_the_same_as_happening
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  if (!/clientStepNo/.test(rowSrc) && !/it\.step\.clientStepNo/.test(portal)) {
    bad("the checklist numbers rows by array index again — filtering the list would renumber every row after the change");
  }
  const rendered = steps.filter((s) => !["m1.access.gbp", "m1.access.analytics", "m1.access.search_console"].includes(s.id));
  const missing = rendered.filter((s) => typeof s.clientStepNo !== "number");
  if (missing.length) bad(`${missing.length} rendered step(s) declare no clientStepNo, so they fall back to the index: ${missing.slice(0, 3).map((s) => s.id).join(", ")}`);
  const nums = rendered.map((s) => s.clientStepNo).filter((n) => typeof n === "number");
  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dupes.length) bad(`two steps share the number ${[...new Set(dupes)].join(", ")} — a client told "you're on 6" would find two`);
  const sorted = [...nums].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) { bad(`the numbers are not 1..${sorted.length} — there is a gap or an offset at ${sorted[i]}`); break; }
  }
  // 🔴 And it has to survive the projection, or the portal silently falls back to the index.
  const csn = JSON.parse(read("data/playbooks/client-steps.json"));
  const projMissing = [...(csn.month1 || []), ...(csn.month2plus || [])]
    .filter((x) => !["m1.access.gbp", "m1.access.analytics", "m1.access.search_console"].includes(x.id))
    .filter((x) => typeof x.clientStepNo !== "number");
  if (projMissing.length) bad(`the projection drops clientStepNo on ${projMissing.length} step(s) — the portal would renumber by index`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE ESCAPE HATCH STAYS IN THE PORTAL. Chris, 2026-09-17: *"can we make the stuck and then
// popup to email within the portal and not open an external email software. do this everywhere we
// say help."* A `mailto:` on a phone opens an app the client may never have configured; on a
// desktop it hands them a blank window and asks them to explain which step they are on.
//
// 🔑 Three signed-out screens KEEP their mailto and that is correct — the composer posts to an
// endpoint gated by requirePortalOwner, so with no session it could only fail.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const code = portal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Every mailto that survives must be either a signed-out screen or the client's OWN contact.
  // 🔑 EXCUSED BY REASON, NOT BY COUNT. A threshold ("no more than 4") passes the moment someone
  // adds a fifth for a bad reason and removes a good one. Each surviving mailto must sit in a
  // context that genuinely cannot use the composer.
  const ALLOWED = [
    { why: "signed-out bootstrap — no session, so the auth-gated composer could only fail",
      near: /showMessage\(/ },
    { why: "emails the client's OWN primary contact, not RGA — not a help link",
      near: /supportHref|primary_contact_email/ },
  ];
  for (const m of code.matchAll(/mailto:[^"'`)]+/g)) {
    const ctx = code.slice(Math.max(0, m.index - 320), m.index + 60);
    if (!ALLOWED.some((a) => a.near.test(ctx))) {
      bad(`a mailto: survives in a context with no reason to — the in-portal composer should handle it: "…${ctx.slice(-90).replace(/\s+/g, " ")}…"`);
    }
  }
  // 🔑 `\b` — without it, renaming the function to `openAskModalGONE` still matched.
  if (!/function openAskModal\s*\(/.test(code)) bad("the in-portal composer is gone — help links would have nowhere to go");
  if (!/openAskModal\s*\(\{/.test(code)) bad("nothing calls openAskModal — the control would render and do nothing");
  if (!/portal-message/.test(code)) bad("the composer does not post to portal-message");
  if (!/data-ask\b/.test(code)) bad("nothing renders an ask control");
  const h = code.indexOf('closest("[data-ask]")');
  if (h < 0) bad("nothing listens for the ask control");

  let pm = "";
  try { pm = read("netlify/functions/portal-message.js"); }
  catch { bad("portal-message.js is missing — every help link would 404"); }
  if (pm) {
    // 🔑 MECHANISM CHECKS RUN AGAINST CODE, NOT PROSE. The first version of the clientStepNo
    // assertion passed against a file where the field had been replaced with null — because the
    // NAME still appeared in the comment explaining why it mattered. A gate that matches the
    // mention instead of the mechanism confirms nothing.
    // → feedback_a_check_must_not_validate_itself
    const pmCode = pm.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
    if (!/requirePortalOwner/.test(pm)) bad("portal-message is not auth-gated");
    if (!/kind: "client_message"/.test(pm)) bad("the message is not stored as client_message — admin could not label it");
    // 🔴 A message that is not stored must NOT report success. That is the failure the mailto at
    // least did not have: the client believing they told us.
    if (!/if \(!logged\) return json\(500/.test(pm)) {
      bad("portal-message reports success without confirming the write — a client would believe they had told us");
    }
    // 🔑 The lookup is on the RAW value now, and only a resolved step is stored — an unrecognised
    // id used to be kept verbatim, which made the message render on no step AND outside the
    // Support card, so the client never saw it. Assert the resolution, not the old variable name.
    if (!/STEP_FOR\[rawStepId\]/.test(pmCode)) bad("the message carries no step context — a reply could not be specific");
    if (!/const stepId = step \? rawStepId : ""/.test(pmCode)) {
      bad("portal-message stores an unresolved step id — a message carrying a step the portal cannot "
        + "render matches neither its step nor the Support card, and is invisible to the client");
    }
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THE STEP NUMBER AND THE SENDER, IN THE LINE ADMIN READS. Chris, 2026-09-18: *"should we
    // do a what step number they asked for help on? … the email will say this was from this
    // client (email) and on this step (step 3)"*. The label alone makes us match wording against
    // a list; the number is what both sides say out loud. `clientStepNo` is the STABLE number, so
    // inserting a step never renumbers what an old message referred to.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (!/Step \$\{step\.no\}/.test(pmCode)) {
      bad("the message names the step but not its NUMBER — the one thing the client and admin both say out loud");
    }
    if (!/clientStepNo/.test(pmCode)) bad("portal-message does not read clientStepNo — the number would drift when a step is inserted");
    if (!/const summary = `\$\{who\}/.test(pmCode)) {
      bad("the summary does not lead with WHO sent it — admin cannot tell which client without opening the payload");
    }
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 AND THE CLIENT MUST NOT WAIT ON A PUSH THAT PUSHES NOTHING. Measured 2026-09-18: the
    // awaited notify-rga hop cost 1993ms, and with RGA_NOTIFICATION_WEBHOOK_URL unset it does
    // nothing at all — it re-authenticates, finds no webhook, returns. The durable row is already
    // written before this point, and client_activity IS the surface admin reads.
    // → project_notifications_had_nowhere_to_go
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (!/if \(process\.env\.RGA_NOTIFICATION_WEBHOOK_URL\)/.test(pmCode)) {
      bad("portal-message awaits the notify hop unconditionally — with no webhook configured that is ~2s "
        + "of a client watching a spinner for a call that delivers nothing");
    }
    // The durable write must still happen BEFORE the response, whatever the push does.
    if (!/logged = Array\.isArray\(rows\)/.test(pmCode)) {
      bad("portal-message no longer confirms the activity row landed — speed must not come from skipping the write");
    }
  }
  // 🔴 And admin must SURFACE it, not bury it in a collapsed audit log among robot events.
  const adm = read("admin/admin.js");
  if (!/client_message:\s*\{ cls/.test(adm)) bad("admin has no label for client_message — it would render as a raw slug");
  if (!/const asked = rows\.filter\(\(r\) => r\.kind === "client_message"\)/.test(adm)) {
    bad("admin does not count client messages — a question would sit unread inside a collapsed panel");
  }
  if (!/if \(asked\) panel\.setAttribute\("open"/.test(adm)) {
    bad("a client message does not open the activity panel — it would stay collapsed behind an audit log");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 ONE ITEM, ONE HOME. Chris, 2026-09-17: *"if these are done in step 3 why do we add them
// here?"* — the three Google-access steps rendered BOTH as action rows and inside the Google setup
// card, on the same page at stage 4, from two code paths reading DIFFERENT sources (the card from
// `google_services_inventory` + oauth, the rows from oauth alone). Two copies of one fact, able to
// disagree on screen, with no way for a client to know which to believe.
// → project_client_admin_boundary ("Setup POINTS, it does not duplicate")
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const OWNED = ["m1.access.gbp", "m1.access.analytics", "m1.access.search_console"];
  if (!/OWNED_BY_GOOGLE_CARD/.test(portal)) {
    bad("the Google-access steps are back in the action list — the same three facts would render twice on one page");
  } else {
    const set = portal.slice(portal.indexOf("const OWNED_BY_GOOGLE_CARD"), portal.indexOf("const TODO"));
    for (const id of OWNED) if (!set.includes(id)) bad(`${id} is not excluded from the action list, but the Google card renders it`);
    // 🔴 The exclusion must be APPLIED, not merely declared — a set nothing reads is decoration.
    if (!/OWNED_BY_GOOGLE_CARD\.has\(s\.id\)/.test(portal)) {
      bad("OWNED_BY_GOOGLE_CARD is declared and never read — the rows would still render");
    }
  }
  // 🔑 Removing them must not remove the REASSURANCE. A summary is why this is a collapse and not
  // a deletion — the client still sees the access is in place, once.
  if (!/pm-linked/.test(portal)) bad("nothing summarises the Google connection — the client lost the confirmation entirely");
  if (!/data-jump-google/.test(portal)) bad("the Google summary does not point at the card that owns it");
  const jg = portal.indexOf('querySelectorAll("[data-jump-google]")');
  if (jg < 0) bad("nothing binds the Google summary's control — it would render and do nothing");
  else if (!/scrollIntoView/.test(portal.slice(jg, jg + 600))) bad("the Google summary's control does not actually go anywhere");
}

// 🔴 The pill must follow the CONTROLS, not the mechanism. "Your turn" on a row with nothing to
// press is the step-7 defect in miniature, and it came back the moment two steps became detected.
// 🔑 THE PROPERTY, NOT THE PREFIX. This pinned `const theirsToAct = Boolean(step.clientInput)`
// exactly, so it failed the moment a legitimate condition was added in front — a kickoff step with a
// request already in becomes "RGA is doing it", which is the same rule being applied, not broken.
// What must hold is that the flag is still COMPUTED FROM WHAT THE ROW OFFERS.
const ta = rowSrc.indexOf("const theirsToAct");
const taBody = ta < 0 ? "" : rowSrc.slice(ta, rowSrc.indexOf(";", ta));
if (!taBody || !/step\.clientInput/.test(taBody) || !/clientChoices|clientForm|clientDoneCta/.test(taBody)) {
  bad('the "Your turn" pill no longer derives from whether the row offers the client anything');
}
{
  // 🔑 Read from the real data: any step the pill would call theirs must actually offer a control.
  const cs2 = JSON.parse(read("data/playbooks/client-steps.json"));
  for (const st of [...(cs2.month1 || []), ...(cs2.month2plus || [])]) {
    const theirs = Boolean(st.clientInput) || (st.clientChoices || []).length > 0
      || (st.clientForm && st.clientForm !== "generic") || (st.clientDone === "client" && st.clientDoneCta);
    if (!theirs && st.clientDone !== "detected" && !st.clientWaitingNote) {
      bad(`${st.id} offers the client no control and no explanation — it would read as blocked`);
    }
  }
  // The first-five rule must exist in the renderer, or step 15 can never complete.
  const portalAll = read("portal/portal.js");
  if (!/m1\.review\.first_5" && totalCustomersEverSubmitted >= 5/.test(portalAll)) {
    bad("step 15 has no detection rule — submitting customers would never finish it");
  }
  // 🔑 Scoped to the STATUS OVERRIDE, not the file. The loose form matched the evidence line
  // (`: ts.detected?.verdict === "confirmed" ? ts.detected.evidence`) and stayed green with the
  // status override deleted. → feedback_dead_check_selector_gap
  if (!/ts\.detected\?\.verdict === "confirmed"\) status = "done"/.test(portalAll)) {
    bad("the renderer ignores stored probe verdicts — GBP verification and form tracking could never settle");
  }
  if (!/ts\.detected\?\.verdict === "not_done"\) status = "pending"/.test(portalAll)) {
    bad("a failed stored probe does not reopen its step");
  }
}

// The attest button must actually be wired, and wired to a write — a control that paints and
// never posts is the class of defect this whole session has been about.
// 🔑 Scoped to the LISTENER body, not the file: `data-attest-confirm` also appears in rowHtml.
const h = portal.indexOf('closest("[data-attest-confirm]")');
if (h < 0) bad("nothing listens for the I've-done-this button");
else {
  // 🔑 Bounded by the handler's own closing `});`, not by a byte count. A fixed slice made this
  // gate fail the moment the handler grew — a check whose window can miss the code it audits is
  // a check that will one day pass for the wrong reason. → feedback_dead_check_selector_gap
  const end = portal.indexOf("\n});", h);
  const body = end > h ? portal.slice(h, end) : portal.slice(h);
  if (!/portal-step-choice/.test(body)) bad("the attest handler does not call portal-step-choice");
  if (!/mark_done:\s*true/.test(body)) bad("the attest handler does not send mark_done");
  if (!/_rerender/.test(body)) bad("the attest handler does not re-render from the stored tasks");
  const c = body.indexOf("} catch (err)");
  const tail = c > 0 ? body.slice(c) : "";
  if (!tail) bad("the attest handler has no catch — a failed write would leave a false tick on screen");
  else if (!/classList\.remove\("on"\)/.test(tail) || !/_rerender\(rollback\)/.test(tail)) {
    bad("the attest handler does not revert its optimistic tick and row when the write fails");
  }
  else if (!/portalAlert\(|portalConfirm\(|alert\(/.test(tail)) bad("the attest handler reverts silently — a silent revert is worse than a wrong badge");
  if (/Saving…|Marking…/.test(body)) {
    bad("the attest handler shows a pending state on a one-tap answer");
  }
  // The optimistic settle must go through the render path, never hand-patch the badge.
  if (!/_rerender\(optimistic\)/.test(body)) {
    bad("the attest handler does not settle the row optimistically — the badge would lag the tap by seconds");
  }
}
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 RAISING A PROBLEM MUST CHANGE SOMETHING. Chris, 2026-09-16, on the live portal:
// *"whats with the 'This isnt right' and the 'weve been told' after. is this industry leading."*
//
// It was not. The row stayed badged ✓ Done directly above the client's own report that it was not,
// the button became a disabled sentence in OUR voice, and the flag was never stored — so a reload
// erased every trace of it.
//
// The contract now: a DETECTED step offers to CHECK AGAIN (which re-probes the live source and can
// move the row itself); an RGA-recorded step can be FLAGGED, and a flagged row stops claiming Done.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔑 Strip comments first: the note explaining that this label was REMOVED quotes the label.
  // A gate that reads its own explanation as a regression is a gate nobody will trust.
  const portalCode = portal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/We've been told|We&#39;ve been told/.test(portalCode)) {
    bad('"We\'ve been told" is back — a dead-end label in our voice, on the client\'s button');
  }
  if (/data-step-wrong/.test(rowSrc) && !/mech === "rga"[\s\S]{0,400}?data-step-wrong/.test(rowSrc)) {
    bad("the dispute button is offered outside RGA-recorded steps — a detected step must offer a re-check instead");
  }
  if (!/data-step-recheck=/.test(rowSrc)) bad("a detected step offers no way to re-check — only a dispute");
  if (!/pm-evidence/.test(rowSrc)) bad("a settled detected row shows no evidence of what we detected");
  // 🔴 The flag must OUTRANK the derived status, and it must be checked AFTER the auto-detection
  // overrides — a detected step re-derives to done on every render, so an earlier check is undone.
  const derive = portal.indexOf('if (s.id === "m1.access.gbp" && hasOauthGbp)');
  const flagOverride = portal.indexOf('if (ts.client_flagged) status = "flagged"');
  if (flagOverride < 0) bad("a flagged step does not override its status — the row would keep reading Done");
  else if (derive >= 0 && flagOverride < derive) {
    bad("the flag override runs BEFORE the auto-detection overrides — detection would overwrite it every render");
  }
  if (!/flagged:\s*\{ text: "⚠/.test(portal)) bad("there is no flagged badge — the row has no way to show it");
  if (!/data-step-unflag/.test(rowSrc)) bad("a flagged row cannot be un-flagged — the client is stuck in the state they raised");
  // 🔑 2026-09-25: this used to demand the literal `isDone || flagged ? ""` — one SPELLING of the
  // rule, from when a flagged row suppressed its owner chip and leaned on a separate status chip.
  // The row now carries ONE pill, so the requirement is different and stronger: the flag must be
  // the FIRST branch, so it outranks both Done and "Your turn".
  // 🔴 It caught a real regression on the way past — collapsing two pills into one had deleted the
  // only on-screen acknowledgement that a client's "this isn't right" had registered.
  {
    const pill = rowSrc.match(/const ownerPill = ([\s\S]*?);\n/);
    if (!pill) bad("the row no longer derives an ownership pill — a client could not tell whose turn a step is");
    else {
      // 🔴 NOT /flag/ — that matches the word "flagged" in the condition itself, so the check
      // passed on a pill that had no flag branch at all. Assert the RESULT: a flag-classed pill.
      if (!/cls:\s*"flag"/.test(pill[1])) {
        bad('a flagged row shows nothing about the flag — the client\'s "this isn\'t right" would leave no mark on the row');
      } else if (!/^\s*flagged \?/.test(pill[1])) {
        bad("the flag is not the first branch of the pill — Done or \"Your turn\" would outrank the client's own word about their business");
      }
    }
  }

  // The flag has to be PERSISTED, or it vanishes on reload exactly as it used to.
  // 🔑 Read the source here rather than reusing `fn` from section 7 — that binding is declared
  // further down the file, and referencing it from up here threw a TDZ ReferenceError that killed
  // the whole gate. A gate that crashes reports nothing at all.
  const choiceFn = read("netlify/functions/portal-step-choice.js");
  const fw = choiceFn.indexOf("// flag_wrong");
  const fwBody = fw > 0 ? choiceFn.slice(fw, fw + 3000) : choiceFn;
  // 🔑 Assert the WRITE, not the word. Plain `client_flagged` also matches the undo branch's
  // `delete` and the read-back, so the loose form stayed green with the write deleted.
  // → feedback_dead_check_selector_gap
  if (!/client_flagged\s*=\s*\{\s*at:/.test(fwBody)) {
    bad("flag_wrong does not WRITE the flag — the client's report would vanish on reload");
  }
  if (!/delete .*\.client_flagged/.test(fwBody)) bad("flag_wrong cannot clear a flag — the client could never undo it");
  if (!/return json\(500, \{ error: "That did not save/.test(fwBody)) bad("flag_wrong does not read its write back");

  // And the re-check endpoint must be real: allow-listed, three verdicts, and it must not act on
  // "we could not tell".
  let rc = "";
  try { rc = read("netlify/functions/portal-step-recheck.js"); }
  catch { bad("portal-step-recheck.js is missing — Check again would 404"); }
  if (rc) {
    if (!/requirePortalOwner/.test(rc)) bad("portal-step-recheck is not auth-gated");
    if (!/clientDone === "detected"/.test(rc)) bad("re-check is not allow-listed to detected steps — it could overwrite a client's own word");
    for (const v of ["confirmed", "not_done", "indeterminate"]) {
      if (!new RegExp(`verdict: "${v}"`).test(rc)) bad(`re-check never returns "${v}" — it cannot report that outcome`);
    }
    if (!/probe\.verdict === "not_done"/.test(rc)) bad("re-check never acts on a failed probe — the row could not move");
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 A RETRY IS NOT A SECOND OBSERVATION. metrics-daily-refresh runs this on a 06:00 cron and
    // Netlify retries a scheduled function that times out or errors, so the whole pass can run
    // twice. Observed 2026-09-21: four rows for two steps at 06:00 and 06:01; 2026-09-17: eleven
    // rows for seven steps. The write must be idempotent for one client, step, verdict and day —
    // a CHANGED verdict still writes, because that is genuinely new.
    // → project_inbound_call_logging (an upsert, not check-then-write)
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 AND THE PLATFORM IS ALLOW-LISTED SERVER-SIDE. It is rendered in admin, so "the UI only
    // offers ours" is not a control — nothing stops a crafted POST.
    {
      const si = read("netlify/functions/portal-step-input.js");
      if (!/spec\.platform\?\.options/.test(si) || !/offered\.includes\(got\)/.test(si)) {
        bad("portal-step-input does not allow-list the submitted platform against the options we offered — "
          + "a crafted POST could store any string, and admin renders it");
      }
    }
    if (!/payload->>verdict=eq\./.test(rc) || !/created_at=gte\.\$\{today\}/.test(rc)) {
      bad("re-check writes its activity row unconditionally — a cron retry duplicates every line, "
        + "and a duplicated flip would notify us twice for one change");
    }
    if (/probe\.verdict === "indeterminate"[\s\S]{0,200}?status: "pending"/.test(rc)) {
      bad("re-check reopens a step on an indeterminate result — not knowing is not evidence");
    }
    // 🔑 A probe that only re-reads our own stored id re-derives the same answer the row already
    // had, and proves nothing. It must reach the live source.
    if (!/oauth2\.googleapis\.com\/token/.test(rc)) bad("the Google probe never refreshes a token — it cannot be testing live access");

    // 🔴🔴 A DETECTED STEP MUST BE CHECKABLE IN BOTH STATES, AND WITHOUT ANYONE PRESSING ANYTHING.
    // "Check again" rendered only on a SETTLED row, and nothing else ran the probe — so an OPEN
    // GBP-verify or form-tracking step had no control, no cron, and no path to ever finish. The
    // exact dead end this gate exists to prevent, reintroduced on the other branch of the state.
    {
      // 🔑 Bounded by the end of the assignment, NOT by a byte count — the mistake I documented
      // this morning and then made again here. The completionCtl block carries long comments and a
      // 2500-char window fell short of the branch it was meant to audit.
      // → feedback_a_gate_window_measured_in_characters_will_lie
      const ci = portal.indexOf("const completionCtl");
      const ciEnd = portal.indexOf("\n      : \"\";", ci);
      const ciSrc = ci >= 0 && ciEnd > ci ? portal.slice(ci, ciEnd) : "";
      if (!ciSrc) bad("could not read completionCtl — this gate is not auditing the open-step branch");
      else if (!/mech === "detected"[\s\S]{0,900}?data-step-recheck=/.test(ciSrc)) {
        bad("an OPEN detected step offers no way to run the check — it could never finish");
      }
    }
    if (!/x-internal-secret/.test(rc)) {
      bad("portal-step-recheck does not accept the internal secret — the nightly sweep would 401 on every call");
    }
    const nightly = read("netlify/functions/metrics-daily-refresh.js");
    if (!/portal-step-recheck/.test(nightly)) {
      bad("the nightly never runs the step probes — an open detected step would wait for a button nobody can see");
    }
    // 🔴 PIN THE PROPERTY, NOT THE SPELLING. This used to demand the two step ids appear LITERALLY
    // in the nightly's source. metrics-daily-refresh now DERIVES its list from
    // portal-step-recheck.PROBE_IDS(), so it can never drift from the probe table — a strict
    // tightening, which this gate read as a removal and reported as two dead ends.
    // The property is: EVERY `clientDone: "detected"` step is in the set the nightly sweeps.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    {
      let swept = null;
      if (/PROBE_IDS\(\)/.test(nightly)) {
        try {
          const req = (await import("node:module")).createRequire(import.meta.url);
          const mod = req(path.join(SITE, "netlify/functions/portal-step-recheck.js"));
          if (typeof mod.PROBE_IDS === "function") swept = mod.PROBE_IDS();
        } catch (e) {
          bad(`the nightly derives its probe list from PROBE_IDS(), but it could not be loaded: ${e.message}`);
        }
      }
      // No derivation? Then the ids must be named literally — the old contract still holds.
      const detectedIds = steps.filter((x) => x.clientDone === "detected").map((x) => x.id);
      for (const id of detectedIds) {
        const covered = swept ? swept.includes(id) : nightly.includes(id);
        if (!covered) bad(`the nightly sweep does not probe ${id}`);
      }
      if (swept && !detectedIds.length) bad("no step declares clientDone:\"detected\" — this check is auditing nothing");
    }
    // 🔑 A number computed and never reported is a check nobody can see the result of.
    if (/stepsConfirmed/.test(nightly) && !/step probes: \$\{stepResults\.length\}/.test(nightly)) {
      bad("the nightly counts step probes and never reports them");
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THE TWO DETECTIONS THAT HAVE NO BROWSER SIGNAL. Whether the profile is verified and
    // whether form submissions are arriving are facts Google holds — so the probe's verdict has
    // to be STORED, or the row's status has nothing to derive from and a client would have to
    // press a button to learn something we already knew.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    for (const id of ["m1.gbp.verify", "m1.tracking.form_setup"]) {
      if (!new RegExp(`"${id.replace(/\./g, "\\.")}": async`).test(rc)) bad(`re-check has no probe for ${id}, which nothing else can detect`);
    }
    if (!/hasVoiceOfMerchant/.test(rc)) bad("the verification probe does not read hasVoiceOfMerchant — it cannot know if the profile is verified");
    if (!/analyticsdata\.googleapis\.com/.test(rc)) bad("the form-tracking probe never asks GA4 anything");
    if (!/detected: \{ verdict: probe\.verdict/.test(rc)) {
      bad("re-check does not STORE its verdict — the row would have nothing to derive its status from");
    }
    if (!/probe\.verdict === "confirmed" && t0\[stepId\]\.status !== "done"/.test(rc)) {
      bad("a confirmed probe does not settle the step — the client would press a button and see nothing change");
    }
    // 🔴 A quiet contact form has zero submissions and is working perfectly. Reporting that as
    // not_done would reopen a live step every time someone looked.
    // 🔑 `verdict` comes FIRST in the object literal — the earlier form looked for the evidence
    // string then the verdict, so it never matched and the check passed with the bug present.
    if (/verdict: "not_done", evidence: "No form submissions recorded yet/.test(rc)) {
      bad("zero form submissions is reported as not_done — a quiet site is not a broken one");
    }
  }
}
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 AN ANSWER THE CLIENT GIVES US MUST REACH A HUMAN. A sweep on 2026-09-17 found ZERO readers
// of `client_input` in admin: five steps take a real answer in the portal — a one-time CMS link,
// opening hours, a booking URL, attributes, monthly numbers — and every one landed in a JSONB
// field nothing on the admin screen rendered. The portal said "✓ Done" and the work item was a
// black hole.
//
// 🔑 An input nobody can read is WORSE than no input, because the client believes they told us.
// → feedback_a_finding_must_be_actionable_inside_the_product · feedback_verify_the_write_not_just_the_intent
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const admin = read("admin/admin.js");
  // 🔑 Strip comments: the note explaining this very bug quotes `client_input`, so the raw file
  // always contains it. A gate that reads its own rationale as the feature is no gate at all.
  // → feedback_a_check_must_not_validate_itself
  const adminCode = admin.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const inputSteps = steps.filter((s) => s.clientInput);
  if (inputSteps.length && !/client_input\b/.test(adminCode)) {
    bad(`${inputSteps.length} step(s) take an answer in the portal and admin reads client_input NOWHERE — every one is a black hole`);
  }
  if (!/clientInputHtml\s*=/.test(admin)) bad("admin has no renderer for a client's submitted answer");
  else {
    const i = admin.indexOf("const clientInputHtml");
    const body = admin.slice(i, admin.indexOf("\n  };", i));
    for (const k of INPUT_KINDS) {
      if (!new RegExp(`spec\\.kind === "${k}"`).test(body)) bad(`admin cannot display a "${k}" answer — it would render blank`);
    }
    // 🔴 The spec must survive the projection admin builds, or the renderer gets null and shows
    // nothing — the exact shape of the original bug, one layer further in.
    if (!/clientInput: s\.clientInput/.test(admin)) {
      bad("admin's step projection drops clientInput — the renderer would never receive the spec");
    }
    if (!/\$\{clientInputHtml\(/.test(admin)) bad("admin builds the renderer and never calls it");
    // 🔑 The one-time CMS link MUST be visible to admin — they are who opens it. `echo:false` is a
    // client-side rule about not reprinting a spent secret, not a reason to hide it from us.
    if (/spec\.echo === false[\s\S]{0,80}?return ""/.test(body)) {
      bad("admin hides an echo:false answer — that is the one-time CMS link, and admin is who opens it");
    }
  }
}
if (!fail) ok("the renderer branches on all five mechanisms and the control is wired to a write");
if (!fail) ok(`admin renders every kind of answer a client can submit (${steps.filter((s) => s.clientInput).length} step(s))`);
if (!fail) ok("a flagged row stops claiming Done, survives a reload, and a detected row re-checks instead of disputing");

// ── 7. the endpoint refuses what is not the client's to mark ───────────────────────────────────
const fn = read("netlify/functions/portal-step-choice.js");
const md = fn.indexOf("if (body.mark_done === true)");
if (md < 0) bad("portal-step-choice does not accept mark_done at all");
else {
  const body = fn.slice(md, md + 3200);
  if (!/clientDone !== "client"/.test(body)) {
    bad("🔴 mark_done does not check clientDone — a client could close a step we detect or a step we own");
  }
  if (!/CLIENT_STEPS\[stepId\]/.test(body)) bad("mark_done does not check the step is one of theirs");
  if (!/completed_by: "client"/.test(body)) {
    bad("mark_done stores no author — a claim recorded as an observation is indistinguishable from one");
  }
  if (!/after\?\.data\?\.tasks/.test(body)) bad("mark_done does not read the write back");
  if (!/tellRga\(/.test(body)) bad("mark_done tells nobody — several of these unblock our work");
  if (!/client_step_marked_done/.test(body)) bad("mark_done writes no activity row");
}
if (!fail) ok("mark_done is allow-listed to client-owned steps, read back, logged and notified");

console.log(fail
  ? `\n🔴 ${fail} problem(s) — a client step that cannot be finished is a dead end.`
  : `\n✅ every one of ${steps.length} client steps declares how it finishes, and the portal honours it.`);
process.exit(fail ? 1 : 0);
