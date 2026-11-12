#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-found-email-is-the-business.mjs
//
// 🔒 WHY (Chris, 2026-11-12: "for every failure find the reason and fix … so we never forget or regress"): on the
// night of 11-11 the web email search gave pestboard@dca.ca.gov — California's Structural Pest Control Board, a
// state regulator — to TWO pest firms (American Structural Pest Control West, CA Pest Control Inglewood), and one
// of them got a live outreach video. It passed as a "name-match" because the local part contained "pest", a word
// of the SEARCH ("Pest control in El Segundo"), not of the business. STOP_WORDS only knew plumbing/HVAC words, so
// every other trade leaked the same way. A theme's demo address (support@consultio.com) was also kept.
// This gate holds:
//   1. step-2-email-scraper.mjs: the name-match tokens drop every word (or stem) of the search term, whatever
//      the trade or city — behavioural, on the real filter lifted out of the file;
//   2. lib/email-validation.cjs: a government or military address (any country) is never a contact, and the
//      theme vendor stays on the not-the-business list — behavioural, on the real module.
// exit 0 = a found email must be the business's · 1 = a search word or a regulator can still pass · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = []; const fail = (m) => F.push(m);
let src;
try { src = fs.readFileSync(path.join(ROOT, "step-2-email-scraper.mjs"), "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read step-2-email-scraper.mjs"); process.exit(2); }
let V;
try { V = createRequire(import.meta.url)(path.join(ROOT, "lib/email-validation.cjs")); } catch (e) { console.error(`⚠️  INDETERMINATE — cannot load lib/email-validation.cjs (${e.message})`); process.exit(2); }

// ── 1 · the name-match tokens, lifted from the file and run ──
const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const block = (code.match(/const tokens = businessNameTokens\(businessName\)[\s\S]*?;\n/) || [])[0];
const searchLine = (code.match(/const sharedStart = [^\n]*\n/) || [""])[0] + ((code.match(/const searchTokens = businessNameTokens\(searchTerm\);\n/) || [""])[0]);
if (!block) { console.error("⚠️  INDETERMINATE — could not find the name-match tokens in step-2-email-scraper.mjs"); process.exit(2); }
if (!/tokens\.some\(\(t\) => localPart\.includes\(t\)\)/.test(code)) fail("1a step-2: name-match no longer tests the local part against `tokens` (the gate's premise moved)");
const run = (businessName, searchTerm) => {
  try { return new Function("businessNameTokens", "businessName", "searchTerm", `${searchLine || ""}${block}return tokens;`)(V.businessNameTokens, businessName, searchTerm); }
  catch (e) { console.error(`⚠️  INDETERMINATE — the lifted token code threw: ${e.message}`); process.exit(2); }
};
const CASES = [
  // [business, search, the local part that must NOT match, a distinctive token that MUST survive]
  ["American Structural Pest Control West, Inc.", "Pest control in El Segundo, CA", "pestboard", "structural"],
  ["CA Pest Control Inglewood", "Pest control in El Segundo, CA", "pestboard", "inglewood"],
  ["Smile Dental Studio", "Dentists in Culver City, CA", "dentalboard", "smile"],
  ["Rivera Law Group", "Lawyers in Austin, TX", "lawboard", "rivera"],
  ["Sparkle Cleaning Co", "Cleaning services in Leeds, UK", "cleaningnews", "sparkle"],
  ["Segundo Roofing", "Roofers in El Segundo, CA", "segundonews", null],
  ["Lawson Plumbing", "Lawyers in Austin, TX", "lawyersboard", "lawson"],   // law/lawson share 3, not 4: the name survives
];
for (const [biz, search, local, keep] of CASES) {
  const tokens = run(biz, search);
  if (tokens.some((t) => local.includes(t))) fail(`1b "${local}@…" still name-matches "${biz}" on the search "${search}" (tokens: ${tokens.join(", ")})`);
  if (keep && !tokens.includes(keep)) fail(`1c "${biz}": the distinctive word "${keep}" was dropped too (tokens: ${tokens.join(", ") || "none"})`);
}

// ── 2 · regulators and the theme vendor are never the business ──
for (const e of ["pestboard@dca.ca.gov", "info@agency.gov.uk", "x@army.mil", "b@health.gc.ca", "c@dot.state.ca.us", "support@consultio.com"]) {
  if (V.isLikelyEmail(e)) fail(`2a ${e} is accepted as a business email`);
}
for (const e of ["info@governmentplumbing.com", "ops@gov.com", "info@southbaypestpros.com", "owner@gmail.com"]) {
  if (!V.isLikelyEmail(e)) fail(`2b ${e} is rejected (a real business would be lost)`);
}

if (F.length) {
  console.log(`❌ A FOUND EMAIL CAN BELONG TO SOMEONE ELSE (${F.length}):`);
  for (const f of F) console.log("   • " + f);
  console.log("   → project_night_run_needs_an_unlocked_screen (memory, the 11-11 night)");
  process.exit(1);
}
console.log("✅ a found email must be the business's: search words never name-match, regulators and theme demos are rejected");
process.exit(0);
