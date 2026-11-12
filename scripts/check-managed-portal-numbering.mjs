#!/usr/bin/env node
// check-managed-portal-numbering.mjs — the managed client portal's numbers are whole, match the approved design, and reach a client
// only through one helper (approved client_portal_slim_v1 + client_portal_slim_visual_v1, Chris 11-4: "that mockup was approved").
// 🔴 WHY: a client step's number is printed in the portal, admin, emails and the Month 1 report. Managed mode gives most steps a new
// number and turns six into one step 3. If one surface kept reading today's `clientStepNo`, a managed client would be told "step 11"
// for a step that is step 4 on their screen. So no surface may read either number itself; all eight now go through
// shared/portal-mode.js, so (11-4, managed_admin_v1) a client CAN be set to managed, and only by the files listed here.
// HOLDS, from files only (costs the clients' database nothing):
//   · every client step has a managed role; a numbered step has a managed number, a check/card/setup step has none
//   · managed numbers, with step 3 "Check what we found", run 1, 2, 3 once each; step 3 covers exactly the "check" steps
//   · the numbers and roles are the approved ones, and client-steps.json was rebuilt after the playbook changed
//   · the helper, RUN: managed → managedStepNo, anything else → clientStepNo; an unknown mode is no mode; none reads "Not chosen"
//   · portal.js reads neither field itself and asks for the mode on its own query, not inside the client load
//   · the 8 surfaces that print a step number all go through the helper; only the admin switch's function and admin's two new-client paths may write portal_mode
//   · the database column has no default, so adding it changes nothing any client sees
// Exit 0 = holds · 1 = broken · 2 = can't tell.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let play, cs, sql, portal;
try { play = JSON.parse(read("data/playbooks/playbooks.json")); cs = JSON.parse(read("data/playbooks/client-steps.json")); sql = read("supabase/client_portal_mode.sql"); portal = read("portal/portal.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.message).slice(0, 140)}`); process.exit(2); }

// the approved design, client_portal_slim_v1 "Before and after" + client_portal_slim_visual_v1 (11-4)
const APPROVED = {
  "m1.kickoff.call": [1, "step"], "m1.access.website": [2, "step"],
  "m1.gbp.verify": [null, "check"], "m1.gbp.business_facts": [null, "check"], "m1.gbp.services_products": [null, "check"],
  "m1.gbp.hours_attributes": [null, "check"], "m1.gbp.attributes": [null, "check"],
  "m1.gbp.booking_link": [null, "card"], "m1.strategy.keywords_locations": [null, "card"], "m1.brand.social_profiles": [null, "card"],
  "m1.tracking.call_setup": [null, "card"], "m1.tracking.form_setup": [null, "card"],
  "m1.gbp.photos": [4, "step"], "m1.review.first_5": [5, "step"], "m1.brand.youtube_setup": [6, "step"], "m1.call.close": [7, "step"],
  "m2.exec.review_push": [8, "step"], "m2.snap.business_outcomes": [9, "step"], "m2.exec.gbp_photos": [10, "step"],
  "m2.exec.youtube_video": [11, "step"], "m2.call.monthly": [12, "step"], "m2.win_story.capture": [null, "step"],
  "m1.access.gbp": [null, "setup"], "m1.access.analytics": [null, "setup"], "m1.access.search_console": [null, "setup"],
};
const steps = [...(cs.month1 || []), ...(cs.month2plus || [])];
if (steps.length < 20) { console.error(`⚠️  INDETERMINATE: only ${steps.length} client steps in client-steps.json`); process.exit(2); }
const check = cs.managed && cs.managed.check;
if (!check) fail("client-steps.json has no managed step 3 (managed.check): rebuild with scripts/build-client-steps.mjs");

for (const s of steps) {
  const ok = ["step", "check", "card", "setup"].includes(s.managedRole);
  if (!ok) { fail(`${s.id} has no managed role`); continue; }
  if (s.managedRole === "step" && !s.clientNumberless && s.managedStepNo == null) fail(`${s.id} is a numbered managed step with no managed number`);
  if (s.managedRole !== "step" && s.managedStepNo != null) fail(`${s.id} is a ${s.managedRole} in managed mode and must have no number, has ${s.managedStepNo}`);
  const want = APPROVED[s.id];
  if (!want) fail(`${s.id} reaches the client but isn't in the approved managed design: decide its role with Chris (mockup first)`);
  else if (want[0] !== (s.managedStepNo ?? null) || want[1] !== s.managedRole) fail(`${s.id} is managed ${s.managedRole} ${s.managedStepNo ?? "(no number)"}, approved ${want[1]} ${want[0] ?? "(no number)"}`);
}
for (const id of Object.keys(APPROVED)) if (!steps.some((s) => s.id === id)) fail(`${id} is in the approved managed design but no longer reaches the client`);
if (check) {
  const nums = [...steps.map((s) => s.managedStepNo), check.managedStepNo].filter((n) => n != null).sort((a, b) => a - b);
  nums.forEach((n, i) => { if (n !== i + 1) fail(`managed numbers must run 1, 2, 3 once each; got ${nums.join(", ")}`); });
  if (check.managedStepNo !== 3) fail(`"Check what we found" is managed step ${check.managedStepNo}, approved 3`);
  const want = (cs.month1 || []).filter((s) => s.managedRole === "check").map((s) => s.id);
  if (JSON.stringify(check.covers || []) !== JSON.stringify(want) || !want.length) fail(`managed step 3 covers ${JSON.stringify(check.covers)}, the "check" steps are ${JSON.stringify(want)}`);
}
// the projection is current: every playbook step's managed fields are the published ones
const src = new Map([...(play.month1 || []), ...(play.month2plus || [])].map((s) => [s.id, s]));
for (const s of steps) { const p = src.get(s.id); if (p && ((p.managedStepNo ?? null) !== (s.managedStepNo ?? null) || p.managedRole !== s.managedRole)) fail(`${s.id}: client-steps.json is older than the playbook; rebuild with scripts/build-client-steps.mjs`); }

// the helper, run
let M;
try { M = createRequire(import.meta.url)(path.join(SITE, "shared/portal-mode.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE: shared/portal-mode.js won't load: ${String(e.message).slice(0, 100)}`); process.exit(2); }
const photos = steps.find((s) => s.id === "m1.gbp.photos");
// setup_vs_month1_v1 (11-10): Month 1 work has no number in a managed portal (the playbook keeps managedStepNo for admin and the gates); Getting started 1 to 3 keep theirs
if (photos && M.stepNo(photos, "managed") !== null) fail(`the helper gives photos managed number ${M.stepNo(photos, "managed")}, Month 1 work has none`);
const kick = steps.find((s) => s.id === "m1.kickoff.call");
if (kick && M.stepNo(kick, "managed") !== kick.managedStepNo) fail(`the helper gives the kickoff managed number ${M.stepNo(kick, "managed")}, the step says ${kick.managedStepNo}`);
for (const mode of [null, undefined, "self_serve", "Managed", "bogus"]) if (photos && M.stepNo(photos, mode) !== photos.clientStepNo) fail(`the helper gives photos number ${M.stepNo(photos, mode)} for mode ${JSON.stringify(mode)}, today's is ${photos.clientStepNo}`);
if (M.modeOf("bogus") !== null || M.modeOf("managed") !== "managed") fail("the helper reads an unknown mode as a mode");
if (M.label(null) !== "Not chosen" || M.label("bogus") !== "Not chosen") fail("the helper names a mode for a client with none");
if (M.stepNo(null, "managed") !== null) fail("the helper invents a number for a missing step");

// portal.js: one route to a number, and the mode on its own query
const code = (t) => t.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (!/import "\/shared\/portal-mode\.js\?v=/.test(portal)) fail("portal.js doesn't load shared/portal-mode.js");
if (/\bclientStepNo\b|\bmanagedStepNo\b/.test(code(portal).replace(/^const portalStepNo[\s\S]*?^};/m, ""))) fail("portal.js reads a step number itself; use pmNo(step)");
const clientsLoad = (portal.match(/async function loadPortalClients[\s\S]*?\n}\n/) || [""])[0];
if (!clientsLoad) fail("can't find loadPortalClients in portal.js");
else if (/portal_mode/.test(clientsLoad)) fail("portal.js asks for portal_mode inside the client load: until the column exists that fails the whole portal");
if (!/function loadPortalModes[\s\S]*?if \(error\) \{ _portalModeState = "not_set_up"; return \{\}; \}/.test(portal)) fail("portal.js doesn't fall back to today's steps when the mode can't be read");

// the 8 surfaces that print a step number are mode-aware (managed_admin_v1, 11-4): each reads the client's mode through the shared helpers.
// A file that reads a step number is one of these (their self-serve branch is the old line, kept) or portal.js; nothing else may.
const SURFACES = ["admin/admin.js", "netlify/functions/_client-waits.js", "netlify/functions/_month1-report.js", "netlify/functions/_onboarding-notes.js",
  "netlify/functions/_open-moves.js", "netlify/functions/notify-step-open.js", "netlify/functions/portal-message.js", "netlify/functions/portal-open-moves.js"];
const HELPERS = ["shared/portal-mode.js", "shared/portal-mode-words.js"];
const walk = (d) => fs.readdirSync(path.join(SITE, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(`${d}/${e.name}`)) : /\.(m?js|html)$/.test(e.name) ? [`${d}/${e.name}`] : []);
let files;
try { files = ["portal", "admin", "shared", "netlify/functions"].flatMap(walk); } catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const readers = files.filter((f) => !HELPERS.includes(f) && /\.(clientStepNo|managedStepNo)\b/.test(code(read(f))));
for (const f of readers) if (f !== "portal/portal.js" && !SURFACES.includes(f)) fail(`${f} reads a client step number itself; ask shared/portal-mode.js stepNo(step, mode)`);
// each surface goes through the helper (its require / import), so a surface can't quietly go back to reading the number alone
for (const f of SURFACES) { const t = code(read(f)); if (!/shared\/portal-mode(-words)?\.js|rgaPortalMode/.test(t) && !(f.endsWith("portal-open-moves.js") && /require\(".\/_portal-mode"\)/.test(t))) fail(`${f} no longer asks the portal-mode helper for a step number`); }
// WHO MAY WRITE portal_mode: the admin switch's function, and admin's two new-client paths (which write only "managed"). Reading it is free.
const WRITE = /\bportal_mode\s*(?::|=(?!=))\s*([^,;)\n}]*)/g;   // a value assigned to portal_mode (a select list or a read has none)
const SETTERS = ["netlify/functions/admin-client-portal-mode.js", "admin/admin.js"];
const setters = files.filter((f) => !["portal/portal.js", ...HELPERS].includes(f) && [...code(read(f)).matchAll(WRITE)].some((m) => m[1].trim()));
for (const f of setters) if (!SETTERS.includes(f)) fail(`${f} can set a client's portal_mode: only ${SETTERS[0]} and admin's new-client paths may`);
{ const t = code(read("admin/admin.js"));
  // master mockup #16 (11-11): the value is the ONE shared default (shared/portal-mode.js DEFAULT_MODE, "managed") through clientDefaultMode()
  for (const m of t.matchAll(WRITE)) { const v = m[1].trim(); if (v && v !== "clientDefaultMode(" && v !== "data.mode") fail(`admin.js writes portal_mode as ${JSON.stringify(v)}; a new client gets the shared default (managed) and the switch saves what the server read back`); }
  if (!/const clientDefaultMode = \(\) => \(globalThis\.rgaPortalMode && globalThis\.rgaPortalMode\.DEFAULT_MODE\) \|\| "managed";/.test(t)) fail("admin.js no longer takes a new client's mode from the shared default (shared/portal-mode.js DEFAULT_MODE)");
  if (!/insert\(\{ portal_mode: clientDefaultMode\(\), \.\.\.payload \}\)/.test(t)) fail("admin.js createClient must give a new client the shared default mode (and let a named mode win)");
  if (!/portal_mode: clientDefaultMode\(\),\s*\/\/ managed_admin_v1/.test(t)) fail("admin.js promoteLeadToClient must give a promoted lead the shared default mode"); }

// the column changes nothing on its own
if (!/add column if not exists portal_mode text;/.test(sql) || /portal_mode text[^;]*default/i.test(sql)) fail("supabase/client_portal_mode.sql must add portal_mode with no default");
if (!/check \(portal_mode is null or portal_mode in \('managed', 'self_serve'\)\)/.test(sql)) fail("supabase/client_portal_mode.sql must allow only managed, self_serve or null");

if (F.length) { console.error(`🔴 managed portal numbering: ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log(`✅ managed portal numbering holds: ${steps.length} client steps, managed 1–${check.managedStepNo && Math.max(...steps.map((s) => s.managedStepNo || 0), 3)}, step 3 covers ${check.covers.length}; all ${SURFACES.length} surfaces are mode-aware; only ${SETTERS.length} files may set a mode`);
