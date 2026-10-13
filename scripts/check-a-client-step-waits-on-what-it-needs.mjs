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
//      Left out on purpose: the listing check (its own rule), the client's own steps, the kickoff booking, Month 2.
//   2. The public projection carries a FLAG, never an admin step id; the server endpoint answers with the real rule.
//   3. Every writer of the step's status asks first: the input save, "I've done it", a choice, the detection recheck.
//   4. The portal: the row says "Waits on RGA", is never the client's turn, never the NEXT step, never the headline;
//      its action is disabled; NOT KNOWN IS NOT OPEN (a failed answer waits).
//   5. Step 57's words are the approved mockup's.
// exit 0 = a client is never asked to do a step that waits on RGA · 1 = they can be · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
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
let pairs = 0;
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
  }
}
if (pairs < 2) { console.error(`⚠️  INDETERMINATE — only ${pairs} RGA-held prerequisites found on Month-1 client steps; the graph changed`); process.exit(2); }
// A chain through a DONE step still holds (the admin walks through it): synthetic C(client) → B(rga, done) → A(rga, open).
const syn = { month1: [{ id: "A", dependsOn: [] }, { id: "B", dependsOn: ["A"] }, { id: "C", dependsOn: ["B"], clientLabel: "c", clientBucket: "act" }] };
if (W.waitsOnRgaNow(syn, syn.month1[2], { B: done }) !== "A") fail("the rule stops at a done step and misses an unfinished step further up the chain");
const m2 = (pb.month2plus || []).find((s) => vis(s) && W.rgaPrereqs(s, pb.month2plus).length);
if (!m2) { console.error("⚠️  INDETERMINATE — no Month-2 client step has an RGA prerequisite to prove Month 2 is left out"); process.exit(2); }
if (W.waitsOnRgaNow(pb, m2, {})) fail(`a Month-2 step (${m2.id}) waits by reading the Month-1 record — its status lives in the monthly record`);

