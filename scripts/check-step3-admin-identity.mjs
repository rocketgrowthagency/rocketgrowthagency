#!/usr/bin/env node
// check-step3-admin-identity.mjs — 2026-10-26, RGA Admin setup log step 4 (approved rga_admin_identity_and_contract_v1, 10-23;
// Chris 10-23: "create one for RGA Admin which is the one we use to link to client's sites… not mix this with other users").
// The accounts exist since 10-26 (access@rocketgrowthagency.com · GitHub rocketgrowthagency-admin, 2FA on). This gate holds the
// identity in ONE shape across the three places that name it, and keeps RGA's own business login off every client-facing invite:
//   · data/site-platforms.json "email" + "github" ARE the identity; portal RGA_ADMIN_EMAIL / RGA_ADMIN_GITHUB and admin
//     RGA_ACCESS_ACCOUNT must equal them (a second writer is a second shape)
//   · the identity is not RGA's own: never hello@, never the bare `rocketgrowthagency` GitHub account
//   · no builder's steps, notes or RGA's move name hello@ or the bare rocketgrowthagency user
//   · the portal's step 3 code (ACC_FILES, accDevNote, the designer emails, the "Invite this email" chip, the done line)
//     carries no literal hello@ / "rocketgrowthagency" — it reads the constants
//   · the GitHub row the client follows and the developer note actually RENDER the GitHub name + the email (run, not grepped)
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), ADM = read("admin/admin.js");
let DATA; try { DATA = JSON.parse(read("data/site-platforms.json")); } catch (e) { console.error(`⚠️  site-platforms.json won't parse: ${e.message}`); process.exit(2); }
const EMAIL = DATA.email, GH = DATA.github;
const OWN_EMAIL = /hello@rocketgrowthagency\.com/i, OWN_GH = /(^|[^\w.@-])rocketgrowthagency(?![\w.-])/;   // the bare user, not -admin / .com

// ── the identity itself
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL || "")) fail(`site-platforms.json "email" isn't an email (${EMAIL})`);
if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i.test(GH || "")) fail(`site-platforms.json "github" isn't a GitHub username (${GH})`);
if (OWN_EMAIL.test(EMAIL || "")) fail(`the client-work email is RGA's own hello@ (${EMAIL}) — clients must invite RGA Admin, never the business`);
if (/^rocketgrowthagency$/i.test(GH || "")) fail(`the client-work GitHub is RGA's own account (${GH}) — it owns rga-website + the scraper`);

// ── one shape: portal + admin constants = the data
const pE = (P.match(/^const RGA_ADMIN_EMAIL = "([^"]+)";/m) || [])[1], pG = (P.match(/^const RGA_ADMIN_GITHUB = "([^"]+)";/m) || [])[1];
const aE = (ADM.match(/^const RGA_ACCESS_ACCOUNT = "([^"]+)";/m) || [])[1];
if (!pE || !pG || !aE) { console.error("⚠️  INDETERMINATE — RGA_ADMIN_EMAIL / RGA_ADMIN_GITHUB (portal) or RGA_ACCESS_ACCOUNT (admin) moved"); process.exit(2); }
if (pE !== EMAIL) fail(`portal RGA_ADMIN_EMAIL (${pE}) ≠ site-platforms.json email (${EMAIL})`);
if (pG !== GH) fail(`portal RGA_ADMIN_GITHUB (${pG}) ≠ site-platforms.json github (${GH})`);
if (aE !== EMAIL) fail(`admin RGA_ACCESS_ACCOUNT (${aE}) ≠ site-platforms.json email (${EMAIL}) — Confirm access would record a different account than the client invited`);

// ── the data: no builder names RGA's own login anywhere (steps, notes, RGA's move)
for (const [k, p] of Object.entries(DATA.platforms || {})) {
  const s = JSON.stringify(p);
  if (OWN_EMAIL.test(s)) fail(`${k}: names hello@ — clients would invite the business, not RGA Admin`);
  if (OWN_GH.test(s.replace(/rocketgrowthagency\.com/gi, ""))) fail(`${k}: names the bare rocketgrowthagency user`);
}
if (!JSON.stringify(DATA.platforms?.custom || {}).includes(GH || "\0")) fail("the developer-built (custom) steps don't give the GitHub name to add");

// ── the portal's step 3 code reads the constants, no literals
const a = P.indexOf("const RGA_ADMIN_EMAIL = "), bAnchor = P.indexOf("function accOpenDesigner(");
const b = bAnchor < 0 ? -1 : P.indexOf("\n}\n", bAnchor);
if (a < 0 || b < 0) { console.error("⚠️  INDETERMINATE — the step 3 code moved"); process.exit(2); }
const REG = P.slice(a, b).replace(/^\s*\/\/.*$/gm, "");
if (OWN_EMAIL.test(REG)) fail("portal step 3 code still has a literal hello@ (an invite, a note or the done line)");
if (/["'`]rocketgrowthagency["'`]|add rocketgrowthagency\b/.test(REG)) fail("portal step 3 code still has the bare rocketgrowthagency GitHub user");

// ── RUN: the GitHub steps the client follows + the developer note
const ctx = vm.createContext({});
const grab = (re, what) => { const m = P.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${what} moved`); process.exit(2); } return m[0]; };
const filesSrc = grab(/^const ACC_FILES = \{[\s\S]*?\n\};$/m, "ACC_FILES");
const noteA = P.indexOf("function accDevNote("), noteB = P.indexOf("\n}\n", noteA);
if (noteA < 0 || noteB < 0) { console.error("⚠️  INDETERMINATE — accDevNote moved"); process.exit(2); }
vm.runInContext(`var RGA_ADMIN_EMAIL = ${JSON.stringify(pE)}, RGA_ADMIN_GITHUB = ${JSON.stringify(pG)};\n${filesSrc.replace(/^const /, "var ")}\n${P.slice(noteA, noteB + 2)}`, ctx);
const files = vm.runInContext("ACC_FILES", ctx), note = vm.runInContext("accDevNote(null)", ctx);
const ghLast = JSON.stringify(files.github?.steps?.at(-1) || []);
if (!ghLast.includes(GH)) fail(`the client's GitHub steps don't end on "add ${GH}" (got ${ghLast})`);
for (const k of ["gitlab", "bitbucket"]) if (!JSON.stringify(files[k]?.steps || []).includes(EMAIL)) fail(`the client's ${k} steps don't give ${EMAIL}`);
const noteS = JSON.stringify(note);
if (!noteS.includes(GH) || !noteS.includes(EMAIL)) fail("the developer note doesn't name the GitHub user AND the email");
if (OWN_EMAIL.test(noteS) || OWN_GH.test(noteS.replace(/rocketgrowthagency\.com/gi, ""))) fail("the developer note names RGA's own login");

if (F.length) { console.error(`❌ step 3 RGA Admin identity — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log(`✅ step 3 RGA Admin identity holds: ${EMAIL} · GitHub ${GH} · data = portal = admin · ${Object.keys(DATA.platforms || {}).length} builders free of hello@ · GitHub/GitLab/Bitbucket steps + the developer note render it`);
