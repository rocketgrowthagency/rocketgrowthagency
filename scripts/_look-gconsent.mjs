// _look-gconsent.mjs — READ-ONLY: Connect's tick (brand-new test client) and the consent line (far-along test client) on the live portal. Every write is blocked; the consent read is allowed.
import fs from "node:fs"; import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true });
for (const [name, c] of Object.entries({ new: WALK_CLIENTS.new, main: WALK_CLIENTS.main })) {
  const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: c.email, options: { redirect_to: "https://www.rocketgrowthagency.com/portal/" } }) })).json();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (/portal-google-consent/.test(q.url()) && /"action":"read"/.test(q.postData() || "")) return r.fallback(); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname === "/portal/portal.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync("/Users/chris/RGA/Rocket Growth Agency Website VS Code/portal/portal.js", "utf8") }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(name, "PAGEERROR", String(e.message).slice(0, 240)));
  await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { state: "attached", timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => console.log("still loading")); await page.waitForTimeout(3000);
  const tick = page.locator("[data-gconsent]").first(), line = page.locator("[data-gconsent-line]").first();
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="oauth-google-init"],[data-jump-google],.pm-linked')].map((a) => ({ tag: a.tagName, cls: a.className, vis: !!a.offsetParent, text: a.innerText.replace(/\s+/g, " ").slice(0, 70), row: (a.closest("[data-step-id],[data-flow-id],.pm-step-row,.pm-gs,.pm-card,article,section")?.className || "").slice(0, 60), html: a.closest("[data-step-id]")?.getAttribute("data-step-id") || "" })));
  console.log(name, "connect surfaces:", JSON.stringify(links).slice(0, 900));
  const v = await page.evaluate(() => document.querySelector(".pv-setup, [data-view-panel='setup'], #portalMain, main")?.innerText.replace(/\s+/g, " ").slice(0, 500));
  console.log(name, "[setup text]", v);
  console.log(name, "tick forms:", await page.locator("[data-gconsent]").count(), "| lines:", await page.locator("[data-gconsent-line]").count());
  if (await tick.count()) {
    await tick.scrollIntoViewIfNeeded(); const row = tick.locator("xpath=ancestor::*[contains(@class,'pm-step-row') or contains(@class,'pm-row') or self::li][1]");
    const host = (await row.count()) ? row : tick; console.log(name, "[tick text]", (await host.innerText()).replace(/\s+/g, " ").slice(0, 420)); await host.screenshot({ path: `${out}/gconsent-tick.png` });
    const link = tick.locator("a[href*=oauth-google-init]"); const box = await link.boundingBox(); console.log(name, "connect button box", JSON.stringify(box));
    await link.click(); await page.waitForTimeout(800); console.log(name, "[unticked press]", (await page.locator('[role="dialog"]').first().innerText().catch(() => "no dialog")).replace(/\s+/g, " ").slice(0, 160));
  }
  if (await line.count()) { await line.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500); console.log(name, "[line]", (await line.innerText()).replace(/\s+/g, " ").slice(0, 260)); await line.screenshot({ path: `${out}/gconsent-line.png` }).catch(() => {}); }
  await ctx.close();
}
await b.close();
