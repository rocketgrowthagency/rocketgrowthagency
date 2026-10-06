#!/usr/bin/env node
/**
 * check-every-playbook-step-can-run.mjs — a step the graph waits on must be a step something can run.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * `m1.audit.competitors` is declared `type: "hybrid"`, so the admin rendered a Run button for it.
 * **No executor existed** — not in `flow-execute.js`, not as a delegated function, not as a local
 * script. Pressing Run fell through to the "run this locally" branch and printed a `flow.mjs` command
 * for a step `flow.mjs` does not implement either.
 *
 * It is a dependency of **`m1.strategy.keywords_locations`** and **`m1.gbp.optimize_categories`**,
 * and that second one gates `business_description` → `qa_seed` / `booking_link` / `services_products`.
 * **One missing runner held the entire GBP block shut**, and nothing anywhere said so.
 *
 * 🔑 This is the same shape as the 19-night production pause: the graph is right, every downstream
 * step is right, and the work can still never start, because one node has no way to reach `done`.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every `dependsOn` names a step that exists in the playbook.
 *   2. Every `auto` or `hybrid` step has an executor — direct, delegated, or explicitly excused here
 *      with a reason. `manual` steps are exempt by definition: a human does them.
 *   3. Nothing in the excuse list has since grown an executor (excuses must not rot).
 *
 * Exit 0 = every step is runnable · 1 = a step cannot be run or a dependency does not exist · 2 = could not read.
 */
import fs from 'node:fs';
import path from 'node:path';

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. A gate nobody can make fail is a gate nobody has
// checked. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const PLAYBOOKS = path.join(SITE, 'data/playbooks/playbooks.json');
const FLOW = path.join(SITE, 'netlify/functions/flow-execute.js');

// Steps with no in-function executor ON PURPOSE. "It has no runner" is never a reason — that is the
// thing being checked. The reason must say what runs it instead.
const NO_EXECUTOR_OK = {
  // 🔴 BOTH GRID EXCUSES REMOVED 2026-09-22. They claimed the scan "cannot run in a Netlify
  // function" — it can, and did: `v2-rank-grid-background` was already scheduled and already
  // wired to an admin button while these two steps told people to open a terminal and wait an
  // hour. The excuse was not a trade-off, it was a description of the wrong implementation.
  // Two hand-run scans on RGA died partway and persisted as complete-looking sessions.
};

const fail = [];
let pb, src;
try {
  pb = JSON.parse(fs.readFileSync(PLAYBOOKS, 'utf8'));
  src = fs.readFileSync(FLOW, 'utf8');
} catch (e) {
  console.error(`[playbook] INDETERMINATE — cannot read the playbook or the runner (${e.message})`);
  process.exit(2);
}

// 🔴 The id charset MUST include digits. A first pass used [a-z_.] and silently decided
// `m1.web.h1_cta` had no executor — a false finding produced by the probe, not the code.
// → feedback_a_check_must_not_validate_itself
const ID = '[a-z0-9_.]+';

// 🔴🔴 DO NOT PATTERN-MATCH THE SHAPE OF A HANDLER — READ THE MAP.
// The first version recognised exactly two spellings: `"id": async` and `["id", "fn-name"]`. Seven
// executors added 2026-09-14 register through
//     ...Object.fromEntries([...ids].map((id) => [id, async …]))
// which is neither, so the gate reported four steps as having NO executor when their code was sitting
// right there. A gate that only understands the shapes it was born knowing will keep raising false
// alarms as the code grows — and a gate that cries wolf gets muted.
// 🔑 So: take the EXECUTORS object literal by brace balance, strip comments, and treat EVERY step id
// quoted inside it as handled. That is shape-independent.
function executorIdsIn(src, prefix) {
  const at = src.indexOf('const EXECUTORS');
  if (at < 0) return null;                       // structure changed — caller reports INDETERMINATE
  const open = src.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  const body = src.slice(open, end)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...body.matchAll(new RegExp(`["'](${prefix}\\.${ID})["']`, 'g'))].map((m) => m[1]));
}

for (const [bookName, steps] of Object.entries({ month1: pb.month1, month2plus: pb.month2plus || [] })) {
  if (!steps.length) continue;
  const ids = new Set(steps.map((s) => s.id));
  const prefix = steps[0].id.split('.')[0];
  const have = executorIdsIn(src, prefix);
  if (!have) {
    console.error('[playbook] INDETERMINATE — could not find/parse the EXECUTORS object in flow-execute.js');
    process.exit(2);
  }

  for (const s of steps) {
    for (const d of s.dependsOn || []) {
      if (!ids.has(d)) fail.push(`${bookName}: ${s.id} depends on ${d}, which is not a step in the playbook`);
    }
    const type = s.type || 'manual';
    if (type === 'manual') continue;
    if (have.has(s.id)) {
      if (NO_EXECUTOR_OK[s.id]) fail.push(`${bookName}: ${s.id} is excused as having no executor, but one now exists — drop the excuse`);
      continue;
    }
    if (NO_EXECUTOR_OK[s.id]) continue;

    const blocks = steps.filter((o) => (o.dependsOn || []).includes(s.id)).map((o) => o.id);
    fail.push(
      `${bookName}: ${s.id} (type=${type}) has NO executor` +
      (blocks.length ? ` and BLOCKS ${blocks.length}: ${blocks.join(', ')}` : '')
    );
  }
  console.log(`[playbook] ${bookName}: ${steps.length} steps · ${have.size} executors found`);
}

if (fail.length) {
  console.error('\n✗ the onboarding graph contains work that can never start:');
  for (const f of fail) console.error(`    ${f}`);
  console.error('\n  A dependency nobody can satisfy is not a checklist item. It is a permanent stop');
  console.error('  that nobody labelled as one.');
  process.exit(1);
}
console.log('✅ every auto/hybrid step has an executor, and every dependency names a real step.');
process.exit(0);
