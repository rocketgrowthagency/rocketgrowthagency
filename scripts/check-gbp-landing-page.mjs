#!/usr/bin/env node
// check-gbp-landing-page.mjs — the admin step "Decide which page the Google profile links to" (approved admin_last_research_items_v1, item 1, 11-01;
// it DECIDES ITSELF since admin_step42_landing_auto_v1, approved 11-06 ~2:40 PM, all six decisions).
// File-only: no browser, no database, no Search Console, no Google. Fakes stand in for all of them. It proves:
//   · THE RULE, FOR ANY BUSINESS: every plan keyword (not only the first), searches that CONTAIN one (whole words, any case, any language), their own
//     site only; another page wins only with 10+ impressions AND more clicks than the homepage (then impressions); a tie, too few, none, no keywords
//     or an unreadable Search Console = the homepage; no website = skipped. Another country, www or not, a one-page site, a site on a subpath.
//   · IT DECIDES ITSELF: once, idempotent, read back, recorded, completed_by "system"; never over a choice RGA saved (even one saved mid-run)
//   · IT COMPARES WITH GOOGLE: matches / differs / couldn't read. An unread link is never "matches"
//   · MONTHLY: not before 30 days; the same page refreshes its numbers; a different page that clearly wins is RAISED, never switched; Keep stops the
//     raise until another page wins or the lead grows; a no-website skip decides again once a website is on file
//   · THE NIGHTLY SWEEP: one narrow select (never whole records), only due clients, never a test client, capped, an off switch, wired into the nightly job
//   · it writes nothing to Google or to a website; the old helpers (checkChoice, pageFor, whereWords) still hold
//   · both playbook files carry the step identically, self-settling, before the homepage title step, with no client card
//   · THE CARD (rendered from admin.js): states A to E, a spinner and one call when the step is active with nothing saved, no "Choose by hand", no
//     Mark step complete, no Send (no approval path carries the website link yet), one quiet Change…, controls spin, no typed step number, no em dash
// 🔴 WHY: the owner, 11-6: "all recommendations should be built into the system/portal ... runs automated with all recommendations (for ALL
// BUSINESSES) not just for specific case of RGA." The old step read ONE keyword, exact match, found nothing for RGA and said "Choose by hand".
// Exit 0 pass · 1 fail · 2 cannot tell.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
const req = createRequire(import.meta.url);
let GL, pb, wid, lib, fn, deliv, exec, admin, m1src, nightly;
try {
  GL = req(path.join(SITE, "netlify/functions/_gbp-landing.js"));
  pb = JSON.parse(rd("data/playbooks/playbooks.json")); wid = JSON.parse(rd("data/playbooks/what-it-does.json"));
  lib = rd("netlify/functions/_gbp-landing.js"); fn = rd("netlify/functions/admin-gbp-landing.js");
  deliv = rd("netlify/functions/admin-deliverables.js"); exec = rd("netlify/functions/flow-execute.js"); admin = rd("admin/admin.js");
  nightly = rd("netlify/functions/metrics-daily-refresh.js");
  m1src = fs.readFileSync(path.join(process.env.SCRAPER_COPY_DIR || SCRAPER, "flow/playbooks/month1.mjs"), "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE — a file moved: ${e.message}`); process.exit(2); }

const fails = [], F = (m) => fails.push(m);
const ID = "m1.web.gbp_landing_page", PLAN = "m1.strategy.keywords_locations";
const SITE_US = "https://acme-plumbing.com/";
const row = (page, query, clicks, impressions) => ({ page, query, clicks, impressions });

// the module that decides and re-reads: missing = the step can't decide itself (red on the code before 11-06)
let R = null, run = "";
try { run = rd("netlify/functions/_gbp-landing-run.js"); R = req(path.join(SITE, "netlify/functions/_gbp-landing-run.js")); }
catch (e) { F(`the step can't decide itself: netlify/functions/_gbp-landing-run.js won't load (${String(e.message).split("\n")[0]})`); }

// ── the old reader still never turns a failed read into a page (other code may call it) ──
{
  const r = (rows, kw = "plumber austin", site = SITE_US) => GL.recommend({ rows, keyword: kw, siteUrl: site });
  const a = r(null); if (a.state !== "unknown" || a.page) F(`the one-keyword reader: a failed read must be "unknown" with no page, got ${JSON.stringify(a)}`);
  const d = r([row("https://acme-plumbing.com/", "plumber austin", 0, 4)]); if (d.state !== "few" || d.page) F(`the one-keyword reader: 4 impressions must be "few", got ${d.state}`);
}

// ── the rule, for any business ──
if (typeof GL.recommendAll !== "function") F("there's no rule that reads every plan keyword (recommendAll)");
else {
  const all = (rows, keywords, site = SITE_US) => GL.recommendAll({ rows, keywords, siteUrl: site });
  const KW = ["plumber austin", "drain cleaning austin", "emergency plumber"];
  const home = (x, why) => { if (!x || GL.parts(x.page)?.key !== GL.parts(SITE_US).key) F(`${why}: it must keep the homepage, got ${JSON.stringify(x && { state: x.state, page: x.page })}`); };
  // every keyword counts, not only the first
  const second = all([row("https://acme-plumbing.com/services/drains/", "drain cleaning austin", 9, 60), row(SITE_US, "drain cleaning austin", 2, 40)], KW);
  if (second.state !== "page_wins" || second.page !== "https://acme-plumbing.com/services/drains/") F(`a search for the SECOND plan keyword must count, got ${JSON.stringify({ s: second.state, p: second.page })}`);
  // a search that CONTAINS a keyword counts, as whole words, any case
  const contains = all([row("https://acme-plumbing.com/services/drains/", "Drain Cleaning Austin TX open now", 6, 30), row(SITE_US, "plumber", 1, 30)], KW);
  if (contains.state !== "page_wins") F(`"Drain Cleaning Austin TX open now" must count for "drain cleaning austin" (contains, any case), got ${contains.state}`);
  if (GL.containsKeyword("plumbers austin", "plumber austin")) F(`"plumbers austin" must not count for "plumber austin": whole words only`);
  if (GL.containsKeyword("superplumber austin", "plumber austin")) F("a keyword inside another word must not count");
  if (!GL.containsKeyword("local seo services near me culver city", "local seo services near me")) F("the mockup's own example must count");
  if (!GL.containsKeyword("Klempner München Notdienst", "klempner münchen")) F("a keyword with non-English letters must count (any language)");
  if (!GL.containsKeyword("joe's plumbing - austin", "joe s plumbing austin")) F("punctuation must not split a match");
  // their own site only
  const other = all([row("https://other-site.com/", "plumber austin", 300, 900)], KW);
  if (other.state !== "no_data") F(`another site's pages must not count, got ${other.state}`); home(other, "another site's rows");
  // too few, none, a tie, the homepage ahead
  home(all([row("https://acme-plumbing.com/a/", "plumber austin", 5, 9)], KW), "9 impressions in all");
  const ten = all([row("https://acme-plumbing.com/a/", "plumber austin", 1, 6), row(SITE_US, "emergency plumber", 0, 4)], KW);
  if (ten.state !== "page_wins") F(`10 impressions in all, across two keywords, with more clicks than the homepage must win, got ${ten.state}`);
  home(all([], KW), "no searches"); if (all([], KW).state !== "no_data") F("no rows must say no_data");
  const tie = all([row("https://acme-plumbing.com/a/", "plumber austin", 4, 50), row(SITE_US, "plumber austin", 4, 50)], KW);
  home(tie, "a tie"); if (tie.state !== "tie") F(`an exact tie must say tie, got ${tie.state}`);
  const imp = all([row("https://acme-plumbing.com/a/", "plumber austin", 4, 80), row(SITE_US, "plumber austin", 4, 50)], KW);
  // 🔴 11-6: approved decision 3 = MORE clicks to win; equal clicks keep the homepage whatever the impressions (the 3:22 PM /local-seo/ pick)
  home(imp, "equal clicks, more impressions"); if (imp.state !== "tie") F(`equal clicks with more impressions must keep the homepage (a tie), got ${imp.state}`);
  const homeAhead = all([row("https://acme-plumbing.com/a/", "plumber austin", 3, 500), row(SITE_US, "plumber austin", 4, 20)], KW);
  home(homeAhead, "the homepage has more clicks"); if (homeAhead.state !== "home_wins") F(`more clicks on the homepage must say home_wins, got ${homeAhead.state}`);
  // a failed read, no keywords, no website
  const unk = all(null, KW); home(unk, "Search Console unreadable"); if (unk.state !== "unknown") F(`an unreadable Search Console must say unknown, got ${unk.state}`);
  const nok = all([row("https://acme-plumbing.com/a/", "plumber austin", 30, 300)], []); home(nok, "no plan keywords"); if (nok.state !== "no_keyword") F("no keywords must say no_keyword");
  const nos = all([row("https://acme-plumbing.com/a/", "plumber austin", 30, 300)], KW, ""); if (nos.state !== "no_site" || nos.page !== null) F(`no website must be no_site with no page, got ${JSON.stringify(nos)}`);
  // universal: another country typed bare, a one-page site, a site on a subpath, www on one side
  const uk = all([row("https://www.smith-electrical.co.uk/rewiring/", "electrician leeds rewiring", 7, 70), row("https://smith-electrical.co.uk/", "electrician leeds", 1, 20)], ["electrician leeds"], "smith-electrical.co.uk");
  if (uk.state !== "page_wins" || uk.page !== "https://www.smith-electrical.co.uk/rewiring/") F(`a UK site typed without https or www must work, got ${JSON.stringify({ s: uk.state, p: uk.page })}`);
  const one = all([row("https://onepage.example/", "dog groomer", 5, 60)], ["dog groomer"], "https://onepage.example");
  if (one.state !== "home_wins" || (one.pages || []).length !== 1) F(`a one-page site must keep its homepage, got ${one.state}`);
  const sub = all([row("https://acme.com/en/", "plumber", 7, 70), row("https://acme.com/en/services/", "plumber", 2, 70)], ["plumber"], "https://acme.com/en/");
  if (sub.state !== "home_wins") F(`a site whose homepage has a path (/en/) must treat that path as the homepage, got ${sub.state}`);
  if (GL.keywordsOf({ keywords: ["Plumber Austin", "plumber austin!", "", "drain cleaning"] }).length !== 2) F("the plan's keywords must be read without repeats or blanks");
  // the saved decision
  const at = "2026-11-06T22:00:00.000Z", dd = GL.decide(second, at);
  if (dd.by !== "system" || dd.choice !== "page" || dd.url !== second.page || dd.reason !== "page_wins" || dd.read_at !== at || !dd.evidence || dd.evidence.keywords.length !== 3)
    F(`the decision must keep choice, url, reason, read_at, by: "system" and the evidence, got ${JSON.stringify(dd)}`);
  const ds = GL.decide(nos, at); if (ds.url !== null || ds.reason !== "no_site") F("no website must save no page, with the reason");
  // what Google shows
  const cg = (shows) => GL.compareGoogle(SITE_US, shows, at).state;
  if (cg(null) !== "unknown") F("a website link we couldn't read must be unknown, never a match");
  if (cg("https://www.acme-plumbing.com/?utm_source=google&utm_medium=organic") !== "matches") F("the homepage with www and tracking tags must match");
  if (cg("") !== "differs") F("no website link on Google must differ");
  if (cg("https://acme-plumbing.com/locations/austin/") !== "differs") F("another page on Google must differ");
  // the monthly raise
  const L = { choice: "homepage", url: SITE_US, saved_at: at };
  if (!GL.raiseFor(L, second, null, at)) F("a different page that clearly wins must be raised");
  if (GL.raiseFor(L, homeAhead, null, at)) F("the homepage still ahead must raise nothing");
  if (GL.raiseFor({ ...L, url: second.page }, second, null, at)) F("the saved page winning must raise nothing");
  const kept = { url: second.page, clicks: 9, home_clicks: 2 };
  if (GL.raiseFor(L, second, kept, at)) F("a page RGA kept the homepage over must not be raised again on the same numbers");
  const grew = all([row("https://acme-plumbing.com/services/drains/", "drain cleaning austin", 20, 90), row(SITE_US, "drain cleaning austin", 2, 40)], KW);
  if (!GL.raiseFor(L, grew, kept, at)) F("a kept page whose lead has grown must be raised again");
  const now = Date.parse(at);
  if (GL.recheckDue({ landing: { ...L, read_at: new Date(now - 29 * 864e5).toISOString() } }, { website_url: SITE_US }, now)) F("a decision read 29 days ago isn't due again");
  if (!GL.recheckDue({ landing: { ...L, read_at: new Date(now - 30 * 864e5).toISOString() } }, { website_url: SITE_US }, now)) F("a decision read 30 days ago is due again");
  if (!GL.recheckDue({ landing: { reason: "no_site", url: null, saved_at: at } }, { website_url: SITE_US }, now)) F("a no-website skip is due once a website is on file");
  if (GL.recheckDue({ landing: { reason: "no_site", url: null, saved_at: at } }, { website_url: "" }, now)) F("a no-website skip with still no website isn't due");
}

// ── it decides itself, re-reads monthly, and never writes over RGA (fakes for the database, Search Console and Google) ──
const CID = "11111111-1111-4111-8111-111111111111";
const DRAFT = "keywords:\n- plumber austin\n- drain cleaning austin\n- emergency plumber\nlocations:\n- Austin";
const clone = (x) => JSON.parse(JSON.stringify(x));
function makeDb(entries) {
  // entries: [{ id, client: {...}, tasks }]
  const db = { recs: new Map(), clients: new Map(), writes: 0, records: [], gsc: [], google: 0, selects: [], onPatch: null, t: Date.parse("2026-11-06T22:00:00.000Z") };
  entries.forEach((e, i) => { db.recs.set(e.id, { id: `rec-${i}`, data: { tasks: clone(e.tasks || {}) } }); db.clients.set(e.id, { id: e.id, status: "active", source: null, ...e.client }); });
  const byRec = (rid) => [...db.recs.values()].find((r) => r.id === rid);
  db.supa = async (p, init = {}) => {
    const m = init.method || "GET";
    if (m === "GET") db.selects.push(p);
    let x;
    if (m === "GET" && (x = p.match(/^\/client_onboarding_records\?client_id=eq\.([^&]+)/))) { const r = db.recs.get(decodeURIComponent(x[1])); return r ? [{ id: r.id, data: clone(r.data) }] : []; }
    if (m === "GET" && (x = p.match(/^\/clients\?id=eq\.([^&]+)/))) { const c = db.clients.get(decodeURIComponent(x[1])); return c ? [clone(c)] : []; }
    if (m === "GET" && /^\/client_onboarding_records\?select=/.test(p)) {
      return [...db.recs.entries()].map(([cid, r]) => ({ client_id: cid, t: (r.data.tasks || {})[ID] ? clone(r.data.tasks[ID]) : null, plan: ((r.data.tasks || {})[PLAN] || {}).status || null }));
    }
    // the fake applies the filters the path asks for, and only those: a path that stops asking for them gets the test clients back
    if (m === "GET" && /^\/clients\?/.test(p) && !/^\/clients\?id=/.test(p)) return [...db.clients.values()]
      .filter((c) => (!/status=neq\.archived/.test(p) || c.status !== "archived") && (!/source\.not\.like\.test:\*/.test(p) || !String(c.source || "").startsWith("test:")))
      .map((c) => ({ id: c.id, website_url: c.website_url }));
    if (m === "PATCH" && (x = p.match(/^\/client_onboarding_records\?id=eq\.([^&]+)/))) {
      const r = byRec(decodeURIComponent(x[1])); if (!r) return [];
      if (db.onPatch) { const f = db.onPatch; db.onPatch = null; f(r); }
      const l = ((r.data.tasks || {})[ID] || {}).landing;
      if (/->landing=is\.null/.test(p) && l) return [];
      const y = p.match(/->landing->>saved_at=eq\.([^&]+)/); if (y && (!l || l.saved_at !== decodeURIComponent(y[1]))) return [];
      r.data = clone(JSON.parse(init.body).data); db.writes++;
      return [{ data: clone(r.data) }];
    }
    throw new Error(`the fake database wasn't expecting ${m} ${p}`);
  };
  db.deps = (o = {}) => ({ supa: db.supa, now: () => db.t, env: o.env || {},
    gscRows: async (cid, kws) => { db.gsc.push(kws); if (o.gscThrows) throw new Error("Search Console said no"); return o.rows === undefined ? [] : clone(o.rows); },
    googleSite: async () => { db.google++; return o.shows === undefined ? SITE_US : o.shows; },
    record: async (x) => { db.records.push(x); return { activity: true }; } });
  db.task = (cid = CID) => ((db.recs.get(cid).data.tasks || {})[ID]) || null;
  return db;
}
const planTasks = (extra = {}) => ({ [PLAN]: { status: "done", outcome_data: { draft: DRAFT } }, ...extra });
const ROWS_B = [row("https://acme-plumbing.com/services/drain-cleaning/", "drain cleaning austin tx", 31, 300), row(SITE_US, "plumber austin", 6, 120), row("https://acme-plumbing.com/about/", "emergency plumber", 3, 40)];
if (R) {
  try {
    // 1. the first decision: every keyword asked for, saved with its reason, done by the system, compared with Google, recorded once
    let db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks() }]);
    let r = await R.decideOnce({ clientId: CID, trigger: "admin", deps: db.deps({ rows: ROWS_B, shows: "https://www.acme-plumbing.com/" }) });
    let t = db.task();
    if (!r.decided || !t || !t.landing) F(`the step didn't decide itself: ${JSON.stringify(r).slice(0, 200)}`);
    else {
      if (db.gsc[0] && db.gsc[0].length !== 3) F(`Search Console was asked about ${db.gsc[0].length} keyword(s), not all 3 in the plan`);
      if (t.landing.choice !== "page" || t.landing.url !== "https://acme-plumbing.com/services/drain-cleaning/" || t.landing.reason !== "page_wins") F(`the page that earns the most clicks must be chosen, got ${JSON.stringify(t.landing).slice(0, 200)}`);
      if (t.landing.by !== "system" || t.status !== "done" || t.completed_by !== "system" || !t.landing.read_at) F("the decision must be the system's, read_at stamped, and the step done by the system");
      if (!t.landing.google || t.landing.google.state !== "differs") F(`Google shows the homepage, so the comparison must be "differs" (state B), got ${JSON.stringify(t.landing.google)}`);
      if (db.records.length !== 1 || db.records[0].actor !== "system") F("the decision must be recorded once, as the system's");
      if (!/Nothing was changed on Google or on the website/.test((db.records[0] || {}).summary || "")) F("the record must say nothing was changed on Google or the website");
    }
    // 2. idempotent: a second call changes nothing
    const w = db.writes, before = JSON.stringify(db.task()), asked = db.gsc.length + db.google;
    r = await R.decideOnce({ clientId: CID, trigger: "nightly", deps: db.deps({ rows: [], shows: "" }) });
    if (r.decided || db.writes !== w || JSON.stringify(db.task()) !== before || db.records.length !== 1) F("a second call must change nothing (idempotent)");
    if (db.gsc.length + db.google !== asked) F("a second call must not read Search Console or Google again (a decided step costs nothing)");
    // 3. a choice RGA saves while the system is reading stands
    db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks() }]);
    db.onPatch = (rec) => { rec.data.tasks[ID] = { landing: { choice: "homepage", url: SITE_US, saved_at: "2026-11-06T21:59:00.000Z", by: "someone@rga" }, status: "done" }; };
    r = await R.decideOnce({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    if (r.decided || (db.task().landing || {}).by !== "someone@rga") F("a choice RGA saved mid-run must stand; the system must not write over it");
    // 4. RGA's own choice is never decided over, and the monthly read only RAISES a better page
    db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks({ [ID]: { status: "done", landing: { choice: "homepage", url: SITE_US, saved_at: "2026-10-01T10:00:00.000Z", by: "someone@rga" } } }) }]);
    r = await R.decideOnce({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    if (r.decided || db.writes) F("RGA's own choice must never be decided over");
    r = await R.recheck({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    t = db.task();
    if (!r.rechecked || t.landing.url !== SITE_US || t.landing.by !== "someone@rga") F("the monthly read must never switch the saved page");
    if (!t.landing_raise || t.landing_raise.url !== "https://acme-plumbing.com/services/drain-cleaning/") F("a different page that clearly wins must be raised for RGA (state E)");
    // keep: recorded, the raise goes, and the same numbers next month raise nothing
    r = await R.keep({ clientId: CID, by: "someone@rga", deps: db.deps() });
    t = db.task();
    if (r.error || t.landing_raise || !t.landing_kept || t.landing_kept.url !== "https://acme-plumbing.com/services/drain-cleaning/") F(`Keep must record the kept page and clear the raise, got ${JSON.stringify(r).slice(0, 120)}`);
    db.t += 31 * 864e5;
    await R.recheck({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    if (db.task().landing_raise) F("a kept page must not be raised again on the same numbers");
    // a choice RGA saves while the monthly read is reading stands too
    db.t += 31 * 864e5;
    db.onPatch = (rec) => { rec.data.tasks[ID] = { ...rec.data.tasks[ID], landing: { choice: "city", url: "https://acme-plumbing.com/austin/", saved_at: "2026-12-30T00:00:00.000Z", by: "other@rga" } }; };
    r = await R.recheck({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    if (r.rechecked || (db.task().landing || {}).url !== "https://acme-plumbing.com/austin/") F("a choice RGA saved during the monthly read must stand; the read must not write over it");
    // a link Google didn't give us this month doesn't erase the one read before
    db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks() }]);
    await R.decideOnce({ clientId: CID, deps: db.deps({ rows: [], shows: "https://acme-plumbing.com/" }) });
    db.t += 31 * 864e5;
    await R.recheck({ clientId: CID, deps: db.deps({ rows: [], shows: null }) });
    if (((db.task().landing || {}).google || {}).state !== "matches") F("a website link we couldn't read this month must not erase the match read before (it keeps its own date)");
    // 5. not due inside 30 days
    db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks() }]);
    await R.decideOnce({ clientId: CID, deps: db.deps({ rows: [] }) });
    const w5 = db.writes; db.t += 10 * 864e5;
    r = await R.recheck({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    if (r.rechecked || db.writes !== w5) F("a decision read 10 days ago must not be read again");
    db.t += 25 * 864e5;
    r = await R.recheck({ clientId: CID, deps: db.deps({ rows: [row(SITE_US, "plumber austin", 9, 120)] }) });
    t = db.task();
    if (!r.rechecked || t.landing.reason !== "home_wins" || t.landing.read_at !== new Date(db.t).toISOString()) F("a month on, the system's same page must carry this month's reason and numbers");
    // 6. no website: skipped with the reason, Google never asked; a website added later decides again
    db = makeDb([{ id: CID, client: { website_url: "" }, tasks: planTasks() }]);
    r = await R.decideOnce({ clientId: CID, deps: db.deps({ rows: ROWS_B }) });
    t = db.task();
    if (!t || t.status !== "skipped" || t.landing.reason !== "no_site" || t.landing.url !== null) F(`no website must skip the step with the reason (state D), got ${JSON.stringify(t).slice(0, 160)}`);
    if (db.google || db.gsc.length) F("with no website, neither Search Console nor Google may be asked");
    if (GL.pageFor(db.recs.get(CID).data.tasks, { website_url: "" }) !== null) F("no website means no page at all, never a made-up one");
    db.clients.get(CID).website_url = "https://acme-plumbing.com";
    r = await R.recheck({ clientId: CID, deps: db.deps({ rows: [] }) });
    t = db.task();
    if (!r.rechecked || t.status !== "done" || t.landing.url !== SITE_US) F("once a website is on file, the skipped step must decide again");
    // 7. Search Console unreadable: the homepage for now, done (state C); Google unreadable: never "matches"
    db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks() }]);
    await R.decideOnce({ clientId: CID, deps: db.deps({ gscThrows: true, shows: null }) });
    t = db.task();
    if (!t || t.landing.reason !== "unknown" || t.landing.choice !== "homepage" || t.status !== "done") F(`an unreadable Search Console must save the homepage for now and finish the step, got ${JSON.stringify(t && t.landing).slice(0, 160)}`);
    if (!t || !t.landing.google || t.landing.google.state !== "unknown") F("a website link Google didn't give us must be unknown, never matches");
    // 8. RGA's Change…: saved as RGA's, compared with Google, the raise cleared; a page off their site refused
    db = makeDb([{ id: CID, client: { website_url: "acme-plumbing.com" }, tasks: planTasks({ [ID]: { status: "done", landing: { choice: "homepage", url: SITE_US, saved_at: "2026-10-01T10:00:00.000Z", by: "system", reason: "no_data" }, landing_raise: { url: "https://acme-plumbing.com/x/", at: "2026-11-01T00:00:00.000Z" } } }) }]);
    r = await R.saveChoice({ clientId: CID, choice: "service", url: "https://acme-plumbing.com/services/drain-cleaning/", by: "someone@rga", deps: db.deps({ shows: "https://acme-plumbing.com/" }) });
    t = db.task();
    if (r.error || t.landing.by !== "someone@rga" || t.status !== "done" || t.landing_raise || !t.landing.google || t.landing.google.state !== "differs") F(`RGA's Change… must save as RGA's, clear the raise and compare with Google, got ${JSON.stringify(r).slice(0, 120)}`);
    r = await R.saveChoice({ clientId: CID, choice: "service", url: "https://evil.example/x/", by: "someone@rga", deps: db.deps() });
    if (!r.error) F("a page that isn't on the client's site must be refused");
    // 9. the nightly sweep: one narrow select, only due clients, never a test client, capped, an off switch
    const A = "22222222-2222-4222-8222-222222222222", B = "33333333-3333-4333-8333-333333333333", T = "44444444-4444-4444-8444-444444444444", H = "55555555-5555-4555-8555-555555555555", O = "66666666-6666-4666-8666-666666666666";
    db = makeDb([
      { id: A, client: { website_url: "a-plumbing.com" }, tasks: planTasks() },
      { id: B, client: { website_url: "b-dental.com" }, tasks: { [PLAN]: { status: "pending" } } },
      { id: T, client: { website_url: "t.example", source: "test:walk" }, tasks: planTasks() },
      { id: H, client: { website_url: "h.example" }, tasks: planTasks({ [ID]: { status: "done" } }) },
      { id: O, client: { website_url: "acme-plumbing.com" }, tasks: planTasks({ [ID]: { status: "done", landing: { choice: "homepage", url: SITE_US, by: "system", reason: "no_data", saved_at: "2026-09-01T00:00:00.000Z", read_at: "2026-09-01T00:00:00.000Z" } } }) },
    ]);
    const sw = await R.sweepLanding({ deps: db.deps({ rows: ROWS_B }) });
    if (sw.decided !== 1 || !db.task(A) || !db.task(A).landing) F(`the sweep must decide the one due client, got ${JSON.stringify(sw)}`);
    if ((db.task(B) || {}).landing) F("a client whose plan isn't done must not be decided");
    if ((db.task(T) || {}).landing) F("a test client must never be decided by the nightly job");
    if ((db.task(H) || {}).landing) F("a step someone finished by hand before this existed must be left alone");
    if (sw.rechecked !== 1 || !db.task(O).landing_raise) F("a decision a month old must be read again (and a better page raised)");
    const narrow = db.selects.filter((p) => /^\/client_onboarding_records\?select=/.test(p));
    if (narrow.length !== 1) F(`the sweep must find due clients in ONE select, made ${narrow.length}`);
    if (narrow.some((p) => /select=[^&]*(?:^|[=,])data(?:[,&]|$)/.test(p) || !/->/.test(p))) F(`the sweep's select must read only this step and the plan's status, never whole records: ${narrow[0]}`);
    const many = makeDb(Array.from({ length: 14 }, (_, i) => ({ id: `${String(i).padStart(8, "7")}-7777-4777-8777-777777777777`, client: { website_url: `site${i}.example` }, tasks: planTasks() })));
    const capped = await R.sweepLanding({ deps: many.deps({ rows: [] }) });
    if (capped.decided > R.NIGHT_CAP || capped.decided < 1) F(`the sweep must stop at its nightly cap (${R.NIGHT_CAP}), decided ${capped.decided}`);
    const off = await R.sweepLanding({ deps: makeDb([{ id: A, client: { website_url: "a.example" }, tasks: planTasks() }]).deps({ env: { LANDING_AUTO_RUN: "off" } }) });
    if (!off.off || off.decided) F("LANDING_AUTO_RUN=off must stop the nightly decisions");
  } catch (e) { F(`the decider threw: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); }
}

// ── it writes nothing to Google or to a website ──
const writer = fn + "\n" + run;
if (/mybusiness|googleapis\.com\/(?!webmasters)|api\.github\.com|gbp-publish|gbp-apply|website_choice|sendWebsiteChoice|applyFacts|applyForStep|updateMask|method:\s*"(PUT|DELETE)"/.test(writer)) F("the step reaches Google or a website to write: it must save a decision only");
if (R && !/GL\.checkChoice\(/.test(run)) F("RGA's choice is saved without being checked");
if ((run.match(/READ IT BACK/g) || []).length < 4) F("every save (decide, re-read, Change…, Keep) must be read back");
if (!/recordSubmission\(/.test(run)) F("a saved decision must be recorded (check-every-submission-is-recorded)");
if (!/requireWorkspaceForClient\(/.test(fn)) F("the endpoint must be RGA-only");
if (!/if \(action === "auto"\) \{\s*const r = await R\.decideOnce\(/.test(fn)) F("the endpoint has no action for the step to decide itself");
if (/\bChris\b/.test(lib + fn + run)) F("the owner's name is in a served file");
// wired into the nightly job, inside its own try (a failure never stops the rest)
if (!/try \{\s*const gl = await require\("\.\/_gbp-landing-run"\)\.sweepLanding\(\);[\s\S]{0,240}\} catch \(e\)/.test(nightly)) F("the nightly job doesn't run the sweep (inside its own try)");

// ── the old helpers still hold ──
{
  const ck = (o) => GL.checkChoice({ siteUrl: SITE_US, ...o });
  if (!ck({ choice: "homepage" }).ok) F("homepage must be accepted with no address");
  if (ck({ choice: "service" }).ok) F("a service page with no address must be refused");
  if (ck({ choice: "service", url: "https://evil.example/services/" }).ok) F("a page that isn't on the client's site must be refused");
  if (ck({ choice: "city", url: "https://acme-plumbing.com/" }).ok) F("the homepage typed as a city page must be refused");
  if (ck({ choice: "bogus", url: "https://acme-plumbing.com/x/" }).ok) F("an unknown choice must be refused");
  if (!ck({ choice: "page", url: "https://acme-plumbing.com/services/drains/" }).ok) F("a page the rule picked must be a valid saved choice");
  if (!ck({ choice: "service", url: "acme-plumbing.com/drains" }).ok) F("an address typed without https must be accepted");
  const client = { website_url: "acme-plumbing.com" };
  const none = GL.pageFor({}, client);
  if (!none || none.saved || none.choice !== "homepage") F(`nothing saved must fall back to the homepage, got ${JSON.stringify(none)}`);
  const tasks = { [ID]: { landing: { choice: "page", url: "https://acme-plumbing.com/drains/", by: "system" } } };
  const s = GL.pageFor(tasks, client);
  if (!s || !s.saved || s.url !== "https://acme-plumbing.com/drains/") F(`a page the system saved must be used, got ${JSON.stringify(s)}`);
  if (GL.pageFor(tasks, { website_url: "https://new-name.com" })?.saved) F("a saved page from a site the client no longer has must be ignored");
  if (GL.whereWords(none) !== "Your homepage" || GL.whereWords(s) === "Your homepage") F("the words must say homepage only when the homepage is the page");
}

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
    if (s.type !== "manual" || s.hasRunner) F("the step has no runner (it settles itself on the server, not through Run)");
    if (s.selfSettles !== true) F("the step must be self-settling, so admin reads \"Runs itself\" and offers no Undo");
    if (/Press Read Search Console|Choose Homepage, A service page/.test(s.instructions || "")) F("the instructions still tell RGA to read and choose by hand");
    if (!/every keyword in the plan/.test(s.instructions || "") || !/reads again each month/.test(s.instructions || "")) F("the instructions don't say it reads every plan keyword and again each month");
    if (!(s.dependsOn || []).every((d) => j.findIndex((x) => x.id === d) >= 0 && j.findIndex((x) => x.id === d) < at)) F("a dependency points at a step that comes later");
    if ((s.dependsOn || []).length > 1) F("the step is locked behind more than the keyword plan");
    const mm = m1src.match(new RegExp(`id: "${ID.replace(/\./g, "\\.")}"[\\s\\S]*?instructions: \`([\\s\\S]*?)\`,\\n  \\}`));
    if (!mm) F("the step is missing from the canonical month1.mjs");
    else if (mm[1] !== s.instructions) F("the instructions differ between month1.mjs and playbooks.json");
    if (!new RegExp(`id: "${ID.replace(/\./g, "\\.")}"[\\s\\S]{0,200}?selfSettles: true`).test(m1src)) F("month1.mjs doesn't mark the step self-settling");
    if (!new RegExp(`id: "${ID.replace(/\./g, "\\.")}"[\\s\\S]*?title: "Decide which page the Google profile links to"`).test(m1src)) F("the title differs in month1.mjs");
    const order = [...m1src.matchAll(/\bid: "(m1\.[a-z0-9_.]+)"/g)].map((x) => x[1]), oa = order.indexOf(ID);
    if (oa < 0 || order[oa + 1] !== "m1.web.homepage_meta") F("in month1.mjs the step must sit immediately before m1.web.homepage_meta");
  }
  const said = Object.values(wid).map((v) => v && typeof v === "object" ? v[ID] : null).find((x) => typeof x === "string");
  if (!said) F("what-it-does.json has no sentence for the step");
  else if (!/by itself/.test(said)) F("what-it-does.json still says RGA picks the page");
  for (const id of ["m1.web.homepage_meta", "m1.web.h1_cta"]) if (/\bhomepage\b/i.test((j.find((s) => s.id === id) || {}).instructions || "") && !/chosen page/.test((j.find((s) => s.id === id) || {}).instructions)) F(`${id} still aims at the homepage only`);
}

