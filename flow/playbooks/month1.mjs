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

// 🔑 The audit chain runs as DEPLOYED functions, not locally — they need Google OAuth credentials
// that deliberately live only in the Netlify environment. The local runner calls them so that both
// entry points execute the SAME code rather than two implementations that drift.
async function callFn(name, clientId) {
  const token = process.env.QUO_WEBHOOK_TOKEN;
  if (!token) throw new Error("QUO_WEBHOOK_TOKEN not set — cannot reach the deployed audits");
  const r = await fetch(`https://www.rocketgrowthagency.com/.netlify/functions/${name}` +
    `?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`);
  const text = await r.text();
  let j; try { j = JSON.parse(text); }
  catch { throw new Error(`${name} returned non-JSON (HTTP ${r.status}): ${text.slice(0, 120)}`); }
  if (j.ok === false) return { summary: `${name}: ${String(j.error || j.verdict).slice(0, 160)}`, outcome: "indeterminate", outcome_data: j };
  const fixes = (j.fixes || []).length;
  return {
    summary: j.readiness_score != null ? `readiness ${j.readiness_score}%`
      : j.totals ? `${j.totals.recommendations} recommendation(s), ${j.totals.unknowns} unknown`
      : fixes ? `${fixes} fix(es) found` : "ok",
    outcome: "verified", outcome_data: j,
  };
}

