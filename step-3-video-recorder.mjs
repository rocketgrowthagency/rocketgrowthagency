import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import csvParser from 'csv-parser';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import slugify from 'slugify';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');
const VIDEOS_ROOT = path.join(process.cwd(), 'output', 'Step 3 (Video Recorder - Raw WebM)');
const CHROME_PROFILE_DIR = path.join(process.cwd(), 'output', 'chrome-profile-step3');
const DEBUG_DIR = path.join(process.cwd(), 'output', 'debug', 'step3');
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || '';
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MAX_VIDEOS = Number(process.env.MAX_VIDEOS || 1);
const DESKTOP_VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const MOBILE_VIEWPORT = {
  width: 390,
  height: 720,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
};
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const SCREENCAST_FPS = Number(process.env.STEP3_SCREENCAST_FPS || 30);
const SCREENSHOT_CAPTURE_INTERVAL_MS = Number(process.env.STEP3_SCREENSHOT_CAPTURE_INTERVAL_MS || 33);
const MAPS_NAV_TIMEOUT_MS = Number(process.env.MAPS_NAV_TIMEOUT_MS || 90000);
const MAPS_INPUT_TIMEOUT_MS = Number(process.env.MAPS_INPUT_TIMEOUT_MS || 25000);
const MAPS_MANUAL_CONSENT_WAIT_MS = Number(process.env.MAPS_MANUAL_CONSENT_WAIT_MS || 90000);
const WEBSITE_NAV_TIMEOUT_MS = Number(process.env.WEBSITE_NAV_TIMEOUT_MS || 60000);

const DESKTOP_MAPS_HOLD_MS = Number(process.env.DESKTOP_MAPS_HOLD_MS || 4500);
const DESKTOP_WEBSITE_INTRO_HOLD_MS = Number(process.env.DESKTOP_WEBSITE_INTRO_HOLD_MS || 7000);
const DESKTOP_WEBSITE_EXTRA_HOLD_MS = Number(process.env.DESKTOP_WEBSITE_EXTRA_HOLD_MS || 12000);
const DESKTOP_WEBSITE_SCROLL_STEPS = Number(process.env.DESKTOP_WEBSITE_SCROLL_STEPS || 7);
const DESKTOP_WEBSITE_SCROLL_DELTA_PX = Number(process.env.DESKTOP_WEBSITE_SCROLL_DELTA_PX || 720);
const DESKTOP_WEBSITE_SCROLL_WAIT_MS = Number(process.env.DESKTOP_WEBSITE_SCROLL_WAIT_MS || 1200);
const DESKTOP_WEBSITE_TAIL_DELTA_PX = Number(process.env.DESKTOP_WEBSITE_TAIL_DELTA_PX || 260);
const DESKTOP_WEBSITE_TAIL_TICK_MS = Number(process.env.DESKTOP_WEBSITE_TAIL_TICK_MS || 850);

const PLACEHOLDER_EMAIL_PATTERNS = [
  /^user@domain\.com$/i,
  /^email@domain\.com$/i,
  /^example@example\./i,
  /^example@gmail\.com$/i,
  /^you@/i,
  /^your@/i,
  /^yourname@/i,
  /^test@test\./i,
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^info@yourdomain\./i,
  /^email@example\./i,
  /@localhost$/i,
  /\.(gif|jpg|png|jpeg|svg|webp|css|js|woff|ttf)$/i,
  /@sentry\.io$/i,
  /@sentry-next\.wixpress\.com$/i,
  /@sentry\.wixpress\.com$/i,
  /@wixpress\.com$/i,
  /@wix\.com$/i,
  /@cdn\./i,
  /@static\./i,
  /@google-analytics\./i,
  /@googletagmanager\./i,
  /@facebook\.com$/i,
  /@instagram\.com$/i,
  /@twitter\.com$/i,
  /@tiktok\.com$/i,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractValidEmail(raw) {
  const candidates = String(raw || '').split(/[;,\s]/).filter((value) => value.includes('@'));
  for (const candidate of candidates) {
    const email = candidate.trim().toLowerCase().replace(/^mailto:/i, '').split('?')[0].replace(/[.,;:'")>]+$/, '');
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) continue;
    if (PLACEHOLDER_EMAIL_PATTERNS.some((pattern) => pattern.test(email))) continue;
    const local = email.split('@')[0] || '';
    if (/^[0-9a-f]{24,}$/i.test(local)) continue;
    return email;
  }
  return '';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findLatestStep2Csv() {
  if (STEP2_CSV_OVERRIDE) {
    if (!fs.existsSync(STEP2_CSV_OVERRIDE)) {
      console.error(`Step 2 CSV override not found: ${STEP2_CSV_OVERRIDE}`);
      process.exit(1);
    }
    const baseName = path.basename(STEP2_CSV_OVERRIDE).replace(/\.csv$/i, '');
    console.log(`Using Step 2 CSV override: ${STEP2_CSV_OVERRIDE}`);
    return { inputPath: STEP2_CSV_OVERRIDE, baseName };
  }

  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-2]'))
    .map((name) => {
      const fullPath = path.join(STEP2_DIR, name);
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));

  if (!files.length) {
    console.error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
    process.exit(1);
  }

  const latest = files[files.length - 1];
  const baseName = latest.name.replace(/\.csv$/i, '');

  console.log(`Using Step 2 CSV: ${latest.fullPath}`);
  return { inputPath: latest.fullPath, baseName };
}

function loadCsv(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => records.push(row))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
}

function cleanUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/^"|"$/g, '');
}

