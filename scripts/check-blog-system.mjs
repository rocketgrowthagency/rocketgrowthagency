#!/usr/bin/env node
// check-blog-system.mjs — 2026-11-01. The blog system (approved reports/mockups/blog_system_v1.html steps 1-8 + blog_cleanup_v1; Chris 10-31). RUNS the real code:
// _blog-links.js (the 14 link rules), _blog-system.js (verdicts, indexing, audit), _blog-evidence.js, blog-index-check.js (fake network), admin-blog.js (fakes),
// scripts/blog-cleanup.mjs, and reads the real posts + the new pages.
//   · each link rule fires on its own fixture and stays quiet on a clean one; the real blog has no failing crawlable/anchor/stuffing/404 link; the "no post links to
//     this one" count may only go DOWN (research_notes/blog/link-baseline.json)
//   · the verdicts are Hold / Not enough data / Trending right / Trending wrong / No clear change, a small steady count is never news, an unread table is never a 0,
//     a Google data fault holds, "right" needs four looks in a row, an immediate break is a fact
//   · an API error, a timeout or a 429 is "unknown", never "not indexed"; no table = Google is asked nothing; the job is bounded and read only
//   · the post audit: no page data = no noindex proposal; a post that earned a click stays; a retired claim is corrected, not noindexed; a batch is at most 12
//   · the press records a decision about a batch the server itself rebuilt; it cannot be applied twice and it changes no page
//   · nothing is noindexed, redirected, merged or deleted: /local-seo/ and /industries/ stay indexed; no automatic publishing; the drip is still on hold;
//     the logo test post is a draft and is NOT published
//   · the public posts: no FAQPage markup, year out of titles (except a dated subject), datePublished everywhere, no retired claim, no invented team, no personal name
//   · the new pages exist and are in the sitemap; the evidence block refuses blanks; the SQL file exists, is not run, and the code says "Not set up" without it
// Businesses are NOT RGA: the verdict rules read counts only (a plumber with 3,000 clicks a week is judged by his own noise).
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 indeterminate (code moved)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const exists = (r) => fs.existsSync(`${SITE}/${r}`);
const req = createRequire(import.meta.url);
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — ${w} moved; re-read it before trusting this gate`); process.exit(2); };

let L, S, E, IDX, ADM;
try {
  L = req(`${SITE}/netlify/functions/_blog-links.js`); S = req(`${SITE}/netlify/functions/_blog-system.js`); E = req(`${SITE}/netlify/functions/_blog-evidence.js`);
  IDX = req(`${SITE}/netlify/functions/blog-index-check.js`); ADM = req(`${SITE}/netlify/functions/admin-blog.js`);
} catch (e) { console.error(`⚠️  INDETERMINATE — the modules don't load (${e.message})`); process.exit(2); }
const SRC = { links: read("netlify/functions/_blog-links.js"), sys: read("netlify/functions/_blog-system.js"), idx: read("netlify/functions/blog-index-check.js"), adm: read("netlify/functions/admin-blog.js"), io: read("netlify/functions/_blog-io.js"), ev: read("netlify/functions/_blog-evidence.js") };
const TOML = read("netlify.toml"), MAN = read("netlify/functions/_job-manifest.js"), SQL = read("supabase/blog_system.sql"), ADMJS = read("admin/admin.js"), ADMHTML = read("admin/index.html");
if (typeof L.buildMap !== "function" || typeof S.weeklyVerdicts !== "function" || typeof S.auditPosts !== "function") moved("the exports");

// ── 1 · the 14 link rules, each on its own fixture ──
const post = (body) => `<div class="bp-body">${body}</div><aside class="bp-side"><a href="/side/">Side nav link</a></aside>`;
const clean = (extra = "") => post(`<p><a href="/services/gbp-optimization/">Google Business Profile optimization</a> ${extra}</p>`);
const ok = () => "ok";
const run = (posts, o = {}) => L.buildMap({ posts, exists: o.exists || ok, noindexed: o.noindexed || new Set(), newSlugs: o.newSlugs || new Set() });
const has = (r, rule, level) => r.findings.some((f) => f.rule === rule && (!level || f.level === level));
{
  const cleanMap = run({ a: clean(`<a href="/blog/b/">Plumber guide</a>`), b: clean(`<a href="/blog/a/">Dentist guide</a>`) });
  for (const f of cleanMap.findings) if (f.level === "fail") fail(`a clean map fails rule ${f.rule}: ${f.detail}`);
  const t = (name, posts, rule, level, o) => { if (!has(run(posts, o), rule, level)) fail(`rule ${rule} (${name}) does not fire`); };
  t("orphan post", { a: clean(), b: clean() }, 1, "fail");
  t("javascript: link", { a: post(`<a href="javascript:void(0)">Open the guide</a>`) }, 2, "fail");
  t("empty href", { a: post(`<a href="">Open the guide</a>`) }, 2, "fail");
  t("onclick only", { a: post(`<a onclick="go()">Open the guide</a>`) }, 2, "fail");
  t("generic anchor", { a: post(`<a href="/services/gbp-optimization/">click here</a>`) }, 3, "fail");
  t("empty anchor", { a: post(`<a href="/services/gbp-optimization/"> </a>`) }, 3, "fail");
  t("nine-word anchor", { a: post(`<a href="/services/gbp-optimization/">one two three four five six seven eight nine</a>`) }, 3, "fail");
  t("city list anchor", { a: post(`<a href="/services/gbp-optimization/">Denver, Boulder, Aurora plumbers</a>`) }, 4, "fail");
  t("404 target", { a: post(`<a href="/gone/">A page that was removed</a>`) }, 5, "fail", { exists: () => "missing" });
  t("redirect target", { a: post(`<a href="/old/">An old address</a>`) }, 5, "warn", { exists: () => "redirect" });
  t("new post without a service link", { a: post(`<a href="/blog/b/">Another guide</a>`), b: clean() }, 6, "fail", { newSlugs: new Set(["a"]) });
  t("link into a page being noindexed", { a: clean(`<a href="/blog/b/">Plumber guide</a>`), b: clean() }, 7, "fail", { noindexed: new Set(["/blog/b/"]) });
  t("link to a noindexed page", { a: clean(`<a href="/blog/b/">Plumber guide</a>`), b: clean() }, 8, "warn", { noindexed: new Set(["/blog/b/"]) });
  t("same url twice", { a: post(`<a href="/blog/b/">Plumber guide</a> <a href="/blog/b/">Plumber guide</a>`), b: clean() }, 9, "warn");
  t("service page behind a post", { a: clean(`<a href="/blog/b/">Plumber guide</a>`), b: clean(`<a href="/blog/a/">Dentist guide</a>`), c: clean(`<a href="/blog/b/">Plumber guide</a>`) }, 10, "warn");
  const many = {}; for (let i = 0; i < 12; i++) many["p" + i] = post(`<a href="/services/gbp-optimization/">Business Profile service</a>`);
  t("same anchor on many posts", many, 11, "warn");
  t("one anchor, two targets", { a: post(`<a href="/blog/b/">Local guide</a>`), b: post(`<a href="/blog/a/">Local guide</a>`), c: post(`<a href="/services/gbp-optimization/">Local guide</a>`) }, 12, "warn");
  t("sixteen links", { a: post(Array.from({ length: 16 }, (_, i) => `<a href="/p${i}/">Page number ${i}</a>`).join(" ")) }, 13, "warn");
  if (L.RULES.length !== 14) fail(`there are ${L.RULES.length} link rules, not 14`);
  // boilerplate outside the body (nav, sidebar, share links) is not counted
  const side = run({ a: post(`<p>No links here.</p>`) });
  if (side.posts.a.incontent !== 0) fail("the sidebar's links are counted as in-content links");
  // a link to another site is not part of the internal map; mail/tel are not links to check
  const out = run({ a: post(`<a href="https://example.com/x">A source</a> <a href="tel:+14242422040">Call us now</a>`) });
  if (out.posts.a.incontent !== 0) fail("an outside link or a phone link entered the internal map");
  // a page the map cannot read is a failure, not a pass
  if (!has(run({ a: "<html></html>" }), 0, "fail")) fail("a page with no readable body passes the link rules");
}
// the real blog
{
  const { run: realRun } = await import(`${SITE}/scripts/blog-link-map.mjs`);
  const r = realRun(SITE);
  for (const rule of [2, 3, 4, 5, 6, 7]) { const n = r.findings.filter((f) => f.rule === rule && f.level === "fail").length; if (n) fail(`the real blog has ${n} failing link(s) on rule ${rule}: ${(r.findings.find((f) => f.rule === rule) || {}).detail}`); }
  if (r.summary.posts < 100) fail(`only ${r.summary.posts} posts were read; the link map is blind`);
  let base; try { base = JSON.parse(read("research_notes/blog/link-baseline.json")).rule_1_posts_no_link_from_another_post; } catch { moved("research_notes/blog/link-baseline.json"); }
  if (r.summary.posts_no_link_from_another_post > base) fail(`posts with no link from another post rose from ${base} to ${r.summary.posts_no_link_from_another_post}`);
}

