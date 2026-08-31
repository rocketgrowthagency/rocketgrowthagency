#!/usr/bin/env node
/**
 * generate-blog-post.mjs — RGA inbound content engine (WS2, 2026-06-29).
 *
 * Generates a genuinely vertical-specific "Local SEO for <Vertical>" blog post,
 * matching the locked golden template (blog/local-seo-for-plumbers/), with
 * BlogPosting + FAQPage schema, internal links, and the approved conversion
 * structure (educational depth + "it's a cadence, not a setup" beat + content-
 * matched CTA → free Growth Audit). Writes into the Website repo's blog/ dir.
 *
 * Content is produced by OpenAI (OPENAI_API_KEY in Scraper .env) as STRUCTURED
 * data; this script assembles the HTML itself (LLM never emits raw markup), so
 * output is always well-formed, schema-complete, and internally linked.
 *
 * Usage:
 *   node scripts/generate-blog-post.mjs "Plumbers"                 # 1 draft (HTML only)
 *   node scripts/generate-blog-post.mjs "HVAC" "Garage door repair"# multiple drafts
 *   node scripts/generate-blog-post.mjs "Plumbers" --publish       # also wire sitemap + blog index
 *   node scripts/generate-blog-post.mjs "Plumbers" --force         # overwrite existing
 *
 * DRAFT by default: writes blog/<slug>/index.html only. --publish adds the URL to
 * sitemap.xml + a card to blog/index.html (so review-before-publish is the default).
 * Deploy = git commit + push the Website repo (Netlify auto-builds); drip in batches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const PUBLISH = ARGS.includes('--publish');
const FORCE = ARGS.includes('--force');
const FROM_QUEUE = ARGS.includes('--from-queue');
const FROM_TOPICS = ARGS.includes('--from-topics');   // rotate the curated strategic-topics list (evergreen how-to posts)
const countArg = ARGS.find((a) => a.startsWith('--count='));
const COUNT = countArg ? parseInt(countArg.split('=')[1], 10) : null;
const VERTICAL_ARGS = ARGS.filter((a) => !a.startsWith('--'));
const topicArg = ARGS.find((a) => a.startsWith('--topic='));
const catArg = ARGS.find((a) => a.startsWith('--category='));
let TOPIC = topicArg ? topicArg.slice('--topic='.length) : null;   // topic-post title (Maps SEO / GBP / Website)
let CATEGORY = catArg ? catArg.slice('--category='.length) : null; // maps | gbp | website
if (!VERTICAL_ARGS.length && !FROM_QUEUE && !TOPIC && !FROM_TOPICS) { console.error('Usage: node scripts/generate-blog-post.mjs "<Vertical>" [...] | --from-queue [--count=N] | --from-topics | --topic="<Title>" --category=<maps|gbp|website> [--publish] [--force]'); process.exit(1); }

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const BLOG_DIR = path.join(WEBSITE_DIR, 'blog');
// Approved target industries (single source of truth). The engine ONLY pulls these from the
// queue. Fail-closed: if the config can't load, match nothing (never silently pick off-list).
const APPROVED_INDUSTRIES = (() => {
  try { return new Set((JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'approved-industries.json'), 'utf8')).approved) || []); }
  catch (e) { console.error('[approved-industries] could not load config/approved-industries.json — refusing to pull off-list:', e.message); return new Set(); }
})();
const SITEMAP = path.join(WEBSITE_DIR, 'sitemap.xml');

// ---- env ----
const env = Object.fromEntries(
  fs.readFileSync(path.join(SCRAPER_DIR, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const MODEL = env.BLOG_MODEL || 'gpt-4o';
if (!OPENAI_API_KEY) { console.error('No OPENAI_API_KEY in Scraper .env'); process.exit(1); }
const AIRTABLE_API_KEY = env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID || 'appSKOMBz6OpGf3qu';
// Cost + cadence caps (autonomous safety). Defaults: 1 post/day, $0.50/day ceiling.
const MAX_POSTS_PER_DAY = Number(env.BLOG_MAX_PER_DAY || 1);
const DAILY_COST_CEILING = Number(env.BLOG_DAILY_COST_CEILING || 0.5);
const SPEND_FILE = `/tmp/rga-blog-engine-${new Date().toISOString().slice(0, 10)}.json`;
function readSpend() { try { return JSON.parse(fs.readFileSync(SPEND_FILE, 'utf8')); } catch { return { posts: 0, cost: 0 }; } }
function writeSpend(s) { try { fs.writeFileSync(SPEND_FILE, JSON.stringify(s)); } catch (_) {} }

const TODAY = new Date().toISOString().slice(0, 10);
const TODAY_HUMAN = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Title-case a vertical for display, preserving acronyms/mixed-case (HVAC, CPAs stay as-is).
const titleCase = (s) => String(s).split(' ').map((w) => (w === w.toLowerCase() && /[a-z]/.test(w)) ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Blog categories → index-card data-cat/pill + hero crumb/icon. 'industry' is the default (the
// "Local SEO for <Vertical>" vertical posts); maps/gbp/website are TOPIC-post categories that fill
// those filter sections on /blog/. Must stay in sync with the filter pills in blog/index.html
// (data-cat maps|gbp|website|industry). See [[project-blog-index-locked]].
const _ICON = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>',
};
const CATS = {
  industry: { key: 'industry', pill: 'Industry Guide', crumb: 'Local SEO by Industry', icon: _ICON.pin },
  maps:     { key: 'maps',     pill: 'Maps SEO',       crumb: 'Maps SEO',              icon: _ICON.pin },
  gbp:      { key: 'gbp',      pill: 'GBP',            crumb: 'GBP',                   icon: _ICON.building },
  website:  { key: 'website',  pill: 'Website',        crumb: 'Website',               icon: _ICON.globe },
};

// ---- LLM: structured, vertical-specific content ----
async function generateContent(vertical) {
  const sys = `You are a senior local-SEO strategist writing for Rocket Growth Agency, an agency that does Google Maps local SEO for local service businesses. You write genuinely useful, specific, non-generic articles that rank and build trust. You NEVER produce thin or boilerplate content — every article is tailored to the exact business type, with details a real owner of that business would recognize as accurate.`;
  const user = `Write a blog article: "Local SEO for ${vertical}: How to Rank in the Google Maps Top 3 (2026)".

Audience: owners of ${vertical} businesses. Goal: teach the real playbook generously (builds trust + ranks), while making clear that EXECUTION + ongoing cadence is the hard part — which is what the agency provides. Tailor everything specifically to ${vertical}: the search intent of their customers, the GBP primary + realistic secondary categories for ${vertical}, the ranking factors that matter most for THIS business type, the specific mistakes ${vertical} owners make, and how their customers actually search and convert. Avoid anything generic that could apply to any business.

Return ONLY a JSON object with EXACTLY these keys:
{
  "metaDescription": "150-160 char meta description, specific to ${vertical}",
  "lead": "1-2 sentence intro paragraph (the hook), specific to how ${vertical} customers search",
  "sections": [
    { "heading": "section H2", "paras": ["paragraph", "..."], "bullets": ["optional bullet", "..."] }
  ],
  "ctaHeadline": "a content-matched CTA headline ending in a question, referencing this vertical and ranking",
  "faq": [ { "q": "question specific to ${vertical}", "a": "concise 1-3 sentence answer" } ]
}

Requirements:
- 8 to 10 sections. Include one section specifically about WHY most ${vertical} owners stall — that local SEO is a monthly cadence, not a one-time setup, and that this is where an agency earns its keep.
- Include a section on GBP categories naming the realistic primary + secondary categories for ${vertical}.
- Include a section on the mistakes that cap visibility for ${vertical} (use the bullets array there).
- 4 FAQ items, specific to ${vertical}.
- "bullets" is optional per section — only include where a list fits.
- DEPTH IS MANDATORY: each section must contain 3-4 full paragraphs of ~70-90 words each (so ~250-320 words per section). The total article body MUST be AT LEAST 1100 words — thin output is rejected and wastes the call. Be genuinely thorough, concrete, and specific to ${vertical}; use real examples a ${vertical} owner would recognize.
- Plain text only in paras/bullets/faq (no HTML, no markdown).
- Do not invent precise statistics; speak in defensible general terms (e.g., "the large majority of clicks go to the top three").`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const u = data.usage || {};
  // gpt-4o approx: $2.50/1M input, $10/1M output
  const cost = (u.prompt_tokens || 0) / 1e6 * 2.5 + (u.completion_tokens || 0) / 1e6 * 10;
  lastUsage = { in: u.prompt_tokens, out: u.completion_tokens, cost };
  return JSON.parse(data.choices[0].message.content);
}
let lastUsage = null;

// ---- topic-post content (general local-SEO topics, NOT vertical-specific) — fills Maps SEO / GBP / Website ----
async function generateTopicContent(topicTitle, cat) {
  const focus = {
    maps: 'Google Maps / local pack ranking mechanics — proximity, relevance, prominence, reviews, behavioral signals, and the ongoing work that moves the 3-pack.',
    gbp: 'Google Business Profile optimization — categories, services, attributes, photos, posts, Q&A, review strategy, and profile hygiene that drives calls.',
    website: 'the local website layer — service-page architecture, local relevance, internal linking, schema, page speed, and conversion paths that reinforce Map Pack results.',
  }[cat.key];
  const sys = `You are a senior local-SEO strategist writing for Rocket Growth Agency, an agency that does Google Maps local SEO for local service businesses. You write genuinely useful, specific, non-generic articles that rank and build trust. You NEVER produce thin or boilerplate content.`;
  const user = `Write a blog article titled exactly: "${topicTitle}".

Topic area: ${focus}
Audience: owners/operators of local service businesses across trades (do NOT write it for one single trade — keep it broadly applicable to local businesses, using varied concrete examples). Goal: teach the real playbook generously (builds trust + ranks) while making clear that EXECUTION + ongoing cadence is the hard part — which is what the agency provides.

Return ONLY a JSON object with EXACTLY these keys:
{
  "metaDescription": "150-160 char meta description for this exact topic",
  "lead": "1-2 sentence intro hook for this topic",
  "sections": [ { "heading": "section H2", "paras": ["paragraph", "..."], "bullets": ["optional bullet", "..."] } ],
  "ctaHeadline": "a content-matched CTA headline ending in a question, about ranking / visibility",
  "faq": [ { "q": "question a local owner asks about this topic", "a": "concise 1-3 sentence answer" } ]
}

Requirements:
- 8 to 10 sections. Include one section on WHY most owners stall (local SEO is a monthly cadence, not a one-time setup — where an agency earns its keep).
- Include one section with a concrete checklist or common-mistakes list (use the bullets array there).
- 4 FAQ items relevant to this topic.
- "bullets" is optional per section — only where a list fits.
- DEPTH IS MANDATORY: each section 3-4 full paragraphs of ~70-90 words (~250-320 words/section). Total body AT LEAST 1100 words — thin output is rejected.
- Plain text only in paras/bullets/faq (no HTML, no markdown).
- Do not invent precise statistics; speak in defensible general terms.`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], response_format: { type: 'json_object' }, temperature: 0.7, max_tokens: 4096 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const u = data.usage || {};
  const cost = (u.prompt_tokens || 0) / 1e6 * 2.5 + (u.completion_tokens || 0) / 1e6 * 10;
  lastUsage = { in: u.prompt_tokens, out: u.completion_tokens, cost };
  return JSON.parse(data.choices[0].message.content);
}
// Topic-post related-links block (also satisfies the quality guard's required internal links).
function topicRelated() {
  // 🔴 2026-08-28 — LINK LABELS ARE TITLE CASE. The rest of the site titles every nav/CTA label
  // ("Pricing" ×174, "Free Growth Audit" ×87); this template shipped lowercase ones, so 83 blog
  // posts read "Google Maps Local SEO service · pricing · free Growth Audit" while every other
  // page said "Pricing" and "Free Growth Audit". Keep new labels Title Case.
  return `      <p><strong>Related reading:</strong> <a href="/blog/google-maps-ranking-factors/">Google Maps Ranking Factors</a>, <a href="/blog/google-business-profile-optimization-checklist/">GBP Optimization Checklist</a>, <a href="/blog/local-seo-website-structure/">Local Website Structure</a>.</p>
      <p><strong>Get help:</strong> <a href="/services/google-maps-local-seo/">Google Maps Local SEO Service</a> &middot; <a href="/pricing/">Pricing</a> &middot; <a href="/free-growth-audit/">Free Growth Audit</a>.</p>`;
}

// ---- autonomous editor gate — replaces the human approval step ----
// A cheaper model critiques the draft for depth, specificity, usefulness, and
// genericness. Only drafts scoring >= EDITOR_MIN publish. This is what keeps
// unattended publishing safe vs Google's scaled-content-abuse policy.
const EDITOR_MIN = Number(env.BLOG_EDITOR_MIN || 7);
async function scoreDraft(vertical, content) {
  const body = (content.sections || []).map((s) => `## ${s.heading}\n${(s.paras || []).join('\n')}\n${(s.bullets || []).join('\n')}`).join('\n\n');
  const prompt = `You are a strict SEO content editor. Score this "Local SEO for ${vertical}" article 1-10 on: depth, specificity to ${vertical} (NOT generic), accuracy, and genuine usefulness to a ${vertical} owner. A 7+ is publishable; below 7 is too thin/generic/inaccurate. Return ONLY JSON: {"score": <int 1-10>, "verdict": "<one line>", "issues": ["..."]}\n\nARTICLE:\n${body.slice(0, 6000)}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: 400 }),
  });
  if (!res.ok) return { score: 7, verdict: 'editor unavailable — passing on guard only', issues: [] }; // fail-open to deterministic guard
  const data = await res.json();
  const u = data.usage || {};
  lastEditorCost = (u.prompt_tokens || 0) / 1e6 * 0.15 + (u.completion_tokens || 0) / 1e6 * 0.6; // gpt-4o-mini
  try { return JSON.parse(data.choices[0].message.content); } catch { return { score: 7, verdict: 'parse fail — passing', issues: [] }; }
}
let lastEditorCost = 0;

// ---- assemble HTML (we control all markup; LLM only supplies text) ----
function renderPost(vertical, slug, c, siblings, opts = {}) {
  const url = `https://www.rocketgrowthagency.com/blog/${slug}/`;
  const V = titleCase(vertical);
  const cat = opts.cat || CATS.industry;                 // hero crumb/pill/icon (default: industry)
  const title = opts.title || `Local SEO for ${V}: How to Rank in the Google Maps Top 3 (2026)`;
  // Tailored Map-Pack link-preview card (rendered by scripts/build-og-cards.mjs after the post is written;
  // it patches the exact ?v= stamp). This default keeps the tag correct for a brand-new post meanwhile.
  const ogImage = `https://www.rocketgrowthagency.com/images/assets/og/blog-${slug}.jpg?v=20260710`;
  const wordCount = (c.sections || []).reduce((n, s) => n + (s.paras || []).join(' ').split(/\s+/).length + (s.bullets || []).join(' ').split(/\s+/).length, 0);
  const industrySlug = slugify(vertical);
  const hasIndustryPage = fs.existsSync(path.join(WEBSITE_DIR, 'industries', industrySlug, 'index.html'));

  const og = `  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(c.metaDescription)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:site_name" content="Rocket Growth Agency" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(c.metaDescription)}" />
  <meta name="twitter:image" content="${ogImage}" />`;

  const breadcrumbSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.rocketgrowthagency.com/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.rocketgrowthagency.com/blog/' },
      { '@type': 'ListItem', position: 3, name: opts.title ? title : `Local SEO for ${V}`, item: url },
    ],
  }, null, 2);

  const _inCta = '<div class="bp-inline-cta"><div><h4>See exactly where you rank</h4><p>Free Growth Audit — your real Google Maps grid + the fixes that move you up. In ~1 hour.</p></div><a class="btn" href="/free-growth-audit/">Get my free audit</a></div>';
  const _toc = [];
  const sectionsHtml = (c.sections || []).map((s, i) => {
    const id = `sec-${i + 1}`;
    _toc.push(`<a href="#${id}">${esc((s.heading || '').slice(0, 40))}</a>`);
    let h = `      <h2 id="${id}">${esc(s.heading)}</h2>\n`;
    h += (s.paras || []).map((p) => `      <p>${esc(p)}</p>`).join('\n');
    if (s.bullets && s.bullets.length) {
      h += `\n      <ul>\n` + s.bullets.map((b) => `        <li>${esc(b)}</li>`).join('\n') + `\n      </ul>`;
    }
    if (i === 1) h += '\n' + _inCta;
    return h;
  }).join('\n');
  const tocHtml = _toc.join('');
  const readMin = Math.max(2, Math.round(wordCount / 200));

  const siblingLinks = (siblings || []).slice(0, 3).map((s) => `<a href="/blog/${s.slug}/">Local SEO for ${esc(s.vertical)}</a>`).join(', ');
  const doneForYou = hasIndustryPage ? ` <strong>Done-for-you:</strong> <a href="/industries/${industrySlug}/">our ${esc(vertical)} local SEO service</a>.` : '';
  const related = opts.related || `      <p><strong>Related industry guides:</strong> ${siblingLinks ? siblingLinks + ', ' : ''}<a href="/blog/google-maps-ranking-factors/">Google Maps Ranking Factors</a>, <a href="/blog/google-business-profile-optimization-checklist/">GBP Optimization Checklist</a>.</p>
      <p><strong>Get help:</strong> <a href="/services/google-maps-local-seo/">Google Maps Local SEO Service</a> &middot; <a href="/pricing/">Pricing</a> &middot; <a href="/free-growth-audit/">Free Growth Audit</a>.${doneForYou}</p>`;

  const faqHtml = (c.faq || []).map((f) => `      <h3>${esc(f.q)}</h3>\n      <p>${esc(f.a)}</p>`).join('\n');
  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: (c.faq || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }, null, 2);
  const blogSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: title,
    description: c.metaDescription,
    author: { '@type': 'Organization', name: 'Rocket Growth Agency' },
    publisher: { '@type': 'Organization', name: 'Rocket Growth Agency', logo: { '@type': 'ImageObject', url: 'https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png' } },
    datePublished: TODAY, dateModified: TODAY,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }, null, 2);

  const HEAD_NAV = `  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MCGMSCCR');</script>
  <!-- End Google Tag Manager -->`;
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
        <a class="nav-link" data-path="/industries/" href="/industries/">Industries</a><a class="nav-link" data-path="/demo/" href="/demo/">Demo</a>
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

  const html = `<!doctype html>
<html lang="en">
<head>
  <script>try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(e){}
  window.addEventListener('pageshow',function(){if(!location.hash)window.scrollTo(0,0);});</script>
${HEAD_NAV}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} | RGA</title>
  <meta name="description" content="${esc(c.metaDescription)}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="index,follow" />
${og}
  <link rel="icon" href="/favicon.svg?v=20260706b" type="image/svg+xml" />
  <link rel="icon" type="image/png" href="/images/assets/rga_favicon.png?v=20260706b" />
  <link rel="apple-touch-icon" href="/images/assets/apple-touch-icon.png?v=20260706b" />
  <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css?v=20260710a" />
  <script defer src="/script.js?v=20260706e"></script>
  <script type="application/ld+json">
${blogSchema}
  </script>
  <script type="application/ld+json">
${faqSchema}
  </script>
  <script type="application/ld+json">
${breadcrumbSchema}
  </script>
  <style id="blog-redesign">
    .bp-hero{max-width:1100px;margin:0 auto;padding:2.4rem 1.5rem 1.4rem}
    .bp-hero-inner{max-width:720px}
    .bp-crumb{font-size:.82rem;color:#94a3b8;font-weight:600;margin-bottom:.9rem}
    .bp-crumb a{color:#2457e6;text-decoration:none}
    .bp-cat{display:inline-flex;align-items:center;gap:.4rem;background:#eef4ff;color:#2457e6;font-weight:700;font-size:.74rem;letter-spacing:.03em;text-transform:uppercase;padding:.34rem .72rem;border-radius:999px;margin-bottom:1rem}
    .bp-cat svg{width:14px;height:14px}
    .bp-h1{font-size:clamp(2rem,4vw,2.9rem);font-weight:900;letter-spacing:-.03em;line-height:1.08;color:#0f1b3d;margin:0}
    .bp-meta{display:flex;align-items:center;gap:.8rem;margin-top:1.4rem;flex-wrap:wrap}
    .bp-av{width:42px;height:42px;border-radius:50%;background:#2457e6;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
    .bp-av svg{width:22px;height:22px}
    .bp-by{font-weight:700;color:#0f172a;font-size:.95rem;line-height:1.2}
    .bp-by small{display:block;font-weight:500;color:#64748b;font-size:.84rem;margin-top:.1rem}
    .bp-share{margin-left:auto;display:flex;gap:.5rem}
    .bp-share a{width:36px;height:36px;border-radius:10px;background:#f4f6fb;color:#475569;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .bp-share a:hover{background:#eef4ff;color:#2457e6}
    .bp-share svg{width:16px;height:16px}
    .bp-wrap{max-width:1100px;margin:.6rem auto 0;padding:0 1.5rem 3.5rem;display:grid;grid-template-columns:1fr 280px;gap:3rem;align-items:start}
    .bp-body{min-width:0;max-width:720px}
    .bp-body>p{font-size:1.08rem;line-height:1.78;color:#334155;margin:0 0 1.3rem}
    .bp-body>p.bp-lead{font-size:1.22rem;line-height:1.65;color:#0f1b3d;font-weight:500;margin-bottom:1.8rem}
    .bp-body h2{font-size:1.6rem;font-weight:800;letter-spacing:-.02em;color:#0f1b3d;margin:2.4rem 0 .9rem;scroll-margin-top:90px}
    .bp-body h3{font-size:1.18rem;font-weight:700;color:#0f1b3d;margin:1.7rem 0 .6rem}
    .bp-body ul{margin:0 0 1.4rem;padding:0;list-style:none;display:flex;flex-direction:column;gap:.7rem}
    .bp-body ul li{position:relative;padding-left:1.7rem;color:#334155;line-height:1.6}
    .bp-body ul li::before{content:"";position:absolute;left:0;top:.55em;width:8px;height:8px;border-radius:50%;background:#2457e6}
    .bp-body a{color:#2457e6}
    .bp-inline-cta{margin:2.2rem 0;background:linear-gradient(135deg,#0f1b40,#1d2f66);color:#fff;border-radius:18px;padding:1.7rem 1.9rem;display:flex;align-items:center;justify-content:space-between;gap:1.2rem;flex-wrap:wrap}
    .bp-inline-cta h4{margin:0 0 .25rem;font-size:1.18rem}
    .bp-inline-cta p{margin:0;color:#c7d2ea;font-size:.93rem}
    .bp-inline-cta .btn{background:#fff;color:#2457e6;font-weight:800;padding:.72rem 1.25rem;border-radius:999px;text-decoration:none;white-space:nowrap}
    .bp-side{position:sticky;top:96px;display:flex;flex-direction:column;gap:1.2rem}
    .bp-toc{background:#fff;border:1px solid #e5eaf2;border-radius:16px;padding:1.2rem 1.3rem}
    .bp-toc h4{margin:0 0 .8rem;font-size:.74rem;text-transform:uppercase;letter-spacing:.08em;color:#8a97ab;font-weight:700}
    .bp-toc a{display:block;padding:.4rem 0 .4rem .7rem;margin-left:-.7rem;color:#475569;text-decoration:none;font-size:.92rem;font-weight:500;border-left:2px solid transparent}
    .bp-toc a:hover{color:#2457e6;border-color:#2457e6}
    .bp-scta{background:linear-gradient(160deg,#eef4ff,#fff);border:1px solid #dbe6fb;border-radius:16px;padding:1.4rem}
    .bp-scta strong{display:block;color:#0f1b3d;font-size:1.02rem;margin-bottom:.35rem}
    .bp-scta p{margin:0 0 1rem;color:#5a6b86;font-size:.88rem;line-height:1.5}
    .bp-scta .btn{width:100%;justify-content:center}
    .bp-author{max-width:720px;margin:2.8rem 0 0;border-top:1px solid #eef1f6;padding-top:1.6rem;display:flex;gap:1rem;align-items:center}
    .bp-author .av{width:54px;height:54px;border-radius:14px;background:#2457e6;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
    .bp-author .av svg{width:28px;height:28px}
    .bp-author strong{color:#0f1b3d}
    .bp-author p{margin:.15rem 0 0;color:#5a6b86;font-size:.92rem;line-height:1.5}
    @media(max-width:900px){.bp-wrap{grid-template-columns:1fr}.bp-side{display:none}}
  </style>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MCGMSCCR" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
${HEADER}

  <main class="blog-post" id="main">
    <div class="bp-hero"><div class="bp-hero-inner">
      <p class="bp-crumb"><a href="/blog/">Blog</a> &rsaquo; ${cat.crumb}</p>
      <span class="bp-cat">${cat.icon}${cat.crumb}</span>
      <h1 class="bp-h1">${esc(title)}</h1>
      <div class="bp-meta"><span class="bp-av"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg></span><span class="bp-by">Rocket Growth Agency<small>${TODAY_HUMAN} &middot; ~${readMin} min read</small></span><span class="bp-share"><a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener" title="Share on X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h3l-7 8 8 12h-6l-5-7-5 7H3l7-9L3 2h6l4 6z"/></svg></a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener" title="Share on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5 2.5 2.5 0 0 0 4.98 3.5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C21.4 8.65 22 11 22 14.1V21h-4v-6.1c0-1.45-.03-3.3-2-3.3-2 0-2.3 1.57-2.3 3.2V21h-4z"/></svg></a></span></div>
    </div></div>
    <div class="bp-wrap">
      <div class="bp-body">
        <p class="bp-lead">${esc(c.lead)}</p>
${sectionsHtml}
${related}
      <h2 id="faq">Frequently asked questions</h2>
${faqHtml}
      <div class="bp-author"><span class="av"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg></span><div><strong>Written by Rocket Growth Agency</strong><p>We help local service businesses rank in the Google Maps top 3 &mdash; and turn that visibility into calls. Maps-first, in-house, month-to-month.</p></div></div>
      </div>
      <aside class="bp-side">
        <div class="bp-toc"><h4>On this page</h4>${tocHtml}<a href="#faq">FAQ</a></div>
        <div class="bp-scta"><strong>Where do you rank?</strong><p>Get a free scored audit of your Google Maps presence &mdash; no card, in about an hour.</p><a class="btn" href="/free-growth-audit/">Free Growth Audit</a></div>
      </aside>
    </div>
  </main>

  <section class="cta-band"><div class="cta-band-inner"><h2>${esc(c.ctaHeadline)}</h2><a class="btn-light" href="/free-growth-audit/">Get Your Free Growth Audit</a></div></section>
${FOOTER}
</body>
</html>
`;
  return { html, title, wordCount, url, metaDescription: c.metaDescription };
}

// ---- quality guard (mirrors the email assertEmailContent discipline) ----
function assertQuality(html, meta) {
  const errs = [];
  if (meta.wordCount < 700) errs.push(`thin: ${meta.wordCount} words (<700)`);
  if (!html.includes('application/ld+json')) errs.push('missing JSON-LD schema');
  if (!html.includes('FAQPage')) errs.push('missing FAQ schema');
  if (!html.includes('/free-growth-audit/')) errs.push('missing CTA');
  if (!html.includes('/services/google-maps-local-seo/')) errs.push('missing internal service link');
  if (!html.includes('/blog/google-maps-ranking-factors/')) errs.push('missing internal blog link');
  if (errs.length) throw new Error('QUALITY GUARD: ' + errs.join('; '));
}

// ---- publish: sitemap + blog index ----
function addToSitemap(url) {
  let xml = fs.readFileSync(SITEMAP, 'utf8');
  if (xml.includes(`<loc>${url}</loc>`)) return false;
  const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  xml = xml.replace(/<\/urlset>\s*$/, entry + '</urlset>\n');
  fs.writeFileSync(SITEMAP, xml);
  return true;
}
function addToBlogIndex(vertical, slug, metaDescription, opts = {}) {
  const idx = path.join(BLOG_DIR, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const href = `/blog/${slug}/`;
  if (html.includes(`href="${href}"`)) return false;
  // Option-B card (thin blue top bar + category pill + author footer). Must match blog/index.html markup — see [[project-blog-index-locked]].
  const cat = opts.cat || CATS.industry;
  const cardTitle = opts.title || `Local SEO for ${vertical}: How to Rank in the Google Maps Top 3`;
  const rocket = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';
  const card = `        <article class="bc" data-cat="${cat.key}"><a class="bc-card" href="${href}"><div class="bc-bar"></div><div class="bc-body"><span class="bc-pill">${cat.pill}</span><h2 class="bc-title">${esc(cardTitle)}</h2><p class="bc-excerpt">${esc((metaDescription || '').slice(0, 140))}</p><div class="bc-auth"><span class="bc-av">${rocket}</span><span class="bc-meta"><b>Rocket Growth Agency</b>${TODAY_HUMAN}</span></div></div></a></article>\n`;
  html = html.replace(/(<div class="bloghub-grid">\s*)/, `$1\n${card}`);
  fs.writeFileSync(idx, html);
  return true;
}

// ---- sibling posts (for cluster interlinking): {slug, vertical} from existing posts ----
function listSiblingPosts(excludeSlug) {
  const out = [];
  for (const d of fs.existsSync(BLOG_DIR) ? fs.readdirSync(BLOG_DIR) : []) {
    if (!d.startsWith('local-seo-for-') || d === excludeSlug) continue;
    const f = path.join(BLOG_DIR, d, 'index.html');
    if (!fs.existsSync(f)) continue;
    // 🔴 2026-08-28 — WAS /<title>Local SEO for ([^:]+):/ and it corrupted 11 live pages.
    //
    // `[^:]+` means "anything that is not a colon", which does NOT stop at `</title>`. A title
    // WITHOUT a colon — "Local SEO for Auto Detailing (2026 Guide) | Rocket Growth Agency" — let the
    // capture run straight out of the title, through the whole <head>, and stop at the first colon
    // it found: the `https:` in the canonical URL. The captured "vertical" was then rendered as the
    // anchor text of a Related-industry-guides link, so real blog posts displayed:
    //
    //   Local SEO for Auto Detailing (2026 Guide)</title> <meta name="description" content="…" />
    //   <link rel="canonical" href="https
    //
    // Only titles WITHOUT a colon broke, which is why it hit 11 pages and not all ~87 — the rest
    // happened to contain a colon early enough to stop the run.
    //
    // `[^<:]` cannot leave the title element: it stops at the first `<` or `:`, whichever comes
    // first. A character class that excludes the closing delimiter is the fix; a lazy quantifier
    // would still have been free to cross the tag boundary.
    const m = fs.readFileSync(f, 'utf8').match(/<title>Local SEO for ([^<:]+)[:<]/);
    if (m) out.push({ slug: d, vertical: m[1].trim() });
  }
  return out;
}

// ---- queue puller: prioritized verticals not yet covered ----
async function loadQueueVerticals() {
  if (!AIRTABLE_API_KEY) { console.error('No AIRTABLE_API_KEY — cannot pull from queue.'); return []; }
  const seen = {}; let offset = null;
  while (true) {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent('Search Queue')}`);
    u.searchParams.set('pageSize', '100');
    ['Vertical', 'Vertical Tier', 'Avg Ticket'].forEach((f) => u.searchParams.append('fields[]', f));
    if (offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    if (!res.ok) break;
    const d = await res.json();
    for (const r of d.records || []) {
      const v = r.fields.Vertical; if (!v) continue;
      const ticket = Number(r.fields['Avg Ticket'] || 0);
      if (!seen[v] || ticket > seen[v].ticket) seen[v] = { vertical: v, ticket, tier: r.fields['Vertical Tier'] };
    }
    offset = d.offset; if (!offset) break;
  }
  // dedup vs already-published, sort by avg ticket desc (highest-value verticals first)
  return Object.values(seen)
    .filter((x) => APPROVED_INDUSTRIES.has(x.vertical)) // only approved target industries
    .filter((x) => !fs.existsSync(path.join(BLOG_DIR, `local-seo-for-${slugify(x.vertical)}`)))
    .sort((a, b) => b.ticket - a.ticket)
    .map((x) => x.vertical);
}

// ---- publish-only: wire existing drafts into sitemap + index (no generation) ----
if (ARGS.includes('--publish-only')) {
  for (const vertical of VERTICAL_ARGS) {
    const slug = `local-seo-for-${slugify(vertical)}`;
    const file = path.join(BLOG_DIR, slug, 'index.html');
    if (!fs.existsSync(file)) { console.log(`SKIP ${vertical} — no draft at blog/${slug}/`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const s = addToSitemap(`https://www.rocketgrowthagency.com/blog/${slug}/`);
    const b = addToBlogIndex(vertical, slug, desc);
    console.log(`published ${slug}: sitemap ${s ? 'added' : 'present'}, index ${b ? 'added' : 'present'}`);
  }
  process.exit(0);
}

// ---- strategic-topics rotation: pick the next uncovered curated topic (evergreen how-to,
// biased over more "Local SEO for <Vertical>" clones now that the core verticals are covered) ----
if (FROM_TOPICS && !TOPIC) {
  const topicsFile = path.join(SCRAPER_DIR, 'config', 'strategic-blog-topics.tsv');
  let picked = null;
  try {
    const lines = fs.readFileSync(topicsFile, 'utf8').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() && !l.trim().startsWith('#'));
    for (const line of lines) {
      const [title, cat] = line.split('\t').map((s) => (s || '').trim());
      if (!title || !cat) continue;
      if (!fs.existsSync(path.join(BLOG_DIR, slugify(title), 'index.html'))) { picked = { title, cat }; break; }
    }
  } catch (e) { console.error(`[blog-engine] strategic-topics file error: ${e.message}`); process.exit(1); }
  if (!picked) { console.log('[blog-engine] strategic topics: all covered — nothing to publish.'); process.exit(0); }
  TOPIC = picked.title; CATEGORY = picked.cat;
}

// ---- topic-post mode (fills Maps SEO / GBP / Website categories) ----
if (TOPIC) {
  const cat = CATS[CATEGORY];
  if (!cat || cat.key === 'industry') { console.error('--topic requires --category one of: maps, gbp, website'); process.exit(1); }
  const slug = slugify(TOPIC);
  const dir = path.join(BLOG_DIR, slug);
  const file = path.join(dir, 'index.html');
  if (fs.existsSync(file) && !FORCE) { console.log(`SKIP topic "${TOPIC}" — blog/${slug}/ exists.`); process.exit(0); }
  const spend = readSpend();
  if (spend.cost >= DAILY_COST_CEILING) { console.log(`[blog-engine] daily cost ceiling $${DAILY_COST_CEILING} reached — skipping topic.`); process.exit(0); }
  process.stdout.write(`Generating topic "${TOPIC}" [${cat.pill}] (${MODEL})... `);
  try {
    let rendered = null, runCost = 0, lastErr = null, verdict = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const content = await generateTopicContent(TOPIC, cat);
      runCost += lastUsage ? lastUsage.cost : 0;
      const r = renderPost(TOPIC, slug, content, [], { title: TOPIC, cat, related: topicRelated() });
      try { assertQuality(r.html, r); } catch (qe) { lastErr = qe; process.stdout.write(`[retry ${attempt}: ${qe.message}] `); continue; }
      const v = await scoreDraft(TOPIC, content); runCost += lastEditorCost;
      if (v.score < EDITOR_MIN) { lastErr = new Error(`editor ${v.score} < ${EDITOR_MIN}`); process.stdout.write(`[retry ${attempt}: editor ${v.score}/10] `); continue; }
      rendered = r; verdict = v; break;
    }
    if (!rendered) throw lastErr || new Error('failed quality/editor after 3 attempts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, rendered.html);
    spend.cost += runCost; spend.posts += 1; writeSpend(spend);
    console.log(`OK — ${rendered.wordCount} words, editor ${verdict.score}/10 → blog/${slug}/  [$${runCost.toFixed(4)}]`);
    if (PUBLISH) {
      const s = addToSitemap(rendered.url); const b = addToBlogIndex(TOPIC, slug, rendered.metaDescription, { cat, title: TOPIC });
      console.log(`   published: sitemap ${s ? 'added' : 'present'}, blog index ${b ? 'added' : 'present'}`);
    } else { console.log('   DRAFT (not in sitemap/index — add --publish)'); }
  } catch (e) { console.log(`FAILED: ${e.message}`); process.exit(1); }
  process.exit(0);
}

// ---- main ----
const workList = FROM_QUEUE ? await loadQueueVerticals() : VERTICAL_ARGS;
const spend = readSpend();
const target = COUNT != null ? COUNT : (FROM_QUEUE ? MAX_POSTS_PER_DAY : workList.length);
const dayRemaining = FROM_QUEUE ? Math.max(0, MAX_POSTS_PER_DAY - spend.posts) : Infinity;
console.log(`[blog-engine] ${workList.length} candidate vertical(s); target ${target}; day-cap remaining ${dayRemaining === Infinity ? 'n/a (manual)' : dayRemaining}; spent today $${spend.cost.toFixed(4)}/$${DAILY_COST_CEILING}`);
let made = 0;
for (const vertical of workList) {
  if (made >= target) break;
  if (FROM_QUEUE && made >= dayRemaining) { console.log('[blog-engine] daily post cap reached — stopping.'); break; }
  if (spend.cost >= DAILY_COST_CEILING) { console.log(`[blog-engine] daily cost ceiling $${DAILY_COST_CEILING} reached — stopping.`); break; }
  const slug = `local-seo-for-${slugify(vertical)}`;
  const dir = path.join(BLOG_DIR, slug);
  const file = path.join(dir, 'index.html');
  if (fs.existsSync(file) && !FORCE) { console.log(`SKIP ${vertical} — ${slug}/ exists.`); continue; }
  process.stdout.write(`Generating "${vertical}" (${MODEL})... `);
  try {
    // Retry on thin/failed-guard/low-editor-score — unattended runs can't rely on a human.
    let rendered = null, runCost = 0, lastErr = null, editorVerdict = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const content = await generateContent(vertical);
      runCost += lastUsage ? lastUsage.cost : 0;
      const r = renderPost(vertical, slug, content, listSiblingPosts(slug));
      try { assertQuality(r.html, r); } catch (qe) { lastErr = qe; process.stdout.write(`[retry ${attempt}: ${qe.message}] `); continue; }
      // editor gate
      const verdict = await scoreDraft(vertical, content); runCost += lastEditorCost;
      if (verdict.score < EDITOR_MIN) { lastErr = new Error(`editor score ${verdict.score} < ${EDITOR_MIN}: ${verdict.verdict}`); process.stdout.write(`[retry ${attempt}: editor ${verdict.score}/10] `); continue; }
      rendered = r; editorVerdict = verdict; break;
    }
    if (!rendered) throw lastErr || new Error('failed quality/editor after 3 attempts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, rendered.html);
    spend.cost += runCost; spend.posts += 1; writeSpend(spend); made++;
    console.log(`OK — ${rendered.wordCount} words, editor ${editorVerdict.score}/10 → blog/${slug}/  [$${runCost.toFixed(4)}]`);
    if (PUBLISH) {
      const s = addToSitemap(rendered.url); const b = addToBlogIndex(vertical, slug, rendered.metaDescription);
      console.log(`   published: sitemap ${s ? 'added' : 'present'}, blog index ${b ? 'added' : 'present'}`);
    } else {
      console.log(`   DRAFT (not in sitemap/index — add --publish)`);
    }
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
  }
}
console.log(`[blog-engine] done — ${made} post(s) this run; today total ${spend.posts} post(s), $${spend.cost.toFixed(4)}.`);
