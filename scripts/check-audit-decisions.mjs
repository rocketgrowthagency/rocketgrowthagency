#!/usr/bin/env node
// check-audit-decisions.mjs — the seven audit decisions Chris approved 10-31 (reports/mockups/audit_decisions_v1.html) stay true.
//   1 · the bulk photo send is held to 5 a day and the hourly sweep sends the rest; a press on one photo isn't held
//   2 · admin step 38's Everything on Google fold lists what RGA sent and what Google lists, and doesn't call a later photo "before RGA"
//   3 · a business with no street address can finish client step 10: one count on the card, the row and admin, and a way to add the photo
//   4 · the kept copy says "You asked to keep it · Let RGA remove it"; the cover line only when it really is the only visible photo (same rule as the removal guard)
//   5 · an approved description: the step says so, one press by RGA, read back, the result on the step, a refusal in plain words; nothing presses for RGA; the two guards still refuse
//   6 · a sent photo says up to 48 hours as an estimate, in both portals; no line claims what was seen on Maps
//   7 · the listings check runs itself once when setup reaches it: claimed first, once per client, never loops, however the run ends
// Everything runs on fakes: real modules, a stubbed network. Nothing reaches Google, SerpAPI or a database. exit 0 = holds · 1 = regressed · 2 = can't tell
import { adminCardLift } from "./lib/admin-card-lift.mjs";   // card_notice_designs_v1 §1 (11-11): admin cards draw through shared/admin-card.js
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const can = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [], fail = (m) => F.push(m);
const AD = read("admin/admin.js"), P = read("portal/portal.js");
const SL = await import(`data:text/javascript,${encodeURIComponent(read("shared/photo-second-logo.js"))}`).catch((e) => can(e.message));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tick = /&#39;|'/.source;

process.env.SUPABASE_URL = "https://fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.INTERNAL_FN_SECRET = "s"; process.env.GOOGLE_OAUTH_CLIENT_ID = "i"; process.env.GOOGLE_OAUTH_CLIENT_SECRET = "c"; process.env.URL = "https://fake.site.test";
const require = createRequire(`${SITE}/netlify/functions/gbp-publish.js`);
const CID = "00000000-0000-4000-8000-000000000001";
const log = console.log, err = console.error; const quiet = () => { console.log = () => {}; console.error = () => {}; }, loud = () => { console.log = log; console.error = err; };
const realFetch = globalThis.fetch;

// ── 1 · five a day ─────────────────────────────────────────────────────────────────────────────
{
  const { publishClientPhotos, DAILY_CAP } = require("./_photo-publish.js");
  if (DAILY_CAP !== 5) fail(`the daily cap isn't 5 (${DAILY_CAP})`);
  // a little world with a clock: 14 approved photos, one press, then the hourly sweep for four days
  const H = 3600000, T0 = Date.parse("2026-11-02T18:00:00Z");
  let now = T0;
  const photos = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, publish_state: "pending", storage_path: "a.jpg", file_name: `${i}.jpg`, category: "interior", created_at: `2026-10-${String(i + 10)}` }));
  const log14 = []; let google = 0;
  const deps = () => ({ now: () => now, signUrl: async () => "https://x/a.jpg", accessToken: async () => "t", recordChange: async () => {}, recount: async () => {}, notifyRga: async () => {},
    fetch: async () => { google++; return { ok: true, status: 200, json: async () => ({ name: `accounts/1/locations/2/media/${google}`, googleUrl: "g" }) }; },
    supa: async (p, o = {}) => {
      const m = o.method || "GET";
      if (p.startsWith("/client_photo_publishes")) {
        if (m === "POST") { log14.push(JSON.parse(o.body)); return []; }
        const since = decodeURIComponent((/attempted_at=gte\.([^&]+)/.exec(p) || [])[1] || "");
        return log14.filter((r) => r.outcome === "published" && r.attempted_at >= since).map((r) => ({ id: r.photo_id }));
      }
      if (p.startsWith("/client_photos")) {
        const idm = /[?&]id=eq\.([^&]+)/.exec(p);
        if (m === "PATCH") { const row = photos.find((x) => x.id === idm?.[1]); if (!row) return []; const st = /publish_state=eq\.([^&]+)/.exec(p); if (st && row.publish_state !== decodeURIComponent(st[1])) return []; Object.assign(row, JSON.parse(o.body)); return [row]; }
        const ids = /[?&]id=in\.\(([^)]+)\)/.exec(p);
        const due = photos.filter((x) => x.publish_state === "pending" && (!ids || decodeURIComponent(ids[1]).split(",").includes(x.id)));
        return due.map((x) => ({ ...x }));
      }
      if (p.startsWith("/client_onboarding_records")) return [{ data: { tasks: { "m1.audit.gbp_duplicate": { status: "done", outcome_data: { verdict: "clean" } }, "m1.gbp.verify": { status: "done" } } } }];
      if (p.startsWith("/client_google_oauth")) return [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }];
      if (p.startsWith("/clients")) return [{ workspace_id: "w" }];
      return [];
    } });
  quiet();
  let press;
  try {
    press = await publishClientPhotos({ clientId: CID, trigger: "admin", paced: true, photoIds: photos.map((x) => x.id), deps: deps() });
    const byDay = [google];
    for (let h = 1; h <= 96; h++) { now = T0 + h * H; await publishClientPhotos({ clientId: CID, trigger: "schedule", deps: deps() }); if (h % 24 === 0) byDay.push(google); }
    loud();
    if (press.published !== 5 || press.paced !== 9) fail(`the bulk press isn't held to 5 (${press.published} went, ${press.paced} held)`);
    // a window of 24 hours never holds more than 5, and it's over inside 3 days of the press
    const times = log14.filter((r) => r.outcome === "published").map((r) => Date.parse(r.attempted_at)).sort((x, y) => x - y);
    const worst = Math.max(...times.map((t) => times.filter((u) => u >= t && u < t + 24 * H).length));
    if (worst > 5) fail(`${worst} photos went inside 24 hours`);
    if (byDay[0] !== 5 || byDay[3] !== 14 || times[times.length - 1] > T0 + 72 * H) fail(`14 approved photos aren't done in 3 days at 5 a day: ${byDay.join(" · ")}`);
    if (byDay[4] !== 14) fail("the sweep sent more than was approved");
    // a press on ONE photo is a person deciding about that photo, at the cap or not
    now = T0; photos.forEach((x) => { x.publish_state = "pending"; }); log14.length = 0; google = 0;
    for (let i = 0; i < 5; i++) log14.push({ outcome: "published", attempted_at: new Date(T0 - H).toISOString(), photo_id: `old${i}` });
    quiet();
    const one = await publishClientPhotos({ clientId: CID, trigger: "admin", photoIds: ["p0"], deps: deps() });
    const held = await publishClientPhotos({ clientId: CID, trigger: "admin", paced: true, photoIds: ["p1", "p2"], deps: deps() });
    loud();
    if (one.published !== 1 || one.paced) fail("a press on one photo is held by the daily cap");
    if (held.published !== 0 || held.paced !== 2) fail(`a bulk press at the cap still sends (${held.published})`);
  } catch (e) { loud(); can(`the publisher threw on the fakes: ${e.message}`); }
  const RV = read("netlify/functions/admin-photo-review.js"), PU = read("netlify/functions/photos-push-to-gbp.js");
  if (!/const paced = body\.paced === true \|\| \(Array\.isArray\(photo_ids\) && photo_ids\.length > 1\);/.test(RV) || !/photoIds: moved\.map\(\(p\) => p\.id\), paced \}\)/.test(RV)) fail("admin-photo-review doesn't pass the bulk press on as paced");
  if (!/paced: true,/.test(PU)) fail("Try again sends every approved photo at once, past the 5 a day");
  if (!/reviewPhotos\("approve", ids\.map\(\(id\) => \(\{ id, category: kindOf\(id\) \}\)\), "", \{ paced: true \}\);/.test(AD)) fail("the bulk button doesn't ask for the pace");
  if (!/paced \? \{ paced: true \} : \{\}/.test(AD)) fail("the pace never reaches the server");
  if (/Send the \$\{fitting/.test(AD)) fail("the bulk button still says Send the N that fit");
}

