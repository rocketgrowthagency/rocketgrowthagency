#!/usr/bin/env node
// check-a-backup-restores.mjs — the newest client data backup can actually be read back, whole, and agrees with its own manifest.
//
// 🔴 WHY (rga_data_backup_plan_v1): a backup nobody restored is a belief. The nightly job writes the copy and the manifest; nothing read the
// copy back. This reads the newest dated folder into a temp folder (the way a restore would start), parses every table file the manifest
// lists, and compares row counts with what the manifest says it wrote. Monthly, from daily-health-check.sh (1st to 7th).
//
// READ ONLY: no database, no network, nothing on the drive is written. Prints names and counts, never a row or a value.
//
// Row counts: the three Business Profile tables may be shorter than the manifest says by exactly what the 30-day strip removed, and the
// manifest records that in gbp_stripped, so the allowance is that number and no more.
// Exit 0 restores · 1 it doesn't (what is wrong is named) · 2 can't tell (drive not mounted, no copy yet, manifest unreadable)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = process.env.BACKUP_DATA_DIR || "/Volumes/LaCie - APFS (Mac)/RGA-Data-Backups";
const DATED = /^\d{4}-\d{2}-\d{2}$/;
const bad = [];
const fail = (m) => bad.push(m);
const cant = (m) => { console.error(`⚠️  INDETERMINATE: ${m}`); process.exit(2); };

if (!fs.existsSync(path.dirname(DIR))) cant("the backup drive isn't mounted");
if (!fs.existsSync(DIR)) cant("the backup folder doesn't exist on the drive");
const nights = fs.readdirSync(DIR).filter((n) => DATED.test(n) && fs.existsSync(path.join(DIR, n, "manifest.json"))).sort();
if (!nights.length) cant("no dated backup with a manifest yet");
const night = nights[nights.length - 1];

// restore step 1: copy the night into a temp folder and read from there
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rga-restore-check-"));
const cleanup = () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* temp */ } };
let manifest;
try {
  fs.cpSync(path.join(DIR, night), T, { recursive: true });
  manifest = JSON.parse(fs.readFileSync(path.join(T, "manifest.json"), "utf8"));
} catch (e) { cleanup(); cant(`the ${night} copy can't be read from the drive (${String(e.code || e.name)})`); }

if (!Array.isArray(manifest.tables) || !manifest.tables.length) fail("the manifest lists no tables");
if (Array.isArray(manifest.problems) && manifest.problems.length) fail(`the manifest itself records ${manifest.problems.length} problem(s) from that night`);
const stripped = {};
for (const s of manifest.gbp_stripped || []) stripped[s.table] = (stripped[s.table] || 0) + (Number(s.rows_removed) || 0);

let rowsRead = 0, tablesOk = 0;
for (const t of manifest.tables || []) {
  const name = String(t.table || "");
  if (!/^\w+$/.test(name)) { fail("a manifest table name isn't a plain name"); continue; }
  const file = path.join(T, "db", `${name}.json`);
  if (!fs.existsSync(file)) { fail(`${name}: listed in the manifest, file missing`); continue; }
  let rows;
  try { rows = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`${name}: file doesn't parse`); continue; }
  if (!Array.isArray(rows)) { fail(`${name}: file isn't a list of rows`); continue; }
  const want = Number(t.rows);
  if (!Number.isFinite(want) || want < 0) { fail(`${name}: manifest row count isn't a number`); continue; }
  const allowed = stripped[name] || 0;
  if (rows.length > want || rows.length < want - allowed) fail(`${name}: file has ${rows.length} rows, manifest says ${want}${allowed ? ` (strip allowance ${allowed})` : ""}`);
  else { tablesOk++; rowsRead += rows.length; }
}
// the sign-ins file is written beside the tables and counted as `logins`
if (manifest.logins != null) {
  const lf = path.join(T, "db", "auth_users.json");
  try { const u = JSON.parse(fs.readFileSync(lf, "utf8")); if (!Array.isArray(u) || u.length !== Number(manifest.logins)) fail(`auth_users: file has ${Array.isArray(u) ? u.length : "no list of"} sign-ins, manifest says ${manifest.logins}`); }
  catch { fail("auth_users: file missing or doesn't parse"); }
}
// the whole copy must not have shrunk to a fraction of the night before (a table-by-table match can pass a copy that lost everything together)
if (nights.length > 1) {
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(DIR, nights[nights.length - 2], "manifest.json"), "utf8"));
    const sum = (m) => (m.tables || []).reduce((a, r) => a + (Number(r.rows) || 0), 0);
    if (sum(prev) > 100 && sum(manifest) < sum(prev) * 0.5) fail(`total rows fell from ${sum(prev)} to ${sum(manifest)} since the night before`);
  } catch { /* the earlier manifest is unreadable: that night's own check is not this one's job */ }
}
cleanup();
if (bad.length) { console.error(`🔴 the ${night} backup does not restore cleanly:\n${bad.map((b) => `   · ${b}`).join("\n")}`); process.exit(1); }
console.log(`✅ the ${night} backup restores: ${tablesOk} tables parse, ${rowsRead} rows match the manifest`);
