#!/usr/bin/env node
// check-rating-history-is-written.mjs — EVERY ACTIVE CLIENT WITH GOOGLE CONNECTED GETS ONE RATING SNAPSHOT A DAY, IN THE CLOUD (master map Tier 1, 11-11).
//
// 🔒 WHY. client_gbp_snapshots feeds the rating charts (portal.js loadPortalGbpSnapshots, admin's rating chart, admin-preview-read) and was written
// only by the Mac scraper scripts at onboarding (onboard-client.mjs, bulk-onboard.mjs). A client onboarded in the portal never got a row, so the
// history never started (master audit 11-11, §1 #10 and §7). The website's daily metrics job (metrics-daily-refresh, a Netlify schedule) now
// writes the day's row through _gbp-snapshot.js. This gate holds:
//   1  the pure rules: a pull's numbers are reused; a pull Google refused is a refusal; 0 reviews is measured only on a 200; no rating stays null
//   2  one client, one day: today's row is looked for first, the write is an upsert on (client_id, snapshot_date, source), read back
//   3  a Google refusal (or a sign-in that failed) writes NOTHING and is said; a client with no profile connected is skipped, never written
//   4  only active clients: archived clients and the acceptance walk's test clients are never written
//   5  the real nightly handler, Google and Supabase FAKED: a client with no GA4/GSC still gets its snapshot; a refusal reaches the run's reply
//      and System health's note (_job-manifest.js), never a row
//   6  the rows expire: client_gbp_snapshots is still a 30-day purge target (_gbp-purge.js profile_snapshots)
// Nothing here reaches Google or the database. Exit 0 holds · 1 broken · 2 can't tell.
import { createRequire } from "node:module";
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const F = []; const fail = (m) => F.push(m);
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const req = createRequire(`${FN}/x.js`);

let route = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => (route ? route(String(url), init) : realFetch(url, init));
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "s", URL: "https://site.test",
  LANDING_AUTO_RUN: "off", LISTINGS_AUTO_RUN: "off", WEBSITE_AUTO_RUN: "", GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "sec" });

let S, H, M, P;
try { S = req("./_gbp-snapshot.js"); } catch (e) { idk(`_gbp-snapshot.js did not load: ${e.message}`); }
try { H = req("./metrics-daily-refresh.js").handler; } catch (e) { idk(`metrics-daily-refresh.js did not load: ${e.message}`); }
try { M = req("./_job-manifest.js"); P = req("./_gbp-purge.js"); } catch (e) { idk(`the job manifest or the purge did not load: ${e.message}`); }

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const TODAY = "2026-11-11", NOW = Date.parse(`${TODAY}T06:00:00Z`);
const OAUTH = { client_id: "c1", refresh_token: "r", access_token: "a", access_token_expires_at: new Date(Date.now() + 3600e3).toISOString(), gbp_location_id: "locations/9", gbp_account_id: "accounts/1" };

/** A fake for takeDaily's d: records every call. google = [status, body] | "throw"; have = rows already today; back = what the upsert returns (fn of the row). */
function fakes({ google = [200, { totalReviewCount: 12, averageRating: 4.75 }], have = [], back = (row) => [row], token = async () => "tok" } = {}) {
  const calls = { google: [], writes: [], reads: [] };
  const d = {
    now: () => NOW, token,
    fetch: async (url) => { calls.google.push(String(url)); if (google === "throw") throw new Error("socket hang up"); return res(...google); },
    supa: async (path, init = {}) => {
      if ((init.method || "GET") === "GET") { calls.reads.push(path); return have; }
      const row = JSON.parse(init.body); calls.writes.push({ path, init, row }); return back(row);
    },
  };
  return { d, calls };
}

// ── 1 · pure rules ──
{
  const p0 = S.fromPull({ reviewCount: 0, averageRating: null }, {});
  if (!p0 || p0.measured !== true || p0.review_count !== 0 || p0.rating !== null) fail(`1 a pull that measured 0 reviews must be measured 0 with no rating: ${JSON.stringify(p0)}`);
  const pr = S.fromPull(null, { gbp_reviews: "403" });
  if (!pr || pr.measured !== false || !/403/.test(pr.said)) fail(`1 a pull Google refused must be a refusal that names it: ${JSON.stringify(pr)}`);
  if (S.fromPull({ reviewCount: null }, {}) !== null) fail("1 a pull that read no reviews must ask again (null), never count as measured");
  if (S.SOURCE !== "gbp_api" || S.TABLE !== "client_gbp_snapshots") fail("1 the row's source or table moved");
}

