#!/usr/bin/env node
// check-review-replies-within-two-days.mjs — MONTHLY 4, REVIEW REPLIES WITHIN 1 TO 2 DAYS (approved tier3_best_in_class_v1 section 2, the owner 11-11: "RGA posts them" is
// the DEFAULT for 4 and 5 star replies; 1 to 3 star replies always wait for the client). Runs the SHIPPED code (shared/review-replies.js, _review-replies.js,
// _reply-post.js, the two endpoints) against FAKES: a fake database behind conditional writes, a fake Google, a fake drafter. No network, no model, nothing posted, no email.
//
// 0 SELF-PROOF FIRST. The rule the nightly check applies (shared slaFindings) is run on planted states before anything is trusted: a 5-star with no reply after 25 hours,
//   a 2-star after 49 hours, a 2-hour check that didn't run, two replies sharing a sentence MUST be red; a 5-star at 23 hours, a 2-star with the client at 47 hours, a
//   failed post with its reason, a replied review MUST NOT be. If the rule can't tell them apart the checker can't prove anything: exit 2.
// 1 the watch reads every 2 hours from 7 AM to 7 PM in the client's own time: 7 reads a day (LA and New York), none at 6 AM or 8 PM, never twice in one slot
// 2 a new review gets ONE record and its reply is drafted the same hour; the record keeps no review words and no reviewer (the 30-day rule)
// 3 4/5 stars + the default choice: RGA's OK posts it, read first, PUT, read back -> live, with the time from review to reply
// 4 1 to 3 stars: RGA's OK sends it to the client and makes NO Google call; the client's OK posts it -> live
// 5 4/5 stars + "I OK each one": RGA's OK sends it to the client, nothing posted
// 6 _reply-post planOne / postOne: the "never posts unapproved" rule, re-pointed at the choice; a refusal touches Google not at all
// 7 a choice change after RGA's OK and before the post moves the reply to the client (nothing posted); the choice saves and reads back
// 8 a refused post says why, retries at the next 2-hour check, stops after 5 and says so; Try again starts over
// 9 every state on the admin card and the client's side: empty, working, done, failed-and-said; a failed read is never "no new reviews"
// 10 the late To do row (a 1 to 3 star reply with the client 2 days) and the Call press; RGA's own OK is a To do row too
// 11 templated replies: a draft repeating a sentence is redrafted once, then flagged, and RGA's OK refuses it
// 12 two writers: a press landing between the watch's read and its write is not lost
// 13 wiring: the schedule, System health, the admin card, the client's cards, Approve/Edit/Save spin, ?v= keys, no em dash, the old batch path retired for Monthly 4
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const cant = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { cant(`cannot read ${r}`); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let RR, W, RP, ADMIN, PORTAL;
try {
  RR = req("../../shared/review-replies.js"); W = req("./_review-replies"); RP = req("./_reply-post");
  ADMIN = req("./admin-review-replies"); PORTAL = req("./portal-review-replies");
} catch (e) { cant(`the shipped code did not load: ${e.message}`); }

const H = 3600000, DAY = 86400000, LA = "America/Los_Angeles", NY = "America/New_York";
const at = (s) => Date.parse(s);
const CID = "11111111-1111-4111-8111-111111111111";

// ───────────────────────── 0 SELF-PROOF ─────────────────────────
{
  const now = at("2026-11-11T19:30:00Z");   // 11:30 AM in LA
  const allSlots = RR.slotsBetween(now - DAY, now + H, LA);
  const good = RR.slaFindings({ now, tz: LA, watch: { slots: allSlots },
    reviews: [{ id: "g1", stars: "FIVE", createTime: new Date(now - 23 * H).toISOString(), replied: false }, { id: "g2", stars: "TWO", createTime: new Date(now - 47 * H).toISOString(), replied: false },
      { id: "g3", stars: "FIVE", createTime: new Date(now - 30 * H).toISOString(), replied: false }, { id: "g4", stars: "ONE", createTime: new Date(now - 60 * H).toISOString(), replied: false },
      { id: "g5", stars: "FIVE", createTime: new Date(now - 50 * H).toISOString(), replied: true }],
    replies: { g2: { status: "with_client", stars: 2 }, g3: { status: "failed", why: "Google answered 503", stars: 5 }, g4: { status: "with_client", stars: 1 },
      a: { status: "live", text: "Thank you for the kind words about our crew, Ana." }, b: { status: "live", text: "We are glad the new water heater is working well for you." } } });
  const bad = RR.slaFindings({ now, tz: LA, watch: { slots: allSlots.filter((s) => !/@9$/.test(s)) },
    reviews: [{ id: "b1", stars: "FIVE", createTime: new Date(now - 25 * H).toISOString(), replied: false }, { id: "b2", stars: "TWO", createTime: new Date(now - 49 * H).toISOString(), replied: false }],
    replies: { b1: { status: "drafted", stars: 5 }, x: { status: "live", text: "Thank you for choosing our team this week. See you soon." }, y: { status: "live", text: "Glad it went well. Thank you for choosing our team this week." } } });
  const kinds = bad.reds.map((r) => r.kind);
  if (good.reds.length) cant(`self-proof: the rule is red on states that are fine: ${good.reds.map((r) => r.line).join(" | ")}`);
  if (kinds.filter((k) => k === "late").length !== 2 || !kinds.includes("missed_check") || !kinds.includes("templated")) cant(`self-proof: the rule misses a planted red (got ${kinds.join(", ")})`);
  if (RR.slaFindings({ now, tz: LA, watch: {}, reviews: null, replies: {} }).checked !== null) cant("self-proof: no read must be 'can't tell' (checked null), never 0 reviews");
}

// ───────────────────────── fakes ─────────────────────────
function makeWorld({ reviews = [], choice = null, tz = LA, putStatus = {}, existing = {}, consent = true, drafts = null, stage = "stage_5_monthly" } = {}) {
  let clockNow = 0, ver = 0;
  const T = {
    client_monthly_records: [],
    client_onboarding_records: [{ id: "ob1", client_id: CID, data: { ...(choice ? { review_reply_choice: { choice, at: "2026-11-01T00:00:00Z", by: "c@x.com" } } : {}), tasks: { "m1.gbp.business_facts": { google_push: { maps_uri: "https://maps.google.com/?cid=1" } } } }, updated_at: "v0" }],
    clients: [{ id: CID, business_name: "Beta Roofing", primary_market: tz === NY ? "Albany, NY" : "Culver City, CA", client_portal_stage: stage, source: null }],
  };
  const log = [], store = { ...existing }, google = { reads: 0 }, interleave = { fn: null }, posts = [], opened = [];
  const match = (r, q) => [...q.entries()].every(([k, v]) => (k === "select" || k === "limit" || k === "order" || k === "or" ? true : v.startsWith("eq.") ? String(r[k]) === decodeURIComponent(v.slice(3)) : v.startsWith("neq.") ? String(r[k]) !== decodeURIComponent(v.slice(4)) : true));
  async function supa(p, init = {}) {
    const [pth, qs = ""] = p.split("?"), name = pth.slice(1), q = new URLSearchParams(qs), method = init.method || "GET";
    const rows = T[name]; if (!rows) throw new Error(`Supabase 404: unknown ${name}`);
    if (method === "POST") { posts.push(name); const b = JSON.parse(init.body); const row = { id: `m${rows.length + 1}`, ...b, updated_at: `v${++ver}` }; rows.push(row); return [JSON.parse(JSON.stringify(row))]; }
    if (method === "PATCH") {
      if (interleave.fn) { const f = interleave.fn; interleave.fn = null; await f(); }
      const hit = rows.filter((r) => match(r, q)); const b = JSON.parse(init.body);
      hit.forEach((r) => Object.assign(r, b, { updated_at: `v${++ver}` })); return JSON.parse(JSON.stringify(hit));
    }
    return JSON.parse(JSON.stringify(rows.filter((r) => match(r, q)).slice(0, Number(q.get("limit")) || 999)));
  }
  const draftLog = [];
  const deps = {
    supa, now: () => clockNow, clock: () => clockNow, tz: () => tz, isClosed: async () => false,
    openMonth: async (cid, month) => { opened.push(month); if (!T.client_monthly_records.some((r) => r.client_id === cid && r.reporting_month === month)) T.client_monthly_records.push({ id: `m${T.client_monthly_records.length + 1}`, client_id: cid, reporting_month: month, data: { playbook_version: "month2plus-v1", tasks: {} }, updated_at: `v${++ver}` }); return { ok: true }; },
    readOnboardingData: async () => JSON.parse(JSON.stringify(T.client_onboarding_records[0].data)),
    readReviews: async () => { google.reads++; return google.fail ? { status: google.fail } : { status: "ok", total: reviews.length, raw: reviews.map((r) => ({ ...r, ...(store[r.reviewId] ? { reviewReply: { comment: store[r.reviewId] } } : {}) })) }; },
    poster: () => ({
      consent: async () => { log.push("consent"); return consent; },
      read: async (id) => { log.push(`read:${id}`); if (google.readFail) return { ok: false, status: 500 }; return { ok: true, replied: !!store[id], comment: store[id] || null }; },
      put: async (id, text) => { log.push(`put:${id}`); const s = putStatus[id]; if (s) return { ok: false, status: s }; store[id] = text; return { ok: true, status: 200 }; },
      ledger: async () => { log.push("ledger"); },
    }),
    draft: async ({ review, others, avoid }) => { draftLog.push({ id: review.reviewId, others: others.length, avoid: avoid || null }); if (drafts) return drafts(review, others, avoid); return `Thank you, ${(review.reviewer || {}).displayName ? review.reviewer.displayName.split(" ")[0] : "friend"}. We read every word about the ${review.reviewId} visit and it means a lot to the crew.`; },
  };
  const task = () => { const r = T.client_monthly_records.find((x) => x.client_id === CID && x.reporting_month === W.monthOf(clockNow)); return ((r && r.data && r.data.tasks) || {})[RR.ID] || {}; };
  return { T, posts, opened, deps, log, store, google, draftLog, interleave, task, setNow: (t) => { clockNow = t; }, client: T.clients[0] };
}
const rev = (id, stars, created, name = "Maria Gomez", comment = "The crew was friendly but they left nails in the driveway.") => ({ reviewId: id, starRating: stars, createTime: created, reviewer: { displayName: name }, comment });

// ───────────────────────── 1 the watch's hours ─────────────────────────
for (const [tz, label] of [[LA, "LA"], [NY, "New York"]]) {
  const w = makeWorld({ tz });
  const day0 = tz === LA ? at("2026-11-11T08:05:00Z") : at("2026-11-11T05:05:00Z");   // 00:05 local
  for (let h = 0; h < 24; h++) { w.setNow(day0 + h * H); await W.tickClient({ client: w.client, now: day0 + h * H, deps: w.deps }); }
  if (w.google.reads !== 7) fail(`1 ${label}: the watch must read Google 7 times a day (7 AM to 7 PM, every 2 hours), read ${w.google.reads}`);
  const before = w.google.reads; w.setNow(day0 + 11 * H + 40 * 60000); await W.tickClient({ client: w.client, now: day0 + 11 * H + 40 * 60000, deps: w.deps });
  if (w.google.reads !== before) fail(`1 ${label}: a second tick in the same 2-hour slot must not read again`);
  const slots = (w.task().review_watch || {}).slots || [];
  if (slots.some((s) => /@(6|8|20|21)$/.test(s)) || slots.length !== 7) fail(`1 ${label}: the recorded checks must be the 7 slot hours: ${slots.join(",")}`);
}

// ───────────────────────── 2 found + drafted the same hour, nothing of the review kept ─────────────────────────
const T0 = at("2026-11-11T18:41:00Z");   // 10:41 AM LA
{
  const w = makeWorld({ reviews: [rev("r5", "FIVE", new Date(T0).toISOString(), "Ana Pacheco", "Loved how tidy the crew was.")] });
  w.setNow(T0 + 24 * 60000); await W.tickClient({ client: w.client, now: T0 + 24 * 60000, deps: w.deps });   // 11:05
  const it = (w.task().review_replies || {}).r5;
  if (!it || it.status !== "drafted" || !it.text) fail(`2 a new review must be drafted in the same check: ${JSON.stringify(it)}`);
  else {
    if (Date.parse(it.drafted_at) - T0 > H) fail("2 the draft must land within the hour the review was found");
    const json = JSON.stringify(w.task());
    if (/Loved how tidy|Ana Pacheco|Pacheco/.test(json)) fail("2 the month's record must keep no review words and no reviewer (Google's 30-day rule)");
    if (it.stars !== 5 || it.arrived_at !== new Date(T0).toISOString()) fail("2 the record keeps the stars and Google's own arrival time");
  }
  if (w.log.some((x) => x.startsWith("put:"))) fail("2 nothing may post before RGA's OK");
  if (!w.opened.includes("2026-11-01") || w.posts.includes("client_monthly_records")) fail(`2 a month that isn't open is opened by openMonth (the one creator), never POSTed by the watch: opened ${w.opened.join()} posts ${w.posts.join()}`);
  const od = w.task().outcome_data || {};
  if (!od.reviews || !(od.reviews.drafted_ids || []).includes("r5")) fail("2 the step's review summary must cover the review (the morning run then starts nothing new)");
}

// ───────────────────────── 3 5 stars + default choice: RGA's OK posts it ─────────────────────────
async function drafted(world, id) { world.setNow(T0 + 24 * 60000); await W.tickClient({ client: world.client, now: T0 + 24 * 60000, deps: world.deps }); return (world.task().review_replies || {})[id]; }
async function adminPress(world, action, review_id, extra = {}) {
  ADMIN.__useDeps({ ...world.deps, gate: { email: "rga@x.com" } });
  const r = await ADMIN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action, review_id, ...extra }) }); ADMIN.__useDeps(null);
  return { code: r.statusCode, j: JSON.parse(r.body) };
}
async function portalPress(world, body) {
  PORTAL.__useDeps({ ...world.deps, gate: { email: "owner@beta.com" } });
  const r = await PORTAL.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, ...body }) }); PORTAL.__useDeps(null);
  return { code: r.statusCode, j: JSON.parse(r.body) };
}
{
  const w = makeWorld({ reviews: [rev("r5", "FIVE", new Date(T0).toISOString(), "James King", "Fast, fair and friendly.")] });
  await drafted(w, "r5");
  w.setNow(T0 + 116 * 60000);
  const o = await adminPress(w, "approve", "r5");
  const it = (w.task().review_replies || {}).r5;
  if (o.code !== 200 || it.status !== "live") fail(`3 a 5-star reply with the default choice must post on RGA's OK and read back live: ${o.code} ${JSON.stringify(o.j)} ${it && it.status}`);
  if (w.log.filter((x) => /^(read|put):r5/.test(x)).join() !== "read:r5,put:r5,read:r5") fail(`3 read first, post, read back: ${w.log.join()}`);
  if (w.store.r5 !== it.text) fail("3 the words on Google must be exactly the OK'd words");
  const v = RR.adminView({ replies: w.task().review_replies, watch: w.task().review_watch, choice: RR.choiceOf({}), now: T0 + 2 * H, tz: LA, names: { r5: "James K." } });
  const row = v.rows.find((r) => r.id === "r5");
  if (!row || row.state !== "ok" || !row.chips.some((c) => /seen .* · 1 h 56 min/.test(c.text)) || !row.chips.some((c) => /you OK'd/.test(c.text)) || row.title !== "5 stars · James K.") fail(`3 the live row shows the timeline and the time from review to reply ("1 h 56 min"): ${JSON.stringify(row)}`);
}

// ───────────────────────── 4 1 to 3 stars: always the client ─────────────────────────
{
  const w = makeWorld({ reviews: [rev("r2", "TWO", new Date(T0).toISOString())] });
  await drafted(w, "r2");
  w.setNow(T0 + H);
  let o = await adminPress(w, "approve", "r2");
  let it = w.task().review_replies.r2;
  if (o.code !== 200 || it.status !== "with_client" || !it.sent_to_client_at) fail(`4 a 2-star reply goes to the client on RGA's OK: ${JSON.stringify(it)}`);
  if (w.log.length) fail(`4 RGA's OK on a 2-star reply must not touch Google at all: ${w.log.join()}`);
  const pr = await portalPress(w, { action: "read" });
  const card = (pr.j.approvals || [])[0];
  if (!card || card.first !== "Maria" || !/nails in the driveway/.test(card.words || "") || !/^Review posted today, 10:41 AM$/.test(card.arrivedWords) || !/^reply due by Thu, Nov 12$/.test(card.dueWords)) fail(`4 the client's card reads the review from Google now and says when it is due: ${JSON.stringify(card)}`);
  o = await portalPress(w, { action: "approve", review_id: "r2", text: "Maria, thank you for telling us, and we're sorry about the nails. Our crew lead will call you today." });
  it = w.task().review_replies.r2;
  if (o.code !== 200 || it.status !== "live" || !it.client_ok_at || w.store.r2 !== "Maria, thank you for telling us, and we're sorry about the nails. Our crew lead will call you today.") fail(`4 the client's OK posts their words and reads them back: ${o.code} ${JSON.stringify(it)}`);
  for (const stars of ["ONE", "THREE", null]) {
    const w2 = makeWorld({ reviews: [rev("rx", stars, new Date(T0).toISOString())], choice: "rga_posts" });
    await drafted(w2, "rx"); w2.setNow(T0 + H); await adminPress(w2, "approve", "rx");
    if (w2.task().review_replies.rx.status !== "with_client" || w2.log.length) fail(`4 a ${stars || "no-star"} review must wait for the client even under "RGA posts them"`);
  }
}

// ───────────────────────── 5 "I OK each one" ─────────────────────────
{
  const w = makeWorld({ reviews: [rev("r4", "FOUR", new Date(T0).toISOString())], choice: "client_oks" });
  await drafted(w, "r4"); w.setNow(T0 + H); await adminPress(w, "approve", "r4");
  if (w.task().review_replies.r4.status !== "with_client" || w.log.length) fail("5 a 4-star reply waits for the client when they chose I OK each one");
  const v = RR.adminView({ replies: w.task().review_replies, choice: { choice: "client_oks", saved: true }, now: T0 + H, tz: LA, watch: w.task().review_watch });
  if (!/they chose to OK each one/.test(v.rows[0].line) || (v.rows[0].pill || [])[0] !== "Client's move") fail(`5 the admin row says it is the client's move and why: ${JSON.stringify(v.rows[0])}`);
}

// ───────────────────────── 6 the posting rule ─────────────────────────
{
  const ok = { text: "Thank you.", rga_ok_at: "x", stars: 5 };
  const cases = [[{ ...ok, rga_ok_at: null }, "rga_posts", /RGA has not OK'd/], [{ ...ok, stars: 2 }, "rga_posts", /1 to 3 star/], [{ ...ok, stars: null }, "rga_posts", /1 to 3 star/],
    [{ ...ok }, "client_oks", /chose to OK each/], [{ ...ok, text: "" }, "rga_posts", /no reply words/], [{ ...ok, text: "x".repeat(4097) }, "rga_posts", /longer than Google/]];
  for (const [item, choice, why] of cases) {
    const p = RP.planOne(item, choice);
    if (p.ok || !why.test(p.why || "")) fail(`6 planOne must refuse and say why (${why}): ${JSON.stringify(p)}`);
    const lg = []; const d = { consent: async () => { lg.push("c"); return true; }, read: async () => { lg.push("r"); return { ok: true }; }, put: async () => { lg.push("p"); return { ok: true }; } };
    const r = await RP.postOne({ id: "z", item, choice, now: 0, deps: d });
    if (r.attempted || lg.length) fail(`6 a refused reply must make no call at all: ${lg.join()}`);
  }
  if (!RP.planOne({ ...ok, stars: 2, client_ok_at: "y" }, "rga_posts").ok || !RP.planOne(ok, "rga_posts").ok || !RP.planOne({ ...ok, client_ok_at: "y" }, "client_oks").ok) fail("6 planOne must allow a reply the rule allows");
  // a reply already on Google that isn't ours is never replaced
  const w = makeWorld({ reviews: [rev("r5", "FIVE", new Date(T0).toISOString())] });
  await drafted(w, "r5"); w.store.r5 = "Their own reply"; w.setNow(T0 + H);
  await adminPress(w, "approve", "r5");
  if (w.log.includes("put:r5") || w.store.r5 !== "Their own reply" || w.task().review_replies.r5.status !== "held") fail("6 a reply already on Google is left alone and said");
}

// ───────────────────────── 7 the choice ─────────────────────────
{
  const w = makeWorld({ reviews: [rev("r5", "FIVE", new Date(T0).toISOString())], putStatus: { r5: 503 } });
  await drafted(w, "r5"); w.setNow(T0 + H); await adminPress(w, "approve", "r5");   // OK'd, Google refused: waits to retry
  if (w.task().review_replies.r5.status !== "failed") fail(`7 setup: a refused post must read failed: ${w.task().review_replies.r5.status}`);
  let c = await portalPress(w, { action: "read" });
  if (!c.j.choice || c.j.choice.choice !== "rga_posts" || c.j.choice.saved !== false) fail(`7 with nothing saved the choice reads the default "RGA posts them", not saved: ${JSON.stringify(c.j.choice)}`);
  c = await portalPress(w, { action: "choice", choice: "client_oks" });
  if (c.code !== 200 || w.T.client_onboarding_records[0].data.review_reply_choice.choice !== "client_oks") fail(`7 the choice must save and read back: ${JSON.stringify(c.j)}`);
  if (await portalPress(w, { action: "choice", choice: "whatever" }).then((x) => x.code) !== 400) fail("7 an unknown choice is refused");
  delete w.deps.poster; w.deps.poster = () => { throw new Error("7 nothing may post after the client switched to I OK each one"); };
  w.setNow(T0 + 3 * H); await W.tickClient({ client: w.client, now: T0 + 3 * H, deps: w.deps });
  if (w.task().review_replies.r5.status !== "with_client") fail(`7 after the switch the OK'd 5-star reply goes to the client, not to Google: ${w.task().review_replies.r5.status}`);
  // the watch itself re-checks the choice at posting time (a choice saved by any path, or a reroute that didn't land): an OK'd reply waiting to post is never posted
  const w2 = makeWorld({ reviews: [rev("r9", "FIVE", new Date(T0).toISOString())] });
  await drafted(w2, "r9");
  const rec = w2.T.client_monthly_records[0]; rec.data.tasks[RR.ID].review_replies.r9 = { ...rec.data.tasks[RR.ID].review_replies.r9, status: "approved", rga_ok_at: "2026-11-11T19:00:00Z", v: 9 };
  w2.T.client_onboarding_records[0].data.review_reply_choice = { choice: "client_oks", at: "2026-11-11T19:10:00Z", by: "c@x.com" };
  w2.setNow(T0 + H + 30 * 60000); await W.tickClient({ client: w2.client, now: T0 + H + 30 * 60000, deps: w2.deps });
  if (w2.log.length || w2.task().review_replies.r9.status !== "with_client") fail(`7 the watch must re-read the choice before posting and send the reply to the client instead: ${w2.log.join()} ${w2.task().review_replies.r9.status}`);
}

// ───────────────────────── 8 failure, retry, stop ─────────────────────────
{
  const w = makeWorld({ reviews: [rev("r5", "FIVE", new Date(T0).toISOString())], putStatus: { r5: 503 } });
  await drafted(w, "r5"); w.setNow(T0 + H); await adminPress(w, "approve", "r5");
  let it = w.task().review_replies.r5;
  if (it.status !== "failed" || !/503/.test(it.why) || it.tries !== 1) fail(`8 a refused post says why and counts the try: ${JSON.stringify(it)}`);
  const v = RR.adminView({ replies: w.task().review_replies, choice: RR.choiceOf({}), now: T0 + H, tz: LA, watch: w.task().review_watch });
  if (!/answered 503\)\. Trying again at 1:00 PM, try 2 of 5\. After 5 it stops and says so\./.test(v.rows[0].line)) fail(`8 the failed row says the code, the next try time and the count: ${v.rows[0].line}`);
  w.setNow(T0 + H + 30 * 60000); await W.tickClient({ client: w.client, now: T0 + H + 30 * 60000, deps: w.deps });   // 12:11 PM: not a check hour
  if (w.task().review_replies.r5.tries !== 1) fail("8 a failed post is retried at the next 2-hour check, not every hour");
  for (let k = 0; k < 6; k++) { const t = T0 + (3 + 2 * k) * H; w.setNow(t); await W.tickClient({ client: w.client, now: t, deps: w.deps }); }
  it = w.task().review_replies.r5;
  if (it.status !== "stopped" || it.tries !== 5) fail(`8 retrying stops after 5 tries and says so: ${it.status} ${it.tries}`);
  const v2 = RR.adminView({ replies: w.task().review_replies, choice: RR.choiceOf({}), now: T0 + 14 * H, tz: LA, watch: w.task().review_watch });
  if (!/after 5 tries .* It stopped/.test(v2.rows[0].line) || !v2.rows[0].acts.includes("retry") || v2.tone !== "you") fail(`8 a stopped reply says it stopped and offers Try again: ${JSON.stringify(v2.rows[0])}`);
  if (!RR.todoRows({ replies: w.task().review_replies, now: T0 + 14 * H }).some((r) => r.kind === "review_reply_stopped")) fail("8 a stopped reply is RGA's To do row");
}

// ───────────────────────── 9 every state ─────────────────────────
{
  const now = at("2026-11-11T19:30:00Z");
  const e1 = RR.adminView({ replies: {}, watch: { last: { at: "2026-11-11T19:05:00Z", status: "ok" }, last_review_at: "2026-11-03T17:00:00Z" }, now, tz: LA });
  if (!e1.empty || e1.empty.title !== "No new reviews since Nov 3" || !/every 2 hours from 7 AM to 7 PM their time/.test(e1.empty.line) || e1.when !== "Checked 11:05 AM<br>next 1:00 PM") fail(`9 empty: "No new reviews since Nov 3", the hours, "Checked … next 1:00 PM": ${JSON.stringify(e1)}`);
  const e2 = RR.adminView({ replies: {}, watch: { last: { at: "2026-11-11T19:05:00Z", status: "could_not_read", why: "Google didn't answer" } }, now, tz: LA });
  if (!e2.empty || /No new/.test(JSON.stringify(e2)) || !/never read as no reviews/.test(e2.empty.line) || e2.tone !== "you") fail(`9 a failed read is "Couldn't read", never "No new reviews": ${JSON.stringify(e2)}`);
  const e3 = RR.adminView({ replies: {}, watch: { last: { at: "2026-11-11T19:05:00Z", status: "disconnected" } }, now, tz: LA });
  if (!e3.empty || !/isn't connected/.test(e3.empty.title)) fail("9 not connected says so");
  const e4 = RR.adminView({ replies: {}, watch: {}, now, tz: LA });
  if (!e4.empty || !/Not checked yet/.test(e4.empty.title)) fail("9 never checked is not 'no new reviews'");
  const working = RR.adminView({ replies: { a: { status: "drafting", stars: 5, found_at: "2026-11-11T19:05:00Z" }, b: { status: "approved", stars: 5, rga_ok_at: "x", text: "t" } }, watch: {}, now, tz: LA });
  if (!working.rows.some((r) => r.wait && /Drafting a reply/.test(r.line)) || !working.rows.some((r) => r.wait && /Posting on Google/.test(r.line))) fail("9 working: Drafting a reply… and Posting on Google… with a spinner");
  const cv = RR.clientView({ replies: {}, watch: { last: { status: "ok" }, last_review_at: "2026-11-03T17:00:00Z" }, now, tz: LA });
  if (cv.empty !== "No new reviews since Nov 3. We check Google every 2 hours from 7 AM to 7 PM your time.") fail(`9 the client's empty words: ${cv.empty}`);
  const cv2 = RR.clientView({ replies: { j: { status: "live", stars: 5, arrived_at: "2026-11-10T15:58:00Z", live_at: "2026-11-10T17:54:00Z" } }, now: at("2026-11-11T19:30:00Z"), tz: LA });
  if (!cv2.replied.length || cv2.replied[0].when !== "Posted 2 hours after the review · Nov 10") fail(`9 the client's replied card: "Posted 2 hours after the review · Nov 10": ${JSON.stringify(cv2.replied)}`);
  for (const ch of ["rga_posts", "client_oks"]) if (/approve it first/i.test(RR.promiseWords(ch)) || (ch === "rga_posts" && !/posts replies to 4 and 5 star reviews/.test(RR.promiseWords(ch)))) fail(`9 the client's promise words must match the choice: ${RR.promiseWords(ch)}`);
}

// ───────────────────────── 10 To do ─────────────────────────
{
  const now = at("2026-11-13T18:00:00Z");
  const rows = RR.todoRows({ now, replies: { a: { status: "with_client", stars: 2, sent_to_client_at: "2026-11-11T17:41:00Z" }, b: { status: "with_client", stars: 2, sent_to_client_at: "2026-11-12T17:41:00Z" }, c: { status: "drafted", stars: 5, drafted_at: "2026-11-13T17:00:00Z", arrived_at: "2026-11-13T16:59:00Z" } } });
  const late = rows.filter((r) => r.kind === "review_reply_late");
  if (late.length !== 1 || late[0].review_id !== "a" || late[0].what !== "hasn't OK'd a reply to a 2-star review") fail(`10 a 2-star reply with the client 2 days becomes ONE late To do row: ${JSON.stringify(late)}`);
  if (!rows.some((r) => r.kind === "review_reply_ok" && r.review_id === "c")) fail("10 a draft waiting for RGA's OK is RGA's To do row");
  const om = read("netlify/functions/admin-open-moves.js"), a = read("admin/admin.js");
  if (!/review-replies\.js"\)\.todoRows|RRS?\.todoRows\(/.test(om)) fail("10 the To do queue must read the late rows from shared/review-replies.js todoRows");
  if (!/review_reply_late/.test(a) || !/tel:/.test((a.match(/review_reply_late[\s\S]{0,600}/) || [""])[0])) fail("10 the late row's main press is Call (tel:)");
}

// ───────────────────────── 11 templated ─────────────────────────
{
  const same = "Thank you for trusting our crew with your roof this week.";
  const w = makeWorld({ reviews: [rev("ra", "FIVE", new Date(T0).toISOString()), rev("rb", "FIVE", new Date(T0 + 60000).toISOString())], drafts: () => `Thanks! ${same}` });
  await drafted(w, "ra");
  const R = w.task().review_replies;
  const flagged = Object.values(R).filter((x) => x.repeats);
  if (flagged.length !== 1 || w.draftLog.filter((x) => x.avoid).length !== 1) fail(`11 a repeating draft is redrafted once with the sentence to avoid, then flagged: ${JSON.stringify(w.draftLog)}`);
  const id = Object.keys(R).find((k) => R[k].repeats);
  const o = await adminPress(w, "approve", id);
  if (o.code !== 409 || !/repeats a sentence/.test(o.j.error || "")) fail(`11 RGA's OK refuses a reply that repeats a sentence from another this month: ${o.code} ${o.j.error}`);
  const e = await adminPress(w, "edit", id, { text: "We appreciate you, and the new gutters look sharp from the street." });
  if (e.code !== 200 || e.j.item.repeats) fail("11 an edit that makes it its own clears the flag");
}

// ───────────────────────── 12 two writers ─────────────────────────
{
  const w = makeWorld({ reviews: [rev("r5", "FIVE", new Date(T0).toISOString()), rev("r6", "FIVE", new Date(T0 + 1000).toISOString())] });
  await drafted(w, "r5");
  w.setNow(T0 + 3 * H);
  // while the watch is about to write, RGA's press lands on r5 (the press itself writes first)
  w.interleave.fn = async () => { const rec = w.T.client_monthly_records[0]; const t = rec.data.tasks[RR.ID]; t.review_replies.r5 = { ...t.review_replies.r5, status: "with_client", rga_ok_at: "2026-11-11T21:00:00Z", v: (t.review_replies.r5.v || 0) + 5 }; rec.updated_at = "someone-else"; };
  await W.tickClient({ client: w.client, now: T0 + 3 * H, deps: w.deps });
  if (w.task().review_replies.r5.status !== "with_client") fail(`12 a press landing between the watch's read and write must not be lost: ${w.task().review_replies.r5.status}`);
}

// ───────────────────────── 13 wiring ─────────────────────────
{
  const toml = read("netlify.toml"), man = read("netlify/functions/_job-manifest.js"), a = read("admin/admin.js"), p = read("portal/portal.js"), fe = read("netlify/functions/flow-execute.js");
  if (!/\[functions\."review-replies-watch"\]\s*\n\s*schedule = "5 \* \* \* \*"/.test(toml)) fail("13 review-replies-watch must be scheduled hourly in netlify.toml");
  if (!/job: "review-replies-watch"[^\n]*cron: "5 \* \* \* \*"/.test(man)) fail("13 System health must list review-replies-watch with the same schedule");
  const fnOf = (src, name) => (src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n}\\n`)) || [""])[0];
  const card = fnOf(a, "wklRepliesCardHtml"), view = fnOf(a, "rrView"), rowFn = fnOf(a, "rrRowHtml");
  if (!/const rrS = \(\) => globalThis\.rgaReviewReplies;/.test(a) || !/rrView\(\)/.test(card) || !/\.adminView\(/.test(view) || !/rrRowHtml\(/.test(card)) fail("13 the admin Monthly 4 card must draw from shared/review-replies.js adminView (wklRepliesCardHtml → rrView → adminView, rows by rrRowHtml)");
  if (!/data-rr-approve/.test(a) || !/data-rr-edit/.test(a) || !/data-rr-retry/.test(a)) fail("13 the admin card must carry Approve, Edit and Try again");
  const click = (a.match(/closest\("\[data-rr-approve\][\s\S]{0,2200}/) || [""])[0], pressFn = fnOf(a, "rrPress");
  if (!/mgBusy\(b, true\);\s*try \{/.test(pressFn) || !/mgBusy\(b, false\)/.test(pressFn) || !/return rrPress\(b, "approve"/.test(click) || !/return rrPress\(b, "retry"/.test(click) || !/mgBusy\(b, true\)/.test(click)) fail("13 Approve / Edit / Try again must spin while they work (mgBusy in rrPress, which every press goes through)");
  if (/wklRepliesCardHtml[\s\S]{0,400}data-wkl-send=/.test(card)) fail("13 the old batch Send for approval must be gone from Monthly 4");
  if (!/rr-sees/.test(card) || !/\.rr-tl\b/.test(read("admin/admin.css"))) fail("13 the admin card must draw the line about what is stored, and the chips have a style");
  // the row is DRAWN (the shipped rrRowHtml with the shipped escapers and button), not grepped: chips, the press, the pill
  try {
    const lift = ["escapeHtml", "escapeAttribute"].map((n) => fnOf(a, n)).join("\n") + "\n" + (a.match(/^const uniBtn = [^\n]*\n/m) || [""])[0] + a.slice(a.indexOf("const RR_SVG = "), a.indexOf("function rrRowHtml(")) + rowFn + "\nreturn rrRowHtml;";
    const rrRowHtml = new Function(lift)();
    const html = rrRowHtml({ id: "r5", state: "you", title: "5 stars · Ana P.", line: "Draft ready.", chips: [{ text: "arrived 10:41 AM" }, { text: "waiting for you 18 min", cls: "you" }], acts: ["approve", "edit"] }, { replies: { r5: { text: "Thank you, Ana." } }, words: { r5: "Loved it." } }, false);
    const live = rrRowHtml({ id: "r6", state: "ok", title: "5 stars · James K.", line: "Seen on Google with our words.", chips: [{ text: "seen 9:54 AM · 1 h 56 min", cls: "ok" }], pill: ["Live", "ok"], acts: [] }, { replies: {} }, false);
    if (!/<span class="rr-tl"><span>arrived 10:41 AM<\/span><span class="you">waiting for you 18 min<\/span><\/span>/.test(html) || !/data-rr-approve="r5"[^>]*>Approve</.test(html) || !/data-rr-edit="r5"[^>]*>Edit</.test(html) || !/Our draft<\/b> Thank you, Ana\./.test(html))
      fail(`13 the drawn RGA's-move row must carry the chips, Approve, Edit and the draft: ${html}`);
    if (!/seen 9:54 AM · 1 h 56 min/.test(live) || !/<span class="rr-pill ok">Live<\/span>/.test(live) || /data-rr-approve/.test(live)) fail(`13 the drawn live row must carry "seen … · 1 h 56 min" and the Live pill, no press: ${live}`);
  } catch (e) { cant(`13 the admin row could not be drawn from the shipped source (${e.message})`); }
  if (!/Who OKs replies to 4 and 5 star reviews\?/.test(p) || !/RGA posts them/.test(p) || !/I OK each one/.test(p) || !/data-rr-choice-save/.test(p)) fail("13 the client's one-time choice card (two options + Save) must be on Ongoing work");
  if (!/Replies to 1, 2 and 3 star reviews always wait for your OK\. You can change this choice any time\./.test(p)) fail("13 the choice card must say 1 to 3 stars always wait and it can change any time");
  if (!/data-rr-approve-client/.test(p) || !/googleCardHtml\(\{ state: "you"/.test((p.match(/function rrApprovalCardHtml[\s\S]*?\n}\n/) || [""])[0])) fail("13 the client's For your approval card must be the tinted Google card (you) with Approve");
  if (!/We post it on Google right after you approve, then check that it shows\./.test(p)) fail("13 the client's card must say what happens after Approve");
  const pc = (p.match(/closest\("\[data-rr-approve-client\][\s\S]{0,2400}/) || [""])[0];
  if (!/const busy = \(on\) => \{ b\.disabled = on; b\.classList\.toggle\("is-busy", on\);/.test(pc) || !/busy\(true\);\s*try \{/.test(pc)) fail("13 the client's Approve and Save must spin while they work (is-busy on the pressed button, set before the request)");
  for (const [f, re, min] of [["admin/admin.js", /shared\/review-replies\.js\?v=(\w+)/, "20261111y"], ["portal/portal.js", /shared\/review-replies\.js\?v=(\w+)/, "20261111y"]]) { const m = re.exec(read(f)); if (!m || m[1] < min) fail(`13 ${f} must load shared/review-replies.js at ?v=${min} or later`); }
  for (const [f, re] of [["admin/index.html", /admin\.js\?v=(\w+)/], ["portal/index.html", /portal\.js\?v=(\w+)/]]) { const m = re.exec(read(f)); if (!m || m[1] < "20261111y") fail(`13 ${f} must load the new build (?v=20261111y or later)`); }
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/—/.test(strip(read("shared/review-replies.js")))) fail("13 no em dash in text a person reads (shared/review-replies.js)");
  if (/Write ONE reply per review[\s\S]{0,400}REVIEW n \\u2192 REPLY[\s\S]{0,800}"m2\.exec\.review_responses"/.test(fe) || !/"m2\.exec\.review_responses": async[\s\S]{0,1400}tickClient\(/.test(fe)) fail("13 the Monthly 4 runner must be one tick of the watch, not the old batch draft");
  if (!/m2\.exec\.review_responses" && decision === "approved" && body\.monthly/.test(read("netlify/functions/admin-deliverables.js"))) fail("13 a batch Send for approval for Monthly 4 must be refused");
  // the one-review drafter: through the one drafting boundary (aiDraft: never invent a fact, US English), about what the customer wrote, never a repeated sentence
  const rrw = read("netlify/functions/_review-replies.js"), prompt = (rrw.match(/FE\.aiDraft\([\s\S]*?\{ maxTokens: \d+ \}\)/) || [""])[0];
  if (!prompt || !/Write ONE reply to this Google review/.test(prompt) || !/refer to what the customer actually wrote/.test(prompt) || !/never offer compensation/.test(prompt) || !/Never reuse a sentence/.test(prompt) || /thank (them )?by name/i.test(prompt) || !/FE\.clientCtx\(client\)/.test(prompt))
    fail("13 the one-review drafter must go through aiDraft with the business's context, write about what the customer wrote, offer no compensation and never reuse a sentence");
  if (/RGA drafts each one\. You approve it first\./.test(p) || /RGA drafts each one; you approve it first\./.test(read("shared/client-monthly.js"))) fail("13 the client's words must no longer promise they approve every reply first");
  if (!/Nothing goes on your website or Google until you approve it/.test(p) || !/except replies to 4 and 5 star reviews/.test(p)) fail("13 For your approval's promise must name the replies RGA posts");
}

if (F.length) { console.error("🔴 review replies within 1 to 2 days:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ review replies: read every 2 hours (7 a day), drafted the same hour, 4/5 stars post on RGA's OK by default, 1 to 3 stars only on the client's, read back, retried, every state said, late rows in To do, no templated replies");
