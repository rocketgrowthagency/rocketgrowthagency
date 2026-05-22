#!/usr/bin/env node
// scripts/recover-bounced-emails.mjs
//
// BOUNCE RECOVERY DRIVER (locked 2026-05-22)
//
// Reads Airtable Leads where Email Status === 'queued-recovery' (flagged by
// Apps Script processBouncedLeads() the morning after a bounce was detected).
// For each, attempts to find a REPLACEMENT email via:
//   1. Re-scrape the business's Website URL (multiple paths: /, /contact,
//      /about, /team, /staff, /support, /sales)
//   2. SerpAPI fallback: search '"{Business Name}" "{City}" contact email'
//      for emails surfaced in result snippets we haven't seen yet
//   3. Validate every candidate against lib/email-validation.cjs (the A11
//      placeholder filter) so we never re-queue a fake/sample address
//
// If a NEW email is found (differs from the bounced address):
//   - Updates Lead.Email to the new value
//   - Clears Email Status (empty → re-eligible for active funnel)
//   - Clears Draft Created (so next morning runMorningOutreach re-queues)
//   - Resets Status to 'new' (so it flows through fresh-send filter)
//   - Adds Outreach Notes line: "[recovered: <date> via <source>] <new-email>"
//
// If NO new email found:
//   - Sets Email Status = 'no-replacement-found' (terminal)
//   - Sets Status = 'dead'
//   - Adds Outreach Notes line: "[no-replacement: <date>] - sources tried: ..."
//
// Apps Script's createOutreachDrafts + queueResendDrafts + advanceFunnelState
// all filter out 'no-replacement-found' so terminal leads never re-enter funnel.
//
// Design choice (locked): we do NOT migrate leads between `Leads` ↔ `Leads
// No Email` tables. Moving would orphan Outreach Log linked records. Terminal
// Email Status is the filter for "permanently no working email."
//
// USAGE:
//   node scripts/recover-bounced-emails.mjs           # process all queued
//   node scripts/recover-bounced-emails.mjs --limit 5 # process 5 at a time
//   node scripts/recover-bounced-emails.mjs --dry-run # print only, no writes
//
// ENV:
//   AIRTABLE_API_KEY (required)
//   AIRTABLE_BASE_ID (required)
//   SERPAPI_KEY      (optional — falls back to site-scrape only if missing)
//
// CRON: Add to scraper crontab to run nightly, e.g.:
//   0 3 * * * cd /path/to/scraper && node scripts/recover-bounced-emails.mjs

import "dotenv/config";
import axios from "axios";
import path from "path";
import url from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Reuse the canonical placeholder-email filter (A11) so we never re-queue
// a fake / sample / test address even if a competitor site has one in the footer.
const { isLikelyEmail } = require(path.join(REPO_ROOT, "lib/email-validation.cjs"));

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
const AIRTABLE_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_HEADERS = { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" };

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const LIMIT = (() => {
  const i = ARGS.indexOf("--limit");
  return i >= 0 ? parseInt(ARGS[i + 1], 10) : Infinity;
})();

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in env.");
  process.exit(1);
}

// ============================================================
// Email extraction (copied from email-recovery.mjs — same patterns)
// ============================================================
const EMAIL_BAD_PATTERNS = [
  /^user@domain\.com$/i, /^email@domain\.com$/i, /^example@example\./i,
  /^example@gmail\.com$/i, /^you@/i, /^your@/i, /^yourname@/i,
  /^test@test\./i, /^noreply@/i, /^no-reply@/i, /^donotreply@/i,
  /^info@yourdomain\./i, /@localhost$/i,
  /@sentry/i, /@wixpress\.com$/i, /@wix\.com$/i,
  /@cdn\./i, /@static\./i, /@google-analytics\./i, /@googletagmanager\./i,
  /@facebook\.com$/i, /@instagram\.com$/i, /@twitter\.com$/i,
  /\.(gif|jpg|png|jpeg|svg|webp|css|js|woff|ttf)$/i,
];
const CANDIDATE_PATHS = ["/", "/contact", "/contact-us", "/about", "/about-us", "/team", "/staff", "/support", "/sales"];

