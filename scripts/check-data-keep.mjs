#!/usr/bin/env node
// check-data-keep.mjs — WHAT WE KEEP, AND THAT IT CAN'T QUIETLY STOP (approved data_keep_v1 + data_store_v1, Chris 10-31).
// HOLDS, on fakes (nothing real is called, nothing is written anywhere):
//  (1) raw store: a saved file is gzipped, named source/client/date, never overwrites, carries no secret (by key name, by value shape, and the
//      process's own env values), any client id (empty, unicode, "../") stays inside its folder, a failed save returns ok:false and never throws,
//      the first save makes a PRIVATE bucket, Backblaze signing matches AWS's published example, and nothing in the file can delete or edit.
//  (2) rank grid: every pin's full result goes to the raw store before the numbers are worked out; the scan's size, guard and schedule are unchanged.
//  (3) Search Console rows: no progress table = nothing pulled; a first run backfills and the marker moves chunk by chunk; a finished client
//      is never pulled again; a zero-traffic client isn't repeated; 429 stops it; the request, page and time caps hold; raw before rows;
//      a failed raw copy is reported and doesn't stop the rows; rows that weren't kept don't move the marker.
//  (4) dated benchmarks: both writers add a dated, ignore-duplicates row beside the overwrite and add no search.
//  (5) change log: why/expected are written to their columns, fall back into notes when the columns aren't there, and change nothing when unused.
//  (6) frozen reports: the report as sent is saved after the send, a failure never undoes the send, and the manifest flags an unsaved copy.
//  (7) Business Profile purge: OFF unless GBP_PURGE_ENABLED is exactly "1"; off = zero DELETEs and counts per table; on = the ledger line first,
//      no ledger = no delete, bounded; only the listed API tables; monthly totals and RGA's own sources are not on the list.
//  (8) admin row: every line is a reading; not-set-up and unreadable never read as OK; the card has no figures typed in; the purge is only asked
//      what it would delete; the card sits under System health and the ?v= is bumped.
//  (9) the SQL file adds every table/column, closes them to the public, makes the bucket private, and drops nothing; both jobs are on the list.
// Exit 0 = holds · 1 = broken · 2 = moved (indeterminate). → memory project_everything_queued A3
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { return null; } };
const F = [];
const ok = (cond, msg) => { if (!cond) F.push(msg); };
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };

// A fake environment: fake secrets only. These are not real values.
const FAKE = { SUPABASE_URL: "https://fake.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-0123456789", SERPAPI_KEY: "fake-serpapi-key-abcdefghij" };
for (const k of ["B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET", "B2_ENDPOINT", "GBP_PURGE_ENABLED"]) delete process.env[k];
Object.assign(process.env, FAKE);

const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (f) => { try { return req(`./${f}`); } catch (e) { idk(`${f} won't load: ${e.message}`); } };
const SRC = {};
for (const f of ["_raw-store.js", "v2-rank-grid-background.js", "_gsc-daily.js", "gsc-daily-rows.js", "vertical-benchmark-build.js", "_change-ledger.js", "send-monthly-report.js",
  "_gbp-purge.js", "gbp-30-day-purge.js", "admin-data-keep.js", "_job-manifest.js"]) {
  SRC[f] = read(`netlify/functions/${f}`); if (SRC[f] == null) idk(`${f} moved`);
}
const adminJs = read("admin/admin.js"), adminHtml = read("admin/index.html"), sql = read("supabase/data_keep.sql"), toml = read("netlify.toml");
if (adminJs == null || adminHtml == null || sql == null || toml == null) idk("admin, the SQL file or netlify.toml moved");
const scraperBench = (() => { try { return fs.readFileSync(path.join(process.env.SCRAPER_COPY_DIR || path.dirname(HERE), "scripts/build-vertical-benchmark.mjs"), "utf8"); } catch { return null; } })();

