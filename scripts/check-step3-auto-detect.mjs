#!/usr/bin/env node
// check-step3-auto-detect.mjs — 2026-10-22, approved step3_auto_detect_v1 (Chris: "what if we can tell from their site… then we have
// the option for client to approve or decline and then if they decline they can then follow these steps of step 3"). RUNS every layer
// on fake data (no network, no database):
//   1 the detector: every sign has a plain proof line · no proof line claims an absence · a Shopify store address is read + counted ·
//     a footer credit counts only when it LINKS OUT, never marketing copy or a builder · the WordPress sign-in page is a 2nd sign
//     only when its form is really there
//   2 the portal's Step 1: found → "Check what we found" + proof + Yes/No · one sign says "It looks like", never "is on" ·
//     a credit asks about the designer · nothing found → the tiles (never a silent pick)
//   3 the save: yes → detected_confirmed · no → detected_declined · nothing found → chosen · designer → designer_credit, with the record
//   4 the server keeps the record cleaned to its shape (no junk source, no unknown builder, short proof lines)
//   5 admin row 8 shows our check + the client's answer and flags a "no"; the sent card names the designer, never "Another / not sure"
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`, FNS_REAL = fs.realpathSync(FNS), req = createRequire(`${FNS}/x.js`);
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const fnSrc = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  ${name} moved`); process.exit(2); } let d = 0, i = src.indexOf("{", at); for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return src.slice(at, i + 1); };
const PL = JSON.parse(read("data/site-platforms.json")).platforms;
const PUB = Object.fromEntries(Object.entries(PL).map(([k, { rga, ...p }]) => [k, p]));

