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

// ── "step 3 waits on RGA" is ONE rule in three places (10-26 live test: the client row said "Your turn", admin said "Waiting on
//    client" + Nudge, the To do called it the client's move — while every card said RGA's move). RUN all three on the same cases.
{
  const lift = (src, name, what) => { const at = src.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${what} ${name} moved`); process.exit(2); } const end = src.indexOf("\n}\n", at); return src.slice(at, end + 2); };
  const c = vm.createContext({});
  vm.runInContext(`${lift(P, "accWaitsOnRga", "portal")}\n${lift(ADM, "admStepThreeWaitsOnRga", "admin")}`, c);
  const OM = read("netlify/functions/_open-moves.js");
  vm.runInContext(lift(OM, "stepThreeWaitsOnRga", "_open-moves.js"), c);
  const CASES = [
    [{ status: "in_progress", client_input: { via: "invite", platform: "custom", files: "github" } }, true, "invite sent"],
    [{ status: "in_progress", client_input: { via: "designer" } }, true, "designer asked"],
    [{ status: "in_progress", client_input: { via: "request" } }, true, "request to send"],
    [{ status: "in_progress", client_input: { via: "workaround" } }, true, "checklist"],
    [{ status: "in_progress", check_request: { asked_at: "x" } }, true, "check it for me"],
    [{ status: "in_progress", check_request: { asked_at: "x" }, rga_check: { platform: "wix" } }, false, "RGA checked, the client answers"],
    [{ status: "in_progress", client_input: { via: "invite" }, access: { confirmed_at: "x" } }, false, "access confirmed"],
    [{ status: "done", client_input: { via: "invite" } }, false, "done"],
    [{ status: "pending", client_input: { via: "none" } }, false, "no website"],
    [{ status: "pending" }, false, "nothing saved"],
  ];
  for (const [t, want, label] of CASES) {
    const got = ["accWaitsOnRga", "admStepThreeWaitsOnRga", "stepThreeWaitsOnRga"].map((n) => vm.runInContext(`${n}(${JSON.stringify(t)})`, c));
    if (got.some((g) => g !== want)) fail(`"${label}": portal / admin / To do say ${got.join(" / ")} (want ${want}) — the three surfaces disagree whose move step 3 is`);
  }
  if (!/withRga: open \? photosAllSent\(s, ts, photos\) \|\| \(s\.id === "m1\.access\.website" && accWaitsOnRga\(ts\)\)/.test(P)) fail("the client row's pill no longer asks accWaitsOnRga (it would say \"Your turn\" over a With RGA card)");
  if (!/if \(flowId === "m1\.access\.website"\) return admStepThreeWaitsOnRga\(task\) \? "rga" : null;/.test(ADM)) fail("admin row 8's pill no longer asks admStepThreeWaitsOnRga");
  if (!/&& !\(o\.flowId === "m1\.access\.website" && admStepThreeWaitsOnRga\(s\.task\)\);/.test(ADM)) fail("admin row 8 shows \"The client does this step · Nudge\" while it waits on RGA");
  if (!/if \(s\.id === "m1\.access\.website" && stepThreeWaitsOnRga\(t\)\) \{/.test(OM)) fail("the To do list no longer gives step 3 to RGA while it waits on RGA");
}
// ── the step's own admin how-to never asks for a login or hosting credentials
{
  let PB; try { PB = JSON.parse(read("data/playbooks/playbooks.json")); } catch { console.error("⚠️  INDETERMINATE — playbooks.json"); process.exit(2); }
  const find = (x) => { if (!x || typeof x !== "object") return null; if (x.id === "m1.access.website" && typeof x.instructions === "string") return x; for (const v of Object.values(x)) { const r = find(v); if (r) return r; } return null; };
  const st = find(PB), ins = st ? st.instructions : null;
  if (ins == null) { console.error("⚠️  INDETERMINATE — m1.access.website moved in playbooks.json"); process.exit(2); }
  if (/SFTP|\b(get|ask for|obtain)\b[^.\n]*\b(admin )?login\b|hosting credentials if|save all in the password manager/i.test(ins)) fail("step 3's admin how-to asks for a login / SFTP credentials — the promise is never a password");
  if (!ins.includes(EMAIL) || !ins.includes(GH)) fail("step 3's admin how-to doesn't name the RGA Admin email + GitHub user");
}
// ── step 8 has NO Generate (10-27, admin_action_card_and_row8_v1): its runner drafted "I need a login to your website" + "invite
//    hello@ as Administrator". A NEVER line → the producer is deleted; this keeps it deleted, in both SOP copies and flow-execute.
{
  const FX = read("netlify/functions/flow-execute.js");
  if (/"m1\.access\.website": async/.test(FX)) fail("step 8's Generate runner is back in flow-execute (it asked the client for a login)");
  if (/I need a login to your website/i.test(FX)) fail("a runner still drafts \"I need a login to your website\"");
  const PBS = read("data/playbooks/playbooks.json"), i = PBS.indexOf('"id": "m1.access.website"'), blk = i < 0 ? "" : PBS.slice(i, (PBS.indexOf('"id": "', i + 10) + 1 || PBS.length + 1) - 1);   // to the NEXT step (the entry nests clientFirst {…})
  if (!blk) { console.error("⚠️  INDETERMINATE — m1.access.website moved in playbooks.json"); process.exit(2); }
  if (/"hasRunner": true|"actionLabel"/.test(blk)) fail("step 8 offers Generate again (hasRunner / actionLabel in playbooks.json)");
  const SE = read("netlify/functions/send-step-email.js"), set = (SE.match(/const EMAIL_STEPS = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || "";
  if (/^\s*"m1\.access\.website",/m.test(set)) fail("step 8 is on the step-email allow-list again (its runner is gone)");
}
// ── the CLIENT's own words for step 3 (How this step works, the hint) name RGA Admin, never hello@ — both the playbook source and the
//    client-safe projection the portal reads (10-27: "You, or whoever built your site, add hello@…" survived the identity switch)
for (const f of ["data/playbooks/playbooks.json", "data/playbooks/client-steps.json"]) {
  let J; try { J = JSON.parse(read(f)); } catch { console.error(`⚠️  INDETERMINATE — ${f} won't parse`); process.exit(2); }
  const find = (x) => { if (!x || typeof x !== "object") return null; if (x.id === "m1.access.website" && (x.clientInstructions || x.clientHint)) return x; for (const v of Object.values(x)) { const r = find(v); if (r) return r; } return null; };
  const st = find(J);
  if (!st) { console.error(`⚠️  INDETERMINATE — step 3's client copy moved in ${f}`); process.exit(2); }
  const words = `${st.clientInstructions || ""} ${st.clientHint || ""} ${st.clientTodoLine || ""} ${(st.clientTodoSteps || []).join(" ")}`;
  if (OWN_EMAIL.test(words)) fail(`${f}: step 3's client how-to tells them to add hello@ — clients invite RGA Admin`);
  if (!words.includes(EMAIL)) fail(`${f}: step 3's client how-to doesn't name ${EMAIL}`);
}
if (F.length) { console.error(`❌ step 3 RGA Admin identity — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log(`✅ step 3 RGA Admin identity holds: ${EMAIL} · GitHub ${GH} · data = portal = admin · ${Object.keys(DATA.platforms || {}).length} builders free of hello@ · GitHub/GitLab/Bitbucket steps + the developer note render it · portal = admin = To do on whose move step 3 is (10 cases) · admin how-to asks for no password`);
