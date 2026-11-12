#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// check-no-dropped-css-rule.mjs — NO STYLE RULE IS SWALLOWED BY A BROKEN COMMENT.
//
// 🔴 WHY (found 11-11 by the design master audit, live since 09-03): admin.css read
//
//     /* ══ CALL CONSOLE — ported VERBATIM … ══
//        Scoped under /* 🕐 Call-window banner on the call card (2026-09-03). … */
//     …the call-window rules…
//     #callsView and using the mockup's own class names, NOT admin-card/admin-table —
//        those carry their own padding, type scale and borders that silently overrode the mockup. */
//     #callsView{ --cc-brand:#2457e6; … padding:28px 32px 56px; max-width:1080px; }
//
// The 09-03 banner comment was pasted INTO the middle of an older comment. A comment ends at its FIRST
// star-slash, so the older comment's tail stood on its own as text, and a browser reads text before a `{`
// as a selector. "#callsView and using the mockup's own class names … star-slash #callsView" is no valid
// selector (its apostrophe even opens a string), so Chrome dropped the whole `#callsView { … }` rule:
// every --cc-* in the Calls view drew its fallback, padding 0, max-width none, for ten weeks. No error,
// no warning; check-css-declarations-are-valid looks at declarations, and this lost a whole RULE.
//
// HOLDS, for admin/admin.css, portal/portal.css (and style.css):
//   1. Read as a browser tokenizes (CSS Syntax 3: comments, strings, blocks): no comment is left open at
//      the end of the file (it would swallow everything after it), no comment holds a second `/*` (the
//      tell of a comment that was meant to close earlier), no star-slash stands outside a comment, and no
//      string runs into a newline (a stray apostrophe in a selector).
//   2. In Chrome (puppeteer): every selector of every style rule parses (CSS.supports("selector(…)")),
//      and the stylesheet Chrome builds holds as many style rules as the tokenizer found. A rule the
//      browser threw away for ANY reason fails here, named by file:line.
// PROVES ITSELF: before judging the site, it runs both checks on the real 09-03 text and on a clean
// twin. The broken one must fail on every check that applies, the clean one must pass; if not, exit 2.
//
// Exit 0 = no rule is dropped · 1 = a rule is swallowed or thrown away · 2 = can't tell.
// → feedback_a_css_rule_that_looks_applied_can_be_losing · feedback_a_gate_that_cannot_fail
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = ["admin/admin.css", "portal/portal.css", "style.css"];
const REQUIRED = ["admin/admin.css", "portal/portal.css"];
// Selectors another engine needs and Chrome is right to drop. Named, never a pattern that could hide our own text.
const OTHER_ENGINE = /::?-(moz|ms)-/;

