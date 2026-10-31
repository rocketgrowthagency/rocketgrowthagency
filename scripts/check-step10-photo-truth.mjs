#!/usr/bin/env node
// check-step10-photo-truth.mjs — 2026-10-30. Chris: "to say check mark done and not showing thats a disconnect and issue." Approved client_step10_photo_truth_v1. → project_step10_photo_truth
//
// Google's API has no Pending / Live status, so "on its list" is the most we know, and nothing may claim a customer can see a photo until a real test proves what can.
//   · no green tile, no tick, no "On your Google profile": Sent → On Google's list → Not on its list after 3 days (RGA told once) · Saved, not showing for a hidden logo
//   · the count leaves out a hidden logo and every second copy of the logo, in the portal AND the nightly (they must agree)
//   · Keep can be undone; a removal that would leave no photo customers can see is refused until RGA says remove anyway; up to 5 a day, an admin press isn't held
//   · the words in How this step works; every view count is kept for the test
// Everything runs on fakes. Nothing leaves the laptop. exit 0 = holds · 1 = regressed · 2 = can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), CSS = read("portal/portal.css"), AD = read("admin/admin.js");
// the shared file is ESM with no imports: run a copy so a mutated site dir is what's read
const SL = await import(`data:text/javascript,${encodeURIComponent(read("shared/photo-second-logo.js"))}`).catch((e) => { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); });

