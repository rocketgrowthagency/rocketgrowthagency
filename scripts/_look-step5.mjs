// _look-step5.mjs — READ-ONLY: client step 5 (the keyword plan) on the live portal as the walk client, with THIS repo's portal.js/css.
// Every write is blocked by the guard. node scripts/_look-step5.mjs <outdir>
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true }); const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
const local = { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/shared/step-lock.js": "shared/step-lock.js", "/data/playbooks/playbooks.json": "data/playbooks/playbooks.json", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json" };
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(3000);
const row = page.locator(`[id="step-row-${process.env.STEP || "m1.strategy.keywords_locations"}"]`);
if (await row.evaluate((e) => e.classList.contains("is-collapsed"))) { await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click()); await page.waitForTimeout(500); }
if (process.env.WAIT) await page.waitForSelector(process.env.WAIT, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(500);
if (process.env.DUMP) console.log(await row.evaluate((r) => [...r.children].map((c) => { const cs = getComputedStyle(c); return `${c.tagName.toLowerCase()}.${[...c.classList].join(".")} h=${Math.round(c.getBoundingClientRect().height)} bt=${cs.borderTopWidth} bb=${cs.borderBottomWidth} hidden=${c.hidden}`; }).join("\n")));
await row.screenshot({ path: `${out}/${process.env.STEP || "step5"}.png` }); console.log(`[${process.env.STEP || "step5"}]`, (await row.innerText()).replace(/\s+/g, " ").slice(0, 1400));
await b.close();
