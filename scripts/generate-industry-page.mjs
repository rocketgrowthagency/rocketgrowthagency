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
  const sys = `You are a conversion copywriter + local-SEO strategist for Rocket Growth Agency, an agency that does Google Maps local SEO for local service businesses. You write COMMERCIAL landing pages that convert business owners into free-audit leads — specific, credible, benefit-led, never generic or hypey.`;
  const user = `Write a COMMERCIAL service landing page: "Local SEO for ${vertical}" — RGA's done-for-you Google Maps local SEO service, tailored to ${vertical} businesses. This is NOT a how-to article; it sells the service. Speak to a ${vertical} owner's real pains (lost calls to competitors ranking above them, no time to do SEO themselves). Be specific to ${vertical}.

Return ONLY JSON:
{
 "metaDescription": "150-160 chars, commercial, specific to ${vertical}",
 "heroSub": "1-2 sentence subheadline under the H1 — the promise, specific to ${vertical}",
 "sections": [ { "heading": "H2", "paras": ["..."], "bullets": ["optional"] } ],
 "ctaHeadline": "final CTA headline (a question), references ${vertical} + ranking/leads",
 "faq": [ { "q": "...", "a": "..." } ]
}
Requirements:
- 7 to 8 sections: the problem ${vertical} owners face on Google Maps; what we do (our Maps/GBP/website work applied to ${vertical}); how it works (process/timeline); what makes results stick (the ongoing cadence we run); why ${vertical} owners choose a done-for-you partner over DIY; what's included; getting started. Conversion-focused, concrete, specific to ${vertical}.
- 3 FAQ (commercial: pricing approach, timeline, what's included — specific to ${vertical}).
- DEPTH IS MANDATORY: each section MUST have 3 full paragraphs of ~70-90 words each. Total body MUST be AT LEAST 850 words — thin output is rejected and wastes the call. Be thorough and concrete.
- Plain text only in paras/bullets/faq (no HTML/markdown). No invented precise stats; defensible general terms.`;
  const data = await openai(MODEL, [{ role: 'system', content: sys }, { role: 'user', content: user }], 4096, 0.7);
  const u = data.usage || {};
  lastUsage = { cost: (u.prompt_tokens || 0) / 1e6 * 2.5 + (u.completion_tokens || 0) / 1e6 * 10 };
  return JSON.parse(data.choices[0].message.content);
}

async function scoreDraft(vertical, c) {
  const body = (c.sections || []).map((s) => `## ${s.heading}\n${(s.paras || []).join('\n')}`).join('\n\n');
  try {
    const data = await openai('gpt-4o-mini', [{ role: 'user', content: `Strict editor: score this COMMERCIAL "Local SEO for ${vertical}" landing page 1-10 on specificity to ${vertical}, credibility, conversion strength, NOT generic. 7+ publishable. JSON only: {"score":int,"verdict":"...","issues":[]}\n\n${body.slice(0, 6000)}` }], 400, 0.2);
    const u = data.usage || {}; lastEditorCost = (u.prompt_tokens || 0) / 1e6 * 0.15 + (u.completion_tokens || 0) / 1e6 * 0.6;
    return JSON.parse(data.choices[0].message.content);
  } catch { return { score: 7, verdict: 'editor unavailable', issues: [] }; }
}