// ── the words and seats ──
if (/published: \{ cls: "ok"/.test(P)) fail("a published photo is green again");
if (/On your Google profile"/.test(P.slice(P.indexOf("const PHOTO_STATE = {"), P.indexOf("const photoStateOf")))) fail("a published photo says On your Google profile again");
if (!/const GS_LABEL = \{ hide: "Saved, not showing", sent: "Sent · up to 48 hours", list: "On Google's list", missing: "Not on Google's list yet" \};/.test(P)) fail("the states aren't the approved words");
if (/st === "on" \? `<span class="ok"/.test(P)) fail("a tile draws a tick again");
if (/\.pm-p10-t\.is-on \.im \{[^}]*state-ok/.test(CSS)) fail("a tile is green again");
if (!/ph\.gbp_media_name && listedNames\.has\(ph\.gbp_media_name\)\) return "list";/.test(P)) fail("On Google's list isn't read from Google's list");
if (!/Date\.now\(\) - at > 3 \* 86400000 \? "missing" : "sent"/.test(P)) fail("a photo missing after 3 days isn't said");
if (!/photoCountable\(taskState, photos\)/.test(P)) fail("the portal doesn't use the count");
for (const w of ["Use your own photos.", "Get a yes from anyone whose face is in a photo.", "Don't add location tags.", "a few a day.", "up to 48 hours"]) if (!P.slice(P.indexOf("const P10_RULES")).slice(0, 700).includes(w)) fail(`How this step works lost: ${w}`);
if (!/force: body\.force === true,/.test(read("netlify/functions/portal-photo-remove.js"))) fail("Remove anyway never reaches the removal");
if (!/data-keep-undo/.test(P) || !/\.\.\.\(undo \? \{ undo: true \} : \{\}\)/.test(P)) fail("the client can't undo Keep");
if (!/data-sl-undo-keep="\$\{escapeAttribute\(m\.name\)\}"/.test(AD) || !/needs_replacement/.test(AD) || !/okLabel: "Remove anyway"/.test(AD)) fail("admin can't undo Keep, or doesn't ask before removing the only photo");
if (!/apart from a logo Google hides or a second copy of your logo/.test(read("data/playbooks/client-steps.json")) || !/apart from a logo Google hides or a second copy of your logo/.test(read("data/playbooks/playbooks.json"))) fail("the step's line doesn't say what doesn't count");

// ── the count: same answer in the portal and the nightly ──
const LOGO = { n: 1, google: "PROFILE" };
const copy = { name: "m/copy", category: "EXTERIOR" }, prof = { name: "m/profile", category: "PROFILE" }, real = { name: "m/real", category: "INTERIOR" };
const task = (over = {}) => ({ draft_shape: { storefront: false, items: [LOGO] }, photo_ai: { google: { "m/copy": { slot: 1 }, "m/real": { slot: 9 } } }, detected: { n: 3, threshold: 20, source: "google_profile", items: [copy, prof, real] }, ...over });
if (SL.photoCountable(task()) !== 1) fail(`the count doesn't leave out the hidden logo and the copy (${SL.photoCountable(task())})`);
if (SL.photoCountable(task({ draft_shape: { storefront: true, items: [LOGO] } })) !== 2) fail("a storefront's logo doesn't count");
if (SL.photoCountable(task({ photo_kept: { "m/copy": { at: "x" } } })) !== 1) fail("a kept copy counts");
if (SL.photoCountable(task({ detected: { n: 1, n_all: 3, threshold: 20, source: "google_profile", items: [copy, prof, real] } })) !== 1) fail("the count isn't safe to read twice");
if (SL.photoCountable(task({ detected: { n: 3, threshold: 20, source: "sent_to_us" } })) !== 3) fail("the fallback count changed");

process.env.SUPABASE_URL = "https://fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.INTERNAL_FN_SECRET = "s"; process.env.GOOGLE_OAUTH_CLIENT_ID = "i"; process.env.GOOGLE_OAUTH_CLIENT_SECRET = "c"; process.env.URL = "https://fake.site.test";
const require = createRequire(`${SITE}/netlify/functions/portal-step-recheck.js`);
const CID = "00000000-0000-4000-8000-000000000001", realFetch = globalThis.fetch, ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
const restore = () => { console.log = log; console.error = err; };
let night, notified = [];
try {
  const old = new Date(Date.now() - 5 * 86400000).toISOString();
  let rec = { id: "r1", data: { tasks: { "m1.gbp.photos": { status: "pending", ...task() } } } };
  const photosRows = [{ id: "p1", file_name: "gone.jpg", gbp_media_name: "m/gone", pushed_at: old, shot_n: 9, publish_state: "published" }, { id: "p2", file_name: "fresh.jpg", gbp_media_name: "m/fresh", pushed_at: new Date().toISOString(), shot_n: 8, publish_state: "published" }, { id: "p3", file_name: "ok.jpg", gbp_media_name: "m/real", pushed_at: old, shot_n: 7, publish_state: "published" }];
  globalThis.fetch = async (u, o = {}) => { const url = String(u), m = o.method || "GET";
    if (/oauth2\.googleapis/.test(url)) return ok({ access_token: "t" });
    if (/notify-rga/.test(url)) { notified.push(JSON.parse(o.body).message); return ok({ delivered: true }); }
    if (/\/media\?/.test(url)) return ok({ totalMediaItemCount: 3, mediaItems: [{ name: "m/copy", locationAssociation: { category: "EXTERIOR" } }, { name: "m/profile", locationAssociation: { category: "PROFILE" } }, { name: "m/real", locationAssociation: { category: "INTERIOR" }, insights: { viewCount: "12" } }] });
    if (/client_google_oauth/.test(url)) return ok([{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }]);
    if (/client_onboarding_records/.test(url)) { if (m === "PATCH") { rec = { ...rec, data: JSON.parse(o.body).data }; return ok([rec]); } return ok([JSON.parse(JSON.stringify(rec))]); }
    if (/client_photos/.test(url)) return ok(photosRows);
    return ok([]); };
  const h = require("./portal-step-recheck.js").handler;
  await h({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, step_id: "m1.gbp.photos" }) });
  const first = rec.data.tasks["m1.gbp.photos"];
  const once = notified.length;
  await h({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, step_id: "m1.gbp.photos" }) });
  night = { d: first.detected, told: first.photo_missing_told, once, twice: notified.length };
  // a step that WAS done and moved back does tell RGA
  night.named = notified.some((m) => /gone\.jpg/.test(m));
  notified.length = 0; rec.data.tasks["m1.gbp.photos"].status = "done";
  await h({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, step_id: "m1.gbp.photos" }) });
  night.reopen = notified.filter((m) => /re-check FAILED, step reopened/.test(m)).length; night.status = rec.data.tasks["m1.gbp.photos"].status;
} catch (e) { restore(); globalThis.fetch = realFetch; console.error(`⚠️  INDETERMINATE — the nightly won't run on the fakes: ${e.message}`); process.exit(2); }
globalThis.fetch = realFetch; restore();
if (night.d?.n !== 1 || night.d?.n_all !== 3) fail(`the nightly's count isn't the portal's (${night.d?.n} of ${night.d?.n_all})`);
if (SL.photoCountable({ ...task(), detected: night.d }) !== night.d?.n) fail("the portal and the nightly disagree on the count");
if ((night.d?.items || []).find((x) => x.name === "m/real")?.views !== 12) fail("the view count isn't kept, so the test can't read it");
if (!night.told?.p1 || night.told?.p2 || night.told?.p3) fail(`only a photo missing for 3 days is reported (${JSON.stringify(night.told)})`);
if (night.reopen !== 1 || night.status !== "pending") fail(`a step that moved back doesn't tell RGA (${night.reopen} · ${night.status})`);
if (night.once !== 1 || !night.named || night.twice !== 1) fail(`RGA isn't told exactly once (${night.once} then ${night.twice})`);

