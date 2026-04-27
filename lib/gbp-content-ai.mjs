// AI content generator for GBP — posts, review replies, business descriptions.
// Uses OpenAI. Outputs are TIGHT, business-personal, never sound like a bot.
//
// Usage:
//   import { draftGbpPost, draftReviewReply, draftBusinessDescription } from "./lib/gbp-content-ai.mjs";
//   const post = await draftGbpPost({ businessName, primaryService, primaryMarket, theme: "weekly tip" });

import "dotenv/config";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.GBP_AI_MODEL || "gpt-4o-mini";

async function chat(systemPrompt, userPrompt, { maxTokens = 400, temperature = 0.7 } = {}) {
  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  return r.choices?.[0]?.message?.content?.trim() || "";
}

// --- GBP POSTS ---
// Themes: "weekly tip" | "service highlight" | "seasonal" | "before-after" | "team intro" | "review highlight"
export async function draftGbpPost({ businessName, primaryService, primaryMarket, theme = "weekly tip", extraContext = "" }) {
  const sys = `You write short Google Business Profile posts (max 1500 chars, ideally 150-300). They sound like the business owner wrote them — warm, specific, never markety. NO emojis unless the business is consumer-leisure. NO hashtags. NO "Click below!" or "Don't miss out!" — keep it concrete and useful. End with one clear next step (call, book, visit) but make it feel natural, not pushy. Write in plain prose.`;
  const user = `Business: ${businessName}
Service: ${primaryService}
Market: ${primaryMarket}
Post theme: ${theme}
${extraContext ? `Extra context: ${extraContext}` : ""}

Write the post body only. No headline, no quotes around it.`;
  return chat(sys, user, { maxTokens: 350, temperature: 0.8 });
}

// --- REVIEW REPLIES ---
// Tailors to star rating. 5-star = warm thanks. 1-3 = empathetic + offer to fix offline.
export async function draftReviewReply({ businessName, reviewerName, starRating, reviewText, ownerName = "" }) {
  const tone = starRating >= 4
    ? "warm, brief, specific (refer to something they mentioned), grateful without being sycophantic"
    : "empathetic, ownership-taking, brief, offers to make it right offline. Do NOT argue or get defensive. Do NOT include 'I'm sorry you feel that way' — own the issue.";

  const sys = `You write Google Business Profile review replies for the business owner. Tone: ${tone}. Length: 2-4 sentences max. Address the reviewer by first name if given. Sign with "${ownerName || "the team"}" or just "Thanks again" — natural, not formal. NO emojis. NO over-the-top language. Sound human.`;
  const user = `Business: ${businessName}
Reviewer: ${reviewerName || "Anonymous"}
Stars: ${starRating}
Review: """${reviewText || "(no text)"}"""

Write the reply body only.`;
  return chat(sys, user, { maxTokens: 220, temperature: 0.6 });
}

// --- BUSINESS DESCRIPTION ---
// 750 char hard cap on GBP description.
export async function draftBusinessDescription({ businessName, primaryService, primaryMarket, services = [], yearsInBusiness = "", differentiators = "" }) {
  const sys = `You write Google Business Profile descriptions. HARD LIMIT: 750 characters. Optimize for local search but DO NOT keyword-stuff. Lead with what they do + where. Mention 2-3 specific services. End with the contact action. Plain prose, no bullet points, no emojis. Sound like the owner wrote it.`;
  const user = `Business: ${businessName}
Primary service: ${primaryService}
Market: ${primaryMarket}
Other services: ${services.join(", ")}
${yearsInBusiness ? `Years in business: ${yearsInBusiness}` : ""}
${differentiators ? `What makes them different: ${differentiators}` : ""}

Write the description body only. Stay under 750 characters.`;
  const out = await chat(sys, user, { maxTokens: 320, temperature: 0.6 });
  return out.length > 750 ? out.slice(0, 747) + "..." : out;
}

// --- BATCH: monthly post calendar (4 posts) ---
export async function draftMonthlyPostCalendar({ businessName, primaryService, primaryMarket, monthLabel }) {
  const themes = ["weekly tip", "service highlight", "seasonal relevance to this month", "behind-the-scenes / team / process"];
  const posts = [];
  for (const theme of themes) {
    const body = await draftGbpPost({
      businessName, primaryService, primaryMarket,
      theme,
      extraContext: `Month context: ${monthLabel}`,
    });
    posts.push({ theme, body });
  }
  return posts;
}
