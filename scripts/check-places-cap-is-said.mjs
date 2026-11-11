#!/usr/bin/env node
// check-places-cap-is-said.mjs: EVERY GOOGLE PLACES "SEARCH TEXT" CALLER ASKS THE SHARED DAILY BUDGET FIRST, AND A QUOTA REFUSAL IS SAID.
//
// 🔴 11-11: Places SearchText is capped at 32 a day ON PURPOSE (never raise it: project_places_searchtext_quota_ceiling). The day was gone
// by 8:21 AM PT: the Mac's daily-health-check asked the website's backfill-gbp-hours for 400 leads, it spent ~41 lookups on cold-lead
// opening hours (41 leads stamped "GBP Hours Checked" 2026-11-11; the health check printed "daily Places quota reached ... this is
// expected"), and Google refused every lookup after it, client-facing ones included. Each caller spent first, and most read Google's
// 429 as an empty answer ("no listing", "not in the top 20"). Same class as the Airtable outage (project_airtable_outage_2026_11).
//
// HOLDS, on the WEBSITE repo (fakes only: no network, no real key, nothing written anywhere):
//   1  netlify/functions/_places-budget.js exists; Google's 32 can't be raised by env; the order is rank grid > profile watch > free audit
//      > backfills, so the 11-11 morning (a backfill spending first) leaves client work its lookups; a refusal closes the day for everyone
//      and says so; 429 / RESOURCE_EXHAUSTED is a refusal, 403 is not; the day is the Pacific day; with no table each run keeps to its share;
//      an unreadable ledger holds the backfills back.
//   2  every netlify function that calls places:searchText requires the budget, calls take() and checks !x.ok in the 40 lines before each
//      call, and has isQuotaRefusal() + refused() in the 40 lines after it.
//   3  run on Google's real 429: the service-area lookup stays "unknown" (never to_add), says the limit, looks again the next night, and
//      a second lookup that day asks Google nothing; backfill-gbp-hours stops at the first refusal, says it, stamps no lead, and one run
//      spends at most its share; backfill-place-ids says it and asks nothing more; a free audit stops at one call and reports Places as
//      unavailable (never "no profile"); the profile watch's System health row turns red on a stopped lookup or yesterday's refusal.
//   4  the grid treats a budget "no" as a provider refusal and its sub-location loop no longer swallows one; the FGA rank check and KPI
//      skip an unknown rank; the Mac's health check SAYS a refusal (never "this is expected"); the ledger SQL enables row level security.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website before this build (default 05ccdf0f) in 8+ places, else exit 2.
//   node scripts/check-places-cap-is-said.mjs [--against=<rev>] [--no-before]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, reader, loader, codeLines } from "./lib/site-rev.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const BEFORE = "05ccdf0f";
const KNOWN = ["_gbp-area-cover.js", "v2-rank-grid-background.js", "_fga-enrichment.js", "backfill-place-ids.js", "backfill-gbp-hours.js"];

