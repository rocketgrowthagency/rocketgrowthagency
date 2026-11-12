#!/usr/bin/env node
// check-review-requests-never-ask-on-yelp.mjs — A SECOND REVIEW SITE, NEVER YELP, ONLY WHERE ITS OWN RULES ALLOW ASKING (tier3_best_in_class_v1 item 5, 11-11).
// EXTENDS check-no-review-gating (run first, below): the one review request can now carry a second link, and that link is a new way to break the rules.
//
// 🔴 WHY: Yelp's own guidelines say "Businesses should never ask customers to write reviews." A Yelp link in a client's request risks their Yelp
// page; a site whose rules nobody read is a guess; a link for some customers and not others is steering. This RUNS the real code
// (_review-sites.js, review-second-site.js, portal-review-requests.js) on fixtures and reads data/review-sites.json:
//   · the allow-list: every site offered has an https rules page read within 12 months; Yelp is in it as never; no site offered sits on a Yelp host
//   · any trade: a roofer is offered Angi and BBB where the citation audit found them, a dentist BBB only, an unknown trade nothing; Yelp is never offered
//   · at send time a stored Yelp choice, a Yelp URL under another site's name, a failed or stale page check, or stale rules = Google only
//   · the client's choose refuses Yelp and an unconfirmed site and writes nothing; choosing a confirmed site checks its page with one free read
//   · every customer's request carries the same links; no request text gates by rating (check-no-review-gating's pattern over the new files)
// Exit 0 holds · 1 broken · 2 indeterminate.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };

// 0 · the gate this one extends must hold first
{ const r = spawnSync(process.execPath, [`${HERE}/check-no-review-gating.mjs`], { env: process.env, encoding: "utf8" });
  if (r.status === 2) ind(`check-no-review-gating is indeterminate: ${(r.stderr || "").trim().slice(0, 200)}`);
  if (r.status !== 0) fail(`check-no-review-gating fails: ${(r.stderr || "").trim().split("\n").slice(0, 3).join(" / ")}`); }

let RS, SEC, RR, DATA;
try { RS = req("./_review-sites.js"); SEC = req("./review-second-site.js"); RR = req("./portal-review-requests.js"); DATA = JSON.parse(fs.readFileSync(`${SITE}/data/review-sites.json`, "utf8")); }
catch (e) { ind(`harness: ${e.message}`); }
for (const k of ["candidatesFor", "secondSiteFor", "linkText", "putLinks", "rulesFresh", "isYelp", "checkPage"]) if (typeof RS[k] !== "function") ind(`_review-sites.js has no ${k}`);
const NOW = Date.parse("2026-11-12T12:00:00Z"), DAY = 86400000;

