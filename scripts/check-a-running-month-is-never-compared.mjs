#!/usr/bin/env node
// check-a-running-month-is-never-compared.mjs — A MONTH STILL RUNNING IS NEVER ONE SIDE OF A CHANGE (master audit #8, the owner 11-11 "do all recommended").
//
// 🔴 WHY. 11-10: the client dashboard showed "Profile views 10 ▼ 82% vs last month" on Nov 10 (ten days of November against all of October). The fix covered
// one section; audit #8 found five more producers doing the same thing: the setup Dashboard's Call-button taps, the map-rank deltas, the 8-tile KPI Snapshot,
// the client report page (it opened on the running month) and the admin KPI grid ("% from last month", and "NaN%" when it was handed "N/M").
// → memory feedback_a_running_month_is_never_compared
//
// WHAT IT HOLDS (website repo, read from APPROVAL_ARCHIVE_SITE_DIR):
//   A. STATIC, over every producer of a change a person reads:
//      1. The words "vs last month" / "from last month" exist in ONE file only: shared/metrics.js (change / rankChange). No other client or admin JS spells them.
//      2. Each known producer goes through the shared rule (canCompare inside change / rankChange / pickMonths) and finds "last month" BY ITS KEY,
//         never as "the next row" (months[1], monthlyRecords[1], monthlyRows[i + 1], "the newest earlier record").
//      3. Discovery: any function in portal.js, report.js or admin.js that draws an up/down arrow beside a prior/prev value and is not a known producer fails:
//         a new producer has to be reviewed and listed here.
//   B. RUN, shared/metrics.js against fixtures for any month, any year boundary, any length of month: a running month, a gap month, a missing prior and a
//      zero base give NO change; two complete months next to each other do; the running month is named "so far in <Month> · the full month arrives about <day>";
//      the report opens on the newest COMPLETE month. Then the portal's own formatKpiDelta and caDeltaHtml are lifted and run with the same fixtures.
//   C. SELF-PROOF: the static checker is run on the website as it was BEFORE this build (git revision BEFORE_REV, or --against=<rev>) and MUST fail there.
//      (A mutation copy has no git; there the suite in mutations/ is the proof.)
// Exit 0 holds · 1 regressed · 2 can't tell (a file or a premise moved)
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BEFORE_REV = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10) || "0033ac30";
const F = [], fail = (m) => F.push(m);
const indet = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const FILES = { portal: "portal/portal.js", report: "portal/report/report.js", admin: "admin/admin.js", metrics: "shared/metrics.js", mail: "netlify/functions/send-monthly-report.js" };
const SHARED_DIR = "shared", FN_DIR = "netlify/functions";
const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([;,{}()\]`"'])\s*\/\/ .*$/gm, "$1");

function readAt(rev) {
  const one = (rel) => { try { return rev ? execFileSync("git", ["-C", SITE, "show", `${rev}:${rel}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }) : fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { return null; } };
  const out = {};
  for (const [k, rel] of Object.entries(FILES)) out[k] = one(rel);
  // every other client- or admin-facing JS that could spell the words
  const list = (dir) => { try { return rev ? execFileSync("git", ["-C", SITE, "ls-tree", "--name-only", `${rev}:${dir}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean) : fs.readdirSync(path.join(SITE, dir)); } catch { return []; } };
  out.others = {};
  for (const dir of [SHARED_DIR, FN_DIR]) for (const f of list(dir)) if (/\.(m?js)$/.test(f)) { const rel = `${dir}/${f}`; if (rel !== FILES.metrics && rel !== FILES.mail) out.others[rel] = one(rel); }
  return out;
}

/** The body of a top-level function (from `function name(` to the closing brace at column 0). "" when absent. */
function fnBody(src, name) {
  const m = new RegExp(`(^|\\n)(async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return "";
  const start = m.index + m[1].length, end = src.indexOf("\n}\n", start);
  return end < 0 ? "" : src.slice(start, end + 2);
}
/** Every top-level function name with its body. */
function functions(src) {
  const out = [], re = /(^|\n)(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) { const start = m.index + m[1].length, end = src.indexOf("\n}\n", start); if (end > start) out.push({ name: m[2], body: src.slice(start, end + 2) }); }
  return out;
}
const WORDS = /\b(vs|from) last month\b(?!'s)/i;   // "from last month's numbers" names a source, not a change
// the arrow producers we have reviewed (each goes through shared/metrics.js), by file
const KNOWN = { portal: ["caDeltaHtml", "caAnalyticsBody", "dashboardKpisHtml", "buildKpiSnapshotHtml", "formatKpiDelta"], report: ["chip", "buildHeadline", "searchTile", "tile"], admin: ["renderKpiHeadline"] };
const ARROW = /▲|▼|\\u25b2|\\u25bc|↑|↓/;

/** Every failure the source has, as sentences. [] = it holds. */
function sourceFailures(S) {
  const out = [], need = (c, m) => { if (!c) out.push(`MISSING: ${m}`); }, gone = (c, m) => { if (c) out.push(`STILL THERE: ${m}`); };
  const p = strip(S.portal), r = strip(S.report), a = strip(S.admin), mt = strip(S.metrics), ml = strip(S.mail);
  // 1 · the words live in shared/metrics.js only
  need(!!S.metrics && /function canCompare\(/.test(mt) && /function change\(/.test(mt) && /if \(!canCompare\(cur, prior, now\)\) return null;/.test(mt), "shared/metrics.js with canCompare, and change() refusing unless canCompare");
  need(/function rankChange\(/.test(mt) && /function rankChange\([^)]*\) \{\s*if \(!canCompare\(cur, prior, now\)\) return null;/.test(mt), "rankChange() refusing unless canCompare");
  need(/function isComplete\(/.test(mt) && /t >= end/.test(mt), "isComplete(): a month is complete only once its last day is over");
  for (const [k, src] of [["portal.js", p], ["report.js", r], ["admin.js", a], ["send-monthly-report.js", ml]]) gone(WORDS.test(src), `"vs/from last month" spelled in ${k} (the words belong to shared/metrics.js)`);
  for (const [rel, src] of Object.entries(S.others || {})) gone(WORDS.test(strip(src)), `"vs/from last month" spelled in ${rel}`);
  // 2 · each known producer goes through the rule, and finds last month by its key
  const cad = fnBody(p, "caDeltaHtml"), fkd = fnBody(p, "formatKpiDelta"), dash = fnBody(p, "dashboardKpisHtml"), snap = fnBody(p, "buildKpiSnapshotHtml"), body = fnBody(p, "caAnalyticsBody"), wrap = fnBody(p, "buildClientAnalyticsHtml"), sect = fnBody(p, "buildClientSection");
  need(/MET\(\)\.change\(/.test(cad), "portal caDeltaHtml goes through shared change()");
  need(/rgaMetrics\.change\(/.test(fkd), "portal formatKpiDelta goes through shared change()");
  need(/rankChange\(/.test(dash) && /\.change\(/.test(dash), "portal dashboardKpisHtml: the rank and the Call-button taps go through rankChange()/change()");
  gone(/formatKpiDelta\(/.test(dash), "portal dashboardKpisHtml still calls formatKpiDelta without the two months");
  gone(/months\s*&&\s*months\[1\]|months\[doneAt \+ 1\]/.test(dash), "portal dashboardKpisHtml takes last month as the next row");
  need(/addMonths\(MET\(\)\.monthKey\(cur\), -1\)/.test(dash), "portal dashboardKpisHtml finds last month by its key");
  need(/rankChange\(/.test(body), "portal analytics: the map rank change goes through rankChange() (never a percent of a rank)");
  gone(/caDeltaHtml\(rank,/.test(body), "portal analytics draws a percent change of a rank");
  need(/_caCmp = \{ cur: first, prior: before \}/.test(wrap) && /addMonths\(MET\(\)\.monthKey\(first\), -1\)/.test(wrap), "portal analytics finds last month by its key (_caCmp)");
  gone(/\(months && months\[1\]\)/.test(body), "portal analytics takes last month as the next row");
  { const calls = snap.match(/formatKpiDelta\([^;]*?\)/g) || []; need(calls.length >= 3 && calls.every((c) => /cmp/.test(c)), "portal KPI Snapshot: every formatKpiDelta is handed the two months (cmp)"); }
  need(/periodWords\(current, now\)/.test(snap), "portal KPI Snapshot names a running month (periodWords)");
  gone(/monthlyRecords\[1\]/.test(sect), "portal buildClientSection takes last month as the next row");
  // report page
  const init = fnBody(r, "init");
  need(/pickMonths\(monthlyRows, Date\.now\(\)\)/.test(init) && /const opensOn = picked\.cur \|\|/.test(init) && /canCompare\(current, before, Date\.now\(\)\)/.test(init), "report page opens on the newest complete month and compares only complete months");
  gone(/monthlyRows\[currentIdx \+ 1\]/.test(init) || /requestedMonth \|\| \(monthlyRows\[0\]/.test(init), "report page opens on the newest row or takes last month as the next row");
  need(/ctx\.running/.test(fnBody(r, "buildHeadline")), "report headline says a running month is running");
  // admin
  const kh = fnBody(a, "renderKpiHeadline"), kl = fnBody(a, "loadAndRenderKpis");
  need(/M\.change\(/.test(kh) && /M\.rankChange\(/.test(kh), "admin KPI grid goes through change()/rankChange()");
  gone(/\(value - prev\) \/ prev/.test(kh), "admin KPI grid computes its own percent change");
  gone(/`\$\{cur\.keywords_top3_count\}\/\$\{cur\.keywords_tracked_count/.test(kh), 'admin KPI grid hands the string "N/M" in as a value (NaN% from last month)');
  gone(/state\.kpiPrior = months\[1\]/.test(kl), "admin takes last month as the next row");
  // the email builder: the month right before by key
  gone(/sorted\.find\(\(r\) => ym\(r\) < want\)/.test(ml), "send-monthly-report takes 'the newest earlier record' as last month");
  // 3 · discovery: an arrow beside a prior value in a function nobody reviewed
  for (const [k, src] of [["portal", p], ["report", r], ["admin", a]]) {
    for (const f of functions(src)) {
      if (KNOWN[k].includes(f.name)) continue;
      const lines = f.body.split("\n").filter((l) => ARROW.test(l) && /\b(prior|prev|priorRow|delta)\b/.test(l));
      if (lines.length) out.push(`UNREVIEWED: ${k} ${f.name}() draws an arrow beside a prior value (${lines[0].trim().slice(0, 90)}). Route it through shared/metrics.js and list it here.`);
    }
  }
  return out;
}

// ───────────────────────── A + C ─────────────────────────
const NOW = readAt(null);
if (!NOW.portal || !NOW.report || !NOW.admin) indet(`could not read the website at ${SITE}`);
const now = sourceFailures(NOW);
now.forEach(fail);
let selfProof = "skipped (no git here: a mutation copy)";
{
  const before = readAt(BEFORE_REV);
  if (before.portal && before.report && before.admin) {
    const bf = sourceFailures(before);
    if (!bf.length) { console.error(`⚠️  the checker PASSES on ${BEFORE_REV} (before the build): it can't tell the old code from the new`); process.exit(2); }
    selfProof = `fails on ${BEFORE_REV} with ${bf.length} problems`;
  }
}

// ───────────────────────── B · run it ─────────────────────────
let M;
try { M = createRequire(path.join(SITE, "x.js"))("./shared/metrics.js"); } catch (e) { M = null; fail(`MISSING: shared/metrics.js can't be loaded (${e.message})`); }
if (M) {
  const T = (iso) => Date.parse(iso);
  const nov11 = T("2026-11-11T18:00:00Z"), dec1 = T("2026-12-01T00:00:00Z"), nov30 = T("2026-11-30T23:59:59Z"), jan15 = T("2027-01-15T12:00:00Z"), mar2 = T("2027-03-02T12:00:00Z");
  const ok = (c, m) => { if (!c) fail(`RUN: ${m}`); };
  ok(M.isComplete("2026-10-01", nov11) && !M.isComplete("2026-11-01", nov11), "on Nov 11 October is complete and November is not");
  ok(!M.isComplete("2026-11-01", nov30) && M.isComplete("2026-11-01", dec1), "November is complete at Dec 1 00:00 UTC and not one second before");
  ok(!M.isComplete("2026-10-01", null) && !M.isComplete("2026-10-01", undefined), "no clock = not complete (never assumed)");
  ok(M.change(10, 55, "2026-11-01", "2026-10-01", nov11, { style: "pct" }) === null, "the running month against a whole month gives no change (the 11-10 '▼ 82%')");
  ok(M.change(10, 55, { reporting_month: "2026-11-01" }, { reporting_month: "2026-10-01" }, nov11, { style: "count" }) === null, "the same with month records");
  const oct = M.change(40, 30, "2026-10-01", "2026-09-01", nov11, { style: "pct" });
  ok(oct && oct.words === "33% vs last month" && oct.better === true, `two complete months next to each other compare (${oct && oct.words})`);
  ok(M.change(40, 30, "2026-10-01", "2026-08-01", nov11, {}) === null, "a gap month (October against August) is never 'last month'");
  ok(M.change(40, null, "2026-10-01", "2026-09-01", nov11, {}) === null && M.change(null, 3, "2026-10-01", "2026-09-01", nov11, {}) === null, "a missing number on either side gives no change");
  ok(M.change(4, 0, "2026-10-01", "2026-09-01", nov11, { style: "pct" }) === null, "a percent of zero is not a number");
  ok(M.change(4, 4, "2026-10-01", "2026-09-01", nov11, {}).flat === true, "the same number is 'no change', not an arrow");
  ok(M.change(3, 5, "2026-12-01", "2026-11-01", jan15, { style: "count" }).words === "-2 vs last month", "the year boundary: December against November, read in January");
  ok(M.change(3, 5, "2027-01-01", "2026-12-01", jan15, {}) === null, "January is running on Jan 15");
  ok(M.change(9, 8, "2027-02-01", "2027-01-01", mar2, { style: "count" }) !== null, "a 28-day February is complete on Mar 2");
  const rk = M.rankChange(3, 5, "2026-10-01", "2026-09-01", nov11);
  ok(rk && rk.better && rk.words === "up from #5 last month", `a rank change is "up from #N", never a percent (${rk && rk.words})`);
  ok(M.rankChange(3, 5, "2026-11-01", "2026-10-01", nov11) === null && M.rankChange(null, 5, "2026-10-01", "2026-09-01", nov11) === null, "a rank in a running month, or an absent rank, has no change");
  ok(M.periodWords("2026-11-01", nov11) === "so far in November · the full month arrives about Dec 2", `a running month is named so far (${M.periodWords("2026-11-01", nov11)})`);
  ok(M.periodWords("2026-10-01", nov11) === "in October", "a complete month is 'in October'");
  const recs = [{ reporting_month: "2026-11-01" }, { reporting_month: "2026-10-01" }, { reporting_month: "2026-08-01" }];
  const pk = M.pickMonths(recs, nov11);
  ok(pk.cur && pk.cur.reporting_month === "2026-10-01" && pk.prior === null && pk.comparable === false && pk.running && pk.running.reporting_month === "2026-11-01", "the report opens on October (complete), and August is not October's 'last month'");
  const pk2 = M.pickMonths([{ reporting_month: "2026-11-01" }], nov11);
  ok(pk2.cur === null && pk2.running, "with only the running month on record there is no complete month to open on");
  // the portal's own producers, lifted, against the same rule
  const p = NOW.portal;
  const lift = (name) => { const b = fnBody(p, name); return b || null; };
  const fk = lift("formatKpiDelta");
  if (!fk) fail("RUN: portal formatKpiDelta can't be found");
  else {
    const g = { rgaMetrics: M };
    const fn = new Function("globalThis", `${fk}; return formatKpiDelta;`)(g);
    const run = (cur, pri, cm, pm, t) => { const real = Date.now; Date.now = () => t; try { return fn(cur, pri, { cur: { reporting_month: cm }, prior: { reporting_month: pm } }); } finally { Date.now = real; } };
    ok(run(10, 55, "2026-11-01", "2026-10-01", nov11).label === "", "portal formatKpiDelta draws nothing for the running month");
    ok(run(12, 10, "2026-10-01", "2026-09-01", nov11).label === "+2 vs last month", "portal formatKpiDelta draws +2 for two complete months");
    ok(run(12, 10, "2026-10-01", "2026-08-01", nov11).label === "", "portal formatKpiDelta draws nothing across a gap month");
  }
  const cd = lift("caDeltaHtml");
  if (!cd) fail("RUN: portal caDeltaHtml can't be found");
  else {
    const mk = (cm, pm) => new Function("MET", "_caCmp", "escapeHtml", `${cd}; return caDeltaHtml;`)(() => M, { cur: { reporting_month: cm }, prior: { reporting_month: pm } }, (x) => String(x));
    const real = Date.now; Date.now = () => nov11;
    try {
      ok(mk("2026-11-01", "2026-10-01")(10, 55, false) === "", "portal caDeltaHtml draws nothing for the running month");
      ok(/33% vs last month/.test(mk("2026-10-01", "2026-09-01")(40, 30, false)), "portal caDeltaHtml draws the change between two complete months");
    } finally { Date.now = real; }
  }
}

if (F.length) {
  console.error(`🔴 check-a-running-month-is-never-compared: ${F.length} problem${F.length === 1 ? "" : "s"}`);
  F.forEach((m) => console.error(`   ✗ ${m}`));
  process.exit(1);
}
console.log(`✅ check-a-running-month-is-never-compared: every "vs last month" is worded in shared/metrics.js and drawn only between two complete months next to each other (portal Dashboard, map rank, KPI Snapshot, report page, admin KPI grid, the email); the running month is named "so far"; self-proof ${selfProof}.`);
