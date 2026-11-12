#!/usr/bin/env node
// check-a-removed-access-is-never-has-access.mjs — RGA'S WEBSITE ACCESS IS READ FOR EVERY KIND IT CAN BE, AND A REMOVAL TELLS RGA
// (approved master mockup #11 website work, W5 + W4, Chris 11-11: "ALL APPROVED. DO ALL RECOMMENDED").
//
// 🔴 WHY (W5): only an uninstall of RGA's GitHub app was noticed. A client who invited RGA Admin as a GitHub collaborator and later removed
// it kept seeing "Rocket Growth Agency has access", and website work went on planning changes nobody could publish. A done step with no
// grant on record said "has access" even after their service ended.
// 🔴 WHY (W4): a removal GitHub reported showed only as cards and the next night's warning; nobody was told.
// Holds when:
//   · the collaborator grant is read through admin-access-confirm "still_there" (internal secret only; the RGA Admin key stays in that
//     one file): two "not there" readings 4+ minutes apart record it removed (removed_by github, collaborator_removed); an unknown reading
//     (a refused key, GitHub down, no key) never counts; the publish watcher asks for every live non-app GitHub grant
//   · a removal the system recorded raises ONE alert to RGA (notify-rga, never a client), retried while undelivered, marked on the removal
//   · the portal's "has access" cards are drawn only for a live grant; a done step with nothing on record and an ended service shows the
//     approved service-ended card
// Runs the shipped functions on a fake GitHub + database; the portal by pins. Exit 0 holds · 1 broken · 2 couldn't tell.
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.INTERNAL_FN_SECRET = "gate-secret-not-real";
process.env.GITHUB_ADMIN_TOKEN = "ghp_gate_not_real"; process.env.URL = "https://site.test";
let AW, CA, P, NR;
try { AW = req("./_access-watch.js"); CA = req("./_client-alerts.js"); P = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); NR = fs.readFileSync(`${SITE}/netlify/functions/notify-rga.js`, "utf8"); }
catch (e) { ind(`harness: ${e.message}`); }
for (const k of ["grantSeen", "collabWatched", "collabReading", "alertDue", "tellRga"]) if (typeof AW[k] !== "function") ind(`_access-watch.js has no ${k}`);

const CID = "11111111-2222-4333-8444-555555555555", STEP = "m1.access.website";
const collab = { role: "Write on GitHub", account: "access@rocketgrowthagency.com", github: "rocketgrowthagency-admin", repo: "acme/site", via: "github_one_click", confirmed_at: "2026-11-01T10:00:00.000Z" };
// ── a fake world: supabase rows, GitHub's answer per repo, the notify-rga queue ──
const W = { rec: null, activity: [], gh: {}, notified: [], deliver: true, patches: 0 };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), m = (init.method || "GET").toUpperCase();
  if (u.host === "api.github.com") {
    const x = /^\/repos\/([\w.-]+\/[\w.-]+)$/.exec(u.pathname), v = x && W.gh[x[1]];
    if (!String((init.headers || {}).Authorization || "").includes("ghp_gate_not_real")) return res(401, {});
    return v === "write" ? res(200, { permissions: { push: true, pull: true } }) : v === "read" ? res(200, { permissions: { push: false, pull: true } }) : v === "down" ? res(502, {}) : v === "refused" ? res(403, {}) : res(404, {});
  }
  if (u.host === "site.test" && u.pathname.endsWith("/notify-rga")) {
    const b = JSON.parse(init.body); if ((init.headers || {})["x-internal-secret"] !== "gate-secret-not-real") return res(401, {});
    W.notified.push(b); return res(200, { delivered: W.deliver });
  }
  if (u.host === "site.test" && u.pathname.endsWith("/admin-access-confirm")) {
    const AC = req("./admin-access-confirm.js");
    const r = await AC.handler({ httpMethod: "POST", headers: { "x-internal-secret": (init.headers || {})["x-internal-secret"] }, body: init.body });
    return res(r.statusCode, r.body);
  }
  if (u.host === "site.test") return res(200, { ok: true, state: "none" });
  if (u.host !== "supa.test") return res(404, {});
  const p = u.pathname.replace(/^\/rest\/v1\//, ""), sel = u.searchParams.get("select");
  if (p === "client_onboarding_records") {
    if (m === "GET") return res(200, W.rec ? [JSON.parse(JSON.stringify(W.rec))] : []);
    if (m === "PATCH") { W.patches++; const b = JSON.parse(init.body); Object.assign(W.rec, b); W.rec.updated_at = new Date(Date.now() + W.patches).toISOString(); return res(200, [JSON.parse(JSON.stringify(W.rec))]); }
  }
  if (p === "client_activity") { if (m === "POST") { const b = JSON.parse(init.body); W.activity.push(...(Array.isArray(b) ? b : [b])); return res(201, (init.headers || {}).Prefer && /representation/.test(init.headers.Prefer) ? [b] : ""); } return res(200, []); }
  if (/^(clients|rga_logins|system_job_checkins|job_checkins|client_step_rows)/.test(p)) return res(200, p.startsWith("client_step_rows") ? (() => { throw 0; })() : []);
  return res(200, []);
};
const seed = (access, extra = {}) => { W.rec = { id: "rec-1", client_id: CID, updated_at: "2026-11-11T10:00:00.000000+00:00", data: { tasks: { [STEP]: { status: "done", client_input: { platform: "custom", files: "github" }, access, ...extra } } } }; W.activity = []; W.notified = []; W.patches = 0; };
const acc = () => W.rec.data.tasks[STEP].access;

