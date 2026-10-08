#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// RE-PROVE THAT A GATE CAN FAIL.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY THIS EXISTS. Every gate here is mutation-tested when it is written — and until 2026-10-06
// those runs lived in a scratch directory that vanished with the session. The NUMBER survived in a
// commit message ("9/9 mutations"); the ability to check it did not. So a gate that silently went
// blind months later looked exactly like one that still worked.
//
// Two of those happened in one day: `check-refusal-is-not-done` pinned a literal title and reported
// INDETERMINATE from the moment a better design shipped, and 100 of 289 gates hardcoded their paths
// so no mutation could ever reach them.
//
// 🔑 A CLAIM THAT A GATE CAN FAIL IS WORTH WHAT IT COSTS TO RE-CHECK IT. These suites are part of
// the repo now, and this runs them.
//
//   node scripts/run-mutations.mjs                      # every suite
//   node scripts/run-mutations.mjs check-a-done-step…   # one
//
// A suite is a JSON array of [name, file, find, replace, expect?]. `file` names a source the gate
// reads; `expect` is the exit code the mutation should produce and defaults to 1.
//
// 🔑 SOMETIMES THE RIGHT ANSWER IS "I CANNOT TELL". A mutation that breaks the gate's PREMISE rather
// than the product — moving the condition the gate mirrors — should make it exit 2 and ask to be
// re-read, not accuse whatever happens to use that condition. Writing `2` records that intent, so
// the day it starts exiting 1 instead (quietly accusing correct code) the suite says so.
// → feedback_a_gate_that_throws_is_not_a_gate_that_fails
//
// Each mutation is applied to a THROWAWAY COPY of the site — never the working tree. An unmutated
// run must exit 0.
//
// → feedback_a_gate_that_cannot_fail · feedback_a_gate_that_cannot_be_pointed_at_a_copy_was_never_tested
// Exit 0 all suites prove their gate can fail · 1 a gate could not be made to fail · 2 INDETERMINATE

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// 🔴 fileURLToPath, NOT `.pathname` — a path containing spaces comes back percent-encoded
// ("Rocket%20Growth"), and every lookup under it then misses. → feedback_correct_is_not_the_same_as_happening
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = `${HERE}/mutations`;
const FILES = {
  admin: "admin/admin.js",
  exec: "netlify/functions/flow-execute.js",
  css: "admin/admin.css",
  portal: "portal/portal.js",
  playbook: "data/playbooks/playbooks.json",
  citdirs: "netlify/functions/_citation-directories.js",
  recheck: "netlify/functions/portal-step-recheck.js",
  stepsql: "docs/supabase/RGA_CLIENT_STEP_RUNS_2026-10-07.sql",
  heavy: "netlify/functions/flow-execute-heavy-background.js",
  ghguardpy: "scripts/gh-account-guard.py",
  // 🔑 A LIVE-RENDER GATE READS PRODUCTION FOR ITS "GOT" SIDE, so the only input a mutation can
  // reach is the mockup it compares against. Mutating it proves the diff can fail; it cannot prove
  // the gate would notice an undeployed CSS edit, and nothing should claim it does.
  mockup: "reports/mockups/admin_every_run_is_kept_v1.html",
  mockupdet: "reports/mockups/admin_detected_step_v1.html",
  mockupdlv: "reports/mockups/admin_shot_list_deliverable_v2.html",
  draftshape: "netlify/functions/_draft-shape.js",
  gbpparent: "netlify/functions/_gbp-parent.js",
  gbpprofile: "netlify/functions/v2-gbp-profile.js",
  recheckfn: "netlify/functions/portal-step-recheck.js",
  detsql: "docs/supabase/RGA_CLIENT_STEP_DETECTIONS_2026-10-07.sql",
  usidiom: "netlify/functions/_us-idiom.js",
  // 🔑 A gate can be the thing under test: this one's own rule is what a mutation targets.
  playbookgate: null,

};
// 🔴 A HAND-WRITTEN FILE LIST IS A PROMISE SOMEBODY WILL REMEMBER. The first version named five
// files; `check-the-grid-says-what-it-centred-on` also reads `v2-rank-grid-background.js`, so its
// unmutated run exited 2 and the whole suite was unjudgeable. Copy the SOURCE DIRECTORIES by rule
// instead, skipping media, so a gate that starts reading a new file needs nothing here.
// → feedback_a_lift_list_is_a_promise_somebody_will_remember
// 🔴 A DIRECTORY ALLOW-LIST IS THE SAME PROMISE AS A FILE LIST, ONE LEVEL UP. The first version
// named seven directories; `check-no-dormant-endpoints` walks the WHOLE tree, so in a copy holding
// only those seven, ten endpoints whose callers live elsewhere looked dormant and its unmutated run
// failed. Copy everything that is not obviously not-code, and name what is skipped instead.
// → feedback_a_lift_list_is_a_promise_somebody_will_remember
const SKIP_DIRS = /^(node_modules|\.git|\.claude|\.netlify|v|dist|coverage|reports)$/;
const SKIP = /\.(mp4|mov|png|jpe?g|gif|webp|pdf|zip|ico|woff2?)$/i;
const copyTree = (rel) => {
  const from = `${SITE}/${rel}`;
  let entries;
  try { entries = fs.readdirSync(from, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) { copyTree(r); continue; }
    if (SKIP.test(e.name)) continue;
    const to = `${tmp}/${r}`;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try { fs.copyFileSync(`${SITE}/${r}`, to); } catch { /* unreadable → the gate will say so */ }
  }
};

