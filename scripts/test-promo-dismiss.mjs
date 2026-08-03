// test-promo-dismiss.mjs — validate dismissPromoModals against a real site (page-only, leak-safe).
// Loads the URL, lets timer popups appear, screenshots BEFORE, runs the SAME killer logic step-3 uses,
// screenshots AFTER. Usage: node scripts/test-promo-dismiss.mjs <url>
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
puppeteer.use(stealth);
const URL = process.argv[2] || 'http://www.socalskinsurg.com/?utm_campaign=gmb';
const OUT = path.join(process.cwd(), 'output', 'diag', 'promo'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KILLER = () => {
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
      document.querySelectorAll(VENDOR).forEach((el) => kill(el));
      const modals = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal.show,.modal.in,[class*="popup" i],[class*="modal" i],[class*="optin" i],[class*="newsletter" i]')).filter(vis);
      for (const m of modals) {
        const btn = Array.from(m.querySelectorAll('button,a,[role="button"],span,i,svg')).filter(vis).find((b) => {
          const t = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim();
          if (FORBIDDEN.test(t)) return false;
          return CLOSE_TXT.test(t) || CLOSE_CLS.test(cls(b)) || (b.getAttribute('aria-label') || '').toLowerCase().includes('close');
        });
        if (btn) { try { btn.click(); } catch (_) {} }
      }
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
        if (!txt || txt.length > 1200) return;
        if (SIG.test(txt)) kill(el);
      });
      document.body.classList.remove('modal-open', 'no-scroll', 'overflow-hidden', 'popup-open', 'fancybox-active', 'pum-open');
      document.documentElement.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow');
    } catch (_) {}
  };
  sweep();
  let n = 0;
  window.__rgaPromoKiller = setInterval(() => { sweep(); if (++n > 36) clearInterval(window.__rgaPromoKiller); }, 1100);
};

const browser = await puppeteer.launch({ headless: false, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--mute-audio', '--window-size=1400,1000'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000); // let timer popup appear
  await page.screenshot({ path: path.join(OUT, 'before.png') });
  console.log('BEFORE screenshot saved');
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(KILLER);
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'after.png') });
  console.log('AFTER screenshot saved →', OUT);
} catch (e) { console.error('ERR', e.message); } finally { await browser.close(); }
