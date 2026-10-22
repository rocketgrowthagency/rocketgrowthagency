// _capture-done-rows.mjs — READ-ONLY capture of a test client's done client-step rows (every write blocked by the walk's guard).
// node scripts/_capture-done-rows.mjs <walk-as: main|new|month2> <outdir>
import { classify } from "./acceptance/guard.mjs";
import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const [as = "month2", out = "/tmp", strip = ""] = process.argv.slice(2);   // strip="1": every client step = done, nothing recorded (the PAGE's copy only)
const WHO = WALK_CLIENTS[as], SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = "https://www.rocketgrowthagency.com", PORTAL = `${SITE}/portal/`;
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WHO.email, options: { redirect_to: PORTAL } }) })).json();
const link = g.action_link || g.properties?.action_link;
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
// 🔑 READ-ONLY SIMULATION: rewrite the page's copy of the record so every client step reads "done, nothing recorded" (the database
// is never written — every write is still blocked by the guard below)
const CS = JSON.parse(await (await fetch(`${SITE}/data/playbooks/client-steps.json`)).text());
const CLIENT_IDS = [...CS.month1, ...CS.month2plus].filter((x) => x.clientStepNo != null).map((x) => x.id);
if (strip) await ctx.route(/\/rest\/v1\/client_(onboarding|monthly)_records/, async (route) => {
  if (route.request().method() !== "GET") return route.abort();
  const res = await route.fetch(); let body; try { body = await res.json(); } catch { return route.fulfill({ response: res }); }
  const rows = Array.isArray(body) ? body : [body];
  for (const r of rows) if (r && r.data && r.data.tasks) for (const id of CLIENT_IDS) if (id in r.data.tasks || id.startsWith(/monthly/.test(route.request().url()) ? "m2." : "m1.")) r.data.tasks[id] = { status: "done", completed_at: "2026-10-01T17:00:00Z", completed_by: "rga" };
  return route.fulfill({ response: res, json: Array.isArray(body) ? rows : rows[0] });
});
await ctx.route("**/*", (route) => { const q = route.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? route.fulfill({ status: 204, body: "" }) : route.abort(); return route.fallback(); });
const page = await ctx.newPage();
await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 });
await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
const VIEW = as === "month2" ? "ongoing" : "setup";
await page.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), VIEW);
await new Promise((r) => setTimeout(r, 5000));
// open any collapsed Month-1 section
await page.evaluate(() => document.querySelectorAll("details:not([open])").forEach((d) => { if (/Month 1|Get started|Set up|Reviews|Close/i.test(d.textContent.slice(0, 200))) d.open = true; }));
await new Promise((r) => setTimeout(r, 1500));
console.log("debug:", await page.evaluate(() => ({ all: document.querySelectorAll('[id^="step-row-"]').length, view: document.querySelector(".portal-nav a.active,.portal-nav a[aria-current]")?.getAttribute("data-view"), text: (document.querySelector("#monthlyChecklistHost")?.innerText || "none").slice(0, 200) })));
const ids = await page.evaluate(() => [...document.querySelectorAll('[id^="step-row-m"]')].filter((e) => e.offsetParent !== null).map((e) => e.id.slice(9)));
console.log("rows:", ids.join(" "));
for (const id of ids) {
  const row = page.locator(`[id="step-row-${id}"]`).first();
  if (await row.evaluate((e) => e.classList.contains("is-collapsed"))) { await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click()); await new Promise((r) => setTimeout(r, 500)); }
  const txt = await row.evaluate((e) => { const c = e.cloneNode(true); c.querySelectorAll(".pm-detail,.pm-thread,.pm-mails,.pm-stepmsgs").forEach((x) => x.remove()); return c.innerText.replace(/\s+/g, " ").trim().slice(0, 300); });
  console.log(`\n[${id}] ${txt}`);
  await row.screenshot({ path: `${out}/${id}.png` }).catch(() => {});
}
await browser.close();
