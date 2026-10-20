#!/usr/bin/env node
// check-client-portal-phases.mjs — 2026-10-20, approved client_portal_phases_v1 (final review R2 · the order). Chris: "all
// approved… make sure they integrate with admin and database too". RUNS the portal's own phase + feed code on fakes and pins:
//   · every numbered Month-1 client step declares its phase (1–4), numbers ascend with phases, no number twice; Monthly is 16–20
//     and the Ongoing cards draw in number order
//   · the Setup list draws a phase header where the phase changes, "x of y done" counted from the rows
//   · every wait reads "Can't start yet" with its reason under the title (never a bare reason as the status)
//   · no client copy names a step by a literal number ("See step 6") — it reads clientStepNo
//   · "What RGA did": only steps with a playbook clientFeed line, done only, the newest event decides, never payload.summary —
//     in the endpoint, the Monday digest, and the admin's "Client sees" line
//   · "What to expect" says what the public site says (30–60 days · 3–6 months) and promises no rank/leads/revenue; so does the recap
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), PB = JSON.parse(read("data/playbooks/playbooks.json"));
const FEEDJS = read("netlify/functions/_client-feed.js"), EP = read("netlify/functions/portal-feed.js"), DIG = read("netlify/functions/flow-cron-weekly-digest.js");
const PRICING = read("pricing/index.html"), FAQ = read("faq/index.html");
const F = [], fail = (m) => F.push(m);
const lift = (src, n) => { const at = src.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = src.indexOf("{", src.indexOf(")", at)); i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (!d) return src.slice(at + 1, i + 1); } } };
const block = (src, start) => { const a = src.indexOf(start); if (a < 0) { console.error(`⚠️  ${start.slice(0, 40)} moved`); process.exit(2); } let d = 0; for (let i = src.indexOf("{", a); i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (!d) return src.slice(a, i + 2); } } };

// ── 1. numbers + phases, declared in the playbook
const m1 = PB.month1.filter((s) => s.clientStepNo != null), m2 = PB.month2plus.filter((s) => s.clientStepNo != null);
const nos = [...m1, ...m2].map((s) => s.clientStepNo);
if (new Set(nos).size !== nos.length) fail(`two client steps share a number (${nos.join(",")})`);
const m1s = [...m1].sort((a, b) => a.clientStepNo - b.clientStepNo);
let last = 0;
for (const s of m1s) {
  if (![1, 2, 3, 4].includes(s.clientPhase)) fail(`${s.id} (step ${s.clientStepNo}) declares no phase 1–4`);
  else if (s.clientPhase < last) fail(`${s.id} (step ${s.clientStepNo}) is phase ${s.clientPhase} after a phase-${last} step — numbers must follow the phases`);
  else last = s.clientPhase;
}
const want = { "m1.kickoff.call": 1, "m1.gbp.verify": 2, "m1.access.website": 3, "m1.gbp.business_facts": 4, "m1.strategy.keywords_locations": 5, "m1.review.first_5": 13, "m1.call.close": 15 };
for (const [id, n] of Object.entries(want)) if (PB.month1.find((s) => s.id === id)?.clientStepNo !== n) fail(`${id} isn't step ${n} (the approved order: verify + facts before the rest, reviews 13, close-out last)`);
if (m2.some((s) => s.clientStepNo < 16 || s.clientStepNo > 20)) fail("Monthly client steps are not 16–20");
const ong = (P.match(/const ONGOING_ORDER = (\[[^\]]*\]);/) || [])[1];
if (!ong) fail("ONGOING_ORDER moved"); else {
  const order = JSON.parse(ong), byNo = [...m2].sort((a, b) => a.clientStepNo - b.clientStepNo).map((s) => s.id);
  if (JSON.stringify(order) !== JSON.stringify(byNo)) fail(`the Ongoing cards don't draw in number order (${order.join(" → ")} vs ${byNo.join(" → ")})`);
}
// ── 2. the phase headers, RUN
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), monthDay: (v) => new Date(v).toISOString().slice(5, 10), Math, Date, Number, String, Array });
vm.runInContext((P.match(/^const CANT_START = [^\n]*/m) || ["var CANT_START;"])[0].replace(/^const /, "var "), ctx);
vm.runInContext(block(P, "const CLIENT_PHASES = {").replace(/^const /, "var "), ctx);
vm.runInContext(lift(P, "phaseHeadHtml") + "\n" + lift(P, "phasedRowsHtml"), ctx);
ctx.__rows = [{ step: { id: "a", clientPhase: 1 }, status: "done" }, { step: { id: "b", clientPhase: 1 }, status: "pending" }, { step: { id: "dup" }, status: "pending" },
  { step: { id: "c", clientPhase: 2 }, status: "pending" }, { step: { id: "d", clientPhase: 4 }, status: "skipped" }];
