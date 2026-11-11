#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-success-clears-the-failure-it-supersedes.mjs
//
// 🔒 WHY (2026-10-13): RGA's step 11 carried a 10-12 "the Maps search failed" for a day under every successful nightly
// check after it, because the writer merged `{ ...prev, ...next }` and never removed the old failure. It read as
// current: I told Chris Google was returning no results while the nightly was finding the duplicate correctly, and
// check-onboarding-errors-surfaced stayed red. The same shape was live in three more writers: the GBP manager auto-add
// (`gbp_manager_auto_add_error`), every step that errored and later finished (`error` / `failed_at`, both merge rules),
// and the kickoff invite's credential (`last_error`).
// HOLDS:
//   1. Every failure-named field a record-writing function stores is DECLARED here with how its success path clears it
//      (or why it never persists). A new one nobody declared fails: that is the guard against the next writer.
//   2. Each declared clear is still in the code.
//   3. Both merge rules (flow-execute + admin), RUN: an errored step that then finishes comes out with no error.
//   4. (11-11) The website steps' shared clear (SC.supersedeFailures), RUN: a success moves auto_failed (and, set aside,
//      auto_send.failed) into the step's `superseded` list; every success path that calls it is declared under clearIn.
// The rule the healer already follows (heal-onboarding-errors): clear a failure only on PROOF — a real success.
// exit 0 = no stored failure can outlive the success that supersedes it · 1 = one can · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (src) => src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);

