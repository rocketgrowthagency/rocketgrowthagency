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
  return [helper, modeLine.replace(/^let _portalMode = null;/, `var _portalMode = ${JSON.stringify(mode)};`), pmLine.replace(/^const /, "var ")].join("\n");
}
