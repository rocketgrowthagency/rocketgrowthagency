#!/usr/bin/env node
/**
 * check-questions-fit-the-trade.mjs — every approved industry is asked questions that fit it.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * Chris: *"these questions won't work for a restaurant — we must tailor to business type."* Until
 * that day only the "Pick this if…" example varied, so a dentist was asked how soon they could
 * "start on a new customer" and a solicitor whether they take "urgent jobs".
 *
 * Checking coverage then found something worse and already live: FOUR of the ten approved
 * industries — foundation repair, orthodontists, plastic surgeons, solar installers — matched no
 * group at all, and "Roofer" and "Roofing contractor" matched DIFFERENT groups, so the same
 * business got different wording depending on how Google spelled its category.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every approved industry, in every spelling we know, maps to a group.
 *   2. No group exists without content — an empty group is WORSE than no match, because an
 *      unmatched business gets deliberately neutral examples by design.
 *   3. A variant never invents an option key. The key is the identity of the answer.
 *   4. A variant's stored value is a FACT, never the tapped label, and never duplicated across two
 *      option keys — a value that maps back to two keys cannot be read back reliably.
 *   5. Every value any trade can store round-trips: isCurrentAnswer accepts it and optionKeyFor
 *      returns the key it came from. Miss this and tailoring silently un-answers people.
 *   6. Variant guidance is still numbered instructions, and no option label opens with "We".
 *
 * Exit 0 = the questions fit · 1 = they do not · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "package.json"));

let M, SCHEMA;
try { M = req("./netlify/functions/_client-facts.js"); SCHEMA = M.SCHEMA; }
catch (e) { console.error(`[trade] INDETERMINATE — ${e.message}`); process.exit(2); }

// The ten locked industries, in the spellings Google actually returns as a category.
// → project_approved_industries
const APPROVED = [
  "HVAC contractor", "Heating contractor", "Air conditioning contractor",
  "Plumber", "Pest control service", "Roofer", "Roofing contractor",
  "Kitchen remodeler", "Bathroom remodeler", "Remodeling contractor",
  "Foundation repair", "Dentist", "Orthodontist", "Cosmetic dentist",
  "Plastic surgeon", "Lawyer", "Personal injury attorney", "Solar energy contractor",
  "Solar installer",
];

const fail = [];
console.log("── the questions fit the trade being asked ──");

// 1 ─ coverage
const unmapped = APPROVED.filter((t) => !M.industryGroup(t));
if (unmapped.length) {
  fail.push(`${unmapped.length} approved industry spelling(s) map to NO group: ${unmapped.join(", ")}`);
}
// the same trade must not land in two groups depending on spelling
for (const [a, b] of [["Roofer", "Roofing contractor"], ["Solar installer", "Solar energy contractor"],
                      ["Dentist", "Cosmetic dentist"], ["Lawyer", "Personal injury attorney"]]) {
  const ga = M.industryGroup(a), gb = M.industryGroup(b);
  if (ga && gb && ga !== gb) fail.push(`"${a}" → ${ga} but "${b}" → ${gb}; one business, two sets of wording`);
}

// 2 ─ no empty groups
const groups = Object.keys(SCHEMA.industry_groups?.groups || {});
const withHints = new Set(Object.values(SCHEMA.industry_groups?.hints || {}).flatMap((g) => Object.keys(g)));
const withVariants = new Set(Object.values(SCHEMA.industry_groups?.variants || {}).flatMap((g) => Object.keys(g)));
for (const g of groups) {
  if (!withHints.has(g) && !withVariants.has(g)) {
    fail.push(`group "${g}" has no hints and no variants — a business matching it gets another trade's wording, which is worse than the neutral fallback it would otherwise get`);
  }
}

// 3 + 4 ─ variants stay honest
for (const [qKey, byGroup] of Object.entries(SCHEMA.industry_groups?.variants || {})) {
  const base = M.FIELDS.find((f) => f.key === qKey);
  if (!base) { fail.push(`variant declared for unknown question "${qKey}"`); continue; }
  const baseKeys = (base.options || []).map((o) => o.key);
  for (const [g, v] of Object.entries(byGroup)) {
    if (!groups.includes(g)) fail.push(`${qKey}: variant for unknown group "${g}"`);
    for (const [optKey, ov] of Object.entries(v.options || {})) {
      if (!baseKeys.includes(optKey)) {
        fail.push(`${qKey}.${g}.${optKey} — no such option on the base question; a variant may reword an answer, never invent one`);
      }
      if (ov.value && ov.label && ov.value === ov.label) {
        fail.push(`${qKey}.${g}.${optKey} — stored value is identical to the tapped label; one is read by a person, the other by 41 prompts`);
      }
      if (ov.label && /^(We|Our)\b/.test(ov.label)) {
        fail.push(`${qKey}.${g}.${optKey} — label opens with "We", which in this portal means RGA`);
      }
    }
    for (const p of v.guidance?.paragraphs || []) {
      if (!/^\d+\./.test(p)) fail.push(`${qKey}.${g} — guidance paragraph is not a numbered step: "${p.slice(0, 44)}…"`);
    }
  }
}

// 4b + 5 ─ every storable value is unique and round-trips
for (const f of M.FIELDS) {
  if (f.type !== "choice") continue;
  const all = M.allValuesFor(f.key);
  const seen = new Map();
  for (const { value, key } of all) {
    if (seen.has(value) && seen.get(value) !== key) {
      fail.push(`${f.key}: the value ${JSON.stringify(value.slice(0, 40))} is stored by BOTH "${seen.get(value)}" and "${key}" — it cannot be read back to one answer`);
    }
    seen.set(value, key);
    if (!M.isCurrentAnswer(f.key, value)) {
      fail.push(`${f.key}.${key}: a value this question can store reads back as NOT ANSWERED — tailoring would silently un-answer that trade`);
    }
    if (M.optionKeyFor(f.key, value) !== key) {
      fail.push(`${f.key}.${key}: stored value maps back to "${M.optionKeyFor(f.key, value)}"`);
    }
  }
}

// every approved trade can answer every question and have it stick
for (const trade of APPROVED) {
  for (const f of M.FIELDS) {
    if (f.type !== "choice") continue;
    for (const o of f.options || []) {
      const r = M.normaliseAnswer(f.key, { option: o.key }, trade);
      if (r.error) { fail.push(`${trade} cannot answer ${f.key}.${o.key}: ${r.error}`); continue; }
      if (!M.isCurrentAnswer(f.key, r.value)) {
        fail.push(`${trade} answering ${f.key}.${o.key} stores a value that reads back as unanswered`);
      }
    }
  }
}

const variantCount = Object.values(SCHEMA.industry_groups?.variants || {}).reduce((n, g) => n + Object.keys(g).length, 0);
console.log(`  ${APPROVED.length} approved spellings · ${groups.length} groups · ${variantCount} question variants`);
console.log(`  groups in use: ${[...new Set(APPROVED.map((t) => M.industryGroup(t)))].join(", ")}`);

if (fail.length) {
  console.error(`\n✗ the questions do not fit every trade — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  A question asked in the wrong words gets a guess, and a guess gets published.");
  process.exit(1);
}
console.log("  ✅ every approved trade is asked questions that fit, and every answer round-trips");
process.exit(0);
