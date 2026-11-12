#!/usr/bin/env node
// check-call-tracking-upgrade.mjs — 2026-10-22, approved call_tracking_upgrade_v1 (research reports/Call tracking for local businesses.md).
// RUNS the pieces on a fake network and pins:
//   · the recommendation comes from the client's three answers (never a fixed "Skip"): most call AND (unanswered/not sure OR ads)
//   · portal-step-choice stores only allow-listed answers
//   · "Set one up for me" creates ONE Google Business Profile number: a CallRail SOURCE tracker (google_my_business), recording on with
//     recording off, texting off — never a website session pool (CallRail API, "Creating a Source Tracker")
//   · admin row 26: Done only when the test call rang AND all five safe-setup checks are ticked; the leak check keeps its month
//   · the monthly sync stores answered / missed / first-time + the rule; the report keeps three call numbers apart
//   exit 0 holds · 1 regressed · 2 harness
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`, FNS_REAL = fs.realpathSync(FNS), req = createRequire(`${FNS}/x.js`);
const read = (r) => fs.readFileSync(`${SITE}/${r}`, "utf8");
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js");
// ── the recommendation, run
const m = P.match(/^function ctRecommend\(a\) \{[\s\S]*?\n\}/m);
if (!m) { console.error("⚠️  ctRecommend moved"); process.exit(2); }
const rec = new Function(`${m[0]}; return ctRecommend;`)();
for (const [a, want] of [[{ calls: "yes", unanswered: "yes", ads: "no" }, "rga_sets_up"], [{ calls: "yes", unanswered: "not_sure", ads: "no" }, "rga_sets_up"],
  [{ calls: "yes", unanswered: "no", ads: "yes" }, "rga_sets_up"], [{ calls: "yes", unanswered: "no", ads: "no" }, "skip"], [{ calls: "no", unanswered: "yes", ads: "yes" }, "skip"], [{ calls: "yes" }, null]])
  if (rec(a) !== want) fail(`the recommendation for ${JSON.stringify(a)} is ${rec(a)} (want ${want})`);
if (!/const pick = ch && \["skip", "rga_sets_up", "already_have"\]\.includes\(ch\) \? ch : \(rec \|\| "skip"\);/.test(P)) fail("the card doesn't preselect the recommended choice");
// ── fake network
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
globalThis.__rgaFetchDeadlineInstalled = true;
let calls = [], db = {};
const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  calls.push({ url, method, body });
  if (url.includes("/auth/v1/user")) return J({ id: "u1", email: "chris@rga.test" });
  if (url.includes("/companies.json")) return J({ id: 7, script_hash: "h" });
  if (url.includes("/trackers.json")) return J({ tracking_number: "+15125550100" });
  if (url.includes("notify-rga")) return J({ ok: true });
  if (url.includes("api.callrail.com") && url.includes("/calls.json")) return J({ calls: [{ answered: true, duration: 95, first_call: true }, { answered: true, duration: 10, first_call: false }, { answered: false, duration: 0, first_call: true }], total_pages: 1 });
  const u = new URL(url); const t = u.pathname.split("/").pop(); const rows = db[t] || (db[t] = []);
  const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v));
  const hit = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
  if (method === "PATCH") { for (const r of hit) Object.assign(r, body); return J(hit); }
  if (method === "POST") { const row = { id: `n${rows.length}`, ...(body || {}) }; rows.push(row); return J([row]); }
  return J(hit);
};
const load = (name) => { for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k]; return req(`./${name}`); };
const CID = "11111111-2222-4333-8444-555555555555";
const world = (task) => { db = { client_portal_access: [{ portal_email: "chris@rga.test", client_id: CID }], profiles: [{ id: "u1", workspace_id: "w1", role: "owner" }],
  clients: [{ id: CID, workspace_id: "w1", business_name: "Acme", primary_market: "Austin, TX" }],
  client_onboarding_records: [{ id: "ob1", client_id: CID, data: { tasks: { "m1.tracking.call_setup": task } } }], client_activity: [] }; };
const T = () => db.client_onboarding_records[0].data.tasks["m1.tracking.call_setup"];
const run = async (name, body) => { const r = await load(name).handler({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, ...body }) }); return { status: r.statusCode, body: JSON.parse(r.body || "{}") }; };
// answers stored, allow-listed
world({ status: "pending" });
let r = await run("portal-step-choice.js", { step_id: "m1.tracking.call_setup", choice: "rga_sets_up", answers: { calls: "yes", unanswered: "sometimes", ads: "no", evil: "<x>" } });
const A = T().client_answers || {};
if (r.status !== 200 || A.calls !== "yes" || A.ads !== "no" || "unanswered" in A || "evil" in A) fail(`the answers aren't stored allow-listed (${r.status} ${JSON.stringify(A)})`);
// the GBP number
const PROV = load("_call-providers.js").PROVIDERS;
calls = [];
await PROV.callrail.provision({ businessName: "Acme", destinationNumber: "5125550142", areaCode: "512", timeZone: "America/Chicago", key: "k", account: "A1" });
const tr = (calls.find((c) => c.url.includes("/trackers.json")) || {}).body || {};
if (tr.type !== "source" || tr.source?.type !== "google_my_business") fail(`"Set one up for me" doesn't create a Google Business Profile source number (type ${tr.type}, source ${JSON.stringify(tr.source)})`);
// 🔒 contract_v2_redline §5D: recording is off, and a greeting saying otherwise would be false
if (tr.call_flow?.recording_enabled !== false || /recorded/i.test(tr.call_flow?.greeting_text || "") || tr.sms_enabled !== false) fail("the number records calls, says it might, or can text (no A2P registration)");
if (tr.call_flow?.destination_number !== "+15125550142") fail(`the number doesn't ring the client (${tr.call_flow?.destination_number})`);
// admin: done only with the test call + all five checks
world({ status: "in_progress", client_choice: "rga_sets_up" });
r = await run("admin-call-test.js", { number: "(512) 555-0100", provider: "CallRail" });
if (r.status !== 200 || T().status === "done") fail(`a test call alone finishes the step (status ${T().status}) — the safe-setup checklist must be done too`);
for (const k of ["greeting", "gbp_swap", "live_google", "sync_off"]) await run("admin-call-test.js", { check: k });
if (T().status === "done") fail("four of five checks finish the step");
r = await run("admin-call-test.js", { check: "site_real" });
if (r.status !== 200 || T().status !== "done" || !r.body.done) fail(`the test call + all five checks don't finish the step (${r.status} ${T().status})`);
r = await run("admin-call-test.js", { check: "leak_scan" });
if (!T().tracking?.checks?.leak_scan?.month) fail("the monthly leak check isn't stamped with its month");
r = await run("admin-call-test.js", { check: "nonsense" });
if (r.status !== 400) fail("an unknown check is accepted");
// the monthly sync's detail
const fm = await PROV.callrail.fetchMonth({ companyId: "C", month: "2026-10-01", end: "2026-10-31", key: "k", account: "A1" });
if (fm.rings !== 3 || fm.calls !== 1 || fm.answered !== 2 || fm.missed !== 1 || fm.firstTime !== 2) fail(`CallRail's month detail is wrong (${JSON.stringify(fm)})`);
const SY = read("netlify/functions/call-tracking-sync.js");
if (!/data: \{ \.\.\.\(existing\.data \|\| \{\}\), calls: \{ \.\.\.detail, month_tz: tz \}, calls_read: readOk \}/.test(SY) || !/rule: `answered and \$\{CONNECTED_SECONDS\} seconds or more`/.test(SY)) fail("the sync doesn't store the call detail + rule on the monthly record");
const RP = read("portal/report/report.js");
if (!/\["Call-button taps", current\.gbp_calls(?:, "gbp_calls")?\]/.test(RP) || !/tile\("Call-button taps on Google"/.test(RP) || !/\["First-time callers", (?:current\.data\.calls|c)\.first_time\]/.test(RP) || !/counted when \$\{/.test(RP)) fail("the report doesn't keep Google's taps, tracked calls (answered/missed/first-time) and its rule apart");
if (/account in your name/.test(P + read("data/playbooks/client-steps.json"))) fail("a card still promises \"an account in your name\" (RGA's agency account — the number is theirs to keep)");
if (F.length) { console.error("🔴 the call tracking upgrade regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ call tracking upgrade: recommendation from 3 answers (6 cases) · answers allow-listed · one GBP source number (recording notice, no texting, rings the client) · Done = test call + 5 safe-setup checks · leak check by month · month detail (answered/missed/first-time) · report keeps 3 call numbers apart · true ownership wording");
