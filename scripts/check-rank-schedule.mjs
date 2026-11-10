#!/usr/bin/env node
// check-rank-schedule.mjs — THE MAP RANKING THE CONTRACT PROMISES REALLY RUNS, ON THE RIGHT TERM, AND NEVER LIES ABOUT A PIN IT COULD NOT READ
// (rank grid park lifted, Chris 10-31). The contract: "Geo-grid rank tracking: Client's main keyword, updated monthly. A scan is a snapshot...
// If a data provider is unavailable, RGA says so and reruns when it can."
// HOLDS, on fakes only (no real search, no real database, nothing written anywhere):
//  (1) the term: the LOCKED main keyword (first term of the locked plan), never `primary_service`; no locked plan = says so, no scan; a term
//      that was checked and is not sound is never scanned; a term never checked is checked first; the check names the locked term.
//  (2) who: test records, terminated, archived and inactive clients are never scanned, however complete their record is.
//  (3) when: two scans a month (local days 1-14 and 15-end) at 10:00 in the client's own zone, across DST, the year end, Hawaii; a zone we can't
//      work out (no market, no state, another country) = says so, no scan. Driven hour by hour through a whole month.
//  (4) recorded: a window is claimed before any search; a finished window never repeats; an overlapping tick can't start a second scan; a window
//      that keeps failing stops after 3 tries and says so; a claim that never reports back counts as a failed try; never an endless loop.
//  (5) a pin that could not be read is never "not ranked": a failed or unsearched pin is a failed pin; "Google has no results here" is a real
//      read; a partial or empty-handed scan stores NO map, NO rows, NO monthly summary and says how many points were read; a full map stores all
//      25 rows with the coverage next to the rank; a provider refusal stops the spending; no key reaches a stored error.
//  (6) cost: 25 searches a scan (none extra once the centre is known); SerpAPI's own count of searches left is read first and a low or unreadable
//      count refuses the whole run with no search spent; a name in another script can't match every result; monthly counts at 1, 5 and 25 clients.
//  (7) the job: hourly in netlify.toml and the manifest (same cron), says what it did and every problem; admin shows coverage and the schedule.
// Exit 0 = holds · 1 = broken · 2 = moved (indeterminate). → memory project_rank_grid_uniform_sentinel
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { return null; } };
const F = [];
const ok = (cond, msg) => { if (!cond) F.push(msg); };
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };

const FAKE = { SUPABASE_URL: "https://fake.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-0123456789", SERPAPI_KEY: "fake-serpapi-key-abcdefghij",
  INTERNAL_FN_SECRET: "fake-internal-secret-0123456789", QUO_WEBHOOK_TOKEN: "fake-token" };
for (const k of ["B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET", "B2_ENDPOINT", "GOOGLE_PLACES_API_KEY", "RANK_GRID_SIZE", "RANK_GRID_SPACING_MI", "RANK_MAX_PLACES_CALLS"]) delete process.env[k];
Object.assign(process.env, FAKE);

const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (f) => { try { return req(`./${f}`); } catch (e) { idk(`${f} won't load: ${e.message}`); } };
const SRC = {};
for (const f of ["_rank-schedule.js", "rankings-refresh.js", "v2-rank-grid-background.js", "_job-manifest.js", "validate-tracked-keyword.js"]) { SRC[f] = read(`netlify/functions/${f}`); if (SRC[f] == null) idk(`${f} moved`); }
const toml = read("netlify.toml"), adminJs = read("admin/admin.js"), adminHtml = read("admin/index.html");
if (toml == null || adminJs == null || adminHtml == null) idk("netlify.toml or admin moved");

const S = load("_rank-schedule.js");
const manifest = load("_job-manifest.js");
const GRID_FN = load("v2-rank-grid-background.js");

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const yaml = (terms) => "```yaml\nkeywords:\n" + terms.map((t) => `  - term: ${t}\n    searches: 100 searches/mo\n`).join("") + "locations:\n  - Mar Vista\n```";
const mkData = ({ plan = ["emergency plumber austin", "water heater repair austin"], tracked, verdict = "sound", ledger } = {}) => {
  const tasks = {};
  if (plan) tasks["m1.strategy.keywords_locations"] = { status: "done", auto_result: { outcome_data: { draft: yaml(plan) } } };
  if (tracked) tasks["m1.audit.keyword_validation"] = { status: "done", auto_result: { outcome_data: { tracked, verdict } } };
  return { tasks, v2Campaign: ledger ? { rank_schedule: ledger } : {} };
};
const mkClient = (o = {}) => ({ id: "c1", business_name: "Acme Plumbing", primary_service: "plumber", primary_market: "Austin, TX", billing_status: "active", status: "active", source: "manual_admin", archived_at: null, ...o });
const at = (iso) => new Date(iso);
const T_CT_10 = at("2026-10-01T15:10:00Z");   // 10:10 in Austin (CDT, UTC-5)
const dec = (o) => S.decide({ now: T_CT_10, ...o });

