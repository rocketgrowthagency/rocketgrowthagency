#!/usr/bin/env node
// check-a-closeout-booking-never-touches-the-kickoff.mjs — batch 3 of "build all" (approved 2026-10-19).
//
// The Month 1 close-out call (client step 13, admin row 60) books through the KICKOFF ledger and the kickoff's one
// sender, scoped by `kickoff_slot_holds.purpose` (_call-purpose.js). Before that column existed:
//   · portal-book-kickoff deleted EVERY requested hold of the client — a close-out pick wiped a kickoff request;
//   · send-kickoff-invite moved the event in `data.kickoff_invite.event_id` — confirming a close-out MOVED THE KICKOFF.
//
// 🔑 RUN, NOT READ. Each handler is required for real and run against a fake Supabase + fake Google that RECORD every
// request; the assertions are on what was sent (URLs, bodies, the onboarding record written). A regex over the source
// would pass the day the filter moved into a comment. → feedback_run_it_against_reality_before_calling_it_done
// 🔑 POINTABLE AT A COPY (APPROVAL_ARCHIVE_SITE_DIR) so its mutation suite can make it fail.
//   exit 0 = every case holds · 1 = a close-out booking can reach the kickoff (or the kickoff path broke) · 2 = harness
import fs from "node:fs";
import { createRequire } from "node:module";

