#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-photo-reaches-google.mjs
//
// 🔴 WHY (2026-10-08). Step 31 told the operator RGA "publishes them to their Google profile —
// automatic once their Google account is connected", and told the client "RGA will push to GBP
// within 24 hrs". The push had ONE caller, an admin button, and no schedule. And had anybody pressed
// it, 7 of the 20 shot-list photos would have bounced: it sent `TEAM` and `EQUIPMENT`, which are not
// in Google's v4 category enum. Chris: "make sure this is universal and communicates with client
// side and has a record keeping database and will sync to GBP profile to list images."
//
// HOLDS, by RUNNING the producer (`_photo-publish.js`) against a fake Google and a fake database:
//   1. every category we send is one Google documents, and every category the portal offers maps
//   2. a connected client's photo is POSTed to `accounts/*/locations/*/media` and marked published
//   3. no connection → `waiting_connection`, recorded ONCE; a second sweep writes nothing
//   4. a file outside Google's rules is `rejected` without spending a call
//   5. a Google refusal is `failed`, counted, and kept with Google's words
//   6. a photo another caller already claimed is never sent twice
//   7. the sweep's retry is capped; every outcome lands in the append-only log
// and, by source: the client's upload calls the publisher, the sweep is scheduled, the log is
// append-only in the database.
//
// exit 0 = a photo reaches Google, or says why not · 1 = it can silently not · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);
const read = (rel) => {
  try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); }
  catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); }
};

// 🔑 GOOGLE'S ENUM, COPIED FROM THE REFERENCE ON 2026-10-08 — not from memory, which is how `TEAM`
// got in. https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media
// `LOGO` is listed by Google as deprecated (it maps to PROFILE), so we refuse to send it.
const GOOGLE_ENUM = new Set(["COVER", "PROFILE", "EXTERIOR", "INTERIOR", "PRODUCT", "AT_WORK",
  "FOOD_AND_DRINK", "MENU", "COMMON_AREA", "ROOMS", "TEAMS", "ADDITIONAL"]);

const modPath = `${SITE}/netlify/functions/_photo-publish.js`;
if (!fs.existsSync(modPath)) {
  console.error("⚠️  INDETERMINATE — _photo-publish.js is gone; re-read how photos reach Google now.");
  process.exit(2);
}
let mod;
try { mod = createRequire(import.meta.url)(modPath); }
catch (e) { console.error(`⚠️  INDETERMINATE — _photo-publish.js does not load: ${e.message}`); process.exit(2); }
const { publishClientPhotos, GOOGLE_CATEGORY, MAX_ATTEMPTS } = mod;
if (typeof publishClientPhotos !== "function" || !GOOGLE_CATEGORY) {
  console.error("⚠️  INDETERMINATE — _photo-publish.js no longer exports publishClientPhotos / GOOGLE_CATEGORY.");
  process.exit(2);
}

