#!/usr/bin/env node
// check-a-blog-post-goes-through-the-website-pipeline.mjs: approved admin_blog_step_v1, changed to "up to 2 when material exists". RUNS the real runner, admin and portal handlers on a fake database, a
// fake GitHub, a fake website and a fake model. No client site, repository, pull request, Google profile or model is touched by this gate, ever: every request ends in the fake below, anything unexpected fails it.
//   · no material = 0 posts, and that's fine. A fact already on a post isn't used again. 2 a month is the most. A post on its way stops a third.
//   · the model's answer is data: prose, an invented number or price, or a link to a page they don't have is no draft
//   · where a post goes comes from the check: found / asked first / couldn't check. A "none" or "couldn't check" drafts nothing until a person answers
//   · ONE PATH: built, sent, only the client's yes to that exact version, the pull request holds only the approved files, merged, read back word for word, done
//   · the Monthly row's post lives on the setup record, reads its draft from the row's run, and a month's record can't lose it
//   · RGA's own blog: one press plus someone reading it. A client's record refuses that press on the server
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import crypto from "node:crypto"; import path from "node:path"; import fs from "node:fs"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret", URL: "https://site.test", GITHUB_ADMIN_TOKEN: "gh-test", ANTHROPIC_API_KEY: "model-test", SUPABASE_WORKSPACE_ID: "w1" });
// integrations_hardening_v1 (11-11): only RGA's GitHub app acts on a repository (GITHUB_ADMIN_TOKEN retired), so the fake GitHub has the app installed on o/r
const APP_PEM = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" });
const CID = "11111111-1111-4111-8111-111111111111", S = "m1.web.blog_seed", M = "m1.web.blog_post", SITEURL = "https://sparks.test", RESULT = "We rewired a 1950s house in 3 days.", QUOTE = "They showed up on time and left it clean.";
const ok = (b, s = 200) => new Response(s === 204 ? null : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const shell = (title, h1, extra = "") => `<!doctype html><html><head><title>${title}</title><meta name="description" content="old"><link rel="canonical" href="https://sparks.test/old/"></head><body><header>Sparks</header><main><h1>${h1}</h1><p>old words</p>${extra}</main><footer>Sparks Electric</footer></body></html>`;
const SENT = ["The panel in the hallway was warm to the touch when we arrived.", "Cloth wiring ran through the attic and nobody had looked at it in decades.", "We started by mapping every circuit on paper before opening a single wall.", "The kitchen shared one breaker with the laundry, which explains the tripping.", "Plaster walls take patience, so most of the new runs went through closets.", "A dryer on an old fuse box is a common surprise in homes of that age.", "Grounded outlets came next, room by room, with the family still living there.", "Each evening the power was back on before dinner, because people have lives.", "The inspector walked through on the final morning and signed off without notes.", "Old houses hide a lot behind baseboards, and this one was no exception.", "Someone had spliced a lamp cord into a junction box years before the owners bought it.", "That single splice was the reason we recommend looking before you buy anything new.", "Dimmers in the dining room were swapped for ones rated to the actual load.", "Outside, the service mast had rusted through at the roofline and needed replacing.", "We coordinated with the utility so the street connection only went dark for an hour.", "New breakers are labeled in plain words, so anyone can find the right one at night.", "Smoke alarms now talk to each other, which older wiring never allowed.", "The basement got its own subpanel, leaving room for a future workshop.", "Dust is the real enemy on a job like this, so plastic sheeting stayed up throughout.", "Homeowners often ask whether every wire has to go, and the honest answer is no.", "Newer runs from a past remodel tested fine, so those stayed exactly where they were.", "Knowing what to leave alone saves more money than any discount ever could.", "If your lights flicker when the fridge kicks on, that is worth a look.", "A warm switch plate deserves a call too, even if nothing seems wrong yet.", "Most of this work is invisible once the walls are patched and painted.", "What changes is that the house stops surprising the people who live in it.", "Bring up older wiring early if you are planning a kitchen project this year.", "Remodels are the cheapest moment to fix it, because the walls are already open."];
let sentAt = 0;
const para = (n) => Array.from({ length: n }, () => SENT[sentAt++ % SENT.length]).join(" ");
const good = () => ({ title: "Rewiring a 1950s house", description: "What we found behind the walls of a 1950s house.", slug: "rewiring-a-1950s-house", headline: "Rewiring a 1950s house", sections: [{ heading: "What we found", paragraphs: [`${RESULT} ${para(14)}`] }, { heading: "What it means for an older home", paragraphs: [para(14)] }], link: { label: "Our panel upgrade work", path: "/panel-upgrades/" } });
let MODEL = null, modelCalls = 0;
const initial = () => ({ repo: { "sitemap.xml": { sha: "smap1", text: `<urlset><url><loc>${SITEURL}/</loc></url><url><loc>${SITEURL}/panel-upgrades/</loc></url><url><loc>${SITEURL}/blog/</loc></url><url><loc>${SITEURL}/blog/old-post/</loc></url></urlset>` }, "blog/index.html": { sha: "hub1", text: `<html><body><main><h1>Blog</h1></main></body></html>` }, CNAME: { sha: "c", text: "sparks.test" } },
  web: { [`${SITEURL}/`]: shell("Sparks Electric", "Your local electrician"), [`${SITEURL}/panel-upgrades/`]: shell("Panels | Sparks", "Panel work"), [`${SITEURL}/blog/`]: shell("Blog | Sparks", "Blog"), [`${SITEURL}/blog/old-post/`]: shell("An old post", "An old post"),
    [`${SITEURL}/sitemap.xml`]: `<urlset><url><loc>${SITEURL}/</loc></url><url><loc>${SITEURL}/panel-upgrades/</loc></url><url><loc>${SITEURL}/blog/</loc></url><url><loc>${SITEURL}/blog/old-post/</loc></url></urlset>`, [`${SITEURL}/robots.txt`]: "" }, gh: [], prFiles: {} });
let W = initial();
const DB = { rec: { id: 7, data: { tasks: {} } }, month: { id: 9, data: { tasks: {} } }, client: null };
const unexpected = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || "GET").toUpperCase();
  if (u.startsWith("https://db.test")) {
    if (u.includes("/storage/v1/object/raw-store/secrets/github-app-private-key.pem")) return new Response(APP_PEM, { status: 200 });
    if (u.includes("/auth/v1/user")) return ok({ id: "u1", email: (init.headers && (init.headers.Authorization || init.headers.authorization) || "").includes("rga") ? "someone@rocketgrowthagency.com" : "owner@sparks.test" });
    if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { DB.rec.data = JSON.parse(init.body).data; return ok(null, 204); } return ok([JSON.parse(JSON.stringify(DB.rec))]); }
    if (u.includes("/rest/v1/client_monthly_records")) { if (m === "PATCH") { DB.month.data = JSON.parse(init.body).data; return ok(null, 204); } return ok([JSON.parse(JSON.stringify(DB.month))]); }
    if (u.includes("/rest/v1/profiles")) return ok([{ workspace_id: "w1", role: "owner" }]);
    if (u.includes("/rest/v1/client_portal_access")) return ok(u.includes("owner%40sparks.test") ? [{ client_id: CID, portal_email: "owner@sparks.test" }] : []);
    if (u.includes("/rest/v1/clients")) return ok([DB.client]);
    return ok([]);
  }
  if (u.startsWith("https://api.anthropic.com")) { modelCalls++; return ok({ content: [{ text: typeof MODEL === "string" ? MODEL : JSON.stringify(MODEL) }], usage: {} }); }
  if (u.startsWith("https://api.github.com")) {
    const p = u.replace("https://api.github.com", ""), path0 = p.split("?")[0];
    // the app's own sign-in (minting its key for o/r) is not a write to their repository, so it stays out of W.gh
    if (m === "GET" && path0 === "/repos/o/r/installation") return ok({ id: 42 });
    if (m === "POST" && path0 === "/app/installations/42/access_tokens") return ok({ token: "ghs_app" }, 201);
    W.gh.push(`${m} ${path0}`);
    if (m === "GET" && path0 === "/user") return ok({ login: "rocketgrowthagency-admin" });
    if (m === "GET" && /^\/repos\/[^/]+\/[^/]+$/.test(path0)) return ok({ default_branch: "main", permissions: { push: true, pull: true } });
    const cm = path0.match(/\/contents\/(.+)$/);
    if (cm) { const fp = decodeURIComponent(cm[1]), f = W.repo[fp];
      if (m === "GET") { if (!f) return ok({ message: "Not Found" }, 404); if ((init.headers || {}).Accept === "application/vnd.github.raw") return new Response(f.text); return ok({ sha: f.sha, content: Buffer.from(f.text).toString("base64"), encoding: "base64" }); }
      if (m === "PUT") { W.prFiles[fp] = { body: JSON.parse(init.body), wasThere: !!f }; return ok({ content: {} }, 201); } }
    if (m === "GET" && /\/git\/ref\/heads\/main$/.test(path0)) return ok({ object: { sha: "abc" } });
    if (m === "POST" && /\/git\/refs$/.test(path0)) return ok({ ref: "x" }, 201);
    if (m === "POST" && /\/pulls$/.test(path0)) return ok({ number: 7, html_url: "https://github.com/o/r/pull/7" }, 201);
    if (m === "GET" && /\/pulls\/7\/files/.test(path0)) return ok(Object.entries(W.prFiles).map(([filename, x]) => ({ filename, status: x.wasThere ? "modified" : "added" })));
    if (m === "GET" && /\/pulls\/7$/.test(path0)) return ok({ state: "open", merged: false, head: { sha: "headsha" }, base: { ref: "main" }, html_url: "https://github.com/o/r/pull/7" });
    if (/\/merge$/.test(path0)) return ok({ merged: true, sha: "m1" });
    if (m === "DELETE") return ok(null, 204);
    return ok({ message: "Not Found" }, 404);
  }
  if (u.startsWith("https://sparks.test") || u.startsWith("https://www.rocketgrowthagency.com")) { const k = u.replace(/\?.*$/, ""); return W.web[k] !== undefined ? new Response(W.web[k], { status: 200 }) : new Response("nope", { status: 404 }); }
  unexpected.push(`${m} ${u.slice(0, 80)}`);
  return new Response("no", { status: 599 });
};
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let adminH, portalH, previewH, FE, BP, SC, AB;
try { adminH = req(path.join(SITE, "netlify/functions/admin-deliverables.js")).handler; portalH = req(path.join(SITE, "netlify/functions/portal-deliverables.js")).handler; previewH = req(path.join(SITE, "netlify/functions/site-preview.js")).handler;
  FE = req(path.join(SITE, "netlify/functions/flow-execute.js")); BP = req(path.join(SITE, "netlify/functions/_blog-post.js")); SC = req(path.join(SITE, "shared/site-change.js")); AB = req(path.join(SITE, "netlify/functions/admin-blog.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
if (typeof FE.blogFromMaterial !== "function") { console.error("⚠️  INDETERMINATE: the runner isn't exported"); process.exit(2); }
const adm = async (b, headers = { "x-internal-secret": "gate-secret" }) => { const r = await adminH({ httpMethod: "POST", headers, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };
const client = (x = {}) => ({ id: CID, business_name: "Sparks Electric", website_url: SITEURL, primary_service: "Panel upgrades", primary_market: "Springfield", workspace_id: "w1", owner_email: "owner@sparks.test", portal_user_id: "u1", email: "owner@sparks.test", ...x });
const reset = ({ result = RESULT, quote = null, blog = { verdict: "found", url: `${SITEURL}/blog/`, at: "2026-10-01T00:00:00Z", via: "pasted" }, access = { repo: "o/r", confirmed_at: "2026-10-01T00:00:00Z", github: "rocketgrowthagency-admin" }, cl = {} } = {}) => { W = initial(); MODEL = good(); modelCalls = 0; DB.client = client(cl); DB.month.data = { tasks: {} };
  DB.rec.data = { tasks: { "m1.access.website": { access }, "m1.access.publish_test": { site_change: { v: "t1" }, published: { v: "t1", at: "2026-10-01T00:00:00Z" } }, "m1.web.page_proof": { client_input: result || quote ? { result, quote } : {} }, [S]: { blog_check: blog }, "m1.strategy.keywords_locations": { auto_result: { summary: "KEYWORDS:\n- \"panel upgrade springfield\"\nLOCATIONS:\n- Springfield" }, status: "done" } },
    site_snapshot: { at: new Date().toISOString(), read: 2, found: 2, site: "sparks.test", pages: [{ url: `${SITEURL}/`, read: true, title: "Sparks Electric", h1: "Your local electrician" }] } }; };
const T = (k = S) => DB.rec.data.tasks[k];
const run = async () => FE.blogFromMaterial(DB.client);
const portalDecide = async (key, decision, v, note) => { const r = await portalH({ httpMethod: "POST", headers: { authorization: "Bearer client" }, body: JSON.stringify({ client_id: CID, key, decision, change_v: v, ...(note ? { note } : {}) }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };

// ── pure pieces ──────────────────────────────────────────────────────────────────────────────
if (!BP.parsePostDraft("Here's a post: TITLE: Rewiring").error) fail("a model's prose is read as a post");
if (!BP.parsePostDraft(JSON.stringify({ title: "x" })).error) fail("a draft with no body is read as a post");
const facts = [{ text: RESULT, source: "them" }], paths = ["/panel-upgrades/"];
if (BP.checkPost(good(), { facts, servicePaths: paths }).length) fail(`a clean post is refused: ${BP.checkPost(good(), { facts, servicePaths: paths }).join(" ")}`);
const withWords = (extra) => { const p = good(); p.sections[0].paragraphs.push(extra); return p; };
if (!BP.checkPost(withWords("We raised their leads by 40% this year."), { facts, servicePaths: paths }).length) fail("an invented percentage passes");
if (!BP.checkPost(withWords("A rewire like this costs $450."), { facts, servicePaths: paths }).length) fail("an invented price passes");
if (!BP.checkPost(withWords("We guarantee you will rank first."), { facts, servicePaths: paths }).length) fail("a promised result passes");
if (!BP.checkPost(withWords("It was hard — really."), { facts, servicePaths: paths }).length) fail("an em dash passes");
if (!BP.checkPost(withWords("A blog helps your Maps rankings."), { facts, servicePaths: paths }).length) fail("a blog sold as a Maps tactic passes");
if (!BP.checkPost({ ...good(), link: { label: "x", path: "/not-theirs/" } }, { facts, servicePaths: paths }).length) fail("a link to a page they don't have passes");
if (!BP.checkPost({ ...good(), sections: [{ heading: "", paragraphs: ["Too short."] }] }, { facts, servicePaths: paths }).length) fail("a post of a few words passes");
for (const [blog, name] of [[{ verdict: "couldnt" }, "couldn't check"], [{ verdict: "none" }, "none, not asked"], [{ verdict: "found" }, "found, no blog page"], [null, "never checked"]]) if (!BP.placeOf(blog, SITEURL).why) fail(`a post is placed when the check says ${name}`);
if (BP.placeOf({ verdict: "found", url: `${SITEURL}/news` }, SITEURL).base !== `${SITEURL}/news/`) fail("a post doesn't go on the blog the check found");
if (!BP.placeOf({ verdict: "none", new_blog_ok: { by: "x" } }, SITEURL).makes_blog) fail("a post with a blog page RGA asked about doesn't say so");
if (BP.isOwnSite({ website_url: "https://rocketgrowthagency.com.evil.test" }) || BP.isOwnSite({ website_url: "https://sparks.test/rocketgrowthagency.com" }) || BP.isOwnSite({}) || !BP.isOwnSite({ website_url: "www.rocketgrowthagency.com" })) fail("RGA's own site is read from anything but the record's own host");
if (SC.COPY_STEPS.length) fail("a page or post can still finish on approved copy, not live");
for (const k of [S, M]) { if (!SC.isSiteChangeStep(k) || !SC.STEPS[k].post || !SC.STEPS[k].page) fail(`${k} isn't a website change`); }

// ── the runner: material, the cap, the place ─────────────────────────────────────────────────
reset({ result: null, quote: null }); let r = await run();
if (r.outcome !== "noop" || modelCalls || !/0 posts is fine/.test(r.summary)) fail(`no material isn't a fine 0 (${r.outcome}, ${modelCalls} model calls)`);
reset(); r = await run();
if (modelCalls !== 1 || !r.outcome_data || !r.outcome_data.page_draft) fail(`real material doesn't make a draft (${r.outcome}: ${String(r.summary).slice(0, 120)})`);
else {
  const d = r.outcome_data.page_draft;
  if (d.url !== `${SITEURL}/blog/rewiring-a-1950s-house/`) fail(`a post's address doesn't come from their blog (${d.url})`);
  if (r.outcome_data.published !== false) fail("the run says it published");
  if (!d.files.some((f) => f.path === "blog/rewiring-a-1950s-house/index.html" && f.action === "add") || !d.files.some((f) => f.path === "sitemap.xml") || !d.files.some((f) => f.path === "blog/index.html" && f.action === "edit")) fail(`the post doesn't name its files (${JSON.stringify(d.files)})`);
  if (!(d.material || []).includes(RESULT)) fail("the draft doesn't record the material it used");
  if (d.page_of) fail("one fact promises a second post");
}
reset({ quote: QUOTE }); r = await run();
if (!(r.outcome_data.page_draft || {}).page_of || r.outcome_data.page_draft.page_of.of !== 2) fail("two facts don't make up to 2 posts");
reset(); MODEL = "Sure! Here's your blog post."; r = await run();
if (!(r.outcome_data.problems || []).length || r.outcome_data.page_draft) fail("a model's prose makes a draft");
reset(); MODEL = { ...good(), sections: [{ heading: "Results", paragraphs: [`We grew their calls by 73% in a month. ${para(10)}`] }] }; r = await run();
if (!(r.outcome_data.problems || []).length || r.outcome_data.page_draft) fail("an invented number makes a draft");
reset(); MODEL = { ...good(), slug: "old-post" }; r = await run();
if (!(r.outcome_data.problems || []).length) fail("a post can take an address the site already has");
reset({ access: {} }); r = await run();
if (r.outcome !== "blocked" || modelCalls) fail("a client with no website access is drafted a post that can't go up");
reset({ access: { repo: "o/r", confirmed_at: "2026-10-01T00:00:00Z", removed_at: "2026-10-02T00:00:00Z" } }); r = await run();
if (r.outcome !== "blocked" || modelCalls) fail("a client who removed RGA's access is drafted a post");
reset({ cl: { website_url: "" } }); r = await run();
if (r.outcome !== "blocked" || modelCalls) fail("a client with no website is drafted a post");
// where it goes: nothing is drafted until a person has answered. The check runs again before each draft (the fake site has no blog at the other address).
reset({ blog: { verdict: "couldnt", at: "x" } }); delete W.web[`${SITEURL}/`]; W.web = {}; r = await run();
if (modelCalls || r.outcome !== "noop" && r.outcome !== "indeterminate") fail(`a site we can't read is drafted a post (${r.outcome})`);
for (const blog of [{ verdict: "couldnt", via: "pasted", at: "x" }, { verdict: "none", via: "pasted", at: "x" }, { verdict: "found", url: null, via: "pasted", at: "x" }]) { reset({ blog }); r = await run(); if (modelCalls || r.outcome !== "indeterminate") fail(`a post with nowhere to go is drafted (${blog.verdict}: ${r.outcome}, ${modelCalls} model calls)`); }

// ── ONE PATH: run → prefill → build → the client's yes → pull request → merge → read back ───
const toSent = async (k = S) => { reset(); const o = await run(); const ran = { auto_result: o, outcome_data: o.outcome_data, ran_at: new Date().toISOString() };
  if (k === M) DB.month.data.tasks["m2.exec.blog_posts"] = ran; else DB.rec.data.tasks[k] = { ...(DB.rec.data.tasks[k] || {}), ...ran };
  const p = await adm({ key: k, site_action: "prefill" }); const sv = await adm({ key: k, site_action: "save", change: p.j.change }); if (sv.s !== 200) fail(`a post doesn't save (${sv.s} ${sv.j.error || ""})`); const se = await adm({ key: k, internal_decision: "approved" }); if (se.s !== 200) fail(`a post isn't built and sent (${se.s} ${se.j.error || ""})`); return p.j.change; };
const pre = await toSent();
if (T().site_change.label !== "add_page") fail("a post isn't labeled Adding a page");
if (!T().site_change.material.includes(RESULT)) fail("the saved change loses the material it used");
const bld = T().site_build, file = bld && bld.files.find((f) => f.path === "blog/rewiring-a-1950s-house/index.html");
if (!file || !file.html.includes("<h2>What we found</h2>") || !file.html.includes(RESULT)) fail("the post isn't built as a real page with its headings");
if (file && (/old words|Your local electrician|Panel work/.test(file.html) || !file.html.includes("<header>"))) fail("another page's words survive on the post, or it lost their header");
if (file) { const ld = JSON.parse((file.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || "{}"); if (ld["@type"] !== "BlogPosting" || ld.author?.name !== "Sparks Electric" || /aggregateRating|address/.test(JSON.stringify(ld))) fail("the post's structured data isn't a BlogPosting by the business"); }
if (file && /noindex/i.test(file.html)) fail("a post is hidden from Google");
if (W.gh.some((c) => /^(PUT|POST|PATCH|DELETE) /.test(c))) fail("building a post wrote to GitHub");
if (!SC.missingOnPage(T().site_change, file ? file.html : "").length === false) fail("the built post doesn't read back word for word");
if (!bld) { console.error(`🔴 nothing was built: ${F.join(" · ")}`); process.exit(1); }
{ const q = new URL(`https://x.test${bld.preview_url}`).searchParams, pv = await previewH({ queryStringParameters: { c: q.get("c"), v: q.get("v"), s: q.get("s") } });
  if (pv.statusCode !== 200 || !pv.body.includes(RESULT)) fail("the private preview doesn't serve the built post"); }
let x = await adm({ key: S, site_action: "open_pr" });
if (x.s === 200 || Object.keys(W.prFiles).length) fail("a pull request opens before the client says yes");
x = await adm({ key: S, site_action: "publish" });
if (x.s === 200) fail("Mark live works before the client says yes");
x = await adm({ key: S, site_action: "own_approve", read: true }, { authorization: "Bearer rga" });
if (x.s !== 403 || T().approval) fail(`RGA's press approves a post on a client's site (${x.s})`);
const v = T().site_change.v;
x = await portalDecide(S, "approved", "an-old-version");
if (x.s === 200 || T().approval) fail("a client's yes to another version counts");
x = await portalDecide(S, "approved", v);
if (x.s !== 200 || T().approval?.change_v !== v || !T().approval?.approved_build?.length) fail(`the client's yes isn't recorded with the build it covers (${x.s} ${x.j.error || ""})`);
// an edit after approval means they approve again
x = await adm({ key: S, site_action: "open_pr" });
if (x.s !== 200) fail(`an approved post doesn't open its pull request (${x.s} ${x.j.error || ""})`);
else {
  const got = Object.keys(W.prFiles).sort().join(" ");
  if (got !== "blog/index.html blog/rewiring-a-1950s-house/index.html sitemap.xml") fail(`the pull request isn't exactly the approved files (${got})`);
  if (Buffer.from(W.prFiles["blog/rewiring-a-1950s-house/index.html"].body.content, "base64").toString() !== file.html) fail("what uploads isn't the approved build, byte for byte");
}
x = await adm({ key: S, site_action: "publish" });
if (x.s === 200) fail("Mark live works before the merge");
x = await adm({ key: S, site_action: "merge_pr" });
if (x.s !== 200) fail(`RGA can't merge the approved post (${x.s} ${x.j.error || ""})`);
x = await adm({ key: S, site_action: "publish" });
if (x.s === 200) fail("Mark live passes when the post isn't on their site");
W.web[`${SITEURL}/blog/rewiring-a-1950s-house/`] = file ? file.html.replace(RESULT, "Different words") : "";
x = await adm({ key: S, site_action: "publish" });
if (x.s === 200) fail("Mark live passes when the live post's words aren't the approved ones");
W.web[`${SITEURL}/blog/rewiring-a-1950s-house/`] = file ? file.html : "";
W.web[`${SITEURL}/sitemap.xml`] = W.repo["sitemap.xml"].text.replace("</urlset>", `<url><loc>${SITEURL}/blog/rewiring-a-1950s-house/</loc></url></urlset>`);
x = await adm({ key: S, site_action: "publish" });
if (x.s !== 200 || T().published?.checked !== true || T().status !== "done" || !T().published?.fingerprint?.match) fail(`a post on their site doesn't finish the step, read back (${x.s} ${x.j.error || ""} ${T().status})`);
if (SC.changeState(T()) !== "live") fail("a read-back post isn't live");
const listed = await portalH({ httpMethod: "POST", headers: { authorization: "Bearer client" }, body: JSON.stringify({ client_id: CID }) }).then((z) => JSON.parse(z.body || "{}"));
if (!(listed.deliverables || []).some((d) => d.key === S && d.site_state === "live")) fail("a live post doesn't show in what the client sees");
if (SC.postsThisMonth(DB.rec.data.tasks).live !== 1) fail("a live post doesn't count this month");
r = await run();
if (modelCalls > 2 || r.outcome !== "noop" || !/already on a post/.test(r.summary)) fail(`the same fact is written up twice (${r.outcome}, ${String(r.summary).slice(0, 80)})`);

// no-file builders: no repository, a preview at most, the client still approves, RGA publishes by hand, and it still reads back
reset({ access: { confirmed_at: "2026-10-01T00:00:00Z", platform: "wix" } });
{ const o = await run(); T().auto_result = o; T().outcome_data = o.outcome_data; const p = await adm({ key: S, site_action: "prefill" }); await adm({ key: S, site_action: "save", change: p.j.change }); const se = await adm({ key: S, internal_decision: "approved" });
  if (se.s !== 200) fail(`a builder site's post isn't sent (${se.s} ${se.j.error || ""})`);
  if (T().site_change.files.some((f) => /index\.html$/.test(f.path))) fail("a builder site is told a repository file changes");
  await portalDecide(S, "approved", T().site_change.v); const op = await adm({ key: S, site_action: "open_pr" });
  if (op.s === 200) fail("a builder site opens a pull request"); }

// a site the check found no blog on, once RGA asked: the blog page goes with the post, and the post is the first file
reset({ blog: { verdict: "none", new_blog_ok: { by: "x", at: "y" }, at: "z", via: "pasted" } });
delete W.repo["blog/index.html"]; W.repo["sitemap.xml"].text = `<urlset><url><loc>${SITEURL}/</loc></url><url><loc>${SITEURL}/panel-upgrades/</loc></url></urlset>`; W.web[`${SITEURL}/sitemap.xml`] = W.repo["sitemap.xml"].text; delete W.web[`${SITEURL}/blog/`];
{ const o = await run(), d = o.outcome_data.page_draft || {}; if (!d.makes_blog || !(d.files || []).some((f) => f.path === "blog/index.html" && f.action === "add")) fail("a new blog page isn't part of the change the client approves");
  T().auto_result = o; T().outcome_data = o.outcome_data; const p = await adm({ key: S, site_action: "prefill" }); await adm({ key: S, site_action: "save", change: p.j.change }); const se = await adm({ key: S, internal_decision: "approved" });
  const fs0 = (T().site_build || {}).files || [];
  if (se.s !== 200 || fs0[0]?.path !== "blog/rewiring-a-1950s-house/index.html" || !fs0.some((f) => f.path === "blog/index.html" && f.html && f.html.includes("/blog/rewiring-a-1950s-house/"))) fail(`the blog page isn't built after the post (${se.s} ${se.j.error || ""})`); }

// ── the Monthly row's post ───────────────────────────────────────────────────────────────────
reset(); { const o = await run(); DB.month.data.tasks["m2.exec.blog_posts"] = { auto_result: o, outcome_data: o.outcome_data, ran_at: new Date().toISOString() };
  const p = await adm({ key: M, site_action: "prefill" });
  if (!p.j.change || !(p.j.change.items || []).some((i) => i.label === "The post" && i.after.includes(RESULT))) fail("the Monthly post doesn't read its draft from the row's run");
  const sv = await adm({ key: M, site_action: "save", change: p.j.change }), se = await adm({ key: M, internal_decision: "approved" });
  if (sv.s !== 200 || se.s !== 200 || !T(M).site_build) fail(`the Monthly post doesn't save and build on the setup record (${sv.s} ${se.s} ${se.j.error || ""})`);
  if (DB.month.data.tasks["m2.exec.blog_posts"].site_change) fail("the Monthly post was written to the month's record, where the month's end would lose it");
  const listed2 = await portalH({ httpMethod: "POST", headers: { authorization: "Bearer client" }, body: JSON.stringify({ client_id: CID }) }).then((z) => JSON.parse(z.body || "{}"));
  if (!(listed2.deliverables || []).some((d) => d.key === M && d.site_state === "sent")) fail("the Monthly post doesn't reach the client's For your approval");
  const mon = await adm({ monthly: true, key: M, site_action: "save", change: p.j.change });
  if (mon.s === 200) fail("a website change saves on a month's record");
  r = await run();
  if (r.outcome !== "noop" || !/on its way/.test(r.summary)) fail("a post on its way doesn't stop a third"); }
{ const now = new Date().toISOString(), rec = (mat) => ({ change: { v: mat, material: [mat], page_url: "x" }, published: { v: mat, at: now } });
  reset({ quote: QUOTE }); DB.rec.data.tasks[M] = { site_change_log: [rec("a"), rec("b")] }; r = await run();
  if (r.outcome !== "noop" || !/most is 2/.test(r.summary) || modelCalls) fail(`a third post in a month is drafted (${r.outcome})`);
  reset({ quote: QUOTE }); DB.rec.data.tasks[M] = { site_change_log: [{ change: { v: "a", material: [], page_url: "x" }, published: { v: "a", at: "2020-01-01T00:00:00Z" } }] };
  if (SC.postsThisMonth(DB.rec.data.tasks).live !== 0) fail("last month's post counts against this month"); }
// next post: only a live one moves on; the finished one is kept
reset(); await toSent(M); x = await adm({ key: M, site_action: "next_page" });
if (x.s === 200) fail("the next post starts while one is with the client");
T(M).published = { v: T(M).site_change.v, at: new Date().toISOString() };
x = await adm({ key: M, site_action: "next_page" });
if (x.s !== 200 || T(M).site_change || (T(M).site_change_log || []).length !== 1) fail(`the next post doesn't keep the finished one (${x.s} ${x.j.error || ""})`);

// ── RGA's own blog: one press plus someone reading it ────────────────────────────────────────
{ const brief = { title: "Does a new logo show up on Google Maps?", slug: "does-a-new-logo-show-up", service: "/services/gbp-optimization/", evidence: { limits: "one business, one test" } };
  const draft = `<p>${para(9)} We tested this on one business, so that is the limit of what it shows.</p><p><a href="/services/gbp-optimization/">Google profile work</a></p>`;
  const proposal = { state: "drafted", brief, draft, evidence_block: "<aside>The evidence</aside>", problems: [] };
  const g = (over = {}) => ({ blog: { ready: true }, oauth: { client_id: CID }, decisions: [{ kind: "topic", batch_key: "topic-5", decision: "proposed", proposal }], ...over });
  const own = { id: CID, website_url: "https://www.rocketgrowthagency.com" }, gateU = { email: "someone@rocketgrowthagency.com" };
  const calls = []; const pipeline = async (b) => { calls.push(b.site_action || `internal:${b.internal_decision}`); return { status: 200, body: { ok: true } }; };
  let o = await AB.ownPublish({ evidence_id: 5 }, gateU, g(), {}, { client: own, pipeline });
  if (o.status === 200 || calls.length) fail("RGA's own post publishes with nobody having read it");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g(), {}, { client: DB.client, pipeline });
  if (o.status === 200 || calls.length) fail("the own-blog press works on a client's record");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g({ decisions: [{ kind: "topic", batch_key: "topic-5", decision: "proposed", proposal: { ...proposal, state: "switched_off", draft: null } }] }), {}, { client: own, pipeline });
  if (o.status === 200 || calls.length) fail("a brief with no draft can be published");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g({ decisions: [{ kind: "topic", batch_key: "topic-5", decision: "proposed", proposal: { ...proposal, state: "blocked" } }] }), {}, { client: own, pipeline });
  if (o.status === 200 || calls.length) fail("a draft a check blocked can be published");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g({ decisions: [{ kind: "topic", batch_key: "topic-5", decision: "proposed", proposal: { ...proposal, draft: `${draft}<p>We will rank you first and guarantee more calls.</p>` } }] }), {}, { client: own, pipeline });
  if (o.status === 200 || calls.length) fail("a draft that fails its checks gets through because someone read it");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g({ decisions: [{ kind: "topic", batch_key: "topic-5", decision: "proposed", proposal: { ...proposal, draft: `${draft}<script>x()</script>` } }] }), {}, { client: own, pipeline });
  if (o.status === 200 || calls.length) fail("a draft carrying code gets through");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g({ own_post: { site_change: { v: "1" }, internal_review: { decision: "approved", change_v: "1" } } }), {}, { client: own, pipeline });
  if (o.status === 200 || calls.length) fail("a new own post overwrites one already on its way");
  o = await AB.ownPublish({ evidence_id: 5, read: true }, gateU, g(), {}, { client: own, pipeline });
  if (o.status !== 200 || calls.join(",") !== "save,internal:approved,own_approve") fail(`the press doesn't walk the pipeline's own steps (${o.status} ${o.body.error || ""}: ${calls.join(",")})`);
  // through the real handler: only a person, only RGA's record, only what was built
  reset({ cl: { website_url: "https://www.rocketgrowthagency.com" } }); W.web["https://www.rocketgrowthagency.com/"] = shell("Rocket Growth Agency", "Local SEO"); W.web["https://www.rocketgrowthagency.com/blog/old/"] = shell("Old", "Old post"); W.web["https://www.rocketgrowthagency.com/sitemap.xml"] = `<urlset><url><loc>https://www.rocketgrowthagency.com/</loc></url><url><loc>https://www.rocketgrowthagency.com/blog/old/</loc></url></urlset>`;
  const mc = BP.ownChange(proposal, "https://www.rocketgrowthagency.com").change;
  if (!mc) fail("a clean own draft doesn't make a change");
  else { const sv = await adm({ key: M, site_action: "save", change: mc });
    x = await adm({ key: M, site_action: "own_approve", read: true }, { authorization: "Bearer rga" });
    if (x.s === 200) fail("own approve works on a post that hasn't been built");
    const se = await adm({ key: M, internal_decision: "approved" });
    if (sv.s !== 200 || se.s !== 200) fail(`the own post doesn't build (${sv.s} ${se.s} ${se.j.error || ""})`);
    x = await adm({ key: M, site_action: "own_approve", read: true });
    if (x.s === 200) fail("the own press works with no person behind it");
    x = await adm({ key: M, site_action: "own_approve" }, { authorization: "Bearer rga" });
    if (x.s === 200) fail("the own press works without saying someone read it");
    const keepBuild = T(M).site_build; delete T(M).site_build;
    x = await adm({ key: M, site_action: "own_approve", read: true }, { authorization: "Bearer rga" });
    if (x.s === 200) fail("own approve works with no build to cover");
    T(M).site_build = keepBuild;
    x = await adm({ key: M, site_action: "own_approve", read: true }, { authorization: "Bearer rga" });
    const ap = T(M).approval || {};
    if (x.s !== 200 || ap.decision !== "approved" || ap.read_by !== "someone@rocketgrowthagency.com" || ap.change_v !== T(M).site_change.v || !ap.approved_build?.length) fail(`the own press doesn't record who read which build (${x.s} ${x.j.error || ""})`);
    const built = T(M).site_build.files[0]; if (!built.html.includes('class="bp-body"') || !built.html.includes("Rocket Growth Agency")) fail("RGA's own post isn't built in its blog's markup, by the business"); }
}

// ── the screens ──────────────────────────────────────────────────────────────────────────────
const A = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
const card = A.slice(A.indexOf("function blogLoopHtml"), A.indexOf("function formTrackingAdminHtml"));
if (!/0 is fine/.test(card) || !/siteChangeAdminHtml\(key/.test(card)) fail("the blog card doesn't hand the post to the pipeline's own card, or lost that 0 is fine");
if (/"m1\.web\.blog_seed" \? blogCheckAdminHtml\(t\)[\s\S]{0,2500}isSiteChangeStep/.test(A) === false) fail("step 47 reaches the plain website card before its blog check");
if (!/"m2\.exec\.blog_posts" \? oncBlogCardHtml\(t\)/.test(A)) fail("the Monthly row doesn't draw the post");
if (!/\.\.\.\(def\.post \? \{ material: v\.material/.test(A)) fail("editing a post's lines loses the material it used");
const OW = A.slice(A.indexOf("async function blogOwnPublish"), A.indexOf("function syncBlogCard"));
if (!/own_publish/.test(OW) || !/open_pr/.test(OW) || !/merge_pr/.test(OW) || !/throw new Error/.test(OW)) fail("the own-blog press doesn't stop at the first stop that refuses");
if (!/data-bl-own-publish="[^"]*\$\{[^}]*\}" disabled|data-bl-own-publish="\$\{escapeAttribute\(n\.id\)\}" disabled/.test(A) || !/go\.disabled = !rd\.checked/.test(A)) fail("the own-blog button works before anyone says they read it");
if (/[—–]/.test(card.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) fail("a dash in the blog card's words");
const BPS = fs.readFileSync(path.join(SITE, "netlify/functions/_blog-post.js"), "utf8");
if (/openPullRequest|api\.github\.com|writeFile|git push/.test(BPS)) fail("the blog post helper can write somewhere");
if (unexpected.length) fail(`a request left the fakes: ${unexpected.slice(0, 3).join(" · ")}`);
if (F.length) { console.error(`🔴 the blog post loop regressed: ${F.length}\n${F.map((m) => `   · ${m}`).join("\n")}`); process.exit(1); }
console.log("✅ a blog post goes through the website pipeline: material or 0, 2 a month, one fact once, built, only the client's yes to that version, exact files, merged, read back; the Monthly post survives the month; RGA's own needs someone reading it and a client's record refuses that press. Stubs only.");
process.exit(0);
