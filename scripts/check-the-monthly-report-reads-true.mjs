#!/usr/bin/env node
/**
 * check-the-monthly-report-reads-true.mjs — every number and sentence in the client's monthly report matches its inputs.
 *
 * ─── WHY (2026-10-31, research_audit_v1) ─────────────────────────────────────────────────────────
 * Measurement research read portal/report/report.js and _metrics.js and listed false output. Each was then run on fixed
 * inputs before any fix, and all of it was real:
 *   · 3 forms + 20 call-button taps printed "Enquiries 23", and a Pipeline value of $11,500 instead of $1,500.
 *   · Clicks falling from 400 to 100 printed "Visibility and clicks are both moving in the right direction."
 *   · A month where search impressions fell printed no headline at all.
 *   · "15–25" reviews in 90 days was typed into the page, twice.
 *   · 1 call becoming 2 printed "↑ 100%".
 *   · The August report drew October's map.
 *   · A Google response with no CALL_CLICKS series stored calls = 0, so "not returned" read as "nobody called".
 *
 * 🔑 THE REAL report.js RUNS IN A REAL BROWSER. Only the network is fake: the Supabase client and admin-config are routed
 * to fixtures, so no production row is read. A vm lift would have skipped the parse and the page's own wiring.
 * → feedback_the_harness_i_wrote_to_check_my_work_can_lie · feedback_an_absence_must_never_be_readable_as_a_value
 *
 * Exit 0 = the report reads true · 1 = it printed something false · 2 = could not tell.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const check = (ok, what, got) => {
  if (ok) console.log(`  ✅ ${what}`);
  else { console.log(`  🔴 ${what}${got !== undefined ? `\n       got: ${JSON.stringify(got).slice(0, 260)}` : ""}`); fails.push(what); }
};

// ── the report, in a browser, on fixtures ───────────────────────────────────────────────────────
let chromium;
try { ({ chromium } = await import("playwright")); } catch { console.log("⚠️  INDETERMINATE — playwright missing"); process.exit(2); }

let reportJs, reportCss, reportHtml;
try {
  reportJs = fs.readFileSync(`${SITE}/portal/report/report.js`, "utf8");
  reportCss = fs.readFileSync(`${SITE}/portal/report/report.css`, "utf8");
  reportHtml = fs.readFileSync(`${SITE}/portal/report/index.html`, "utf8");
} catch (e) { console.log(`⚠️  INDETERMINATE — cannot read the report: ${e.message}`); process.exit(2); }

// A stand-in for the Supabase client. It applies the filters the page really asks for, and an embedded row only carries the
// columns the page really selects: a field the query forgot comes back undefined, exactly as PostgREST would leave it.
const FAKE_SUPABASE = `
export function createClient() {
  const F = window.__FIX;
  const run = (st) => {
    let rows = (F[st.table] || []).slice();
    for (const f of st.filters) rows = rows.filter(f);
    if (st.order) rows.sort((a, b) => {
      const x = String(a[st.order.k]), y = String(b[st.order.k]);
      return (x < y ? -1 : x > y ? 1 : 0) * (st.order.asc ? 1 : -1);
    });
    if (st.lim != null) rows = rows.slice(0, st.lim);
    const embed = /client:clients\\s*\\(([^)]*)\\)/.exec(st.sel);
    if (embed) {
      const cols = embed[1].split(",").map((s) => s.trim());
      rows = rows.map((r) => ({ ...r, client: Object.fromEntries(cols.map((c) => [c, F.client[c]])) }));
    }
    return { data: st.single ? (rows[0] ?? null) : rows, error: null };
  };
  const q = (table) => {
    const st = { table, sel: "", filters: [], order: null, lim: null, single: false };
    const api = {
      select(s) { st.sel = s; return api; },
      eq(k, v) { st.filters.push((r) => r[k] === v); return api; },
      in(k, a) { st.filters.push((r) => a.includes(r[k])); return api; },
      gte(k, v) { st.filters.push((r) => new Date(r[k]) >= new Date(v)); return api; },
      lt(k, v) { st.filters.push((r) => new Date(r[k]) < new Date(v)); return api; },
      order(k, o) { st.order = { k, asc: !!(o && o.ascending) }; return api; },
      limit(n) { st.lim = n; return api; },
      maybeSingle() { st.single = true; return api; },
      then(res, rej) { return Promise.resolve(run(st)).then(res, rej); },
    };
    return api;
  };
  const user = { id: "u1", email: "t@example.com" };
  return {
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      getUser: async () => ({ data: { user } }),
    },
    from: q,
  };
}`;

const browser = await chromium.launch({ headless: true });
const CLIENT = { id: "c1", business_name: "Test Plumbing", website_url: "https://x.test", primary_service: "Plumber", primary_market: "Culver City, CA", account_manager: null, call_tracking_attributed: null };

/** Render the real page for one month and hand back what a reader sees. */
async function render({ months, grid = [], client = {}, open }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const fix = {
    client: { ...CLIENT, ...client },
    client_portal_access: [{ id: "a1", client_id: "c1", portal_email: "t@example.com", invite_status: "active" }],
    client_monthly_records: months.map((m) => ({ client_id: "c1", data: {}, ...m })),
    client_keyword_rankings: grid.map((g) => ({ client_id: "c1", ...g })),
  };
  await page.addInitScript((f) => { window.__FIX = f; }, fix);
  await page.route("**/*", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith("/report.js")) return route.fulfill({ contentType: "text/javascript", body: reportJs });
    if (p.endsWith("/report.css")) return route.fulfill({ contentType: "text/css", body: reportCss });
    if (p.startsWith("/vendor/supabase-js")) return route.fulfill({ contentType: "text/javascript", body: FAKE_SUPABASE });
    if (p.endsWith("/admin-config")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, supabaseUrl: "https://db.test", supabaseAnonKey: "anon" }) });
    if (p.startsWith("/portal/report/")) return route.fulfill({ contentType: "text/html", body: reportHtml });
    return route.abort();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`https://report.test/portal/report/${open}/`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const d = document.getElementById("reportDoc"), m = document.getElementById("reportMessage");
    return (d && !d.hidden) || (m && !m.hidden);
  }, null, { timeout: 15000 });
  const out = await page.evaluate(() => {
    const d = document.getElementById("reportDoc");
    const t = (s) => [...d.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, " ").trim());
    const kpi = {};
    for (const k of d.querySelectorAll(".kpi")) {
      // textContent: CSS uppercases the labels on screen, and innerText returns them uppercased
      kpi[k.querySelector(".kpi-lab").textContent.trim()] = {
        val: k.querySelector(".kpi-val").textContent.trim(), chip: k.querySelector(".kpi-foot").textContent.trim(),
      };
    }
    const links = {};
    for (const l of d.querySelectorAll(".link")) {
      links[l.querySelector(".link-lab").textContent.trim()] = {
        val: l.querySelector(".link-val").textContent.trim(), src: l.querySelector(".link-src").textContent.trim(),
      };
    }
    return {
      shown: !d.hidden,
      all: d.innerText,
      html: d.innerHTML,
      kpi, links,
      verdictFig: t(".verdict-fig")[0] ?? null,
      verdictTxt: t(".verdict-txt")[0] ?? null,
      verdictColor: d.querySelector(".verdict-fig") ? getComputedStyle(d.querySelector(".verdict-fig")).color : null,
      upColor: (() => { const c = document.createElement("div"); c.style.color = "var(--up)"; d.appendChild(c); const v = getComputedStyle(c).color; c.remove(); return v; })(),
      cells: t(".grid-map .cell"),
      metrics: t(".metric"),
    };
  });
  await ctx.close();
  if (errors.length) throw new Error(`the page threw: ${errors[0]}`);
  return out;
}

