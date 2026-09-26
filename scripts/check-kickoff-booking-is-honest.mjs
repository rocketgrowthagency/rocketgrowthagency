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


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PICKER MUST SAY WHEN IT IS BLIND TO RGA'S OWN CALENDAR.
//
// Two sources decide whether a slot greys out: OUR ledger (always on) and Google free/busy (needs
// the `calendar.events.freebusy` scope). Without the scope a client can book straight over a real
// meeting — and for its first day `kickoff-availability` computed `seesExternalCalendar` and NO
// SURFACE READ IT. The fact was right there and discarded.
// → feedback_a_capability_nobody_calls_looks_finished
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const avail = strip(fs.readFileSync(F("netlify/functions/kickoff-availability.js"), "utf8"));
  const adminJs = strip(fs.readFileSync(F("admin/admin.js"), "utf8"));
  if (!/seesExternalCalendar/.test(avail)) {
    problems.push("kickoff-availability no longer reports seesExternalCalendar — nothing can tell whether the picker is blind to RGA's own calendar");
  } else if (!/seesExternalCalendar/.test(adminJs)) {
    problems.push("the admin never reads seesExternalCalendar — a client could book over a real meeting and no screen would say so");
  }
  // 🔴🔴 AND THE LOADER MUST ACTUALLY RUN. 2026-09-25: every assertion below passed while
  // `loadKickoffRequests` was never called on a client Overview — `renderClientCockpit` ran its
  // querySelectorAll before the async `renderPhase0` had written `#kickoffRequests`, so it matched
  // nothing. The request list AND this warning were invisible, and the source looked perfect.
  // 🔑 The function that RENDERS the host must also FILL it; a caller that already ran cannot.
  // → feedback_poll_for_what_the_screen_renders
  {
    const phase0 = adminJs.slice(adminJs.indexOf("async function renderPhase0"));
    const body = phase0.slice(0, phase0.indexOf("\n}"));
    if (body && !/loadKickoffRequests\s*\(/.test(body)) {
      problems.push("renderPhase0 writes #kickoffRequests but never loads it — the request list and the blind-calendar warning would both be invisible while the source looked correct");
    }
  }

  // 🔑 A warning with no way to fix it is a complaint. The button must exist AND be dispatched.
  if (/seesExternalCalendar/.test(adminJs)) {
    // 🔴 THE RENDERED BUTTON, NOT THE SELECTOR. A bare /data-kickoff-grant-freebusy/ also matches
    // the listener's own `closest("[data-kickoff-grant-freebusy]")`, so deleting the button left the
    // check green — the same check-the-call-not-the-declaration trap as every other time. The markup
    // form is followed by `>` or a space; the selector form is followed by `]`.
    if (!/data-kickoff-grant-freebusy(?!\])/.test(adminJs)) {
      problems.push("the blind-calendar warning offers no way to grant the scope — it would state a problem and leave no action");
    } else if (!/closest\("\[data-kickoff-grant-freebusy\]"\)/.test(adminJs)) {
      problems.push("nothing listens for data-kickoff-grant-freebusy — the button would render and do nothing");
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PICKER SHOWS THE CLIENT'S ZONE, AND THE LABEL MUST NOT BE ABLE TO CONTRADICT IT.
//
// Chris, 2026-09-25: *"lets also make sure if cleint address is eastern it swtiches to match their
// time zone."* The server already resolves it from `primary_market` — but the PORTAL formatted
// every time with `undefined`, which means the BROWSER's zone. So the buttons rendered in wherever
// the laptop was while the chip read "America/Los Angeles", and the two could disagree.
//
// 🔑 Grouping is the quieter half: keying days off the browser's calendar date can file a late slot
// under the wrong day, lighting up a date that holds nothing the client expects.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const portal = src.portal || strip(fs.readFileSync(F("portal/portal.js"), "utf8"));
  const i = portal.indexOf("function renderKickoffCalendar");
  const body = i === -1 ? "" : portal.slice(i, portal.indexOf("\n}", i));
  if (!body) {
    problems.push("renderKickoffCalendar is gone — this timezone check is not reading anything");
  } else {
    // 🔴 SCOPED TO REAL INSTANTS. The month heading is built from `new Date(year, month, 1)` — a
    // SYNTHETIC local date with no instant behind it, and forcing a zone onto that would shift it
    // into the previous month for any zone behind the browser. The rule is about slot times, which
    // are real instants parsed from ISO strings.
    // 🔑 The gate's first version flagged that heading and would have had me "fix" correct code.
    for (const call of body.match(/new Date\([^)]*\.start[^)]*\)\.toLocale[A-Za-z]*\([^)]*\)/g) || []) {
      if (!/timeZone/.test(call)) {
        problems.push(`a slot time is formatted without a timeZone (${call.slice(0, 52)}…) — it would render in the BROWSER's zone while the chip names the client's`);
        break;
      }
    }
    // …and the helpers the slots actually go through must carry one.
    for (const helper of ["timeIn", "dayIn"]) {
      const h = body.match(new RegExp(`const ${helper} = [^;]*;`));
      if (!h) problems.push(`${helper} is gone — slot times would fall back to ad-hoc formatting`);
      else if (!/timeZone/.test(h[0])) problems.push(`${helper} formats without a timeZone — slot times would render in the browser's zone`);
    }
    // 🔴 `keyOf` SPECIFICALLY. The first version asked whether a timeZone appeared ANYWHERE in the
    // function, so `timeIn` still having one covered for a `keyOf` that had lost it — the day grid
    // could go back to the browser's calendar and the check stayed green.
    const key = body.match(/const keyOf = [\s\S]*?;\n/);
    if (!key) problems.push("keyOf is gone — the day grid has no defined grouping");
    else if (!/timeZone/.test(key[0])) {
      problems.push("the day grid is keyed without a timeZone — a late slot can be filed under the wrong date, lighting up a day that holds nothing");
    }
  }
}


