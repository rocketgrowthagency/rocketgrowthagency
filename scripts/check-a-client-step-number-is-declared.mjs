#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// NO TWO ROWS IN THE CLIENT'S PORTAL CARRY THE SAME NUMBER
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 WHAT WENT WRONG (measured 2026-10-07, live). The portal numbered its rows with
//
//     it.step.clientStepNo ?? idx + 1
//
// and FOUR client-visible steps declare no `clientStepNo` — the three access grants and the
// duplicate-listing check. Each fell back to its position in the array, so the client's own portal
// showed **four pairs of duplicate numbers**: two rows labelled 2, two labelled 3, two labelled 4,
// two labelled 6. Eight collisions across 22 rows.
//
// 🔑 THE COMMENT DIRECTLY ABOVE THAT LINE ARGUES AGAINST IT — *"A number derived from an array index
// is a number that belongs to the array, not to the step"*, written after a reorder on 2026-09-17
// renamed the step Chris had spent the day calling "5". The rule was stated and the fallback
// survived underneath it.
//
// 🔑 AN ABSENCE MUST NOT BE READABLE AS A VALUE. A step with no declared number has none, and its
// marker shows state instead. Giving those four real numbers is a content decision about what the
// client is told — not something a render-time fallback should invent.
// → feedback_an_absence_must_never_be_readable_as_a_value · feedback_a_comment_asserting_a_fix_is_not_the_fix
//
// Exit 0 healthy · 1 two rows share a number, or one is invented · 2 INDETERMINATE

import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
let pb, portal;
try {
  pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  portal = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot read the playbook or the portal: ${e.message}`); process.exit(2); }

// 🔑 THE VISIBLE BUCKETS COME FROM THE PORTAL, never a list typed here — it decides what a client sees.
const vis = [...portal.matchAll(/clientBucket !== "(\w+)" && s\.clientBucket !== "(\w+)"/g)][0];
const BUCKETS = vis ? [vis[1], vis[2]] : ["supply", "act"];
const rows = Object.keys(pb).flatMap((b) => (pb[b] || []).filter((s) => BUCKETS.includes(s.clientBucket)));
// 🔑 2026-10-08 — the client reads the PROJECTION, ordered by their own numbers since the admin's
// Month-1 order changed (onboarding_order_audit_v1). Same rule as build-client-steps byClientNumber.
const byClientNumber = (steps) => { let last = 0;
  return steps.map((st, i) => { if (st.clientStepNo != null) last = Number(st.clientStepNo);
    return { st, i, key: st.clientStepNo != null ? Number(st.clientStepNo) : last + 0.5 }; })
    .sort((a, b) => a.key - b.key || a.i - b.i).map((k) => k.st); };
let cs = null;
try { cs = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/client-steps.json`, "utf8")); } catch { /* reported below */ }
if (!rows.length) { console.error("⚠️  INDETERMINATE — no client-visible steps found."); process.exit(2); }

// 1 · the render must not invent a number from the array index
// 🔴 STRIP COMMENTS FIRST — the portal's own comment QUOTES the old fallback to explain why it was
// removed, so this read the documentation and accused the fixed code. Line comments before block.
// → feedback_a_comment_stripper_in_the_wrong_order_deletes_code · feedback_a_check_must_not_validate_itself
const portalCode = portal.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
if (/clientStepNo\s*\?\?\s*idx\s*\+\s*1/.test(portalCode)) {
  fails.push("the portal falls back to the array index when a step declares no number — an index "
    + "belongs to the array, not to the step, and it collides with the declared ones");
}

// 2 · no two DECLARED numbers may be equal
const declared = rows.filter((s) => s.clientStepNo != null);
const seen = new Map();
for (const s of declared) {
  if (seen.has(s.clientStepNo)) {
    fails.push(`two client rows both show #${s.clientStepNo}: "${seen.get(s.clientStepNo)}" and "${s.title}"`);
  } else seen.set(s.clientStepNo, s.title);
}

// 3 · declared numbers must ascend in the order the client reads them
if (!cs) fails.push("client-steps.json (what the client reads) cannot be read");
else for (const scope of ["month1", "month2plus"]) {
  const shown = (cs[scope] || []).filter((s) => BUCKETS.includes(s.clientBucket));
  let prev = -Infinity, order = true;
  for (const s of shown) { if (s.clientStepNo == null) continue; if (s.clientStepNo < prev) order = false; prev = s.clientStepNo; }
  if (!order) fails.push(`${scope}: the numbers do not ascend in the order the client reads them — the client counts backwards`);
  const inProj = new Set((cs[scope] || []).map((s) => s.id));
  const want = byClientNumber((pb[scope] || []).filter((s) => inProj.has(s.id))).filter((s) => BUCKETS.includes(s.clientBucket)).map((s) => `${s.id}#${s.clientStepNo ?? "-"}`).join("|");
  const got = shown.map((s) => `${s.id}#${s.clientStepNo ?? "-"}`).join("|");
  if (want !== got) fails.push(`${scope}: what the client reads is not the playbook in client-number order — rebuild with scripts/build-client-steps.mjs`);
}

// 4 · 🔑 UNDECLARED IS ALLOWED, AND REPORTED. It is honest on screen; it is still a gap somebody
//     should close deliberately, so it is named rather than silently accepted.
const undeclared = rows.filter((s) => s.clientStepNo == null);

if (fails.length) {
  console.error(`❌ the client's step numbers are not trustworthy — ${fails.length} problem(s):\n`);
  for (const f of fails) console.error(`   · ${f}`);
  process.exit(1);
}
console.log(`✅ ${declared.length} declared client step number(s), none shared, all ascending`
  + (undeclared.length
    ? `\n  ▫️  ${undeclared.length} client-visible step(s) carry no number and show their state instead: `
      + undeclared.map((s) => `"${s.title}"`).join(", ")
    : ""));
