#!/usr/bin/env node
// check-the-site-archive-is-add-only.mjs — approved admin_site_archive_v1 (11-01): a dated copy of what a client's site shows, add-only, honest about what it did not save.
// RUNS the real capture (_site-archive.js) on FAKE sites with a fake store, and the real handler (admin-site-archive.js) on a fake database. Nothing touches a real site or table.
//   · a 30-page sitemap → 25 saved + the sitemap, 5 COUNTED as over the limit (never silently skipped), every page a row, every path new
//   · a page that 404s, errors or comes back empty → a row with its reason, never counted as saved; a store failure → a failed row, not "saved"
//   · no sitemap → the home page's own links (same site only, no images/files); nothing → the home page alone
//   · a bad / private address → refused with NO request and no row; a second write to the same path fails (add-only), so a run never overwrites
//   · the handler: RGA's workspace only; "Not set up" when the tables are missing (no write attempted); a run already going is not started twice; the run is read back; recorded
//   · supabase/site_archive.sql: both tables, RLS on and NO policies, `if not exists`, a private bucket, no update/delete anywhere; the code only inserts
//   · the admin card says "Not set up" / "Not captured yet" / what was saved, says what is NOT automatic, and its buttons spin
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const { capture, pageList, PAGE_LIMIT } = req("./_site-archive.js");
const pub = [{ address: "93.184.216.34" }];
const mk = (pages, o = {}) => { const log = [], store = new Map(), runs = [], rows = [], fin = []; let putCalls = 0;
  return { log, store, runs, rows, fin, puts: () => putCalls, d: { now: () => Date.UTC(2026, 10, 1), lookup: async () => pub, sha256: (t) => crypto.createHash("sha256").update(t).digest("hex"),
    get: async (u) => { log.push(u); const p = new URL(u).pathname; if (o.throwOn && o.throwOn.test(p)) throw new Error("timeout"); const hit = pages[p]; return hit == null ? { status: 404, text: "", type: "text/html" } : { status: 200, text: hit, type: "text/html" }; },
    put: async (path, text) => { putCalls++; if (o.putFails) throw new Error("storage 500"); if (store.has(path)) throw new Error("exists"); store.set(path, text); },
    insertRun: async (row) => { runs.push(row); return "run-1"; }, insertPages: async (r) => { rows.push(...r); }, finishRun: async (id, patch) => { fin.push({ id, ...patch }); } } }; };
const urlset = (n) => `<?xml version="1.0"?><urlset><url><loc>https://x.com/</loc></url>${Array.from({ length: n - 1 }, (_, i) => `<url><loc>https://x.com/p${i}/</loc></url>`).join("")}<url><loc>https://x.com/logo.png</loc></url></urlset>`;
const client = { id: "44444444-4444-4444-4444-444444444444", website_url: "x.com" };
const body = "<html><body>" + "x".repeat(200) + "</body></html>";
const pages30 = { "/": body, "/sitemap.xml": urlset(30), ...Object.fromEntries(Array.from({ length: 29 }, (_, i) => [`/p${i}/`, body + i])) };

let s = mk(pages30); let r = await capture(client, "manual", "rga@x.test", s.d);
if (r.pages_found !== 30 || r.pages_saved !== PAGE_LIMIT || r.pages_over_limit !== 5 || r.pages_failed !== 0 || !r.sitemap_saved || r.page_source !== "sitemap") fail(`a 30-page sitemap: ${JSON.stringify(r)}`);
if (s.runs[0].pages_found !== 30 || s.runs[0].pages_over_limit !== 5 || s.runs[0].kind !== "manual") fail("the run row does not carry the found / over-limit counts");
if (s.rows.length !== PAGE_LIMIT + 1 || s.rows.filter((x) => x.state === "saved").length !== PAGE_LIMIT + 1) fail(`rows: ${s.rows.length}`);
if (s.rows.some((x) => /logo\.png/.test(x.url))) fail("an image address was archived as a page");
if (new Set(s.store.keys()).size !== s.store.size || s.puts() !== s.store.size) fail("a path was written twice");
if (s.rows.some((x) => x.state === "saved" && (!x.sha256 || !x.storage_path || !(x.bytes > 0)))) fail("a saved page lacks its fingerprint, path or size");
if (s.fin[0].pages_saved !== PAGE_LIMIT || !s.fin[0].finished_at) fail("the run is not finished with its counts");

