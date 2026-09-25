#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-kickoff-booking-is-honest.mjs
//
// 🔴 WHY (2026-09-24). The kickoff invite picked 10:00 two business days out and sent it BLIND —
// nothing checked whether RGA was free, so the product could book a client call on top of a real
// meeting and nobody would find out until they looked at their calendar. And the client was never
// offered a choice: their only reply was Decline in Gmail, the email negotiation step 2 exists to
// avoid. Chris: *"i want something like calendly where they pick a date and time… so they cannot
// book during a time admin is busy. for hours and days."*
//
// WHAT THIS PROTECTS — four ways the rebuild could quietly rot:
//   1. ONE SLOT ENGINE. The picker, the portal booking and the sender must agree on what "free"
//      means. A picker offering a slot the sender then refuses is worse than no picker, and this
//      codebase has already paid twice for two implementations of one idea.
//   2. NEVER BOOK BLIND AGAIN. If availability cannot be read, the sender must REFUSE — silently
//      falling back to the old fixed time restores the exact defect.
//   3. AN EXPLICIT TIME IS VERIFIED, NOT MOVED. A time a human chose must be re-checked and
//      refused if taken; quietly shifting it is worse than failing.
//   4. THE CLIENT IS NEVER TOLD "NO TIMES" WHEN WE SIMPLY COULD NOT ASK. An empty list and a
//      failed lookup look identical to them, and one of the two is a lie about our availability.
//
// exit 0 = booking is honest · 1 = it is not · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_an_absence_must_never_be_readable_as_a_value
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = (p) => path.join(SITE, p);
const FILES = {
  slots: F("netlify/functions/_kickoff-slots.js"),
  avail: F("netlify/functions/kickoff-availability.js"),
  rules: F("netlify/functions/kickoff-availability-rules.js"),
  book: F("netlify/functions/portal-book-kickoff.js"),
  send: F("netlify/functions/send-kickoff-invite.js"),
  oauth: F("netlify/functions/oauth-rga-init.js"),
  portal: F("portal/portal.js"),
  admin: F("admin/admin.js"),
};
for (const [k, p] of Object.entries(FILES)) {
  if (!fs.existsSync(p)) { console.error(`⚠️  INDETERMINATE — ${k} missing at ${p}`); process.exit(2); }
}
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, strip(fs.readFileSync(p, "utf8"))]));
const problems = [];

// ── 1. one engine, every consumer ─────────────────────────────────────────────────────────────
for (const [name, needle] of [["kickoff-availability", "freeSlots"], ["portal-book-kickoff", "isSlotFree"], ["send-kickoff-invite", "isSlotFree"]]) {
  const key = name === "kickoff-availability" ? "avail" : name === "portal-book-kickoff" ? "book" : "send";
  if (!/_kickoff-slots/.test(src[key]) || !new RegExp(`\\b${needle}\\b`).test(src[key])) {
    problems.push(`${name} does not use _kickoff-slots.js (${needle}). Every surface must decide `
      + `"is this free?" the same way, or the picker will offer times the booking refuses.`);
  }
}
// The availability rules must come from the database, not be hardcoded in a second place.
if (!/kickoff_availability/.test(src.avail) || !/kickoff_availability/.test(src.rules)) {
  problems.push(`The bookable hours are not read from workspaces.kickoff_availability. Hardcoding `
    + `them means a code deploy every time the working week changes — a setting that is a lie.`);
}

// ── 2. the sender refuses rather than booking blind ───────────────────────────────────────────
{
  const s = src.send;
  if (!/freebusy|isSlotFree|freeSlots/.test(s)) {
    problems.push(`send-kickoff-invite performs no availability check at all — it is booking blind `
      + `again, which is the original defect.`);
  }
  if (!/needsReconnect/.test(s) || !/nothing was sent|Nothing was sent/i.test(s)) {
    problems.push(`send-kickoff-invite does not refuse-and-say-so when it cannot read availability. `
      + `Falling back to the old fixed time without telling anyone is exactly the behaviour removed.`);
  }
}

