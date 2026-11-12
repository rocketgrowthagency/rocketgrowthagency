#!/usr/bin/env node
// check-the-mid-month-note-says-only-what-was-seen-live.mjs — THE NOTE CLAIMS ONLY WHAT WAS SEEN LIVE (approved card_notice_designs_v1 section 4, Chris 11-11).
// The SHIPPED builder on fixtures (no network):
//   1 only items seen live since the last report are claimed: a post Google shows LIVE, a reply Google shows, a change with a passed read-back,
//     a photo published. A post still processing, a reply not showing yet, a change not read back, or anything before the last report is left out
//     (and counted as "left out", never claimed)
//   2 every ticked line maps to item ids, and every number in it is the count of those ids; the claims are exactly the lines' ids
//   3 nothing new seen live = no note ("No note this month"), never a thin one
//   4 RGA's Edit may keep or remove a ticked line, never add or change one; the note is in the one format (shared/letter.js): US English,
//     no em dash, links as words, one sign-off
//   5 nightly, when the database can be read: every sent note's ticked lines are among its drafted lines and their numbers are their counts
// exit 0 holds · 1 regressed · 2 can't tell
import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const F = [], fail = (m) => F.push(m);
const LIVE = { url: process.env.SUPABASE_URL || "", key: process.env.SUPABASE_SERVICE_ROLE_KEY || "" }, REAL_FETCH = globalThis.fetch;
let MN, L;
try {
  MN = req("./_mid-note.js"); L = req(path.join(SITE, "shared/letter.js"));
  for (const k of ["itemsOf", "linesOf", "composeNote", "checkEdit", "tickedOf", "build", "edit"]) if (typeof MN[k] !== "function") throw new Error(`_mid-note ${k} isn't exported`);
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

const FROM = "2026-11-05T17:40:00Z", TO = "2026-11-16T14:20:00Z";
const src = {
  queues: [[
    { week: 1, post_name: "p1", status: "live", posted_at: "2026-11-08T17:00:00Z", headline: "Fall gutter cleaning", search_url: "https://g.co/1" },
    { week: 2, post_name: "p2", status: "live", posted_at: "2026-11-12T17:00:00Z", headline: "Free roof inspections", search_url: "https://g.co/2" },
    { week: 3, post_name: "p3", status: "processing", posted_at: "2026-11-15T17:00:00Z", headline: "Not yet" },
    { week: 0, post_name: "p0", status: "live", posted_at: "2026-10-30T17:00:00Z", headline: "Before the report" },
  ]],
  replies: [{ review_id: "r1", status: "live", seen_at: "2026-11-09T00:00:00Z", posted_at: "2026-11-08T00:00:00Z" }, { review_id: "r2", status: "live", seen_at: "2026-11-10T00:00:00Z" },
    { review_id: "r3", status: "live", seen_at: "2026-11-11T00:00:00Z" }, { review_id: "r4", status: "waiting", posted_at: "2026-11-14T00:00:00Z" }, { review_id: "r5", status: "not_showing", posted_at: "2026-11-06T00:00:00Z" }],
  changes: [
    { id: 10, surface: "google_business_profile", target: "description", value_before: "old", value_after: "New words", before_known: true, occurred_at: "2026-11-10T00:00:00Z", verified: true },
    { id: 11, surface: "google_business_profile", target: "hours", value_before: "9-5", value_after: "8-6", before_known: true, occurred_at: "2026-11-11T00:00:00Z", verified: false },
    { id: 12, surface: "onboarding", target: "gbp_manager_auto_add_error", value_before: null, value_after: "400", before_known: false, occurred_at: "2026-11-11T00:00:00Z", verified: true },
    { id: 13, surface: "reviews", target: "reply:r1", value_before: null, value_after: "Thanks", before_known: true, occurred_at: "2026-11-08T00:00:00Z", verified: true },
  ],
  photos: [{ id: "ph1", attempted_at: "2026-11-09T00:00:00Z" }, { id: "ph2", attempted_at: "2026-11-09T00:01:00Z" }, { id: "ph0", attempted_at: "2026-11-01T00:00:00Z" }],
};
const live = MN.itemsOf(src, FROM, TO);
const ids = new Set(live.live.map((x) => x.id));
const WANT = ["post:p1", "post:p2", "reply:r1", "reply:r2", "reply:r3", "change:10", "photo:ph1", "photo:ph2"];
for (const id of WANT) if (!ids.has(id)) fail(`${id} was seen live in the window but isn't claimed`);
for (const id of ids) if (!WANT.includes(id)) fail(`${id} is claimed but wasn't seen live in the window (processing, not showing, not read back, ours, or before the last report)`);
if (live.notYet.length !== 3) fail(`"left out" counts ${live.notYet.length}, want 3 (the processing post, the waiting reply, the change not read back)`);

// 2 · lines, numbers, claims
const lines = MN.linesOf(live.live);
const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
for (const l of lines) {
  if (!l.ids.length || !l.ids.every((i) => ids.has(i))) fail(`"${l.text}" claims something not seen live`);
  const text = l.text.replace(/\[[^\]]*\]\([^)]*\)/g, "x");
  const nums = [...text.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
  for (const n of nums) if (n !== l.ids.length) fail(`"${l.text}" says ${n} but stands for ${l.ids.length} item(s)`);
  if (!nums.length && l.ids.length > 1) fail(`"${l.text}" stands for ${l.ids.length} items but says no number`);
  const w = /^(Posted|Replied to|Added) (a|an|one)\b/.exec(text); if (w && l.ids.length !== 1) fail(`"${l.text}" says one but stands for ${l.ids.length}`);
  void words;
}
const note = MN.composeNote({ client: { primary_contact_name: "Sam Ortiz", business_name: "Beta Roofing" }, month: "2026-11-01", lines, next: [], since: { reportMonth: "2026-10-01" } });
if (JSON.stringify([...note.claims].sort()) !== JSON.stringify([...lines.flatMap((l) => l.ids)].sort())) fail("the note's claims aren't exactly its lines' items");
const ticked = MN.tickedOf(note.markup);
if (ticked.length !== lines.length || ticked.some((t, i) => t !== lines[i].text)) fail("the note's ticked lines aren't its drafted lines");

