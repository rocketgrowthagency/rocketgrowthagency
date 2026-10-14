#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-client-can-remove-their-own-duplicate.mjs
//
// 🔒 WHY (2026-10-13, approved duplicate_listing_auto_remove_v1): Chris, at RGA's own accidental duplicate, *"i want this
// to be something if we find for a client the portal can do automatically for them once the issue is found."* Removing a
// Google listing cannot be undone, so every safety rule is proven by RUNNING the real flow against a stub Google,
// Supabase and SerpApi — never by reading the code and hoping.
// HOLDS:
//   1. Found in the signed-in account, no reviews → the client's tap DELETEs exactly that location, reads it back (404),
//      records "removed", clears the token, and step 11 shows the token-free summary.
//   2. Not in that account → "not_found", no token kept, nothing deleted.
//   3. The listing we keep (the connected account's location, or the stored place key) is never deleted.
//   4. A duplicate with reviews → "has_reviews" (merged instead), nothing deleted; reviews unknown → nothing deleted.
//   5. An expired sign-in → "expired", nothing deleted. Google's "can't delete via API" flag → "refused".
//   6. The token is only ever stored encrypted, never in the summary the client reads; the table is service-only (RLS on,
//      no policies); the callback branch sits AFTER the signature + expiry checks; only the client can press Remove.
// exit 0 = a client can remove their own duplicate and nothing else · 1 = a rule can be broken · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);

Object.assign(process.env, { SUPABASE_URL: "https://stub.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "stub", SUPABASE_ANON_KEY: "stub-anon", INTERNAL_FN_SECRET: "gate-secret",
  GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "csec", GOOGLE_OAUTH_REDIRECT_URI: "https://stub.site.invalid/cb", SERPAPI_KEY: "serp" });

const R = req("./_listing-removal.js");
const FLOW = req("./_listing-removal-flow.js");
const CID = "11111111-1111-4111-8111-111111111111";
const DUPE = { title: "Rocket Growth Agency", phone: "(424) 396-8499", place_id: "ChIJ-dupe", data_id: "0xaaa:0xbbb" };
const KEPT_LOC = "locations/KEPT";

// ── a world: Supabase rows + a Google account + SerpApi ──
function world({ accountHas = "dupe", reviews = 0, canDelete = true, reviewsError = false, deleteNoop = false } = {}) {
  const db = {
    client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { status: "pending", outcome_data: { verdict: "duplicate", duplicates: [DUPE], client_answer: { answer: "mine" } } } } } }],
    clients: [{ id: CID, business_name: "Rocket Growth Agency", gbp_url: "https://www.google.com/maps/place/x/@34.0,-118.4,14z/data=!3m1!4b1!4m6!3m5!1s0xccc:0xddd!8m2" }],
    client_google_oauth: [{ client_id: CID, gbp_location_id: KEPT_LOC }],
    client_listing_removals: [],
  };
  const deleted = [], googleGone = new Set();
  const locs = accountHas === "dupe" ? [{ name: "locations/DUPE", title: DUPE.title, phoneNumbers: { primaryPhone: DUPE.phone }, metadata: { placeId: DUPE.place_id, canDelete, mapsUri: "https://maps.google.com/?cid=1" } }]
    : accountHas === "kept" ? [{ name: KEPT_LOC, title: "Main", metadata: { placeId: DUPE.place_id, mapsUri: "https://maps.google.com/?cid=2" } }]
    // "none": the account manages a DIFFERENT listing — matching must be by place id, never "the first one there"
    : [{ name: KEPT_LOC, title: "Main", metadata: { placeId: "ChIJ-kept", mapsUri: "https://maps.google.com/?cid=2" } }];
  const J = (b, s = 200) => new Response(b == null ? null : JSON.stringify(b), { status: s });
  const fetchStub = async (url, init = {}) => {
    const u = new URL(String(url)); const m = (init.method || "GET").toUpperCase();
    if (u.hostname === "oauth2.googleapis.com") return J({ access_token: "ya29.SECRET-TOKEN", expires_in: 3600 });
    if (u.hostname === "openidconnect.googleapis.com") return J({ email: "chris.owner@gmail.com" });
    if (u.hostname === "mybusinessaccountmanagement.googleapis.com") return J({ accounts: [{ name: "accounts/A1" }] });
    if (u.hostname === "mybusinessbusinessinformation.googleapis.com") {
      if (/\/accounts\/A1\/locations$/.test(u.pathname)) return J({ locations: locs });
      const name = u.pathname.replace(/^\/v1\//, "");
      if (m === "DELETE") { deleted.push(name); if (!deleteNoop) googleGone.add(name); return J({}); }
      return googleGone.has(name) ? J({ error: "NOT_FOUND" }, 404) : J({ name });
    }
    if (u.hostname === "serpapi.com") return reviewsError ? J({ error: "boom" }, 500) : J({ place_results: { place_id: DUPE.place_id, reviews } });
    if (u.hostname === "stub.supabase.invalid") {
      const table = u.pathname.split("/").pop(); const rows = db[table] || (db[table] = []);
      const q = [...u.searchParams].filter(([k, v]) => /^eq\./.test(v)); const match = (r) => q.every(([k, v]) => String(r[k]) === v.slice(3));
      let list = rows.filter(match);
      if (u.searchParams.get("order") === "created_at.desc") list = list.slice().reverse();
      if (m === "GET") return J(list);
      if (m === "POST") { const b = JSON.parse(init.body); const row = { id: `r${rows.length + 1}`, created_at: new Date().toISOString(), ...b }; rows.push(row); return J([row], 201); }
      if (m === "PATCH") { const b = JSON.parse(init.body); list.forEach((r) => Object.assign(r, b)); return J(list); }
    }
    return J({ error: `unexpected ${u.hostname}` }, 599);
  };
  return { db, deleted, fetchStub };
}
const run = async (w, fn) => { const real = globalThis.fetch; globalThis.fetch = w.fetchStub; try { return await fn(); } finally { globalThis.fetch = real; } };
const state = { kind: "dup_owner", client_id: CID, place_id: DUPE.place_id, ts: Date.now() };
const errorPage = (m) => ({ statusCode: 400, body: m });
const summary = (w) => w.db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].owner_removal || null;

