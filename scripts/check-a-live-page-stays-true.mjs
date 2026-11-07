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
if (!/require\("\.\/_page-measure"\)\.measureLivePages\(\{ tasks, supa, clientId: client\.id/.test(FE) || !/buildMonth1Report\(\{ client, tasks, pageMeasures,/.test(FE)) fail("the Month 1 report isn't given the numbers");
const A = read("admin/admin.js");
if (!/\(isPage \|\| id === "m1\.web\.homepage_meta"\) && c && !c\.removes_page \? wcMeasureHtml\(id, task\)|isPage && c && !c\.removes_page \? wcMeasureHtml\(id, task\)/.test(A) || !/not enough data yet/.test(A)) fail("the live card doesn't show the numbers");
if (!/if \(act === "measure"\)/.test(AD) || !/This reads once the page is live/.test(AD)) fail("the measure action is gone");

// ── 12 · the website steps run themselves (website_system_v2 build 12 → admin_website_steps_autopilot_v1, the owner 11-6) ──────
const steps = [{ id: "m1.web.homepage_meta", dependsOn: ["m1.strategy.keywords_locations"] }, { id: "m1.web.h1_cta", dependsOn: ["m1.web.homepage_meta"] }, { id: "m1.web.priority_pages", dependsOn: ["m1.web.homepage_meta", "m1.gbp.services_products"] }];
const done = { status: "done" };
if (AR.nextStep(steps, {})) fail("a step starts with its blockers open");
if (AR.nextStep(steps, { "m1.strategy.keywords_locations": done }).id !== "m1.web.homepage_meta") fail("the first unblocked step doesn't start");
if (AR.nextStep(steps, { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": { status: "in_progress" } })) fail("a step starts while the one before it is open");
for (const [what, t] of [["with a stamp", { auto_run: { at: "x" } }], ["with a claim", { auto_done: { start: "x" } }], ["with a draft", { ran_at: "x" }], ["with a change", { site_change: { v: 1 } }], ["done", { status: "done" }], ["in progress", { status: "in_progress" }]]) if (AR.whyNot(steps[0], { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": t }) === null) fail(`a step ${what} starts again`);
const cl = { source: "x", client_portal_stage: "stage_4_onboarding", website_url: "u" };
if (AR.clientWhyNot(cl, {}) !== null) fail("it isn't on by default");
if (AR.clientWhyNot(cl, { WEBSITE_AUTO_RUN: "0" }) === null) fail("the kill switch doesn't stop it");
if (AR.clientWhyNot({ ...cl, source: "test:walk" }, {}) === null) fail("a test client starts");
if (AR.clientWhyNot({ ...cl, client_portal_stage: "stage_1" }, {}) === null) fail("a client before onboarding starts");
if (AR.clientWhyNot({ ...cl, website_url: "" }, {}) === null) fail("a client with no website starts");
// what the system does next, per state (pure)
{
  const T0 = Date.parse("2026-11-06T12:00:00Z"), iso = (ms) => new Date(ms).toISOString(), H = steps[1], base = { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": done };
  const plan = (t, extra = {}, now = T0, data = {}) => AR.planStep(H, { ...base, ...extra, "m1.web.h1_cta": t }, now, data);
  const act = (...a) => { const p = plan(...a); return p ? `${p.act}${p.sig ? `:${p.sig}` : ""}` : null; };
  const ran = iso(T0 - 3600e3), cv = iso(T0 - 1800e3);
  if (act({}) !== "start:start") fail("an unblocked step with no draft doesn't draft itself");
  if (AR.planStep(H, { "m1.strategy.keywords_locations": done, "m1.web.h1_cta": {} }, T0)) fail("a step drafts with a blocker open");
  if (act({ auto_done: { start: iso(T0 - 60e3) } }) !== null) fail("a step drafting right now is started again");
  if (!/^fail/.test(act({ auto_done: { start: iso(T0 - 31 * 60e3) } }) || "")) fail("a run that never finished isn't handed to RGA");
  if (act({ auto_done: { start: iso(T0 - 31 * 60e3) }, auto_failed: { run: "", rev: SC.AUTO_FINISH_REV } }) !== null || act({ auto_done: { start: iso(T0 - 31 * 60e3), [`stuck:${T0 - 31 * 60e3}`]: "x" } }) !== null) fail("a run that never finished starts again");
  const fin = `finish:finish:r${SC.AUTO_FINISH_REV}:${ran}`;
  if (act({ status: "in_progress", ran_at: ran, auto_result: { summary: "x" } }) !== fin) fail("a run that's in isn't checked and saved");
  if (act({ status: "in_progress", ran_at: ran, auto_result: {}, auto_done: { [`finish:r${SC.AUTO_FINISH_REV}:${ran}`]: "x" } }) !== null) fail("a run is finished twice");
  // 11-7: a failure an OLDER reader recorded gets one look with the current reader; one recorded by the current reader is final
  if (act({ status: "in_progress", ran_at: ran, auto_result: {}, auto_done: { [`finish:${ran}`]: "x" }, auto_failed: { run: ran, why: "x" } }) !== fin) fail("a draft an older reader failed never gets a second look");
  if (act({ status: "in_progress", ran_at: ran, auto_result: {}, auto_failed: { run: ran, why: "x", rev: SC.AUTO_FINISH_REV } }) !== null) fail("a draft the current reader failed is looked at again");
  if (act({ status: "done", auto_result: { summary: "x" } }) !== "redo:redo:not_proven") fail("a step ticked before approvals doesn't draft again");
  if (act({ status: "done", auto_result: {}, auto_done: { "redo:not_proven": "x" } }) !== null) fail("a not-proven step redrafts more than once");
  const newer = { "m1.web.homepage_meta": { status: "done", ran_at: iso(T0 - 600e3) } };
  if (!/^redo:redo:ood:m1\.web\.homepage_meta@/.test(act({ status: "in_progress", ran_at: ran, auto_result: {} }, newer) || "")) fail("an out-of-date draft doesn't draft again");
  if (act({ status: "in_progress", ran_at: ran, auto_result: {}, auto_done: { [`redo:ood:m1.web.homepage_meta@${iso(T0 - 600e3)}`]: "x" } }, newer) !== fin) fail("an out-of-date redraft repeats");
  const sc = { v: cv, drafted_by: AR.AUTO_WHO, items: [{ label: "Main headline", after: "x" }] }, as = (o) => ({ v: cv, at: cv, due_at: iso(T0 - 1), failed: [], held: null, rev: SC.AUTO_CHECKS_REV, ...o });
  if (act({ ran_at: ran, site_change: sc, auto_send: as({}) }) !== `send:send:${cv}`) fail("a checked draft past its 24 hours doesn't go to the client");
  if (act({ ran_at: ran, site_change: sc, auto_send: as({ due_at: iso(T0 + 3600e3) }) }) !== null) fail("a draft goes to the client before its 24 hours");
  if (act({ ran_at: ran, site_change: sc, auto_send: as({ held: { at: "x" } }) }) !== null) fail("a held draft still goes to the client");
  if (act({ ran_at: ran, site_change: sc, auto_send: as({ failed: [{ why: "x" }] }) }) !== null) fail("a draft that failed a check still goes to the client");
  if (act({ ran_at: ran, site_change: { ...sc, v: "edited" }, auto_send: as({}) }) !== null) fail("a draft RGA edited goes out by itself");
  if (!/^redo/.test(act({ ran_at: ran, site_change: sc }, newer) || "")) fail("the system's own out-of-date draft doesn't draft again");
  if (act({ ran_at: ran, site_change: { ...sc, drafted_by: "chris@x" } }, newer) !== null) fail("a person's edited draft is redrafted over");
  if (act({ ran_at: ran, site_change: sc, internal_review: { decision: "approved", change_v: cv } }) !== null) fail("a draft with the client is touched");
  // approved: a page change on GitHub access publishes itself (snapshot → pull request → merge), each once; anything else is RGA's by hand
  const P = steps[2], pageC = { v: cv, new_page: true, items: [{ label: "x", after: "y" }] }, appr = { site_change: pageC, approval: { decision: "approved", change_v: cv } };
  const gh = { "m1.access.website": { status: "done", access: { repo: "o/r" } } }, pb = { ...base, "m1.gbp.services_products": done, ...gh };
  const pp = (t, extra = {}, data = {}) => { const p = AR.planStep(P, { ...pb, ...extra, "m1.web.priority_pages": t }, T0, data); return p ? p.act : null; };
  if (pp(appr) !== "snap") fail("an approved page doesn't take its before-snapshot");
  if (pp(appr, {}, { site_snapshot: { at: iso(T0 - 3600e3) } }) !== "open") fail("an approved page doesn't open its pull request");
  if (pp({ ...appr, auto_done: { [`pub:open:${cv}`]: "x" } }, {}, { site_snapshot: { at: iso(T0) } }) !== null) fail("a pull request is opened twice");
  if (pp({ ...appr, publish_pr: { v: cv, number: 4 } }) !== "merge") fail("an open pull request isn't merged");
  if (pp({ ...appr, publish_pr: { v: cv, number: 4 } }, { "m1.access.website": { status: "done", access: { repo: "o/r" }, merge_by: { by: "client" } } }) !== null) fail("RGA merges when the client chose to");
  if (AR.planStep(P, { ...base, "m1.gbp.services_products": done, "m1.web.priority_pages": appr }, T0)) fail("a change with no GitHub access publishes itself");
  if (AR.planStep({ id: "m1.web.image_seo" }, { "m1.web.image_seo": { ran_at: ran, auto_result: {} } }, T0)) fail("step 37 does more than start by itself");
}
// the shared rule the admin reads
{
  const SCx = SC, now = Date.parse("2026-11-06T12:00:00Z"), cl0 = { client_portal_stage: "stage_4_onboarding", website_url: "u" };
  const mv = (t, o = {}) => SCx.autoMove("m1.web.h1_cta", t, { client: cl0, now, ...o });
  if (mv({}) !== "queued" || mv({ auto_done: { start: new Date(now - 60e3).toISOString() } }) !== "drafting" || mv({ ran_at: "2026-11-06T10:00:00Z", auto_result: {} }) !== "checking") fail("the admin can't tell queued / drafting / checking apart");
  const c = { v: "v1" };
  if (mv({ site_change: c, auto_send: { v: "v1", failed: [] } }) !== "scheduled" || mv({ site_change: c, auto_send: { v: "v1", failed: [{ why: "x" }] } }) !== "rga" || mv({ site_change: c, auto_send: { v: "v1", held: { at: "x" } } }) !== "rga") fail("a scheduled / failed / held draft reads the wrong move");
  if (mv({ site_change: c, internal_review: { decision: "approved", change_v: "v1" } }) !== "client") fail("a draft with the client isn't theirs");
  if (mv({}, { client: { ...cl0, source: "test:x" } }) !== null) fail("a test client's step reads as running itself");
  if (mv({ site_change: c, auto_send: { v: "v1", failed: [] } }, { open: ["m1.web.homepage_meta"] }) !== "waiting" || mv({}, { open: ["x"] }) !== "waiting") fail("a step whose earlier step reopened still promises a time (the server waits)");
  if (SCx.isAutoStep("m1.web.image_seo")) fail("step 37 lost its own card");
  const ch = SCx.cleanChange("m1.web.h1_cta", { items: [{ label: "Main headline", after: "Culver City — and the cities you serve — find you" }] });
  if (!ch.change || /—/.test(ch.change.items[0].after)) fail("an em dash reaches the client's copy");
  if (!SCx.autoChecks({ items: [{ label: "Opening", after: "Guaranteed results" }] }).length || SCx.autoChecks({ items: [{ label: "Main headline", after: "Plain words" }] }).length) fail("the checks don't fail a claim we can't back, or fail a clean draft");
}
// the sweep: claimed first, capped, a lost claim or a failed start never acts or retries
const sweep = async (env, n = 4, failStart = false, lost = false) => { const started = [], patched = []; const clients = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, client_portal_stage: "stage_4_onboarding", website_url: "u" }));
  const r = await AR.sweepWebsiteSteps({ deps: { env, now: () => 0, steps, call: async () => ({ ok: true, j: {} }), toUs: (x) => x, start: async (c, s) => { started.push(`${c}:${s}`); if (failStart) throw new Error("no"); },
    supa: async (p, init) => { if (p.startsWith("/clients")) return clients; if (init && init.method === "PATCH") { patched.push(p); return lost ? [] : [{ id: 1 }]; } return [{ id: "r", data: { tasks: { "m1.strategy.keywords_locations": done } } }]; } } }); return { r, started, patched }; };
{ const a = await sweep({ WEBSITE_AUTO_RUN: "0" }); if (a.started.length || a.patched.length || !a.r.off) fail("the kill switch still starts drafts");
  const b = await sweep({}); if (b.started.length !== AR.NIGHT_CAP || b.patched.length !== AR.NIGHT_CAP || !/auto_n=is\.null/.test(b.patched[0] || "")) fail(`the sweep isn't capped, or doesn't claim first (${b.started.length})`);
  const l = await sweep({}, 1, false, true); if (l.started.length) fail("another caller won the claim, and it starts anyway");
  const c = await sweep({}, 1, true); if (c.patched.length !== 1 || c.started.length !== 1) fail("a start that fails falls back into a queue"); }
// finish: the run's lines go out in US English with no em dash, through the checks, held 24 hours; no lines → one redraft, then RGA's
{
  const H = steps[1], ranAt = "2026-11-06T10:00:00Z", calls = [], patches = [];
  const rec = { id: "r", data: { tasks: { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": { status: "done", no_change_needed: { note: "right" } }, "m1.web.h1_cta": { status: "in_progress", ran_at: ranAt, auto_result: { summary: "x", outcome_data: { draft: "H1: x" } } } } } };
  const mk = (change, startLog) => ({ env: {}, now: () => Date.parse("2026-11-06T12:00:00Z"), steps, toUs: (x) => x.replace(/optimise/g, "optimize"),
    start: async (c, s) => startLog.push(s), call: async (fn, body) => { calls.push(body); return body.site_action === "prefill" ? { ok: true, j: { change } } : { ok: true, j: {} }; },
    supa: async (p, init) => { if (p.startsWith("/clients")) return [{ id: "c0", client_portal_stage: "stage_4_onboarding", website_url: "u" }]; if (init && init.method === "PATCH") { patches.push(JSON.parse(init.body)); return [{ id: 1 }]; } return [rec]; } });
  const s1 = []; await AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [{ label: "Line under the headline", after: "We optimise listings so customers in Culver City — and nearby — find you." }] }, s1) });
  const save = calls.find((b) => b.site_action === "save");
  if (!save || /—|optimise/.test(save.change.items[0].after) || !save.auto || save.auto.failed.length) fail("a finished draft isn't saved in US English with no em dash, checks passed");
  calls.length = 0; const s2 = []; await AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [{ label: "Opening", after: "Guaranteed first place on Google." }] }, s2) });
  const save2 = calls.find((b) => b.site_action === "save");
  if (!save2 || !save2.auto.failed.length) fail("a draft with a claim we can't back is saved as passing");
  calls.length = 0; const s3 = []; await AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [] }, s3) });
  if (s3.length !== 1 || s3[0] !== "m1.web.h1_cta" || calls.some((b) => b.site_action === "save")) fail("a draft with no lines isn't redrafted once");
  // the redraft is a model call: with the pass's cap used up it waits (homepage_meta not proven → its redraft takes the one model call)
  rec.data.tasks["m1.web.homepage_meta"] = { status: "done" }; calls.length = 0; const s5 = []; await AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [] }, s5) });
  if (s5.length !== 1) fail(`a no-lines redraft skips the model-call cap (${s5.length} started)`);
  rec.data.tasks["m1.web.homepage_meta"] = { status: "done", no_change_needed: { note: "right" } };
  rec.data.tasks["m1.web.h1_cta"].auto_done = { "redo:no_lines": "x" }; patches.length = 0; const s4 = []; calls.length = 0;
  await AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [] }, s4) });
  if (s4.length || !patches.some((d) => ((d.data.tasks["m1.web.h1_cta"] || {}).auto_failed || {}).why)) fail("a draft that fails twice isn't handed to RGA with its reason");
  // 11-7: a CHECK (no draft) that measured it already right is recorded as already right; one that found a problem is RGA's, with what it found, and isn't re-run
  const chk = (outcome, summary) => { rec.data.tasks["m1.web.h1_cta"] = { status: "in_progress", ran_at: ranAt, outcome, auto_result: { summary, outcome, outcome_data: { unique_phones: 1 } } }; patches.length = 0; calls.length = 0; const st = []; return AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [] }, st) }).then(() => st); };
  const c1 = await chk("consistent", "NAP audit: one phone everywhere");
  if (c1.length || !calls.some((b) => b.site_action === "no_change" && /already right: NAP audit/.test(b.note))) fail("a check that measured it already right isn't recorded as already right (RGA's step 40: \"consistent\")");
  // 11-7 (RGA's step 45): an OLD draft with no outcome and no data is a draft that didn't come out (it redrafts), never a check finding
  { rec.data.tasks["m1.web.h1_cta"] = { status: "in_progress", auto_result: { summary: "=== Google Business Profile Optimization ===\n# A headline" } }; patches.length = 0; calls.length = 0; const st0 = [];
    await AR.sweepWebsiteSteps({ deps: mk({ kind: "visible", items: [] }, st0) });
    if (st0.length !== 1 || patches.some((d) => ((d.data.tasks["m1.web.h1_cta"] || {}).auto_failed || {}).kind === "check")) fail("an old draft with no data reads as a check finding instead of redrafting (RGA's step 45)"); }
  const c2 = await chk("needs_fix", "Mobile PSI: 92/100  CLS=0.116");
  const f2 = patches.map((d) => (d.data.tasks["m1.web.h1_cta"] || {}).auto_failed).find(Boolean);
  if (c2.length || !f2 || f2.kind !== "check" || !/The check found: Mobile PSI: 92\/100/.test(f2.why)) fail("a check that found something isn't RGA's move with what it found (or it re-runs)");
}
const ADx = read("netlify/functions/admin-deliverables.js");
// admin_steps_43_44_v1 + admin_steps_43_50_auto_v1 (11-7): a timing promise fails unless it's on their site; the system takes out what it flagged and checks again
{
  const d43 = { items: [{ label: "Description under the title", after: "Maps SEO for Culver City businesses. Month-to-month from $625/mo. Call (424) 242-2040, same-day start available." }] };
  const f = SC.autoChecks(d43, { siteText: "<p>$625 a month. Cancel anytime</p>" });
  if (!f.some((x) => x.text === "same-day")) fail("a timing promise that isn't on their site passes the checks (RGA's step 43: \"same-day start available\")");
  if (SC.autoChecks(d43, { siteText: "We offer a same-day start." }).length) fail("a timing promise already on their site is flagged");
  const fx = SC.autoFix(d43, f);
  if (fx.change.items[0].after !== "Maps SEO for Culver City businesses. Month-to-month from $625/mo. Call (424) 242-2040." || fx.fixed[0].removed !== "same-day start available" || SC.autoChecks(fx.change).length) fail(`the system doesn't take out the flagged clause by itself (${fx.change.items[0].after})`);
  const g = { items: [{ label: "Opening", after: "Guaranteed first place on Google." }] };
  if (SC.autoFix(g, SC.autoChecks(g)).fixed.length) fail("a fix that would empty a line is made (that one stays RGA's)");
  const T0 = Date.parse("2026-11-07T12:00:00Z"), cv = "2026-11-07T10:00:00.000Z", sc0 = { v: cv, drafted_by: AR.AUTO_WHO, items: [{ label: "x", after: "y" }] };
  const base0 = { "m1.strategy.keywords_locations": done, "m1.web.homepage_meta": done };
  const pl = (a) => AR.planStep(steps[1], { ...base0, "m1.web.h1_cta": { ran_at: cv, site_change: sc0, auto_send: { v: cv, due_at: "2026-11-07T11:00:00Z", failed: [], ...a } } }, T0);
  if ((pl({}) || {}).act !== "recheck" || (pl({ rev: SC.AUTO_CHECKS_REV }) || {}).act !== "send") fail("a waiting draft checked before a check was added isn't checked again before it goes");
  const calls2 = [];
  const fk = { siteText: async () => "", call: async (fn, b) => { calls2.push(b); return { ok: true, j: {} }; } };
  const r1 = await AR.checkAndFix(fk, { id: "c" }, d43);
  if (r1.failed.length || !r1.fixed.length || /same-day/.test(r1.change.items[0].after)) fail("checkAndFix doesn't fix and pass the step 43 draft");
}
if (!/const keep = Date\.parse\(body\.auto\.due_at \|\| ""\), due = Number\.isFinite\(keep\) && keep > Date\.parse\(now\)/.test(ADx)) fail("the system's own fix of a waiting draft restarts its 24 hours (or can make it go sooner)");
// 11-7: the draft reader knows "**TITLE:**" with the words in backticks below (RGA's step 43 redraft read as "no lines"), and the older shapes
{
  const at = ADx.indexOf("  const line = (re) => {"), end = ADx.indexOf("  let html = \"\";", at);
  if (at < 0 || end < 0) fail("the draft reader moved");
  else {
    const reader = (draft) => new Function("draft", `${ADx.slice(at, end)}; return line;`)(draft);
    const r1 = reader("Here it is.\n\n---\n\n**TITLE:**\n`Local SEO Services in Culver City | Acme`\n*(52 characters)*\n\n---\n\n**META:**\n`Maps SEO for Culver City businesses.`");
    const r2 = reader("H1: Plain words\nSUB: **Bold words**\nPRIMARY_CTA: `Book a call`"), r3 = reader("**H1**\nOld style headline");
    if (r1(/TITLE:\s*(.+)/i) !== "Local SEO Services in Culver City | Acme" || r1(/META:\s*(.+)/i) !== "Maps SEO for Culver City businesses.") fail("a draft written **TITLE:** with the words in backticks reads as no lines");
    if (r2(/H1:\s*(.+)/i) !== "Plain words" || r2(/SUB:\s*(.+)/i) !== "Bold words" || r2(/PRIMARY_CTA:\s*(.+)/i) !== "Book a call" || r3(/H1:\s*(.+)/i) !== "Old style headline") fail("the draft reader lost an older shape");
  }
}
if (!/SiteChange\.ALREADY_RIGHT\.includes\(result\.outcome\)/.test(FE) || !SC.ALREADY_RIGHT.includes("consistent")) fail("a run that measured it already right (NAP's \"consistent\") isn't recorded as already right");
if (!/if \(gate\.internal && body\.auto && typeof body\.auto === "object"\) \{/.test(ADx) || !/\} else delete t\.auto_send;/.test(ADx)) fail("a person's save can set the 24-hour send, or doesn't cancel it");
if (!/else if \(act === "auto_send"\)/.test(ADx) || !/if \(op === "hold"\) t\.auto_send = \{ \.\.\.a, held:/.test(ADx)) fail("Hold is gone");
if (!/sweepWebsiteSteps\(\)/.test(read("netlify/functions/metrics-daily-refresh.js"))) fail("nothing runs the sweep at night");
if (!/\[functions\."website-autopilot"\]\s*\n\s*schedule = "\*\/10 \* \* \* \*"/.test(TOML) || !/sweepWebsiteSteps\(\{ trigger: "watch" \}\)/.test(read("netlify/functions/website-autopilot-background.js"))) fail("nothing runs the website steps every 10 minutes");
if (/sendEmail|notify-client|postmark|mailgun|resend\./i.test(read("netlify/functions/_website-autorun.js"))) fail("the sweep emails someone");

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
console.log("✅ a live page stays true: read back on 7 checks (couldn't check is never a pass), nightly drift reopens and a clean reading closes, Search Console at 2/4/8 weeks or \"not enough data yet\", the website steps run themselves (claimed first, capped, one redraft per reason, held 24 hours, never over RGA's edit, no em dash), a made-up address must 404, Google's link keeps its own checks");
