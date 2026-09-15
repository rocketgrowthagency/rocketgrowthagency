#!/usr/bin/env node
/**
 * check-every-approval-is-archived.mjs — every client decision exists as a COMMITTED markdown file.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * Chris: *"each mockup approved we save the file in an md file system in vs code and git, so we have
 * reference."*
 *
 * `export-approvals.mjs` writes those files and runs daily. That is half a guarantee:
 *
 *   1. It WRITES but nothing COMMITS. An untracked file in a working tree is not "in git" — it is one
 *      `git clean` from gone, and it exists on exactly one machine. The whole point of the archive is
 *      to outlive the database, and an uncommitted file outlives nothing.
 *   2. Nothing compares the archive to the SOURCE. If the exporter half-fails, skips a client, or
 *      writes an empty file, the directory still looks populated and the daily run still says ✅.
 *
 * 🔑 An approval authorises something we then publish under a client's name. If the record of what
 * they agreed to can vanish while the published thing stays live, we cannot answer "who approved
 * this?" — which is the one question that matters when a client disputes it.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every approval in Supabase has a matching markdown file on disk.
 *   2. Every such file is COMMITTED — not untracked, not modified-uncommitted.
 *   3. Each file actually contains the approved CONTENT, not just a decision flag. A file recording
 *      "approved" without the text approved is not evidence of anything.
 *   4. The decision and timestamp on disk match the database. A stale archive is worse than none,
 *      because it looks authoritative.
 *
 * Exit 0 = every decision is archived and committed · 1 = a decision is unarchived, uncommitted or
 * stale · 2 = could not tell (no credentials / no network).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ARCHIVE = path.join(SITE, "reports/approvals");
const SELF_TEST = process.argv.includes("--self-test");

if (SELF_TEST) { await selfTest(); process.exit(0); }

for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error("[approvals] INDETERMINATE — Supabase credentials unavailable"); process.exit(2); }

let records, clients;
try {
  const h = { apikey: K, Authorization: `Bearer ${K}` };
  records = await (await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data`, { headers: h })).json();
  clients = await (await fetch(`${U}/rest/v1/clients?select=id,business_name,archived_at`, { headers: h })).json();
} catch (e) {
  console.error(`[approvals] INDETERMINATE — could not read: ${String(e.message).slice(0, 120)}`);
  process.exit(2);
}
if (!Array.isArray(records)) { console.error(`[approvals] INDETERMINATE — unexpected response`); process.exit(2); }

const nameById = new Map((clients || []).map((c) => [c.id, c]));
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Collect every decision that exists in the database.
const decisions = [];
for (const rec of records) {
  const client = nameById.get(rec.client_id);
  if (!client || client.archived_at) continue;          // archived clients keep their files; not judged
  for (const [stepId, task] of Object.entries(rec?.data?.tasks || {})) {
    const a = task?.approval;
    if (!a?.decision) continue;
    decisions.push({
      client: client.business_name, clientSlug: slug(client.business_name),
      stepId, decision: a.decision, at: a.at || null,
      approvedContent: (a.approved_content || "").trim(),
    });
  }
}

console.log("── every client decision is archived to committed markdown ──");
if (!decisions.length) { console.log("  no client decisions recorded yet — nothing to archive"); process.exit(2); }

// One `git status` for the whole archive, rather than one per file.
let untracked = new Set(), modified = new Set();
try {
  // 🔴 `-uall` is load-bearing. Without it git collapses a wholly-untracked directory into a single
  // entry ("?? reports/approvals/") instead of listing each file, so a per-file lookup finds nothing
  // and the gate passes on the very case it exists to catch — a brand-new archive nobody committed.
  // Found by this gate's own self-test.
  const out = execFileSync("git", ["status", "--porcelain", "-uall", "--", "reports/approvals"],
    { cwd: SITE, encoding: "utf8" });
  for (const line of out.split("\n").filter(Boolean)) {
    const code = line.slice(0, 2), file = line.slice(3).trim().replace(/^"|"$/g, "");
    if (code.includes("?")) untracked.add(file);
    else modified.add(file);
  }
} catch (e) {
  console.error(`[approvals] INDETERMINATE — git status failed: ${String(e.message).slice(0, 90)}`);
  process.exit(2);
}

const problems = [];
for (const d of decisions) {
  const rel = path.join("reports/approvals", d.clientSlug, `${d.stepId.replace(/\./g, "_")}.md`);
  const abs = path.join(SITE, rel);

  if (!fs.existsSync(abs)) {
    problems.push(`${d.client} · ${d.stepId} — decided "${d.decision}" but NO archive file at ${rel}`);
    continue;
  }
  const body = fs.readFileSync(abs, "utf8");

  // 🔴 Committed, not merely written. An untracked file exists on one machine and survives nothing.
  if (untracked.has(rel)) problems.push(`${d.client} · ${d.stepId} — archive exists but is UNTRACKED in git (${rel})`);
  else if (modified.has(rel)) problems.push(`${d.client} · ${d.stepId} — archive has UNCOMMITTED changes (${rel})`);

  // The decision on disk must match the database, or the archive is confidently wrong.
  if (!new RegExp(d.decision.replace("_", "[ _]"), "i").test(body)) {
    problems.push(`${d.client} · ${d.stepId} — database says "${d.decision}" but the archive does not say so`);
  }

  // 🔑 A file recording "approved" WITHOUT the approved text proves nothing about what was agreed.
  if (d.approvedContent) {
    const probe = d.approvedContent.slice(0, 60).replace(/\s+/g, " ").trim();
    const flat = body.replace(/\s+/g, " ");
    if (probe.length > 20 && !flat.includes(probe)) {
      problems.push(`${d.client} · ${d.stepId} — archive does not contain the APPROVED CONTENT; it records a decision with no evidence of what was approved`);
    }
  }
  if (d.at && !body.includes(String(d.at).slice(0, 10))) {
    problems.push(`${d.client} · ${d.stepId} — archive is missing the approval date ${String(d.at).slice(0, 10)}`);
  }
}

console.log(`  ${decisions.length} decision(s) across ${new Set(decisions.map((d) => d.client)).size} client(s)`);
if (problems.length) {
  console.error("\n✗ the approval archive is not a reliable record:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  Run: node scripts/export-approvals.mjs   then COMMIT reports/approvals/.");
  console.error("  An approval authorises something published under a client's name. If the record can");
  console.error("  vanish while the published thing stays live, nobody can answer 'who approved this?'.");
  process.exit(1);
}
console.log("  ✅ every decision has a committed archive containing the approved content and its date");
process.exit(0);

/** Credential-free sabotage test over a throwaway git repo. */
async function selfTest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "appr-"));
  const dir = path.join(tmp, "reports/approvals/test-co");
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: tmp });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: tmp });
  execFileSync("git", ["config", "user.name", "t"], { cwd: tmp });

  const GOOD = "---\ndecision: approved\ndate: 2026-09-15\n---\n\nThe exact approved headline text here.\n";
  const write = (name, body) => fs.writeFileSync(path.join(dir, name), body);
  const commitAll = () => {
    execFileSync("git", ["add", "-A"], { cwd: tmp });
    execFileSync("git", ["commit", "-qm", "x"], { cwd: tmp });
  };

  // Mirror the real checks against a fixture, so the LOGIC is tested without credentials.
  const judge = (files, decision) => {
    const probs = [];
    const rel = "reports/approvals/test-co/m1_x.md";
    const abs = path.join(tmp, rel);
    const out = execFileSync("git", ["status", "--porcelain", "-uall", "--", "reports/approvals"], { cwd: tmp, encoding: "utf8" });
    const un = new Set(), mod = new Set();
    for (const l of out.split("\n").filter(Boolean)) {
      const c = l.slice(0, 2), f = l.slice(3).trim();
      if (c.includes("?")) un.add(f); else mod.add(f);
    }
    if (!fs.existsSync(abs)) { probs.push("missing"); return probs; }
    const body = fs.readFileSync(abs, "utf8");
    if (un.has(rel)) probs.push("untracked");
    else if (mod.has(rel)) probs.push("uncommitted");
    if (!new RegExp(decision, "i").test(body)) probs.push("decision mismatch");
    if (!body.replace(/\s+/g, " ").includes("The exact approved headline text")) probs.push("no content");
    if (!body.includes("2026-09-15")) probs.push("no date");
    return probs;
  };

  const cases = [];
  // 1. missing file entirely
  cases.push(["a decision with no archive file", judge([], "approved").includes("missing"), true]);
  // 2. written but never committed
  write("m1_x.md", GOOD);
  cases.push(["archive written but UNTRACKED", judge([], "approved").includes("untracked"), true]);
  // 3. committed and complete
  commitAll();
  cases.push(["archive committed and complete", judge([], "approved").length === 0, true]);
  // 4. decision on disk disagrees with the database
  cases.push(["database says declined, file says approved", judge([], "declined").includes("decision mismatch"), true]);
  // 5. a decision flag with no approved content
  write("m1_x.md", "---\ndecision: approved\ndate: 2026-09-15\n---\n\n(nothing)\n");
  commitAll();
  cases.push(["archive records a decision with NO approved content", judge([], "approved").includes("no content"), true]);
  // 6. committed edits are clean again
  write("m1_x.md", GOOD);
  cases.push(["edited but uncommitted", judge([], "approved").includes("uncommitted"), true]);

  let pass = 0;
  for (const [label, got, want] of cases) {
    const ok = got === want; pass += ok;
    console.log(`  ${ok ? "✅" : "🔴"} ${label}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass}/${cases.length} self-test cases passed`);
  if (pass !== cases.length) process.exit(1);
}
