#!/usr/bin/env node
/**
 * generate-geo-vertical-page.mjs — programmatic "Local SEO for <Vertical> in <City>" landing pages.
 * v2 (2026-08-04): DEEP-PAGE upgrade to move commercial-intent queries from page 4 → page 1.
 *
 * THE INBOUND FLYWHEEL (project-growth-strategy): rank for "[vertical] local seo [city]" long-tail
 * commercial queries → funnel to the Free Growth Audit. GSC shows we already rank for the money
 * queries ("seo for optometrists", "local seo for dermatologists", "culver city seo company") but
 * too low (avg pos ~42). The fix is DEPTH + intent match + internal linking, not more thin pages.
 *
 * ANTI-DOORWAY by design (Google demotes templated near-dup city-swaps): each page carries REAL per
 * city+vertical competitive data from data/vertical-benchmarks/<slug>.json (median top-3 reviews, the
 * review threshold to compete, rating bar, the category that dominates the map pack) PLUS AI-written
 * localized prose. The data is unique per page → genuine value, not a doorway.
 *
 * Each page (v2) targets "[Vertical] SEO in [City]" commercial intent and ships:
 *   - 1,200–1,800 words of genuinely useful, intent-matched content (search intent → gap → local
 *     competitive landscape → how we rank you → what's included → FAQ → CTA)
 *   - a real 5–6 question FAQ, city+vertical specific
 *   - JSON-LD: Service + FAQPage + LocalBusiness (RGA) + BreadcrumbList — page-specific, NOT the
 *     stale template schema (v1 leaked the plumber template's Service/FAQ/Breadcrumb onto every page)
 *   - strong INTERNAL LINKS: sibling city pages (same vertical), sibling vertical pages (same city),
 *     the matching /industries/<slug>/ page when one exists, /pricing/, /free-growth-audit/, /local-seo/
 *   - a tight keyword-matched <title> + meta description for CTR
 *   - clean neutral og:image (v1 leaked the plumber og card) + a city/vertical CTA band (v1 leaked the
 *     plumber "Emergency Call" band that lives outside <main>)
 *   - a sitemap.xml entry (idempotent)
 *
 * Theme = reused VERBATIM from a live industry page (locked-theme-safe: Inter, #2457e6, ix-* classes;
 * no new component/font/color). Writes local-seo/<slug>/index.html in the Website repo.
 *
 * Usage: node scripts/generate-geo-vertical-page.mjs <benchmark-slug> [<slug2> ...]   (e.g. dermatologists-in-culver-city-ca)
 *        node scripts/generate-geo-vertical-page.mjs --all        (every benchmark that lacks a page)
 *        node scripts/generate-geo-vertical-page.mjs --hub        (rebuild the /local-seo/ hub only)
 *        MOCKUP=1 ...  → writes a self-contained mockup-<slug>.html (CSS inlined) for local review, not the live page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const BENCH_DIR = path.join(SCRAPER_DIR, 'data', 'vertical-benchmarks');
const SITEMAP = path.join(WEB, 'sitemap.xml');
const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const MOCKUP = process.env.MOCKUP === '1';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const OG_IMAGE = 'https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png'; // neutral brand card (v1 leaked plumber og)

async function openai(model, messages, maxTokens, temp) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, temperature: temp, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).choices[0].message.content;
}

// Parse "Dermatologists in Culver City, CA" → { vertical:'Dermatologists', city:'Culver City', state:'CA' }
function parseSearch(term) {
  const m = term.match(/^(.*?)\s+in\s+(.*?),?\s*([A-Z]{2})\.?$/i);
  if (!m) return null;
  return { vertical: titleCase(m[1].trim()), city: m[2].trim().replace(/,$/, ''), state: m[3].toUpperCase() };
}

// Index every benchmark we have a page (or data) for → powers sibling internal links (anti-orphan).
function benchIndex() {
  const out = [];
  for (const f of fs.readdirSync(BENCH_DIR).filter((f) => f.endsWith('.json'))) {
    const slug = f.replace('.json', '');
    try { const p = parseSearch(JSON.parse(fs.readFileSync(path.join(BENCH_DIR, f), 'utf8')).searchTerm); if (p) out.push({ slug, ...p }); } catch { /* skip */ }
  }
  return out;
}

