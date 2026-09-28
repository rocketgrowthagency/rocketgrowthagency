// check-the-kickoff-call-fits-its-slot.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CALL IS 30 MINUTES AND THE SCRIPT IS 27. Chris, 2026-09-28: "must be in 30 min too so take
// time into account." Approved: reports/mockups/admin_kickoff_call_full_v1.html
//
// Everything about the console's clock is arithmetic, so this RUNS it. A gate that read the agenda
// and checked the minutes add up would pass a cut planner that offers to cut a protected section,
// or one whose suggestions do not actually cover the overrun.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "admin", "admin.js");
const pass = [], fail = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — admin.js not found."); process.exit(2); }
const code = fs.readFileSync(JS, "utf8");

const grab = (re, what) => {
  const m = code.match(re);
  if (!m) { fail.push(`admin/admin.js — ${what} is gone.`); return ""; }
  return m[0];
};
const agenda = grab(/const KICKOFF_AGENDA = \[[\s\S]*?KICKOFF_BUFFER_MIN = [^;]+;/, "the agenda and its budget");
const clock = grab(/function kickoffCallClock\(idx\) \{[\s\S]*?\n\}/, "kickoffCallClock()");
if (fail.length) { for (const f of fail) console.error(`   • ${f}`); process.exit(1); }

const sandbox = { state: {}, Date, Math, Number, String, Object, Array, console };
vm.createContext(sandbox);
// 🔑 A `const` inside runInContext is LEXICAL and never lands on the sandbox object, so reading
// them off `sandbox` returns undefined — which looks exactly like the code having been deleted.
// Hand them out explicitly instead of guessing at scope.
const EXPORT = "\nglobalThis.__kc = { KICKOFF_AGENDA, KICKOFF_SLOT_MIN, KICKOFF_BUFFER_MIN, kickoffCallClock };";
try { vm.runInContext(`${agenda}\n${clock}${EXPORT}`, sandbox, { timeout: 4000 }); }
catch (e) { console.error(`⚠️  INDETERMINATE — could not execute the clock: ${e.message}`); process.exit(2); }

const { KICKOFF_AGENDA, KICKOFF_SLOT_MIN, KICKOFF_BUFFER_MIN } = sandbox.__kc;

// ── 1. THE BUDGET FITS, AND THE SLACK IS WHAT IS LEFT OVER ─────────────────────────────────────
const content = KICKOFF_AGENDA.reduce((n, a) => n + a.m, 0);
if (content > KICKOFF_SLOT_MIN) fail.push(`the script is ${content} min and the slot is ${KICKOFF_SLOT_MIN} — it cannot fit.`);
else pass.push(`the script is ${content} min in a ${KICKOFF_SLOT_MIN} min slot`);
if (KICKOFF_BUFFER_MIN !== KICKOFF_SLOT_MIN - content)
  fail.push(`the buffer says ${KICKOFF_BUFFER_MIN} min but the slot leaves ${KICKOFF_SLOT_MIN - content} — a hand-kept number has drifted.`);
else pass.push(`the buffer is derived (${KICKOFF_BUFFER_MIN} min), not typed`);

// ── 2. THE START MINUTES ARE CUMULATIVE, NOT TYPED TWICE ───────────────────────────────────────
let t = 0, drift = 0;
for (const a of KICKOFF_AGENDA) { if (a.at !== t) drift++; t += a.m; }
if (drift) fail.push(`${drift} section(s) start at a minute that does not follow from the budget.`);
else pass.push("every section's start minute follows from the one before");

// ── 3. THE TWO SECTIONS THAT PRODUCE SOMETHING ARE PROTECTED ───────────────────────────────────
// 🔴 "What I need from you" is the only section that produces artifacts the work is blocked on, and
// the close is where commitments get read back. If either becomes cuttable the call can still run
// to time while doing nothing. That is the failure this whole design exists to prevent.
for (const title of ["What I need from you", "Close + action items"]) {
  const a = KICKOFF_AGENDA.find((x) => x.t === title);
  if (!a) fail.push(`the "${title}" section is gone from the agenda.`);
  else if (!a.protected) fail.push(`"${title}" is no longer protected — the cut planner may now offer it.`);
  else pass.push(`"${title}" is protected`);
}

// ── 4. RUN THE PLANNER: BEHIND SCHEDULE, IT NAMES A CUT AND NEVER A PROTECTED ONE ──────────────
const at = (minsIn, idx) => {
  sandbox.state.onboardingData = { kickoff_invite: { event_id: "e", start: new Date(Date.now() - minsIn * 60000).toISOString() } };
  return sandbox.__kc.kickoffCallClock(idx);
};
const onTime = at(13, 3);
if (onTime.behind) fail.push(`on schedule at 13 min on section 4, the clock reports ${onTime.behind} min behind.`);
else pass.push("on schedule, it says so and offers nothing");

// Stuck on "What we'll do" (index 2) at 22.7 min — the mockup's worked example.
const late = at(22.7, 2);
if (!late.behind) fail.push("9 minutes over on section 3, the clock does not report being behind.");
else pass.push(`behind schedule, it reports ${late.behind} min over`);
if (!late.plan.length) fail.push("behind schedule with cuttable sections ahead, it offers no cut.");
else pass.push(`it names ${late.plan.length} cut(s): ${late.plan.map((p) => p.title).join(", ")}`);
const offeredProtected = late.plan.filter((p) => (KICKOFF_AGENDA[p.idx] || {}).protected);
if (offeredProtected.length) fail.push(`the planner offered to cut a PROTECTED section: ${offeredProtected.map((p) => p.title).join(", ")}.`);
else pass.push("no protected section is ever offered as a cut");
for (const p of late.plan) {
  if (p.to >= p.from) fail.push(`the cut for "${p.title}" saves nothing (${p.from} → ${p.to}).`);
}

// ── 5. A PLAN THAT CANNOT COVER THE OVERRUN MUST SAY SO ────────────────────────────────────────
// 🔴 Otherwise the pane implies that taking the cuts fixes it, and Chris finds out at minute 30.
const hopeless = at(27, 2);
if (hopeless.behind && hopeless.planCovers && hopeless.plan.reduce((n, p) => n + p.saves, 0) < hopeless.behind)
  fail.push("planCovers is true while the offered cuts do not cover the overrun.");
else pass.push("a plan that cannot cover the overrun reports that honestly");

// ── 6. THE PHASES ARE REAL, INCLUDING BEFORE THE CALL ──────────────────────────────────────────
const before = at(-5, 0);
if (before.phase !== "pre") fail.push(`five minutes before the call the phase is "${before.phase}", not "pre" — the T-5 pane never shows.`);
else pass.push("five minutes before, it is in the pre-call phase");
const after = at(KICKOFF_SLOT_MIN + 5, 5);
if (after.phase !== "after") fail.push(`five minutes past the slot the phase is "${after.phase}", not "after".`);
else pass.push("past the slot, the call is over");

for (const p of pass) console.log(`  ✅ ${p}`);
if (fail.length) {
  console.error(`\n🔴 FAIL — ${fail.length} problem(s) with the call clock:`);
  for (const f of fail) console.error(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ the kickoff call fits its slot, and the cut it offers is never one that matters (${pass.length} checks).`);