// ── the admin renderer, lifted as check-a-photo-never-goes-up-twice lifts it ───────────────────
const cutA = (a, b) => { const i = AD.indexOf(a), j = i < 0 ? -1 : AD.indexOf(b, i); return i < 0 || j < 0 ? null : AD.slice(i, j); };
const partA = cutA("const PHOTO_KIND_LABEL = {", "let photoAiAsked"), partB = cutA("// 🔒 THE SAME FILE IN TWO SLOTS", "\n// 🔴 PHOTOS ARRIVE WHENEVER");
const citAuto = cutA("function citAutoHtml(task) {", "\nfunction citNapHtml(task) {");
const pillSrc = cutA("function wcRowPill(id, t) {", "\nconst wcRowPillHtml");
if (!partA || !partB || !citAuto || !pillSrc) can("could not lift the step 38 / step 33 / step 18 renderers");
const NAME = (x) => `accounts/1/locations/2/media/${x}`;
const shotItems = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, group: i === 0 ? "Logo" : i === 1 ? "Cover" : "Work", google: i === 0 ? "PROFILE" : i === 1 ? "COVER" : "AT_WORK", do: `Shot ${i + 1}` }));
const actx = { MutationObserver: class { observe() {} disconnect() {} }, document: { documentElement: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }, window: {}, globalThis: {},
  secondLogos: SL.secondLogos, tidiedByRga: SL.tidiedByRga, FILED_AS: SL.FILED_AS, photoListedNames: SL.photoListedNames, photoMissingFromList: SL.photoMissingFromList, photoCountable: SL.photoCountable, photoLiveByLine: SL.photoLiveByLine, photoOnlyVisible: SL.photoOnlyVisible, photoShortfall: SL.photoShortfall,
  escapeHtml: esc, escapeAttribute: esc, PHOTO_REVIEW_STEP: "m1.gbp.photos", PHOTO_EXAMPLE_SPRITE: "", ADMIN_PHOTO_STATE: { pending: { label: "Approved" } }, photoExampleOf: () => ({ art: "x" }), photoExampleArt: () => "<svg></svg>", artKey: (s, it) => `E|g|${it.n}`, formatDateTime: () => "Oct 9", obNumberOf: () => 11,
  OL_G: "<svg></svg>", OB_WEB_TILE: "<svg></svg>", adminGcardWhen: (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", 3:30 AM" : ""), adminGoogleCardHtml: (o) => `<div class="ob-gcard ${o.state}"><i>${o.small}</i><u>${o.side || ""}</u><b>${o.title}</b>${o.body || ""}</div>`, adminGcardMaps: () => "", state: { selectedClient: { id: "c1", created_at: "2026-05-01T00:00:00Z" }, photos: [], onboardingData: { tasks: {} } } };
vm.createContext(actx); vm.runInContext(adminCardLift(SITE, AD), actx); actx.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */ 
try { vm.runInContext(`${partA}\n${partB}\n${citAuto}\n${pillSrc}\nthis.review = photoReviewHtml; this.waitCard = photosWaitCardHtml; this.waitState = photosWaitState; this.every = photoEverythingHtml; this.pace = photoPaceLine; this.toPublish = descriptionToPublish; this.pubCard = descriptionPublishCardHtml; this.citAuto = citAutoHtml; this.pill = wcRowPill;`, actx); }
catch (e) { can(`the admin renderers did not load: ${e.message}`); }

// the button's line says what it will do
{
  const LINE = "5 go today, then 5 a day. Done in 3 days. The hourly sweep sends them.";
  if (actx.pace(14, 0, []) !== LINE) fail(`the bulk line isn't the mockup's: ${actx.pace(14, 0, [])}`);
  if (actx.pace(3, 0, []) !== "All 3 go today.") fail(`a batch that fits today doesn't say so: ${actx.pace(3, 0, [])}`);
  const today = new Date(Date.now() - 3600000).toISOString(), sent = (n) => Array.from({ length: n }, () => ({ client_id: "c1", pushed_at: today }));
  if (!/^2 go today, then 5 a day\. Done in 2 days\./.test(actx.pace(6, 0, sent(3)))) fail(`what went up today doesn't use today's room: ${actx.pace(6, 0, sent(3))}`);
  if (!/^Today's are sent, then 5 a day\. Done in 3 days\./.test(actx.pace(14, 0, sent(5)))) fail(`a day already at 5 still promises some today: ${actx.pace(14, 0, sent(5))}`);
  if (!/^3 go today, then 5 a day/.test(actx.pace(6, 2, [])) || !/^2 go today, then 5 a day/.test(actx.pace(3, 3, []))) fail(`photos already approved don't go first: ${actx.pace(3, 3, [])}`);
  if (!/const PHOTO_DAILY_CAP = 5;/.test(AD)) fail("admin's line and the server's cap can disagree");
  actx.state.photos = Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, client_id: "c1", shot_n: i + 3, category: "at_work", publish_state: "in_review", storage_path: `c/${i}.jpg`, created_at: "2026-11-01T10:00" }));
  actx.state.onboardingData = { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } }, "m1.gbp.photos": { draft_shape: { items: shotItems }, photo_matches: {}, photo_ai: { uploads: Object.fromEntries(actx.state.photos.map((p) => [p.id, { matches: true, what: "work" }])) } } } };
  const h = actx.review();
  if (!/data-photo-approve-all="[^"]+">Approve the 14 that fit</.test(h)) fail("the bulk button doesn't say Approve the 14 that fit");
  if (!h.includes(esc(LINE))) fail("the card doesn't show the bulk line");
}

