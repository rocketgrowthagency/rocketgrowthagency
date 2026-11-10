#!/usr/bin/env node
// check-monthly-close.mjs — MONTHLY SECTION 5, "CLOSE THE MONTH" (approved monthly_s5_close_v1, the owner 11-9). Runs the SHIPPED code against FAKES (no network, no model,
// no email: the sender is a recording fake, never Gmail).
//   1 the steps: 21 Freeze (new), 22 Build, 23 Send, 24 Call, 25 Start the next month; one section, in order; 21/22/25 have no Run button and no hand tick; 21-24 skip, 25 has no Skip
//   2 freeze: waits for the whole month (the 2nd), stores Google's figures, "not given" is never 0 and is read again, an expired month is not read, the frozen Google figures are on the 30-day purge list
//   3 build: the letter from the FROZEN record (not from a live read), the same design as Month 1 (hero band, three tiles with change, what we did, Coming next, one portal button, sign-off, no street address),
//     REFUSES with a number missing (says which) and builds the moment it lands
//   4 send: the confirm names the client and the address; a real send is kept in client_monthly_reports (read back) and listed in the portal; the month's marker is set; a test goes to the admin only and changes nothing
//   5 NEVER AUTOMATIC: the 5th's cron (send-monthly-report) builds and sends nothing; nothing but the admin door reaches the sender
//   6 the To do item on the 5th ("Send <client>'s <Month> report")
//   7 the call: optional, offered after the report, "Quarterly review" in months 3, 6, 9, an agenda drafted from the report with no model
//   8 the hand-off: report sent or skipped -> next month opened -> this month closed; closed = read-only; carry-over named; no Skip on 25
//   9 wiring: cards in the admin, ?v= keys, the portal opens on the report, no em dash in what a person reads
// Exit 0 holds · 1 regressed · 2 can't tell
import { oldChromeFailures } from "./_monthly-no-old-chrome.mjs";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = [], fail = (m) => F.push(m);
const read = (r, base = SITE) => { try { return fs.readFileSync(path.join(base, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
const realFetch = globalThis.fetch;
let FETCH = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); };
globalThis.fetch = (...a) => FETCH(...a);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let C, MCS, E, STEPS, PB, SKIP, SEC, GK, OM, SR;
try {
  C = req("../../shared/monthly-close.js"); MCS = req("./_monthly-close.js"); E = req("./_monthly-report-email.js"); STEPS = req("../../shared/steps-57-64.js");
  PB = JSON.parse(read("data/playbooks/playbooks.json")); SKIP = req("./_step-skip.js"); SEC = req("../../shared/monthly-sections.js"); GK = req("./_gbp-keep.js"); OM = req("./_open-month.js"); SR = req("./_step-record.js");
} catch (e) { console.error(`⚠️  INDETERMINATE — a module did not load: ${e.message}`); process.exit(2); }
const d = (s) => Date.parse(`${s}T12:00:00Z`);
const MONTH = "2026-11-01", NEXT = "2026-12-01";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const ID = C.ID;

// 1 the steps
{
  const m2 = PB.month2plus, ids = m2.map((s) => s.id), sec = SEC.SECTIONS.find((s) => s.key === "m2s-close");
  if (JSON.stringify(sec.ids) !== JSON.stringify(C.IDS)) fail(`1 the "Close the month" section must list the five steps in order: ${sec.ids.join(", ")}`);
  for (const id of C.IDS) if (ids.filter((x) => x === id).length !== 1) fail(`1 ${id} must be in the playbook exactly once`);
  for (const s of m2) for (const dep of s.dependsOn || []) if (!ids.includes(dep)) fail(`1 ${s.id} depends on ${dep}, which is not in the playbook`);
  const by = (id) => m2.find((s) => s.id === id) || {};
  if (JSON.stringify(by(ID.BUILD).dependsOn) !== JSON.stringify([ID.FREEZE])) fail("1 the build waits on the freeze");
  if (!(by(ID.SEND).dependsOn || []).includes(ID.BUILD)) fail("1 the send waits on the build");
  if (!(by(ID.NEXT).dependsOn || []).includes(ID.SEND)) fail("1 the hand-off waits on the send");
  for (const id of C.SELF) { const s = by(id); if (id !== ID.NEXT && (s.hasRunner || s.actionLabel)) fail(`1 ${id} must have no Run button (hasRunner/actionLabel)`); if (!STEPS.noHandDone(id)) fail(`1 ${id} must have no hand Mark step complete`); }
  if (by(ID.SEND).hasRunner || by(ID.SEND).actionLabel) fail("1 23 is a card with its own buttons, not a Run button");
  if (!STEPS.noHandDone(ID.SEND)) fail("1 23 finishes by the send itself: no hand tick");
  for (const id of C.SKIPPABLE) { if (!STEPS.canSkip(id)) fail(`1 ${id} must be skippable`); const o = SKIP.offer(id, {}); if (!o.skip) fail(`1 the server must offer Skip on ${id}`); }
  if (STEPS.canSkip(ID.NEXT) || SKIP.offer(ID.NEXT, {}).skip || !SKIP.noSkipWhy(ID.NEXT)) fail("1 25 has no Skip (client and server)");
  const fe = strip(read("netlify/functions/flow-execute.js"));
  for (const id of [ID.BUILD, ID.SEND, ID.FREEZE]) if (new RegExp(`"${id.replace(/\./g, "\\.")}": async`).test(fe)) fail(`1 ${id} must have no model/runner in flow-execute (it builds or sends from its own door)`);
  const mirror = read("flow/playbooks/month2plus.mjs", SCR);
  if (!mirror.includes('id: "m2.report.freeze"')) fail("1 the Scraper mirror must carry the new freeze step");
  if (!/id: "m2\.report\.generate", title: "Build the report"/.test(mirror) || !/id: "m2\.handoff\.next_month", title: "Start the next month"/.test(mirror)) fail("1 the Scraper mirror titles must match the playbook");
  if (SR.scopeOf(ID.FREEZE) !== "month2plus") fail("1 the freeze lives in the monthly record");
  const w = JSON.parse(read("data/playbooks/what-it-does.json")); for (const id of [ID.FREEZE, ID.BUILD, ID.SEND, ID.NEXT]) if (!w.admin[id]) fail(`1 what-it-does has no line for ${id}`);
}

// ── the fakes: one month store, a recording sender, a recording open-month ──
function world({ data = {}, tasks = {}, now = d("2026-12-02"), nums = null, client = {}, closed = false, omFail = null, closeFail = false } = {}) {
  const w = { rec: { scope: "month2plus", id: "r1", client_id: "c1", reporting_month: MONTH, data: { ...data }, tasks: { ...tasks } }, writes: 0, reads: 0, sent: [], kept: [], stamped: [], recorded: [], log: [], nums, closed, now, onboarding: [] };
  w.deps = {
    now: () => w.now, playbook: () => PB.month2plus, supa: async () => [],
    OM: { isClosed: async () => w.closed, readMonth: async () => null,
      openMonth: async (_s, cid, month, o) => { w.log.push(`open:${month}`); w.opened = { month, carry: o.carry }; return omFail ? { ok: false, error: omFail } : { ok: true, id: "n1", created: true }; },
      closeMonth: async (_s, cid, month) => { w.log.push(`close:${month}`); if (closeFail) return { ok: false, error: "still open" }; w.closed = true; return { ok: true, closed: true }; } },
    readStepRecord: async () => ({ ...w.rec, data: { ...w.rec.data }, tasks: JSON.parse(JSON.stringify(w.rec.tasks)) }),
    writeStepTasks: async (rec, tasks) => { if (w.closed) { const e = new Error(OM.CLOSED_MESSAGE); e.closedMonth = true; throw e; } w.writes++; w.log.push("write"); w.rec.data = { ...(rec.data || {}) }; w.rec.tasks = JSON.parse(JSON.stringify(tasks)); w.rec.data.tasks = w.rec.tasks; return w.rec.data; },
    readClient: async () => ({ id: "c1", business_name: "Acme Plumbing", primary_contact_name: "Pat Lee", primary_contact_email: "pat@acme.test", workspace_id: "w1", billing_status: "active", ...client }),
    readNumbers: async () => { w.reads++; if (w.nums instanceof Error) throw w.nums; return w.nums; },
    monthNumber: async () => 3, isNumberedMonth: async () => true,
    gmail: async (o) => { w.sent.push(o); return w.gmailFail ? { ok: false, error: "gmail down" } : { ok: true, id: `msg${w.sent.length}` }; },
    keepReport: async (o) => { w.kept.push(o); return w.keepFail ? { ok: false, error: "no read back" } : { ok: true, kept: true, id: "k1" }; },
    stampOnboarding: async (cid, key, a) => { w.onboarding.push(key); }, stampThisMonth: async () => { w.stamped.push(1); }, record: async (o) => { w.recorded.push(o.kind); },
  };
  return w;
}
const ALL = { cur: { views: 120, clicks: 40, calls: 9 }, prev: { views: 100, clicks: 45, calls: 9 } };

// 2 freeze
{
  const early = world({ now: d("2026-12-01"), nums: ALL });
  const e = await MCS.freeze({ clientId: "c1", month: MONTH, deps: early.deps });
  if (e.state !== "early" || early.reads || early.writes) fail(`2 before the 2nd nothing is read or stored: ${e.state} reads=${early.reads} writes=${early.writes}`);
  const w = world({ nums: ALL });
  const r = await MCS.freeze({ clientId: "c1", month: MONTH, deps: w.deps });
  const fr = w.rec.data.frozen;
  if (r.state !== "complete" || !fr || fr.google.views !== 120 || fr.google.calls !== 9 || fr.other.clicks !== 40 || fr.google.prev_views !== 100) fail(`2 the whole month, once it is in, is stored: ${JSON.stringify(fr)}`);
  if (w.rec.tasks[ID.FREEZE].status !== "done" || w.rec.tasks[ID.FREEZE].done_by !== "checks") fail("2 the step settles itself when the numbers are stored");
  if ("clicks" in fr.google || "views" in fr.other) fail("2 only Google-sourced figures sit under frozen.google (the part the 30-day purge clears)");
  const again = await MCS.freeze({ clientId: "c1", month: MONTH, deps: w.deps }), before = w.writes;
  if (again.state !== "already" || w.writes !== before) fail("2 a frozen month is not read or rewritten");
  // a number Google did not give: "not given", never 0, the step is not done, read again, and a later answer completes it
  const p = world({ nums: { cur: { views: 120, clicks: 40, calls: null }, prev: ALL.prev } });
  const pr = await MCS.freeze({ clientId: "c1", month: MONTH, deps: p.deps });
  if (pr.state !== "partial" || JSON.stringify(pr.missing) !== '["Call taps"]') fail(`2 a missing number is named: ${JSON.stringify(pr)}`);
  if (p.rec.data.frozen.google.calls !== null || p.rec.data.frozen.status.calls !== "not_given") fail("2 a number Google didn't give is stored as not given (null), never 0");
  if (p.rec.tasks[ID.FREEZE]) fail("2 a partial freeze must not settle the step");
  const v = C.freezeView({ month: MONTH, now: p.now, frozen: p.rec.data.frozen, task: {} });
  if (!/Call taps: not given/.test(JSON.stringify(v.rows)) || /Call taps: 0/.test(JSON.stringify(v.rows)) || v.done) fail("2 the card says Call taps was not given, never 0");
  p.nums = ALL; const same = await MCS.freeze({ clientId: "c1", month: MONTH, deps: p.deps });
  if (same.state !== "complete" || p.rec.data.frozen.google.calls !== 9 || p.rec.tasks[ID.FREEZE].status !== "done") fail("2 the number landing completes the freeze");
  // a measured 0 is still 0
  const z = world({ nums: { cur: { views: 120, clicks: 0, calls: 0 }, prev: ALL.prev } }); await MCS.freeze({ clientId: "c1", month: MONTH, deps: z.deps });
  if (z.rec.data.frozen.google.calls !== 0 || z.rec.data.frozen.other.clicks !== 0) fail("2 a measured 0 stays 0");
  // the read failing is "not given" for all three
  const bad = world({ nums: new Error("google down") }); const br = await MCS.freeze({ clientId: "c1", month: MONTH, deps: bad.deps });
  if (br.state !== "partial" || bad.rec.data.frozen.google.views !== null || bad.rec.tasks[ID.FREEZE]) fail("2 a failed read is not given, never a number, never done");
  // a complete freeze is never replaced by a worse read
  w.nums = { cur: { views: null, clicks: null, calls: null }, prev: {} }; w.rec.tasks = {}; await MCS.freeze({ clientId: "c1", month: MONTH, deps: w.deps });
  if (w.rec.data.frozen.google.views !== 120) fail("2 a complete freeze must not be overwritten by a worse read");
  // the 30-day rule: an expired month is not read; the frozen Google figures and the unsent letter are on the purge list
  const old = world({ now: d("2027-01-12"), nums: ALL }); const ex = await MCS.freeze({ clientId: "c1", month: MONTH, deps: old.deps });
  if (ex.state !== "expired" || old.reads || old.writes) fail(`2 a month past its 30 days is not read or stored: ${ex.state}`);
  const ev = C.freezeView({ month: MONTH, now: old.now, frozen: null, task: {}, expired: true });
  if (!/past the 30 days/.test(JSON.stringify(ev.rows))) fail("2 the card says why");
  const keys = GK.GOOGLE_JSON_KEYS.filter((k) => k.table === "client_monthly_records");
  if (!keys.some((k) => k.path === "frozen.google" && k.stamp === "frozen.at")) fail("2 frozen.google must be on the 30-day purge list");
  if (!keys.some((k) => k.path === "report_draft" && k.stamp === "report_draft.built_at")) fail("2 the unsent letter (it carries the figures) must be on the purge list");
  if (JSON.stringify(Object.keys(fr.other)) !== '["clicks","prev_clicks"]') fail("2 frozen.other holds only Search Console figures");
  const doneAfterPurge = C.freezeView({ month: MONTH, now: old.now, frozen: { at: fr.at, status: fr.status, other: fr.other }, task: { status: "done" } });
  if (!doneAfterPurge.done || /not given|Waiting/i.test(doneAfterPurge.label)) fail("2 a frozen month whose Google figures were purged reads Frozen, not Waiting");
}

// 3 build
const REVIEW_TASKS = { "m2.exec.gbp_posts": { status: "done", completed_at: "2026-11-12T10:00:00Z" }, "m2.exec.site_audit_recurring": { status: "done", completed_at: "2026-11-05T10:00:00Z" } };
let LETTER = null;
{
  const w = world({ nums: ALL, tasks: REVIEW_TASKS });
  await MCS.freeze({ clientId: "c1", month: MONTH, deps: w.deps }); const reads = w.reads;
  w.now = d("2026-12-03");
  const b = await MCS.build({ clientId: "c1", month: MONTH, deps: w.deps });
  if (b.state !== "built" || w.reads !== reads) fail(`3 the letter is built from the FROZEN record, never a new live read: ${b.state}, reads ${w.reads} vs ${reads}`);
  const dr = w.rec.data.report_draft; LETTER = dr;
  if (!dr || !dr.html || !dr.text || !dr.subject) fail("3 the letter is stored on the month's record");
  else {
    const h = dr.html, plain = h.replace(/<[^>]+>/g, " ");
    if (!/eef3ff/.test(h)) fail("3 the hero band (heroHtml) is missing");
    for (const l of ["Profile views", "Search clicks", "Call taps"]) if (!h.includes(l)) fail(`3 the tile "${l}" is missing`);
    if (!/>120</.test(h) || !/>40</.test(h) || !/>9</.test(h)) fail("3 the three numbers are shown");
    if (!/▲ 20 from 100/.test(h) || !/▼ 5 from 45/.test(h) || !/same as 9 the month before/.test(h)) fail("3 each tile carries its change against the month before");
    if (!/Posted an update to your Google profile/.test(h) || !/What we did/.test(h)) fail("3 what we did, in the client's words");
    if (!/Coming next/.test(h)) fail("3 Coming next");
    if ((h.match(/href="https:\/\/www\.rocketgrowthagency\.com\/portal\/#report-2026-11"/g) || []).length !== 1) fail("3 exactly one button, to the portal's Reports opened on this report");
    if (!/Questions\? Just reply to this email\.[\s\S]*Chris, Rocket Growth Agency/.test(h)) fail("3 the sign-off");
    if (/Jefferson|Culver City, CA|9937/.test(h + dr.text)) fail("3 no street address in a client email");
    if (/—/.test(plain + dr.text + dr.subject)) fail("3 no em dash in what the client reads");
    if (/Rocket Growth Agency\s*·\s*9937/.test(h)) fail("3 no postal line");
    if (dr.subject !== "November report: Acme Plumbing") fail(`3 subject: ${dr.subject}`);
    if (/\bGBP\b|m2\.|skip reason|undefined|NaN|\[object/.test(plain)) fail("3 no internal words in the letter");
  }
  if (w.rec.tasks[ID.BUILD].status !== "done" || !/Profile views 120, Search clicks 40, Call taps 9/.test(w.rec.tasks[ID.BUILD].auto_result.summary)) fail("3 the build settles itself and says what it built");
  const again = await MCS.build({ clientId: "c1", month: MONTH, deps: w.deps }), n = w.writes;
  if (again.state !== "already" || w.writes !== n) fail("3 a built letter is not built twice");
  // REFUSES with a number missing, names it, writes no letter, builds the moment it lands
  const m = world({ nums: { cur: { views: 120, clicks: 40, calls: null }, prev: ALL.prev }, tasks: REVIEW_TASKS });
  await MCS.freeze({ clientId: "c1", month: MONTH, deps: m.deps });
  const rb = await MCS.build({ clientId: "c1", month: MONTH, deps: m.deps });
  if (rb.state !== "waiting" || JSON.stringify(rb.missing) !== '["Call taps"]' || m.rec.data.report_draft || m.rec.tasks[ID.BUILD]) fail(`3 a missing number refuses the build and says which: ${JSON.stringify(rb)}`);
  const bv = C.buildView({ month: MONTH, task: {}, frozen: m.rec.data.frozen, draft: null });
  if (!/Call taps isn't in yet/.test(JSON.stringify(bv.rows)) || bv.done) fail("3 the card says which number is missing");
  const direct = E.buildMonthlyEmail({ month: MONTH, frozen: m.rec.data.frozen, client: {}, playbook: PB.month2plus, tasks: {} });
  if (direct.ok || direct.html) fail("3 the letter builder itself refuses with a number missing (it never prints 0)");
  m.nums = ALL; await MCS.freeze({ clientId: "c1", month: MONTH, deps: m.deps });
  const ok = await MCS.build({ clientId: "c1", month: MONTH, deps: m.deps });
  if (ok.state !== "built" || !m.rec.data.report_draft || m.rec.data.report_waiting) fail("3 it builds the moment the number lands and clears the waiting note");
  const sk = world({ tasks: { [ID.FREEZE]: { status: "skipped", skip_reason: "paused" } } });
  if ((await MCS.build({ clientId: "c1", month: MONTH, deps: sk.deps })).state !== "skipped" && (await MCS.build({ clientId: "c1", month: MONTH, deps: sk.deps })).state !== "no_freeze") fail("3 a skipped freeze builds nothing");
}

// 4 send
const builtWorld = (extra = {}) => { const w = world({ nums: ALL, tasks: REVIEW_TASKS, ...extra }); return w; };
async function ready(w) { await MCS.freeze({ clientId: "c1", month: MONTH, deps: w.deps }); w.now = d("2026-12-05"); await MCS.build({ clientId: "c1", month: MONTH, deps: w.deps }); return w; }
{
  const txt = C.confirmText("Acme Plumbing", "pat@acme.test", MONTH);
  if (!/Acme Plumbing/.test(txt) || !/pat@acme\.test/.test(txt) || !/November/.test(txt)) fail(`4 the outward confirm names the client and the address: ${txt}`);
  const w = await ready(builtWorld());
  // test: the same email, [Test], to the admin only, no record changes
  const before = JSON.stringify(w.rec), wr = w.writes;
  const t = await MCS.sendReport({ clientId: "c1", month: MONTH, test: true, adminEmail: "chris@rga.test", deps: w.deps });
  if (t.status !== 200 || !t.body.test || w.sent.length !== 1 || w.sent[0].to !== "chris@rga.test" || !/^\[Test\] November report/.test(w.sent[0].subject) || w.sent[0].html !== LETTER.html && w.sent[0].html !== w.rec.data.report_draft.html) fail(`4 the test goes to the admin only, marked [Test]: ${JSON.stringify(w.sent[0] && { to: w.sent[0].to, s: w.sent[0].subject })}`);
  if (JSON.stringify(w.rec) !== before || w.writes !== wr || w.kept.length || w.recorded.length || w.onboarding.length || w.stamped.length) fail("4 a test changes no record: no marker, nothing kept, no activity");
  const nm = await MCS.sendReport({ clientId: "c1", month: MONTH, test: true, adminEmail: "", deps: w.deps });
  if (nm.status === 200 || w.sent.length !== 1) fail("4 a test with no signed-in address sends nothing");
  // real send
  w.sent.length = 0;
  const r = await MCS.sendReport({ clientId: "c1", month: MONTH, deps: w.deps });
  if (r.status !== 200 || w.sent.length !== 1 || w.sent[0].to !== "pat@acme.test" || /^\[Test\]/.test(w.sent[0].subject)) fail(`4 the real send goes to the client's address: ${r.status} ${w.sent[0] && w.sent[0].to}`);
  if (w.kept.length !== 1 || w.kept[0].reportingMonth !== MONTH || w.kept[0].monthNumber !== 3 || w.kept[0].html !== w.sent[0].html || w.kept[0].sentTo !== "pat@acme.test" || !w.kept[0].gmailMessageId) fail("4 the report as sent is kept (client_monthly_reports) with the month, its number, the html, the address and the Gmail id");
  if (w.rec.tasks[ID.SEND].status !== "done" || w.rec.tasks[ID.SEND].auto_result.sent_to !== "pat@acme.test" || !w.rec.data.report_sent || w.rec.data.report_sent.to !== "pat@acme.test") fail("4 the month's report marker is set and the step is Done with the proof");
  if (!w.onboarding.includes("monthly_report_2026-11") || !w.recorded.includes("monthly_report_sent")) fail("4 the send is recorded");
  const again = await MCS.sendReport({ clientId: "c1", month: MONTH, deps: w.deps });
  if (!again.body.already || w.sent.length !== 1) fail("4 a second press sends nothing");
  const sv = C.sendView({ task: w.rec.tasks[ID.SEND], draft: LETTER, month: MONTH, client: { name: "Acme", email: "pat@acme.test" } });
  if (sv.canSend || !sv.done || !/Sent Dec 5 to pat@acme\.test/.test(sv.rows[0].title)) fail(`4 the card reads Sent with the date and address: ${sv.rows[0].title}`);
  // failures: a failed send marks nothing; a failed keep is said and never undoes the send; no email / no report / paused
  const f = await ready(builtWorld()); f.gmailFail = true;
  const fr = await MCS.sendReport({ clientId: "c1", month: MONTH, deps: f.deps });
  if (fr.status !== 502 || f.rec.tasks[ID.SEND] || f.kept.length || f.rec.data.report_sent) fail("4 a failed send marks nothing and keeps nothing");
  const k = await ready(builtWorld()); k.keepFail = true;
  const kr = await MCS.sendReport({ clientId: "c1", month: MONTH, deps: k.deps });
  if (kr.status !== 200 || kr.body.kept.ok !== false || k.rec.tasks[ID.SEND].status !== "done") fail("4 a keep that does not read back is said, and the send stands");
  const ne = await ready(builtWorld({ client: { primary_contact_email: "" } }));
  if ((await MCS.sendReport({ clientId: "c1", month: MONTH, deps: ne.deps })).status !== 409 || ne.sent.length) fail("4 no contact email: nothing sent");
  const nb = builtWorld(); if ((await MCS.sendReport({ clientId: "c1", month: MONTH, deps: nb.deps })).status !== 409 || nb.sent.length) fail("4 no report built: nothing sent");
  const pa = await ready(builtWorld({ client: { billing_status: "paused" } })); if ((await MCS.sendReport({ clientId: "c1", month: MONTH, deps: pa.deps })).status !== 409 || pa.sent.length) fail("4 a paused client gets no report");
  const sk = await ready(builtWorld()); sk.rec.tasks[ID.SEND] = { status: "skipped", skip_reason: "paused" }; if ((await MCS.sendReport({ clientId: "c1", month: MONTH, deps: sk.deps })).status !== 409 || sk.sent.length) fail("4 a skipped report is not sent");
  // the real keepReport: a row the portal's Reports list returns, read back
  const rows = [];
  const fakeSupa = async (p, init = {}) => {
    if (p.startsWith("/client_monthly_reports?select=id&limit=1")) return [];
    if (init.method === "POST" && p.startsWith("/client_monthly_reports")) { const row = { id: "rid1", ...JSON.parse(init.body) }; rows.push(row); return [row]; }
    if (p.startsWith("/client_monthly_reports?client_id")) return rows.map((x) => ({ id: x.id, reporting_month: x.reporting_month, month_number: x.month_number, subject: x.subject, sent_at: x.sent_at }));
    return [];
  };
  OM.__resetDetect();
  const kept = await OM.keepReport(fakeSupa, { clientId: "c1", reportingMonth: MONTH, monthNumber: 3, subject: "November report: Acme Plumbing", html: LETTER.html, text: LETTER.text, sentAt: "2026-12-05T17:00:00Z", sentTo: "pat@acme.test", gmailMessageId: "m1" });
  if (!kept.ok || !kept.kept || rows.length !== 1) fail(`4 keepReport keeps the sent report: ${JSON.stringify(kept)}`);
  const MR = req("./monthly-reports.js"); MR.__useDeps({ supa: fakeSupa, gate: { ok: true, viaWorkspace: false } });
  const list = await MR.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111" }), headers: {} });
  const lj = JSON.parse(list.body || "{}"); MR.__useDeps(null);
  if (list.statusCode === 200 && !(lj.reports || []).some((x) => x.reporting_month === MONTH && x.subject === "November report: Acme Plumbing")) fail("4 the kept report appears in the portal's Reports list");
}

// 5 NEVER AUTOMATIC
{
  const SMR = "netlify/functions/send-monthly-report.js", src = strip(read(SMR));
  const handler = src.slice(src.indexOf("exports.handler = async"), src.indexOf("function _r(") > 0 ? src.indexOf("function _r(") : src.indexOf("async function buildReport"));
  if (/sendGmail\(|sendOne\(|\.gmail\(|Gmail|gmail\.googleapis/.test(handler)) fail("5 the 5th's handler must not send: it still reaches a sender");
  if (/sendOne/.test(src)) fail("5 sendOne (the old automatic send) must be gone");
  const toml = read("netlify.toml");
  if (!/\[functions\."send-monthly-report"\]\s*\n\s*schedule = "0 9 5 \* \*"/.test(toml) || !/NO LONGER EMAILS CLIENTS/.test(toml)) fail("5 the cron stays on the 5th and says it no longer emails");
  // run the real handler (scheduled + a client in service) against fakes: it must build and send NOTHING
  const w = world({ nums: ALL, tasks: REVIEW_TASKS, now: d("2026-12-05") });
  const orig = MCS.defaultDeps; MCS.defaultDeps = () => w.deps;
  const GM = req("./send-monthly-report.js"); let hit = 0;
  FETCH = async (url, init) => { hit++; const u = String(url); const j = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b), json: async () => b });
    if (u.includes("/clients?client_portal_stage=in")) return j([{ id: "c1", business_name: "Acme Plumbing" }]);
    if (u.includes("/clients?id=eq")) return j([{ id: "c1", business_name: "Acme Plumbing" }]);
    return j([]); };
  try {
    const res = await GM.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ next_run: "2026-12-05T09:00:00Z" }) });
    const body = JSON.parse(res.body || "{}");
    if (res.statusCode !== 200 || body.sent !== 0 || w.sent.length) fail(`5 the cron path sent: ${res.statusCode} sent=${body.sent} gmail=${w.sent.length}`);
    if (body.dispatched !== 1 || body.built !== 1 || !w.rec.data.report_draft || w.rec.tasks[ID.SEND]) fail(`5 the cron path must BUILD (and leave 23 for RGA): ${JSON.stringify(body)}`);
    const one = await GM.handler({ httpMethod: "POST", headers: { "x-internal-secret": "x" }, body: JSON.stringify({ client_id: "11111111-1111-1111-1111-111111111111" }) });
    if (w.sent.length || /sent_to|message_id/.test(one.body)) fail("5 a single-client call must build only, never send");
  } finally { MCS.defaultDeps = orig; FETCH = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); }; }
  // nothing else can reach the sender: only the admin door calls sendReport
  const fnDir = path.join(SITE, "netlify/functions"); const callers = [];
  for (const f of fs.readdirSync(fnDir).filter((x) => x.endsWith(".js"))) if (/\bsendReport\(/.test(strip(fs.readFileSync(path.join(fnDir, f), "utf8")))) callers.push(f);
  if (JSON.stringify(callers.sort()) !== JSON.stringify(["_monthly-close.js", "admin-monthly-close.js"])) fail(`5 only the admin door may call sendReport: ${callers}`);
  const mr = strip(read("netlify/functions/_morning-run.js")), mc = strip(read("netlify/functions/_monthly-close.js"));
  if (/sendReport|sendGmail|\.gmail\(/.test(mr)) fail("5 the morning run must never send");
  const closeMorning = mc.slice(mc.indexOf("async function closeMorning"), mc.indexOf("function todoFor"));
  if (/sendReport|gmail/.test(closeMorning)) fail("5 closeMorning (21, 22, 25) must never send");
  const door = strip(read("netlify/functions/admin-monthly-close.js"));
  if (!/requireWorkspaceForClient/.test(door) || !/action === "test"/.test(door) || !/gate\.email/.test(door)) fail("5 the door is admin-gated and the test goes to the signed-in admin");
  const toolbar = read("netlify/functions/_job-manifest.js"); if (!/Monthly report build \(never sends\)/.test(toolbar)) fail("5 the job list says the 5th's run never sends");
}

// 6 the To do item on the 5th
let M1_CLOSED = true;
{
  const w = await ready(builtWorld());
  const data = w.rec.data, mv = (now, sendTask) => MCS.todoFor({ client: "Acme Plumbing", month: MONTH, data: { ...data, tasks: { ...w.rec.tasks, ...(sendTask ? { [ID.SEND]: sendTask } : {}) } }, now });
  if (mv("2026-12-04T23:00:00Z")) fail("6 nothing before the 5th");
  const m = mv("2026-12-05T08:00:00Z");
  if (!m || m.owner !== "rga" || m.step !== "Send Acme Plumbing's November report" || m.step_id !== ID.SEND || m.since !== "2026-12-05T00:00:00.000Z") fail(`6 on the 5th RGA gets "Send Acme Plumbing's November report": ${JSON.stringify(m)}`);
  if (mv("2026-12-05T08:00:00Z", { status: "done" }) || mv("2026-12-05T08:00:00Z", { status: "skipped" })) fail("6 the item goes once the report is sent or skipped");
  const nb = MCS.todoFor({ client: "Acme", month: MONTH, data: { tasks: {}, report_waiting: { missing: ["Call taps"] } }, now: "2026-12-06T08:00:00Z" });
  if (!nb || !/Call taps/.test(nb.what)) fail("6 an unbuilt report still reaches the To do, saying which number is missing");
  // the real queue door, on fakes
  const OMV = req("./admin-open-moves.js");
  FETCH = async (url) => { const u = String(url); const j = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes("/clients?")) return j([{ id: "c1", business_name: "Acme Plumbing", portal_mode: null }]);
    if (u.includes("/client_monthly_records")) return j([{ client_id: "c1", reporting_month: MONTH, data: { ...data, tasks: w.rec.tasks } }]);
    if (u.includes("/client_onboarding_records")) return j(M1_CLOSED ? [{ client_id: "c1", data: { tasks: { "m1.handoff.month2": { status: "done", completed_at: "2026-08-20T10:00:00Z" } } } }] : []);   // monthly_fix_v2: only a numbered month has close items
    return j([]); };
  M1_CLOSED = true;
  try {
    const moves = await OMV.movesForWorkspace({ workspaceId: "w1", now: "2026-12-05T10:00:00.000Z" });
    const mine = moves.find((x) => x.kind === "monthly_report");
    if (!mine || mine.owner !== "rga" || mine.client !== "Acme Plumbing" || mine.late !== false) fail(`6 the To do queue carries the item: ${JSON.stringify(mine)}`);
    const early = await OMV.movesForWorkspace({ workspaceId: "w1", now: "2026-12-04T10:00:00.000Z" });
    if (early.some((x) => x.kind === "monthly_report")) fail("6 the queue shows nothing before the 5th");
    // monthly_fix_v2 (RGA's Sep/Oct/Nov rows): a month BEFORE the monthly cycle (Month 1 never closed, or the row is older than Month 2) is never chased
    M1_CLOSED = false;
    const legacy = await OMV.movesForWorkspace({ workspaceId: "w1", now: "2026-12-20T10:00:00.000Z" });
    if (legacy.some((x) => x.kind === "monthly_report")) fail("6b an unnumbered (pre-cycle) month put 'Send the report' in the To do");
  } finally { FETCH = async (url) => { throw new Error(`the gate must not touch the network: ${url}`); }; }
}

