#!/usr/bin/env node
/**
 * local-search-almanac.mjs — RGA's own local-search dataset, and the cross-reference against
 * published industry research.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-05: "can we do a deep dive also to find documentation to cross reference in our
 * keywords and other work. like whitespark how they have a pdf or document they do annually... then
 * we can start adding to this file with our own data and findings... and create our own like a
 * whitespark and send to our clients as a newsletter and also use for people to signup".
 *
 * 🔑 THE STRATEGIC POINT, and the reason this is worth building rather than just reading:
 *
 *   Whitespark's Local Search Ranking Factors is 47 EXPERTS GIVING OPINIONS about 187 factors.
 *   BrightLocal's Consumer Review Survey is 1,002 CONSUMERS REPORTING INTENT.
 *
 *   Neither is a measurement of real businesses. Nobody in local SEO publishes observational data on
 *   what ranking businesses actually look like, because almost nobody has it.
 *
 *   RGA does, as a free byproduct of the outreach pipeline: every scrape writes a vertical benchmark
 *   recording the categories, review counts and ratings of the businesses that ACTUALLY rank top-10
 *   for a real query in a real city. That is observational, not opinion — a different and scarcer
 *   kind of evidence, and it compounds with every night the pipeline runs.
 *
 * 🔴 HONEST ABOUT WHAT THIS IS NOT. It is a census of who ranks, not a controlled experiment. It
 * shows CORRELATION (top-3 businesses in this vertical hold a median of N reviews), never causation.
 * The causation study becomes possible later, from client_change_log's before→after pairs — and only
 * once enough clients exist for the sample to mean anything. Publishing correlation as causation is
 * the exact dishonesty that makes prospects distrust agencies.
 *
 * ─── THE THREE PRONGS (Chris, 2026-09-05: "we should use current maps rankings top 3 and all") ──
 *
 *   1. VERTICAL BENCHMARKS — what businesses that rank LOOK like (categories, reviews, ratings).
 *      Observational, from the scrape corpus. Describes the finish line.
 *   2. PUBLISHED RESEARCH — Whitespark opinion + BrightLocal stated intent. Context, not measurement.
 *   3. 🆕 MAPS RANK SNAPSHOTS — where a business ACTUALLY SITS on a geo-grid, and how that moves.
 *      `brain_rank_snapshots` (pct_top3 / avg_rank / competitors) + `client_keyword_rankings`
 *      (per-grid-point map_rank). This is the OUTCOME measure.
 *
 * 🔑 Prong 3 is what eventually turns this from description into causation. Prongs 1-2 can only ever
 * say "businesses that rank tend to look like X". Rank snapshots over time, joined to
 * client_change_log's before→after pairs, say "we changed X and the grid moved" — which is the study
 * nobody in local SEO publishes, because it needs both the changes AND the measurements.
 *
 * Commands:
 *   local-search-almanac.mjs build              aggregate our corpus → reports/almanac/
 *   local-search-almanac.mjs vertical <slug>    one vertical, ours + published benchmarks
 *   local-search-almanac.mjs gaps               where our coverage is too thin to publish
 *   local-search-almanac.mjs rankings           prong 3 — observed grid positions over time
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const CORPUS = path.join(REPO, "data", "vertical-benchmarks");
const BENCH = path.join(REPO, "config", "industry-benchmarks.json");
const OUT = path.join(REPO, "reports", "almanac");

/** 🔴 A vertical with too few observations is noise. Publishing it would be the hardcoded-stat
 *  problem wearing a lab coat: a real number, computed from a sample too small to mean anything. */
const MIN_BUSINESSES_TO_PUBLISH = 30;
const MIN_CITIES_TO_PUBLISH = 3;

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : +((s[m - 1] + s[m]) / 2).toFixed(2);
};

