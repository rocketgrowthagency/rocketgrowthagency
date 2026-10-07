#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EVERY IDENTITY THIS MACHINE CAN ACT WITH POINTS AT RGA
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY (2026-10-07). The gh CLI sat authenticated as **EchoryLLC** — a different business — in
// RGA's repo, and nothing said so until a push happened to print an advisory. Chris: *"i still
// cannot get over why this failed we had all safeguards in place."*
//
// 🔑 NOTHING FAILED. pre-commit checks who authored, pre-push checks where it goes, and both worked
// — `origin/main` has exactly two authors in its whole history. But **every one of those guards
// fires at the MOMENT OF ACTION.** None of them answers "is everything pointed at RGA right now?",
// so a credential could sit wrong indefinitely and only announce itself when something tripped.
//
// 🔑 THIS IS THE STANDING ANSWER: one check, every identity, run daily. Drift is reported before it
// is acted on, not after. → project_gh_cannot_act_as_another_business · feedback_never_touch_echory
//
// 🔴 "NOT CONFIGURED" IS NOT "WRONG". A CLI nobody has logged into cannot act as anybody, and
// failing on it would make this noisy enough to ignore. Only a credential that is live AND points
// somewhere else fails. → feedback_an_absence_must_never_be_readable_as_a_value
//
// 🔴 NEVER PRINTS A SECRET. Account names and emails only — never a token, never a key.
//
// Exit 0 healthy · 1 an identity points elsewhere · 2 INDETERMINATE

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const OWNER = "rocketgrowthagency";
const EMAIL = "hello@rocketgrowthagency.com";

const fails = [];
const rows = [];
const F = (m) => fails.push(m);

const sh = (cmd, args, opts = {}) => {
  // 🔴 BOTH STREAMS, AND A NON-ZERO EXIT IS NOT A FAILURE HERE. `ssh -T git@github.com` exits 1 ON
  // SUCCESS and writes "Hi name!" to STDERR; `gh auth status` uses stderr on some versions too.
  // Reading stdout alone reported a working SSH identity as "(unreachable)" — a detector I had not
  // verified, which is the mistake this whole session has been about.
  // → feedback_run_it_against_reality_before_calling_it_done
  const run = (fn) => { try { return fn(); } catch (e) { return e; } };
  const r = run(() => ({ stdout: execFileSync(cmd, args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, ...opts }), stderr: "" }));
  const text = `${(r?.stdout || "")}${(r?.stderr || "")}`.trim();
  return text || null;
};