let suites;
try { suites = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort(); }
catch { console.error(`⚠️  INDETERMINATE — no mutation suites at ${DIR}`); process.exit(2); }

const only = process.argv[2];
if (only) suites = suites.filter((f) => f.includes(only.replace(/\.(mjs|json)$/, "")));
if (!suites.length) { console.error(`⚠️  INDETERMINATE — no suite matches "${only}"`); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rga-mut-"));
// 🔴 THE ROOT FILES COUNT TOO. `script.js` calls `verify-turnstile` and `netlify.toml` names the
// scheduled functions; without them a copy looks like a site where those endpoints have no caller,
// and `check-no-dormant-endpoints` failed its UNMUTATED run. Copy the root's own text files, not
// its directories, which CARRY_DIRS already handles.
const copyRootFiles = () => {
  let entries;
  try { entries = fs.readdirSync(SITE, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory() || SKIP.test(e.name)) continue;
    try { fs.copyFileSync(`${SITE}/${e.name}`, `${tmp}/${e.name}`); } catch { /* unreadable */ }
  }
};
const seed = () => {
  copyRootFiles();
  // `reports` is skipped wholesale except the mockups, which render-diff gates read.
  for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIRS.test(e.name)) copyTree(e.name);
  }
  copyTree("reports/mockups");
};
const runGate = (gate) => {
  try { execFileSync("node", [`${HERE}/${gate}`], { env: { ...process.env, APPROVAL_ARCHIVE_SITE_DIR: tmp }, stdio: "pipe" }); return 0; }
  catch (e) { return e.status ?? 99; }
};

let gatesOk = 0, gatesBad = 0, totalCaught = 0, totalRun = 0;
for (const file of suites) {
  const gate = file.replace(/\.json$/, ".mjs");
  if (!fs.existsSync(`${HERE}/${gate}`)) { console.log(`⚠️  ${gate} — suite exists, gate does not`); gatesBad++; continue; }
  const muts = JSON.parse(fs.readFileSync(`${DIR}/${file}`, "utf8"));
  seed();
  const base = runGate(gate);
  if (base !== 0) { console.log(`⚠️  ${gate} — UNMUTATED run exits ${base}; cannot judge its mutations`); gatesBad++; continue; }

  let caught = 0, skipped = 0;
  for (const [name, which, find, repl, expect] of muts) {
    const rel = FILES[which];
    if (!rel) { console.log(`   ⚠️  unknown target "${which}" for: ${name}`); skipped++; continue; }
    const orig = fs.readFileSync(`${SITE}/${rel}`, "utf8");
    const n = orig.split(find).length - 1;
    if (n !== 1) {
      // 🔑 AN ANCHOR THAT NO LONGER MATCHES IS NEWS, NOT A PASS. The product moved under the suite;
      // say so rather than quietly testing nothing. → feedback_a_lift_list_is_a_promise_somebody_will_remember
      console.log(`   ⚠️  anchor matched ${n}×, mutation not applied: ${name}`);
      skipped++; continue;
    }
    seed();
    fs.writeFileSync(`${tmp}/${rel}`, orig.replace(find, repl));
    const want = expect ?? 1;
    const got = runGate(gate);
    if (got === want) caught++;
    else console.log(`   🔴 NOT CAUGHT: ${name} (expected exit ${want}, got ${got})`);
  }
  seed();
  totalCaught += caught; totalRun += muts.length - skipped;
  const ok = caught === muts.length - skipped && !skipped;
  console.log(`${ok ? "✅" : "🔴"} ${gate.replace(/\.mjs$/, "")} — ${caught}/${muts.length - skipped} caught${skipped ? ` · ${skipped} SKIPPED` : ""}`);
  if (ok) gatesOk++; else gatesBad++;
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${gatesBad ? "🔴" : "✅"} ${gatesOk}/${gatesOk + gatesBad} suite(s) prove their gate can fail · ${totalCaught}/${totalRun} mutations caught`);
process.exit(gatesBad ? 1 : 0);
