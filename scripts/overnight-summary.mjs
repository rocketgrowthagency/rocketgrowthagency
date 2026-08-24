#!/usr/bin/env node
/*
 * overnight-summary.mjs — print the LOCKED in-chat summary for an overnight run, straight from its
 * report file. Use this ANY time Chris asks to "send the report" / "review the videos" — do NOT
 * hand-assemble a summary or an inline video list (that drifts from the locked format). The pipeline
 * already writes the full report; this just emits the fixed chat summary + the clickable link.
 *
 * The report lives in the WEBSITE workspace (NOT this Scraper repo):
 *   <website>/reports/overnight/<YYYY>/<MM-Month>/<DD>_overnight-report_<YYYY-MM-DD>.md
 *
 * Usage:
 *   node scripts/overnight-summary.mjs                 # latest report
 *   node scripts/overnight-summary.mjs 2026-08-09      # one specific date
 *   node scripts/overnight-summary.mjs 2026-08-08 2026-08-09   # several (each printed in order)
 *
 * Format spec (do-not-regress): feedback_overnight_report_format.md.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(WEBSITE, 'reports', 'overnight');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// relative path from the Website workspace root (what the clickable link must use)
const relFor = (d) => {
  const [y, m, dd] = d.split('-');
  return `reports/overnight/${y}/${m}-${MONTHS[+m - 1]}/${dd}_overnight-report_${d}.md`;
};

function latestDate() {
  const dates = [];
  for (const y of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
    const yd = path.join(ROOT, y);
    if (!fs.statSync(yd).isDirectory()) continue;
    for (const mm of fs.readdirSync(yd)) {
      const md = path.join(yd, mm);
      if (!fs.statSync(md).isDirectory()) continue;
      for (const f of fs.readdirSync(md)) {
        const m = f.match(/^(\d{2})_overnight-report_(\d{4}-\d{2}-\d{2})\.md$/);
        if (m) dates.push(m[2]);
      }
    }
  }
  return dates.sort().pop();
}

const field = (s, label) => (s.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`)) || [])[1]?.trim() || '?';
const count = (s, row) => (s.match(new RegExp(`\\|\\s*${row}\\s*\\|\\s*(\\d+)\\s*\\|`)) || [])[1] || '?';

function summary(date) {
  const rel = relFor(date);
  const abs = path.join(WEBSITE, rel);
  if (!fs.existsSync(abs)) return `⚠️ No report file for ${date} (expected ${rel}).`;
  const s = fs.readFileSync(abs, 'utf8');
  const cat = field(s, 'Category'), loc = field(s, 'Location');
  return [
    `Overnight run — ${cat} in ${loc} (${date})`,
    ``,
    `| Stage | Count |`,
    `|---|---|`,
    `| Scraped | ${count(s, 'Scraped \\(total businesses\\)')} |`,
    `| Emailable | ${count(s, 'With email \\(emailable\\)')} |`,
    `| Completed videos | ${count(s, 'Videos deployed')} |`,
    `| Failed | ${count(s, 'Failed / gated')} |`,
    ``,
    `📄 [${rel}](${rel}) — Cmd+Shift+V for the clickable preview`,
    // 🔴 2026-08-24 — THE VIDEO-LINKS REPORT MUST BE IN THE FIRST THING CHRIS SEES.
    // Chris: "did you auto send them to the chat like you're supposed to without me asking?" — no. The
    // summary linked the overnight REPORT but not the overnight-VIDEOS file, which is the one he
    // actually opens every morning to review the night's work. He had to ask for it three days running.
    // A report that omits the thing it exists to deliver is not a report.
    ...videosLink(date),
    ``,
    `**Completed videos (${count(s, 'Videos deployed')})** — click to review:`,
    ...deployedLinks(s, count(s, 'Videos deployed')),
    ...nightOutcome(),
  ].join('\n');
}

// 🔴 The two advisory lines must not CONTRADICT each other.
// The verdict answers "is any lead stuck?" and productivity answers "did the run build anything?".
// They are independent, so on 2026-08-20 the summary would have printed "✅ No action needed" directly
// above "🔴 Dead window — 12 consecutive searches built nothing". A report that reassures and alarms in
// consecutive lines is worse than either alone: it teaches Chris to distrust the green line.
// Productivity is the louder signal, so it goes FIRST and it cancels the all-clear.
// 🔴 2026-08-21 — leads skipped BEFORE step-8 have no Airtable row, so the verdict (which counts leads)
// cannot see them. On 2026-08-20 that hid ~150 dropped leads behind a confident "✅ Nothing needs you".
// This reports what is still outstanding after the night's heal ran, so a backlog can't accumulate
// silently across nights (feedback_self_healing_must_be_autonomous).
function unpublishedLine() {
  let raw = '';
  try {
    raw = execFileSync('node', [path.join(SCRAPER, 'scripts', 'heal-unpublished-leads.mjs'), '--days=7', '--by-search'],
      { encoding: 'utf8', timeout: 120000 });
  } catch (err) { raw = typeof err?.stdout === 'string' ? err.stdout : ''; }
  const m = raw.match(/^unpublished\s*:\s*(\d+)/m);
  if (!m) return [];
  const n = Number(m[1]);
  if (!n) return [];
  const whole = (raw.match(/← ENTIRE search lost/g) || []).length;
  const out = ['', `⚠️ **${n} selected lead(s) still unpublished** — scraped and selected, but no video and no CRM row.`];
  if (whole) out.push(`- ${whole} search(es) lost their ENTIRE intake — that is a systemic fault, not per-lead failures.`);
  out.push(`- The nightly heal rebuilds these in capped batches; the rest carry to tomorrow.`);
  return out;
}


// 🔴 2026-08-24 — OPERATIONAL DRIFT BELONGS IN THE MORNING REPORT.
// A CLEAR-BACKLOG flag meant for a one-off drain sat for four days, drove 8–13 searches a night
// instead of 1, exhausted every worked Culver City pair and tripped the circuit breaker. The system
// DID notice — alert_skip() wrote a log line and fired a macOS notification, neither of which Chris
// ever sees. The one artefact he reads every morning said nothing.
// An alert that lands somewhere nobody looks is not an alert.
function driftLines() {
  let raw = '';
  try {
    raw = execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-operational-drift.mjs'), '--json'],
      { encoding: 'utf8', timeout: 60000 });
  } catch (err) { raw = typeof err?.stdout === 'string' ? err.stdout : ''; }
  if (!raw.trim()) return [];
  let d; try { d = JSON.parse(raw); } catch { return []; }
  const f = d.findings || [];
  if (!f.length) return [];
  const out = ['', '⚙️ **Operational drift**'];
  for (const x of f) out.push(`- ${x.severity === 'high' ? '🔴' : '⚠️'} ${x.msg}  →  _${x.fix}_`);
  return out;
}

function nightOutcome() {
  const prod = productivityLine();
  const verdict = verdictLine();
  const unpub = unpublishedLine();
  const drift = driftLines();
  if (!prod.length) return [...verdict, ...unpub, ...drift];
  // A dead window means the night was NOT fine, whatever the lead-level verdict says. Drop the
  // all-clear but keep a real "needs you" verdict, which is still true and additive.
  const kept = verdict.filter((l) => !/^✅ No action needed/.test(l.trim()));
  return [...prod, ...kept, ...unpub, ...drift];
}

// 🔴 2026-08-21 — "Completed videos: 0" must never again arrive without a REASON.
// On 2026-08-20 a latched OpenAI guard skipped 156 leads across 12 consecutive searches. The report
// dutifully printed `Completed videos | 0` and `✅ No action needed`, because every check it draws on
// starts from the LEAD list and a lead skipped before any record existed is invisible there. Chris read
// a zero with no explanation and had to ask what happened — the exact opposite of the standing rule
// that the morning report is a FINISHED account, not a prompt to investigate
// (feedback_self_healing_must_be_autonomous).
// Best-effort like verdictLine(): the locked report format must never be blocked by an advisory extra.
function productivityLine() {
  // 🔴 A DEAD WINDOW EXITS 1 — so execFileSync THROWS in precisely the case we must report.
  // Reading only the success path would have made this line permanently dead: green forever, silent on
  // the one morning it matters (feedback_empty_output_breaks_the_test_not_the_command). The payload is
  // on err.stdout, so parse that too and treat exit code as a signal, not an error.
  let raw = '';
  try {
    raw = execFileSync('node', [path.join(SCRAPER, 'scripts', 'check-run-productivity.mjs'), '--json'],
      { encoding: 'utf8', timeout: 60000 });
  } catch (err) {
    raw = typeof err?.stdout === 'string' ? err.stdout : '';
  }
  if (!raw.trim()) return [];
  let d;
  try { d = JSON.parse(raw); } catch { return []; }
  if (!d.deadWindow?.length) return [];
  const known = (d.findings || []).find((f) => f.auto);
  // NOTE: the leading '' is a REQUIRED blank line — without it Markdown absorbs the alert into the
  // preceding numbered video list and the whole diagnosis renders as list item 16. Do not .filter(Boolean)
  // the whole array; only the optional trailing line is conditional.
  const body = [
    `🔴 **Dead window — ${d.deadWindow.length} consecutive searches built nothing** (${d.totalDispatched} leads dispatched, ${d.totalBuilt} videos out).`,
    known ? `- **Cause:** ${known.cause}` : `- **Cause:** not in the fault catalogue — a diagnostic packet was written to /tmp.`,
    known ? `- **Fix:** ${known.remedy}` : `- **Fix:** needs diagnosis.`,
  ];
  if (known) body.push('- Skipped leads were re-armed automatically; the next run rebuilds them.');
  return ['', ...body];
}

// 2026-08-19 — the summary must answer "do I need to do anything?" without being asked.
// A failure count alone doesn't say that: most failures are armed and retry themselves. This appends the
// one line that distinguishes "handled" from "stopped retrying". Best-effort — if the verdict can't be
// computed (no network / Airtable down) the summary still prints, because the locked report format is
// the load-bearing part and must never be blocked by an advisory extra.

// The per-night video-links file: reports/overnight-videos/YYYY/MM-Month/DD_overnight-videos_DATE.md
// Filed by the night a run STARTED (a run that finishes after midnight still belongs to its start date).
// Returns [] when the file is absent so a missing artefact can never break the locked report format —
// but says so loudly, because silence would read as "no videos" when it means "file not written".
function videosLink(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const rel = `reports/overnight-videos/${d.getUTCFullYear()}/${mm}-${MONTHS[d.getUTCMonth()]}/${dd}_overnight-videos_${date}.md`;
  try {
    if (!fs.existsSync(path.join(WEBSITE, rel))) {
      return [`🎬 ⚠️ video-links file not written for ${date} (expected ${rel})`];
    }
  } catch { return []; }
  return [`🎬 **[${rel}](${rel})** — every video from this night, grouped by search`];
}

function verdictLine() {
  try {
    const out = execFileSync('node', [path.join(SCRAPER, 'scripts', 'overnight-verdict.mjs'), '--brief'],
      { encoding: 'utf8', timeout: 60000 }).trim();
    return out ? ['', out] : [];
  } catch { return []; }
}

// Pull the "## Videos deployed" list from the report and re-emit each as a clickable Markdown link.
// Source rows look like:  `1. **Business Name** — https://…/v/slug/   _(6/6 signals verified)_`
//
// 🔴 2026-08-18 — THE MISMATCH MUST BE LOUD.
// The 08-17 summary printed `**Completed videos (5)** — click to review:` immediately followed by
// `_(none)_` and flagged NOTHING. Two numbers in the same report contradicted each other and the tool
// read as if it had simply had a quiet night. (Root cause was upstream: overnight-pipeline.sh read the
// deployed rows with IFS='|' when the writer used $RSEP, so every row rendered as
// `**NameURL** — ` and this regex matched none of them.) That upstream bug is fixed, but the SENSOR
// must fail loudly on its own — a parser that silently returns "_(none)_" when the report says 5 is
// the same dead-check shape as `99/99 scale≈unreadable`: it can never distinguish "nothing deployed"
// from "I could not read the rows".
function deployedLinks(s, declared) {
  const sec = (s.split(/^##\s+Videos deployed[^\n]*$/m)[1] || '').split(/^##\s+/m)[0];
  const out = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\s*\d+\.\s*\*\*(.+?)\*\*\s*—\s*(https?:\/\/\S+)/);
    if (m) out.push(`${out.length + 1}. [${m[1]}](${m[2]})`);
  }
  const n = Number(declared);
  if (Number.isFinite(n) && n !== out.length) {
    return [
      ...out,
      ``,
      `⚠️ **PARSE MISMATCH — the report says ${n} deployed but ${out.length} link row(s) could be read.**`,
      `The "## Videos deployed" rows in the report file are malformed, so this list is NOT the night's`,
      `real output. Open the report file itself and check how those rows were written before trusting`,
      `any count above.`,
    ];
  }
  return out.length ? out : ['_(none)_'];
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const dates = args.length ? args : [latestDate()].filter(Boolean);
if (!dates.length) { console.error('No overnight report files found under ' + ROOT); process.exit(1); }
console.log(dates.map(summary).join('\n\n---\n\n'));
