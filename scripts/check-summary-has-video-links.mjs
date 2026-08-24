#!/usr/bin/env node
/**
 * check-summary-has-video-links.mjs — the auto-posted morning summary MUST link the video-links file.
 *
 * ─── WHY (2026-08-24) ────────────────────────────────────────────────────────────────────────────
 * Chris, after three nights away: *"did you auto send them to the chat like you're supposed to without
 * me asking? yes or no?"* — **No.** The summary linked the overnight REPORT but not the
 * overnight-VIDEOS file, which is the one he actually opens each morning to review the night's work.
 * He had to ask for it three days running.
 *
 * The whole point of the auto-posted summary is that the first thing he sees on return is the night's
 * output. **A report that omits the thing it exists to deliver is not a report.**
 *
 * INVARIANTS
 *  1. `overnight-summary.mjs` emits a link to `reports/overnight-videos/…/DD_overnight-videos_DATE.md`.
 *  2. It is inside the per-date summary block — so EVERY night gets one, not just the newest.
 *  3. A missing file says so LOUDLY. Silence would read as "no videos" when it means "file not written",
 *     and that is exactly how a bad night looks like a quiet one.
 *  4. It never throws. The locked report format must not be breakable by an advisory extra
 *     (feedback_overnight_report_format).
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUMMARY = path.join(HERE, 'overnight-summary.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(SUMMARY)) fail('overnight-summary.mjs is missing.');
const raw = fs.readFileSync(SUMMARY, 'utf8');
// JS file — strip line + block comments so the check can never match its own prose.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

// 1 + 2. Emitted, and from inside the per-date block.
if (!/overnight-videos/.test(src)) {
  fail('the summary never references the overnight-videos file. That is the list Chris opens every\n' +
       '         morning — omitting it means he has to ask, which defeats the auto-post entirely.');
}
if (!/\.\.\.videosLink\(date\)/.test(src)) {
  fail('videosLink(date) is not spread into the per-date summary block, so not every night gets a link.');
}
const iVideos = src.indexOf('...videosLink(date)');
const iReport = src.indexOf('📄 [${rel}]');
if (iReport === -1 || !(iReport < iVideos)) {
  fail('the video link is not positioned with the report link inside the summary body.');
}
ok('every night\'s summary emits a video-links line');

// 3. Missing file must be loud, not silent.
if (!/video-links file not written/.test(src)) {
  fail('a missing video-links file is silent. Silence reads as "no videos" when it means "not written" —\n' +
       '         the same class of bug as an all-clear on a night that dropped every lead.');
}
ok('a missing video-links file is reported loudly');

// 4. Behavioural — it must actually appear, and must not throw on a date with no files at all.
try {
  const out = execFileSync('node', [SUMMARY, '2026-08-23'], { encoding: 'utf8', timeout: 120000 });
  if (!/reports\/overnight-videos\/.*_overnight-videos_2026-08-23\.md/.test(out)) {
    fail('running the summary for a real date did not produce a video-links line.');
  }
  ok('behavioural: real date emits the video-links link');
} catch (e) {
  fail(`summary threw on a real date: ${(e.stderr || e.message || '').toString().slice(0, 160)}`);
}

try {
  // A date with no report at all must degrade gracefully, never throw.
  execFileSync('node', [SUMMARY, '1999-01-01'], { encoding: 'utf8', timeout: 60000 });
  ok('behavioural: a date with no report degrades without throwing');
} catch (e) {
  fail(`summary threw on a missing date instead of degrading: ${(e.stderr || e.message || '').toString().slice(0, 160)}`);
}

console.log('✅ morning summary always carries the night\'s video-links file.');