try {
  // 1 · the happy path
  {
    const w = world();
    const cb = await run(w, () => FLOW.handleCallback("code", state, errorPage));
    const row = w.db.client_listing_removals[0];
    if (cb.statusCode !== 302 || !/dup_owner=found/.test(cb.headers?.Location || "")) fail(`a found duplicate doesn't send the client back to "found" (${cb.statusCode} ${cb.headers?.Location || cb.body})`);
    if (!row || row.status !== "found" || row.location_name !== "locations/DUPE") fail(`the attempt isn't recorded as found on the right location (${JSON.stringify(row && { s: row.status, l: row.location_name })})`);
    if (!row?.token_enc || JSON.stringify(w.db).includes("SECRET-TOKEN")) fail("the Google sign-in is stored in plain text somewhere (it must only be kept encrypted)");
    // a token that doesn't decrypt is a token that isn't encrypted — a FAIL, not "can't tell"
    let back = null; try { back = row?.token_enc ? R.decrypt(row.token_enc, "gate-secret") : null; } catch { back = null; }
    if (row?.token_enc && back !== "ya29.SECRET-TOKEN") fail("the stored sign-in isn't the encrypted token (it doesn't decrypt back)");
    if (summary(w)?.status !== "found" || JSON.stringify(summary(w)).includes("token")) fail("step 11's summary isn't the token-free \"found\"");
    if (w.deleted.length) fail("something was deleted before the client's tap");
    const out = await run(w, () => FLOW.removeNow(CID, "owner@example.com"));
    if (out.code !== 200 || w.deleted.join() !== "locations/DUPE") fail(`the tap doesn't remove exactly the duplicate (${out.code}, deleted ${w.deleted.join() || "nothing"})`);
    if (row.status !== "removed" || row.token_enc) fail("after removal the attempt isn't \"removed\" with the token cleared");
    if (summary(w)?.status !== "removed") fail("step 11 doesn't show it removed");
    const again = await run(w, () => FLOW.removeNow(CID, "x"));
    if (again.code !== 409 || w.deleted.length !== 1) fail("a second tap removes again (it must need a new sign-in)");
  }
  // 2 · not in that account
  {
    const w = world({ accountHas: "none" });
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    const row = w.db.client_listing_removals[0];
    if (row?.status !== "not_found" || row?.token_enc) fail(`an account that doesn't manage it isn't "not_found" with no token kept (${row?.status})`);
    const out = await run(w, () => FLOW.removeNow(CID, "x"));
    if (out.code === 200 || w.deleted.length) fail("a not-found attempt can still remove something");
  }
  // 3 · the listing we keep
  {
    const w = world({ accountHas: "kept" });
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    await run(w, () => FLOW.removeNow(CID, "x"));
    if (w.deleted.length) fail("the listing we KEEP was deleted");
    if (w.db.client_listing_removals[0]?.status === "found") fail("the listing we keep was offered for removal");
  }
  // 4 · reviews
  for (const [opt, want] of [[{ reviews: 4 }, "has_reviews"], [{ reviewsError: true }, "failed"]]) {
    const w = world(opt);
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    await run(w, () => FLOW.removeNow(CID, "x"));
    if (w.deleted.length) fail(`a duplicate with ${opt.reviews ? "reviews" : "unknown reviews"} was deleted (it must be merged / not touched)`);
    if (w.db.client_listing_removals[0]?.status !== want) fail(`a duplicate with ${opt.reviews ? "reviews" : "unknown reviews"} reads "${w.db.client_listing_removals[0]?.status}", not "${want}"`);
  }
  // 5 · expired sign-in, Google's own refusal flag
  {
    const w = world();
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    w.db.client_listing_removals[0].token_expires_at = new Date(Date.now() - 1000).toISOString();
    const out = await run(w, () => FLOW.removeNow(CID, "x"));
    if (out.code !== 409 || w.deleted.length || w.db.client_listing_removals[0].status !== "expired") fail("an expired sign-in still removes (or isn't recorded as expired)");
    const w2 = world({ canDelete: false });
    await run(w2, () => FLOW.handleCallback("code", state, errorPage));
    await run(w2, () => FLOW.removeNow(CID, "x"));
    if (w2.deleted.length || w2.db.client_listing_removals[0]?.status !== "refused") fail("Google's \"can't delete via API\" flag is ignored");
  }
  // 7 · the duplicate changed between the sign-in and the tap → the tap re-checks and removes nothing
  {
    const w = world();
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    w.db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data.duplicates = [{ ...DUPE, place_id: "ChIJ-other" }];
    await run(w, () => FLOW.removeNow(CID, "x"));
    if (w.deleted.length) fail("the tap removes a listing step 11 no longer names (the rules must be checked again at the tap)");
  }
  // 8 · Google says yes but the listing is still there → not "removed"
  {
    const w = world({ deleteNoop: true });
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    const out = await run(w, () => FLOW.removeNow(CID, "x"));
    if (out.code === 200 || w.db.client_listing_removals[0].status === "removed") fail("a removal Google didn't actually do reads as removed (it must be read back)");
  }
  // 9 · the client changed their answer after the listing was found → the tap removes nothing
  {
    const w = world();
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    delete w.db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data.client_answer;
    const out = await run(w, () => FLOW.removeNow(CID, "x"));
    if (w.deleted.length || out.code === 200) fail("a removal still happens after the client changed their answer");
  }
  // 10 · WHICH LISTING TO KEEP (approved duplicate_listing_card_v3, 2026-10-14): the rule, run on every case.
  //      More reviews first; the same (or none) → the connected account; never the phone. null = couldn't read, never 0.
  {
    const { keepChoice, reviewsFrom } = req("./_gbp-duplicate.js");
    for (const [own, dup, dec, wantCase, wantKeep, wantMerge, wantWait, re] of [
      [{ reviews: 0, in_connected_account: true }, { reviews: 0 }, null, "none", "own", false, false, /neither listing has reviews, so nothing is lost/],
      [{ reviews: 23 }, { reviews: 0 }, null, "own_reviews", "own", false, false, /it has your 23 reviews/],
      [{ reviews: 1 }, { reviews: 0 }, null, "own_reviews", "own", false, false, /your 1 review\./],
      [{ reviews: 2 }, { reviews: 31 }, null, "flip", "other", false, true, /it has 31 of your reviews/],
      [{ reviews: 2 }, { reviews: 31 }, "ours", "flip_ours", "own", true, false, /merge it in/],
      [{ reviews: 23 }, { reviews: 4 }, null, "both", "own", true, false, /its 4 reviews move over/],
      [{ reviews: 5 }, { reviews: 5 }, null, "both", "own", true, false, /both have 5 reviews/],
      [{ reviews: null }, { reviews: 0 }, null, "unknown", "own", false, false, /couldn't read the review counts/],
      [{ reviews: 0 }, { reviews: null }, null, "unknown", "own", false, false, /couldn't read the review counts/],
      [null, null, null, "unknown", "own", false, false, /couldn't read the review counts/],
    ]) {
      const c = keepChoice(own, dup, dec);
      const tag = `own ${own ? own.reviews : "none"} vs second ${dup ? dup.reviews : "none"}${dec ? ` (${dec})` : ""}`;
      if (c.case !== wantCase || c.keep !== wantKeep || c.merge !== wantMerge || c.waits_on_rga !== wantWait) fail(`the keep rule is wrong for ${tag}: ${JSON.stringify({ case: c.case, keep: c.keep, merge: c.merge, waits: c.waits_on_rga })}`);
      if (!re.test(c.reason)) fail(`the reason for ${tag} doesn't say why ("${c.reason}")`);
      if (/phone/i.test(c.reason)) fail(`the reason for ${tag} mentions the phone number (never the deciding fact)`);
    }
    // the reason never claims a connected account it didn't measure
    for (const acct of [null, false, undefined]) if (/Google account you connected/.test(keepChoice({ reviews: 0, in_connected_account: acct }, { reviews: 0 }).reason)) fail(`the reason says "the Google account you connected" when that wasn't measured true (${acct})`);
    // Google's Maps data OMITS the count at zero: a row we read with no count = 0, no row = null (couldn't read)
    if (reviewsFrom(null).reviews !== null || reviewsFrom({ title: "x" }).reviews !== 0 || reviewsFrom({ reviews: 412, rating: 4.9 }).reviews !== 412 || reviewsFrom({ reviews: 412, rating: 4.9 }).rating !== 4.9) fail("reviewsFrom confuses \"no count on a listing we read\" (0) with \"no listing read\" (null)");
  }

  // 11 · the nightly scan SAVES the facts the card compares: the real scan, against a stub Maps + Google account
  for (const [oauth, ownRev, dupRev, want, googleFails] of [[true, 0, 31, { own: 0, dup: 31, ownAcct: true, dupAcct: false, kase: "flip" }],
                                               [false, 0, 0, { own: 0, dup: 0, ownAcct: null, dupAcct: null, kase: "none" }],
                                               // connected, but Google's account call fails → "not checked", NEVER "not in your account"
                                               [true, 0, 0, { own: 0, dup: 0, ownAcct: null, dupAcct: null, kase: "none" }, true]]) {
    const db = {
      clients: [{ id: CID, business_name: "Rocket Growth Agency", google_place_id: "ChIJ-kept", primary_market: null, workspace_id: "w1",
        gbp_url: "https://www.google.com/maps/place/x/@34.0,-118.4,14z/data=!3m1!4b1!4m6!3m5!1s0xccc:0xddd!8m2" }],
      client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: {} } }],
      client_google_oauth: oauth ? [{ client_id: CID, refresh_token: "rt" }] : [],
      profiles: [{ id: "u1", workspace_id: "w1" }],
    };
    const row = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    const J = (b, st = 200) => new Response(b == null ? null : JSON.stringify(b), { status: st });
    const fetchStub = async (url, init = {}) => {
      const u = new URL(String(url)); const m = (init.method || "GET").toUpperCase();
      if (u.hostname === "serpapi.com") return J({ local_results: [
        // 🔑 like Google's real data (checked 2026-10-14): a listing with no reviews has NO reviews/rating fields
        row({ title: "Rocket Growth Agency", data_id: "0xccc:0xddd", place_id: "ChIJ-kept", reviews: ownRev || undefined, rating: ownRev ? 5 : undefined }),
        row({ title: "Rocket Growth Agency", data_id: "0xaaa:0xbbb", place_id: "ChIJ-dupe", phone: "(424) 396-8499", type: "Marketing agency",
          reviews: dupRev || undefined, rating: dupRev ? 4.9 : undefined, gps_coordinates: { latitude: 34.05, longitude: -118.45 } }),
      ] });
      if (u.hostname === "oauth2.googleapis.com") return J({ access_token: "ya29.x", expires_in: 3600 });
      if (u.hostname === "mybusinessaccountmanagement.googleapis.com") return googleFails ? J({ error: "quota" }, 429) : J({ accounts: [{ name: "accounts/A1" }] });
      if (u.hostname === "mybusinessbusinessinformation.googleapis.com") return J({ locations: [{ name: "locations/K", metadata: { placeId: "ChIJ-kept" } }] });
      if (u.hostname === "stub.supabase.invalid") {
        if (u.pathname === "/auth/v1/user") return J({ id: "u1", email: "admin@rga.test" });
        const table = u.pathname.split("/").pop(); const rows = db[table] || (db[table] = []);
        const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v)); const match = (r) => q.every(([k, v]) => String(r[k]) === v.slice(3));
        const list = rows.filter(match);
        if (m === "GET") return J(list);
        if (m === "PATCH") { const b = JSON.parse(init.body); list.forEach((r) => Object.assign(r, b)); return J(list); }
        if (m === "POST") { const b = JSON.parse(init.body); rows.push(b); return J([b], 201); }
      }
      if (u.hostname === "stub.site.invalid") return J({ ok: true, finding: { verdict: "duplicate" } });
      return J({ error: `unexpected ${u.hostname}` }, 599);
    };
    const real = globalThis.fetch; globalThis.fetch = fetchStub;
    try {
      const scan = req("./gbp-duplicate-scan.js");
      const res = await scan.handler({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret" }, body: JSON.stringify({ client_id: CID }) });
      const od = db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"]?.outcome_data || {};
      const dup = (od.duplicates || [])[0] || {};
      const tag = googleFails ? "when Google's account check fails" : oauth ? "with a connected account" : "with no Google connection";
      if (res.statusCode !== 200 || od.verdict !== "duplicate") fail(`the scan didn't store a duplicate ${tag} (${res.statusCode} ${od.verdict})`);
      if (od.own_listing?.reviews !== want.own || dup.reviews !== want.dup) fail(`the scan doesn't save both listings' reviews ${tag} (own ${od.own_listing?.reviews}, second ${dup.reviews}) — a listing with no count must read 0`);
      if (od.own_listing?.in_connected_account !== want.ownAcct || dup.in_connected_account !== want.dupAcct) fail(`the scan's "in the connected account" is wrong ${tag} (own ${od.own_listing?.in_connected_account}, second ${dup.in_connected_account}; no connection must be null, never false)`);
      if (od.keep?.case !== want.kase) fail(`the scan doesn't store the rule's choice ${tag} (${od.keep?.case})`);
      if (oauth && !googleFails && (!dup.gps || dup.gps.lat !== 34.05)) fail("the scan doesn't keep the second listing's location (RGA can't make it the main listing)");

      // 12 · RGA's choice (case 3): only when the second has more reviews; "ours" merges; "reviews" moves the client's listing
      if (oauth && !googleFails) {
        process.env.URL = "https://stub.site.invalid";
        const keep = req("./gbp-duplicate-keep.js");
        const call = (choice) => keep.handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, choice }) });
        const r1 = await call("ours");
        const od1 = db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data;
        if (r1.statusCode !== 200 || od1.keep_decision?.choice !== "ours" || od1.keep?.case !== "flip_ours" || od1.keep?.merge !== true) fail(`"Keep ours" doesn't record the choice and turn the second listing into a merge (${r1.statusCode} ${od1.keep?.case})`);
        await call("clear");
        if (db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data.keep?.case !== "flip") fail("Undo doesn't put the card back to \"Waits on RGA\"");
        const r2 = await call("reviews");
        const c = db.clients[0];
        if (r2.statusCode !== 200 || c.google_place_id !== "ChIJ-dupe" || !/!1s0xaaa:0xbbb/.test(c.gbp_url) || !/@34\.05/.test(c.gbp_url)) fail(`"Keep the one with the reviews" doesn't make it the client's main listing in a form the scan can read (${r2.statusCode} ${c.google_place_id} ${c.gbp_url})`);
        const sw = db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].listing_switch;
        if (!sw || sw.from?.place_id !== "ChIJ-kept" || sw.to?.place_id !== "ChIJ-dupe") fail("a switch isn't recorded with what it was (from / to)");
      }
    } finally { globalThis.fetch = real; }
  }
  // 11b · a KNOWN duplicate the name search no longer returns is re-checked by id: that path must save the same facts
  {
    const db = { clients: [{ id: CID, business_name: "Rocket Growth Agency", google_place_id: "ChIJ-kept", primary_market: null,
        gbp_url: "https://www.google.com/maps/place/x/@34.0,-118.4,14z/data=!3m1!4b1!4m6!3m5!1s0xccc:0xddd!8m2" }],
      client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "duplicate", duplicates: [{ place_id: "ChIJ-dupe", data_id: "0xaaa:0xbbb", title: "Rocket Growth Agency" }] } } } } }],
      client_google_oauth: [] };
    const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st });
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => { const u = new URL(String(url));
      if (u.hostname === "serpapi.com") return u.searchParams.get("type") === "place"
        ? J({ place_results: { place_id: "ChIJ-dupe", title: "Rocket Growth Agency", reviews: 7, rating: 4.2, gps_coordinates: { latitude: 34.06, longitude: -118.46 } } })
        : J({ local_results: [{ title: "Rocket Growth Agency", data_id: "0xccc:0xddd", place_id: "ChIJ-kept", reviews: 3, rating: 5 }] });
      const t = u.pathname.split("/").pop(); const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v)); const rows = (db[t] || []).filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
      if ((init.method || "GET") === "PATCH") rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return J(rows); };
    try {
      const scan = req("./gbp-duplicate-scan.js");
      await scan.handler({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret" }, body: JSON.stringify({ client_id: CID }) });
      const od = db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data;
      const d = (od.duplicates || [])[0] || {};
      if (od.verdict !== "duplicate" || d.reviews !== 7 || d.rating !== 4.2 || !d.gps || d.gps.lat !== 34.06 || od.own_listing?.reviews !== 3 || od.keep?.case !== "flip")
        fail(`the re-check of a known duplicate doesn't save its reviews and location (${JSON.stringify({ v: od.verdict, r: d.reviews, gps: d.gps, own: od.own_listing?.reviews, k: od.keep?.case })})`);
    } finally { globalThis.fetch = real; }
  }
  // a case the rule already decides is refused: the endpoint can't move a client's listing on a whim
  {
    const db = { clients: [{ id: CID, workspace_id: "w1", google_place_id: "ChIJ-kept" }], profiles: [{ id: "u1", workspace_id: "w1" }],
      client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "duplicate", own_listing: { reviews: 9 }, duplicates: [{ place_id: "ChIJ-dupe", data_id: "0xa:0xb", reviews: 0, gps: { lat: 1, lng: 2 } }] } } } } }] };
    const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st });
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => { const u = new URL(String(url)); if (u.pathname === "/auth/v1/user") return J({ id: "u1", email: "a@b" });
      const t = u.pathname.split("/").pop(); const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v)); const rows = (db[t] || []).filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
      if ((init.method || "GET") === "PATCH") { rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); } return J(rows); };
    try {
      const keep = req("./gbp-duplicate-keep.js");
      const r = await keep.handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, choice: "reviews" }) });
      if (r.statusCode !== 409 || db.clients[0].google_place_id !== "ChIJ-kept") fail(`"Keep the one with the reviews" works when OUR listing has more reviews (${r.statusCode} ${r.body}) — it must be refused`);
    } finally { globalThis.fetch = real; }
  }
} catch (e) { console.error(`⚠️  INDETERMINATE — running the flow threw: ${e.stack || e.message}`); process.exit(2); }