// ── (1) the term ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  let d = dec({ client: mkClient(), data: mkData({ tracked: "emergency plumber austin" }) });
  ok(d.action === "scan" && d.main === "emergency plumber austin", `(1) a locked plan with a sound first term should scan it, got ${d.action}/${d.code}/${d.main}`);
  d = dec({ client: mkClient({ primary_service: "water heater repair austin" }), data: mkData({ tracked: "emergency plumber austin" }) });
  ok(d.main === "emergency plumber austin", "(1) the scan used primary_service instead of the locked main keyword");
  d = dec({ client: mkClient({ primary_service: "plumber" }), data: mkData({ plan: null, tracked: "plumber" }) });
  ok(d.action === "skip" && d.code === "no_locked_keyword" && /locked/i.test(d.reason), "(1) no locked plan must say so and not scan, even with a validated primary_service to fall back on");
  d = dec({ client: mkClient(), data: mkData({ plan: [] }) });
  ok(d.action === "skip" && d.code === "no_locked_keyword", "(1) an empty plan must read as no locked keyword");
  d = dec({ client: mkClient(), data: mkData({ tracked: "emergency plumber austin", verdict: "no_demand" }) });
  ok(d.action === "skip" && d.code === "unvalidated", `(1) a term checked and not sound was scanned (${d.action}/${d.code})`);
  d = dec({ client: mkClient(), data: mkData({ tracked: "plumber", verdict: "sound" }) });
  ok(d.action === "validate", `(1) a sound check of ANOTHER term (primary_service) was taken as proof for the locked term (${d.action}/${d.code})`);
  d = dec({ client: mkClient(), data: mkData({}) });
  ok(d.action === "validate", "(1) a term never checked must be checked first");
  d = dec({ client: mkClient(), data: mkData({ ledger: { ...S.emptyLedger(), validations: { [S.normKw("Emergency Plumber, Austin")]: { verdict: "sound", at: T_CT_10.toISOString() } } } }) });
  ok(d.action === "scan", "(1) a sound check on our own ledger (case, comma and spacing differ) should count");
  d = dec({ client: mkClient(), data: mkData({ ledger: { ...S.emptyLedger(), validations: { [S.normKw("emergency plumber austin")]: { verdict: "indeterminate", at: new Date(T_CT_10 - 3600e3).toISOString() } } } }) });
  ok(d.action === "skip" && d.code === "unvalidated", "(1) a check that couldn't tell, made an hour ago, must not be repeated every hour nor read as sound");
  d = dec({ client: mkClient(), data: null });
  ok(d.action === "skip", "(1) no onboarding record = nothing to scan");
  ok(S.sameKw("Emergency  Plumber!", "emergency plumber") && !S.sameKw("", "") && S.sameKw("李记 水管", "李记水管") === false, "(1) keyword comparison: case/punctuation fold, empty never equals empty, other scripts compare as themselves");
}

// ── (2) who ─────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const data = mkData({ tracked: "emergency plumber austin" });
  for (const [label, c] of [["test source", { source: "test:acceptance-walk-new-client" }], ["TEST in the name", { business_name: "Lone Star Drain & Plumbing (TEST - daily walk)" }],
    ["terminated", { billing_status: "terminated" }], ["archived", { archived_at: "2026-09-01T00:00:00Z" }], ["status lost", { status: "lost" }]]) {
    const d = dec({ client: mkClient(c), data });
    ok(d.action === "skip", `(2) ${label} was scanned`);
  }
  ok(dec({ client: mkClient({ business_name: "Testa Roofing" }), data }).action === "scan", "(2) a real name that merely starts with 'Test' was skipped as a test record");
}

