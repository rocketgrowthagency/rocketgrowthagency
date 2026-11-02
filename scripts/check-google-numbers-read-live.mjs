#!/usr/bin/env node
// check-google-numbers-read-live.mjs : Google's numbers are READ LIVE, and a failure is never a zero
// (approved report_live_google_30_day_v2, Part A: the shared reader and everything a person sees).
//
// WHY. Google's Business Profile API policy keeps stored content to 30 days and says it "cannot be manipulated or aggregated". So a report, card or
// email asks Google at the moment it is drawn, through ONE reader (_google-live.js). The danger is not the happy path. It is the three quiet failures:
//   1. Google is slow or down and the screen shows 0 ("nobody called") instead of "Couldn't read Google just now."
//   2. a screen still reads the stored column (or the old "We keep Google's numbers for 30 days" note) and shows a number Google did not give today
//   3. the read hangs, or hammers Google, or writes to it.
// This runs the REAL reader, the REAL door and the REAL email builder against a faked Google and a faked database (no network, no browser), and reads the
// screens' source for the stored-column reads that must be gone. Exit 0 = true, 1 = a number or a word is wrong, 2 = could not tell.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = []; const fail = (m) => F.push(m);
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };

Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "sec" });
const req = createRequire(`${SITE}/netlify/functions/`);
let route = null;
globalThis.fetch = async (url, init = {}) => route(String(url), init);
const res = (status, body, headers = {}) => ({ ok: status < 300, status, headers: { get: (k) => headers[String(k).toLowerCase()] ?? null }, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

let LIVE, NUM, FN, EMAIL;
try { LIVE = req("./_google-live.js"); NUM = req("./_google-numbers.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — the reader did not load: ${e.message}`); process.exit(2); }

const NOW = Date.parse("2026-11-02T12:00:00Z");
const FRESH = new Date(NOW + 3600e3).toISOString();
const OAUTH = { client_id: "c1", refresh_token: "r", access_token: "a", access_token_expires_at: FRESH, gbp_location_id: "locations/9", gbp_account_id: "accounts/1" };
const days = (from, to) => { const out = []; for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) { const d = new Date(t); out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }); } return out; };
const METRICS = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"];
// one series per metric: 1 a day, except CALL_CLICKS on 2026-09-05, which Google returns with NO value (a zero day)
const perfBody = ({ from = "2026-09-01", to = "2026-10-30", drop = [] } = {}) => ({
  multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: METRICS.filter((m) => !drop.includes(m)).map((m) => ({ dailyMetric: m, timeSeries: { datedValues: days(from, to).map((d) => (m === "CALL_CLICKS" && d.month === 9 && d.day === 5 ? { date: d } : { date: d, value: "1" })) } })) }],
});
const stars = ["FIVE", "FOUR", "FIVE"];
const reviewPages = (n = 120) => { // 120 reviews over 3 pages of 50/50/20; 7 created in October, the rest in September
  const all = Array.from({ length: n }, (_, i) => ({ reviewId: "g" + i, starRating: stars[i % 3], createTime: i < 7 ? `2026-10-0${(i % 9) + 1}T10:00:00Z` : `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z` }));
  return (token) => { const start = token ? Number(token) : 0; const slice = all.slice(start, start + 50); return { totalReviewCount: n, averageRating: 4.7, reviews: slice, ...(start + 50 < n ? { nextPageToken: String(start + 50) } : {}) }; };
};

