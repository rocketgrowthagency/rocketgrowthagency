// lib/serpapi-memory.cjs
// What we already asked SerpAPI, so the same question is never paid for twice (2026-11-10).
//
//   EMAIL SEARCH MEMORY  "searched, no email found" per business, 90 days, across nights and runs.
//                        Keyed by a stable id: Google place id, else the website host, else name+city.
//                        ONLY a completed search that found nothing is remembered. A search that was
//                        stopped (budget / quota / rate limit) or errored is NEVER recorded - that is
//                        "not searched", and it must be asked again.
//   REVIEWS-BY-PLACE     the step-2.5 "reviews by Google CID" lookup, 30 days, "no place" included.
//
// Plain functions with injectable dir + clock so the gate tests them with fakes.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EMAIL_TTL_DAYS = 90;
const REVIEWS_TTL_DAYS = 30;
const DAY = 86400000;

function cacheDir() { return process.env.SERPAPI_MEMORY_DIR || path.join(ROOT, 'output', '.cache'); }
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Stable id for a business. Place id is best (survives renames); the host is next (survives a different
// search term); name+city is the last resort.
function emailKey({ placeId, host, name, city } = {}) {
  const pid = String(placeId || '').trim();
  if (pid) return `place:${pid}`;
  const h = String(host || '').toLowerCase().replace(/^www\./, '').trim();
  if (h) return `host:${h}`;
  const n = slug(name);
  return n ? `name:${n}|${slug(city)}` : '';
}

function _read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function _write(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function emailMemoryFile() { return path.join(cacheDir(), 'email-search-memory.json'); }
function recentNoEmail(key, now) {
  if (!key) return null;
  const e = _read(emailMemoryFile())[key];
  if (!e || e.status !== 'none') return null;
  const age = ((now ? new Date(now).getTime() : Date.now()) - Date.parse(e.at)) / DAY;
  return age >= 0 && age < EMAIL_TTL_DAYS ? { ...e, ageDays: age } : null;
}
function recordNoEmail(key, info, now) {
  if (!key) return false;
  try {
    const f = emailMemoryFile();
    const m = _read(f);
    m[key] = { status: 'none', at: (now ? new Date(now) : new Date()).toISOString(), ...(info || {}) };
    _write(f, m);
    return true;
  } catch { return false; }
}
// A later success (an email found, or a human added one) clears the memory for that business.
function forgetNoEmail(key) {
  if (!key) return;
  try { const f = emailMemoryFile(); const m = _read(f); if (key in m) { delete m[key]; _write(f, m); } } catch { /* best-effort */ }
}

function reviewsFile() { return path.join(cacheDir(), 'reviews-by-place.json'); }
function getReviews(cid, now) {
  if (!cid) return null;
  const e = _read(reviewsFile())[cid];
  if (!e) return null;
  const age = ((now ? new Date(now).getTime() : Date.now()) - Date.parse(e.at)) / DAY;
  return age >= 0 && age < REVIEWS_TTL_DAYS ? e : null;
}
// result: { gotPlace: bool, reviews: number|null, title: string } - only a COMPLETED lookup is stored.
function putReviews(cid, result, now) {
  if (!cid) return false;
  try {
    const f = reviewsFile();
    const m = _read(f);
    m[cid] = { at: (now ? new Date(now) : new Date()).toISOString(), gotPlace: !!result.gotPlace, reviews: Number.isFinite(result.reviews) ? result.reviews : null, title: result.title || '' };
    _write(f, m);
    return true;
  } catch { return false; }
}

module.exports = { EMAIL_TTL_DAYS, REVIEWS_TTL_DAYS, cacheDir, emailKey, recentNoEmail, recordNoEmail, forgetNoEmail, getReviews, putReviews };