const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${__SITE}/netlify/functions`;
const req = createRequire(`${FNS}/x.js`);
// 🔑 require.cache is keyed by the REAL path: a copy under /var/… is /private/var/… there, so compare real paths or the
// cache is never cleared and one case leaks module state into the next (found 10-19 by the mutation runner).
const FNS_REAL = fs.realpathSync(FNS);
const F = [];
const fail = (m) => F.push(m);

process.env.SUPABASE_URL = "https://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
process.env.URL = "https://site.test";
process.env.INTERNAL_FN_SECRET = "s";
process.env.FGA_REPORT_SIGNING_SECRET = "test-only";   // the kickoff invite signs its report link
globalThis.__rgaFetchDeadlineInstalled = true;   // _deadline.js must not capture the real fetch

// ── the fake world ──────────────────────────────────────────────────────────────────────────────
const KICK_EVENT = "KICKOFF_EVENT_ID";
let calls = [], world = {};
const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  calls.push({ url, method, body });
  if (url.startsWith("https://oauth2.googleapis.com/token")) return ok({ access_token: "t" });
  if (url.includes("googleapis.com/calendar")) {
    if (method === "DELETE") return ok({}, 204);
    const id = method === "PATCH" ? decodeURIComponent(url.split("/events/")[1].split("?")[0]) : "NEW_EVENT_ID";
    return ok({ id, htmlLink: "https://cal.test/e", hangoutLink: "https://meet.google.com/new-even-tid", creator: { email: "hello@rga.test" } });
  }
  if (url.startsWith("https://site.test/.netlify/functions/send-kickoff-invite")) return ok({ ok: true, summary: "sent" });
  if (url.startsWith("https://site.test/.netlify/functions/notify-rga")) return ok({ ok: true, delivered: true });
  const path = url.replace("https://db.test/rest/v1", "");
  if (path.startsWith("/clients")) return ok([{ id: "c1", workspace_id: "w1", business_name: "Acme Plumbing", primary_contact_email: "owner@acme.test", primary_contact_name: "Owner", primary_market: "Boston, MA" }]);
  if (path.startsWith("/rga_google_credentials")) return method === "GET" ? ok([{ refresh_token: "r", scopes: "https://www.googleapis.com/auth/calendar.events", google_email: "hello@rga.test" }]) : ok(null, 204);
  if (path.startsWith("/workspaces")) return ok([{ kickoff_availability: null }]);
  if (path.startsWith("/client_contracts")) return ok([{ status: "signed", monthly_price: 0 }]);
  if (path.startsWith("/client_invoices")) return ok([]);
  if (path.startsWith("/client_activity")) return ok(null, 201);
  if (path.startsWith("/client_onboarding_records")) {
    if (method === "PATCH") { if (body && body.data) world.record = body.data; return ok(null, 204); }
    return ok([{ id: "rec1", data: world.record }]);
  }
  if (path.startsWith("/kickoff_slot_holds")) {
    // the column probe (_call-purpose.ledgerReady): 400 = the SQL hasn't been applied yet
    if (/select=purpose&limit=1$/.test(path)) return world.noColumn ? ok({ message: "column kickoff_slot_holds.purpose does not exist" }, 400) : ok([]);
    if (world.noColumn && /purpose/.test(path)) return ok({ message: "column kickoff_slot_holds.purpose does not exist" }, 400);
    if (method === "DELETE") return ok([{ slot_start: world.holdStart || "2026-01-01T00:00:00.000Z" }]);
    if (method === "POST") return ok([{ ...(body || {}) }], 201);
    if (method === "PATCH") return ok(null, 204);
    if (/status=eq\.requested/.test(path) && /select=slot_start,purpose/.test(path)) return ok(world.requestRow ? [world.requestRow] : []);
    if (/status=in\.\(requested,booked\)/.test(path)) return ok(world.mine || []);
    if (/status=eq\.requested&select=slot_start$|select=slot_start&limit=1/.test(path)) return ok([]);
    return ok(world.ledger || []);
  }
  return ok({}, 404);
};

// ── load the real handlers, with a stub _auth (the gates are on what the handler sends, not on who may call it) ──
function load(name) {
  for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k];
  const authPath = req.resolve("./_auth.js");
  req.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
    jsonRes: (s, b) => ({ statusCode: s, body: JSON.stringify(b) }),
    requirePortalOwner: async () => ({ email: "owner@acme.test" }),
    requireWorkspaceForClientOrInternal: async () => ({ workspaceId: "w1", email: "chris@rga.test" }),
    requireWorkspaceUser: async () => ({ workspaceId: "w1", email: "chris@rga.test" }),
  } };
  return req(`./${name}`).handler;
}
const run = async (name, event) => {
  calls = [];
  const res = await load(name)(event);
  let body = {}; try { body = JSON.parse(res.body || "{}"); } catch { /* keep {} */ }
  return { status: res.statusCode, body };
};
const holdCalls = () => calls.filter((c) => c.url.includes("/kickoff_slot_holds"));
const KICKOFF_DONE = { "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T17:00:00.000Z" } };
const KICKOFF_STAMP = () => ({ event_id: KICK_EVENT, start: "2026-10-09T17:00:00.000Z", meet_link: "https://meet.google.com/kic-koff-lnk", attendee: "owner@acme.test" });

let PURPOSES, freeSlots;
try {
  ({ PURPOSES } = req("./_call-purpose.js"));
  ({ freeSlots } = req("./_kickoff-slots.js"));
} catch (e) { console.error(`harness: cannot load the purpose module / slot engine — ${e.message}`); process.exit(2); }
if (!PURPOSES || !PURPOSES.kickoff || !PURPOSES.m1_close) { console.error("harness: _call-purpose.js has no kickoff / m1_close"); process.exit(2); }
if (PURPOSES.kickoff.stamp !== "kickoff_invite") fail("the kickoff's stamp is no longer kickoff_invite — every kickoff reader reads that key");
if (PURPOSES.m1_close.stamp === PURPOSES.kickoff.stamp) fail("the close-out shares the kickoff's stamp — booking it would overwrite the kickoff record");
if (PURPOSES.m1_close.task === PURPOSES.kickoff.task) fail("the close-out writes the kickoff's task");
const { purposeOf } = req("./_call-purpose.js");
if (purposeOf(undefined) !== PURPOSES.kickoff) fail("a caller that names no purpose is no longer the kickoff — every pre-10-19 caller would change call");
if (purposeOf("m1.call.close") !== null || purposeOf("__proto__") !== null) fail("an unknown purpose is accepted instead of refused");

// a real bookable slot under the default rules, so isSlotFree has no reason to refuse it
world = { ledger: [] };
const slots = await freeSlots(null, { ledger: { url: "https://db.test", key: "k", workspaceId: "w1" } }).catch(() => []);
if (!slots.length) { console.error("harness: the slot engine offered no slot under the default rules"); process.exit(2); }
const START = slots[0].start;

// ── A · the client picks a close-out time ───────────────────────────────────────────────────────
world = { record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP() }, ledger: [] };
let r = await run("portal-book-kickoff.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, purpose: "m1_close" }) });
if (r.status !== 200) fail(`A · a close-out pick was refused (${r.status} ${r.body.error || ""})`);
for (const c of holdCalls().filter((c) => c.method === "DELETE")) if (!/purpose=eq\.m1_close/.test(c.url)) fail(`A · a close-out pick deletes holds of EVERY call: ${c.url.slice(0, 160)}`);
{ const ins = holdCalls().find((c) => c.method === "POST" && c.body && c.body.status === "requested");
  if (!ins) fail("A · no requested hold was written");
  else if (ins.body.purpose !== "m1_close") fail(`A · the close-out request was stored as purpose ${JSON.stringify(ins.body.purpose)} — it would read as the kickoff`); }
if (!world.record.closeout_invite || !world.record.closeout_invite.requested_start) fail("A · the close-out request was not stamped on closeout_invite");
if (JSON.stringify(world.record.kickoff_invite) !== JSON.stringify(KICKOFF_STAMP())) fail("A · a close-out pick changed the kickoff's record");
{ const n = calls.find((c) => c.url.includes("notify-rga")); if (!n || n.body.kind !== "closeout_time_requested") fail("A · RGA was not told a close-out time was asked for"); }

// ── B · no close-out before the kickoff ─────────────────────────────────────────────────────────
world = { record: { tasks: {} }, ledger: [] };
r = await run("portal-book-kickoff.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, purpose: "m1_close" }) });
if (r.status !== 409) fail(`B · a close-out was requested before the kickoff was held (got ${r.status})`);
if (holdCalls().some((c) => c.method !== "GET")) fail("B · a refused close-out still wrote to the ledger");

// ── C · the kickoff pick is unchanged (no purpose = kickoff) ────────────────────────────────────
world = { record: { tasks: {} }, ledger: [] };
r = await run("portal-book-kickoff.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START }) });
if (r.status !== 200) fail(`C · a kickoff pick was refused (${r.status} ${r.body.error || ""})`);
for (const c of holdCalls().filter((c) => c.method === "DELETE")) if (!/purpose=eq\.kickoff/.test(c.url)) fail(`C · a kickoff pick deletes the close-out's request too: ${c.url.slice(0, 160)}`);
if (!world.record.kickoff_invite || !world.record.kickoff_invite.requested_start) fail("C · the kickoff request is no longer stamped on kickoff_invite");