// ── 1 · the detector, RUN
const D = req(`${FNS}/_site-platform.js`);
const det = (h, hd) => D.detectFromHtml(h, hd || {});
const wp = det(`<link href="/wp-content/x.css"><meta name="generator" content="WordPress 6.8">`);
if (wp.platform !== "wordpress" || wp.confidence !== "stated" || wp.evidence.length !== wp.signs) fail(`a WordPress page's proof lines don't match its signs (${wp.signs} signs, ${wp.evidence?.length} lines)`);
if (!(wp.evidence || []).includes("WordPress files on your pages (/wp-content/)")) fail("the WordPress proof doesn't say what we saw in plain words");
const SRC = read("netlify/functions/_site-platform.js");
const labels = [...SRC.matchAll(/\[\s*"[a-z]+",\s*\/(?:\\\/|[^/\n])+\/[a-z]*,\s*"((?:\\"|[^"])*)"\s*\]/g)].map((m) => m[1]);
if (labels.length < 40) fail(`only ${labels.length} signs carry a proof line (every sign must)`);
for (const l of labels) if (/\bnot\b|n't\b|\bno\b|\bmissing\b|\bwithout\b/i.test(l)) fail(`a proof line claims an absence: "${l}"`);
const shop = det(`<script src="https://cdn.shopify.com/a.js"></script><script>Shopify.shop = "Joes-Store.myshopify.com";</script>`);
if (shop.shopify_store !== "joes-store.myshopify.com") fail(`a Shopify store address isn't read off the page (${shop.shopify_store})`);
if (shop.confidence !== "stated") fail("a Shopify page with its store address isn't stated (the address is Shopify's own sign)");
const cred = (h) => (det(`<html><body>x</body><footer>${h}</footer></html>`).designer || {}).name || null;
if (cred(`© 2026 Joe Plumbing | Website by <a href="https://northline.co">Northline Web Co.</a>`) !== "Northline Web Co.") fail("a linked \"Website by\" credit isn't read");
if (cred(`Site by: <a href="https://www.exposure.com/">Exposure</a>`) !== "Exposure") fail("the live \"Site by: Exposure\" credit (bertdorrroofing.com, 10-22) isn't read");
if (cred(`Websites built to convert. Made by hand in Ohio.`)) fail("marketing copy (\"built to convert\") reads as a designer (the live false positive, 10-22)");
if (cred(`Website built by <a href="https://wix.com">Wix</a>`)) fail("a builder's own credit reads as a web designer");
if (cred(`Built by <a href="/about">our team</a>`)) fail("an inside link reads as an outside web designer");
const site = (home, login) => async (u) => ({ ok: login !== null || !String(u).endsWith("wp-login.php"), headers: new Map(), text: async () => (String(u).endsWith("wp-login.php") ? login || "" : home) });
const two = await D.detectPlatform("joes.com", site(`<img src="/wp-content/a.png">`, `<form><input id="user_login"></form>`));
if (two.confidence !== "stated" || !two.evidence.includes("A WordPress sign-in page (/wp-login.php)")) fail("the WordPress sign-in page isn't counted as the second sign");
const one = await D.detectPlatform("joes.com", site(`<img src="/wp-content/a.png">`, null));
if (one.confidence !== "ask" || one.evidence.some((e) => /sign-in/.test(e))) fail("a missing sign-in page still adds a sign (it must add nothing)");
const fake = await D.detectPlatform("joes.com", site(`<img src="/wp-content/a.png">`, `<h1>Welcome</h1>`));
if (fake.confidence !== "ask") fail("any page at /wp-login.php counts as a sign (only a real sign-in form may)");

// a DEVELOPER-BUILT site (ohhrats.com, 10-22): build files / developer hosts are positive signs — asked, never stated; a builder wins
const vite = det(`<link rel="stylesheet" href="/assets/styles-CNMhkxsr.css">`);
if (vite.platform !== "custom" || vite.confidence !== "ask" || !vite.evidence.includes("Your pages load developer build files (/assets/styles-CNMhkxsr.css)")) fail(`a Vite build (ohhrats.com) isn't asked as custom-coded with its file (${vite.platform} ${vite.confidence})`);
const next = det(`<script src="/_next/static/chunks/main.js"></script>`, { "x-vercel-id": "sfo1::abc" });
if (next.platform !== "custom" || next.confidence !== "ask" || next.signs !== 2) fail("a Next.js site on Vercel isn't asked as custom-coded (two signs, still asked)");
const wfNext = det(`<html data-wf-site="x"><script src="/_next/static/x.js"></script><link href="https://assets.website-files.com/a.css">`);
if (wfNext.platform !== "webflow") fail(`a builder sign doesn't beat a developer sign (${wfNext.platform})`);
if (/return dev\.length \? \{ platform: "custom", signs: dev\.length, confidence: "stated"/.test(SRC)) fail("custom-coded is stated as fact");
// 🔒 THE HOST IS READ FROM THE SITE, for any site (approved step3_custom_hosts_v1; Chris: "make sure this is universal and not just bc we know")
for (const [hd, want] of [[{ server: "Netlify" }, "netlify"], [{ "x-nf-request-id": "01X" }, "netlify"], [{ "x-vercel-id": "sfo1::x" }, "vercel"], [{ server: "GitHub.com" }, "githubpages"], [{ server: "cloudflare" }, null], [{}, null]]) {
  const got = det(`<link href="/assets/app-AbCdEf12.css">`, hd).host;
  if (got !== want) fail(`a developer-built site with ${JSON.stringify(hd)} reads its host as ${got} (want ${want})`);
}
if (/rocketgrowthagency\.com|ohhrats|diversifiedroofing/i.test(SRC.replace(/\/\/.*$/gm, ""))) fail("the detector's code names a specific site — it must work from what ANY site sends");
const HOSTS = (PL.custom || {}).hosts || {};
if (!HOSTS.netlify?.seat || !HOSTS.vercel?.seat || HOSTS.githubpages?.seat !== false) fail("the host list doesn't say which hosts can add a paid seat (Netlify, Vercel = yes; GitHub Pages = no)");
const CSTEPS = JSON.stringify((PL.custom || {}).steps || []);
if (!/rocketgrowthagency/.test(CSTEPS) || !/GitLab or Bitbucket/.test(CSTEPS)) fail("the developer-built steps don't cover GitHub AND GitLab / Bitbucket");
if (/\$\s?\d/.test(JSON.stringify(PL.custom || {}))) fail("a host price is written into the product (prices change; say \"can add a paid seat\")");

// a BLOCKED site (Cloudflare challenge, the live 10-22 case) → a reason, then the latest saved copy, capped at "ask"
const Hd = (o) => ({ forEach: (f) => Object.entries(o).forEach(([k, v]) => f(v, k)) });
const arch = (home, ts = "20250909124800") => async (u) => {
  if (/archive\.org\/wayback/.test(u)) return { ok: true, json: async () => ({ archived_snapshots: { closest: { available: true, timestamp: ts, url: `http://web.archive.org/web/${ts}/https://joes.com/` } } }) };
  if (/web\.archive\.org/.test(u)) return { ok: true, status: 200, headers: Hd({}), text: async () => `<link href="/wp-content/a.css"><meta name="generator" content="WordPress 6.8">` };
  return home(u); };
const blocked = await D.detectPlatform("joes.com", arch(async () => ({ ok: false, status: 403, headers: Hd({ "cf-mitigated": "challenge" }), text: async () => "<title>Just a moment...</title>" })));
if (blocked.reason !== "blocked") fail(`a Cloudflare challenge isn't named "blocked" (${blocked.reason})`);
if (blocked.source !== "archive" || blocked.platform !== "wordpress") fail("a blocked site doesn't fall back to its saved copy");
if (blocked.confidence !== "ask") fail(`a saved copy is stated as fact (${blocked.confidence}) — the site may have moved since`);
const challenge200 = await D.detectPlatform("joes.com", arch(async () => ({ ok: false, status: 503, headers: Hd({}), text: async () => "<div id=challenge-platform>" })));
if (challenge200.reason !== "blocked") fail("a challenge page without Cloudflare's header isn't recognised");
const stale = await D.detectPlatform("joes.com", arch(async () => ({ ok: false, status: 403, headers: Hd({ "cf-mitigated": "challenge" }), text: async () => "" }), "20200101000000"));
if (stale.platform) fail("a saved copy older than 2 years is used");
const nocopy = await D.detectPlatform("joes.com", async (u) => (/archive\.org/.test(u) ? { ok: true, json: async () => ({ archived_snapshots: {} }) } : { ok: false, status: 403, headers: Hd({ "cf-mitigated": "challenge" }), text: async () => "" }));
if (nocopy.status !== "couldnt_check" || nocopy.reason !== "blocked" || nocopy.platform) fail("a blocked site with no saved copy is guessed (it must be couldn't-check + the reason)");
if (/"User-Agent": "Mozilla\/5\.0 \(RGA site check\)"/.test(SRC)) fail("the check announces itself as a bot again (Cloudflare blocks it)");

// ── 2 · the portal's Step 1, RUN
const P = read("portal/portal.js");
const pctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10), _accNames: {}, drew: [] });
vm.runInContext(`${(P.match(/^const ACC_TAG = \{[^\n]*\};$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_CHECK_ICON = `[^`]*`;$/m) || [""])[0].replace(/^const /, "var ")}`, pctx);
for (const n of ["accPart", "accMono", "accFoundPill", "accHostOf", "accDrawFound"]) vm.runInContext(fnSrc(P, n), pctx);
vm.runInContext(`function accDrawPlatform(host, key, source) { drew.push([key, source]); }`, pctx);
const step1 = (j) => { pctx.drew = []; const box = { innerHTML: "" }; const host = { _acc: { platforms: PUB, site: "joes.com", ...j }, querySelector: (s) => (s === "[data-acc-plat]" ? box : null), setAttribute() {} };
  vm.runInContext(`accDrawFound(h)`, Object.assign(pctx, { h: host })); return { html: box.innerHTML, drew: pctx.drew }; };
const s1 = step1({ platform: "wordpress", confidence: "stated", signs: 2, evidence: ["WordPress files on your pages (/wp-content/)", "A WordPress tag in your page code"] });
if (!/Check what we found/.test(s1.html) || !/Your website is on WordPress/.test(s1.html) || !/data-acc-yes/.test(s1.html) || !/data-acc-no/.test(s1.html)) fail("a found builder isn't asked (\"Check what we found\" + Yes / No)");
// 🔒 ONE PILL, NO TECHNICAL PROOF (step3_found_pill_v1): the client sees who checked, never a file, a path or a "sign"
if (!/class="pm-ax-fpill"[^>]*>[\s\S]*We checked joes\.com/.test(s1.html)) fail("the ask doesn't show the \"We checked joes.com\" pill");
const TECH = /\/wp-|\/assets\/|\/_next|cdn\.|\.css|\.js\b|\bsigns?\b|build files|page code|wixstatic|api\.w\.org/i;
const s2 = step1({ platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"] });
if (/is on Wix/.test(s2.html) || !/It looks like Wix/.test(s2.html)) fail("one sign says \"is on\" (it must say \"It looks like… please check\")");
const s3 = step1({ platform: null, confidence: "none", signs: 0, evidence: [], designer: { name: "Exposure" } });
if (!/A web designer may manage your site/.test(s3.html) || !/data-acc-dyes/.test(s3.html) || !/Your site credits Exposure/.test(s3.html)) fail("a footer credit doesn't ask about the web designer");
const s5 = step1({ platform: "wordpress", confidence: "ask", signs: 2, evidence: ["WordPress files on your pages (/wp-content/)"], source: "archive", archived_at: "2025-09-09", reason: "blocked" });
if (!/We checked a saved copy of your site/.test(s5.html) || /is on WordPress/.test(s5.html)) fail("a saved-copy result doesn't say it's a saved copy (with its date) or says \"is on\"");
const s6 = step1({ platform: "custom", confidence: "ask", signs: 1, evidence: ["Your pages load developer build files (/assets/styles-CNMhkxsr.css)"] });
if (!/It looks like a developer built your site/.test(s6.html) || !/Yes, a developer built it/.test(s6.html)) fail("a developer-built site isn't asked in plain words");
const s8 = step1({ platform: "custom", confidence: "ask", signs: 1, host: "netlify", evidence: ["Your site is hosted on Netlify"] });
if (!/Your website is hosted on Netlify/.test(s8.html) || !/Yes, that's right/.test(s8.html)) fail("a found developer-built site with a known host isn't asked by its host");
const s7 = step1({ platform: "wordpress", confidence: "stated", signs: 1, source: "rga", evidence: ["Checked by hand by RGA on 10-22 (your site blocks automatic checks)"] });
if (!/RGA checked: your website is on WordPress/.test(s7.html) || !/pm-ax-fpill is-rga[^>]*>[\s\S]*Checked by RGA/.test(s7.html) || !/data-acc-yes/.test(s7.html) || !/data-acc-no/.test(s7.html)) fail("RGA's hand check isn't asked as \"RGA checked: … Is that right?\" with Yes / No");
for (const [label, x] of [["WordPress", s1], ["one sign", s2], ["designer", s3], ["saved copy", s5], ["developer", s6], ["RGA", s7]]) {
  const shown = x.html.replace(/<[^>]+>/g, " ");
  if (TECH.test(shown)) fail(`the ${label} ask shows technical proof to the client ("${(shown.match(TECH) || [""])[0]}") — one pill only`);
}
const s4 = step1({ platform: null, confidence: "none", signs: 0, evidence: [] });
if (s4.html || !s4.drew.length || s4.drew[0][0] !== null) fail("nothing found doesn't go straight to the tiles");
// the blocked path, RUN (accDrawPlatform with no builder): why + 3 ways to tell + Check it for me
{
  const bctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), _accNames: {} });
  vm.runInContext(`${(P.match(/^const ACC_TAG = \{[^\n]*\};$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_COMMON = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_SEND = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_CHECK_ICON = `[^`]*`;$/m) || [""])[0].replace(/^const /, "var ")} var monthDay = (x) => String(x || "");`, bctx);
  for (const n of ["accPart", "accMono", "accSetupHtml", "accHostOf", "accCustomSetupHtml", "accFoundPill", "accDrawPlatform"]) vm.runInContext(fnSrc(P, n), bctx);
  const drawKey = (j, key, src) => { const box = { innerHTML: "", querySelector: () => null }; const host = { _acc: { platforms: PUB, ...j }, querySelector: (q) => (q === "[data-acc-plat]" ? box : null), setAttribute() {} }; bctx.h = host; vm.runInContext(`accDrawPlatform(h, ${JSON.stringify(key)}, ${JSON.stringify(src)})`, bctx); return box.innerHTML; };
  const net = drawKey({ status: "ok", site: "joes.com", platform: "custom", confidence: "ask", host: "netlify" }, "custom", "detected_confirmed");
  if (!/Your website is hosted on Netlify/.test(net) || !/Where your website lives/.test(net)) fail("a developer-built site on Netlify doesn't say where it lives");
  if (!/Send these steps to my developer/.test(net) || !/Skip Netlify/.test(net) || !/rocketgrowthagency/.test(net)) fail("Netlify's Step 2 isn't: who does this · the code steps · Skip Netlify");
  if (/Or on Netlify, Vercel or your host|Invite this email/.test(net)) fail("the developer-built Step 2 still shows the generic host menu / the email-and-role pair");
  if (/\$\s?\d/.test(net.replace(/\$\{[^}]*\}/g, ""))) fail("a price shows on the client's card");
  const ghp = drawKey({ status: "ok", site: "joes.com", platform: "custom", confidence: "ask", host: "githubpages" }, "custom", "detected_confirmed");
  if (/Skip GitHub Pages/.test(ghp)) fail("GitHub Pages is told to skip (it's where the code lives)");
  const unk = drawKey({ status: "ok", site: "joes.com", platform: "custom", confidence: "ask", host: null }, "custom", "detected_confirmed");
  if (!/A developer built your website/.test(unk) || !/Write the note for my developer/.test(unk) || !/I've added RGA \(or sent the note\)/.test(unk)) fail("a developer-built site with no host seen doesn't lead with the note to the developer");
  const picked = drawKey({ status: "ok", site: "joes.com" }, "custom", "chosen");
  if (/We couldn't see where it's hosted/.test(picked) || /pm-ax-fpill/.test(picked)) fail("a client who PICKED Custom-coded is told what our check saw");
  const wpT = drawKey({ status: "ok", site: "joes.com" }, "wordpress", "chosen");
  if (!/<b>1 · You<\/b>/.test(wpT) || !/<b>2 · RGA<\/b>We accept the invite/.test(wpT) || !/<b>3 · Done<\/b>/.test(wpT)) fail("Step 3 doesn't say what happens next (You · RGA · Done) for every builder");
  const wfT = drawKey({ status: "ok", site: "joes.com" }, "webflow", "chosen");
  if (!/<b>2 · RGA<\/b>We send the request/.test(wfT)) fail("a request builder's Step 3 says the wrong next step");
  const draw = (j, src = null) => { const box = { innerHTML: "", querySelector: () => null }; const host = { _acc: { platforms: PUB, ...j }, querySelector: (q) => (q === "[data-acc-plat]" ? box : null), setAttribute() {} }; bctx.h = host; vm.runInContext(`accDrawPlatform(h, null, ${JSON.stringify(src)})`, bctx); return box.innerHTML; };
  const bl = draw({ status: "couldnt_check", reason: "blocked", site: "joes.com" });
  if (!/joes\.com has a security setting that blocks automatic checks/.test(bl) || !/3 ways to tell/.test(bl) || !/data-acc-check/.test(bl) || !/data-acc-pick="wordpress"/.test(bl)) fail("a blocked site doesn't get its way forward (why · 3 ways to tell · Check it for me · the tiles)");
  if (/data-acc-check/.test(draw({ status: "ok", site: "joes.com" }))) fail("\"Check it for me\" shows on a site we could read");
  if (!/data-acc-back/.test(draw({ status: "ok", site: "joes.com", platform: "wix", confidence: "ask" }, "detected_declined"))) fail("after \"No\" there's no way back to what we found");
  if (/data-acc-back/.test(draw({ status: "ok", site: "joes.com" }))) fail("\"Back to what we found\" shows when we found nothing");
}
if (/accDrawPlatform\(host, j\.confidence === "stated"/.test(P) || !/accDrawFound\(host\);/.test(fnSrc(P, "loadAccessPlatform"))) fail("the detector picks the builder SILENTLY again (it must ask first)");
if (/We found this on your site|Looks like it from your site, right\?/.test(P)) fail("the old silent-pick wording is back");

// ── 3 · the save, RUN (accSave with a fake host; the request is caught, never sent)
let sent = null;
const sctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), clientError: (e) => String(e), _rcEditing: new Set(), portalToken: async () => "jwt", settleStepResult: async () => {},
  fetch: async (u, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true }) }; } });
