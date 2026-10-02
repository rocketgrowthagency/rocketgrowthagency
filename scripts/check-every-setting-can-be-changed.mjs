#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A STEP THAT DECIDED SOMETHING SAYS SO, AND CAN BE CHANGED
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-01: *"EVERY SINGLE STEP needs a way to 'CHANGE' a current setting"*.
 *
 * 🔴 UNDO IS NOT CHANGE. Undo says the step did not happen and sends it back to the queue; to swap
 * one keyword you had to undo the step, losing that it was done and when, then redo it. The setting
 * and the step are two different things and only one of them had a control.
 *
 * 🔴🔴 AND A SETTING IS WHAT A HUMAN DECIDED, NOT WHAT A SCAN OBSERVED. The first measurement said
 * 28 of 61 steps held a setting; that counted every step carrying `outcome_data`, and most of those
 * are AUDIT RESULTS — what the website scan found, which platforms are linked, whether GTM is
 * present. **You do not change a finding**; the control for it is to run the check again. Putting a
 * Change control on evidence invites editing the evidence.
 * → feedback_a_property_read_is_a_claim_about_the_shape
 *
 * Exit 0 pass · 1 a real defect · 2 could not read / run.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(path.join(SITE, p), "utf8"); } catch { return null; } };
const admin = read("admin/admin.js");
const css = read("admin/admin.css");
if (!admin || !css) { console.error("⚠️  could not read admin.js / admin.css"); process.exit(2); }
const code = admin.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const fail = [];
const F = (m) => fail.push(m);
console.log("── a step that decided something says so, and can be changed ──");

// ── RUN the classifier, do not grep it ─────────────────────────────────────────────────────────
let stepSetting, settingOneLine;
try {
  const i = admin.indexOf("const SETTING_AUTHORED"), e = admin.indexOf("function stepSettingHtml");
  if (i < 0 || e < 0) throw new Error("stepSetting / stepSettingHtml anchors are gone");
  const ctx = vm.createContext({});
  vm.runInContext(admin.slice(i, e) + "globalThis._x={stepSetting,settingOneLine};", ctx);
  ({ stepSetting, settingOneLine } = ctx._x);
} catch (err) {
  console.error(`🔴 the setting classifier would not run: ${err.message}`);
  console.error("   That is a defect in the product or in this gate, never a reason to report healthy.");
  process.exit(1);
}

// 🔴 THE LINE THAT MUST NOT BLUR. Real shapes, taken from the record.
const CASES = [
  ["a generated draft",        { outcome_data: { draft: "Here is the hero copy\n\n**H1**\nLocal SEO" } }, true],
  ["a schema snippet",         { outcome_data: { snippet: "<script type=\"application/ld+json\">{}" } }, true],
  ["the client's choice",      { client_choice: "rga_sets_up" }, true],
  ["a website SCAN",           { outcome_data: { h1: "x", title: "y", has_ga4: null, has_schema: true } }, false],
  ["a social audit FINDING",   { outcome_data: { ok: true, fixes: [1, 2], platforms: ["fb"], measures: "x" } }, false],
  ["a tracking DETECTION",     { outcome_data: { ga4_id: null, ga4_state: "unprovable", gtm_present: true } }, false],
  ["a competitor SNAPSHOT",    { outcome_data: { keyword: "seo", competitors: [1], captured_at: "x" } }, false],
  ["nothing stored",           {}, false],
  ["an empty draft",           { outcome_data: { draft: "   " } }, false],
];
for (const [what, task, want] of CASES) {
  const got = !!stepSetting(task);
  if (got !== want) {
    F(want ? `${what} should offer Change and does not`
           : `${what} offers a Change control — you do not edit a finding, you run the check again`);
  }
}