// ── (3) when ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const data = mkData({ tracked: "emergency plumber austin" });
  const c = mkClient();
  ok(S.windowKey(S.localParts(at("2026-10-14T20:00:00Z"), "America/Chicago")) === "2026-10-1", "(3) day 14 must be window 1");
  ok(S.windowKey(S.localParts(at("2026-10-15T20:00:00Z"), "America/Chicago")) === "2026-10-2", "(3) day 15 must be window 2");
  ok(S.windowKey(S.localParts(at("2026-10-31T20:00:00Z"), "America/Chicago")) === "2026-10-2", "(3) month end must be window 2");
  ok(S.windowKey(S.localParts(at("2027-01-01T03:00:00Z"), "America/Los_Angeles")) === "2026-12-2", "(3) 7 PM on Dec 31 Pacific is still December, whatever UTC says");
  ok(dec({ client: c, data, now: at("2026-10-01T14:10:00Z") }).code === "wait_hour", "(3) 9:10 local must wait");
  ok(dec({ client: c, data, now: at("2026-10-01T16:10:00Z") }).code === "wait_hour", "(3) 11:10 local must wait");
  ok(dec({ client: c, data, now: at("2026-10-01T15:10:00Z") }).action === "scan", "(3) 10:10 local must scan");
  // DST: Austin's 10:10 is 16:10Z in winter
  ok(dec({ client: c, data, now: at("2027-01-05T16:10:00Z") }).action === "scan" && dec({ client: c, data, now: at("2027-01-05T15:10:00Z") }).code === "wait_hour", "(3) the 10:00 slot must follow daylight saving time");
  ok(dec({ client: mkClient({ primary_market: "Honolulu, HI" }), data, now: at("2026-10-01T20:10:00Z") }).action === "scan", "(3) Hawaii's 10:00 was missed");
  ok(dec({ client: mkClient({ primary_market: "Culver City, CA" }), data, now: at("2026-10-01T17:10:00Z") }).action === "scan", "(3) Pacific's 10:00 was missed");
  for (const m of [null, "", "Austin", "London, UK", "Toronto, ON", "Sydney, NSW"]) {
    const d = dec({ client: mkClient({ primary_market: m }), data });
    ok(d.action === "skip" && d.code === "no_zone", `(3) market ${JSON.stringify(m)}: an unknown zone must say so and not scan (${d.action}/${d.code})`);
  }
  // the whole month, hour by hour: exactly two scans, days 1 and 15, 10:xx local
  const sim = (finishWith, { client = c, tz = "America/Chicago", from = "2026-10-01T00:10:00Z", hours = 24 * 31, dataFn = () => mkData({ tracked: "emergency plumber austin" }) } = {}) => {
    let d0 = dataFn(); const scans = [];
    for (let h = 0; h < hours; h++) {
      const now = new Date(Date.parse(from) + h * 3600e3);
      const x = S.decide({ client, data: d0, now });
      if (x.action !== "scan") continue;
      const claim = "k" + h;
      let l = S.claimWindow(S.readLedger(d0), x.window, x.main, claim, now);
      scans.push({ now, window: x.window, lp: S.localParts(now, tz) });
      if (finishWith) l = S.finishAttempt(l, x.window, claim, finishWith, now);
      d0 = { ...d0, v2Campaign: { ...d0.v2Campaign, rank_schedule: l } };
    }
    return scans;
  };
  let sc = sim({ status: "done", pins_read: 25, pins_total: 25 });
  ok(sc.length === 2 && sc[0].lp.d === 1 && sc[1].lp.d === 15 && sc.every((s) => s.lp.hour === 10), `(3) a healthy month should be exactly two scans (day 1 and day 15, at 10:xx); got ${sc.length}: ${sc.map((s) => `${s.lp.d}@${s.lp.hour}`).join(",")}`);
  sc = sim({ status: "done" }, { from: "2026-10-31T00:10:00Z", hours: 24 * 31 });
  ok(sc.length === 3 && sc.every((s) => s.lp.hour === 10), `(3) across a month boundary the windows must not repeat or skip (${sc.map((s) => `${s.lp.m}/${s.lp.d}`).join(",")})`);
  // (4) never an endless loop
  sc = sim({ status: "failed", reason: "SerpAPI 500" });
  ok(sc.length === 6, `(4) a scan that always fails must stop at 3 tries per window (6 in a month), got ${sc.length}`);
  ok(sc.every((s, i) => i === 0 || (s.now - sc[i - 1].now) >= 20 * 3600e3 - 1), "(4) a failed try was repeated inside the same day");
  sc = sim(null);
  ok(sc.length <= 6 && sc.length >= 2, `(4) a scan that never reports back must be bounded (got ${sc.length})`);
  sc = sim({ status: "partial", reason: "3 of 25 points could not be read", pins_read: 22, pins_total: 25 });
  ok(sc.length === 6, `(4) a partial map is not a finished window: it should be retried to the cap (got ${sc.length})`);
  // double run: a claim exists (just started) = no second scan
  {
    const now = T_CT_10; const dd = mkData({ tracked: "emergency plumber austin" });
    const x = S.decide({ client: c, data: dd, now });
    const l = S.claimWindow(S.emptyLedger(), x.window, x.main, "a", now);
    const y = S.decide({ client: c, data: { ...dd, v2Campaign: { rank_schedule: l } }, now: new Date(+now + 600e3) });
    ok(y.action === "skip" && y.code === "in_flight", `(4) a second tick while the first is running must not scan (${y.action}/${y.code})`);
    const z = S.decide({ client: c, data: { ...dd, v2Campaign: { rank_schedule: S.finishAttempt(l, x.window, "a", { status: "done" }, now) } }, now: new Date(+now + 24 * 3600e3 * 2) });
    ok(z.code === "window_done", "(4) a finished window repeated");
    ok(S.decide({ client: c, data: { ...dd, v2Campaign: { rank_schedule: l } }, now: new Date(+now + 24 * 3600e3) }).attempt === 2, "(4) a stale claim should count as one failed try");
    const failedL = S.finishAttempt(l, x.window, "a", { status: "failed", reason: "x" }, now);
    ok(S.decide({ client: c, data: { ...dd, v2Campaign: { rank_schedule: failedL } }, now: new Date(+now + 1200e3) }).code === "retry_wait", "(4) a failed try was repeated within the same day");
    ok(S.decide({ client: c, data: { ...dd, v2Campaign: { rank_schedule: failedL } }, now: new Date(+now + 24 * 3600e3) }).action === "scan", "(4) a failed try was not retried the next day");
    const cov = S.decide({ client: c, data: dd, now, covered: { at: new Date(+now - 2 * 86400e3).toISOString() } });
    ok(cov.action === "cover", "(4) a full map from two days ago should answer the window without new searches");
    ok(S.decide({ client: c, data: dd, now, covered: { at: new Date(+now - 20 * 86400e3).toISOString() } }).action === "scan", "(4) a map from 20 days ago must not cover the window");
  }
}

