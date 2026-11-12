#!/usr/bin/env node
// check-your-numbers-prefill-matches-the-frozen-months.mjs: MONTHLY 14 "YOUR NUMBERS" IS PRE-FILLED FROM THE QUARTER'S FROZEN MONTHS, NEVER WITH A 0 NOBODY
// COUNTED, AND THE CLIENT'S CHANGE IS KEPT BESIDE THE COUNT (approved tier3_best_in_class_v1 section 10b, the owner 11-11).
//
// HOLDS, on the WEBSITE repo (fakes only: a fake database, no network, nothing written):
//   1  shared/your-numbers.js prefill: calls = the sum of the quarter's three ended months' total_calls, form leads = the sum of their form_leads; the month
//      the client is asked in is never in the sum; the quarter is the three months before the ask month.
//   2  a month not read (no number) leaves the box BLANK, never 0 and never a partial sum, and says which month: "We couldn't count August. You can fill it in."
//   3  booked jobs are never pre-filled while item 1's call marks (client_leads) aren't built, and the box says so.
//   4  what is stored keeps COUNTED and CONFIRMED apart (outcomeData): a client's change is kept beside the count, "Not sure" is kept as not sure, and admin
//      Monthly 14 shows both ("61 counted · client changed it to 65"; revenue as the client's own number).
//   5  the server counts for itself: portal-step-input.js reads the quarter's months from the database (outcomesPrefill) and stores outcome_data on Monthly 14;
//      it never takes the count from the page.
//   6  the form: the step asks calls, form leads, booked jobs and revenue, each allows Not sure; the portal fills the boxes from the same prefill, Confirm saves
//      and Not sure saves every box as not sure (both are buttons, so both spin); an answer given before the change (average job value) still shows.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website before this build (default f113d9c5) in 6+ places, else exit 2.
//   node scripts/check-your-numbers-prefill-matches-the-frozen-months.mjs [--against=<rev>] [--no-before]
import { runGate, reader, loader } from "./lib/site-rev.mjs";

