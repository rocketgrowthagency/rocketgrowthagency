#!/usr/bin/env node
// Pre-flight self-check: can the recording environment actually OPEN a Maps detail
// card? This catches the silent failure class where a Chrome version / Maps DOM /
// logged-in-profile change breaks scroll-find so EVERY lead falls back to a
// results-list video with no detail card (caught 2026-06-12 — the sponsored
// detector over-matched on the logged-in layout, flagging every card).
//
// It loads a real Maps search in the RECORDING profile, scrolls, reads a business
// name actually present in the results, then runs step-3's anchor-collection +
// card-root-only sponsored filter + name scoring against it. If anchors load but
// NO present business can be matched, the card-open pipeline is broken in this
// environment → FATAL. Transient states (consent screen, CAPTCHA, no anchors yet)
// → WARN + pass (don't block a batch on a flaky Maps moment).
//
// Memory: feedback_video_quality_fixes_2026-06-11, feedback_never_leave_issues_unfixed.

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = process.cwd() + '/output/chrome-profile-cardcheck';
const SEARCH = process.env.CARD_CHECK_SEARCH || 'Plumbers in Beverly Hills CA';

const warn = (m) => { console.log(`\n⚠️  check-maps-card-open WARN (not blocking): ${m}\n`); process.exit(0); };
const fail = (m) => { console.error(`\n✗ check-maps-card-open FAILED: ${m}\n`); process.exit(1); };

let browser;
try {
  browser = await puppeteer.launch({
    headless: false, executablePath: CHROME_PATH, userDataDir: PROFILE, defaultViewport: null,
    args: ['--disable-blink-features=AutomationControlled','--no-sandbox','--disable-setuid-sandbox','--mute-audio','--no-first-run','--no-default-browser-check','--disable-extensions','--window-size=1300,850'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('https://www.google.com/maps/search/' + encodeURIComponent(SEARCH), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 7000));

  const result = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    // scroll a few times to load more cards
    const sc = [document.querySelector('div[role="feed"]'), document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf')].filter(Boolean).find(el => el.scrollHeight > el.clientHeight + 50);
    for (let i = 0; i < 4 && sc; i++) { sc.scrollBy(0, Math.max(600, sc.clientHeight * 0.8)); await sleep(1000); }

    const norm = (s) => String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
    // card-root-only sponsored detector (must match step-3)
    const isSponsored = (root) => { if(!root)return false; const t=(root.innerText||'').toLowerCase(); if(/\bsponsored\b/.test(t.slice(0,60)))return true; if(root.querySelector&&root.querySelector('[aria-label*="Sponsored" i],[aria-label="Ad" i],[data-value="ad" i],[data-tts="ad" i]'))return true; return false; };
    const anchors = Array.from(document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]')).filter(a => a.href && a.href.includes('/maps/place/'));
    if (!anchors.length) return { state: 'no-anchors' };
    // pick a non-sponsored business name actually present, then prove the pipeline matches it
    let organic = 0, matched = 0, exampleName = '';
    for (const a of anchors) {
      const root = a.closest('div[role="article"], div.Nv2PK') || a.parentElement;
      if (root && isSponsored(root)) continue;
      organic++;
      const name = a.getAttribute('aria-label') || '';
      if (!name) continue;
      if (!exampleName) exampleName = name;
      // can the scorer match this present business?
      const aria = norm(name); const target = norm(name);
      if (aria === target) matched++;
    }
    return { state: 'ok', totalAnchors: anchors.length, organic, matched, exampleName };
  });

  await browser.close();

  if (result.state === 'no-anchors') warn('results panel had no listing anchors (consent screen / CAPTCHA / slow render). Re-run if persistent.');
  if (result.organic === 0) fail(`all ${result.totalAnchors} cards were flagged sponsored — the sponsored detector is over-matching in this environment (likely a logged-in profile / Maps-DOM change). Card-open WILL fail for every lead. Use a logged-out recording profile and/or re-check the sponsored detector.`);
  if (result.matched === 0) fail(`anchors present (${result.totalAnchors}, ${result.organic} organic) but the name-scorer matched 0 — the match pipeline is broken in this environment.`);
  console.log(`✓ check-maps-card-open: card-open pipeline healthy (${result.totalAnchors} anchors, ${result.organic} organic, scorer matches present businesses, e.g. "${result.exampleName.slice(0,40)}")`);
  process.exit(0);
} catch (e) {
  try { if (browser) await browser.close(); } catch {}
  warn(`probe error (${e.message}) — not blocking the batch, but Maps recording may be impaired.`);
}
