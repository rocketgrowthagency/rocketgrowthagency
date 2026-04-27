#!/usr/bin/env node
// Track keyword Maps rank for all RGA clients. For each client, for each
// tracked keyword, hit Google Maps and find the client's business in the
// results, then insert a new row into client_keyword_rankings.
//
// SAFETY: hardcoded to RGA Supabase project ref.
// RATE LIMITS: per feedback_scraper_rate_limit.md
//   - 5-15 sec between place evaluations within a search
//   - 5-10 min between searches
//   - 5 keywords/day max default
//
// Usage:
//   node track-rankings.mjs                 # run all stale (>7 days) keywords up to MAX_PER_RUN
//   node track-rankings.mjs --max-runs=3    # only do 3 keyword searches this run
//   node track-rankings.mjs --client=<id>   # only one client
//   node track-rankings.mjs --dry-run

import "dotenv/config";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const RGA_PROJECT_REF = "jetgayimvfeslqnkbfdq";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("Missing SUPABASE_ACCESS_TOKEN"); process.exit(1); }

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry-run");
const MAX_PER_RUN = Number((ARGS.find((a) => a.startsWith("--max-runs="))?.slice(11)) || 5);
const FILTER_CLIENT = ARGS.find((a) => a.startsWith("--client="))?.slice(9);
const STALE_DAYS = 7;

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

function sqlStr(v) { return v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`; }

// Extract canonical Place ID (0x...:0x... CID pair) from a Google Maps URL
function placeKeyFromUrl(url) {
  const s = String(url || "");
  const m = s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// 1. Pull stale keyword tracking targets (or specific client)
const since = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
const filter = FILTER_CLIENT
  ? `where c.id = '${FILTER_CLIENT}'`
  : `where ckr.measured_at is null or ckr.measured_at < '${since}'`;

const sql = `
  with latest as (
    select client_id, keyword, max(measured_at) as last_measured
    from public.client_keyword_rankings
    group by client_id, keyword
  )
  select c.id as client_id, c.business_name, c.gbp_url, c.primary_market,
         ckr.keyword, latest.last_measured
  from public.clients c
  join public.client_keyword_rankings ckr on ckr.client_id = c.id
  left join latest on latest.client_id = c.id and latest.keyword = ckr.keyword
  ${filter}
  group by c.id, c.business_name, c.gbp_url, c.primary_market, ckr.keyword, latest.last_measured
  order by latest.last_measured asc nulls first
  limit ${MAX_PER_RUN}
`;
console.log(`[track] querying targets (max ${MAX_PER_RUN}, stale > ${STALE_DAYS}d)...`);
const targets = await pgQuery(sql);
if (!targets.length) {
  console.log("[track] no stale targets — all rankings are fresh.");
  process.exit(0);
}
console.log(`[track] ${targets.length} keyword(s) to check:`);
targets.forEach((t, i) => console.log(`  ${i+1}. [${t.business_name}] "${t.keyword}" (last: ${t.last_measured || 'never'})`));

if (DRY) { console.log("[DRY] exiting before browser launch"); process.exit(0); }

// 2. Launch puppeteer (real Chrome, persistent profile)
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
try {
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  for (const target of targets) {
    const targetPlaceKey = placeKeyFromUrl(target.gbp_url);
    if (!targetPlaceKey) {
      console.warn(`[track] skipping ${target.business_name} — no Place ID in GBP URL`);
      continue;
    }
    console.log(`\n[track] ▶ "${target.keyword}" — looking for ${target.business_name} (${targetPlaceKey})`);
    const url = `https://www.google.com/maps/search/${encodeURIComponent(target.keyword)}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      // Wait for results feed
      await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 30000 });
      // Scroll feed to load more results (~50)
      await page.evaluate(async () => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return;
        for (let i = 0; i < 30; i++) {
          feed.scrollTop = feed.scrollHeight;
          await new Promise((r) => setTimeout(r, 700));
        }
      });
      // Extract ranked list of Place IDs
      const places = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        const seen = new Set();
        const out = [];
        for (const a of anchors) {
          const href = a.getAttribute("href") || "";
          const m = href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
          const key = m ? m[1].toLowerCase() : href;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ key, name: (a.getAttribute("aria-label") || "").trim() });
        }
        return out;
      });
      const idx = places.findIndex((p) => p.key === targetPlaceKey);
      const rank = idx >= 0 ? idx + 1 : null;
      console.log(`[track] ✓ rank: ${rank == null ? "not in top " + places.length : "#" + rank} (of ${places.length} visible)`);

      // Insert new row
      await pgQuery(`
        insert into public.client_keyword_rankings (client_id, keyword, market, map_rank, source)
        values (${sqlStr(target.client_id)}, ${sqlStr(target.keyword)}, ${sqlStr(target.primary_market)}, ${rank == null ? 'null' : rank}, 'auto_puppeteer')
      `);
      processed += 1;
    } catch (err) {
      console.error(`[track] ✗ "${target.keyword}" failed: ${err.message}`);
    }

    // Pacing: 5-10 min between searches (per rate-limit memory)
    if (target !== targets[targets.length - 1]) {
      const wait = 300 + Math.floor(Math.random() * 300); // 5-10 min in seconds
      console.log(`[track] sleeping ${wait}s before next keyword...`);
      await sleep(wait * 1000);
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`\n[track] done — ${processed}/${targets.length} keywords ranked.`);
