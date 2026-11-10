#!/usr/bin/env node
// check-client-monthly-in-a-browser.mjs — THE CLIENT'S MONTHLY SIDE, READ THE WAY THE CLIENT READS IT (approved client_monthly_v1, the owner 11-9).
// Signs in READ-ONLY as the walk clients (every write is blocked by scripts/acceptance/guard.mjs), serves THIS repo's portal.js / portal.css / shared files instead of the live ones
// (so it checks the build BEFORE the deploy), and reads the VISIBLE text of Dashboard, Ongoing work and Reports on a desktop and a phone. It asserts:
//   · when the client is between months (Month 1 done, the first monthly month not started): the between-months card is shown, with the posts chooser visible
//   · none of "Starts after setup", "Emailed on the 5th", "RGA writes 4", an em dash, or admin words (GBP, NAP, GSC, GA4, H1, CTA, schema, silo, "Their YouTube channel") appears
//   · the Dashboard's next step AGREES with Ongoing work (the customer list open there = "Send ... customer list" here; nothing open = "Nothing needs you right now")
//   · client_monthly_cycle_v1 (11-10): the Eastern-time monthly walk client is answered with FIXTURE reads (Month 1 sent, a monthly record, the mode; GET responses rewritten, writes still blocked) and read in four variants:
//     Month 2, Month 3 (a quarter month), an unreadable record, and the self-serve portal (its cards must still be drawn). Each asserts the month card, RGA's work, no win-story form, no "step N", no em dash,
//     no "We email you the moment", no "Live once your campaign starts", and no sideways scroll on the phone.
//   · Reports is one card per month, the Month 1 letter opens and reads in client words, and the page does not scroll sideways on a phone
// The server half (monthly-reports month1_letter) is answered here by THIS repo's handler against the real database (GET only), because the live function is not deployed yet.
//   node --env-file=.env scripts/check-client-monthly-in-a-browser.mjs        (SITE_DIR=<website checkout> to point at a worktree)
// Exit 0 holds · 1 regressed · 2 flaky or can't tell (retry)
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
import { classify } from "./acceptance/guard.mjs"; import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = process.env.APPROVAL_ARCHIVE_SITE_DIR || process.env.SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PORTAL = "https://www.rocketgrowthagency.com/portal/";
if (!SUPA || !KEY) { console.error("INDETERMINATE: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (run with node --env-file=.env)"); process.exit(2); }
const OUT = process.env.OUT_DIR || "/tmp/client-monthly-gate"; fs.mkdirSync(OUT, { recursive: true });
const req = createRequire(path.join(SITE_DIR, "netlify/functions/x.js"));
// CM_DIR (rare): read the shared rules from another checkout, to prove the gate fails against an OLD portal.js (the before state)
const CM = createRequire(path.join(process.env.CM_DIR || SITE_DIR, "x.js"))("./shared/client-monthly.js");
const ci = (x) => String(x).toLowerCase();
const F = [], fail = (m) => { F.push(m); console.log("  FAIL " + m); }, ok = (m) => console.log("  ok   " + m);
const rest = async (p) => { const r = await fetch(`${SUPA}/rest/v1${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); if (!r.ok) throw new Error(`GET ${p.slice(0, 60)} ${r.status}`); return r.json(); };

const FORBIDDEN = [[/Starts after setup/i, "Starts after setup"], [/Emailed on the 5th/i, "Emailed on the 5th"], [/RGA writes 4\b/, "RGA writes 4"], [/RGA is writing [A-Za-z]+'s 4\b/, "RGA is writing <month>'s 4"],
  [/—/, "an em dash"], [/\bGBP\b/, "GBP"], [/\bNAP\b/, "NAP"], [/\bGSC\b/, "GSC"], [/\bGA4\b/, "GA4"], [/\bH1\b/, "H1"], [/\bCTA\b/, "CTA"], [/\bschema\b/i, "schema"], [/\bsilo\b/i, "silo"], [/Their YouTube channel/, "Their YouTube channel"],
  [/of these are still too recent/, "'1 of these are'"], [/a Google post and a photo each week/i, "a Google post and a photo each week"]];

// the monthly-reports function, answered by THIS repo's handler with GET-only database reads (so the Month 1 letter is checked before the deploy)
function letterHandler() {
  const mod = req("./monthly-reports.js");
  mod.__useDeps({ gate: { viaWorkspace: false }, supa: async (p, init = {}) => { if (init.method && init.method !== "GET") throw new Error("the gate must not write: " + p); return rest(p); } });
  return mod;
}

async function expectedState(clientId) {
  const [ob] = await rest(`/client_onboarding_records?client_id=eq.${clientId}&select=data&limit=1`);
  const tasks = (ob && ob.data && ob.data.tasks) || {};
  return { tasks, between: CM.betweenMonths(tasks, new Date()), done: CM.month1DoneOf(tasks) };
}

async function visible(page, view) {
  await page.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), view);
  await page.waitForTimeout(view === "ongoing" ? 6000 : 4500);
  return page.evaluate(() => { const m = [...document.querySelectorAll("[class*='pv-']")].find((e) => e.offsetParent && e.className.includes("pv-") && !/pv-facts/.test(e.className)); return ((m || document.querySelector("main") || document.body).innerText || ""); });
}

const { chromium } = await import("playwright");
let browser;
try { browser = await chromium.launch({ headless: true }); } catch (e) { console.error("INDETERMINATE: no browser: " + e.message); process.exit(2); }
const local = { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/portal/index.html": "portal/index.html", "/shared/client-monthly.js": "shared/client-monthly.js", "/shared/step-lock.js": "shared/step-lock.js", "/shared/portal-mode.js": "shared/portal-mode.js",
  "/shared/monthly-start.js": "shared/monthly-start.js", "/shared/monthly-sections.js": "shared/monthly-sections.js", "/shared/monthly-weekly.js": "shared/monthly-weekly.js", "/shared/monthly-monthly.js": "shared/monthly-monthly.js", "/shared/setup-fewer.js": "shared/setup-fewer.js", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json" };
const letterMod = letterHandler();
let flaky = false;

for (const which of ["main", "month2"]) {
  const wc = WALK_CLIENTS[which];
  if (!wc || !wc.email || !wc.id) continue;
  const st = await expectedState(wc.id).catch((e) => { console.log("  (could not read " + which + ": " + e.message + ")"); return null; });
  if (!st) { if (which === "main") flaky = true; continue; }
  console.log(`\n== ${wc.label || which} · Month 1 done: ${st.done ? new Date(st.done.at).toISOString().slice(0, 10) + " (" + st.done.how + ")" : "no"} · between months: ${st.between ? "yes, Month 2 starts " + st.between.startMonth : "no"}`);
  for (const [tag, vp] of [["desk", { width: 1200, height: 1000 }], ["phone", { width: 400, height: 860 }]]) {
    let page;
    try {
      const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: wc.email, options: { redirect_to: PORTAL } }) })).json();
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
      await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname] && u.pathname !== "/portal/index.html", (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
      await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && u.pathname.endsWith("/.netlify/functions/monthly-reports"), async (r) => {
        let body = {}; try { body = JSON.parse(r.request().postData() || "{}"); } catch {}
        if (body.month1_letter !== true) return r.fallback();
        const res = await letterMod.handler({ httpMethod: "POST", body: JSON.stringify(body), headers: {} });
        r.fulfill({ status: res.statusCode, contentType: "application/json", body: res.body });
      });
      page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200))); if (process.env.DEBUG) page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log("   console." + m.type() + ": " + m.text().slice(0, 240)); });
      await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector('.portal-nav a[data-view="setup"]', { state: "attached", timeout: 45000 });
      await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
      const T = {};
      for (const v of ["dashboard", "setup", "ongoing", "reports"]) {   // setup_vs_month1_v1 (11-10): Setup is read too (Getting started, no Locked card)
        T[v] = await visible(page, v);
        if (v === "reports") {   // open the Month 1 letter if there is one
          const sum = page.locator("details[data-m1-letter] summary").first();
          if (await sum.count()) { await sum.click(); await page.waitForFunction(() => { const b = document.querySelector("[data-m1-letter-body]"); return b && b.innerText && !/^Opening/.test(b.innerText.trim()); }, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(500);
            T.reports = await page.evaluate(() => (document.querySelector(".pv-reports") || document.body).innerText); }
        }
        await page.screenshot({ path: `${OUT}/${which}-${tag}-${v}.png`, fullPage: true });
      }
      if (errs.length) fail(`${which}/${tag}: the page threw: ${errs[0]}`);
      // forbidden words, on all three views
      for (const v of Object.keys(T)) for (const [re, name] of FORBIDDEN) { const m = re.exec(T[v]); if (m) fail(`${which}/${tag}/${v}: shows ${name}: "…${T[v].slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, " ")}…"`); }
      if (tag === "phone") { const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth })); if (w.s > w.i + 2) fail(`${which}/phone: the page scrolls sideways (${w.s} > ${w.i})`); }
      if (tag === "desk") {
        const D = T.dashboard, O = T.ongoing, R = T.reports, S = T.setup || "";
        // ── setup_vs_month1_v1 (approved 11-10): Setup is Getting started (3 steps); Month 1 work is the first month card; no Locked card; first-review wording while Google shows 0 ──
        {
          const MANAGED = /GETTING STARTED|Month 1/i.test(S + O);
          if (/complete Step 4|Locked\s*[:\u2014-]\s*complete|Service phase dashboard|Finish Getting started to unlock/i.test(S + D + O)) fail(`${which}: the Locked card ("complete Step 4 to unlock") is on the page`);
          if (MANAGED && !st.done) {   // Month 1 is running (the report has not gone out)
            if (!/Getting started/i.test(S)) fail(`${which}: Setup does not show Getting started`);
            else if (!/\b3 of 3\b|Setup complete/i.test(S) && /complete|done/i.test(S)) ok(`${which}: Setup shows Getting started`);
            if (/Provide 20\+ business photos|Ask your 5 most recent|close-out call/i.test(S)) fail(`${which}: Month 1 work or the close-out call is still in Setup`);
            if (!/YOUR PART THIS MONTH/i.test(O) || !/END OF MONTH 1/i.test(O) || !/RGA'S WORK THIS MONTH/i.test(O)) fail(`${which}: Ongoing work has no Month 1 card (Your part · RGA's work · End of Month 1)`); else ok(`${which}: the Month 1 card is there`);
            const vid = (O.match(/Record 2 short videos[\s\S]{0,160}/i) || [""])[0];
            if (/\bDone\b/.test(vid.split(/Not now|Track calls/i)[0] || "")) fail(`${which}: "Record 2 short videos" reads Done (RGA's channel setup must not count as the client's videos)`);
            if (/No reviews on Google yet/i.test(O) && (!/Get your first reviews/i.test(O) || /more reviews/i.test(O))) fail(`${which}: Google shows 0 reviews but the card does not read "Get your first reviews" (or says "more reviews")`);
          }
        }
        if (st.between) {
          const startWords = `Month 2 starts ${CM.shortDay(st.between.startMs)}`, startDay = CM.shortDay(st.between.startMs);
          if (!ci(O).includes(ci(startWords))) fail(`${which}: Ongoing work does not show the between-months card "${startWords}"`); else ok(`${which}: Ongoing work shows "${startWords}"`);
          for (const needle of ["Running until then", "Starting in " + st.between.monthName, "Choose before " + startDay]) if (!ci(O).includes(ci(needle))) fail(`${which}: Ongoing work is missing the group "${needle}"`);
          if (!/How many Google posts a month\?/.test(O)) fail(`${which}: the posts chooser is not visible on Ongoing work`); else ok(`${which}: the posts chooser is visible`);
          if (!/Month 1 \u00b7 done/i.test(O) || !ci(O).includes(ci(`Month 2 \u00b7 ${st.between.monthName}`))) fail(`${which}: the month chips are missing`);
          if (!/Your .* report/i.test(O) || !new RegExp(`sends it early ${st.between.nextReportMonth}`, "i").test(O)) fail(`${which}: the report line must say RGA checks it and sends it early ${st.between.nextReportMonth}`);
          // the dashboard's next step agrees with Ongoing work
          const next = (D.split(/\n/).map((x) => x.trim()).filter(Boolean)); const ni = next.findIndex((x) => /^YOUR NEXT STEP$/i.test(x)); const title = ni >= 0 ? next[ni + 1] : "";
          const listOpen = /Send my list|Who did you finish jobs for\?|Add a customer/.test(O) && !/customers? asked\s*\n?.*Done/.test(O);
          const wantList = /^Send (this week's|these 2 weeks'|this month's) customer list$/;
          if (listOpen && !wantList.test(title)) fail(`${which}: the customer list is open on Ongoing work but the Dashboard's next step reads "${title}"`);
          else if (!listOpen && wantList.test(title)) fail(`${which}: the customer list is not open on Ongoing work but the Dashboard says "${title}"`);
          else ok(`${which}: Dashboard next step "${title}" agrees with Ongoing work (list ${listOpen ? "open" : "not open"})`);
          if (!listOpen && !/Nothing needs you right now|Choose how many Google posts/.test(title)) fail(`${which}: with nothing open the next step must say "Nothing needs you right now" (it reads "${title}")`);
          if (/Nothing needs you right now/.test(title) && !new RegExp(`${CM.shortDay(st.between.startMs)}|due`).test(D.split(/YOUR NEXT STEP/i)[1] || "")) fail(`${which}: "Nothing needs you right now" must name the next date`);
          if (!new RegExp(`Month 2 \\u00b7 ${st.between.monthName}`, "i").test(D)) fail(`${which}: What to expect must lead with "Month 2 · ${st.between.monthName}"`);
        }
        // tiles name their period
        if (/CALL-BUTTON TAPS\s*\n\s*\d+/i.test(D) && !/\b(in|so far in) [A-Z][a-z]+/.test(D.split(/CALL-BUTTON TAPS/i)[1] || "")) fail(`${which}: the Call-button taps tile does not name its month`);
        if (/NEW REVIEWS\s*\n\s*\d+/i.test(D) && !/\b(in|so far in) [A-Z][a-z]+/.test(D.split(/NEW REVIEWS/i)[1] || "")) fail(`${which}: the New reviews tile does not name its window`);
        // reports: one card per month, the letter reads in client words
        if (st.done && st.done.how === "sent") {
          if (!/Month 1/.test(R) || !/Sent [A-Z][a-z]{2} \d/.test(R)) fail(`${which}: Reports has no "Month 1 ... Sent <date>" card`);
          if (!/What we did/.test(R)) fail(`${which}: the Month 1 letter did not open (no "What we did")`); else ok(`${which}: the Month 1 letter opens and reads "What we did"`);
          if (st.between && !new RegExp(`${st.between.monthName} \\u00b7 Month 2`, "i").test(R)) fail(`${which}: Reports has no "${st.between.monthName} · Month 2" card saying when its report comes`);
          if (st.between && !new RegExp(`sends it early ${st.between.nextReportMonth}`).test(R)) fail(`${which}: the upcoming month's card must say RGA checks it and sends it early ${st.between.nextReportMonth}`);
          if (/Google Search \(as measured/.test(R)) fail(`${which}: the baseline search line sits beside a month figure without its window`);
        }
      }
      await ctx.close();
    } catch (e) { flaky = true; console.log(`  (flaky ${which}/${tag}: ${String(e.message).slice(0, 160)})`); try { await page?.context().close(); } catch {} }
  }
}

