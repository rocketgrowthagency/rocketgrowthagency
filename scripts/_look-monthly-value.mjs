// _look-monthly-value.mjs — READ-ONLY: the Ongoing work tab's 'What we watched' card as the far-along test client, with the local portal.js. Every write is blocked; portal-monthly-value is answered from a JSON file (argv[3]) so an undeployed function can be looked at.
import fs from "node:fs"; import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, c = WALK_CLIENTS[process.argv[4] || "main"];
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: c.email, options: { redirect_to: "https://www.rocketgrowthagency.com/portal/" } }) })).json();
const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
await ctx.route("**/.netlify/functions/portal-deliverables", (r) => r.continue());
await ctx.route("**/.netlify/functions/portal-monthly-value", (r) => r.fulfill({ contentType: "application/json", body: fs.readFileSync(process.argv[3], "utf8") }));
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname === "/portal/portal.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync("/Users/chris/RGA/Rocket Growth Agency Website VS Code/portal/portal.js", "utf8") }));
const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 240)));
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="ongoing"]', { state: "attached", timeout: 45000 });
await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => console.log("still loading"));
await page.waitForTimeout(4000);
await page.evaluate(() => document.querySelector('.portal-nav a[data-view="ongoing"]')?.click()); await page.waitForTimeout(4000);
const host = page.locator('[data-og-card="value"]').first();
console.log("host count", await page.locator('[data-og-card="value"]').count(), "hidden", await host.evaluate((e) => e.hidden).catch(() => "n/a"));
if (await host.count()) { await host.scrollIntoViewIfNeeded(); console.log("[card]", (await host.innerText()).replace(/\s+/g, " ")); await host.screenshot({ path: `${out}/monthly-value.png` }); }
await page.setViewportSize({ width: 390, height: 900 }); await page.waitForTimeout(800);
if (await host.count()) await host.screenshot({ path: `${out}/monthly-value-phone.png` });
await b.close();
