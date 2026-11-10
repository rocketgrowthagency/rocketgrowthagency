// lib/serpapi-budget.cjs
// The SerpAPI METER + BUDGET for the scraper repo (2026-11-10, after Nov 7-9 ran on an empty quota
// and reported "No dead window"). Everything here is plain functions with injectable paths / clock /
// http so scripts/check-serpapi-budget.mjs can test it with fakes and never spend a real search.
//
//   LEDGER   output/serpapi-ledger/YYYY-MM.jsonl  one line per call: time, consumer, kind, ref, outcome.
//            Never stores the URL or the key.
//   STATE    output/serpapi-state.json            the last free account.json read (remaining, plan, renewal).
//   RESERVE  250 searches are for paying-client work (map scans, listing checks, the free-audit form).
//            The pipeline never spends below it. Everything else only ALERTS: a normal night is never stopped
//            while remaining >= reserve.
//
// Memory: project_serpapi_budget.md

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// A worktree lives under <repo>/.claude/worktrees/<name>; the SIBLING Website repo is relative to the real repo.
const REPO_ROOT = ROOT.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`) ? ROOT.split(`${path.sep}.claude${path.sep}worktrees${path.sep}`)[0] : ROOT;
const RESERVE_DEFAULT = 250;
const ALERT_PCT = 0.8;
const STATE_MAX_AGE_MS = 48 * 3600 * 1000;

function reserve() {
  const n = Number(process.env.SERPAPI_RESERVE);
  return Number.isFinite(n) && n >= 0 && process.env.SERPAPI_RESERVE !== undefined && process.env.SERPAPI_RESERVE !== '' ? n : RESERVE_DEFAULT;
}
function ledgerDir() { return process.env.SERPAPI_LEDGER_DIR || path.join(ROOT, 'output', 'serpapi-ledger'); }
function statePath() { return process.env.SERPAPI_STATE_FILE || path.join(ROOT, 'output', 'serpapi-state.json'); }
function alertDir() {
  return process.env.SERPAPI_ALERT_DIR
    || path.join(path.dirname(REPO_ROOT), 'Rocket Growth Agency Website VS Code', 'reports', 'alerts');
}
function monthKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

// What kind of search is this URL? (never logs the URL itself - it carries the key)
function kindOf(url) {
  const u = String(url || '');
  const engine = (u.match(/[?&]engine=([a-z_]+)/) || [])[1] || 'google';
  if (engine === 'google_maps') return /[?&]type=place/.test(u) ? 'maps-place' : 'maps-search';
  if (engine === 'google') return 'web';
  return engine;
}

function appendLedger(entry, now) {
  try {
    const t = now ? new Date(now) : new Date();
    const dir = ledgerDir();
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: t.toISOString(), ...entry }) + '\n';
    fs.appendFileSync(path.join(dir, `${monthKey(t)}.jsonl`), line);
    return true;
  } catch (e) { return false; }
}

function readLedger(sinceMs, now) {
  const out = [];
  const t = now ? new Date(now) : new Date();
  const files = new Set([monthKey(t)]);
  if (sinceMs) files.add(monthKey(new Date(sinceMs)));
  for (const k of files) {
    let txt = '';
    try { txt = fs.readFileSync(path.join(ledgerDir(), `${k}.jsonl`), 'utf8'); } catch { continue; }
    for (const l of txt.split('\n')) {
      if (!l.trim()) continue;
      try { const e = JSON.parse(l); if (!sinceMs || Date.parse(e.ts) >= sinceMs) out.push(e); } catch { /* skip a torn line */ }
    }
  }
  return out;
}

function readState(now) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    const at = Date.parse(s.snapshotAt);
    if (!Number.isFinite(at)) return null;
    const age = (now ? new Date(now).getTime() : Date.now()) - at;
    if (age > STATE_MAX_AGE_MS) return null; // stale snapshot: enforce nothing rather than something wrong
    return s;
  } catch { return null; }
}
function writeState(s) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(s, null, 2) + '\n');
    return true;
  } catch { return false; }
}

// Remaining searches = the last free account.json read minus every call the ledger counted since.
// null when we have no fresh snapshot - the wrapper then enforces nothing (it never guesses a stop).
function estimateRemaining(now) {
  const s = readState(now);
  if (!s || !Number.isFinite(Number(s.remaining))) return null;
  const since = Date.parse(s.snapshotAt);
  const spent = readLedger(since, now).filter((e) => e.counted && Date.parse(e.ts) >= since).length;
  return Math.max(0, Number(s.remaining) - spent);
}

// May this consumer spend one more search? Client work is exempt from the reserve (that is what it is for).
function checkBudget(opts = {}) {
  const rem = estimateRemaining(opts.now);
  const res = reserve();
  if (rem === null) return { ok: true, remaining: null, reserve: res, known: false };
  if (opts.clientWork) return { ok: rem > 0, remaining: rem, reserve: res, known: true };
  return { ok: rem > res, remaining: rem, reserve: res, known: true };
}

// The free account endpoint (account.json costs nothing). `get` is injectable for tests.
async function fetchAccount(apiKey, get) {
  // SERPAPI_ACCOUNT_FIXTURE is for scripts/check-serpapi-budget.mjs only (a JSON file shaped like account.json). Never set by cron.
  if (process.env.SERPAPI_ACCOUNT_FIXTURE) {
    try {
      const d = JSON.parse(fs.readFileSync(process.env.SERPAPI_ACCOUNT_FIXTURE, 'utf8'));
      return { remaining: Number(d.total_searches_left), perMonth: Number(d.searches_per_month) || null, usage: Number.isFinite(Number(d.this_month_usage)) ? Number(d.this_month_usage) : null, plan: d.plan_name || 'fixture', renewal: d.plan_renewal_date || null };
    } catch { return null; }
  }
  if (!apiKey) return null;
  const http = get || require('axios').get;
  try {
    const r = await http(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`, { timeout: 10000, validateStatus: () => true });
    if (!r || r.status >= 400 || !r.data) return null;
    const d = r.data;
    const left = d.total_searches_left;
    if (!Number.isFinite(Number(left))) return null;
    return {
      remaining: Number(left),
      perMonth: Number(d.searches_per_month) || null,
      usage: Number.isFinite(Number(d.this_month_usage)) ? Number(d.this_month_usage) : null,
      plan: d.plan_name || d.plan_id || '?',
      renewal: d.plan_renewal_date || d.next_billing_date || null,
    };
  } catch { return null; }
}

