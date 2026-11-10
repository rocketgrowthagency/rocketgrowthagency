#!/usr/bin/env node
// check-portal-has-no-em-dash.mjs (Chris 11-10): NO EM DASH IN ANYTHING A CLIENT CAN READ IN THE PORTAL.
//
// An em dash (U+2014) reads as machine-written. Every sentence in the client portal uses a period, comma, colon or
// parentheses instead; a number tile with no value uses the en dash. This gate reads the SOURCE (it cannot see a string a
// browser run never reaches, so check-client-monthly-in-a-browser stays the live check) and fails on an em dash that is
// not in a comment:
//   - portal/portal.js and shared/client-monthly.js: a real scanner (strings, template text, ${} expressions, regex
//     literals, // and block comments, nested templates). A comment, a // tail after code, an HTML comment inside template
//     text, and a regex literal (it matches text, it never draws any) are exempt. The escapes
//     — and \u{2014} and the entities &mdash; / &#8212; count as an em dash too (they render as one).
//   - portal/index.html: everything outside <!-- --> comments, <script> and <style> (attributes such as title, placeholder
//     and aria-label are text a client reads, so they count).
//   - portal/portal.css: everything outside /* */ comments (a content: "..." string renders).
// ALLOWLIST: none. A string that only PARSES an em dash (never shown) is written with the escape — in a regex or a
// comparison, which this gate reads as a hit on purpose: say so in a named entry below if one is ever truly needed.
//
// PROVES ITSELF: (1) a self-test on fixtures it must get right (in a string, a template, a ${} string, an escape, an
// entity, CSS content, HTML text must be hit; comments, // tails, block comments, a regex with a quote must not derail it);
// (2) it MUST fail on the website at the build's before state (--against=<rev>, default 87c6fdbe, the commit the fix
// branched from) in 100+ places. Either fails to hold = exit 2 INDETERMINATE.
//   node scripts/check-portal-has-no-em-dash.mjs [--list] [--against=<rev>]
// Exit 0 = clean. 1 = an em dash is in client-visible text. 2 = INDETERMINATE.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || process.env.SITE_DIR ||"/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BEFORE = (process.argv.find((a) => a.startsWith("--against=")) || "--against=87c6fdbe").slice(10);
const LIST = process.argv.includes("--list");
const ALLOW = [];   // [{ file, line text contains, why }] none today

const EM = /—|\\u2014|\\u\{2014\}|&mdash;|&#8212;|&#x2014;/i;

