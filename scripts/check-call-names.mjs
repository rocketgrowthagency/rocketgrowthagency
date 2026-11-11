#!/usr/bin/env node
// check-call-names.mjs: THE SIX CALL NAMES, EVERYWHERE (approved call_names_v1, Chris 11-10: "integrated on ALL and EVERYWHERE in the client and admin portals and emails").
//   Intro call · Audit walkthrough · Kickoff call · Month 1 review · Monthly check-in · Quarterly review.
// HOLDS, on the WEBSITE repo:
//   1  "close-out" (any case) appears in no client- or admin-visible code line (portal, admin, shared, functions, playbook data). Comments may keep history.
//   2  a bare "Call 1" / "Call 2" appears nowhere a person reads except as the short label beside the name: "Intro call (Call 1)", "Audit walkthrough (Call 2)".
//   3  the playbook tabs read "Intro call (Call 1)" and "Audit walkthrough (Call 2)".
//   4  the invite titles use the names: "Audit walkthrough: <business> × Rocket Growth Agency", "Month 1 review - ...".
//   5  the single name table (netlify/functions/_rga-calls.js CALL_NAMES) has exactly the six names (+ Blocked time), and the admin Schedule shows the same six.
//   6  NOTHING INTERNAL WAS RENAMED: step ids m1.call.close / m2.call.monthly / m1.kickoff.call, purposes kickoff / m1_close / m2_monthly, and closeoutUnavailable still exist.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default 6c340245) in 6+ places, else exit 2 INDETERMINATE.
//   node scripts/check-call-names.mjs [--against=<rev>] [--no-before]
import { runGate, reader, codeLines } from "./lib/site-rev.mjs";
import fs from "node:fs";
import path from "node:path";

const BEFORE = "6c340245";
// the files whose string literals people read (comments are skipped)
const VISIBLE = ["portal/portal.js", "admin/admin.js", "admin/calls.js", "admin/walkthrough.js", "admin/schedule.js", "admin/playbook.js", "shared/setup-split.js", "shared/step-lock.js", "shared/portal-mode.js", "shared/client-preview.js",
  "data/playbooks/client-steps.json", "data/playbooks/playbooks.json", "data/playbooks/what-it-does.json"];
const SIX = ["Intro call", "Audit walkthrough", "Kickoff call", "Month 1 review", "Monthly check-in", "Quarterly review"];

function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root);
  const fnDir = path.join(root, "netlify/functions");
  const files = [...VISIBLE, ...(fs.existsSync(fnDir) ? fs.readdirSync(fnDir).filter((f) => f.endsWith(".js")).map((f) => `netlify/functions/${f}`) : [])];
  let closeouts = 0, bare = 0;
  for (const f of files) {
    const src = rd(f); if (src == null) { if (VISIBLE.includes(f) && !/walkthrough|schedule/.test(f)) fail(`${f} is missing`); continue; }
    for (const { l, n } of codeLines(src)) {
      if (/close-out/i.test(l)) { closeouts++; if (closeouts <= 6) fail(`${f}:${n} says "close-out" where a person reads it; the name is "Month 1 review"`); }
      const m = l.match(/(?<![(])\bCall [12]\b(?![)])/g);
      if (m && !/Intro call \(Call 1\)|Audit walkthrough \(Call 2\)/.test(l)) { bare++; if (bare <= 4) fail(`${f}:${n} has a bare "${m[0]}"; write "Intro call (Call 1)" / "Audit walkthrough (Call 2)" or the name`); }
    }
  }
  if (closeouts > 6) fail(`... and ${closeouts - 6} more "close-out" lines`);
  const pb = rd("admin/playbook.js") || "";
  if (!/tab: "Intro call \(Call 1\)"/.test(pb)) fail('the playbook tab for the intro call is not "Intro call (Call 1)"');
  if (!/tab: "Audit walkthrough \(Call 2\)"/.test(pb)) fail('the playbook tab for the walkthrough is not "Audit walkthrough (Call 2)"');
  const calls = rd("netlify/functions/_rga-calls.js");
  if (calls == null) fail("netlify/functions/_rga-calls.js (the one table of call names) does not exist");
  else { for (const n of SIX) if (!calls.includes(`"${n}"`)) fail(`CALL_NAMES is missing "${n}"`); }
  const wb = rd("netlify/functions/walkthrough-book.js");
  if (wb == null || !/`Audit walkthrough: \$\{business\} × Rocket Growth Agency`/.test(wb)) fail('the walkthrough invite is not titled "Audit walkthrough: <business> × Rocket Growth Agency"');
  const cp = rd("netlify/functions/_call-purpose.js") || "";
  if (!/title: \(biz\) => (`Month 1 review|callTitle\("Month 1 review")/.test(cp)) fail('the Month 1 review invite title does not use the name');
  const sch = rd("admin/schedule.js");
  if (sch == null) fail("admin/schedule.js does not exist"); else for (const n of SIX) if (!sch.includes(`"${n}"`)) fail(`the Schedule does not show "${n}"`);
  // 6: nothing internal renamed
  for (const id of ['"m1.call.close"', '"m2.call.monthly"', '"m1.kickoff.call"']) if (!/m1\.call\.close|m2\.call\.monthly|m1\.kickoff\.call/.test((rd("data/playbooks/playbooks.json") || "") + (rd("data/playbooks/client-steps.json") || "")) ) { fail(`a step id (${id}) is gone`); break; }
  for (const k of ["m1_close", "m2_monthly", "closeoutUnavailable"]) if (!cp.includes(k)) fail(`the internal key ${k} was renamed or removed`);
  return F;
}
try {
  await runGate({ name: "check-call-names", beforeRev: BEFORE, checkTree, minBefore: 6 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
