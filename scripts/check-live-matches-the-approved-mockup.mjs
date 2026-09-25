#!/usr/bin/env node
/**
 * check-live-matches-the-approved-mockup.mjs — an approved mockup is a specification.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-25. Chris approved `client_setup_steps_v2.html`, I built part of it, and reported the
 * mockup as shipped:
 *
 *   "this is mockup … this is live … NEED TO MATCH LIVE TO MOCKUP EXACTLY YOU DDIDNT DO THIS.
 *    i dont see any changes to client side live you said you did all?"
 *
 * He was holding two screenshots side by side. I was comparing the live page to my MEMORY of what I
 * had approved — a comparison between a thing and a story about a thing. Even after fixing it, two
 * of the three group headings still read differently from the approved words.
 *
 * 🔑 This gate checks the one part of a mockup that is unambiguous and load-bearing: its SECTION
 * HEADINGS. They are the words Chris agreed to, they are what he scans for in a screenshot, and
 * they are the thing a rebuild silently paraphrases.
 *
 * 🔴 IT DOES NOT TRY TO DIFF THE WHOLE PAGE. A mockup is standalone HTML with its own class names
 * and sample content drawn from the playbook; comparing markup or every string produces dozens of
 * false findings and a gate that cries wolf gets muted. → feedback_a_gate_that_cannot_fail
 *
 * Exit 0 = every approved heading is rendered · 1 = drift · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

// Each entry: the approved mockup, and the file that must render its headings.
const PAIRS = [
  {
    mockup: "reports/mockups/client_setup_steps_v2.html",
    renders: "portal/portal.js",
    what: "the client setup steps",
    // Headings that are commentary ON the proposal rather than part of the design.
    ignore: [/^Open questions/i, /^What changed/i],
  },
];

console.log("── live matches the approved mockup ──");

const fail = [];
let checked = 0;

for (const pair of PAIRS) {
  const mockPath = path.join(SITE, pair.mockup);
  const livePath = path.join(SITE, pair.renders);
  if (!fs.existsSync(mockPath) || !fs.existsSync(livePath)) {
    console.log(`  ⚠️  ${!fs.existsSync(mockPath) ? pair.mockup : pair.renders} is missing — cannot judge.`);
    process.exit(2);
  }
  const mock = fs.readFileSync(mockPath, "utf8");
  const live = fs.readFileSync(livePath, "utf8");

  const headings = [...mock.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)]
    .map((m) => m[1].replace(/&nbsp;/g, " ").trim())
    .filter((h) => h && !pair.ignore.some((re) => re.test(h)));

  // 🔴 No headings found means the mockup changed shape, not that everything passes. An empty
  // expectation that reports success is the purest form of a gate that cannot fail.
  if (!headings.length) {
    console.log(`  ⚠️  no <h2> headings found in ${pair.mockup} — this check is not reading anything.`);
    process.exit(2);
  }

  for (const h of headings) {
    checked++;
    if (live.includes(h)) continue;
    // Say what it drifted TO, so the fix is obvious rather than a hunt.
    const words = h.split(/\s+/).filter((w) => w.length > 4).slice(0, 2);
    const near = words.length
      ? (live.match(new RegExp(`title: "[^"]*${words[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"]*"`)) || [])[0]
      : null;
    fail.push(`${pair.what}: the approved heading "${h}" is not rendered`
      + (near ? ` — the closest thing live is ${near}` : " — nothing close to it is live either"));
  }
  console.log(`  ${pair.what}: ${headings.length} approved heading(s) checked against ${pair.renders}`);
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} heading(s) drifted from what was approved:`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   An approved mockup is a specification. Changing its words is a thing to ASK for,");
  console.log("   not a thing to do quietly — he compares the two screenshots side by side.");
  process.exit(1);
}

console.log(`\n✅ all ${checked} approved heading(s) are rendered verbatim.`);
process.exit(0);