vm.runInContext(`async ${fnSrc(P, "accSave")}`, sctx);
const save = async (j, key, answer, attrSource = "") => { sent = null; const host = { _acc: { platforms: PUB, site: "joes.com", status: "ok", ...j }, _accAnswer: answer, _accCheckedAt: "2026-10-22T20:00:00Z",
  getAttribute: (a) => (a === "data-acc-key" ? key : a === "data-acc-source" ? attrSource : a === "data-client-id" ? "c1" : null), querySelector: () => null, closest: () => null };
  sctx.h = host; await vm.runInContext(`accSave(h, "invite")`, sctx); return (sent || {}).value || {}; };
const WP = { platform: "wordpress", confidence: "stated", signs: 2, evidence: ["x"] };
const v1 = await save(WP, "wordpress", "yes");
if (v1.platform_source !== "detected_confirmed" || v1.detected?.answer !== "yes" || v1.detected?.platform !== "wordpress") fail(`"Yes" doesn't save detected_confirmed + what we found (${v1.platform_source})`);
const v2 = await save(WP, "squarespace", "no");
if (v2.platform_source !== "detected_declined" || v2.detected?.answer !== "no") fail(`"No" + another builder doesn't save detected_declined (${v2.platform_source})`);
const v3 = await save({ platform: null, confidence: "none", signs: 0, evidence: [] }, "wix", null);
if (v3.platform_source !== "chosen") fail(`a builder picked with nothing found isn't "chosen" (${v3.platform_source})`);
const vr = await save({ platform: "wordpress", confidence: "stated", signs: 1, evidence: ["x"], source: "rga" }, "wordpress", "yes");
if (vr.platform_source !== "rga_checked_confirmed") fail(`"Yes" to RGA's hand check isn't saved as rga_checked_confirmed (${vr.platform_source})`);
const vr2 = await save({ platform: "wordpress", confidence: "stated", signs: 1, evidence: ["x"], source: "rga" }, "wix", "no");
if (vr2.platform_source !== "rga_checked_declined") fail(`"No" to RGA's hand check isn't saved as rga_checked_declined (${vr2.platform_source})`);
const v4 = await save({ platform: null, confidence: "none", signs: 0, evidence: [], designer: { name: "Exposure" } }, "other", null, "designer_credit");
if (v4.platform_source !== "designer_credit" || v4.detected?.designer !== "Exposure") fail("the designer path doesn't save designer_credit + the designer's name");

