#!/usr/bin/env node
// check-every-client-message-is-in-the-list.mjs — EVERY EMAIL, TEXT, INVITE AND PORTAL NOTICE A CLIENT GETS IS IN THEIR NOTICE LIST
// (approved card_notice_designs_v1 section 2, Chris 11-11). Runs the SHIPPED code on fakes (no network, no email, no text, nothing written):
//   1 every sender in netlify/functions that reaches a client records a client_notices row: each sendAsRga call outside the RGA-only senders
//     passes notice: {...}; each file that calls Gmail / Quo / Google Calendar for a client calls _notices.record; the shared sendGmail callers
//     that reach a client pass a notice. A NEW sender with none fails here (self-proved below against a sender that skips it).
//   2 sendAsRga on a fake Gmail: sent → one row, same code, Gmail's id, the copy as sent; refused → one "failed" row and it still throws;
//     suppressed → "suppressed". A notice write that fails never fails the send.
//   3 the client's list: sent ones only (a failed / suppressed send never shows), newest first, every link opens in the portal; the portal
//     reads it as "couldn't load" when the table is missing, never "Nothing yet".
//   4 nightly, when the database can be read: every send recorded in the last 7 days (the step emails, nudges, replies, stage emails) has its
//     client_notices row within 10 minutes. Before the SQL runs the table is missing: said, not failed.
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = path.join(SITE, "netlify/functions");
const F = [], fail = (m) => F.push(m);
// the real database keys (nightly), read BEFORE the fakes below replace them; no keys = the file checks only
const LIVE = { url: process.env.SUPABASE_URL || "", key: process.env.SUPABASE_SERVICE_ROLE_KEY || "" }, REAL_FETCH = globalThis.fetch;
const read = (r) => fs.readFileSync(path.join(SITE, r), "utf8");
const req = createRequire(path.join(FN, "x.js"));

