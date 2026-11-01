#!/usr/bin/env node
// check-lacie-backup-works.mjs — the daily copy of chats, memory and both repos really copies, never removes,
// never carries a secret, says so when it fails, and really ran in the last day and a half.
//
// 🔒 WHY (Chris 10-31: "make sure we have all backups saved ... chat histories on Mac and LaCie"). Found that day:
// Claude Code had been deleting chats after 30 days, Time Machine's drive had been away 12 days, and most commits
// were on this Mac alone. A backup nobody checks is a belief. The script runs for real here, on throwaway folders.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const SCRIPT = `${ROOT}/scripts/backup-lacie.sh`;
const REAL_STATUS = process.env.LACIE_BACKUP_REAL_STATUS || `${os.homedir()}/.claude/backup-lacie-status.json`;
const MAX_AGE_H = 36;

const bad = [];
const fail = (m) => bad.push(m);
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rga-backup-"));
const p = (...a) => path.join(T, ...a);
const has = (f) => fs.existsSync(f);
const run = (over = {}) => spawnSync("bash", [SCRIPT], {
  encoding: "utf8",
  env: { ...process.env, BACKUP_QUIET: "1", BACKUP_LACIE: p("lacie"), BACKUP_MAC: p("mac"), BACKUP_CHATS_SRC: p("src"),
    BACKUP_WEBSITE: p("repo"), BACKUP_SCRAPER: p("repo"), BACKUP_STATUS: p("status.json"), ...over },
});
const status = () => { try { return JSON.parse(fs.readFileSync(p("status.json"), "utf8")); } catch { return null; } };

try {
  fs.mkdirSync(p("src/proj/sub"), { recursive: true });
  fs.mkdirSync(p("lacie"));
  fs.mkdirSync(p("repo"));
  fs.writeFileSync(p("src/proj/old.jsonl"), "old chat\n");
  fs.writeFileSync(p("src/proj/sub/agent.jsonl"), "agent\n");
  fs.writeFileSync(p("src/proj/memory.md"), "memory\n");
  const git = (...a) => execFileSync("git", ["-C", p("repo"), "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" });
  git("init", "-q");
  fs.writeFileSync(p("repo/committed.txt"), "committed\n");
  git("add", "committed.txt");
  git("commit", "-qm", "one");
  fs.writeFileSync(p("repo/uncommitted.txt"), "work in progress\n");
  fs.writeFileSync(p("repo/.env"), "A_SECRET=1\n");
  fs.writeFileSync(p("repo/.env.local"), "A_SECRET=2\n");
  fs.mkdirSync(p("repo/node_modules"));
  fs.writeFileSync(p("repo/node_modules/x.js"), "x\n");

  const good = run();
  if (good.status !== 0) fail(`a clean run exits ${good.status}, not 0`);
  if (status()?.ok !== true) fail("a clean run doesn't record ok:true");
  for (const [dest, name] of [["lacie/Claude chat histories", "LaCie"], ["mac", "the Mac copy"]]) {
    if (!has(p(dest, "proj/old.jsonl"))) fail(`a chat doesn't reach ${name}`);
    if (!has(p(dest, "proj/sub/agent.jsonl"))) fail(`a subagent chat doesn't reach ${name}`);
    if (!has(p(dest, "proj/memory.md"))) fail(`memory doesn't reach ${name}`);
  }
  const live = p("lacie/RGA-Backups/live");
  for (const repo of ["website", "scraper"]) {
    if (!has(`${live}/${repo}/committed.txt`)) fail(`${repo}: files aren't copied`);
    if (!has(`${live}/${repo}/uncommitted.txt`)) fail(`${repo}: uncommitted work isn't copied`);
    if (has(`${live}/${repo}/.env`) || has(`${live}/${repo}/.env.local`)) fail(`${repo}: a .env file reached the drive in plain text`);
    if (has(`${live}/${repo}/node_modules`)) fail(`${repo}: node_modules is copied`);
    const dir = p("lacie/RGA-Backups/git-bundles");
    const bundle = has(dir) ? fs.readdirSync(dir).find((f) => f.startsWith(`${repo}-`) && f.endsWith(".bundle")) : null;
    if (!bundle) { fail(`${repo}: no git bundle`); continue; }
    const out = p(`clone-${repo}`);
    const c = spawnSync("git", ["clone", "-q", `${dir}/${bundle}`, out], { encoding: "utf8" });
    if (c.status !== 0 || !has(`${out}/committed.txt`)) fail(`${repo}: the git bundle can't be restored`);
  }

  // add-only: Claude Code may remove a chat from the Mac; the backups keep it
  fs.rmSync(p("src/proj/old.jsonl"));
  run();
  if (!has(p("lacie/Claude chat histories/proj/old.jsonl"))) fail("a chat removed from the Mac is removed from LaCie too");
  if (!has(p("mac/proj/old.jsonl"))) fail("a chat removed from the Mac is removed from the Mac copy too");

  // a failure is loud, and the Mac copy still happens
  fs.writeFileSync(p("src/proj/new.jsonl"), "new chat\n");
  const noDrive = run({ BACKUP_LACIE: p("not-plugged-in") });
  if (noDrive.status === 0) fail("LaCie missing still exits 0");
  if (status()?.ok !== false) fail("LaCie missing still records ok");
  if (!has(p("mac/proj/new.jsonl"))) fail("LaCie missing stops the Mac copy too");
  const noRepo = run({ BACKUP_WEBSITE: p("no-such-repo") });
  if (noRepo.status === 0 || status()?.ok !== false) fail("a missing repo isn't reported");
} catch (e) {
  fail(`the test itself broke: ${e.message}`);
} finally {
  fs.rmSync(T, { recursive: true, force: true });
}

// it really ran, on this machine, recently
try {
  const s = JSON.parse(fs.readFileSync(REAL_STATUS, "utf8"));
  const ageH = (Date.now() - Date.parse(s.at)) / 3600e3;
  if (!(ageH <= MAX_AGE_H)) fail(`the last real backup was ${Math.round(ageH)} hours ago`);
  if (s.ok !== true) fail(`the last real backup failed: ${s.problems}`);
  if (s.chats_only === true) fail("the last real backup copied chats only, not the repos");
} catch (e) {
  fail(`no record of a real backup at ${REAL_STATUS}`);
}

if (bad.length) {
  console.log("🔴 the LaCie backup isn't doing its job:");
  for (const b of bad) console.log(`   · ${b}`);
  process.exit(1);
}
console.log("✅ the LaCie backup copies chats, memory, repos and uncommitted work, removes nothing, carries no .env, fails loudly, and ran in the last 36 hours");
