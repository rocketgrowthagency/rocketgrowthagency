#!/usr/bin/env node
/**
 * check-live-matches-the-approved-mockup.mjs — an approved mockup is a specification.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-25. Chris approved `client_setup_steps_v2.html`, I built part of it, and reported the mockup as shipped:
 *   "this is mockup … this is live … NEED TO MATCH LIVE TO MOCKUP EXACTLY YOU DDIDNT DO THIS."
 * I was comparing the live page to my MEMORY of what I had approved. This gate compares the live screen with the mockup itself.
 * 2026-10-15 its one hand-written pair was superseded and it went dormant (no pairs, in no runner). 11-11 checkers build (master map
 * approved by Chris): REVIVED, DATA-DRIVEN, so it can never run out of pairs again.
 *
 * ─── HOW ─────────────────────────────────────────────────────────────────────────────────────────
 * PAIRS come from the data, not a list: every step in website docs/master-sop/steps/steps.json whose `mockup_governing` exists as
 * website reports/mockups/<id>.html (the mockup registry). Each mockup is judged against the screens its steps live on: the admin
 * (the walk client's Onboarding, Monthly, Website and Overview tabs, folds opened) and/or the client portal (every nav view),
 * rendered LIVE in chromium with every write blocked (acceptance/guard.mjs: every non-GET denied unless verified read-only).
 * The words compared are the mockup's load-bearing ones (headings, buttons, summaries; scripts/lib/mockup-match.mjs); a whole-page
 * diff cried wolf and is never attempted. Each mockup's share found live is a measure, and the gate fails when a mockup's share
 * FALLS more than 10 points below what was recorded (scripts/mockup-match-baseline.json): live drifted away from what Chris approved.
 * `--record` writes today's shares as the baseline (after a reviewed change). A mockup with no baseline yet is printed, not failed.
 * Runs in the NIGHTLY full check (every night), not the daily one, to spare production.
 * 🔑 SELF-PROVING: the rules run on fixtures first; inside the mutation harness only they run (no live render).
 *
 * Exit 0 = no approved mockup drifted · 1 = a mockup's wording left the live screen · 2 = could not tell (sign-in, render, no pairs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = process.env.SITE_DIR || `${__SITE}`;
const REAL_SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// the master map moved to the Master SOP 11-11 (docs/master-sop/steps/steps.json); the old place is read only as a fallback
const STEPS_JSON = ["docs/master-sop/steps/steps.json", "reports/master-audit/steps.json"];
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const lib = fs.existsSync(path.join(SCR, "scripts/lib/mockup-match.mjs")) ? path.join(SCR, "scripts/lib/mockup-match.mjs") : path.join(REAL, "scripts/lib/mockup-match.mjs");
const M = await import(pathToFileURL(lib).href);
const BASELINE = path.join(REAL, "scripts/mockup-match-baseline.json");
const selfFail = (m) => idk(`self-test: ${m}`);
console.log("── live matches the approved mockup ──");

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const html = `<style>h3{}</style><h1>Option A: one list</h1><h2>Every state</h2><h3>Getting started</h3><h4>Month 1 work</h4><h3>Why this</h3><button>Run again</button><span class="btn p">Skip</span><summary>What RGA did</summary><script>"<h3>Not real</h3>"</script><div class="tag">Check what we found &amp; confirm</div><span class="chip">Thanksgiving</span>`;
  const ph = M.phrasesOf(html).sort().join("|");
  if (ph !== ["Check what we found & confirm", "Getting started", "Month 1 work", "Run again", "Skip", "What RGA did"].sort().join("|")) selfFail(`phrases read as [${ph}]`);
  const live = "Getting  started · MONTH 1 WORK · Check what we found & confirm · Run again";
  const r = M.matchRatio(M.phrasesOf(html), live);
  if (Math.round(r.ratio * 100) !== 67 || r.missing.sort().join() !== "Skip,What RGA did") selfFail(`4 of 6 phrases on screen reads as ${r.ratio}, missing [${r.missing}]`);
  const j = M.judge({ a: { ratio: 0.5 }, b: { ratio: 0.85 }, c: { ratio: 0.4 }, d: { ratio: null } }, { a: 0.7, b: 0.9 }, 0.1);
  if (j.drops.map((x) => x.id).join() !== "a" || j.fresh.join() !== "c") selfFail(`the ratchet read drops [${j.drops.map((x) => x.id)}] fresh [${j.fresh}], not [a] [c]`);
}
if (process.env.SCRAPER_COPY_DIR) { console.log("  ✅ self-test held (mutation copy: no live render)"); process.exit(0); }

// ── the pairs, from the data ─────────────────────────────────────────────────────────────────────────────────────────────
let STEPS = null;
for (const b of [SITE, REAL_SITE]) for (const rel of STEPS_JSON) { if (STEPS) break; try { STEPS = JSON.parse(fs.readFileSync(path.join(b, rel), "utf8")); } catch { /* next */ } }
if (!Array.isArray(STEPS)) idk("docs/master-sop/steps/steps.json is missing: no pairs can be built");
const mockFile = (id) => [SITE, REAL_SITE].map((b) => path.join(b, "reports/mockups", `${id}.html`)).find((p) => fs.existsSync(p)) || null;
const pairs = new Map();   // id → { file, admin, portal, steps }
for (const s of STEPS) {
  const id = s.mockup_governing;
  if (!id || id === "NONE" || !/^[a-z0-9_]+$/.test(id)) continue;
  const file = mockFile(id);
  if (!file) continue;
  const p = pairs.get(id) || { file, admin: false, portal: false, steps: [] };
  p.steps.push(s.id);
  if (s.admin_no != null) p.admin = true;
  if (s.client_title_selfserve || s.client_title_managed || /^(stage_|managed\.)/.test(s.id)) p.portal = true;
  if (!p.admin && !p.portal) p.admin = true;
  pairs.set(id, p);
}
if (!pairs.size) idk("no step's governing mockup exists as a file in reports/mockups: nothing to compare");

