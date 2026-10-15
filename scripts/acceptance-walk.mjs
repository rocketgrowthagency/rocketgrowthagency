#!/usr/bin/env node
/**
 * acceptance-walk.mjs — a READ-ONLY click-through of every month-1 onboarding step, in the live admin
 * AND the live client portal, with a screenshot of each and a short report for Chris.
 *
 * Replaces "click through each step and send me screenshots". Plain Node — no AI usage.
 *
 * ─── WHAT IT DOES ────────────────────────────────────────────────────────────────────────────────
 *  1. Reads the month-1 steps from the website repo's data/playbooks/playbooks.json.
 *  2. ADMIN (puppeteer, as hello@): opens the test client's Onboarding tab, takes the cards straight
 *     from the page (.ob-phase), opens every step row (.ob-row) and records number, title, status
 *     pill and body; screenshots each step.
 *  3. PORTAL (playwright, as the test client): screenshots dashboard / approvals / setup, then every
 *     visible #step-row-<id> in the setup view (expanding its head toggle), recording its pill.
 *  4. Checks per step: row exists with number + pill · it opened when clicked · no junk text ·
 *     no page error / no function 5xx while it was open (4xx = warning) · admin and portal AGREE on
 *     done-ness · optional expectations (scripts/acceptance/expectations.mjs).
 *  5. Writes <website>/reports/acceptance/<date>/report.md (+ results.json, screenshots) and a copy
 *     at reports/acceptance/latest.md.
 *
 * 🔴 READ-ONLY. It clicks only: .ob-row toggles, phase/rollup fold toggles, [data-view] nav links,
 *    and the portal row-head toggle ([data-step-toggle] — UI only, portal.js toggleStepRow). Every
 *    non-GET request is aborted unless guard.mjs lists it as a verified read; each abort is logged
 *    as "blocked write: …".
 *
 * Usage:  node scripts/acceptance-walk.mjs [--step=<id>] [--card=<n>] [--no-shots]
 *                                         [--admin-only] [--portal-only] [--as=main|new|month2] [--client=<uuid>]
 *         --as picks the test client from scripts/acceptance/clients.mjs (default main). `new` = the brand-new
 *         client frozen at day 0; its report is reports/acceptance/latest-new-client.md (<date>/new-client/).
 *         `month2` = the Month-2 client (Month 1 finished, nothing sent this month), walked on MONTH 2: the admin's
 *         Monthly checklist vs the portal's Month-2 steps; its report is reports/acceptance/latest-month2.md.
 * Exit:   0 all PASS (UNKNOWN allowed) · 1 any FAIL · 2 could not run (sign-in failed / site down)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./acceptance/guard.mjs";
import { EXPECTATIONS } from "./acceptance/expectations.mjs";
import { WALK_CLIENTS } from "./acceptance/clients.mjs";

const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBSITE = process.env.RGA_WEBSITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

// ── env (never printed) ─────────────────────────────────────────────────────────────────────────
try {
  for (const line of fs.readFileSync(path.join(SCRAPER, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* reported below as missing creds */ }

const cantRun = (msg) => { console.error(`\n✗ COULD NOT RUN — ${msg}`); process.exit(2); };
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) cantRun("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from the scraper .env");
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPA_HOST = new URL(SUPA).host;

// ── options ─────────────────────────────────────────────────────────────────────────────────────
const arg = (k) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes("=") ? a.split("=").slice(1).join("=") : true) : null; };
const OPT = {
  step: arg("step"), card: arg("card") ? Number(arg("card")) : null, shots: !arg("no-shots"),
  admin: !arg("portal-only"), portal: !arg("admin-only"),
  as: arg("as") || "main",
};
const WHO = WALK_CLIENTS[OPT.as];
if (!WHO || !WHO.id) cantRun(`--as=${OPT.as}: no such test client in scripts/acceptance/clients.mjs`);
OPT.client = arg("client") || WHO.id;
const PORTAL_EMAIL = WHO.email;

const { openAdminClient, settle, SITE } = await import("./_admin-session.mjs");
const PORTAL_URL = `${SITE}/portal/`;

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const DATE = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const OUT = path.join(WEBSITE, "reports", "acceptance", DATE, WHO.dir);
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileSafe = (id) => id.replace(/[^a-zA-Z0-9._-]/g, "_");