// ── D · RGA confirms the close-out — the sender must make a NEW event and never touch the kickoff's ──
world = { record: { tasks: { ...KICKOFF_DONE, "m1.close.kickoff_invite": { status: "done" } }, kickoff_invite: KICKOFF_STAMP() }, ledger: [] };
r = await run("send-kickoff-invite.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, force: 1, purpose: "m1_close" }) });
if (r.status !== 200) fail(`D · confirming a close-out failed (${r.status} ${r.body.error || ""})`);
{ const g = calls.filter((c) => c.url.includes("googleapis.com/calendar"));
  if (g.some((c) => c.url.includes(KICK_EVENT))) fail("D · CONFIRMING THE CLOSE-OUT MOVED THE KICKOFF — the sender addressed the kickoff's calendar event");
  const ev = g.find((c) => c.method === "POST");
  if (!ev) fail("D · no new calendar event was created for the close-out");
  else {
    if (!/close-out/i.test(ev.body.summary || "")) fail(`D · the close-out event is titled "${ev.body.summary}"`);
    if (!String(ev.body.conferenceData?.createRequest?.requestId || "").startsWith(PURPOSES.m1_close.requestPrefix)) fail("D · the close-out's Meet request id is the kickoff's");
    if (ev.body.transparency !== "opaque") fail("D · the close-out event does not hold the time (transparency)");
  } }
for (const c of holdCalls().filter((c) => c.method === "POST")) if (c.body && c.body.purpose !== "m1_close") fail(`D · a close-out ledger write carries purpose ${JSON.stringify(c.body.purpose)}`);
for (const c of holdCalls().filter((c) => c.method === "DELETE" && /status=eq\.requested/.test(c.url))) if (!/purpose=eq\.m1_close/.test(c.url)) fail("D · confirming a close-out clears the KICKOFF's open request too");
if (JSON.stringify(world.record.kickoff_invite) !== JSON.stringify(KICKOFF_STAMP())) fail("D · confirming a close-out rewrote the kickoff's record");
if (world.record.closeout_invite?.event_id !== "NEW_EVENT_ID") fail("D · the close-out booking is not recorded on closeout_invite");
if (world.record.tasks?.["m1.call.close"]?.status === "done") fail("D · BOOKING the close-out marked step 13 done — done is the call HELD");
if (world.record.tasks?.["m1.close.kickoff_invite"]?.status !== "done") fail("D · confirming a close-out changed the kickoff invite step");
if (calls.some((c) => c.url.includes("/client_contracts"))) fail("D · the close-out re-ran the kickoff's contract gate (kickoff-only)");

// ── E · a close-out is only ever a time the client picked ───────────────────────────────────────
world = { record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP() }, ledger: [] };
r = await run("send-kickoff-invite.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", force: 1, purpose: "m1_close" }) });
if (r.status !== 400 || calls.some((c) => c.url.includes("googleapis.com/calendar"))) fail(`E · a close-out with no picked time was booked (or not refused: ${r.status})`);

