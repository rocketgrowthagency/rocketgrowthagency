// _look-step10.mjs — READ-ONLY look at step 10 as the far-along test client with THIS repo's portal.js + portal.css. Every write is blocked by the guard.
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
const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 240)));
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="approve"]', { state: "attached", timeout: 45000 });
await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => console.log("still loading"));
await page.waitForTimeout(9000); await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(6000); await page.locator(".pm-p10").first().waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
const n = await page.locator(".pm-p10").count(); console.log("p10 count", n);
if (n) {
  const row = page.locator("[id^='step-row-']", { has: page.locator(".pm-p10") }).first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
  console.log("order", await row.evaluate((el) => { const h = el.innerHTML, at = (s) => h.indexOf(s); return [at('The shot list · photos added'), at('class="pm-p10-tiles"')]; }));
  console.log("hints", await row.locator(".pm-up-hint").count(), (await row.locator(".pm-up-hint").first().innerText().catch(() => "")));
  // the note: the exact markup the code builds for a small photo (injected, since an upload would write)
  await row.locator('[data-step-toggle]').first().click({ timeout: 5000 }).catch(() => console.log('no toggle')); await page.waitForTimeout(2500);
  const t = await row.evaluate((el) => { el.scrollIntoView({ block: "start" }); const r = el.getBoundingClientRect(); return r.top + scrollY; }).catch(() => 0);
  await row.evaluate((el) => { const sl = el.querySelector(".pm-p10-shot:not([hidden]) .pm-slot"); if (sl) sl.insertAdjacentHTML("beforeend", '<div class="pm-turned pm-retake-line pm-check-note" data-check-note="x"><span><b>This photo is small, 300 × 225.</b> Google takes it, but it may look blurry on a big screen. Best at 720 pixels or wider. <b>This looks like a simple company logo on white.</b> This shot asks for your building from the street, sign visible. RGA looks at it either way.</span><span class="pm-check-acts"><button type="button" class="pm-linkbtn">Keep it</button><button type="button" class="pm-linkbtn pm-photo-rm">Replace it</button></span></div>'); });
  await row.screenshot({ path: `${out}/step10.png`, animations: "disabled", timeout: 60000 }).catch(async () => { await page.screenshot({ path: `${out}/step10.png`, fullPage: false }); });
}
} finally { await b.close(); }
