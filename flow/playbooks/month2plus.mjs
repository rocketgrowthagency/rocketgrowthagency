// Month 2+ recurring monthly cycle — executable steps.
// One full pass of this playbook per client per reporting month.

import "dotenv/config";

export const month2plus = [
  // === Phase 1 — Snapshot & Measure ===
  {
    id: "m2.snap.rank_tracker", title: "Run rank tracker",
    type: "auto", dependsOn: [],
    async run({ clientId }) {
      // Defer to track-rankings.mjs as a child process so we don't double-import puppeteer.
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      try {
        const { stdout } = await exec("node", ["track-rankings.mjs", "--client", clientId], { cwd: process.cwd(), timeout: 600000 });
        return { summary: `track-rankings.mjs completed.\n${stdout.slice(-500)}` };
      } catch (err) {
        return { summary: `track-rankings.mjs failed or not yet runnable for this client: ${err.message?.slice(0, 200)}` };
      }
    },
  },
  {
    id: "m2.snap.grid_scan", title: "Re-run 9x9 grid scan",
    type: "hybrid", dependsOn: ["m2.snap.rank_tracker"],
    async run({ clientId }) {
      const cmd = `node grid-scan.mjs --client=${clientId} --keyword="<keyword>" --radius=5`;
      return { summary: `Run for each tracked keyword: ${cmd}\nCompare avg rank + top-3% to last month's grid_session_id results.` };
    },
    instructions: `Re-run grid-scan.mjs per tracked keyword. Compare to prior month's grid_session_id avg rank + top-3 coverage %.
"Average grid rank improved from 28 → 14" tells a richer story than "ranked #15 in SF."`,
  },
  {
    id: "m2.snap.gbp_metrics", title: "Capture GBP performance",
    type: "auto", dependsOn: [],
    async run({ getGbp, clientId }) {
      try {
        const gbp = await getGbp();
        const end = new Date();
        const start = new Date(); start.setDate(start.getDate() - 30);
        const data = await gbp.fetchInsights({
          metrics: ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_CONVERSATIONS"],
          startDate: start, endDate: end,
        });
        const series = data?.multiDailyMetricTimeSeries?.[0]?.dailyMetricTimeSeries || [];
        const totals = {};
        series.forEach((s) => {
          totals[s.dailyMetric] = (s.timeSeries?.datedValues || []).reduce((sum, d) => sum + Number(d.value || 0), 0);
        });
        return { summary: `GBP last-30-day metrics: ${JSON.stringify(totals)}`, outcome_data: totals };
      } catch (e) {
        return { summary: `OAuth not connected — pull manually from GBP Insights and fill fields 2.4.1-2.4.9 in monthly record.` };
      }
    },
  },
  {
    id: "m2.snap.gsc_metrics", title: "Capture Search Console data",
    type: "auto", dependsOn: [],
    async run({ getOauth }) {
      try {
        const g = await getOauth();
        const end = new Date(); end.setDate(end.getDate() - 3); // GSC has 2-3 day lag
        const start = new Date(end); start.setDate(end.getDate() - 30);
        const fmt = (d) => d.toISOString().slice(0, 10);
        const r = await g.gscQuery({
          startDate: fmt(start), endDate: fmt(end),
          dimensions: ["query"], rowLimit: 25,
        });
        const totals = (r?.rows || []).reduce(
          (acc, row) => ({ clicks: acc.clicks + row.clicks, impressions: acc.impressions + row.impressions }),
          { clicks: 0, impressions: 0 },
        );
        const top3 = (r?.rows || []).slice(0, 3).map((r) => `  "${r.keys[0]}": ${r.clicks} clicks / ${r.impressions} imp / pos ${r.position.toFixed(1)}`).join("\n");
        return { summary: `GSC 30d: ${totals.clicks} clicks / ${totals.impressions} impressions.\nTop 3:\n${top3}`, outcome_data: { ...totals, top_queries: (r?.rows || []).slice(0, 10) } };
      } catch (e) {
        return { summary: `OAuth/GSC not ready — pull manually from Search Console and fill fields 2.4.10-13 + 2.4.18-29.` };
      }
    },
  },
  {
    id: "m2.snap.ga4_metrics", title: "Capture GA4 + CallRail metrics",
    type: "hybrid", dependsOn: [],
    async run({ getOauth }) {
      try {
        const g = await getOauth();
        const r = await g.ga4RunReport({
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 10,
        });
        const total = (r?.rows || []).reduce((sum, row) => sum + Number(row.metricValues[0].value || 0), 0);
        const organic = (r?.rows || []).find((row) => row.dimensionValues[0].value === "Organic Search");
        return { summary: `GA4 30d: ${total} total sessions, ${organic ? organic.metricValues[0].value : "0"} organic. Top channels:\n${(r?.rows || []).map((row) => `  ${row.dimensionValues[0].value}: ${row.metricValues[0].value}`).join("\n")}` };
      } catch (e) {
        return { summary: `OAuth/GA4 not ready — pull manually from GA4 and fill fields 1.x + 2.4.14-17 + 2.4.30-36.` };
      }
    },
    instructions: `Also pull CallRail (or your call-tracking tool): total calls, missed calls, top source.`,
  },
  {
    id: "m2.snap.competitors", title: "Snapshot top 5 competitors",
    type: "manual", dependsOn: [],
    instructions: `Re-scrape "<primary service> in <primary market>" via step-1-maps-scraper.cjs (rate-limited, max 1/day).
Pull top 5: name, GBP URL, current rank, review count, rating. Update fields 2.5.1-31. Flag any new entrants.`,
  },
  {
    id: "m2.snap.business_outcomes", title: "Capture business-outcome KPIs",
    type: "manual", dependsOn: ["m2.snap.ga4_metrics"],
    instructions: `From client + CRM: total leads, total phone calls, form leads, closed jobs, lead-to-customer close rate, monthly revenue. Fill section 1.0.`,
  },

  // === Phase 2 — Plan This Month's Focus ===
  {
    id: "m2.plan.rotating_focus", title: "Pick this month's rotating focus",
    type: "manual", dependsOn: ["m2.snap.rank_tracker", "m2.snap.gbp_metrics", "m2.snap.competitors"],
    instructions: `Rotate across: GBP / Reviews / Website / Content / Citations / Links / Ads.
Suggested if data available: rank dropped → Reviews+Citations. GBP views down → GBP. Website clicks low → Conversion. Competitor surged → Backlinks/PR.
Store in field 3.8.5.`,
  },
  {
    id: "m2.plan.tasks_for_month", title: "Define this month's tasks",
    type: "manual", dependsOn: ["m2.plan.rotating_focus"],
    instructions: `Write 3-5 specific tasks for the focus area. Examples:
- GBP focus: 4 weekly posts, 10 photos, 3 Q&A seeds
- Reviews focus: send 50 review requests, target +10 reviews
- Content focus: publish 2 blog posts, optimize 2 service pages
- Links focus: 5 partnership outreach emails, 2 local PR pitches`,
  },

  // === Phase 3 — Execute ===
  {
    id: "m2.exec.gbp_posts", title: "Post 4 GBP updates this month",
    type: "auto", dependsOn: ["m2.plan.tasks_for_month"],
    async run({ client, clientId }) {
      const { draftMonthlyPostCalendar } = await import("../../lib/gbp-content-ai.mjs");
      const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
      const cal = await draftMonthlyPostCalendar({
        businessName: client.business_name,
        primaryService: client.primary_service,
        primaryMarket: client.primary_market,
        monthLabel: month,
      });
      const preview = cal.map((p, i) => `--- Week ${i + 1} (${p.theme}) ---\n${p.body}`).join("\n\n");
      return { summary: `AI-drafted 4-post calendar for ${month}:\n\n${preview}\n\nApprove + publish each via: node gbp.mjs ${clientId} post "<draft-text-here>"` };
    },
  },
  {
    id: "m2.exec.gbp_photos", title: "Add 5+ new photos",
    type: "manual", dependsOn: ["m2.plan.tasks_for_month"],
    instructions: `Geotagged when possible. Mix: recent jobs, team, equipment.
Once a photo library exists at /data/clients/<slug>/photos/: gbp.uploadPhoto(sourceUrl, "ADDITIONAL") batched.`,
  },
  {
    id: "m2.exec.review_push", title: "Run review acquisition campaign",
    type: "manual", dependsOn: ["m2.plan.tasks_for_month"],
    instructions: `Send review requests to all jobs completed in last 30 days. Target: 5+ new 4★+ reviews.

OUTCOME: track exact \`reviews_earned\` count. Mark via: node flow.mjs <client_id> done m2.exec.review_push --monthly --outcome reviews_earned --data <count>`,
  },
  {
    id: "m2.exec.review_responses", title: "Respond to all new reviews",
    type: "auto", dependsOn: ["m2.exec.review_push"],
    async run({ getGbp, clientId }) {
      try {
        const gbp = await getGbp();
        const r = await gbp.listReviews();
        const reviews = r?.reviews || [];
        const newOnes = reviews.filter((rv) => !rv.reviewReply);
        return { summary: `${reviews.length} total, ${newOnes.length} unanswered.\nDraft + post replies via: node gbp.mjs ${clientId} reply <reviewId>` };
      } catch (e) {
        return { summary: `OAuth not connected — reply in GBP dashboard.` };
      }
    },
  },
  {
    id: "m2.exec.focus_area_work", title: "Execute focus-area tasks",
    type: "manual", dependsOn: ["m2.plan.tasks_for_month"],
    instructions: `Complete the 3-5 tasks defined in m2.plan.tasks_for_month. Document in section 3.x of monthly record.`,
  },
  {
    id: "m2.exec.brand_mentions", title: "Find unlinked brand mentions, request links",
    type: "hybrid", dependsOn: [],
    async run({ client }) {
      const ownDomain = (client.website_url || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      const q = `"${client.business_name}" -site:${ownDomain} -site:facebook.com -site:instagram.com -site:linkedin.com -site:yelp.com`;
      const draft = await aiSuggest(
        `You write outreach emails for backlink acquisition. Output 2 versions Chris can paste:

VERSION_A — Casual ("we noticed you mentioned us"):
SUBJECT: <40 char>
BODY: <3 short paragraphs, friendly tone, ask for the link, give the exact URL to add>

VERSION_B — Value-add ("here's something useful for your readers"):
SUBJECT: <40 char>
BODY: <3 short paragraphs, lead with help/value, then ask for the link>

Use {{site_name}} and {{mention_url}} as placeholders.`,
        `Business: ${client.business_name}\nWebsite to link to: ${client.website_url}\nWhat they do: ${client.primary_service} in ${client.primary_market}`,
        { maxTokens: 600 },
      );
      return {
        summary: `Brand-mentions outreach kit:\n\n1. Run this Google search to find unlinked mentions:\n   ${q}\n\n2. Or click: https://www.google.com/search?q=${encodeURIComponent(q)}\n\n3. For each result that mentions ${client.business_name} but doesn't link to ${client.website_url}, send one of these:\n\n${draft}`,
        outcome_data: { search_query: q },
      };
    },
    instructions: `Open the Google search URL above. For each unlinked mention found:
1. Note site name + the page URL where the mention is
2. Find the site owner's email (use the website's contact page, hunter.io free tier, or LinkedIn)
3. Personalize one of the AI templates (replace {{site_name}} + {{mention_url}})
4. Send + log in client_backlinks (status="pending" until link goes up)
5. Follow up 7 days later if no response`,
  },
  {
    id: "m2.exec.local_pr", title: "Quarterly: pitch local press / 'best of'",
    type: "hybrid", dependsOn: [],
    async run({ client }) {
      const draft = await aiSuggest(
        `You write local PR pitches. Output a quarterly PR campaign kit:

5 STORY ANGLES (each 2-3 sentences) — angles that are genuinely newsworthy from a local journalist's POV. NOT promotional.

For the strongest angle, write 2 full pitch emails:

PITCH_TO_NEWS:
  TARGET: <type of outlet — local daily, neighborhood blog, etc>
  SUBJECT: <50 char attention-grabbing>
  BODY: <4-5 short paragraphs — hook, why now, what makes the source credible (the business owner), specific data or quote you can offer, soft ask>

PITCH_TO_BEST_OF_LISTICLE:
  TARGET: <type of outlet — Yelp Top 100, Apartment Therapy, neighborhood Reddit weekly>
  SUBJECT: <50 char>
  BODY: <3 short paragraphs — directly nominate the business, brief credibility, what differentiates them from other locals>

THEN suggest 3 sponsorship targets relevant to this business:
  - SPONSOR_1: <local event/team/org — under $500/year — would link to sponsor list>
  - SPONSOR_2: <same>
  - SPONSOR_3: <same>`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nWebsite: ${client.website_url}\nQuarter: ${["Q1","Q2","Q3","Q4"][Math.floor(new Date().getMonth() / 3)]} ${new Date().getFullYear()}`,
        { maxTokens: 1500 },
      );
      return { summary: `Quarterly local-PR campaign kit:\n\n${draft}` };
    },
    instructions: `1. Pick the strongest angle from the 5 listed → personalize PITCH_TO_NEWS for 2-3 specific outlets
2. Send PITCH_TO_BEST_OF_LISTICLE to all relevant listicle editors
3. Reach out to all 3 sponsorship targets (most reply within 1 week)
4. Track every pitch in client_backlinks (status="pending" → "live" once linked)
1 high-DA local link can outrank 50 citations.`,
  },
  {
    id: "m2.exec.competitor_backlink_steal", title: "Quarterly: replicate competitor backlinks",
    type: "manual", dependsOn: ["m2.snap.competitors"],
    instructions: `Use Ahrefs / Moz / Ubersuggest free tier on top 3 competitors.
For each competitor backlink: directory? add us. Guest post? pitch same site. Sponsorship? consider next year. Press? pitch journalist.
Goal: replicate 5+ per quarter.`,
  },
  {
    id: "m2.exec.haro_pitches", title: "Pitch HARO/Connectively requests",
    type: "manual", dependsOn: [],
    instructions: `Sign up for Connectively (free).
Filter: industry-relevant queries needing expert sources.
Pitch 3-5/month. Goal: 1 published mention/month with backlink.`,
  },
  {
    id: "m2.exec.youtube_video", title: "Publish 1-2 YouTube videos",
    type: "hybrid", dependsOn: [],
    async run({ client }) {
      const { default: OpenAI } = await import("openai");
      if (!process.env.OPENAI_API_KEY) return { summary: "OPENAI_API_KEY not set" };
      const o = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await o.chat.completions.create({
        model: process.env.GBP_AI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: `You write YouTube video scripts for local service businesses. Output 2 video kits this month — pick fresh angles different from any past month. Each kit:\nTITLE / DESCRIPTION (450 char) / HOOK (5 sec) / SCRIPT (~150 words spoken) / CTA / TAGS (12)\nMix: 1 educational, 1 customer-result-focused.` },
          { role: "user", content: `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}\nWebsite: ${client.website_url}\nMonth: ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}` },
        ],
        temperature: 0.8, max_tokens: 1500,
      });
      const draft = r.choices?.[0]?.message?.content?.trim() || "";
      return { summary: `2 video scripts for ${new Date().toLocaleString("en-US", { month: "long" })}:\n\n${draft}` };
    },
    instructions: `Record both. Title + description + tags exactly as drafted. Geotag the videos. Embed each on the most-relevant service or location page.`,
  },
  {
    id: "m2.exec.cannibalization_audit", title: "Quarterly: keyword cannibalization check",
    type: "auto", dependsOn: [],
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url" };
      const root = client.website_url.replace(/\/$/, "");
      // 1. Fetch sitemap
      let urls = [];
      try {
        const r = await fetch(`${root}/sitemap.xml`);
        if (r.ok) {
          const xml = await r.text();
          urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 50);
        }
      } catch (e) {}
      if (!urls.length) return { summary: "Could not load sitemap.xml. Add it manually + retry." };

      // 2. For each URL, fetch + extract title + H1
      const pages = [];
      for (const url of urls) {
        try {
          const r = await fetch(url, { headers: { "User-Agent": "RGA-cannibalization-audit/1.0" } });
          if (!r.ok) continue;
          const html = await r.text();
          const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
          const h1 = html.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1]?.trim();
          if (title || h1) pages.push({ url, title, h1 });
        } catch {}
      }

      // 3. Group by lowercased H1 and detect collisions
      const byH1 = {};
      pages.forEach((p) => {
        const key = (p.h1 || p.title || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!key) return;
        (byH1[key] ||= []).push(p);
      });
      const conflicts = Object.entries(byH1).filter(([, ps]) => ps.length > 1);

      const lines = conflicts.length
        ? conflicts.map(([k, ps]) => `\nCONFLICT: "${k}"\n${ps.map((p) => `  → ${p.url}`).join("\n")}`).join("\n")
        : "No H1/title collisions detected.";

      return {
        summary: `Audited ${pages.length} pages from sitemap. ${conflicts.length} keyword cannibalization conflict(s):\n${lines}`,
        outcome_data: { pages_audited: pages.length, conflicts: conflicts.length, conflicts_list: conflicts.map(([k, ps]) => ({ key: k, urls: ps.map((p) => p.url) })) },
      };
    },
  },
  {
    id: "m2.exec.site_audit_recurring", title: "Monthly: broken-link + page-speed scan",
    type: "auto", dependsOn: [],
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url" };
      const root = client.website_url.replace(/\/$/, "");

      // 1. Sitemap → URL list (cap 50 to keep runtime under ~30s)
      let urls = [];
      try {
        const r = await fetch(`${root}/sitemap.xml`);
        if (r.ok) urls = [...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 50);
      } catch {}

      // 2. HEAD each URL — flag 4xx/5xx
      const broken = [];
      const checked = [];
      for (const u of urls) {
        try {
          const r = await fetch(u, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "RGA-audit/1.0" } });
          checked.push({ url: u, status: r.status });
          if (r.status >= 400) broken.push({ url: u, status: r.status });
        } catch (e) {
          broken.push({ url: u, status: 0, error: e.message?.slice(0, 80) });
        }
      }

      // 3. PageSpeed Insights — homepage + 2 random priority pages
      const psiTargets = [client.website_url, ...urls.filter((u) => u !== client.website_url).slice(0, 2)];
      const psiResults = [];
      for (const t of psiTargets) {
        const u = encodeURIComponent(t);
        try {
          const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${u}&strategy=mobile&category=performance&category=seo&category=accessibility`);
          if (!r.ok) { psiResults.push({ url: t, error: `PSI ${r.status}` }); continue; }
          const data = await r.json();
          const cats = data?.lighthouseResult?.categories || {};
          psiResults.push({
            url: t,
            perf: Math.round((cats.performance?.score || 0) * 100),
            seo: Math.round((cats.seo?.score || 0) * 100),
            a11y: Math.round((cats.accessibility?.score || 0) * 100),
          });
        } catch (e) {
          psiResults.push({ url: t, error: e.message?.slice(0, 80) });
        }
      }

      const psiLines = psiResults.map((p) => p.error
        ? `  ${p.url} — ${p.error}`
        : `  ${p.url} — perf=${p.perf} seo=${p.seo} a11y=${p.a11y}`).join("\n");
      const brokenLines = broken.length
        ? broken.slice(0, 20).map((b) => `  [${b.status}] ${b.url}${b.error ? ` (${b.error})` : ""}`).join("\n")
        : "  none";

      return {
        summary: `Site audit:\n  ${checked.length} pages from sitemap checked\n  ${broken.length} broken (${(broken.length / Math.max(1, checked.length) * 100).toFixed(0)}%)\n\nBroken URLs:\n${brokenLines}\n\nPageSpeed Insights:\n${psiLines}`,
        outcome_data: { pages_checked: checked.length, broken_count: broken.length, broken, psi: psiResults },
      };
    },
  },
  {
    id: "m2.exec.gbp_attributes_refresh", title: "Quarterly: refresh GBP attributes",
    type: "manual", dependsOn: [],
    instructions: `GBP often adds NEW attributes quarterly. Re-check: highlights, service options, accessibility, payment, crowd, health & safety. Toggle ON anything new + relevant.`,
  },
  {
    id: "m2.exec.mystery_shop", title: "Test client's lead handling",
    type: "manual", dependsOn: [],
    instructions: `Make a test call as a customer. Did anyone answer? How long? Quality? Did they offer a quote/booking? Score 1-5. Fill section 3.9.
Lead-handling kills conversion more than rankings do.`,
  },

  // === Phase 4 — Report & Deliver ===
  {
    id: "m2.report.generate", title: "Generate monthly report",
    type: "auto", dependsOn: ["m2.snap.business_outcomes", "m2.exec.focus_area_work"],
    async run({ clientId }) {
      const { saveAndPublishReport } = await import("../../lib/report-generator.mjs");
      const result = await saveAndPublishReport(clientId, { publish: true });
      return {
        summary: `Monthly report generated + published.\n  Local: ${result.filePath}\n  Portal id: ${result.portalRow?.id}\n  Stats: ${result.summary.tasks_done} tasks done, ${result.summary.new_reviews} new reviews`,
        outcome_data: result.summary,
      };
    },
  },
  {
    id: "m2.report.deliver", title: "Send report + post in portal",
    type: "manual", dependsOn: ["m2.report.generate"],
    instructions: `Insert report into client_portal_content so client sees it on next login. Email client a 3-bullet summary + link.`,
  },
  {
    id: "m2.call.monthly", title: "Run monthly call",
    type: "manual", dependsOn: ["m2.report.deliver"],
    instructions: `20-30 min Zoom. Walk through report, share win story, get feedback, set next month's expectations. Record + upload notes URL to field 4.5.

OUTCOME: track retained / at_risk / churned.`,
  },
  {
    id: "m2.win_story.capture", title: "Capture customer win story",
    type: "manual", dependsOn: [],
    instructions: `Pick 1 great customer this month. Capture: original search, job value, brief story. Fill section 3.10. Use for future case studies + GBP posts.`,
  },
  {
    id: "m2.handoff.next_month", title: "Transition to next month",
    type: "auto", dependsOn: ["m2.report.deliver", "m2.call.monthly"],
    async run({ clientId }) {
      const { ensureMonthlyState } = await import("../state.mjs");
      const next = new Date(); next.setMonth(next.getMonth() + 1); next.setDate(1);
      const reportingMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      await ensureMonthlyState(clientId, reportingMonth);
      return { summary: `Initialized monthly record for ${reportingMonth}.` };
    },
  },
];
