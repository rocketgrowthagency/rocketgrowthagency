#!/usr/bin/env node
/**
 * yt-transcript.mjs — pull YouTube closed captions as plain text, so video research is READABLE.
 *
 * ─── WHY (2026-09-02) ──────────────────────────────────────────────────────────────────────────
 * Chris is researching sales (Jeremy Miner / NEPQ and others) and nearly all of that material is
 * VIDEO. I cannot watch video. But these videos ship captions, and captions are text — so the
 * content IS reachable, just not by "watching". This closes the honesty gap: findings land in the
 * Sales Brain quoting what was actually SAID, with a source, instead of a second-hand summary of
 * someone else's summary.
 *
 * 🔴 Do NOT go back to scraping `captionTracks` out of the watch page. That used to work and now
 * returns a caption URL that serves ZERO bytes — YouTube requires a signed player request. The
 * failure is silent: you get a valid-looking URL and an empty body, which reads exactly like
 * "this video has no captions". yt-dlp is maintained specifically to keep up with that.
 *
 *   node scripts/yt-transcript.mjs <url-or-id> [...]        # print transcript(s)
 *   node scripts/yt-transcript.mjs --out=DIR <url> [...]    # also write DIR/<id>.txt
 *   node scripts/yt-transcript.mjs --channel=<url> [--max=N]  # newest N videos from a channel
 *   node scripts/yt-transcript.mjs --list --channel=<url> --max=N   # titles+ids only, no captions
 *
 * Exit 0 = a transcript for every input · 1 = something had none · 2 = tooling/fetch failure.
 * A video with captions disabled exits 1 and SAYS so — it never returns empty text as success.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d = '') => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const OUT_DIR = flag('out');
const CHANNEL = flag('channel');
const MAX = parseInt(flag('max', '25'), 10);
const LIST_ONLY = args.includes('--list');
const JSON_OUT = args.includes('--json');
let inputs = args.filter((a) => !a.startsWith('--'));

try { execFileSync('yt-dlp', ['--version'], { stdio: 'pipe' }); }
catch {
  console.error('✗ yt-dlp is not installed — captions cannot be fetched.');
  console.error('  Install it:  brew install yt-dlp');
  console.error('  Refusing to fall back to page-scraping: that path returns empty captions SILENTLY.');
  process.exit(2);
}

const yt = (a, timeout = 180000) => execFileSync('yt-dlp', a, { encoding: 'utf8', timeout, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

const videoId = (s) => {
  const m = String(s).match(/(?:v=|\/shorts\/|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
};

// ---------- channel enumeration ----------
if (CHANNEL) {
  let rows = [];
  try {
    const out = yt(['--flat-playlist', '--print', '%(id)s\t%(title)s', '--playlist-end', String(MAX), CHANNEL], 300000);
    rows = out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [id, ...t] = l.split('\t'); return { id, title: t.join('\t') }; });
  } catch (e) {
    console.error(`✗ could not enumerate channel: ${String(e.message).slice(0, 160)}`);
    process.exit(2);
  }
  if (!rows.length) { console.error('✗ channel returned zero videos — refusing to report success.'); process.exit(2); }
  if (LIST_ONLY) {
    rows.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}. ${r.id}  ${r.title}`));
    console.error(`\n${rows.length} video(s) listed.`);
    process.exit(0);
  }
  inputs = rows.map((r) => r.id);
  console.error(`▸ ${rows.length} video(s) from channel — fetching captions…\n`);
}

if (!inputs.length) {
  console.error('usage: node scripts/yt-transcript.mjs <url-or-id> [...] [--out=DIR] [--channel=URL --max=N] [--list]');
  process.exit(2);
}

/** VTT → prose. Auto-captions repeat each line as a rolling window; dedupe consecutive repeats. */
function vttToText(vtt) {
  const cues = [];
  for (const line of vtt.split('\n')) {
    const t = line.replace(/<[^>]+>/g, '').trim();
    if (!t || t.includes('-->') || /^(WEBVTT|Kind:|Language:|NOTE\b)/.test(t) || /^\d+$/.test(t)) continue;
    if (cues[cues.length - 1] !== t) cues.push(t);
  }
  const words = cues.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const paras = [];
  for (let i = 0; i < words.length; i += 110) paras.push(words.slice(i, i + 110).join(' '));
  return { text: paras.join('\n\n'), words: words.length };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ytt-'));
let failed = 0, blocked = 0;
const results = [];

for (const input of inputs) {
  const id = videoId(input);
  if (!id) { console.error(`✗ not a YouTube URL or id: ${input}`); failed++; continue; }

  let title = id;
  try { title = yt(['--skip-download', '--print', '%(title)s', `https://www.youtube.com/watch?v=${id}`], 90000).trim() || id; } catch {}

  try {
    yt(['--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'en.*',
        '--sub-format', 'vtt', '--no-warnings', '-o', path.join(tmp, '%(id)s'),
        `https://www.youtube.com/watch?v=${id}`]);
  } catch (e) {
    blocked++; console.error(`✗ ${title} (${id}) — fetch failed: ${String(e.message).split('\n')[0].slice(0, 120)}`); continue;
  }

  // Prefer an authored track (`.en.vtt`) over the auto one (`.en-orig.vtt`) when both exist.
  const files = fs.readdirSync(tmp).filter((f) => f.startsWith(id) && f.endsWith('.vtt'));
  const pick = files.find((f) => /\.en\.vtt$/.test(f)) || files[0];
  if (!pick) { failed++; console.error(`✗ ${title} (${id}) — no captions on this video`); results.push({ id, title, text: '', note: 'no captions' }); continue; }

  const { text, words } = vttToText(fs.readFileSync(path.join(tmp, pick), 'utf8'));
  if (!words) { failed++; console.error(`✗ ${title} (${id}) — caption file had no cues`); continue; }

  results.push({ id, title, words, text });
  if (!JSON_OUT) {
    console.log(`\n${'='.repeat(78)}\n${title}\nhttps://youtu.be/${id}  ·  ${words} words\n${'='.repeat(78)}\n`);
    console.log(text);
  }
  if (OUT_DIR) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${id}.txt`), `${title}\nhttps://youtu.be/${id}\n\n${text}\n`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (JSON_OUT) console.log(JSON.stringify(results, null, 2));
console.error(`\n▸ ${results.filter((r) => r.words).length}/${inputs.length} transcript(s) retrieved${OUT_DIR ? ` → ${OUT_DIR}` : ''}`);
process.exit(blocked ? 2 : failed ? 1 : 0);
