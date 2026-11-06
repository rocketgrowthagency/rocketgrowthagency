#!/usr/bin/env node
// check-step-37-describes-real-photos.mjs — approved admin_step37_image_seo_v2 (the owner 11-6 11:45 "approved", all six decisions).
//
// 🔴 WHAT HAPPENED (RGA's own record, 11:28 AM 11-6): step 37's run asked the model for a file-name template + 12 MADE-UP example
// photos ("team on a kickoff call") in 700 tokens. Nothing read the photos on the website, so approving it would have described
// nothing real; it was cut off, and the admin card showed the raw "[[TRUNCATED: …]]" marker, a "Draft ready" pill beside "The draft
// didn't come out right", the model's preamble ("I'll deliver every requested asset…") as the reason, and "Mark step complete".
//
// 🔑 WHAT THIS HOLDS, on fake sites of any builder and three different businesses (no network, no production record):
//   1 the site read keeps each photo: full address, today's description, where on the page, kind; icons, decorations, tracking
//     pixels, inline images and repeats are left out; the logo is kept; the old counts still hold
//   2 "no description" = none / empty / a generic word / a camera or file name; a photo on every page is one photo; per-page counts add up
//   3 the runner looks at each photo (one call each), never invents one: a photo it can't make out is left blank with a reason; the
//     logo is "<business name> logo" with no model; up to 40, the rest counted; nothing missing on pages that all read = Done (verified);
//     a page that didn't open, a blocked site, a run that stops early or a model that is down = never a draft, never a guess
//   4 the change carries each photo's address and page(s); Mark live reads every description back on its photo, on its page
//   5 the admin card draws the six states, and never "Draft ready", never the model's text, never a marker, never Mark step complete
//   6 file names: RGA's rule from the name + city on file, any name (an ampersand, accents, a name in another script, no city)
// exit 0 holds · 1 regressed · 2 couldn't run
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
import { liftAdmin } from "./_lift-admin.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
process.on("unhandledRejection", () => {});   // a lifted card's background read (no network here) must not end the gate
let SS, SC, FX;
try { SS = req(path.join(SITE, "netlify/functions/_site-snapshot.js")); SC = req(path.join(SITE, "shared/site-change.js")); FX = req(path.join(SITE, "netlify/functions/flow-execute.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const has = (o, k, what) => { if (typeof o[k] !== "function") { fail(`${what} doesn't exist (${k})`); return false; } return true; };

// ── 1 · the site read keeps each photo ──────────────────────────────────────────────────────────
const PAGE = (title, body) => `<html><head><title>${title}</title></head><body><header><a href="/"><img src="/img/logo.svg" class="site-logo"></a><nav><img src="/i/menu-icon.svg"></nav></header>${body}<footer><img src="https://www.facebook.com/tr?id=9&ev=PageView" width="1" height="1"></footer></body></html>`;
const HOME = PAGE("Home", `<h1>Plumbing in Denver</h1><img data-src="/p/van.jpg" src="data:image/gif;base64,R0lGOD"><img src="https://cdn.joes.test/p/crew.jpg?w=1200" alt="IMG_4471"><img src="/p/sink.webp" alt="A new kitchen sink under a window"><img src="/i/icon-phone.png" width="24" height="24"><img src="data:image/png;base64,iVBOR" alt="">`);
const SERV = PAGE("Services", `<h2>Drain cleaning</h2><img src="/p/drain.jpg" alt=""><img src="/p/sink.webp" alt="A new kitchen sink under a window"><img src="/p/heater.png" alt="photo">`);
const ABOUT = PAGE("About", `<h2>Our story</h2><img src="/p/shop.jpg" alt="DSC00012.JPG">`);
if (has(SS, "photosOf", "the site read's photo list")) {
  const r = SS.photosOf(HOME, "https://joes.test/");
  const srcs = r.photos.map((x) => x.src);
  if (!srcs.includes("https://joes.test/p/van.jpg")) fail("a lazy image's real address (data-src) isn't read — a builder's photos would be missed");
  if (!srcs.includes("https://cdn.joes.test/p/crew.jpg?w=1200")) fail("a photo on another host (a CDN) isn't kept with its full address");
  if (srcs.some((s) => /icon-phone|menu-icon|facebook\.com\/tr|^data:/.test(s))) fail(`an icon, a tracking pixel or an inline image is in the photo list: ${srcs.join(", ")}`);
  if (!(r.left_out.icon >= 2 && r.left_out.tracker >= 1 && r.left_out.inline >= 1)) fail(`what was left out isn't counted (${JSON.stringify(r.left_out)})`);
  const logo = r.photos.find((x) => /logo\.svg/.test(x.src));
  if (!logo || logo.kind !== "logo" || logo.where !== "header") fail("the logo (an svg in the header) isn't kept as the logo, in the header");
  const crew = r.photos.find((x) => /crew/.test(x.src)), van = r.photos.find((x) => /van/.test(x.src));
  if (!crew || crew.alt !== "IMG_4471" || !van || van.alt !== null || van.where !== "Plumbing in Denver") fail("today's description (null = none) or where the photo sits (the heading above it) isn't kept");
  const p = SS.readPage(HOME, "https://joes.test/");
  if (!Array.isArray(p.photos) || p.images !== 8 || p.images_without_description !== 6) fail(`a page read with its address doesn't carry photos, or the old counts moved (images ${p.images}, without ${p.images_without_description})`);
  if ("photos" in SS.readPage(HOME)) fail("a page read without its address (publish safety) grew a photo list it can't resolve");
}

// ── 2 · what counts as no description; a site's photos, each once ─────────────────────────────────
if (has(SC, "needsDescription", "the no-description rule") && has(SC, "sitePhotos", "the site's photo list") && has(SC, "photosByPage", "the per-page counts")) {
  for (const a of [null, "", "  ", "IMG_4471", "DSC00012.JPG", "photo", "Logo", "20230512_142233", "image.png", "a9f3c2e1b7d4e6f8a0b1"]) if (!SC.needsDescription(a)) fail(`"${a}" reads as a real description`);
  for (const a of ["A new kitchen sink under a window", "Two technicians on a roof", "Joe's Plumbing logo", "Crème brûlée on a white plate", "東京の寿司カウンター"]) if (SC.needsDescription(a)) fail(`"${a}" reads as no description`);
  const pages = [{ url: "https://joes.test/", read: true, photos: SS.photosOf(HOME, "https://joes.test/").photos }, { url: "https://joes.test/services/", read: true, photos: SS.photosOf(SERV, "https://joes.test/services/").photos },
    { url: "https://joes.test/about-us/", read: true, photos: SS.photosOf(ABOUT, "https://joes.test/about-us/").photos }, { url: "https://joes.test/gone/", read: false, why: "http_404" }];
  const sp = SC.sitePhotos(pages);
  const logo = sp.photos.filter((x) => /logo\.svg/.test(x.src));
  if (logo.length !== 1 || logo[0].page_label !== "Every page" || logo[0].pages.length !== 3) fail("a logo on every page isn't one photo labelled Every page");
  if (sp.photos.filter((x) => /sink/.test(x.src)).length !== 1) fail("a photo on two pages is counted twice");
  if (sp.photos.length !== 7 || sp.missing.length !== 6) fail(`the site's photos aren't counted right (${sp.photos.length} photos, ${sp.missing.length} with no description; want 7 and 6)`);
  const by = SC.photosByPage(sp);
  if (by.reduce((s, g) => s + g.of, 0) !== sp.photos.length || by.reduce((s, g) => s + g.missing, 0) !== sp.missing.length) fail("the per-page counts don't add up to the totals");
  if (SC.pageLabelOf("https://joes.test/about-us/") !== "About us" || SC.pageLabelOf("https://joes.test/") !== "Home" || SC.pageLabelOf("https://x.test/caf%C3%A9-men%C3%BC.html") !== "Café menü") fail("a page's name isn't read from its own address");
}

// ── 3 · the runner: real photos only, each looked at, never guessed ───────────────────────────────
const CLIENTS = [{ business_name: "Joe's Plumbing & Heating, LLC", primary_service: "plumbing", primary_market: "Denver, CO" },
  { business_name: "Café Délice", primary_service: "bakery", primary_market: "Montréal, QC" }, { business_name: "Smile Dental Studio", primary_service: "dentist", primary_market: "" }];
const fakeSite = (routes) => async (url) => { const k = String(url).replace(/\/$/, ""); const r = routes[k] ?? routes[url];
  if (r === undefined) return { ok: false, status: 404, url, text: async () => "not found" };
  if (r === "BLOCK") return { ok: false, status: 403, url, text: async () => "<title>Just a moment...</title> challenge-platform" };
  return { ok: true, status: 200, url, text: async () => r }; };
const routes = { "https://joes.test": HOME, "https://joes.test/sitemap.xml": "<urlset><url><loc>https://joes.test/services/</loc></url><url><loc>https://joes.test/about-us/</loc></url></urlset>", "https://joes.test/services": SERV, "https://joes.test/about-us": ABOUT };
const snapWith = (rt) => (site, _f, opts) => SS.takeSnapshot(site, fakeSite(rt), { ...opts, safeUrl: () => true });
if (has(FX, "imageSeoDraft", "the step 37 runner (it must read the real photos)") && has(FX, "cleanAlt", "the description check")) {
  for (const client of CLIENTS) {
    const looked = [];
    const describe = async (p) => { looked.push(p.src); return /heater/.test(p.src) ? { why: "unclear" } : /shop/.test(p.src) ? { why: "wouldnt_open" } : { alt: `A photo line for ${p.page_label}` }; };
    const r = await FX.imageSeoDraft({ ...client, website_url: "joes.test" }, { snapshot: snapWith(routes), describe });
    const d = r.outcome_data && r.outcome_data.photo_draft, pc = r.outcome_data && r.outcome_data.photo_check;
    if (!d || !pc || pc.state !== "drafted") { fail(`${client.business_name}: a site with photos missing descriptions didn't produce a photo draft (${JSON.stringify(pc)})`); continue; }
    if (d.photos.length !== 6) fail(`${client.business_name}: the draft has ${d.photos.length} lines, want one per photo missing a description (6)`);
    const lg = d.photos.find((x) => x.kind === "logo");
    if (!lg || lg.after !== `${client.business_name} logo`) fail(`${client.business_name}: the logo isn't "${client.business_name} logo"`);
    if (looked.some((s) => /logo/.test(s))) fail(`${client.business_name}: the logo was sent to the model (it's a rule, no model)`);
    if (looked.some((s) => /sink/.test(s))) fail(`${client.business_name}: a photo that already has a description was sent to the model`);
    const blank = d.photos.filter((x) => !x.after);
    if (blank.length !== 2 || !blank.every((x) => x.why)) fail(`${client.business_name}: a photo the model couldn't make out (or that wouldn't open) isn't left blank with its reason`);
    if (!d.photos.every((x) => /^https:\/\//.test(x.src) && /^https:\/\//.test(x.page))) fail(`${client.business_name}: a line doesn't carry its photo's address and page`);
    if (/\[\[|TRUNCATED|FILENAME_TEMPLATE|I'll deliver/i.test(JSON.stringify(r))) fail(`${client.business_name}: the run carries a marker, a template or model text`);
    if (r.completed === true || r.outcome === "verified") fail(`${client.business_name}: a draft completed the step (Done comes only from the read-back)`);
  }
  const C = { ...CLIENTS[0], website_url: "joes.test" };
  // up to 40 in one draft; the rest counted for the next — across pages (30 + 20), and past one page's cap (45 on one page)
  const jobs = (from, n) => Array.from({ length: n }, (_, i) => `<h2>Job ${from + i}</h2><img src="/p/job-${from + i}.jpg">`).join("");
  const noLogo = (h) => h.replace(/<img src="\/img\/logo\.svg" class="site-logo">/, "");
  const big = { "https://joes.test": noLogo(PAGE("Home", jobs(0, 30))), "https://joes.test/sitemap.xml": "<urlset><url><loc>https://joes.test/work/</loc></url></urlset>", "https://joes.test/work": noLogo(PAGE("Work", jobs(30, 20))) };
  const rb = await FX.imageSeoDraft(C, { snapshot: (s, f, o) => SS.takeSnapshot(s, fakeSite(big), { ...o, safeUrl: () => true }), describe: async () => ({ alt: "A finished job" }) });
  const db = rb.outcome_data && rb.outcome_data.photo_draft;
  if (!db || db.photos.length !== 40 || db.more_left !== 10) fail(`50 photos missing on two pages → want 40 in this draft and 10 counted for the next (got ${db ? `${db.photos.length} + ${db.more_left}` : "no draft"})`);
  const one = { "https://joes.test": noLogo(PAGE("Home", `<img src="/p/a.jpg" alt="A described photo">` + jobs(0, 45))), "https://joes.test/sitemap.xml": "<urlset></urlset>" };
  const r1 = await FX.imageSeoDraft(C, { snapshot: (s, f, o) => SS.takeSnapshot(s, fakeSite(one), { ...o, safeUrl: () => true }), describe: async () => ({ alt: "A finished job" }) });
  const d1 = r1.outcome_data && r1.outcome_data.photo_draft;
  if (!d1 || d1.photos.length !== 40 || d1.more_left !== 5 || d1.photos.some((x) => /\/p\/a\.jpg/.test(x.src))) fail(`a page past its cap doesn't keep the photos with no description first and count the rest (got ${d1 ? `${d1.photos.length} + ${d1.more_left}` : "no draft"})`);
  // nothing missing, every page read → Done on its own, with the check as proof
  const allGood = { "https://joes.test": PAGE("Home", `<img src="/p/a.jpg" alt="A blue service van outside a house">`).replace('class="site-logo"', 'class="site-logo" alt="Joe\'s Plumbing logo"'), "https://joes.test/sitemap.xml": "<urlset></urlset>" };
  let called = 0;
  const rg = await FX.imageSeoDraft(C, { snapshot: (s, f, o) => SS.takeSnapshot(s, fakeSite(allGood), { ...o, safeUrl: () => true }), describe: async () => { called++; return { alt: "x" }; } });
  if (rg.outcome !== "verified" || rg.completed !== true || !rg.outcome_data || rg.outcome_data.photo_check.state !== "all_described" || called) fail("a site whose photos all have descriptions isn't Done on its own with the check as proof");
  // … but not when a page didn't open
  const partial = { ...allGood, "https://joes.test/sitemap.xml": "<urlset><url><loc>https://joes.test/gone/</loc></url></urlset>" };
  const rp = await FX.imageSeoDraft(C, { snapshot: (s, f, o) => SS.takeSnapshot(s, fakeSite(partial), { ...o, safeUrl: () => true }), describe: async () => ({ alt: "x" }) });
  if (rp.outcome === "verified" || !rp.outcome_data || rp.outcome_data.photo_check.state !== "couldnt" || rp.outcome_data.photo_check.why !== "some_pages") fail("a page that didn't open still let the check say every photo has a description");
  // blocked → couldn't check, nothing guessed
  const rx = await FX.imageSeoDraft(C, { snapshot: (s, f, o) => SS.takeSnapshot(s, fakeSite({ "https://joes.test": "BLOCK" }), { ...o, safeUrl: () => true }), describe: async () => ({ alt: "x" }) });
  if (!rx.outcome_data || rx.outcome_data.photo_check.state !== "couldnt" || rx.outcome_data.photo_check.why !== "blocked" || rx.outcome_data.photo_draft) fail("a blocked site isn't Couldn't check (or something was drafted)");
  // a run that stops before the last photo → nothing saved, never shown as a draft
  const rs = await FX.imageSeoDraft(C, { snapshot: (s, f, o) => SS.takeSnapshot(s, fakeSite(big), { ...o, safeUrl: () => true }), budgetMs: 1, describe: () => new Promise((ok) => setTimeout(() => ok({ alt: "late" }), 30)) });
  if (!rs.outcome_data || rs.outcome_data.photo_draft || rs.outcome_data.photo_check.state !== "failed" || rs.outcome_data.photo_check.why !== "stopped_early") fail("a run that stopped before the last photo still produced a draft");
  const rv = await FX.imageSeoDraft(C, { snapshot: snapWith(routes), describe: async () => ({ why: "api" }) });
  if (!rv.outcome_data || rv.outcome_data.photo_draft || rv.outcome_data.photo_check.why !== "vision_down") fail("a model that couldn't look at any photo still produced a draft");
  // the description check: JSON only, US English, no marker, no "image of"
  const ok = FX.cleanAlt('{"alt":"Image of a colourful kitchen — newly fitted"}');
  if (!ok.alt || /colour|Image of|—/.test(ok.alt)) fail(`a description isn't cleaned (got "${ok.alt}")`);
  for (const bad of ["I'll deliver every requested asset in one pass…", '{"alt":null}', '{"alt":"[[TRUNCATED: …]]"}', '{"alt":"' + "x".repeat(200) + '"}']) if (FX.cleanAlt(bad).alt) fail(`"${bad.slice(0, 40)}" was accepted as a description`);
}
{
  const flow = read("netlify/functions/flow-execute.js");
  const at = flow.indexOf('"m1.web.image_seo": async'), seg = at < 0 ? "" : flow.slice(at, flow.indexOf("\n  },", at));
  if (/12 example|FILENAME_TEMPLATE|ALT_TAG_TEMPLATE/.test(seg)) fail("step 37's runner still asks for a template and made-up example photos");
  if (!/HEAVY = new Set\(\[[\s\S]*?"m1\.web\.image_seo"[\s\S]*?\]\);/.test(flow)) fail("step 37 isn't a background step (25 pages + up to 40 photos can't finish in 26 seconds)");
  const dp = flow.slice(flow.indexOf("async function describePhoto"), flow.indexOf("function cleanAlt"));
  if (!/system: `\$\{NO_FABRICATION\}\\n\\n\$\{US_IDIOM_PROMPT\}\\n\\n\$\{IMAGE_ALT_PROMPT\}`/.test(dp) || !/type: "image", source/.test(dp)) fail("the photo call doesn't send the photo, or drops the never-invent / US English rules");
  const P = String(FX.IMAGE_ALT_PROMPT || "");
  if (!/Never name a city/.test(P) || !/staff/.test(P) || !/"alt": null/.test(P)) fail("the photo prompt doesn't forbid invented places / staff, or has no way to say it can't tell");
}

// ── 4 · the change carries each photo; Mark live reads each description back on its photo ────────
if (has(SC, "photosReadBack", "the photo read-back")) {
  const items = [{ label: "Home · header", before: "", after: "Joe's Plumbing logo", src: "https://joes.test/img/logo.svg", page: "https://joes.test/", pages: ["https://joes.test/", "https://joes.test/services/"] },
    { label: "Home · Plumbing in Denver", before: "IMG_4471", after: "Two plumbers fixing a pipe", src: "https://cdn.joes.test/p/crew.jpg?w=1200", page: "https://joes.test/" }];
  const live = (logoAlt, crewAlt) => [{ src: "https://joes.test/img/logo.svg", alt: logoAlt }, { src: "https://cdn.joes.test/p/crew.jpg?w=800", alt: crewAlt }];
  const r1 = SC.photosReadBack(items, { "https://joes.test/": live("Joe's Plumbing logo", "Two plumbers fixing a pipe"), "https://joes.test/services/": live("Joe’s Plumbing logo", null) });
  if (r1.missing.length || r1.unread.length) fail(`descriptions that are on their photos weren't read back as there (${r1.missing.join("; ")})`);
  const r2 = SC.photosReadBack(items, { "https://joes.test/": live("Joe's Plumbing logo", "IMG_4471"), "https://joes.test/services/": null });
  if (!r2.missing.includes("Home · Plumbing in Denver") || !r2.unread.includes("https://joes.test/services/")) fail("a description not on its photo, or a page that didn't open, reads as live");
  const ok = SC.cleanChange("m1.web.image_seo", { kind: "batch", items });
  if (ok.error || !ok.change.items[0].src || ok.change.items[0].pages.length !== 2) fail(`a photo change loses its photo's address or pages (${ok.error || "dropped"})`);
  if (!SC.cleanChange("m1.web.image_seo", { kind: "batch", items: [{ label: "Home", after: "A van" }] }).error) fail("a photo line with no photo address can be saved (Mark live couldn't find it)");
  if (!SC.cleanChange("m1.web.image_seo", { kind: "batch", items: Array.from({ length: 41 }, (_, i) => ({ ...items[1], label: `L${i}` })) }).error) fail("one change can hold more than 40 photos");
  const D = read("netlify/functions/admin-deliverables.js");
  const pub = D.slice(D.indexOf('} else if (act === "publish") {'), D.indexOf('} else return json(400, { error: "Unknown website action." });'));
  if (!/SC\.photosReadBack\(photoLines, read\)/.test(pub) || !/if \(rb\.missing\.length && !why\) return json\(409/.test(pub) || !/if \(rb\.unread\.length && !why\) return json\(409/.test(pub)) fail("Mark live doesn't read each photo's description back (or marks it live when one is missing)");
  if (!/Object\.assign\(c, SC\.photoChangeOf\(od\.photo_draft, t, site\)\)/.test(D)) fail("the server's prefill doesn't build the photo lines with the same producer as the card");
}

// ── 5 · the admin card: six states, never Draft ready / model text / a marker / Mark step complete ─
{
  const PB = JSON.parse(read("data/playbooks/playbooks.json"));
  const step = [...(PB.month1 || [])].find((s) => s.id === "m1.web.image_seo");
  if (!step) fail("step 37 left the playbook");
  const snapPages = [{ url: "https://joes.test/", read: true, photos: SS.photosOf ? SS.photosOf(HOME, "https://joes.test/").photos : [] }, { url: "https://joes.test/services/", read: true, photos: SS.photosOf ? SS.photosOf(SERV, "https://joes.test/services/").photos : [] }];
  const st = { selectedClient: { id: "c1", business_name: "Joe's Plumbing & Heating, LLC", primary_market: "Denver, CO", website_url: "https://joes.test" }, flowM1Playbook: [{ ...step, t: step.title }], flowM2Playbook: [],
    onboardingData: { tasks: {}, site_snapshot: { at: "2026-11-06T15:00:00Z", pages: snapPages } } };
  const api = liftAdmin(["imgSvg", "siteChangeAdminHtml", "wcRowPill", "stepOutputHtml", "stepDoneWhen"], { extraGlobals: { state: st, rgaSiteChange: SC,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), authHeaders: async () => ({}), setBanner: () => {}, renderOnboardingChecklist: () => {}, renderMonthlyChecklist: () => {}, movesForSelected: () => [] } });
  const card = (task) => { st.onboardingData.tasks["m1.web.image_seo"] = task; return String(api.call("siteChangeAdminHtml", ["m1.web.image_seo", task]) || ""); };
  const pill = (task) => (api.call("wcRowPill", ["m1.web.image_seo", task]) || {}).text || "";
  const never = (h, what) => { for (const [re, w] of [[/Draft ready/, "Draft ready"], [/TRUNCATED|\[\[/, "an internal marker"], [/I'll deliver|FILENAME_TEMPLATE/, "the model's text"], [/Mark step complete/, "Mark step complete"]]) if (re.test(h)) fail(`${what}: the card shows ${w}`); };
  const RAN = "2026-11-06T19:31:00Z";
  // 1 · ready
  let h = card({ status: "in_progress" });
  if (!/Your move · draft it/.test(h) || !/5 of the 6 photos on their website have no description/.test(h) || !/<b>Home<\/b> 3 of 4/.test(h) || !/read Nov 6 · 2 pages/.test(h) || !/⚡ Draft this for me/.test(h) || !/Icons and decorations are left out/.test(h)) fail(`state 1 (ready) isn't drawn from the latest read: ${h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200)}`);
  never(h, "state 1");
  // 2 · drafting
  h = card({ status: "in_progress", started_at: new Date(Date.now() - 20000).toISOString(), ran_at: "2026-11-05T10:00:00Z", auto_result: { summary: "old" } });
  if (!/Drafting…/.test(h) || !/Looking at each of the 5 photos and the page it's on\./.test(h)) fail("state 2 (drafting) isn't drawn");
  // 3 · check and send
  const draft = { at: RAN, pages: 3, more_left: 0, photos: [{ src: "https://joes.test/img/logo.svg", page: "https://joes.test/", pages: ["https://joes.test/", "https://joes.test/services/"], page_label: "Every page", where: "header", kind: "logo", before: "", after: "Joe's Plumbing & Heating, LLC logo" },
    { src: "https://cdn.joes.test/p/crew.jpg?w=1200", page: "https://joes.test/", page_label: "Home", where: "Plumbing in Denver", kind: "photo", before: "IMG_4471", after: "Two plumbers fixing a pipe under a sink" },
    { src: "https://joes.test/p/heater.png", page: "https://joes.test/services/", page_label: "Services", where: "Drain cleaning", kind: "photo", before: "photo", after: "", why: "unclear" }] };
  const t3 = { status: "in_progress", ran_at: RAN, started_at: "2026-11-06T19:30:00Z", outcome: "draft_ready", auto_result: { summary: "3 photo descriptions drafted", outcome_data: { photo_check: { state: "drafted", pages: 3, photos: 7, missing: 3, at: RAN }, photo_draft: draft } } };
  h = card(t3);
  if (!/Your move · check and send/.test(h) || !/3 photo descriptions/.test(h) || !/Today: <s>no description<\/s>/.test(h) || !/Today: “IMG_4471”/.test(h) || !/<b>Ours:<\/b> Two plumbers/.test(h) || !/data-ob-img-edit="0"/.test(h)
    || !/Couldn't tell what this shows; write it yourself/.test(h) || !/data-ob-img-send>Send<\/button>/.test(h) || !/Goes to their For your approval as one website change/.test(h) || !/>Draft again<\/button>/.test(h) || !/<img class="ob-img-th" src="https:\/\/cdn\.joes\.test\/p\/crew\.jpg\?w=1200"/.test(h)) fail("state 3 (check and send) isn't one line per photo with its thumbnail, Today, Ours, Edit, Send and Draft again");
  never(h, "state 3");
  if (pill(t3) !== "Your move") fail(`state 3's row pill reads "${pill(t3)}"`);
  if (!/How RGA names photos it uploads for them/.test(h) || !/joes-plumbing-and-heating-llc-what-it-shows-denver-co\.jpg/.test(h) || !/not sent to the client/.test(h)) fail("RGA's file-name rule (name + city on file) isn't on the card");
  // 4 · the 11:28 record: an old prose draft, cut off
  const OLD = "I'll deliver every requested asset in one pass.\nFILENAME_TEMPLATE: {business}-{what}.jpg\n…\n\n[[TRUNCATED: this draft hit the token ceiling and is INCOMPLETE — do not publish or approve it. Re-run the step after raising maxTokens.]]";
  const t4 = { status: "in_progress", ran_at: "2026-11-06T19:28:00Z", outcome: "draft_ready", auto_result: { summary: OLD } };
  h = card(t4);
  if (!/The draft didn't come out right/.test(h) || !/describes photos that aren't there/.test(h) || !/>Draft again<\/button>/.test(h)) fail("state 4: the 11:28 draft isn't 'didn't come out right' with its reason in plain words");
  never(h, "state 4 (the 11:28 record)");
  if (pill(t4) !== "Needs a look") fail(`state 4's row pill reads "${pill(t4)}" (never Draft ready)`);
  // (only once the card holds: the old renderer reaches helpers the lift can't supply, and the card has already failed above)
  if (!F.length) {
    const out = String(api.call("stepOutputHtml", [OLD, t4, { flowId: "m1.web.image_seo", sopType: "hybrid", hasRunner: true }]) || "");
    if (/TRUNCATED|I'll deliver/.test(out)) fail("the run's raw text (with its marker) still prints under the card");
  }
  h = card({ status: "in_progress", ran_at: RAN, auto_result: { outcome_data: { photo_check: { state: "failed", why: "stopped_early", at: RAN } } } });
  if (!/It stopped before the last photo, so nothing was saved or sent\./.test(h)) fail("a run that stopped early doesn't say so in plain words");
  // 5 · nothing to describe · couldn't check
  h = card({ status: "done", ran_at: RAN, no_change_needed: { note: "The check found it already right", by: "check", at: RAN }, auto_result: { outcome_data: { photo_check: { state: "all_described", photos: 18, pages: 7, beyond_cap: 0, at: RAN } } } });
  if (!/Every photo on their website already has a description/.test(h) || !/Checked 18 photos on 7 pages, /.test(h) || !/ok/.test(h.slice(0, 120))) fail("state 5 (nothing to describe) isn't the green card with the check as proof");
  h = card({ status: "in_progress", ran_at: RAN, auto_result: { outcome_data: { photo_check: { state: "couldnt", why: "blocked", at: RAN } } } });
  if (!/Couldn't check/.test(h) || !/Their website didn't let us read its pages/.test(h) || !/It blocks automatic visits\. Nothing was drafted\./.test(h) || !/>Try again<\/button>/.test(h)) fail("state 5b (couldn't check) isn't the grey card with Try again");
  // 6 · with the client → Done on read-back
  const lines0 = typeof SC.photoItems === "function" ? SC.photoItems(draft) : draft.photos.map((p) => ({ label: `${p.page_label} · ${p.where}`, before: p.before, after: p.after, src: p.src, page: p.page }));
  const ch = SC.cleanChange("m1.web.image_seo", { kind: "batch", items: lines0.filter((i) => i.after) }).change || { items: [] };
  const v = "2026-11-06T19:40:00Z", sent = { status: "in_progress", site_change: { ...ch, v }, internal_review: { decision: "approved", change_v: v, at: "2026-11-06T19:41:00Z" } };
  h = card(sent);
  if (!/With the client/.test(h) || !/2 photo descriptions/.test(h) || !/to For your approval\. Waiting for them\./.test(h)) fail("state 6 (with the client) isn't drawn");
  const live = { ...sent, status: "done", approval: { decision: "approved", change_v: v, at: "2026-11-07T15:00:00Z" }, published: { v, at: "2026-11-08T15:00:00Z", checked: true } };
  h = card(live);
  if (!/2 photos described on their website/.test(h) || !/on their site and read back/.test(h) || !/See them/.test(h)) fail("state 6 (Done) isn't 'N photos described · Approved · on their site and read back'");
  never(h, "state 6");
  if (pill(live) !== "Done") fail(`a live, read-back change's pill reads "${pill(live)}"`);
  // the Done-when line names no Mark step complete
  const dw = String(api.call("stepDoneWhen", [step]) || "");
  if (!/read back/.test(dw) || /Mark step complete/.test(dw)) fail(`step 37's Done-when line isn't the read-back rule ("${dw}")`);
  if (/FILENAME_TEMPLATE|ALT_TAG_TEMPLATE/.test(step.instructions || "")) fail("step 37's instructions still describe the old templates");
}

// ── 6 · file names: RGA's rule, any name ─────────────────────────────────────────────────────────
if (has(SC, "photoFileName", "RGA's file-name rule")) {
  for (const [n, m, want] of [["Joe's Plumbing & Heating, LLC", "Denver, CO", "joes-plumbing-and-heating-llc-what-it-shows-denver-co.jpg"], ["Café Délice", "Montréal, QC", "cafe-delice-what-it-shows-montreal-qc.jpg"],
    ["Smile Dental Studio", "", "smile-dental-studio-what-it-shows.jpg"], ["東京寿司", "Tokyo", "東京寿司-what-it-shows-tokyo.jpg"]]) {
    const got = SC.photoFileName(n, m);
    if (got !== want) fail(`"${n}" + "${m}" names a photo "${got}", want "${want}"`);
  }
  if (SC.photoFileName("", "Denver") !== "") fail("a business with no name on file still gets a file-name rule");
}

if (F.length) { console.error("🔴 step 37 doesn't describe the photos really on their website:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 37 describes the photos really on their website: the read keeps each photo (icons, pixels, inline + repeats left out, the logo kept), each looked at once, never guessed, up to 40, Done on its own only when every page read, blocked / partial / stopped / down = no draft; each description read back on its photo; the card's six states with no Draft ready, marker, model text or Mark step complete; file names from the name + city on file, any name");