const HEADER = `  <div class="topbar"><div class="topbar-inner"><div>Google Maps Local SEO For Local Businesses</div><div class="topbar-right"><a href="tel:+14242422040" style="white-space:nowrap">Call (424) 242-2040</a></div></div></div>
  <header class="site-header"><div class="header-inner"><a href="/" class="brand"><img src="/images/assets/rga_icon-header.png?v=20260311a" alt="Rocket Growth Agency logo" /><span class="brand-text">Rocket<span class="brand-growth">Growth</span>Agency</span></a><nav class="desktop-nav" aria-label="Main"><div id="servicesDropdown" class="services-dropdown"><button id="servicesDropdownToggle" class="nav-link dropdown-toggle" aria-expanded="false" aria-controls="servicesDropdownMenu" aria-haspopup="true">Services <span aria-hidden="true">&#9662;</span></button><div id="servicesDropdownMenu" class="dropdown-menu" role="menu" aria-label="Services menu"><a class="nav-link" href="/services/" role="menuitem">All Services</a><a class="nav-link" href="/services/google-maps-local-seo/" role="menuitem">Google Maps Local SEO</a><a class="nav-link" href="/services/gbp-optimization/" role="menuitem">GBP Optimization</a><a class="nav-link" href="/services/local-seo-website-support/" role="menuitem">Website Support for Local SEO</a></div></div><a class="nav-link" href="/industries/">Industries</a><a class="nav-link" href="/process/">Process</a><a class="nav-link" href="/pricing/">Pricing</a><a class="nav-link" href="/blog/">Blog</a><a class="nav-link" href="/contact/">Contact</a></nav><a class="btn desktop-cta" href="/free-growth-audit/">Free Growth Audit</a><button id="mobileNavToggle" class="menu-toggle" aria-controls="mobileNav" aria-expanded="false" onclick="toggleMobileNav()">&#9776;</button></div><nav id="mobileNav" class="mobile-nav" aria-label="Mobile"><a href="/services/">Services</a><a href="/industries/">Industries</a><a href="/pricing/">Pricing</a><a href="/blog/">Blog</a><a href="/contact/">Contact</a></nav></header>`;
const FOOTER = `    <footer class="footer"><div class="footer-inner"><div><h3>Rocket Growth Agency</h3><p>Google Maps Local SEO for local service businesses focused on calls, forms, and measurable growth.</p></div><div><h4>Pages</h4><div class="footer-links"><a href="/services/">Services</a><a href="/industries/">Industries</a><a href="/pricing/">Pricing</a><a href="/blog/">Blog</a><a href="/contact/">Contact</a></div></div><div><h4>Legal</h4><div class="footer-links"><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Service</a></div></div></div><div class="footer-bottom">&copy; 2026 Rocket Growth Agency. All rights reserved.</div></footer>
  <a class="btn floating-cta" href="/free-growth-audit/#audit-form">Free Growth Audit</a>`;
const STYLE = `  <style>
    /* Industry LANDING page — full-width alternating bands (a marketing page, not a boxed article) */
    .ind-wrap{width:min(880px,calc(100% - 3rem));margin:0 auto;}
    .ind-hero{padding:3.6rem 0 2.4rem;background:linear-gradient(180deg,#eef2fb 0%,#ffffff 100%);}
    .ind-hero h1{line-height:1.08;margin:.35rem 0 .7rem;}
    .ind-hero .lead{font-size:1.22rem;line-height:1.55;color:var(--text-700);margin:0 0 1.4rem;max-width:60ch;}
    .ind-hero .btn{display:inline-block;}
    .ind-band{padding:2.9rem 0;border-bottom:1px solid #eef1f6;}
    .ind-band.alt{background:#f6f8fc;}
    .ind-band h2{margin:0 0 .9rem;line-height:1.2;font-size:1.6rem;}
    .ind-band p{margin:0 0 1.05rem;line-height:1.75;}
    .ind-band ul{margin:.3rem 0 1.1rem;padding-left:1.3rem;line-height:1.7;}
    .ind-band li{margin-bottom:.5rem;}
    .ind-faq h2{margin-bottom:1.2rem;}
    .ind-faq h3{margin:1.5rem 0 .35rem;font-size:1.1rem;line-height:1.3;}
    .ind-faq h3:first-of-type{margin-top:0;}
    .ind-faq p{margin:0 0 .6rem;line-height:1.7;}
    .ind-next p{margin:.2rem 0;color:var(--text-700);}
  </style>`;