function loadCorpus() {
  if (!fs.existsSync(CORPUS)) return [];
  return fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json")).map((f) => {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(CORPUS, f), "utf8")); } catch { return null; }
    const m = f.replace(/\.json$/, "").match(/^(.*)-in-(.*)-([a-z]{2})$/);
    return {
      file: f,
      vertical: m ? m[1] : f.replace(/\.json$/, ""),
      city: m ? `${m[2]}, ${m[3].toUpperCase()}` : null,
      audited: Number(j.leadsAudited || 0),
      date: (j.auditedDate || "").slice(0, 10),
      majorityCategoryTop3: j.majorityCategoryTop3 || null,
      majorityCategoryTop10: j.majorityCategoryTop10 || null,
      reviewsTop3Avg: j.reviewsTop3Avg ?? null,
      reviewsMedianTop10: j.reviewsTop10?.median ?? null,
      reviewsP25: j.reviewsTop10?.p25 ?? null,
      reviewsP75: j.reviewsTop10?.p75 ?? null,
      ratingTop3Avg: j.ratingTop3Avg ?? null,
      ratingMedianTop10: j.ratingTop10Median ?? null,
      categoryDistributionTop3: j.categoryDistributionTop3 || {},
    };
  }).filter(Boolean);
}

function aggregate(rows) {
  const byVertical = new Map();
  for (const r of rows) {
    if (!byVertical.has(r.vertical)) byVertical.set(r.vertical, []);
    byVertical.get(r.vertical).push(r);
  }
  const out = [];
  for (const [vertical, rs] of byVertical) {
    const cities = [...new Set(rs.map((r) => r.city).filter(Boolean))];
    const businesses = rs.reduce((a, r) => a + r.audited, 0);
    // How concentrated is the winning category? A vertical where the top-3 nearly always share one
    // category is one where getting the primary category wrong is fatal — the actionable finding.
    const catCount = new Map();
    for (const r of rs) for (const [c, n] of Object.entries(r.categoryDistributionTop3)) {
      catCount.set(c, (catCount.get(c) || 0) + n);
    }
    const totalCat = [...catCount.values()].reduce((a, b) => a + b, 0);
    const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      vertical,
      cities: cities.length,
      city_list: cities.sort(),
      businesses_observed: businesses,
      observations: rs.length,
      window: [rs.map((r) => r.date).filter(Boolean).sort()[0], rs.map((r) => r.date).filter(Boolean).sort().pop()],
      reviews_top3_median: median(rs.map((r) => r.reviewsTop3Avg).filter((v) => v != null)),
      reviews_top10_median: median(rs.map((r) => r.reviewsMedianTop10).filter((v) => v != null)),
      rating_top3_median: median(rs.map((r) => r.ratingTop3Avg).filter((v) => v != null)),
      rating_top10_median: median(rs.map((r) => r.ratingMedianTop10).filter((v) => v != null)),
      dominant_top3_category: topCat ? topCat[0] : null,
      dominant_category_share: topCat && totalCat ? +(topCat[1] / totalCat * 100).toFixed(1) : null,
      publishable: businesses >= MIN_BUSINESSES_TO_PUBLISH && cities.length >= MIN_CITIES_TO_PUBLISH,
    });
  }
  return out.sort((a, b) => b.businesses_observed - a.businesses_observed);
}

const rows = loadCorpus();
const agg = aggregate(rows);
const bench = fs.existsSync(BENCH) ? JSON.parse(fs.readFileSync(BENCH, "utf8")) : null;
const cmd = process.argv[2] || "build";

if (!rows.length) {
  console.error(`✗ no corpus at ${CORPUS} — nothing to aggregate`);
  process.exit(1);
}