// ── a faked Google. `o` switches each part on or off, and records every request ──
function google(o = {}) {
  const log = [];
  route = async (url, init) => {
    log.push({ url, method: init.method || "GET", signal: !!init.signal });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return o.token ? o.token() : res(200, { access_token: "tok", expires_in: 3600 });
    if (url.startsWith("https://sb.test/rest/v1/client_google_oauth") && (init.method || "GET") === "PATCH") return res(204, "");
    if (url.includes("fetchMultiDailyMetricsTimeSeries")) return o.perf ? o.perf(url, log) : res(200, perfBody());
    if (url.includes("/searchkeywords/impressions/monthly")) return o.kw ? o.kw(url) : res(200, { searchKeywordsCounts: [{ searchKeyword: "Acme Plumbing", insightsValue: { value: "30" } }, { searchKeyword: "plumber near me", insightsValue: { value: "50" } }, { searchKeyword: "tiny", insightsValue: { threshold: "15" } }] });
    if (url.includes("mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews")) return o.reviews ? o.reviews(url) : (() => { const tk = new URL(url).searchParams.get("pageToken"); return res(200, o.pages(tk)); })();
    return res(404, { error: "no route " + url });
  };
  return log;
}
const supaNone = async () => [];
const deps = (extra = {}) => ({ now: () => NOW, sleep: async () => {}, rand: () => 0.5, ...extra });
const run = (oauth = OAUTH, from = "2026-09-01", to = "2026-10-31", extra = {}) => LIVE.readGoogleLive({ supa: supaNone, oauth, from, to, businessName: "Acme Plumbing", deps: deps(extra) });

// ── 1 · the happy path: real numbers, per month, with a status for every field ──
{
  const log = google({ pages: reviewPages() });
  const r = await run();
  const sep = r.months["2026-09-01"], oct = r.months["2026-10-01"];
  if (!sep || !oct) fail(`the reader didn't return both months (${Object.keys(r.months)})`);
  else {
    // September: 30 days at 1, but CALL_CLICKS on the 5th came back with NO value: a zero day, counted as 0 because Google said 200
    if (sep.values.calls !== 29 || sep.status.calls !== "ok") fail(`a day Google returns with no value on a 200 isn't counted as 0 (calls ${sep.values.calls}, want 29)`);
    if (sep.values.website_clicks !== 30 || sep.values.directions !== 30) fail(`clicks/directions aren't summed per month (${sep.values.website_clicks}, ${sep.values.directions})`);
    if (sep.values.impressions !== 120) fail(`impressions aren't the four surfaces summed (${sep.values.impressions}, want 120)`);
    if (sep.values.actions !== 29 + 30 || sep.status.actions !== "ok") fail(`actions isn't calls + website clicks (${sep.values.actions})`);
    if (oct.values.website_clicks !== 30) fail(`October should hold the 30 days Google answered (${oct.values.website_clicks})`);   // 10-01..10-30
    if (sep.values.searches_direct !== 30 || sep.values.searches_discovery !== 50) fail(`searches aren't split by the business name, with "under 15" keywords left out (${sep.values.searches_direct}/${sep.values.searches_discovery})`);
    // reviews by createTime, from all 3 pages, counting only what is on Google today
    if (oct.values.new_reviews !== 7 || oct.status.new_reviews !== "ok") fail(`new reviews in October aren't counted by createTime (${oct.values.new_reviews}, want 7)`);
    if (oct.values.review_count !== 120 || sep.values.review_count !== 113) fail(`the review total by month isn't counted from every page (Oct ${oct.values.review_count}, Sep ${sep.values.review_count})`);
    if (!(oct.values.average_rating > 4 && oct.values.average_rating <= 5)) fail(`the rating isn't worked out from the stars (${oct.values.average_rating})`);
  }
  if (log.filter((c) => c.url.includes("/reviews")).length !== 3) fail("the review list wasn't read page by page (3 pages expected)");
  if (!/pageSize=50/.test(log.find((c) => c.url.includes("/reviews"))?.url || "")) fail("the review list isn't asked 50 at a time");
  const bad = log.filter((c) => c.method !== "GET" && !c.url.startsWith("https://oauth2.googleapis.com/token") && !/sb\.test/.test(c.url));
  if (bad.length) fail(`the reader wrote to Google: ${bad[0].method} ${bad[0].url.slice(0, 90)}`);
  if (log.some((c) => !c.signal)) fail("a request to Google has no time bound (no abort signal)");
  if (log.filter((c) => c.url.includes("fetchMultiDailyMetricsTimeSeries")).length !== 1) fail("the performance numbers for the whole range aren't ONE request");
}