// ── the SOP ─────────────────────────────────────────────────────────────────────────────────────
let PLAYBOOK;
try { PLAYBOOK = JSON.parse(fs.readFileSync(path.join(WEBSITE, "data/playbooks/playbooks.json"), "utf8")); }
catch (e) { cantRun(`could not read playbooks.json: ${e.message}`); }
// 🔑 WHICH MONTH (2026-10-13): a walk client with `month: 2` (WALK_CLIENTS.month2) is walked on Month 2: the admin's
// Monthly checklist against the portal's Month-2 rows. Same readers, same agreement rules. `M1` = the steps walked.
const MONTH = WHO.month === 2 ? 2 : 1;
const PFX = MONTH === 2 ? "m2." : "m1.";
const ADMIN_TAB = MONTH === 2 ? "monthlynew" : "onboarding-v2";
const ADMIN_TAB_NAME = MONTH === 2 ? "Monthly" : "Onboarding";
// Month 1's checklist is grouped into phase cards (.ob-phase); Month 2's is ONE flat list in #monthlyChecklistHost
// (measured live 2026-10-13: 28 m2 rows, no .ob-phase), so the whole list is read as one card.
const PHASES = MONTH === 2 ? "#monthlyChecklistHost" : ".ob-phase[data-ob-phase]";
const STEP_SCOPE = MONTH === 2 ? "#monthlyChecklistHost" : ".ob-phase";
// The portal view the step rows are read in: Month 1 = Setup; Month 2 = Ongoing work (approved 10-08 design).
const ROW_VIEW = MONTH === 2 ? "ongoing" : "setup";
const M1 = ((MONTH === 2 ? PLAYBOOK.month2plus : PLAYBOOK.month1) || []).filter((s) => String(s.id).startsWith(PFX));
if (!M1.length) cantRun(`playbooks.json has no month-${MONTH} steps`);
const DEF = new Map(M1.map((s) => [s.id, s]));
const clientFacing = (d) => d && (d.clientStepNo != null);

// ── site up? ────────────────────────────────────────────────────────────────────────────────────
for (let i = 1; ; i++) {
  try { const r = await fetch(SITE, { signal: AbortSignal.timeout(20000) }); if (r.status < 500) break; throw new Error(`HTTP ${r.status}`); }
  catch (e) { if (i >= 3) cantRun(`the site ${SITE} is not answering (${e.message})`); await sleep(3000); }
}

// ── per-step evidence buckets ───────────────────────────────────────────────────────────────────
const JUNK = [
  [/\bundefined\b/, "undefined"], [/\bNaN\b/, "NaN"], [/\[object Object\]/, "[object Object]"],
  [/(^|[^\w-])null(?=[^\w-]|$)/, "null"], [/\$\{/, "${"], [/\{\{/, "{{"],
];
const junkIn = (text, id) => {
  let t = text || "";
  for (const re of EXPECTATIONS[id]?.allowText || []) t = t.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), "");
  return JUNK.filter(([re]) => re.test(t)).map(([, w]) => w);
};
const blocked = [];   // { side, where, label }
const STUB_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };
// The portal's own failure card (portal.js) — a view showing it is broken, however long its text is.
const BROKEN_PAGE = /Something went wrong|We had trouble loading/i;
function bucket() { return { errors: [], fail5xx: [], warn4xx: [] }; }

