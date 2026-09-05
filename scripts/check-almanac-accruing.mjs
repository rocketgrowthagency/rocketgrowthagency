#!/usr/bin/env node
/**
 * check-almanac-accruing.mjs — the almanac's aggregate still reflects the corpus.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-05: "we keep building this concept so you need the memory and action to constantly
 * update this... so when we need to use it or are ready to use it we can update it with our own data
 * correctly."
 *
 * The almanac is a long-horizon asset: it is worth little today (4 of 48 verticals clear the publish
 * bar) and a great deal in a year — but ONLY if it keeps accruing. The failure mode is silent. The
 * scrape keeps writing vertical benchmarks, nobody re-aggregates, and a year later the report is
 * built from a stale snapshot while everyone assumes it has been growing all along.
 *
 * 🔴 WHAT THIS DOES *NOT* CHECK: whether the corpus grew. Production is deliberately paused
 * (project_production_pause_2026-08-25) so no new scrapes are running, and a "corpus hasn't grown"
 * alarm would fire every day for a reason that is CORRECT. An alert that fires when nothing is wrong
 * trains people to ignore it.
 *
 * So it checks OUR machinery instead, which we control:
 *   1. an almanac aggregate exists
 *   2. it covers every vertical currently in the corpus  ← catches "aggregation stopped running"
 *   3. its business count matches the corpus             ← catches a partial or truncated build
 *   4. the publish bar has not been lowered              ← catches someone forcing a document out
 *
 * Exit 0 = accruing correctly. 1 = broken. 2 = indeterminate (no corpus to judge).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const CORPUS = path.join(REPO, "data", "vertical-benchmarks");
const OUT = path.join(REPO, "reports", "almanac");
const TOOL = path.join(REPO, "scripts", "local-search-almanac.mjs");

// Must match local-search-almanac.mjs. Lowering the bar there without changing it here trips check 4.
const EXPECT_MIN_BUSINESSES = 30;
const EXPECT_MIN_CITIES = 3;

const fails = [];
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { console.log(`  🔴 ${m}`); fails.push(m); };

if (!fs.existsSync(CORPUS)) {
  console.error("✗ no vertical-benchmarks corpus — cannot judge whether the almanac is accruing");
  process.exit(2);
}

const corpusFiles = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json"));
if (!corpusFiles.length) {
  console.error("✗ corpus directory is empty — indeterminate");
  process.exit(2);
}

let corpusBusinesses = 0;
const corpusVerticals = new Set();
for (const f of corpusFiles) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(CORPUS, f), "utf8")); } catch { continue; }
  corpusBusinesses += Number(j.leadsAudited || 0);
  const m = f.replace(/\.json$/, "").match(/^(.*)-in-(.*)-([a-z]{2})$/);
  corpusVerticals.add(m ? m[1] : f.replace(/\.json$/, ""));
}

console.log("── local search almanac ──");

// 1. An aggregate exists at all.
const builds = fs.existsSync(OUT)
  ? fs.readdirSync(OUT).filter((f) => f.startsWith("rga-local-search-almanac-") && f.endsWith(".json")).sort()
  : [];
if (!builds.length) {
  bad("no almanac build in reports/almanac — run `local-search-almanac.mjs build`");
  console.log("");
  console.error(`🔴 almanac NOT accruing — ${fails.length} problem(s)`);
  process.exit(1);
}
const latest = builds[builds.length - 1];
let alm;
try { alm = JSON.parse(fs.readFileSync(path.join(OUT, latest), "utf8")); }
catch (e) { bad(`latest build ${latest} is unreadable: ${e.message}`); alm = null; }

if (alm) {
  ok(`latest build: ${latest}`);

  // 2. Coverage — the aggregate must know about every vertical the corpus holds.
  const almVerticals = new Set((alm.verticals || []).map((v) => v.vertical));
  const missing = [...corpusVerticals].filter((v) => !almVerticals.has(v));
  if (missing.length) {
    bad(`aggregate is stale — ${missing.length} vertical(s) in the corpus are absent from it ` +
        `(${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}). Re-run the build.`);
  } else {
    ok(`covers all ${corpusVerticals.size} corpus vertical(s)`);
  }

  // 3. Totals — catches a partial build that silently dropped rows.
  const almBusinesses = alm.totals?.businesses_observed ?? -1;
  if (almBusinesses !== corpusBusinesses) {
    bad(`business count drifted: aggregate says ${almBusinesses}, corpus holds ${corpusBusinesses}. Re-run the build.`);
  } else {
    ok(`business count matches the corpus (${corpusBusinesses})`);
  }

  // 4. The publish bar is intact. This is the integrity check, not a freshness one: the temptation
  //    when a newsletter is due is to lower the bar so more verticals qualify.
  const tool = fs.existsSync(TOOL) ? fs.readFileSync(TOOL, "utf8") : "";
  const mb = tool.match(/MIN_BUSINESSES_TO_PUBLISH\s*=\s*(\d+)/);
  const mc = tool.match(/MIN_CITIES_TO_PUBLISH\s*=\s*(\d+)/);
  if (!mb || !mc) {
    bad("could not read the publish bar from local-search-almanac.mjs — it may have been removed");
  } else if (Number(mb[1]) < EXPECT_MIN_BUSINESSES || Number(mc[1]) < EXPECT_MIN_CITIES) {
    bad(`publish bar LOWERED to ${mb[1]} businesses / ${mc[1]} cities (expected ≥${EXPECT_MIN_BUSINESSES}/${EXPECT_MIN_CITIES}). ` +
        `A number from too small a sample is not a finding.`);
  } else {
    ok(`publish bar intact (${mb[1]} businesses / ${mc[1]} cities)`);
  }

  const pub = (alm.verticals || []).filter((v) => v.publishable).length;
  console.log(`  ℹ️  ${pub} of ${(alm.verticals || []).length} verticals clear the bar · ` +
              `${corpusBusinesses} businesses observed · corpus grows only when scraping resumes`);
}

console.log("");
if (fails.length) {
  console.error(`🔴 almanac NOT accruing correctly — ${fails.length} problem(s) above`);
  process.exit(1);
}
console.log("✅ almanac accruing: aggregate matches the corpus, publish bar intact");
