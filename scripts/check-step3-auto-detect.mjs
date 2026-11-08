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
//   2026-10-30 night fixer: the client's card lifts the card system (csBlock) + the plan-card pieces; "With RGA" = the blue system card + ONE blue status row (client_step03_access_v1)
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { csBlock } from "./lib/portal-cs.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`, FNS_REAL = fs.realpathSync(FNS), req = createRequire(`${FNS}/x.js`);
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
// 11-6 night fixer: a default parameter (accessCardHtml(..., tasks = {})) holds a brace, so the body starts after the parameter list
const fnSrc = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  ${name} moved`); process.exit(2); } let d = 0, i = src.indexOf("(", at); for (let p = 0; i < src.length; i++) { if (src[i] === "(") p++; else if (src[i] === ")" && --p === 0) break; } i = src.indexOf("{", i); for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return src.slice(at, i + 1); };
const PL = JSON.parse(read("data/site-platforms.json")).platforms;
const PUB = Object.fromEntries(Object.entries(PL).map(([k, { rga, ...p }]) => [k, p]));

// ── 1 · the detector, RUN
const D = req(`${FNS}/_site-platform.js`);
const det = (h, hd) => D.detectFromHtml(h, hd || {});
// 🔒 step3_finish_v1 E (10-28): the AI site builders, by the markers confirmed on live sites + their own addresses (x-rga-site-host)
{ const PLs = JSON.parse(fs.readFileSync(`${SITE}/data/site-platforms.json`, "utf8")).platforms;
  for (const k of ["lovable", "bolt", "replit", "base44", "v0"]) { const p = PLs[k];
    if (!p || p.kind !== "invite" || !(p.steps || []).some((x) => (x.copy || []).some((c) => c[1] === "access@rocketgrowthagency.com")) || !/Publish|Republish/.test(p.rga || "") || !(p.sources || []).length) fail(`${k} isn't on the builder list with an access@ invite, its sources, and how it goes live (Publish in the builder)`); }
  const want = [["lovable", "", { "x-rga-site-host": "acme.lovable.app" }], ["replit", "", { "x-rga-site-host": "acme.replit.app" }], ["bolt", "", { "x-powered-by": "Bolt.new", "x-rga-site-host": "acme.bolt.host" }],
    ["base44", "<script>window.Base44={}</script>", { "x-rga-site-host": "acme.base44.app" }], ["v0", '<meta name="generator" content="v0.app"/>', { "x-vercel-id": "1" }]];
  for (const [k, h, hd] of want) { const r = det(h, hd); if (r.platform !== k) fail(`a ${k} site isn't recognised (${r.platform})`); }
  if (det("<html></html>", { server: "Netlify", "x-rga-site-host": "rocketgrowthagency.com" }).platform === "lovable") fail("a plain site is read as an AI builder"); }
