// Quick diagnostic — open Maps with the same Chrome profile step-3 uses,
// run a search, and dump WHICH selectors actually match result anchors.
// Helps us figure out why scroll-find returns 0 anchors (likely Google
// renamed `a.hfpxzc` or restructured the results panel).
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

const CHROME_PROFILE_DIR = path.join(process.cwd(), 'output', 'chrome-profile-step3');
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const QUERY = process.argv[2] || 'Movers in Culver City, CA';
const TARGET = process.argv[3] || 'Royal Moving';

const browser = await puppeteer.launch({
  headless: false,
  executablePath: CHROME_PATH,
  userDataDir: CHROME_PROFILE_DIR,
  defaultViewport: null,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox', '--mute-audio'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(QUERY)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

const diag = await page.evaluate((target) => {
  const selectors = [
    'a.hfpxzc',
    'a[href*="/maps/place/"]',
    'a[href*="/maps/place"]',
    'div[role="feed"] a',
    'div[role="article"]',
    'div[role="article"] a[href]',
    'div.Nv2PK',
    'div.Nv2PK a',
    'a[aria-label]',
    'a[data-result-index]',
    'div.qBF1Pd',
  ];
  const results = {};
  for (const sel of selectors) {
    try {
      const els = Array.from(document.querySelectorAll(sel));
      results[sel] = els.length;
    } catch { results[sel] = 'error'; }
  }
  // For the top match selector, get the first 5 with their hrefs + text
  const sample = [];
  const winning = selectors.find(s => results[s] > 0 && results[s] < 100);
  if (winning) {
    const els = Array.from(document.querySelectorAll(winning)).slice(0, 8);
    for (const el of els) {
      sample.push({
        sel: winning,
        href: el.href || el.getAttribute('href') || '(no href)',
        aria: el.getAttribute('aria-label') || '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        targetMatch: (el.textContent || '').toLowerCase().includes(target.toLowerCase()),
      });
    }
  }
  // Also dump the FIRST result card's outer HTML so we can see structure
  const firstArticle = document.querySelector('div[role="article"], a.hfpxzc, div[role="feed"] > div');
  const firstHtml = firstArticle ? firstArticle.outerHTML.slice(0, 600) : '(no card found)';
  return { selectorCounts: results, sample, firstHtml };
}, TARGET);

console.log('=== Selector counts ===');
console.log(JSON.stringify(diag.selectorCounts, null, 2));
console.log('\n=== Sample matches (top selector) ===');
console.log(JSON.stringify(diag.sample, null, 2));
console.log('\n=== First card outerHTML (truncated) ===');
console.log(diag.firstHtml);

await browser.close();