// Attach request guard + evidence collection. `side` = "admin" | "portal".
function evidenceTracker(side) {
  const t = { current: "page load", buckets: new Map(), inflight: new Set(), lastActivity: Date.now() };
  t.b = (k = t.current) => { if (!t.buckets.has(k)) t.buckets.set(k, bucket()); return t.buckets.get(k); };
  t.onBlocked = (label, stub) => { blocked.push({ side, where: t.current, label: stub ? `${label} (answered locally with an empty 204, not sent)` : label }); };
  t.onPageError = (msg) => t.b().errors.push(String(msg).split("\n")[0].slice(0, 180));
  t.onResponse = (url, status) => {
    if (!url.includes("/.netlify/functions/")) return;
    const fn = url.split("/.netlify/functions/")[1].split(/[?#]/)[0];
    // 🔴 10-15: a 401/403 is a GUARD REFUSING THE PAGE ITS OWN DATA — a bug, not a warning. portal-thread and
    // portal-review-requests 403'd on every admin load from 10-14 and the walk only warned. (Writes never reach here:
    // the guard answers them locally.)
    if (status >= 500 || status === 401 || status === 403) t.b().fail5xx.push(`${status}${status < 500 ? " (refused)" : ""} ${fn}`);
    else if (status >= 400) t.b().warn4xx.push(`${status} ${fn}`);
  };
  const tracked = (url) => url.includes("/.netlify/functions/") || url.includes(SUPA_HOST);
  t.reqStart = (key, url) => { if (tracked(url)) { t.inflight.add(key); t.lastActivity = Date.now(); } };
  t.reqEnd = (key) => { if (t.inflight.delete(key)) t.lastActivity = Date.now(); };
  // Wait until no tracked request is in flight and none has finished for `quiet` ms (cap `max`).
  t.quiet = async (quiet = 700, max = 12000) => {
    const end = Date.now() + max;
    while (Date.now() < end) {
      if (t.inflight.size === 0 && Date.now() - t.lastActivity >= quiet) return true;
      await sleep(150);
    }
    return false;
  };
  return t;
}

const results = new Map();   // id → result record
const R = (id) => {
  if (!results.has(id)) results.set(id, { id, def: DEF.get(id), admin: null, portal: null, fail: [], unknown: [], warn: [], notes: [] });
  return results.get(id);
};
const pageChecks = [];       // { side, name, fail[], warn[] , shot }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ADMIN PASS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
let CARDS = [];   // [{ n, key, name, ids[] }]
async function adminPass() {
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    page.setDefaultTimeout(30000);
    const t = evidenceTracker("admin");
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    page.on("pageerror", (e) => t.onPageError(e?.message || e));
    page.on("response", (r) => t.onResponse(r.url(), r.status()));
    page.on("requestfinished", (r) => t.reqEnd(r));
    page.on("requestfailed", (r) => t.reqEnd(r));
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const d = classify(req.url(), req.method(), req.postData(), { supabaseHost: SUPA_HOST });
      if (!d.allow) {
        t.onBlocked(d.label, d.stub);
        if (d.stub) return req.respond({ status: 204, headers: STUB_HEADERS, body: "" }).catch(() => {});
        return req.abort("blockedbyclient").catch(() => {});
      }
      t.reqStart(req, req.url());
      req.continue().catch(() => {});
    });

    console.log("── admin: signing in as the owner …");
    const rows = await openAdminClient(page, OPT.client, ADMIN_TAB);
    if (!rows) cantRun(`the admin ${ADMIN_TAB_NAME} tab rendered no step rows (twice) — sign-in or render failed`);
    await t.quiet(1500, 20000);
    // Sign-in sanity: we must be on the admin, not a login form.
    const onLogin = await page.evaluate(() => !!document.querySelector("input[type=password], #loginForm") && !document.querySelector(".ob-step"));
    if (onLogin) cantRun("the admin showed a sign-in form after the magic link");

    CARDS = await page.evaluate(({ PHASES, PFX }) => [...document.querySelectorAll(PHASES)].map((ph, i) => ({
      n: i + 1, key: ph.dataset.obPhase || ph.id,
      name: (ph.querySelector(".ob-ph-name")?.childNodes[0]?.textContent || ph.dataset.obPhase || ph.querySelector(".ob-h")?.textContent || ph.id).trim(),
      ids: [...new Set([...ph.querySelectorAll(".ob-step[data-ob-step]")].map((e) => e.dataset.obStep))].filter((id) => id.startsWith(PFX)),
    })), { PHASES, PFX });
    const onPage = new Set(CARDS.flatMap((c) => c.ids));
    for (const s of M1) if (!onPage.has(s.id)) { const r = R(s.id); r.fail.push(`no admin row for this step on the ${ADMIN_TAB_NAME} tab`); }

    const loadB = t.b("page load");
    pageChecks.push({ side: "admin", name: `Admin ${ADMIN_TAB_NAME} tab loads`, fail: [
      ...loadB.errors.map((e) => `page error on load: ${e}`), ...loadB.fail5xx.map((e) => `function failed on load: ${e}`)],
      warn: loadB.warn4xx.map((e) => `function ${e} on load`) });

    const order = CARDS.filter((c) => !OPT.card || c.n === OPT.card).flatMap((c) => c.ids.map((id) => ({ id, card: c })));
    const todo = order.filter((o) => !OPT.step || o.id === OPT.step);
    if (OPT.step && !todo.length) { const r = R(OPT.step); if (!r.fail.length) r.fail.push("step not found on the admin page"); }

    for (const { id, card } of todo) {
      const r = R(id);
      r.card = card;
      t.current = id;
      const sel = `${STEP_SCOPE} .ob-step[data-ob-step="${id.replace(/"/g, '\\"')}"]`;
      // make sure its card and rollup are unfolded (UI toggles only)
      await page.evaluate((sel) => {
        const el = document.querySelector(sel); if (!el) return;
        const ph = el.closest(".ob-phase");
        if (ph && !ph.classList.contains("open")) ph.querySelector("[data-ob-phase-toggle]")?.click();
        el.closest("[data-ob-rollup]")?.querySelector("[data-ob-rollup-toggle][aria-expanded='false']")?.click();
        document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((b) => { if (b.closest(".ob-phase")?.contains(el)) b.click(); });
      }, sel);
      const before = await page.evaluate((sel) => {
        const el = document.querySelector(sel); if (!el) return null;
        const row = el.querySelector(":scope > .ob-row");
        return { hasRow: !!row, toggle: !!row?.classList.contains("ob-row-toggle"), folded: el.classList.contains("ob-folded") };
      }, sel);
      if (!before) { r.fail.push("admin row disappeared before it could be opened"); continue; }
      if (!before.hasRow) r.fail.push("admin step has no .ob-row header");
      let clicked = false;
      if (before.toggle && before.folded) {
        await page.evaluate((sel) => document.querySelector(sel)?.querySelector(":scope > .ob-row")?.click(), sel);
        clicked = true;
      }
      // wait for it to open (re-query: a poll can re-render the list)
      let opened = !before.folded || !before.toggle;
      for (let i = 0; clicked && i < 30; i++) {
        opened = await page.evaluate((sel) => { const el = document.querySelector(sel); return !!el && !el.classList.contains("ob-folded"); }, sel);
        if (opened) break; await sleep(150);
      }
      await t.quiet(600, 4000);   // the admin polls in the background, so "quiet" may never come — cap it
      const info = await page.evaluate((sel) => {
        const el = document.querySelector(sel); if (!el) return null;
        const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
        const bodies = [...el.children].filter((c) => !c.classList.contains("ob-row") && !c.classList.contains("ob-lockmsg"));
        const pill = el.querySelector(":scope > .ob-row .ob-status");
        return {
          num: (el.querySelector(":scope > .ob-row .ob-sid")?.textContent || "").trim(),
          glyph: (el.querySelector(":scope > .ob-row .ob-num")?.textContent || "").trim(),
          pill: pill ? pill.textContent.replace(/\s+/g, " ").trim() : "",
          pillCls: pill ? pill.className : "",
          cls: el.className,
          title: (el.querySelector(".ob-title")?.innerText || "").replace(/\s+/g, " ").trim(),
          text: el.innerText || "",
          bodies: bodies.length, bodiesVisible: bodies.filter(vis).length,
          folded: el.classList.contains("ob-folded"), visible: vis(el),
        };
      }, sel);
      if (!info) { r.fail.push("admin row vanished after opening"); continue; }
      r.admin = info;
      if (!info.num || !/\d/.test(info.num)) r.fail.push("admin row shows no step number");
      if (!info.pill) r.fail.push("admin row shows no status pill");
      if (!info.visible) r.fail.push("admin row is not visible on the page");
      if (before.toggle && (!opened || info.folded || info.bodiesVisible === 0)) r.fail.push("admin step did not open when its row was clicked");
      if (!before.toggle) r.notes.push("admin row has no body to open");
      const junk = junkIn(info.text, id);
      if (junk.length) r.fail.push(`junk text on admin: ${junk.map((j) => `"${j}"`).join(", ")}`);
      const b = t.b(id);
      for (const e of b.errors) r.fail.push(`admin page error: ${e}`);
      for (const e of b.fail5xx) r.fail.push(`admin function failed: ${e}`);
      for (const e of b.warn4xx) r.warn.push(`admin ${e}`);
      for (const re of EXPECTATIONS[id]?.admin || []) if (!re.test(`${info.title}\n${info.text}`)) r.fail.push(`expected ${re} not on the admin`);
      if (OPT.shots) {
        const file = `${pad(Number(info.num) || 0)}-${fileSafe(id)}.png`;
        try {
          const h = await page.$(sel);
          await h.screenshot({ path: path.join(OUT, "admin", file) });
          r.adminShot = `admin/${file}`;
        } catch (e) { r.warn.push(`admin screenshot failed: ${String(e.message).split("\n")[0]}`); }
      }
      t.current = "between steps";
      process.stdout.write(`   admin ${pad(Number(info.num) || 0)} ${id} — ${info.pill}\n`);
    }
    const between = t.b("between steps");
    if (between.errors.length || between.fail5xx.length) {
      pageChecks.push({ side: "admin", name: "Admin, between steps (background polls)", fail: [
        ...between.errors.map((e) => `page error: ${e}`), ...between.fail5xx.map((e) => `function failed: ${e}`)], warn: [] });
    }
  } finally { await browser.close().catch(() => {}); }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PORTAL PASS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
