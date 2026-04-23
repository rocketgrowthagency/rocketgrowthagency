#!/usr/bin/env node
// Gmail snippet generator for RGA outreach.
//
// For a given Airtable lead (by slug, email, or business name), generates
// the ready-to-paste email:
//   - Subject line (V1 or V2 variant)
//   - HTML body with personalized merge + clickable video thumbnail
//   - Opens a preview in your default browser — Cmd+A, Cmd+C, paste into Gmail
//
// Usage:
//   node send-prep.mjs pacific-plumbing-team        # lookup by slug
//   node send-prep.mjs info@example.com             # lookup by email
//   node send-prep.mjs "Pacific Plumbing Team"      # lookup by name (quote it)
//   node send-prep.mjs pacific-plumbing-team --variant=V2
//   node send-prep.mjs --next                       # auto-pick next status=new lead with video
//   node send-prep.mjs --list                       # list all sendable leads

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import slugify from "slugify";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE_NAME || "Leads";
const hdr = { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" };

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const VARIANT = (flags.find((f) => f.startsWith("--variant="))?.slice(10) || "V1").toUpperCase();
const LIST_MODE = flags.includes("--list");
const NEXT_MODE = flags.includes("--next");

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env");
  process.exit(1);
}

async function fetchAllLeads() {
  const all = [];
  let offset = null;
  do {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u, { headers: hdr });
    if (!res.ok) throw new Error(`Airtable fetch ${res.status}`);
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

function pickLead(leads, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  // Try slug match first
  for (const r of leads) {
    const s = slugify(r.fields?.["Business Name"] || "", { lower: true, strict: true });
    if (s === q) return r;
  }
  // Email match
  for (const r of leads) {
    if (String(r.fields?.Email || "").toLowerCase() === q) return r;
  }
  // Business name match
  for (const r of leads) {
    if (String(r.fields?.["Business Name"] || "").toLowerCase() === q) return r;
  }
  // Substring name match
  for (const r of leads) {
    if (String(r.fields?.["Business Name"] || "").toLowerCase().includes(q)) return r;
  }
  return null;
}

function pickNextSendable(leads) {
  return leads.find((r) => {
    const f = r.fields || {};
    return (String(f.Status || "").toLowerCase() === "new" || !f.Status)
      && f["Video URL"]
      && f.Email;
  });
}

function buildSubject(lead, variant) {
  const f = lead.fields || {};
  const name = f["Business Name"] || "your business";
  const rank = f["Map Rank"] != null ? String(f["Map Rank"]) : "";
  const term = f["Search Term"] || "";
  if (variant === "V2" && rank && term) {
    return `${name} is ranking #${rank} for "${term}"`;
  }
  return `Short walkthrough for ${name}`;
}

function firstName(fullName) {
  const f = String(fullName || "").trim().split(/\s+/)[0] || "";
  return f || "there";
}

function buildHtml(lead, variant) {
  const f = lead.fields || {};
  const name = f["Business Name"] || "your business";
  const rank = f["Map Rank"] != null ? String(f["Map Rank"]) : "";
  const city = f.City || "";
  const term = f["Search Term"] || "";
  const videoUrl = f["Video URL"] || "";
  const thumbUrl = videoUrl ? videoUrl.replace(/\/$/, "") + "/thumb.jpg" : "";
  const contactFirst = firstName(f["Contact Name"] || f["First Name"] || "");

  const thumbnailBlock = videoUrl
    ? `<a href="${videoUrl}" style="display:inline-block;margin:8px 0;"><img src="${thumbUrl}" alt="Video walkthrough for ${name}" width="560" style="max-width:100%;border:0;border-radius:12px;"></a>`
    : `<p style="color:#b91c1c;"><em>No Video URL in Airtable for this lead — generate landing page first.</em></p>`;

  let body;
  if (variant === "V2") {
    body = `
      <p>Hey ${contactFirst},</p>
      <p>Quick note: <strong>${name}</strong> is currently ranking #${rank || "?"} on Google Maps for "${term}"${city ? ` in ${city}` : ""}. The top 3 results are pulling most of the calls from that search.</p>
      <p>I made a short walkthrough showing exactly what's costing you those leads and the specific fixes we'd make in the first 30 days:</p>
      ${thumbnailBlock}
      <p>If you'd like the full written audit, grab it free from the video page — no strings.</p>
      <p>Talk soon,<br>Chris<br>Rocket Growth Agency</p>
    `;
  } else {
    body = `
      <p>Hey ${contactFirst},</p>
      <p>I recorded a ~75-second walkthrough of how <strong>${name}</strong> currently shows up on Google Maps and on your website — here's what I noticed and what we'd change to bring more calls and qualified leads in.</p>
      ${thumbnailBlock}
      <p>On the video page, there's a button to grab your full Free Growth Audit (written version with the exact fixes and a 90-day plan). It's genuinely free — no call required.</p>
      <p>Talk soon,<br>Chris<br>Rocket Growth Agency<br><a href="mailto:hello@rocketgrowthagency.com">hello@rocketgrowthagency.com</a></p>
    `;
  }

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>RGA outreach preview — ${name}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.55;}.meta{background:#fff7ed;border:1px solid #fed7aa;padding:12px 16px;border-radius:8px;margin-bottom:20px;color:#7c2d12;font-size:14px;}.meta strong{color:#9a3412;}</style>
</head>
<body>
<div class="meta">
  <strong>RGA Send Preview — ${variant}</strong><br>
  TO: <code>${f.Email || "(no email)"}</code><br>
  SUBJECT: <code>${buildSubject(lead, variant)}</code><br>
  <br>
  Select ALL below (Cmd+A), copy (Cmd+C), paste into Gmail compose.
  <br>The preview area above (this box) won't be copied if you select from below only.
</div>
<hr>
${body}
</body></html>`;
}

async function main() {
  const leads = await fetchAllLeads();

  if (LIST_MODE) {
    const sendable = leads.filter((r) => r.fields?.["Video URL"] && r.fields?.Email).sort((a, b) => {
      const sa = String(a.fields.Status || "new").toLowerCase();
      const sb = String(b.fields.Status || "new").toLowerCase();
      return sa.localeCompare(sb);
    });
    console.log(`\nSendable leads (have Email + Video URL): ${sendable.length}`);
    console.log("─".repeat(80));
    sendable.forEach((r, i) => {
      const f = r.fields;
      const slug = slugify(f["Business Name"] || "", { lower: true, strict: true });
      console.log(`${String(i + 1).padStart(3)}. ${(f["Business Name"] || "").padEnd(40)} [${(f.Status || "new").padEnd(10)}] ${slug}`);
    });
    console.log("\nPick one:  node send-prep.mjs <slug>  [--variant=V2]");
    return;
  }

  const lead = NEXT_MODE ? pickNextSendable(leads) : pickLead(leads, positional[0]);
  if (!lead) {
    console.error("No matching lead. Try: node send-prep.mjs --list");
    process.exit(1);
  }

  const f = lead.fields || {};
  const subject = buildSubject(lead, VARIANT);
  const html = buildHtml(lead, VARIANT);
  const previewPath = "/tmp/rga-email-preview.html";
  writeFileSync(previewPath, html);

  console.log(`\n─── READY TO SEND ───`);
  console.log(`Business: ${f["Business Name"]}`);
  console.log(`To:       ${f.Email}`);
  console.log(`Subject:  ${subject}`);
  console.log(`Variant:  ${VARIANT}`);
  console.log(`Video:    ${f["Video URL"] || "(missing)"}`);
  console.log(`\nPreview opening in your browser now.`);
  console.log(`In the browser: Cmd+A, Cmd+C → switch to Gmail → paste into compose → send.`);
  console.log(`Apps Script will auto-update Airtable within 5 min.\n`);

  spawn("open", [previewPath], { stdio: "ignore", detached: true }).unref();
}

main().catch((err) => { console.error("Error:", err.message || err); process.exit(1); });