const SEP = "2026-09-01", AUG = "2026-08-01", OCT = "2026-10-01";

try {
  console.log("── the report, run in a browser on fixed inputs ──");

  // Probe: the harness itself has to reach the page. Anything else below would be reading nothing.
  const probe = await render({ open: "2026-09", months: [{ reporting_month: SEP, gsc_impressions: 100 }] });
  if (!probe.shown || !/Your funnel/.test(probe.all)) {
    console.log("⚠️  INDETERMINATE — the report did not render on the fixture; re-read the harness.");
    process.exit(2);
  }

  // ── leads ──
  const money = { lead_to_customer_rate: 50, avg_revenue_per_job: 1000 };
  let r = await render({ open: "2026-09", months: [{ reporting_month: SEP, form_leads: 3, gbp_calls: 20, total_leads: 23, ...money }] });
  check(r.links.Leads?.val === "3", "3 forms + 20 call-button taps = 3 leads, because a tap is not a lead", r.links);
  check(r.links["Pipeline value"]?.val === "$1,500", "pipeline value is built on those 3 leads, not on the taps", r.links["Pipeline value"]);
  check(/taps not counted/i.test(r.links.Leads?.src || ""), "the lead count says plainly that taps aren't in it", r.links.Leads);
  check(r.kpi["Form submissions"]?.val === "3", "the funnel tile is form submissions, 3, not the sum", Object.keys(r.kpi));
  check(r.kpi["Call-button taps on Google"]?.val === "20", "taps keep their own tile", r.kpi["Call-button taps on Google"]);
  check(!/enquir/i.test(r.all), "US spelling: the report never says enquiry", (r.all.match(/.{20}enquir.{20}/i) || [])[0]);

  // the same words on the page's other branch: the two numbers not given yet, and too few leads to forecast from
  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, form_leads: 1, gbp_calls: 20, total_leads: 21 }] });
  check(!/enquir/i.test(r.all) && /At 1 lead the sample/.test(r.all), "US spelling on the branch with no close rate and few leads too", (r.all.match(/.{20}enquir.{20}/i) || [])[0]);

  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, form_leads: 3, gbp_calls: 20, total_calls: 2, total_leads: 23, ...money }], client: { call_tracking_attributed: true } });
  check(r.links.Leads?.val === "5" && r.links["Pipeline value"]?.val === "$2,500", "3 forms + 2 tracked calls = 5 leads", r.links);

  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, form_leads: 3, gbp_calls: 20, total_calls: 40, total_leads: 23, ...money }], client: { call_tracking_attributed: false } });
  check(r.links.Leads?.val === "3", "a whole phone line's calls are not leads, for a CLIENT reading the report too (the query must ask for the flag)", r.links.Leads);
  check(!!r.kpi["Calls to your line"], "and the tile names it the line, not tracked calls", Object.keys(r.kpi));

  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, form_leads: null, gbp_calls: 20, total_leads: 20, ...money }] });
  check(!r.links.Leads, "no forms measured and no tracked calls = no lead count, and no pipeline built on taps", r.links);
  check(r.kpi["Form submissions"]?.val === "Not yet measured", "an unmeasured form count says so, never 0", r.kpi["Form submissions"]);

  // ── headline ──
  const head = async (cur, prior) => render({
    open: "2026-09",
    months: [{ reporting_month: SEP, ...cur }, ...(prior ? [{ reporting_month: AUG, ...prior }] : [])],
  });
  const RIGHT = /right direction/i;

  r = await head({ gsc_impressions: 2000, gsc_clicks: 100 }, { gsc_impressions: 1000, gsc_clicks: 400 });
  check(!RIGHT.test(r.all) && /fell from 400 to 100/.test(r.verdictTxt), "impressions up, clicks fell: says clicks fell, with the numbers", r.verdictTxt);

  r = await head({ gsc_impressions: 2000, gsc_clicks: null }, { gsc_impressions: 1000, gsc_clicks: 400 });
  check(!RIGHT.test(r.all) && /weren't measured/.test(r.verdictTxt), "impressions up, clicks not measured: says so", r.verdictTxt);

  r = await head({ gsc_impressions: 2000, gsc_clicks: 100 }, { gsc_impressions: 1000, gsc_clicks: 50 });
  check(RIGHT.test(r.verdictTxt || "") && r.verdictFig === "+100%", "both up: the good line is earned, and a large base keeps its percent", [r.verdictFig, r.verdictTxt]);

  r = await head({ gsc_impressions: 2000, gsc_clicks: 100 }, { gsc_impressions: 1000, gsc_clicks: 100 });
  check(!RIGHT.test(r.all) && /held at 100/.test(r.verdictTxt), "impressions up, clicks flat: says they held", r.verdictTxt);

  r = await head({ gsc_impressions: 2000, gsc_clicks: 100 }, { gsc_impressions: 1000 });
  check(!RIGHT.test(r.all) && /no earlier month/.test(r.verdictTxt), "impressions up, no earlier clicks: claims no direction", r.verdictTxt);

  r = await head({ gsc_impressions: 2000, gsc_clicks: 5 }, { gsc_impressions: 1000, gsc_clicks: 3 });
  check(/Almost nobody is clicking yet/.test(r.verdictTxt) && !/far more/.test(r.verdictTxt), "few clicks ever: the plain 'almost nobody yet' line, without 'far more'", r.verdictTxt);

  r = await head({ gsc_impressions: 2000, gsc_clicks: 5 }, { gsc_impressions: 1000, gsc_clicks: 400 });
  check(!/nobody is clicking yet/.test(r.verdictTxt) && /fell from 400 to 5/.test(r.verdictTxt), "a collapse to few clicks is a fall, not 'yet'", r.verdictTxt);

  r = await head({ gsc_impressions: 800, gsc_clicks: 100 }, { gsc_impressions: 1000, gsc_clicks: 120 });
  check(!!r.verdictTxt && /down from 1,000/.test(r.verdictTxt) && r.verdictFig === "−20%", "a down month gets a headline with the real fall", [r.verdictFig, r.verdictTxt]);
  check(!RIGHT.test(r.all) && /fell from 120 to 100/.test(r.verdictTxt), "and it doesn't call that the right direction", r.verdictTxt);
  check(r.verdictColor && r.verdictColor !== r.upColor, "and the fall isn't painted in the 'up' color", r.verdictColor);

  r = await head({ gsc_impressions: 1000, gsc_clicks: 100 }, { gsc_impressions: 1000, gsc_clicks: 100 });
  check(!!r.verdictTxt && /same as/.test(r.verdictTxt) && !RIGHT.test(r.all), "a flat month gets a headline that says flat", r.verdictTxt);

  r = await head({ gsc_impressions: 40, gsc_clicks: 2 }, { gsc_impressions: 20, gsc_clicks: 1 });
  check(r.verdictFig === "+20", "a small base prints the count, not +100%", r.verdictFig);

  r = await head({ gsc_impressions: 500, gsc_clicks: 20 }, { gsc_impressions: null });
  check(!/first full month/i.test(r.all) && /wasn't measured/.test(r.verdictTxt), "an earlier month with no reading isn't called the first month", r.verdictTxt);

  r = await head({ gsc_impressions: 500, gsc_clicks: 20 }, null);
  check(/first full month/i.test(r.verdictTxt), "a true first month still says so", r.verdictTxt);

  r = await head({ gsc_impressions: null, gsc_clicks: 20 }, { gsc_impressions: 1000, gsc_clicks: 50 });
  check(r.verdictTxt === null, "no impressions measured: no headline, rather than one built on nothing", r.verdictTxt);

  // ── change chips ──
  r = await render({ open: "2026-09", client: { call_tracking_attributed: true }, months: [
    { reporting_month: SEP, total_calls: 2, gsc_impressions: 150, gsc_clicks: 20, form_leads: 3, gbp_calls: 30 },
    { reporting_month: AUG, total_calls: 1, gsc_impressions: 100, gsc_clicks: 40, form_leads: 0, gbp_calls: 29 },
  ] });
  check(r.kpi["Tracked calls"]?.chip === "↑ 1", "1 call to 2 reads ↑ 1, never ↑ 100%", r.kpi["Tracked calls"]);
  check(r.kpi["Seen in search"]?.chip === "↑ 50%", "100 to 150 keeps its percent", r.kpi["Seen in search"]);
  check(r.kpi["Clicked through"]?.chip === "↓ 50%", "40 to 20 keeps its percent, because the base is 30 or more", r.kpi["Clicked through"]);
  check(r.kpi["Form submissions"]?.chip === "↑ 3", "0 to 3 reads ↑ 3", r.kpi["Form submissions"]);
  check(r.kpi["Call-button taps on Google"]?.chip === "↑ 1", "29 to 30 reads ↑ 1, because the base is under 30", r.kpi["Call-button taps on Google"]);

  // ── hardcoded review target ──
  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, review_count: 2, new_reviews: 0, average_rating: 5 }] });
  check(/The one gap that matters most/.test(r.all), "the review gap section still shows for a business with few reviews", null);
  check(!/15.25/.test(r.all), "no typed-in review target, in the channel row or the gap section", (r.all.match(/.{30}15.25.{30}/) || [])[0]);
  check(!/90-day target/.test(r.all), "the row that carried it is gone", r.metrics);
  check(/Total reviews\s*2/.test(r.metrics.join(" | ")), "the measured review numbers are still there", r.metrics);

  // ── the map belongs to the month ──
  const cells = (session, at, rank) => Array.from({ length: 9 }, (_, i) => ({
    grid_index: i, map_rank: rank, keyword: "plumber", measured_at: at, grid_session_id: session,
  }));
  const grid = [...cells("oct", "2026-10-15T12:00:00Z", 3), ...cells("aug", "2026-08-15T12:00:00Z", 15)];
  const months = [{ reporting_month: OCT }, { reporting_month: SEP }, { reporting_month: AUG }];
  r = await render({ open: "2026-08", months, grid });
  check(r.cells.length === 9 && r.cells.every((c) => c === "15"), "the August report draws August's map", r.cells);
  r = await render({ open: "2026-09", months, grid });
  check(r.cells.length === 0, "a month with no scan draws no map, rather than a later one", r.cells);
  r = await render({ open: "2026-10", months, grid });
  check(r.cells.length === 9 && r.cells.every((c) => c === "3"), "the newest report draws its own map", r.cells);
  // the month's edges are UTC, the same clock the scan and the monthly record use
  r = await render({ open: "2026-10", months, grid: cells("edge", "2026-11-01T00:00:00Z", 7) });
  check(r.cells.length === 0, "a scan on the 1st at 00:00 UTC belongs to the next month", r.cells);
  r = await render({ open: "2026-10", months, grid: cells("edge", "2026-10-01T00:00:00Z", 7) });
  check(r.cells.length === 9, "a scan on the 1st at 00:00 UTC belongs to its own month", r.cells);
  r = await render({ open: "2026-12", months: [{ reporting_month: "2026-12-01" }], grid: cells("dec", "2026-12-31T23:59:59Z", 7) });
  check(r.cells.length === 9, "December's month ends in the next year, not in month 13", r.cells);

  // ── the four sentences the report could not back up (report_and_measurement_v1) ──
  // Not hidden behind a condition: the producers are deleted, so the phrases are banned in the SOURCE (comments included) and
  // absent from every rendered state: a rich month, a first month, a down month, the few-reviews gap, and no reviews at all.
  const BANNED = [/we send the requests/i, /strongest single lever/i, /Google showed your business/i, /Widen the map/i, /into the top ten/i, /Calls and leads lift/i, /Success looks like rising/i, /Into the Map Pack/i];  // the last four: the plan timeline promised positions and dates (contract Section 6)
  const sees = (txt) => BANNED.filter((re) => re.test(txt)).map(String);
  check(sees(reportJs).length === 0, "report.js (code and comments) holds none of the four banned phrases", sees(reportJs));
  const cluster = (inner, outer) => Array.from({ length: 25 }, (_, i) => {
    const row = Math.floor(i / 5), col = i % 5, mid = Math.max(Math.abs(row - 2), Math.abs(col - 2)) <= 1;
    return { grid_index: i, map_rank: mid ? inner : outer, keyword: "plumber", measured_at: "2026-10-15T12:00:00Z", grid_session_id: "s" };
  });
  const octMonths = [{ reporting_month: OCT, gsc_impressions: 500, gsc_clicks: 5, review_count: 0 }, { reporting_month: SEP, gsc_impressions: 900, gsc_clicks: 40 }];
  const NEARBY = /Pages for nearby areas are the next step to test/;
  for (const [label, rr] of [
    ["a down month with no reviews", await render({ open: "2026-10", months: octMonths })],
    ["a first month", await render({ open: "2026-10", months: [{ reporting_month: OCT, gsc_impressions: 500, review_count: 2 }] })],
    ["a rich month", await render({ open: "2026-10", months: [{ reporting_month: OCT, gsc_impressions: 5000, gsc_clicks: 300, review_count: 3 }, { reporting_month: SEP, gsc_impressions: 1000, gsc_clicks: 100 }], grid: cluster(3, null) })],
  ]) check(sees(rr.all).length === 0, `${label}: none of the four banned phrases is printed`, sees(rr.all));
  r = await render({ open: "2026-10", months: octMonths });
  check(/appeared in Google search results 500 times/.test(r.all) && /Google's count of appearances, not people/.test(r.all), "the visibility line says it is Google's count, not people", r.verdictTxt);
  check(/We write each request\. You send it from your own phone in one tap/.test(r.all), "the review step says the client sends the request", null);
  check(!NEARBY.test(r.all), "no grid, no 'nearby areas' step", null);
  r = await render({ open: "2026-10", months: octMonths, grid: cluster(3, null) });
  check(NEARBY.test(r.all), "found points clustered around the address, none far out: the nearby-areas step is printed", null);
  r = await render({ open: "2026-10", months: octMonths, grid: cluster(3, 8) });
  check(!NEARBY.test(r.all), "found everywhere: no nearby-areas step", null);
  r = await render({ open: "2026-10", months: octMonths, grid: cluster(null, null) });
  check(!NEARBY.test(r.all), "found nowhere: no nearby-areas step", null);

  // ── the month in one line, the year-ago first comparison, and the plain reading notes (report_and_measurement_v1) ──
  const lineOf = (rr) => (/Your month in one line\s*(.*?)\s*Your funnel/s.exec(rr.all) || [])[1] || null;
  const SEP25 = "2025-09-01";
  r = await render({ open: "2026-09", client: { call_tracking_attributed: true }, months: [{ reporting_month: SEP, form_leads: 4, total_calls: 12 }] });
  check(/You had 12 tracked calls and 4 form submissions\. No year-ago number yet, so season is not ruled out\./.test(lineOf(r) || ""), "no year-ago month: the line says season is not ruled out", lineOf(r));
  r = await render({ open: "2026-09", client: { call_tracking_attributed: true }, months: [{ reporting_month: SEP, form_leads: 4, total_calls: 12 }, { reporting_month: SEP25, form_leads: 5, total_calls: 12 }] });
  check(/About the same as September 2025 \(17\)/.test(lineOf(r) || ""), "a year-ago month that is close reads about the same", lineOf(r));
  r = await render({ open: "2026-09", client: { call_tracking_attributed: true }, months: [{ reporting_month: SEP, form_leads: 4, total_calls: 30 }, { reporting_month: SEP25, form_leads: 5, total_calls: 12 }] });
  check(/Up from 17 in September 2025/.test(lineOf(r) || "") && !/caus|because|thanks to/i.test(lineOf(r) || ""), "a clear rise says up, and never says why", lineOf(r));
  r = await render({ open: "2026-09", client: { call_tracking_attributed: true }, months: [{ reporting_month: SEP, form_leads: 4, total_calls: 3 }, { reporting_month: SEP25, form_leads: 2, total_calls: 1 }] });
  check(/too few to call/i.test(lineOf(r) || ""), "single digits are too few to call", lineOf(r));
  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, form_leads: 4, total_calls: null }, { reporting_month: SEP25, form_leads: 9, total_calls: 6 }] });
  check(/You had 4 form submissions\. No year-ago number yet/.test(lineOf(r) || "") && !/tracked call/.test(lineOf(r) || ""), "calls never recorded: left out of the line, never 0, and not compared with a year that had calls", lineOf(r));
  r = await render({ open: "2026-09", months: [{ reporting_month: SEP, gbp_calls: 18, gsc_impressions: 100 }] });
  check(lineOf(r) === null && /Call-button taps: 18\. Taps aren't calls\./.test(r.all), "no tracking and no forms: no month line, and the taps are named as taps", lineOf(r));
  check(/How to read this/.test(r.all) && /not a phone call/.test(r.all), "the reading notes are on the page", null);
} catch (e) {
  console.log(`⚠️  INDETERMINATE — ${e.message}`);
  await browser.close();
  process.exit(2);
}
await browser.close();

