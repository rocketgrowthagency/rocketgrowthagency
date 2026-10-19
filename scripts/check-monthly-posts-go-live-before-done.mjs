#!/usr/bin/env node
// check-monthly-posts-go-live-before-done.mjs — batch 4 item 8 (approved m2-10 "Posted", 2026-10-19).
// Monthly "Post 4 GBP updates" was Done when drafted while nothing posted; a legacy push linked every client's button to
// RGA's site. Now: structured draft → client approval freezes the posts → one goes live per week → read back → Done only
// when every approved post is LIVE. RUNS the real _gbp-posts.js against a fake Google listing + fake database.
//   exit 0 = holds · 1 = a post can be skipped, doubled, mis-linked, or the step done early · 2 = harness
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`;
const req = createRequire(`${FNS}/x.js`);
const F = [], fail = (m) => F.push(m);
process.env.GOOGLE_OAUTH_CLIENT_ID = "id"; process.env.GOOGLE_OAUTH_CLIENT_SECRET = "s";
globalThis.__rgaFetchDeadlineInstalled = true;
let gp;
try { for (const k of Object.keys(req.cache)) if (k.startsWith(FNS)) delete req.cache[k]; gp = req("./_gbp-posts.js"); }
catch (e) { console.error(`harness: cannot load _gbp-posts.js — ${e.message}`); process.exit(2); }
const ledgerPath = req.resolve("./_change-ledger.js");
const ledger = [];
req.cache[ledgerPath] = { id: ledgerPath, filename: ledgerPath, loaded: true, exports: { recordChange: async (c) => { ledger.push(c); } } };

const POSTS = [1, 2, 3, 4].map((w) => ({ type: "update", headline: `Headline ${w}`, body: `Body of post ${w}.`, cta: w === 2 ? "Call now" : "Learn more", photo: null }));
// ── parse: free text never becomes posts ──
{ const ok = gp.parsePosts(`Here you go:\n${JSON.stringify(POSTS)}`);
  if (!ok.posts || ok.posts.length !== 4 || ok.posts[3].week !== 4) fail("a valid 4-post JSON draft isn't parsed into 4 weekly posts");
  if (gp.parsePosts("WEEK 1 / Update / Headline…").posts) fail("prose is accepted as posts");
  if (gp.parsePosts(JSON.stringify(POSTS.slice(0, 3))).posts) fail("3 posts are accepted as the month's 4");
  if (gp.parsePosts(JSON.stringify([{ ...POSTS[0], headline: "x".repeat(70) }, ...POSTS.slice(1)])).posts) fail("an over-long headline is accepted");
  if (gp.parsePosts(JSON.stringify([{ ...POSTS[0], cta: "Book" }, ...POSTS.slice(1)])).posts?.[0]?.cta) fail("a 'Book' button (no booking page we stand behind) survives the parse"); }
// ── the button goes to THIS client's site, never RGA's ──
{ const c = gp.ctaFor({ cta: "Learn more" }, { website_url: "Acme-Plumbing.com/" });
  if (!c || c.url !== "https://acme-plumbing.com") fail(`"Learn more" doesn't go to the client's own site (${JSON.stringify(c)})`);
  if (gp.ctaFor({ cta: "Learn more" }, { website_url: "" })) fail("a client with no website gets a Learn more button to somewhere");
  if (JSON.stringify(gp.ctaFor({ cta: "Call now" }, {})) !== '{"actionType":"CALL"}') fail("Call now isn't Google's CALL action");
  const legacy = fs.readFileSync(`${FNS}/v2-push-gbp-content.js`, "utf8");
  if (!/if \(type === "posts"\) return \{ statusCode: 410/.test(legacy)) fail("the legacy push (RGA's URL on every client's post) can still publish posts"); }
// ── the queue: week n due 7(n−1) days in, never before the approval ──
{ const q = gp.queueFrom(gp.parsePosts(JSON.stringify(POSTS)).posts, "2026-11-01", "2026-11-10T12:00:00Z");
  if (q[0].due !== "2026-11-10T12:00:00.000Z" || q[1].due !== "2026-11-10T12:00:00.000Z") fail("a post is due before the client approved it");
  if (q[2].due !== "2026-11-15T15:00:00.000Z" || q[3].due !== "2026-11-22T15:00:00.000Z") fail(`weeks 3–4 aren't due in their weeks (${q[2].due}, ${q[3].due})`); }

