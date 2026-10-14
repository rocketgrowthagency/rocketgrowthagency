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
// v8: `scope` = what Google granted (the client may leave the listings box unticked); `listFails` = Google errors on the list
function world({ accountHas = "dupe", reviews = 0, canDelete = true, reviewsError = false, deleteNoop = false,
  scope = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/business.manage", listFails = false } = {}) {
  const db = {
    client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { status: "pending", outcome_data: { verdict: "duplicate", duplicates: [DUPE], client_answer: { answer: "mine" } } } } } }],
    clients: [{ id: CID, business_name: "Rocket Growth Agency", gbp_url: "https://www.google.com/maps/place/x/@34.0,-118.4,14z/data=!3m1!4b1!4m6!3m5!1s0xccc:0xddd!8m2" }],
    client_google_oauth: [{ client_id: CID, gbp_location_id: KEPT_LOC }],
    client_listing_removals: [],
  };
  const deleted = [], googleGone = new Set(), notified = [];
  const locs = accountHas === "dupe" ? [{ name: "locations/DUPE", title: DUPE.title, phoneNumbers: { primaryPhone: DUPE.phone }, metadata: { placeId: DUPE.place_id, canDelete, mapsUri: "https://maps.google.com/?cid=1" } }]
    : accountHas === "kept" ? [{ name: KEPT_LOC, title: "Main", metadata: { placeId: DUPE.place_id, mapsUri: "https://maps.google.com/?cid=2" } }]
    // "none": the account manages a DIFFERENT listing — matching must be by place id, never "the first one there"
    : [{ name: KEPT_LOC, title: "Main", metadata: { placeId: "ChIJ-kept", mapsUri: "https://maps.google.com/?cid=2" } }];
  const J = (b, s = 200) => new Response(b == null ? null : JSON.stringify(b), { status: s });
  const fetchStub = async (url, init = {}) => {
    const u = new URL(String(url)); const m = (init.method || "GET").toUpperCase();
    if (u.hostname === "oauth2.googleapis.com") return J({ access_token: "ya29.SECRET-TOKEN", expires_in: 3600, scope });
    if (/\/\.netlify\/functions\/notify-rga$/.test(u.pathname)) { notified.push({ secret: (init.headers || {})["x-internal-secret"], body: JSON.parse(init.body || "{}") }); return J({ ok: true, delivered: true }); }
    if (u.hostname === "openidconnect.googleapis.com") return J({ email: "chris.owner@gmail.com" });
    if (u.hostname === "mybusinessaccountmanagement.googleapis.com") return J({ accounts: [{ name: "accounts/A1" }] });
    if (u.hostname === "mybusinessbusinessinformation.googleapis.com") {
      if (/\/accounts\/A1\/locations$/.test(u.pathname)) return listFails ? J({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, 429) : J({ locations: locs });
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
  return { db, deleted, notified, fetchStub };
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
  // 2b · v8 (approved duplicate_wrong_account_v8): three outcomes that all used to read "doesn't manage it"
  {
    // the box on Google's page not ticked → "no_scope", whatever the account holds, and nothing read or kept
    const w = world({ scope: "openid https://www.googleapis.com/auth/userinfo.email" });
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    const row = w.db.client_listing_removals[0];
    if (row?.status !== "no_scope" || row?.token_enc) fail(`a sign-in without the listings box ticked isn't "no_scope" with no token kept (${row?.status})`);
    if (summary(w)?.status !== "no_scope") fail("the portal isn't told the box wasn't ticked");
    const out = await run(w, () => FLOW.removeNow(CID, "x"));
    if (out.code === 200 || w.deleted.length) fail("a sign-in without the listings box can still remove something");
  }
  {
    // Google errors on the list → "unreadable", never "not_found" (a hiccup must not send the client to another account)
    const w = world({ listFails: true });
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    const row = w.db.client_listing_removals[0];
    if (row?.status !== "unreadable" || row?.token_enc) fail(`Google failing to send the list reads "${row?.status}", not "unreadable" (it would tell the client the account is wrong)`);
    if (w.notified.length) fail("RGA is told after ONE failed read (decision 5: after two in a row)");
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    if (w.notified.length !== 1 || w.notified[0].secret !== "gate-secret" || !/twice in a row/.test(w.notified[0].body.message || "")) fail(`RGA isn't told when Google fails to send the list twice in a row (${w.notified.length} sent)`);
    if (w.deleted.length) fail("an unreadable account removed something");
  }
  {
    // a sign-in that works after a failed read doesn't alert RGA, and a not_found after an unreadable doesn't either
    const w = world({ accountHas: "none" });
    w.db.client_listing_removals.push({ id: "r0", client_id: CID, status: "unreadable", created_at: "2026-10-14T00:00:00Z" });
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    if (w.notified.length) fail("RGA is told about a failed read when the next sign-in was read fine");
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

  // 10b · "flag it, not flip it" (approved duplicate_listing_removal_steps_v4): when RGA must decide, and what a step calls it
  {
    const { keepWaits, dupLabel } = req("./_gbp-duplicate.js");
    const base = { verdict: "duplicate", own_listing: { reviews: 0 }, duplicates: [{ reviews: 0 }] };
    if (keepWaits(base) !== false) fail("keepWaits says RGA decides when nothing asks it to");
    if (keepWaits({ ...base, keep_request: { note: "x" } }) !== true) fail("a client's open request doesn't make RGA decide first");
    if (keepWaits({ ...base, keep_request: { note: "x" }, keep_reply: { choice: "ours" } }) !== false) fail("RGA's answer doesn't release the card");
    if (keepWaits({ ...base, own_listing: { reviews: 1 }, duplicates: [{ reviews: 9 }] }) !== true) fail("the second listing having more reviews doesn't make RGA decide first");
    if (keepWaits({ verdict: "clean", keep_request: { note: "x" } }) !== false) fail("keepWaits answers for a clean listing");
    if (dupLabel({ phone: "(424) 396-8499" }) !== "the (424) 396-8499 listing" || dupLabel({ address: "12 Main St" }) !== "the listing at 12 Main St" || dupLabel({}) !== "the second listing") fail("a step doesn't name the listing by its phone, else its address, else \"the second listing\"");
    // the removal refuses while the client's request is open — the second lock, after the sign-in's
    const w = world();
    await run(w, () => FLOW.handleCallback("code", state, errorPage));
    w.db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data.keep_request = { note: "keep the other one", at: new Date().toISOString() };
    const out = await run(w, () => FLOW.removeNow(CID, "x"));
    if (w.deleted.length || out.code === 200) fail("a removal still happens while the client's \"keep the other one\" request is open");
  }
  // 10c · the client's request, through the real portal endpoint: saved, RGA told, the question paused, a pending removal cancelled
  {
    const db = { clients: [{ id: CID, business_name: "Rocket Growth Agency", workspace_id: "w1" }], client_portal_access: [{ portal_email: "owner@lonestar.test", client_id: CID }],
      client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "duplicate", own_listing: { reviews: 0 }, duplicates: [{ place_id: "ChIJ-dupe", phone: "(424) 396-8499", reviews: 0 }], client_answer: { answer: "mine" } } } } } }],
      client_listing_removals: [{ id: "r1", client_id: CID, status: "found", token_enc: "x" }],
      client_google_oauth: [{ client_id: CID, google_account_email: "hello@lonestar.test" }] };
    const told = [];
    const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st });
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => { const u = new URL(String(url)); const m = (init.method || "GET").toUpperCase();
      if (u.pathname === "/auth/v1/user") return J({ id: "u9", email: "owner@lonestar.test" });
      if (u.pathname.endsWith("/notify-rga")) { told.push(JSON.parse(init.body)); return J({ ok: true, delivered: true }); }
      const t = u.pathname.split("/").pop(); const rows = db[t] || (db[t] = []);
      const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v)); const list = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
      if (m === "PATCH") { list.forEach((r) => Object.assign(r, JSON.parse(init.body))); return J(list); }
      if (m === "POST") { const b = JSON.parse(init.body); rows.push(b); return J([b], 201); }
      return J(list); };
    process.env.URL = "https://stub.site.invalid";
    try {
      const pd = req("./portal-deliverables.js");
      const call = (b) => pd.handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, key: "m1.audit.gbp_duplicate", ...b }) });
      const tooShort = await call({ action_keep_request: true, note: "x" });
      if (tooShort.statusCode !== 400) fail(`a request with no reason is accepted (${tooShort.statusCode}) — one line is required`);
      const r1 = await call({ action_keep_request: true, note: "That's the one with our real address" });
      const od = db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data;
      if (r1.statusCode !== 200 || od.keep_request?.note !== "That's the one with our real address") fail(`the client's request isn't saved (${r1.statusCode} ${r1.body})`);
      if (!told.some((t) => /asked to keep the \(424\) 396-8499 listing/.test(t.message || ""))) fail("RGA isn't told about the client's request");
      if (db.client_listing_removals[0].status !== "expired" || db.client_listing_removals[0].token_enc) fail("a pending removal (and its sign-in) survives the client's request");
      const a1 = await call({ action_answer: "mine" });
      if (a1.statusCode !== 409) fail(`the question can still be answered while RGA decides (${a1.statusCode})`);
      const listed = JSON.parse((await call({})).body || "{}");
      const act = (listed.actions || []).find((x) => x.key === "m1.audit.gbp_duplicate") || {};
      if (act.kept?.account !== "hello@lonestar.test") fail(`the portal isn't given the Google account the client connected ("Managed by", duplicate_listing_accounts_v6): ${act.kept?.account}`);
      if (act.waits !== true || act.keep_request?.note !== "That's the one with our real address" || (act.details || [])[0]?.label !== "the (424) 396-8499 listing") fail(`the portal isn't told the card waits on RGA, with the request and the listing's name (${JSON.stringify({ waits: act.waits, req: act.keep_request, label: (act.details || [])[0]?.label })})`);
      const c1 = await call({ action_keep_request: "cancel" });
      if (c1.statusCode !== 200 || db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data.keep_request) fail("\"Cancel my request\" doesn't cancel it");
    } finally { globalThis.fetch = real; }
  }
  // 10d · RGA's answer to a request: "Keep ours…" needs a line and the request; "Make the second one the main listing" is allowed
  {
    const mkdb = (withReq) => ({ clients: [{ id: CID, workspace_id: "w1", google_place_id: "ChIJ-kept", gbp_url: "u" }], profiles: [{ id: "u1", workspace_id: "w1" }],
      client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "duplicate", own_listing: { reviews: 9 },
        duplicates: [{ place_id: "ChIJ-dupe", data_id: "0xa:0xb", title: "T", phone: "(424) 396-8499", reviews: 0, gps: { lat: 34.1, lng: -118.2 } }], ...(withReq ? { keep_request: { note: "real address", at: "2026-10-14T09:20:00Z" } } : {}) } } } } }] });
    const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st });
    const stub = (db) => async (url, init = {}) => { const u = new URL(String(url)); if (u.pathname === "/auth/v1/user") return J({ id: "u1", email: "a@b" });
      if (u.hostname === "stub.site.invalid") return J({ ok: true, finding: { verdict: "duplicate" } });
      const t = u.pathname.split("/").pop(); const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v)); const rows = (db[t] || []).filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
      if ((init.method || "GET") === "PATCH") rows.forEach((r) => Object.assign(r, JSON.parse(init.body))); return J(rows); };
    const real = globalThis.fetch;
    try {
      const keep = req("./gbp-duplicate-keep.js");
      const call = (choice, note) => keep.handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, choice, note }) });
      let db = mkdb(false); globalThis.fetch = stub(db);
      if ((await call("reply", "Because it is ours")).statusCode !== 409) fail("RGA can \"answer\" a request the client never made");
      db = mkdb(true); globalThis.fetch = stub(db);
      if ((await call("reply", "no")).statusCode !== 400) fail("\"Keep ours…\" goes to the client with no line on why");
      const r = await call("reply", "It's the one in your Google account.");
      const od = db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].outcome_data;
      if (r.statusCode !== 200 || od.keep_reply?.choice !== "ours" || od.keep_reply?.note !== "It's the one in your Google account." || !od.keep_request) fail(`"Keep ours…" doesn't record the answer for the client (${r.statusCode})`);
      db = mkdb(true); globalThis.fetch = stub(db);
      const sw = await call("reviews");
      if (sw.statusCode !== 200 || db.clients[0].google_place_id !== "ChIJ-dupe" || db.client_onboarding_records[0].data.tasks["m1.audit.gbp_duplicate"].listing_switch?.why !== "the client asked") fail(`"Make the second one the main listing" doesn't work on a client's request, or isn't recorded as theirs (${sw.statusCode})`);
    } finally { globalThis.fetch = real; }
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
  [/if \(keepWaits\(tasks\["m1\.audit\.gbp_duplicate"\]\?\.outcome_data\)\) return json\(409/, "the sign-in can start while RGA is deciding which listing to keep"],
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
// v8 decision 2: the account the client JUST signed in with is shown in full (masking made chriskapranos@ and
// chriskapranos2@ read the same); the token never is
if ("token_enc" in sum || JSON.stringify(sum).includes("\"x\"") || sum.account !== "chris.owner@gmail.com") fail("the client-readable summary carries the token, or doesn't name the signed-in account in full");
const portal = code("portal/portal.js");
// the card (approved duplicate_listing_card_v2): routed to dupCard; Remove only when found; the question asked without the masked owner
if (!/if \(a\.key === "m1\.audit\.gbp_duplicate" && \(a\.details \|\| \[\]\)\.length\) return dupCard\(a\);/.test(portal)) fail("the duplicate isn't drawn by its own card (dupCard)");
const dc = (/function dupCard\(a\) \{[\s\S]*?\n\}\n/.exec(portal) || [""])[0];
if (!dc) fail("dupCard is gone (re-read this gate)");
if ((dc.match(/data-dup-remove/g) || []).length !== 1 || !/if \(r && r\.status === "found"\) \{[\s\S]{0,500}data-dup-remove/.test(dc)) fail("the Remove button can show in a state other than found");
// v5 (approved duplicate_listing_card_v5, 2026-10-14): one question per screen; the "who made it" answers are two
if (!/data-dup-screen="choose"[\s\S]*data-dup-screen="who" hidden/.test(dc)) fail("the card isn't two screens (choose, then who made it)");
if (!/data-ap-answer="mine">We did<\/button>/.test(dc) || !/data-ap-answer="unsure">Someone else, or I'm not sure<\/button>/.test(dc) || /data-ap-answer="not_mine"/.test(dc)) fail("\"Who made it?\" isn't the two approved answers (We did / Someone else, or I'm not sure)");
if (!/\{ done: true, stateLabel: "Waits on Google" \}/.test(dc)) fail("a removed duplicate doesn't turn into the green done card");

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
  // scoped to the "clear" path: the client's keep-request has its own copy of this PATCH (2026-10-14), and a file-wide
  // match let a broken "Change my answer" pass on the other one's line
  if (!/if \(answer === "clear"\) \{[\s\S]{0,1600}?client_listing_removals\?client_id=eq\.\$\{clientId\}&status=eq\.found`, \{ method: "PATCH",\s*body: JSON\.stringify\(\{ status: "expired", token_enc: null, detail: "The client changed their answer\." \}\)/.test(pd)) fail("changing the answer leaves a pending removal (and its sign-in) usable");
  if (!/const back = `<button type="button" class="dl-back" data-ap-clear=/.test(dc)) fail("the duplicate card has no way back once answered");
}

// ── 13 · THE CARD IN A REAL BROWSER (approved duplicate_listing_card_v5): every state, rendered with portal.css, and the
// clicks run through portal.js's OWN handlers. A regex on the source passes while the screen is wrong.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie
{
  let puppeteer = null;
  try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
  if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing, the card can't be rendered"); process.exit(2); }
  const src = read("portal/portal.js");
  const pick = (re) => { const m = re.exec(src); if (!m) { fail(`the card's code moved (${re.source.slice(0, 40)}): re-read this gate`); return ""; }
    let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
  const g = /const GOOGLE_G = `[^`]*`;/.exec(src);
  const handlers = [/\/\/ the two radio cards:[^\n]*\n(document\.addEventListener\("change"[\s\S]*?\n\}\);)/, /\/\/ v5: "Keep …" moves to screen 2[^\n]*\n(document\.addEventListener\("click"[\s\S]*?\n\}\);)/]
    .map((re) => (re.exec(src) || [])[1] || "");
  if (handlers.some((h) => !h)) fail("the card's pick / next-screen handlers are gone (the choice can't be made)");
  const bundle = [g ? g[0] : "", pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), pick(/^function fmtDateShort\(/m), pick(/^function dupCard\(/m), ...handlers].join("\n");
  const { keepChoice, dupLabel } = req("./_gbp-duplicate.js");
  const kept = { name: "Lone Star Drain & Plumbing", category: "Plumber", phone: "(512) 555-0142", maps_url: "https://maps.example/k" };
  const mk = (own, dup, dec = null, extra = {}) => ({ key: "m1.audit.gbp_duplicate", kept, own_listing: own,
    details: [{ name: "Lone Star Drain & Plumbing", category: "Plumber", phone: "(512) 555-0199", maps_url: "https://maps.example/d", label: dupLabel({ phone: "(512) 555-0199" }), ...dup }],
    keep: keepChoice(own, dup, dec), answer: null, ...extra });
  const z = { reviews: 0, rating: null, in_connected_account: true }, zd = { reviews: 0, rating: null, in_connected_account: false };
  const CASES = {
    none:     mk(z, zd),
    mine:     mk({ reviews: 23, rating: 4.8, in_connected_account: true }, zd),
    flip:     mk({ reviews: 2, rating: 5, in_connected_account: true }, { reviews: 31, rating: 4.9, in_connected_account: false }),
    both:     mk({ reviews: 23, rating: 4.8, in_connected_account: true }, { reviews: 4, rating: 4.5, in_connected_account: false }),
    unknown:  mk({ reviews: null, rating: null, in_connected_account: null }, { reviews: null, rating: null, in_connected_account: null }),
    asked:    mk(z, zd, null, { keep_request: { note: "That's the one with our real address", at: "2026-10-14T16:20:00Z" }, keep_reply: null, waits: true }),
    replied:  mk(z, zd, null, { keep_request: { note: "x", at: "2026-10-14T16:20:00Z" }, keep_reply: { choice: "ours", note: "It's the one in your Google account.", at: "2026-10-14T18:00:00Z" } }),
    signin:   mk(z, zd, null, { answer: "mine", owner_hint: "ch…@gmail.com" }),
    found:    mk(z, zd, null, { answer: "mine", owner_removal: { status: "found", account: "chriskapranos@gmail.com" } }),
    notfound: mk(z, zd, null, { answer: "mine", owner_removal: { status: "not_found", account: "owner@lonestardrain.com" } }),
    // v8: two look-alike Gmails (RGA's real case), a different-looking one, the box not ticked, Google not sending the list
    lookalike: mk(z, zd, null, { answer: "mine", owner_hint: "ch…@gmail.com", owner_removal: { status: "not_found", account: "chriskapranos@gmail.com" } }),
    unlike:   mk(z, zd, null, { answer: "mine", owner_hint: "ch…@gmail.com", owner_removal: { status: "not_found", account: "office@lonestar.test" } }),
    noscope:  mk(z, zd, null, { answer: "mine", owner_hint: "ch…@gmail.com", owner_removal: { status: "no_scope", account: "chriskapranos2@gmail.com" } }),
    unread:   mk(z, zd, null, { answer: "mine", owner_hint: "ch…@gmail.com", owner_removal: { status: "unreadable", account: "chriskapranos2@gmail.com" } }),
    handled:  mk(z, zd, null, { answer: "unsure" }),
    removed:  mk(z, zd, null, { answer: "mine", owner_removal: { status: "removed", account: "chriskapranos@gmail.com", at: "2026-10-14T18:00:00Z" } }),
    // v6 (approved duplicate_listing_accounts_v6): which Google account goes with each listing
    accts:    mk(z, zd, null, { owner_hint: "ch…@gmail.com", kept: { ...kept, account: "hello@lonestar.test" } }),
    acctsIn:  mk(z, zd, null, { answer: "mine", owner_hint: "ch…@gmail.com", kept: { ...kept, account: "hello@lonestar.test" } }),
    noHint:   mk(z, zd, null, { answer: "mine", kept: { ...kept, account: "hello@lonestar.test" } }),
    sameAcct: mk(z, { ...zd, in_connected_account: null }, null, { answer: "mine", kept: { ...kept, account: "hello@lonestar.test" } }),
  };
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(`<html><head><style>${read("portal/portal.css")}</style></head><body><div id="host"></div></body></html>`);
    await page.addScriptTag({ content: bundle });
    if (process.env.DUP_SHOTS) for (const [name, a] of Object.entries(CASES)) {
      await page.evaluate((a) => { const c = dupCard(a); document.getElementById("host").innerHTML = `<div class="ap-item ap-action is-open${c.rga ? " is-rga" : ""}" style="background:#fff;border:1px solid #e3e3e3;border-radius:14px;padding:18px;margin:12px;max-width:860px"><p style="margin:0 0 8px;font:600 15px Inter,system-ui">${c.title} · ${c.stateLabel || c.eyebrow}</p><div class="ap-body">${c.body}</div></div>`; }, a);
      await page.screenshot({ path: `${process.env.DUP_SHOTS}/dupcard_${name}.png`, fullPage: true });
    }
    const R2 = await page.evaluate((cases) => {
      const out = {};
      const vis = (el) => !!el && !el.closest("[hidden]");
      for (const [name, a] of Object.entries(cases)) {
        const c = dupCard(a);
        const host = document.getElementById("host");
        host.innerHTML = `<div class="ap-body">${c.body}</div>`;
        const radios = [...host.querySelectorAll("input[type=radio][data-dup-pick]")];
        out[name] = { title: c.title, eyebrow: c.eyebrow, rga: !!c.rga, done: !!c.done, label: c.stateLabel || "", text: host.textContent.replace(/\s+/g, " "),
          radios: radios.map((r) => `${r.value}${r.checked ? "*" : ""}`), recOn: host.querySelector(".dl-choice .dl-rec")?.closest(".dl-choice")?.querySelector("input")?.value || "",
          lines: [...host.querySelectorAll(".dl-line")].map((x) => x.textContent.trim()), summary: vis(host.querySelector("[data-dup-for=ours] .ap-foot")) ? host.querySelector("[data-dup-for=ours] .ap-foot").textContent.trim() : "",
          howClosed: host.querySelector("details.dl-how") ? !host.querySelector("details.dl-how").open : null,
          whoVisible: vis(host.querySelector("[data-dup-screen=who]")), answers: [...host.querySelectorAll("[data-ap-answer]")].map((b) => b.getAttribute("data-ap-answer")),
          captions: [...host.querySelectorAll(".dl-ans small")].map((x) => x.textContent.trim()),
          pill: [...host.querySelectorAll(".dl-steps span")].map((x) => `${x.className}:${x.textContent.trim()}`).join("|"),
          alert: host.querySelector(".dl-err") ? { warn: host.querySelector(".dl-err").classList.contains("warn"), head: host.querySelector(".dl-et > b")?.textContent.trim(), bg: getComputedStyle(host.querySelector(".dl-err")).backgroundColor, headPx: parseFloat(getComputedStyle(host.querySelector(".dl-et > b")).fontSize) } : null,
          red: host.querySelector("[data-dup-remove]")?.textContent.trim() || "", google: host.querySelector("[data-dup-owner-signin]")?.textContent.trim() || "",
          googleW: host.querySelector("[data-dup-owner-signin]") ? Math.round(host.querySelector("[data-dup-owner-signin]").getBoundingClientRect().width) : 0,
          bodyW: Math.round(host.querySelector(".ap-body").getBoundingClientRect().width),
          back: !!host.querySelector("[data-ap-clear]"), cancel: !!host.querySelector("[data-dup-request-cancel]"),
          requestShown: vis(host.querySelector("[data-dup-request]")), keepShown: vis(host.querySelector("[data-dup-next]")) };
      }
      return out;
    }, CASES);
    const L = "the (512) 555-0199 listing";
    // screen 1 · a radio choice, ours preselected and Recommended; screen 2 hidden behind it
    for (const k of ["none", "mine", "both", "unknown", "replied"]) {
      const v = R2[k];
      if (v.radios.join() !== "ours*,other" || v.recOn !== "ours") fail(`case ${k}: screen 1 isn't a choice with ours preselected and Recommended (${v.radios.join()} rec=${v.recOn})`);
      if (v.whoVisible || v.answers.join() !== "mine,unsure") fail(`case ${k}: "Who made it?" isn't the hidden second screen with two answers (${v.answers.join()})`);
      if (v.howClosed !== true) fail(`case ${k}: "How we decide" is missing, or open by default`);
      if (v.requestShown || !v.keepShown) fail(`case ${k}: screen 1 doesn't open on "Keep" alone (the request shows before the client picks the other one)`);
      if (!/our work is here$/.test(v.lines[0] || "")) fail(`case ${k}: our listing's line doesn't say our work is there (${v.lines[0]})`);
      if (/phone/i.test(v.summary)) fail(`case ${k}: the reason mentions the phone number`);
    }
    if (R2.none.summary !== "Neither has reviews, so nothing is lost." || R2.none.lines.join(" | ") !== "✓ in your connected Google account · our work is here | no reviews · not in your connected account") fail(`case none: the lines or the reason are wrong (${R2.none.lines.join(" | ")} / ${R2.none.summary})`);
    if (!/^✓ ★ 4\.8 · 23 reviews · in your connected Google account · our work is here$/.test(R2.mine.lines[0] || "") || !/deletes its reviews/.test(R2.mine.summary)) fail(`case mine: the reviews aren't the reason to keep ours (${R2.mine.lines[0]} / ${R2.mine.summary})`);
    if (!/merge the other into it/.test(R2.both.text) || !/merge it in rather than delete it/.test(R2.both.summary) || R2.both.captions.some((x) => /remove it here/.test(x)) || !/★ 4\.5 · 4 reviews/.test(R2.both.lines[1] || "")) fail("case both: both with reviews still reads as a removal (it must say merge on screen 1 and under the answers)");
    if (!/couldn't read reviews · couldn't check your Google account/.test(R2.unknown.lines[1] || "") || /no reviews|not in your connected/.test(R2.unknown.lines.join(" ")) || !/couldn't read the review counts/.test(R2.unknown.summary)) fail(`case unknown: a fact that wasn't measured reads as a value (${R2.unknown.lines.join(" | ")})`);
    if (!R2.flip.rga || R2.flip.label !== "Waits on RGA" || R2.flip.radios.length || !/We'll keep \(512\) 555-0199: it has 31 of your reviews/.test(R2.flip.text) || !/merged in, not deleted/.test(R2.flip.text)) fail(`case flip: the second listing having more reviews isn't "Waits on RGA", keeping it and merging ours (${R2.flip.text.slice(0, 120)})`);
    if (!R2.asked.rga || R2.asked.label !== "Waits on RGA" || R2.asked.radios.length || !R2.asked.cancel || !/You asked us to keep \(512\) 555-0199/.test(R2.asked.text)) fail("the client's request doesn't wait on RGA with their reason and a way to cancel");
    if (!/We checked your request/.test(R2.replied.text) || !/It's the one in your Google account\./.test(R2.replied.text)) fail("RGA's answer isn't shown above the choice");
    // 3 · 4 · sign in, remove — the listing named, the kept one in view, a way back
    // step 3 (v7) says it in a two-line box ("Keeping … · it isn't touched"); step 4 keeps the full box
    for (const k of ["signin", "found", "notfound"]) if (R2[k].title !== `Remove ${L}` || !/Keeping \(512\) 555-0142(\. It isn't touched\.| · it isn't touched)/.test(R2[k].text) || !R2[k].back) fail(`${k}: the step doesn't name the listing, show the one kept, or offer ← Back (${R2[k].title})`);
    // v7 (approved duplicate_signin_step_v7): the owner as an account card, the hidden part as dots, one plain button,
    // and what happens next in three steps
    if (R2.signin.googleW && R2.signin.googleW > R2.signin.bodyW * 0.6) fail(`step 3's "Continue with Google" stretches across the card (${R2.signin.googleW}px of ${R2.signin.bodyW}) — a button keeps its label's width`);
    if (R2.signin.eyebrow !== "Step 3 of 4" || R2.signin.google !== "Continue with Google" || !/The owner, as Google shows it/.test(R2.signin.text) || !/ch•••••@gmail\.com/.test(R2.signin.text) || /ch…/.test(R2.signin.text)
      || !/pick the one that starts with ch and ends @gmail\.com, or "Use another account" if it isn't listed\./.test(R2.signin.text) || !/Tick the box See, edit, create and delete your Google business listings, then press Continue\./.test(R2.signin.text) || !/Nothing is removed until you do\./.test(R2.signin.text) || R2.signin.alert) fail(`signin: step 3 isn't the sign-in with the owner's account and the tip (${R2.signin.google})`);
    if (R2.found.eyebrow !== "Step 4 of 4" || R2.found.red !== "Remove (512) 555-0199" || !/Signed in as chriskapranos@gmail\.com\. It manages this listing\./.test(R2.found.text)) fail(`found: step 4's red button or signed-in line doesn't name what it does (${R2.found.red})`);
    // v8 (approved duplicate_wrong_account_v8): the wrong account is a RED alert that names BOTH accounts, the used one in full
    {
      const nf = R2.notfound, la = R2.lookalike;
      if (!nf.alert || nf.alert.warn || nf.alert.head !== "Wrong Google account" || nf.alert.bg !== "rgb(254, 233, 232)" || !(nf.alert.headPx >= 17)) fail(`notfound: the wrong account isn't the large red "Wrong Google account" alert (${JSON.stringify(nf.alert)})`);
      if (!/You signed in as owner@lonestardrain\.com, but that account doesn't manage the \(512\) 555-0199 listing\. Nothing was removed\./.test(nf.text) || !/✕ Doesn't manage it/.test(nf.text)) fail("notfound: the alert doesn't name the account used, in full, and the listing");
      if (!/The owner\s*Usually the Gmail you used back then/.test(nf.text)) fail("notfound with no saved owner: the right-hand box invents an owner instead of \"Usually the Gmail you used back then\"");
      if (!/Not sure which account it is\?/.test(nf.text) || !/businessprofile-noreply@google\.com/.test(nf.text)) fail("notfound: no \"how to find the owner\" tip (Google's performance report email)");
      if (nf.google !== "Try another Google account" || !/Pick a different account than owner@lonestardrain\.com/.test(nf.text) || !/Tick the box See, edit, create and delete your Google business listings/.test(nf.text)) fail("notfound: the retry steps don't name the account to avoid and the box to tick");
      if (!/(^|\|)bad:3 · Sign in again(\||$)/.test(nf.pill)) fail(`notfound: the step pill isn't red "3 · Sign in again" (${nf.pill})`);
      if (!/You signed in as\s*chriskapranos@gmail\.com\s*✕ Doesn't manage it/.test(la.text) || !/The owner, as Google shows it\s*ch•••••@gmail\.com\s*Same first letters, a different account/.test(la.text)) fail("lookalike: two look-alike Gmails aren't shown side by side (the used one in full, the owner masked)");
      if (/Same first letters/.test(R2.unlike.text) || !/The account to use/.test(R2.unlike.text)) fail("unlike: \"Same first letters\" is claimed for two addresses that don't share them");
      const ns = R2.noscope, ur = R2.unread;
      if (!ns.alert || ns.alert.warn || ns.alert.head !== "The box wasn't ticked" || !/Pick chriskapranos2@gmail\.com again\./.test(ns.text) || !/tick See, edit, create and delete your Google business listings/.test(ns.text) || ns.google !== "Sign in again" || /Wrong Google account|Not sure which account/.test(ns.text)) fail(`noscope: the box-not-ticked case isn't its own red alert with "sign in again and tick it" (${ns.alert && ns.alert.head})`);
      if (!ur.alert || !ur.alert.warn || ur.alert.head !== "We couldn't check that account" || ur.google !== "Try again" || !/If it happens twice, RGA is told automatically/.test(ur.text) || /Wrong Google account|doesn't manage/.test(ur.text) || /bad:/.test(ur.pill)) fail(`unread: Google not sending the list isn't the amber "We couldn't check that account" with "Try again" (${ur.alert && ur.alert.head})`);
    }
    if (!R2.handled.rga || !/We're taking care of the \(512\) 555-0199 listing/.test(R2.handled.text) || !R2.handled.back) fail("handled: \"Someone else, or I'm not sure\" doesn't turn into RGA taking care of it, with a way back");
    if (!R2.removed.done || !/The \(512\) 555-0199 listing was removed/.test(R2.removed.title)) fail("removed: the done card doesn't name the listing");
    // v6: the accounts — ours in full, the second only as Google masks it, and never a claim we didn't measure
    if (!/Managed by hello@lonestar\.test/.test(R2.accts.text) || !/Owner: ch…@gmail\.com \(Google shows part of it\)/.test(R2.accts.text)) fail("screen 1 doesn't show which account goes with each listing (Managed by … / Owner: ch…@gmail.com)");
    if (/Managed by|Owner:/.test(R2.none.text)) fail("screen 1 shows an account it doesn't have (no connected email / no owner saved)");
    if (!/Google only shows the first letters, to protect the owner's privacy\. It's not hello@lonestar\.test, the account you connected\./.test(R2.acctsIn.text) || R2.acctsIn.google !== "Continue with Google") fail("screen 3 doesn't say why the owner is masked, or which account it isn't");
    if (/The owner, as Google shows it/.test(R2.noHint.text) || !/Usually the Gmail you used back then/.test(R2.noHint.text) || !/Probably not hello@lonestar\.test, the account you connected\./.test(R2.noHint.text)) fail("screen 3 without a saved owner either invents one or drops the \"probably not your connected account\" line");
    if (/probably not|It's not hello/i.test(R2.sameAcct.text)) fail("screen 3 says the owner probably isn't the connected account when that wasn't measured");
    // the clicks, through portal.js's own handlers: pick the other → the request; pick ours → Keep; Keep → screen 2; Back → screen 1
    const clicks = await page.evaluate(async (a) => {
      const host = document.getElementById("host");
      host.innerHTML = `<div class="ap-body">${dupCard(a).body}</div>`;
      const vis = (sel) => { const el = host.querySelector(sel); return !!el && !el.closest("[hidden]"); };
      const wait = () => new Promise((r) => setTimeout(r, 30));
      const labels = [...host.querySelectorAll("label.dl-choice")];
      labels[1].click(); await wait();
      const other = { req: vis("[data-dup-request]"), reqText: host.querySelector("[data-dup-request]")?.textContent.trim(), keep: vis("[data-dup-next]"), sel: labels[1].classList.contains("sel") };
      labels[0].click(); await wait();
      const ours = { req: vis("[data-dup-request]"), keep: vis("[data-dup-next]"), sel: labels[0].classList.contains("sel") };
      host.querySelector("[data-dup-next]").click(); await wait();
      const next = { who: vis("[data-dup-screen=who]"), choose: vis("[data-dup-screen=choose]") };
      host.querySelector("[data-dup-screen-go=choose]").click(); await wait();
      const backTo = { who: vis("[data-dup-screen=who]"), choose: vis("[data-dup-screen=choose]") };
      return { other, ours, next, backTo };
    }, CASES.none);
    if (!clicks.other.req || clicks.other.keep || !clicks.other.sel || clicks.other.reqText !== "Ask RGA to keep (512) 555-0199") fail(`picking the other listing doesn't turn into "Ask RGA to keep (512) 555-0199" (${JSON.stringify(clicks.other)})`);
    if (clicks.ours.req || !clicks.ours.keep || !clicks.ours.sel) fail("picking ours again doesn't bring back \"Keep\"");
    if (!clicks.next.who || clicks.next.choose) fail("\"Keep …\" doesn't move to \"Who made it?\"");
    if (clicks.backTo.who || !clicks.backTo.choose) fail("\"← Back\" doesn't return to the choice");
  } finally { await browser.close(); }
}
// the queue and the badge: a card that waits on RGA asks nothing of the client
if (!/const pending = open\.length \+ actions\.filter\(\(a\) => !\(a\.waits \|\| \(a\.keep && a\.keep\.waits_on_rga\)\)\)\.length;/.test(portal)) fail("the For your approval badge counts a card that waits on RGA");
if (!/queue\.filter\(\(e\) => !e\.done && !e\.rga\)\.length; return n === 0 \? "Nothing needs you right now"/.test(portal)) fail("the queue heading says a card that waits on RGA \"needs you\"");
// admin step 11 has RGA's two choices, and shows the facts the same way (not measured = "couldn't")
{
  const ad = code("admin/admin.js");
  if (!/data-ol-keep="reviews">Keep the one with the reviews<\/button>/.test(ad) || !/data-ol-keep="ours">Keep ours and merge the other in<\/button>/.test(ad)) fail("admin step 11 has no choice when the second listing has more reviews");
  if (!/"reviews couldn't be read"/.test(ad) || !/"account not checked"/.test(ad)) fail("admin step 11 shows an unmeasured fact as a value");
  // the row's code AND its place in step 11's card (a defined-but-unrendered row passed once)
  if (!/data-ol-hint-save>Save<\/button>/.test(ad) || !/Open Google's owner page/.test(ad) || !/business\.google\.com\/arc\/p\//.test(ad) || !/\$\{decided\}\s*\$\{owner\}/.test(ad)) fail("admin step 11 has no \"who owns the second listing?\" row (link to Google's owner page + save)");
  if (/Remove · not in the connected account/.test(ad)) fail("admin step 11 still claims the second listing isn't in the connected account without measuring it");
}

if (F.length) { console.error("🔴 removing a duplicate listing can break a safety rule:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a client can remove their own duplicate and nothing else: run end to end (found → tap → DELETE exactly it → read back → token cleared); not-in-account, the kept listing, reviews, unknown reviews, an expired sign-in and Google's refusal all delete nothing; token only ever encrypted; service-only table; branch after the signature check; only the client presses Remove");