s = mk({ "/": body, "/sitemap.xml": urlset(5), "/p0/": body, "/p1/": "", "/p2/": body }, { throwOn: /^\/p1\// }); r = await capture(client, "manual", null, s.d);
if (r.pages_failed !== 2 || r.pages_saved !== 3 || !s.rows.find((x) => /p1/.test(x.url) && x.state === "failed" && x.reason)) fail(`an unreadable page: ${JSON.stringify(r)}`);
if (!s.rows.find((x) => /p3/.test(x.url) && x.state === "failed" && /404/.test(x.reason))) fail("a 404 page is not a failed row with its status");
s = mk({ "/": body }, { putFails: true }); r = await capture(client, "manual", null, s.d);
if (r.pages_saved !== 0 || r.pages_failed < 1 || s.rows.some((x) => x.state === "saved")) fail("a store that failed was reported as saved");
s = mk({ "/": '<a href="/about/">a</a><a href="/img.jpg">i</a><a href="https://other.com/x">o</a><a href="/about/#top">a2</a><a href="/c/?x=1">c</a>', "/about/": body, "/c/": body }); r = await capture(client, "manual", null, s.d);
if (r.page_source !== "links" || r.pages_found !== 3) fail(`links fallback: ${JSON.stringify(r)}`);
s = mk({ "/": body }); r = await capture(client, "manual", null, s.d);
if (r.page_source !== "home only" || r.pages_found !== 1 || r.pages_saved !== 1) fail(`home only: ${JSON.stringify(r)}`);
for (const bad of ["", "localhost", "http://10.1.1.1/", "http://169.254.169.254/", "not a site"]) { s = mk({ "/": body }); const x = await capture({ ...client, website_url: bad }, "manual", null, s.d); if (!x.error || s.log.length || s.runs.length) fail(`"${bad}" was fetched or a run was opened`); }
{ const p = mk({ "/": body }); await p.d.put("a/b", "1"); let again = false; try { await p.d.put("a/b", "2"); } catch { again = true; } if (!again) fail("the fake store is not add-only (test setup)"); }

// ── the handler ──
process.env.SUPABASE_URL = "https://sb.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const ap = req.resolve("./_auth.js"); let authOk = true;
req.cache[ap] = { id: ap, filename: ap, loaded: true, exports: { requireWorkspaceForClient: async () => (authOk ? { email: "rga@example.com" } : { error: { statusCode: 403, body: "{}" } }) } };
const rp = req.resolve("./_record.js"); let recorded = [];
req.cache[rp] = { id: rp, filename: rp, loaded: true, exports: { recordSubmission: async (o) => { recorded.push(o.kind); return {}; } } };
delete req.cache[req.resolve("./admin-site-archive.js")];
const H = req("./admin-site-archive.js");
let tablesExist = true, runRows = [], writes = 0;
global.fetch = async (url, init = {}) => { url = String(url); const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.includes("/site_archive_runs")) { if (!tablesExist) return { ok: false, status: 404, text: async () => '{"code":"PGRST205","message":"Could not find the table \'public.site_archive_runs\' in the schema cache"}' }; if (init.method) writes++; return ok(runRows); }
  if (url.includes("/clients?id=")) return ok([{ id: client.id, website_url: "x.com" }]);
  return { ok: false, status: 500, text: async () => "boom" }; };
const call = async (b) => { const x = await H.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: client.id, ...b }) }); return { s: x.statusCode, b: JSON.parse(x.body || "{}") }; };
tablesExist = false; let x = await call({ action: "status" });
if (x.s !== 200 || x.b.setup !== false || x.b.ok !== true) fail(`missing tables are not "Not set up": ${JSON.stringify(x.b)}`);
s = mk(pages30); H.__useDeps(s.d); x = await call({ action: "capture" });
if (x.b.setup !== false || s.runs.length || s.store.size || writes) fail("a capture ran with no tables");
tablesExist = true; runRows = [];
s = mk(pages30); H.__useDeps(s.d); recorded = []; x = await call({ action: "capture" });
if (x.s !== 200 || x.b.result?.pages_saved !== PAGE_LIMIT || x.b.result?.pages_over_limit !== 5 || !recorded.includes("site_archive_captured")) fail(`a capture through the handler: ${x.s} ${JSON.stringify(x.b).slice(0, 160)}`);
authOk = false; s = mk(pages30); H.__useDeps(s.d); x = await call({ action: "capture" });
if (x.s !== 403 || s.runs.length) fail("a caller who is not RGA's workspace can capture"); authOk = true;
runRows = [{ id: "r0", started_at: new Date(Date.now() - 20000).toISOString(), finished_at: null }]; s = mk(pages30); H.__useDeps(s.d); x = await call({ action: "capture" });
if (x.s !== 409 || s.runs.length) fail("a second capture started while one was running"); runRows = [];
x = await call({ action: "burn" }); if (x.s !== 400) fail("an unknown action was accepted");

