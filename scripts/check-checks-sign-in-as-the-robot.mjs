#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-checks-sign-in-as-the-robot.mjs
//
// 🔒 WHY (11-13): admin two-step goes ON. A check that signs in to the admin with a magic link for the OWNER (hello@) gets an aal1 session
// the admin and the database refuse once Chris has an authenticator. 47 scripts did exactly that; all were moved to scripts/lib/
// admin-sign-in.mjs (signInAdmin / robotSession: the checks' robot staff account, aal2 through Supabase's API). This holds the class:
// no script under scripts/ mints a magic link for the owner address, except the few that must, each with its reason. Client/portal
// sign-ins (a client's or test client's email) are not staff and are untouched by this rule.
// exit 0 = every staff sign-in goes through the robot helper · 1 = a script signs in as the owner again · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COPY = process.env.SCRAPER_COPY_DIR || null;   // the mutation runner's copy holds only its target files: read those from the copy, the rest from the repo
const ROOT = REAL;
const readRel = (rel) => fs.readFileSync(COPY && fs.existsSync(path.join(COPY, rel)) ? path.join(COPY, rel) : path.join(REAL, rel), "utf8");
const ALLOWED = {
  "scripts/lib/admin-sign-in.mjs": "the helper itself: its documented fallback before the robot exists",
  "scripts/create-robot-staff.mjs": "creates the robot; reads the owner's workspace, never signs in as the owner",
  "scripts/check-integrations-are-watched-from-the-cloud.mjs": "probes that generate_link answers; not a staff sign-in",
  "scripts/check-checks-sign-in-as-the-robot.mjs": "this gate",
};
const dirs = ["scripts", "scripts/acceptance", "scripts/lib"];
const files = [];
for (const d of dirs) { let es = []; try { es = fs.readdirSync(path.join(ROOT, d)); } catch { continue; } for (const f of es) if (/\.m?js$/.test(f)) files.push(`${d}/${f}`); }
if (files.length < 100) { console.error(`⚠️  INDETERMINATE — only ${files.length} scripts found under ${ROOT}/scripts`); process.exit(2); }

const F = [];
for (const rel of files) {
  if (ALLOWED[rel]) continue;
  const src = readRel(rel).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  if (!/generate_link/.test(src)) continue;
  // a magic link minted for the owner: the owner address, or an ADMIN_EMAIL / RGA_ADMIN_EMAIL constant, inside a generate_link body
  for (const m of src.matchAll(/generate_link[\s\S]{0,400}?email:\s*([^,}\n]+)/g)) {
    const who = m[1].trim();
    if (/hello@rocketgrowthagency\.com|ADMIN_EMAIL|RGA_ADMIN_EMAIL/.test(who)) F.push(`${rel} mints a magic link for the OWNER (${who.slice(0, 60)}): sign in with signInAdmin / robotSession (scripts/lib/admin-sign-in.mjs)`);
  }
}
for (const rel of Object.keys(ALLOWED)) if (!files.includes(rel)) F.push(`the allowed file ${rel} no longer exists; take it off ALLOWED`);
// the helper must still finish two-step (aal2) and put the session where the admin's client reads it
const helper = readRel("scripts/lib/admin-sign-in.mjs");
if (!/factors\/\$\{f\.id\}\/verify/.test(helper) || !/code: totp\(process\.env\.RGA_ROBOT_TOTP_SECRET\)/.test(helper)) F.push("admin-sign-in.mjs no longer finishes two-step with the robot's code (the checks would be aal1)");
if (!/sb-\$\{new URL\(url\)\.hostname\.split\("\."\)\[0\]\}-auth-token/.test(helper)) F.push("admin-sign-in.mjs no longer stores the session under the admin client's key (sb-<project>-auth-token)");

if (F.length) { console.log(`❌ A CHECK SIGNS IN AS THE OWNER (${F.length}):`); for (const x of F) console.log("   • " + x); process.exit(1); }
console.log(`✅ every staff sign-in in ${files.length} scripts goes through the robot helper (aal2); ${Object.keys(ALLOWED).length} allowed with a reason`);
process.exit(0);