// ── F · moving the KICKOFF still moves the kickoff (the old path is intact) ─────────────────────
world = { record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP() }, ledger: [] };
r = await run("send-kickoff-invite.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, force: 1 }) });
if (r.status !== 200) fail(`F · moving the kickoff failed (${r.status} ${r.body.error || ""})`);
if (!calls.some((c) => c.method === "PATCH" && c.url.includes(`/events/${KICK_EVENT}`))) fail("F · a kickoff move no longer moves the kickoff's own event");
if (world.record.closeout_invite) fail("F · a kickoff move wrote a close-out record");

// ── G · RGA's answer reads the call from the ledger row, and the per-client list is one call ─────
world = { record: { tasks: {} }, requestRow: { slot_start: START, purpose: "m1_close" } };
r = await run("kickoff-requests.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, action: "confirm" }) });
{ const s = calls.find((c) => c.url.includes("send-kickoff-invite"));
  if (!s) fail(`G · confirm never reached the sender (${r.status} ${r.body.error || ""})`);
  else if (s.body.purpose !== "m1_close") fail("G · confirming a close-out request asked the sender for the KICKOFF"); }
r = await run("kickoff-requests.js", { httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "c1" } });
if (!holdCalls().some((c) => /purpose=eq\.kickoff/.test(c.url))) fail("G · the Overview's kickoff list (no purpose) also lists close-out requests");
r = await run("kickoff-requests.js", { httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "c1", purpose: "m1_close" } });
if (!holdCalls().some((c) => /purpose=eq\.m1_close/.test(c.url))) fail("G · row 60's close-out list is not scoped to the close-out");

// ── H · the close-out card reads the close-out's own request + Meet link ────────────────────────
world = { record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP(), closeout_invite: { meet_link: "https://meet.google.com/clo-seou-tlk", attendee: "owner@acme.test" } },
  ledger: [], mine: [{ slot_start: START, status: "booked" }] };
r = await run("kickoff-availability.js", { httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "c1", purpose: "m1_close" } });
if (r.status !== 200) fail(`H · the close-out availability failed (${r.status} ${r.body.error || ""})`);
if (!holdCalls().some((c) => /status=in\.\(requested,booked\)/.test(c.url) && /purpose=eq\.m1_close/.test(c.url))) fail("H · the close-out card reads the KICKOFF's request as its own");
if (!String(r.body.meetLink || "").includes("clo-seou-tlk")) fail(`H · the close-out's Join link is not the close-out's (${r.body.meetLink})`);
if (r.body.purpose !== "m1_close") fail("H · the answer does not say which call it is");

