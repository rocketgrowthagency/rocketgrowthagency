// _look-step5-stages.mjs — READ-ONLY: client step 5 in EVERY stage, on the live portal as the walk client. The walk client's real
// step 5 task is read, then reshaped IN THE BROWSER ONLY per stage (building · drafted · locked · looks right · not right · done with
// nothing recorded). Writes are blocked. PORTAL_JS=<file> renders an older portal.js. node scripts/_look-step5-stages.mjs <outdir> [prefix]
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp", pre = process.argv[3] || "now";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
const STEP = "m1.strategy.keywords_locations";
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true });
let stage = "locked";
const reshape = (t) => {
  const base = { ...t }; delete base.client_ok_at; delete base.client_flagged;
  const recent = new Date(Date.now() - 2 * 86400000).toISOString();
  if (stage === "building") return { status: "in_progress", started_at: recent };
  if (stage === "drafted") return { ...base, status: "in_progress", completed_at: null };
  if (stage === "locked") return { ...base, status: "done", completed_at: recent };
  if (stage === "looks_right") return { ...base, status: "done", completed_at: recent, client_ok_at: recent };
  if (stage === "not_right") return { ...base, status: "done", completed_at: recent, client_flagged: { at: recent, note: "We don't do Google Ads" } };
  if (stage === "done_no_record") return { status: "done", completed_at: recent };
  return base;
};
for (const st of ["building", "drafted", "locked", "looks_right", "not_right", "done_no_record"]) {
  stage = st;
  const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  const local = { "/portal/portal.js": process.env.PORTAL_JS || path.join(SITE_DIR, "portal/portal.js"), "/portal/portal.css": path.join(SITE_DIR, "portal/portal.css"), "/shared/step-lock.js": path.join(SITE_DIR, "shared/step-lock.js") };
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(local[p], "utf8") }); });
  await ctx.route("**/rest/v1/client_onboarding_records*", async (r) => {
    if (r.request().method() !== "GET") return r.fulfill({ status: 204, body: "" });
    const res = await r.fetch(); let body = await res.text();
    try { const j = JSON.parse(body); for (const row of Array.isArray(j) ? j : [j]) if (row && row.data && row.data.tasks && row.data.tasks[STEP]) row.data.tasks[STEP] = reshape(row.data.tasks[STEP]); body = JSON.stringify(j); } catch {}
    r.fulfill({ status: res.status(), headers: res.headers(), body });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 200)));
  await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
  if (st === "locked") { const note = page.locator("[data-kw-note]").first(); if (await note.count()) { await note.screenshot({ path: `${out}/${pre}-topnote.png` }); console.log("[top note]", (await note.innerText()).replace(/\s+/g, " ").slice(0, 200)); } }
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(3000);
  const row = page.locator(`[id="step-row-${STEP}"]`);
  if (await row.evaluate((e) => e.classList.contains("is-collapsed"))) { await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click()); await page.waitForTimeout(500); }
  await row.screenshot({ path: `${out}/${pre}-${st}.png` });
  console.log(`[${st}]`, (await row.innerText()).replace(/\s+/g, " ").slice(0, 260));
  await ctx.close();
}
await b.close();
