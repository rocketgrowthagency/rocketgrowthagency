#!/usr/bin/env node
/**
 * ONE NUMBERING SYSTEM ON THE ONBOARDING CHECKLIST.
 *
 * 🔴🔴 The step disc held the row's position in the FLAT list of 61, and the phased view REGROUPS
 * those 61 — so the number stopped describing its container. "Citations & platforms" rendered
 * 49, 50, 51, 55 beside a phase badge reading "8": two scales, same circle, 40px apart.
 * 5 of 10 phases were non-contiguous; worst jump 16 (36 → 52). Chris, 2026-10-01:
 *   "can we fix the numbering here. its 8 then 49, 50, 51. thjis is confusing."
 *
 * This gate RUNS obPhasedHtml rather than grepping it, because "the source contains ob-ph-state"
 * is not the same claim as "the page renders one marker per phase".
 * → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
 */
import fs from "node:fs";
import vm from "node:vm";
import { liftAdmin } from "./_lift-admin.mjs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W = `${__SITE}/`;
const js = fs.readFileSync(W + "admin/admin.js", "utf8");
const css = fs.readFileSync(W + "admin/admin.css", "utf8");
const fails = [];
const F = (m) => fails.push(m);

const slice = (a, b, label) => {
  const i = js.indexOf(a);
  if (i < 0) throw new Error(`anchor gone: ${label}`);
  const e = js.indexOf(b, i);
  if (e < 0) throw new Error(`end gone: ${label}`);
  return js.slice(i, e + b.length);
};

// ── 1. the dead name must be GONE, not merely unreferenced ────────────────────────────────
for (const dead of ["ob-ph-idx"]) {
  const n = (js.match(new RegExp(dead, "g")) || []).length + (css.match(new RegExp(dead, "g")) || []).length;
  if (n) F(`the old phase numeral \`${dead}\` is still present ${n}× — two numbering systems can come back`);
}

