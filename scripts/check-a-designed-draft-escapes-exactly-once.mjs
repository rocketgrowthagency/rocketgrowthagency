#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A DESIGNED DRAFT ESCAPES EXACTLY ONCE, AND PARSES THE RAW SOURCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 2026-10-02. The structured view shipped and step 26's card showed Chris:
 *
 *     &quot;google business profile optimization&quot;
 *     &gt; Directly matches one of the three services offered…
 *
 * renderStepMarkdown escapes the whole document FIRST, then walks it. The fence handler was
 * handing parseYamlish that ESCAPED copy, so:
 *   · `why: >`  arrived as `why: &gt;` — the folded-scalar MARKER stopped being a marker and
 *     became the first word of the reason.
 *   · `"term"`  arrived as `&quot;term&quot;` — yUnquote's /^["'].*["']$/ no longer matched, so
 *     the quotes survived into the title.
 *   · structuredHtml then escaped every value a SECOND time: `&` → `&amp;`, and the entity
 *     printed as literal text.
 *
 * 🔑 The fix is one direction, not one patch: the PARSER reads raw, the RENDERER escapes once.
 * That trade is only safe if structuredHtml escapes every value it emits — a draft containing
 * `<script>` now reaches it unescaped, so this gate holds BOTH halves at once.
 *
 * Executes the real product functions out of admin/admin.js. Exit 0 pass · 1 fail · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const W = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const SRC = W + "admin/admin.js";
let src;
let css;
try { src = fs.readFileSync(SRC, "utf8"); css = fs.readFileSync(W + "admin/admin.css", "utf8"); }
catch { console.error("⛔ cannot read admin/admin.js or admin.css"); process.exit(2); }

const fail = [];

// ═══ PART 1 — THE WIRING. The parser must be fed the RAW fence, never the escaped copy. ═══════
// 🔴 Pinned as a PROPERTY (which variable reaches the parser), not as a spelling of the body.
// → feedback_a_gate_must_pin_the_property_not_the_spelling
const rawDecl = /const\s+rawLines\s*=\s*String\(\s*md[^)]*\)\s*\.split\("\\n"\)/.test(src);
if (!rawDecl) fail.push("renderStepMarkdown no longer derives rawLines from the UNESCAPED md");

const slice = /const\s+rawBody\s*=\s*rawLines\.slice\(\s*fenceOpen\s*\+\s*1\s*,\s*k\s*\)/.test(src);
if (!slice) fail.push("the fence no longer slices rawBody out of rawLines by the same indices");

if (!/parseYamlish\(\s*rawBody\s*\)/.test(src)) fail.push("parseYamlish is not being given rawBody");
if (!/structuredCoversSource\(\s*parsed\s*,\s*rawBody\s*\)/.test(src)) fail.push("structuredCoversSource is not checking against rawBody");

