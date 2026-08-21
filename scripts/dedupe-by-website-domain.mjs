#!/usr/bin/env node
/**
 * dedupe-by-website-domain.mjs — one website = one prospect.
 *
 * ─── WHY (2026-08-21, caught by Chris watching a video) ──────────────────────────────────────────
 * Chris opened the video for "Neal M. Ammar, MD" and it showed Beach Cities Dermatology's website.
 * Nothing was contaminated — Google's own Maps data says so:
 *
 *     Beach City Dermatology   → http://beachcitiesderm.com/
 *     William J. Wickwire, MD  → http://www.beachcitiesderm.com/
 *     Neal M. Ammar, MD        → http://www.beachcitiesderm.com/
 *
 * Group practices list each physician as a separate Maps entity pointing at the SAME practice site. We
 * built one video per listing, so a single practice would have received THREE cold emails, each with a
 * video about the same website. To the recipient that reads as spam, and it burns the domain reputation
 * the whole outreach system depends on ([[feedback-domain-protection-runbook]]).
 *
 * Measured across the 25 most recent searches: **46 same-domain groups, 66 redundant leads.**
 * Kaiser Permanente alone appeared as 4 separate "prospects".
 *
 * WHICH ONE SURVIVES — the practice, not the practitioner.
 * The buyer is the business that owns the website. Scored by how well the business name matches the
 * domain: "Beach City Dermatology" vs beachcitiesderm.com scores high, "Neal M. Ammar, MD" scores ~0.
 * Ties break on Maps rank (better rank wins), then on input order so the result is deterministic.
 *
 * 🚫 It does NOT drop leads with no website — those are legitimate prospects and succeed at a high rate
 * ([[project-video-build-rate-baseline]]). Only a SHARED, parsable domain collapses.
 *
 * Usage:
 *   node scripts/dedupe-by-website-domain.mjs <step2.csv> < names.txt > kept.txt
 *   node scripts/dedupe-by-website-domain.mjs <step2.csv> --report
 *
 * stdin  = one business name per line (the output of select-emailable-leads.py)
 * stdout = the same list with same-domain duplicates removed
 * stderr = one line per dropped lead, so the night log records exactly what was collapsed and why.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const csvParser = require('csv-parser');

const csvPath = process.argv[2];
const REPORT = process.argv.includes('--report');
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('usage: dedupe-by-website-domain.mjs <step2.csv> [--report]');
  process.exit(2);
}

const rootDomain = (w) => {
  const s = String(w || '').trim();
  if (!s) return null;
  try {
    const h = new URL(s.startsWith('http') ? s : `http://${s}`).hostname.replace(/^www\./, '').toLowerCase();
    // Aggregator/booking hosts are not a business's own site; collapsing on them would merge unrelated
    // businesses into one "prospect" and silently delete real leads — the expensive direction of error.
    if (/^(facebook|instagram|linkedin|yelp|google|sites\.google|business\.site|wixsite|godaddysites|squarespace|weebly|healthgrades|zocdoc|vagaro|booksy|square\.site|linktr\.ee)\./.test(h)) return null;
    return h || null;
  } catch { return null; }
};

const core = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Longest common substring length — a simple, explainable similarity. "beachcitydermatology" against
// "beachcitiesderm" shares "beachcit" (8); "nealmammarmd" shares almost nothing.
const lcsLen = (a, b) => {
  if (!a || !b) return 0;
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let carry = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      if (a[i - 1] === b[j - 1]) { prev[j] = carry + 1; if (prev[j] > best) best = prev[j]; }
      else prev[j] = 0;
      carry = tmp;
    }
  }
  return best;
};

const rows = [];
let header = null;
await new Promise((resolve) => {
  fs.createReadStream(csvPath).pipe(csvParser())
    .on('headers', (h) => { header = h; })
    .on('data', (r) => rows.push(r))
    .on('end', resolve)
    .on('error', resolve);
});

const nameKey = (header || []).find((h) => /business\s*name/i.test(h)) || (header || []).find((h) => /^name$/i.test(h));
const webKey = (header || []).find((h) => /^website$/i.test(h)) || (header || []).find((h) => /website|url/i.test(h));
const rankKey = (header || []).find((h) => /maps\s*rank|^rank$/i.test(h));

// name -> { domain, rank }
const meta = new Map();
for (const r of rows) {
  const n = r[nameKey];
  if (!n) continue;
  const rank = rankKey ? Number(String(r[rankKey]).replace(/[^0-9]/g, '')) : NaN;
  meta.set(core(n), { name: n, domain: rootDomain(r[webKey]), rank: Number.isFinite(rank) ? rank : 9999 });
}

// Input list: stdin, or every row when reporting.
let names;
if (REPORT) {
  names = rows.map((r) => r[nameKey]).filter(Boolean);
} else {
  const stdin = fs.readFileSync(0, 'utf8');
  names = stdin.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Group by domain. Leads with no parsable/own domain are ALWAYS kept — never collapse an unknown.
const groups = new Map();
const keep = [];
for (const [idx, n] of names.entries()) {
  const m = meta.get(core(n));
  const d = m?.domain;
  if (!d) { keep.push({ n, idx }); continue; }
  if (!groups.has(d)) groups.set(d, []);
  groups.get(d).push({ n, idx, rank: m.rank });
}

const dropped = [];
for (const [domain, members] of groups) {
  if (members.length === 1) { keep.push(members[0]); continue; }
  const dc = core(domain.replace(/\.[a-z.]+$/, ''));
  const scored = members.map((m) => ({ ...m, score: lcsLen(core(m.n), dc) }));
  scored.sort((a, b) => (b.score - a.score) || (a.rank - b.rank) || (a.idx - b.idx));
  const winner = scored[0];
  keep.push(winner);
  for (const loser of scored.slice(1)) {
    dropped.push({ domain, kept: winner.n, dropped: loser.n });
  }
}

keep.sort((a, b) => a.idx - b.idx);

for (const d of dropped) {
  console.error(`    [domain-dedup] "${d.dropped}" shares ${d.domain} with "${d.kept}" — collapsed to one prospect`);
}

if (REPORT) {
  console.log(`rows: ${rows.length} · groups: ${groups.size} · kept: ${keep.length} · dropped: ${dropped.length}`);
} else {
  for (const k of keep) console.log(k.n);
}
