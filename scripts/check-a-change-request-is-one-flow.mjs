#!/usr/bin/env node
// check-a-change-request-is-one-flow.mjs — 2026-10-27, approved client_ask_for_a_change_v1 (Chris on step 3's lock bar: "request a
// change. can we make this better"). RUNS the portal's lockFootHtml and _open-moves on every state:
//   · closed: ONE "Need a change? ›" on the lock line (bottom); the panel has both choices only where a change is allowed, our own
//     inline error, and NO `required` (the browser's grey popup); never the old "Not right?" + "Request a change" pair
//   · asked: ONE band at the top (what they wrote + Cancel my request), the bottom line drops "Need a change?", and the row's old
//     "we're looking into it" band is gone on a locked step; the pill reads "With RGA · since"
//   · the To do list: a flag or a change request — even on a FINISHED step — is RGA's move with a same-day promise
//   · 🔒 client_card_system_v1 (4), Chris 10-29: on a SYSTEM step (CS_STEPS, steps 2–9) the request is ONE status row inside the card
//     (.pm-cs-seat → csSt rga "You asked: “…”" · when · Cancel; RGA's reply = the same row with That's sorted ✓), and the foot's lock reads
//     just "Locked" (client_step03_access_v1) — "Nothing changes until we've talked" is said ONCE, by the row. Other steps keep the band.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { csBlock } from "./lib/portal-cs.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js");
const fnSrc = (n) => { const at = P.indexOf(`function ${n}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${n} moved`); process.exit(2); } return P.slice(at, P.indexOf("\n}\n", at) + 2); };
const line = (re, w) => { const m = P.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${w} moved`); process.exit(2); } return m[0].replace(/^const /, "var "); };
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => (x ? "Oct 27" : "") });
vm.runInContext(`var _portalThread = [];\n${line(/^const LOCK_ICON = [^\n]*;$/m, "LOCK_ICON")}\n${line(/^const CARD_OWNS_LOCK = [^\n]*;$/m, "CARD_OWNS_LOCK")}\n${line(/^const CARD_ASKS_CHANGE = [^\n]*;$/m, "CARD_ASKS_CHANGE")}\n${line(/^const ASK_EXAMPLES = [^\n]*;$/m, "ASK_EXAMPLES")}\n${line(/^const ASK_CHOICES = [^\n]*;$/m, "ASK_CHOICES")}\n${line(/^const ASK_WORDS = [^\n]*;$/m, "ASK_WORDS")}\n${line(/^const askWhen = [^\n]*;$/m, "askWhen")}\n${csBlock(P)}\n${fnSrc("askReplyOf")}\n${fnSrc("lockFootHtml")}`, ctx);
const lf = (task, lk, where) => vm.runInContext(`lockFootHtml("m1.access.website", ${JSON.stringify(task)}, ${JSON.stringify(lk)}, "${where}")`, ctx);
const LK = { why: "RGA confirmed it, so it can't be edited here", edit: "request" }, LK0 = { why: "RGA confirmed it", edit: "none" };
{ const top = lf({}, LK, "top"), bot = lf({}, LK, "bottom");
  if (top) fail("a locked step with nothing asked draws a band at the top");
  if ((bot.match(/Need a change\? ›/g) || []).length !== 1) fail("the closed lock line doesn't carry exactly one \"Need a change? ›\"");
  if (/Not right\?|<summary>Request a change<\/summary>/.test(bot)) fail("the old Not right? / Request a change pair is back");
  if (/\brequired\b/.test(bot)) fail("the panel's box is `required` again — the browser's grey popup instead of our own line");
  // 🔒 step3_finish_v1 C (approved 10-28): the website access step says what a change is FOR — four choices, the first checked
  for (const [v, w] of [["moved", "We moved our website to a different place"], ["address", "We have a new website address"], ["remove", "Remove Rocket Growth Agency's access"], ["other", "Something else"]])
    if (!new RegExp(`value="${v}"`).test(bot) || !bot.includes(w)) fail(`step 3's Need a change? lost "${w}"`);
  if (!/<b class="pm-chg-h">What changed\?<\/b>/.test(bot) || !/value="moved" checked/.test(bot) || !/class="pm-chg-err" hidden/.test(bot)) fail("step 3's panel doesn't ask \"What changed?\" with the first choice ready, or lost its own inline error");
  // every OTHER step keeps the general two choices
  const gen = vm.runInContext(`lockFootHtml("m1.tracking.call_setup", {}, ${JSON.stringify(LK)}, "bottom")`, ctx);
  if (!/value="wrong"/.test(gen) || !/value="change"/.test(gen)) fail("another step lost the general choices (something's wrong · I want to change something)"); }
{ const bot = lf({}, LK0, "bottom"); if (/value="change"/.test(bot) || !/name="kind" value="wrong"/.test(bot)) fail("a step that can't be changed offers \"I want to change something\" (only \"something's wrong\" fits)"); }
const lfAt = (step, task, lk, where) => vm.runInContext(`lockFootHtml(${JSON.stringify(step)}, ${JSON.stringify(task)}, ${JSON.stringify(lk)}, "${where}")`, ctx);
// 🔄 10-30 (client card system batch 2): call setup (step 11) joined the system with every other Month 1 step, so "a step outside
// the card system" is now the first numbered client step NOT in CS_STEPS (today a Month 2 step) — read from the SOP, never named here
const OUT = (() => { const ids = []; const walk = (o) => { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === "object") { if (o.id && o.clientStepNo != null) ids.push([o.clientStepNo, o.id]); Object.values(o).forEach(walk); } };
  walk(JSON.parse(read("data/playbooks/client-steps.json"))); return (ids.sort((a, b) => a[0] - b[0]).find(([, id]) => !vm.runInContext(`CS_STEPS.has(${JSON.stringify(id)})`, ctx)) || [])[1]; })();