// ── 4 · the server keeps it cleaned
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
globalThis.__rgaFetchDeadlineInstalled = true;
const CID = "11111111-2222-4333-8444-555555555555";
let db = {}, who = "client";
const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  if (url.includes("/auth/v1/user")) return J(who === "rga" ? { id: "rga-u", email: "chris@rocketgrowthagency.com" } : { id: "client-u", email: "owner@acme.test" });
  if (url.includes("notify-rga")) return J({ ok: true, delivered: true });
  if (/googleapis|openai|anthropic/.test(url)) return J({}, 404);
  const u = new URL(url); const t = u.pathname.split("/").pop(); const rows = db[t] || (db[t] = []);
  const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v));
  const hit = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
  if (method === "PATCH") { for (const r of hit) Object.assign(r, body); return J(hit); }
  if (method === "POST") { const row = { id: `n${rows.length}`, ...(body || {}) }; rows.push(row); return J([row]); }
  return J(hit);
};
db = { client_portal_access: [{ portal_email: "owner@acme.test", client_id: CID }], profiles: [{ id: "rga-u", workspace_id: "w1" }], clients: [{ id: CID, workspace_id: "w1", business_name: "Acme Plumbing", website_url: "https://acme.example" }],
  client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: {} } }], client_activity: [] };