// Map a scraped vertical → an existing /industries/<slug>/ page (single strongest topical link). Only
// links when the page actually exists on disk, so we never emit a 404 internal link.
const INDUSTRY_ALIAS = {
  'hvac': 'hvac', 'plumbers': 'plumbers', 'roofers': 'roofers', 'pest control': 'pest-control',
  'foundation repair': 'foundation-repair', 'kitchen remodeling': 'kitchen-remodeling',
  'bathroom remodeling': 'bathroom-remodeling', 'orthodontists': 'orthodontists',
  'plastic surgeons': 'plastic-surgeons', 'solar installers': 'solar-installers',
  'dui lawyers': 'dui-lawyers', 'family lawyers': 'family-lawyers',
  'personal injury lawyers': 'personal-injury-lawyers', 'cosmetic dentists': 'dentists',
  'estate planning lawyers': 'lawyers', 'bankruptcy lawyers': 'lawyers',
};
function industryLink(vertical) {
  const slug = INDUSTRY_ALIAS[vertical.toLowerCase()] || vertical.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return fs.existsSync(path.join(WEB, 'industries', slug, 'index.html')) ? { slug, label: `Local SEO for ${vertical}` } : null;
}

// Reuse the LIVE theme: pull head+header+footer+scripts from an existing industry page, swap the <main> + meta + schema.
const TEMPLATE = path.join(WEB, 'industries', 'plumbers', 'index.html');

// ---------- JSON-LD (page-specific; replaces the template's stale schema) ----------
function schemaBlocks({ vertical, city, state, canonical, faq, metaDescription }) {
  const org = { '@type': 'Organization', name: 'Rocket Growth Agency', url: 'https://www.rocketgrowthagency.com/' };
  const service = {
    '@context': 'https://schema.org', '@type': 'Service',
    name: `Local SEO for ${vertical} in ${city}, ${state}`, serviceType: 'Local search engine optimization',
    description: metaDescription, areaServed: { '@type': 'City', name: `${city}, ${state}` },
    provider: org, url: canonical,
  };
  const faqPage = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: (faq || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const localBusiness = {
    '@context': 'https://schema.org', '@type': 'ProfessionalService',
    name: 'Rocket Growth Agency', url: 'https://www.rocketgrowthagency.com/',
    image: OG_IMAGE, telephone: '+1-424-242-2040', priceRange: '$$',
    address: { '@type': 'PostalAddress', streetAddress: '9937 Jefferson Blvd, Suite 120', addressLocality: 'Culver City', addressRegion: 'CA', postalCode: '90232', addressCountry: 'US' },
    areaServed: { '@type': 'City', name: `${city}, ${state}` },
    description: `Done-for-you Google Maps local SEO for ${vertical.toLowerCase()} and other local businesses in ${city}, ${state}.`,
  };
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.rocketgrowthagency.com/' },
      { '@type': 'ListItem', position: 2, name: 'Local SEO by City', item: 'https://www.rocketgrowthagency.com/local-seo/' },
      { '@type': 'ListItem', position: 3, name: `${vertical} in ${city}`, item: canonical },
    ],
  };
  return [service, faqPage, localBusiness, breadcrumb]
    .map((o) => `  <script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n  </script>`).join('\n');
}