// 3 · nothing new = no note
{
  const st = { data: {} };
  const d = { now: () => Date.parse(TO), readClient: async () => ({ primary_contact_email: "s@x.test" }), readMonth: async () => ({ id: "m", data: st.data }), writeMonth: async (r, data) => { st.data = data; return true; },
    lastReport: async () => ({ at: FROM, reportMonth: "2026-10-01" }), readSources: async () => ({ queues: [[{ week: 3, post_name: "p3", status: "processing", posted_at: "2026-11-15T17:00:00Z" }]], replies: [], changes: [], photos: [], next: [] }) };
  const r = await MN.build({ clientId: "c", month: "2026-11-01", deps: d });
  if (r.state !== "none" || st.data.mid_note.status !== "none" || st.data.mid_note.markup) fail("with nothing new seen live, a note was drafted");
  const d2 = { ...d, readSources: async () => { throw new Error("database timed out"); } };
  const r2 = await MN.build({ clientId: "c", month: "2026-11-01", deps: d2 });
  if (r2.state !== "unknown" || st.data.mid_note.status !== "unknown" || st.data.mid_note.markup) fail("a source that didn't load made a draft (never a note with fewer items than were done)");
}

// 4 · Edit and the one format
{
  const base = { ...note, status: "draft" };
  if (MN.checkEdit(note.markup, base)) fail("the drafted note fails its own edit check");
  const removed = note.markup.split("\n").filter((l) => !/^✓ Added/.test(l)).join("\n");
  if (MN.checkEdit(removed, base)) fail("removing a ticked line was refused");
  if (!MN.checkEdit(`${note.markup}\n✓ Built 4 new pages`, base)) fail("an added ticked line was taken");
  if (!MN.checkEdit(note.markup.replace(/Replied to 3/, "Replied to 30"), base)) fail("a changed number on a ticked line was taken");
  if (!MN.checkEdit(note.markup.replace("Here's what", "Here—what"), base)) fail("an em dash was taken");
  const st = { data: { mid_note: base } };
  const d = { now: () => Date.now(), readMonth: async () => ({ id: "m", data: st.data }), writeMonth: async (r, data) => { st.data = data; return true; } };
  const e = await MN.edit({ clientId: "c", month: "2026-11-01", by: "chris@rga.test", markup: `${note.markup}\n✓ Ranked #1 on Google`, deps: d });
  if (e.status < 400 || st.data.mid_note.markup !== note.markup) fail("Edit saved a claim that wasn't seen live");
  const l = L.letter(note.markup);
  if (/—/.test(l.text) || /https?:\/\/[^"\s]+<\/a>/.test(l.html) || (l.text.match(/Rocket Growth Agency · /g) || []).length !== 1) fail("the note isn't in the one format (no em dash, links as words, one sign-off)");
  if (/\b(colour|favour|organis|realis|centre|behaviour)\w*/i.test(note.markup)) fail("the note drifted into British spelling");
}

// 5 · nightly (read only)
if (LIVE.url && LIVE.key) {
  try {
    const r = await REAL_FETCH(`${LIVE.url}/rest/v1/client_monthly_records?data->mid_note->>status=eq.sent&select=client_id,reporting_month,data->mid_note&limit=2000`, { headers: { apikey: LIVE.key, Authorization: `Bearer ${LIVE.key}` } });
    if (!r.ok) throw new Error(`${r.status}`);
    for (const x of await r.json()) { const n = x.mid_note || {}; const bad = MN.checkEdit(n.markup || "", n); if (bad) fail(`live: ${x.client_id} ${x.reporting_month}: ${bad}`); }
  } catch (e) { console.error(`⚠️  live read failed: ${e.message}`); process.exit(2); }
}

if (F.length) { console.error(`❌ the mid-month note says only what was seen live — ${F.length} regression(s):`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✅ the mid-month note says only what was seen live: only posts and replies Google shows, read-back changes and published photos since the last report; every number is a count of its items; nothing new = no note; an edit can only keep or remove a ticked line; one format");
