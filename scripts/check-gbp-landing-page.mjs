#!/usr/bin/env node
// check-gbp-landing-page.mjs — the admin step "Decide which page the Google profile links to" (approved admin_last_research_items_v1, item 1, 11-01).
// File-only: no browser, no database, no search. It proves:
//   · a failed or empty Search Console read is NEVER a recommendation (unknown / no data / too few say so and name no page)
//   · the choice works for ANY client: a site in another country, www or not, a one-page site, no website at all, a page that is not theirs
//   · the saved page is only used while it is still valid for the client's site, and with none saved the steps keep working on the homepage
//   · the writer saves a decision and NOTHING else (no Google write, no site write), reads it back, and is recorded
//   · both playbook files carry the step, identically, just before the homepage title step, as an RGA step with no client card
//   · the title and headline steps (draft and prefill) aim at the saved page
//   · the card names every state and its controls spin
// 🔴 WHY: the step says "reading Search Console where the data exists; with no data it says so and doesn't invent a recommendation". A card that turned a failed read
// into a page would send RGA to change the wrong page's title.
// Exit 0 pass · 1 fail · 2 cannot tell.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
let GL, pb, wid, lib, fn, deliv, exec, admin, m1src;
try {
  GL = createRequire(import.meta.url)(path.join(SITE, "netlify/functions/_gbp-landing.js"));
  pb = JSON.parse(rd("data/playbooks/playbooks.json")); wid = JSON.parse(rd("data/playbooks/what-it-does.json"));
  lib = rd("netlify/functions/_gbp-landing.js"); fn = rd("netlify/functions/admin-gbp-landing.js");
  deliv = rd("netlify/functions/admin-deliverables.js"); exec = rd("netlify/functions/flow-execute.js"); admin = rd("admin/admin.js");
  m1src = fs.readFileSync(path.join(process.env.SCRAPER_COPY_DIR || SCRAPER, "flow/playbooks/month1.mjs"), "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE — a file moved: ${e.message}`); process.exit(2); }

const fails = [], F = (m) => fails.push(m);
const ID = "m1.web.gbp_landing_page";
const SITE_US = "https://acme-plumbing.com/";
const row = (page, query, clicks, impressions) => ({ page, query, clicks, impressions });

// ── a read that did not happen is not a recommendation ──
{
  const r = (rows, kw = "plumber austin", site = SITE_US) => GL.recommend({ rows, keyword: kw, siteUrl: site });
  const none = (x, why) => { if (x.page) F(`${why}: it named a page (${x.page})`); };
  const a = r(null); if (a.state !== "unknown") F(`a failed read must be "unknown", got ${a.state}`); none(a, "failed read");
  const b = r([]); if (b.state !== "no_data") F(`no rows must be "no_data", got ${b.state}`); none(b, "no rows");
  const c = r([row("https://acme-plumbing.com/", "other thing", 50, 900)]); if (c.state !== "no_data") F(`rows for another search must be "no_data", got ${c.state}`); none(c, "other search");
  const d = r([row("https://acme-plumbing.com/", "plumber austin", 0, 4)]); if (d.state !== "few") F(`4 impressions must be "few", got ${d.state}`); none(d, "too few");
  const e = r([row("https://acme-plumbing.com/", "plumber austin", 3, 40)], ""); if (e.state !== "no_keyword") F(`no keyword must be "no_keyword", got ${e.state}`); none(e, "no keyword");
  const f = r([row("https://acme-plumbing.com/", "plumber austin", 3, 40)], "plumber austin", ""); if (f.state !== "no_site") F(`no website must be "no_site", got ${f.state}`); none(f, "no website");
  const g = r([row("https://other-site.com/", "plumber austin", 30, 400)]); if (g.state !== "no_data") F(`a page that is not the client's site must not count, got ${g.state}`);
  // real data
  const h = r([row("https://acme-plumbing.com/", "Plumber Austin", 9, 120), row("https://www.acme-plumbing.com/services/drains/", "plumber austin", 4, 80)]);
  if (h.state !== "ok" || !h.is_home) F(`the homepage earning most must say so (is_home), got ${JSON.stringify(h)}`);
  const i = r([row("https://acme-plumbing.com/", "plumber austin", 2, 120), row("https://acme-plumbing.com/services/drains/", "plumber austin", 14, 80)]);
  if (i.state !== "ok" || i.is_home || i.page !== "https://acme-plumbing.com/services/drains/" || i.clicks !== 14) F(`a service page earning more clicks must be named with its numbers, got ${JSON.stringify(i)}`);
  // universal: another country, a one-page site, a site address with a path
  const uk = r([row("https://www.smith-electrical.co.uk/", "electrician leeds", 6, 90)], "electrician leeds", "smith-electrical.co.uk");
  if (uk.state !== "ok" || !uk.is_home) F(`a UK site typed without https/www must still work, got ${JSON.stringify(uk)}`);
  const one = r([row("https://onepage.example/", "dog groomer", 5, 60)], "dog groomer", "https://onepage.example");
  if (one.state !== "ok" || !one.is_home || (one.pages || []).length !== 1) F(`a one-page site must recommend its homepage, got ${JSON.stringify(one)}`);
  const sub = r([row("https://acme.com/en/", "plumber", 7, 70), row("https://acme.com/en/services/", "plumber", 2, 70)], "plumber", "https://acme.com/en/");
  if (!sub.is_home) F("a site whose homepage has a path (/en/) must treat that path as the homepage");
}

// ── the choice is checked, for any client ──
{
  const ck = (o) => GL.checkChoice({ siteUrl: SITE_US, ...o });
  if (!ck({ choice: "homepage" }).ok) F("homepage must be accepted with no address");
  if (ck({ choice: "service" }).ok) F("a service page with no address must be refused");
  if (ck({ choice: "service", url: "https://evil.example/services/" }).ok) F("a page that isn't on the client's site must be refused");
  if (ck({ choice: "city", url: "https://acme-plumbing.com/" }).ok) F("the homepage typed as a city page must be refused (choose Homepage)");
  if (ck({ choice: "bogus", url: "https://acme-plumbing.com/x/" }).ok) F("an unknown choice must be refused");
  if (ck({ choice: "service", url: "not a url" }).ok) F("text that isn't an address must be refused");
  if (!ck({ choice: "city", url: "https://www.acme-plumbing.com/austin/" }).ok) F("www on one side only must still be the same site");
  if (!ck({ choice: "service", url: "acme-plumbing.com/drains" }).ok) F("an address typed without https must be accepted");
  if (GL.checkChoice({ choice: "homepage", url: "", siteUrl: "" }).ok) F("a client with no website can't save a page");
}

// ── the fallback is the homepage, and a stale choice is ignored ──
{
  const client = { website_url: "acme-plumbing.com" };
  const none = GL.pageFor({}, client);
  if (!none || none.saved || none.choice !== "homepage" || !/^https:\/\/acme-plumbing\.com\/$/.test(none.url)) F(`nothing saved must fall back to the homepage, got ${JSON.stringify(none)}`);
  const tasks = { [ID]: { landing: { choice: "service", url: "https://acme-plumbing.com/drains/" } } };
  const s = GL.pageFor(tasks, client);
  if (!s || !s.saved || s.url !== "https://acme-plumbing.com/drains/") F(`a saved page must be used, got ${JSON.stringify(s)}`);
  const moved = GL.pageFor(tasks, { website_url: "https://new-name.com" });
  if (!moved || moved.saved) F("a saved page from a site the client no longer has must be ignored");
  if (GL.pageFor(tasks, { website_url: "" }) !== null) F("a client with no website has no page at all (null), not a made-up one");
  if (GL.whereWords(none) !== "Your homepage") F("the words must say homepage when none is saved");
  if (GL.whereWords(s) === "Your homepage") F("the words must not say homepage when another page is saved");
}

// ── the writer saves a decision and nothing else ──
if (/mybusiness|googleapis\.com\/(?!webmasters)|api\.github\.com|gbp-publish|gbp-apply|website_choice|method:\s*"(PUT|DELETE)"/.test(fn)) F("the writer reaches Google or a website: it must save a decision only");
if (!/GL\.checkChoice\(/.test(fn)) F("the writer saves without checking the choice");
if (!/READ IT BACK/.test(fn) || (fn.match(/READ IT BACK/g) || []).length < 2) F("the writer must read both saves back");
if (!/recordSubmission\(/.test(fn)) F("a saved decision must be recorded (check-every-submission-is-recorded)");
if (!/requireWorkspaceForClient\(/.test(fn)) F("the writer must be RGA-only");
if (!/status:\s*"done"/.test(fn)) F("saving a decision must finish the step");
if (/status:\s*"done"/.test(fn.split('if (action === "read")')[1].split("const c = GL.checkChoice")[0] || "")) F("a read must not finish the step");
if (/\bChris\b/.test(lib + fn)) F("the owner's name is in a served file");

// ── both playbook files ──
{
  const j = pb.month1, at = j.findIndex((s) => s.id === ID), hm = j.findIndex((s) => s.id === "m1.web.homepage_meta");
  if (at < 0) F("the step is missing from playbooks.json");
  else {
    if (at !== hm - 1) F("the step must sit immediately before m1.web.homepage_meta");
    const s = j[at];
    if (s.title !== "Decide which page the Google profile links to") F("the step's title changed");
    if (s.actor !== "rga") F("the step must be an RGA step");
    if (s.clientLabel || s.clientStepNo || s.clientHint || s.clientForm) F("the step must have no client card and no client number");
    if (s.clientBucket !== "admin") F("the step belongs in the admin bucket");
    if (s.type !== "manual" || s.hasRunner) F("the step is a manual decision with no runner");
    if (!(s.dependsOn || []).every((d) => j.findIndex((x) => x.id === d) >= 0 && j.findIndex((x) => x.id === d) < at)) F("a dependency points at a step that comes later");
    if ((s.dependsOn || []).length > 1) F("the step is locked behind more than the keyword plan");
    const mm = m1src.match(new RegExp(`id: "${ID.replace(/\./g, "\\.")}"[\\s\\S]*?instructions: \`([\\s\\S]*?)\`,\\n  \\}`));
    if (!mm) F("the step is missing from the canonical month1.mjs");
    else if (mm[1] !== s.instructions) F("the instructions differ between month1.mjs and playbooks.json");
    if (!new RegExp(`id: "${ID.replace(/\./g, "\\.")}"[\\s\\S]*?title: "Decide which page the Google profile links to"`).test(m1src)) F("the title differs in month1.mjs");
    const order = [...m1src.matchAll(/\bid: "(m1\.[a-z0-9_.]+)"/g)].map((x) => x[1]), oa = order.indexOf(ID);
    if (oa < 0 || order[oa + 1] !== "m1.web.homepage_meta") F("in month1.mjs the step must sit immediately before m1.web.homepage_meta");
  }
  if (!Object.values(wid).some((v) => v && typeof v === "object" && typeof v[ID] === "string")) F("what-it-does.json has no sentence for the step");
  for (const id of ["m1.web.homepage_meta", "m1.web.h1_cta"]) if (/\bhomepage\b/i.test((j.find((s) => s.id === id) || {}).instructions || "") && !/chosen page/.test((j.find((s) => s.id === id) || {}).instructions)) F(`${id} still aims at the homepage only`);
}

// ── the steps that aim at the homepage use the saved page ──
if (!/GL\.pageFor\(tasks, client\)/.test(deliv) && !/_gbp-landing"\)[\s\S]{0,80}pageFor\(tasks, client\)/.test(deliv)) F("the prefill for the title and headline steps doesn't use the saved page");
if (!/c\.page_url = pg \? pg\.url : site/.test(deliv)) F("the prefill must fall back to the homepage");
if ((exec.match(/\$\{await pageBlock\(client\)\}/g) || []).length < 2) F("both the title and the headline drafts must be aimed at the saved page");
if (!/pageFor\(recs\?\.\[0\]\?\.data\?\.tasks \|\| \{\}, client\)/.test(exec)) F("the draft's page comes from somewhere other than the saved decision");

// ── the card ──
for (const w of ["Search Console not read yet", "Couldn't read Search Console", "No main keyword in the plan yet", "has no rows for", "Too few searches", "No website on file"]) if (!admin.includes(w)) F(`the card doesn't say "${w}"`);
if (!/id === "m1\.web\.gbp_landing_page" \? gbpLandingAdminHtml\(t\)/.test(admin)) F("the card isn't drawn on its step");
const click = (admin.split("function gbpLandingAdminHtml")[1] || "").split("function rowStepCardsHtml")[0];
if (!/classList\.add\("is-busy"\)/.test(click) || !/classList\.remove\("is-busy"\)/.test(click)) F("the card's buttons must spin and un-spin");
if (/\b(?:step|Step) \d+\b/.test(click)) F("the card types a step number");
if (/—/.test(click)) F("the card has an em dash");

if (fails.length) { console.error("🔴 the Google landing page step isn't right:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ landing page step: a failed read recommends nothing · works for any site (other country, www, one page, no site) · a stale choice is ignored · falls back to the homepage · saves a decision only, read back, recorded · both playbooks agree · the title and headline steps aim at the saved page");
