#!/usr/bin/env node
/**
 * check-guardrails-terminal.mjs — static guard: a step-3 GUARDRAIL must FAIL THE LEAD, never be logged
 * and shrugged off.
 *
 * This exists because the guards were never the problem — the catches were. step-3 correctly threw
 * "[step-3 GUARDRAIL] detail card never opened", and then:
 *   1. goToMapsShowResultsThenOpenBusiness's catch turned it into a warning + `return 'none'`, and
 *   2. recordDesktopMapsVideo's catch logged "had error, but video was still saved" and returned true.
 * So sunko-solar (08-09) shipped a Maps segment frozen on the raw results list with the guard firing.
 * A silent catch is invisible in review; this test makes re-introducing one fail the run.
 *
 * Usage: node scripts/check-guardrails-terminal.mjs      Exit 0 = intact, 1 = a guardrail can be swallowed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'step-3-video-recorder.mjs'), 'utf8');

// Each check: a description + a predicate over the source.
const CHECKS = [
  {
    name: 'guardrail errors are identifiable',
    ok: () => /const isGuardrailError\s*=/.test(SRC) && /\\\[step-3 GUARDRAIL\\\]/.test(SRC),
    why: 'isGuardrailError() is how both catches tell a known-bad render from an ordinary error',
  },
  {
    name: 'the Maps-nav catch RE-THROWS guardrails',
    ok: () => /catch \(err\) \{[\s\S]{0,400}?if \(isGuardrailError\(err\)\) \{[\s\S]{0,300}?throw err;/.test(SRC),
    why: 'without the re-throw a broken segment continues to encoding (the sunko path)',
  },
  {
    name: 'the recorder records a guardrail as fatal',
    ok: () => /if \(isGuardrailError\(err\)\) fatalGuardrail = err;/.test(SRC),
    why: 'the outer catch must distinguish a guardrail from a recoverable error',
  },
  {
    name: 'a guardrail discards the file and fails the lead',
    ok: () => /if \(fatalGuardrail\) \{[\s\S]{0,400}?unlinkSync\(outputPath\)[\s\S]{0,400}?return false;/.test(SRC),
    why: '"had error, but video was still saved" is exactly how the broken video shipped',
  },
  {
    name: 'holdOnDetailCard still hard-fails a card that never opened',
    ok: () => /if \(!_cardReady\.open\) \{[\s\S]{0,300}?throw new Error\('\[step-3 GUARDRAIL\]/.test(SRC),
    why: 'freezing the raw results list is the no-card failure mode',
  },
  {
    name: 'holdOnDetailCard hard-fails a blank-white hero on the actual frame',
    ok: () => /if \(!frozen && lastHero && lastHero\.ok === false\) \{[\s\S]{0,300}?throw new Error\(`\[step-3 GUARDRAIL\]/.test(SRC),
    why: 'the pixel verdict is the single source of truth for a failed hero load',
  },
  {
    name: 'the widen step is bounded by the city scale limit',
    ok: () => /const scaleNow = await readMapScaleMeters\(page\);[\s\S]{0,200}?scaleNow >= CITY_SCALE_MAX_M/.test(SRC),
    why: 'a blind zoom-out after the city-zoom pass is what shipped a 10 mi map',
  },
  {
    name: 'city zoom is judged by the rendered scale bar, not the URL',
    ok: () => /const atCityLevel = async \(\) => \{[\s\S]{0,300}?readScaleMeters\(\)/.test(SRC),
    why: "the URL keeps the place's own @…z after Maps fits to bounds — it lies",
  },
];

let failures = 0;
for (const c of CHECKS) {
  let pass = false;
  try { pass = !!c.ok(); } catch { pass = false; }
  if (pass) console.log(`  ✓ ${c.name}`);
  else { console.error(`  ✗ ${c.name} — ${c.why}`); failures++; }
}

if (failures) {
  console.error(`\n❌ ${failures} guardrail(s) can be swallowed — a known-broken video could ship.`);
  console.error('   See feedback_video_acceptance_gate_locked.md + project_video_pipeline_rework.md.');
  process.exit(1);
}
console.log(`\n✅ all ${CHECKS.length} guardrails are terminal — a broken render fails its lead.`);