if (cmd === "build") {
  const totals = {
    businesses_observed: rows.reduce((a, r) => a + r.audited, 0),
    verticals: agg.length,
    cities: new Set(rows.map((r) => r.city).filter(Boolean)).size,
    observations: rows.length,
    window: [rows.map((r) => r.date).filter(Boolean).sort()[0], rows.map((r) => r.date).filter(Boolean).sort().pop()],
  };
  const publishable = agg.filter((a) => a.publishable);
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = totals.window[1] || "unknown";
  const payload = {
    generated_from: "data/vertical-benchmarks (byproduct of the outreach scrape pipeline)",
    method: "observational — attributes of businesses actually ranking top-10 for a real query in a real city",
    not_a_claim_of_causation: true,
    totals, publishable_verticals: publishable.length, verticals: agg,
    external_benchmarks: bench ? Object.keys(bench.sources) : [],
  };
  const file = path.join(OUT, `rga-local-search-almanac-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));

  console.log("── RGA Local Search Almanac — our own observed data ──\n");
  console.log(`  businesses observed  ${totals.businesses_observed}`);
  console.log(`  verticals            ${totals.verticals}`);
  console.log(`  cities               ${totals.cities}`);
  console.log(`  window               ${totals.window[0]} .. ${totals.window[1]}`);
  console.log(`  publishable          ${publishable.length} of ${agg.length} verticals meet the ${MIN_BUSINESSES_TO_PUBLISH}-business / ${MIN_CITIES_TO_PUBLISH}-city bar\n`);
  console.log("  top verticals by sample:");
  for (const a of agg.slice(0, 10)) {
    console.log(`    ${a.publishable ? "✅" : "▫️ "} ${a.vertical.padEnd(26)} n=${String(a.businesses_observed).padStart(3)} ` +
      `cities=${String(a.cities).padStart(2)}  top3 reviews med=${String(a.reviews_top3_median ?? "-").padStart(5)}  rating=${a.rating_top3_median ?? "-"}`);
  }
  console.log(`\n  written: ${path.relative(REPO, file)}`);
  if (!publishable.length) {
    console.log("\n  ⚠️  Nothing meets the publish bar yet. That is the honest state, not a failure —");
    console.log("      the corpus grows with every scrape. Do NOT lower the bar to produce a document.");
  }
}

if (cmd === "vertical") {
  const slug = process.argv[3];
  const a = agg.find((x) => x.vertical === slug);
  if (!a) {
    console.error(`✗ no data for "${slug}". Known: ${agg.slice(0, 15).map((x) => x.vertical).join(", ")}…`);
    process.exit(1);
  }
  console.log(`── ${a.vertical} ──\n`);
  console.log(`  OUR OBSERVED DATA  (n=${a.businesses_observed} businesses, ${a.cities} cities, ${a.window[0]}..${a.window[1]})`);
  console.log(`    top-3 review count, median      ${a.reviews_top3_median ?? "—"}`);
  console.log(`    top-10 review count, median     ${a.reviews_top10_median ?? "—"}`);
  console.log(`    top-3 rating, median            ${a.rating_top3_median ?? "—"}`);
  console.log(`    dominant top-3 category         ${a.dominant_top3_category ?? "—"} (${a.dominant_category_share ?? "—"}% of top-3 slots)`);
  console.log(`    ${a.publishable ? "✅ meets the publish bar" : `▫️  below the publish bar (need ≥${MIN_BUSINESSES_TO_PUBLISH} businesses across ≥${MIN_CITIES_TO_PUBLISH} cities)`}`);
  if (bench) {
    console.log(`\n  PUBLISHED BENCHMARKS TO CROSS-REFERENCE  (as of ${bench.as_of})`);
    for (const [, src] of Object.entries(bench.sources)) {
      console.log(`\n    ${src.publisher} — ${src.title}`);
      console.log(`      method: ${src.method} · ${src.sample}`);
      for (const f of src.findings.slice(0, 4)) {
        console.log(`        ${String(f.value).padStart(5)}${f.unit === "percent" ? "%" : " "}  ${f.label}`);
      }
      console.log(`      ${src.url}`);
    }
    console.log(`\n  🔑 Ours is observational (who actually ranks). Theirs is opinion and stated intent.`);
    console.log(`     Cite both; never present either as proof that a change CAUSES a ranking move.`);
  }
}

if (cmd === "gaps") {
  const thin = agg.filter((a) => !a.publishable);
  console.log(`── coverage gaps — ${thin.length} vertical(s) below the publish bar ──\n`);
  console.log(`  bar: ≥${MIN_BUSINESSES_TO_PUBLISH} businesses across ≥${MIN_CITIES_TO_PUBLISH} cities\n`);
  for (const a of thin.slice(0, 25)) {
    const needB = Math.max(0, MIN_BUSINESSES_TO_PUBLISH - a.businesses_observed);
    const needC = Math.max(0, MIN_CITIES_TO_PUBLISH - a.cities);
    console.log(`  ${a.vertical.padEnd(28)} n=${String(a.businesses_observed).padStart(3)} cities=${a.cities}` +
      `  → needs ${needB ? `${needB} more businesses` : ""}${needB && needC ? ", " : ""}${needC ? `${needC} more cit${needC === 1 ? "y" : "ies"}` : ""}`);
  }
  console.log(`\n  🔑 This is the scrape plan. Each line is a vertical+city the pipeline should cover`);
  console.log(`     next — coverage that serves outreach AND the almanac at the same cost.`);
}

if (cmd === "rankings") {
  // Prong 3 lives in Supabase, not on disk, so this command reads .env directly rather than
  // depending on dotenv resolving from whatever directory the caller happens to be in.
  const envPath = path.join(REPO, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) { console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unavailable"); process.exit(2); }
  const h = { apikey: K, Authorization: `Bearer ${K}` };

  const snaps = await (await fetch(`${U}/rest/v1/brain_rank_snapshots?select=*&order=snapshot_date`, { headers: h })).json();
  const clients = await (await fetch(`${U}/rest/v1/clients?select=id,business_name,primary_service,primary_market`, { headers: h })).json();
  const nameById = new Map((clients || []).map((c) => [c.id, c.business_name]));

  if (!Array.isArray(snaps) || !snaps.length) {
    console.log("── maps rank snapshots ──\n  none stored yet");
    process.exit(0);
  }

  console.log("── prong 3: observed maps rank, over time ──\n");
  const byClientKw = new Map();
  for (const s of snaps) {
    const k = `${s.client_id}|${s.keyword}`;
    if (!byClientKw.has(k)) byClientKw.set(k, []);
    byClientKw.get(k).push(s);
  }

  for (const [k, series] of byClientKw) {
    const [clientId, keyword] = k.split("|");
    series.sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
    const first = series[0], last = series[series.length - 1];
    console.log(`  ${nameById.get(clientId) || clientId} — "${keyword}"`);
    console.log(`    ${series.length} scan(s), ${first.snapshot_date} → ${last.snapshot_date}`);
    for (const s of series) {
      const flat = (s.grid || []).flat().filter((v) => v != null);
      const worst = flat.length ? Math.max(...flat) : null;
      const best = flat.length ? Math.min(...flat) : null;
      console.log(`      ${s.snapshot_date}  top3=${String(s.pct_top3 ?? "-").padStart(3)}%  top7=${String(s.pct_top7 ?? "-").padStart(3)}%  ` +
        `avg=${s.avg_rank ?? "—"}  grid best/worst=${best ?? "—"}/${worst ?? "—"} over ${flat.length} point(s)`);
    }

    // 🔴 A grid that is UNIFORM across every point and every week is not a ranking result — it is a
    // sentinel meaning "not found anywhere in range". Reporting it as "rank 21" implies we are close.
    // We are not on the board at all, and that is a different problem with a different fix.
    const allFlat = series.flatMap((s) => (s.grid || []).flat().filter((v) => v != null));
    const uniform = allFlat.length && new Set(allFlat).size === 1;
    const noMovement = series.every((s) => (s.pct_top3 ?? 0) === 0) && series.length >= 3;
    if (uniform) {
      console.log(`    🔴 UNIFORM ${allFlat[0]} across all ${allFlat.length} measurement(s) — that is a ` +
        `"not found" sentinel, not a rank. The business is absent from this grid entirely.`);
    }
    if (noMovement) {
      console.log(`    🔴 ${series.length} consecutive scans at 0% top-3 with no movement. Before optimising harder, ` +
        `check the KEYWORD is one Google already associates with this business — measuring the wrong ` +
        `term produces exactly this flat line.`);
    }
    const comps = (last.competitors || []).slice(0, 5).map((c) => c.name || c).filter(Boolean);
    if (comps.length) console.log(`    who holds it instead: ${comps.join(" · ").slice(0, 160)}`);
    console.log("");
  }

  console.log("  🔑 Prong 3 is the OUTCOME measure. Joined to client_change_log's before→after pairs it");
  console.log("     becomes the causation study — see project_local_search_almanac.md.");
}