function isBlockedWebsiteUrl(url) {
  const value = cleanUrl(url);
  if (!value) return false;

  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return [
      'facebook.com',
      'fb.com',
      'instagram.com',
      'linkedin.com',
      'tiktok.com',
      'twitter.com',
      'x.com',
      'youtube.com',
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function parseRank(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWebsiteCandidates(raw) {
  const u = cleanUrl(raw);
  if (!u || isBlockedWebsiteUrl(u)) return [];

  const out = [];
  const seen = new Set();

  const push = (x) => {
    const value = String(x || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  const hasProto = /^https?:\/\//i.test(u);
  if (hasProto) push(u);

  let host = '';
  let pathPart = '';
  try {
    const parsed = new URL(hasProto ? u : `https://${u}`);
    host = parsed.hostname || '';
    pathPart = `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}` || '';
  } catch {
    const trimmed = u.replace(/^\/+/, '');
    const parts = trimmed.split('/');
    host = parts[0] || '';
    pathPart = trimmed.slice(host.length) || '';
  }

  if (!host) {
    push(u);
    return out;
  }

  const bare = host.replace(/^www\./i, '');
  const withWww = `www.${bare}`;

  push(`https://${host}${pathPart}`);
  push(`http://${host}${pathPart}`);

  if (!/^www\./i.test(host)) {
    push(`https://${withWww}${pathPart}`);
    push(`http://${withWww}${pathPart}`);
  } else {
    push(`https://${bare}${pathPart}`);
    push(`http://${bare}${pathPart}`);
  }

  if (!hasProto) push(u);
  return out;
}

async function gotoFirstWorking(page, rawUrl, label) {
  const candidates = buildWebsiteCandidates(rawUrl);
  if (!candidates.length) return null;

  let lastErr = null;
  for (const url of candidates) {
    if (isBlockedWebsiteUrl(url)) continue;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WEBSITE_NAV_TIMEOUT_MS });
      const finalUrl = page.url();
      if (isBlockedWebsiteUrl(finalUrl)) {
        console.warn(`   ⚠️ ${label} resolved to social URL; skipping: ${finalUrl}`);
        continue;
      }
      return finalUrl;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }

  if (lastErr) {
    console.warn(`   ⚠️ ${label} all variants failed for: ${rawUrl}`);
  }
  return null;
}

async function saveDebug(page, label) {
  try {
    ensureDir(DEBUG_DIR);
    const safe = slugify(String(label || 'debug'), { lower: true, strict: true }) || 'debug';
    const base = `${safe}_${Date.now()}`;
    await page.screenshot({ path: path.join(DEBUG_DIR, `${base}.png`), fullPage: true });
    fs.writeFileSync(path.join(DEBUG_DIR, `${base}.html`), await page.content(), 'utf8');
    console.log(`   🧩 Saved debug artifacts: ${path.join(DEBUG_DIR, base)}.{png,html}`);
  } catch {}
}

async function dismissResultsInfoPopup(page) {
  try {
    await page.evaluate(() => {
      const dialogs = Array.from(
        document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]')
      );
      for (const d of dialogs) {
        const text = (d.textContent || '').toLowerCase();
        if (
          text.includes('hotel and vacation rental search results') ||
          text.includes('search results may be personalized') ||
          text.includes('results may be personalized')
        ) {
          d.remove();
        }
      }
    });
  } catch {}
}

async function dismissCommonCookieBanner(page) {
  try {
    await page.evaluate(() => {
      const exactLabels = ['accept', 'agree', 'got it', 'ok', 'okay'];
      const phrasePatterns = [
        /\baccept\s+all\b/,
        /\ballow\s+all\b/,
        /\baccept\s+cookies\b/,
        /\bagree\s+and\s+continue\b/,
        /\bi\s+agree\b/,
      ];
      const forbiddenPattern =
        /\b(book|booking|schedule|appointment|quote|call|facebook|instagram|linkedin|youtube|sign in|log in)\b/;
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));

      for (const button of buttons) {
        const text = (
          button.innerText ||
          button.textContent ||
          button.getAttribute('aria-label') ||
          button.getAttribute('value') ||
          ''
        )
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

        if (!text) continue;
        if (forbiddenPattern.test(text)) continue;
        if (exactLabels.includes(text) || phrasePatterns.some((pattern) => pattern.test(text))) {
          button.click();
          return true;
        }
      }

      return false;
    });
    await sleep(700);
  } catch {}
}

async function waitForMapsSearchInput(page) {
  const selector =
    'input#searchboxinput, input[aria-label="Search Google Maps"], input[name="q"][role="combobox"]';
  try {
    await page.waitForSelector(selector, { visible: true, timeout: MAPS_INPUT_TIMEOUT_MS });
    return selector;
  } catch {
    console.warn(
      '   ⚠️ Google Maps search input did not appear. If a consent screen is visible, accept it in Chrome now.'
    );
    await page.waitForSelector(selector, { visible: true, timeout: MAPS_MANUAL_CONSENT_WAIT_MS });
    return selector;
  }
}

async function clearAndType(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value, { delay: 45 });
}

async function waitForMapsResults(page) {
  await page.waitForFunction(
    () => {
      const feed = document.querySelector('div[role="feed"]');
      const cards = document.querySelectorAll('div.Nv2PK, a[href*="/maps/place/"]');
      const detailTitle = document.querySelector('.DUwDvf, h1 span');
      return Boolean(feed || cards.length || detailTitle);
    },
    { timeout: MAPS_NAV_TIMEOUT_MS }
  );
}

async function scrollMapsResultsPanel(page, times = 2) {
  for (let i = 0; i < times; i++) {
    const did = await page.evaluate(() => {
      const candidates = [
        document.querySelector('div[role="feed"]'),
        document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd'),
        document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf'),
        document.querySelector('div[aria-label*="Results"]'),
      ].filter(Boolean);

      const scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 50);
      if (!scroller) return false;

      const before = scroller.scrollTop;
      scroller.scrollBy(0, Math.max(600, Math.floor(scroller.clientHeight * 0.8)));
      return scroller.scrollTop !== before;
    });

    await sleep(1000);
    if (!did) break;
  }
}

// Scroll the Maps results panel one step at a time, clicking the target business
// as soon as it enters the DOM. This avoids the virtual-DOM problem where
// over-scrolling removes rank-N items before the click fires.
// Scroll the Maps results panel one step at a time, navigating directly to the
// target listing's URL as soon as it enters the DOM. Uses href navigation (not
// mouse click) to avoid virtual-DOM re-render staleness.
async function scrollUntilVisibleAndClick(page, businessName, maxScrolls) {
  if (!businessName) return false;

  // Check before any scrolling
  let navigated = await clickListingInResultsByName(page, businessName);
  if (navigated) return true;

  for (let i = 0; i < maxScrolls; i++) {
    const moved = await page.evaluate(() => {
      const candidates = [
        document.querySelector('div[role="feed"]'),
        document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd'),
        document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf'),
        document.querySelector('div[aria-label*="Results"]'),
      ].filter(Boolean);
      const scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 50);
      if (!scroller) return false;
      const before = scroller.scrollTop;
      scroller.scrollBy(0, Math.max(600, Math.floor(scroller.clientHeight * 0.8)));
      return scroller.scrollTop !== before;
    });

    await sleep(1000);
    if (!moved) break;

    navigated = await clickListingInResultsByName(page, businessName);
    if (navigated) return true;
  }

  return false;
}

