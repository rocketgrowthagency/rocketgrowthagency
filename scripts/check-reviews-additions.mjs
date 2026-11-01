#!/usr/bin/env node
// check-reviews-additions.mjs — the "build now" parts of the approved Reviews additions (reports/mockups/reviews_additions_v1.html, 11-01).
//
// WHAT IT HOLDS
//  1. WORDING: the review-message hint says the CLIENT sends it; the reply recipe refers to what the customer wrote (no "thank by name");
//     the fake-review line no longer says "Google detects it"; the empty instructions field is filled. Playbook, projected client steps
//     and the reply prompt agree.
//  2. THE LIVE CHECK (_reply-live.js): a reply is "live" only when Google's own read shows it; sent-and-not-showing waits 3 days and then asks
//     a person; a review we can't see, or no read at all, is `unknown` and never live and never not_showing. Only ids and answers are kept
//     (the 30-day rule: no review words, no reviewer). RGA is told once, through notify-rga, and a delivered:false is asked again.
//     A test client is checked and never alerted. The client's "What RGA did" line says Replied only for a reply seen live.
//  3. THE FUNNEL (_review-funnel.js): asked · reminded once · asked to stop · became a review, last 90 days, from the client's own marks;
//     unreadable lists and "nobody has looked" are null / "Not known yet", never 0; RGA only, the client is refused.
// Runs the SHIPPED modules against a fake Supabase / fake Google: no network, no production data, no real Google profile.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SUPABASE_ANON_KEY: "a", QUO_WEBHOOK_TOKEN: "t", INTERNAL_FN_SECRET: "s" });
let route = null;
globalThis.fetch = async (url, init = {}) => route(String(url), init);
const req = createRequire(`${SITE}/netlify/functions/`);
let RL, RF, RM, CF;
try { RL = req("./_reply-live.js"); RF = req("./_review-funnel.js"); RM = req("./refresh-review-metrics.js"); CF = req("./_client-feed.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a reviews module did not load: ${e.message}`); process.exit(2); }
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const DAY = 864e5, NOW = Date.parse("2026-11-10T12:00:00Z"), iso = (d) => new Date(NOW + d * DAY).toISOString();

// ── 1 · wording ──
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const step = (id) => [...PB.month1, ...PB.month2plus].find((s) => s.id === id);
const sys = step("m1.review.system"), resp = step("m1.review.response"), m2 = step("m2.exec.review_responses"), first5 = step("m1.review.first_5");
if (!sys || /we'll send/i.test(sys.clientHint || "") || !/you send/i.test(sys.clientHint || "")) fail(`the review-message hint still says RGA sends it: ${sys && sys.clientHint}`);
if (!resp || /thank by name/i.test(resp.instructions || "") || !/what the customer actually wrote/i.test(resp.instructions || "")) fail("the reply recipe still says thank by name");
if (!/seen live|live on Google|live/i.test((resp && resp.instructions) || "")) fail("the reply step doesn't say a reply counts only once seen live");
if (!m2 || !String(m2.instructions || "").trim()) fail("the month-2 reply step has no instructions");
else if (!/live/i.test(m2.instructions) || !/replied|reply/i.test(m2.instructions)) fail("the month-2 reply instructions don't point at the live check");
if (/Google detects it/i.test((first5 && first5.clientInstructions) || "") || !/FTC rule forbids it/.test((first5 && first5.clientInstructions) || "")) fail("the fake-review line still says Google detects it");
const CS = JSON.parse(read("data/playbooks/client-steps.json"));
if (/Google detects it/i.test(JSON.stringify(CS))) fail("the projected client steps still say Google detects it");
if (/thank by name/i.test(read("netlify/functions/flow-execute.js"))) fail("the reply drafter still tells the model to thank by name");
for (const f of ["data/playbooks/playbooks.json"]) if (/—/.test(`${(sys && sys.clientHint) || ""}${(m2 && m2.instructions) || ""}`)) fail("new review wording uses an em dash");

// ── 2 · the live check ──
const posted = (id, d) => ({ review_id: id, posted_at_ms: NOW + d * DAY });
const C = (id, d, reviews, before) => RL.classify(posted(id, d), reviews, NOW, before).status;
const cases = [
  ["a reply Google shows, updated after we posted → live", C("a", -1, [{ id: "a", replied_at: iso(-0.9) }]), "live"],
  ["shows, updated a few minutes BEFORE our clock → still live (skew)", C("a", -1, [{ id: "a", replied_at: new Date(NOW - DAY - 5 * 60000).toISOString() }]), "live"],
  ["only an OLDER reply shows, 1 day after posting → waiting, not live", C("a", -1, [{ id: "a", replied_at: iso(-30) }]), "waiting"],
  ["not showing, 1 day → waiting", C("a", -1, [{ id: "a", replied_at: null }]), "waiting"],
  ["not showing, 4 days → not_showing", C("a", -4, [{ id: "a", replied_at: null }]), "not_showing"],
  ["not showing exactly 3 days → not_showing", C("a", -3, [{ id: "a", replied_at: null }]), "not_showing"],
  ["review not in the list → unknown, not not_showing", C("a", -9, [{ id: "z", replied_at: null }]), "unknown"],
  ["no list read at all → unknown, not live and not not_showing", C("a", -9, null), "unknown"],
  ["an empty list → unknown", C("a", -9, []), "unknown"],
];
for (const [n, got, want] of cases) if (got !== want) fail(`reply check: ${n} — got ${got}`);
const keep = RL.classify(posted("a", -5), [{ id: "a", replied_at: iso(-4) }], NOW, { status: "live", seen_at: iso(-2) });
if (keep.seen_at !== iso(-2)) fail("the first time a reply was seen live is lost on the next read");
const rows = [{ target: "reply:a", occurred_at: iso(-6) }, { target: "reply:a", occurred_at: iso(-2) }, { target: "reply:b", occurred_at: iso(-1) }, { target: "description", occurred_at: iso(-1) }, { target: "reply:bad", occurred_at: "nope" }];
const pr = RL.postedReplies(rows);
if (pr.length !== 2 || pr.find((x) => x.review_id === "a").posted_at_ms !== NOW - 2 * DAY) fail(`postedReplies: ${JSON.stringify(pr)}`);
const sm = RL.summarize([{ status: "live" }, { status: "waiting" }, { status: "not_showing" }, { status: "unknown" }]);
if (sm.posted !== 4 || sm.live !== 1 || sm.waiting !== 1 || sm.not_showing !== 1 || sm.unknown !== 1) fail(`summarize: ${JSON.stringify(sm)}`);
if (RL.lineFor(null) !== null || RL.lineFor({ posted: 0, live: 0 }) !== null) fail("with no stored check or no replies the card makes a statement");
if (/^Replied/.test(RL.lineFor({ posted: 2, live: 0 }).head)) fail("the card says Replied when nothing is live");
if (!/^Replied/.test(RL.lineFor({ posted: 2, live: 2 }).head) || !/2 of 3 are live/.test(RL.lineFor({ posted: 3, live: 2 }).detail)) fail("the card doesn't count live replies");
if (/rejected/i.test(JSON.stringify(RL.alertText(2))) || !/doesn't say why/.test(RL.alertText(2))) fail("the alert claims a cause Google's read doesn't give");

// runForClient against fake deps
async function once({ reviews, ledger, prev, delivered, dry = false }) {
  const calls = { writes: [], notified: [] };
  const deps = { now: () => NOW,
    supa: async (p, init = {}) => {
      if (init.method === "POST") { calls.writes.push(JSON.parse(init.body)); return null; }
      if (p.startsWith("/client_change_log")) return ledger;
      if (p.includes("surface=eq.review_replies")) return prev ? [{ payload: prev }] : [];
      return []; },
    notify: async (kind, cid, msg) => { calls.notified.push({ kind, cid, msg }); if (delivered === "throw") throw new Error("down"); return { delivered }; } };
  const out = await RL.runForClient({ clientId: "c1", reviews, deps, dry });
  return { out, calls };
}
const L1 = [{ target: "reply:a", occurred_at: iso(-5) }];
let r = await once({ reviews: null, ledger: L1, delivered: true });
if (r.calls.writes.length || r.calls.notified.length || !r.out.skipped) fail("no reviews read still stored or alerted");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: L1, delivered: true });
if (r.calls.writes.length !== 1 || r.calls.notified.length !== 1) fail(`a reply not showing after 5 days: ${r.calls.writes.length} writes, ${r.calls.notified.length} alerts`);
const stored = r.calls.writes[0] && r.calls.writes[0].payload;
if (JSON.stringify(stored || {}).match(/"(text|comment|name|reviewer|body)"/)) fail("the stored check keeps review words or a reviewer (30-day rule)");
if (!stored || stored.items[0].told !== true) fail("an alert that was delivered is not recorded as told");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: L1, prev: stored, delivered: true });
if (r.calls.notified.length) fail("RGA is told again every morning about the same reply");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: L1, delivered: false });
if (r.out.not_told !== 1 || r.out.told !== 0 || r.calls.writes[0].payload.items[0].told !== false) fail("delivered:false is counted as told");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: L1, prev: r.calls.writes[0].payload, delivered: true });
if (r.calls.notified.length !== 1) fail("a reply RGA was NOT told about is not asked again");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: L1, delivered: "throw" });
if (r.out.not_told !== 1) fail("a throwing notify counts as told");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: L1, delivered: true, dry: true });
if (r.calls.writes.length || r.calls.notified.length) fail("a dry run writes or alerts");
r = await once({ reviews: [{ id: "a", replied_at: iso(-4) }], ledger: L1, delivered: true });
if (r.out.live !== 1 || r.calls.notified.length) fail("a live reply alerts or isn't counted");
r = await once({ reviews: [{ id: "a", replied_at: null, text: "Great work", name: "Sam" }], ledger: [], delivered: true });
if (r.calls.writes.length) fail("a client with no posted reply stores a check");

