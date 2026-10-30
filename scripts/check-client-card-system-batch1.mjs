#!/usr/bin/env node
// check-client-card-system-batch1.mjs — 2026-10-29. Chris approved client_card_system_v1 + one page per step (reports/mockups/
// client_step0[2-9]_*_v1.html): every client step draws ONE card design. Batch 1 = client steps 2–9 (CS_STEPS in portal.js);
// steps 1 (kickoff) and 10 (photos) were ON HOLD — they joined with batch 2 on 10-30 (check-client-card-system-batch2 owns the set). The photo-tile rule belongs to a later batch
// and is NOT checked here. → project_client_card_system
//
// RUNS the real renderers (vm, no browser) for businesses that are NOT RGA — a plumber in Denver, a dentist in Toronto (a Canadian
// phone typed with a country code), and a London cleaner (a UK phone, which must stay as typed) — and checks the system's promises:
//   · every done card is ONE .pm-cs-card whose band carries a STATE icon from CS_ICON for its tone (never a topic icon), has a
//     .pm-cs-foot, and — where the step offers a change — ONE "Change something" UNDER the card (never inside it)
//   · step 4 done shows all 5 facts (no "+ 3 more" fold, no pm-k5-more), the service area as one chip row, a covered place says where
//   · step 5 says "too specific to count" and never draws the old map pin (title="Shows Google's map")
//   · step 9 done never previews a "Book" button (pm-pc-gprev); RGA's unacknowledged pick says "We put this on Google for you" with
//     Keep it on data-bk-putkeep (data-bk-keep is step 9's FORM option — a handler on it fired from the form, 10-29)
//   · nothing of RGA's own (Culver City, Los Angeles, RGA's phone) leaks into another business's card
// Plus static checks on portal.js (CS_STEPS still holds all 8 batch-1 ids — batch 2 owns the exact set · threadHtml's system branch · the Keep handler's
// attribute · the not-open grey card) and portal.css (every rule in the card-system block is scoped to .pm-cs · no `font` shorthand
// that leans on `inherit` — `font:800 13px/1 var(--x, inherit)` is INVALID when --x is undeclared, so the whole font drops).
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 indeterminate (code moved)
import fs from "node:fs";
import vm from "node:vm";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), C = read("portal/portal.css");
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — portal.js ${w} moved; re-read it before trusting this gate`); process.exit(2); };
const fn = (n) => { const m = new RegExp(`^function ${n}\\(`, "m").exec(P); if (!m) moved(`function ${n}`); const e = P.indexOf("\n}\n", m.index); if (e < 0) moved(`the end of ${n}`); return P.slice(m.index, e + 2); };
const line = (n) => { const m = new RegExp(`^const ${n} = [^\\n]*;$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0].replace(/^const /, "var "); };

// ── the lift ─────────────────────────────────────────────────────────────────────────────────────────
const base = [fn("escapeHtml"), fn("escapeAttribute")].join("\n");
const kit = planCardKit(P, base);
const src = [base, kit, csBlock(P, `${base}\n${kit}`), line("siteShow"), line("BK_NOUN"), line("GBP_DAY"), line("gcardMaps"), line("KW_ICON"), line("MAIL_ICON"), line("stepLockOf"),
  fn("gvProfileHtml"), fn("accStep1Name"), fn("accSiteName"), fn("accMergeChoiceHtml"), fn("accessCardHtml"), fn("factsLocked"), fn("factsCardV2"), fn("keywordPlanCardHtml"),
  fn("stepSixPending"), fn("svcCardHtml"), fn("hoursCardHtml"), fn("attrsCardHtml"), fn("bookingCardHtml"), fn("threadHtml"),
  // the page state these read — empty, the way a first render has it
  `var _lockData = { tasks: {} }, _editingSteps = new Set(), _rcEditing = new Set(), _accPickSelf = new Set(), _accNames = { wix: "Wix", squarespace: "Squarespace" }, _accHosts = {};
   var ACC_FILES = { github: { name: "GitHub" } }, _portalThread = [];
   var doneNoRecordHtml = (t, o) => "<record>" + o.title + "</record>";
   var factsEditorHtml = () => "<editor>";
   var unreadReplies = () => [], letterHtml = (x) => String(x), fmtDateTimeDot = (x) => String(x), threadBlock = (id, talk) => "<thread>" + talk.length + "</thread>";
   var googleCardHtml = () => "<old-google-card>";`].join("\n");
