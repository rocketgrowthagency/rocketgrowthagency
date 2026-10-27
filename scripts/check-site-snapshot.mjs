#!/usr/bin/env node
// check-site-snapshot.mjs — 2026-10-23, approved rga_client_access_and_work_v1: the BEFORE-SNAPSHOT + the access ledger's removal.
//   · the snapshot only READS (every request is a GET, never signed in) and runs on fake sites, any builder:
//       a sitemap site (pages nearest the top first, capped, the rest counted) · a sitemap index · no sitemap (homepage links)
//       · a blocked site (recorded with its reason, never guessed) · a page that won't open (listed as not read, with why)
//   · per page it keeps title · description · headline · schema types · phones · images without a description
//   · the handler re-reads the record before writing (a client's save during the crawl is never lost) and verifies the write
//   · the ledger: admin-access-confirm "removed" records when + how, refuses with no confirmed access; the card shows it
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let S; try { S = req(path.join(SITE, "netlify/functions/_site-snapshot.js")); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }

const page = (title, extra = "") => `<html><head><title>${title}</title><meta name="description" content="About ${title}"><script type="application/ld+json">{"@type":"Plumber","name":"Joe"}</script></head><body><h1>${title} headline</h1><a href="tel:+13105550142">Call</a><img src="a.jpg"><img src="b.jpg" alt="Van">${extra}</body></html>`;
const fake = (routes) => { const seen = []; const fn = async (url, init = {}) => { seen.push({ url, method: init.method || "GET" });
  const r = routes[url.replace(/\/$/, "") || url] ?? routes[url];
  if (r === undefined) return { ok: false, status: 404, url, text: async () => "not found" };
  if (r === "BLOCK") return { ok: false, status: 403, url, text: async () => "<title>Just a moment...</title> challenge-platform" };
  if (r === "HANG") return new Promise((_, rej) => { const e = new Error("aborted"); e.name = "AbortError"; setTimeout(() => rej(e), 5); });
  return { ok: true, status: 200, url, text: async () => r }; }; fn.seen = seen; return fn; };

