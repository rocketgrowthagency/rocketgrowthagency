#!/usr/bin/env node
/**
 * check-website-access-gaps.mjs — THE FIVE ACCESS FIXES (approved website_access_gaps_v1, the owner 11-8: "all approved. build then we test").
 * 1 · the client removes RGA's app: GitHub's "not installed" (asked with the app's own key) is noted once and recorded as removed on a second
 *     read 4+ minutes later (an unknown answer never counts); the record is re-read before the write; the client's step shows Install again.
 * 2 · website work waits until access is proven (SC.accessProven: live access, a host that builds or a client who merges, the access test
 *     live): the autopilot neither sends nor publishes, admin's actions refuse, the cards say "waits", the access test itself never waits.
 * 3 · admin names the account that really acts (RGA's app / RGA Admin), from the pull request's own login, else step 3's access.
 * 4 · end of service: the app removes itself only when its install reaches nothing but this client's repositories; a shared install is
 *     the client's move and nothing is removed; GitHub must then say it no longer reaches it.
 * Against fakes (GitHub + database), the pure functions, and pins. Exit 0 = holds · 1 = doesn't · 2 = couldn't tell.
 */
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const bad = [], fail = (m) => bad.push(m);
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs1", format: "pem" });
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.INTERNAL_FN_SECRET = "gate-secret-not-real";
let ID, SC, W, AR, A, P, AD, BP;
try {
  ID = req(`${SITE}/netlify/functions/_github-identity.js`); SC = req(`${SITE}/shared/site-change.js`);
  W = req(`${SITE}/netlify/functions/site-publish-watch.js`); AR = req(`${SITE}/netlify/functions/_website-autorun.js`);
  A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); P = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8");
  AD = fs.readFileSync(`${SITE}/netlify/functions/admin-deliverables.js`, "utf8"); BP = fs.readFileSync(`${SITE}/netlify/functions/portal-blog-posts.js`, "utf8");
  for (const [n, f] of [["accessProven", SC.accessProven], ["appReaches", ID.appReaches], ["removeAppFrom", ID.removeAppFrom], ["appSeen", W.appSeen], ["planStep", AR._test && AR._test.planStep || AR.planStep]]) if (typeof f !== "function") throw new Error(`${n} is missing`);
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load: ${e.message}`); process.exit(2); }
const planStep = (AR._test && AR._test.planStep) || AR.planStep;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const jwtOk = (auth) => { const j = String(auth || "").replace(/^Bearer /, "").split("."); try { return j.length === 3 && crypto.verify("RSA-SHA256", Buffer.from(`${j[0]}.${j[1]}`), privateKey, Buffer.from(j[2], "base64url")) && JSON.parse(Buffer.from(j[1], "base64url")).iss === "5672462"; } catch { return false; } };

// ── a fake GitHub: G.installed[repo] = installation id | "suspended" | "error"; G.repos[id] = [repos]; deletes recorded ─────
const G = { installed: {}, repos: {}, deleted: [], selection: {} };
const gh = async (url, init = {}) => {
  const u = new URL(url), auth = (init.headers || {}).Authorization || "", m = (init.method || "GET").toUpperCase(), p = u.pathname;
  if (u.host === "supa.test" && p.endsWith("/raw-store/secrets/github-app-private-key.pem")) return (init.headers || {}).apikey === "svc" ? res(200, PEM) : res(400, "no");
  if (u.host !== "api.github.com") return null;
  let x;
  if ((x = /^\/repos\/([\w.-]+\/[\w.-]+)\/installation$/.exec(p))) {
    if (!jwtOk(auth)) return res(401, {});
    const v = G.installed[x[1]];
    return v === "error" ? res(502, {}) : v === "suspended" ? res(200, { id: 9, suspended_at: "2026-11-09T00:00:00Z" }) : v ? res(200, { id: v }) : res(404, {});
  }
  if ((x = /^\/app\/installations\/(\d+)$/.exec(p))) {
    if (!jwtOk(auth)) return res(401, {});
    if (m === "DELETE") { G.deleted.push(Number(x[1])); for (const r of Object.keys(G.installed)) if (G.installed[r] === Number(x[1]) && !G.keepAfterDelete) delete G.installed[r]; return res(204, ""); }
    return G.repos[x[1]] ? res(200, { id: Number(x[1]), account: { login: "acme" }, repository_selection: G.selection[x[1]] || "selected" }) : res(404, {});
  }
  if ((x = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(p)) && m === "POST") return jwtOk(auth) ? res(201, { token: `ghs_ins${x[1]}` }) : res(401, {});
  if (p === "/installation/repositories") { const t = /^Bearer ghs_ins(\d+)$/.exec(auth); return t ? res(200, { repositories: (G.repos[t[1]] || []).map((full_name) => ({ full_name })) }) : res(401, {}); }
  return res(404, {});
};

try {
  // ── fix 1 · does the app still reach it ──
  G.installed = { "acme/site": 42, "acme/sus": "suspended", "acme/err": "error" };
  for (const [repo, want] of [["acme/site", "yes"], ["acme/gone", "no"], ["acme/sus", "no"], ["acme/err", "unknown"], ["not a repo", "unknown"]]) {
    const got = await ID.appReaches(repo, gh);
    if (got !== want) fail(`appReaches("${repo}") says ${got}, not ${want}`);
  }
  const a0 = { repo: "acme/site", via: "github_app", confirmed_at: "2026-11-08T11:00:00Z" }, t0 = "2026-11-09T09:30:00.000Z", t1 = "2026-11-09T09:35:00.000Z", t1b = "2026-11-09T09:32:00.000Z";
  const once = W.appSeen(a0, "no", t0);
  if (!once || once.app_missing_at !== t0 || once.removed_at) fail(`the first "not installed" isn't only noted (${JSON.stringify(once)})`);
  if (W.appSeen(once, "no", t1b) !== null) fail("a second \"not installed\" under 4 minutes later already removes the access");
  const twice = W.appSeen(once, "no", t1);
  if (!twice || twice.removed_at !== t1 || twice.removed_how !== "app_uninstalled" || twice.removed_by !== "github") fail(`a second "not installed" 4+ minutes later doesn't record the access removed (${JSON.stringify(twice)})`);
  const back = W.appSeen(once, "yes", t1);
  if (!back || "app_missing_at" in back || back.removed_at) fail("the app answering again doesn't clear the first note");
  if (W.appSeen(a0, "yes", t1) !== null || W.appSeen(a0, "unknown", t1) !== null || W.appSeen(once, "unknown", t1) !== null) fail("a reading that changes nothing (or an unknown one) still writes");
  if (W.appWatched({ ...a0, removed_at: "x" }) || W.appWatched({ ...a0, via: "github_one_click" }) || !W.appWatched(a0)) fail("the watcher checks the wrong accesses (only live access through RGA's app)");

  // the watcher end to end: a fake database, two runs, the second 5 minutes after the first note
  const CID = "11111111-2222-4333-8444-555555555555";
  const db = { data: { tasks: { "m1.access.website": { status: "done", client_input: { platform: "custom", files: "github" }, access: { ...a0 }, host_check: { state: "built", host: "Netlify", at: "2026-11-08T11:10:00Z" } } } }, patches: 0, activity: [] };   // the host check is done, so only this check writes
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const g = await gh(url, init); if (g) return g;
    const u = String(url), m = (init.method || "GET").toUpperCase();
    if (u.includes("/client_onboarding_records?select=client_id,data")) { const snap = [{ client_id: CID, data: JSON.parse(JSON.stringify(db.data)) }]; if (db.meanwhile) { db.meanwhile(); db.meanwhile = null; } return res(200, snap); }
    if (u.includes(`/client_onboarding_records?client_id=eq.${CID}&select=id,data`)) return res(200, [{ id: "ob1", data: JSON.parse(JSON.stringify(db.data)) }]);
    if (u.includes("/client_onboarding_records?id=eq.ob1") && m === "PATCH") { db.patches++; db.data = JSON.parse(init.body).data; return res(200, [{ data: JSON.parse(JSON.stringify(db.data)) }]); }
    if (u.includes("/client_onboarding_records?id=eq.ob1&select=data")) return res(200, [{ data: JSON.parse(JSON.stringify(db.data)) }]);
    if (u.endsWith("/client_activity") && m === "POST") { db.activity.push(JSON.parse(init.body)); return res(201, [JSON.parse(init.body)]); }
    if (u.endsWith("/.netlify/functions/portal-github-app")) return res(200, { ok: false, state: "waiting" });
    return res(200, []);
  };
  const run = () => W.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ next_run: new Date().toISOString() }) });
  try {
    G.installed = { "acme/site": "error" }; await run();
    if (db.patches) fail("GitHub not answering is read as the app removed");
    G.installed = {}; await run();
    const n1 = db.data.tasks["m1.access.website"].access;
    if (!n1.app_missing_at || n1.removed_at) fail(`the watcher doesn't note the first "not installed" (${JSON.stringify(n1)})`);
    db.data.tasks["m1.access.website"].access.app_missing_at = new Date(Date.now() - 5 * 60e3).toISOString();
    db.meanwhile = () => { db.data.tasks["m1.kickoff.call"] = { status: "done", saved: "meanwhile" }; db.data.tasks["m1.access.website"].merge_by = { by: "client", at: "meanwhile" }; };   // saved after the watcher's first read
    await run();
    const n2 = db.data.tasks["m1.access.website"].access;
    if (!n2.removed_at || n2.removed_how !== "app_uninstalled") fail(`the watcher doesn't record the app removed on the second read (${JSON.stringify(n2)})`);
    if (!(db.data.tasks["m1.kickoff.call"] || {}).saved || ((db.data.tasks["m1.access.website"] || {}).merge_by || {}).at !== "meanwhile") fail("the removal write lost work saved meanwhile (the record isn't read again before the write)");
    if (!db.activity.some((r) => r.kind === "website_access_removed" && r.payload && r.payload.answer && r.payload.answer.how === "app_uninstalled")) fail("the app's removal isn't recorded in client_activity");
    const p3 = db.patches; await run();
    if (db.patches !== p3) fail("a removed access is checked and written again every run");
    if (!W.appWanted(db.data.tasks["m1.access.website"])) fail("after the app is removed, the watcher doesn't look for a new install");
  } finally { globalThis.fetch = realFetch; }

  // ── fix 2 · website work waits until access is proven ──
  const live = { confirmed_at: "x", repo: "acme/site", via: "github_app" };
  const tested = { site_change: { v: "v2", removes_page: true }, published: { v: "v2", at: "y" } };
  const T = (w, x) => ({ "m1.access.website": w, ...(x ? { "m1.access.publish_test": x } : {}) });
  for (const [why, tasks, want] of [
    ["no access", T({}), false],
    ["access removed", T({ access: { ...live, removed_at: "z", removed_how: "app_uninstalled" } }, tested), false],
    ["host refuses and RGA merges", T({ access: live, host_check: { state: "refused", host: "Vercel" } }, tested), false],
    ["host refuses but the client merges", T({ access: live, host_check: { state: "refused" }, merge_by: { by: "client" } }, tested), true],
    ["access test not live", T({ access: live, host_check: { state: "built" } }, { site_change: { v: "v1" } }), false],
    ["access test published for an older version", T({ access: live }, { site_change: { v: "v3" }, published: { v: "v2", at: "y" } }), false],
    ["access test live in its log", T({ access: live }, { site_change: { v: "v3" }, site_change_log: [{ published: { at: "y" } }] }), true],
    ["all proven", T({ access: live, host_check: { state: "built" } }, tested), true],
  ]) { const r = SC.accessProven(tasks); if (r.ok !== want || (!r.ok && !r.why)) fail(`accessProven: ${why} → ${r.ok} (want ${want})${!r.ok && !r.why ? ", no reason given" : ""}`); }
  const noRemove = SC.accessProven(T({ access: { ...live, removed_at: "z", removed_how: "app_uninstalled" } }, tested));
  if (!/RGA's app was removed/.test(noRemove.why)) fail(`the reason for a removed app doesn't say so (${noRemove.why})`);

  const now = Date.parse("2026-11-09T12:00:00Z"), step = { id: "m1.web.location_pages", dependsOn: [] }, testStep = { id: "m1.access.publish_test", dependsOn: [] };
  const appr = { site_change: { v: "c1", new_page: true }, approval: { decision: "approved", change_v: "c1", at: "a" }, status: "in_progress" };
  const due = { site_change: { v: "c2", drafted_by: "RGA (automatic)", drafted_at: "2026-11-01T00:00:00Z" }, ran_at: "2026-11-01T00:00:00Z", auto_send: { v: "c2", due_at: "2026-11-08T00:00:00Z", rev: 99 }, status: "in_progress" };
  const proven = T({ access: live, host_check: { state: "built" } }, tested), unproven = T({ access: live, host_check: { state: "built" } });
  const pa = planStep(step, { ...proven, [step.id]: appr }, now), pu = planStep(step, { ...unproven, [step.id]: appr }, now);
  if (!pa || !["snap", "open"].includes(pa.act)) fail(`with access proven, an approved page doesn't go up (${JSON.stringify(pa)})`);
  if (pu) fail(`with access not proven, an approved page still goes up (${JSON.stringify(pu)})`);
  const sa = planStep(step, { ...proven, [step.id]: due }, now), su = planStep(step, { ...unproven, [step.id]: due }, now);
  if (!sa || sa.act !== "send") fail(`with access proven, a due draft isn't sent (${JSON.stringify(sa)})`);
  if (su) fail(`with access not proven, a due draft is still sent to the client (${JSON.stringify(su)})`);
  const tt = planStep(testStep, { ...T({ access: live }), [testStep.id]: { ...appr, site_change: { v: "c1", new_page: true } } }, now);
  if (!tt || !["snap", "open"].includes(tt.act)) fail(`the access test itself waits for access to be proven (${JSON.stringify(tt)})`);
  const mvW = SC.autoMove(step.id, due, { gh: true, open: [], access: { ok: false, why: "x" }, now });
  const mvS = SC.autoMove(step.id, due, { gh: true, open: [], access: { ok: true }, now });
  if (mvW !== "waiting" || mvS !== "scheduled") fail(`the card's move doesn't wait for access (${mvW} · ${mvS})`);
  if (!/if \(\(act === "open_pr" \|\| act === "merge_pr"\) && key !== SC\.ACCESS_TEST_STEP\) \{ const pv = SC\.accessProven\(tasks\); if \(!pv\.ok\) return json\(409/.test(AD)) fail("admin's Open pull request / Merge don't refuse before access is proven");
  if (!/if \(key !== SC\.ACCESS_TEST_STEP\) \{ const pv = SC\.accessProven\(tasks\); if \(!pv\.ok\) return json\(409, \{ error: `Website work waits until RGA's access is proven: \$\{pv\.why\}\. It wasn't sent\.` \}\); \}/.test(AD)) fail("sending a website change to the client doesn't refuse before access is proven");
  if (!/access: SC\.accessProven \? SC\.accessProven\(tasks\) : null/.test(A) || !/label: `Runs itself · waits for \$\{ano \? `step \$\{escapeHtml\(ano\)\}` : "website access"\}`/.test(A)) fail("admin's website step card doesn't wait for access by step number");
  if (!/const waits = !accessOk && \["pages_first", "ready", "no_material"\]\.includes\(card\.state\);/.test(BP) || !/rows: \[ACCESS_ROW, \.\.\.\(card\.rows \|\| \[\]\)\]/.test(BP) || /pv\.why|accessProven\(tk\)\.why/.test(BP)) fail("the client's website plan doesn't say it waits for access (or it hands the client RGA's reason)");
  const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); return m ? src.slice(m.index, src.indexOf("\n}\n", m.index) + 2) : null; };
  const ctx = vm.createContext({});
  vm.runInContext(lift(P, "mcBlogInfo"), ctx);
  const mi = vm.runInContext(`mcBlogInfo({ card: { state: "pages_first", access_ok: false, rows: [{ label: "Give RGA access to your website", value: "Needed" }, { label: "Posts", value: "Later" }] } })`, ctx);
  if (!mi || mi.text !== "Starts once RGA can publish to your website" || mi.state !== "open") fail(`the managed portal's website line doesn't say it starts once RGA can publish (${JSON.stringify(mi)})`);

  // ── fix 3 · admin names the account that really acts ──
  const ac = vm.createContext({ state: { onboardingData: { tasks: { "m1.access.website": { access: { via: "github_app" } } } } } });
  vm.runInContext(lift(A, "wcActor"), ac);
  const say = (pr, via) => { ac.state.onboardingData.tasks["m1.access.website"].access.via = via; return vm.runInContext(`wcActor(${JSON.stringify(pr)})`, ac); };
  for (const [pr, via, want] of [[{ opened_as: "rocket-growth-agency[bot]" }, "github_one_click", "RGA's app"], [{ opened_as: "rocketgrowthagency-admin" }, "github_app", "RGA Admin"], [null, "github_app", "RGA's app"], [null, "github_one_click", "RGA Admin"]])
    if (say(pr, via) !== want) fail(`wcActor(${JSON.stringify(pr)}, ${via}) says ${say(pr, via)}, not ${want}`);
  if ((A.match(/RGA Admin, the approved file|#\$\{pr\.number\} by RGA Admin|on their GitHub as RGA Admin|as RGA Admin\? Only the commit/g) || []).length) fail("admin still names RGA Admin where RGA's app acts");
  if (!/opened_as: me\.login \|\| null/.test(AD)) fail("the pull request record doesn't keep the login that opened it");

  // ── fix 4 · end of service: the app removes itself, never another business's repository ──
  G.installed = { "acme/site": 50 }; G.repos = { 50: ["acme/site"] }; G.deleted = []; G.keepAfterDelete = false;
  const r1 = await ID.removeAppFrom("acme/site", [], gh);
  if (!r1.ok || r1.how !== "uninstalled" || G.deleted.join() !== "50") fail(`the app doesn't remove itself from a client's own install (${JSON.stringify(r1)} · deleted ${G.deleted})`);
  G.installed = { "acme/site": 51 }; G.repos = { 51: ["acme/site", "other-biz/site"] }; G.deleted = [];
  const r2 = await ID.removeAppFrom("acme/site", [], gh);
  if (r2.ok || r2.state !== "shared" || G.deleted.length || (r2.others || []).join() !== "other-biz/site") fail(`a developer's install covering another business is removed (${JSON.stringify(r2)} · deleted ${G.deleted})`);
  G.repos = { 51: ["acme/site", "acme/blog"] }; G.deleted = [];
  const r3 = await ID.removeAppFrom("acme/site", ["acme/blog"], gh);
  if (!r3.ok || G.deleted.join() !== "51") fail(`an install on only this client's own repositories isn't removed (${JSON.stringify(r3)})`);
  G.installed = {}; G.deleted = [];
  const r4 = await ID.removeAppFrom("acme/site", [], gh);
  if (!r4.ok || r4.how !== "already_gone" || G.deleted.length) fail(`an app already gone isn't "already gone" (${JSON.stringify(r4)})`);
  G.installed = { "acme/site": 52 }; G.repos = { 52: ["acme/site"] }; G.deleted = []; G.keepAfterDelete = true;
  const r5 = await ID.removeAppFrom("acme/site", [], gh);
  if (r5.ok || r5.state !== "still_there") fail(`a removal GitHub doesn't confirm is called done (${JSON.stringify(r5)})`);
} catch (e) { console.error(`⚠️  INDETERMINATE — threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }

if (bad.length) { console.error(`❌ website access fixes — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ website access stays automatic: a removed app is noticed (two reads, never an unknown answer) and recorded without losing work; website work is sent and published only once access is proven (the access test never waits), admin and the client's plan say it waits; admin names the account that acts; at end of service the app removes itself only from this client's own repositories, confirmed by GitHub");