// ── 2. no row builder may put the NUMBER back inside the disc ─────────────────────────────
const inDisc = [...js.matchAll(/<span class="ob-num">\$\{(?!OB_GLYPH)/g)].length;
if (inDisc) F(`${inDisc} row builder(s) interpolate into the disc directly — the disc carries STATE, the number lives in .ob-sid`);
const markerCalls = (js.match(/\$\{obMarker\(n, /g) || []).length;
// 🔴 A DECLINED STEP MUST NOT WEAR THE DONE TICK. Pin the PROPERTY — that the kind VARIES with
// `declined` — not the exact expression. → feedback_a_gate_must_pin_the_property_not_the_spelling
// 🔄 2026-10-08: the done row's class/marker gained a kickoff prefix (`kick2 || kick4Req ? "active" : declined ? …`);
// find it by the declined test inside the class expression, not by its first token.
const doneCall = js.match(/ob-step \$\{[^}`]*?declined[\s\S]{0,200}?\$\{obMarker\(n, ([^)]*)\)\}/);
if (!doneCall) F("cannot find the done/declined row builder's obMarker call — the anchor moved");
else if (!/declined/.test(doneCall[1]))
  F(`the done row passes a fixed kind (\`${doneCall[1].trim()}\`) — a DECLINED step would render the done tick`);
if (markerCalls < 5) F(`only ${markerCalls} of the 5 row builders call obMarker() — a builder left behind drifts`);

// ── 2b. THE IN-PLACE TOGGLE MUST CORRECT THE MARKER ───────────────────────────────────────
// 🔴 The toggle mutates the DOM and re-renders nothing (by design — a re-render drops the live call
// console). The glyph encodes `open`, so a toggle that only flips the class leaves it stale: the
// ring goes amber while the glyph still reads ○. Caught on a real screenshot, not by any count.
{
  const h = js.match(/closest\("\[data-ob-phase-toggle\]"\)[\s\S]{0,1400}?\n\}\);/);
  if (!h) F("cannot find the phase toggle handler — the anchor moved");
  else {
    if (!/\.ob-ph-state/.test(h[0])) F("the phase toggle never touches .ob-ph-state — the marker goes stale on every click");
    if (!/obPhaseMarker\(/.test(h[0])) F("the phase toggle decides the marker itself instead of calling obPhaseMarker() — two producers drift");
    if (!/classList\.toggle\("is-todo"/.test(h[0])) F("the phase toggle never corrects is-todo — a reopened phase keeps the grey ground");
  }
}

// ── 2c. THE WAY BACK: ONE PRODUCER, AND THE APPROVED SHAPE ────────────────────────────────
// 🔴 The label used to read "The step to do now <9> Get CMS / hosting access" — a grey MONOSPACE
// numeral between two blue phrases: a different colour, a different type family, and no grammar.
// Chris, 2026-10-01: "i dont like how the 9 looks different". Approved (admin_the_way_back_control_v1,
// option 4): ONE blue phrase, the number inside the words — "↑ Step 9 · Get CMS / hosting access".
// 🔴 NOT circled: a disc on this screen means STATE, and the number was moved out of it that morning.
{
  const fn = js.match(/function obGotoLabel\(num, title\)[\s\S]{0,400}?\n\}/);
  if (!fn) F("obGotoLabel() is gone — the two render sites are building the label by hand again");
  else {
    const body = fn[0];
    if (!/Step \$\{num\}/.test(body)) F(`the way-back label no longer reads "Step N": ${body.split("\n").find(l => l.includes("return")) || ""}`.slice(0, 150));
    if (!/class="dot"/.test(body)) F("the way-back label lost its middot — the step name runs into the title");
    if (/class="sid"/.test(body)) F("the way-back label is back to a separate grey id");
    if (!/escapeHtml\(title\)/.test(body)) F("the way-back label no longer escapes the title — a step named with & or < would break the button");
  }
  // both sites must CALL it rather than build their own
  const calls = (js.match(/\$\{obGotoLabel\(/g) || []).length;
  if (calls < 2) F(`only ${calls} of the 2 way-back render sites call obGotoLabel() — month 1 has phases, month 2+ does not, and they drift`);
  const handBuilt = (js.match(/class="ob-goto"[^`]*<span class="ar">/g) || []).length;
  if (handBuilt) F(`${handBuilt} way-back control(s) still build the label inline instead of calling obGotoLabel()`);
  if (/The step to do now/.test(js.replace(/^\s*\/\/.*$/gm, ""))) F('the old "The step to do now" label is still produced');
  if (/\.ob-goto \.sid\s*\{/.test(css)) F(".ob-goto .sid is still styled — a rule nothing can wear");
}

// ── 3. RUN the phase renderer ─────────────────────────────────────────────────────────────
// 🔴🔴 THE HAND-WRITTEN LIFT LIST IS GONE (2026-10-05). The comments it used to carry tell the
// story: it threw on `obRespectDeps` in October, then on `obPhaseIndexOf` three days later, and the
// note left behind each time ("a lifted function is a claim that its whole dependency set came too")
// did not stop the next one. A comment is not a mechanism.
// 🔑 The shared lifter resolves its own set, at eval time and at call time, and reports a gap as
// INDETERMINATE rather than letting a call throw.
// → scripts/_lift-admin.mjs · feedback_a_comment_asserting_a_fix_is_not_the_fix
const lifted = liftAdmin(
  ["obPhasedHtml", "obPhaseMarker", "obPageNumbers", "obPageOrdered", "obGroupOf", "OB_PHASES", "OB_CARD_OF", "OB_SEGMENT_CARD"],
  // 🔑 + the kickoff state (2026-10-08): the phase count asks kickoffState() whether step 2/4 is open.
  // No client selected = no request, which is the honest default for a numbering check.
  { extraGlobals: { _obPhaseOpen: new Set(), _obPhaseShut: new Set(), state: { selectedClient: null, onboardingData: {} },
    _kickoffPendingIso: new Map(), _kickoffPendingAsk: new Map(), _kickoffAskProbed: new Set() } },
);
const OB_PHASES = lifted.constant("OB_PHASES");
const obGroupOf = lifted.get("obGroupOf");
const obPhasedHtml = (...a) => lifted.call("obPhasedHtml", a);
const obPhaseMarker = (...a) => lifted.call("obPhaseMarker", a);
const obPageNumbers = (...a) => lifted.call("obPageNumbers", a);
const obPageOrdered = (...a) => lifted.call("obPageOrdered", a);
const obMarker = (...a) => lifted.call("obMarker", a);
const OB_GLYPH = lifted.constant("OB_GLYPH");

const m1 = JSON.parse(fs.readFileSync(W + "data/playbooks/playbooks.json", "utf8")).month1;

// ── 2d. THE NUMBER COUNTS THE PAGE ────────────────────────────────────────────────────────
// 🔴🔴 It used to be the step's position in the PLAYBOOK FILE while the page regroups those steps
// into phases by topic — so reading top to bottom it went BACKWARDS 3 times, was non-consecutive at
// 10 of 60 boundaries and jumped by 16. Chris, 2026-10-02: "it jumps from 13, 14 to 23 then 27".
// 🔴 And bucket order is still not DOM order: "The audit" collapses its automated checks into a
// rollup that is emitted BEFORE the steps needing a human. Number in EMITTED order or it drifts
// again by 1 backwards and 3 gaps.
{
  const steps = m1.map((s) => ({ obj: { ...s, flowId: s.id, sopType: s.type } }));
  const pos = obPageNumbers(steps);
  const order = obPageOrdered(steps);
  if (pos.size !== m1.length) F(`${pos.size} of ${m1.length} steps got a number`);
  if (new Set(pos.values()).size !== pos.size) F("two steps share a number");
  const vals = [...pos.values()].sort((a, b) => a - b);
  if (vals[0] !== 1 || vals[vals.length - 1] !== m1.length) F(`the numbers run ${vals[0]}..${vals[vals.length - 1]}, not 1..${m1.length}`);
  // 🔴 COMPARING pos TO obPageOrdered IS SELF-CONSISTENT — both move together, so it can never
  // fail. RENDER the page and read the numbers in DOM order; that is independent of the producer.
  {
    const rows = steps.map((st, i) => `<div class="ob-step done"><span class="ob-sid">${pos.get(i)}</span></div>`);
    const html = obPhasedHtml(steps, rows, true, null);
    const seen = [...html.matchAll(/<span class="ob-sid">(\d+)<\/span>/g)].map((m) => +m[1]);
    if (seen.length !== m1.length) F(`${seen.length} numbers rendered for ${m1.length} steps`);
    let back = 0, gaps = 0;
    for (let k = 1; k < seen.length; k++) { const d = seen[k] - seen[k - 1]; if (d < 0) back++; if (d !== 1) gaps++; }
    if (back) F(`reading the RENDERED page top to bottom the number goes BACKWARDS ${back} time(s)`);
    if (gaps) F(`the number is not the next number at ${gaps} boundary(ies) on the rendered page`);
  }
  // 🔑 The references we actually use must survive. Re-pinned 2026-10-08 to the APPROVED Month-1 order
  // (onboarding_order_audit_v1): record check 1, welcome email 5, booking 6, the call 7, website access 8.
  for (const [n, id] of [[1, "m1.kickoff.create"], [5, "m1.close.confirm"], [6, "m1.close.kickoff_invite"], [7, "m1.kickoff.call"], [8, "m1.access.website"]]) {
    const i = m1.findIndex((x) => x.id === id);
    if (i < 0) { F(`${id} is gone from the playbook`); continue; }
    if (pos.get(i) !== n) F(`"step ${n}" (${id}) is now number ${pos.get(i)} — the vocabulary we speak would go stale`);
  }
}

// ── 2e. "NOW SET TO" IS ONE LINE ──────────────────────────────────────────────────────────
// 🔴 It was a full-width band: the label outside the card's text column, the value and the button at
// opposite edges with dead space between, and the provenance on its own line — a whole row for four
// words. → admin_numbering_and_now_set_to_v1
{
  const set = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.ob-set\s*\{([^}]*)\}/);
  if (!set) F(".ob-set has no rule");
  else {
    if (!/align-items:\s*baseline/.test(set[1])) F("the setting strip no longer aligns its parts on one baseline");
    if (!/padding:[^;]*\s15px/.test(set[1])) F("the setting strip is not inset to the card's text column");
  }
  const v = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.ob-set \.v\s*\{([^}]*)\}/);
  if (!v) F(".ob-set .v has no rule");
  else {
    if (!/white-space:\s*nowrap/.test(v[1]) || !/text-overflow:\s*ellipsis/.test(v[1]))
      F("the setting value wraps instead of truncating — a long draft opens the card");
    // 🔴 Without min-width:0 a flex child never shrinks, so the ellipsis never fires and the control
    // is pushed off the row. → feedback_a_grid_child_needs_min_width_zero
    if (!/min-width:\s*0/.test(v[1])) F("the setting value has no min-width:0, so the ellipsis can never fire");
  }
}


// the phase-marker producer: all four combinations of (settled, open)
for (const [settled, open, glyph, todo] of [[true,true,"\u2713",false],[true,false,"\u2713",false],[false,true,"\u25cf",false],[false,false,"\u25cb",true]]) {
  const m = obPhaseMarker(settled, open);
  if (m.glyph !== glyph) F(`obPhaseMarker(settled=${settled}, open=${open}) gave "${m.glyph}", expected "${glyph}"`);
  if (m.todo !== todo) F(`obPhaseMarker(settled=${settled}, open=${open}).todo = ${m.todo}, expected ${todo}`);
}

// ── 4. the glyph set: every state a row can be in has one, and none of them is a digit ────
for (const k of ["done", "declined", "active", "queued", "locked"]) {
  if (!OB_GLYPH[k]) F(`no glyph for row state "${k}" — it would fall back and read as another state`);
  if (/\d/.test(OB_GLYPH[k] || "")) F(`the glyph for "${k}" is a digit (${OB_GLYPH[k]}) — that is the bug being fixed`);
}
const mk = obMarker(55, "queued");
if (!/class="ob-num"/.test(mk) || !/class="ob-sid">55</.test(mk))
  F(`obMarker does not emit a state disc plus an .ob-sid identifier: ${mk}`);
if (/class="ob-num">\s*55/.test(mk)) F("obMarker put the number back in the disc");

// ── 5. three scenarios, each asserting the phase-level invariants ─────────────────────────
const build = (uiStateOf) =>
  m1.map((s, i) => ({ obj: { ...s, flowId: s.id, t: s.t || s.title }, uiState: uiStateOf(s, i) }));
const rows = (steps, consoleAt = -1) =>
  steps.map((s, i) =>
    `<div class="ob-step ${s.uiState}">${obMarker(i + 1, s.uiState)}${i === consoleAt ? `<div class="kc ">live console</div>` : ""}</div>`);

const phaseOf = (steps) => {
  const used = new Set();
  return OB_PHASES.map((ph) => {
    const idx = [];
    steps.forEach((s, i) => { if (!used.has(i) && ph.groups.includes(obGroupOf(s.obj.flowId))) { idx.push(i); used.add(i); } });
    return { ph, idx };
  });
};

const scenarios = [
  {
    name: "step 9 active, later phases hold queued rows (Chris's screenshot)",
    // 🔑 NOT a prefix of done — that is exactly the real state: 49 was done while 9 was still open.
    state: (s, i) => (i < 8 || i === 48 ? "done" : i === 8 ? "active" : [49, 50, 54, 55, 56].includes(i) ? "queued" : "locked"),
    expectGotos: (b, steps) => b.filter((x) => !x.idx.includes(steps.findIndex((s) => s.uiState === "active")) && x.idx.some((i) => steps[i].uiState === "queued")).length,
  },
  {
    // 🔴 THE COMMON CASE, and the one that exercises the "do not link to yourself" branch: the
    // active step's OWN phase also holds queued rows. Without this the suppression is untested.
    name: "active step has queued siblings in its own phase",
    state: (s, i) => (i < 4 ? "done" : i === 4 ? "active" : i < 9 ? "queued" : i === 48 ? "queued" : "locked"),
    expectGotos: (b, steps) => b.filter((x) => !x.idx.includes(steps.findIndex((s) => s.uiState === "active")) && x.idx.some((i) => steps[i].uiState === "queued")).length,
  },
  { name: "everything done", state: () => "done", expectGotos: () => 0 },
  {
    // 🔴🔴 A SETTLED PHASE THAT IS OPEN. The kickoff phase is marked done at the call's START time —
    // that is what unlocks Access — so it is 2/2 while the console is still on screen, and
    // holdsLiveConsole() opens it. A marker keyed on `open` before `done === total` shows ● there
    // and the phase stops reading as finished. → project_kickoff_meeting_lifecycle
    name: "the kickoff phase is 2/2 AND open, because it holds the live console",
    state: (s, i) => (i < 4 ? "done" : i === 4 ? "active" : i < 9 ? "queued" : "locked"),
    consoleAt: 3,
    expectGotos: (b, steps) => b.filter((x) => !x.idx.includes(steps.findIndex((s) => s.uiState === "active")) && x.idx.some((i) => steps[i].uiState === "queued")).length,
  },
  { name: "no active step at all", state: (s, i) => (i < 10 ? "done" : "locked"), expectGotos: () => 0 },
];

for (const sc of scenarios) {
  const steps = build(sc.state);
  const html = obPhasedHtml(steps, rows(steps, sc.consoleAt ?? -1), true, null);
  const buckets = phaseOf(steps).filter((b) => b.idx.length);
  const want = sc.expectGotos(buckets, steps);

  const heads = [...html.matchAll(/<span class="ob-ph-state([^"]*)">(.)<\/span>/g)];
  if (heads.length !== buckets.length)
    F(`[${sc.name}] ${heads.length} phase markers rendered for ${buckets.length} phases`);

  // glyph must agree with the phase's real state — ✓ ONLY when every row is settled
  buckets.forEach((b, k) => {
    const h = heads[k];
    if (!h) return;
    const settled = b.idx.every((i) => steps[i].uiState === "done" || steps[i].uiState === "skipped");
    const glyph = h[2], todo = h[1].includes("is-todo");
    if (settled && glyph !== "✓") F(`[${sc.name}] "${b.ph.name}" is fully settled but its marker is "${glyph}"`);
    if (!settled && glyph === "✓") F(`[${sc.name}] "${b.ph.name}" is NOT settled but renders ✓ — a false all-clear`);
    if (settled && todo) F(`[${sc.name}] "${b.ph.name}" is settled yet carries is-todo (grey)`);
    if (glyph === "○" && !todo) F(`[${sc.name}] "${b.ph.name}" renders ○ without is-todo — it would show GREEN on a 0/n phase`);
  });

  const gotos = (html.match(/class="ob-goto"/g) || []).length;
  if (gotos !== want) F(`[${sc.name}] ${gotos} way-back controls rendered, expected ${want}`);

  // never in the phase that already holds the active step
  const activeI = steps.findIndex((s) => s.uiState === "active");
  if (activeI >= 0) {
    const own = buckets.find((b) => b.idx.includes(activeI));
    if (own) {
      const m = html.match(new RegExp(`data-ob-phase="${own.ph.key}"[\\s\\S]*?(?=<div class="ob-phase|$)`));
      if (m && /class="ob-goto"/.test(m[0])) F(`[${sc.name}] "${own.ph.name}" holds the active step AND a link back to it`);
    }
    // and strictly fewer than one per queued row — the wall this replaced
    const queued = steps.filter((s) => s.uiState === "queued").length;
    if (queued > 2 && gotos >= queued) F(`[${sc.name}] ${gotos} controls for ${queued} queued rows — back to one per row`);
  }
  if (/ob-ph-idx/.test(html)) F(`[${sc.name}] a phase still renders the old numeral`);
  if (/Go to step \d/.test(html)) F(`[${sc.name}] the old "Go to step N" label is still rendered`);
}

if (fails.length) {
  console.error("🔴 the checklist has more than one numbering system\n");
  fails.forEach((f) => console.error("  • " + f));
  process.exit(1);
}
console.log("✓ one numbering system: the disc carries state, .ob-sid carries the identifier, one way back per phase");