// …and detectPlatform itself reads where the page was really served from (a custom domain that redirects to acme.lovable.app counts)
{ const fake = async () => ({ status: 200, ok: true, url: "https://acme.lovable.app/", headers: new Map([["content-type", "text/html"]]), text: async () => "<html><body>hi</body></html>" });
  const r = await D.detectPlatform("https://www.acme-plumbing.test", fake, { timeoutMs: 2000, budgetMs: 4000 });
  if (r.platform !== "lovable") fail(`a site served from lovable.app isn't recognised by its address (${r.platform || r.status})`); }
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
vm.runInContext(`var PC_TICK = "<svg/>"; ${(P.match(/^const RGA_ADMIN_(?:EMAIL|GITHUB) = "[^"]*";$/gm) || []).join(" ").replace(/const /g, "var ")} ${(P.match(/^const ACC_CHECK_ICON = `[^`]*`;$/m) || [""])[0].replace(/^const /, "var ")}`, pctx);
for (const n of ["accPart", "accSetWhen", "accSetSend", "accMono", "accFoundPill", "accHostOf", "accHostMono", "accDrawFound"]) vm.runInContext(fnSrc(P, n), pctx);
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
if (!/class="pm-ax-result"/.test(s8.html) || !/<b class="pm-ax-q">Is that right\?<\/b>/.test(s8.html) || !/Not sure\? Tap Yes/.test(s8.html)) fail("the found answer isn't in order (result box · separate Is that right? · hint for the unsure)");
if (!/Your website is hosted on Netlify/.test(s8.html) || !/Yes, that's right/.test(s8.html) || !/pm-ax-mono[^>]*>N</.test(s8.html)) fail("a found developer-built site with a known host isn't asked by its host");
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
  vm.runInContext(`var PC_TICK = "<svg/>"; ${(P.match(/^const RGA_ADMIN_(?:EMAIL|GITHUB) = "[^"]*";$/gm) || []).join(" ").replace(/const /g, "var ")} ${(P.match(/^const ACC_COMMON = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_SEND = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_CHECK_ICON = `[^`]*`;$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_CONSENT_TEXT = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_PROMISE_VERSION = "[^"]*";/m) || [""])[0].replace(/^const /, "var ")} var monthDay = (x) => String(x || ""); ${(P.match(/^const ACC_FILES = \{[\s\S]*?^\};$/m) || [""])[0].replace(/^const /, "var ")} ${(P.match(/^const ACC_ICON = \{[\s\S]*?^\};$/m) || [""])[0].replace(/^const /, "var ")}`, bctx);
  for (const n of ["accPart", "accSetWhen", "accSetSend", "accMono", "accSetupHtml", "accConsentHtml", "accHostOf", "accHostMono", "accWhoOf", "accDevNote", "accDevNoteText", "accProgHtml", "accCustomSetupHtml", "accBuilderWho", "accBuilderNote", "accBuilderSetupHtml", "accFoundPill", "accDrawPlatform", "ghAppInstallHtml"]) vm.runInContext(fnSrc(P, n), bctx);
  // client_github_app_install_v1 (11-8): picking GitHub shows Install on GitHub (its block reads the install link + the wrong-repository note)
  vm.runInContext(`${(P.match(/^const GH_APP_INSTALL_URL = "[^"]*";$/m) || [""])[0].replace(/^const /, "var ")} var _ghAppNote = new Map();`, bctx);
  // client_step03_builder_v2: the send button sits UNDER the card, in [data-acc-sendrow]; the drawn string is the card's rows + that line, in page order
  const drawKey = (j, key, src, st = {}) => { const box = { innerHTML: "", querySelector: () => null }, send = { innerHTML: "", hidden: true }; const host = { ...st, _acc: { platforms: PUB, ...j }, querySelector: (q) => (q === "[data-acc-plat]" ? box : q === "[data-acc-sendrow]" ? send : null), setAttribute() {}, getAttribute: (k) => (k === "data-client-id" ? "c1" : null) }; bctx.h = host; vm.runInContext(`accDrawPlatform(h, ${JSON.stringify(key)}, ${JSON.stringify(src)})`, bctx); return box.innerHTML + send.innerHTML; };
  // 🔒 AS IF THE CLIENT HAS NO CLUE (approved step3_simple_access_v1 + v2): explainer → Who will do this? → files service → steps / note
  const N = { status: "ok", site: "joes.com", platform: "custom", confidence: "ask", host: "netlify" };
  const net = drawKey(N, "custom", "detected_confirmed");
  if (!/Hosted on Netlify/.test(net) || !/we checked joes\.com/.test(net) || !/Give RGA access to your website's files/.test(net)) fail("a developer-built site on Netlify doesn't say where it lives / what Step 2 is");
  if (!/We need access here/.test(net) || !/No need to add us here/.test(net) || !/Shows your website to visitors/.test(net) || !/Changes are made here\./.test(net) || !/<b>Your code service<\/b><span>Usually GitHub, GitLab or Bitbucket\./.test(net)) fail("Step 2 doesn't explain host vs files before asking, with the files place unnamed until they pick (step3_files_service_unknown_v1)");
  // 🔒 we can't see the code service from outside: it is never named before the client picks it (Chris 10-23: "how do we know its git?")
  if (/<b>GitHub<\/b>|Most developers use GitHub|most common/.test(net)) fail("Step 2 names a code service (or calls one most common) before the client picked it — only the host is visible from outside");
  // 🔒 two places, one arrow (step3_dev_built_step2_design_v1 option A): the files service is where we need access; the host isn't
  if (!/class="pm-ax-hf-p us">[\s\S]*?Your code service[\s\S]*?We need access here/.test(net) || !/<b>Netlify<\/b>[\s\S]*?No need to add us here/.test(net) || !/updates itself<br>in a minute or two/.test(net)) fail("Step 2 doesn't say which place we need access to (files: We need access here · host: No need to add us here · the arrow)");
  if (!/about 3 minutes/.test(net) || !/easiest if someone built it for you/.test(net)) fail("the two choices lost their time / easiest chips");
  if (/Your website's files<\/b>/.test(net)) fail("the files tile is back to a description for a header (\"Your website's files\") beside a company name");
  if (!/data-acc-who="self"/.test(net) || !/data-acc-who="dev"/.test(net) || /data-acc-send/.test(net)) fail("before choosing, Step 2 isn't \"Who will do this?\" (or Step 3's button shows already)");
  const self0 = drawKey(N, "custom", "detected_confirmed", { _accWho: "self" });
  if (!/Which code service holds your website's files\?/.test(self0) || !/data-acc-files="gitlab"/.test(self0) || /pm-ax-segb on/.test(self0) || /most common/.test(self0)
    || /rocketgrowthagency/.test(self0) || /data-acc-send/.test(self0) || !/Pick one and its steps show here/.test(self0)) fail("\"I'll do it myself\" pre-picks a code service (or shows its steps / the send button) before the client picks one");
  const self = drawKey(N, "custom", "detected_confirmed", { _accWho: "self", _accFiles: "github" });
  // 🔄 client_github_app_install_v1 (approved 11-8): GitHub = Install RGA's app (one click there, back here by itself): no collaborator
  // steps, no "I added RGA on GitHub", no Step 3 to tell RGA
  if (!/data-acc-files="gitlab"/.test(self) || !/Install Rocket Growth Agency's app on the GitHub repository your website is built from\./.test(self) || !/data-gh-app-install/.test(self) || /Collaborators|data-acc-send|I added RGA on GitHub|Tell RGA when it's done/.test(self)) fail("\"I'll do it myself\" + GitHub isn't: where are the files · Install on GitHub (no collaborator steps, no send button, no Step 3)");
  // GitHub Pages: the host IS the files service, so it's named on both sides and nothing is asked
  const ghp2 = drawKey({ ...N, host: "githubpages" }, "custom", "detected_confirmed");
  if (!/<b>GitHub<\/b>/.test(ghp2) || !/Comes with the GitHub access/.test(ghp2) || /Your code service/.test(ghp2)) fail("a GitHub Pages site doesn't say GitHub (the one host we KNOW holds the files)");
  const gl = drawKey(N, "custom", "detected_confirmed", { _accWho: "self", _accFiles: "gitlab" });
  if (!/Manage<\/b>, then <b>Members/.test(gl) || !/Maintainer/.test(gl) || !/I added RGA on GitLab/.test(gl) || !/No need to add us on Netlify/.test(gl)) fail("GitLab's steps aren't GitLab's (Manage → Members → Invite, Maintainer)");
  const bb = drawKey(N, "custom", "detected_confirmed", { _accWho: "self", _accFiles: "bitbucket" });
  if (!/Repository permissions/.test(bb) || !/<b>Write<\/b>/.test(bb)) fail("Bitbucket's steps aren't Bitbucket's (Repository settings → Repository permissions, Write)");
  // 🔒 step3_dev_built_headers_v1 (10-23): the client sends the email (not "we write a note"); GitLab / Bitbucket's free plans have 5 seats
  if (!/My developer will<\/b><small>Send them a short email ·/.test(net) || /We write a short note/.test(P)) fail("\"My developer will\" doesn't say \"Send them a short email\" (or the old \"We write a short note\" is back)");
  if (!/Free if you have fewer than 5 people on your free GitLab plan/.test(gl) || !/Free if you have fewer than 5 people on your free Bitbucket plan/.test(bb)) fail("GitLab / Bitbucket say adding us is free without the 5-seat limit (over it their private projects go read-only)");
  if (/fewer than 5 people/.test(self) || !/It can only change the repository you pick, and nothing goes live until you approve it\. Remove it anytime in GitHub\./.test(self)) fail("GitHub got the 5-seat line, or lost the app's fine print");
  if (!/User and group access/.test(bb)) fail("Bitbucket's step 2 doesn't name the other menu label (User and group access)");
  const uns = drawKey(N, "custom", "detected_confirmed", { _accWho: "self", _accFiles: "unsure" });
  if (!/Whoever built your website will know/.test(uns) || /data-acc-send/.test(uns)) fail("\"I'm not sure\" where the files are doesn't point to the developer");
  const dv = drawKey(N, "custom", "detected_confirmed", { _accWho: "dev" });
  if (!/Copy the email<\/button>/.test(dv) || /Copy the note/.test(P)) fail("the copy button says \"note\" (it's an email they send)");
  if (!/If the files aren&#39;t in GitHub, GitLab or Bitbucket|If the files aren't in GitHub, GitLab or Bitbucket/.test(dv)) fail("the developer email has no line for a site with no code service");
  if (!/Send this to your developer/.test(dv) || !/data-acc-note-copy/.test(dv) || !/mailto:\?subject=/.test(dv) || !/data-via="designer"/.test(dv) || !/I sent it to my developer/.test(dv)) fail("\"My developer will\" doesn't show the note IN Step 2 (Copy · Open in email · I sent it to my developer)");
  if (!/There&#39;s no need to add them on Netlify|There's no need to add them on Netlify/.test(dv)) fail("the developer note doesn't say to skip the paid-seat host");
  const ghp = drawKey({ ...N, host: "githubpages" }, "custom", "detected_confirmed", { _accWho: "self" });
  if (/data-acc-files=/.test(ghp) || /No need to add us on GitHub Pages/.test(ghp)) fail("GitHub Pages asks where the files are (they're on GitHub) or says to skip it");
  const unk = drawKey({ ...N, host: null }, "custom", "detected_confirmed");
  if (!/A developer built your website/.test(unk) || !/pm-ax-opt on" data-acc-who="dev"/.test(unk) || !/I sent it to my developer/.test(unk)) fail("with no host seen, \"My developer will\" isn't pre-selected");
  for (const [l, h] of [["Netlify", net], ["self", self], ["developer", dv], ["unknown", unk]]) if (/\brepository collaborator|collaborator role|\$\s?\d/i.test(h.replace(/\$\{[^}]*\}/g, ""))) fail(`the ${l} card uses jargon or a price`);
  const picked = drawKey({ status: "ok", site: "joes.com" }, "custom", "chosen");
  if (/Your developer will know where it's hosted/.test(picked) || /we checked|checked by RGA|pm-ax-fpill/.test(picked)) fail("a client who PICKED Custom-coded is told what our check saw");
  const wpT = drawKey({ status: "ok", site: "joes.com" }, "wordpress", "chosen");
  if (!/class="pm-ax-prog"/.test(wpT) || !/<b>① You do Step 2<\/b>/.test(wpT) || !/<b>② RGA accepts the invite and checks<\/b>/.test(wpT) || !/<b>③ Access confirmed<\/b>/.test(wpT)) fail("Step 3 isn't the progress line (You · RGA · Access confirmed) for every builder");
  // 🔒 EVERY BUILDER IN THE STEP 3 STANDARD (approved step3_all_builders_v1): What this does · Who will do this? · steps with where ·
  // Before you start · Good to know · designer note inline · no safe 2nd user → checklist / screen-share — from the researched file
  const wix = drawKey({ status: "ok", site: "joes.com" }, "wix", "chosen");
  if (!/data-acc-consent/.test(wix) || !/data-acc-send data-via="invite" disabled/.test(wix)) fail("the consent tick is missing, or the send button works before it's ticked");
  if (!/data-acc-send data-via="invite">/.test(drawKey({ status: "ok", site: "joes.com" }, "wix", "chosen", { _accConsent: true }))) fail("ticking consent doesn't enable the send button");
  if (/data-acc-consent/.test(drawKey({ status: "ok", site: "joes.com" }, "squareonline", "chosen"))) fail("the checklist / screen-share path asks for access consent (no access is granted)");
  if (!/What this does/.test(wix) || !/a Website Manager/.test(wix) || !/data-acc-who="dev"/.test(wix) || !/top of the Roles &amp; Permissions page|top of the Roles & Permissions page/.test(wix)) fail("Wix's Step 2 isn't What this does · Who will do this? · steps with where to look");
  if (!/Before you start/.test(wix) || !/Good to know/.test(wix) || !/Your website is on Wix/.test(wix)) fail("Wix's Step 2 lost Before you start / Good to know, or Step 1 isn't \"Your website is on Wix\"");
  const wixDev = drawKey({ status: "ok", site: "joes.com" }, "wix", "chosen", { _accWho: "dev" });
  if (!/Send this to your web designer/.test(wixDev) || !/data-acc-note-copy/.test(wixDev) || !/data-via="designer"/.test(wixDev)) fail("\"My web designer will\" on a builder doesn't show the note in Step 2");
  const sqo = drawKey({ status: "ok", site: "joes.com" }, "squareonline", "chosen", { _accWk: "share" });
  if (!/no safe way to add a second person/.test(sqo) || !/data-acc-wk="checklist"/.test(sqo) || !/Book the screen-share/.test(sqo) || !/data-via="workaround"/.test(sqo)) fail("a builder with no safe second user doesn't offer checklist / screen-share");
  const duda = drawKey({ status: "ok", site: "joes.com" }, "duda", "chosen", { _accWho: "self" });
  if (!/Send this to your web designer/.test(duda) || /data-acc-who="self"/.test(duda)) fail("Duda isn't the designer's job (only they can add us)");
  for (const k of Object.keys(PUB)) if (!["jimdo", "yola", "squareonline", "other"].includes(k) && !PUB[k].role_short) fail(`${k} has no short plain role name for the card`);
  for (const k of Object.keys(PUB)) if (k !== "other" && !(PUB[k].sources || []).length) fail(`${k}'s steps have no official source`);
  if (/Collaborators/.test(JSON.stringify(PUB.strikingly?.steps || [])) || /Collaborators/.test(JSON.stringify(PUB.carrd?.steps || []))) fail("Strikingly / Carrd steps say Collaborators again (their menus are Team / Sharing)");
  if (!PUB.wordpresscom) fail("WordPress.com isn't its own builder");
  const wfT = drawKey({ status: "ok", site: "joes.com" }, "webflow", "chosen");
  if (!/<b>② RGA sends the request, you click Accept<\/b>/.test(wfT)) fail("a request builder's Step 3 says the wrong next step");
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
for (const n of ["accHostOf", "accWhoOf", "accBuilderWho"]) vm.runInContext(fnSrc(P, n), sctx);
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
  value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "wordpress", platform_source: "hacked", detected: { status: "ok", platform: "notabuilder", confidence: "certain", signs: 999, evidence: ["x".repeat(500), 7, "", "a", "b", "c", "d", "e", "f", "g"], designer: "D".repeat(300), answer: "maybe", shopify_store: "evil.com", site: "acme.example", checked_at: "not a date" } } }) });
