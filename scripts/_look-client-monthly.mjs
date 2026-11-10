// _look-client-monthly.mjs — READ-ONLY: the client's side of the monthly cycle on the LIVE portal as the walk client (RGA):
// Dashboard, For your approval, Reports, Ongoing work; desktop + phone screenshots and the visible text of each.
// Every write is blocked by the guard. node --env-file=.env scripts/_look-client-monthly.mjs <outdir>
import fs from "node:fs";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const out = process.argv[2] || "/tmp"; fs.mkdirSync(out, { recursive: true });
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
const VIEWS = (process.argv[3] || "dashboard,approve,approvals,reports,ongoing").split(",");
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true });
for (const [tag, vp] of [["desk", { width: 1200, height: 1000 }], ["phone", { width: 400, height: 860 }]]) {
  const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
  const ctx = await b.newContext({ viewport: vp });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) { console.log("BLOCKED", q.method(), q.url().replace(/[?].*/,"").slice(0,120)); } if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
  await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { state: "attached", timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
  for (const v of VIEWS) {
    await page.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), v);
    await page.waitForTimeout(5000);
    if (v === "reports") { await page.evaluate(() => { const b = [...document.querySelectorAll(".pv-reports button, .pv-reports summary, [class*='pv-'] button")].find((x) => /Read your report/i.test(x.textContent || "")); if (b) b.click(); }); await page.waitForTimeout(6000); }
    await page.screenshot({ path: `${out}/${tag}-${v}.png`, fullPage: true });
    if (tag === "desk") {
      const txt = await page.evaluate(() => { const m = [...document.querySelectorAll("[class*='pv-']")].find((e) => e.offsetParent); return (m || document.querySelector("main") || document.body).innerText; });
      console.log(`\n===== ${v} =====\n` + txt.replace(/\n{2,}/g, "\n").slice(0, 3500));
    }
  }
  await ctx.close();
}
await b.close();
