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
if (!VERTICAL_ARGS.length && !FROM_QUEUE && !ARGS.includes('--rebuild-hub')) { console.error('Usage: generate-industry-page.mjs "<Vertical>" [...] | --from-queue [--count=N] [--publish] [--force] | --rebuild-hub'); process.exit(1); }

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
if (!OPENAI_API_KEY && !ARGS.includes('--rebuild-hub')) { console.error('No OPENAI_API_KEY'); process.exit(1); }
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

const HEADER = `  <a class="promo-bar" href="/pricing/#offer">
    <strong>Only 3 client spots left.</strong>&nbsp;<strong>Everything 50% off</strong> &mdash; setup, monthly &amp; website builds. Spots limited. <span class="promo-cta">See pricing &rarr;</span>
  </a>

  <div class="topbar">
    <div class="topbar-inner">
      <div>Google Maps Local SEO For Local Businesses</div>
      <div class="topbar-right">
        <a href="tel:+14242422040" class="tb-contact" style="white-space:nowrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span class="tb-label">Call (424) 242-2040</span></a><a href="sms:+14242422040" class="tb-contact" style="white-space:nowrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="tb-label">Text</span></a>
      </div>
    </div>
  </div>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand" aria-label="Rocket Growth Agency home">
        <img src="/images/assets/rga_icon-header.png?v=20260706b" alt="Rocket Growth Agency logo" />
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

      <a href="/contact/">Contact</a></nav>
  </header>`;
const FOOTER = `    <footer class="footer">
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="footer-logo" aria-label="Rocket Growth Agency home"><img src="/images/assets/rga_icon-header.png?v=20260706b" alt="Rocket Growth Agency" /><span class="footer-word">Rocket<span class="fg">Growth</span>Agency</span></a>
        <p class="footer-tag">Google Maps Local SEO for local service businesses &mdash; focused on calls, forms, and measurable growth.</p>
        <p class="footer-address" style="color:#8fa0c0;font-size:.85rem;margin:.6rem 0 0;line-height:1.5">9937 Jefferson Blvd, Suite 120, Culver City, CA 90232</p>
        <div class="footer-contact">
          <a href="tel:+14242422040"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call (424) 242-2040</a>
          <a href="sms:+14242422040"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Text us</a>
          <a href="mailto:hello@rocketgrowthagency.com"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>hello@rocketgrowthagency.com</a>
        </div>
      </div>
      <nav class="footer-col"><h4>Services</h4><a href="/services/google-maps-local-seo/">Google Maps SEO</a><a href="/services/gbp-optimization/">GBP Optimization</a><a href="/services/local-seo-website-support/">Website Support</a><a href="/services/">All Services</a></nav>
      <nav class="footer-col"><h4>Explore</h4><a href="/process/">Process</a><a href="/industries/">Industries</a><a href="/pricing/">Pricing</a><a href="/faq/">FAQ</a><a href="/blog/">Blog</a></nav>
      <nav class="footer-col"><h4>Company</h4><a href="/free-growth-audit/">Free Growth Audit</a><a href="/contact/">Contact</a><a href="/start-growth-plan/">Start Growth Plan</a></nav>
    </div>
    <div class="footer-bottom"><div class="footer-bottom-inner"><span>&copy; 2026 Rocket Growth Agency. All rights reserved.</span><span class="footer-legal"><a href="/privacy/">Privacy Policy</a> &middot; <a href="/terms/">Terms of Service</a></span></div></div>
  </footer>
  <a class="btn floating-cta" href="/free-growth-audit/#audit-form">Free Growth Audit</a>`;
