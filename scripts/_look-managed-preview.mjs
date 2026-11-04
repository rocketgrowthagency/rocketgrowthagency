#!/usr/bin/env node
// _look-managed-preview.mjs — screenshots of the client portal in MANAGED mode, drawn from a local website checkout (default: the
// build worktree) against RGA's real record, as if portal_mode were "managed". Every write is blocked (acceptance/guard.mjs); nothing
// live changes. Usage: node --env-file=.env scripts/_look-managed-preview.mjs <site dir | live> <out dir>  ("live" = the deployed site, nothing routed or pretended)
import fs from "node:fs";
import path from "node:path";
import { classify } from "./acceptance/guard.mjs";
import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = process.argv[2], OUT = process.argv[3];
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SITE_DIR || !OUT || !SUPA || !KEY) { console.log("usage: node --env-file=.env scripts/_look-managed-preview.mjs <site dir> <out dir>"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const PORTAL = "https://www.rocketgrowthagency.com/portal/";
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
const link = g.action_link || g.properties?.action_link;
if (!link) { console.log("no sign-in link"); process.exit(2); }
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  await ctx.route("**/*", (route) => { const q = route.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? route.fulfill({ status: 204, body: "" }) : route.abort(); return route.fallback(); });
  const LIVE = SITE_DIR === "live";
  const local = LIVE ? {} : { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json", "/shared/step-lock.js": "shared/step-lock.js", "/shared/portal-mode.js": "shared/portal-mode.js" };
  if (!LIVE) for (const f of fs.readdirSync(path.join(SITE_DIR, "shared"))) if (f.endsWith(".js")) local[`/shared/${f}`] = `shared/${f}`;
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && Object.prototype.hasOwnProperty.call(local, u.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    route.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") });
  });
  // the one thing pretended: this client reads as managed
  if (!LIVE) await ctx.route((u) => u.pathname.endsWith("/rest/v1/clients") && /portal_mode/.test(u.search), async (route) => {
    const res = await route.fetch(); let body; try { body = await res.json(); } catch { return route.fulfill({ response: res }); }
    const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ ...r, portal_mode: "managed" }));
    return route.fulfill({ response: res, json: Array.isArray(body) ? rows : rows[0] });
  });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 60000 });
  await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click());
  await new Promise((r) => setTimeout(r, 7000));
  await page.screenshot({ path: `${OUT}/1-setup.png`, fullPage: true });
  const opened = await page.evaluate(() => { const el = [...document.querySelectorAll("[id^='step-row-']")].find((r) => /Check what we found/.test(r.textContent)); if (!el) return false; (([...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "+")) || el.querySelector("summary, button, .pm-step-head") || el).click(); el.scrollIntoView(); return el.id; });
  await new Promise((r) => setTimeout(r, 3000));
  if (opened) await page.locator(`[id="${opened}"]`).screenshot({ path: `${OUT}/2-step3.png` }).catch(() => {});
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="todo"]')?.click());
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/4-todo.png`, fullPage: true });
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="ongoing"]')?.click());
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/3-ongoing.png`, fullPage: true });
  console.log(JSON.stringify({ step3Row: opened, pageErrors: errs.slice(0, 5) }));
} finally { await browser.close(); }