// ── 2 · a failure is never a zero ──
{
  google({ pages: reviewPages(), perf: () => res(500, "boom") });
  const r = await run();
  for (const k of ["2026-09-01", "2026-10-01"]) for (const f of ["calls", "website_clicks", "directions", "impressions", "actions"]) {
    const m = r.months[k];
    if (m.values[f] !== null || m.status[f] !== "could_not_read") fail(`Google answering 500 shows ${f} ${k} as ${JSON.stringify(m.values[f])}/${m.status[f]} (want null / could_not_read)`);
  }
  if (r.months["2026-10-01"].status.new_reviews !== "ok") fail("a Performance failure took the reviews down with it (they are a separate read)");

  google({ pages: reviewPages(), perf: () => res(200, perfBody({ drop: ["CALL_CLICKS"] })) });
  const r2 = await run();
  if (r2.months["2026-09-01"].values.calls !== null || r2.months["2026-09-01"].status.calls !== "could_not_read") fail("a series Google did not return became a number (it is unknown, not 0)");
  if (r2.months["2026-09-01"].status.actions === "ok") fail("actions is ok although the calls behind it were not returned");
  if (r2.months["2026-09-01"].values.website_clicks !== 30) fail("one missing series took the others down");

  google({ pages: () => ({}), reviews: () => res(503, "down") });
  const r3 = await run();
  if (r3.months["2026-10-01"].values.review_count !== null || r3.months["2026-10-01"].status.review_count !== "could_not_read") fail("a reviews failure became a count");

  // a list we did not finish is not a count: page 2 fails
  const pg = reviewPages(); let n = 0;
  google({ reviews: (url) => (++n > 1 ? res(500, "x") : res(200, pg(new URL(url).searchParams.get("pageToken")))) });
  const r4 = await run();
  if (r4.months["2026-10-01"].status.new_reviews === "ok") fail("a half-read review list was counted");

  // a list that never ends is not a count either: the page limit stops it, and it isn't called ok
  google({ reviews: () => res(200, { totalReviewCount: 99999, averageRating: 4, reviews: [{ reviewId: "x", starRating: "FIVE", createTime: "2026-10-02T00:00:00Z" }], nextPageToken: "more" }) });
  const r4b = await run();
  if (r4b.months["2026-10-01"].status.review_count === "ok" || r4b.months["2026-10-01"].values.new_reviews !== null) fail("a review list that never finished was counted");

  // a review with no createTime: a past month cannot be worked out, so it is not guessed
  google({ pages: (tk) => ({ totalReviewCount: 2, averageRating: 5, reviews: [{ reviewId: "a", starRating: "FIVE" }, { reviewId: "b", starRating: "FIVE", createTime: "2026-10-02T00:00:00Z" }] }) });
  const r5 = await run();
  if (r5.months["2026-09-01"].status.review_count === "ok" || r5.months["2026-09-01"].status.new_reviews === "ok") fail("a past review count was guessed from reviews with no createTime");

  // a profile with no reviews: the total is 0 and there is no rating (not 0.0 stars)
  google({ pages: () => ({}) });
  const r6 = await run();
  const e = r6.months["2026-10-01"];
  if (e.values.review_count !== 0 || e.status.review_count !== "ok" || e.values.average_rating !== null) fail(`no reviews on a 200 should read 0 with no rating (${e.values.review_count}, ${e.values.average_rating})`);
}

