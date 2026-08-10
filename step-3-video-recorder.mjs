import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import csvParser from 'csv-parser';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import slugify from 'slugify';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

// 2026-06-12: define ROOT (was referenced at the diag-dir + pre-record audit-check
// paths but never declared → "ROOT is not defined" non-fatal warning on every lead).
const ROOT = process.cwd();
const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');
const VIDEOS_ROOT = path.join(process.cwd(), 'output', 'Step 3 (Video Recorder - Raw WebM)');
// 2026-05-27 (Tier 2 #7 prep): CHROME_PROFILE_DIR override via env var, so the
// cross-lead worker pool can assign each worker a unique profile dir and
// avoid Chrome's user-data-dir lock contention. Default unchanged.
// Set CHROME_PROFILE_DIR=output/chrome-profile-step3-w1 (etc) per worker.
const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR
  || path.join(process.cwd(), 'output', 'chrome-profile-step3');
const DEBUG_DIR = path.join(process.cwd(), 'output', 'debug', 'step3');
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || '';
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MAX_VIDEOS = Number(process.env.MAX_VIDEOS || 1);
const DESKTOP_VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
// 2026-06-12: record the MAPS segment at a WIDER viewport so Google serves the
// 3-column (results | detail card | map) layout — keeps our blue-line highlight +
// card popout visible (Chris's preferred look). Website stays 1280 (no squish);
// step-4 scales the Maps segment back to 1280:720 in the combine. Verified on
// American Plumber + Ford's. Overridable via MAPS_VW_WIDTH.
// 2026-06-19: Maps viewport must be 16:9 to match the 1280×720 output, else step-4's
// scale=1280:720 horizontally SQUISHES it (Chris caught the stretch). At width 1600 the
// old height 720 made it 20:9 (1600×720) → squished to 16:9. Derive height from width so
// it's always 16:9 (1600→900), and the downscale to 1280×720 is distortion-free while the
// extra width still triggers Google's 3-column card-popout layout.
const MAPS_VW_WIDTH = Number(process.env.MAPS_VW_WIDTH || 1600);
const MAPS_VIEWPORT = { width: MAPS_VW_WIDTH, height: Math.round(MAPS_VW_WIDTH * 9 / 16), deviceScaleFactor: 1 };
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

// 2026-06-01: REVERTED back to 30 fps after Chris caught noticeable lag
// in production videos. The 20 fps lever was added 2026-05-29 as a WC=3
// CPU-relief measure, but we're on WC=2 default now (per
// feedback_worker_count_concurrency_limit.md). 20 fps was clearly visible
// in Maps panel scrolls + page scrolls — choppy/laggy feel. 30 fps is
// the locked default for prospect-facing video quality.
// Override with STEP3_SCREENCAST_FPS=20 if you specifically want CPU
// relief during a WC=3 batch (not recommended).
const SCREENCAST_FPS = Number(process.env.STEP3_SCREENCAST_FPS || 30);
const SCREENSHOT_CAPTURE_INTERVAL_MS = Number(process.env.STEP3_SCREENSHOT_CAPTURE_INTERVAL_MS || 33);
const MAPS_NAV_TIMEOUT_MS = Number(process.env.MAPS_NAV_TIMEOUT_MS || 90000);
const MAPS_INPUT_TIMEOUT_MS = Number(process.env.MAPS_INPUT_TIMEOUT_MS || 25000);
const MAPS_MANUAL_CONSENT_WAIT_MS = Number(process.env.MAPS_MANUAL_CONSENT_WAIT_MS || 90000);
const WEBSITE_NAV_TIMEOUT_MS = Number(process.env.WEBSITE_NAV_TIMEOUT_MS || 60000);

// 2026-05-29: bumped Maps hold 4.5s → 30s to fix Maps voiceover/visual
// drift. Maps voiceover is typically 32–43s long (Dewey 42.8s, Target
// Plumbers 37.5s). Previously total Maps recording = nav (~15s) + hold
// (4.5s) ≈ 19s. Step-4 was forced to freeze the last frame for ~18s
// while audio kept describing Maps issues — visual would drift ahead
// to website content while audio still on Maps, or vice versa. With
// 30s hold, total Maps recording ≈ 45s, which comfortably exceeds the
// longest typical Maps voiceover.
//
// Cost: +25.5s per lead in Maps stage. At WC=2 over 8 leads that's
// ~100s extra wall time. Acceptable trade for correct A/V sync.
// (The ideal fix is to reorder pipeline so step-6 runs before step-3
// and step-3 reads the manifest, but that's a bigger architectural
// change. This bump unblocks correctness now.)
//
// Memory: [[project-video-master]] § "Known gaps" → Maps duration fix.
const DESKTOP_MAPS_HOLD_MS = Number(process.env.DESKTOP_MAPS_HOLD_MS || 30000);
const DESKTOP_WEBSITE_INTRO_HOLD_MS = Number(process.env.DESKTOP_WEBSITE_INTRO_HOLD_MS || 7000);
const DESKTOP_WEBSITE_EXTRA_HOLD_MS = Number(process.env.DESKTOP_WEBSITE_EXTRA_HOLD_MS || 18000);
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
      // Social profiles — never the business's own site.
      'facebook.com',
      'fb.com',
      'instagram.com',
      'linkedin.com',
      'tiktok.com',
      'twitter.com',
      'x.com',
      'youtube.com',
      // 2026-06-26: third-party DIRECTORIES / marketplaces / aggregators. When a business has no
      // website, step-2 "Discovered Website" sometimes grabs one of these and the recorder filmed
      // the WRONG site (Chris caught A-to-Z Auto Repair → autotrader.com, which was even down).
      // Blocking them here makes the lead maps-only (website/mobile segments skip) instead of
      // recording a directory/error page. Extend as new ones appear.
      // [[feedback-discovered-website-must-reject-directories]]
      'autotrader.com',
      'cars.com',
      'carfax.com',
      'wheree.com',
      'autobodyshopnear.com',
      'giftly.com',
      'autotechiq.com',
      'yelp.com',
      'yellowpages.com',
      'yellowpages.ca',
      'mapquest.com',
      'bbb.org',
      'tripadvisor.com',
      'angi.com',
      'angieslist.com',
      'thumbtack.com',
      'nextdoor.com',
      'foursquare.com',
      'manta.com',
      'chamberofcommerce.com',
      'healthgrades.com',
      'vitals.com',
      'zocdoc.com',
      'realself.com',
      'opencare.com',
      'justia.com',
      'avvo.com',
      'findlaw.com',
      'lawyers.com',
      'martindale.com',
      'eyeexamsnow.com',
      'birdeye.com',
      'localsearch.com',
      'superpages.com',
      'citysearch.com',
      'expertise.com',
      // 2026-08-03: parked / domain-for-sale marketplaces. A dead business whose domain lapsed now serves a
      // "this domain is for sale" page (Chris caught luxury-skin-care-med-spa → luxurymedspa.com → HugeDomains
      // $6,995). No real site to record. NOTE: this only catches a directly-discovered parking URL; a business's
      // OWN domain that REDIRECTS to a parking page is caught by the content check in the website capture below.
      'hugedomains.com',
      'dan.com',
      'sedo.com',
      'afternic.com',
      'buydomains.com',
      'domainmarket.com',
      'undeveloped.com',
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

    // 2026-05-28: CSS-hide remaining cookie / GDPR / CCPA overlays that didn't
    // dismiss via a button click (e.g., banners with only an "X" close, or
    // CCPA-style "Do Not Sell" panels that don't have an accept button).
    // Caught on Dewey Pest & Termite Control — "We value your privacy" panel
    // stayed visible during the website segment recording.
    await page.addStyleTag({
      content: `
        /* Known cookie banner / consent provider IDs and classes */
        #onetrust-banner-sdk, #onetrust-consent-sdk,
        .cky-consent-container, .cky-overlay,
        #cookie-law-info-bar, #cookie-notice,
        .cc-window, .cookieinfo-close, .cc-banner,
        .ot-sdk-row, .ot-sdk-container,
        #CybotCookiebotDialog, .CybotCookiebotDialog,
        #cookieConsent, .cookie-consent,
        #osano-cm-window, .osano-cm-window,
        [id*="cookie-banner" i], [class*="cookie-banner" i],
        [id*="cookie-notice" i], [class*="cookie-notice" i],
        [id*="cookie-popup" i], [class*="cookie-popup" i],
        [id*="gdpr-banner" i], [class*="gdpr-banner" i],
        [id*="gdpr-notice" i], [class*="gdpr-notice" i],
        [id*="ccpa-banner" i], [class*="ccpa-banner" i],
        [class*="privacy-banner" i], [class*="privacy-popup" i],
        [aria-label*="cookie" i][role="dialog"],
        [aria-label*="privacy" i][role="dialog"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `,
    }).catch(() => {});

    // Text-based fallback for custom-implemented privacy banners that don't
    // match any known vendor class/id. Walks all reasonably-sized containers
    // and hides any whose innerText contains the universal "we value your
    // privacy" / "third-party tools" / "do not sell" signature. Caught on
    // Dewey Pest 2026-05-28 — their banner was a custom DIV with no
    // identifying class.
    await page.evaluate(() => {
      const SIG = /we value your privacy|do not sell or share my personal information|do not sell my personal information|process(es)? personal data|third[- ]party tools process/i;
      const containers = Array.from(document.querySelectorAll('div, aside, section, footer, header'));
      for (const el of containers) {
        // Skip large containers (would hide the whole page) — banners are
        // typically small overlays, < ~600px tall and bounded width
        const r = el.getBoundingClientRect();
        if (r.height > 600 || r.width > 800 || r.height === 0) continue;
        const txt = (el.innerText || '').slice(0, 600);
        if (!txt || txt.length > 1500) continue;
        if (SIG.test(txt)) {
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
        }
      }
    }).catch(() => {});

    // 2026-05-28: close auto-opened hamburger menus / nav drawers that
    // overlay content during recording. Many SPA sites auto-open their mobile
    // nav on certain viewports OR puppeteer triggers a focus event that opens
    // them. Caught on Dewey Pest — the desktop site's nav menu was open
    // during the website segment recording.
    await page.evaluate(() => {
      // Common "open/expanded" indicator classes — set aria-expanded=false +
      // remove "open" / "expanded" / "active" classes from nav containers
      const navOpenSelectors = [
        '.menu-open', '.nav-open', '.is-menu-open', '.mobile-menu-open',
        '[class*="menu-open" i]', '[class*="nav-open" i]',
        '[aria-expanded="true"][aria-controls*="menu" i]',
        '[aria-expanded="true"][aria-controls*="nav" i]',
      ];
      for (const sel of navOpenSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          el.classList.remove('menu-open', 'nav-open', 'is-menu-open', 'mobile-menu-open', 'open', 'expanded', 'active');
          el.setAttribute('aria-expanded', 'false');
        });
      }
      // Forcibly hide any element matching open-nav drawer selectors that
      // appear OVER the page content
      const drawerSelectors = [
        '.mobile-menu.open', '.nav-drawer.open', '.menu-drawer.open',
        '[class*="drawer" i][class*="open" i]',
        '[class*="offcanvas" i][class*="open" i]',
        '[class*="offcanvas" i][class*="show" i]',
        '[id*="mobile-menu" i][aria-expanded="true"]',
      ];
      for (const sel of drawerSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          el.style.display = 'none';
        });
      }
      // Also remove body-level scroll-lock classes that fixed nav menus often add
      document.body.classList.remove('menu-open', 'nav-open', 'no-scroll', 'overflow-hidden', 'modal-open');
    }).catch(() => {});
    await sleep(300);
  } catch {}
}

// Promotional / newsletter / email-signup MODALS (Klaviyo, Mailchimp, Privy, OptinMonster, Sumo,
// Justuno, Poptin, Wisepops, Sleeknote, Wheelio, etc. + custom timer/exit-intent popups) drop a
// full-screen backdrop + centered signup card over the WHOLE site. Cookie/chat dismissal above does
// NOT catch these. Chris caught SoCal Skin & Surgery's "YOUR SKIN, BUT BETTER — Sign up..." modal
// covering the entire desktop website segment (2026-08-03). Many appear on a TIMER (a few seconds in)
// or on exit-intent, so a one-shot dismiss misses them — this installs a persistent killer that keeps
// hiding them for the whole recording. Audit (step-2.5) keeps full render so it can still flag them.
async function dismissPromoModals(page) {
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(150);
    // Persistent, self-clearing killer: click a real close (X) inside any visible modal, hide known
    // vendors + generic signup overlays + their backdrops. Re-runs every 1.1s for ~40s (covers the
    // website segment) so delayed/exit-intent/re-opened popups get caught too.
    await page.evaluate(() => {
      if (window.__rgaPromoKiller) return;
      const FORBIDDEN = /\b(book|schedule|appointment|quote|buy|shop|add to cart|checkout|sign in|log in|facebook|instagram|menu|call)\b/i;
      const SIG = /sign\s?up|subscribe|newsletter|\d+%\s*off|join (our|the)|email address|early access|exclusive (offer|deal|access)|special offer|be the first|don'?t miss|stay (in touch|updated)|get expert|vip list/i;
      const CLOSE_TXT = /^\s*[×✕✖xX✖️]\s*$|\bclose\b|\bdismiss\b|no,?\s*thanks|maybe later/i;
      const CLOSE_CLS = /close|dismiss|modal__close|popup-close|mfp-close|needsclick|pum-close|fancybox-close|om-close/i;
      const cls = (el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || ''));
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
      const kill = (el) => { el.style.setProperty('display', 'none', 'important'); el.style.setProperty('visibility', 'hidden', 'important'); el.style.setProperty('opacity', '0', 'important'); el.style.setProperty('pointer-events', 'none', 'important'); };
      const VENDOR = '.klaviyo-form,[class^="kl-"],[class*=" kl-"],.mc-modal,#mc_embed_signup,.mc-modal-bg,#privy-container,[id^="privy-"],[class*="privy"],.om-holder,[id^="om-"],.optin-monster-holder,.optnmstr,[id*="sumome"],[class*="sumome"],[id*="justuno"],[class*="justuno"],[class*="poptin"],[id*="poptin"],[class*="wisepops"],[class*="sleeknote"],[class*="getsitecontrol"],[class*="wheelio"],[class*="optinly"],[class*="mailmunch"],[class*="hellobar"],.modal-backdrop,.modal-bg,.popup-overlay,.overlay-modal,.mfp-bg,.fancybox-overlay,.pum-overlay';
      const sweep = () => {
        try {
          // 1) known vendors + backdrops
          document.querySelectorAll(VENDOR).forEach((el) => kill(el));
          // 2) click a genuine close button inside a visible modal
          const modals = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal.show,.modal.in,[class*="popup" i],[class*="modal" i],[class*="optin" i],[class*="newsletter" i]')).filter(vis);
          for (const m of modals) {
            const btn = Array.from(m.querySelectorAll('button,a,[role="button"],span,i,svg')).filter(vis).find((b) => {
              const t = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim();
              if (FORBIDDEN.test(t)) return false;
              return CLOSE_TXT.test(t) || CLOSE_CLS.test(cls(b)) || (b.getAttribute('aria-label') || '').toLowerCase().includes('close');
            });
            if (btn) { try { btn.click(); } catch (_) {} }
          }
          // 3) generic: hide fixed/absolute high-z full-ish overlays (or role=dialog) carrying a signup signal
          const vw = window.innerWidth, vh = window.innerHeight;
          Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],div,aside,section')).forEach((el) => {
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') return;
            const r = el.getBoundingClientRect();
            const z = parseInt(s.zIndex, 10) || 0;
            const isDialog = el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true';
            const isOverlay = (s.position === 'fixed' || s.position === 'absolute') && z >= 100 && r.width >= vw * 0.6 && r.height >= vh * 0.5;
            if (!isDialog && !isOverlay) return;
            const txt = (el.innerText || '').slice(0, 900);
            if (!txt || txt.length > 1200) return; // never nuke the page's main content
            if (SIG.test(txt)) kill(el);
          });
          // 4) release scroll-lock the modal added
          document.body.classList.remove('modal-open', 'no-scroll', 'overflow-hidden', 'popup-open', 'fancybox-active', 'pum-open');
          document.documentElement.style.removeProperty('overflow');
          document.body.style.removeProperty('overflow');
        } catch (_) {}
      };
      sweep();
      let n = 0;
      window.__rgaPromoKiller = setInterval(() => { sweep(); if (++n > 36) { clearInterval(window.__rgaPromoKiller); } }, 1100);
    }).catch(() => {});
    await sleep(400);
  } catch {}
}

