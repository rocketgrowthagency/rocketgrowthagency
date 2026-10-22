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

// ── 2 · the portal's Step 1, RUN
const P = read("portal/portal.js");
const pctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), _accNames: {}, drew: [] });
vm.runInContext(`${(P.match(/^const ACC_TAG = \{[^\n]*\};$/m) || [""])[0].replace(/^const /, "var ")}`, pctx);
for (const n of ["accPart", "accMono", "accProofHtml", "accDrawFound"]) vm.runInContext(fnSrc(P, n), pctx);
vm.runInContext(`function accDrawPlatform(host, key, source) { drew.push([key, source]); }`, pctx);
const step1 = (j) => { pctx.drew = []; const box = { innerHTML: "" }; const host = { _acc: { platforms: PUB, site: "joes.com", ...j }, querySelector: (s) => (s === "[data-acc-plat]" ? box : null), setAttribute() {} };
  vm.runInContext(`accDrawFound(h)`, Object.assign(pctx, { h: host })); return { html: box.innerHTML, drew: pctx.drew }; };
const s1 = step1({ platform: "wordpress", confidence: "stated", signs: 2, evidence: ["WordPress files on your pages (/wp-content/)", "A WordPress tag in your page code"] });
if (!/Check what we found/.test(s1.html) || !/Your website is on WordPress/.test(s1.html) || !/data-acc-yes/.test(s1.html) || !/data-acc-no/.test(s1.html)) fail("a found builder isn't asked (\"Check what we found\" + Yes / No)");
if (!/What we found on joes\.com/.test(s1.html) || !/A WordPress tag in your page code/.test(s1.html)) fail("the ask doesn't show its proof lines");
const s2 = step1({ platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"] });
if (/is on Wix/.test(s2.html) || !/It looks like Wix/.test(s2.html)) fail("one sign says \"is on\" (it must say \"It looks like… please check\")");
const s3 = step1({ platform: null, confidence: "none", signs: 0, evidence: [], designer: { name: "Exposure" } });
if (!/A web designer may manage your site/.test(s3.html) || !/data-acc-dyes/.test(s3.html) || !/Site by Exposure/.test(s3.html)) fail("a footer credit doesn't ask about the web designer");
const s4 = step1({ platform: null, confidence: "none", signs: 0, evidence: [] });
if (s4.html || !s4.drew.length || s4.drew[0][0] !== null) fail("nothing found doesn't go straight to the tiles");
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
const v4 = await save({ platform: null, confidence: "none", signs: 0, evidence: [], designer: { name: "Exposure" } }, "other", null, "designer_credit");
if (v4.platform_source !== "designer_credit" || v4.detected?.designer !== "Exposure") fail("the designer path doesn't save designer_credit + the designer's name");

// ── 4 · the server keeps it cleaned
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
globalThis.__rgaFetchDeadlineInstalled = true;
const CID = "11111111-2222-4333-8444-555555555555";
let db = {};
const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  if (url.includes("/auth/v1/user")) return J({ id: "client-u", email: "owner@acme.test" });
  if (url.includes("notify-rga")) return J({ ok: true, delivered: true });
  if (/googleapis|openai|anthropic/.test(url)) return J({}, 404);
  const u = new URL(url); const t = u.pathname.split("/").pop(); const rows = db[t] || (db[t] = []);
  const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v));
  const hit = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
  if (method === "PATCH") { for (const r of hit) Object.assign(r, body); return J(hit); }
  if (method === "POST") { const row = { id: `n${rows.length}`, ...(body || {}) }; rows.push(row); return J([row]); }
  return J(hit);
};
db = { client_portal_access: [{ portal_email: "owner@acme.test", client_id: CID }], profiles: [], clients: [{ id: CID, workspace_id: "w1", business_name: "Acme Plumbing", website_url: "https://acme.example" }],
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
if (ok2.statusCode !== 200 || ci2.platform_source !== "detected_declined" || ci2.detected?.platform !== "wix" || ci2.detected?.answer !== "no") fail("a real \"No\" isn't kept as detected_declined with what we found");

// ── 5 · admin row 8 + the client's sent card
const A = read("admin/admin.js");
const actx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: (x) => String(x || "").slice(0, 10),
  adminGoogleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, admPlatforms: () => PL, state: { selectedClient: { id: CID } } });
for (const n of ["accDetectAdminHtml", "accessAdminHtml"]) vm.runInContext(fnSrc(A, n), actx);
const row = (c) => vm.runInContext(`accessAdminHtml(${JSON.stringify({ status: "in_progress", client_input: c })})`, actx);
const no = row(ci2);
if (!/Our site check:<\/b> Wix · 1 sign/.test(no) || !/is-check/.test(no) || !/<b>Check first:<\/b> the client said no and picked Squarespace/.test(no)) fail("admin row 8 doesn't flag a \"No\" (our check vs the client's pick)");
const yes = row({ via: "invite", platform: "wordpress", platform_source: "detected_confirmed", detected: { status: "ok", platform: "wordpress", signs: 3, answer: "yes" } });
if (!/<b>Client:<\/b> confirmed WordPress/.test(yes) || /is-check/.test(yes)) fail("admin row 8 doesn't show a confirmed builder plainly");
const dz = row({ via: "designer", platform: "other", platform_source: "designer_credit", detected: { status: "ok", platform: null, signs: 0, designer: "Exposure", designer_answer: "yes" } });
if (!/footer credits <b>Exposure<\/b> \(client: they manage it\)/.test(dz)) fail("admin row 8 doesn't show the designer credit the client confirmed");
const cctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || ""), fmtDateTimeDot: (x) => String(x || ""), fmtDateShort: (x) => String(x || ""),
  googleCardHtml: (o) => `<card>${o.small} ¦ ${o.title} ¦ ${o.body || ""} ¦ ${o.act || ""}</card>`, stepLockOf: () => null, _rcEditing: new Set(), _accNames: Object.fromEntries(Object.entries(PL).map(([k, p]) => [k, p.name])), RC_WEB: "" });
vm.runInContext(`var rcRow = (k, st, v) => k + ":" + st[1] + ":" + v + " | "; var _accRoles = {}; ${(P.match(/^const ACC_TAG = \{[^\n]*\};$/m) || [""])[0].replace(/^const /, "var ")}`, cctx);
for (const n of ["accPart", "accDidLine", "accStep1Name", "accessCardHtml"]) vm.runInContext(fnSrc(P, n), cctx);
const sentCard = vm.runInContext(`accessCardHtml({ id: "m1.access.website" }, ${JSON.stringify({ status: "in_progress", client_input: { via: "designer", platform: "other", platform_source: "designer_credit", detected: { designer: "Exposure" }, at: "2026-10-22" } })}, "c1")`, cctx);
if (!/Exposure manages your site/.test(sentCard) || /Another \/ not sure/.test(sentCard)) fail("the sent card's Step 1 says \"Another / not sure\" instead of naming the designer");

if (F.length) { console.error("🔴 step 3 auto-detect regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 3 auto-detect holds: proof line per sign (no absence claims) · store address read + counted · linked footer credits only · real WordPress sign-in = 2nd sign · Step 1 asks with proof (one sign = \"looks like\") · designer ask · nothing found → tiles · yes/no/chosen/designer saved with the record · server cleans it · admin row 8 flags a \"No\" · sent card names the designer");