// Geocode a street address using Nominatim (free, no API key).
// Returns { lat, lng } or null on failure.
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=us`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'RGA-scraper/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// Extract a Google Maps URL from Google Search's Knowledge Panel.
// Google Search reliably returns a full /maps/place/Name/@lat,lng/data=... URL
// for local businesses — bypasses Maps search viewport bias entirely.
async function getMapsUrlFromGoogleSearch(page, businessName, address) {
  try {
    const q = encodeURIComponent(businessName + (address ? ' ' + address : ''));
    await page.goto(`https://www.google.com/search?q=${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    const mapsUrl = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = a.href || '';
        if (href.includes('google.com/maps/place/') && href.includes('@')) return href;
        if (href.includes('maps.google.com/maps/place/') && href.includes('@')) return href;
      }
      // Also check for maps redirect links
      for (const a of anchors) {
        const href = a.href || '';
        if ((href.includes('google.com/maps') || href.includes('maps.google.com')) && href.includes('/place/')) return href;
      }
      return null;
    });
    return mapsUrl || null;
  } catch {
    return null;
  }
}

// Score all listing anchors in the current Maps results DOM against a target name.
// Returns the href of the best match (score >= minScore), or null.
// Navigation via href is more reliable than mouse clicks because Maps' virtual DOM
// re-renders between getBoundingClientRect() and page.mouse.click(), causing misses.
async function getListingHrefByName(page, businessName, minScore = 24) {
  const target = normalizeText(businessName);
  const result = await page.evaluate((targetNorm, minScoreVal) => {
    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isSponsoredBlock = (el) => {
      const t = (el.innerText || '').toLowerCase();
      return t.includes('\nsponsored') || t.includes('sponsored\n') || t.startsWith('sponsored');
    };

    const anchors = Array.from(
      document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]')
    ).filter((a) => a.href && a.href.includes('/maps/place/'));

    if (!anchors.length) return { href: null, debug: [], topScore: 0 };
    if (!targetNorm) return { href: anchors[0].href, debug: [], topScore: 0 };

    const scored = [];
    for (const anchor of anchors) {
      const cardRoot = anchor.closest('div[role="article"], div.Nv2PK') || anchor.parentElement || anchor;
      if (cardRoot && isSponsoredBlock(cardRoot)) continue;

      const aria = norm(anchor.getAttribute('aria-label') || '');
      const title = norm(
        cardRoot?.querySelector?.('.fontHeadlineSmall, .qBF1Pd, div[role="heading"], h3')?.textContent || ''
      );
      const firstLine = norm((cardRoot?.innerText || anchor.innerText || '').split('\n')[0] || '');

      const pool = [aria, title, firstLine].filter(Boolean);
      let best = 0;
      for (const c of pool) {
        if (c === targetNorm) best = Math.max(best, 100);
        else if (c.includes(targetNorm) || targetNorm.includes(c)) best = Math.max(best, 75);
        else {
          const hits = targetNorm.split(' ').filter((p) => p.length >= 4 && c.includes(p)).length;
          best = Math.max(best, hits * 12);
        }
      }
      const label = aria || title || firstLine || anchor.href.replace(/.*\/maps\/place\//, '').split('/')[0];
      if (best > 0) scored.push({ href: anchor.href, best, label });
    }

    scored.sort((a, b) => b.best - a.best);
    const top = scored[0];
    const debug = scored.slice(0, 5).map((s) => `${s.best}:"${s.label.slice(0, 40)}"`);
    if (!top) return { href: null, debug, topScore: 0 };
    return { href: top.best >= minScoreVal ? top.href : null, debug, topScore: top.best };
  }, target, minScore);
  console.log(`   [maps-score] target="${businessName}" min=${minScore} topScore=${result.topScore} → ${result.href ? 'MATCH' : 'no match'} | top5: ${result.debug.join(', ')}`);
  return result.href;
}

async function clickListingInResultsByName(page, businessName) {
  const href = await getListingHrefByName(page, businessName, 45);
  if (!href) return false;

  // Pre-navigation hold: center the prospect's card in the results panel and
  // sleep so the recording captures them in the competitive list with their
  // rank context visible. Critical for deep-rank leads (#11+) where the card
  // would otherwise never appear in the recorded video.
  // 2026-05-18 — added after XP Garage & Gate Experts (#35) review.
  // 2026-05-18 (rev2) — switched from href-match to name-match in card text
  // because Maps DOM re-renders the href subtly between getListingHrefByName
  // and this call, causing the lookup to silently miss the card.
  try {
    const centered = await page.evaluate((targetName) => {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const target = norm(targetName);
      // Find candidate cards in the results panel
      const cards = Array.from(document.querySelectorAll('div[role="article"], div.Nv2PK'));
      let match = null;
      for (const card of cards) {
        const text = norm(card.innerText || '');
        if (text.includes(target) || target.split(' ').filter((w) => w.length >= 4).every((w) => text.includes(w))) {
          match = card;
          break;
        }
      }
      if (!match) return false;
      // Highlight the card so it pops in the recording
      match.style.outline = '4px solid #2f57eb';
      match.style.outlineOffset = '2px';
      match.style.transition = 'outline 0.3s ease-in-out';
      match.style.boxShadow = '0 0 0 6px rgba(47,87,235,0.25)';
      match.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => {
        match.style.outline = '';
        match.style.outlineOffset = '';
        match.style.boxShadow = '';
      }, 4500);
      return true;
    }, businessName);
    if (centered) {
      await sleep(4000); // recording captures the card centered + highlighted
    } else {
      console.warn(`   ⚠️ pre-click center: no card matched "${businessName}" in DOM (proceeding to nav)`);
    }
  } catch (err) {
    // Non-fatal — proceed to navigation even if the centering hold failed
    console.warn(`   ⚠️ pre-click center failed (non-fatal): ${err.message || err}`);
  }

  // 2026-05-19 rev5: page.goto(href) was being ignored by Maps' SPA when
  // navigating from a TYPED-NAME search results panel (e.g. Beverly Hills
  // Roofing Contractors). Recording captured the results-panel view for
  // the entire 18s detail hold. Fix: use a real DOM click on the <a> element
  // (Maps' SPA handles this), fallback to page.goto only if anchor not found.
  // Then wait for the detail-page H1 selector to confirm navigation completed.
  let clickedViaDom = false;
  try {
    clickedViaDom = await page.evaluate((targetHref) => {
      const anchors = Array.from(document.querySelectorAll('a.hfpxzc'));
      const exact = anchors.find((a) => a.href === targetHref);
      const anchor = exact || anchors.find((a) => a.href && a.href.startsWith(targetHref.split('?')[0]));
      if (anchor) { anchor.click(); return true; }
      return false;
    }, href);
  } catch (_) { /* fall through */ }
  if (!clickedViaDom) {
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
  }
  // Wait for the detail-page heading to appear (up to 8s). Maps' SPA may
  // animate the transition; without this wait, the 18s detail-hold can
  // start while we're still visually on the results panel.
  await page.waitForFunction(
    () => !!document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]'),
    { timeout: 8000 },
  ).catch(() => {
    console.warn('   ⚠️ detail-page h1 not detected within 8s — proceeding');
  });
  return true;
}