// ── the steps that aim at the homepage use the saved page ──
if (!/GL\.pageFor\(tasks, client\)/.test(deliv) && !/_gbp-landing"\)[\s\S]{0,80}pageFor\(tasks, client\)/.test(deliv)) F("the prefill for the title and headline steps doesn't use the saved page");
if (!/c\.page_url = pg \? pg\.url : site/.test(deliv)) F("the prefill must fall back to the homepage");
if ((exec.match(/\$\{await pageBlock\(client\)\}/g) || []).length < 2) F("both the title and the headline drafts must be aimed at the saved page");
if (!/pageFor\(recs\?\.\[0\]\?\.data\?\.tasks \|\| \{\}, client\)/.test(exec)) F("the draft's page comes from somewhere other than the saved decision");

// ── the card, rendered from admin.js ──
if (/Choose by hand/.test(admin)) F(`admin still says "Choose by hand"`);
if (!/id === "m1\.web\.gbp_landing_page" \? gbpLandingAdminHtml\(t, s\)/.test(admin)) F("the card isn't drawn on its step (with the step's state)");
if (!/o\.flowId === GL_STEP \? `<div class="ob-done-card">\$\{gbpLandingAdminHtml\(s\.task, s\)\}<\/div>`/.test(admin)) F("the card isn't drawn on the done row (A, B, D and E live there)");
if (!/const doneBtn = [^;]*o\.flowId === GL_STEP \? ""/.test(admin)) F("the step still shows Mark step complete (decision 6: one control per decision)");
if (!/if \(flowId === "m1\.web\.gbp_landing_page"\) \{[^\n]*"rga"/.test(admin)) F("the row doesn't say Your move when the card does (B and E)");
const block = (admin.split("const GL_STEP = ")[1] || "").split("function rowStepCardsHtml")[0];
if (!block) F("the card's code moved");
else {
  if (/\b(?:step|Step) \d+\b/.test(block)) F("the card types a step number");
  if (/—/.test(block)) F("the card has an em dash");
  if (/>\s*Send\s*</.test(block) || /"Send"/.test(block)) F("the card offers Send, but no approval path carries the website link yet: it would promise what the system can't do");
  // two presses go to the server (Save / Keep, and Try again): both spin; a failed save un-spins
  if ((block.match(/classList\.add\("is-busy"\)/g) || []).length < 2 || !/classList\.remove\("is-busy"\)/.test(block)) F("the card's controls must spin and un-spin");
  if (!/action: "auto"/.test(block)) F("the card never asks the step to decide itself");
}
// lift the card's code out of admin.js and draw every state
const lift = () => {
  const code = admin;
  const one = (name) => {
    const c = code.match(new RegExp(`^(?:const|let) ${name} = .*$`, "m"));
    if (c) return c[0];
    const at = code.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
    if (at < 0) throw new Error(`${name} isn't in admin.js`);
    let d = 0;
    for (let i = code.indexOf("{", at); i < code.length; i++) { if (code[i] === "{") d++; else if (code[i] === "}") { d--; if (!d) return code.slice(at, i + 1); } }
    throw new Error(`${name} never closes`);
  };
  const names = ["escapeHtml", "escapeAttribute", "gsDay", "GS_LINK", "GS_CLOCK", "GS_WARN", "GS_TICK", "gsCard", "gsRow", "gsAct", "GL_STEP", "_glAuto", "_glEditing", "glUrl", "glKey",
    "glWhere", "glWhy", "GL_NONE", "GL_NO_SEND", "glNow", "glIsStale", "gbpLandingAdminHtml", "glFormHtml"];
  const src = names.map(one).join("\n");
  const box = { state: { selectedClient: { id: CID, website_url: "https://acme-plumbing.com/" } }, timers: 0, console, URL };
  box.setTimeout = () => { box.timers++; };
  vm.createContext(box);
  vm.runInContext(`${src}\n;globalThis.__gl = { gbpLandingAdminHtml, _glAuto, _glEditing };`, box);
  return box;
};
let box = null;
try { box = lift(); } catch (e) { F(`the card's code can't be lifted from admin.js: ${e.message}`); }
if (box) {
  const G = box.__gl, at = "2026-11-06T22:00:00.000Z";
  const ev = (o = {}) => ({ keywords: ["a", "b", "c", "d"], days: 90, clicks: 40, impressions: 420, home: { clicks: 6, impressions: 120 }, top: { page: "https://acme-plumbing.com/services/drain-cleaning/", clicks: 31, impressions: 300 }, pages: [], ...o });
  // a system decision drawn here is under today's rule (rule 2); an old-rule one is tested on its own above
  const draw = (task, ui = "done") => { if (task && task.landing && task.landing.by === "system" && task.landing.rule == null) task = { ...task, landing: { ...task.landing, rule: 2 } }; const h = G.gbpLandingAdminHtml(task, { uiState: ui, task }); const d = new JSDOM(`<body>${h}</body>`).window.document; return { h, d, text: d.body.textContent.replace(/\s+/g, " ") }; };
  const has = (x, sel, why) => { if (!x.d.querySelector(sel)) F(`${why}: no ${sel}`); };
  const say = (x, re, why) => { if (!re.test(x.text)) F(`${why}: "${x.text.slice(0, 180)}"`); };
  const no = (x, re, why) => { if (re.test(x.text) || re.test(x.h)) F(why); };
  const base = (x, name) => { no(x, /Choose by hand|Mark step complete|Read Search Console\b(?! for)/, `${name}: an old control is back`); no(x, />\s*Send\s*</, `${name}: Send is drawn, with no approval path behind it`); };
  // A: homepage, matches
  const A = draw({ status: "done", landing: { choice: "homepage", url: "https://acme-plumbing.com/", reason: "no_data", by: "system", read_at: at, saved_at: at, evidence: ev({ clicks: 0, impressions: 0 }), google: { state: "matches", shows: "https://www.acme-plumbing.com/?utm_source=google", at } } });
  has(A, ".ob-zc.ok", "A"); say(A, /Done/, "A has no Done"); say(A, /The Google profile links to the homepage/, "A's title"); say(A, /no searches yet for their 4 plan keywords/, "A's reason");
  say(A, /ON GOOGLE NOW\s*acme-plumbing\.com · matches/, "A's Google line"); say(A, /Change…/, "A has no Change…"); base(A, "A");
  // B: another page wins, Google shows the homepage
  const B = draw({ status: "done", landing: { choice: "page", url: "https://acme-plumbing.com/services/drain-cleaning/", reason: "page_wins", by: "system", read_at: at, saved_at: at, evidence: ev(), google: { state: "differs", shows: "https://acme-plumbing.com/", at } } });
  say(B, /Your move/, "B isn't RGA's move"); say(B, /The Google profile should link to \/services\/drain-cleaning\//, "B's title"); say(B, /It earned 31 of the 40 clicks for their 4 plan keywords in the last 90 days\. The homepage earned 6\./, "B's reason");
  say(B, /isn't built yet/, "B must say the send for approval isn't built"); has(B, "[data-gl-keep-home]", "B has no Keep the homepage"); say(B, /Keep the homepage/, "B's Keep"); base(B, "B");
  if (B.d.querySelector(".ob-zc.ok")) F("B is drawn as Done");
  // C: Search Console couldn't be read
  const C = draw({ status: "done", landing: { choice: "homepage", url: "https://acme-plumbing.com/", reason: "unknown", by: "system", saved_at: at, read_at: at, evidence: ev(), google: { state: "matches", shows: "https://acme-plumbing.com/", at } } });
  say(C, /The Google profile links to the homepage, for now/, "C's title"); say(C, /Search Console couldn't be read/, "C's reason"); base(C, "C");
  // Google unreadable is never "matches"
  const U = draw({ status: "done", landing: { choice: "homepage", url: "https://acme-plumbing.com/", reason: "no_data", by: "system", saved_at: at, read_at: at, evidence: ev(), google: { state: "unknown", shows: null, at } } });
  no(U, /matches/, "a website link we couldn't read is drawn as matching"); say(U, /Couldn't read the profile's website link/, "an unread Google link must say so");
  // D: no website
  const D = draw({ status: "skipped", landing: { choice: null, url: null, reason: "no_site", by: "system", saved_at: at, evidence: ev() } });
  has(D, ".ob-zc.off", "D"); say(D, /Skipped/, "D's pill"); say(D, /No website on file, so nothing to link to/, "D's title"); base(D, "D");
  // E: the monthly read raised a page
  const E = draw({ status: "done", landing: { choice: "homepage", url: "https://acme-plumbing.com/", reason: "no_data", by: "system", saved_at: at, read_at: at, evidence: ev(), google: { state: "matches", shows: "https://acme-plumbing.com/", at } },
    landing_raise: { url: "https://acme-plumbing.com/services/drain-cleaning/", at, evidence: ev() } });
  say(E, /\/services\/drain-cleaning\/ now earns more than the homepage/, "E's title"); say(E, /Last 90 days: 31 clicks there, 6 on the homepage\. Today the profile links to the homepage\./, "E's line");
  has(E, "[data-gl-keep]", "E has no Keep"); say(E, /Keep the homepage/, "E's Keep"); base(E, "E");
  // active with nothing saved: a spinner and exactly one call, no button
  box.timers = 0;
  const S = draw({ status: "pending" }, "active");
  if (box.timers !== 1) F(`the active step with nothing saved must ask the server once, asked ${box.timers} times`);
  if (S.d.querySelector("button")) F("the deciding state must have no button (it runs itself)");
  say(S, /Reading Search Console/, "the deciding state must say what it's doing");
  G._glAuto.set(CID, "busy"); box.timers = 0; draw({ status: "pending" }, "active");
  if (box.timers) F("a second draw while it's deciding must not ask again");
  G._glAuto.set(CID, "done"); box.timers = 0; const L2 = draw({ status: "pending" }, "active");
  if (box.timers) F("a reply that didn't carry the decision must not ask again by itself (a loop)");
  has(L2, "[data-gl-auto]", "the stuck state has no Try again");
  G._glAuto.set(CID, { error: "Supabase 500" }); const Er = draw({ status: "pending" }, "active");
  has(Er, "[data-gl-auto]", "a failed decision has no Try again"); say(Er, /Nothing was saved/, "a failed decision must say nothing was saved");
  G._glAuto.delete(CID);
  // queued: nothing is asked out of turn
  box.timers = 0; const Q = draw({ status: "pending" }, "queued");
  if (box.timers) F("a step that isn't active must not decide out of turn");
  say(Q, /Decides itself when it's this step's turn/, "the queued card");
  // Change…: RGA's own choice
  G._glEditing.add(CID); const X = draw(B.d ? { status: "done", landing: { choice: "page", url: "https://acme-plumbing.com/services/drain-cleaning/", reason: "page_wins", by: "system", saved_at: at, evidence: ev() } } : {});
  has(X, "[data-gl-save]", "Change… has no Save"); has(X, 'input[type="radio"][value="homepage"]', "Change… has no Homepage choice"); G._glEditing.delete(CID);
  const save = X.d.querySelector("[data-gl-save]"); if (save && save.textContent.trim() !== "Save") F(`the save button must say one plain word, says "${save.textContent.trim()}"`);
}

// 11-6 (the owner's screenshot, 3:22 PM): "/local-seo/ · as many clicks as the homepage (0) … more impressions: 11 to 0" won on EQUAL clicks.
// Approved decision 3: another page wins only with MORE clicks; a tie keeps the homepage. A system decision made under the old rule is made again.
{
  const Lr = req(path.join(SITE, "netlify/functions/_gbp-landing.js"));
  const rows = [{ page: "https://acme-plumbing.com/local-seo/", query: "local seo services near me", clicks: 0, impressions: 11 }];
  const r0 = Lr.recommend ? null : null;
  const rec = typeof Lr.recommendAll === "function" ? Lr.recommendAll : null;
  const fnName = Object.keys(Lr).find((k) => typeof Lr[k] === "function" && /recommend/i.test(k) && k !== "recommend");
  const R2 = fnName ? Lr[fnName] : null;
  if (R2) {
    let out = null; try { out = R2({ rows, keywords: ["local seo services near me"], siteUrl: "https://acme-plumbing.com/" }); } catch { out = null; }
    if (out && out.page && !/acme-plumbing\.com\/?$/.test(out.page.replace(/\/$/, "/").replace(/\/$/, ""))) F(`a page with 0 clicks (the homepage also 0) beat the homepage on impressions: ${out.page} (${out.state})`);
  }
  const fnSrc = fs.readFileSync(path.join(SITE, "netlify/functions/_gbp-landing.js"), "utf8");
  if (!/const wins = !!top && !isHomepage\(top\.page, homeUrl\) && top\.clicks > home\.clicks;/.test(fnSrc)) F("another page can win without MORE clicks than the homepage (approved decision 3: a tie keeps the homepage)");
  if (typeof Lr.staleRule !== "function" || !Lr.staleRule({ by: "system" }) || Lr.staleRule({ by: "system", rule: Lr.RULE }) || Lr.staleRule({ by: "rga@x" })) F("a system decision made under the old rule isn't marked to decide again (or one RGA made is)");
  const runSrc = fs.readFileSync(path.join(SITE, "netlify/functions/_gbp-landing-run.js"), "utf8");
  if (!/const stale = GL\.staleRule\(task\.landing\);\s*if \(task\.landing && !stale\)/.test(runSrc) || !/stale \? unchanged\(task\.landing\) : `\$\{LANDING\}=is\.null`/.test(runSrc)) F("decideOnce doesn't make an old-rule system decision again (or overwrites without checking it's unchanged)");
  if (box) {
    const G = box.__gl;
    G._glAuto.clear();
    const old = G.gbpLandingAdminHtml({ status: "done", landing: { choice: "page", url: "https://acme-plumbing.com/local-seo/", reason: "page_wins", by: "system", saved_at: "2026-11-06T22:00:00Z" } }, { uiState: "done" });
    if (!/Deciding again with the corrected rule/.test(old)) F("a system decision made under the old rule is shown instead of being made again");
    const mine = G.gbpLandingAdminHtml({ status: "done", landing: { choice: "page", url: "https://acme-plumbing.com/local-seo/", reason: "rga", by: "owner@rga.test", saved_at: "2026-11-06T22:00:00Z" } }, { uiState: "done" });
    if (/Deciding again/.test(mine)) F("a page RGA chose by hand is decided again (it must never be)");
  }
}
// 11-6 (the owner's screenshot, 3:12 PM: "The step couldn't decide just now · HTTP 504"): the decision runs in a background function (15 min),
// the admin call answers 202 at once, and the card asks "status" (this step's task only) until it's saved
{
  const fn = rd("netlify/functions/admin-gbp-landing.js");
  let bg = ""; try { bg = rd("netlify/functions/admin-gbp-landing-background.js"); } catch { /* missing = the failure below */ }
  if (!/if \(action === "auto" && !deps\) \{[\s\S]{0,400}admin-gbp-landing-background[\s\S]{0,300}"x-internal-secret": process\.env\.INTERNAL_FN_SECRET[\s\S]{0,300}return json\(202, \{ ok: true, queued: true \}\);/.test(fn)) F("the admin's auto call decides inside the web request again (it timed out at 26 s): it must queue the background function and answer 202");
  if (!/if \(action === "status"\) \{[\s\S]{0,300}select=t:data->tasks->%22m1\.web\.gbp_landing_page%22/.test(fn)) F("the status read isn't narrow (it must read step 42's task only, never the whole setup record)");
  if (!/requireInternalSecret\(event\)/.test(bg) || !/R\.decideOnce\(\{ clientId, trigger: "admin" \}\)/.test(bg)) F("the background function is missing, doesn't check the internal secret, or doesn't run the one decideOnce");
  if (!/if \(r\.status === 202 && j\.queued\) \{[\s\S]{0,500}action: "status"[\s\S]{0,400}if \(!\(task && task\.landing && !glIsStale\(task\.landing\)\)\) throw new Error\(/.test(rd("admin/admin.js"))) F("the card doesn't wait for the background decision (it must ask status until the decision is saved, then say so if it isn't)");
  if (!/r\.status === 504 \? "It took too long to answer"/.test(rd("admin/admin.js"))) F("a timeout still reads as a raw \"HTTP 504\"");
}

if (fails.length) { console.error("🔴 the Google landing page step isn't right:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ landing page step decides itself: every plan keyword, searches that contain one, their own site, 10+ impressions and more clicks to beat the homepage · any site (other country, www, one page, a subpath, none) · once, idempotent, never over RGA's choice · compared with Google (unread is never a match) · monthly re-read raises, never switches; Keep holds · nightly: one narrow select, due clients only, no test clients, capped · writes nothing to Google · states A to E drawn, no Choose by hand, no Mark step complete, no Send");
