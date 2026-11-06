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
if (!/return photoMissingFromList\(ph, taskState\?\.detected\) \? "missing" : "sent";/.test(P)) fail("a photo missing after 3 days isn't said");
// 11-6 night fixer: two places read the count now (the card, and finish with fewer's N of 20, client_setup_fewer_v1 11-5); each is pinned, so one can't hide the other
if (!/const d = d0 && Number\.isFinite\(d0\.n\) \? \{ \.\.\.d0, n: photoCountable\(taskState, photos\) \} : d0;/.test(P)) fail("the portal doesn't use the count");
if (!/const n = photoCountable\(taskState, photos\), goal = F\.GOAL\[F\.PHOTO\];/.test(P)) fail("finish with fewer counts photos its own way (not the count)");
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
// Chris 10-31: tap a tile and the shot, upload box included, comes to the middle of the screen. Measured in a browser at 1200 and 400 wide when built.
const clickFn = P10J.slice(P10J.indexOf('e.target.closest("[data-p10-t], [data-p10-kind]")'), P10J.indexOf('e.target.closest("[data-p10-t], [data-p10-kind]")') + 2600);
if (!/\[data-p10-shot="\$\{n\}"\]`\)\?\.scrollIntoView\(\{ block: "center"/.test(clickFn)) F.push("tapping a tile doesn't bring its shot to the middle of the screen");
if (/if \(t\.hasAttribute\("data-p10-kind"\)[^\n]*scrollIntoView/.test(clickFn)) F.push("only some ways of picking a shot scroll to it");
if (/data-p10-kind="\$\{g\.items[^\n]*\n[^\n]*"main"/.test(P10J) || /<\/em><\/button>`, f === g\.items\.length \? "main"/.test(P10J)) F.push("a full kind's chip goes green before anyone has seen the photo on Google");
// 🔴 10-31: the upload's answer named the cover one thing, Google's list another, 4 seconds apart
{ const when = "2026-10-31T22:23:39Z", lst = [{ name: "list-name", category: "COVER", at: "2026-10-31T22:23:43Z" }, { name: "old", category: "EXTERIOR", at: "2025-12-02T16:41:12Z" }];
  if (SL.photoListedName({ category: "cover", gbp_media_name: "upload-name", pushed_at: when }, lst) !== "list-name") fail("a photo Google lists under another name isn't recognized as ours");
  if (SL.photoListedName({ category: "cover", gbp_media_name: "old", pushed_at: when }, lst) !== "old") fail("the name itself no longer matches");
  if (SL.photoListedName({ category: "cover", gbp_media_name: "x", pushed_at: "2026-10-25T00:00:00Z" }, lst) !== null) fail("a photo sent days apart is matched to another");
  if (SL.photoListedName({ category: "team", gbp_media_name: "x", pushed_at: when }, lst) !== null) fail("a photo of another kind is matched to it");
  if (SL.photoListedName({ category: "team", gbp_media_name: "x", pushed_at: when }, [{ name: "add", category: "ADDITIONAL", at: when }]) !== "add") fail("a photo Google refused the kind for, sent as Additional, isn't recognized");
  const RC = read("netlify/functions/portal-step-recheck.js");
  if (!/!photoOnList\(p, probe\.items, ours\) && !told\[p\.id\]/.test(RC)) fail("the nightly still checks the upload's name only, so a listed photo reads missing after 3 days");
  if (!/if \(listedNames\.get\(ph\)\) return "list";/.test(P)) fail("the client's tile still checks the upload's name only");
  if (!/if \(listedNames\.get\(p\)\) return "list"; return photoMissingFromList\(p, t\.detected\)/.test(AD)) fail("admin's tile doesn't use the same rule as the client's");
  // 🔒 audit 10-31: ONE TO ONE. Run on both copies of the rule (shared ESM, functions CommonJS), so they can't drift apart.
  const { photoListedNames: cjsNames } = require("./_photo-list-name.js");
  const t0 = "2026-10-31T10:00:00Z", at = (s) => new Date(Date.parse(t0) + s * 1000).toISOString();
  const cases = [
    { why: "two photos in a batch, one item on the list: only one may claim it", rows: [{ id: "a", category: "team", gbp_media_name: "up-a", pushed_at: at(0) }, { id: "b", category: "team", gbp_media_name: "up-b", pushed_at: at(2) }], list: [{ name: "L1", category: "TEAMS", at: at(5) }], want: { a: "L1", b: null } },
    { why: "an exact name claims before anyone's time match", rows: [{ id: "a", category: "team", gbp_media_name: "up-a", pushed_at: at(0) }, { id: "b", category: "team", gbp_media_name: "L1", pushed_at: at(2) }], list: [{ name: "L1", category: "TEAMS", at: at(5) }], want: { a: null, b: "L1" } },
    { why: "the same kind claims before Additional", rows: [{ id: "a", category: "team", gbp_media_name: "up-a", pushed_at: at(0) }, { id: "b", category: "interior", gbp_media_name: "up-b", pushed_at: at(1) }], list: [{ name: "X", category: "ADDITIONAL", at: at(3) }, { name: "I", category: "INTERIOR", at: at(4) }], want: { a: "X", b: "I" } },
    { why: "an item added before the send is someone else's", rows: [{ id: "a", category: "team", gbp_media_name: "up-a", pushed_at: at(0) }], list: [{ name: "old", category: "TEAMS", at: at(-300) }], want: { a: null } },
    { why: "a retired photo takes nothing by time", rows: [{ id: "a", category: "team", gbp_media_name: "up-a", pushed_at: at(0), publish_state: "replaced" }], list: [{ name: "L1", category: "TEAMS", at: at(5) }], want: { a: null } },
  ];
  for (const c of cases) for (const [label, fn] of [["shared", SL.photoListedNames], ["functions", cjsNames]]) {
    const m = fn(c.rows, c.list);
    for (const r of c.rows) if ((m.get(r) || null) !== c.want[r.id]) fail(`${label} rule: ${c.why}`);
  }
  // 🔴 only Google's own list, read 3+ days after the send, can say missing
  const sentAt = { pushed_at: at(0) }, later = at(4 * 86400);
  if (!SL.photoMissingFromList(sentAt, { source: "google_profile", at: later })) fail("a photo Google's list hasn't held for 3 days isn't said to be missing");
  if (SL.photoMissingFromList(sentAt, { source: "sent_to_us", at: later })) fail("a failed Google read says a photo is missing");
  if (SL.photoMissingFromList(sentAt, { source: "google_profile", at: at(3600) })) fail("a list read an hour after the send says a photo is missing");
  // 🔴 a failed read keeps the list and can't reopen a done step
  if (!/\.\.\.keepList,/.test(RC) || !/probe\.source === "sent_to_us" && Array\.isArray\(prevRead\?\.items\)/.test(RC)) fail("a failed Google read wipes the photo list");
  if (/keepList = [^\n]*\n[^\n]*n_all/.test(RC)) fail("a failed read keeps n_all, so the count stops being what was sent to us");
  if (!/probe\.source === "sent_to_us" && probe\.verdict === "not_done"\) \{\s*const cur = await readStepRecord[^\n]*\n\s*if \(cur\?\.tasks\?\.\[stepId\]\?\.status === "done"\) probe = \{ \.\.\.probe, verdict: "indeterminate" \};/.test(RC)) fail("a failed Google read can reopen a done photo step");
  if (!/photos\.source === "sent_to_us" \? "sent to us" : "on Google"/.test(AD)) fail("admin's header says \"on Google\" for a count of what was sent to us");
  // 🔴 a retake: the slot shows what's up, never the turned-down photo beside it
  if (!/const slotRank = \(p\) => \(isUp\(p\) \? 2 : p\.publish_state === "turned_down" \? 0 : 1\);/.test(AD) || /const byShot = new Map\(photos\.filter/.test(AD)) fail("admin's tile can show the turned-down photo with the retake already up");
  // 🔴 audit 10-31 mediums: RGA's move isn't only a review; Skip stays; a notice is stamped only when delivered; a street-address logo gets its Sent line; a zero that's no reading
  if (!/parts && parts\.rgaN \? "Your move"/.test(AD) || !/rgaWork = parts && parts\.rgaN/.test(AD)) fail("step 38 says Client's move with a failed send or photos to sort");
  if (!/reviewN: review\.length, rgaN: review\.length \+ broken\.length \+ photoToSortCount\(\)/.test(AD)) fail("step 38's move doesn't count failed sends and photos to sort");
  if (!/\.pr-wrap \[data-photo-zoom\]/.test(AD)) fail("View larger does nothing on the older review view");
  if (!/isUp\(p\) && p\.pushed_at && googleState\(p\) !== "hide"/.test(AD)) fail("a sent logo gets no Sent line for a client with a street address");
  if (!/!Number\.isFinite\(counted\) \? "Not checked yet"/.test(AD)) fail("no reading yet prints 0 on Google");
  if (!/row\.tasks\?\.\[stepId\]\?\.status !== "skipped"/.test(RC)) fail("the nightly undoes Skip");
  if (!/const told_ok = await tellRga\(/.test(RC) || !/if \(told_ok\) \{\s*const at = /.test(RC)) fail("a missing photo notice is stamped before it's delivered");
  if (!/if \(jr\.delivered === false\) \{[\s\S]{0,160}return false;/.test(RC)) fail("an undelivered notice counts as told");
  // 🔴 deletes: run the real function on a fake Google
  const { deleteGoogleMedia } = require("./_photo-retire.js");
  const PFX = "accounts/1/locations/2/media/";
  const google = ({ listed = [], listFails = false, deletes = true }) => {
    const calls = [], have = new Set(listed.map((g) => g.name));
    const res = (status, body = {}) => ({ ok: status < 400, status, json: async () => body });
    return { calls, have, fetch: async (url, init = {}) => {
      const m = init.method || "GET", tail = url.split("/v4/")[1];
      calls.push(`${m} ${tail}`);
      if (/\/media\?/.test(tail)) return listFails ? res(500) : res(200, { mediaItems: [...have].map((name) => { const g = listed.find((x) => x.name === name); return { name, createTime: g.at, locationAssociation: { category: g.category } }; }) });
      if (m === "DELETE") { if (!have.has(tail)) return res(404); if (deletes) have.delete(tail); return res(200); }
      return have.has(tail) ? res(200, { name: tail }) : res(404);
    } };
  };
  const ph = { id: "a", category: "cover", gbp_media_name: `${PFX}upload`, pushed_at: at(0) };
  { const g = google({ listed: [{ name: `${PFX}listed`, category: "COVER", at: at(4) }] });
    const r = await deleteGoogleMedia(g, "t", ph.gbp_media_name, { photo: ph, rows: [ph] });
    if (!r.ok || g.have.size !== 0 || !g.calls.includes(`DELETE ${PFX}listed`)) fail("a photo Google lists under another name isn't deleted under that name"); }
  { const g = google({ listed: [{ name: `${PFX}other`, category: "EXTERIOR", at: at(4) }], listFails: true });
    const r = await deleteGoogleMedia(g, "t", ph.gbp_media_name, { photo: ph, rows: [ph] });
    if (r.ok) fail("a 404 with no list to check still claims the photo is gone"); }
  { const g = google({ listed: [] });
    const r = await deleteGoogleMedia(g, "t", ph.gbp_media_name, { photo: ph, rows: [ph] });
    if (!r.ok) fail("a photo truly not on Google can't be cleared"); }
  { const g = google({ listed: [{ name: ph.gbp_media_name, category: "COVER", at: at(4) }], deletes: false });
    const r = await deleteGoogleMedia(g, "t", ph.gbp_media_name, { photo: ph, rows: [ph] });
    if (r.ok) fail("a photo Google still holds after the delete reads as gone"); }
}
// ── audit 10-31 lows 20, 21, 24, 25, 26, 28, 29, 42 (the leftovers) ──
if (!/sl\.kept\.map\(\(kg\) =>/.test(P)) fail("two kept copies show one card again (sl.kept[0] only)");
if (!/Number\(probe\.n_all\) > probe\.items\.length \? \[\] :/.test(read("netlify/functions/portal-step-recheck.js"))) fail("past the 200-item cap a photo reads as missing from Google again");
if (!/existingHtml: existingHtml\.replace\(\/#pmx-\/g, "#prx-"\)/.test(AD)) fail("the to-sort example art points at a missing symbol again");
if (!/if \(el\.children\.length\) \{ const m = document\.createElement\("span"\)/.test(AD)) fail("a failed preview wipes the tile's status label again");
if (!/img\.onerror = \(\) => \{/.test(AD.slice(AD.indexOf("function openPhotoZoom"), AD.indexOf("function openPhotoZoom") + 1500))) fail("View larger shows a blank box when the photo won't load");
if (!/resultBlock, \{ rerun: qRerun \}\)/.test(AD)) fail("a queued step 38 row has no Run again");
if (!/gs === "sent" && ph && !ph\.pushed_at \? "Sent"/.test(P) || !/googleState\(p\) === "sent" && !p\.pushed_at \? "Sent"/.test(AD)) fail("a photo with no send date reads Up to 48 hours forever");
if (!/steps\.find\(\(e\) => e\.classList\.contains\("has-undo-ask"\)\)/.test(AD)) fail("a client's undo request sits in a folded row again");
if (F.length) { console.error(`🔴 step 10 says more than Google tells us:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ step 10 says only what Google tells us: no green or tick until a test proves it; Sent, On Google's list, missing after 3 days (RGA told once), Saved not showing; the count leaves out a hidden logo and second copies in the portal and the nightly; Keep can be undone; the only visible photo isn't removed unasked; up to 5 a day");
