#!/usr/bin/env node
/**
 * check-every-action-reports-a-result.mjs — pressing a button must visibly do something.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-06, Chris: *"clicking run does nothing?"* — the step HAD fired. `setBanner()` reported the
 * result into a static div at the top of the page, and the 58-step checklist put the button ~1500px
 * below it. Nothing he could see changed.
 *
 * 🔑 **A button with no visible result is indistinguishable from a dead button.** The user cannot
 * tell "it worked silently" from "it is broken" — so they press it again, or give up and do the work
 * by hand.
 *
 * We already had HALF a standard, locked 2026-08-18 ([[feedback-admin-confirm-and-view-state]]):
 * every consequential action must ASK FIRST via rgaConfirm(). Nobody had ever audited the other
 * half — that every action REPORTS ITS RESULT afterwards. This gate is that half.
 *
 * CHECK
 *   For every delegated `[data-*]` click action in the admin AND the client portal: the handler, or
 *   a function it calls, must reach a visible result — the banner, a status element, or an in-place
 *   state change on the control that was clicked. Pure-navigation actions are EXCUSED BY NAME.
 *
 * Exit 0 = every action reports. 1 = an action can complete silently. 2 = could not analyse.
 */
import fs from "node:fs";

const TARGETS = [
  { label: "admin", path: "/Users/chris/RGA/Rocket Growth Agency Website VS Code/admin/admin.js" },
  { label: "portal", path: "/Users/chris/RGA/Rocket Growth Agency Website VS Code/portal/portal.js" },
];

// Actions whose visible result IS the UI change they cause. Excused BY NAME with a reason — an
// exemption must be argued, never assumed (same discipline as the pre-flight gate list).
const UI_ONLY = {
  "data-tab": "switches the client tab — the tab visibly changes",
  "data-v2tab": "switches a sub-tab — the pane visibly changes",
  "data-goto-tab": "navigates to another tab — the destination is the feedback",
  "data-accordion-toggle": "expands/collapses a section — the section visibly moves",
  "data-field-help": "opens inline help — the text appearing is the feedback",
  "data-note-id": "selects a note for editing — the editor visibly loads it",
  "data-custom-field": "focuses a custom field — no mutation",
  "data-doc": "opens a document — the document opening is the feedback",
  "data-updoc": "opens an uploaded document — same",
  "data-repeater-add": "adds an empty repeater row — the row visibly appears",
  "data-repeater-remove": "removes a repeater row — the row visibly disappears",
  "data-v2-edit": "opens a draft editor — the editor visibly opens",
  "data-flow-toggle": "expands a step's detail panel — the panel visibly opens",
  "data-portal-tab": "switches a portal tab — the pane visibly changes",
  "data-step-toggle": "expands a step — the step visibly expands",
};

// The legitimate ways an action can report. The global banner is the main one, but a dedicated
// status element or an in-place control state ("Saved", "Approved ✓", "Pushing…") is equally
// visible — and better, because it sits where the user clicked. Recognise all of them, or the gate
// cries wolf on code that is already doing the right thing.
const FEEDBACK = new RegExp([
  "\\bsetBanner\\(",
  "\\brgaAlert\\(",
  "\\balert\\(",
  "audit-confirm",
  "status(?:El|Element|Node|Msg)\\s*\\.\\s*(?:textContent|innerHTML)",
  "\\.textContent\\s*=\\s*[^;]{0,80};[\\s\\S]{0,150}?\\.disabled\\s*=",
  "\\.textContent\\s*=\\s*[\"'`][^\"'`]*[\\u2713\\u2717\\u2026]",
  // The client portal has its own vocabulary — a modal, and in-place innerHTML state ("Saving…",
  // "Disconnecting…"). A gate that only knows the admin's primitives would report the portal as
  // broken while it was doing exactly the right thing.
  "\\bportal(?:Alert|Confirm|Modal|Toast)\\(",
  // 🔑 NOT [^;] — the spinner markup carries inline CSS, which is full of semicolons, so a
  // semicolon-bounded pattern died on the first style rule and reported a reporting action as silent.
  "\\.innerHTML\\s*=\\s*[\\s\\S]{0,400}?(?:\\u2026|Saving|Sending|Loading|Disconnect|Working)",
].join("|"));

