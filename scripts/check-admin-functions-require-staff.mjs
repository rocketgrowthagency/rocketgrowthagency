#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-admin-functions-require-staff.mjs
//
// 🔒 WHY (Chris 11-12: "do audits for gaps… add a checker for all new items"): the 11-12 audit found admin-doc.js (RGA's
// playbook PDFs) guarded by plain `requireUser`, so ANY signed-in person, including a client signed in to their portal, could
// read RGA's internal documents. Every other admin function used a staff guard. This holds the class, not the instance:
//   every netlify/functions/admin-*.js calls a STAFF guard (requireWorkspaceUser / requireWorkspaceForClient /
//   requireWorkspaceForClientOrInternal / requirePortalOwnerOrWorkspace) or a machine guard (requireInternalSecret /
//   requireCronOrInternal), and none relies on `requireUser` alone. The only exception is listed with its reason.
// exit 0 = every admin function needs staff · 1 = one lets any signed-in person in · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const DIR = path.join(SITE, "netlify/functions");
let files;
try { files = fs.readdirSync(DIR).filter((f) => /^admin-.*\.js$/.test(f)); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${DIR}`); process.exit(2); }
if (files.length < 20) { console.error(`⚠️  INDETERMINATE — only ${files.length} admin functions found; the folder moved?`); process.exit(2); }

// public on purpose, each with its reason
const PUBLIC = {
  "admin-config.js": "serves the Supabase address, the public anon key and the sign-in flags the login page needs BEFORE anyone signs in",
};
const STAFF = /\b(requireWorkspaceUser|requireWorkspaceForClient|requireWorkspaceForClientOrInternal|requirePortalOwnerOrWorkspace|requireInternalSecret|requireCronOrInternal)\s*\(/;
const F = [];
for (const f of files) {
  if (PUBLIC[f]) continue;
  const src = fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  // a guard counts when it is CALLED, or passed in as the handler's guard (admin-mid-note: `guard = requireWorkspaceForClient`);
  // the import line alone does not count
  const used = STAFF.test(src) || /=\s*(requireWorkspaceUser|requireWorkspaceForClient|requireWorkspaceForClientOrInternal|requirePortalOwnerOrWorkspace)\b(?!\s*\}?\s*=\s*require)/.test(src.replace(/^.*=\s*require\(.*$/gm, ""));
  // a weaker guard renamed to look like a staff guard (`{ requireUser: requireWorkspaceUser }`) defeats the name check above
  if (/\brequire(User|PortalOwner|InternalSecret)\s*:\s*require(Workspace|PortalOwnerOrWorkspace)/.test(src)) F.push(`${f} renames a weaker guard to a staff guard's name`);
  if (!used) F.push(`${f} calls no staff guard${/\brequireUser\s*\(/.test(src) ? " (plain requireUser: any signed-in person, a portal client too, gets in)" : ""}`);
}
// the 11-12 instance, named so a revert is caught by name too
{
  const doc = fs.readFileSync(path.join(DIR, "admin-doc.js"), "utf8");
  if (!/const auth = await requireWorkspaceUser\(event\);/.test(doc)) F.push("admin-doc.js must check RGA staff (requireWorkspaceUser) before serving a playbook");
}
for (const f of Object.keys(PUBLIC)) if (!files.includes(f)) F.push(`the public exception ${f} no longer exists; remove it from PUBLIC`);

if (F.length) {
  console.log(`❌ AN ADMIN FUNCTION LETS ANY SIGNED-IN PERSON IN (${F.length}):`);
  for (const x of F) console.log("   • " + x);
  process.exit(1);
}
console.log(`✅ all ${files.length - Object.keys(PUBLIC).length} admin functions need RGA staff (plus ${Object.keys(PUBLIC).length} public on purpose, with its reason)`);
process.exit(0);