/** → [{ line, kind: "string"|"template"|"code"|"regex", text }] for every em dash outside a comment. */
export function scanJs(src) {
  const out = [], n = src.length;
  let i = 0, line = 1, mode = "code";
  const stack = [];          // "tpl" for a ${ opened inside a template, "brace" for a plain {
  let prev = "";             // last significant code char / word, for the regex-or-divide question
  const lineText = (ln) => src.split("\n")[ln - 1];
  const hit = (kind, from) => { const ln = line; out.push({ line: ln, kind, at: from }); };
  const REGEX_AFTER = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", ""]);
  const KW = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do"]);
  let word = "";
  const endWord = () => { if (word) { prev = KW.has(word) ? "" : "w"; word = ""; } };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === "code") {
      if (c === "\n") { line++; endWord(); i++; continue; }
      if (c === "/" && d === "/") { endWord(); while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { endWord(); i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
      if (c === "'" || c === '"') { endWord(); mode = c; i++; continue; }
      if (c === "`") { endWord(); mode = "tpl"; i++; continue; }
      if (c === "/") {
        endWord();
        if (REGEX_AFTER.has(prev)) {
          i++; let cls = false;
          while (i < n && src[i] !== "\n") {
            if (src[i] === "\\") { if (EM.test(src.slice(i, i + 8)) && /^\\u/i.test(src.slice(i, i + 2))) hit("regex", i); i += 2; continue; }
            if (src[i] === "—") hit("regex", i);
            if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; else if (src[i] === "/" && !cls) break;
            i++;
          }
          i++; while (i < n && /[a-z]/i.test(src[i])) i++;
          prev = "w"; continue;
        }
        prev = "/"; i++; continue;
      }
      if (c === "{") { endWord(); stack.push("brace"); prev = "{"; i++; continue; }
      if (c === "}") {
        endWord();
        const top = stack.pop();
        if (top === "tpl") { mode = "tpl"; i++; continue; }
        prev = "}"; i++; continue;
      }
      if (c === "—") { hit("code", i); i++; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) { word += c; i++; continue; }
      if (/\s/.test(c)) { endWord(); i++; continue; }
      endWord(); prev = c; i++; continue;
    }
    if (mode === "'" || mode === '"') {
      if (c === "\\") { if (/^\\u2014|^\\u\{2014\}/i.test(src.slice(i, i + 8))) hit("string", i); if (d === "\n") line++; i += 2; continue; }
      if (c === mode) { mode = "code"; prev = "w"; i++; continue; }
      if (c === "\n") { mode = "code"; line++; i++; continue; }   // an unterminated string: do not run away
      if (c === "—" || (c === "&" && /^(&mdash;|&#8212;|&#x2014;)/i.test(src.slice(i, i + 8)))) hit("string", i);
      i++; continue;
    }
    if (mode === "tpl") {
      // an HTML comment inside template text is never drawn (it is a comment node), so it is exempt like a // comment
      if (c === "<" && src.startsWith("<!--", i)) { i += 4; while (i < n && !src.startsWith("-->", i)) { if (src[i] === "\n") line++; i++; } i += 3; continue; }
      if (c === "\\") { if (/^\\u2014|^\\u\{2014\}/i.test(src.slice(i, i + 8))) hit("template", i); if (d === "\n") line++; i += 2; continue; }
      if (c === "`") { mode = "code"; prev = "w"; i++; continue; }
      if (c === "$" && d === "{") { stack.push("tpl"); mode = "code"; prev = "{"; i += 2; continue; }
      if (c === "\n") line++;
      if (c === "—" || (c === "&" && /^(&mdash;|&#8212;|&#x2014;)/i.test(src.slice(i, i + 8)))) hit("template", i);
      i++; continue;
    }
  }
  const lines = src.split("\n");
  return out.map((h) => ({ line: h.line, kind: h.kind, text: String(lines[h.line - 1] || "").trim().slice(0, 140) }));
}

/** Visible text of an HTML page: everything but <!-- -->, <script> and <style> bodies. */
export function scanHtml(src) {
  const out = [];
  const blank = (s) => s.replace(/[^\n]/g, " ");
  const vis = src.replace(/<!--[\s\S]*?-->/g, blank).replace(/<script\b[\s\S]*?<\/script>/gi, blank).replace(/<style\b[\s\S]*?<\/style>/gi, blank);
  vis.split("\n").forEach((l, k) => { if (EM.test(l)) out.push({ line: k + 1, kind: "html", text: src.split("\n")[k].trim().slice(0, 140) }); });
  return out;
}
export function scanCss(src) {
  const out = [], vis = src.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, " "));
  vis.split("\n").forEach((l, k) => { if (EM.test(l)) out.push({ line: k + 1, kind: "css", text: src.split("\n")[k].trim().slice(0, 140) }); });
  return out;
}

const FILES = [["portal/portal.js", scanJs], ["shared/client-monthly.js", scanJs], ["portal/index.html", scanHtml], ["portal/portal.css", scanCss]];
const allowed = (file, h) => h.kind === "regex" || ALLOW.some((a) => a.file === file && h.text.includes(a.text));
function scanAll(read) {
  const res = {};
  for (const [f, fn] of FILES) { let s; try { s = read(f); } catch { res[f] = null; continue; } res[f] = fn(s).filter((h) => !allowed(f, h)); }
  return res;
}

// ── 1 · the scanner proves itself on fixtures ──────────────────────────────────────────────────────────────────────────
const E = "—";
const SELF = [
  ["hit: a double-quoted string", `const a = "no ${E} yes";`, 1],
  ["hit: a single-quoted string", `const a = 'no ${E} yes';`, 1],
  ["hit: template text", "const a = `<p>no " + E + " yes</p>`;", 1],
  ["hit: a string inside a ${} in a template", "const a = `x ${ok ? \"no " + E + " yes\" : \"\"} y`;", 1],
  ["hit: the escape \\u2014 in a string", "const a = \"no \\u2014 yes\";", 1],
  ["hit: the entity &mdash; in a template", "const a = `<b>no &mdash; yes</b>`;", 1],
  ["hit: a lone dash as an empty-value marker", `return n == null ? "${E}" : n;`, 1],
  ["miss: a // comment", `const a = 1; // not ${E} shown`, 0],
  ["miss: a // comment on its own line", `// ${E} a note\nconst a = 1;`, 0],
  ["miss: a block comment over lines", `/* a ${E}\n ${E} b */\nconst a = 1;`, 0],
  ["miss: a comment inside a template's ${}", "const a = `x ${/* " + E + " why */ \"\"} y`;", 0],
  ["no derail: a regex with quotes and slashes, then a real hit on the next line", `const r = /["'\`]\\/x/g;\nconst a = "no ${E} yes";`, 1],
  ["no derail: a division then a hit", `const h = a / b / 2; const s = "x ${E} y";`, 1],
  ["no derail: nested templates, hit in the inner text", "const a = `a ${list.map((x) => `<i>${x} " + E + " </i>`).join(\"\")} b`;", 1],
  ["line number: the second line", `const a = 1;\nconst b = "x ${E} y";`, 1],
  ["miss: an HTML comment inside a template", "const a = `<!-- " + E + " why -->` + `<p>ok</p>`;", 0],
  ["hit: text after an HTML comment inside a template", "const a = `<!-- x --><p>no " + E + " yes</p>`;", 1],
  ["miss: the en dash", "const a = \"1–2\";", 0],
];
let selfBad = 0;
for (const [name, code, want] of SELF) {
  const got = scanJs(code).length;
  if (got !== want) { console.error(`SELF-TEST FAILED  ${name}: wanted ${want} hit(s), got ${got}`); selfBad++; }
}
const lnCheck = scanJs(`const a = 1;\nconst b = "x ${E} y";`);
if (!lnCheck.length || lnCheck[0].line !== 2) { console.error("SELF-TEST FAILED  line numbers"); selfBad++; }
if (scanHtml(`<!-- ${E} -->\n<script>var a="${E}"</script>\n<style>a{content:"${E}"}</style>\n<p title="a ${E} b">x</p>`).length !== 1) { console.error("SELF-TEST FAILED  html: only the attribute should be hit"); selfBad++; }
if (scanHtml(`<p>a ${E} b</p>`).length !== 1) { console.error("SELF-TEST FAILED  html text"); selfBad++; }
if (scanCss(`/* ${E} */\n.a::before{content:"${E}"}`).length !== 1) { console.error("SELF-TEST FAILED  css"); selfBad++; }
if (selfBad) { console.error(`INDETERMINATE: the scanner does not do what it claims (${selfBad} fixture(s) wrong). Nothing was checked.`); process.exit(2); }

// ── 2 · it must fail on the build's before state ───────────────────────────────────────────────────────────────────────
let before;
try { before = scanAll((f) => execFileSync("git", ["-C", SITE, "show", `${BEFORE}:${f}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })); }
catch (e) { console.error(`INDETERMINATE: cannot read ${BEFORE} in ${SITE} (${String(e.message).split("\n")[0]}).`); process.exit(2); }
const beforeN = Object.values(before).reduce((n, a) => n + (a ? a.length : 0), 0);
if (beforeN < 100) { console.error(`INDETERMINATE: on ${BEFORE} this gate found only ${beforeN} em dash(es) in client-visible text; it must find 100+ there to be trusted (the build rewrote ~200).`); process.exit(2); }

// ── 3 · the real files ─────────────────────────────────────────────────────────────────────────────────────────────────
const now = scanAll((f) => fs.readFileSync(`${SITE}/${f}`, "utf8"));
let bad = 0;
for (const [f, hits] of Object.entries(now)) {
  if (hits === null) { console.error(`INDETERMINATE: cannot read ${f} in ${SITE}`); process.exit(2); }
  if (LIST || hits.length) for (const h of hits) { console.log(`${f}:${h.line} [${h.kind}] ${h.text}`); }
  bad += hits.length;
}
if (bad) { console.error(`FAIL: ${bad} em dash(es) in text a client can read (periods, commas, colons or parentheses instead; the en dash for an empty number tile). On ${BEFORE} it found ${beforeN}.`); process.exit(1); }
console.log(`ok: no em dash in any client-visible text of the portal (the gate finds ${beforeN} on ${BEFORE}; ${SELF.length} scanner fixtures hold).`);
