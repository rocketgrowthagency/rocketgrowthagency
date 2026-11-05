// portal-mode-lift.mjs — the portal's step-number route (approved client_portal_slim_v1, 11-4) as ONE string a gate can lift into its vm
// or page. Since 11-4 every renderer that names a client step number calls `pmNo(step)`, which asks shared/portal-mode.js with the
// portal's mode; a gate that lifts a renderer without these throws "pmNo is not defined" and reads as broken when the product is fine.
//
// It is the REAL code: shared/portal-mode.js as published, and portal.js's own `_portalMode` + `pmNo` lines (const/let → var, so
// vm.runInContext exposes them). `mode` sets the lifted `_portalMode`, so a gate can draw a managed client too.
// 🔴 A MISSING LINE IS "MOVED", NEVER A PASS — it exits 2 (INDETERMINATE). → feedback_a_gate_that_throws_is_not_a_gate_that_fails
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const moved = (what) => { console.error(`⚠️  INDETERMINATE — ${what} moved (scripts/lib/portal-mode-lift.mjs). Re-read it before trusting any gate that lifts it.`); process.exit(2); };

export function pmNoBlock(P, mode = null) {
  let helper;
  try { helper = fs.readFileSync(`${SITE}/shared/portal-mode.js`, "utf8"); } catch { moved("shared/portal-mode.js"); }
  const modeLine = (P.match(/^let _portalMode = null;.*$/m) || [])[0];
  const pmLine = (P.match(/^const pmNo = \(s\) => globalThis\.rgaPortalMode\.stepNo\(s, _portalMode\);$/m) || [])[0];
  if (!modeLine) moved("portal.js `let _portalMode`");
  if (!pmLine) moved("portal.js `const pmNo`");
  // the names a WAIT uses ("Do step 3 first": a row inside managed step 3 is waited on as step 3), added with the managed list (11-4)
  const waitLines = [/^const pmNoW = .*;$/m, /^const pmLabelW = .*;$/m].map((re) => (P.match(re) || [])[0]);
  if (waitLines.some((l) => !l)) moved("portal.js `const pmNoW` / `const pmLabelW`");
  const playbookGuard = 'var _portalPlaybook = typeof _portalPlaybook === "undefined" ? null : _portalPlaybook;';
  // the step's title by mode and "is this a managed client" (client_step05/06/07 mockups, 11-4): the renderers of managed steps 5–7 ask them.
  // Lifted when the file has them; a checkout from before them has no renderer that asks, so their absence there is not a move.
  const modeLines = [/^const pmLabel = .*;$/m, /^const pmManaged = .*;$/m].map((re) => (P.match(re) || [])[0]).filter(Boolean);
  if (/\bpmManaged\(\)/.test(P) && !modeLines.some((l) => /^const pmManaged = /.test(l))) moved("portal.js `const pmManaged`");
  if (/\bpmLabel\(/.test(P) && !modeLines.some((l) => /^const pmLabel = /.test(l))) moved("portal.js `const pmLabel`");
  return [helper, modeLine.replace(/^let _portalMode = null;/, `var _portalMode = ${JSON.stringify(mode)};`), pmLine.replace(/^const /, "var "), playbookGuard, ...waitLines.map((l) => l.replace(/^const /, "var ")), ...modeLines.map((l) => l.replace(/^const /, "var "))].join("\n");
}
