#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-kickoff-reads-one-state.mjs
//
// 🔴 WHY (Chris, 2026-10-08, 12:37): "i want you to analyze each part a kickoff call is mentioned in
// admin and make sure they all align and are correct… this has been so much time on this." At 12:34
// eight surfaces told three stories about one call. Approved: reports/mockups/kickoff_everywhere_v1.html.
//
// HOLDS:
//   1. kickoffState() returns the right one of nine states for each combination of the four facts
//      (booking · request · outcome · recap), run for real against a frozen clock
//   2. the alert for every request state talks about the REQUEST — never "ended" / "record"
//   3. step 2 is open exactly for picked / move / rebook
//   4. every admin surface is WIRED to the one state: Your action, the alert (both producers), the
//      booking card, the footer, the phase count, step 2, step 4's pill and console
//   5. no "Run again" on step 2
//   6. the client card words a request after the call as a new time, like the admin
//
// exit 0 = one state, every surface · 1 = a surface decides on its own · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); } };
const admin = read("admin/admin.js"), portal = read("portal/portal.js");
const cancelFn = read("netlify/functions/cancel-kickoff-invite.js");
const fails = []; const F = (m) => fails.push(m);
const lift = (name) => { const a = admin.indexOf(`function ${name}(`); if (a < 0) return null; const b = admin.indexOf("\n}\n", a); return b < 0 ? null : admin.slice(a, b + 3); };
const stateFn = lift("kickoffState"), alertFn = lift("kickoffAlertFor"), askFn = lift("kickoffAskCopy"), openFn = lift("kickoffCallOpen");
const open2 = (admin.match(/const kickoffStep2Open = [^\n]+\n/) || [null])[0];
if (!stateFn || !alertFn || !open2 || !askFn || !openFn) { console.error("⚠️  INDETERMINATE — kickoffState / kickoffAlertFor / kickoffStep2Open not found in admin.js"); process.exit(2); }

const NOW = Date.parse("2026-10-08T19:40:00Z");     // 12:40 PT
const ctx = {
  KICKOFF_SLOT_MIN: 30, KICKOFF_INVITE_STEP_ID: "m1.close.kickoff_invite",
  _kickoffPendingIso: new Map(), _kickoffPendingAsk: new Map(), _kickoffAskProbed: new Set(),
  state: { selectedClient: { id: "c" }, onboardingData: {} },
  kickoffStartsIn: () => "24m", kickoffWaitingOnPick: () => true,
  Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } static parse(x) { return Date.parse(x); } },
};
// 🔴🔴 A NAME THE BOX SUPPLIES MUST EXIST IN THE FILE (live 2026-10-08). This box defined
// KICKOFF_INVITE_STEP_ID, the real file had it only as a LOCAL inside one function — every check
// here passed while the onboarding checklist threw on load in production. So each constant and map
// handed to the sandbox must be declared at MODULE scope (column 0) in admin.js.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie
for (const n of ["KICKOFF_SLOT_MIN", "KICKOFF_INVITE_STEP_ID", "_kickoffPendingIso", "_kickoffPendingAsk", "_kickoffAskProbed"]) {
  if (!new RegExp(`^(const|let|var) ${n}\\b`, "m").test(admin)) F(`${n} is supplied by this gate's sandbox but is not declared at module scope in admin.js — the real page throws ReferenceError where this gate passes`);
}
vm.createContext(ctx);
vm.runInContext(`${openFn}\n${askFn}\n${stateFn}\n${open2}\n${alertFn}\nthis.ks = kickoffState; this.open2 = kickoffStep2Open; this.al = kickoffAlertFor;`, ctx);

