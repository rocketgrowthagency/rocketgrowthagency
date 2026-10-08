#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-promise-of-automation-has-a-schedule.mjs
//
// 🔴 WHY (Chris, 2026-09-22): "i thought this was shown as resolved. so we need a way it updates
// and sends the note on the client portal."
//
// The duplicate-listing card told the client, in their own words:
//
//     "We re-check this automatically. It clears itself here once the duplicate is gone —
//      there is nothing for you to tick."
//
// Nothing re-checked it. `gbp-duplicate-scan` had ONE caller — a human running the SOP step — and
// no schedule anywhere, so the card rendered a frozen verdict for a week while the client waited
// for something that was never going to happen.
//
// 🔑 A SENTENCE IN CLIENT-FACING COPY IS A COMMITMENT THE SYSTEM HAS TO KEEP. Copy is the cheapest
// thing in the repo to write and the most expensive to be wrong about: the client cannot see that
// the cron does not exist, so they wait instead of acting.
// → feedback_we_never_promise_what_we_dont_do · feedback_correct_is_not_the_same_as_happening
//
// HOW: every promise of ongoing automation must be REGISTERED with the scheduled function that
// keeps it, and that function must actually carry a `schedule =` in netlify.toml. Copy that makes
// such a promise WITHOUT a registry entry fails — so a new promise cannot be written without
// naming what keeps it.
//
// exit 0 = every promise is kept by something real · 1 = a promise with no mechanism · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const TOML = path.join(SITE, "netlify.toml");

// Client-facing copy. Anything a CLIENT reads and could wait on.
const SURFACES = [
  "netlify/functions/_deliverables.js",
  "data/playbooks/playbooks.json",
  "portal/portal.js",
];