async function extractWebsiteFromMapsCard(page) {
  try {
    return cleanUrl(
      await page.evaluate(() => {
        const pick = (href) => {
          if (!href) return '';
          let h = String(href);
          if (h.includes('google.com/url?')) {
            try {
              const u = new URL(h);
              h = u.searchParams.get('q') || u.searchParams.get('url') || h;
            } catch {}
          }
          return h;
        };

        const selectors = [
          'a[data-item-id="authority"]',
          'a[aria-label^="Website"]',
          'a[aria-label*="Website"]',
        ];

        for (const selector of selectors) {
          const a = document.querySelector(selector);
          const href = pick(a?.href || '');
          if (/^https?:\/\//i.test(href)) return href;
        }

        const links = Array.from(document.querySelectorAll('a[href^="http"]'))
          .map((a) => pick(a.href))
          .filter(Boolean);

        for (const href of links) {
          const lower = href.toLowerCase();
          if (lower.includes('google.com') || lower.includes('g.page')) continue;
          if (/^https?:\/\//i.test(href)) return href;
        }

        return '';
      })
    );
  } catch {
    return '';
  }
}

// Inject a fixed-position rank-context overlay so EVERY Maps recording shows
// the prospect's rank prominently — even when their card never appears on
// screen (deep-rank, scroll-find failure, direct-URL navigation).
// 2026-05-18: locked after XP #35 + general deep-rank Maps visibility work.
async function injectRankOverlay(page, businessName, rank, searchTerm) {
  if (!rank) return;
  try {
    await page.evaluate((name, rankNum, term) => {
      // Install a setInterval that re-injects the overlay every 500ms if missing.
      // This survives Maps' SPA re-renders + page.goto navigations within the
      // same execution context (the interval is cleared when the page unloads).
      // Idempotent: removing & re-adding the same ID has no visual flicker.
      if (window.__rgaRankOverlayInterval) clearInterval(window.__rgaRankOverlayInterval);
      const inject = () => {
        if (!document.body) return;
        if (document.getElementById('rga-rank-overlay')) return; // already there
        const box = document.createElement('div');
        box.id = 'rga-rank-overlay';
        box.innerHTML = `
          <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:4px;">Currently ranking</div>
          <div style="font-size:34px;color:#fff;font-weight:800;line-height:1;margin-bottom:6px;">#${rankNum}</div>
          <div style="font-size:13px;color:#cbd5e1;font-weight:500;line-height:1.3;max-width:280px;">${name}</div>
          <div style="font-size:11px;color:#64748b;margin-top:6px;font-style:italic;">for "${term}"</div>
        `;
        Object.assign(box.style, {
          position: 'fixed',
          top: '78px',
          right: '20px',
          zIndex: '2147483647',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '14px 18px',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(15,23,42,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          pointerEvents: 'none',
        });
        document.body.appendChild(box);
      };
      inject(); // immediate
      window.__rgaRankOverlayInterval = setInterval(inject, 500); // resilient
      // Also re-inject on every navigation (the interval covers this too but
      // explicit DOMContentLoaded hook is a belt for fast nav cases).
      window.__rgaRankOverlayParams = { name, rankNum, term };
    }, businessName, String(rank), searchTerm);
  } catch (err) {
    console.warn(`   ⚠️ rank overlay inject failed (non-fatal): ${err.message || err}`);
  }
}

// After direct-URL navigation to a business's Maps detail page (used for
// deep-rank or scroll-find-failure cases), scroll the left panel to TOP so
// the business name + rating is the dominant visual, and outline the heading.
// 2026-05-18 rev2 — replaced scrollIntoView with explicit scrollTop=0 on the
// scrollable container because scrollIntoView was over-scrolling past the name.
async function highlightBusinessOnDetailPage(page) {
  try {
    await page.evaluate(() => {
      const heading = document.querySelector('h1.DUwDvf') || document.querySelector('h1');
      if (!heading) return false;
      // Find the scrollable left-panel container. Maps uses several class
      // variants — walk up from the heading until we find a scrollable parent.
      let scroller = heading.parentElement;
      while (scroller && scroller !== document.body) {
        const style = window.getComputedStyle(scroller);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight) {
          break;
        }
        scroller = scroller.parentElement;
      }
      // Hard-reset scroll to TOP. Re-reset every 500ms for 18s in case Maps
      // tries to auto-scroll (focus changes, ad insertions). Cleared by page
      // unload.
      const resetScroll = () => {
        if (scroller && scroller !== document.body) scroller.scrollTop = 0;
      };
      resetScroll();
      if (window.__rgaScrollLockInterval) clearInterval(window.__rgaScrollLockInterval);
      window.__rgaScrollLockInterval = setInterval(resetScroll, 500);
      setTimeout(() => {
        if (window.__rgaScrollLockInterval) clearInterval(window.__rgaScrollLockInterval);
      }, 18000);
      // GUARDRAIL: No outline / border / box-shadow on the heading element.
      // The rank overlay top-right + the panel pinned to top is enough.
      // Chris locked this 2026-05-18. See feedback_maps_card_visibility_rules.md
      // Rule 5. If you add `heading.style.outline = ...` here, REVERT IT.
      if (heading.style.outline || heading.style.boxShadow || heading.style.border) {
        console.warn('[step-3 GUARDRAIL] heading has decoration — should be clean per Rule 5');
      }
      return true;
    });
  } catch (err) {
    console.warn(`   ⚠️ detail-page highlight failed (non-fatal): ${err.message || err}`);
  }
}

async function goToMapsShowResultsThenOpenBusiness(page, meta, afterMapsNavigation) {
  const searchTerm = (meta.searchTerm || '').trim();
  const businessName = (meta.name || '').trim();
  const mapsUrl = (meta.mapsUrl || '').trim();
  const rank = Number.isFinite(meta.rank) ? meta.rank : null;
  const query = searchTerm || businessName;

  if (!query && !mapsUrl) return 'none';

  // ============================================================
  // HARD GUARDRAILS for Maps card visibility (Rules 1-6).
  // Reference: feedback_maps_card_visibility_rules.md
  //
  // 2026-05-19 rev4: revert to skipScrollAttempt = (rank > 10) but FIX the
  // direct-URL path that handles deep-rank leads. Earlier revs failed
  // because:
  //   - rev1 (/maps/place/<Name>/@lat,lng,17z): Maps redirected to
  //     /place//@coords when name didn't resolve uniquely.
  //   - rev2 (/maps/search/<Name>/@lat,lng,17z): same — @lat,lng anchor
  //     triggered the redirect-to-place behavior.
  //   - rev3 (scroll-find for all ranks): scroll-find searches the
  //     ORIGINAL search-term results (e.g. "Roofers in Santa Monica, CA").
  //     Deep-rank leads located outside that geographic area don't appear
  //     in those results at all. Caught when Beverly Hills Roofing
  //     Contractors (located in Beverly Hills) didn't appear in any of
  //     the 15 scrolls of "Roofers in Santa Monica, CA" results.
  //
  // rev4 strategy: deep-rank leads navigate to a SECOND search query —
  // the LEAD'S OWN NAME + city (e.g. /maps/search/Beverly+Hills+Roofing+
  // Contractors,+Beverly+Hills+CA). NO @lat,lng anchor. Maps either:
  //   - Lands on detail page (unique name) → 18s hold
  //   - Shows results panel with prospect at top → click first listing
  // The original search-term results-panel is still shown for 4s before
  // this nav, giving competitive context per the daily-cycle rule.
  // ============================================================
  const DEEP_RANK_THRESHOLD = 10;
  if (DEEP_RANK_THRESHOLD !== 10) {
    throw new Error('[step-3 GUARDRAIL] DEEP_RANK_THRESHOLD must stay at 10. See feedback_maps_card_visibility_rules.md');
  }
  const skipScrollAttempt = rank !== null && rank > DEEP_RANK_THRESHOLD;

  // Scroll enough panels to expose the business at its actual rank position.
  // Each scroll reveals ~5 listings; add 2 extra as buffer.
  const scrollsNeeded = rank !== null ? Math.ceil(rank / 5) + 2 : 4;

  try {
    console.log('   → Google Maps segment');
    const initialMapsUrl = query
      ? `https://www.google.com/maps/search/${encodeURIComponent(query)}`
      : 'https://www.google.com/maps';

    await page.goto(initialMapsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: MAPS_NAV_TIMEOUT_MS,
    });
    if (afterMapsNavigation) await afterMapsNavigation();

    // Inject rank-context overlay IMMEDIATELY after recorder starts so the
    // prospect's rank is visible from frame 1 of the Maps segment, regardless
    // of how long the search/scroll/click takes. The interval inside the
    // overlay self-reinjects every 500ms, so it survives navigations and
    // Maps' SPA re-renders.
    await injectRankOverlay(page, businessName, rank, searchTerm);

    if (query) {
      await waitForMapsResults(page);
      await sleep(1500);

      const inputSelector = await waitForMapsSearchInput(page);
      console.log(`   → Maps search: ${query}`);
      await clearAndType(page, inputSelector, query);
      await page.keyboard.press('Enter');
      await waitForMapsResults(page);
      await sleep(3500);
      await dismissResultsInfoPopup(page);
    }

    if (businessName && !skipScrollAttempt) {
      console.log(`   → Scrolling to find and click ${businessName} (rank #${rank ?? '?'})...`);
      const clicked = await scrollUntilVisibleAndClick(page, businessName, scrollsNeeded + 2);
      if (clicked) {
        // Re-inject overlay after navigation (page.goto wipes the DOM)
        await injectRankOverlay(page, businessName, rank, searchTerm);
        await highlightBusinessOnDetailPage(page);
        await sleep(12000);
        await dismissResultsInfoPopup(page);
        return 'results-click';
      }
    } else if (skipScrollAttempt) {
      console.log(`   → Rank #${rank} > ${DEEP_RANK_THRESHOLD} — skipping scroll-find, going direct to Maps URL`);
    }

    // Build the most-deterministic fallback URL for deep-rank leads.
    // 2026-05-19: previous typed-search fallback worked for SOME deep-rank
    // leads but FAILED for others (Beverly Hills Roofing Contractors #23,
    // Golden Team Roofing #41, Power Roofing #45, Roofer Bros Construction
    // #55 — all stayed on results panel). Root cause: when a business name
    // matches multiple Maps entries, the typed-search resolves to a results
    // list instead of jumping to the detail page. Lat/lng disambiguates.
    // Memory: feedback_maps_card_visibility_rules.md Rule 3.5 + 3.6.
    function buildDeepRankFallbackUrl() {
      // 2026-05-19 (rev4): typed-search by NAME + CITY, NO @lat,lng anchor.
      // The @anchor triggered Maps' redirect-to-place behavior for
      // ambiguous names. Without the anchor, Maps stays on a clean search
      // results panel that the post-nav results-click can operate on.
      const nameCity = businessName + (meta.city ? ', ' + meta.city + (meta.state ? ' ' + meta.state : '') : '');
      return `https://www.google.com/maps/search/${encodeURIComponent(nameCity)}`;
    }

    if (!mapsUrl && skipScrollAttempt) {
      const fallbackUrl = buildDeepRankFallbackUrl();
      console.log(`   → No Maps URL for deep-rank lead — using fallback URL: ${fallbackUrl}`);
      console.log(`   → Holding on results panel ~4s for competitive context`);
      await sleep(4000);
      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
      await sleep(2500);
      await injectRankOverlay(page, businessName, rank, searchTerm);
      // If typed-search landed on a results list (ambiguous name), click the
      // prospect's card to navigate to their detail page. No-op if we're
      // already on a detail page.
      const navigatedFromResults = await clickListingInResultsByName(page, businessName);
      if (navigatedFromResults) {
        console.log(`   → Clicked prospect's listing in results → detail page`);
        await sleep(1500);
        await injectRankOverlay(page, businessName, rank, searchTerm);
      }
      await highlightBusinessOnDetailPage(page);
      await sleep(18000);
      await dismissResultsInfoPopup(page);
      return 'direct-url-no-mapsurl';
    }

    if (mapsUrl) {
      // Bare name URLs (/maps/place/Name+Only, no coordinates) — typed search
      // resolves OK for unique names but stays on a results list for common
      // names that match multiple entries. Lat/lng anchored URL always lands
      // on detail. Use coords-based when available; typed-search as backup.
      const isBareNameUrl = /\/maps\/place\/[^/@?]+$/.test(mapsUrl.replace(/\/$/, ''));
      const fallbackUrl = isBareNameUrl
        ? buildDeepRankFallbackUrl()
        : mapsUrl;
      // 2026-05-18: for deep-rank short-circuit OR bare-name URLs, always
      // attempt the fallback navigation. The previous behavior of "stay on
      // results list" for bare-name URLs meant deep-rank leads NEVER showed
      // their detail card. Caught reviewing XP #35.
      if (isBareNameUrl && !skipScrollAttempt) {
        // Original path: scroll-find failed AND no coordinates → scroll
        // through competitors (this only triggers for top-10 leads where
        // scroll-find should have worked; falling through is rare).
        console.log(`   → Scroll-find failed and Maps URL has no coords; showing competitive list.`);
        for (let i = 0; i < 6; i++) {
          await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]') ||
              document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd') ||
              document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf');
            if (feed) feed.scrollBy(0, 500);
          }).catch(() => {});
          await sleep(900);
        }
        await dismissResultsInfoPopup(page);
        return 'search-only';
      } else if (isBareNameUrl && skipScrollAttempt) {
        // Deep-rank lead with bare-name URL → use fallback search URL to
        // pull up the business's detail card.
        console.log(`   → Bare-name URL for deep-rank — using fallback URL: ${fallbackUrl}`);
      } else {
        console.log(`   → Results click failed; opening direct Maps URL.`);
      }
      // For deep-rank short-circuit (rank > 10): hold on the search results
      // panel for ~4s first so the viewer sees the competitive landscape
      // (top results visible with the rank overlay), THEN navigate to the
      // prospect's detail page for the remainder of the Maps segment.
      if (skipScrollAttempt) {
        console.log(`   → Holding on results panel ~4s for competitive context`);
        await sleep(4000);
      }
      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
      await sleep(2500);
      // Re-inject overlay after navigation + outline business name in detail panel
      await injectRankOverlay(page, businessName, rank, searchTerm);
      // If typed-search landed on a results list (ambiguous name), click the
      // prospect's card to navigate to their detail page. No-op if we're
      // already on a detail page. Added 2026-05-19 (rev2).
      if (skipScrollAttempt) {
        const navigatedFromResults = await clickListingInResultsByName(page, businessName);
        if (navigatedFromResults) {
          console.log(`   → Clicked prospect's listing in results → detail page`);
          await sleep(1500);
          await injectRankOverlay(page, businessName, rank, searchTerm);
        }
      }
      await highlightBusinessOnDetailPage(page);
      // Long hold on detail page so the prospect's card is the dominant visual
      // for the Maps audio (~38s). With 4s results-hold + 2.5s nav, we still
      // have audio length ~30s left to fill with the detail-page view.
      await sleep(18000);
      await dismissResultsInfoPopup(page);
      return 'direct-url';
    }

    return 'search-only';
  } catch (err) {
    console.warn(`   ⚠️ Maps navigation failed: ${err.message || err}`);
    await saveDebug(page, 'step3-maps-failed');
    return 'none';
  }
}