const iso = (minsFromNow) => new Date(NOW + minsFromNow * 60000).toISOString();
const setCase = ({ booking, request, outcome, recap }) => {
  ctx.state.onboardingData = { kickoff_invite: booking == null ? {} : { event_id: "e", start: iso(booking), call_outcome: outcome || undefined, recap_sent_at: recap || undefined } };
  ctx._kickoffPendingIso.clear(); ctx._kickoffPendingAsk.clear();
  if (request != null) { ctx._kickoffPendingIso.set("c", iso(request)); ctx._kickoffPendingAsk.set("c", "the asked time"); }
};
const CASES = [
  ["notPicked", {}],
  ["picked", { request: 60 * 24 }],
  ["booked", { booking: 60 * 24 }],
  ["soon", { booking: 20 }],
  ["live", { booking: -10 }],
  ["ended", { booking: -70 }],
  ["held", { booking: -70, outcome: "held" }],
  ["move", { booking: 60 * 24, request: 60 * 48 }],
  ["rebook", { booking: -70, request: 50 }],
  ["notPicked", { booking: -70, outcome: "no_show" }],        // a no-show released the booking
  // 🔒 kickoff_request_time_passed_v1 — a request can only be confirmed before its START
  ["passed", { request: -5 }],                                // first pick, its time went by
  ["passed", { booking: -70, request: -5 }],                  // rebook whose new time went by (the live case)
  ["booked", { booking: 60 * 24, request: -5 }],              // a move that lapsed under a call that stands
  ["picked", { request: 50 }],                                // inside the last 2 hours → urgent
];
for (const [want, c] of CASES) {
  setCase(c);
  const st = ctx.ks("c");
  if (st.name !== want) F(`facts ${JSON.stringify(c)} gave "${st.name}", expected "${want}"`);
  const isOpen = ctx.open2(st);
  if (isOpen !== ["picked", "move", "rebook", "passed"].includes(want)) F(`step 2 open=${isOpen} in state "${want}"`);
  const al = ctx.al(st, { id: "m1.close.kickoff_invite" });
  if (["picked", "move", "rebook"].includes(want)) {
    if (!al || !/asked|picked/i.test(al.t) || /ended|record/i.test(al.t + al.s)) F(`state "${want}": the alert does not talk about the request ("${al?.t}")`);
  }
  if (want === "rebook" && !/new kickoff time/i.test(al?.t || "")) F(`a request after the call is not worded as a new time ("${al?.t}")`);
  if (want === "ended" && !/record/i.test(al?.t || "")) F("an ended call with no outcome does not ask to record it");
  if (want === "booked" && al) F("a booked call far ahead raises an alert");
  if (want === "passed" && (!al || !/passed unconfirmed/i.test(al.t) || al.k !== "c" || /approve/i.test(al.t + al.s))) F(`a passed request's alert is not the red "passed unconfirmed" line ("${al?.t}", k=${al?.k})`);
  if (want === "booked" && c.request != null && (st.request || !st.lapsed)) F("a move that lapsed under a standing booking still reads as an open request");
  if (want === "picked" && c.request === 50 && (!st.urgent || al?.k !== "c")) F("a request inside its last 2 hours is not urgent / red");
  if (want === "picked" && c.request === 60 * 24 && st.urgent) F("a request a day out reads as urgent");
}