const BEFORE = "f113d9c5";
for (const k of [["SUPA", "BASE_URL"].join(""), ["SUPA", "BASE_SERVICE_ROLE_KEY"].join("")]) delete process.env[k];
globalThis.fetch = async (u) => { throw new Error(`gate: no network (${String(u).slice(0, 60)})`); };
const CID = "44444444-4444-4444-8444-444444444444";
const row = (m, calls, forms) => ({ reporting_month: m, total_calls: calls, form_leads: forms });
const ROWS = [row("2026-11-01", 5, 2), row("2026-10-01", 20, 6), row("2026-09-01", 22, 7), row("2026-08-01", 19, 5), row("2026-07-01", 30, 9)];

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const load = (p) => { try { return req(p); } catch (e) { fail(`${p} won't load: ${String(e.message).slice(0, 120)}`); return null; } };
  const YN = rd("shared/your-numbers.js") ? load("./shared/your-numbers.js") : (fail("shared/your-numbers.js is missing: nothing pre-fills Your numbers"), null);
  if (YN) {
    // ── 1 · the sum of the quarter's frozen months ──
    const q = YN.quarterOf("2026-11-01");
    if (!q || JSON.stringify(q.months) !== JSON.stringify(["2026-08-01", "2026-09-01", "2026-10-01"])) fail(`asked in November, the quarter is ${JSON.stringify(q && q.months)} (it must be August to October)`);
    if (q && q.label !== "August to October") fail(`the quarter reads "${q && q.label}"`);
    const p = YN.prefill({ rows: ROWS, askMonth: "2026-11-01", provider: "callrail", analytics: true });
    if (!p || p.calls.value !== 61 || p.form_leads.value !== 18) fail(`the pre-fill reads calls ${p && p.calls.value}, form leads ${p && p.form_leads.value}; the frozen months Aug to Oct hold 61 and 18`);
    if (p && !/CallRail/.test(p.calls.why)) fail("the calls box doesn't say who counted them");
    const b = YN.boxes(p);
    if (b.calls !== "61" || b.form_leads !== "18" || b.jobs_from_leads !== "" || b.revenue !== "") fail(`the boxes read ${JSON.stringify(b)}`);
    // ── 2 · a month not read ──
    const hole = YN.prefill({ rows: [row("2026-10-01", 20, 6), row("2026-09-01", null, 7), row("2026-08-01", 19, 5)], askMonth: "2026-11-01", provider: "callrail", analytics: true });
    if (hole.calls.value !== null || hole.calls.value === 0) fail(`with September's calls not read, the calls box holds ${JSON.stringify(hole.calls.value)} (it must be blank: never 0, never a partial sum)`);
    if (!/couldn't count September/i.test(hole.calls.why) || !/fill it in/i.test(hole.calls.why)) fail(`the blank box doesn't say which month wasn't counted ("${hole.calls.why}")`);
    if (YN.boxes(hole).calls !== "") fail("a month not read puts something in the box");
    if (hole.form_leads.value !== 18) fail("one count's missing month blanks the other count too");
    const gone = YN.prefill({ rows: [row("2026-10-01", 20, 6), row("2026-08-01", 19, 5)], askMonth: "2026-11-01", provider: "callrail", analytics: true });
    if (gone.calls.value !== null) fail("a month with no record at all is counted as 0");
    const none = YN.prefill({ rows: [], askMonth: "2026-11-01", provider: null, analytics: false });
    if (none.calls.value !== null || none.form_leads.value !== null || !/No call tracking/.test(none.calls.why) || !/isn't connected/.test(none.form_leads.why)) fail("with no call tracking and no Analytics the boxes aren't blank, or don't say why");
    // ── 3 · booked jobs ──
    if (p && (p.booked.value !== null || !/don't count booked jobs yet/i.test(p.booked.why))) fail("booked jobs are pre-filled, or the box doesn't say we don't count them yet (call marks aren't built)");
    // ── 4 · counted beside confirmed ──
    const od = YN.outcomeData(p, { calls: 65, form_leads: 18, jobs_from_leads: 25, revenue: 19400 }, "2026-11-03T18:00:00Z");
    if (od.counted.calls !== 61 || od.confirmed.calls !== 65 || !od.changed.includes("calls")) fail(`the client's change isn't kept beside the count (${JSON.stringify(od.counted)} / ${JSON.stringify(od.confirmed)})`);
    if (od.counted.form_leads !== 18 || od.confirmed.form_leads !== 18 || od.changed.includes("form_leads")) fail("a confirmed count reads as changed, or isn't kept");
    const ns = YN.outcomeData(p, { not_sure: ["calls", "form_leads", "jobs_from_leads", "revenue"] }, "2026-11-03T18:00:00Z");
    if (ns.confirmed.revenue !== "not_sure" || ns.counted.calls !== 61) fail("Not sure isn't kept as not sure, or it wipes what we counted");
    const rows = YN.adminRows({ outcome_data: od }) || [];
    const val = (l) => ((rows.find((r) => r.label === l) || {}).value || "");
    if (!/^61 counted · client changed it to 65$/.test(val("Calls")) || !/^18 counted · 18 confirmed$/.test(val("Form leads"))) fail(`admin Monthly 14 reads "${val("Calls")}" / "${val("Form leads")}"`);
    if (!/\$19,400 \(client's own number\)/.test(val("Revenue")) || !/client said 25/.test(val("Booked jobs"))) fail(`admin Monthly 14's revenue / booked jobs read "${val("Revenue")}" / "${val("Booked jobs")}"`);
  }
  // ── 5 · the server counts for itself ──
  const SI = rd("netlify/functions/portal-step-input.js") || "";
  if (!/if \(stepId === "m2\.snap\.business_outcomes"\) \{[\s\S]{0,700}tasks\[stepId\]\.outcome_data = YN\.outcomeData\(p, parsed\.value, now\)/.test(SI)) fail("portal-step-input doesn't store counted beside confirmed on Monthly 14 when the client answers");
  if (/outcome_data = YN\.outcomeData\([^)]*body\./.test(SI)) fail("portal-step-input takes the count from the page");
  if (YN && /exports\.outcomesPrefill/.test(SI)) {
    const asked = [];
    let mod = null;
    try { mod = req("./netlify/functions/portal-step-input.js"); } catch (e) { fail(`portal-step-input.js won't load: ${String(e.message).slice(0, 120)}`); }
    if (mod) {
      try {
        const got = await mod.outcomesPrefill(CID, "2026-11-01", async (path) => { asked.push(path); return /client_monthly_records/.test(path) ? ROWS.filter((r) => /reporting_month=in\.\(([^)]*)\)/.exec(path)[1].split(",").includes(r.reporting_month)) : /clients\?/.test(path) ? [{ call_tracking_provider: "callrail", kpi_config: { call_tracking: true } }] : [{ ga4_property_id: "properties/1" }]; });
        if (!got || got.calls.value !== 61 || got.form_leads.value !== 18) fail(`the server's count reads calls ${got && got.calls.value}, forms ${got && got.form_leads.value} (the frozen months hold 61 and 18)`);
        const mq = asked.find((x) => /client_monthly_records/.test(x)) || "";
        if (!/reporting_month=in\.\(2026-08-01,2026-09-01,2026-10-01\)/.test(mq)) fail(`the server reads the wrong months: ${mq.slice(0, 160)}`);
      } catch (e) { fail(`outcomesPrefill threw ${String(e.message).slice(0, 120)}`); }
    }
  } else if (YN) fail("portal-step-input.js exports no outcomesPrefill (the server can't count the quarter)");
  // ── 6 · the form, the portal, the report ──
  let PB = null; try { PB = JSON.parse(rd("data/playbooks/playbooks.json") || "null"); } catch { PB = null; }
  const st = PB && (PB.month2plus || []).find((s) => s.id === "m2.snap.business_outcomes");
  const keys = st && st.clientInput ? (st.clientInput.fields || []).map((f) => f.key) : [];
  if (JSON.stringify(keys) !== JSON.stringify(["calls", "form_leads", "jobs_from_leads", "revenue"])) fail(`Monthly 14 asks ${JSON.stringify(keys)} (it must ask calls, form leads, booked jobs, revenue, as drawn)`);
  if (st && (st.clientInput.fields || []).some((f) => !f.allowNotSure)) fail("a Your numbers box doesn't allow Not sure");
  let CS = null; try { CS = JSON.parse(rd("data/playbooks/client-steps.json") || "null"); } catch { CS = null; }
  const cst = CS && [...(CS.month2plus || []), ...(CS.month1 || [])].find((s) => s.id === "m2.snap.business_outcomes");
  if (!cst || JSON.stringify((cst.clientInput.fields || []).map((f) => f.key)) !== JSON.stringify(keys)) fail("data/playbooks/client-steps.json wasn't rebuilt (the portal still reads the old fields)");
  const por = rd("portal/portal.js") || "";
  if (!/function ynFormHtml\(/.test(por) || !/YN\.boxes\(p\)/.test(por) || !/YN\.prefill\(\{ rows: recs/.test(por)) fail("the portal doesn't fill the boxes from the shared pre-fill");
  if (!/data-in-submit data-yn-notsure>Not sure</.test(por) || !/btn\.hasAttribute\("data-yn-notsure"\)/.test(por)) fail("there is no Not sure button that saves (and spins), or submit ignores it");
  if (!/Are these right\? Confirm saves them for this quarter\./.test(por) || !/We filled in what we counted\./.test(por)) fail("the card's words aren't the approved ones");
  if ((por.match(/const yn = ynFormHtml\(step, c, spec, v\);/g) || []).length !== 2) fail("the managed and the 21-step portal don't both draw the pre-filled card");
  if (!/records: monthlyRecords \|\| \[\]/.test(por)) fail("the card isn't handed the month records it pre-fills from");
  if (!/\{ key: "avg_job_value", label: "Average job value", prefix: "\$" \}/.test(por)) fail("an average job value a client already gave would disappear from their done card");
  const mq = rd("shared/monthly-quarter.js") || "";
  if (!/revenue = got\("revenue"\)/.test(mq)) fail("the report's This quarter block doesn't read revenue");
  return F;
}

await runGate({ name: "check-your-numbers-prefill-matches-the-frozen-months", beforeRev: BEFORE, checkTree, minBefore: 6 });
