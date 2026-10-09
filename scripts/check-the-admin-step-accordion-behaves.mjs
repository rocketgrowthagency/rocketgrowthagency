#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-admin-step-accordion-behaves.mjs
//
// 🔒 WHY (2026-10-09, approved admin_step_accordion_v1): Chris — "can we make the steps in admin overview
// accordion style? … the top categories are but the numbers inside are not … they get very long when
// opened … we need to lock this down." The admin twin of check-the-setup-accordion-behaves (the client
// portal's, 09-25).
//
// RUNS THE REAL CODE: the accordion block is lifted out of admin/admin.js (from `const _obStepOpen` to
// `function revealStep`) and executed in jsdom against a card with a finished step, the step that needs
// you, a waiting-on-client step, a queued row with its one-line note, and a LIVE call step.
// HOLDS:
//   1. on render exactly one step is open (the one that needs you) — plus the live call, which never folds
//   2. a folded step keeps its header row and its one-line note; its body is hidden="until-found" (⌘F works)
//   3. clicking a folded row opens it and folds the one before; a button inside the row does NOT toggle
//   4. clicking the open row folds it, and that choice survives a re-render
//   5. "Expand all steps" opens every step; pressing again folds back to one
//   6. a jump / revealStep target opens (obOpenStep) and stays open through a re-render (_obLastActed)
//   7. the render calls it, the jump handler and revealStep open their target
// exit 0 = behaves · 1 = it does not · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }
const a = src.indexOf("const _obStepOpen = new Map();");
const b = src.indexOf("function revealStep(flowId) {");
if (a < 0 || b < 0 || b < a) { console.error("🔴 the step accordion block is gone from admin.js"); process.exit(1); }
const block = src.slice(a, b);
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require("jsdom")); } catch { console.error("⚠️  INDETERMINATE — jsdom is not installed"); process.exit(2); }

const step = (id, cls, body, extraRow = "", note = "") =>
  `<div class="ob-step ${cls}" data-ob-step="${id}"><div class="ob-row"><span class="ob-num">·</span><div class="ob-main"><p class="ob-title">${id}</p></div>${extraRow}</div>${note}${body ? `<div class="ob-body">${body}</div>` : ""}</div>`;
const CARD = `<div id="host"><div class="ob-phase open" data-ob-phase="gbp"><button class="ob-ph-h" data-ob-phase-toggle="gbp"></button><div class="ob-ph-b">
  ${step("s.done", "done", "finished output text")}
  ${step("s.you", "active", "the work you need to do", `<span class="ob-actions-inline"><button class="admin-button" data-x>Run</button></span><span class="ob-status active">Active now</span>`)}
  ${step("s.wait", "active is-wait", "waiting band text", `<span class="ob-status active is-wait">Waiting on client</span>`)}
  ${step("s.q", "queued", "", `<span class="ob-status queued">Up next</span>`, `<div class="ob-lockmsg">Waits on step 33</div>`)}
  ${step("s.live", "active", "the live call console", `<span class="ob-status active is-live">Live now</span>`)}
</div></div></div>`;

const fails = []; const F = (m) => fails.push(m);
const dom = new JSDOM(`<!doctype html><body>${CARD}</body>`, { runScripts: "outside-only" });
const w = dom.window;
w.escapeAttribute = (x) => String(x).replace(/"/g, "&quot;");
try { w.eval(`${block}\nwindow.__acc = { obApplyStepAccordion, obOpenStep, obFoldStep, setActed: (id) => { _obLastActed = id; } };`); }
catch (e) { console.error(`🔴 the accordion code would not run: ${e.message}`); process.exit(1); }
const A = w.__acc, doc = w.document, host = doc.getElementById("host");
const el = (id) => doc.querySelector(`[data-ob-step="${id}"]`);
// Only steps with a BODY can be open or folded — a row-only step (queued) has nothing to hide.
const open = () => [...doc.querySelectorAll(".ob-step")].filter((e) => e.querySelector(".ob-body") && !e.classList.contains("ob-folded")).map((e) => e.dataset.obStep).sort().join(",");
const click = (node) => node.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

A.obApplyStepAccordion(host);
// 1
if (open() !== "s.live,s.you") F(`on render the open steps are [${open()}] — want only the step that needs you (+ the live call; a row-only step has nothing to fold)`);
// 2
const doneBody = el("s.done").querySelector(".ob-body");
if (!el("s.done").classList.contains("ob-folded")) F("a finished step is not folded");
if (doneBody.getAttribute("hidden") !== "until-found") F("a folded body is not hidden=\"until-found\" — ⌘F could not find it");
if (el("s.q").querySelector(".ob-lockmsg").hasAttribute("hidden")) F("a folded step lost its one-line note");
if (!el("s.done").querySelector(".ob-row").querySelector(".ob-chev")) F("a foldable row has no ▸ affordance");
// 3
click(el("s.done").querySelector(".ob-title"));
if (open() !== "s.done,s.live") F(`opening a folded step did not fold the one before: open = [${open()}]`);
click(el("s.you").querySelector("[data-x]"));
if (!el("s.you").classList.contains("ob-folded")) F("a button inside a folded row toggled the step");
// 4
click(el("s.done").querySelector(".ob-title"));
if (open() !== "s.live") F(`clicking the open row did not fold it: open = [${open()}]`);
A.obApplyStepAccordion(host);
if (open() !== "s.live") F(`folding everything did not survive a re-render: open = [${open()}]`);
// 5
const exp = doc.querySelector("[data-ob-expand-all]");
if (!exp) F("the card has no \"Expand all steps\"");
else {
  click(exp);
  if (open() !== "s.done,s.live,s.wait,s.you") F(`Expand all did not open every step: [${open()}]`);
  click(exp);
  if (open().split(",").filter((x) => x && x !== "s.live").length > 1) F("pressing Expand all again did not fold back to one");
}
// 6
A.setActed("s.wait"); A.obApplyStepAccordion(host);
if (el("s.wait").classList.contains("ob-folded")) F("the step you acted on did not stay open through a re-render");
// live never folds
A.obFoldStep(el("s.live"), true);
if (el("s.live").classList.contains("ob-folded")) F("the live kickoff call folded");
// 7 — wiring
const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
// (step 39's photo review is injected first, so its body folds like any other — 2026-10-09)
if (!/\$\{obPhasedHtml\(steps, rowHtmlList, isM1, visible\)\}`;\s*(if \(isM1\) injectPhotoReview\(host\);\s*)?if \(isM1\) obApplyStepAccordion\(host\);/.test(code)) F("the checklist render no longer applies the accordion");
if (!/_obLastActed = flowId;[^\n]*\n\s*obOpenStep\(el\);/.test(code)) F("revealStep no longer opens the step you acted on");
if (!/if \(typeof obOpenStep === "function"\) obOpenStep\(target\);/.test(code)) F("a jump no longer opens its target");

if (fails.length) { console.error("🔴 the admin step accordion does not behave:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ the admin step accordion: one open per card, the live call never folds, jumps and the acted-on step open, ⌘F reaches folded text");
