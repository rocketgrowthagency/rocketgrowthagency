// _look-step12.mjs — READ-ONLY look at step 12 (and the toggled row) as the far-along test client with THIS repo's portal.js + portal.css.
import fs from "node:fs"; import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, c = WALK_CLIENTS.main;
const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
try {
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: c.email, options: { redirect_to: "https://www.rocketgrowthagency.com/portal/" } }) })).json();
const ctx = await b.newContext({ viewport: { width: 1100, height: 1400 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname === "/portal/portal.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(`${W}/portal/portal.js`, "utf8") }));
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname === "/portal/portal.css", (r) => r.fulfill({ contentType: "text/css", body: fs.readFileSync(`${W}/portal/portal.css`, "utf8") }));
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname === "/data/playbooks/client-steps.json", (r) => r.fulfill({ contentType: "application/json", body: fs.readFileSync(`${W}/data/playbooks/client-steps.json`, "utf8") }));
const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 240)));
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="approve"]', { state: "attached", timeout: 45000 });
await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => console.log("still loading"));
await page.waitForTimeout(9000); await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(6000);
const row = page.locator("[id^='step-row-']", { has: page.locator('[data-step-toggle="m1.tracking.form_setup"]') }).first();
console.log("rows", await row.count());
await row.locator('[data-step-toggle]').first().click({ timeout: 5000 }).catch(() => console.log("no toggle")); await page.waitForTimeout(2500);
console.log("text", (await row.innerText()).replace(/\s+/g, " ").slice(0, 500));
await row.screenshot({ path: `${out}/step12.png`, animations: "disabled", timeout: 60000 });
} finally { await b.close(); }
