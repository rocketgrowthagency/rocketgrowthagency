#!/usr/bin/env node
// check-client-data-backup-works.mjs — the client data backup really copies every table and file, leaves no key on the drive, removes
// nothing old after a failure, says when it fails, and really ran in the last day and a half.
//
// 🔒 WHY (rga_data_backup_plan_v1, approved Chris 10-31): Supabase listed 0 backups, so the clients' data lived in one place. The script
// runs for real here, against a small fake Supabase on this machine. Nothing touches the clients' database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const SCRIPT = `${ROOT}/scripts/backup-client-data.mjs`;
const REAL = process.env.DATA_BACKUP_REAL_STATUS || `${os.homedir()}/.claude/backup-data-status.json`;
// 🔒 Chris 11-1: backups run Monday to Friday. Friday's run is 72 hours old by Monday's, so the window widens over a weekend. On a Tuesday to Friday it stays tight.
const MAX_AGE_H = (() => { const d = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short" }); return ["Sat", "Sun", "Mon"].includes(d) ? 84 : 36; })();
const bad = [], fail = (m) => bad.push(m);
const T = fs.mkdtempSync(path.join(os.tmpdir(), "rga-data-backup-"));
const SECRET = "ya29.THIS-MUST-NEVER-REACH-THE-DRIVE", NESTED = "1//0THIS-EITHER";

// a fake Supabase: 450 clients (three pages), a keys table, a view-like table, two buckets, a nested folder
const clients = Array.from({ length: 450 }, (_, i) => ({ id: i + 1, name: `Client ${i + 1}`, data: { tasks: { a: 1 }, oauth: { refresh_token: "secret-nested", note: "keep me" }, stray: NESTED } }));
const keys = [{ id: 1, email: "owner@example.com", access_token: SECRET, refresh_token: "abc", access_token_expires_at: "2026-11-01", last_refreshed_at: "2026-11-02", metrics_refreshed_at: "2026-11-03", credentials: "Licensed and insured", clientSecret: "abc2", data: { tasks: { "m1.access.password_manager": { status: "done", password: "abc3" } } } }];
const TABLES = { clients, client_google_oauth: keys, empty_table: [] };
const FILES = { "client-photos": { "c1/a.jpg": Buffer.from("photo-a"), "c1/deep/b.jpg": Buffer.from("photo-bb") }, "admin-docs": { "x.pdf": Buffer.from("pdf") } };
const USERS = Array.from({ length: 205 }, (_, i) => ({ id: `u${i}`, email: `user${i}@example.com`, encrypted_password: "HASH-MUST-NOT-REACH-THE-DRIVE", recovery_token: "TOKEN-MUST-NOT-REACH", user_metadata: { name: `User ${i}` } }));
let breakLogins = false, oneBadFile = null;
let breakTable = null, slowRoot = 0, breakFile = false, shortBy = 0;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  let raw = ""; for await (const c of req) raw += c;
  if (req.headers.apikey !== "k") return send(401, {});
  if (req.method !== "GET" && req.method !== "HEAD" && !u.pathname.startsWith("/storage/v1/object/list/")) return send(500, { writes: "the backup wrote to the database" }, { "x-wrote": "1" });
  if (u.pathname === "/rest/v1/") { if (slowRoot) await new Promise((r) => setTimeout(r, slowRoot)); return send(200, { paths: { "/": {}, "/clients": {}, "/client_google_oauth": {}, "/empty_table": {}, "/rpc/x": {} }, definitions: { clients: { properties: { id: { description: "<pk/>" } } } } }); }
  const t = u.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (t) {
    if (t[1] === breakTable) return send(500, {});
    const rows = TABLES[t[1]] || [];
    if (req.method === "HEAD") return send(200, "", { "content-range": `0-0/${rows.length + shortBy}` });
    const off = Number(u.searchParams.get("offset") || 0), lim = Number(u.searchParams.get("limit") || 10);
    return send(200, rows.slice(off, off + lim));
  }
  if (u.pathname === "/auth/v1/admin/users") { if (breakLogins) return send(500, {}); const pg = Number(u.searchParams.get("page") || 1), per = Number(u.searchParams.get("per_page") || 50); return send(200, { users: USERS.slice((pg - 1) * per, pg * per) }); }
  if (u.pathname === "/storage/v1/bucket") return send(200, Object.keys(FILES).map((name) => ({ name })));
  const l = u.pathname.match(/^\/storage\/v1\/object\/list\/([\w-]+)$/);
  if (l) {
    const { prefix = "", offset = 0 } = JSON.parse(raw || "{}"); const seen = new Map();
    for (const [p, b] of Object.entries(FILES[l[1]] || {})) { if (prefix && !p.startsWith(`${prefix}/`)) continue; const rest = prefix ? p.slice(prefix.length + 1) : p; const [head, ...more] = rest.split("/"); seen.set(head, more.length ? { name: head, id: null } : { name: head, id: "f", metadata: { size: b.length }, updated_at: "2026-11-01T10:00:00Z" }); }
    return send(200, [...seen.values()].slice(offset, offset + 100));
  }
  const o = u.pathname.match(/^\/storage\/v1\/object\/([\w-]+)\/(.+)$/);
  if (o) { const b = FILES[o[1]]?.[decodeURIComponent(o[2])]; if (!b) return send(404, {}); if (breakFile) return send(200, Buffer.from("x")); if (oneBadFile === decodeURIComponent(o[2])) return send(500, {}); return send(200, b); }
  send(404, {});
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL0 = `http://127.0.0.1:${server.address().port}`;
const DIR = `${T}/drive/RGA-Data-Backups`; fs.mkdirSync(DIR, { recursive: true, mode: 0o755 }); fs.chmodSync(DIR, 0o755);   // a folder that starts open must end closed
const st = () => { try { return JSON.parse(fs.readFileSync(`${T}/st.json`, "utf8")); } catch { return null; } };
const run = (over = {}) => new Promise((res) => {
  const c = spawn("node", [SCRIPT], { env: { PATH: process.env.PATH, BACKUP_QUIET: "1", BACKUP_DATA_SUPA_URL: URL0, BACKUP_DATA_KEY: "k", BACKUP_DATA_DIR: DIR, BACKUP_DATA_STATUS: `${T}/st.json`, BACKUP_DATA_TODAY: "2026-11-02", BACKUP_DATA_PAUSE_MS: "0", ...over } });
  c.on("close", (code) => res(code));
});
try {
  const good = await run();
  if (good !== 0) fail(`a clean run exits ${good}, not 0`);
  if (st()?.ok !== true || st()?.rows !== 451 || st()?.files !== 3) fail(`a clean run records the wrong totals: ${JSON.stringify(st())}`);
  const db = `${DIR}/2026-11-02/db`;
  const read = (t) => { try { return JSON.parse(fs.readFileSync(`${db}/${t}.json`, "utf8")); } catch { return null; } };
  if (read("clients")?.length !== 450) fail("a table over one page isn't copied whole");
  if (new Set((read("clients") || []).map((r) => r.id)).size !== 450) fail("rows are copied twice or skipped");
  if (read("empty_table")?.length !== 0) fail("an empty table isn't recorded");
  if (read("clients")?.[0]?.data?.oauth?.note !== "keep me") fail("ordinary data beside a key was lost");
  const all = fs.readdirSync(db).map((f) => fs.readFileSync(`${db}/${f}`, "utf8")).join("") + fs.readFileSync(`${DIR}/2026-11-02/manifest.json`, "utf8");
  const k0 = read("client_google_oauth")?.[0] || {};
  if (all.includes(SECRET) || k0.refresh_token !== "[removed]") fail("a client's Google key reached the drive");
  if (k0.clientSecret !== "[removed]" || k0.data?.tasks?.["m1.access.password_manager"]?.password !== "[removed]") fail("a key in another spelling, or nested, reached the drive");
  // what only sounds like a key is client data, and stays
  if (k0.access_token_expires_at !== "2026-11-01" || k0.last_refreshed_at !== "2026-11-02" || k0.metrics_refreshed_at !== "2026-11-03") fail("a date that only sounds like a key was removed");
  if (k0.credentials !== "Licensed and insured") fail("a client's credentials (licensed, insured) were removed as if they were a key");
  if (k0.data?.tasks?.["m1.access.password_manager"]?.status !== "done") fail("a whole setup step was removed because of its name");
  if (all.includes("secret-nested")) fail("a key nested inside a record reached the drive");
  if (all.includes(NESTED)) fail("a value shaped like a key reached the drive");
  if (read("client_google_oauth")?.[0]?.email !== "owner@example.com") fail("the row around a removed key was lost");
  for (const [b, p, want] of [["client-photos", "c1/a.jpg", "photo-a"], ["client-photos", "c1/deep/b.jpg", "photo-bb"], ["admin-docs", "x.pdf", "pdf"]]) {
    const f = `${DIR}/files/${b}/${p}`;
    if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== want) fail(`a stored file isn't copied whole: ${b}/${p}`);
  }
  if ((fs.statSync(DIR).mode & 0o077) !== 0) fail("the backup folder is readable by other users on this Mac");
  // a file that changes keeps the old one
  FILES["admin-docs"]["x.pdf"] = Buffer.from("pdf-changed");
  await run({ BACKUP_DATA_TODAY: "2026-11-03" });
  if (fs.readFileSync(`${DIR}/files/admin-docs/x.pdf`, "utf8") !== "pdf") fail("a changed file overwrote the old copy");
  if (!fs.readdirSync(`${DIR}/files/admin-docs`).some((n) => n.startsWith("x.pdf.") && fs.readFileSync(`${DIR}/files/admin-docs/${n}`, "utf8") === "pdf-changed")) fail("a changed file's new version wasn't kept");
  // failures are loud, and nothing old goes
  fs.mkdirSync(`${DIR}/2020-01-02/db`, { recursive: true });
  breakTable = "clients";
  const f1 = await run({ BACKUP_DATA_TODAY: "2026-11-04" });
  if (f1 !== 1 || st()?.ok !== false) fail("a table that fails isn't reported");
  if (!fs.existsSync(`${DIR}/2020-01-02`)) fail("a failed run removed an old backup");
  breakTable = null;
  shortBy = 5;
  if (await run({ BACKUP_DATA_TODAY: "2026-11-04" }) !== 1) fail("a copy with fewer rows than the table isn't reported");
  shortBy = 0;
  breakFile = true; FILES["client-photos"]["c1/new.jpg"] = Buffer.from("new-photo");
  if (await run({ BACKUP_DATA_TODAY: "2026-11-04" }) !== 1) fail("a file that came back the wrong size isn't reported");
  breakFile = false;
  await run({ BACKUP_DATA_TODAY: "2026-11-04" });
  // 🔴 sign-ins are copied, every page, with no password hash or token
  { const u = JSON.parse(fs.readFileSync(`${DIR}/2026-11-04/db/auth_users.json`, "utf8"));
    const txt = JSON.stringify(u);
    if (u.length !== 205 || u[0].email !== "user0@example.com") fail("the sign-ins aren't copied whole");
    if (txt.includes("HASH-MUST-NOT") || txt.includes("TOKEN-MUST-NOT")) fail("a password hash or token reached the drive");
    if (st()?.logins !== 205) fail("the status doesn't record the sign-ins"); }
  breakLogins = true;
  if (await run({ BACKUP_DATA_TODAY: "2026-11-04" }) !== 1) fail("sign-ins that couldn't be copied aren't reported");
  breakLogins = false;
  // 🔴 one bad file doesn't stop its bucket
  FILES["client-photos"] = { "c1/aa-bad.jpg": Buffer.from("bad"), ...FILES["client-photos"], "c1/zz-after.jpg": Buffer.from("after-the-bad-one") };   // the bad one is listed first
  oneBadFile = "c1/aa-bad.jpg";
  const oneBad = await run({ BACKUP_DATA_TODAY: "2026-11-04" });
  if (oneBad !== 1 || st()?.ok !== false) fail("one file that couldn't be copied isn't reported");
  if (!fs.existsSync(`${DIR}/files/client-photos/c1/zz-after.jpg`)) fail("one bad file stopped every file after it in the bucket");
  oneBadFile = null; delete FILES["client-photos"]["c1/aa-bad.jpg"];
  await run({ BACKUP_DATA_TODAY: "2026-11-04" });
  // retention: the month's first GOOD night, whatever its date
  const mk = (n, problems) => { fs.mkdirSync(`${DIR}/${n}/db`, { recursive: true }); fs.writeFileSync(`${DIR}/${n}/manifest.json`, JSON.stringify({ problems })); };
  mk("2020-01-02", ["table clients: HTTP 500"]);   // a failed night: not the month's copy
  for (let i = 1; i < 40; i++) mk(new Date(Date.UTC(2020, 0, 2 + i)).toISOString().slice(0, 10), []);   // Jan 3 → Feb 10, no folder named -01 in January
  await run({ BACKUP_DATA_TODAY: "2026-11-05" });
  if (fs.existsSync(`${DIR}/2020-01-02`)) fail("a failed night was kept as the month's copy");
  if (!fs.existsSync(`${DIR}/2020-01-03`)) fail("a month with no run on the 1st lost its monthly copy");
  if (fs.existsSync(`${DIR}/2020-01-04`)) fail("a successful run kept a nightly copy past its 30");
  if (!fs.existsSync(`${DIR}/2020-02-01`)) fail("a monthly copy was removed");
  if (!fs.existsSync(`${DIR}/2026-11-05/manifest.json`)) fail("the night's own copy is missing");
  const noDrive = await run({ BACKUP_DATA_DIR: `${T}/not-plugged-in/RGA-Data-Backups` });
  if (noDrive === 0 || st()?.ok !== false) fail("LaCie missing isn't reported");
  // a crash (the network gone) is a recorded failure, not yesterday's ok
  await run({ BACKUP_DATA_TODAY: "2026-11-06" });
  if (st()?.ok !== true) fail("a clean run before the crash test didn't record ok");
  const dead = await run({ BACKUP_DATA_SUPA_URL: "http://127.0.0.1:9" });
  if (dead === 0 || st()?.ok !== false) fail("a crash leaves the last good status in place");
  slowRoot = 400;
  const slow = await run({ BACKUP_DATA_SLOW_MS: "100" });
  if (slow !== 2 || st()?.ok !== false) fail("a slow database doesn't stop the copy from starting");
  slowRoot = 0;
  // the pure rules
  const m = await import(pathToFileURL(SCRIPT).href);
  const days = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10));
  const keep = m.keepFolders([...days, "files"]);
  if (keep.size !== 30 + [...days].slice(0, -30).filter((d) => d.endsWith("-01")).length) fail(`retention keeps ${keep.size} folders`);
  if (!keep.has(days.at(-1)) || !keep.has("2026-09-01") || keep.has("2026-09-02") || keep.has("files")) fail("retention keeps the wrong folders");
} catch (e) {
  fail(`the test itself broke: ${e.message}`);
} finally {
  server.close();
  fs.rmSync(T, { recursive: true, force: true });
}
// it really ran, on this machine, recently
try {
  const s = JSON.parse(fs.readFileSync(REAL, "utf8"));
  const h = (Date.now() - Date.parse(s.at)) / 3600e3;
  if (!(h <= MAX_AGE_H)) fail(`the last real client data backup was ${Math.round(h)} hours ago`);
  if (s.ok !== true) fail(`the last real client data backup failed: ${s.problem}`);
} catch { fail(`no record of a real client data backup at ${REAL}`); }
if (bad.length) { console.log("🔴 the client data backup isn't doing its job:"); for (const b of bad) console.log(`   · ${b}`); process.exit(1); }
console.log("✅ the client data backup copies every table and file whole, leaves no key on the drive, keeps old copies, fails loudly, and ran in the last 36 hours");
process.exit(0);
