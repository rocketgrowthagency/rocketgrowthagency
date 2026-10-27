#!/usr/bin/env node
// check-every-wait-spins.mjs — 2026-10-26, Chris: "can we add spinner loading on all tabs" · "admin and client side".
// A tab that opens on a bare "Loading…" reads as stuck. shared/busy.js (imported FIRST by portal.js and admin.js) marks any
// short text that names a wait and ends in "…" with `.rga-wait`; ONE master CSS rule in portal.css + admin.css draws the ring.
// This holds the class together:
//   · busy.js installs the wait spinners, skips buttons / fields / text that already spins, and unmarks text that changes
//   · both portals import busy.js first, and both stylesheets draw `.rga-wait::before` with its keyframes
//   · EVERY waiting phrase written in portal + admin ("<Verb>ing ……") is one WAIT_RE recognises — a new verb ("Analyzing…")
//     fails here until it is added, so no tab can open on a still "…" again
//   exit 0 holds · 1 a wait can sit still · 2 code moved
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(path.join(SITE, p), "utf8"); } catch { console.log(`⚠️  INDETERMINATE — can't read ${p}`); process.exit(2); } };
const F = [];
const BUSY = read("shared/busy.js");
let M;
try { M = await import(pathToFileURL(path.join(SITE, "shared/busy.js")).href + `?t=${Date.now()}`); } catch (e) { console.log(`⚠️  INDETERMINATE — busy.js did not load: ${e.message}`); process.exit(2); }
if (!(M.WAIT_RE instanceof RegExp) || typeof M.isWaitText !== "function") { console.log("⚠️  INDETERMINATE — busy.js no longer exports WAIT_RE / isWaitText"); process.exit(2); }
if (!/^installWaitSpinners\(\);$/m.test(BUSY)) F.push("busy.js no longer installs the wait spinners");
if (!/characterData: true/.test(BUSY) || !/el\.classList\.toggle\("rga-wait", on\)/.test(BUSY)) F.push("a wait that changes its text keeps (or never gets) the spinner — busy.js must re-check on text changes and unmark");
if (!/const SKIP = "button, \[role=button\], input, textarea, select, option, script, style, \.pm-msg\.busy, \.is-busy";/.test(BUSY)) F.push("the wait spinner no longer skips buttons / fields / text that already spins");
if (!/\(dot\|spin\|spinner\|ring\|loader\)/.test(BUSY)) F.push("a line that draws its own ring (a .dot, a .mv-spin) can get a second one");
if (!/for \(let p = el\.parentElement, d = 0; p && d < 4; p = p\.parentElement, d\+\+\)/.test(BUSY) || !/\(spinner\|spin\|loader\|ring\)/.test(BUSY)) F.push("a line beside a spinner already drawn nearby (the portal's loading screen) gets a second one — Chris 10-26: \"only the one on top\"");
for (const f of ["portal/portal.js", "admin/admin.js"]) {
  const src = read(f);
  if (!/^import "\/shared\/busy\.js\?v=\d+[a-z]?";$/m.test(src.split("\n").slice(0, 4).join("\n"))) F.push(`${f} doesn't import shared/busy.js first`);
}
for (const f of ["portal/portal.css", "admin/admin.css"]) {
  const css = read(f);
  if (!/\.rga-wait::before \{[^}]*border-right-color:transparent;[^}]*animation:rga-wait-spin/.test(css) || !/@keyframes rga-wait-spin/.test(css)) F.push(`${f} doesn't draw the wait ring (.rga-wait::before + its keyframes)`);
}
// every waiting phrase in the code: the text between > and < (or a quote) that starts with a capitalised -ing word and ends in …
const phrases = new Set();
for (const f of ["portal/portal.js", "admin/admin.js", "admin/index.html", "portal/index.html", "admin/calls.js", "admin/playbook.js"]) {
  let src; try { src = fs.readFileSync(path.join(SITE, f), "utf8"); } catch { continue; }
  for (const m of src.matchAll(/(?:>|"|`|')\s*((?:[A-Z][a-z]+ )?[A-Z][a-z]+ing\b[^<>"`'\n…]{0,80}…)/g)) phrases.add(m[1].trim());
}
// the same limit as isWaitText: a short line (a heading, a pill), never a paragraph
const missed = [...phrases].filter((t) => t.length <= 90 && !M.WAIT_RE.test(t) && !/^(Nothing|Something|Everything|Anything)\b/.test(t));
if (phrases.size < 20) F.push(`only ${phrases.size} waiting phrases found — this gate no longer understands the code (re-read it)`);
if (missed.length) F.push(`${missed.length} waiting phrase(s) the spinner won't recognise — add the verb to WAIT_RE: ${missed.slice(0, 8).map((x) => `"${x}"`).join(", ")}`);
// the rule, run: a wait matches; a sentence, a finished line, and a non-wait don't
for (const [t, want] of [["Loading…", true], ["Stage Loading…", true], ["Reading every client's open moves…", true], ["Nothing needs changing…", false], ["Open since Oct 14", false], ["Loading. Done.", false]])
  if (M.WAIT_RE.test(t) !== want) F.push(`WAIT_RE reads "${t}" as ${want ? "not a wait" : "a wait"}`);
if (F.length) { console.log("🔴 a wait can sit still:"); for (const f of F) console.log("   · " + f); process.exit(1); }
console.log(`✅ every wait spins: busy.js marks ${phrases.size} waiting phrases in portal + admin (and any new one) with .rga-wait, skips buttons and lines that already spin, re-checks on text changes; both stylesheets draw the ring`);
