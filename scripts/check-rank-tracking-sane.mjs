#!/usr/bin/env node
/**
 * check-rank-tracking-sane.mjs — the map-rank grid is measuring something real.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-05: RGA's own grid had run WEEKLY FOR FIVE WEEKS returning a uniform 21 across all 25
 * points — 125 identical measurements, `avg_rank` null throughout, 0% top-3 every time. Nothing
 * flagged it. It sat in the table looking like data.
 *
 * 🔑 A uniform grid is NOT a ranking. 21 is a "not found in range" sentinel. Reported as a rank it
 * implies we are close to page one; in truth the business is absent from that grid entirely. Those
 * are different problems with different fixes, and the difference is invisible unless something
 * says so. Same family as [[feedback-a-field-that-exists-is-not-data]] and the uniform-mass-finding
 * rule: when every point agrees exactly, suspect the measurement, not the world.
 *
 * The root cause there was the TRACKED KEYWORD, not the SEO: RGA was grading itself on
 * "digital marketing agency", a term Google sends it no impressions for, while real demand sat on
 * "culver city seo company". Optimising harder against a flat line would have wasted months.
 *
 * Checks every client with rank snapshots:
 *   1. the most recent grid is not uniformly one value  → "not found", not a rank
 *   2. not N consecutive scans pinned at 0% top-3       → measuring the wrong term, or nothing moved
 *   3. avg_rank is populated when the grid holds ranks   → a null average over real data is a bug
 *
 * Exit 0 = sane. 1 = a tracked keyword is measuring nothing. 2 = indeterminate (no data / no reach).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error("✗ Supabase credentials unavailable"); process.exit(2); }
const h = { apikey: K, Authorization: `Bearer ${K}` };

// How many flat scans before we call it a measurement problem rather than a slow month.
const FLAT_SCAN_LIMIT = 3;

let snaps, clients;
try {
  snaps = await (await fetch(`${U}/rest/v1/brain_rank_snapshots?select=*&order=snapshot_date`, { headers: h })).json();
  clients = await (await fetch(`${U}/rest/v1/clients?select=id,business_name,primary_service,archived_at`, { headers: h })).json();
} catch (e) {
  console.error(`✗ could not read rank snapshots: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}
if (!Array.isArray(snaps)) { console.error(`✗ unexpected response: ${JSON.stringify(snaps).slice(0, 160)}`); process.exit(2); }
if (!snaps.length) { console.log("── map-rank tracking ──\n  no rank snapshots stored yet — nothing to judge"); process.exit(2); }

const byId = new Map((clients || []).map((c) => [c.id, c]));
const fails = [];
console.log("── map-rank tracking ──");

const series = new Map();
for (const s of snaps) {
  const k = `${s.client_id}|${s.keyword}`;
  if (!series.has(k)) series.set(k, []);
  series.get(k).push(s);
}

for (const [k, rows] of series) {
  const [clientId, keyword] = k.split("|");
  const client = byId.get(clientId);
  // An archived client stops being tracked; a stale flat line there is expected, not a fault.
  if (client?.archived_at) continue;
  const name = client?.business_name || clientId;
  rows.sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
  const last = rows[rows.length - 1];

  // 🔴 Only judge scans taken on the CURRENT tracked keyword. After a keyword change the old series
  // measures a different question, and carrying its flat line forward would report a fault that was
  // already fixed — and would keep firing forever.
  if (client?.primary_service && keyword !== client.primary_service) {
    console.log(`  ▫️  ${name} — "${keyword}" is no longer the tracked keyword (now "${client.primary_service}"); historic series skipped`);
    continue;
  }

  const flat = (last.grid || []).flat().filter((v) => v != null);
  if (!flat.length) { console.log(`  ▫️  ${name} — "${keyword}": latest scan holds no grid points`); continue; }

  const uniform = new Set(flat).size === 1;
  const flatRun = rows.slice(-FLAT_SCAN_LIMIT);
  const pinnedZero = flatRun.length >= FLAT_SCAN_LIMIT && flatRun.every((s) => (s.pct_top3 ?? 0) === 0);

  if (uniform) {
    fails.push(`${name} "${keyword}" uniform`);
    console.log(`  🔴 ${name} — "${keyword}": UNIFORM ${flat[0]} across all ${flat.length} grid points. ` +
      `That is a "not found" sentinel, not a rank — the business is absent from this grid. ` +
      `Check the keyword is one Google already associates with this business before optimising.`);
  } else if (pinnedZero) {
    fails.push(`${name} "${keyword}" flat`);
    console.log(`  🔴 ${name} — "${keyword}": ${flatRun.length} consecutive scans at 0% top-3 with no movement. ` +
      `Verify the tracked term has real impressions in Search Console; a wrong keyword produces exactly this.`);
  } else if (last.avg_rank == null) {
    fails.push(`${name} "${keyword}" null avg`);
    console.log(`  🔴 ${name} — "${keyword}": grid holds ${flat.length} ranks but avg_rank is null — the aggregate is not being computed.`);
  } else {
    console.log(`  ✅ ${name} — "${keyword}": avg ${last.avg_rank}, ${last.pct_top3}% top-3, ` +
      `range ${Math.min(...flat)}–${Math.max(...flat)} across ${flat.length} points`);
  }
}

console.log("");
if (fails.length) {
  console.error(`🔴 ${fails.length} tracked keyword(s) are measuring nothing usable — see above`);
  process.exit(1);
}
console.log("✅ map-rank tracking sane: every active grid is measuring a real position");
