#!/usr/bin/env node
// check-step9-keeps-access-safe.mjs — 2026-10-27, approved admin_row9_vault_v2 (Chris: "step 9 approved"). Step 9 "Keep access
// safe" settles itself with step 8: RGA never holds a client password, it signs in with its own RGA Admin login, saved ONCE per
// platform in Bitwarden. RUNS _rga-logins.js on every case, then pins the one writer, the retired draft and admin's card:
//   · loginPlatformOf: GitHub grant → github; GitLab/Bitbucket files → that; a builder → its key; a checklist → no login
//   · settleStep9: not confirmed → waits; saved platform → done by itself (system); new platform → RGA's move (save the login);
//     no login → done; removed → done, nothing held
//   · admin-access-confirm settles step 9 in the SAME write as every step 8 grant change (one click, by hand, removal), and
//     "Saved in Bitwarden" only for the platform step 8 actually used
//   · the old draft (store client logins / receive credentials / hello@ as Manager) has no producer; both SOP copies say
//     "Keep access safe", no runner, no actionLabel, selfSettles; admin reads "Runs itself" and never shows the old draft
//   · admin's card renders every state with the right buttons (vm)
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import { adminCardLift } from "./lib/admin-card-lift.mjs";   // card_notice_designs_v1 §1 (11-11): admin cards draw through shared/admin-card.js
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = fileURLToPath(new URL("..", import.meta.url));   // never .pathname: it percent-encodes the spaces
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let R; try { R = req(`${SITE}/netlify/functions/_rga-logins.js`); } catch (e) { console.error(`⚠️  _rga-logins won't load: ${e.message}`); process.exit(2); }

// ── the logic, RUN
const ok8 = (x) => ({ access: { confirmed_at: "2026-10-27T18:46:00Z", ...x.access }, client_input: x.ci || {} });
for (const [t8, want, label] of [[ok8({ access: { github: "rocketgrowthagency-admin" } }), "github", "a GitHub grant"],
  [ok8({ access: { account: "access@x" }, ci: { platform: "custom", files: "gitlab" } }), "gitlab", "GitLab files"],
  [ok8({ access: { account: "access@x" }, ci: { platform: "wix", via: "invite" } }), "wix", "a Wix invite"],
  [ok8({ access: { account: "access@x" }, ci: { platform: "jimdo", via: "workaround" } }), null, "a checklist builder"],
  [{ client_input: { platform: "wix" } }, null, "nothing confirmed"]])
  if (R.loginPlatformOf(t8) !== want) fail(`loginPlatformOf(${label}) = ${R.loginPlatformOf(t8)} (want ${want})`);
const saved = new Map([["github", { name: "GitHub", at: "2026-10-26" }]]);
const st = (t8, prev = {}) => R.settleStep9(prev, t8, saved, "2026-10-27T19:00:00Z", { wix: "Wix" });
{ const t = st({}); if (t.vault.state !== "waits" || t.status === "done") fail("step 9 settles before step 8 confirms access"); }
{ const t = st(ok8({ access: { github: "g" } })); if (t.vault.state !== "auto" || t.status !== "done" || t.completed_by !== "system") fail(`a saved platform isn't done by itself (${t.vault.state}/${t.status}/${t.completed_by})`); }
{ const t = st(ok8({ access: { account: "a" }, ci: { platform: "wix" } })); if (t.vault.state !== "save_login" || t.status === "done" || t.vault.name !== "Wix") fail(`a new platform isn't RGA's move to save its login (${t.vault.state}/${t.status})`); }
{ const t = st(ok8({ access: { account: "a" }, ci: { platform: "jimdo", via: "workaround" } })); if (t.vault.state !== "no_login" || t.status !== "done") fail("a checklist builder isn't done (no login to save)"); }
{ const t = st(ok8({ access: { github: "g", removed_at: "2026-11-03" } })); if (t.vault.state !== "removed" || t.status !== "done") fail("removed access isn't 'nothing held'"); }
{ const t = st(ok8({ access: { github: "g" } }), { status: "in_progress", auto_result: { summary: "VAULT" } }); if (!Array.isArray(t.vault.saved_list) || !t.vault.saved_list.some((x) => x.platform === "github")) fail("the card's logins list isn't carried on the record"); }

