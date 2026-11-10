#!/usr/bin/env node
/**
 * check-serpapi-budget.mjs - the SerpAPI budget guards hold, and the gate can FAIL (2026-11-10).
 *
 * WHY: SerpAPI ran dry on Nov 7. Nothing metered it, a stop was read as "no email", the nightly run aborted at pre-flight
 * three nights running and the morning report said "No dead window". About half of October's scrape runs were repeats of the
 * same search, and every no-email lead was paid for again each time. The fixes (project_serpapi_budget.md):
 *   - an email search is remembered for 90 days and never repeated; ONE paid query per business;
 *   - a rebuild never re-runs steps 1-2; the reviews-by-place lookup is cached 30 days; the duplicate-listing search runs only
 *     for a lead that will really get a video (passes 6/6);
 *   - a meter (output/serpapi-ledger) records every call, and nothing may bypass the wrapper;
 *   - a RESERVE (250) is kept for client work: below it the pipeline stops and leads are "not searched", never "no email";
 *     above it a night is never stopped, only alerted (80% used / projected to run out);
 *   - a pre-flight abort is a DEAD NIGHT, never "No dead window"; the owner's output/SERPAPI-HOLD still holds recovery.
 *
 * HOW IT PROVES ITSELF: every check below runs twice with FAKES ONLY (no real SerpAPI search is ever called: axios is replaced,
 * account.json is a fixture):
 *     AFTER        the code in this repo                       -> every check must pass
 *     LIVE_BEFORE  the code at the commit before the change    -> the checks MUST fail (>= MIN_BEFORE_FAILS of them)
 * If LIVE_BEFORE does not fail, the gate proves nothing: it exits 2 INDETERMINATE, never a quiet pass.
 *
 * Exit 0 = healthy - 1 = a guard regressed - 2 = INDETERMINATE (the harness, or the before-state, could not be built).
 * Flags: --against=<rev> (default f8f26ed1)  --verbose
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AFTER = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const AGAINST = (argv.find((a) => a.startsWith('--against=')) || '--against=f8f26ed1').slice(10);
const VERBOSE = argv.includes('--verbose');
const MIN_BEFORE_FAILS = 10;
const FAKE_KEY = 'FAKEKEY-not-a-real-key-0000';

const indeterminate = (m) => { console.error(`INDETERMINATE: ${m}`); process.exit(2); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'serpapi-budget-gate-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ } });
const read = (T, rel) => { try { return fs.readFileSync(path.join(T, rel), 'utf8'); } catch { return ''; } };
const has = (T, rel) => fs.existsSync(path.join(T, rel));

// ---- the BEFORE tree: the repo at the commit before the change, only the files these checks look at ----
function buildBefore() {
  const dir = path.join(TMP, 'before');
  fs.mkdirSync(dir, { recursive: true });
  const rev = spawnSync('git', ['rev-parse', '--verify', `${AGAINST}^{commit}`], { cwd: AFTER, encoding: 'utf8' });
  if (rev.status !== 0) indeterminate(`cannot resolve --against=${AGAINST} in git, so the before-state cannot be built`);
  const paths = ['lib', 'scripts', 'step-1-maps-scraper.cjs', 'step-2-email-scraper.mjs', 'step-2.5-audit.mjs', 'package.json'];
  const ar = spawnSync('bash', ['-c', `git archive ${rev.stdout.trim()} ${paths.join(' ')} | tar -x -C "${dir}"`], { cwd: AFTER, encoding: 'utf8' });
  if (ar.status !== 0) indeterminate(`git archive of ${AGAINST} failed: ${ar.stderr}`);
  try { fs.symlinkSync(fs.realpathSync(path.join(AFTER, 'node_modules')), path.join(dir, 'node_modules')); }
  catch (e) { indeterminate(`no node_modules to link into the before-state (${e.message})`); }
  return dir;
}

// ---- fakes: an ESM preload that replaces axios.get (both the ESM and the CJS instance). It answers SerpAPI from a script and
// ---- records every call; anything else on the network (a business site) fails fast; DuckDuckGo/Bing answer empty. ----
const PRELOAD = path.join(TMP, 'fake-net.mjs');
fs.writeFileSync(PRELOAD, `
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const T = process.env.GATE_TREE; const req = createRequire(path.join(T, 'x.js'));
const cjs = req('axios'); const pkgDir = path.dirname(req.resolve('axios/package.json'));
const esm = (await import(pathToFileURL(path.join(pkgDir, 'index.js')).href)).default;
function fake(url) {
  url = String(url);
  if (/serpapi\\.com\\/search/.test(url)) {
    const q = decodeURIComponent((url.match(/[?&]q=([^&]*)/) || [])[1] || '');
    fs.appendFileSync(process.env.GATE_CALLS, JSON.stringify({ q, kind: /google_maps/.test(url) ? 'maps' : 'web' }) + '\\n');
    if (process.env.GATE_SERP_MODE === 'quota') return Promise.resolve({ status: 200, data: { error: 'Your account has run out of searches.' } });
    return Promise.resolve({ status: 200, data: { organic_results: [] } });
  }
  if (/duckduckgo|bing\\.com/.test(url)) return Promise.resolve({ status: 200, data: '<html></html>' });
  return Promise.reject(Object.assign(new Error('getaddrinfo ENOTFOUND (gate fake)'), { code: 'ENOTFOUND' }));
}
cjs.get = fake; esm.get = fake;
`);

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const BUSINESSES = [
  ['Gate Plumbing One', 'https://gate-plumbing-one.test', '3105550101', 'ChIJgate0001'],
  ['Gate Plumbing Two', 'https://gate-plumbing-two.test', '3105550102', 'ChIJgate0002'],
  ['Gate Plumbing Three', 'https://gate-plumbing-three.test', '3105550103', 'ChIJgate0003'],
];
const SEARCH = 'Gate fixture plumbers in nowhere ca';

// Run step 2 against a fixture search with fake network. Returns { calls, rows, ran }.
function runStep2(T, name, { serpMode = 'empty', state = null, memoryDir, ledgerDir } = {}) {
  const work = path.join(TMP, `work-${name}`);
  fs.mkdirSync(path.join(work, 'output', 'Step 1'), { recursive: true });
  const slug = SEARCH.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const csv = ['Business Name,Website,Phone,Search Term,City,Place ID,Map Rank']
    .concat(BUSINESSES.map((b, i) => `${b[0]},${b[1]},${b[2]},"Plumbers in Nowhere CA",Nowhere,${b[3]},${i + 1}`)).join('\n') + '\n';
  const in1 = path.join(work, 'output', 'Step 1', `2026-11-10_${slug}-[step-1].csv`);
  if (!fs.existsSync(in1)) fs.writeFileSync(in1, csv);
  const callsFile = path.join(work, `calls-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(callsFile, '');
  const stateFile = path.join(work, 'state.json');
  try { fs.rmSync(stateFile); } catch { /* none */ }
  if (state) fs.writeFileSync(stateFile, JSON.stringify({ ...state, snapshotAt: new Date().toISOString() }));
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, GATE_TREE: T, GATE_CALLS: callsFile, GATE_SERP_MODE: serpMode,
    SERPAPI_KEY: FAKE_KEY, SEARCH_QUERY: SEARCH, VERIFY_MAILBOX: '0',
    SERPAPI_LEDGER_DIR: ledgerDir || path.join(work, 'ledger'), SERPAPI_STATE_FILE: stateFile,
    SERPAPI_MEMORY_DIR: memoryDir || path.join(work, 'cache'), SERPAPI_ALERT_DIR: path.join(work, 'alerts'), SERPAPI_NO_NOTIFY: '1',
  };
  const r = spawnSync('node', ['--import', pathToFileURL(PRELOAD).href, path.join(T, 'step-2-email-scraper.mjs')], { cwd: work, env, encoding: 'utf8', timeout: 150000 });
  const calls = fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const out = path.join(work, 'output', 'Step 2');
  let rows = [];
  try { const f = fs.readdirSync(out).find((x) => x.endsWith('[step-2].csv')); if (f) rows = parseCsv(fs.readFileSync(path.join(out, f), 'utf8')); } catch { /* no output */ }
  if (VERBOSE && r.status !== 0) console.error(r.stdout.slice(-1500), r.stderr.slice(-1500));
  return { calls, rows, status: r.status, work, memoryDir: env.SERPAPI_MEMORY_DIR, log: (r.stdout || '') + (r.stderr || '') };
}

