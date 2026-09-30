#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — "YOU ARE DONE WHEN …" IS DELETED, AND MAY NOT COME BACK IN ANY FORM
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-29:
 *   *"why the fuck does this keep showing: You are done when you tell us — we cannot detect this
 *   one, so the step waits until you do. Ive told you remove from every fucking card in every
 *   fucking way possible i never want to see this again."*
 *
 * 🔴🔴 IT KEPT COMING BACK BECAUSE I KEPT GATING IT INSTEAD OF REMOVING IT.
 *
 * The line was hidden on a settled step. Then also on a confirmed booking (it rendered anyway,
 * because the pill was overridden to Done while the task row stayed pending). Then also on an
 * unknown load. **Three conditions, and each new state I had not thought of un-hid it again.**
 *
 * 🔑 A LINE THAT MUST NEVER APPEAR CANNOT BE DEFENDED BY A CONDITION. Every condition is another
 * chance to be wrong, and the client sees the wrong one. The only durable fix is to delete the
 * producer, and the only durable gate is a ban.
 * → feedback_fix_the_class_not_the_instance · feedback_an_absence_must_never_be_readable_as_a_value
 *
 * THIS GATE REPLACES `check-a-sentence-never-points-where-it-cannot-see.mjs`, whose entire subject
 * was this line's wording. A gate that demands the thing Chris removed is a gate arguing with the
 * owner — and a red gate nobody can satisfy gets ignored, taking its neighbours down with it.
 * → feedback_a_gate_written_from_a_slogan_defends_the_misreading
 *
 * WHAT IS BANNED — in RAW SOURCE, comments included, so a commented-out map counts as a return:
 *   1. the sentence itself, in any casing or spacing
 *   2. the per-mechanism copy map that produced it
 *   3. any render of the strip's container on a step card
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

// Every surface a client can read. If the sentence returns, it returns in one of these.
const FILES = ["portal/portal.js", "portal/portal.css", "portal/index.html"];

const BANNED = [
  // 🔑 Whitespace-tolerant, case-insensitive: "You are done when", "you  are  done  when", etc.
  [/you\s+are\s+done\s+when/i, 'the sentence "You are done when …"'],
  [/DONE_WHEN/, "the per-mechanism copy map that produced it"],
  [/we\s+cannot\s+detect\s+this\s+one/i, 'the phrase "we cannot detect this one"'],
  [/the\s+step\s+waits\s+until\s+you\s+do/i, 'the phrase "the step waits until you do"'],
];

let looked = 0;
for (const rel of FILES) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); continue; }
  const raw = fs.readFileSync(p, "utf8");
  if (raw.length < 500) { indet.push(`${rel} is only ${raw.length} bytes`); continue; }
  looked++;
  for (const [re, what] of BANNED) {
    const m = raw.match(re);
    if (m) {
      // Name the line, so the fix is a jump not a hunt. → feedback_instruct_by_what_is_on_screen
      const line = raw.slice(0, m.index).split("\n").length;
      fail.push(`${rel}:${line} — ${what} is back ("${m[0]}"). Chris deleted this on 2026-09-29 and `
        + `said "i never want to see this again". It must not return on any state, behind any `
        + `condition, or commented out.`);
    }
  }
}
if (!looked) {
  indet.push("none of the client-facing portal files could be read");
} else if (!fail.length) {
  pass.push(`the done-when line has no producer in any of the ${looked} client-facing portal files`);
}

// 🔑 AND THE STRIP ITSELF MUST NOT BE RENDERED ON A STEP CARD. The class survives because the
// Stripe "Nothing was charged" note borrows it for styling — that note has entirely different text
// and Chris has never objected to it. What must not come back is a step card rendering the strip.
{
  const p = path.join(SITE, "portal", "portal.js");
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    const live = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const renders = [...live.matchAll(/<div class="pm-knowdone"/g)];
    if (renders.length) {
      fail.push(`portal/portal.js — a step card renders the done-when strip again (${renders.length}×). `
        + `The only legitimate use of that class is the Stripe "Nothing was charged" note, which is `
        + `built with createElement, not template markup.`);
    } else pass.push("no step card renders the done-when strip");
  }
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — the "You are done when …" line is back in ${fail.length} place(s).`);
  process.exit(1);
}
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ "You are done when …" is gone, and cannot return (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. re-add the sentence anywhere in portal.js, including inside a comment   → banned token
 *   2. re-add it to portal.css or index.html                                   → every surface checked
 *   3. re-introduce the copy map under its old name                            → banned token
 *   4. render <div class="pm-knowdone"> from a step card again                 → strip render
 *   5. re-add it with different spacing or casing                              → whitespace-tolerant
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
