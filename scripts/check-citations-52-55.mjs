#!/usr/bin/env node
// check-citations-52-55.mjs — ADMIN STEPS 52–55: RGA PRESSES THE SIGN-UPS; THE SYSTEM PREPARES EVERY FIELD AND PROVES EACH LISTING LIVE
// (approved citations_52_55_v1, the owner 11-9). Runs the SHIPPED code against fakes: a fake database, a fake Google profile, fake
// directory pages, a fake SerpAPI and a fake model. No network, no production data, no real search.
//
// WHAT IT HOLDS
//   1 the list is data and fits the trade: RGA (marketing) never gets Angie or HomeAdvisor; a plumber does; an unknown trade gets the
//     general list only; step 53 is RGA's own list per trade (marketing agencies, dentists, lawyers, restaurants) and a trade with no
//     list says so. Step 53 never calls a model.
//   2 the pack is read from their Google profile (or the record, and says so); nothing is filled in that we don't hold.
//   3 hidden address: true/false only where the directory's own page says so (its source in the code); a business with no public
//     address waits on a directory that needs one, and the wait never holds the step up.
//   4 Submitted → live ONLY on a positive read: a search result on the directory, with the listing shape, naming the business, its page
//     showing no different phone; a pasted link that opens and names the business. A search that didn't run is "couldn't check".
//   5 "not for this business" only by a person (the admin function, behind RGA's login); the checks never write it. Undo puts it back.
//   6 the done rule; a skip counts as finished and comes back exactly as it was; the Month 1 report lists it as skipped with the reason.
//   7 55's places come from a search near the client (the model only writes the ask); 54's Yelp states (page, or one search, said which).
//   8 the scheduled look: capped searches, a reserve kept, test clients left out, the record read again before writing, wired + checking in.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SERPAPI_KEY: "serp-test", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GOOGLE_OAUTH_CLIENT_ID: "i", GOOGLE_OAUTH_CLIENT_SECRET: "s" });
delete process.env.CITATION_LIVE_SEARCH;
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let B, P, DIR, FX, ADM, M1;
// the network for the modules that use the global fetch (flow-execute's runners): routed by URL, every call logged
const net = { log: [], route: null };
globalThis.fetch = async (u, init = {}) => { const url = String(u); net.log.push(url); return net.route ? net.route(url, init) : res(404, "not faked"); };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)), clone() { return this; } });
try {
  B = req("./_citation-build.js"); P = req(path.join(SITE, "shared/citation-progress.js")); DIR = req("./_citation-directories.js");
  FX = req("./flow-execute.js"); ADM = req("./admin-citation-build.js"); M1 = req("./_month1-report.js");
} catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const keys = (stepId, client) => B.buildList(stepId, client, []).items.map((i) => i.key);
const NOW = Date.parse("2026-11-09T18:00:00Z"), DAY = 864e5, iso = (ms) => new Date(ms).toISOString();