async function buildPage(slug, index) {
  const bench = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, `${slug}.json`), 'utf8'));
  const p = parseSearch(bench.searchTerm);
  if (!p) throw new Error(`can't parse searchTerm "${bench.searchTerm}"`);
  const { vertical, city, state } = p;
  const vLow = vertical.toLowerCase();
  const r3 = bench.reviewsTop3Avg, r10 = bench.reviewsTop10 || {}, rating = bench.ratingTop3Avg || bench.ratingTop10Median, cat = bench.majorityCategoryTop3 || bench.majorityCategoryTop10 || vertical;
  const compete = r10.p75 || r10.median || r3; // reviews you realistically need to break the top 3
  const audited = bench.leadsAudited, when = bench.auditedDate;

  // --- AI: unique, DEEP localized prose (anti-doorway). Real DATA lives in the stats + landscape sections. ---
  let ai = {
    metaDescription: `Local SEO for ${vertical} in ${city}, ${state} — rank in the Google Map Pack and turn local searches into calls. Free growth audit, no contracts.`,
    heroSub: `We help ${vLow} in ${city} climb into the Google Maps top 3 — where the ready-to-hire local searches actually click.`,
    intentParas: [`When someone in ${city} needs a ${vLow.replace(/s$/, '')}, they open Google, type a "near me" search, and pick from the three businesses in the map pack. If you're not in that pack, you're not in the running.`],
    problemParas: [`Most ${vLow} in ${city} are effectively invisible on Google Maps for the searches that bring in work.`],
    landscapePara: `Breaking into the ${city} top 3 is a review-count, category, and profile-trust problem — exactly the work we do.`,
    processIntro: `Here's how we move your ${vLow} business up the ${city} map pack, step by step.`,
    whyParas: [`We do the whole job — profile, reviews, and the local website work — and report on the numbers that matter: rank, calls, and form fills.`],
    faq: [],
  };
  if (OPENAI_API_KEY) {
    try {
      const sys = `You write ONE genuinely unique, DEEP commercial landing page for Rocket Growth Agency (done-for-you Google Maps local SEO). This page targets the search "${vertical} SEO in ${city}, ${state}" / "local SEO for ${vLow} in ${city}". Google demotes templated city-swap doorway pages, so every sentence must be specific to THIS trade AND this city: reference ${city}/${state} local context (neighborhoods, nearby areas, how a local ${city} buyer searches) and ${vLow}-specific trigger moments, objections, and buying behavior. Owner-voice ("your business", "your practice"), addressed to the ${vLow} owner — NOT the end customer. Be concrete and useful, not fluffy. NEVER invent precise statistics or testimonials (real competitive numbers are injected separately by the system). Return VALID JSON only.`;
      const usr = `Return JSON with these keys, all specific to ${vLow} in ${city}, ${state}:
{"metaDescription":"135-160 chars, START with 'Local SEO for ${vertical} in ${city}', include one ${vLow}-specific benefit + a short CTA",
"heroSub":"1-2 sentence hook: the exact ${city} search a ${vLow} customer types in a trigger moment",
"intentParas":["2 paragraphs (3-4 sentences each) on SEARCH INTENT: what a ${city} customer is really doing when they search for a ${vLow.replace(/s$/,'')}, why the map pack decides who they call, and what it costs you to be below the top 3"],
"problemParas":["2 paragraphs (3-4 sentences each): the specific reasons ${vLow} in ${city} lose the map pack — reviews, category signals, service-area setup, an outdated site — and the local ${city} competitive reality"],
"landscapePara":"1 paragraph (3-4 sentences) framing what it actually takes to compete in ${city} for ${vLow} (tie to review count + category + profile trust, city-specific)",
"processIntro":"1 short paragraph introducing how RGA ranks a ${vLow} business in ${city}",
"whyParas":["2 paragraphs (3-4 sentences each) on why a ${city} ${vLow.replace(/s$/,'')} owner should pick a done-for-you partner: what gets done, that you own everything, no contracts, transparent reporting — ${vLow}-flavored"],
"faq":[{"q":"...","a":"..."} x6]}
The 6 FAQs MUST be ${city}+${vLow} specific and genuinely useful (e.g. how long to rank in ${city}, how many reviews to compete, service-area vs storefront, do you work with ${vLow}, what you actually change, how results are measured). Each answer 2-3 sentences. Apply a trade-swap AND city-swap test: rewrite anything that would still read fine for a different trade or a different city.`;
      const parsed = JSON.parse(await openai('gpt-4o-mini', [{ role: 'system', content: sys }, { role: 'user', content: usr }], 2400, 0.6));
      ai = { ...ai, ...parsed };
    } catch (e) { console.error(`  ⚠ AI prose failed for ${slug} (${e.message}) — using data-backed fallback copy.`); }
  }
  const arrP = (v, fb) => (Array.isArray(v) && v.length ? v : fb);

  // ---- sibling internal links (anti-orphan; sends topical authority + keeps crawl paths short) ----
  const sameVertical = index.filter((x) => x.slug !== slug && x.vertical === vertical).slice(0, 4);
  const sameCity = index.filter((x) => x.slug !== slug && x.city === city && x.vertical !== vertical).slice(0, 6);
  const indLink = industryLink(vertical);

  // ---- theme atoms (reused verbatim; no new component/color) ----
  const isText = (v) => typeof v === 'string' && /[a-z]/i.test(v);
  const stat = (val, label) => `<div style="background:#f6f9ff;border:1px solid #e2eaff;border-radius:12px;padding:.9rem .8rem;text-align:center"><div style="font-size:${isText(val) ? '1.02rem' : '1.75rem'};font-weight:900;color:#2457e6;line-height:1.1">${val}</div><div style="font-size:.78rem;color:#51607b;font-weight:600;margin-top:.35rem;line-height:1.3">${label}</div></div>`;
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const icoGBP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const icoGrid = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  const icoStar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6.5 7 .8-5 4.8 1.3 7L12 17.8 5.4 21l1.3-7-5-4.8 7-.8z"/></svg>';
  const icoSite = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20Z"/></svg>';
  const faqHtml = (ai.faq || []).map((f, i) => `<details class="ix-q"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="ix-a">${esc(f.a)}</div></details>`).join('\n    ');
  const canonical = `https://www.rocketgrowthagency.com/local-seo/${slug}/`;
  const title = `Local SEO for ${vertical} in ${city}, ${state} | Rocket Growth Agency`;
  const P = (t) => `<p class="ix-lead" style="margin-top:.9rem">${esc(t)}</p>`;

  const relCard = (x) => `<a class="ix-card" href="/local-seo/${x.slug}/" style="text-decoration:none;display:block;color:inherit"><h3 style="margin:0">${esc(x.vertical)} in ${esc(x.city)}</h3><p style="margin:.4rem 0 0">Local SEO + Google Map Pack strategy for ${esc(x.vertical.toLowerCase())} in ${esc(x.city)}.</p></a>`;
  const relatedBlock = (sameVertical.length || sameCity.length || indLink) ? `
  <section><div class="ix-sec">
    <div class="ix-head"><p class="ix-kick">Keep exploring</p><h2 class="ix-h2">Related local SEO pages</h2></div>
    ${sameCity.length ? `<h3 style="font-size:1.1rem;color:#0f1b3d;margin:1.6rem 0 1rem">More trades in ${esc(city)}</h3><div class="ix-grid3">${sameCity.map(relCard).join('')}</div>` : ''}
    ${sameVertical.length ? `<h3 style="font-size:1.1rem;color:#0f1b3d;margin:1.8rem 0 1rem">${esc(vertical)} in other cities</h3><div class="ix-grid3">${sameVertical.map(relCard).join('')}</div>` : ''}
    <p class="ix-lead" style="margin-top:1.6rem">${indLink ? `See our full <a href="/industries/${indLink.slug}/">${esc(indLink.label)}</a> overview, ` : ''}browse every market on the <a href="/local-seo/">Local SEO by City</a> hub, compare plans on <a href="/pricing/">pricing</a>, or <a href="/free-growth-audit/">get a free growth audit</a> for your ${esc(city)} business.</p>
  </div></section>` : '';

  const MAIN = `
  <section class="ix-hero">
    <div class="ix-hero-in">
      <div>
        <p class="ix-eyebrow">Local SEO &bull; ${esc(city)}, ${esc(state)}</p>
        <h1 class="ix-h1">Local SEO for <span class="solid-blue">${esc(vertical)}</span> in ${esc(city)}</h1>
        <p class="ix-sub">${esc(ai.heroSub)}</p>
        <div class="ix-cta-row">
          <a class="ix-btn" href="/free-growth-audit/">See where you rank in ${esc(city)} ${arrow}</a>
          <span class="ix-trust">${check} No contracts &bull; Results you can measure</span>
        </div>
      </div>
      <aside class="ix-why" style="align-self:start">
        <p class="ix-eyebrow" style="margin-bottom:.35rem">${esc(city)} map pack &mdash; by the numbers</p>
        <p style="color:#51607b;font-size:.88rem;line-height:1.5;margin:0 0 1.1rem">From our audit of the top ${audited} ${esc(vLow)} ranking for &ldquo;${esc(vertical)} in ${esc(city)}&rdquo; (${when}).</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          ${stat(r3, 'median reviews, top 3')}
          ${stat('~' + compete, 'reviews to compete')}
          ${stat((rating || 4.7) + '&#9733;', 'avg rating, leaders')}
          ${stat(esc(cat), 'owns the map pack')}
        </div>
      </aside>
    </div>
  </section>

  <section><div class="ix-sec" style="max-width:820px">
    <div class="ix-head"><p class="ix-kick">The search</p><h2 class="ix-h2">What a ${esc(city)} customer is really doing</h2></div>
    ${arrP(ai.intentParas, ai.problemParas).map(P).join('\n    ')}
  </div></section>

  <section><div class="ix-sec" style="max-width:820px">
    <div class="ix-head"><p class="ix-kick">The gap</p><h2 class="ix-h2">Why ${esc(vLow)} in ${esc(city)} lose the calls</h2></div>
    ${arrP(ai.problemParas, []).map(P).join('\n    ')}
    <p class="ix-lead" style="margin-top:.9rem">In ${esc(city)}, the top 3 aren't necessarily better ${esc(vLow)} &mdash; they've built the review count (a median of <strong>${r3}</strong> among the leaders), the category signals, and the profile Google trusts. ${esc(ai.landscapePara)}</p>
  </div></section>

  <section><div class="ix-sec">
    <div class="ix-head"><p class="ix-kick">The ${esc(city)} landscape</p><h2 class="ix-h2">What it takes to compete here</h2></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.9rem;margin:1.6rem 0 1.2rem">
      ${stat(r3, `median reviews among the ${city} top 3`)}
      ${stat('~' + compete, `reviews to realistically break the top 3`)}
      ${stat((rating || 4.7) + '&#9733;', 'rating the leaders hold')}
      ${stat(esc(cat), 'primary category that dominates')}
    </div>
    <p class="ix-lead">Those are real numbers from our ${when} audit of the ${audited} businesses ranking for &ldquo;${esc(vertical)} in ${esc(city)}&rdquo; &mdash; not industry averages. They tell you the exact review gap to close and the category your Google Business Profile has to be set to before you can rank. That's the plan we build for you.</p>
  </div></section>

  <section><div class="ix-sec">
    <div class="ix-head"><p class="ix-kick">What we do</p><h2 class="ix-h2">How we rank your ${esc(vLow)} business in ${esc(city)}</h2></div>
    <p class="ix-lead" style="margin-top:.9rem;max-width:70ch">${esc(ai.processIntro)}</p>
    <div class="ix-grid3" style="margin-top:1.6rem">
      <article class="ix-card"><div class="ix-ico">${icoGBP}</div><h3>Google Business Profile</h3><p>Primary-category alignment to <strong>${esc(cat)}</strong>, ${esc(city)} service-area tuning, services, photos, and the trust signals that decide who Google shows in the top 3.</p></article>
      <article class="ix-card"><div class="ix-ico">${icoStar}</div><h3>Reviews &amp; reputation</h3><p>A steady review-growth engine to close the gap to the ${r3}-review median the ${esc(city)} leaders hold &mdash; the single biggest lever on your map rank.</p></article>
      <article class="ix-card"><div class="ix-ico">${icoGrid}</div><h3>Geo-grid rank tracking</h3><p>We map exactly where you rank across ${esc(city)} on a grid &mdash; block by block &mdash; so you can see the gaps close instead of guessing.</p></article>
      <article class="ix-card"><div class="ix-ico">${icoSite}</div><h3>Local website work</h3><p>The service pages, local relevance, and call/form conversion paths that turn a ${esc(city)} map-pack view into a booked ${esc(vLow.replace(/s$/, ''))} appointment.</p></article>
    </div>
  </div></section>

  <section><div class="ix-sec" style="max-width:820px">
    <div class="ix-head"><p class="ix-kick">Why RGA</p><h2 class="ix-h2">A done-for-you partner, not another tool</h2></div>
    ${arrP(ai.whyParas, []).map(P).join('\n    ')}
    <div style="display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;margin-top:1.2rem;color:#0f1b3d;font-weight:700">
      <span style="display:inline-flex;align-items:center;gap:.5rem"><span style="color:#2457e6;width:20px;display:inline-flex">${check}</span> No long-term contracts</span>
      <span style="display:inline-flex;align-items:center;gap:.5rem"><span style="color:#2457e6;width:20px;display:inline-flex">${check}</span> You own everything we build</span>
      <span style="display:inline-flex;align-items:center;gap:.5rem"><span style="color:#2457e6;width:20px;display:inline-flex">${check}</span> Transparent monthly reporting</span>
    </div>
  </div></section>

  <section><div class="ix-sec"><div class="ix-incl" style="text-align:center;background:linear-gradient(160deg,#eef4ff,#f6f9ff)">
    <h2 class="ix-h2" style="margin-bottom:.6rem">See where your ${esc(vLow)} business ranks in ${esc(city)}</h2>
    <p class="ix-lead" style="max-width:60ch;margin:0 auto 1.5rem">Free growth audit &mdash; we map your Google Maps position across ${esc(city)}, show the 3 gaps holding you back, and hand you the plan to fix them. No call required.</p>
    <a class="ix-btn" href="/free-growth-audit/">Get my free ${esc(city)} audit ${arrow}</a>
  </div></div></section>

  ${faqHtml ? `<section><div class="ix-sec" style="max-width:820px">
    <div class="ix-head"><p class="ix-kick">FAQ</p><h2 class="ix-h2">${esc(vertical)} local SEO in ${esc(city)} &mdash; questions</h2></div>
    <div class="ix-faq" style="margin-top:1.4rem">
    ${faqHtml}
    </div>
  </div></section>` : ''}
  ${relatedBlock}`;

  // --- shell reuse: take the live industry page, swap <main> + head meta + schema + CTA band ---
  let tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const mS = tpl.indexOf('<main'), mSe = tpl.indexOf('>', mS) + 1, mE = tpl.lastIndexOf('</main>');
  if (mS < 0 || mE < 0) throw new Error('template <main> not found');
  let html = tpl.slice(0, mSe) + MAIN + tpl.slice(mE);

  // swap head meta (title / description / canonical / og / twitter) + neutralize the plumber og image
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(ai.metaDescription)}"`);
  html = html.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(ai.metaDescription)}`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*/, `$1${canonical}`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*/, `$1${OG_IMAGE}`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(ai.metaDescription)}`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${OG_IMAGE}`);

  // strip the template's stale ld+json (plumber Service/FAQ/Breadcrumb) and inject page-specific schema
  html = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const blocks = schemaBlocks({ vertical, city, state, canonical, faq: ai.faq, metaDescription: ai.metaDescription });
  html = html.replace('</head>', `${blocks}\n</head>`);

  // replace the plumber CTA band (lives OUTSIDE <main>, so it leaks unless swapped)
  html = html.replace(/<section class="cta-band">[\s\S]*?<\/section>/,
    `<section class="cta-band"><div class="cta-band-inner"><h2>Ready to rank your ${esc(vLow)} business in ${esc(city)}?</h2><a class="btn-light" href="/free-growth-audit/">Get Your Free Growth Audit</a></div></section>`);

  if (MOCKUP) {
    const css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8');
    let m = html.replace(/<link rel="stylesheet" href="\/style\.css[^"]*"\s*\/?>/, `<style>\n${css}\n</style>`);
    m = m.replace(/(src|href)="\/(images|favicon)/g, (x, a, pp) => `${a}="file://${WEB}/${pp}`);
    const out = path.join(WEB, `mockup-local-seo-${slug}.html`);
    fs.writeFileSync(out, m);
    console.log(`✓ MOCKUP: ${out}`);
    return;
  }
  const dir = path.join(WEB, 'local-seo', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  addToSitemap(canonical);
  const words = MAIN.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
  console.log(`✓ /local-seo/${slug}/  (${vertical} in ${city}, ${state}) — ~${words} words, ${(ai.faq || []).length} FAQs, ${sameCity.length + sameVertical.length + (indLink ? 1 : 0)} sibling links`);
}