// ── 2 · the projection carries a flag, never the graph; the endpoint runs the rule ──
const cs = JSON.parse(read("data/playbooks/client-steps.json"));
for (const st of [...(cs.month1 || []), ...(cs.month2plus || [])]) {
  const src = byId.get(st.id);
  const want = !!src && W.rgaPrereqs(src, m1).length > 0;
  if (st.waitsOnRga !== undefined && st.waitsOnRga !== true) fail(`client-steps.json: ${st.id} waitsOnRga is ${JSON.stringify(st.waitsOnRga).slice(0, 40)} — a flag only, never ids (the graph stays private)`);
  if (!!st.waitsOnRga !== want) fail(`client-steps.json: ${st.id} waitsOnRga is ${!!st.waitsOnRga}, the SOP says ${want} — re-run build-client-steps`);
}
const ep = req("./portal-step-waits.js");
if (typeof ep.rgaWaitsFor !== "function") fail("portal-step-waits no longer exports the rule it serves");
else {
  const a = ep.rgaWaitsFor({}), b = ep.rgaWaitsFor({ [S56]: done });
  if (!a.includes(S57) || b.includes(S57)) fail("the endpoint's answer for step 57 doesn't follow step 56");
  if (a.some((id) => !vis(byId.get(id)) && !(pb.month2plus || []).some((s) => s.id === id))) fail("the endpoint answers with a step the client cannot see");
}
const epc = code("netlify/functions/portal-step-waits.js");
const gateAt = epc.search(/const gate = await requirePortalOwner(?:OrWorkspace)?\(event, clientId\);\s*if \(gate\.error\) return gate\.error;/), readAt = epc.indexOf("client_onboarding_records");
if (gateAt < 0 || readAt < gateAt) fail("portal-step-waits reads a client's record before checking who is asking");
if (!/if \(!r\.ok\) return json\(5\d\d/.test(epc)) fail("portal-step-waits answers a failed read with a list (an empty one says nothing waits)");

// ── 3 · every writer of the status asks first ──
const guardRe = /if \(waitsOnRgaNow\(PLAYBOOKS, (?:step|s), data\.tasks\)\) return json\(409/g;
const guardsBeforeDone = (src) => { const out = []; for (const m of src.matchAll(guardRe)) { const w = src.indexOf('status: "done"', m.index); out.push(w); } return out; };
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
  if (!/const waitingOnRga = waitsOnRgaNow\(PLAYBOOKS, step, d0\.tasks\);/.test(src) || !/if \(probe\.verdict === "confirmed" && t0\[stepId\]\.status !== "done" && !waitingOnRga\)/.test(src)) fail("a detection (5 customers in) finishes a step that waits on RGA (portal-step-recheck)");
}

// ── 3b · the emails that name a client step: the "what we'll need from you next" list skips a waiting step (run for
//         real), and a nudge for a waiting step is refused before anything is sent ──
{
  const cf = read("netlify/functions/send-confirmation-email.js");
  const i = cf.indexOf("function openClientSteps(tasks) {"), j = i < 0 ? -1 : cf.indexOf("\n}\n", i);
  if (i < 0 || j < 0) { console.error("⚠️  INDETERMINATE — could not lift openClientSteps from send-confirmation-email.js"); process.exit(2); }
  const L = req("./_one-listing.js");
  const ectx = { require: req, listingState: L.listingState, waitsOnListing: L.waitsOnListing, waitsOnRgaNow: W.waitsOnRgaNow };
  vm.createContext(ectx);
  vm.runInContext(`${cf.slice(i, j + 2)}\nthis.open = openClientSteps;`, ectx);
  const lab = s57.clientLabel;
  const one = { [DUP]: { outcome_data: { verdict: "clean" } } };
  if (ectx.open({ ...one }).includes(lab)) fail("the kickoff \"yes\" email asks for step 57 (\"what we'll need from you next\") while it waits on RGA");
  if (!ectx.open({ ...one, [S56]: done }).includes(lab)) fail("the kickoff \"yes\" email never asks for step 57, even once RGA's part is done");
  const hrs = byId.get("m1.gbp.hours_attributes")?.clientLabel;
  if (hrs && ectx.open({ [S56]: done }).includes(hrs)) fail("the kickoff \"yes\" email asks for hours while the business may have two Google listings");
}
{
  const sc = code("netlify/functions/send-step-email.js");
  const g = sc.search(/if \(isNudge\) \{[\s\S]{0,1200}?const holder = waitsOnRgaNow\(PB, sop, tasks\);\s*if \(holder\) return jsonRes\(409/);
  const sendAt = sc.indexOf("sent = await sendAsRga(");
  if (g < 0 || sendAt < 0 || g > sendAt) fail("RGA can nudge a client about a step that waits on RGA (send-step-email sends before asking)");
  if (!/if \(waitsOnListing\(sop\) && !listingState\(tasks\)\.open\) \{\s*return jsonRes\(409/.test(sc)) fail("RGA can nudge a client about a step that waits on one Google listing");
}

// ── 4 · the portal ──
const portal = read("portal/portal.js");
const lift = (src, start, end) => { const i = src.indexOf(start); const j = i < 0 ? -1 : src.indexOf(end, i); return i < 0 || j < 0 ? null : src.slice(i, j); };
const fns = lift(portal, "function portalListingStateOf(tasks) {", "\nfunction photoListingLockHtml");
if (!fns || !/function rowRgaWaits\(/.test(fns) || !/function rowWaits\(/.test(fns)) { console.error("⚠️  INDETERMINATE — could not lift the portal's wait helpers"); process.exit(2); }
const ctx = { escapeHtml: (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") };
vm.createContext(ctx);
vm.runInContext(`${fns}\nthis.r = rowRgaWaits; this.w = rowWaits; this.h = rgaWaitHtml;`, ctx);
const row = { id: S57, waitsOnRga: true, clientWait: s57.clientWait };
if (!ctx.r(row, "pending", new Set([S57]))) fail("the portal doesn't wait when the server says step 57 waits");
if (ctx.r(row, "pending", new Set())) fail("the portal waits when the server says nothing does");
if (!ctx.r(row, "pending", null)) fail("NOT KNOWN reads as open: a failed answer would say \"Your turn\" on a step that may wait");
if (ctx.r(row, "done", null) || ctx.r(row, "skipped", new Set([S57]))) fail("a finished row reads as waiting");
if (ctx.r({ id: "x" }, "pending", null)) fail("a row that can't wait reads as waiting");
if (!ctx.w(row, "pending", {}, new Set([S57]))) fail("rowWaits (the marker's + the headline's question) ignores the RGA wait");
const band = ctx.h(row);
if (!band.includes("pm-lock other") || !band.includes(ctx.escapeHtml(s57.clientWait?.head || "\u0000"))) fail("step 57's blue band doesn't say what RGA is doing first");
if (ctx.h({ id: "x" }) !== "") fail("a row with no wait copy draws an empty band");
const pcode = code("portal/portal.js");
const checks = [
  [/const rgaWait = !listingWait && rowRgaWaits\(step, status, rgaWaits\);/, "the row doesn't ask whether it waits on RGA"],
  [/const theirsToAct = !kickoffPending && !listingWait && !rgaWait && \(/, "a row that waits on RGA still counts as the client's turn (the orange edge)"],
  [/: isDone \? \{ text: "Done", cls: "done" \}\s*: rgaWait \? \{ text: "Waits on RGA", cls: "wait" \}/, "a row that waits on RGA doesn't say \"Waits on RGA\" (the approved pill)"],
  [/const theirs = \(r\) => !rowWaits\(r\.step, r\.status, onboarding\?\.data\?\.tasks, rgaWaits\)/, "a row that waits on RGA can be the client's NEXT step"],
  [/&& !rowWaits\(i\.step, i\.status, _nextStepInputs\?\.tasks, _nextStepInputs\?\.rgaWaits\)/, "the \"your next step\" headline can name a row that waits"],
  [/data-jump-to="customer"\$\{rgaWait \? " disabled" : ""\}>Submit list →/, "step 57's \"Submit list →\" stays live while it waits"],
  [/: rgaWait && \/<\(button\|input\|select\|textarea\)\\b\/\.test\(completionCtlLive\)\s*\? `<fieldset class="pm-waits" disabled>/, "a waiting row's form stays live"],
];
for (const [re, msg] of checks) if (!re.test(pcode)) fail(msg);
const lr = pcode.indexOf("const rgaWaits = await loadRgaWaits(clientId);"), rh = pcode.indexOf("const rowHtml = ({");
if (lr < 0 || rh < 0 || lr > rh) fail("the rows render before the server's answer arrives (a waiting row flashes \"Your turn\")");
const loader = lift(portal, "async function loadRgaWaits(clientId) {", "\n}\n") || "";
if (!/if \(!r\.ok\) return null;/.test(loader) || /return new Set\(\)/.test(loader)) fail("a failed answer reads as \"nothing waits\" (it must be null: not known)");
const css = read("portal/portal.css");
if (!/\.pm-lock\.other \{[^}]*var\(--state-other-bg/.test(css)) fail("the RGA band isn't the blue \"not yours now\" state");
if (!/\.pm-act\.is-go:disabled \{[^}]*opacity/.test(css)) fail("a disabled action looks pressable");

// ── 5 · step 57's words are the approved mockup's ──
const mock = read("reports/mockups/review_first_5_wait_v1.html");
const cw = s57.clientWait || {};
for (const k of ["head", "body", "foot"]) if (!cw[k] || !mock.includes(cw[k].replace(/'/g, "'"))) fail(`step 57's ${k} isn't the approved mockup's words (review_first_5_wait_v1) — a new wording needs a new approval`);
if (!mock.includes("Waits on RGA")) fail("the approved mockup no longer names the pill");

if (F.length) { console.error("🔴 a client can be asked to do a step that waits on RGA:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ one rule gives the admin's answer (${pairs} RGA-held prerequisites, each checked alone; the chain walks through done steps; listing / client-held / kickoff / Month 2 left out); the projection carries a flag, never the graph; 4 writers ask first; the \"next\" email skips it and a nudge is refused; the portal says "Waits on RGA", never the turn, the NEXT step or the headline, and not known waits; step 57 says the approved words`);
