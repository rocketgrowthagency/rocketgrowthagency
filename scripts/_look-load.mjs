// _look-load.mjs — READ-ONLY: do the portal and admin really load with this repo's files? Writes blocked. Every page error and failed file printed.
import fs from "node:fs"; import { signInAdmin } from "./lib/admin-sign-in.mjs"; import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
for (const [name, email, url, sel] of [["portal", WALK_CLIENTS.main.email, "https://www.rocketgrowthagency.com/portal/", ".portal-nav"], ["admin", "hello@rocketgrowthagency.com", "https://www.rocketgrowthagency.com/admin/", "body"]]) {
  const g = name === "admin" ? null : await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email, options: { redirect_to: url } }) })).json();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 } });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && /^\/(portal|admin|shared)\/[\w./-]+\.(js|css)$/.test(u.pathname), (r) => { const p = W + new URL(r.request().url()).pathname; if (!fs.existsSync(p)) return r.fallback(); r.fulfill({ contentType: p.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(p, "utf8") }); });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e.message).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 500 || (r.status() === 404 && /\.(js|css)/.test(r.url()))) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`); });
  // 11-13: signs in as the checks' robot staff account (two-step-ready) — scripts/lib/admin-sign-in.mjs
  if (name === "admin") await signInAdmin(page); else await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000); if (name === "admin") { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); } await page.waitForTimeout(14000);
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  console.log(name, "url", page.url().slice(0, 60), "| chars", text.length, "| errors", errs.length); errs.slice(0, 6).forEach((e) => console.log("  ", e)); console.log("  text:", text.slice(0, 170));
  await ctx.close();
}
await b.close();
