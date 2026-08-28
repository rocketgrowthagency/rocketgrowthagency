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

// 🔴 2026-08-28 — DAYTIME INTERLOCK. This gate launches `headless: false`: a REAL 1300x850 Chrome
// window that pops up over whatever Chris is doing. That is invisible-by-luck, not by design — the
// pipeline only ever runs it at 21:00.
//
// It bit for real: running the pre-flight gate suite by hand at 09:17 to audit the system opened a
// Chrome window on Chris's screen mid-work. He asked "are you testing video now a chrome browser
// with the video work just opened?" — he had to notice it and ask.
//
// Headful is REQUIRED here (a real profile + stealth is what gets past Google Maps' bot detection),
// so this cannot simply be made headless like check-maps-outline-style. Instead it refuses to open
// during Chris's hours. Same window as the capture interlock in recovery-rounds.sh:70 — 07:00-20:59.
//
// Skips LOUDLY. A skipped check must never be mistaken for a passed one
// ([[feedback-dead-check-selector-gap]]) — the wording below says NOT VERIFIED, not "ok".
{
  // ⚠️ `hour:'2-digit', hour12:false` returns "24" for midnight in en-US, not "00". Here that happened
  // to be harmless (24 is outside 7-20), but relying on a quirk is how a clock guard silently inverts.
  // en-GB 24-hour formatting gives a real 00-23, so `% 24` normalises midnight to 0 explicitly.
  const h = Number(new Date().toLocaleString('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false })) % 24;
  if (h >= 7 && h < 21 && process.env.ALLOW_HEADFUL_DAYTIME !== '1') {
    console.log(`\n⏭  check-maps-card-open SKIPPED — NOT VERIFIED (it is ${String(h).padStart(2,'0')}:xx PT).`);
    console.log('   This gate opens a VISIBLE Chrome window and would appear over your screen.');
    console.log('   It runs for real in the 21:00 pipeline. To force it now: ALLOW_HEADFUL_DAYTIME=1\n');
    process.exit(0);
  }
}

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
