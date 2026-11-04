#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-client-step-waits-on-what-it-needs.mjs
//
// 🔒 WHY (2026-10-12, approved review_first_5_wait_v1, decisions 1 + 2): the acceptance walk found admin step 57
// "Get first 5 reviews" 🔒 Locked (it needs step 56, RGA's review request messages) while the portal told the client
// "Your turn · Submit list →", and 5 customers in would have read Done beside the admin's Locked. Chris approved: a
// client step waits while any step it needs is unfinished; the pill names who holds it ("Waits on RGA").
// HOLDS — running the real code where it can:
//   1. ONE rule (`_client-waits.js`) gives the admin's answer: the WHOLE chain (an independent walk of every Month-1
//      client step finds the same prerequisites), finished = done / skipped / declined, a finished step never waits.
//      Left out on purpose: the listing check (its own rule), the kickoff booking.
//   2. The public projection carries a FLAG, never an admin step id; the server endpoint answers with the real rule.
//   3. Every writer of the step's status asks first: the input save, "I've done it", a choice, the detection recheck.
//   4. The portal: the row says "Waits on RGA", is never the client's turn, never the NEXT step, never the headline;
//      its action is disabled; NOT KNOWN IS NOT OPEN (a failed answer waits).
//   5. Step 57's words are the approved mockup's.
//   6. (client_step_waits_on_own_step_v1, 2026-10-13) A step that needs the client's OWN earlier step waits too:
//      "Do step N first" / "Connect Google first", the amber band with the way there, the form disabled; the client's
//      own step outranks the listing, which outranks RGA; writers refuse with the same words.
//   7. (month2_waits_v1, 2026-10-13) MONTH 2 TOO, judged against this month's record: the same independent walk on the
//      Month-2 list; steps 14/15/16 need nothing (decision 1); step 18 says "Do step 14 first", then waits on RGA with
//      the approved words (decision 2); step 15 counts this month's photos (decision 3); no step-open email for Month 2.
// exit 0 = a client is never asked to do a step that waits on RGA · 1 = they can be · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { pmNoBlock } from "./lib/portal-mode-lift.mjs";   // the lifted rows name step numbers through pmNo (client_portal_slim_v1, 11-4)
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
// 🔑 The endpoint is RUN against a stub database (section 2), and it reads its address when it loads: set it first.
// Never the real one: this gate must not read production.
process.env.SUPABASE_URL = "https://stub.supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
// …and the endpoint takes its auth check when it loads, so the stub signs in first too.
req("./_auth.js").requirePortalOwnerOrWorkspace = async () => ({ email: "owner@example.com" });
const DUP = "m1.audit.gbp_duplicate";
const S57 = "m1.review.first_5", S56 = "m1.review.system";

