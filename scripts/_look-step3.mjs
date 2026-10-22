// _look-step3.mjs — READ-ONLY: the live portal as the walk client with THIS repo's portal.js/css, every write blocked; clicks through
// step 3 (Update → Show all → Custom-coded) and screenshots each stage. node scripts/_look-step3.mjs <outdir>
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true }); const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow && !/portal-site-platform/.test(q.url())) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
const local = { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/shared/step-lock.js": "shared/step-lock.js" };
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(4000);
const row = page.locator('[id="step-row-m1.access.website"]');
if (await row.evaluate((e) => e.classList.contains("is-collapsed"))) { await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click()); await page.waitForTimeout(500); }
const snap = async (n) => { await row.screenshot({ path: `${out}/${n}.png` }); console.log(n, (await row.innerText()).replace(/\s+/g, " ").slice(0, 260)); };
await snap("1-done");
let tc = Date.now(); await row.locator("[data-acc-redo]").click(); for (const ms of [30, 300, 900]) { await page.waitForTimeout(ms); await row.screenshot({ path: `${out}/2a-after-${ms}.png` }); console.log("at", ms, (await row.innerText()).replace(/\s+/g, " ").slice(150, 330)); } await page.waitForFunction(() => /UPDATING/i.test(document.querySelector('[id="step-row-m1.access.website"] .pm-pill')?.textContent || ""), { timeout: 30000 }); console.log("UPDATE took", Date.now() - tc, "ms"); await page.waitForTimeout(1500); await snap("2-picker");
const more = row.locator("[data-acc-more]"); if (await more.count()) { await more.click(); await page.waitForTimeout(300); await snap("3-all"); }
await row.locator('[data-acc-pick="custom"]').click(); await page.waitForTimeout(500); await snap("4-custom");
tc = Date.now(); await row.locator("[data-acc-cancel]").click(); await page.waitForFunction(() => /^DONE$/i.test((document.querySelector('[id="step-row-m1.access.website"] .pm-pill')?.textContent || "").trim()), { timeout: 30000 }); console.log("CANCEL took", Date.now() - tc, "ms"); await snap("5-cancelled");
await b.close();
