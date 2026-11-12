#!/usr/bin/env node
// check-master-schedule.mjs: THE MASTER SCHEDULE (approved master_schedule_v1 v5, Chris 11-10).
// HOLDS, on the WEBSITE repo (source rules + fixtures run against the real modules, with a fake fetch; no network, no email, no Google):
//   1  NO ROW DELETED. rga_calls is never deleted: no website code issues a DELETE against it, the SQL has a trigger that refuses a delete, cancelling sets status 'cancelled',
//      and a CANCELLED call stays in the Schedule's data (struck through).
//   2  TAKEN = GREYED, NOT HIDDEN. freeSlots({takenOut}) puts a busy start in `takenOut` and not in the free list; without takenOut it behaves exactly as before;
//      the client portal draws a taken time greyed "taken" (kickoff grid + Month 1 review / monthly chips) and the availability answer carries `taken`.
//   3  ONE SLOT FINDER. Only _kickoff-slots.js defines freeSlots; the walkthrough slots + booking use it; no second slot generator exists.
//   4  ZONE SHOWN. Every time shows its zone: admin = PT plus the other person's time ("10:00 AM PT · 1:00 PM ET for them"), the client = their zone plus RGA's time once; fixtures for
//      Eastern, Central, Arizona and Hawaii, a DST boundary (2026-11-01), and an unknown zone that SAYS unknown instead of guessing.
//   5  THE SCHEDULE TAB: Day / Week / Month, Go to date, filters by call type and prospect/client, colors by call name, a click panel with links, Block time, Set your hours,
//      "Let RGA see when you're busy" (the existing freebusy grant), the banner "Google Calendar not connected for busy times", the sidebar badge, an owner on every call and the
//      "Showing" picker only with 2+ staff rows. Past dates read-only.
//   6  WITHOUT THE SQL IT NEVER ERRORS AND NEVER PRETENDS: callsReady() false -> recordCall is a no-op that says pending, the Schedule falls back to today's ledger and says
//      "Call history starts once the database update is run".
//   7  TWO STAFF (fixture): two rga_staff rows with separate hours + calendars resolve to different slot rules; one row never shows the picker.
//   8  DOUBLE BOOKING: the call card (walkthrough-book) and a client portal pick on the SAME slot at once -> exactly one wins, the other hears "That time was just taken", and exactly one calendar event is made.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default 6c340245) in 8+ places, else exit 2 INDETERMINATE.
//   node scripts/check-master-schedule.mjs [--against=<rev>] [--no-before]
import fs from "node:fs";
import path from "node:path";
import { runGate, reader, loader, codeLines } from "./lib/site-rev.mjs";

