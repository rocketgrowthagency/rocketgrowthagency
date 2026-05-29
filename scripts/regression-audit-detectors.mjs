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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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
    // businessHours — hoursVerified gate (locked 2026-05-21)
    if (audit?.gbp?.hoursVerified === true && audit?.gbp?.hasBusinessHours === false) {
      out.push('businessHours');
    }
    // ownerResponse — reviewsParsedCount gate (locked 2026-05-21)
    const rp = audit?.gbp?.reviewsParsedCount;
    if (audit?.gbp?.ownerResponseCount === 0 && (audit?.gbp?.reviewCount || 0) > 5 && Number.isFinite(rp) && rp > 0) {
      out.push('ownerResponse');
    }
    // reviewVelocityRecent — reviewsParsedCount gate
    if (audit?.gbp?.reviewsLast30Days != null && audit.gbp.reviewsLast30Days <= 1 && Number.isFinite(rp) && rp > 0) {
      out.push('reviewVelocityRecent');
    }
    // reviewVelocity — reviewsParsedCount gate
    if (audit?.gbp?.daysSinceLastReview != null && audit.gbp.daysSinceLastReview > 30 && Number.isFinite(rp) && rp > 0) {
      out.push('reviewVelocity');
    }
    // website findings — websiteAuditVerified gate
    const wv = audit?.website?.websiteAuditVerified === true;
    if (wv && audit?.website?.hasLocalBusinessSchema === false) out.push('schema');
    if (wv && audit?.website?.hasReviewsOnPage === false) out.push('noReviews');
    if (wv && audit?.website?.hasServiceAreaListed === false) out.push('noServiceArea');
    if (wv && audit?.website?.napAboveFold === false) out.push('napAboveFold');
    // mobile findings — mobileAuditVerified gate
    const mv = audit?.mobile?.mobileAuditVerified === true;
    if (mv && audit?.mobile?.hasStickyCta === false) out.push('stickyCta');
    if (mv && audit?.mobile?.socialProofAboveFold === false) out.push('noSocialProof');
    if (mv && audit?.mobile?.phoneVisibleAboveFold === false && audit?.mobile?.clickToCallAboveFold === true) out.push('phoneNotVisible');
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
    // businessHours
    { name: 'businessHours fires when hoursVerified=true AND hasBusinessHours=false',
      audit: { gbp: { hoursVerified: true, hasBusinessHours: false } }, expectFire: 'businessHours' },
    { name: 'businessHours does NOT fire when hoursVerified=null',
      audit: { gbp: { hoursVerified: null, hasBusinessHours: false } }, expectNoFire: 'businessHours' },
    { name: 'businessHours does NOT fire when hours exist',
      audit: { gbp: { hoursVerified: true, hasBusinessHours: true } }, expectNoFire: 'businessHours' },
    // ownerResponse
    { name: 'ownerResponse fires when reviewsParsedCount > 0 AND ownerResponseCount=0',
      audit: { gbp: { ownerResponseCount: 0, reviewCount: 100, reviewsParsedCount: 8 } }, expectFire: 'ownerResponse' },
    { name: 'ownerResponse does NOT fire when reviewsParsedCount=0 (cards not scraped)',
      audit: { gbp: { ownerResponseCount: 0, reviewCount: 100, reviewsParsedCount: 0 } }, expectNoFire: 'ownerResponse' },
    { name: 'ownerResponse does NOT fire when responses exist',
      audit: { gbp: { ownerResponseCount: 5, reviewCount: 100, reviewsParsedCount: 8 } }, expectNoFire: 'ownerResponse' },
    // reviewVelocityRecent
    { name: 'reviewVelocityRecent fires when reviewsParsedCount>0 AND reviewsLast30=0',
      audit: { gbp: { reviewsLast30Days: 0, reviewsParsedCount: 8 } }, expectFire: 'reviewVelocityRecent' },
    { name: 'reviewVelocityRecent does NOT fire when reviewsParsedCount=0',
      audit: { gbp: { reviewsLast30Days: 0, reviewsParsedCount: 0 } }, expectNoFire: 'reviewVelocityRecent' },
    // reviewVelocity (daysSinceLastReview)
    { name: 'reviewVelocity fires when reviewsParsedCount>0 AND daysSinceLastReview=60',
      audit: { gbp: { daysSinceLastReview: 60, reviewsParsedCount: 8 } }, expectFire: 'reviewVelocity' },
    { name: 'reviewVelocity does NOT fire when reviewsParsedCount=0 (scraper missed)',
      audit: { gbp: { daysSinceLastReview: 60, reviewsParsedCount: 0 } }, expectNoFire: 'reviewVelocity' },
    // website verification gate
    { name: 'website schema finding fires when webVerified=true',
      audit: { website: { websiteAuditVerified: true, hasLocalBusinessSchema: false } }, expectFire: 'schema' },
    { name: 'website schema finding does NOT fire when webVerified=false',
      audit: { website: { websiteAuditVerified: false, hasLocalBusinessSchema: false } }, expectNoFire: 'schema' },
    { name: 'website noReviews fires when webVerified=true',
      audit: { website: { websiteAuditVerified: true, hasReviewsOnPage: false } }, expectFire: 'noReviews' },
    { name: 'website noReviews does NOT fire when webVerified=false',
      audit: { website: { websiteAuditVerified: false, hasReviewsOnPage: false } }, expectNoFire: 'noReviews' },
    { name: 'website noServiceArea does NOT fire when webVerified=false',
      audit: { website: { websiteAuditVerified: false, hasServiceAreaListed: false } }, expectNoFire: 'noServiceArea' },
    { name: 'website napAboveFold does NOT fire when webVerified=false',
      audit: { website: { websiteAuditVerified: false, napAboveFold: false } }, expectNoFire: 'napAboveFold' },
    // mobile verification gate
    { name: 'mobile stickyCta fires when mobVerified=true AND hasStickyCta=false',
      audit: { mobile: { mobileAuditVerified: true, hasStickyCta: false } }, expectFire: 'stickyCta' },
    { name: 'mobile stickyCta does NOT fire when mobVerified=false',
      audit: { mobile: { mobileAuditVerified: false, hasStickyCta: false } }, expectNoFire: 'stickyCta' },
    { name: 'mobile noSocialProof does NOT fire when mobVerified=false',
      audit: { mobile: { mobileAuditVerified: false, socialProofAboveFold: false } }, expectNoFire: 'noSocialProof' },
    { name: 'mobile phoneNotVisible does NOT fire when mobVerified=false',
      audit: { mobile: { mobileAuditVerified: false, phoneVisibleAboveFold: false, clickToCallAboveFold: true } }, expectNoFire: 'phoneNotVisible' },
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

