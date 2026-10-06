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
const SELF_TEST = process.argv.includes("--self-test");

// How many flat scans before we call it a measurement problem rather than a slow month.
const FLAT_SCAN_LIMIT = 3;

if (SELF_TEST) { await selfTest(); process.exit(0); }

for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error("✗ Supabase credentials unavailable"); process.exit(2); }
const h = { apikey: K, Authorization: `Bearer ${K}` };

// 🔑 clientId → the keywords step 25 locked. Module scope, because `evaluate` needs it.
const LOCKED = new Map();
let snaps, clients;
try {
  snaps = await (await fetch(`${U}/rest/v1/brain_rank_snapshots?select=*&order=snapshot_date`, { headers: h })).json();
  clients = await (await fetch(`${U}/rest/v1/clients?select=id,business_name,primary_service,archived_at`, { headers: h })).json();
  // 🔑 The locked plan per client, read the same way the product reads it: the draft stored by
  // m1.strategy.keywords_locations. A client with none falls back to primary_service.
  try {
    const recs = await (await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data`, { headers: h })).json();
    for (const r of Array.isArray(recs) ? recs : []) {
      const raw = String(r?.data?.tasks?.["m1.strategy.keywords_locations"]?.outcome_data?.draft || "");
      const kws = [...raw.matchAll(/^\s*-\s*(?:term|phrase|keyword)\s*:\s*(.+)$/gim)]
        .map((m) => m[1].trim().replace(/^["'](.*)["']$/, "$1")).filter(Boolean);
      if (kws.length) LOCKED.set(r.client_id, kws);
    }
  } catch (_) { /* no lock on file is not an error — primary_service is the fallback */ }
} catch (e) {
  console.error(`✗ could not read rank snapshots: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}
if (!Array.isArray(snaps)) { console.error(`✗ unexpected response: ${JSON.stringify(snaps).slice(0, 160)}`); process.exit(2); }
if (!snaps.length) { console.log("── map-rank tracking ──\n  no rank snapshots stored yet — nothing to judge"); process.exit(2); }

console.log("── map-rank tracking ──");
const fails = evaluate(snaps, clients);

console.log("");
if (fails.length) {
  console.error(`🔴 ${fails.length} tracked keyword(s) are measuring nothing usable — see above`);
  process.exit(1);
}
console.log("✅ map-rank tracking sane: every active grid is measuring a real position");
process.exit(0);

/** Judge every (client, keyword) series. Pure: takes rows, returns failure labels, logs as it goes. */
function evaluate(snaps, clients) {
const byId = new Map((clients || []).map((c) => [c.id, c]));
const fails = [];

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
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴🔴 THIS AUDITED THE PLACEHOLDER, NOT THE PLAN (fixed 2026-10-06).
  //
  // It compared each scan against `client.primary_service` — "seo company" — and so went on reporting
  // a September series for a keyword that step 25 replaced hours earlier, while saying nothing at all
  // about the five keywords actually locked. The grid had exactly this bug one level down: the step
  // scanned the placeholder because the guard in front of it asked about the placeholder.
  //
  // 🔑 THE WHOLE CHAIN READS ONE SOURCE OF TRUTH. Step 25 locks the plan, step 26 scans the plan, and
  // the gate that audits step 26 judges it against the plan. `primary_service` remains the fallback
  // for a client with nothing locked yet.
  // → project_the_grid_never_scanned_the_plan · feedback_fix_the_class_not_the_instance
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  const locked = LOCKED.get(clientId) || null;
  const tracked = locked && locked.length ? locked : (client?.primary_service ? [client.primary_service] : []);
  if (tracked.length && !tracked.some((t) => String(t).toLowerCase() === String(keyword).toLowerCase())) {
    console.log(`  ▫️  ${name} — "${keyword}" is not in this client's locked plan (${tracked.map((t) => `"${t}"`).join(", ")}); historic series skipped`);
    continue;
  }

  const cells = (last.grid || []).flat();
  const flat = cells.filter((v) => v != null);
  const flatRun = rows.slice(-FLAT_SCAN_LIMIT);

  // 🔴 ABSENT EVERYWHERE, SCAN AFTER SCAN. A grid of all-NULL is honest data — we searched every
  // point and the business was in none of them — but it is also the loudest possible signal that the
  // tracked keyword is wrong, and it must not pass quietly just because nothing is fabricated.
  //
  // This branch exists because the previous scanner wrote 21 into every empty cell, and the UNIFORM
  // check below was catching that by accident. Storing null instead was the correct fix, and on its
  // own it would have DELETED the alarm: `flat` goes empty, the old code logged a ▫️ note and moved
  // on. A fix that silences the check it was meant to satisfy is not a fix.
  // → feedback_a_fix_without_a_gate_regresses · feedback_correct_is_not_the_same_as_happening
  if (!flat.length) {
    const blankRun = flatRun.filter((s) => !(s.grid || []).flat().some((v) => v != null));
    if (cells.length && blankRun.length >= FLAT_SCAN_LIMIT) {
      fails.push(`${name} "${keyword}" absent`);
      console.log(`  🔴 ${name} — "${keyword}": absent from ALL ${cells.length} grid points across the last ` +
        `${blankRun.length} scans (${blankRun.map((s) => s.snapshot_date).join(", ")}). The scan is working — it ` +
        `is the ranking that does not exist. Confirm the keyword has real Search Console impressions for this ` +
        `business before spending another month optimising for it.`);
    } else {
      console.log(`  ▫️  ${name} — "${keyword}": not found at any grid point this scan (${cells.length || "no"} points searched)`);
    }
    continue;
  }

  const uniform = new Set(flat).size === 1;
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
return fails;
}

/**
 * Credential-free sabotage test. Each case is a grid this gate MUST judge a specific way — the
 * absence case exists because nulling the 21 sentinel very nearly removed the alarm it was raising.
 */
async function selfTest() {
  const C = "11111111-1111-1111-1111-111111111111";
  const clients = [{ id: C, business_name: "Test Co", primary_service: "seo company", archived_at: null }];
  const sq = (v, n = 25) => { const w = Math.sqrt(n); return Array.from({ length: w }, () => Array(w).fill(v)); };
  const snap = (date, grid, extra = {}) => ({ client_id: C, keyword: "seo company", snapshot_date: date, grid, pct_top3: 0, avg_rank: null, ...extra });
  const varied = () => { const g = sq(null); let i = 0; for (const r of g) for (let c = 0; c < r.length; c++) r[c] = (i++ % 9) + 1; return g; };

  const cases = [
    { name: "uniform 21 sentinel still caught",
      snaps: [snap("2026-01-01", sq(21))], expect: true },
    { name: "uniform 15 (a different sentinel) caught",
      snaps: [snap("2026-01-01", sq(15))], expect: true },
    { name: "THREE all-absent scans are reported",
      snaps: ["2026-01-01", "2026-02-01", "2026-03-01"].map((d) => snap(d, sq(null))), expect: true },
    { name: "ONE all-absent scan is not yet a pattern",
      snaps: [snap("2026-01-01", sq(null))], expect: false },
    { name: "a real varied grid passes",
      snaps: [snap("2026-01-01", varied(), { avg_rank: 5, pct_top3: 20 })], expect: false },
    { name: "real ranks with a null average is caught",
      snaps: [snap("2026-01-01", varied(), { avg_rank: null, pct_top3: 20 })], expect: true },
    { name: "three scans pinned at 0% top-3 is caught",
      snaps: ["2026-01-01", "2026-02-01", "2026-03-01"].map((d) => snap(d, varied(), { avg_rank: 12, pct_top3: 0 })), expect: true },
    { name: "an archived client is never judged",
      snaps: [snap("2026-01-01", sq(21))],
      clients: [{ id: C, business_name: "Test Co", primary_service: "seo company", archived_at: "2026-01-02" }], expect: false },
  ];

  const log = console.log; let pass = 0;
  for (const c of cases) {
    console.log = () => {};
    const fails = evaluate(c.snaps, c.clients || clients);
    console.log = log;
    const got = fails.length > 0;
    const ok = got === c.expect;
    if (ok) pass++;
    log(`  ${ok ? "✅" : "🔴"} ${c.name} — expected ${c.expect ? "CAUGHT" : "pass"}, got ${got ? "CAUGHT" : "pass"}`);
  }
  log(`\n${pass}/${cases.length} self-test cases passed`);
  if (pass !== cases.length) process.exit(1);
}
