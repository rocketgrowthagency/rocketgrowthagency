// _look-approvals-inbox.mjs — READ-ONLY: the client's For your approval inbox (website_change_approvals_v1 option B) in the real
// browser on the live portal as the walk client, with THIS repo's portal.js/css. portal-deliverables is FAKED (a visible change with
// the Google preview, a code change, a batch, a text item, one RGA is revising, one live with Ask to undo); every POST is caught,
// never written. node scripts/_look-approvals-inbox.mjs <outdir>   (WIDTH=390 for a phone)
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: PORTAL } }) })).json();
const { chromium } = await import("playwright");
const W = Number(process.env.WIDTH || 1180);
const b = await chromium.launch({ headless: true }); const ctx = await b.newContext({ viewport: { width: W, height: 1100 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
const local = { "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json", "/data/playbooks/playbooks.json": "data/playbooks/playbooks.json", "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/shared/step-lock.js": "shared/step-lock.js", "/shared/portal-mode.js": "shared/portal-mode.js", "/shared/site-change.js": "shared/site-change.js" };
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
const W1 = { surface: "website", surfaceTitle: "Your website", kind: "change", blocks: [] };
const D = [
  { ...W1, key: "m1.web.homepage_meta", title: "Your main page in Google", blurb: "It is the line people read in Google before they click. Naming your service and town brings the right people to you.", prepared_at: "2026-10-23T15:00:00Z", approval: null, site_state: "sent",
    change: { v: "v1", kind: "visible", where: "Your homepage", items: [{ label: "Page title", role: "title", before: "Home | Joe's Plumbing", after: "Emergency Plumber in Culver City | Joe's Plumbing" }, { label: "Description under the title", role: "description", before: "", after: "Fast, licensed plumbers in Culver City. Same-day repairs, upfront prices. Call (310) 555-0142." }], adds: "", uses: [], code: "", preview: { site: "Joe's Plumbing", url: "https://joesplumbing.com" } } },
  { ...W1, key: "m1.web.schema", title: "Business details for Google", blurb: "It tells Google your name, phone, address and hours in its own format, so search shows the right details.", prepared_at: "2026-10-23T15:00:00Z", approval: null, site_state: "sent",
    change: { v: "v2", kind: "code", where: "Your homepage", items: [], adds: "Your business name, phone, address, hours and service area, in the format Google reads", uses: ["Joe's Plumbing", "(310) 555-0142", "Culver City, CA", "Mon–Fri 7am–6pm"], code: '<script type="application/ld+json">{ "@type": "Plumber", "name": "Joe\'s Plumbing", "telephone": "+1-310-555-0142" }</script>', preview: null } },
  { ...W1, key: "m1.web.image_seo", title: "Descriptions for your website photos", blurb: "Descriptions help Google understand your photos, and help people who use screen readers.", prepared_at: "2026-10-23T15:00:00Z", approval: null, site_state: "sent",
    change: { v: "v3", kind: "batch", where: "Photos across your website", items: Array.from({ length: 8 }, (_, i) => ({ label: `Photo ${i + 1} (${["van", "team", "water heater", "drain", "kitchen sink", "pipes", "shower", "office"][i]})`, role: null, before: "", after: `Joe's Plumbing ${["service van", "team", "water heater install", "drain cleaning", "kitchen sink repair", "pipe repair", "shower valve", "office"][i]} in Culver City` })), adds: "", uses: [], code: "", preview: null } },
  { key: "m1.gbp.business_description", title: "Your Google description", surface: "google_listing", surfaceTitle: "Your Google listing", kind: "text", blurb: "The description customers read on your Google listing.", blocks: [{ type: "p", text: "Joe's Plumbing has served Culver City since 2009 with same-day repairs and upfront prices." }], prepared_at: "2026-10-22T15:00:00Z", approval: null },
  { ...W1, key: "m1.web.h1_cta", title: "Your main page's headline and main button", blurb: "It is the first thing visitors read.", prepared_at: "2026-10-21T15:00:00Z", approval: { decision: "changes_requested", at: "2026-10-22T18:00:00Z" }, site_state: "changes",
    change: { v: "v4", kind: "visible", where: "Your homepage", items: [{ label: "Main headline", before: "Welcome", after: "Culver City's same-day plumber" }], adds: "", uses: [], code: "", preview: null } },
  { ...W1, key: "m1.web.nap_consistency", title: "Your name, address and phone on your website", blurb: "Google trusts a business more when its name, address and phone match everywhere it appears.", prepared_at: "2026-10-20T15:00:00Z", approval: { decision: "approved", at: "2026-10-21T17:00:00Z" }, site_state: "live",
    site_live: { at: "2026-10-22T17:00:00Z", before: "(310) 555-0100", after: "(310) 555-0142" }, undo_request: null,
    change: { v: "v5", kind: "visible", where: "Your footer", items: [{ label: "Phone", before: "(310) 555-0100", after: "(310) 555-0142" }], adds: "", uses: [], code: "", preview: null } },
];
const posts = [];
await ctx.route("**/.netlify/functions/portal-deliverables", (r) => { const j = JSON.parse(r.request().postData() || "{}"); if (j.decision || j.undo_request) posts.push(j);
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j.decision || j.undo_request ? { ok: true } : { ok: true, deliverables: D, actions: [], resolved: [] }) }); });
await ctx.route("**/.netlify/functions/client-change-history", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, changes: [], summary: {} }) }));
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('.portal-nav a[data-view="approvals"]', { timeout: 45000 }); await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
await page.evaluate(() => document.querySelector('.portal-nav a[data-view="approvals"]')?.click());
await page.waitForSelector(".ib", { timeout: 30000 }); await page.waitForTimeout(600);
const ib = page.locator(".pv-approvals-host").first();
const say = async (n) => { await ib.screenshot({ path: `${out}/${n}.png` }); console.log(`[${n}]`, (await page.locator(".ib-d:not([hidden])").first().innerText()).replace(/\s+/g, " ").slice(0, 380)); };
console.log("[queue]", (await page.locator(".ib-q").innerText()).replace(/\s+/g, " ").slice(0, 600));
await say("1-visible");
await page.locator('[data-ib-gp="now"]').first().click(); await page.waitForTimeout(150); await page.locator(".ib-gp").first().screenshot({ path: `${out}/1b-google-now.png` });
console.log("[google now]", (await page.locator('.ib-gp-b:not([hidden])').first().innerText()).replace(/\s+/g, " "));
await page.locator(".ib-qi", { hasText: "Business details" }).click(); await page.waitForTimeout(200); await say("2-code");
await page.locator(".ib-d:not([hidden]) [data-ib-ask]").click(); await page.waitForTimeout(150); await say("2b-ask");
await page.locator(".ib-d:not([hidden]) [data-ib-do=changes_requested]").click(); await page.waitForTimeout(300);
console.log("[empty note refused] posts:", posts.length, "| dialog:", (await page.locator('[role="dialog"]').innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120));
await page.locator('[role="dialog"] button').first().click(); await page.waitForTimeout(200);
await page.locator(".ib-d:not([hidden]) .ap-note").fill("We're open Saturdays 8 to 2"); await page.locator(".ib-d:not([hidden]) [data-ib-do=changes_requested]").click(); await page.waitForTimeout(1200);
console.log("[sent change]", JSON.stringify(posts.at(-1)));
await page.locator(".ib-qi", { hasText: "photos" }).click(); await page.waitForTimeout(200); await say("3-batch");
await page.locator(".ib-qi", { hasText: "homepage in Google" }).click(); await page.waitForTimeout(150);
await page.locator(".ib-d:not([hidden]) [data-ib-do=approved]").click(); await page.waitForTimeout(1200); console.log("[approved]", JSON.stringify(posts.at(-1)));
await page.locator(".ib-qi", { hasText: "Google description" }).click(); await page.waitForTimeout(150); await say("4-text");
await page.locator(".ib-qi", { hasText: "headline" }).click(); await page.waitForTimeout(150); await say("5-with-rga");
await page.evaluate(() => document.querySelector(".ap-done")?.setAttribute("open", ""));
await page.locator(".ib-qi", { hasText: "name, address" }).click(); await page.waitForTimeout(150); await say("6-done-live");
await page.locator(".ib-tl").screenshot({ path: `${out}/7-timeline.png` }); console.log("[timeline]", (await page.locator(".ib-tl").innerText()).replace(/\s+/g, " "));
await page.locator("[data-ib-undo-open]").first().click(); await page.waitForTimeout(400);
await page.locator(".ib-d:not([hidden]) [data-ib-undo=ask]").click(); await page.waitForTimeout(1200); console.log("[undo]", JSON.stringify(posts.at(-1)));
const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); console.log("[overflow px]", ov);
await b.close();