// ── 1 · one rule, the admin's answer ──
const W = req("./_client-waits.js");
const pb = JSON.parse(read("data/playbooks/playbooks.json"));
const m1 = pb.month1 || [];
const byId = new Map(m1.map((s) => [s.id, s]));
const s57 = byId.get(S57);
if (!s57 || !(s57.dependsOn || []).includes(S56)) { console.error(`⚠️  INDETERMINATE — step 57 no longer needs step 56; re-read this gate`); process.exit(2); }
const done = { status: "done" };
if (W.waitsOnRgaNow(pb, s57, {}) !== S56) fail("step 57 does not wait on step 56 when RGA hasn't written the review messages");
for (const st of ["done", "skipped", "declined"]) if (W.waitsOnRgaNow(pb, s57, { [S56]: { status: st } })) fail(`step 57 still waits when step 56 is ${st} (the admin counts it finished)`);
for (const st of ["pending", "in_progress", "blocked", undefined]) if (W.waitsOnRgaNow(pb, s57, { [S56]: { status: st } }) !== S56) fail(`step 57 opens while step 56 is ${st ?? "missing"}`);
if (W.waitsOnRgaNow(pb, s57, { [S57]: done })) fail("a finished step reads as waiting (the admin never locks a done step)");
// An independent walk: every RGA-held ancestor of every Month-1 client step must hold it, alone.
const vis = (s) => !!s && !s.ongoing && !!s.clientLabel && (s.clientBucket === "supply" || s.clientBucket === "act");
const ancestors = (s) => { const out = new Set(), st = [...(s.dependsOn || [])]; while (st.length) { const d = st.pop(); if (out.has(d) || !byId.has(d)) continue; out.add(d); st.push(...(byId.get(d).dependsOn || [])); } return out; };
let pairs = 0, ownPairs = 0;
for (const s of m1.filter(vis)) {
  const held = [...ancestors(s)].filter((a) => a !== DUP && !vis(byId.get(a)));
  const allDone = Object.fromEntries([...ancestors(s)].map((a) => [a, done]));
  if (W.waitsOnRgaNow(pb, s, allDone)) fail(`${s.id} still waits with every step it needs finished`);
  for (const a of held) {
    pairs++;
    if (s.clientForm === "kickoff_booking") { if (W.waitsOnRgaNow(pb, s, { ...allDone, [a]: { status: "pending" } })) fail(`the kickoff booking waits on ${a}: a new client could never pick a time`); continue; }
    if (!W.waitsOnRgaNow(pb, s, { ...allDone, [a]: { status: "pending" } })) fail(`${s.id} opens while ${a} (RGA's, ${[...(s.dependsOn || [])].includes(a) ? "direct" : "further up the chain"}) is unfinished — the admin says Locked`);
  }
  for (const a of [...ancestors(s)].filter((x) => x === DUP || vis(byId.get(x)))) {
    if (W.waitsOnRgaNow(pb, s, { ...allDone, [a]: { status: "pending" } })) fail(`${s.id} says "Waits on RGA" for ${a}, which RGA doesn't hold (the listing check or the client's own step)`);
    if (a === DUP) { if (W.waitsOnClientNow(pb, s, { ...allDone, [a]: { status: "pending" } })) fail(`${s.id} reads the listing check as the client's own step`); continue; }
    if (s.clientForm === "kickoff_booking") continue;
    ownPairs++;
    const w = W.waitNow(pb, s, { ...allDone, [a]: { status: "pending" } });
    if (!w || w.on !== "you" || w.id !== a) fail(`${s.id} opens while the client's own step ${a} is unfinished — the admin says Locked`);
    // their own step outranks RGA (approved decision 3): with RGA's part open too, the answer is still theirs
    const rgaA = [...ancestors(s)].find((x) => x !== DUP && !vis(byId.get(x)));
    if (rgaA) { const w2 = W.waitNow(pb, s, { ...allDone, [a]: { status: "pending" }, [rgaA]: { status: "pending" } }); if (!w2 || w2.on !== "you") fail(`${s.id}: RGA's step outranks the client's own (${a}) — the pill must name what they can do now`); }
  }
}
if (ownPairs < 5) { console.error(`⚠️  INDETERMINATE — only ${ownPairs} client-held prerequisites found; the graph changed`); process.exit(2); }
// The refusal's words are the approved pill's.
{
  const v = byId.get("m1.gbp.hours_attributes");
  const m = W.waitNow(pb, v, { "m1.access.gbp": done })?.message || "";
  // 🔄 renumbered 10-20 (client_portal_phases_v1): verify's number is READ from the playbook, never assumed
  const vn = byId.get("m1.gbp.verify").clientStepNo;
  if (m !== `Do step ${vn} first. Nothing was saved.`) fail(`a refused save of the hours step doesn't say "Do step ${vn} first" (says: ${m})`);
  const g = W.waitNow(pb, v, {})?.message || "";
  if (!/^Connect Google first\. Nothing was saved\.$/.test(g)) fail(`a refused save waiting on Google doesn't say "Connect Google first" (says: ${g})`);
}
if (pairs < 2) { console.error(`⚠️  INDETERMINATE — only ${pairs} RGA-held prerequisites found on Month-1 client steps; the graph changed`); process.exit(2); }
// A chain through a DONE step still holds (the admin walks through it): synthetic C(client) → B(rga, done) → A(rga, open).
const syn = { month1: [{ id: "A", dependsOn: [] }, { id: "B", dependsOn: ["A"] }, { id: "C", dependsOn: ["B"], clientLabel: "c", clientBucket: "act" }] };
if (W.waitsOnRgaNow(syn, syn.month1[2], { B: done }) !== "A") fail("the rule stops at a done step and misses an unfinished step further up the chain");
// ── 1b · Month 2, the same independent walk on its own list (approved month2_waits_v1) ──
const M2 = pb.month2plus || [];
const byId2 = new Map(M2.map((s) => [s.id, s]));
const anc2 = (s) => { const out = new Set(), st = [...(s.dependsOn || [])]; while (st.length) { const d = st.pop(); if (out.has(d) || !byId2.has(d)) continue; out.add(d); st.push(...(byId2.get(d).dependsOn || [])); } return out; };
let m2pairs = 0;
for (const s of M2.filter(vis)) {
  const all = anc2(s), allDone = Object.fromEntries([...all].map((a) => [a, done]));
  if (W.waitNow(pb, s, allDone)) fail(`Month 2: ${s.id} still waits with every step it needs finished`);
  for (const a of all) {
    m2pairs++;
    const w = W.waitNow(pb, s, { ...allDone, [a]: { status: "pending" } });
    const want = vis(byId2.get(a)) ? "you" : "rga";
    if (!w || w.on !== want || w.id !== a) fail(`Month 2: ${s.id} doesn't wait on ${a} (${want === "you" ? "their own step" : "RGA's"}) while it's unfinished — the admin says Locked`);
  }
}
if (!m2pairs) { console.error("⚠️  INDETERMINATE — no Month-2 client step needs anything; re-read this gate"); process.exit(2); }
// (That Month 2 is judged against THIS MONTH'S record, not the onboarding one, is checked on the endpoint in section 2.)
// decision 1: numbers, monthly photos and the weekly customer list need nothing, so neither screen ever locks them.
for (const id of ["m2.snap.business_outcomes", "m2.exec.gbp_photos", "m2.exec.review_push"]) {
  const st = byId2.get(id);
  if (!st) { console.error(`⚠️  INDETERMINATE — ${id} is gone from Month 2`); process.exit(2); }
  if ((st.dependsOn || []).some((d) => byId2.has(d))) fail(`Month 2: ${id} needs ${(st.dependsOn || []).join(", ")} again — approved: it never waits on RGA's monthly plan (month2_waits_v1, decision 1)`);
}
// decision 2: the monthly call — their numbers first, then RGA's report
{
  const call = byId2.get("m2.call.monthly");
  const w0 = call && W.waitNow(pb, call, {});
  // 🔄 approved monthly_asks_v1 (10-20) supersedes month2_waits_v1 decision 2: the call waits on RGA's REPORT only — never on the
  // client's quarterly numbers — and the band says the report comes first, then RGA emails times
  if (!w0 || w0.on !== "rga") fail(`Month 2: the monthly call doesn't wait on RGA's report (${JSON.stringify(w0)})`);
  if (w0 && w0.id === "m2.snap.business_outcomes") fail("Month 2: the monthly call waits on the client's numbers again");
  const mock2 = read("reports/mockups/month2_waits_v1.html");
  const cw2 = call?.clientWait || {};
  if (!/report/i.test(cw2.head || "") || !/pick a time/i.test(cw2.body || "") || !cw2.foot) fail("Month 2: the monthly call's band doesn't say report first, then you pick a time here (ready_to_sell_plan_v1 D5, the monthly picker)");
  const cf = byId2.get("m2.snap.business_outcomes")?.clientFirst || {};
  if (!cf.head || !mock2.includes(cf.head) || !cf.body || !mock2.includes(cf.body)) fail("Month 2: step 14's \"first\" band isn't the approved mockup's words (month2_waits_v1)");
}

