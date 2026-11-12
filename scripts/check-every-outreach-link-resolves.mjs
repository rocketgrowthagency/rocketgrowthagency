#!/usr/bin/env node
// check-every-outreach-link-resolves.mjs — 11-10 (the owner, 8:18 AM: "were sending emails out where the links dont work"). Every follow-up
// email's "Get the full free audit" button linked to /growth-audit/, which never existed; the old catch-all served the homepage, and its
// removal on 10-31 turned every one into a 404 for 10 days. No check read the EMAILS' links, only the site's own.
// This reads every https://www.rocketgrowthagency.com/... page address the outreach Apps Script builds (docs/apps-scripts/gmail-to-airtable.gs),
// fills each ${…} with a real value (a real /v/ slug, a fake lead id), and fetches it LIVE, following redirects: it must end on a 200 page.
// Netlify function URLs (track-click, track-open, unsubscribe) are skipped: they act on a real lead. It proves itself on a path that must 404;
// a network failure is INDETERMINATE (exit 2), never green.  node scripts/check-every-outreach-link-resolves.mjs
// 11-11 (master audit #15): it also reads every thank-you address script.js pushes into the bar after a form sends: each must be a noindex
// page in the repo and open live (all three 404'd on a reload until the pages were built).
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
// 🔒 master audit #15 (11-11): THE ADDRESSES THE SITE'S OWN FORMS PUT IN THE BAR ARE LINKS TOO. script.js pushStates /free-growth-audit/thank-you/,
// /contact/thank-you/ and /start-growth-plan/thank-you/ after a form sends; all three 404'd on a reload, a bookmark or a share. Each pushed address
// must be a page in the repo (noindex: a confirmation is not a search result) AND open live.
const sjs = fs.readFileSync(`${SITE}/script.js`, "utf8");
const pushes = (sjs.match(/history\.pushState\(/g) || []).length;
const pushed = [...new Set([...sjs.matchAll(/"(\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/)"/g)].map((m) => m[1]).filter((p) => /thank-you\/$/.test(p)))];
if (pushes && !pushed.length) { console.log(`INDETERMINATE: script.js pushes ${pushes} address(es) but the reader found none; it no longer matches the file`); process.exit(2); }
const unbuilt = pushed.filter((p) => { try { return !/name="robots" content="noindex/.test(fs.readFileSync(`${SITE}${p}index.html`, "utf8")); } catch { return true; } });
if (unbuilt.length) { console.log(`❌ ${unbuilt.length} address(es) the forms push have no noindex page in the repo: ${unbuilt.join(", ")}`); process.exit(1); }
pages.push(...pushed.filter((p) => !pages.includes(p)));

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
if (bad.length) { console.log(`❌ ${bad.length} link(s) (outreach emails, form confirmations) don't open a page:`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
console.log(`✅ every page link the outreach emails build and every address the forms push opens a live page (${pages.length} checked, ${pushed.length} pushed by script.js; a made-up path still 404s)`);
