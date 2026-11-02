#!/usr/bin/env node
// check-legacy-runners-retired-and-reports-built-here.mjs — batch 4 item 10 (approved m1-29 / m1-34 / m1-35 / m1-59 / m2-24).
//   · row 29 (verify) returned a canned paragraph and never read Google → it measures hasVoiceOfMerchant (_gbp-verify)
//   · rows 34 / 35 had AI "worksheets" nothing reads → retired (no runner, hasRunner false)
//   · Monthly 24 + Month 1 59 said "run node report.mjs locally" → built server-side by send-monthly-report.buildReport;
//     Month 1 stays open until RGA sends it; the monthly SEND stamps Monthly 25 with its Gmail id (the Done proof).
// Runs the real runners (vm lift) against fakes. exit 0 holds · 1 broke · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { return null; } };
const flow = read("netlify/functions/flow-execute.js"), smr = read("netlify/functions/send-monthly-report.js"), pbRaw = read("data/playbooks/playbooks.json");
if (!flow || !smr || !pbRaw) { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }
const F = [], fail = (m) => F.push(m);
const body = (marker) => { const at = flow.indexOf(marker); if (at < 0) return null; const st = flow.indexOf("async", at); let d = 0;
  for (let i = flow.indexOf("{", flow.indexOf("=>", st)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) return flow.slice(st, i + 1); } } return null; };
const verifySrc = body('"m1.gbp.verify": async'), m1Src = body('"m1.report.month1": async');
const bsrAt = flow.indexOf("async function buildServerReport(");
const bsrSrc = bsrAt < 0 ? null : (() => { let d = 0; for (let i = flow.indexOf("{", flow.indexOf(")", bsrAt)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) return flow.slice(bsrAt, i + 1); } } return null; })();
if (!verifySrc || !m1Src || !bsrSrc) { console.error("⚠️  INDETERMINATE — a runner moved"); process.exit(2); }
const markDone = (o) => ({ ...o, completed: true });
// ── row 29 measures Google ──
async function verify({ oauth = { gbp_location_id: "locations/1" }, facts = { verified: true, title: "Acme" }, throws = false } = {}) {
  const ctx = vm.createContext({ markDone, Date, String, fetch: async () => ({}), loadOauth: async () => oauth, googleAccessToken: async () => "t",
    require: (m) => m === "./_gbp-profile" ? { locationName: (o) => (o && o.gbp_location_id) || null }
      : m === "./_gbp-verify" ? { profileFacts: async () => { if (throws) throw new Error("PERMISSION_DENIED"); return facts; } } : null });
  return vm.runInContext(`(${verifySrc})`, ctx)({ client: { business_name: "Acme" }, clientId: "c" });
}
{ const r = await verify(); if (r.completed !== true || r.outcome !== "verified") fail("a verified profile isn't Done on row 29"); }
{ const r = await verify({ facts: { verified: false, title: "Acme" } }); if (r.completed !== false || r.outcome === "verified") fail("an unverified profile reads as Done"); }
{ const r = await verify({ oauth: {} }); if (r.outcome !== "indeterminate" || r.completed === true) fail("no connection reads as an answer (verified or not)"); }
{ const r = await verify({ throws: true }); if (r.outcome !== "indeterminate") fail("Google refusing the read isn't indeterminate"); }
if (/confirm green check next to/.test(flow.replace(/^\s*\/\/.*$/mg, ""))) fail("row 29's canned paragraph is back");
// ── rows 34 / 35 retired ──
const pb = JSON.parse(pbRaw), st = (id) => (pb.month1 || []).find((x) => x.id === id);
for (const id of ["m1.gbp.hours_attributes", "m1.gbp.attributes"]) {
  if (new RegExp(`"${id.replace(/\./g, "\\.")}": async`).test(flow)) fail(`${id}'s legacy AI worksheet runner is back`);
  if (st(id)?.hasRunner !== false) fail(`${id} still offers an admin runner (hasRunner)`);
}
// ── the reports are built here ──
async function build({ recs = [{ reporting_month: "2026-10-01", gbp_calls: 4 }], built = { text: "REPORT TEXT", subject: "October 2026 report — Acme" }, throws = false } = {}, label = "monthly") {
  const ctx = vm.createContext({ markDone, Date, String, encodeURIComponent,
    supa: async () => { if (throws) throw new Error("db down"); return recs; },
    require: (m) => m === "./_google-numbers" ? { liveRows: async ({ rows }) => rows } : m === "./send-monthly-report" ? { buildReport: async ({ current }) => (current && current.gbp_calls != null ? built : null) } : null });
  vm.runInContext(`${bsrSrc}; this.bsr = buildServerReport;`, ctx);
  return ctx.bsr({ id: "c" }, "c", { label });
}
{ const r = await build(); if (r.completed !== true || r.outcome !== "verified" || r.summary !== "REPORT TEXT") fail("a month with measurements doesn't build the report server-side"); }
{ const r = await build({ recs: [{ reporting_month: "2026-10-01" }] }); if (r.outcome !== "indeterminate" || r.completed === true) fail("a month with no measured metric produces a report"); }
{ const r = await build({ recs: [] }); if (r.outcome !== "indeterminate") fail("no monthly record produces a report"); }
{ const r = await build({ throws: true }); if (r.outcome !== "indeterminate") fail("an unreadable record produces a report"); }
{ // Month 1 (research §1): built by _month1-report from the client's records; a DRAFT until RGA sends it from row 59
  // 🔄 10-20 (phase3_4_reviews_close_v1): the report opens at kickoff + 27 — the fixture's kickoff was held 40 days ago
  const ctx = vm.createContext({ encodeURIComponent, Date, supa: async () => [{ data: { tasks: { "m1.kickoff.call": { status: "done", completed_at: new Date(Date.now() - 40 * 86400000).toISOString() } } } }],
    require: (m) => m === "./_google-numbers" ? { liveRows: async ({ rows }) => rows } : m === "./_month1-report" ? { buildMonth1Report: () => ({ text: "SUMMARY\nok", subject: "s", sections: [] }), FORBIDDEN: /never/ } : m === "../../data/playbooks/playbooks.json" ? { month1: [] } : null });
  const r = await vm.runInContext(`(${m1Src})`, ctx)({ client: {}, clientId: "c" });
  if (r.completed !== false || r.outcome !== "draft_ready" || !r.outcome_data?.report) fail("the Month 1 report is Done when built, or isn't stored for review (a built report is not a delivered one)"); }
if (/node report\.mjs/.test(flow.replace(/^\s*\/\/.*$/mg, ""))) fail("a step still sends RGA to run node report.mjs locally");
if (!/"m2\.report\.generate": async \(\{ client, clientId \}\) => buildServerReport\(client, clientId,/.test(flow)) fail("Monthly 24 doesn't build its report server-side");
if (!/^exports\.buildReport = buildReport;/m.test(smr)) fail("send-monthly-report no longer exports its builder (the steps would build a different report)");
if (!/tasks\["m2\.report\.deliver"\] = \{ \.\.\.t, status: "done"[\s\S]{0,200}?sent_message_id: outcome\.id/.test(smr)) fail("sending the monthly report doesn't stamp Monthly 25 with its Gmail id (Done would have no proof)");
if (F.length) { console.error("🔴 legacy runners / server reports:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ row 29 reads Google · rows 34/35 worksheets retired · Monthly 24 + Month 1 built server-side by the send's own builder · Month 1 stays open until sent · the send stamps Monthly 25");