// ═══ THE PARSERS PROVE THEMSELVES BEFORE READING ANYTHING REAL ═══════════════════════════════
// 🔴 This gate reads live system state, so there is no file a mutation suite could change — the
// runner mutates a copy of the SITE tree and gates run from their real path. What CAN rot is the
// parsing, and it already did once: `ssh -T` exits 1 ON SUCCESS and writes "Hi name!" to STDERR, so
// reading stdout alone reported a working identity as "(unreachable)".
// 🔑 So the three parsers run against output whose answer is known, every time, and the gate reports
// INDETERMINATE rather than accuse a credential when its own reading is wrong.
// → feedback_run_it_against_reality_before_calling_it_done · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const parseSsh = (t) => (/Hi ([^!]+)!/.exec(t || "") || [])[1] || null;
const parseGh = (t) => {
  let acct = null;
  for (const line of String(t || "").split("\n")) {
    const m = /Logged in to \S+ account (\S+)/.exec(line);
    if (m) acct = m[1];
    if (/Active account: true/.test(line) && acct) return acct;
  }
  return null;
};
const parseNetlify = (t) => (/Email:\s*(\S+)/.exec(t || "") || [])[1] || null;
{
  const probes = [
    ["ssh ok", parseSsh("Hi rocketgrowthagency! You've successfully authenticated, but GitHub does not provide shell access."), "rocketgrowthagency"],
    ["ssh other", parseSsh("Hi EchoryLLC! You've successfully authenticated"), "EchoryLLC"],
    ["ssh silent", parseSsh(""), null],
    ["gh active", parseGh("github.com\n  ✓ Logged in to github.com account EchoryLLC (keyring)\n  - Active account: true"), "EchoryLLC"],
    ["gh two accounts, second active", parseGh("  ✓ Logged in to github.com account A (keyring)\n  - Active account: false\n  ✓ Logged in to github.com account B (keyring)\n  - Active account: true"), "B"],
    ["gh logged out", parseGh("You are not logged into any GitHub hosts."), null],
    ["netlify", parseNetlify("Current Netlify User\nName: x\nEmail: hello@rocketgrowthagency.com\nTeams:"), "hello@rocketgrowthagency.com"],
    ["netlify logged out", parseNetlify("Not logged in"), null],
  ];
  const wrong = probes.filter(([, got, want]) => got !== want);
  if (wrong.length) {
    console.error("⚠️  INDETERMINATE — this gate's own parsers are wrong about output whose answer is known:");
    for (const [what, got, want] of wrong) console.error(`     ${what}: read ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    console.error("   Fix the parsing. Do NOT read this as a credential being wrong.");
    process.exit(2);
  }
}

// ── 1 · WHO AUTHORS A COMMIT ──────────────────────────────────────────────────────────────────
{
  const got = sh("git", ["-C", SITE, "config", "user.email"]);
  rows.push(["git author", got || "(unset)", got === EMAIL]);
  if (got !== EMAIL) F(`git commits here would be authored as ${got || "(unset)"}, not ${EMAIL}`);
}

// ── 2 · WHERE A PUSH GOES ─────────────────────────────────────────────────────────────────────
{
  const url = sh("git", ["-C", SITE, "config", "--get", "remote.origin.url"]) || "";
  const ok = /^git@github\.com-[a-z]+:rocketgrowthagency\//.test(url);
  rows.push(["git remote", url || "(unset)", ok]);
  // 🔑 An HTTPS or bare git@github.com URL authenticates as whichever account the keychain or the
  // agent answers with — which is how history gets polluted without anything looking wrong.
  if (!ok) F(`origin is ${url || "(unset)"} — not the RGA SSH alias, so a push could authenticate as another account`);
}

// ── 3 · WHICH GITHUB ACCOUNT THE SSH ALIAS REACHES ────────────────────────────────────────────
{
  const out = sh("ssh", ["-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes", "-T", "git@github.com-rga"]) || "";
  const who = parseSsh(out);
  if (who === null) rows.push(["ssh github.com-rga", "(unreachable)", null]);
  else {
    rows.push(["ssh github.com-rga", who, who === OWNER]);
    if (who !== OWNER) F(`the github.com-rga SSH alias authenticates as ${who}, not ${OWNER}`);
  }
}

// ── 4 · THE gh CLI — a THIRD credential, independent of both SSH keys ─────────────────────────
{
  const out = sh("gh", ["auth", "status"]) || "";
  const active = parseGh(out);
  if (!active) rows.push(["gh CLI", "(not logged in)", null]);   // no account cannot act as anybody
  else {
    rows.push(["gh CLI", active, active === OWNER]);
    if (active !== OWNER) F(`the gh CLI is active as ${active} — any gh issue/pr/api write would land on RGA's GitHub under that account`);
  }
}

// ── 5 · THE NETLIFY CLI, which can publish ────────────────────────────────────────────────────
{
  const out = sh("npx", ["--no-install", "netlify", "status"], { cwd: SITE }) || "";
  const m = parseNetlify(out) ? [null, parseNetlify(out)] : null;
  if (!m) rows.push(["netlify CLI", "(not logged in)", null]);
  else {
    rows.push(["netlify CLI", m[1], m[1] === EMAIL]);
    if (m[1] !== EMAIL) F(`the Netlify CLI is logged in as ${m[1]} — a deploy from here could publish to another account's site`);
  }
}

// ── 6 · gcloud, because raising a quota on the wrong project is a standing hard rule ──────────
{
  const acct = sh("gcloud", ["config", "get-value", "account"]);
  const live = acct && acct !== "(unset)" && !/^\s*$/.test(acct);
  rows.push(["gcloud", live ? acct : "(not configured)", live ? null : null]);
  // 🔑 Deliberately not failed on: RGA has no declared gcloud identity to compare against, and
  // inventing one would be a rule from a slogan. Reported so drift is visible.
  // → feedback_a_gate_written_from_a_slogan_defends_the_misreading
}

const w = Math.max(...rows.map((r) => r[0].length)) + 2;
for (const [label, value, ok] of rows) {
  const mark = ok === true ? "✅" : ok === false ? "🔴" : "— ";
  console.log(`  ${mark} ${label.padEnd(w)}${value}`);
}

if (fails.length) {
  console.error("\n🔴 an identity on this machine does not point at RGA:");
  for (const f of fails) console.error("   · " + f);
  console.error("\n   Every other guard fires at the MOMENT OF ACTION. This one is the standing check,");
  console.error("   so drift is seen before it is acted on rather than after.");
  process.exit(1);
}
console.log(`\n✅ every live identity points at RGA — ${rows.filter((r) => r[2] === true).length} verified, ${rows.filter((r) => r[2] === null).length} not configured (cannot act as anybody)`);
