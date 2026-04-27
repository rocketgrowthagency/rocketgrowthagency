#!/usr/bin/env node
// grid-scan.mjs — DIY 9x9 Local Falcon-style grid rank scanner.
// For one client + one keyword, scans an 81-point lat/lng grid centered on the client's GBP location
// and records the client's Maps rank at each point. Computes avg grid rank + top-3 coverage %.
//
// Usage:
//   node grid-scan.mjs --client=<uuid> --keyword="<text>" [--radius=5] [--zoom=14] [--per-point-delay=45]
//
// Resumable: if you Ctrl-C mid-scan, re-running with same --client/--keyword/--session=<uuid> resumes.
// Default: starts a new session.
//
// SAFETY: hardcoded RGA project. Same rate-limit awareness as track-rankings.mjs.

import "dotenv/config";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import crypto from "node:crypto";

puppeteer.use(StealthPlugin());

const RGA_PROJECT_REF = "jetgayimvfeslqnkbfdq";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const argFlag = (name) => args.includes(`--${name}`);

const CLIENT_ID = argVal("client");
const KEYWORD = argVal("keyword");
const RADIUS_KM = Number(argVal("radius", "5"));
const ZOOM = Number(argVal("zoom", "14"));
const PER_POINT_DELAY = Number(argVal("per-point-delay", "45"));   // seconds
const SESSION_ID = argVal("session", crypto.randomUUID());
const DRY = argFlag("dry-run");

if (!CLIENT_ID || !KEYWORD) {
  console.error("Usage: node grid-scan.mjs --client=<uuid> --keyword=\"<text>\" [--radius=5] [--zoom=14] [--per-point-delay=45]");
  process.exit(1);
}

