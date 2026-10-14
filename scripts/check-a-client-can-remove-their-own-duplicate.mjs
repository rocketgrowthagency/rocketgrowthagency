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

Object.assign(process.env, { SUPABASE_URL: "https://stub.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "stub", INTERNAL_FN_SECRET: "gate-secret",
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
  [/\$\{pair\(keepCard\(\), dropCard\(\)\)\}\s*<div class="dl-ask"/, "the question isn't preceded by Keep vs Remove side by side (the approved card)"],
  [/You sign in with the Google account that made it, then remove it here in one tap\./, "\"Yes, it's ours\" doesn't say what happens next"],
  [/We ask Google to remove it\. Nothing else is needed from you\./, "\"No, it isn't\" doesn't say what happens next"],
  [/\{ done: true, stateLabel: "Waits on Google" \}/, "a removed duplicate doesn't turn into the green done card"],
]) if (!re.test(dc)) fail(msg);

// the card shows BOTH listings (the approved mockup), and the question counts as the client's step
if (!/kept: key === "m1\.audit\.gbp_duplicate" \? kept : null,/.test(code("netlify/functions/portal-deliverables.js"))) fail("the duplicate card isn't given the listing we keep");

// a pressed button that waits on the server shows a spinner (Chris: "a progress circle"), and the Keep link opens by place id
if ((portal.match(/classList\.add\("is-busy"\)/g) || []).length < 3) fail("a pressed button on the duplicate card sits there with no sign it's working (answer, sign in, remove)");
if (!/\.portal-button\.is-busy::before \{[^}]*animation: portal-spin/.test(read("portal/portal.css"))) fail("the busy button has no spinning ring");
if (!/maps_url: c\.google_place_id \? `https:\/\/www\.google\.com\/maps\/place\/\?q=place_id:/.test(code("netlify/functions/portal-deliverables.js"))) fail("the Keep listing's Maps link isn't by place id (the stored Maps URL opened a blank page)");

if (F.length) { console.error("🔴 removing a duplicate listing can break a safety rule:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a client can remove their own duplicate and nothing else: run end to end (found → tap → DELETE exactly it → read back → token cleared); not-in-account, the kept listing, reviews, unknown reviews, an expired sign-in and Google's refusal all delete nothing; token only ever encrypted; service-only table; branch after the signature check; only the client presses Remove");
