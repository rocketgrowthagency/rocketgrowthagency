// _look-admin-site-changes.mjs — READ-ONLY: the admin website-change card (website_change_approvals_v1 option B) on the walk client's
// Onboarding tab, signed in as the owner, with THIS repo's admin.js/css + shared/site-change.js. The onboarding record is read live and
// six website steps are given one state each IN THE BROWSER ONLY (drafted · sent · client asked for a change · approved · live with an
// undo request · nothing needed changing); every write is caught. node scripts/_look-admin-site-changes.mjs <outdir>
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
import { adminLink, SITE } from "./_admin-session.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp";
const SUPA = process.env.SUPABASE_URL;
const { chromium } = await import("playwright");
const b = await chromium.launch({ headless: true }); const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
const local = { "/admin/admin.js": "admin/admin.js", "/admin/admin.css": "admin/admin.css", "/shared/site-change.js": "shared/site-change.js", "/shared/step-lock.js": "shared/step-lock.js", "/data/playbooks/playbooks.json": "data/playbooks/playbooks.json" };
await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname], (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
const ch = (kind, items, extra = {}) => ({ v: "2026-10-23T15:00:00Z", kind, where: "Your homepage", page_url: "https://www.rocketgrowthagency.com/", items, adds: kind === "code" ? "Your business name, phone and hours, in the format Google reads" : "", uses: [], code: kind === "code" ? '<script type="application/ld+json">{"@type":"LocalBusiness"}</script>' : "", check_for: "", preview: null, drafted_at: "2026-10-23T15:00:00Z", drafted_by: "hello@rocketgrowthagency.com", ...extra });
const vis = [{ label: "Main headline", before: "Welcome", after: "Culver City's same-day plumber" }];
const FAKE = {
  "m1.web.h1_cta": { status: "in_progress", site_change: ch("visible", vis) },
  "m1.web.schema": { status: "in_progress", site_change: ch("code", []), internal_review: { decision: "approved", change_v: "2026-10-23T15:00:00Z", at: "2026-10-23T16:00:00Z", by: "hello@" } },
  "m1.web.tracking": { status: "in_progress", site_change: ch("code", []), internal_review: { decision: "approved", change_v: "2026-10-23T15:00:00Z", at: "2026-10-23T16:00:00Z" }, approval: { decision: "changes_requested", change_v: "2026-10-23T15:00:00Z", at: "2026-10-23T17:00:00Z", note: "We use Google Tag Manager already" } },
  "m1.web.nap_consistency": { status: "in_progress", site_change: ch("visible", [{ label: "Phone", before: "(310) 555-0100", after: "(310) 555-0142" }]), internal_review: { decision: "approved", change_v: "2026-10-23T15:00:00Z" }, approval: { decision: "approved", change_v: "2026-10-23T15:00:00Z", at: "2026-10-23T17:00:00Z", by: "joe@joesplumbing.com", approved_change: ch("visible", [{ label: "Phone", before: "(310) 555-0100", after: "(310) 555-0142" }]) } },
  "m1.web.image_seo": { status: "done", completed_at: "2026-10-23T18:00:00Z", site_change: ch("batch", [{ label: "Photo 1", before: "", after: "Service van in Culver City" }]), internal_review: { decision: "approved", change_v: "2026-10-23T15:00:00Z" }, approval: { decision: "approved", change_v: "2026-10-23T15:00:00Z", at: "2026-10-23T17:00:00Z" }, published: { v: "2026-10-23T15:00:00Z", at: "2026-10-23T18:00:00Z", by: "hello@", checked: null, check_note: "Code change: checked by the step's own check" }, undo_request: { at: "2026-10-23T19:00:00Z", note: "Please use our own photo names" } },
  "m1.web.https_sitemap": { status: "done", completed_at: "2026-10-23T18:00:00Z", no_change_needed: { note: "The check found it already right: HTTPS=true, /sitemap.xml=200", at: "2026-10-23T18:00:00Z", by: "check" } },
};
await ctx.route("**/rest/v1/client_onboarding_records*", async (r) => {
  if (r.request().method() !== "GET") return r.fulfill({ status: 204, body: "" });
  const res = await r.fetch(); let body = await res.text();
  try { const j = JSON.parse(body); const rows = Array.isArray(j) ? j : [j]; if (r.request().url().includes(WALK_CLIENTS.main.id)) for (const row of rows) if (row && row.data) { row.data.tasks = { ...(row.data.tasks || {}), ...FAKE }; if (process.env.ACCESS) { row.data.tasks["m1.access.website"] = { status: "done", completed_at: "2026-10-23T18:00:00Z", client_input: { via: "invite", platform: "custom", who: "self", files: "github", at: "2026-10-23T17:00:00Z" }, access: { role: "Write", account: "hello@rocketgrowthagency.com", confirmed_at: "2026-10-23T18:00:00Z", confirmed_by: "hello@rocketgrowthagency.com" } }; row.data.site_snapshot = globalThis.__SNAP; } } body = JSON.stringify(j); } catch {}
  r.fulfill({ status: res.status(), headers: res.headers(), body });
});
if (process.env.ACCESS) { const { createRequire } = await import("node:module"); const rq = createRequire(`${SITE_DIR}/netlify/functions/x.js`); const S = rq(`${SITE_DIR}/netlify/functions/_site-snapshot.js`); globalThis.__SNAP = { ...(await S.takeSnapshot("rocketgrowthagency.com", fetch, {})), at: "2026-10-23T18:01:00Z", by: "hello@rocketgrowthagency.com" }; }
const writes = [];
await ctx.route("**/.netlify/functions/admin-deliverables", (r) => { const j = JSON.parse(r.request().postData() || "{}"); if (j.site_action === "prefill") return r.fallback(); writes.push(j); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "(harness: not written)" }) }); });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300)));
await page.goto(await adminLink(), { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(6000);
await page.goto(`${SITE}/admin/?view=client&id=${WALK_CLIENTS.main.id}&tab=onboarding-v2`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".ob-step", { state: "attached", timeout: 60000 }); await page.waitForTimeout(4000);
await page.evaluate(() => { document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((x) => x.click()); document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((x) => x.click()); });
await page.waitForTimeout(800);
if (process.env.ACCESS) { const row = page.locator('.ob-step[data-ob-step="m1.access.website"]').first();
  await row.evaluate((e) => { e.classList.remove("ob-folded"); e.querySelectorAll("[hidden]").forEach((h) => { if (!h.closest("details")) h.removeAttribute("hidden"); }); let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); p = p.parentElement; } });
  await row.locator(".ob-led-d > summary").first().click().catch(() => {}); await page.waitForTimeout(300);
  await row.screenshot({ path: `${out}/admin-row8-ledger.png` }); console.log("[row8]", (await row.innerText()).replace(/\s+/g, " ").slice(0, 700));
  console.log("[overflow px]", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)); await b.close(); process.exit(0); }