// the one-line summary must not be markdown scaffolding
for (const [v, bad] of [["```yaml\nprimary: SEO Agency", "```yaml"], ["---\n# Title\nReal", "---"], ["**Bold**\nx", "**Bold**"]]) {
  const got = settingOneLine(v);
  if (!got || got === bad || /^```|^-{3,}|^\*\*/.test(got))
    F(`the summary of a setting reads "${got}" — that is scaffolding, not what the step is set to`);
}

// ── the strip, the editor, and what the save writes ────────────────────────────────────────────
if (!/\$\{stepSettingHtml\(s\.task, o\)\}/.test(code)) F("the done card no longer renders the setting strip");
if (!/data-setting-change/.test(code)) F("there is no Change control");
if (!/data-setting-save/.test(code)) F("there is no Save control on the editor");
if (!/data-onboard-undo|↩ Undo/.test(code)) F("Undo is gone — Change replaced it, but they mean different things and both must stay");

const save = (() => {
  const at = code.indexOf("data-setting-save]");
  if (at < 0) return "";
  const open = code.lastIndexOf("document.addEventListener", at);
  let d = 0, i = code.indexOf("{", open), end = -1;
  for (; i >= 0 && i < code.length; i++) { if (code[i] === "{") d++; else if (code[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
  return end > 0 ? code.slice(open, end) : "";
})();
if (!save) F("cannot find the save handler — this gate is auditing a fragment");
else {
  if (!/\["client_choice", "selected", "choice"\]\.includes\(key\)/.test(save))
    F("the save no longer writes a choice back to the task — it would bury a choice inside outcome_data");
  // 🔑 Pin the PROPERTY — the new value is written into outcome_data under the key the strip read
  // it from — not the exact spelling of the assignment.
  if (!/outcome_data\s*=\s*\{[\s\S]{0,90}?\[key\]:\s*next/.test(save))
    F("the save does not write the value back at the key it was read from — it would create a second copy");
  if (!/setting_changed_at/.test(save)) F("a change is not stamped, so the card cannot say it was changed");
  if (!/portal-reply/.test(save)) F("a change to a client-facing step is not posted to their thread — their portal would quietly disagree with ours");
  // 🔑 AND IT MUST CARRY THE STEP. portal-reply takes step_id; without it the note lands in the
  // general thread instead of on the step the client is looking at.
  else if (!/portal-reply[\s\S]{0,400}?step_id:\s*stepId/.test(save))
    F("the note to the client carries no step_id, so it lands in the general thread rather than on the step that changed");
  if (!/clientBucket === "supply" \|\| .*clientBucket === "act"/.test(save)) F("the save no longer decides client-visibility from the step's own bucket");
  if (!/catch \(err\)[\s\S]{0,200}?setBanner/.test(save)) F("a failed save is silent");
}
if (!/\.ob-set\s*\{/.test(css)) F(".ob-set has no style — the strip would fall back to browser defaults");

// ── and the capability that had no caller ──────────────────────────────────────────────────────
// 🔴🔴 `call-tracking-provision.js` handled four providers and both situations while NOTHING in the
// product invoked it — its only two references on disk were the file itself and a mockup. The step
// said "manual until then" over a path that was already built.
// → feedback_a_capability_nobody_calls_looks_finished
{
  const fn = read("netlify/functions/call-tracking-provision.js");
  if (!fn) F("call-tracking-provision.js is gone");
  else if (!/\$\{callTrackingActions\(o, s\.task\)\}/.test(code) || !/call-tracking-provision/.test(code))
    F("nothing in the admin calls call-tracking-provision — step 13 is back to a capability with no button");
  else {
    // 🔴 MARKUP INSIDE A DEAD FUNCTION IS NOT A BUTTON. Run it: the step it belongs to must get the
    // three actions, every other step must get none, and a recorded decline must clear them.
    try {
      const i = admin.indexOf("function callTrackingActions("), e = admin.indexOf("\n}", i);
      const ctx = vm.createContext({});
      vm.runInContext(admin.slice(i, e + 2) + "globalThis._ct=callTrackingActions;", ctx);
      const ct = ctx._ct;
      const on = ct({ flowId: "m1.tracking.call_setup" }, {});
      if (!/data-ct="set_up"/.test(on) || !/data-ct="connect"/.test(on) || !/data-ct="decline"/.test(on))
        F("step 13 no longer offers all three call-tracking actions");
      if (ct({ flowId: "m1.web.schema" }, {}) !== "") F("the call-tracking actions appear on a step they do not belong to");
      if (ct({ flowId: "m1.tracking.call_setup" }, { client_choice: "skip" }) !== "")
        F("a recorded decline still offers to set up call tracking");
    } catch (err) { F(`callTrackingActions would not run: ${err.message}`); }
    const h = (() => {
      const at = code.indexOf('closest("[data-ct]")');
      if (at < 0) return "";
      const open = code.lastIndexOf("document.addEventListener", at);
      let d = 0, i = code.indexOf("{", open), end = -1;
      for (; i >= 0 && i < code.length; i++) { if (code[i] === "{") d++; else if (code[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
      return end > 0 ? code.slice(open, end) : "";
    })();
    if (!h) F("cannot find the call-tracking handler");
    else {
      // 🔴 Only RGA may spend money at a provider. Creating a number must ask first.
      if (!/rgaDialog\(\{[\s\S]{0,300}?danger: true/.test(h)) F("\"Set one up\" does not confirm before spending money at a provider");
      if (/rgaConfirm\(\{/.test(h)) F("rgaConfirm is being passed an object — it takes a STRING, so the title and labels would be dropped and the message would render as [object Object]");
      if (!/company_id/.test(h)) F("\"Connect theirs\" sends no company_id, so the server would try to CREATE a second number");
      if (!/if \(!r\.ok \|\| !resp\.ok\)/.test(h)) F("the provisioning result is not checked — a 200 is not a number");
    }
  }
}
if (!/\.ob-set-edit\s*\{/.test(css)) F(".ob-set-edit has no style");

if (fail.length) {
  console.error(`\n🔴 ${fail.length} problem(s):\n`);
  fail.forEach((f) => console.error("   • " + f));
  process.exit(1);
}
console.log(`  ✅ ${CASES.filter((c) => c[2]).length} kinds of setting offer Change; ${CASES.filter((c) => !c[2]).length} kinds of evidence do not`);
console.log("  ✅ the save writes back at the key it read from, stamps the change, and tells the client");
console.log("  ✅ Undo still exists and still means the step did not happen");
console.log("\n✅ a step that decided something says so, and can be changed.");
