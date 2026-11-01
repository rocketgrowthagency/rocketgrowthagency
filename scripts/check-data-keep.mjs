#!/usr/bin/env node
// check-data-keep.mjs — WHAT WE KEEP, AND THAT IT CAN'T QUIETLY STOP (approved data_keep_v1 + data_store_v1, Chris 10-31).
// HOLDS, on fakes (nothing real is called, nothing is written anywhere):
//  (1) raw store: a saved file is gzipped, named source/client/date, never overwrites, carries no secret (by key name, by value shape, and the
//      process's own env values), any client id (empty, unicode, "../") stays inside its folder, a failed save returns ok:false and never throws,
//      the first save makes a PRIVATE bucket, Backblaze signing matches AWS's published example, and nothing in the file can delete or edit.
//  (2) rank grid: every pin's full result goes to the raw store before the numbers are worked out; the scan's size and guard are unchanged (its schedule is the hourly tick since the park was lifted, 10-31).
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
// (10) Google numbers in the monthly records + the drive (approved pending_and_google_security_v1, Part 2): a month is expired only when it ended MORE
//      than 30 days ago; the purge only CLEARS the Google fields (never a row, never total_calls), ledger first, bounded, off unless switched on, a
//      recent month is never touched; no reader turns a cleared number into 0 or a false change; the nightly drive copy strips only the listed
//      tables from copies over 30 days old, only when switched on, ledger first, and never touches files/ or anything else.
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
  "_gbp-purge.js", "gbp-30-day-purge.js", "admin-data-keep.js", "_job-manifest.js", "core-change.js"]) {
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
  ok(/\[functions\."rankings-refresh"\]\s*\n\s*schedule = "10 \* \* \* \*"/.test(toml), "(2) the rank scan's schedule changed (it is the hourly tick since the park was lifted; check-rank-schedule holds the rules)");
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
  // (5b) a reason is passed only where a real one is in hand: the written why RGA gave the client when it asked for a core change. Never a literal sentence.
  { const cc = SRC["core-change.js"] || "", calls = cc.match(/recordChange\(\{[\s\S]*?\}\);/g) || [];
    ok(calls.length === 1 && /whyChosen:\s*item\.why\s*\|\|\s*null/.test(calls[0]), "(5) the core-change ledger row doesn't carry the why the client was shown (item.why)");
    for (const f of Object.keys(SRC)) if (f !== "_change-ledger.js") ok(!/(whyChosen|expectedResult):\s*["'`]/.test(SRC[f]), `(5) ${f} passes a typed sentence as a reason (a reason must come from the record, never be invented)`); }
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
    w.countFn = async (p) => (/client_monthly_records/.test(p) ? 0 : w.rows); return w; };   // the monthly records have their own check, section (10)
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

// ── (10) Google numbers in the monthly records, and the old copies on the drive ──────────────────────────────────────
{
  const K = load("_gbp-keep.js"), P = load("_gbp-purge.js");
  const at = (d, t = "12:00:00") => new Date(`${d}T${t}Z`);
  // the rule: a month is expired only when it ended MORE than 30 days ago
  ok(K.RETENTION_DAYS === 30, "(10) the retention isn't 30 days");
  ok(!K.monthIsExpired("2026-10-01", at("2026-11-05")) && !K.monthIsExpired("2026-11-01", at("2026-11-05")) && !K.monthIsExpired("2027-01-01", at("2026-11-05")), "(10) the current, a recent or a future month counts as expired");
  ok(!K.monthIsExpired("2026-09-01", at("2026-10-31")) && !K.monthIsExpired("2026-09-01", at("2026-10-31", "23:59:00")), "(10) a month that ended exactly 30 days ago is already expired");
  ok(K.monthIsExpired("2026-09-01", at("2026-11-01", "00:00:00")) && K.monthIsExpired("2026-08-01", at("2026-10-31")) && K.monthIsExpired("2025-01-01", at("2026-10-31")), "(10) a month that ended over 30 days ago isn't expired");
  ok(["", null, undefined, "abc", "2026-13", "x-01"].every((v) => K.monthIsExpired(v, at("2026-11-05")) === false), "(10) an unreadable month is treated as expired (it must be kept)");
  ok(K.latestExpiredMonth(at("2026-11-05")) === "2026-09-01" && K.latestExpiredMonth(at("2026-10-31")) === "2026-08-01" && K.latestExpiredMonth(at("2026-11-01")) === "2026-09-01", "(10) the newest expired month is wrong");
  { const e = (d) => K.monthIsExpired(`${K.latestExpiredMonth(at(d))}`, at(d)), ne = (d) => { const l = K.latestExpiredMonth(at(d)); const [y, m] = l.split("-").map(Number); const n = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7) + "-01"; return !K.monthIsExpired(n, at(d)); };
    ok(["2026-11-05", "2026-12-31", "2027-03-01", "2026-10-31"].every((d) => e(d) && ne(d)), "(10) the purge's cut-off month and the readers' rule disagree"); }
  ok(JSON.stringify(K.GOOGLE_FIELDS) === JSON.stringify(["gbp_calls", "gbp_website_clicks", "gbp_actions", "gbp_impressions", "gbp_directions", "gbp_searches_direct", "gbp_searches_discovery", "review_count", "new_reviews", "average_rating"]), "(10) the list of Google fields changed (total_calls is forms + tracked calls and must never be on it)");
  { const r = K.withoutExpiredGoogle({ reporting_month: "2026-08-01", gbp_calls: 5, total_calls: 7, form_leads: 2, data: { gbp: { a: 1 }, k: 1 } }, at("2026-11-05"));
    ok(r.gbp_calls === null && r.total_calls === 7 && r.form_leads === 2 && r.data.k === 1 && !("gbp" in r.data), "(10) clearing a month changed something other than the Google fields");
    const keepIt = K.withoutExpiredGoogle({ reporting_month: "2026-10-01", gbp_calls: 5 }, at("2026-11-05")); ok(keepIt.gbp_calls === 5, "(10) a month inside the 30 days lost its numbers"); }

  // the purge, on a fake database
  const NOW = at("2026-11-05");
  const fresh = () => [
    { id: "aug", reporting_month: "2026-08-01", gbp_calls: 5, gbp_impressions: 90, review_count: 12, new_reviews: 0, average_rating: 4.5, total_calls: 7, form_leads: 3, data: { gbp: { calls: 5 }, k: 1 } },
    { id: "sep", reporting_month: "2026-09-01", gbp_calls: 3, gbp_website_clicks: 4, total_calls: 2, data: { k: 2 } },
    { id: "oct", reporting_month: "2026-10-01", gbp_calls: 9, review_count: 14, total_calls: 5, data: { gbp: { calls: 9 } } },
    { id: "jul", reporting_month: "2026-07-01", gbp_calls: null, total_calls: 1, data: {} },
  ];
  const world = (o = {}) => {
    const w = { rows: fresh(), calls: [], ledger: [], patches: [], deletes: 0 };
    const through = (p) => (/reporting_month=lte\.([\d-]+)/.exec(p) || [])[1] || "9999-99-99";
    const any = (r) => K.GOOGLE_FIELDS.some((f) => r[f] != null) || (r.data && r.data.gbp != null);
    const sel = (p) => w.rows.filter((r) => r.reporting_month <= through(p) && any(r));
    w.supa = async (p, init = {}) => { const method = init.method || "GET"; w.calls.push(`${method} ${p.split("?")[0]}`); if (w.calls.length > 800) throw new Error("runaway");
      if (p.startsWith("/gbp_purge_ledger")) { if (method === "GET") { if (o.noLedgerColumns) throw new Error("Supabase 400: column gbp_purge_ledger.action does not exist"); return []; }
        if (o.ledgerWriteFails) throw new Error("Supabase 500"); w.ledger.push(JSON.parse(init.body)); return null; }
      if (method === "DELETE") { w.deletes++; return null; }
      if (method === "PATCH") { const id = /id=eq\.([^&]+)/.exec(p)[1]; const r = w.rows.find((x) => x.id === id); if (r && r.reporting_month <= through(p)) { w.patches.push({ id, body: JSON.parse(init.body), path: p }); Object.assign(r, JSON.parse(init.body)); } return null; }
      return o.endless ? Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, reporting_month: "2026-08-01", gbp_calls: 1, data: {} })) : sel(p).slice(0, 50).map((r) => JSON.parse(JSON.stringify(r))); };
    w.countFn = async (p) => { if (!/client_monthly_records/.test(p)) return 0; const rows = sel(p); const f = /&([a-z_]+)=not\.is\.null/.exec(p); if (f) return rows.filter((r) => r[f[1]] != null).length; if (/data->>gbp=not\.is\.null/.test(p)) return rows.filter((r) => r.data && r.data.gbp != null).length; return rows.length; };
    return w; };
  { const w = world(); const r = await P.run({ supa: w.supa, countFn: w.countFn, now: NOW, enabled: false });
    ok(!w.calls.some((c) => /^(POST|PATCH|DELETE)/.test(c)), "(10) switched OFF, the monthly step still wrote, cleared or deleted");
    ok(r.monthly && r.monthly.rows_would_change === 2 && r.monthly.fields_would_clear === 8 && r.monthly.rows_cleared === 0, `(10) switched off, the monthly step doesn't report its rows and fields (${JSON.stringify(r.monthly && [r.monthly.rows_would_change, r.monthly.fields_would_clear])})`);
    ok(JSON.stringify(w.rows) === JSON.stringify(fresh()), "(10) switched off, a monthly record changed"); }
  { const w = world(); const r = await P.run({ supa: w.supa, countFn: w.countFn, now: NOW, enabled: true });
    const aug = w.rows.find((x) => x.id === "aug"), sep = w.rows.find((x) => x.id === "sep"), oct = w.rows.find((x) => x.id === "oct");
    ok(w.rows.length === 4 && w.deletes === 0 && !w.calls.some((c) => /^DELETE \/client_monthly_records/.test(c)), "(10) a monthly row was deleted");
    ok(K.GOOGLE_FIELDS.every((f) => aug[f] == null && sep[f] == null) && !("gbp" in aug.data), "(10) switched on, an expired month kept Google numbers");
    ok(aug.total_calls === 7 && aug.form_leads === 3 && aug.data.k === 1 && sep.total_calls === 2 && sep.data.k === 2, "(10) clearing the Google fields took other numbers with it");
    ok(oct.gbp_calls === 9 && oct.review_count === 14 && oct.data.gbp && oct.data.gbp.calls === 9, "(10) a recent month (inside 30 days) lost its Google numbers");
    ok(w.patches.length === 2 && w.patches.every((x) => /reporting_month=lte\./.test(x.path) && Object.keys(x.body).every((k) => K.GOOGLE_FIELDS.includes(k) || k === "data")), "(10) a clear sent more than the Google fields, or without the month guard");
    const seq = w.calls.filter((c) => /^(POST \/gbp_purge_ledger|PATCH)/.test(c)); ok(seq.length > 1 && seq[0].startsWith("POST") && w.ledger.length === 1 && w.ledger[0].action === "clear" && w.ledger[0].rows_cleared === 2 && w.ledger[0].fields_cleared >= 8 && w.ledger[0].rows_deleted === 0, "(10) a change didn't come after its own ledger line, or the line says nothing useful");
    ok(!JSON.stringify(w.ledger).includes("calls\":5") && w.ledger.every((l) => !("data" in l)), "(10) the ledger holds content, not counts");
    ok(r.monthly.rows_cleared === 2 && r.failed === 0, "(10) switched on, the monthly step doesn't report what it cleared"); }
  { const w = world({ noLedgerColumns: true }); const r = await P.run({ supa: w.supa, countFn: w.countFn, now: NOW, enabled: true });
    ok(!w.calls.some((c) => c.startsWith("PATCH")) && r.failed > 0, "(10) with no ledger columns the monthly step still changed rows, or didn't say so"); }
  { const w = world({ ledgerWriteFails: true }); await P.run({ supa: w.supa, countFn: w.countFn, now: NOW, enabled: true }); ok(!w.calls.some((c) => c.startsWith("PATCH")), "(10) a batch was cleared although its ledger line couldn't be written"); }
  { const w = world({ endless: true }); await P.run({ supa: w.supa, countFn: w.countFn, now: NOW, enabled: true }).catch(() => {}); ok(w.calls.filter((c) => c.startsWith("POST /gbp_purge_ledger")).length <= P.MAX_BATCHES, "(10) the monthly step looped past its batch cap"); }
  { const pur = SRC["_gbp-purge.js"]; ok((pur.match(/method: "PATCH"/g) || []).length === 1 && /if \(out\.enabled && m\.rows_would_change > 0\)[\s\S]*method: "PATCH"/.test(pur), "(10) a PATCH exists outside the switched-on branch");
    ok(!/client_monthly_records/.test(P.TARGETS.map((t) => t.table).join(",")) && P.MONTHLY.table === "client_monthly_records", "(10) the monthly table is on the DELETE list");
    ok(/\.sql/.test("") || /alter table public\.gbp_purge_ledger add column if not exists action\b/.test(sql) && /rows_cleared/.test(sql) && /fields_cleared/.test(sql), "(10) the SQL file doesn't add the ledger columns the monthly step writes"); }

  // writers must not write the numbers back
  { const m = read("netlify/functions/_metrics.js"), a = adminJs;
    ok(/const googleExpired = gbpKeep\.monthIsExpired\(reportingMonth, now\);/.test(m) && /if \(gbp && !googleExpired\) \{/.test(m) && /if \(!googleExpired\) data\.gbp = /.test(m), "(10) the metrics job could write Google numbers into an expired month");
    ok((a.match(/clearExpiredGoogle\(deriveMonthlyKpiColumns\(record\.data \|\| \{\}\), /g) || []).length === 2, "(10) the admin save of a monthly record could write an old month's Google numbers back");
    const f = (a.match(/function clearExpiredGoogle[\s\S]*?\n\}/) || [""])[0]; ok(/if \(!gbpMonthExpired\(reportingMonth\)\) return kpis;/.test(f) && /for \(const f of GBP_KEEP_FIELDS\) if \(f in out\) out\[f\] = null;/.test(f), "(10) the admin clear isn't a clear of the Google fields"); }

  // every copy of the rule agrees with the server's, and no gate pins a cache-buster value
  const lift = (src, names, extra = "") => { const parts = names.map((n) => (src.match(new RegExp(`(?:async )?function ${n}\\([\\s\\S]*?\\n\\}`)) || [""])[0]); if (parts.some((x) => !x)) idk(`a function to check moved: ${names.join(", ")}`); return `${extra}\n${parts.join("\n")}`; };
  const portalJs = read("portal/portal.js"), reportJs = read("portal/report/report.js");
  if (portalJs == null || reportJs == null) idk("portal.js or report.js moved");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  for (const [name, src] of [["admin.js", adminJs], ["portal.js", portalJs], ["report.js", reportJs]]) {
    const body = lift(src, ["gbpMonthExpired"]); const fn = new Function(`${body}; return gbpMonthExpired;`)();
    const dates = [["2026-09-01", "2026-10-31T12:00:00Z"], ["2026-09-01", "2026-11-01T00:00:00Z"], ["2026-10-01", "2026-11-05T00:00:00Z"], ["2026-08-01", "2026-10-31T12:00:00Z"], ["2027-01-01", "2026-11-05T00:00:00Z"], ["", "2026-11-05T00:00:00Z"], [null, "2026-11-05T00:00:00Z"]];
    ok(dates.every(([m, n]) => fn(m, new Date(n)) === K.monthIsExpired(m, new Date(n))), `(10) ${name}'s copy of the 30-day rule disagrees with the server's`);
    ok(new RegExp(`const GBP_KEEP_NOTE = ${JSON.stringify(K.KEEP_NOTE).replace(/'/g, "\\'")}`).test(src), `(10) ${name} doesn't carry the same wording as the server`); }
  ok(JSON.stringify((adminJs.match(/const GBP_KEEP_FIELDS = (\[[^\]]*\])/) || [])[1] && JSON.parse(adminJs.match(/const GBP_KEEP_FIELDS = (\[[^\]]*\])/)[1])) === JSON.stringify(K.GOOGLE_FIELDS), "(10) the admin's list of Google fields differs from the server's");

  // readers: a cleared number is never 0, never "pending", never one side of a change
  { const body = lift(portalJs, ["buildReviewSummaryHtml"], `const GBP_KEEP_NOTE = ${JSON.stringify(K.KEEP_NOTE)}; const gbpMonthExpired = (m) => ${"{"}const x = /^(\\d{4})-(\\d{2})/.exec(String(m||"")); return !!x && Date.UTC(+x[1], +x[2], 1) <= Date.UTC(2026,10,5) - 31*86400000;${"}"};`);
    const f = new Function("escapeHtml", `${body}; return buildReviewSummaryHtml;`)(esc);
    const cleared = f({ reporting_month: "2026-08-01", review_count: null, new_reviews: null, average_rating: null });
    ok(!/>\s*0\s*</.test(cleared) && !/<strong>0<\/strong>/.test(cleared) && !/\b0 reviews?\b/.test(cleared) && cleared.includes(K.KEEP_NOTE), "(10) the client's review card shows a cleared review count as 0");
    const fresh0 = f({ reporting_month: "2026-10-01", review_count: 0, new_reviews: 0, average_rating: null });
    ok(/<strong>0<\/strong>/.test(fresh0), "(10) a real zero review count no longer reads as 0");
    const notYet = f({ reporting_month: "2026-10-01", review_count: null, new_reviews: null, average_rating: null });
    ok(!/<strong>0<\/strong>/.test(notYet) && !/>\s*0\s*</.test(notYet), "(10) a review count that was never read shows as 0"); }
  { const body = lift(reportJs, ["num", "changeText", "chip", "tile", "chan"], `const GBP_KEEP_NOTE = ${JSON.stringify(K.KEEP_NOTE)}; const MIN_BASE_FOR_PERCENT = 30;`);
    const g = new Function("escapeHtml", `${body}; return { tile, chip, chan };`)(esc);
    const t = g.tile("Calls", null, 5, { keptCurrent: true, keptPrior: false });
    ok(t.includes(esc(K.KEEP_NOTE)) && !/>\s*0\s*</.test(t) && !/↑|↓|No change/.test(t), "(10) a cleared Google number in the report shows as 0, or as a change");
    const c = g.chip(7, null, { keptPrior: true }); ok(/No comparison/.test(c) && !/First month|↑|↓|No change/.test(c), "(10) the report compares a number with a month whose Google numbers were cleared");
    ok(/First month tracked/.test(g.chip(7, null, {})) && /↑/.test(g.chip(70, 40, {})), "(10) the report's normal comparison stopped working");
    const ch = g.chan("Reviews", "x", [["Total reviews", null], ["New", null]], K.KEEP_NOTE); ok(ch.includes(esc(K.KEEP_NOTE)) && !/<b class="num">0<\/b>/.test(ch), "(10) the report's channel box shows a cleared number as 0"); }
  { const rp = reportJs; ok(/num\(current\.review_count\) == null && !gbpMonthExpired\(current\.reporting_month\)/.test(rp), "(10) the report tells a client with cleared reviews to 'get the first reviews'"); }
  { const sm = SRC["send-monthly-report.js"], m1 = read("netlify/functions/_month1-report.js"), mat = read("netlify/functions/_mature.js");
    ok(/noGoogleCompare/.test(sm) && /const present = METRICS\.filter\(\(m\) => current\[m\.key\] != null/.test(sm), "(10) the monthly email could show a cleared Google number, or compare with one");
    ok(/if \(x === null \|\| y === null\) continue;/.test(m1 || "") && /googleCleared/.test(m1 || ""), "(10) the Month 1 report could show a cleared Google figure as 0, or not say why it can't compare");
    ok(/if \(a === null \|\| b === null \|\| !t\) return null;/.test(mat || "") && /GOOGLE_KPIS/.test(mat || ""), "(10) the KPI alert could read a cleared Google number as a drop, or call it fine without saying it wasn't checked"); }
  { const M1 = load("_month1-report.js"); const r = M1.buildMonth1Report({ client: { business_name: "X" }, months: [{ reporting_month: "2026-06-01", gbp_calls: null, gbp_impressions: null, gsc_clicks: 40, gsc_impressions: 900 }, { reporting_month: "2026-07-01", gbp_calls: null, gbp_impressions: null, gsc_clicks: 55, gsc_impressions: 1200 }], kickoffAt: "2026-07-05", now: at("2026-08-20"), playbook: [], tasks: {} });
    ok(!r.comparisons.some((c) => /Google profile|Call-button|Website clicks from/.test(c.label)) && r.text.includes(K.KEEP_NOTE) && !/Call-button taps[^\n]*: 0\b/.test(r.text), "(10) the Month 1 report compares a cleared Google figure, or doesn't say why it can't"); }
  { const Mat = load("_mature.js"); ok(Mat.breaches({ drop: 20 }, 10, null) === null && Mat.breaches({ drop: 20 }, null, 10) === null && Mat.breaches({ points: 1 }, 5, null) === null, "(10) the KPI alert reads a cleared number as a drop"); }

  // the admin Data row reads the new target from real numbers
  { const A = load("admin-data-keep.js");
    const rd = (over) => ({ gridSessions: async () => 1, gscStates: async () => [{ backfill_done: true, rows_total: 1, last_status: "ok" }], gscConnected: async () => 1, benchHistory: async () => ({ n: 1, terms: 1 }), whyCounts: async () => ({ n: 1, total: 2 }), latest: async () => ({ table_ready: true, rows: [] }),
      purgeReport: async () => ({ enabled: false, tables: [], would_delete_total: 0, failed: 0, ledger_ready: true, monthly: { rows_would_change: 7, fields_would_clear: 23, error: null, ledger_ready: true } }), ...over });
    const raw = { ready: true, backend: "supabase-storage", sources: [], files: 1, bytes: 1, partial: false };
    const d = await A.build({ rawSummary: raw, readers: rd() }); const row = d.rows.find((x) => x.key === "gbp");
    ok(/23 Google numbers across 7 months/.test(row.line) && /rows stay/.test(row.line) && row.tone === "you", "(10) the admin Data row isn't built from the monthly counts");
    const d2 = await A.build({ rawSummary: raw, readers: rd({ purgeReport: async () => ({ enabled: false, tables: [], would_delete_total: 0, failed: 0, ledger_ready: true, monthly: { rows_would_change: 0, fields_would_clear: 0, error: null, ledger_ready: true } }) }) });
    ok(/No monthly record holds Google numbers older than 30 days/.test(d2.rows.find((x) => x.key === "gbp").line), "(10) the admin Data row doesn't say when no monthly record is affected");
    const d3 = await A.build({ rawSummary: raw, readers: rd({ purgeReport: async () => ({ enabled: false, tables: [], would_delete_total: 0, failed: 0, ledger_ready: true, monthly: { rows_would_change: 0, fields_would_clear: 0, error: "x", ledger_ready: false } }) }) });
    ok(!/No monthly record holds/.test(d3.rows.find((x) => x.key === "gbp").line), "(10) an unreadable monthly count reads as 'nothing to clear'");
    ok(!/\b\d+ Google numbers?\b/.test(SRC["admin-data-keep.js"].replace(/\/\/.*$/gm, "")), "(10) a figure is typed into the admin Data row"); }

  // the drive
  { const bp = path.join(process.env.SCRAPER_COPY_DIR || path.dirname(HERE), "scripts/backup-client-data.mjs");
    const B = await import(`file://${bp}?${Date.now()}`).catch((e) => idk(`backup-client-data.mjs won't load: ${e.message}`));
    ok(B.gbpStripEnabled({ GBP_PURGE_ENABLED: "1" }) === true && [undefined, "", "0", "true", "yes", " 1", "11"].every((v) => B.gbpStripEnabled({ GBP_PURGE_ENABLED: v }) === false), "(10) the drive strip switches on for something other than exactly 1");
    const bsrc = fs.readFileSync(bp, "utf8");
    ok(/stripOldCopies\(\{ dir: DIR, today: TODAY, enabled: gbpStripEnabled\(\) \}\)/.test(bsrc) && /\{ dir: DIR, today: TODAY, enabled: false \}/.test(bsrc), "(10) the nightly backup doesn't take its switch from GBP_PURGE_ENABLED, or the report flag can strip");
    ok(!/rmSync|unlinkSync/.test(bsrc.slice(bsrc.indexOf("export function stripOldCopies"), bsrc.indexOf("// ── pure: which dated folders stay") > bsrc.indexOf("export function stripOldCopies") ? bsrc.indexOf("// ── pure: which dated folders stay") : bsrc.length).replace(/fs\.rmSync\(tmp, \{ force: true \}\)/, "")), "(10) the strip code can delete a file");
    ok(JSON.stringify(Object.keys(B.GBP_STRIP).sort()) === JSON.stringify([...P.TARGETS.map((t) => t.table), P.MONTHLY.table].filter((v, i, a) => a.indexOf(v) === i).sort()), "(10) the drive strip list isn't the website purge list");
    ok(JSON.stringify(B.GOOGLE_MONTHLY_FIELDS) === JSON.stringify(K.GOOGLE_FIELDS), "(10) the drive's Google fields differ from the website's");
    const snap = (table, rows) => B.stripRows(table, rows);
    ok(snap("client_state_snapshots", [{ surface: "reviews", payload: { source: "google_profile" } }, { surface: "reviews", payload: { source: "places" } }, { surface: "gbp", source: "deep-assess-client" }, { surface: "gbp", source: "other" }, { surface: "pagespeed" }]).removedRows === 2, "(10) the drive strip removes rows that aren't Business Profile content, or misses some");
    ok(snap("clients", [{ id: 1 }]).removedRows === 0 && snap("client_photos", [{ id: 1 }]).removedRows === 0, "(10) the drive strip touches a table that isn't on the list");
    ok((() => { try { B.stripPath("/x", "2026-09-01", "clients"); return false; } catch { return true; } })() && (() => { try { B.stripPath("/x", "../2026-09-01", "client_gbp_snapshots"); return false; } catch { return true; } })() && (() => { try { B.stripPath("/x", "files", "client_gbp_snapshots"); return false; } catch { return true; } })(), "(10) the strip can be pointed at an unlisted table or a folder that isn't a dated copy");
    ok(JSON.stringify(B.foldersToStrip(["2026-09-30", "2026-10-01", "2026-10-02", "files", "2026-10-31", "x"], "2026-10-31")) === JSON.stringify(["2026-09-30"]), "(10) the strip picks copies that aren't over 30 days old (or a folder that isn't a dated copy)");
    const os = await import("node:os"); const crypto = await import("node:crypto");
    const D = fs.mkdtempSync(path.join(os.tmpdir(), "dk-strip-"));
    const put = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v)); };
    const mkCopy = (name) => { put(`${D}/${name}/db/client_state_snapshots.json`, [{ id: 1, surface: "reviews", payload: { source: "google_profile" } }, { id: 2, surface: "reviews", payload: { source: "places" } }, { id: 3, surface: "pagespeed" }]);
      put(`${D}/${name}/db/client_gbp_snapshots.json`, [{ id: 1 }, { id: 2 }]); put(`${D}/${name}/db/client_monthly_records.json`, [{ id: 1, total_calls: 4, gbp_calls: 5, new_reviews: 0, data: { gbp: { a: 1 }, k: 2 } }]);
      put(`${D}/${name}/db/clients.json`, [{ id: 1, business_name: "x" }]); put(`${D}/${name}/manifest.json`, { problems: [] }); };
    mkCopy("2026-09-01"); mkCopy("2026-10-20"); put(`${D}/files/chats/a.txt`, "chat"); put(`${D}/files/memory/m.md`, "memory");
    const tree = () => { const o = {}; const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); fs.statSync(f).isDirectory() ? walk(f) : (o[path.relative(D, f)] = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")); } }; walk(D); return o; };
    const before = tree();
    const off = B.stripOldCopies({ dir: D, today: "2026-11-01", enabled: false });
    ok(JSON.stringify(tree()) === JSON.stringify(before) && !fs.existsSync(`${D}/gbp-strip-ledger.jsonl`), "(10) the drive strip changed a file while switched off");
    ok(off.enabled === false && off.rows_removed === 3 && off.fields_cleared === 3 && off.folders.length === 1 && off.folders[0].folder === "2026-09-01", `(10) switched off, the drive strip doesn't report what it would strip (${off.rows_removed}/${off.fields_cleared})`);
    const on = B.stripOldCopies({ dir: D, today: "2026-11-01", enabled: true }), after = tree();
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]).sort(), allowed = ["2026-09-01/db/client_gbp_snapshots.json", "2026-09-01/db/client_monthly_records.json", "2026-09-01/db/client_state_snapshots.json", "2026-09-01/manifest.json", "gbp-strip-ledger.jsonl"];
    ok(JSON.stringify(changed) === JSON.stringify(allowed.sort()), `(10) the drive strip changed something other than the listed copies (${changed.join(", ")})`);
    ok(on.rows_removed === 3 && on.fields_cleared === 3 && on.failed.length === 0, "(10) switched on, the drive strip doesn't report what it stripped");
    ok(after["2026-10-20/db/client_gbp_snapshots.json"] === before["2026-10-20/db/client_gbp_snapshots.json"], "(10) a copy under 30 days old was stripped");
    ok(after["files/chats/a.txt"] === before["files/chats/a.txt"] && after["files/memory/m.md"] === before["files/memory/m.md"] && after["2026-09-01/db/clients.json"] === before["2026-09-01/db/clients.json"], "(10) the strip touched chats, memory or another table");
    const left = JSON.parse(fs.readFileSync(`${D}/2026-09-01/db/client_state_snapshots.json`, "utf8")), mon = JSON.parse(fs.readFileSync(`${D}/2026-09-01/db/client_monthly_records.json`, "utf8"));
    ok(left.length === 2 && left.every((r) => r.id !== 1) && mon.length === 1 && mon[0].total_calls === 4 && mon[0].gbp_calls === null && mon[0].new_reviews === null && !("gbp" in mon[0].data) && mon[0].data.k === 2, "(10) the strip took out more than the Business Profile content, or left some");
    const ledger = fs.readFileSync(`${D}/gbp-strip-ledger.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    ok(ledger.length === 3 && ledger.every((l) => l.sha256_before && l.folder === "2026-09-01") && !/google_profile|"gbp":\{/.test(JSON.stringify(ledger)), "(10) the strip wasn't recorded before it ran, or the record holds content");
    ok(JSON.parse(fs.readFileSync(`${D}/2026-09-01/manifest.json`, "utf8")).gbp_stripped.length === 3, "(10) the stripped copy's own record doesn't say it was stripped");
    ok(B.stripOldCopies({ dir: D, today: "2026-11-01", enabled: true }).rows_removed === 0, "(10) a second strip found more to remove");
    // no ledger, no strip
    const D2 = fs.mkdtempSync(path.join(os.tmpdir(), "dk-strip2-")); const keep2 = (n) => fs.cpSync(`${D}/${n}`, `${D2}/${n}`, { recursive: true });
    mkCopy("2026-08-01"); fs.rmSync(`${D}/gbp-strip-ledger.jsonl`); fs.mkdirSync(`${D}/gbp-strip-ledger.jsonl`);   // a ledger that can't be written to
    const snapB = fs.readFileSync(`${D}/2026-08-01/db/client_gbp_snapshots.json`, "utf8");
    const noLedger = B.stripOldCopies({ dir: D, today: "2026-11-01", enabled: true });
    ok(fs.readFileSync(`${D}/2026-08-01/db/client_gbp_snapshots.json`, "utf8") === snapB && noLedger.failed.length > 0, "(10) a copy was stripped although its ledger line couldn't be written");
    void keep2; fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(D2, { recursive: true, force: true }); }
}

if (F.length) { console.error(`🔴 check-data-keep: ${F.length} problem${F.length === 1 ? "" : "s"}`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log("✅ check-data-keep: raw store, grid, Search Console, benchmarks, change log, frozen reports, purge (off), monthly Google numbers, the drive copies, admin row and SQL all hold");
