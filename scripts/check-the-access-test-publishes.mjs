#!/usr/bin/env node
// check-the-access-test-publishes.mjs — 2026-10-28, Chris: "add a test page automatically… send to client portal For your approval →
// client approves → it loads to the client's website now that the access is set up… just to test the sync and loading actually
// does work". Approved website_system_v2 builds 8 (page file) + 9 (publish = pull request). RUNS:
//   · _page-file.buildPageFile on the site's REAL homepage: the new title / canonical / noindex are in, the homepage's own title,
//     headline and structured data are gone; a shell with no <main> refuses; a shell whose own words survive refuses
//   · _github-access.openPullRequest against a fake GitHub: branch from the default branch → exactly the files → a pull request;
//     no write permission, or a file that already exists → refused with NOTHING created; it never merges
//   · the wiring: the test step + its For your approval entry, the prefill (hidden page, its one file), open_pr only after the
//     client approved this version, on GitHub access, as RGA Admin; admin row 8 shows "Prove we can publish"
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let PF, GA, SC, D;
try { PF = req(`${SITE}/netlify/functions/_page-file.js`); GA = req(`${SITE}/netlify/functions/_github-access.js`); SC = req(`${SITE}/shared/site-change.js`); D = req(`${SITE}/netlify/functions/_deliverables.js`); }
catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }

