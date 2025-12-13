import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { chromium, devices } from 'playwright';
import slugify from 'slugify';

const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2 (Email Scraper)');
const VIDEOS_ROOT = path.join(process.cwd(), 'output', 'Step 3 (Video Recorder - Raw WebM)');
const MAX_VIDEOS = 3;

const DESKTOP_WEBSITE_EXTRA_HOLD_MS = 8000;
const DESKTOP_WEBSITE_SCROLL_STEPS = 7;
const DESKTOP_WEBSITE_SCROLL_DELTA_PX = 720;
const DESKTOP_WEBSITE_SCROLL_WAIT_MS = 1200;

const DESKTOP_WEBSITE_TAIL_DELTA_PX = 260;
const DESKTOP_WEBSITE_TAIL_TICK_MS = 850;

function findLatestStep2Csv() {
  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-2]'));

  if (!files.length) {
    console.error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
    process.exit(1);
  }

  files.sort();
  const latest = files[files.length - 1];
  const inputPath = path.join(STEP2_DIR, latest);
  const baseName = latest.replace(/\.csv$/i, '');

  console.log(`Using Step 2 CSV: ${inputPath}`);
  return { inputPath, baseName };
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

function parseRank(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clearWebms(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.webm')) {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch {}
    }
  }
}

function moveNewestWebm(tmpDir, outputPath) {
  const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.webm'));
  if (!files.length) return false;

  const newest = files
    .map((name) => ({ name, time: fs.statSync(path.join(tmpDir, name)).mtimeMs }))
    .sort((a, b) => a.time - b.time)
    .pop().name;

  fs.renameSync(path.join(tmpDir, newest), outputPath);
  return true;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWebsiteCandidates(raw) {
  const u = cleanUrl(raw);
  if (!u) return [];

  const out = [];
  const seen = new Set();

  const push = (x) => {
    const v = String(x || '').trim();
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push(v);
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
  const paths = pathPart || '';

  push(`https://${host}${paths}`);
  push(`http://${host}${paths}`);

  if (!/^www\./i.test(host)) {
    push(`https://${withWww}${paths}`);
    push(`http://${withWww}${paths}`);
  } else {
    push(`https://${bare}${paths}`);
    push(`http://${bare}${paths}`);
  }

  if (!hasProto) push(u);

  return out;
}

async function gotoFirstWorking(page, rawUrl, label) {
  const candidates = buildWebsiteCandidates(rawUrl);
  if (!candidates.length) return null;

  let lastErr = null;

  for (const url of candidates) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return url;
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err);

      if (
        msg.includes('ERR_NAME_NOT_RESOLVED') ||
        msg.includes('ERR_CONNECTION_REFUSED') ||
        msg.includes('ERR_CONNECTION_TIMED_OUT') ||
        msg.includes('ERR_CONNECTION_RESET') ||
        msg.includes('ERR_CERT') ||
        msg.includes('ERR_SSL') ||
        msg.includes('net::') ||
        msg.includes('Navigation timeout')
      ) {
        continue;
      }

      continue;
    }
  }

  if (lastErr) {
    console.warn(`   ⚠️ ${label} all variants failed for: ${rawUrl}`);
  }
  return null;
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

async function scrollMapsResultsPanel(page, times = 2) {
  for (let i = 0; i < times; i++) {
    const did = await page.evaluate(() => {
      const candidates = [
        document.querySelector('div[role="feed"]'),
        document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd'),
        document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf'),
        document.querySelector('div[aria-label*="Results"]'),
      ].filter(Boolean);

      const scroller =
        candidates.find((el) => el && el.scrollHeight > el.clientHeight + 50) || null;

      if (!scroller) return false;

      const before = scroller.scrollTop;
      scroller.scrollBy(0, Math.max(600, Math.floor(scroller.clientHeight * 0.8)));
      const after = scroller.scrollTop;
      return after !== before;
    });

    await page.waitForTimeout(1200);
    if (!did) break;
  }
}