// 7 the call
{
  for (const [n, want] of [[3, "Quarterly review"], [6, "Quarterly review"], [9, "Quarterly review"], [12, "Quarterly review"], [2, "Monthly call"], [4, "Monthly call"], [5, "Monthly call"], [1, "Monthly call"], [null, "Monthly call"]]) if (C.callLabel(n) !== want) fail(`7 month ${n} reads "${C.callLabel(n)}", wanted "${want}"`);
  const frozen = { at: "2026-12-02T12:00:00Z", status: {}, google: { views: 120, calls: 9, prev_views: 100, prev_calls: 9 }, other: { clicks: 40, prev_clicks: 45 } };
  const before = C.callView({ task: {}, month: MONTH, monthNumber: 3, reportSettled: false, frozen });
  if (before.agenda || before.done || !/Offered once November's report is sent or skipped/.test(before.rows[0].title)) fail("7 the call is offered after the report, not before");
  const after = C.callView({ task: {}, month: MONTH, monthNumber: 3, reportSettled: true, frozen });
  if (after.title !== "Quarterly review" || !after.agenda || !/Quarter in review/.test(after.agenda.lines.join("\n"))) fail("7 a quarter month reads Quarterly review and the agenda has the quarter in review");
  const plain = C.callView({ task: {}, month: MONTH, monthNumber: 4, reportSettled: true, frozen });
  if (plain.title !== "Monthly call" || /Quarter in review/.test(plain.agenda.lines.join("\n"))) fail("7 an ordinary month is a plain monthly call");
  const ag = plain.agenda.lines.join("\n");
  if (!/Profile views: 120 \(▲ 20 from 100\)/.test(ag) || !/Search clicks: 40/.test(ag) || !/Call taps: 9/.test(ag)) fail("7 the agenda is drafted from the report's numbers");
  const noCall = C.callView({ task: { status: "skipped", skip_reason: "client declined" }, month: MONTH, monthNumber: 4, reportSettled: true, frozen });
  if (!noCall.done || !/client declined/.test(JSON.stringify(noCall.rows))) fail("7 the call can be skipped with a reason");
  const held = C.callView({ task: { status: "done", call_outcome: "retained", call_outcome_label: "Retained" }, month: MONTH, monthNumber: 4, reportSettled: true, frozen });
  if (!held.done || !/Retained/.test(JSON.stringify(held.rows))) fail("7 the outcome is a few lines on the card");
  if (!STEPS.canSkip(ID.CALL)) fail("7 the call is skippable");
  const a = strip(read("admin/admin.js")), card = a.slice(a.indexOf("function clsCallCardHtml"), a.indexOf("function clsNextCardHtml"));
  if (/aiDraft|fetch\(|draft-agenda|model/i.test(card)) fail("7 the agenda is drafted without a model or a call");
  if (!/callOutcomeHtml\(t\)/.test(a.slice(a.indexOf('id === "m2.call.monthly" ? clsCallCardHtml'), a.indexOf('id === "m2.call.monthly" ? clsCallCardHtml') + 400))) fail("7 the call keeps its outcome card (Retained, At risk, Churned)");
}

// 8 the hand-off
{
  const OPEN = { "m2.exec.review_push": { status: "pending" }, "m2.exec.gbp_posts": { status: "skipped", skip_reason: "no photos this month" } };
  const wait = world({ tasks: { ...OPEN } });
  const wr = await MCS.advanceMonth({ clientId: "c1", month: MONTH, deps: wait.deps });
  if (wr.state !== "waiting" || wait.log.length) fail(`8 with the report neither sent nor skipped nothing opens or closes: ${wr.state} ${wait.log}`);
  const sent = world({ tasks: { ...OPEN, [ID.SEND]: { status: "done" } } });
  const ar = await MCS.advanceMonth({ clientId: "c1", month: MONTH, deps: sent.deps });
  if (ar.state !== "started" || JSON.stringify(sent.log) !== JSON.stringify([`open:${NEXT}`, "write", `close:${MONTH}`])) fail(`8 the order is open next, record, THEN close this one: ${JSON.stringify(sent.log)}`);
  const carry = sent.opened && sent.opened.carry;
  if (!carry || carry.from !== MONTH || !(carry.open || []).some((x) => /review|Review/.test(x.title || "")) || !(carry.skipped || []).some((x) => /no photos this month/.test(x.reason || ""))) fail(`8 the carry-over names what is open and what was skipped with its reason: ${JSON.stringify(carry)}`);
  if (sent.rec.tasks[ID.NEXT].status !== "done" || sent.rec.tasks[ID.NEXT].done_by !== "checks") fail("8 25 settles itself");
  const nv = C.nextView({ tasks: { [ID.SEND]: { status: "done" }, [ID.NEXT]: { status: "done" } }, month: MONTH, nextMonth: NEXT, closed: true, carry });
  if (!/December is running and November is closed/.test(nv.rows[0].title) || !/read-only/.test(nv.rows[0].line)) fail(`8 the card says it: ${nv.rows[0].title}`);
  const skipped = world({ tasks: { ...OPEN, [ID.SEND]: { status: "skipped", skip_reason: "client paused" } } });
  if ((await MCS.advanceMonth({ clientId: "c1", month: MONTH, deps: skipped.deps })).state !== "started") fail("8 a skipped report still opens the next month");
  const bad = world({ tasks: { [ID.SEND]: { status: "done" } }, omFail: "boom" }); const br = await MCS.advanceMonth({ clientId: "c1", month: MONTH, deps: bad.deps });
  if (br.ok || bad.log.some((x) => x.startsWith("close")) || bad.closed) fail("8 if the next month did not open, this month is NOT closed");
  const cf = world({ tasks: { [ID.SEND]: { status: "done" } }, closeFail: true }); const cr = await MCS.advanceMonth({ clientId: "c1", month: MONTH, deps: cf.deps });
  if (cr.ok) fail("8 a close that does not read back is an error, not a start");
  const closed = world({ tasks: { [ID.SEND]: { status: "done" } }, closed: true }); const clr = await MCS.advanceMonth({ clientId: "c1", month: MONTH, deps: closed.deps });
  if (clr.state !== "already" || closed.log.length) fail("8 a closed month is not opened or closed again");
  // a closed month is read-only for every writer: the real writeStepTasks refuses
  const fakeSupa = async (p) => { if (p.includes("select=month_status,opened_at")) return [{}]; if (p.includes("select=month_status&limit=1")) return [{ month_status: "closed" }]; return []; };
  OM.__resetDetect(); let refused = false;
  try { await SR.writeStepTasks(fakeSupa, { scope: "month2plus", reporting_month: MONTH, client_id: "c1", id: "r1", data: {} }, {}); } catch (e) { refused = !!e.closedMonth; }
  if (!refused) fail("8 a closed month must refuse every write (read-only)");
  const lateFreeze = world({ closed: true, nums: ALL }); let thrown = false; try { await MCS.freeze({ clientId: "c1", month: MONTH, deps: lateFreeze.deps }); } catch (e) { thrown = !!e.closedMonth; }
  if (!thrown) fail("8 freezing a closed month is refused");
  // the whole morning for the month that just ended: freeze, build, wait for RGA; then advance after the press
  const mw = world({ nums: ALL, tasks: REVIEW_TASKS, now: d("2026-12-03") });
  const m1 = await MCS.closeMorning({ clientId: "c1", month: MONTH, deps: mw.deps });
  if (!m1.froze || !m1.built || m1.started || mw.sent.length || mw.log.includes(`open:${NEXT}`)) fail(`8 the morning freezes and builds and then WAITS for RGA, sending nothing: ${JSON.stringify(m1)}`);
  mw.now = d("2026-12-06"); await MCS.sendReport({ clientId: "c1", month: MONTH, deps: mw.deps });
  const m2 = await MCS.closeMorning({ clientId: "c1", month: MONTH, deps: mw.deps });
  if (!m2.started || JSON.stringify(mw.log.filter((x) => /^(open|close)/.test(x))) !== JSON.stringify([`open:${NEXT}`, `close:${MONTH}`])) fail(`8 after the send the morning starts the next month: ${JSON.stringify(m2)} ${mw.log}`);
  // the runner and the morning run use that one order
  const fe = strip(read("netlify/functions/flow-execute.js")), run = fe.slice(fe.indexOf('["m2.handoff.next_month", true]'), fe.indexOf("exports.stepRunners"));
  if (!/advanceMonth\(/.test(run) || /OM\.closeMonth\(/.test(run)) fail("8 the hand-off runner goes through advanceMonth (send/skip, open next, close this)");
  const mrs = strip(read("netlify/functions/_morning-run.js"));
  if (!/closePrevious\(c\.id, OM\.addMonths\(monthKey, -1\)\)/.test(mrs)) fail("8 the morning run closes the month that just ended");
  // 25: no Skip, no button, no hand tick
  const a = strip(read("admin/admin.js")), nx = a.slice(a.indexOf("function clsNextCardHtml"), a.indexOf('document.addEventListener("click", async (e) => {', a.indexOf("function clsNextCardHtml")));
  if (!/noSkip: true/.test(nx) || /acts:|Run the|data-uni-run/.test(nx)) fail("8 the Start-the-next-month card has no Skip and no button");
  if (!STEPS.noHandDone(ID.NEXT)) fail("8 25 has no hand tick");
}

// 9 wiring
{
  const a = read("admin/admin.js"), as = strip(a), ih = read("admin/index.html"), ph = read("portal/index.html"), p = read("portal/portal.js");
  const s5 = a.indexOf("MONTHLY · SECTION 5"), sec = strip(a.slice(s5, a.indexOf("// ── step 64 · into the monthly cycle", s5)));
  if (s5 < 0 || sec.length < 500) fail("9 the section 5 card code was not found in the admin");
  for (const f of ["clsFreezeCardHtml", "clsBuildCardHtml", "clsSendCardHtml", "clsCallCardHtml", "clsNextCardHtml"]) if (!new RegExp(`function ${f}\\(`).test(as)) fail(`9 ${f} is missing`);
  for (const id of [ID.FREEZE, ID.BUILD, ID.SEND, ID.NEXT]) if (!new RegExp(`id === "${id.replace(/\./g, "\\.")}" \\? cls`).test(as)) fail(`9 ${id} must render its close-the-month card`);
  if (/⚡|Mark step complete|data-uni-run|data-run-step|Run the |>Run</i.test(sec)) fail("9 the section 5 cards must carry no Run button and no hand tick");
  if (!/uniNoRowRun = \(id\) => [^\n]*rgaMonthlyClose/.test(a)) fail("9 the row has no Run button for 21, 22 and 25");
  if (!/rgaDialog\(\{ kind: "confirm", tone: "outward"[\s\S]{0,200}C\.confirmText\(name, to, month\)/.test(as)) fail("9 Send must ask once more, naming the recipient (outward confirm)");
  if (!/data-cls-send/.test(as) || !/data-cls-test/.test(as) || !/Read the report/.test(as) || !/Send me a test/.test(as)) fail("9 the card carries Read the report, Send to <email> and Send me a test");
  if (!/Send to \$\{v\.to\}/.test(as)) fail("9 the send button names the address");
  if (!/import "\/shared\/monthly-close\.js\?v=20261109a"/.test(a)) fail("9 the admin imports shared/monthly-close.js");
  if (!/monthly-sections\.js\?v=20261109e/.test(a) || !/steps-57-64\.js\?v=20261109h/.test(a)) fail("9 the changed shared files need new ?v= keys");
  if (!/admin\.js\?v=20261109t/.test(ih) || !/admin\.css\?v=20261109h/.test(ih)) fail("9 admin.js / admin.css ?v= keys must be bumped (t, h)");
  if (!/portal\.js\?v=20261109j/.test(ph)) fail("9 portal.js ?v= must be bumped (j)");
  if (!/#report-\\d\{4\}-\\d\{2\}/.test(p) || !/data-mr-month/.test(p) || !/function openMonthlyReport/.test(p)) fail("9 the portal opens the Reports tab on that month's report (#report-YYYY-MM)");
  const band = ["shared/monthly-close.js", "netlify/functions/_monthly-report-email.js"].map((f) => strip(read(f))).join("\n");
  const said = band.match(/"[^"\n]{12,}"|`[^`\n]{12,}`/g) || [];
  if (said.some((s) => /—/.test(s))) fail("9 no em dash in text a person reads");
  const cardText = (sec.match(/"[^"\n]{12,}"|`[^`\n]{12,}`/g) || []); if (cardText.some((s) => /—/.test(s))) fail("9 no em dash in the card text");
  if (!/rgaDialog/.test(a) || /sendGmail|gmail/.test(sec)) fail("9 the admin never reaches Gmail itself");
}

// monthly_fix_v2 (11-9): the OLD pieces must be gone too, not only the new ones present (one card per row, the To do for numbered months, Open the month settled, the quarter preview, the bottom blocks)
for (const m of oldChromeFailures(SITE)) fail(m);
if (F.length) { console.error(`❌ ${F.length} problem(s):\n` + F.map((x) => " · " + x).join("\n")); process.exit(1); }
console.log("✅ check-monthly-close: the five steps, the freeze (not given is never 0, the 30-day rule), the letter from the frozen record that refuses a missing number, the send (named confirm, kept, listed, test to the admin only), nothing automatic, the To do on the 5th, the optional call, and the send/skip -> open -> close hand-off all hold.");
