#!/usr/bin/env node
// check-a-real-page-publishes-safely.mjs: website_system_v2 builds 8 and 9 (approved 10-28, built 11-01). RUNS the real admin + portal handlers on a fake database, a fake GitHub and fake websites. No real
// client site, repository, pull request or Google profile is touched by this gate, ever: every request ends in the fake below, and anything unexpected fails it.
//   8 · a page built from their own template: another page's words never ship, inside or outside <main>; the preview serves it, signed
//   9 · the pull request carries exactly the approved files, through every safety check; a stale edit, a changed file, a skipped snapshot or a wrong repo open nothing
//   · a builder site has no files: a preview at most, and it never stops the send
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret", URL: "https://site.test", GITHUB_ADMIN_TOKEN: "gh-fake" });
const CID = "11111111-1111-4111-8111-111111111111", K = "m1.web.priority_pages", M = "m1.web.service_location_matrix", SITEURL = "https://sparks.test";
const shell = (title, h1, band = "") => `<!doctype html><html><head><title>${title}</title><meta name="description" content="old"><link rel="canonical" href="https://sparks.test/old/"><script type="application/ld+json">{"@type":"WebPage","name":"${title}"}</script></head><body><header><a href="/">Sparks</a></header><main><h1>${h1}</h1><p>old words</p></main>${band}<footer>Sparks Electric</footer></body></html>`;
const b64 = (s) => Buffer.from(s).toString("base64");
const initial = () => ({ repo: {
    "sitemap.xml": { sha: "smap1", text: `<urlset><url><loc>${SITEURL}/</loc></url><url><loc>${SITEURL}/lighting/</loc></url></urlset>` },
    "hvac-denver/index.html": { sha: "edit1", text: `<html><head><title>HVAC Denver</title></head><body><main><h2>Why hvac in Denver lose the calls</h2><p>Keep this line.</p></main></body></html>` } },
  web: { [`${SITEURL}/`]: shell("Sparks Electric", "Your local electrician"), [`${SITEURL}/lighting/`]: shell("Lighting | Sparks", "Lighting work"), [`${SITEURL}/sitemap.xml`]: `<urlset><loc>${SITEURL}/</loc><loc>${SITEURL}/lighting/</loc></urlset>` },
  gh: [], prs: {}, prFiles: {} });
