#!/usr/bin/env node
/**
 * generate-industry-page.mjs — RGA COMMERCIAL industry landing pages (WS2 hub-and-spoke).
 *
 * Sibling to generate-blog-post.mjs. The blog post is INFORMATIONAL ("how to rank as a
 * <vertical>"); this is the COMMERCIAL conversion page ("we do <vertical> local SEO for
 * you"). They cross-link: blog → industry page (done-for-you), industry page → blog (the
 * how-to). Targets commercial-intent keywords; built to convert (proof framing + CTAs).
 *
 * Output: industries/<slug>/index.html in the Website repo. Service + Breadcrumb + FAQ
 * schema, OG tags, links to the matching blog post + services + pricing + free audit.
 * Same safety as the blog engine: OpenAI structured output, deterministic guard + editor
 * gate (>=7/10), retries, dedupe, --publish wires sitemap + /industries/ hub index.
 *
 * Usage: node scripts/generate-industry-page.mjs "Plumbers" [--publish] [--force]
 *        node scripts/generate-industry-page.mjs --from-queue --count=1 --publish
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const PUBLISH = ARGS.includes('--publish');
const FORCE = ARGS.includes('--force');
const FROM_QUEUE = ARGS.includes('--from-queue');
const countArg = ARGS.find((a) => a.startsWith('--count='));
const COUNT = countArg ? parseInt(countArg.split('=')[1], 10) : null;
const VERTICAL_ARGS = ARGS.filter((a) => !a.startsWith('--'));
if (!VERTICAL_ARGS.length && !FROM_QUEUE) { console.error('Usage: generate-industry-page.mjs "<Vertical>" [...] | --from-queue [--count=N] [--publish] [--force]'); process.exit(1); }

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const IND_DIR = path.join(WEBSITE_DIR, 'industries');
// Approved target industries (single source of truth). Fail-closed: bad/missing config → match nothing.
const APPROVED_INDUSTRIES = (() => {
  try { return new Set((JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'approved-industries.json'), 'utf8')).approved) || []); }
  catch (e) { console.error('[approved-industries] could not load config/approved-industries.json — refusing to pull off-list:', e.message); return new Set(); }
})();
const BLOG_DIR = path.join(WEBSITE_DIR, 'blog');
const SITEMAP = path.join(WEBSITE_DIR, 'sitemap.xml');

const env = Object.fromEntries(fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const MODEL = env.BLOG_MODEL || 'gpt-4o';
const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
const EDITOR_MIN = Number(env.BLOG_EDITOR_MIN || 7);
const MAX_PER_DAY = Number(env.IND_MAX_PER_DAY || 1);
const DAILY_COST_CEILING = Number(env.BLOG_DAILY_COST_CEILING || 0.5);
const SPEND_FILE = `/tmp/rga-industry-engine-${new Date().toISOString().slice(0, 10)}.json`;
if (!OPENAI_API_KEY) { console.error('No OPENAI_API_KEY'); process.exit(1); }
const readSpend = () => { try { return JSON.parse(fs.readFileSync(SPEND_FILE, 'utf8')); } catch { return { posts: 0, cost: 0 }; } };
const writeSpend = (s) => { try { fs.writeFileSync(SPEND_FILE, JSON.stringify(s)); } catch (_) {} };
const TODAY = new Date().toISOString().slice(0, 10);
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const titleCase = (s) => String(s).split(' ').map((w) => (w === w.toLowerCase() && /[a-z]/.test(w)) ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
let lastUsage = null, lastEditorCost = 0;

async function openai(model, messages, maxTokens, temp) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, temperature: temp, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function generateContent(vertical) {
  const sys = `You are a senior local-SEO strategist + conversion copywriter for Rocket Growth Agency (done-for-you Google Maps local SEO for local service businesses). You write COMMERCIAL landing pages that are GENUINELY UNIQUE per trade. Google's scaled-content-abuse + doorway-page policies DEMOTE templated, near-duplicate pages, so every page must read as if written ONLY for this one trade.
THE TRADE-SWAP TEST (apply to every sentence — especially the opener + FAQ): if a line would still make sense with a DIFFERENT trade's name swapped in, it is generic and FAILS. The first sentence and the FAQ must contain details that are FALSE or nonsensical for any other trade.
CRITICAL VOICE RULE — never break it: The READER is the OWNER of the ${vertical} business. YOU are Rocket Growth Agency, the marketing agency that gets THEIR business to the top of Google Maps. So "we / our / us" ALWAYS means RGA's SEO service — NEVER the ${vertical}'s field work. NEVER write in the trade's own customer-facing ad voice: forbidden are lines like "our team is ready 24/7", "we're fully licensed and insured", "call us for your plumbing needs", "book your appointment today". The customer's trigger event (burst pipe, toothache, car accident) is only a HOOK to illustrate the moment a customer searches Google Maps — then PIVOT to: that searching customer should find the OWNER's business, and RGA makes that happen. Address the owner as "you/your business"; describe THEIR customers in the third person ("homeowners search…", "your patients look for…").`;
  const user = `Write a COMMERCIAL "Local SEO for ${vertical}" landing page for RGA's done-for-you Google Maps service.

FIRST, silently establish THIS trade's reality (use it throughout; do NOT output it as its own section):
- Search intent: emergency / considered-research / relationship-recurring / high-stakes-one-time?
- The buyer's real TRIGGER EVENT + urgency (e.g. burst pipe at 2am; hailstorm tore off shingles; sudden toothache; just got in a car accident).
- Avg ticket tier (low/mid/high) → dictates proof type + CTA.
- Seasonality (or year-round steady).
- 3-5 REAL search phrases ${vertical} customers actually type (e.g. "emergency plumber near me open now").
- The licensing/credential body for this trade (state contractor license / state bar / dental board / medical board / etc.).
- 2-3 real objections a buyer has before calling a ${vertical}.
- Which proof converts for this trade (response time / warranties / case results / financing / reviews / before-after).

Then write the page GROUNDED in that reality.

HARD UNIQUENESS RULES:
- OPENING (heroSub): lead with a trade-TRUE detail — a specific trigger event, number, season, or the exact phrase this trade's customer searches. Choose the hook that fits the intent (vivid scenario / a stat / a myth-buster / the trigger moment).
- BANNED phrases — never use, anywhere, ESPECIALLY the opener + meta: "Boost your ${vertical}", "tailored Google Maps SEO", "In today's competitive landscape", "In today's digital", "Are you a ${vertical} looking to", "Whether you're a", "Struggling to be found", "take your business to the next level", "stand out from the competition". Any opener that reads the same with the trade word swapped = REWRITE it.
- ~30% of the page must be trade-specific SUBSTANCE (real search phrases, GBP categories, seasonality, licensing, objections) — not generic benefits or synonym-spin.
- CTA must match urgency/ticket: emergency trades → "call now" energy; legal → "free case review"; dental/medical → "book a consultation".
- FAQ must be the EXACT questions THIS trade's buyers ask (drawn from the search phrases + objections) — never "what's your service area" filler.

Return ONLY JSON with EXACTLY these keys:
{
 "metaDescription": "The SEO meta/snippet — 130-160 chars, industry-standard formula: (1) START with the keyword 'Local SEO for ${vertical}' (or close variant 'Google Maps SEO for ${vertical}') so it ranks + Google bolds it; (2) ONE benefit specific to THIS trade's real payoff (plumbers→more emergency calls; dentists→booked new-patient appointments; lawyers→high-value cases; roofers→storm-season jobs; solar→financing-ready leads) — this clause is what makes it UNIQUE per trade; (3) a short CTA ('Get a free growth audit.'). Owner-voice ('your business'), NOT the customer. Do NOT open with a story/scene ('When a homeowner…') — that belongs in heroSub, never the snippet. NEVER 'Boost your'.",
 "heroSub": "the opening HOOK (1-2 sentences) — a trade-TRUE scene / stat / trigger moment. NOT boilerplate.",
 "problem": { "heading": "trade-specific challenge headline (NOT 'The challenge X face on Google Maps')", "paras": ["~70-90 words grounded in how this trade's customers search + what's at stake", "~70-90 words"] },
 "services": [ {"title":"short service name","desc":"2 sentences (~30-45 words), ${vertical}-specific"} ],
 "process": [ {"title":"step name","desc":"2 sentences (~30-45 words)"} ],
 "included": ["deliverable bullet specific to ${vertical}", "..."],
 "whyUs": { "heading":"trade-specific reason done-for-you beats DIY (NOT generic)", "paras":["~70-90 words","~70-90 words"] },
 "ctaHeadline": "final CTA headline (a question) matching this trade's urgency + ticket",
 "faq": [ {"q":"a question THIS trade's buyer actually asks (from search phrases/objections)","a":"1-3 sentences"} ]
}
Counts (STRICT): services EXACTLY 3; process EXACTLY 4; included 5-6; faq EXACTLY 4.
Plain text only (no HTML/markdown). No invented precise stats (use defensible general terms). Before returning, apply the trade-swap test to the heroSub, metaDescription, and every FAQ — rewrite anything that passes for a different trade.`;
  const data = await openai(MODEL, [{ role: 'system', content: sys }, { role: 'user', content: user }], 4096, 0.7);
  const u = data.usage || {};
  lastUsage = { cost: (u.prompt_tokens || 0) / 1e6 * 2.5 + (u.completion_tokens || 0) / 1e6 * 10 };
  return JSON.parse(data.choices[0].message.content);
}

// Deterministic uniqueness gate — reject templated/banned openers before the editor sees them.
const BANNED_RE = /boost your |tailored google maps seo|in today'?s (competitive|digital)|are you (a|an) .{2,30} looking to|whether you'?re (a|an) |struggling to be found|to the next level|stand out from the competition|in the digital age/i;
// Voice-slip gate: RGA is the SEO agency, NOT the trade. Reject drafts that lapse into the
// trade's own customer-facing field-service voice ("our team is ready 24/7", "we're licensed
// & insured", "call us for your … needs", "book your appointment today"). Caught 2026-07-01
// on Plumbers ("our team is ready 24/7 to tackle any plumbing crisis. Fully licensed.").
const VOICE_SLIP_RE = /\b(our (team|technicians|crew|staff|plumbers|electricians|roofers|dentists|attorneys|contractors)\b.{0,40}\b(ready|available|standing by|24\/7|on call|dispatch))|we(?:'re| are) (fully )?(licensed|insured|bonded|certified)|(call|contact|book|schedule) (us|with us|your (free )?(appointment|consultation|estimate|service)) (today|now)\b.{0,30}\b(needs|service|repair|installation)|(our|your) (plumbing|roofing|dental|legal|hvac|electrical|remodeling) (crisis|emergency|needs|services) (is|are) (ready|handled|covered)/i;
function bannedReason(vertical, c) {
  const opener = `${c.metaDescription || ''} || ${c.heroSub || ''} || ${(c.problem && c.problem.paras && c.problem.paras[0]) || ''}`;
  if (BANNED_RE.test(opener)) return 'banned/templated phrasing';
  const meta = (c.metaDescription || '').trim();
  const metaLow = meta.toLowerCase();
  if (metaLow.startsWith('boost your')) return 'meta starts with "Boost your"';
  // The META is the SERP snippet + hub card: enforce the industry-standard keyword formula.
  // No story-scene opener ("When a homeowner…") — that belongs in heroSub, not the snippet.
  if (/^when\s+(a\s+|an\s+|the\s+)?(home\s?owner|customer|client|patient|resident|property\s?owner|you\b)/i.test(meta)) return 'meta opens with a story scene — start with the keyword "Local SEO for <trade>"';
  // Must be keyword-forward: contain the trade name AND a local-SEO/Maps signal near the front.
  if (!metaLow.includes(vertical.toLowerCase())) return 'meta missing the trade keyword';
  if (!/local seo|google maps|local pack|top 3|top three/i.test(metaLow)) return 'meta missing the local-SEO/Maps keyword';
  if (!c.heroSub || c.heroSub.trim().length < 40) return 'heroSub too thin/generic';
  if ((c.faq || []).length < 4) return 'need 4 trade-specific FAQs';
  // Customer-address slip in the META/opener: 2nd-person "your <customer-owned thing>" means the
  // copy is talking to the END CUSTOMER (homeowner/patient), not the business OWNER we're selling to.
  // Owner-directed "your business/practice/firm/customers" is fine; "your kitchen/home/foundation/tooth"
  // is not. Caught 2026-07-01 (foundation-repair, kitchen-remodeling, remodeling-contractors).
  const CUSTOMER_ADDR_RE = /\byour (home|house|kitchen|bathroom|foundation|roof|renovation|remodel|property|tooth|teeth|smile|energy bill|air ?condition|furnace|yard|garden|pool|pipes?|drain)\b/i;
  if (CUSTOMER_ADDR_RE.test(`${c.metaDescription || ''} ${c.heroSub || ''}`)) return 'opener addresses the customer ("your <thing>"), not the business owner';
  // Scan ALL prose (services/process/included/whyUs/faq) for trade-voice slips, not just the opener.
  const allProse = [
    c.metaDescription, c.heroSub, ...(c.problem?.paras || []), ...(c.whyUs?.paras || []),
    ...(c.services || []).map((x) => `${x.title} ${x.desc}`),
    ...(c.process || []).map((x) => `${x.title} ${x.desc}`),
    ...(c.included || []), ...(c.faq || []).map((x) => `${x.q} ${x.a}`),
  ].join(' \n ');
  if (VOICE_SLIP_RE.test(allProse)) return 'trade-voice slip (reads like the trade’s own ad, not RGA)';
  return null;
}

async function scoreDraft(vertical, c) {
  const body = [
    `META: ${c.metaDescription || ''}`,
    `OPENER: ${c.heroSub || ''}`,
    (c.problem?.paras || []).join('\n'),
    (c.services || []).map((x) => `${x.title}: ${x.desc}`).join('\n'),
    (c.process || []).map((x) => `${x.title}: ${x.desc}`).join('\n'),
    (c.included || []).join('\n'),
    (c.whyUs?.paras || []).join('\n'),
    `FAQ: ${(c.faq || []).map((x) => x.q).join(' | ')}`,
  ].join('\n\n');
  try {
    const data = await openai('gpt-4o-mini', [{ role: 'user', content: `Strict editor for a "Local SEO for ${vertical}" landing page. Score 1-10. The #1 criterion is the TRADE-SWAP TEST: would the OPENER, META, and FAQ still make sense if you swapped in a DIFFERENT trade? If yes → it's generic/templated → score ≤5. Reward: trade-specific trigger events, real customer search phrases, this trade's licensing/objections/seasonality, and a meta that is NOT a "Boost your…" template. 7+ = genuinely unique + publishable. JSON only: {"score":int,"verdict":"...","issues":[]}\n\n${body.slice(0, 6000)}` }], 400, 0.2);
    const u = data.usage || {}; lastEditorCost = (u.prompt_tokens || 0) / 1e6 * 0.15 + (u.completion_tokens || 0) / 1e6 * 0.6;
    return JSON.parse(data.choices[0].message.content);
  } catch { return { score: 7, verdict: 'editor unavailable', issues: [] }; }
}

const HEADER = `  <div class="topbar">
    <div class="topbar-inner">
      <div>Google Maps Local SEO For Local Businesses</div>
      <div class="topbar-right">
        <a href="tel:+14242422040" style="white-space:nowrap">Call (424) 242-2040</a>
      </div>
    </div>
  </div>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand" aria-label="Rocket Growth Agency home">
        <img src="/images/assets/rga_icon-header.png?v=20260311a" alt="Rocket Growth Agency logo" />
        <span class="brand-text">Rocket<span class="brand-growth">Growth</span>Agency</span>
      </a>

      <nav class="desktop-nav" aria-label="Main">
        <div id="servicesDropdown" class="services-dropdown">
          <button id="servicesDropdownToggle" class="nav-link dropdown-toggle" aria-expanded="false" aria-controls="servicesDropdownMenu" aria-haspopup="true">
            Services
            <span aria-hidden="true">▾</span>
          </button>
          <div id="servicesDropdownMenu" class="dropdown-menu" role="menu" aria-label="Services menu">
            <a class="nav-link" data-path="/services/" href="/services/" role="menuitem">All Services</a>
            <a class="nav-link" data-path="/services/google-maps-local-seo/" href="/services/google-maps-local-seo/" role="menuitem">Google Maps Local SEO</a>
            <a class="nav-link" data-path="/services/gbp-optimization/" href="/services/gbp-optimization/" role="menuitem">GBP Optimization</a>
            <a class="nav-link" data-path="/services/local-seo-website-support/" href="/services/local-seo-website-support/" role="menuitem">Website Support for Local SEO</a>
          </div>
        </div>
        
        <a class="nav-link" data-path="/industries/" href="/industries/">Industries</a><a class="nav-link" data-path="/process/" href="/process/">Process</a>
        <a class="nav-link" data-path="/pricing/" href="/pricing/">Pricing</a>
        <a class="nav-link" data-path="/faq/" href="/faq/">FAQ</a>
        <a class="nav-link" data-path="/blog/" href="/blog/">Blog</a>
        <a class="nav-link" data-path="/contact/" href="/contact/">Contact</a>
      </nav>

      <a class="btn desktop-cta" href="/free-growth-audit/">Free Growth Audit</a>

      <button id="mobileNavToggle" class="menu-toggle" aria-controls="mobileNav" aria-expanded="false" aria-label="Open menu" onclick="toggleMobileNav()">☰</button>
    </div>

    <nav id="mobileNav" class="mobile-nav" aria-label="Mobile">
      <details>
        <summary>Services</summary>
        <a href="/services/">All Services</a>
        <a href="/services/google-maps-local-seo/">Google Maps Local SEO</a>
        <a href="/services/gbp-optimization/">GBP Optimization</a>
        <a href="/services/local-seo-website-support/">Website Support for Local SEO</a>
      </details>
      <a href="/industries/">Industries</a><a href="/process/">Process</a>
      <a href="/pricing/">Pricing</a>
      <a href="/faq/">FAQ</a>
      <a href="/blog/">Blog</a>
      <a href="/contact/">Contact</a></nav>
  </header>`;
const FOOTER = `    <footer class="footer"><div class="footer-inner"><div><h3>Rocket Growth Agency</h3><p>Google Maps Local SEO for local service businesses focused on calls, forms, and measurable growth.</p></div><div><h4>Pages</h4><div class="footer-links"><a href="/services/">Services</a><a href="/industries/">Industries</a><a href="/pricing/">Pricing</a><a href="/blog/">Blog</a><a href="/contact/">Contact</a></div></div><div><h4>Legal</h4><div class="footer-links"><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Service</a></div></div></div><div class="footer-bottom">&copy; 2026 Rocket Growth Agency. All rights reserved.</div></footer>
  <a class="btn floating-cta" href="/free-growth-audit/#audit-form">Free Growth Audit</a>`;
// Minimal scoped extras — the page otherwise reuses the homepage's own components
// (.section, .section-surface, .section-head, .eyebrow, .grid-3, .card, .btn-ghost).
const STYLE = `  <style>
    /* hero uses the site's real .hero class (blue radial + gradient + dot texture) — no custom override */
    .ind-step{position:relative;}
    .ind-step .ind-num{display:inline-flex;align-items:center;justify-content:center;width:1.9rem;height:1.9rem;border-radius:50%;background:#2f57eb;color:#fff;font-weight:800;font-size:.95rem;margin-bottom:.6rem;}
    .ind-incl{list-style:none;padding:0;margin:0;display:grid;gap:.55rem;}
    .ind-incl li{padding-left:1.6rem;position:relative;line-height:1.55;}
    .ind-incl li::before{content:"✓";position:absolute;left:0;color:#2f57eb;font-weight:800;}
    .ind-faq h3{margin:1.5rem 0 .35rem;font-size:1.12rem;line-height:1.3;}
    .ind-faq h3:first-of-type{margin-top:.4rem;}
    .ind-faq p{margin:0 0 .6rem;line-height:1.7;color:var(--text-700);}
  </style>`;

function render(vertical, slug, c) {
  const url = `https://www.rocketgrowthagency.com/industries/${slug}/`;
  const V = titleCase(vertical);
  const title = `Local SEO for ${V} | Rocket Growth Agency`;
  const h1 = `Local SEO for ${V}`;
  const blogSlug = `local-seo-for-${slugify(vertical)}`;
  const hasBlog = fs.existsSync(path.join(BLOG_DIR, blogSlug, 'index.html'));
  const ogImage = 'https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png';
  const wordCount = [(c.problem?.paras || []).join(' '), (c.services || []).map((x) => x.desc).join(' '), (c.process || []).map((x) => x.desc).join(' '), (c.included || []).join(' '), (c.whyUs?.paras || []).join(' '), (c.faq || []).map((x) => x.a).join(' ')].join(' ').split(/\s+/).filter(Boolean).length;

  const problemHtml = (c.problem?.paras || []).map((p) => `        <p>${esc(p)}</p>`).join('\n');
  const servicesGrid = (c.services || []).slice(0, 3).map((s) => `        <article class="card"><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></article>`).join('\n');
  const processGrid = (c.process || []).slice(0, 4).map((s, i) => `        <article class="card ind-step"><span class="ind-num">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></article>`).join('\n');
  const includedHtml = `        <ul class="ind-incl">\n` + (c.included || []).map((b) => `          <li>${esc(b)}</li>`).join('\n') + `\n        </ul>`;
  const whyUsHtml = (c.whyUs?.paras || []).map((p) => `        <p>${esc(p)}</p>`).join('\n');
  const crossLink = hasBlog ? `      <p style="margin-top:1.2rem"><strong>Prefer the DIY playbook first?</strong> Read our free guide: <a href="/blog/${blogSlug}/">Local SEO for ${esc(vertical)} — how to rank in the Maps top 3</a>.</p>` : '';
  // Related industries (cluster interlinking) — link to up to 3 OTHER live industry pages.
  const relatedHtml = (() => {
    let others = [];
    try { others = fs.readdirSync(IND_DIR).filter((d) => d !== slugify(vertical) && fs.existsSync(path.join(IND_DIR, d, 'index.html'))); } catch { /* none yet */ }
    if (!others.length) return '';
    const pick = others.slice(0, 3);
    const links = pick.map((sl) => {
      let name = titleCase(sl.replace(/-/g, ' '));
      try { const h = fs.readFileSync(path.join(IND_DIR, sl, 'index.html'), 'utf8').match(/<h1>Local SEO for ([^<]+)<\/h1>/); if (h) name = h[1].replace(/&amp;/g, '&'); } catch (_) {}
      return `<a href="/industries/${sl}/">${esc(name)}</a>`;
    }).join(' &middot; ');
    return `      <p style="margin-top:1rem"><strong>Related industries we serve:</strong> ${links} &middot; <a href="/industries/">see all industries</a>.</p>`;
  })();
  const faqHtml = (c.faq || []).map((f) => `        <h3>${esc(f.q)}</h3>\n        <p>${esc(f.a)}</p>`).join('\n');

  const serviceSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Service', name: h1, serviceType: 'Local SEO', description: c.metaDescription, areaServed: 'United States', provider: { '@type': 'Organization', name: 'Rocket Growth Agency', url: 'https://www.rocketgrowthagency.com/' }, url }, null, 2);
  const faqSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (c.faq || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }, null, 2);
  const crumbSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.rocketgrowthagency.com/' }, { '@type': 'ListItem', position: 2, name: 'Industries', item: 'https://www.rocketgrowthagency.com/industries/' }, { '@type': 'ListItem', position: 3, name: vertical, item: url }] }, null, 2);

  return { wordCount, url, metaDescription: c.metaDescription, html: `<!doctype html>
<html lang="en">
<head>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MCGMSCCR');</script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(c.metaDescription)}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="index,follow" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(c.metaDescription)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:site_name" content="Rocket Growth Agency" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(c.metaDescription)}" />
  <meta name="twitter:image" content="${ogImage}" />
  <link rel="icon" type="image/png" href="/images/assets/rga_favicon.png?v=20260311a" />
  <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css?v=20260630a" />
  <script defer src="/script.js"></script>
  <script type="application/ld+json">
${serviceSchema}
  </script>
  <script type="application/ld+json">
${faqSchema}
  </script>
  <script type="application/ld+json">
${crumbSchema}
  </script>
${STYLE}
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MCGMSCCR" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
${HEADER}

  <main class="page-shell" id="main">
    <section class="section hero">
      <div class="section-head">
        <p class="eyebrow">Industries &bull; Done-for-you local SEO</p>
        <h1>${esc(h1)}</h1>
        <p class="lead">${esc(c.heroSub)}</p>
      </div>
      <a class="btn" href="/free-growth-audit/">Get Your Free Growth Audit</a>
    </section>

    <section class="section section-tight">
      <div class="section-head">
        <p class="eyebrow">The Challenge</p>
        <h2>${esc(c.problem?.heading || `Why ${vertical} struggle on Google Maps`)}</h2>
      </div>
${problemHtml}
    </section>

    <section class="section section-surface">
      <div class="section-head">
        <p class="eyebrow">What We Do</p>
        <h2>Our ${esc(h1.replace(/^Local SEO for /, ''))} local SEO service</h2>
        <p class="lead">Done-for-you Google Maps, profile, and website work — built around how your customers actually search.</p>
      </div>
      <div class="grid-3">
${servicesGrid}
      </div>
    </section>

    <section class="section section-tight">
      <div class="section-head">
        <p class="eyebrow">How It Works</p>
        <h2>A clear, managed process</h2>
      </div>
      <div class="grid-3">
${processGrid}
      </div>
    </section>

    <section class="section section-surface">
      <div class="section-head">
        <p class="eyebrow">Why Done-For-You</p>
        <h2>${esc(c.whyUs?.heading || 'Why owners choose a partner over DIY')}</h2>
      </div>
      <div class="grid-2">
        <article class="card"><h3>What's included</h3>
${includedHtml}
        </article>
        <article class="card"><h3>Why it works</h3>
${whyUsHtml}
        </article>
      </div>
${crossLink}
${relatedHtml}
    </section>

    <section class="section section-tight ind-faq">
      <div class="section-head"><p class="eyebrow">FAQ</p><h2>Frequently asked questions</h2></div>
${faqHtml}
      <p style="margin-top:1.4rem"><strong>Next step:</strong> <a href="/services/google-maps-local-seo/">how our Google Maps Local SEO works</a> &middot; <a href="/pricing/">pricing</a> &middot; <a href="/free-growth-audit/">free Growth Audit</a>.</p>
    </section>
  </main>

  <section class="cta-band"><div class="cta-band-inner"><h2>${esc(c.ctaHeadline)}</h2><a class="btn-light" href="/free-growth-audit/">Get Your Free Growth Audit</a></div></section>
${FOOTER}
</body>
</html>
` };
}

