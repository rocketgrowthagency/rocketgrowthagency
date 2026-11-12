#!/usr/bin/env node
// check-reviews-feed.mjs — the client's Google reviews, live on Ongoing work, and the ONE question we may ask about them.
//
// 🔒 WHY (approved reviews_ongoing_live_v1, Chris 10-23: "can we make this update when a new review is added automatically…
// on the ongoing tab"). Each morning refresh-review-metrics keeps the newest 50 reviews from the owner's Google profile; the
// portal shows them, and when a review's first name fits exactly ONE customer the client asked, it asks "Is this Maria?".
// 🔴 THE TWO RULES IT LIVES ON: we never decide who wrote a review (Google gives a name, never a phone) — only the client's Yes
// marks a customer reviewed; and no reading is never "0 new reviews". Plus the 10-23 audit: admin claimed "Sent N · Reviews
// earned N" and had a "Mark Sent" button (we never send a request, and never know who reviewed) — gone, and kept gone.
//
// Reads files and runs the shipped functions against a fake Supabase / fake Google (no network, no production data); draws
// the shipped reviewsFeedHtml with the shipped portal.css in real Chrome at desktop and phone width. SHOTS=<dir> saves states.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SUPABASE_ANON_KEY: "a", QUO_WEBHOOK_TOKEN: "t", INTERNAL_FN_SECRET: "t", GOOGLE_PLACES_API_KEY: "p" });
let route = null;
globalThis.fetch = async (url, init = {}) => route(String(url), init);
const req = createRequire(`${SITE}/netlify/functions/`);
let RF, EP, RM;
try { RF = req("./_reviews-feed.js"); EP = req("./portal-review-requests.js"); RM = req("./refresh-review-metrics.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a reviews module did not load: ${e.message}`); process.exit(2); }
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const DAY = 864e5, t0 = Date.parse("2026-10-20T15:00:00Z"), iso = (d) => new Date(t0 + d * DAY).toISOString();

// ── 1 · names: universal (accents, titles, initials, apostrophes, any alphabet, "A Google User") ──
const NAMES = [["Maria G.", "maria"], ["María José", "maria"], ["Dr. Smith", "smith"], ["J.", ""], ["A Google User", ""], ["", ""],
  ["D’Andre W.", "dandre"], ["O'Brien", "obrien"], ["李 雷", "李"], ["Ólafur", "olafur"], ["🙂 Ana", "ana"], ["Jean-Luc P.", "jean"], ["  mr  ", "mr"]];
for (const [n, want] of NAMES) { const got = RF.firstToken(n); if (got !== want) fail(`a reviewer named "${n}" reads as "${got}", not "${want}"`); }

// ── 2 · the question: only when exactly one asked customer fits, asked before, within 60 days, not settled ──
const cust = (n, d, x = {}) => ({ first_name: n, marked_sent_by_client: true, marked_sent_at: iso(d), ...x });
const lists = [{ id: "L1", customers: [cust("María", 0), cust("James", 0), cust("James", 1), cust("Ana", 0, { stopped: true }), cust("Lee", 0, { reviewed_mark: true }),
  cust("Kim", 0, { not_review_ids: ["r7"] }), { first_name: "Tom" }, cust("李", 0), cust("Bo", 0), cust("Zoe", 0, { reviewed_review_id: "rz" })] }];
const rv = (id, name, d, x = {}) => ({ id, name, at: iso(d), stars: 5, ...x });
const CASES = [
  ["Maria G. after María was asked → asked about María", rv("r1", "Maria G.", 4), "María"],
  ["two customers named James → no question", rv("r2", "James P.", 3), null],
  ["the customer asked us to stop → no question", rv("r3", "Ana", 2), null],
  ["the client already said she reviewed → no question", rv("r4", "Lee", 2), null],
  ["the client said \"Not Kim\" to this review → never again", rv("r7", "Kim", 2), null],
  ["another review from Kim → asked", rv("r7b", "Kim L.", 3), "Kim"],
  ["Tom was never asked (not marked sent) → no question", rv("r8", "Tom", 2), null],
  ["\"A Google User\" → no question", rv("r9", "A Google User", 2), null],
  ["an initial only → no question", rv("r10", "J.", 2), null],
  ["a one-character Han given name → asked", rv("r11", "李 雷", 2), "李"],
  ["a review from before the ask → no question", rv("r12", "Maria", -1), null],
  ["a review 80 days after the ask → no question", rv("r13", "Bo", 80), null],
  ["an anonymous review → no question", rv("r14", "maria", 5, { anonymous: true }), null],
  ["a review already linked to a customer → no question", rv("rz", "Bo", 2), null],
];
for (const [name, v, want] of CASES) {
  const m = RF.matchesFor([v], lists);
  const got = m.length === 1 ? m[0].name : m.length ? `${m.length} questions` : null;
  if (got !== want) fail(`"Is this …?": ${name} — got ${JSON.stringify(got)}`);
}
if (RF.matchesFor([rv("a", "Maria", 1), rv("b", "Maria", 2)], lists).length !== 1) fail("\"Is this …?\": two new reviews from a Maria ask about María twice at once");

// ── 3 · the feed: absence is never zero ──
if (RF.feedFrom([]) !== null || RF.feedFrom([{ captured_at: iso(1), payload: { review_count: 3 } }]) !== null) fail("feed: no reading that kept the reviews still makes a feed (it must say it can't read them)");
const feed = RF.feedFrom([{ captured_at: iso(5), payload: { review_count: 9, rating: 4.8, reviews: [rv("x1", "A", 4), rv("x2", "B", 1), { id: "", at: iso(2) }, { id: "x3", at: "nope" }] } },
  { captured_at: iso(6), payload: { review_count: 9 } }], t0 + 6 * DAY);
if (!feed || feed.count !== 9 || feed.rating !== 4.8 || feed.reviews.map((x) => x.id).join() !== "x1,x2" || feed.gap_days !== 3 || feed.stale || !feed.newer_reading_without_list) fail(`feed: the reading isn't read as kept, newest first, malformed reviews skipped (${JSON.stringify(feed)})`);
if (!RF.feedFrom([{ captured_at: iso(0), payload: { review_count: 1, reviews: [] } }], t0 + 5 * DAY).stale) fail("feed: a 5-day-old reading isn't marked stale");
for (const [id, ok] of [["AbC_-/9", true], ["x y", false], ["<b>", false], ["", false], [null, false], ["a".repeat(201), false]]) if (RF.validReviewId(id) !== ok) fail(`a review id ${JSON.stringify(id)} is ${ok ? "refused" : "accepted"}`);

// ── 4 · the morning read keeps the reviews (owner's profile only), and Places never invents a list ──
{
  const kept = RM.keepReviews([
    { reviewId: "g1", reviewer: { displayName: "Maria G." }, starRating: "FIVE", comment: "Great <b>job</b>", createTime: "2026-10-24T10:00:00Z", reviewReply: { comment: "Thanks", updateTime: "2026-10-24T12:00:00Z" } },
    { reviewId: "g2", reviewer: { isAnonymous: true }, starRating: "TWO", createTime: "2026-10-25T10:00:00Z" },
    { reviewer: { displayName: "No id" }, starRating: "FOUR", createTime: "2026-10-25T10:00:00Z" },
    { reviewId: "g4", reviewer: { displayName: "Bad date" }, starRating: "FOUR", createTime: "never" },
    { reviewId: "g5", reviewer: { displayName: "Long" }, starRating: "STAR_RATING_UNSPECIFIED", comment: "x".repeat(900), createTime: "2026-10-23T10:00:00Z" },
  ]);
  const ids = kept.map((k) => k.id).join();
  if (ids !== "g2,g1,g5") fail(`the morning read doesn't keep Google's reviews newest first, skipping ones without an id or date (${ids})`);
  const [g2, g1, g5] = kept;
  if (!g2 || !g2.anonymous || g2.stars !== 2 || g2.name !== null) fail(`an anonymous 2-star review isn't kept as anonymous (${JSON.stringify(g2)})`);
  if (!g1 || g1.stars !== 5 || g1.text !== "Great <b>job</b>" || g1.replied_at !== "2026-10-24T12:00:00Z" || g1.name !== "Maria G.") fail(`a 5-star review with a reply isn't kept as it is (${JSON.stringify(g1)})`);
  if (!g5 || g5.stars !== null || g5.text.length !== 600) fail(`an unknown star value or a long review isn't kept safely (${JSON.stringify(g5 && { stars: g5.stars, n: g5.text.length })})`);
  const run = async (connected) => {
    const calls = [];
    route = async (url, init) => {
      calls.push({ url, method: init.method || "GET", body: init.body });
      if (url.startsWith("https://sb.test/rest/v1/clients?")) return res(200, [{ id: "c1", business_name: "Acme", workspace_id: "w", google_place_id: "pl1" }]);
      if (url.startsWith("https://sb.test/rest/v1/client_google_oauth")) return res(200, connected ? [{ client_id: "c1", refresh_token: "r", access_token: "a", access_token_expires_at: new Date(Date.now() + 36e5).toISOString(), gbp_location_id: "locations/9", gbp_account_id: "accounts/1" }] : []);
      if (url.startsWith("https://sb.test/rest/v1/client_state_snapshots?")) return res(200, []);
      if (url.startsWith("https://sb.test/rest/v1/client_state_snapshots")) return res(201, "");
      if (url.startsWith("https://sb.test/rest/v1/clients?id=eq.c1")) return res(204, "");
      if (url.includes("mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews")) return /pageSize=50\b/.test(url) ? res(200, { totalReviewCount: 2, averageRating: 4.5, reviews: [{ reviewId: "g1", reviewer: { displayName: "Maria G." }, starRating: "FIVE", createTime: "2026-10-24T10:00:00Z" }] }) : res(400, { error: { message: "asked for fewer than the 50 newest" } });
      if (url.includes("places.googleapis.com")) return res(200, { userRatingCount: 3, rating: 5, displayName: { text: "Acme" } });
      return res(404, { error: "no route " + url });
    };
    await RM.handler({ headers: { "x-internal-secret": "t" }, queryStringParameters: { token: "t" } });
    return calls.filter((c) => c.method === "POST" && /client_state_snapshots$/.test(c.url)).map((c) => JSON.parse(c.body).payload);
  };
  const [pc] = await run(true), [pp] = await run(false);
  if (!pc || !Array.isArray(pc.reviews) || pc.reviews[0]?.id !== "g1" || pc.review_count !== 2) fail(`a connected client's morning reading doesn't keep the reviews (${JSON.stringify(pc)})`);
  if (!pp || "reviews" in pp || pp.source !== "places") fail(`a Places reading claims a reviews list it never had (${JSON.stringify(pp)})`);
}

// ── 5 · the endpoint: the client's Yes / Not her, the reviews read, and who may write ──
{
  let list = null, patched = null, snaps = [], owner = true, v4 = "ok";
  const reset = () => { list = { id: "11111111-1111-1111-1111-111111111111", customers: [cust("Maria", 0), { first_name: "Tom" }] }; patched = null; };
  route = async (url, init) => {
    if (url.startsWith("https://sb.test/auth/v1/user")) return res(200, { id: "u1", email: "owner@acme.test" });
    if (url.includes("/client_portal_access?")) return res(200, owner ? [{ client_id: "c" }] : []);
    if (url.includes("/profiles?")) return res(200, [{ workspace_id: "w" }]);
    if (url.includes("/clients?id=eq.")) return res(200, [{ id: "22222222-2222-2222-2222-222222222222", workspace_id: "w", business_name: "Acme", google_place_id: "pl1" }]);
    if (url.includes("/client_customer_lists?id=eq.") && (init.method || "GET") === "GET") return res(200, [list]);
    if (url.includes("/client_customer_lists?id=eq.") && init.method === "PATCH") { patched = JSON.parse(init.body).customers; return res(200, [{ customers: patched }]); }
    if (url.includes("/client_customer_lists?client_id=eq.")) return res(200, [list]);
    if (url.includes("/client_state_snapshots?")) return snaps === "fail" ? res(500, "down") : res(200, snaps);
    if (url.includes("/client_activity")) return res(201, "");
    // report_live_google_30_day_v2: the total and rating are READ FROM GOOGLE TODAY (the stored reading only supplies the list)
    if (url.includes("/client_google_oauth?")) return res(200, [{ client_id: "c", refresh_token: "r", access_token: "a", access_token_expires_at: new Date(Date.now() + 3600e3).toISOString(), gbp_location_id: "locations/9", gbp_account_id: "accounts/1" }]);
    if (url.includes("mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews")) return v4 === "fail" ? res(500, "down") : res(200, { totalReviewCount: 4, averageRating: 4.5, reviews: [{ reviewId: "g1", starRating: "FIVE", createTime: new Date().toISOString() }] });
    return res(404, { error: "no route " + url });
  };
  const call = async (body) => { const r = await EP.handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: "22222222-2222-2222-2222-222222222222", ...body }) }); return { code: r.statusCode, j: JSON.parse(r.body) }; };
  const L = { list_id: "11111111-1111-1111-1111-111111111111" };
  reset(); let r = await call({ ...L, reviewed: [0], review_id: "g1" });
  if (r.code !== 200 || !patched?.[0]?.reviewed_mark || patched[0].reviewed_review_id !== "g1") fail(`"Yes, it's Maria" doesn't mark her reviewed with the review's id (${r.code} ${JSON.stringify(patched?.[0])})`);
  reset(); r = await call({ ...L, not_match: [0], review_id: "g1" });
  if (r.code !== 200 || patched?.[0]?.reviewed_mark || JSON.stringify(patched?.[0]?.not_review_ids) !== '["g1"]') fail(`"Not Maria" doesn't record that review as not hers, or marks her reviewed (${r.code} ${JSON.stringify(patched?.[0])})`);
  reset(); r = await call({ ...L, not_match: [0] });
  if (r.code !== 400 || patched) fail(`"Not Maria" with no review id is stored (${r.code})`);
  reset(); r = await call({ ...L, reviewed: [0], review_id: "<script>" });
  if (r.code !== 400 || patched) fail(`a review id Google wouldn't write is stored (${r.code})`);
  reset(); r = await call({ ...L, not_match: [1], review_id: "g1" });
  if (r.code !== 409 || patched) fail(`"Not Tom" is stored for a customer who was never asked (${r.code})`);
  reset(); owner = false; r = await call({ ...L, reviewed: [0], review_id: "g1" }); owner = true;
  if (r.code < 400 || patched) fail(`someone who isn't the portal owner (the admin too) can answer "Is this Maria?" for the client (${r.code})`);
  snaps = [{ captured_at: new Date().toISOString(), payload: { review_count: 4, rating: 4.5, reviews: [{ id: "g1", name: "Maria G.", at: new Date().toISOString(), stars: 5 }] } }];
  list = { id: "11111111-1111-1111-1111-111111111111", customers: [{ ...cust("Maria", 0), marked_sent_at: new Date(Date.now() - 2 * DAY).toISOString() }] };
  r = await call({ scope: "reviews" });
  if (r.code !== 200 || r.j.feed?.count !== 4 || r.j.matches?.length !== 1 || r.j.matches[0].review_id !== "g1" || !/^https:\/\/www\.google\.com\/maps\/place\/\?q=place_id:pl1$/.test(r.j.profile_url || "")) fail(`the reviews read doesn't return the feed, the question and the profile link (${JSON.stringify(r.j)})`);
  // the live read failing never shows the stored count as today's, and never reads as "no reviews"
  v4 = "fail"; r = await call({ scope: "reviews" });
  if (r.code !== 200 || r.j.feed?.count !== null || r.j.feed?.rating !== null || r.j.google?.status !== "could_not_read") fail(`a failed live read still shows a stored count as Google's (${JSON.stringify(r.j.feed?.count)} ${JSON.stringify(r.j.google)})`);
  v4 = "ok";
  if (r.code === 200 && !(await call({ scope: "reviews" })).j.google?.source) fail("the reviews answer doesn't carry its source label");
  snaps = []; r = await call({ scope: "reviews" });
  if (r.code !== 200 || r.j.feed !== null || r.j.matches.length || r.j.read_failed) fail(`no reading isn't "can't read them yet" with no question (${JSON.stringify(r.j)})`);
  snaps = "fail"; r = await call({ scope: "reviews" });
  if (r.code !== 200 || !r.j.read_failed || r.j.feed !== null) fail(`a failed read isn't said as failed (${JSON.stringify(r.j)})`);
}

