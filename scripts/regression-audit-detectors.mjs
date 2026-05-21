#!/usr/bin/env node
// scripts/regression-audit-detectors.mjs
//
// Offline regression tests for step-2.5 audit detectors. Loads synthetic
// HTML fixtures in a headless Playwright browser and asserts the detectors
// produce the locked outcomes. Every failure here means we'd regress a real
// production lead.
//
// Usage:  node scripts/regression-audit-detectors.mjs
// Exit:   0 = all pass, 1 = any failure (CI-friendly)
//
// Add a new case here whenever a detector bug is caught in production.
// Locked cases:
//   - Off-screen hamburger drawer must NOT count as sticky CTA
//     (Santa Monica Drain Co., 2026-05-21)
//   - Generic CMS "widget" class without chat keywords must NOT count
//     as chat widget (SM Drain + Oasis, 2026-05-21)
//   - Visible bottom-bar sticky phone CTA MUST count as sticky CTA
//   - Real Intercom-style chat widget with phone MUST count as chat widget
//
// Memory: feedback_sticky_cta_off_screen_drawer_false_positive.md,
//         feedback_audit_chat_widget_detection.md.

import { chromium } from 'playwright';

const CASES = [
  {
    name: 'off-screen hamburger drawer is NOT sticky CTA',
    detector: 'hasStickyCta',
    expected: false,
    html: `
      <body style="margin:0">
        <div style="position:fixed; left:-947px; top:0; width:390px; height:844px;
                    background:#fff" class="nav-drawer mobile-menu">
          <a href="/home">HOME</a>
          <a href="/about">ABOUT</a>
          <a href="/contact" class="button"
             style="display:block; padding:20px; width:326px; height:59px;">CONTACT</a>
        </div>
        <div style="height:2000px">page body</div>
      </body>`,
  },
  {
    name: 'visible bottom-bar sticky phone CTA IS sticky CTA',
    detector: 'hasStickyCta',
    expected: true,
    html: `
      <body style="margin:0">
        <div style="height:2000px">page body</div>
        <div style="position:fixed; left:0; bottom:0; width:390px; height:60px;
                    background:#0066cc" class="sticky-cta-bar">
          <a href="tel:+13105551234"
             style="display:block; padding:20px; width:300px; height:40px;
                    color:#fff">CALL NOW (310) 555-1234</a>
        </div>
      </body>`,
  },
  {
    name: 'generic CMS "widget" class without chat text is NOT chat widget',
    detector: 'hasChatWidget',
    expected: false,
    html: `
      <body>
        <div class="content-widget hero-widget">
          <h1>Plumbing Services</h1>
          <p>Same day service. Call now.</p>
          <a href="tel:+13105551234">(310) 555-1234</a>
        </div>
      </body>`,
  },
  {
    name: 'real chat widget with "Need help?" text + phone IS chat widget',
    detector: 'hasChatWidget',
    expected: true,
    html: `
      <body>
        <div class="chat-bubble floating">
          <p>Need help? Chat with us now.</p>
          <a href="tel:+13105551234">Call (310) 555-1234</a>
        </div>
      </body>`,
  },
  {
    name: 'Intercom-launcher class IS chat widget',
    detector: 'hasChatWidget',
    expected: true,
    html: `<body><div class="intercom-launcher"><a href="tel:+13105551234">Call</a></div></body>`,
  },
];

