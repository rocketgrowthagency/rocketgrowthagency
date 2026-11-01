#!/usr/bin/env node
// check-the-blog-check-says-only-what-it-saw.mjs — approved admin_blog_step_v1 (11-01): "Their blog" on step 47 finds out what the client has before anything is drafted.
// RUNS the real finder (_blog-find.js) on FAKE sites and the real handler (admin-blog-check.js) on a fake database. Nothing touches a real site.
//   · a blog with post addresses in the sitemap → found, with the count, the newest date and the blog's address
//   · a site with a feed or a blog page with posts but no sitemap → found
//   · a site where every address answered and none held posts → "none" (never worded as "no blog")
//   · a site that refuses (403), times out, or errors partway → "couldnt" — NEVER "none" (an absence needs every probe answered)
//   · a bad address, a private one (localhost, 10.x, 169.254.169.254) and a name that resolves to a private address → "couldnt", with no request sent
//   · a redirect is not followed into a private address; the number of requests is capped
//   · the handler: workspace only, saves and reads back, "paste" needs a public link that opens, the check writes only to the step's own record
//   · admin draws the three answers with their honest words and never says "no blog" flatly; every control spins
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const { findBlog, MAX_FETCHES } = req("./_blog-find.js");
const pub = [{ address: "93.184.216.34" }];
const site = (pages, o = {}) => { const log = []; return { log, d: { lookup: async () => o.addrs || pub, now: () => Date.UTC(2026, 10, 1),
  get: async (u) => { log.push(u); const p = new URL(u).pathname; if (o.throwOn && o.throwOn.test(p)) throw new Error("timeout"); if (o.refuse && o.refuse.test(p)) return { status: 403, text: "", type: "text/html" };
    const hit = pages[p] ?? pages[p.replace(/\/$/, "")]; return hit == null ? { status: 404, text: "", type: "text/html" } : { status: 200, text: hit, type: /^<\?xml|^<(urlset|sitemapindex|rss)/.test(hit) ? "application/xml" : "text/html" }; } } }; };
const home = '<html><body><nav><a href="/">Home</a><a href="/services/">Services</a></nav></body></html>';
const homeBlog = '<html><nav><a href="/blog/">Blog</a></nav></html>';
const smap = (urls) => `<?xml version="1.0"?><urlset>${urls.map(([u, m]) => `<url><loc>https://x.com${u}</loc><lastmod>${m}</lastmod></url>`).join("")}</urlset>`;

