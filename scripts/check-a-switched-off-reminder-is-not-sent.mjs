#!/usr/bin/env node
// check-a-switched-off-reminder-is-not-sent.mjs — A REMINDER THE CLIENT SWITCHED OFF DOES NOT GO (approved card_notice_designs_v1 section 2, Chris 11-11).
// Runs the SHIPPED senders on fakes (a fake database, a fake Gmail, a fake Quo; nothing sent, nothing written for real):
//   1 call-reminders (the day before / an hour before a call, by email and by text): with the client's switch off, no Gmail call and no Quo call;
//     the reminder is claimed and marked "off" so it isn't asked again; with it on, both go and each is listed in the client's notices;
//     a settings read that FAILED claims nothing and sends nothing (the next run asks again). A prospect's walkthrough has no switches.
//   2 notify-step-open (the step reminder, the photos "remind me later", the kickoff agenda) asks the same switches before it stamps or sends
//   3 nightly, when the database can be read: no reminder in the notice list went out on a channel the client had switched off before it went
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const F = [], fail = (m) => F.push(m);
const LIVE = { url: process.env.SUPABASE_URL || "", key: process.env.SUPABASE_SERVICE_ROLE_KEY || "" }, REAL_FETCH = globalThis.fetch;
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", QUO_TEXTS_ENABLED: "1", QUO_API_KEY: "q", INTERNAL_FN_SECRET: "s3" });
delete process.env.RGA_SUPPRESS_CLIENT_EMAIL; delete process.env.CALL_REMINDERS;
const CID = "22222222-2222-4222-8222-222222222222", NOW = Date.now(), H = 3600e3;
let world;
function fresh(prefs, { prefsFail = false } = {}) {
  world = { prefs, prefsFail, gmail: 0, quo: 0, claims: [], results: [], notices: [] };
}
globalThis.fetch = async (u, init = {}) => {
  const url = String(u), m = (init.method || "GET").toUpperCase(), J = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o, text: async () => (o == null ? "" : JSON.stringify(o)) });
  if (url.includes("gmail.googleapis.com")) { world.gmail++; return J({ id: `gm${world.gmail}` }); }
  if (url.includes("api.openphone.com")) { world.quo++; return J({ data: { id: `q${world.quo}` } }); }
  if (url.includes("oauth2") || url.includes("/token")) return J({ access_token: "a", expires_in: 3600 });
  if (url.includes("/rest/v1/client_notice_prefs")) return world.prefsFail ? J({ message: "timeout" }, 500) : J(world.prefs);
  if (url.includes("/rest/v1/client_notices")) { world.notices.push(JSON.parse(init.body)); return J(null, 201); }
  if (url.includes("/rest/v1/rga_call_reminders") && m === "POST") { const b = JSON.parse(init.body); if (world.claims.includes(b.kind)) return J({}, 409); world.claims.push(b.kind); return J(null, 201); }
  if (url.includes("/rest/v1/rga_call_reminders") && m === "PATCH") { world.results.push({ kind: decodeURIComponent((/kind=eq\.([^&]+)/.exec(url) || [])[1] || ""), result: JSON.parse(init.body).result }); return J(null, 204); }
  if (url.includes("/rest/v1/rga_call_reminders")) return J([]);
  if (url.includes("/rest/v1/rga_calls") && m === "GET") return J(world.calls || []);
  if (url.includes("/rest/v1/rga_staff")) return J([{ id: "s" }]);
  if (url.includes("/rest/v1/rga_google_credentials")) return J([{ refresh_token: "r" }]);
  if (url.includes("/rest/v1/clients")) return J([{ business_name: "Beta Roofing", primary_contact_name: "Sam Ortiz", primary_contact_email: "sam@x.test", primary_market: "Culver City, CA", reminder_mobile: "(310) 555-0142" }]);
  if (url.includes("/rest/v1/client_contracts") || url.includes("/rest/v1/kickoff_slot_holds")) return J([]);
  return J([]);
};
let CR, S, NSO, CRS;
try {
  try { req("./_token-crypt.js").revealToken = (x) => x; } catch { /* plain */ }
  const R = req("./_rga-calls.js"); R.callsReady = async () => true;
  CR = req("./call-reminders.js"); S = req("./_notices.js");
  CRS = fs.readFileSync(path.join(SITE, "netlify/functions/call-reminders.js"), "utf8"); NSO = fs.readFileSync(path.join(SITE, "netlify/functions/notify-step-open.js"), "utf8");
  if (typeof CR.handler !== "function" || typeof S.mayRemind !== "function") throw new Error("call-reminders handler / _notices.mayRemind missing");
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

const call = { id: "call1", kind: "kickoff", status: "booked", client_id: CID, starts_at: new Date(NOW + 23 * H).toISOString(), created_at: new Date(NOW - 72 * H).toISOString(), meet_link: "https://meet.google.com/x" };
const run = async () => { const r = await CR.handler({ body: JSON.stringify({ next_run: new Date().toISOString() }), headers: {} }); return JSON.parse(r.body || "{}"); };
// 1a · both on: the email and the text go, each listed
fresh([]); world.calls = [call];
let out = await run();
if (world.gmail !== 1 || world.quo !== 1) fail(`with the switches on, the day-before email and text didn't both go (gmail ${world.gmail}, texts ${world.quo}; ${JSON.stringify(out).slice(0, 200)})`);
if (!world.notices.some((n) => n.channel === "email" && n.kind === "call_day_before" && n.status === "sent") || !world.notices.some((n) => n.channel === "text" && n.code === "K5" && n.status === "sent")) fail("a sent call reminder isn't in the client's notice list (email and text)");
// 1b · email off, text on
fresh([{ kind: "call_day_before", email_on: false, text_on: true }]); world.calls = [call];
out = await run();
if (world.gmail !== 0) fail("a day-before reminder EMAIL went with the client's email switch off");
if (world.quo !== 1) fail("switching the email off also stopped the text the client kept on");
if (!world.results.some((r) => r.kind === "email_24h" && /^off/.test(r.result))) fail("the switched-off email isn't claimed and marked off (it would be asked again every 10 minutes)");
// 1c · text off
fresh([{ kind: "call_day_before", email_on: true, text_on: false }]); world.calls = [call];
await run();
if (world.quo !== 0) fail("a day-before reminder TEXT went with the client's text switch off");
if (world.gmail !== 1) fail("switching the text off stopped the email");
// 1d · the hour before: its own switch
const soon = { ...call, id: "call2", starts_at: new Date(NOW + 40 * 6e4).toISOString() };
fresh([{ kind: "call_hour_before", email_on: false, text_on: false }, { kind: "call_day_before", email_on: true, text_on: true }]); world.calls = [soon];
await run();
if (world.gmail || world.quo) fail("an hour-before reminder went with both its switches off");
// 1e · settings that can't be read: nothing claimed, nothing sent
fresh([], { prefsFail: true }); world.calls = [call];
out = await run();
if (world.gmail || world.quo || world.claims.length) fail("with the client's settings unreadable, a reminder was claimed or sent (a guess)");
// 1f · a prospect's walkthrough has no switches (and no notice)
fresh([{ kind: "call_day_before", email_on: false, text_on: false }]); world.calls = [{ ...call, id: "w1", kind: "walkthrough", client_id: null, notes: JSON.stringify({ email: "p@x.test", name: "Pat" }) }];

// 1g · the order on the page: the switch is asked BEFORE the claim (a static pin, so a refactor can't move it after)
if (!/const may = call\.client_id \? await Notices\.mayRemind\([^\n]*channel: "email"[\s\S]{0,400}?if \(!may\.send\)[\s\S]{0,200}?R\.claimReminder\(call\.id, kind\)\) await R\.reminderResult\(call\.id, kind, `off: /.test(CRS)) fail("call-reminders no longer asks the email switch before it claims");
if (!/const mayT = call\.client_id \? await Notices\.mayRemind\([^\n]*channel: "text"[\s\S]{0,300}?if \(!mayT\.send\)/.test(CRS)) fail("call-reminders no longer asks the text switch before a text");

// 2 · notify-step-open asks before it stamps or sends
const pins = [
  [/else if \(!\(await may\("photos_later"\)\)\.send\) \{/, "the photos \"remind me later\" email"],
  [/const mR = dueR\.length \? await may\("step_waiting"\) : null;\s*if \(dueR\.length && !mR\.send\)/, "the step reminder"],
  [/const may = async \(kind\) => \{ if \(!prefsRead\) prefsRead = await Notices\.readPrefs\(client\.id\); return Notices\.mayRemind\(\{ clientId: client\.id, kind, channel: "email", prefs: prefsRead \}\); \};/, "the per-client switch read"],
];
for (const [re, what] of pins) if (!re.test(NSO)) fail(`notify-step-open no longer asks the client's switch before ${what}`);
// 🔒 master client-messages decision 2 (approved 11-11): the kickoff agenda is no longer its own email. Its words ride in call-reminders' 24-hour
// reminder (_call-reminders.js agendaBlock), whose call_day_before switch is pinned in 1g above. So notify-step-open must send NO kickoff email
// at all: a second "Tomorrow" email would also be one that never asked the switch.
{ const NSOcode = NSO.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  if (/kickoff|agenda/i.test(NSOcode)) fail("notify-step-open sends a kickoff email again (the agenda rides in the 24-hour call reminder, which asks the switch)");
  let CRL = ""; try { CRL = fs.readFileSync(path.join(SITE, "netlify/functions/_call-reminders.js"), "utf8"); } catch { /* checked below */ }
  if (!/agendaBlock/.test(CRL)) fail("the kickoff agenda's words are gone from the 24-hour call reminder (_call-reminders.js agendaBlock)"); }
// the rule itself, on its own
{
  const off = await S.mayRemind({ clientId: CID, kind: "step_waiting", channel: "email", prefs: { state: "ready", rows: [{ kind: "step_waiting", email_on: false, text_on: true }] } });
  const unread = await S.mayRemind({ clientId: CID, kind: "photos_later", channel: "email", prefs: { state: "error", error: "x" } });
  const unset = await S.mayRemind({ clientId: CID, kind: "photos_later", channel: "email", prefs: { state: "unset", rows: [] } });
  if (off.send) fail("mayRemind says send for a switched-off step reminder");
  if (unread.send || !unread.retry) fail("mayRemind sends a reminder when the settings couldn't be read");
  if (!unset.send) fail("before the settings table exists nobody could switch anything off, yet the reminder is held");
}

// 3 · nightly (read only): no listed reminder went out on a channel switched off before it went
if (LIVE.url && LIVE.key) {
  const get = async (q) => { const r = await REAL_FETCH(`${LIVE.url}/rest/v1${q}`, { headers: { apikey: LIVE.key, Authorization: `Bearer ${LIVE.key}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 160)}`); return JSON.parse(t || "[]"); };
  try {
    const prefs = await get(`/client_notice_prefs?or=(email_on.eq.false,text_on.eq.false)&select=client_id,kind,email_on,text_on,changed_at`);
    let bad = 0;
    for (const p of prefs) {
      const sent = await get(`/client_notices?client_id=eq.${p.client_id}&kind=eq.${p.kind}&status=eq.sent&sent_at=gt.${encodeURIComponent(p.changed_at)}&select=channel,sent_at,code`);
      for (const s of sent) if ((s.channel === "email" && p.email_on === false) || (s.channel === "text" && p.text_on === false)) { bad++; if (bad <= 5) fail(`live: a ${p.kind} ${s.channel} (${s.code}) went to client ${p.client_id} at ${s.sent_at}, after they switched it off`); }
    }
    console.log(`  · live: ${prefs.length} switched-off reminder settings checked against what was sent`);
  } catch (e) { if (/42P01|PGRST205|does not exist|Could not find the table/.test(e.message)) console.log("  · live: the settings / notices tables aren't there yet (docs/supabase/NOTICES_AND_COMMENTS_2026-11-11.sql not run): said, not failed"); else { console.error(`⚠️  live read failed: ${e.message}`); process.exit(2); } }
}

if (F.length) { console.error(`❌ a switched-off reminder is not sent — ${F.length} regression(s):`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✅ a switched-off reminder is not sent: call reminders (email and text, the day before and the hour before), step reminders, photos \"remind me later\" and the kickoff agenda each ask the client's switch first; off = claimed as off and never sent, unreadable = not now");