// ── 2 · Everything on Google ───────────────────────────────────────────────────────────────────
{
  const task = { draft_shape: { items: shotItems, storefront: false }, photo_matches: {}, photo_ai: { google: {} }, detected: { n: 3, threshold: 20, source: "google_profile", at: "2026-11-01T06:02:00Z",
    items: [{ name: NAME("cov"), category: "COVER", at: "2026-10-31T22:23:43Z" }, { name: NAME("extra"), category: "ADDITIONAL", at: "2026-10-20T10:00:02Z" }, { name: NAME("old"), category: "EXTERIOR", at: "2025-12-02T16:41:12Z", thumb: "t" }, { name: NAME("later"), category: "INTERIOR", at: "2026-08-01T00:00:00Z" }, { name: NAME("profile"), category: "PROFILE", at: "1970-01-01T00:00:00Z" }] } };
  actx.state.photos = [
    { id: "c", client_id: "c1", shot_n: 2, category: "cover", publish_state: "published", storage_path: "c.jpg", pushed_at: "2026-10-31T22:23:39Z", gbp_media_name: "upload-name" },
    { id: "x", client_id: "c1", shot_n: null, category: "additional", publish_state: "published", storage_path: "x.jpg", pushed_at: "2026-10-20T10:00:00Z", gbp_media_name: NAME("extra") },
    { id: "gone", client_id: "c1", shot_n: 5, category: "at_work", publish_state: "removed", storage_path: "g.jpg", pushed_at: "2026-10-01T10:00:00Z", gbp_media_name: NAME("g") },
  ];
  actx.state.onboardingData = { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } }, "m1.gbp.photos": task } };
  const h = actx.every();
  if (!/data-zc-everything/.test(h) || !/<b>Everything on Google · 5<\/b>/.test(h) || !/older photos, and ones with no slot/.test(h)) fail(`the fold's head isn't right: ${h.slice(0, 160)}`);
  if (!/Cover · sent Oct 31/.test(h) || !/On Google(&#39;|')s list/.test(h) || !/On the list/.test(h)) fail("a photo RGA sent doesn't read Cover · sent Oct 31, On Google's list");
  if (!/Exterior · on the profile before RGA/.test(h) || !/Added Dec 2, 2025/.test(h) || !/Theirs/.test(h)) fail("a photo from before RGA doesn't read Exterior · on the profile before RGA, Added Dec 2, 2025, Theirs");
  if (!/Interior · added outside RGA/.test(h) || /Interior · on the profile before RGA/.test(h)) fail("a photo added after the client started is called before RGA");
  if (!/no slot/.test(h.slice(h.indexOf("sent Oct 20"), h.indexOf("sent Oct 20") + 200))) fail("a photo with no slot doesn't say so");
  if (/Added Jan 1, 1970|Dec 31, 1969/.test(h)) fail("Google's placeholder date on a logo is printed as a date");
  if (/sent Oct 1\b/.test(h)) fail("a removed photo is listed as on Google");
  if (/live on maps|showing on maps|shows on maps/i.test(h)) fail("the fold claims what shows on Maps");
  actx.state.onboardingData = { tasks: { "m1.gbp.photos": { draft_shape: { items: shotItems } } } }; actx.state.photos = [];
  if (actx.every() !== "") fail("an empty profile still draws the fold");
  // on every state of the step
  if (!/\$\{photoEverythingHtml\(\)\}\s*<\/div>`\.replace\(\/#pmx-\/g/.test(AD)) fail("the fold isn't on the step's full state (done, or all shots up)");
  if (!/typeof photoEverythingHtml === "function" \? photoEverythingHtml\(\) : ""/.test(AD)) fail("the fold isn't on the card the row shows while the client owes photos");
}

// ── 3 · no street address, every shot filled ───────────────────────────────────────────────────
{
  const up = (n, cat = "at_work") => ({ id: `s${n}`, shot_n: n, category: cat, publish_state: "published", storage_path: `${n}.jpg`, pushed_at: "2026-10-01T10:00:00Z", gbp_media_name: NAME(`s${n}`) });
  const all = () => [up(1, "logo"), up(2, "cover"), ...Array.from({ length: 18 }, (_, i) => up(i + 3))];
  const list = () => all().map((p) => ({ name: p.gbp_media_name, category: p.category === "logo" ? "PROFILE" : p.category === "cover" ? "COVER" : "AT_WORK", at: "2026-10-01T10:00:01Z" }));
  const T = (storefront, extra = {}) => ({ status: "pending", draft_shape: { items: shotItems, storefront }, detected: { n: storefront ? 20 : 19, n_all: 20, threshold: 20, source: "google_profile", items: list(), at: "2026-10-30T00:00:00Z" }, ...extra });
  const sa = SL.photoShortfall(T(false), all());
  if (!sa || sa.counted !== 19 || sa.left !== 1 || sa.short !== 1 || !sa.hiddenLogo) fail(`a service-area client with every shot filled isn't told it's one short (${JSON.stringify(sa)})`);
  if (SL.photoShortfall(T(true), all())) fail("a storefront at 20 is told it's short");
  const inReview = [...all(), { id: "e", shot_n: null, category: "additional", publish_state: "in_review" }];
  if (SL.photoShortfall(T(false), inReview)) fail("a photo with RGA that closes the gap still asks for another");
  for (const st of ["pending", "publishing", "waiting_connection", "failed"]) if (SL.photoShortfall(T(false), [...all(), { id: "e", shot_n: null, category: "additional", publish_state: st }])) fail(`a photo that's ${st} still asks for another`);
  const noCopy = all().filter((p) => p.shot_n !== 7);
  if (SL.photoShortfall(T(false), noCopy)) fail("an empty shot asks for an extra instead of the shot");
  const retake = all().map((p) => (p.shot_n === 7 ? { ...p, publish_state: "turned_down" } : p));
  if (SL.photoShortfall(T(false), retake)) fail("a turned-down shot counts as filled");
  if (SL.photoShortfall({ ...T(false), detected: { n: 19, threshold: 20, source: "sent_to_us", items: list() } }, all())) fail("a failed Google read says the client is short");
  if (SL.photoShortfall({ status: "pending" }, all())) fail("no reading and no list is read as short");
  const copyTask = T(true, { photo_ai: { google: { [NAME("s3")]: { slot: 1 } } } });
  copyTask.detected.n = 19;
  const sc = SL.photoShortfall(copyTask, all().map((p) => (p.shot_n === 3 ? { ...p, gbp_media_name: "other", pushed_at: "2020-01-01T00:00:00Z" } : p)));
  if (sc && sc.secondCopies !== 1) fail("a second copy isn't named as the reason");
  // admin keeps the card and says the same count
  actx.state.photos = all().map((p) => ({ ...p, client_id: "c1" }));
  actx.state.onboardingData = { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } }, "m1.gbp.photos": T(false, { detected: { ...T(false).detected, have: { PROFILE: 1, COVER: 1, AT_WORK: 18 } } }) } };
  const t38 = actx.state.onboardingData.tasks["m1.gbp.photos"];
  if (!actx.waitState(t38)) fail("admin step 38 drops its card while the client is still a photo short");
  const c38 = actx.waitCard(t38, { clientStepNo: 10 });
  if (!/<b>19<\/b> \/ 20 on Google/.test(c38) || !/Every shot is filled, but 19 of 20 count: Google hides the logo/.test(c38) || !/one more photo/.test(c38)) fail("admin step 38 doesn't read the same count as the client's card");
  // the client's card and row
  const cut = (start, end) => { const i = P.indexOf(start); if (i < 0) can(`moved: ${start.slice(0, 30)}`); const j = P.indexOf(end, i); if (j < 0) can(`moved: the end of ${start.slice(0, 30)}`); return P.slice(i, j); };
  const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
  process.removeAllListeners("warning");
  const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href), AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
  const pc = { secondLogos: SL.secondLogos, photoListedNames: SL.photoListedNames, photoLiveByLine: SL.photoLiveByLine, photoOnlyVisible: SL.photoOnlyVisible, photoShortfall: SL.photoShortfall, photoMissingFromList: SL.photoMissingFromList, photoCountable: SL.photoCountable, tidiedByRga: SL.tidiedByRga, FILED_AS: SL.FILED_AS, escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console, Date };
  vm.createContext(pc); pc.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */ 
  try { const kit = planCardKit(P, [stateSrc, bigSrc, slotsSrc].join("\n")); vm.runInContext(`${kit}\n${csBlock(P, kit)}\n${stateSrc}\n${bigSrc}\n${slotsSrc}\nthis.render = photoSlotsHtml;`, pc); }
  catch (e) { can(`step 10's renderer doesn't load (${e.message})`); }
  const STEP = { id: "m1.gbp.photos", clientForm: "photo_upload" }, open = { open: true, state: "one" };
  const h = pc.render(STEP, T(false), all(), "c1", "", open);
  if (!/19 of 20 on Google · 1 to go/.test(h)) fail("the client's card doesn't read 19 of 20 on Google · 1 to go");
  if (!new RegExp(`Your logo is saved but Google doesn(${tick})t show it for your kind of profile, so it doesn(${tick})t count\\.`).test(h)) fail("the card doesn't say why the logo doesn't count");
  if (!/Add one more photo<input type="file"[^>]*data-slot-file data-batch data-more data-cat="additional" data-empty=""/.test(h)) fail("there's no way to add the photo that finishes the step");
  if (/data-more[^>]*data-shot-n/.test(h)) fail("the extra photo is filed under a shot");
  if (new RegExp(`<div class="pm-cs-note"><b>Why it isn't showing:</b> Google only shows a logo[^<]*Nothing to do`).test(h)) fail("the card says Nothing to do beside Add one more photo");
  const st = pc.render(STEP, T(true), all(), "c1", "", open);
  if (/data-more/.test(st)) fail("a storefront at 20 is offered an extra photo");
  const fromReview = pc.render(STEP, T(false), inReview, "c1", "", open);
  if (/data-more/.test(fromReview)) fail("the control stays once the extra photo is with RGA");
  const allSent = cut("function photosAllSent(step, taskState, photos) {", "\n/** Step 7's note");
  if (!/if \(photoShortfall\(taskState, photos\)\) return null;/.test(allSent)) fail("the row still says All 20 sent · nothing needed from you");
  if (!/photoShort: open && s\.id === "m1\.gbp\.photos" \? photoShortfall\(ts, photos\) : null/.test(P) || !/\$\{photoShort\.counted\} of \$\{photoShort\.threshold\} on Google · \$\{photoShort\.left\} to go/.test(P)) fail("the row doesn't read the card's count");
  if (!/const moreCtl = input\.hasAttribute\("data-more"\)/.test(P) || !/moreCtl\.classList\.add\("is-busy"\)/.test(P) || !/moreCtl\.classList\.remove\("is-busy"\)/.test(P)) fail("Add one more photo doesn't spin while it uploads");

  // ── 4 · the kept copy ──
  const copy = { name: NAME("copy"), category: "EXTERIOR", at: "2025-12-02T16:41:12Z" }, prof = { name: NAME("profile"), category: "PROFILE" }, real = { name: NAME("real"), category: "INTERIOR" }, cover = { name: NAME("cover"), category: "COVER" };
  const K = (items, extra = {}) => ({ status: "pending", draft_shape: { items: shotItems, storefront: false }, detected: { n: 1, n_all: items.length, threshold: 20, source: "google_profile", items, at: "2026-11-01T00:00:00Z" }, photo_ai: { google: { [copy.name]: { slot: 1 } } }, photo_kept: { [copy.name]: { at: "2026-10-16T01:58:45Z" } }, ...extra });
  const kOnly = pc.render(STEP, K([copy, prof]), [], "c1", "", open), kCover = pc.render(STEP, K([copy, prof, cover]), [], "c1", "", open);
  for (const [nm, x] of [["the only photo", kOnly], ["beside a cover", kCover]]) {
    if (!/You asked to keep it/.test(x) || !/>Let RGA remove it</.test(x)) fail(`kept (${nm}): it doesn't say You asked to keep it · Let RGA remove it`);
    if (/Customers can see this copy/.test(x)) fail(`kept (${nm}): "Customers can see this copy" for everyone`);
    if (new RegExp(`RGA won(${tick})t remove it`).test(x)) fail(`kept (${nm}): "RGA won't remove it"`);
  }
  if (!new RegExp(`It(${tick})s the only photo customers can see right now`).test(kOnly) || !/your cover photo is on Google/.test(kOnly)) fail("the cover line is missing when this copy IS the only visible photo");
  if (/your cover photo is on Google/.test(kCover.slice(kCover.indexOf("You asked to keep it"), kCover.indexOf("You asked to keep it") + 400))) fail("the cover line shows when another photo is visible");
  if (/RGA won(&#39;|')t remove it|We(&#39;|')ll keep it/.test(cut("// 🔒 KEEP IT (second_logo_cleanup_v1)", "// 🔒 step 7's team size"))) fail("the toast still says RGA won't remove it");
  if (!/<b>Old logo copy<\/b>/.test(AD) || /the one customers see/.test(AD) || /It comes off once the cover photo is on Google/.test(AD)) fail("admin's kept row still promises the copy comes off");
  // the same answer as the guard that refuses the removal
  const RM = require("./portal-photo-remove.js").removePhoto;
  const shapes = [["only + hidden logo", [copy, prof], false, {}, true], ["beside a real photo", [copy, prof, real], false, {}, false], ["beside a cover the AI calls the logo", [copy, prof, cover], false, { [cover.name]: { slot: 1 } }, false],
    ["a storefront's logo shows", [copy, prof], true, {}, false], ["another second copy", [copy, prof, real], false, { [real.name]: { slot: 1 } }, true]];
  for (const [nm, items, storefront, ai, want] of shapes) {
    const t = { draft_shape: { items: shotItems, storefront }, photo_ai: { google: { [copy.name]: { slot: 1 }, ...ai } }, detected: { source: "google_profile", items } };
    if (SL.photoOnlyVisible(t, copy.name) !== want) fail(`photoOnlyVisible is wrong for ${nm}`);
    const d = { now: () => Date.now(), gate: async () => ({ email: "r@x.test", viaWorkspace: true }), accessToken: async () => "t", recount: async () => {}, recordChange: async () => {}, fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" }), readStepRecord: async () => ({ id: "r", tasks: { "m1.gbp.photos": t } }), writeStepTasks: async (_s, _r, tk) => ({ tasks: tk }),
      supa: async (p) => (p.startsWith("/client_google_oauth") ? [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }] : p.startsWith("/client_onboarding_records") ? [{ data: { tasks: { "m1.gbp.photos": t } } }] : p.startsWith("/client_photos") ? [] : null) };
    quiet(); const r = await RM({ event: {}, clientId: CID, mediaName: copy.name, cleanup: "second_logo", deps: d }); loud();
    const refused = r.statusCode === 409 && JSON.parse(r.body).needs_replacement === true;
    if (refused !== want) fail(`the card and the removal guard disagree for ${nm} (guard ${refused}, card ${want})`);
  }
  if (SL.photoOnlyVisible({ detected: { source: "sent_to_us", items: [copy] } }, copy.name)) fail("a failed Google read calls it the only visible photo");

  // ── 6 · the live-by note ──
  const line = SL.photoLiveByLine("2026-10-31T22:23:39Z", Date.parse("2026-11-01T00:00:00Z"));
  if (line !== "Sent Oct 31 · Google says up to 48 hours, so by about Nov 2. That's an estimate, not a promise.") fail(`the note isn't the mockup's: ${line}`);
  if (SL.photoLiveByLine("2026-10-31T22:23:39Z", Date.parse("2026-11-04T00:00:00Z")) !== "") fail("past the 48 hours it still gives a date to wait for");
  if (SL.photoLiveByLine(null) !== "" || SL.photoLiveByLine("not a date") !== "") fail("no send date still prints a date");
  const recent = new Date(Date.now() - 3600000).toISOString();
  const sentPhoto = { id: "p", shot_n: 2, category: "cover", publish_state: "published", storage_path: "c.jpg", pushed_at: recent, gbp_media_name: "upload" };
  const ph = pc.render(STEP, { status: "pending", draft_shape: { items: shotItems, storefront: false }, detected: { n: 0, threshold: 20, source: "google_profile", items: [], at: recent } }, [sentPhoto], "c1", "", open);
  if (!/class="pm-cs-note">Sent [^<]*Google says up to 48 hours, so by about [^<]*an estimate, not a promise/.test(ph)) fail("the client's card doesn't carry the note");
  if (!/pm-liveby/.test(ph)) fail("the shot's own row doesn't carry the note");
  const hiddenLogo = pc.render(STEP, { status: "pending", draft_shape: { items: shotItems, storefront: false }, detected: { n: 0, threshold: 20, source: "google_profile", items: [], at: recent } }, [{ ...sentPhoto, shot_n: 1, category: "logo" }], "c1", "", open);
  if (/Google says up to 48 hours, so by about/.test(hiddenLogo)) fail("a logo Google hides gets a date it will never show by");
  actx.state.photos = [{ ...sentPhoto, client_id: "c1" }];
  actx.state.onboardingData = { tasks: { "m1.gbp.photos": { status: "pending", draft_shape: { items: shotItems, storefront: false }, detected: { n: 0, threshold: 20, source: "google_profile", items: [], at: recent, have: {} } } } };
  const ad6 = actx.waitCard(actx.state.onboardingData.tasks["m1.gbp.photos"], { clientStepNo: 10 });
  if (!/Google says up to 48 hours, so by about/.test(ad6)) fail("admin step 38 doesn't carry the note");
  // the line about what was really seen waits for the owner's Nov 2 check
  const SHARED = read("shared/photo-second-logo.js");
  const body = SHARED.slice(SHARED.indexOf("export function photoLiveByLine"), SHARED.indexOf("// 🔒 audit_decisions_v1 #4"));
  if (/\bMaps\b|\bseen\b|\blive\b/i.test(body.replace(/^\s*\/\/.*$/gm, ""))) fail("the note claims what was seen on Maps");
}

