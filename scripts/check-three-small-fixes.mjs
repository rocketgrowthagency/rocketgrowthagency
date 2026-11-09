#!/usr/bin/env node
// check-three-small-fixes.mjs — approved three_small_fixes_v1 (the owner 11-8: "approved. next").
//  #2 a website step recorded "already right" AFTER its draft was made (never sent) reads "Already right" in admin, the draft kept closed;
//     a draft made after the decision still reads as a draft.  #3 the client reads "Line N"; RGA's reason stays on the item for admin.
//  #1's portal card is drawn in Chrome by check-a-client-installs-rgas-app; here: the end date reaches the portal without the audit trail.
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let SC, A, AD, PGC, P;
try {
  SC = req(path.join(SITE, "shared/site-change.js")); A = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  AD = fs.readFileSync(path.join(SITE, "netlify/functions/admin-deliverables.js"), "utf8"); PGC = fs.readFileSync(path.join(SITE, "netlify/functions/portal-get-contracts.js"), "utf8");
  P = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); return m ? src.slice(m.index, src.indexOf("\n}\n", m.index) + 2) : null; };
try {
  // #2
  const f = lift(A, "wcAlreadyRightWins");
  if (!f) throw new Error("wcAlreadyRightWins moved");
  const ctx = vm.createContext({ globalThis: { rgaSiteChange: SC } });
  vm.runInContext(f, ctx);
  const win = (t) => vm.runInContext(`wcAlreadyRightWins(${JSON.stringify(t)})`, ctx);
  const draft = (v) => ({ v, drafted_at: v, items: [{ label: "x", after: "y" }] });
  const rga45 = { status: "done", site_change: draft("2026-11-08T02:29:03.205Z"), no_change_needed: { at: "2026-11-08T03:12:50.706Z", note: "Every top service already has its page" }, internal_review: { decision: "rejected", at: "2026-11-08T02:26:48Z" } };
  if (SC.changeState(rga45) !== "drafted" || !win(rga45)) fail("RGA's step 45 (already right after its draft) doesn't read 'Already right'");
  if (win({ ...rga45, site_change: draft("2026-11-08T05:00:00.000Z") })) fail("a draft made AFTER 'already right' is hidden");
  if (win({ ...rga45, no_change_needed: null })) fail("a plain draft reads 'Already right'");
  if (win({ ...rga45, internal_review: { decision: "approved", change_v: rga45.site_change.v, at: "x" } })) fail("a SENT change reads 'Already right'");
  if (!/const task = t \|\| \{\}, st = wcAlreadyRightWins\(task\) \? "none" : SC\.changeState\(task\);/.test(A)) fail("the row pill doesn't follow the later decision");
  if (!/const task = t \|\| \{\}, st = wcAlreadyRightWins\(task\) \? "none" : SC\.changeState\(task\), c = task\.site_change/.test(A)) fail("the step card doesn't follow the later decision");
  if (!/<summary>An earlier draft \(not sent\)<\/summary>\$\{wcDiffHtml\(c\)\}/.test(A)) fail("the earlier draft isn't kept, closed, on the card");
  // #3
  if (!/label: `Line \$\{n \+ 1\}`, \.\.\.\(l\.why \? \{ why: String\(l\.why\)\.slice\(0, 80\) \} : \{\}\)/.test(AD)) fail("the client's line name still carries RGA's reason");
  const kept = SC.cleanChange("m1.web.service_location_matrix", { kind: "visible", page_url: "https://a.test/x/", edits_page: true, files: [{ path: "x/index.html", action: "edit" }], items: [{ label: "Line 1", why: "a heading with a trade or acronym in lowercase", before: "cpas in town", after: "CPAs in town" }] });
  const it = ((kept.change || kept).items || [])[0] || {};
  if (it.label !== "Line 1" || it.why !== "a heading with a trade or acronym in lowercase") fail(`saving drops RGA's reason, or the label changes (${JSON.stringify(it)})`);
  if (!/\$\{i\.why \? ` <small class="ob-ac-mut">\(\$\{escapeHtml\(i\.why\)\}\)<\/small>` : ""\}/.test(A)) fail("admin no longer shows RGA's reason by the line");
  // #1: the end date only, never the trail
  if (!/const \{ audit_log, \.\.\.safe \} = c;/.test(PGC) || !/notice_ends_on: \(notice && notice\.ends_on\) \|\| null/.test(PGC)) fail("the portal gets the audit trail, or not the standing notice's end date");
  const pse = lift(P, "portalServiceEnded");
  const c2 = vm.createContext({ _portalContractCache: { a: { client_id: "c1", status: "signed", notice_ends_on: "2020-01-01" }, b: { client_id: "c2", status: "signed", notice_ends_on: "2999-01-01" } } });
  vm.runInContext(pse, c2);
  if (!vm.runInContext(`portalServiceEnded("c1")`, c2) || vm.runInContext(`portalServiceEnded("c2")`, c2) || vm.runInContext(`portalServiceEnded("c3")`, c2)) fail("the portal reads 'service ended' wrong (a past end date, a future one, no notice)");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ three small fixes — ${F.length} regression(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ three small fixes hold: 'already right' after an unsent draft reads 'Already right' (the draft kept closed; a later draft still a draft); the client reads 'Line N' while admin keeps RGA's reason; the portal knows a service ended from its end date alone");
