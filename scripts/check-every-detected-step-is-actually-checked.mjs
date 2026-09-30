#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP THAT SAYS "WE DETECT THIS" MUST BE DETECTABLE, AND ACTUALLY DETECTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-30, looking at an admin checklist asking for Google access his client granted on
 * 6 September: *"if the client already does the API google approval does ADMIN still need to set up
 * this?"* No. The product agreed with him in three places and the checklist was the only one asking.
 *
 * 🔴🔴 THREE NUMBERS THAT SHOULD HAVE BEEN ONE:
 *   · **9** steps declare `clientDone: "detected"` — the portal shows them as automatic and offers
 *     the client a **Check again** button
 *   · **8** had a probe. `m1.review.first_5` had none, so its Check again returned a 400 —
 *     a control that always errors is worse than no control
 *   · **2** were in the nightly sweep, a hand-written list in `metrics-daily-refresh`
 *
 * So the three Google access steps had working probes that **nothing ever called**.
 * `oauth-google-callback` writes them done ONCE at connect; reset them — which is exactly what
 * walking the SOP does — and nothing puts them back. The admin chased access that already existed.
 *
 * 🔑 ONE LIST, DERIVED. The nightly reads the probe table; a second copy of "which steps can we
 * check" is a second thing to forget.
 * → feedback_a_hardcoded_count_is_a_skipped_query · feedback_fix_the_class_not_the_instance
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], pass = [];
const req = createRequire(path.join(SITE, "package.json"));

const pbPath = path.join(SITE, "data/playbooks/playbooks.json");
const rcPath = path.join(SITE, "netlify/functions/portal-step-recheck.js");
const mdPath = path.join(SITE, "netlify/functions/metrics-daily-refresh.js");
for (const p of [pbPath, rcPath, mdPath]) {
  if (!fs.existsSync(p)) { console.error(`⚠️  INDETERMINATE — ${p} missing.`); process.exit(2); }
}

let declared, ids;
try {
  const pb = JSON.parse(fs.readFileSync(pbPath, "utf8"));
  declared = [...(pb.month1 || []), ...(pb.month2plus || [])]
    .filter((s) => s.clientDone === "detected").map((s) => s.id);
} catch (e) { console.error(`⚠️  INDETERMINATE — playbooks.json: ${e.message}`); process.exit(2); }

// 🔑 RUN THE MODULE, do not regex it. The probe table is the only honest answer to "what can we
// check", and a regex over it would be a claim about the source rather than about the exports.
try {
  const m = req(rcPath);
  if (typeof m.PROBE_IDS !== "function") {
    fail.push("netlify/functions/portal-step-recheck.js — `PROBE_IDS` is no longer exported, so the "
      + "nightly sweep has to carry its own copy of the list. That copy is what drifted to two "
      + "entries while nine steps declared themselves detected.");
    ids = null;
  } else ids = m.PROBE_IDS();
} catch (e) {
  console.error(`⚠️  INDETERMINATE — portal-step-recheck would not load: ${e.message}`);
  process.exit(2);
}

if (ids) {
  // ── 1 · every step that SAYS it is detected can be ─────────────────────────────────────────────
  const noProbe = declared.filter((d) => !ids.includes(d));
  if (noProbe.length) {
    fail.push(`${noProbe.length} step(s) declare \`clientDone: "detected"\` with no probe: `
      + `${noProbe.join(", ")}. The client's portal shows them as automatic and gives them a "Check `
      + `again" button that returns a 400 — a control that can only ever fail.`);
  } else pass.push(`all ${declared.length} steps that claim to be detected have a probe`);

  // ── 2 · and nothing probes a step that never asked ────────────────────────────────────────────
  const noStep = ids.filter((i) => !declared.includes(i));
  if (noStep.length) {
    fail.push(`${noStep.length} probe(s) belong to no declared step: ${noStep.join(", ")}. The `
      + "endpoint refuses them, so the work of writing the probe reaches nobody.");
  } else pass.push("no probe exists for a step that never claimed to be detected");
}

// ── 3 · the nightly reads the table rather than restating it ───────────────────────────────────
{
  const md = fs.readFileSync(mdPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const m = md.match(/const PROBED_STEPS\s*=\s*([^;]+);/);
  if (!m) {
    fail.push("netlify/functions/metrics-daily-refresh.js — PROBED_STEPS is gone, so nothing "
      + "re-derives a detected step after it is reset. They close once at connect and never again.");
  } else if (/\[/.test(m[1])) {
    fail.push("netlify/functions/metrics-daily-refresh.js — PROBED_STEPS is a written list again: "
      + `\`${m[1].trim().slice(0, 60)}\`. That is the defect: it said two while nine steps declared `
      + "themselves detected, so three Google access steps were never re-checked at all.");
  } else if (!/PROBE_IDS\(\)/.test(m[1])) {
    fail.push("netlify/functions/metrics-daily-refresh.js — PROBED_STEPS is not read from the probe "
      + "table, so the two can drift apart again.");
  } else pass.push("the nightly sweeps exactly the steps the probe table can check");
}

for (const x of pass) console.log(`  ✅ ${x}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) a "detected" step goes unchecked.`); process.exit(1); }
console.log(`\n✅ every detected step is detectable, and swept (${pass.length} checks).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. add `clientDone: "detected"` to a step with no probe   → a Check again that 400s
 *   2. delete a probe whose step still declares detected      → same
 *   3. put a written array back in PROBED_STEPS               → the original defect
 *   4. stop exporting PROBE_IDS                               → the nightly must copy the list
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