// ── Keep can be undone ──
{ let store = { id: "r1", data: { tasks: { "m1.gbp.photos": { detected: { items: [copy] }, photo_kept: { "m/copy": { at: "x" } } } } } };
  globalThis.fetch = async (u, o = {}) => { const url = String(u), m = o.method || "GET";
    if (/client_onboarding_records/.test(url)) { if (m === "PATCH") { store = { ...store, data: JSON.parse(o.body).data }; return ok([store]); } return ok([JSON.parse(JSON.stringify(store))]); }
    return ok([{ id: "x", workspace_id: "w" }]); };
  console.log = () => {}; console.error = () => {};
  let r; try { const K = require("module"); const auth = require("./_auth"); const orig = auth.requirePortalOwnerOrWorkspace; auth.requirePortalOwnerOrWorkspace = async () => ({ email: "c@x.test" }); delete require.cache[require.resolve("./portal-photo-keep.js")];
    r = await require("./portal-photo-keep.js").handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, media_name: "m/copy", undo: true }) }); auth.requirePortalOwnerOrWorkspace = orig; void K; }
  catch (e) { restore(); globalThis.fetch = realFetch; console.error(`⚠️  INDETERMINATE — portal-photo-keep won't run: ${e.message}`); process.exit(2); }
  restore(); globalThis.fetch = realFetch;
  if (r.statusCode !== 200 || store.data.tasks["m1.gbp.photos"].photo_kept?.["m/copy"]) fail(`undoing Keep doesn't clear it (${r.statusCode})`); }

// ── removal waits for a replacement ──
{ const RM = require("./portal-photo-remove.js").removePhoto;
  const mk = (items) => { const w = { calls: [], rec: { tasks: { "m1.gbp.photos": { draft_shape: { storefront: false, items: [LOGO] }, photo_ai: { google: { "m/copy": { slot: 1 } } }, detected: { items } } } } };
    const res = (s, b) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    w.d = { now: () => Date.now(), gate: async () => ({ email: "r@x.test", viaWorkspace: true }), accessToken: async () => "t", recount: async () => {}, recordChange: async () => {}, fetch: async (u, i = {}) => { w.calls.push(i.method || "GET"); return (i.method || "GET") === "DELETE" ? res(200, {}) : res(404, {}); },
      readStepRecord: async () => ({ id: "r1", tasks: w.rec.tasks }), writeStepTasks: async (_s, _r, t) => ({ tasks: t }),
      supa: async (p) => p.startsWith("/client_google_oauth") ? [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }] : p.startsWith("/client_onboarding_records") ? [{ data: { tasks: w.rec.tasks } }] : p.startsWith("/client_photos") ? [] : null };
    return w; };
  const NAME = "accounts/1/locations/2/media/copy", it = { name: NAME, category: "EXTERIOR" }, hiddenLogo = { name: "accounts/1/locations/2/media/profile", category: "PROFILE" }, other = { name: "accounts/1/locations/2/media/real", category: "INTERIOR" };
  console.log = () => {}; console.error = () => {};
  const a = mk([it, hiddenLogo]); a.rec.tasks["m1.gbp.photos"].photo_ai.google = { [NAME]: { slot: 1 } };
  const r1 = await RM({ event: {}, clientId: CID, mediaName: NAME, cleanup: "second_logo", deps: a.d });
  const b = mk([it, hiddenLogo, other]); b.rec.tasks["m1.gbp.photos"].photo_ai.google = { [NAME]: { slot: 1 } };
  const r2 = await RM({ event: {}, clientId: CID, mediaName: NAME, cleanup: "second_logo", deps: b.d });
  const c = mk([it, hiddenLogo]); c.rec.tasks["m1.gbp.photos"].photo_ai.google = { [NAME]: { slot: 1 } };
  const r3 = await RM({ event: {}, clientId: CID, mediaName: NAME, cleanup: "second_logo", force: true, deps: c.d });
  restore();
  if (r1.statusCode !== 409 || !JSON.parse(r1.body).needs_replacement || a.calls.length) fail(`the only visible photo can be removed without saying so (${r1.statusCode})`);
  if (r2.statusCode !== 200) fail(`a copy with another photo beside it is refused (${r2.statusCode})`);
  if (r3.statusCode !== 200 || !c.calls.includes("DELETE")) fail("RGA can't remove it anyway"); }

