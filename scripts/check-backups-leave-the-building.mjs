#!/usr/bin/env node
// check-backups-leave-the-building.mjs — THE BACKUPS ARE FRESH, ON THE DRIVE AND OUTSIDE THIS MAC (checkers build 11-11; master map approved).
// → memory project_data_backup_plan ("Supabase backups + off-site still to do") · feedback_backup_to_x10_only
//
// GUARDS: the backups that would bring RGA back after a lost Mac or a broken database actually exist and are recent.
//   1 · the LaCie copies (~/.claude/backup-lacie-status.json: chats, memory, repos; ~/.claude/backup-data-status.json: the clients' data)
//       ran OK within 80 hours (Mon-Fri jobs, so Friday's copy carries the weekend);
//   2 · Supabase's own daily backup (Management API GET /v1/projects/<ref>/database/backups, read-only, SUPABASE_ACCESS_TOKEN) has a
//       COMPLETED backup within 36 hours. That one lives in Supabase's cloud: the copy that leaves the building.
// 🔴 A source that can't be read (no status file, no token, the API down) is INDETERMINATE, never green.
// The output names what has NO copy outside this Mac (the chats are on the LaCie only; code and the memory mirror are on GitHub).
// 🔑 SELF-PROVING: the rules (scripts/lib/backup-judge.mjs, read from SCRAPER_COPY_DIR when set) run on fixtures first; in the mutation
// harness only that runs.
// Exit 0 = fresh · 1 = a backup is stale or failed · 2 = INDETERMINATE.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const lib = fs.existsSync(path.join(SCR, "scripts/lib/backup-judge.mjs")) ? path.join(SCR, "scripts/lib/backup-judge.mjs") : path.join(REAL, "scripts/lib/backup-judge.mjs");
const B = await import(pathToFileURL(lib).href);

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const now = Date.UTC(2026, 10, 11, 20);
  const ago = (h) => new Date(now - h * 3600e3).toISOString();
  const t = (got, want, m) => { if (got !== want) idk(`self-test: ${m} reads ${got}, not ${want}`); };
  t(B.judgeLacie("x", { at: ago(5), ok: true }, now).state, "ok", "a 5-hour-old good copy");
  t(B.judgeLacie("x", { at: ago(79), ok: true }, now).state, "ok", "Friday's copy on Monday afternoon (79 h)");
  t(B.judgeLacie("x", { at: ago(81), ok: true }, now).state, "red", "an 81-hour-old copy");
  t(B.judgeLacie("x", { at: ago(2), ok: false, problems: "drive full" }, now).state, "red", "a failed run");
  t(B.judgeLacie("x", null, now).state, "unknown", "no status file");
  t(B.judgeLacie("x", { ok: true }, now).state, "unknown", "a status with no time");
  t(B.judgeSupabase({ backups: [{ status: "COMPLETED", inserted_at: ago(10) }] }, now).state, "ok", "a 10-hour-old Supabase backup");
  t(B.judgeSupabase({ backups: [{ status: "COMPLETED", inserted_at: ago(40) }, { status: "FAILED", inserted_at: ago(2) }] }, now).state, "red", "a failed newest + a 40-hour-old completed");
  t(B.judgeSupabase({ backups: [] }, now).state, "red", "no Supabase backups");
  t(B.judgeSupabase({ message: "Unauthorized" }, now).state, "unknown", "an unreadable answer");
}
if (process.env.SCRAPER_COPY_DIR) { console.log("✅ self-test held (mutation copy: the real backups are not read)"); process.exit(0); }

// ── the real backups ─────────────────────────────────────────────────────────────────────────────────────────────────────
const now = Date.now();
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const v = [
  B.judgeLacie("LaCie copy (chats, memory, repos)", readJson(path.join(os.homedir(), ".claude/backup-lacie-status.json")), now),
  B.judgeLacie("LaCie copy of the clients' data", readJson(path.join(os.homedir(), ".claude/backup-data-status.json")), now),
];
const envText = (() => { try { return fs.readFileSync(path.join(REAL, ".env"), "utf8"); } catch { return ""; } })();
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ((/^SUPABASE_ACCESS_TOKEN=(.*)$/m.exec(envText) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
let body = null;
if (TOKEN) {
  try { const r = await fetch("https://api.supabase.com/v1/projects/jetgayimvfeslqnkbfdq/database/backups", { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(20000) }); body = r.ok ? await r.json() : null; } catch { body = null; }
}
v.push(TOKEN ? B.judgeSupabase(body, now) : { state: "unknown", line: "Supabase backups: no SUPABASE_ACCESS_TOKEN here, so they can't be read" });
const offsite = "Outside this Mac: the database (Supabase's own backups), the code and the memory mirror (GitHub). The chats are on the LaCie only.";
const red = v.filter((x) => x.state === "red"), unk = v.filter((x) => x.state === "unknown");
if (red.length) { console.error(`🔴 a backup is stale or failed:\n${v.map((x) => `   ${x.state === "red" ? "·" : " "} ${x.line}`).join("\n")}\n   ${offsite}`); process.exit(1); }
if (unk.length) idk(`a backup could not be read, so it is not known to be fresh:\n${v.map((x) => `   ${x.state === "unknown" ? "·" : " "} ${x.line}`).join("\n")}`);
console.log(`✅ the backups are fresh: ${v.map((x) => x.line).join(" · ")}. ${offsite}`);
