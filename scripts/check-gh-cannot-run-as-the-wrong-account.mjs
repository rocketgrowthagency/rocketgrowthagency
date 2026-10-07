#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A gh COMMAND IN AN RGA REPO CANNOT RUN AS ANOTHER BUSINESS'S GITHUB ACCOUNT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY (2026-10-07). A push printed an advisory: the gh CLI was active as **EchoryLLC** — a
// different business — while working in RGA's repo. The pushes themselves were safe (SSH key through
// the github.com-rga alias, destination proven by .githooks/pre-push), but any `gh issue create`,
// `gh pr create` or `gh api` write would have landed on RGA's GitHub under Echory's name.
//
// Chris: *"this should never happen so we need to harden our system."*
//
// 🔑 THE PUSH HOOK CANNOT COVER IT — and says so in its own comments, correctly: it guards the push
// DESTINATION, and gh's account has no bearing on who a key-authenticated push lands as. A gh
// command is not a push and never reaches that hook. Different failure mode, different guard.
// → feedback_never_touch_echory · feedback_rga_git_account
//
// 🔴 AND "THE FILE EXISTS" IS NOT "THE GUARD WORKS". This runs the guard against a stubbed gh that
// reports the wrong account, and against one that reports the right account, and requires it to
// block the first and allow the second. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const GUARD = path.join(SITE, "scripts/gh-account-guard.sh");
const fails = [];
const F = (m) => fails.push(m);

// 🔴 A HOOK'S FAILURE MODE IS THE WHOLE TOOL. A guard that cannot be parsed exits non-zero and
// blocks EVERY Bash command, not just the gh ones — that happened on 2026-10-07 and locked the
// session out until the file was rewritten through a non-Bash tool. Both halves must parse.
// → feedback_a_flaky_gate_is_worse_than_a_failing_one
{
  const py = path.join(SITE, "scripts/gh-account-guard.py");
  if (!fs.existsSync(py)) F("scripts/gh-account-guard.py is gone — the wrapper would find nothing to run");
  else {
    try { execFileSync("python3", ["-c", "import ast,sys;ast.parse(open(sys.argv[1]).read())", py], { stdio: "pipe" }); }
    catch { F("gh-account-guard.py does not parse — as a PreToolUse hook it would block EVERY Bash command, not only gh"); }
  }
  if (fs.existsSync(GUARD)) {
    try { execFileSync("sh", ["-n", GUARD], { stdio: "pipe" }); }
    catch { F("gh-account-guard.sh does not parse — as a PreToolUse hook it would block EVERY Bash command, not only gh"); }
  }
}

