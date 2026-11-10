#!/usr/bin/env node
// check-no-review-gating.mjs — nothing RGA drafts, shows or sends asks for reviews selectively by how happy the customer is.
//
// 🔴 WHY (2026-10-19, the all-steps review, sop_step_atlas_v1): Monthly step 12's AI prompt asked for a
// "NEGATIVE FILTER (intercept 1-3★ before they post)" and a target of "4★+ reviews"; step 57's prompt aimed at "5 reviews
// 4★+"; the client's own step 12 said "Add 5 happy past customers" and "send us 5 happy customers". Google's review policy
// forbids selectively soliciting positive reviews and discouraging negative ones; the FTC's 2024 rule (16 CFR 465) bans
// review suppression. RGA drafted it for every client. ON SCREEN / IN PROMPTS only: `//` comments are skipped.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const GATING = /negative filter|intercept[^.\n]{0,30}★|(?<!\b(?:repl(?:y|ies)|approves each)\b[^.\n]{0,40})before (they|it) posts?\b|\b[1-5]★\s*\+|\b[1-5]★ and up\b|\bhappy (past |recent )?customers?\b|only (ask|request|text|email)[^.\n]{0,40}\b(happy|satisfied|positive|5★)/gi;
for (const [w, want] of [["NEGATIVE FILTER (intercept 1-3★ before they post)", true], ["5 reviews 4★+", true], ["Add 5 happy past customers", true], ["only ask the satisfied ones", true],
  ["the client approves each reply before it posts", false], ["the client approves each before it posts", false], ["we hold the review before it posts", true], ["UNHAPPY-CUSTOMER PLAN", false], ["you're happy for Google to show it", false], ["5 recent past customers", false], ["IF_HAPPY", false]]) {
  GATING.lastIndex = 0;
  if (GATING.test(w) !== want) { console.error(`⚠️  INDETERMINATE — the detector is wrong about "${w}" (expected ${want ? "flag" : "pass"})`); process.exit(2); }
}
const FILES = [`${SITE}/netlify/functions/flow-execute.js`, `${SITE}/portal/portal.js`, `${SITE}/admin/admin.js`, `${SITE}/data/playbooks/playbooks.json`,
  `${SITE}/data/playbooks/client-steps.json`, `${SCR}/flow/playbooks/month1.mjs`, `${SCR}/flow/playbooks/month2plus.mjs`, `${SCR}/flow/playbooks/_actor-map.mjs`];
const fails = []; const F = (m) => fails.push(m); let read = 0;
for (const f of FILES) {
  let src; try { src = fs.readFileSync(f, "utf8"); read++; } catch { continue; }
  src.split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    GATING.lastIndex = 0;
    for (const m of line.matchAll(GATING)) F(`${f.replace(SITE + "/", "").replace(SCR + "/", "scraper/")}:${i + 1} — "${m[0]}" asks for reviews by rating/happiness`);
  });
}
if (read < FILES.length) { console.error(`⚠️  INDETERMINATE — read ${read} of ${FILES.length} files`); process.exit(2); }
if (fails.length) { console.error("🔴 review gating — asking only happy customers, or filtering low ratings:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log(`✅ no prompt, step text or portal copy asks for reviews by rating or happiness (${read} files)`);