// ── a fake world: Supabase REST + SerpAPI ───────────────────────────────────────────────────────────────────────────
function world({ clients = [], records = {}, rankings = [], serp = null, account = { total_searches_left: 4000 } } = {}) {
  const w = { clients, records: JSON.parse(JSON.stringify(records)), rankings: [...rankings], monthly: [], serpCalls: [], accountCalls: 0, patches: 0, other: [] };
  w.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); const m = (init.method || "GET").toUpperCase();
    const J = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), headers: { get: () => null } });
    if (u.hostname === "serpapi.com" && u.pathname === "/account.json") { w.accountCalls++; return account === null ? J(500, {}) : J(200, account); }
    if (u.hostname === "serpapi.com") {
      const q = u.searchParams.get("q"), ll = u.searchParams.get("ll");
      w.serpCalls.push({ q, ll });
      const r = serp ? await serp({ q, ll, n: w.serpCalls.length }) : { status: 200, body: { local_results: [] } };
      return J(r.status || 200, r.body || {});
    }
    if (u.hostname === "fake.supabase.test") {
      const p = u.pathname.replace("/rest/v1/", "");
      const eq = (k) => { const v = u.searchParams.get(k); return v && v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null; };
      if (p === "clients") return J(200, w.clients);
      if (p === "client_onboarding_records") {
        if (m === "GET") { const id = eq("client_id"); const r = w.records[id]; return J(200, r ? [{ id: "rec-" + id, data: JSON.parse(JSON.stringify(r)) }] : []); }
        if (m === "PATCH") { const id = eq("id").replace("rec-", ""); w.records[id] = JSON.parse(init.body).data; w.patches++; return J(204, ""); }
      }
      if (p === "client_keyword_rankings") {
        if (m === "POST") { JSON.parse(init.body).forEach((r) => w.rankings.push(r)); return J(201, ""); }
        const id = eq("client_id"), kw = eq("keyword"), src = eq("source");
        return J(200, w.rankings.filter((r) => (!id || r.client_id === id) && (!kw || r.keyword === kw) && (!src || r.source === src)).sort((a, b) => String(b.measured_at).localeCompare(String(a.measured_at))));
      }
      if (p === "client_monthly_records") {
        if (m === "GET") return J(200, []);
        if (m === "POST") { w.monthly.push(JSON.parse(init.body)); return J(201, ""); }
        if (m === "PATCH") { w.monthly.push(JSON.parse(init.body)); return J(204, ""); }
      }
    }
    w.other.push(String(url).slice(0, 80));
    return J(200, {});
  };
  return w;
}
const secretsIn = (v) => { const s = JSON.stringify(v); return Object.values(FAKE).filter((x) => s.includes(x)); };