// ── 2 + 3 · takeDaily ──
{
  // the pull's numbers: one write, no Google call
  let f = fakes();
  let r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled: { gbp: { reviewCount: 7, averageRating: 4.2 }, errors: {} }, d: f.d });
  const w = f.calls.writes[0];
  if (!r.taken || r.review_count !== 7 || r.rating !== 4.2) fail(`2 a pull's numbers did not become today's snapshot: ${JSON.stringify(r)}`);
  if (f.calls.google.length) fail("2 a pull that already read the reviews must not read Google a second time");
  if (!w || !/^\/client_gbp_snapshots\?on_conflict=client_id,snapshot_date,source$/.test(w.path)) fail(`2 the write is not an upsert on (client_id, snapshot_date, source): ${w && w.path}`);
  if (!w || !/merge-duplicates/.test(String(w.init.headers && w.init.headers.Prefer)) || !/return=representation/.test(String(w.init.headers && w.init.headers.Prefer))) fail("2 the upsert must merge duplicates and return the row to read back");
  if (!w || w.row.snapshot_date !== TODAY || w.row.source !== "gbp_api" || w.row.client_id !== "c1" || w.row.review_count !== 7 || w.row.rating !== 4.2) fail(`2 the row's columns are not the readers' columns: ${JSON.stringify(w && w.row)}`);
  if (w && ("photos_count" in w.row)) fail("2 photos_count is not read here, so it must not be written (never 0)");
  if (!f.calls.reads.some((p) => p.includes("client_id=eq.c1") && p.includes(`snapshot_date=eq.${TODAY}`) && p.includes("source=eq.gbp_api"))) fail("2 today's row is not looked for before the write");

  // already taken today: nothing read from Google, nothing written
  f = fakes({ have: [{ id: "x" }] });
  r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled: null, d: f.d });
  if (!r.already || f.calls.google.length || f.calls.writes.length) fail(`2 a second run on the same day must change nothing: ${JSON.stringify(r)} google ${f.calls.google.length} writes ${f.calls.writes.length}`);

  // no pull: one review read of the owner's own profile
  f = fakes();
  r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled: null, d: f.d });
  if (!r.taken || r.review_count !== 12 || r.rating !== 4.8) fail(`2 the review read's numbers did not become the snapshot (12 reviews, 4.8): ${JSON.stringify(r)}`);
  if (!f.calls.google.some((u) => u.startsWith("https://mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews"))) fail(`2 the review read is not the owner's own v4 reviews: ${f.calls.google.join(" ")}`);

  // 200 with totalReviewCount left out = 0 measured; no rating = null
  f = fakes({ google: [200, {}] });
  r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled: null, d: f.d });
  if (!r.taken || r.review_count !== 0 || r.rating !== null) fail(`2 Google's answer with no count (zero reviews) must be 0 measured and no rating: ${JSON.stringify(r)}`);

  // refusals: nothing written, the reason said
  for (const [why, opts, pulled] of [["a 403", { google: [403, { error: { message: "The caller does not have permission" } }] }, null],
    ["a 429", { google: [429, { error: { message: "Quota exceeded" } }] }, null], ["no answer", { google: "throw" }, null],
    ["a failed sign-in", { token: async () => { throw new Error("invalid_grant"); } }, null], ["a refused pull", {}, { gbp: null, errors: { gbp_reviews: "403" } }]]) {
    f = fakes(opts);
    r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled, d: f.d });
    if (f.calls.writes.length) fail(`3 ${why}: a row was written (a refusal must never be a zero or a reading)`);
    if (!r.refused || typeof r.refused !== "string" || r.refused.length < 10) fail(`3 ${why}: the refusal is not said: ${JSON.stringify(r)}`);
  }
  // not connected: skipped, nothing read, nothing written
  f = fakes();
  r = await S.takeDaily({ clientId: "c1", oauth: { client_id: "c1", refresh_token: "r", gbp_location_id: "", gbp_account_id: "" }, pulled: null, d: f.d });
  if (!r.skipped || f.calls.google.length || f.calls.writes.length || f.calls.reads.length) fail(`3 a client with no Google profile connected must be skipped: ${JSON.stringify(r)}`);
  // a write that does not read back is not taken
  f = fakes({ back: () => [] });
  r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled: null, d: f.d });
  if (r.taken || !r.error) fail(`2 a write that did not read back must not count as taken: ${JSON.stringify(r)}`);
  f = fakes({ back: (row) => [{ ...row, review_count: row.review_count + 1 }] });
  r = await S.takeDaily({ clientId: "c1", oauth: OAUTH, pulled: null, d: f.d });
  if (r.taken) fail("2 a row that read back with a different count must not count as taken");
}

// ── 4 · only active clients ──
{
  if (!S.isActive({ id: "a", status: "active" }) || !S.isActive({ id: "b", status: "onboarding", source: "manual_admin" })) fail("4 an active client is not snapshotted");
  if (S.isActive({ id: "c", status: "archived" }) || S.isActive({ id: "d", status: "active", archived_at: "2026-10-01T00:00:00Z" })) fail("4 an archived client must not be snapshotted");
  if (S.isActive({ id: "e", status: "active", source: "test:acceptance-walk-month2" })) fail("4 the acceptance walk's test clients must not be snapshotted");
}