// ---- the playbook ----
export const month1 = [
  // === Ready to start (order approved 2026-10-08, onboarding_order_audit_v1) ===

  {
    id: "m1.kickoff.create", title: "Confirm the client record is complete enough to work",
    type: "auto", dependsOn: [],
    actionLabel: "⚡ Generate",
    instructions: `Confirms the client record exists before any work is logged against it.

Nothing is created here — the row was written when the contract was signed. This step exists so the
SOP has a verified starting point.

You get: the business name and client id echoed back.
If it errors: the client row is missing, and every later step will fail on it. Fix that first.`,
    async run({ client }) {
      // 🔴 2026-09-06 — THIS STEP COULD NEVER FAIL. It was titled "Create client in Supabase" but the
      // code only confirmed the row existed — and flow-execute 404s before reaching a runner if the
      // client is missing, so it always returned "exists". A step that cannot fail teaches nothing
      // and gives false confidence that the foundation is sound.
      //
      // 🔑 It now checks the fields LATER STEPS ACTUALLY DEPEND ON. Every one of these has a named
      // consumer, so a gap here is a step that will fail or mislead further down:
      const needs = [
        ["business_name",         "everything — the title of every audit, video and report"],
        ["website_url",           "the website audit, AI-readiness, social and citation audits"],
        ["primary_contact_email", "the confirmation email and the portal invite"],
        ["primary_market",        "the geo-grid center — a wrong market measures the wrong city"],
        ["primary_service",       "the TRACKED KEYWORD. Wrong here = a uniform not-found grid"],
      ];
      const missing = needs.filter(([f]) => !String(client[f] || "").trim());
      if (missing.length) {
        return {
          summary: `🔴 ${missing.length} field(s) missing — later steps will fail or mislead:\n` +
            missing.map(([f, why]) => `   • ${f} — needed by ${why}`).join("\n"),
          outcome: "needs_work",
          outcome_data: { missing: missing.map(([f]) => f) },
        };
      }
      return {
        summary: `Client record complete: ${client.business_name} — market "${client.primary_market}", tracked keyword "${client.primary_service}"`,
        outcome: "verified",
      };
    },
  },
  {
    id: "m1.access.gbp", title: "Get GBP manager access",
    type: "hybrid", dependsOn: [],
    actionLabel: "⚡ Generate",
    async run({ client }) {
      const url = client.gbp_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.business_name + " " + (client.primary_market || ""))}`;
      return { summary: `Send invite via Google Business Profile Manager → Settings → People & Access → Add → role = Manager. GBP URL: ${url}` };
    },
    instructions: `The client adds RGA as a Manager. RGA never asks for their Google login.
1. The client opens https://business.google.com and picks their profile
2. Menu → Settings → People and access → Add
3. Email: hello@rocketgrowthagency.com
4. Role: Manager → Invite
5. Accept the invite from the hello@ inbox
6. Once accepted, the profile shows in hello@'s Business Profile dashboard.

Two RGA addresses, on purpose: hello@ is the Google Business Profile manager (this step). access@ is the sign-in for website builders and other tools (the website access step). Neither is ever asked for a password.`,
  },
  {
    id: "m1.access.analytics", title: "Get GA4 admin access",
    type: "manual", dependsOn: [],
    actionLabel: "⚡ Generate",
    instructions: `Have client open GA4 → Admin (gear) → Property Access Management → "+ Add users" → your email → Role: Editor (property level). Ask for Administrator only if a step must link GA or manage users on the property. Reports already come through the Google sign-in, so this is for setting up or fixing tracking.
If client has no GA4 yet: skip this step + flag m1.tracking.install_ga4 (we install during website work).`,
  },
  {
    id: "m1.access.search_console", title: "Get GSC owner access",
    type: "manual", dependsOn: [],
    actionLabel: "⚡ Generate",
    instructions: `Have client open https://search.google.com/search-console → Settings → Users and permissions → "Add user" → your email → Permission: Full. Ask for Owner only if a step must verify the property. Reports already come through the Google sign-in, so this is for setting up or fixing tracking.
If no GSC yet: skip + flag m1.tracking.install_gsc.`,
  },
  // === The kickoff call (order approved 2026-10-08, onboarding_order_audit_v1) ===
  // 🔴 Added 2026-09-06. The SOP used to begin at "create the client in Supabase" — an internal
  // database write the client never sees. Everything they ACTUALLY experience first was undefined.
  // The rep's closing line already promises three things ("I'll set your account up now, you'll get
  // portal access, and the agreement will be over shortly"), so Phase 0 is simply: DELIVER THAT
  // PROMISE, in writing, before anything internal. See MEMORY_delivery.md.
  {
    id: "m1.close.confirm", title: "Welcome email — book your kickoff call",
    type: "hybrid", dependsOn: ["m1.kickoff.create"],
    actionLabel: "✉️ Send the email",
    actionConfirm: "This SENDS a real email to {contact} right now. It is not a draft and cannot be unsent.",
    instructions: `Send when Onboarding starts — Google is connected, payment (or the beta agreement) is done.

Must contain, in this order:
  1. Their plan, read from the signed agreement.
  2. BOOK YOUR KICKOFF CALL — the portal link to book it (or the booked time, if already booked).
  3. What we'll need from them next — THEIR open steps, read from the record.
  4. What we start on now.

▶️ IT SENDS ITSELF the moment the client connects Google (approved 2026-10-08) — from hello@rocketgrowthagency.com, capturing the exact body, the recipient and Gmail's message id. Run is the fallback if it shows as not sent. It will not send twice unless you force it.

Approved 2026-10-08 (client_emails_yes_to_kickoff_v1). It replaces the automatic stage-4 email, which is retired.`,
  },
  {
    id: "m1.close.kickoff_invite", title: "Book the kickoff call",
    // 🔴 2026-09-06 — WAS "manual", and that was the whole problem. The confirmation email tells the
    // client "Calendar invite is on its way" and nothing sent one; Chris closed RGA as its own first
    // client and no invite ever arrived. RGA now holds its own calendar.events credential, so
    // send-kickoff-invite creates the event and Google emails the guest.
    // "hybrid": the client picks the time, a human CONFIRMS it, and that books the call.
    // 🔴 NOT "a human confirms the client accepted" — that was a fourth state the business
    // does not have, removed 2026-09-29. → project_kickoff_meeting_lifecycle
    type: "hybrid", dependsOn: [],
    actionLabel: "📅 Send the calendar invite",
    actionConfirm: "This creates the event and GOOGLE EMAILS {contact} the invitation immediately.",
    instructions: `Google Calendar + Google Meet (decided 2026-09-03 — Workspace is already paid for,
and the invite arrives from a domain they can verify).

🔑 THE CLIENT NORMALLY PICKS THE TIME THEMSELVES. Their portal shows "Pick a time that suits you"
with your real open slots, and booking one creates the event, mints the Meet link and emails them.
You usually do not need this button at all.

Use it when you want to book on their behalf — they asked on the call, or they have not chosen.
It takes the FIRST genuinely free slot inside your bookable hours, 30 minutes, in the CLIENT's
timezone. It never books over something already in the ledger.

You do not open Google Calendar. Pressing the button twice does not send a second invite:
it offers to MOVE the existing one, keeping the same Meet link.

To pick a different time, or to call the meeting off, use "Change the time" or "Cancel the
meeting" on the card "The first hour after they say yes" on the Overview tab. Bookable hours and
days are set from that same card.

🔴 DONE = RGA HAS CONFIRMED THE TIME. The sequence is: the client picks a date and time, RGA confirms
it, and then it is BOOKED. Confirming is what finishes this step — the client's RSVP is news about
attendance and nothing waits on it. This is the single most common place momentum is lost between a
yes and the work starting, so confirm a request the day it arrives.

📄 PASTE-READY TEXT: docs/playbooks/close-phase0-templates.md (website repo) — section 2.`,
  },
  {
    // 🔴 THIS TOLD YOU TO BOOK A CALL THE PRODUCT HAS ALREADY BOOKED (rewritten 2026-09-24).
    // It opened with five numbered steps for creating the Google Calendar event by hand — which is
    // exactly what `m1.close.kickoff_invite` does automatically from the Overview card. Chris hit
    // this the obvious way: he found step 4, saw "Schedule a 30-min GOOGLE MEET", and asked whether
    // it was the same thing as Phase 0. Two steps describing one job is how a checklist stops being
    // trusted. → feedback_no_manual_step_recommendations · feedback_fix_the_class_not_the_instance
    //
    // 🔑 This step's real work is RUNNING the call. It now starts where the call starts.
    id: "m1.kickoff.call", title: "Run the kickoff call",
    type: "manual", dependsOn: ["m1.close.kickoff_invite"],
    actionLabel: "⚡ Prep questions for this call",
    instructions: `COVER, IN THIS ORDER:
  1. Scope — what RGA delivers versus what they provide.
  2. Timeline — roughly 3 months to ranking results, and what moves before then.
  3. Cadence — weekly work, a monthly call.

🔴 LEAVE THE CALL WITH THESE — without them, delivery stalls:
  · Manager access on their Google Business Profile (hello@rocketgrowthagency.com)
  · A website invite for RGA Admin, never a password (access@rocketgrowthagency.com, or GitHub rocketgrowthagency-admin on code)
  · GA4 + Search Console access
  · 20+ photos
  · Their customer list, for review outreach
  🔑 The console tracks which of these you already have, live, while the call runs.

After: send the recap — action items, dates, and exactly what you are still waiting on. The console drafts it from what is still outstanding.

📄 The full talk track: opens in the call console fifteen minutes before the start — the agenda with timings, what to say in each section, and a clock that names what to cut if you run long.`,
  },
  // === Website access (order approved 2026-10-08, onboarding_order_audit_v1) ===
  {
    id: "m1.access.website", title: "Get website access",
    type: "manual", dependsOn: [],
    // 🔒 no actionLabel / runner (10-27, approved admin_action_card_and_row8_v1): its Generate drafted "I need a login" + hello@
    instructions: `The client invites RGA Admin, never a password: access@rocketgrowthagency.com on their builder, or GitHub rocketgrowthagency-admin on their code (their card shows the exact steps for their builder).
Accept the invite in the access@ Chrome profile, open a page the role should reach, then press Confirm access: it records the grant and takes the before-snapshot.
Every RGA Admin login and its 2-step codes live in Bitwarden, collection RGA Admin. Never accept a client password or hosting credentials.
For the Google Business Profile the invite goes to hello@ instead (the Google access step): hello@ is for the profile, access@ is for website builders.`,
  },
  {
    id: "m1.access.password_manager", title: "Keep access safe",
    type: "manual", dependsOn: ["m1.access.website"], selfSettles: true,
    // 🔒 no actionLabel / runner (10-27, approved admin_row9_vault_v2): it settles itself with the website access step; its old draft told RGA to
    // store client website logins and receive credentials — against the never-a-password promise.
    instructions: `Runs itself (approved admin_row9_vault_v2, 10-27). RGA never holds a client's password: it signs in with its own RGA Admin login (access@rocketgrowthagency.com, GitHub rocketgrowthagency-admin), saved ONCE per platform in Bitwarden, org Rocket Growth Agency, collection RGA Admin.
When the website access step confirms access this step checks two facts: the login is an RGA Admin login, and that platform's login is marked saved. Both → done by itself.
The first client on a new builder (e.g. the first Wix client): save the new login in Bitwarden (item "<Builder> · access@", owner Rocket Growth Agency, collection RGA Admin, 2-step backup codes in Notes), then press Saved in Bitwarden. Every later client on it settles by itself.
When a client leaves: remove access from the website access step's ledger. Nothing to delete from the vault. Never store, receive or forward a client password.`,
  },
  // === The audit (order approved 2026-10-08, onboarding_order_audit_v1) ===

  {
    id: "m1.audit.gbp_baseline", title: "Snapshot GBP current state",
    type: "auto", dependsOn: ["m1.access.gbp"],
    actionLabel: "⚡ Update Google Business Profile",
    actionConfirm: "This WRITES to the client's live Google Business Profile — the change is public.",
    instructions: `Reads the LIVE Google Business Profile through the API and records the baseline into the onboarding
form: claimed, verified, primary category, and up to two secondary categories (fields 8.1-8.6).

Requires the Google connection from "Get GBP access" to be complete.

If it says "No gbp_location_id linked": the OAuth did not attach a location — reconnect.
🔴 CAPTURE THE 5 CONFIG IDS BEFORE RECONNECTING. Authorising a different Google account silently
changes them, and every later audit then measures the wrong business.`,
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
    // 🔴 A DUPLICATE LISTING IS NOT A RANK PROBLEM, AND A RANK NUMBER CANNOT SAY SO. RGA's own
    // 81-point grid reported the business nowhere; the cause was two live listings under one name,
    // which split Google's confidence so one gets suppressed. Only counting the listings finds it —
    // the Business Profile API reports how many locations we OWN, and a duplicate under a different
    // Google account is invisible to it.
    id: "m1.audit.gbp_duplicate", title: "Check for a duplicate Google listing",
    type: "auto", dependsOn: [],
    actionLabel: "⚡ Check for duplicates",
    instructions: `Searches Google Maps for the business name from its own map center and compares every same-name result against the listing we hold.

The Business Profile API cannot answer this — it reports how many locations we OWN, and a duplicate claimed under a different Google account is invisible to it. Counting the listings is the only way to see one.

If a duplicate exists the step stays OPEN and surfaces in the client portal with the steps to merge it, because the duplicate almost always sits under a Google account only the owner can reach. A rank grid cannot be read as a measure of the work until it is resolved.`,
    async run({ clientId }) {
      // Delegates to the deployed function so the CLASSIFIER has exactly one implementation.
      const base = process.env.URL || "https://www.rocketgrowthagency.com";
      const r = await fetch(`${base}/.netlify/functions/gbp-duplicate-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_FN_SECRET || "" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) return { summary: `Could not check for a duplicate listing: ${j?.error || `HTTP ${r.status}`}. This is a failure to look, not a clean result.`, outcome: "indeterminate" };
      const f = j.finding || {};
      if (f.verdict === "clean") return { summary: `Exactly ONE Google listing under this name (${f.own_place_key}).`, outcome: "verified", completed: true };
      if (f.verdict !== "duplicate") return { summary: `Could not determine whether a duplicate exists — ${f.reason || "nothing usable returned"}. NOT a clean result.`, outcome: "indeterminate" };
      return { summary: `🔴 ${(f.duplicates || []).length} duplicate listing(s) found. Merging is a CLIENT action — surfaced in their portal with the steps.`, outcome: "needs_fix", outcome_data: f };
    },
  },
  {
    id: "m1.audit.website", title: "Run on-page SEO audit",
    type: "auto", dependsOn: [],
    actionLabel: "⚡ Run and record",
    instructions: `Fetches the client homepage once and records what is actually on it: HTTP status, title, H1, meta
description, JSON-LD schema, GA4/GTM, contact form, click-to-call, and page weight. It also checks
whether the city and the primary service appear in the title. Auto-fills onboarding Section 9.x.

GA4 is reported in THREE states — present / cannot tell (GTM present) / absent — because a GTM
container can load GA4 without any G- id appearing in the HTML. Only "absent" is a finding.

Read the result, do not just tick it: title and H1 are the two things most often wrong.`,
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url on client record — skip or fill it in", outcome: "skipped" };
      const { status, body } = await fetchHomepage(client.website_url);
      const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
      // 🔴 `[^<]*` DIES ON NESTED MARKUP. RGA's own H1 is "<h1>Rank Higher on <span>Google
      // Maps</span>…" and this reported H1="MISSING" — a false absence finding about a heading that
      // was plainly there. Match lazily across children, then strip tags.
      // 🔴 Fixed in netlify/functions/flow-execute.js on 2026-09-08 but NOT here, because this step
      // has TWO independent implementations. That is the drift this file keeps paying for.
      const _h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const h1Match = _h1 ? [_h1[0], _h1[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()] : null;
      const metaDesc = body.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
      const hasSchema = /application\/ld\+json/i.test(body);
      // 🔴 THREE STATES, NEVER TWO. GA4 is frequently loaded through a GTM container, so no G- id
      // appears in the HTML. `false` would be an absence claim we cannot prove; null = cannot tell.
      const _ga4Direct = /G-[A-Z0-9]{6,}/.test(body) || /gtag\/js/.test(body);
      const hasGA4 = _ga4Direct ? true : (/GTM-[A-Z0-9]+/.test(body) ? null : false);
      const hasViewport = /<meta\s+name=["']viewport["']/i.test(body);
      const sizeKb = Math.round(body.length / 1024);
      return {
        // 🔑 Render the third state in words. `GA4=null` would read to a human as "no".
        summary: `Audited ${client.website_url}: ${status}, title="${titleMatch?.[1]?.slice(0, 50)}", H1="${h1Match?.[1]?.slice(0, 50)}", schema=${hasSchema}, GA4=${hasGA4 === true ? "present" : hasGA4 === null ? "cannot tell (GTM present)" : "absent"}, ${sizeKb}KB`,
        outcome_data: {
          http_status: status, title: titleMatch?.[1], h1: h1Match?.[1], meta_description: metaDesc?.[1],
          has_schema: hasSchema, has_ga4: hasGA4, has_viewport_meta: hasViewport, html_size_kb: sizeKb,
        },
      };
    },
  },
  {
    id: "m1.audit.deep_assess", title: "Deep assessment — GSC, GA4, GBP",
    type: "auto", dependsOn: ["m1.access.gbp", "m1.access.analytics", "m1.access.search_console"],
    actionLabel: "⚡ Run the check",
    instructions: `Captures a baseline snapshot from every connected source (Search Console, Analytics, GBP, Places)
and stores it as the "before" we will measure everything against.

You get: "N/M sources captured" plus how many snapshots were stored.

Anything less than all sources returns "partial" and names what failed. A partial baseline means
later month-over-month comparisons are measured against a hole — fix the failing connection and
re-run rather than accepting it.`,
    async run({ client }) { return await callFn("deep-assess-client", client.id); },
  },
  {
    id: "m1.audit.ai_readiness", title: "Audit AI readiness",
    type: "auto", dependsOn: ["m1.access.gbp"],
    actionLabel: "⚡ Run the check",
    instructions: `Checks that the public facts about the business (name, phone, profile links) are on the page in readable text, agree with the Google profile, and are marked up cleanly. Returns a fix list and a number for RGA only.

🔴 The number is for admin and is never shown to a client: it would imply a result nobody measured. A client sees a plain list of facts that are right. We promise no AI ranking and make no claim about what any AI tool says: whether a business "appears in AI answers" is not measurable.
The FAQ-schema line is gone (Google says schema is not an AI lever). Whether a search crawler is blocked is checked in the monthly site audit.`,
    async run({ client }) { return await callFn("ai-readiness-audit", client.id); },
  },
  {
    id: "m1.audit.nap_reviews", title: "Audit NAP consistency + reviews vs the vertical benchmark",
    type: "auto", dependsOn: ["m1.access.gbp", "m1.audit.deep_assess"],
    actionLabel: "⚡ Run the check",
    instructions: `Compares name, address and phone between the Google Business Profile and the website, and captures
the current review count and rating as a baseline. Where the trade has enough data to publish, it also
compares them with the top-3 median; where it doesn't, it says so.

🔴 Reviews are matched by CID, never by business name — name matching silently attaches another
company's reviews. Zero reviews takes a positive reading: a missing review field or a failed read is unknown, never zero.`,
    async run({ client }) { return await callFn("nap-and-review-audit", client.id); },
  },
  {
    id: "m1.audit.social", title: "Audit social presence linked from the site",
    type: "auto", dependsOn: [],
    actionLabel: "⚡ Run the check",
    instructions: `Checks which social profiles exist for the business and which are actually linked from the site.

🔴 Read this as a STARTING LIST, not a complete picture: the onboarding audit spec covers 0 of 5
social checks automatically today. What this returns is what we could see, not everything there is.`,
    async run({ client }) { return await callFn("social-presence-audit", client.id); },
  },
  {
    id: "m1.web.core_web_vitals", title: "Measure page speed",
    type: "auto", dependsOn: [],
    actionLabel: "⚡ Run the check",
    instructions: `Runs Google PageSpeed Insights against the homepage (mobile) and records the performance score plus
LCP, CLS and TBT. It measures only; nothing on the site changes.

Calls without a key are rate-limited by Google. A failure here is far more often the rate limit than
the site — retry in a minute, and check GOOGLE_PAGESPEED_API_KEY is set. Do not record a rate-limit failure as a
performance problem.`,
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
    id: "m1.audit.citations", title: "Run citation audit",
    type: "hybrid", dependsOn: [],
    actionLabel: "⚡ Run citation audit",
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴🔴 THIS LOCAL RUNNER IS SUPERSEDED — flow-execute.js `auditCitations` IS CANONICAL (10-07).
    // The server executor now MEASURES: ten SerpAPI `site:` searches, `found`/`missing`/`unknown`
    // per directory, written to `client_citations`, with `missing` gated on a positive `searched`
    // flag. The version below only PRINTS ten links and measures nothing.
    // 🔑 It is left in place because the admin's Run button calls the server, not this file — but
    // if anything ever runs it locally it will produce the OLD behaviour, and the step would look
    // like it had been audited when nothing was checked. Do not extend it; delete it when the
    // local flow runner is retired.
    // → project_step_22_citation_audit_automated · project_sop_step_audit_2026-09-08
    // ═══════════════════════════════════════════════════════════════════════════════════════
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
    instructions: `The runner searches Google for this business on each of the tracked directories and records what it finds in client_citations. It reports three answers per directory:
1. Listed → the listing URL it found
2. No listing found → the search did not find one. A search can miss a real listing, so check it by hand before anything is built for it
3. Could not check → the search itself failed; nothing is claimed either way, press Run again
It runs again a quarter later, or after a name, address or phone change that is on Google, once that recheck is switched on (each directory is a paid search). Directories that do not fit the client's trade or country are not searched.
Your part: open the listings it found and confirm the name, address and phone match Google. Fix any that do not, and fill onboarding section 11.0 with the summary.
DONE = every listing the audit found has been opened and its NAP confirmed against the GBP.`,
  },
  {
    id: "m1.audit.citations_nap", title: "Audit citation NAP consistency",
    type: "auto", dependsOn: ["m1.access.gbp", "m1.audit.citations", "m1.gbp.business_facts"],
    actionLabel: "⚡ Run the check",
    instructions: `Checks the listings we hold for NAP accuracy against the Google profile: the ones the client's own site links to, and the ones the listings check found.

🔴 No listing held does NOT mean no listing exists, and a page we could not read is "could not read", never wrong and never fine. This measures the accuracy of the listings we hold, never the completeness of all of them.
A directory that does not fit the client's trade or country is left out, not counted as a gap.
Duplicate-listing detection is not buildable without a paid aggregator and is out of scope.`,
    async run({ client }) { return await callFn("citation-audit", client.id); },
  },
  {
    id: "m1.audit.recommendations", title: "Build the prioritized fix plan from every audit",
    type: "auto",
    dependsOn: ["m1.audit.ai_readiness", "m1.audit.nap_reviews", "m1.audit.social", "m1.audit.citations_nap", "m1.audit.deep_assess", "m1.web.core_web_vitals"],
    actionLabel: "⚡ Run the check",
    instructions: `Merges every audit above into ONE ordered recommendations plan, weighted by impact x confidence.

Runs last for a reason: it depends on all five audits. Run it before they finish and the plan is
built on missing inputs.

🔴 An indeterminate finding is never turned into a recommendation. If an audit could not tell, the
plan stays silent on it rather than guessing.`,
    async run({ client }) { return await callFn("build-recommendations-plan", client.id); },
  },
  // === Decide (order approved 2026-10-08, onboarding_order_audit_v1) ===
  {
    id: "m1.strategy.keywords_locations", title: "Lock 3-5 primary keywords + 3 sub-locations",
    type: "hybrid", dependsOn: [],
    actionLabel: "⚡ Draft this for me",
    async run({ client }) {
      const draft = await aiSuggest(
        `You are a local SEO strategist. Suggest exactly 5 primary keywords and 3 sub-location targets for the business below. Return as YAML with keys 'keywords' (array of 5 strings) and 'locations' (array of 3 strings — sub-neighborhoods of the primary market). Plain text only, no commentary.`,
        `Business: ${client.business_name}\nPrimary service: ${client.primary_service}\nPrimary market: ${client.primary_market}`,
        { maxTokens: 300 },
      );
      return { summary: `AI keyword + location suggestions:\n${draft}` };
    },
    instructions: `Review the AI suggestions above. Confirm or override the 5 keywords + 3 sub-locations. These drive everything downstream — get them right.
When confirmed, press ✓ Mark step complete.`,
  },
  {
    // The audit chain — each calls its deployed function. Built 2026-09-05/06.
    id: "m1.audit.keyword_validation", title: "Validate the tracked keyword has real Search Console demand",
    type: "auto", dependsOn: ["m1.strategy.keywords_locations"],
    actionLabel: "⚡ Run the check",
    instructions: `🔴 THIS MUST PASS BEFORE THE RANK GRID. Asks Search Console how many impressions the tracked
keyword actually earned in the last 90 days.

"sound"        real demand — safe to track.
"no_demand"    tracking it will produce a uniform not-found grid that LOOKS like a ranking but is
               only a sentinel. RGA tracked such a term for 5 weeks before this check existed.
"indeterminate" could not tell — do not proceed on it either way.

If it returns needs_change, pick one of the striking-distance alternatives it lists and change the
tracked keyword BEFORE running the grid baseline.`,
    async run({ client }) { return await callFn("validate-tracked-keyword", client.id); },
  },
  {
    id: "m1.audit.competitors", title: "Snapshot top 3 local competitors",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations"],
    actionLabel: "⚡ Run (needs the local scraper)",
    async run({ client }) {
      // Stub — relies on existing scraper output. Real implementation would call step-1-maps-scraper for the search term.
      return { summary: `Run \`node step-1-maps-scraper.cjs\` for "${client.primary_service} in ${client.primary_market}", then capture top 5 competitors into onboarding fields 4.23-4.40.` };
    },
    instructions: `After the scrape: eyeball the top 5 results with the client. Confirm they're real direct competitors (not aggregator listings like Yelp or HomeAdvisor).`,
  },
  {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THIS STEP TOLD A HUMAN TO OPEN A TERMINAL (rewritten 2026-09-22). It is a manual-step
    // recommendation, and it broke the data: a script you run by hand can be interrupted, and the
    // partial persists as its own session. RGA's history holds two — 62 points and 5 points of 81 —
    // stored as complete-looking sessions, because the indices run contiguously from zero and
    // nothing inside a session reveals the truncation. The monthly comparison took the NEWEST
    // session, which on 09-12 was the five-point run.
    //
    // 🔑 The automated path already existed, already scheduled, already on an admin button. The
    // executor lives in netlify/functions/flow-execute.js ("m1.audit.grid_baseline") and cannot be
    // interrupted halfway. → feedback_no_manual_step_recommendations · project_rank_grid_uniform_sentinel
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    id: "m1.audit.grid_baseline", title: "Run the geo-grid map-rank baseline",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations", "m1.audit.keyword_validation", "m1.audit.gbp_duplicate"],
    actionLabel: "⚡ Run",
    async run({ client, clientId }) {
      return {
        summary: `The geo-grid map-rank scan runs in the product — there is no terminal step.

Run this step from the admin. If a complete scan already exists for the tracked keyword it is
reported straight away; otherwise the scan starts automatically and results land on the Map
Rankings tab within a few minutes.

Scans that stopped partway are ignored rather than averaged: a scan that stops early has measured
one part of the map, not a smaller sample of all of it.`,
      };
    },
    instructions: `We run the geo-grid map-rank scan for you — there is no terminal step and nothing to install.

1. The tracked keyword must pass keyword validation first. An unvalidated term produces a grid that is not-found at every point, which measures nothing.
2. Run this step. If a complete scan already exists for the tracked keyword it is reported straight away; otherwise the scan starts automatically.
3. Results appear on the Map Rankings tab within a few minutes. Re-run this step then to record the baseline.

The baseline is the number every later month is measured against, so it must come from a COMPLETE scan. Scans that stopped partway are ignored rather than averaged — a scan that stops early has measured one part of the map, not a smaller sample of all of it.`,
  },
  {
    id: "m1.audit.kpi_baseline", title: "Capture baseline KPIs",
    // 🔴 Was manual — "pull last 30 days and fill section 10.0" is a recommendation to do work by
    // hand, and a hand-copied baseline is a number nobody can re-derive. Step 58's whole report is
    // measured against it, so a typo here becomes a month of wrong progress.
    // The runner reads what the deep assessment already captured; it re-fetches nothing.
    type: "auto", dependsOn: ["m1.audit.deep_assess", "m1.audit.grid_baseline"],
    actionLabel: "⚡ Capture the baseline",
    instructions: `Reads the baseline straight out of the snapshots the deep assessment already captured — Search Console, Analytics, the Google listing, the map grid and site speed — and writes them down as the numbers Month 1 is measured against.

Nothing is re-fetched and nothing is typed by hand. A source that was unavailable is named as unavailable rather than recorded as zero, because 'we did not measure' and 'we measured nothing' are different baselines and only one of them leaves room to show progress.`,
  },
  {
    id: "m1.tracking.call_setup", title: "Set up call tracking (or decline)",
    type: "manual", dependsOn: [],
    instructions: `Decide WITH the client whether to use a tracking number.

🔴 A tracking number on the GBP is a NAP risk — if it ever disagrees with the website or the
citations, it splits the signal. Only use one if the client genuinely needs call attribution.

If YES: use a number that forwards to their real line, put the REAL number in the GBP primary and
the tracking number as an additional number — never the reverse.
If NO: record the decision so nobody re-litigates it monthly. Declining is a valid outcome.`,
  },
  {
    id: "m1.web.tracking", title: "Verify GA4 + GSC + tag tracking",
    type: "auto", dependsOn: ["m1.access.analytics", "m1.access.search_console"],
    actionLabel: "⚡ Generate",
    instructions: `Verifies GA4 and the Search Console verification meta tag are actually present on the homepage.

GA4 is three-state, like the website audit:
  found       a G- id is in the page source.
  unprovable  no G- id, but a GTM container IS present — GA4 may well be firing through it.
              VERIFY IN GA4 REALTIME before telling anyone it is missing.
  absent      no G- id and no GTM container. This is the only state that is a finding.

Only "found" plus a GSC tag counts as verified.`,
    async run({ client }) {
      if (!client.website_url) return { summary: "No website_url" };
      const { body } = await fetchHomepage(client.website_url);
      const ga4Match = body.match(/G-([A-Z0-9]{6,})/);
      const gscMeta = body.match(/<meta\s+name=["']google-site-verification["']\s+content=["']([^"']+)["']/i);
      // 🔴 A GTM container can load GA4 without ever putting a G- id in the HTML. Calling that
      // "MISSING" is an absence claim a homepage scrape cannot support — it is the false finding
      // this very check produced against RGA's own site on 2026-09-08. Kept identical to
      // netlify/functions/flow-execute.js; these two implementations must not drift again.
      const hasGTM = /GTM-[A-Z0-9]+/.test(body);
      const ga4State = ga4Match ? "found" : (hasGTM ? "unprovable" : "absent");
      const ga4Label = ga4Match ? `G-${ga4Match[1]}`
        : (hasGTM ? "not in page source — a GTM container is present, so GA4 may well be firing through it. VERIFY IN GA4 REALTIME before claiming it is missing."
                  : "MISSING (no G- tag and no GTM container)");
      const ok = ga4State === "found" && !!gscMeta;
      return {
        summary: `Tracking check: GA4=${ga4Label}, GSC verification=${gscMeta ? "present" : "MISSING"}`,
        outcome: ok ? "verified" : (ga4State === "unprovable" ? "indeterminate" : "missing_tags"),
        outcome_data: { ga4_id: ga4Match?.[0], gsc_token: gscMeta?.[1] },
      };
    },
  },
  // === Google Business Profile (order approved 2026-10-08, onboarding_order_audit_v1) ===

  {
    id: "m1.tracking.form_setup", title: "Set up form tracking",
    type: "manual", dependsOn: ["m1.access.website", "m1.access.analytics", "m1.web.tracking"],
    instructions: `Confirm the contact form actually submits AND that the submission is recorded.

🔴 "A <form> tag exists" is not "the form works" — the on-page audit can only see the tag.
Submit a real test inquiry and confirm it arrives. An unmonitored form is a lead leak that looks
like poor conversion.`,
  },
  {
    id: "m1.gbp.verify", title: "Ensure GBP is claimed + verified",
    type: "manual", dependsOn: ["m1.access.gbp"],
    actionLabel: "⚡ Generate",
    instructions: `Confirm green check next to business in GBP dashboard.
If unverified: trigger postcard or video verification from inside GBP. Block on this until done — nothing else GBP-related works without verification.`,
  },
  {
    // 🔒 approved business_on_google_v1 (2026-10-16): the client confirms five facts against Google in the portal
    id: "m1.gbp.business_facts", title: "Match business facts to Google (name, address, service area, phone, website)",
    type: "manual", dependsOn: ["m1.gbp.verify", "m1.audit.gbp_duplicate"],
    instructions: `The client confirms five facts in the portal against what Google shows (read live): business name, whether customers come to them (address shown or hidden), service area, phone, website.
Phone + website differences are written to Google and read back automatically.
Name and address differences are RGA's: change them in Google Business Profile (Google can ask to verify again).
Service area: add / drop the places on the checklist in Google Business Profile (its own place picker). The nightly check ticks each place Google lists and finishes the step; if Google has no such place, press "Google doesn't list it" and the client picks a nearby area.`,
  },
  {
    id: "m1.gbp.optimize_categories", title: "Lock primary + secondary categories",
    type: "hybrid", dependsOn: ["m1.gbp.verify", "m1.strategy.keywords_locations", "m1.audit.gbp_duplicate"],
    actionLabel: "⚡ Draft this for me",
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
    instructions: `Pick final primary + additional categories from the suggestions above.
Put them on Google from this step's card, or set them in GBP dashboard → Edit profile → Business category.`,
  },
  {
    id: "m1.gbp.services_products", title: "Add services + products",
    type: "hybrid", dependsOn: ["m1.gbp.optimize_categories", "m1.audit.gbp_duplicate"],
    actionLabel: "⚡ Draft this for me",
    async run({ client }) {
      const draft = await aiSuggest(
        `You are a GBP services optimizer. Suggest 8-15 services for this business. Each service: short displayName + 1-sentence description. Return as YAML list with keys displayName + description. No prices unless obvious.`,
        `Business: ${client.business_name}\nPrimary service: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 600 },
      );
      return { summary: `AI-drafted services:\n${draft}` };
    },
    instructions: "Run ⚡ to draft extra services from the locked plan; the client sees Google's own service types for the categories on Google (the categories step) plus this draft, unticks what they don't offer, and the save writes serviceItems to Google and reads them back (_gbp-services.js). The client's ticks ARE the approval. If Google refuses, the row says so and the client sees 'RGA is doing it'.",
  },
  {
    id: "m1.gbp.business_description", title: "Write compelling description",
    type: "hybrid", dependsOn: ["m1.gbp.optimize_categories", "m1.audit.gbp_duplicate"],
    actionLabel: "⚡ Draft this for me",
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
    id: "m1.gbp.hours_attributes", title: "Confirm hours",
    type: "manual", dependsOn: ["m1.gbp.verify", "m1.audit.gbp_duplicate"],
    actionLabel: "⚡ Draft this for me",
    instructions: `Set regular hours, holiday hours, special hours.
Attributes are asked once, in "Fill ALL relevant GBP attributes" (approved 2026-10-08 — they were asked twice).
Once OAuth: gbp.updateHours([{openDay:"MONDAY",openTime:{hours:9},closeDay:"MONDAY",closeTime:{hours:17}},...])`,
  },
  {
    id: "m1.gbp.attributes", title: "Fill ALL relevant GBP attributes",
    type: "manual", dependsOn: ["m1.gbp.verify", "m1.audit.gbp_duplicate"],
    actionLabel: "⚡ Draft this for me",
    instructions: `The client ticks what's true on their card. The portal puts those on Google and reads them back.
How you work: RGA ticks one only when another step proves it, and says why. The client can untick it.
About you (women-owned, veteran-owned and so on): only the client can say, so RGA never ticks these.`,
  },
  // m1.gbp.messaging retired 2026-10-16 (approved retire_messaging_step_v1): Google ended Business Profile chat on 2024-07-31.
  {
    id: "m1.gbp.booking_link", title: "Add appointment booking URL",
    type: "manual", dependsOn: ["m1.gbp.verify", "m1.audit.gbp_duplicate"],
    // 🔒 step10_booking_link_v1 (2026-10-16): the client's portal puts it on Google and reads it back; no Generate runner
    instructions: `The client picks where Google's booking link goes: a page on their website (RGA finds it on their homepage), their booking tool, or "customers call us". The portal checks the link opens, puts it on Google with our tracking tag (utm_source=gbp, utm_medium=booking, utm_campaign=local-seo) in the link type Google offers this business (appointment, or a restaurant's reservations / order-ahead) and reads it back. Done only on a match.
Google refuses the link or it doesn't open: back with the client (Google said + How to fix). Anything else is RGA's, emailed to hello@.
Nightly: if the link on Google changes, this row shows Put back / Keep Google's.`,
  },
  // 🔒 client_social_profiles_v1 (approved 10-31, built 11-01): the client's portal asks and records it; no Generate runner
  {
    id: "m1.brand.social_profiles", title: "Confirm their social profiles",
    type: "manual", dependsOn: [],
    instructions: `The card reads the client's own website for links to Facebook, Instagram, LinkedIn, YouTube, TikTok, X, Yelp and Nextdoor, and the client keeps, changes or adds them in their portal. It spends no search, so it can't be fooled by a business with a similar name.
It reports what it found: "linked from the website", never "this is theirs", and "not linked from the website", never "they don't have one". A site it can't read says Could not check.
Once they answer, the same card drafts the website change that links their profiles and adds them to the page code. It goes through For your approval like any website change, then you publish it and it reads back live.
Each month the broken-link scan checks the links still open and flags a dead one here. Posting for them isn't offered, and nothing goes on their Google profile.`,
  },
  // m1.gbp.qa_seed RETIRED 2026-10-20 (client_portal_final_review_v1): Google ended Business Profile Q&A (Nov 2025 → Jan 2026).
  // The questions belong on the website FAQ (m1.web.expanded_schema, FAQPage). Old task records stay in the JSON, unread.
  {
    id: "m1.web.image_seo", title: "Image SEO: filenames + alt text",
    type: "hybrid", dependsOn: [],
    actionLabel: "⚡ Draft this for me",
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
    // 🔄 11-7 night fixer: the approved step 37 v2 text (admin_step37_image_seo_v2, live in playbooks.json since 049ee3a8), so both sources agree
    instructions: "Draft this for me reads the photos on their website (up to 25 pages: their sitemap, else the home page links) and Claude looks at each photo that has no description, up to 40 in one draft. Icons, decorations, tracking pixels and repeats are left out; the logo gets \"<business name> logo\". A photo that won't open, or that Claude can't make out, is left for you to write, never guessed.\nCheck each line, change any with Edit, then Send: it goes to their For your approval as one website change.\nOnce they approve, put the descriptions on their site (the image settings in their builder, or the alt text in the page code), then Mark live: it reads each page back and refuses if a description isn't on its photo.\nFile names: only for photos RGA uploads from now on, by RGA's rule (their business name, what it shows, their city). Never rename a photo already on their site: it breaks the pages that show it.\nDon't geotag: tested, it has no ranking effect (Google strips photo location data).\nDONE = the approved descriptions are on their website and read back, or the check finds every photo already described.",
  },
  {
    id: "m1.gbp.photos", title: "Upload 20+ quality photos",
    type: "manual", dependsOn: ["m1.access.gbp"],
    actionLabel: "⚡ Draft this for me",
    instructions: "The client's 20-shot list is the researched list for their trade, picked from their Google category (7 lists, 49 trades — netlify/functions/_photo-lists.js). It builds itself when they connect Google and is refreshed nightly; Run rebuilds it, and the business type on this card overrides the category. A category with no list sends nothing — pick the business type here.\nThe list never switches under photos already in its slots unless you pick the business type.\nReview each upload on this step before it goes to Google; the AI flags one that doesn't fit its shot. Sort the photos that were already on Google on this step too — one fills a slot only once you confirm which shot it is.\nNever geotag: tested, it has no ranking effect. Real photos only — turn down stock and screenshots.\nDONE = 20 or more photos on the profile AND at least 3 in each kind the list uses (or all of its slots, if fewer), counted from slots truly filled — read from Google, never ticked.",
  },
  // === Website (order approved 2026-10-08, onboarding_order_audit_v1) ===
  {
    id: "m1.web.https_sitemap", title: "Verify HTTPS + sitemap submission",
    type: "auto", dependsOn: [],
    actionLabel: "⚡ Run the check",
    instructions: `Confirms the site is HTTPS and that /robots.txt and /sitemap.xml both respond.

This gates real work later: the internal-linking and cannibalization audits READ the sitemap to
discover pages. Without one they cannot run at all, so fix this before them, not after.`,
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
    id: "m1.web.nap_consistency", title: "Match NAP across header/footer/contact",
    type: "manual", dependsOn: ["m1.audit.gbp_baseline", "m1.gbp.business_facts"],
    actionLabel: "⚡ Run the check",
    instructions: `Header + footer + contact page = identical Name, Address, Phone.
Use the canonical NAP from GBP. Critical for citation consistency — if these don't match, citation cleanup later won't help.
A service-area business with no public street address matches Name, Phone and the service area instead.`,
  },
  {
    id: "m1.web.schema", title: "Add LocalBusiness schema",
    type: "auto", dependsOn: ["m1.web.nap_consistency", "m1.access.website"],
    actionLabel: "⚡ Generate",
    instructions: `Generates a LocalBusiness JSON-LD block from the client record — name, URL, phone,
locality, area served, and a description built from the primary service and market.

It GENERATES the snippet; it does not install it. Copy the block from the result and paste it into
the homepage <head>.

Check before pasting: the fields come straight from the client record, so a blank phone or market on
the record becomes a blank field in the schema. Fix the record first, then re-run.

Expanded per-service schema is a separate later step ("Add expanded schema").`,
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
    id: "m1.web.gbp_landing_page", title: "Decide which page the Google profile links to",
    type: "manual", dependsOn: ["m1.strategy.keywords_locations"], selfSettles: true,
    // A decision only (approved admin_last_research_items_v1, item 1): saved on the step by the website's admin-gbp-landing / _gbp-landing-run. It writes nothing to Google or the site.
    // 🔒 It decides itself since admin_step42_landing_auto_v1 (11-6): the rule is _gbp-landing.recommendAll, the same for every business.
    instructions: `Runs itself (approved admin_step42_landing_auto_v1, 11-6): it decides which page the Google profile links to, the same way for every business, and says why.
1. When it is this step's turn, it reads Search Console for every keyword in the plan and every search that contains one, over the last 90 days, on the client's own site.
2. Another page wins only with 10 or more impressions across those searches and more clicks than the homepage (then more impressions). A tie, too few searches, none, or a Search Console that can't be read keeps the homepage. With no website on file the step is skipped, and it decides again once a website is added.
3. It saves the page with its reason and the step is done. The card compares the page with the website link the Google profile shows.
4. It reads again each month. A page that now clearly earns more is raised as RGA's move, and Keep records the answer until the numbers change.
RGA can change the page any time with Change…. This saves the decision only. It writes nothing to Google or to the website.
The title, headline and button steps then work on the chosen page, and on the homepage when nothing is saved.`,
  },
  {
    id: "m1.web.homepage_meta", title: "Optimize title + meta on the chosen page",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations", "m1.gbp.optimize_categories", "m1.access.website"],
    actionLabel: "⚡ Draft this for me",
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
    instructions: `Update the <title> + <meta name="description"> of the chosen page (the homepage when none is saved) in your CMS. Verify in browser source view.`,
  },
  {
    id: "m1.web.h1_cta", title: "Fix H1 + primary CTA",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations", "m1.access.website", "m1.web.homepage_meta"],
    actionLabel: "⚡ Draft this for me",
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
    instructions: `Update the hero of the chosen page (the homepage when none is saved) in your CMS:
1. H1 element → AI's H1
2. Sub-headline → AI's SUB
3. Primary button (link to contact form) → AI's PRIMARY_CTA
4. Secondary CTA (tel: link) → AI's SECONDARY_CTA
5. Trust badge row → AI's TRUST_BADGES
Test on mobile (Chrome DevTools → device toolbar).`,
  },
  {
    id: "m1.web.priority_pages", title: "Build/update top 3 service pages",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations", "m1.access.website", "m1.web.homepage_meta", "m1.gbp.services_products"],
    actionLabel: "⚡ Draft this for me",
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
    instructions: "One service page at a time, through For your approval:\n1. Run it: the service comes from what Google lists and their record, and any service the site already has a page for is skipped. The address, links, areas and searches come from data; the brief reads Search Console and competitors' pages; the model writes only the words, and they are checked.\n2. Review the page on the card, flagged lines first. Ask the client for one real result if there is none: it is optional, and the page says less without it.\n3. Send for approval. It builds the real page file and a private preview.\n4. Once they approve: on GitHub access, open the pull request; on a builder, publish it there. It finishes when it reads back live. Then start the next page.",
  },
  {
    id: "m1.web.location_pages", title: "Build a new page for their city",
    type: "hybrid", dependsOn: ["m1.strategy.keywords_locations", "m1.access.website", "m1.gbp.business_facts", "m1.web.homepage_meta", "m1.web.priority_pages"],
    actionLabel: "⚡ Draft this for me",
    // 🔒 10-27: the live drafter is the website's flow-execute (planned by _city-page.js, words checked). The old prompt here asked
    // the model to make up a customer quote — an invented testimonial — and is gone.
    async run() {
      return { summary: "This step drafts in the admin (flow-execute + _city-page.js): one new page for the client's city, planned from data.", outcome: "indeterminate" };
    },
    instructions: `ONE new page for the client's city, through For your approval (approved rga_first_site_change_v1):
1. Run it: the address, the links (the site's own pages for that city, from its sitemap), the areas (the Business Profile's + the plan's) and the files are worked out from data; only the words are drafted, and checked (lengths, the city named, no numbers or promises we can't show).
2. Fill from the site + the run, read every line, edit what isn't true, then Save and send for approval.
3. The client approves THAT version in For your approval (any edit needs a new approval).
4. Publish exactly the approved files (on GitHub: a pull request from rocketgrowthagency-admin), then Mark live: it reads the new page back and refuses if the approved lines aren't there.
Never invent a testimonial, a result or a number. Never copy another page with the city swapped.`,
  },
  {
    id: "m1.web.service_location_matrix", title: "Build service × location matrix pages",
    type: "hybrid", dependsOn: ["m1.web.priority_pages", "m1.web.location_pages"],
    actionLabel: "⚡ Draft this for me",
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
    instructions: "One page at a time, through For your approval. Never a fixed number of pages:\n1. Run it. A site that already has service and area pages gets its weak lines improved (an unsourced study, a claim we can't back, a trade in lowercase in a heading): only those lines change, nothing else on the page. A site with none gets one new page for the first service and area with no page.\n2. Review it on the card and send for approval.\n3. Once they approve: on GitHub access, open the pull request; on a builder, publish it there. It finishes when it reads back live.",
  },
  {
    id: "m1.web.blog_seed", title: "Publish up to 2 seed blog posts (full draft)",
    type: "hybrid", dependsOn: ["m1.web.priority_pages", "m1.strategy.keywords_locations"],
    actionLabel: "⚡ Draft this for me",
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
    instructions: "Up to 2 posts, only while the client has real material (a job, a photo, a number they gave us). With none, publish 0: that is fine.\n1. The card checks first whether their site has a blog. It says found, didn't find or couldn't check, never a flat \"no blog\". If it found none, ask before adding a blog page.\n2. Draft: the post is written from their material only, and its address comes from the check.\n3. Read it, then Send for approval. It builds the real page and a private preview, and shows in the client's For your approval. Nothing goes up without their yes to that exact version.\n4. Once they approve: on GitHub access, open the pull request and merge it; on a builder, publish it there. It finishes when it reads back live.\n5. A second post needs a second fact. No material left: record 0 more and move on.",
  },
  {
    id: "m1.web.expanded_schema", title: "Add Service + Breadcrumb schema",
    type: "hybrid", dependsOn: ["m1.web.schema", "m1.web.priority_pages", "m1.web.location_pages"],
    actionLabel: "⚡ Generate",
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
    instructions: `Per real service page: Service + BreadcrumbList code, read from the page itself, its provider the homepage's business record (by @id). No FAQPage: Google stopped showing FAQ rich results on May 7, 2026; questions stay visible on the page. Merged with the page's existing code, published and read back by the code pipeline (website_steps_46_50_research_v1).`,
  },
  {
    id: "m1.web.internal_linking", title: "Build silo internal-link architecture",
    type: "manual", dependsOn: ["m1.web.https_sitemap", "m1.web.priority_pages", "m1.web.location_pages", "m1.web.service_location_matrix", "m1.web.blog_seed"],
    actionLabel: "⚡ Run the check",
    instructions: `Hub-and-spoke:
- Homepage → all service pages
- Each service page → relevant location pages, 2 blogs, contact
- Location pages → service pages relevant to that area, contact, homepage
- Blog posts → 1-2 most relevant service pages, 1-2 location pages
Use descriptive anchor text (NOT "click here"). Anchor = keyword.`,
  },
  // === Citations & platforms (order approved 2026-10-08, onboarding_order_audit_v1) ===

  {
    id: "m1.cit.priority_top10", title: "Build top-10 priority citations",
    type: "hybrid", dependsOn: ["m1.audit.citations", "m1.web.nap_consistency", "m1.gbp.optimize_categories", "m1.gbp.hours_attributes", "m1.gbp.business_facts"],
    actionLabel: "⚡ Build the list",
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
    // 🔄 citations_52_55_v1 (11-9): the server runner (flow-execute) builds the list from data and reads the details from Google; no model. Same text as playbooks.json.
    instructions: `The run builds this client's list from data: the directories that fit their trade and country, in build order, with the ones the citation audit already found marked live. Every field is read from their Google profile, ready to paste, so every directory says the same words. No model picks a directory.
For each directory on the card:
1. Open sign-up, search it for an existing listing and claim that before creating one (a duplicate splits the listing's standing).
2. Copy the details and paste them.
3. Press Submitted. A search then looks for the listing every 2 days (at most 10 times) and marks it live only when it finds it naming the business with the same phone and website. A directory a search can't prove asks for the listing link instead, and the link is checked.
A directory that doesn't fit: Not for this business, with a reason. For a business with no public street address, a directory whose own page says it needs one waits and doesn't hold the step up.
DONE = every directory that fits is live or marked not for this business by a person. It finishes itself.`,
  },
  {
    id: "m1.cit.industry_specific", title: "Build industry-specific citations",
    type: "hybrid", dependsOn: ["m1.audit.citations", "m1.gbp.business_facts"],
    actionLabel: "⚡ Build the list",
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
    // 🔄 citations_52_55_v1 (11-9): RGA's own list per trade, never a model's suggestion. Same text as playbooks.json.
    instructions: `The run reads the client's trade and builds the list from RGA's own researched list for that trade (home services, medical, legal, restaurants, marketing and web agencies). No model suggests a directory. A trade with no list yet says so: skip the step, or add a researched list. Directories found by searching real business names are shown beside it when that search is switched on.
Each directory works like Build top-10 priority citations: open sign-up, copy the details (read from their Google profile), press Submitted, and the listing is proven live by a search or by its link.
DONE = every directory on the list is live or marked not for this business by a person. It finishes itself.`,
  },
  {
    id: "m1.platform.yelp", title: "Claim and complete the Yelp profile",
    // 🔄 citations_52_55_v1 (11-9): a server runner reads the details; the card proves the claim and the page. Same text as playbooks.json.
    type: "hybrid", dependsOn: ["m1.gbp.optimize_categories", "m1.gbp.hours_attributes", "m1.gbp.business_facts"],
    actionLabel: "⚡ Read the details",
    instructions: `Yelp (https://biz.yelp.com/): the profile belongs to the client, never to RGA. The run reads the details from their Google profile so every field is ready to paste.
1. Claimed: claim the page (Yelp verifies by phone or email, so the client takes the code), then paste the page link. It's proven theirs by reading the page, or, when Yelp won't let the page be read, by one search that shows it; the card says which.
2. Complete it: photos, hours, categories, the description and the website, the same words as Google. Press Done.
3. Checked: the page is read again for the same phone and website.
Never ask a customer for a Yelp review (Yelp bars it). Never advertise on Yelp as part of this.
This is profile hygiene, not AI work: it makes no promise about any AI tool or any ranking. If Yelp will not list the business, skip the step with that reason.
DONE = claimed, completed and checked. It finishes itself.`,
  },
  {
    id: "m1.platform.mentions", title: "Get mentioned on other sites",
    // 🔄 citations_52_55_v1 (11-9): a server runner finds the places by search; the card drafts, records and proves. Same text as playbooks.json.
    type: "hybrid", dependsOn: ["m1.gbp.optimize_categories", "m1.gbp.business_facts"],
    actionLabel: "⚡ Find places",
    instructions: `Real sources only. No pay-for-placement, no fake lists, no mention that is not a real page about the business.
The run finds the places by searching near the client (a chamber of commerce, business associations, a trade association, local news): never a made-up list. At most 4 searches, once. RGA can add a real place it knows (a partner or a supplier) by its link.
For each place on the card: Draft the ask (written from the client's real facts; it never chooses the place), copy it, send it from RGA's email or their contact page, then press Asked. A search then looks on that site for a page naming the business every 2 days (at most 10 times) and marks the mention live when it finds one. A place that says no or doesn't fit: Not for this business, with a reason.
Why: a mention is a real page a person can read, and that is the reason to do it. No study shows that mentions make an AI tool name a business, so this makes no promise about any AI tool or any ranking.
DONE = every place RGA asked is live or marked not for this business. It finishes itself.`,
  },
  {
    id: "m1.platform.bing_apple", title: "Set up Bing Places + Apple Business",
    type: "manual", dependsOn: ["m1.gbp.optimize_categories", "m1.gbp.hours_attributes", "m1.gbp.business_facts"],
    instructions: `Bing Places (https://www.bingplaces.com/) and Apple Business (https://business.apple.com/, which replaced Apple's older Business Connect on April 14, 2026) are two rows of Build top-10 priority citations. This step shows those same two rows, so the two steps can't disagree: a press on either one shows on both.
For each: search it for an existing listing and claim that before creating one. Copy the details (read from their Google profile, the same words as Google), sign up, press Submitted. Leave any "Import from Google" or listing sync off. Apple usually calls the number on record, so the client takes the code. Then paste the listing link: it's checked that it opens and names the business.
Both are free.
DONE = both are live or marked not for this business. It finishes itself. A tick from before this card reads "Done, but not proven" until then.`,
  },
  {
    id: "m1.gbp.knowledge_panel", title: "Claim + optimize brand knowledge panel",
    type: "manual", dependsOn: ["m1.gbp.photos", "m1.audit.social"],
    actionLabel: "⚡ Draft this for me",
    instructions: `Runs itself in the morning run (no Run button): one search of the brand name, no model. Google's knowledge panel is compared with their profile, the same details step 52 reads.
Their profile shows and the name, phone and website agree: done by itself. A detail differs: your move, fix it on the profile (the business facts step). A brand panel that is not their profile: your move, claim it ("Claim this knowledge panel", signed in to an account on their official site or YouTube). No panel yet: done, normal for a business few people search by name.
A search that could not be read is never "no panel": it tries again tomorrow. It looks again each quarter.`,
  },
  {
    id: "m1.brand.youtube_setup", title: "Their YouTube channel",
    type: "hybrid", dependsOn: [],
    actionLabel: "⚡ Draft this for me",
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
    instructions: "1. The channel is the one the client confirmed on the social profiles step: use it, never make a second. With none confirmed, wait for the client.\n2. The card has the description and links ready to paste, read from their Google profile (the same words as Google). Open YouTube Studio → Customization → Profile, paste them, then press Pasted. Branding: upload the logo + a banner (1546 × 423 with phone + website + tagline).\n3. Done when the channel is confirmed and the details are pasted. Until YouTube's API is approved, that press is the only proof.\n4. The two short scripts are drafted from this card (Draft the scripts); the client films them on their video step. The clips are optional: when one arrives, download it, post it on the channel with the drafted title / description / tags, and paste the video link (it is checked that it opens). Clips never hold the step or reopen it.",
  },
  // === Reviews (order approved 2026-10-08, onboarding_order_audit_v1) ===
  {
    id: "m1.review.system", title: "Write the review request message",
    type: "hybrid", dependsOn: ["m1.gbp.verify"],
    actionLabel: "⚡ Draft this for me",
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
  <30-second talk track for Chris/team to use when calling a past customer>

NOTE: include {{review_link}} where the URL goes — don't hardcode the URL.`,
        `Business: ${client.business_name}\nService: ${client.primary_service}\nMarket: ${client.primary_market}`,
        { maxTokens: 900 },
      );

      return {
        summary: `Review acquisition kit:\n\nGOOGLE REVIEW LINK:\n  ${reviewLink}\n\n${draft}\n\nSubstitute {{review_link}} with the URL above when sending. Substitute {{first_name}} with the customer's first name.`,
        outcome_data: { google_review_link: reviewLink, templates_drafted: true },
      };
    },
    instructions: `Press ⚡ and it drafts the message with the client's Google review link. The client approves it, then sends each request themselves from their own phone or email, in one tap. RGA never sends one.
One ask, plus one reminder after 3 days if they haven't reviewed. Never a second reminder. If a customer says stop, stop.
Everyone gets asked the same way, picked by how recently the job finished. Never pick the people you expect to rate well: Google doesn't allow asking selectively.
There's no review-rate goal. Count asks sent and reviews received, and report both as measured.`,
  },
  {
    id: "m1.review.first_5", title: "Ask 5 recent customers for a review",
    type: "manual", dependsOn: ["m1.review.system"],
    actionLabel: "⚡ Draft this for me",
    instructions: `The client asks their 5 most recently finished jobs, whoever they are, one at a time. RGA writes each request; the client sends it from their own phone or email.
Done means 5 asks sent, by week 3. Reviews are a result, counted as they come, never a target.`,
  },
  {
    id: "m1.review.response", title: "Respond to all existing reviews",
    type: "hybrid", dependsOn: ["m1.gbp.verify"],
    actionLabel: "⚡ Draft replies",
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
    instructions: `Runs itself in the morning run (no Run button): reads their reviews from Google. No reviews yet: done by itself. Otherwise a reply is drafted for each unanswered review and goes to the client's For your approval; each posts when they approve it.
Positive: refer to what the customer actually wrote, use their name sparingly, no keywords, and never repeat the same sentence across replies. Negative: empathize + offer offline resolution.
Done when every review that was there has a reply seen live on Google. Until then the portal does not say "Replied". A read that failed is never "no reviews".`,
  },
  // === Close the month (order approved 2026-10-08, onboarding_order_audit_v1) ===

  {
    id: "m1.report.month1", title: "Build + deliver Month 1 report",
    type: "hybrid", dependsOn: ["m1.audit.kpi_baseline"],
    actionLabel: "⚡ Generate",
    async run({ clientId }) {
      const { saveAndPublishReport } = await import("../../lib/report-generator.mjs");
      const result = await saveAndPublishReport(clientId, { publish: true });
      return {
        summary: `Report generated + published to portal.\n  Local: ${result.filePath}\n  Portal id: ${result.portalRow?.id}\n  Stats: ${result.summary.tasks_done} tasks done, ${result.summary.rankings_count} keywords tracked`,
        outcome_data: result.summary,
      };
    },
    instructions: `Builds itself once the step before it is finished and kickoff + 27 days have passed (no Run button). Read the report on this card, then press Send: it asks once more, naming who it goes to. The sent email is the step's proof.`,
  },
  {
    id: "m1.call.close", title: "Close-out call",
    type: "manual", dependsOn: ["m1.report.month1"],
    actionLabel: "⚡ Draft this for me",
    instructions: `30-min call. Walk through report, set Month 2 expectations.
Confirm next monthly call date. Month 2 starts on its own under the contract, so there's no approval to collect.`,
  },
  {
    id: "m1.handoff.month2", title: "Transition to monthly cycle",
    type: "auto", dependsOn: ["m1.call.close"],
    actionLabel: "⚡ Run the hand-off",
    instructions: `Runs itself once the Month 1 report is sent or skipped and the close-out call is settled (no Run button, and no Skip: it is the move into Month 2 itself). Creates next month's record and reads it back, then lists each Month 1 step still open by name and each skipped one with its reason. Nothing is dropped.`,
    async run({ clientId }) {
      const { ensureMonthlyState } = await import("../state.mjs");
      await ensureMonthlyState(clientId);
      return { summary: `Initialized Month 2+ record. Use \`node flow.mjs ${clientId} next --monthly\` to start.` };
    },
  },
];