for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k];
const r = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
  value: { via: "invite", platform: "wordpress", platform_source: "hacked", detected: { status: "ok", platform: "notabuilder", confidence: "certain", signs: 999, evidence: ["x".repeat(500), 7, "", "a", "b", "c", "d", "e", "f", "g"], designer: "D".repeat(300), answer: "maybe", shopify_store: "evil.com", site: "acme.example", checked_at: "not a date" } } }) });
const ci = db.client_onboarding_records[0].data.tasks["m1.access.website"]?.client_input;
if (r.statusCode !== 200 || !ci) fail(`the server didn't save the answer (${r.statusCode} ${r.body})`);
else {
  const d = ci.detected || {};
  if (ci.platform_source !== "chosen") fail(`a junk platform_source is kept ("${ci.platform_source}")`);
  if (d.platform !== null || d.confidence !== "none" || d.signs !== 20 || d.answer !== null || d.shopify_store !== null || d.checked_at !== null) fail(`the found record isn't cleaned to its shape (${JSON.stringify(d).slice(0, 200)})`);
  if (!Array.isArray(d.evidence) || d.evidence.length > 8 || d.evidence.some((x) => x.length > 120) || (d.designer || "").length > 80) fail("the proof lines / designer name aren't capped");
}
const ok2 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
  value: { via: "invite", platform: "squarespace", platform_source: "detected_declined", detected: { status: "ok", platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"], answer: "no", site: "acme.example", checked_at: "2026-10-22T20:00:00Z" } } }) });
const ci2 = db.client_onboarding_records[0].data.tasks["m1.access.website"]?.client_input || {};
{ const h1 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { via: "invite", platform: "custom", platform_source: "detected_confirmed", detected: { status: "ok", platform: "custom", confidence: "ask", signs: 1, evidence: ["x"], answer: "yes", host: "netlify" } } }) });
  const h2 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { via: "invite", platform: "custom", platform_source: "detected_confirmed", detected: { status: "ok", platform: "custom", host: "evilhost" } } }) });
  if (h1.statusCode !== 200 || h2.statusCode !== 200 || db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input.detected.host !== null) fail("the server keeps an unknown host value");
}
await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
  value: { via: "invite", platform: "squarespace", platform_source: "detected_declined", detected: { status: "ok", platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"], answer: "no", site: "acme.example", checked_at: "2026-10-22T20:00:00Z" } } }) });
if (ok2.statusCode !== 200 || ci2.platform_source !== "detected_declined" || ci2.detected?.platform !== "wix" || ci2.detected?.answer !== "no") fail("a real \"No\" isn't kept as detected_declined with what we found");

// "Check it for me" → a request on the step (never an answer), RGA told; then RGA's hand check (admin-access-confirm rga_check)
{
  const T = () => db.client_onboarding_records[0].data.tasks["m1.access.website"] || {};
  db.client_onboarding_records[0].data.tasks["m1.access.website"] = { status: "pending" };
  const step = (value) => req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website", value }) });
  who = "client";
  const rq = await step({ via: "check", reason: "blocked", site: "acme.example" });
  if (rq.statusCode !== 200 || !T().check_request || T().check_request.reason !== "blocked" || T().status !== "in_progress" || T().client_input) fail(`"Check it for me" isn't saved as a request that waits on RGA (${rq.statusCode} ${JSON.stringify(T()).slice(0, 160)})`);
  const conf = (b) => { for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k]; return req("./admin-access-confirm").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, ...b }) }); };
  who = "rga";
  const bad = await conf({ action: "rga_check", platform: "notabuilder" });
  if (bad.statusCode !== 400) fail("RGA's hand check takes an unknown builder");
  const ok = await conf({ action: "rga_check", platform: "wordpress" });
  if (ok.statusCode !== 200 || T().rga_check?.platform !== "wordpress" || T().status !== "pending") fail(`"Tell the client" doesn't save RGA's check and hand the step back (${ok.statusCode} ${JSON.stringify(T()).slice(0, 160)})`);
  who = "client";
  db.client_onboarding_records[0].data.tasks["m1.access.website"] = { status: "done", completed_at: "2026-10-01" };
  await step({ via: "check", reason: "blocked", site: "acme.example" });
  if (T().status !== "done") fail("a request on a DONE step reopens it");
}