// ── 3. an explicit time is verified, never silently moved ─────────────────────────────────────
{
  const s = src.send;
  // The explicit branch must REFUSE; only the default branch may reassign `start`.
  const explicitBranch = s.match(/if\s*\(\s*startIso\s*\)\s*\{[\s\S]{0,900}?\n\s{6}\}/);
  if (explicitBranch && /start\s*=\s*new Date\(open/.test(explicitBranch[0])) {
    problems.push(`send-kickoff-invite silently MOVES a time that was explicitly chosen. A human `
      + `picked it; failing loudly is correct, quietly rescheduling is not.`);
  }
  if (!/already busy at/i.test(s)) {
    problems.push(`send-kickoff-invite never tells the caller the chosen time is already busy, so a `
      + `clash is indistinguishable from any other failure.`);
  }
}

// ── 4. the portal never says "no times" when it could not ask ─────────────────────────────────
{
  const p = src.portal;
  if (!/loadKickoffSlots/.test(p)) {
    problems.push(`portal.js has no loadKickoffSlots — the picker cannot populate, and its "Loading `
      + `available times…" placeholder would show forever.`);
  }
  if (!/couldn't load available times/i.test(p)) {
    problems.push(`The portal does not distinguish "we could not load times" from "there are no `
      + `times". To a client those read identically, and one of them is false about our availability.`);
  }
  // The booking path must re-offer slots when one is taken mid-choice.
  if (!/j\.taken/.test(p)) {
    problems.push(`The portal does not handle a slot being taken between rendering and booking. `
      + `That is a normal outcome, not an error — it must refresh so the client can pick again.`);
  }
}

// ── 4a. THE PICKER'S LOADER MUST RUN AFTER ITS CARD IS IN THE DOM ────────────────────────────
// 🔴 Found on screen 2026-09-24: the card rendered "Loading available times…" and never changed.
// loadKickoffSlots finds its host with querySelector, and it was called BEFORE appendChild — so it
// found nothing, returned early, and left the placeholder up permanently. It looked exactly like a
// slow network, and no error was logged anywhere.
// 🔑 A loader that runs before its target exists is indistinguishable from one that never runs.
// → feedback_correct_is_not_the_same_as_happening
{
  const p = src.portal;
  const call = p.indexOf("loadKickoffSlots(row.client_id)");
  const append = p.indexOf("els.sections.appendChild(section)");
  if (call >= 0 && append >= 0 && call < append) {
    problems.push(`loadKickoffSlots is called BEFORE els.sections.appendChild, so its querySelector `
      + `finds no host and returns early. The picker would show "Loading available times…" forever.`);
  }
  // 🔑 ONE PLACE TO BOOK. Approved 2026-09-24: the calendar renders INSIDE the action row, the same
  // way clientInput steps render their form. The earlier version of this rule checked for a
  // bespoke "pm-kickoff-next" card — which was the very second surface Chris called out ("its
  // still in 2 places"), so the check is now the opposite: that card must NOT come back.
  if (!/clientForm === "kickoff_booking"/.test(p)) {
    problems.push(`The picker no longer renders inside the action row (no kickoff_booking branch). `
      + `A standalone card would be a second place to book, which is the confusion this replaced.`);
  }
  if (/id="kickoff-picker-/.test(p)) {
    problems.push(`A standalone kickoff card is back (id="kickoff-picker-…"). The calendar belongs `
      + `in the action row; two surfaces for one booking is what was removed.`);
  }
  // 🔴 And the banner's scroll target must EXIST. Deleting that card once broke every link to it
  // silently — the view switched and nothing scrolled.
  {
    const target = (p.match(/data-portal-scroll="([^"$]+)"/g) || [])
      .map((m) => m.replace(/.*="|"$/g, ""))
      .filter((t) => /kickoff/i.test(t));
    // 🔑 IDS ARE TEMPLATED. The row renders `id="step-row-${step.id}"`, so a literal search for
    // "step-row-m1.kickoff.call" finds nothing even though the element exists at runtime. Resolve
    // the template instead: the prefix must be rendered, AND the suffix must be a real step id.
    // Asserting the literal would have failed working code — the same shape-vs-outcome mistake
    // that has bitten this session repeatedly.
    const stepIds = new Set([...(JSON.parse(fs.readFileSync(F("data/playbooks/playbooks.json"), "utf8")).month1 || [])].map((x) => x.id));
    for (const t of target) {
      const m = t.match(/^step-row-(.+)$/);
      const prefixRendered = /id="step-row-\$\{/.test(p);
      if (m && prefixRendered && stepIds.has(m[1])) continue;          // resolves to a real element
      if (new RegExp(`id="${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(p)) continue;  // literal id
      problems.push(`The kickoff banner scrolls to "${t}", but nothing in portal.js renders that `
        + `id — the button switches tab and then does nothing, which reads as dead.`);
    }
  }
}

// ── 4b. OUR LEDGER IS THE SOURCE OF TRUTH, AND ITS LIFECYCLE IS COMPLETE ──────────────────────
// 🔴 Chris chose to own the scheduling rather than depend on a Google read: *"i want it built into
// the portal."* That makes `kickoff_slot_holds` the thing that stops a slot being sold twice, so
// every edge of its lifecycle has to hold or a slot silently disappears forever.
{
  const slots = src.slots, send = src.send, cancel = strip(fs.readFileSync(F("netlify/functions/cancel-kickoff-invite.js"), "utf8"));

  // 🔑 ASSERT THE CALL, NOT THE WORD. A first version checked that identifiers merely APPEARED, and
  // mutation-testing walked straight through it: renaming a function's DEFINITION leaves its name
  // at every call site, and `kickoff_slot_holds_DISABLED` still matches /kickoff_slot_holds/.
  // Four of five mutations passed a "green" gate. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
  // 🔴 SKIP THE PARAMETER LIST. `freeSlots(accessToken, { rules }) ` has a DESTRUCTURING brace in
  // its parameters — starting the brace count at the first `{` captured the parameter object and
  // returned an almost-empty body, so the gate reported working code as unwired. Walk the parens
  // to the end of the signature first, then take the body brace.
  const bodyOf = (text, name) => {
    const at = text.indexOf(`function ${name}`);
    if (at < 0) return "";
    let i = text.indexOf("(", at);
    if (i < 0) return "";
    let paren = 0;
    for (; i < text.length; i++) {
      if (text[i] === "(") paren++;
      else if (text[i] === ")") { paren--; if (!paren) { i++; break; } }
    }
    const open = text.indexOf("{", i);
    if (open < 0) return "";
    let d = 0;
    for (let k = open; k < text.length; k++) {
      if (text[k] === "{") d++;
      else if (text[k] === "}") { d--; if (!d) return text.slice(at, k + 1); }
    }
    return "";
  };

  // The slot engine must CALL the ledger read, not merely define it.
  const freeSlotsBody = bodyOf(slots, "freeSlots");
  const isFreeBody = bodyOf(slots, "isSlotFree");
  if (!/ourBusyIntervals\s*\(/.test(freeSlotsBody) || !/ourBusyIntervals\s*\(/.test(isFreeBody)) {
    problems.push(`freeSlots/isSlotFree do not CALL the booking ledger. Availability would come only `
      + `from Google — the dependency the portal build exists to remove.`);
  }
  if (!/if \(accessToken\)/.test(freeSlotsBody)) {
    problems.push(`The slot engine does not treat Google as OPTIONAL. Without a token it must still `
      + `answer from our own ledger, or the picker dies whenever the scope is missing.`);
  }

  // A booking must PERSIST — the success path must CALL confirmSlotHold.
  if (!/confirmSlotHold\s*\(/.test(send) || !bodyOf(send, "confirmSlotHold")) {
    problems.push(`send-kickoff-invite does not promote its hold to a booking. If the hold is simply `
      + `deleted on success the slot becomes bookable again the moment the call is confirmed.`);
  }
  if (/await releaseSlotHold\([^)]*slotHeld\);\s*\n\s*\/\/ Booked/.test(send)) {
    problems.push(`The success path RELEASES the hold instead of confirming it — that frees a slot `
      + `that has just been sold.`);
  }

  // Cancelling must actually DELETE from the ledger table, by its real name.
  if (!/kickoff_slot_holds\?/.test(cancel) || !/method:\s*"DELETE"/.test(cancel)) {
    problems.push(`cancel-kickoff-invite does not DELETE the slot from kickoff_slot_holds. A cancelled `
      + `call would block that time permanently — a meeting nobody has that nobody else can book, `
      + `with nothing on screen to explain it.`);
  }

  // A stale hold must be filtered by AGE, not merely have a constant named after one.
  const ledgerBody = bodyOf(slots, "ourBusyIntervals");
  if (!/HOLD_TTL_MS/.test(ledgerBody) || !/created_at/.test(ledgerBody)) {
    problems.push(`The ledger read does not filter holds by age. A request that dies between taking `
      + `the mutex and booking would block that slot for good.`);
  }

  // And a failed ledger read must never read as "nothing is booked".
  if (!/throw new Error\(`Could not read the booking ledger/.test(slots)) {
    problems.push(`A failed ledger read does not throw. Returning an empty busy list would offer `
      + `slots that are already sold.`);
  }
}

// ── 5. the scope that makes any of it possible ────────────────────────────────────────────────
if (!/calendar\.events\.freebusy/.test(src.oauth)) {
  problems.push(`oauth-rga-init no longer requests calendar.events.freebusy, so a fresh connection `
    + `cannot read availability and every slot lookup will 403.`);
}
// 🔑 And it must stay NARROW. calendar.readonly reads every event; calendar can delete them.
if (/auth\/calendar["'\s]|calendar\.readonly/.test(src.oauth)) {
  problems.push(`oauth-rga-init asks for a broader calendar scope than the question needs. `
    + `freebusy answers "is this slot taken?" without reading titles, guests or details.`);
}

// ── 6. the admin can actually change the rules ────────────────────────────────────────────────
if (!/data-kickoff-hours/.test(src.admin) || !/openKickoffHoursDialog/.test(src.admin)) {
  problems.push(`The admin has no control for the bookable hours, so the rules could only be changed `
    + `in the database — which means they will not be changed.`);
}
{
  const at = src.admin.indexOf("data-kickoff-hours");
  const wired = /addEventListener\("click",\s*\(\)\s*=>\s*openKickoffHoursDialog/.test(src.admin);
  if (at >= 0 && !wired) {
    problems.push(`The "Set bookable hours" button has no dispatcher — a control without one is the `
      + `deadest a button can be.`);
  }
}

if (problems.length) {
  console.error("🔴 KICKOFF BOOKING IS NOT HONEST\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  netlify/functions/_kickoff-slots.js · send-kickoff-invite.js · portal-book-kickoff.js · portal/portal.js");
  process.exit(1);
}

console.log("✅ kickoff booking is honest");
console.log("   one slot engine behind the picker, the portal booking and the sender");
console.log("   the sender refuses rather than booking blind, and never moves a chosen time silently");
console.log("   the portal tells 'could not check' apart from 'no times'");
console.log("   the OAuth scope is present and stays narrow (freebusy, not readonly)");
console.log("   the bookable hours are editable in the admin and stored per workspace");
