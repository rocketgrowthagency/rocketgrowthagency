// _look-audit-decisions.mjs — READ-ONLY: the cards changed by audit_decisions_v1, in Chrome, with THIS repo's admin + portal files. The test client's onboarding record and photos are
// given each state IN THE BROWSER ONLY; every write is blocked, and gbp-publish is answered by the harness, so nothing reaches Google. node scripts/_look-audit-decisions.mjs <outdir>
import fs from "node:fs"; import path from "node:path";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
import { adminLink, SITE } from "./_admin-session.mjs";
const SITE_DIR = "/Users/chris/RGA/Rocket Growth Agency Website VS Code", out = process.argv[2] || "/tmp", SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, CID = WALK_CLIENTS.main.id;
const { chromium } = await import("playwright"); const b = await chromium.launch({ headless: true });
const LOCAL = new Set(["/admin/admin.js", "/admin/admin.css", "/portal/portal.js", "/portal/portal.css", "/shared/photo-second-logo.js", "/data/playbooks/playbooks.json"]);
const NM = (x) => `accounts/1/locations/2/media/${x}`;
const shots = [...Array(20)].map((_, i) => ({ n: i + 1, group: i === 0 ? "Logo" : i === 1 ? "Cover" : i < 8 ? "Team" : "At work", google: i === 0 ? "PROFILE" : i === 1 ? "COVER" : i < 8 ? "TEAMS" : "AT_WORK", do: `Shot ${i + 1} of the list`, why: "So customers see the real thing." }));
const up = (n, cat, at = "2026-10-20T10:00:00Z") => ({ id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, client_id: CID, shot_n: n, category: cat, publish_state: "published", pushed_to_gbp: true, storage_path: `x/${n}.jpg`, file_name: `${n}.jpg`, pushed_at: at, created_at: at, gbp_media_name: NM(`s${n}`) });
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const wind = (t) => ({ status: "pending", draft_shape: { items: shots, storefront: false, list: "E", type: "x" }, team_size: "6+", ...t });
const SCENES = {
  // client step 10, no street address, every shot filled, the hidden logo not counted
  short: { photos: [up(1, "logo"), up(2, "cover"), ...[...Array(6)].map((_, i) => up(i + 3, "team")), ...[...Array(12)].map((_, i) => up(i + 9, "at_work"))],
    task: () => wind({ detected: { verdict: "not_done", n: 19, n_all: 20, threshold: 20, source: "google_profile", at: hoursAgo(2), have: { PROFILE: 1, COVER: 1, TEAMS: 6, AT_WORK: 12 }, items: [{ name: NM("s1"), category: "PROFILE", at: "2026-10-20T10:00:03Z" }, { name: NM("s2"), category: "COVER", at: "2026-10-20T10:00:03Z" }, ...[...Array(6)].map((_, i) => ({ name: NM(`s${i + 3}`), category: "TEAMS", at: "2026-10-20T10:00:03Z" })), ...[...Array(12)].map((_, i) => ({ name: NM(`s${i + 9}`), category: "AT_WORK", at: "2026-10-20T10:00:03Z" }))] } }) },
  // a kept copy beside a fresh send, and the fold: a send, a no-slot photo, one from before RGA, one added later
  kept: { photos: [{ ...up(2, "cover", hoursAgo(5)), gbp_media_name: "upload-name" }, { ...up(3, "team", "2026-10-02T10:00:00Z") }, { ...up(99, "additional", "2026-10-03T10:00:00Z"), shot_n: null, gbp_media_name: NM("noslot") }],
    task: () => wind({ detected: { verdict: "not_done", n: 3, n_all: 6, threshold: 20, source: "google_profile", at: hoursAgo(2), have: { COVER: 1, TEAMS: 1 }, items: [{ name: NM("cov"), category: "COVER", at: new Date(Date.now() - 5 * 3600000 + 4000).toISOString() }, { name: NM("s3"), category: "TEAMS", at: "2026-10-02T10:00:02Z" }, { name: NM("noslot"), category: "ADDITIONAL", at: "2026-10-03T10:00:03Z" }, { name: NM("copy"), category: "EXTERIOR", at: "2025-12-02T16:41:12Z" }, { name: NM("later"), category: "INTERIOR", at: "2026-08-01T10:00:00Z" }, { name: NM("profile"), category: "PROFILE", at: "1970-01-01T00:00:00Z" }] }, photo_ai: { google: { [NM("copy")]: { name: "Your logo", what: "a logo", slot: 1 } } }, photo_kept: { [NM("copy")]: { at: "2026-10-16T01:58:45Z", by: "client" } } }) },
  // the same copy when it IS the only photo a customer can see
  only: { photos: [], task: () => wind({ detected: { verdict: "not_done", n: 0, n_all: 2, threshold: 20, source: "google_profile", at: hoursAgo(2), have: {}, items: [{ name: NM("copy"), category: "EXTERIOR", at: "2025-12-02T16:41:12Z" }, { name: NM("profile"), category: "PROFILE", at: "1970-01-01T00:00:00Z" }] }, photo_ai: { google: { [NM("copy")]: { name: "Your logo", what: "a logo", slot: 1 } } }, photo_kept: { [NM("copy")]: { at: "2026-10-16T01:58:45Z", by: "client" } } }) },
  // fourteen in review that fit
  bulk: { photos: [...[...Array(14)].map((_, i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, client_id: CID, shot_n: i + 3, category: i < 6 ? "team" : "at_work", publish_state: "in_review", storage_path: `x/r${i}.jpg`, file_name: `r${i}.jpg`, created_at: "2026-11-01T10:00:00Z", width: 2000, height: 1500, size_bytes: 900000 }))],
    task: () => wind({ detected: { verdict: "not_done", n: 0, threshold: 20, source: "google_profile", at: hoursAgo(2), have: {}, items: [] }, photo_matches: {}, photo_ai: { google: {}, hashes: {}, uploads: Object.fromEntries([...Array(14)].map((_, i) => [`00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, { matches: true, what: "the shot" }])) } }) },
};
const TEXT = "A family-run plumber serving the south side for 18 years. Same-day repairs, upfront prices and real people on the phone.";
const EXTRA = (s) => ({ "m1.audit.gbp_duplicate": { status: "done", outcome_data: { verdict: "clean" } },
  "m1.gbp.business_description": { status: "in_progress", ran_at: "2026-10-30T10:00:00Z", approval: { decision: "approved", at: "2026-11-01T10:00:00Z", by: "Pat Owner", approved_content: TEXT }, internal_review: { decision: "approved" }, outcome_data: { draft: TEXT }, ...(s === "kept" ? { publish_failed: { at: "2026-11-01T11:00:00Z", error: "The client hasn't authorized changes to their Google profile. They agree to it once, when they connect Google in their portal. Nothing was sent to Google." } } : {}) },
  "m1.audit.citations": { status: "in_progress", auto_run: { at: "2026-11-01T06:00:00Z", trigger: "nightly" }, ran_at: "2026-11-01T06:00:30Z", outcome: "verified", outcome_data: { counts: { found: 1, missing: 6, unknown: 1 }, directories: [{ source: "Yelp", status: "found", url: "https://www.yelp.com/biz/x", title: "X" }, { source: "BBB", status: "missing" }, { source: "Foursquare", status: "unknown" }] } } });
async function browser(scene, vw = 1200) {
  const ctx = await b.newContext({ viewport: { width: vw, height: 1100 } });
  await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && LOCAL.has(u.pathname), (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, p), "utf8") }); });
  const S = SCENES[scene];
  await ctx.route("**/rest/v1/client_onboarding_records*", async (r) => { if (r.request().method() !== "GET") return r.fulfill({ status: 204, body: "" }); const res = await r.fetch(); let body = await res.text();
    try { const j = JSON.parse(body), rows = Array.isArray(j) ? j : [j]; for (const row of rows) if (row && row.data) { row.data.tasks = { ...(row.data.tasks || {}), ...EXTRA(scene), "m1.gbp.photos": S.task() }; } body = JSON.stringify(j); } catch { /* as it came */ }
    r.fulfill({ status: res.status(), headers: res.headers(), body }); });
  await ctx.route("**/rest/v1/client_photos*", (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(S.photos) }) : r.fulfill({ status: 204, body: "" }));
  const presses = [];
  await ctx.route("**/.netlify/functions/gbp-publish", (r) => { presses.push(r.request().postData()); r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "The client hasn't authorized changes to their Google profile. They agree to it once, when they connect Google in their portal. Nothing was sent to Google." }) }); });
  await ctx.route("**/.netlify/functions/photo-match", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "(harness)" }) }));
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 300))); page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|blocked/.test(m.text())) console.log("CONSOLE", m.text().slice(0, 200)); });
  return { ctx, page, presses };
}
async function openAdmin(page) {
  await page.goto(await adminLink(), { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(6000);
  await page.goto(`${SITE}/admin/?view=client&id=${CID}&tab=onboarding-v2`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".ob-step", { state: "attached", timeout: 60000 }).catch(async (e) => { console.log("NO ROWS. The page says:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400), "| url", page.url().slice(0, 100)); throw e; }); await page.waitForTimeout(4000);
  await page.evaluate(() => { document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((x) => x.click()); document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((x) => x.click()); });
  await page.waitForTimeout(800);
}
const reveal = (row) => row.evaluate((e) => { e.classList.remove("ob-folded"); let p = e; while (p) { if (p.hasAttribute && p.hasAttribute("hidden")) p.removeAttribute("hidden"); p.classList && p.classList.remove("ob-folded", "is-collapsed"); if (p.matches && p.matches(".ob-phase")) p.classList.add("open"); p = p.parentElement; } });
const clean = (s) => s.replace(/\s+/g, " ");
// ── admin ──
// LOOK_ADMIN / LOOK_CLIENT narrow it (comma lists): every load signs in against the clients' database, so look at what you need → feedback_my_test_runs_share_the_clients_database
const pick = (v, all) => (process.env[v] != null ? process.env[v].split(",").filter(Boolean) : all);
for (const scene of pick("LOOK_ADMIN", ["kept", "bulk", "short"])) {
  const { ctx, page, presses } = await browser(scene); await openAdmin(page);
  const row = page.locator('.ob-step[data-ob-step="m1.gbp.photos"]').first(); await reveal(row);
  const fold = row.locator("[data-zc-everything]");
  if (await fold.count()) { await fold.locator("summary").click(); await page.waitForTimeout(300); console.log(`[admin 38 fold · ${scene}]`, clean(await fold.innerText()).slice(0, 900)); }
  if (scene === "bulk") console.log("[admin 38 bulk]", clean(await row.locator(".pr-top").first().innerText()).slice(0, 300));
  if (scene === "short") console.log("[admin 38 head]", clean(await row.locator(".ob-card-h").first().innerText()).slice(0, 200), "|", clean(await row.locator(".ob-zc-note").first().innerText()).slice(0, 260));
  await row.screenshot({ path: `${out}/admin-38-${scene}.png` });
  if (scene === "kept") {
    const d = page.locator('.ob-step[data-ob-step="m1.gbp.business_description"]').first(); await reveal(d);
    console.log("[admin 33 pill]", clean(await d.locator(".ob-row .ob-status").first().innerText()));
    console.log("[admin 33 card]", clean(await d.locator("[data-desc-card]").first().innerText()).slice(0, 700));
    await d.locator(".ob-title").first().click(); await page.waitForTimeout(800);   // the row's accordion
    await d.locator("[data-desc-card]").first().evaluate((e) => e.removeAttribute("hidden"));
    await d.locator("[data-desc-card]").first().screenshot({ path: `${out}/admin-33-failed.png`, timeout: 8000 });
    const btn = d.locator("[data-desc-publish]").first(); await btn.scrollIntoViewIfNeeded(); await btn.click(); await page.waitForTimeout(1500);
    console.log("[admin 33 after a press]", presses.length, "press ·", clean(await d.locator("[data-desc-said]").first().innerText()).slice(0, 240));
    const c = page.locator('.ob-step[data-ob-step="m1.audit.citations"]').first(); await reveal(c);
    console.log("[admin 18 card]", clean(await c.locator("[data-cit-auto]").first().innerText()).slice(0, 400));
    await c.locator(".ob-title").first().click(); await page.waitForTimeout(800);
    await c.locator("[data-cit-auto]").first().evaluate((e) => e.removeAttribute("hidden"));
    await c.locator("[data-cit-auto]").first().screenshot({ path: `${out}/admin-18-ran.png`, timeout: 8000 });
  }
  console.log(`[admin ${scene}] overflow px`, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  await ctx.close();
}
// ── client ──
for (const [scene, vw] of pick("LOOK_CLIENT", ["short", "kept", "only"]).map((x) => [x, 1100])) {
  const gl = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email }) })).json();
  const { ctx, page } = await browser(scene, vw);
  await page.goto(gl.action_link || gl.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"], .portal-nav a[data-view="approve"]', { state: "attached", timeout: 45000 }).catch(() => console.log("no nav"));
  await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => console.log("still loading"));
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click()); await page.waitForTimeout(1500);
  await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 }).catch(() => {});
  await page.waitForSelector('[id="step-row-m1.gbp.photos"]', { state: "attached", timeout: 25000 }).catch(() => {});
  const row = page.locator('[id="step-row-m1.gbp.photos"]').first();
  if (!(await row.count())) { console.log(`[client ${scene}] NO ROW`, clean(await page.locator("body").innerText()).slice(0, 300)); await ctx.close(); continue; }
  const head = clean(await row.locator(".pm-step-headings").first().innerText()).slice(0, 200);
  console.log(`[client row · ${scene}]`, head);
  if (await row.evaluate((e) => e.classList.contains("is-collapsed"))) { await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click()); await page.waitForTimeout(800); }
  const card = row.locator(".pm-cs-card, .pm-k5-plan").first();
  if (await card.count()) { console.log(`[client card · ${scene}]`, clean(await card.innerText()).replace(/Shot \d+ of \d+[^]*?›/g, "").slice(0, 900)); }
  await row.screenshot({ path: `${out}/client-10-${scene}-${vw}.png`, timeout: 10000 }).catch(() => console.log("(row hidden, no shot)"));
  console.log(`[client ${scene} ${vw}] overflow px`, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  await ctx.close();
}
await b.close();
