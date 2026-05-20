// scripts/inspect-gbp.mjs
// Open a Google Maps business page + dump the DOM structure for the panels
// we care about (hours, description, services, secondary categories, posts,
// Q&A). Used to figure out the correct modern selectors when step-1 fails
// to capture these fields.
//
// Usage: node scripts/inspect-gbp.mjs "https://www.google.com/maps/place/..."
//
// Output: /tmp/gbp-inspect-<timestamp>.json with structured findings + raw
// inner HTML/text snippets so we can pattern-match correct selectors.

import puppeteer from 'puppeteer';
import fs from 'node:fs';

const mapsUrl = process.argv[2];
if (!mapsUrl) {
  console.error('Usage: node scripts/inspect-gbp.mjs <Maps URL>');
  process.exit(1);
}

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  headless: false,
  executablePath: CHROME_PATH,
  defaultViewport: null,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('Loaded — waiting 8s for panel to settle...');
await new Promise((r) => setTimeout(r, 8000));

const report = await page.evaluate(() => {
  const safeText = (el) => (el?.innerText || el?.textContent || '').trim().slice(0, 600);
  const safeHtml = (el) => (el?.innerHTML || '').slice(0, 1500);
  const safeAttr = (el, a) => el?.getAttribute(a) || '';

  const out = {};

  // === HOURS ===
  const ohEl = document.querySelector('[data-item-id="oh"]');
  out.hours = {
    selector: '[data-item-id="oh"]',
    found: !!ohEl,
    aria_label: safeAttr(ohEl, 'aria-label'),
    inner_text: safeText(ohEl),
    text_content: (ohEl?.textContent || '').slice(0, 600),
    inner_html: safeHtml(ohEl),
  };
  // Alt selector
  const hoursAria = document.querySelector('[aria-label*="hours" i][role="button"], [aria-label*="open" i][role="button"]');
  out.hours_aria = {
    selector: '[aria-label*="hours" i][role="button"]',
    found: !!hoursAria,
    aria_label: safeAttr(hoursAria, 'aria-label'),
    text: safeText(hoursAria),
  };

  // === DESCRIPTION ===
  // Strategy 1: heading-based
  const descHeadings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button'))
    .filter(h => /^(about|from the business|description|editorial summary)/i.test((h.innerText || '').trim()));
  out.description = {
    heading_matches: descHeadings.length,
    heading_texts: descHeadings.map(h => safeText(h)),
    parent_text_samples: descHeadings.map(h => safeText(h.parentElement)),
  };
  // Strategy 2: data-item-id-based (Google has used this historically)
  const descData = document.querySelector('[data-item-id="ditk"], [data-item-id*="description" i]');
  out.description_data = {
    selector: '[data-item-id="ditk"]',
    found: !!descData,
    text: safeText(descData),
  };
  // Strategy 3: aria-label
  const descAria = document.querySelector('[aria-label*="description" i], [aria-label="About"]');
  out.description_aria = {
    found: !!descAria,
    aria_label: safeAttr(descAria, 'aria-label'),
    text: safeText(descAria),
  };

  // === SERVICES ===
  const svcHeadings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button, span'))
    .filter(h => /^services?$/i.test((h.innerText || '').trim()));
  out.services = {
    heading_matches: svcHeadings.length,
    heading_html_samples: svcHeadings.map(h => ({
      text: safeText(h),
      parent_html: safeHtml(h.parentElement),
    })),
  };

  // === SECONDARY CATEGORIES ===
  // Often a span next to the primary category button, or stacked
  const catButton = document.querySelector('button[jsaction*="category"]');
  out.categories_primary = {
    selector: 'button[jsaction*="category"]',
    found: !!catButton,
    inner_text: safeText(catButton),
    inner_html: safeHtml(catButton),
  };
  // Look for span with text matching category-shape near primary
  const headingArea = document.querySelector('div[role="region"], div.tAiQdd, div.LBgpqf');
  out.categories_region = {
    found: !!headingArea,
    text: safeText(headingArea),
  };

  // === POSTS / UPDATES ===
  const postsHeadings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button, span'))
    .filter(h => /^(updates?|posts? from|news from|from the owner)/i.test((h.innerText || '').trim()));
  out.posts = {
    heading_matches: postsHeadings.length,
    heading_texts: postsHeadings.map(h => safeText(h)),
  };

  // === Q&A ===
  const qaHeadings = Array.from(document.querySelectorAll('h2, h3, [role="heading"], button, span'))
    .filter(h => /(question|q&a|ask the community)/i.test((h.innerText || '').trim()));
  out.qa = {
    heading_matches: qaHeadings.length,
    heading_texts: qaHeadings.map(h => safeText(h)),
  };

  // === PHOTOS ===
  // Modern photo count is hidden — look for "photos" text near the gallery
  const photoBtns = Array.from(document.querySelectorAll('button[aria-label*="photo" i], button[aria-label*="See photos" i]'));
  out.photos = {
    button_count: photoBtns.length,
    button_aria_samples: photoBtns.slice(0, 5).map(b => safeAttr(b, 'aria-label')),
  };

  // === PRIMARY CATEGORY ===
  // Already captured but verify selector
  const primaryCatBtn = document.querySelector('button[jsaction*="category"]') || document.querySelector('span[jsslot] button');
  out.primary_category = {
    found: !!primaryCatBtn,
    text: safeText(primaryCatBtn),
  };

  // === FULL PANEL TEXT (last 3000 chars) ===
  const panel = document.querySelector('div[role="main"]') || document.body;
  out.panel_full_text = safeText(panel).slice(0, 5000);

  return out;
});

const ts = Date.now();
const outPath = `/tmp/gbp-inspect-${ts}.json`;
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\n=== HOURS ===`);
console.log(JSON.stringify(report.hours, null, 2));
console.log(`\n=== DESCRIPTION ===`);
console.log(JSON.stringify(report.description, null, 2));
console.log(`Description (data-item-id): ${JSON.stringify(report.description_data, null, 2)}`);
console.log(`Description (aria): ${JSON.stringify(report.description_aria, null, 2)}`);
console.log(`\n=== SERVICES ===`);
console.log(`Heading matches: ${report.services.heading_matches}`);
console.log(`\n=== POSTS ===`);
console.log(JSON.stringify(report.posts, null, 2));
console.log(`\n=== Q&A ===`);
console.log(JSON.stringify(report.qa, null, 2));
console.log(`\n=== PHOTOS ===`);
console.log(JSON.stringify(report.photos, null, 2));
console.log(`\n=== PRIMARY CATEGORY ===`);
console.log(JSON.stringify(report.primary_category, null, 2));
console.log(`\n=== FULL PANEL TEXT (first 1500 chars) ===`);
console.log(report.panel_full_text.slice(0, 1500));

console.log(`\nFull report saved to ${outPath}`);
await new Promise((r) => setTimeout(r, 3000));
await browser.close();