// ── 1 · the list fits the trade, and is data ──
const RGA = { id: "c-rga", business_name: "Rocket Growth Agency", business_type: "Local SEO agency", primary_market: "Culver City, CA", geography_model: "service_area", website_url: "https://www.rocketgrowthagency.com" };
const RGA_CAT = { business_name: "Rocket Growth Agency", gbp_primary_category: "Internet marketing service", primary_market: "Culver City, CA" };
for (const [name, c] of [["RGA (business type)", RGA], ["RGA (only Google's category)", RGA_CAT]]) {
  const k = keys(B.STEP.TOP, c);
  if (k.some((x) => ["angi", "homeadvisor", "thumbtack"].includes(x))) fail(`52: ${name} is offered the home marketplaces: ${k.join(", ")}`);
  if (!k.includes("yelp") || !k.includes("bbb")) fail(`52: ${name} lost the general list: ${k.join(", ")}`);
  const t = keys(B.STEP.TRADE, c);
  for (const d of ["clutch", "upcity", "designrush", "goodfirms", "agencyspotter"]) if (!t.includes(d)) fail(`53: ${name} isn't offered ${d}: ${t.join(", ")}`);
}
{
  const plumber = { business_type: "Plumber", primary_market: "Austin, TX" };
  const k = keys(B.STEP.TOP, plumber);
  if (!k.includes("angi") || !k.includes("homeadvisor")) fail(`52: a plumber isn't offered Angie and HomeAdvisor: ${k.join(", ")}`);
  const t = B.buildList(B.STEP.TRADE, plumber, []);
  if (t.items.length || !/are on the list of Build top-10 priority citations/.test(t.none || "")) fail(`53: a plumber's list should point at step 52's home directories, got ${JSON.stringify(t.none)}`);
  const photographer = { business_type: "Wedding photographer", primary_market: "Austin, TX" };
  const kp = keys(B.STEP.TOP, photographer);
  if (kp.some((x) => ["angi", "homeadvisor", "thumbtack"].includes(x)) || !kp.includes("yelp")) fail(`52: an unknown trade isn't the general list only: ${kp.join(", ")}`);
  const tp = B.buildList(B.STEP.TRADE, photographer, []);
  if (tp.items.length || !/No directory list for this trade yet/.test(tp.none || "")) fail(`53: a trade with no list doesn't say so: ${JSON.stringify(tp)}`);
  const none = B.buildList(B.STEP.TRADE, { primary_market: "Austin, TX" }, []);
  if (none.items.length || !/No trade on the client's record/.test(none.none || "")) fail("53: a client with no trade isn't told so");
  if (keys(B.STEP.TOP, { primary_market: "Austin, TX" }).some((x) => ["angi", "homeadvisor", "thumbtack"].includes(x))) fail("52: no trade on the record gets the home marketplaces");
  const dent = keys(B.STEP.TRADE, { business_type: "Dentist", primary_market: "Austin, TX" });
  if (!dent.includes("healthgrades") || dent.includes("clutch")) fail(`53: a dentist's list is wrong: ${dent.join(", ")}`);
  if (!keys(B.STEP.TRADE, { industry: "Personal injury lawyers", primary_market: "Austin, TX" }).includes("avvo")) fail("53: a lawyer doesn't get the legal list");
  if (!keys(B.STEP.TRADE, { industry: "Restaurant", primary_market: "Austin, TX" }).includes("opentable")) fail("53: a restaurant doesn't get its list");
  if (keys(B.STEP.TRADE, { business_type: "Farmers market", primary_market: "Austin, TX" }).includes("clutch")) fail("53: 'market' alone reads as a marketing agency");
  // the audit's stored "found" row marks the directory live (current method, on its own host only)
  const cur = `[${DIR.CIT_METHOD}] 2026-10-07 — listing found at x`;
  const L = B.buildList(B.STEP.TOP, RGA, [{ source: "Facebook", status: "found", url: "https://www.facebook.com/rocketgrowthagency", notes: cur },
    { source: "Yelp", status: "found", url: "https://evil.test/biz/x", notes: cur }, { source: "BBB", status: "found", url: "https://www.bbb.org/us/ca/x/profile/y", notes: "old method" },
    { source: "Angie", status: "missing", url: null, notes: cur }]);
  const fb = L.items.find((i) => i.key === "facebook"), yl = L.items.find((i) => i.key === "yelp"), bb = L.items.find((i) => i.key === "bbb");
  if (!fb || fb.audit_url !== "https://www.facebook.com/rocketgrowthagency") fail("52: a listing the audit found isn't marked live");
  if (yl.audit_url || bb.audit_url) fail("52: a row off the directory's host, or from an old method, is trusted");
  if (L.items.some((i) => i.key === "angi")) fail("52: a stored audit row brings a directory back that doesn't fit the trade (the 11-9 bug)");
}

// ── 2 · the pack ──
const GBP = { title: "Rocket Growth Agency", phoneNumbers: { primaryPhone: "(424) 242-2040" }, websiteUri: "https://www.rocketgrowthagency.com/?utm_source=gbp&utm_medium=organic",
  categories: { primaryCategory: { displayName: "Internet marketing service" }, additionalCategories: [{ displayName: "Marketing agency" }] },
  regularHours: { periods: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((d) => ({ openDay: d, openTime: { hours: 9 }, closeDay: d, closeTime: { hours: 18 } })) },
  serviceArea: { places: { placeInfos: [{ placeName: "Los Angeles County, CA, USA" }] } },
  profile: { description: "Rocket Growth Agency helps local service businesses get found on Google Maps. We set up and run the profile, the listings and the website pages that bring calls. Every number we report is measured, and you see the work as it happens. We work with owners across Los Angeles County." } };
{
  const pk = B.buildPack(RGA, GBP, { readAt: iso(NOW) });
  if (pk.name !== "Rocket Growth Agency" || pk.phone !== "(424) 242-2040" || pk.category !== "Internet marketing service" || pk.from.name !== "google") fail(`pack: Google's facts aren't the pack: ${JSON.stringify(pk)}`);
  if (pk.website !== "https://www.rocketgrowthagency.com/") fail(`pack: the website keeps Google's tracking tags: ${pk.website}`);
  if (pk.hours !== "Mon–Fri 9 AM–6 PM · Sat, Sun closed") fail(`pack: hours read wrong: ${pk.hours}`);
  if (pk.service_area !== "Los Angeles County (CA)") fail(`pack: the service area isn't Google's, once per state (step56_reads_step52_v1): ${pk.service_area}`);
  if (!pk.description || pk.description.length > 250 || !GBP.profile.description.startsWith(pk.description.replace(/…$/, ""))) fail(`pack: the short description isn't the start of theirs: ${pk.description}`);
  if (pk.address_public !== false || pk.address) fail("pack: a profile with no storefront address shows one");
  const txt = B.packText(pk);
  if (!/^Name: Rocket Growth Agency$/m.test(txt) || !/^Address: Hidden/m.test(txt)) fail(`pack: the copy text is wrong:\n${txt}`);
  const shop = B.buildPack({ business_name: "Acme Plumbing" }, { title: "Acme Plumbing", storefrontAddress: { addressLines: ["12 Main St"], locality: "Austin", administrativeArea: "TX", postalCode: "78701" } });
  if (shop.address !== "12 Main St, Austin, TX 78701" || shop.address_public !== true) fail(`pack: a storefront's address isn't the pack's: ${shop.address}`);
  const rec = B.buildPack({ business_name: "Acme Plumbing", identity_phone: "(512) 555-0100", website_url: "acme.test", primary_market: "Austin, TX", geography_model: "single_location" }, null, { googleWhy: "their Google profile isn't connected" });
  if (rec.read_from !== "record" || rec.from.phone !== "record" || rec.website !== "https://acme.test/" || rec.hours !== null || rec.description !== null || rec.google_why !== "their Google profile isn't connected") fail(`pack: without Google it doesn't say so, or invents: ${JSON.stringify(rec)}`);
  if (rec.address_public !== true || rec.address !== null) fail("pack: a storefront with no Google read invents an address");
  const unk = B.buildPack({ business_name: "X" }, null);
  if (unk.address_public !== null || /Address/.test(B.packText(unk))) fail("pack: an unknown storefront is guessed");
  if (B.packLines(unk).filter(([, v]) => v == null).length < 4) fail("pack: missing fields aren't named missing");
}

// ── 3 · hidden address ──
{
  const src = read("netlify/functions/_citation-directories.js"), lines = src.split("\n");
  for (const [k, v] of Object.entries(DIR.SIGNUP)) {
    if (v.hidden !== true && v.hidden !== false && v.hidden !== null) fail(`hidden: ${k} is neither true, false nor null`);
    if (v.hidden === true || v.hidden === false) {
      const i = lines.findIndex((l) => new RegExp(`^\\s*${k}: \\{`).test(l));
      const near = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (i < 0 || !/https:\/\/\S+/.test(near)) fail(`hidden: ${k} is set ${v.hidden} with no source page beside it`);
    }
  }
  if (DIR.SIGNUP.yelp.hidden !== true || DIR.SIGNUP.nextdoor.hidden !== true) fail("hidden: the two confirmed facts (Yelp, Nextdoor) are gone");
  for (const d of [...DIR.CITATION_DIRECTORIES, ...DIR.TRADE_DIRECTORIES]) if (!DIR.SIGNUP[d.key]) fail(`signup: ${d.key} has no sign-up entry (unknown must be said, not missing)`);
  const sab = { address_public: false }, shop = { address_public: true };
  const it = (hidden) => ({ key: "x", source: "X", signup_url: "https://x.test/", searchable: false, hidden });
  if (P.rowOf(it(false), null, sab).state !== "waits_address") fail("hidden: a directory that needs a street address doesn't wait for a business with none");
  if (!/Accepts a hidden address/.test(P.rowOf(it(true), null, sab).line)) fail("hidden: a confirmed yes isn't said");
  if (!/Check their sign-up: it may need a street address/.test(P.rowOf(it(null), null, sab).line) || P.rowOf(it(null), null, sab).state !== "your_move") fail("hidden: an unknown isn't 'check their sign-up'");
  if (P.rowOf(it(false), null, shop).state !== "your_move") fail("hidden: a storefront waits on an address it has");
  const task = { outcome_data: { pack: sab, list: { items: [{ ...it(false), key: "a" }, { ...it(true), key: "b" }] } }, listings: { b: { state: "live", url: "https://x.test/b", live_at: iso(NOW) } } };
  const pg = P.listProgress(task);
  if (!pg.done || pg.counts.waiting !== 1) fail(`hidden: a waiting directory holds the step up: ${JSON.stringify(pg.counts)}`);
  const allWait = P.listProgress({ outcome_data: { pack: sab, list: { items: [{ ...it(false), key: "a" }] } } });
  if (allWait.done) fail("done: a list where everything waits is called done with nothing built");
}

// ── 4 · Submitted → live only on a positive read ──
const pack = B.buildPack(RGA, GBP);
const yelpDir = DIR.CITATION_DIRECTORIES.find((d) => d.key === "yelp"), bingDir = DIR.CITATION_DIRECTORIES.find((d) => d.key === "bing");
const PAGE_OK = "<html><title>Rocket Growth Agency - Culver City - Yelp</title><body>Rocket Growth Agency. Call (424) 242-2040. rocketgrowthagency.com</body></html>";
const PAGE_WRONG = "<html><title>Rocket Growth Agency - Yelp</title><body>Rocket Growth Agency. Call (310) 555-9999.</body></html>";
function lookDeps({ results = [], ran = true, pages = {}, budget = 5 } = {}) {
  const asked = []; let left = budget;
  return { asked, deps: { canSearch: () => left > 0, spend: () => { left--; }, search: async (q) => { asked.push(q); return ran ? { ran: true, results } : { ran: false, why: "the search answered 503" }; },
    fetch: async (u) => { const p = pages[u]; if (!p) return res(404, ""); return p.status ? res(p.status, p.body || "") : res(200, p); } } };
}
const submitted = (extra = {}) => ({ state: "submitted", at: iso(NOW - 3 * DAY), by: "chris@x", tries: 0, ...extra });
{
  const Y = "https://www.yelp.com/biz/rocket-growth-agency-culver-city";
  let L = lookDeps({ results: [{ link: Y, title: "Rocket Growth Agency - Culver City - Yelp" }], pages: { [Y]: PAGE_OK } });
  let r = await B.lookForListing({ dir: yelpDir, entry: submitted(), pack, deps: L.deps });
  let e = B.applyLook(submitted(), r, NOW);
  if (e.state !== "live" || e.url !== Y || e.match.phone !== true || e.match.website !== true) fail(`live: a found listing with the same details isn't live: ${JSON.stringify(e)}`);
  if (!/"Rocket Growth Agency" site:yelp\.com/.test(L.asked[0] || "")) fail(`live: the first look isn't the site: search (${L.asked[0]})`);
  L = lookDeps({ results: [{ link: Y, title: "Rocket Growth Agency - Yelp" }], pages: { [Y]: PAGE_WRONG } });
  e = B.applyLook(submitted(), await B.lookForListing({ dir: yelpDir, entry: submitted(), pack, deps: L.deps }), NOW);
  if (e.state === "live" || !e.found_wrong || !e.found_wrong.fields.includes("phone")) fail("live: a listing showing a different phone is marked live");
  if (P.rowOf({ key: "yelp", source: "Yelp", searchable: true }, e, pack).state !== "found_wrong") fail("live: a wrong phone doesn't read as RGA's move");
  L = lookDeps({ results: [{ link: "https://www.yelp.com/biz/rocket-digital-agency-la", title: "Rocket Digital Agency - Yelp" }, { link: "https://business.yelp.com/", title: "Rocket Growth Agency" }] });
  e = B.applyLook(submitted(), await B.lookForListing({ dir: yelpDir, entry: submitted(), pack, deps: L.deps }), NOW);
  if (e.state === "live" || e.tries !== 1) fail("live: another business's listing, or Yelp's own page, is taken as theirs");
  L = lookDeps({ ran: false });
  e = B.applyLook(submitted(), await B.lookForListing({ dir: yelpDir, entry: submitted(), pack, deps: L.deps }), NOW);
  if (e.state === "live" || e.tries !== 0 || e.last_check.ok !== null) fail("live: a search that didn't run counts as a try or a finding");
  L = lookDeps({ results: [{ link: Y, title: "Rocket Growth Agency - Yelp" }], budget: 0 });
  r = await B.lookForListing({ dir: yelpDir, entry: submitted(), pack, deps: L.deps });
  if (r.ran || L.asked.length) fail("live: a search was spent with no budget");
  // the page couldn't be read: name found by search, the phone and website "couldn't check", never a match
  L = lookDeps({ results: [{ link: Y, title: "Rocket Growth Agency - Yelp" }], pages: { [Y]: { status: 403 } } });
  e = B.applyLook(submitted(), await B.lookForListing({ dir: yelpDir, entry: submitted(), pack, deps: L.deps }), NOW);
  if (e.state !== "live" || e.match.phone !== null || !/couldn't check the phone or website/.test(P.rowOf({ key: "yelp", source: "Yelp", searchable: true }, e, pack).line)) fail("live: an unread page claims the phone and website match");
  // the second look uses the other query form
  L = lookDeps({ results: [] }); await B.lookForListing({ dir: yelpDir, entry: submitted({ tries: 1 }), pack, deps: L.deps });
  if (!/^"Rocket Growth Agency" Yelp$/.test(L.asked[0] || "")) fail(`live: the looks don't alternate the two query forms (${L.asked[0]})`);
  // after 10 tries it's RGA's move, never "missing" and never not_for
  const tenth = submitted({ tries: 10 });
  if (B.dueEntry(tenth, NOW) || P.rowOf({ key: "yelp", source: "Yelp", searchable: true }, tenth, pack).state !== "not_found") fail("live: the search keeps going past 10 tries, or the row doesn't say so");
  if (B.dueEntry(submitted({ next_check_at: iso(NOW + DAY) }), NOW)) fail("live: a look runs before its 2 days");
}

// ── 5 · search-blind: the link is checked ──
{
  const t0 = { outcome_data: { pack, list: B.buildList(B.STEP.TOP, RGA, []) } };
  let r = B.applyListAction(t0, { action: "link", key: "bing", url: "https://evil.test/bing", by: "chris@x", now: NOW });
  if (!r.error) fail("link: a link off the directory's host is accepted");
  r = B.applyListAction(t0, { action: "link", key: "bing", url: "https://www.bing.com/maps?ss=ypid.123", by: "chris@x", now: NOW });
  if (r.error) fail(`link: a Bing link is refused: ${r.error}`);
  const ent = r.task.listings.bing, L = (pages) => lookDeps({ pages, budget: 0 }).deps;
  let e = B.applyLook(ent, await B.lookForListing({ dir: bingDir, entry: ent, pack, deps: L({ [ent.link]: PAGE_OK }) }), NOW);
  if (e.state !== "live" || e.via !== "link") fail("link: a page that opens and names the business isn't live");
  e = B.applyLook(ent, await B.lookForListing({ dir: bingDir, entry: ent, pack, deps: L({ [ent.link]: "<title>Bing Maps</title>Some other place" }) }), NOW);
  if (e.state === "live" || !e.link_check || e.link_check.ok !== false) fail("link: a page that doesn't name the business is accepted");
  e = B.applyLook(ent, await B.lookForListing({ dir: bingDir, entry: ent, pack, deps: L({ [ent.link]: { status: 403 } }) }), NOW);
  if (e.state === "live" || !e.link_check || e.link_check.ok !== null || !/Couldn't check the link/.test(P.rowOf({ key: "bing", source: "Bing Places", searchable: false }, e, pack).line)) fail("link: a page we couldn't read is a finding either way");
  if ((await B.lookForListing({ dir: bingDir, entry: submitted(), pack, deps: L({}) })) !== null) fail("link: a search-blind directory with no link is searched");
  if (P.rowOf({ key: "bing", source: "Bing Places", searchable: false }, submitted(), pack).state !== "by_link") fail("link: a search-blind directory doesn't ask for its link");
}

// ── 6 · actions: not_for needs a reason (a person's), undo restores exactly ──
{
  const t0 = { outcome_data: { pack, list: B.buildList(B.STEP.TOP, RGA, []) } };
  let r = B.applyListAction(t0, { action: "not_for", key: "nextdoor", reason: "", by: "chris@x", now: NOW });
  if (!r.error) fail("not_for: saved with no reason");
  const s1 = B.applyListAction(t0, { action: "submitted", key: "nextdoor", by: "chris@x", now: NOW }).task;
  const s2 = B.applyListAction(s1, { action: "not_for", key: "nextdoor", reason: "They don't serve neighborhoods directly", by: "chris@x", now: NOW + 1000 }).task;
  if (s2.listings.nextdoor.state !== "not_for" || s2.listings.nextdoor.by !== "chris@x") fail("not_for: who said so isn't kept");
  const s3 = B.applyListAction(s2, { action: "undo", key: "nextdoor", now: NOW + 2000 }).task;
  const { prev, ...was } = s1.listings.nextdoor; void prev;
  if (JSON.stringify(s3.listings.nextdoor) !== JSON.stringify(was)) fail("undo: not_for doesn't come back exactly as it was");
  const s4 = B.applyListAction(s3, { action: "undo", key: "nextdoor", now: NOW + 3000 }).task;
  if (s4.listings.nextdoor) fail("undo: a submit isn't undone to nothing");
  if (!B.applyListAction(t0, { action: "submitted", key: "angi", by: "x", now: NOW }).error) fail("actions: a directory not on the list can be pressed");
  // the checks never write not_for: only applyListAction / applyPlaceAction may, and only the admin function calls them
  const src = ["netlify/functions/_citation-build.js", "netlify/functions/citation-live-check.js", "netlify/functions/flow-execute.js"].map((f) => [f, read(f)]);
  for (const [f, s] of src) {
    const code = s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const writes = (code.match(/state:\s*"not_for"/g) || []).length;
    if (f.endsWith("_citation-build.js") ? writes !== 2 : writes) fail(`not_for: ${f} writes "not for this business" outside the person's two actions (${writes})`);
    if (/applyListAction|applyPlaceAction/.test(code) && !f.endsWith("_citation-build.js")) fail(`not_for: ${f} applies a person's action`);
  }
  { const cb = read("netlify/functions/_citation-build.js"), look = cb.slice(cb.indexOf("async function checkClient"), cb.indexOf("module.exports"));
    if (!look || /applyListAction|applyPlaceAction|applySkip/.test(look)) fail("not_for: the scheduled look applies a person's action"); }
}

// ── 7 · the done rule, settle, skip ──
{
  const list = { items: [{ key: "a", source: "A", searchable: true, hidden: null }, { key: "b", source: "B", searchable: false, hidden: null }] };
  const base = { status: "in_progress", outcome_data: { pack: { address_public: true }, list } };
  let t = { ...base, listings: { a: { state: "live", url: "u", live_at: iso(NOW) } } };
  if (P.listProgress(t).done || B.settle(B.STEP.TOP, t, NOW).task.status === "done") fail("done: called done with a directory still to do");
  t = { ...t, listings: { ...t.listings, b: { state: "not_for", reason: "nope", by: "x" } } };
  const s = B.settle(B.STEP.TOP, t, NOW);
  if (s.task.status !== "done" || s.task.done_by !== "checks" || s.moved !== "done" || !s.task.completed_at) fail("done: live + not for them doesn't finish the step");
  const undone = B.settle(B.STEP.TOP, { ...s.task, listings: { a: t.listings.a } }, NOW);
  if (undone.task.status !== "in_progress" || undone.task.completed_at !== null || undone.moved !== "reopened") fail("done: an undo doesn't reopen a step its checks finished");
  if (B.settle(B.STEP.TOP, { ...base, status: "done" }, NOW).task.status !== "done") fail("done: a step a person ticked some other way is reopened");
  if (P.listProgress({ status: "x", outcome_data: { list: { items: [] }, pack: {} } }).done) fail("done: an empty list is done");
  // skip: a reason; counts as finished; back exactly as it was
  const before = { ...s.task };
  if (!B.applySkip(before, { action: "skip", reason: "", by: "x", now: NOW }).error) fail("skip: no reason accepted");
  const sk = B.applySkip(before, { action: "skip", reason: "the client doesn't want agency directories", by: "chris@x", now: NOW }).task;
  if (sk.status !== "skipped" || sk.skipped_by !== "rga" || sk.skip_reason !== "the client doesn't want agency directories") fail("skip: not recorded with its reason");
  if (B.settle(B.STEP.TOP, sk, NOW).task.status !== "skipped") fail("skip: the checks undo a skip");
  const un = B.applySkip(sk, { action: "unskip", now: NOW }).task;
  if (un.status !== before.status || un.completed_at !== before.completed_at || un.done_by !== before.done_by || "skip_reason" in un || "skip_prev" in un) fail("skip: Undo doesn't bring it back exactly as it was");
  // skipped is finished wherever "finished" is decided
  const fx = read("netlify/functions/flow-execute.js"), adm = read("admin/admin.js"), aut = read("netlify/functions/_website-autorun.js");
  if (!/return ts !== "done" && ts !== "skipped" && ts !== "declined";/.test(fx)) fail("skip: the runner's dependency check doesn't count a skipped step as finished");
  if (!/const done = st === "done" \|\| st === "skipped" \|\| st === "declined" \|\| callStarted;/.test(adm)) fail("skip: admin's active-step logic doesn't count skipped as finished");
  if (!/const finished = \(t\) => !!t && \["done", "skipped"\]\.includes\(t\.status\);/.test(aut)) fail("skip: the autopilot doesn't count skipped as finished");
}

// ── 8 · the Month 1 report lists a skip with its reason, never as done ──
{
  const pb = JSON.parse(read("data/playbooks/playbooks.json")).month1;
  const tasks = { "m1.kickoff.call": { status: "done", completed_at: "2026-10-01T17:00:00Z" },
    "m1.cit.industry_specific": { status: "skipped", skipped_at: "2026-11-12T17:00:00Z", skipped_by: "rga", skip_reason: "the client doesn't want agency directories" },
    "m1.cit.priority_top10": { status: "done", completed_at: "2026-11-10T17:00:00Z" } };
  const r = M1.buildMonth1Report({ client: { business_name: "Rocket Growth Agency" }, tasks, pageMeasures: [], playbook: pb, months: [], baseline: {}, kickoffAt: tasks["m1.kickoff.call"].completed_at, now: new Date("2026-11-20T12:00:00Z") });
  const sec = (k) => ((r.sections || []).find((x) => x.key === k) || { lines: [] }).lines.join("\n");
  if (!/Build industry-specific citations \(Nov 12\): the client doesn't want agency directories/.test(sec("skipped"))) fail(`report: a skipped step 53 isn't listed with its reason: ${sec("skipped")}`);
  if (/industry-specific/.test(sec("work"))) fail("report: a skipped step is listed as work done");
  if (!/Build top-10 priority citations/.test(sec("work"))) fail("report: a done step 52 isn't in the work");
}

// ── 9 · the runners: 52/53 data only (53 never calls a model), 55's places from search, 54's pack ──
const DB = { citations: [], oauth: [{ client_id: "c-rga", gbp_location_id: "accounts/1/locations/9", access_token: "tok", access_token_expires_at: "2099-01-01T00:00:00Z", refresh_token: "r" }] };
function routeFor({ serp = () => ({ organic_results: [] }), left = 100, pages = {}, google = true } = {}) {
  return async (url) => {
    if (url.startsWith("https://sb.test/rest/v1/client_citations")) return res(200, DB.citations);
    if (url.startsWith("https://sb.test/rest/v1/client_google_oauth")) return res(200, google ? DB.oauth : []);
    if (url.startsWith("https://sb.test/rest/v1/client_onboarding_records")) return res(200, [{ data: { tasks: {} } }]);
    if (url.startsWith("https://sb.test/rest/v1/")) return res(200, []);
    if (url.startsWith("https://mybusinessbusinessinformation.googleapis.com/")) return res(200, GBP);
    if (url.startsWith("https://serpapi.com/account.json")) return res(200, { total_searches_left: left });
    if (url.startsWith("https://serpapi.com/search.json")) return res(200, serp(new URL(url).searchParams.get("q")));
    if (/anthropic\.com|openai\.com/.test(url)) return res(500, { error: "a model was called" });
    if (pages[url]) return res(200, pages[url]);
    return res(404, "not faked");
  };
}
const modelCalls = () => net.log.filter((u) => /anthropic\.com|openai\.com/.test(u)).length;
{
  DB.citations = [{ source: "Facebook", status: "found", url: "https://www.facebook.com/rocketgrowthagency", notes: `[${DIR.CIT_METHOD}] 2026-10-07 — listing found at x`, updated_at: "2026-10-07" },
    { source: "Angie", status: "missing", url: null, notes: `[${DIR.CIT_METHOD}] 2026-10-07 — nothing`, updated_at: "2026-10-07" }];
  net.log.length = 0; net.route = routeFor();
  const top = await FX.citExecutors.top({ client: { ...RGA }, clientId: "c-rga", tasks: {} });
  const items = (top.outcome_data && top.outcome_data.list && top.outcome_data.list.items) || [];
  if (!items.length || items.some((i) => ["angi", "homeadvisor"].includes(i.key))) fail(`runner 52: RGA's list is wrong: ${items.map((i) => i.key).join(", ")}`);
  if (top.outcome_data.pack.read_from !== "google" || top.outcome_data.pack.phone !== "(424) 242-2040") fail("runner 52: the pack isn't read from their Google profile");
  if (modelCalls() || net.log.some((u) => /serpapi/.test(u))) fail("runner 52: it called a model or spent a search");
  // a directory left out is named as left out, with why; never as one to build
  if (top.summary.split("\n").some((l) => /Angie|HomeAdvisor/.test(l) && !/left out:/.test(l))) fail("runner 52: the summary lists a directory that doesn't fit RGA as one to build");
  if (!/Angie\s+left out: home businesses only/.test(top.summary)) fail("runner 52: the summary doesn't say why Angie is left out");
  if (top.completed !== false) fail("runner 52: a list with directories to do is finished");
  net.log.length = 0;
  const trade = await FX.citExecutors.trade({ client: { ...RGA }, clientId: "c-rga", tasks: {} });
  const tk = ((trade.outcome_data || {}).list || {}).items || [];
  if (tk.map((i) => i.key).sort().join() !== "agencyspotter,clutch,designrush,goodfirms,upcity") fail(`runner 53: RGA's trade list is wrong: ${tk.map((i) => i.key).join(", ")}`);
  if (modelCalls()) fail("runner 53: a model was called to choose directories");
  if (trade.outcome_data.list_source !== "trade_list") fail("runner 53: the result doesn't say the list is RGA's trade list");
  net.log.length = 0;
  net.route = routeFor({ google: false });   // a client with no Google connection: the trade is the record's
  const ph = await FX.citExecutors.trade({ client: { business_name: "Snap Studio", business_type: "Wedding photographer", primary_market: "Austin, TX" }, clientId: "c2", tasks: {} });
  if (modelCalls() || ph.outcome !== "indeterminate" || !/No directory list for this trade yet/.test(ph.summary)) fail("runner 53: a trade with no list invents one or doesn't say so");
  const src53 = read("netlify/functions/flow-execute.js"), i53 = src53.indexOf('"m1.cit.industry_specific": async'), i52 = src53.indexOf('"m1.cit.priority_top10": async');
  if (/aiDraft\(/.test(src53.slice(i53, src53.indexOf("\n  },", i53))) || /aiDraft\(/.test(src53.slice(i52, src53.indexOf("\n  },", i52)))) fail("runner 52/53: the runner still asks a model");
  if (/aiDraft\(/.test(src53.slice(src53.indexOf("async function citListRun"), src53.indexOf("async function auditCitations")))) fail("runner 52/53: the list builder asks a model");
  // 55: the places are the search's
  net.log.length = 0;
  net.route = routeFor({ serp: (q) => ({ organic_results: /chamber/.test(q) ? [{ link: "https://www.culvercitychamber.com/", title: "Culver City Chamber of Commerce" }, { link: "https://www.yelp.com/biz/x", title: "x" }]
    : /business association/.test(q) ? [{ link: "https://www.facebook.com/groups/x", title: "a group" }, { link: "https://www.rocketgrowthagency.com/about", title: "RGA" }, { link: "https://ccba.example.org/", title: "Culver City Business Association" }] : [] }),
    pages: { "https://www.culvercitychamber.com/": '<a href="/join">Join the Chamber</a>' } });
  const m = await FX.citExecutors.mentions({ client: { ...RGA }, clientId: "c-rga", tasks: {} });
  const hosts = ((m.outcome_data || {}).places || []).map((p) => p.host).sort().join();
  if (hosts !== "ccba.example.org,culvercitychamber.com") fail(`runner 55: the places aren't exactly the search's (minus directories, social sites and their own site): ${hosts}`);
  const ch = ((m.outcome_data || {}).places || []).find((p) => p.host === "culvercitychamber.com");
  if (!ch || ch.contact_url !== "https://www.culvercitychamber.com/join") fail("runner 55: the place's join or contact page isn't read from its own page");
  const searches = net.log.filter((u) => /serpapi\.com\/search/.test(u)).length;
  if (searches < 1 || searches > B.RUN_SEARCH_CAP) fail(`runner 55: it spent ${searches} searches`);
  if (modelCalls()) fail("runner 55: a model was called while finding places");
  net.log.length = 0;
  const again = await FX.citExecutors.mentions({ client: { ...RGA }, clientId: "c-rga", tasks: { "m1.platform.mentions": { outcome_data: m.outcome_data } } });
  if (net.log.some((u) => /serpapi\.com\/search/.test(u)) || (again.outcome_data.places || []).length !== 2) fail("runner 55: a second run searches again");
  net.log.length = 0; net.route = routeFor({ left: 5 });
  const poor = await FX.citExecutors.mentions({ client: { ...RGA }, clientId: "c-rga", tasks: {} });
  if (net.log.some((u) => /serpapi\.com\/search/.test(u)) || poor.outcome !== "indeterminate") fail("runner 55: it searches into the reserve");
  const nomkt = await FX.citExecutors.mentions({ client: { business_name: "X" }, clientId: "c3", tasks: {} });
  if (nomkt.outcome !== "indeterminate" || (nomkt.outcome_data.places || []).length) fail("runner 55: with no market it invents places");
  net.route = routeFor();
  const y = await FX.citExecutors.yelp({ client: { ...RGA }, clientId: "c-rga", tasks: { "m1.cit.priority_top10": { listings: { yelp: { state: "live", url: "https://www.yelp.com/biz/rga" } } } } });
  if (!y.outcome_data.pack || y.outcome_data.suggest_url !== "https://www.yelp.com/biz/rga" || y.completed !== false) fail("runner 54: the pack or step 52's Yelp page isn't offered");
}

// ── 10 · the ask: written by the model from their facts, US English, no em dashes; never the place ──
{
  const pr = B.askPrompt(null, pack, { name: "Culver City Chamber", url: "https://x.test", label: "Chamber of commerce" });
  if (!/Use only the facts given/.test(pr.system) || !/No em dashes/.test(pr.system) || !/\(424\) 242-2040/.test(pr.user)) fail("ask: the prompt doesn't hold the model to their facts");
  const a = B.parseAsk("SUBJECT: Listing Rocket Growth Agency\nBODY:\nHello there — we are a local marketing agency in Culver City and would love to be listed in your member directory. Thank you, Rocket Growth Agency");
  if (!a || /—/.test(a.body)) fail("ask: an em dash survives");
  if (B.parseAsk("SUBJECT: Hi\nBODY:\nDear [NAME], we would love to be listed in your directory of local businesses, thanks so much.")) fail("ask: a placeholder is accepted");
  if (B.parseAsk("just some text")) fail("ask: an answer in the wrong shape is accepted");
}

// ── 11 · Yelp (54) ──
{
  const Y = "https://www.yelp.com/biz/rocket-growth-agency-culver-city";
  let L = lookDeps({ pages: { [Y]: PAGE_OK } });
  let c = await B.checkYelpPage({ url: Y, pack, deps: L.deps });
  if (c.ok !== true || c.via !== "page" || L.asked.length) fail("yelp: a page that reads and names the business isn't proven by the page");
  L = lookDeps({ pages: { [Y]: { status: 403 } }, results: [{ link: `${Y}?osq=x`, title: "Rocket Growth Agency - Culver City - Yelp" }] });
  c = await B.checkYelpPage({ url: Y, pack, deps: L.deps });
  if (c.ok !== true || c.via !== "search" || L.asked.length !== 1 || !/couldn't be checked/.test(c.why)) fail(`yelp: a blocked page isn't proven by one search, said so: ${JSON.stringify(c)}`);
  L = lookDeps({ pages: { [Y]: { status: 403 } }, results: [{ link: "https://www.yelp.com/biz/someone-else", title: "Rocket Growth Agency" }] });
  if ((await B.checkYelpPage({ url: Y, pack, deps: L.deps })).ok !== false) fail("yelp: a search showing a different page proves it");
  L = lookDeps({ pages: { [Y]: { status: 403 } }, budget: 0 });
  if ((await B.checkYelpPage({ url: Y, pack, deps: L.deps })).ok !== null) fail("yelp: with no search to spare it isn't 'couldn't check'");
  const wrong = B.yelpChecked({ ok: true, via: "page", match: { name: true, phone: false, website: null } }, NOW, 1);
  if (wrong.ok !== false) fail("yelp: a different phone is checked");
  const t = (y) => ({ yelp: y });
  const cl = { url: Y, at: iso(NOW), check: { ok: true, via: "page" } };
  if (P.yelpProgress(t({ claimed: cl })).done || P.yelpProgress(t({ claimed: cl, completed: { at: iso(NOW) } })).done) fail("yelp: done before it's completed and checked");
  if (!P.yelpProgress(t({ claimed: cl, completed: { at: iso(NOW) }, checked: { ok: true, via: "page", match: { name: true, phone: true, website: true } } })).done) fail("yelp: claimed, completed and checked isn't done");
  if (P.yelpProgress(t({ claimed: { ...cl, check: { ok: null } }, completed: { at: iso(NOW) }, checked: { ok: true } })).done) fail("yelp: an unproven claim is done");
}

// ── 12 · the admin function: RGA's login, read again before writing, read back, recorded ──
function fakeStore(task) {
  const rec = { id: "rec1", data: { tasks: { [B.STEP.TOP]: task } } };
  const calls = { reads: 0, writes: 0, records: [], between: null, breakReadBack: false };
  const supa = async (p, init = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (p.startsWith("/client_onboarding_records") && m === "GET") { calls.reads++; if (calls.reads === 2 && calls.between) calls.between(rec); return [JSON.parse(JSON.stringify(rec))]; }
    if (p.startsWith("/client_onboarding_records") && m === "PATCH") { calls.writes++; rec.data = JSON.parse(init.body).data; const back = JSON.parse(JSON.stringify(rec)); if (calls.breakReadBack) back.data.tasks[B.STEP.TOP].status = "pending"; return [back]; }
    return [{ id: "x" }];
  };
  return { rec, calls, deps: { supa, fetch: async () => res(404, ""), env: {}, now: () => NOW, search: async () => ({ ran: true, results: [] }), searchesLeft: async () => 100,
    record: async (o) => { calls.records.push(o); return { activity: true }; }, draft: async () => "", gate: { email: "chris@x" } } };
}
const call = async (body) => JSON.parse((await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", step_id: B.STEP.TOP, ...body }) })).body);
{
  const list = B.buildList(B.STEP.TOP, RGA, []), t0 = { status: "in_progress", outcome_data: { pack, list } };
  let S = fakeStore(t0); ADM.__useDeps(S.deps);
  let j = await call({ action: "submitted", key: "apple" });
  if (!j.ok || S.rec.data.tasks[B.STEP.TOP].listings.apple.state !== "submitted" || S.calls.reads !== 2 || !S.calls.records.length || S.calls.records[0].by !== "chris@x") fail(`admin: a press isn't read twice, written, read back and recorded: ${JSON.stringify(j)}`);
  // a press made by someone else between our read and our write survives
  S = fakeStore(t0); S.calls.between = (rec) => { rec.data.tasks[B.STEP.TOP] = { ...rec.data.tasks[B.STEP.TOP], listings: { bbb: { state: "not_for", reason: "someone else said so", by: "a@x" } } }; };
  ADM.__useDeps(S.deps); j = await call({ action: "submitted", key: "apple" });
  const L2 = S.rec.data.tasks[B.STEP.TOP].listings;
  if (!L2.bbb || L2.bbb.state !== "not_for" || !L2.apple) fail("admin: a press made between the read and the write is lost");
  S = fakeStore(t0); S.calls.breakReadBack = true; ADM.__useDeps(S.deps);
  j = await call({ action: "submitted", key: "apple" });
  if (j.ok || !/didn't save/.test(j.error || "")) fail("admin: a write that doesn't read back is reported saved");
  S = fakeStore(t0); ADM.__useDeps({ ...S.deps, gate: { error: { statusCode: 401, body: JSON.stringify({ error: "no" }) } } });
  const r401 = await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", step_id: B.STEP.TOP, action: "not_for", key: "apple", reason: "x y z" }) });
  if (r401.statusCode !== 401 || S.calls.writes) fail("admin: someone without RGA's login can mark a directory");
  S = fakeStore(t0); ADM.__useDeps(S.deps);
  j = await call({ action: "skip", reason: "we're not doing it" });
  if (!j.ok || S.rec.data.tasks[B.STEP.TOP].status !== "skipped") fail("admin: Skip this step… doesn't skip");
  j = await call({ action: "submitted", key: "apple" });
  if (j.ok) fail("admin: a skipped step takes presses");
  j = await call({ action: "unskip" });
  if (!j.ok || S.rec.data.tasks[B.STEP.TOP].status !== "in_progress") fail("admin: Undo on a skip doesn't bring it back as it was");
  // a pasted link is checked at once, and only a positive read makes it live
  S = fakeStore(t0); ADM.__useDeps({ ...S.deps, fetch: async (u) => (String(u).includes("bing.com") ? res(200, PAGE_OK) : res(404, "")) });
  j = await call({ action: "link", key: "bing", url: "https://www.bing.com/maps?ss=ypid.1" });
  if (!j.ok || S.rec.data.tasks[B.STEP.TOP].listings.bing.state !== "live" || !j.look || !j.look.found) fail(`admin: a pasted link that names the business isn't live: ${JSON.stringify(j)}`);
  // the step finishes itself when every one is settled
  const all = Object.fromEntries(list.items.map((i) => [i.key, { state: "not_for", reason: "test reason", by: "x" }]));
  delete all.apple;
  S = fakeStore({ ...t0, listings: all }); ADM.__useDeps({ ...S.deps, fetch: async () => res(200, PAGE_OK) });
  j = await call({ action: "link", key: "apple", url: "https://maps.apple.com/place?place-id=I1" });
  if (!j.ok || j.moved !== "done" || S.rec.data.tasks[B.STEP.TOP].status !== "done") fail(`admin: the last directory settling doesn't finish the step: ${JSON.stringify(j).slice(0, 200)}`);
  // 55 through the function: the model writes the ask for a place the search found; Asked; the place can't be invented by a press
  const places = [{ host: "culvercitychamber.com", name: "Culver City Chamber", url: "https://www.culvercitychamber.com/", kind: "chamber", label: "Chamber of commerce" }];
  const st55 = (task) => { const S5 = fakeStore(null); S5.rec.data.tasks = { [B.STEP.MENTIONS]: task }; return S5; };
  const call55 = async (body) => JSON.parse((await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", step_id: B.STEP.MENTIONS, ...body }) })).body);
  let S5 = st55({ status: "in_progress", outcome_data: { pack, places, searched_at: iso(NOW) } }); let asked = 0;
  ADM.__useDeps({ ...S5.deps, draft: async (sys, user) => { asked++; if (!/Culver City Chamber/.test(user)) throw new Error("no place"); return "SUBJECT: Listing Rocket Growth Agency in the Chamber directory\nBODY:\nHello, Rocket Growth Agency is a local marketing agency serving Los Angeles County. Could we be listed in your member directory? Thank you, Rocket Growth Agency"; } });
  j = await call55({ action: "ask", key: "culvercitychamber.com" });
  const e55 = S5.rec.data.tasks[B.STEP.MENTIONS].places["culvercitychamber.com"];
  if (!j.ok || asked !== 1 || !e55 || !e55.ask || !/member directory/.test(e55.ask.body) || e55.state !== "candidate") fail(`admin 55: the ask isn't drafted and kept: ${JSON.stringify(j).slice(0, 200)}`);
  j = await call55({ action: "asked", key: "culvercitychamber.com" });
  if (!j.ok || S5.rec.data.tasks[B.STEP.MENTIONS].places["culvercitychamber.com"].state !== "asked") fail("admin 55: Asked isn't recorded");
  j = await call55({ action: "ask", key: "madeup.example" });
  if (j.ok) fail("admin 55: a place that isn't on the list can be asked");
  j = await call55({ action: "asked", key: "madeup.example" });
  if (j.ok || S5.rec.data.tasks[B.STEP.MENTIONS].places["madeup.example"]) fail("admin 55: a place that isn't on the list can be marked Asked");
  if (P.mentionsProgress(S5.rec.data.tasks[B.STEP.MENTIONS]).done) fail("55: done while an ask is still out");
  if (P.mentionsProgress({ outcome_data: { places, searched_at: iso(NOW) } }).done) fail("55: done with nothing asked");
  if (!P.mentionsProgress({ outcome_data: { places, searched_at: iso(NOW) }, places: { "culvercitychamber.com": { state: "live", asked_at: iso(NOW), live: { url: "https://www.culvercitychamber.com/members/rga" } } } }).done) fail("55: every ask live isn't done");
  // 54 through the function: a link that isn't a Yelp page is refused before anything is read
  const S4 = fakeStore(null); S4.rec.data.tasks = { [B.STEP.YELP]: { status: "in_progress", outcome_data: { pack } } };
  ADM.__useDeps(S4.deps);
  const j4 = JSON.parse((await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", step_id: B.STEP.YELP, action: "yelp_claimed", url: "https://business.yelp.com/" }) })).body);
  if (j4.ok || S4.calls.writes) fail("admin 54: Yelp's own page is accepted as theirs");
  ADM.__useDeps(null);
}

// ── 13 · the scheduled look ──
async function sweep({ left = 100, n = 6, test = false, between = null, off = false } = {}) {
  const listings = {}; const dirs = DIR.CITATION_DIRECTORIES.filter(DIR.searchProves).slice(0, n);
  for (const d of dirs) listings[d.key] = submitted({ at: `stamp-${d.key}` });
  const task = { status: "in_progress", outcome_data: { pack, list: { items: dirs.map((d) => ({ key: d.key, source: d.source, searchable: true, hidden: null })) } }, listings };
  const rec = { id: "rec1", data: { tasks: { [B.STEP.TOP]: task } } };
  const searches = []; let reads = 0;
  const supa = async (p, init = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (p.startsWith("/clients")) return [{ id: "c1", business_name: "Rocket Growth Agency", source: test ? "test:x" : null }];
    if (p.startsWith("/client_onboarding_records") && m === "GET") {
      if (/select=id,t0:/.test(p)) { const o = { id: "rec1" }; B.ALL_STEPS.forEach((s, i) => { if (rec.data.tasks[s]) o[`t${i}`] = rec.data.tasks[s]; }); return [o]; }
      reads++; if (between) between(rec); return [JSON.parse(JSON.stringify(rec))];
    }
    if (p.startsWith("/client_onboarding_records") && m === "PATCH") { rec.data = JSON.parse(init.body).data; return [JSON.parse(JSON.stringify(rec))]; }
    return [];
  };
  const Y = "https://www.yelp.com/biz/rocket-growth-agency-culver-city";
  const deps = { supa, env: off ? { CITATION_LIVE_SEARCH: "0" } : {}, now: () => NOW, searchesLeft: async () => left, record: async () => ({}),
    search: async (q) => { searches.push(q); return { ran: true, results: /yelp/.test(q) ? [{ link: Y, title: "Rocket Growth Agency - Yelp" }] : [] }; },
    fetch: async (u) => (String(u) === Y ? res(200, PAGE_OK) : res(404, "")) };
  const out = await B.sweepLive({ deps });
  return { out, searches, rec, reads };
}
{
  let s = await sweep();
  if (s.searches.length > B.RUN_SEARCH_CAP) fail(`look: one run spent ${s.searches.length} searches (cap ${B.RUN_SEARCH_CAP})`);
  if (s.searches.length !== Math.min(B.RUN_SEARCH_CAP, 6)) fail(`look: the cap isn't used (${s.searches.length})`);
  const lst = s.rec.data.tasks[B.STEP.TOP].listings;
  if (Object.values(lst).some((e) => e.state === "not_for")) fail("look: the checks marked a directory not for this business");
  if (lst.yelp && lst.yelp.state !== "live") fail("look: a listing the search found isn't live");
  if (Object.values(lst).filter((e) => e.state === "live").some((e) => !e.url)) fail("look: live without a URL");
  s = await sweep({ left: B.SEARCH_RESERVE });
  if (s.searches.length) fail("look: it searches into the reserve");
  s = await sweep({ left: null });
  if (s.searches.length) fail("look: an unreadable count of searches left spends searches");
  s = await sweep({ test: true });
  if (s.searches.length || s.out.clients) fail("look: a test client is looked at");
  s = await sweep({ off: true });
  if (s.searches.length || !s.out.search_off) fail("look: CITATION_LIVE_SEARCH=0 still searches");
  s = await sweep({ between: (rec) => { rec.data.tasks[B.STEP.TOP].listings.yelp = { state: "not_for", reason: "pressed meanwhile", by: "chris@x", at: "x" }; } });
  if (s.rec.data.tasks[B.STEP.TOP].listings.yelp.state !== "not_for") fail("look: a person's press made while it searched is overwritten");
  if (!s.reads) fail("look: the record isn't read again before writing");
}

// ── 14 · wiring: job, manifest, playbook, the card ──
{
  const toml = read("netlify.toml"), man = read("netlify/functions/_job-manifest.js"), job = read("netlify/functions/citation-live-check.js");
  if (!/\[functions\."citation-live-check"\]\s*\n\s*schedule = "40 13 \* \* \*"/.test(toml)) fail("wiring: the look isn't scheduled in netlify.toml");
  if (!/job: "citation-live-check"[^\n]*cron: "40 13 \* \* \*"/.test(man) || !/checkin_pending/.test(man.slice(man.indexOf('job: "citation-live-check"'), man.indexOf('job: "citation-live-check"') + 400))) fail("wiring: the look isn't in the job manifest with its first-run note");
  if (!/exports\.handler = require\("\.\/_job-checkin"\)\.withCheckin\("citation-live-check"/.test(job) || !/requireCronOrInternal/.test(job)) fail("wiring: the look doesn't check in, or anyone can run it");
  const pb = JSON.parse(read("data/playbooks/playbooks.json")).month1, ids = pb.map((s) => s.id);
  for (const id of B.ALL_STEPS) {
    const s = pb.find((x) => x.id === id);
    if (!s || s.hasRunner !== true || !s.actionLabel || s.type !== "hybrid") fail(`wiring: ${id} isn't a hybrid step with a runner and a label`);
    if (!FX.citExecutors || typeof FX.citExecutors[{ [B.STEP.TOP]: "top", [B.STEP.TRADE]: "trade", [B.STEP.YELP]: "yelp", [B.STEP.MENTIONS]: "mentions" }[id]] !== "function") fail(`wiring: ${id} has no runner`);
    if (/Draft this for me/.test(s.actionLabel || "")) fail(`wiring: ${id}'s button says it drafts`);
  }
  if (!(ids.indexOf(B.STEP.TOP) < ids.indexOf(B.STEP.TRADE) && ids.indexOf(B.STEP.TRADE) < ids.indexOf(B.STEP.YELP) && ids.indexOf(B.STEP.YELP) < ids.indexOf(B.STEP.MENTIONS))) fail("wiring: the four steps moved in the order");
  const adm = read("admin/admin.js");
  if (!/: globalThis\.rgaCitationProgress\?\.isStep\(id\) \? cbCardHtml\(id, t\)/.test(adm)) fail("card: the active and queued rows don't draw the card");
  if (!/\+ \(globalThis\.rgaCitationProgress\?\.isStep\(o\.flowId\) \? `<div class="ob-done-card">\$\{cbCardHtml\(o\.flowId, s\.task\)\}<\/div>` : ""\)/.test(adm)) fail("card: a done or skipped row loses its card");
  if (!/o\.flowId === GL_STEP \|\| globalThis\.rgaCitationProgress\?\.isStep\(o\.flowId\) (\|\| uniS\(\)\?\.noHandDone\?\.\(o\.flowId\) )?\? "" :/.test(adm))   // steps_57_64_v1: one more clause for 57/58/61/62/64 fail("card: a hand 'Mark step complete' sits beside the rule that finishes the step");
  for (const fn of ["cbListCardHtml", "cbYelpCardHtml", "cbMentionsCardHtml"]) { const i = adm.indexOf(`function ${fn}(`); if (i < 0 || !/cbSkipLink\(step\)/.test(adm.slice(i, adm.indexOf("\n}\n", i)))) fail(`card: ${fn} doesn't offer Skip this step…`); }
  const h = adm.indexOf('e.target.closest("[data-cb-act]")');
  if (h < 0 || !/mgBusy\(b, true\)/.test(adm.slice(h, h + 4000))) fail("card: a press doesn't show it's working");
  if (!/import "\/shared\/citation-progress\.js\?v=/.test(adm)) fail("card: admin doesn't load the shared rule");
  if (!/rgaCitationProgress/.test(read("shared/citation-progress.js"))) fail("card: the shared rule isn't exposed to the browser");
  // the words: US English, no em dash in anything a person reads (code only; the stored note keeps the audit's own format)
  for (const f of ["shared/citation-progress.js", "netlify/functions/_citation-build.js", "netlify/functions/admin-citation-build.js"]) {
    const code = read(f).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, "")).join("\n").replace(/listing found at \$\{url\}/, "").replace(/\} — listing found at/, "");
    if (/—/.test(code)) fail(`words: an em dash in ${f}`);
    if (/\b(colour|centre|optimis|organis|recognis|favour)/i.test(code)) fail(`words: British spelling in ${f}`);
  }
}

if (F.length) { console.error(`❌ citations 52–55: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ citations 52–55 hold: the list is data and fits the trade (no Angie for RGA, a plumber's marketplaces, a trade with no list says so, 53 never asks a model), the pack is read from Google or says so, hidden-address facts only from the directory's own page and a wait never holds the step up, live only on a positive read (search or link) with no different phone, not-for only by a person, undo exact, done finishes itself, a skip counts as finished and is in the Month 1 report with its reason, 55's places come from search, 54's Yelp is proven by the page or one search, the look is capped, keeps a reserve, skips test clients, re-reads before writing and checks in");