// ── (1) the raw store ───────────────────────────────────────────────────────────────────────────────────────────────
const raw = load("_raw-store.js");
const mkFetch = (script = {}) => { const calls = []; const fn = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body });
  const r = (script.reply && script.reply(String(url), init, calls.length)) || { ok: true, status: 200, text: "" };
  return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), text: async () => r.text ?? "", json: async () => JSON.parse(r.text || "{}"), headers: { get: () => null } };
}; fn.calls = calls; return fn; };
{
  const ff = mkFetch();
  const payload = { keyword: "plumber", pins: [{ row: 0, results: [{ name: "A" }] }], api_key: "abc12345secret", headers: { Authorization: "Bearer zzzzzzzz1234" },
    url: "https://serpapi.com/search?q=x&api_key=URLSECRET99999&z=1", refresh_token: "1//0gABCDEFGHIJKLMNOPQRSTUVWX", note: `uses ${FAKE.SERPAPI_KEY} inside text` };
  const s = await raw.saveRaw({ source: "rank-grid", clientId: "11111111-2222-3333-4444-555555555555", payload, fetchFn: ff, now: new Date("2026-11-01T10:20:30Z") });
  ok(s.ok === true, "(1) a plain save didn't succeed on a working fake");
  const put = ff.calls[0];
  ok(put && put.method === "POST" && /\/storage\/v1\/object\/raw-store\/rank-grid\/11111111-2222-3333-4444-555555555555\/2026-11-01\/\d{6}-[0-9a-f]{8}\.json\.gz$/.test(put.url), `(1) the file isn't named source/client/date (${put && put.url})`);
  ok(put && String(put.headers["x-upsert"]) === "false", "(1) the upload may overwrite (x-upsert is not false): a saved file must never be edited");
  let text = ""; try { text = zlib.gunzipSync(Buffer.from(put.body)).toString("utf8"); } catch { F.push("(1) the saved bytes aren't gzip"); }
  const back = text ? JSON.parse(text) : null;
  ok(back && back.data && back.data.keyword === "plumber" && back.data.pins[0].results[0].name === "A", "(1) the saved file doesn't hold what was given");
  for (const secret of ["abc12345secret", "zzzzzzzz1234", "URLSECRET99999", "1//0gABCDEFGHIJKLMNOPQRSTUVWX", FAKE.SERPAPI_KEY, FAKE.SUPABASE_SERVICE_ROLE_KEY])
    ok(!text.includes(secret), `(1) a secret survived in the saved file: ${secret.slice(0, 6)}…`);
  ok(s.removed_secrets >= 5, "(1) the save doesn't report how many secrets it removed");
  const input = JSON.stringify(payload); raw.stripSecrets(payload); ok(JSON.stringify(payload) === input, "(1) stripping changed the caller's own object");
  // any client id, no way out of the folder
  for (const id of ["", null, undefined, "../../etc/passwd", "客户 一", "a/b\\c", "x".repeat(300), "Ünï Cödé", "  "]) {
    const p = raw.pathFor({ source: "rank-grid", clientId: id });
    ok(/^rank-grid\/[a-z0-9_-]{1,64}\/\d{4}-\d{2}-\d{2}\/\d{6}-[0-9a-f]{8}\.json\.gz$/.test(p) && !p.includes(".."), `(1) client id ${JSON.stringify(id)} makes a path that can leave its folder or break: ${p}`);
  }
  ok(raw.pathFor({ source: "../../x y!" }).startsWith("x-y/_global/"), "(1) an odd source name isn't made safe");
  // two saves in one second are two files
  ok(raw.pathFor({ source: "a", clientId: "c" }) !== raw.pathFor({ source: "a", clientId: "c" }), "(1) two saves can get the same name (the second would overwrite the first)");
  // failure: returned and never thrown
  for (const [name, fetchFn] of [["a 500", mkFetch({ reply: () => ({ ok: false, status: 500, text: "boom" }) })], ["a thrown error", async () => { throw new Error("network down"); }]]) {
    let r; try { r = await raw.saveRaw({ source: "s", clientId: "c", payload: { a: 1 }, fetchFn }); } catch (e) { F.push(`(1) saveRaw THREW on ${name}: it must never break the job`); continue; }
    ok(r.ok === false && typeof r.error === "string" && r.error.length > 0, `(1) a failed save (${name}) isn't returned as ok:false with a reason`);
  }
  { const r = await raw.saveRaw({ source: "s", payload: { a: 1 }, fetchFn: mkFetch(), env: {} }); ok(r.ok === false && /no storage/i.test(r.error || ""), "(1) with no storage settings the save doesn't say so"); }
  { const r = await raw.saveRaw({ source: "s", clientId: "c", payload: { [FAKE.SERPAPI_KEY]: 1 }, fetchFn: mkFetch() }); ok(r.ok === false, "(1) a secret used as a field NAME was saved: the last-line check is gone"); }
  { const r = await raw.saveRaw({ source: "", payload: { a: 1 }, fetchFn: mkFetch() }); ok(r.ok === false, "(1) a save with no source name succeeded"); }
  // first save ever: private bucket
  { let first = true; const ff2 = mkFetch({ reply: (u) => { if (/object\/raw-store/.test(u) && first) { first = false; return { ok: false, status: 404, text: '{"statusCode":"404","error":"Bucket not found"}' }; } return { ok: true }; } });
    const r = await raw.saveRaw({ source: "s", clientId: "c", payload: { a: 1 }, fetchFn: ff2 });
    const mk = ff2.calls.find((c) => /\/storage\/v1\/bucket$/.test(c.url));
    ok(r.ok && mk && JSON.parse(mk.body).public === false, "(1) the first save doesn't create a PRIVATE bucket and retry"); }
  // backend choice + signing
  ok(raw.backendName({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" }) === "supabase-storage", "(1) no Backblaze settings should use Supabase storage");
  ok(raw.backendName({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", B2_KEY_ID: "a", B2_APP_KEY: "b", B2_BUCKET: "c", B2_ENDPOINT: "s3.us-west-004.backblazeb2.com" }) === "backblaze", "(1) all four B2 settings should choose Backblaze");
  ok(raw.backendName({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", B2_KEY_ID: "a", B2_APP_KEY: "b", B2_BUCKET: "c" }) === "supabase-storage", "(1) a half-set Backblaze config should not be used");
  const sig = raw.sigV4({ method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", headers: { range: "bytes=0-9" }, payloadHash: raw.sha256hex(""), accessKey: "AKIAIOSFODNN7EXAMPLE",
    secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", amzDate: "20130524T000000Z" });
  ok(sig.signature === "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", "(1) the Backblaze request signing doesn't match AWS's published example");
  { const ff3 = mkFetch(); const env = { SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", B2_KEY_ID: "kid", B2_APP_KEY: "app-key-1234567890", B2_BUCKET: "bkt", B2_ENDPOINT: "https://s3.us-west-004.backblazeb2.com" };
    const r = await raw.saveRaw({ source: "s", clientId: "c", payload: { a: 1 }, fetchFn: ff3, env });
    const c = ff3.calls[0];
    ok(r.ok && c.method === "PUT" && /^https:\/\/s3\.us-west-004\.backblazeb2\.com\/bkt\/s\/c\//.test(c.url) && /^AWS4-HMAC-SHA256 Credential=kid\//.test(c.headers.Authorization || ""), "(1) a Backblaze save isn't a signed PUT to the bucket");
    ok(!JSON.stringify(c.headers).includes("app-key-1234567890"), "(1) the Backblaze secret key is sent in a header"); }
  // nothing in the file can edit or delete
  ok(!/method:\s*["'](DELETE|PATCH|PUT)["']/.test(SRC["_raw-store.js"].replace(/putB2[\s\S]*?\n}\n/, "")), "(1) the raw store has a way to delete or edit (only the Backblaze PUT of a new, uniquely named file is allowed)");
  ok(!/x-upsert["']:\s*["']true/.test(SRC["_raw-store.js"]), "(1) the raw store can upload with overwrite on");
  // the summary never loops
  { let n = 0; const ff4 = async (u) => { n++; return { ok: true, status: 200, text: async () => JSON.stringify(Array.from({ length: 30 }, (_, k) => ({ name: `f${k}`, id: null }))) }; };
    const sm = await raw.summary({ fetchFn: ff4 }); ok(n <= 251 && typeof sm.partial === "boolean", `(1) the file count made ${n} list calls: it must stop at its cap`); }
}

// ── (2) rank grid ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  const g = SRC["v2-rank-grid-background.js"];
  ok(/require\("\.\/_raw-store"\)/.test(g) && /saveRaw\(\{ source: "rank-grid"/.test(g), "(2) the rank scan doesn't save its raw result to the raw store");
  ok(/pinResults\.push\(\{ row, col, lat, lng, results: results\?\.raw \?\? places \}\)/.test(g), "(2) the scan doesn't keep what each pin returned");
  ok(g.indexOf('saveRaw({ source: "rank-grid"') > 0 && g.indexOf('saveRaw({ source: "rank-grid"') < g.indexOf("// 4. Stats"), "(2) the raw result is saved AFTER the numbers are worked out");
  ok(/raw_saved: rawSaves/.test(g), "(2) a failed raw save isn't written into the scan's record (it would be swallowed)");
  ok(/return \{ raw: rows, places: rows\.map/.test(g), "(2) SerpAPI's full answer is dropped before it can be kept");
  ok(/const MAX_PLACES_CALLS = Number\(process\.env\.RANK_MAX_PLACES_CALLS \|\| \(GRID \* GRID \+ 5\)\)/.test(g) && /const GRID = Math\.max\(3, Number\(process\.env\.RANK_GRID_SIZE \|\| 5\) \| 1\)/.test(g), "(2) the scan's size or runaway guard changed: lifting the grid park is a separate item");
  ok(/\[functions\."rankings-refresh"\]\s*\n\s*schedule = "0 7 1 \* \*"/.test(toml), "(2) the rank scan's schedule changed");
}

// ── (3) Search Console rows ─────────────────────────────────────────────────────────────────────────────────────────
{
  const G = load("_gsc-daily.js");
  const world = (o = {}) => { const w = { state: o.noTable ? null : [], rows: [], log: [], fetches: 0, oauths: o.oauths || [{ client_id: "c1", gsc_site_url: "sc-domain:x.com", refresh_token: "r" }] };
    w.supa = async (p, init = {}) => { w.log.push(`${init.method || "GET"} ${p.split("?")[0]}`);
      if (p.startsWith("/gsc_pull_state?select")) { if (w.state === null) throw new Error("Supabase 404: PGRST205 gsc_pull_state"); return w.state; }
      if (p.startsWith("/client_google_oauth")) return w.oauths;
      if (p.startsWith("/client_gsc_daily")) { if (o.failRows) throw new Error("Supabase 500: no"); w.rows.push(...JSON.parse(init.body)); return null; }
      if (p.startsWith("/gsc_pull_state?on_conflict")) { const b = JSON.parse(init.body); w.state = w.state.filter((s) => s.client_id !== b.client_id); w.state.push(b); return null; } };
    w.fetchFn = async (u, i) => { w.fetches++; w.log.push("GSC"); if (o.status) return { ok: false, status: o.status, text: async () => "x", json: async () => ({}) };
      const b = JSON.parse(i.body); const n = o.full ? 25000 : o.empty ? 0 : 1;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ rows: Array.from({ length: n }, (_, k) => ({ keys: [b.startDate, `https://x.com/p${k % 50}`, `q${k}`], clicks: 1, impressions: 5, ctr: 0.2, position: 3 })) }) }; };
    w.run = (extra = {}, now = "2026-10-31T12:00:00Z") => G.run({ supa: w.supa, fetchFn: w.fetchFn, token: async () => "t", saveRaw: async (x) => { w.log.push("RAW"); return o.rawFails ? { ok: false, error: "disk" } : { ok: true }; }, now: new Date(now), ...extra });
    return w; };
  { const w = world({ noTable: true }); const r = await w.run(); ok(r.table_ready === false && w.fetches === 0 && !w.log.some((l) => l.startsWith("POST")), "(3) with no progress table it still pulled or wrote: a pull it can't record would repeat forever"); }
  { const w = world(); const r1 = await w.run(); ok(r1.rows > 0 && w.state[0] && w.state[0].pulled_through, "(3) a first run kept no rows or no marker");
    ok(w.state[0].pulled_through <= "2026-10-29", "(3) the marker moved past the newest final day");
    const first = w.log.findIndex((l) => l === "GSC"), raw1 = w.log.findIndex((l) => l === "RAW"), post = w.log.findIndex((l) => l === "POST /client_gsc_daily");
    ok(raw1 > first && post > raw1, "(3) the raw copy isn't saved before the rows are kept");
    let guard = 0; while (!w.state[0].backfill_done && guard++ < 6) await w.run({}, "2026-10-31T12:00:00Z");
    ok(w.state[0].backfill_done === true && guard < 6, "(3) the backfill never finishes");
    const before = w.fetches; await w.run({}, "2026-10-31T18:00:00Z"); ok(w.fetches === before, "(3) a caught-up client was pulled again the same day");
    const f2 = w.fetches; await w.run({}, "2026-11-02T12:00:00Z"); ok(w.fetches === f2, "(3) a caught-up client was pulled again two days later (it is kept up to date about weekly)");
    await w.run({}, "2026-11-10T12:00:00Z"); ok(w.fetches > before, "(3) a caught-up client stops being kept up to date (nothing pulled a week later)"); }
  { const w = world({ empty: true }); await w.run(); let g = 0; while (!w.state[0].backfill_done && g++ < 6) await w.run(); const f = w.fetches; await w.run({}, "2026-10-31T20:00:00Z"); ok(w.state[0].backfill_done && w.fetches === f, "(3) a site with no traffic is backfilled again and again"); }
  { const w = world({ status: 429 }); const r = await w.run(); ok(w.fetches === 1 && r.errors.length >= 1 && w.state[0].last_status === "quota", `(3) a 429 didn't stop the client and say so (${w.fetches} requests)`); }
  { const many = Array.from({ length: 60 }, (_, i) => ({ client_id: `c${i}`, gsc_site_url: `sc-domain:s${i}.com`, refresh_token: "r" })); const w = world({ oauths: many }); const r = await w.run(); ok(w.fetches <= 40 && r.pending > 0, `(3) 60 clients made ${w.fetches} requests (the cap is 40 a run) or left none pending`); }
  { const w = world({ full: true }); const r = await w.run(); ok(w.fetches <= 40, "(3) endless full pages looped past the request cap"); ok(G.MAX_PAGES_PER_CHUNK <= 10, "(3) one window may page without a sensible cap"); ok(w.state[0].truncated_chunks > 0, "(3) a window that hit the page cap isn't marked truncated"); }
  ok(G.TIME_BUDGET_MS <= 25000, "(3) the time budget is longer than a scheduled function can run (Netlify stops it at 30 seconds)");
  { const w = world(); await w.run({ timeBudgetMs: -1 }); ok(w.fetches === 0, "(3) the time budget doesn't stop the work"); }
  { const w = world({ rawFails: true }); const r = await w.run(); ok(r.rows > 0 && r.errors.some((e) => /raw copy not saved/.test(e)), "(3) a failed raw copy either stopped the rows or went unreported"); }
  { const w = world({ failRows: true }); const r = await w.run(); ok(!(w.state[0] && w.state[0].pulled_through), "(3) the marker moved past rows that weren't kept"); }
  { const rows = G.shapeRows("c", "s", [{ keys: ["2026-01-01", "https://a/", "plumber"], clicks: 1.6, impressions: 3, ctr: 0.33333333, position: 2.456 }, { keys: ["2026-01-01"] }, {}]); ok(rows.rows.length === 1 && rows.dropped === 2 && rows.rows[0].row_key.length === 40, "(3) rows are not shaped safely (a row missing a page or search must be dropped and counted)"); }
  ok(/handler = require\("\.\/_job-checkin"\)\.withCheckin\("gsc-daily-rows"/.test(SRC["gsc-daily-rows.js"]) && /const gate = requireCronOrInternal\(event\);\s*\n\s*if \(gate\.error\) return gate\.error;/.test(SRC["gsc-daily-rows.js"]), "(3) the Search Console job isn't wrapped for System health or isn't guarded");
  ok(!/googleapis\.com[^"'`]*(patch|post|put|delete)/i.test(SRC["_gsc-daily.js"].replace(/searchAnalytics\/query/g, "")) , "(3) the Search Console code does more than read");
}

// ── (4) dated benchmarks ────────────────────────────────────────────────────────────────────────────────────────────
{
  const w = SRC["vertical-benchmark-build.js"];
  ok(/vertical_benchmark_history\?on_conflict=search_term,scanned_on/.test(w) && /ignore-duplicates/.test(w) && /saveRaw\(\{ source: "market-benchmark"/.test(w), "(4) the website benchmark run doesn't keep a dated copy and its raw answer");
  ok(/vertical_benchmarks\?on_conflict=search_term/.test(w), "(4) the live benchmark upsert was removed (the lookup still reads it)");
  ok((w.match(/serpapi\.com\/search/g) || []).length === 1, "(4) the benchmark run makes more than one search: this build adds no spend");
  if (scraperBench == null) idk("the scraper benchmark builder moved");
  ok(/vertical_benchmark_history\?on_conflict=search_term,scanned_on/.test(scraperBench) && /ignore-duplicates/.test(scraperBench), "(4) the scraper's benchmark builder doesn't keep a dated copy");
  ok(/Not set up/.test(scraperBench) && /dated copy NOT kept/.test(scraperBench), "(4) the scraper's dated copy fails silently or doesn't say Not set up");
}

// ── (5) change log ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  const L = load("_change-ledger.js");
  const bodies = []; const realFetch = globalThis.fetch;
  const base = { clientId: "11111111-2222-3333-4444-555555555555", surface: "website", field: "title", before: "a", after: "b", changedBy: "rga", source: "test:data-keep" };
  const run = async (extra, reply) => { bodies.length = 0; globalThis.fetch = async (u, i) => { const b = JSON.parse(i.body); bodies.push(b); const r = reply(b, bodies.length); return { ok: r.ok, status: r.ok ? 201 : 400, text: async () => r.text }; };
    try { await L.recordChange({ ...base, ...extra }); return true; } catch (e) { return e; } finally { globalThis.fetch = realFetch; } };
  await run({}, () => ({ ok: true, text: '[{"id":"x"}]' }));
  ok(bodies.length === 1 && !("why_chosen" in bodies[0]) && !("expected_result" in bodies[0]), "(5) a change with no reason sends the new columns (it would fail before the SQL runs)");
  await run({ whyChosen: "Competitors use the city in the title", expectedResult: "More impressions in 45 days" }, () => ({ ok: true, text: '[{"id":"x"}]' }));
  ok(bodies[0] && bodies[0].why_chosen === "Competitors use the city in the title" && bodies[0].expected_result === "More impressions in 45 days", "(5) why and expected aren't written to their columns");
  const e = await run({ whyChosen: "W", expectedResult: "E" }, (b, n) => (n === 1 ? { ok: false, text: '{"code":"PGRST204","message":"Could not find the \'why_chosen\' column"}' } : { ok: true, text: '[{"id":"x"}]' }));
  ok(e === true && bodies.length === 2 && !("why_chosen" in bodies[1]) && /Why chosen: W/.test(bodies[1].notes || "") && /Expected: E/.test(bodies[1].notes || ""), "(5) before the SQL runs, the reason isn't kept in notes");
  const e2 = await run({ whyChosen: "W" }, (b, n) => (n === 1 ? { ok: false, text: '{"code":"23502","message":"null value in column"}' } : { ok: true, text: '[{"id":"x"}]' }));
  ok(e2 instanceof Error, "(5) an unrelated database error was swallowed");
  ok(/ALTER|alter table public\.client_change_log add column if not exists why_chosen/.test(sql), "(5) the SQL file doesn't add the columns");
}

// ── (6) frozen reports ──────────────────────────────────────────────────────────────────────────────────────────────
{
  const m = SRC["send-monthly-report.js"];
  const sendAt = m.indexOf("const outcome = await sendGmail"), rawAt = m.indexOf('source: "monthly-report"');
  ok(rawAt > sendAt && sendAt > 0, "(6) the report isn't saved as sent AFTER it is sent");
  ok(/gmail_message_id: outcome\.id, subject: built\.subject, html: built\.html, text: built\.text \} \}\);\s*\n\s*artifact\.frozen/.test(m), "(6) what's frozen isn't the subject, html and text that went out");
  ok(/try \{\s*\n\s*const frozen = await require\("\.\/_raw-store"\)\.saveRaw/.test(m) && /artifact\.frozen = frozen\.ok/.test(m) && /catch \(e\) \{ artifact\.frozen = \{ ok: false/.test(m), "(6) a failed freeze can break the send or goes unrecorded");
  ok(/x\.frozen && x\.frozen\.ok === false/.test(SRC["_job-manifest.js"]), "(6) System health doesn't flag a report sent without its copy");
}

// ── (7) the Business Profile purge ──────────────────────────────────────────────────────────────────────────────────
{
  const P = load("_gbp-purge.js");
  const world = (o = {}) => { const w = { calls: [], rows: o.rows ?? 450, ledgerThere: o.ledger !== false };
    w.supa = async (p, init = {}) => { const method = init.method || "GET"; w.calls.push(`${method} ${p.split("?")[0]}`); if (w.calls.length > 600) throw new Error("runaway: the purge never stopped");
      if (p.startsWith("/gbp_purge_ledger")) { if (!w.ledgerThere) throw new Error("Supabase 404: PGRST205"); if (o.ledgerWriteFails && method === "POST") throw new Error("Supabase 500"); return method === "GET" ? [] : null; }
      if (method === "DELETE") { w.deleted = (w.deleted || 0) + p.split("in.(")[1].split(",").length; return null; }
      return Array.from({ length: Math.min(200, o.endless ? 200 : Math.max(0, w.rows - (w.deleted || 0))) }, (_, i) => ({ id: `id${(w.deleted || 0) + i}`, captured_at: "2026-08-01T00:00:00Z", snapshot_date: "2026-08-01" })); };
    w.countFn = async () => w.rows; return w; };
  const now = new Date("2026-10-31T12:00:00Z");
  ok(P.enabledIn({ GBP_PURGE_ENABLED: "1" }) === true && [undefined, "", "0", "true", "yes", " 1", "11"].every((v) => P.enabledIn({ GBP_PURGE_ENABLED: v }) === false), "(7) the purge switches on for something other than exactly 1");
  { const w = world(); const r = await P.run({ supa: w.supa, countFn: w.countFn, now, enabled: false });
    ok(!w.calls.some((c) => c.startsWith("DELETE") || c.startsWith("POST")), "(7) switched OFF, the purge still wrote or deleted");
    ok(r.enabled === false && r.deleted_total === 0 && r.tables.length === P.TARGETS.length && r.tables.every((t) => t.would_delete === 450) && r.would_delete_total === 450 * P.TARGETS.length, "(7) switched off it doesn't report counts per table"); }
  { const w = world({ ledger: false }); const r = await P.run({ supa: w.supa, countFn: w.countFn, now, enabled: true });
    ok(!w.calls.some((c) => c.startsWith("DELETE")) && r.failed > 0 && r.table_ready === false, "(7) with no deletion ledger it still deleted, or didn't say it couldn't"); }
  { const w = world({ ledgerWriteFails: true }); await P.run({ supa: w.supa, countFn: w.countFn, now, enabled: true }); ok(!w.calls.some((c) => c.startsWith("DELETE")), "(7) a batch was deleted although its ledger line couldn't be written"); }
  { const w = world(); const r = await P.run({ supa: w.supa, countFn: w.countFn, now, enabled: true });
    const seq = w.calls.filter((c) => /^(POST \/gbp_purge_ledger|DELETE)/.test(c));
    ok(seq.length > 0 && seq.every((c, i) => (i % 2 === 0 ? c.startsWith("POST") : c.startsWith("DELETE"))), `(7) a delete didn't come right after its own ledger line (${seq.slice(0, 4).join(" | ")})`);
    ok(r.deleted_total > 0, "(7) switched on, nothing was deleted on a fake that had rows"); }
  { const w = world({ endless: true }); await P.run({ supa: w.supa, countFn: w.countFn, now, enabled: true }); ok(w.calls.filter((c) => c.startsWith("DELETE")).length <= P.TARGETS.length * 15 && P.MAX_BATCHES <= 20, "(7) a table that always has rows looped past the batch cap"); }
  { const cut = P.cutoffFor(now); ok(Math.round((now - new Date(cut)) / 86400000) === 30, "(7) the cutoff isn't 30 calendar days"); }
  const pur = SRC["_gbp-purge.js"];
  ok((pur.match(/method: "DELETE"/g) || []).length === 1 && /if \(out\.enabled && row\.would_delete > 0\)[\s\S]*method: "DELETE"/.test(pur), "(7) a DELETE exists outside the switched-on branch");
  ok(!/client_monthly_records|client_photos|client_keyword_rankings|brain_rank_snapshots|clients\b/.test(P.TARGETS.map((t) => t.table).join(",")), "(7) the purge list includes monthly totals or RGA's own sources");
  ok(/google_profile/.test((P.TARGETS.find((t) => t.id === "reviews") || {}).filter || "") && /deep-assess-client/.test((P.TARGETS.find((t) => t.id === "profile") || {}).filter || ""), "(7) the reviews or profile rows are no longer picked out by where they came from");
  ok(P.TARGETS.every((t) => t.filter || t.table === "client_gbp_snapshots"), "(7) a shared table is listed without a filter that selects only Business Profile rows");
  const fn = SRC["gbp-30-day-purge.js"];
  ok(/enabled: enabledIn\(\)/.test(fn) && /requireCronOrInternal/.test(fn) && /withCheckin\("gbp-30-day-purge"/.test(fn), "(7) the purge job isn't guarded, wrapped, or reads its switch from the environment");
  ok(!/^[^#\n]*GBP_PURGE_ENABLED/m.test(toml), "(7) netlify.toml switches the purge on");
}

// ── (8) the admin row ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const A = load("admin-data-keep.js");
  const goodRaw = { ready: true, backend: "supabase-storage", sources: [{ source: "rank-grid", files: 3 }, { source: "monthly-report", files: 2 }], files: 5, bytes: 4096, partial: false };
  const mk = (over = {}) => ({ gridSessions: async () => 7, gscStates: async () => [{ backfill_done: true, rows_total: 10, last_status: "ok" }], gscConnected: async () => 1,
    benchHistory: async () => ({ n: 4, terms: 2 }), whyCounts: async () => ({ n: 1, total: 9 }), latest: async () => ({ table_ready: true, rows: [{ job: "client-data-backup", ok: true, finished_at: new Date().toISOString(), note: "39 tables" }] }),
    purgeReport: async () => ({ enabled: false, tables: [{ short: "reviews", would_delete: 0 }], would_delete_total: 0, failed: 0, ledger_ready: true }), ...over });
  const missing = () => { throw new Error("Supabase 404: PGRST205"); };
  { const d = await A.build({ rawSummary: goodRaw, readers: mk() }); ok(d.rows.length >= 9 && d.rows.every((r) => r.key && r.label && r.tag && r.line && ["ok", "you", "unk"].includes(r.tone)), "(8) a row is missing its words or tone"); }
  { const d = await A.build({ rawSummary: goodRaw, readers: mk({ gscStates: async () => missing(), benchHistory: async () => missing(), whyCounts: async () => missing() }) });
    for (const k of ["gsc", "bench", "why"]) { const r = d.rows.find((x) => x.key === k); ok(r && r.tone === "you" && r.tag === "Not set up" && /data_keep\.sql/.test(r.line), `(8) the ${k} line doesn't say Not set up when its table is missing`); } }
  { const d = await A.build({ rawSummary: goodRaw, readers: mk({ gridSessions: async () => { throw new Error("down"); }, latest: async () => { throw new Error("down"); }, purgeReport: async () => { throw new Error("down"); } }) });
    for (const k of ["grid", "backup", "gbp"]) { const r = d.rows.find((x) => x.key === k); ok(r && r.tone !== "ok" && /Couldn't read/.test(r.tag), `(8) the ${k} line reads as fine when its read failed`); }
    ok(d.rows.length >= 9, "(8) one failed read hid the other lines"); }
  { const d = await A.build({ rawSummary: { ready: false, backend: null, reason: "no storage settings", sources: [], files: 0, bytes: 0 }, readers: mk() }); const r = d.rows.find((x) => x.key === "raw"); ok(r.tone === "you" && /Not set up/.test(r.tag), "(8) with no storage the raw line isn't 'Not set up'"); }
  { const d = await A.build({ rawSummary: { ...goodRaw, files: 0, sources: [], bytes: 0 }, readers: mk() }); ok(d.rows.find((x) => x.key === "raw").tone !== "ok", "(8) an empty store reads as OK"); }
  { const d = await A.build({ rawSummary: goodRaw, readers: mk({ purgeReport: async () => ({ enabled: false, tables: [{ short: "reviews", would_delete: 12 }, { short: "profile snapshots", would_delete: 3 }], would_delete_total: 15, failed: 0, ledger_ready: false }) }) });
    const r = d.rows.find((x) => x.key === "gbp"); ok(/15 rows/.test(r.line) && /12 reviews/.test(r.line) && /OFF/.test(r.line) && r.tone === "you", "(8) the Business Profile line isn't built from its counts"); }
  const adm = SRC["admin-data-keep.js"];
  ok(/enabled: false/.test(adm) && !/enabled: (true|enabledIn)/.test(adm), "(8) the admin read could ask the purge to really delete");
  ok(/const gate = await requireWorkspaceUser\(event\);\s*\n\s*if \(gate\.error\) return gate\.error;/.test(adm), "(8) the admin read isn't limited to signed-in admins");
  ok(!/method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(adm), "(8) the admin read writes something");
  const sec = adminJs.slice(adminJs.indexOf("DATA · WHAT'S KEPT AND WHERE"), adminJs.indexOf("function getRequestedView()"));
  ok(sec.length > 500, "(8) the admin card code moved");
  ok(!/\$\{|<svg/.test("") && !/\b\d+\s+[a-z]{3,}/.test(sec.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/\/\/.*$/gm, "")), "(8) the admin card has a figure typed into its words");
  ok(/data-dk-refresh>Check again<\/button>/.test(sec) && /admin-data-keep/.test(sec) && /Reading what's kept…/.test(sec), "(8) the Check again button or the waiting text is missing (every control spins)");
  ok(!/—/.test(sec), "(8) an em dash in the new admin copy");
  ok(/id="systemHealthCard"[\s\S]{0,300}id="dataKeepCard"/.test(adminHtml), "(8) the Data card isn't under System health");
  ok(/admin\.js\?v=2026\d{4}[a-z]/.test(adminHtml), "(8) admin.js has no cache buster");
}

// ── (9) the SQL file and the job list ───────────────────────────────────────────────────────────────────────────────
{
  for (const t of ["gsc_pull_state", "client_gsc_daily", "vertical_benchmark_history", "gbp_purge_ledger"]) ok(new RegExp(`create table if not exists public\\.${t}\\b`).test(sql), `(9) the SQL file doesn't create ${t}`);
  ok(/array\['gsc_pull_state','client_gsc_daily','vertical_benchmark_history','gbp_purge_ledger'\]/.test(sql) && /enable row level security/.test(sql) && /revoke all on public\.%I from anon, authenticated/.test(sql), "(9) a new table isn't closed to the public");
  ok(/insert into storage\.buckets[^;]*'raw-store'[^;]*false\)/.test(sql), "(9) the raw-store bucket isn't made private in the SQL");
  ok(!/\b(drop\s+(table|column|schema)|truncate\s+\w|delete\s+from|alter\s+table[^;]*\b(drop|rename)\b)/i.test(sql.replace(/--.*$/gm, "")), "(9) the SQL file drops, renames or deletes something");
  ok(/unique \(search_term, scanned_on\)/.test(sql) && /row_key\s+text not null unique/.test(sql), "(9) the unique keys that make re-runs safe are missing");
  const M = load("_job-manifest.js");
  for (const [job, cron] of [["gsc-daily-rows", "30 5 * * *"], ["gbp-30-day-purge", "45 5 * * *"]]) {
    const j = M.byName(job); ok(j && j.cron === cron && j.where === "netlify", `(9) ${job} isn't on the System health list with its schedule`);
    ok(new RegExp(`\\[functions\\."${job}"\\]\\s*\\n\\s*schedule = "${cron.replace(/\*/g, "\\*")}"`).test(toml), `(9) ${job} isn't scheduled in netlify.toml`);
  }
  const g = M.byName("gsc-daily-rows").read({ table_ready: false, clients: 0, pulled: 0, errors: [] });
  ok(g.error && /Not set up/.test(g.error), "(9) System health reads a Search Console job that pulled nothing for want of its table as fine");
  const p = M.byName("gbp-30-day-purge").read({ enabled: false, would_delete_total: 21, deleted_total: 0 });
  ok(/OFF/.test(p.note) && p.count === 21, "(9) System health doesn't say the purge is off");
}

if (F.length) { console.error(`🔴 check-data-keep: ${F.length} problem${F.length === 1 ? "" : "s"}`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log("✅ check-data-keep: raw store, grid, Search Console, benchmarks, change log, frozen reports, purge (off), admin row and SQL all hold");