// ── render the live screens, every write blocked ─────────────────────────────────────────────────────────────────────────
const { requireCreds, openAdminClient, nav, H, SITE: LIVE } = await import(pathToFileURL(path.join(REAL, "scripts/_admin-session.mjs")).href);
const { classify } = await import(pathToFileURL(path.join(REAL, "scripts/acceptance/guard.mjs")).href);
const { WALK_CLIENTS } = await import(pathToFileURL(path.join(REAL, "scripts/acceptance/clients.mjs")).href);
const DB = requireCreds().SUPA;
let chromium;
try { ({ chromium } = await import("playwright")); } catch { idk("no playwright here"); }
const browser = await chromium.launch({ headless: true }).catch((e) => idk(`no browser: ${e.message}`));
const blocked = [];
const guard = async (ctx) => ctx.route("**/*", (r) => {
  const q = r.request();
  const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(DB).host });
  if (!d.allow) { blocked.push(`${q.method()} ${new URL(q.url()).pathname}`); return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); }
  return r.fallback();
});
const text = { admin: "", portal: "" };
const needAdmin = [...pairs.values()].some((p) => p.admin), needPortal = [...pairs.values()].some((p) => p.portal);
try {
  if (needAdmin) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await guard(ctx);
    const page = await ctx.newPage();
    if (!(await openAdminClient(page, WALK_CLIENTS.main.id, "onboarding-v2"))) idk("the admin checklist rendered no rows (3 tries)");
    for (const tab of ["onboarding-v2", "monthly", "website", "overview"]) {
      if (tab !== "onboarding-v2") { await nav(page, `${LIVE}/admin/?view=client&id=${WALK_CLIENTS.main.id}&tab=${tab}`, `the admin ${tab} tab`); await page.waitForTimeout(8000); }
      await page.evaluate(() => { document.querySelectorAll("details:not([open])").forEach((d) => { d.open = true; }); document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((b) => b.click()); });
      await page.waitForTimeout(1500);
      text.admin += "\n" + (await page.evaluate(() => document.body.innerText));
    }
    await ctx.close();
  }
  if (needPortal) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); await guard(ctx);
    const page = await ctx.newPage();
    const g = await (await fetch(`${DB}/auth/v1/admin/generate_link`, { method: "POST", headers: H(), body: JSON.stringify({ type: "magiclink", email: WALK_CLIENTS.main.email, options: { redirect_to: `${LIVE}/portal/` } }) })).json();
    const link = g.action_link || (g.properties || {}).action_link;
    if (!link) idk("no portal sign-in link");
    await nav(page, link, "the portal sign-in link");
    await page.waitForSelector(".portal-nav a[data-view]", { state: "attached", timeout: 45000 }).catch(() => idk("the portal never drew its menu"));
    await page.waitForFunction(() => !document.body.innerText.includes("Loading your portal"), null, { timeout: 60000 }).catch(() => idk("the portal stayed on Loading"));
    const views = await page.evaluate(() => [...new Set([...document.querySelectorAll(".portal-nav a[data-view]")].map((a) => a.dataset.view))]);
    for (const v of views) {
      await page.evaluate((x) => document.querySelector(`.portal-nav a[data-view="${x}"]`)?.click(), v);
      await page.waitForTimeout(2500);
      await page.evaluate(() => document.querySelectorAll("details:not([open])").forEach((d) => { d.open = true; }));
      text.portal += "\n" + (await page.evaluate(() => document.body.innerText));
    }
    await ctx.close();
  }
} finally { await browser.close().catch(() => {}); }
if ((needAdmin && text.admin.length < 2000) || (needPortal && text.portal.length < 1000)) idk("a live screen rendered almost nothing");