async function pgQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${RGA_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PG: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const sqlStr = (v) => v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const sqlNum = (v) => v == null ? "null" : String(v);

// 1. Load client + parse center lat/lng from gbp_url
const [client] = await pgQuery(`select id, business_name, gbp_url, primary_market from public.clients where id = ${sqlStr(CLIENT_ID)}`);
if (!client) { console.error(`Client ${CLIENT_ID} not found`); process.exit(1); }

function parseLatLngFromGbpUrl(url) {
  if (!url) return null;
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
}

function placeKeyFromUrl(url) {
  const m = String(url || "").match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m ? m[1].toLowerCase() : null;
}

const center = parseLatLngFromGbpUrl(client.gbp_url);
if (!center) {
  console.error(`Could not parse lat/lng from client.gbp_url: ${client.gbp_url}`);
  console.error(`Add @lat,lng to the GBP URL or set client.gbp_url to a Google Maps URL with coordinates.`);
  process.exit(1);
}
const targetPlaceKey = placeKeyFromUrl(client.gbp_url);
if (!targetPlaceKey) {
  console.error(`Could not extract Place ID from client.gbp_url: ${client.gbp_url}`);
  process.exit(1);
}

console.log(`[grid] Client: ${client.business_name}`);
console.log(`[grid] Center: ${center.lat}, ${center.lng}  Place: ${targetPlaceKey}`);
console.log(`[grid] Keyword: "${KEYWORD}"  Radius: ${RADIUS_KM}km  Zoom: ${ZOOM}`);
console.log(`[grid] Session: ${SESSION_ID}  Per-point delay: ${PER_POINT_DELAY}s`);

// 2. Generate 9x9 grid points centered on (lat, lng) with given radius
//    Step size = (2 * radius) / 8  (so the grid spans 2*radius in each dim)
const earthLat = 111.0;                                       // km per degree latitude
const earthLng = 111.0 * Math.cos(center.lat * Math.PI / 180); // km per degree longitude
const step = (2 * RADIUS_KM) / 8;                             // km between adjacent grid points
const latStep = step / earthLat;
const lngStep = step / earthLng;

const grid = [];
let idx = 0;
for (let i = -4; i <= 4; i++) {
  for (let j = -4; j <= 4; j++) {
    grid.push({
      index: idx++,
      lat: +(center.lat + i * latStep).toFixed(6),
      lng: +(center.lng + j * lngStep).toFixed(6),
      row: i + 4,
      col: j + 4,
    });
  }
}

// 3. Resume support — find points already scanned in this session
const existing = await pgQuery(`
  select grid_index from public.client_keyword_rankings
  where client_id = ${sqlStr(CLIENT_ID)}
    and keyword = ${sqlStr(KEYWORD)}
    and grid_session_id = ${sqlStr(SESSION_ID)}
`);
const completed = new Set(existing.map((r) => r.grid_index));
const todo = grid.filter((g) => !completed.has(g.index));
console.log(`[grid] ${completed.size} of 81 already done. ${todo.length} to scan.`);

if (DRY) { console.log("[DRY] exiting before browser launch"); process.exit(0); }
if (todo.length === 0) {
  console.log("[grid] All 81 points already scanned. Computing summary...");
} else {
  // 4. Launch puppeteer + scan each remaining point
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--no-first-run", "--no-default-browser-check",
    ],
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let processed = 0;
  let errored = 0;

  try {
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    for (const point of todo) {
      const url = `https://www.google.com/maps/search/${encodeURIComponent(KEYWORD)}/@${point.lat},${point.lng},${ZOOM}z`;
      console.log(`\n[grid] ▶ point ${point.index + 1}/81 (row ${point.row}, col ${point.col}) → ${point.lat}, ${point.lng}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 30000 });
        // Scroll to load up to ~50 results
        await page.evaluate(async () => {
          const feed = document.querySelector('div[role="feed"]');
          if (!feed) return;
          for (let i = 0; i < 20; i++) {
            feed.scrollTop = feed.scrollHeight;
            await new Promise((r) => setTimeout(r, 600));
          }
        });
        const places = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
          const seen = new Set(); const out = [];
          for (const a of anchors) {
            const href = a.getAttribute("href") || "";
            const m = href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
            const key = m ? m[1].toLowerCase() : href;
            if (seen.has(key)) continue;
            seen.add(key); out.push({ key });
          }
          return out;
        });
        const rankIdx = places.findIndex((p) => p.key === targetPlaceKey);
        const rank = rankIdx >= 0 ? rankIdx + 1 : null;
        console.log(`[grid] ✓ rank ${rank == null ? `not in top ${places.length}` : `#${rank}`} (of ${places.length} visible)`);

        await pgQuery(`
          insert into public.client_keyword_rankings
            (client_id, keyword, market, map_rank, source, grid_lat, grid_lng, grid_index, grid_session_id, grid_zoom)
          values (
            ${sqlStr(CLIENT_ID)}, ${sqlStr(KEYWORD)}, ${sqlStr(client.primary_market)},
            ${sqlNum(rank)}, 'grid_scan',
            ${sqlNum(point.lat)}, ${sqlNum(point.lng)}, ${point.index},
            ${sqlStr(SESSION_ID)}, ${ZOOM}
          )
        `);
        processed++;
      } catch (err) {
        console.error(`[grid] ✗ point ${point.index} failed: ${err.message}`);
        errored++;
      }

      // Pacing — random jitter 30-60s default
      if (point !== todo[todo.length - 1]) {
        const wait = PER_POINT_DELAY + Math.floor(Math.random() * Math.max(1, PER_POINT_DELAY));
        console.log(`[grid] sleeping ${wait}s before next point...`);
        await sleep(wait * 1000);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`\n[grid] scan complete. ${processed} new, ${errored} failed, ${completed.size} pre-existing.`);
}

// 5. Compute summary
const allPoints = await pgQuery(`
  select grid_index, grid_lat, grid_lng, map_rank
  from public.client_keyword_rankings
  where client_id = ${sqlStr(CLIENT_ID)}
    and keyword = ${sqlStr(KEYWORD)}
    and grid_session_id = ${sqlStr(SESSION_ID)}
  order by grid_index
`);

const ranks = allPoints.map((r) => r.map_rank).filter((r) => r != null);
const avg = ranks.length ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1) : null;
const top3 = allPoints.filter((r) => r.map_rank != null && r.map_rank <= 3).length;
const top10 = allPoints.filter((r) => r.map_rank != null && r.map_rank <= 10).length;
const notFound = allPoints.filter((r) => r.map_rank == null).length;

console.log(`\n[grid] === SCAN RESULTS ===`);
console.log(`[grid] Session: ${SESSION_ID}`);
console.log(`[grid] Client: ${client.business_name}`);
console.log(`[grid] Keyword: "${KEYWORD}"`);
console.log(`[grid] Average rank (where ranked): ${avg ?? 'n/a'}`);
console.log(`[grid] Top-3 coverage: ${top3}/81 (${((top3/81)*100).toFixed(1)}%)`);
console.log(`[grid] Top-10 coverage: ${top10}/81 (${((top10/81)*100).toFixed(1)}%)`);
console.log(`[grid] Not found: ${notFound}/81`);

// 6. ASCII heatmap (9x9 grid)
console.log(`\n[grid] Heatmap (1=top, .=20+, X=not found):`);
const cells = Array(9).fill(null).map(() => Array(9).fill("?"));
allPoints.forEach((r) => {
  const row = Math.floor(r.grid_index / 9);
  const col = r.grid_index % 9;
  if (r.map_rank == null) cells[row][col] = "X";
  else if (r.map_rank <= 3) cells[row][col] = String(r.map_rank);
  else if (r.map_rank <= 9) cells[row][col] = String(r.map_rank);
  else if (r.map_rank <= 19) cells[row][col] = "+";
  else cells[row][col] = ".";
});
cells.forEach((row) => console.log(`  ${row.join(" ")}`));
console.log(`\n[grid] Center (4,4) is the business location. Each cell = ${(2*RADIUS_KM/8).toFixed(2)}km step.`);
