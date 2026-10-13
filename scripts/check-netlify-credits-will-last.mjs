#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-netlify-credits-will-last.mjs
//
// 🔴 WHY (2026-10-12): the 5th Netlify credit exhaustion (09-09, 09-10, 09-14, 09-24, 10-12) took the WHOLE site down —
// admin, portal, every outreach video page — with `{"error":"usage_exceeded"}`. Each time it was found by the site
// being down. Measured that day: 577 production deploys this cycle, 533 of them in the daytime (per-fix deploys from
// work sessions). The consumer was countable all along; nothing counted it.
// → project_netlify_credits_burn_is_deploys
//
// HOLDS: at the deploy rate of the last 7 days, the credits we have last until the cycle resets.
//   credits spent ≈ production deploys × CREDITS_PER_DEPLOY + bandwidth GB × CREDITS_PER_GB
//   🔑 ANCHORED: NETLIFY_CREDIT_ANCHOR = "<credits left>@<ISO time>" — what was left at a known moment (a top-up).
//   Default "4000@2026-10-12T23:55:00Z" (Chris's $40 pack, the included 1,000 already gone). A new cycle starts
//   from the included 1,000. 🔴 UPDATE THE ANCHOR WHEN CREDITS ARE BOUGHT.
// 🔑 An ESTIMATE from Netlify's published rates — the dashboard's usage page is the truth. This exists to say
//   "you are on course to run out" days before the site goes dark, not to bill.
// exit 0 = on course to last · 1 = on course to run out before the reset (or >10 deploys in 24h) · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const ENV = "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/.env";
try { for (const l of fs.readFileSync(ENV, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* env may come from the shell */ }
const T = process.env.NETLIFY_AUTH_TOKEN;
const SITE = "38f275c7-a4a8-4531-9989-1fc1ccb78f9e";
const [ANCHOR_LEFT, ANCHOR_AT] = String(process.env.NETLIFY_CREDIT_ANCHOR || "4000@2026-10-12T23:55:00Z").split("@");
const INCLUDED = Number(process.env.NETLIFY_INCLUDED_CREDITS || 1000);
const PER_DEPLOY = Number(process.env.NETLIFY_CREDITS_PER_DEPLOY || 15);
const PER_GB = Number(process.env.NETLIFY_CREDITS_PER_GB || 10);
const DAILY_MAX = Number(process.env.NETLIFY_DEPLOYS_PER_DAY_MAX || 10);
if (!T) { console.error("⚠️  INDETERMINATE — no NETLIFY_AUTH_TOKEN"); process.exit(2); }
const api = async (p) => { const r = await fetch(`https://api.netlify.com/api/v1/${p}`, { headers: { Authorization: `Bearer ${T}` }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };

let bw, deploys = [];
try {
  bw = await api("accounts/rocketgrowthagency/bandwidth");
  const start = bw.period_start_date;
  for (let page = 1; page <= 12; page++) {
    const rows = await api(`sites/${SITE}/deploys?per_page=100&page=${page}`);
    if (!Array.isArray(rows) || !rows.length) break;
    deploys.push(...rows);
    if (rows[rows.length - 1].created_at < start) break;
  }
} catch (e) { console.error(`⚠️  INDETERMINATE — Netlify API: ${e.message}`); process.exit(2); }

const LIB = `${process.env.SCRAPER_COPY_DIR || new URL("..", import.meta.url).pathname}/scripts/lib/netlify-credit-forecast.mjs`;
const { forecast } = await import(LIB);
// 🔒 PROVE THE ARITHMETIC FIRST, on two fixed scenarios — live data is green most days, so it alone can't show the
// check is able to fail. → feedback_a_gate_that_cannot_fail
{
  const now = "2026-10-13T12:00:00Z";
  const at = (h) => ({ context: "production", created_at: new Date(Date.parse(now) - h * 3600000).toISOString() });
  const base = { bandwidthBytes: 0, periodStart: "2026-09-21T07:00:00Z", periodEnd: "2026-10-21T07:00:00Z", now };
  const runOut = (r) => r.problems.some((x) => /run out/.test(x)), perFix = (r) => r.problems.some((x) => /per-fix/.test(x));
  // A · 12 deploys in 20 hours with plenty of credits → ONLY the daily-max rule
  const A = forecast({ ...base, anchorLeft: 100000, anchorAt: "2026-10-11T12:00:00Z", deploys: Array.from({ length: 12 }, (_, i) => at(i * 1.6)) });
  // B · 4 a day but only 400 credits left → ONLY the run-out rule (60/day × 7.8 days > 400 − 120)
  const B = forecast({ ...base, anchorLeft: 400, anchorAt: "2026-10-11T12:00:00Z", deploys: Array.from({ length: 8 }, (_, i) => at(i * 6)) });
  // C · 3 a day with 4,000 → no problem, and every deploy since the anchor costs its credits (exact)
  const C = forecast({ ...base, anchorLeft: 4000, anchorAt: "2026-10-11T12:00:00Z", deploys: Array.from({ length: 6 }, (_, i) => at(i * 8)) });
  const bad = [];
  if (!perFix(A) || runOut(A)) bad.push("12 deploys in a day is not flagged as per-fix deploying (alone)");
  if (!runOut(B) || perFix(B)) bad.push("a pace that runs out before the reset is not flagged (alone)");
  if (C.problems.length) bad.push(`a calm pace is flagged: ${C.problems[0]}`);
  if (Math.round(C.left) !== 4000 - 6 * 15) bad.push(`deploys since the anchor are not charged (left ${Math.round(C.left)}, expected ${4000 - 6 * 15})`);
  if (bad.length) { console.error("🔴 the credit forecast is wrong on a fixed scenario:"); for (const x of bad) console.error("   · " + x); process.exit(1); }
}
const f = forecast({ deploys, bandwidthBytes: bw.used, periodStart: bw.period_start_date, periodEnd: bw.period_end_date, now: new Date().toISOString(),
  anchorLeft: ANCHOR_LEFT, anchorAt: ANCHOR_AT, included: INCLUDED, perDeploy: PER_DEPLOY, perGb: PER_GB, dailyMax: DAILY_MAX });
const line = `≈${Math.round(f.left)} credits left (of ${f.left0} at ${f.from.toISOString().slice(0, 16)}Z) · ${f.sinceAnchor} deploys since · ${f.last24} in 24h, ${f.last48} in 48h, ${f.last7} in 7 days · ${f.gbPerDay.toFixed(1)} GB/day · ≈${Math.round(f.atReset)} left at the ${f.end.toISOString().slice(0, 10)} reset`;
const F = f.problems;
if (F.length) { console.error(`🔴 Netlify credits won't last: ${line}`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ Netlify credits on course to last: ${line}`);