// ───────────────────────── client_monthly_cycle_v1: the monthly month, read the way the client reads it ─────────────────────────
// The Eastern-time monthly walk client (WALK_CLIENTS.month2) has no monthly record and no sent Month 1 report in the database, so there is nothing to read. The gate answers THREE reads for that
// client with fixture data (Supabase GET responses rewritten in the browser; no write is ever allowed, scripts/acceptance/guard.mjs still blocks them): Month 1's report sent, a monthly record for
// this month, and the portal mode. Variants: m2 (Month 2, the month before a quarter month), m3 (Month 3, a quarter month, with Month 2 behind it), m2-unread (the month's record cannot be read),
// self-serve (the same client in the self-serve portal: its cards must still be drawn).
{
  const NOWMS = Date.now(), monthKey = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; };
  const CURM = monthKey(NOWMS), cm = (n) => CM.addMonths(CURM, n), nameOf = (m) => CM.monthName(m), shortOf = (ms) => CM.shortDay(ms);
  const wc2 = WALK_CLIENTS.month2;
  const fixtureTasks = (variant) => {
    const iso = new Date(NOWMS - 2 * 86400000).toISOString(), thru = shortOf(NOWMS - 3 * 86400000);
    return {
      "m2.exec.gbp_posts": { status: "in_progress", posts_wanted: 2, post_queue: [{ week: 1, status: "live" }], internal_review: { decision: "approved" }, auto_result: { outcome_data: { posts: [{ headline: "a" }, { headline: "b" }] } } },
      "m2.snap.grid_scan": { status: "done", completed_at: iso }, "m2.exec.profile_watch": { status: "done", completed_at: iso }, "m2.exec.site_audit_recurring": { status: "skipped" },
      "m2.exec.tracking_check": { status: "done", completed_at: iso, monthly_once: { settled_at: iso, label: `Working · data through ${thru}` } },
    };
  };
  const monthRow = (month, tasks, plan) => ({ client_id: wc2.id, reporting_month: month, total_leads: null, total_calls: 1, form_leads: 1, closed_jobs: null, avg_revenue_per_job: null, organic_sessions: null, gsc_impressions: null, gsc_clicks: null, citations_live_count: null, ranking_position: null, data: { tasks, plan: plan || null } });
  const VARIANTS = [
    { name: "m2", number: 2, sentMonth: cm(-1), view: ["desk", "phone"] },
    { name: "m3", number: 3, sentMonth: cm(-2), view: ["desk"] },
    { name: "m2-unread", number: 2, sentMonth: cm(-1), unread: true, view: ["desk"] },
    { name: "self-serve", number: 2, sentMonth: cm(-1), mode: "self_serve", view: ["desk"] },
  ];
  async function patchedGet(route, patch) {
    const q = route.request();
    if (q.method() !== "GET") return route.fallback();
    const resp = await route.fetch(), h = { ...resp.headers() }; delete h["content-length"]; delete h["content-encoding"];
    let out; try { out = patch(await resp.json()); } catch { return route.fulfill({ response: resp }); }
    return route.fulfill({ status: resp.status(), headers: h, body: JSON.stringify(out) });
  }
  for (const V of VARIANTS) for (const tag of V.view) {
    if (!wc2 || !wc2.email || !wc2.id) { console.log("  (no month2 walk client: the monthly month is not checked)"); flaky = true; break; }
    const vp = tag === "desk" ? { width: 1200, height: 1000 } : { width: 400, height: 860 }, label = `month2/${V.name}/${tag}`;
    let page;
    console.log(`\n== ${label} (fixture: Month 1 sent ${V.sentMonth.slice(0, 7)}, so ${nameOf(CURM)} is Month ${V.number}${V.unread ? "; this month's record unreadable" : ""}${V.mode ? "; " + V.mode : ""})`);
    try {
      const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: wc2.email, options: { redirect_to: PORTAL } }) })).json();
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.route("**/*", (r) => { const q = r.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? r.fulfill({ status: 204, body: "" }) : r.abort(); return r.fallback(); });
      await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && local[u.pathname] && u.pathname !== "/portal/index.html", (r) => { const p = new URL(r.request().url()).pathname; r.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(path.join(SITE_DIR, local[p]), "utf8") }); });
      const sentIso = `${V.sentMonth.slice(0, 7)}-15T15:00:00Z`;
      await ctx.route((u) => u.host === new URL(SUPA).host && u.pathname === "/rest/v1/client_onboarding_records", (r) => patchedGet(r, (b) => { const fix = (row) => (row && row.client_id === wc2.id ? { ...row, data: { ...(row.data || {}), tasks: { ...((row.data || {}).tasks || {}), "m1.report.month1": { status: "done", completed_at: sentIso, auto_result: { sent_message_id: "fixture", sent_at: sentIso } } } } } : row); return Array.isArray(b) ? b.map(fix) : fix(b); }));
      await ctx.route((u) => u.host === new URL(SUPA).host && u.pathname === "/rest/v1/client_monthly_records", (r) => patchedGet(r, (b) => {
        const mine = (Array.isArray(b) ? b : []).filter((x) => x.client_id !== wc2.id || ![CURM, cm(-1)].includes(String(x.reporting_month).slice(0, 10)));
        const rows = V.unread ? [] : [monthRow(CURM, fixtureTasks(V.name), { focus: "Reviews", tasks: [{ client: "Ask recent customers for a review" }] })];
        if (V.number === 3) rows.push(monthRow(cm(-1), { "m2.exec.profile_watch": { status: "done", completed_at: new Date(NOWMS - 20 * 86400000).toISOString() }, "m2.snap.grid_scan": { status: "in_progress" } }));
        return [...rows, ...mine].sort((x, y) => String(y.reporting_month).localeCompare(String(x.reporting_month)));
      }));
      await ctx.route((u) => u.host === new URL(SUPA).host && u.pathname === "/rest/v1/clients", (r) => patchedGet(r, (b) => (Array.isArray(b) ? b.map((x) => (x && "portal_mode" in x ? { ...x, portal_mode: V.mode || "managed" } : x)) : b)));
      page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
      await page.goto(g.action_link || g.properties?.action_link, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector('.portal-nav a[data-view="setup"]', { state: "attached", timeout: 45000 });
      await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
      const T = {};
      let numbered = [];
      for (const v of ["dashboard", "ongoing", "reports"]) { T[v] = await visible(page, v); if (v === "ongoing") numbered = await page.evaluate(() => [...document.querySelectorAll(".pv-ongoing .pm-step-num")].filter((e) => e.offsetParent && /^\d+$/.test(e.textContent.trim())).map((e) => e.textContent.trim())); await page.screenshot({ path: `${OUT}/month2-${V.name}-${tag}-${v}.png`, fullPage: true }); }
      if (errs.length) fail(`${label}: the page threw: ${errs[0]}`);
      const D = T.dashboard, O = T.ongoing, R = T.reports, mo = nameOf(CURM), nx = nameOf(cm(1));
      const has = (txt, re, what) => { if (!(re instanceof RegExp ? re.test(txt) : ci(txt).includes(ci(re)))) fail(`${label}: ${what}`); };
      const lacks = (txt, re, what) => { const m = re instanceof RegExp ? re.exec(txt) : (ci(txt).includes(ci(re)) ? [re] : null); if (m) fail(`${label}: ${what} ("${String(m[0]).slice(0, 60)}")`); };
      for (const v of Object.keys(T)) for (const [re, name] of FORBIDDEN) { const m = re.exec(T[v]); if (m) fail(`${label}/${v}: shows ${name}: "…${T[v].slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, " ")}…"`); }
      if (tag === "phone") { const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth })); if (w.s > w.i + 2) fail(`${label}: the page scrolls sideways (${w.s} > ${w.i})`); else ok(`${label}: no sideways scroll on the phone`); }
      if (V.mode === "self_serve") {
        // the self-serve portal keeps its cards: this build changes MANAGED mode only
        has(O, /Share one customer win story/i, "the self-serve Ongoing work lost the win-story card");
        has(O, /Monthly check-in call/i, "the self-serve Ongoing work lost the Monthly check-in call card");
        has(O, /Your numbers/i, "the self-serve Ongoing work lost the Your numbers card");
        lacks(O, "RGA's work this month", "the self-serve portal got the managed month card");
        const n = await page.evaluate(() => document.querySelectorAll("#portalRoot .pm-step-row, .pv-setup .pm-step-row, [id^='action-items-list-'] .pm-step-row").length);
        if (n < 5) fail(`${label}: the self-serve portal draws only ${n} step cards`); else ok(`${label}: the self-serve portal still draws its cards (${n} step rows; win story, check-in call and numbers are there)`);
        continue;
      }
      // Ongoing work: one month card
      has(O, `Month 1 · done`, "the Month 1 chip is missing"); has(O, `Month 2 · ${nameOf(V.number === 2 ? CURM : cm(-1))}`, "the Month 2 chip is missing");
      has(O, `${mo} · Month ${V.number}`, `the month card is not headed "${mo} · Month ${V.number}"`);
      has(O, `${CM.rangeWords(CURM, NOWMS).split(" \u00b7 ")[0]} \u00b7 day`, "the month's range and day are missing");
      has(O, "Your part this month", "the group 'Your part this month' is missing");
      has(O, "RGA's work this month", "the group 'RGA's work this month' is missing");
      has(O, "End of the month", "the group 'End of the month' is missing");
      has(O, new RegExp(`Your ${mo} report`), "the end-of-month report line is missing"); has(O, new RegExp(`sends it early ${nx}`), `the report line must say it is sent early ${nx}`);
      has(O, "Monthly check-in call", "the check-in call is not a line under End of the month");
      lacks(O, /Share one customer win story|win story form/i, "the monthly win-story form is still drawn");
      lacks(O, /\bstep \d+\b/i, "step text is still on a monthly card"); lacks(O, /What we watched|Not due this month|Done by RGA this month/i, "an old per-step card is still drawn");
      if (V.number === 2) lacks(O, /Your numbers \(every 3 months\)|A video this quarter/i, "the quarter's cards are drawn outside a quarter month");
      lacks(O, /Go to step|Your first ones come from step/i, "the reviews card still names a step");
      if (numbered.length) fail(`${label}: step numbers are drawn on monthly cards: ${numbered.join(",")}`);
      if (V.unread) {
        has(O, "couldn't read", "an unreadable record must say it couldn't read");
        const greens = await page.evaluate(() => [...document.querySelectorAll(".pv-ongoing [data-og-month] [data-og-mpanel]:not([hidden]) .pm-og-li")].filter((li) => li.querySelector(".pm-og-mk.ok") && /Google posts|Review replies|Map scan|Website health|profile watch|focus|Tracking|Competitors|Listings/i.test(li.innerText)).map((li) => li.innerText.split("\n")[0]));
        if (greens.length) fail(`${label}: an unreadable record shows done lines: ${greens.join(" | ")}`); else ok(`${label}: an unreadable record says "couldn't read" and shows nothing as done`);
      } else {
        has(O, /Google posts\s*\n[^\n]*\n?[^\n]*1 of 2 live/i, "the posts line must read '1 of 2 live' (posts_wanted 2, one live)");
        has(O, /Map scan/, "RGA's work lacks the map scan line"); has(O, /Google profile watch/, "RGA's work lacks the profile watch line"); has(O, /Tracking still works/, "RGA's work lacks the tracking line");
        has(O, /data through [A-Z][a-z]{2} \d/, "the tracking line must carry its data-through date");
        lacks(O, "Website health check", "a step skipped for this client is still listed");
        has(O, new RegExp(`RGA's work this month\\s*\\n?\\s*\\d+ of \\d+ done`, "i"), "RGA's work this month must say 'N of M done'");
        has(O, "Google posts to approve", "'Google posts to approve' is missing from Your part"); has(O, /2 posts are drafted/, "the approve line must count the 2 drafted posts"); has(O, /2 needs you|needs you/, "'N needs you' is missing");
        has(O, /This month's focus/, "This month's focus is missing from RGA's work");
        if (V.number === 2) has(O, `${nx} is a quarter month`, `Coming up must say ${nx} is a quarter month`); else lacks(O, /is a quarter month/, "a quarter month must not say 'is a quarter month'");
        if (V.number === 3) {
          has(O, "This quarter", "a quarter month lacks 'This quarter'"); has(O, /numbers/i, "the quarter's numbers are missing"); has(O, /video/i, "the quarter's video is missing"); has(O, "Anything RGA asks you to OK", "the quarter's yes pointer is missing");
          // a past month opens read-only, with its report
          await page.evaluate(() => { document.querySelector('.portal-nav a[data-view="ongoing"]')?.click(); document.querySelector("[data-og-mchip]:not([aria-pressed='true']):not([data-og-mchip='m1'])")?.click(); });
          await page.waitForTimeout(600);
          const P = await page.evaluate(() => [...document.querySelectorAll("[data-og-mpanel]")].find((e) => !e.hidden)?.innerText || "");
          has(P, `What was done in ${nameOf(cm(-1))}`, "a past month does not open"); has(P, new RegExp(`Your ${nameOf(cm(-1))} report`), "a past month has no link to its report"); lacks(P, /Send my list|Who did you finish jobs for/, "a past month is not read-only");
        } else lacks(O, "This quarter", "'This quarter' is drawn outside a quarter month");
      }
      // Dashboard
      lacks(D, /What to expect/i, "'What to expect' is still on a monthly Dashboard"); has(D, /^\s*This month\s*$/m, "the Dashboard lacks the 'This month' card");
      has(D, new RegExp(`RGA's work: (\\d+ of \\d+ done|couldn't read)`), "This month lacks 'RGA's work: N of M done'"); has(D, new RegExp(`sends it early ${nx}`), `This month must say the report is sent early ${nx}`); has(D, "We never promise", "This month lacks 'We never promise'");
      has(D, /YOUR NEXT STEP/i, "the Dashboard has no 'Your next step' card");
      if (!V.unread) has(D, "Approve 2 Google posts", "the next step must be 'Approve 2 Google posts' (the oldest open client step)");
      for (const t of ["Avg map rank", "Call-button taps", "Leads tracked", "New reviews"]) has(D, t, `the tile '${t}' is missing`);
      lacks(D, /Live once your campaign starts/i, "'Live once your campaign starts' on a monthly client");
      if (!V.unread) has(D, new RegExp(`calls and forms so far in ${mo} · data through [A-Z][a-z]{2} \\d`), "the Leads tile must read the tracking step");
      if (/CALL-BUTTON TAPS\s*\n\s*\d+/i.test(D) && !new RegExp(`in ${nameOf(cm(-1))}`).test(D.split(/CALL-BUTTON TAPS/i)[1] || "")) fail(`${label}: the Call-button taps tile does not name the last complete month`);
      if (/LEADS TRACKED\s*\n\s*0\b/i.test(D) && V.unread) fail(`${label}: a leads tile with no record reads 0`);
      // Reports
      has(R, new RegExp(`${mo} · Month ${V.number}`), `Reports lacks the ${mo} month card`); has(R, new RegExp(`In progress · RGA checks it and sends it early ${nx}`), "the month in progress must say 'In progress, RGA checks it and sends it early <next>'");
      lacks(R, /We email you the moment/i, "Reports says a report sends itself");
      ok(`${label}: checked Ongoing work, Dashboard and Reports`);
      await ctx.close();
    } catch (e) { flaky = true; console.log(`  (flaky ${label}: ${String(e.message).slice(0, 160)})`); try { await page?.context().close(); } catch {} }
  }
}

await browser.close();
if (F.length) { console.log(`\n${F.length} FAILURE(S)`); process.exit(1); }
if (flaky) { console.log("\nFLAKY: a page did not load; nothing was proven wrong. Retry."); process.exit(2); }
console.log("\nHOLDS: the client's monthly side reads right on desktop and phone."); process.exit(0);
