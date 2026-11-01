// _look-reviews-additions.mjs — READ-ONLY: the reply-live card (reviews_additions_v1 item 2) and the funnel card (item 3), in Chrome, with THIS repo's admin files.
// Every write is blocked; portal-review-requests is answered by the harness, so nothing reaches Google. node scripts/_look-reviews-additions.mjs <outdir>
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
import { adminLink, SITE } from "./_admin-session.mjs";
import fs from "node:fs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, CID = WALK_CLIENTS.main.id;
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
const LOCAL = new Set(["/admin/admin.js", "/admin/admin.css", "/portal/portal.css"]);
const SCENES = {
  mixed: { replies: { checked_at: new Date().toISOString(), posted: 3, live: 2, waiting: 1, not_showing: 0, unknown: 0 }, funnel: { window_days: 90, asked: 12, reminded: 5, stopped: 1, reviewed: 4, reviewed_known: true },
    words: { head: "Review requests, last 90 days", rows: [["Asked", 12], ["Reminded once", 5], ["Asked us to stop", 1], ["Became a review", 4]], note: "Only reviews the client marked count." } },
  trouble: { replies: { checked_at: new Date().toISOString(), posted: 3, live: 1, waiting: 0, not_showing: 1, unknown: 1 },
    words: { head: "Review requests, last 90 days", rows: [["Asked", 5], ["Reminded once", 0], ["Asked us to stop", 0], ["Became a review", "Not known yet"]], note: "Nobody has marked a review yet and Google hasn't been read recently, so this is unknown, not zero." } },
  none: { replies: null, words: { head: "Couldn't read the customer lists just now", rows: [] } },
};
const reveal = (row) => row.evaluate((e) => { e.classList.remove("ob-folded"); let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); p.classList && p.classList.remove("ob-folded", "is-collapsed"); if (p.matches && p.matches(".ob-phase")) p.classList.add("open"); p = p.parentElement; } });
const clean = (s) => s.replace(/\s+/g, " ");
for (const scene of Object.keys(SCENES)) {
  const S = SCENES[scene];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 1100 } });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && LOCAL.has(u.pathname), (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(SITE_DIR + p, "utf8") }); });
  await ctx.route("**/.netlify/functions/portal-review-requests", (r) => { let sc = ""; try { sc = JSON.parse(r.request().postData() || "{}").scope; } catch {}
    const body = sc === "funnel" ? { ok: true, scope: "funnel", funnel: S.funnel, words: S.words } : sc === "reviews" ? { ok: true, scope: "reviews", feed: null, matches: [], replies: S.replies }
      : { ok: true, requests: [{ name: "Maria", already_marked: true, message: "x" }], reviews: null, matches: [] };
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }); });
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
  await page.goto(await adminLink(), { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(6000);
  await page.goto(`${SITE}/admin/?view=client&id=${CID}&tab=onboarding-v2`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".ob-step", { state: "attached", timeout: 60000 });
  await page.evaluate(() => { document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((x) => x.click()); document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((x) => x.click()); });
  await page.waitForTimeout(800);
  for (const [id, sel, tag] of [["m1.review.response", "[data-ob-replies]", "replies"], ["m1.review.first_5", "[data-ob-funnel]", "funnel"]]) {
    const row = page.locator(`.ob-step[data-ob-step="${id}"]`).first(); await reveal(row);
    await row.locator(".ob-title").first().click().catch(() => {}); await page.waitForTimeout(1500);
    const card = row.locator(sel).first();
    if (!(await card.count())) { console.log(`[${scene} ${tag}] NO CARD`); continue; }
    await card.evaluate((e) => { let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); p = p.parentElement; } });
    await page.waitForTimeout(500);
    console.log(`[${scene} ${tag}]`, clean(await card.innerText()).slice(0, 600));
    await card.screenshot({ path: `${out}/${scene}-${tag}.png`, timeout: 8000 });
  }
  await ctx.close();
}
await b.close();
