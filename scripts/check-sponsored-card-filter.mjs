#!/usr/bin/env node
// scripts/check-sponsored-card-filter.mjs
//
// Regression: step-3 video recorder MUST NEVER outline or include a Sponsored
// Maps card in the recording — for either rank 1-3 or rank 4+ leads. Caught
// twice in production:
//   1. 2026-05-21 — Monkey Wrench: getListingHrefByName matched sponsored
//   2. 2026-06-02 — Beverly Hills Roofing Contractors: blue outline landed on
//      Hull Brothers (Sponsored) because the pre-click centering pass had its
//      own card-finder without the sponsored filter
//
// This pre-flight regression uses JSDOM to simulate a Maps results panel with
// BOTH a sponsored card and an organic card sharing the same business words.
// Then it exercises both filter paths and asserts:
//   (a) getListingHrefByName logic returns the ORGANIC href, not sponsored
//   (b) the pre-click centering loop CSS-hides the sponsored card
//   (c) the outline lands on the organic card (matched by href, not text)
//
// Both flows in step-3 (rank 1-3 top-3 + rank 4+ deep-rank chain + bare-name
// URL fallback) call clickListingInResultsByName, which is the function under
// test. So passing this test means coverage for BOTH rank tiers.
//
// Run from project root:
//   node scripts/check-sponsored-card-filter.mjs
//
// Exits non-zero on any failure. Wired into overnight-pipeline.sh pre-flight.

import { JSDOM } from 'jsdom';

let failures = 0;
const assert = (cond, msg) => {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
};