// ── 3 · disconnected, not kept ──
{
  google({ pages: reviewPages() });
  for (const [label, oauth] of [["no sign-in row", null], ["no refresh key", { ...OAUTH, refresh_token: null }], ["no location", { ...OAUTH, gbp_location_id: null }]]) {
    const r = await run(oauth);
    if (r.state !== "disconnected" || Object.values(r.months).some((m) => Object.values(m.status).some((s) => s !== "disconnected") || Object.values(m.values).some((v) => v !== null))) fail(`${label}: not "disconnected" with no numbers`);
  }
  google({ pages: reviewPages(), token: () => res(400, { error: "invalid_grant" }) });
  const stale = await run({ ...OAUTH, access_token: null, access_token_expires_at: null });
  if (stale.state !== "disconnected") fail(`a revoked sign-in isn't "disconnected" (${stale.state})`);
  google({ pages: reviewPages(), token: () => res(500, { error: "backend_error" }) });
  const down = await run({ ...OAUTH, access_token: null, access_token_expires_at: null });
  if (down.state !== "could_not_read") fail(`Google's token endpoint being down isn't "could_not_read" (${down.state})`);

  // Google only answers from mid-September: the months before it are not kept, and a partial month is not shown as a total
  google({ pages: reviewPages(), perf: () => res(200, perfBody({ from: "2026-09-15" })) });
  const r = await run(OAUTH, "2026-08-01", "2026-10-31");
  if (r.months["2026-08-01"].status.calls !== "not_kept" || r.months["2026-08-01"].values.calls !== null) fail("a month before Google's data is not 'not_kept' with no number");
  if (r.months["2026-09-01"].status.calls !== "not_kept") fail("a month Google only half has is shown as a total");
  if (r.months["2026-10-01"].status.calls !== "ok") fail("the month Google fully has was lost when an older month was not kept");
}

// ── 4 · 429 is retried with backoff and jitter; the request is bounded in time ──
{
  const waits = []; let n = 0;
  google({ pages: reviewPages(), perf: () => (++n <= 2 ? res(429, "slow down", { "retry-after": "1" }) : res(200, perfBody())) });
  const r = await run(OAUTH, "2026-09-01", "2026-10-31", { sleep: async (ms) => { waits.push(ms); }, rand: () => 0.5 });
  if (r.months["2026-09-01"].status.calls !== "ok") fail("a 429 was not retried to a good answer");
  if (waits.length !== 2 || waits.some((w) => !(w >= 1000))) fail(`the 429 retries don't wait at least Retry-After (${JSON.stringify(waits)})`);
  if (new Set(waits).size === 1 && waits[0] === 1000) fail("the retry wait has no jitter");
  n = -100; waits.length = 0;
  google({ pages: reviewPages(), perf: () => res(429, "no") });
  const r2 = await run(OAUTH, "2026-09-01", "2026-10-31", { sleep: async (ms) => { waits.push(ms); } });
  if (r2.months["2026-09-01"].status.calls !== "could_not_read") fail("a 429 that never clears isn't could_not_read");
  if (waits.length > 3) fail(`retries aren't bounded (${waits.length})`);

  // a Google that never answers: the abort fires and it ends as could_not_read, quickly
  google({ pages: reviewPages(), perf: (url) => new Promise(() => {}) });
  const t0 = Date.now();
  route = ((inner) => async (url, init) => (url.includes("fetchMultiDailyMetricsTimeSeries") ? new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))) : inner(url, init)))(route);
  const r3 = await run(OAUTH, "2026-09-01", "2026-10-31", { requestMs: 150 });
  if (Date.now() - t0 > 5000) fail("a Google that never answers held the read for seconds");
  if (r3.months["2026-09-01"].status.calls !== "could_not_read") fail("a hung request isn't could_not_read");
}

