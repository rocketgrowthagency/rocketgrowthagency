#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT A STEP ASKS FOR MUST BE ENOUGH TO FINISH THAT STEP
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHAT WENT WRONG (found walking the SOP, 2026-10-07). Step 31 is titled "Upload 20+ quality
// photos", tells the client "Provide 20+ business photos", lists 22 shots in its SOP, and is marked
// done by DETECTION at `client_photos >= 20`.
//
// Its own runner drafted a **12-photo shot list.**
//
// Shoot exactly what the plan asks for and the step **never completes** — it sits waiting for 20
// forever, with nothing on screen explaining why. Four surfaces said 20 and the deliverable said 12.
//
// 🔑 THE 12 WAS A GOOD DECISION MADE IN ONE PLACE. It was trimmed because 20 shots × three fields
// kept truncating, and a 20-item document with three paragraphs each is one nobody shoots. Correct —
// and nobody reconciled it with the four surfaces that still said 20. A decision is not finished
// until every surface knows it. → project_the_keyword_step_hardened_2026-10-05
//
// 🔑 20 IS ALSO THE RESEARCHED NUMBER: current guidance puts a service business at 15-20 images
// across categories, and profiles with 20+ photos earn ~18% more clicks than photo-light ones. So
// the plan moved to 20, not the threshold to 12. → reference_local_citation_industry_standard
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

const read = (p, what) => {
  try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${what}`); process.exit(2); }
};
const strip = (src) => src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");
// 🔴 COMMENTS OUT FIRST, LINE BEFORE BLOCK. The comment above this very runner explains the trim and
// contains "20 shots" and "a 20-item document", so the gate read its own documentation as the number
// the prompt asks for — and a mutation back to 12 changed nothing it could see.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const exec = strip(read("netlify/functions/flow-execute.js", "flow-execute.js"));
const recheck = strip(read("netlify/functions/portal-step-recheck.js", "portal-step-recheck.js"));
let pb;
try { pb = JSON.parse(read("data/playbooks/playbooks.json", "playbooks.json")); }
catch { console.error("⚠️  INDETERMINATE — playbooks.json does not parse"); process.exit(2); }

// 🔑 EVERY DETECTED STEP, derived from the product — never a list someone typed. `countProbe` is how
// a step says "I am finished when there are N of these", so each one is a threshold a plan must meet.
const probes = [...recheck.matchAll(/"([a-z0-9._]+)":\s*async\s*\([^)]*\)\s*=>\s*countProbe\([^,]+,\s*"([a-z_]+)",\s*(\d+)/g)]
  .map((m) => ({ id: m[1], table: m[2], threshold: Number(m[3]) }));

if (!probes.length) {
  console.error("⚠️  INDETERMINATE — no countProbe thresholds found; this gate has nothing to compare");
  process.exit(2);
}

const steps = [...(pb.month1 || []), ...(pb.month2plus || [])];
let checked = 0;
for (const { id, table, threshold } of probes) {
  const step = steps.find((s) => s.id === id);
  if (!step) { F(`portal-step-recheck detects ${id}, which is not in either playbook`); continue; }

  // the number the runner's prompt asks the model to produce
  const at = exec.indexOf(`"${id}": async`);
  if (at < 0) continue;                       // no runner: nothing drafts a plan, nothing to reconcile
  const body = exec.slice(at, at + 2600);
  const asked = [...body.matchAll(/(\d+)\s*-?\s*(?:photo|item|shot|review|customer|entry|entries)/gi)].map((m) => Number(m[1]));
  if (!asked.length) continue;                // the runner drafts no counted list

  checked++;
  const best = Math.max(...asked);
  if (best < threshold) {
    F(`${id}: the runner drafts a plan for ${best}, but the step is only marked done at `
      + `${threshold} ${table} rows — follow the plan exactly and the step never completes`);
  }
  // and the words on screen must not contradict it either
  const copy = `${step.title} ${step.clientLabel || ""} ${step.instructions || ""}`;
  const stated = [
    ...[...copy.matchAll(/(\d+)\s*\+?\s*(?:quality\s+)?(?:photo|business photo|review|customer)/gi)].map((m) => Number(m[1])),
    ...[...copy.matchAll(/(\d+)\s+in all/gi)].map((m) => Number(m[1])),
  ];
  for (const n of new Set(stated)) {
    if (n !== threshold) {
      F(`${id}: a surface says ${n} while completion is detected at ${threshold} — `
        + `"${copy.replace(/\s+/g, " ").slice(0, 70)}…"`);
    }
  }
}

if (fails.length) {
  console.error("🔴 a step asks for less than it needs to finish:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ every drafted plan can satisfy its own step — ${probes.length} detected step(s), ${checked} with a counted plan, all meeting their threshold`);