// ── 5 · admin row 8 + the client's sent card
const A = read("admin/admin.js");
const actx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: (x) => String(x || "").slice(0, 10),
  adminGoogleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, admPlatforms: () => PL, state: { selectedClient: { id: CID } } });
vm.runInContext(`${(A.match(/^const STEP_EMAIL_IDS = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} var mailWhen = (x) => String(x || "");`, actx);
for (const n of ["accDetectAdminHtml", "accessAdminHtml", "stepEmailBar"]) vm.runInContext(fnSrc(A, n), actx);
const row = (c) => vm.runInContext(`accessAdminHtml(${JSON.stringify({ status: "in_progress", client_input: c })})`, actx);
const no = row(ci2);
if (!/Our site check:<\/b> Wix · 1 sign/.test(no) || !/is-check/.test(no) || !/<b>Check first:<\/b> the client said no and picked Squarespace/.test(no)) fail("admin row 8 doesn't flag a \"No\" (our check vs the client's pick)");
const yes = row({ via: "invite", platform: "wordpress", platform_source: "detected_confirmed", detected: { status: "ok", platform: "wordpress", signs: 3, answer: "yes" } });
if (!/<b>Client:<\/b> confirmed WordPress/.test(yes) || /is-check/.test(yes)) fail("admin row 8 doesn't show a confirmed builder plainly");
const ar = row({ via: "invite", platform: "wordpress", platform_source: "detected_confirmed", detected: { status: "ok", platform: "wordpress", signs: 2, answer: "yes", source: "archive", archived_at: "2025-09-09", reason: "blocked" } });
if (!/What our check saw<\/b> \(RGA only\)/.test(row({ via: "invite", platform: "wordpress", platform_source: "detected_confirmed", detected: { status: "ok", platform: "wordpress", signs: 2, answer: "yes", evidence: ["WordPress files on your pages (/wp-content/)"] } }))) fail("admin row 8 no longer lists what our check saw (the proof lives only there)");
if (!/from a saved copy \(2025-09-09\), their site blocks automatic checks/.test(ar)) fail("admin row 8 doesn't say the result came from a saved copy (and why)");
const rowT = (t) => vm.runInContext(`accessAdminHtml(${JSON.stringify(t)})`, actx);
const ask8 = rowT({ status: "in_progress", check_request: { asked_at: "2026-10-22T23:00:00Z", reason: "blocked", site: "acme.example" } });
if (!/Your move · check their site/.test(ask8) || !/data-ob-acc-plat/.test(ask8) || !/data-ob-acc-rgacheck/.test(ask8) || !/acme\.example blocks automatic checks/.test(ask8)) fail("admin row 8 doesn't give RGA the check (why · Open · builder picker · Tell the client)");
const told8 = rowT({ status: "pending", check_request: { asked_at: "2026-10-22T23:00:00Z", reason: "blocked", site: "acme.example" }, rga_check: { platform: "wordpress", by: "chris@rocketgrowthagency.com", at: "2026-10-22T23:30:00Z" } });
if (!/Client's move/.test(told8) || !/We checked your website: it's on WordPress/.test(told8) || !/Draft — not sent/.test(told8)) fail("after Tell the client, row 8 doesn't show the client's move + the email as a DRAFT (never auto-sent)");
if (!/Custom-coded · hosted on Netlify/.test(row({ via: "invite", platform: "custom", platform_source: "detected_confirmed", detected: { status: "ok", platform: "custom", signs: 1, host: "netlify", answer: "yes" } }))) fail("admin row 8 doesn't say where a developer-built site is hosted");
const dz = row({ via: "designer", platform: "other", platform_source: "designer_credit", detected: { status: "ok", platform: null, signs: 0, designer: "Exposure", designer_answer: "yes" } });
if (!/footer credits <b>Exposure<\/b> \(client: they manage it\)/.test(dz)) fail("admin row 8 doesn't show the designer credit the client confirmed");
const cctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;"), monthDay: (x) => String(x || ""), fmtDateTimeDot: (x) => String(x || ""), fmtDateShort: (x) => String(x || ""),
  googleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, stepLockOf: () => null, _rcEditing: new Set(), _accNames: Object.fromEntries(Object.entries(PL).map(([k, p]) => [k, p.name])), RC_WEB: "" });