// ----------------------------------------------------------------------------------------------------------------------
// The checks. Each returns an array of failure strings (empty = the guard holds in this tree).
// ----------------------------------------------------------------------------------------------------------------------
const CHECKS = [];
const check = (name, fn, opts = {}) => CHECKS.push({ name, fn, ...opts });

check('1 no repeat email search inside 90 days; ONE paid query per business', (T) => {
  const f = [];
  const first = runStep2(T, `${path.basename(T)}-a`);
  if (first.status !== 0 && !first.calls.length) return [`step 2 did not run on the fixture (exit ${first.status}): ${first.log.slice(-300)}`];
  if (first.calls.length > BUSINESSES.length) f.push(`first run spent ${first.calls.length} searches for ${BUSINESSES.length} businesses (want ${BUSINESSES.length}: one query each)`);
  const second = runStep2(T, `${path.basename(T)}-a`, { memoryDir: first.memoryDir });
  if (second.calls.length > 0) f.push(`a second run inside 90 days searched the same ${BUSINESSES.length} no-email businesses again (${second.calls.length} searches)`);
  return f;
});

check('1b the memory window is 90 days, keyed by place id / host, and never stores a stop', (T) => {
  const f = [];
  let mem;
  try { mem = createRequire(import.meta.url)(path.join(T, 'lib', 'serpapi-memory.cjs')); } catch { return ['lib/serpapi-memory.cjs does not exist']; }
  const dir = fs.mkdtempSync(path.join(TMP, 'mem-'));
  process.env.SERPAPI_MEMORY_DIR = dir;
  const key = mem.emailKey({ placeId: 'ChIJabc', host: 'x.com', name: 'X' });
  const t0 = new Date('2026-01-01T00:00:00Z');
  mem.recordNoEmail(key, { businessName: 'X' }, t0);
  if (!mem.recentNoEmail(key, new Date(t0.getTime() + 89 * 86400000))) f.push('forgot a no-email result at 89 days');
  if (mem.recentNoEmail(key, new Date(t0.getTime() + 91 * 86400000))) f.push('still remembers a no-email result at 91 days');
  if (mem.emailKey({ placeId: 'ChIJabc' }) !== mem.emailKey({ placeId: 'ChIJabc', host: 'other.com' })) f.push('the key is not the place id when there is one');
  if (mem.emailKey({ host: 'www.X.com' }) !== mem.emailKey({ host: 'x.com' })) f.push('the host key is not normalised');
  delete process.env.SERPAPI_MEMORY_DIR;
  return f;
});