// A promise of ONGOING automation — not "we will do X" (a one-off we may do by hand), but "this
// keeps happening without you". Deliberately narrow: a gate that fires on ordinary copy gets muted.
const PROMISE = [
  /re-?checks? (?:this|it) automatically/i,
  /clears itself/i,
  // 🔴 The object is not always "this". A first version required `we check (this|it|these)` and
  // sailed past "We update your rankings automatically every day" — real copy names the THING, not
  // a pronoun. Widened to any object, still anchored on an explicit ongoing-automation word so
  // ordinary "we will do X" copy does not trip it.
  /\bwe (?:re-?check|check|update|refresh|monitor|watch)\b[^.]{0,70}\b(?:automatically|every day|daily|weekly|each month)/i,
  /nothing for you to tick/i,
  // 🔴 2026-10-08 — TWO PROMISES THIS GATE COULD NOT HEAR. "RGA will push to GBP within 24 hrs" and
  // "automatic once their Google account is connected" were both unkept for months, and neither
  // matched a pattern above: a deadline and a condition are promises too, not only "automatically".
  // A DEADLINE ONLY WHEN SOMETHING "WILL" MEET IT. The bare form fired on the operator's own
  // instructions — "Confirmation email (within the hour)", "SMS within 1 hour of the job" — which are
  // things a person does, not things the system promises.
  /\b(?:will|we'll)\b[^.]{0,70}\bwithin (?:the hour|\d+ ?(?:hrs?|hours?|days?))\b/i,
  /\bonce (?:your|their) Google account is connected\b/i,
  /\bwe retry (?:it |them )?automatically\b/i,
];

// Each registered promise names the scheduled function that keeps it. Adding a line here is a
// decision on the record — same contract as the gate-wiring excuse list.
// 🔑 The surface is where the CLIENT reads it, which is not always where the card is defined. I
// registered this against `_deliverables.js` (where the card's config lives) and the gate corrected
// me on its first run: the sentence is rendered from `portal/portal.js`. Registering a promise
// against the wrong file would have guarded nothing while reporting green.
const KEPT_BY = [
  // 🔑 PHOTOS GO TO GOOGLE BY THEMSELVES. The upload publishes at once; the hourly sweep keeps the
  // three conditional promises — a connection made later, a retry, and "within the hour" when the
  // upload's own call did not answer. → check-a-photo-reaches-google holds the mechanism itself.
  {
    match: /once your Google account is connected|we retry (?:it )?automatically|within the hour/i,
    surface: "portal/portal.js",
    keptBy: "photos-publish-sweep",
    note: "the client's photo tiles and upload message",
  },
  {
    match: /once their Google account is connected/i,
    surface: "data/playbooks/playbooks.json",
    keptBy: "photos-publish-sweep",
    note: "step 31's How fold — RGA publishes the photos",
  },
  {
    match: /re-?check this automatically|clears itself here|nothing for you to tick/i,
    surface: "portal/portal.js",
    keptBy: "gbp-duplicate-recheck",
    note: "the duplicate-listing card — re-scans daily and writes a client_activity note on clear",
  },
  // 🔑 An entry for the client step card's done-when strip lived here from 2026-09-28. Chris DELETED
  // that strip on 09-29 ("i never want to see this again"), so the copy it registered no longer
  // exists and this gate correctly reported a registry naming a promise nothing makes.
  // 🔴 REMOVING THE ENTRY IS THE FIX, NOT WEAKENING THE CHECK. The automation is unchanged —
  // `metrics-daily-refresh` still sweeps every `clientDone: "detected"` step at 06:00 — we simply no
  // longer PROMISE it in that sentence, and an unmade promise needs no registration.
  // → feedback_a_line_that_must_never_appear_cannot_be_gated · feedback_we_never_promise_what_we_dont_do
];

if (!fs.existsSync(TOML)) {
  console.error("⚠️  INDETERMINATE — netlify.toml not found; cannot verify any schedule.");
  process.exit(2);
}
const toml = fs.readFileSync(TOML, "utf8");

/**
 * Is this function actually scheduled?
 *
 * 🔴 NETLIFY HAS TWO WAYS TO SCHEDULE and a check that knows one is a check that lies. A first
 * version read only netlify.toml — but `flow-cron-daily` and `flow-cron-weekly-digest` declare
 * `exports.config = { schedule: "0 9 * * *" }` INSIDE the function file, which is equally valid.
 * A keeper scheduled that way would have been reported as unkept, and the gate would have been
 * demanding a fix for something already working. Found while sweeping for dormant functions the
 * same hour this gate was written. → feedback_a_check_must_not_validate_itself
 */
function isScheduled(fn) {
  // 🔴🔴 THIS READ A 300-CHARACTER WINDOW AND IT LIED (2026-09-28). The old regex ran from the
  // section header to the next `\n[` within 300 chars. `[functions."gbp-duplicate-recheck"]` is
  // followed immediately by the next section, so it matched; `[functions."metrics-daily-refresh"]`
  // is followed by a long comment, so its `schedule = "0 6 * * *"` — sitting on the very next line —
  // was invisible. The gate reported a real, scheduled function as unkept.
  // 🔑 A TOML section ends at the next SECTION HEADER, not at a number of characters. Read lines.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const header = `[functions."${fn}"]`;
  const lines = toml.split("\n");
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === header) { inBlock = true; continue; }
    // A new section header — of any kind — ends the block we were reading.
    if (inBlock && /^\[/.test(line)) break;
    if (inBlock && /^schedule\s*=\s*"[^"]+"/.test(line)) return true;
  }
  const file = path.join(SITE, "netlify", "functions", `${fn}.js`);
  if (!fs.existsSync(file)) return false;
  const src = fs.readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
  return /exports\.config\s*=\s*\{[\s\S]{0,200}?schedule\s*:\s*["'`][^"'`]+["'`]/.test(src);
}


const problems = [];
let promisesFound = 0, surfacesRead = 0;

for (const rel of SURFACES) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) continue;
  surfacesRead++;
  // Comments are not client-facing copy — and this file's own explanation of the rule contains the
  // very phrases it forbids. → feedback_dead_check_selector_gap
  const src = rel.endsWith(".json")
    ? fs.readFileSync(p, "utf8")
    : fs.readFileSync(p, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  for (const line of src.split("\n")) {
    if (!PROMISE.some((re) => re.test(line))) continue;
    promisesFound++;
    const entry = KEPT_BY.find((k) => k.surface === rel && k.match.test(line));
    if (!entry) {
      problems.push(`${rel} promises ongoing automation with no registered mechanism:\n       `
        + `"${line.trim().slice(0, 120)}"\n       Register it in KEPT_BY with the scheduled function `
        + `that keeps it, or delete the promise.`);
      continue;
    }
    if (!isScheduled(entry.keptBy)) {
      problems.push(`${rel} promises "${line.trim().slice(0, 70)}…" and names \`${entry.keptBy}\`, `
        + `but that function has no \`schedule =\` in netlify.toml. The promise is unkept.`);
    }
  }
}

if (!surfacesRead) {
  console.error("⚠️  INDETERMINATE — none of the client-facing surfaces were readable.");
  process.exit(2);
}

// Every registry entry must still correspond to real copy — a stale entry means the gate is
// guarding a sentence nobody shows any more. → feedback_a_ledger_line_outlives_the_bug
for (const k of KEPT_BY) {
  const p = path.join(SITE, k.surface);
  if (!fs.existsSync(p) || !k.match.test(fs.readFileSync(p, "utf8"))) {
    problems.push(`KEPT_BY names copy in ${k.surface} (${k.note}) that no longer exists. `
      + `Remove the entry, or restore the promise.`);
  }
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} promise(s) the system does not keep:\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ ${promisesFound} promise(s) of ongoing automation across ${surfacesRead} client-facing `
  + `surface(s), each kept by a function that is actually scheduled.`);
process.exit(0);