// 4 · every surface wired to the one state
const WIRED = [
  ["Your action", /const kst = kickoffState\(askedId\);/],
  ["the attention list", /const kickAlert = kickoffAlertFor\(kickoffState\(\), next\);/],
  ["the request loader's in-place patch", /kickoffAlertFor\(kickoffState\(clientId\), null\)/],
  ["the booking card", /const fromPassed = Date\.now\(\) >= new Date\(from\.slot_start\)/],
  ["the footer status line", /if \(kickoffStep2Open\(kickoffState\(clientId\)\)\) \{ say\(""\); return; \}/],
  ["the phase count", /&& !kickoffReopened\(steps\[i\]\.obj\?\.flowId, kst\)\)\.length;/],
  ["the checklist head", /s\.uiState === "done" && !kickoffReopened\(s\.obj\?\.flowId, kstHead\)/],
  ["\"Month 1 is complete\" only when there is no next step", /\} else if \(!next && !blocked\.length && !unverified\.length\) \{\s*(\/\/[^\n]*\n\s*)*alerts\.push\(\{ k: "i", t: "Month 1 is complete"/],
  ["the header's Onboarding N% pill", /seq\.filter\(\(s\) => s\.uiState === "done" && !kickoffReopened\(s\.obj\?\.flowId, kstPill\)\)/],
  ["the checklist head's filtered views", /steps\[i\]\.uiState === "done" && !kickoffReopened\(steps\[i\]\.obj\?\.flowId, kstHead\)/],
  ["step 2's card", /const kick2 = o\.flowId === KICKOFF_INVITE_STEP_ID && kickoffStep2Open\(kst2\);/],
  ["step 4's console waits on step 2", /const kq = kickoffState\(\);[\s\S]{0,600}?if \(kickoffReopened\(o\.flowId, kq\)\) return kickoffStep4WaitsHtml\(kq\);/],
  ["step 4's active row + pill wait (grey)", /const step4Waits = \/kickoff\\\.call\$\/\.test\(o\.flowId \|\| ""\) && kickoffReopened\(o\.flowId\);[\s\S]{0,200}?class="ob-step \$\{step4Waits \? "waits" : "active"\}/],
  ["step 4's done row waits (grey, queued marker, Waits on step N)", /class="ob-step \$\{kick2 \? "active" : kick4Req \? "waits"[\s\S]{0,1600}?if \(kick4Req\) return `<span class="ob-status queued">\$\{escapeHtml\(kickoffStep4WaitsLabel\(\)\)\}/],
  ["the reopened predicate covers step 2 and step 4", /function kickoffReopened\(flowId, st = kickoffState\(\)\) \{\s*if \(flowId === KICKOFF_INVITE_STEP_ID\) return kickoffStep2Open\(st\);\s*if \(\/kickoff\\\.call\$\/\.test\(flowId \|\| ""\)\) return st\.name === "move" \|\| st\.name === "rebook" \|\| st\.name === "passed";/],
];
for (const [what, re] of WIRED) if (!re.test(admin)) F(`${what} no longer reads kickoffState() — it can tell its own story again`);

// 4b · the passed state on every admin surface + the server (kickoff_request_time_passed_v1)
const SITE_FN = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { return ""; } };
const inviteFn = SITE_FN("netlify/functions/send-kickoff-invite.js"), reqFn = SITE_FN("netlify/functions/kickoff-requests.js");
const PASSED = [
  ["Your action's passed card", /if \(kst0 && kst0\.name === "passed"\) \{[\s\S]{0,900}?title: "Their requested kickoff time passed unconfirmed"[\s\S]{0,700}?pickForThem:[\s\S]{0,300}?label: "Send the client a note…"/, admin],
  ["Your action's 2-hour warning", /title: kst\.urgent && askedIso\s*\? `Confirm before \$\{/, admin],
  ["the request card's passed variant (no Approve)", /if \(Date\.now\(\) >= new Date\(q\.slot_start\)\.getTime\(\)\) \{[\s\S]{0,2400}?Request passed[\s\S]{0,2400}?Pick a time for the client[\s\S]{0,400}?Send the client a note…[\s\S]{0,400}?Clear the request<\/button>\s*<\/div><\/div>`;\s*\}/, admin],
  ["a lapsed move leaves the request list under a standing booking", /const lapsedMoves = standing \?/, admin],
  ["the admin refuses to confirm a passed time", /if \(gone && action === "confirm"\) \{ setBanner\(/, admin],
  ["step 2's passed band", /kick2 && kst2\.name === "passed"[\s\S]{0,300}?Waiting on a new pick/, admin],
  ["step 4 says ONE line, with the step number from the page", /function kickoffStep4WaitsHtml\([\s\S]{0,300}?obNumberOf\(KICKOFF_INVITE_STEP_ID, "month1"\)[\s\S]{0,700}?data-ob-jump=/, admin],
  ["the server never books a passed time", /Date\.parse\(startIso\) <= Date\.now\(\)\) \{\s*return jsonRes\(409/, inviteFn],
  ["the server never confirms a passed request", /if \(Date\.parse\(startIso\) <= Date\.now\(\)\) \{\s*return jsonRes\(409/, reqFn],
  ["a booking clears the client's other open requests", /status=eq\.requested&slot_start=neq\./, inviteFn],
  ["the client banner: Pick a new kickoff time", /if \(requested && phase\.requestPassed && !phase\.bookingStands\) \{[\s\S]{0,700}?title: "Pick a new kickoff time"/, portal],
  ["the client card: Your turn + Passed + Pick a new time", /if \(!confirmed && ph\.requestPassed\) \{[\s\S]{0,300}?>Passed<\/span>[\s\S]{0,500}?>Pick a new time<\/button>/, portal],
  ["the client pill flips to Your turn", /: reqPassed \? \{ cls: "you", text: "Your turn" \}/, portal],
  ["a request lapses at its start, not its end", /const requestPassed = pending && Number\.isFinite\(rTime\) && t >= rTime;/, portal],
  // 🔒 client_pick_after_time_passed_v1 — "Pick a new time" over a passed time (Chris 10-08 4:34 PM)
  ["the picker keeps the standing time (the pill stays Your turn)", /if \(standing\) _kickoffPicking\.add\(clientId\); else _kickoffPicking\.delete\(clientId\);[\s\S]{0,600}?if \(standing\) _kickoffWhen\.set\(clientId, \{\s*startMs: new Date\(standing\.start\)\.getTime\(\)/, portal],
  ["a passed standing time is never put in the slot list", /if \(standing && !kickoffStandingPassed\(standing\)\) \{\s*const ms = new Date\(standing\.start\)/, portal],
  ["a passed standing time is never marked on the calendar", /const isMine = standing && !kickoffStandingPassed\(standing\) && keyOf/, portal],
  ["a passed standing time has no Keep control", /if \(kickoffStandingPassed\(standing\)\) return booked\s*\?\s*`<div class="kc-past">[^`]*has passed\.[^`]*`\s*:\s*`<div class="kc-past">[^`]*not confirmed, so it's not on the calendar[^`]*`;/, portal],
  // 🔒 client_pick_and_cancel_v1 — a request can be cancelled; the picker over a passed time has a Cancel
  ["the requested card offers Cancel this request", />Pick a different time<\/button>\s*\$\{[^}]*\}\s*<button type="button" class="pm-amend is-release" data-kickoff-withdraw=[^>]*>Cancel this request<\/button>/, portal],
  ["the withdraw handler calls the request path", /closest\("\[data-kickoff-withdraw\]"\)[\s\S]{0,2500}?what: "request"/, portal],
  ["the passed line carries a Cancel that closes the picker", /const closeBtn = `[^`]*data-kickoff-keep=[^`]*>Cancel<\/button>`;/, portal],
  ["sending a time closes the picker (the lede follows)", /_kickoffWhen\.delete\(clientId\);[\s\S]{0,400}?_kickoffPicking\.delete\(clientId\);\s*markKickoffWaitingOnRga\(clientId\);/, portal],
  ["the server withdraws only the owner's requested holds", /if \(body\.what === "request"\) \{\s*if \(!byClient\) return jsonRes\(403[\s\S]{0,400}?&status=eq\.requested`/, cancelFn],
  ["the server reads the withdrawal back", /const left = await fetch\(`\$\{holdsUrl\}&select=slot_start`[\s\S]{0,200}?if \(!Array\.isArray\(left\) \|\| left\.length\) return jsonRes\(500/, cancelFn],
  ["the picker lede over a passed time", /pickingPassed\s*\?\s*"Pick any open time below\. We'll confirm it and email you the calendar invite\."/, portal],
];
if (/>Keep the \$\{escapeHtml\(hourOnly\(from\.slot_start\)\)\} record</.test(admin)) F("the request card offers to KEEP a call whose time passed — nothing is left to keep (Chris 10-08 5:01 PM)");
if (!/if \(fromPassed\) \{[\s\S]{0,2600}?data-change-kickoff-time=[^>]*>Pick a different time<\/button>/.test(admin)) F("a rebook request card has no Pick a different time");
for (const [what, re, src] of PASSED) if (!re.test(src)) F(`${what} is missing — the passed state can tell its own story again`);
// 🔴 the promises nothing keeps must not come back (Chris's 2:04 PM screenshot)
for (const bad of ["We'll email you to sort a new one", "we'll confirm a new one with you today"]) {
  const code = portal.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  if (code.includes(bad)) F(`the client portal still promises "${bad}" — nothing sends that`);
}

// 4c · steps 2, 3 and 4 share ONE phase card (approved client_sequence_and_kickoff_v1)
if (!/const obGroupOf = \(flowId\) => flowId === "m1\.close\.kickoff_invite" \? "kickoff"/.test(admin)) F("step 2 is grouped away from the kickoff phase again — booking and the call read as unrelated cards");
if (!/\{ key: "kickoff",\s+name: "The kickoff call", sub: "Book it · record check · run it"/.test(admin)) F("the kickoff phase no longer names all three of its steps");

// 5 · no Run again on step 2
if (!/const rerunBtn = runnable && [^\n]*o\.flowId !== KICKOFF_INVITE_STEP_ID/.test(admin)) F("step 2 offers Run again — its runner books the first free slot");

// 6 · the client says the same thing
if (!/You asked for a new time/.test(portal)) F("the client's card words a request after the call as a move, unlike the admin");

console.log(`  ${CASES.length} fact combinations run · ${WIRED.length} surfaces checked for wiring`);
if (fails.length) { console.error("🔴 the kickoff can tell more than one story:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every kickoff surface reads one state, and the nine states say what they should");