const ci = db.client_onboarding_records[0].data.tasks["m1.access.website"]?.client_input;
if (r.statusCode !== 200 || !ci) fail(`the server didn't save the answer (${r.statusCode} ${r.body})`);
else {
  const d = ci.detected || {};
  if (ci.platform_source !== "chosen") fail(`a junk platform_source is kept ("${ci.platform_source}")`);
  if (d.platform !== null || d.confidence !== "none" || d.signs !== 20 || d.answer !== null || d.shopify_store !== null || d.checked_at !== null) fail(`the found record isn't cleaned to its shape (${JSON.stringify(d).slice(0, 200)})`);
  if (!Array.isArray(d.evidence) || d.evidence.length > 8 || d.evidence.some((x) => x.length > 120) || (d.designer || "").length > 80) fail("the proof lines / designer name aren't capped");
}
const ok2 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
  value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "squarespace", platform_source: "detected_declined", detected: { status: "ok", platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"], answer: "no", site: "acme.example", checked_at: "2026-10-22T20:00:00Z" } } }) });
const ci2 = db.client_onboarding_records[0].data.tasks["m1.access.website"]?.client_input || {};
{ const h1 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "custom", platform_source: "detected_confirmed", detected: { status: "ok", platform: "custom", confidence: "ask", signs: 1, evidence: ["x"], answer: "yes", host: "netlify" } } }) });
  const h2 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "custom", platform_source: "detected_confirmed", detected: { status: "ok", platform: "custom", host: "evilhost" } } }) });
  if (h1.statusCode !== 200 || h2.statusCode !== 200 || db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input.detected.host !== null) fail("the server keeps an unknown host value");
  const w1 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "custom", platform_source: "chosen", who: "self", files: "gitlab" } }) });
  const wci = db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input;
  if (w1.statusCode !== 200 || wci.who !== "self" || wci.files !== "gitlab") fail("the server drops who does it / which code service");
  await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "designer", platform: "custom", platform_source: "chosen", who: "hacker", files: "ftp" } }) });
  const wj = db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input;
  if (wj.who || wj.files) fail("the server keeps a junk who / files value");
  // 🔒 never a guessed code service (step3_files_service_unknown_v1): "I added RGA" myself on a developer-built site must name GitHub / GitLab / Bitbucket
  const nf = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
    value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "custom", platform_source: "chosen", who: "self" } }) });
  if (nf.statusCode !== 400 || !/code service/.test(nf.body)) fail("the server saves \"I added RGA\" on a developer-built site with no code service named (it would be a guess)");
  const nc = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website", value: { via: "invite", platform: "wix", platform_source: "chosen" } }) });
  if (nc.statusCode !== 400) fail("the server takes an access answer WITHOUT the consent tick");
  const wc = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website", value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "wix", platform_source: "chosen" } }) });
  const wcc = db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input.consent || {};
  if (wc.statusCode !== 200 || wcc.by !== "owner@acme.test" || !wcc.at || wcc.promise !== "2026-10-23b") fail("the server doesn't stamp who / when / which promise on the consent");
  const wk1 = await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website", value: { via: "workaround", platform: "squareonline", platform_source: "chosen", workaround: "share" } }) });
  if (wk1.statusCode !== 200 || db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input.workaround !== "share") fail("the server drops the checklist / screen-share choice");
  await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website", value: { via: "workaround", platform: "squareonline", platform_source: "chosen", workaround: "send me your password" } }) });
  if (db.client_onboarding_records[0].data.tasks["m1.access.website"].client_input.workaround) fail("the server keeps a junk workaround value");
}
await req("./portal-step-input").handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.access.website",
  value: { consent: { promise: "2026-10-23b", text: "I allow Rocket Growth Agency to access my website…" }, via: "invite", platform: "squarespace", platform_source: "detected_declined", detected: { status: "ok", platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"], answer: "no", site: "acme.example", checked_at: "2026-10-22T20:00:00Z" } } }) });
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
const actx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: (x) => String(x || "").slice(0, 10), OB_WEB_TILE: "",
  adminGoogleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, admPlatforms: () => PL, state: { selectedClient: { id: CID } } });