// === Category-match gate (locked 2026-05-28) ===
// The GBP primary category vs search-intent check MUST consult the
// vertical_benchmarks DB (categoryDistributionTop3), NOT naive word-overlap
// against the SerpAPI listing category. Caught 2026-05-28 on Target Plumbers
// where GBP "Contractor" was falsely flagged as matching "Plumbers" search
// because the SerpAPI category said "Plumbing contractor" and "contractor"
// substring matched. Every top-3 plumber in that search uses "Plumber" —
// Target's "Contractor" → false (mismatch) → ranking-actionable finding.
//
// Memory: feedback_use_vertical_benchmarks_db_for_category_check.md
function runCategoryBenchmarkTests() {
  function check(primaryCategory, top3Distribution) {
    const topCats = Object.keys(top3Distribution || {});
    if (!topCats.length || !primaryCategory) return null;
    const lower = primaryCategory.toLowerCase().trim();
    return topCats.map((c) => c.toLowerCase().trim()).includes(lower);
  }
  const cases = [
    { name: 'Target Plumbers: "Contractor" vs top3 {Plumber} → MISMATCH',
      primaryCategory: 'Contractor', top3: { 'Plumber': 3 }, expected: false },
    { name: 'A-1 Performance: "Plumber" vs top3 {Plumber} → MATCH',
      primaryCategory: 'Plumber', top3: { 'Plumber': 3 }, expected: true },
    { name: 'Alvin garage: "Garage door repair" vs top3 {supplier,repair} → MISMATCH (the historical bug)',
      primaryCategory: 'Garage door repair', top3: { 'Garage door supplier': 2, 'Repair service': 1 }, expected: false },
    { name: 'Garage supplier: "Garage door supplier" vs top3 {supplier,repair} → MATCH',
      primaryCategory: 'Garage door supplier', top3: { 'Garage door supplier': 2, 'Repair service': 1 }, expected: true },
    { name: 'Naive-substring false-positive: "Contractor" vs SerpAPI "Plumbing contractor" must NOT use word-overlap',
      // This case proves the new logic does NOT fall back to substring overlap.
      // If the benchmark says top3=["Plumber"] and the category is "Contractor",
      // the check MUST return false regardless of any SerpAPI category overlap.
      primaryCategory: 'Contractor', top3: { 'Plumber': 3 }, expected: false },
    { name: 'Case-insensitive: "plumber" lowercase matches "Plumber"',
      primaryCategory: 'plumber', top3: { 'Plumber': 3 }, expected: true },
    { name: 'Empty top3 falls through to null (caller handles fallback)',
      primaryCategory: 'Plumber', top3: {}, expected: null },
  ];
  let p = 0, f = 0;
  const failures = [];
  for (const c of cases) {
    const got = check(c.primaryCategory, c.top3);
    const ok = got === c.expected;
    console.log(`${ok ? '✓' : '✗'} category-benchmark: ${c.name}  (expected=${c.expected} got=${got})`);
    if (ok) p++; else { f++; failures.push(c.name); }
  }
  return { passed: p, failed: f, failures };
}

