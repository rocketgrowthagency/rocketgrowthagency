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
w.requestAnimationFrame = (f) => { f(); return 1; };   // jsdom has none; obHoldInPlace uses it to keep the page still after a fold
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
// 🔄 2026-10-13: card injections between the render and the accordion are allowed (injectListingCard landed 10-12 and
// this pin went red for the spelling, not the behaviour). The PROPERTY: the accordion is applied right after them.
if (!/\$\{obPhasedHtml\(steps, rowHtmlList, isM1, visible\)\}`;\s*(?:(?:if \(isM1\) )?inject\w+\(host[^)]*\);\s*)*if \(isM1\) obApplyStepAccordion\(host\);/.test(code)) F("the checklist render no longer applies the accordion");
if (!/_obLastActed = flowId;[^\n]*\n\s*obOpenStep\(el\);/.test(code)) F("revealStep no longer opens the step you acted on");
if (!/if \(typeof obOpenStep === "function"\) obOpenStep\(target\);/.test(code)) F("a jump no longer opens its target");
// 8 · 11-6 (the owner: "make sure it works for ALL steps"): revealStep, RUN for every Month-1 step of the playbook, each in a FOLDED phase,
// opens that step (its phase unfolded, the step open, scrolled to); and every jump that names a step carries it
{
  const pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  const ids = (pb.month1 || []).map((s) => s.id).filter(Boolean);
  const rv = src.slice(b, src.indexOf("\n}\n", b) + 3);
  const d2 = new JSDOM(`<!doctype html><body><div id="h2">${ids.map((id, i) => `<div class="ob-phase" data-ob-phase="p${i}"><button class="ob-ph-h" data-ob-phase-toggle="p${i}"></button><div class="ob-ph-b">${step(id, "done", "its output")}</div></div>`).join("")}</div></body>`, { runScripts: "outside-only" });
  const w2 = d2.window;
  w2.escapeAttribute = (x) => String(x).replace(/"/g, "&quot;");
  w2.requestAnimationFrame = (f) => { f(); return 1; };
  let scrolled = null;
  w2.HTMLElement.prototype.scrollIntoView = function () { scrolled = this.getAttribute("data-ob-step"); };
  w2.document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-ob-phase-toggle]"); if (t) t.closest(".ob-phase").classList.toggle("open"); });
  try { w2.eval(`${block}\n${rv}\nwindow.__rv = { revealStep, obApplyStepAccordion };`); } catch (e) { F(`revealStep would not run: ${e.message}`); }
  if (w2.__rv) {
    w2.__rv.obApplyStepAccordion(w2.document.getElementById("h2"));
    const missed = [];
    for (const id of ids) {
      scrolled = null; w2.__rv.revealStep(id);
      const node = w2.document.querySelector(`.ob-step[data-ob-step="${id}"]`);
      if (!node || node.classList.contains("ob-folded") || !node.closest(".ob-phase").classList.contains("open") || scrolled !== id) missed.push(id);
    }
    if (!ids.length) F("the playbook has no Month-1 steps to try (this check read nothing)");
    else if (missed.length) F(`a jump to ${missed.length} of ${ids.length} steps doesn't open it: ${missed.slice(0, 5).join(", ")}`);
  }
}
if (!/const step = b\.getAttribute\("data-goto-step"\) \|\| "";\s*if \(step && tab === "onboarding-v2"\) \{[\s\S]{0,260}?revealStep\(step\)/.test(src)) F("a [data-goto-step] jump doesn't open its step (the shared jump handler only switches the tab)");
if (!/\$\{a\.step \? ` data-goto-step="\$\{escapeAttribute\(a\.step\)\}"` : ""\}/.test(src)) F("Needs your attention's buttons don't carry their step");
for (const [re, what] of [[/step: blocked\[0\]\.id/, "the blocked-step alert"], [/step: unverified\[0\]\.id/, "the no-proof alert"], [/step: next\.id, btn: "Go to onboarding"/, "the Next: alert"], [/kickAlert\.tab === "onboarding-v2" \? \{ step: "m1\.kickoff\.call" \}/, "the kickoff alert"], [/btn: "Go to onboarding →", \.\.\.\(remaining\[0\]\?\.obj\?\.flowId \? \{ reveal: remaining\[0\]\.obj\.flowId \}/, "the next-action card's Onboarding is blocked"]])
  if (!re.test(src)) F(`${what} doesn't open the step it names`);
// the next-action card's "Go to step N" opened the tab at its top, never step N; it carries the step to reveal
if (!/btn: pageN \? `Go to step \$\{pageN\} →` : "Go to onboarding →", \.\.\.\(pageN && active\.obj\?\.flowId \? \{ reveal: active\.obj\.flowId \} : \{\}\)/.test(src)) F("\"Go to step N\" on the next-action card doesn't open step N (it only switches the tab)");

// 🔒 steps_open_in_place_v2, the client portal's rule (Chris 10-31): the clicked title stays where it is, on a step and on a card. Measured on the live record in a browser when built.
const AJS_HOLD = fs.readFileSync(`${process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code"}/admin/admin.js`, "utf8");
if (!/function obHoldInPlace\(anchor, change, opened\) \{[\s\S]{0,400}overflowAnchor = "none"[\s\S]{0,120}change\(\);[\s\S]{0,160}window\.scrollBy\(\{ top: drift, behavior: "instant" \}\)/.test(AJS_HOLD)) fails.push("a step's title no longer stays put when another closes");
if (!/obHoldInPlace\(row, \(\) => \{/.test(AJS_HOLD)) fails.push("a step row opens without holding its place");
if (!/obHoldInPlace\(b, \(\) => \{ body\.hidden = !nowOpen;/.test(AJS_HOLD)) fails.push("a card opens without holding its place");
// 🔒 Chris 10-31, step 34: what the client answered is the step's body, below its top bar, or it can't fold
// 🔄 11-8: the title grew a publish-blocked tag after the badge and this exact-title pattern went blind; any answer on the title's line fails
if (/<p class="ob-title">\$\{escapeHtml\(o\.t\)\}[^\n]*\$\{clientInputHtml\(o, s\.task\)\}/.test(AJS_HOLD)) fails.push("a done step puts the client's answer inside its top bar: it can't fold, and its number floats mid-card");
if (!/const said = `\$\{attestation\}\$\{clientInputHtml\(o, s\.task\)\}/.test(AJS_HOLD)) fails.push("a done step's answer isn't its own body");
if (fails.length) { console.error("🔴 the admin step accordion does not behave:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ the admin step accordion: one open per card, the live call never folds, jumps and the acted-on step open, ⌘F reaches folded text");
