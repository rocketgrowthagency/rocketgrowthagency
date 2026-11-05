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
  const LIVE = SITE_DIR === "live", served = new Set();
  const local = LIVE ? {} : { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json", "/shared/step-lock.js": "shared/step-lock.js", "/shared/portal-mode.js": "shared/portal-mode.js" };
  if (!LIVE) for (const f of fs.readdirSync(path.join(SITE_DIR, "shared"))) if (f.endsWith(".js")) local[`/shared/${f}`] = `shared/${f}`;
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && Object.prototype.hasOwnProperty.call(local, u.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    served.add(p);
    route.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") });
  });
  // LOOK_SERVICES_APPROVED=1 (client_step03_business_details_v1, before its portal-gbp-profile change is deployed): the LIVE function reads Google
  // (read-only, as always), then the LOCAL checkout's own exported reader + plan (admin-gbp-services-push approvedOf / plan) add `now.approved` to
  // the services answer exactly as the local portal-gbp-profile does, from this client's real record. Nothing else in the answer is touched.
  if (!LIVE && process.env.LOOK_SERVICES_APPROVED === "1") {
    const { createRequire } = await import("node:module"), SP = createRequire(path.join(SITE_DIR, "netlify/functions/x.js"))("./admin-gbp-services-push.js");
    await ctx.route((u) => u.pathname === "/.netlify/functions/portal-gbp-profile", async (route) => {
      const q = route.request(); let b = {}; try { b = JSON.parse(q.postData() || "{}"); } catch { b = {}; }
      if (b.step_id !== "m1.gbp.services_products") return route.fallback();
      const res = await route.fetch(); let j; try { j = await res.json(); } catch { return route.fulfill({ response: res }); }
      if (j && j.ok && j.now) {
        const rec = await (await fetch(`${SUPA}/rest/v1/client_onboarding_records?client_id=eq.${encodeURIComponent(b.client_id)}&select=data&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
        const ap = SP.approvedOf(rec && rec[0] && rec[0].data && rec[0].data.tasks && rec[0].data.tasks[b.step_id]);
        if (ap.names.length) { j.now.approved = { rows: SP.plan(ap.names, j.now).rows, at: ap.at }; served.add("fn:portal-gbp-profile+approved"); }
      }
      return route.fulfill({ response: res, json: j });
    });
  }
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
  const opened = await page.evaluate(() => { const el = [...document.querySelectorAll("[id^='step-row-']")].find((r) => /Check what we found|Check your business details on Google/.test(r.textContent)); if (!el) return false; (([...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "+")) || el.querySelector("summary, button, .pm-step-head") || el).click(); el.scrollIntoView(); return el.id; });
  await new Promise((r) => setTimeout(r, 3000));
  if (opened) await page.locator(`[id="${opened}"]`).screenshot({ path: `${OUT}/2-step3.png` }).catch(() => {});
  // steps 2 and 3 open, and the "What RGA is doing" group with its website-posts line open (client_step02_managed_access_v1 + client_step03_business_details_v1)
  const openRow = async (id) => { const ok = await page.evaluate((rid) => { const el = document.getElementById(`step-row-${rid}`); if (!el) return false; if (el.classList.contains("is-collapsed")) el.querySelector(".pm-step-row-head")?.click(); return true; }, id); await new Promise((r) => setTimeout(r, 2500)); if (ok) await page.evaluate((rid) => document.getElementById(`step-row-${rid}`)?.scrollIntoView(), id); return ok; };
  if (await openRow("m1.access.website")) await page.locator('[id="step-row-m1.access.website"]').screenshot({ path: `${OUT}/5-step2.png` }).catch(() => {});
  if (await openRow("managed.check_found")) await page.locator('[id="step-row-managed.check_found"]').screenshot({ path: `${OUT}/6-step3-open.png` }).catch(() => {});
  const grp = async (file) => { const box = await page.evaluate(() => { const a = document.querySelector(".mc-phase"), b = document.querySelector(".mc-rga"); if (!a || !b) return null; b.scrollIntoView(); const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect(); return { x: Math.min(r1.x, r2.x) + scrollX, y: r1.y + scrollY, width: Math.max(r1.right, r2.right) - Math.min(r1.x, r2.x), height: r2.bottom - r1.top }; }); if (box) await page.screenshot({ path: `${OUT}/${file}`, clip: box, fullPage: true }).catch(() => {}); return !!box; };
  await grp("7-rga.png");
  const posts = await page.evaluate(() => { const b = document.querySelector('[data-mc-rc="managed.website_posts"]'); if (b) b.click(); return !!b; });
  await new Promise((r) => setTimeout(r, 2500));
  if (posts) await grp("8-rga-posts-open.png");
  // the bottom of Setup (client_setup_bottom_v1): from "What RGA is doing" to the end of "About your business"
  await page.evaluate(() => { const b = document.querySelector('[data-mc-rc="managed.website_posts"]'); if (b && b.getAttribute("aria-expanded") === "true") b.click(); });
  await new Promise((r) => setTimeout(r, 600));
  const bottom = await page.evaluate(() => { const a = document.querySelector(".mc-phase"), f = document.getElementById("factsCard"); if (!a) return null; const visible = [...document.querySelectorAll(".pm-notice")].filter((n) => n.offsetParent && /Foundation work/.test(n.textContent)).length;
    const end = f && f.offsetParent ? f : document.querySelector(".mc-rga"); const r1 = a.getBoundingClientRect(), r2 = end.getBoundingClientRect(); return { x: r1.x + scrollX, y: r1.y + scrollY, width: Math.max(r1.width, r2.width), height: r2.bottom - r1.top + 8, foundation: visible, facts: f ? f.innerText.replace(/\s+/g, " ").slice(0, 300) : null }; });
  if (bottom) await page.screenshot({ path: `${OUT}/9-setup-bottom.png`, clip: { x: bottom.x, y: bottom.y, width: bottom.width, height: bottom.height }, fullPage: true }).catch(() => {});
  const facts = await page.evaluate(() => ({ step2: (document.getElementById("step-row-m1.access.website") || {}).innerText || "", step3: (document.getElementById("step-row-managed.check_found") || {}).innerText || "", rga: (document.querySelector(".mc-rga") || {}).innerText || "" }));
  fs.writeFileSync(`${OUT}/text.json`, JSON.stringify(facts, null, 2));
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="todo"]')?.click());
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/4-todo.png`, fullPage: true });
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="ongoing"]')?.click());
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/3-ongoing.png`, fullPage: true });
  // the Ongoing work tab's words, for a word-for-word diff against its mockup (ongoing_overview_v1)
  fs.writeFileSync(`${OUT}/ongoing.txt`, await page.evaluate(() => [...document.querySelectorAll(".pv-ongoing")].map((v) => v.innerText).join("\n---\n")));
  { const box = await page.evaluate(() => { const v = [...document.querySelectorAll(".pv-ongoing .pm-og")].find((x) => x.offsetParent); if (!v) return null; const r = v.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; });
    if (box) await page.screenshot({ path: `${OUT}/3b-ongoing-tab.png`, clip: box, fullPage: true }).catch(() => {}); }
    // the swap marker: the portal.js this page ran is the local one (its text, fetched back through the same routes)
  const marker = LIVE ? null : await page.evaluate(async (want) => { try { const t = await (await fetch("/portal/portal.js")).text(); return t.length === want; } catch { return false; } }, fs.readFileSync(path.join(SITE_DIR, "portal/portal.js"), "utf8").length);
  console.log(JSON.stringify({ step3Row: opened, postsLine: posts, localPortalJs: marker, bottom: bottom && { foundationCards: bottom.foundation, facts: bottom.facts }, served: [...served].sort(), pageErrors: errs.slice(0, 5) }));
} finally { await browser.close(); }