try {
  // ── the readings (pure) ──
  const at0 = "2026-11-11T10:00:00.000Z", at1 = "2026-11-11T10:05:00.000Z", at1b = "2026-11-11T10:02:00.000Z";
  const once = AW.grantSeen(collab, "no", at0, "collaborator_removed", "n");
  if (!once || once.access_missing_at !== at0 || once.removed_at) fail("the first \"not there\" isn't only noted");
  if (AW.grantSeen(once, "no", at1b, "collaborator_removed", "n") !== null) fail("a second \"not there\" under 4 minutes later already removes the access");
  const twice = AW.grantSeen(once, "no", at1, "collaborator_removed", "n");
  if (!twice || twice.removed_at !== at1 || twice.removed_by !== "github" || twice.removed_how !== "collaborator_removed") fail("a second \"not there\" 4+ minutes later doesn't record the removal");
  const back = AW.grantSeen(once, "yes", at1, "collaborator_removed", "n");
  if (!back || "access_missing_at" in back) fail("a \"yes\" doesn't clear the first note");
  if (AW.grantSeen(collab, "unknown", at1, "x", "n") !== null || AW.grantSeen(once, "unknown", at1, "x", "n") !== null) fail("an unknown reading changes the record");
  for (const [r, want] of [[{ ok: true, canChange: true }, "yes"], [{ ok: true, canChange: false }, "no"], [{ ok: false, state: "repo_unreadable", status: 404 }, "no"], [{ ok: false, state: "repo_unreadable", status: 502 }, "unknown"], [{ ok: false, state: "key_refused", status: 401 }, "unknown"], [null, "unknown"]])
    if (AW.collabReading(r) !== want) fail(`GitHub's ${JSON.stringify(r)} reads as ${AW.collabReading(r)}, not ${want}`);
  if (!AW.collabWatched(collab) || AW.collabWatched({ ...collab, via: "github_app" }) || AW.collabWatched({ ...collab, removed_at: at1 }) || AW.collabWatched({ ...collab, repo: null })) fail("the collaborator watch reads the wrong grants (only a live non-app GitHub grant with a repo)");

  // ── admin-access-confirm "still_there", end to end ──
  const AC = req("./admin-access-confirm.js");
  const call = (h = { "x-internal-secret": "gate-secret-not-real" }) => AC.handler({ httpMethod: "POST", headers: h, body: JSON.stringify({ action: "still_there", client_id: CID }) });
  seed({ ...collab }); W.gh["acme/site"] = "gone";
  const noKey = await call({}); if (noKey.statusCode !== 401) fail(`"still_there" answers ${noKey.statusCode} without the internal secret (only the watcher may ask)`);
  const r1 = JSON.parse((await call()).body);
  if (r1.state !== "missing_once" || !acc().access_missing_at || acc().removed_at) fail(`the first "not there" from GitHub isn't noted once (${JSON.stringify(r1)})`);
  W.rec.data.tasks[STEP].access.access_missing_at = new Date(Date.now() - 10 * 60e3).toISOString();
  const r2 = JSON.parse((await call()).body);
  if (r2.state !== "removed" || !acc().removed_at || acc().removed_how !== "collaborator_removed" || acc().removed_by !== "github") fail(`a second "not there" 10 minutes later doesn't record the collaborator removed (${JSON.stringify(r2)})`);
  if (!W.activity.some((a) => a.kind === "website_access_removed")) fail("the removal leaves no record on the client's activity");
  seed({ ...collab }); W.gh["acme/site"] = "read";
  await call(); if (!acc().access_missing_at) fail("Write taken away (read-only now) isn't read as not there");
  for (const st of ["down", "refused"]) { seed({ ...collab }); W.gh["acme/site"] = st; await call(); if (acc().access_missing_at || W.patches) fail(`GitHub ${st} changes the record (an unknown reading must not count)`); }
  seed({ ...collab }); W.gh["acme/site"] = "write"; await call(); if (W.patches) fail("a grant that still works is written");
  seed({ ...collab, via: "github_app", installation_id: 1 }); W.gh["acme/site"] = "gone"; const r3 = JSON.parse((await call()).body); if (r3.state !== "not_watched") fail("the collaborator check reads an app grant (the app has its own watch)");

  // ── the alert: once per removal, retried while undelivered, never a client ──
  const removed = { ...collab, removed_at: at1, removed_by: "github", removed_how: "collaborator_removed" };
  if (!AW.alertDue(removed) || AW.alertDue({ ...removed, removed_alerted_at: at1 }) || AW.alertDue({ ...removed, removed_by: "rga@x.test" }) || AW.alertDue(collab)) fail("the alert is due for the wrong removals (only a system-recorded removal not told yet)");
  const msg = AW.alertMessage(removed);
  if (!/acme\/site/.test(msg) || /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(msg) || /—/.test(msg)) fail(`the alert's words don't name the repository plainly (${msg})`);
  if (!AW.ALERT_KIND || AW.ALERT_KIND !== (CA.ALERTS.website_access || {}).kind || !/_failed$/.test(AW.ALERT_KIND)) fail("the alert kind isn't the one in the alert list (or doesn't end in _failed, so Messages wouldn't show it)");
  if (!new RegExp(`${AW.ALERT_KIND}:\\s*"`).test(NR)) fail("notify-rga has no label for the access-removed alert");
  const PW = req("./site-publish-watch.js");
  const run = () => PW.handler({ httpMethod: "POST", headers: { "x-internal-secret": "gate-secret-not-real" }, body: "{}" });
  seed({ ...removed }); W.deliver = false; await run();
  if (W.notified.length !== 1 || acc().removed_alerted_at) fail(`an undelivered alert is marked told (or wasn't sent: ${W.notified.length})`);
  W.deliver = true; await run();
  if (W.notified.length !== 2 || !acc().removed_alerted_at) fail("the alert isn't retried and marked once delivered");
  const k0 = W.notified[1] || {}; if (k0.kind !== AW.ALERT_KIND || k0.client_id !== CID) fail("the alert goes out under the wrong kind or client");
  await run(); if (W.notified.length !== 2) fail("a removal already told is told again");
  seed({ ...collab }); W.gh["acme/site"] = "gone"; W.rec.data.tasks[STEP].access.access_missing_at = new Date(Date.now() - 10 * 60e3).toISOString(); W.notified = [];
  await run();
  if (!acc().removed_at || W.notified.length !== 1 || !acc().removed_alerted_at) fail(`the watcher doesn't read a collaborator grant, record its removal and tell RGA in one run (removed ${!!acc().removed_at}, told ${W.notified.length})`);

  // ── the portal: "has access" only for a live grant ──
  const fn = (name) => { const i = P.indexOf(`function ${name}(`); return i < 0 ? "" : P.slice(i, P.indexOf("\nfunction ", i + 10)); };
  const card = fn("accessCardHtml");
  if (!card) ind("portal.js has no accessCardHtml");
  if (!/if \(acc && acc\.confirmed_at && acc\.via === "github_app" && !acc\.removed_at && !_rcEditing\.has\(step\.id\)\) return ghAppDoneHtml\(/.test(card)) fail("the app's has-access card can be drawn for a removed grant");
  if (!/if \(acc && acc\.confirmed_at && !acc\.removed_at && !_rcEditing\.has\(step\.id\)\) \{/.test(card)) fail("the has-access card can be drawn for a removed grant");
  const doneAt = card.indexOf('if (t.status === "done" && !oldLink && !(ci && ci.via) && !acc && !_rcEditing.has(step.id)) {');
  const doneBody = doneAt < 0 ? "" : card.slice(doneAt, card.indexOf('head: "Rocket Growth Agency has access"', doneAt));
  if (doneAt < 0 || !/if \(portalServiceEnded\(clientId\)\) return /.test(doneBody)) fail("a done step with no grant on record still says \"has access\" after their service ended");
  const removedAt = card.indexOf("if (acc && acc.confirmed_at && (acc.removed_at || portalServiceEnded(clientId))");
  if (removedAt < 0 || removedAt > card.indexOf('head: "Rocket Growth Agency has access"')) fail("the removed / service-ended card no longer comes before any has-access card");
} catch (e) { ind(`threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); }
finally { globalThis.fetch = realFetch; }

if (F.length) { console.error(`❌ a removed access can still read as "has access" — ${F.length} problem(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ a removed access never reads as has access: the collaborator grant is read too (two not-there readings 4+ minutes apart, unknown never counts, internal secret only), a system-recorded removal tells RGA once (retried until delivered, marked on the removal), and the portal draws has-access only for a live grant (a done step with nothing on record shows the service-ended card once service ended)");