// the morning read: a test client is checked and never alerted; a real one is told once
async function morning(source) {
  const rec = { notify: 0, snaps: [] };
  route = async (url, init) => {
    const m = init.method || "GET";
    if (url.includes("notify-rga")) { rec.notify++; return res(200, { delivered: true }); }
    if (url.includes("/rest/v1/clients?") && m === "GET") return res(200, [{ id: "c1", business_name: "Test Co", workspace_id: "w", google_place_id: null, source }]);
    if (url.includes("/rest/v1/clients?") && m === "PATCH") return res(204, "");
    if (url.includes("client_google_oauth")) return res(200, [{ client_id: "c1", refresh_token: "x", access_token: "tok", access_token_expires_at: new Date(Date.now() + 36e5).toISOString(), gbp_location_id: "accounts/1/locations/2" }]);
    if (url.includes("mybusiness.googleapis.com")) return res(200, { totalReviewCount: 1, averageRating: 5, reviews: [{ reviewId: "a", createTime: new Date(Date.now() - 9 * DAY).toISOString(), starRating: "FIVE", comment: "Great", reviewer: { displayName: "Sam" } }] });
    if (url.includes("/client_change_log")) return res(200, [{ target: "reply:a", occurred_at: new Date(Date.now() - 5 * DAY).toISOString() }]);
    if (url.includes("client_state_snapshots") && m === "POST") { rec.snaps.push(JSON.parse(init.body)); return res(201, ""); }
    if (url.includes("client_state_snapshots")) return res(200, []);
    return res(404, "not faked: " + url);
  };
  const out = await RM.handler({ queryStringParameters: { token: "t", clientId: "c1" } });
  return { rec, body: JSON.parse(out.body) };
}
let mo = await morning(null);
if (!mo.rec.snaps.some((s) => s.surface === "review_replies")) fail(`the morning read doesn't store the reply check: ${JSON.stringify(mo.body.results && mo.body.results[0] && mo.body.results[0].replies)}`);
if (mo.rec.notify !== 1) fail(`a real client's reply not showing alerts ${mo.rec.notify} time(s), not once`);
mo = await morning("test:fixture");
if (mo.rec.notify) fail("a test client's reply alerts RGA");
if (mo.rec.snaps.some((s) => s.surface === "review_replies")) fail("a test client's reply check is stored as real");