// Chat widgets (Tawk, Intercom, Drift, Zendesk, etc.) routinely pop over the
// page content with "Hello we're here to help" overlays — blocks the fold,
// covers CTAs, makes the recording visually noisy. Audit (step-2.5) keeps full
// rendering so it can still detect + flag them in voiceover findings, but
// step-3 recordings hide them.
//
// Strategy: (1) network-block known chat-widget origins so the script never
// loads, (2) inject CSS hiding any first-party-proxied chat surface that
// slips through. Locked 2026-05-20 after California Hi-Tech mobile recording
// captured the Tidio-style "24/7 Plumbing Services" popup covering the entire
// CTA fold.
//
// Memory: [[feedback-audit-chat-widget-detection]] for the audit-side rule.
// 2026-05-26: Hosts known to serve tech-support-scam pages — landed on one
// during the Tree-service-Culver-City run when a lead's site JS-redirected
// puppeteer to milieeto.z1.web.core.windows.net/ax/index.html?phone=…
// (fake "Apple Firewall" popup with loud audio loop). The audio kept
// playing for ~4 hours because the renderer detached from main browser.
//
// Aborting requests to these hosts at interception time stops both the
// HTML load AND the audio resources. Combined with --mute-audio at launch,
// any future scam-redirect attempt is silent and harmless.
//
// Memory: [[feedback-step3-scam-defense]]
const MALICIOUS_HOST_PATTERNS = [
  // Azure web app hosts commonly abused by tech-support-scam operators
  /\.web\.core\.windows\.net/i,
  /\.azurewebsites\.net.*\/ax\//i,
  /\.azureedge\.net.*\/ax\//i,
  // Firebase / Google web app hosting abused the same way
  /\.firebaseapp\.com.*\/ax\//i,
  /\.web\.app.*\/ax\//i,
  // Generic scam-page URL signatures (regardless of host)
  /\/ax\/index\.html\?phone=/i,
  /computer-error-\w+/i,
  /apple-?support-?\d{3,}/i,
];

const CHAT_WIDGET_HOST_PATTERNS = [
  /tawk\.to/i,
  /intercom\.io/i,
  /intercomcdn\.com/i,
  /drift\.com/i,
  /driftt\.com/i,
  /zopim\.com/i,
  /zdassets\.com/i,
  /zendesk\.com\/embeddable/i,
  /livechatinc\.com/i,
  /olark\.com/i,
  /tidio\.co/i,
  /tidiochat\.com/i,
  /freshchat\.com/i,
  /freshworks\.com\/crm\/chat/i,
  /crisp\.chat/i,
  /hs-scripts\.com/i,
  /hsforms\.net.*chat/i,
  /hubspot\.com\/livechat/i,
  /smartsupp\.com/i,
  /jivosite\.com/i,
  /chatra\.io/i,
  /chatra\.com/i,
  /helpscout\.net\/beacon/i,
  /pure\.chat/i,
  /userlike\.com/i,
  /3cx\.com\/livechat/i,
  /messenger\.com\/customer_chat/i,
  /widget-platform\.com/i,
];

const CHAT_WIDGET_CSS_HIDE = `
  /* step-3 only — chat widget hide. Covers most embed surfaces by class/id substring */
  [class*="tawk"], [id*="tawk"],
  [class*="intercom"], [id*="intercom"],
  [class*="drift-"], [id*="drift-"],
  [class*="zopim"], [id*="zopim"],
  [class*="zEWidget"], [id*="zopim"],
  [class*="LiveChat"], [id*="livechat"], [class*="livechat"],
  [class*="olark"], [id*="olark"],
  [class*="tidio"], [id*="tidio"], [class*="tidioChat"],
  [class*="freshchat"], [id*="freshchat"], [class*="fc_frame"], [id*="fc_frame"], [class*="fc-frame"],
  [class*="crisp-client"], [id*="crisp-chatbox"],
  [class*="hubspot-messages"], [id*="hubspot-messages"],
  [class*="smartsupp"], [id*="smartsupp"],
  [class*="jivo"], [id*="jivo"],
  [class*="chatra"], [id*="chatra"],
  [class*="BeaconContainer"], [class*="helpscout"],
  [class*="purechat"], [id*="purechat"],
  [class*="userlike"], [id*="userlike"],
  [class*="ChatWidget"], [class*="chat-widget"], [class*="chat_widget"],
  iframe[src*="tawk.to"], iframe[src*="intercom"], iframe[src*="drift"],
  iframe[src*="zopim"], iframe[src*="livechat"], iframe[src*="tidio"],
  iframe[src*="freshchat"], iframe[src*="crisp"], iframe[src*="messenger.com/customer_chat"],
  iframe[title*="Chat" i], iframe[title*="Messenger" i],
  div[role="dialog"][class*="chat" i], div[role="region"][aria-label*="chat" i] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

async function setupChatWidgetBlocking(page) {
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (MALICIOUS_HOST_PATTERNS.some((re) => re.test(url))) {
        console.warn(`   blocked malicious host request: ${url.slice(0, 120)}`);
        req.abort().catch(() => {});
        return;
      }
      if (CHAT_WIDGET_HOST_PATTERNS.some((re) => re.test(url))) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
    // JS-redirects can land on a scam host even when the initial request was
    // to a legitimate URL. Watch every frame nav and force back to about:blank
    // if it lands on a known scam pattern.
    page.on('framenavigated', async (frame) => {
      try {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        if (MALICIOUS_HOST_PATTERNS.some((re) => re.test(url))) {
          console.warn(`   detected malicious mid-nav redirect; forcing about:blank: ${url.slice(0, 120)}`);
          await page.goto('about:blank', { waitUntil: 'load' }).catch(() => {});
        }
      } catch {}
    });
  } catch {}
}

async function hideChatWidgetSelectors(page) {
  try {
    await page.addStyleTag({ content: CHAT_WIDGET_CSS_HIDE }).catch(() => {});
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

// 2026-06-23: Chris wants the Maps search box displayed in Title Case with the state code
// uppercased — "roofers in pasadena, ca" -> "Roofers In Pasadena, CA" (EVERY word capitalized,
// state = CA). Used to overwrite the box value after Google normalizes the typed search.
function toTitleCaseSearch(s) {
  if (!s) return s;
  return s.split(',').map((seg, i, arr) => {
    const t = seg.trim();
    if (i === arr.length - 1 && /^[A-Za-z]{2}$/.test(t)) return t.toUpperCase(); // trailing state code
    return t.replace(/\S+/g, w => /^[A-Z]{2,}$/.test(w) ? w               // keep acronyms (HVAC)
      : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }).join(', ');
}

async function clearAndType(page, selector, value) {
  // 2026-06-11: ROBUST clear. The old single-Backspace left residue when the
  // search box already held text (prior nav / retry) — the new query got
  // APPENDED, producing "Plumbers in Beverly Hills CAPlumbers in Beverly Hills
  // CA..." in the visible Maps search bar (Chris caught it on review). A garbled
  // query also broke card-open (Maps couldn't match the business → results list
  // + state-zoom, no detail card). Now: select-all + delete, DOM-level hard
  // clear, verify empty, THEN type.
  await page.click(selector, { clickCount: 3 });
  const selectAllKey = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(selectAllKey);
  await page.keyboard.press('a');
  await page.keyboard.up(selectAllKey);
  await page.keyboard.press('Delete');
  // DOM-level hard clear (covers React-controlled input where select-all misses)
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, selector).catch(() => {});
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

    // HARD RULE — never click/match a sponsored Maps listing for cold-outreach
    // video. We're local-SEO experts; including a "Sponsored" panel in our
    // walkthrough contradicts the entire pitch and immediately kills trust.
    //
    // Detection layered (any single hit = sponsored):
    //   1. Word "Sponsored" anywhere in first ~120 chars of card innerText
    //      (catches inline render like "Sponsored : Monkey Wrench ..." with
    //      no surrounding newlines — Maps DOM as of 2026-05-21)
    //   2. ARIA label match: aria-label containing "Sponsored" or exact "Ad"
    //   3. Walk up to 3 ancestor levels in case the badge is on a sibling
    //      wrapper (Google sometimes nests the "Sponsored" pill outside the
    //      article element)
    // Caught 2026-05-21: Monkey Wrench Plumbing had BOTH sponsored + organic
    // (rank #2) entries in Plumbers in Santa Monica CA results. Old detector
    // missed the sponsored variant because innerText started with the
    // business name, not "Sponsored\n". Step-3 then matched + clicked the
    // sponsored one, baking "Sponsored" into our cold-outreach video.
    // Memory: feedback_never_match_sponsored_maps_listing.md.
    const isSponsoredBlock = (root) => {
      // 2026-06-12: inspect ONLY this card, NOT ancestors. The old 4-ancestor
      // walk + 120-char innerText slice caught NEIGHBOURING sponsored cards' text
      // via a shared ancestor when the Chrome profile is logged into a Google
      // account (logged-in Maps nests cards under one container), flagging EVERY
      // card → no card matched → no detail card in the video (Chris caught Ford's).
      // Validated on Chrome 149: card-root-only flags only the real sponsored ads
      // (2/22), not the prospect. The "Sponsored" badge is at the card's own start.
      if (!root) return false;
      const t = (root.innerText || '').toLowerCase();
      if (/\bsponsored\b/.test(t.slice(0, 60))) return true;
      if (root.querySelector && root.querySelector(
        '[aria-label*="Sponsored" i], [aria-label="Ad" i], [data-value="ad" i], [data-tts="ad" i]'
      )) return true;
      return false;
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
  // 2026-06-02 (rev3) — HARD FIX. Previous version matched by text-includes,
  // which (a) had no sponsored filter and (b) could match the wrong card if
  // a sponsored result's "similar to" copy included the prospect's words.
  // Caught on Beverly Hills Roofing Contractors single-lead test: blue
  // outline landed on Hull Brothers (Sponsored). New algorithm:
  //   1. Find the anchor whose href matches the resolved (already-filtered)
  //      href from getListingHrefByName.
  //   2. Walk up to its card root.
  //   3. Re-check isSponsoredBlock locally as a belt-and-suspenders guard;
  //      if true, refuse to highlight (better dark than wrong).
  try {
    const centered = await page.evaluate((targetHref) => {
      // Inline sponsored detector — same logic as getListingHrefByName.
      const isSponsoredBlock = (root) => {
        // 2026-06-12: card-root-only (see copy in getListingHrefByName). Ancestor
        // walk over-matched on logged-in Maps layout, flagging every card.
        if (!root) return false;
        const t = (root.innerText || '').toLowerCase();
        if (/\bsponsored\b/.test(t.slice(0, 60))) return true;
        if (root.querySelector && root.querySelector(
          '[aria-label*="Sponsored" i], [aria-label="Ad" i], [data-value="ad" i], [data-tts="ad" i]'
        )) return true;
        return false;
      };

      // 2026-06-02 — HIDE sponsored cards entirely from the recording. The
      // voiceover claims "you rank #1" but a sponsored ad above the prospect
      // visually contradicts that. Walk all result cards, detect sponsored,
      // and remove them so the visible result list matches the organic rank.
      const allCards = Array.from(document.querySelectorAll(
        'div[role="article"], div.Nv2PK, div.UaQhfb'
      ));
      for (const card of allCards) {
        if (isSponsoredBlock(card)) {
          card.style.display = 'none';
        }
      }
      // Also nuke common Google Ads side-panel chrome ("Ad" pill, sub-cards
      // like "Free Installation Quote" that hang under sponsored result).
      const adsChrome = Array.from(document.querySelectorAll(
        '[aria-label="Ad" i], [aria-label*="Sponsored" i], [data-value="ad" i]'
      ));
      for (const el of adsChrome) {
        const root = el.closest('div[role="article"], div.Nv2PK, div.UaQhfb') || el;
        root.style.display = 'none';
      }

      // Locate the anchor whose href matches the resolved organic listing.
      const anchors = Array.from(document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]'));
      const stripQuery = (h) => String(h || '').split('?')[0];
      const targetStripped = stripQuery(targetHref);
      const anchor =
        anchors.find((a) => a.href === targetHref) ||
        anchors.find((a) => stripQuery(a.href) === targetStripped);
      if (!anchor) return false;

      const match = anchor.closest('div[role="article"], div.Nv2PK') || anchor.parentElement;
      if (!match) return false;
      // Belt-and-suspenders: refuse to outline a sponsored card even if the
      // href resolver returned one (it shouldn't, but if Maps DOM changes
      // shape it could). Better to show no outline than the wrong outline.
      if (isSponsoredBlock(match)) return false;

      // Highlight the card so it pops in the recording.
      // 2026-06-03: Maps SPA can remove inline styles via DOM mutations during
      // result-list updates (caught on Oasis Plumber's — outline appeared for
      // <1s before being wiped). Re-apply every 250ms via setInterval so the
      // outline persists for the full pre-click hold even if Maps mutates the
      // card. Cleared on the 9000ms safety timeout.
      const applyOutline = () => {
        match.style.outline = '4px solid #2f57eb';
        match.style.outlineOffset = '2px';
        match.style.transition = 'outline 0.3s ease-in-out';
        match.style.boxShadow = '0 0 0 6px rgba(47,87,235,0.25)';
      };
      applyOutline();
      match.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const reapplyId = setInterval(applyOutline, 250);
      setTimeout(() => {
        clearInterval(reapplyId);
        match.style.outline = '';
        match.style.outlineOffset = '';
        match.style.boxShadow = '';
      }, 9000);
      return true;
    }, href);
    if (centered) {
      // 2026-06-03: extended from 4000 → 6000ms. Recording needs longer hold
      // on the competitive context view (highlighted prospect among competitors)
      // before navigation. Locked after Oasis Plumber's blue-outline-flash bug.
      await sleep(6000);
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
  const detailH1Ok = await page.waitForFunction(
    () => !!document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]'),
    { timeout: 8000 },
  ).then(() => true).catch(() => false);

  // 2026-06-03: nav-verify fallback. If h1 didn't appear within 8s AND the URL
  // didn't change to /place/, the click silently failed (caught on Oasis
  // Plumber's — panel re-mounted, outline got wiped, click never registered).
  // Fall back to explicit page.goto to force navigation. This gets us onto
  // the detail page so the 12s detail-hold sleep actually shows the prospect's
  // card, not a results panel.
  if (!detailH1Ok) {
    const currentUrl = page.url();
    if (!/\/maps\/place\//.test(currentUrl)) {
      console.warn(`   ⚠️ click didn't navigate to /place/ (still on ${currentUrl.slice(-80)}); forcing page.goto fallback`);
      try {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
        await page.waitForFunction(
          () => !!document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]'),
          { timeout: 6000 },
        ).catch(() => {});
      } catch (gotoErr) {
        console.warn(`   ⚠️ fallback page.goto also failed: ${gotoErr.message || gotoErr}`);
      }
    } else {
      console.warn('   ⚠️ detail-page h1 not detected within 8s but URL is /place/ — proceeding');
    }
  }
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