if (!fs.existsSync(GUARD)) {
  F("scripts/gh-account-guard.sh is gone — nothing stops a gh command running as another account");
} else {
  // ── it must be WIRED, or it is a file nobody runs ──────────────────────────────────────────
  // 🔴 settings.local.json is gitignored by design, so a fresh clone has no hooks at all. That is
  // worth failing on: the protection is only real on a machine where it is installed.
  // 🔴 THE WIRING IS A MACHINE-LEVEL INSTALL, NOT A FILE IN THE TREE. `settings.local.json` is
  // gitignored by design, so a scratch COPY of the site never has it — and a gate that cannot run
  // against a copy was never tested. The SCRIPT is read from SITE so mutations can reach it; the
  // WIRING is read from the real checkout, always.
  // → feedback_a_gate_that_cannot_be_pointed_at_a_copy_was_never_tested
  const REAL_SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
  const settings = path.join(REAL_SITE, ".claude/settings.local.json");
  if (!fs.existsSync(settings)) {
    F(".claude/settings.local.json is missing — the guard exists but nothing invokes it");
  } else {
    let wired = false;
    try {
      const d = JSON.parse(fs.readFileSync(settings, "utf8"));
      for (const g of d?.hooks?.PreToolUse || []) {
        if (!/Bash/.test(g.matcher || "")) continue;
        for (const hk of g.hooks || []) if (String(hk.command || "").includes("gh-account-guard.sh")) wired = true;
      }
    } catch { F(".claude/settings.local.json does not parse, so the hook wiring cannot be read"); }
    if (!wired) F("gh-account-guard.sh is not wired as a PreToolUse(Bash) hook — it would never run");
  }

  // ── and it must actually BLOCK ─────────────────────────────────────────────────────────────
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ghguard-"));
  const stubGh = (account) => {
    // 🔑 `null` stands for "gh is installed but logged out" — which is NOT the wrong account, and
    // must not be blocked. Without this case the fail-open branch is untestable.
    const body = account === null
      ? `#!/bin/sh\necho "You are not logged into any GitHub hosts." >&2\nexit 1\n`
      : `#!/bin/sh\ncat <<'OUT'\ngithub.com\n  ✓ Logged in to github.com account ${account} (keyring)\n  - Active account: true\nOUT\n`;
    fs.writeFileSync(path.join(bin, "gh"), body, { mode: 0o755 });
  };
  const run = (command, account) => {
    stubGh(account);
    try {
      execFileSync("sh", [GUARD], {
        input: JSON.stringify({ tool_input: { command } }),
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        stdio: ["pipe", "pipe", "pipe"],
      });
      return 0;
    } catch (e) { return e.status ?? -1; }
  };

  const CASES = [
    ["gh issue create --title x", "EchoryLLC", 2, "a gh command under the wrong account must be blocked"],
    ["gh pr create", "EchoryLLC", 2, "creating a PR as another business must be blocked"],
    ["gh api repos/x/y -X PATCH", "EchoryLLC", 2, "a gh api write under the wrong account must be blocked"],
    ["gh issue create --title x", "rocketgrowthagency", 0, "the right account must not be blocked"],
    ["gh auth login", "EchoryLLC", 0, "the command that FIXES the account must never be blocked"],
    ["gh auth switch -u rocketgrowthagency", "EchoryLLC", 0, "switching accounts must never be blocked"],
    ["git push origin main", "EchoryLLC", 0, "a push is guarded by pre-push, not here"],
    ["ls /tmp/gh/x", "EchoryLLC", 0, "a path containing 'gh' is not a gh command"],
    ["gh issue create --title x", null, 0, "gh logged out is NO account, not the WRONG one — gh says so better than we can"],
    ["cd /tmp && gh pr list", "EchoryLLC", 2, "a gh call chained after && is still a gh call"],
    // 🔴🔴 THE FALSE POSITIVE THAT LOCKED THE SESSION OUT: a `git commit` whose MESSAGE described
    // this guard, with "gh auth login" inside a heredoc. Prose is not a command.
    ["git commit -F - <<MSG\ngh cannot act as another business\nFix: gh auth login, then gh issue create is blocked.\nMSG", "EchoryLLC", 0,
      "prose inside a heredoc is not a command — this exact shape blocked every Bash call"],
    ['echo "run gh pr create to open it"', "EchoryLLC", 0, "a gh mention inside a quoted string is not a command"],
    ['echo "first line\ngh pr create"', "EchoryLLC", 0,
      "a quoted string whose newline makes gh LOOK like a command start — isolates the quote stripping"],
    ["echo 'first line\ngh pr create'", "EchoryLLC", 0,
      "the same inside SINGLE quotes — stripped by a different line, so it needs its own fixture"],
    ["grep -rn gh issue scripts/", "EchoryLLC", 0,
      "gh as an argument to another command is not a gh invocation — isolates the command-start anchor"],
  ];
  for (const [cmd, acct, want, why] of CASES) {
    const got = run(cmd, acct);
    if (got !== want) F(`${why} — \`${cmd}\` as ${acct} exited ${got}, expected ${want}`);
  }
  fs.rmSync(bin, { recursive: true, force: true });
}

if (fails.length) {
  console.error("🔴 a gh command could run as the wrong GitHub account:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ gh cannot run as another business's account in an RGA repo — guard present, wired as PreToolUse(Bash), and blocks 4 wrong-account commands while allowing 11 that must pass");