// ── compare ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const results = {};
for (const [id, p] of pairs) {
  const phrases = M.phrasesOf(fs.readFileSync(p.file, "utf8"));
  const live = `${p.admin ? text.admin : ""}\n${p.portal ? text.portal : ""}`;
  results[id] = { ...M.matchRatio(phrases, live), n: phrases.length, where: [p.admin && "admin", p.portal && "portal"].filter(Boolean).join("+"), steps: p.steps };
}
let baseline = {};
try { baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")); } catch { baseline = {}; }
if (process.argv.includes("--record")) {
  const out = Object.fromEntries(Object.entries(results).filter(([, r]) => r.ratio != null).map(([id, r]) => [id, Math.round(r.ratio * 100) / 100]).sort());
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 1) + "\n");
  baseline = out;
  console.log(`  recorded ${Object.keys(out).length} mockups' shares → scripts/mockup-match-baseline.json`);
}
const { drops, fresh } = M.judge(results, baseline, 0.1);
for (const [id, r] of Object.entries(results).sort((a, b) => (a[1].ratio ?? 1) - (b[1].ratio ?? 1))) {
  console.log(`  ${r.ratio == null ? "·" : drops.some((d) => d.id === id) ? "🔴" : "✓"} ${id} (${r.where}, ${r.steps.length} step(s)): ${r.ratio == null ? "no load-bearing words" : `${r.found.length}/${r.n} on screen`}${r.ratio != null && r.missing.length ? ` · missing: ${r.missing.slice(0, 4).map((x) => `"${x}"`).join(", ")}${r.missing.length > 4 ? " …" : ""}` : ""}`);
}
if (blocked.length) console.log(`  (${blocked.length} write(s) the pages tried were blocked)`);
if (fresh.length) console.log(`  ℹ️  ${fresh.length} mockup(s) have no baseline yet (run with --record after review): ${fresh.join(", ")}`);
if (drops.length) {
  console.error(`🔴 ${drops.length} approved mockup(s) drifted: the live screen carries less of their wording than it did`);
  for (const d of drops) console.error(`   · ${d.id}: ${Math.round(d.was * 100)}% → ${Math.round(d.now * 100)}% (${results[d.id].missing.slice(0, 6).map((x) => `"${x}"`).join(", ")})`);
  process.exit(1);
}
console.log(`✅ no approved mockup drifted: ${pairs.size} mockups (from ${STEPS.length} steps' governing mockups) compared with the live admin and portal`);