// ── a fake Google listing + database, and the real runForClient ──
function world({ approved = true, listFails = false, refuse = false, preexisting = false } = {}) {
  const w = { posts: [], calls: [], rec: null };
  const queue = gp.queueFrom(gp.parsePosts(JSON.stringify(POSTS)).posts, "2026-11-01", "2026-11-01T00:00:00Z");
  w.rec = { id: "r1", data: { other: 1, tasks: { "m2.exec.gbp_posts": { status: "in_progress", approval: { decision: approved ? "approved" : "changes_requested" }, post_queue: queue }, "m2.other": { status: "done" } } } };
  if (preexisting) w.posts.push({ name: "accounts/1/locations/2/localPosts/OLD", summary: `Headline 1\n\nBody of post 1.`, state: "LIVE" });
  w.fetch = async (u, init = {}) => {
    const url = String(u), m = (init.method || "GET").toUpperCase(); w.calls.push(`${m} ${url}`);
    const j = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    if (url.includes("oauth2.googleapis.com")) return j({ access_token: "t", expires_in: 3600 });
    if (url.endsWith("/localPosts?pageSize=20")) return listFails ? j({}, 500) : j({ localPosts: w.posts });
    if (url.endsWith("/localPosts") && m === "POST") {
      if (refuse) return j({ error: { message: "summary violates policy" } }, 400);
      const body = JSON.parse(init.body); const p = { ...body, name: `accounts/1/locations/2/localPosts/P${w.posts.length + 1}`, state: "PROCESSING" };
      w.posts.push(p); return j(p);
    }
    if (url.includes("/localPosts/")) { const p = w.posts.find((x) => url.endsWith(x.name)); return p ? j({ ...p, state: w.liveAll ? "LIVE" : p.state, searchUrl: "https://g.test/p" }) : j({}, 404); }
    return j({}, 404);
  };
  w.supa = async (path, init = {}) => {
    if (path.startsWith("/client_monthly_records")) { if ((init.method || "GET") === "PATCH") { w.rec = { ...w.rec, data: JSON.parse(init.body).data }; return []; } return [w.rec]; }
    if (path.startsWith("/clients")) return [{ id: "c1", business_name: "Acme", website_url: "acme.com" }];
    if (path.startsWith("/client_google_oauth")) return (init.method || "GET") === "PATCH" ? [] : [{ client_id: "c1", refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }];
    return [];
  };
  return w;
}
const T = (w) => w.rec.data.tasks["m2.exec.gbp_posts"];
const run = (w, o = {}) => gp.runForClient({ supa: w.supa, clientId: "c1", fetchFn: w.fetch, now: new Date(o.now || "2026-11-02T16:00:00Z"), force: !!o.force });
{ const w = world({ approved: false }); const r = await run(w, { force: true });
  if (w.calls.some((c) => c.includes("localPosts"))) fail("a month whose approval was withdrawn (changes requested) still posts to Google"); if (!r.skipped) fail("an unapproved month isn't reported as nothing to post"); }
{ const w = world(); await run(w);
  if (w.posts.length !== 1) fail(`one run posted ${w.posts.length} posts (one per run, week 1 only)`);
  if (w.posts[0]?.callToAction?.url !== "https://acme.com") fail(`the live post's button goes to ${w.posts[0]?.callToAction?.url}, not the client's site`);
  if (T(w).status === "done") fail("one post processing marks the step done");
  { const w1 = world(); await run(w1); w1.liveAll = true; await run(w1);
    if (T(w1).post_queue[0].status !== "live") fail("the read-back doesn't record a post Google shows as LIVE");
    if (T(w1).status === "done") fail("ONE live post (of 4) marks the step done"); }
  if (T(w).post_queue[0].status !== "processing" || !T(w).post_queue[0].post_name) fail("the posted week isn't recorded with Google's name");
  if (w.rec.data.other !== 1 || w.rec.data.tasks["m2.other"]?.status !== "done") fail("saving the posts step overwrote the rest of the month's record");
  if (!ledger.some((l) => l.field === "post:week1" && l.source === "gbp-posts")) fail("a live post isn't in the change ledger");
  await run(w); if (w.posts.length !== 1) fail("week 2 posted before it was due (or week 1 posted twice)");
  const r3 = await run(w, { force: true }); if (w.posts.length !== 2) fail(`"Post the next one now" didn't post the next one (${JSON.stringify(r3).slice(0, 120)})`);
  w.liveAll = true; await run(w, { force: true }); await run(w, { force: true }); const last = await run(w, { force: true });
  if (w.posts.length !== 4) fail(`all 4 weeks didn't post (${w.posts.length})`);
  if (T(w).status !== "done" || T(w).outcome_data?.posts_live !== 4) fail(`4 LIVE posts don't finish the step (${T(w).status}, ${T(w).outcome_data?.posts_live} live; ${JSON.stringify(last).slice(0, 100)})`);
  const again = await run(w, { force: true }); if (w.posts.length !== 4 || !again.skipped) fail("a finished month posts again"); }
{ const w = world({ preexisting: true }); await run(w);
  if (w.posts.length !== 1 || T(w).post_queue[0].post_name !== "accounts/1/locations/2/localPosts/OLD") fail("a post already on Google (a run that died before saving) is published a second time"); }
{ const w = world({ listFails: true }); await run(w);
  if (w.calls.some((c) => c.startsWith("POST") && c.endsWith("/localPosts"))) fail("it posts blind when Google won't list the existing posts (could double-post)"); }
{ const w = world({ refuse: true }); await run(w); await run(w, { force: true }); await run(w, { force: true }); await run(w, { force: true });
  const q0 = T(w).post_queue[0];
  if (q0.status !== "failed" || q0.attempts > gp.MAX_ATTEMPTS) fail(`a refused post isn't stopped after one 400 / ${gp.MAX_ATTEMPTS} tries (${q0.status}, ${q0.attempts})`);
  if (T(w).status === "done") fail("a refused post lets the step finish"); }