// Minimal scoped extras — the page otherwise reuses the homepage's own components
// (.section, .section-surface, .section-head, .eyebrow, .grid-3, .card, .btn-ghost).
const STYLE = `  <style id="promo-bar-style">
    .promo-bar{display:block;background:#2457e6;color:#fff;text-align:center;text-decoration:none;font-size:.92rem;font-weight:600;padding:.62rem 1rem;line-height:1.4}
    .promo-bar strong{font-weight:800}
    .promo-bar .promo-cta{text-decoration:underline;white-space:nowrap;margin-left:.35rem}
    .promo-bar:hover{background:#1c46c4}
    @media(max-width:640px){.promo-bar{font-size:.8rem;padding:.55rem .8rem}}
  </style>
  <style id="ix-redesign">
    /* INDUSTRY PAGE REDESIGN (.ix-*) — locked 2026-07-06. RGA blue only, all SVG, no stock images. */
    .ix-hero{position:relative;overflow:hidden;background:linear-gradient(180deg,#eef3ff 0%,#f7f9ff 60%,#fff 100%);border-bottom:1px solid #eef1f7}
    .ix-hero::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(36,87,230,.10) 1.2px,transparent 1.2px);background-size:26px 26px;opacity:.5;pointer-events:none}
    .ix-hero-in{position:relative;max-width:1160px;margin:0 auto;padding:3.4rem 1.75rem 3.6rem;display:grid;grid-template-columns:1.05fr .95fr;gap:3rem;align-items:center}
    .ix-eyebrow{font-size:.8rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2457e6;margin:0 0 1rem}
    .ix-h1{font-size:3rem;font-weight:900;letter-spacing:-.025em;line-height:1.05;color:#0f1b3d;margin:0 0 1.1rem}
    .ix-sub{font-size:1.12rem;line-height:1.6;color:#41506b;margin:0 0 1.6rem;max-width:36ch}
    .ix-cta-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
    .ix-btn{display:inline-flex;align-items:center;gap:.5rem;background:#2457e6;color:#fff;font-weight:800;font-size:1rem;padding:.9rem 1.5rem;border-radius:999px;text-decoration:none;box-shadow:0 14px 30px -12px rgba(36,87,230,.6);transition:transform .15s,box-shadow .15s}
    .ix-btn:hover{transform:translateY(-2px);box-shadow:0 20px 38px -12px rgba(36,87,230,.7);color:#fff}
    .ix-btn svg{width:17px;height:17px}
    .ix-trust{display:flex;align-items:center;gap:.5rem;font-size:.9rem;font-weight:600;color:#5a6a86}
    .ix-trust svg{width:16px;height:16px;color:#16a34a}
    .mappack{background:#fff;border:1px solid #e3e9f4;border-radius:20px;box-shadow:0 40px 80px -40px rgba(20,40,90,.5);overflow:hidden;transform:rotate(.5deg)}
    .mp-bar{display:flex;align-items:center;gap:.6rem;padding:.85rem 1.1rem;border-bottom:1px solid #eef1f7;background:#f8faff}
    .mp-search{flex:1;display:flex;align-items:center;gap:.5rem;background:#fff;border:1px solid #e3e9f4;border-radius:999px;padding:.5rem .85rem;font-size:.86rem;color:#334155;font-weight:600}
    .mp-search svg{width:15px;height:15px;color:#2457e6}
    .mp-dot{width:10px;height:10px;border-radius:50%}
    .mp-list{padding:.5rem}
    .mp-row{display:flex;align-items:center;gap:.85rem;padding:.85rem .9rem;border-radius:12px}
    .mp-row+.mp-row{margin-top:.25rem}
    .mp-top{background:linear-gradient(120deg,#eef4ff,#f4f8ff);border:1px solid #d3e0ff}
    .mp-pin{width:34px;height:34px;border-radius:10px;background:#2457e6;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
    .mp-pin.ghost{background:#e7ecf5}
    .mp-pin svg{width:18px;height:18px;color:#fff}
    .mp-pin.ghost svg{color:#9aa8be}
    .mp-info{flex:1;min-width:0}
    .mp-name{font-weight:800;color:#0f1b3d;font-size:.98rem;line-height:1.2}
    .mp-name.mut{color:#93a1b5;font-weight:700}
    .mp-stars{display:flex;align-items:center;gap:.35rem;margin-top:.2rem;font-size:.78rem;color:#64748b;font-weight:600}
    .mp-stars .st{display:inline-flex;gap:1px}
    .mp-stars .st svg{width:12px;height:12px;color:#2457e6}
    .mp-badge{background:#16a34a;color:#fff;font-weight:800;font-size:.68rem;letter-spacing:.03em;text-transform:uppercase;padding:.3rem .6rem;border-radius:999px;flex:0 0 auto}
    .mp-line{height:9px;border-radius:6px;background:#eef1f7;width:60%}
    .mp-line.s{width:42%;margin-top:.35rem}
    .mp-wrap{position:relative}
    .mp-float{position:absolute;right:-6px;bottom:-14px;background:#0f1b3d;color:#fff;font-weight:700;font-size:.8rem;padding:.6rem .9rem;border-radius:12px;box-shadow:0 18px 34px -14px rgba(15,27,61,.8);display:flex;align-items:center;gap:.5rem}
    .mp-float svg{width:15px;height:15px;color:#5b86ff}
    .ix-sec{max-width:1160px;margin:0 auto;padding:4rem 1.75rem}
    .ix-band{background:#f7f9fc;border-top:1px solid #eef1f7;border-bottom:1px solid #eef1f7}
    .ix-head{max-width:720px;margin:0 auto 2.4rem;text-align:center}
    .ix-kick{font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2457e6;margin:0 0 .6rem}
    .ix-h2{font-size:2rem;font-weight:900;letter-spacing:-.02em;color:#0f1b3d;margin:0 0 .7rem;line-height:1.15}
    .ix-lead{font-size:1.05rem;line-height:1.6;color:#51607b;margin:0}
    .ix-chal{display:grid;grid-template-columns:1.1fr .9fr;gap:2.5rem;align-items:center;max-width:1160px;margin:0 auto;padding:4rem 1.75rem}
    .ix-chal p{font-size:1.02rem;line-height:1.75;color:#41506b;margin:0 0 1rem}
    .ix-pains{display:grid;gap:.9rem}
    .ix-pain{display:flex;gap:.85rem;align-items:flex-start;background:#fff;border:1px solid #e8ecf3;border-radius:14px;padding:1rem 1.15rem}
    .ix-pain svg{width:20px;height:20px;color:#2457e6;flex:0 0 auto;margin-top:.1rem}
    .ix-pain b{color:#0f1b3d;display:block;font-size:.98rem;margin-bottom:.15rem}
    .ix-pain span{color:#64748b;font-size:.9rem;line-height:1.5}
    .ix-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:1.4rem}
    .ix-card{background:#fff;border:1px solid #e8ecf3;border-radius:18px;padding:1.7rem 1.6rem;transition:transform .15s,box-shadow .15s,border-color .15s}
    .ix-card:hover{transform:translateY(-5px);box-shadow:0 26px 52px -32px rgba(20,40,90,.5);border-color:#cddcff}
    .ix-ico{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#2457e6,#4f7bff);display:flex;align-items:center;justify-content:center;margin-bottom:1.1rem;box-shadow:0 12px 24px -12px rgba(36,87,230,.7)}
    .ix-ico svg{width:25px;height:25px;color:#fff}
    .ix-card h3{font-size:1.15rem;color:#0f1b3d;margin:0 0 .5rem}
    .ix-card p{font-size:.94rem;line-height:1.6;color:#51607b;margin:0}
    .ix-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:1.2rem;position:relative}
    .ix-steps::before{content:"";position:absolute;top:26px;left:11%;right:11%;height:2px;background:repeating-linear-gradient(90deg,#c3d3f7 0 8px,transparent 8px 16px)}
    .ix-step{position:relative;text-align:center}
    .ix-num{width:54px;height:54px;border-radius:16px;background:#fff;border:2px solid #2457e6;color:#2457e6;font-weight:900;font-size:1.25rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;position:relative;z-index:1;box-shadow:0 10px 22px -12px rgba(36,87,230,.5)}
    .ix-step h3{font-size:1.05rem;color:#0f1b3d;margin:0 0 .45rem}
    .ix-step p{font-size:.9rem;line-height:1.55;color:#5a6a86;margin:0}
    .ix-two{display:grid;grid-template-columns:1fr 1fr;gap:1.6rem;align-items:stretch}
    .ix-incl{background:linear-gradient(160deg,#eef4ff,#f6f9ff);border:1px solid #d3e0ff;border-radius:20px;padding:2rem 1.9rem}
    .ix-incl h3{font-size:1.2rem;margin:0 0 1.2rem;color:#0f1b3d}
    .ix-incl ul{list-style:none;margin:0;padding:0;display:grid;gap:.85rem}
    .ix-incl li{display:flex;gap:.7rem;align-items:flex-start;font-size:.97rem;line-height:1.45;color:#41506b}
    .ix-incl li svg{width:20px;height:20px;color:#2457e6;flex:0 0 auto;margin-top:.05rem}
    .ix-why{background:#fff;border:1px solid #e8ecf3;border-radius:20px;padding:2rem 1.9rem}
    .ix-why h3{font-size:1.2rem;color:#0f1b3d;margin:0 0 .8rem}
    .ix-why p{font-size:.97rem;line-height:1.7;color:#51607b;margin:0 0 1rem}
    .ix-reassure{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-top:1.6rem}
    .ix-reassure .r{display:flex;align-items:center;gap:.75rem;background:#fff;border:1px solid #e8ecf3;border-radius:14px;padding:1rem 1.15rem}
    .ix-reassure .r svg{width:22px;height:22px;color:#2457e6;flex:0 0 auto}
    .ix-reassure .r b{font-size:.92rem;color:#0f1b3d;font-weight:700;line-height:1.3}
    .ix-links{max-width:1160px;margin:2rem auto 0;padding:0 1.75rem}
    .ix-links p{font-size:.97rem;line-height:1.7;color:#51607b;margin:.4rem 0}
    .ix-faq{max-width:820px;margin:0 auto;display:grid;gap:.8rem}
    .ix-q{background:#fff;border:1px solid #e8ecf3;border-radius:14px;overflow:hidden}
    .ix-q summary{list-style:none;cursor:pointer;padding:1.15rem 1.4rem;font-weight:800;color:#0f1b3d;font-size:1.02rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}
    .ix-q summary::-webkit-details-marker{display:none}
    .ix-q .chev{width:20px;height:20px;color:#2457e6;flex:0 0 auto;transition:transform .2s}
    .ix-q[open] .chev{transform:rotate(180deg)}
    .ix-q .ix-a{padding:0 1.4rem 1.25rem;color:#51607b;line-height:1.7;font-size:.97rem}
    @media(max-width:900px){
      .ix-reassure{grid-template-columns:1fr 1fr}
      .ix-hero-in{grid-template-columns:1fr;gap:2.2rem}
      .ix-h1{font-size:2.3rem}.ix-sub{max-width:none}
      .ix-chal{grid-template-columns:1fr;gap:1.6rem}
      .ix-grid3{grid-template-columns:1fr}
      .ix-steps{grid-template-columns:1fr 1fr}.ix-steps::before{display:none}
      .ix-two{grid-template-columns:1fr}
    }
    @media(max-width:560px){.ix-steps{grid-template-columns:1fr}.ix-reassure{grid-template-columns:1fr}}
  </style>`;