// ── the SQL, the code, the card ──
const sql = read("supabase/site_archive.sql"), code = read("netlify/functions/admin-site-archive.js") + read("netlify/functions/_site-archive.js"), A = read("admin/admin.js");
for (const t of ["site_archive_runs", "site_archive_pages"]) if (!new RegExp(`create table if not exists public\\.${t}`).test(sql) || !new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql)) fail(`the SQL does not create ${t} safely with row level security on`);
if (/create policy|\bgrant\b|\bdrop\b|\bdelete from\b|\bupdate public/i.test(sql.replace(/--.*$/gm, ""))) fail("the SQL has a policy, grant, drop, delete or update (it must be add-only, server-only)");
if (!/'site-archive', 'site-archive', false/.test(sql)) fail("the bucket is not private");
if (/site_archive_pages[^\n]*(PATCH|DELETE)|method: "DELETE"|\.remove\(/.test(code)) fail("the code updates or deletes archived pages");
if (!/"x-upsert": "false"/.test(code)) fail("a stored copy can overwrite another");
const a = A.indexOf("function siteArchiveAdminHtml"), b2 = A.indexOf("function blogCheckAdminHtml"); if (a < 0 || b2 < a) { console.error("⚠️  INDETERMINATE — the card moved"); process.exit(2); }
const card = A.slice(A.indexOf("// ═══ SITE ARCHIVE"), b2);
for (const w of ["Not set up", "supabase/site_archive.sql", "Not captured yet", "Capture now", "counted, not saved", "Add-only: nothing is overwritten", "Not automatic yet", "would not open"]) if (!card.includes(w)) fail(`the card lost "${w}"`);
if (!/small: "Not set up"/.test(card)) fail("the card no longer labels the missing-tables state as Not set up");
if (!/"m1\.access\.website" \? accessAdminHtml\(t\) \+ siteArchiveAdminHtml\(\)/.test(A)) fail("the card is not on admin step 8");
if (!/b\.classList\.add\("is-busy"\)/.test(card)) fail("the Capture button does not spin");
if (/[—–]/.test(card.replace(/\/\/.*$/gm, ""))) fail("a dash in the card's words");
if (F.length) { console.error(`🔴 the site archive regressed — ${F.length}:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ the site archive: 25 pages + the sitemap per capture, the rest counted, failures recorded with a reason, add-only, \"Not set up\" until the SQL is run, RGA only");
