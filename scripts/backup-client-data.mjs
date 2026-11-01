#!/usr/bin/env node
// backup-client-data.mjs — a dated copy of every Supabase table and every stored client file, on LaCie.
//
// 🔴 WHY (rga_data_backup_plan_v1, approved Chris 10-31). Supabase's own list showed 0 backups and point-in-time recovery off, and
// database backups never cover storage files. The clients' records, photos, videos and contracts lived in exactly one place.
//
// IT ONLY READS. Nothing is written to Supabase. One request at a time, with a pause; it won't start if the database is slow and waits 10 s after a slow request: this
// shares the clients' database → feedback_my_test_runs_share_the_clients_database.
//
// 🔒 NO KEYS ON THE DRIVE. Clients' Google tokens could act on their accounts, so any field named like a key, and any value shaped like
// one, is removed before writing. After a disaster a client reconnects. Only the COUNT of what was removed is recorded, never a value.
//
//   <dir>/YYYY-MM-DD/db/<table>.json   every row, every night (auth_users.json: the sign-ins, scrubbed)
//   <dir>/YYYY-MM-DD/manifest.json     row counts, file counts, what was removed
//   <dir>/files/<bucket>/<path>        add-only; a file that changed is kept beside the old one
//
// Keeps 30 nightly folders and each month's first good night forever, and prunes only after a run that fully succeeded.
// Exit 0 copied · 1 something failed (recorded, and the Mac is told) · 2 didn't start: database slow or LaCie missing
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPA = process.env.BACKUP_DATA_SUPA_URL || process.env.SUPABASE_URL;
const KEY = process.env.BACKUP_DATA_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIR = process.env.BACKUP_DATA_DIR || "/Volumes/LaCie - APFS (Mac)/RGA-Data-Backups";
const STATUS = process.env.BACKUP_DATA_STATUS || `${os.homedir()}/.claude/backup-data-status.json`;
const TODAY = process.env.BACKUP_DATA_TODAY || new Date().toISOString().slice(0, 10);
const PAGE = Number(process.env.BACKUP_DATA_PAGE || 200);
const PAUSE_MS = Number(process.env.BACKUP_DATA_PAUSE_MS ?? 150);
const SLOW_MS = Number(process.env.BACKUP_DATA_SLOW_MS || 5000);
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── pure: what must never reach the drive ───────────────────────────────────────────────────────
// the NAME has to END like a key. "metrics_refreshed_at", "token_expires_at", a step called "m1.access.password_manager" and a client's
// "credentials" (licensed, insured) are data; the first version of this removed them, which is losing client work by another route.
export const SECRET_NAME = /(?:^|[_.-])(?:access_token|refresh_token|id_token|auth_token|bearer_token|token|token_enc|client_secret|secret|api_?key|private_?key|password|passwd|access_key)$|(?:accessToken|refreshToken|idToken|authToken|clientSecret|apiKey|privateKey)$/i;
export const SECRET_VALUE = /^(ya29\.|1\/\/0|sk_live_|sk_test_|rk_live_|sb_secret_|whsec_|ghp_|github_pat_|eyJ[A-Za-z0-9_-]{20,}\.)/;
export function scrub(v, counts = { names: {}, values: 0 }) {
  if (Array.isArray(v)) return v.map((x) => scrub(x, counts));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_NAME.test(k) && x !== null && x !== "") { counts.names[k] = (counts.names[k] || 0) + 1; out[k] = "[removed]"; }
      else out[k] = scrub(x, counts);
    }
    return out;
  }
  if (typeof v === "string" && SECRET_VALUE.test(v)) { counts.values++; return "[removed]"; }
  return v;
}
// ── pure: which dated folders stay ─────────────────────────────────────────────────────────────
// 🔴 audit 10-31: the month's copy was the folder named -01, so an unplugged drive or an offline Mac on the 1st lost that month for good. It's the month's first GOOD
// night now: `good(name)` says a folder's own record shows no problems, and a month with no good night keeps its first folder rather than nothing.
export function keepFolders(names, nightly = 30, good = () => true) {
  const dated = names.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  const recent = new Set(dated.slice(-nightly));
  const monthly = new Map();
  for (const n of dated) { const m = n.slice(0, 7), cur = monthly.get(m); if (!cur || (!cur.good && good(n))) monthly.set(m, { name: n, good: good(n) }); }
  const firsts = new Set([...monthly.values()].map((x) => x.name));
  return new Set(dated.filter((n) => recent.has(n) || firsts.has(n)));
}
function folderIsGood(name) {
  try { const m = JSON.parse(fs.readFileSync(path.join(DIR, name, "manifest.json"), "utf8")); return Array.isArray(m.problems) && !m.problems.length; } catch { return false; }
}