async function clickListingInResultsByName(page, businessName) {
  const target = norm(businessName);
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
      document.querySelectorAll('div[role="article"], div.Nv2PK, a.hfpxzc')
    );

    const scored = [];

    for (const el of resultCards) {
      const txt = (el.innerText || '').trim();
      if (!txt) continue;

      let cardRoot = el;
      if (el.tagName.toLowerCase() === 'a') {
        cardRoot = el.closest('div[role="article"]') || el.parentElement || el;
      }

      if (cardRoot && isSponsoredBlock(cardRoot)) continue;

      const firstLine = txt.split('\n')[0] || '';
      const nFirst = norm(firstLine);

      const aria = el.getAttribute ? el.getAttribute('aria-label') : '';
      const nAria = norm(aria);

      const pool = [nAria, nFirst].filter(Boolean);

      let best = 0;
      for (const cand of pool) {
        if (!cand) continue;
        if (cand === targetNorm) best = Math.max(best, 100);
        else if (cand.includes(targetNorm) || targetNorm.includes(cand)) best = Math.max(best, 70);
        else {
          const targetParts = targetNorm.split(' ');
          const hits = targetParts.filter((p) => p.length >= 4 && cand.includes(p)).length;
          best = Math.max(best, hits * 10);
        }
      }

      if (best > 0) scored.push({ el, best });
    }

    scored.sort((a, b) => b.best - a.best);
    const top = scored[0]?.el;
    if (!top) return false;

    try {
      top.scrollIntoView({ block: 'center' });
    } catch {}

    const anchor =
      top.tagName.toLowerCase() === 'a'
        ? top
        : top.querySelector && top.querySelector('a.hfpxzc, a[aria-label]')
        ? top.querySelector('a.hfpxzc, a[aria-label]')
        : null;

    try {
      (anchor || top).click();
      return true;
    } catch {
      return false;
    }
  }, target);

  return !!clicked;
}

