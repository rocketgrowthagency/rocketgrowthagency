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

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
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
const doneCall = js.match(/ob-step \$\{declined[\s\S]{0,160}?\$\{obMarker\(n, ([^)]*)\)\}/);
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

// ── 3. RUN the phase renderer ─────────────────────────────────────────────────────────────
const ctx = vm.createContext({});
vm.runInContext(
  [
    `const escapeHtml = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");`,
    `const escapeAttribute = escapeHtml;`,
    `const _obPhaseOpen = new Set(); const _obPhaseShut = new Set();`,
    slice("const obGroupOf =", ";", "obGroupOf"),
    slice("const OB_PHASES = [", "\n];", "OB_PHASES"),
    slice("function obPhaseBody(", "\n}", "obPhaseBody"),
    slice("function obPhaseMarker(", "\n}", "obPhaseMarker"),
    slice("function obPhasedHtml(", "\n}\n", "obPhasedHtml"),
    slice("  const OB_GLYPH = {", "\n", "OB_GLYPH").trim(),
    slice("  const obMarker = (num, kind) =>", ";", "obMarker").trim(),
    `globalThis._x = { obPhasedHtml, OB_PHASES, obGroupOf, obMarker, OB_GLYPH, obPhaseMarker };`,
  ].join("\n"),
  ctx
);
const { obPhasedHtml, OB_PHASES, obGroupOf, obMarker, OB_GLYPH, obPhaseMarker } = ctx._x;

const m1 = JSON.parse(fs.readFileSync(W + "data/playbooks/playbooks.json", "utf8")).month1;

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
