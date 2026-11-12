#!/usr/bin/env node
// check-every-approval-comment-is-answered-or-listed.mjs — ONE THREAD PER APPROVAL ITEM, AND NO CLIENT COMMENT WAITS UNSEEN
// (approved card_notice_designs_v1 section 3, Chris 11-11). The SHIPPED code on fakes (no network, no email, nothing written for real):
//   1 a client comment becomes RGA's To do row (kind approval_comment, 1 business day = CONFIRM_DAYS, late after it) and a Messages entry;
//     RGA's reply saved AFTER it clears both; opening it clears nothing. A Change note is one comment in the same thread, never a second To do
//   2 the author's role comes from the sign-in, never the request: a client can't post as RGA, a client calling "reply" is refused and
//     nothing is written; RGA's reply needs the outward dialog (confirm) and is emailed in the one format, listed in the client's notices (M9)
//   3 a comment on a decided (approved) item is refused
//   4 the comment count is the same on both portals (one renderer, the same rows)
//   5 nightly, when the database can be read: every client comment has a later RGA reply or is younger than 120 days (so it is on To do)
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const F = [], fail = (m) => F.push(m);
const LIVE = { url: process.env.SUPABASE_URL || "", key: process.env.SUPABASE_SERVICE_ROLE_KEY || "" }, REAL_FETCH = globalThis.fetch;
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
const CID = "33333333-3333-4333-8333-333333333333", NOW = Date.parse("2026-11-11T18:00:00Z");
let AC, N, OM, AOM, PD, AM;
try {
  AC = req("./approval-comments.js"); N = req(path.join(SITE, "shared/notices.js")); OM = req("./_open-moves.js"); AOM = req("./admin-open-moves.js");
  PD = fs.readFileSync(path.join(SITE, "netlify/functions/portal-deliverables.js"), "utf8"); AM = fs.readFileSync(path.join(SITE, "netlify/functions/admin-messages.js"), "utf8");
  for (const [n, f] of [["handle", AC.handle], ["threadsOf", AC.threadsOf], ["unanswered", N.unanswered], ["threadHtml", N.threadHtml], ["movesForWorkspace", AOM.movesForWorkspace]]) if (typeof f !== "function") throw new Error(`${n} isn't exported`);
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

// ── 2 + 3 · the endpoint, on a fake database ──────────────────────────────────────────────────────────────────────────────────────────
const db = { rows: [], activity: [], sent: [] };
const supa = async (p, init = {}) => {
  const m = (init.method || "GET").toUpperCase();
  if (p.startsWith("/approval_comments") && m === "POST") { const b = JSON.parse(init.body); const r = { ...b, id: db.rows.length + 1, created_at: new Date(NOW + db.rows.length * 6e4).toISOString() }; db.rows.push(r); return [r]; }
  if (p.startsWith("/approval_comments") && m === "PATCH") return null;
  if (p.startsWith("/approval_comments")) return db.rows;
  if (p.startsWith("/client_activity")) { db.activity.push(JSON.parse(init.body)); return null; }
  if (p.startsWith("/clients")) return [{ id: CID, business_name: "Beta Roofing", primary_contact_name: "Sam Ortiz", primary_contact_email: "sam@x.test", workspace_id: "w1" }];
  return [];
};
const asClient = { requirePortalOwner: async () => ({ email: "sam@x.test" }), requirePortalOwnerOrWorkspace: async () => ({ email: "sam@x.test" }), requireWorkspaceForClient: async () => ({ error: { statusCode: 403, body: "{}" } }), requireWorkspaceUser: async () => ({ error: { statusCode: 403, body: "{}" } }) };
const asStaff = { requirePortalOwner: async () => ({ error: { statusCode: 403, body: "{}" } }), requirePortalOwnerOrWorkspace: async () => ({ email: "chris@rga.test", viaWorkspace: true }), requireWorkspaceForClient: async () => ({ email: "chris@rga.test" }), requireWorkspaceUser: async () => ({ email: "chris@rga.test", workspaceId: "w1" }) };
const deps = (guard, decided = false) => ({ supa, guard, tellRga: false, decided: async () => decided, send: async (m) => { db.sent.push(m); return { id: "gm1" }; } });
const call = (b, d) => AC.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, item_kind: "deliverable", item_id: "m1.web.location_pages", item_title: "New page: Roof repair in Culver City", item_version: "2", ...b }) }, d);
const item = { item_kind: "deliverable", item_id: "m1.web.location_pages" };
try {
  let r = await call({ action: "post", words: "Can the phone number be bigger?", author_role: "rga" }, deps(asClient));
  if (r.statusCode !== 200) fail(`a client's comment didn't save (${r.statusCode} ${r.body})`);
  if (!db.rows.length || db.rows[0].author_role !== "client") fail("a request saying author_role rga posted as RGA (the role must come from the sign-in)");
  if (!db.activity.some((a) => a.kind === "approval_comment" && a.payload && a.payload.step_id === "apc:deliverable:m1.web.location_pages")) fail("a client comment has no Messages entry (client_activity approval_comment)");
  const before = db.rows.length;
  r = await call({ action: "reply", words: "Yes.", confirm: true }, deps(asClient));
  if (r.statusCode < 400 || db.rows.length !== before) fail("a client calling reply was not refused, or wrote a row");
  r = await call({ action: "reply", words: "Yes." }, deps(asStaff));
  if (r.statusCode !== 409 || db.rows.length !== before || db.sent.length) fail("RGA's reply went without the outward dialog (confirm)");
  r = await call({ action: "post", words: "hi" }, deps(asClient, true));
  if (r.statusCode !== 409 || db.rows.length !== before) fail("a comment on a decided item was taken");
  r = await call({ action: "post", words: "" }, deps(asClient));
  if (r.statusCode !== 400) fail("an empty comment was taken");
  r = await call({ action: "reply", words: "Yes. We'll make it bigger and send version 3 today.", confirm: true }, deps(asStaff));
  if (r.statusCode !== 200 || db.rows[db.rows.length - 1].author_role !== "rga") fail(`RGA's reply didn't save as RGA (${r.statusCode})`);
  const m = db.sent[0];
  if (!m || m.to !== "sam@x.test" || !m.notice || m.notice.code !== "M9" || m.notice.clientId !== CID || !/\[Open it\]\(https:\/\/www\.rocketgrowthagency\.com\/portal\/#for-your-approval\)/.test(m.markup || "")) fail("RGA's reply isn't emailed in the one format with its M9 notice");
  if (/—/.test((m && m.markup) || "")) fail("RGA's reply email carries an em dash");
} catch (e) { fail(`the endpoint threw: ${e.message}`); }

// ── 1 · To do, from the same rows, through the admin's own queue builder ─────────────────────────────────────────────────────────────
{
  const at = (h) => new Date(NOW - h * 3600e3).toISOString();
  const rows = [
    { client_id: CID, ...item, item_title: "New page", author_role: "client", is_change: false, created_at: at(30) },
    { client_id: CID, item_kind: "deliverable", item_id: "m2.exec.gbp_posts", item_title: "Posts", author_role: "client", is_change: false, created_at: at(80) },
    { client_id: CID, item_kind: "deliverable", item_id: "m2.exec.gbp_posts", item_title: "Posts", author_role: "rga", is_change: false, created_at: at(70) },
    { client_id: CID, item_kind: "deliverable", item_id: "m1.gbp.description", item_title: "Description", author_role: "client", is_change: true, created_at: at(5) },
  ];
  globalThis.fetch = async (u) => {
    const url = String(u), J = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (url.includes("/clients?")) return J([{ id: CID, business_name: "Beta Roofing", portal_mode: null, client_facts_meta: {}, primary_market: "Culver City, CA" }]);
    if (url.includes("/approval_comments?")) return J(rows);
    return J([]);
  };
  try {
    const moves = await AOM.movesForWorkspace({ clientId: CID, now: new Date(NOW).toISOString() });
    const ac = moves.filter((x) => x.kind === "approval_comment");
    if (ac.length !== 1) fail(`To do has ${ac.length} comment rows, want 1 (the unanswered question; the answered one and the Change note make none)`);
    else {
      const x = ac[0];
      if (x.owner !== "rga" || x.days !== OM.CONFIRM_DAYS || OM.CONFIRM_DAYS !== 1) fail("a comment's To do row isn't RGA's on the 1-business-day rule");
      if (x.due !== OM.addBusinessDays(rows[0].created_at, 1, null) && x.due !== OM.addBusinessDays(rows[0].created_at, 1, "America/Los_Angeles")) fail(`the row's due date isn't 1 business day after the comment (${x.due})`);
      if (x.late !== (Date.parse(x.due) < NOW)) fail("the row's lateness doesn't follow its due date");
      if (x.step_id !== "apc:deliverable:m1.web.location_pages") fail("the row doesn't point at its thread");
    }
    rows.push({ client_id: CID, ...item, author_role: "rga", is_change: false, created_at: at(1) });
    const after = (await AOM.movesForWorkspace({ clientId: CID, now: new Date(NOW).toISOString() })).filter((x) => x.kind === "approval_comment");
    if (after.length) fail("RGA's reply after the comment didn't clear its To do row");
  } catch (e) { fail(`the To do builder threw: ${e.message}`); }
}
// the pure rule both read
{
  const t = (r, h) => ({ author_role: r, created_at: new Date(NOW + h * 6e4).toISOString() });
  if (!N.unanswered([t("client", 1)]) || N.unanswered([t("client", 1), t("rga", 2)]) || !N.unanswered([t("client", 1), t("rga", 2), t("client", 3)])) fail("unanswered() is wrong (the last client word must have a later RGA reply)");
}
// Messages + one change flow
if (!/kind\.in\.\(client_message,rga_reply,rga_alert,approval_comment,approval_reply\)/.test(AM)) fail("admin Messages no longer reads approval comments");
if (!/decision === "changes_requested"[\s\S]{0,500}\/approval_comments`[\s\S]{0,400}is_change: true/.test(PD)) fail("a Change note no longer goes into the item's thread (two stores)");

// ── 4 · the same count on both portals ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const cs = [{ author_role: "client", words: "a", created_at: "2026-11-10T00:00:00Z" }, { author_role: "rga", words: "b", created_at: "2026-11-11T00:00:00Z" }, { author_role: "client", words: "c", created_at: "2026-11-12T00:00:00Z" }];
  const c = N.threadHtml({ comments: cs, me: "client", item: { kind: "d", id: "x" } }), a = N.threadHtml({ comments: cs, me: "rga", item: { kind: "d", id: "x" }, fold: true });
  const n = (h) => (/Comments · (\d+)/.exec(h) || [])[1];
  if (n(c) !== "3" || n(a) !== "3") fail(`the comment count differs between the portals (client ${n(c)}, admin ${n(a)})`);
  if (!/Show 2 earlier/.test(a)) fail("admin's thread doesn't fold the earlier comments behind Show N earlier");
  const closed = N.threadHtml({ comments: cs, me: "client", closed: true, item: { kind: "d", id: "x" } });
  if (/data-apc-send/.test(closed) || !/closed/.test(closed)) fail("a decided item's thread still takes comments");
}

// ── 5 · nightly (read only) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
if (LIVE.url && LIVE.key) {
  const get = async (q) => { const r = await REAL_FETCH(`${LIVE.url}/rest/v1${q}`, { headers: { apikey: LIVE.key, Authorization: `Bearer ${LIVE.key}` } }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 160)}`); return JSON.parse(t || "[]"); };
  try {
    const rows = await get(`/approval_comments?select=client_id,item_kind,item_id,author_role,is_change,created_at&order=created_at.asc&limit=5000`);
    const threads = AC.threadsOf(rows.filter((r) => !r.is_change));
    const stale = threads.filter((t) => t.open_since && Date.now() - Date.parse(t.open_since) > 120 * 864e5);
    for (const t of stale.slice(0, 5)) fail(`live: ${t.client_id} ${t.item_id}: a client comment from ${t.open_since} has no reply and is past To do's 120-day window`);
    console.log(`  · live: ${threads.length} threads, ${threads.filter((t) => t.open_since).length} waiting on RGA (each on To do)`);
  } catch (e) { if (/42P01|PGRST205|does not exist|Could not find the table/.test(e.message)) console.log("  · live: approval_comments isn't there yet (docs/supabase/NOTICES_AND_COMMENTS_2026-11-11.sql not run): said, not failed"); else { console.error(`⚠️  live read failed: ${e.message}`); process.exit(2); } }
}

if (F.length) { console.error(`❌ every approval comment is answered or listed — ${F.length} regression(s):`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✅ every approval comment is answered or listed: a client comment is RGA's To do row (1 business day) and a Messages entry until RGA's reply after it; the role comes from the sign-in; the reply needs the outward dialog and is emailed (M9); a decided item's thread is closed; one count on both portals");
