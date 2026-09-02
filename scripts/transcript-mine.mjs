#!/usr/bin/env node
/**
 * transcript-mine.mjs — pull the high-signal passages out of a transcript corpus by theme.
 *
 * ─── WHY (2026-09-02) ──────────────────────────────────────────────────────────────────────────
 * A 60-video sales corpus is ~200k words. Reading it whole is impossible and skimming it is how you
 * end up writing a summary of a summary — the exact failure Chris called out. This pulls every
 * passage that actually discusses a named theme, with context, so the analysis is built on what was
 * SAID rather than on what the titles imply.
 *
 *   node scripts/transcript-mine.mjs <dir> --theme=guard
 *   node scripts/transcript-mine.mjs <dir> --themes            # list themes + hit counts
 *   node scripts/transcript-mine.mjs <dir> --theme=tone --window=60 --max=40
 *
 * Exit 0 = hits found · 1 = theme matched nothing · 2 = corpus unreadable.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const WINDOW = parseInt(flag('window', '45'), 10);   // words of context each side
const MAX = parseInt(flag('max', '25'), 10);
const LIST = args.includes('--themes');
const THEME = flag('theme', '');

// Themes are the ideas we care about, each as a set of surface forms. Deliberately narrow —
// a loose pattern returns the whole corpus and tells you nothing.
const THEMES = {
  guard: /\b(guard|guards? (?:down|up)|defensive|defenses?|walls? (?:up|down)|resistance|resistant|skeptic\w*|disarm)\b/i,
  tone: /\b(tonality|tonalit\w*|tone of voice|your tone|vocal|inflection|monotone|pitch of your voice)\b/i,
  trust: /\b(trust|trusted|credibility|rapport|believe you|authentic)\b/i,
  status: /\b(status|neediness|needy|desperate|posture|detach\w*|chase|chasing)\b/i,
  silence: /\b(silence|pause|stop talking|shut up|say nothing|wait for them)\b/i,
  questions: /\b(problem awareness|solution awareness|consequence question|connection question|situation question|probing question|clarifying question)\b/i,
  objection: /\b(objection|too expensive|think about it|not interested|price objection|push ?back)\b/i,
  opener: /\b(cold call|opener|opening|first (?:few )?seconds|pattern interrupt|gatekeeper)\b/i,
  emotion: /\b(emotion\w*|logic|logical|feel|feeling|pain|urgency|neuro\w*|subconscious|brain)\b/i,
  close: /\b(commitment question|close the sale|closing|next step|ask for the sale)\b/i,
};

if (!dir) { console.error('usage: node scripts/transcript-mine.mjs <dir> [--themes] [--theme=X] [--window=N] [--max=N]'); process.exit(2); }

let files;
try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')); }
catch (e) { console.error(`✗ cannot read ${dir}: ${e.message}`); process.exit(2); }
if (!files.length) { console.error(`✗ no .txt transcripts in ${dir} — refusing to report an empty analysis.`); process.exit(2); }

const docs = files.map((f) => {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const [title, url, ...rest] = raw.split('\n');
  return { file: f, title: title.trim(), url: (url || '').trim(), words: rest.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean) };
});
const totalWords = docs.reduce((a, d) => a + d.words.length, 0);

if (LIST) {
  console.log(`corpus: ${docs.length} transcripts, ${totalWords.toLocaleString()} words\n`);
  for (const [name, re] of Object.entries(THEMES)) {
    let hits = 0, vids = 0;
    for (const d of docs) { const n = d.words.filter((w) => re.test(w)).length; if (n) { hits += n; vids++; } }
    console.log(`  ${name.padEnd(11)} ${String(hits).padStart(5)} hits across ${vids}/${docs.length} videos`);
  }
  process.exit(0);
}

const re = THEMES[THEME];
if (!re) { console.error(`✗ unknown theme "${THEME}". Known: ${Object.keys(THEMES).join(', ')}`); process.exit(2); }

const out = [];
for (const d of docs) {
  const seen = [];
  for (let i = 0; i < d.words.length; i++) {
    if (!re.test(d.words[i])) continue;
    // Collapse hits that fall inside a passage we already captured.
    if (seen.length && i - seen[seen.length - 1] < WINDOW) { seen[seen.length - 1] = i; continue; }
    seen.push(i);
    out.push({ title: d.title, url: d.url, at: i,
      text: d.words.slice(Math.max(0, i - WINDOW), i + WINDOW).join(' ') });
  }
}

if (!out.length) { console.error(`✗ theme "${THEME}" matched nothing in ${docs.length} transcripts.`); process.exit(1); }

console.log(`### theme: ${THEME} — ${out.length} passage(s) across ${docs.length} transcripts (${totalWords.toLocaleString()} words)\n`);
for (const p of out.slice(0, MAX)) console.log(`— ${p.title}\n  ${p.url}\n  …${p.text}…\n`);
if (out.length > MAX) console.log(`(${out.length - MAX} more passages — raise --max)`);
process.exit(0);
