// _look-after2.mjs — READ-ONLY look at the worktree's CODE against the live data. Serves /portal /admin /shared /data from SITE_DIR, blocks every write (guard).
// node --env-file=.env scripts/_look-after2.mjs <outdir> portal|admin <views...>   (WALK=main|new|month2 picks the portal client)
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE = process.env.SITE_DIR, out = process.argv[2], mode = process.argv[3], views = process.argv.slice(4);
fs.mkdirSync(out, { recursive: true });
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".mjs": "text/javascript" };
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true });
const email = mode === "portal" ? WALK_CLIENTS[process.env.WALK || "main"].email : "hello@rocketgrowthagency.com";
const redirect = mode === "portal" ? "https://www.rocketgrowthagency.com/portal/" : "https://www.rocketgrowthagency.com/admin/";
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email, options: { redirect_to: redirect } }) })).json();
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
await ctx.route("**/*", (r) => {
  const q = r.request(), u = new URL(q.url());
  if (u.hostname.endsWith("rocketgrowthagency.com") && q.method() === "GET" && /^\/(admin|portal|shared|data)\//.test(u.pathname)) {
    let f = path.join(SITE, u.pathname); if (u.pathname.endsWith("/")) f = path.join(f, "index.html");
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || "application/octet-stream", headers: { "cache-control": "no-store" } });
  }
  const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host });
  if (!d.allow) { console.log("BLOCKED", q.method(), q.url().replace(/[?].*/, "").slice(0, 100)); return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); }
  return r.fallback();
});
if (process.env.BLOG_FIX) await ctx.route("**/.netlify/functions/admin-blog", (r) => { const it = (n, p) => Array.from({ length: n }, (_, i) => ({ slug: `-post-${i + 1}`, reason: "No clicks in 90 days" })); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", rows: [], decisions: [], audit: { keep: [], noindex: it(24, "x"), waiting: [], correct_now: [], batches: [{ key: "b1", items: it(12, "a") }, { key: "b2", items: it(12, "b") }] }, test: { state: "ready", line: "10 pairs, read Feb 2, 2027" } }) }); });
if (process.env.MATURE_FIX) { const H = fs.readFileSync(process.env.MATURE_FIX, "utf8"); const M = (n) => `2026-${String(n).padStart(2, "0")}-01`; await ctx.route("**/.netlify/functions/admin-monthly-health", (r) => r.fulfill({ status: 200, contentType: "application/json", body: H })); await ctx.route("**/.netlify/functions/admin-months", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, current: M(11), next: M(12), months: [[7, 2], [8, 3], [9, 4], [10, 5]].map(([m, n]) => ({ month: M(m), number: n, status: "closed" })).concat([{ month: M(11), number: 6, status: "open" }]) }) })); }
await ctx.route("**/.netlify/functions/walkthrough-outcome", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
if (mode === "portal") {
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { state: "attached", timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
  for (const v of views) {
    await page.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), v);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${out}/${process.env.WALK || "main"}-${v}.png`, fullPage: true });
    await page.evaluate(() => { document.querySelectorAll("[data-og-m1-past] details").forEach((d) => { d.open = true; }); });
    await page.screenshot({ path: `${out}/${process.env.WALK || "main"}-${v}.png`, fullPage: true });
    const txt = await page.evaluate(() => { const m = [...document.querySelectorAll("[class*='pv-']")].find((e) => e.offsetParent); return (m || document.body).innerText; });
    fs.writeFileSync(`${out}/${process.env.WALK || "main"}-${v}.txt`, txt);
  }
} else {
  await page.waitForTimeout(6000);
  for (const v of views) {   // v = name=query
    const [n, qs] = v.split("="); if (qs === "console") { if (!page.url().includes("/admin/")) { await page.goto("https://www.rocketgrowthagency.com/admin/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {}); await page.waitForTimeout(6000); } await page.evaluate(async () => { const m = await import("/admin/walkthrough.js?v=20261110n"); m.openWalkthroughConsole({ id: "fixture", business: "Nathan's Towing", email: "nathan@example.test", phone: "(310) 555-0100", city: "Hayward", auditSummary: "You are #7 on the map for tow truck near me\n12 reviews vs 80+ for the top 3\nPrimary category is Auto repair", lastNote: "Wants more calls from Hayward." }, (() => { for (const k of Object.keys(localStorage)) if (/auth-token/.test(k)) { try { return JSON.parse(localStorage.getItem(k)).access_token; } catch {} } return "tok"; })(), { both: "Fri Nov 13, 10:00 AM" }); }); await page.waitForTimeout(1500); await page.evaluate(() => { document.querySelectorAll("[data-wt-beat]").forEach((d, i) => { if (i === 0) d.open = true; }); }); await page.waitForTimeout(4000); await page.evaluate(() => { document.querySelectorAll("[data-wt-beat]")[1].open = true; document.querySelectorAll("[data-wt-beat]")[0].open = false; }); await page.waitForTimeout(3500); await page.screenshot({ path: `${out}/admin-console-beats.png` }); await page.evaluate(() => document.querySelector("[data-wt-out=yes]")?.click()); await page.waitForTimeout(6000); await page.screenshot({ path: `${out}/admin-start-as-client.png` }); fs.writeFileSync(`${out}/admin-console.txt`, await page.evaluate(() => document.querySelector(".wt-box")?.innerText || "")); continue; } if (qs === "client-monthly") { if (!page.url().includes("/admin/")) { await page.goto("https://www.rocketgrowthagency.com/admin/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {}); await page.waitForTimeout(6000); } await page.evaluate(() => { const c = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^Rocket Growth Agency$/.test((e.textContent || "").trim()) && e.offsetParent)[0]; (c && (c.closest("[data-client-id], a, button, .pipeline-card, div") || c)).click(); }); await page.waitForTimeout(6000); await page.evaluate(() => { document.querySelector("[data-tab=monthlynew], [data-client-tab=monthlynew]")?.click(); }); await page.waitForTimeout(9000); await page.evaluate(() => { document.querySelectorAll(".ob-phase .ob-ph-h").forEach((h) => { if (/Account health|Every quarter/.test(h.textContent) && h.getAttribute("aria-expanded") !== "true") h.click(); }); }); await page.waitForTimeout(3000); } else if (qs.startsWith("nav:")) { if (!page.url().includes("/admin/")) { await page.goto("https://www.rocketgrowthagency.com/admin/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {}); await page.waitForTimeout(6000); } await page.evaluate((id) => document.querySelector(`[data-nav="${id}"]`)?.click(), qs.slice(4)); await page.waitForTimeout(9000); } else { await page.goto(`https://www.rocketgrowthagency.com/admin/${qs}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {}); await page.waitForTimeout(9000); }
    await page.screenshot({ path: `${out}/admin-${n}.png`, fullPage: true });
    fs.writeFileSync(`${out}/admin-${n}.txt`, await page.evaluate(() => document.querySelector(".admin-main")?.innerText || document.body.innerText));
  }
}
await b.close();