const LOCKED = new Set();
const ctx = vm.createContext({ Date, Number, String, Array, Set, Map, Object, JSON, Math, rgaStepLock: { stepLock: (id) => (LOCKED.has(id) ? { why: "RGA confirmed it", edit: "request" } : null) } });
try { vm.runInContext(src, ctx); } catch (e) { console.error(`⚠️  INDETERMINATE — the lifted renderers don't load (${e.message})`); process.exit(2); }
const run = (expr, vars = {}) => { Object.assign(ctx, vars); try { return vm.runInContext(expr, ctx); } catch (e) { fail(`${expr.slice(0, 40)}… threw: ${e.message}`); return ""; } };
const ICON = run("CS_ICON");

// ── the system's promises, for any card ─────────────────────────────────────────────────────────────
// the band: <div class="pm-k5-h TONE">ICON<b>HEAD</b> — the icon must BE CS_ICON[TONE]
function isSystemCard(label, h, { tone, change = true, foot = true } = {}) {
  const cards = (h.match(/class="pm-k5-plan pm-cs-card /g) || []).length;
  if (cards !== 1) { fail(`${label}: ${cards} system cards (want ONE .pm-cs-card)`); return; }
  const band = /<div class="pm-k5-plan pm-cs-card (\w+)"[^>]*><div class="pm-k5-h (\w+)">(<svg[^]*?<\/svg>)<b>/.exec(h);
  if (!band) { fail(`${label}: the band isn't a state icon + the head (${h.slice(0, 160)})`); return; }
  if (band[1] !== band[2] || (tone && band[1] !== tone)) fail(`${label}: the card is "${band[1]}", its band "${band[2]}"${tone ? `, want "${tone}"` : ""}`);
  if (band[3] !== ICON[band[2]]) fail(`${label}: the band's icon is not the STATE icon CS_ICON.${band[2]} (a topic icon, or none)`);
  const ft = h.lastIndexOf('<div class="pm-cs-foot">');
  if (foot && ft < 0) fail(`${label}: no .pm-cs-foot (lock · Maps · How live there)`);
  const n = (h.match(/>Change something<\/button>/g) || []).length;
  if (change) {
    const acts = h.lastIndexOf('<div class="pm-k5-acts">'), at = h.lastIndexOf(">Change something</button>");
    if (n !== 1) fail(`${label}: ${n}× "Change something" (want ONE, under the card)`);
    else if (acts < 0 || at < acts || (ft >= 0 && acts < ft)) fail(`${label}: "Change something" isn't under the card (in .pm-k5-acts after the foot)`);
  } else if (n) fail(`${label}: offers "Change something" where the step has no change`);
  if (/Culver City|Los Angeles|\(424\) 242-20/.test(h)) fail(`${label}: RGA's own city or phone leaks into another business's card`);
}

const BIZ = [
  { key: "denver", name: "Mile High Drain Co", town: "Denver", region: "US", phone: "+1 303-555-0147", phoneShown: "(303) 555-0147", site: "https://www.milehighdrain.com/", siteShown: "milehighdrain.com",
    areas: ["Denver, CO, USA", "Aurora, CO, USA", "Lakewood, CO, USA"], covered: ["Capitol Hill, Denver, CO", "Denver, CO, USA"], come: false, maps: "https://maps.google.com/?cid=303" },
  { key: "toronto", name: "Queen West Dental", town: "Toronto", region: "CA", phone: "+1 (416) 555-0199", phoneShown: "(416) 555-0199", site: "http://queenwestdental.ca", siteShown: "queenwestdental.ca",
    areas: ["Toronto, ON, Canada", "Etobicoke, ON, Canada"], covered: ["Leslieville, Toronto, ON", "Toronto, ON, Canada"], come: true, maps: "https://maps.google.com/?cid=416" },
  { key: "london", name: "Hackney Home Cleaning", town: "London", region: "GB", phone: "+44 20 7946 0958", phoneShown: "+44 20 7946 0958", site: "https://hackneyclean.co.uk", siteShown: "hackneyclean.co.uk",
    areas: ["Hackney, London, UK"], covered: null, come: false, maps: "https://maps.google.com/?cid=44" },
];
const AT = "2026-10-20T15:00:00Z";

for (const b of BIZ) {
  // ── step 2 · verified ───────────────────────────────────────────────────────────────────────────────
  { const h = run(`gvProfileHtml(__f, "yes", "✓ Verified", [["Checked", "Oct 20, 2026, 3:00 PM"]])`, { __f: { title: b.name, phone: b.phoneShown, mapsUri: b.maps } });
    isSystemCard(`step 2 (${b.key})`, h, { tone: "ok", change: false });
    if (!h.includes(b.name) || !/See it on Google Maps ↗/.test(h)) fail(`step 2 (${b.key}): the verified card doesn't name the business or link Maps in the foot`); }
  // ── step 3 · access confirmed (not locked → its own Change something; locked → the seat adds it from the lock) ────────────
  { const t = { status: "done", client_input: { via: "invite", platform: "wix", at: AT }, access: { confirmed_at: AT, role: "Admin" } };
    const h = run(`accessCardHtml({ id: "m1.access.website" }, __t, "c-${b.key}")`, { __t: t });
    isSystemCard(`step 3 (${b.key})`, h, { tone: "ok" });
    if ((h.match(/class="pm-cs-ev"/g) || []).length !== 3 || !/class="pm-cs-note"/.test(h) || !/Nothing goes on your website until you approve it/.test(h)) fail(`step 3 (${b.key}): done isn't three event rows + the promise as one note`);
    LOCKED.add("m1.access.website");
    const hl = run(`accessCardHtml({ id: "m1.access.website" }, __t, "c-${b.key}")`, { __t: t });
    if (/Change something/.test(hl)) fail(`step 3 (${b.key}): a LOCKED done card draws its own Change something (the seat adds the lock's one)`);
    LOCKED.delete("m1.access.website");
    const hr = run(`accessCardHtml({ id: "m1.access.website" }, __t, "c-${b.key}")`, { __t: { ...t, access: { ...t.access, repo: "acme/site" } } });
    if (!/<div class="pm-merge" data-merge-choice/.test(hr) || hr.indexOf("pm-merge") > hr.indexOf('<div class="pm-cs-foot">')) fail(`step 3 (${b.key}): on GitHub access the merge choice isn't INSIDE the card, before its foot`); }
  // ── step 4 · done ──────────────────────────────────────────────────────────────────────────────────
  { const items = b.covered ? [{ kind: "area", name: b.covered[0], covered_by: b.covered[1], on: true }] : [];
    const g = { state: "on_google", after: { name: b.name, phone: b.phone, website: b.site, region: b.region, come: b.come, area: b.areas }, area_now: b.areas, area_now_at: AT, progress: { items, at: AT }, maps_uri: b.maps };
    const h = run(`factsCardV2({ id: "m1.gbp.business_facts" }, { status: "done" }, __g)`, { __g: g });
    isSystemCard(`step 4 (${b.key})`, h, { tone: "ok" });
    const n = b.areas.length + (b.covered ? 1 : 0);
    if (!/All 5 match Google/.test(h) || (h.match(/class="pm-pc-f"/g) || []).length !== 4 || !h.includes(`<span class="k">Service area · ${n} place${n === 1 ? "" : "s"} on Google</span>`)) fail(`step 4 (${b.key}): done doesn't show all 5 facts (4 rows + the service area as one chip row of ${n})`);
    if (/pm-k5-more|more · |pm-k5-fold/.test(h)) fail(`step 4 (${b.key}): done hides facts behind a fold again`);
    if (!h.includes(`>${b.phoneShown}<`) || !h.includes(b.siteShown) || !h.includes(b.name)) fail(`step 4 (${b.key}): the phone isn't shown the way it should be (${b.phoneShown}), or the website / name is missing`);
    if (b.covered && !h.includes(`${b.covered[0].split(",")[0]} <em>in ${b.covered[1].split(",")[0]}</em>`)) fail(`step 4 (${b.key}): a covered place doesn't say where it's covered`);
    if (!h.includes(b.come ? "Customers come to you" : "You go to them")) fail(`step 4 (${b.key}): "How customers reach you" doesn't follow their answer`); }
  // ── step 5 · locked plan ───────────────────────────────────────────────────────────────────────────
  { const t = { status: "done", completed_at: AT, outcome_data: { market: `${b.town}, X`, demand: [{ term: `emergency service ${b.town.toLowerCase()}`, volume: 880, pack: true, pack_top: [{ name: "A Rival", reviews: 40 }] }, { term: "service near me", volume: 1900, pack: true }, { term: "deep niche thing", volume: 10, pack: false }, { term: "another job", volume: null, pack: true }, { term: "general job", volume: 320, pack: false }], locations: [{ ok: true, place: b.areas[0].split(",")[0] }] } };
    const h = run(`keywordPlanCardHtml({ id: "m1.strategy.keywords_locations" }, __t, { "m1.audit.grid_baseline": { outcome_data: { measured_at: "${AT}", per_keyword: [{ points: 25, ranked: 2 }] } } })`, { __t: t });
    isSystemCard(`step 5 (${b.key})`, h, { tone: "ok" });
    if ((h.match(/too specific to count/g) || []).length < 2) fail(`step 5 (${b.key}): a volume at Google's floor doesn't say "too specific to count"`);
    if (/title="Shows Google's map"/.test(h)) fail(`step 5 (${b.key}): the old map pin is back on a search row`);
    if (!/data-kw-ok=/.test(h) || !/>Looks right<\/button>/.test(h)) fail(`step 5 (${b.key}): the locked plan lost Looks right beside Change something`); }
  // ── step 6 · on Google ─────────────────────────────────────────────────────────────────────────────
  { ctx._lockData.tasks = {};
    const h = run(`svcCardHtml({ id: "m1.gbp.services_products" }, null, __g, "${b.maps}")`, { __g: { labels: { a: "Job one", b: "Job two", c: "Job three" }, after: ["a", "b", "c"], categories: { primary: { label: "Main trade" }, additional: [{ label: "Side trade" }] }, confirmed_at: AT } });
    isSystemCard(`step 6 (${b.key})`, h, { tone: "ok" });
    if (!/class="pm-cs-chip main">Main trade <em>main<\/em>/.test(h) || !/data-s6-more>\+1 more ›/.test(h)) fail(`step 6 (${b.key}): the chips (main marked, +N more ›) are gone`); }
  // ── step 7 · hours on Google ───────────────────────────────────────────────────────────────────────
  { const days = { mon: { open: "08:00", close: "17:00" }, tue: { open: "08:00", close: "17:00" }, wed: { open: "08:00", close: "17:00" }, thu: { open: "08:00", close: "17:00" }, fri: { open: "08:00", close: "16:00" }, sat: { open: "09:00", close: "12:00" }, sun: { closed: true } };
    const h = run(`hoursCardHtml({ id: "m1.gbp.hours_attributes" }, { client_input: {} }, __g, "${b.maps}")`, { __g: { after: days, at: AT, special: { sent: [{ name: "Christmas Day", date: "2026-12-25", yearly: true }] } } });
    isSystemCard(`step 7 (${b.key})`, h, { tone: "ok" });
    if ((h.match(/class="pm-cs-day/g) || []).length !== 7 || (h.match(/class="pm-cs-day c"/g) || []).length !== 1 || !/Christmas Day · Dec 25/.test(h) || !/data-hours-edit=/.test(h)) fail(`step 7 (${b.key}): not the week as 7 tiles (Sunday closed), the holiday chip with its next date, and Change something on data-hours-edit`); }
  // ── step 8 · details on Google ─────────────────────────────────────────────────────────────────────
  { const h = run(`attrsCardHtml({ id: "m1.gbp.attributes" }, {}, __g, "${b.maps}")`, { __g: { labels: { a: "Free estimates", b: "Wheelchair accessible entrance" }, after: ["a", "b"], confirmed_at: AT } });
    isSystemCard(`step 8 (${b.key})`, h, { tone: "ok" });
    if (!/2 details on Google/.test(h) || !/<span class="k">On your profile<\/span>/.test(h)) fail(`step 8 (${b.key}): done isn't "2 details on Google" with the "On your profile" chips`);
    const w = run(`attrsCardHtml({ id: "m1.gbp.attributes" }, {}, __g, "")`, { __g: { labels: { a: "Free estimates" }, after: ["a"], at: new Date().toISOString() } });
    isSystemCard(`step 8 sent (${b.key})`, w, { tone: "wait" });
    if (!/<span class="k">You said<\/span>/.test(w)) fail(`step 8 sent (${b.key}): the grey card doesn't show "You said" chips`); }
  // ── step 9 · on Google · and RGA's pick, unacknowledged ────────────────────────────────────────────
  { const g = { state: "on_google", link: `${b.site}book`, link_type: "url_appointment", at: AT };
    const h = run(`bookingCardHtml({ id: "m1.gbp.booking_link" }, {}, __g, "${b.maps}")`, { __g: g });
    isSystemCard(`step 9 (${b.key})`, h, { tone: "ok" });
    if (/pm-pc-gprev|>Book<|Book button/.test(h)) fail(`step 9 (${b.key}): the done card previews a "Book" button again (Google picks the words)`);
    if (!/<span class="l">Link<\/span>/.test(h) || !/<span class="l">Counted<\/span>/.test(h)) fail(`step 9 (${b.key}): done isn't the Link + Counted rows`);
    const p = run(`bookingCardHtml({ id: "m1.gbp.booking_link" }, { rga_put: { at: "${AT}" } }, __g, "${b.maps}")`, { __g: g });
    isSystemCard(`step 9 RGA put it on (${b.key})`, p, { tone: "ok" });
    if (!/<div class="pm-cs-st you">[^]*<b>We put this on Google for you<\/b>/.test(p) || !/<button type="button" data-bk-putkeep>Keep it<\/button>/.test(p) || /data-bk-keep\b/.test(p)) fail(`step 9 (${b.key}): RGA's unacknowledged pick isn't the amber "We put this on Google for you" row with Keep it on data-bk-putkeep`);
    if (/We put this on Google for you/.test(run(`bookingCardHtml({ id: "m1.gbp.booking_link" }, { rga_put: { at: "${AT}", ack: { decision: "keep" } } }, __g, "")`, { __g: g }))) fail(`step 9 (${b.key}): the Keep it row stays after they kept it`);
    const c = run(`bookingCardHtml({ id: "m1.gbp.booking_link" }, { client_input_at: "${AT}" }, { state: "not_sent", reason: "call" }, "${b.maps}")`);
    isSystemCard(`step 9 customers call (${b.key})`, c, { tone: "ok" }); }
}

// ── static: the set, the thread, the Keep handler, the not-open card ─────────────────────────────────
{ const m = /^const CS_STEPS = new Set\(\[([^\]]*)\]\);$/m.exec(P);
  if (!m) moved("CS_STEPS");
  const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  const want = ["m1.access.website", "m1.gbp.attributes", "m1.gbp.booking_link", "m1.gbp.business_facts", "m1.gbp.hours_attributes", "m1.gbp.services_products", "m1.gbp.verify", "m1.strategy.keywords_locations"];
  // 🔄 10-30: batch 2 (steps 1 + 10–15, approved 10-30 — steps 1 and 10 came off hold) joined the set; its exact membership is
  // check-client-card-system-batch2's. Here: every batch-1 step is still on the system.
  const lost = want.filter((id) => !ids.includes(id));
  if (lost.length) fail(`batch 1's steps left the card system (${lost.join(", ")})`); }
{ const t = fn("threadHtml");
  if (!/if \(!msgs\.length && !CS_STEPS\.has\(stepId\)\) return "";/.test(t) || !/if \(CS_STEPS\.has\(stepId\)\) \{/.test(t) || !/<b>Messages · \$\{all\.length\}<\/b>/.test(t) || !/<details class="pm-ask pm-cs-ask"><summary>Questions about this step\? <b>Ask RGA ›<\/b><\/summary>/.test(t)) fail("threadHtml's system branch lost \"Messages · N\" or the always-there \"Questions about this step? Ask RGA ›\"");
  const none = run(`threadHtml("m1.gbp.hours_attributes")`);
  if (!/Ask RGA ›/.test(none) || /pm-cs-msgs/.test(none)) fail("a system step with no messages doesn't keep its one \"Ask RGA ›\" line (or draws an empty Messages row)");
  ctx._portalThread = [{ id: 1, step_id: "m1.gbp.hours_attributes", from: "client", at: AT, message: "Are holidays covered?" }, { id: 2, step_id: "m1.gbp.hours_attributes", from: "rga", at: "2026-10-21T10:00:00Z", message: "Yes, all of them." }];
  vm.runInContext("_portalThread = this._portalThread", ctx);
  const two = run(`threadHtml("m1.gbp.hours_attributes")`);
  if ((two.match(/<details class="pm-cs-msgs"/g) || []).length !== 1 || !/<b>Messages · 2<\/b>/.test(two) || !/Ask RGA ›/.test(two)) fail("a system step's conversation isn't ONE \"Messages · 2\" row + Ask RGA ›");
  // 🔄 10-30: every client step is on the system since batch 3 (Ongoing work), so "outside" is an id that isn't in CS_STEPS
  { const out = "x.outside.the.system";
    if (run(`CS_STEPS.has("${out}")`)) fail("the test id is in CS_STEPS");
    else if (run(`threadHtml("${out}")`)) fail("a step OUTSIDE the system draws the system's thread with nothing to show"); }
  vm.runInContext("_portalThread = []", ctx); }
{ if (!/e\.target\.closest\?\.\("\[data-bk-putkeep\]"\); if \(!b \|\| b\.disabled\) return;/.test(P) || /closest\?\.\("\[data-bk-keep\]"\); if \(!b \|\| b\.disabled\) return;/.test(P)) fail("the Keep it handler listens on [data-bk-keep] (step 9's form option) instead of [data-bk-putkeep]");
  if (!/data-bk-putkeep>Keep it<\/button><a class="portal-button" href="#step-/.test(P)) fail("the To do's Keep it isn't on data-bk-putkeep"); }
{ // 🔄 10-30: the close-out (step 15) draws its own grey "Opens about <date>" card (client_step15_closeout_call_v1), so it's left out here
  if (!/const csWaitHtml = csRow && !isDone && \(ownWait \|\| listingWait\)(?: && step\.id !== "m1\.call\.close")? \? `<div class="pm-k5">\$\{csCard\(\{ tone: "off",/.test(P) || !/const i = _rowStr\.indexOf\("<!--cs-body-->"\), j = _rowStr\.indexOf\("<!--cs-thread-->"\);/.test(P)) fail("a system step that isn't open yet no longer draws ONE grey card in place of its body");
  if (!/const btn = `<button type="button" class="pm-amend" data-cs-ask>Change something<\/button>`;/.test(P)) fail("a LOCKED system card no longer gets its ONE \"Change something\" from the lock's ask (seatCsFoot)"); }

// ── static: portal.css's card-system block ───────────────────────────────────────────────────────────
{ const at = C.indexOf("🔒 THE CLIENT CARD SYSTEM");
  if (at < 0) { console.error("⚠️  INDETERMINATE — portal.css's card-system block moved (its header comment)"); process.exit(2); }
  const from = C.indexOf("*/", at) + 2, nxt = C.indexOf("/* ═══", from), blk = C.slice(from, nxt < 0 ? C.length : nxt).replace(/\/\*[\s\S]*?\*\//g, "");
  let rules = 0;
  for (const r of blk.replace(/@media[^{]*\{/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = r[1].trim(), body = r[2];
    if (!sel || sel === ":root") continue;
    rules++;
    for (const s of sel.split(",")) if (!/\.pm-cs/.test(s)) fail(`portal.css card-system rule "${s.trim()}" isn't scoped to .pm-cs — it restyles every card, not only the system's`);
    // `font: … inherit` — a shorthand that leans on inherit (directly or as a var() fallback) is INVALID with its other values, and
    // the browser drops the whole declaration (the weight + size go with it). A bare `font:inherit` is valid and allowed.
    for (const d of body.matchAll(/(?:^|;)\s*font\s*:\s*([^;]+)/g)) if (/\binherit\b/.test(d[1]) && d[1].trim() !== "inherit") fail(`portal.css "${sel.slice(0, 60)}" uses font: ${d[1].trim()} — inherit inside a font shorthand is invalid, so the whole font is dropped`);
  }
  if (rules < 40) { console.error(`⚠️  INDETERMINATE — only ${rules} rules found in portal.css's card-system block; it was restructured`); process.exit(2); } }

if (F.length) { console.error(`🔴 the client card system (batch 1, steps 2–9) drifted — ${F.length} problem(s):\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client card system, batch 1 (steps 2–9) holds for a Denver plumber, a Toronto dentist and a London cleaner: one system card per step with its STATE icon, the foot, ONE Change something under it; step 4 all five facts; step 5 too specific to count, no map pin; step 9 no Book preview, RGA's pick with Keep it on data-bk-putkeep; every batch-1 step is still on the system; Messages · N + Ask RGA ›; every card-system rule scoped, no font shorthand on inherit");