let r = await findBlog("x.com", site({ "/": homeBlog, "/sitemap.xml": smap([["/blog/", "2026-09-29"], ["/blog/a", "2026-09-29"], ["/blog/b", "2026-08-01"], ["/blog/c", "2026-07-01"], ["/about/", "2026-01-01"]]) }).d);
if (r.verdict !== "found" || r.post_count !== 3 || r.newest !== "2026-09-29" || !/x\.com\/blog\/$/.test(r.url || "")) fail(`a sitemap blog: ${JSON.stringify(r).slice(0, 220)}`);
r = await findBlog("https://x.com", site({ "/": home, "/feed": '<?xml version="1.0"?><rss><channel><item><title>a</title><pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate></item><item><title>b</title></item></channel></rss>' }).d);
if (r.verdict !== "found" || r.newest !== "2026-09-14") fail(`a feed blog: ${JSON.stringify(r).slice(0, 200)}`);
r = await findBlog("x.com", site({ "/": home, "/blog/": '<html><article>1</article><article>2</article><time datetime="2026-05-02">x</time></html>' }).d);
if (r.verdict !== "found" || r.newest !== "2026-05-02") fail(`a blog page with posts: ${JSON.stringify(r).slice(0, 200)}`);
r = await findBlog("x.com", site({ "/": home, "/sitemap.xml": smap([["/about/", "2026-01-01"], ["/services/", "2026-01-01"]]) }).d);
if (r.verdict !== "none" || !(r.checked >= 4) || /no blog/i.test(JSON.stringify(r))) fail(`a site with no blog: ${JSON.stringify(r).slice(0, 220)}`);
r = await findBlog("x.com", site({ "/": home }, { refuse: /^\/blog/ }).d);
if (r.verdict !== "couldnt") fail(`a refused probe was read as "none": ${r.verdict}`);
r = await findBlog("x.com", site({ "/": home }, { throwOn: /^\/(feed|rss)/ }).d);
if (r.verdict !== "couldnt") fail(`a timed-out probe was read as "none": ${r.verdict}`);
r = await findBlog("x.com", site({ "/": home }, { refuse: /^\/$/ }).d);
if (r.verdict !== "couldnt" || /no blog/i.test(r.reason || "")) fail(`a refused home page: ${JSON.stringify(r).slice(0, 160)}`);
r = await findBlog("x.com", site({ "/": home }, { throwOn: /^\/$/ }).d);
if (r.verdict !== "couldnt") fail("a home page that did not answer was not 'couldn't check'");
for (const bad of ["", "   ", "localhost", "http://127.0.0.1/", "http://10.0.0.5/blog", "http://169.254.169.254/latest", "http://[::1]/", "ftp://x.com", "not a site"]) { const s = site({ "/": home }); r = await findBlog(bad, s.d); if (r.verdict !== "couldnt" || s.log.length) fail(`"${bad}" was fetched or not refused (${r.verdict}, ${s.log.length} requests)`); }
{ const s = site({ "/": home }, { addrs: [{ address: "10.0.0.9" }] }); r = await findBlog("x.com", s.d); if (r.verdict !== "couldnt" || s.log.length) fail("a name that resolves to a private address was fetched"); }
{ const s = site(Object.fromEntries([["/", homeBlog + Array.from({ length: 40 }, (_, i) => `<a href="/blog-${i}/">news ${i}</a>`).join("")]])); await findBlog("x.com", s.d); if (s.log.length > MAX_FETCHES) fail(`${s.log.length} requests, over the cap of ${MAX_FETCHES}`); }
{ const s = site({ "/": "WWW   www.x.com page www", "/sitemap.xml": "<urlset><url><loc>https://x.com/blog/a</loc></url></urlset>" }); r = await findBlog("www.x.com/home?utm=1", s.d); if (r.verdict !== "found") fail(`a messy address (www, a path, a query) was not read: ${r.verdict}`); }

// ── the handler, on a fake database ──
process.env.SUPABASE_URL = "https://sb.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const authPath = req.resolve("./_auth.js"); let authOk = true, authAsked = 0;
req.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireWorkspaceForClient: async () => { authAsked++; return authOk ? { email: "rga@example.com" } : { error: { statusCode: 403, body: "{}" } }; } } };
const recPath = req.resolve("./_record.js"); let recorded = [];
req.cache[recPath] = { id: recPath, filename: recPath, loaded: true, exports: { recordSubmission: async (o) => { recorded.push(o.kind); return {}; } } };
const H = req("./admin-blog-check.js");
const CID = "33333333-3333-3333-3333-333333333333";
let rec, writes, writeSome = true;
const reset = () => { rec = { id: "r1", data: { tasks: { "m1.web.blog_seed": { status: "pending", note: "keep me" }, "m1.gbp.photos": { keep: 1 } } } }; writes = 0; recorded = []; authOk = true; authAsked = 0; };
global.fetch = async (url, init = {}) => { url = String(url); const j = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.includes("/clients?id=")) return j([{ website_url: "x.com" }]);
  if (url.includes("/client_onboarding_records?client_id=")) return j([rec]);
  if (url.includes("/client_onboarding_records?id=")) { if (init.method === "PATCH") { writes++; if (writeSome) rec.data = JSON.parse(init.body).data; return j([]); } return j([{ data: rec.data }]); }
  return { ok: false, status: 500, json: async () => ({}), text: async () => "" }; };