// 2026-06-03 — Maps card-open often leaves the map zoomed-out at state/region
// level instead of city-level. Cause: Maps' SPA picks a wide zoom to fit the
// business's service-area bounds when the detail card opens. Effect: the
// recording loses the competitive-context view (city + competing pins) that
// makes the "you rank #X out of these" narrative work. Caught 2026-06-03 on
// the Plumbers Santa Monica batch — confirmed on Santa Monica Drain Co. AND
// Enviro Plumbing (state-zoom showing all of California / Mexico baja).
//
// Fix: after detail panel opens, fire keyboard '+' key presses to advance
// Maps' built-in zoom-in handler. Each '+' = one zoom level. From typical
// state-zoom (~7) we need ~5 presses to reach city-zoom (~12-13). Maps
// responds to '+' globally (no focus required) — verified in headless
// Chromium.
//
// Memory: feedback_maps_card_visibility_rules.md.
async function forceMapsCityZoom(page, label = 'detail') {
  // 2026-07-21 ADAPTIVE fix: the old FIXED 5 presses assumed the map opened at state-zoom (~7).
  // On the 07-20 Auto-glass batch the detail card opened at CONTINENT zoom (~3 — the whole USA +
  // oceans, scale "500 mi"), so 5 presses only reached region level and Culver City was a dot.
  // Instead, read the LIVE zoom from the Maps URL (@lat,lng,Zz) and press the on-screen Zoom-in
  // button until we reach city level. Adapts to ANY starting zoom and stops at target, so it can
  // neither under-zoom (continent) nor over-zoom (street). Zoom-in BUTTON (not the '+' key) stays
  // the mechanism — the key types into the focused search box and re-runs the search (2026-06-22).
  // Zoom the OPEN map to city level (~13) so the local map-pack + competing pins are in frame. Use ONLY
  // the on-screen Zoom-in BUTTON — never a page.goto (a reload DESTROYS an SPA-selected card: the 07-21
  // regression that shipped cardless "results view" videos), and never the '+' key (types into the search
  // box + re-runs the search — 2026-06-22). ADAPTIVE: read the live zoom from the URL and press until >=13.
  // A FIXED count under-zooms when the map opens at continent level (the 07-20 bug, whole-USA maps). Button
  // clicks don't deselect the card, and with a place selected Maps anchors the zoom on it (stays centered).
  const TARGET_ZOOM = 13, MAX_PRESSES = 14, PRESS_DELAY_MS = 280;
  const readZoom = () => { const m = (page.url() || '').match(/@-?[\d.]+,-?[\d.]+,([\d.]+)z/); return m ? parseFloat(m[1]) : null; };
  // 2026-08-10 — TRUST THE RENDERED SCALE BAR, NOT THE URL. alternative-energy-llc-california shipped
  // with the whole state on screen ("50 mi") even though this function reported it was done: when a
  // detail card opens, Maps fits the map to the business's bounds but the URL keeps the PLACE's own
  // @…,17z token, so readZoom() said "already at city level" and zero presses fired. The scale bar in
  // the bottom-right corner is the only signal that reflects what is actually drawn — and it's the same
  // signal the acceptance gate measures, so capture and QA now agree by construction.
  // Read it structurally (leaf node, bottom-right, "<number> <unit>") — no Maps class names to rot.
  const CITY_SCALE_MAX_M = 2 * 1609.34;   // <= 2 mi on the bar = city level (matches check-video-acceptance)
  const readScaleMeters = async () => {
    try {
      return await page.evaluate(() => {
        const W = window.innerWidth, H = window.innerHeight;
        const re = /^\s*(\d+(?:[.,]\d+)?)\s*(ft|mi|km|m)\s*$/i;
        let widest = null;
        for (const el of document.querySelectorAll('div,span,button,td')) {
          if (el.children.length) continue;                       // leaf text nodes only
          const m = (el.textContent || '').trim().match(re);
          if (!m) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || r.top < H * 0.8 || r.left < W * 0.5) continue;   // the scale bar's corner
          const v = parseFloat(m[1].replace(',', '')), u = m[2].toLowerCase();
          const meters = u === 'ft' ? v * 0.3048 : u === 'mi' ? v * 1609.34 : u === 'km' ? v * 1000 : v;
          if (widest === null || meters > widest) widest = meters;
        }
        return widest;
      });
    } catch { return null; }
  };
  // City level per the RENDERED scale bar; fall back to the URL zoom only when the bar can't be read.
  const atCityLevel = async () => {
    const m = await readScaleMeters();
    if (m !== null) return m <= CITY_SCALE_MAX_M;
    const z = readZoom();
    return z !== null && z >= TARGET_ZOOM;
  };
  // 2026-07-27 HARDEN: re-query the zoom-in button EACH iteration + widen selectors. The old code
  // fetched the handle ONCE before the loop; Maps re-renders its controls, so a stale/detached handle
  // makes every .click() silently no-op → the map never zooms and a CONTINENT view ships (the 07-24
  // failure this backstops with Check C). Re-querying picks up the live button; the bail threshold went
  // 8→10 so an unreadable-zoom start still reaches city (~13) from a continent (~3) origin.
  const ZOOM_SEL = 'button[aria-label="Zoom in"], button#widget-zoom-in, button[aria-label*="Zoom in"], button[jsaction*="zoom.in"]';
  try {
    let pressed = 0, z = readZoom();
    while (pressed < MAX_PRESSES && !(await atCityLevel())) {
      const zoomBtn = await page.$(ZOOM_SEL);   // live handle each iteration (Maps re-renders controls)
      if (zoomBtn) {
        await zoomBtn.click({ delay: 20 }).catch(() => {});
      } else {
        // No zoom button found → focus the map canvas (not the search input) and use '+'.
        await page.evaluate(() => {
          const ae = document.activeElement; if (ae && ae.tagName === 'INPUT') ae.blur();
          const c = document.querySelector('canvas'); if (c) { c.setAttribute('tabindex', '0'); c.focus(); }
        }).catch(() => {});
        await page.keyboard.press('+');
      }
      pressed++;
      await sleep(PRESS_DELAY_MS);
      z = readZoom();
    }
    const finalScale = await readScaleMeters();
    const scaleTxt = finalScale === null ? 'unreadable' : `${Math.round(finalScale)}m`;
    console.log(`   → ${label}: city-zoom — ${pressed} button press(es), scale≈${scaleTxt}, zoom≈${z ?? 'unknown'} (card preserved)`);
    // Leave a loud trace when the map is STILL wide after the press budget: the acceptance gate will
    // reject the finished video for it, and this line is what explains why in the run log.
    if (finalScale !== null && finalScale > CITY_SCALE_MAX_M) {
      console.warn(`   ⚠️ ${label}: map still wide (scale ${scaleTxt} > ${Math.round(CITY_SCALE_MAX_M)}m) after ${pressed} press(es) — the acceptance gate will reject this render.`);
    }
  } catch (err) {
    // Non-fatal — if zoom input fails (rare), recording continues at
    // whatever zoom Maps left us with. Better than crashing the lead.
    console.warn(`   ⚠️ ${label}: forceMapsCityZoom failed (non-fatal): ${err.message || err}`);
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
      // 2026-06-22: position the business NAME near the top of the panel — NOT scrollTop=0,
      // which shows the giant hero photo and pushes the address/hours/website/buttons off
      // screen (Chris: "the full open card view so you can see the entire card", not the
      // cut-off "zoom" view). Scrolling the h1 to the top collapses the hero to a compact
      // header and reveals the full card detail. Re-assert every 500ms for 18s.
      const resetScroll = () => {
        if (scroller && scroller !== document.body) {
          try {
            const hRect = heading.getBoundingClientRect();
            const sRect = scroller.getBoundingClientRect();
            scroller.scrollTop += (hRect.top - sRect.top) - 6;
          } catch (_) { scroller.scrollTop = 0; }
        }
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

async function goToMapsShowResultsThenOpenBusiness(page, meta, afterMapsNavigation, recorderCtl = null) {
  // 2026-06-22: hold on the prospect's detail card by INJECTING a dedicated card
  // screenshot into the recorder instead of relying on the auto-capture loop, which
  // returns stale/wrong frames on an auto-opened (page.goto) detail page. A standalone
  // page.screenshot() captures the card reliably (proven via the diagnostic), so we pause
  // the loop, push a real card frame, and re-prime periodically across the hold.
  // 2026-06-22: capture the detail CARD via macOS screencapture of the real Chrome window.
  // page.screenshot HANGS ~176s on a goto-opened detail page, and CDP screencast white-outs
  // the WebGL map — but the OS screen-grab gets exactly what's on screen (card + map), which
  // is what Chris sees live. Requires Screen Recording permission (granted). Crop to the
  // Chrome content region, scale to the encoder's viewport size, inject as the frame.
  const execAsync = (cmd, args) => new Promise((resolve) => {
    try { const p = spawn(cmd, args, { stdio: 'ignore' }); p.on('close', (c) => resolve(c === 0)); p.on('error', () => resolve(false)); }
    catch (_) { resolve(false); }
  });
  let _osScale = 0; // device-px ÷ points (Retina backing scale), computed once
  // 2026-06-26: CROSS-WORKER MAPS-CAPTURE LOCK. The Maps grab takes a FULL-SCREEN screenshot + crops
  // to the frontmost Chrome. With WORKER_COUNT>1 (parallel leads), two workers grabbing at once would
  // capture EACH OTHER's window (same failure as a foreground app stealing the screen). So serialize
  // ONLY the activate+screenshot (~the exclusive-screen moment) behind a lockfile; everything else
  // (website/mobile recording, ffmpeg crop, encoding) still runs parallel across workers. No-op when
  // WORKER_COUNT is unset/1 (sequential) → zero change to the current 1-at-a-time behavior.
  // [[feedback-rerender-must-be-segment-scoped]] (don't-mess-with-optimization) + idle-base 3-worker plan.
  const SCREEN_LOCK = '/tmp/rga-screencap.lock';
  const lockActive = () => process.env.WORKER_COUNT && process.env.WORKER_COUNT !== '1';
  const acquireScreenLock = async (timeoutMs = 90000) => {
    if (!lockActive()) return true;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try { fs.writeFileSync(SCREEN_LOCK, String(process.pid), { flag: 'wx' }); return true; }
      catch (_) {
        try { const st = fs.statSync(SCREEN_LOCK); if (Date.now() - st.mtimeMs > 30000) { fs.unlinkSync(SCREEN_LOCK); continue; } } catch (_) {}
        await sleep(150 + Math.floor((process.pid % 7) * 30)); // jitter by pid so workers don't lockstep
      }
    }
    console.warn('   [screencap-lock] acquire timed out — proceeding fail-open');
    return false; // fail-open: better a small risk than a hung worker
  };
  const releaseScreenLock = () => { if (!lockActive()) return; try { fs.unlinkSync(SCREEN_LOCK); } catch (_) {} };
  const grabViaScreenCapture = async () => {
    let _held = false;
    try {
      _held = await acquireScreenLock(); // exclusive screen for the activate+screenshot below
      // 2026-06-26: OS-LEVEL bring our Chrome to the front. page.bringToFront() only orders tabs
      // WITHIN Chrome — it does NOT make Chrome the frontmost macOS app. So if another window is on
      // top at grab time, the full-screen screencapture grabs THAT instead of Maps (Chris saw a
      // Liberty Tribune window captured). Activate OUR specific Chrome process by PID via System
      // Events (not by app name — that could surface Chris's separate Chrome window).
      try {
        const pid = page.browser().process() && page.browser().process().pid;
        if (pid) await execAsync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`]);
      } catch (_) {}
      await page.bringToFront().catch(() => {});
      // 2026-06-26: RE-ASSERT the wide physical window right before the grab. A focus-stealing macOS
      // system dialog (Dictation prompt, 'find devices on local networks', etc.) can shrink/move the
      // Chrome window. Viewport emulation keeps window.innerWidth=1600 regardless, so the crop math
      // below (which uses innerWidth) then captures the NARROW physical Chrome + white desktop beside
      // it = the "1/4-size in the corner" defect Chris caught. Forcing bounds back to 1640 wide every
      // grab keeps the capture tight no matter what stole focus. (Popups themselves are separately
      // prevented: Chrome Cast/mDNS flags in launch args + macOS AppleDictationAutoEnable=0.)
      try {
        const _s = await page.target().createCDPSession();
        const { windowId } = await _s.send('Browser.getWindowForTarget');
        await _s.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: 1640, height: 1040, windowState: 'normal' } });
        await _s.detach().catch(() => {});
      } catch (_) {}
      const m = await page.evaluate(() => ({ sx: window.screenX, sy: window.screenY, iw: window.innerWidth, ih: window.innerHeight, oh: window.outerHeight, scrW: window.screen.width }));
      // FULL-SCREEN capture + ffmpeg crop (NOT `screencapture -R`). `-R` fails outright here with
      // "could not create image from rect" (every rect), while a full `screencapture -x` works and
      // returns the whole display in DEVICE pixels. So we grab the full screen, then crop the
      // Chrome content area in device-pixel space and downscale to the 16:9 output.
      const stamp = `${process.pid}-${Date.now()}`;
      const png = `/tmp/sc-${stamp}.png`, jpg = `/tmp/sc-${stamp}.jpg`;
      const okPng = await execAsync('screencapture', ['-x', png]);
      // screenshot done → release the exclusive-screen lock NOW; the ffmpeg crop below is CPU-only
      // and can overlap other workers' captures.
      releaseScreenLock(); _held = false;
      if (!okPng || !fs.existsSync(png)) return null;
      // Device-pixel dimensions of the full capture, and the backing scale (devicePx / points).
      const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', png]);
      const [capW, capH] = String(probe.stdout || '').trim().split(',').map(n => parseInt(n, 10));
      if (!capW || !capH) { try { fs.unlinkSync(png); } catch (_) {} return null; }
      const s = (m.scrW ? capW / m.scrW : 2) || 2; // 2 on Retina
      // Window content rect in POINTS → DEVICE px (×s). Content top = window top + full chrome.
      let cx = Math.round(m.sx * s);
      let cy = Math.round((m.sy + (m.oh - m.ih)) * s);
      let cw = Math.round(m.iw * s);
      let ch = Math.round(m.ih * s);
      // Clamp to the captured image bounds.
      cx = Math.max(0, Math.min(cx, capW - 2));
      cy = Math.max(0, Math.min(cy, capH - 2));
      cw = Math.max(2, Math.min(cw, capW - cx));
      ch = Math.max(2, Math.min(ch, capH - cy));
      if (process.env.SC_DEBUG) console.log(`   [sc-debug] m=${JSON.stringify(m)} cap=${capW}x${capH} s=${s} -> crop=${cw}:${ch}:${cx}:${cy}`);
      if (cw < 200 || ch < 200) { try { fs.unlinkSync(png); } catch (_) {} return null; }
      const okJpg = await execAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${MAPS_VIEWPORT.width}:${MAPS_VIEWPORT.height}`, '-q:v', '4', jpg]);
      let buf = null;
      if (okJpg && fs.existsSync(jpg)) buf = fs.readFileSync(jpg);
      if (process.env.SC_DEBUG) { try { fs.copyFileSync(jpg, '/tmp/sc-raw-debug.jpg'); } catch (_) {} }
      try { fs.unlinkSync(png); } catch (_) {}
      try { fs.unlinkSync(jpg); } catch (_) {}
      return buf;
    } catch (_) { return null; }
    finally { if (_held) releaseScreenLock(); } // safety: never leave the lock held on an early return/throw
  };
  // 2026-07-31 LEAK-SAFE DAYTIME FREEZE (DAYTIME_SAFE_CAPTURE=1). page.screenshot captures ONLY the
  // browser PAGE (never the desktop, never another window), so it CANNOT leak desktop content — the exact
  // risk the night-lock guards against — and it's immune to window-focus/cross-worker contention (the deep-
  // rank "no card" bug). Proven to capture a CLICK-opened detail card reliably (the diagnostic at line ~1309;
  // it only hangs on GOTO-opened pages, which this rebuild path never uses). Used to rebuild broken videos in
  // the daytime without the desktop screencapture. Scales to the same MAPS_VIEWPORT output as the desktop grab.
  const grabViaPageShot = async () => {
    try {
      const stamp = `${process.pid}-${Date.now()}`;
      const raw = `/tmp/ps-${stamp}.jpg`, out = `/tmp/ps-${stamp}-s.jpg`;
      const shot = await Promise.race([
        page.screenshot({ type: 'jpeg', quality: 92, captureBeyondViewport: false }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('page.screenshot timeout')), 8000)),
      ]).catch(() => null);
      if (!shot) return null;
      fs.writeFileSync(raw, shot);
      const ok = await execAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${MAPS_VIEWPORT.width}:${MAPS_VIEWPORT.height}`, '-q:v', '4', out]);
      let buf = null;
      if (ok && fs.existsSync(out)) buf = fs.readFileSync(out);
      try { fs.unlinkSync(raw); } catch (_) {}
      try { fs.unlinkSync(out); } catch (_) {}
      return buf;
    } catch (_) { return null; }
  };
  // Pick the freeze method: leak-safe page.screenshot for daytime rebuilds, else the night desktop grab.
  const DAYTIME_SAFE = process.env.DAYTIME_SAFE_CAPTURE === '1';
  // 2026-08-03 DEEP-RANK NO-CARD FIX: when the detail card was opened IN-PAGE (SPA typed-search or an in-list
  // click), page.screenshot captures it reliably. The macOS `screencapture` path has a frontmost/crop race that
  // intermittently returns null → the whole Maps segment then freezes on the pre-nav results LIST (the 08-02 Med
  // spa batch: 17/21 deep-rank leads shipped card-less, caught by the visual gate = "landing not built"). Only a
  // raw page.goto-opened card hangs page.screenshot; an in-page-opened one does not. So for an in-page-opened card
  // force the page-shot grab. Set true by the deep-rank block after an SPA/click open, false on the goto fallback.
  let _cardOpenedInPage = false;
  const grabFreeze = async () => ((DAYTIME_SAFE || _cardOpenedInPage) ? grabViaPageShot() : grabViaScreenCapture());

  async function zoomOutMap(page, steps) {
    // Zoom the Maps canvas OUT `steps` times so the held frame shows a wide regional view.
    // Prefer Google's on-map "Zoom out" button (focus-independent); fall back to keyboard '-'.
    const n = Math.max(0, Math.min(8, Number(steps) || 0));
    for (let i = 0; i < n; i++) {
      let clicked = false;
      try {
        clicked = await page.evaluate(() => {
          const btn = document.querySelector('button#widget-zoom-out, button[jsaction*="zoom.out"], button[aria-label="Zoom out"], button[aria-label*="Zoom out"]');
          if (btn) { btn.click(); return true; }
          return false;
        });
      } catch (_) {}
      if (!clicked) {
        try { await page.bringToFront(); } catch (_) {}
        try {
          // focus the map surface, then press '-'
          await page.evaluate(() => { const c = document.querySelector('canvas, [aria-label="Map"]'); if (c) c.focus && c.focus(); });
          await page.keyboard.press('Minus');
        } catch (_) {}
      }
      await sleep(550); // let the zoom animation play between steps
    }
    console.log(`   [zoom-out] map zoomed out ${n} step(s) for wide regional view`);
  }

  // 2026-06-26: UNIVERSAL top-align. Per-branch one-shot scrollTop=0 was flaky — async card content
  // (reviews/photos/owner blurbs) loads AFTER it and the panel re-scrolls, so some cards opened
  // scrolled past the hero photo + rating (Chris caught Derek R. Ewin AND Crystal Vision). Fix: zero
  // EVERY scrollable container in the detail panel RIGHT BEFORE the frozen grab — not the first one
  // found, and re-asserted at capture time so nothing can re-scroll it. Applies to BOTH the deep-rank
  // and scroll-find paths (both end in holdOnDetailCard), so it can't regress per-lead.
  const forceCardToTop = async () => {
    await page.evaluate(() => {
      const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
      const zero = (el) => { try { if (el && el.scrollHeight > el.clientHeight + 4) el.scrollTop = 0; } catch (_) {} };
      // 1) every scrollable ANCESTOR of the card heading (whichever one Maps actually scrolls)
      if (h1) { let el = h1.parentElement; while (el && el !== document.body) { const o = getComputedStyle(el).overflowY; if (o === 'auto' || o === 'scroll') zero(el); el = el.parentElement; } }
      // 2) known Maps detail scroll panels by class/role, as a backstop
      document.querySelectorAll('div[role="main"], div.m6QErb.DxyBCb, div.m6QErb.WNBkOb, div.m6QErb').forEach(zero);
    }).catch(() => {});
  };

  // 2026-07-29 FIX (systemic blank-photos bug): Google LAZY-LOADS the GBP card's hero photo + Photos strip
  // AFTER the card opens. The capture-once-then-freeze grabbed the frame TOO EARLY → froze a BLANK photos
  // strip across many videos (Chris caught it batch-wide 2026-07-28). Poll (bounded) until (a) the card is
  // actually open (h1 present) AND (b) a real Google-hosted photo <img> has rendered — THEN we freeze, so
  // photos are in the frame. Returns after maxMs regardless (a genuinely photo-less GBP still proceeds).
  // minMs GUARANTEES a settle window even if the quick photo-check is fooled by a map tile or a results-
  // list image — the detection is scoped to business-photo CDNs (lh*.googleusercontent / streetviewpixels /
  // gps-cs) and >90px, with map tiles (maps.gstatic/khms/vt) excluded, but the min-wait is the real
  // safety net. maxMs caps it so a genuinely photo-less GBP still proceeds. Returns {open} so the caller
  // can tell the card NEVER opened (the "no detail card" failure) vs opened-but-slow-photos.
  const waitForDetailCardReady = async (minMs = 2600, maxMs = 18000) => {
    // 2026-07-30 HARDENED (blank-photos kept shipping): (a) longer cap — 5s wasn't enough for the hero
    // photo to lazy-load on slower cards; (b) BROADER photo detection — <img> AND CSS background-image,
    // any Google photo CDN (lh*.googleusercontent / *.ggpht / streetviewpixels / gps-cs / googleusercontent),
    // map tiles excluded; (c) if no photo by ~half the window, nudge-scroll the card to TRIGGER the lazy-load,
    // then keep polling. Returns {open, photo} so the caller can HARD-FAIL a card that never showed a photo.
    const start = Date.now();
    let everOpen = false, lastNudge = -99999, sawPhotoAffordance = false;
    while (Date.now() - start < maxMs) {
      const elapsed = Date.now() - start;
      const state = await page.evaluate(() => {
        const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
        if (!h1) return { open: false, photo: false, hasPhotos: false };
        const isPhoto = (url) => /(googleusercontent\.com|ggpht\.com|streetviewpixels-pa|\/gps-cs)/i.test(url) &&
          !/(maps\.gstatic|khms|\/vt\/|\/maps\/vt|gstatic\.com\/mapspro)/i.test(url);
        // 2026-07-30 PROVEN FIX (validated headless on Probate): detect the HERO-sized card photo (rendered
        // width > 250px) DOCUMENT-WIDE. The old check scoped to div[role="main"] + size>80 → it matched ~60px
        // feed thumbnails but MISSED the real hero (the card panel isn't always under role=main), so it timed
        // out and froze a BLANK frame even though the hero had loaded. Hero-size + document-wide fixes it.
        let photo = Array.from(document.querySelectorAll('img')).some((im) => {
          const s = im.currentSrc || im.src || '';
          const r = im.getBoundingClientRect();
          return im.complete && im.naturalWidth > 150 && isPhoto(s) && r.width > 250;
        });
        // CSS background-image hero (some cards render the hero as a bg-image)
        if (!photo) {
          photo = Array.from(document.querySelectorAll('a,div,button,span')).some((el) => {
            const bg = getComputedStyle(el).backgroundImage || '';
            if (!/^url\(/i.test(bg) || !isPhoto(bg)) return false;
            const r = el.getBoundingClientRect();
            return r.width > 250 && r.height > 100;
          });
        }
        // Does the card ADVERTISE photos? (a photo COUNT / "Photos & videos" section / a hero photo button
        // that exists even while its <img> is still loading). If the card claims photos exist but the hero
        // never painted (photo===false), that's a LOAD FAILURE (blank-white hero) — NOT an honest photo-less
        // business — and the caller HARD-FAILS it so a blank hero can't ship. Honest no-photo businesses show
        // Google's blue placeholder with NO such affordance → photo===false + hasPhotos===false → still ship.
        // 2026-08-06: added after main-street-optometry shipped a blank-white hero despite advertising 19 photos
        // (the visual gate — the only backstop — was OpenAI-vision, fail-open, and blind during the credit outage).
        let hasPhotos = false;
        try {
          const scope = document.querySelector('div[role="main"]') || document.body;
          const txt = (scope.innerText || '');
          if (/\b\d+\s+photos?\b/i.test(txt) || /photos?\s*&\s*videos?/i.test(txt)) hasPhotos = true;
          if (!hasPhotos && document.querySelector('button[aria-label^="Photo" i], button[jsaction*="hero" i], button[data-photo-index]')) hasPhotos = true;
        } catch (_e) {}
        return { open: true, photo, hasPhotos };
      }).catch(() => ({ open: false, photo: false, hasPhotos: false }));
      if (state.open) everOpen = true;
      if (state.hasPhotos) sawPhotoAffordance = true;
      if (state.open && state.photo && elapsed >= minMs) { await sleep(600); return { open: true, photo: true, hasPhotos: true }; }  // photos loaded + let the paint settle before the caller grabs
      // 2026-08-04 (blank-photos regression fix): nudge-scroll REPEATEDLY (every ~2.5s) while no photo, not just
      // once, to keep forcing Google's lazy-load of the hero/Photos strip on slow cards — the single nudge + 9s cap
      // wasn't enough and blank hero bands shipped (Chris caught coco-lane/trusmile orthodontists). Longer 18s cap.
      if (state.open && !state.photo && elapsed - lastNudge > 2500) {
        lastNudge = elapsed;
        await page.evaluate(() => {
          const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
          let s = h1 && h1.parentElement;
          while (s && s !== document.body) { const o = getComputedStyle(s).overflowY; if ((o === 'auto' || o === 'scroll') && s.scrollHeight > s.clientHeight) break; s = s.parentElement; }
          const el = (s && s !== document.body) ? s : document.querySelector('div[role="main"]');
          if (el) { el.scrollBy(0, 200); setTimeout(() => el.scrollBy(0, -200), 300); }
        }).catch(() => {});
      }
      await sleep(250);
    }
    return { open: everOpen, photo: false, hasPhotos: sawPhotoAffordance };  // timed out — .open===false ⇒ no card; .photo===false ⇒ blank hero; .hasPhotos===true ⇒ blank was a LOAD FAILURE (photos exist), not honest photo-less
  };

  async function holdOnDetailCard(ms) {
    if (!recorderCtl || !recorderCtl.pauseCapture) { await sleep(ms); return; }
    // Pause the auto-capture loop (its screenshots hang on a goto-opened detail page).
    recorderCtl.pauseCapture();
    // CAPTURE-ONCE-THEN-FREEZE: grab a SINGLE good frame right after the card opens (full card +
    // wide map at normal scale — the view Chris wants) and hold THAT one frame for the whole
    // segment. Re-grabbing every 2s let Google's auto recenter/zoom-in animation drift the map
    // into a tight "zoomed" view by the back half of the hold (the exact thing Chris rejected).
    // Freezing the early frame keeps the wide, normal-scale view for the entire hold.
    // Force the card to the top + let any reflow settle, THEN re-assert once more, THEN grab.
    await forceCardToTop();
    await sleep(500);
    await forceCardToTop();
    // 2026-07-29 SYSTEMIC BLANK-PHOTOS FIX: do NOT freeze until the card's business photos have actually
    // rendered (the frozen frame was locking in a gray placeholder strip). Guaranteed settle window +
    // scoped photo detection. If the card never opened (.open===false), log it loudly — that's the
    // "no detail card" failure (frozen on the raw results list); the 6/6 + visual gate should catch it.
    const _cardReady = await waitForDetailCardReady();
    // 2026-07-31 HARD-FAIL (Chris caught deep-rank "no card / no blue lines" batch-wide): the deep-rank
    // path PAUSES live capture on the results frame, so the card exists ONLY via the injected grab below.
    // If the card DOM never opened, freezing here would ship the raw results list forever. Do NOT ship it —
    // throw so the lead FAILS the 6/6 gate and lands in the redo queue instead of going out with no card.
    if (!_cardReady.open) {
      throw new Error('[step-3 GUARDRAIL] holdOnDetailCard: detail card never opened (h1 absent) — refusing to freeze the raw results list. See feedback_maps_card_visibility_rules.md + feedback_video_capture_screen_must_be_clear.md');
    }
    // 2026-08-06 BLANK-HERO HARD-FAIL (deterministic, OpenAI-independent). The card opened but the hero photo
    // never painted (photo===false) WHILE the card advertises photos (hasPhotos===true — a photo count /
    // "Photos & videos" section / hero button). That's a load-failure blank-white hero, NOT an honest photo-less
    // business — so freezing here would ship a blank-white photo band (main-street-optometry, 08-05: advertised
    // 19 photos, hero blank). Throw to fail the lead into the redo queue rather than relying on the fail-OPEN
    // OpenAI-vision visual gate (which was blind during the credit outage). Honest no-photo GBPs have no photo
    // affordance (hasPhotos===false) and still ship with Google's blue placeholder.
    // See feedback_video_creation_correctness_locked.md (blank-photos) + project_video_pipeline_integrity.md.
    if (_cardReady.open && !_cardReady.photo && _cardReady.hasPhotos) {
      throw new Error('[step-3 GUARDRAIL] holdOnDetailCard: hero photo never painted though the card advertises photos (blank-white hero = load failure) — refusing to freeze a blank hero; failing the lead to the redo queue. See feedback_video_creation_correctness_locked.md');
    }
    await forceCardToTop();
    // Re-verify the card is STILL DOM-open at the exact instant we accept the frozen frame. grabViaScreenCapture
    // re-asserts OUR Chrome as frontmost (System Events, by PID) + re-forces the wide window bounds every grab,
    // so with the main pass now single-worker (no cross-worker frontmost fight) a confirmed-open card is what
    // the screencapture sees. Gate the accept on a fresh h1 check so a transient close/deselect can't be frozen.
    const _cardStillOpen = async () => await page.evaluate(() => {
      const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
      return !!(h1 && (h1.textContent || '').trim().length > 1);
    }).catch(() => false);
    let frozen = null;
    for (let i = 0; i < 4 && !frozen; i++) {     // a few quick tries to land one clean grab
      if (!(await _cardStillOpen())) { await forceCardToTop(); await sleep(400); continue; }
      const buf = await grabFreeze();
      if (buf && await _cardStillOpen()) frozen = buf;   // card confirmed open BOTH sides of the grab
      else await sleep(400);
    }
    if (!frozen) {                                // grab failed entirely → fall back to the old re-grab loop
      const until = Date.now() + ms;
      let got = 0;
      while (Date.now() < until) {
        const buf = await grabFreeze();
        if (buf) { recorderCtl.pushFrame(buf); got++; }
        await sleep(2000);
      }
      console.log(`   [screencap] detail-hold (fallback) pushed ${got} real-screen card frame(s)`);
      return;
    }
    const until = Date.now() + ms;
    let pushed = 0;
    while (Date.now() < until) {                  // freeze: feed the SAME early frame the whole hold
      recorderCtl.pushFrame(frozen); pushed++;
      await sleep(500);
    }
    console.log(`   [screencap] detail-hold froze 1 early frame, pushed ${pushed}x (no map-zoom drift)`);
  }
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
  // 2026-06-12: raised 10 → 20. The URL-nav fallback (used for rank > threshold)
  // is unreliable — for ambiguous / duplicate-listing names (e.g. Ford's Plumbing
  // #14, which has a duplicate GBP) the bare-name Maps URL resolves to a RESULTS
  // LIST, not a detail page, so the prospect's card never opens (Chris caught it
  // on review). scroll-find-click is the only reliable card-open and reaches
  // same-area leads through ~rank 20. URL fallback now only for genuinely deep /
  // off-area leads (rank > 20, not on the scrollable results panel — see rev3).
  const DEEP_RANK_THRESHOLD = 20;
  if (DEEP_RANK_THRESHOLD !== 20) {
    throw new Error('[step-3 GUARDRAIL] DEEP_RANK_THRESHOLD must stay at 20. See feedback_maps_card_visibility_rules.md');
  }
  const skipScrollAttempt = rank !== null && rank > DEEP_RANK_THRESHOLD;

  // Scroll enough panels to expose the business at its actual rank position.
  // Each scroll reveals ~5 listings; add 2 extra as buffer.
  // 2026-06-12: +4 buffer (was +2). Live Maps rank drifts vs the step-1 scrape
  // (Ford's scraped #14 but lives at #17 now) + sponsored cards push the prospect
  // down, so scroll a bit further than the scraped rank implies.
  const scrollsNeeded = rank !== null ? Math.ceil(rank / 5) + 4 : 6;

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

    // 2026-05-27 REMOVED early injectRankOverlay call. Previously the rank
    // overlay was injected immediately after recorder start so it was visible
    // from frame 1 — but this also made it appear during the search-results
    // list view BEFORE the prospect's detail card opens. Chris flagged this
    // as visually confusing: the rank overlay should only appear once the
    // viewer is looking at the prospect's actual Maps detail card.
    //
    // Each detail-page-landed code path below already calls injectRankOverlay
    // immediately upon reaching the detail page. The 500ms self-reinjection
    // then keeps it visible for the rest of the recording.

    if (query) {
      await waitForMapsResults(page);
      await sleep(1500);

      const inputSelector = await waitForMapsSearchInput(page);
      console.log(`   → Maps search: ${query}`);
      await clearAndType(page, inputSelector, query);
      await page.keyboard.press('Enter');
      await waitForMapsResults(page);
      // 2026-05-28 (REV 2): waitForSelector with TIGHT timeout (3s, was 10s).
      // If a.hfpxzc anchors haven't shown in 3 seconds they're not going to
      // show — Google's serving us a layout variant without that class. Bail
      // FAST so the URL-nav fallback fires earlier in the Maps recording,
      // leaving more time for the prospect's detail card to be on screen
      // before the segment ends. Chris's locked priority: processing time +
      // detail card visibility > intermittent native-expand UX.
      // 2026-06-12: wait LONGER for result anchors to render before scroll-find.
      // Chrome 149 renders the results panel slower than the old Mac's Chrome; the
      // old 3s "bail fast" timeout meant scroll-find ran against ZERO anchors
      // (top5 empty → no match → URL fallback → no detail card). Verified via a
      // live DOM probe: anchors are present by ~7s. Chris's "card must show"
      // priority overrides the earlier processing-time-first bail-fast rule.
      await page.waitForSelector('a.hfpxzc', { timeout: 9000 }).catch(() => {});
      await sleep(1500); // settle so cards are interactive before scroll-find
      // 2026-06-22: Google normalizes the displayed category search to lowercase in the box
      // ("roofers in pasadena, ca"). Overwrite it back to Title Case with the state uppercased —
      // purely cosmetic, the search already ran. Chris wants "Roofers In Pasadena, CA".
      // Re-assert a few times since React can re-render the controlled input.
      // A one-shot set gets reverted by Maps' controlled React input within ~100ms, so install a
      // persistent interval that keeps re-asserting the Title Case value. It ONLY rewrites when the
      // box still holds the (lowercased) search term, so the later business-name search is untouched.
      const displayQuery = toTitleCaseSearch(query);
      await page.evaluate((sel, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const force = () => {
          const el = document.querySelector(sel);
          if (el && el.value && el.value.toLowerCase() === val.toLowerCase() && el.value !== val) {
            setter.call(el, val);
          }
        };
        if (window.__rgaBoxInterval) clearInterval(window.__rgaBoxInterval);
        window.__rgaBoxInterval = setInterval(force, 150);
        force();
      }, inputSelector, displayQuery).catch(() => {});
      await sleep(600);
    }

    if (businessName && !skipScrollAttempt) {
      console.log(`   → Scrolling to find and click ${businessName} (rank #${rank ?? '?'})...`);
      // 2026-05-28: cap scroll attempts at 2 (was scrollsNeeded+2 which could
      // be 6-10). When scroll-find is going to fail (intermittent Google DOM
      // variant), repeating it 6 times wastes ~25s of recording on empty
      // top5 logs. Bail fast to URL fallback so the prospect's detail card
      // gets more on-screen time before the segment ends. Per locked priority.
      // 2026-06-12: scale scroll depth to the lead's rank (was hardcoded 2, which
      // couldn't reach rank 11-20 → card never opened for those). scrollsNeeded =
      // ceil(rank/5)+2; clickListingInResultsByName checks before+after each scroll
      // so in-area leads click as soon as they appear (no wasted scrolls).
      const clicked = await scrollUntilVisibleAndClick(page, businessName, scrollsNeeded);
      if (clicked) {
        // Re-inject overlay after navigation (page.goto wipes the DOM)
        await injectRankOverlay(page, businessName, rank, searchTerm);
        await highlightBusinessOnDetailPage(page);
        // 2026-06-26: TOP-ALIGN the card (scrollTop=0) so the business hero PHOTO at the top is
        // visible. This was previously only on the deep-rank path — the top-ranked scroll-find path
        // never had it, so cards opened at whatever scroll position Google left (some showed the
        // photo, some were scrolled past it — Chris caught Derek R. Ewin scrolled down). Same block
        // as the deep-rank path. highlightBusinessOnDetailPage can scroll to the heading, so do this
        // AFTER it.
        await page.evaluate(() => {
          const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
          if (!h1) return;
          let s = h1.parentElement;
          while (s && s !== document.body) { const o = getComputedStyle(s).overflowY; if ((o === 'auto' || o === 'scroll') && s.scrollHeight > s.clientHeight) break; s = s.parentElement; }
          if (s && s !== document.body) s.scrollTop = 0; // top-align card → hero photo visible
        }).catch(() => {});
        await forceMapsCityZoom(page, 'scroll-find-click');
        await holdOnDetailCard(12000);
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
    function buildDeepRankFallbackUrls() {
      // 2026-05-27 LOCKED RULE (feedback_maps_card_open_algorithm.md): NEVER
      // use a phone-number URL in the chain — phone-search puts the phone
      // number into the visible Maps search bar (`7147369000`) which looks
      // creepy and unprofessional to the prospect watching the video. Use
      // ONLY name-based URLs: name+city first (most-likely-unique), then
      // bare name as last resort. Both keep the search bar showing the
      // business name, not the phone number.
      //
      // 2026-06-03: mapsUrl (step-1 GBP URL) inserted as FIRST attempt when
      // present. Format: /maps/place/<Name>/@<lat>,<lng>,17z/data=...
      // The @lat,lng,17z anchor disambiguates the specific business — Maps
      // jumps straight to the detail page even for generic names like
      // "Real Plumbers" or "Plumb Inc - Plumber" that would otherwise resolve
      // to a results list of the city's top plumbers. Caught 2026-06-03 on
      // multiple Plumbers Santa Monica leads. Memory:
      // feedback_maps_card_visibility_rules.md.
      const urls = [];
      // 2026-06-22: REVERTED the bare-name-skip experiment. Skipping the bare-name
      // /maps/place/Name URL removed the ~1s blank flash but REGRESSED the prospect's
      // detail-card pop-out (the deployed video stayed on the competitor results list
      // and never showed Green Planet's card — Chris confirmed the card DID show in the
      // version that still included this URL). Correctness (card must show) > polish
      // (the brief flash). Keep the bare-name URL in the chain; the blank-Maps gate +
      // non-empty-h1 detector still prevent a truly-blank recording from shipping.
      if (mapsUrl && /\/maps\/place\//.test(mapsUrl)) {
        urls.push(mapsUrl);
      }
      const nameCity = businessName + (meta.city ? ', ' + meta.city + (meta.state ? ' ' + meta.state : '') : '');
      urls.push(`https://www.google.com/maps/search/${encodeURIComponent(nameCity)}`);
      if (businessName) {
        urls.push(`https://www.google.com/maps/search/${encodeURIComponent(businessName)}`);
      }
      return urls;
    }
    // Try a navigation URL, returning a status: 'detail' | 'results' | 'blank'
    async function tryNavigateAndDetect(navUrl) {
      try {
        await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
      } catch (e) {
        return 'blank';
      }
      await sleep(2500);
      // Detect detail page via h1 selector — 2026-06-22: require NON-EMPTY h1 text.
      // A bare-name `/maps/place/Name` URL (no @lat,lng) often redirects to an
      // empty `/maps/place//@coords` blank-home shell that still contains an EMPTY
      // h1.DUwDvf — the old `!!querySelector` returned true and treated the blank
      // as 'detail', stopping the chain on a blank. The real business name must be
      // present. (feedback_maps_blank_home_must_fail_lead.md — Green Planet #25.)
      const onDetail = await page.evaluate(() => {
        const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
        return !!(h1 && h1.textContent.trim().length > 1);
      }).catch(() => false);
      if (onDetail) return 'detail';
      // Detect results panel via at least one a.hfpxzc
      const hasResults = await page.evaluate(() => {
        return document.querySelectorAll('a.hfpxzc').length > 0;
      }).catch(() => false);
      if (hasResults) return 'results';
      return 'blank';
    }

    // Shared helper: try the URL chain until one lands on detail or results
    // with a clickable matching listing. Returns once detail page is reached
    // (or chain is exhausted). Used by both no-mapsUrl + bare-name branches.
    async function navigateDeepRankChain() {
      const urls = buildDeepRankFallbackUrls();
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`   → Deep-rank nav attempt ${i + 1}/${urls.length}: ${url}`);
        const status = await tryNavigateAndDetect(url);
        console.log(`   → Result: ${status}`);
        if (status === 'detail') return true;
        if (status === 'results') {
          await injectRankOverlay(page, businessName, rank, searchTerm);
          const clicked = await clickListingInResultsByName(page, businessName);
          if (clicked) {
            console.log(`   → Clicked prospect's listing in results → detail page`);
            await sleep(1500);
            return true;
          }
          // results but no matching listing — try next URL
        }
        // blank — try next URL
      }
      console.warn(`   ⚠️ All ${urls.length} deep-rank URL attempts failed to land on detail page`);
      return false;
    }
    // Self-validation guard (2026-05-19, rule 3.11): MUST run after deep-rank
    // navigation and BEFORE the 18s detail-hold sleep. Verifies page actually
    // landed on a detail page; throws non-zero so the batch wrapper sees the
    // failure instead of silently producing a broken video. Memory:
    // feedback_maps_card_visibility_rules.md Rule 3.11.
    async function assertOnDetailPage(label) {
      const currentUrl = page.url();
      const isOnDetailUrl = /\/maps\/place\/[^/]+\/data=|\/maps\/place\/[^/]+\/@/.test(currentUrl);
      const hasDetailH1 = await page.evaluate(() =>
        !!document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]')
      ).catch(() => false);
      if (!isOnDetailUrl && !hasDetailH1) {
        try {
          const diagDir = path.join(ROOT, 'output', 'diag');
          fs.mkdirSync(diagDir, { recursive: true });
          await page.screenshot({ path: path.join(diagDir, `step-3-no-detail-${label}.png`) });
        } catch (_) {}
        throw new Error(
          `[step-3 GUARDRAIL] Deep-rank ${label} landed on ${currentUrl} — NOT a detail page. ` +
          `URL chain exhausted without success. See memory: feedback_maps_card_visibility_rules.md Rule 3.11.`
        );
      }
    }

    if (!mapsUrl && skipScrollAttempt) {
      console.log(`   → No Maps URL for deep-rank lead — running URL chain`);
      console.log(`   → Holding on results panel ~4s for competitive context`);
      await sleep(4000);
      await navigateDeepRankChain();
      await assertOnDetailPage(slugify(businessName, { lower: true, strict: true }));
      await injectRankOverlay(page, businessName, rank, searchTerm);
      await highlightBusinessOnDetailPage(page);
      await forceMapsCityZoom(page, 'detail-hold');
      await holdOnDetailCard(18000);
      await dismissResultsInfoPopup(page);
      return 'direct-url-no-mapsurl';
    }

    if (mapsUrl) {
      // Bare name URLs (/maps/place/Name+Only, no coordinates) — typed search
      // resolves OK for unique names but stays on a results list for common
      // names that match multiple entries. Lat/lng anchored URL always lands
      // on detail. Use coords-based when available; typed-search as backup.
      const isBareNameUrl = /\/maps\/place\/[^/@?]+$/.test(mapsUrl.replace(/\/$/, ''));
      // Fallback URL used only in the top-10 + bare-name competitive-scroll
      // path. Deep-rank path now uses navigateDeepRankChain() instead.
      const fallbackUrl = isBareNameUrl
        ? `https://www.google.com/maps/search/${encodeURIComponent(businessName + (meta.city ? ', ' + meta.city + (meta.state ? ' ' + meta.state : '') : ''))}`
        : mapsUrl;
      // 2026-05-18: for deep-rank short-circuit OR bare-name URLs, always
      // attempt the fallback navigation. The previous behavior of "stay on
      // results list" for bare-name URLs meant deep-rank leads NEVER showed
      // their detail card. Caught reviewing XP #35.
      if (isBareNameUrl && !skipScrollAttempt) {
        // 2026-05-27: scroll-find may return 0 anchors when Google's Maps DOM
        // selector (a.hfpxzc) doesn't match the current layout. Rather than
        // give up on showing the prospect's detail card (the locked outreach
        // script narrates "ranked #X — here's where you're vulnerable" while
        // the video should show THEIR card), navigate directly to the bare-
        // name URL. For unique-ish names (most local businesses), this lands
        // on the detail page. For ambiguous names that resolve to a results
        // list, click the first matching listing.
        // 2026-05-27: use the name+city SEARCH URL (works for deep-rank
        // leads yesterday) instead of the bare-name place URL (loads an empty
        // skeleton without business data). Search URL renders the standard
        // results list which step-3 can click into via clickListingInResultsByName.
        const searchNavUrl = `https://www.google.com/maps/search/${encodeURIComponent(businessName + (meta.city ? ', ' + meta.city + (meta.state ? ' ' + meta.state : '') : ''))}`;
        console.log(`   → Scroll-find returned no anchors; navigating to name+city search URL: ${searchNavUrl}`);
        try {
          // 2026-05-27 use domcontentloaded (not networkidle2). Google Maps is
          // an SPA with persistent background traffic — networkidle2 NEVER
          // fires, so the page.goto hangs for the full 90s timeout while
          // captureLoop continues recording the BEFORE-navigation list view.
          // domcontentloaded fires fast; we then rely on the waitForFunction
          // below to confirm the detail page actually rendered.
          await page.goto(searchNavUrl, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
        } catch (e) {
          console.warn(`   ⚠️ direct navigation failed (${e.message || e}); falling back to competitor scroll`);
        }
        // Wait for h1.DUwDvf (business-name heading on detail page) to exist
        // AND contain non-empty text. Single business names typically resolve
        // direct-to-detail; ambiguous names land on a results panel.
        const detailH1Loaded = await page.waitForFunction(() => {
          const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
          return !!(h1 && (h1.textContent || '').trim().length > 0);
        }, { timeout: 8000 }).then(() => true).catch(() => false);
        // Even after h1 loads, give Google ~2s to render photos/rating chips.
        await sleep(2000);
        if (detailH1Loaded) {
          console.log(`   → Search URL resolved directly to Fenn's detail page ✓ (h1 loaded)`);
          await injectRankOverlay(page, businessName, rank, searchTerm);
          await highlightBusinessOnDetailPage(page);
          await forceMapsCityZoom(page, 'direct-search-detail');
          // Hold on the detail card (injected frames — see holdOnDetailCard).
          await holdOnDetailCard(18000);
          await dismissResultsInfoPopup(page);
          return 'direct-search-detail';
        }
        // Landed on results list — click the prospect's listing
        const clickedFromResults = await clickListingInResultsByName(page, businessName);
        if (clickedFromResults) {
          console.log(`   → Search URL landed on results, clicked prospect's listing → detail ✓`);
          await injectRankOverlay(page, businessName, rank, searchTerm);
          await highlightBusinessOnDetailPage(page);
          await forceMapsCityZoom(page, 'direct-search-results-click');
          await holdOnDetailCard(18000);
          await dismissResultsInfoPopup(page);
          return 'direct-search-results-click';
        }
        // Last-resort: competitor scroll
        console.warn(`   ⚠️ direct nav didn't reach detail; falling back to competitor scroll`);
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
        // Deep-rank lead. 2026-06-22: reach the card via an SPA typed-search + click —
        // the click-opened detail captures fast, while a goto-opened detail hangs
        // page.screenshot ~176s (feedback_maps_blank_home_must_fail_lead.md). Fall back to
        // the goto URL chain only if the typed search doesn't surface a clickable listing.
        console.log(`   → Deep-rank: SPA typed-search + click (fast-capture path)`);
        console.log(`   → Holding on results panel ~4s for competitive context`);
        await sleep(4000);
        // 2026-06-23: stop the Title Case forcing interval + assert one clean final value BEFORE we
        // freeze, so the frame held through the long nav shows "Roofers In Pasadena, CA" cleanly
        // (not a mid-render "T" glitch from the interval racing React). Brief settle so it's the
        // last live frame captured.
        await page.evaluate((val) => {
          if (window.__rgaBoxInterval) { clearInterval(window.__rgaBoxInterval); window.__rgaBoxInterval = null; }
          const el = document.querySelector('input#searchboxinput') || document.querySelector('input[name="q"]');
          if (el && el.value && el.value.toLowerCase() === val.toLowerCase() && el.value !== val) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
          }
        }, toTitleCaseSearch(query)).catch(() => {});
        await sleep(350);
        // 2026-06-22: freeze the recording on the competitive-results frame NOW, before the
        // deep-rank nav. Otherwise the auto-capture loop records the messy transitions —
        // the bare-name URL's blank splash + the city-zoom animation (the glitches Chris
        // saw). With capture paused, the recording cuts straight from results → the injected
        // card frames from holdOnDetailCard. No blank, no zoom jank.
        if (recorderCtl && recorderCtl.pauseCapture) recorderCtl.pauseCapture();
        let spaClicked = false;
        try {
          const q = businessName + (meta.city ? ', ' + meta.city + (meta.state ? ' ' + meta.state : '') : '');
          const inputSel = await waitForMapsSearchInput(page);
          await clearAndType(page, inputSel, q);
          await page.keyboard.press('Enter');
          await waitForMapsResults(page);
          await page.waitForSelector('a.hfpxzc', { timeout: 9000 }).catch(() => {});
          await sleep(1500);
          // 2026-08-03: a unique name+city search resolves DIRECTLY to the detail card (no results list), so
          // clickListingInResultsByName finds no a.hfpxzc and returns false — which used to drop us to the goto
          // URL chain (goto-opened card → page.screenshot hangs → screencapture-only → the no-card freeze bug).
          // Check the detail h1 FIRST: if the SPA search already opened the card, treat it as landed IN-PAGE and
          // skip BOTH the click and the goto fallback. Root fix for the 08-02 deep-rank no-card batch.
          const _spaOnDetail = await page.evaluate(() => {
            const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
            return !!(h1 && (h1.textContent || '').trim().length > 1);
          }).catch(() => false);
          if (_spaOnDetail) {
            spaClicked = true;
            console.log('   → SPA typed-search resolved DIRECTLY to the detail card ✓ (in-page, no goto)');
          } else {
            spaClicked = await clickListingInResultsByName(page, businessName);
            console.log(`   → SPA typed-search+click: ${spaClicked ? 'clicked listing ✓' : 'no clickable listing'}`);
          }
        } catch (_) {}
        if (!spaClicked) {
          console.log(`   → Falling back to goto URL chain`);
          await navigateDeepRankChain();
          _cardOpenedInPage = false;   // goto-opened → page.screenshot hangs; must use the screencapture grab
        } else {
          _cardOpenedInPage = true;    // SPA/in-list-click opened the card in-page → page.screenshot is reliable
        }
        await assertOnDetailPage(slugify(businessName, { lower: true, strict: true }));
        await injectRankOverlay(page, businessName, rank, searchTerm);
        // 2026-06-23: TOP-ALIGN the card — keep scrollTop=0 so the top of the business photo is
        // visible (no scroll-down). Chris: it should be top aligned.
        await page.evaluate(() => {
          const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
          if (!h1) return;
          let s = h1.parentElement;
          while (s && s !== document.body) { const o = getComputedStyle(s).overflowY; if ((o === 'auto' || o === 'scroll') && s.scrollHeight > s.clientHeight) break; s = s.parentElement; }
          if (s && s !== document.body) s.scrollTop = 0;
        }).catch(() => {});
        await sleep(1000); // settle at top before the screencapture hold
        // 2026-06-22: ZOOM THE MAP OUT to a wide regional view (Chris wants the map far less
        // zoomed than the default detail view — the tight street-level map reads as "zoomed in").
        // Click Google's on-map "Zoom out" control a few steps (keyboard '-' fallback), then let
        // the tiles settle BEFORE the frozen grab so the held frame shows the wide area.
        await zoomOutMap(page, Number(process.env.MAPS_ZOOM_OUT_STEPS || 3));
        await sleep(1800); // let map tiles re-render at the wider zoom
        await holdOnDetailCard(18000);
        await dismissResultsInfoPopup(page);
        return 'direct-url';
      } else {
        console.log(`   → Results click failed; opening direct Maps URL: ${mapsUrl}`);
        await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: MAPS_NAV_TIMEOUT_MS });
        await sleep(2500);
        await injectRankOverlay(page, businessName, rank, searchTerm);
        await highlightBusinessOnDetailPage(page);
        await forceMapsCityZoom(page, 'direct-url-last-resort');
        await holdOnDetailCard(18000);
        await dismissResultsInfoPopup(page);
        return 'direct-url';
      }
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
  let capturePaused = false;
  const stderrChunks = [];

  async function start() {
    ensureDir(path.dirname(outputPath));
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    // 2026-05-29: swapped libvpx (vp8) → libx264 (h264 software) at Chris's
    // request. videotoolbox (hardware h264) is unavailable on this Mac
    // because OpenCore Legacy Patcher + macOS 15 on a 2013 Haswell GPU
    // breaks the hardware video acceleration path (-12908 error). libx264
    // is still software but ~3-4× faster than libvpx for finalize, so
    // ffmpeg drains its queue much quicker under concurrent load.
    //
    // Container: we keep the .webm filename for downstream compatibility
    // but force Matroska format via -f matroska. Matroska supports h264
    // cleanly. ffmpeg downstream reads by format detection, not extension,
    // so step-4 + step-6b continue to work unchanged. Memory:
    // [[feedback-worker-count-concurrency-limit]] documents why we tried
    // this.
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
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'zerolatency',
        // 2026-05-29: cap each libx264 instance at 2 threads so 3 parallel
        // encoders (WC=3) total 6 threads on a 4-core machine — over-
        // subscribed but bounded, no one encoder monopolizes. Without this
        // libx264 auto-detects 4 cores and three encoders try to use 12
        // threads, starving everything else.
        '-threads',
        '2',
        '-b:v',
        viewport.width >= 1000 ? '2000k' : '1000k',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'matroska',
        outputPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));

    ffmpeg.on('error', () => {});
    ffmpeg.stdin.on('error', () => {});

    const frameIntervalMs = Math.max(1, Math.round(1000 / SCREENCAST_FPS));
    captureLoop = (async () => {
      while (!stopped) {
        const startedAt = Date.now();

        // 2026-06-22: when paused (deep-rank detail hold), the auto-capture is suppressed
        // and the recorder emits manually-injected card frames instead — the loop's own
        // screenshots return stale/wrong frames on an auto-opened detail page.
        if (capturePaused) {
          await sleep(150);
          continue;
        }
        try {
          // 2026-06-22: HARD race-abort. page.screenshot()'s own `timeout` does NOT abort a
          // captureScreenshot that's stuck waiting for a stable surface (auto-opened Maps
          // detail page hangs it ~176s, which bloated recordings to 232s). Race it against a
          // real timer so a stuck capture is abandoned in ~2.5s and the loop keeps emitting
          // the last good frame. Light pages capture in <1s, so no quality loss.
          latestFrame = await Promise.race([
            page.screenshot({ type: 'jpeg', quality: 78, captureBeyondViewport: false, timeout: 2500 }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('cap-race-timeout')), 2500)),
          ]);
          captureCount += 1;
        } catch {
          await sleep(120);
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

      // Safety timeout — if ffmpeg hangs and never closes, force kill after
      // 240s. Iterated 2026-05-28: 90s (original) → 180s (after Dewey single-
      // lead timeout) → 240s (after Plumbers LB WC=3 batch showed 18 timeouts
      // / 10 force-kills under concurrent encoder load). When multiple leads
      // run in parallel, each libvpx encoder competes for CPU and can't drain
      // its frame queue inside the prior window.
      //
      // CRITICAL: also delete the partial webm. A force-killed encoder leaves
      // a file with an un-finalized container (N/A duration). step-4 would
      // happily consume it and produce a video where the audio segment plays
      // over a frozen / wrong frame. Better to drop the lead at the deploy
      // gate (which counts files) than to ship a broken video.
      const killTimer = setTimeout(() => {
        console.warn(`[recorder] ffmpeg did not close after 240s — force killing + deleting partial webm`);
        try { ffmpeg.kill('SIGKILL'); } catch {}
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        resolve({ ok: false, frameCount, captureCount, error: 'ffmpeg_timeout' });
      }, 240_000);

      ffmpeg.once('close', (code) => {
        clearTimeout(killTimer);
        const exists = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
        // Even when ffmpeg exits cleanly, the webm container is only fully
        // finalized if the matroska/webm seek index was written. The most
        // reliable cheap check: spawn ffprobe and verify a numeric duration.
        // If duration is "N/A", delete the file so the deploy gate drops the
        // lead instead of step-4 consuming a malformed segment.
        let containerOk = true;
        if (code === 0 && exists) {
          try {
            const probe = spawnSync('ffprobe', [
              '-v', 'error',
              '-show_entries', 'format=duration',
              '-of', 'csv=p=0',
              outputPath,
            ], { encoding: 'utf8' });
            const dur = (probe.stdout || '').trim();
            if (!dur || dur === 'N/A' || !Number.isFinite(Number(dur))) {
              containerOk = false;
              console.warn(`[recorder] webm container finalize check FAILED (duration=${dur || 'empty'}) — deleting ${path.basename(outputPath)}`);
              try { fs.unlinkSync(outputPath); } catch {}
            }
          } catch {}
        }
        resolve({
          ok: code === 0 && exists && frameCount > 0 && containerOk,
          frameCount,
          captureCount,
          code,
          error: containerOk ? stderrChunks.join('').trim() : 'webm_container_unfinalized',
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

  // 2026-06-22: manual-frame injection for the deep-rank detail hold. The auto-capture
  // loop returns stale/wrong frames on an auto-opened (page.goto) Maps detail page — the
  // card shows live + a DEDICATED page.screenshot() captures it fine, but the loop holds
  // the prior results-list frame. So for the detail hold we PAUSE the loop and push a
  // real card screenshot as the emitted frame. (feedback_maps_blank_home_must_fail_lead.md)
  function pushFrame(buf) { if (buf && buf.length) latestFrame = buf; }
  function pauseCapture() { capturePaused = true; }
  function resumeCapture() { capturePaused = false; }

  return { start, stop, pushFrame, pauseCapture, resumeCapture };
}

async function recordDesktopMapsVideo(browser, meta, outputPath) {
  const page = await browser.newPage();
  // 2026-06-23: FORCE the physical window wide + top-left (the saved profile can restore a narrow
  // window, overriding --window-size). A narrow window clips the 1600px Maps layout to its left
  // half, so the screencapture spilled onto the desktop. Width 1640 > the 1600 capture region, so
  // the capture stays fully inside the Chrome window. Done via CDP before the viewport emulation.
  try {
    const sess = await page.target().createCDPSession();
    const { windowId } = await sess.send('Browser.getWindowForTarget');
    await sess.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: 1640, height: 1040, windowState: 'normal' } });
    await sess.detach().catch(() => {});
  } catch (_) {}
  // 2026-06-12: MAPS_VIEWPORT (wider) for the 3-column blue-line + card-popout layout.
  await page.setViewport(MAPS_VIEWPORT);

  const recorder = createScreencastRecorder(page, outputPath, MAPS_VIEWPORT);
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

    const _navT0 = Date.now();
    const mode = await goToMapsShowResultsThenOpenBusiness(page, meta, startRecorder, {
      pushFrame: recorder.pushFrame,
      pauseCapture: recorder.pauseCapture,
      resumeCapture: recorder.resumeCapture,
    });
    console.log(`   [timing] nav (goToMaps...) took ${Date.now() - _navT0}ms, mode=${mode}`);
    if (!recorderStarted) await startRecorder();
    const _holdT0 = Date.now();
    if (mode !== 'none') await sleep(mode === 'search-only' ? DESKTOP_MAPS_HOLD_MS * 2 : DESKTOP_MAPS_HOLD_MS);
    console.log(`   [timing] wrapper hold took ${Date.now() - _holdT0}ms`);
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording desktop Maps for ${meta.name}: ${err.message || err}`);
  }

  // 2026-06-22 BLANK-MAPS CORRECTNESS GATE (feedback_maps_blank_home_must_fail_lead.md).
  // The deep-rank (rank > 20) URL-nav fallback can land on the BLANK default Maps home
  // (blue splash, empty search, no listing) — and the old salvage path below SAVED it
  // anyway + returned true, so ~1/3 of rank>20 videos shipped a blank Maps segment
  // (Chris caught Green Planet #25). Run a final state check while the page is still
  // open (covers BOTH the silent-blank path AND a thrown assertOnDetailPage): if the
  // segment ended on neither a detail card (h1.DUwDvf) nor a results list (a.hfpxzc),
  // the recording is unusable — discard it and FAIL the lead so it can't ship a blank.
  let validMapsState = true;
  try {
    const diag = await page.evaluate(() => {
      const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
      const hasDetail = !!(h1 && h1.textContent.trim().length > 1);
      const hasResults = document.querySelectorAll('a.hfpxzc').length > 0;
      const searchBox = document.querySelector('input#searchboxinput, input[aria-label="Search Google Maps"]');
      return { hasDetail, hasResults, h1Text: (h1 && h1.textContent.trim().slice(0, 40)) || '', searchVal: (searchBox && searchBox.value) || '', url: location.href };
    });
    validMapsState = diag.hasDetail || diag.hasResults;
    // 2026-06-22 DIAGNOSTIC: log the true final page state to compare against the recording.
    console.log(`   [maps-final-state] hasDetail=${diag.hasDetail} hasResults=${diag.hasResults} h1="${diag.h1Text}" searchBox="${diag.searchVal}" url=${diag.url.slice(0, 90)}`);
    if (process.env.MAPS_DIAG) {
      try {
        const dd = path.join(ROOT, 'output', 'diag');
        fs.mkdirSync(dd, { recursive: true });
        await page.screenshot({ path: path.join(dd, `final-${slugify(meta.name || 'lead', { lower: true, strict: true })}.png`) });
      } catch (_) {}
    }
  } catch (_) {
    validMapsState = true; // eval failed (page already gone) — don't false-fail a good recording
  }

  const result = await recorder.stop();
  await page.close().catch(() => {});
  if (!validMapsState) {
    try { fs.unlinkSync(outputPath); } catch (_) {}
    console.warn(`   ❌ Maps segment ended on the BLANK default-Maps home (no card, no results) — discarded ${outputPath} and FAILING the lead (deep-rank URL-nav fallback couldn't reach the listing).`);
    return false;
  }
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
  // Block chat widgets BEFORE first navigation so their scripts never load.
  await setupChatWidgetBlocking(page);

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

      // 2026-06-03 — WAF/error-page detection at RECORDING TIME. Caught on
      // Black Cat Plumbing Co: step-2.5 audit saw the real site (title="Black
      // Cat Plumbing", wordCount=640), but step-3's recording-time navigation
      // hit Cloudways' WAF and captured a "403 Website Unavailable" page.
      // Site behavior differs between audit + record (different request
      // patterns, IP rotation, time-of-day). Detect at THIS moment and write
      // a flag to audit-findings.json so step-6 can fire an override finding.
      try {
        const wafSignals = await page.evaluate(() => {
          const title = (document.title || '').toLowerCase();
          const h1 = (document.querySelector('h1')?.innerText || '').toLowerCase();
          const bodyTextFirst1k = (document.body?.innerText || '').toLowerCase().slice(0, 1000);
          const patterns = [
            /\b(cloudways|cloudflare|sucuri|wordfence|incapsula|akamai)\b/i,
            /\b403\b.*\b(forbidden|website\s+unavailable|unauthorized|access\s+denied)\b/i,
            /\b(website|site)\s+unavailable\b/i,
            /\b(security\s+measures|access\s+(?:has\s+been\s+)?blocked|your\s+access\s+(?:has\s+been\s+)?(?:denied|restricted))\b/i,
            /\b(this\s+page\s+isn'?t\s+working|domain\s+not\s+authorized|unauthorized\s+(?:on|access))\b/i,
            /\b(error\s+1020|error\s+1015|attention\s+required)\b/i, // Cloudflare-specific
            // 2026-08-03: parked / domain-for-sale landing (a lapsed business domain now redirects to a
            // marketplace). Chris caught luxurymedspa.com → HugeDomains "This domain is for sale: $6,995".
            // Treat like an unreachable site so step-6 suppresses the website claims (no real site to show).
            /\b(this\s+domain\s+(?:is|name)\s+(?:for\s+sale|may\s+be\s+for\s+sale)|domain\s+(?:is\s+)?for\s+sale|buy\s+this\s+domain|hugedomains|the\s+domain\s+.{0,30}\bfor\s+sale)\b/i,
          ];
          const sample = `${title} ${h1} ${bodyTextFirst1k}`;
          for (let i = 0; i < patterns.length; i++) {
            if (patterns[i].test(sample)) {
              return { detected: true, signature: `pattern-${i}`, titleSample: title.slice(0, 100), h1Sample: h1.slice(0, 100) };
            }
          }
          return { detected: false };
        });
        if (wafSignals?.detected) {
          console.warn(`   ⚠️ [WAF-DETECT] website segment captured WAF/error page for ${meta.name}: ${wafSignals.signature} (title="${wafSignals.titleSample}", h1="${wafSignals.h1Sample}")`);
          // Write override flag to audit-findings.json so step-6 picks it up.
          // Step-6 reads the audit when scoring findings; this flag triggers
          // the websiteUnreachable override finding (hard-suppresses every
          // other website + mobile claim, narrates a single "website bad" line).
          try {
            const fs = await import('fs');
            const path = await import('path');
            const slug = (meta.csvBaseName || '').trim();
            if (slug) {
              const auditPath = path.join(process.cwd(), 'output', 'Step 2.5 (Audit)', slug, 'audit-findings.json');
              if (fs.existsSync(auditPath)) {
                const doc = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
                const slugKey = slugify(meta.name, { lower: true, strict: true });
                if (doc[slugKey]) {
                  doc[slugKey].website = doc[slugKey].website || {};
                  doc[slugKey].website.recordingShowedError = true;
                  doc[slugKey].website.recordingErrorSignature = wafSignals.signature;
                  fs.writeFileSync(auditPath, JSON.stringify(doc, null, 2));
                  console.log(`   ✓ wrote recordingShowedError=true to audit-findings.json for step-6 override`);
                }
              }
            }
          } catch (writeErr) {
            console.warn(`   ⚠️ failed to write WAF flag to audit (non-fatal): ${writeErr.message}`);
          }
        }
      } catch (wafErr) {
        // Non-fatal — WAF detection failed, continue recording. Worst case
        // step-6 fires normal findings against the error-page content.
        console.warn(`   ⚠️ WAF detection failed (non-fatal): ${wafErr.message}`);
      }

      await page.addStyleTag({ content: 'html,body{background:#ffffff !important;}' }).catch(() => {});
      await dismissCommonCookieBanner(page);
      // CSS safety net for first-party-proxied chat surfaces that slip past
      // the network block.
      await hideChatWidgetSelectors(page);
      // Promo/newsletter/email-signup modals (installs a persistent killer for timer/exit-intent popups).
      await dismissPromoModals(page);
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
  await setupChatWidgetBlocking(page);

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
      await hideChatWidgetSelectors(page);
      await dismissPromoModals(page);

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
  // 2026-05-27 Tier 3 #10: parallel within-lead recordings. The 3 recordings
  // (desktop Maps, desktop Website, mobile) each open their own browser page,
  // record independently, and close. They share the same Chrome process but
  // not the same page. Sequential = ~120s/lead. Parallel = ~45s/lead.
  //
  // Risks managed:
  //   - Each `await browser.newPage()` returns a fresh page; setViewport is
  //     per-page so the desktop+mobile viewports don't collide.
  //   - Cookies/localStorage are shared across pages in the same browser
  //     context. None of our recordings mutate cookies in a way that affects
  //     the others — Maps doesn't need any auth, websites are public, mobile
  //     hits the same website (cookie continuity is fine).
  //   - CPU pressure from 3 concurrent screencast encoders is the real cost.
  //     Each recording is short (~10-30s actual capture); ffmpeg encodes the
  //     stream. On 8-core M1+, this is sub-saturation.
  //
  // 2026-05-27 REVERTED: within-lead Promise.all parallelism (commit 747a729)
  // caused captureLoop frame starvation across the 3 concurrent puppeteer +
  // ffmpeg pipelines, producing 200-800KB WebMs (vs expected 3-8MB). The final
  // step-7 ffmpeg then `tpad=clone`'d the last frame for 90+ seconds, making
  // the video show the static intro overlay for most of its duration. Back to
  // SEQUENTIAL recordings within a lead — they produce reliable full-content
  // WebMs every time. Cross-lead parallelism (WORKER_COUNT>1) is the real
  // efficiency win and is preserved separately.
  //
  // Opt-IN parallel via STEP3_PARALLEL=1 if/when CPU + memory headroom lets it
  // work; off by default.
  if (process.env.STEP3_PARALLEL === '1') {
    const [mapsOk, websiteOk, mobileOk] = await Promise.all([
      recordDesktopMapsVideo(browser, meta, mapsOut).catch((e) => {
        console.error(`   ❌ desktop Maps recording threw: ${e.message || e}`);
        return false;
      }),
      recordDesktopWebsiteVideo(browser, meta, websiteOut).catch((e) => {
        console.error(`   ❌ desktop Website recording threw: ${e.message || e}`);
        return false;
      }),
      recordMobileVideo(browser, meta, mobileOut).catch((e) => {
        console.error(`   ❌ mobile recording threw: ${e.message || e}`);
        return false;
      }),
    ]);
    return { mapsOk, websiteOk, mobileOk };
  }

  // 2026-06-26: REUSE_EXISTING_SEGMENTS=1 — per-segment skip. When re-rendering only because of a
  // Maps-segment fix, the website + mobile webms from the prior run are still valid, so skip
  // re-recording them (they're the slow part) and reuse the existing files. Maps is always (re)recorded
  // — the redo deletes only the maps webm first, so it's missing here and gets recorded. Gated behind
  // an env flag so normal runs never reuse a possibly-stale segment. [[project-video-code-locked-2026-06-26]]
  const reuse = process.env.REUSE_EXISTING_SEGMENTS === '1';
  const haveGood = (p) => { try { return fs.existsSync(p) && fs.statSync(p).size > 10000; } catch { return false; } };
  const mapsOk = await recordDesktopMapsVideo(browser, meta, mapsOut);
  let websiteOk, mobileOk;
  if (reuse && haveGood(websiteOut)) { console.log(`   ⏭ Reusing existing website webm (REUSE_EXISTING_SEGMENTS)`); websiteOk = true; }
  else websiteOk = await recordDesktopWebsiteVideo(browser, meta, websiteOut);
  if (reuse && haveGood(mobileOut)) { console.log(`   ⏭ Reusing existing mobile webm (REUSE_EXISTING_SEGMENTS)`); mobileOk = true; }
  else mobileOk = await recordMobileVideo(browser, meta, mobileOut);
  return { mapsOk, websiteOk, mobileOk };
}

// 2026-05-26: Before launching a fresh Puppeteer Chrome, kill any orphan
// Chrome processes from a prior step-3 run that may have detached after a
// scam-page hijack (renderer kept running with audio for ~4 hours during
// the 2026-05-26 incident). We match on our user-data-dir path — that's
// unique to step-3 puppeteer Chrome, so this won't touch Chris's regular
// Chrome browsing.
function killOrphanStep3Chrome() {
  try {
    const profilePath = CHROME_PROFILE_DIR;
    const result = spawn('pkill', ['-f', `Google Chrome.*${profilePath}`], { stdio: 'ignore' });
    result.on('error', () => {});
  } catch {}
}

// 2026-05-29: clear Chrome's "didn't shut down cleanly" state from a prior
// pkill or crash. Without this, the next launch shows a "Restore pages?"
// dialog in the toolbar — invisible to the recording (we only capture the
// page viewport) but bad for unattended overnight runs where Chris might
// open the screen and see a stuck dialog. Patches Preferences exit_type +
// removes Singleton lock files so Chrome thinks the prior shutdown was
// clean.
function clearChromeRestoreState() {
  try {
    const prefsPath = path.join(CHROME_PROFILE_DIR, 'Default', 'Preferences');
    if (fs.existsSync(prefsPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
        if (p.profile) {
          p.profile.exit_type = 'Normal';
          p.profile.exited_cleanly = true;
        }
        fs.writeFileSync(prefsPath, JSON.stringify(p));
      } catch {}
    }
    // Remove SingletonLock files at both possible locations
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      try { fs.unlinkSync(path.join(CHROME_PROFILE_DIR, lock)); } catch {}
      try { fs.unlinkSync(path.join(CHROME_PROFILE_DIR, 'Default', lock)); } catch {}
    }
  } catch {}
}

async function launchBrowser() {
  ensureDir(CHROME_PROFILE_DIR);
  killOrphanStep3Chrome();
  clearChromeRestoreState();
  return puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    userDataDir: CHROME_PROFILE_DIR,
    defaultViewport: null,
    // 2026-06-22: drop the default --enable-automation so the "Chrome is being controlled
    // by automated test software" infobar doesn't render. That banner sits below
    // outerHeight, so it threw off the screencapture content-top offset (left a chrome
    // sliver atop the card grab). Removing it makes (outerHeight-innerHeight) accurate.
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      // 2026-06-23: force a WIDE physical window at a known corner. The maps recording emulates a
      // 1600px viewport (narrow-card + wide-map layout), but if the PHYSICAL window is narrow it
      // only displays the left half (card + a sliver of map) — the screencapture then spills past
      // the window onto the desktop/other apps. A 1640-wide window shows the full layout.
      '--window-position=0,0',
      '--window-size=1640,1040',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      // 2026-05-26: hard-mute audio at the Chrome process level. Even if a
      // hijacked lead site auto-plays a tech-support-scam audio loop, no
      // sound reaches the speakers. Our recordings don't need audio anyway.
      // See feedback-step3-scam-defense.md.
      '--mute-audio',
      // 2026-05-29: belt-and-suspenders for the "Restore pages?" dialog —
      // clearChromeRestoreState() above patches Preferences, these flags
      // tell Chrome to skip session-restore + first-run flows entirely.
      // Critical for unattended overnight runs.
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--hide-crash-restore-bubble',
      // 2026-05-29: CPU-relief flags for WC=3 on this OpenCore Haswell box.
      // The Mac's hardware video accel is broken (videotoolbox -12908) so
      // there's nothing to lose by disabling GPU paths Chrome would
      // otherwise try and fall back from anyway. Frees CPU cycles for the
      // libx264 encoders.
      '--disable-gpu',
      '--disable-software-rasterizer',
      // 2026-06-25/26: kill Chrome's Cast/Media-Router + mDNS/WebRTC local-network discovery so macOS
      // does NOT raise the "Allow Google Chrome to find devices on local networks?" permission popup
      // mid-recording. NOTE: this only reduces the TRIGGERS — the popup is a macOS Local Network
      // PRIVACY permission that re-prompts until the user clicks Allow/Don't Allow ONCE (System
      // Settings > Privacy & Security > Local Network). Flags alone can't suppress a never-answered
      // OS permission; the one-time Allow is the permanent fix. WebRtcHideLocalIpsWithMdns added
      // 2026-06-26 (WebRTC mDNS ICE is another local-network trigger).
      '--disable-features=BackForwardCache,AcceleratedVideoEncoder,AcceleratedVideoDecoder,MediaRouter,DialMediaRouteProvider,CastMediaRouteProvider,WebRtcHideLocalIpsWithMdns',
      '--disable-background-networking',
      '--media-router=0',
      '--disable-accelerated-2d-canvas',
      // Reduce background tab work + extension overhead
      '--disable-background-timer-throttling=false',
      '--disable-renderer-backgrounding',
      '--disable-extensions',
    ],
  });
}

