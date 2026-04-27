#!/usr/bin/env node
// GBP CLI — quick commands against any client's Google Business Profile.
// Requires: client has connected Google + has gbp_location_id in client_google_oauth.
//
// Usage:
//   node gbp.mjs <client_id> profile
//   node gbp.mjs <client_id> reviews
//   node gbp.mjs <client_id> reply <reviewId>           # AI-drafts a reply, asks before posting
//   node gbp.mjs <client_id> post <theme>               # AI-drafts a GBP post, asks before posting
//   node gbp.mjs <client_id> calendar                   # 4-post monthly calendar (preview only)
//   node gbp.mjs <client_id> categories <searchTerm>    # search GBP categories
//   node gbp.mjs <client_id> set-description            # AI-drafts a description, asks before saving
//   node gbp.mjs <client_id> insights                   # last 30 days impressions/calls/clicks/directions

import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { gbpFor } from "./lib/gbp-automation.mjs";
import { draftGbpPost, draftReviewReply, draftBusinessDescription, draftMonthlyPostCalendar } from "./lib/gbp-content-ai.mjs";

const [, , clientId, cmd, ...rest] = process.argv;
if (!clientId || !cmd) {
  console.error("Usage: node gbp.mjs <client_id> <profile|reviews|reply|post|calendar|categories|set-description|insights> [args]");
  process.exit(1);
}

async function fetchClientMeta(clientId) {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${supaUrl}/rest/v1/clients?id=eq.${clientId}&select=business_name,primary_service,primary_market,primary_contact_name`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  const rows = await r.json();
  return rows?.[0] || {};
}

async function confirm(prompt) {
  const rl = readline.createInterface({ input, output });
  const ans = await rl.question(`${prompt} (y/N) `);
  rl.close();
  return ans.trim().toLowerCase() === "y";
}

const gbp = await gbpFor(clientId);
const meta = await fetchClientMeta(clientId);

switch (cmd) {
  case "profile": {
    const p = await gbp.getProfile();
    console.log(JSON.stringify(p, null, 2));
    break;
  }
  case "reviews": {
    const r = await gbp.listReviews();
    const reviews = r?.reviews || [];
    console.log(`\n${reviews.length} reviews:\n`);
    reviews.forEach((rv) => {
      const rating = ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 })[rv.starRating] || rv.starRating;
      console.log(`★${rating}  ${rv.reviewer?.displayName || "Anon"}  ${rv.updateTime}`);
      console.log(`  "${(rv.comment || "(no text)").slice(0, 200)}"`);
      console.log(`  reply: ${rv.reviewReply ? "✓" : "—"}  id: ${rv.name}`);
      console.log();
    });
    break;
  }
  case "reply": {
    const reviewId = rest[0];
    if (!reviewId) { console.error("Usage: reply <reviewId>"); process.exit(1); }
    const all = await gbp.listReviews();
    const rv = (all.reviews || []).find((r) => r.name === reviewId || r.name?.endsWith(`/${reviewId}`));
    if (!rv) { console.error(`Review ${reviewId} not found`); process.exit(1); }
    const rating = ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 })[rv.starRating] || 5;
    const draft = await draftReviewReply({
      businessName: meta.business_name,
      reviewerName: rv.reviewer?.displayName,
      starRating: rating,
      reviewText: rv.comment,
      ownerName: meta.primary_contact_name,
    });
    console.log(`\n--- DRAFT REPLY ---\n${draft}\n--- END ---\n`);
    if (await confirm("Post this reply?")) {
      await gbp.replyToReview(rv.name, draft);
      console.log("✓ Reply posted.");
    } else {
      console.log("Cancelled.");
    }
    break;
  }
  case "post": {
    const theme = rest.join(" ") || "weekly tip";
    const draft = await draftGbpPost({
      businessName: meta.business_name,
      primaryService: meta.primary_service,
      primaryMarket: meta.primary_market,
      theme,
    });
    console.log(`\n--- DRAFT POST (${theme}) ---\n${draft}\n--- END ---\n`);
    if (await confirm("Publish this post to GBP?")) {
      const r = await gbp.createPost({ summary: draft });
      console.log("✓ Posted.", r?.name || "");
    } else {
      console.log("Cancelled.");
    }
    break;
  }
  case "calendar": {
    const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
    const cal = await draftMonthlyPostCalendar({
      businessName: meta.business_name,
      primaryService: meta.primary_service,
      primaryMarket: meta.primary_market,
      monthLabel: month,
    });
    console.log(`\n=== ${month} GBP Post Calendar ===\n`);
    cal.forEach((p, i) => {
      console.log(`--- Week ${i + 1}: ${p.theme} ---`);
      console.log(p.body);
      console.log();
    });
    break;
  }
  case "categories": {
    const term = rest.join(" ") || meta.primary_service;
    const r = await gbp.searchCategories(term);
    (r?.categories || []).forEach((c) => console.log(`${c.name}  →  ${c.displayName}`));
    break;
  }
  case "set-description": {
    const draft = await draftBusinessDescription({
      businessName: meta.business_name,
      primaryService: meta.primary_service,
      primaryMarket: meta.primary_market,
    });
    console.log(`\n--- DRAFT DESCRIPTION (${draft.length} chars) ---\n${draft}\n--- END ---\n`);
    if (await confirm("Save to GBP?")) {
      await gbp.updateDescription(draft);
      console.log("✓ Description updated.");
    } else {
      console.log("Cancelled.");
    }
    break;
  }
  case "insights": {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 30);
    const data = await gbp.fetchInsights({
      metrics: [
        "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
        "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
        "CALL_CLICKS",
        "WEBSITE_CLICKS",
        "BUSINESS_DIRECTION_REQUESTS",
      ],
      startDate: start, endDate: end,
    });
    const series = data?.multiDailyMetricTimeSeries?.[0]?.dailyMetricTimeSeries || [];
    series.forEach((s) => {
      const total = (s.timeSeries?.datedValues || []).reduce((sum, d) => sum + Number(d.value || 0), 0);
      console.log(`${s.dailyMetric.padEnd(40)}  ${total}`);
    });
    break;
  }
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