// ── 1 · categories ──────────────────────────────────────────────────────────────────────────────
for (const [ours, theirs] of Object.entries(GOOGLE_CATEGORY)) {
  if (!GOOGLE_ENUM.has(theirs)) F(`category "${ours}" is sent to Google as "${theirs}", which is not in Google's v4 enum — Google refuses the photo`);
}
const portal = read("portal/portal.js");
const block = (portal.match(/const PHOTO_CATEGORIES = \[([\s\S]*?)\];/) || [])[1];
if (!block) { console.error("⚠️  INDETERMINATE — PHOTO_CATEGORIES not found in portal.js"); process.exit(2); }
const offered = [...block.matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
for (const v of offered) {
  if (!GOOGLE_CATEGORY[v]) F(`the portal offers category "${v}" and the publisher has no Google category for it — it would go up as ADDITIONAL by accident, or not at all`);
}

// ── a fake world ────────────────────────────────────────────────────────────────────────────────
function world({ oauth, photos, google = () => ({ status: 200, body: { name: "accounts/1/locations/2/media/m1", googleUrl: "https://lh3.example/x" } }), claimLost = false, listing = "clean" }) {
  const w = { googleCalls: [], logRows: [], patches: [], queries: [], ledger: [], told: [], photos: photos.map((p) => ({ ...p })) };
  w.deps = {
    now: () => Date.parse("2026-10-08T12:00:00Z"),
    signUrl: async (p) => `https://storage.example/${p}`,
    // 🔴 every side effect is faked — a gate that writes to the live ledger is a user
    recordChange: async (c) => { w.ledger.push(c); },
    accessToken: async () => "tok",
    notifyRga: async (cid, message) => { w.told.push({ cid, message }); },
    fetch: async (url, init) => {
      w.googleCalls.push({ url, body: JSON.parse(init.body) });
      const g = google(url);
      return { ok: g.status < 300, status: g.status, json: async () => g.body };
    },
    supa: async (path, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") {
        w.queries.push(path);
        if (path.startsWith("/client_photos")) return w.photos;
        if (path.startsWith("/client_google_oauth")) return oauth ? [oauth] : [];
        if (path.startsWith("/clients")) return [{ workspace_id: "ws" }];
        // step 11's verdict — the publisher sends nothing until it says ONE listing (one_google_listing_first_v1)
        if (path.startsWith("/client_onboarding_records")) return [{ data: { tasks: listing ? { "m1.audit.gbp_duplicate": { outcome_data: { verdict: listing } } } : {} } }];
        return [];
      }
      if (method === "POST" && path === "/client_photo_publishes") { w.logRows.push(JSON.parse(init.body)); return null; }
      if (method === "POST") return null;
      if (method === "PATCH" && path.startsWith("/client_photos")) {
        const body = JSON.parse(init.body);
        w.patches.push({ path, body });
        if (body.publish_state === "publishing") return claimLost ? [] : [{ id: "x" }];
        return null;
      }
      return null;
    },
  };
  return w;
}
const CONNECTED = { client_id: "c1", refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" };
const photo = (o = {}) => ({ id: "p1", client_id: "c1", file_name: "a.jpg", storage_path: "c1/a.jpg", category: "team",
  size_bytes: 200000, width: 1200, height: 900, publish_state: "pending", publish_attempts: 0, ...o });
const lastState = (w) => [...w.patches].reverse().find((p) => p.body.publish_state !== "publishing")?.body || {};

let scenarios = 0;
async function scenario(name, fn) {
  scenarios++;
  try { await fn(); } catch (e) { F(`${name}: threw ${String(e.message).slice(0, 160)}`); }
}

// ── 2 · connected → published ───────────────────────────────────────────────────────────────────
await scenario("connected", async () => {
  // 🔒 one Google listing first: a duplicate, or no check yet, sends NOTHING and writes nothing
  for (const listing of ["duplicate", "indeterminate", null]) {
    const wl = world({ oauth: CONNECTED, photos: [photo({ publish_state: "pending" })], listing });
    const sl = await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: wl.deps });
    if (wl.googleCalls.length || wl.patches.length || sl.held !== 1) F(`step 11 said "${listing || "nothing yet"}" and the publisher still ${wl.googleCalls.length ? "sent to Google" : wl.patches.length ? "changed the photo" : "did not hold it"}`);
  }
  const w = world({ oauth: CONNECTED, photos: [photo()] });
  const s = await publishClientPhotos({ clientId: "c1", trigger: "upload", deps: w.deps });
  if (w.googleCalls.length !== 1) return F(`a connected client's photo made ${w.googleCalls.length} Google calls, expected 1`);
  const c = w.googleCalls[0];
  if (!c.url.endsWith("/v4/accounts/1/locations/2/media")) F(`the photo was POSTed to ${c.url} — the parent must be accounts/*/locations/*`);
  if (c.body.locationAssociation?.category !== "TEAMS") F(`a team photo went up as ${c.body.locationAssociation?.category}, expected TEAMS`);
  if (lastState(w).publish_state !== "published" || !lastState(w).gbp_media_name) F("an accepted photo was not marked published with its media name");
  if (s.published !== 1) F(`summary.published = ${s.published}, expected 1`);
  if (w.logRows.length !== 1 || w.logRows[0].outcome !== "published" || w.logRows[0].trigger !== "upload") F("an accepted photo left no 'published' row in client_photo_publishes");
  if (w.ledger.length !== 1 || w.ledger[0].changedBy !== "client") F("a published photo was not entered in the change ledger as the client's change");
});

