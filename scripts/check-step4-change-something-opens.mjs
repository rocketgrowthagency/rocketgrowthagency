#!/usr/bin/env node
// check-step4-change-something-opens.mjs — 2026-10-29, approved step4_done_in_portal_v2 part 2. Chris: "when i click change something
// on client portal step 4, nothing happens now?" It had NEVER worked: the button set _editingSteps and nothing on step 4 read it.
// RUNS the real portal code (lifted) and checks the wiring:
//   · not locked: factsCardV2 returns the editor while editing — each fact with Change, the area chips with ✕ and "+ Add an area",
//     Save changes + Cancel, "nothing changes until you save"; the values are the client's own (name, phone, website, come, areas)
//   · locked (on Google, RGA confirmed): the button opens the step's own "Need a change?" (data-facts-ask), never the editor
//   · Save sends the whole answer to portal-step-input in the SAME shape as the first save (name · phone · website · come ·
//     area { keep, add }) and clears the editing flag only on success; Cancel uses the shared data-in-cancel
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), LOCK = read("shared/step-lock.js");
const lift = (name) => { const m = new RegExp(`^(?:const ${name} = |function ${name}\\()`, "m").exec(P); if (!m) return null;
  const lines = P.slice(m.index).split("\n"); let d = 0, o = []; for (const l of lines) { o.push(l); for (const c of l) { if (c === "{" || c === "(") d++; else if (c === "}" || c === ")") d--; } if (d <= 0 && /[;}`]\s*$/.test(l)) break; } return o.join("\n"); };
const parts = ["placeName", "siteShow", "factsLocked", "factsEditorHtml"].map(lift);
if (parts.some((x) => !x)) { console.error("⚠️  INDETERMINATE — the step 4 editor moved"); process.exit(2); }
const ctx = { escapeHtml: (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") };
ctx.escapeAttribute = ctx.escapeHtml; ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(LOCK, ctx); vm.runInContext(parts.join("\n") + "\nthis.ed = factsEditorHtml; this.locked = factsLocked;", ctx);
const AREA = ["El Segundo, CA, USA", "Culver City, CA, USA"];
const ci = { name: "Acme Plumbing & Sons", phone: "+44 20 7946 0958", website: "https://acme.example/", come: "yes", area: { keep: AREA, add: ["Inglewood"] } };
const step = { id: "m1.gbp.business_facts" };
const html = ctx.ed(step, { status: "in_progress", client_input: ci }, { state: "with_rga", area_now: AREA });
for (const [k, label] of [["name", "Business name"], ["phone", "Phone"], ["website", "Website"], ["come", "How customers reach you"], ["area", "Service area"]])
  if (!new RegExp(`data-fe-row="${k}"><span class="pm-fe-k">${label}</span>`).test(html)) fail(`the editor has no "${label}" line`);
if ((html.match(/data-fe-change="(name|phone|website|come)">Change</g) || []).length !== 4) fail("not every fact has its Change button");
if (!/Acme Plumbing &amp; Sons/.test(html) || !/\+44 20 7946 0958/.test(html) || !/acme\.example/.test(html)) fail("the editor doesn't start from the client's own answers (name with &, a UK number, their website)");
if (!/value="yes" checked> Customers come to you/.test(html)) fail("'customers come to you' isn't the chosen answer");
if ((html.match(/data-fe-area="keep"/g) || []).length !== 2 || !/data-fe-area="add" data-fe-name="Inglewood"/.test(html)) fail("the area chips aren't the kept places + the one being added");
if ((html.match(/data-fe-drop/g) || []).length !== 3 || !/\+ Add an area/.test(html)) fail("each area chip needs ✕, and there must be '+ Add an area'");
if (!/data-fe-save="m1\.gbp\.business_facts">Save changes</.test(html) || !/data-in-cancel="m1\.gbp\.business_facts">Cancel</.test(html) || !/nothing changes until you save/.test(html)) fail("Save changes / Cancel / 'nothing changes until you save' missing");
// locked vs not
const lockedTask = { status: "done", client_input: ci, google_push: { state: "on_google", rga_done_at: "2026-10-29T15:00:00Z" } };
if (!ctx.locked(step, lockedTask)) fail("a done step on Google isn't seen as locked");
if (ctx.locked(step, { status: "in_progress", client_input: ci, google_push: { state: "with_rga" } })) fail("a step RGA is still working on counts as locked (the editor would never open)");
if (!/if \(_editingSteps\.has\(step\.id\) && !factsLocked\(step, taskState\)\) return factsEditorHtml\(step, taskState, g\);/.test(P)) fail("factsCardV2 doesn't open the editor while editing");
if (!/const change = factsLocked\(step, taskState\) \? `<button type="button" class="pm-amend" data-facts-ask=/.test(P)) fail("a locked step 4's Change something doesn't open 'Need a change?'");
if (!/const o = row && row\.querySelector\("\.pm-lockfoot \[data-ask-open\]"\)/.test(P)) fail("data-facts-ask doesn't open the lock's own 'Need a change?' form");
// Save: same endpoint + shape as the first save; the editing flag only clears on success
const save = P.slice(P.indexOf('const sv = t.closest("[data-fe-save]")'), P.indexOf('const sv = t.closest("[data-fe-save]")') + 2200);
if (!/const value = \{ name: v\("name"\), phone: v\("phone"\), website: v\("website"\), come, area: \{ keep, add \} \};/.test(save)) fail("Save doesn't send name · phone · website · come · area { keep, add }");
if (!/fetch\("\/\.netlify\/functions\/portal-step-input"/.test(save) || !/step_id: stepId, value/.test(save)) fail("Save doesn't go through portal-step-input (the same save and checks as the first time)");
if (!/if \(!r\.ok \|\| !j\.ok\) throw[\s\S]*_editingSteps\.delete\(stepId\);[\s\S]*settleStepResult/.test(save)) fail("the editing flag clears before the save succeeded (a failed save would throw away their changes)");
if (!/catch \(err\) \{\s*sv\.disabled = false;[\s\S]*pm-msg bad/.test(save)) fail("a failed save doesn't say why and give the button back");

if (F.length) { console.error(`🔴 client step 4's "Change something" can go dead again:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client step 4's Change something opens: the editor (their own answers, Change per fact, ✕ chips + Add an area, Save / Cancel) while RGA works; 'Need a change?' once locked; Save = the same save as the first time");
