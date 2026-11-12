#!/usr/bin/env node
// check-client-health-matches-monthly-28.mjs — THE CLIENT HEALTH VIEW (admin only) AGREES WITH EVERY CLIENT'S MONTHLY 28 (approved tier3_best_in_class_v1 §7, the owner 11-11).
//
// WHAT IT HOLDS
//  1. For every client the view's state (flagged, and which signs) equals that client's Monthly 28 answer: churnState on what _monthly-health readData reads.
//  2. Two signs = At risk, one = "1 sign"; "Fine" only when every sign was READ clean. A sign not read (no sign-in logged, no billing status, a failed read) is
//     "Not checked", never fine, never "paid", never "recent".
//  3. The owner's decision: sign-ins, the bill and the call count from Month 1; numbers falling from Month 4 only.
//  4. A late bill is a sign in the words billing-daily-check writes (overdue, warning, paused), not only the old past_due.
//  5. A notice to leave (or a terminated client) drops off the view. An at-risk client is RGA's To do row (admin-open-moves), and no other state is.
//  6. Admin only: no client-facing file says "at risk". A failed read of the view is a 502, never an empty "no client at risk".
// Universal fixtures: names with an apostrophe, an accent and an ampersand; a UK and a US client; Month 1, 2, 4, 7; every billing word.
// Runs the SHIPPED modules against fakes: no network, no database, no email.
// SELF-PROVING: after a pass it runs the same checks on the website at LIVE_BEFORE (the build's before state, git show), which MUST fail in 5+ ways, else exit 2.
//   --against=<revision> runs the checks on that revision instead and exits 1 when they fail.
// Exit 0 healthy · 1 a rule is broken · 2 INDETERMINATE (cannot read the files or the before state)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB_GIT = process.env.WEBSITE_GIT_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const AGAINST = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const LIVE_BEFORE = process.env.LIVE_BEFORE || "b1a48dda";
const MIN_BEFORE_FAILS = 5;
const strip = (t) => String(t || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");

async function checks(root) {
  const F = [], fail = (m) => F.push(m);
  const req = createRequire(`${root}/netlify/functions/`);
  const read = (r) => { try { return fs.readFileSync(`${root}/${r}`, "utf8"); } catch { return null; } };
  let H, CH, CHS, MH, EP;
  try { H = req("../../shared/monthly-health.js"); MH = req("./_monthly-health.js"); } catch (e) { return [`the Monthly 28 modules did not load: ${e.message}`]; }
  try { CH = req("../../shared/client-health.js"); CHS = req("./_client-health.js"); EP = req("./admin-client-health.js"); } catch (e) { fail(`the client health view does not load: ${String(e.message).split("\n")[0]}`); }

  // ── the fixtures ──
  const now = Date.parse("2026-11-11T16:00:00Z"), DAY = 86400000, month = "2026-11-01";
  const closed = (iso) => ({ "m1.handoff.month2": { status: "done", completed_at: iso } });
  const fz = (m, clicks, calls, views, call) => ({ reporting_month: m, data: { frozen: clicks == null && calls == null ? null : { google: { views, calls }, other: { clicks } }, tasks: call ? { "m2.call.monthly": { call_outcome: call } } : {} } });
  const falling = (call) => [fz("2026-10-01", 40, 10, 100, call), fz("2026-09-01", 60, 12, 110), fz("2026-08-01", 90, 15, 120)];
  const steady = (call) => [fz("2026-10-01", 50, 10, 100, call), fz("2026-09-01", 50, 10, 100), fz("2026-08-01", 50, 10, 100)];
  const ago = (d) => new Date(now - d * DAY).toISOString();
  const C = [
    { id: "c1", name: "O'Brien & Sons Plumbing", m1: "2026-06-20T00:00:00Z", billing: "active", login: ago(26), rows: falling("retained"), want: { state: "at_risk", signals: ["decline", "login"] } },
    { id: "c2", name: "Clínica Dental Sánchez", m1: "2026-10-05T00:00:00Z", billing: "overdue", login: ago(3), rows: [fz("2026-10-01", null, null, null, "retained")], due: ago(9), want: { state: "one_sign", signals: ["billing"] } },
    { id: "c3", name: "Nathan's Towing", m1: "2026-04-10T00:00:00Z", billing: "active", login: ago(0.1), rows: steady("retained"), want: { state: "fine", signals: [] } },
    { id: "c4", name: "Gamma HVAC Ltd (Leeds, UK)", m1: null, billing: "active", login: null, rows: [], want: { state: "not_checked", signals: [] } },
    // Month 2 with falling numbers: never "numbers falling" before Month 4, but the bill and the call count from Month 1
    { id: "c5", name: "Café Société", m1: "2026-09-25T00:00:00Z", billing: "warning", login: ago(30), rows: falling("at_risk"), want: { state: "at_risk", signals: ["login", "billing", "call"] } },
    { id: "c6", name: "Zed Roofing", m1: "2026-05-01T00:00:00Z", billing: "paused", login: ago(2), rows: steady("churned"), want: { state: "at_risk", signals: ["billing", "call"] } },
    { id: "c7", name: "Leaving Co", m1: "2026-03-01T00:00:00Z", billing: "overdue", login: ago(40), rows: falling("at_risk"), notice: { event: "cancel_notice", ends_on: "2026-12-15" }, want: null },
    { id: "c8", name: "Ended LLC", m1: "2026-03-01T00:00:00Z", billing: "terminated", login: ago(40), rows: falling("at_risk"), want: null },
    { id: "c9", name: "No Status Yet", m1: "2026-04-01T00:00:00Z", billing: "", login: ago(1), rows: steady("retained"), want: { state: "not_checked", signals: [] } },
  ];
  const inputs = { now, month, clients: C.map((c) => ({ id: c.id, business_name: c.name, billing_status: c.billing })),
    onboarding: C.map((c) => ({ client_id: c.id, data: { tasks: c.m1 ? closed(c.m1) : {} } })), months: C.flatMap((c) => c.rows.map((r) => ({ client_id: c.id, ...r }))),
    logins: C.filter((c) => c.login).map((c) => ({ client_id: c.id, last_login_at: c.login })), contracts: C.filter((c) => c.notice).map((c) => ({ client_id: c.id, signed_at: "2026-03-01", audit_log: [c.notice] })),
    invoices: C.filter((c) => c.due).map((c) => ({ client_id: c.id, due_date: c.due.slice(0, 10) })) };
  const OM = req("./_open-month.js");
  // Monthly 28's OWN answer, through the step's own reader (readData) with fakes
  const m28 = async (c) => {
    const deps = { now: () => now, monthNumber: async () => OM.monthNumber(month, c.m1), monthRows: async () => c.rows, client: async () => ({ billing_status: c.billing, geography_model: null }),
      lastLogin: async () => c.login || null, notice: async () => (c.notice ? { ends_on: c.notice.ends_on } : null), mainKeyword: async () => null, trackedExtras: async () => 0,
      readStepRecord: async () => ({ tasks: {}, data: {} }), frontier: async () => null, aiFacts: async () => ({}) };
    const d = await MH.readData({ clientId: c.id, month, deps });
    return H.churnState({ ...d, now });
  };
  if (CH && CHS) {
    let v = null;
    try { v = CHS.buildView(inputs); } catch (e) { fail(`the view did not build: ${e.message}`); }
    if (v) {
      for (const c of C) {
        const row = v.rows.find((r) => r.id === c.id);
        if (c.want === null) { if (row) fail(`${c.name}: a client with ${c.notice ? "a notice to leave" : "a terminated service"} is still on the view`); continue; }
        if (!row) { fail(`${c.name} is missing from the view`); continue; }
        const S = await m28(c);
        const theirs = S.signals.map((s) => s.key).sort().join(","), ours = [...row.signals].sort().join(",");
        if (ours !== theirs && Number.isFinite(OM.monthNumber(month, c.m1)) && OM.monthNumber(month, c.m1) >= H.FIRST_MONTH) fail(`${c.name}: the view says signs [${ours}] but Monthly 28 says [${theirs}]`);
        if (row.flagged !== S.flagged && Number.isFinite(OM.monthNumber(month, c.m1)) && OM.monthNumber(month, c.m1) >= H.FIRST_MONTH) fail(`${c.name}: the view's At risk (${row.flagged}) is not Monthly 28's flag (${S.flagged})`);
        if (row.state !== c.want.state) fail(`${c.name}: state "${row.state}", wanted "${c.want.state}"`);
        if (ours !== [...c.want.signals].sort().join(",")) fail(`${c.name}: signs [${ours}], wanted [${[...c.want.signals].sort().join(",")}]`);
        if ((row.state === "at_risk") !== (row.signals.length >= 2)) fail(`${c.name}: At risk does not mean two signs`);
        if (row.state === "fine" && row.chips.some((x) => x.tone !== "ok")) fail(`${c.name}: called Fine with a sign that was not read clean (${row.chips.filter((x) => x.tone !== "ok").map((x) => x.text).join("; ")})`);
        if (c.want.state === "at_risk" && !/^At risk · \d$/.test(row.pill)) fail(`${c.name}: the at-risk pill reads "${row.pill}"`);
      }
      // Month 2's falling numbers are never a sign; Month 4's are (the same churnState the card uses)
      const cafe = v.rows.find((r) => r.id === "c5");
      if (cafe && !cafe.chips.some((x) => x.key === "decline" && /from Month 4/.test(x.text))) fail("a Month 2 client's numbers chip does not say they count from Month 4");
      // the bill's days late come from the oldest open invoice
      const cs = v.rows.find((r) => r.id === "c2");
      if (cs && !cs.chips.some((x) => x.key === "billing" && /^Bill 9 days late$/.test(x.text))) fail(`the late bill does not say its days late (${cs && cs.chips.map((x) => x.text).join(" / ")})`);
      // a failed read is "not checked", never fine or paid
      const fv = CHS.buildView({ ...inputs, logins: [], failed: { login: true } });
      const nat = fv.rows.find((r) => r.id === "c3");
      if (!nat || nat.state === "fine") fail("with the sign-in read failed, a client is still called Fine");
      if (nat && !nat.chips.some((x) => x.key === "login" && /not checked/i.test(x.text))) fail("a failed sign-in read is not said as not checked");
      if (!/portal sign-ins/.test(read("admin/admin.js") || "") || !(fv.failed || []).includes("login")) fail("the view does not say which read failed");
      const bv = CHS.buildView({ ...inputs, failed: { billing: true } });
      if (bv.rows.some((r) => r.chips.some((x) => x.key === "billing" && /paid/i.test(x.text)))) fail("with billing unread, a bill still shows as paid");
      // the To do row: at risk only, RGA's, never the client's
      for (const r of v.rows) { const mv = CH.todoMove(r); if (!!mv !== (r.state === "at_risk")) fail(`${r.name}: a To do row ${mv ? "for a client that is not at risk" : "is missing for an at-risk client"}`); if (mv && (mv.owner !== "rga" || mv.kind !== "client_health")) fail("the at-risk To do row is not RGA's client_health move"); }
      const head = v.head || "";
      const wantHead = `${v.rows.filter((r) => r.state === "at_risk").length} at risk · ${v.rows.filter((r) => r.state === "one_sign").length} with one sign`;
      if (head !== wantHead) fail(`the view's header reads "${head}", not "${wantHead}"`);
    }
    // the endpoint: a failed read is a 502, never an empty view
    try {
      EP.__useDeps({ gate: { workspaceId: "w" }, now: () => now, clients: async () => { throw new Error("database answered 500"); } });
      const r = await EP.handler({ httpMethod: "POST", body: "{}", headers: {} });
      EP.__useDeps(null);
      if (r.statusCode === 200 || /"rows":\[\]/.test(r.body)) fail("a failed client read returned an empty view instead of an error");
    } catch (e) { fail(`the endpoint threw on a failed read: ${e.message}`); }
  }
  // ── the rule's own change: a late bill in billing-daily-check's words is a sign, from Month 1 ──
  for (const b of ["overdue", "warning", "paused"]) if (!H.churnState({ now, billing: b, lastLoginAt: ago(1) }).signals.some((s) => s.key === "billing")) fail(`billing "${b}" is not a late-bill sign in churnState`);
  if (H.churnState({ now, billing: "active", lastLoginAt: ago(1) }).signals.some((s) => s.key === "billing")) fail("an active bill is a sign");
  const early = H.churnState({ now, monthNumber: 2, frozen: [], expectMonth: "2026-10-01", billing: "overdue", lastLoginAt: ago(30), callOutcome: { key: "at_risk", month: "2026-10-01" } });
  if (!early.flagged || early.signals.some((s) => s.key === "decline")) fail("in Month 2 the bill, sign-in and call do not raise the flag, or numbers falling counted before Month 4");
  // ── static: wired into To do and the admin; admin only ──
  const om = strip(read("netlify/functions/admin-open-moves.js") || "");
  if (!/_client-health/.test(om) || !/todoMove\(/.test(om)) fail("admin-open-moves does not put the at-risk client in To do");
  const ch = strip(read("shared/client-health.js") || "");
  if (ch && !/H\.churnState\(/.test(ch)) fail("shared/client-health.js does not read Monthly 28's churnState (it must not decide signs itself)");
  if (ch && /STALE_LOGIN_DAYS\s*\*\s*DAY\s*\)\s*\{?\s*\w+\.push\(\{\s*key:\s*"login"/.test(ch)) fail("shared/client-health.js decides the sign-in sign itself");
  const adm = read("admin/admin.js") || "";
  if (!/data-chv-seg/.test(read("admin/index.html") || "") || !/admin-client-health/.test(adm) || !/function chvHtml\(/.test(adm)) fail("the admin Clients view has no Health view");
  for (const f of ["portal/portal.js", "portal/index.html", "netlify/functions/_monthly-report-email.js", ...fs.readdirSync(`${root}/netlify/functions`).filter((x) => /^portal-.*\.js$/.test(x)).map((x) => `netlify/functions/${x}`)]) {
    const t = strip(read(f) || "");
    if (/\bat[ -]risk\b/i.test(t)) fail(`a client-facing file says "at risk": ${f}`);
  }
  return F;
}

function extract(rev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chm28-"));
  try { execFileSync("sh", ["-c", `git -C "$0" archive "$1" shared netlify/functions admin/admin.js admin/index.html portal/portal.js portal/index.html data/playbooks | tar -x -C "$2"`, WEB_GIT, rev, dir], { stdio: ["ignore", "ignore", "pipe"] }); return dir; }
  catch { return null; }
}

if (!fs.existsSync(`${SITE}/shared/monthly-health.js`)) { console.error(`⚠️  INDETERMINATE — cannot read ${SITE}/shared/monthly-health.js`); process.exit(2); }
if (AGAINST) {
  const dir = extract(AGAINST); if (!dir) { console.error(`⚠️  INDETERMINATE — could not read the website at ${AGAINST}`); process.exit(2); }
  const F = await checks(dir); fs.rmSync(dir, { recursive: true, force: true });
  console.log(F.length ? `✗ ${F.length} rule(s) fail at ${AGAINST}:\n${F.map((f) => `  - ${f}`).join("\n")}` : `✓ every rule holds at ${AGAINST}`);
  process.exit(F.length ? 1 : 0);
}
const F = await checks(SITE);
if (F.length) { console.error(`✗ check-client-health-matches-monthly-28: ${F.length} problem(s)\n${F.map((f) => `  - ${f}`).join("\n")}`); process.exit(1); }
// self-proof: the build's before state must fail
const dir = extract(LIVE_BEFORE);
if (!dir) { console.error(`⚠️  INDETERMINATE — could not read the website at ${LIVE_BEFORE} to prove this checker can fail`); process.exit(2); }
const B = await checks(dir); fs.rmSync(dir, { recursive: true, force: true });
if (B.length < MIN_BEFORE_FAILS) { console.error(`⚠️  INDETERMINATE — on the before state (${LIVE_BEFORE}) only ${B.length} rule(s) failed; it must fail ${MIN_BEFORE_FAILS}+ to prove it can tell`); process.exit(2); }
console.log(`✓ check-client-health-matches-monthly-28: the view agrees with Monthly 28 for 9 universal clients; unread is never fine; Month 1 signs, Month 4 numbers; To do for at risk only; admin only (before state ${LIVE_BEFORE}: ${B.length} failures)`);
process.exit(0);
