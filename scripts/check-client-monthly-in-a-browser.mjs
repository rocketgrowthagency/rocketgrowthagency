#!/usr/bin/env node
// check-client-monthly-in-a-browser.mjs — THE CLIENT'S MONTHLY SIDE, READ THE WAY THE CLIENT READS IT (approved client_monthly_v1, the owner 11-9).
// Signs in READ-ONLY as the walk clients (every write is blocked by scripts/acceptance/guard.mjs), serves THIS repo's portal.js / portal.css / shared files instead of the live ones
// (so it checks the build BEFORE the deploy), and reads the VISIBLE text of Dashboard, Ongoing work and Reports on a desktop and a phone. It asserts:
//   · when the client is between months (Month 1 done, the first monthly month not started): the between-months card is shown, with the posts chooser visible
//   · none of "Starts after setup", "Emailed on the 5th", "RGA writes 4", an em dash, or admin words (GBP, NAP, GSC, GA4, H1, CTA, schema, silo, "Their YouTube channel") appears
//   · the Dashboard's next step AGREES with Ongoing work (the customer list open there = "Send ... customer list" here; nothing open = "Nothing needs you right now")
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
  "/shared/monthly-start.js": "shared/monthly-start.js", "/shared/setup-fewer.js": "shared/setup-fewer.js", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json" };
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
      for (const v of ["dashboard", "ongoing", "reports"]) {
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
        const D = T.dashboard, O = T.ongoing, R = T.reports;
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
await browser.close();
if (F.length) { console.log(`\n${F.length} FAILURE(S)`); process.exit(1); }
if (flaky) { console.log("\nFLAKY: a page did not load; nothing was proven wrong. Retry."); process.exit(2); }
console.log("\nHOLDS: the client's monthly side reads right on desktop and phone."); process.exit(0);