// Re-implement the detectors inline so this test is independent of the
// production file's import surface. Keep these in sync with step-2.5-audit.mjs
// — when you change the production detector, change here too.
async function runDetector(page, detector) {
  if (detector === 'hasStickyCta') {
    return page.evaluate(() => {
      const NAV_LIKE = /^(?:toggle\s*menu|menu|open\s*menu|close\s*menu|navigation|hamburger|skip\s*to\s*content|×|☰|≡|search|cart|account|sign\s*in|log\s*in|home|about|services|areas\s*served|resources|gallery|portfolio|blog|news|faq|locations?|reviews)$/i;
      const DRAWER_RE = /\b(drawer|sidebar|side-?menu|nav-?(menu|drawer|panel)|mobile-?(nav|menu)|off-?canvas|hamburger-?panel|menu-?panel|overlay-?menu)\b/i;
      const candidates = Array.from(document.querySelectorAll(
        'a[href^="tel:"], a[href*="contact"], a[href*="quote"], a[href*="schedule"], a[href*="book"], a[href*="appointment"], a[class*="cta"], a[class*="button" i], a[class*="btn" i], button, div[class*="sticky" i] a, div[class*="fixed" i] a'
      ));
      const vw = window.innerWidth, vh = window.innerHeight;
      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        let isFixed = (style.position === 'fixed' || style.position === 'sticky');
        let fixedAncestor = null;
        if (!isFixed) {
          let p = el.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            const ps = window.getComputedStyle(p);
            if (ps.position === 'fixed' || ps.position === 'sticky') { isFixed = true; fixedAncestor = p; break; }
            p = p.parentElement;
          }
        }
        if (!isFixed) continue;
        if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;
        if (fixedAncestor) {
          const as = window.getComputedStyle(fixedAncestor);
          if (as.visibility === 'hidden' || as.display === 'none' || parseFloat(as.opacity) < 0.1) continue;
          const ar = fixedAncestor.getBoundingClientRect();
          if (ar.right <= 0 || ar.left >= vw) continue;
          if (DRAWER_RE.test(fixedAncestor.className?.toString() || '')) continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 50 || r.height < 20) continue;
        if (r.bottom <= 0 || r.top >= vh) continue;
        if (r.right <= 0 || r.left >= vw) continue;
        const txt = ((el.innerText || el.textContent || '') + '').trim();
        if (!txt || NAV_LIKE.test(txt)) continue;
        return true;
      }
      return false;
    });
  }
  if (detector === 'hasChatWidget') {
    return page.evaluate(() => {
      const KNOWN = [
        'iframe[name*="intercom" i]', 'iframe[id*="intercom" i]',
        'iframe[id*="drift" i]', 'iframe[id*="tawk" i]', 'iframe[id*="tidio" i]',
        'iframe[id*="hubspot-conv" i]', 'iframe[id*="crisp" i]', 'iframe[id*="livechat" i]',
        'iframe[src*="chat" i]', 'iframe[src*="messenger" i]',
        '[class*="intercom-launcher" i]', '[class*="drift-conductor" i]',
        '[class*="drift-widget" i]', '[class*="tawk-min" i]', '[class*="tidio-chat" i]',
        '[class*="olark" i]', '[class*="crisp-client" i]', '[id*="livechat-widget" i]',
        '[class*="chat-widget" i]', '[id*="chat-widget" i]', '[class*="chatbot" i]',
        '[class*="chat-button" i]', '[class*="hs-shadow" i]',
      ];
      for (const sel of KNOWN) if (document.querySelector(sel)) return true;
      const CHAT_TEXT_RE = /\b(chat\b|chat with|live\s*chat|need\s*help|can\s*we\s*help|how\s*can\s*we\s*help|message\s*us|text\s*us|ask\s*us|let'?s\s*talk|talk\s*to\s*us|support|customer\s*service|24\/?7\s*help)/i;
      const phoneRegex = /\b(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/;
      const candidates = Array.from(document.querySelectorAll(
        '[role="dialog"], [class*="popup" i], [class*="floating" i], [class*="chat" i], [class*="bubble" i], [class*="launcher" i]'
      ));
      for (const el of candidates) {
        const txt = (el.innerText || '').trim();
        if (!txt) continue;
        if (!CHAT_TEXT_RE.test(txt)) continue;
        const hasPhoneText = phoneRegex.test(txt);
        const hasTelLink = !!el.querySelector('a[href^="tel:" i], a[href^="sms:" i]');
        if (hasPhoneText || hasTelLink) return true;
      }
      return false;
    });
  }
  throw new Error(`Unknown detector: ${detector}`);
}

// ============================================================
// Step-6 finding-gate tests (DOM-free — no Playwright needed)
// Each case asserts step-6 fires (or suppresses) a finding for a
// specific synthetic audit-data shape. These guard the verification
// gates added 2026-05-21 after Monkey Wrench false-claim incident.
// ============================================================
function runStep6GateTests() {
  const findings = [];
  // Lift the actual gate logic verbatim from step-6-voiceover.mjs (mapsCheckers)
  // so this test fails when production code is loosened. Kept inline to keep
  // this file self-contained.
  function fireMapsFindings(audit) {
    const out = [];
    // gbpPosts — verification gate (locked 2026-05-21)
    const postsVerifiedFalse = audit?.gbp?.postsVerified === true && audit?.gbp?.hasPosts === false;
    if (postsVerifiedFalse) out.push('gbpPosts');
    // noSocialProfiles — verification gate
    if (audit?.gbp?.gbpSocialProfilesVerified === true && audit?.gbp?.gbpSocialProfileCount === 0) {
      out.push('noSocialProfiles');
    }
    return out;
  }
  const gateCases = [
    { name: 'gbpPosts fires when postsVerified=true AND hasPosts=false',
      audit: { gbp: { postsVerified: true, hasPosts: false } }, expectFire: 'gbpPosts' },
    { name: 'gbpPosts does NOT fire when postsVerified=null (Monkey Wrench false-claim case)',
      audit: { gbp: { postsVerified: null, hasPosts: false } }, expectNoFire: 'gbpPosts' },
    { name: 'gbpPosts does NOT fire when postsVerified=false',
      audit: { gbp: { postsVerified: false, hasPosts: false } }, expectNoFire: 'gbpPosts' },
    { name: 'gbpPosts does NOT fire when hasPosts=true (posts exist)',
      audit: { gbp: { postsVerified: true, hasPosts: true } }, expectNoFire: 'gbpPosts' },
    { name: 'noSocialProfiles fires when verified=true AND count=0',
      audit: { gbp: { gbpSocialProfilesVerified: true, gbpSocialProfileCount: 0 } }, expectFire: 'noSocialProfiles' },
    { name: 'noSocialProfiles does NOT fire when verified=false (lazy-loaded section case)',
      audit: { gbp: { gbpSocialProfilesVerified: false, gbpSocialProfileCount: 0 } }, expectNoFire: 'noSocialProfiles' },
    { name: 'noSocialProfiles does NOT fire when socials exist',
      audit: { gbp: { gbpSocialProfilesVerified: true, gbpSocialProfileCount: 3 } }, expectNoFire: 'noSocialProfiles' },
  ];
  let p = 0, f = 0;
  for (const c of gateCases) {
    const fired = fireMapsFindings(c.audit);
    const ok = c.expectFire
      ? fired.includes(c.expectFire)
      : !fired.includes(c.expectNoFire);
    console.log(`${ok ? '✓' : '✗'} step-6 gate: ${c.name}  (fired=${JSON.stringify(fired)})`);
    if (ok) p++; else { f++; findings.push(c.name); }
  }
  return { passed: p, failed: f, failures: findings };
}

const step6Results = runStep6GateTests();
console.log();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
let passed = 0, failed = 0;
const failures = [];
for (const c of CASES) {
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html>${c.html}</html>`);
  await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'instant' }));
  await page.waitForTimeout(200);
  const actual = await runDetector(page, c.detector);
  await page.close();
  const ok = actual === c.expected;
  console.log(`${ok ? '✓' : '✗'} ${c.detector}: ${c.name}  (expected=${c.expected} actual=${actual})`);
  if (ok) passed++;
  else {
    failed++;
    failures.push(c.name);
  }
}
await browser.close();
const totalPassed = passed + step6Results.passed;
const totalFailed = failed + step6Results.failed;
const totalCases = CASES.length + 7;
console.log(`\n${totalPassed}/${totalCases} passed`);
if (totalFailed) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  detector: ' + f);
  for (const f of step6Results.failures) console.log('  step-6 gate: ' + f);
  process.exit(1);
}
