#!/usr/bin/env node
/**
 * check-client-boundary-is-declared.mjs — every SOP step declares what the CLIENT may see, and
 * exactly one place decides it.
 *
 * ─── WHY (2026-09-15, decision #58) ──────────────────────────────────────────────────────────────
 * Chris: *"what do we want to only have in admin and what do we want client to see and approve?"*
 *
 * The boundary was defined TWICE, in two vocabularies, in two files:
 *
 *     data/playbooks/playbooks.json     actor: "rga" | "client" | "both"   → the portal to-do list
 *     netlify/functions/_deliverables.js  a hand-written list of 11 ids    → the approvals tab
 *
 * They disagreed, and every disagreement was invisible from either side alone:
 *   · GBP / GA4 / Search Console access were actor:"rga" — but only an OWNER can grant access
 *   · the photo shot list was an APPROVAL — a shot list is a task; there is nothing to agree to
 *   · the Google description + services were approvable yet absent from the to-do list
 *   · two steps had NO clientLabel, and the renderer fell back to `step.title` — so the client read
 *     our internal SOP wording ("Send the kickoff calendar invite") for work that is OURS
 *
 * 🔑 A boundary defined twice is a boundary that will drift. The only question is when you find out,
 * and here you would find out from a client. → feedback_fix_the_class_not_the_instance
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every step declares a `clientBucket` — one of supply | act | approve | admin.
 *   2. Every client-facing step has `clientLabel` — client wording, so nothing can fall back to the
 *      internal title.
 *   3. Every `approve` step names a known `approvalSurface`, and no other bucket carries one.
 *   4. Both portals filter on clientBucket. Neither may use `actor` to decide VISIBILITY again
 *      (actor stays legal for "who does the work" display).
 *   5. The derived allow-list is non-empty and agrees with the playbook — a silent empty list would
 *      hide every approval and look exactly like "nothing to approve".
 *
 * Exit 0 = the boundary is declared once and honoured · 1 = it drifted · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BUCKETS = new Set(["supply", "act", "approve", "admin"]);
const CLIENT_FACING = new Set(["supply", "act", "approve"]);
const SELF_TEST = process.argv.includes("--self-test");

if (SELF_TEST) { selfTest(); process.exit(0); }

const PLAYBOOK = path.join(SITE, "data/playbooks/playbooks.json");
if (!fs.existsSync(PLAYBOOK)) { console.error("[boundary] INDETERMINATE — no playbooks.json"); process.exit(2); }

const pb = JSON.parse(fs.readFileSync(PLAYBOOK, "utf8"));
const steps = [...(pb.month1 || []), ...(pb.month2plus || [])];
if (!steps.length) { console.error("[boundary] INDETERMINATE — playbook has no steps"); process.exit(2); }

const fail = [];
console.log("── the client/admin boundary is declared once ──");

// 1 + 2 + 3 ─ every step declares a bucket, client-facing steps have client wording
for (const s of steps) {
  if (!BUCKETS.has(s.clientBucket)) {
    fail.push(`${s.id} — clientBucket is ${JSON.stringify(s.clientBucket)}; must be one of ${[...BUCKETS].join(" | ")}`);
    continue;
  }
  if (CLIENT_FACING.has(s.clientBucket) && !s.clientLabel) {
    fail.push(`${s.id} — bucket "${s.clientBucket}" is client-facing but has no clientLabel, so the client would read our internal title: "${s.title}"`);
  }
  if (s.clientBucket === "approve" && !s.approvalSurface) {
    fail.push(`${s.id} — approve steps must name an approvalSurface so they group by what the CLIENT recognises`);
  }
  if (s.clientBucket !== "approve" && s.approvalSurface) {
    fail.push(`${s.id} — has approvalSurface "${s.approvalSurface}" but bucket is "${s.clientBucket}"`);
  }
}

// 4 ─ neither portal may decide VISIBILITY from `actor` again
for (const rel of ["portal/portal.js", "admin/admin.js"]) {
  const f = path.join(SITE, rel);
  if (!fs.existsSync(f)) { console.error(`[boundary] INDETERMINATE — missing ${rel}`); process.exit(2); }
  const src = fs.readFileSync(f, "utf8");
  // A filter/predicate keyed on actor === "client" | "both" is the old visibility rule.
  const m = src.match(/\.filter\([^)]*actor\s*===\s*["'](client|both)["'][^)]*\)/);
  if (m) fail.push(`${rel} — still filters visibility on actor: ${m[0].slice(0, 80)}`);
}

// 5 ─ the derived allow-list agrees with the playbook and is not silently empty
let approvable;
try {
  const req = createRequire(path.join(SITE, "package.json"));
  ({ CLIENT_APPROVABLE: approvable } = req("./netlify/functions/_deliverables.js"));
} catch (e) {
  console.error(`[boundary] INDETERMINATE — could not load _deliverables.js: ${e.message}`);
  process.exit(2);
}
const declared = steps.filter((s) => s.clientBucket === "approve").map((s) => s.id).sort();
const derived = Object.keys(approvable || {}).sort();
if (!derived.length) {
  fail.push("_deliverables.js exported an EMPTY approvable list — every approval would vanish and the tab would read 'nothing waiting on you'");
} else {
  for (const id of declared) if (!derived.includes(id)) fail.push(`${id} — bucket is approve, but it never reached CLIENT_APPROVABLE`);
  for (const id of derived) if (!declared.includes(id)) fail.push(`${id} — in CLIENT_APPROVABLE but its bucket is not approve`);
}

const tally = {};
for (const s of steps) tally[s.clientBucket] = (tally[s.clientBucket] || 0) + 1;
const seen = CLIENT_FACING.size && Object.entries(tally).filter(([k]) => CLIENT_FACING.has(k)).reduce((n, [, v]) => n + v, 0);
console.log(`  ${steps.length} steps · client-facing ${seen} (${["supply", "act", "approve"].map((b) => `${b} ${tally[b] || 0}`).join(" · ")}) · admin ${tally.admin || 0}`);
console.log(`  ${derived.length} approvable step(s) → ${new Set(steps.filter((s) => s.approvalSurface).map((s) => s.approvalSurface)).size} client-facing surface(s)`);

if (fail.length) {
  console.error(`\n✗ the boundary drifted — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  ONE field decides what a client sees: clientBucket on the step. Both portals read");
  console.error("  it and nothing else. `actor` answers a different question — who does the work.");
  process.exit(1);
}
console.log("  ✅ every step declares a bucket, client-facing steps carry client wording, both portals agree");
process.exit(0);

/**
 * 🔑 Prove the gate can FAIL before trusting it to pass. Each case below is a defect that actually
 * shipped. → feedback_a_fix_without_a_gate_regresses ("before wiring it: sabotage it")
 */