// ── 6 · admin claims nothing it can't know ──
{
  const adm = read("admin/admin.js");
  if (/data-list-action="mark-sent"|How many SMS\/emails were actually sent|update\(\{ status: "sent", sent_count/.test(adm)) fail("admin can mark a customer list \"sent\" again (we never send a review request — the client does)");
  if (/Reviews earned|Sent \$\{l\.sent_count\}/.test(adm)) fail("admin claims \"Sent N\" or \"Reviews earned\" on a list (we never know who reviewed)");
  if (!/they reviewed \$\{revN\} \(the client's word\)/.test(adm)) fail("admin's customer lists don't say the marks are the client's word");
  if (!/data-ob-rv-feed=/.test(adm) || !/scope: "reviews"/.test(adm) || !/without a reply/.test(adm)) fail("admin row 57 doesn't show the client's Google reviews and the ones without a reply");
  if (!/Waiting on the client:/.test(adm) || /data-review-reviewed|data-review-notmatch/.test(adm)) fail("admin can answer \"Is this Maria?\" (it's the client's), or doesn't show it's waiting on them");
}

// ── 7 · the Ongoing work card, drawn in Chrome ──
const src = read("portal/portal.js"), css = read("portal/portal.css");
const pick = (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const line = (name) => (new RegExp(`^const ${name} = .*;$`, "m").exec(src) || [""])[0];
const pcSlice = (() => { const a = src.indexOf("const PC_TICK ="), b = src.indexOf("const pcActs ="); return a < 0 || b < 0 ? "" : src.slice(a, src.indexOf("\n", b)); })();
// 🔄 10-30 client_ongoing_reviews_v1 (card system batch 3): the card is a system row (ogRowHtml) with a system card (csCard, csSt)
const ogRow = (() => { const a = src.indexOf("const ogRowHtml ="), b = src.indexOf("\nconst _ogData", a); return a < 0 || b < 0 ? "" : src.slice(a, b); })();
const lifted = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), line("STAR_ICON"), line("monthDay"), pcSlice, csBlock(src, pcSlice), line("ogK5"), ogRow, pick(/^function reviewsFeedHtml\(/m)];
if (lifted.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a reviews-card function moved (${lifted.findIndex((x) => !x)})`); process.exit(2); }
// monthly_start_v1 (approved 11-9) puts This month's focus right under the reviews card after setup; the reviews card still leads
if (!/const feed = clientId \? `<div class="pm-rv-feed" data-reviews-feed data-client-id=/.test(src) || !/return `<div class="pm-og">\$\{feed\}(?:\$\{focusHtml\})?\$\{ogHost\("replies"\)\}\$\{month2StepsHtml\}\$\{ogHost\("posts"\)\}(?:\$\{ogHost\("value"\)\})?<\/div>`;/.test(src) || !/return `<div class="pm-og">\$\{feed\}/.test(src)) fail("the reviews card doesn't lead Ongoing work, in setup and after");
if (!/loadReviewsFeed\(row\.client_id\);/.test(src)) fail("the reviews card never loads (it would say \"Reading your Google reviews…\" forever)");
if (!/await Promise\.all\(\[loadReviewRequests\(clientId\), loadReviewStep\(clientId\), loadReviewsFeed\(clientId\)\]\);/.test(src)) fail("after a Yes / Not her, the cards don't redraw from the server");
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const SHOTS = process.env.SHOTS || "";
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900 });
  await page.setContent(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#f1f2f4;margin:0"><div style="max-width:820px;margin:16px;padding:16px;background:#fff;border-radius:14px"><div id="h"></div></div></body></html>`);
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: lifted.join("\n") });
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted reviews code doesn't run: ${errs[0]}`); process.exit(2); }
  const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await (await page.$("#h")).screenshot({ path: path.join(SHOTS, `${n}.png`) }); } };
  const draw = (d) => page.evaluate((d) => { const h = document.getElementById("h"); h.innerHTML = reviewsFeedHtml(d, Date.parse("2026-10-25T15:00:00Z"));
    const p = h.querySelector(".pm-k5-plan");
    return { cls: p && p.className, head: (h.querySelector(".pm-k5-h b") || {}).textContent, side: (h.querySelector(".pm-k5-h span") || {}).textContent, text: h.innerText.replace(/\s+/g, " "),
      k: [...h.querySelectorAll(".pm-rv-k3 > span")].map((x) => x.innerText.replace(/\s+/g, " ").trim()), r: [...h.querySelectorAll(".pm-rv-r")].map((x) => x.innerText.replace(/\s+/g, " ").trim()),
      bolds: h.querySelectorAll(".pm-rv-r q b").length, yes: [...h.querySelectorAll("[data-review-reviewed]")].map((b) => [b.textContent, b.getAttribute("data-review-reviewed"), b.getAttribute("data-list-id"), b.getAttribute("data-review-id")]),
      no: [...h.querySelectorAll("[data-review-notmatch]")].map((b) => b.getAttribute("data-review-id")), all: (h.querySelector(".pm-cs-foot a.lk") || {}).textContent || "", href: (h.querySelector(".pm-cs-foot a.lk") || {}).href || "" }; }, d);
  const R = (id, name, at, stars, text, rep = null, anonymous = false) => ({ id, name, at, stars, text, replied_at: rep, anonymous });
  const live = { feed: { checked_at: "2026-10-25T14:00:00Z", stale: false, count: 41, rating: 4.8, new_30d: 3, gap_days: 12,
    reviews: [R("g1", "Maria G.", "2026-10-24T18:00:00Z", 5, "On time, clean work. <b>Fair</b> price."), R("g2", null, "2026-10-12T18:00:00Z", 4, "", "2026-10-13T10:00:00Z", true), R("g3", "Dev R.", "2026-09-30T18:00:00Z", 5, "Great"), R("g4", "Old", "2026-08-01T18:00:00Z", 3, "Old one")] },
    matches: [{ review_id: "g1", list_id: "L1", index: 0, name: "Maria", job: "water heater", asked_at: "2026-10-20T18:00:00Z", reviewer: "Maria G.", stars: 5, at: "2026-10-24T18:00:00Z" }], profile_url: "https://www.google.com/maps/place/?q=place_id:pl1" };
  const a = await draw(live);
  if (a.cls !== "pm-k5-plan pm-cs-card ok" || a.head !== "1 new review this week" || !/^checked Oct 25$/.test(a.side || "")) fail(`A: a new review with a question isn't the green band (the question is its own amber row, client_ongoing_reviews_v1) "1 new review this week · read from Google <date>" (${a.cls} · ${a.head} · ${a.side})`);
  if (a.k.join("|") !== "4.8 ★ average · 41 reviews|+3 new in the last 30 days|12 days between the last two") fail(`A: the three numbers aren't Google's own (${a.k.join("|")})`);
  if (a.r.length !== 3 || !/^Maria G\. ★★★★★ Oct 24 On time, clean work\. <b>Fair<\/b> price\. No reply yet · RGA drafts one for your approval$/.test(a.r[0]) || !/Is this Maria \(water heater, asked Oct 20\)\? So we count it toward your asks\. Yes, it's Maria Not Maria/.test(a.text) || a.bolds) fail(`A: the newest review isn't shown as Google has it with "Is this Maria?" (its words never HTML) (${a.r[0]})`);
  if (!/^A Google user ★★★★☆ Oct 12 No words, just stars\. Replied Oct 13$/.test(a.r[1] || "")) fail(`A: an anonymous review with a reply isn't "A Google user … Replied" (${a.r[1]})`);
  if (JSON.stringify(a.yes) !== JSON.stringify([["Yes, it's Maria", "0", "L1", "g1"]]) || JSON.stringify(a.no) !== '["g1"]') fail(`A: the answers don't name the customer and the review (${JSON.stringify(a.yes)} · ${a.no})`);
  if (a.all !== "See all 41 on Google ↗" || a.href !== "https://www.google.com/maps/place/?q=place_id:pl1") fail(`A: "See all on Google" is missing or points elsewhere (${a.all} · ${a.href})`);
  await shot("A-new-review-question");
  const b = await draw({ ...live, matches: [] });
  if (b.cls !== "pm-k5-plan pm-cs-card ok" || /Is this/.test(b.text) || b.yes.length) fail(`B: with nothing to ask, the card isn't green or still asks (${b.cls})`);
  const quiet = await draw({ ...live, matches: [], feed: { ...live.feed, reviews: live.feed.reviews.slice(2), new_30d: 1 } });
  if (quiet.head !== "41 reviews on Google") fail(`B: a quiet week doesn't say the total (${quiet.head})`);
  const none = await draw({ feed: { ...live.feed, count: 0, rating: null, new_30d: 0, gap_days: null, reviews: [] }, matches: [], profile_url: "https://x" });
  // 🔒 10-23 (live check on RGA): 0 reviews read as a GREEN card with "No rating · +0 · –" — zero is the client's move, not "good"
  if (none.cls !== "pm-k5-plan pm-cs-card you" || none.head !== "No reviews on Google yet" || !/Your review requests are how the first ones come in/.test(none.text) || none.all || none.k.length) fail(`C: a profile with no reviews (measured) isn't the amber "No reviews on Google yet" with no empty numbers (${none.cls} · ${none.head} · ${none.k.join("|")} · ${none.all})`);
  const stale = await draw({ ...live, matches: [], feed: { ...live.feed, stale: true } });
  if (!/^last checked /.test(stale.side || "")) fail(`D: an old reading doesn't say "last checked" (${stale.side})`);
  const cant = await draw({ feed: null, matches: [], read_failed: false });
  if (cant.cls !== "pm-k5-plan pm-cs-card off" || cant.head !== "We can't read your reviews yet" || /\d+ (new )?reviews?/.test(cant.text) || cant.all) fail(`E: no reading isn't "We can't read your reviews yet" with no number (${cant.head} · ${cant.text})`);
  await shot("E-cant-read");
  const failed = await draw({ read_failed: true });
  if (!/We couldn't load your reviews just now/.test(failed.text) || /\d+ reviews?/.test(failed.text)) fail(`F: a failed load isn't said as failed (${failed.text})`);
  await page.setViewport({ width: 375, height: 800 });
  await draw(live);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail("A: the reviews card scrolls sideways on a phone");
  await shot("A-phone");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 the live reviews aren't the approved card, or aren't honest:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ live reviews are reviews_ongoing_live_v1 (approved 10-23): the morning read keeps Google's newest 50 reviews (owner's profile only; Places invents none); Ongoing work leads with them (stars · words as written · reply status · Google's 3 numbers · See all on Google); \"Is this Maria?\" only when exactly one asked customer fits (13 name shapes, 14 match cases), answered only by the client (Yes = reviewed + the review's id · Not her = never again · bad ids refused · admin can't answer); no reading = \"We can't read your reviews yet\", a failed read says so; admin claims no sends and no \"reviews earned\"; no sideways scroll on a phone");