// ── 2 · the projection carries a flag, never the graph; the endpoint runs the rule ──
const cs = JSON.parse(read("data/playbooks/client-steps.json"));
for (const st of [...(cs.month1 || []), ...(cs.month2plus || [])]) {
  const own = byId.has(st.id) ? m1 : M2;              // each step within its own month's list
  const src = byId.get(st.id) || byId2.get(st.id);
  const want = !!src && W.rgaPrereqs(src, own).length > 0;
  if (st.waitsOnRga !== undefined && st.waitsOnRga !== true) fail(`client-steps.json: ${st.id} waitsOnRga is ${JSON.stringify(st.waitsOnRga).slice(0, 40)} — a flag only, never ids (the graph stays private)`);
  if (!!st.waitsOnRga !== want) fail(`client-steps.json: ${st.id} waitsOnRga is ${!!st.waitsOnRga}, the SOP says ${want} — re-run build-client-steps`);
  const wantOwn = src ? W.ownPrereqs(src, own) : [];
  if (JSON.stringify(st.needsFirst || []) !== JSON.stringify(wantOwn)) fail(`client-steps.json: ${st.id} needsFirst is ${JSON.stringify(st.needsFirst || [])}, the SOP says ${JSON.stringify(wantOwn)} — re-run build-client-steps`);
  if ((st.needsFirst || []).some((id) => !vis(byId.get(id) || byId2.get(id)))) fail(`client-steps.json: ${st.id} needsFirst names a step the client can't see (the graph stays private)`);
}
const ep = req("./portal-step-waits.js");
if (typeof ep.rgaWaitsFor !== "function") fail("portal-step-waits no longer exports the rule it serves");
else {
  const a = ep.rgaWaitsFor({}, {}), b = ep.rgaWaitsFor({ [S56]: done }, {});
  if (!a.includes(S57) || b.includes(S57)) fail("the endpoint's answer for step 57 doesn't follow step 56");
  // Month 2 from this month's record: everything done in it opens the call; the same done in the MONTH-1 map does not.
  const m2done = Object.fromEntries(M2.map((x) => [x.id, done]));
  const callId = "m2.call.monthly";
  if (ep.rgaWaitsFor({}, m2done).includes(callId)) fail("the endpoint keeps the monthly call waiting with this month's report sent");
  if (!ep.rgaWaitsFor(m2done, {}).includes(callId)) fail("the endpoint judges Month-2 steps against the Month-1 record (it must read this month's monthly record)");
  if (!ep.rgaWaitsFor({}, {}).includes(callId)) fail("the endpoint opens the monthly call before this month's report is sent");
  if (a.some((id) => !vis(byId.get(id)) && !(pb.month2plus || []).some((s) => s.id === id))) fail("the endpoint answers with a step the client cannot see");
}
// 🔑 THE HANDLER, RUN: it must hand Month-2 steps THIS MONTH'S monthly record (a stub database answers both reads).
{
  const realFetch = globalThis.fetch;
  const month = req("./_step-record.js").currentReportingMonth();
  const m2all = Object.fromEntries(M2.map((x) => [x.id, done]));
  const runEp = async (monthly) => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/client_monthly_records?")) return new Response(JSON.stringify(u.includes(`reporting_month=eq.${month}`) ? monthly : [{ data: { tasks: m2all } }]), { status: 200 });
      return new Response(JSON.stringify([{ data: { tasks: {} } }]), { status: 200 });
    };
    try { const r = await ep.handler({ httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "11111111-1111-4111-8111-111111111111" } }); return JSON.parse(r.body).rga || null; }
    finally { globalThis.fetch = realFetch; }
  };
  const open = await runEp([{ data: { tasks: m2all } }]), shut = await runEp([]);
  if (!open || open.includes("m2.call.monthly")) fail("the endpoint keeps the monthly call waiting with this month's report sent (it doesn't read this month's monthly record)");
  if (!shut || !shut.includes("m2.call.monthly")) fail("the endpoint opens the monthly call when this month has no record (it read another month's, or the onboarding record)");
}
const epc = code("netlify/functions/portal-step-waits.js");
const gateAt = epc.search(/const gate = await requirePortalOwner(?:OrWorkspace)?\(event, clientId\);\s*if \(gate\.error\) return gate\.error;/), readAt = epc.indexOf("client_onboarding_records");
if (gateAt < 0 || readAt < gateAt) fail("portal-step-waits reads a client's record before checking who is asking");
if (!/if \(!r\.ok \|\| !m\.ok\) return json\(5\d\d/.test(epc) || !/client_monthly_records\?client_id=eq\.\$\{clientId\}&reporting_month=eq\.\$\{currentReportingMonth\(\)\}/.test(epc)) fail("portal-step-waits answers a failed read with a list (an empty one says nothing waits)");

// ── 3 · every writer of the status asks first ──
// 🔑 The guard reads the STEP'S OWN record (`rec.tasks`, from _step-record.js: Month 2 = this month's monthly record).
const guardRe = /const waiting = waitNow\(PLAYBOOKS, (?:step|s), rec\.tasks\);\s*if \(waiting\) return json\(409, \{ error: waiting\.message/g;
// 🔑 a "done" write is `status: "done"` or, since profile_answers_reach_google_v1, `status: settled ? "done" : …`
const DONE_WRITE = /status: (?:settled \? )?"done"/g;
const guardsBeforeDone = (src) => { const out = []; for (const m of src.matchAll(guardRe)) { DONE_WRITE.lastIndex = m.index; const d = DONE_WRITE.exec(src); out.push(d ? d.index : -1); } return out; };
{
  const src = code("netlify/functions/portal-step-input.js");
  if (!guardsBeforeDone(src).some((w) => w > 0)) fail("saving an answer in the portal can finish a step that waits on RGA (portal-step-input)");
}
{
  const src = code("netlify/functions/portal-step-choice.js");
  const writes = [...src.matchAll(/status: "done"/g)].map((m) => m.index);
  const guards = [...src.matchAll(guardRe)].map((m) => m.index);
  for (const w of writes) {
    // the nearest guard before this write must sit in the same branch: no other "done" write between them
    const g = guards.filter((x) => x < w).pop();
    if (g === undefined || writes.some((o) => o > g && o < w)) fail(`a portal choice / "I've done it" finishes a step without asking whether it waits on RGA (portal-step-choice, write at char ${w})`);
  }
}
{
  const src = code("netlify/functions/portal-step-recheck.js");
  if (!/const waiting = waitNow\(PLAYBOOKS, step, r0\.tasks\);/.test(src) || !/if \(probe\.verdict === "confirmed" && t0\[stepId\]\.status !== "done" && !waiting\)/.test(src)) fail("a detection (5 customers in) finishes a step that waits on RGA (portal-step-recheck)");
}

// ── 3b · the emails that name a client step: the "what we'll need from you next" list skips a waiting step (run for
//         real), and a nudge for a waiting step is refused before anything is sent ──
{
  const cf = read("netlify/functions/send-confirmation-email.js");
  const i = cf.indexOf("function openClientSteps(tasks) {"), j = i < 0 ? -1 : cf.indexOf("\n}\n", i);
  if (i < 0 || j < 0) { console.error("⚠️  INDETERMINATE — could not lift openClientSteps from send-confirmation-email.js"); process.exit(2); }
  const L = req("./_one-listing.js");
  const ectx = { require: req, listingState: L.listingState, waitsOnListing: L.waitsOnListing, waitNow: W.waitNow };
  vm.createContext(ectx);
  vm.runInContext(`${cf.slice(i, j + 2)}\nthis.open = openClientSteps;`, ectx);
  const lab = s57.clientLabel;
  const one = { [DUP]: { outcome_data: { verdict: "clean" } } };
  if (ectx.open({ ...one }).includes(lab)) fail("the kickoff \"yes\" email asks for step 57 (\"what we'll need from you next\") while it waits on RGA");
  if (!ectx.open({ ...one, [S56]: done, "m1.access.gbp": done, "m1.gbp.verify": done }).includes(lab)) fail("the kickoff \"yes\" email never asks for step 57, even once RGA's part is done");
  const hrs = byId.get("m1.gbp.hours_attributes")?.clientLabel;
  if (hrs && ectx.open({ [S56]: done }).includes(hrs)) fail("the kickoff \"yes\" email asks for hours while the business may have two Google listings");
  if (hrs && ectx.open({ ...one, "m1.access.gbp": done }).includes(hrs)) fail("the kickoff \"yes\" email asks for hours before step 6 (verify) is done");
}
{
  const sc = code("netlify/functions/send-step-email.js");
  const g = sc.search(/if \(isNudge\) \{[\s\S]{0,1200}?const waiting = waitNow\(PB, sop, rec \? rec\.tasks : \{\}\);\s*if \(waiting\) return jsonRes\(409/);
  const sendAt = sc.indexOf("sent = await sendAsRga(");
  if (g < 0 || sendAt < 0 || g > sendAt) fail("RGA can nudge a client about a step that waits on RGA (send-step-email sends before asking)");
  if (!/rec = await readStepRecord\(supa, encodeURIComponent\(clientId\), stepId\);/.test(sc) || !/const sop = \[\.\.\.\(PB\.month1 \|\| \[\]\), \.\.\.\(PB\.month2plus \|\| \[\]\)\]\.find/.test(sc)) fail("the nudge can't see a Month-2 step's wait (it must look the step up in both months and read its own record)");
  if (!/if \(waitsOnListing\(sop\) && !listingState\(rec \? rec\.listingTasks : \{\}\)\.open\) \{\s*return jsonRes\(409/.test(sc)) fail("RGA can nudge a client about a step that waits on one Google listing");
}

// ── 4 · the portal ──
const portal = read("portal/portal.js");
const lift = (src, start, end) => { const i = src.indexOf(start); const j = i < 0 ? -1 : src.indexOf(end, i); return i < 0 || j < 0 ? null : src.slice(i, j); };
const fns = lift(portal, "function portalListingStateOf(tasks) {", "\nfunction photoListingLockHtml");
if (!fns || !/function rowRgaWaits\(/.test(fns) || !/function rowWaits\(/.test(fns)) { console.error("⚠️  INDETERMINATE — could not lift the portal's wait helpers"); process.exit(2); }
const ctx = { MSG_ICON: "<svg></svg>", escapeAttribute: (x) => String(x).replace(/"/g, "&quot;"), escapeHtml: (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") };
vm.createContext(ctx);
// 🔑 10-16: rgaWaitHtml draws step 12's wait as the Google card (step12_review_requests_v2), so the card rides along
const lineOf = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const gcOf = (() => { const i = portal.indexOf("function googleCardHtml("); const j = portal.indexOf("\nconst gcardMaps", i); return i < 0 || j < 0 ? "" : portal.slice(i, j); })();
if (!gcOf || !lineOf("GC_ICON")) { console.error("⚠️  INDETERMINATE — could not lift the Google card"); process.exit(2); }
vm.runInContext(`${pmNoBlock(portal)}\n${lineOf("GOOGLE_G")}\n${lineOf("GC_ICON")}\n${gcOf}\n${fns}\nthis.r = rowRgaWaits; this.w = rowWaits; this.h = rgaWaitHtml; this.o = rowOwnWaits; this.op = ownFirstPill; this.oh = ownWaitHtml;`, ctx);
{
  const cs1 = new Map((cs.month1 || []).map((x) => [x.id, x]));
  const hrsRow = cs1.get("m1.gbp.hours_attributes");
  if (!hrsRow) { console.error("⚠️  INDETERMINATE — step 8 (hours) is not in the projection"); process.exit(2); }
  const g = { "m1.access.gbp": done };
  if (ctx.o(hrsRow, "pending", g) !== "m1.gbp.verify") fail("portal step 8 doesn't wait on step 6 while the profile isn't verified");
  if (ctx.o(hrsRow, "pending", {}) !== "m1.access.gbp") fail("portal step 8 doesn't wait on Google access first (the root of the chain)");
  if (ctx.o(hrsRow, "pending", { ...g, "m1.gbp.verify": done })) fail("portal step 8 still waits once step 6 is done");
  if (ctx.o(hrsRow, "done", {})) fail("a finished row reads as waiting on an earlier step");
  if (!ctx.w(hrsRow, "pending", { [DUP]: { outcome_data: { verdict: "clean" } }, ...g }, new Set())) fail("rowWaits (the marker's + the headline's question) ignores the client's own earlier step");
  const v6 = cs1.get("m1.gbp.verify"), gb = cs1.get("m1.access.gbp");
  const vn2 = v6 && v6.clientStepNo;
  if (ctx.op(v6) !== `Do step ${vn2} first` || ctx.op(gb) !== "Connect Google first") fail(`the reason isn't the approved wording ("${ctx.op(v6)}" / "${ctx.op(gb)}")`);
  const b6 = ctx.oh(v6), bg = ctx.oh(gb);
  if (!new RegExp(`First: verify your Google profile \\(step ${vn2}\\)\\.`).test(b6) || !b6.includes(`href="#step-m1.gbp.verify">Go to step ${vn2} →`)) fail("the band for the verify step doesn't say what to do first or take them there");
  if (!/First: connect Google\./.test(bg) || !/data-jump-google>Connect Google →/.test(bg)) fail("the band for Google access doesn't say what to do first or take them there");
}
const row = { id: S57, waitsOnRga: true, clientWait: s57.clientWait };
if (!ctx.r(row, "pending", new Set([S57]))) fail("the portal doesn't wait when the server says step 57 waits");
if (ctx.r(row, "pending", new Set())) fail("the portal waits when the server says nothing does");
if (!ctx.r(row, "pending", null)) fail("NOT KNOWN reads as open: a failed answer would say \"Your turn\" on a step that may wait");
if (ctx.r(row, "done", null) || ctx.r(row, "skipped", new Set([S57]))) fail("a finished row reads as waiting");
if (ctx.r({ id: "x" }, "pending", null)) fail("a row that can't wait reads as waiting");
if (!ctx.w(row, "pending", {}, new Set([S57]))) fail("rowWaits (the marker's + the headline's question) ignores the RGA wait");
const band = ctx.h(row);
// 🔒 step12_review_requests_v2: a wait that declares its path is ONE blue card ("RGA is on it · Writing your …", the path inside)
if (Array.isArray(s57.clientWait?.how) && s57.clientWait.how.length
  ? !(band.includes('class="gcard rga"') && /Writing your review request message/.test(band) && band.includes("pm-how-in"))
  : !(band.includes("pm-lock other") && band.includes(ctx.escapeHtml(s57.clientWait?.head || "\u0000")))) fail("step 57's blue band doesn't say what RGA is doing first");
if (ctx.h({ id: "x" }) !== "") fail("a row with no wait copy draws an empty band");
const pcode = code("portal/portal.js");
const checks = [
  [/const ownWait = !!ownFirstId;\s*const listingWait = !ownWait && rowListingWaits\(/, "the listing outranks the client's own earlier step (approved: their step first)"],
  [/const rgaWait = !ownWait && !listingWait && rowRgaWaits\(step, status, rgaWaits\);/, "the row doesn't ask whether it waits on RGA, last"],
  [/const theirsToAct = !kickoffPending && !ownWait && !listingWait && !rgaWait && (?:!gbpWithRga && )?(?:!withRga && )?\(/, "a row that waits still counts as the client's turn (the orange edge)"],
  // 🔄 10-20: the pill is "Can't start yet"; the reason ("Do step N first") sits under the title (client_portal_phases_v1)
  [/: ownWait \? \{ text: CANT_START, why: (?:gaByRga \? "RGA is setting up your Google Analytics" : )?ownFirstPill\(ownFirst\), cls: "wait" \}/, "a row that waits on their own earlier step doesn't name it (\"Do step N first\")"],
  // 🔑 10-16 (step13_closeout_call_v1): step 13 lists every prerequisite instead; every other row keeps the one band
  // 🔄 10-20: the Analytics case (Google connected, no GA4 yet) names RGA instead — every other own wait still says what to do first
  [/\$\{ownWait \? (?:\(step\.id === "m1\.call\.close" \? closeWaitHtml\([^)]*\) : )?(?:gaByRga \? `[^`]*` : )?ownWaitHtml\(ownFirst\)\)? : ""\}/, "a row that waits on their own earlier step doesn't say what to do first"],
  [/!isDone && step\.clientHint && !ownWait && /, "a waiting row still shows the ask under the band (the mockup shows the band alone)"],
  [/: rgaWait \? \{ text: CANT_START, why: `Waits on RGA\$\{moveSince\(openMv && openMv\.get\(step\.id\)\)\}`, cls: "wait" \}/, "a row that waits on RGA doesn't say \"Waits on RGA\" (the approved reason under \"Can't start yet\")"],
  [/const theirs = \(r\) => !rowWaits\(r\.step, r\.status, waitTasks, rgaWaits\)/, "a row that waits on RGA can be the client's NEXT step"],
  [/const waitTasks = \{ \.\.\.m1Tasks, \.\.\.m2Tasks \};/, "a Month-2 row's wait isn't read from this month's record"],
  [/const ownFirstId = rowOwnWaits\(step, status, waitTasks\);/, "a Month-2 row's \"Do step 14 first\" isn't read from this month's record"],
  [/tasks: waitTasks, rgaWaits(?:, photos: photos \|\| \[\])? \};/, "the \"your next step\" headline reads Month-2 waits from the onboarding record"],
  [/const ownFirst = ownFirstId \? \(\[\.\.\.\(playbook\.month1 \|\| \[\]\), \.\.\.\(playbook\.month2plus \|\| \[\]\)\]\.find/, "a Month-2 \"Do step N first\" can't find its step (no number)"],
  // 🔄 monthly_asks_v1 (10-20): this month's photos ON GOOGLE, no 5-a-month quota
  [/if \(s\.id === "m2\.exec\.gbp_photos" && photosOnGoogleThisMonth >= 1\) status = "done";/, "the monthly photo step counts every photo ever, not this month's on Google (month2_waits_v1 decision 3 + monthly_asks_v1)"],
  [/const photosThisMonth = \(photos \|\| \[\]\)\.filter\(\(p\) => p && p\.created_at\s*&& sameReportingMonth\(portalReportingMonth\(new Date\(p\.created_at\)\), portalReportingMonth\(\)\)\)\.length;/, "step 15's count isn't this reporting month's photos"],
  [/&& !rowWaits\(i\.step, i\.status, _nextStepInputs\?\.tasks, _nextStepInputs\?\.rgaWaits\)/, "the \"your next step\" headline can name a row that waits"],
  // 🔒 step12_review_requests_v1 (10-14): while it waits, the only control is the disabled "Add your 5 customers →".
  [/: step\.clientForm === "customer_list" \? \(ownWait \|\| listingWait \|\| \(rgaWait && !\(step\.clientWait && step\.clientWait\.how\)\) \? `<button class="pm-act is-go" disabled>Add your 5 customers →<\/button>` : ""\)/, "step 57's \"Add your 5 customers →\" stays live while it waits"],
  [/(?:const completionCtlLive = |: )reviewStep \? \(rgaWait \|\| ownWait \|\| listingWait \? "" : reviewStepHtml\(/, "step 57's customer cards show while it waits"],
  [/: \(rgaWait \|\| ownWait\) && \/<\(button\|input\|select\|textarea\)\\b\/\.test\(completionCtlLive\)\s*\? `<fieldset class="pm-waits" disabled>/, "a waiting row's form stays live"],
];
for (const [re, msg] of checks) if (!re.test(pcode)) fail(msg);
// 10-22: a screen-only redraw reuses the last answer; a real render still awaits it before any row draws
// 🔄 todo_inbox_v1 (10-26): the waits load BESIDE the open moves (one Promise.all), still awaited before any row draws
const lr = pcode.search(/const \[rgaWaits, openMv\] = opts\.local && _rgaWaitsCache\.has\(clientId\) \? \[_rgaWaitsCache\.get\(clientId\), [^\]]+\]\s*: await Promise\.all\(\[loadRgaWaits\(clientId\), loadOpenMoves\(clientId\)\]\);/), rh = pcode.indexOf("const rowHtml = ({");
if (lr < 0 || rh < 0 || lr > rh) fail("the rows render before the server's answer arrives (a waiting row flashes \"Your turn\")");
const loader = lift(portal, "async function loadRgaWaits(clientId) {", "\n}\n") || "";
if (!/if \(!r\.ok\) return null;/.test(loader) || /return new Set\(\)/.test(loader)) fail("a failed answer reads as \"nothing waits\" (it must be null: not known)");
const css = read("portal/portal.css");
if (!/\.pm-lock\.other \{[^}]*var\(--state-other-bg/.test(css)) fail("the RGA band isn't the blue \"not yours now\" state");
if (!/\.pm-act\.is-go:disabled \{[^}]*opacity/.test(css)) fail("a disabled action looks pressable");

// ── 5 · step 57's words are the approved mockup's ──
// 🔒 The words moved to step12_review_requests_v1 (approved 10-14), which replaced review_first_5_wait_v1's band.
const mock = read("reports/mockups/step12_review_requests_v1.html");
const cw = s57.clientWait || {};
for (const k of ["head", "body", "foot"]) if (!cw[k] || !mock.includes(cw[k].replace(/'/g, "'"))) fail(`step 57's ${k} isn't the approved mockup's words (step12_review_requests_v1) — a new wording needs a new approval`);
if (!mock.includes("Waits on RGA")) fail("the approved mockup no longer names the pill");

{
  const rc = code("netlify/functions/portal-step-recheck.js");
  if (!/"m2\.exec\.gbp_photos": async \(id\) => countProbe\(id, "client_photos", 5, "photo", \{ since: currentReportingMonth\(\)/.test(rc)
    || !/\$\{since \? `&created_at=gte\.\$\{since\}T00:00:00Z` : ""\}/.test(rc)) fail("the nightly check of step 15 counts every photo ever, not this month's (month2_waits_v1, decision 3)");
  const no = code("netlify/functions/notify-step-open.js");
  if (!/const M1 = PLAYBOOKS\.month1 \|\| \[\];/.test(no)) fail("the step-open email reaches past Month 1 (approved: no step-open email for Month 2; the report email tells them)");
}

if (F.length) { console.error("🔴 a client can be asked to do a step that waits on RGA:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ one rule gives the admin's answer (${pairs} RGA-held prerequisites, each checked alone; the chain walks through done steps; listing / kickoff left out); the projection carries a flag, never the graph; 4 writers ask first; the \"next\" email skips it and a nudge is refused; the portal says "Waits on RGA", never the turn, the NEXT step or the headline, and not known waits; step 57 says the approved words; ${ownPairs} client-held prerequisites wait as "Do step N first" / "Connect Google first", ahead of the listing and RGA; Month 2 walked on its own list (${m2pairs} prerequisites), judged against this month's record, 14/15/16 never wait, the call waits on RGA's report only (never the client's numbers), the photo step counts this month's on Google`);