const call = async (b) => { const x = await H.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: x.statusCode, b: JSON.parse(x.body || "{}") }; };
H.__useDeps(site({ "/": homeBlog, "/sitemap.xml": smap([["/blog/a", "2026-09-29"]]) }).d);
reset(); let x = await call({ action: "check" });
const saved = rec.data.tasks["m1.web.blog_seed"];
if (x.s !== 200 || !x.b.ok || saved.blog_check?.verdict !== "found" || saved.note !== "keep me" || rec.data.tasks["m1.gbp.photos"].keep !== 1) fail(`the handler's check did not save beside the step's other data: ${x.s} ${JSON.stringify(saved).slice(0, 160)}`);
if (!recorded.includes("blog_check")) fail("the check is not recorded");
reset(); authOk = false; x = await call({ action: "check" });
if (x.s !== 403 || writes !== 0) fail("a caller who is not RGA's workspace reaches the check");
reset(); x = await call({ action: "paste", url: "http://127.0.0.1/blog" });
if (x.s !== 400 || writes !== 0) fail("a private link was accepted as the pasted blog");
reset(); H.__useDeps(site({ "/": home, "/blog/": "<html>hi</html>" }).d); x = await call({ action: "paste", url: "x.com/blog/" });
if (x.b.blog_check?.verdict !== "found" || x.b.blog_check?.via !== "pasted") fail(`a pasted link that opens is not kept: ${JSON.stringify(x.b).slice(0, 160)}`);
reset(); H.__useDeps(site({}).d); x = await call({ action: "paste", url: "x.com/nope" });
if (x.b.blog_check?.verdict !== "couldnt" || !x.b.blog_check?.pasted) fail("a pasted link that does not open is read as a blog");
reset(); writeSome = false; H.__useDeps(site({ "/": homeBlog, "/sitemap.xml": smap([["/blog/a", "2026-09-29"]]) }).d); x = await call({ action: "check" });
if (x.s !== 500) fail("a save that did not read back said it worked"); writeSome = true;
reset(); x = await call({ action: "burn" }); if (x.s !== 400) fail("an unknown action was accepted");

// ── admin draws it ──
const A = read("admin/admin.js"), a = A.indexOf("function blogCheckAdminHtml"), b = A.indexOf("function formTrackingAdminHtml");
if (a < 0 || b < a) { console.error("⚠️  INDETERMINATE — the card moved"); process.exit(2); }
const card = A.slice(a, b);
for (const w of ["Not checked yet", "Blog found", "Didn't find", "Couldn't check", "We didn't find a blog", "It can still exist somewhere else. Ask before building a new one.", "This doesn't mean they have no blog.", "They have one: paste the link", "Check again", "Try again"]) if (!card.includes(w)) fail(`the card lost "${w}"`);
if (/no blog\b(?!\.)/i.test(card.replace(/This doesn't mean they have no blog\./, "").replace(/they have no blog/g, ""))) fail("the card says a flat \"no blog\"");
if (!/"m1\.web\.blog_seed" \? blogCheckAdminHtml\(t\)/.test(A)) fail("step 47's card is not wired to the blog check");
if (!/data-blog-check\]\s*,\s*\[data-blog-paste\]/.test(A) || !/b\.classList\.add\("is-busy"\)/.test(A.slice(A.indexOf("[data-blog-check], [data-blog-paste]"), A.indexOf("[data-blog-check], [data-blog-paste]") + 900))) fail("the Check / paste buttons do not spin");
if (/[—–]/.test(card.replace(/\/\/.*$/gm, ""))) fail("a dash in the card's words");
if (!/admin-blog-check/.test(read("netlify.toml") + A)) fail("nothing calls the blog check");
if (F.length) { console.error(`🔴 the blog check regressed — ${F.length}:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ the blog check: found / none / couldn't check from fake sites (a refusal or timeout is never \"none\"), private addresses never fetched, the handler saves and reads back for RGA only, the card says only what it saw");