// ─── 1. the tokenizer: what a browser sees before it builds a single rule ─────────────────────────────
function tokenize(src) {
  const faults = [], rules = [];   // rules: { line, prelude } for every style rule (not @keyframes / @font-face children)
  const lineAt = (i) => src.slice(0, i).split("\n").length;
  const stack = [];   // "style" | "at-cond" (holds rules) | "at-other" (keyframes, font-face: holds no style rules)
  let prelude = "", preStart = -1, i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) { faults.push({ line: lineAt(i), what: "a comment is never closed: everything after it is swallowed" }); break; }
      const inner = src.indexOf("/*", i + 2);
      if (inner >= 0 && inner < end) faults.push({ line: lineAt(inner), what: "a comment opens inside a comment: the first was meant to close before it, and the text between is not what it looks like" });
      i = end + 2; continue;
    }
    if (c === "*" && n === "/") { faults.push({ line: lineAt(i), what: "a comment close (star-slash) stands outside any comment: the text before it is read as a selector or a value, and its rule is dropped" }); prelude += "*/"; i += 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, bad = false;
      for (; j < src.length; j++) { if (src[j] === "\\") { j++; continue; } if (src[j] === c) break; if (src[j] === "\n") { bad = true; break; } }
      if (bad || j >= src.length) faults.push({ line: lineAt(i), what: `a string opened by ${c} runs into a newline: a stray quote in a selector or value, and its rule is dropped` });
      if (preStart < 0) preStart = i;
      prelude += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "{") {
      const p = prelude.trim(), inStyle = stack[stack.length - 1] === "style", inOther = stack[stack.length - 1] === "at-other";
      if (p.startsWith("@")) stack.push(/^@(media|supports|container|layer|document|scope|starting-style)\b/i.test(p) ? "at-cond" : "at-other");
      else if (inOther) stack.push("at-other");   // a keyframe (from / 50%) or a descriptor block
      else { rules.push({ line: lineAt(preStart >= 0 ? preStart : i), prelude: p, nested: inStyle }); stack.push("style"); }
      prelude = ""; preStart = -1; i++; continue;
    }
    if (c === "}") { stack.pop(); prelude = ""; preStart = -1; i++; continue; }
    if (c === ";") { prelude = ""; preStart = -1; i++; continue; }   // a declaration (or @import) ends; not a prelude
    if (preStart < 0 && !/\s/.test(c)) preStart = i;
    prelude += c; i++;
  }
  if (stack.length && !faults.some((f) => /never closed/.test(f.what))) faults.push({ line: lineAt(src.length - 1), what: `${stack.length} block(s) never closed: a missing } swallows every rule after it` });
  return { faults, rules };
}
// Split a selector list on top-level commas (not inside :is(), :not(), [attr="a,b"]).
function splitList(sel) {
  const out = []; let depth = 0, cur = "", q = null;
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ─── 2. Chrome: does the browser keep every rule? ─────────────────────────────────────────────────────
let browser = null;
async function chrome() {
  if (browser) return browser;
  let puppeteer;
  try { puppeteer = createRequire(import.meta.url)("puppeteer"); } catch { console.error("⚠️  INDETERMINATE — puppeteer is not installed; cannot ask Chrome."); process.exit(2); }
  browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  return browser;
}
async function inChrome(src, rules) {
  const page = await (await chrome()).newPage();
  try {
    await page.setContent("<!doctype html><html><head></head><body></body></html>");
    return await page.evaluate((src, sels) => {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(src);
      let kept = 0;
      const walk = (list) => { for (const r of list) { if (r instanceof CSSStyleRule) kept++; if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules); } };
      walk(sheet.cssRules);
      // 🔑 insertRule, NOT CSS.supports("selector(…)"): supports() answers false for ::-webkit-details-marker, yet Chrome
      // KEEPS that rule (an unknown -webkit- pseudo-element is valid for compatibility). Asking the parser itself to take the
      // rule is the browser's real answer. One part at a time, so the report names the part it refused.
      const probe = new CSSStyleSheet();
      const takes = (s) => { try { probe.insertRule(`${s}{}`, 0); probe.deleteRule(0); return true; } catch { return false; } };
      const refused = sels.map((parts) => (takes(parts.join(",")) ? [] : parts.filter((s) => !takes(s)).concat(parts.every(takes) ? [parts.join(", ")] : [])));
      return { kept, refused };
    }, src, rules.map((r) => splitList(r.prelude.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\*\//g, " */ "))));
  } finally { await page.close(); }
}

async function judge(src, label) {
  const F = [];
  const { faults, rules } = tokenize(src);
  for (const f of faults) F.push(`${label}:${f.line} — ${f.what}`);
  const top = rules.filter((r) => !r.nested);
  const ch = await inChrome(src, rules);
  rules.forEach((r, k) => {
    const bad = ch.refused[k].filter((s) => !OTHER_ENGINE.test(s));
    if (bad.length) F.push(`${label}:${r.line} — Chrome refuses the selector "${bad[0].replace(/\s+/g, " ").slice(0, 90)}", so this whole rule is dropped`);
  });
  const otherEngine = rules.filter((r, k) => ch.refused[k].length && ch.refused[k].every((s) => OTHER_ENGINE.test(s))).length;
  if (ch.kept + otherEngine < rules.length && !F.length) F.push(`${label} — the tokenizer finds ${rules.length} style rules, Chrome keeps ${ch.kept} (${otherEngine} are for another engine): a rule is lost and nothing above names it`);
  return { F, rules: rules.length, top: top.length, kept: ch.kept };
}

// ─── PROVES ITSELF: the real 09-03 text must fail, its clean twin must pass ────────────────────────
const BROKEN = `/* ══ CALL CONSOLE — ported VERBATIM from mockup-call-console.html (approved 2026-08-11) ══
   Scoped under /* 🕐 Call-window banner on the call card (2026-09-03). Colour carries URGENCY, not decoration. */
#callsView .cc-when { border:1px solid #e5eaf2; }

#callsView and using the mockup's own class names, NOT admin-card/admin-table —
   those carry their own padding, type scale and borders that silently overrode the mockup. */
#callsView{ --cc-brand:#2457e6; padding:28px 32px 56px; max-width:1080px; }
.after { color: red; }
`;
const CLEAN = `/* ══ CALL CONSOLE — ported VERBATIM from mockup-call-console.html (approved 2026-08-11) ══
   Scoped under #callsView and using the mockup's own class names, NOT admin-card/admin-table. */
/* 🕐 Call-window banner on the call card (2026-09-03). Colour carries URGENCY, not decoration. */
#callsView .cc-when { border:1px solid #e5eaf2; }
#callsView{ --cc-brand:#2457e6; padding:28px 32px 56px; max-width:1080px; }
@media (max-width: 600px) { .after { color: red; } }
.x::-moz-range-thumb { color: red; }
@keyframes spin { from { opacity: 0 } to { opacity: 1 } }
`;
const UNCLOSED = `.a { color: red; }\n/* a note nobody closed\n.b { color: blue; }\n`;
const proof = [];
{
  const b = await judge(BROKEN, "fixture-09-03");
  if (!b.F.some((m) => /inside a comment/.test(m))) proof.push("the nested comment opener of 09-03 is not caught");
  if (!b.F.some((m) => /outside any comment/.test(m))) proof.push("the orphaned comment close of 09-03 is not caught");
  if (!b.F.some((m) => /Chrome refuses/.test(m))) proof.push("Chrome's refusal of the swallowed #callsView rule is not caught");
  const c = await judge(CLEAN, "fixture-clean");
  if (c.F.length) proof.push(`the clean twin fails: ${c.F[0]}`);
  const u = await judge(UNCLOSED, "fixture-unclosed");
  if (!u.F.some((m) => /never closed/.test(m))) proof.push("a comment left open to the end of the file is not caught");
}
if (proof.length) {
  console.error("⚠️  INDETERMINATE — this gate cannot tell a dropped rule from a kept one:");
  for (const p of proof) console.error(`   · ${p}`);
  if (browser) await browser.close();
  process.exit(2);
}

console.log("── no style rule is swallowed by a broken comment or thrown away by the browser ──");
let fails = 0, checked = 0;
for (const rel of FILES) {
  const full = path.join(SITE, rel);
  if (!fs.existsSync(full)) {
    if (REQUIRED.includes(rel)) { console.error(`⚠️  INDETERMINATE — ${rel} is not in ${SITE}`); if (browser) await browser.close(); process.exit(2); }
    continue;
  }
  checked++;
  const r = await judge(fs.readFileSync(full, "utf8"), rel);
  if (r.F.length) { fails += r.F.length; for (const m of r.F.slice(0, 12)) console.log(`  🔴 ${m}`); if (r.F.length > 12) console.log(`     … and ${r.F.length - 12} more`); }
  else console.log(`  ✅ ${rel}: ${r.rules} style rules, every one kept by Chrome (${r.kept} in its stylesheet)`);
}
if (browser) await browser.close();
if (fails) {
  console.log(`\n🔴 ${fails} rule(s) a browser would drop without a word. Close the comment where it was meant to end; a comment never holds a second /*.`);
  process.exit(1);
}
console.log(`\n✅ ${checked} stylesheet(s): no rule swallowed by a comment, none thrown away by Chrome.`);