async function portalLink() {
  for (let i = 1; i <= 3; i++) {
    try {
      const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
        method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", email: PORTAL_EMAIL, options: { redirect_to: PORTAL_URL } }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await g.json();
      const link = j?.action_link || j?.properties?.action_link;
      if (link) return link;
    } catch { /* retry */ }
    await sleep(2000);
  }
  cantRun("could not mint a portal sign-in link for the test client");
}

async function portalPass() {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { cantRun("playwright is not installed"); }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const t = evidenceTracker("portal");
    await context.route("**/*", (route) => {
      const q = route.request();
      const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: SUPA_HOST });
      if (!d.allow) {
        t.onBlocked(d.label, d.stub);
        if (d.stub) return route.fulfill({ status: 204, headers: STUB_HEADERS, body: "" }).catch(() => {});
        return route.abort("blockedbyclient").catch(() => {});
      }
      return route.continue().catch(() => {});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    page.on("pageerror", (e) => t.onPageError(e?.message || e));
    page.on("request", (q) => t.reqStart(q, q.url()));
    page.on("requestfinished", (q) => t.reqEnd(q));
    page.on("requestfailed", (q) => t.reqEnd(q));
    page.on("response", (r) => t.onResponse(r.url(), r.status()));

    console.log("── portal: signing in as the test client …");
    let signedIn = false;
    for (let i = 1; i <= 3 && !signedIn; i++) {
      try {
        await page.goto(await portalLink(), { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 });
        // 🔴 THE NAV IS IN THE PAGE BEFORE THE SESSION IS (2026-10-13): one Month-2 run read Dashboard and Approvals while
        // "Loading portal · Checking your secure session" was still up, and failed them as empty. Signed in = the
        // loading panel has gone. → feedback_a_flaky_gate_is_worse_than_a_failing_one
        await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
        signedIn = true;
      } catch (e) {
        console.error(`   (portal sign-in attempt ${i} did not reach the portal: ${String(e.message).split("\n")[0]})`);
      }
    }
    if (!signedIn) cantRun("the client portal never showed its navigation after the magic link (sign-in failed or site down)");
    await t.quiet(1500, 20000);

    // Views
    // the step rows are read in the LAST view opened, so it is the one they live in
    for (const v of ["dashboard", "approvals", ...(ROW_VIEW === "setup" ? [] : ["setup"]), ROW_VIEW]) {
      t.current = `view:${v}`;
      await page.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), v);
      await sleep(1200); await t.quiet(800, 12000);
      const txt = await page.evaluate(() => [...document.querySelectorAll(".portal-view,.portal-sections,#portalSections,main")]
        .filter((e) => e.offsetParent !== null).map((e) => e.innerText).join("\n"));
      const pc = { side: "portal", name: `Portal ${v} view`, fail: [], warn: [] };
      if (BROKEN_PAGE.test(txt)) pc.fail.push(`the ${v} view shows the portal's error card ("Something went wrong")`);
      if (txt.trim().length < 60) pc.fail.push(`the ${v} view rendered ${txt.trim().length} characters — effectively empty`);
      const junk = junkIn(txt); if (junk.length) pc.fail.push(`junk text: ${junk.map((j) => `"${j}"`).join(", ")}`);
      const b = t.b();
      pc.fail.push(...b.errors.map((e) => `page error: ${e}`), ...b.fail5xx.map((e) => `function failed: ${e}`));
      pc.warn.push(...b.warn4xx);
      if (OPT.shots) {
        try { await page.screenshot({ path: path.join(OUT, "portal", `view-${v}.png`), fullPage: true }); pc.shot = `portal/view-${v}.png`; }
        catch (e) { pc.warn.push(`screenshot failed: ${String(e.message).split("\n")[0]}`); }
      }
      pageChecks.push(pc);
    }
    const loadB = t.b("page load");
    pageChecks.unshift({ side: "portal", name: "Portal loads (signed in as the client)", fail: [
      ...loadB.errors.map((e) => `page error on load: ${e}`), ...loadB.fail5xx.map((e) => `function failed on load: ${e}`)],
      warn: loadB.warn4xx.map((e) => `function ${e} on load`) });

    // Step rows, in the view they live in (ROW_VIEW)
    const ids = OPT.step ? [OPT.step] : M1.map((s) => s.id);
    for (const id of ids) {
      const loc = page.locator(`[id="step-row-${id}"]`).filter({ visible: true });
      const n = await loc.count();
      if (!n) continue;
      const r = R(id);
      t.current = `portal:${id}`;
      const row = loc.first();
      if (n > 1) r.warn.push(`${n} visible portal rows for this step — read the first`);
      const collapsed = await row.evaluate((e) => e.classList.contains("is-collapsed"));
      if (collapsed) {
        await row.evaluate((e) => e.querySelector(":scope > [data-step-toggle]")?.click());
        await sleep(400); await t.quiet(600, 8000);
      }
      const info = await row.evaluate((e) => {
        const pill = e.querySelector(".pm-pill");
        return {
          num: (e.querySelector(".pm-step-num")?.textContent || "").trim(),
          pill: pill ? pill.textContent.trim() : "", pillCls: pill ? pill.className : "",
          isNow: e.classList.contains("is-now"), collapsed: e.classList.contains("is-collapsed"),
          title: (e.querySelector(".pm-step-title")?.innerText || "").trim(), text: e.innerText || "",
        };
      });
      r.portal = info;
      if (collapsed && info.collapsed) r.fail.push("portal row did not expand when its head was clicked");
      const junk = junkIn(info.text, id);
      if (junk.length) r.fail.push(`junk text on portal: ${junk.map((j) => `"${j}"`).join(", ")}`);
      const b = t.b();
      for (const e of b.errors) r.fail.push(`portal page error: ${e}`);
      for (const e of b.fail5xx) r.fail.push(`portal function failed: ${e}`);
      for (const e of b.warn4xx) r.warn.push(`portal ${e}`);
      for (const re of EXPECTATIONS[id]?.portal || []) if (!re.test(`${info.title}\n${info.text}`)) r.fail.push(`expected ${re} not on the portal`);
      if (OPT.shots) {
        try { await row.screenshot({ path: path.join(OUT, "portal", `${fileSafe(id)}.png`) }); r.portalShot = `portal/${fileSafe(id)}.png`; }
        catch (e) { r.warn.push(`portal screenshot failed: ${String(e.message).split("\n")[0]}`); }
      }
      process.stdout.write(`   portal ${id} — ${info.pill}${info.isNow ? " (now)" : ""}\n`);
    }
  } finally { await browser.close().catch(() => {}); }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AGREEMENT — admin vs portal done-ness
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Admin: a finished row renders `.ob-step.done` / `.ob-step.declined` and pill Done / Declined / Skipped
//   (admin.js row builders ~7944, 8249, 8303, 8315, 8357). Open rows are active / waits / queued /
//   ready / locked.
// Portal: one pill per row (portal.js ~4290): .pm-pill.done "Done" · .you "Your turn" ·
//   .rga "RGA is doing it" · .auto "Detected automatically" · .flag "You flagged this" ·
//   .wait "Waits on your Business Profile" (one_google_listing_first_v1; wording v11, 10-14);
//   `.is-now` marks the client's next action.
function adminDoneness(a) {
  if (!a) return null;
  const cls = ` ${a.cls} `;
  if (/ (done|declined|skipped) /.test(cls) || /^(Done|Declined|Skipped)$/i.test(a.pill)) return "finished";
  if (/ (active|waits|queued|ready|locked) /.test(cls)) return "open";
  return null;
}
function portalDoneness(p) {
  if (!p) return null;
  const c = ` ${p.pillCls} `;
  if (/ flag /.test(c)) return "flagged";
  if (/ done /.test(c) || p.pill === "Done") return "finished";
  if (/ you /.test(c) || p.pill === "Your turn") return "client-turn";
  if (/ wait /.test(c) || /^Waits on\b/.test(p.pill || "")) return "waiting";
  if (/ (rga|auto) /.test(c)) return "open";
  return null;
}
function agree(r) {
  if (!OPT.admin || !OPT.portal) return;
  const cf = clientFacing(r.def);
  // 🔴 2026-10-13: the new client's first walk compared NONE of its 13 client-facing steps (at stage 3 the portal has no
  // Month-1 rows) and exited 0. A walk that compared nothing is not a pass: for a test client whose stage shows the rows
  // (WALK_CLIENTS[..].portalRowsRequired), a missing row FAILS.
  if (!r.portal) { if (cf && r.admin) (WHO.portalRowsRequired ? r.fail : r.unknown).push("client-facing step, but no visible portal row to compare"); return; }
  if (!r.admin) { r.unknown.push("portal row exists but the admin row was not read"); return; }
  const a = adminDoneness(r.admin), p = portalDoneness(r.portal);
  if (!a || !p) { r.unknown.push(`cannot tell done-ness (admin "${r.admin.pill}", portal "${r.portal.pill}")`); return; }
  if (p === "flagged") { r.unknown.push("client flagged this step — done-ness not compared"); return; }
  if (a === "finished" && (p === "client-turn" || r.portal.isNow)) r.fail.push(`admin says "${r.admin.pill}" but the portal asks the client to act ("${r.portal.pill}"${r.portal.isNow ? ", marked as their next step" : ""})`);
  else if (p === "finished" && a !== "finished") r.fail.push(`portal says Done but the admin shows "${r.admin.pill}"`);
  else if (a === "finished" && p !== "finished") r.fail.push(`admin says "${r.admin.pill}" but the portal shows "${r.portal.pill}"`);
  // 🔴 2026-10-12: done-ness alone passed step 39 while the admin said "Waits on step 11" and the portal told the client
  // "Your turn" on an upload it had locked — two true things that contradict. A step the admin shows as WAITING ON
  // SOMETHING (locked / waits on another step) must not be presented to the client as their move.
  // → feedback_a_card_can_state_two_true_things_that_contradict
  // 🔑 THE ONE PAIRING THAT IS CORRECT (2026-10-13, first walk as a brand-new client): the kickoff call is 🔒 Locked
  // in the admin until RGA confirms a time (its prerequisite, "Book the kickoff call"), and that confirm WAITS FOR the
  // client's pick. So "Your turn" on the client's booking row is the step that unlocks the admin's — not a client
  // asked to do a waiting step. Exempt ONLY while the portal really shows the time picker (a date heading + slots);
  // any other "Your turn" on that row still fails. → project_a_client_step_waits_on_what_it_needs (left out, item 2)
  else if (r.def?.clientForm === "kickoff_booking" && /^(🔒\s*)?Locked\b/i.test(String(r.admin.pill || "").trim())
    && p === "client-turn" && /choose a date and time/i.test(r.portal.text || "") && /\b\d{1,2}:\d{2}\s?(AM|PM)\b/.test(r.portal.text || ""))
    r.notes.push("kickoff: the admin's lock waits for this pick (the time picker is showing) — correct, exempt");
  else if (/^(🔒\s*)?(Locked|Waits on)\b/i.test(String(r.admin.pill || "").trim()) && (p === "client-turn" || r.portal.isNow))
    r.fail.push(`admin says "${r.admin.pill}" but the portal tells the client "${r.portal.pill}"${r.portal.isNow ? " (their next step)" : ""} — the client is asked to do a step that is waiting`);
  // 🔒 "REMIND ME LATER" (step7_later_and_upload_v1, 10-15): a grey "Later · <date>" pill is the CLIENT'S OWN choice, not a
  // hold — correct only while the admin row says the same ("Client chose later · reminder …"); otherwise it still fails below.
  else if (/^Later · /.test(String(r.portal.pill || "").trim()) && /Client chose later · reminder /.test(r.admin.text || ""))
    r.notes.push("the client chose later (reminder date on both sides) — correct");
  // …and the other way: the portal holds the client back on a step the admin has open to work.
  else if (p === "waiting" && !/^(🔒\s*)?(Locked|Waits on)\b/i.test(String(r.admin.pill || "").trim()))
    r.fail.push(`the portal says "${r.portal.pill}" but the admin shows "${r.admin.pill}" — the client is held back on a step that is open`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════════
fs.mkdirSync(path.join(OUT, "admin"), { recursive: true });
fs.mkdirSync(path.join(OUT, "portal"), { recursive: true });
// keep a week of runs — 60+ screenshots a day would otherwise grow without end
try {
  const root = path.join(WEBSITE, "reports", "acceptance");
  const keep = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const d of fs.readdirSync(root)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < keep) fs.rmSync(path.join(root, d), { recursive: true, force: true });
} catch { /* pruning is housekeeping, never a reason to fail the walk */ }
try {
  if (OPT.admin) await adminPass();
  if (OPT.portal) await portalPass();
} catch (e) {
  cantRun(`the walk itself crashed: ${String(e?.stack || e).split("\n").slice(0, 3).join(" | ")}`);
}

// Which steps go in the report: those the admin pass saw (card order), else playbook order.
let rows = [];
if (OPT.admin && CARDS.length) {
  for (const c of CARDS) for (const id of c.ids) if (results.has(id) && (!OPT.step || id === OPT.step)) rows.push(R(id));
  for (const r of results.values()) if (!rows.includes(r)) rows.push(r);
} else {
  rows = M1.map((s) => s.id).filter((id) => results.has(id)).map(R);
  if (OPT.portal && !OPT.admin) for (const s of M1) if (!results.has(s.id) && clientFacing(s) && (!OPT.step || s.id === OPT.step)) { R(s.id).unknown.push("client-facing step, no visible portal row"); rows.push(R(s.id)); }
}
for (const r of rows) agree(r);
const verdict = (r) => (r.fail.length ? "FAIL" : r.unknown.length ? "UNKNOWN" : "PASS");
const pageVerdict = (p) => (p.fail.length ? "FAIL" : "PASS");

// ── report ──────────────────────────────────────────────────────────────────────────────────────
const secs = Math.round((Date.now() - T0) / 1000);
const dur = `${Math.floor(secs / 60)}m${pad(secs % 60)}s`;
const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0 };
for (const r of rows) counts[verdict(r)]++;
const pageFails = pageChecks.filter((p) => p.fail.length).length;
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const blockedAgg = new Map();
for (const b of blocked) {
  const k = `${b.side} · ${b.label}`;
  const e = blockedAgg.get(k) || { n: 0, where: new Set() }; e.n++; e.where.add(b.where); blockedAgg.set(k, e);
}