// ── 2 · verdicts ──
const NOW = new Date("2026-11-01T12:00:00Z");
const iso = (i) => new Date(NOW.getTime() - i * 86400000).toISOString().slice(0, 10);
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ date: iso(i), ...f(i) }));
const V = (rows, o = {}) => S.weeklyVerdicts({ rows, now: NOW, events: o.events || [], index: o.index || null, rowsReady: o.rowsReady !== false });
{
  const none = V([], {}); if (none.clicks.verdict !== "Not enough data" || !none.clicks.unknown) fail("no rows kept: clicks are not 'Not enough data / unknown'");
  const unset = V([], { rowsReady: false }); if (unset.set_up !== false || !/Not set up/.test(unset.clicks.reason)) fail("a missing table isn't said to be not set up");
  if (/\b0 clicks\b|: 0\b/.test(JSON.stringify(none))) fail("an unread history prints a 0");
  // steady, small: 2.75 clicks a week is never a verdict beyond "not enough data"
  const steady = V(series(300, (i) => ({ clicks: i % 17 === 0 ? 1 : 0, impressions: 130 + (i % 5), position: 20 })));
  if (steady.clicks.verdict !== "Not enough data") fail(`2.75 clicks a week reads "${steady.clicks.verdict}", must be Not enough data`);
  if (["Trending right", "Trending wrong"].includes(steady.impressions.verdict)) fail("flat impressions read as a trend");
  // a doubling that fits inside the noise is not news
  const rise = V(series(300, (i) => ({ clicks: i < 28 ? 2 : 1, impressions: 130 + (i % 5), position: 20 })));
  if (rise.clicks.verdict === "Trending right") fail("11 vs 6 clicks reads as Trending right");
  // a Google data fault holds impressions but not clicks
  const fault = [{ on_date: "2025-05-13", to_date: "2026-08-20", kind: "data_fault", label: "fault" }];
  const held = V(series(300, () => ({ clicks: 1, impressions: 200, position: 20 })), { events: fault });
  if (held.impressions.verdict !== "Hold") fail(`a window touching a data fault reads "${held.impressions.verdict}", must be Hold`);
  if (held.clicks.verdict === "Hold" && !/known change/.test(held.clicks.reason)) fail("the impressions fault held the clicks");
  // four looks in a row
  const grow = V(series(300, (i) => ({ clicks: i < 84 ? 1 : 0, impressions: i < 40 ? 600 + (i % 3) : 150 + (i % 3), position: 20 })));
  if (grow.impressions.verdict !== "Trending right") fail(`a lasting jump in impressions reads "${grow.impressions.verdict}", must be Trending right`);
  const spike = V(series(300, (i) => ({ clicks: 0, impressions: i < 5 ? 3000 : 150 + (i % 3), position: 20 })));
  if (spike.impressions.verdict === "Trending right") fail("one week's spike reads as Trending right (needs four looks in a row)");
  const fall = V(series(300, (i) => ({ clicks: 0, impressions: i < 40 ? 150 + (i % 3) : 600 + (i % 3), position: 20 })));
  if (fall.impressions.verdict !== "Trending wrong") fail(`a lasting fall reads "${fall.impressions.verdict}"`);
  // missing final days are not zeros
  const gap = V(series(300, (i) => ({ clicks: 0, impressions: 150, position: 20 })).filter((r) => !(Number(String(r.date).slice(8)) % 2)));
  if (!["Hold", "Not enough data"].includes(gap.impressions.verdict)) fail("missing days read as a comparison");
  // immediate break
  const brk = V(series(300, () => ({ clicks: 0, impressions: 150, position: 20 })), { index: { breaks: ["https://x.test/blog/a/ dropped out of Google's index"] } });
  if (brk.impressions.verdict !== "Trending wrong") fail("a post dropping out of the index is not an immediate Trending wrong");
  // a business that isn't RGA: thousands of clicks, judged by its own noise
  const big = V(series(300, (i) => ({ clicks: 400 + (i % 3), impressions: 9000 + (i % 7) * 30, position: 6 })));
  if (!["No clear change", "Trending right", "Trending wrong"].includes(big.clicks.verdict) || big.clicks.verdict === "Trending wrong") fail(`a steady big site reads clicks "${big.clicks.verdict}"`);
  if (S.VERDICTS.join("|") !== "Hold|Not enough data|Trending right|Trending wrong|No clear change") fail("the verdict words changed");
  if (/\d\s?%/.test(S.countLine(2, 1, "click")) || S.countLine(2, 1, "click") !== "2 clicks vs 1") fail("a count under 30 is shown as a percent");
}
// ── 3 · indexing ──
{
  const u = "https://www.rocketgrowthagency.com/blog/a/";
  const R = (st, body) => S.readInspection(u, st, body);
  const body = (verdict, cov) => ({ inspectionResult: { indexStatusResult: { verdict, coverageState: cov } } });
  if (R(500, null).state !== "unknown") fail("a Google 500 reads as not indexed");
  if (R(429, null).state !== "unknown") fail("a 429 reads as not indexed");
  if (R(200, {}).state !== "unknown") fail("an empty answer reads as not indexed");
  if (R(200, body("NEUTRAL", null)).state !== "unknown") fail("a verdict with no coverage state reads as not indexed");
  if (R(200, body("NEUTRAL", "Crawled - currently not indexed")).state !== "not_indexed") fail("Google's own 'not indexed' isn't read as not indexed");
  if (R(200, body("PASS", "Submitted and indexed")).state !== "indexed") fail("PASS isn't indexed");
  const sum = S.indexSummary([{ url: u, checked_at: "2026-10-20", state: "indexed" }, { url: u, checked_at: "2026-10-27", state: "not_indexed" }], [u, u + "x/"]);
  if (!sum.breaks.length) fail("indexed then not indexed isn't an immediate break");
  if (sum.never_checked !== 1) fail("a page never checked is counted as checked");
  const due = S.dueUrls(Array.from({ length: 60 }, (_, i) => `https://www.rocketgrowthagency.com/blog/p${i}/`), [{ url: "https://www.rocketgrowthagency.com/blog/p0/", checked_at: NOW.toISOString(), state: "indexed" }], NOW, { limit: 25 });
  if (due.length !== 25) fail(`a run asks about ${due.length} pages, the cap is 25`);
  if (due.includes("https://www.rocketgrowthagency.com/blog/p0/")) fail("a page checked today is asked about again");
}
// the job, on a fake network
{
  const urls = async () => Array.from({ length: 80 }, (_, i) => `https://www.rocketgrowthagency.com/blog/p${i}/`);
  let calls = 0, saved = [];
  const mk = (o = {}) => ({ now: NOW, fetchFn: async (u) => { calls++; if (o.status) return { status: o.status, json: async () => ({}) }; if (o.throws) throw new Error("timeout"); return { status: 200, json: async () => ({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" } } }) }; },
    tryRead: async () => (o.noTable ? { ready: false, rows: [] } : { ready: true, rows: [] }), ownOauth: async () => ({ gsc_site_url: "sc-domain:rocketgrowthagency.com", client_id: "c" }), token: async () => "t", urls, supa: async (p, init) => { saved.push(JSON.parse(init.body)); } });
  let r = await IDX.run(mk({ noTable: true }));
  if (r.table_ready !== false || calls !== 0 || !/Not set up/.test(r.note || "")) fail("with no table the job asked Google or didn't say Not set up");
  calls = 0; saved = []; r = await IDX.run(mk());
  if (calls > 50 || IDX.LIMIT > 50) fail(`the job made ${calls} Google calls in one run (cap ${IDX.LIMIT}); more than 50 a run is not "a few a day"`);
  if (!saved.length || saved[0].length !== r.checked) fail("a check was made and not recorded");
  calls = 0; saved = []; r = await IDX.run(mk({ status: 429 }));
  if (r.indexed || r.not_indexed || r.unknown === 0) fail("a 429 was recorded as indexed or not indexed");
  if (calls > 5) fail(`after a 429 the job kept asking (${calls} calls)`);
  calls = 0; saved = []; r = await IDX.run(mk({ throws: true }));
  if (r.not_indexed) fail("a timeout was recorded as not indexed");
  if (/PATCH|DELETE|\.post\(|businessinformation|mybusiness|writeFile/i.test(SRC.idx.replace(/\/\/.*$/gm, ""))) fail("the indexing job can write somewhere other than its own table");
  if (/quotaUser|raise.*quota|quota.*increase/i.test(SRC.idx.replace(/\/\/.*$/gm, ""))) fail("the job tries to change a Google quota");
}
// ── 4 · the post audit ──
{
  const posts = Array.from({ length: 30 }, (_, i) => ({ slug: `local-seo-for-t${i}`, title: "t", kind: "template", published: "2026-07-01", retired: [], links_in: 0 }));
  const noPages = S.auditPosts({ posts, pages: null, pageCoverage: { ready: false }, now: NOW });
  if (noPages.noindex.length || noPages.ready) fail("with no per-page rows a post is proposed for noindex");
  if (noPages.waiting.length !== 30) fail("a page with no rows isn't 'waiting'");
  const pages = new Map(); pages.set("https://www.rocketgrowthagency.com/blog/local-seo-for-t0/", { clicks: 1, impressions: 41 });
  const cov = { ready: true, first_day: "2025-07-01" };
  const a = S.auditPosts({ posts, pages, pageCoverage: cov, now: NOW });
  if (a.noindex.some((p) => p.slug === "local-seo-for-t0")) fail("a post that earned a click is proposed for noindex");
  if (!a.keep.some((p) => p.slug === "local-seo-for-t0")) fail("a post that earned a click isn't kept");
  if (a.noindex.length !== 29) fail(`expected 29 proposals, got ${a.noindex.length}`);
  if (a.batches.some((b) => b.items.length > S.BATCH) || S.BATCH > 12) fail("a batch is larger than 12");
  const young = S.auditPosts({ posts: [{ ...posts[1], published: "2026-10-20" }], pages, pageCoverage: cov, now: NOW });
  if (young.noindex.length) fail("a post under 90 days old is proposed for noindex");
  const wrong = S.auditPosts({ posts: [{ ...posts[1], retired: [{ feature: "Google Business Profile Q&A" }] }], pages, pageCoverage: cov, now: NOW });
  if (wrong.correct_now.length !== 1 || wrong.noindex.length) fail("a post stating a retired feature is noindexed instead of corrected");
  const early = S.auditPosts({ posts: [{ ...posts[2], published: "2024-01-01" }], pages, pageCoverage: { ready: true, first_day: "2025-07-01" }, now: NOW });
  if (early.noindex.length) fail("0 clicks is claimed for a period the kept rows don't cover");
  const guide = S.auditPosts({ posts: [{ ...posts[3], kind: "guide" }], pages, pageCoverage: cov, now: NOW });
  if (guide.noindex.length) fail("a non-template post is proposed for noindex without a person deciding");
  // retired facts
  if (!S.retiredIn("<p>Use the Google Business Profile Q&amp;A to answer questions.</p>").length) fail("selling Q&A isn't caught");
  if (S.retiredIn("<p>Google retired the Q&amp;A feature, so we removed that advice.</p>").length) fail("saying Q&A is gone is flagged as selling it");
}
// ── 5 · the admin card and the press ──
{
  const blank = { now: NOW, gsc: { ready: false }, blog: { ready: false }, errors: [], events: [], facts: null };
  const c = ADM.build(blank);
  const idx = c.rows.find((r) => r.key === "indexed");
  if (!idx || idx.tag !== "Not set up") fail("without the tables the indexing row isn't 'Not set up'");
  if (c.rows.some((r) => r.tone === "ok")) fail("with nothing set up a row is green");
  if (c.audit && c.audit.noindex && c.audit.noindex.length) fail("with nothing set up the card proposes noindex");
  if (/\b(undefined|NaN|null)\b/.test(JSON.stringify(c.rows.map((r) => r.line + r.label)))) fail("the card prints undefined / NaN / null");
  if (!/applies: false/.test(SRC.adm) || !/changes no page/i.test(SRC.adm)) fail("the press is no longer recorded as applying nothing");
  if (/writeFile|appendFile|noindex["']?\s*[:=]\s*true/.test(SRC.adm)) fail("admin-blog can write a page or set noindex");
  if (!/not in today's audit|isn't in today's proposed list/.test(SRC.adm) || !/already approved/.test(SRC.adm)) fail("the press doesn't refuse an unknown or repeated batch");
  if (!/\/blog_decisions/.test(SRC.adm) || /\/client_|\/clients\?/.test(SRC.adm.replace(/\/\/.*$/gm, "")) && /method: "(PATCH|DELETE)"/.test(SRC.adm)) fail("the press touches something other than blog_decisions");
}
// the press, on fakes: it rebuilds the batch itself, refuses an unknown key, and a batch can be approved once
{
  const posts = Array.from({ length: 14 }, (_, i) => ({ slug: `local-seo-for-t${i}`, title: "t", kind: "template", published: "2026-07-01", retired: [], links_in: 0 }));
  const g = { now: NOW, gsc: { ready: true, rows: [], truncated: false }, blog: { ready: true }, errors: [], events: [], facts: { list: posts, map: { summary: { posts: 14, posts_no_link_from_another_post: 14, service_links_in: {} } } }, state: { backfill_done: true }, decisions: [], checks: [] };
  const key = (ADM.build(g).audit || { batches: [] }).batches[0] && ADM.build(g).audit.batches[0].key;
  if (!key) fail("a ready audit with 14 never-clicked template posts proposes no batch");
  else {
    const wrote = [];
    const w = async (p, init) => wrote.push([p, JSON.parse(init.body)]);
    const r1 = await ADM.decide({ batch_key: key, decision: "approved" }, { email: "a@b.test" }, g, w);
    if (r1.status !== 200 || r1.body.applied !== false || wrote.length !== 1 || wrote[0][0] !== "/blog_decisions") fail("approving a proposed batch isn't recorded once in blog_decisions as not applied");
    const r2 = await ADM.decide({ batch_key: "noindex:made-up:3", decision: "approved" }, { email: "a@b.test" }, g, w);
    if (r2.status !== 404 || wrote.length !== 1) fail("a batch the server never proposed was accepted");
    const r3 = await ADM.decide({ batch_key: key, decision: "approved" }, { email: "a@b.test" }, { ...g, decisions: [{ batch_key: key, decision: "approved" }] }, w);
    if (r3.status !== 409 || wrote.length !== 1) fail("a batch already approved can be approved again");
    const r4 = await ADM.decide({ batch_key: key, decision: "approved" }, {}, { ...g, blog: { ready: false } }, w);
    if (r4.status !== 409 || wrote.length !== 1) fail("with no table the press pretended to record");
  }
}
// ── 6 · wiring ──
{
  if (!/\[functions\."blog-index-check"\]\s*\n\s*schedule = "40 5 \* \* \*"/.test(TOML)) fail("blog-index-check isn't scheduled in netlify.toml");
  if (!/job: "blog-index-check"[^\n]*cron: "40 5 \* \* \*"/.test(MAN)) fail("blog-index-check isn't in the job manifest with the same schedule");
  if (!/withCheckin\("blog-index-check"/.test(SRC.idx)) fail("blog-index-check doesn't check in");
  if (!/included_files = \["blog\/\*\/index\.html"\]/.test(TOML)) fail("admin-blog can't read the posts");
  if (!/id="blogCard"/.test(ADMHTML) || !/syncBlogCard\(name\)/.test(ADMJS) || !/admin-blog/.test(ADMJS)) fail("the blog card isn't wired into admin");
  if (/(ANTHROPIC|OPENAI|claude-|gpt-)/i.test(SRC.sys + SRC.idx + SRC.adm + SRC.io + SRC.links)) fail("the blog code calls an AI model: nothing here may spend on AI");
  if (!/not been run|NOT RUN YET/i.test(SQL) || !/enable row level security/.test(SQL)) fail("blog_system.sql isn't marked not run, or its tables aren't closed to the public");
  for (const t of ["blog_index_check", "blog_posts", "blog_evidence", "blog_decisions", "blog_events", "blog_worked"]) if (!new RegExp(`create table if not exists public\\.${t}\\b`).test(SQL)) fail(`blog_system.sql lacks ${t}`);
  if (/drop table|delete from|truncate/i.test(SQL.replace(/--.*$/gm, ""))) fail("blog_system.sql drops or deletes something");
}
// ── 7 · the hard limits: nothing noindexed, nothing published by itself ──
{
  const walk = (dir) => { try { return fs.readdirSync(`${SITE}/${dir}`).filter((d) => exists(`${dir}/${d}/index.html`)).map((d) => `${dir}/${d}/index.html`); } catch { return []; } };
  for (const f of [...walk("local-seo"), ...walk("industries"), "local-seo/index.html", "industries/index.html", "blog/index.html"]) {
    if (!exists(f)) continue;
    const t = read(f); const robots = (/<meta name="robots" content="([^"]*)"/.exec(t) || [])[1] || "";
    if (/noindex/i.test(robots)) fail(`${f} is noindexed (no noindex until a real Search Console read): "${robots}"`);
  }
  for (const f of walk("blog")) { const t = read(f); if (/noindex/i.test((/<meta name="robots" content="([^"]*)"/.exec(t) || [])[1] || "")) fail(`${f} is noindexed`); }
  // the only redirects there are the two that were already live (personal injury lawyers, 2026-07): none is added by this build
  const redirects = (TOML.match(/\[\[redirects\]\][\s\S]*?(?=\n\[|$)/g) || []).map((r) => (/from = "(\/(?:blog|local-seo|industries)\/[^"]*)"/.exec(r) || [])[1]).filter(Boolean).filter((f) => !/^\/industries\/personal-injury-lawyers\/?\*?$/.test(f));
  if (redirects.length) fail(`redirect(s) were added for /blog/, /local-seo/ or /industries/: ${redirects.join(", ")}`);
  const SCR = process.env.SCRAPER_COPY_DIR ? `${process.env.SCRAPER_COPY_DIR}/scripts` : path.dirname(fileURLToPath(import.meta.url)); let drip; try { drip = fs.readFileSync(`${SCR}/drip-content.sh`, "utf8"); } catch { moved("scripts/drip-content.sh"); }
   if (!/RGA_ALLOW_TEMPLATE_DRIP/.test(drip) || !/exit 0/.test(drip.split("RGA_ALLOW_TEMPLATE_DRIP")[1].slice(0, 200))) fail("the blog drip is no longer on hold");
  if (exists("blog/does-a-new-logo-show-up-on-google-maps/index.html") || /does-a-new-logo/.test(read("sitemap.xml"))) fail("the logo test post is published before the Nov 2 check");
  let d; try { d = JSON.parse(read("research_notes/blog/logo-test-draft.json")); } catch { moved("the logo test draft"); }
  if (!/NOT PUBLISHED/.test(d.status) || E.evidenceBlock(d.evidence).ok) fail("the logo test draft is complete enough to publish, or isn't marked unpublished");
  if (/\bpublish(ed)?\s*(\(|=)\s*(true|automatic)/i.test(SRC.adm + SRC.idx + SRC.sys)) fail("something in the blog code publishes by itself");
}
// ── 8 · the public posts and pages ──
{
  const slugs = fs.readdirSync(`${SITE}/blog`).filter((d) => exists(`blog/${d}/index.html`));
  let faq = 0, long = 0, year = 0, nodate = 0, nolink = 0, retired = 0, team = 0, badld = 0;
  for (const s of slugs) {
    const t = read(`blog/${s}/index.html`);
    if (/"@type":\s*"FAQPage"/.test(t)) faq++;
    if (/<title>[^<]*2026/.test(t) && !/-in-2026$/.test(s)) year++;
    const ttl = ((/<title>([^<]*)<\/title>/.exec(t) || [])[1] || "").replace(/&amp;/g, "&"); if (ttl.length > 60) long++;
    if (!/"datePublished"/.test(t)) nodate++;
    if (!t.includes('href="/how-we-test/"')) nolink++;
    const vis = (L.contentRegion(t) || "").replace(/<p class="bp-update">[\s\S]*?<\/p>/, "");
    if (S.retiredIn(vis).length) retired++;
    if (/\bour (analysts?|team|experts?|researchers?)\b|we're a team of/i.test(vis)) team++;
    for (const m of t.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { badld++; } }
  }
  if (slugs.length < 100) fail(`only ${slugs.length} posts found`);
  if (faq) fail(`${faq} posts still carry FAQPage markup`);
  if (year) fail(`${year} posts still have a year in the title`);
  if (long) fail(`${long} posts have a <title> over 60 characters, so Google cuts it off`);
  if (nodate) fail(`${nodate} posts have no datePublished`);
  if (nolink) fail(`${nolink} posts don't link the how-we-test page`);
  if (retired) fail(`${retired} posts still sell a retired Google feature`);
  if (team) fail(`${team} posts claim a team that isn't there`);
  if (badld) fail(`${badld} JSON-LD blocks don't parse`);
  const sm = read("sitemap.xml");
  for (const p of ["about", "how-we-test", "corrections"]) {
    if (!exists(`${p}/index.html`)) { fail(`/${p}/ is missing`); continue; }
    const t = read(`${p}/index.html`);
    if (!new RegExp(`<loc>https://www\\.rocketgrowthagency\\.com/${p}/</loc>`).test(sm)) fail(`/${p}/ isn't in the sitemap`);
    if (!/<meta name="robots" content="index,follow"/.test(t)) fail(`/${p}/ isn't indexable`);
    if (!/Rocket Growth Agency/.test(t)) fail(`/${p}/ doesn't say who writes it`);
    if (/\bour (analysts?|team of|experts?)\b/i.test(t)) fail(`/${p}/ invents a team`);
    if (/\bguarantee|\bwill rank|#1 on google|first page guaranteed/i.test(t.replace(/Can you guarantee[^<]*/g, "").replace(/not? (promise|guarantee)[^<]*/gi, ""))) fail(`/${p}/ makes a promise about results`);
    if (/\b\d+(\.\d+)?%/.test(t.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, ""))) fail(`/${p}/ carries a statistic`);
  }
  const howto = read("how-we-test/index.html");
  if (!/do not claim/i.test(howto) || !/corrections log/i.test(howto)) fail("the how-we-test page lost its limits or its corrections link");
  const corr = read("corrections/index.html"); if (!/2026-10-31/.test(corr)) fail("the corrections log is empty");
}
// the bulk edit is idempotent and keeps a dated subject's year
{
  const { cleanPost, stripYear } = await import(`${SITE}/scripts/blog-cleanup.mjs`);
  const sample = read("blog/local-seo-for-dentists/index.html");
  const once = cleanPost(sample, "local-seo-for-dentists"); const twice = cleanPost(once.html, "local-seo-for-dentists");
  if (twice.html !== once.html) fail("running the cleanup twice changes the page again");
  const dated = cleanPost(`<title>Moves in 2026 | RGA</title>`, "x-in-2026"); if (!/2026/.test(dated.html)) fail("a dated subject loses its year");
  if (stripYear("Local SEO for Dentists (2026 Guide)") !== "Local SEO for Dentists") fail("the year isn't stripped from a title");
  if (stripYear("Local SEO for Plumbers in 2026") !== "Local SEO for Plumbers") fail("a title ending in 'in 2026' keeps its year");
  if (stripYear("In 2026 the plan") === "the plan" || /Q4 2026/.test(stripYear("Plan for Q4 2026")) === false) fail("the year is stripped from running text");
}
// the evidence block
{
  const base = { what: "w", did_on: "2026-10-31", checked_on: "2026-11-02", method: "m", limits: "l", sources: [{ label: "g", url: "https://x.test/a" }] };
  if (!E.evidenceBlock(base).ok) fail("a complete evidence record is refused");
  for (const [k, v] of [["limits", ""], ["method", "TBD"], ["checked_on", ""], ["what", "Our analysts ran it"], ["sources", []], ["result", "[fill in after Nov 2]"]])
    if (E.evidenceBlock({ ...base, [k]: v }).ok) fail(`the evidence block accepts ${k}=${JSON.stringify(v)}`);
  if (E.evidenceBlock({ ...base, screenshot: { src: "/a.png" } }).ok) fail("a screenshot with no alt text or date is accepted");
}
// step 6: the page a lead first landed on
{
  const LEAD = req(`${SITE}/netlify/functions/_supabase-lead.js`);
  const c = LEAD.cleanFirstTouch;
  if (typeof c !== "function" || typeof ADM.leadRow !== "function") moved("cleanFirstTouch / leadRow");
  const ok = c({ landing_page: "/blog/local-seo-for-plumbers/", traffic_source: "Google.com" });
  if (ok.landing_page !== "/blog/local-seo-for-plumbers/" || ok.traffic_source !== "google.com") fail("a plain page and host are not kept");
  for (const bad of ["https://evil.test/x", "/a?email=a@b.com", "javascript:1", "<script>", "//x.test"]) if (c({ landing_page: bad }).landing_page) fail(`a lead keeps ${bad} as a landing page`);
  if (c({ traffic_source: "a b@c.com?x=1" }).traffic_source) fail("a lead keeps free text as a traffic source");
  if (c(undefined).landing_page !== "" || c({}).traffic_source !== "") fail("nothing sent must be empty (unknown), not 'direct'");
  const nr = ADM.leadRow({ ready: false, rows: [] }), fl = ADM.leadRow({ ready: null, rows: [] }), none = ADM.leadRow({ ready: true, rows: [{ source: "contact", landing_page: null }] });
  if (nr.tag !== "Not set up" || !/blog_system\.sql/.test(nr.line)) fail("lead sources without the column must say Not set up and name the file");
  if (fl.tag !== "Couldn't read") fail("a failed lead read must say Couldn't read");
  if (none.tag === "Reading" || /\b0 of\b/.test(none.label)) fail("leads with no landing page saved read as a finished count");
  const some = ADM.leadRow({ ready: true, rows: [{ landing_page: "/blog/a/" }, { landing_page: "/blog/a/" }, { landing_page: null }] });
  if (!/2 of 3/.test(some.label) || !/\/blog\/a\/: 2/.test(some.line)) fail("lead sources do not count what they read");
  if (!/landing_page text/.test(SQL) || !/traffic_source text/.test(SQL) || !/lead_intakes_first_touch/.test(SQL) || !/coalesce\(nullif\(new\.raw_payload->>'landing_page'/.test(SQL)) fail("blog_system.sql lacks the lead columns or the trigger that never blanks a saved one");
  const sj = read("script.js");
  if (!/function firstTouch/.test(sj) || !/pathname/.test(sj) || /location\.href|document\.referrer\s*[,)]\s*[^.]*payload/.test(sj)) fail("script.js does not send only a path and a host");
  if (!/landing_page: firstTouch\(\)\.landing_page/.test(sj) || (sj.match(/landing_page: firstTouch\(\)/g) || []).length < 2) fail("both the audit and the contact forms must send the first touch");
  for (const f of ["contact", "start-growth-plan", "free-growth-audit"]) if (!/name="landing_page"/.test(read(`${f}/index.html`)) || !/name="traffic_source"/.test(read(`${f}/index.html`))) fail(`${f} does not declare the first-touch fields`);
  if (!/cleanFirstTouch\(data\)/.test(read("netlify/functions/form-intake.js")) || !/cleanFirstTouch\(data\)/.test(read("netlify/functions/fga-intake.js"))) fail("an intake does not save the first touch");
}
// steps 9 to 12 and the competitor snapshots
{
  const C = req(`${SITE}/netlify/functions/_blog-chain.js`), SNAP = req(`${SITE}/netlify/functions/blog-competitor-snapshot.js`);
  const CSRC = read("netlify/functions/_blog-chain.js"), SSRC = read("netlify/functions/blog-competitor-snapshot.js");
  if (typeof C.proposalGate !== "function" || typeof SNAP.run !== "function") moved("the chain exports");
  const ev = { title: "Does a new logo show up on Google Maps?", status: "done", done_on: "2026-10-31", method: "Sent a cover photo and looked at Maps.", limits: "One business, one test, one place.", sources: ["https://support.google.com/business/answer/6103862"] };
  const ctx = { service: "/services/gbp-optimization/", posts: [], decisions: [], now: new Date("2026-11-03T12:00:00Z") };
  // 9 · the gate: a "no" is final
  if (!C.proposalGate(ev, ctx).ok) fail("a finished, mapped proposal is refused");
  for (const [why, e, c] of [["waiting evidence", { ...ev, status: "waiting" }, ctx], ["no evidence", null, ctx], ["no service page", ev, { ...ctx, service: "" }], ["a future date", { ...ev, done_on: "2027-01-01" }, ctx],
    ["no limits", { ...ev, limits: "" }, ctx], ["a promise in the title", { ...ev, title: "Guaranteed top ranking in 30 days" }, ctx], ["an existing post", ev, { ...ctx, posts: [C.slugOf(ev.title)] }],
    ["two already this month", ev, { ...ctx, decisions: [{ kind: "topic", decision: "proposed", made_at: "2026-11-01T00:00:00Z" }, { kind: "topic", decision: "proposed", made_at: "2026-11-02T00:00:00Z" }] }]])
    if (C.proposalGate(e, c).ok) fail(`the proposal gate lets through ${why}`);
  if (!C.proposalGate(ev, { ...ctx, decisions: [{ kind: "topic", decision: "declined", made_at: "2026-11-01T00:00:00Z" }, { kind: "topic", decision: "declined", made_at: "2026-11-02T00:00:00Z" }] }).ok) fail("skipped proposals count against the 2 a month");
  // 9 · the chain calls no model unless switched on, and never publishes
  let calls = 0;
  const fetchFn = async () => { calls++; return { ok: true, json: async () => ({ content: [{ text: `<p>${"We sent a cover photo to one business profile and looked at Maps. ".repeat(14)}The limits are one test in one place.</p><p><a href="/services/gbp-optimization/">Google Business Profile optimization</a></p>` }] }) }; };
  const off = await C.draftPost(ev, ctx, { enabled: false, fetchFn });
  if (off.state !== "switched_off" || calls !== 0 || off.draft) fail("with the model off, a draft still calls the model or writes text");
  const w = await C.draftPost({ ...ev, status: "waiting" }, ctx, { enabled: true, fetchFn });
  if (w.state !== "waiting" || calls !== 0) fail("a proposal that waits for its check still calls the model");
  const on = await C.draftPost(ev, ctx, { enabled: true, fetchFn });
  if (on.state !== "drafted" || on.published !== false || calls !== 1) fail(`a clean draft ends as ${on.state} after ${calls} calls`);
  const capped = await C.draftPost(ev, { ...ctx, decisions: [{ kind: "topic", made_at: "2026-11-01T00:00:00Z", proposal: { drafted: true } }, { kind: "topic", made_at: "2026-11-02T00:00:00Z", proposal: { drafted: true } }] }, { enabled: true, fetchFn });
  if (capped.state === "drafted" || calls !== 1) fail("two proposals this month do not stop a third model call");
  if (process.env.BLOG_AI_ENABLED === "1") fail("BLOG_AI_ENABLED is set in this environment; the gate cannot show the default is off");
  const blockedDraft = await C.draftPost(ev, ctx, { enabled: true, fetchFn: async () => ({ ok: true, json: async () => ({ content: [{ text: `<p>${"Our analysts guarantee it. ".repeat(40)}</p>` }] }) }) });
  if (blockedDraft.state !== "blocked" || !blockedDraft.problems.length) fail(`a draft that fails its checks ends as ${blockedDraft.state}`);
  const dflt = await C.draftPost(ev, ctx, { fetchFn });
  if (dflt.state !== "switched_off") fail("the model is on by default");
  // mechanical checks can block
  const clean = on.draft;
  const bad = (txt) => !C.checkDraft(txt, on.brief).ok;
  for (const [why, t] of [["an em dash", `${clean}<p>It worked \u2014 really.</p>`], ["a made-up team", `${clean}<p>Our analysts reviewed it.</p>`], ["a promise", `${clean}<p>We guarantee more calls.</p>`],
    ["Q&A sold as live", `${clean}<p>Answer the questions and answers on your profile.</p>`], ["FAQ markup", `${clean}<script>{"@type":"FAQPage"}</script>`], ["a placeholder", `${clean}<p>[fill in after Nov 2]</p>`],
    ["a number not in the evidence", `${clean}<p>It lifted views by 73%.</p>`], ["an unlisted link", `${clean}<a href="https://spam.example/x">x</a>`], ["a blog sold as a Maps tactic", `${clean}<p>A blog post helps your Maps ranking a lot.</p>`],
    ["no service link", clean.replace(/href="\/services[^"]*"/, 'href="/x/"')], ["too short", "<p>Short.</p>"]])
    if (!bad(t)) fail(`a draft with ${why} passes the mechanical checks`);
  if (bad(clean)) fail(`the clean draft is blocked: ${C.checkDraft(clean, on.brief).problems.join("; ")}`);
  if (/writeFile|appendFile|api\.github\.com|octokit|git push|netlify.*deploy/i.test(CSRC)) fail("the chain can write a file, push or deploy: it must never publish");
  if (/\bChris\b/.test(CSRC + SSRC)) fail("a personal name is in a served file");
  if (C.costCeiling("draft") > 1 || C.costCeiling("note") > 1) fail("the model spending cap rose above $1 a month for each use");
  // the admin press: server re-runs the gate, saves a draft, publishes nothing
  {
    const writes = [];
    const g = { now: ctx.now, gsc: { ready: false }, blog: { ready: true }, errors: [], facts: { list: [], map: { summary: { posts: 0, posts_no_link_from_another_post: 0, service_links_in: {} } } }, events: [], decisions: [], waiting: [{ id: 7, ...ev }], leads: { ready: false, rows: [] }, snaps: { ready: false, rows: [] } };
    const gate = { email: "a@b.test" };
    const card = ADM.build(g);
    if (!card.next_post || card.next_post.state !== "ready") fail("a finished proposal does not show as ready on the card");
    if (!card.rows.some((r) => r.key === "snaps" && r.tag === "Not set up")) fail("the snapshot line does not say Not set up without the table");
    const bad404 = await ADM.proposal({ evidence_id: 99, decision: "draft" }, gate, g, async () => {});
    if (bad404.status !== 404) fail("a press on a proposal that isn't the next one is accepted");
    const sk = await ADM.proposal({ evidence_id: 7, decision: "skip" }, gate, g, async (u, i) => { writes.push([u, JSON.parse(i.body)]); });
    if (sk.status !== 200 || writes[0][1].decision !== "declined") fail("skip does not record a declined proposal");
    writes.length = 0;
    const dr = await ADM.proposal({ evidence_id: 7, decision: "draft" }, gate, g, async (u, i) => { writes.push([u, JSON.parse(i.body)]); }, { enabled: false, fetchFn });
    if (dr.status !== 200 || dr.body.state !== "switched_off" || writes[0][1].proposal.published !== false || writes[0][1].proposal.draft) fail("draft with the model off wrote text or marked something published");
    const again = await ADM.proposal({ evidence_id: 7, decision: "draft" }, gate, { ...g, decisions: [{ kind: "topic", batch_key: "topic-7", decision: "proposed", proposal: {}, made_at: ctx.now.toISOString() }] }, async () => {});
    if (again.status !== 409) fail("a proposal can be pressed twice");
    const nt = await ADM.note({}, gate, g, async () => { fail("a note with nothing to explain was saved"); });
    if (nt.body.state !== "nothing_to_explain" && nt.body.state !== "switched_off") fail(`the weekly note ran with nothing to explain (${nt.body.state})`);
    if (calls !== 1) fail("a press called the model while it was off");
  }
  // 10 · the weekly note: the code owns the numbers
  const wk = { clicks: { verdict: "Trending right", current: 120, baseline: 80, reason: "Clicks rose." }, impressions: { verdict: "No clear change", current: 5000, baseline: 4900, reason: "Flat." } };
  const mk = (text) => async () => ({ ok: true, json: async () => ({ content: [{ text }]}) });
  const good = await C.weeklyNote(wk, { enabled: true, fetchFn: mk("Clicks are 120 against 80 before, so they rose. Impressions are flat at 5000 against 4900.\nAction: Keep watching the weekly numbers.") });
  if (good.state !== "written" || good.actions.length !== 1) fail(`a good note is ${good.state}`);
  for (const [why, t] of [["a number the code never gave", "Clicks are 999 now."], ["a different verdict", "The verdict is Trending wrong for clicks."], ["a promise", "This will rank #1 soon."], ["four actions", "Fine.\nAction: a\nAction: b\nAction: c\nAction: d"]])
    if ((await C.weeklyNote(wk, { enabled: true, fetchFn: mk(t) })).state !== "blocked") fail(`a note with ${why} is not blocked`);
  const none = { clicks: { verdict: "Not enough data" }, impressions: { verdict: "Hold" } }; let c10 = 0;
  if ((await C.weeklyNote(none, { enabled: true, fetchFn: async () => { c10++; return mk("x")(); } })).state !== "nothing_to_explain" || c10) fail("a note is written for a week with nothing to explain");
  if ((await C.weeklyNote(wk, { enabled: true, notesThisMonth: C.MAX_NOTES_PER_MONTH, fetchFn: async () => { c10++; } })).state !== "capped" || c10) fail("the monthly note cap does not stop a call");
  if ((await C.weeklyNote(wk, { fetchFn: async () => { c10++; } })).state !== "switched_off" || c10) fail("the note is on by default");
  // 11 · matched pairs
  const posts = Array.from({ length: 14 }, (_, i) => ({ slug: `p${i}`, kind: i % 2 ? "guide" : "template", published: "2026-01-01", clicks: 0, impressions: i }));
  const mp = C.matchedPairs(posts, { seed: "s1", now: new Date("2026-11-03T00:00:00Z") });
  if (!mp.ok || mp.applies !== false) fail("matched pairs are not planned, or claim to be applied");
  else {
    const slugs = mp.plan.pairs.flatMap((p) => [p.treated, p.held]);
    if (new Set(slugs).size !== slugs.length) fail("a post is in two pairs");
    if (JSON.stringify(C.matchedPairs(posts, { seed: "s1", now: new Date("2026-11-03T00:00:00Z") }).plan) !== JSON.stringify(mp.plan)) fail("the same seed gives a different coin flip");
    if (JSON.stringify(C.matchedPairs(posts, { seed: "s2", now: new Date("2026-11-03T00:00:00Z") }).plan.pairs) === JSON.stringify(mp.plan.pairs)) fail("the seed does not change the coin flip");
    if (mp.plan.read_on !== "2027-01-26") fail(`the read date is ${mp.plan.read_on}, not 84 days out`);
    const kinds = new Map(posts.map((p) => [p.slug, p.kind])); for (const p of mp.plan.pairs) if (kinds.get(p.treated) !== kinds.get(p.held)) fail("a pair crosses kinds");
  }
  if (C.matchedPairs(posts.slice(0, 4), { seed: "s" }).ok) fail("two pairs are enough for a test");
  if (C.matchedPairs(posts, {}).ok) fail("a test is planned with no seed");
  if (C.matchedPairs(posts.map((p) => ({ ...p, clicks: null })), { seed: "s" }).ok) fail("posts with unread clicks are paired as if they earned zero");
  // 12 · the client version
  const cp = C.clientBlogPlan;
  const veto = cp({ vetoed: true, services: [{ name: "x", path: "/a/" }], facts: [{ text: "t", source: "s" }], website: { has: true, pages: ["/a/"] } });
  if (veto.blog.allowed || veto.stages.length !== 1) fail("a veto doesn't stop everything");
  const nosite = cp({ services: [{ name: "Roofing" }], facts: [] });
  if (nosite.blog.allowed || nosite.stages[0].kind !== "website") fail("a client with no website isn't told the website comes first");
  const pagesFirst = cp({ services: [{ name: "Plumbing", path: "/plumbing/" }, { name: "Drains" }], facts: [{ text: "A job", source: "client" }], website: { has: true, pages: ["/plumbing/"] } });
  if (pagesFirst.blog.allowed || !pagesFirst.stages.some((x) => x.kind === "service_page" && x.service === "Drains")) fail("a missing service page doesn't come before a post");
  const ready = cp({ services: [{ name: "Plumbing", path: "/plumbing/" }], facts: [{ text: "A job", source: "client" }], website: { has: true, pages: ["/plumbing/"] } });
  if (!ready.blog.allowed || ready.blog.publishes_without_approval !== false || ready.blog.max_per_month !== 2) fail("a client with pages and real material doesn't get up to 2 reviewed posts");
  if (cp({ services: [{ name: "x", path: "/a/" }], facts: [{ text: "no source" }], website: { has: true, pages: ["/a/"] } }).blog.allowed) fail("a fact with no source counts as material");
  if (cp(null).blog.allowed || cp({}).blog.allowed) fail("an empty client gets a blog");
  if (/maps ranking|will (rank|bring)|guarantee/i.test(JSON.stringify(ready).replace(/"why":"No test shows[^"]*"/, ""))) fail("the client plan promises a result");
  // snapshots
  const rec = { data: { v2Campaign: { competitor_profiles: { fetched_at: "2026-10-01T00:00:00Z", profiles: [{ name: "A", rating: 4.5, reviews: 10, email: "private@x.test", website: "https://a.test" }] }, rank_grid: { keyword: "k", timestamp: "2026-10-02T00:00:00Z", competitors: [{ name: "B", appearances: 3 }], pins_read: 9, pins_total: 9 } } } };
  const cps = SNAP.copiesOf(rec);
  if (cps.length !== 2 || JSON.stringify(cps).includes("private@x.test")) fail("snapshot copies are not the two sources, or carry a private field");
  if (SNAP.copiesOf({ data: {} }).length !== 0 || SNAP.copiesOf(null).length !== 0) fail("a missing record gives copies");
  const sw = []; let net = 0;
  const sd = (had) => ({ tryRead: async () => had, ownOauth: async () => ({ client_id: "c1" }), supa: async (u, i) => { if (i && i.method === "POST") sw.push(JSON.parse(i.body)); else return [rec]; return null; }, now: new Date("2026-11-03T00:00:00Z") });
  const r1 = await SNAP.run(sd({ ready: true, rows: [] }));
  if (r1.copied !== 2 || sw.length !== 1 || r1.requests_outside !== 0) fail("the first run does not copy both sources");
  sw.length = 0;
  const r2 = await SNAP.run(sd({ ready: true, rows: cps.map((c) => ({ source: c.source, source_stamp: c.source_stamp, keyword: c.keyword })) }));
  if (r2.copied !== 0 || r2.already_had !== 2 || sw.length) fail("a rerun copies the same data again");
  const r3 = await SNAP.run(sd({ ready: false, rows: [] }));
  if (r3.table_ready !== false || !/Not set up/.test(r3.note) || sw.length) fail("no table does not say Not set up");
  if (/serpapi|api\.openai|maps\.googleapis|places\.googleapis|fetch\(/i.test(SSRC.replace(/\/\/.*$/gm, ""))) fail("the snapshot job can make an outside request");
  if (SNAP.MAX_COPIES > 10) fail("the snapshot job copies more than 10 at a time");
  if (!/blog_competitor_snapshots/.test(SQL) || !/blog_competitor_snapshots_once/.test(SQL)) fail("blog_system.sql lacks the snapshot table or its once-only index");
  if (!/\[functions\."blog-competitor-snapshot"\]\s*\n\s*schedule = "20 6 \* \* 1"/.test(TOML)) fail("the snapshot job isn't scheduled weekly in netlify.toml");
  if (!/job: "blog-competitor-snapshot"[^\n]*cron: "20 6 \* \* 1"/.test(MAN)) fail("the snapshot job isn't in the job manifest");
  if (!/withCheckin\("blog-competitor-snapshot"/.test(SSRC)) fail("the snapshot job doesn't check in");
}
// the client's blog step: up to 2 when material exists, a Monthly row, nothing published
{
  const PB = JSON.parse(read("data/playbooks/playbooks.json")), FE = read("netlify/functions/flow-execute.js");
  const row = (PB.month2plus || []).find((x) => x.id === "m2.exec.blog_posts"), seed = (PB.month1 || []).find((x) => x.id === "m1.web.blog_seed");
  if (!row || !row.hasRunner || !/up to 2/i.test(row.title)) fail("the Monthly 'Publish up to 2 blog posts' row is missing or still says a fixed number");
  else if ((PB.month2plus.findIndex((x) => x.id === row.id)) !== PB.month2plus.findIndex((x) => x.id === "m2.exec.focus_area_work") + 1) fail("the Monthly blog row isn't beside the focus-area work it came out of");
  if (!seed || !/up to 2/i.test(seed.title) || /Publish 2 seed/.test(seed.title)) fail("step 47 still promises a fixed 2 posts");
  if (/"m2\.exec\.blog_posts": async \(\{ client \}\) => blogFromMaterial\(client\)/.test(FE) === false || /"m1\.web\.blog_seed": async \(\{ client \}\) => \{\s*const r = await blogFromMaterial\(client\);/.test(FE) === false) fail("the blog steps don't both run through the same material check");
  const fn = (/async function blogFromMaterial\(client\) \{[\s\S]*?\n\}\n/.exec(FE) || [""])[0];
  if (!fn) moved("blogFromMaterial");
  if (!/clientBlogPlan/.test(fn) || !/0 posts is fine[\s\S]{0,80}outcome: "noop"/.test(fn) || !/published: false/.test(fn)) fail("the blog runner doesn't decide from material, say 0 is fine, or mark its draft unpublished");
  // website_steps_46_50_research_v1 #48 (approved 11-7): the runner READS the image step's published record (iseo.site_change / _log) for
  // first-hand photo facts. Only that read is excused; an assignment to it, or any other site_change, still fails (11-7 night fixer)
  if (/openPullRequest|api\.github\.com|GA\.|writeFile|site_change|publish_pr/.test(fn.replace(/\biseo\.site_change(?:_log)?\b(?!\s*=(?!=))/g, ""))) fail("the blog runner can put something on a client's site");
  // the upload was built 11-01 (admin_blog_step_v1): the row must say the client's yes comes first and that it only finishes read back. check-a-blog-post-goes-through-the-website-pipeline runs it.
  if (!/nothing goes up without their yes/i.test(row && row.instructions || "") || !/reads back live/i.test(row && row.instructions || "")) fail("the Monthly blog row doesn't say the client's yes comes first and it finishes only when it reads back");
  const heavy = (/const HEAVY = new Set\(\[[\s\S]*?\]\);/.exec(FE) || [""])[0];
  if (!/"m2\.exec\.blog_posts"/.test(heavy) || !/"m1\.web\.blog_seed"/.test(heavy)) fail("a blog step that writes a post runs in the foreground and can time out");
  if (!/"m2\.exec\.blog_posts":\s*\{ level: "manual"/.test(ADMJS)) fail("admin doesn't know the Monthly blog row");
}
if (F.length) { console.error(`🔴 the blog system regressed — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ blog system: 14 link rules each fire on their own case, the real blog has no failing link, verdicts refuse noise, an API error is never 'not indexed', no table = Google is asked nothing, no noindex or publishing in this build, posts and pages clean");
