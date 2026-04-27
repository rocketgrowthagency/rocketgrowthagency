// Month 1 onboarding playbook — executable steps.
// Source of truth for "what to do for a new client in Month 1".
// Each step is auto/manual/hybrid. Auto + hybrid have run() handlers.

import "dotenv/config";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ---- shared helpers ----
async function aiSuggest(systemPrompt, userPrompt, { maxTokens = 600 } = {}) {
  if (!openai) throw new Error("OPENAI_API_KEY not set");
  const r = await openai.chat.completions.create({
    model: process.env.GBP_AI_MODEL || "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    temperature: 0.5,
    max_tokens: maxTokens,
  });
  return r.choices?.[0]?.message?.content?.trim() || "";
}

async function fetchHomepage(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 RGA-audit/1.0" } });
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() };
}

// ---- the playbook ----
export const month1 = [
  // === Phase 1 — Kickoff & Access ===
  {
    id: "m1.kickoff.create", title: "Create client in Supabase",
    type: "auto", dependsOn: [],
    async run({ client }) {
      // Idempotent — onboard-client.mjs already ran during initial setup.
      // This step just confirms the client row exists.
      return { summary: `Client ${client.business_name} (${client.id}) exists`, outcome: "na" };
    },
  },
  {
    id: "m1.kickoff.call", title: "Schedule + run kickoff call",
    type: "manual", dependsOn: ["m1.kickoff.create"],
    instructions: `Schedule a 30-min Zoom with the primary contact.

Cover: scope, timeline (3 months to ranking results), what RGA delivers vs what client provides, weekly cadence, monthly call rhythm.

Send a recap email after with: action items, dates, what you need from them (logins, photos, customer list).

See /docs/playbooks/kickoff-call-script-template.md for full talk track.`,
  },
  {
    id: "m1.access.password_manager", title: "Set up secure access vault",
    type: "manual", dependsOn: ["m1.kickoff.call"],
    instructions: `Open the team password manager (1Password / Bitwarden / etc).
Create a new vault for this client.
Will store all client logins here. Never paste credentials in chat or email.`,
  },
  {
    id: "m1.access.gbp", title: "Get GBP manager access",
    type: "hybrid", dependsOn: ["m1.kickoff.call"],
    async run({ client }) {
      const url = client.gbp_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.business_name + " " + (client.primary_market || ""))}`;
      return { summary: `Send invite via Google Business Profile Manager → Settings → People & Access → Add → role = Manager. GBP URL: ${url}` };
    },
    instructions: `1. Open https://business.google.com → pick the client's profile
2. Settings (gear icon) → Managers → Add user
3. Email: chris@rocketgrowthagency.com (or your team email)
4. Role: Manager
5. Client must approve the invite from their email
6. Once accepted, you'll see the listing in your GBP dashboard.`,
  },
  {
    id: "m1.access.analytics", title: "Get GA4 admin access",
    type: "manual", dependsOn: ["m1.kickoff.call"],
    instructions: `Have client open GA4 → Admin (gear) → Property Access Management → "+ Add users" → your email → Role: Administrator.
If client has no GA4 yet: skip this step + flag m1.tracking.install_ga4 (we install during website work).`,
  },
  {
    id: "m1.access.search_console", title: "Get GSC owner access",
    type: "manual", dependsOn: ["m1.kickoff.call"],
    instructions: `Have client open https://search.google.com/search-console → Settings → Users and permissions → "Add user" → your email → Permission: Owner.
If no GSC yet: skip + flag m1.tracking.install_gsc.`,
  },
  {
    id: "m1.access.website", title: "Get CMS / hosting access",
    type: "manual", dependsOn: ["m1.kickoff.call"],
    instructions: `Get WordPress / Wix / Shopify admin login (preferred) OR a contributor/editor account.
Confirm SFTP / hosting credentials if you'll be making file changes.
Save all in the password manager vault.`,
  },

  // === Phase 2 — Audit & Baseline ===
  {
    id: "m1.audit.gbp_baseline", title: "Snapshot GBP current state",
    type: "auto", dependsOn: ["m1.access.gbp"],
    async run({ client, getGbp }) {
      try {
        const gbp = await getGbp();
        const profile = await gbp.getProfile();
        return {
          summary: `Captured GBP profile: ${profile.title}, ${profile.categories?.primaryCategory?.displayName}`,
          outcome_data: {
            title: profile.title,
            primary_category: profile.categories?.primaryCategory?.displayName,
            additional_categories: (profile.categories?.additionalCategories || []).map((c) => c.displayName),
            phone: profile.phoneNumbers?.primaryPhone,
            website: profile.websiteUri,
          },
        };
      } catch (e) {
        return { summary: `OAuth not connected yet — using public data fallback. Manually capture GBP rating + review_count from ${client.gbp_url}`, outcome: "manual_required" };
      }
    },
  },
  {
    id: "m1.audit.website", title: "Run on-page SEO audit",
    type: "auto", dependsOn: ["m1.kickoff.create"],
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url on client record — skip or fill it in", outcome: "skipped" };
      const { status, body } = await fetchHomepage(client.website_url);
      const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
      const h1Match = body.match(/<h1[^>]*>([^<]*)<\/h1>/i);
      const metaDesc = body.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
      const hasSchema = /application\/ld\+json/i.test(body);
      const hasGA4 = /G-[A-Z0-9]{6,}/.test(body) || /gtag\/js/.test(body);
      const hasViewport = /<meta\s+name=["']viewport["']/i.test(body);
      const sizeKb = Math.round(body.length / 1024);
      return {
        summary: `Audited ${client.website_url}: ${status}, title="${titleMatch?.[1]?.slice(0, 50)}", H1="${h1Match?.[1]?.slice(0, 50)}", schema=${hasSchema}, GA4=${hasGA4}, ${sizeKb}KB`,
        outcome_data: {
          http_status: status, title: titleMatch?.[1], h1: h1Match?.[1], meta_description: metaDesc?.[1],
          has_schema: hasSchema, has_ga4: hasGA4, has_viewport_meta: hasViewport, html_size_kb: sizeKb,
        },
      };
    },
  },
  {
    id: "m1.audit.competitors", title: "Snapshot top 3 SF/local competitors",
    type: "hybrid", dependsOn: ["m1.kickoff.create"],
    async run({ client }) {
      // Stub — relies on existing scraper output. Real implementation would call step-1-maps-scraper for the search term.
      return { summary: `Run \`node step-1-maps-scraper.cjs\` for "${client.primary_service} in ${client.primary_market}", then capture top 5 competitors into onboarding fields 4.23-4.40.` };
    },
    instructions: `After the scrape: eyeball the top 5 results with the client. Confirm they're real direct competitors (not aggregator listings like Yelp or HomeAdvisor).`,
  },
  {
    id: "m1.strategy.keywords_locations", title: "Lock 3-5 primary keywords + 3 sub-locations",
    type: "hybrid", dependsOn: ["m1.audit.competitors"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You are a local SEO strategist. Suggest exactly 5 primary keywords and 3 sub-location targets for the business below. Return as YAML with keys 'keywords' (array of 5 strings) and 'locations' (array of 3 strings — sub-neighborhoods of the primary market). Plain text only, no commentary.`,
        `Business: ${client.business_name}\nPrimary service: ${client.primary_service}\nPrimary market: ${client.primary_market}`,
        { maxTokens: 300 },
      );
      return { summary: `AI keyword + location suggestions:\n${draft}` };
    },
    instructions: `Review the AI suggestions above. Confirm or override the 5 keywords + 3 sub-locations. These drive everything downstream — get them right.
When confirmed, run: node flow.mjs <client_id> done m1.strategy.keywords_locations`,
  },
  {
    id: "m1.audit.grid_baseline", title: "Run 9x9 grid scan baseline",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations"],
    async run({ client, clientId }) {
      const cmd = `node grid-scan.mjs --client=${clientId} --keyword="<your-keyword>" --radius=5 --zoom=14`;
      return {
        summary: `Run grid-scan.mjs for each tracked keyword (one at a time, ~1 hour per scan).
Example: ${cmd}

Resumable — same --client + --keyword + --session= will continue an interrupted scan.
Output: avg rank, top-3 coverage %, ASCII heatmap, all 81 points saved to client_keyword_rankings with grid_session_id.

After scan: run again per remaining keyword.`,
      };
    },
    instructions: `Per tracked keyword (from m1.strategy.keywords_locations):
1. Open the scraper VS Code repo terminal
2. Run: node grid-scan.mjs --client=<client_id> --keyword="<keyword>"
3. Wait ~1 hour (81 points × ~45s each)
4. Note avg rank + top-3 coverage % from output
5. Repeat for each tracked keyword (recommend 1/day to avoid Google rate-limit)`,
  },
  {
    id: "m1.audit.kpi_baseline", title: "Capture baseline KPIs",
    type: "manual", dependsOn: ["m1.access.analytics", "m1.access.search_console"],
    instructions: `Pull last 30 days from GA4 + GSC + GBP Insights. Fill onboarding section 10.0:
- Total leads, calls, form leads, GBP calls/clicks/directions/views
- Organic sessions + impressions
- Review count + rating
- Priority keywords in top 3 / top 10
- Conversion rate, revenue from tracked leads`,
  },
  {
    id: "m1.audit.citations", title: "Run citation audit",
    type: "hybrid", dependsOn: ["m1.audit.gbp_baseline"],
    async run({ client }) {
      // For each top directory, do a Google search for "<business name> site:<directory>" — checks if a listing exists
      const directories = [
        { name: "Yelp", host: "yelp.com" },
        { name: "BBB", host: "bbb.org" },
        { name: "YellowPages", host: "yellowpages.com" },
        { name: "Foursquare", host: "foursquare.com" },
        { name: "Bing Places", host: "bingplaces.com" },
        { name: "Apple Maps", host: "maps.apple.com" },
        { name: "Nextdoor", host: "nextdoor.com" },
        { name: "Angie", host: "angi.com" },
        { name: "Thumbtack", host: "thumbtack.com" },
        { name: "HomeAdvisor", host: "homeadvisor.com" },
      ];
      const checks = directories.map((d) => {
        const q = `"${client.business_name}" site:${d.host}`;
        return `${d.name.padEnd(15)} https://www.google.com/search?q=${encodeURIComponent(q)}`;
      }).join("\n  ");
      return {
        summary: `Citation audit links — open each, check if listing exists + if NAP matches:\n\n  ${checks}\n\nFor each directory: insert/update row in client_citations { directory_name, status: 'found'|'missing'|'wrong_nap', listing_url, nap_match }.\n\nNAP must match the canonical from m1.web.nap_consistency exactly. Even minor differences (suite vs ste, dashes in phone) hurt rankings.`,
        outcome_data: { directories_to_audit: directories.length },
      };
    },
    instructions: `Click through each Google search link above. For each:
1. If found + NAP matches → status='found', record listing_url, nap_match=true
2. If found + NAP wrong → status='wrong_nap', record what's wrong, fix it
3. If not found → status='missing', plan to claim/create in m1.cit.priority_top10
Fill onboarding section 11.0 with the audit summary.`,
  },

  // === Phase 3 — GBP Foundation ===
  {
    id: "m1.gbp.verify", title: "Ensure GBP is claimed + verified",
    type: "manual", dependsOn: ["m1.access.gbp"],
    instructions: `Confirm green check next to business in GBP dashboard.
If unverified: trigger postcard or video verification from inside GBP. Block on this until done — nothing else GBP-related works without verification.`,
  },
  {
    id: "m1.gbp.optimize_categories", title: "Lock primary + secondary categories",
    type: "hybrid", dependsOn: ["m1.gbp.verify", "m1.audit.competitors"],
    async run({ client, getGbp }) {
      const draft = await aiSuggest(
        `You are a Google Business Profile optimizer. Suggest the BEST primary GBP category for the business below, plus 5-9 additional categories. Return as YAML with 'primary' (string — e.g. "Pest Control Service") and 'additional' (array of 5-9 strings). Plain text only.`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 300 },
      );
      let lookupResult = "";
      try {
        const gbp = await getGbp();
        const term = client.primary_service?.split(/[\/,]/)[0]?.trim() || "";
        const found = await gbp.searchCategories(term);
        const list = (found?.categories || []).slice(0, 10).map((c) => `  ${c.name} → ${c.displayName}`).join("\n");
        lookupResult = `\n\nGBP API category lookup for "${term}":\n${list}`;
      } catch (e) {
        lookupResult = `\n\n(GBP API not connected — can't look up exact category resource names yet)`;
      }
      return { summary: `AI suggested categories:\n${draft}${lookupResult}` };
    },
    instructions: `Pick final primary + additional categories from the suggestions above. To set them via API once OAuth is done:
  node -e "import('./lib/gbp-automation.mjs').then(m => m.gbpFor('<client_id>').then(g => g.updateCategories({primary:'categories/gcid:<id>', additional:['categories/gcid:<id>']})))"
Or set manually in GBP dashboard → Edit profile → Business category.`,
  },
  {
    id: "m1.gbp.services_products", title: "Add services + products",
    type: "hybrid", dependsOn: ["m1.gbp.optimize_categories"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You are a GBP services optimizer. Suggest 8-15 services for this business. Each service: short displayName + 1-sentence description. Return as YAML list with keys displayName + description. No prices unless obvious.`,
        `Business: ${client.business_name}\nPrimary service: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 600 },
      );
      return { summary: `AI-drafted services:\n${draft}` };
    },
    instructions: `Review/edit the draft services. Add via GBP dashboard → Edit profile → Services, OR via API:
  gbp.updateServices([{ displayName: "...", description: "..." }, ...])`,
  },
  {
    id: "m1.gbp.business_description", title: "Write compelling description",
    type: "hybrid", dependsOn: ["m1.gbp.optimize_categories"],
    async run({ client, getGbp }) {
      const { draftBusinessDescription } = await import("../../lib/gbp-content-ai.mjs");
      const draft = await draftBusinessDescription({
        businessName: client.business_name, primaryService: client.primary_service, primaryMarket: client.primary_market,
      });
      return { summary: `AI-drafted description (${draft.length} chars):\n\n${draft}` };
    },
    instructions: `Review/edit the description above (HARD LIMIT 750 chars). Save via GBP dashboard, OR via API:
  gbp.updateDescription("<text>")`,
  },
  {
    id: "m1.gbp.photos", title: "Upload 20+ quality photos",
    type: "manual", dependsOn: ["m1.gbp.verify"],
    instructions: `Upload to GBP: logo, cover, 5 team, 5 work-in-progress, 5 finished-job results, 3 truck/equipment, 2 office.
Geotag if possible. Add captions with keywords.
Once OAuth is connected: gbp.uploadPhoto(sourceUrl, "ADDITIONAL") batch from /data/clients/<slug>/photos/`,
  },
  {
    id: "m1.gbp.hours_attributes", title: "Confirm hours + attributes",
    type: "manual", dependsOn: ["m1.gbp.verify"],
    instructions: `Set regular hours, holiday hours, special hours.
Add relevant attributes (Veteran-owned, Identifies as women-owned, Wheelchair accessible, etc).
Once OAuth: gbp.updateHours([{openDay:"MONDAY",openTime:{hours:9},closeDay:"MONDAY",closeTime:{hours:17}},...])`,
  },
  {
    id: "m1.gbp.messaging", title: "Enable GBP messaging + set response SLA",
    type: "hybrid", dependsOn: ["m1.gbp.verify"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You write GBP messaging welcome messages. Output 2 versions: (1) short business-hours greeting, (2) after-hours auto-reply. Each: warm, specific to the service, sets expectation on response time, ends with a question to keep them engaged. NO emojis. Plain prose, 1-2 sentences each.`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 250 },
      );
      return { summary: `AI welcome message drafts:\n\n${draft}` };
    },
    instructions: `GBP → Edit Profile → Messaging → Turn ON. Paste the business-hours version as your welcome.
Set notifications to push to phone/email — Google rewards <30 min response during 8a-8p.`,
  },
  {
    id: "m1.gbp.booking_link", title: "Add appointment booking URL",
    type: "manual", dependsOn: ["m1.gbp.business_description"],
    instructions: `GBP → Edit Profile → Bookings → Add booking link.
Use Calendly, Acuity, or website's contact form URL with UTM tag (?utm_source=gbp&utm_medium=booking).
Direct booking from GBP shortcuts the buyer journey by 1+ steps.`,
  },
  {
    id: "m1.gbp.attributes", title: "Fill ALL relevant GBP attributes",
    type: "manual", dependsOn: ["m1.gbp.verify"],
    instructions: `GBP → Edit Profile → Edit your business → Highlights / From the business / Service options.
Check ALL that apply: women/veteran/LGBTQ+/family-owned, online estimates, on-site, same-day, emergency hours, payment methods, accessibility, crowd, health & safety.
Most businesses miss 60%+ of attributes. Each = a ranking opportunity.`,
  },
  {
    id: "m1.gbp.qa_seed", title: "Seed Q&A with top-ask questions",
    type: "hybrid", dependsOn: ["m1.gbp.business_description"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You generate Google Business Profile Q&A pairs. Output 8 question + answer pairs that real customers of this business commonly ask. Format strictly:
Q: <question>
A: <2-3 sentence answer with phone/website CTA where natural>

Vary the questions: pricing, service area, response time, qualifications, what to expect, emergency availability, payment methods, what's included. NO emojis. Concrete + helpful.`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nPhone: ${client.primary_contact_phone || "(your phone)"}`,
        { maxTokens: 900 },
      );
      return { summary: `AI Q&A pairs (post each from your own account, then answer immediately):\n\n${draft}` };
    },
    instructions: `Open GBP → Q&A tab. For each Q above:
1. Click "Ask a question" (post it from YOUR personal account)
2. Immediately answer it from the business profile
3. Repeat for all 8`,
  },

  // === Phase 4 — Website Foundation ===
  {
    id: "m1.web.homepage_meta", title: "Optimize homepage title + meta",
    type: "hybrid", dependsOn: ["m1.audit.website"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You write SEO titles + meta descriptions. Output exactly:
TITLE: <60 chars max — format: <Primary Service> in <City> | <Brand Name>>
META: <155 chars max — USP + CTA>`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 200 },
      );
      return { summary: `AI-drafted title + meta:\n${draft}` };
    },
    instructions: `Update homepage <title> + <meta name="description"> in your CMS. Verify in browser source view.`,
  },
  {
    id: "m1.web.h1_cta", title: "Fix H1 + primary CTA",
    type: "hybrid", dependsOn: ["m1.audit.website"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You write homepage H1 + above-fold CTA copy. Output:
H1: <60 char max — primary service + city, conversion-focused>
SUB: <single sentence USP — what makes them different>
PRIMARY_CTA: <button text, 2-4 words, action verb>
SECONDARY_CTA: <click-to-call format: "Call (xxx) xxx-xxxx now">
TRUST_BADGES: <3 short phrases — e.g. "Licensed & Insured", "5★ rated", "Same-day service">`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nPhone: ${client.primary_contact_phone || ""}`,
        { maxTokens: 250 },
      );
      return { summary: `AI homepage above-fold copy:\n\n${draft}` };
    },
    instructions: `Update homepage hero in CMS:
1. H1 element → AI's H1
2. Sub-headline → AI's SUB
3. Primary button (link to contact form) → AI's PRIMARY_CTA
4. Secondary CTA (tel: link) → AI's SECONDARY_CTA
5. Trust badge row → AI's TRUST_BADGES
Test on mobile (Chrome DevTools → device toolbar).`,
  },
  {
    id: "m1.web.nap_consistency", title: "Match NAP across header/footer/contact",
    type: "manual", dependsOn: ["m1.audit.website"],
    instructions: `Header + footer + contact page = identical Name, Address, Phone.
Use the canonical NAP from GBP. Critical for citation consistency — if these don't match, citation cleanup later won't help.`,
  },
  {
    id: "m1.web.schema", title: "Add LocalBusiness schema",
    type: "auto", dependsOn: ["m1.web.nap_consistency"],
    async run({ client }) {
      const schema = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: client.business_name,
        url: client.website_url,
        telephone: client.primary_contact_phone,
        address: { "@type": "PostalAddress", addressLocality: (client.primary_market || "").split(",")[0] },
        areaServed: client.primary_market,
        description: `${client.primary_service} serving ${client.primary_market}`,
      };
      const snippet = `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`;
      return { summary: `Generated LocalBusiness JSON-LD:\n\n${snippet}\n\nPaste in <head> of homepage. Test at https://validator.schema.org` };
    },
  },
  {
    id: "m1.web.tracking", title: "Verify GA4 + GSC + tag tracking",
    type: "auto", dependsOn: ["m1.audit.website"],
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url" };
      const { body } = await fetchHomepage(client.website_url);
      const ga4Match = body.match(/G-([A-Z0-9]{6,})/);
      const gscMeta = body.match(/<meta\s+name=["']google-site-verification["']\s+content=["']([^"']+)["']/i);
      const ok = ga4Match && gscMeta;
      return {
        summary: `Tracking check: GA4=${ga4Match ? `G-${ga4Match[1]}` : "MISSING"}, GSC verification=${gscMeta ? "present" : "MISSING"}`,
        outcome: ok ? "verified" : "missing_tags",
        outcome_data: { ga4_id: ga4Match?.[0], gsc_token: gscMeta?.[1] },
      };
    },
  },
  {
    id: "m1.web.priority_pages", title: "Build/update top 3 service pages",
    type: "hybrid", dependsOn: ["m1.web.schema"],
    async run({ client }) {
      const services = client.primary_service?.split(/[,\/]/).map((s) => s.trim()).filter(Boolean).slice(0, 3) || [];
      if (!services.length) return { summary: `No services parsed from client.primary_service. Set it like "Service A, Service B, Service C" first.` };
      const drafts = [];
      for (const svc of services) {
        const draft = await aiSuggest(
          `You write SEO-optimized service-page outlines. Output a complete page outline ready for a writer to flesh out:
H1: <Primary keyword: service + city>
META_TITLE: <60 chars>
META_DESC: <155 chars>
INTRO: <2 paragraphs — pain point + USP, weave keyword naturally>
SERVICE_DETAILS: <bullet list of 5-8 specifics>
PROCESS: <numbered steps, 4-6 items>
PRICING: <plain-language pricing or "Pricing: free estimate" if not appropriate>
WHY_US: <3 differentiators>
FAQ: <5 Q&A pairs targeting long-tail keywords>
CTA: <button text + tel: link copy>
INTERNAL_LINKS: <suggest 3 anchor texts pointing to homepage / location pages / blog>`,
          `Business: ${client.business_name}\nService for THIS page: ${svc}\nCity/Market: ${client.primary_market}`,
          { maxTokens: 1200 },
        );
        drafts.push(`=== Service Page: ${svc} in ${client.primary_market} ===\n\n${draft}`);
      }
      return { summary: drafts.join("\n\n———————————\n\n") };
    },
    instructions: `For each service page outline above:
1. Create page in CMS with the H1, meta_title, meta_desc
2. Flesh out the INTRO + SERVICE_DETAILS sections with real client info (specific job examples, before/after, real process)
3. Add a photo at the top + 1-2 throughout
4. Add the FAQ schema snippet (auto-generated by m1.web.expanded_schema)
5. Add the internal links with the suggested anchor texts
6. Publish, save URL`,
  },
  {
    id: "m1.web.location_pages", title: "Build location-targeted pages",
    type: "hybrid", dependsOn: ["m1.web.priority_pages"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You write SEO location pages. The PRIMARY market is provided. Suggest 3 sub-locations within the market AND draft a unique location page outline for each. Each outline must avoid template-feel — reference real neighborhood landmarks, ZIPs, demographic context.

Format per location:
=== <Sub-location> ===
H1: <Service in Sub-location>
META_TITLE / META_DESC
LOCAL_INTRO: <2 paragraphs that ONLY make sense for this neighborhood — landmarks, demographic context, neighborhood quirks>
ZIPS_SERVED: <list>
LOCAL_LANDMARKS_TO_MENTION: <3-5>
LOCAL_TESTIMONIAL_PROMPT: <fake-but-believable customer quote that sounds local>
SERVICE_FIT: <how the primary service applies to THIS area's specific issues>
LOCAL_FAQ: <3 Q&A specific to this neighborhood>
INTERNAL_LINKS: <3 anchor + target page suggestions>

Generate for 3 distinct sub-locations.`,
        `Business: ${client.business_name}\nPrimary service: ${client.primary_service}\nPrimary market: ${client.primary_market}`,
        { maxTokens: 1500 },
      );
      return { summary: draft };
    },
    instructions: `For each location page outline:
1. Build page in CMS at slug /<service>-<sub-location>
2. Use the LOCAL_INTRO verbatim, then add 2-3 paragraphs of REAL detail (actual jobs done in the area, photos)
3. Embed Google Maps iframe centered on that neighborhood
4. Replace the LOCAL_TESTIMONIAL_PROMPT with a real customer testimonial from that area (or similar)
5. Add internal links per suggestions
NEVER copy-paste the same content across location pages — Google penalizes.`,
  },
  {
    id: "m1.web.blog_seed", title: "Publish 2 seed blog posts (full draft)",
    type: "hybrid", dependsOn: ["m1.web.priority_pages", "m1.strategy.keywords_locations"],
    async run({ client }) {
      const drafts = [];
      const angles = [
        { kind: "educational with local angle", min: 1500 },
        { kind: "niche local authority — answers a specific local pain", min: 1500 },
      ];
      for (const a of angles) {
        const draft = await aiSuggest(
          `You write FULL long-form local SEO blog posts. Output the COMPLETE post (not an outline):
TITLE: <60 char SEO title>
META_DESC: <155 char>
SLUG: <kebab-case>
H1: <repeated title or longer keyword variation>
INTRO: <opening hook — 2-3 paragraphs, mentions city/neighborhood early>
H2: <first major section> + 3-5 paragraphs body
H2: <second major section> + 3-5 paragraphs body
H2: <third major section> + 3-5 paragraphs body
H2: FAQ
  Q&A x 5 (long-tail keyword variations as questions)
H2: Conclusion + CTA
INTERNAL_LINKS: <list 3 anchor + target — link to service pages + location pages from m1.web.*>

WRITE THE FULL TEXT. Min ${a.min} words across the body. Voice: knowledgeable, conversational, specific (real numbers, real locations, real anecdotes). Avoid generic SEO-fluff phrases. Mention the city + neighborhood naturally throughout.`,
          `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nAngle: ${a.kind}`,
          { maxTokens: 3500 },
        );
        drafts.push(draft);
      }
      return { summary: `2 full blog post drafts (paste into CMS, light-edit, publish):\n\n=== POST 1 ===\n\n${drafts[0]}\n\n\n=== POST 2 ===\n\n${drafts[1]}` };
    },
    instructions: `For each AI draft:
1. Light-edit (the draft is ~80% there — add 1-2 specific real-job examples from the client's recent work)
2. Add 1-2 photos (geotagged + alt-tagged per m1.web.image_seo)
3. Apply BlogPosting + FAQPage schema (auto-generated by m1.web.expanded_schema)
4. Add the 3 internal links the AI suggested
5. Publish, capture URL in onboarding section 13.5`,
  },
  {
    id: "m1.web.image_seo", title: "Image SEO: filenames + alt + geotag",
    type: "hybrid", dependsOn: ["m1.gbp.photos", "m1.web.priority_pages"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You generate image-SEO naming conventions for a local service business. Output:
FILENAME_TEMPLATE: <kebab-case pattern using placeholders, e.g. {service}-{location}-{descriptor}-{n}.jpg>
ALT_TAG_TEMPLATE: <complete sentence with placeholders, ~10-15 words>

THEN provide 12 example filenames + alt tags split across categories:
- Cover photo (1)
- Logo (1)
- Team photos (2)
- Truck/equipment (2)
- Job in progress (3)
- Job completed (3)

Each example: actual filename + actual alt-tag string ready to copy.`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nCity/Market: ${client.primary_market}\nKeyword stem (use in alts): ${client.primary_service?.split(/[\/,]/)[0]?.toLowerCase().trim()}`,
        { maxTokens: 700 },
      );
      return { summary: `Image-SEO naming kit:\n\n${draft}\n\nWorkflow per photo: rename to template → add alt tag → compress at squoosh.app → keep iPhone EXIF intact (don't strip) → upload.` };
    },
    instructions: `Apply to ALL future uploads (GBP + website):
1. Rename file using FILENAME_TEMPLATE
2. Add ALT_TAG_TEMPLATE in CMS image properties
3. Geotag intact (iPhone preserves automatically; if stripped, use https://exiftool.org/)
4. Compress at squoosh.app or tinypng.com → target <200KB`,
  },
  {
    id: "m1.web.internal_linking", title: "Build silo internal-link architecture",
    type: "manual", dependsOn: ["m1.web.priority_pages", "m1.web.location_pages"],
    instructions: `Hub-and-spoke:
- Homepage → all service pages
- Each service page → relevant location pages, 2 blogs, contact
- Location pages → service pages relevant to that area, contact, homepage
- Blog posts → 1-2 most relevant service pages, 1-2 location pages
Use descriptive anchor text (NOT "click here"). Anchor = keyword.`,
  },
  {
    id: "m1.web.core_web_vitals", title: "Fix Core Web Vitals",
    type: "auto", dependsOn: ["m1.audit.website"],
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url" };
      // PageSpeed Insights API — no key needed for low volume but rate-limited
      const u = encodeURIComponent(client.website_url);
      const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${u}&strategy=mobile&category=performance`);
      if (!r.ok) return { summary: `PSI failed (${r.status})`, outcome: "psi_error" };
      const data = await r.json();
      const lcp = data?.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue;
      const cls = data?.lighthouseResult?.audits?.["cumulative-layout-shift"]?.displayValue;
      const tbt = data?.lighthouseResult?.audits?.["total-blocking-time"]?.displayValue;
      const score = data?.lighthouseResult?.categories?.performance?.score;
      return {
        summary: `Mobile PSI: score=${Math.round((score || 0) * 100)}/100, LCP=${lcp}, CLS=${cls}, TBT=${tbt}`,
        outcome_data: { mobile_score: score, lcp, cls, tbt },
      };
    },
  },
  {
    id: "m1.web.expanded_schema", title: "Add Service + FAQPage + Breadcrumb schema",
    type: "hybrid", dependsOn: ["m1.web.schema", "m1.web.priority_pages"],
    async run({ client }) {
      const services = client.primary_service?.split(/[,\/]/).map((s) => s.trim()).filter(Boolean) || [];
      const snippets = services.slice(0, 3).map((svc) => ({
        "@context": "https://schema.org",
        "@type": "Service",
        serviceType: svc,
        provider: { "@type": "LocalBusiness", name: client.business_name },
        areaServed: client.primary_market,
      }));
      return { summary: `Generated Service schema for ${snippets.length} services. Paste each into corresponding service page <head>.\n\n${JSON.stringify(snippets, null, 2)}` };
    },
    instructions: `Also add: FAQPage schema (5+ Q&A per service page → rich snippets), BreadcrumbList schema, AggregateRating (if reviews exist).
Test all at https://search.google.com/test/rich-results`,
  },

  // === Phase 5 — Citations + Reviews ===
  {
    id: "m1.cit.priority_top10", title: "Build top-10 priority citations",
    type: "hybrid", dependsOn: ["m1.web.nap_consistency", "m1.audit.citations"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You generate canonical NAP + business descriptions for citation building. The SAME copy is pasted into 10+ directories — consistency is critical.

Output:

== CANONICAL NAP (use EXACTLY this on every directory) ==
NAME: <exactly the legal/dba name>
ADDRESS: <street / city, state ZIP — full format>
PHONE: <(xxx) xxx-xxxx format>
WEBSITE: <full https URL with no trailing slash>

== DESCRIPTION VARIANTS ==
SHORT (50 char): <for Foursquare/Twitter-style listings>
MEDIUM (160 char): <for Yelp/BBB tagline>
LONG (500 char): <for full directory pages>

== HOURS (paste verbatim) ==
<format that works across all directories>

== CATEGORIES (per-directory) ==
YELP: <best primary + 2 secondary on Yelp's taxonomy>
BBB: <best industry classification on BBB's taxonomy>
ANGI/THUMBTACK: <best service type>
APPLE_MAPS: <best apple categories>
BING: <best bing categories>

== KEYWORDS TO USE IN ALL TAGLINES ==
<5-7 keywords that should appear naturally in any directory's "tags" or "tagline" field>

== DIRECTORIES PRIORITY LIST (sequenced) ==
1-10 in order of impact for THIS vertical, with signup URL + ~time to claim`,
        `Business: ${client.business_name}\nLegal/DBA: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nPhone: ${client.primary_contact_phone || "(your phone)"}\nWebsite: ${client.website_url || ""}`,
        { maxTokens: 1400 },
      );
      return { summary: `Citation-building canonical pack — copy/paste this EXACTLY into all 10 directories:\n\n${draft}` };
    },
    instructions: `Work down the directory list. For each:
1. Sign up → paste NAP + DESCRIPTION (use the right length per directory's char limit)
2. Pick CATEGORIES from the per-directory list above
3. Add hours + photos
4. Insert row in client_citations: { directory_name, listing_url, status: 'live', nap_match: true }
Aim for 1-2 citations per day for 5-7 days. Consistent NAP across all = the entire point.`,
  },
  {
    id: "m1.cit.industry_specific", title: "Build industry-specific citations",
    type: "hybrid", dependsOn: ["m1.cit.priority_top10"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You suggest industry-specific citation directories for a local business. The top-10 generic ones (Yelp, BBB, etc.) are already done — now suggest VERTICAL-specific ones.

Output 8-12 vertical-specific directories for THIS business's industry. Per directory:
NAME / URL / WHY (1 sentence: what's the audience, why does this matter for ranking) / SIGNUP_DIFFICULTY (1-5) / TYPICAL_TIME_TO_LIVE (days)

Order by impact (highest first). Include any state/regional industry boards relevant to the market.`,
        `Business: ${client.business_name}\nIndustry: ${client.primary_service}\nMarket: ${client.primary_market}\nState (parse from market): ${(client.primary_market || "").split(",")[1]?.trim() || "?"}`,
        { maxTokens: 900 },
      );
      return { summary: `Industry-specific citation directories:\n\n${draft}\n\nAdd each to client_citations as you complete them.` };
    },
    instructions: `Work through the list. For each:
1. Sign up → use the canonical NAP from m1.cit.priority_top10
2. Verify (often phone/postcard)
3. Insert row in client_citations: { directory_name, vertical: 'industry_specific', listing_url, status }`,
  },
  {
    id: "m1.platform.bing_apple", title: "Set up Bing Places + Apple Business Connect",
    type: "manual", dependsOn: ["m1.web.nap_consistency", "m1.gbp.verify"],
    instructions: `Bing Places (https://www.bingplaces.com/): Create account → Import from Google → verify by phone.
Apple Business Connect (https://businessconnect.apple.com/): Claim listing → verify → add hours, photos, services.
Free + ~10% combined market share.`,
  },
  {
    id: "m1.gbp.knowledge_panel", title: "Claim + optimize brand knowledge panel",
    type: "manual", dependsOn: ["m1.gbp.verify", "m1.web.expanded_schema"],
    instructions: `Search the brand name in Google. Knowledge panel on right = brand authority.
Claim via "Suggest an edit" → "Claim this business" if not already.
Ensure: logo, founded date, website, social links, services all populated.`,
  },
  {
    id: "m1.web.service_location_matrix", title: "Build service × location matrix pages",
    type: "hybrid", dependsOn: ["m1.web.priority_pages", "m1.web.location_pages", "m1.strategy.keywords_locations"],
    async run({ client }) {
      const services = (client.primary_service?.split(/[,\/]/).map((s) => s.trim()).filter(Boolean) || []).slice(0, 3);
      if (services.length < 2) return { summary: "Set client.primary_service like 'A, B, C' first." };
      const draft = await aiSuggest(
        `You build service×location matrix pages — these capture long-tail "service in neighborhood" queries.

Given 3 services + 3 sub-locations within the primary market, output 9 page outlines. Each must be GENUINELY UNIQUE — different photos suggested, different angle, neighborhood-specific intro, neighborhood-specific testimonial prompt, neighborhood-specific FAQ.

Per outline:
=== <Service> in <Sub-location> ===
SLUG: /<service-slug>-<sublocation-slug>
H1: <Service> in <Sub-location>, <City>
META_TITLE / META_DESC
LOCAL_INTRO (2 paragraphs — references neighborhood + this specific service)
WHY_THIS_AREA_NEEDS_THIS_SERVICE (3 bullets specific to the neighborhood's known issues)
PROCESS (4-6 steps — MAY differ per service)
LOCAL_TESTIMONIAL_PROMPT
NEIGHBORHOOD_FAQ (3 Q&A specific to this combo)
INTERNAL_LINKS (3 anchors)

Pick 3 sub-locations within ${client.primary_market} that would have meaningfully different demand patterns.`,
        `Business: ${client.business_name}\nServices: ${services.join(", ")}\nPrimary market: ${client.primary_market}`,
        { maxTokens: 3000 },
      );
      return { summary: `9-page matrix outline:\n\n${draft}` };
    },
    instructions: `Build all 9 pages in CMS. Each MUST be unique — DO NOT spin same content with city name swap (Google penalizes).
1. Use the AI outline as skeleton, replace LOCAL_TESTIMONIAL_PROMPT with real testimonials from that area
2. Add 1-2 photos per page that are actually from that area
3. Apply Service + Place + FAQPage schema
4. Internal-link the 3 anchors per page
Once published, capture URLs in onboarding section 13.x`,
  },
  {
    id: "m1.web.https_sitemap", title: "Verify HTTPS + sitemap submission",
    type: "auto", dependsOn: ["m1.web.priority_pages", "m1.web.location_pages"],
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url" };
      const httpsOk = client.website_url.startsWith("https://");
      const robotsRes = await fetch(client.website_url.replace(/\/$/, "") + "/robots.txt").catch(() => ({ ok: false, status: 0 }));
      const sitemapRes = await fetch(client.website_url.replace(/\/$/, "") + "/sitemap.xml").catch(() => ({ ok: false, status: 0 }));
      return {
        summary: `HTTPS=${httpsOk}, /robots.txt=${robotsRes.status}, /sitemap.xml=${sitemapRes.status}`,
        outcome: httpsOk && sitemapRes.ok ? "ok" : "needs_fix",
      };
    },
  },
  {
    id: "m1.brand.youtube_setup", title: "Create YouTube channel for video SEO",
    type: "hybrid", dependsOn: ["m1.kickoff.call"],
    async run({ client }) {
      const draft = await aiSuggest(
        `You write YouTube channel kickoff packages. Output:
CHANNEL_NAME: <brand name as shown>
CHANNEL_DESCRIPTION: <250 char — what + where + who serves>
CHANNEL_KEYWORDS: <comma-separated 10 tags>
LINKS_FOR_BANNER: <suggest exactly: website, GBP listing, phone tel:>

THEN write FULL scripts (60-90 seconds spoken time = ~150 words) for the first 2 videos:

VIDEO 1 — "Welcome / Who We Are"
  TITLE: <50 char with keyword + city>
  DESCRIPTION: <450 char — first 150 visible above fold; include website + phone + 3 hashtags>
  HOOK: <first 5 seconds — must grab attention>
  SCRIPT: <full word-for-word script, ~150 words, conversational tone>
  CTA: <closing line directing viewer to website or call>
  TAGS: <12 comma-separated>

VIDEO 2 — "Educational tip about a common problem"
  Same structure. Pick a real local problem (e.g. for pest in SF: "How to tell if you have rats in your SF home")`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nPhone: ${client.primary_contact_phone || ""}\nWebsite: ${client.website_url || ""}`,
        { maxTokens: 1400 },
      );
      return { summary: `AI YouTube channel kickoff:\n\n${draft}` };
    },
    instructions: `1. youtube.com → top-right avatar → "Create a channel" → use CHANNEL_NAME
2. Customization → Branding → upload brand logo + create banner (1546 × 423 with phone + website + tagline)
3. Customization → Basic info → paste CHANNEL_DESCRIPTION + CHANNEL_KEYWORDS + LINKS
4. Record both videos using the AI scripts (phone vertical OK for vid 2 / horizontal recommended for vid 1)
5. Title/description/tags exactly as drafted. Geotag if uploading from phone.
6. Embed both videos on website homepage + service page`,
  },
  {
    id: "m1.review.system", title: "Set up review acquisition system",
    type: "hybrid", dependsOn: ["m1.gbp.verify"],
    async run({ client }) {
      // Try to extract place ID for review link
      const placeIdMatch = client.gbp_url?.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
      const reviewLink = placeIdMatch
        ? `https://search.google.com/local/writereview?placeid=${placeIdMatch[1]}`
        : `(Could not auto-generate — go to https://supple.com.au/tools/google-review-link-generator/ and paste the GBP URL)`;

      const draft = await aiSuggest(
        `You write review-request templates. Output 5 different versions, each warm + specific to the service. Each must be brief (SMS-length where marked). Use {{first_name}} placeholder for personalization.

SMS_1 (sent right after job, while emotion is high):
  <under 160 chars including the link placeholder>

SMS_2 (sent 2 days later if no response):
  <under 160 chars>

EMAIL_1_SUBJECT: <under 50 chars>
EMAIL_1_BODY:
  <3 short paragraphs — thanks specific to service done, ask for review, low-friction>

EMAIL_2_SUBJECT: <under 50 chars — for follow-up>
EMAIL_2_BODY:
  <2 short paragraphs — gentle nudge, mention helping local search, easy out>

PHONE_SCRIPT:
  <30-second talk track for Chris/team to use when calling a happy customer>

NOTE: include {{review_link}} where the URL goes — don't hardcode the URL.`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 900 },
      );

      return {
        summary: `Review acquisition kit:\n\nGOOGLE REVIEW LINK:\n  ${reviewLink}\n\n${draft}\n\nSubstitute {{review_link}} with the URL above when sending. Substitute {{first_name}} with the customer's first name.`,
        outcome_data: { google_review_link: reviewLink, templates_drafted: true },
      };
    },
    instructions: `Save the review link + templates somewhere your team can grab them (1Password vault note works).
Train client team on cadence:
- SMS_1 within 1 hour of job completion (while emotion is high)
- SMS_2 if no review after 48 hours
- EMAIL_1 within 24 hours
- EMAIL_2 5 days later if still no review
- PHONE_SCRIPT for top 5 most-likely-to-review customers
Goal: 30%+ of asked customers leave a review.`,
  },
  {
    id: "m1.review.first_5", title: "Get first 5 reviews",
    type: "manual", dependsOn: ["m1.review.system"],
    instructions: `Push hard for 5 reviews from past customers (last 6 months).
Send personalized requests. Goal: 5 in week 3, all 4★+, in Google.`,
  },
  {
    id: "m1.review.response", title: "Respond to all existing reviews",
    type: "hybrid", dependsOn: ["m1.review.system"],
    async run({ getGbp, client }) {
      try {
        const gbp = await getGbp();
        const r = await gbp.listReviews();
        const reviews = r?.reviews || [];
        const unanswered = reviews.filter((rv) => !rv.reviewReply);
        return { summary: `Found ${reviews.length} reviews, ${unanswered.length} without replies. Use \`node gbp.mjs ${client.id} reply <reviewId>\` to AI-draft each reply.` };
      } catch (e) {
        return { summary: `OAuth not connected. Reply manually in GBP dashboard. Once OAuth is done, use \`node gbp.mjs ${client.id} reviews\` to list + draft replies.` };
      }
    },
    instructions: `Reply to every existing review. Positive: thank by name + mention service. Negative: empathize + offer offline resolution.
SLA going forward: 24-hr response. Use \`node gbp.mjs <client_id> reply <reviewId>\` to AI-draft each.`,
  },

  // === Phase 6 — Wrap ===
  {
    id: "m1.report.month1", title: "Build + deliver Month 1 report",
    type: "hybrid", dependsOn: ["m1.audit.kpi_baseline", "m1.gbp.photos", "m1.review.first_5", "m1.cit.priority_top10"],
    async run({ clientId }) {
      const { saveAndPublishReport } = await import("../../lib/report-generator.mjs");
      const result = await saveAndPublishReport(clientId, { publish: true });
      return {
        summary: `Report generated + published to portal.\n  Local: ${result.filePath}\n  Portal id: ${result.portalRow?.id}\n  Stats: ${result.summary.tasks_done} tasks done, ${result.summary.new_reviews} new reviews, ${result.summary.rankings_count} keywords tracked`,
        outcome_data: result.summary,
      };
    },
    instructions: `Report is auto-generated and posted to the client portal. Send a short follow-up email with the portal link + a 3-bullet summary.`,
  },
  {
    id: "m1.call.close", title: "Close-out call",
    type: "manual", dependsOn: ["m1.report.month1"],
    instructions: `30-min call. Walk through report, set Month 2 expectations.
Get client approval to start Month 2 work. Confirm next monthly call date.

Outcome to track: approved_month2 / not_renewed.`,
  },
  {
    id: "m1.handoff.month2", title: "Transition to monthly cycle",
    type: "auto", dependsOn: ["m1.call.close"],
    async run({ clientId }) {
      const { ensureMonthlyState } = await import("../state.mjs");
      await ensureMonthlyState(clientId);
      return { summary: `Initialized Month 2+ record. Use \`node flow.mjs ${clientId} next --monthly\` to start.` };
    },
  },
];
