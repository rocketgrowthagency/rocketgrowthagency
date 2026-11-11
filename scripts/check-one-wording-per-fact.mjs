#!/usr/bin/env node
// check-one-wording-per-fact.mjs: ONE WORDING PER FACT in client text, and ONE call-length setting (approved master map, Chris 11-11:
// "all recommended and all approved"; decisions 1-5 + the Tier 1 wording items; reference_master_map).
// The master audit (website reports/master-audit/steps.md §10) found the same fact told two ways: the monthly check-in was "about 20
// minutes" in 12 places while every booking held 30, photos were "done when 20" while Finish needs 3 of each kind, the win story was "a
// month" while the code asks once a quarter, the quarterly video was "sixty to ninety seconds" and "about 60 seconds" in one step.
// HOLDS, on the WEBSITE repo:
//   1  CALL LENGTH. shared/call-length.js is the one setting: every call holds 30, the monthly check-in reads "about 20 minutes (we hold 30)".
//      Every booking path requires it and types no 30 of its own; every "N-minute" invite text says the setting's number; the portal, setup-split
//      and client-monthly draw the monthly words from it; no client text says "20 min" without "(we hold 30)"; admin's KICKOFF_SLOT_MIN agrees.
//   2  PHOTOS. Client text never says "done when 20"; the photo step's done rule reads "done at 3 of each kind; 20 is the goal".
//   3  FIRST REVIEWS. Client text never says "done when you have asked 5"; it reads "Ask at least 1 customer, aim for 5". The first_5 requests
//      come from shared/setup-fewer.js firstFive: the 5 MOST RECENT customers (a list of 8 gives 5, the newest list first), never whole lists.
//   4  WIN STORY. Every client string for it says quarter, never "this month" / "a month" / "Every month".
//   5  QUARTERLY VIDEO. "One video; pick from two scripts", one length ("about 60 seconds"), and no "we edit it" (there is no editing step).
//   6  US SPELLING. No "cancelled" / "cancelling" in client text (portal, client-steps, the invoice email).
//   7  TEXTS. "A text the day before and an hour before each call" is said only when texting is on AND a mobile is on file.
//   8  NAME. The playbook's admin title for m2.call.monthly is "Monthly check-in", and so is the admin card's label.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default e55755bb) in 12+ places, else exit 2.
//   node scripts/check-one-wording-per-fact.mjs [--against=<rev>] [--no-before]
// exit 0 holds · 1 a fact has two wordings (or the setting is bypassed) · 2 INDETERMINATE
import vm from "node:vm";
import { runGate, reader, loader, codeLines } from "./lib/site-rev.mjs";

const BEFORE = "e55755bb";
const BOOKING = ["netlify/functions/_kickoff-slots.js", "netlify/functions/send-kickoff-invite.js", "netlify/functions/_rga-calls.js", "netlify/functions/portal-book-kickoff.js",
  "netlify/functions/walkthrough-book.js", "netlify/functions/kickoff-requests.js", "netlify/functions/schedule-data.js", "netlify/functions/cancel-kickoff-invite.js"];
const CLIENT_JS = ["portal/portal.js", "shared/client-monthly.js", "shared/setup-split.js"];
const PHRASE = "about 20 minutes (we hold 30)";

/** Every client string of a step. client-steps.json IS the client projection (every field but the id); in playbooks.json only the fields
 *  named client* (and managedLabel) are client text, with everything nested inside them (clientTodoSteps, clientInput.prompt, ...). */
function clientStrings(step, onlyClientKeys) {
  const out = [], all = (v) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(all); else if (v && typeof v === "object") Object.values(v).forEach(all); };
  for (const [k, v] of Object.entries(step || {})) if (k !== "id" && (!onlyClientKeys || /^client|^managedLabel$/.test(k))) all(v);
  return out;
}
const stepsOf = (j) => (j ? [...(j.month1 || []), ...(j.month2plus || []), ...(j.month3plus || []), ...(j.onboarding || [])] : []);