async function robustScrollStep(page, deltaPx) {
  const y0 = await page.evaluate(() => window.scrollY || 0).catch(() => 0);

  await page.evaluate((delta) => window.scrollBy(0, delta), deltaPx).catch(() => {});
  await sleep(220);
  const y1 = await page.evaluate(() => window.scrollY || 0).catch(() => 0);
  if (y1 !== y0) return true;

  await page.mouse.wheel({ deltaY: deltaPx }).catch(() => {});
  await sleep(260);
  const y2 = await page.evaluate(() => window.scrollY || 0).catch(() => 0);
  if (y2 !== y0) return true;

  await page.keyboard.press('PageDown').catch(() => {});
  await sleep(320);
  const y3 = await page.evaluate(() => window.scrollY || 0).catch(() => 0);
  return y3 !== y0;
}

async function nudgeBounce(page) {
  const y0 = await page.evaluate(() => window.scrollY || 0).catch(() => 0);
  await page.mouse.wheel({ deltaY: -180 }).catch(() => {});
  await sleep(180);
  await page.mouse.wheel({ deltaY: 360 }).catch(() => {});
  await sleep(220);
  const y1 = await page.evaluate(() => window.scrollY || 0).catch(() => 0);
  return y1 !== y0;
}

async function scrollWebsiteMore(page) {
  for (let i = 0; i < DESKTOP_WEBSITE_SCROLL_STEPS; i++) {
    await robustScrollStep(page, DESKTOP_WEBSITE_SCROLL_DELTA_PX);
    await sleep(DESKTOP_WEBSITE_SCROLL_WAIT_MS);
  }
}

