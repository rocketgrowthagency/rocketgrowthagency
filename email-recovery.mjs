// Secondary enrichment pass — for each Airtable lead missing email or
// socials, re-scan the business website with stricter parsing.
// Safe to re-run; only writes to empty fields.
//
// Usage: node email-recovery.mjs

import "dotenv/config";
import axios from "axios";

const K = process.env.AIRTABLE_API_KEY;
const B = process.env.AIRTABLE_BASE_ID;
const hdr = { Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const LEADS = `https://api.airtable.com/v0/${B}/Leads`;

const emailBadPatterns = [
  /^user@domain\.com$/i, /^email@domain\.com$/i, /^example@example\./i,
  /^example@gmail\.com$/i, /^you@/i, /^your@/i, /^yourname@/i,
  /^test@test\./i, /^noreply@/i, /^no-reply@/i, /^donotreply@/i,
  /^info@yourdomain\./i, /@localhost$/i,
  /@sentry/i, /@wixpress\.com$/i, /@wix\.com$/i,
  /@cdn\./i, /@static\./i, /@google-analytics\./i, /@googletagmanager\./i,
  /@facebook\.com$/i, /@instagram\.com$/i, /@twitter\.com$/i,
  /\.(gif|jpg|png|jpeg|svg|webp|css|js|woff|ttf)$/i
];
function cleanEmail(raw) {
  if (!raw) return "";
  let e = String(raw).trim().toLowerCase();
  e = e.replace(/^mailto:/i, "").split("?")[0].replace(/[.,;:'")>]+$/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return "";
  if (emailBadPatterns.some((p) => p.test(e))) return "";
  const local = e.split("@")[0] || "";
  if (/^[0-9a-f]{24,}$/i.test(local)) return "";
  return e;
}

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

function cleanSocialUrl(raw, type) {
  if (!raw) return "";
  let u = String(raw).trim().replace(/[.,;:'")>]+$/, "").split(/[\s"']/)[0];
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (type === "facebook" && !/facebook\.com$/i.test(host)) return "";
    if (type === "instagram" && !/instagram\.com$/i.test(host)) return "";
    if (/\/tr\b|\/plugins|\/dialog|\/sharer|\/share\b|\/login|\/signup/i.test(parsed.pathname)) return "";
    if (parsed.pathname === "/" || parsed.pathname === "") return "";
    return parsed.toString();
  } catch { return ""; }
}

async function tryFetch(url) {
  try {
    const r = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 RGABot/1.0" },
      maxRedirects: 3,
      validateStatus: (s) => s < 500
    });
    return String(r.data || "");
  } catch { return ""; }
}

const candPaths = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/staff", "/get-in-touch"];

async function enrichSite(website) {
  const site = String(website || "").replace(/\/$/, "");
  if (!site) return { email: "", facebook: "", instagram: "" };
  let origin = site;
  try { origin = new URL(site).origin; } catch {}

  const emails = new Set();
  const fbs = new Set();
  const igs = new Set();

  for (const p of candPaths) {
    const url = p ? origin + p : site;
    const html = await tryFetch(url);
    if (!html) continue;

    (html.match(/mailto:[^"'\s>]+/gi) || []).forEach((m) => {
      const e = cleanEmail(m);
      if (e) emails.add(e);
    });
    const rawEmails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    rawEmails.forEach((raw) => {
      const e = cleanEmail(raw);
      if (e) emails.add(e);
    });

    (html.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)]+/gi) || []).forEach((u) => {
      const c = cleanSocialUrl(u, "facebook");
      if (c) fbs.add(c);
    });
    (html.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/gi) || []).forEach((u) => {
      const c = cleanSocialUrl(u, "instagram");
      if (c) igs.add(c);
    });

    if (emails.size && fbs.size && igs.size) break;
  }

  // Prefer email whose domain matches the website's domain
  const siteDomain = domainFromUrl(website);
  let bestEmail = "";
  if (siteDomain) {
    const match = [...emails].find((e) => e.endsWith("@" + siteDomain) || e.endsWith("." + siteDomain));
    if (match) bestEmail = match;
  }
  if (!bestEmail && emails.size) bestEmail = [...emails][0];

  return {
    email: bestEmail,
    facebook: fbs.size ? [...fbs][0] : "",
    instagram: igs.size ? [...igs][0] : ""
  };
}

async function main() {
  let all = [];
  let offset = null;
  do {
    const u = new URL(LEADS);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const d = await (await fetch(u, { headers: hdr })).json();
    all.push(...(d.records || []));
    offset = d.offset;
  } while (offset);

  const targets = all.filter((r) => {
    const f = r.fields;
    return f.Website && (!f.Email || !f.Facebook || !f.Instagram);
  });
  console.log(`Total leads: ${all.length}, candidates for enrichment: ${targets.length}`);

  let emailAdds = 0, fbAdds = 0, igAdds = 0;
  const updates = [];
  for (let i = 0; i < targets.length; i++) {
    const lead = targets[i];
    const f = lead.fields;
    const enriched = await enrichSite(f.Website);
    const fields = {};
    if (!f.Email && enriched.email) { fields.Email = enriched.email; emailAdds++; }
    if (!f.Facebook && enriched.facebook) { fields.Facebook = enriched.facebook; fbAdds++; }
    if (!f.Instagram && enriched.instagram) { fields.Instagram = enriched.instagram; igAdds++; }
    if (Object.keys(fields).length) updates.push({ id: lead.id, fields });
    if ((i + 1) % 10 === 0) console.log(`  progress: ${i + 1}/${targets.length} (emails:+${emailAdds} fb:+${fbAdds} ig:+${igAdds})`);
  }

  console.log(`\nEnrichment complete:`);
  console.log(`  Emails added:     +${emailAdds}`);
  console.log(`  Facebooks added:  +${fbAdds}`);
  console.log(`  Instagrams added: +${igAdds}`);
  console.log(`  Row updates:      ${updates.length}`);

  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    await fetch(LEADS, { method: "PATCH", headers: hdr, body: JSON.stringify({ records: batch, typecast: true }) });
  }
  console.log(`Applied to Airtable.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