// ── I · cancelling a close-out request / booking leaves the kickoff alone ───────────────────────
world = { record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP(), closeout_invite: { requested_start: START } }, holdStart: START };
r = await run("cancel-kickoff-invite.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "00000000-0000-0000-0000-000000000001", what: "request", purpose: "m1_close" }) });
for (const c of holdCalls().filter((c) => c.method === "DELETE")) if (!/purpose=eq\.m1_close/.test(c.url)) fail("I · withdrawing a close-out request withdraws the kickoff's too");
world = { record: { tasks: { ...KICKOFF_DONE, "m1.close.kickoff_invite": { status: "done" } }, kickoff_invite: KICKOFF_STAMP(), closeout_invite: { event_id: "CLOSE_EVENT_ID", start: START, attendee: "owner@acme.test" } } };
r = await run("cancel-kickoff-invite.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "00000000-0000-0000-0000-000000000001", purpose: "m1_close" }) });
{ const g = calls.filter((c) => c.url.includes("googleapis.com/calendar") && c.method === "DELETE");
  if (g.some((c) => c.url.includes(KICK_EVENT))) fail("I · CANCELLING THE CLOSE-OUT CANCELLED THE KICKOFF");
  if (!g.some((c) => c.url.includes("CLOSE_EVENT_ID"))) fail(`I · cancelling the close-out did not cancel its event (${r.status} ${r.body.error || ""})`); }
if (JSON.stringify(world.record.kickoff_invite) !== JSON.stringify(KICKOFF_STAMP())) fail("I · cancelling the close-out removed or changed the kickoff's record");
if (world.record.closeout_invite) fail("I · the cancelled close-out is still on the record");
if (world.record.tasks?.["m1.close.kickoff_invite"]?.status !== "done") fail("I · cancelling the close-out reopened the kickoff invite step");

// ── K · BEFORE THE SQL: the kickoff works exactly as before, and the close-out is refused (never mis-scoped) ──
world = { noColumn: true, record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP() }, ledger: [] };
r = await run("portal-book-kickoff.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START }) });
if (r.status !== 200) fail(`K · with no purpose column a KICKOFF pick fails (${r.status} ${r.body.error || ""}) — deploying before the SQL would break every booking`);
if (holdCalls().some((c) => c.method !== "GET" && (/purpose/.test(c.url) || (c.body && "purpose" in c.body)))) fail("K · with no purpose column the kickoff pick still sends `purpose`");
r = await run("portal-book-kickoff.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, purpose: "m1_close" }) });
if (r.status !== 409 || holdCalls().some((c) => c.method !== "GET")) fail("K · with no purpose column a close-out pick is written (it would read as the kickoff)");
r = await run("kickoff-availability.js", { httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "c1", purpose: "m1_close" } });
if (r.body.unavailable !== true) fail("K · with no purpose column the close-out card would show the kickoff's request as its own");
r = await run("kickoff-requests.js", { httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "c1", purpose: "m1_close" } });
if (r.body.unavailable !== true || (r.body.requested || []).length) fail("K · with no purpose column row 60 would list the kickoff's holds as close-out requests");
world = { noColumn: true, record: { tasks: { ...KICKOFF_DONE }, kickoff_invite: KICKOFF_STAMP() }, ledger: [] };
r = await run("send-kickoff-invite.js", { httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: "c1", start: START, force: 1 }) });
if (r.status !== 200) fail(`K · with no purpose column moving the kickoff fails (${r.status} ${r.body.error || ""})`);

// ── J · the surfaces ask for the close-out, and the database allows exactly these calls ─────────
const read = (p) => { try { return fs.readFileSync(`${__SITE}/${p}`, "utf8"); } catch { return ""; } };
const portal = read("portal/portal.js"), admin = read("admin/admin.js");
if (!/const CLOSE_PURPOSE = "m1_close";/.test(portal)) fail("J · the portal's close-out card does not name its call");
if (!/kickoff-availability\?client_id=\$\{encodeURIComponent\(clientId\)\}&purpose=\$\{CLOSE_PURPOSE\}/.test(portal)) fail("J · the portal's close-out card reads the kickoff's availability answer");
if (!/client_id: clientId, start: startIso, purpose: CLOSE_PURPOSE/.test(portal)) fail("J · the portal's close-out pick is sent as a kickoff pick");
if (!/kickoff-requests\?client_id=\$\{encodeURIComponent\(cid\)\}&purpose=m1_close/.test(admin)) fail("J · admin row 60 reads the kickoff's requests");
if (!((admin.match(/\$\{rowLiveCardsHtml\(o, s\)\}/g) || []).length >= 2 && /id === "m1\.call\.close" \? closeoutAdminHtml\(\)/.test(admin))) fail("J · admin row 60 no longer shows the close-out booking");
const sqlFile = fs.readdirSync(`${__SITE}/docs/supabase`).find((f) => /SLOT_HOLD_PURPOSE/.test(f));
const sql = sqlFile ? read(`docs/supabase/${sqlFile}`) : "";
const allowed = (sql.match(/check \(purpose in \(([^)]*)\)\)/) || [])[1];
if (!allowed) fail("J · the purpose column's SQL (with its check constraint) is missing");
else if (JSON.stringify(allowed.split(",").map((x) => x.trim().replace(/'/g, "")).sort()) !== JSON.stringify(Object.keys(PURPOSES).sort())) fail(`J · the database allows (${allowed}) but the code knows ${Object.keys(PURPOSES).join(", ")}`);

console.log("── a close-out booking never touches the kickoff ──");
if (F.length) { console.log(`🔴 FAIL — ${F.length} problem(s):`); for (const m of F) console.log(`   • ${m}`); process.exit(1); }
console.log("✅ PASS — pick, confirm, list, read, withdraw and cancel are each scoped to ONE call; the kickoff path is unchanged.");