// ── 1 · the page file, on the real homepage ───────────────────────────────────────────────────
const home = read("index.html"), oldTitle = PF.textOf(home, /<title[^>]*>([\s\S]*?)<\/title>/i), oldH1 = PF.textOf(home, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
const url = "https://www.rocketgrowthagency.com/rga-access-test/";
const b = PF.buildPageFile({ shellHtml: home, url, title: "Website access check | Rocket Growth Agency", description: "A test page.", mainHtml: PF.testPageMain({ headline: "This page checks that approved changes reach your website", says: "Published after you approved it." }), noindex: true });
if (b.error) fail(`the test page won't build on the real homepage (${b.error})`);
else {
  const h = b.html;
  if (!/<title>Website access check \| Rocket Growth Agency<\/title>/.test(h) || !h.includes(`<link rel="canonical" href="${url}" />`) || !/<meta name="robots" content="noindex, nofollow" \/>/.test(h)) fail("the test page's title / canonical / noindex aren't set");
  if (h.includes(oldTitle) || h.includes(oldH1) || /application\/ld\+json/.test(h)) fail("the homepage's own title, headline or structured data survived into the test page");
  if (!/<h1>This page checks that approved changes reach your website<\/h1>/.test(h)) fail("the approved headline isn't in the page");
}
if (!/no <main> area/.test(PF.buildPageFile({ shellHtml: "<html><head><title>X</title></head><body><h1>X</h1></body></html>", url, title: "T", mainHtml: "<p>a</p>" }).error || "")) fail("a shell with no <main> builds anyway (the content would have nowhere safe to go)");
if (!PF.buildPageFile({ shellHtml: "<html><head><title>Old page</title></head><body><main>x</main><div class=\"band\">Old page</div></body></html>", url, title: "New", mainHtml: "<p>n</p>" }).error) fail("a shell whose own words survive outside <main> builds anyway (city_page_design_v1's \"hvac\" band)");

// ── 2 · the pull request, against a fake GitHub ───────────────────────────────────────────────
const fake = ({ push = true, exists = false } = {}) => { const calls = []; const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  const f = async (u, init = {}) => { const m = (init.method || "GET").toUpperCase(), p = String(u).replace("https://api.github.com", ""); calls.push(`${m} ${p.split("?")[0]}`);
    if (m === "GET" && /^\/repos\/[^/]+\/[^/]+$/.test(p)) return J({ default_branch: "main", permissions: { push, pull: true } });
    if (m === "GET" && /\/contents\//.test(p)) return exists ? J({ sha: "x" }) : J({ message: "Not Found" }, 404);
    if (m === "GET" && /\/git\/ref\/heads\/main$/.test(p)) return J({ object: { sha: "abc" } });
    if (m === "POST" && /\/git\/refs$/.test(p)) return J({ ref: "refs/heads/x" }, 201);
    if (m === "PUT" && /\/contents\//.test(p)) return J({ content: {} }, 201);
    if (m === "POST" && /\/pulls$/.test(p)) return J({ number: 7, html_url: "https://github.com/o/r/pull/7" }, 201);
    if (/\/merge$/.test(p)) return J({ merged: true });
    return J({}, 404); };
  return { f, calls }; };
{ const { f, calls } = fake(); const r = await GA.openPullRequest("t", f, { repo: "o/r", branch: "rga/access-test-1", title: "T", body: "B", message: "M", files: [{ path: "rga-access-test/index.html", content: "<html>" }] });
  if (!r.ok || r.number !== 7 || r.base !== "main") fail(`the pull request isn't opened (${JSON.stringify(r)})`);
  const want = ["GET /repos/o/r", "GET /repos/o/r/contents/rga-access-test/index.html", "GET /repos/o/r/git/ref/heads/main", "POST /repos/o/r/git/refs", "PUT /repos/o/r/contents/rga-access-test/index.html", "POST /repos/o/r/pulls"];
  if (JSON.stringify(calls) !== JSON.stringify(want)) fail(`the pull request isn't branch → the approved file → PR, in that order (${calls.join(" · ")})`);
  if (calls.some((c) => /merge/.test(c))) fail("publishing merges by itself (a person merges)"); }
{ const { f, calls } = fake({ push: false }); const r = await GA.openPullRequest("t", f, { repo: "o/r", branch: "b", title: "T", body: "", message: "M", files: [{ path: "a/index.html", content: "x" }] });
  if (r.ok || r.state !== "no_write" || calls.some((c) => c.startsWith("POST") || c.startsWith("PUT"))) fail("without write permission it still writes"); }
{ const { f, calls } = fake({ exists: true }); const r = await GA.openPullRequest("t", f, { repo: "o/r", branch: "b", title: "T", body: "", message: "M", files: [{ path: "a/index.html", content: "x" }] });
  if (r.ok || r.state !== "file_exists" || calls.some((c) => c.startsWith("POST") || c.startsWith("PUT"))) fail("a file that already exists gets overwritten (a new page must never replace one)"); }

// ── 3 · the wiring ─────────────────────────────────────────────────────────────────────────────
const T = "m1.access.publish_test", def = SC.STEPS[T];
if (!def || !def.test || !def.newPage || !SC.isSiteChangeStep(T)) fail("the access test isn't a website change (new page, test)");
if (!D.CLIENT_APPROVABLE[T] || D.CLIENT_APPROVABLE[T].surface !== "website") fail("the access test isn't in the client's For your approval");
const AD = read("netlify/functions/admin-deliverables.js"), A = read("admin/admin.js");
if (!/key === "m1\.access\.publish_test"/.test(AD) || !/\/rga-access-test\//.test(AD) || !/note: "a test page, hidden from Google"/.test(AD)) fail("the test page doesn't draft itself (address + its one file)");
if (!/if \(act === "open_pr"\) \{\s*if \(st !== "approved"\) return json\(409/.test(AD)) fail("a pull request can open before the client approved this version");
if (!/if \(!acc\.repo\) return json\(409/.test(AD) || !/const me = await GA\.whoAmI\(token, fetch\);\s*if \(!me\.ok\) return json\(409, \{ error: me\.state === "no_key"/.test(AD) || !/const me = await GA\.whoAmI\(token, fetch\);\s*if \(!me\.ok\) return json\(409, \{ error: "Not signed in as RGA Admin on the server\. Nothing was merged\." \}\);/.test(AD)) fail("open_pr (or RGA's merge) runs without GitHub access, or not as RGA Admin");
if (!/noindex: true \}\);/.test(AD)) fail("the test page isn't hidden from Google");
if (!/\$\{accessDoneMiniHtml\(s\.task, ask\)\}\$\{accessTestHtml\(s\.task\)\}/.test(A) || !/Prove we can publish/.test(A)) fail("admin row 8 doesn't show \"Prove we can publish\"");
// 🔄 publish_safety_checks_v1 (10-28): the button is OFF until the six safety checks pass
if (!/data-ob-wc-pr\$\{sf && sf\.ready \? "" : " disabled"\}>Open the pull request</.test(A) || !/data-ob-wc-prstate>Check the merge</.test(A)) fail("the approved test card has no Open the pull request / Check the merge");
if (F.length) { console.error(`❌ the access test can't prove publishing — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ the access test proves publishing: the page builds on the real homepage (new title, canonical, noindex; the homepage's own words gone); a pull request is branch → exactly the approved file → PR, never merged by itself; no write / existing file → nothing written; only after the client approved, on GitHub access, as RGA Admin; row 8 shows it");