vm.runInContext(`${(A.match(/^const STEP_EMAIL_IDS = [^\n]*;$/m) || [""])[0].replace(/^const /, "var ")} var mailWhen = (x) => String(x || "");`, actx);
for (const n of ["accDetectAdminHtml", "accessAdminHtml", "stepEmailBar", "accInviteLinkHtml"]) vm.runInContext(fnSrc(A, n), actx);
vm.runInContext(`var RGA_ACCESS_ACCOUNT = "access@x";`, actx);
vm.runInContext(`${A.slice(A.indexOf("function acCardHtml("), A.indexOf("\n}\n", A.indexOf("function acCardHtml(")) + 2)} ${fnSrc(A, "acDueChip")} ${["acMono", "acConsent", "acSite", "GH_MONO", "mvDay", "mvDueDays"].map((n) => { const at = A.search(new RegExp(`^const ${n} = `, "m")); if (at < 0) return ""; const eol = A.indexOf("\n", at); const first = A.slice(at, eol); return (first.trimEnd().endsWith("{") ? A.slice(at, A.indexOf("\n};", at) + 3) : first).replace(/^const /, "var "); }).join("\n")} var movesForSelected = () => null;`, actx);   // row 8's one card (admin_action_card_and_row8_v1)
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
if (!/<dt>Consent<\/dt><dd>✓ given by owner@acme\.test · /.test(row({ via: "invite", platform: "wix", platform_source: "chosen", consent: { by: "owner@acme.test", at: "2026-10-23T16:42:10Z", promise: "2026-10-23b" } }))) fail("admin row 8 doesn't show the client's consent (who · when · promise)");
if (!/Custom-coded · hosted on Netlify/.test(row({ via: "invite", platform: "custom", platform_source: "detected_confirmed", detected: { status: "ok", platform: "custom", signs: 1, host: "netlify", answer: "yes" } }))) fail("admin row 8 doesn't say where a developer-built site is hosted");
const dz = row({ via: "designer", platform: "other", platform_source: "designer_credit", detected: { status: "ok", platform: null, signs: 0, designer: "Exposure", designer_answer: "yes" } });
if (!/footer credits <b>Exposure<\/b> \(client: they manage it\)/.test(dz)) fail("admin row 8 doesn't show the designer credit the client confirmed");
const cctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;"), monthDay: (x) => String(x || ""), fmtDateTimeDot: (x) => String(x || ""), fmtDateShort: (x) => String(x || ""),
  googleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, stepLockOf: () => null, _rcEditing: new Set(), _accHosts: {}, ACC_FILES: {}, _accNames: Object.fromEntries(Object.entries(PL).map(([k, p]) => [k, p.name])), RC_WEB: "" });