// 🔴 And the verbatim fallback must keep the ESCAPED body — parsing raw must not leak raw into a <pre>.
if (!/<pre class="ob-code"\$\{lang \? ` data-lang[\s\S]{0,80}?<code>\$\{body\}<\/code><\/pre>/.test(src)) {
  fail.push("the verbatim <pre> no longer emits the escaped body");
}

// ═══ PART 2 — THE BEHAVIOUR. Run the real functions. ══════════════════════════════════════════
const pick = (name) => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) { console.error(`⛔ ${name} not found in admin.js`); process.exit(2); }
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  console.error(`⛔ ${name} is unbalanced`); process.exit(2);
};
const helpers = src.split("\n").filter((l) => /^const (yIndent|yUnquote) =/.test(l)).join("\n");
if (!/yIndent/.test(helpers) || !/yUnquote/.test(helpers)) { console.error("⛔ yIndent/yUnquote not found"); process.exit(2); }

const ctx = vm.createContext({ console });
try {
  vm.runInContext(
    helpers + "\n" + ["escapeHtml", "parseYamlish", "parseYamlBlock", "structuredCoversSource", "structuredHtml"].map(pick).join("\n\n"),
    ctx,
  );
} catch (e) { console.error("⛔ cannot evaluate the product functions: " + e.message); process.exit(2); }
const call = (n) => vm.runInContext(n, ctx);

// The exact shapes that are live in the record today: a fact, a list, items with a folded reason.
const FIXTURE = `keywords:
  - term: "google business profile optimization"
    why: >
      Directly matches one of the three services offered — worth pushing hard.

  - term: "local seo for contractors"
    why: >
      Real demand from trade businesses.
primary: "Internet marketing service"
additional:
  - "Marketing agency"
  - "Marketing consultant"`;

const parsed = call("parseYamlish")(FIXTURE);
if (!parsed) { fail.push("parseYamlish rejects the shape that is live in the record today"); }
else {
  if (!call("structuredCoversSource")(parsed, FIXTURE)) fail.push("structuredCoversSource rejects its own parse of the live shape");
  const html = call("structuredHtml")(parsed);

  for (const ent of ["&amp;quot;", "&amp;gt;", "&amp;lt;", "&amp;amp;"]) {
    if (html.includes(ent)) fail.push(`DOUBLE-ESCAPED: the rendering contains ${ent}`);
  }
  // what a person actually reads — tags stripped, entities are what we are hunting
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (/&(quot|gt|lt|amp|#39);/.test(text)) fail.push(`an HTML entity is visible as text: ${text.match(/&\w+;/)[0]}`);
  if (/^\s*&gt;|[>] Directly/.test(text) || text.includes("> Directly")) fail.push("the folded-scalar marker leaked into the reason");
  if (!/google business profile optimization/.test(text)) fail.push("the keyword is missing from the rendering");
  if (/"google business profile optimization"/.test(text)) fail.push("yUnquote did not strip the quotes — it was handed escaped text");
  if (!/Directly matches one of the three services offered/.test(text)) fail.push("the folded reason is missing from the rendering");
  if (!/Internet marketing service/.test(text)) fail.push("the fact is missing from the rendering");
  if (!/Marketing consultant/.test(text)) fail.push("the list is missing from the rendering");
}

// ═══ PART 3 — THE TRADE. Raw in means structuredHtml is the ONLY escape. Prove it still escapes.
const HOSTILE = `names:
  - term: "<script>alert(1)</script>"
    why: >
      a & b < c "quoted"`;
const hostile = call("parseYamlish")(HOSTILE);
if (!hostile) {
  fail.push("the hostile fixture does not parse — the escape half of this gate proves nothing");
} else {
  const h = call("structuredHtml")(hostile);
  if (h.includes("<script>")) fail.push("🔴 XSS: a <script> in a draft reaches the card unescaped");
  if (!h.includes("&lt;script&gt;")) fail.push("structuredHtml did not escape the markup in a draft value");
  if (!h.includes("a &amp; b &lt; c")) fail.push("structuredHtml did not escape & and < inside a reason");
}

// ═══ PART 4 — A MARKDOWN ESCAPE IS NOT A CHARACTER. ══════════════════════════════════════════
// The model writes `## SMS\_1` and the card printed the backslash. 18 of them across 2 stored
// outputs. Run the WHOLE renderer, because the bug lives in the order the inline rules fire.
const ctx2 = vm.createContext({ console, URL });
try {
  vm.runInContext(
    helpers + "\n" +
    ["escapeHtml", "escapeAttribute", "parseYamlish", "parseYamlBlock", "structuredCoversSource", "structuredHtml", "renderStepMarkdown"]
      .map(pick).join("\n\n"),
    ctx2,
  );
} catch (e) { console.error("⛔ cannot evaluate renderStepMarkdown: " + e.message); process.exit(2); }
const render = vm.runInContext("renderStepMarkdown", ctx2);

const MD = "## SMS\\_1 — Under 160 characters\n\nUse \\*literally asterisked\\* and \\_under\\_ here.\n\nReal *emphasis* and **strong** still work.";
const html = render(MD);
const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

if (plain.includes("\\")) fail.push(`a markdown escape printed its backslash: ${JSON.stringify(plain.slice(0, 70))}`);
if (!/SMS_1/.test(plain)) fail.push("the escaped underscore did not survive as a plain underscore");
if (!/\*literally asterisked\*/.test(plain)) fail.push("an escaped asterisk was eaten — masking must outlive the emphasis rules");
if (/<em>literally asterisked<\/em>/.test(html)) fail.push("an ESCAPED asterisk was rendered as emphasis");
if (!/_under_/.test(plain)) fail.push("escaped underscores did not survive");
if (!/<em>emphasis<\/em>/.test(html)) fail.push("real emphasis stopped working");
if (!/<strong>strong<\/strong>/.test(html)) fail.push("real strong stopped working");
if (/\u0000/.test(html)) fail.push("a masking sentinel leaked into the rendering");

// ── A CHIP IS A LABEL, NOT A SENTENCE ───────────────────────────────────────────────────────
// Chris, 2026-10-02: *"i just dont like the pill with description inside of it"*. This design was
// built against the GBP categories (2-3 words) and became wrong the moment a value carried a clause.
{
  const SHORT = `categories:\n  - "Marketing agency"\n  - "Website designer"`;
  const sp = call("parseYamlish")(SHORT);
  const sh = sp ? call("structuredHtml")(sp) : "";
  if (!/ob-chips/.test(sh)) fail.push("a list of SHORT values no longer renders as chips — that design was right for the GBP categories");
  if (/ob-places/.test(sh)) fail.push("a list of short values was split into rows it does not need");

  const WORDY = `locations:\n  - Culver City Downtown (around Culver Blvd and Main Street)\n  - Mar Vista (within the service footprint)`;
  const wp = call("parseYamlish")(WORDY);
  const wh = wp ? call("structuredHtml")(wp) : "";
  if (!wp) fail.push("the locations list no longer parses");
  else {
    if (!/ob-places/.test(wh)) fail.push("a value carrying a clause is still rendered as a pill holding a sentence");
    if (!/<span class="ob-chip">Culver City Downtown<\/span>/.test(wh)) fail.push("the pill no longer holds just the place name");
    if (!/<span class="note">around Culver Blvd and Main Street<\/span>/.test(wh)) fail.push("the clause did not move out beside the pill");
    if (/ob-chip">Culver City Downtown \(/.test(wh)) fail.push("the clause is back INSIDE the pill");
    // 🔴 and nothing may be lost in the split
    const txt = wh.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const frag of ["Culver City Downtown", "around Culver Blvd and Main Street", "Mar Vista", "within the service footprint"]) {
      if (!txt.includes(frag)) fail.push(`the pill/note split lost ${JSON.stringify(frag)}`);
    }
    // 🔴 A CLASS NO STYLESHEET DEFINES THROWS NOTHING — it renders unstyled and nobody is told.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const sel of [".ob-places", ".ob-place", ".ob-place .note"]) {
      const rule = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{]");
      if (!rule.test(bare)) fail.push(`${sel} has no rule of its own — the row renders unstyled`);
    }
  }
}

if (fail.length) {
  console.error("🔴 a designed draft is not escaping exactly once:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ the designed draft parses the raw source and escapes exactly once (fact · list · items · hostile)");