function assertQuality(html, meta) {
  const errs = [];
  if (meta.wordCount < 330) errs.push(`thin: ${meta.wordCount} words`);
  if (!html.includes('"Service"')) errs.push('missing Service schema');
  if (!html.includes('FAQPage')) errs.push('missing FAQ schema');
  if (!html.includes('class="grid-3"')) errs.push('missing service/process card grids');
  if ((html.match(/class="card"/g) || []).length < 3) errs.push('missing service cards');
  if (!html.includes('/free-growth-audit/')) errs.push('missing CTA');
  if (!html.includes('/services/google-maps-local-seo/')) errs.push('missing service link');
  if (errs.length) throw new Error('GUARD: ' + errs.join('; '));
}

function addToSitemap(url) {
  let xml = fs.readFileSync(SITEMAP, 'utf8');
  if (xml.includes(`<loc>${url}</loc>`)) return false;
  xml = xml.replace(/<\/urlset>\s*$/, `  <url>\n    <loc>${url}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>\n`);
  fs.writeFileSync(SITEMAP, xml); return true;
}

async function loadQueueVerticals() {
  if (!AIRTABLE_API_KEY) return [];
  const seen = {}; let offset = null;
  while (true) {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent('Search Queue')}`);
    u.searchParams.set('pageSize', '100'); ['Vertical', 'Avg Ticket'].forEach((f) => u.searchParams.append('fields[]', f));
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) break;
    const d = await res.json();
    for (const r of d.records || []) { const v = r.fields.Vertical; if (!v) continue; const t = Number(r.fields['Avg Ticket'] || 0); if (!seen[v] || t > seen[v].t) seen[v] = { v, t }; }
    offset = d.offset; if (!offset) break;
  }
  return Object.values(seen).filter((x) => APPROVED_INDUSTRIES.has(x.v)).filter((x) => !fs.existsSync(path.join(IND_DIR, slugify(x.v)))).sort((a, b) => b.t - a.t).map((x) => x.v);
}

// ---- pillar hub: rebuild industries/index.html from all industry pages ----
function buildHub() {
  const cards = [];
  for (const d of fs.readdirSync(IND_DIR)) {
    const f = path.join(IND_DIR, d, 'index.html');
    if (d === 'index.html' || !fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    const h1 = (html.match(/<h1>([^<]+)<\/h1>/) || [])[1] || d;
    const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    cards.push({ slug: d, h1, desc });
  }
  cards.sort((a, b) => a.h1.localeCompare(b.h1));
  const grid = cards.map((c) => {
    const name = c.h1.replace(/^Local SEO for\s+/i, '');
    return `        <a class="ind-cat-card" href="/industries/${c.slug}/"><span class="ind-cat-name">${esc(name)}</span><span class="ind-cat-desc">${esc(unesc(c.desc).slice(0, 88))}…</span><span class="ind-cat-cta">View service &rarr;</span></a>`;
  }).join('\n');
  const url = 'https://www.rocketgrowthagency.com/industries/';
  const page = `<!doctype html>
<html lang="en">
<head>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MCGMSCCR');</script>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Industries We Serve — Local SEO by Industry | Rocket Growth Agency</title>
  <meta name="description" content="Done-for-you Google Maps local SEO, tailored by industry. See how Rocket Growth Agency helps your business type rank in the Maps top 3 and turn local search into booked calls." />
  <link rel="canonical" href="${url}" /><meta name="robots" content="index,follow" />
  <meta property="og:title" content="Industries We Serve | Rocket Growth Agency" /><meta property="og:description" content="Done-for-you Google Maps local SEO, tailored by industry." /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png" />
  <link rel="icon" type="image/png" href="/images/assets/rga_favicon.png?v=20260311a" />
  <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css?v=20260630a" /><script defer src="/script.js"></script>
  <style>
    /* hub hero uses the site's real .hero class — no custom override */
    .ind-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-top:1.5rem;}
    .ind-cat-card{display:flex;flex-direction:column;gap:.45rem;padding:1.5rem 1.6rem;border:1px solid var(--line);border-radius:14px;background:#fff;text-decoration:none;color:inherit;transition:.15s ease;}
    .ind-cat-card:hover{border-color:#2f57eb;box-shadow:0 10px 26px rgba(47,87,235,.12);transform:translateY(-2px);}
    .ind-cat-name{font-size:1.32rem;font-weight:800;color:#0f172a;line-height:1.18;}
    .ind-cat-desc{font-size:.93rem;color:var(--text-700);line-height:1.5;}
    .ind-cat-cta{font-weight:700;color:#2f57eb;margin-top:.35rem;font-size:.95rem;}
  </style>
</head>
<body>
${HEADER}
  <main class="page-shell" id="main">
    <section class="section hero">
      <div class="section-head">
        <p class="eyebrow">Industries</p>
        <h1>Local SEO, tailored to your industry</h1>
        <p class="lead">We do done-for-you Google Maps local SEO for local service businesses. Find your industry to see exactly how we get you ranking in the top 3 — and the free Growth Audit that shows where you stand today.</p>
      </div>
    </section>
    <section class="section section-tight">
      <div class="ind-cat-grid">
${grid}
      </div>
    </section>
  </main>
  <section class="cta-band"><div class="cta-band-inner"><h2>Not sure where your business ranks? Find out free.</h2><a class="btn-light" href="/free-growth-audit/">Get Your Free Growth Audit</a></div></section>
${FOOTER}
</body>
</html>
`;
  fs.writeFileSync(path.join(IND_DIR, 'index.html'), page);
  addToSitemap(url);
  console.log(`[industry-engine] rebuilt hub: industries/ (${cards.length} industries)`);
}

// ---- main ----
fs.mkdirSync(IND_DIR, { recursive: true });
const workList = FROM_QUEUE ? await loadQueueVerticals() : VERTICAL_ARGS;
const spend = readSpend();
const target = COUNT != null ? COUNT : (FROM_QUEUE ? MAX_PER_DAY : workList.length);
const dayRemaining = FROM_QUEUE ? Math.max(0, MAX_PER_DAY - spend.posts) : Infinity;
console.log(`[industry-engine] ${workList.length} candidates; target ${target}; spent today $${spend.cost.toFixed(4)}/$${DAILY_COST_CEILING}`);
let made = 0;
for (const vertical of workList) {
  if (made >= target) break;
  if (FROM_QUEUE && made >= dayRemaining) { console.log('[industry-engine] daily cap reached.'); break; }
  if (spend.cost >= DAILY_COST_CEILING) { console.log('[industry-engine] cost ceiling reached.'); break; }
  const slug = slugify(vertical);
  const file = path.join(IND_DIR, slug, 'index.html');
  if (fs.existsSync(file) && !FORCE) { console.log(`SKIP ${vertical} — exists.`); continue; }
  process.stdout.write(`Generating industry page "${vertical}"... `);
  try {
    // Ban gate + assertQuality = HARD floor (guarantees non-templated, structurally valid).
    // Editor score = SOFT ranking. We keep the best ban-clean attempt and ship it even if it
    // never clears EDITOR_MIN — so we NEVER leave a stale "Boost your" file on disk. Only a
    // total ban-gate/structure failure (no shippable attempt at all) throws.
    let rendered = null, runCost = 0, lastErr = null, verdict = null, best = null;
    for (let a = 1; a <= 4; a++) {
      const content = await generateContent(vertical); runCost += lastUsage.cost;
      const br = bannedReason(vertical, content); if (br) { lastErr = new Error(br); process.stdout.write(`[retry ${a}: ${br}] `); continue; }
      const r = render(vertical, slug, content);
      try { assertQuality(r.html, r); } catch (qe) { lastErr = qe; process.stdout.write(`[retry ${a}: ${qe.message}] `); continue; }
      const v = await scoreDraft(vertical, content); runCost += lastEditorCost;
      if (!best || v.score > best.verdict.score) best = { r, verdict: v };   // remember best ban-clean draft
      if (v.score < EDITOR_MIN) { lastErr = new Error(`editor ${v.score}`); process.stdout.write(`[retry ${a}: editor ${v.score}] `); continue; }
      rendered = r; verdict = v; break;
    }
    if (!rendered && best) { rendered = best.r; verdict = best.verdict; process.stdout.write(`[shipping best ban-clean draft: editor ${verdict.score}] `); }
    if (!rendered) throw lastErr || new Error('failed after 4 attempts');
    fs.mkdirSync(path.join(IND_DIR, slug), { recursive: true });
    fs.writeFileSync(file, rendered.html);
    spend.cost += runCost; spend.posts += 1; writeSpend(spend); made++;
    console.log(`OK — ${rendered.wordCount} words, editor ${verdict.score}/10 → industries/${slug}/  [$${runCost.toFixed(4)}]`);
    if (PUBLISH) console.log(`   sitemap ${addToSitemap(rendered.url) ? 'added' : 'present'}`);
    else console.log('   DRAFT (add --publish)');
  } catch (e) { console.log(`FAILED: ${e.message}`); }
}
if (PUBLISH || made > 0) buildHub();
console.log(`[industry-engine] done — ${made} page(s); today ${spend.posts}, $${spend.cost.toFixed(4)}.`);
