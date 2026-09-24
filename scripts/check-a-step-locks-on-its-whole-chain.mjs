#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-step-locks-on-its-whole-chain.mjs
//
// 🔴 WHY (2026-09-24). Phase 0 was reset to walk it again, and the checklist read:
//
//     1 Confirmation + expectations email   pending   (reset)
//     2 Send the kickoff calendar invite    LOCKED    (correct — depends on 1)
//     3 Confirm the client record           done      (stale — completed before the reset)
//     4 Run the kickoff call                UP NEXT   ← WRONG
//
// Step 4 offered to run a kickoff meeting that had just been CANCELLED. Its only declared
// dependency is step 3, step 3 was still marked done from before the reset, so it unlocked. The
// lock computation asked about a step's PARENT and never about its grandparent.
//
// 🔑 A "DONE" DOES NOT CERTIFY ITS OWN ANCESTORS. Reopening any step used to leave every step
// downstream of it falsely unlocked — and reopening is routine now, because that is how the SOP
// gets re-tested. Verified against the live record at the time: 11 steps were falsely unlocked.
// The checklist header promises "a step unlocks when the steps it depends on are done"; that
// sentence is only true transitively.
//
// 🔑 A FALSE UNLOCK IS THE DANGEROUS DIRECTION. A false LOCK is visible and annoying — you go to do
// the work and the product says no. A false UNLOCK hands an operator a button that acts on the
// world (sends a client email, books a meeting) on the strength of prerequisites that never
// happened. → feedback_a_guard_must_reach_the_thing_it_guards · feedback_do_the_step_dont_just_mark_it
//
// ── HOW THIS CHECKS IT ──────────────────────────────────────────────────────────────────────────
// Not by reading the code for the shape of a traversal — that is how a gate ends up satisfied by
// its own explanatory comment. It EXTRACTS the shipped lock computation out of admin.js and RUNS
// it:
//
//   1. the extracted code is executed against synthetic graphs whose right answer is known —
//      including the exact grandparent case above, which the old direct-only code gets wrong
//   2. it runs in a CHILD PROCESS with a timeout, so a traversal with no cycle guard FAILS the gate
//      instead of hanging it
//   3. it is then run against the REAL playbook graph and the REAL live client records, and its
//      answers are compared with a transitive closure written independently, here, in this file
//
// 🔑 Point 3 exists because a check that computes the expected answer with the code under test
// proves nothing. → feedback_a_check_must_not_validate_itself · feedback_a_gate_that_reads_code_never_sees_the_data
//
// exit 0 = a step locks on its whole dependency chain · 1 = it does not · 2 = cannot tell
// → feedback_a_fix_without_a_gate_regresses · feedback_exit_code_semantics_for_gates
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SITE = process.env.CHAIN_GATE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ADMIN = path.join(SITE, "admin", "admin.js");
const PLAYBOOKS = path.join(SITE, "data", "playbooks", "playbooks.json");

const indeterminate = (msg, ...extra) => {
  console.error(`⚠️  INDETERMINATE — ${msg}`);
  for (const e of extra) console.error(`   ${e}`);
  process.exit(2);
};

if (!fs.existsSync(ADMIN)) indeterminate(`admin.js not found at ${ADMIN}.`);

const src = fs.readFileSync(ADMIN, "utf8");

// ── extract the shipped computation ───────────────────────────────────────────────────────────
// Mask comments and string/template literals to SPACES of identical length, so brace balance is
// counted on code only while every offset still indexes the original text.
// 🔑 A window measured by counting characters forward from an anchor silently slides off the code
// it was aimed at. Balance the braces instead. → feedback_a_gate_window_measured_in_characters_will_lie
function maskNonCode(s) {
  const out = s.split("");
  let i = 0;
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { let j = s.indexOf("\n", i); if (j < 0) j = s.length; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { let j = s.indexOf("*/", i + 2); j = j < 0 ? s.length : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === c) { j++; break; }
        j++;
      }
      blank(i + 1, Math.max(i + 1, j - 1));
      i = j; continue;
    }
    i++;
  }
  return out.join("");
}

const masked = maskNonCode(src);

