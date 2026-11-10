#!/usr/bin/env node
// check-every-outreach-link-resolves.mjs — 11-10 (the owner, 8:18 AM: "were sending emails out where the links dont work"). Every follow-up
// email's "Get the full free audit" button linked to /growth-audit/, which never existed; the old catch-all served the homepage, and its
// removal on 10-31 turned every one into a 404 for 10 days. No check read the EMAILS' links, only the site's own.
// This reads every https://www.rocketgrowthagency.com/... page address the outreach Apps Script builds (docs/apps-scripts/gmail-to-airtable.gs),
// fills each ${…} with a real value (a real /v/ slug, a fake lead id), and fetches it LIVE, following redirects: it must end on a 200 page.
// Netlify function URLs (track-click, track-open, unsubscribe) are skipped: they act on a real lead. It proves itself on a path that must 404;
// a network failure is INDETERMINATE (exit 2), never green.  node scripts/check-every-outreach-link-resolves.mjs
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ORIGIN = "https://www.rocketgrowthagency.com";
const src = fs.readFileSync(`${SITE}/docs/apps-scripts/gmail-to-airtable.gs`, "utf8");
const slug = fs.readdirSync(`${SITE}/v`).find((d) => fs.existsSync(`${SITE}/v/${d}/index.html`));
const raw = [...new Set([...src.matchAll(/https:\/\/www\.rocketgrowthagency\.com(\/[^`'"\s)]*)/g)].map((m) => m[1]))];
const pages = raw.filter((p) => !p.startsWith("/.netlify/"))
  .map((p) => (p.startsWith("/v/${") ? `/v/${slug}/` : p))   // /v/${lead['Vid Slug'] || ''}/ has quotes and spaces inside, so the read stops early
  .map((p) => p.replace(/\$\{day\}/g, "9").replace(/\$\{[^}]*\}/g, "recTEST000000000"));
if (!pages.length || !pages.some((p) => p.includes("audit"))) { console.log(`INDETERMINATE: found ${pages.length} page links in the Apps Script and none to the audit; the reader no longer matches the file`); process.exit(2); }

async function land(path) {
  const r = await fetch(ORIGIN + path, { redirect: "follow", headers: { "User-Agent": "rga-outreach-link-check" } });
  const body = r.status === 200 ? await r.text() : "";
  return { status: r.status, url: r.url, notFound: /<title>[^<]*(404|Not Found)/i.test(body) };   // by the TITLE: every /v/ page carries a hidden "This walkthrough has expired" block
}
let canary;
try { canary = await land(`/this-page-never-exists-${Date.now()}/`); }
catch (e) { console.log(`INDETERMINATE: the live site couldn't be reached (${e.message}), so no link was checked`); process.exit(2); }
if (canary.status !== 404) { console.log(`INDETERMINATE: a path that must 404 answered ${canary.status}, so this check can't tell a broken link from a working one`); process.exit(2); }

const bad = [];
for (const p of pages) {
  let r; try { r = await land(p); } catch (e) { console.log(`INDETERMINATE: ${p} couldn't be fetched (${e.message})`); process.exit(2); }
  if (r.status !== 200 || r.notFound) bad.push(`${p} → ${r.status}${r.notFound ? " (a not-found page)" : ""} at ${r.url}`);
  else console.log(`  ✓ ${p} → ${r.url.replace(ORIGIN, "")}`);
}
if (bad.length) { console.log(`❌ ${bad.length} outreach email link(s) don't open a page:`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
console.log(`✅ every page link the outreach emails build opens a live page (${pages.length} checked; a made-up path still 404s)`);