// ── 3 · not connected → waiting, recorded once ──────────────────────────────────────────────────
await scenario("not connected", async () => {
  const w = world({ oauth: null, photos: [photo()] });
  const s = await publishClientPhotos({ clientId: "c1", trigger: "upload", deps: w.deps });
  if (w.googleCalls.length) F("a client with no Google connection still called Google");
  if (lastState(w).publish_state !== "waiting_connection") F(`no connection left the photo "${lastState(w).publish_state}", expected waiting_connection`);
  if (s.waiting !== 1 || w.logRows.length !== 1 || w.logRows[0].outcome !== "waiting_connection") F("waiting on a connection was not recorded");
  const w2 = world({ oauth: null, photos: [photo({ publish_state: "waiting_connection" })] });
  await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w2.deps });
  if (w2.patches.length || w2.logRows.length) F(`a photo ALREADY waiting was rewritten by the sweep (${w2.patches.length} writes, ${w2.logRows.length} log rows) — an hourly row for a month-long wait`);
});

// ── 4 · outside Google's rules → rejected, no call ──────────────────────────────────────────────
await scenario("rejected", async () => {
  for (const [bad, why] of [[{ storage_path: "c1/a.webp", file_name: "a.webp" }, "a WEBP"],
                            [{ size_bytes: 9 * 1024 * 1024 }, "a 9 MB file"],
                            [{ width: 200, height: 900 }, "a 200 px-wide photo"]]) {
    const w = world({ oauth: CONNECTED, photos: [photo(bad)] });
    await publishClientPhotos({ clientId: "c1", trigger: "upload", deps: w.deps });
    if (w.googleCalls.length) F(`${why} was sent to Google, which refuses it`);
    // 🔒 photo_google_said_no_v1: the client's to fix → the slot reopens with Google's reason AND how to fix it
    const st = lastState(w);
    if (st.publish_state !== "turned_down" || !st.publish_error || st.reviewed_by !== "Google" || !/\nHow to fix: \S/.test(st.review_note || "")) F(`${why} didn't go back to the client's slot with Google's reason and how to fix it (${st.publish_state} · ${JSON.stringify(st.review_note)})`);
  }
});

// ── 5 · Google refuses → failed, counted, kept ──────────────────────────────────────────────────
await scenario("refused", async () => {
  const w = world({ oauth: CONNECTED, photos: [photo({ publish_attempts: 2 })],
    google: () => ({ status: 400, body: { error: { message: "Invalid value at 'category'" } } }) });
  const s = await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w.deps });
  const st = lastState(w);
  if (st.publish_state !== "failed") F(`a Google refusal left the photo "${st.publish_state}", expected failed`);
  if (st.publish_attempts !== 3) F(`a refusal on the 3rd try recorded publish_attempts=${st.publish_attempts}, expected 3 — the retry cap counts nothing`);
  if (!/Invalid value/.test(st.publish_error || "")) F("Google's own words were not kept on the photo");
  if (s.failed !== 1 || w.logRows[0]?.outcome !== "failed" || w.logRows[0]?.http_status !== 400) F("a refusal was not logged with its status");
  // 🔒 photo_google_said_no_v1: an unknown reason is RGA's — the client isn't asked, RGA is told ONCE (the first refusal)
  if (st.publish_state !== "failed" || st.review_note) F("a refusal RGA has to fix was handed to the client");
  if (w.told.length !== 1 || !/Google said: Invalid value/.test(w.told[0].message) || !w.logRows.some((r) => r.outcome === "rga_told")) F(`RGA wasn't told the first time Google refused a photo (${w.told.length} alerts)`);
  const again = world({ oauth: CONNECTED, photos: [photo({ publish_state: "failed", publish_attempts: 3 })], google: () => ({ status: 400, body: { error: { message: "Invalid value at 'category'" } } }) });
  await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: again.deps });
  if (again.told.length) F("RGA is told again on every hourly retry (once per photo)");
});