vm.runInContext(`var rcRow = (k, st, v) => k + ":" + st[1] + ":" + v + " | "; var _accRoles = {}; var _accPickSelf = new Set(); ${(P.match(/^const ACC_TAG = \{[^\n]*\};$/m) || [""])[0].replace(/^const /, "var ")}`, cctx);
for (const n of ["accPart", "accDidLine", "accStep1Name", "accessCardHtml"]) vm.runInContext(fnSrc(P, n), cctx);
const sentCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "in_progress", client_input: { via: "designer", platform: "other", platform_source: "designer_credit", detected: { designer: "Exposure" }, at: "2026-10-22" } })}, "c1")`, cctx);
const waitCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "in_progress", check_request: { asked_at: "2026-10-22T23:00:00Z", site: "acme.example", reason: "blocked" } })}, "c1")`, cctx);
if (!/RGA is checking which builder your site uses/.test(waitCard) || !/data-acc-pickself/.test(waitCard) || !/With RGA/.test(waitCard)) fail("while RGA checks, the client's card isn't With RGA (with Pick it yourself)");
const rgaCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "pending", check_request: { asked_at: "x", site: "acme.example", reason: "blocked" }, rga_check: { platform: "wordpress", at: "2026-10-22T23:30:00Z" } })}, "c1")`, cctx);
if (!/data-acc-rga="[^"]*&quot;wordpress&quot;/.test(rgaCard)) fail("RGA's hand check doesn't reach the client's ask");
if (!/Exposure manages your site/.test(sentCard) || /Another \/ not sure/.test(sentCard)) fail("the sent card's Step 1 says \"Another / not sure\" instead of naming the designer");

if (F.length) { console.error("🔴 step 3 auto-detect regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 3 auto-detect holds: proof line per sign (no absence claims) · store address read + counted · linked footer credits only · real WordPress sign-in = 2nd sign · a blocked site → reason + saved copy (≤2 yrs, \"looks like\" only) · Step 1 asks with proof (one sign = \"looks like\") · designer ask · nothing found → tiles · yes/no/chosen/designer saved with the record · server cleans it · admin row 8 flags a \"No\" · sent card names the designer · developer-built asked · blocked → why + 3 ways + Check it for me → RGA's hand check (admin) → the same Yes / No · email stays a draft");
