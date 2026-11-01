#!/usr/bin/env node
// check-a-backup-restore-check-can-fail.mjs — check-a-backup-restores.mjs says 0 for a whole copy, 1 for a damaged one, 2 when it can't tell,
// and never prints a row. Runs it against small fake backups in a temp folder; touches no drive and no database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const SCRIPT = `${ROOT}/scripts/check-a-backup-restores.mjs`;
const bad = [], fail = (m) => bad.push(m);
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rga-restore-gate-"));
const MARK = "PRIVATE-CLIENT-NAME-MUST-NOT-PRINT";

function build(name, { mutate } = {}) {
  const base = path.join(T, name, "RGA-Data-Backups");
  const night = path.join(base, "2026-11-01"), prior = path.join(base, "2026-10-31");
  for (const [d, n] of [[prior, 300], [night, 300]]) {
    fs.mkdirSync(path.join(d, "db"), { recursive: true });
    fs.writeFileSync(path.join(d, "db", "clients.json"), JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i, name: MARK }))));
    fs.writeFileSync(path.join(d, "db", "client_gbp_snapshots.json"), JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: i }))));
    fs.writeFileSync(path.join(d, "db", "auth_users.json"), JSON.stringify([{ id: "u1" }, { id: "u2" }]));
    fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ date: path.basename(d), tables: [{ table: "clients", rows: n }, { table: "client_gbp_snapshots", rows: 8 }], logins: 2, buckets: [], problems: [], gbp_stripped: [{ table: "client_gbp_snapshots", rows_removed: 3 }] }));
  }
  if (mutate) mutate(night);
  return base;
}
const run = (dir) => spawnSync("node", [SCRIPT], { env: { ...process.env, BACKUP_DATA_DIR: dir }, encoding: "utf8" });
const expect = (label, dir, code, extra) => {
  const r = run(dir);
  if (r.status !== code) fail(`${label}: exit ${r.status}, wanted ${code}. ${(r.stderr + r.stdout).trim().slice(0, 160)}`);
  if ((r.stdout + r.stderr).includes(MARK)) fail(`${label}: printed client data`);
  if (extra) extra(r);
};
const w = (night, f, s) => fs.writeFileSync(path.join(night, "db", f), s);

expect("a whole copy", build("good"), 0);
expect("a file cut short", build("short", { mutate: (n) => w(n, "clients.json", JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i })))) }), 1);
expect("a file that doesn't parse", build("garbled", { mutate: (n) => w(n, "clients.json", "[{\"id\":1,") }), 1);
expect("a listed file missing", build("missing", { mutate: (n) => fs.rmSync(path.join(n, "db", "clients.json")) }), 1);
expect("a strip larger than the manifest allows", build("overstrip", { mutate: (n) => w(n, "client_gbp_snapshots.json", "[]") }), 1);
expect("sign-ins that don't match", build("logins", { mutate: (n) => w(n, "auth_users.json", "[]") }), 1);
expect("a manifest that records problems", build("problems", { mutate: (n) => { const m = JSON.parse(fs.readFileSync(path.join(n, "manifest.json"))); m.problems = ["x"]; fs.writeFileSync(path.join(n, "manifest.json"), JSON.stringify(m)); } }), 1);
expect("everything shrinking together", build("shrunk", { mutate: (n) => { w(n, "clients.json", JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: i })))); const m = JSON.parse(fs.readFileSync(path.join(n, "manifest.json"))); m.tables[0].rows = 100; fs.writeFileSync(path.join(n, "manifest.json"), JSON.stringify(m)); } }), 1);
expect("a drive that isn't there", path.join(T, "nodrive", "x", "RGA-Data-Backups"), 2);
const empty = path.join(T, "empty", "RGA-Data-Backups"); fs.mkdirSync(empty, { recursive: true });
expect("no copy yet", empty, 2);
const hash = (d) => spawnSync("find", [d, "-type", "f", "-exec", "cksum", "{}", "+"], { encoding: "utf8" }).stdout;
{ const g = build("ro"); const before = hash(g); run(g); if (hash(g) !== before) fail("it changed the backup it was reading"); }
fs.rmSync(T, { recursive: true, force: true });
if (bad.length) { console.error(`🔴 the restore check can't be trusted:\n${bad.map((b) => `   · ${b}`).join("\n")}`); process.exit(1); }
console.log("✅ the restore check passes a whole copy, fails a damaged one seven ways, says 'can't tell' without a drive, prints no row, writes nothing");