async function get(url, init = {}) {
  const t0 = Date.now();
  const r = await fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const took = Date.now() - t0;
  if (took > SLOW_MS) await sleep(10000);   // the database is struggling: give it room
  return r;
}
async function pkOf(defs, table) {
  const props = defs?.[table]?.properties || {};
  const pk = Object.entries(props).find(([, p]) => /<pk\b/i.test(p?.description || ""));
  return pk ? pk[0] : props.created_at ? "created_at" : null;
}
async function copyTable(table, defs, dest) {
  const count = Number(((await get(`${SUPA}/rest/v1/${table}?select=*&limit=1`, { method: "HEAD", headers: { Prefer: "count=exact" } })).headers.get("content-range") || "").split("/")[1]);
  const pk = await pkOf(defs, table);
  const counts = { names: {}, values: 0 };
  const file = path.join(dest, `${table}.json`), tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  fs.writeSync(fd, "[");
  let n = 0;
  for (let offset = 0; ; offset += PAGE) {
    const r = await get(`${SUPA}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}${pk ? `&order=${encodeURIComponent(pk)}` : ""}`);
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
    const rows = await r.json();
    for (const row of rows) { fs.writeSync(fd, `${n ? "," : ""}\n${JSON.stringify(scrub(row, counts))}`); n++; }
    if (rows.length < PAGE) break;
    await sleep(PAUSE_MS);
  }
  fs.writeSync(fd, "\n]\n");
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
  // read it back: a file that exists is not a backup
  const back = JSON.parse(fs.readFileSync(file, "utf8"));
  if (back.length !== n) throw new Error(`${table}: wrote ${n}, read back ${back.length}`);
  if (!Number.isFinite(count)) throw new Error(`${table}: the row count couldn't be read, so the copy can't be checked`);   // audit 10-31: NaN skipped this check silently
  if (n < count) throw new Error(`${table}: ${count} rows, copied ${n}`);
  return { table, rows: n, removed: Object.values(counts.names).reduce((a, b) => a + b, 0) + counts.values, removedFields: Object.keys(counts.names) };
}
async function listAll(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const r = await get(`${SUPA}/storage/v1/object/list/${bucket}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }) });
    if (!r.ok) throw new Error(`${bucket}: list HTTP ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id == null) out.push(...await listAll(bucket, p)); else out.push({ path: p, size: Number(it.metadata?.size) || 0, updated: it.updated_at || "" });
    }
    if (items.length < 100) return out;
  }
}
async function copyBucket(bucket, root) {
  const files = await listAll(bucket);
  let copied = 0, have = 0, bytes = 0;
  const failed = [];   // 🔴 audit 10-31: one bad file stopped its whole bucket; every later file went uncopied. Each is tried, and the run still reports failure.
  for (const f of files) {
    try {
      if (f.path.includes("..")) throw new Error(`${bucket}: a path climbs out of the backup folder`);
      let dest = path.join(root, bucket, f.path);
      if (fs.existsSync(dest)) {
        if (!f.size || fs.statSync(dest).size === f.size) { have++; bytes += fs.statSync(dest).size; continue; }
        dest = `${dest}.${String(f.updated || TODAY).replace(/[^0-9]/g, "").slice(0, 14)}`;   // changed: keep both
        if (fs.existsSync(dest)) { have++; continue; }
      }
      const r = await get(`${SUPA}/storage/v1/object/${bucket}/${f.path.split("/").map(encodeURIComponent).join("/")}`);
      if (!r.ok) throw new Error(`${bucket}/${f.path}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (f.size && buf.length !== f.size) throw new Error(`${bucket}/${f.path}: ${f.size} bytes listed, ${buf.length} received`);
      fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      fs.writeFileSync(`${dest}.tmp`, buf, { mode: 0o600 });
      fs.renameSync(`${dest}.tmp`, dest);
      copied++; bytes += buf.length;
      await sleep(PAUSE_MS);
    } catch (e) { failed.push(e.message); console.error(`🔴 ${e.message}`); }
  }
  return { bucket, files: files.length, copied, already: have, bytes, failed };
}
// 🔴 audit 10-31: sign-ins live in Supabase's auth schema, which the table copy can't see. Without this a restore has every record and no one who can log in.
// The password hash and any token go through the same scrub as everything else.
async function copyLogins(dest) {
  const counts = { names: {}, values: 0 }, users = [];
  for (let page = 1; ; page++) {
    const r = await get(`${SUPA}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`);
    if (!r.ok) throw new Error(`logins: HTTP ${r.status}`);
    const batch = (await r.json()).users || [];
    users.push(...batch);
    if (batch.length < PAGE) break;
    await sleep(PAUSE_MS);
  }
  const file = path.join(dest, "auth_users.json");
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(users.map((u) => scrub(u, counts)))}\n`, { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
  if (JSON.parse(fs.readFileSync(file, "utf8")).length !== users.length) throw new Error("logins: the copy doesn't read back whole");
  return users.length;
}
function record(status) {
  fs.mkdirSync(path.dirname(STATUS), { recursive: true });
  fs.writeFileSync(STATUS, `${JSON.stringify({ at: new Date().toISOString(), ...status })}\n`, { mode: 0o600 });
}
function tellChris(msg) {
  if (process.env.BACKUP_QUIET) return;
  spawnSync("osascript", ["-e", `display notification ${JSON.stringify(msg.slice(0, 180))} with title "RGA client data backup failed"`]);
}
async function main() {
  if (!SUPA || !KEY) { console.error("⚠️  no Supabase settings"); record({ ok: false, problem: "no Supabase settings" }); process.exit(2); }
  if (!fs.existsSync(path.dirname(DIR))) { const m = "LaCie isn't connected: client data was not backed up"; console.error(`🔴 ${m}`); record({ ok: false, problem: m }); tellChris(m); process.exit(2); }
  const t0 = Date.now();
  const root = await get(`${SUPA}/rest/v1/`);
  if (!root.ok || Date.now() - t0 > SLOW_MS * 2) { const m = `the database is slow or unavailable (${Date.now() - t0} ms): tonight's copy didn't start`; console.error(`⚠️  ${m}`); record({ ok: false, problem: m }); tellChris(m); process.exit(2); }
  const api = await root.json();
  const tables = Object.keys(api.paths || {}).map((p) => p.slice(1)).filter((n) => n && !n.startsWith("rpc/")).sort();
  if (!tables.length) { const m = "the database listed no tables"; record({ ok: false, problem: m }); tellChris(m); console.error(`🔴 ${m}`); process.exit(1); }
  const night = path.join(DIR, TODAY), db = path.join(night, "db");
  fs.mkdirSync(db, { recursive: true, mode: 0o700 });
  fs.chmodSync(DIR, 0o700);
  const problems = [], tableResults = [], bucketResults = [];
  for (const t of tables) {
    try { const res = await copyTable(t, api.definitions, db); tableResults.push(res); console.log(`  ${t}: ${res.rows} rows${res.removed ? ` · ${res.removed} key field(s) removed` : ""}`); }
    catch (e) { problems.push(`table ${t}: ${e.message}`); console.error(`🔴 table ${t}: ${e.message}`); }
    await sleep(PAUSE_MS);
  }
  let logins = null;
  try { logins = await copyLogins(db); console.log(`  sign-ins: ${logins}`); }
  catch (e) { problems.push(e.message); console.error(`🔴 ${e.message}`); }
  const b = await get(`${SUPA}/storage/v1/bucket`);
  if (!b.ok) problems.push(`buckets: HTTP ${b.status}`);
  for (const { name } of b.ok ? await b.json() : []) {
    try { const res = await copyBucket(name, path.join(DIR, "files")); bucketResults.push(res); if (res.failed.length) problems.push(`bucket ${name}: ${res.failed.length} of ${res.files} file(s) not copied, first: ${res.failed[0]}`); console.log(`  ${name}: ${res.files} files · ${res.copied} new · ${(res.bytes / 1048576).toFixed(1)} MB`); }
    catch (e) { problems.push(`bucket ${name}: ${e.message}`); console.error(`🔴 bucket ${name}: ${e.message}`); }
  }
  const manifest = { date: TODAY, finished: new Date().toISOString(), tables: tableResults, logins, buckets: bucketResults, problems };
  fs.writeFileSync(path.join(night, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`, { mode: 0o600 });
  const rows = tableResults.reduce((a, r) => a + r.rows, 0), files = bucketResults.reduce((a, r) => a + r.files, 0);
  record({ ok: !problems.length, date: TODAY, tables: tableResults.length, rows, logins, files, bytes: bucketResults.reduce((a, r) => a + r.bytes, 0), problem: problems.join("; ").slice(0, 400) });
  if (problems.length) { tellChris(problems[0]); console.error(`🔴 ${problems.length} problem(s). Nothing old was removed.`); process.exit(1); }
  const keep = keepFolders(fs.readdirSync(DIR), 30, folderIsGood);
  for (const n of fs.readdirSync(DIR)) if (/^\d{4}-\d{2}-\d{2}$/.test(n) && !keep.has(n)) fs.rmSync(path.join(DIR, n), { recursive: true, force: true });
  console.log(`✅ ${tableResults.length} tables · ${rows} rows · ${files} files copied to ${DIR}`);
}
// 🔴 audit 10-31: a throw (offline morning) left yesterday's ok:true, no alert, and the 36-hour gate green. A crash is a failure, recorded.
if (fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch((e) => { const m = `the copy crashed: ${String(e?.message || e).slice(0, 200)}`; console.error(`🔴 ${m}`); try { record({ ok: false, problem: m }); } catch { /* the status file is what failed */ } tellChris(m); process.exit(1); });   // realpath: /tmp on a Mac is a link, and a mismatch here silently runs nothing
