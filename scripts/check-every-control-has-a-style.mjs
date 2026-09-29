#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — NO BUTTON MAY CARRY A CLASS THAT NO STYLESHEET DEFINES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 2026-09-29. Chris put two live cards side by side — "Upload photos →" filled blue, "Book another
 * time" a blue outline — and said *"its not the same. must match mockup for all buttons like this.
 * DO DEEP DIVE TO FIX IT."*
 *
 * The outline was my own regression and reverting it took a minute. The deep dive found the real
 * thing: **`admin-btn` is defined in no stylesheet at all**, and three live primary buttons wore it —
 *
 *     <button class="admin-btn is-primary" data-adr-do="approved">Send to client</button>
 *     <button class="admin-btn is-primary" data-ada-hint>Save &amp; ask the client</button>
 *     <button class="admin-btn is-primary" data-afq-send>Reply</button>
 *
 * — so they rendered as **raw browser buttons**. Worse, the first one sat beside
 * `<button class="admin-button" …>Hold back</button>`: the REJECT carried the primary fill while the
 * affirmative action carried nothing. The pair was inverted, silently, because a wrong class name
 * throws nothing and looks like a styling opinion rather than a bug.
 * → feedback_a_symbol_name_is_a_claim_about_the_codebase · feedback_a_control_has_a_kind_like_a_message_does
 *
 * 🔑 THE RULE. A control must end up styled by SOMETHING: at least one of its classes has a rule in
 * the surface's stylesheet (or the page's inline `<style>`), or the element carries its own inline
 * `style=`. A modifier with no rule of its own is fine — `pm-oneoff-add` rides on `pm-amend` — because
 * the element is still styled. What is never fine is every class being unknown.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: judge WHICH tier a control should be. That is a question about
 * intent and lives in the gates for each card. This one asks only whether the browser has anything
 * to go on. → feedback_a_gate_must_pin_the_property_not_the_spelling
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fail = [], indet = [], pass = [];

const SURFACES = [
  { name: "portal", js: "portal/portal.js", css: ["portal/portal.css"], html: "portal/index.html" },
  { name: "admin", js: "admin/admin.js", css: ["admin/admin.css"], html: "admin/index.html" },
];

// A class written by a template expression is not a literal we can check — `kc-seg' + (n < i2 …)`
// yields fragments like `i2`. Only plain literals are judged.
const LITERAL = /^[a-zA-Z][\w-]*$/;

for (const s of SURFACES) {
  const jsPath = path.join(SITE, s.js);
  if (!fs.existsSync(jsPath)) { indet.push(`${s.js} does not exist`); continue; }
  const raw = fs.readFileSync(jsPath, "utf8");
  if (raw.length < 50000) { indet.push(`${s.js} is only ${raw.length} bytes`); continue; }

  // 🔴 Comments quote markup while explaining it — including the very buttons this gate is about.
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  let css = "";
  for (const c of s.css) {
    const p = path.join(SITE, c);
    if (!fs.existsSync(p)) { indet.push(`${c} does not exist`); continue; }
    css += fs.readFileSync(p, "utf8");
  }
  const htmlPath = path.join(SITE, s.html);
  if (fs.existsSync(htmlPath)) css += fs.readFileSync(htmlPath, "utf8");   // inline <style> counts
  if (css.length < 5000) { indet.push(`${s.name}: stylesheet came back empty, cannot judge`); continue; }

  const orphans = new Map();
  let controls = 0;
  for (const m of code.matchAll(/<(?:button|a)\b([^>]*?)class="([^"]*)"([^>]*)>/g)) {
    const attrsBefore = m[1], attrsAfter = m[3];
    // 🔴 JUDGE ONLY A WHOLLY LITERAL CLASS ATTRIBUTE. My first version split the raw value and kept
    // any token that LOOKED like a class name — so `class="kc-seg' + (n < i2 ? " done"…` yielded
    // `i2`, and `class="pm-in-tick${…(x) => (typeof x === "…` yielded `x`, and the gate reported two
    // controls that do not exist. A regex that reads across a concatenation is not reading markup.
    // Strip interpolations, then require what is left to be plain class tokens; anything else is
    // computed and cannot be judged from source. → feedback_a_gate_window_measured_in_characters_will_lie
    const rawValue = m[2].replace(/\$\{[^}]*\}/g, "").trim();
    if (!/^[A-Za-z][\w- ]*$/.test(rawValue)) continue;   // computed — not judgeable
    const classes = rawValue.split(/\s+/).filter((c) => LITERAL.test(c));
    if (!classes.length) continue;
    controls++;
    // 🔑 An element with its own inline style is styled, whatever its classes mean. Two admin
    // buttons (`svc-step-check`, `svc-howto-btn`) are drawn entirely that way, and their class is a
    // JS hook. Calling those broken would be a false red on working code.
    if (/\bstyle="/.test(attrsBefore) || /\bstyle="/.test(attrsAfter)) continue;
    // 🔴 `css.includes(".pm-amend")` IS SATISFIED BY `.pm-amend-RENAMED`. A substring is not a
    // selector: deleting the real rule and leaving any longer class beginning with the same letters
    // kept this gate green. The name must end where the selector ends.
    // → feedback_a_gate_must_pin_the_property_not_the_spelling
    const styled = classes.some((c) => new RegExp("\\." + c.replace(/[-]/g, "\\$&") + "(?![\\w-])").test(css));
    if (!styled) {
      const label = (code.slice(m.index, m.index + 400).match(/>([^<>{]{2,40})</) || [])[1] || "";
      const key = classes.join(" ");
      if (!orphans.has(key)) orphans.set(key, []);
      orphans.get(key).push(label.trim());
    }
  }

  if (controls < 20) {
    indet.push(`${s.name}: only ${controls} controls found — the markup shape changed, so this gate is not measuring what it thinks`);
    continue;
  }
  if (orphans.size) {
    const lines = [...orphans].map(([k, labels]) =>
      `class="${k}" (${labels.length}×${labels[0] ? `, e.g. "${labels[0]}"` : ""})`);
    fail.push(`${s.js} — ${orphans.size} control class-set(s) match NO rule in ${s.css.join(", ")} and carry `
      + `no inline style, so they render as raw browser buttons: ${lines.join(" · ")}. `
      + `A wrong class name throws nothing — it just looks like a styling opinion.`);
  } else pass.push(`${s.js} — all ${controls} controls are styled by something`);
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} surface(s) render a control the stylesheet has never heard of.`);
  process.exit(1);
}
if (indet.length && !pass.length) { console.log("\n⚠️  INDETERMINATE"); process.exit(2); }
console.log(`\n✅ every control carries a class some stylesheet defines (${pass.length} surfaces).`);

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red:
 *   1. rename a live button's class to something undefined (the `admin-btn` bug, exactly)      → fail
 *   2. drop the .pm-act rule from portal.css while buttons still use it                        → fail
 *   3. add a new <button class="totally-undefined">                                            → fail
 * And each must NOT:
 *   4. a modifier with no rule of its own riding a styled base (`pm-amend pm-oneoff-add`)      → pass
 *   5. a button styled entirely by an inline style= (`svc-step-check`)                         → pass
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