// Pacing. Never stops a night by itself: it only says how the month looks.
//   level: 'below-reserve' (the only one that stops the pipeline) | 'projected-out' | 'warn-80' | 'ok'
function paceVerdict(a, now) {
  const res = reserve();
  const t = now ? new Date(now) : new Date();
  const remaining = Number(a.remaining);
  const out = { level: 'ok', remaining, reserve: res, reasons: [] };
  if (!Number.isFinite(remaining)) { out.level = 'unknown'; return out; }
  const perMonth = Number(a.perMonth) || null;
  const used = Number.isFinite(Number(a.usage)) ? Number(a.usage) : (perMonth ? perMonth - remaining : null);
  out.usedPct = perMonth && used !== null ? used / perMonth : null;
  let daysLeft = null;
  if (a.renewal) {
    const r = Date.parse(String(a.renewal) + (String(a.renewal).length <= 10 ? 'T00:00:00' : ''));
    if (Number.isFinite(r)) daysLeft = Math.max(1, Math.ceil((r - t.getTime()) / 86400000));
  }
  out.daysLeft = daysLeft;
  // average spend per day this cycle, from the cycle start (renewal - 30 days) when we know the renewal
  // The first 3 days of a cycle are too few to project from (one map scan would read as a runaway).
  if (daysLeft !== null && used !== null && 30 - daysLeft >= 3) {
    const elapsed = 30 - daysLeft;
    out.perDay = used / elapsed;
    out.projectedNeed = Math.round(out.perDay * daysLeft);
    out.usableBeforeReset = Math.max(0, remaining - res);
    if (out.projectedNeed > out.usableBeforeReset) {
      out.level = 'projected-out';
      out.reasons.push(`at ${out.perDay.toFixed(1)}/day the ${daysLeft} days to the reset need about ${out.projectedNeed}, and only ${out.usableBeforeReset} are usable above the ${res} reserve`);
    }
  }
  if (out.usedPct !== null && out.usedPct >= ALERT_PCT) {
    if (out.level === 'ok') out.level = 'warn-80';
    out.reasons.push(`${Math.round(out.usedPct * 100)}% of the month's searches are used`);
  }
  if (remaining < res) {
    out.level = 'below-reserve';
    out.reasons.unshift(`only ${remaining} searches left, under the ${res} kept for client work`);
  }
  return out;
}