// ── 5 · the 30-day cache is a fast path only; _gbp-keep decides; a NULL reads live ──
{
  const cols = (o = {}) => ({ gbp_calls: 11, gbp_website_clicks: 12, gbp_actions: 23, gbp_impressions: 99, gbp_directions: 5, gbp_searches_direct: 7, gbp_searches_discovery: 8, review_count: 40, new_reviews: 2, average_rating: 4.8, ...o });
  const world = (rows) => async (path) => {
    if (path.startsWith("/client_monthly_records")) return rows;
    if (path.startsWith("/client_google_oauth")) return [OAUTH];
    if (path.startsWith("/clients")) return [{ business_name: "Acme Plumbing" }];
    return [];
  };
  let log = google({ pages: reviewPages() });
  // October 2026 has not expired on 2026-11-02, and every field holds a value: no request to Google at all
  let r = await NUM.googleNumbers({ supa: world([{ reporting_month: "2026-10-01", ...cols() }]), clientId: "c1", months: ["2026-10"], now: new Date(NOW), deps: deps() });
  if (r.months["2026-10-01"].via !== "cache" || r.months["2026-10-01"].values.calls !== 11) fail("an unexpired month with every field set isn't served from the 30-day cache");
  if (log.some((c) => c.url.includes("googleapis.com") && !c.url.startsWith("https://sb.test"))) fail("the cache fast path still called Google");
  // a NULL in any one field: read live, and show Google's number, never nothing
  log = google({ pages: reviewPages() });
  r = await NUM.googleNumbers({ supa: world([{ reporting_month: "2026-10-01", ...cols({ gbp_searches_direct: null }) }]), clientId: "c1", months: ["2026-10"], now: new Date(NOW), deps: deps() });
  if (r.months["2026-10-01"].via !== "live" || r.months["2026-10-01"].values.website_clicks === 12) fail("a cached month with a NULL field wasn't read live");
  // an expired month is never taken from the table, even with every column set
  log = google({ pages: reviewPages() });
  r = await NUM.googleNumbers({ supa: world([{ reporting_month: "2026-08-01", ...cols() }]), clientId: "c1", months: ["2026-08"], now: new Date(NOW), deps: deps() });
  if (r.months["2026-08-01"].via !== "live" || r.months["2026-08-01"].values.calls === 11) fail("an expired month was served from the stored columns");
  // the table cannot be read at all: still answered live
  r = await NUM.googleNumbers({ supa: async (p) => { if (p.startsWith("/client_monthly_records")) throw new Error("down"); return world([])(p); }, clientId: "c1", months: ["2026-10"], now: new Date(NOW), deps: deps() });
  if (!r.months["2026-10-01"]) fail("the cache failing lost the answer");
  // nothing can be read at all: every month is still present, as could_not_read, never invented
  r = await NUM.googleNumbers({ supa: async () => { throw new Error("down"); }, clientId: "c1", months: ["2026-10"], now: new Date(NOW), deps: deps() });
  if (!r.months["2026-10-01"] || Object.values(r.months["2026-10-01"].values).some((v) => v !== null) || r.months["2026-10-01"].status.calls !== "could_not_read") fail("a total outage invented a number or lost the month");
  // liveRows never throws and never lets a stored copy through
  const rows = await NUM.liveRows({ supa: async () => { throw new Error("down"); }, clientId: "c1", rows: [{ reporting_month: "2026-10-01", gbp_calls: 11, form_leads: 4 }], timeoutMs: 2000, deps: deps() });
  if (rows[0].gbp_calls !== null || rows[0]._google.gbp_calls !== "could_not_read" || rows[0].form_leads !== 4) fail("liveRows kept a stored Google number, or dropped RGA's own");
}

