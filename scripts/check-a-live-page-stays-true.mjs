#!/usr/bin/env node
// check-a-live-page-stays-true.mjs: website_system_v2 builds 10, 11, 12, 14, 16 (approved 10-28, built 11-01). RUNS the real modules and the real nightly handler on fakes: no client site, no Google, no database, no model.
//  10 · read back: title, headline, areas, canonical, not hidden, in the sitemap, schema parses; "couldn't check" is never a pass; drift reopens the step, a clean reading closes it, an unread page changes nothing
//  11 · Search Console per page at 2, 4, 8 weeks: real numbers or "not enough data yet", never zero for unread
//  12 · a step drafts itself once when its blockers are done: off by default, claim first, capped, never a test client, never a loop
//  14 · a made-up address must answer 404, and unknown stays unknown
//  16 · Google's link: the choice keeps its own card and checks; the live page only fills in the address
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret", URL: "https://site.test" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const read = (r) => fs.readFileSync(`${SITE}/${r}`, "utf8");
let RB, PM, AR, M1, watch, SC;
const DB = { rec: { id: 7, data: { tasks: {} } }, writes: 0 }, WEB = {};
const CID = "22222222-2222-4222-8222-222222222222";
const ok = (b, s = 200) => new Response(s === 204 ? null : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
let lastClientsQuery = "";
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || "GET").toUpperCase();
  if (u.startsWith("https://db.test")) {
    if (u.includes("/rest/v1/clients")) { lastClientsQuery = u; return ok([{ id: CID, website_url: "https://x.test" }]); }
    if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { DB.writes++; DB.rec.data = JSON.parse(init.body).data; return ok(null, 204); } return ok([JSON.parse(JSON.stringify(DB.rec))]); }
    return ok([]);
  }
  if (u.startsWith("https://x.test")) { const b = WEB[u]; if (b === undefined) throw new Error("timeout"); return typeof b === "number" ? new Response("gone", { status: b }) : new Response(b, { status: 200 }); }
  if (u.includes("/.netlify/functions/")) return ok({ ok: true });
  throw new Error(`gate fetch: unexpected ${m} ${u}`);
};
try { RB = req(path.join(SITE, "netlify/functions/_page-readback.js")); PM = req(path.join(SITE, "netlify/functions/_page-measure.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js")); M1 = req(path.join(SITE, "netlify/functions/_month1-report.js")); watch = req(path.join(SITE, "netlify/functions/site-change-watch.js")).handler; SC = req(path.join(SITE, "shared/site-change.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }

// ── 10 · the live checks ─────────────────────────────────────────────────────────────────────
const U = "https://x.test/water/";
const C = { page_url: U, kind: "visible", new_page: true, items: [{ label: "Page title", after: "Water | X" }, { label: "Main headline", after: "Water heaters" }, { label: "Areas named", check: false, after: "Oak Park, Elm" }] };
const good = `<html><head><title>Water | X</title><link rel="canonical" href="https://www.x.test/water"><script type="application/ld+json">{"a":1}</script></head><body><h1>Water heaters</h1><ul><li>Oak Park</li><li>Elm</li></ul></body></html>`;
const SM = `<urlset><loc>https://x.test/water/</loc></urlset>`;
const by = (c, h, s) => Object.fromEntries(RB.liveChecks(c, h, s).map((x) => [x.id, x.ok]));
const g = by(C, good, SM);
for (const k of ["title", "headline", "areas", "canonical", "indexable", "sitemap", "schema"]) if (g[k] !== true) fail(`a good page fails its ${k} check`);
if (RB.blocking(RB.liveChecks(C, good, SM)).length) fail("a good page is blocked");
if (by(C, good.replace("Water | X", "Old"), SM).title !== false) fail("a wrong title passes");
if (by(C, good.replace("Water heaters", "Other"), SM).headline !== false) fail("a wrong headline passes");
if (by(C, good.replace("Oak Park", "Somewhere"), SM).areas !== false) fail("a missing area passes");
if (by(C, good.replace("www.x.test/water", "x.test/other"), SM).canonical !== false) fail("a canonical to another page passes");
if (by(C, good.replace(/<link[^>]+>/, ""), SM).canonical !== null) fail("no canonical reads as a pass or a fail, not \"couldn't check\"");
const hid = good.replace("</head>", '<meta name="robots" content="noindex"></head>');
if (by(C, hid, SM).indexable !== false || !RB.blocking(RB.liveChecks(C, hid, SM)).length) fail("a page hidden from Google isn't blocked");
if (!RB.blocking(RB.liveChecks(C, good.replace("www.x.test/water", "x.test/other"), SM)).length) fail("a canonical pointing elsewhere isn't blocked");
if (by(C, good, `<urlset></urlset>`).sitemap !== false) fail("a page not in the sitemap passes");
if (by(C, good, null).sitemap !== null) fail("an unread sitemap reads as a pass or a fail");
if (by(C, good.replace('{"a":1}', "{broken"), SM).schema !== false) fail("broken structured data passes");
if (by(C, good.replace(/<script[\s\S]*?<\/script>/, ""), SM).schema !== null) fail("no structured data reads as a pass or a fail");
const AD = read("netlify/functions/admin-deliverables.js");
if (!/liveChecks = RB\.liveChecks\(c, servedHtml, smXml\);/.test(AD) || !/const stop = RB\.blocking\(liveChecks\);\n\s*if \(stop\.length && !String\(body\.unchecked_reason/.test(AD) || !/\.\.\.\(liveChecks \? \{ checks: liveChecks \} : \{\}\)/.test(AD)) fail("Mark live doesn't run the checks, refuse on them, or keep them");
if (/SC\.STEPS\[key\] \|\| \{\}\)\.test/.test(AD.slice(AD.indexOf("liveChecks = RB"), AD.indexOf("liveChecks = RB") + 100))) fail("the access test page, hidden from Google on purpose, is blocked");
// the nightly job, on fakes
const key = "m1.web.homepage_meta";
const ch = { v: "1", kind: "visible", page_url: "https://x.test/", items: [{ label: "Page title", role: "title", after: "Approved title" }] };
const live = () => ({ status: "done", completed_at: "2026-10-01", site_change: ch, approval: { decision: "approved", change_v: "1" }, published: { v: "1", at: "2026-10-01T00:00:00Z" }, client_input: { keep: "me" } });
const run = async () => { const r = await watch({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret" } }); return JSON.parse(r.body); };
DB.rec.data.tasks = { [key]: live(), "m1.access.publish_test": { ...live(), site_change: { ...ch, v: "1" } } };
WEB["https://x.test/"] = "<title>Approved title</title>";
let o = await run();
if (o.read !== 1 || o.reopened || DB.writes) fail(`a page that's still right gets written, or the test page is read (${JSON.stringify(o).slice(0, 120)})`);
if (!/or=\(source\.is\.null,source\.not\.like\.test:\*\)/.test(lastClientsQuery)) fail("the nightly job reads test clients");
WEB["https://x.test/"] = "<title>Someone changed it</title>";
o = await run();
const T = () => DB.rec.data.tasks[key];
if (o.reopened !== 1 || !T().live_drift || T().status !== "in_progress" || !T().live_drift.missing.includes("Page title")) fail(`drift doesn't reopen the step and name the line (${JSON.stringify(T()).slice(0, 120)})`);
if (!T().published || T().client_input.keep !== "me") fail("reopening a step lost what's on it");
const w1 = DB.writes; o = await run();
if (DB.writes !== w1 || o.reopened) fail("the same drift writes again every night");
delete WEB["https://x.test/"]; const w2 = DB.writes; o = await run();
if (o.unknown !== 1 || DB.writes !== w2 || !T().live_drift) fail("a page that won't answer changes something");
WEB["https://x.test/"] = 500; const w3 = DB.writes; o = await run();
if (o.unknown !== 1 || DB.writes !== w3) fail("a server error on their site reads as drift");
WEB["https://x.test/"] = "<title>Approved title</title>"; o = await run();
if (o.cleared !== 1 || T().live_drift || T().status !== "done") fail("a clean reading doesn't close the drift");
DB.rec.data.tasks[key] = { ...live(), site_change: { ...ch, page_url: "https://x.test/p/" } }; WEB["https://x.test/p/"] = 404; o = await run();
if (o.reopened !== 1 || !/no longer opens/.test((T().live_drift.missing || [])[0] || "")) fail("a page that's gone isn't drift");
const rm = { ...live(), site_change: { v: "1", kind: "visible", removes_page: true, page_url: "https://x.test/gone/", removed_title: "The old page" } };
DB.rec.data.tasks[key] = rm; WEB["https://x.test/gone/"] = 404; o = await run();
if (o.reopened) fail("a removed page that's really gone reads as drift");
WEB["https://x.test/gone/"] = "<title>The old page</title>"; o = await run();
if (o.reopened !== 1) fail("a removed page that came back isn't drift");
const TOML = read("netlify.toml"), MAN = read("netlify/functions/_job-manifest.js");
if (!/\[functions\."site-change-watch"\]\n\s*schedule = "35 12 \* \* \*"/.test(TOML) || !/job: "site-change-watch"/.test(MAN)) fail("the nightly job isn't scheduled, or isn't on the job list");
if (/stale|sendEmail|send-step-email/.test(read("netlify/functions/site-change-watch.js"))) fail("the nightly job emails someone");
for (const w of [/method: "(POST|PUT|DELETE)"/]) if (w.test(read("netlify/functions/site-change-watch.js"))) fail("the nightly job writes to a website");

// ── 11 · Search Console per page ─────────────────────────────────────────────────────────────
const at = "2026-09-01T12:00:00Z", now = new Date("2026-10-02T12:00:00Z");
const rows = [{ date: "2026-09-05", clicks: 2, impressions: 40, position: 9 }, { date: "2026-09-20", clicks: 1, impressions: 60, position: 7 }];
const m = PM.measurePage(rows, at, now);
if (m.state !== "ok" || m.windows.length !== 3) fail("it isn't 2, 4 and 8 weeks");
else {
  if (m.windows[0].clicks !== 2 || m.windows[0].impressions !== 40) fail(`the 2-week window isn't this page's first 2 weeks (${JSON.stringify(m.windows[0])})`);
  if (m.windows[1].clicks !== 3 || m.windows[1].impressions !== 100 || m.windows[1].position !== 7.8) fail(`the 4-week window is wrong (${JSON.stringify(m.windows[1])})`);
  if (m.windows[2].state !== "not_yet") fail("a window that hasn't ended shows a number");
}
if (PM.measurePage([], at, now).windows[0].state !== "no_data") fail("no rows reads as zero, not \"not enough data yet\"");
if (PM.measurePage(null, at, now).state !== "unknown") fail("an unread Search Console reads as zero");
if (!/not enough data yet/.test(PM.measureSentence({ measure: PM.measurePage([], at, now) }))) fail("the report's words don't say \"not enough data yet\"");
if (/caused|improved|because of/i.test(PM.measureSentence({ measure: m }))) fail("the report credits the page");
const noTable = await PM.readPageRows({ supa: async (p) => { if (p.startsWith("/client_gsc_daily")) throw new Error("PGRST205"); return []; }, clientId: "c", url: "u", from: "2026-09-01", token: async () => "t" });
if (noTable !== null) fail("no table and no connection isn't \"couldn't read\"");
const rep = M1.buildMonth1Report({ client: { business_name: "X" }, tasks: {}, playbook: [], months: [], baseline: {}, pageMeasures: [{ url: U, published_at: at, measure: m }], now });
if (!rep.sections.some((s) => s.key === "pages") || !rep.text.includes(U) || !/average position 9/.test(rep.text)) fail("the Month 1 report doesn't carry the page's numbers");
if (M1.FORBIDDEN.test(rep.text)) fail("the page line trips the report's own forbidden words");
if (M1.buildMonth1Report({ client: { business_name: "X" }, tasks: {}, playbook: [], months: [], baseline: {}, now }).sections.some((s) => s.key === "pages")) fail("a report with no live page has a pages section");
const FE = read("netlify/functions/flow-execute.js");
if (!/PM\.measureLivePages\(\{ tasks, supa, clientId: client\.id/.test(FE) || !/buildMonth1Report\(\{ client, tasks, pageMeasures,/.test(FE)) fail("the Month 1 report isn't given the numbers");
const A = read("admin/admin.js");
if (!/isPage && c && !c\.removes_page \? wcMeasureHtml\(id, task\)/.test(A) || !/not enough data yet/.test(A)) fail("the live card doesn't show the numbers");
if (!/if \(act === "measure"\)/.test(AD) || !/This reads once the page is live/.test(AD)) fail("the measure action is gone");

// ── 12 · drafts itself once ──────────────────────────────────────────────────────────────────
const steps = [{ id: "m1.web.homepage_meta", dependsOn: ["m1.strategy.keywords_locations"] }, { id: "m1.web.h1_cta", dependsOn: ["m1.web.homepage_meta"] }, { id: "m1.web.priority_pages", dependsOn: ["m1.web.homepage_meta", "m1.gbp.services_products"] }];
const done = { status: "done" };
if (AR.nextStep(steps, {})) fail("a step starts with its blockers open");
if (AR.nextStep(steps, { "m1.strategy.keywords_locations": done }).id !== "m1.web.homepage_meta") fail("the first unblocked step doesn't start");
if (AR.nextStep(steps, { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": { status: "in_progress" } })) fail("a step starts while the one before it is open");
for (const [what, t] of [["with a stamp", { auto_run: { at: "x" } }], ["with a draft", { ran_at: "x" }], ["with a change", { site_change: { v: 1 } }], ["done", { status: "done" }], ["in progress", { status: "in_progress" }]]) if (AR.whyNot(steps[0], { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": t }) === null) fail(`a step ${what} starts again`);
if (AR.clientWhyNot({ source: "x", client_portal_stage: "stage_4_onboarding", website_url: "u" }, {}) === null) fail("it's on by default");
const on = { WEBSITE_AUTO_RUN: "1" };
if (AR.clientWhyNot({ source: "test:walk", client_portal_stage: "stage_4_onboarding", website_url: "u" }, on) === null) fail("a test client starts");
if (AR.clientWhyNot({ client_portal_stage: "stage_1", website_url: "u" }, on) === null) fail("a client before onboarding starts");
if (AR.clientWhyNot({ client_portal_stage: "stage_4_onboarding", website_url: "" }, on) === null) fail("a client with no website starts");
const sweep = async (env, n = 4, failStart = false, lost = false) => { const started = [], patched = []; const clients = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, client_portal_stage: "stage_4_onboarding", website_url: "u" }));
  const r = await AR.sweepWebsiteSteps({ deps: { env, now: () => 0, steps, start: async (c, s) => { started.push(`${c}:${s}`); if (failStart) throw new Error("no"); },
    supa: async (p, init) => { if (p.startsWith("/clients")) return clients; if (init && init.method === "PATCH") { patched.push(p); return lost ? [] : [{ id: 1 }]; } return [{ id: "r", data: { tasks: { "m1.strategy.keywords_locations": done } } }]; } } }); return { r, started, patched }; };
{ const a = await sweep({}); if (a.started.length || a.patched.length || !a.r.off) fail("off still starts drafts");
  const b = await sweep(on); if (b.started.length !== AR.NIGHT_CAP || b.patched.length !== AR.NIGHT_CAP || !/auto_run=is\.null/.test(b.patched[0])) fail(`the sweep isn't capped, or doesn't claim first (${b.started.length})`);
  const l = await sweep(on, 1, false, true); if (l.started.length) fail("another caller won the claim, and it starts anyway");
  const c = await sweep(on, 1, true); if (c.patched.length !== 1 || c.started.length !== 1) fail("a start that fails falls back into a queue"); }
if (!/sweepWebsiteSteps\(\)/.test(read("netlify/functions/metrics-daily-refresh.js"))) fail("nothing runs the sweep");
if (/send|email/i.test(read("netlify/functions/_website-autorun.js").replace(/Nothing here emails anyone/, "").replace(/RGA reviews and sends it/, ""))) fail("the sweep sends something");

// ── 14 · a made-up address ───────────────────────────────────────────────────────────────────
const b14 = FE.slice(FE.indexOf('"m1.web.https_sitemap": async'), FE.indexOf('"m1.web.homepage_meta": async'));
if (!/rga-no-such-page-\$\{Date\.now\(\)/.test(b14) || !/const real404 = made \? made\.status === 404 \|\| made\.status === 410 : null;/.test(b14) || !/real404 !== false \? "ok" : "needs_fix"/.test(b14) || !/method/.test(b14) === false) fail("row 39 doesn't try a made-up address, or a soft 404 reads as fine");
if (/from = "\/\*"\s*\n\s*to = "\/index\.html"/.test(TOML)) fail("every made-up address serves the home page again");

// ── 16 · Google's link ───────────────────────────────────────────────────────────────────────
if (!/_gsLinkPrefill\.set\(cid, \(task\.site_change \|\| \{\}\)\.page_url/.test(A) || !/pick = _gsLinkPrefill\.get\(cid\) \? "location"/.test(A) || !/data-ob-wc-gbplink>Use this page for Google's link</.test(A)) fail("a live city page doesn't fill in Google's link choice");
const g16 = A.slice(A.indexOf('t.hasAttribute("data-ob-wc-gbplink")'), A.indexOf('t.hasAttribute("data-ob-wc-proofask")'));
if (/fetch\(|gsPost\(|wcAction\(/.test(g16)) fail("the button writes to Google by itself: the choice keeps its own card and checks");
if (read("netlify/functions/_google-consent.js").length < 100) fail("the consent guard is gone");

if (F.length) { console.error(`❌ a live page stays true: ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ a live page stays true: read back on 7 checks (couldn't check is never a pass), nightly drift reopens and a clean reading closes, Search Console at 2/4/8 weeks or \"not enough data yet\", a step drafts itself once (off by default, claim first, capped), a made-up address must 404, Google's link keeps its own checks");