const html = vm.runInContext("phasedRowsHtml(__rows, (r) => `<row ${r.step.id}>`, new Date('2026-11-08T00:00:00Z'))", ctx);
if ((html.match(/class="pm-phase"/g) || []).length !== 3) fail(`the Setup list doesn't draw one header per phase present (got ${(html.match(/class="pm-phase"/g) || []).length})`);
if (!/Phase 1 · Get started/.test(html) || !/1 of 2 done/.test(html)) fail("phase 1's header doesn't name it or count 1 of 2 done");
if (!/Phase 4 · Close Month 1/.test(html) || !/About 11-08 \(kickoff \+ 30 days\)/.test(html) || !/1 of 1 done/.test(html)) fail("phase 4 doesn't carry the kickoff + 30 date or counts a skipped step wrong");
if (html.indexOf("<row dup>") < html.indexOf("Phase 1") || html.indexOf("<row dup>") > html.indexOf("Phase 2")) fail("an unphased row (the duplicate notice) moved out of its place");
const noEnd = vm.runInContext("phasedRowsHtml([{ step: { id: 'z', clientPhase: 4 }, status: 'pending' }], (r) => '', null)", ctx);
if (!/About 30 days after your kickoff/.test(noEnd) || /NaN|Invalid/.test(noEnd)) fail("phase 4 with no kickoff yet invents a date");
if (!/phasedRowsHtml\(numbered, rowHtml, month1EndOf\(waitTasks\)\)/.test(P)) fail("the Setup list no longer draws through phasedRowsHtml");
// ── 3. Can't start yet
if (vm.runInContext("CANT_START", ctx) !== "Can't start yet") fail("the wait status isn't \"Can't start yet\"");
// (R4, 10-20: the own-step wait names RGA when Google is connected but Analytics doesn't exist yet — still "Can't start yet")
for (const [k, re] of [["ownWait", /ownWait \? \{ text: CANT_START, why: (gaByRga \? "RGA is setting up your Google Analytics" : )?ownFirstPill\(ownFirst\)/], ["rgaWait", /rgaWait \? \{ text: CANT_START, why: "Waits on RGA"/], ["listingWait", /listingWait \? \{ text: CANT_START, why:/]])
  if (!re.test(P)) fail(`a wait no longer reads "Can't start yet" with its reason (${k})`);
if (!/\$\{ownerPill\.why \? `<span class="pm-step-sub">\$\{escapeHtml\(ownerPill\.why\)\}<\/span>`/.test(P)) fail("the wait's reason isn't drawn under the title");
// ── 4. no literal step numbers in client copy
const code = P.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const lit = code.match(/>See step \d+ →<|\(step \d+\)<\/span>|"See step \d+/g);
if (lit) fail(`client copy names a step by a literal number: ${lit.join(" · ")}`);
if (!/const seeStepText = \(id\) =>/.test(P)) fail("seeStepText (the number read from the playbook) is gone");
// ── 5. the feed, RUN on fakes
const req = createRequire(`${SITE}/netlify/functions/_client-feed.js`);
let feed;
try { delete req.cache?.[req.resolve(`${SITE}/netlify/functions/_client-feed.js`)]; feed = req(`${SITE}/netlify/functions/_client-feed.js`); } catch (e) { console.error(`⚠️  _client-feed.js won't load: ${e.message}`); process.exit(2); }
const NOW = Date.parse("2026-10-20T12:00:00Z"), ago = (d) => new Date(NOW - d * 86400000).toISOString();
const withLine = [...PB.month1, ...PB.month2plus].filter((s) => s.clientFeed).map((s) => s.id);
const noLine = [...PB.month1, ...PB.month2plus].find((s) => !s.clientFeed && !/^m1\.kickoff\.call$/.test(s.id))?.id;
if (withLine.length < 40) fail(`only ${withLine.length} steps carry a clientFeed line — most RGA work would be invisible`);
const ev = [
  { kind: "flow_step_done", occurred_at: ago(1), payload: { step_id: withLine[0], status: "done", summary: "SECRET-INTERNAL ran 3 robot passes" } },
  { kind: "flow_step_done_manual", occurred_at: ago(2), payload: { step_id: withLine[1], new_status: "pending" } },        // reopened (newest)
  { kind: "flow_step_done", occurred_at: ago(3), payload: { step_id: withLine[1], status: "done" } },                     // older done → hidden
  { kind: "flow_step_done", occurred_at: ago(2), payload: { step_id: noLine, status: "done", summary: "x" } },            // no line → hidden
  { kind: "flow_cron_daily", occurred_at: ago(1), payload: { summary: "robot" } },
  { kind: "flow_step_done", occurred_at: ago(20), payload: { step_id: withLine[2], status: "done" } },                   // too old
  { kind: "flow_step_done", occurred_at: ago(4), payload: { step_id: withLine[3], status: "in_progress" } },             // not done
];
const out = feed.feedLines(ev, { days: 14, now: NOW });
if (out.length !== 1 || out[0].step_id !== withLine[0]) fail(`the feed shows the wrong steps (${out.map((o) => o.step_id).join(", ") || "none"}; want only ${withLine[0]})`);
if (JSON.stringify(out).includes("SECRET-INTERNAL")) fail("the feed carries RGA's payload.summary to the client");
if (out[0] && out[0].line !== PB.month1.concat(PB.month2plus).find((s) => s.id === withLine[0]).clientFeed) fail("the feed line isn't the playbook's clientFeed text");
if (!/\.map\(\(\{ at, line \}\) => \(\{ at, line \}\)\)/.test(EP)) fail("portal-feed returns more than { at, line } to the client");
if (!/requirePortalOwnerOrWorkspace\(event, clientId\)/.test(EP)) fail("portal-feed doesn't check who is asking");
if (!/require\("\.\/_client-feed"\)\.feedLines\(events/.test(DIG) || /e\.payload\?\.summary/.test(DIG) || /robot pass/.test(DIG)) fail("the Monday digest prints RGA's own notes (payload.summary / robot passes) instead of the clientFeed lines");
if (!/const clientSees = \(r\) =>/.test(ADM) || !/Client sees: &ldquo;/.test(ADM)) fail("the admin activity row no longer says what the client sees");
if (!/if \(!st\) return/.test(P) || !/if \(st\.error\) return/.test(P) || !/No finished steps in the last 14 days/.test(P)) fail("the feed card no longer keeps loading / failed / nothing-finished apart");
// ── 6. what to expect = the site's words, no promises
const exp = lift(P, "whatToExpectHtml");
for (const [where, t] of [["pricing page", PRICING], ["FAQ", FAQ]]) if (!/30–60 days/.test(t) || !/3–6 months/.test(t)) fail(`the ${where} no longer says 30–60 days / 3–6 months — re-check "What to expect" against it`);
if (!/30–60 days/.test(exp) || !/3–6 months/.test(exp) || !/We never promise/.test(exp)) fail("\"What to expect\" doesn't say the site's timing or drops the no-promise line");
if (/guarantee|#1 in|top 3 in/i.test(exp.replace(/A #1 spot/, ""))) fail("\"What to expect\" promises a ranking");
if (!/Fuller results usually take 3 to 6 months\. We never promise a #1 spot/.test(ADM)) fail("the kickoff recap doesn't carry the same timing + no-promise line");
if (!/whatToExpectHtml\(onboarding\)/.test(P) || !/rgaFeedHostHtml\(client\.id \|\| row\.client_id\)/.test(P) || !/loadRgaFeed\(row\.client_id\)/.test(P)) fail("the dashboard no longer draws / loads the feed and What to expect");
if (F.length) { console.error("🔴 the client portal phases regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ client portal phases hold: 4 phases declared + drawn with counted headers · numbers 1–15 + 16–20 in order · "Can't start yet" + reason · no literal step numbers · feed = ${withLine.length} clientFeed lines, done-only, newest decides, never RGA's notes (endpoint, digest, admin) · What to expect = the site's words, no promises`);