// the client's feed
const REPLY_STEP = "m1.review.response";
const ev = (id, d) => ({ kind: "flow_step_done", payload: { step_id: id, status: "done" }, occurred_at: iso(d) });
const ids = (replies) => CF.feedLines([ev(REPLY_STEP, -1), ev("m1.review.system", -1)], { days: 14, now: NOW, replies }).map((x) => x.step_id);
if (ids(null).includes(REPLY_STEP) || ids(undefined).includes(REPLY_STEP)) fail("the client's feed says Replied with no stored check");
if (ids({ posted: 2, live: 0 }).includes(REPLY_STEP)) fail("the client's feed says Replied when nothing is live");
if (!ids({ posted: 2, live: 1 }).includes(REPLY_STEP)) fail("the client's feed hides a reply that is live");
const partial = CF.feedLines([ev(REPLY_STEP, -1)], { days: 14, now: NOW, replies: { posted: 3, live: 2 } })[0];
if (!partial || !/2 of 3 are live/.test(partial.line)) fail("a partly live feed line doesn't count them");
if (!ids(null).includes("m1.review.system")) fail("gating replies hides unrelated feed lines");

// ── 3 · the funnel ──
const cu = (d, x = {}) => ({ first_name: "A", marked_sent_by_client: true, marked_sent_at: iso(d), ...x });
const fl = (cs, o = {}) => RF.funnelFrom(cs, { now: NOW, ...o });
let f = fl([cu(-10), cu(-20, { reminded_at: iso(-15) }), cu(-30, { stopped: true, stopped_at: iso(-29) }), cu(-40, { reviewed_mark: true }), cu(-100, { reviewed_mark: true }), { first_name: "B" }, cu(-12, { marked_sent_by_client: false })]);
if (f.asked !== 4 || f.reminded !== 1 || f.stopped !== 1 || f.reviewed !== 1) fail(`funnel counts: ${JSON.stringify(f)}`);
f = fl(null);
if (f.asked !== null || f.reviewed !== null) fail("lists we couldn't read count as 0");
f = fl([cu(-5), cu(-6)], { freshReading: false });
if (f.reviewed !== null || f.reviewed_known) fail("asks with no mark and no recent reading read as 0 reviews, not unknown");
f = fl([cu(-5), cu(-6)], { freshReading: true });
if (f.reviewed !== 0 || !f.reviewed_known) fail("with a recent reading and no marks the count should be a measured 0");
f = fl([]);
if (f.asked !== 0 || f.reviewed !== 0) fail("a client who asked nobody should read 0 asked, 0 reviews");
f = fl([cu(-5), cu(-6, { reviewed_mark: true })], { freshReading: false });
if (f.reviewed !== 1) fail("a marked review isn't counted when Google wasn't read");
const w = RF.funnelWords(fl([cu(-5)], { freshReading: false }));
if (!w.rows.some(([k, v]) => k === "Became a review" && v === "Not known yet")) fail("unknown reads as a number in the card");
if (!/not zero/.test(w.note)) fail("the unknown card doesn't say it is not zero");
if (RF.funnelWords(fl(null)).rows.length) fail("an unreadable list draws numbers");
const prr = read("netlify/functions/portal-review-requests.js");
const fi = prr.indexOf('body.scope === "funnel"');
if (fi < 0 || !/requireWorkspaceForClient/.test(prr.slice(fi, fi + 400))) fail("the funnel endpoint doesn't refuse the client (RGA only)");
const adm = read("admin/admin.js");
if (/funnel/i.test(read("portal/portal.js").replace(/\bfunnel\b(?=[^"']*(?:marketing))/g, ""))) fail("the funnel is mentioned in the client portal");
if (!/Not a target/.test(adm) || !/loadAdminFunnel/.test(adm) || !/repliesLiveAdminHtml/.test(adm)) fail("admin doesn't draw the funnel and reply cards");
if (/rejected/.test(adm.slice(adm.indexOf("async function loadAdminReplies"), adm.indexOf("async function loadAdminReplies") + 2500))) fail("the admin reply card claims Google rejected a reply");

if (F.length) { console.error(`❌ reviews additions: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ reviews additions hold: wording fixed, a reply is Replied only once Google shows it (4 answers, unknown stays unknown, told once, delivered:false asked again, test clients quiet, nothing from the review kept), the funnel counts the client's marks and reads unknown as unknown, RGA only");
