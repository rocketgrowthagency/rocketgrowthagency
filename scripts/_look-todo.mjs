// _look-todo.mjs — READ-ONLY look at the To do system LIVE (todo_inbox_v1): the admin To do queue, the RGA client's "Next up",
// and the portal's step 4 row, signed in as the walk owner / walk client, every write caught. node scripts/_look-todo.mjs <outdir>
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
import { adminLink, SITE } from "./_admin-session.mjs";
const out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true });
const guard = (ctx) => ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
// admin
{ const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } }); await guard(ctx);
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 200)));
  await page.goto(await adminLink(), { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(6000);
  await page.goto(`${SITE}/admin/?view=todo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#todoList .mv-kpis, #todoList .admin-card", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log("[nav badge]", await page.evaluate(() => { const b = document.getElementById("todoNavBadge"); return b ? `${b.hidden ? "hidden" : "shown"} ${b.textContent}` : "missing"; }));
  console.log("[todo]", (await page.locator("#todoView").innerText()).replace(/\s+/g, " ").slice(0, 900));
  await page.locator("#todoView").screenshot({ path: `${out}/admin-todo.png` });
  await page.goto(`${SITE}/admin/?view=client&id=${WALK_CLIENTS.main.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#clientNextUp:not([hidden])", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const nu = page.locator("#clientNextUp");
  console.log("[next up]", (await nu.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600));
  if (await nu.isVisible().catch(() => false)) await nu.screenshot({ path: `${out}/admin-nextup.png` });
  await ctx.close(); }
// portal
{ const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: `${SITE}/portal/` } }) })).json();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } }); await guard(ctx);
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 200)));
  await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 });
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click());
  await page.waitForSelector('[id="step-row-m1.gbp.business_facts"]', { state: "attached", timeout: 45000 }); await page.waitForTimeout(4000);
  await page.evaluate(() => { const r = document.getElementById("step-row-m1.gbp.business_facts"); let p = r; while (p && p !== document.body) { if (p.hidden) p.hidden = false; if (p.tagName === "DETAILS") p.open = true; p.classList && p.classList.remove("is-folded", "is-collapsed-phase"); p = p.parentElement; } r.scrollIntoView(); });
  await page.waitForTimeout(800);
  const row = page.locator('[id="step-row-m1.gbp.business_facts"]');
  await row.evaluate((e) => { const h = e.querySelector(".pm-step-row-head"); if (h && !e.classList.contains("is-open")) h.click(); }); await page.waitForTimeout(1500);
  console.log("[portal pill]", (await row.locator(".pm-step-pills").innerText()).replace(/\s+/g, " "));
  console.log("[portal step 4]", (await row.innerText()).replace(/\s+/g, " ").slice(0, 700));
  await row.screenshot({ path: `${out}/portal-step4.png` });
  await ctx.close(); }
await b.close();
