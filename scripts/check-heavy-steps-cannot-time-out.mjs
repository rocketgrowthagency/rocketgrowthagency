#!/usr/bin/env node
/**
 * check-heavy-steps-cannot-time-out.mjs — a step that can exceed the request ceiling must run in the background.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * Netlify kills a synchronous function at **26 seconds**. `m1.gbp.photos` took ~31s and returned a
 * 504 HTML page three times out of three — obvious, and fixed by moving it to a background function.
 *
 * `m1.gbp.attributes` is the dangerous version of the same bug: at 1,200 tokens it took **27 seconds**
 * — it **failed once and succeeded once** in the same minute. An intermittent 504 reads as a fluke,
 * gets retried, and never gets fixed. Meanwhile **19 steps** sat at 900+ tokens outside the background
 * path, each one a coin-flip away from the same failure.
 *
 * 🔑 Membership is DERIVED FROM `maxTokens`, not from which steps happened to fail in production.
 * Waiting for a step to prove it is slow means discovering it during a client's onboarding.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every executor requesting >= THRESHOLD tokens is in the HEAVY set.
 *   2. The background function exists and flow-execute queues to it.
 *   3. HEAVY names only steps that exist (an excuse list that drifts stops being read).
 *
 * Exit 0 = nothing can time out · 1 = a step can 504 · 2 = could not read.
 */
import fs from 'node:fs';

const SELF_TEST = process.argv.includes('--self-test');
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. A gate nobody can make fail is a gate nobody has
// checked. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const FLOW = `${SITE}/netlify/functions/flow-execute.js`;
const BG = `${SITE}/netlify/functions/flow-execute-heavy-background.js`;

// 900 is deliberately BELOW the token count that actually failed (1,200 → 27s). The margin is the
// point: a threshold set at the observed failure only catches the next step after it has failed too.
const THRESHOLD = 900;

export function verdict(src, hasBackground) {
  const out = [];
  if (!src) return ['flow-execute.js is missing'];
  if (!hasBackground) out.push('flow-execute-heavy-background.js is missing — there is nowhere for a slow step to go');
  if (!/flow-execute-heavy-background/.test(src)) out.push('flow-execute never queues to the background function');

  const hm = src.match(/const HEAVY = new Set\(\[([\s\S]*?)\]\);/);
  if (!hm) return out.concat(['no HEAVY set found — every step runs synchronously']);
  const heavy = new Set([...hm[1].matchAll(/"(m[12]\.[a-z0-9_.]+)"/g)].map((m) => m[1]));

  const blocks = src.split(/\n  "(m[12]\.[a-z0-9_.]+)":/);
  const known = new Set();
  for (let i = 1; i < blocks.length; i += 2) {
    const name = blocks[i], body = blocks[i + 1] || '';
    known.add(name);
    const tok = body.match(/maxTokens:\s*(\d+)/);
    if (!tok) continue;
    if (Number(tok[1]) >= THRESHOLD && !heavy.has(name)) {
      out.push(`${name} asks for ${tok[1]} tokens and runs SYNCHRONOUSLY — it can exceed 26s and 504`);
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴🔴 SLOW FOR A REASON THE TOKEN COUNT CANNOT SEE (added 2026-10-05).
  //
  // Chris pressed Run again on `m1.strategy.keywords_locations` and got
  // `Unexpected token '<', "<HTML> <HE"... is not valid JSON` — the 504 HTML page, parsed as JSON.
  // The step asks for few tokens, so the maxTokens rule above passed it. It is slow because of what
  // it CALLS: a geography ladder, Keyword Planner volumes for up to 25 terms, and map-pack
  // difficulty probes. `core_web_vitals` and `audit.website` had already been added to HEAVY BY HAND
  // for exactly this reason — which means the rule existed in a comment and not in the gate.
  //
  // 🔑 HEAVINESS IS DERIVABLE FROM WHAT AN EXECUTOR CALLS, NOT ONLY FROM WHAT IT ASKS FOR. Any
  // executor that reaches a third-party API — or a module whose whole job is to reach one — can
  // outlast the ceiling whatever its token budget.
  // → feedback_a_gate_must_pin_the_property_not_the_spelling
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const EXTERNAL = [
    [/_ads-keywords/, 'the Google Ads Keyword Planner'],
    [/serpapi\.com|SERPAPI_KEY/, 'SerpAPI'],
    [/places\.googleapis\.com|GOOGLE_PLACES_API_KEY/, 'the Places API'],
    [/pagespeedonline|PAGESPEED/i, 'the PageSpeed API'],
  ];
  for (let i = 1; i < blocks.length; i += 2) {
    const name = blocks[i], body = blocks[i + 1] || '';
    if (heavy.has(name)) continue;
    // Strip comments: these executors DOCUMENT the APIs they used to call.
    const code = body.replace(/^\s*\/\/.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const [re, label] of EXTERNAL) {
      if (re.test(code)) {
        out.push(`${name} calls ${label} and runs SYNCHRONOUSLY — an external API is slow for a `
          + `reason maxTokens cannot see, and it can exceed 26s and 504`);
        break;
      }
    }
  }

  for (const h of heavy) {
    if (!known.has(h)) out.push(`HEAVY names ${h}, which is not an executor — the list has drifted`);
  }
  return out;
}

if (SELF_TEST) {
  const mk = (heavy, steps) =>
    `const HEAVY = new Set([${heavy.map((h) => `"${h}"`).join(',')}]);\nflow-execute-heavy-background\n` +
    steps.map(([n, t]) => `\n  "${n}": async () => {\n    maxTokens: ${t},\n  },`).join('');
  const cases = [
    ['a slow step is in HEAVY', mk(['m1.gbp.photos'], [['m1.gbp.photos', 1500]]), 0],
    ['THE BUG: slow step runs synchronously', mk([], [['m1.gbp.attributes', 1200]]), 1],
    ['a fast step need not be heavy', mk([], [['m1.web.schema', 300]]), 0],
    ['HEAVY naming a step that does not exist', mk(['m1.gone.away'], [['m1.web.schema', 300]]), 1],
    ['exactly at the threshold counts', mk([], [['m1.gbp.qa_seed', 900]]), 1],
  ];
  let bad = 0;
  for (const [label, src, want] of cases) {
    const got = verdict(src, true).length;
    const ok = (got > 0) === (want === 1);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${got})`);
  }
  console.log(`\n[timeout] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

let src;
try { src = fs.readFileSync(FLOW, 'utf8'); }
catch (e) { console.error(`[timeout] INDETERMINATE — ${e.message}`); process.exit(2); }

const problems = verdict(src, fs.existsSync(BG));
if (problems.length) {
  console.error('✗ a step can exceed the 26-second request ceiling and return a 504:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\n  Add it to HEAVY. An intermittent timeout is worse than a reliable one — it reads');
  console.error('  as a fluke, gets retried, and never gets fixed.');
  process.exit(1);
}
console.log(`✅ every step asking for ${THRESHOLD}+ tokens runs in the background; none can time out.`);
process.exit(0);
