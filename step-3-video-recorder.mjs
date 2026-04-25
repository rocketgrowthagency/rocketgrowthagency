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

async function clickListingInResultsByName(page, businessName) {
  const target = normalizeText(businessName);
  if (!target) return false;

  const clicked = await page.evaluate((targetNorm) => {
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

    const resultCards = Array.from(
      document.querySelectorAll('div[role="article"], div.Nv2PK, a.hfpxzc, a[href*="/maps/place/"]')
    );

    const scored = [];
    for (const el of resultCards) {
      let cardRoot = el;
      if (el.tagName.toLowerCase() === 'a') {
        cardRoot = el.closest('div[role="article"], div.Nv2PK') || el.parentElement || el;
      }

      if (cardRoot && isSponsoredBlock(cardRoot)) continue;

      const text = (cardRoot?.innerText || el.innerText || '').trim();
      const firstLine = text.split('\n')[0] || '';
      const aria = el.getAttribute ? el.getAttribute('aria-label') || '' : '';
      const title =
        cardRoot?.querySelector?.('.fontHeadlineSmall, .qBF1Pd, div[role="heading"], h3')?.textContent ||
        '';

      const pool = [aria, firstLine, title].map(norm).filter(Boolean);
      let best = 0;

      for (const candidate of pool) {
        if (candidate === targetNorm) best = Math.max(best, 100);
        else if (candidate.includes(targetNorm) || targetNorm.includes(candidate)) {
          best = Math.max(best, 75);
        } else {
          const targetParts = targetNorm.split(' ').filter((p) => p.length >= 4);
          const hits = targetParts.filter((p) => candidate.includes(p)).length;
          best = Math.max(best, hits * 12);
        }
      }

      if (best > 0) scored.push({ el: cardRoot || el, best });
    }

    scored.sort((a, b) => b.best - a.best);
    const topScore = scored[0];
    if (!topScore || topScore.best < 45) return false;

    const top = topScore.el;
    if (!top) return false;

    try {
      top.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {}

    const anchor =
      top.tagName?.toLowerCase?.() === 'a'
        ? top
        : top.querySelector?.('a.hfpxzc, a[aria-label], a[href*="/maps/place/"]') || null;

    try {
      (anchor || top).click();
      return true;
    } catch {
      return false;
    }
  }, target);

  return Boolean(clicked);
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

async function goToMapsShowResultsThenOpenBusiness(page, meta, afterMapsNavigation) {
  const searchTerm = (meta.searchTerm || '').trim();
  const businessName = (meta.name || '').trim();
  const mapsUrl = (meta.mapsUrl || '').trim();
  const query = searchTerm || businessName;

  if (!query && !mapsUrl) return 'none';

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
      await scrollMapsResultsPanel(page, 2);
      await sleep(1200);
    }

    if (businessName) {
      console.log(`   → Opening business card from results: ${businessName}`);
      const clicked = await clickListingInResultsByName(page, businessName);
      if (clicked) {
        await sleep(6500);
        await dismissResultsInfoPopup(page);
        return 'results-click';
      }
    }

    if (mapsUrl) {
      console.log('   → Results click failed; opening direct Google Maps URL.');
      await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
      await sleep(6500);
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

  while (Date.now() < endAt) {
    const moved = await robustScrollStep(page, DESKTOP_WEBSITE_TAIL_DELTA_PX);
    if (!moved) {
      noMove += 1;
      if (noMove >= 2) {
        await nudgeBounce(page);
        noMove = 0;
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

    const frameIntervalMs = Math.max(80, Math.round(1000 / SCREENCAST_FPS));
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

      ffmpeg.once('close', (code) => {
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
        resolve({ ok: false, frameCount, captureCount, error: 'ffmpeg_stdin_close_failed' });
      }
    });
  }

  return { start, stop };
}

async function recordDesktopVideo(browser, meta, outputPath) {
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
    if (mode !== 'none') await sleep(DESKTOP_MAPS_HOLD_MS);

    let visited = null;
    if (meta.website) {
      console.log(`   → Website (desktop view): ${meta.website}`);
      visited = await gotoFirstWorking(page, meta.website, 'Website');
    }

    if (!visited) {
      const fromMaps = await extractWebsiteFromMapsCard(page);
      if (fromMaps) {
        console.log(`   → Website from Maps card: ${fromMaps}`);
        visited = await gotoFirstWorking(page, fromMaps, 'Maps Website');
      }
    }

    if (visited) {
      await sleep(2200);
      await page.addStyleTag({ content: 'html,body{background:#ffffff !important;}' }).catch(() => {});
      await dismissCommonCookieBanner(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })).catch(() => {});
      await sleep(DESKTOP_WEBSITE_INTRO_HOLD_MS);
      await scrollWebsiteMore(page);
      await scrollWebsiteTail(page, DESKTOP_WEBSITE_EXTRA_HOLD_MS);
    } else {
      console.warn('   ⚠️ Website unreachable; keeping desktop video as Maps-only segment.');
      await sleep(5000);
    }
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording desktop for ${meta.name}: ${err.message || err}`);
  }

  const result = await recorder.stop();
  await page.close().catch(() => {});

  if (!result.ok) {
    console.warn(`   ⚠️ Desktop recording failed: ${result.error || `ffmpeg code ${result.code}`}`);
    return false;
  }

  if (hadFatal) {
    console.warn(`   ⚠️ Desktop had an error, but video was still saved: ${outputPath}`);
  } else {
    console.log(`   ✓ Saved desktop video: ${outputPath}`);
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
    const safeName =
      String(meta.name || 'Loading...')
        .replace(/[<>]/g, '')
        .trim() || 'Loading...';
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><div style="padding:16px;"><div style="font-size:16px;font-weight:600;">${safeName}</div><div style="margin-top:6px;font-size:13px;opacity:.65;">Loading website...</div></div></body></html>`,
      { waitUntil: 'domcontentloaded' }
    );

    await recorder.start();
    await sleep(400);

    console.log(`   → Website (real mobile view): ${meta.website}`);
    const visited = await gotoFirstWorking(page, meta.website, 'Mobile Website');

    if (!visited) {
      console.warn('   ⚠️ Mobile website unreachable; saving short placeholder segment.');
      await page.goto('about:blank', { waitUntil: 'load' }).catch(() => {});
      await sleep(2000);
    } else {
      await sleep(1200);
      await page.addStyleTag({ content: 'html,body{background:#ffffff !important;}' }).catch(() => {});
      await dismissCommonCookieBanner(page);

      const positions = [0, 650, 1300, 1950];
      for (const top of positions) {
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

async function recordBusinessVideos(browser, meta, desktopOut, mobileOut) {
  const desktopOk = await recordDesktopVideo(browser, meta, desktopOut);
  const mobileOk = await recordMobileVideo(browser, meta, mobileOut);
  return { desktopOk, mobileOk };
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

      const desktopOut = path.join(videosDir, `${indexStr}_${slug}_desktop.webm`);
      const mobileOut = path.join(videosDir, `${indexStr}_${slug}_mobile.webm`);

      console.log(`\n▶ Recording videos ${processed + 1}/${toRecord.length} for: ${name}`);

      await recordBusinessVideos(
        browser,
        { name, website, mapsUrl, searchTerm, rank, totalForTerm, rating, reviews },
        desktopOut,
        mobileOut
      );

      processed += 1;
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