// 🔴 THE ECHOED RULES MUST BE RENDERED. `kickoff-availability` returns `rules` with a comment saying
// exactly why — "so the picker can say Mon–Fri, 9am–4pm rather than leaving the client to infer the
// rules from the gaps" — and for its whole life the portal read it ZERO times. A grid of grey
// numbers with no stated window leaves a client guessing whether the product is broken, which is
// the question Chris asked out loud: *"why is today not selected?"*
// → feedback_a_capability_nobody_calls_looks_finished
{
  const avail2 = strip(fs.readFileSync(F("netlify/functions/kickoff-availability.js"), "utf8"));
  const portal2 = strip(fs.readFileSync(F("portal/portal.js"), "utf8"));
  // 🔑 COMPUTED IS NOT RENDERED. The first version asked whether the word `rules` appeared in the
  // renderer — which stayed true with the chip builder intact but its output never interpolated.
  // That is the exact defect shape being guarded against, so assert the INTERPOLATION.
  if (/rules:\s*\{/.test(avail2)) {
    // 🔴 \b — /const windowChip/ matches `const windowChipXX`, so a rename left this green. Third
    // time today. A substring is not a reference. → feedback_a_gate_that_cannot_fail
    if (!/const windowChip\b/.test(portal2)) {
      problems.push("the picker no longer derives a bookable-window chip — `rules` is sent and thrown away");
    } else if (!/\$\{windowChip\}/.test(portal2)) {
      problems.push("windowChip is built but never interpolated — the bookable window is computed and then discarded, which is the defect this guards");
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE BOOKING FLOW MUST CLOSE. Chris, 2026-09-25: *"i clicked a date and time. but when i did
// the cleint side never got a popup card message saying done."*
//
// The outcome card was correct and it appeared where the client was NOT looking — they had just
// clicked a time in the right-hand pane, and the card replaced the calendar they were reading. A
// flow that OPENS with a confirmation ("Request this time") and then ends in silence reads as if
// nothing happened. Every booking product closes this loop on purpose.
//
// 🔑 Both halves are required: the modal BEFORE (so a mis-tap cannot reserve a slot) and the
// acknowledgement AFTER (so the client knows it took).
// → feedback_every_action_must_report_its_result
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const portal3 = strip(fs.readFileSync(F("portal/portal.js"), "utf8"));
  const i = portal3.indexOf('data-kickoff-pick]');
  const flow = i === -1 ? "" : portal3.slice(i, i + 4200);
  if (!flow) {
    problems.push("the slot-pick handler is gone — this check is not reading anything");
  } else {
    if (!/portalConfirm\(/.test(flow)) {
      problems.push("picking a time no longer asks first — a mis-tap would reserve a slot outright");
    }
    // 🔴 THE SUCCESS ALERT, NOT ANY ALERT. A bare /portalAlert\(/ also matched the catch block's
    // "We couldn't reach the booking service" — so deleting the acknowledgement left this green
    // while the happy path went silent, which is the exact defect. The success one is the OBJECT
    // form with a title; the error one is a bare string.
    if (!/portalAlert\(\{[\s\S]{0,300}?title:/.test(flow)) {
      problems.push("the booking flow ends in silence — it opens with a confirmation and then swaps a panel the client is not looking at, which reads as nothing having happened");
    }
    // 🔴 And it must never say "booked": RGA has not agreed and no calendar event exists yet.
    const ack = flow.match(/portalAlert\(\{[\s\S]{0,700}?\}\)/);
    if (ack && /\bbooked\b|\bconfirmed for\b|\byou're all set\b/i.test(ack[0])) {
      problems.push("the acknowledgement claims the call is BOOKED — it is only requested until RGA confirms, and a client told 'booked' stops watching for the invite");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A STEP ID IN THE CODE IS A CLAIM ABOUT THE PLAYBOOK, AND A PROPERTY READ IS A CLAIM ABOUT
//      THE SHAPE. BOTH WERE FALSE IN THE SAME LINE, AND EVERY GATE STAYED GREEN.
//
// 2026-09-26. "Needs your attention" kept telling Chris «Next: Send the kickoff calendar invite»
// while the client's 1:00 PM request sat unconfirmed — the button that step points at books the
// FIRST free slot, so following the instruction would have booked the WRONG TIME and emailed it.
// The third surface of a defect already fixed twice.
//
// The cause: `/kickoff/i.test(next.obj?.flowId || "")`. `next` is a PLAYBOOK STEP — `{id, title,
// dependsOn, …}`. It has no `.obj`. I had copied the expression from the next-action card, where the
// rows genuinely ARE `{obj: {flowId}}`. Optional chaining turned the wrong shape into `undefined`
// instead of a crash, so the test was always false: the hook attribute never rendered and the
// in-place correction had nothing to patch. The strings the earlier gates looked for were all
// present, so all of them passed.
//
// 🔑 Two checks, because there were two claims:
//   1. every `m1.*` / `m2.*` id in admin.js EXISTS in playbooks.json — catches renames and typos
//   2. the cockpit's kickoff hook is decided from `.id`, never from `.obj`/`.flowId`
// → feedback_position_is_not_identity · feedback_a_gate_that_exists_is_not_a_gate_that_it_works
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const pbPath = F("data/playbooks/playbooks.json");
  if (!fs.existsSync(pbPath)) {
    console.error(`⚠️  INDETERMINATE — playbooks.json missing at ${pbPath}`);
    process.exit(2);
  }
  const ids = new Set();
  (function walk(o) {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (typeof o.id === "string") ids.add(o.id);
      Object.values(o).forEach(walk);
    }
  })(JSON.parse(fs.readFileSync(pbPath, "utf8")));
  if (ids.size < 20) {
    console.error(`⚠️  INDETERMINATE — only ${ids.size} step id(s) parsed from playbooks.json; cannot judge.`);
    process.exit(2);
  }

  // 1 ─ every step id the admin names must be a step that exists.
  const named = new Set([...src.admin.matchAll(/["'`](m[12]\.[a-z0-9_]+\.[a-z0-9_]+)["'`]/g)].map((m) => m[1]));
  const ghosts = [...named].filter((id) => !ids.has(id)).sort();
  if (ghosts.length) {
    problems.push(`admin.js names ${ghosts.length} step id(s) that do not exist in playbooks.json — ${ghosts.join(" · ")}. `
      + "Any comparison against one of these is permanently false, so whatever it guards never fires.");
  }

  // 2 ─ the "Needs your attention" kickoff correction must key off the real shape.
  //     Window the CHECK on the enclosing block, not a character count.
  //     → feedback_a_gate_window_measured_in_characters_will_lie
  const i = src.admin.indexOf("_kickoffPendingAsk.get(state.selectedClient.id)");
  if (i === -1) {
    problems.push("the 'Needs your attention' panel no longer reads _kickoffPendingAsk — a pending request would stop overruling the step name there, which is the surface that told Chris to press the wrong button");
  } else {
    // the enclosing `if (next) { … }` block
    const open = src.admin.lastIndexOf("if (next) {", i);
    const block = src.admin.slice(open === -1 ? Math.max(0, i - 1500) : open, src.admin.indexOf("alertsHtml", i));
    if (/next\.obj|next\?\.obj|\.flowId/.test(block)) {
      problems.push("the attention panel decides the kickoff step from `next.obj` / `.flowId` — `next` is a playbook step and has neither, "
        + "so optional chaining makes the test silently false and the panel keeps pointing at the button that books the FIRST free slot rather than the time the client asked for");
    }
    if (!/next\.id\s*===/.test(block)) {
      problems.push("the attention panel does not compare `next.id` to a named step id — an `/kickoff/i` pattern also matches `m1.kickoff.call`, which a booking request says nothing about");
    }
  }

  // 3 ─ 🔴🔴 EVERY SURFACE, NOT THE ONES ON THE TAB I HAPPENED TO OPEN.
  //     Four places tell Chris what to do about the kickoff invite. Three were corrected one at a
  //     time; the fourth — the "promised a calendar invite" banner — renders only on the Onboarding
  //     tab, so every live check run on Overview reported clean while it still said "Send it from
  //     step 2 below". Step 2 books the FIRST FREE SLOT.
  //     🔑 So the rule is structural: ANY place that sends Chris to the step-2 sender must first ask
  //     whether the client has already picked a time. → feedback_fix_the_class_not_the_instance
  // 3a ─ the DESTINATION itself: the active step-2 card owns the dangerous button, so it must say
  //      so when a request is open. Its own SOP copy reads "use it when … they have not chosen",
  //      which the pending request contradicts.
  //      🔴 ANCHOR ON THE EXPRESSION, NOT A CHARACTER WINDOW. My first version was
  //      /m1\.close\.kickoff_invite"[\s\S]{0,200}?_kickoffPendingAsk/ and it passed with the card
  //      note deleted, because 200 characters downstream of the UNRELATED `stepDone(
  //      "m1.close.kickoff_invite")` in the promise-gap block sits that block's own
  //      `_kickoffPendingAsk`. It matched a different site and called it proof.
  //      → feedback_a_gate_window_measured_in_characters_will_lie
  if (!/o\.flowId\s*===\s*"m1\.close\.kickoff_invite"[\s\S]{0,120}?_kickoffPendingAsk/.test(src.admin)) {
    problems.push("the active step-2 card does not consult _kickoffPendingAsk — its SOP copy says to use the button when the client "
      + "'has not chosen', and it said that with their request already in the ledger");
  }

  const senderPointers = [...src.admin.matchAll(/Send it from step 2|Go to step 2|Send the kickoff calendar invite<\/strong>/g)];
  for (const m of senderPointers) {
    // The enclosing template literal, then the statement that builds it.
    const open = src.admin.lastIndexOf("`", m.index);
    const stmt = src.admin.slice(Math.max(0, open - 1200), m.index);
    // Lock messages ("Unlocks when … is complete") merely NAME the step; they issue no instruction.
    if (/Unlocks when|blockers|ob-lockmsg/.test(stmt.slice(-300))) continue;
    if (!/_kickoffPendingAsk|pendingAsk|pendingRequest/.test(stmt)) {
      const near = src.admin.slice(m.index, m.index + 60).replace(/\s+/g, " ");
      problems.push(`a surface points Chris at the step-2 sender ("${near}…") without first checking `
        + "_kickoffPendingAsk — with a request pending, that button books the FIRST FREE SLOT and emails the client a time they did not choose");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 CONFIRMING A REQUEST MUST NOT COLLIDE WITH THE REQUEST ITSELF.
//
// 2026-09-26. Chris pressed "Confirm & send invite" and it silently did nothing: *"it shows again
// in blue like it didn't complete."* It hadn't. `portal-book-kickoff` writes a `requested` hold when
// the client picks a time; confirming then INSERTs a hold for the same slot, one row per
// (workspace, slot_start), so the unique constraint fired and we told Chris *"That time was just
// taken by someone else."* The someone else was the client whose request he was confirming.
//
// Every safety property held — no event, no email, hold still `requested` — so the whole confirm
// flow was safe, silent and 100% broken. It could never have worked for any client.
//
// 🔑 A race is "a DIFFERENT client holds this slot". Identity decides, not the mere existence of a
// row. → feedback_position_is_not_identity
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const send = src.send;
  const i = send.indexOf("holdRes.status === 409");
  if (i === -1) {
    problems.push("send-kickoff-invite no longer handles a 409 from the slot-hold insert — a genuine race would either crash or double-book");
  } else {
    const block = send.slice(i, i + 1400);
    if (!/client_id\s*!==\s*client\.id|client_id\s*===\s*client\.id/.test(block)) {
      problems.push("the slot-hold 409 path does not compare the existing hold's client_id to this client — "
        + "the client's OWN pending request collides with the confirm that is trying to honour it, and the whole confirm flow fails "
        + "with \"that time was just taken by someone else\"");
    }
    // 🔴 And it must NOT adopt the row into slotHeld: the finally releases what it holds, so a later
    // failure would delete the client's standing request.
    // 🔑 Scoped to the 409 BLOCK ITSELF, not a pattern about how the ownership test is spelled. My
    // first version keyed on `client_id === client.id` while the code says `!==`, so it matched
    // nothing and the mutation sailed through — a check that could not fail.
    // → feedback_a_gate_that_cannot_fail
    const endOf409 = block.search(/\n\s*\}\s*else if \(holdRes\.ok\)|\n\s*if \(holdRes\.ok\)/);
    const inside409 = endOf409 === -1 ? block.slice(0, 900) : block.slice(0, endOf409);
    if (/slotHeld\s*=/.test(inside409)) {
      problems.push("the confirm path assigns the client's own hold to slotHeld — the `finally` releases whatever slotHeld names, "
        + "so any later failure would DELETE the request the client is waiting on");
    }
  }
}

// 🔴 THE NOTICE BANNER MUST STAY A FIXED TOAST.
//
// 2026-09-26. I claimed the banner was "at the top of the document, ~2000px above the card" and
// gated a scrollIntoView to drag it into view. Both the claim and the gate were wrong:
// `#noticeBanner:not([hidden])` has been `position:fixed; top:16px; z-index:9999` since
// 2026-09-06 — measured live at viewport y=16 while scrolled 2137px down. The branch I gated could
// never fire, and the gate demanded dead code.
//
// 🔑 So what IS worth locking is the thing that was actually fixed back then and that I nearly
// broke by "fixing" it again: the banner must remain fixed-position, or every action's result
// really does render 1500px above the button that caused it.
// → feedback_a_css_rule_that_looks_applied_can_be_losing · feedback_a_gate_that_cannot_fail
{
  const css = fs.readFileSync(F("admin/admin.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const i = css.indexOf("#noticeBanner:not([hidden])");
  if (i === -1) {
    problems.push("#noticeBanner:not([hidden]) is gone — without it `.admin-banner{display:grid}` outranks the hidden attribute AND the "
      + "toast stops being fixed, so every action's result renders at the top of the document instead of in front of the operator");
  } else {
    const rule = css.slice(i, css.indexOf("}", i));
    if (!/position:\s*fixed/.test(rule)) {
      problems.push("#noticeBanner is no longer position:fixed — it reverts to a static div at the top of the page, which is the 2026-09-06 defect "
        + "where 'Running…', '✓ Done' and 'Step failed' all rendered ~1500px above the Run button that produced them");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE "TIME REQUESTED" DIALOG MUST NOT WEAR A GREEN **DONE** BADGE.
//
// 2026-09-26. Chris: *"do we need to update this popup too?"* — and yes, for a reason the screenshot
// made obvious. The new dialog system defaults an alert to the `result` kind, which renders a GREEN
// pill reading DONE. It sat directly over a heading saying "Time requested". Nothing is done: no
// calendar event exists and RGA has not agreed. A green DONE tells a client the call is settled —
// the exact "a sent invite is not a booked call" lie this whole flow exists to avoid — and it
// contradicted the ORANGE "Requested" card rendering right behind the dialog.
//
// 🔴 The same screenshot caught a second one: the step row still read YOUR TURN behind it, because
// the pill correction only fired inside loadKickoffSlots and the just-booked path never calls it.
// The row contradicted the card beneath it until the next page load.
// → feedback_a_promise_in_client_copy_is_a_commitment · feedback_a_client_message_must_agree_with_itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const p = src.portal;
  const i = p.indexOf('title: "Time requested"');
  if (i === -1) {
    problems.push('the "Time requested" acknowledgement is gone — the client would book a time and be told nothing, which is the silence this replaced');
  } else {
    const region = p.slice(Math.max(0, i - 700), i + 700);
    if (!/tone:\s*["']turn["']/.test(region)) {
      problems.push('the "Time requested" dialog does not pass tone:"turn" — it falls back to the `result` kind, whose pill reads a GREEN **DONE** '
        + "over a heading that says the time was merely requested. No event exists and RGA has not agreed");
    }
    if (/pill:\s*["']DONE["']/i.test(region)) {
      problems.push('the "Time requested" dialog is badged DONE — a request awaiting RGA is not done, and a client told "done" stops watching for the invite');
    }
  }
  // Both paths that record a request must set _kickoffMine and correct the step pill: the fetched
  // one (loadKickoffSlots) and the optimistic one (straight after booking).
  // 🔑 ANCHOR ON THE PATH, NOT A COUNT. My first version required ≥3 occurrences — but the fetched
  // path alone contains the definition plus TWO calls, so deleting the just-booked one still left 3
  // and the mutation passed. Counting a symbol says nothing about WHERE it is.
  // → feedback_a_gate_that_cannot_fail · feedback_position_is_not_identity
  // 🔴 THE CALL, NOT THE DEFINITION. `kickoffRequestedHtml(startIso` matches the function's own
  // signature first — its parameter is literally named `startIso` — so the window landed on the
  // renderer and failed the clean tree. Third time today a gate anchored on the first mention of a
  // name rather than the occurrence it meant.
  // → feedback_a_gate_window_measured_in_characters_will_lie · feedback_position_is_not_identity
  const opt = p.indexOf("host.innerHTML = kickoffRequestedHtml(startIso");
  if (opt === -1) {
    problems.push("the just-booked path no longer paints the requested card — the client would click a time and see the calendar they were reading vanish");
  } else if (!/markKickoffWaitingOnRga\(/.test(p.slice(opt, opt + 1200))) {
    problems.push("the just-booked path does not correct the step pill — the row keeps saying YOUR TURN directly above a card that says Requested, "
      + "until the next page load. The optimistic path needs the same state change as the fetched one");
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
