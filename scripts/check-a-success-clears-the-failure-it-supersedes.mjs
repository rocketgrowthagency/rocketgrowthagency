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
// The rule the healer already follows (heal-onboarding-errors): clear a failure only on PROOF — a real success.
// exit 0 = no stored failure can outlive the success that supersedes it · 1 = one can · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (src) => src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);

// How each stored failure is cleared once something succeeds. `clear` must match the file's code; `why` says why a
// field never persists (response-only, or replaced whole on every run).
const DECLARED = {
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
  "send-kickoff-invite.js": {
    last_error: { clear: /\.\.\.\(cred\.last_error \? \{ last_error: null \} : \{\}\),/ },
  },
  "flow-execute-heavy-background.js": {
    failed_at: { clear: "mergeTaskState" },
  },
  "flow-execute.js": {
    anchor_read_error: { why: "part of one run's output, replaced whole by the next run" },
    locked_read_error: { why: "part of one run's output, replaced whole by the next run" },
  },
  "_photo-publish.js": {
    publish_error: { clear: /publish_state: "published", publish_error: null,/ },
    // photo_change_remove_v1: a count in the run's summary (the function's return), never stored; the failure itself is
    // a `remove_failed` row in the append-only publish log, and the old photo stays `published` (it IS still on Google)
    replace_failed: { why: "response only (the run's summary), never stored" },
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

if (F.length) { console.error("🔴 a stored failure can outlive the success that supersedes it:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ no stored failure outlives its success: ${found} failure fields across the record writers, each declared with its clear (or why it never persists); both merge rules clear error + failed_at on Done and keep a new failure`);