const BEFORE = "6c340245";
// the website's functions read env at load: fakes only
Object.assign(process.env, { SUPABASE_URL: "http://supa.test", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon", AIRTABLE_API_KEY: "at", RGA_SUPPRESS_CLIENT_EMAIL: "1", INTERNAL_FN_SECRET: "s" });

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const has = (p) => rd(p) != null;
  const fnDir = path.join(root, "netlify/functions");
  const fns = fs.existsSync(fnDir) ? fs.readdirSync(fnDir).filter((f) => f.endsWith(".js")) : [];

  // 1 · no row deleted
  const sql = rd("docs/supabase/RGA_CALLS_AND_STAFF_2026-11-10.sql");
  if (!sql) fail("the SQL file docs/supabase/RGA_CALLS_AND_STAFF_2026-11-10.sql does not exist");
  else {
    if (!/create table if not exists public\.rga_calls/.test(sql) || !/create table if not exists public\.rga_staff/.test(sql)) fail("the SQL does not create rga_calls and rga_staff");
    if (!/rga_calls_no_delete/.test(sql) || !/before delete on public\.rga_calls/.test(sql)) fail("the SQL has no trigger that refuses a delete on rga_calls");
    if (/\bdelete\s+from\s+(public\.)?rga_calls|drop table[^;]*rga_calls/i.test(sql.replace(/--.*$/gm, ""))) fail("the SQL deletes from or drops rga_calls");
    if (!/enable row level security/.test(sql.split("create table if not exists public.rga_calls")[1] || "")) fail("rga_calls has no row level security");
    for (const k of ["intro", "walkthrough", "kickoff", "m1_review", "monthly", "quarterly", "blocked"]) if (!sql.includes(`'${k}'`)) fail(`the SQL kind list lacks '${k}'`);
    for (const k of ["requested", "booked", "held", "cancelled", "rescheduled", "no_show"]) if (!sql.includes(`'${k}'`)) fail(`the SQL status list lacks '${k}'`);
    if (!/'walkthrough'\)/.test(sql.split("kickoff_slot_holds_purpose_check")[2] || "")) fail("the slot ledger cannot hold a walkthrough (purpose check)");
    if (!/lead_ref/.test(sql) || !/alter column client_id drop not null/.test(sql)) fail("the slot ledger has no lead_ref / nullable client_id for a prospect's walkthrough");
  }
  for (const f of fns) {
    const src = rd(`netlify/functions/${f}`) || "";
    for (const { l, n } of codeLines(src)) if (/rga_calls/.test(l) && /DELETE/.test(l)) fail(`${f}:${n} issues a DELETE against rga_calls`);
  }
  if (has("netlify/functions/_rga-calls.js") && /method:\s*"DELETE"/.test(rd("netlify/functions/_rga-calls.js"))) fail("_rga-calls.js can DELETE");
  if (!has("netlify/functions/_rga-calls.js")) fail("netlify/functions/_rga-calls.js does not exist");

  // 2 · taken = greyed
  let K = null; try { K = req("./netlify/functions/_kickoff-slots.js"); } catch (e) { fail(`_kickoff-slots.js does not load: ${e.message.slice(0, 80)}`); }
  if (K) {
    const realFetch = globalThis.fetch;
    // a ledger with one booked slot at the first offered start
    const day = new Date(Date.now() + 3 * 86400000); const probe = await (async () => { globalThis.fetch = async () => ({ ok: true, json: async () => [] }); return K.freeSlots(null, { ledger: { url: "http://x", key: "k", workspaceId: "w" }, now: day }); })();
    if (!probe.length) fail("freeSlots offered nothing on an empty ledger");
    else {
      const busy = probe[0];
      globalThis.fetch = async () => ({ ok: true, json: async () => [{ slot_start: busy.start, slot_end: new Date(Date.parse(busy.start) + 1800000).toISOString(), status: "booked", created_at: new Date().toISOString() }] });
      const taken = [], free = await K.freeSlots(null, { ledger: { url: "http://x", key: "k", workspaceId: "w" }, now: day, takenOut: taken });
      const plain = await K.freeSlots(null, { ledger: { url: "http://x", key: "k", workspaceId: "w" }, now: day });
      if (!taken.some((t) => t.start === busy.start && t.taken === true)) fail("a booked slot is not returned in takenOut (it would be hidden, not greyed)");
      if (free.some((s) => s.start === busy.start)) fail("a taken slot is still offered as free");
      if (JSON.stringify(plain.map((s) => s.start)) !== JSON.stringify(free.map((s) => s.start))) fail("passing takenOut changed which slots are free");
    }
    globalThis.fetch = realFetch;
  }
  const ka = rd("netlify/functions/kickoff-availability.js") || "";
  if (!/takenOut/.test(ka) || !/taken:\s*taken/.test(ka)) fail("kickoff-availability does not return the taken times");
  const portal = rd("portal/portal.js") || "";
  if (!/pm-cc-taken/.test(portal) || !/kickoff-slot is-taken/.test(portal)) fail("the client portal does not draw a taken time greyed");
  if (!/timeZoneName: "short"/.test(portal)) fail("the client portal picker does not show the zone on its times");
  if (!/for RGA/.test(portal)) fail("the client portal does not show RGA's time once");
  if (!/\.pm-cc-taken|is-taken/.test(rd("portal/portal.css") || "")) fail("portal.css has no style for a taken time");

  // 3 · one slot finder
  const defs = fns.filter((f) => /function freeSlots\b/.test(rd(`netlify/functions/${f}`) || ""));
  if (defs.length !== 1 || defs[0] !== "_kickoff-slots.js") fail(`freeSlots must be defined only in _kickoff-slots.js (found in: ${defs.join(", ") || "nowhere"})`);
  for (const f of ["walkthrough-slots.js", "walkthrough-book.js"]) {
    const s = rd(`netlify/functions/${f}`);
    if (s == null) fail(`${f} does not exist`); else if (!/_kickoff-slots/.test(s)) fail(`${f} does not use the one slot finder`);
  }
  for (const f of fns) if (f !== "_kickoff-slots.js" && /function instantAt\b/.test(rd(`netlify/functions/${f}`) || "")) fail(`${f} has its own slot clock (instantAt)`);

  // 4 · zone shown
  let T = null; try { T = req("./netlify/functions/_call-times.js"); } catch (e) { fail(`_call-times.js does not load: ${e.message.slice(0, 80)}`); }
  if (T) {
    const at = "2026-11-02T18:00:00Z";   // 10:00 AM PST
    const want = { "America/New_York": "1:00 PM ET", "America/Chicago": "12:00 PM CT", "America/Phoenix": "11:00 AM AZ", "Pacific/Honolulu": "8:00 AM HST" };
    for (const [z, w] of Object.entries(want)) {
      const s = T.bothClocks(at, z);
      if (!s.startsWith("10:00 AM PT") || !s.includes(w) || !s.includes("for them")) fail(`admin time for ${z} reads "${s}", wanted PT plus "${w} for them"`);
      const c = T.clientClocks(at, z);
      if (!c.startsWith(w) || !c.includes("10:00 AM PT for RGA")) fail(`client time for ${z} reads "${c}"`);
    }
    // DST: 2026-11-01 02:00 the US falls back. 10:00 AM PDT on Oct 30 vs PST on Nov 2 are the SAME wall time for RGA; Arizona (no DST) moves relative to PT.
    const oct = T.bothClocks("2026-10-30T17:00:00Z", "America/Phoenix"), nov = T.bothClocks("2026-11-02T18:00:00Z", "America/Phoenix");
    if (!oct.startsWith("10:00 AM PT") || !nov.startsWith("10:00 AM PT")) fail("RGA's wall time is wrong across the DST boundary");
    if (oct.includes("10:00 AM AZ") === nov.includes("10:00 AM AZ")) fail("Arizona did not shift against Pacific across the DST boundary (it has no DST)");
    if (!/zone unknown/.test(T.bothClocks(at, null)) && !/unknown/.test(T.bothClocks(at, null))) fail("an unknown zone is not said to be unknown");
    if (/—/.test(T.clientClocks(at, "America/New_York"))) fail("a client time carries an em dash");
    // business-day window: a Friday offers Monday to Wednesday
    const slots = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map((d) => ({ start: `${d}T18:00:00Z` }));
    const out = T.businessDaysOut(slots, new Date("2026-11-13T17:00:00Z"), 1, 3).map((s) => s.start.slice(0, 10));
    if (out.join() !== "2026-11-16,2026-11-17,2026-11-18") fail(`1 to 3 business days out from a Friday should be Mon to Wed, got ${out.join()}`);
  }
  const sd = rd("netlify/functions/schedule-data.js");
  if (sd == null) fail("netlify/functions/schedule-data.js does not exist");
  else { if (!/both:/.test(sd)) fail("schedule-data does not send each call's two-zone time"); if (!/Call history starts once the database update is run/.test(sd)) fail("schedule-data does not say that call history starts once the database update is run"); if (!/fromLedger/.test(sd)) fail("schedule-data has no fallback to today's ledger"); }

  // 5 · the Schedule tab
  const sch = rd("admin/schedule.js");
  if (sch == null) fail("admin/schedule.js does not exist");
  else {
    for (const [re, what] of [[/data-sch-view/, "Day / Week / Month views"], [/data-sch-goto/, "Go to date"], [/data-sch-type/, "the call-type filter"], [/data-sch-who/, "the prospect / client filter"], [/data-sch-block/, "Block time"], [/data-sch-hours/, "Set your hours"],
      [/data-kickoff-grant-freebusy/, "the freebusy grant button"], [/Google Calendar not connected for busy times/, "the not-connected banner"], [/staff\.length >= 2/, "the Showing picker only with 2+ staff"], [/scheduleNavBadge/, "the sidebar badge"],
      [/Open Meet/, "Open Meet"], [/Reschedule/, "Reschedule"], [/Their portal/, "Their portal"], [/Open the console/, "Open the console"], [/sch-past/, "read-only past dates"], [/sch-cx/, "a cancelled call kept and struck through"]])
      if (!re.test(sch)) fail(`the Schedule lacks ${what}`);
  }
  const html = rd("admin/index.html") || "";
  if (!/id="scheduleView"/.test(html) || !/data-nav="openScheduleButton"/.test(html) || !/id="scheduleNavBadge"/.test(html)) fail("admin/index.html has no Schedule view, sidebar link or badge");
  const adm = rd("admin/admin.js") || "";
  if (!/handleOpenSchedule/.test(adm) || !/view === "schedule"/.test(adm) || !/rawView === "schedule"/.test(adm)) fail("admin.js does not route the Schedule view");

  // 6 · without the SQL
  let R = null; try { R = req("./netlify/functions/_rga-calls.js"); } catch (e) { fail(`_rga-calls.js does not load: ${e.message.slice(0, 80)}`); }
  if (R) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => "relation does not exist", json: async () => ({}) });
    const ready = await R.callsReady();
    let out = null, threw = false;
    try { out = await R.recordCall({ workspace_id: "w", kind: "walkthrough", starts_at: "2026-11-12T18:00:00Z", ends_at: "2026-11-12T18:30:00Z" }); } catch { threw = true; }
    const hist = await R.callsBetween("w", "2026-11-01", "2026-12-01");
    if (ready !== false) fail("callsReady is not false when the tables are missing");
    if (threw || !out || out.ok !== false || out.pending !== true) fail("recordCall errors or pretends when the tables are missing");
    if (hist !== null) fail("callsBetween returns an empty list as if history existed (it must be null)");
    globalThis.fetch = realFetch;
  }

  // 7 · two staff
  let K2 = null; try { K2 = req("./netlify/functions/_kickoff-slots.js"); } catch { /* reported above */ }
  if (K2) {
    const a = K2.resolveRules({ tz: "America/Los_Angeles", firstHour: 9, lastHour: 16 }), b = K2.resolveRules({ tz: "America/New_York", firstHour: 12, lastHour: 19, days: [2, 3, 4] });
    if (a.firstHour === b.firstHour || a.tz === b.tz || a.days.length === b.days.length) fail("two staff rows with separate hours resolve to the same slot rules");
  }
  if (sql && !/hours\s+jsonb/.test(sql)) fail("rga_staff has no hours column");
  if (sql && !/google\s+jsonb/.test(sql)) fail("rga_staff has no google (calendar) column");

  // 8 · double booking from the call card and a client portal at once
  if (R && has("netlify/functions/walkthrough-book.js")) {
    const store = new Map(), events = [], calls = [];
    const J = (b, status = 200) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url), m = (init.method || "GET").toUpperCase(), body = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;
      if (u.includes("/auth/v1/user")) return J({ id: "u1", email: "rep@rga.test" });
      if (u.includes("/rest/v1/profiles")) return J([{ workspace_id: "w1", role: "owner" }]);
      if (u.includes("/rest/v1/kickoff_slot_holds")) {
        if (m === "GET") return J([...store.values()]);
        if (m === "DELETE") { for (const [k, v] of store) if (v.status === "held" || v.status === "booked") store.delete(k); return J([]); }
        const pref = (init.headers && (init.headers.Prefer || init.headers.prefer)) || "", key = `${body.workspace_id}|${body.slot_start}`;
        if (store.has(key) && /ignore-duplicates/.test(pref)) return J([], 201);
        if (store.has(key) && !/merge-duplicates/.test(pref)) return J({ code: "23505" }, 409);
        store.set(key, { ...body, created_at: new Date().toISOString() }); return J([body], 201);
      }
      if (u.includes("/rga_google_credentials")) return m === "GET" ? J([{ refresh_token: "plain", google_email: "hello@rga.test", scopes: "https://www.googleapis.com/auth/calendar.events", sends_date: null, sends_today: 0, sends_total: 0 }]) : J([]);
      if (u.includes("/workspaces")) return J([{ kickoff_availability: null }]);
      if (u.includes("oauth2.googleapis.com")) return J({ access_token: "tok" });
      if (u.includes("/calendar/v3/calendars/primary/events")) { events.push(body); return J({ id: `ev${events.length}`, hangoutLink: "https://meet.google.com/abc-defg-hij" }); }
      if (u.includes("/rest/v1/rga_calls")) { if (m === "POST") { calls.push(body); return J([{ id: `c${calls.length}` }], 201); } return J([]); }
      if (u.includes("/rest/v1/rga_staff")) return J([{ id: "s1" }]);
      if (u.includes("airtable.com")) return J({ id: "recX", fields: {} });
      return J([]);
    };
    try {
      const WB = req("./netlify/functions/walkthrough-book.js");
      const start = new Date(Date.now() + 2 * 86400000); start.setUTCMinutes(0, 0, 0); const iso = start.toISOString();
      const ev = (email) => ({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ lead_ref: "recA", business: "Acme Plumbing", email, confirm_to: email, start: iso, market: "Austin, TX" }) });
      const [r1, r2] = await Promise.all([WB.handler(ev("a@acme.test")), WB.handler(ev("a@acme.test"))]);
      const codes = [r1.statusCode, r2.statusCode].sort();
      if (codes.join() !== "200,409") fail(`two walkthroughs on one slot at once should be 200 and 409, got ${codes.join()}`);
      if (events.length !== 1) fail(`two bookings on one slot made ${events.length} calendar events (must be exactly 1)`);
      const loser = [r1, r2].find((r) => r.statusCode === 409);
      if (loser && !/just taken/.test(JSON.parse(loser.body).error)) fail('the loser is not told "That time was just taken"');
      // the client portal pick: the same ledger key, with the portal's own header, must lose (ignore-duplicates), not overwrite the booked walkthrough
      const portalSrc = rd("netlify/functions/portal-book-kickoff.js") || "";
      const reserve = portalSrc.split("const reserve = await fetch")[1] || "";
      if (!/ignore-duplicates/.test(reserve.slice(0, 700)) || /merge-duplicates/.test(reserve.slice(0, 700))) fail("a client portal pick can OVERWRITE a booked walkthrough (its reserve uses merge-duplicates)");
      if (!/That time was just taken/.test(portalSrc)) fail("the client portal does not tell a loser 'That time was just taken'");
      // nothing may be sent with no email or no confirmation
      const noMail = await WB.handler({ ...ev(""), body: JSON.stringify({ lead_ref: "recB", business: "X", email: "", confirm_to: "", start: iso }) });
      if (noMail.statusCode !== 400 || events.length !== 1) fail("a prospect with no email did not stop the invite before anything was created");
      const noConfirm = await WB.handler({ ...ev("b@acme.test"), body: JSON.stringify({ lead_ref: "recB", business: "X", email: "b@acme.test", start: iso }) });
      if (noConfirm.statusCode !== 400 || events.length !== 1) fail("the invite went (or would go) without the press naming its recipient");
    } catch (e) { fail(`the double-booking fixture threw: ${String(e.message).slice(0, 120)}`); }
    globalThis.fetch = realFetch;
  } else fail("walkthrough-book.js does not exist, so a walkthrough cannot hold a slot");
  return F;
}
try {
  await runGate({ name: "check-master-schedule", beforeRev: BEFORE, checkTree, minBefore: 8 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