function render(vertical, slug, c) {
  const url = `https://www.rocketgrowthagency.com/industries/${slug}/`;
  const V = titleCase(vertical);
  const title = `Local SEO for ${V} | Rocket Growth Agency`;
  const h1 = `Local SEO for ${V}`;
  const blogSlug = `local-seo-for-${slugify(vertical)}`;
  const hasBlog = fs.existsSync(path.join(BLOG_DIR, blogSlug, 'index.html'));
  const ogImage = 'https://www.rocketgrowthagency.com/images/assets/rga_icon-header.png';
  const wordCount = (c.sections || []).reduce((n, s) => n + (s.paras || []).join(' ').split(/\s+/).length, 0);

  const bandsHtml = (c.sections || []).map((s, i) => {
    let inner = `      <h2>${esc(s.heading)}</h2>\n` + (s.paras || []).map((p) => `      <p>${esc(p)}</p>`).join('\n');
    if (s.bullets && s.bullets.length) inner += `\n      <ul>\n` + s.bullets.map((b) => `        <li>${esc(b)}</li>`).join('\n') + `\n      </ul>`;
    return `    <section class="ind-band${i % 2 ? ' alt' : ''}"><div class="ind-wrap">\n${inner}\n    </div></section>`;
  }).join('\n');
  const crossLink = hasBlog ? `      <p><strong>Prefer the DIY playbook first?</strong> Read our free guide: <a href="/blog/${blogSlug}/">Local SEO for ${esc(vertical)} — how to rank in the Maps top 3</a>.</p>` : '';
  const faqHtml = (c.faq || []).map((f) => `      <h3>${esc(f.q)}</h3>\n      <p>${esc(f.a)}</p>`).join('\n');

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
  <link rel="stylesheet" href="/style.css" />
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

  <main id="main">
    <section class="ind-hero"><div class="ind-wrap">
      <p class="eyebrow">Industries &bull; Done-for-you local SEO</p>
      <h1>${esc(h1)}</h1>
      <p class="lead">${esc(c.heroSub)}</p>
      <a class="btn" href="/free-growth-audit/">Get Your Free Growth Audit</a>
    </div></section>
${bandsHtml}
    <section class="ind-band alt ind-faq"><div class="ind-wrap">
      <h2>Frequently asked questions</h2>
${faqHtml}
    </div></section>
    <section class="ind-band ind-next"><div class="ind-wrap">
${crossLink}
      <p><strong>Next step:</strong> <a href="/services/google-maps-local-seo/">how our Google Maps Local SEO works</a> &middot; <a href="/pricing/">pricing</a> &middot; <a href="/free-growth-audit/">free Growth Audit</a>.</p>
    </div></section>
  </main>

  <section class="cta-band"><div class="cta-band-inner"><h2>${esc(c.ctaHeadline)}</h2><a class="btn-light" href="/free-growth-audit/">Get Your Free Growth Audit</a></div></section>
${FOOTER}
</body>
</html>
` };
}

function assertQuality(html, meta) {
  const errs = [];
  if (meta.wordCount < 600) errs.push(`thin: ${meta.wordCount} words`);
  if (!html.includes('"Service"')) errs.push('missing Service schema');
  if (!html.includes('FAQPage')) errs.push('missing FAQ schema');
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
  return Object.values(seen).filter((x) => !fs.existsSync(path.join(IND_DIR, slugify(x.v)))).sort((a, b) => b.t - a.t).map((x) => x.v);
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
  <link rel="stylesheet" href="/style.css" /><script defer src="/script.js"></script>
  <style>
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
  <main class="section" id="main">
    <p class="eyebrow">Industries</p>
    <h1>Local SEO, tailored to your industry</h1>
    <p class="lead" style="max-width:62ch">We do done-for-you Google Maps local SEO for local service businesses. Find your industry to see exactly how we get you ranking in the top 3 — and the free Growth Audit that shows where you stand today.</p>
    <div class="ind-cat-grid">
${grid}
    </div>
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
    let rendered = null, runCost = 0, lastErr = null, verdict = null;
    for (let a = 1; a <= 3; a++) {
      const content = await generateContent(vertical); runCost += lastUsage.cost;
      const r = render(vertical, slug, content);
      try { assertQuality(r.html, r); } catch (qe) { lastErr = qe; process.stdout.write(`[retry ${a}: ${qe.message}] `); continue; }
      const v = await scoreDraft(vertical, content); runCost += lastEditorCost;
      if (v.score < EDITOR_MIN) { lastErr = new Error(`editor ${v.score}`); process.stdout.write(`[retry ${a}: editor ${v.score}] `); continue; }
      rendered = r; verdict = v; break;
    }
    if (!rendered) throw lastErr || new Error('failed after 3 attempts');
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
