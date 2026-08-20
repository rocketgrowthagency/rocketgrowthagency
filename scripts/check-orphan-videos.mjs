#!/usr/bin/env node
/**
 * check-orphan-videos.mjs — every deployed video must have a lead behind it. (2026-08-20)
 *
 * THE GAP THIS CLOSES
 * Reconciliation has always run leads → videos ("which lead is missing a video?"). Nothing ever ran the
 * other direction. On 2026-08-20, auditing 54 approved videos by hand turned up **Digital Imaging
 * Center**: a live, 6/6-signals-verified video at /v/digital-imaging-center/ with **no Airtable record
 * at all**. It can never be emailed. The full cost of building it — scrape, capture, voiceover,
 * branding, deploy — produced nothing, and no report mentioned it.
 *
 * An orphan is silent by construction: every existing check starts from the lead list, so a video with
 * no lead is invisible to all of them.
 *
 * ⚠️ MATCH BY NAME, NOT BY SLUG. Two slug rules coexist in this codebase — the deployed slug and
 * slugify(Business Name) differ for names containing dots ("Dr. Augusto Rojas, M.D" deploys as
 * `dr-augusto-rojas-md` but slugifies to `dr-augusto-rojas-m-d`). A slug-only comparison reported 4 of
 * 54 as missing when only 1 truly was. This normalises both sides to letters+digits so both rules
 * collapse to the same key.
 *
 * 🔴 ONLY RECENT ORPHANS ARE A DEFECT. A first run found 67 orphans across 977 deployed videos, and
 * spot-checks confirmed the leads genuinely do not exist (Arbor Tree Care, Clarkie Photography, Emerald
 * Animal Hospital, Emily Winnie Photography, Bill Ward Electric...). But most are HISTORICAL and
 * INTENTIONAL: a lead removed by dedup or a DNC/bounce purge leaves its video behind on purpose. Failing
 * on all 67 would make this gate red on every run, which is the fastest way to get a gate ignored.
 * So it reports everything and only FAILS on orphans newer than ORPHAN_FAIL_DAYS — those are the ones
 * where the pipeline just built a video it can never use.
 *
 * Usage: node scripts/check-orphan-videos.mjs [--json] [--all]
 * Exit 0 = no RECENT orphan. Exit 1 = a video built in the last ORPHAN_FAIL_DAYS days has no lead.
 * Env: ORPHAN_FAIL_DAYS (default 14).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Leads';
if (!KEY || !BASE) { console.error('✗ missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID'); process.exit(2); }

// Collapse BOTH slug rules to one key: letters and digits only.
// "dr-augusto-rojas-md" and "dr-augusto-rojas-m-d" -> "draugustorojasmd"
const key = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

const deployed = fs.readdirSync(path.join(WEBSITE, 'v'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(path.join(WEBSITE, 'v', slug, 'video.mp4')));

let all = [], offset;
do {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?pageSize=100${offset ? `&offset=${offset}` : ''}`,
    { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await r.json();
  if (j.error) { console.error('✗ airtable:', JSON.stringify(j.error).slice(0, 160)); process.exit(2); }
  all.push(...(j.records || [])); offset = j.offset;
} while (offset);

// Index leads by BOTH their name-key and their Video URL slug-key — either is a valid link.
const leadKeys = new Set();
for (const r of all) {
  const n = r.fields['Business Name']; if (n) leadKeys.add(key(n));
  const u = r.fields['Video URL'];
  if (u) { const m = String(u).match(/\/v\/([^/]+)/); if (m) leadKeys.add(key(m[1])); }
}

const FAIL_DAYS = Number(process.env.ORPHAN_FAIL_DAYS || 14);
const cutoff = Date.now() - FAIL_DAYS * 86400000;
const mtime = (slug) => { try { return fs.statSync(path.join(WEBSITE, 'v', slug, 'video.mp4')).mtimeMs; } catch { return 0; } };

const orphans = deployed.filter((slug) => !leadKeys.has(key(slug)))
  .map((slug) => ({ slug, mtime: mtime(slug) }))
  .sort((a, b) => b.mtime - a.mtime);
const recent = orphans.filter((o) => o.mtime >= cutoff);
const historical = orphans.filter((o) => o.mtime < cutoff);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ deployed: deployed.length, recent: recent.map((o) => o.slug), historical: historical.length }));
} else {
  console.log(`  deployed videos: ${deployed.length}  ·  leads: ${all.length}`);
  console.log(`  orphans total: ${orphans.length}   (recent <${FAIL_DAYS}d: ${recent.length} · historical: ${historical.length})`);
  for (const o of recent) console.log(`     🔴 /v/${o.slug}/  built ${new Date(o.mtime).toISOString().slice(0, 10)} — no lead, can never be emailed`);
  if (historical.length && process.argv.includes('--all')) {
    console.log(`  historical (leads removed by dedup/DNC purge — usually intentional):`);
    for (const o of historical) console.log(`     · /v/${o.slug}/  ${new Date(o.mtime).toISOString().slice(0, 10)}`);
  } else if (historical.length) {
    console.log(`  (${historical.length} historical orphan(s) not shown — pass --all to list them)`);
  }
}

if (recent.length) {
  console.error(`\n✗ ${recent.length} video(s) built in the last ${FAIL_DAYS} days have NO lead behind them.`);
  console.error(`  Each is a full build (scrape → capture → voiceover → branding → deploy) that can never`);
  console.error(`  produce an email. Re-scrape the search to recreate the lead, or take the video down.`);
  process.exit(1);
}
console.log(`✓ no video built in the last ${FAIL_DAYS} days is missing its lead`);
process.exit(0);