function renderReport(prefix) {
  const L = [];
  const mode = [OPT.admin && "admin", OPT.portal && "portal"].filter(Boolean).join(" + ");
  L.push(`# Acceptance walk — ${DATE}${OPT.as !== "main" ? ` — ${WHO.label}` : ""}`, "");
  L.push(`**${rows.length} steps · ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.UNKNOWN} UNKNOWN** · page checks: ${pageChecks.length - pageFails}/${pageChecks.length} pass · ${blocked.length} blocked write(s) · run ${dur} · ${mode}${OPT.step ? ` · step ${OPT.step}` : ""}${OPT.card ? ` · card ${OPT.card}` : ""}`, "");
  L.push(`${WHO.label} \`${OPT.client}\` (${PORTAL_EMAIL}) · read-only: only row/fold toggles and nav links were clicked; every write request was blocked.`, "");
  const bad = rows.filter((r) => verdict(r) !== "PASS");
  if (bad.length || pageFails) {
    L.push("## Needs a look", "");
    for (const p of pageChecks.filter((p) => p.fail.length)) L.push(`- **FAIL · ${esc(p.name)}** — ${esc(p.fail.join("; "))}`);
    for (const r of bad) {
      const num = r.admin?.num ? `${r.admin.num}. ` : "";
      L.push(`- **${verdict(r)} · ${num}${esc(r.def?.title || r.id)}** (\`${r.id}\`) — ${esc([...r.fail, ...r.unknown].join("; "))}`);
    }
    L.push("");
  }
  L.push("## Pages", "", "| Page | Result | Why | Shot |", "|---|---|---|---|");
  for (const p of pageChecks) L.push(`| ${esc(p.name)} | ${pageVerdict(p)} | ${esc([...p.fail, ...p.warn.map((w) => `warn: ${w}`)].join("; "))} | ${p.shot ? `[view](${prefix}${p.shot})` : ""} |`);
  L.push("");
  const groups = [];
  if (CARDS.length) {
    for (const c of CARDS) { const g = rows.filter((r) => r.card === c); if (g.length) groups.push({ name: `Card ${c.n} — ${c.name}`, rows: g }); }
    const rest = rows.filter((r) => !r.card); if (rest.length) groups.push({ name: "Not on the admin page", rows: rest });
  } else groups.push({ name: "Steps", rows });
  for (const g of groups) {
    L.push(`## ${esc(g.name)}`, "", "| # | Step | Admin | Portal | Result | Why | Shots |", "|---|---|---|---|---|---|---|");
    for (const r of g.rows) {
      const why = [...r.fail, ...r.unknown, ...r.warn.map((w) => `warn: ${w}`)].join("; ");
      const shots = [r.adminShot && `[admin](${prefix}${r.adminShot})`, r.portalShot && `[portal](${prefix}${r.portalShot})`].filter(Boolean).join(" · ");
      const portal = r.portal ? `${r.portal.pill}${r.portal.isNow ? " (next)" : ""}` : "—";
      L.push(`| ${esc(r.admin?.num || "")} | ${esc(r.def?.title || r.id)} | ${esc(r.admin?.pill || "—")} | ${esc(portal)} | ${verdict(r)} | ${esc(why)} | ${shots} |`);
    }
    L.push("");
  }
  L.push("## Blocked writes", "");
  if (!blockedAgg.size) L.push("None — the pages tried no writes.");
  else for (const [k, e] of blockedAgg) L.push(`- blocked write: ${esc(k)} ×${e.n} (while: ${esc([...e.where].join(", "))})`);
  L.push("");
  return L.join("\n");
}

fs.writeFileSync(path.join(OUT, "report.md"), renderReport(""));
fs.writeFileSync(path.join(WEBSITE, "reports", "acceptance", WHO.report), renderReport(`${DATE}/${WHO.dir ? `${WHO.dir}/` : ""}`));
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({
  date: DATE, as: OPT.as, client: OPT.client, durationSec: secs, counts, pageChecks, blocked,
  steps: rows.map((r) => ({ id: r.id, title: r.def?.title, card: r.card?.name, verdict: verdict(r), fail: r.fail, unknown: r.unknown, warn: r.warn, notes: r.notes,
    admin: r.admin && { ...r.admin, text: r.admin.text.slice(0, 4000) }, portal: r.portal && { ...r.portal, text: r.portal.text.slice(0, 4000) },
    adminShot: r.adminShot, portalShot: r.portalShot })),
}, null, 2));

console.log(`\n${rows.length} steps · ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.UNKNOWN} UNKNOWN · page checks ${pageChecks.length - pageFails}/${pageChecks.length} · ${blocked.length} blocked write(s) · ${dur}`);
console.log(`report: ${path.join(OUT, "report.md")}`);
process.exit(counts.FAIL || pageFails ? 1 : 0);