async function scrollWebsiteTail(page, durationMs) {
  const endAt = Date.now() + Math.max(0, durationMs);
  let noMove = 0;
  let reversedOnce = false;

  while (Date.now() < endAt) {
    const moved = await robustScrollStep(page, DESKTOP_WEBSITE_TAIL_DELTA_PX);
    if (!moved) {
      noMove += 1;
      if (noMove >= 2) {
        if (!reversedOnce) {
          // First time stuck at bottom: scroll back to top for a second pass
          reversedOnce = true;
          noMove = 0;
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
          await sleep(2200);
        } else {
          await nudgeBounce(page);
          noMove = 0;
        }
      }
    } else {
      noMove = 0;
    }
    await sleep(DESKTOP_WEBSITE_TAIL_TICK_MS);
  }
}

function createScreencastRecorder(page, outputPath, viewport) {
  let ffmpeg = null;
  let stopped = false;
  let captureLoop = null;
  let writeLoop = null;
  let frameCount = 0;
  let captureCount = 0;
  let latestFrame = null;
  const stderrChunks = [];

  async function start() {
    ensureDir(path.dirname(outputPath));
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    ffmpeg = spawn(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-framerate',
        String(SCREENCAST_FPS),
        '-i',
        'pipe:0',
        '-an',
        '-c:v',
        'libvpx',
        '-deadline',
        'realtime',
        '-cpu-used',
        '8',
        '-b:v',
        viewport.width >= 1000 ? '1800k' : '900k',
        '-pix_fmt',
        'yuv420p',
        outputPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));

    const frameIntervalMs = Math.max(1, Math.round(1000 / SCREENCAST_FPS));
    captureLoop = (async () => {
      while (!stopped) {
        const startedAt = Date.now();

        try {
          latestFrame = await page.screenshot({
            type: 'jpeg',
            quality: 78,
            captureBeyondViewport: false,
          });
          captureCount += 1;
        } catch {
          await sleep(250);
        }

        const elapsed = Date.now() - startedAt;
        await sleep(Math.max(0, SCREENSHOT_CAPTURE_INTERVAL_MS - elapsed));
      }
    })();

    writeLoop = (async () => {
      while (!stopped) {
        const startedAt = Date.now();

        try {
          if (latestFrame && ffmpeg && !ffmpeg.stdin.destroyed && ffmpeg.stdin.writable) {
            ffmpeg.stdin.write(latestFrame);
            frameCount += 1;
          }
        } catch {}

        const elapsed = Date.now() - startedAt;
        await sleep(Math.max(0, frameIntervalMs - elapsed));
      }
    })();
  }

  async function stop() {
    stopped = true;
    if (captureLoop) await captureLoop.catch(() => {});
    if (writeLoop) await writeLoop.catch(() => {});

    return new Promise((resolve) => {
      if (!ffmpeg) {
        resolve({ ok: false, frameCount, captureCount, error: 'ffmpeg_not_started' });
        return;
      }

      // Safety timeout — if ffmpeg hangs and never closes, force kill after 90s
      const killTimer = setTimeout(() => {
        console.warn(`[recorder] ffmpeg did not close after 90s — force killing`);
        try { ffmpeg.kill('SIGKILL'); } catch {}
        resolve({ ok: false, frameCount, captureCount, error: 'ffmpeg_timeout' });
      }, 90_000);

      ffmpeg.once('close', (code) => {
        clearTimeout(killTimer);
        const exists = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
        resolve({
          ok: code === 0 && exists && frameCount > 0,
          frameCount,
          captureCount,
          code,
          error: stderrChunks.join('').trim(),
        });
      });

      try {
        ffmpeg.stdin.end();
      } catch {
        clearTimeout(killTimer);
        resolve({ ok: false, frameCount, captureCount, error: 'ffmpeg_stdin_close_failed' });
      }
    });
  }

  return { start, stop };
}

