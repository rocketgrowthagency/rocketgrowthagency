// _look-gbp-safety.mjs — READ-ONLY: the Google profile safety cards on the test client, with this repo's admin + portal files and stubbed records. Every write is blocked.
import fs from "node:fs"; import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs"; import { openAdminClient } from "./_admin-session.mjs";
const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, c = WALK_CLIENTS.main;
const FACTS = "m1.gbp.business_facts", day = (n) => new Date(Date.now() + n * 86400000).toISOString();
const SCENES = {
  suspended: { facts: { suspension: { status: "open", source: "google", reason: "suspended", found_at: day(-1), steps: { fix: { at: day(0), by: "a" } }, told_at: null } } },
  told: { facts: { suspension: { status: "open", source: "google", reason: "suspended", found_at: day(-1), steps: {}, told_at: day(0) } } },
  fresh: { facts: { google_push: { state: "on_google", after: { come: true }, confirmed: { website: "https://sample.com" } }, website_choice: null, pin_check: null, suspension: null } },
  set: { facts: { google_push: { state: "on_google", after: { come: true, website: "https://sample.com" }, confirmed: { website: "https://sample.com/?utm_source=google&utm_medium=organic" } }, website_choice: { kind: "home", url: "https://sample.com/", link: "https://sample.com/?utm_source=google&utm_medium=organic", tagged: true, status: "on_google", at: day(-3), sent_at: day(-3) }, pin_check: { answer: "on", at: day(-3) }, suspension: null } },
  sab: { facts: { google_push: { state: "on_google", after: { come: false } }, website_choice: { kind: "home", url: "https://sample.com/", link: "x", tagged: true, status: "waiting", wait: "week", not_before: day(4), at: day(-1) }, suspension: null } },
};
const CORE = { before: [], due: [{ id: "cc1", field: "main_category", status: "on_google", kind: "proposal", from: "Plumber", to: "Drainage service", sent_at: day(-8) }], four: [{ id: "cc1", field: "main_category", status: "on_google", kind: "proposal", from: "Plumber", to: "Drainage service", sent_at: day(-29), rechecks: { w1: { at: day(-20), result: "looked" } } }] };
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
async function ctxFor(scene, core) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 1000 } });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  await ctx.route((u) => u.pathname.includes("/rest/v1/client_onboarding_records"), async (r) => { const res = await r.fetch(); const j = await res.json(); const list = Array.isArray(j) ? j : [j]; for (const row of list) if (row && row.data && row.data.tasks) { row.data.tasks[FACTS] = { ...(row.data.tasks[FACTS] || {}), ...(SCENES[scene]?.facts || {}), status: "done" }; } return r.fulfill({ response: res, json: j }); });
  await ctx.route("**/.netlify/functions/core-change", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, items: CORE[core] || [] }) }));
  for (const [path, file, type] of [["/admin/admin.js", "admin/admin.js", "text/javascript"], ["/admin/admin.css", "admin/admin.css", "text/css"], ["/portal/portal.js", "portal/portal.js", "text/javascript"], ["/portal/portal.css", "portal/portal.css", "text/css"], ["/shared/gbp-safety.js", "shared/gbp-safety.js", "text/javascript"]])
    await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname === path, (r) => r.fulfill({ contentType: type, body: fs.readFileSync(`${SITE}/${file}`, "utf8") }));
  return ctx;
}
const shot = async (loc, name) => { if (!(await loc.count())) return console.log(name, "NOT FOUND"); await loc.first().scrollIntoViewIfNeeded(); console.log(`[${name}]`, (await loc.first().innerText()).replace(/\s+/g, " ").slice(0, 700)); await loc.first().screenshot({ path: `${out}/gs-${name}.png` }); };
const adminScene = async (scene, core, stepText, name) => {
  const ctx = await ctxFor(scene, core), page = await ctx.newPage(); page.on("pageerror", (e) => console.log(name, "PAGEERROR", String(e.message).slice(0, 240)));
  await openAdminClient(page, c.id, "onboarding-v2", {});
  await page.waitForTimeout(3000);
  const step = page.locator(".ob-step", { hasText: stepText }).first();
  await step.locator(".ob-head, .ob-main, .ob-title").first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll("[data-admin-core]:not([data-ready])").length);
  console.log(name, "cards", await step.locator(".ob-card").count(), "gcards", await step.locator(".ob-gcard").count(), "class", (await step.getAttribute("class")));
  await shot(step, name); await ctx.close();
};
const portalScene = async (scene, name) => {
  const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: c.email, options: { redirect_to: "https://www.rocketgrowthagency.com/portal/" } }) })).json();
  const ctx = await ctxFor(scene, "before"), page = await ctx.newPage(); page.on("pageerror", (e) => console.log(name, "PAGEERROR", String(e.message).slice(0, 240)));
  await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { state: "attached", timeout: 45000 }); await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(3000);
  if (scene === "told") { await page.evaluate(() => document.querySelector('.portal-nav a[data-view="dashboard"]')?.click()); await page.waitForTimeout(800); await shot(page.locator(".pm-paused"), `${name}-dash`); console.log("before told scene count", await page.locator(".pm-paused").count()); }
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(1500);
  const row = page.locator('[id="step-row-m1.gbp.business_facts"], .pm-step-row', { hasText: "Check your business on Google" }).first();
  await row.locator(".pm-step-title").first().click().catch(() => {}); await page.waitForTimeout(800);
  await shot(row, `${name}-step4`); await ctx.close();
};
const what = process.argv[3] || "all";
if (what === "all" || what === "admin") {
  await adminScene("suspended", "before", "Match business facts", "a-suspended");
  await adminScene("fresh", "before", "Match business facts", "a-fresh");
  await adminScene("set", "before", "Match business facts", "a-set");
  await adminScene("sab", "before", "Match business facts", "a-sab");
  await adminScene("set", "before", "Lock primary", "a-cat-before");
  await adminScene("set", "due", "Lock primary", "a-cat-due");
  await adminScene("set", "four", "Lock primary", "a-cat-four");
}
if (what === "all" || what === "portal") { await portalScene("set", "p-set"); await portalScene("told", "p-told"); await portalScene("suspended", "p-untold"); }
await b.close();