if (!vm.runInContext(`CS_STEPS.has("m1.access.website")`, ctx) || !OUT) { console.error("⚠️  INDETERMINATE — step 3 is no longer a system step (or every client step is one): re-read which steps draw the CS row"); process.exit(2); }
for (const [task, label, kw, said] of [[{ client_flagged: { at: "x", note: "That's not our site" } }, "a flag", /data-step-unflag/, "That's not our site"], [{ change_request: { at: "x", note: "Add my office manager" } }, "a change request", /data-chreq-cancel/, "Add my office manager"]]) {
  // a step outside the card system (call setup): ONE band with their words + Cancel my request; the lock line says "nothing changes" once
  { const top = lfAt(OUT, task, LK, "top"), bot = lfAt(OUT, task, LK, "bottom");
    if ((top.match(/class="pm-chg-band"/g) || []).length !== 1 || !/<q>/.test(top) || !kw.test(top) || !/Cancel my request/.test(top)) fail(`${label}: not ONE band with what they wrote + Cancel my request`);
    if (/Need a change\?/.test(bot)) fail(`${label}: the bottom still offers Need a change? while one is open`);
    if (!/Locked · nothing changes until we've talked/.test(bot)) fail(`${label}: the lock line doesn't say "nothing changes until we've talked" while RGA has it`);
    if (/Nothing changes until/.test(top)) fail(`${label}: the band repeats "Nothing changes until we've talked" (the lock line says it once)`); }
  // a SYSTEM step (step 3): ONE blue status row, seated into the card — never a band above it
  { const top = lf(task, LK, "top"), bot = lf(task, LK, "bottom");
    if (!/^<div class="pm-cs-seat" data-step-lock="m1\.access\.website"><div class="pm-cs-st rga">/.test(top) || (top.match(/class="pm-cs-st /g) || []).length !== 1 || /pm-chg-band/.test(top)) fail(`${label} on a system step: not ONE blue status row in a .pm-cs-seat (or the old band is back above the card)`);
    if (!top.includes(`You asked: “${said}”`) || !kw.test(top) || !/>Cancel<\/button>/.test(top)) fail(`${label} on a system step: the row isn't "You asked: “their words”" with its own Cancel`);
    if (!/RGA answers here and by email, today\./.test(top)) fail(`${label} on a system step: the row lost its same-day promise ("RGA answers here and by email, today.")`);
    if (/Need a change\?/.test(bot)) fail(`${label} on a system step: the bottom still offers Need a change? while one is open`);
    // client_step03_access_v1: the row says "Nothing changes until we've talked"; the foot's lock says just "Locked" — once, not twice
    const says = ((top + bot).match(/[Nn]othing changes until we've talked/g) || []).length;
    if (says !== 1 || !/<span>Locked<\/span>/.test(bot)) fail(`${label} on a system step: "Nothing changes until we've talked" appears ${says}× (the row says it; the foot's lock should read just "Locked" — client_step03_access_v1)`); }
}
// RGA replied after the request → the band IS the reply (mockup §4 right): Open the conversation + That's sorted; the lock line reads "Locked"
{ ctx._portalThread = [{ id: 1, step_id: "m1.access.website", from: "rga", at: "2026-10-27T21:10:00Z", message: "Done: we've added her as a second contact." },
    { id: 0, step_id: "m1.access.website", from: "rga", at: "2026-10-20T10:00:00Z", message: "older" }];
  vm.runInContext("_portalThread = this._portalThread", ctx);
  const t = { change_request: { at: "2026-10-27T19:00:00Z", note: "Add my office manager" } };
  // a SYSTEM step: the same status row carries the reply — That's sorted ✓ (it changes something) + Open the conversation
  { const cs = lf(t, LK, "top");
    if (!/<div class="pm-cs-st rga">/.test(cs) || !/RGA replied · /.test(cs) || !/added her as a second contact/.test(cs) || /older/.test(cs) || /pm-chg-band/.test(cs)
      || !/<button type="button" class="pm-commit pm-chg-sorted" data-chg-sorted data-chreq-cancel="m1\.access\.website">That's sorted ✓<\/button><button type="button" data-chg-convo=/.test(cs)) fail("on a system step RGA's reply doesn't turn the status row into the reply (That's sorted ✓ leads, Open the conversation)"); }
  ctx._portalThread = ctx._portalThread.map((m) => ({ ...m, step_id: OUT })); vm.runInContext("_portalThread = this._portalThread", ctx);
  const top = lfAt(OUT, t, LK, "top"), bot = lfAt(OUT, t, LK, "bottom");
  if (!top.includes(`<button type="button" class="pm-commit pm-chg-sorted" data-chg-sorted data-chreq-cancel="${OUT}">That's sorted ✓</button><button type="button" class="pm-chg-lnk" data-chg-convo=`)) fail("\"That's sorted\" isn't the small button that leads (it closes the request; the conversation is the link)");
  if (!/class="pm-chg-band y"/.test(top) || !/RGA replied · /.test(top) || !/added her as a second contact/.test(top) || !/data-chg-convo/.test(top) || !/data-chg-sorted data-chreq-cancel/.test(top) || /older/.test(top)) fail("RGA's reply after the request doesn't turn the band into the reply (Open the conversation + That's sorted)");
  if (!/<span>Locked<\/span>/.test(bot)) fail("after RGA's reply the lock line isn't just \"Locked\"");
  ctx._portalThread = []; vm.runInContext("_portalThread = []", ctx); }
if (!/flagged && !stepLk\n\s*\? `<p class="pm-flagged">/.test(P)) fail("the row's second \"we're looking into it\" band shows on a locked step again");
if (!/const ownerPill = askLk \? \{ text: `With RGA\$\{askAt \? ` · since \$\{monthDay\(askAt\)\}` : ""\}`, cls: "rga" \}/.test(P)) fail("a locked step asked about doesn't read \"With RGA · since\"");
// the lock line is the card's LAST line (Chris 10-27: "match mockup"): marked bottom, seated by the same pass that seats the how-to
if (!/data-lock-pos="bottom"/.test(lf({}, LK, "bottom")) || !/requestAnimationFrame\(\(\) => \{ _seatQueued = false; (?:upgradeCsCards\(\); )?seatHowFolds\(\); seatLockFoots\(\);(?: seatCsSt\(\);)? \}\)/.test(P) || !/card\.appendChild\(f\); f\.classList\.add\("in-card"\);/.test(P)) fail("the lock line isn't seated inside the card as its footer");
// mockup section 2 EXACTLY (Chris 10-27: "lock still doesnt match mockup"): a quiet grey line with the padlock glyph, never the green bold
// one; section 3: open, the panel takes the line's place, flat inside the card; a flagged step is never the client's orange "next step"
{ const C = read("portal/portal.css"), bot = lf({}, LK, "bottom");
  if (!/<span class="pm-lock-g" aria-hidden="true">🔒<\/span><span>Locked · RGA confirmed it, so it can't be edited here<\/span>/.test(bot)) fail("the closed lock line isn't the mockup's \"🔒 Locked · RGA confirmed it, so it can't be edited here\"");
  if (!/\.pm-lockfoot \.pm-lockline \{ font-size:13\.5px; font-weight:400; color:var\(--portal-muted/.test(C)) fail("the lock line isn't the mockup's quiet grey (13.5px, normal weight, muted)");
  if (!/\.pm-lockfoot\.is-asking \.pm-lockline \{ display:none; \}/.test(C) || !/foot\.classList\.toggle\("is-asking", show\)/.test(P)) fail("opening the panel leaves the lock line above it (the mockup's panel takes its place)");
  if (!/\.pm-lockfoot\.in-card \.pm-chg \{ margin:0; padding:0; border:0;/.test(C)) fail("the panel is a box inside the grey footer again (the mockup's is flat)");
  if (!/isOpenRow\(r\) && r\.status !== "flagged" && theirs\(r\)/.test(P)) fail("a flagged step can be the client's orange \"next step\" again (it's RGA's move)"); }
if (!/const DONE_STRIP = "[^"]*\.pm-lockfoot/.test(P)) fail("the lock line inside the card counts as a done card's record (DONE_STRIP)");
if (!/isDone && !askLk \? " is-done" : askLk \? " is-rga"/.test(P)) fail("a step with RGA still shows its done tick");
// admin "Open step" on the client already open opens the step in place — it used to re-load the client and repaint every card
// (Chris 10-27: "open step button doesnt work and everything glitches")
{ const A = read("admin/admin.js");
  if (!/if \(here\) \{ if \(state\.activeTab !== "onboarding-v2"\) setActiveTab\("onboarding-v2"\); revealStep\(step\); (?:focusAskReply\(step\); )?return; \}/.test(A)) fail("admin Open step re-loads the client it's already on (the whole page repaints)"); }
// ── ADMIN: a FINISHED step the client asked about (approved admin_row8_done_v2, Chris 10-27 "?": row 8 opened with nothing to reply to)
{ const A = read("admin/admin.js");
  const afn = (n) => { const at = A.indexOf(`function ${n}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — admin ${n} moved`); process.exit(2); } return A.slice(at, A.indexOf("\n}\n", at) + 2); };
  const aline = (n) => { const m = A.match(new RegExp(`^const ${n} = [^\\n]*;$`, "m")); if (!m) { console.error(`⚠️  INDETERMINATE — admin ${n} moved`); process.exit(2); } return m[0].replace(/^const /, "var "); };
  const ax = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: () => "Oct 27, 2:55 PM",
    state: { selectedClient: { id: "c1", business_name: "Acme Plumbing" }, onboardingData: {} }, globalThis: { rgaStepLock: { stepLock: () => ({ why: "x", edit: "request" }) } }, Date });
  vm.runInContext(`${afn("acCardHtml")}\n${afn("admAskOf")}\n${afn("adminAskHtml")}\n${aline("ASK_TILE")}`, ax);
  const ask = (t) => vm.runInContext(`admAskOf(${JSON.stringify(t)})`, ax), card = (t) => vm.runInContext(`adminAskHtml("m1.access.website", ${JSON.stringify(t)}, admAskOf(${JSON.stringify(t)}))`, ax);
  const FL = { status: "done", client_flagged: { at: "2026-10-27T21:55:00Z", note: "Checking TEST" } };
  if (!ask(FL) || ask(FL).kind !== "wrong" || ask({ status: "done" }) !== null) fail("admin can't tell a finished step has an open ask (flag / change request)");
  const c1 = card(FL);
  if (!/The client says something's wrong/.test(c1) || !/Checking TEST/.test(c1) || !/<form class="ob-ask-f" id="obAsk-m1-access-website" data-ob-ask-reply="m1\.access\.website"/.test(c1) || !/form="obAsk-m1-access-website">Send reply<\/button>/.test(c1)
    || !/data-ob-chreq-dismiss="m1\.access\.website"[^>]*data-ob-ask-unanswered>Close without replying/.test(c1) || !/Unlock for the client…/.test(c1) || /\brequired\b[^>]*name="message"|name="message"[^>]*\brequired\b/.test(c1)) fail("a flag on a finished step isn't one card with their words, a reply box (our own error), Send reply, Unlock… and Close without replying (which asks first)");
  if (!/The client asked for a change/.test(card({ change_request: { at: "2026-10-27T21:55:00Z", note: "Add my office manager" } }))) fail("a change request on a finished step doesn't say \"The client asked for a change\"");
  const RP = { status: "done", client_flagged: { ...FL.client_flagged, replied_at: "2026-10-27T22:10:00Z", reply: "All good on our side." } }, c2 = card(RP);
  if (!ask(RP).replied || !/You replied/.test(c2) || !/Waiting for the client to say it's sorted/.test(c2) || !/All good on our side/.test(c2) || !/>Close it<\/button>/.test(c2) || /data-ob-ask-unanswered/.test(c2)) fail("after RGA replies the card isn't \"You replied · waiting for them to say it's sorted\" with Close it");
  // the done row wears it: orange number + Reply today, no Undo; replied → Client reads it; row 8's card shrinks to one line
  if (!/const ask = !declined && !kick2 && !callOn && !kick4Req \? admAskOf\(s\.task\) : null;/.test(A) || !/\$\{callOn \|\| ask \? "" : undoBtn\}/.test(A)
    || !/if \(ask\) return ask\.replied \? `<span class="ob-status queued is-reads">Client reads it<\/span>` : `<span class="ob-status active is-ask">Reply today<\/span>`;/.test(A)
    || !/\(ask \? `<div class="ob-done-card ob-ask-wrap">\$\{adminAskHtml\(o\.flowId, s\.task, ask\)\}<\/div>` : ""\)/.test(A)) fail("a done row the client asked about still reads Done with Undo, or draws no ask card");
  if (!/client_request: "Reply" \}/.test(A) || !/focusAskReply\(step\);/.test(A)) fail("To do's button for a client ask isn't \"Reply\" landing in the reply box");
  if (!/fetch\("\/\.netlify\/functions\/portal-reply"/.test(A) || !/if \(!await rgaConfirm\(`Send this reply to \$\{to\}\?/.test(A)) fail("Send reply doesn't go through portal-reply, or sends without asking first");
  // Chris 10-27 "?" screenshots: a closed Unlock… sat above Send reply (its hidden form's grid gap), and the opened row 8 line drew the
  // whole card again inside itself (title twice, a box in a box)
  { const AC = read("admin/admin.css");
    if (!/\.ob-unlock:not\(\[open\]\) \{ gap:0; \}/.test(AC)) fail("a closed \"Unlock for the client…\" is taller than the buttons beside it (it sits out of line)");
    if (!/\.ob-ac-mini > \.ob-gq \{ margin:0; padding:0; \}/.test(AC) || !/\.ob-ac-mini > \.ob-gq > \.ob-ac > \.ob-ac-h \{ display:none; \}/.test(AC)) fail("opening row 8's one line draws the card again inside it (title twice, a box in a box)"); }
  // Chris 10-27 "reply button doesnt work": Reply jumped to a step inside a FOLDED (finished) phase — nothing to land on
  { const rv = afn("revealStep");
    if (!/const ph = el\.closest\("\.ob-phase:not\(\.open\)"\); if \(ph\) ph\.querySelector\("\[data-ob-phase-toggle\]"\)\?\.click\(\);/.test(rv)) fail("revealStep doesn't unfold a folded phase (Reply / Open step land on nothing)");
    if (!/holdsLiveConsole\(idx\) \|\| idx\.some\(\(i\) => \{ const a = admAskOf\(steps\[i\]\.task\); return a && !a\.replied; \}\)/.test(A)) fail("a phase holding an unanswered client ask stays folded");
    if (!/&& !\(admAskOf\(steps\[i\]\.task\) && !admAskOf\(steps\[i\]\.task\)\.replied\)\)\.length;/.test(A)) fail("a phase counts a row the client asked about (unanswered) as done (\"2/2 ✓\" over \"Reply today\")"); }
  const RPl = read("netlify/functions/portal-reply.js"), UN = read("netlify/functions/admin-step-unlock.js"), CH = read("netlify/functions/portal-step-choice.js");
  if (!/\[key\]: \{ \.\.\.t0\[key\], replied_at: at, replied_by: gate\.email \|\| null, reply: message\.slice\(0, 280\) \}/.test(RPl)) fail("a reply on the step doesn't stamp the ask (admin can't show \"You replied\"; To do keeps nagging)");
  if (!/if \(!prev\.change_request && !prev\.client_flagged\) return json\(409/.test(UN) || !/if \(action !== "confirm"\) delete prev\.client_flagged;/.test(UN)) fail("RGA's Close only clears a change request — a \"something's wrong\" flag can never close");
  if (!/kind: "change", note: prev\.change_request\.note/.test(CH) || !/kind: "wrong", note: f0\.note/.test(CH)) fail("the client's That's sorted / Cancel leaves no ask_closed note for admin's row history");
}
// the To do list, RUN
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let OM; try { OM = req(`${SITE}/netlify/functions/_open-moves.js`); } catch (e) { console.error(`⚠️  _open-moves won't load: ${e.message}`); process.exit(2); }
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const mk = (t3) => OM.openMoves({ playbooks: PB, data: { tasks: { "m1.access.website": t3 } }, now: "2026-10-27T20:00:00Z" });
{ const m = mk({ status: "done", access: { confirmed_at: "x" }, client_flagged: { at: "2026-10-27T19:00:00Z", note: "Not our site" } }).find((x) => x.step_id === "m1.access.website");
  if (!m || m.owner !== "rga" || m.kind !== "client_request" || !/wrong/.test(m.what)) fail("a flag on a FINISHED step never reaches the To do list as RGA's move"); }
{ const m = mk({ status: "done", access: { confirmed_at: "x" }, change_request: { at: "2026-10-27T19:00:00Z", note: "Add my office manager" } }).find((x) => x.step_id === "m1.access.website");
  if (!m || m.owner !== "rga" || !/change request/.test(m.what) || m.days !== OM.CONFIRM_DAYS) fail("a change request isn't RGA's same-day move in the To do list"); }
{ const m = mk({ status: "done", access: { confirmed_at: "x" }, client_flagged: { at: "2026-10-27T19:00:00Z", note: "Not our site", replied_at: "2026-10-27T19:30:00Z" } }).find((x) => x.step_id === "m1.access.website");
  if (m) fail("an ask RGA already replied to stays on RGA's To do list"); }
if (F.length) { console.error(`❌ a change request is one flow — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ a change request is one flow: one Need a change? on the lock line, a panel with its own inline error (no browser popup), both choices only where a change is allowed, ONE band with their words + Cancel, no second band, \"With RGA · since\", and RGA's same-day move in the To do list even on a finished step");
