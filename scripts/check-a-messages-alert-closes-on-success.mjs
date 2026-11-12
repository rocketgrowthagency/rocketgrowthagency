#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// check-a-messages-alert-closes-on-success.mjs — AN ADMIN MESSAGES ALERT CLOSES WHEN THE JOB THAT RAISED IT LATER
// SUCCEEDS, AND RGA CAN DISMISS ONE (ui master, Chris approved 11-11).
//
// 🔴 WHY: an alert left Messages ONLY by aging out after 14 days (admin-messages.js). A declined card that went
// through the next day, a receipt sent on the retry, a nightly job that ran clean an hour later: each still read as a
// live failure and kept the Messages badge lit for two weeks. And there was no Dismiss: "Open client" was the only
// control. → feedback_a_success_clears_the_failure_it_supersedes
//
// HOLDS:
//   1. netlify/functions/_messages-alerts.js, RUN on cases: a later success of the SAME job closes the alert with its
//      note (the same invoice for a charge, a receipt for a receipt); a success for another invoice, another client, or
//      BEFORE the failure does not; a producer's retired alert (*_cleared) closes; Dismiss closes; a failure with no
//      success stays open.
//   2. admin-messages.js, RUN with a stubbed database: the count leaves out the closed alert, closed_alerts carries the
//      note, and Dismiss PATCHes payload.dismissed only on an alert of this workspace's clients (another workspace → 404,
//      a non-alert row → 400), and reads it back.
//   3. admin.js draws Dismiss (an admin-link-button, the one word), posts action "dismiss", and draws closed alerts
//      with their "Closed ·" note; admin.css styles the closed alert from the state tokens.
// Exit 0 holds · 1 broken · 2 can't tell.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = path.join(SITE, "netlify/functions");
const read = (rel) => { try { return fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);

// ── 1. the rule, run ─────────────────────────────────────────────────────────────────────────────────
const req = createRequire(path.join(FN, "x.js"));
let lib;
try { lib = req("./_messages-alerts.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — _messages-alerts.js does not load: ${e.message}`); process.exit(2); }
if (typeof lib.closeAlerts !== "function") { console.error("⚠️  INDETERMINATE — _messages-alerts.js exports no closeAlerts"); process.exit(2); }
const T = (h) => new Date(Date.UTC(2026, 10, 10, h)).toISOString();
const row = (id, client_id, kind, payload, h) => ({ id, client_id, kind, payload, created_at: T(h) });
const CASES = [
  { name: "a declined card that went through later", a: row("a1", "c1", "auto_charge_failed", { invoice_num: 7 }, 1), s: [row("s1", "c1", "auto_charge_succeeded", { invoice_num: 7 }, 5)], closed: true, note: /charge went through/ },
  { name: "a charge for ANOTHER invoice", a: row("a2", "c1", "auto_charge_failed", { invoice_num: 7 }, 1), s: [row("s2", "c1", "auto_charge_succeeded", { invoice_num: 8 }, 5)], closed: false },
  { name: "a success BEFORE the failure", a: row("a3", "c1", "auto_charge_failed", { invoice_num: 7 }, 5), s: [row("s3", "c1", "auto_charge_succeeded", { invoice_num: 7 }, 1)], closed: false },
  { name: "the same success for ANOTHER client", a: row("a4", "c1", "auto_charge_failed", { invoice_num: 7 }, 1), s: [row("s4", "c2", "auto_charge_succeeded", { invoice_num: 7 }, 5)], closed: false },
  { name: "a receipt sent on the retry", a: row("a5", "c1", "receipt_email_failed", { invoice_num: 3 }, 1), s: [row("s5", "c1", "invoice_email_sent", { kind: "receipt", invoice_num: 3 }, 2)], closed: true, note: /receipt was sent/ },
  { name: "an INVOICE email is not the receipt", a: row("a6", "c1", "receipt_email_failed", { invoice_num: 3 }, 1), s: [row("s6", "c1", "invoice_email_sent", { kind: "invoice", invoice_num: 3 }, 2)], closed: false },
  { name: "the welcome email sent later", a: row("a7", "c1", "welcome_email_failed", {}, 1), s: [row("s7", "c1", "welcome_email_sent", {}, 2)], closed: true, note: /welcome email/ },
  { name: "Google reconnected AND the manager added", a: row("a8", "c1", "gbp_manager_add_failed", { needs_human: true, kind: "gbp_manager_add_failed" }, 1), s: [row("s8", "c1", "google_oauth_connected", { gbp_manager_auto_added: true }, 3)], closed: true, note: /manager/ },
  { name: "Google reconnected but the manager add failed again", a: row("a9", "c1", "gbp_manager_add_failed", { needs_human: true, kind: "gbp_manager_add_failed" }, 1), s: [row("s9", "c1", "google_oauth_connected", { gbp_manager_auto_added: false }, 3)], closed: false },
  { name: "a job the watcher retired as recovered", a: row("a10", "c1", "rga_alert", { kind: "system_job_cleared", job: "daily-health-check", retired_at: T(4) }, 1), s: [], closed: true, note: /ran again/ },
  { name: "a nightly client check retired as fixed", a: row("a11", "c1", "rga_alert", { kind: "client_site_tag_failed_cleared" }, 1), s: [], closed: true, note: /fixed/ },
  { name: "an alert RGA dismissed", a: row("a12", "c1", "rga_alert", { needs_human: true, kind: "send_failed", dismissed: { at: T(6), by: "hello@rocketgrowthagency.com" } }, 1), s: [], closed: true, how: "dismissed", note: /Dismissed/ },
  { name: "a failure nothing has superseded", a: row("a13", "c1", "rga_alert", { needs_human: true, kind: "send_failed" }, 1), s: [], closed: false },
];
for (const c of CASES) {
  let r;
  try { r = lib.closeAlerts([c.a], c.s); } catch (e) { fail(`closeAlerts throws on "${c.name}": ${e.message}`); continue; }
  const cl = (r.closed || []).find((x) => x.row && x.row.id === c.a.id), op = (r.open || []).some((x) => x.id === c.a.id);
  if (c.closed && !cl) fail(`${c.name}: the alert stays OPEN (a later success / retire / Dismiss must close it)`);
  if (!c.closed && !op) fail(`${c.name}: the alert CLOSES, but nothing superseded it`);
  if (cl && c.note && !c.note.test(cl.note || "")) fail(`${c.name}: the closed alert's note is "${cl.note}"`);
  if (cl && c.how && cl.how !== c.how) fail(`${c.name}: closed as "${cl.how}", expected "${c.how}"`);
}

// ── 2. admin-messages, run on a stubbed database ─────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "msg-alerts-"));
try {
  fs.copyFileSync(path.join(FN, "admin-messages.js"), path.join(tmp, "admin-messages.js"));
  fs.copyFileSync(path.join(FN, "_messages-alerts.js"), path.join(tmp, "_messages-alerts.js"));
  fs.writeFileSync(path.join(tmp, "_deadline.js"), "module.exports = {};\n");
  fs.writeFileSync(path.join(tmp, "_auth.js"), "module.exports = { requireWorkspaceUser: async () => ({ email: 'owner@rga.test', workspaceId: 'w1' }) };\n");
  const now = Date.now(), ago = (h) => new Date(now - h * 3600e3).toISOString();
  const db = {
    alerts: [
      { id: "al-paid", client_id: "c1", kind: "auto_charge_failed", payload: { invoice_num: 4, summary: "Auto-charge failed for invoice #4" }, created_at: ago(30) },
      { id: "al-open", client_id: "c1", kind: "rga_alert", payload: { needs_human: true, kind: "send_failed", summary: "Could not email RGA" }, created_at: ago(20) },
      { id: "al-retired", client_id: "c1", kind: "rga_alert", payload: { kind: "system_job_cleared", job: "daily-health-check", retired_at: ago(3), summary: "Daily health check stopped" }, created_at: ago(40) },
      { id: "msg-1", client_id: "c1", kind: "client_message", payload: { message: "Hi", step_id: "s1" }, created_at: ago(10) },
    ],
    successes: [{ id: "ok-1", client_id: "c1", kind: "auto_charge_succeeded", payload: { invoice_num: 4 }, created_at: ago(5) }],
    other: { id: "al-other", client_id: "c9", kind: "rga_alert", payload: { needs_human: true, kind: "send_failed" }, created_at: ago(2) },
    patched: [],
  };
  const answer = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    if (/\/rest\/v1\/clients\?/.test(u)) return answer([{ id: "c1", business_name: "Acme Plumbing" }]);
    if ((init.method || "GET") === "PATCH") {
      const body = JSON.parse(init.body || "{}"); const id = /id=eq\.([\w-]+)/.exec(u)[1];
      db.patched.push({ id, body }); const base = [...db.alerts, db.other].find((r) => r.id === id);
      return answer([{ ...base, payload: body.payload }]);
    }
    if (/\/client_activity\?id=eq\./.test(u)) { const id = /id=eq\.([\w-]+)/.exec(u)[1]; return answer([...db.alerts, db.other].filter((r) => r.id === id)); }
    if (/\/client_activity\?.*kind=in\.\((auto_charge_succeeded|[^)]*auto_charge_succeeded)/.test(u) && /created_at=gte/.test(u)) return answer(db.successes);
    if (/\/client_activity\?/.test(u)) return answer(db.alerts);
    return answer({ error: "unexpected " + u }, 500);
  };
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { handler } = createRequire(path.join(tmp, "x.js"))("./admin-messages.js");
  const call = async (b) => { const r = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(b) }); return { status: r.statusCode, j: JSON.parse(r.body || "{}") }; };
  const list = await call({});
  if (list.status !== 200 || !list.j.ok) fail(`admin-messages does not answer the list (${list.status} ${list.j.error || ""})`);
  else {
    if ((list.j.alerts || []).some((a) => a.id === "al-paid")) fail("admin-messages still lists the declined charge as OPEN after the same invoice was charged");
    if (!(list.j.alerts || []).some((a) => a.id === "al-open")) fail("admin-messages lost the alert nothing superseded");
    const cl = (list.j.closed_alerts || []).find((a) => a.id === "al-paid");
    if (!cl) fail("admin-messages returns no closed_alerts entry for the superseded charge (it must stay on the page with a note)");
    else if (!/charge went through/.test(cl.note || "") || !cl.closed_at) fail(`the closed alert lacks its note or time (${JSON.stringify(cl).slice(0, 120)})`);
    const rt = (list.j.closed_alerts || []).find((a) => a.id === "al-retired");
    if (!rt || !/ran again/.test(rt.note || "")) fail("a job the watcher retired as recovered vanishes from Messages instead of closing with its note");
    if (list.j.count !== 2) fail(`the Messages count is ${list.j.count}; expected 2 (one unanswered question + one open alert; the closed alert is never counted)`);
  }
  const theirs = await call({ action: "dismiss", id: "al-other" });
  if (theirs.status !== 404) fail(`Dismiss on ANOTHER workspace's alert answers ${theirs.status}, expected 404`);
  const notAlert = await call({ action: "dismiss", id: "msg-1" });
  if (notAlert.status !== 400) fail(`Dismiss on a client's message (not an alert) answers ${notAlert.status}, expected 400`);
  if (db.patched.length) fail(`a refused Dismiss still wrote (${db.patched.map((p) => p.id).join(", ")})`);
  const ok = await call({ action: "dismiss", id: "al-open" });
  const p = db.patched.find((x) => x.id === "al-open");
  if (ok.status !== 200 || !ok.j.ok) fail(`Dismiss on an open alert answers ${ok.status} ${ok.j.error || ""}`);
  if (!p || !p.body.payload || !p.body.payload.dismissed || !p.body.payload.dismissed.at || p.body.payload.dismissed.by !== "owner@rga.test") fail("Dismiss does not write payload.dismissed = { at, by } on the row");
  else if (p.body.payload.summary !== "Could not email RGA") fail("Dismiss overwrote the alert's payload instead of adding to it");
} catch (e) { fail(`admin-messages could not be run on a stub: ${String(e.message).slice(0, 160)}`); }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ── 3. the admin page ────────────────────────────────────────────────────────────────────────────────
const js = read("admin/admin.js"), css = read("admin/admin.css");
const btn = /<button type="button" class="admin-link-button" data-alert-dismiss="\$\{escapeAttribute\(a\.id\)\}">Dismiss<\/button>/;
if (!btn.test(js)) fail('admin.js does not draw the alert\'s "Dismiss" button (admin-link-button, data-alert-dismiss, the one word)');
if (!/action: "dismiss", id: b\.getAttribute\("data-alert-dismiss"\)/.test(js)) fail("the Dismiss button does not post { action: \"dismiss\", id } to admin-messages");
if (!/data\.closed_alerts/.test(js) || !/am-alert is-closed/.test(js) || !/>Closed · \$\{escapeHtml\(a\.note/.test(js)) fail('admin.js does not draw closed alerts with their "Closed ·" note');
if (!/\.am-alert\.is-closed\{[^}]*var\(--state-ok/.test(css)) fail("admin.css has no closed-alert style from the state tokens (.am-alert.is-closed)");

if (F.length) {
  console.log(`✗ check-a-messages-alert-closes-on-success: ${F.length} problem(s)`);
  for (const m of F) console.log(`  · ${m}`);
  process.exit(1);
}
console.log(`✓ an alert closes when the job that raised it later succeeds (${CASES.length} cases), keeps its note on the page, leaves the count; Dismiss closes one, only this workspace's, read back.`);