async function recordDesktopMapsVideo(browser, meta, outputPath) {
  const page = await browser.newPage();
  await page.setViewport(DESKTOP_VIEWPORT);

  const recorder = createScreencastRecorder(page, outputPath, DESKTOP_VIEWPORT);
  let hadFatal = false;
  let recorderStarted = false;

  try {
    await page.goto('about:blank', { waitUntil: 'load' });

    const startRecorder = async () => {
      if (recorderStarted) return;
      await recorder.start();
      recorderStarted = true;
      await sleep(300);
    };

    const mode = await goToMapsShowResultsThenOpenBusiness(page, meta, startRecorder);
    if (!recorderStarted) await startRecorder();
    if (mode !== 'none') await sleep(mode === 'search-only' ? DESKTOP_MAPS_HOLD_MS * 2 : DESKTOP_MAPS_HOLD_MS);
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording desktop Maps for ${meta.name}: ${err.message || err}`);
  }

  const result = await recorder.stop();
  await page.close().catch(() => {});
  if (!result.ok) {
    console.warn(`   ⚠️ Desktop Maps recording failed: ${result.error || `ffmpeg code ${result.code}`}`);
    return false;
  }
  if (hadFatal) {
    console.warn(`   ⚠️ Desktop Maps had error, but video was still saved: ${outputPath}`);
  } else {
    console.log(`   ✓ Saved desktop Maps video: ${outputPath}`);
  }
  return true;
}

async function recordDesktopWebsiteVideo(browser, meta, outputPath) {
  if (!meta.website) return false;

  const page = await browser.newPage();
  await page.setViewport(DESKTOP_VIEWPORT);

  const recorder = createScreencastRecorder(page, outputPath, DESKTOP_VIEWPORT);
  let hadFatal = false;

  try {
    // NEW: navigate FIRST, wait for render, THEN start recorder.
    // This avoids the screenshot-stuck-on-old-page bug we hit when capturing
    // through a navigation. Same fix already applied to mobile.
    console.log(`   → Website (desktop view): ${meta.website}`);
    const visited = await gotoFirstWorking(page, meta.website, 'Website');

    if (!visited) {
      throw new Error(`Desktop website unreachable for ${meta.name} — lead skipped`);
    } else {
      await sleep(2500);
      await page.addStyleTag({ content: 'html,body{background:#ffffff !important;}' }).catch(() => {});
      await dismissCommonCookieBanner(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => {});

      // Verify screenshots actually capture the website BEFORE recording
      try {
        const testShot = await page.screenshot({ type: 'jpeg', quality: 50, captureBeyondViewport: false });
        console.log(`   [diag] desktop website pre-record screenshot OK (${testShot.length} bytes)`);
      } catch (e) {
        console.warn(`   ⚠️ desktop website pre-record screenshot FAILED: ${e.message}`);
      }

      await recorder.start();
      await sleep(800);
      await sleep(DESKTOP_WEBSITE_INTRO_HOLD_MS);

      await scrollWebsiteMore(page);
      await scrollWebsiteTail(page, DESKTOP_WEBSITE_EXTRA_HOLD_MS);
    }
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording desktop website for ${meta.name}: ${err.message || err}`);
  }

  const result = await recorder.stop();
  await page.close().catch(() => {});
  if (!result.ok) {
    console.warn(`   ⚠️ Desktop website recording failed: ${result.error || `ffmpeg code ${result.code}`}`);
    return false;
  }
  if (hadFatal) {
    console.warn(`   ⚠️ Desktop website had error, but video was still saved: ${outputPath}`);
  } else {
    console.log(`   ✓ Saved desktop website video: ${outputPath}`);
  }
  return true;
}