// ── 5a · Google refuses for a reason only the CLIENT can fix → the slot reopens with how to fix it ──
await scenario("client's to fix", async () => {
  const w = world({ oauth: CONNECTED, photos: [photo()], google: () => ({ status: 400, body: { error: { message: "Image too small: minimum dimensions not met" } } }) });
  await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w.deps });
  const st = lastState(w);
  if (st.publish_state !== "turned_down" || st.reviewed_by !== "Google") F(`a refusal the client must fix left the photo "${st.publish_state}" (expected back on their slot)`);
  const [said, fix] = String(st.review_note || "").split("\nHow to fix: ");
  if (!said || !fix || /minimum dimensions/.test(said)) F(`the client's note isn't plain words + how to fix (${JSON.stringify(st.review_note)})`);
  if (!/Image too small/.test(st.publish_error || "")) F("Google's raw reason wasn't kept for RGA");
  if (w.told.length) F("RGA was alerted about a refusal the client fixes");
  if (w.logRows[0]?.outcome !== "returned_to_client") F("the attempt log doesn't say the photo went back to the client");
});

// ── 5b · a type the profile doesn't take → the real photo still goes up, as ADDITIONAL, once ─────
// 🔴 RGA 2026-10-15: "Photo tag 'interior' does not apply to this location", five hourly times. Retrying the same type
// can never succeed; the photo goes up as Google's general type and the attempt records what was sent.
await scenario("type doesn't apply", async () => {
  const tagErr = { status: 400, body: { error: { message: "Request contains an invalid argument.", details: [{ errorDetails: [{ code: 3, message: "Photo tag 'interior' does not apply to this location", value: "interior" }] }] } } };
  const w = world({ oauth: CONNECTED, photos: [photo({ category: "interior" })],
    google: () => (w.googleCalls.length === 1 ? tagErr : { status: 200, body: { name: "accounts/1/locations/2/media/m9", googleUrl: "https://lh3.example/9" } }) });
  const s = await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w.deps });
  const cats = w.googleCalls.map((c) => c.body.locationAssociation?.category).join(",");
  if (cats !== "INTERIOR,ADDITIONAL") F(`a type the profile doesn't take was sent as ${cats || "nothing"}, expected INTERIOR then ADDITIONAL`);
  if (lastState(w).publish_state !== "published" || s.published !== 1) F(`the real photo didn't go up after the type was refused (${lastState(w).publish_state})`);
  if (w.logRows[0]?.category_sent !== "ADDITIONAL") F("the attempt didn't record the type actually sent (ADDITIONAL)");
  // any OTHER refusal is not retried as ADDITIONAL
  const w2 = world({ oauth: CONNECTED, photos: [photo({ category: "interior" })], google: () => ({ status: 400, body: { error: { message: "Invalid value at 'sourceUrl'" } } }) });
  await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w2.deps });
  if (w2.googleCalls.length !== 1) F(`a refusal that isn't about the type was retried (${w2.googleCalls.length} calls)`);
});

// ── 6 · claimed elsewhere → never sent twice ────────────────────────────────────────────────────
await scenario("claim lost", async () => {
  const w = world({ oauth: CONNECTED, photos: [photo()], claimLost: true });
  const s = await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w.deps });
  if (w.googleCalls.length) F("a photo another caller had already claimed was sent to Google again");
  if (s.skipped !== 1) F(`a lost claim was not counted as skipped (${s.skipped})`);
});