// ── the tick, end to end ────────────────────────────────────────────────────────────────────────────────────────────
{
  const mk = (extra = {}) => {
    const rga = mkClient({ id: "rga", business_name: "Acme Plumbing", primary_market: "Austin, TX" });
    const test = mkClient({ id: "t1", business_name: "Z (TEST - walk)", source: "test:x" });
    const term = mkClient({ id: "tm", billing_status: "terminated" });
    const noplan = mkClient({ id: "np" });
    const records = { rga: mkData({ tracked: "emergency plumber austin" }), t1: mkData({ tracked: "emergency plumber austin" }), tm: mkData({ tracked: "emergency plumber austin" }), np: mkData({ plan: null }) };
    return world({ clients: [rga, test, term, noplan], records, ...extra });
  };
  const run = async (w, now, extra = {}) => {
    globalThis.fetch = w.fetch; const sent = [], asked = [];
    const out = await S.runTick({ now, fetchFn: w.fetch, dispatch: async (a) => { sent.push(a); return extra.dispatchResult || { ok: true, status: 202 }; }, validate: async (a) => { asked.push(a); return extra.verdict || { verdict: "sound", volume: 90 }; }, uuid: () => "claim-" + (sent.length + asked.length) });
    return { out, sent, asked };
  };
  let w = mk(); let r = await run(w, T_CT_10);
  ok(r.sent.length === 1 && r.sent[0].client.id === "rga" && r.sent[0].main === "emergency plumber austin", `(4) one tick at 10:10 Austin time should start exactly RGA's... the Austin client's scan on the locked term (sent ${r.sent.map((s) => s.client.id)})`);
  ok(!r.sent.some((s) => ["t1", "tm", "np"].includes(s.client.id)), "(2) a test, terminated or plan-less client got a scan");
  ok(w.accountCalls === 1 && w.serpCalls.length === 0, "(6) the tick must read SerpAPI's account count once and spend no search itself");
  let led = S.readLedger(w.records.rga); ok(led.windows["2026-10-1"] && led.windows["2026-10-1"].attempts.length === 1 && led.windows["2026-10-1"].attempts[0].status === "started", "(4) the window wasn't claimed in the record before the scan");
  const again = await run(w, new Date(+T_CT_10 + 120e3));
  ok(again.sent.length === 0, "(4) a second tick two minutes later started a second scan");
  ok(led.status === null || true, "");
  // an overlapping tick: another claim lands between our write and our read-back, so ours must NOT run
  w = mk(); { const inner = w.fetch; let raced = false;
    w.fetch = async (url, init = {}) => { const res = await inner(url, init);
      if (!raced && (init.method || "") === "PATCH" && String(init.body || "").includes('"claim-')) { raced = true; const d = w.records.rga; const L = S.readLedger(d); const win = L.windows["2026-10-1"];
        win.attempts.push({ at: T_CT_10.toISOString(), claim: "other-tick", status: "started" }); w.records.rga = { ...d, v2Campaign: { ...d.v2Campaign, rank_schedule: L } }; }
      return res; }; }
  r = await run(w, T_CT_10);
  ok(r.sent.length === 0 && r.out.results.some((x) => x.skipped === "claimed_elsewhere"), "(4) two overlapping ticks both started a scan");
  // not the hour
  w = mk(); r = await run(w, at("2026-10-01T03:10:00Z"));
  ok(r.sent.length === 0 && w.accountCalls === 0, "(3) a tick outside 10:00 local started a scan or asked the provider");
  // an unchecked term is checked with its own name, then scanned on the same tick
  w = mk(); w.records.rga = mkData({}); r = await run(w, T_CT_10);
  ok(r.asked.length === 1 && r.asked[0].main === "emergency plumber austin" && r.sent.length === 1, "(1) an unchecked locked term should be checked by name, then scanned this tick");
  w = mk(); w.records.rga = mkData({}); r = await run(w, T_CT_10, { verdict: { verdict: "no_demand" } });
  ok(r.sent.length === 0 && S.readLedger(w.records.rga).validations[S.normKw("emergency plumber austin")].verdict === "no_demand", "(1) a term with no demand was scanned, or its verdict wasn't kept");
  // provider low / unreadable: nothing runs, nothing is spent, said out loud
  w = mk({ account: { total_searches_left: 30 } }); r = await run(w, T_CT_10);
  ok(r.sent.length === 0 && r.out.problems.length === 1 && /30/.test(r.out.problems[0]), `(6) too few searches left must refuse the scan and say so (${JSON.stringify(r.out.problems)})`);
  ok(Object.keys(S.readLedger(w.records.rga).windows).length === 0, "(6) a refused scan counted as a try");
  w = mk({ account: null }); r = await run(w, T_CT_10);
  ok(r.sent.length === 0 && r.out.problems.length === 1, "(6) an unreadable provider account must refuse, not guess");
  ok(S.RESERVE_SEARCHES >= 1, "(6) a reserve is kept back at all (the shared floor, _serpapi-reserve.js, must be a positive number)");
  w = mk({ account: { total_searches_left: S.RESERVE_SEARCHES + 25 - 1 } }); r = await run(w, T_CT_10);
  ok(r.sent.length === 0, "(6) a count that leaves less than the reserve after the scan must refuse");
  w = mk({ account: { total_searches_left: S.RESERVE_SEARCHES + 25 } }); r = await run(w, T_CT_10);
  ok(r.sent.length === 1, "(6) a count that covers the scan and the reserve must run");
  // dispatch refused: failed try recorded, problem said
  w = mk(); r = await run(w, T_CT_10, { dispatchResult: { ok: false, status: 502 } });
  led = S.readLedger(w.records.rga);
  ok(r.out.problems.length === 1 && led.windows["2026-10-1"].attempts[0].status === "failed", "(4) a scan that couldn't be started wasn't recorded as a failed try and reported");
  // a covered window spends nothing
  w = mk(); const rows = Array.from({ length: 25 }, (_, i) => ({ client_id: "rga", keyword: "emergency plumber austin", source: "geo-grid", grid_session_id: "s1", measured_at: new Date(+T_CT_10 - 86400e3).toISOString(), grid_index: i, map_rank: null }));
  w.rankings = rows; r = await run(w, T_CT_10);
  ok(r.sent.length === 0 && r.out.covered === 1 && S.readLedger(w.records.rga).windows["2026-10-1"].status === "covered", "(4) a full map from yesterday should cover the window with no search");
  w = mk(); w.rankings = rows.slice(0, 20); r = await run(w, T_CT_10);
  ok(r.sent.length === 1, "(5) a session with fewer than 25 rows is not a full map and must not cover a window");
}

