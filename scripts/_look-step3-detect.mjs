// _look-step3-detect.mjs — READ-ONLY: step 3 "Check what we found" (step3_auto_detect_v1) in the real browser on the live portal as the
// walk client, with THIS repo's portal.js/css. The site check is FAKED per situation; every save is caught (never written). node scripts/_look-step3-detect.mjs <outdir>
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true }); const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
const local = { "/data/site-platforms.json": "data/site-platforms.json", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json", "/data/playbooks/playbooks.json": "data/playbooks/playbooks.json", "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/shared/step-lock.js": "shared/step-lock.js" };
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
const PL = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(SITE_DIR, "data/site-platforms.json"), "utf8")).platforms).map(([k, { rga, ...p }]) => [k, p]));
const SC = {
  wp: { status: "ok", platform: "wordpress", confidence: "stated", signs: 3, evidence: ["WordPress files on your pages (/wp-content/)", "A WordPress tag in your page code", "A WordPress sign-in page (/wp-login.php)"], designer: null, shopify_store: null, site: "joesplumbing.com" },
  wix1: { status: "ok", platform: "wix", confidence: "ask", signs: 1, evidence: ["Images stored on Wix (static.wixstatic.com)"], designer: null, shopify_store: null, site: "joesplumbing.com" },
  des: { status: "ok", platform: null, confidence: "none", signs: 0, evidence: [], designer: { name: "Exposure" }, shopify_store: null, site: "bertdorrroofing.com" },
  shop: { status: "ok", platform: "shopify", confidence: "stated", signs: 3, evidence: ["Files stored on Shopify (cdn.shopify.com)", "A Shopify theme in your page code", "Your store address: joes-store.myshopify.com"], designer: null, shopify_store: "joes-store.myshopify.com", site: "joesstore.com" },
  none: { status: "ok", platform: null, confidence: "none", signs: 0, evidence: [], designer: null, shopify_store: null, site: "rocketgrowthagency.com" },
  blocked: { status: "couldnt_check", platform: null, confidence: "none", signs: 0, evidence: [], designer: null, shopify_store: null, site: "dallyhaarroofing.com", reason: "blocked" },
  dev: { status: "ok", platform: "custom", confidence: "ask", signs: 1, evidence: ["Your pages load developer build files (/assets/styles-CNMhkxsr.css)"], designer: null, shopify_store: null, site: "ohhrats.com" },
  devN: { status: "ok", platform: "custom", confidence: "ask", signs: 1, evidence: ["Your site is hosted on Netlify"], designer: null, shopify_store: null, site: "joesplumbing.com", host: "netlify" },
  down: { status: "couldnt_check", platform: null, confidence: "none", signs: 0, evidence: [], designer: null, shopify_store: null, site: "joesplumbing.com" },
};
let cur = "wp", saved = null;
// REAL=1: the live site check goes through (it only READS the client's public homepage; portal-site-platform writes nothing)
if (process.env.REAL) await ctx.route("**/.netlify/functions/portal-site-platform", (r) => r.continue());
let slow = 0;
if (!process.env.REAL) await ctx.route("**/.netlify/functions/portal-site-platform", async (r) => { if (slow) await new Promise((z) => setTimeout(z, slow)); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...SC[cur], platforms: PL }) }); });
await ctx.route("**/.netlify/functions/portal-step-input", (r) => { saved = JSON.parse(r.request().postData() || "{}"); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "caught by the harness (not saved)" }) }); });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
page.on("response", async (r) => { if (/portal-site-platform/.test(r.url())) { try { const j = await r.json(); console.log("SITE CHECK", JSON.stringify({ archive_why: j.archive_why, status: j.status, platform: j.platform, confidence: j.confidence, signs: j.signs, reason: j.reason, source: j.source, archived_at: j.archived_at, evidence: j.evidence, site: j.site })); } catch {} } });
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
const open = async () => {
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(3000);
  const row = page.locator('[id="step-row-m1.access.website"]');
  if (await row.evaluate((e) => e.classList.contains("is-collapsed"))) { await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click()); await page.waitForTimeout(400); }
  if (cur === "wp" && !globalThis.__doneShot) { globalThis.__doneShot = 1; await row.screenshot({ path: `${out}/done-card.png` }); console.log("[done-card]", (await row.innerText()).replace(/\s+/g, " ").slice(0, 420)); }
  if (cur === "wp") slow = 3500;
  if (await row.locator("[data-acc-redo]").count()) await row.locator("[data-acc-redo]").first().click();
  if (cur === "wp") { await page.waitForTimeout(900); await row.screenshot({ path: `${out}/checking.png` }); console.log("[checking]", (await row.innerText()).replace(/\s+/g, " ").slice(0, 300)); slow = 0; }
  await page.waitForSelector('[id="step-row-m1.access.website"] [data-acc-part="1"]', { timeout: 30000 }); await page.waitForTimeout(400);
  return row;
};
const txt = async (row) => (await row.locator("[data-acc-plat]").innerText()).replace(/\s+/g, " ").slice(0, 420);
const shot = async (row, n) => { await row.screenshot({ path: `${out}/${n}.png` }); console.log(`[${n}]`, await txt(row)); };
const run = async (name, fn) => { cur = name; saved = null; await page.reload({ waitUntil: "domcontentloaded" }); const row = await open(); await shot(row, `${name}-1`); await fn(row); };
if (process.env.REAL) { cur = "real"; const row = await open(); await page.waitForTimeout(1500); await shot(row, "real-1"); await b.close(); process.exit(0); }
if (process.env.PROMISE) { cur = "wp"; const row = await open();
  await row.screenshot({ path: `${out}/promise-folded.png` }); console.log("[folded]", (await row.locator(".pm-ax-promise > summary").innerText()).replace(/\s+/g, " "));
  await row.locator(".pm-ax-promise > summary").click(); await page.waitForTimeout(250); await row.locator(".pm-ax-promise").screenshot({ path: `${out}/promise-open.png` });
  console.log("[open]", (await row.locator(".pm-ax-letter").innerText()).replace(/\s+/g, " ").slice(0, 300));
  await row.getByRole("button", { name: /How this step works/ }).first().click({ timeout: 8000 }).catch((e) => console.log("how-btn", String(e).slice(0, 80))); await page.waitForTimeout(400);
  const hb = row.locator(".how-body").first(); if (await hb.count()) { await hb.screenshot({ path: `${out}/how.png` }); console.log("[how]", (await hb.innerText()).replace(/\s+/g, " ").slice(0, 400)); }
  await b.close(); process.exit(0); }