// ── 6 · the door: staff-or-owner, no secret out, read only ──
{
  const door = read("netlify/functions/portal-google-numbers.js");
  if (!/requirePortalOwnerOrWorkspace\(event, clientId\)/.test(door)) fail("portal-google-numbers doesn't use requirePortalOwnerOrWorkspace");
  if (!/if \(gate\.error\) return gate\.error;/.test(door) || door.indexOf("requirePortalOwnerOrWorkspace(event") > door.indexOf("googleNumbers({")) fail("the door reads Google before it checks who is asking");
  if (/method:\s*["'](POST|PATCH|PUT|DELETE)/.test(door.replace(/async function supa[\s\S]*?\n}\n/, ""))) fail("the door writes");
  // run it, with the sign-in check faked, and look for a key in the answer
  const authPath = req.resolve("./_auth.js");
  const realAuth = req("./_auth.js");
  let asked = null;
  req.cache[authPath].exports = { ...realAuth, requirePortalOwnerOrWorkspace: async (event, id) => { asked = id; return event.headers.authorization ? { ok: true } : { error: { statusCode: 401, headers: {}, body: "{}" } }; } };
  delete req.cache[req.resolve("./portal-google-numbers.js")];
  FN = req("./portal-google-numbers.js");
  google({ pages: reviewPages() });
  const CID = "11111111-1111-1111-1111-111111111111";
  const prev = route;
  route = async (url, init) => {
    if (url.startsWith("https://sb.test/rest/v1/client_monthly_records")) return res(200, []);
    if (url.startsWith("https://sb.test/rest/v1/client_google_oauth")) return res(200, [{ ...OAUTH, client_id: CID, refresh_token: "SECRET-REFRESH", access_token: "SECRET-ACCESS" }]);
    if (url.startsWith("https://sb.test/rest/v1/clients")) return res(200, [{ business_name: "Acme Plumbing" }]);
    return prev(url, init);
  };
  const no = await FN.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, months: ["2026-10"] }) });
  if (no.statusCode !== 401) fail(`no sign-in reached Google's numbers (${no.statusCode})`);
  const bad = await FN.handler({ httpMethod: "POST", headers: { authorization: "Bearer x" }, body: JSON.stringify({ client_id: CID, months: ["nonsense"] }) });
  if (bad.statusCode !== 400) fail(`a bad month list wasn't refused (${bad.statusCode})`);
  const ok = await FN.handler({ httpMethod: "POST", headers: { authorization: "Bearer x" }, body: JSON.stringify({ client_id: CID, months: ["2026-10"] }) });
  if (ok.statusCode !== 200 || asked !== CID) fail(`the door didn't answer a signed-in request for its own client (${ok.statusCode})`);
  if (/SECRET-|refresh_token|access_token/.test(ok.body)) fail("a key or token left the door");
  const j = JSON.parse(ok.body || "{}");
  if (j.source !== "From Google, today" || !j.words || j.words.could_not_read !== "Couldn't read Google just now." || j.words.disconnected !== "Reconnect Google to see these." || j.words.not_kept !== "Google doesn't keep this month anymore.") fail(`the door doesn't carry the approved source label and words (${JSON.stringify(j.words)})`);
  req.cache[authPath].exports = realAuth;
}

