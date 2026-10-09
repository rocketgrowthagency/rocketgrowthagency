#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-google-access-is-told-truthfully.mjs
//
// 🔒 WHY (2026-10-08, approved waiting_on_you_v1 item 1): "Connect Google" requests analytics.readonly,
// webmasters.readonly AND business.manage (verified live), but the portal said "read-only access … we
// never post, modify" and the PRIVACY POLICY — the page Google's reviewers read — said "We request
// read-only access only. We never create, edit, delete, or otherwise modify any of your Google data."
// We publish photos, categories and the description to the Business Profile, so both were false.
//
// HOLDS: every scope oauth-google-init.js can request (flagged ones included) is named on the privacy
// page; the portal's one sentence names each Google product we touch and says "manage" for the
// Business Profile; no portal or privacy line claims read-only-only or never-modify.
// exit 0 = told truthfully · 1 = a claim contradicts the scopes · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); } };
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const init = code(read("netlify/functions/oauth-google-init.js"));
const portal = code(read("portal/portal.js"));
const privacy = read("privacy/index.html");
const fails = []; const F = (m) => fails.push(m);

const scopes = [...new Set((init.match(/https:\/\/www\.googleapis\.com\/auth\/[a-z.]+/g) || []).map((u) => u.split("/auth/")[1]))];
if (!scopes.length) { console.error("⚠️  INDETERMINATE — no scopes found in oauth-google-init.js"); process.exit(2); }
for (const sc of scopes) if (!privacy.includes(`<code>${sc}</code>`)) F(`the privacy policy does not name the scope we request: ${sc}`);
if (/read-only access only|never create, edit, delete, or otherwise modify any of your Google data/i.test(privacy)) F("the privacy policy claims read-only-only / never-modify while business.manage is requested");
if (/request the following read-only scopes/i.test(privacy) && scopes.includes("business.manage")) F("the privacy policy calls every scope read-only");

const sent = (portal.match(/const GOOGLE_ACCESS_SENTENCE = "([^"]+)";/) || [])[1];
if (!sent) F("the portal's one Google-access sentence is gone");
else {
  if (scopes.includes("analytics.readonly") && !/Google Analytics/.test(sent)) F("the access sentence leaves out Google Analytics");
  if (scopes.includes("webmasters.readonly") && !/Search Console/.test(sent)) F("the access sentence leaves out Search Console");
  if (scopes.includes("business.manage") && !/manage your Google Business Profile/.test(sent)) F("the access sentence does not say we manage the Business Profile");
}
const uses = (portal.match(/\$\{GOOGLE_ACCESS_SENTENCE\}/g) || []).length;
if (uses < 3) F(`the access sentence is used ${uses}× — a connect surface is saying something else`);
if (/read-only access to your (<strong>)?Google Analytics/i.test(portal)) F("a portal line still says read-only access to Analytics + Search Console only");
if (/never posts?, modif/i.test(portal)) F("a portal line still says we never post or modify");

console.log(`  scopes requested: ${scopes.join(", ")}`);
if (fails.length) { console.error("🔴 Google access is described untruthfully:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ the portal and the privacy policy describe exactly the Google access we request");