// ── 1 · the static sweep ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** RGA-only senders: they email RGA's own inbox, never a client. Each needs a reason. */
const RGA_ONLY = {
  "job-watcher.js": "emails RGA_NOTIFICATION_EMAIL (hello@) about a stuck job",
  "rga-todo-morning.js": "the morning To do email to RGA staff",
  "rga-notify-email-background.js": "a client's message forwarded to hello@",
  "_gmail.js": "the one sender itself (records for its callers)",
  "_alert-text.js": "texts RGA's own business line only (RGA_BUSINESS_NUMBER, no setting points it elsewhere): it can never reach a client",
  "admin-mentions.js": "RGA's pitch to a publisher for a 'Best of' list: a third party, never a client",
};
/** Calendar callers that never reach a client: each needs a reason. */
const CAL_NOT_CLIENT = {
  "walkthrough-book.js": "an audit walkthrough is a PROSPECT's call (no client record, nothing to list)",
  "schedule-call-action.js": "moves / cancels a WALKTHROUGH (a prospect's call)",
  "call-reminders.js": "reads an RSVP only (GET); its emails and texts are checked as senders",
  "_kickoff-slots.js": "reads free/busy only",
  "kickoff-rsvp-check.js": "reads an RSVP only",
  "walkthrough-rsvp.js": "reads a prospect's RSVP only",
};
/** The balanced argument text of every call to `name(` in src. */
function callsOf(src, name) {
  const out = []; let i = 0;
  while ((i = src.indexOf(`${name}(`, i)) !== -1) {
    const pre = src.slice(Math.max(0, i - 9), i);
    if (/function\s*$/.test(pre) || /async\s*$/.test(pre) && /function/.test(src.slice(Math.max(0, i - 20), i))) { i += name.length; continue; }
    let d = 0, j = i + name.length;
    for (; j < src.length; j++) { const c = src[j]; if (c === "(") d++; else if (c === ")") { d--; if (!d) break; } }
    out.push({ at: src.slice(0, i).split("\n").length, args: src.slice(i + name.length, j + 1) });
    i = j;
  }
  return out;
}
/** The sweep, over a { file: source } map. → list of problems (strings). Exported shape for the self-proof below. */
function sweep(files) {
  const bad = [];
  for (const [f, src] of Object.entries(files)) {
    if (RGA_ONLY[f]) continue;
    for (const c of callsOf(src, "sendAsRga")) {
      if (/^\(\s*\{\s*supa\s*,\s*\.\.\.m\s*\}\s*\)$/.test(c.args.replace(/\s+/g, " ").trim())) continue;   // a pass-through wrapper (_payment-welcome send: (m) => sendAsRga({ supa, ...m })): its caller is checked
      if (/^\(\s*\{/.test(c.args) && !/\bnotice\s*:/.test(c.args)) bad.push(`${f}:${c.at} sendAsRga reaches a client with no notice: {…} (it would never be in their list)`);
    }
    // a pass-through wrapper (send: (m) => sendAsRga({ supa, ...m })) is excused above: ITS caller (deps.send) carries the notice (11-11 reconcile)
    if (/sendAsRga\(\{\s*supa\s*,\s*\.\.\.m\s*\}\)/.test(src)) for (const c of callsOf(src, "deps.send")) {
      if (/^\(\s*\{/.test(c.args) && !/\bnotice\s*:/.test(c.args)) bad.push(`${f}:${c.at} deps.send (sendAsRga) reaches a client with no notice: {…} (it would never be in their list)`);
    }
    const gmailDirect = /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/.test(src);
    if (gmailDirect && !/_notices"\)\.record\(|Notices\.record\(/.test(src)) bad.push(`${f} sends through Gmail itself and records no notice`);
    if (/api\.openphone\.com\/v1\/messages/.test(src) && !/channel:\s*"text"/.test(src)) bad.push(`${f} sends a Quo text and records no text notice`);
    if (/calendar\/v3\/calendars\/primary\/events[^"`]*sendUpdates=all/.test(src) && !CAL_NOT_CLIENT[f] && !/channel:\s*"invite"/.test(src)) bad.push(`${f} makes Google email a client an invite and records no invite notice`);
    // the shared sendGmail (send-monthly-report) records what its callers pass; a file with its OWN sendGmail is held to the Gmail rule above
    const ownSendGmail = /async function sendGmail\(/.test(src);
    if (!ownSendGmail) for (const c of callsOf(src, "sendGmail")) if (/^\(\s*\{/.test(c.args) && !/\bnotice\b/.test(c.args)) bad.push(`${f}:${c.at} sendGmail reaches a client with no notice`);
  }
  return bad;
}
let files = {}, N, NS;
try {
  for (const f of fs.readdirSync(FN).filter((x) => x.endsWith(".js"))) files[f] = fs.readFileSync(path.join(FN, f), "utf8");
  N = req(path.join(SITE, "shared/notices.js")); NS = req("./_notices.js");
  for (const k of ["clientRows", "linkOf", "panelHtml", "unreadCount"]) if (typeof N[k] !== "function") throw new Error(`shared/notices.js ${k} isn't exported`);
  if (typeof NS.record !== "function" || typeof NS.readList !== "function") throw new Error("_notices.js record/readList aren't exported");
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

for (const b of sweep(files)) fail(b);
// the senders the catalog names must each record (a sender deleted or renamed is said, not skipped)
// (11-11 reconcile) K2 is retired: the kickoff agenda rides in the 24-hour reminder (K3, call-reminders). C7 is retired: the first payment is ONE
// letter, the receipt (C8, send-invoice-email). The hold queue's sends record when they actually go: its notes (M10, M11), the notice
// acknowledgment (E1, _notice-ack), its stage emails (notify-client-stage). The one mid-month note is MID (_mid-note).
const MUST = { "notify-step-open.js": ["M1", "M2", "M4", "C9"], "call-reminders.js": ["C3", "K3", "K4", "K5"], "send-step-email.js": ["M6", "M7"], "portal-reply.js": ["M8", "M9"], "send-kickoff-recap.js": ["K8"],
  "_client-email-queue.js": ["M10", "M11"], "_notice-ack.js": ["code: \"E1\""], "_mid-note.js": ["code: \"MID\""],
  "admin-offboarding-confirm.js": ["E3"], "notify-client-stage.js": ["C4", "C5", "C6", "C10", "R4", "R8", "R9", "C11"], "send-confirmation-email.js": ["C2"], "send-invoice-email.js": ["C8", "R3", "R7"],
  "send-kickoff-invite.js": ["K1", "M13", "R2", "Q2"], "cancel-kickoff-invite.js": ["K7"], "_monthly-close.js": ["R1"], "admin-month1-report.js": ["M12"], "approval-comments.js": ["M9"], "admin-deliverables.js": ["New for your approval"] };
for (const [f, codes] of Object.entries(MUST)) {
  const src = files[f]; if (!src) { fail(`${f} is gone: its client messages are no longer known to reach the list`); continue; }
  for (const c of codes) if (!src.includes(`"${c}"`) && !src.includes(c)) fail(`${f} no longer records ${c} in the client's list`);
}
if (!/sendGmail\(\{ workspaceId, to, subject, html, text, suppress = false, notice = null \}\)/.test(files["send-monthly-report.js"] || "") || !/if \(notice && notice\.clientId\) await require\("\.\/_notices"\)\.record\(\{ \.\.\.notice, channel: "email"/.test(files["send-monthly-report.js"] || "")) fail("send-monthly-report sendGmail no longer records the notice its callers pass");
// self-proof: the sweep catches a sender that skips the list
{
  const probe = sweep({ "x-new-sender.js": 'const sent = await sendAsRga({ supa, to: client.primary_contact_email, subject, markup });' });
  const probe2 = sweep({ "y.js": 'await fetch("https://api.openphone.com/v1/messages", {})' });
  const probe3 = sweep({ "z.js": 'fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all")' });
  if (!probe.length || !probe2.length || !probe3.length) fail("the sweep can't see a sender that skips the list (its own before state passes)");
}

// ── 2 · the one sender, on a fake Gmail ───────────────────────────────────────────────────────────────────────────────────────────────
const CID = "11111111-1111-4111-8111-111111111111";
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" }); delete process.env.RGA_SUPPRESS_CLIENT_EMAIL;
let rows = [], gmail = 503, failNotice = false, gmailCalls = 0;
globalThis.fetch = async (u, init = {}) => {
  const url = String(u), J = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o, text: async () => JSON.stringify(o) });
  if (url.includes("/rest/v1/client_notices")) { if (failNotice) return J({ code: "42P01", message: "relation does not exist" }, 404); rows.push(JSON.parse(init.body)); return { ok: true, status: 201, json: async () => null, text: async () => "" }; }
  if (url.includes("gmail.googleapis.com")) { gmailCalls++; return gmail === 200 ? J({ id: "gm-1", threadId: "t" }) : J({ error: { message: "backend error" } }, gmail); }
  if (url.includes("oauth2") || url.includes("/token")) return J({ access_token: "a", expires_in: 3600 });
  return J([]);
};
try {
  try { req("./_token-crypt.js").revealToken = (x) => x; } catch { /* plain tokens */ }
  const G = req("./_gmail.js");
  const credSupa = async () => [{ refresh_token: "r", google_email: "hello@rocketgrowthagency.com", scopes: "gmail.send" }];
  const notice = { clientId: CID, code: "R3", kind: "billing", linkPath: "/portal/#go-dashboard" };
  gmail = 200; rows = [];
  const out = await G.sendAsRga({ supa: credSupa, to: "sam@example.com", subject: "Your card will be charged $625 on Nov 13", markup: "Hi Sam,\n\nYour plan renews Friday.", notice });
  if (rows.length !== 1) fail(`a sent email wrote ${rows.length} notice rows, not 1`);
  else {
    const r = rows[0];
    if (r.status !== "sent" || r.code !== "R3" || r.client_id !== CID || r.provider_id !== out.id) fail(`the sent row is wrong (${JSON.stringify({ s: r.status, c: r.code, p: r.provider_id })})`);
    if (!/Your plan renews Friday/.test(r.frozen_text || "") || !/<p/.test(r.frozen_html || "")) fail("the row doesn't keep the copy as sent (text and HTML)");
    if (r.link_path !== "/portal/#go-dashboard" || r.kind !== "billing") fail("the row lost where it opens or its kind");
  }
  gmail = 503; rows = [];
  let threw = false; try { await G.sendAsRga({ supa: credSupa, to: "sam@example.com", subject: "s", markup: "Hi", notice }); } catch { threw = true; }
  if (!threw) fail("a refused send no longer throws");
  if (rows.length !== 1 || rows[0].status !== "failed" || !rows[0].error) fail("a refused send isn't recorded as failed (admin sees it in red)");
  rows = []; await G.sendAsRga({ supa: credSupa, to: "sam@example.com", subject: "s", markup: "Hi", notice, suppress: true });
  if (rows.length !== 1 || rows[0].status !== "suppressed") fail("a suppressed send isn't recorded as suppressed");
  gmail = 200; rows = []; failNotice = true;
  const ok2 = await G.sendAsRga({ supa: credSupa, to: "sam@example.com", subject: "s", markup: "Hi", notice }).then(() => true, () => false);
  if (!ok2) fail("a notice row that can't be written made the send fail");
  failNotice = false; rows = [];
  await G.sendAsRga({ supa: credSupa, to: "hello@rocketgrowthagency.com", subject: "s", markup: "Hi" });
  if (rows.length) fail("a send with no notice (RGA's own inbox) wrote a client notice");
} catch (e) { fail(`the sender threw: ${e.message}`); }

// ── 3 · what the client sees ──────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const L = [{ id: 1, status: "sent", channel: "email", subject: "a", sent_at: "2026-11-10T00:00:00Z", link_path: "/portal/#go-dashboard" },
    { id: 2, status: "failed", channel: "email", subject: "b", sent_at: "2026-11-12T00:00:00Z" }, { id: 3, status: "suppressed", channel: "email", subject: "c", sent_at: "2026-11-13T00:00:00Z" },
    { id: 4, status: "sent", channel: "text", subject: "d", sent_at: "2026-11-11T00:00:00Z", link_path: "/portal/#go-ongoing" }];
  const c = N.clientRows(L);
  if (c.some((r) => r.status !== "sent")) fail("a failed or suppressed send shows to the client");
  if (c.map((r) => r.id).join(",") !== "4,1") fail(`the client's list isn't newest first (${c.map((r) => r.id)})`);
  for (const r of c) { const l = N.linkOf(r); if (!l || (l.href && !/^\/portal\//.test(l.href))) fail(`a notice link doesn't open in the portal (${r.link_path})`); }
  const html = N.panelHtml({ state: "ready", rows: L });
  if (/>b<|>c</.test(html)) fail("the drawn list shows a failed or suppressed send");
  for (const st of ["unset", "error"]) { const h = N.panelHtml({ state: st, rows: [] }); if (/Nothing yet/.test(h) || !/Couldn't load/.test(h)) fail(`a ${st} list reads as "Nothing yet"`); }
  if (N.unreadCount(L, null) !== 2 || N.unreadCount(L, "2026-11-10T12:00:00Z") !== 1) fail("the unread count is wrong (it counts only sent ones since this sign-in last opened it)");
  const lr = await NS.readList(CID, { view: "client", supa: async (q) => { if (!/status=eq\.sent/.test(q)) fail("the client's list query doesn't ask for sent ones only"); return []; } });
  if (lr.state !== "ready") fail("readList didn't read");
  const miss = await NS.readList(CID, { supa: async () => { throw new Error("Supabase 404: {\"code\":\"42P01\"}"); } });
  if (miss.state !== "unset") fail("a missing table reads as something other than \"not set up\"");
  const sql = read("docs/supabase/NOTICES_AND_COMMENTS_2026-11-11.sql");
  if (!/link_path\s+text check \(link_path is null or link_path ~ '\^\/portal\/'\)/.test(sql)) fail("the table no longer refuses a link that opens outside the portal");
  if (!/client_notices_client_read[\s\S]{0,200}status = 'sent'/.test(sql)) fail("the client's database policy no longer hides failed sends");
}

// ── 4 · nightly, against the database (read only) ─────────────────────────────────────────────────────────────────────────────────────
if (LIVE.url && LIVE.key) {
  const get = async (q) => { const r = await REAL_FETCH(`${LIVE.url}/rest/v1${q}`, { headers: { apikey: LIVE.key, Authorization: `Bearer ${LIVE.key}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 160)}`); return JSON.parse(t || "[]"); };
  try {
    const [first] = await get(`/client_notices?select=sent_at&order=sent_at.asc&limit=1`);
    if (!first) console.log("  · live: the notice list has no rows yet (nothing to compare)");
    else {
      const since = new Date(Math.max(Date.parse(first.sent_at), Date.now() - 7 * 864e5)).toISOString();
      const acts = await get(`/client_activity?created_at=gte.${encodeURIComponent(since)}&kind=in.(step_open_sent,step_nudge_sent,rga_reply,stage_notification_sent)&select=client_id,kind,payload,created_at&limit=2000`);
      const sent = acts.filter((a) => a.kind === "stage_notification_sent" || (a.payload && a.payload.emailed === true));
      const notes = await get(`/client_notices?sent_at=gte.${encodeURIComponent(new Date(Date.parse(since) - 6e5).toISOString())}&select=client_id,sent_at,channel&limit=5000`);
      let missing = 0;
      for (const a of sent) if (!notes.some((n) => n.client_id === a.client_id && Math.abs(Date.parse(n.sent_at) - Date.parse(a.created_at)) <= 10 * 6e4)) { missing++; if (missing <= 5) fail(`live: a ${a.kind} to client ${a.client_id} at ${a.created_at} has no row in their notice list`); }
      console.log(`  · live: ${sent.length} recorded sends since ${since.slice(0, 10)}, ${missing} missing from the list`);
    }
  } catch (e) { if (/42P01|PGRST205|does not exist|Could not find the table/.test(e.message)) console.log("  · live: the client_notices table isn't there yet (docs/supabase/NOTICES_AND_COMMENTS_2026-11-11.sql not run): said, not failed"); else { console.error(`⚠️  live read failed: ${e.message}`); process.exit(2); } }
}

if (F.length) { console.error(`❌ every client message is in the list — ${F.length} regression(s):`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✅ every client message is in the list: every client sender records it (email, text, invite, portal), the one sender keeps the copy as sent and a failure in red for admin, and the client sees sent ones only, newest first, opening in the portal");