async function extractWebsiteFromMapsCard(page) {
  try {
    const url = await page.evaluate(() => {
      const pick = (href) => {
        if (!href) return '';
        let h = String(href);
        if (h.includes('google.com/url?')) {
          try {
            const u = new URL(h);
            const direct = u.searchParams.get('q') || u.searchParams.get('url') || '';
            if (direct) h = direct;
          } catch {}
        }
        return h;
      };

      const selectors = [
        'a[data-item-id="authority"]',
        'a[aria-label^="Website"]',
        'a[aria-label*="Website"]',
      ];

      for (const sel of selectors) {
        const a = document.querySelector(sel);
        if (a && a.href) {
          const h = pick(a.href);
          if (h && /^https?:\/\//i.test(h)) return h;
        }
      }

      const links = Array.from(document.querySelectorAll('a[href^="http"]'))
        .map((a) => a.href)
        .filter(Boolean);

      for (const h0 of links) {
        const h = pick(h0);
        if (!h) continue;
        const low = h.toLowerCase();
        if (low.includes('google.com') || low.includes('g.page')) continue;
        if (/^https?:\/\//i.test(h)) return h;
      }

      return '';
    });

    return cleanUrl(url);
  } catch {
    return '';
  }
}

async function goToMapsShowResultsThenOpenBusiness(page, meta) {
  const searchTerm = (meta.searchTerm || '').trim();
  const businessName = (meta.name || '').trim();
  const mapsUrl = (meta.mapsUrl || '').trim();

  if (!searchTerm && !businessName && !mapsUrl) return 'none';

  try {
    await page.goto('https://www.google.com/maps', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForTimeout(3000);
    await dismissResultsInfoPopup(page);

    const inputSelector = 'input[aria-label="Search Google Maps"], input#searchboxinput';
    await page.waitForSelector(inputSelector, { timeout: 25000 });

    const query = searchTerm || businessName || '';
    if (query) {
      console.log(`   → Maps search: ${query}`);
      await page.click(inputSelector, { clickCount: 3 });
      await page.fill(inputSelector, '');
      for (const ch of query) {
        await page.type(inputSelector, ch, { delay: 40 });
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(6500);
      await dismissResultsInfoPopup(page);
    }

    await scrollMapsResultsPanel(page, 2);
    await page.waitForTimeout(1800);

    if (mapsUrl) {
      console.log('   → Opening business via direct Maps URL (to avoid Sponsored drift).');
      await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6500);
      await dismissResultsInfoPopup(page);
      return 'direct-url';
    }

    if (businessName) {
      console.log(`   → Opening business card from results: ${businessName}`);
      const ok = await clickListingInResultsByName(page, businessName);
      if (ok) {
        await page.waitForTimeout(7000);
        await dismissResultsInfoPopup(page);
        return 'results-click';
      }

      console.log('   → Fallback: searching business name directly in Maps search box.');
      await page.click(inputSelector, { clickCount: 3 });
      await page.fill(inputSelector, '');
      for (const ch of businessName) {
        await page.type(inputSelector, ch, { delay: 40 });
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(7000);
      await dismissResultsInfoPopup(page);
      return 'name-search';
    }

    return 'search-only';
  } catch (err) {
    console.warn(`   ⚠️ Maps navigation failed: ${err.message}`);
    return 'none';
  }
}

async function robustScrollStep(page, deltaPx) {
  const y0 = await page.evaluate(() => window.scrollY || 0);

  try {
    await page.evaluate((d) => window.scrollBy(0, d), deltaPx);
  } catch {}
  await page.waitForTimeout(200);
  const y1 = await page.evaluate(() => window.scrollY || 0);
  if (y1 !== y0) return true;

  try {
    await page.mouse.wheel(0, deltaPx);
  } catch {}
  await page.waitForTimeout(250);
  const y2 = await page.evaluate(() => window.scrollY || 0);
  if (y2 !== y0) return true;

  try {
    await page.keyboard.press('PageDown');
  } catch {}
  await page.waitForTimeout(300);
  const y3 = await page.evaluate(() => window.scrollY || 0);
  return y3 !== y0;
}

async function nudgeBounce(page) {
  const y0 = await page.evaluate(() => window.scrollY || 0);

  try {
    await page.mouse.wheel(0, -180);
  } catch {}
  await page.waitForTimeout(180);

  try {
    await page.mouse.wheel(0, 360);
  } catch {}
  await page.waitForTimeout(220);

  const y1 = await page.evaluate(() => window.scrollY || 0);
  return y1 !== y0;
}

async function scrollWebsiteMore(page) {
  for (let i = 0; i < DESKTOP_WEBSITE_SCROLL_STEPS; i++) {
    await robustScrollStep(page, DESKTOP_WEBSITE_SCROLL_DELTA_PX);
    await page.waitForTimeout(DESKTOP_WEBSITE_SCROLL_WAIT_MS);
  }
}

async function scrollWebsiteTail(page, durationMs) {
  const endAt = Date.now() + Math.max(0, durationMs);
  let noMove = 0;

  while (Date.now() < endAt) {
    const moved = await robustScrollStep(page, DESKTOP_WEBSITE_TAIL_DELTA_PX);
    if (!moved) {
      noMove++;
      if (noMove >= 2) {
        await nudgeBounce(page);
        noMove = 0;
      }
    } else {
      noMove = 0;
    }
    await page.waitForTimeout(DESKTOP_WEBSITE_TAIL_TICK_MS);
  }
}

async function recordDesktopVideo(browser, meta, tmpDir, outputPath) {
  clearWebms(tmpDir);

  let context = null;
  let page = null;
  let hadFatal = false;

  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: tmpDir, size: { width: 1280, height: 720 } },
      ignoreHTTPSErrors: true,
    });

    page = await context.newPage();

    await page.goto('about:blank', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const mode = await goToMapsShowResultsThenOpenBusiness(page, meta);
    if (mode !== 'none') {
      await page.waitForTimeout(6000);
    }

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
      await page.waitForTimeout(2200);
      try {
        await page.addStyleTag({ content: `html,body{background:#ffffff !important;}` });
      } catch {}

      await scrollWebsiteMore(page);
      await scrollWebsiteTail(page, DESKTOP_WEBSITE_EXTRA_HOLD_MS);
    } else {
      console.warn('   ⚠️ Website unreachable; keeping desktop video as Maps-only segment.');
      await page.waitForTimeout(5000);
    }
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording desktop for ${meta.name}: ${err.message || err}`);
  } finally {
    try {
      if (context) await context.close();
    } catch {}
  }

  const ok = moveNewestWebm(tmpDir, outputPath);
  if (!ok) {
    console.warn('   ⚠️ No desktop video file produced in tmpDir');
    return false;
  }

  if (hadFatal) {
    console.warn(`   ⚠️ Desktop had an error, but video was still saved: ${outputPath}`);
  } else {
    console.log(`   ✓ Saved desktop video: ${outputPath}`);
  }

  return true;
}

async function recordMobileVideo(browser, meta, tmpDir, outputPath) {
  if (!meta.website) return false;

  clearWebms(tmpDir);

  const device =
    devices['iPhone 13'] ||
    devices['iPhone 12'] ||
    devices['iPhone 14'] ||
    devices['iPhone 11'] ||
    null;

  const viewport = device && device.viewport ? device.viewport : { width: 390, height: 844 };
  const userAgent = device && device.userAgent ? device.userAgent : undefined;
  const deviceScaleFactor = device && device.deviceScaleFactor ? device.deviceScaleFactor : 3;
  const isMobile = device && typeof device.isMobile === 'boolean' ? device.isMobile : true;
  const hasTouch = device && typeof device.hasTouch === 'boolean' ? device.hasTouch : true;

  let context = null;
  let page = null;
  let hadFatal = false;

  try {
    context = await browser.newContext({
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      recordVideo: { dir: tmpDir, size: viewport },
      ignoreHTTPSErrors: true,
    });

    page = await context.newPage();

    console.log(`   → Website (real mobile view): ${meta.website}`);

    try {
      const safeName = String(meta.name || 'Loading…').replace(/[<>]/g, '').trim() || 'Loading…';
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><div style="padding:16px;"><div style="font-size:16px;font-weight:600;">${safeName}</div><div style="margin-top:6px;font-size:13px;opacity:.65;">Loading website…</div></div></body></html>`,
        { waitUntil: 'domcontentloaded' }
      );
      await page.waitForTimeout(250);
    } catch {}

    let visited = await gotoFirstWorking(page, meta.website, 'Mobile Website');

    if (!visited) {
      console.warn('   ⚠️ Mobile website unreachable; skipping mobile scroll and saving short segment.');
      await page.goto('about:blank', { waitUntil: 'load' });
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(900);

      try {
        await page.addStyleTag({ content: `html,body{background:#ffffff !important;}` });
      } catch {}

      const vp = page.viewportSize();
      const vh = vp ? vp.height : 844;
      const positions = [0, Math.round(vh * 0.9), Math.round(vh * 1.8)];

      for (const y of positions) {
        try {
          await page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y);
        } catch {}
        await page.waitForTimeout(2100);
      }
    }
  } catch (err) {
    hadFatal = true;
    console.error(`   ❌ Error recording mobile for ${meta.name}: ${err.message || err}`);
  } finally {
    try {
      if (context) await context.close();
    } catch {}
  }

  const ok = moveNewestWebm(tmpDir, outputPath);
  if (!ok) {
    console.warn('   ⚠️ No mobile video file produced in tmpDir');
    return false;
  }

  if (hadFatal) {
    console.warn(`   ⚠️ Mobile had an error, but video was still saved: ${outputPath}`);
  } else {
    console.log(`   ✓ Saved mobile video: ${outputPath}`);
  }

  return true;
}