async function recordMobileVideo(browser, meta, outputPath) {
  if (!meta.website) return false;

  const page = await browser.newPage();
  await page.setViewport(MOBILE_VIEWPORT);
  await page.setUserAgent(MOBILE_USER_AGENT);

  const recorder = createScreencastRecorder(page, outputPath, MOBILE_VIEWPORT);
  let hadFatal = false;

  try {
    // NEW APPROACH: navigate to the website FIRST, wait for it to render,
    // THEN start the recorder. This avoids the placeholder DOM ever being
    // captured (which was the persistent "Loading website..." bug).
    console.log(`   → Website (real mobile view): ${meta.website}`);
    const visited = await gotoFirstWorking(page, meta.website, 'Mobile Website');

    if (!visited) {
      throw new Error(`Mobile website unreachable for ${meta.name} — lead skipped`);
    } else {
      // Give the page a real moment to render (Pacific takes 10s, others vary)
      await sleep(2500);
      await page.addStyleTag({ content: 'html,body{background:#ffffff !important;}' }).catch(() => {});
      await dismissCommonCookieBanner(page);

      // Force a screenshot test BEFORE recording — confirms screenshots actually capture the website
      try {
        const testShot = await page.screenshot({ type: 'jpeg', quality: 50, captureBeyondViewport: false });
        console.log(`   [diag] mobile pre-record screenshot OK (${testShot.length} bytes)`);
      } catch (e) {
        console.warn(`   ⚠️ mobile pre-record screenshot FAILED: ${e.message}`);
      }

      await recorder.start();
      await sleep(800);

      const mobileScrollHeight = await page.evaluate(() =>
        Math.max(0, document.body.scrollHeight - window.innerHeight)
      ).catch(() => 0);

      const MOBILE_SCROLL_STEP_PX = 600;
      const MOBILE_MAX_DOWN_STEPS = 8; // cap at 8 down-steps (~14.4s) so long pages don't bloat mobile section
      const mobilePositions = [0]; // intro hold at top
      if (mobileScrollHeight > MOBILE_SCROLL_STEP_PX) {
        let stepCount = 0;
        for (let pos = MOBILE_SCROLL_STEP_PX; pos < mobileScrollHeight && stepCount < MOBILE_MAX_DOWN_STEPS; pos += MOBILE_SCROLL_STEP_PX) {
          mobilePositions.push(pos);
          stepCount++;
        }
        mobilePositions.push(mobileScrollHeight); // reach bottom (or near it)
        mobilePositions.push(Math.floor(mobileScrollHeight / 2)); // scroll back up partway
        mobilePositions.push(0); // return to top
      } else {
        // Short page: just go to bottom and back
        if (mobileScrollHeight > 0) mobilePositions.push(mobileScrollHeight);
        mobilePositions.push(0);
        mobilePositions.push(mobileScrollHeight > 0 ? mobileScrollHeight : 650);
      }

      console.log(`   [diag] mobile scrollHeight=${mobileScrollHeight}px positions=${mobilePositions.join(',')}`);
      for (const top of mobilePositions) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), top).catch(() => {});
        await sleep(1800);
      }
    }
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording mobile for ${meta.name}: ${err.message || err}`);
  }

  const result = await recorder.stop();
  await page.close().catch(() => {});

  if (!result.ok) {
    console.warn(`   ⚠️ Mobile recording failed: ${result.error || `ffmpeg code ${result.code}`}`);
    return false;
  }

  if (hadFatal) {
    console.warn(`   ⚠️ Mobile had an error, but video was still saved: ${outputPath}`);
  } else {
    console.log(`   ✓ Saved mobile video: ${outputPath}`);
  }

  return true;
}

async function recordBusinessVideos(browser, meta, mapsOut, websiteOut, mobileOut) {
  const mapsOk = await recordDesktopMapsVideo(browser, meta, mapsOut);
  const websiteOk = await recordDesktopWebsiteVideo(browser, meta, websiteOut);
  const mobileOk = await recordMobileVideo(browser, meta, mobileOut);
  return { mapsOk, websiteOk, mobileOk };
}

async function launchBrowser() {
  ensureDir(CHROME_PROFILE_DIR);
  return puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    userDataDir: CHROME_PROFILE_DIR,
    defaultViewport: null,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

async function main() {
  const { inputPath, baseName } = findLatestStep2Csv();
  const records = await loadCsv(inputPath);
  console.log(`Loaded ${records.length} rows from Step 2 CSV.`);

  const totalsBySearchTerm = {};
  for (const row of records) {
    const term = row['Search Term'] || row.searchTerm || '';
    const rank = parseRank(row['Map Rank'] || row.rank);
    if (!term || rank == null) continue;
    if (!totalsBySearchTerm[term] || rank > totalsBySearchTerm[term]) {
      totalsBySearchTerm[term] = rank;
    }
  }

  const withEmail = records.filter((row) => Boolean(extractValidEmail(row.email || row.Email || '')));

  console.log(`Contacts with email: ${withEmail.length} (videos will only be created for these).`);

  if (!withEmail.length) {
    console.log('Nothing to do - no rows with email.');
    return;
  }

  const toRecord = withEmail.slice(0, MAX_VIDEOS);
  const videosDir = path.join(VIDEOS_ROOT, baseName);
  ensureDir(videosDir);

  const browser = await launchBrowser();
  let processed = 0;

  try {
    for (let i = 0; i < toRecord.length; i++) {
      const row = toRecord[i];

      const name = row['Business Name'] || row.name || `business-${processed + 1}`;
      const city = row['City'] || row.city || '';
      const slug = slugify(name, { lower: true, strict: true }) || `business-${processed + 1}`;
      const website = cleanUrl(row.Website || row.website || '');
      const mapsUrl = cleanUrl(row['Google Maps URL'] || row.mapsUrl || '');

      if (!website && !mapsUrl) {
        console.log(`Skipping ${name} - no website or Google Maps URL available.`);
        continue;
      }

      const searchTerm = row['Search Term'] || row.searchTerm || '';
      const rank = parseRank(row['Map Rank'] || row.rank);
      const totalForTerm = searchTerm ? totalsBySearchTerm[searchTerm] : null;
      const rating = row.Rating || row.rating || '';
      const reviews = row.Reviews || row.reviews || '';
      const indexStr = String(processed + 1).padStart(2, '0');

      const mapsOut = path.join(videosDir, `${indexStr}_${slug}_desktop_maps.webm`);
      const websiteOut = path.join(videosDir, `${indexStr}_${slug}_desktop_website.webm`);
      const mobileOut = path.join(videosDir, `${indexStr}_${slug}_mobile.webm`);

      const allExist = [mapsOut, websiteOut, mobileOut].every(
        p => fs.existsSync(p) && fs.statSync(p).size > 10000
      );
      if (allExist) {
        console.log(`\n⏭ Skipping ${name} — all 3 videos already exist.`);
        processed += 1;
        continue;
      }

      console.log(`\n▶ Recording videos ${processed + 1}/${toRecord.length} for: ${name}`);

      try {
        await recordBusinessVideos(
          browser,
          {
            name, city,
            state: row.State || row.state || '',
            address: row.Address || row.address || '',
            phone: String(row.Phone || row.phone || '').replace(/\s+/g, ' ').trim(),
            website, mapsUrl, searchTerm, rank, totalForTerm, rating, reviews,
            // 2026-05-19: pass lat/lng so deep-rank navigation can build a
            // coords-based /maps/place/Name/@lat,lng,17z URL when the typed
            // search would be ambiguous (matches multiple businesses).
            lat: parseFloat(row.Latitude || row.latitude || '') || null,
            lng: parseFloat(row.Longitude || row.longitude || '') || null,
          },
          mapsOut,
          websiteOut,
          mobileOut
        );
        processed += 1;
      } catch (leadErr) {
        console.warn(`\n⚠️ Skipping ${name}: ${leadErr.message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  console.log(`\n✅ Done. Videos recorded for ${processed} contacts with email.`);
}

main().catch((err) => {
  console.error('Fatal error in step-3-video-recorder:', err);
  process.exit(1);
});
