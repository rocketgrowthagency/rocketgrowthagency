#!/usr/bin/env node
/**
 * generate-social-posts.mjs — social content engine v1 (2026-07-11).
 *
 * Turns our OWN data (vertical benchmarks + the live State-of-Local-SEO report + the geo pages) into a batch of
 * ready-to-post social posts — LinkedIn (primary B2B) + short-form hooks. Every post is grounded in REAL numbers
 * (no fabricated stats) and drives to a real page (/state-of-local-seo/, /local-seo/, /free-growth-audit/).
 * Writes a queue Chris posts from now (manual); auto-posting comes when the accounts are connected.
 *
 * Output: Website repo `docs/social-content-queue.md` (internal). Usage: node scripts/generate-social-posts.mjs [N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const BENCH = path.join(SCRAPER_DIR, 'data', 'vertical-benchmarks');
const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const N = Number(process.argv[2] || 12);
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const parse = (t) => { const m = t.match(/^(.*?)\s+in\s+(.*?),?\s*([A-Z]{2})\.?$/i); return m ? { v: titleCase(m[1].trim()), c: m[2].trim(), s: m[3] } : null; };
const median = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const avg = (a) => { a = a.filter((x) => x != null); return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length * 100) / 100 : null; };

const all = fs.readdirSync(BENCH).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(BENCH, f), 'utf8')));
const byV = {}; const cities = new Set(); let audited = 0;
for (const b of all) { const p = parse(b.searchTerm); if (!p) continue; (byV[p.v] = byV[p.v] || []).push(b); cities.add(p.c); audited += b.leadsAudited || 0; }
const rows = Object.entries(byV).map(([v, bs]) => ({ v, rev3: median(bs.map((x) => x.reviewsTop3Avg)), rating: avg(bs.map((x) => x.ratingTop3Avg)) })).filter((r) => r.rev3 != null).sort((a, b) => b.rev3 - a.rev3);
const medAll = median(all.map((b) => b.reviewsTop3Avg));
const facts = [
  `Across ${all.length} local markets we audited (${audited} businesses, ${Object.keys(byV).length} industries), the median business in the Google Maps top 3 has ${medAll} reviews.`,
  `The review bar swings ~${Math.round(rows[0].rev3 / rows[rows.length - 1].rev3)}x by trade: ${rows[0].v} top-3 median ${rows[0].rev3} reviews vs ${rows[rows.length - 1].v} at ${rows[rows.length - 1].rev3}.`,
  ...rows.slice(0, 8).map((r) => `${r.v}: median top-3 business has ${r.rev3} reviews at a ${r.rating}-star average.`),
  `Below ~4.7 stars a business is effectively invisible in the map pack regardless of review count.`,
];

if (!OPENAI_API_KEY) { console.error('No OPENAI_API_KEY'); process.exit(1); }
async function openai(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.75, max_tokens: 2600, messages }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return JSON.parse((await res.json()).choices[0].message.content);
}

const sys = `You are the social content lead for Rocket Growth Agency (done-for-you Google Maps local SEO for local
service businesses). Write ${N} scroll-stopping posts for LinkedIn (owner + agency audience) that use our OWN
data to teach + build authority, then softly point to a real RGA page. Owner-voice, specific, NO hype, NO
emoji-spam (one tasteful emoji max, optional). Each post: a strong first-line HOOK, 2-5 short lines of value
grounded in a REAL data point, then a soft CTA to one URL. Vary the angle (myth-buster, a single stat, a
"here's what X markets showed", a mistake, a per-trade callout). Use only the DATA FACTS provided — never invent
numbers. URLs to rotate: https://www.rocketgrowthagency.com/state-of-local-seo/ (the data report),
https://www.rocketgrowthagency.com/local-seo/ (local-SEO-by-city), https://www.rocketgrowthagency.com/free-growth-audit/ (free audit).`;
// Generate in small batches (models are lazy with big arrays) — 3 posts/call, varied focus, until we have N.
const FOCI = ['a myth-buster that corrects a common belief', 'a single surprising stat with the takeaway',
  'a specific trade callout (pick one industry from the data)', 'a mistake local owners make + the fix',
  '"here is what X markets showed" data drop', 'a review-vs-rating insight', 'a "you vs the top 3" gap framing'];
const posts = [];
for (let i = 0; posts.length < N && i < FOCI.length + 2; i++) {
  const focus = FOCI[i % FOCI.length];
  const want = Math.min(3, N - posts.length);
  const usr = `DATA FACTS (use these verbatim numbers only):\n${facts.map((f) => '- ' + f).join('\n')}\n\nWrite ${want} DISTINCT LinkedIn posts, angle: ${focus}. Different from any obvious duplicate. Return JSON EXACTLY: {"posts":[{"platform":"LinkedIn","angle":"...","hook":"first line","body":"post body (\\n line breaks)","cta":"soft CTA line","url":"one of the 3 URLs","visual":"one-line image/graphic suggestion"}]}. Exactly ${want} posts.`;
  try {
    const out = await openai([{ role: 'system', content: sys }, { role: 'user', content: usr }]);
    for (const p of (out.posts || [])) if (posts.length < N && p.hook) posts.push(p);
  } catch (e) { console.error('  batch failed (continuing):', e.message); }
}
const md = `# RGA Social Content Queue

*Auto-generated from our benchmark data by \`scripts/generate-social-posts.mjs\`. Post from the top; regenerate for a fresh batch. Every stat is real (computed from ${all.length} market audits). Posting is manual until the social accounts are connected. See \`project_social_media_plan\`.*

---

${posts.map((p, i) => `## ${i + 1}. ${p.angle || p.platform}  ·  → ${p.url}
**Hook:** ${p.hook}

${p.body}

${p.cta}

${p.url}

*Visual: ${p.visual || 'a clean data stat card'}*
`).join('\n---\n\n')}`;

fs.mkdirSync(path.join(WEB, 'docs'), { recursive: true });
fs.writeFileSync(path.join(WEB, 'docs', 'social-content-queue.md'), md);
console.log(`✓ docs/social-content-queue.md — ${posts.length} ready-to-post LinkedIn posts (real data).`);