// ---- sitemap: idempotent insert before </urlset> ----
function addToSitemap(loc) {
  try {
    let xml = fs.readFileSync(SITEMAP, 'utf8');
    if (xml.includes(`<loc>${loc}</loc>`)) return false;
    const today = new Date().toISOString().slice(0, 10);
    const entry = `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    xml = xml.replace('</urlset>', `${entry}</urlset>`);
    fs.writeFileSync(SITEMAP, xml);
    return true;
  } catch (e) { console.error(`  ⚠ sitemap update skipped (${e.message})`); return false; }
}

// Build /local-seo/ hub: lists every generated geo page, grouped by city (internal linking for SEO).
function buildHub() {
  const dir = path.join(WEB, 'local-seo');
  const slugs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((s) => s !== 'index.html' && fs.existsSync(path.join(dir, s, 'index.html'))) : [];
  const byCity = {};
  for (const slug of slugs) {
    let p; try { p = parseSearch(JSON.parse(fs.readFileSync(path.join(BENCH_DIR, `${slug}.json`), 'utf8')).searchTerm); } catch { continue; }
    if (!p) continue;
    const key = `${p.city}, ${p.state}`;
    (byCity[key] = byCity[key] || []).push({ slug, ...p });
  }
  const cities = Object.keys(byCity).sort();
  const total = slugs.length;
  const groups = cities.map((c) => `
      <div style="margin-bottom:2.4rem">
        <h3 style="font-size:1.2rem;color:#0f1b3d;margin:0 0 1.1rem;letter-spacing:-.01em">${esc(c)}</h3>
        <div class="ix-grid3">
          ${byCity[c].sort((a, b) => a.vertical.localeCompare(b.vertical)).map((x) => `<a class="ix-card" href="/local-seo/${x.slug}/" style="text-decoration:none;display:block;color:inherit"><h3 style="margin:0">Local SEO for ${esc(x.vertical)}</h3><p style="margin:.45rem 0 0">Rank your ${esc(x.vertical.toLowerCase())} business in the ${esc(x.city)} Google Map Pack.</p></a>`).join('')}
        </div>
      </div>`).join('\n');
  const MAIN = `
  <section class="ix-hero"><div class="ix-hero-in" style="grid-template-columns:1fr">
    <div>
      <p class="ix-eyebrow">Local SEO by city &amp; trade</p>
      <h1 class="ix-h1">Local SEO for your <span class="solid-blue">trade</span>, in your <span class="solid-blue">city</span></h1>
      <p class="ix-sub" style="max-width:60ch">We map the Google Map Pack for ${total}+ trade &times; city markets with real competitive data &mdash; find yours below, or get a free audit for any local business.</p>
      <div class="ix-cta-row"><a class="ix-btn" href="/free-growth-audit/">Get your free growth audit <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a></div>
    </div>
  </div></section>
  <section><div class="ix-sec">
    <div class="ix-head"><p class="ix-kick">Browse by city</p><h2 class="ix-h2">${total} local markets we've mapped</h2></div>
    <div style="margin-top:1.8rem">${groups}</div>
  </div></section>`;
  let tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const mS = tpl.indexOf('<main'), mSe = tpl.indexOf('>', mS) + 1, mE = tpl.lastIndexOf('</main>');
  let html = tpl.slice(0, mSe) + MAIN + tpl.slice(mE);
  const canonical = 'https://www.rocketgrowthagency.com/local-seo/';
  const title = 'Local SEO by City & Trade | Rocket Growth Agency';
  const desc = 'Local SEO for your trade in your city — real Google Map Pack competitive data by market. Find your city + trade, or get a free growth audit.';
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(desc)}"`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${canonical}"`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`).replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`).replace(/(<meta property="og:url" content=")[^"]*/, `$1${canonical}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${OG_IMAGE}`).replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${OG_IMAGE}`);
  // strip stale plumber schema + plumber CTA band from the hub too
  html = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  html = html.replace(/<section class="cta-band">[\s\S]*?<\/section>/,
    '<section class="cta-band"><div class="cta-band-inner"><h2>Find your city, then find your top 3.</h2><a class="btn-light" href="/free-growth-audit/">Get Your Free Growth Audit</a></div></section>');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  addToSitemap(canonical);
  console.log(`✓ /local-seo/ hub — ${total} pages across ${cities.length} cities`);
}

const args = process.argv.slice(2);
if (args.includes('--hub')) { buildHub(); process.exit(0); }
let slugs = args.filter((a) => !a.startsWith('--'));
if (args.includes('--all')) slugs = fs.readdirSync(BENCH_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
  .filter((s) => MOCKUP || !fs.existsSync(path.join(WEB, 'local-seo', s, 'index.html')));
if (!slugs.length) { console.error('usage: node scripts/generate-geo-vertical-page.mjs <benchmark-slug ...> | --all | --hub   (MOCKUP=1 for review)'); process.exit(1); }
const index = benchIndex();
for (const s of slugs) { try { await buildPage(s, index); } catch (e) { console.error(`✗ ${s}: ${e.message}`); } }
