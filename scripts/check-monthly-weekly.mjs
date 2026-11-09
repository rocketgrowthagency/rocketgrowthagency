#!/usr/bin/env node
// check-monthly-weekly.mjs — MONTHLY SECTION 2, "EVERY WEEK" (approved monthly_s2_weekly_v1, the owner 11-9). Runs the SHIPPED code against FAKES (a fake database behind a fake
// fetch, a fake Google). No network, no model, nothing posted anywhere real.
//   1 the week strips are worked out from DATA (asks by week, skipped weeks, the week now, upcoming), for weekly / every-2-weeks / monthly cadence
//   2 asks are COUNTED, reviews are a result: "This month: N asked · M new reviews"; an unread review count is "not read yet", never 0; no target anywhere
//   3 the admin automation note no longer says review requests are auto-sent
//   4 review replies: an approved reply POSTS ITSELF through the API fake and is READ BACK; an unapproved one is NEVER posted (no call at all); a failure says why and is
//     retried; a reply already on Google is never replaced; Month 1 step 61 uses the same path
//   5 Google posts: "N of M live", plan not a promise, drafts from this month's focus, the client can choose fewer
//   6 New photos: optional, no quota, "N photos live on Google", "Nothing new this month" settles it
//   7 Skip this week (stored per week on the month record, read back, Undo) and Skip this step; the closed month refuses
//   8 titles (admin + playbook + Scraper mirror + client steps) and the wiring (cards, no hand Done, ?v= keys)
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = [], fail = (m) => F.push(m);
const read = (r, base = SITE) => { try { return fs.readFileSync(path.join(base, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));

// ---------- the fake database ----------
function makeDb({ monthly = [], onboarding = [] } = {}) {
  const T = { client_monthly_records: monthly, client_onboarding_records: onboarding, client_activity: [] };
  const err = (code, m) => Object.assign(new Error(`Supabase ${code}: ${m}`), { code });
  async function supa(p, init = {}) {
    const [pth, qs = ""] = p.split("?"), name = pth.slice(1), q = new URLSearchParams(qs), method = init.method || "GET";
    if (!T[name]) throw err(404, `unknown ${name}`);
    const rows = T[name];
    const match = (r) => [...q.entries()].every(([k, v]) => (v.startsWith("eq.") ? String(r[k]) === decodeURIComponent(v.slice(3)) : true));
    if (method === "POST") { const b = JSON.parse(init.body); const row = { id: crypto.randomUUID(), month_status: "open", ...b }; rows.push(row); return [JSON.parse(JSON.stringify(row))]; }
    const hit = rows.filter(match);
    if (method === "PATCH") { const b = JSON.parse(init.body); hit.forEach((r) => Object.assign(r, b)); return JSON.parse(JSON.stringify(hit)); }
    let out = hit.slice().slice(0, Number(q.get("limit")) || 999);
    const sel = q.get("select");
    if (sel && sel !== "*") { const cs = sel.split(","); out = out.map((r) => Object.fromEntries(cs.filter((c) => c in r).map((c) => [c, r[c]]))); }
    return JSON.parse(JSON.stringify(out));
  }
  return { supa, T };
}
const DB = { cur: null };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), base = "https://sb.test/rest/v1";
  if (!u.startsWith(base)) throw new Error(`the gate must not touch the network: ${u}`);
  try { const out = await DB.cur.supa(u.slice(base.length), init); return { ok: true, status: 200, text: async () => (out == null ? "" : JSON.stringify(out)), json: async () => out }; }
  catch (e) { return { ok: false, status: e.code || 500, text: async () => e.message, json: async () => ({}) }; }
};
let W, RP, SKIPW, WEEKLY, OM, STEPS;
try { W = req("../../shared/monthly-weekly.js"); RP = req("./_reply-post.js"); SKIPW = req("./admin-week-skip.js"); WEEKLY = req("./admin-monthly-weekly.js"); OM = req("./_open-month.js"); STEPS = req("../../shared/steps-57-64.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const CID = "11111111-1111-1111-1111-111111111111";
const d = (s) => Date.parse(`${s}T12:00:00Z`);
const MONTH = "2026-12-01";

// 1 + 2 the Review asks card
{
  const asks = ["2026-12-02T10:00:00Z", "2026-12-03T10:00:00Z", "2026-12-04T10:00:00Z", "2026-12-05T10:00:00Z", "2026-11-30T10:00:00Z"];
  const v = W.asksView({ month: MONTH, now: d("2026-12-10"), cadence: "weekly", asks, lists: [], newReviews: 1, skips: {} });
  const txt = v.strip.map((w) => w.text);
  if (txt[0] !== "Wk 1 ✓ 4 asked") fail(`1 week 1 must read done with its count from the data (4 marks inside the month, the Nov 30 mark excluded): ${txt[0]}`);
  if (!/list due/.test(txt[1]) || v.strip[1].cls !== "now") fail(`1 the current week with no list must read "list due": ${txt[1]}`);
  if (txt[2] !== "Wk 3" || txt[3] !== "Wk 4") fail("1 upcoming weeks must read plain");
  if (v.tone !== "wait" || v.skipWeek !== 2) fail("1 a due week with no list is the client's move and offers Skip this week");
  if (!v.rows.some((r) => /Waiting for this week's list/.test(r.title)) || !v.rows.some((r) => /RGA never sends/.test(r.line || ""))) fail("1 the waiting row must say RGA never sends");
  if (!v.rows.some((r) => r.title === "This month: 4 asked · 1 new review")) fail(`2 the month line must count asks and report reviews as a result: ${JSON.stringify(v.rows.map((r) => r.title))}`);
  const v0 = W.asksView({ month: MONTH, now: d("2026-12-10"), cadence: "weekly", asks: [], lists: [], newReviews: null, skips: {} });
  if (!v0.rows.some((r) => /0 asked · new reviews not read yet/.test(r.title))) fail("2 an unread review count must say 'not read yet', never 0");
  if (!/never a target/.test(JSON.stringify(v.rows)) || /(?:of|toward|goal of|target of)\s+\d+\s+(?:new\s+)?reviews|\d+\s+reviews?\s+(?:goal|target|a month)/i.test(JSON.stringify(v.rows))) fail("2 the asks card must say reviews are a result, never a target, and name no review goal");
  const done = W.asksView({ month: MONTH, now: d("2026-12-03"), cadence: "weekly", asks, lists: [], newReviews: 0 });
  if (done.tone !== "ok" || done.skipWeek) fail("1 a week with asks is settled: no client's move, no Skip this week");
  // the client's cadence
  const bi = W.asksView({ month: MONTH, now: d("2026-12-10"), cadence: "biweekly", asks: [], lists: [], newReviews: 0 });
  if (!/no list due/.test(bi.strip[1].text) || bi.skipWeek !== null || bi.tone !== "ok") fail(`1 every-2-weeks: week 2 has no list due, nothing is late: ${JSON.stringify(bi.strip[1])}`);
  const mo = W.asksView({ month: MONTH, now: d("2026-12-20"), cadence: "monthly", asks: [], lists: [], newReviews: 0 });
  if (!/none asked/.test(mo.strip[0].text) || mo.skipWeek !== null) fail("1 monthly: only week 1 is due; a past week with nothing reads 'none asked'");
  if (W.asksView({ month: MONTH, now: d("2026-12-10"), cadence: null, asks: [], lists: [], newReviews: 0 }).cadence !== "Weekly") fail("1 no cadence chosen reads weekly");
  const sk = W.asksView({ month: MONTH, now: d("2026-12-10"), cadence: "weekly", asks: [], lists: [], newReviews: 0, skips: { [W.ID.PUSH]: { 2: { reason: "holiday", by: "c", at: "x" } } } });
  if (!/skipped/.test(sk.strip[1].text) || sk.skipWeek !== null || !sk.rows.some((r) => r.undo === 2)) fail("1 a skipped week reads skipped, offers Undo, and is not asked again");
  const past = W.asksView({ month: "2026-10-01", now: d("2026-12-10"), cadence: "weekly", asks: ["2026-10-02T10:00:00Z"], lists: [], newReviews: 2 });
  if (past.skipWeek !== null || past.strip[0].text !== "Wk 1 ✓ 1 asked" || !past.rows.some((r) => /This month is over/.test(r.title))) fail("1 a past month has no 'this week' and still shows what was asked");
  // the weekly read: timestamps only, never a name or a phone; an unreadable list is null not zero
  const sh = WEEKLY.shape({ month: MONTH, onboarding: { review_cadence: { value: "biweekly" } }, lists: [{ created_at: "2026-12-02T00:00:00Z", customers: [{ name: "Ann", phone: "555", marked_sent_by_client: true, marked_sent_at: "2026-12-03T00:00:00Z" }, { name: "Bob" }] }],
    live: { status: "ok", times: ["2026-12-04T00:00:00Z", "2026-11-04T00:00:00Z"] }, photos: [{ publish_state: "published", created_at: "2026-12-05T00:00:00Z" }, { publish_state: "queued", created_at: "2026-12-05T00:00:00Z" }] });
  if (sh.cadence !== "biweekly" || sh.asks.length !== 1 || sh.newReviews !== 1 || sh.photosLive !== 1) fail(`2 the weekly read must count asks, this month's new reviews and photos Google shows: ${JSON.stringify(sh)}`);
  if (/Ann|Bob|555/.test(JSON.stringify(sh))) fail("2 the weekly read must carry timestamps only, no customer name or phone");
  const sh0 = WEEKLY.shape({ month: MONTH, onboarding: null, lists: null, live: { status: "could_not_read", times: [] }, photos: null });
  if (sh0.asks !== null || sh0.newReviews !== null || sh0.photosLive !== null) fail("2 an unreadable source is null, never 0");
  if (WEEKLY.shape({ month: MONTH, onboarding: null, lists: [], live: { status: "ok", times: ["2026-12-04T00:00:00Z", null] }, photos: [] }).newReviews !== null) fail("2 a review with no date makes the count unprovable: null");
}

// 3 the wrong automation note
{
  const a = read("admin/admin.js");
  if (/Auto-sends review requests/.test(a)) fail("3 the admin still says review requests are auto-sent");
  const note = (a.match(/"m2\.exec\.review_push":\s*\{[^}]*\}/) || [""])[0];
  if (!/client sends|CLIENT sends/.test(note) || !/never sends/.test(note)) fail(`3 the automation note must say the client sends and RGA never does: ${note}`);
}

// 4 the replies
const tick = (o = {}) => ({
  status: "in_progress", ran_at: "2026-12-08T08:00:00Z",
  auto_result: { outcome_data: { reviews: { status: "ok", open: 2, drafted: 2, drafted_ids: ["r1", "r2"], read_at: "2026-12-08T08:00:00Z" } } },
  internal_review: { decision: "approved", drafted_ids: ["r1", "r2"] },
  approval: { decision: "approved", at: "2026-12-08T12:00:00Z", drafted_ids: ["r1", "r2"], approved_content: "2 unanswered review(s):\n\nREVIEW 1 → REPLY: Thank you, Sam. We are glad it went well.\n\nREVIEW 2 → REPLY: Thanks for telling us, Pat. Please call us so we can put it right." },
  ...o });
function fakeGoogle({ existing = {}, putStatus = {}, readFail = false, consent = true } = {}) {
  const log = [], store = { ...existing };
  return { log, store, deps: {
    consent: async () => { log.push("consent"); return consent; },
    read: async (id) => { log.push(`read:${id}`); if (readFail) return { ok: false, status: 500 }; return store[id] ? { ok: true, replied: true, comment: store[id] } : { ok: true, replied: false }; },
    put: async (id, text) => { log.push(`put:${id}`); const s = putStatus[id]; if (s && s !== 200) return { ok: false, status: s }; store[id] = text; return { ok: true, status: 200 }; },
    ledger: async (e) => { log.push(`ledger:${e.id}:${e.live}`); },
  } };
}
{
  const p = RP.parseReplies(tick().approval.approved_content);
  if (p.length !== 2 || p[0].n !== 1 || p[1].n !== 2 || !/^Thank you, Sam/.test(p[0].text) || /REVIEW/.test(p[1].text)) fail(`4 the approved words must parse into one reply per review: ${JSON.stringify(p)}`);
  // approval -> post -> read back
  let g = fakeGoogle();
  let r = await RP.postApproved({ task: tick(), record: {}, now: d("2026-12-08"), deps: g.deps });
  if (r.reply_posts.r1?.status !== "live" || r.reply_posts.r2?.status !== "live") fail(`4 an approved reply must be posted and read back as live: ${JSON.stringify(r.reply_posts)}`);
  if (g.store.r1 !== "Thank you, Sam. We are glad it went well.") fail("4 the words posted must be exactly the words the client approved");
  const order = g.log.filter((x) => /^(read|put):r1/.test(x));
  if (order.join() !== "read:r1,put:r1,read:r1") fail(`4 each reply is read first, posted, then read back: ${order.join()}`);
  // unapproved: NEVER posted, not even a read
  for (const [name, t] of [["no client approval", tick({ approval: undefined })], ["changes requested", tick({ approval: { ...tick().approval, decision: "changes_requested" } })],
    ["RGA never sent it", tick({ internal_review: { decision: "rejected" } })], ["no approved words", tick({ approval: { ...tick().approval, approved_content: "" } })],
    ["approved for other reviews", tick({ approval: { ...tick().approval, drafted_ids: ["r9"] } })], ["replies don't line up", tick({ approval: { ...tick().approval, approved_content: "REVIEW 1 → REPLY: only one" } })]]) {
    g = fakeGoogle();
    r = await RP.postApproved({ task: t, record: {}, now: d("2026-12-08"), deps: g.deps });
    if (g.log.length || r.attempted) fail(`4 ${name}: nothing may be posted and Google must not be touched: ${g.log.join()}`);
    if (!r.problem) fail(`4 ${name}: the refusal must say why`);
  }
  // a failure says why and is retried
  g = fakeGoogle({ putStatus: { r2: 503 } });
  r = await RP.postApproved({ task: tick(), record: {}, now: d("2026-12-08"), deps: g.deps });
  if (r.reply_posts.r1.status !== "live" || r.reply_posts.r2.status !== "failed" || !/503/.test(r.reply_posts.r2.why) || r.reply_posts.r2.tries !== 1) fail(`4 a failed post says why (the code) and counts the try: ${JSON.stringify(r.reply_posts)}`);
  const g2 = fakeGoogle(); const putsBefore = g2.log.length;
  r = await RP.postApproved({ task: tick(), record: r.reply_posts, now: d("2026-12-09"), deps: g2.deps });
  if (r.reply_posts.r2.status !== "live" || r.reply_posts.r2.tries !== 2) fail(`4 the next run must retry the failed reply: ${JSON.stringify(r.reply_posts)}`);
  if (g2.log.some((x) => x === "put:r1")) fail("4 a reply already live must not be posted again");
  // stops after MAX_TRIES and says so
  let rec = {}; const gb = fakeGoogle({ putStatus: { r1: 403, r2: 403 } });
  for (let i = 0; i < RP.MAX_TRIES + 2; i++) rec = (await RP.postApproved({ task: tick(), record: rec, now: d("2026-12-08") + i, deps: gb.deps })).reply_posts;
  if (rec.r1.tries !== RP.MAX_TRIES) fail(`4 retrying must stop at ${RP.MAX_TRIES}: ${rec.r1.tries}`);
  if (!/reconnected/.test(rec.r1.why)) fail("4 a refused write must say the account may need reconnecting");
  // never replaces a reply that is already there
  g = fakeGoogle({ existing: { r1: "Their own reply" } });
  r = await RP.postApproved({ task: tick(), record: {}, now: d("2026-12-08"), deps: g.deps });
  if (g.log.includes("put:r1") || g.store.r1 !== "Their own reply" || r.reply_posts.r1.status !== "held") fail(`4 a reply already on Google must be left alone and said: ${JSON.stringify(r.reply_posts.r1)}`);
  // can't read first -> no blind PUT; no consent -> no call
  g = fakeGoogle({ readFail: true });
  r = await RP.postApproved({ task: tick(), record: {}, now: d("2026-12-08"), deps: g.deps });
  if (g.log.some((x) => x.startsWith("put:")) || r.reply_posts.r1.status !== "failed") fail("4 if Google's current reply can't be read, nothing is replaced blind");
  g = fakeGoogle({ consent: false });
  r = await RP.postApproved({ task: tick(), record: {}, now: d("2026-12-08"), deps: g.deps });
  if (g.log.some((x) => /^(put|read):/.test(x)) || !/authorization/.test(r.reply_posts.r1.why)) fail("4 without the client's authorization nothing is read or posted, and it says so");
  // posted but not yet showing -> "posted", then live from the morning read
  const gp = { ...fakeGoogle() }; let seen = false;
  gp.deps.read = async (id) => (seen && gp.store[id] ? { ok: true, replied: true, comment: gp.store[id] } : { ok: true, replied: false });
  gp.deps.put = async (id, text) => { gp.store[id] = text; return { ok: true, status: 200 }; };
  r = await RP.postApproved({ task: tick(), record: {}, now: d("2026-12-08"), deps: gp.deps });
  if (r.reply_posts.r1.status !== "posted") fail("4 a reply Google doesn't show yet must read 'posted' (waiting), not live");
  const c = RP.confirmFromRead(r.reply_posts, [{ id: "r1", replied: true }, { id: "r2", replied: false }], d("2026-12-09"));
  if (c.reply_posts.r1.status !== "live" || c.reply_posts.r2.status !== "posted") fail("4 Google's morning read turns posted into live, only for the review it shows");
  // the card
  const vt = tick({ reply_posts: { r1: { status: "live" }, r2: { status: "failed", why: "Google answered 503", tries: 1 } } });
  const v = W.repliesView({ month: MONTH, now: d("2026-12-09"), task: vt, skips: {} });
  if (!v.rows.some((x) => /1 reply live/.test(x.title)) || !v.rows.some((x) => /didn't post/.test(x.title) && /503/.test(x.line) && /tries again/.test(x.line))) fail(`4 the card must show what is live and why a reply didn't post: ${JSON.stringify(v.rows)}`);
  const drafted = W.repliesView({ month: MONTH, now: d("2026-12-09"), task: { auto_result: { outcome_data: { reviews: { status: "ok", open: 1, drafted: 1, drafted_ids: ["r1"] } } } }, skips: {} });
  if (!drafted.send || !drafted.edit || drafted.tone !== "you") fail("4 a drafted reply offers Send for approval and Edit");
  const stale = W.repliesView({ month: MONTH, now: d("2026-12-09"), task: tick({ auto_result: { outcome_data: { reviews: { status: "ok", open: 1, drafted: 1, drafted_ids: ["r3"] } } } }), skips: {} });
  if (!stale.send) fail("4 a new round of drafts needs a new Send for approval (an old answer belongs to other reviews)");
  const quiet = W.repliesView({ month: MONTH, now: d("2026-12-09"), task: { auto_result: { outcome_data: { reviews: { status: "ok", open: 0, drafted: 0, drafted_ids: [] } } } }, skips: {} });
  if (quiet.rows[0].title !== "No new review this week" || quiet.tone !== "ok") fail("4 a quiet week reads 'No new review this week'");
  const cant = W.repliesView({ month: MONTH, now: d("2026-12-09"), task: { auto_result: { outcome_data: { reviews: { status: "could_not_read", why: "Google didn't answer" } } } }, skips: {} });
  if (/No new review/.test(JSON.stringify(cant.rows)) || !/never read as no reviews/.test(JSON.stringify(cant.rows))) fail("4 a failed read is 'can't tell', never 'no new review'");
  // wiring: the approval path posts, for BOTH steps, and step 61 retries
  const pd = read("netlify/functions/portal-deliverables.js"), fe = read("netlify/functions/flow-execute.js");
  if (!/_reply-post"\)\.REPLY_KEYS\.includes\(key\)/.test(pd) || !/runForTask\(/.test(pd)) fail("4 portal-deliverables must post an approved reply");
  if (JSON.stringify(RP.REPLY_KEYS) !== JSON.stringify(["m1.review.response", "m2.exec.review_responses"])) fail("4 Month 1 step 61 and the weekly step must share the posting path");
  if ((fe.match(/replyPostingRun\(\{ prevTask/g) || []).length < 2 || !/async function replyPostingRun/.test(fe)) fail("4 both runners (step 61 and the weekly step) must retry through replyPostingRun");
  if (!/approval\.drafted_ids = /.test(pd) || !/drafted_ids:/.test(read("netlify/functions/admin-deliverables.js"))) fail("4 both gates must record which reviews the answer was for");
  const s61 = STEPS.reviewsView({ outcome_data: { reviews: { status: "ok", total: 3, open: 2, drafted: 2, replied_live: 1, read_at: "2026-12-08T00:00:00Z" }, reply_posts: { r1: { status: "failed", why: "Google answered 503", tries: 2 } } }, approval: { decision: "approved" } }, {});
  if (!s61.rows.some((x) => /posting on Google/.test(x.title)) || !s61.rows.some((x) => /didn't post/.test(x.title))) fail("4 Month 1 step 61's card must show the same posting and failures");
  if (s61.rows.some((x) => /Post each reply on Google/.test(x.line || ""))) fail("4 step 61 must no longer ask RGA to post by hand");
}

// 5 Google posts
{
  const drafts = [1, 2, 3, 4].map((w) => ({ week: w, headline: `Post ${w}`, body: "b" }));
  const task = { auto_result: { outcome_data: { posts: drafts } }, internal_review: { decision: "approved" }, approval: { decision: "approved" },
    post_queue: [{ week: 1, status: "live", headline: "a" }, { week: 2, status: "live", headline: "b" }, { week: 3, status: "scheduled", headline: "c" }, { week: 4, status: "scheduled", headline: "d" }] };
  const v = W.postsView({ month: MONTH, now: d("2026-12-16"), task, plan: { focus: "Reviews" }, skips: {} });
  if (v.live !== 2 || v.total !== 4 || v.label !== "2 of 4 live" || v.when !== "plan, not a promise") fail(`5 the card must read "2 of 4 live" and "plan, not a promise": ${v.label} / ${v.when}`);
  if (v.strip[0].text !== "Wk 1 ✓ live" || !/queued/.test(v.strip[2].text)) fail(`5 the strip must come from the posts Google shows: ${JSON.stringify(v.strip)}`);
  const dr = W.postsView({ month: MONTH, now: d("2026-12-16"), task: { auto_result: { outcome_data: { posts: drafts.slice(0, 2) } } }, plan: { focus: "Reviews" }, skips: {} });
  if (!dr.send || !dr.edit || !dr.rows.some((r) => /drafted from this month's focus \(Reviews\)/.test(r.title))) fail("5 drafts must come from this month's focus and offer Send for approval / Edit");
  const fewer = W.postsView({ month: MONTH, now: d("2026-12-16"), task: { ...task, posts_wanted: 2, post_queue: task.post_queue.slice(0, 2) }, plan: null, skips: {} });
  if (fewer.total !== 2 || fewer.label !== "2 of 2 live") fail("5 the client can choose fewer: the total follows");
  if (W.TITLES["m2.exec.gbp_posts"] !== "Google posts") fail("5 the title is 'Google posts'");
  if (!v.rows.some((r) => /read back from the profile/.test(r.title))) fail("5 live posts are read back from the profile");
}

// 6 photos
{
  const v = W.photosView({ month: MONTH, task: {}, live: 2 });
  if (!v.rows.some((r) => r.title === "2 photos live on Google") || v.tone !== "ok") fail("6 'N photos live on Google', read back");
  if (!v.rows.some((r) => r.title === "No quota")) fail("6 no quota");
  const none = W.photosView({ month: MONTH, task: {}, live: 0 });
  if (!none.canSettleNothing || none.tone === "ok") fail("6 no photos yet: optional, 'Nothing new this month' available");
  if (W.photosView({ month: MONTH, task: {}, live: null }).rows[0].title !== "Photos on Google not read yet") fail("6 an unread count is 'not read yet', never 0");
  if (!W.photosView({ month: MONTH, task: { outcome_data: { nothing_new: true } }, live: 0 }).nothing) fail("6 'Nothing new this month' settles it");
  if (/\b5\+|quota of|at least 5/i.test(JSON.stringify(v)) || W.TITLES["m2.exec.gbp_photos"] !== "New photos") fail("6 title 'New photos', no 5+");
}

// 7 skip week / skip step / nothing new
{
  const MON = () => ({ id: "m1", client_id: CID, reporting_month: MONTH, month_status: "open", data: { tasks: {} } });
  DB.cur = makeDb({ monthly: [MON()], onboarding: [{ id: "ob", client_id: CID, data: { tasks: {} } }] }); OM.__resetDetect();
  const mk = (extra = {}) => ({ supa: DB.cur.supa, now: () => d("2026-12-10"), gate: { email: "chris@x" }, record: async (o) => { (mk.log ||= []).push(o); return {}; }, ...extra });
  const press = async (b) => { SKIPW.__useDeps(mk()); const o = await SKIPW.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, month: MONTH, ...b }) }); return { code: o.statusCode, body: JSON.parse(o.body) }; };
  let o = await press({ step_id: W.ID.PUSH, action: "skip_week", week: 2, reason: "Closed for the holiday" });
  const stored = () => DB.cur.T.client_monthly_records[0].data;
  if (o.code !== 200 || !stored().week_skips || stored().week_skips[W.ID.PUSH]["2"].reason !== "Closed for the holiday") fail(`7 Skip this week must store the week on the month record: ${JSON.stringify(o)}`);
  if (stored().week_skips[W.ID.PUSH]["2"].by !== "chris@x") fail("7 the skip says who");
  o = await press({ step_id: W.ID.PUSH, action: "skip_week", week: 2, reason: "again" });
  if (o.code === 200) fail("7 a week already skipped must refuse");
  o = await press({ step_id: W.ID.POSTS, action: "skip_week", week: 3, reason: "away" });
  if (o.code !== 200 || stored().week_skips[W.ID.PUSH]["2"] === undefined || stored().week_skips[W.ID.POSTS]["3"] === undefined) fail("7 each step keeps its own weeks");
  for (const [b, why] of [[{ step_id: W.ID.PUSH, action: "skip_week", week: 5, reason: "x" }, "week 5"], [{ step_id: W.ID.PUSH, action: "skip_week", week: 1, reason: "  " }, "no reason"],
    [{ step_id: W.ID.PHOTOS, action: "skip_week", week: 1, reason: "x" }, "photos have no weeks"], [{ step_id: W.ID.PUSH, action: "nothing_new" }, "nothing_new on asks"], [{ step_id: "m2.snap.rank_tracker", action: "skip_week", week: 1, reason: "x" }, "not a weekly step"]]) {
    o = await press(b); if (o.code === 200) fail(`7 must refuse: ${why}`);
  }
  o = await press({ step_id: W.ID.PUSH, action: "unskip_week", week: 2 });
  if (o.code !== 200 || stored().week_skips[W.ID.PUSH]["2"]) fail("7 Undo must bring the week back");
  // New photos: Nothing new this month
  o = await press({ step_id: W.ID.PHOTOS, action: "nothing_new" });
  const pt = () => stored().tasks[W.ID.PHOTOS];
  if (o.code !== 200 || pt().status !== "done" || !pt().outcome_data.nothing_new) fail(`7 'Nothing new this month' must settle New photos: ${JSON.stringify(o)}`);
  o = await press({ step_id: W.ID.PHOTOS, action: "undo_nothing_new" });
  if (o.code !== 200 || (pt().status === "done") || pt().outcome_data.nothing_new) fail("7 Undo must bring New photos back open");
  // "Skip this step…" is the existing step skip, and works on all four
  const SKIPFN = req("./admin-step-skip.js");
  for (const id of W.IDS) {
    SKIPFN.__useDeps({ supa: DB.cur.supa, now: () => d("2026-12-10"), gate: { email: "c" }, record: async () => ({}) });
    const s = await SKIPFN.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, month: MONTH, step_id: id, action: "skip", reason: "not this client" }) });
    if (s.statusCode !== 200 || stored().tasks[id].status !== "skipped") fail(`7 Skip this step must work on ${id}: ${s.body}`);
  }
  // a closed month refuses
  DB.cur.T.client_monthly_records[0].month_status = "closed"; OM.__resetDetect();
  o = await press({ step_id: W.ID.PUSH, action: "skip_week", week: 3, reason: "x" });
  if (o.code !== 409) fail(`7 a closed month must refuse: ${o.code}`);
  if (!(mk.log || []).some((r) => r.kind === "week_skipped")) fail("7 each press is recorded");
}

// 8 titles + wiring
{
  const pb = JSON.parse(read("data/playbooks/playbooks.json")).month2plus, mirror = read("flow/playbooks/month2plus.mjs", SCR);
  const want = { "m2.exec.review_push": "Review asks", "m2.exec.review_responses": "Review replies", "m2.exec.gbp_posts": "Google posts", "m2.exec.gbp_photos": "New photos" };
  for (const [id, t] of Object.entries(want)) {
    const s = pb.find((x) => x.id === id);
    if (!s || s.title !== t) fail(`8 ${id} must be titled "${t}": ${s && s.title}`);
    if (!new RegExp(`id: "${id.replace(/\./g, "\\.")}", title: "${t}"`).test(mirror)) fail(`8 the Scraper mirror must carry "${t}" for ${id}`);
  }
  const cs = JSON.parse(read("data/playbooks/client-steps.json"));
  const flat = JSON.stringify(cs);
  if (/Add 5\+|Post 4 GBP|Add new photos|Ask this month's customers|Respond to all new reviews|New photos \(suggested\)/.test(flat + JSON.stringify(pb))) fail("8 an old title or quota is still in the playbook or the client steps");
  const a = read("admin/admin.js"), html = read("admin/index.html");
  for (const [id, fn] of [["m2.exec.review_push", "wklAsksCardHtml"], ["m2.exec.review_responses", "wklRepliesCardHtml"], ["m2.exec.gbp_posts", "wklPostsCardHtml"], ["m2.exec.gbp_photos", "wklPhotosCardHtml"]])
    if (!new RegExp(`id === "${id.replace(/\./g, "\\.")}" \\? ${fn}\\(\\)`).test(a)) fail(`8 ${id}'s card is not wired into rowStepCardsHtml`);
  if (!/import "\/shared\/monthly-weekly\.js\?v=/.test(a)) fail("8 the admin must load shared/monthly-weekly.js");
  for (const id of W.IDS) if (!STEPS.noHandDone(id)) fail(`8 ${id} must have no hand Mark step complete`);
  if (!/admin\.js\?v=20261109q/.test(html) || !/admin\.css\?v=20261109f/.test(html) || !/steps-57-64\.js\?v=20261109g/.test(a)) fail("8 the ?v= keys were not bumped");   // updated on purpose by monthly_s3_monthly_v1 (11-9): admin.js q, admin.css f, steps-57-64 g
  if (!/Skip this week…/.test(a) || !/Nothing new this month/.test(a) || !/Send for approval/.test(a)) fail("8 the cards must carry Skip this week, Nothing new this month and Send for approval");
  if (!/mw-strip/.test(read("admin/admin.css"))) fail("8 the week strip has no style");
  if (/—/.test(read("shared/monthly-weekly.js").replace(/^\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) fail("8 no em dash in text a person reads");
}

if (F.length) { console.error(`🔴 check-monthly-weekly: ${F.length} problem(s)\n - ${F.join("\n - ")}`); process.exit(1); }
console.log("✅ check-monthly-weekly: week strips from data, asks counted, the automation note fixed, approved replies post and read back (never unapproved, failures retried), posts, photos, skip week / step, titles all hold");