let W = initial();
const DB = { rec: { id: 7, data: { tasks: {} } } };
const ok = (b, s = 200) => new Response(s === 204 ? null : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const unexpected = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || "GET").toUpperCase();
  if (u.startsWith("https://db.test")) {
    if (u.includes("/auth/v1/user")) return ok({ id: "u1", email: "owner@sparks.test" });
    if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { DB.rec.data = JSON.parse(init.body).data; return ok(null, 204); } return ok([JSON.parse(JSON.stringify(DB.rec))]); }
    if (u.includes("/rest/v1/clients")) return ok([{ id: CID, business_name: "Sparks Electric", website_url: SITEURL, workspace_id: "w1", owner_email: "owner@sparks.test", portal_user_id: "u1", email: "owner@sparks.test" }]);
    return ok([]);
  }
  if (u.startsWith("https://api.github.com")) {
    const p = u.replace("https://api.github.com", ""), path0 = p.split("?")[0];
    W.gh.push(`${m} ${path0}`);
    if (m === "GET" && path0 === "/user") return ok({ login: "rocketgrowthagency-admin" });
    if (m === "GET" && /^\/repos\/[^/]+\/[^/]+$/.test(path0)) return ok({ default_branch: "main", permissions: { push: true, pull: true } });
    const cm = path0.match(/\/contents\/(.+)$/);
    if (cm) { const fp = decodeURIComponent(cm[1]), f = W.repo[fp];
      if (m === "GET") { if (!f) return ok({ message: "Not Found" }, 404); if ((init.headers || {}).Accept === "application/vnd.github.raw") return new Response(f.text); return ok({ sha: f.sha, content: b64(f.text) }); }
      if (m === "PUT") { W.prFiles[fp] = { body: JSON.parse(init.body), wasThere: !!f }; return ok({ content: {} }, 201); } }
    if (m === "GET" && /\/git\/ref\/heads\/main$/.test(path0)) return ok({ object: { sha: "abc" } });
    if (m === "POST" && /\/git\/refs$/.test(path0)) return ok({ ref: "x" }, 201);
    if (m === "POST" && /\/pulls$/.test(path0)) return ok({ number: 7, html_url: "https://github.com/o/r/pull/7" }, 201);
    if (m === "GET" && /\/pulls\/7\/files/.test(path0)) return ok(Object.entries(W.prFiles).map(([filename, x]) => ({ filename, status: x.wasThere ? "modified" : "added" })));
    if (m === "GET" && /\/pulls\/7$/.test(path0)) return ok({ state: "open", merged: false, head: { sha: "headsha" }, base: { ref: "main" }, html_url: "https://github.com/o/r/pull/7" });
    if (m === "PATCH" && /\/pulls\/7$/.test(path0)) { W.closed = true; return ok({ state: "closed" }); }
    if (/\/merge$/.test(path0)) return ok({ merged: true, sha: "m1" });
    return ok({ message: "Not Found" }, 404);
  }
  if (u.startsWith("https://sparks.test") || u.startsWith("https://www.sparks.test")) { const k = u.replace(/\?.*$/, ""); return W.web[k] !== undefined ? new Response(W.web[k], { status: 200 }) : new Response("nope", { status: 404 }); }
  unexpected.push(`${m} ${u.slice(0, 80)}`);
  return new Response("no", { status: 599 });
};
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let adminH, previewH, PF, SC;
try { adminH = req(path.join(SITE, "netlify/functions/admin-deliverables.js")).handler; previewH = req(path.join(SITE, "netlify/functions/site-preview.js")).handler; PF = req(path.join(SITE, "netlify/functions/_page-file.js")); SC = req(path.join(SITE, "shared/site-change.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const adm = async (b) => { const r = await adminH({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret" }, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };
const url = `${SITEURL}/panel-upgrades/`;
const draft = { kind: "visible", page_url: url, new_page: true, searches: ["panel upgrades springfield"], files: [{ path: "panel-upgrades/index.html", action: "add", note: "the new page" }, { path: "sitemap.xml", action: "edit", note: "adds" }, { path: "not-there/index.html", action: "edit", note: "adds one link" }],
  items: [{ label: "Page title", role: "title", after: "Panel upgrades | Sparks" }, { label: "Description under the title", role: "description", after: "Panel work." }, { label: "Main headline", after: "Panel upgrades in Springfield" }, { label: "Opening", after: "We replace panels.\n\nWe pull permits when a job needs them." },
    { label: "Areas named", check: false, after: "Springfield, Chatham" }, { label: "Questions answered", check: false, after: "Do you pull permits?\nWhen a job needs one." }, { label: "A real result", after: "Replaced a failed panel in one day." }, { label: "Main button", after: "Call Sparks" }] };
const reset = (acc = { repo: "o/r", confirmed_at: "2026-10-01T00:00:00Z", github: "rocketgrowthagency-admin" }) => { W = initial(); DB.rec.data = { tasks: { "m1.access.website": { access: acc } }, site_snapshot: { at: new Date().toISOString(), read: 2, found: 2, pages: [{ url: `${SITEURL}/`, read: true, title: "Sparks Electric" }] } }; };
const approve = () => { const t = DB.rec.data.tasks[K]; t.approval = { decision: "approved", change_v: t.site_change.v, at: new Date().toISOString(), by: "owner@sparks.test", approved_change: t.site_change, approved_build: (t.site_build.files || []).map((f) => ({ path: f.path, action: f.action, sha: f.sha })) }; };

// ── 8 · the build ────────────────────────────────────────────────────────────────────────────
reset();
let r = await adm({ key: K, site_action: "save", change: draft });
if (r.s !== 200) fail(`a page draft doesn't save (${r.s} ${r.j.error || ""})`);
r = await adm({ key: K, internal_decision: "approved" });
if (r.s !== 200) fail(`a clean page isn't built and sent (${r.s} ${r.j.error || ""})`);
const T = () => DB.rec.data.tasks[K];
const bld = T()?.site_build;
if (!bld) { console.error(`❌ nothing was built: ${JSON.stringify(r.j).slice(0, 200)}`); process.exit(1); }
const page = bld.files.find((f) => f.path === "panel-upgrades/index.html");
if (!page || !page.html || page.action !== "add") fail("the new page isn't built as a file");
if (page) {
  const h = page.html;
  if (!h.includes("<title>Panel upgrades | Sparks</title>") || !h.includes('<link rel="canonical" href="https://sparks.test/panel-upgrades/" />') || !h.includes("Panel upgrades in Springfield") || !h.includes("We pull permits when a job needs them.") || !h.includes("Replaced a failed panel in one day.")) fail("the approved lines aren't in the page");
  if (/noindex/i.test(h)) fail("a real page is hidden from Google");
  if (h.includes("Lighting work") || h.includes("Your local electrician") || h.includes("old words") || h.includes('"name":"Lighting')) fail("another page's words survive");
  if (!h.includes("<header>") || !h.includes("Sparks Electric</footer>")) fail("the page lost their own header and footer");
  const ld = (h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  try { const j = JSON.parse(ld); if (j["@type"] !== "WebPage" || /address|aggregateRating/i.test(ld)) fail("the structured data claims more than the record holds"); } catch { fail("the page's structured data doesn't parse"); }
  if (!/Call Sparks<\/a>/.test(h) || /href="\/contact\/"/.test(h)) fail("the button goes to an address nobody checked");
}
const sm = bld.files.find((f) => f.path === "sitemap.xml");
if (!sm || sm.action !== "edit" || sm.base_sha !== "smap1" || !sm.content.includes(`<loc>${url}</loc>`) || !sm.content.includes(`${SITEURL}/lighting/`)) fail("the sitemap isn't one new line on their own file");
if (bld.files.some((f) => f.path === "not-there/index.html") || T().site_change.files.some((f) => f.path === "not-there/index.html")) fail("a file their repository doesn't have is still listed for approval");
if (!bld.preview_url) fail("there's no private preview link");
const q = new URL(`https://x.test${bld.preview_url}`).searchParams;
{ DB.rec.data.tasks[K] = T(); const pv = await previewH({ queryStringParameters: { c: q.get("c"), v: q.get("v"), s: q.get("s") } });
  if (pv.statusCode !== 200 || !/noindex/.test(pv.headers["X-Robots-Tag"]) || !pv.body.includes("Panel upgrades in Springfield")) fail("the private preview doesn't serve the built page, unindexed");
  const bad = await previewH({ queryStringParameters: { c: q.get("c"), v: q.get("v"), s: "0".repeat(32) } });
  if (bad.statusCode !== 403) fail("a preview link with a wrong signature opens"); }
if (W.gh.some((c) => /^(PUT|POST|PATCH|DELETE) /.test(c))) fail("building a page wrote to GitHub");

// the shell's own words outside <main>
const band = '<div class="band">Ready to rank your hvac business in Denver?</div>';
if (!PF.buildPageFile({ shellHtml: shell("A", "B", band), url, title: "T", mainHtml: "<p>n</p>", referenceHtml: shell("H", "I") }).error) fail("the template's own words outside <main> ship on the new page");
if (PF.buildPageFile({ shellHtml: shell("A", "B", band), url, title: "T", mainHtml: "<p>n</p>", referenceHtml: shell("H", "I", band) }).error) fail("words every page shares are treated as one page's");
if (!PF.buildPageFile({ shellHtml: shell("Zeta Page", "Yotta Head", '<div>A long sentence that belongs to this one page and no other</div>'), url, title: "T", mainHtml: "<p>n</p>", referenceHtml: "" }).error) fail("with no second page to compare, a long line outside <main> still ships");
const nameFoot = PF.buildPageFile({ shellHtml: shell("Sparks Electric", "Yotta Head"), url, title: "T", mainHtml: "<p>n</p>", referenceHtml: "" });
if (nameFoot.error) fail(`a home page whose whole title is the business name won't build, because the footer says the name too (${nameFoot.error})`);
{ reset(); W.web[`${SITEURL}/`] = shell("Sparks Electric", "Your local electrician", band); W.web[`${SITEURL}/lighting/`] = shell("Lighting | Sparks", "Lighting work", '<div>Only on lighting, a long line about lighting</div>');
  await adm({ key: K, site_action: "save", change: draft }); r = await adm({ key: K, internal_decision: "approved" });
  if (r.s !== 409 || !/couldn't be built, so nothing was sent/.test(r.j.error || "") || T().internal_review) fail(`a page that can only carry another page's words was sent (${r.s})`); }

// ── 9 · the pull request ─────────────────────────────────────────────────────────────────────
const toApproved = async () => { reset(); await adm({ key: K, site_action: "save", change: draft }); await adm({ key: K, internal_decision: "approved" }); approve(); W.web[`${SITEURL}/CNAME`] = "x"; W.repo.CNAME = { sha: "c", text: "sparks.test" }; };
await toApproved();
r = await adm({ key: K, site_action: "open_pr" });
if (r.s !== 200) fail(`an approved page doesn't open its pull request (${r.s} ${r.j.error || ""})`);
else {
  const paths = Object.keys(W.prFiles).sort().join(" ");
  if (paths !== "panel-upgrades/index.html sitemap.xml") fail(`the pull request isn't exactly the approved files (${paths})`);
  if (W.prFiles["sitemap.xml"].body.sha !== "smap1") fail("the sitemap edit doesn't name the file it edits");
  if (W.prFiles["panel-upgrades/index.html"].body.sha) fail("a new page carries a sha, so it could replace a file");
  if (Buffer.from(W.prFiles["panel-upgrades/index.html"].body.content, "base64").toString() !== T().site_build.files[0].html) fail("what uploads isn't the approved build, byte for byte");
  if (!T().publish_before || T().publish_pr.number !== 7) fail("the before-snapshot or the pull request isn't recorded");
  if (!Buffer.from(W.prFiles["sitemap.xml"].body.content, "base64").toString().includes(`<loc>${url}</loc>`)) fail("the sitemap edit uploads nothing");
}
// a file of theirs that moved after approval is never overwritten
await toApproved(); W.repo["sitemap.xml"].sha = "smap2";
r = await adm({ key: K, site_action: "open_pr" });
if (r.s === 200 || !/changed on main after the client approved/.test(r.j.error || "")) fail(`a file that changed after approval is overwritten (${r.s} ${r.j.error || ""})`);
// a new page never replaces a file that's there
await toApproved(); W.repo["panel-upgrades/index.html"] = { sha: "theirs", text: "<html>theirs</html>" };
r = await adm({ key: K, site_action: "open_pr" });
if (r.s === 200 || Object.keys(W.prFiles).length) fail("a new page replaces a file they already have");
// a build that isn't what they approved
await toApproved(); T().site_build.files[0].sha = "tampered";
r = await adm({ key: K, site_action: "open_pr" });
if (r.s === 200 || Object.keys(W.prFiles).length) fail("a build that isn't what the client approved uploads");
// no before-snapshot
await toApproved(); DB.rec.data.site_snapshot = null;
r = await adm({ key: K, site_action: "open_pr" });
if (r.s === 200 || Object.keys(W.prFiles).length) fail("a pull request opens with no before-snapshot");
// not approved
reset(); await adm({ key: K, site_action: "save", change: draft }); await adm({ key: K, internal_decision: "approved" });
r = await adm({ key: K, site_action: "open_pr" });
if (r.s === 200 || Object.keys(W.prFiles).length) fail("a pull request opens before the client approves");
// the wrong website: the page is on another domain
reset(); await adm({ key: K, site_action: "save", change: { ...draft, page_url: "https://other-business.test/panel-upgrades/" } }); await adm({ key: K, internal_decision: "approved" });
if (T().site_build) { approve(); W.repo.CNAME = { sha: "c", text: "sparks.test" }; r = await adm({ key: K, site_action: "open_pr" }); if (r.s === 200 || Object.keys(W.prFiles).length) fail("a pull request opens for a page on another website"); }
// a line edit on a homepage still publishes by hand
reset(); DB.rec.data.tasks["m1.web.h1_cta"] = { site_change: { v: "a", kind: "visible", items: [{ label: "Main headline", after: "x" }] }, approval: { decision: "approved", change_v: "a" } };
r = await adm({ key: "m1.web.h1_cta", site_action: "open_pr" });
if (r.s !== 409 || !/Publish this one by hand/.test(r.j.error || "")) fail(`a change that isn't a page opens a pull request (${r.s})`);

// ── 15 · an edit: only the approved lines ───────────────────────────────────────────────────
const edit = { edits_page: true, kind: "visible", page_url: `${SITEURL}/hvac-denver/`, files: [{ path: "hvac-denver/index.html", action: "edit" }], items: [{ label: "Line 1", before: "Why hvac in Denver lose the calls", after: "Why HVAC companies in Denver lose calls" }] };
reset(); r = await adm({ key: M, site_action: "save", change: edit });
if (r.s !== 200) fail(`an edit doesn't save (${r.s} ${r.j.error || ""})`);
r = await adm({ key: M, internal_decision: "approved" });
if (r.s !== 200) fail(`an edit isn't built (${r.s} ${r.j.error || ""})`);
{ const f = DB.rec.data.tasks[M]?.site_build?.files?.[0];
  if (!f || f.action !== "edit" || f.base_sha !== "edit1" || !f.html.includes("Why HVAC companies in Denver lose calls") || !f.html.includes("Keep this line.") || f.html.includes("Why hvac")) fail("an edit isn't only the approved line, on their own file"); }
reset(); W.repo["hvac-denver/index.html"].text = "<html><head><title>x</title></head><body><main><p>Someone rewrote this page.</p></main></body></html>";
await adm({ key: M, site_action: "save", change: edit }); r = await adm({ key: M, internal_decision: "approved" });
if (r.s !== 409) fail("an edit to a line that's gone is sent anyway");

// ── a builder site: no files, a preview at most, and it never stops the send ─────────────────
const builder = { ...draft, files: [{ path: "panel-upgrades/", action: "add", note: "the new page" }] };
reset({}); await adm({ key: K, site_action: "save", change: builder }); r = await adm({ key: K, internal_decision: "approved" });
if (r.s !== 200 || !T().site_build || !T().site_build.preview_only) fail(`a builder site's page isn't sent with a preview (${r.s} ${r.j.error || ""})`);
if (W.gh.length) fail("a builder site touches GitHub");
reset({}); W.web[`${SITEURL}/`] = "<html><head><title>No main</title></head><body><div>Everything in a div</div></body></html>"; W.web[`${SITEURL}/lighting/`] = W.web[`${SITEURL}/`];
await adm({ key: K, site_action: "save", change: builder }); r = await adm({ key: K, internal_decision: "approved" });
if (r.s !== 200 || T().site_build) fail(`a builder page that can't be previewed stops the send (${r.s} ${r.j.error || ""})`);
r = await adm({ key: K, site_action: "open_pr" });
if (r.s === 200) fail("a builder site opens a pull request");
if (unexpected.length) fail(`a request left the fakes: ${unexpected.slice(0, 3).join(" · ")}`);

if (F.length) { console.error(`❌ a real page publishes safely: ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ a real page publishes safely: built from their own template (no other page's words), exactly the approved files by pull request, a file of theirs that moved is never overwritten, every refusal opens nothing, a builder site gets a preview at most. All on fakes.");
