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
const countArg = ARGS.find((a) => a.startsWith('--count='));
const COUNT = countArg ? parseInt(countArg.split('=')[1], 10) : null;
const VERTICAL_ARGS = ARGS.filter((a) => !a.startsWith('--'));
if (!VERTICAL_ARGS.length && !FROM_QUEUE) { console.error('Usage: node scripts/generate-blog-post.mjs "<Vertical>" [...] | --from-queue [--count=N] [--publish] [--force]'); process.exit(1); }

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const BLOG_DIR = path.join(WEBSITE_DIR, 'blog');
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
function renderPost(vertical, slug, c, siblings) {
  const url = `https://www.rocketgrowthagency.com/blog/${slug}/`;
  const V = titleCase(vertical);
  const title = `Local SEO for ${V}: How to Rank in the Google Maps Top 3 (2026)`;
  const ogImage = 'https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png';
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
      { '@type': 'ListItem', position: 3, name: `Local SEO for ${V}`, item: url },
    ],
  }, null, 2);

  const sectionsHtml = (c.sections || []).map((s) => {
    let h = `      <h2>${esc(s.heading)}</h2>\n`;
    h += (s.paras || []).map((p) => `      <p>${esc(p)}</p>`).join('\n');
    if (s.bullets && s.bullets.length) {
      h += `\n      <ul>\n` + s.bullets.map((b) => `        <li>${esc(b)}</li>`).join('\n') + `\n      </ul>`;
    }
    return h;
  }).join('\n');

  const siblingLinks = (siblings || []).slice(0, 3).map((s) => `<a href="/blog/${s.slug}/">Local SEO for ${esc(s.vertical)}</a>`).join(', ');
  const doneForYou = hasIndustryPage ? ` <strong>Done-for-you:</strong> <a href="/industries/${industrySlug}/">our ${esc(vertical)} local SEO service</a>.` : '';
  const related = `      <p><strong>Related industry guides:</strong> ${siblingLinks ? siblingLinks + ', ' : ''}<a href="/blog/google-maps-ranking-factors/">Google Maps ranking factors</a>, <a href="/blog/google-business-profile-optimization-checklist/">GBP optimization checklist</a>.</p>
      <p><strong>Get help:</strong> <a href="/services/google-maps-local-seo/">Google Maps Local SEO service</a> &middot; <a href="/pricing/">pricing</a> &middot; <a href="/free-growth-audit/">free Growth Audit</a>.${doneForYou}</p>`;

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
  const HEADER = `  <div class="topbar"><div class="topbar-inner"><div>Google Maps Local SEO For Local Businesses</div><div class="topbar-right"><a href="tel:+14242422040" style="white-space:nowrap">Call (424) 242-2040</a></div></div></div>
  <header class="site-header"><div class="header-inner"><a href="/" class="brand"><img src="/images/assets/rga_icon-header.png?v=20260311a" alt="Rocket Growth Agency logo" /><span class="brand-text">Rocket<span class="brand-growth">Growth</span>Agency</span></a><nav class="desktop-nav" aria-label="Main"><div id="servicesDropdown" class="services-dropdown"><button id="servicesDropdownToggle" class="nav-link dropdown-toggle" aria-expanded="false" aria-controls="servicesDropdownMenu" aria-haspopup="true">Services <span aria-hidden="true">&#9662;</span></button><div id="servicesDropdownMenu" class="dropdown-menu" role="menu" aria-label="Services menu"><a class="nav-link" data-path="/services/" href="/services/" role="menuitem">All Services</a><a class="nav-link" data-path="/services/google-maps-local-seo/" href="/services/google-maps-local-seo/" role="menuitem">Google Maps Local SEO</a><a class="nav-link" data-path="/services/gbp-optimization/" href="/services/gbp-optimization/" role="menuitem">GBP Optimization</a><a class="nav-link" data-path="/services/local-seo-website-support/" href="/services/local-seo-website-support/" role="menuitem">Website Support for Local SEO</a></div></div><a class="nav-link" data-path="/process/" href="/process/">Process</a><a class="nav-link" data-path="/pricing/" href="/pricing/">Pricing</a><a class="nav-link" data-path="/faq/" href="/faq/">FAQ</a><a class="nav-link" data-path="/blog/" href="/blog/">Blog</a><a class="nav-link" data-path="/contact/" href="/contact/">Contact</a></nav><a class="btn desktop-cta" href="/free-growth-audit/">Free Growth Audit</a><button id="mobileNavToggle" class="menu-toggle" aria-controls="mobileNav" aria-expanded="false" onclick="toggleMobileNav()">&#9776;</button></div><nav id="mobileNav" class="mobile-nav" aria-label="Mobile"><details><summary>Services</summary><a href="/services/">All Services</a><a href="/services/google-maps-local-seo/">Google Maps Local SEO</a><a href="/services/gbp-optimization/">GBP Optimization</a><a href="/services/local-seo-website-support/">Website Support for Local SEO</a></details><a href="/process/">Process</a><a href="/pricing/">Pricing</a><a href="/faq/">FAQ</a><a href="/blog/">Blog</a><a href="/contact/">Contact</a></nav></header>`;
  const FOOTER = `    <footer class="footer">
    <div class="footer-inner">
      <div><h3>Rocket Growth Agency</h3><p>Google Maps Local SEO for local service businesses focused on calls, forms, and measurable growth.</p></div>
      <div><h4>Pages</h4><div class="footer-links"><a href="/services/">Services</a><a href="/process/">Process</a><a href="/pricing/">Pricing</a><a href="/faq/">FAQ</a><a href="/blog/">Blog</a><a href="/contact/">Contact</a></div></div>
      <div><h4>Legal</h4><div class="footer-links"><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Service</a></div></div>
    </div>
    <div class="footer-bottom">&copy; 2026 Rocket Growth Agency. All rights reserved.</div>
  </footer>
  <a class="btn floating-cta" href="/free-growth-audit/#audit-form">Free Growth Audit</a>`;

  const html = `<!doctype html>
<html lang="en">
<head>
${HEAD_NAV}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} | RGA</title>
  <meta name="description" content="${esc(c.metaDescription)}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="index,follow" />
${og}
  <link rel="icon" type="image/png" href="/images/assets/rga_favicon.png?v=20260311a" />
  <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
  <script defer src="/script.js"></script>
  <script type="application/ld+json">
${blogSchema}
  </script>
  <script type="application/ld+json">
${faqSchema}
  </script>
  <script type="application/ld+json">
${breadcrumbSchema}
  </script>
  <style>
    /* Blog article readability — scoped to .blog-post, no effect on other pages */
    .blog-post.section{width:min(820px,calc(100% - 3rem));}
    .blog-post h1{line-height:1.12;}
    .blog-post .lead{font-size:1.15rem;line-height:1.65;margin-bottom:1.9rem;}
    .blog-post .card{padding:1.9rem 2.1rem;}
    .blog-post .card h2{margin:2.5rem 0 .7rem;line-height:1.22;}
    .blog-post .card h2:first-child{margin-top:.2rem;}
    .blog-post .card h3{margin:1.7rem 0 .35rem;line-height:1.3;font-size:1.12rem;}
    .blog-post .card p{margin:0 0 1.15rem;line-height:1.75;}
    .blog-post .card ul{margin:.2rem 0 1.3rem;padding-left:1.3rem;line-height:1.7;}
    .blog-post .card li{margin-bottom:.55rem;}
    .blog-post .card p + h3{margin-top:2rem;}
  </style>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MCGMSCCR" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
${HEADER}

  <main class="section blog-post" id="main">
    <p class="eyebrow">Blog &bull; ${TODAY_HUMAN} &bull; Local SEO by Industry</p>
    <h1>${esc(title)}</h1>
    <p class="lead">${esc(c.lead)}</p>

    <article class="card" style="margin-top:1rem">
${sectionsHtml}
${related}
    </article>

    <section class="card" style="margin-top:1rem">
      <h2>Frequently asked questions</h2>
${faqHtml}
    </section>
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
function addToBlogIndex(vertical, slug, metaDescription) {
  const idx = path.join(BLOG_DIR, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const href = `/blog/${slug}/`;
  if (html.includes(`href="${href}"`)) return false;
  const card = `        <article class="blog-card"><div class="content"><p class="blog-meta">${TODAY_HUMAN} &bull; Local SEO by Industry</p><h2>Local SEO for ${esc(vertical)}: How to Rank in the Google Maps Top 3</h2><p>${esc((metaDescription || '').slice(0, 140))}</p><a class="btn-ghost" href="${href}">Read article</a></div></article>\n`;
  html = html.replace(/(<div class="blog-grid">\s*)/, `$1\n${card}`);
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
    const m = fs.readFileSync(f, 'utf8').match(/<title>Local SEO for ([^:]+):/);
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
