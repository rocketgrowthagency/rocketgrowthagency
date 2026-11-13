// _look-todo.mjs — READ-ONLY look at the To do system LIVE (todo_inbox_v1): the admin To do queue, the RGA client's "Next up",
// and the portal's step 4 row, signed in as the walk owner / walk client, every write caught. node scripts/_look-todo.mjs <outdir>
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
import { adminSignIn, SITE } from "./_admin-session.mjs";
const out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true });
// LOCAL=1 serves THIS repo's admin / portal files (the functions stay live) — a look before a deploy
import fs from "node:fs"; import path from "node:path";
const SITE_DIR = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const LOCAL = { "/admin/admin.js": "admin/admin.js", "/admin/admin.css": "admin/admin.css", "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json", "/data/playbooks/playbooks.json": "data/playbooks/playbooks.json" };
const local = async (ctx) => { if (!process.env.LOCAL) return; await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && LOCAL[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, LOCAL[p]), "utf8") }); }); };
const guard = async (ctx) => { await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); }); await local(ctx); };
// admin
{ const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } }); await guard(ctx);
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 200)));
  // 11-13: signs in as the checks' robot staff account (two-step-ready) — scripts/lib/admin-sign-in.mjs
  await adminSignIn(page); await page.waitForTimeout(6000);
  await page.goto(`${SITE}/admin/?view=todo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#todoList .mv-kpis, #todoList .admin-card", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log("[nav badge]", await page.evaluate(() => { const b = document.getElementById("todoNavBadge"); return b ? `${b.hidden ? "hidden" : "shown"} ${b.textContent}` : "missing"; }));
  console.log("[todo]", (await page.locator("#todoView").innerText()).replace(/\s+/g, " ").slice(0, 900));
  await page.locator("#todoView").screenshot({ path: `${out}/admin-todo.png` });
  await page.goto(`${SITE}/admin/?view=client&id=${WALK_CLIENTS.main.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#adminNextActionMoves:not([hidden])", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const card = page.locator("#adminNextActionCard");
  console.log("[next-action card]", (await card.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 700));
  if (await card.isVisible().catch(() => false)) await card.screenshot({ path: `${out}/admin-card.png` });
  await ctx.close(); }
// portal
{ const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: `${SITE}/portal/` } }) })).json();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } }); await guard(ctx);
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 200)));
  await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 });
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click());
  await page.waitForSelector('[id="step-row-m1.gbp.business_facts"]', { state: "attached", timeout: 45000 }); await page.waitForTimeout(4000);
  console.log("[client tab]", await page.evaluate(() => { const a = document.querySelector('.portal-nav a[data-view="approvals"]'); const bd = document.getElementById("approvalsBadge"); return `${a ? a.innerText.replace(/\s+/g, " ") : "missing"} · badge ${bd ? (bd.hidden ? "hidden" : bd.textContent) : "none"} · nav order: ${[...document.querySelectorAll(".portal-nav a[data-view]")].map((x) => x.dataset.view).join(",")}`; }));
  console.log("[yellow card]", await page.evaluate(() => { const o = document.querySelector("[data-nextstep-owed]"); return o ? `${o.textContent} → ${o.getAttribute("data-portal-goto")}` : "none"; }));
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="approvals"]')?.click()); await page.waitForTimeout(3500);
  const inbox = page.locator(".pv-approvals-host").first();
  console.log("[to do page]", (await inbox.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 700));
  await inbox.screenshot({ path: `${out}/portal-todo.png` }).catch((e) => console.log("shot", e.message.slice(0, 80)));
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(1500);
  await page.evaluate(() => { const r = document.getElementById("step-row-m1.gbp.business_facts"); let p = r; while (p && p !== document.body) { if (p.hidden) p.hidden = false; if (p.tagName === "DETAILS") p.open = true; p.classList && p.classList.remove("is-folded", "is-collapsed-phase"); p = p.parentElement; } r.scrollIntoView(); });
  await page.waitForTimeout(800);
  const row = page.locator('[id="step-row-m1.gbp.business_facts"]');
  await row.evaluate((e) => { const h = e.querySelector(".pm-step-row-head"); if (h && !e.classList.contains("is-open")) h.click(); }); await page.waitForTimeout(1500);
  console.log("[portal pill]", (await row.locator(".pm-step-pills").innerText()).replace(/\s+/g, " "));
  console.log("[portal step 4]", (await row.innerText()).replace(/\s+/g, " ").slice(0, 700));
  await row.screenshot({ path: `${out}/portal-step4.png` });
  await ctx.close(); }
await b.close();