// ── up to 5 a day ──
{ const { publishClientPhotos } = require("./_photo-publish.js");
  const due = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, publish_state: "pending", storage_path: "a.jpg", file_name: "a.jpg", category: "interior", created_at: `2026-10-0${i + 1}` }));
  const run = async (trigger, sentToday) => { let google = 0, sentQ = 0;
    const d = { now: () => Date.now(), supa: async (p, o = {}) => { if (p.startsWith("/client_photo_publishes")) { if ((o.method || "GET") === "GET") { sentQ++; return Array.from({ length: sentToday }, (_, i) => ({ id: i })); } return []; } if (p.startsWith("/client_photos?client_id")) return due.map((x) => ({ ...x })); if (p.startsWith("/client_photos?id")) return (o.method === "PATCH") ? [{ id: "x" }] : []; if (p.startsWith("/client_onboarding_records")) return [{ data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } } } } }]; if (p.startsWith("/client_google_oauth")) return [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }]; return []; },
      signUrl: async () => "https://x/a.jpg", accessToken: async () => "t", recordChange: async () => {}, recount: async () => {}, head: async () => ({ size: 50000 }), fileInfo: async () => ({ size: 50000 }),
      fetch: async (u, o = {}) => { if (o.method === "POST") google++; return { ok: true, status: 200, json: async () => ({ name: `m/${google}`, googleUrl: "g" }), text: async () => "{}" }; } };
    let s; try { s = await publishClientPhotos({ clientId: CID, trigger, deps: d }); } catch (e) { s = { threw: e.message }; } return { s, google, sentQ }; };
  console.log = () => {}; console.error = () => {};
  const free = await run("schedule", 0), some = await run("schedule", 3), full = await run("schedule", 5), adm = await run("admin", 5);
  restore();
  if (free.s.threw) { console.error(`⚠️  INDETERMINATE — the publisher threw on the fakes: ${free.s.threw}`); process.exit(2); }
  if (free.s.paced !== 2 || some.s.paced !== 5 || full.s.paced !== 7 || full.google !== 0) fail(`the daily cap isn't 5 (${free.s.paced} · ${some.s.paced} · ${full.s.paced} · ${full.google})`);
  if (adm.s.paced || adm.sentQ) fail("an admin press is held by the daily cap"); }

// Chris 10-31: "Ext to Exterior and Int Interior", under the tiles, in every team size; and the old copy's card reads on a phone
const P10J = read("portal/portal.js"), P10C = read("portal/portal.css");
const shortFn = /const short = \(g\) => \(\{([^}]*)\}\)\[g\] \|\| g;/.exec(P10J);
if (!shortFn) F.push("the tile label function moved: re-aim this check");
else if (/Exterior|Interior/.test(shortFn[1])) F.push("a tile shortens Exterior or Interior again");
if (!/@media \(max-width:560px\) \{ \.pm-arow-kept \.pm-cs-st \{ grid-template-columns:20px minmax\(0,1fr\); \} \.pm-arow-kept \.pm-cs-st > \.a \{ grid-column:2; \} \}/.test(P10C)) F.push("on a phone the old copy's card squeezes its words beside the button");
if (F.length) { console.error(`🔴 step 10 says more than Google tells us:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ step 10 says only what Google tells us: no green or tick until a test proves it; Sent, On Google's list, missing after 3 days (RGA told once), Saved not showing; the count leaves out a hidden logo and second copies in the portal and the nightly; Keep can be undone; the only visible photo isn't removed unasked; up to 5 a day");