check('2 a budget stop marks leads NOT SEARCHED, never "no email" (and is never remembered)', (T) => {
  const f = [];
  const r = runStep2(T, `${path.basename(T)}-b`, { state: { remaining: 249, perMonth: 5000, usage: 4751 } });
  if (r.calls.length > 0) f.push(`spent ${r.calls.length} searches with 249 left (the reserve is 250)`);
  const statuses = r.rows.map((x) => x['Email Search Status']);
  if (!statuses.length || !statuses.every((s) => s === 'not-searched')) f.push(`leads were not marked 'not-searched' (got ${JSON.stringify(statuses)})`);
  let remembered = false;
  try { remembered = Object.keys(JSON.parse(fs.readFileSync(path.join(r.memoryDir, 'email-search-memory.json'), 'utf8'))).length > 0; } catch { /* no file = nothing remembered */ }
  if (remembered) f.push('a budget stop was recorded in the 90-day no-email memory');
  return f;
});

check('2b a monthly-quota answer ("run out of searches") is NOT SEARCHED too', (T) => {
  const f = [];
  const r = runStep2(T, `${path.basename(T)}-q`, { serpMode: 'quota' });
  const statuses = r.rows.map((x) => x['Email Search Status']);
  if (!statuses.length || !statuses.every((s) => s === 'not-searched')) f.push(`a quota stop was read as an answer (statuses ${JSON.stringify(statuses)})`);
  try {
    if (Object.keys(JSON.parse(fs.readFileSync(path.join(r.memoryDir, 'email-search-memory.json'), 'utf8'))).length) f.push('a quota stop was remembered as "no email"');
  } catch { /* nothing remembered */ }
  return f;
});

check('3 a normal night is never stopped while remaining >= the reserve', (T) => {
  const f = [];
  const r = runStep2(T, `${path.basename(T)}-c`, { state: { remaining: 251, perMonth: 5000, usage: 4749 } });
  if (r.calls.length !== BUSINESSES.length) f.push(`with 251 left (reserve 250) the night searched ${r.calls.length} times, wanted ${BUSINESSES.length}`);
  const st = r.rows.map((x) => x['Email Search Status']);
  if (st.some((s) => s === 'not-searched')) f.push('leads were held back although 251 > 250');
  return f;
});

check('4 the meter records every call (consumer, kind, lead) and never the key', (T) => {
  const f = [];
  const ledger = fs.mkdtempSync(path.join(TMP, 'ledger-'));
  const r = runStep2(T, `${path.basename(T)}-d`, { ledgerDir: ledger });
  const lines = [];
  for (const file of (fs.existsSync(ledger) ? fs.readdirSync(ledger) : [])) lines.push(...fs.readFileSync(path.join(ledger, file), 'utf8').split('\n').filter(Boolean));
  if (!r.calls.length) return ['the fixture made no calls, so the meter could not be exercised'];
  if (lines.length < r.calls.length) f.push(`${r.calls.length} calls reached the network but the ledger holds ${lines.length} lines`);
  const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  if (entries.some((e) => !e.consumer || e.consumer === 'unknown')) f.push('a ledger line has no consumer name');
  if (entries.some((e) => !e.kind || !e.ts)) f.push('a ledger line has no kind or time');
  if (!entries.some((e) => /Gate Plumbing|ChIJgate/.test(e.ref || ''))) f.push('ledger lines carry no lead / place id');
  if (lines.join('\n').includes(FAKE_KEY)) f.push('THE API KEY IS IN THE LEDGER');
  return f;
});