// ---- alerts: the existing path (a .md in reports/alerts + its _raised.json line), a macOS notification, ----
// ---- and the same SKIPPED-NIGHTS.log line overnight-local.sh writes. -------------------------------------
const ALERT_NAME = 'SERPAPI-BUDGET-ALERT.md';
function raiseAlert(title, lines, opts = {}) {
  const dir = opts.dir || alertDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const led = path.join(dir, '_raised.json');
    let l = {};
    try { l = JSON.parse(fs.readFileSync(led, 'utf8')); } catch { l = {}; }
    if (!l[ALERT_NAME]) l[ALERT_NAME] = { raised: new Date().toISOString().slice(0, 10), by: 'serpapi-budget.mjs' };
    fs.writeFileSync(led, JSON.stringify(l, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, ALERT_NAME),
      `# ${title}\n\n${lines.map((x) => `- ${x}`).join('\n')}\n\n` +
      `Raised ${new Date().toISOString()}. The search meter is output/serpapi-ledger/ in the Scraper repo.\n` +
      `(This file clears itself when the budget is healthy again.)\n`);
  } catch (e) { /* best-effort: the log line below still lands */ }
  if (!opts.noNotify) {
    try {
      // SERPAPI_ALERT_DIR is set only by tests: their skip-log line must never land in the real output/SKIPPED-NIGHTS.log.
      const skipLog = opts.skipLog || process.env.SERPAPI_SKIP_LOG
        || (process.env.SERPAPI_ALERT_DIR ? path.join(process.env.SERPAPI_ALERT_DIR, 'SKIPPED-NIGHTS.log') : path.join(REPO_ROOT, 'output', 'SKIPPED-NIGHTS.log'));
      fs.mkdirSync(path.dirname(skipLog), { recursive: true });
      fs.appendFileSync(skipLog, `${new Date().toISOString().slice(0, 16).replace('T', ' ')} - SERPAPI: ${title}\n`);
    } catch { /* best-effort */ }
    if (!process.env.SERPAPI_NO_NOTIFY && process.platform === 'darwin') {
      try {
        require('child_process').execFileSync('osascript', ['-e', `display notification ${JSON.stringify(title)} with title "RGA SerpAPI"`], { timeout: 5000, stdio: 'ignore' });
      } catch { /* best-effort */ }
    }
  }
  return path.join(dir, ALERT_NAME);
}
function clearAlert(opts = {}) {
  const dir = opts.dir || alertDir();
  try {
    const f = path.join(dir, ALERT_NAME);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    const led = path.join(dir, '_raised.json');
    const l = JSON.parse(fs.readFileSync(led, 'utf8'));
    if (ALERT_NAME in l) { delete l[ALERT_NAME]; fs.writeFileSync(led, JSON.stringify(l, null, 2) + '\n'); }
  } catch { /* nothing to clear */ }
}

module.exports = {
  RESERVE_DEFAULT, ALERT_PCT, ALERT_NAME,
  reserve, ledgerDir, statePath, alertDir, monthKey, kindOf,
  appendLedger, readLedger, readState, writeState, estimateRemaining, checkBudget,
  fetchAccount, paceVerdict, raiseAlert, clearAlert,
};