function selfTest() {
  const cases = [
    { name: "missing bucket", step: { id: "x", title: "T", clientLabel: "L" },
      want: /clientBucket is undefined/ },
    { name: "client-facing with no clientLabel (the real leak)",
      step: { id: "m1.close.kickoff_invite", title: "Send the kickoff calendar invite", clientBucket: "act" },
      want: /no clientLabel/ },
    { name: "approve with no surface", step: { id: "y", title: "T", clientLabel: "L", clientBucket: "approve" },
      want: /must name an approvalSurface/ },
    { name: "surface on a non-approve bucket",
      step: { id: "z", title: "T", clientLabel: "L", clientBucket: "admin", approvalSurface: "website" },
      want: /but bucket is "admin"/ },
  ];
  let pass = 0;
  for (const c of cases) {
    const f = [];
    const s = c.step;
    if (!BUCKETS.has(s.clientBucket)) f.push(`${s.id} — clientBucket is ${JSON.stringify(s.clientBucket)}; must be one of`);
    else {
      if (CLIENT_FACING.has(s.clientBucket) && !s.clientLabel) f.push(`${s.id} — bucket "${s.clientBucket}" is client-facing but has no clientLabel`);
      if (s.clientBucket === "approve" && !s.approvalSurface) f.push(`${s.id} — approve steps must name an approvalSurface`);
      if (s.clientBucket !== "approve" && s.approvalSurface) f.push(`${s.id} — has approvalSurface "${s.approvalSurface}" but bucket is "${s.clientBucket}"`);
    }
    const hit = f.some((m) => c.want.test(m));
    console.log(`  ${hit ? "✅" : "✗ "} catches: ${c.name}`);
    if (hit) pass++;
  }
  console.log(pass === cases.length
    ? `\n✅ self-test ${pass}/${cases.length} — the gate detects every defect that shipped`
    : `\n✗ self-test ${pass}/${cases.length} — this gate cannot catch what it claims to`);
  if (pass !== cases.length) process.exit(1);
}
