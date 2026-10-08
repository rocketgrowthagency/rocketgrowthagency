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
const fails = []; const F = (m) => fails.push(m);
const lift = (name) => { const a = admin.indexOf(`function ${name}(`); if (a < 0) return null; const b = admin.indexOf("\n}\n", a); return b < 0 ? null : admin.slice(a, b + 3); };
const stateFn = lift("kickoffState"), alertFn = lift("kickoffAlertFor");
const open2 = (admin.match(/const kickoffStep2Open = [^\n]+\n/) || [null])[0];
if (!stateFn || !alertFn || !open2) { console.error("⚠️  INDETERMINATE — kickoffState / kickoffAlertFor / kickoffStep2Open not found in admin.js"); process.exit(2); }

const NOW = Date.parse("2026-10-08T19:40:00Z");     // 12:40 PT
const ctx = {
  KICKOFF_SLOT_MIN: 30, KICKOFF_INVITE_STEP_ID: "m1.close.kickoff_invite",
  _kickoffPendingIso: new Map(), _kickoffPendingAsk: new Map(), _kickoffAskProbed: new Set(),
  state: { selectedClient: { id: "c" }, onboardingData: {} },
  kickoffStartsIn: () => "24m", kickoffWaitingOnPick: () => true,
  Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } static parse(x) { return Date.parse(x); } },
};
vm.createContext(ctx);
vm.runInContext(`${stateFn}\n${open2}\n${alertFn}\nthis.ks = kickoffState; this.open2 = kickoffStep2Open; this.al = kickoffAlertFor;`, ctx);

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
];
for (const [want, c] of CASES) {
  setCase(c);
  const st = ctx.ks("c");
  if (st.name !== want) F(`facts ${JSON.stringify(c)} gave "${st.name}", expected "${want}"`);
  const isOpen = ctx.open2(st);
  if (isOpen !== ["picked", "move", "rebook"].includes(want)) F(`step 2 open=${isOpen} in state "${want}"`);
  const al = ctx.al(st, { id: "m1.close.kickoff_invite" });
  if (["picked", "move", "rebook"].includes(want)) {
    if (!al || !/asked|picked/i.test(al.t) || /ended|record/i.test(al.t + al.s)) F(`state "${want}": the alert does not talk about the request ("${al?.t}")`);
  }
  if (want === "rebook" && !/new kickoff time/i.test(al?.t || "")) F(`a request after the call is not worded as a new time ("${al?.t}")`);
  if (want === "ended" && !/record/i.test(al?.t || "")) F("an ended call with no outcome does not ask to record it");
  if (want === "booked" && al) F("a booked call far ahead raises an alert");
}

// 4 · every surface wired to the one state
const WIRED = [
  ["Your action", /const kst = kickoffState\(askedId\);/],
  ["the attention list", /const kickAlert = kickoffAlertFor\(kickoffState\(\), next\);/],
  ["the request loader's in-place patch", /kickoffAlertFor\(kickoffState\(clientId\), null\)/],
  ["the booking card", /const fromPassed = Date\.now\(\) >= new Date\(from\.slot_start\)/],
  ["the footer status line", /if \(kickoffStep2Open\(kickoffState\(clientId\)\)\) \{ say\(""\); return; \}/],
  ["the phase count", /!\(steps\[i\]\.obj\?\.flowId === KICKOFF_INVITE_STEP_ID && kickoffStep2Open\(\)\)/],
  ["step 2's card", /const kick2 = o\.flowId === KICKOFF_INVITE_STEP_ID && kickoffStep2Open\(kst2\);/],
  ["step 4's console", /const kq = kickoffState\(\);\s*if \(kq\.name === "move" \|\| kq\.name === "rebook"\)/],
  ["step 4's active pill", /kcl && \["move", "rebook"\]\.includes\(kickoffState\(\)\.name\)/],
];
for (const [what, re] of WIRED) if (!re.test(admin)) F(`${what} no longer reads kickoffState() — it can tell its own story again`);

// 5 · no Run again on step 2
if (!/const rerunBtn = runnable && [^\n]*o\.flowId !== KICKOFF_INVITE_STEP_ID/.test(admin)) F("step 2 offers Run again — its runner books the first free slot");

// 6 · the client says the same thing
if (!/You asked for a new time/.test(portal)) F("the client's card words a request after the call as a move, unlike the admin");

console.log(`  ${CASES.length} fact combinations run · ${WIRED.length} surfaces checked for wiring`);
if (fails.length) { console.error("🔴 the kickoff can tell more than one story:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every kickoff surface reads one state, and the nine states say what they should");