// ── the surfaces ──
const src = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");
const pd = src("netlify/functions/portal-deliverables.js"), fe = src("netlify/functions/flow-execute.js"), admin = src("admin/admin.js"), toml = src("netlify.toml");
if (!/key === "m2\.exec\.gbp_posts" && decision === "approved"[\s\S]{0,700}?gp\.renderPosts\(posts\) === draftFrom\(tasks\[key\]\)[\s\S]{0,300}?approved_posts = posts[\s\S]{0,200}?post_queue = gp\.queueFrom/.test(pd)) fail("approval doesn't freeze the exact posts the client saw into the queue");
if (!/"m2\.exec\.gbp_posts": async[\s\S]{0,2600}?parsePosts\(raw\)[\s\S]{0,600}?outcome_data: \{ draft, posts,/.test(fe)) fail("the runner no longer stores the posts as data with the client's draft");
if (!/t\?\.approval\?\.decision === "approved" && Array\.isArray\(t\.post_queue\)/.test(fe)) fail("the runner can redraft under an approval");
if (!/"m2\.exec\.gbp_posts": \{\s*proof: \(d, m2\) =>[^\n]*every\(\(x\) => x\.status === "live"\)/.test(admin)) fail("Monthly posts' Done isn't guarded by every post being live");
if (!/\[functions\."gbp-posts-sweep"\]\s*\n\s*schedule = /.test(toml)) fail("nothing runs the weekly posting (gbp-posts-sweep has no schedule)");
if (F.length) { console.error("🔴 Monthly Google posts can be done without going live:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Monthly posts: JSON draft → approval freezes the posts → one a week → read back → Done only at 4 LIVE · client's own site on the button · never doubled · refused stops · legacy path retired");