// 🔒 NEVER A REAL REQUEST, NEVER A REAL SECRET. run-mutations hands every gate the Scraper .env; none of it is used here.
// The database settings' names are built, not written: daily-health-check.sh treats a gate whose source names them as a LIVE gate
// (a database health read first, skipped while the database struggles), and this one never touches a database.
const DB_URL = ["SUPA", "BASE_URL"].join(""), DB_KEY = ["SUPA", "BASE_SERVICE_ROLE_KEY"].join("");
const dbFake = { [DB_URL]: "https://db.gate.test", [DB_KEY]: "gate-service-key" };
const dbOff = () => { delete process.env[DB_URL]; delete process.env[DB_KEY]; };
for (const k of [DB_URL, DB_KEY, "GOOGLE_PLACES_API_KEY", "SERPAPI_KEY", "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "AIRTABLE_TABLE_NAME",
  "QUO_WEBHOOK_TOKEN", "PLACES_SEARCHTEXT_DAILY_CAP", "PLACES_LEDGER", "AWS_LAMBDA_FUNCTION_NAME", "LAMBDA_TASK_ROOT", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_KEY", "YELP_API_KEY", "FGA_SERP_DAILY_CAP"]) delete process.env[k];
const NO_NET = async (u) => { throw new Error(`gate: no network (${String(u).slice(0, 60)})`); };
globalThis.fetch = NO_NET;

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const QUOTA = { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'SearchTextRequest' and limit 'SearchTextRequest per day' of service 'places.googleapis.com'" } };
const isSearchText = (u) => String(u).includes("places.googleapis.com/v1/places:searchText");
const DAY_AT = "2026-11-11T16:00:00.000Z";
const notComment = (l) => !/^\s*(\/\/|\*|\/\*)/.test(l);

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const dir = path.join(root, "netlify/functions");
  if (!fs.existsSync(dir)) { fail("netlify/functions is missing"); return F; }
  const guard = async (name, fn) => { try { await fn(); } catch (e) { fail(`${name}: threw ${String(e && e.message || e).slice(0, 160)}`); } finally { globalThis.fetch = NO_NET; } };

  // ── 2 · every SearchText caller, statically ─────────────────────────────────────────────────────────────────────────
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  const callers = files.filter((f) => codeLines(rd(`netlify/functions/${f}`)).some(({ l }) => /places:searchText/.test(l)));
  for (const k of KNOWN) if (!callers.includes(k)) fail(`${k} no longer calls places:searchText (moved? re-read this gate's KNOWN list)`);
  if (callers.length < KNOWN.length) fail(`only ${callers.length} SearchText caller(s) found: the scan is reading the wrong thing`);
  const consumersUsed = new Map();
  for (const f of callers) {
    const src = rd(`netlify/functions/${f}`) || "";
    if (!/require\(["']\.\/_places-budget["']\)/.test(src)) { fail(`${f}: never requires ./_places-budget, so it spends without reading the day's shared budget`); continue; }
    const lines = src.split("\n");
    const ids = [...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`][^"'`\n]*places:searchText/g)].map((m) => m[1]);
    const sites = [];
    lines.forEach((l, i) => {
      if (!notComment(l) || !/fetch\(/.test(l)) return;
      if (/fetch\(\s*["'`][^"'`]*places:searchText/.test(l) || ids.some((id) => new RegExp(`fetch\\(\\s*${id}\\b`).test(l))) sites.push(i);
    });
    if (!sites.length) { fail(`${f}: names places:searchText but the gate finds no fetch of it`); continue; }
    for (const i of sites) {
      const before = lines.slice(Math.max(0, i - 40), i).filter(notComment).join("\n");
      const takes = [...before.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+[\w$.]*\btake\(\s*["']([\w-]+)["']/g)];
      const t = takes[takes.length - 1];
      if (!t) fail(`${f}:${i + 1}: calls SearchText without asking the shared budget first (no take() in the 40 lines before it)`);
      else {
        consumersUsed.set(t[2], f);
        if (!new RegExp(`!\\s*${t[1].replace(/\$/g, "\\$")}\\.ok\\b`).test(before.slice(before.lastIndexOf(t[0])))) fail(`${f}:${i + 1}: asks the budget but never checks its answer (!${t[1]}.ok) before calling Google`);
      }
      const after = lines.slice(i, i + 40).filter(notComment).join("\n");
      if (!/\bisQuotaRefusal\(/.test(after)) fail(`${f}:${i + 1}: Google's 429 / RESOURCE_EXHAUSTED isn't recognised after the call, so a refusal can read as "not found"`);
      if (!/\brefused\(\s*["'][\w-]+["']/.test(after)) fail(`${f}:${i + 1}: a refusal isn't recorded with refused(), so the rest of the day keeps asking and nothing says why`);
    }
  }

  // ── 1 · the budget itself ───────────────────────────────────────────────────────────────────────────────────────────
  let B = null;
  if (!rd("netlify/functions/_places-budget.js")) fail("netlify/functions/_places-budget.js is missing: no SearchText caller can read a shared daily budget before it spends");
  else { try { B = req("./netlify/functions/_places-budget.js"); } catch (e) { fail(`_places-budget.js won't load: ${e.message}`); } }
  if (B) {
    B._reset && B._reset();
    for (const [c, f] of consumersUsed) if (!B.CONSUMERS[c]) fail(`${f}: asks the budget as "${c}", which _places-budget.js doesn't declare`);
    if (B.GOOGLE_DAILY_CAP !== 32) fail(`Google's cap is written as ${B.GOOGLE_DAILY_CAP}, not 32`);
    process.env.PLACES_SEARCHTEXT_DAILY_CAP = "1000";
    if (B.cap() > 32) fail(`PLACES_SEARCHTEXT_DAILY_CAP=1000 raises the budget to ${B.cap()}: it may only LOWER it (the 32 is never raised)`);
    process.env.PLACES_SEARCHTEXT_DAILY_CAP = "10";
    if (B.cap() !== 10) fail("PLACES_SEARCHTEXT_DAILY_CAP=10 doesn't lower the budget");
    delete process.env.PLACES_SEARCHTEXT_DAILY_CAP;
    const S = (c) => (B.CONSUMERS[c] ? B.share(c) : -1);
    if (S("rank-grid") !== B.cap()) fail("the map ranking of a paying client can't use the whole day");
    if (!(S("rank-grid") >= S("gbp-area-cover") && S("gbp-area-cover") > S("fga-enrichment") && S("fga-enrichment") > S("backfill-gbp-hours") && S("fga-enrichment") > S("backfill-place-ids")))
      fail(`the order isn't rank grid > profile watch > free audit > backfills (shares ${["rank-grid", "gbp-area-cover", "fga-enrichment", "backfill-place-ids", "backfill-gbp-hours"].map(S).join(" / ")})`);
    // the 11-11 morning: a backfill spends first, until the budget says no
    const fill = (consumer, rows = []) => { let n = 0; while (n < 100 && B.decide(consumer, rows).ok) { rows.push({ consumer, calls: 1, outcome: "taken", at: DAY_AT }); n++; } return { n, rows }; };
    const m = fill("backfill-gbp-hours");
    if (m.n > 10) fail(`a backfill could spend ${m.n} of the day's ${B.cap()} lookups before the budget stopped it`);
    for (const c of ["rank-grid", "gbp-area-cover", "fga-enrichment"]) if (!B.decide(c, m.rows).ok) fail(`after the backfill's morning, ${c} is refused: the backfill starved client work`);
    const a = fill("fga-enrichment", m.rows.slice());
    for (const c of ["rank-grid", "gbp-area-cover"]) if (!B.decide(c, a.rows).ok) fail(`after free audits spend their share, ${c} is refused: an audit starved a paying client`);
    // a refusal closes the day, and says so
    const ref = [{ consumer: "backfill-gbp-hours", calls: 0, outcome: "refused", at: "2026-11-11T16:21:00.000Z" }];
    for (const c of Object.keys(B.CONSUMERS)) {
      const d = B.decide(c, ref);
      if (d.ok) fail(`after Google refused a lookup today, ${c} would still ask Google`);
      else if (!/refused/i.test(d.reason || "") || !/daily limit/i.test(d.reason || "")) fail(`the closed day's reason doesn't say Google refused at its daily limit: "${String(d.reason).slice(0, 90)}"`);
    }
    const qr = [[429, "", true], [200, { error: { status: "RESOURCE_EXHAUSTED" } }, true], [400, QUOTA.error.message, true], [403, { error: { status: "PERMISSION_DENIED", message: "API key not valid" } }, false], [200, { places: [] }, false]];
    for (const [s, b, want] of qr) if (B.isQuotaRefusal(s, b) !== want) fail(`isQuotaRefusal(${s}, ${JSON.stringify(b).slice(0, 50)}) is ${!want}, should be ${want}`);
    if (B.pacificDay(Date.parse("2026-11-11T07:59:00Z")) !== "2026-11-10" || B.pacificDay(Date.parse("2026-11-11T08:00:00Z")) !== "2026-11-11") fail("the budget's day isn't Google's day (it resets at midnight Pacific)");
    // take() against a fake ledger
    Object.assign(process.env, dbFake);
    const ledger = (mode, rows) => async (u, init = {}) => {
      if (!String(u).startsWith("https://db.gate.test/rest/v1/places_usage")) throw new Error(`gate: unexpected ${String(u).slice(0, 60)}`);
      if (mode === "missing") return res(404, { code: "PGRST205", message: "Could not find the table 'public.places_usage' in the schema cache" });
      if (mode === "down") return res(500, { message: "boom" });
      if ((init.method || "GET") === "POST") { rows.push(JSON.parse(init.body)); return res(201, ""); }
      return res(200, rows);
    };
    await guard("take() on a ledger", async () => {
      B._reset(); const rows = Array.from({ length: 30 }, () => ({ consumer: "fga-enrichment", calls: 1, outcome: "taken", at: DAY_AT }));
      const w = await B.take("gbp-area-cover", { fetchFn: ledger("ok", rows) });
      if (w.ok) fail("with 30 of 32 used today, the profile watch still took one (it must leave the last 2 for the map ranking)");
      const g = await B.take("rank-grid", { fetchFn: ledger("ok", rows) });
      if (!g.ok) fail(`with 30 of 32 used today, the map ranking was refused: ${g.reason}`);
      if (!rows.some((r) => r.consumer === "rank-grid" && r.outcome === "taken" && r.calls === 1)) fail("a granted lookup isn't written to the ledger (the next caller can't count it)");
      await B.refused("rank-grid", { status: 429, fetchFn: ledger("ok", rows) });
      if (!rows.some((r) => r.outcome === "refused")) fail("refused() doesn't write the refusal to the ledger, so other functions keep asking Google");
      B._reset();
      if ((await B.take("rank-grid", { fetchFn: ledger("ok", rows) })).ok) fail("a refusal another function wrote today doesn't stop this one");
    });
    // 🔴 a gate or a Mac script holds the REAL database settings (the Scraper .env): the ledger must not write there from a test
    await guard("the ledger stays out of a test's database", async () => {
      B._reset(); let db = 0;
      globalThis.fetch = async (u) => { if (String(u).startsWith("https://db.gate.test")) db++; return res(200, []); };
      delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.LAMBDA_TASK_ROOT; delete process.env.PLACES_LEDGER;
      await B.take("rank-grid"); await B.refused("rank-grid", { status: 429 }); await B.summary();
      if (db) fail(`outside a deployed function the budget reached the database ${db} time(s): every gate and Mac script would write test rows into the clients' database`);
      B._reset(); db = 0; process.env.AWS_LAMBDA_FUNCTION_NAME = "gate-fn";
      await B.take("rank-grid");
      if (!db) fail("inside a deployed function (AWS_LAMBDA_FUNCTION_NAME) the budget never reads the shared ledger, so each function only counts itself");
      delete process.env.AWS_LAMBDA_FUNCTION_NAME; globalThis.fetch = NO_NET;
    });
    await guard("take() with no table", async () => {
      B._reset(); let n = 0; for (let i = 0; i < 40; i++) if ((await B.take("backfill-gbp-hours", { fetchFn: ledger("missing", []) })).ok) n++;
      if (n === 0) fail("before the ledger SQL is run, the backfill can't look anything up (it must still work, within its share)");
      if (n > B.share("backfill-gbp-hours")) fail(`with no ledger table, one run took ${n} lookups: more than its share (${B.share("backfill-gbp-hours")})`);
    });
    await guard("take() with an unreadable ledger", async () => {
      B._reset();
      if ((await B.take("backfill-gbp-hours", { fetchFn: ledger("down", []) })).ok) fail("a ledger that can't be read let a backfill spend (it must hold the backfills back)");
      if (!(await B.take("rank-grid", { fetchFn: ledger("down", []) })).ok) fail("a ledger that can't be read stopped the map ranking (client work goes on; Google's 32 is still the hard stop)");
    });
    dbOff();
  }

  // ── 3a · the service-area lookup (_gbp-area-cover, used by the nightly profile watch and "Check Google now") ─────────
  await guard("_gbp-area-cover", async () => {
    B && B._reset && B._reset();
    const C = req("./netlify/functions/_gbp-area-cover.js");
    let places = 0;
    const g = async (u) => {
      if (isSearchText(u)) { places++; return res(429, QUOTA); }
      if (String(u).includes("maps.googleapis.com/maps/api/geocode")) return res(200, { status: "ZERO_RESULTS", results: [] });
      throw new Error(`gate: unexpected ${String(u).slice(0, 60)}`);
    };
    const now = { area: ["Los Angeles, CA, USA"], state: "CA" }, at = Date.parse("2026-11-11T10:30:00Z");
    const cover = await C.areaCover(["Mar Vista"], now, { fetch: g, key: "gate-places-key", now: at });
    const it = (cover.items || [])[0] || {};
    if (it.state !== "unknown") fail(`a place Google refused to look up became "${it.state}" (it must stay unknown: no answer is not "to add")`);
    if (!/daily lookup limit/i.test(C.whyPlain(it.why || ""))) fail(`the service-area card doesn't say Google's daily limit stopped it: "${C.whyPlain(it.why || "")}"`);
    if (it.retry !== "places") fail("a refused lookup isn't marked to look again (retry: places), so it waits a week like a real failure");
    if (!C.coverStale(cover, ["Mar Vista"], at + 21 * 3600000)) fail("the next night doesn't look again at a place Google's limit stopped");
    if (C.coverStale(cover, ["Mar Vista"], at + 2 * 3600000)) fail("a stopped place is asked again within hours (it may only retry once a day)");
    const p0 = places;
    await C.areaCover(["Palms"], now, { fetch: g, key: "gate-places-key", now: at + 60000 });
    if (places !== p0) fail("after Google refused, the next service-area lookup that day still asked Google");
  });

  // ── 3b · backfill-gbp-hours (the 11-11 spender) ───────────────────────────────────────────────────────────────────
  const env = { QUO_WEBHOOK_TOKEN: "gate-token", GOOGLE_PLACES_API_KEY: "gate-places-key", AIRTABLE_API_KEY: "gate-at-key", AIRTABLE_BASE_ID: "appGATE" };
  await guard("backfill-gbp-hours", async () => {
    B && B._reset && B._reset();
    Object.assign(process.env, env);
    const H = req("./netlify/functions/backfill-gbp-hours.js");
    let places = 0, answer = 429; const patches = [];
    globalThis.fetch = async (u, init = {}) => {
      const s = String(u);
      if (s.includes("api.airtable.com") && (init.method || "GET") === "GET") return res(200, { records: Array.from({ length: 50 }, (_, i) => ({ id: `recG${i}`, fields: { "Business Name": `Gate Biz ${i}`, City: "Austin" } })) });
      if (s.includes("api.airtable.com") && init.method === "PATCH") { patches.push(JSON.parse(init.body)); return res(200, { records: [] }); }
      if (isSearchText(s)) { places++; return answer === 429 ? res(429, QUOTA) : res(200, { places: [] }); }
      throw new Error(`gate: unexpected ${s.slice(0, 60)}`);
    };
    const run = async () => JSON.parse((await H.handler({ queryStringParameters: { token: "gate-token", limit: "400", commit: "1" } })).body);
    const b = await run();
    if (places !== 1) fail(`backfill-gbp-hours asked Google ${places} times on a day Google refused the first`);
    if (!b.places || b.places.stopped !== "refused") fail("backfill-gbp-hours' reply doesn't say Google refused (places.stopped), so the morning check can't tell a refusal from a quiet day");
    else if (!/daily limit/i.test(b.places.reason || "")) fail(`backfill-gbp-hours' refusal reason doesn't say the daily limit: "${String(b.places.reason).slice(0, 80)}"`);
    if (patches.some((p) => (p.records || []).some((r) => r.fields && "GBP Hours Checked" in r.fields))) fail("a lead Google never answered was stamped GBP Hours Checked (it would never be looked up again)");
    const p1 = places; const b2 = await run();
    if (places !== p1) fail("a second run the same day asked Google again after it refused");
    if (!b2.places || !b2.places.stopped) fail("a second run on a closed day doesn't say why it looked nothing up");
    B && B._reset && B._reset(); places = 0; answer = 200;
    await run();
    const share = B && B.share ? B.share("backfill-gbp-hours") : 6;
    if (places > share) fail(`one backfill-gbp-hours run spent ${places} lookups (Google answering every one): more than its share of ${share}`);
  });

  // ── 3c · backfill-place-ids ─────────────────────────────────────────────────────────────────────────────────────────
  await guard("backfill-place-ids", async () => {
    B && B._reset && B._reset();
    Object.assign(process.env, env, dbFake);
    const P = req("./netlify/functions/backfill-place-ids.js");
    let places = 0, wrote = 0;
    globalThis.fetch = async (u, init = {}) => {
      const s = String(u);
      if (s.includes("/rest/v1/places_usage")) return res(404, { code: "PGRST205", message: "not found" });
      if (s.includes("/rest/v1/clients?google_place_id=is.null")) return res(200, [{ id: "c-gate-1", business_name: "Acme Plumbing", primary_market: "Austin, TX", website_url: "https://acme.test" },
        { id: "c-gate-2", business_name: "Bravo Cleaning", primary_market: "Boise, ID", website_url: "https://bravo.test" }]);
      if (s.includes("/rest/v1/client_google_oauth")) return res(200, []);
      if (s.includes("/rest/v1/clients?id=eq.") && init.method === "PATCH") { wrote++; return res(204, ""); }
      if (isSearchText(s)) { places++; return res(429, QUOTA); }
      throw new Error(`gate: unexpected ${s.slice(0, 60)}`);
    };
    const b = JSON.parse((await P.handler({ queryStringParameters: { token: "gate-token" } })).body);
    if (places !== 1) fail(`backfill-place-ids asked Google ${places} times after the first refusal`);
    if (!b.places || b.places.stopped !== "refused") fail("backfill-place-ids' reply doesn't say Google refused (places.stopped)");
    const r = (b.results || []);
    if (!r[0] || !/429|daily limit/i.test(r[0].reason || "")) fail(`the refused client's reason doesn't say Google's limit: "${String(r[0] && r[0].reason).slice(0, 80)}"`);
    if (r[1] && /no Places match/i.test(r[1].reason || "")) fail("a client never looked up reads as \"no Places match\"");
    if (wrote) fail("a place id was written on a day Google refused every lookup");
    dbOff();
  });

  // ── 3d · a free audit (_fga-enrichment) ─────────────────────────────────────────────────────────────────────────────
  await guard("_fga-enrichment", async () => {
    B && B._reset && B._reset();
    Object.assign(process.env, { GOOGLE_PLACES_API_KEY: "gate-places-key" });
    const E = req("./netlify/functions/_fga-enrichment.js");
    if (typeof E.enrichGoogleBusinessProfile !== "function") { fail("_fga-enrichment's Places lookup (enrichGoogleBusinessProfile) can't be run on a fixture"); return; }
    let places = 0;
    globalThis.fetch = async (u) => {
      const s = String(u);
      if (isSearchText(s)) { places++; return res(429, QUOTA); }
      if (s.includes("maps.googleapis.com/maps/api/place/")) return res(200, { status: "ZERO_RESULTS", candidates: [], predictions: [] });
      throw new Error(`gate: unexpected ${s.slice(0, 60)}`);
    };
    const p = await E.enrichGoogleBusinessProfile({ businessName: "Acme Plumbing", website: "https://acme.test", phoneNumbers: ["5125550100"], address: "", primaryLocation: "Austin, TX", primaryService: "Plumber" });
    if (places !== 1) fail(`a free audit asked Google ${places} times after its first refusal`);
    if (!p.placesUnavailable) fail("a free audit Google refused doesn't say Places was unavailable (placesUnavailable)");
    if (p.configured !== false) fail("a free audit Google refused still runs its Places checks (configured must be false, so no \"no photos\" / \"no hours\" claim)");
    if (p.categoryRankKnown !== false) fail("a free audit Google refused reads its rank as known (it would print \"Not ranked in top 20\")");
  });

  // ── 3e · System health: the profile watch's row ─────────────────────────────────────────────────────────────────────
  await guard("System health row", async () => {
    const M = req("./netlify/functions/_job-manifest.js");
    const j = M.byName("gbp-profile-watch");
    if (!j || !j.read) { fail("the profile watch has no System health reader"); return; }
    const e1 = j.read({ clients: [{}], errors: 0, places_stopped: 1, places_why: "Google's daily lookup limit was reached" }).error;
    if (!e1 || !/daily lookup limit/i.test(e1)) fail("a service-area lookup Google's limit stopped leaves the profile watch's System health row green");
    const e2 = j.read({ clients: [{}], errors: 0, places_yesterday: { refused: "Google refused a Places lookup (429, daily quota) at 8:21 AM PT" } }).error;
    if (!e2 || !/refused/i.test(e2)) fail("yesterday's Google refusal (from the ledger) doesn't reach System health");
    if (j.read({ clients: [{}], errors: 0 }).error) fail("the profile watch's row is red with nothing wrong");
    const w = rd("netlify/functions/_gbp-watch.js") || "", pw = rd("netlify/functions/gbp-profile-watch.js") || "";
    if (!/retry === "places"[\s\S]{0,200}out\.places\s*=/.test(w)) fail("_gbp-watch.js doesn't put a stopped lookup in its reply (out.places)");
    if (!/places_stopped/.test(pw) || !/\.summary\(\{\s*day:/.test(pw)) fail("gbp-profile-watch.js doesn't add up stopped lookups or read yesterday's ledger");
  });

  // ── 4 · the grid, the FGA report, the SQL ───────────────────────────────────────────────────────────────────────────
  const grid = rd("netlify/functions/v2-rank-grid-background.js") || "";
  if (!/function isProviderRefusal[\s\S]{0,300}Places budget:/.test(grid)) fail("the grid's isProviderRefusal doesn't treat a budget \"no\" as a refusal, so 25 pins would each be asked and each fail");
  if (!/throw new Error\(`Places budget: /.test(grid)) fail("the grid doesn't stop on the budget's \"no\" (throw Places budget: ...)");
  if (!/if \(isProviderRefusal\(e\)\) throw e;/.test(grid)) fail("the grid's sub-location loop swallows a refusal, so the grid shrinks silently and reports absences it never sampled");
  const fga = rd("netlify/functions/_fga-enrichment.js") || "";
  if (!/technical\.categoryRankKnown === false\)\) checks\.push\(\{\s*\n\s*key: "gbp_rank"/.test(fga)) fail("the FGA rank check isn't skipped when the rank is unknown (it would say \"Not ranked in top 20\" on a refusal)");
  const fb = rd("netlify/functions/_fga-report-builder.js") || "";
  if (!/categoryRankKnown === false \? "Not checked"/.test(fb)) fail("the FGA KPI table prints \"Not ranking\" for a rank Google never answered");
  const sql = rd("docs/supabase/PLACES_LEDGER_2026-11-11.sql") || "";
  if (!/create table if not exists places_usage/i.test(sql)) fail("docs/supabase/PLACES_LEDGER_2026-11-11.sql doesn't create places_usage");
  else if (!/alter table places_usage enable row level security/i.test(sql)) fail("the places_usage SQL doesn't enable row level security in the same file");

  // the Mac's morning health check (THIS repo): it printed "this is expected" on 11-11
  const hc = (() => { try { return fs.readFileSync(path.join(SCRAPER, "scripts/daily-health-check.sh"), "utf8"); } catch { return ""; } })();
  if (!hc) fail("scripts/daily-health-check.sh unreadable");
  else {
    if (/Places quota reached[^\n]*this is expected/.test(hc)) fail("daily-health-check.sh still calls a Places refusal \"expected\"");
    if (!/"stopped"/.test(hc) || !/Google REFUSED a Places lookup/.test(hc)) fail("daily-health-check.sh doesn't read the backfill's places.stopped and SAY a refusal");
  }
  return F;
}

await runGate({ name: "check-places-cap-is-said", beforeRev: BEFORE, checkTree, minBefore: 8 });