async function recordBusinessVideos(
  browser,
  meta,
  tmpDesktopDir,
  tmpMobileDir,
  desktopOut,
  mobileOut
) {
  const desktopOk = await recordDesktopVideo(browser, meta, tmpDesktopDir, desktopOut);
  const mobileOk = await recordMobileVideo(browser, meta, tmpMobileDir, mobileOut);
  return { desktopOk, mobileOk };
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

  const withEmail = records.filter((row) => {
    const email = (row.email || row.Email || '').toString().trim();
    return !!email;
  });

  console.log(`Contacts with email: ${withEmail.length} (videos will only be created for these).`);

  if (!withEmail.length) {
    console.log('Nothing to do – no rows with email.');
    return;
  }

  const toRecord = withEmail.slice(0, MAX_VIDEOS);

  const videosDir = path.join(VIDEOS_ROOT, baseName);
  ensureDir(videosDir);

  const tmpDesktopDir = path.join(videosDir, '_tmp_desktop');
  const tmpMobileDir = path.join(videosDir, '_tmp_mobile');
  ensureDir(tmpDesktopDir);
  ensureDir(tmpMobileDir);

  const browser = await chromium.launch({ headless: false });

  let processed = 0;

  for (let i = 0; i < toRecord.length; i++) {
    const row = toRecord[i];

    const name = row['Business Name'] || row.name || `business-${processed + 1}`;
    const slug = slugify(name, { lower: true, strict: true }) || `business-${processed + 1}`;

    const website = cleanUrl(row.Website || row.website || '');
    const mapsUrl = cleanUrl(row['Google Maps URL'] || row.mapsUrl || '');

    if (!website && !mapsUrl) {
      console.log(`Skipping ${name} – no website or Google Maps URL available.`);
      continue;
    }

    const searchTerm = row['Search Term'] || row.searchTerm || '';
    const rank = parseRank(row['Map Rank'] || row.rank);
    const totalForTerm = searchTerm ? totalsBySearchTerm[searchTerm] : null;
    const rating = row['Rating'] || row.rating || '';
    const reviews = row['Reviews'] || row.reviews || '';

    const indexStr = String(processed + 1).padStart(2, '0');

    const desktopOut = path.join(videosDir, `${indexStr}_${slug}_desktop.webm`);
    const mobileOut = path.join(videosDir, `${indexStr}_${slug}_mobile.webm`);

    console.log(`\n▶ Recording videos ${processed + 1}/${toRecord.length} for: ${name}`);

    await recordBusinessVideos(
      browser,
      { name, website, mapsUrl, searchTerm, rank, totalForTerm, rating, reviews },
      tmpDesktopDir,
      tmpMobileDir,
      desktopOut,
      mobileOut
    );

    processed++;
  }

  await browser.close();
  console.log(`\n✅ Done. Videos recorded for ${processed} contacts with email.`);
}

main().catch((err) => {
  console.error('Fatal error in step-3-video-recorder:', err);
  process.exit(1);
});