async function main() {
  // ── HARD WALL-CLOCK SELF-TIMEOUT (2026-07-27) ──────────────────────────────
  // Defense-in-depth against a hung capture. The bash pool watchdog protects the
  // PARALLEL path, but the recovery/sequential path (WORKER_COUNT=1) runs step-3
  // INLINE with NO watchdog — a hang there wedged overnight-local.sh for 2.5 days
  // on 2026-07-27 (Chrome→ffmpeg orphans kept the stdout pipe open so the `| tee`
  // never saw EOF, so `overnight-pipeline.sh | tee` never returned). If the whole
  // recorder exceeds STEP3_HARD_TIMEOUT_MIN, force-kill our Chrome + direct
  // children and exit non-zero so the pipeline moves on instead of hanging forever.
  // Default ON only for the single-lead pipeline path (MAX_VIDEOS=1). Batch mode
  // (batch-render-*) processes MANY leads in one process — a flat cap would falsely
  // trip it, so it stays 0 there unless STEP3_HARD_TIMEOUT_MIN is set explicitly.
  const _singleLead = process.env.MAX_VIDEOS === '1';
  const HARD_TIMEOUT_MIN = Number(process.env.STEP3_HARD_TIMEOUT_MIN || (_singleLead ? 12 : 0));
  if (HARD_TIMEOUT_MIN > 0) {
    const _hardTimer = setTimeout(() => {
      console.error(`[recorder] HARD TIMEOUT — capture exceeded ${HARD_TIMEOUT_MIN} min; force-killing Chrome/ffmpeg and exiting (7).`);
      try { spawnSync('pkill', ['-9', '-P', String(process.pid)]); } catch (_) {}
      try { spawnSync('pkill', ['-9', '-f', `Google Chrome.*${CHROME_PROFILE_DIR}`]); } catch (_) {}
      process.exit(7);
    }, HARD_TIMEOUT_MIN * 60 * 1000);
    _hardTimer.unref(); // never keep the event loop alive on a clean finish
  }
  // 2026-06-26: suppress focus-stealing macOS SYSTEM dialogs that get captured by the full-screen
  // grab (Chris saw the "enable Dictation?" prompt land in a video, which ALSO shrinks the capture
  // into the corner). The Chrome "find devices on local networks" popup is prevented via launch
  // flags; this kills the other common offender (Dictation auto-enable prompt). Idempotent + silent.
  try {
    spawnSync('defaults', ['write', 'com.apple.HIToolbox', 'AppleDictationAutoEnable', '-int', '0']);
  } catch (_) {}
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
      // 2026-06-19: prefer the search-DISCOVERED website when the GBP-linked Website
      // is empty — matching step-2.5's precedence (it audits the discovered site).
      // Without this, leads whose GBP has no website link but discovery found one
      // (e.g. Pasadena Roofing Co → lansfordroofing.com) reached the recorder with an
      // empty URL → website + mobile segments skipped → 1/3 webms → mislabeled
      // "bot-blocked" and the whole lead failed. Real root cause of the step-3 losses.
      let website = cleanUrl(row['Discovered Website'] || row.Website || row.website || '');
      // 2026-06-26: reject third-party directories/marketplaces (autotrader, wheree.com, yelp, etc.)
      // as the business's website. When a lead has no real first-party site, step-2 discovery may
      // have grabbed a directory — recording it films the WRONG (often down) site (Chris caught
      // A-to-Z Auto Repair → autotrader.com). A blocked site means there is NO real first-party
      // website to audit; the website + mobile segments would be empty (1/3 webms) and the lead
      // fails downstream anyway — so SKIP the lead deterministically rather than shipping a bad or
      // broken video. [[feedback-discovered-website-must-reject-directories]]
      const websiteWasDirectory = website && isBlockedWebsiteUrl(website);
      if (websiteWasDirectory) {
        console.log(`Skipping ${name} - only "website" is a directory/marketplace (${website}); no real first-party site to record.`);
        continue;
      }
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

      // 2026-06-03 — abandon-lead gate. step-2.5 throws + writes skipped:true
      // to audit-findings.json when the prospect's website returns HTTP 4xx/5xx
      // (Safe Gas Services Inc 403 case). Read the audit here and skip the
      // entire lead from recording so we don't generate a video that shows an
      // error page or makes false claims about an unreachable site.
      try {
        const auditPath = path.join(
          ROOT, 'output', 'Step 2.5 (Audit)',
          path.basename(inputPath, '.csv'),
          'audit-findings.json',
        );
        if (fs.existsSync(auditPath)) {
          const auditDoc = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
          const slugKey = slugify(name, { lower: true, strict: true });
          const auditEntry = auditDoc[slugKey];
          if (auditEntry?.skipped === true) {
            console.warn(`\n⚠️ SKIP LEAD: ${name} — step-2.5 marked skipped (${auditEntry.skipReason || 'unknown'}); not recording.`);
            continue;
          }
        }
      } catch (auditCheckErr) {
        // Non-fatal — proceed to record even if the audit-check fails
        console.warn(`   ⚠️ pre-record audit-check failed (non-fatal): ${auditCheckErr.message}`);
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
            // 2026-06-03: csvBaseName carries the Step 2 CSV slug so the
            // WAF detector in recordWebsiteVideo can locate the matching
            // audit-findings.json and write the recordingShowedError flag.
            csvBaseName: baseName,
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
