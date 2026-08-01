// diag-deeprank.mjs — faithfully replicate step-3's DEEP-RANK Maps navigation for ONE lead
// and screenshot every stage (page.screenshot only — NO display capture, leak-safe / daytime-OK).
// Purpose: see EXACTLY where the detail card fails to render for rank>20 leads.
// Usage: node scripts/diag-deeprank.mjs
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

// --- tyson lead, exactly as step-3 sees it ---
const LEAD = {
  name: 'Tyson Takeuchi Law Offices',
  city: 'Los Angeles',
  searchTerm: 'Bankruptcy lawyers in Culver City, CA',
  rank: 22,
  mapsUrl: '', // row['Google Maps URL'] does NOT exist → empty, exactly like the pipeline
};

const CHROME_PROFILE_DIR = path.join(process.cwd(), 'output', 'chrome-profile-step3-diag'); // separate profile → no lock clash
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAPS_VIEWPORT = { width: 1600, height: 900, deviceScaleFactor: 1 };
const OUT = path.join(process.cwd(), 'output', 'diag', 'deeprank-tyson');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let shot = 0;
const snap = async (page, label) => {
  const p = path.join(OUT, `${String(++shot).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: p }).catch(e => console.log('  snap err', e.message));
  console.log(`  📸 ${path.basename(p)}`);
  return p;
};

// mirror step-3 detail/results detection EXACTLY
const detect = async (page) => {
  await sleep(2500);
  const onDetail = await page.evaluate(() => {
    const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
    return h1 ? h1.textContent.trim() : null;
  }).catch(() => null);
  if (onDetail && onDetail.length > 1) return { status: 'detail', h1: onDetail };
  const results = await page.evaluate(() => document.querySelectorAll('a.hfpxzc').length).catch(() => 0);
  if (results > 0) return { status: 'results', count: results };
  return { status: 'blank' };
};

const browser = await puppeteer.launch({
  headless: false, executablePath: CHROME_PATH, userDataDir: CHROME_PROFILE_DIR,
  defaultViewport: null,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox', '--mute-audio', `--window-size=1640,1040`],
});
const page = await browser.newPage();
await page.setViewport(MAPS_VIEWPORT);

try {
  // STAGE 1 — initial category search (competitive context)
  const catUrl = `https://www.google.com/maps/search/${encodeURIComponent(LEAD.searchTerm)}`;
  console.log(`\n[1] category search: ${LEAD.searchTerm}`);
  await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  await page.waitForSelector('a.hfpxzc', { timeout: 9000 }).catch(() => {});
  await sleep(1500);
  const cat = await detect(page);
  console.log('   →', JSON.stringify(cat));
  await snap(page, 'category-list');

  // STAGE 2 — deep-rank (rank 22 > 20): skip scroll-find, run URL chain
  console.log(`\n[2] rank ${LEAD.rank} > 20 → deep-rank URL chain (mapsUrl empty)`);
  const urls = [];
  const nameCity = LEAD.name + (LEAD.city ? ', ' + LEAD.city : '');
  urls.push(`https://www.google.com/maps/search/${encodeURIComponent(nameCity)}`);
  urls.push(`https://www.google.com/maps/search/${encodeURIComponent(LEAD.name)}`);

  let landed = false, finalStatus = null;
  for (let i = 0; i < urls.length; i++) {
    console.log(`\n[2.${i + 1}] nav attempt ${i + 1}/${urls.length}: ${urls[i]}`);
    await page.goto(urls[i], { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('   goto err', e.message));
    const d = await detect(page);
    console.log('   →', JSON.stringify(d));
    await snap(page, `nav${i + 1}-${d.status}`);
    finalStatus = d;
    if (d.status === 'detail') { landed = true; break; }
    if (d.status === 'results') {
      // click the matching listing by name (mirror clickListingInResultsByName intent)
      const clicked = await page.evaluate((target) => {
        const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const t = norm(target);
        const links = Array.from(document.querySelectorAll('a.hfpxzc'));
        for (const a of links) {
          const label = norm(a.getAttribute('aria-label'));
          if (label && (label.includes(t) || t.includes(label))) { a.click(); return a.getAttribute('aria-label'); }
        }
        return null;
      }, LEAD.name).catch(() => null);
      console.log(`   click-in-results: ${clicked ? 'clicked "' + clicked + '"' : 'NO MATCH in list'}`);
      if (clicked) {
        await sleep(2500);
        const d2 = await detect(page);
        console.log('   → after click:', JSON.stringify(d2));
        await snap(page, `nav${i + 1}-afterclick-${d2.status}`);
        finalStatus = d2;
        if (d2.status === 'detail') { landed = true; break; }
      }
    }
  }

  // STAGE 3 — the "hold on card" moment: this is what the freeze-frame grabs
  console.log(`\n[3] final hold-frame (what the video freezes on): landed=${landed}`);
  await sleep(2000);
  const finalCard = await page.evaluate(() => {
    const h1 = document.querySelector('h1.DUwDvf, h1[role="heading"][aria-level="1"]');
    const photo = document.querySelector('button[aria-label*="Photo"], img[decoding]');
    return { h1: h1 ? h1.textContent.trim() : null, hasPhoto: !!photo };
  }).catch(() => ({ h1: null, hasPhoto: false }));
  console.log('   final card state:', JSON.stringify(finalCard));
  await snap(page, 'FINAL-hold-frame');

  console.log(`\n===== VERDICT =====`);
  console.log(`landed on detail card: ${landed}`);
  console.log(`final h1: ${finalCard.h1 || '(NONE — no card)'}`);
  console.log(`screenshots in: ${OUT}`);
} catch (e) {
  console.error('DIAG ERROR:', e.message);
} finally {
  await browser.close();
}