// The lock computation is the body of the `.map((r, _i, allRows) => { … })` inside
// sopChecklistSteps. Anchor on that signature; if it is ever renamed this gate goes INDETERMINATE
// rather than quietly passing on code it never found.
const ANCHOR = /\.map\(\(\s*r\s*,\s*_i\s*,\s*allRows\s*\)\s*=>\s*\{/;
const anchorAt = masked.search(ANCHOR);
if (anchorAt < 0) {
  indeterminate(
    "could not find the `.map((r, _i, allRows) => {` lock computation in admin.js.",
    "It was renamed or restructured. Re-point this gate deliberately — do not delete it.",
  );
}
const bodyStart = masked.indexOf("{", anchorAt + masked.slice(anchorAt).search(/=>/)) + 1;
let depth = 1, bodyEnd = -1;
for (let k = bodyStart; k < masked.length; k++) {
  if (masked[k] === "{") depth++;
  else if (masked[k] === "}") { depth--; if (depth === 0) { bodyEnd = k; break; } }
}
if (bodyEnd < 0) indeterminate("braces do not balance in the lock computation — cannot extract it.");

const BODY = src.slice(bodyStart, bodyEnd);

if (!/\breturn\s+r\s*;/.test(BODY)) {
  indeterminate("the extracted lock computation does not return `r` — the extraction is wrong.");
}

// ── run it, in a child process, on graphs whose answers are known ─────────────────────────────
// 🔑 The child + timeout is not ceremony. A traversal written without a cycle guard spins forever
// on a graph that loops, and a gate that hangs is a gate that gets killed and ignored.
const HARNESS = `
const BODY = ${JSON.stringify(BODY)};
const step = new Function("r", "_i", "allRows", "gates", BODY);
const run = (rows, gates) => { rows.forEach((r, i) => step(r, i, rows, gates)); return rows; };
const row = (id, o = {}) => ({
  obj: { flowId: id, t: o.t || id.toUpperCase(), needsOauth: !!o.needsOauth },
  done: !!o.done, dependsOn: o.dependsOn || [], blocked: false, locked: false,
});
const cases = {};

// A — THE REGRESSION. C's parent is done; C's GRANDPARENT is not. C must stay locked, and it must
// point at A, the earliest thing that can actually be worked on.
cases.grandparent = run([
  row("A", { t: "Step A" }),
  row("B", { t: "Step B", done: true, dependsOn: ["A"] }),
  row("C", { t: "Step C", dependsOn: ["B"] }),
], { oauth: true }).map((r) => ({ id: r.obj.flowId, locked: r.locked, blockers: r.blockers }));

// B — the whole chain really is done: no false lock. A false lock is the other failure mode and is
// just as real. (2026-09-06: positional locking locked steps that were genuinely ready.)
cases.cleanChain = run([
  row("A", { done: true }),
  row("B", { done: true, dependsOn: ["A"] }),
  row("C", { dependsOn: ["B"] }),
], { oauth: true }).map((r) => ({ id: r.obj.flowId, locked: r.locked }));

// C — a cyclic graph must TERMINATE. If this case never returns, the parent's timeout fails us.
cases.cycle = run([
  row("X", { dependsOn: ["Y"] }),
  row("Y", { dependsOn: ["X"] }),
  row("Z", { dependsOn: ["X"] }),
], { oauth: true }).map((r) => ({ id: r.obj.flowId, locked: r.locked }));

// D — a dependency on a step that lives in the CLIENT portal is not in this list and must never
// deadlock the RGA-side checklist.
cases.foreignDep = run([
  row("A", { done: true }),
  row("C", { dependsOn: ["A", "client.upload_logo"] }),
], { oauth: true }).map((r) => ({ id: r.obj.flowId, locked: r.locked, blockers: r.blockers }));

// E — ORDER. Two unmet ancestors; the one named first must be the earliest in playbook order,
// because the UI renders blockers[0] as "Unlocks when X is complete" and sends you there.
cases.ordering = run([
  row("A", { t: "Step A" }),
  row("B", { t: "Step B", dependsOn: ["A"] }),
  row("C", { t: "Step C", dependsOn: ["B"] }),
  row("D", { t: "Step D", dependsOn: ["C", "B"] }),
], { oauth: true }).map((r) => ({ id: r.obj.flowId, locked: r.locked, blockers: r.blockers }));

// F — a DONE step is never locked, however broken its ancestry. Locking a finished step would
// hide completed work behind a wall.
cases.doneIsNeverLocked = run([
  row("A"),
  row("B", { done: true, dependsOn: ["A"] }),
], { oauth: true }).map((r) => ({ id: r.obj.flowId, locked: r.locked }));

// G — OAuth blocking still works, and is independent of the dependency graph.
cases.oauth = run([
  row("A", { done: true }),
  row("B", { needsOauth: true, dependsOn: ["A"] }),
], { oauth: false }).map((r) => ({ id: r.obj.flowId, locked: r.locked, oauthBlocked: r.oauthBlocked }));

// LIVE — the real graph and the real records, answered by the shipped code. The parent compares
// these against a closure written independently.
const live = JSON.parse(process.env.CHAIN_GATE_LIVE || "null");
if (live) {
  cases.live = {};
  for (const [clientId, rows] of Object.entries(live)) {
    cases.live[clientId] = run(rows.map((x) => row(x.id, { t: x.t, done: x.done, dependsOn: x.dependsOn })), { oauth: true })
      .map((r) => ({ id: r.obj.flowId, locked: r.locked, blockers: r.blockers }));
  }
}
process.stdout.write(JSON.stringify(cases));
`;

// ── the live half: real playbook graph + real client records ──────────────────────────────────
let livePayload = null;
let liveNote = "";
let liveRows = null;   // clientId -> [{id,t,done,dependsOn}] in playbook order

const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!fs.existsSync(PLAYBOOKS)) {
  liveNote = "playbooks.json not found — the live half did not run.";
} else if (!U || !K) {
  liveNote = "no Supabase credentials — the live half did not run.";
} else {
  let book;
  try { book = JSON.parse(fs.readFileSync(PLAYBOOKS, "utf8")); }
  catch { indeterminate("playbooks.json does not parse."); }

  const scopes = ["month1", "month2plus"].filter((s) => Array.isArray(book[s]));
  if (!scopes.length) indeterminate("playbooks.json holds no month1/month2plus arrays.");

  const h = { apikey: K, Authorization: `Bearer ${K}` };
  let recs = null;
  try {
    // 🔴 `tasks` is NOT a column — it lives inside the `data` JSONB. Naming it in the SELECT 400s
    // the whole query, and the `catch` below would have reported "could not read" forever.
    // → project_admin_selected_a_missing_column
    const res = await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data&limit=200`, { headers: h });
    if (res.ok) recs = await res.json();
  } catch { /* handled below */ }
  if (!Array.isArray(recs)) {
    liveNote = "could not read client_onboarding_records — the live half did not run.";
  } else {
    const DONE = new Set(["done", "skipped", "declined"]);
    liveRows = {};
    for (const rec of recs) {
      const tasks = rec?.data?.tasks || {};
      for (const scope of scopes) {
        const rows = book[scope].map((s) => ({
          id: s.id,
          t: s.t || s.id,
          done: DONE.has(String(tasks?.[s.id]?.status || "pending")),
          dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
        }));
        liveRows[`${rec.client_id}/${scope}`] = rows;
      }
    }
    livePayload = JSON.stringify(liveRows);
  }
}

let out;
try {
  out = execFileSync(process.execPath, ["-e", HARNESS], {
    encoding: "utf8",
    timeout: 20000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(livePayload ? { CHAIN_GATE_LIVE: livePayload } : {}) },
  });
} catch (e) {
  if (e.killed || e.signal === "SIGTERM" || /ETIMEDOUT/.test(String(e.code))) {
    console.error("🔴 THE LOCK COMPUTATION DOES NOT TERMINATE on a cyclic dependency graph.");
    console.error("   A graph where two steps depend on each other spins forever, and the admin");
    console.error("   client page hangs on render. The traversal needs a `seen` guard.");
    process.exit(1);
  }
  indeterminate("the extracted lock computation threw when executed.", String(e.stderr || e.message).split("\n")[0]);
}

let R;
try { R = JSON.parse(out); }
catch { indeterminate("the harness produced no readable result."); }

const problems = [];
const byId = (arr, id) => arr.find((x) => x.id === id);

// ── A. the regression itself ──────────────────────────────────────────────────────────────────
{
  const C = byId(R.grandparent, "C");
  if (!C?.locked) {
    problems.push(
      `A step whose PARENT is done but whose GRANDPARENT is not is UNLOCKED. This is the exact\n`
      + `     2026-09-24 defect: "Run the kickoff call" showed UP NEXT — offering to run a meeting\n`
      + `     that had just been cancelled — because its parent was still marked done from before\n`
      + `     the reset. Locking must walk the whole chain, not the first hop.`);
  } else if (!(C.blockers || []).length || C.blockers[0] !== "Step A") {
    problems.push(
      `The grandparent case locks correctly but names the wrong blocker: ${JSON.stringify(C.blockers)}.\n`
      + `     The UI renders blockers[0] as "Unlocks when X is complete", so it must name "Step A" —\n`
      + `     the earliest step that can actually be worked on. Naming a later one sends the\n`
      + `     operator to a step that is itself locked.`);
  }
}

// ── B. no false lock on a clean chain ─────────────────────────────────────────────────────────
if (byId(R.cleanChain, "C")?.locked) {
  problems.push(
    `A step with its entire chain done is LOCKED. A false lock tells you work is not yours to do\n`
    + `     yet and gives you no way to argue with it — the 2026-09-06 positional-locking failure.`);
}

// ── C. cycles terminate AND still lock ────────────────────────────────────────────────────────
if (!byId(R.cycle, "Z")?.locked) {
  problems.push(`A step downstream of an unfinished cycle is unlocked; a cyclic graph must still block.`);
}

// ── D. a foreign (client-portal) dependency must not deadlock ─────────────────────────────────
{
  const C = byId(R.foreignDep, "C");
  if (C?.locked) {
    problems.push(
      `A dependency on a step that is not in this playbook (${JSON.stringify(C.blockers)}) locks the\n`
      + `     RGA-side checklist. Client-side steps live in the portal and can never be completed\n`
      + `     here, so treating one as a blocker deadlocks the list permanently.`);
  }
}

// ── E. blockers are ordered by playbook position ──────────────────────────────────────────────
{
  const D = byId(R.ordering, "D");
  if (!D?.locked) problems.push(`A step with two unmet ancestors is unlocked.`);
  else if (D.blockers[0] !== "Step A") {
    problems.push(
      `Blockers are not sorted by playbook order: got ${JSON.stringify(D.blockers)}, expected "Step A"\n`
      + `     first. A Set walked by a stack yields arbitrary order, and blockers[0] is what the\n`
      + `     operator is told to go and do.`);
  }
}

// ── F. a done step is never locked ────────────────────────────────────────────────────────────
if (byId(R.doneIsNeverLocked, "B")?.locked) {
  problems.push(`A step marked done is rendered LOCKED, hiding completed work behind a wall.`);
}

// ── G. oauth blocking survived the change ─────────────────────────────────────────────────────
{
  const B = byId(R.oauth, "B");
  if (!B?.locked || !B?.oauthBlocked) {
    problems.push(`A step needing OAuth is not blocked when OAuth is disconnected — that guard was lost.`);
  }
}

// ── the live half: compare the shipped answer with a closure written HERE ──────────────────────
// 🔑 Written independently on purpose. Computing the expected answer with the code under test is
// not a check. → feedback_a_check_must_not_validate_itself
let liveChecked = 0;
if (R.live && liveRows) {
  for (const [key, rows] of Object.entries(liveRows)) {
    const shipped = R.live[key];
    if (!shipped) continue;
    const known = new Set(rows.map((r) => r.id));
    const doneIds = new Set(rows.filter((r) => r.done).map((r) => r.id));
    const deps = new Map(rows.map((r) => [r.id, r.dependsOn]));
    const order = new Map(rows.map((r, i) => [r.id, i]));

    for (const r of rows) {
      // breadth-first over the ancestry, independent of how the shipped code walks it
      const seen = new Set(), unmet = [];
      const queue = [...r.dependsOn];
      while (queue.length) {
        const d = queue.shift();
        if (seen.has(d) || !known.has(d)) { seen.add(d); continue; }
        seen.add(d);
        if (!doneIds.has(d)) unmet.push(d);
        for (const up of deps.get(d) || []) if (!seen.has(up)) queue.push(up);
      }
      unmet.sort((a, b) => order.get(a) - order.get(b));
      const expectLocked = !r.done && unmet.length > 0;
      const got = shipped.find((x) => x.id === r.id);
      if (!got) continue;
      liveChecked++;
      if (got.locked !== expectLocked) {
        problems.push(
          `LIVE ${key} — "${r.t}" (${r.id}) is ${got.locked ? "LOCKED" : "UNLOCKED"} but ${expectLocked ? "should be LOCKED" : "should be UNLOCKED"}.\n`
          + `     Unmet ancestors on the real graph: ${unmet.length ? unmet.join(", ") : "none"}.`);
      }
      const expectFirst = unmet.length ? rows.find((x) => x.id === unmet[0])?.t : null;
      if (expectLocked && expectFirst && got.blockers?.[0] && got.blockers[0] !== expectFirst) {
        problems.push(
          `LIVE ${key} — "${r.t}" says "Unlocks when ${got.blockers[0]}" but the earliest unmet step\n`
          + `     on the real graph is "${expectFirst}".`);
      }
    }
  }
}

// ── verdict ───────────────────────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error("🔴 A STEP DOES NOT LOCK ON ITS WHOLE DEPENDENCY CHAIN\n");
  for (const p of problems) console.error(`  🔴 ${p}\n`);
  console.error("  admin.js → sopChecklistSteps → the `.map((r, _i, allRows)` lock computation.");
  process.exit(1);
}

console.log("✅ a step locks on its whole dependency chain");
console.log("   grandparent case locks · clean chain does not · cycles terminate · foreign deps do not deadlock");
console.log("   blockers ordered by playbook position · done steps never locked · oauth guard intact");
if (liveChecked) {
  console.log(`   live: ${liveChecked} step/client combinations agree with an independently computed closure`);
} else {
  console.log(`   ⚠️  live half did not run${liveNote ? ` — ${liveNote}` : ""}`);
}