check('4b nothing in the scraper repo calls serpapi.com/search around the wrapper (static)', (T) => {
  const f = [];
  const skipDir = new Set(['node_modules', '.git', '.claude', 'output', 'backups', 'reports', 'docs', 'archive', 'parked', 'research', 'data', 'public']);
  const files = [];
  (function walk(d, depth) {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skipDir.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name), depth + 1); }
      else if (/\.(mjs|cjs|js|sh)$/.test(e.name)) files.push(path.join(d, e.name));
    }
  })(T, 0);
  // The text between the matching parentheses that open at `open` (the index of "(").
  const balanced = (src, open) => { let d = 0; for (let k = open; k < src.length; k++) { if (src[k] === '(') d++; else if (src[k] === ')') { d--; if (d === 0) return src.slice(open + 1, k); } } return src.slice(open + 1); };
  for (const file of files) {
    const rel = path.relative(T, file);
    if (rel === 'lib/serpapi-rate-aware.cjs' || rel === 'scripts/check-serpapi-budget.mjs') continue;
    const src = fs.readFileSync(file, 'utf8');
    // Real occurrences of a search URL (not a mock handler comparing against it, not a fixture value).
    const real = [];
    const re = /(?:`|'|")https:\/\/serpapi\.com\/search/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      if (/(?:startsWith|includes|indexOf|test|match)\(\s*$|\burl:\s*$|={2,3}\s*$/.test(before)) continue;
      real.push(m.index);
    }
    if (!real.length) continue;
    if (!/serpapi-rate-aware/.test(src)) { f.push(`${rel} calls serpapi.com/search without the wrapper`); continue; }
    for (const idx of real) {
      const lineStart = src.lastIndexOf('\n', idx) + 1;
      const head = src.slice(lineStart, idx);
      const asg = head.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:new URL\()?\s*$/);
      const win = src.slice(idx, idx + 700);
      if (asg) {
        const v = asg[1];
        if (new RegExp(`(?:fetch|axios\\.get)\\(\\s*${v}\\b`).test(win)) f.push(`${rel}: sends the serpapi.com/search URL in '${v}' with fetch/axios, around the wrapper`);
      } else if (/(?:fetch|axios\.get)\(\s*$/.test(head)) {
        f.push(`${rel}: passes a serpapi.com/search URL straight to fetch/axios`);
      }
    }
    // Every wrapper call names its consumer.
    const callRe = /serpapi(?:GetRateAware|Request)\(/g;
    let c;
    while ((c = callRe.exec(src))) {
      if (/function\s*$|async\s*$/.test(src.slice(Math.max(0, c.index - 12), c.index))) continue;
      const args = balanced(src, c.index + c[0].length - 1);
      if (!/consumer\s*:/.test(args) && !/^\s*\w+\s*,\s*\w+\s*\)?\s*$/.test(args)) f.push(`${rel}: a wrapper call has no consumer name: ${args.slice(0, 60).replace(/\s+/g, ' ')}`);
    }
  }
  return f;
});

check('5 the reviews-by-place lookup is cached 30 days (including "no place"); a stop is never cached', (T) => {
  const f = [];
  let mem;
  try { mem = createRequire(import.meta.url)(path.join(T, 'lib', 'serpapi-memory.cjs')); } catch { f.push('lib/serpapi-memory.cjs does not exist'); }
  if (mem) {
    const dir = fs.mkdtempSync(path.join(TMP, 'rev-'));
    process.env.SERPAPI_MEMORY_DIR = dir;
    const t0 = new Date('2026-01-01T00:00:00Z');
    mem.putReviews('0xabc:0xdef', { gotPlace: true, reviews: 12, title: 'X' }, t0);
    mem.putReviews('0x111:0x222', { gotPlace: false, reviews: NaN, title: '' }, t0);
    if (!mem.getReviews('0xabc:0xdef', new Date(t0.getTime() + 29 * 86400000))) f.push('forgot a reviews lookup at 29 days');
    if (mem.getReviews('0xabc:0xdef', new Date(t0.getTime() + 31 * 86400000))) f.push('still serves a reviews lookup at 31 days');
    const np = mem.getReviews('0x111:0x222', new Date(t0.getTime() + 5 * 86400000));
    if (!np || np.gotPlace !== false) f.push('"no place" answers are not cached');
    delete process.env.SERPAPI_MEMORY_DIR;
  }
  const src = read(T, 'step-2.5-audit.mjs');
  const block = src.slice(src.indexOf("engine=google_maps&type=place"), src.indexOf("engine=google_maps&type=place") + 3500);
  const iGet = block.indexOf('getReviews(');
  const iReq = block.search(/serpapi(?:Request|GetRateAware)\(/);
  if (iGet < 0 || iReq < 0 || iGet > iReq) f.push('step 2.5 does not read the reviews cache before it searches');
  if (!/if \(res\)[\s\S]{0,200}putReviews\(/.test(block)) f.push('step 2.5 does not cache only a completed lookup');
  return f;
});

check('6 the duplicate-listing search runs only for a lead that will really get a video (6/6)', (T) => {
  const f = [];
  const src = read(T, 'step-2.5-audit.mjs');
  const dupUrl = (src.match(/engine=google_maps&type=search/g) || []).length;
  const iFn = src.indexOf('async function lookupDuplicateListings');
  if (iFn < 0) return ['the duplicate-listing search is still inside auditGbp: it runs for every audited lead, 6/6 or not'];
  const iUrl = src.indexOf('engine=google_maps&type=search');
  if (dupUrl !== 1 || iUrl < iFn) f.push('the duplicate-listing search is not confined to lookupDuplicateListings()');
  const main = src.slice(src.indexOf('async function main()'));
  if (!/fullyVerified[\s\S]{0,120}lookupDuplicateListings\(/.test(main)) f.push('main() does not gate lookupDuplicateListings on a fully 6/6-verified lead');
  if (!/scoreSignals/.test(src)) f.push('the 6/6 rule (scripts/lib/verification-signals.mjs) is not what decides it');
  return f;
});

// -- the nightly orchestration pieces, run as real bash against fakes --
function extractBetween(text, startRe, endRe) {
  const i = text.search(startRe); const j = text.search(endRe);
  return i >= 0 && j > i ? text.slice(i, j) : '';
}
check('7 rebuilds never re-run steps 1-2 (any-age saved CSVs are reused; "not searched" leads re-run step 2 only)', (T) => {
  const f = [];
  const pipe = read(T, 'scripts/overnight-pipeline.sh');
  const seg = extractBetween(pipe, /^CACHE_TTL_MIN=/m, /^# === Step 1: scrape ===/m);
  if (!seg) return ['cannot find the step 1-2 cache section in overnight-pipeline.sh'];
  const work = fs.mkdtempSync(path.join(TMP, 'reuse-'));
  const s1 = path.join(work, 'output', 'Step 1'); const s2 = path.join(work, 'output', 'Step 2');
  fs.mkdirSync(s1, { recursive: true }); fs.mkdirSync(s2, { recursive: true });
  const SL = 'hvac-in-nowhere-ca';
  const old = (p, body, days) => { fs.writeFileSync(p, body); const t = new Date(Date.now() - days * 86400000); fs.utimesSync(p, t, t); };
  old(path.join(s1, `2026-10-20_${SL}-[step-1].csv`), 'Business Name\nA\nB\n', 20);
  old(path.join(s2, `2026-10-20_${SL}-[step-2].csv`), 'Business Name,Email Search Status\nA,none\nB,found\n', 20);
  // a DIFFERENT search whose slug merely CONTAINS this one, and a per-lead file, must never be picked up
  old(path.join(s1, `2026-10-25_commercial-${SL}-[step-1].csv`), 'Business Name\nZ\nY\n', 2);
  old(path.join(s2, `2026-10-25_commercial-${SL}-[step-2].csv`), 'Business Name\nZ\nY\n', 2);
  const harness = (extra = '') => `#!/bin/bash
set -u
cd "${work}"
SLUG="${SL}"; LOGFILE="${work}/log.txt"; : > "$LOGFILE"; DATE_STAMP=2026-11-10
${seg}
echo "SKIP_SCRAPE=\${SKIP_SCRAPE:-}|SKIP_STEP1=\${SKIP_STEP1:-}|S1=\${LATEST_S1:-}|S2=\${LATEST_S2:-}"
`;
  const run = () => spawnSync('bash', ['-c', harness()], { encoding: 'utf8', timeout: 30000 });
  let r = run();
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('SKIP_SCRAPE=')) || '';
  if (!/SKIP_SCRAPE=1\|/.test(line)) f.push(`a 20-day-old scrape of the same search was NOT reused (${line || r.stderr.slice(0, 200)})`);
  if (/commercial-/.test(line)) f.push('reused the scrape of a different search (substring match)');
  // now mark one lead NOT SEARCHED: step 1 is still reused, step 2 alone re-runs
  old(path.join(s2, `2026-10-20_${SL}-[step-2].csv`), 'Business Name,Email Search Status\nA,not-searched\nB,found\n', 20);
  r = run();
  const line2 = (r.stdout || '').split('\n').find((l) => l.startsWith('SKIP_SCRAPE=')) || '';
  if (!/SKIP_SCRAPE=\|SKIP_STEP1=1\|/.test(line2)) f.push(`a "not searched" lead did not give step-2-only (${line2 || r.stderr.slice(0, 200)})`);
  return f;
});

function runRecovery(T, name, { hold, state }) {
  const dir = path.join(TMP, `rec-${name}`);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'output'), { recursive: true });
  fs.symlinkSync(fs.realpathSync(path.join(AFTER, 'node_modules')), path.join(dir, 'node_modules'));
  fs.cpSync(path.join(T, 'lib'), path.join(dir, 'lib'), { recursive: true });
  for (const s of ['serpapi-budget.mjs']) if (has(T, `scripts/${s}`)) fs.copyFileSync(path.join(T, 'scripts', s), path.join(dir, 'scripts', s));
  fs.writeFileSync(path.join(dir, 'scripts', 'recover-lost-leads.mjs'), `import fs from 'node:fs'; fs.appendFileSync('${dir}/ASKED', 'x'); console.log(JSON.stringify({ missing: [{ slug: 'gate-lead-1' }, { slug: 'gate-lead-2' }] }));\n`);
  fs.writeFileSync(path.join(dir, 'scripts', 'rebuild-broken-videos.sh'), `#!/bin/bash\necho rebuilt >> "${dir}/REBUILT"\n`, { mode: 0o755 });
  if (hold) fs.writeFileSync(path.join(dir, 'output', 'SERPAPI-HOLD'), 'gate fixture hold\n');
  if (state) fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ ...state, snapshotAt: new Date().toISOString() }));
  const sh = read(T, 'scripts/recovery-rounds.sh').replace(/^SCRAPER=".*"$/m, `SCRAPER="${dir}"`);
  fs.writeFileSync(path.join(dir, 'rr.sh'), sh);
  const r = spawnSync('bash', [path.join(dir, 'rr.sh'), path.join(dir, 'log.txt')], {
    cwd: dir, encoding: 'utf8', timeout: 60000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SERPAPI_STATE_FILE: path.join(dir, 'state.json'), SERPAPI_LEDGER_DIR: path.join(dir, 'ledger'), RECOVERY_MAX_ROUNDS: '1', DAYTIME_SAFE_CAPTURE: '1', SERPAPI_NO_NOTIFY: '1' },
  });
  const att = (() => { try { return fs.readFileSync(path.join(dir, 'output', 'recovery-attempts.tsv'), 'utf8').trim(); } catch { return ''; } })();
  return { out: (r.stdout || '') + (r.stderr || ''), asked: has(dir, 'ASKED'), rebuilt: has(dir, 'REBUILT'), attempts: att };
}
check('8 the SERPAPI-HOLD file still holds recovery with no attempt counted', (T) => {
  const r = runRecovery(T, `${path.basename(T)}-hold`, { hold: true });
  const f = [];
  if (r.asked || r.rebuilt) f.push('recovery ran although output/SERPAPI-HOLD exists');
  if (!/SERPAPI HOLD/.test(r.out)) f.push('recovery did not say it was held');
  if (r.attempts) f.push('a held round counted an attempt');
  return f;
}, { keepsPassing: true });
check('8b recovery respects the reserve: under it no rebuild starts and no attempt is counted', (T) => {
  const r = runRecovery(T, `${path.basename(T)}-res`, { hold: false, state: { remaining: 252, perMonth: 5000, usage: 4748 } });
  const f = [];
  // 2 leads x about 2 searches = 4 would take 252 under the 250 reserve
  if (r.rebuilt) f.push('a rebuild started although it would spend searches below the reserve');
  if (r.attempts) f.push('a held round counted a lead attempt');
  return f;
});