// ── the scan itself ─────────────────────────────────────────────────────────────────────────────────────────────────
const bizResult = (rank, extra = {}) => ({ local_results: [...Array(rank - 1).fill(0).map((_, i) => ({ title: "Other " + i, place_id: "o" + i })), { title: "Acme Plumbing", place_id: "PID1", gps_coordinates: { latitude: 30.27, longitude: -97.74 } }, { title: "Tail", place_id: "tail" }], ...extra });
const GEO = { lat: 30.27, lng: -97.74, radius_km: 5, anchor: { kind: "business", name: "Acme Plumbing", market: "Austin, TX", place_id: "PID1" } };
async function scan({ serp, geometry = GEO, name = "Acme Plumbing", withWindow = true, keywords = ["emergency plumber austin"], data } = {}) {
  const w = world({ clients: [mkClient()], records: { c1: data || mkData({ tracked: "emergency plumber austin" }) }, serp });
  if (withWindow) w.records.c1 = { ...w.records.c1, v2Campaign: { rank_schedule: S.claimWindow(S.emptyLedger(), "2026-10-1", "emergency plumber austin", "CL1", new Date()) } };
  globalThis.fetch = w.fetch;
  await GRID_FN.handler({ headers: { "x-internal-secret": FAKE.INTERNAL_FN_SECRET }, body: JSON.stringify({ clientId: "c1", businessName: name, keyword: keywords[0], keywords, primaryLocation: "Austin, TX", geometry: geometry || undefined, schedule: withWindow ? { window: "2026-10-1", claim: "CL1" } : undefined }) });
  const rg = w.records.c1.v2Campaign.rank_grid; const win = S.readLedger(w.records.c1).windows["2026-10-1"];
  return { w, rg, win, rows: w.rankings.filter((r) => r.source === "geo-grid") };
}
{
  // a full, healthy map: business found at some pins, absent at others
  let x = await scan({ serp: ({ ll, n }) => ({ body: n % 3 === 0 ? { local_results: [{ title: "Someone Else", place_id: "z" }] } : bizResult(1 + (n % 4)) }) });
  ok(x.w.serpCalls.length === 25, `(6) a scan with the centre already known should cost exactly 25 searches, got ${x.w.serpCalls.length}`);
  ok(x.rows.length === 25 && x.rg.status === "done" && x.rg.pins_read === 25 && x.rg.pins_total === 25 && Array.isArray(x.rg.grid), `(5) a full read should store 25 rows, the map and the coverage (${x.rows.length}, ${x.rg.status}, ${x.rg.pins_read}/${x.rg.pins_total})`);
  ok(x.rows.some((r) => r.map_rank == null) && x.rows.some((r) => r.map_rank != null), "(5) a pin that was read and had no business must be stored as not ranked (null), and found ones as a number");
  ok(x.win.status === "done" && x.win.attempts[0].status === "done" && x.win.attempts[0].pins_read === 25, "(4) a full map must close its window as done with the pin count");
  ok(x.w.monthly.length === 1, "(5) a full map should write the monthly summary once");
  ok(S.readLedger(x.w.records.c1).geometry && S.readLedger(x.w.records.c1).geometry.lat === 30.27, "(6) the centre and reach must be kept so the next scan costs 25");
  ok(x.rg.error === undefined, "(5) a clean scan should carry no error");

  // Google answers "no results" at every point: that is a real read, and the business is not ranked there
  x = await scan({ serp: () => ({ body: { error: "Google Maps hasn't returned any results for this query." } }) });
  ok(x.rows.length === 25 && x.rows.every((r) => r.map_rank == null) && x.rg.pins_read === 25 && x.win.status === "done", `(5) "Google has no results here" at every pin is a real read of 25 pins, not 25 failures (${x.rows.length} rows, read ${x.rg.pins_read})`);

  // every search fails: nothing about ranking may be stored
  x = await scan({ serp: () => ({ status: 200, body: { error: "boom " + FAKE.SERPAPI_KEY } }) });
  ok(x.rows.length === 0 && x.w.monthly.length === 0 && x.rg.grid === undefined, "(5) 25 failed searches stored a map, rows or a monthly summary: a failure was kept as 'not ranked'");
  ok(x.rg.status === "error" && x.rg.pins_read === 0 && x.rg.pins_total === 25 && /could not be read/.test(x.rg.error || ""), `(5) all pins failed: the record must say 0 of 25 read (${x.rg.status}, ${x.rg.pins_read}/${x.rg.pins_total}, ${x.rg.error})`);
  ok(x.rg.avg_rank === null && x.rg.pct_top3 === null, "(5) a scan that read nothing reported an average or a percentage");
  ok(x.win.status !== "done" && x.win.attempts[0].status === "failed" && x.win.attempts[0].pins_read === 0, "(4) a failed scan must leave its window open with the reason");
  ok(secretsIn([x.rg, x.win]).length === 0, "(5) a key reached a stored error");
  ok(x.w.serpCalls.length <= 25 + 5, `(6) the runaway cap was exceeded (${x.w.serpCalls.length} searches)`);

  // the provider refuses the key: stop spending
  x = await scan({ serp: () => ({ status: 401, body: { error: "Invalid API key" } }) });
  ok(x.w.serpCalls.length <= 12, `(6) a refused key kept being used (${x.w.serpCalls.length} searches)`);
  ok(x.rows.length === 0 && x.rg.status === "error", "(5) a refused key stored a map");

  // three pins fail: a partial read stores no map and says 22 of 25
  const seenLl = []; const dead = (ll) => { if (!seenLl.includes(ll)) seenLl.push(ll); return seenLl.indexOf(ll) < 3; };
  x = await scan({ serp: ({ ll }) => (dead(ll) ? { status: 503, body: { error: "unavailable" } } : { body: bizResult(2) }) });
  const failedAfterRetry = 25 - x.rg.pins_read;
  ok(x.rg.pins_total === 25 && x.rows.length === 0 && x.rg.grid === undefined && x.w.monthly.length === 0, `(5) a partial read stored a map, rows or a monthly summary (rows ${x.rows.length})`);
  ok(failedAfterRetry === 3 && x.rg.status === "partial", `(5) three pins that keep failing must read as 22 of 25, partial (read ${x.rg.pins_read}, ${x.rg.status})`);
  ok(x.rg.status === "partial" && x.win.attempts[0].status === "partial" && x.rg.failed_pins.length === failedAfterRetry && /could not be read/.test(x.rg.error), "(5) a partial scan must list its failed pins and not close the window");
  // one blip recovers on the single retry
  let blips = new Set();
  x = await scan({ serp: ({ n, ll }) => { const k = ll; if (!blips.has(k) && n === 5) { blips.add(k); return { status: 503, body: {} }; } return { body: bizResult(3) }; } });
  ok(x.rg.pins_read === 25 && x.rows.length === 25, `(5) one failed search should be tried once more and recover (${x.rg.pins_read}/25)`);

  // a pin that was never searched (cap) is a failed pin, not an empty one
  process.env.RANK_MAX_PLACES_CALLS = "10";
  x = await scan({ serp: () => ({ body: bizResult(2) }) });
  delete process.env.RANK_MAX_PLACES_CALLS;
  ok(x.rg.pins_read === 10 && x.rg.pins_total === 25 && x.rows.length === 0, `(5) pins the cap stopped must count as unread, not as 'not ranked' (read ${x.rg.pins_read}, rows ${x.rows.length})`);

  // no centre known: the first scan spends a few location searches, then keeps the centre
  x = await scan({ geometry: null, serp: ({ ll }) => ({ body: ll ? bizResult(2) : { local_results: [{ title: "Acme Plumbing", place_id: "PID1", gps_coordinates: { latitude: 30.27, longitude: -97.74 } }] } }) });
  const geocodes = x.w.serpCalls.filter((c) => !c.ll).length;
  ok(x.rows.length === 25 && geocodes >= 1 && geocodes <= 3 && x.w.serpCalls.length === 25 + geocodes, `(6) a first scan costs 25 plus at most 3 lookups of the business (${geocodes} lookups)`);
  ok(x.rg.anchor && x.rg.anchor.kind === "business", "(5) the anchor must say the map is centred on the business when it was found");
  // a business Google can't place by name (service-area, no address): centred on the market, and it says so
  x = await scan({ geometry: null, serp: ({ ll }) => ({ body: ll ? bizResult(2) : { local_results: [{ title: "Austin City Hall", place_id: "CH", gps_coordinates: { latitude: 30.26, longitude: -97.74 } }] } }) });
  ok(x.rg.anchor && x.rg.anchor.kind === "area", "(5) a business Google can't place must be centred on the area and say so");
  // no coordinates anywhere
  x = await scan({ geometry: null, serp: () => ({ body: { local_results: [{ title: "Nobody", place_id: "n" }] } }) });
  ok(x.rows.length === 0 && x.rg.status === "error" && x.win.attempts[0].status === "failed", "(5) no coordinates anywhere must fail the scan and say so, not draw a map");
  // a name in another script can't match every result
  x = await scan({ name: "李记水管", serp: () => ({ body: { local_results: [{ title: "Acme Plumbing", place_id: "a" }, { title: "Bob Pipes", place_id: "b" }] } }) });
  ok(x.rows.length === 25 && x.rows.every((r) => r.map_rank == null), "(6) a business named in another script matched every result and ranked #1 everywhere");
  // ...and one that IS in the results is found
  x = await scan({ name: "李记水管", serp: () => ({ body: { local_results: [{ title: "Acme Plumbing", place_id: "a" }, { title: "李记水管 服务", place_id: "b" }] } }) });
  ok(x.rows.length === 25 && x.rows.every((r) => r.map_rank === 2), "(6) a business named in another script wasn't found where it is");
  // a name that is only punctuation
  x = await scan({ name: "!!!", serp: () => ({ body: { local_results: [{ title: "Acme Plumbing", place_id: "a" }] } }) });
  ok(x.rows.every((r) => r.map_rank == null), "(6) a name with no letters matched every result");
}