function cleanEmail(raw) {
  if (!raw) return "";
  let e = String(raw).trim().toLowerCase();
  e = e.replace(/^mailto:/i, "").split("?")[0].replace(/[.,;:'")>]+$/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return "";
  if (EMAIL_BAD_PATTERNS.some((p) => p.test(e))) return "";
  const local = e.split("@")[0] || "";
  if (/^[0-9a-f]{24,}$/i.test(local)) return "";
  // A11 placeholder filter — the single source of truth for "fake email" detection
  if (typeof isLikelyEmail === "function" && !isLikelyEmail(e)) return "";
  return e;
}

async function tryFetch(u) {
  try {
    const r = await axios.get(u, {
      timeout: 8000,
      maxRedirects: 4,
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
      validateStatus: () => true,
    });
    return r.status >= 200 && r.status < 400 ? String(r.data || "") : "";
  } catch {
    return "";
  }
}

function extractEmailsFromHtml(html) {
  const found = new Set();
  const mailto = html.match(/mailto:([^"'?\s>]+)/gi) || [];
  mailto.forEach((m) => { const e = cleanEmail(m.replace(/^mailto:/i, "")); if (e) found.add(e); });
  // Bare emails in text
  const bare = html.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
  bare.forEach((b) => { const e = cleanEmail(b); if (e) found.add(e); });
  return Array.from(found);
}

async function scrapeSiteForEmails(website, excludeEmail) {
  if (!website) return { emails: [], source: null };
  let base = String(website).trim();
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  let origin;
  try { origin = new URL(base).origin; } catch { return { emails: [], source: null }; }

  const candidates = new Set();
  for (const p of CANDIDATE_PATHS) {
    const html = await tryFetch(origin + p);
    if (!html) continue;
    const emails = extractEmailsFromHtml(html);
    for (const e of emails) {
      if (e !== excludeEmail) candidates.add(e);
    }
    if (candidates.size > 0) return { emails: Array.from(candidates), source: `site:${origin}${p}` };
  }
  return { emails: [], source: null };
}

// ============================================================
// SerpAPI fallback
// ============================================================
async function serpapiSearchEmails(businessName, city, excludeEmail) {
  if (!SERPAPI_KEY) return { emails: [], source: null };
  if (!businessName) return { emails: [], source: null };
  const query = `"${businessName}"${city ? ' "' + city + '"' : ""} (contact OR email)`;
  const u = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(SERPAPI_KEY)}&num=10`;
  try {
    const r = await axios.get(u, { timeout: 10000, validateStatus: () => true });
    if (r.status !== 200) return { emails: [], source: null };
    const txt = JSON.stringify(r.data || {});
    const found = extractEmailsFromHtml(txt).filter((e) => e !== excludeEmail);
    return { emails: found, source: found.length > 0 ? "serpapi" : null };
  } catch {
    return { emails: [], source: null };
  }
}

// ============================================================
// Airtable I/O
// ============================================================
async function fetchQueuedLeads() {
  const all = [];
  let offset = null;
  const filter = encodeURIComponent("{Email Status} = 'queued-recovery'");
  do {
    let u = `${AIRTABLE_BASE}/Leads?pageSize=100&filterByFormula=${filter}`;
    if (offset) u += `&offset=${encodeURIComponent(offset)}`;
    const r = await axios.get(u, { headers: AIRTABLE_HEADERS, validateStatus: () => true });
    if (r.status !== 200) {
      console.error(`Airtable fetch HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
      break;
    }
    all.push(...(r.data?.records || []));
    offset = r.data?.offset;
  } while (offset);
  return all;
}

async function patchLead(leadId, fields) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] PATCH ${leadId} ←`, JSON.stringify(fields).slice(0, 300));
    return true;
  }
  const r = await axios.patch(`${AIRTABLE_BASE}/Leads/${leadId}`, { fields, typecast: true }, { headers: AIRTABLE_HEADERS, validateStatus: () => true });
  if (r.status >= 300) {
    console.error(`  PATCH failed (${r.status}): ${JSON.stringify(r.data).slice(0, 200)}`);
    return false;
  }
  return true;
}

function isoDateOnly(d = new Date()) { return d.toISOString().slice(0, 10); }

// ============================================================
// Main
// ============================================================
async function main() {
  console.log(`recover-bounced-emails — ${DRY_RUN ? "DRY-RUN" : "LIVE"} mode${isFinite(LIMIT) ? `, limit=${LIMIT}` : ""}`);
  const leads = await fetchQueuedLeads();
  console.log(`\nFound ${leads.length} leads with Email Status='queued-recovery'`);
  if (leads.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  const batch = leads.slice(0, LIMIT);

  let recovered = 0, terminal = 0, errored = 0;
  for (let i = 0; i < batch.length; i++) {
    const lead = batch[i];
    const f = lead.fields || {};
    const business = f["Business Name"] || "(unknown)";
    const bouncedEmail = String(f.Email || "").toLowerCase();
    const website = f.Website || "";
    const city = f.City || "";
    const existingNotes = String(f["Outreach Notes"] || "");
    const today = isoDateOnly();
    console.log(`\n[${i + 1}/${batch.length}] ${business} (bounced: ${bouncedEmail || "?"})`);

    const sourcesTried = [];
    let foundEmail = null;
    let foundSource = null;

    // 1. Re-scrape site
    if (website) {
      sourcesTried.push("site-scrape");
      console.log(`  → site-scrape: ${website}`);
      const r = await scrapeSiteForEmails(website, bouncedEmail);
      if (r.emails.length > 0) {
        foundEmail = r.emails[0];
        foundSource = r.source;
        console.log(`    found: ${foundEmail} (${foundSource})`);
      }
    } else {
      console.log(`  → site-scrape SKIPPED (no Website on lead)`);
    }

    // 2. SerpAPI fallback
    if (!foundEmail && SERPAPI_KEY) {
      sourcesTried.push("serpapi");
      console.log(`  → serpapi search`);
      const r = await serpapiSearchEmails(business, city, bouncedEmail);
      if (r.emails.length > 0) {
        foundEmail = r.emails[0];
        foundSource = r.source;
        console.log(`    found: ${foundEmail} (${foundSource})`);
      }
    } else if (!foundEmail) {
      console.log(`  → serpapi SKIPPED (no SERPAPI_KEY in env)`);
    }

    try {
      if (foundEmail && foundEmail !== bouncedEmail) {
        const note = `[${today}] [recovered] ${bouncedEmail} bounced — replacement ${foundEmail} found via ${foundSource}. Re-queued for fresh Day-1 send.`;
        const ok = await patchLead(lead.id, {
          Email: foundEmail,
          "Email Status": "", // back to neutral so funnel can pick up
          "Draft Created": false,
          Status: "new",
          "Outreach Notes": [existingNotes, note].filter(Boolean).join("\n").slice(0, 95000),
        });
        if (ok) { recovered += 1; console.log(`  ✓ RECOVERED → ${foundEmail}`); }
        else { errored += 1; }
      } else {
        const note = `[${today}] [no-replacement] ${bouncedEmail || "?"} bounced — no working email found. Sources tried: ${sourcesTried.join(", ") || "none"}. Lead is now terminal (Email Status=no-replacement-found, Status=dead).`;
        const ok = await patchLead(lead.id, {
          "Email Status": "no-replacement-found",
          Status: "dead",
          "Outreach Notes": [existingNotes, note].filter(Boolean).join("\n").slice(0, 95000),
        });
        if (ok) { terminal += 1; console.log(`  ✗ NO REPLACEMENT (terminal)`); }
        else { errored += 1; }
      }
    } catch (err) {
      console.error(`  ! error: ${err.message}`);
      errored += 1;
    }

    // Polite pacing between leads
    if (i < batch.length - 1) await new Promise((res) => setTimeout(res, 1000));
  }

  console.log(`\n=========================`);
  console.log(`recover-bounced-emails summary:`);
  console.log(`  recovered (new email + re-queued): ${recovered}`);
  console.log(`  terminal (no replacement found):   ${terminal}`);
  console.log(`  errored:                           ${errored}`);
  console.log(`  total processed:                   ${batch.length}`);
  if (leads.length > batch.length) console.log(`  (${leads.length - batch.length} more queued — re-run to process)`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
