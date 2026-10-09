#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-kickoff-agrees-on-every-surface.mjs
//
// 🔒 WHY (2026-10-09, approved kickoff_every_surface_every_state_v1): after the first v3 test call the client
// said "Done" while admin's Overview said "BOOKED · Join the call · Change the time", the attention panel said
// "record how it went" and step 7 asked "Did the call happen?" — about a call whose recap had gone at 9:11.
// Chris: "add this to your mockup and all places that kickoff call shows. we must get this right on the
// first try this is too many issues".
// RUNS THE REAL CODE for every state of the approved table — admin kickoffState · kickoffCallClock ·
// kickoffAlertFor (Needs your attention) · kickoffBookingCardModel (Overview) · kickoffNextAction (Your action)
// and the portal's kickoffPhase — and holds each surface to its row.
// exit 0 = every surface agrees · 1 = one disagrees · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let admin, portal;
try { admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); portal = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read admin.js / portal.js"); process.exit(2); }
const fnOf = (src, n) => (src.match(new RegExp(`function ${n}\\([^\\n]*?\\) \\{[\\s\\S]*?\\n\\}`)) || [null])[0];
const need = ["kickoffState", "kickoffCallClock", "kickoffAlertFor", "kickoffBookingCardModel", "kickoffNextAction", "kickoffStartsIn", "kickoffClockText", "kickoffCallOpen"];
const parts = need.map((n) => fnOf(admin, n));
const agenda = (admin.match(/const KICKOFF_AGENDA = \[[\s\S]*?KICKOFF_BUFFER_MIN = [^;]+;/) || [null])[0];
const phaseFn = fnOf(portal, "kickoffPhase");
if (parts.some((x) => !x) || !agenda || !phaseFn) { console.error(`🔴 could not isolate: ${need.filter((n, i) => !parts[i]).join(", ")}${agenda ? "" : " KICKOFF_AGENDA"}${phaseFn ? "" : " kickoffPhase"}`); process.exit(1); }

const box = {
  state: {}, Date, Math, Number, String, Object, Array, JSON, console,
  KICKOFF_INVITE_STEP_ID: "m1.close.kickoff_invite",
  _kickoffPendingIso: new Map(), _kickoffPendingAsk: new Map(), _kickoffAskProbed: new Set(),
  kickoffCountdown: (ms) => ({ text: ms > 60000 ? "In " + Math.round(ms / 60000) + "m" : "Happening now" }),
  kickoffAskCopy: () => ({ title: "They picked a kickoff time" }), kickoffWaitingOnPick: () => false,
  obNumberOf: () => 7, stepLabel: () => "Run the kickoff call",
};
vm.createContext(box);
try { vm.runInContext(`${agenda}\n${parts.join("\n")}\n${phaseFn}\nglobalThis.__k = { kickoffState, kickoffCallClock, kickoffAlertFor, kickoffBookingCardModel, kickoffNextAction, kickoffPhase };`, box, { timeout: 4000 }); }
catch (e) { console.error(`⚠️  INDETERMINATE — the kickoff code would not run: ${e.message}`); process.exit(2); }
const K = box.__k;
const min = 60000, ago = (m) => new Date(Date.now() - m * min).toISOString();

// One row per state of the approved table: the facts, then what each surface must say.
const ROWS = [
  { name: "booked (6 days out)", inv: { start: ago(-6 * 1440) }, state: "booked", card: "booked:Booked", alert: null, portal: "booked_ahead" },
  { name: "soon (42 min out)", inv: { start: ago(-42) }, state: "soon", card: /^booked:In /, alert: /is in/, portal: "booked_ahead" },
  { name: "due (time reached, not started)", inv: { start: ago(4) }, state: "live", card: "due:Due now", alert: /due now/, portal: "booked_live" },
  { name: "live (started 14 min ago)", inv: { start: ago(14), call_started_at: ago(14) }, state: "live", card: /^live:Live · 14 min$/, alert: /happening now/, portal: "booked_live" },
  { name: "call over? (started, 31 min)", inv: { start: ago(31), call_started_at: ago(31) }, state: "live", card: "live:Call over?", alert: /ran past its slot/, portal: "booked_live" },
  { name: "held, recap not sent (End at 12 min)", inv: { start: ago(12), call_started_at: ago(12), call_ended_at: ago(0), call_outcome: "held" }, state: "held", card: "held:Call held", alert: /recap has not been sent/, portal: "held", portalHeld: true },
  { name: "held by a sent recap (the 10-09 test call)", inv: { start: ago(120), recap_sent_at: ago(100) }, state: "held", card: "held:Call held", alert: null, portal: "held" },
  { name: "ended, never recorded", inv: { start: ago(120) }, state: "ended", card: "ended:Time passed", alert: /record how it went/, portal: "booked_passed" },
];
const F = [];
for (const r of ROWS) {
  box.state.flowM1State = { kickoff_invite: { event_id: "e1", meet_link: "https://meet.google.com/x", ...r.inv }, tasks: {} };
  box.state.selectedClient = { id: "c1", primary_contact_name: "Pat Client", primary_contact_email: "pat@example.com" };
  box.state.kickoffSectionIdx = undefined; box.state.kickoffCall = {};
  const kst = K.kickoffState("c1");
  if (kst.name !== r.state) F.push(`${r.name}: kickoffState is "${kst.name}", the table says "${r.state}"`);
  const m = K.kickoffBookingCardModel();
  const cardSaid = `${m.mode}:${m.pill}`;
  if (r.card instanceof RegExp ? !r.card.test(cardSaid) : cardSaid !== r.card) F.push(`${r.name}: the Overview card says "${cardSaid}", the table says ${r.card}`);
  if ((m.mode === "due" || m.mode === "live") && /Change|Cancel/.test(JSON.stringify(m)) && !/gone once/.test(m.note || "")) F.push(`${r.name}: the Overview card offers change/cancel on a call that is due or on`);
  const al = K.kickoffAlertFor(kst, null);
  if (r.alert === null ? al : !(al && r.alert.test(al.t))) F.push(`${r.name}: Needs your attention says ${al ? `"${al.t}"` : "nothing"}, the table says ${r.alert || "nothing"}`);
  const ph = K.kickoffPhase({ bookedIso: r.inv.start, slotMinutes: 30, recapSentAt: r.inv.recap_sent_at || null, heldRecorded: r.inv.call_outcome === "held", callStarted: !!r.inv.call_started_at });
  if (ph.name !== r.portal) F.push(`${r.name}: the client portal reads "${ph.name}", the table says "${r.portal}"`);
  const na = K.kickoffNextAction();
  if (r.state === "held" && r.inv.recap_sent_at && na) F.push(`${r.name}: Your action still names the call ("${na.title}") after the recap went`);
  if (r.name.startsWith("ended") && !(na && /Record the kickoff call/.test(na.title || ""))) F.push(`${r.name}: Your action does not ask to record the call`);
}
// the step-7 after pane never asks "Did the call happen?" once a recap went
if (!/const oc = ki\.call_outcome \|\| \(ki\.recap_sent_at \? "held" : ""\);/.test(admin)) F.push("step 7's after pane asks \"Did the call happen?\" after a recap went");
if (/Clients can book over meetings in/.test(admin)) F.push("the calendar note still says clients book over your Google Calendar — reworded in the approved mockup");

if (F.length) { console.error("🔴 the kickoff tells more than one story:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ the kickoff agrees on every surface: ${ROWS.length} states × Overview card · attention · Your action · client portal`);
