#!/usr/bin/env node
// check-the-review-count-is-read.mjs — the daily review count is read for every client who can be read, from the
// client's own Google profile first, and a client it could not read FAILS the run.
//
// 🔒 WHY (2026-10-15). RGA's review series stopped on 09-16: the Places key answers 403 ("The caller does not have
// permission"), the refresher treated it as a plain row error, and the daily runner exited 0 for a month — so step 12's
// "reviews since" line never showed, correctly, because nothing was measured. Now a CONNECTED client is read from Google
// itself (v4 reviews: totalReviewCount, the owner's own number), Places is only the fallback, a snapshot that didn't
// save is not "stored", and the runner exits 1 on any client it could not read. Google and the database are FAKED.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SCRAPER_COPY_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const F = []; const fail = (m) => F.push(m);

let route = null;
globalThis.fetch = async (url, init = {}) => route(String(url), init);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", QUO_WEBHOOK_TOKEN: "t", INTERNAL_FN_SECRET: "t", GOOGLE_PLACES_API_KEY: "p" });
let H;
try { H = createRequire(`${SITE}/netlify/functions/`)("./refresh-review-metrics.js").handler; }
catch (e) { console.error(`⚠️  INDETERMINATE — the refresher did not load: ${e.message}`); process.exit(2); }

const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const FRESH = new Date(Date.now() + 3600e3).toISOString();
async function run({ connected, v4, places, snapStatus = 201 }) {
  const calls = [];
  route = async (url, init) => {
    calls.push({ url, method: init.method || "GET", body: init.body });
    if (url.startsWith("https://sb.test/rest/v1/clients?")) return res(200, [{ id: "c1", business_name: "Acme", workspace_id: "w", google_place_id: places ? "pl1" : null }]);
    if (url.startsWith("https://sb.test/rest/v1/client_google_oauth")) return res(200, connected ? [{ client_id: "c1", refresh_token: "r", access_token: "a", access_token_expires_at: FRESH, gbp_location_id: "locations/9", gbp_account_id: "accounts/1" }] : []);
    if (url.startsWith("https://sb.test/rest/v1/client_state_snapshots?")) return res(200, []);
    if (url.startsWith("https://sb.test/rest/v1/client_state_snapshots")) return res(snapStatus, snapStatus < 300 ? "" : "bad column");
    if (url.startsWith("https://sb.test/rest/v1/clients?id=eq.c1")) return res(204, "");
    if (url.includes("mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews")) return res(...v4);
    if (url.includes("places.googleapis.com")) return res(...places);
    return res(404, { error: "no route " + url });
  };
  const r = await H({ headers: { "x-internal-secret": "t" }, queryStringParameters: { token: "t" } });
  return { out: JSON.parse(r.body), calls };
}
const DENIED = [403, { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }];
const posted = (calls) => calls.filter((c) => c.method === "POST" && /client_state_snapshots$/.test(c.url)).map((c) => JSON.parse(c.body));

{ // connected: Google's own count, Places never asked
  const { out, calls } = await run({ connected: true, v4: [200, { totalReviewCount: 7, averageRating: 4.86 }], places: DENIED });
  const p = posted(calls)[0];
  if (out.stored !== 1 || p?.payload?.review_count !== 7 || p?.payload?.rating !== 4.9 || p?.payload?.source !== "google_profile") fail(`a connected client isn't read from its own Google profile (${JSON.stringify(p?.payload)})`);
  if (calls.some((c) => c.url.includes("places.googleapis.com"))) fail("Places was asked for a client Google already answered");
}
{ // connected, zero reviews: v4 omits the field — measured 0, not missing
  const { calls } = await run({ connected: true, v4: [200, {}], places: DENIED });
  const p = posted(calls)[0];
  if (p?.payload?.review_count !== 0 || p?.payload?.rating !== null) fail("zero reviews on the profile isn't stored as a measured 0 with no rating");
}
{ // both refused: an error that is NOT indeterminate, nothing stored
  const { out, calls } = await run({ connected: true, v4: DENIED, places: DENIED });
  const r = out.results[0];
  if (posted(calls).length || out.stored !== 0 || !r?.error || r.indeterminate) fail(`a client neither source could read looks stored, or reads as a quota blip (${JSON.stringify(r)})`);
}
{ // not connected: Places is the fallback
  const { calls } = await run({ connected: false, places: [200, { userRatingCount: 3, rating: 5, displayName: { text: "Acme" } }] });
  if (posted(calls)[0]?.payload?.source !== "places" || posted(calls)[0]?.payload?.review_count !== 3) fail("a client not connected isn't read from Places");
}
{ // a snapshot that didn't save is not stored
  const { out } = await run({ connected: true, v4: [200, { totalReviewCount: 7 }], places: DENIED, snapStatus: 400 });
  if (out.stored !== 0 || !out.results[0]?.error) fail("a snapshot the database refused counts as stored");
}

// the runner fails on a client it could not read
let runner = "";
try { runner = fs.readFileSync(`${SCRAPER}/scripts/refresh-review-metrics.mjs`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read the runner"); process.exit(2); }
if (!/const unread = \(res\.results \|\| \[\]\)\.filter\(\(r\) => r\.error && !r\.indeterminate\);/.test(runner) || !/if \(unread\.length\) \{ console\.error\(`🔴 \$\{unread\.length\} client\(s\) have no review count today[^\n]*process\.exit\(1\); \}/.test(runner)) fail("the daily runner exits 0 when a client's review count couldn't be read");

if (F.length) { console.error("🔴 the review count isn't read the way it must be:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the review count is read from the client's own Google profile when connected (0 measured, Places not asked), Places only as the fallback, a client neither source can read is an error (not a quota blip) and fails the daily run, and a snapshot the database refused isn't counted as stored");