// ── 6 · the static rules ──
const cb = code("netlify/functions/oauth-google-callback.js");
const sigAt = cb.indexOf("crypto.timingSafeEqual(gotBuf, expBuf)"), expAt = cb.indexOf("Date.now() - Number(state.ts) > 10 * 60 * 1000"), brAt = cb.indexOf('if (state.kind === "dup_owner")');
if (brAt < 0) fail("the callback has no dup_owner branch (the sign-in would be treated as a Google connection)");
else if (sigAt < 0 || expAt < 0 || brAt < sigAt || brAt < expAt) fail("the dup_owner branch runs before the state's signature / expiry checks");
const init = code("netlify/functions/gbp-duplicate-owner-init.js");
for (const [re, msg] of [
  [/if \(answer !== "mine"\) return json\(409/, "the sign-in can start before the client says the duplicate is theirs"],
  [/if \(!target\) return json\(409/, "the sign-in can start with no duplicate to remove"],
  [/url\.searchParams\.set\("access_type", "online"\)/, "the one-time sign-in asks for a refresh token (it must be online-only)"],
  [/url\.searchParams\.set\("prompt", "select_account"\)/, "the client can't choose which Google account signs in"],
  [/business\.manage/, "the sign-in doesn't ask for Business Profile access"],
]) if (!re.test(init)) fail(msg);
const rm = code("netlify/functions/gbp-duplicate-remove.js");
if (!/const gate = await requirePortalOwner\(event, clientId\);/.test(rm) || /requireWorkspace/.test(rm)) fail("someone other than the client can press Remove (the client's tap IS the approval)");
const sql = read("docs/supabase/RGA_CLIENT_LISTING_REMOVALS_2026-10-13.sql");
if (!/enable row level security/i.test(sql) || /create policy/i.test(sql)) fail("the removals table isn't service-only (RLS on, no policies)");
const sum = R.summaryOf({ status: "found", account_email: "chris.owner@gmail.com", token_enc: "x", title: "t" });
if ("token_enc" in sum || JSON.stringify(sum).includes("chris.owner@")) fail("the client-readable summary carries the token or the full email");
const portal = code("portal/portal.js");
// the card (approved duplicate_listing_card_v2): routed to dupCard; Remove only when found; the question asked without the masked owner
if (!/if \(a\.key === "m1\.audit\.gbp_duplicate" && \(a\.details \|\| \[\]\)\.length\) return dupCard\(a\);/.test(portal)) fail("the duplicate isn't drawn by its own card (dupCard)");
const dc = (/function dupCard\(a\) \{[\s\S]*?\n\}\n/.exec(portal) || [""])[0];
if (!dc) fail("dupCard is gone (re-read this gate)");
if ((dc.match(/data-dup-remove/g) || []).length !== 1 || !/if \(r && r\.status === "found"\) \{[\s\S]{0,500}data-dup-remove/.test(dc)) fail("the Remove button can show in a state other than found");
if (!/<p class="dl-q">Did you \(or someone at your business\) create the second one\?<\/p>/.test(dc)) fail("a client is never asked if the second listing is theirs");
for (const [re, msg] of [
  // v3 (duplicate_listing_card_v3): Keep vs Remove WITH their facts, then the reason, then the question
  [/\$\{pair\(keepCard\(undefined, factsOf\(own, true\)\), dropCard\(undefined, true, factsOf\(d, false\)\)\)\}\s*\$\{reason\}\s*<div class="dl-ask"/, "the question isn't preceded by Keep vs Remove (with their facts) and the reason why (the approved card)"],
  [/You sign in with the Google account that made it, then remove it here in one tap\./, "\"Yes, it's ours\" doesn't say what happens next"],
  [/We ask Google to remove it\. Nothing else is needed from you\./, "\"No, it isn't\" doesn't say what happens next"],
  [/\{ done: true, stateLabel: "Waits on Google" \}/, "a removed duplicate doesn't turn into the green done card"],
]) if (!re.test(dc)) fail(msg);

// the card shows BOTH listings (the approved mockup), and the question counts as the client's step
if (!/kept: key === "m1\.audit\.gbp_duplicate" \? kept : null,/.test(code("netlify/functions/portal-deliverables.js"))) fail("the duplicate card isn't given the listing we keep");

// a pressed button that waits on the server shows a spinner (Chris: "a progress circle"), and the Keep link opens by place id
// each waiting button, by name (a count passed with one of them missing once a fourth was added)
for (const [re, which] of [
  [/box\.querySelectorAll\("button"\)\.forEach\(\(b\) => \{ b\.disabled = true; \}\);[\s\S]{0,200}btn\.classList\.add\("is-busy"\);/, "the answer buttons"],
  [/closest\("\[data-dup-owner-signin\]"\);\s*if \(!b\) return;\s*b\.disabled = true; b\.classList\.add\("is-busy"\);/, "Sign in with Google"],
  [/b\.textContent = "Removing…"; b\.classList\.add\("is-busy"\);/, "Remove the second listing"],
  [/closest\("\[data-ap-clear\]"\);\s*if \(!b\) return;\s*b\.disabled = true; b\.classList\.add\("is-busy"\);/, "Change my answer"],
]) if (!re.test(portal)) fail(`${which}: pressed, it sits there with no sign it's working (a spinner is required)`);
if (!/\.portal-button\.is-busy::before \{[^}]*animation: portal-spin/.test(read("portal/portal.css"))) fail("the busy button has no spinning ring");
if (!/maps_url: c\.google_place_id \? `https:\/\/www\.google\.com\/maps\/place\/\?q=place_id:/.test(code("netlify/functions/portal-deliverables.js"))) fail("the Keep listing's Maps link isn't by place id (the stored Maps URL opened a blank page)");

// "Sign in with Google" is the mockup's white button with Google's mark (Chris 2026-10-13: "i like the sign in with
// google from mockup"), not a blue primary; and its spinner replaces the mark, so the two never sit side by side
if (!/<button type="button" class="portal-button dl-go dl-google" data-dup-owner-signin>\$\{GOOGLE_G\}/.test(dc)) fail("\"Sign in with Google\" isn't the approved white button with Google's mark");
if (!/const GOOGLE_G = `<svg[^`]*fill="#EA4335"[^`]*fill="#4285F4"[^`]*fill="#FBBC05"[^`]*fill="#34A853"/.test(portal)) fail("Google's four-colour mark is gone from the sign-in button");
if (!/\.dl-google\.is-busy \.dl-g \{ display: none; \}/.test(read("portal/portal.css"))) fail("while signing in, the spinner and Google's mark show side by side");

// the way back ("is there a way to go back"): Change my answer, until something is removed; it cancels a pending removal
{
  const pd = code("netlify/functions/portal-deliverables.js");
  if (!/if \(answer === "clear"\) \{[\s\S]{0,200}status === "removed"\) return json\(409/.test(pd)) fail("\"Change my answer\" works even after the listing was removed");
  if (!/client_listing_removals\?client_id=eq\.\$\{clientId\}&status=eq\.found`, \{ method: "PATCH",\s*body: JSON\.stringify\(\{ status: "expired", token_enc: null/.test(pd)) fail("changing the answer leaves a pending removal (and its sign-in) usable");
  if (!/body: extra\.done \|\| extra\.rga \? body : \(a\.answer \? body \+ back : body\)/.test(portal) || !/data-ap-clear=/.test(portal)) fail("the duplicate card has no way back once answered");
}

// ── 13 · THE CARD IN A REAL BROWSER (approved duplicate_listing_card_v3): every case, rendered with portal.css, read back.
// A regex on the source passes while the screen is wrong; this reads what the client would read.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie
{
  let puppeteer = null;
  try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
  if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing, the card can't be rendered"); process.exit(2); }
  const src = read("portal/portal.js");
  const pick = (re) => { const m = re.exec(src); if (!m) { fail(`the card's code moved (${re.source.slice(0, 40)}): re-read this gate`); return ""; }
    let i = m.index, d = 0; for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } } return ""; };
  const g = /const GOOGLE_G = `[^`]*`;/.exec(src);
  const bundle = [g ? g[0] : "", pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), pick(/^function fmtDateShort\(/m), pick(/^function dupCard\(/m)].join("\n");
  const { keepChoice } = req("./_gbp-duplicate.js");
  const kept = { name: "Lone Star Drain & Plumbing", category: "Plumber", phone: "(512) 555-0142", maps_url: "https://maps.example/k" };
  const mk = (own, dup, dec = null, extra = {}) => ({ key: "m1.audit.gbp_duplicate", kept, own_listing: own,
    details: [{ name: "Lone Star Drain & Plumbing", category: "Plumber", phone: "(512) 555-0199", maps_url: "https://maps.example/d", ...dup }],
    keep: keepChoice(own, dup, dec), answer: null, ...extra });
  const CASES = {
    none:    mk({ reviews: 0, rating: null, in_connected_account: true }, { reviews: 0, rating: null, in_connected_account: false }),
    mine:    mk({ reviews: 23, rating: 4.8, in_connected_account: true }, { reviews: 0, rating: null, in_connected_account: false }),
    flip:    mk({ reviews: 2, rating: 5, in_connected_account: true }, { reviews: 31, rating: 4.9, in_connected_account: false }),
    both:    mk({ reviews: 23, rating: 4.8, in_connected_account: true }, { reviews: 4, rating: 4.5, in_connected_account: false }),
    unknown: mk({ reviews: null, rating: null, in_connected_account: null }, { reviews: null, rating: null, in_connected_account: null }),
  };
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(`<html><head><style>${read("portal/portal.css")}</style></head><body><div id="host"></div></body></html>`);
    await page.addScriptTag({ content: bundle });
    // DUP_SHOTS=<dir> saves each case as a PNG, for the box-by-box diff against the mockup
    if (process.env.DUP_SHOTS) for (const [name, a] of Object.entries(CASES)) {
      await page.evaluate((a) => { const c = dupCard(a); document.getElementById("host").innerHTML = `<div class="ap-item ap-action is-open${c.rga ? " is-rga" : ""}" style="background:#fff;border:1px solid #e3e3e3;border-radius:14px;padding:18px;margin:12px;max-width:860px"><p style="margin:0 0 8px;font:600 15px Inter,system-ui">${c.title} · ${c.stateLabel || c.eyebrow}</p><div class="ap-body">${c.body}</div></div>`; }, a);
      await page.screenshot({ path: `${process.env.DUP_SHOTS}/dupcard_${name}.png`, fullPage: true });
    }
    const R2 = await page.evaluate((cases) => {
      const out = {};
      for (const [name, a] of Object.entries(cases)) {
        const c = dupCard(a);
        const host = document.getElementById("host");
        host.innerHTML = `<div class="ap-item ap-action is-open${c.rga ? " is-rga" : ""}"><div class="ap-body">${c.body}</div></div>`;
        const facts = [...host.querySelectorAll(".dl-facts")].map((ul) => [...ul.querySelectorAll("li")].map((li) => `${li.className}:${li.innerText.trim()}`));
        const reason = host.querySelector(".dl-reason p")?.innerText.trim() || "";
        out[name] = { rga: !!c.rga, label: c.stateLabel || "", title: c.title, text: host.innerText, facts, reason,
          heads: [...host.querySelectorAll(".dl-h")].map((x) => x.textContent.trim()), // textContent: the CSS uppercases the label
          how: !!host.querySelector("details.dl-how") && !host.querySelector("details.dl-how").open,
          ask: !!host.querySelector("[data-ap-answer=mine]"), reasonBg: host.querySelector(".dl-reason") ? getComputedStyle(host.querySelector(".dl-reason")).backgroundColor : "" };
      }
      return out;
    }, CASES);
    const has = (k, txt) => R2[k].text.includes(txt);
    // every case: three facts under each listing, a reason that says why, "How we decide" closed, never the phone
    for (const [k, v] of Object.entries(R2)) {
      if (v.facts.length !== 2 || v.facts.some((f) => f.length !== 3)) fail(`case ${k}: each listing doesn't show its three facts (${JSON.stringify(v.facts)})`);
      if (!/^Why we keep the (first|second) one:/.test(v.reason)) fail(`case ${k}: no "Why we keep…" line (${v.reason})`);
      if (!v.how) fail(`case ${k}: "How we decide which one to keep" is missing, or open by default`);
      if (!v.reasonBg || v.reasonBg === "rgba(0, 0, 0, 0)") fail(`case ${k}: the reason has no state colour (portal.css isn't styling .dl-reason)`);
    }
    if (!has("none", "No reviews yet") || !has("none", "In the Google account you connected") || !has("none", "Not in the account you connected") || !R2.none.ask) fail("case 1 (no reviews): the facts or the question are wrong");
    if (!has("mine", "★ 4.8 · 23 reviews") || !/it has your 23 reviews/.test(R2.mine.reason)) fail("case 2: the main listing's reviews and rating aren't shown as the reason");
    if (!R2.flip.rga || R2.flip.label !== "Waits on RGA" || R2.flip.ask || !has("flip", "31 reviews") || !/Keep · it has your reviews/.test(R2.flip.heads[0] || "")) fail(`case 3: the second listing having more reviews doesn't turn the card into "Waits on RGA" with nothing to answer (${JSON.stringify({ rga: R2.flip.rga, label: R2.flip.label, ask: R2.flip.ask, heads: R2.flip.heads })})`);
    if (!R2.both.heads.some((h) => /Merge · into your main one/.test(h)) || /remove it here in one tap/.test(R2.both.text) || !/merge it into your main one/.test(R2.both.text)) fail("case 4: both with reviews still says remove (it must say merge, on the box AND under the answers)");
    if (!has("unknown", "Couldn't read reviews tonight") || !has("unknown", "Couldn't check your Google account") || has("unknown", "No reviews yet") || has("unknown", "Not in the account you connected")) fail("case 5: a fact that wasn't measured reads as a value (it must say \"Couldn't\")");
  } finally { await browser.close(); }
}
// the queue and the badge: a card that waits on RGA asks nothing of the client
if (!/const pending = open\.length \+ actions\.filter\(\(a\) => !\(a\.keep && a\.keep\.waits_on_rga\)\)\.length;/.test(portal)) fail("the For your approval badge counts a card that waits on RGA");
if (!/queue\.filter\(\(e\) => !e\.done && !e\.rga\)\.length; return n === 0 \? "Nothing needs you right now"/.test(portal)) fail("the queue heading says a card that waits on RGA \"needs you\"");
// admin step 11 has RGA's two choices, and shows the facts the same way (not measured = "couldn't")
{
  const ad = code("admin/admin.js");
  if (!/data-ol-keep="reviews">Keep the one with the reviews<\/button>/.test(ad) || !/data-ol-keep="ours">Keep ours and merge the other in<\/button>/.test(ad)) fail("admin step 11 has no choice when the second listing has more reviews");
  if (!/"reviews couldn't be read"/.test(ad) || !/"account not checked"/.test(ad)) fail("admin step 11 shows an unmeasured fact as a value");
  if (/Remove · not in the connected account/.test(ad)) fail("admin step 11 still claims the second listing isn't in the connected account without measuring it");
}

if (F.length) { console.error("🔴 removing a duplicate listing can break a safety rule:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a client can remove their own duplicate and nothing else: run end to end (found → tap → DELETE exactly it → read back → token cleared); not-in-account, the kept listing, reviews, unknown reviews, an expired sign-in and Google's refusal all delete nothing; token only ever encrypted; service-only table; branch after the signature check; only the client presses Remove");