vm.runInContext(`var rcRow = (k, st, v) => k + ":" + st[1] + ":" + v + " | "; var _accRoles = {}; var _accPickSelf = new Set(); ${(P.match(/^const RGA_ADMIN_(?:EMAIL|GITHUB) = "[^"]*";$/gm) || []).join(" ").replace(/const /g, "var ")}`, cctx);
vm.runInContext(`var _portalContractCache = {}; ${["ACC_PROMISE_ICON", "ACC_PROMISE_DO", "ACC_PROMISE_NEVER"].map((n) => ((P.match(new RegExp(`^const ${n} = [\\[{][\\s\\S]*?[\\]}];$`, "m")) || [""])[0]).replace(/^const /, "var ")).join("\n")}`, cctx); vm.runInContext(fnSrc(P, "accPromiseHtml"), cctx);
{ const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) { console.error("⚠️  INDETERMINATE — the plan-card pieces moved"); process.exit(2); } vm.runInContext(P.slice(a, b), cctx); vm.runInContext(csBlock(P, P.slice(a, b)), cctx); }   // the plan card + the client card system (client_step03_access_v1, 10-29)
for (const n of ["accPart", "accDidLine", "accStep1Name", "accSiteName", "accessTestRow", "ghAppWanted", "ghAppInstallHtml", "ghAppCardHtml", "ghAppDoneHtml", "accessCardHtml"]) vm.runInContext(fnSrc(P, n), cctx);
vm.runInContext(`${(P.match(/^const GH_APP_INSTALL_URL = "[^"]*";$/m) || [""])[0].replace(/^const /, "var ")} var _ghAppNote = new Map();`, cctx);   // client_github_app_install_v1 (11-8)
const sentCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "in_progress", client_input: { via: "designer", platform: "other", platform_source: "designer_credit", detected: { designer: "Exposure" }, at: "2026-10-22" } })}, "c1")`, cctx);
const waitCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "in_progress", check_request: { asked_at: "2026-10-22T23:00:00Z", site: "acme.example", reason: "blocked" } })}, "c1")`, cctx);
// 🔄 client_step03_access_v1 "RGA checks the builder" (the card system, 10-29): "With RGA" is the card's blue tone now (the old
// googleCardHtml small label) — the blue band names what RGA checks, ONE blue status row says by when, "Pick it yourself" is its link
if (!/<div class="pm-k5-plan pm-cs-card rga"><div class="pm-k5-h rga">[^]*?<b>RGA is checking which builder your site uses<\/b><span>you asked /.test(waitCard) || !/<div class="pm-cs-st rga">[^]*?<b>Done by [^<]+<\/b>[^]*?<span class="a"><button type="button" data-acc-pickself>Pick it yourself<\/button><\/span><\/div>/.test(waitCard) || (waitCard.match(/class="pm-cs-st /g) || []).length !== 1) fail("while RGA checks, the client's card isn't With RGA (the blue system card + ONE blue status row with Pick it yourself)");
const rgaCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "pending", check_request: { asked_at: "x", site: "acme.example", reason: "blocked" }, rga_check: { platform: "wordpress", at: "2026-10-22T23:30:00Z" } })}, "c1")`, cctx);
if (!/data-acc-rga="[^"]*&quot;wordpress&quot;/.test(rgaCard)) fail("RGA's hand check doesn't reach the client's ask");
if (!/Exposure manages your site/.test(sentCard) || /Another \/ not sure/.test(sentCard)) fail("the sent card's Step 1 says \"Another / not sure\" instead of naming the designer");

if (F.length) { console.error("🔴 step 3 auto-detect regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 3 auto-detect holds: proof line per sign (no absence claims) · store address read + counted · linked footer credits only · real WordPress sign-in = 2nd sign · a blocked site → reason + saved copy (≤2 yrs, \"looks like\" only) · Step 1 asks with proof (one sign = \"looks like\") · designer ask · nothing found → tiles · yes/no/chosen/designer saved with the record · server cleans it · admin row 8 flags a \"No\" · sent card names the designer · developer-built asked · blocked → why + 3 ways + Check it for me → RGA's hand check (admin) → the same Yes / No · email stays a draft");