const categoryResults = runCategoryBenchmarkTests();
console.log();

// === Email validation regression tests (locked 2026-05-22) ===
// Prevents placeholder/test emails like someone@example.com or
// jane.doe@aireserv.com from slipping into Airtable Leads. See
// feedback_scraper_must_filter_placeholder_emails.md.
function runEmailValidationTests() {
  const { isLikelyEmail } = require('../lib/email-validation.cjs'); // require provided via createRequire at top
  const cases = [
    // Should be REJECTED
    { email: 'someone@example.com',          expect: '', name: 'RFC 2606 example.com domain' },
    { email: 'foo@example.org',              expect: '', name: 'RFC 2606 example.org domain' },
    { email: 'bar@test.com',                 expect: '', name: 'RFC 2606 test.com domain' },
    { email: 'jane.doe@aireserv.com',        expect: '', name: 'jane.doe local on any domain' },
    { email: 'john.doe@anybiz.com',          expect: '', name: 'john.doe local on any domain' },
    { email: 'firstname.lastname@whatev.com',expect: '', name: 'firstname.lastname placeholder' },
    { email: 'fake@somewhere.com',           expect: '', name: 'fake local placeholder' },
    { email: 'placeholder@biz.com',          expect: '', name: 'placeholder local' },
    { email: 'nobody@bigbiz.com',            expect: '', name: 'nobody local placeholder' },
    // Should PASS
    { email: 'info@multiairservice.com',     expect: 'info@multiairservice.com', name: 'real biz info@ address' },
    { email: 'matt@bryantheatandair.com',    expect: 'matt@bryantheatandair.com', name: 'real first-name address' },
    { email: 'customercare@mds.email',       expect: 'customercare@mds.email', name: 'legit .email TLD' },
    { email: 'goncharov.ul@gmail.com',       expect: 'goncharov.ul@gmail.com', name: 'real-name local on Gmail' },
  ];
  let p = 0, f = 0;
  const failures = [];
  for (const c of cases) {
    const got = isLikelyEmail(c.email);
    const ok = got === c.expect;
    console.log(`${ok ? '✓' : '✗'} email-validation: ${c.name}  (input="${c.email}" got=${JSON.stringify(got)})`);
    if (ok) p++; else { f++; failures.push(c.name); }
  }
  return { passed: p, failed: f, failures };
}

const emailResults = runEmailValidationTests();
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
const totalPassed = passed + step6Results.passed + emailResults.passed + categoryResults.passed;
const totalFailed = failed + step6Results.failed + emailResults.failed + categoryResults.failed;
const totalCases = CASES.length + (step6Results.passed + step6Results.failed) + (emailResults.passed + emailResults.failed) + (categoryResults.passed + categoryResults.failed);
console.log(`\n${totalPassed}/${totalCases} passed`);
if (totalFailed) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  detector: ' + f);
  for (const f of step6Results.failures) console.log('  step-6 gate: ' + f);
  for (const f of emailResults.failures) console.log('  email-validation: ' + f);
  for (const f of categoryResults.failures) console.log('  category-benchmark: ' + f);
  process.exit(1);
}