for (const id of ["m1.web.homepage_meta", ...Object.keys(FAKE)]) {
  const row = page.locator(`.ob-step[data-ob-step="${id}"]`).first();
  if (!(await row.count())) { console.log(`[${id}] NO ROW`); continue; }
  await row.evaluate((e) => { e.classList.remove("ob-folded"); e.querySelectorAll("[hidden]").forEach((h) => { if (!h.closest(".ob-wc-fold, details")) h.removeAttribute("hidden"); }); let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); p.classList && p.classList.remove("ob-folded", "is-collapsed"); if (p.matches && p.matches(".ob-phase")) p.classList.add("open"); p = p.parentElement; } });
  await page.waitForTimeout(100);
  console.log(`   (${id} visible: ${await row.isVisible()} · cards: ${await row.locator(".ob-wc").count()} · ${await row.evaluate((e) => { let p = e, why = ""; while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.display === "none") { why = (p.className || p.tagName) + " display:none"; break; } p = p.parentElement; } return why; })})`);
  const wc = row.locator(".ob-wc");
  if (!(await wc.count())) { console.log(`[${id}] no website-change card · row: ${(await row.innerText()).replace(/\s+/g, " ").slice(0, 160)}`); continue; }
  await wc.first().scrollIntoViewIfNeeded(); await wc.first().screenshot({ path: `${out}/admin-${id.split(".").pop()}.png` });
  console.log(`[${id}]`, (await wc.first().innerText()).replace(/\s+/g, " ").slice(0, 300));
}
const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); console.log("[overflow px]", ov, "| writes caught:", writes.length);
await b.close();