// ── 5 · the approved description ───────────────────────────────────────────────────────────────
{
  const TEXT = "We help local businesses get found. Real work, plain reports.";
  const STEP = "m1.gbp.business_description";
  const world = (over = {}) => ({ consent: true, patch: [], readBack: null, googleStatus: 200, googleJson: null, rec: { id: "r1", data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } }, [STEP]: { status: "in_progress", approval: { decision: "approved", at: "2026-11-01T10:00:00Z", by: "Pat Owner", approved_content: TEXT }, outcome_data: { draft: "A different draft." } } } } }, ...over });
  let w;
  const reset = () => { delete globalThis.__rgaFetchBeforeConsentGuard; };
  const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
  const stub = async (u, o = {}) => { const url = String(u), m = (o.method || "GET").toUpperCase();
    if (/oauth2\.googleapis/.test(url)) return ok({ access_token: "tok", expires_in: 3600 });
    if (url.includes("mybusinessbusinessinformation.googleapis.com")) {
      if (m === "PATCH") { w.patch.push({ url, body: JSON.parse(o.body) }); if (w.googleStatus !== 200) return new Response(JSON.stringify(w.googleJson || { error: { message: "nope" } }), { status: w.googleStatus }); w.live = JSON.parse(o.body).profile?.description; return ok({}); }
      return ok({ title: "T", profile: { description: w.readBack !== null ? w.readBack : (w.live || "old") }, categories: {} });
    }
    if (/client_activity\?client_id/.test(url) && m === "GET") return ok(w.consent ? [{ kind: "google_consent_agreed", created_at: "2026-10-01T00:00:00Z", payload: {} }] : []);
    if (/client_google_oauth/.test(url)) return ok(/gbp_location_id=like/.test(url) ? [{ client_id: CID }] : [{ refresh_token: "r", gbp_location_id: "locations/2" }]);
    if (/client_onboarding_records/.test(url)) { if (m === "PATCH") { w.rec = { ...w.rec, data: JSON.parse(o.body).data }; return ok([w.rec]); } return ok([JSON.parse(JSON.stringify(w.rec))]); }
    return ok([]); };
  globalThis.fetch = stub;
  reset();
  delete require.cache[require.resolve("./_deadline.js")];
  delete require.cache[require.resolve("./gbp-publish.js")];
  const { handler } = require("./gbp-publish.js");
  if (!globalThis.__rgaFetchBeforeConsentGuard) { globalThis.fetch = realFetch; can("the consent guard wasn't installed under gbp-publish"); }
  const press = async () => { quiet(); const r = await handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, step_id: STEP }) }); loud(); return { status: r.statusCode, body: JSON.parse(r.body) }; };
  const task = () => w.rec.data.tasks[STEP];
  // agreed: written verbatim, read back, recorded, finished
  w = world(); let r = await press();
  if (r.status !== 200 || !r.body.ok) fail(`an approved description doesn't publish (${r.status} ${r.body.error})`);
  if (w.patch.length !== 1 || w.patch[0].body.profile?.description !== TEXT || !/updateMask=profile\.description/.test(w.patch[0].url)) fail("it doesn't send exactly the approved text");
  if (!task().published || task().published.field !== "profile.description" || task().status !== "done") fail("the result isn't on the step");
  // no consent: the guard refuses, nothing reaches Google, the card's words are plain, the press is kept
  w = world({ consent: false }); r = await press();
  if (w.patch.length) fail("without the client's OK the write reached Google");
  if (r.status !== 403 || !/hasn't authorized changes to their Google profile/.test(r.body.error || "")) fail(`the refusal isn't in plain words: ${r.status} ${r.body.error}`);
  if (!/hasn't authorized/.test(task().publish_failed?.error || "") || task().published) fail("a refused press isn't on the step, or reads as published");
  // a success clears it
  w.consent = true; r = await press();
  if (r.status !== 200 || task().publish_failed) fail("a later success doesn't clear the failed press");
  // Google says it took it and doesn't show it
  w = world({ readBack: "something else" }); r = await press();
  if (r.status !== 500 || task().published || task().status === "done" || !task().publish_failed) fail("a read-back that doesn't match reads as published");
  // Google refuses: its own words
  w = world({ googleStatus: 400, googleJson: { error: { message: "Description too promotional" } } }); r = await press();
  if (r.status !== 502 || !/Description too promotional/.test(r.body.error || "")) fail(`Google's own reason is lost: ${r.body.error}`);
  // not approved, another listing, not connected
  w = world(); w.rec.data.tasks[STEP].approval.decision = "changes_requested"; r = await press();
  if (r.status !== 409 || w.patch.length || task().publish_failed) fail("an unapproved description isn't refused cleanly");
  w = world(); w.rec.data.tasks["m1.audit.gbp_duplicate"].outcome_data.verdict = "duplicate"; w.rec.data.tasks["m1.audit.gbp_duplicate"].outcome_data.duplicates = [{}]; r = await press();
  if (r.status !== 409 || w.patch.length || !task().publish_failed) fail("a second listing doesn't stop it, or the card can't say why");
  // a stranger: no secret, no write, no record
  w = world(); quiet(); const stranger = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, step_id: STEP }) }).catch(() => ({ statusCode: 401, body: "{}" })); loud();
  if (stranger.statusCode === 200 || w.patch.length || task().publish_failed) fail("a caller with no sign-in reached the publish");
  globalThis.fetch = realFetch; reset();
  // the guards themselves
  const CC = require("./_core-change.js");
  if (CC.coreWrites("https://x/v1/locations/2?updateMask=profile.description", { body: JSON.stringify({ profile: { description: "x" } }) }).length) fail("a description now reads as a core change");
  if (!CC.coreWrites("https://x/v1/locations/2?updateMask=title", { body: JSON.stringify({ title: "x" }) }).length) fail("the core change guard no longer sees a name");
  if (!require("./_google-consent.js").isProfileWrite("https://mybusinessbusinessinformation.googleapis.com/v1/locations/2?updateMask=profile.description", "PATCH")) fail("the consent guard no longer sees the description write");
  // one press, and nothing presses for RGA
  const FN = `${SITE}/netlify/functions`;
  const callers = fs.readdirSync(FN).filter((x) => x.endsWith(".js") && x !== "gbp-publish.js").filter((x) => fs.readFileSync(`${FN}/${x}`, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l) && !/^\s*"/.test(l)).some((l) => /\/functions\/gbp-publish\b|require\(["']\.\/gbp-publish/.test(l)));
  if (callers.length) fail(`gbp-publish has a server caller: ${callers.join(", ")}`);
  if (/gbp-publish/.test(read("netlify.toml").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"))) fail("gbp-publish is on a schedule");
  const adCalls = (AD.match(/fetch\("\/\.netlify\/functions\/gbp-publish"/g) || []).length;
  if (adCalls !== 1) fail(`the admin calls gbp-publish ${adCalls} times, and only the press may`);
  const handlerSrc = AD.slice(AD.indexOf('fetch("/.netlify/functions/gbp-publish"') - 900, AD.indexOf('fetch("/.netlify/functions/gbp-publish"'));
  if (!/ev\.target\.closest\("\[data-desc-publish\]"\)/.test(handlerSrc)) fail("the publish isn't behind the button's press");
  if (/MutationObserver[^\n]*data-desc|setInterval[^\n]*gbp-publish/.test(AD)) fail("something presses the button by itself");
  // the step says it
  const appr = { approval: { decision: "approved", at: "2026-11-01T10:00:00Z", by: "Pat Owner", approved_content: TEXT } };
  if (actx.toPublish({}) || actx.toPublish({ approval: { decision: "changes_requested", approved_content: TEXT } }) || actx.toPublish({ approval: { decision: "approved", approved_content: " " } })) fail("the card shows with no approved text");
  if (!actx.toPublish(appr)) fail("an approved description doesn't ask to be published");
  if (actx.toPublish({ ...appr, published: { at: "2026-11-02T00:00:00Z" } })) fail("a published description still asks");
  if (!actx.toPublish({ ...appr, published: { at: "2026-10-01T00:00:00Z" } })) fail("a newer approval than the last publish doesn't ask");
  if (actx.pill(STEP, appr)?.text !== "Approved · Publish to Google") fail("the row doesn't say Approved · Publish to Google");
  const card = actx.pubCard(appr, { open: true });
  if (!/Approved · Publish to Google/.test(card) || !card.includes(esc(TEXT)) || !/data-desc-publish>Publish to Google</.test(card) || !/data-desc-card/.test(card) || !/never goes on its own/.test(card)) fail("the card doesn't show the approved text and the one press");
  if (!/class="ob-card you"/.test(card)) fail("the card isn't the one admin card (Your move)");
  if (!/data-desc-publish disabled/.test(actx.pubCard(appr, { open: false, state: "duplicate" }))) fail("the button is live while a second listing is open");
  if (!/data-desc-publish disabled/.test(actx.pubCard({ approval: { ...appr.approval, approved_content: "x".repeat(751) } }, { open: true }))) fail("the button is live past Google's 750");
  const failed = actx.pubCard({ ...appr, publish_failed: { at: "2026-11-01T11:00:00Z", error: "The client hasn't authorized changes to their Google profile." } }, { open: true });
  if (!/Not published/.test(failed) || !failed.includes(esc("The client hasn't authorized changes to their Google profile."))) fail("a refused press isn't on the card");
  if (!/id === DESC_STEP && descriptionToPublish\(t\) \? descriptionPublishCardHtml\(t, adminListing\(\)\)/.test(AD)) fail("the card isn't on the step's row");
  if (!/o\.flowId === DESC_STEP && descriptionToPublish\(s\.task\) \? /.test(AD)) fail("a row already Done with a newer approval has no press");
  if (!/s\.textContent = e\.message/.test(AD)) fail("a refusal doesn't reach the card on the press");
}

// ── 7 · the listings check ─────────────────────────────────────────────────────────────────────
{
  const A = require("./_listings-autorun.js");
  const FX = read("netlify/functions/flow-execute.js");
  const asks = FX.slice(FX.indexOf("async function one(i) {"), FX.indexOf("// Bounded concurrency"));
  const perDir = (asks.match(/askGoogle\(`/g) || []).length;
  const dirs = require("./_citation-directories.js").discoverableDirectories().filter((d) => d.listingExample).length;
  if (perDir !== 2) fail(`the runner asks ${perDir} ways per directory: the stated cost is wrong`);
  if (A.searchesPerRun() !== dirs * perDir) fail(`the stated cost (${A.searchesPerRun()}) isn't what the code spends (${dirs * perDir})`);
  if (/for \(let attempt|retry|retries/i.test(asks.replace(/^\s*\/\/.*$/gm, ""))) fail("a search retries, so the cost is no longer bounded");
  const C = (o = {}) => ({ id: CID, source: "manual_admin", status: "active", client_portal_stage: "stage_4_onboarding", ...o });
  if (A.whyNot(C(), {}, {}) !== null) fail("a client reaching onboarding isn't due");
  if (A.whyNot(C({ website_url: null }), undefined, {}) !== null) fail("a client with no website, no record of the step, isn't due");
  for (const [nm, c, t, env] of [["test", C({ source: "test:walk" }), {}, {}], ["archived", C({ status: "archived" }), {}, {}], ["before onboarding", C({ client_portal_stage: "stage_3_setup" }), {}, {}], ["already ran itself", C(), { auto_run: { at: "x" } }, {}], ["ran by a press", C(), { ran_at: "x" }, {}], ["has a result", C(), { outcome_data: {} }, {}], ["done", C(), { status: "done" }, {}], ["skipped", C(), { status: "skipped" }, {}], ["running", C(), { status: "in_progress" }, {}], ["switched off", C(), {}, { LISTINGS_AUTO_RUN: "off" }]])
    if (A.whyNot(c, t, env) === null) fail(`it would start: ${nm}`);
  const world = (client = C(), task = undefined) => { const w = { client, rec: { id: "r1", data: { tasks: task ? { [A.STEP]: task } : {} } }, starts: 0, patches: 0, startFails: false, env: {},
    deps: null }; w.deps = { env: w.env, now: () => Date.parse("2026-11-02T06:00:00Z"), start: async () => { w.starts++; if (w.startFails) throw new Error("down"); },
      supa: async (p, o = {}) => { if (p.startsWith("/clients")) return w.clients || [w.client];
        if (p.startsWith("/client_onboarding_records")) { if ((o.method || "GET") === "PATCH") { w.patches++; w.lastPatch = p; if (w.lose) return []; if (/auto_run=is\.null/.test(p) && w.rec.data.tasks[A.STEP]?.auto_run) return []; w.rec.data = JSON.parse(o.body).data; return [{ id: "r1" }]; } return [JSON.parse(JSON.stringify(w.rec))]; }
        return []; } }; return w; };
  quiet();
  let w = world();
  const r1 = await A.runListingsOnce({ clientId: CID, trigger: "google_connected", deps: w.deps });
  const stamped = w.rec.data.tasks[A.STEP]?.auto_run;
  const r2 = await A.runListingsOnce({ clientId: CID, trigger: "nightly", deps: w.deps });
  loud();
  if (!r1.ran || w.starts !== 1 || !stamped || stamped.trigger !== "google_connected") fail(`the first run doesn't start, or isn't stamped (${JSON.stringify(r1)})`);
  if (r2.ran || w.starts !== 1) fail("a second call starts it again");
  if (!/auto_run=is\.null/.test(w.lastPatch || "") && w.patches) fail("the claim isn't conditional");
  if (!/%22m1\.audit\.citations%22->auto_run=is\.null/.test(read("netlify/functions/_listings-autorun.js").replace(/\$\{encodeURIComponent\(STEP\)\}/, "m1.audit.citations"))) fail("the claim's filter isn't on the step's stamp");
  // the claim comes before the spend, and a failed start never repeats
  quiet(); let order = []; w = world(); const sup = w.deps.supa; w.deps.supa = async (p, o) => { if ((o?.method || "GET") === "PATCH") order.push("claim"); return sup(p, o); }; w.deps.start = async () => { order.push("start"); };
  await A.runListingsOnce({ clientId: CID, trigger: "x", deps: w.deps }); loud();
  if (order.join() !== "claim,start") fail(`the search can start before it's claimed (${order.join()})`);
  quiet(); w = world(); w.startFails = true; const f1 = await A.runListingsOnce({ clientId: CID, trigger: "x", deps: w.deps }); w.startFails = false; const f2 = await A.runListingsOnce({ clientId: CID, trigger: "x", deps: w.deps }); loud();
  if (f1.ran || !w.rec.data.tasks[A.STEP]?.auto_run || f2.ran || w.starts !== 1) fail("a failed start isn't stamped, so it would run again");
  quiet(); w = world(); w.lose = true; const lost = await A.runListingsOnce({ clientId: CID, trigger: "x", deps: w.deps }); loud();
  if (lost.ran || w.starts) fail("a caller that lost the claim still spends");
  // the nightly: bounded, and it starts nothing twice over many nights
  quiet(); w = world(); w.clients = Array.from({ length: 5 }, (_, i) => ({ ...C(), id: `c${i}` })); const recs = new Map();
  w.deps.supa = async (p, o = {}) => { const id = /client_id=eq\.([^&]+)/.exec(p)?.[1] || /id=eq\.([^&]+)/.exec(p)?.[1];
    if (p.startsWith("/clients?status=neq")) return w.clients; if (p.startsWith("/clients")) return [{ ...C(), id }];
    if (p.startsWith("/client_onboarding_records")) { const key = id; if (!recs.has(key) && !(o.method === "PATCH")) recs.set(key, { id: key, data: { tasks: {} } }); if (o.method === "PATCH") { const row = recs.get(key); if (row.data.tasks[A.STEP]?.auto_run) return []; row.data = JSON.parse(o.body).data; return [{ id: key }]; } return [JSON.parse(JSON.stringify(recs.get(key)))]; } return []; };
  const night1 = await A.sweepListings({ deps: w.deps }); const startsNight1 = w.starts;
  let nights = 0; for (let i = 0; i < 10; i++) { await A.sweepListings({ deps: w.deps }); nights = w.starts; }
  loud();
  if (night1.started !== A.NIGHT_CAP || startsNight1 !== A.NIGHT_CAP) fail(`the nightly isn't capped (${startsNight1})`);
  if (nights !== 5) fail(`over many nights the five clients start ${nights} times, not once each`);
  quiet(); w = world(); w.deps.env = { LISTINGS_AUTO_RUN: "off" }; w.clients = [C()]; const off = await A.sweepListings({ deps: w.deps }); const off1 = await A.runListingsOnce({ clientId: CID, trigger: "x", deps: w.deps }); loud();
  if (off.started || off1.ran || w.starts || w.patches) fail("LISTINGS_AUTO_RUN=off doesn't stop it");
  const SCH = read("netlify/functions/metrics-daily-refresh.js"), OA = read("netlify/functions/oauth-google-callback.js");
  if (!/require\("\.\/_listings-autorun"\)\.sweepListings\(\)/.test(SCH)) fail("the nightly catch isn't wired");
  if (!/require\("\.\/_listings-autorun"\)\.runListingsOnce\(\{ clientId, trigger: "google_connected" \}\)/.test(OA)) fail("setup reaching the step doesn't start it");
  if (!/client_portal_stage=in\.\(\$\{REACHED\.join\(","\)\}\)/.test(read("netlify/functions/_listings-autorun.js")) || !/source\.not\.like\.test:\*/.test(read("netlify/functions/_listings-autorun.js"))) fail("the nightly looks past test clients or the stage");
  const TY = JSON.parse(read("data/playbooks/playbooks.json")).month1.find((s) => s.id === A.STEP);
  if (TY?.type !== "hybrid") fail("the step no longer waits on RGA to confirm");
  // the card: its three answers, nothing that starts a run
  const Wh = "2026-11-02T06:00:00Z", ran = "2026-11-02T06:00:30Z";
  if (!/runs itself once when setup reaches it/i.test(actx.citAuto({}))) fail("the waiting card doesn't say it runs itself");
  const r = actx.citAuto({ status: "in_progress", auto_run: { at: Wh }, ran_at: ran, outcome_data: { counts: { found: 2, missing: 5, unknown: 1 } } });
  if (!/2 Listed · 5 No listing found · 1 Could not check/.test(r)) fail(`the card doesn't use the three answers: ${r.slice(0, 200)}`);
  if (!/Confirm each listing/.test(r)) fail("the card doesn't ask RGA to confirm");
  const none = actx.citAuto({ status: "in_progress", auto_run: { at: Wh }, ran_at: ran, outcome_data: { counts: { found: 0, missing: 0, unknown: 8 } } });
  if (/No listing found(?! ·)/.test(none.replace(/0 No listing found/, "")) || !/couldn(&#39;|')t check any directory/.test(none) || !/proves nothing either way/.test(none)) fail("a run that checked nothing reads as an answer");
  if (!/didn(&#39;|')t finish/.test(actx.citAuto({ status: "pending", auto_run: { at: "2026-01-01T00:00:00Z" } }))) fail("a run that never finished isn't said");
  if (actx.citAuto({ status: "done", auto_run: { at: Wh } }) !== "") fail("a done step still draws the card");
  if (/data-onboard-run|fetch\(/.test(citAuto)) fail("the card can start a paid run by itself");
  if (!/id === "m1\.audit\.citations" \? citAutoHtml\(t\) \+ citNapHtml\(t\)/.test(AD)) fail("the card isn't on the step's row");
  // no other scheduled file starts it
  const FN = `${SITE}/netlify/functions`;
  for (const x of fs.readdirSync(FN).filter((f) => f.endsWith(".js") && !["_listings-autorun.js", "flow-execute.js"].includes(f))) {
    const code = fs.readFileSync(`${FN}/${x}`, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    if (/step_id: *["']m1\.audit\.citations["']/.test(code)) fail(`${x} starts the listings check itself`);
  }
}

if (F.length) { console.error(`❌ check-audit-decisions: ${F.length} problem(s)`); for (const m of F) console.error(`  ✗ ${m}`); process.exit(1); }
console.log("✅ the seven audit decisions hold: bulk photos at 5 a day, Everything on Google, a service-area client can finish step 10 in one count, the kept copy says what's true, one press for an approved description behind the two guards, up to 48 hours as an estimate, and the listings check runs once per client and never loops");