// ---- .ix-* redesign helpers (must match Website /industries/*/index.html — see [[project-industry-pages-locked]]) ----
const IXSVG = {
 pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
 star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
 starf:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
 check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
 trend:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/></svg>',
 target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
 chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="4" width="3" height="14"/></svg>',
 building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>',
 globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>',
 file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
 phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
 shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
 eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
 chev:'<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
 arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
};
function iconFor(text) {
  const t = (text || '').toLowerCase();
  const pairs = [
    [['review','reputation','rating','testimonial','trust'],'star'],
    [['map','visibility','rank','pack','top 3','top-3','local search','local pack'],'pin'],
    [['keyword','search','term','query','intent'],'search'],
    [['profile','gbp','google business','listing','citation'],'building'],
    [['website','site','web','pages','landing','structure','schema'],'globe'],
    [['content','blog','article','post','copy'],'file'],
    [['call','lead','conversion','convert','phone','booking','appointment','enquir','inquir','contact'],'phone'],
    [['analy','audit','research','competitor','market','report','track','monitor','data','result'],'chart'],
  ];
  for (const [keys, ic] of pairs) if (keys.some((k) => t.includes(k))) return ic;
  return 'target';
}
const IX_PAINS = [
  ['eye','Invisible in the map pack','You&rsquo;re below the top 3, so customers never scroll down to find you.'],
  ['star','Reviews aren&rsquo;t working for you','Too few or too old &mdash; and the click goes to a competitor instead.'],
  ['target','Ranking for the wrong terms','You&rsquo;re missing the high-intent searches that turn into calls.'],
];
const IX_REASSURE = [
  ['shield','No long-term contracts'],
  ['check','You own everything we build'],
  ['target','Done-for-you, start to finish'],
  ['chart','Transparent monthly reporting'],
];

