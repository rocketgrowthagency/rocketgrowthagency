#!/usr/bin/env node
// check-the-mid-month-note-never-sends-itself.mjs — THE MID-MONTH NOTE GOES ONLY ON RGA'S PRESS (approved card_notice_designs_v1 section 4, Chris 11-11).
//   1 static: in _mid-note.js the one send (d.send) is inside approveSend, which needs confirm === true and a signed-in staff email; the morning
//     run calls only morning() (drafts, never sends); admin-mid-note.js is the only caller of approveSend and is behind requireWorkspaceForClient;
//     no schedule runs admin-mid-note; the admin's Approve opens the outward "This reaches the client" dialog first
//   2 runtime, on fakes: the morning run on the 15th (the next business day on a weekend) drafts and sends nothing, before it drafts nothing;
//     Approve without the dialog or without a staff sign-in sends nothing; with both, the approval is written BEFORE the send and the stored
//     note has approved_at <= sent_at; a failed send keeps the approval and says the client got nothing; a held note can't be sent
//   3 it is always produced: no reminder switch and no setting turns it off (a service notice; Hold covers a client who wants less email)
//   4 nightly, when the database can be read: every sent note has approved_by (a staff email) and approved_at <= sent_at
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const F = [], fail = (m) => F.push(m);
const LIVE = { url: process.env.SUPABASE_URL || "", key: process.env.SUPABASE_SERVICE_ROLE_KEY || "" }, REAL_FETCH = globalThis.fetch;
const rd = (r) => fs.readFileSync(path.join(SITE, r), "utf8");
let MN, MNS, AMN, MR, TOML, ADMIN, N, FNS;
try {
  MN = req("./_mid-note.js"); MNS = rd("netlify/functions/_mid-note.js"); AMN = rd("netlify/functions/admin-mid-note.js"); MR = rd("netlify/functions/_morning-run.js");
  TOML = rd("netlify.toml"); ADMIN = rd("admin/admin.js"); N = req(path.join(SITE, "shared/notices.js"));
  FNS = fs.readdirSync(path.join(SITE, "netlify/functions")).filter((f) => f.endsWith(".js"));
  for (const k of ["morning", "approveSend", "build", "hold", "draftDay"]) if (typeof MN[k] !== "function") throw new Error(`_mid-note ${k} isn't exported`);
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

// ── 1 · static ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const fnBody = (src, name) => { const i = src.indexOf(`async function ${name}(`); if (i < 0) return ""; const j = src.indexOf("\nasync function ", i + 10), k = src.indexOf("\nfunction ", i + 10); return src.slice(i, Math.min(...[j, k, src.length].filter((x) => x > 0))); };
const sends = (MNS.match(/\bd\.send\(|deps\.send\(|sendAsRga\(/g) || []).length;
if ((MNS.match(/\bd\.send\(/g) || []).length !== 1) fail(`_mid-note.js has ${(MNS.match(/\bd\.send\(/g) || []).length} d.send( calls, want exactly 1 (in approveSend)`);
if (!/d\.send\(/.test(fnBody(MNS, "approveSend"))) fail("the one send isn't inside approveSend");
for (const f of ["morning", "build", "edit", "hold", "undo"]) if (/\.send\(|sendAsRga/.test(fnBody(MNS, f))) fail(`${f}() can send`);
if (!/if \(confirm !== true\) return fail\(409/.test(fnBody(MNS, "approveSend"))) fail("approveSend no longer refuses without the outward dialog");
if (!/if \(!by \|\| !\/@\/\.test\(String\(by\)\)\) return fail\(403/.test(fnBody(MNS, "approveSend"))) fail("approveSend no longer needs a signed-in staff member");
void sends;
if (!/midNote: \(clientId, month\) => \{ const MN = require\("\.\/_mid-note"\); return MN\.morning\(/.test(MR) || /approveSend/.test(MR)) fail("the morning run does more than draft the note");
const callers = FNS.filter((f) => f !== "_mid-note.js" && /approveSend/.test(rd(`netlify/functions/${f}`)));
if (callers.join() !== "admin-mid-note.js") fail(`approveSend is reached from ${callers.join(", ") || "nothing"}, want only admin-mid-note.js`);
if (!/const g = await guard\(event, clientId\); if \(g\.error\) return g\.error;/.test(AMN) || !/handle\(event, deps = null, guard = requireWorkspaceForClient\)/.test(AMN)) fail("admin-mid-note isn't behind requireWorkspaceForClient");
if (/admin-mid-note/.test(TOML)) fail("admin-mid-note is on a schedule");
if (!/tone: "outward", title: `Send the mid-month note to/.test(ADMIN) || !/body\.confirm = true;/.test(ADMIN)) fail("the admin's Approve no longer opens the outward dialog before it sends");

// ── 2 · runtime ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const CID = "44444444-4444-4444-8444-444444444444", MONTH = "2026-11-01";
function fakeDeps(nowIso) {
  const st = { rec: { id: "m1", data: {} }, writes: [], sends: [], order: [] };
  const d = {
    now: () => Date.parse(nowIso), tzOf: () => "America/Los_Angeles",
    readClient: async () => ({ id: CID, business_name: "Beta Roofing", primary_contact_name: "Sam Ortiz", primary_contact_email: "sam@x.test" }),
    readMonth: async () => ({ id: "m1", data: JSON.parse(JSON.stringify(st.rec.data)) }),
    writeMonth: async (rec, data) => { st.rec.data = JSON.parse(JSON.stringify(data)); st.writes.push(data.mid_note && data.mid_note.status); st.order.push(`write:${data.mid_note && data.mid_note.status}`); return true; },
    lastReport: async () => ({ at: "2026-11-05T17:40:00Z", reportMonth: "2026-10-01" }),
    readSources: async () => ({ queues: [[{ week: 1, post_name: "p1", status: "live", posted_at: "2026-11-08T17:00:00Z", headline: "Fall gutter cleaning" }]], replies: [], changes: [], photos: [], next: [] }),
    send: async (m) => { st.sends.push(m); st.order.push("send"); if (st.failSend) throw new Error("Gmail refused the send (502)."); return { id: "gm1" }; },
  };
  return { d, st };
}
try {
  if (MN.draftDay("2026-11-01") !== "2026-11-16" || MN.draftDay("2026-08-01") !== "2026-08-17" || MN.draftDay("2026-12-01") !== "2026-12-15") fail("the draft day isn't the 15th, or the Monday after a weekend 15th");
  let { d, st } = fakeDeps("2026-11-14T17:00:00Z");
  let r = await MN.morning({ clientId: CID, month: MONTH, deps: d });
  if (r.state !== "not_yet" || st.writes.length || st.sends.length) fail("the morning run did something before the note's day");
  ({ d, st } = fakeDeps("2026-11-16T15:00:00Z"));
  r = await MN.morning({ clientId: CID, month: MONTH, deps: d });
  if (r.state !== "draft" || st.sends.length) fail(`the morning run on the day sent, or didn't draft (${r.state}, ${st.sends.length} sends)`);
  r = await MN.morning({ clientId: CID, month: MONTH, deps: d });
  if (r.state !== "already" || st.sends.length) fail("a second morning run redrafted or sent");
  for (const [what, a] of [["no dialog", { by: "chris@rga.test", confirm: undefined }], ["no staff sign-in", { by: null, confirm: true }], ["a request, not a person", { by: "system", confirm: true }]]) {
    const x = await MN.approveSend({ clientId: CID, month: MONTH, deps: d, ...a });
    if (x.status < 400 || st.sends.length) fail(`Approve with ${what} sent the note`);
  }
  const ok = await MN.approveSend({ clientId: CID, month: MONTH, deps: d, by: "chris@rga.test", confirm: true });
  const n = st.rec.data.mid_note;
  if (ok.status !== 200 || st.sends.length !== 1 || n.status !== "sent") fail(`RGA's Approve didn't send it (${ok.status})`);
  if (st.order.indexOf("write:sending") < 0 || st.order.indexOf("write:sending") > st.order.indexOf("send")) fail("the approval isn't written before the send");
  if (!(Date.parse(n.approved_at) <= Date.parse(n.sent_at)) || n.approved_by !== "chris@rga.test") fail("the sent note's approval isn't before its send, or isn't RGA's");
  const again = await MN.approveSend({ clientId: CID, month: MONTH, deps: d, by: "chris@rga.test", confirm: true });
  if (st.sends.length !== 1 || !again.body.already) fail("Approve twice sent it twice");
  // a failed send keeps the approval, says the client got nothing
  ({ d, st } = fakeDeps("2026-11-16T15:00:00Z")); await MN.morning({ clientId: CID, month: MONTH, deps: d }); st.failSend = true;
  const bad = await MN.approveSend({ clientId: CID, month: MONTH, deps: d, by: "chris@rga.test", confirm: true });
  if (bad.status !== 502 || st.rec.data.mid_note.status !== "failed" || !st.rec.data.mid_note.approved_at || !/client got nothing/.test(bad.body.error)) fail("a failed send isn't kept as failed with its approval, or doesn't say the client got nothing");
  // held: can't be sent until Undo
  ({ d, st } = fakeDeps("2026-11-16T15:00:00Z")); await MN.morning({ clientId: CID, month: MONTH, deps: d });
  const h = await MN.hold({ clientId: CID, month: MONTH, deps: d, by: "chris@rga.test", reason: "Sam asked for no email this week" });
  const hs = await MN.approveSend({ clientId: CID, month: MONTH, deps: d, by: "chris@rga.test", confirm: true });
  if (h.status !== 200 || hs.status < 400 || st.sends.length) fail("a held note was sent");
  const h0 = await MN.hold({ clientId: CID, month: MONTH, deps: d, by: "x@y", reason: "" });
  if (h0.status < 400) fail("Hold took no reason");
} catch (e) { fail(`the note threw: ${e.message}`); }

// ── 3 · always produced ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
if (N.SWITCHABLE.has("mid_note") || N.REMINDERS.some((r) => /mid|what we did/i.test(r.label + r.kind))) fail("the mid-month note can be switched off in the reminders");
if (!/kind: "service"/.test(fnBody(MNS, "defaultDeps") || MNS.slice(MNS.indexOf("function defaultDeps")))) fail("the note isn't sent as a service notice");

// ── 4 · nightly (read only) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
if (LIVE.url && LIVE.key) {
  try {
    const r = await REAL_FETCH(`${LIVE.url}/rest/v1/client_monthly_records?data->mid_note->>status=eq.sent&select=client_id,reporting_month,data->mid_note&limit=2000`, { headers: { apikey: LIVE.key, Authorization: `Bearer ${LIVE.key}` } });
    if (!r.ok) throw new Error(`${r.status}`);
    const rows = await r.json();
    for (const x of rows) { const n = x.mid_note || {}; if (!n.approved_by || !/@/.test(n.approved_by) || !(Date.parse(n.approved_at) <= Date.parse(n.sent_at))) fail(`live: ${x.client_id} ${x.reporting_month}: a sent note without a staff approval before its send`); }
    console.log(`  · live: ${rows.length} sent mid-month notes, each approved before it went`);
  } catch (e) { console.error(`⚠️  live read failed: ${e.message}`); process.exit(2); }
}

if (F.length) { console.error(`❌ the mid-month note never sends itself — ${F.length} regression(s):`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✅ the mid-month note never sends itself: the morning run only drafts it (on the 15th, the next business day on a weekend), the one send needs RGA's signed-in press and the outward dialog, the approval is written before the send, held means held, and no switch turns it off");