function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  let CL = null;
  // ── 1 · the one setting ──
  try { CL = req("./shared/call-length.js"); } catch { fail("shared/call-length.js (the one call-length setting) does not exist or does not load"); }
  if (CL) {
    if (CL.HOLD_MINUTES !== 30 || CL.talkMinutes("monthly") !== 20) fail(`the setting is not hold 30 / monthly 20 (${CL.HOLD_MINUTES} / ${CL.talkMinutes && CL.talkMinutes("monthly")})`);
    if (CL.MONTHLY_PHRASE !== PHRASE) fail(`the monthly check-in's words are "${CL.MONTHLY_PHRASE}", not "${PHRASE}"`);
    if (!/\(we hold 30\)/.test(CL.MONTHLY_PILL || "") || !/^About 20 minutes \(we hold 30\)$/.test(CL.MONTHLY_SENTENCE || "")) fail("the pill or the sentence form of the monthly words drops \"(we hold 30)\"");
    if (CL.phrase("kickoff") !== "30 minutes" || CL.endMs(0) !== 30 * 60000) fail("another call is not 30 minutes from the setting");
  }
  for (const f of BOOKING) {
    const src = rd(f); if (src == null) { fail(`${f} is missing`); continue; }
    if (!/require\("\.\.\/\.\.\/shared\/call-length\.js"\)/.test(src)) fail(`${f} does not read the one call-length setting`);
    for (const { l, n } of codeLines(src)) {
      if (/\b30\s*\*\s*60(?:\s*\*\s*1000|000|e3)\b|slotMinutes:\s*30\b|SLOT_MIN\s*=\s*30\b/.test(l)) fail(`${f}:${n} types its own 30-minute length instead of the setting`);
      for (const m of l.matchAll(/\b(\d+)-minute (?:quarterly review|monthly check-in|Month 1 review|kickoff call|audit walkthrough)/g)) if (CL && Number(m[1]) !== CL.HOLD_MINUTES) fail(`${f}:${n} says ${m[1]}-minute; the setting holds ${CL.HOLD_MINUTES}`);
      if (/-minute monthly check-in/i.test(l)) fail(`${f}:${n} calls the monthly check-in an N-minute call; its words are "${PHRASE}"`);
    }
  }
  const inv = rd("netlify/functions/send-kickoff-invite.js") || "";
  if (!/purpose\.id === "m2_monthly"\s*\?\s*`Monthly check-in, \$\{CL\.MONTHLY_PHRASE\}\./.test(inv)) fail("the monthly check-in's invite does not say the setting's words");
  const portal = rd("portal/portal.js") || "", admin = rd("admin/admin.js") || "";
  if (!/import "\/shared\/call-length\.js\?v=/.test(portal)) fail("portal.js does not import shared/call-length.js");
  if (!/import "\/shared\/call-length\.js\?v=/.test(admin)) fail("admin.js does not import shared/call-length.js (setup-split reads it there too)");
  if (!/m2_monthly: \{[^\n]*len: globalThis\.rgaCallLength\.pill\("m2_monthly"\)/.test(portal)) fail("the monthly check-in's picker pill is not the setting's");
  if (!/\[globalThis\.rgaCallLength\.MONTHLY_PILL, "wait off"\]/.test(portal)) fail("step 12's pill is not the setting's");
  { const m = /^const KICKOFF_SLOT_MIN = (\d+);/m.exec(admin); if (!m || (CL && Number(m[1]) !== CL.HOLD_MINUTES)) fail(`admin.js KICKOFF_SLOT_MIN (${m ? m[1] : "gone"}) does not agree with the setting`); }
  for (const f of ["shared/client-monthly.js", "shared/setup-split.js"]) if (!/require\("\.\/call-length\.js"\)/.test(rd(f) || "")) fail(`${f} does not read the monthly words from the setting`);
  try {
    const CM = req("./shared/client-monthly.js"), SS = req("./shared/setup-split.js");
    void CM; void SS;
  } catch (e) { fail(`client-monthly / setup-split do not load (${String(e.message).slice(0, 80)})`); }
  // no client JS line says 20 minutes without "(we hold 30)"
  for (const f of CLIENT_JS) for (const { l, n } of codeLines(rd(f) || "")) {
    if (/\b20[ -]min(?:ute)?s?\b/i.test(l) && !/\(we hold 30\)/.test(l)) fail(`${f}:${n} says 20 minutes without "(we hold 30)" (and not from the setting)`);
  }
  // ── the playbook's client words, fact by fact ──
  let CS = null, PB = null;
  try { CS = JSON.parse(rd("data/playbooks/client-steps.json")); } catch { fail("client-steps.json does not parse"); }
  try { PB = JSON.parse(rd("data/playbooks/playbooks.json")); } catch { fail("playbooks.json does not parse"); }
  const sources = [["client-steps.json", stepsOf(CS), false], ["playbooks.json", stepsOf(PB), true]];
  const byId = (steps, id) => steps.find((s) => s && s.id === id);
  for (const [src, steps, only] of sources) {
    const all = steps.flatMap((s) => clientStrings(s, only).map((t) => ({ id: s.id, t })));
    // 1 · monthly
    const call = byId(steps, "m2.call.monthly");
    if (!call) fail(`${src}: m2.call.monthly is gone`);
    else for (const t of clientStrings(call, only)) if (/\bminutes?\b|\bmin\b/i.test(t) && !t.toLowerCase().includes(PHRASE)) fail(`${src}: the monthly check-in says its length another way ("${t.slice(0, 90)}")`);
    for (const { id, t } of all) if (/\b20[ -]min(?:ute)?s?\b/i.test(t) && !/\(we hold 30\)/.test(t)) fail(`${src} ${id}: "20 minutes" without "(we hold 30)"`);
    // 2 · photos
    for (const { id, t } of all) if (/done when 20\b/i.test(t)) fail(`${src} ${id}: "done when 20" (the rule is "done at 3 of each kind; 20 is the goal")`);
    const ph = byId(steps, "m1.gbp.photos");
    if (ph) { const rules = clientStrings(ph, only).filter((t) => /\bdone (?:when|at)\b/i.test(t));
      if (!rules.length || rules.some((t) => !/done at 3 of each kind; 20 is the goal/.test(t))) fail(`${src}: the photo step's done rule is not "done at 3 of each kind; 20 is the goal" (${rules.length} statement(s))`); }
    // 3 · first reviews
    for (const { id, t } of all) if (/done when you have asked 5|done when 5\b/i.test(t)) fail(`${src} ${id}: "done when you have asked 5" (the rule is "ask at least 1 customer, aim for 5")`);
    const f5 = byId(steps, "m1.review.first_5");
    if (f5 && !clientStrings(f5, only).some((t) => /Ask at least 1 customer, aim for 5/.test(t))) fail(`${src}: the first reviews step does not say "Ask at least 1 customer, aim for 5"`);
    // 4 · win story
    const win = byId(steps, "m2.win_story.capture");
    if (win) for (const t of clientStrings(win, only)) if (/\b(?:this|a|each|every|next) month\b|\bmonth's story\b|\bmonthly\b/i.test(t)) fail(`${src}: the win story says a month ("${t.slice(0, 80)}"); it is quarterly`);
    if (win && !clientStrings(win, only).some((t) => /\bquarter\b/i.test(t))) fail(`${src}: the win story never says quarter`);
    // 5 · quarterly video
    const vid = byId(steps, "m2.exec.youtube_video");
    if (vid) {
      const vt = clientStrings(vid, only);
      if (vt.some((t) => /we edit it|\bEdit it\b|we cut the rest|captions/i.test(t))) fail(`${src}: the quarterly video promises editing (there is no editing step)`);
      if (vt.some((t) => /sixty|ninety|60\s*(?:-|to)\s*90|90 seconds/i.test(t))) fail(`${src}: the quarterly video has a second length (it is "about 60 seconds")`);
      if (!vt.some((t) => /pick from two scripts/i.test(t))) fail(`${src}: the quarterly video does not say "pick from two scripts"`);
      if (!vt.some((t) => /about 60 seconds/i.test(t))) fail(`${src}: the quarterly video does not say "about 60 seconds"`);
    }
    // 6 · US spelling
    for (const { id, t } of all) if (/\bcancell(?:ed|ing)\b/i.test(t)) fail(`${src} ${id}: British "cancelled"; say "canceled"`);
  }
  // 8 · the admin title
  { const s = byId(stepsOf(PB), "m2.call.monthly"); if (!s || s.title !== "Monthly check-in") fail(`the playbook's admin title for m2.call.monthly is "${s && s.title}", not "Monthly check-in"`); }
  try { const MC = req("./shared/monthly-close.js"); if (MC.callLabel(2) !== "Monthly check-in" || MC.callLabel(3) !== "Quarterly review") fail(`the admin card's call label is "${MC.callLabel(2)}", not "Monthly check-in"`); }
  catch (e) { fail(`shared/monthly-close.js does not load (${String(e.message).slice(0, 80)})`); }
  // ── the portal's own client strings ──
  const pl = codeLines(portal);
  for (const { l, n } of pl) {
    if (/done when 20\b|done when you have asked 5/i.test(l)) fail(`portal.js:${n} states the old done rule`);
    if (/(?:win story|customer story|your story|proud of)[^"`]{0,40}\b(?:this|a|each|next) month\b/i.test(l)) fail(`portal.js:${n} gives the win story a month ("${l.trim().slice(0, 90)}")`);
    if (/we edit it|RGA edits/i.test(l)) fail(`portal.js:${n} promises editing a video`);
    if (/\bcancell(?:ed|ing)\b/i.test(l.replace(/checkout_cancelled|cancelledInvoice|"cancelled"|'cancelled'|cancelled_at/g, ""))) fail(`portal.js:${n} says "cancelled"; say "canceled"`);
  }
  if (!/lr\("A customer win story", "[^"]*", "Every 3 months"\)/.test(portal)) fail('the Ongoing list\'s win story line is not "Every 3 months"');
  { const a = portal.indexOf('"m2.win_story.capture": (step, c) => {'), b = portal.indexOf("\n  },\n", a);
    if (a < 0 || b < 0) fail("the win story's card (OG_CARD) is gone");
    else for (const { l, n } of codeLines(portal.slice(a, b))) if (/\bmonth\b/.test(l)) fail(`the win story's card says month (line ${n} of it: "${l.trim().slice(0, 80)}"); it is quarterly`); }
  const inviteMail = rd("netlify/functions/send-invoice-email.js") || "";
  for (const { l, n } of codeLines(inviteMail)) if (/\bcancell(?:ed|ing)\b/i.test(l.replace(/"cancelled"|'cancelled'|cancelled_at/g, ""))) fail(`send-invoice-email.js:${n} says "cancelled"; say "canceled"`);
  // 3 · the first five: the rule, and who uses it
  try {
    const SF = req("./shared/setup-fewer.js");
    if (typeof SF.firstFive !== "function") fail("shared/setup-fewer.js has no firstFive (the 5 most recent customers)");
    else {
      const c = (nm) => ({ first_name: nm, phone: "(303) 555-0100" });
      const got = SF.firstFive([{ id: "old", created_at: "2026-10-01T00:00:00Z", customers: [c("Ana"), c("Bo")] },
        { id: "new", created_at: "2026-10-20T00:00:00Z", customers: ["Cy", "Di", "Ed", "Fa", "Gu", "Ha", "Io", "Jo"].map(c) }]);
      if (got.length !== 5) fail(`one list of 8 gives ${got.length} requests, not 5`);
      if (got.some((p) => p.list_id !== "new")) fail("the 5 are not the most recent (an older list's customers came first)");
      const one = SF.firstFive([{ id: "a", created_at: "2026-10-01T00:00:00Z", customers: [{ first_name: "", phone: "1" }, { first_name: "Zoë", email: "z@x.ca" }] }]);
      if (one.length !== 1 || one[0].index !== 1) fail("a customer who can't be asked is counted, or the index is not their place in the list");
      // a done step keeps its five: Month 3's weekly list (sent after it was done) is not the step's
      const until = typeof SF.firstFiveUntil === "function" ? SF.firstFiveUntil({ status: "done", completed_at: "2026-10-25T00:00:00Z" }) : null;
      const kept = SF.firstFive([{ id: "step", created_at: "2026-10-20T00:00:00Z", customers: [c("Ana"), c("Bo"), c("Cy")] }, { id: "weekly", created_at: "2026-12-01T00:00:00Z", customers: [c("Wu")] }], 5, { until });
      if (kept.some((p) => p.list_id === "weekly") || kept.length !== 3) fail("a done step's five turn into a later weekly list's customers");
      if (SF.firstFiveUntil && SF.firstFiveUntil({ status: "pending", completed_at: "2026-10-25T00:00:00Z" }) !== null) fail("an open step is cut off at a date");
    }
  } catch (e) { fail(`shared/setup-fewer.js does not load (${String(e.message).slice(0, 80)})`); }
  const rr = rd("netlify/functions/portal-review-requests.js") || "";
  const f5b = rr.slice(rr.indexOf('if (body.scope === "first_5")'), rr.indexOf('if (body.scope === "first_5")') + 1500);
  if (!/const picked = firstFive\(all, 5, \{ until: firstFiveUntil\(await stepTask\(clientId, "m1\.review\.first_5"\)\) \}\);/.test(f5b) || /if \(n >= 5\) break/.test(f5b)) fail("portal-review-requests first_5 does not send to the 5 most recent of the step's own lists (firstFive + firstFiveUntil)");
  if (!/function ogFirstFiveAsked\(lists, tasks\) \{\n\s*const F = globalThis\.rgaSetupFewer;\n\s*return F\.firstFive\(lists \|\| \[\], REVIEW_GOAL, \{ until: F\.firstFiveUntil\(/.test(portal)) fail("the portal's count of the 5 asked is not the same rule (firstFive + firstFiveUntil)");
  // 7 · the texts promise
  const TEXTS = "A text the day before and an hour before each call";
  const rm = /^const rmobSub = [\s\S]*?\);$/m.exec(portal);
  if (!rm) fail("portal.js has no rmobSub (the texts promise is not conditional)");
  else {
    try {
      const ctx = vm.createContext({}); vm.runInContext(rm[0].replace(/^const /, "var "), ctx);
      const say = (st) => ctx.rmobSub(st);
      if (!say({ texts_on: true, shown: "(303) 555-0100" }).startsWith(TEXTS)) fail("texting on + a mobile on file does not say the texts");
      for (const st of [{ texts_on: false, shown: "(303) 555-0100" }, { texts_on: true, shown: "" }, { texts_on: false, shown: "" }, { shown: "(303) 555-0100" }])
        if (say(st).includes(TEXTS)) fail(`the texts are promised when ${JSON.stringify(st)}`);
    } catch (e) { fail(`rmobSub does not run (${String(e.message).slice(0, 80)})`); }
  }
  for (const { l, n } of pl) if (l.includes(TEXTS) && !/^const rmobSub|^\s*: st\.shown \?/.test(l)) fail(`portal.js:${n} says "${TEXTS}" outside rmobSub (unconditionally)`);
  const mob = rd("netlify/functions/portal-reminder-mobile.js") || "";
  if (!/texts_on: !!textsAvailable\(\)\.on/.test(mob)) fail("portal-reminder-mobile does not tell the portal whether texting is on");
  return F;
}
try {
  await runGate({ name: "check-one-wording-per-fact", beforeRev: BEFORE, checkTree, minBefore: 12 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