function render(vertical, slug, c) {
  const url = `https://www.rocketgrowthagency.com/industries/${slug}/`;
  const V = titleCase(vertical);
  const title = `Local SEO for ${V} | Rocket Growth Agency`;
  const h1 = `Local SEO for ${V}`;
  const blogSlug = `local-seo-for-${slugify(vertical)}`;
  const hasBlog = fs.existsSync(path.join(BLOG_DIR, blogSlug, 'index.html'));
  const ogImage = 'https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png';
  const wordCount = [(c.problem?.paras || []).join(' '), (c.services || []).map((x) => x.desc).join(' '), (c.process || []).map((x) => x.desc).join(' '), (c.included || []).join(' '), (c.whyUs?.paras || []).join(' '), (c.faq || []).map((x) => x.a).join(' ')].join(' ').split(/\s+/).filter(Boolean).length;

  const searchTerm = `${vertical.toLowerCase()} near me`;
  const problemHtml = (c.problem?.paras || []).map((p) => `      <p>${esc(p)}</p>`).join('\n');
  const painsHtml = IX_PAINS.map(([i, t, s]) => `      <div class="ix-pain">${IXSVG[i]}<div><b>${t}</b><span>${s}</span></div></div>`).join('\n');
  const servicesGrid = (c.services || []).slice(0, 3).map((s) => `    <article class="ix-card"><div class="ix-ico">${IXSVG[iconFor(`${s.title} ${s.desc}`)]}</div><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></article>`).join('\n');
  const processGrid = (c.process || []).slice(0, 4).map((s, i) => `    <div class="ix-step"><div class="ix-num">${i + 1}</div><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></div>`).join('\n');
  const includedHtml = (c.included || []).map((b) => `          <li>${IXSVG.check} ${esc(b)}</li>`).join('\n');
  const whyUsHtml = (c.whyUs?.paras || []).map((p) => `        <p>${esc(p)}</p>`).join('\n');
  const reassureHtml = IX_REASSURE.map(([i, t]) => `      <div class="r">${IXSVG[i]}<b>${t}</b></div>`).join('\n');
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
  const faqHtml = (c.faq || []).map((f, i) => `    <details class="ix-q"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}${IXSVG.chev}</summary><div class="ix-a">${esc(f.a)}</div></details>`).join('\n');

  const serviceSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Service', name: h1, serviceType: 'Local SEO', description: c.metaDescription, areaServed: 'United States', provider: { '@type': 'Organization', name: 'Rocket Growth Agency', url: 'https://www.rocketgrowthagency.com/' }, url }, null, 2);
  const faqSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (c.faq || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }, null, 2);
  const crumbSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.rocketgrowthagency.com/' }, { '@type': 'ListItem', position: 2, name: 'Industries', item: 'https://www.rocketgrowthagency.com/industries/' }, { '@type': 'ListItem', position: 3, name: vertical, item: url }] }, null, 2);

  return { wordCount, url, metaDescription: c.metaDescription, html: `<!doctype html>
<html lang="en">
<head>
  <script>try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(e){}
  window.addEventListener('pageshow',function(){if(!location.hash)window.scrollTo(0,0);});</script>
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
  <link rel="icon" href="/favicon.svg?v=20260706b" type="image/svg+xml" />
  <link rel="icon" type="image/png" href="/images/assets/rga_favicon.png?v=20260706b" />
  <link rel="apple-touch-icon" href="/images/assets/apple-touch-icon.png?v=20260706b" />
  <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css?v=20260706f" />
  <script defer src="/script.js?v=20260706e"></script>
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

  <main id="main">
    <section class="ix-hero">
      <div class="ix-hero-in">
        <div>
          <p class="ix-eyebrow">Industries &bull; Done-for-you local SEO</p>
          <h1 class="ix-h1">${esc(h1)}</h1>
          <p class="ix-sub">${esc(c.heroSub)}</p>
          <div class="ix-cta-row">
            <a class="ix-btn" href="/free-growth-audit/">Get Your Free Growth Audit ${IXSVG.arrow}</a>
            <span class="ix-trust">${IXSVG.check} No contracts &bull; Results you can measure</span>
          </div>
        </div>
        <div class="mp-wrap">
          <div class="mappack">
            <div class="mp-bar">
              <span class="mp-dot" style="background:#ef6a5a"></span><span class="mp-dot" style="background:#f4c04e"></span><span class="mp-dot" style="background:#4caf7d"></span>
              <span class="mp-search">${IXSVG.search} ${esc(searchTerm)}</span>
            </div>
            <div class="mp-list">
              <div class="mp-row mp-top">
                <span class="mp-pin">${IXSVG.pin}</span>
                <div class="mp-info"><div class="mp-name">Your Business</div><div class="mp-stars"><span class="st">${IXSVG.starf.repeat(5)}</span> 5.0 (128 reviews)</div></div>
                <span class="mp-badge">Top 3</span>
              </div>
              <div class="mp-row">
                <span class="mp-pin ghost">${IXSVG.pin}</span>
                <div class="mp-info"><div class="mp-name mut">A Competitor</div><div class="mp-line"></div></div>
              </div>
              <div class="mp-row">
                <span class="mp-pin ghost">${IXSVG.pin}</span>
                <div class="mp-info"><div class="mp-name mut">Another Local Co.</div><div class="mp-line s"></div></div>
              </div>
            </div>
          </div>
          <span class="mp-float">${IXSVG.trend} Ranked #1 in your area</span>
        </div>
      </div>
    </section>

    <div class="ix-chal">
      <div>
        <p class="ix-kick">The Challenge</p>
        <h2 class="ix-h2" style="text-align:left">${esc(c.problem?.heading || `Why ${vertical} struggle on Google Maps`)}</h2>
${problemHtml}
      </div>
      <div class="ix-pains">
${painsHtml}
      </div>
    </div>

    <div class="ix-band"><div class="ix-sec">
      <div class="ix-head">
        <p class="ix-kick">What We Do</p>
        <h2 class="ix-h2">Our ${esc(h1.replace(/^Local SEO for /, ''))} local SEO service</h2>
        <p class="ix-lead">Done-for-you Google Maps, profile, and website work — built around how your customers actually search.</p>
      </div>
      <div class="ix-grid3">
${servicesGrid}
      </div>
    </div></div>

    <div class="ix-sec">
      <div class="ix-head"><p class="ix-kick">How It Works</p><h2 class="ix-h2">A clear, managed process</h2></div>
      <div class="ix-steps">
${processGrid}
      </div>
    </div>

    <div class="ix-band"><div class="ix-sec">
      <div class="ix-head"><p class="ix-kick">Why Done-For-You</p><h2 class="ix-h2">${esc(c.whyUs?.heading || 'Why owners choose a partner over DIY')}</h2></div>
      <div class="ix-two">
        <div class="ix-incl">
          <h3>What&rsquo;s included</h3>
          <ul>
${includedHtml}
          </ul>
        </div>
        <div class="ix-why">
          <h3>Why it works</h3>
${whyUsHtml}
        </div>
      </div>
      <div class="ix-reassure">
${reassureHtml}
      </div>
    </div></div>

    <div class="ix-sec">
      <div class="ix-head"><p class="ix-kick">FAQ</p><h2 class="ix-h2">Frequently asked questions</h2></div>
      <div class="ix-faq">
${faqHtml}
      </div>
    </div>
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

// Industry → hub-card icon (keyword-matched; generic briefcase fallback). All SVG, RGA blue.
function industryIcon(slug, name) {
  const s = `${slug} ${name || ''}`.toLowerCase();
  const P = {
    scale: '<path d="M12 3v18M8 21h8M4.5 8h15M6.5 8 4 14a2.5 2.5 0 0 0 5 0zM17.5 8 15 14a2.5 2.5 0 0 0 5 0z"/>',
    tooth: '<path d="M12 5.5c-2-1.6-4.6-1.6-6.2 0-2.1 2.1-1.6 5.7-.5 9.3.5 1.7.8 4.7 2.2 4.7 1.3 0 1.3-3.2 2.5-3.2s1.2 3.2 2.5 3.2c1.4 0 1.7-3 2.2-4.7 1.1-3.6 1.6-7.2-.5-9.3-1.6-1.6-4.2-1.6-6.2 0z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/>',
    hammer: '<path d="m15 12-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9M18 15l4-4M21.5 11.5l-1.8-1.8a2.4 2.4 0 0 1-.7-1.7V7L15.5 3.4A5.6 5.6 0 0 0 11.6 2H9l.9.8A6 6 0 0 1 12 7.4V9l2 2h1.6c.8 0 1.6.3 2.2.9l1.7 1.7"/>',
    bug: '<path d="M8 2l1.5 1.5M16 2l-1.5 1.5M9 7h6a4 4 0 0 1 4 4v3a7 7 0 1 1-14 0v-3a4 4 0 0 1 4-4zM3 9l3 1M21 9l-3 1M3 15h3M18 15h3M4 20l3-2M20 20l-3-2M12 8v13"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    thermo: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    brief: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'
  };
  let k = 'brief';
  if (/lawyer|attorney|legal/.test(s)) k = 'scale';
  else if (/dentist|orthodont|dental/.test(s)) k = 'tooth';
  else if (/plumb/.test(s)) k = 'wrench';
  else if (/pest|exterminat|rodent/.test(s)) k = 'bug';
  else if (/solar/.test(s)) k = 'sun';
  else if (/hvac|heating|air condition/.test(s)) k = 'thermo';
  else if (/plastic surgeon|surgery|surgeon/.test(s)) k = 'heart';
  else if (/real estate|realtor/.test(s)) k = 'key';
  else if (/roof/.test(s)) k = 'home';
  else if (/foundation/.test(s)) k = 'building';
  else if (/remodel|kitchen|bathroom|contractor|construction|renovat/.test(s)) k = 'hammer';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;
}

// ---- pillar hub: rebuild industries/index.html from all industry pages ----
function buildHub() {
  const cards = [];
  for (const d of fs.readdirSync(IND_DIR)) {
    const f = path.join(IND_DIR, d, 'index.html');
    if (d === 'index.html' || !fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, 'utf8');
    const h1 = (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1] || d;
    const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || '';
    cards.push({ slug: d, h1, desc });
  }
  cards.sort((a, b) => a.h1.localeCompare(b.h1));
  const grid = cards.map((c) => {
    const name = c.h1.replace(/^Local SEO for\s+/i, '');
    return `        <a class="ind-cat-card" href="/industries/${c.slug}/"><span class="ind-cat-icon">${industryIcon(c.slug, name)}</span><span class="ind-cat-name">${esc(name)}</span><span class="ind-cat-desc">${esc(unesc(c.desc).slice(0, 88))}…</span><span class="ind-cat-cta">View service &rarr;</span></a>`;
  }).join('\n');
  const url = 'https://www.rocketgrowthagency.com/industries/';
  // HUB HERO = the locked .ih-* redesign (Chris-approved 2026-07-06). THIRD sync point — if the hub
  // hero changes on the site, update it HERE too, or the next drip run reverts it. See [[project-industry-pages-locked]].
  const page = `<!doctype html>
<html lang="en">
<head>
  <script>try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(e){}
  window.addEventListener('pageshow',function(){if(!location.hash)window.scrollTo(0,0);});</script>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MCGMSCCR');</script>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Industries We Serve — Local SEO by Industry | Rocket Growth Agency</title>
  <meta name="description" content="Done-for-you Google Maps local SEO, tailored by industry. See how Rocket Growth Agency helps your business type rank in the Maps top 3 and turn local search into booked calls." />
  <link rel="canonical" href="${url}" /><meta name="robots" content="index,follow" />
  <meta property="og:title" content="Industries We Serve | Rocket Growth Agency" /><meta property="og:description" content="Done-for-you Google Maps local SEO, tailored by industry." /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png" />
  <link rel="icon" href="/favicon.svg?v=20260706b" type="image/svg+xml" />
  <link rel="icon" type="image/png" href="/images/assets/rga_favicon.png?v=20260706b" />
  <link rel="apple-touch-icon" href="/images/assets/apple-touch-icon.png?v=20260706b" />
  <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css?v=20260706f" /><script defer src="/script.js?v=20260706e"></script>
  <style id="promo-bar-style">
    .promo-bar{display:block;background:#2457e6;color:#fff;text-align:center;text-decoration:none;font-size:.92rem;font-weight:600;padding:.62rem 1rem;line-height:1.4}
    .promo-bar strong{font-weight:800}.promo-bar .promo-cta{text-decoration:underline;white-space:nowrap;margin-left:.35rem}.promo-bar:hover{background:#1c46c4}
    @media(max-width:640px){.promo-bar{font-size:.8rem;padding:.55rem .8rem}}
  </style>
  <style id="ind-visuals">
    .ind-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-top:1.5rem;}
    .ind-cat-card{display:flex;flex-direction:column;gap:.45rem;padding:1.5rem 1.6rem;border:1px solid var(--line);border-radius:14px;background:#fff;text-decoration:none;color:inherit;transition:.15s ease;}
    .ind-cat-card:hover{border-color:#2f57eb;box-shadow:0 10px 26px rgba(47,87,235,.12);transform:translateY(-2px);}
    .ind-cat-icon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:#eef4ff;color:#2457e6;margin-bottom:.25rem;flex-shrink:0;}
    .ind-cat-icon svg{width:24px;height:24px;display:block;}
    .ind-cat-card:hover .ind-cat-icon{background:#e3ecff;}
    .ind-cat-name{font-size:1.32rem;font-weight:800;color:#0f172a;line-height:1.18;}
    .ind-cat-desc{font-size:.93rem;color:var(--text-700);line-height:1.5;}
    .ind-cat-cta{font-weight:700;color:#2f57eb;margin-top:.35rem;font-size:.95rem;}
  </style>
  <style id="ih-hero">
    .ih-hero{position:relative;overflow:hidden;background:linear-gradient(180deg,#eef3ff 0%,#f7f9ff 60%,#fff 100%)}
    .ih-hero::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(36,87,230,.10) 1.2px,transparent 1.2px);background-size:26px 26px;opacity:.5;pointer-events:none}
    .ih-in{position:relative;max-width:1160px;margin:0 auto;padding:3.6rem 1.75rem 3.8rem;display:grid;grid-template-columns:1.02fr .98fr;gap:3rem;align-items:center}
    .ih-eyebrow{font-size:.8rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2457e6;margin:0 0 1rem}
    .ih-h1{font-size:3.1rem;font-weight:900;letter-spacing:-.025em;line-height:1.04;color:#0f1b3d;margin:0 0 1.1rem}
    .ih-sub{font-size:1.12rem;line-height:1.6;color:#41506b;margin:0 0 1.7rem;max-width:42ch}
    .ih-cta{display:inline-flex;align-items:center;gap:.5rem;background:#2457e6;color:#fff;font-weight:800;font-size:1rem;padding:.9rem 1.5rem;border-radius:999px;text-decoration:none;box-shadow:0 14px 30px -12px rgba(36,87,230,.6)}
    .ih-cta:hover{color:#fff}
    .mapwrap{position:relative}
    .map-card{position:relative;background:#fff;border:1px solid #e3e9f4;border-radius:24px;box-shadow:0 44px 90px -46px rgba(20,40,90,.5);padding:.9rem}
    .map-top{display:flex;align-items:center;gap:.55rem;background:#f4f7fc;border:1px solid #e7edf8;border-radius:999px;padding:.6rem .95rem;font-size:.92rem;color:#334155;font-weight:600;margin-bottom:.8rem}
    .map-top svg{width:16px;height:16px;color:#2457e6;flex:0 0 auto}
    .map{position:relative;height:342px;border-radius:16px;overflow:hidden;background:#e6ecf5}
    .map .road{position:absolute;background:#fff}
    .map .blk{position:absolute;background:#eef3fb;border-radius:5px}
    .map .park{position:absolute;background:#d9ecda;border-radius:16px}
    .map .water{position:absolute;background:#cfe1f4}
    .ring{position:absolute;left:50%;top:45%;width:78px;height:78px;border-radius:50%;background:rgba(36,87,230,.14);transform:translate(-50%,-50%);z-index:2;animation:ihpulse 2.4s ease-out infinite}
    @keyframes ihpulse{0%{transform:translate(-50%,-50%) scale(.6);opacity:.7}100%{transform:translate(-50%,-50%) scale(1.25);opacity:0}}
    .map .pin{position:absolute;transform:translate(-50%,-100%);z-index:3}
    .map .pin.big svg{width:52px;height:52px;color:#2457e6;filter:drop-shadow(0 12px 14px rgba(36,87,230,.5))}
    .map .pin.small svg{width:28px;height:28px;color:#9aa8be;filter:drop-shadow(0 5px 6px rgba(20,40,90,.18))}
    .map .pin.big .tag{position:absolute;left:50%;top:-18px;transform:translateX(-50%);background:#0f1b3d;color:#fff;font-size:.7rem;font-weight:800;padding:.2rem .5rem;border-radius:6px;white-space:nowrap}
    .map-badge{position:absolute;right:.75rem;bottom:.75rem;background:#fff;border:1px solid #e3e9f4;border-radius:12px;padding:.55rem .85rem;display:flex;align-items:center;gap:.5rem;font-weight:800;color:#0f1b3d;font-size:.9rem;box-shadow:0 14px 26px -12px rgba(20,40,90,.45);z-index:4}
    .map-badge svg{width:17px;height:17px;color:#16a34a}
    .ih-float{position:absolute;left:-16px;top:46%;background:#fff;border:1px solid #e3e9f4;border-radius:12px;padding:.55rem .8rem;display:flex;align-items:center;gap:.5rem;font-weight:700;color:#0f1b3d;font-size:.86rem;box-shadow:0 16px 30px -14px rgba(20,40,90,.5);z-index:5}
    .ih-float .st{display:inline-flex}.ih-float .st svg{width:13px;height:13px;color:#f4b400}
    @media(max-width:900px){.ih-in{grid-template-columns:1fr;gap:2.4rem}.ih-h1{font-size:2.4rem}}
  </style>
</head>
<body>
${HEADER}
  <main id="main">
    <section class="ih-hero">
      <div class="ih-in">
        <div>
          <p class="ih-eyebrow">Industries</p>
          <h1 class="ih-h1">Local SEO, tailored to your industry</h1>
          <p class="ih-sub">We do done-for-you Google Maps local SEO for local service businesses. Find your industry to see exactly how we get you ranking in the top 3 — and the free Growth Audit that shows where you stand today.</p>
          <a class="ih-cta" href="/free-growth-audit/">Get Your Free Growth Audit</a>
        </div>
        <div class="mapwrap">
          <div class="map-card">
            <div class="map-top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> your trade near me</div>
            <div class="map" id="ihmap"></div>
            <div class="map-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/></svg> Ranked #1 in the Map Pack</div>
          </div>
          <div class="ih-float"><span class="st" id="ihstars"></span> 5.0 &middot; top 3</div>
        </div>
      </div>
      <script>
      (function(){
        var pin='<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';
        var star='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        var h='';
        h+='<div class="road" style="top:30%;left:0;right:0;height:16px"></div>';
        h+='<div class="road" style="top:66%;left:0;right:0;height:13px"></div>';
        h+='<div class="road" style="left:37%;top:0;bottom:0;width:15px"></div>';
        h+='<div class="road" style="left:73%;top:0;bottom:0;width:11px"></div>';
        h+='<div class="road" style="left:-8%;top:84%;width:130%;height:12px;transform:rotate(-16deg)"></div>';
        h+='<div class="park" style="right:5%;top:7%;width:22%;height:19%"></div>';
        h+='<div class="water" style="left:-6%;bottom:-8%;width:28%;height:26%;border-radius:0 20px 0 0"></div>';
        [['8%','40%','14%','18%'],['52%','8%','16%','16%'],['46%','74%','16%','16%'],['80%','72%','14%','18%'],['20%','8%','12%','14%']].forEach(function(b){h+='<div class="blk" style="left:'+b[0]+';top:'+b[1]+';width:'+b[2]+';height:'+b[3]+'"></div>';});
        [['22%','27%'],['76%','23%'],['30%','73%'],['67%','71%']].forEach(function(p){h+='<div class="pin small" style="left:'+p[0]+';top:'+p[1]+'">'+pin+'</div>';});
        h+='<div class="ring"></div><div class="pin big" style="left:50%;top:45%"><span class="tag">You</span>'+pin+'</div>';
        var m=document.getElementById('ihmap'); if(m) m.innerHTML=h;
        var s=document.getElementById('ihstars'); if(s) s.innerHTML=star+star+star+star+star;
      })();
      </script>
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
if (ARGS.includes('--rebuild-hub')) { buildHub(); console.log('[industry-engine] hub rebuilt (--rebuild-hub).'); process.exit(0); }
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