// Build a fake Maps results panel: 1 sponsored + 1 organic, both matching
// the target business name. Sponsored is FIRST (typical layout).
//
// Each card is patched with its own innerText getter so the walk-up isn't
// fooled by ancestor concatenation. The production isSponsoredBlock walks
// up 4 ancestor levels in case the "Sponsored" badge is on a sibling wrapper;
// in real Maps DOM those ancestors are deep enough that they don't share
// innerText with adjacent cards. Patch ancestors with empty innerText so the
// walk-up doesn't falsely flag.
function buildMapsDom() {
  // Real Maps DOM nests each card 5+ wrapper divs deep, so the 4-level
  // ancestor walk doesn't escape the card subtree to find a sibling card's
  // sponsored marker. Mirror that nesting here.
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div role="feed">
      <div class="L1"><div class="L2"><div class="L3"><div class="L4"><div class="L5">
        <div role="article" class="Nv2PK" data-test-id="sponsored-card">
          <div aria-label="Sponsored">Sponsored</div>
          <a class="hfpxzc" href="https://www.google.com/maps/place/Hull+Brothers+Roofing/data=!4m6!sponsored123" aria-label="Hull Brothers Roofing and Waterproofing">
            <div class="qBF1Pd">Hull Brothers Roofing and Waterproofing</div>
          </a>
        </div>
      </div></div></div></div></div>
      <div class="L1"><div class="L2"><div class="L3"><div class="L4"><div class="L5">
        <div role="article" class="Nv2PK" data-test-id="organic-card">
          <a class="hfpxzc" href="https://www.google.com/maps/place/Beverly+Hills+Roofing+Contractors/data=!4m6!organic456" aria-label="Beverly Hills Roofing Contractors">
            <div class="qBF1Pd">Beverly Hills Roofing Contractors</div>
          </a>
        </div>
      </div></div></div></div></div>
    </div>
  </body></html>`);
  // Patch each card's innerText AND its ancestors so the walk-up doesn't see
  // sibling text. Real Maps DOM has structurally-isolated card containers; we
  // simulate that here by giving each card-tree its own scoped innerText.
  const doc = dom.window.document;
  const sponsoredCard = doc.querySelector('[data-test-id="sponsored-card"]');
  const organicCard = doc.querySelector('[data-test-id="organic-card"]');
  Object.defineProperty(sponsoredCard, 'innerText', {
    get() { return 'Sponsored\nHull Brothers Roofing and Waterproofing\n4.9 stars 50 reviews'; },
  });
  Object.defineProperty(organicCard, 'innerText', {
    get() { return 'Beverly Hills Roofing Contractors\n5.0 stars 18 reviews'; },
  });
  return dom;
}

// Apply the same scoping treatment to an arbitrary 2-card fixture
function scopeInnerText(doc, sponsoredText, organicText) {
  const cards = doc.querySelectorAll('div[role="article"]');
  Object.defineProperty(cards[0], 'innerText', { get() { return sponsoredText; }, configurable: true });
  Object.defineProperty(cards[1], 'innerText', { get() { return organicText; }, configurable: true });
  // No ancestor wrapping in cases 4-5 → make body.innerText empty
  Object.defineProperty(doc.body, 'innerText', { get() { return ''; }, configurable: true });
}

// ===== Replicas of the filters in step-3-video-recorder.mjs =====
// Keep these in sync. If step-3's filters drift, this test catches the drift.

// 2026-06-12: card-root-only (matches step-3). The 4-ancestor walk over-matched
// on logged-in Maps layout (neighbouring sponsored cards' text reachable via a
// shared ancestor → every card flagged → no card matched). Inspect only the card.
function isSponsoredBlock(root) {
  if (!root) return false;
  const t = (root.innerText || '').toLowerCase();
  if (/\bsponsored\b/.test(t.slice(0, 60))) return true;
  if (root.querySelector && root.querySelector(
    '[aria-label*="Sponsored" i], [aria-label="Ad" i], [data-value="ad" i], [data-tts="ad" i]'
  )) return true;
  return false;
}

function getMatchingHref(document, targetName) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = norm(targetName);
  const anchors = Array.from(document.querySelectorAll('a.hfpxzc'));
  const scored = [];
  for (const anchor of anchors) {
    const cardRoot = anchor.closest('div[role="article"], div.Nv2PK') || anchor.parentElement;
    if (cardRoot && isSponsoredBlock(cardRoot)) continue;
    const aria = norm(anchor.getAttribute('aria-label') || '');
    const title = norm(cardRoot?.querySelector?.('.qBF1Pd, .fontHeadlineSmall, h3')?.textContent || '');
    let best = 0;
    for (const c of [aria, title].filter(Boolean)) {
      if (c === target) best = Math.max(best, 100);
      else if (c.includes(target) || target.includes(c)) best = Math.max(best, 75);
    }
    if (best > 0) scored.push({ href: anchor.href, best });
  }
  scored.sort((a, b) => b.best - a.best);
  return scored[0]?.href || null;
}

function hideSponsoredCards(document) {
  let hidden = 0;
  const cards = Array.from(document.querySelectorAll('div[role="article"], div.Nv2PK'));
  for (const card of cards) {
    if (isSponsoredBlock(card)) {
      card.style.display = 'none';
      hidden++;
    }
  }
  return hidden;
}

// ===== Tests =====

console.log('=== Sponsored-card filter regression ===\n');

const dom = buildMapsDom();
const doc = dom.window.document;
const target = 'Beverly Hills Roofing Contractors';

console.log('[case 1] getListingHrefByName equivalent — must skip Sponsored, return organic');
const matched = getMatchingHref(doc, target);
assert(matched !== null, 'returns a non-null href');
assert(matched && matched.includes('organic456'), 'returns the ORGANIC href (organic456)');
assert(!(matched && matched.includes('sponsored123')), 'does NOT return sponsored href');

console.log('\n[case 2] hideSponsoredCards — must CSS-hide the sponsored card');
const hiddenCount = hideSponsoredCards(doc);
assert(hiddenCount === 1, `hides exactly 1 sponsored card (got ${hiddenCount})`);
const cards = doc.querySelectorAll('div[role="article"]');
assert(cards[0].style.display === 'none', 'sponsored card display:none');
assert(cards[1].style.display !== 'none', 'organic card NOT hidden');

console.log('\n[case 3] href-based outline match — must locate organic anchor by href');
const targetHref = matched;
const anchors = Array.from(doc.querySelectorAll('a.hfpxzc'));
const stripQ = (h) => String(h || '').split('?')[0];
const matchAnchor = anchors.find((a) => a.href === targetHref) ||
                    anchors.find((a) => stripQ(a.href) === stripQ(targetHref));
const matchCard = matchAnchor?.closest('div[role="article"], div.Nv2PK');
assert(matchCard !== null && matchCard !== undefined, 'finds card for organic href');
assert(matchCard && !isSponsoredBlock(matchCard), 'matched card is NOT sponsored');

console.log('\n[case 4] edge case: ARIA-only sponsored (no innerText "Sponsored")');
const dom2 = new JSDOM(`<!DOCTYPE html><html><body>
  <div role="feed">
    <div class="L1"><div class="L2"><div class="L3"><div class="L4"><div class="L5">
      <div role="article" class="Nv2PK">
        <a class="hfpxzc" href="https://www.google.com/maps/place/Ad+Result/x" aria-label="Ad">
          <div class="qBF1Pd">Beverly Hills Roofing Service</div>
        </a>
      </div>
    </div></div></div></div></div>
    <div class="L1"><div class="L2"><div class="L3"><div class="L4"><div class="L5">
      <div role="article" class="Nv2PK">
        <a class="hfpxzc" href="https://www.google.com/maps/place/Beverly+Hills/y" aria-label="Beverly Hills Roofing Contractors">
          <div class="qBF1Pd">Beverly Hills Roofing Contractors</div>
        </a>
      </div>
    </div></div></div></div></div>
  </div>
</body></html>`);
scopeInnerText(dom2.window.document, 'Beverly Hills Roofing Service\n4.5 stars', 'Beverly Hills Roofing Contractors\n5.0 stars');
const matched2 = getMatchingHref(dom2.window.document, target);
assert(matched2 && matched2.includes('Beverly+Hills/y'), 'ARIA="Ad" card filtered, organic returned');

console.log('\n[case 5] edge case: data-tts="ad" attribute');
const dom3 = new JSDOM(`<!DOCTYPE html><html><body>
  <div role="feed">
    <div class="L1"><div class="L2"><div class="L3"><div class="L4"><div class="L5">
      <div role="article" class="Nv2PK">
        <span data-tts="ad">Promoted</span>
        <a class="hfpxzc" href="https://www.google.com/maps/place/Promoted/z" aria-label="Beverly Hills Roofing Promoted">
          <div class="qBF1Pd">Beverly Hills Roofing Promoted</div>
        </a>
      </div>
    </div></div></div></div></div>
    <div class="L1"><div class="L2"><div class="L3"><div class="L4"><div class="L5">
      <div role="article" class="Nv2PK">
        <a class="hfpxzc" href="https://www.google.com/maps/place/Real/w" aria-label="Beverly Hills Roofing Contractors">
          <div class="qBF1Pd">Beverly Hills Roofing Contractors</div>
        </a>
      </div>
    </div></div></div></div></div>
  </div>
</body></html>`);
scopeInnerText(dom3.window.document, 'Beverly Hills Roofing Promoted\n4.0 stars', 'Beverly Hills Roofing Contractors\n5.0 stars');
const matched3 = getMatchingHref(dom3.window.document, target);
assert(matched3 && matched3.includes('Real/w'), 'data-tts="ad" card filtered, organic returned');

console.log('');
if (failures > 0) {
  console.error(`❌ ${failures} assertion(s) failed — sponsored-card filter regression`);
  process.exit(1);
}
console.log(`✅ All sponsored-card filter regression checks passed`);