// How each stored failure is cleared once something succeeds. `clear` must match the file's code; `why` says why a
// field never persists (response-only, or replaced whole on every run).
const DECLARED = {
  // admin_website_steps_autopilot_v1 (11-6): a website step's automatic draft that failed (didn't finish, failed twice, couldn't be saved)
  "_website-autorun.js": {
    // publish_failure_shows_v1 (11-8): a refused snapshot / pull request / merge, scoped to its version (every reader checks publish_failed.v ===
    // site_change.v), DELETED by admin-deliverables when the pull request opens or merges; a merged change never reads as stuck (wcStuck)
    publish_failed: { why: "scoped to the change's version; cleared in admin-deliverables open_pr / merge_pr (delete t.publish_failed), and wcStuck ignores it once merged" },
    // 11-11: scoped to its run (every reader uses it only while auto_failed.run === ran_at), AND cleared on every success: a draft saved,
    // "nothing needs changing" (by RGA, or a run that found it already right), the change marked live. Scoping alone left RGA's 8 stored
    // failures under later successes for days, and check-onboarding-errors-surfaced stayed red on all 8.
    auto_failed: { clearIn: {
      "admin-deliverables.js": [
        /SC\.supersedeFailures\(t, \{ at: now, by: who, why: "a draft was saved" \}\);/,
        /SC\.supersedeFailures\(t, \{ at: now, by: who, why: "nothing needed changing", setAside: true \}\);/,
        /SC\.supersedeFailures\(t, \{ at: now, by: who, why: "the change went live", setAside: true \}\);/,
      ],
      "flow-execute.js": [/\.\.\.\(supersededPatch \|\| \{\}\),/],
    } },
  },
  "refresh-review-metrics.js": {
    profile_error: { why: "response only (the run's result row), never stored — the snapshot holds only a measured count" },
    cache_error: { why: "response only (the run's result row), never stored" },
  },
  // reviews_ongoing_live_v1 (10-23): the reviews read says when the series couldn't be read — in the answer only
  "portal-review-requests.js": {
    read_failed: { why: "response only (the scope \"reviews\" answer), never stored — the next read answers afresh" },
  },
  "gbp-duplicate-scan.js": {
    last_failed_scan: { clear: /if \(record\.verdict === "clean" \|\| record\.verdict === "duplicate"\) delete tasks\["m1\.audit\.gbp_duplicate"\]\.last_failed_scan;/ },
    store_error: { why: "response only (json), never stored" },
  },
  "oauth-google-callback.js": {
    gbp_manager_auto_add_error: { clear: /else if \(result\.success\) delete data\.gbp_manager_auto_add_error;/ },
    last_error: { clear: /last_error: null,/ },
  },
  // batch 4 (10-19): a queue item's last_error is deleted the moment that post goes to Google
  "_gbp-posts.js": {
    last_error: { clear: /delete next\.last_error;/ },
  },
  // The daily Search Console pull: every chunk that is kept saves last_status "ok" with last_error null, so the next good run wipes the old failure
  "_gsc-daily.js": {
    last_error: { clear: /last_status: "ok", last_error: null,/ },
  },
  "_ga4-daily.js": {
    last_error: { clear: /last_status: "ok", last_error: null,/ },
  },
  "_gsc-sitemaps.js": {
    last_error: { clear: /data\.sitemap_errors = \{ read_at: now\.toISOString\(\),/ },
  },
  "send-kickoff-invite.js": {
    last_error: { clear: /\.\.\.\(cred\.last_error \? \{ last_error: null \} : \{\}\),/ },
  },
  "flow-execute-heavy-background.js": {
    failed_at: { clear: "mergeTaskState" },
  },
  "flow-execute.js": {
    // 11-11: written only as `auto_failed: null`, the run that found the step already right clearing the old one (SiteChange.supersedeFailures)
    auto_failed: { clear: /supersededPatch = \{ auto_failed: null, superseded: prevT\.superseded,/ },
    anchor_read_error: { why: "part of one run's output, replaced whole by the next run" },
    locked_read_error: { why: "part of one run's output, replaced whole by the next run" },
  },
  // audit_decisions_v1 #5: the last refused press stays on the description step until a publish succeeds
  "gbp-publish.js": {
    publish_failed: { clear: /delete rec\.data\.tasks\[stepId\]\.publish_failed;/ },
  },
  "_photo-publish.js": {
    publish_error: { clear: /publish_state: "published", publish_error: null,/ },
    // photo_change_remove_v1: a count in the run's summary (the function's return), never stored; the failure itself is
    // a `remove_failed` row in the append-only publish log, and the old photo stays `published` (it IS still on Google)
    replace_failed: { why: "response only (the run's summary), never stored" },
  },
  // site_archive_v1: a count of pages that could not be saved in ONE capture run; each run is its own row (a new capture
  // starts a new row at 0), and a run's total is re-added from the chunks, so no old failure rides under a later success
  "site-archive-run.js": {
    pages_failed: { why: "a per-run tally in the job's answer, summed from this pass's chunks; each capture is its own run row that starts at 0" },
  },
  // monthly_start_v1: step 1 "Open the month" says why it could not open; the morning run deletes the field the day the month does open
  "_morning-run.js": {
    month_open_error: { clear: /delete nd\.month_open_error;/ },
  },
  "gbp-apply-change.js": {
    write_error: { why: "response only (json), never stored" },
  },
};

// ── 1 · discover every failure-named field a record-writing function stores ──
const RECORD = /client_onboarding_records|client_monthly_records|rga_google_credentials|client_google_oauth/;
const FIELD = /\b([a-z][a-z_]*(?:_error|_failed[a-z_]*|failed_[a-z_]+))\b\s*(?::|=(?!=))/g;
let files;
try { files = fs.readdirSync(FN).filter((f) => f.endsWith(".js")); } catch { console.error("⚠️  INDETERMINATE — cannot list netlify/functions"); process.exit(2); }
let found = 0;
for (const f of files) {
  const src = code(fs.readFileSync(`${FN}/${f}`, "utf8"));
  if (!RECORD.test(src)) continue;
  const keys = new Set([...src.matchAll(FIELD)].map((m) => m[1]));
  for (const k of keys) {
    found++;
    const d = DECLARED[f] && DECLARED[f][k];
    if (!d) { fail(`${f} stores \`${k}\` and nothing says how a later success clears it — declare it here, with the clear (or why it never persists)`); continue; }
    if (d.clear instanceof RegExp && !d.clear.test(src)) fail(`${f}: a success no longer clears \`${k}\` (it would read as current under every later success)`);
    // a field one writer stores and OTHER files clear on their success paths (each path listed)
    for (const [cf, res] of Object.entries(d.clearIn || {})) {
      let csrc = ""; try { csrc = code(fs.readFileSync(`${FN}/${cf}`, "utf8")); } catch { fail(`${f}: \`${k}\` is cleared in ${cf}, which is gone — re-read this gate`); continue; }
      for (const re of res) if (!re.test(csrc)) fail(`${cf}: a success path no longer clears \`${k}\` from ${f} (${String(re).slice(1, 70)}…)`);
    }
  }
}
if (found < 5) { console.error(`⚠️  INDETERMINATE — only ${found} failure fields found; the scan no longer sees the writers`); process.exit(2); }
for (const [f, keys] of Object.entries(DECLARED)) {
  let src = ""; try { src = code(fs.readFileSync(`${FN}/${f}`, "utf8")); } catch { fail(`declared writer ${f} is gone — re-read this gate`); continue; }
  for (const k of Object.keys(keys)) if (!new RegExp(`\\b${k}\\b`).test(src)) fail(`${f} no longer writes \`${k}\` — drop it from DECLARED (a stale declaration hides a new writer)`);
}

// ── 3 · both merge rules, run: an errored step that finishes comes out clean ──
const lift = (src, name) => { const i = src.indexOf(`function ${name}(`); const j = i < 0 ? -1 : src.indexOf("\n}\n", i); return i < 0 || j < 0 ? null : src.slice(i, j + 2); };
for (const [where, rel] of [["flow-execute", "netlify/functions/flow-execute.js"], ["admin", "admin/admin.js"]]) {
  const fn = lift(read(rel), "mergeTaskState");
  if (!fn) { fail(`${where}: mergeTaskState is gone (re-read this gate)`); continue; }
  const ctx = {}; vm.createContext(ctx); vm.runInContext(`${fn}\nthis.m = mergeTaskState;`, ctx);
  const errored = { status: "error", error: "Calendar 500", failed_at: "2026-10-12T21:09:15Z", note: "kept" };
  const done = ctx.m(errored, { status: "done" });
  if ("error" in done || "failed_at" in done) fail(`${where}: a step that errored and then finished still carries its error (${JSON.stringify(done.error)})`);
  if (done.note !== "kept" || !done.completed_at) fail(`${where}: finishing a step dropped its other fields or its completion time`);
  const again = ctx.m(errored, { status: "error", error: "new" });
  if (again.error !== "new") fail(`${where}: a NEW failure is not recorded (only a success may clear one)`);
  const own = ctx.m(errored, { status: "done", error: null });
  if (own.error !== null) fail(`${where}: a patch that sets the field itself no longer wins (the patch must override)`);
  const touch = ctx.m(errored, { notes: "x" });
  if (touch.error !== "Calendar 500") fail(`${where}: a patch that is not a success cleared the failure (only proof clears it)`);
}

// ── 4 · the shared clear, run: a success moves the automatic failure (and, set aside, the waiting draft's failed checks) into `superseded` ──
{
  let SCx = null;
  try { SCx = createRequire(import.meta.url)(`${SITE}/shared/site-change.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — cannot load shared/site-change.js (${String(e.message).slice(0, 80)})`); process.exit(2); }
  if (typeof SCx.supersedeFailures !== "function") fail("shared/site-change.js: supersedeFailures is gone, so no success path clears auto_failed (re-read this gate)");
  else {
    const mk = () => ({ status: "done", note: "kept", auto_failed: { at: "2026-11-07T23:00:27Z", run: "r1", why: "The check found: GA4 missing" }, auto_send: { v: "v1", held: { at: "x" }, failed: [{ label: "The page", why: "Held" }] } });
    const a = mk(), n = SCx.supersedeFailures(a, { at: "2026-11-11T00:00:00Z", by: "test", why: "nothing needed changing", setAside: true });
    if (a.auto_failed || (a.auto_send.failed || []).length) fail(`supersedeFailures: a success left a failure stored (${JSON.stringify({ auto_failed: a.auto_failed, failed: a.auto_send.failed })})`);
    if (n !== 2 || !Array.isArray(a.superseded) || a.superseded.length !== 2 || a.superseded[0].was.why !== "The check found: GA4 missing") fail("supersedeFailures: a cleared failure was not kept in `superseded` (never lose what happened)");
    if (a.note !== "kept" || !a.auto_send.held) fail("supersedeFailures: clearing a failure dropped the step's other fields");
    const b = mk(); SCx.supersedeFailures(b, { at: "x", by: "test", why: "a draft was saved" });
    if (b.auto_failed || (b.auto_send.failed || []).length !== 1) fail("supersedeFailures: without setAside it must clear auto_failed and leave the waiting send's checks alone");
    const c = { status: "in_progress", note: "kept" };
    if (SCx.supersedeFailures(c, { at: "x" }) !== 0 || "superseded" in c) fail("supersedeFailures: a step with no failure was written to (only a stored failure moves)");
  }
}

if (F.length) { console.error("🔴 a stored failure can outlive the success that supersedes it:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ no stored failure outlives its success: ${found} failure fields across the record writers, each declared with its clear (or why it never persists); both merge rules clear error + failed_at on Done and keep a new failure`);