// ── 7 · the sweep's retry is capped ─────────────────────────────────────────────────────────────
await scenario("retry cap", async () => {
  const w = world({ oauth: CONNECTED, photos: [] });
  await publishClientPhotos({ clientId: "c1", trigger: "schedule", deps: w.deps });
  const q = decodeURIComponent(w.queries[0] || "");
  if (!Number.isFinite(MAX_ATTEMPTS) || MAX_ATTEMPTS < 1 || MAX_ATTEMPTS > 10) F(`MAX_ATTEMPTS is ${MAX_ATTEMPTS} — a retry must be capped, and low`);
  if (!q.includes(`publish_attempts.lt.${MAX_ATTEMPTS}`)) F("the sweep's query does not cap failed retries — a photo Google always refuses would be retried forever");
});

// ── source: the client's upload publishes, the sweep is scheduled, the log is append-only ──────
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const portalCode = strip(portal);
// 🔒 2026-10-09 — RGA REVIEWS BEFORE GOOGLE (photo_review_before_google_v1). The client's upload must NOT
// publish; it lands in_review, and only RGA's approval (admin-photo-review) sends it.
if (/photos-push-to-gbp/.test(portalCode)) F("the portal calls photos-push-to-gbp again — a client's upload would skip RGA's review");
if (!/publish_state:\s*"in_review"/.test(portalCode)) F("the portal's upload no longer files the photo for RGA's review");
const review = strip(read("netlify/functions/admin-photo-review.js"));
if (!/await requireWorkspaceForClient\(event, client_id\)/.test(review) || /requirePortalOwner/.test(review)) F("admin-photo-review is not RGA-only — a client could approve their own photo");
if (!/publish_state=eq\.in_review/.test(review)) F("a review is not conditional on in_review — a stale page could pull a published photo back, or approve twice");
if (!/out\.publish = await publishClientPhotos\(/.test(review)) F("approving does not publish through the one producer");
const reviewSql = read("docs/supabase/RGA_CLIENT_PHOTO_REVIEW_2026-10-09.sql").replace(/--.*$/gm, "");
if (!/new\.publish_state := 'in_review';/.test(reviewSql) || !/create trigger client_photos_force_review\s+before insert on public\.client_photos/.test(reviewSql)) {
  F("the database no longer forces a client's upload into review — an old or edited page could publish unseen");
}
if (/within 24 hrs/i.test(portalCode)) F("the portal still promises a 24-hour push");
const push = strip(read("netlify/functions/photos-push-to-gbp.js"));
if (/requirePortalOwner/.test(push) || !/await requireWorkspaceForClient\(event, client_id\)/.test(push)) F("photos-push-to-gbp admits the client's portal — it would publish photos RGA has not reviewed");
if (!/publishClientPhotos\(/.test(push)) F("photos-push-to-gbp does not use the one producer");
const sweep = strip(read("netlify/functions/photos-publish-sweep.js"));
if (!/publishClientPhotos\(/.test(sweep)) F("photos-publish-sweep does not use the one producer");
const toml = read("netlify.toml").split("\n");
const at = toml.findIndex((l) => l.trim() === '[functions."photos-publish-sweep"]');
const sched = at >= 0 && toml.slice(at + 1).find((l) => /^\s*(\[|schedule\s*=)/.test(l));
if (!sched || !/schedule\s*=\s*"[^"]+"/.test(sched)) F("photos-publish-sweep has no schedule — a photo uploaded before the connection never goes up");
// 🔑 SQL comments stripped: a commented-out trigger is no trigger.
const sql = read("docs/supabase/RGA_CLIENT_PHOTO_PUBLISHES_2026-10-08.sql").replace(/--.*$/gm, "");
if (!/create trigger client_photo_publishes_no_update\s+before update or delete on public\.client_photo_publishes/.test(sql)) {
  F("client_photo_publishes is not append-only in the database — the record of what happened can be rewritten");
}

console.log(`  ${Object.keys(GOOGLE_CATEGORY).length} categories · ${offered.length} offered by the portal · ${scenarios} scenarios run against the producer`);
if (fails.length) {
  console.error("🔴 a client's photo can fail to reach Google without anyone being told:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a client's photo reaches Google, or the client and the record say exactly why not");