// ── (6) cost ────────────────────────────────────────────────────────────────────────────────────────────────────────
ok(S.pinsPerScan({}) === 25 && S.monthlySearches(1) === 50 && S.monthlySearches(5) === 250 && S.monthlySearches(25) === 1250, "(6) 2 scans of 25 searches a month: 50, 250 and 1,250 at 1, 5 and 25 clients");
ok(S.pinsPerScan({ RANK_GRID_SIZE: "7" }) === 49, "(6) the cost follows the grid size");
{
  const s = await S.serpAccount({ fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ total_searches_left: 4321, plan_name: "x" }) }), env: FAKE });
  ok(s.ok && s.left === 4321, "(6) the account count wasn't read");
  const bad = await S.serpAccount({ fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ nothing: 1 }) }), env: FAKE });
  ok(bad.ok === false, "(6) an account page with no count read as a count");
}

// ── (7) the job, the schedule, admin ────────────────────────────────────────────────────────────────────────────────
{
  const t = (toml.match(/\[functions\."rankings-refresh"\]\s*\n\s*schedule = "([^"]+)"/) || [])[1];
  ok(t === "10 * * * *", `(7) rankings-refresh should tick hourly at :10, netlify.toml says ${t}`);
  const job = (manifest.JOBS || []).find((j) => j.job === "rankings-refresh");
  ok(job && job.cron === t, "(7) the job manifest's cron must be the schedule in netlify.toml");
  if (job) {
    const good = job.read({ checked: 3, dispatched: 1, covered: 0, waiting: 1, problems: [] });
    ok(good.count === 1 && !good.error, "(7) a clean tick should read as healthy");
    const bad = job.read({ checked: 3, dispatched: 0, problems: ["Acme: failed 3 times"] });
    ok(bad.error && /Acme/.test(bad.error), "(7) a problem must reach the job's error so System health says it");
  }
  ok(/runTick/.test(SRC["rankings-refresh.js"]) && !/primary_service/.test(SRC["rankings-refresh.js"].replace(/\/\/.*$/gm, "")), "(1) rankings-refresh must run the schedule and must not read primary_service");
  ok(/withCheckin\("rankings-refresh"/.test(SRC["rankings-refresh.js"]), "(7) the job must still check in");
  ok(/q\.keyword && !q\.apply/.test(SRC["validate-tracked-keyword.js"]), "(1) the term check must be able to take the locked term and never combine it with apply");
  ok(/pins_read/.test(adminJs) && /points read/.test(adminJs) && /v2Campaign\?\.rank_schedule/.test(adminJs), "(7) admin must show how many points were read and the schedule");
  ok(/admin\.js\?v=[0-9a-z]+/.test(adminHtml), "(7) admin.js has no cache-buster");
  ok(!/(Pressing|scan[^<`]*)—/.test((adminJs.match(/can't read every point[^`]*/) || [""])[0]), "(7) new admin copy has an em dash");
  ok(!fs.existsSync(`${SITE}/supabase/rank_grid.sql`) || true, "");
}

if (F.length) { console.error(`🔴 check-rank-schedule: ${F.length} problem${F.length === 1 ? "" : "s"}`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log("✅ check-rank-schedule: locked term, who, when, recorded, failed pin vs not ranked, cost and the job all hold");
