#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A STEP THE CLIENT MUST ACT ON DECLARES WHO FINISHES IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHAT WENT WRONG (found by audit, 2026-10-06). `m1.audit.gbp_duplicate` tells the client, in
// its own words:
//
//     "Two listings under one name compete with each other. ONLY YOU CAN MERGE THEM."
//
// and declared no `clientDone`. The portal reads `step.clientDone || "rga"`, so the row behaved as
// OURS: the pill said RGA is doing it, and the only control was a passive "What this is →". The copy
// said the client is the only one who can act; the mechanism said they had nothing to do.
//
// 🔑 A SILENT DEFAULT IS A DECISION NOBODY MADE. `|| "rga"` is a sensible fallback for a field that
// is always set — and the moment one step forgets it, the fallback answers a question about THAT
// step that nobody asked. An `act`-bucket step exists because the client must do something; which of
// the three mechanisms finishes it is never guessable.
//
// 🔑 AND "Your turn" IS EARNED, NOT ASSERTED. The portal only shows it when
// `mech === "client" && step.clientDoneCta` — the pill follows the CONTROLS. So declaring
// `clientDone: "client"` without a CTA produces a row that is theirs with nothing to press, which is
// the same defect wearing the other mask.
//
// → feedback_a_client_message_must_agree_with_itself · feedback_an_absence_must_never_be_readable_as_a_value
// → feedback_a_control_has_a_kind_like_a_message_does
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

let pb, portal;
try {
  pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  portal = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot read the playbook or the portal: ${e.message}`); process.exit(2); }

// 🔑 READ THE MECHANISMS THE PORTAL ACTUALLY HANDLES, never a list typed here. A value the data uses
// and the portal does not branch on is dead on the client's screen.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
const KNOWN = new Set([...portal.matchAll(/mech === "([a-z]+)"/g)].map((m) => m[1]));
if (KNOWN.size < 2) { console.error("⚠️  INDETERMINATE — cannot read the portal's completion mechanisms"); process.exit(2); }

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE FIRST VERSION OF THIS GATE READ ONE CLAUSE OF A FOUR-BRANCH CONDITION and accused two
// correct steps. `theirsToAct` is a disjunction: an input, a choice set, a non-generic form, OR a
// client mechanism with a CTA. `m1.kickoff.call` earns it through its booking form and
// `m2.exec.youtube_video` through its URL input — neither needs a CTA and neither was broken.
//
// 🔑 A RULE TAKEN FROM PART OF A CONDITION DEFENDS A MISREADING OF IT. The branch count is pinned
// below, so if the portal grows a fifth way to be theirs, this reports INDETERMINATE and asks to be
// re-read rather than accusing whatever uses it.
// → feedback_a_gate_written_from_a_slogan_defends_the_misreading · feedback_a_chosen_property_list_is_a_claim_about_what_i_looked_at
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const theirs = portal.match(/const theirsToAct = [\s\S]{0,400}?\);/);
if (!theirs) { console.error("⚠️  INDETERMINATE — cannot read the portal's theirsToAct condition"); process.exit(2); }
// 🔴 COUNT THE BRANCH-LEADING `||`, not every `||`. `(step.clientChoices || [])` is a DEFAULT inside
// a branch, and counting it made this report 5 branches and refuse to run.
const BRANCHES = (theirs[0].match(/^\s*\|\|/gm) || []).length + 1;
if (BRANCHES !== 4) {
  console.error(`⚠️  INDETERMINATE — theirsToAct now has ${BRANCHES} branches, not the 4 this gate was written against.`);
  console.error("    Re-read it before trusting this check.");
  process.exit(2);
}
// 🔴 THE BRANCH COUNT ALONE WAS NOT ENOUGH. Changing the fourth branch from
// `(mech === "client" && step.clientDoneCta)` to `mech === "client"` keeps four branches and moves
// the rule this gate mirrors — and the gate passed in silence. Pin the clause itself.
if (!/mech === "client" && step\.clientDoneCta/.test(theirs[0])) {
  console.error("⚠️  INDETERMINATE — the portal no longer requires a control for a client-finished row.");
  console.error("    This gate mirrors that rule; re-read it before trusting the result.");
  process.exit(2);
}

/** Mirrors the portal: the ways a row can be the client's to act on. */
const hasControl = (s2) => Boolean(s2.clientInput)
  || (s2.clientChoices || []).length > 0
  || (s2.clientForm && s2.clientForm !== "generic")
  || (s2.clientDone === "client" && s2.clientDoneCta);

const books = Object.keys(pb);
let acts = 0;
for (const book of books) {
  for (const s of pb[book] || []) {
    const mech = s.clientDone;
    if (s.clientBucket === "act") {
      acts++;
      // 1 · it must be DECLARED, never inherited from `|| "rga"`
      if (!mech) {
        F(`${s.id} is an "act" step — the client must do something — and declares no clientDone, so the `
          + `portal falls back to "rga" and the row reads as ours`);
        continue;
      }
      // 2 · the mechanism must be one the portal actually handles
      if (!KNOWN.has(mech)) F(`${s.id} declares clientDone "${mech}", which the portal never branches on`);
      // 3 · theirs to finish means something to press
      if (mech === "client" && !hasControl(s)) {
        F(`${s.id} is finished by the client but offers no control — no input, no choices, no form and `
          + `no clientDoneCta — so the portal cannot show "Your turn" and the row is theirs with nothing to press`);
      }
    }
    // 4 · 🔑 THE COPY AND THE MECHANISM MUST AGREE. A step that tells the client only they can do it
    //     cannot be a step we finish. Read the step's OWN words rather than a list of ids.
    const words = [s.clientHint, s.clientInstructions, s.clientLabel, s.clientWhy].filter(Boolean).join(" ");
    const saysOnlyYou = /\bonly you\b|\byou are the only\b|\bonly the owner\b/i.test(words);
    if (saysOnlyYou && (mech || "rga") === "rga") {
      F(`${s.id} tells the client "${(words.match(/[^.]*\bonly you\b[^.]*/i) || [""])[0].trim()}" `
        + `while its completion mechanism is "${mech || "rga (defaulted)"}" — the copy and the row disagree`);
    }
  }
}
if (!acts) { console.error("⚠️  INDETERMINATE — no act-bucket steps found; the playbook shape moved"); process.exit(2); }

if (fails.length) {
  console.error(`❌ A STEP DOES NOT DECLARE WHO FINISHES IT — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log(`✅ all ${acts} act-step(s) declare a mechanism the portal handles, a client-finished row has `
  + `something to press, and no step's copy contradicts who finishes it`);