// ── _metrics.js, on fixed Google responses ───────────────────────────────────────────────────────
console.log("── the metrics pull, on fixed Google responses ──");
const series = (metric, values) => ({ dailyMetric: metric, timeSeries: { datedValues: values.map((v) => (v == null ? { date: {} } : { date: {}, value: String(v) })) } });
const ALL = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"];
const perfBody = (list) => ({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: list }] });
let handler = async () => { throw new Error("no fixture"); };
globalThis.fetch = (...a) => handler(...a);
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

let metrics;
try {
  const require = createRequire(import.meta.url);
  metrics = require(`${SITE}/netlify/functions/_metrics.js`);
} catch (e) { console.log(`⚠️  INDETERMINATE — cannot load _metrics.js: ${e.message}`); process.exit(2); }

try {
  const pull = async (list) => {
    handler = async () => reply(200, perfBody(list));
    const errors = {};
    const out = await metrics.pullGBP("t", "locations/1", null, errors);
    return { out, errors };
  };
  // Google leaves `value` off a zero day, so a series that came back with no values really is zero.
  let { out, errors } = await pull(ALL.map((m) => series(m, [null, null])));
  check(out.calls === 0 && out.views === 0, "a series that came back empty is a real zero", out);

  ({ out, errors } = await pull(ALL.filter((m) => m !== "CALL_CLICKS").map((m) => series(m, [2]))));
  check(out.calls === null, "no CALL_CLICKS series at all: calls is unknown, not 0", out.calls);
  check(out.websiteClicks === 2 && out.directions === 2, "the metrics that did come back still count", out);
  check(/CALL_CLICKS/.test(errors.gbp_missing || ""), "and the missing series is named, so a silent gap can be found", errors);

  ({ out } = await pull(ALL.filter((m) => m !== "WEBSITE_CLICKS" && m !== "BUSINESS_DIRECTION_REQUESTS").map((m) => series(m, [1]))));
  check(out.websiteClicks === null && out.directions === null, "the same for website clicks and directions", out);

  ({ out } = await pull(ALL.filter((m) => m !== "BUSINESS_IMPRESSIONS_MOBILE_MAPS").map((m) => series(m, [5]))));
  check(out.views === null, "views adds four surfaces: with one missing the total is unknown, not an undercount", out.views);

  // total_leads, through the real save path
  const save = async ({ existing = null, clientFlag, gbpCalls = 20, forms = 3 }) => {
    const writes = [];
    handler = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com")) return reply(200, { access_token: "t", expires_in: 3600 });
      if (u.includes("analyticsdata")) {
        const body = JSON.parse(opts.body);
        if (body.dimensions?.[0]?.name === "eventName") return reply(200, { rows: [{ dimensionValues: [{ value: "form_submit" }], metricValues: [{ value: String(forms) }] }] });
        return reply(200, { rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: ["10", "9", "1", "12"].map((value) => ({ value })) }] });
      }
      if (u.includes("businessprofileperformance")) return reply(200, perfBody(ALL.map((m) => series(m, [m === "CALL_CLICKS" ? gbpCalls : 1]))));
      if (u.includes("/rest/v1/client_monthly_records") && (!opts.method || opts.method === "GET")) {
        // only the columns the code asked for, as PostgREST would answer
        const cols = (/select=([^&]*)/.exec(u) || [])[1]?.split(",") || [];
        return reply(200, existing ? [Object.fromEntries(Object.entries(existing).filter(([k]) => cols.includes(k)))] : []);
      }
      if (u.includes("/rest/v1/clients")) return clientFlag === "fail" ? reply(500, {}) : reply(200, [{ call_tracking_attributed: clientFlag ?? null }]);
      if (u.includes("/rest/v1/client_state_snapshots")) return reply(200, []);
      if (u.includes("/rest/v1/client_monthly_records")) { writes.push(JSON.parse(opts.body)); return reply(200, []); }
      throw new Error(`unexpected request: ${u}`);
    };
    const res = await metrics.refreshAndSaveMetrics("https://db.test", "k", "c1", { refresh_token: "r", ga4_property_id: "properties/1", gbp_location_id: "locations/1" });
    return { res, patch: writes[0] };
  };
  let s = await save({});
  check(s.res.ok && s.patch?.total_leads === 3 && s.patch?.gbp_calls === 20, "a new month: total_leads is 3 forms, the 20 taps stay in gbp_calls", s.patch);

  s = await save({ existing: { id: "m1", data: { gbp: { calls: 50 } } } });
  check(s.patch?.total_leads === 3, "an existing month: last refresh's taps don't leak back in", s.patch?.total_leads);

  s = await save({ existing: { id: "m1", data: {}, total_calls: 2 }, clientFlag: true });
  check(s.patch?.total_leads === 5, "tracked calls do count: 3 forms + 2 tracked calls = 5", s.patch?.total_leads);

  s = await save({ existing: { id: "m1", data: {}, total_calls: 40 }, clientFlag: false });
  check(s.patch?.total_leads === 3, "a whole phone line's calls don't", s.patch?.total_leads);

  s = await save({ existing: { id: "m1", data: {}, total_calls: 40 }, clientFlag: "fail" });
  check(s.patch?.total_leads === 3, "and if we can't read what kind of number it is, they don't either", s.patch?.total_leads);

  // ── a month's form count is that month's, and a zero has to be earned (report_and_measurement_v1) ──
  // sess = rows the 28-day session query answers; wide = rows a 12-month session query would answer (it must never be asked
  // for the count); events = [name, count] per window.
  const ga4Save = async ({ sess28, wide = 0, ev28 = [], ev365 = [], existing = null }) => {
    const writes = [], asked = [];
    const rowsOf = (n) => (n ? [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [String(n), "1", "0", String(n)].map((value) => ({ value })) }] : []);
    handler = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com")) return reply(200, { access_token: "t", expires_in: 3600 });
      if (u.includes("analyticsdata")) {
        const body = JSON.parse(opts.body), start = body.dateRanges[0].startDate;
        asked.push([body.dimensions?.[0]?.name, start]);
        if (body.dimensions?.[0]?.name === "eventName") {
          const list = start === "365daysAgo" ? ev365 : ev28;
          return reply(200, { rows: list.map(([n, c]) => ({ dimensionValues: [{ value: n }], metricValues: [{ value: String(c) }] })) });
        }
        return reply(200, { rows: rowsOf(start === "365daysAgo" ? wide : sess28) });
      }
      if (u.includes("businessprofileperformance")) return reply(200, perfBody(ALL.map((m) => series(m, [1]))));
      if (u.includes("/rest/v1/client_monthly_records") && (!opts.method || opts.method === "GET")) {
        const cols = (/select=([^&]*)/.exec(u) || [])[1]?.split(",") || [];
        return reply(200, existing ? [Object.fromEntries(Object.entries(existing).filter(([k]) => cols.includes(k)))] : []);
      }
      if (u.includes("/rest/v1/clients")) return reply(200, [{ call_tracking_attributed: null }]);
      if (u.includes("/rest/v1/client_state_snapshots")) return reply(200, []);
      if (u.includes("/rest/v1/client_monthly_records")) { writes.push(JSON.parse(opts.body)); return reply(200, []); }
      throw new Error(`unexpected request: ${u}`);
    };
    const res = await metrics.refreshAndSaveMetrics("https://db.test", "k", "c1", { refresh_token: "r", ga4_property_id: "properties/1", gbp_location_id: "locations/1" });
    return { res, patch: writes[0], asked };
  };
  s = await ga4Save({ sess28: 0, wide: 400, ev28: [], ev365: [["form_submit", 30]] });
  check(s.res.ok && !("form_leads" in s.patch) && !("organic_sessions" in s.patch), "a quiet 28 days is never filled from 12 months: no form count and no organic sessions are saved", s.patch);
  check(!s.asked.some(([dim, start]) => dim !== "eventName" && start === "365daysAgo") && s.patch?.data?.ga4?.window !== "12mo", "the session pull never widens to 12 months", s.asked);
  s = await ga4Save({ sess28: 10, ev28: [], ev365: [] });
  check(s.res.ok && !("form_leads" in s.patch), "traffic but no form event ever seen: tracking not confirmed, not 0 forms", s.patch?.form_leads);
  s = await ga4Save({ sess28: 10, ev28: [["form_start", 4]], ev365: [["form_start", 9]] });
  check(s.res.ok && s.patch?.form_leads === 0, "traffic and a form event seen working, none submitted: 0 forms is a real zero", s.patch?.form_leads);
  s = await ga4Save({ sess28: 10, ev28: [["form_submit", 3]], ev365: [] });
  check(s.res.ok && s.patch?.form_leads === 3, "forms counted in the 28 days are saved as they are", s.patch?.form_leads);
  s = await ga4Save({ sess28: 0, ev365: [["form_submit", 30]], existing: { id: "m1", data: { ga4: { window: "12mo" } } } });
  check(s.patch && s.patch.form_leads === null, "a 12-month total an older version saved as this month's count is cleared when the month is unknown", s.patch);

  // ── the portal tile reads leads the way the report does (report_and_measurement_v1) ──
  const portalJs = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8");
  check(!/Calls \+ form fills \+ booking requests/.test(portalJs), "portal.js no longer says the lead tile counts booking requests or search", null);
  check(!/\.total_leads\b/.test(portalJs.replace(/\/\/.*$/gm, "")) , "portal.js never reads the stored total_leads (rows before 10-31 hold Google taps)", (portalJs.match(/.{30}\.total_leads.{20}/) || [])[0]);
  const fnSrc = (/function portalMonthLeads\(rec, client\) \{[\s\S]*?\n\}\n/.exec(portalJs) || [])[0];
  check(!!fnSrc, "portal.js has portalMonthLeads", null);
  if (fnSrc) {
    // A lift of ONE pure function (the tile itself is looked at in a real browser); a harness can lie, so the source scan above stays.
    const leads = new Function(`${fnSrc}; return portalMonthLeads;`)();
    check(leads({ form_leads: 3, total_calls: 2, total_leads: 23 }, {}) === 5, "an old row (3 forms, 2 tracked calls, total_leads 23 with taps) reads 5", leads({ form_leads: 3, total_calls: 2, total_leads: 23 }, {}));
    check(leads({ form_leads: 3, total_calls: null, total_leads: 23 }, { call_tracking_attributed: true }) === null, "calls never recorded: not available, never 3 and never 23", null);
    check(leads({ form_leads: null, total_calls: 4 }, {}) === null, "forms never recorded: not available", null);
    check(leads({ form_leads: 3, total_calls: 40 }, { call_tracking_attributed: false }) === 3, "a plain phone line's calls are not leads", null);
    check(leads({ form_leads: 0, total_calls: 0 }, {}) === 0, "a recorded 0 and 0 is 0", null);
    check(leads(null, {}) === null && leads({}, {}) === null, "no row, no number", null);
  }
} catch (e) {
  console.log(`⚠️  INDETERMINATE — the metrics harness threw: ${e.message}`);
  process.exit(2);
}

console.log("");
if (fails.length) {
  console.error(`🔴 the monthly report printed ${fails.length} thing(s) its inputs don't support.`);
  process.exit(1);
}
console.log("✅ the monthly report's numbers and sentences match their inputs.");
process.exit(0);