// -- the budget CLI: alerts, the reserve stop, and "a normal night is never stopped" --
function runCli(T, name, account, args = ['preflight']) {
  const dir = path.join(TMP, `cli-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const fx = path.join(dir, 'account.json');
  fs.writeFileSync(fx, JSON.stringify(account));
  const alerts = path.join(dir, 'alerts');
  if (!has(T, 'scripts/serpapi-budget.mjs')) return { missing: true };
  const r = spawnSync('node', [path.join(T, 'scripts', 'serpapi-budget.mjs'), ...args], {
    cwd: T, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SERPAPI_ACCOUNT_FIXTURE: fx, SERPAPI_STATE_FILE: path.join(dir, 'state.json'), SERPAPI_ALERT_DIR: alerts, SERPAPI_LEDGER_DIR: path.join(dir, 'ledger'), SERPAPI_NO_NOTIFY: '1' },
  });
  const alertFile = path.join(alerts, 'SERPAPI-BUDGET-ALERT.md');
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), alert: fs.existsSync(alertFile) ? fs.readFileSync(alertFile, 'utf8') : '', raised: (() => { try { return JSON.parse(fs.readFileSync(path.join(alerts, '_raised.json'), 'utf8')); } catch { return {}; } })() };
}
const acct = (left, perMonth = 5000, renewal = '2026-12-10') => ({ plan_name: 'Developer Plan', searches_per_month: perMonth, total_searches_left: left, this_month_usage: perMonth - left, plan_renewal_date: renewal });
check('9 an alert fires at 80% used, and when the month is projected to run out', (T) => {
  const f = [];
  const a = runCli(T, `${path.basename(T)}-80`, acct(900)); // 82% used, 900 left (> reserve): alert but go
  if (a.missing) return ['scripts/serpapi-budget.mjs does not exist'];
  if (a.status !== 0) f.push(`80% used stopped the night (exit ${a.status}); it must only alert`);
  if (!/SERPAPI-BUDGET-ALERT/.test(Object.keys(a.raised).join(',')) || !a.alert) f.push('no alert was raised at 82% used');
  // projected: late in the cycle, spending fast, 400 left of 5000
  const p = runCli(T, `${path.basename(T)}-proj`, { ...acct(1200), this_month_usage: 3800, plan_renewal_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) });
  if (p.status !== 0) f.push(`a projected overrun stopped the night (exit ${p.status}); it must only alert`);
  if (!p.alert) f.push('no alert for a month projected to run out before the reset');
  const ok = runCli(T, `${path.basename(T)}-ok`, acct(4900));
  if (ok.alert) f.push('an alert was raised on a healthy month');
  return f;
});
check('9b a pre-flight stop under the reserve raises a same-night alert and exits 3; at/above it exits 0', (T) => {
  const f = [];
  const low = runCli(T, `${path.basename(T)}-low`, acct(120));
  if (low.missing) return ['scripts/serpapi-budget.mjs does not exist'];
  if (low.status !== 3) f.push(`120 left (reserve 250) exited ${low.status}, wanted 3 (stop)`);
  if (!/STOPPED at the SerpAPI pre-flight/.test(low.alert)) f.push('no same-night alert when the run stopped at the pre-flight');
  const edge = runCli(T, `${path.basename(T)}-edge`, acct(250));
  if (edge.status !== 0) f.push(`exactly the reserve (250) stopped the night (exit ${edge.status})`);
  const mid = runCli(T, `${path.basename(T)}-mid`, acct(300));
  if (mid.status !== 0) f.push(`300 left stopped the night (exit ${mid.status}); old flat >=100 is replaced by >= the reserve, not stricter than that`);
  const pipe = read(T, 'scripts/overnight-pipeline.sh');
  if (/MIN_SERPAPI_REMAINING:-100/.test(pipe)) f.push('overnight-pipeline.sh still has the flat >=100 pre-flight with its bypass');
  if (!/serpapi-budget\.mjs preflight/.test(pipe)) f.push('overnight-pipeline.sh does not run the reserve pre-flight');
  return f;
});

check('10 a pre-flight abort is a DEAD NIGHT, and the verdict never says "No dead window" after it', (T) => {
  const f = [];
  const dir = fs.mkdtempSync(path.join(TMP, 'prod-'));
  const day = '2026-11-09';
  fs.writeFileSync(path.join(dir, `overnight-local-${day}.log`), [
    '=== Overnight pipeline: Orthodontists in El Segundo, CA ===', 'Started: 21:00', '>>> pre-flight: SerpAPI budget',
    '✗ FATAL: SerpAPI quota too low - fewer searches left than the client reserve.', '',
  ].join('\n'));
  const r = spawnSync('node', [path.join(T, 'scripts', 'check-run-productivity.mjs')], {
    cwd: T, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PRODUCTIVITY_LOG_DIR: dir, PRODUCTIVITY_NOW: '2026-11-10T08:00:00' },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  if (/No dead window/.test(out)) f.push('says "No dead window" after a pre-flight abort');
  if (!/DEAD NIGHT/.test(out)) f.push('does not say DEAD NIGHT after a pre-flight abort');
  if (r.status !== 1) f.push(`exits ${r.status} after a dead night (wanted 1)`);
  const v = read(T, 'scripts/overnight-verdict.mjs');
  const re = (v.match(/re:\s*\/(SerpAPI quota[^\n]*)\/i/) || [])[1] || '';
  let hit = false; try { hit = new RegExp(re, 'i').test('SerpAPI quota below threshold (0 < 100)') && new RegExp(re, 'i').test('SerpAPI quota too low - fewer'); } catch { /* bad regex */ }
  if (!hit) f.push("the morning verdict's blocker list does not match the pre-flight's own wording (it missed Nov 7-9)");
  return f;
});

check('11 daily health check: no daily live Maps search, and it runs this gate', (T) => {
  const f = [];
  const d = read(T, 'scripts/daily-health-check.sh');
  if (/^run_args check-no-duplicate-google-listing\.mjs --all/m.test(d)) f.push('daily-health-check.sh still spends a live Maps search per client every day');
  if (!/check-no-duplicate-google-listing\.mjs/.test(d) || !/dup-listing-weekly/.test(d)) f.push('the duplicate-listing check is not on a weekly stamp');
  if (!/check-serpapi-budget\.mjs/.test(d)) f.push('daily-health-check.sh does not run check-serpapi-budget.mjs');
  if (!/serpapi-budget\.mjs preflight/.test(d)) f.push('daily-health-check.sh does not read the account for the 80% / projection alert');
  return f;
});

check('12 parole and recovery never re-queue a lead past the reserve; exhausted leads stay out', (T) => {
  const f = [];
  const p = read(T, 'scripts/parole-permafails.mjs');
  if (!/serpapi-budget\.mjs/.test(p) || !/gate/.test(p)) f.push('parole-permafails.mjs does not check the reserve before it re-queues leads');
  if (!/unbuildable-leads\.tsv/.test(p)) f.push('parole-permafails.mjs can re-queue a lead already proven unbuildable');
  const pipe = read(T, 'scripts/overnight-pipeline.sh');
  if (!/EXHAUSTED: \$biz failed/.test(pipe)) f.push('the 3-attempt EXHAUSTED rule that keeps a lead from re-arming its search is gone');
  return f;
});

// -- the website half: ONE shared reserve constant, and a daily cap on the free-audit form's searches. Optional until the website branch
// -- is merged (the file will not exist yet on the old site), so it skips - loudly - rather than failing a merge-order mistake.
const SITE = (argv.find((a) => a.startsWith('--site=')) || '').slice(7) || process.env.APPROVAL_ARCHIVE_SITE_DIR || '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
check('13 website: one shared SerpAPI reserve, and a daily cap on the free-audit form (skips until merged)', (T) => {
  const fn = path.join(SITE, 'netlify', 'functions');
  if (!fs.existsSync(path.join(fn, '_serpapi-reserve.js'))) { console.log(`     (13 skipped: ${fn}/_serpapi-reserve.js is not there yet - merge the website branch, or pass --site=<worktree>)`); return []; }
  const f = [];
  const R = createRequire(import.meta.url)(path.join(fn, '_serpapi-reserve.js')).SERPAPI_RESERVE;
  if (!(R > 0)) f.push('the shared SERPAPI_RESERVE is not a positive number');
  for (const file of ['_rank-schedule', '_citation-build', '_citation-recheck', '_citation-runbook', '_citation-brand-discovery']) {
    const src = fs.readFileSync(path.join(fn, `${file}.js`), 'utf8');
    if (!/require\(["']\.\/_serpapi-reserve["']\)/.test(src)) f.push(`${file}.js does not use the shared reserve`);
    if (/\b(?:RESERVE_SEARCHES|SEARCH_RESERVE|RESERVE)\s*=\s*\d+/.test(src)) f.push(`${file}.js still hardcodes its own reserve number`);
  }
  const cap = createRequire(import.meta.url)(path.join(fn, '_fga-serp-cap.js'));
  const env = { SERPAPI_KEY: 'k', AIRTABLE_API_KEY: 'a', AIRTABLE_BASE_ID: 'b' };
  const mk = (n, ok = true) => async () => ({ ok, json: async () => ({ records: Array.from({ length: n }, () => ({})) }) });
  const run = async (o) => cap.serpKeyForToday(o);
  return Promise.all([run({ env, fetch: mk(2) }), run({ env, fetch: mk(7) }), run({ env, fetch: mk(7, false) }), run({ env: { ...env, FGA_DAILY_SUBMISSION_CAP: '0' }, fetch: mk(99) }), run({ env, fetch: async () => { throw new Error('x'); } })]).then(([under, over, refused, off, threw]) => {
    if (under !== 'k') f.push('under the daily cap the form lost its search key');
    if (over !== '') f.push('past the daily cap the form still searches');
    if (refused !== 'k' || threw !== 'k') f.push('an Airtable failure broke the form (the cap must fail OPEN)');
    if (off !== 'k') f.push('FGA_DAILY_SUBMISSION_CAP=0 does not turn the cap off');
    const enrich = fs.readFileSync(path.join(fn, '_fga-enrichment.js'), 'utf8');
    if (!/serpKeyForToday\(\)/.test(enrich) || /runGeoGrid\(process\.env\.SERPAPI_KEY/.test(enrich) || /runKeywordRankMatrix\(process\.env\.SERPAPI_KEY/.test(enrich)) f.push('_fga-enrichment.js does not run its searches through the daily cap');
    return f;
  });
}, { afterOnly: true });

// ----------------------------------------------------------------------------------------------------------------------
async function runAll(T, label) {
  const out = [];
  for (const c of CHECKS) {
    if (c.afterOnly && T !== AFTER) continue; // judged on the current code only (no before-state exists for it)
    let fails;
    try { fails = await c.fn(T); } catch (e) { fails = [`threw: ${e.message}`]; }
    out.push({ name: c.name, fails });
    if (VERBOSE || label === 'AFTER') console.log(`  ${fails.length ? 'X' : 'ok'}  ${c.name}${fails.length ? '\n      - ' + fails.join('\n      - ') : ''}`);
  }
  return out;
}

console.log('--- AFTER: the code in this repo (every check must pass) ---');
const after = await runAll(AFTER, 'AFTER');
const afterFails = after.filter((x) => x.fails.length);

console.log(`\n--- LIVE_BEFORE: the code at ${AGAINST} (the checks MUST fail here) ---`);
const BEFORE = buildBefore();
const before = await runAll(BEFORE, 'BEFORE');
const beforeFailed = before.filter((x) => x.fails.length);
for (const b of before) { const keep = CHECKS.find((c) => c.name === b.name)?.keepsPassing; console.log(`  ${b.fails.length ? 'fails (good)' : keep ? 'holds (an existing guard that must keep holding)' : 'PASSES (no proof)'}  ${b.name}`); }

if (beforeFailed.length < MIN_BEFORE_FAILS) {
  indeterminate(`LIVE_BEFORE failed only ${beforeFailed.length} of ${CHECKS.length} checks (need >= ${MIN_BEFORE_FAILS}): this gate has not proved it can fail`);
}
if (afterFails.length) {
  console.error(`\nFAIL: ${afterFails.length} SerpAPI budget guard(s) regressed in this repo.`);
  process.exit(1);
}
console.log(`\nPASS: all ${CHECKS.length} guards hold; ${CHECKS.length - 1} of them also run on ${AGAINST} and fail ${beforeFailed.length} ways there on ${AGAINST}, so the gate can fail.`);
process.exit(0);
