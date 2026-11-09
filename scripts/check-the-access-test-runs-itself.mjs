#!/usr/bin/env node
// check-the-access-test-runs-itself.mjs — THE ACCESS TEST, APPROVED IN THE CLICK THAT GIVES ACCESS (approved auto_access_test_v1 option A, the owner 11-8:
// "approved. do recommeded on all"). "Nothing goes live until you approve it" stays true: the Install card and the consent tick say, in words the
// client reads, that the click approves one hidden test; the grant records them. With that on record the website autopilot drafts the test page,
// sends it, approves it by that consent, publishes it, then takes it down the same way. Without it, nothing changes (RGA's buttons, as before).
// RUNS the real admin handler on a fake database, the pure plan, and pins the words. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret", URL: "https://site.test", GITHUB_ADMIN_TOKEN: "gh-fake" });
const CID = "11111111-1111-4111-8111-111111111111", T = "m1.access.publish_test", A = "m1.access.website", SITEURL = "https://sparks.test";
const DB = { rec: { id: 7, data: { tasks: {} } } };
const ok = (b, s = 200) => new Response(s === 204 ? null : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || "GET").toUpperCase();
  if (u.startsWith("https://db.test")) {
    if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { DB.rec.data = JSON.parse(init.body).data; return ok(null, 204); } return ok([JSON.parse(JSON.stringify(DB.rec))]); }
    if (u.includes("/rest/v1/clients")) return ok([{ id: CID, business_name: "Sparks Electric", website_url: SITEURL, workspace_id: "w1" }]);
    return ok([]);
  }
  if (u.startsWith("https://api.github.com")) { const p = u.replace("https://api.github.com", "").split("?")[0]; if (/\/contents\//.test(p)) return ok({ message: "Not Found" }, 404); if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return ok({ default_branch: "main", permissions: { push: true } }); return ok({ message: "Not Found" }, 404); }
  if (u.startsWith(SITEURL)) return new Response(`<!doctype html><html><head><title>Electricians in Springfield | Sparks</title><meta name="description" content="old"><link rel="canonical" href="${SITEURL}/"></head><body><header><a href="/">Home</a></header><main><h1>Your local electrician</h1><p>old words</p></main><footer>Call us</footer></body></html>`, { status: 200 });
  return new Response("no", { status: 599 });
};
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let adminH, SC, AR, P, PGA;
try {
  adminH = req(path.join(SITE, "netlify/functions/admin-deliverables.js")).handler; SC = req(path.join(SITE, "shared/site-change.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js"));
  P = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8"); PGA = fs.readFileSync(path.join(SITE, "netlify/functions/portal-github-app.js"), "utf8");
  for (const n of ["testConsentOf", "testPlan", "ACCESS_TEST_CONSENT_INSTALL", "ACCESS_TEST_CONSENT_INVITE"]) if (!SC[n]) throw new Error(`site-change.js has no ${n}`);
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const adm = async (b) => { const r = await adminH({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret" }, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };

try {
  // ── the words: what the client reads is what the server looks for ──
  const lit = (name) => { const m = new RegExp(`^const ${name} = "([^"]*)";`, "m").exec(P); return m ? m[1] : null; };
  if (lit("ACCESS_TEST_CONSENT_INSTALL") !== SC.ACCESS_TEST_CONSENT_INSTALL) fail("the Install card's test sentence isn't the one the server looks for");
  if (!String(lit("ACC_CONSENT_TEXT") || "").endsWith(SC.ACCESS_TEST_CONSENT_INVITE)) fail(`the consent tick doesn't carry the test sentence word for word (${lit("ACC_CONSENT_TEXT")})`);
  if (!SC.ACCESS_TEST_CONSENT_INSTALL.includes(SC.TEST_CONSENT_MARK) || !SC.ACCESS_TEST_CONSENT_INVITE.includes(SC.TEST_CONSENT_MARK)) fail("a consent sentence lacks the words the server looks for");
  if (lit("ACC_PROMISE_VERSION") === "2026-10-23b") fail("the promise version wasn't moved on with the new consent words");
  if (!/It can only change the repository you pick, and nothing goes live until you approve it\. \$\{escapeHtml\(ACCESS_TEST_CONSENT_INSTALL\)\} Remove it anytime in GitHub\./.test(P)) fail("the Install card doesn't say installing approves the one test");
  if (!/test_ok: \{ at, by: who, words: require\("\.\.\/\.\.\/shared\/site-change\.js"\)\.ACCESS_TEST_CONSENT_INSTALL \}/.test(PGA)) fail("the app grant doesn't record the Install card's test consent");

  // ── whose consent counts ──
  const live = { confirmed_at: "2026-11-09T00:00:00Z", repo: "acme/site", via: "github_app" };
  const inst = { ...live, test_ok: { at: "2026-11-09T00:00:00Z", by: "owner@acme.test", words: SC.ACCESS_TEST_CONSENT_INSTALL } };
  const tick = (text) => ({ client_input: { via: "invite", consent: { promise: "2026-11-08", text, at: "2026-11-09T00:00:00Z", by: "owner@acme.test" } } });
  const W = (w) => ({ [A]: w });
  const tc = (x) => { try { return SC.testConsentOf(x); } catch (e) { return { how: `threw: ${e.message}` }; } };   // a crash is a wrong answer here, never "can't tell"
  if ((tc(W({ access: inst })) || {}).how !== "install") fail("the app grant's consent isn't read");
  if ((tc(W({ ...tick(`I allow… ${SC.ACCESS_TEST_CONSENT_INVITE}`), access: { confirmed_at: "x" } })) || {}).how !== "consent") fail("the consent tick's test approval isn't read");
  if (tc(W({ ...tick("I allow Rocket Growth Agency to access my website… No change goes live until I approve it."), access: { confirmed_at: "x" } }))) fail("the OLD consent words (no test in them) count as approving the test");
  if (tc(W({ access: live }))) fail("an app grant without the Install card's words counts as approving the test");

  // ── the plan, start to finish ──
  const built = { state: "built", host: "Netlify" };
  const base = (extra = {}, tw = {}) => ({ [A]: { access: inst, host_check: built, ...tw }, ...extra });
  const tt = (o) => ({ [T]: o });
  const c1 = { v: "v1", new_page: true, page_url: `${SITEURL}/rga-access-test/`, files: [{ path: "rga-access-test/index.html", action: "add" }], items: [{ label: "Page title", role: "title", after: "Website access check | Acme" }] };
  const steps = [
    ["no consent", { [A]: { access: live, host_check: built } }, null],
    ["consent, access, host built, nothing drafted", base(), "test_draft"],
    ["the host still checking", base({}, { host_check: { state: "checking" } }), null],
    ["the host refused and RGA merges", base({}, { host_check: { state: "refused" } }), null],
    ["the host refused but the client merges", base({}, { host_check: { state: "refused" }, merge_by: { by: "client" } }), "test_draft"],
    ["the app removed", { [A]: { access: { ...inst, removed_at: "y" }, host_check: built } }, null],
    ["a builder site (no repository, no host check)", { [A]: { ...tick(`x ${SC.ACCESS_TEST_CONSENT_INVITE}`), access: { confirmed_at: "x" } } }, "test_draft"],
    ["drafted", base(tt({ site_change: c1 })), "test_send"],
    ["sent", base(tt({ site_change: c1, internal_review: { decision: "approved", change_v: "v1", at: "z" } })), "test_approve"],
    ["approved", base(tt({ site_change: c1, internal_review: { decision: "approved", change_v: "v1" }, approval: { decision: "approved", change_v: "v1", at: "z" } })), null],
    ["the test page live", base(tt({ site_change: c1, approval: { decision: "approved", change_v: "v1" }, published: { v: "v1", at: "p" } })), "test_remove"],
    ["the test page taken down", base(tt({ site_change: { ...c1, v: "v2", removes_page: true }, approval: { decision: "approved", change_v: "v2" }, published: { v: "v2", at: "p" } })), null],
  ];
  const tp = (x) => { try { return SC.testPlan(x); } catch (e) { return `threw: ${e.message}`; } };
  for (const [why, tasks, want] of steps) { const got = tp(tasks); if (got !== want) fail(`testPlan: ${why} → ${got} (want ${want})`); }

  // the autopilot carries it: each move once, then an approved test publishes like any page; without consent it stays RGA's
  const now = Date.parse("2026-11-09T12:00:00Z"), ST = AR.TEST_STEP;
  const planStep = (...a) => { try { return AR.planStep(...a); } catch (e) { return { act: `threw: ${e.message}` }; } };
  const p1 = planStep(ST, base(), now);
  if (!p1 || p1.act !== "test_draft") fail(`the autopilot doesn't draft the test by itself (${JSON.stringify(p1)})`);
  if (planStep(ST, base(tt({ auto_done: { [p1 && p1.sig]: "x" } })), now)) fail("the same test move runs twice");
  const appr = tt({ site_change: c1, internal_review: { decision: "approved", change_v: "v1" }, approval: { decision: "approved", change_v: "v1", at: "z" } });
  const pa = planStep(ST, base(appr), now);
  if (!pa || !["snap", "open"].includes(pa.act)) fail(`an approved access test doesn't publish itself (${JSON.stringify(pa)})`);
  if (planStep(ST, { [A]: { access: live, host_check: built }, ...appr }, now)) fail("without the client's consent, the autopilot publishes the access test");
  const rm = AR.testRemoval({ ...c1, where: "A test page" });
  if (!rm.removes_page || rm.page_url !== c1.page_url || rm.files.length !== 1 || rm.files[0].action !== "remove" || rm.files[0].path !== "rga-access-test/index.html") fail(`the take-down isn't the same removal admin drafts (${JSON.stringify(rm)})`);
  const src = fs.readFileSync(path.join(SITE, "netlify/functions/_website-autorun.js"), "utf8");
  if (!/\["snap", "open", \.\.\.TEST_ACTS\]\.includes\(p\.act\)/.test(src) || !/for \(const id of \[SC\.ACCESS_TEST_STEP, \.\.\.ORDER\]\)/.test(src)) fail("the access test's moves don't chain in one run, or the sweep doesn't carry the test");

  // ── the approval by consent, on the real handler ──
  const reset = (w) => { DB.rec.data = { tasks: { [A]: w, [T]: {} }, site_snapshot: { at: new Date().toISOString(), read: 1, found: 1, pages: [] } }; };
  reset({ access: inst, host_check: built });
  const pre = await adm({ key: T, site_action: "prefill" });
  if (pre.s !== 200 || !pre.j.change) throw new Error(`prefill ${pre.s} ${pre.j.error || ""}`);
  let r = await adm({ key: T, site_action: "save", change: pre.j.change });
  if (r.s !== 200) throw new Error(`save ${r.s} ${r.j.error || ""}`);
  r = await adm({ key: T, site_action: "consent_approve" });
  if (r.s !== 409 || DB.rec.data.tasks[T].approval) fail(`a draft that wasn't sent is approved by consent (${r.s})`);
  r = await adm({ key: T, internal_decision: "approved" });
  if (r.s !== 200) throw new Error(`send ${r.s} ${r.j.error || ""}`);
  r = await adm({ key: T, site_action: "consent_approve" });
  const ap = DB.rec.data.tasks[T].approval || {};
  if (r.s !== 200 || ap.decision !== "approved" || ap.via !== "access_consent" || ap.change_v !== DB.rec.data.tasks[T].site_change.v || ap.consent_words !== SC.ACCESS_TEST_CONSENT_INSTALL || ap.consent_how !== "install" || ap.by !== "owner@acme.test" || !ap.approved_content || ap.content_source !== "approved_when_giving_access")
    fail(`the consent approval doesn't carry the client's words, who and the version (${r.s} ${r.j.error || ""} ${JSON.stringify(ap).slice(0, 240)})`);
  if (SC.changeState(DB.rec.data.tasks[T]) !== "approved") fail("after the consent approval the test isn't approved");
  r = await adm({ key: T, site_action: "consent_approve" });
  if (r.s !== 409) fail("the consent approves the same test twice");
  // no consent on record → refused, nothing written
  reset({ access: live, host_check: built });
  await adm({ key: T, site_action: "save", change: pre.j.change }); await adm({ key: T, internal_decision: "approved" });
  r = await adm({ key: T, site_action: "consent_approve" }).catch((e) => ({ s: `threw: ${e.message}` }));
  if (r.s !== 403 || DB.rec.data.tasks[T].approval) fail(`without the client's consent the test is approved anyway (${r.s})`);
  // another step → refused
  reset({ access: inst, host_check: built });
  r = await adm({ key: "m1.web.priority_pages", site_action: "consent_approve" });
  if (r.s !== 400) fail(`the access consent approves a step that isn't the access test (${r.s})`);

  // ── the step shows how it was approved ──
  const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); return m ? src.slice(m.index, src.indexOf("\n}\n", m.index) + 2) : null; };
  const ctx = vm.createContext({ escapeHtml: (s) => String(s), monthDay: () => "Nov 9", csEv: (w, d) => `${w}|${d}` });
  vm.runInContext(lift(P, "accessTestRow"), ctx);
  const row = vm.runInContext(`accessTestRow({ "m1.access.publish_test": { site_change: { v: "v2", removes_page: true }, published: { v: "v2", at: "x" }, approval: { via: "access_consent", consent_how: "install" } } })`, ctx);
  if (!/We put the test page live and took it down.*The test you approved when you installed\. Hidden from Google\./.test(row)) fail(`the done row doesn't say the test was approved when they installed (${row})`);
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }

if (F.length) { console.error(`❌ the access test runs itself — ${F.length} regression(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ the access test runs itself, approved in the click that gave access: the Install card and the consent tick say so word for word and the grant records it; with it the autopilot drafts, sends, approves by that consent (carrying the words, who and the version), publishes and takes it down, each move once; without it nothing changes; old consent words never count");
