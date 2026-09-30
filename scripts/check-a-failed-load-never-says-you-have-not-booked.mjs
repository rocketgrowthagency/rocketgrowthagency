#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A FAILED LOAD NEVER RENDERS AS "YOU HAVE NOT BOOKED"
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-29: *"FUUUCKKK why is this back — You are done when you tell us, we cannot detect
 * this one, so the step waits until you do."*
 *
 * It was not back. His screenshot showed, three lines above it:
 * **"We couldn't load available times just now."**
 *
 * `loadKickoffSlots` returns EARLY when the availability fetch fails, so `_kickoffMine` and
 * `_kickoffWhen` are never written and `markKickoffWaitingOnRga` never runs. The row then keeps the
 * default it was first rendered with — **Your turn · "Pick a 30-minute slot below" · "You are done
 * when you tell us"** — which is a confident claim that the client has not booked, assembled
 * entirely out of a network error.
 *
 * 🔑 `_kickoffMine` HAS THREE VALUES — booked / requested / none — AND A FAILURE IS NONE OF THEM.
 * Reading "no entry in the map" as "no booking" is the defect this codebase keeps rediscovering, and
 * it is the same shape as an empty alerts directory reading as "nothing is wrong".
 * → feedback_unloaded_is_not_an_answer · feedback_an_absence_must_never_be_readable_as_a_value
 *
 * WHAT IS PINNED:
 *   1. An explicit UNKNOWN state exists, and it OUTRANKS the status ladder.
 *   2. Both failure paths — a non-2xx and a thrown fetch — set it, and both correct the card.
 *   3. Success clears it, or a client who just booked is stuck on "Couldn't check".
 *   4. The "You are done when…" line and the "pick a slot" lede are suppressed on UNKNOWN, not only
 *      on a settled booking. An instruction is a claim that something is owed.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = path.join(SITE, "portal", "portal.js");
const fail = [], indet = [], pass = [];

if (!fs.existsSync(JS)) { console.error("⚠️  INDETERMINATE — portal.js not found."); process.exit(2); }
const raw = fs.readFileSync(JS, "utf8");
if (raw.length < 100000) { console.error(`⚠️  INDETERMINATE — portal.js is only ${raw.length} bytes.`); process.exit(2); }
// 🔴 The comments explaining this very fix quote the strings it is about.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1 · RUN THE REAL DECISION, do not re-implement it ───────────────────────────────────────────
// 🔑 Lift the exact `const state = …` ladder out of the source and evaluate it against stub maps.
// A gate that rewrites the logic tests the gate. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
{
  const at = code.indexOf("const status = _kickoffMine.get(clientId) || null;");
  if (at < 0) {
    fail.push("portal/portal.js — the kickoff pill's status ladder is gone, so this gate cannot judge "
      + "what a failed load renders as.");
  } else {
    const end = code.indexOf(";", code.indexOf("const state =", at));
    const ladder = code.slice(at, end + 1);
    const hasChosen = /const clientHasChosen = state\.cls === "done" \|\| state\.cls === "rga";/.test(code);
    const settled = /const settledOrUnknown = clientHasChosen \|\| unknown;/.test(code);
    if (!hasChosen) fail.push("portal/portal.js — `clientHasChosen` is gone or changed shape.");
    if (!settled) {
      fail.push("portal/portal.js — there is no `settledOrUnknown`. The done-when line and the "
        + "\"pick a slot\" lede are then gated on a SETTLED booking only, so a failed load shows both "
        + "again — which is the bug.");
    }
    try {
      const ctx = { _kickoffMine: new Map(), _kickoffUnknown: new Set(), clientId: "c1", result: null };
      vm.createContext(ctx);
      vm.runInContext(`
        const run = (st, unk) => {
          _kickoffMine.clear(); _kickoffUnknown.clear();
          if (st) _kickoffMine.set(clientId, st);
          if (unk) _kickoffUnknown.add(clientId);
          ${ladder}
          const clientHasChosen = state.cls === "done" || state.cls === "rga";
          const settledOrUnknown = clientHasChosen || unknown;
          return { cls: state.cls, text: state.text, settledOrUnknown };
        };
        result = {
          booked:   run("booked", false),
          asked:    run("requested", false),
          none:     run(null, false),
          unknown:  run(null, true),
          unknownOverBooked: run("booked", true),
        };`, ctx, { timeout: 2000 });
      const r = ctx.result;

      if (r.none.cls !== "you") {
        fail.push(`portal/portal.js — a client with genuinely no hold reads "${r.none.text}" instead of `
          + `their turn. The fix for the failure case must not swallow the real one.`);
      } else pass.push("no hold still reads as the client's turn");

      if (r.unknown.cls === "you") {
        fail.push(`portal/portal.js — A FAILED LOAD STILL READS "Your turn". That is a claim the client `
          + `has not booked, made out of a network error — exactly the state Chris screenshotted.`);
      } else pass.push(`a failed load reads "${r.unknown.text}", not the client's turn`);

      if (!r.unknown.settledOrUnknown) {
        fail.push("portal/portal.js — on a failed load `settledOrUnknown` is false, so the card still "
          + "says \"Pick a 30-minute slot below\" and \"You are done when you tell us\".");
      } else pass.push("a failed load suppresses the pick-a-slot lede and the done-when line");

      if (r.unknownOverBooked.cls !== r.unknown.cls) {
        fail.push("portal/portal.js — UNKNOWN does not outrank the status ladder, so a stale status "
          + "would be shown as fact while the live answer is unreadable.");
      } else pass.push("unknown outranks a stale status");

      if (r.booked.cls !== "done" || r.asked.cls !== "rga") {
        fail.push(`portal/portal.js — the settled states changed: booked→${r.booked.cls}, requested→${r.asked.cls}.`);
      } else pass.push("booked and requested still read as done and with-RGA");
    } catch (e) {
      // 🔴 NOT `indet`. These five assertions ARE this gate; skipping them and still printing ✅ is a
      // gate that cannot fail — the pattern I fixed twice already today.
      // → feedback_a_gate_that_cannot_fail
      fail.push(`portal/portal.js — the pill ladder would not run in isolation (${e.message}), so the `
        + `behaviour this gate exists to pin was NOT checked. A gate that cannot execute its own `
        + `assertion must go red, never green.`);
    }
  }
}