// ── 7 · the email: a snapshot; a failed read says so, never 0, and never blocks ──
{
  EMAIL = req("./send-monthly-report.js");
  const CLIENT = { business_name: "Acme", primary_contact_name: "Pat Smith", call_tracking_attributed: true };
  const base = { reporting_month: "2026-10-01", grid_top3_coverage_pct: 40, keywords_top3_count: 2, keywords_tracked_count: 5, form_leads: 3, total_calls: 2 };
  const G = { new_reviews: "ok", gbp_calls: "ok", gbp_website_clicks: "ok" };
  const built = await EMAIL.buildReport({ client: CLIENT, current: { ...base, new_reviews: 4, gbp_calls: 17, gbp_website_clicks: 9, _google: G }, prior: { reporting_month: "2026-09-01", gbp_calls: 10, _google: { gbp_calls: "ok" } } });
  if (!built || !/Call-button taps[\s\S]{0,400}17/.test(built.html) || !/snapshot/i.test(built.html)) fail("an email with live numbers doesn't show them and say it is a snapshot");
  if (/We keep Google's numbers/.test(built.html + built.text)) fail("the email still carries the 30-day note");
  const failed = await EMAIL.buildReport({ client: CLIENT, current: { ...base, new_reviews: null, gbp_calls: null, gbp_website_clicks: null, _google: { new_reviews: "could_not_read", gbp_calls: "could_not_read", gbp_website_clicks: "disconnected" } }, prior: {} });
  if (!failed) fail("a failed Google read blocked the whole email (RGA's own numbers still go)");
  else {
    if (!/Couldn(?:'|&#39;|&#x27;)t read Google just now\./.test(failed.html) || !/Reconnect Google to see these\./.test(failed.html)) fail("a failed live read isn't said in the email in Google's words");
    if (/Call-button taps[^<]*<\/td>\s*<td[^>]*>[^<]*\b0\b/.test(failed.html)) fail("a failed live read is shown as 0 in the email");
    if (!/Top-3 coverage[\s\S]{0,300}40/.test(failed.html)) fail("RGA's own numbers vanished from the email when Google failed");
  }
  const onlyGoogle = await EMAIL.buildReport({ client: CLIENT, current: { reporting_month: "2026-10-01", gbp_calls: null, _google: { gbp_calls: "could_not_read", new_reviews: "could_not_read", gbp_website_clicks: "could_not_read" } }, prior: {} });
  if (onlyGoogle) fail("an email that is only apologies was built");
}

// ── 8 · the screens: no stored Google column, no 30-day note, the approved words ──
{
  const gl = read("shared/google-live.js");
  for (const w of ["Couldn't read Google just now.", "Reconnect Google to see these.", "Google doesn't keep this month anymore.", "From Google, today", "Counts reviews still on Google"]) if (!gl.includes(w)) fail(`shared/google-live.js lacks "${w}"`);
  for (const f of ["shared/google-live.js", "netlify/functions/_google-live.js", "netlify/functions/_google-numbers.js", "netlify/functions/portal-google-numbers.js"]) if (/—/.test(read(f).replace(/\/\/.*$/gm, ""))) fail(`${f} has an em dash in its code or copy`);
  const rep = read("portal/report/report.js"), por = read("portal/portal.js"), adm = read("admin/admin.js");
  const sel = (src, re) => (re.exec(src) || [""])[0];
  if (/\.select\("[^"]*(gbp_calls|gbp_impressions|review_count|new_reviews|average_rating)/.test(sel(rep, /async function loadMonthlyRecords[\s\S]*?\n\}\n/))) fail("the report still SELECTs Google's columns from the table");
  if (/\.select\("[^"]*(gbp_calls|gbp_impressions|new_reviews|average_rating)/.test(sel(por, /async function loadPortalMonthlyRecords[\s\S]*?\n\}\n/))) fail("the portal still SELECTs Google's columns from the table");
  if (/\.select\("[^"]*(gbp_calls|gbp_impressions|new_reviews|average_rating)/.test(sel(adm, /async loadAggregateStats[\s\S]*?\n    \},/))) fail("the admin overview still SELECTs Google's columns from the table");
  if (!/strip\(monthlyRows\)/.test(rep) || !/\.fill\(\{ rows: monthlyRows/.test(rep)) fail("the report doesn't blank the stored columns and read live");
  if (!/RGAGoogleLive\.strip\(byClient\[id\]\)/.test(por) || !/startGoogleLive\(portalClients, monthlyRecords\)/.test(por)) fail("the client portal doesn't blank the stored columns and read live");
  if (!/RGAGoogleLive\.strip\(months\)/.test(adm) || !/RGAGoogleLive\.fill\(\{ rows: months/.test(adm)) fail("the admin KPI tab doesn't blank the stored columns and read live");
  for (const [n, src] of [["report", rep], ["portal", por]]) if (/GBP_KEEP_NOTE|gbpMonthExpired\(|We keep Google's numbers for 30 days/.test(src)) fail(`the ${n} still has the 30-day note path`);
  if (/GBP_KEEP_NOTE\)/.test(sel(adm, /function renderKpiHeadline[\s\S]*?\n\}\n/))) fail("the admin KPI tiles still show the 30-day note");
  for (const p of ["portal/index.html", "portal/report/index.html", "admin/index.html"]) if (!/src="\/shared\/google-live\.js/.test(read(p))) fail(`${p} doesn't load shared/google-live.js`);
  const send = read("netlify/functions/send-monthly-report.js");
  if (/noGoogleCompare|gbpKeep|_gbp-keep/.test(send)) fail("the monthly email still has the 30-day compare path");
  if (!/_google-numbers/.test(send) || !/liveRows/.test(send)) fail("the monthly email doesn't read Google live at send");
  for (const f of ["netlify/functions/_month1-report.js", "netlify/functions/_monthly-value.js"]) if (/_gbp-keep/.test(read(f))) fail(`${f} still reads the 30-day keep`);
  if (!/_google-numbers/.test(read("netlify/functions/portal-monthly-value.js")) || !/liveRows/.test(read("netlify/functions/flow-execute.js"))) fail("the monthly value card or the report builders don't read live");
  const prr = read("netlify/functions/portal-review-requests.js");
  if (!/liveReviews/.test(prr) || !/newSince/.test(prr)) fail("the reviews card and 'reviews since' aren't read from Google today");
  if (!/"portal-google-numbers": \{ load/.test(read("netlify/functions/admin-preview-read.js")) || !/fn === "portal-google-numbers" && post && onlyKeys\(b, \["client_id", "months"\]\)/.test(read("shared/preview-guard.js"))) fail("the admin preview can't reach the live door (admin-preview-read's list + the guard's classification)");
  // a month Google didn't answer is never the other side of a change, on every screen
  if (!/GLV\(\)\.usable\(opts\.priorRow, opts\.col\)/.test(por)) fail("the portal's tiles compare against a month Google didn't answer");
  if (!/GL\(\)\.usable\(google\.priorRow, google\.col\)/.test(rep)) fail("the report's chips compare against a month Google didn't answer");
  if (!/GLv\.usable\(state\.kpiPrior \|\| \{\}, gcol\)/.test(adm)) fail("the admin KPI tiles compare against a month Google didn't answer");
  // the low-pace flag only speaks from a count Google gave today
  if (!/window\.RGAGoogleLive\.status\(cur, "new_reviews"\) === "ok"\)\) flags\.push/.test(adm)) fail("the admin's low review pace flag speaks from a blank or failed read");
  // the reader is the ONE place that calls Google for these, built on _metrics.js's request and _google-token.js's sign-in
  const live = read("netlify/functions/_google-live.js");
  if (!/fetchGbpDaily/.test(live) || !/googleAccessToken/.test(live) || /refreshGrant|oauth2\.googleapis/.test(live)) fail("the reader isn't built on _metrics.js and _google-token.js alone");
  if (!/function fetchGbpDaily/.test(read("netlify/functions/_metrics.js")) || !/await fetchGbpDaily\(/.test(read("netlify/functions/_metrics.js"))) fail("pullGBP doesn't share the date-range request with the reader (it was forked)");
  if (/method:\s*["'](POST|PATCH|PUT|DELETE)/.test(live)) fail("the reader makes a write call");
  if (/GBP_PURGE_ENABLED\s*[:=]\s*["']?(1|true)/.test(read("netlify/functions/_gbp-purge.js"))) fail("the purge was turned on");
}

if (F.length) { console.error(`❌ check-google-numbers-read-live: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ check-google-numbers-read-live: Google's numbers are read live through one reader (per month, a status per field, 429 retried, bounded, read only); a failure is could_not_read / disconnected / not_kept and never a 0; the 30-day cache is a fast path _gbp-keep decides and a NULL reads live; the door is staff-or-owner and returns no key; the email says so when Google fails and still sends; no screen reads a stored Google column");
