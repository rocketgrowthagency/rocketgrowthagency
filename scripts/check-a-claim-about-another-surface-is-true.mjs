#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHEN ONE SURFACE SAYS WHAT ANOTHER SURFACE SHOWS, THE OTHER SURFACE MUST SHOW IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 THE DEFECT THIS EXISTS FOR (2026-10-08). The admin's deliverable block told Chris:
//
//     "The client sees this list on their own Upload photos step — there is nothing to send."
//
// `draft_shape` appeared **zero times** in `portal/portal.js`. The client could not see it anywhere.
// I wrote that sentence from a design intention I never built, and it sat on screen asserting
// something false until Chris asked *"why do we have the shot instructions on the admin side?"*
//
// 🔑 A CARD ASSERTING SOMETHING THE PRODUCT DOES NOT DO IS WORSE THAN A CARD THAT SAYS NOTHING —
// it is a claim nobody can check from where they are standing. The admin cannot see the portal, so
// nothing contradicted it. → feedback_correct_is_not_the_same_as_happening
//
// 🔑 EACH ENTRY NAMES THE SENTENCE AND THE THING THAT MAKES IT TRUE. Add one whenever a surface
// starts speaking for another. A claim whose text is gone is DRIFT and fails too — so a reworded
// promise cannot slip out of its own guard.
//
// Exit 0 healthy · 1 a surface claims something another does not do · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

const read = (rel) => {
  try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); }
};

// ═══ THE CLAIMS ══════════════════════════════════════════════════════════════════════════════
// claimIn   · the file that makes the promise
// claim     · a distinctive fragment of the promise, as it reads on screen
// trueIn    · the file that has to make it true
// needs     · every token that must be present there for it to BE true
const CLAIMS = [
  {
    what: "the admin tells Chris the client can see the drafted shot list",
    claimIn: "admin/admin.js",
    claim: "The client sees this list on their own",
    trueIn: "portal/portal.js",
    needs: ["draft_shape", "portal-shotlist", "buildPhotoUploadHtml"],
    why: "the list is written FOR the client; if the portal does not render it the sentence is false",
  },
  {
    // 🔴 THE FOLD NOW PROMISES WHERE THE NUMBER COMES FROM. Step 31 spent weeks completing on files
    // uploaded to us while the card said "on the profile"; the new wording says we read Google, and
    // that has to stay true or it is the same defect with better prose.
    what: "the How fold tells the operator the completion count comes from Google",
    claimIn: "data/playbooks/playbooks.json",
    claim: "We read the count from Google",
    trueIn: "netlify/functions/portal-step-recheck.js",
    needs: ["gbpPhotoProbe(id, 20)", "totalMediaItemCount", "gbpParent"],
    why: "if the probe stops asking Google the fold is promising a measurement nobody takes",
  },
];

let checked = 0;
for (const c of CLAIMS) {
  const src = read(c.claimIn);
  if (!src.includes(c.claim)) {
    // 🔴 A CLAIM THAT MOVED IS NOT A CLAIM THAT WENT AWAY. Reworded promises are exactly how a
    // guarded sentence escapes its guard. → feedback_a_lift_list_is_a_promise_somebody_will_remember
    F(`${c.claimIn} no longer contains "${c.claim}" — either the promise was removed (delete this `
      + "entry) or it was REWORDED, in which case it is now unguarded. Update the fragment.");
    continue;
  }
  checked++;
  const target = read(c.trueIn);
  const missing = c.needs.filter((n) => !target.includes(n));
  if (missing.length) {
    F(`${c.claimIn} says "${c.claim}…" but ${c.trueIn} has no ${missing.join(", no ")} — ${c.why}`);
  }
}

if (!checked) {
  console.error("⚠️  INDETERMINATE — no claim could be located; the table is stale, not the product.");
  process.exit(2);
}
console.log(`  ${checked} cross-surface claim(s) checked`);

if (fails.length) {
  console.error("🔴 a surface claims something another surface does not do:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ every surface that speaks for another is telling the truth");