// ── 1b · AND THE THREE SURFACES MUST ACTUALLY READ IT ───────────────────────────────────────────
// 🔴🔴 THE CHECK THIS GATE WAS MISSING, found by mutation-testing it: proving `settledOrUnknown` is
// COMPUTED says nothing about whether the done-when line reads it. Flipping that one assignment back
// to `clientHasChosen` restores the exact sentence Chris screenshotted — and the gate stayed green.
// 🔑 A derived flag is worth nothing until something branches on it.
// → feedback_correct_is_not_the_same_as_happening · feedback_a_gate_that_cannot_fail
{
  const SURFACES = [
    [/if \(knowDone\) knowDone\.hidden = settledOrUnknown;/,
     'the "You are done when you tell us…" line', "it would tell a client they still owe us a time"],
    [/if \(lede && settledOrUnknown\) \{/,
     'the "Pick a 30-minute slot below" lede', "it would tell a client to book a call that may already be booked"],
    [/if \(doitH && settledOrUnknown\) \{/,
     "the card's own heading", "it would head the card as an outstanding task"],
  ];
  const missing = SURFACES.filter(([re]) => !re.test(code));
  if (missing.length) {
    for (const [, what, why] of missing) {
      fail.push(`portal/portal.js — ${what} is NOT gated on \`settledOrUnknown\`. On a failed load `
        + `${why}. This is the line Chris reported: "You are done when you tell us — we cannot detect `
        + `this one, so the step waits until you do."`);
    }
  } else pass.push(`all ${SURFACES.length} surfaces on the card read settledOrUnknown, not just the pill`);
}

// ── 2 · BOTH failure paths must mark it, and success must clear it ──────────────────────────────
{
  const adds = (code.match(/_kickoffUnknown\.add\(/g) || []).length;
  const dels = (code.match(/_kickoffUnknown\.delete\(/g) || []).length;
  if (adds < 2) {
    fail.push(`portal/portal.js — \`_kickoffUnknown\` is set on ${adds} path(s). BOTH failures must mark `
      + `it: a non-2xx response and a thrown fetch are the same fact to a client — we do not know.`);
  } else pass.push(`both failure paths mark the state unknown (${adds})`);
  if (dels < 1) {
    fail.push("portal/portal.js — nothing ever clears `_kickoffUnknown`, so a client whose retry "
      + "succeeds is stuck reading \"Couldn't check\" over a booked call.");
  } else pass.push("a successful load clears it");

  // 🔴 Marking it without re-rendering is marking it into a variable. The card must be corrected.
  const failBlocks = [...code.matchAll(/_kickoffUnknown\.add\([^)]*\);([\s\S]{0,220})/g)].map((m) => m[1]);
  const uncorrected = failBlocks.filter((b) => !/markKickoffWaitingOnRga\(/.test(b));
  if (uncorrected.length) {
    fail.push(`portal/portal.js — ${uncorrected.length} failure path(s) mark the state unknown and never `
      + `call markKickoffWaitingOnRga, so the card keeps rendering the answer it was built with.`);
  } else pass.push("every failure path corrects the card, not just the variable");
}

// ── 3 · and the lede has to NAME the failure ────────────────────────────────────────────────────
{
  if (!/couldn't load your call details/i.test(code)) {
    fail.push("portal/portal.js — nothing tells the client on the CARD that the details could not be "
      + "loaded. A neutral pill with the old sentence under it is still the old sentence.");
  } else pass.push("the card names the failure in its own words");
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} way(s) a failed load is readable as "you have not booked".`);
  process.exit(1);
}
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ a failed load says so, and claims nothing about the booking (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. drop `unknown` from the pill ladder                                   → "Your turn" returns
 *   2. gate the done-when line on clientHasChosen again                      → the line comes back
 *   3. remove the add() from either failure path                             → one path unmarked
 *   4. mark unknown without calling markKickoffWaitingOnRga                  → variable, not card
 *   5. never clear it on success                                            → stuck on "Couldn't check"
 *   6. let a stale status outrank unknown                                    → a guess shown as fact
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