// 1 · the allow-list, as shipped
const sites = Array.isArray(DATA.sites) ? DATA.sites : ind("data/review-sites.json has no sites");
const yelp = sites.find((s) => s.key === "yelp");
if (!yelp || yelp.allows_asking !== false || yelp.never !== true) fail("the allow-list doesn't hold Yelp as never asked");
const realNow = Date.now(), maxAge = Number(DATA.max_age_days || 365) * DAY;
for (const s of sites.filter((x) => x.allows_asking === true)) {
  if (!/^https:\/\//.test(String(s.rules_url || ""))) fail(`${s.name} is offered with no rules page`);
  const at = Date.parse(String(s.rules_read_at || ""));
  if (!Number.isFinite(at)) fail(`${s.name} is offered with no day its rules were read`);
  else if (realNow - at > maxAge) fail(`${s.name}'s rules were read ${Math.round((realNow - at) / DAY)} days ago: read them again (the page and the day) before it is offered`);
  if ((s.hosts || []).some((h) => /yelp\./i.test(h)) || s.key === "yelp") fail(`${s.name} is offered on a Yelp host`);
  if (!String(s.rules_say || "").trim()) fail(`${s.name} is offered with nothing recorded from its rules page`);
}
for (const s of DATA.not_confirmed || []) if (sites.some((x) => x.key === s.key)) fail(`${s.name} is both offered and "not confirmed"`);

// 2 · candidates, any trade
const cit = (host, path = "/biz/beta-roofing") => ({ source: host, url: `https://www.${host}${path}`, notes: "[v2-listing-shape] 2026-10-14", updated_at: "2026-10-14T10:00:00Z" });
const CITS = [cit("yelp.com"), cit("angi.com", "/companylist/us/ca/culver-city/beta-roofing.htm"), cit("bbb.org", "/us/ca/culver-city/profile/roofing/beta"), cit("houzz.com", "/pro/beta")];
const roofer = { business_type: "Roofing contractor", primary_market: "Culver City, CA" };
const c1 = RS.candidatesFor({ client: roofer, citations: CITS, now: NOW, method: "v2-listing-shape" });
const st = (c, k) => (c.rows.find((r) => r.key === k) || {}).state;
if (st(c1, "angi") !== "offered" || st(c1, "bbb") !== "offered") fail(`a roofer listed on Angi and BBB isn't offered them (angi ${st(c1, "angi")}, bbb ${st(c1, "bbb")})`);
if (st(c1, "yelp") !== "never") fail(`Yelp is not "never" for a roofer listed there (${st(c1, "yelp")})`);
if (st(c1, "houzz") === "offered") fail("Houzz is offered though its rules aren't confirmed");
if (c1.rows.some((r) => r.state === "offered" && RS.isYelp(r.url))) fail("an offered site points at Yelp");
const dentist = RS.candidatesFor({ client: { business_type: "Dentist", primary_market: "Toronto, ON" }, citations: CITS, now: NOW, method: "v2-listing-shape" });
if (st(dentist, "angi")) fail("a dentist is offered Angi (a home-trade site)");
if (st(dentist, "bbb") !== "offered") fail("a dentist listed on BBB isn't offered it");
const unknown = RS.candidatesFor({ client: {}, citations: CITS, now: NOW, method: "v2-listing-shape" });
if (unknown.rows.some((r) => r.state === "offered")) fail("a client with no trade on the record is offered a site (none read = Google only)");
const unlisted = RS.candidatesFor({ client: roofer, citations: [cit("yelp.com")], now: NOW, method: "v2-listing-shape" });
if (unlisted.rows.some((r) => r.state === "offered")) fail("a site is offered where the citation audit found no page");
const old = { ...DATA, sites: DATA.sites.map((s) => (s.key === "angi" ? { ...s, rules_read_at: "2024-01-01" } : s)) };
if (st(RS.candidatesFor({ client: roofer, citations: CITS, now: NOW, method: "v2-listing-shape", data: old }), "angi") === "offered") fail("a site whose rules were read over a year ago is offered");

// 3 · at send time
const OK = { at: new Date(NOW - DAY).toISOString(), ok: true, status: 200 };
const angiUrl = "https://www.angi.com/companylist/us/ca/culver-city/beta-roofing.htm";
const ss = (o) => ({ second_site: { key: "angi", name: "Angi", url: angiUrl, check: OK, ...o } });
if (!RS.secondSiteFor(ss({}), NOW)) fail("a chosen, checked Angi page isn't carried");
if (RS.secondSiteFor(ss({ key: "yelp", url: "https://www.yelp.com/biz/beta" }), NOW)) fail("a stored Yelp choice is carried");
if (RS.secondSiteFor(ss({ url: "https://www.yelp.com/biz/beta" }), NOW)) fail("a Yelp URL stored under Angi's name is carried");
if (RS.secondSiteFor(ss({ url: "https://m.yelp.co.uk/biz/beta" }), NOW)) fail("a Yelp URL on another Yelp domain is carried");
if (RS.secondSiteFor(ss({ check: { ...OK, ok: false } }), NOW)) fail("a page that didn't open at its last check is carried");
if (RS.secondSiteFor(ss({ check: { ...OK, at: new Date(NOW - 30 * DAY).toISOString() } }), NOW)) fail("a page last checked a month ago is carried");
if (RS.secondSiteFor(ss({ check: null }), NOW)) fail("a page never checked is carried");
if (RS.secondSiteFor(ss({ key: "houzz", url: "https://www.houzz.com/pro/beta" }), NOW)) fail("an unconfirmed site is carried");
if (RS.secondSiteFor(ss({}), NOW, old)) fail("a site whose rules went stale is still carried");
if (/yelp/i.test(RS.linkText("https://g.test/r", { name: "Yelp", url: "https://www.yelp.com/biz/x" }))) fail("the link text carries a Yelp link");

// 4 · one message, the same links, for every customer
{ const links = RS.linkText("https://search.google.com/local/writereview?placeid=X", { name: "Angi", url: angiUrl });
  const tpl = "Hi {{first_name}}, thanks for choosing Beta Roofing. Would you leave us a review? It helps neighbors find us. {{review_link}} Thank you, Sam";
  const msgs = ["Dana", "Luis", "Mei"].map((name) => RR.fillRgaMessage(tpl, { name, service: "", business: "Beta Roofing", reviewUrl: links }));
  const tails = msgs.map((m) => (m || "").replace(/^Hi \S+,/, ""));
  if (msgs.some((m) => !m || !m.includes(angiUrl) || !m.includes("placeid=X"))) fail("a request doesn't carry both links");
  if (new Set(tails).size !== 1) fail("customers get different messages or links");
  const plain = RR.messageFor({ name: "Dana", service: "", business: "Beta Roofing", reviewUrl: links });
  if (!plain.includes(angiUrl) || /yelp/i.test(plain)) fail("the plain message drops the second link or carries Yelp");
  const rr = fs.readFileSync(`${SITE}/netlify/functions/portal-review-requests.js`, "utf8");
  if (!/const second = await secondSiteNow\(clientId\);\s*\n\s*const links = reviewUrl \? require\("\.\/_review-sites"\)\.linkText\(reviewUrl, second\) : null;/.test(rr)) fail("the links aren't worked out ONCE for every customer before the requests are written");
  if (!/return require\("\.\/_review-sites"\)\.secondSiteFor\(/.test(rr)) fail("the send path doesn't re-check the stored choice (secondSiteFor) at send time");
  if (/second_site\.url|second_site &&/.test(rr.replace(/second_site: second \?/g, ""))) fail("the send path reads the stored second site's link directly");
}

// 5 · the client's choose, on a fake database
function fakeDb() {
  const db = { writes: 0, gets: [], ob: { id: "ob1", data: { tasks: { "m1.review.system": { status: "done", outcome_data: { messages: { sms_1: "Hi {{first_name}}, would you leave us a review? {{review_link}}" } } } } } } };
  db.deps = { now: () => NOW, gate: { email: "owner@test" },
    get: async (u) => { db.gets.push(u); if (/serpapi|googleapis|yelp/i.test(u)) throw new Error("not allowed"); return { status: 200, text: "<p>6 reviews</p>" }; },
    supa: async (p, init) => {
      if (p.startsWith("/clients")) return [{ business_name: "Beta Roofing", business_type: "Roofing contractor", google_place_id: "PID" }];
      if (p.startsWith("/client_citations")) return CITS;
      if (p.startsWith("/client_activity")) return [{ id: "a1" }];
      if (p.startsWith("/client_onboarding_records") && init && init.method === "PATCH") { db.writes++; db.ob.data = JSON.parse(init.body).data; return [{ data: db.ob.data }]; }
      if (p.startsWith("/client_onboarding_records")) return [{ id: db.ob.id, data: db.ob.data }];
      return [];
    } };
  return db;
}
const CID = "00000000-0000-4000-8000-000000000002";
const call = async (body) => { const r = await SEC.handler({ httpMethod: "POST", body: JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
{ const db = fakeDb(); SEC.__useDeps(db.deps);
  const y = await call({ client_id: CID, choose: "yelp" });
  if (y.status < 400 || db.writes) fail(`choosing Yelp is not refused (HTTP ${y.status}, ${db.writes} write(s))`);
  const h = await call({ client_id: CID, choose: "houzz" });
  if (h.status !== 409 || db.writes) fail(`choosing an unconfirmed site is not refused with its reason (HTTP ${h.status}, expected 409)`);
  if (y.status !== 422) fail(`choosing Yelp is not refused with its reason (HTTP ${y.status}, expected 422)`);
  const read = await call({ client_id: CID });
  if (read.status !== 200 || !read.body.view) fail(`the second-site read fails (HTTP ${read.status})`);
  else {
    if (read.body.view.offered.some((o) => o.key === "yelp" || RS.isYelp(o.url))) fail("the client is offered Yelp");
    if (Object.values(read.body.previews || {}).some((p) => /yelp/i.test(p))) fail("a message preview carries Yelp");
    if (!read.body.previews.angi || !read.body.previews.angi.includes("Or on Angi:")) fail("the Angi preview doesn't show both links");
  }
  const a = await call({ client_id: CID, choose: "angi" });
  const saved = db.ob.data.tasks["m1.review.system"].second_site;
  if (a.status !== 200 || !saved || saved.key !== "angi" || !saved.rules_url || !saved.rules_read_at) fail(`choosing Angi doesn't store it with its rules page (HTTP ${a.status})`);
  if (db.gets.length !== 1 || !/angi\.com/.test(db.gets[0] || "")) fail(`choosing Angi didn't make exactly one free read of its page (${db.gets.join(", ")})`);
  if (!saved || !saved.check || saved.check.ok !== true || saved.check.count !== 6) fail("the page check isn't stored with what it read");
  if (a.status === 200 && a.body.view.state !== "done") fail(`after choosing Angi the card isn't "done" (${a.body.view.state})`);
  SEC.__useDeps(null); }

// 6 · the new files say nothing that gates by rating (check-no-review-gating's own pattern)
{ const src = fs.readFileSync(`${HERE}/check-no-review-gating.mjs`, "utf8"), m = /const GATING = (\/.*\/gi);/.exec(src);
  if (!m) ind("check-no-review-gating's pattern moved");
  const GATING = eval(m[1]);
  const files = ["netlify/functions/_review-sites.js", "netlify/functions/review-second-site.js", "data/review-sites.json"];
  for (const f of files) fs.readFileSync(`${SITE}/${f}`, "utf8").split("\n").forEach((line, i) => { if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; GATING.lastIndex = 0; for (const x of line.matchAll(GATING)) fail(`${f}:${i + 1} "${x[0]}" asks by rating or happiness`); });
  const portal = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"), at = portal.indexOf("const RS2_FN"), end = portal.indexOf("function cmpHostHtml");
  if (at < 0 || end < at) ind("the portal's second-site block moved");
  const blk = portal.slice(at, end);
  blk.split("\n").forEach((line) => { if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; GATING.lastIndex = 0; for (const x of line.matchAll(GATING)) fail(`portal second-site card: "${x[0]}" asks by rating or happiness`); });
  if (!/Yelp isn't offered: Yelp's rules don't allow asking for reviews/.test(blk)) fail("the client's card doesn't say why Yelp isn't offered");
  if (!/const opts = offered\.map\(/.test(blk)) fail("the client's options don't come only from the offered sites"); }

if (F.length) { console.error("🔴 a review request can ask on Yelp, or on a site whose rules weren't read:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ review requests never ask on Yelp: ${sites.filter((s) => s.allows_asking === true).map((s) => s.name).join(", ")} offered only with their rules page read; Yelp refused by key and host; a failed page check = Google only; one message, the same links, for every customer; check-no-review-gating holds`);
