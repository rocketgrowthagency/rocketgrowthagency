#!/usr/bin/env node
// check-billing-email-has-its-own-budget.mjs: A BUSY MORNING CAN NEVER BLOCK A RECEIPT (automation clock master page, approved 11-11,
// decision 4: "Billing notices and receipts get their own budget"). Invoices, notices and receipts shared one 10-a-day Gmail tripwire
// (RGA_EMAIL_DAILY_CAP, sends_today) with stage notices, monthly reports and confirmations.
// HOLDS, on the WEBSITE repo, with a fake Supabase, a fake Google and a fake Gmail (NOTHING is ever sent):
//   1  send-invoice-email's send counts ONLY today's billing emails (client_activity invoice_email_sent, this workspace, today UTC) against
//      its own cap (RGA_BILLING_EMAIL_DAILY_CAP, default 20): a shared counter at 10 of 10 does NOT stop a receipt.
//   2  20 billing emails today stops the 21st before Google is asked; a cap set lower is honored.
//   3  a count that can't be read stops the send (fail closed) and says why: never read as "0 sent".
//   4  billing no longer spends the shared counter: its PATCH carries no sends_today / sends_date (the lifetime sends_total still counts).
//   5  the other client emails still share RGA_EMAIL_DAILY_CAP (stage notices, monthly reports, confirmations, kickoff invites).
//   6  every billing email still writes its invoice_email_sent row, so the count is the sends.
// PROVES ITSELF: it must fail on the before state (website c621cc35) in 3+ places, else exit 2.
import path from "node:path";
import { createRequire } from "node:module";
import { runTwoRepoGate, rd } from "./lib/two-repo-gate.mjs";

const TODAY = new Date().toISOString().slice(0, 10);

async function checkTree(site, scr, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), W = rd(site);
  const req = createRequire(path.join(site, "netlify/functions/x.js"));
  const src = W("netlify/functions/send-invoice-email.js");
  if (!src) { fail("send-invoice-email.js moved"); return F; }
  const saved = { ...process.env }, savedFetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: "https://fake.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake-service", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y" });
  delete process.env.RGA_SUPPRESS_CLIENT_EMAIL; delete process.env.RGA_BILLING_EMAIL_DAILY_CAP; delete process.env.RGA_EMAIL_DAILY_CAP;
  // the file's own sendGmail, compiled as the module with one line added that hands it to this gate (the shipped file is untouched)
  let send = null;
  try {
    req("./_deadline.js");
    const Mod = req("module"), p = req.resolve("./send-invoice-email.js"), m = new Mod(p);
    m.filename = p; m.paths = Mod._nodeModulePaths(path.dirname(p));
    m._compile(`${src}\n;module.exports.__gateSend = typeof sendGmail === "function" ? sendGmail : null;`, p);
    send = m.exports.__gateSend;
  } catch (e) { fail(`send-invoice-email won't load: ${String(e.message).slice(0, 100)}`); }
  if (!send) fail("send-invoice-email has no sendGmail to test");
  const go = async ({ billingToday = 0, sharedToday = 10, countStatus = 200 } = {}) => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url); calls.push({ u, method: init.method || "GET", body: init.body });
      const J = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
      if (/rga_google_credentials/.test(u) && (init.method || "GET") === "GET") return J(200, [{ refresh_token: "plain-refresh", google_email: "hello@rocketgrowthagency.com", scopes: "gmail.send", sends_date: TODAY, sends_today: sharedToday, sends_total: 50 }]);
      if (/rga_google_credentials/.test(u)) return J(200, [{}]);
      if (/client_activity/.test(u)) return countStatus === 200 ? J(200, Array.from({ length: billingToday }, (_, i) => ({ id: `a${i}` }))) : J(countStatus, { message: "boom" });
      if (/oauth2\.googleapis\.com\/token/.test(u)) return J(200, { access_token: "fake-access" });
      if (/gmail\.googleapis\.com/.test(u)) return J(200, { id: "gm1", threadId: "t1" });
      return J(200, []);
    };
    let out;
    try { out = await send({ workspaceId: "ws1", to: "client@example.com", subject: "Receipt", html: "<p>x</p>", text: "x" }); }
    catch (e) { out = { threw: String(e.message).slice(0, 100) }; }
    return { out, calls, gmail: calls.filter((c) => /gmail\.googleapis\.com/.test(c.u)), count: calls.filter((c) => /client_activity/.test(c.u)), patch: calls.filter((c) => /rga_google_credentials/.test(c.u) && c.method === "PATCH") };
  };
  try {
    if (send) {
      { const r = await go({ billingToday: 3, sharedToday: 10 });
        if (r.gmail.length !== 1 || !(r.out && r.out.ok !== false)) fail(`a receipt was stopped because the shared client-email counter is at 10 of 10 (${JSON.stringify(r.out).slice(0, 120)})`);
        const q = r.count[0] && r.count[0].u;
        if (!q || !/kind=eq\.invoice_email_sent/.test(q) || !/workspace_id=eq\.ws1/.test(q) || !q.includes(`created_at=gte.${TODAY}T00:00:00Z`)) fail("billing doesn't count today's invoice_email_sent rows for this workspace");
        const pb = r.patch[0] ? JSON.parse(r.patch[0].body || "{}") : null;
        if (pb && ("sends_today" in pb || "sends_date" in pb)) fail("a billing send still spends the shared client-email counter (sends_today)");
        if (!pb || !("sends_total" in pb)) fail("a billing send no longer counts in the lifetime sends_total"); }
      { const r = await go({ billingToday: 20, sharedToday: 0 });
        if (r.gmail.length || !(r.out && r.out.capped === true) || !/billing-email cap/.test(r.out.error || "")) fail("the 21st billing email of the day wasn't stopped before Google, by the billing cap"); }
      { process.env.RGA_BILLING_EMAIL_DAILY_CAP = "2"; const r = await go({ billingToday: 2, sharedToday: 0 }); delete process.env.RGA_BILLING_EMAIL_DAILY_CAP;
        if (r.gmail.length) fail("RGA_BILLING_EMAIL_DAILY_CAP isn't honored"); }
      { const r = await go({ countStatus: 500, sharedToday: 0 });
        if (r.gmail.length || !(r.out && r.out.ok === false) || !/Could not count today's billing emails/.test(r.out.error || "")) fail("a billing count that couldn't be read still sent (or didn't say why): an unread count is not 0"); }
    }
  } finally { globalThis.fetch = savedFetch; for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
  // ── 5 + 6 static ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const f of ["notify-client-stage.js", "send-monthly-report.js", "send-confirmation-email.js"]) {
    const t = W(`netlify/functions/${f}`) || "";
    if (!/Number\(process\.env\.RGA_EMAIL_DAILY_CAP \|\| 10\)/.test(t) || /invoice_email_sent/.test(t)) fail(`${f} no longer shares the client-email cap, or counts billing's sends`);
  }
  const sendAt = src.indexOf("const outcome = await sendGmail("), rowAt = src.indexOf('kind: "invoice_email_sent"');
  if (sendAt < 0 || rowAt < sendAt) fail("a billing email no longer writes its invoice_email_sent row after the send, so the count would miss sends");
  return F;
}

try {
  await runTwoRepoGate({ name: "check-billing-email-has-its-own-budget", siteBefore: "c621cc35", scrBefore: "686467af", checkTree, minBefore: 3 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
