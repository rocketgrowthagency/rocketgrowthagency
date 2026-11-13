// _look-citations-additions.mjs — READ-ONLY: admin step "Audit citation NAP consistency" with the listings the audit found (citations_additions_v1), in Chrome, with THIS repo's admin.
// The test client's record is given the step's result IN THE BROWSER ONLY; every write is blocked. node scripts/_look-citations-additions.mjs <outdir>
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
import { adminSignIn, SITE } from "./_admin-session.mjs";
import fs from "node:fs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, CID = WALK_CLIENTS.main.id;
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
const LOCAL = new Set(["/admin/admin.js", "/admin/admin.css", "/portal/portal.css"]);
const now = new Date().toISOString();
const chk = (id, label, pass, url, extra = {}) => ({ id, label, weight: 3, pass, url, checked_at: now, detail: "x", ...extra });
const TASK = { status: "done", ran_at: now, outcome: "needs_work", outcome_data: { ok: true, citations_held: 4, held_for: ["yelp", "facebook", "bbb", "apple"], found_by_audit: ["yelp", "facebook", "bbb"],
  checks: [chk("cit.yelp", "Yelp NAP matches Google", true, "https://www.yelp.com/biz/acme-plumbing-austin"), chk("cit.facebook", "Facebook NAP matches Google", null, "https://www.facebook.com/acmeplumbing", { could_not_read: true }),
    chk("cit.bbb", "BBB citation reachable", null, "https://www.bbb.org/us/tx/austin/profile/plumber/acme-1", { could_not_read: true }), chk("cit.apple", "Apple Maps NAP matches Google", false, "https://maps.apple.com/place?place-id=I1"),
    chk("cit.foursquare", "Foursquare citation", null, null)], fixes: [{ id: "cit.apple", weight: 3, fix: "Apple Maps NAP matches Google", why: "name ✓, phone ✗ (GBP 5125550100 absent)" }],
  left_out: [{ source: "Angie", why: "home only" }, { source: "HomeAdvisor", why: "home only" }, { source: "Thumbtack", why: "home only" }] } };
const ctx = await b.newContext({ viewport: { width: 1200, height: 1100 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && LOCAL.has(u.pathname), (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(SITE_DIR + p, "utf8") }); });
await ctx.route("**/rest/v1/client_onboarding_records*", async (r) => { if (r.request().method() !== "GET") return r.fulfill({ status: 204, body: "" }); const res = await r.fetch(); let body = await res.text();
  try { const j = JSON.parse(body), rows = Array.isArray(j) ? j : [j]; for (const row of rows) if (row && row.data) row.data.tasks = { ...(row.data.tasks || {}), "m1.audit.citations_nap": TASK }; body = JSON.stringify(j); } catch {}
  r.fulfill({ status: res.status(), headers: res.headers(), body }); });
const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
// 11-13: signs in as the checks' robot staff account (two-step-ready) — scripts/lib/admin-sign-in.mjs
await adminSignIn(page); await page.waitForTimeout(6000);
await page.goto(`${SITE}/admin/?view=client&id=${CID}&tab=onboarding-v2`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".ob-step", { state: "attached", timeout: 60000 });
await page.evaluate(() => { document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((x) => x.click()); document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((x) => x.click()); });
await page.waitForTimeout(800);
const row = page.locator('.ob-step[data-ob-step="m1.audit.citations_nap"]').first();
await row.evaluate((e) => { e.classList.remove("ob-folded"); let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); p.classList && p.classList.remove("ob-folded", "is-collapsed"); p = p.parentElement; } });
await row.locator(".ob-title").first().click().catch(() => {}); await page.waitForTimeout(1500);
const card = row.locator(".ob-card").first();
if (!(await card.count())) console.log("NO CARD:", (await row.innerText()).replace(/\s+/g, " ").slice(0, 400)); else {
  console.log("[admin 29]", (await card.innerText()).replace(/\s+/g, " ").slice(0, 900)); await card.evaluate((e) => { let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); if (p.tagName === "DETAILS") p.open = true; p.classList && p.classList.remove("ob-folded", "is-collapsed"); p = p.parentElement; } }); await card.scrollIntoViewIfNeeded({ timeout: 10000 }); await page.waitForTimeout(800); const bb = await card.boundingBox();
  await page.screenshot({ path: `${out}/admin-29.png`, clip: { x: Math.max(0, bb.x), y: Math.max(0, bb.y), width: Math.min(bb.width, 1150), height: Math.min(bb.height, 1000) }, timeout: 30000 }); }
await b.close();