// ── 5 · the real nightly handler, faked ──
async function nightly({ google, clients = [{ id: "c1", status: "active", source: "manual_admin" }], oauth = [OAUTH] }) {
  const calls = { google: [], writes: [] };
  route = async (url, init) => {
    const m = (init.method || "GET").toUpperCase();
    if (url.startsWith("https://sb.test/rest/v1/client_google_oauth?select=*&refresh_token=not.is.null")) return res(200, oauth);
    if (url.startsWith("https://sb.test/rest/v1/clients?select=id,status,archived_at,source")) return res(200, clients);
    if (url.startsWith("https://sb.test/rest/v1/client_gbp_snapshots") && m === "GET") return res(200, []);
    if (url.startsWith("https://sb.test/rest/v1/client_gbp_snapshots") && m === "POST") { const row = JSON.parse(init.body); calls.writes.push(row); return res(201, [row]); }
    if (url.startsWith("https://mybusiness.googleapis.com/")) { calls.google.push(url); return res(...google); }
    if (url.startsWith("https://oauth2.googleapis.com/")) return res(200, { access_token: "tok", expires_in: 3600 });
    if (url.startsWith("https://sb.test/")) return res(200, m === "GET" ? [] : "");
    if (url.startsWith("https://site.test/")) return res(200, {});
    return res(404, { error: `no route ${url}` });
  };
  let out;
  try { out = await H({ headers: { "x-internal-secret": "s" }, body: "{}" }); }
  finally { route = null; }
  let body; try { body = JSON.parse(out.body); } catch { body = {}; }
  return { status: out.statusCode, body, calls };
}
{
  const job = (M.JOBS || M.MANIFEST || M.jobs || Object.values(M).find(Array.isArray) || []).find((x) => x && x.job === "metrics-daily-refresh");
  if (!job || typeof job.read !== "function") idk("the metrics job is not in the manifest");
  // a client with no GA4 or Search Console: the metrics pull is skipped, the snapshot still happens
  let n = await nightly({ google: [200, { totalReviewCount: 3, averageRating: 5 }] });
  if (n.status !== 200) fail(`5 the nightly job did not answer 200 (${n.status})`);
  const rs = n.body.rating_snapshots;
  if (!rs || rs.taken !== 1 || n.calls.writes.length !== 1 || n.calls.writes[0].review_count !== 3) fail(`5 a client with no GA4/GSC got no rating snapshot: ${JSON.stringify(rs)} writes ${JSON.stringify(n.calls.writes)}`);
  const note1 = String((job.read(n.body) || {}).note || "");
  if (!/rating snapshots: 1 kept today/.test(note1)) fail(`5 System health's note does not say the snapshot was kept: "${note1}"`);
  // Google refuses: no row, said in the reply and in System health's note
  n = await nightly({ google: [403, { error: { message: "The caller does not have permission" } }] });
  if (n.calls.writes.length) fail("5 a Google refusal wrote a snapshot row");
  if (!n.body.rating_snapshots || n.body.rating_snapshots.refused !== 1 || !(n.body.rating_snapshots.clients || []).some((c) => /403/.test(String(c.refused || "")))) fail(`5 the refusal is not said on the run: ${JSON.stringify(n.body.rating_snapshots)}`);
  const note2 = String((job.read(n.body) || {}).note || "");
  if (!/1 refused by Google/.test(note2)) fail(`5 System health's note does not say Google refused: "${note2}"`);
  // archived and test clients: never written, never read from Google for this
  n = await nightly({ google: [200, { totalReviewCount: 3 }], clients: [{ id: "c1", status: "archived" }] });
  if (n.calls.writes.length || n.calls.google.length) fail("5 an archived client got a snapshot (or a Google read for one)");
  n = await nightly({ google: [200, { totalReviewCount: 3 }], clients: [{ id: "c1", status: "active", source: "test:acceptance-walk-new-client" }] });
  if (n.calls.writes.length) fail("5 a test client got a snapshot");
}

// ── 6 · the rows expire ──
{
  const t = (P.TARGETS || []).find((x) => x.table === "client_gbp_snapshots");
  if (!t || t.dateCol !== "snapshot_date" || t.filter) fail("6 client_gbp_snapshots is no longer a whole-table 30-day purge target (its rows are Business Profile content)");
  const src = fs.readFileSync(`${FN}/_gbp-snapshot.js`, "utf8");
  if (!/client_gbp_snapshots/.test(src)) fail("6 the snapshot writer no longer names its table");
}

if (F.length) { console.error(`✗ rating history: ${F.length} problem(s)`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✓ rating history: one snapshot a day for every active connected client, in the cloud; refusals said, never written; rows expire at 30 days");