// ── the one writer settles step 9 in the same write as step 8
const C = read("netlify/functions/admin-access-confirm.js");
const writes = [
  [/const after2 = await writeStepTasks\(supa, rec2, await withStep9\(supa, g\.workspaceId, \{ \.\.\.rec2\.tasks, \[STEP\]: t2 \}, at\)\);/, "one click / right repo"],
  [/const after1 = await writeStepTasks\(supa, rec1, await withStep9\(supa, g\.workspaceId, \{ \.\.\.rec1\.tasks, \[STEP\]: t1 \}, at\)\);/, "Remove access"],
  [/const after = await writeStepTasks\(supa, rec, await withStep9\(supa, gate\.workspaceId, \{ \.\.\.rec\.tasks, \[STEP\]: task \}, now\)\);/, "Confirm access by hand"]];
for (const [re, what] of writes) if (!re.test(C)) fail(`${what} changes step 8's grant without settling step 9 in the same write`);
if (!/if \(!platform \|\| platform !== String\(body\.platform \|\| ""\)\) return json\(409/.test(C)) fail("Saved in Bitwarden can be recorded for a platform step 8 never used");

// ── the retired draft has no producer; both SOP copies agree
const FX = read("netlify/functions/flow-execute.js");
if (/"m1\.access\.password_manager": async/.test(FX)) fail("step 9's runner is back (it drafted storing client logins)");
for (const [f, src] of [["flow-execute.js", FX], ["playbooks.json", read("data/playbooks/playbooks.json")]])
  if (/STORE \(no delegation possible\)|TO RECEIVE A CREDENTIAL|Website \/ CMS login \(WordPress admin/.test(src)) fail(`${f} still carries the retired vault draft`);
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const find = (x) => { if (!x || typeof x !== "object") return null; if (x.id === "m1.access.password_manager" && x.title) return x; for (const v of Object.values(x)) { const r = find(v); if (r) return r; } return null; };
const s9 = find(PB);
if (!s9) { console.error("⚠️  INDETERMINATE — step 9 moved in playbooks.json"); process.exit(2); }
if (s9.title !== "Keep access safe" || s9.hasRunner || s9.actionLabel || !s9.selfSettles) fail(`playbooks.json step 9 isn't "Keep access safe", self-settling, with no runner (${JSON.stringify({ t: s9.title, h: s9.hasRunner, a: s9.actionLabel, s: s9.selfSettles })})`);
let canon = ""; try { canon = fs.readFileSync(`${SCRAPER}flow/playbooks/month1.mjs`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — the canonical SOP is missing"); process.exit(2); }
const cb = canon.slice(canon.indexOf('id: "m1.access.password_manager"'), canon.indexOf("},", canon.indexOf('id: "m1.access.password_manager"')));
if (!/title: "Keep access safe"/.test(cb) || /actionLabel:/.test(cb) || !/selfSettles: true/.test(cb)) fail("the canonical SOP (flow/playbooks/month1.mjs) disagrees on step 9");

// ── admin: the label, the retired draft never shown, every card state
const A = read("admin/admin.js");
// 11-11: the runners' own lists may follow (stepRunsItself, master map Tier 1); selfSettles still makes step 9 "Runs itself" on its own
if (!/: o\.sopType === "auto" \|\| o\.selfSettles (\|\| \(typeof wcRunsItself === "function" && wcRunsItself\(o\.flowId\)\) )?(\|\| \(typeof stepRunsItself === "function" && stepRunsItself\(o\.flowId\)\) )?\? "auto" : "you"\);/.test(A) || !/selfSettles: !!s\.selfSettles,/.test(A)) fail("step 9 doesn't read \"Runs itself\"");
// (citations_52_55_v1, 11-9: steps 52–55 keep their own Undo on their card, on the same line)
if (!/const undoBtn = (monthlyOwn\(o\) \|\| )?o\.selfSettles (\|\| wcRunsItself\(o\.flowId\) )?(\|\| globalThis\.rgaCitationProgress\?\.isStep\(o\.flowId\) )?(\|\| [^\n]*? )?\? ""/.test(A))   /* steps_57_64_v1: more steps may join the list (the shared no-hand-Done, a skip's own Undo); the self-settling ones must stay */ fail("a step that settles itself offers Undo again (it is re-checked, not undone)");
if (!/: o\.flowId === "m1\.access\.password_manager" \? ""   \/\/ 🔒 its old draft/.test(A)) fail("a done step 9 can show its retired draft again");
const fnSrc = (n) => { const at = A.indexOf(`function ${n}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${n} moved`); process.exit(2); } return A.slice(at, A.indexOf("\n}\n", at) + 2); };
const cst = (n) => { const at = A.search(new RegExp(`^const ${n} = `, "m")); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${n} moved`); process.exit(2); } const eol = A.indexOf("\n", at), first = A.slice(at, eol); return (first.trimEnd().endsWith("{") ? A.slice(at, A.indexOf("\n};", at) + 3) : first).replace(/^const /, "var "); };
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), adminGcardWhen: (x) => (x ? new Date(x).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""),   // like the real one
  admPlatforms: () => ({ wix: { name: "Wix", kind: "invite", color: "#111111" }, wordpress: { name: "WordPress", kind: "invite" }, squarespace: { name: "Squarespace", kind: "invite" }, godaddy: { name: "GoDaddy", kind: "invite" }, custom: { name: "Custom-coded", kind: "invite" } }), movesForSelected: () => null, mvDay: (x) => x, mvDueDays: () => 0 });
vm.runInContext(`${["VAULT_SHIELD", "VAULT_TILE", "GH_MONO", "acMono", "OB_WEB_TILE"].map(cst).join("\n")}\n${adminCardLift(SITE, A)}\n${fnSrc("acCardHtml")}\n${fnSrc("vaultAdminHtml")}\nvar state = {};`, ctx);
const render = (t8, t9) => { ctx.state = { selectedClient: { id: "c1", business_name: "Acme Plumbing" }, flowM1State: { tasks: { "m1.access.website": t8 } } }; return vm.runInContext(`vaultAdminHtml(${JSON.stringify(t9)})`, ctx); };
const t8g = ok8({ access: { github: "rocketgrowthagency-admin" } }), t8w = ok8({ access: { account: "access@x" }, ci: { platform: "wix" } });
// admin_row9_done_v3: a positive title, three ticked checks with "Oct 26"-style dates (never ISO), the saved vault line, Check again
{ const h = render(t8g, R.settleStep9({}, t8g, saved, "2026-10-27T19:00:00Z")); if (!/Done automatically/.test(h) || !/Acme Plumbing's access is safe/.test(h) || !/We hold none of their passwords/.test(h) || !/That login is in our vault/.test(h) || !/In the RGA Admin vault/.test(h) || /data-ob-vault-saved/.test(h) || !/data-ob-vault-check/.test(h)) fail("the done-by-itself card is wrong (title, the checks, the vault line, Check again, or it still asks)");
  if (/\b20\d\d-\d\d-\d\d\b/.test(h.replace(/<[^>]+>/g, " "))) fail("the done card shows a raw ISO date (2026-10-26) instead of Oct 26");
  if (!/Oct 26/.test(h)) fail("the vault check doesn't carry the day the login was saved"); }
{ const h = render(t8w, R.settleStep9({}, t8w, saved, "2026-10-27T19:00:00Z", { wix: "Wix" })); if (!/Save RGA Admin's new Wix login in Bitwarden/.test(h) || !/data-ob-vault-saved="wix"/.test(h) || !/vault\.bitwarden\.com/.test(h)) fail("the save-the-new-login card doesn't ask for Wix with Saved in Bitwarden + Open Bitwarden"); }
{ const h = render(t8g, { status: "done", auto_result: { summary: "VAULT — Bitwarden Teams" } }); if (!/data-ob-vault-check/.test(h) || /VAULT — Bitwarden/.test(h)) fail("a record from before the check doesn't offer Check now (or shows the old draft)"); }
{ const h = render({}, R.settleStep9({}, {}, saved, "x")); if (h) fail("a step 9 waiting on step 8 draws a card"); }

if (F.length) { console.error(`❌ step 9 keeps access safe — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ step 9 keeps access safe: settles itself with step 8 (waits · done by itself · save the new login once · no login · removed), in the same write as every grant change; Saved in Bitwarden only for the platform used; the store-a-password draft has no producer; both SOP copies agree; admin reads Runs itself and renders every state");