function analyse({ label, path }) {
  if (!fs.existsSync(path)) return { label, error: `missing ${path}` };
  const src = fs.readFileSync(path, "utf8");

  const blockFrom = (openIdx) => {
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (!depth) return src.slice(openIdx, i + 1); }
    }
    return src.slice(openIdx);
  };

  const bodyOf = (name) => {
    const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`);
    const m = src.match(re);
    if (!m) return "";
    const open = src.indexOf("{", m.index);
    return open < 0 ? "" : blockFrom(open);
  };

  // 🔴 BRACE-MATCH the branch that handles each action. Two earlier versions chunked N lines and
  // broke on a heuristic; handlers routinely bind several lookups adjacently and THEN branch:
  //     const promoteBtn = event.target.closest("[data-lead-promote]");
  //     const statusSelect = event.target.closest("[data-lead-status]");
  //     if (promoteBtn) { …setBanner… }
  // Any line-window rule truncated that and reported a reporting action as silent. A probe that
  // mis-parses is indistinguishable from a codebase full of defects, and it wastes the whole audit.
  const actions = [];
  // 🔑 Permissive on the RIGHT-HAND SIDE. Handlers bind in several styles and a strict pattern
  // silently drops the ones it does not know:
  //     const run = ev.target.closest && ev.target.closest("[data-onboard-run]");
  //     const b   = e.target.closest("[data-portal-goto]");
  // The coverage assertion below caught exactly this — it flagged 6 real actions the tightened
  // regex had stopped binding, which would otherwise have passed as a clean audit.
  // 🔑 AN ACTION DISPATCH READS FROM THE EVENT TARGET. A container lookup reads from another
  // element — `btn.closest("[data-svc-row]")` finds the row to animate, it is not a button anyone
  // clicks. Treating every closest() as an action reported `data-svc-row` as a silent action when
  // there is no such control at all. Requiring `.target.` is the discriminator.
  const bindRe = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]{0,120}?\btarget\b[^;\n]{0,60}?closest\("\[(data-[a-z0-9-]+)\]"\)/g;
  let m;
  while ((m = bindRe.exec(src)) !== null) {
    const varName = m[1];
    const action = m[2];
    const line = src.slice(0, m.index).split("\n").length;
    const after = src.slice(m.index);
    const guard = new RegExp(`if\\s*\\(\\s*!\\s*${varName}[\\s\\S]{0,40}?\\)\\s*(?:\\{[^}]{0,60}\\}|return[^;]*;)`);
    const branch = new RegExp(`if\\s*\\(\\s*${varName}\\b[^)]{0,100}\\)\\s*\\{`);
    const gm = after.match(guard);
    const bm = after.match(branch);
    let body;
    if (bm && (!gm || bm.index < gm.index)) body = blockFrom(m.index + bm.index + bm[0].length - 1);
    else if (gm) body = after.slice(gm.index, gm.index + 6000);
    else body = after.slice(0, 3000);
    actions.push({ name: action, line, body });
  }

  // 🔴 NO SILENT COVERAGE LOSS. If an action plainly exists but the binder could not bind it, say so
  // — otherwise it drops out of the audit and this gate reports a clean sweep it never performed.
  // Only attributes dispatched FROM AN EVENT TARGET are actions; the rest are container selectors.
  const declared = new Set([...src.matchAll(/\btarget\b[^;\n]{0,60}?closest\("\[(data-[a-z0-9-]+)\]"\)/g)].map((x) => x[1]));
  const captured = new Set(actions.map((a) => a.name));
  const dropped = [...declared].filter((d) => !captured.has(d) && !UI_ONLY[d]);

  const SKIP = new Set(["if", "for", "while", "switch", "catch", "closest", "getAttribute",
    "preventDefault", "String", "Number", "querySelector", "parseInt", "Boolean"]);
  const silent = [];
  const seen = new Set();
  for (const a of actions) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    if (UI_ONLY[a.name]) continue;
    let ok = FEEDBACK.test(a.body);
    if (!ok) {
      const callees = [...a.body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map((x) => x[1]);
      for (const c of new Set(callees)) {
        if (SKIP.has(c)) continue;
        const b = bodyOf(c);
        if (b && FEEDBACK.test(b)) { ok = true; break; }
        if (b) {
          const inner = [...b.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map((x) => x[1]);
          if ([...new Set(inner)].some((c2) => !SKIP.has(c2) && FEEDBACK.test(bodyOf(c2)))) { ok = true; break; }
        }
      }
    }
    if (!ok) silent.push(a);
  }

  const excused = [...seen].filter((k) => UI_ONLY[k]).length;
  return { label, silent, dropped, total: seen.size, excused, audited: seen.size - excused };
}

console.log("── every action must report a result ──");

let fail = 0;
let indeterminate = 0;
for (const t of TARGETS) {
  const r = analyse(t);
  if (r.error) { console.log(`  ▫️  ${t.label}: ${r.error} — cannot audit`); indeterminate++; continue; }
  if (r.dropped.length) {
    console.error(`  🔴 ${r.label}: ${r.dropped.length} action(s) exist but could not be bound: ${r.dropped.join(", ")}`);
    console.error("     Fix the binder before trusting this gate — an unaudited action is not a passing one.");
    indeterminate++;
    continue;
  }
  for (const a of r.silent) {
    fail++;
    console.log(`  🔴 ${r.label}/${a.name.padEnd(26)} :${a.line} — no visible result on success or failure`);
  }
  console.log(`  ${r.silent.length ? "🔴" : "✅"} ${r.label.padEnd(7)} ${r.audited} mutating action(s) audited · ${r.excused} excused as UI-only`);
}

console.log("");
if (fail) {
  console.error(`🔴 ${fail} action(s) can complete with nothing visible happening.`);
  console.error("   A button with no visible result is indistinguishable from a dead button.");
  console.error("   See feedback_every_action_must_report_its_result.");
  process.exit(1);
}
if (indeterminate) { console.error("⚠️  could not fully audit — see above"); process.exit(2); }
console.log("✅ every mutating action in the admin and the client portal reports a visible result");