// 1 · a sitemap site, deep pages last, capped
{
  const deep = Array.from({ length: 40 }, (_, i) => `https://joes.test/blog/2026/post-${i}`);
  const xml = `<urlset>${[...deep, "https://joes.test/services", "https://joes.test/contact", "https://other.test/x"].map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
  const routes = { "https://joes.test": page("Home"), "https://joes.test/sitemap.xml": xml, "https://joes.test/services": page("Services"), "https://joes.test/contact": page("Contact") };
  for (const d of deep) routes[d] = page("Post");
  const f = fake(routes);
  const r = await S.takeSnapshot("joes.test", f, { budgetMs: 8000 });
  if (r.source !== "sitemap" || r.pages[0].title !== "Home") fail("a sitemap site isn't read from its sitemap, homepage first");
  const order = r.pages.map((p) => p.url);
  const at = (u) => order.indexOf(u);
  if (at("https://joes.test/services") < 0 || at("https://joes.test/services") > 3 || at("https://joes.test/contact") < 0 || at("https://joes.test/contact") > 3) fail("the main pages aren't first (a long sitemap of posts pushed them past the cap)");
  if (r.pages.length !== S.MAX_PAGES || r.beyond_cap !== r.found - S.MAX_PAGES || r.found !== 43) fail(`the cap isn't held / counted (pages ${r.pages.length}, found ${r.found}, beyond ${r.beyond_cap})`);
  if (order.some((u) => /other\.test/.test(u))) fail("the snapshot follows another site's address from the sitemap");
  const h = r.pages[0];
  if (h.description !== "About Home" || h.h1 !== "Home headline" || !h.schema.includes("Plumber") || h.phones[0] !== "+13105550142" || h.images !== 2 || h.images_without_description !== 1) fail("a page's title / description / headline / schema / phone / image descriptions aren't kept");
  if (f.seen.some((x) => x.method !== "GET")) fail("the snapshot sent something other than GET (it must only READ)");
}
// 2 · a sitemap index · 3 · no sitemap → homepage links · 4 · blocked · 5 · a page that won't open
{
  const f = fake({ "https://a.test": page("A"), "https://a.test/sitemap.xml": "<sitemapindex><sitemap><loc>https://a.test/sm-pages.xml</loc></sitemap></sitemapindex>", "https://a.test/sm-pages.xml": "<urlset><url><loc>https://a.test/about</loc></url></urlset>", "https://a.test/about": page("About") });
  const r = await S.takeSnapshot("https://a.test", f, {});
  if (!r.pages.some((p) => p.title === "About")) fail("a sitemap index isn't followed to its page list");
  const f2 = fake({ "https://b.test": page("B", `<a href="/team">Team</a><a href="https://elsewhere.test/">x</a><a href="/logo.png">l</a>`), "https://b.test/team": page("Team") });
  const r2 = await S.takeSnapshot("b.test", f2, {});
  if (r2.source !== "links" || !r2.pages.some((p) => p.title === "Team") || r2.pages.some((p) => /elsewhere|logo/.test(p.url))) fail("with no sitemap, the homepage's own same-site page links aren't used (or images / other sites are)");
  const r3 = await S.takeSnapshot("c.test", fake({ "https://c.test": "BLOCK" }), {});
  if (r3.reason !== "blocked" || r3.read !== 0 || r3.pages[0].why !== "blocked") fail("a blocked site isn't recorded as blocked (with nothing guessed)");
  const r4 = await S.takeSnapshot("d.test", fake({ "https://d.test": page("D", `<a href="/gone">g</a><a href="/slow">s</a>`), "https://d.test/slow": "HANG" }), {});
  const gone = r4.pages.find((p) => /gone/.test(p.url)), slow = r4.pages.find((p) => /slow/.test(p.url));
  if (!gone || gone.read || gone.why !== "http_404" || !slow || slow.read || slow.why !== "timeout" || r4.not_read !== 2) fail("a page that won't open isn't listed as not read, with its reason");
  const r5 = await S.takeSnapshot("", fake({}), {});
  if (r5.reason !== "no_site") fail("no website address isn't reported as no_site");
}
// 6 · the handler: re-read before write, verify the write · the removal action
{
  const H = read("netlify/functions/admin-site-snapshot.js");
  const a = H.indexOf("await takeSnapshot("), b = H.indexOf("const fresh = ", a), c = H.indexOf('method: "PATCH"', b);
  if (a < 0 || b < 0 || c < 0) fail("the snapshot handler doesn't re-read the record AFTER the crawl and before writing (a client's save meanwhile would be lost)");
  if (!/const next = \{ \.\.\.cur, site_snapshot: stored/.test(H) || !/const cur = \(fresh && fresh\.data\) \|\| data;/.test(H)) fail("the snapshot write doesn't merge into the freshly read record");
  if (!/back\[0\]\.data\.site_snapshot\.at !== at/.test(H)) fail("the snapshot write isn't verified");
  if (!/requireWorkspaceForClientOrInternal\(event, clientId\)/.test(H)) fail("the snapshot handler doesn't check its caller");
  const AC = read("netlify/functions/admin-access-confirm.js");
  if (!/body\.action === "removed"/.test(AC) || !/removed_at: at, removed_by/.test(AC) || !/There's no confirmed access to remove/.test(AC) || !/website_access_removed/.test(AC)) fail("the access ledger can't record a removal (when · by · how), or records one with no confirmed access");
  const A = read("admin/admin.js");
  // admin_row8_done_v1 (10-27): the done card is the row's foldable body below its line; ledger + snapshot are IN the card
  if (!/o\.flowId === "m1\.access\.website" \? `<div class="ob-done-card">\$\{accessAdminHtml\(s\.task\)\}<\/div>` : ""/.test(A)
    || !/body: `<div class="ob-ac-in">\$\{accessLedgerCardHtml\(t\)\}<\/div>`, acts: snap\.btn, right: accessRemoveHtml\(t\)/.test(A)
    || !/facts\.push\(\["Snapshot", snap\.fact\]\);/.test(A)) fail("a done admin row 8 doesn't show the grant, the ledger and the snapshot (done rows draw no step cards)");
  if (!/if \(isAcc\) snapshotTake\(cid, null\)/.test(A)) fail("confirming access doesn't take the before-snapshot");
  if (!/const RGA_ACCESS_ACCOUNT = "/.test(A) || /account: "hello@rocketgrowthagency\.com"/.test(A)) fail("RGA's login on Confirm access isn't the one constant (the RGA Admin switch would miss it)");
}
if (F.length) { console.error("🔴 the before-snapshot / access ledger regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Before-snapshot + ledger: read-only (GET only), sitemap → pages nearest the top first, capped + counted, index followed, homepage links when no sitemap, blocked / failed pages recorded with why, title · description · headline · schema · phone · image descriptions kept · the write re-reads first and is verified · removal recorded with when + how · Confirm takes the snapshot · one login constant");
