#!/usr/bin/env node
// _look-managed-steps.mjs — one managed Setup step at a time, at phone / tablet / desktop width, drawn from a LOCAL website checkout against
// RGA's real record as if portal_mode were "managed" (the same routing as _look-managed-preview.mjs; every write is blocked by
// acceptance/guard.mjs, so nothing live changes). ONE sign-in and ONE page load per run; the widths are a resize of that page.
//
// 🔴 THE SWAP IS PROVEN, NOT ASSUMED (feedback_the_harness_i_wrote_to_check_my_work_can_lie): the served portal.js gets a marker line and
// portal.css a marker rule; the run stops if the page doesn't carry both.
//
// For each step it writes <out>/<step>-<width>.png (the row, opened like a person would) and <out>/<step>-<width>.html (its outerHTML), and
// prints what the row says (pills, title, disc class) plus anything that overlaps or clips inside it.
// Usage: node --env-file=.env scripts/_look-managed-steps.mjs <site dir> <out dir> [step ids, comma-separated]
import fs from "node:fs";
import path from "node:path";
import { classify } from "./acceptance/guard.mjs";
import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = process.argv[2], OUT = process.argv[3];
const STEPS = (process.argv[4] || "m1.kickoff.call,m1.review.first_5,m1.brand.youtube_setup,m1.call.close").split(",");
const WIDTHS = [375, 768, 1280];
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SITE_DIR || !OUT || !SUPA || !KEY) { console.log("usage: node --env-file=.env scripts/_look-managed-steps.mjs <site dir> <out dir> [steps]"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const PORTAL = "https://www.rocketgrowthagency.com/portal/";
const MARK = `local-${Date.now().toString(36)}`;
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
const link = g.action_link || g.properties?.action_link;
if (!link) { console.log("no sign-in link"); process.exit(2); }
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const blocked = [];
  await ctx.route("**/*", (route) => { const q = route.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) { blocked.push(d.label); return d.stub ? route.fulfill({ status: 204, body: "" }) : route.abort(); } return route.fallback(); });
  const local = { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json" };
  for (const f of fs.readdirSync(path.join(SITE_DIR, "shared"))) if (f.endsWith(".js")) local[`/shared/${f}`] = `shared/${f}`;
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && Object.prototype.hasOwnProperty.call(local, u.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    let body = fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8");
    if (p === "/portal/portal.js") body += `\nglobalThis.__rgaLocalPortal = ${JSON.stringify(MARK)};\n`;
    if (p === "/portal/portal.css") body += `\n:root { --rga-local-mark: "${MARK}"; }\n`;
    route.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body });
  });
  await ctx.route((u) => u.pathname.endsWith("/rest/v1/clients") && /portal_mode/.test(u.search), async (route) => {
    const res = await route.fetch(); let body; try { body = await res.json(); } catch { return route.fulfill({ response: res }); }
    const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ ...r, portal_mode: "managed" }));
    return route.fulfill({ response: res, json: Array.isArray(body) ? rows : rows[0] });
  });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 60000 });
  await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 60000 }).catch(() => {});
  const marks = await page.evaluate(() => ({ js: globalThis.__rgaLocalPortal || null, css: getComputedStyle(document.documentElement).getPropertyValue("--rga-local-mark").trim().replace(/"/g, "") }));
  if (marks.js !== MARK || marks.css !== MARK) { console.log(JSON.stringify({ swap: "NOT PROVEN", marks, want: MARK })); process.exit(2); }
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll(".pm-step-row")].some((r) => r.offsetParent !== null), null, { timeout: 60000 })
    .catch(async () => { console.log(JSON.stringify({ noRows: true, all: await page.evaluate(() => document.querySelectorAll(".pm-step-row").length), text: (await page.evaluate(() => document.body.innerText)).slice(0, 1500) })); });
  await new Promise((r) => setTimeout(r, 5000));
  // every managed Setup row as the client sees it: number, disc state, pills, title (the protocol's one wording per status)
  const rows = await page.evaluate(() => [...document.querySelectorAll(".pv-setup .pm-step-row, [data-view-panel='setup'] .pm-step-row, .pm-step-row")].filter((r) => r.offsetParent !== null && !r.closest(".mc-fix, .mc-verify"))
    .map((r) => ({ id: r.id, cls: r.className.replace(/\s+/g, " "), num: r.querySelector(".pm-step-num")?.textContent.trim(), disc: getComputedStyle(r.querySelector(".pm-step-num") || r).backgroundColor,
      pills: [...r.querySelectorAll(":scope > .pm-step-row-head .pm-pill")].map((p) => p.textContent.trim()), title: r.querySelector(".pm-step-title")?.textContent.trim(), sub: r.querySelector(":scope > .pm-step-row-head .pm-step-sub")?.textContent.trim() || "" })));
  const report = { swap: marks.js, rows, steps: {} };
  for (const id of STEPS) {
    const sel = `[id="step-row-${id}"]`;
    const ok = await page.evaluate((s) => { const r = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null); if (!r) return false; if (r.classList.contains("is-collapsed")) r.querySelector(".pm-step-row-head")?.click(); return true; }, sel);
    if (!ok) { report.steps[id] = "not on the page"; continue; }
    await new Promise((r) => setTimeout(r, 2500));
    report.steps[id] = {};
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 1000 });
      await new Promise((r) => setTimeout(r, 700));
      const el = page.locator(sel).filter({ visible: true }).first();
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.screenshot({ path: `${OUT}/${id}-${w}.png` }).catch((e) => { report.steps[id][w] = `screenshot failed: ${e.message}`; });
      const info = await page.evaluate((s) => {
        const r = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null); if (!r) return null;
        const R = r.getBoundingClientRect(), bad = [];
        const vis = [...r.querySelectorAll("*")].filter((e) => e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) && e.getClientRects().length);
        for (const e of vis) {
          const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
          if (b.width && (b.right > R.right + 0.5 || b.left < R.left - 0.5)) bad.push(`outside the row: <${e.tagName.toLowerCase()} class="${e.className}"> ${Math.round(b.left)}–${Math.round(b.right)} vs ${Math.round(R.left)}–${Math.round(R.right)}`);
          if (e.scrollWidth > e.clientWidth + 1 && !["visible"].includes(cs.overflowX) && cs.textOverflow !== "ellipsis" && e.clientWidth) bad.push(`clipped: <${e.tagName.toLowerCase()} class="${e.className}"> ${e.scrollWidth} > ${e.clientWidth}`);
        }
        // text leaves that overlap each other (the owner: nothing overlaps)
        const leaves = vis.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => [e, e.getBoundingClientRect()]);
        for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
          const [a, A] = leaves[i], [b, B] = leaves[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (ox > 1 && oy > 1) bad.push(`overlap: "${a.textContent.trim().slice(0, 30)}" × "${b.textContent.trim().slice(0, 30)}"`);
        }
        return { width: Math.round(R.width), text: r.innerText.replace(/\n+/g, " | ").slice(0, 900), bad, html: r.outerHTML };
      }, sel);
      if (info) { fs.writeFileSync(`${OUT}/${id}-${w}.html`, info.html); delete info.html; }
      report.steps[id][w] = info;
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
  }
  report.pageErrors = errs.slice(0, 5);
  report.blockedWrites = [...new Set(blocked)].slice(0, 12);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