await run("wp", async (row) => { await row.locator("[data-acc-yes]").click(); await page.waitForTimeout(300); await shot(row, "wp-2-yes"); await row.locator("[data-acc-send]").click(); await page.waitForTimeout(800); console.log("SAVED wp", JSON.stringify(saved && saved.value)); });
await run("wix1", async (row) => { await row.locator("[data-acc-no]").click(); await page.waitForTimeout(300); await shot(row, "wix1-2-no"); await row.locator("[data-acc-back]").click(); await page.waitForTimeout(200); await shot(row, "wix1-3-back"); await row.locator("[data-acc-no]").click(); await page.waitForTimeout(200); await row.locator('[data-acc-pick="squarespace"]').click(); await page.waitForTimeout(300); await row.locator("[data-acc-send]").click(); await page.waitForTimeout(800); console.log("SAVED wix1", JSON.stringify(saved && saved.value)); });
await run("des", async (row) => { await row.locator("[data-acc-dyes]").click(); await page.waitForTimeout(300); await shot(row, "des-2-yes"); console.log("NOTE", (await row.locator("[data-acc-mail]").innerText()).slice(0, 200)); await row.locator("[data-acc-designer-done]").click(); await page.waitForTimeout(800); console.log("SAVED des", JSON.stringify(saved && saved.value)); });
await run("shop", async (row) => { await row.locator("[data-acc-yes]").click(); await page.waitForTimeout(300); console.log("STORE FIELD =", await row.locator("[data-acc-store]").inputValue()); await shot(row, "shop-2-yes"); });
await run("blocked", async (row) => { await row.locator("[data-acc-check]").click(); await page.waitForTimeout(800); console.log("SAVED blocked", JSON.stringify(saved && saved.value)); });
await run("dev", async (row) => { await row.locator("[data-acc-yes]").click(); await page.waitForTimeout(300); await shot(row, "dev-2-yes"); await row.locator("[data-acc-send]").click(); await page.waitForTimeout(800); console.log("SAVED dev", JSON.stringify(saved && saved.value).slice(0, 200)); });
await run("devN", async (row) => {
  await row.locator("[data-acc-yes]").click(); await page.waitForTimeout(300); await shot(row, "devN-2-choose");
  await row.locator('[data-acc-who="dev"]').click(); await page.waitForTimeout(300); await shot(row, "devN-3-dev");
  await row.locator("[data-acc-send]").click(); await page.waitForTimeout(800); console.log("SAVED devN dev", JSON.stringify(saved && saved.value).slice(0, 160));
  await row.locator('[data-acc-who="self"]').click(); await page.waitForTimeout(300); await shot(row, "devN-4-self");
  await row.locator('[data-acc-files="gitlab"]').click(); await page.waitForTimeout(300); console.log("GITLAB", (await row.locator("[data-acc-part='2']").innerText()).replace(/\s+/g, " ").slice(0, 360));
  await row.locator("[data-acc-send]").click(); await page.waitForTimeout(800); console.log("SAVED devN self", JSON.stringify(saved && saved.value).slice(0, 160));
  await row.locator('[data-acc-files="unsure"]').click(); await page.waitForTimeout(300); console.log("UNSURE", (await row.locator("[data-acc-part='2']").innerText()).replace(/\s+/g, " ").slice(-160), "| step3:", (await row.locator("[data-acc-part='3']").innerText()).replace(/\s+/g, " "));
});
await run("none", async (row) => {


  const vis = () => row.evaluate((r) => [...r.querySelectorAll(".pm-ax-tile")].filter((t) => t.offsetParent).map((t) => Math.round(t.getBoundingClientRect().height)));
  console.log("TILES closed", JSON.stringify(await vis())); await row.locator("[data-acc-more]").click(); await page.waitForTimeout(200);
  console.log("TILES open", JSON.stringify(await vis()), "button:", await row.locator("[data-acc-more]").innerText()); await shot(row, "none-2-open");
  await row.locator("[data-acc-more]").click(); await page.waitForTimeout(200); console.log("TILES closed again", (await vis()).length, "button:", await row.locator("[data-acc-more]").innerText());
  for (const k of ["wix", "squarespace", "godaddy", "shopify", "webflow", "wordpresscom", "squareonline", "duda", "other", "hubspot"]) {
    const ch = row.locator("[data-acc-change]"); if (await ch.count()) { await ch.click(); await page.waitForTimeout(200); }
    const more = row.locator("[data-acc-more]"); if (await more.count() && (await more.getAttribute("aria-expanded")) !== "true" && !(await row.locator(`[data-acc-pick="${k}"]`).isVisible())) { await more.click(); await page.waitForTimeout(150); }
    await row.locator(`[data-acc-pick="${k}"]`).click(); await page.waitForTimeout(250);
    console.log(`B ${k} ::`, (await row.locator("[data-acc-part='2']").innerText()).replace(/\s+/g, " ").slice(0, 210), "|| S3:", (await row.locator("[data-acc-part='3']").innerText()).replace(/\s+/g, " ").slice(-60));
    if (k === "wix") { await shot(row, "b-wix"); await row.locator('[data-acc-who="dev"]').click(); await page.waitForTimeout(200); await shot(row, "b-wix-dev"); await row.locator("[data-acc-send]").click(); await page.waitForTimeout(700); console.log("SAVED wix dev", JSON.stringify(saved && saved.value).slice(0, 120)); await row.locator('[data-acc-who="self"]').click(); await page.waitForTimeout(200); }
    if (k === "squareonline") { await shot(row, "b-sqo"); await row.locator('[data-acc-wk="share"]').click(); await page.waitForTimeout(200); await row.locator("[data-acc-send]").click(); await page.waitForTimeout(700); console.log("SAVED sqo", JSON.stringify(saved && saved.value).slice(0, 120)); }
  }
});
await run("down", async () => {});
await b.close();
