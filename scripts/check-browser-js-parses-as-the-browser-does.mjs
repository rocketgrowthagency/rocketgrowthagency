#!/usr/bin/env node
/**
 * check-browser-js-parses-as-the-browser-does.mjs — every script the site loads must PARSE.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. Chris: *"why is admin blank."* The entire admin app had been a white page since the
 * 2026-09-10 deploy — **a full day** — because `admin/admin.js` had an unterminated `.map()`:
 *
 *     ${_histRows.map((_h) => `
 *       …
 *     </details>` : "";          ← the template and the map() call are never closed
 *
 * One missing `` `).join("")} `` and the module fails to parse, so NOTHING renders. Not a degraded
 * admin — a blank screen.
 *
 * 🔴 THE PART THAT MATTERS MORE THAN THE TYPO. It was checked, and the check said fine:
 *
 *     node --check admin/admin.js   → exit 0     (CommonJS goal)
 *     cp admin.js admin.mjs; node --check admin.mjs → exit 1   ← the browser's answer
 *
 * Same bytes. The EXTENSION picks the parse goal, and `.js` accepted a file every browser rejects.
 * Reproduced in a five-line file. So "I syntax-checked it" was a false statement of safety, and the
 * deploy that shipped it was verified by content — of an unrelated video asset.
 *
 * 🔑 THE RULE: parse each file the way the TAG THAT LOADS IT says to. `type="module"` → module
 * goal. A plain `<script src>` → script goal (where a top-level `import` is itself an error). Never
 * `node --check` a browser `.js` and call it verified.
 *
 * 🔑 Why this and not only a render check: this is deterministic, needs no browser, and runs in a
 * second. `check-playbook-renders.mjs` DOES open a browser — but it mounts playbook.js against a
 * synthetic page and never loads admin.js at all, which is exactly how a dead admin stayed green.
 *
 * Exit 0 = every script parses · 1 = one would be a blank page · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { execFileSync } from "node:child_process";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;

// 🔑 EVERY page, not a hand-picked four. The first version of this gate listed the app surfaces by
// name, which gave it a blind spot by construction — the same shape as the bug it was written for.
// `v/` is excluded: those are ~1,100 GENERATED outreach landing pages built from one template, so
// they add a thousand duplicate parses of the same handful of scripts and nothing else.
const SKIP_DIRS = ["v", "node_modules", ".git", ".netlify", "dist"];

console.log("── every script the site loads parses the way the browser parses it ──");

/** @type {Map<string, {module: boolean, from: string[]}>} */
const targets = new Map();

/** Every .html in the repo except the generated outreach pages. */
function htmlFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.includes(e.name) || e.name.startsWith(".")) continue;
      htmlFiles(path.join(dir, e.name), out);
    } else if (e.name.endsWith(".html")) out.push(path.join(dir, e.name));
  }
  return out;
}

let pages;
try { pages = htmlFiles(SITE); }
catch (e) { console.log(`  ⚠️  could not walk the site: ${e.message}`); process.exit(2); }
if (!pages.length) { console.log("  ⚠️  found NO .html at all — the probe must be wrong."); process.exit(2); }

for (const file of pages) {
  const rel = path.relative(SITE, file);
  const html = fs.readFileSync(file, "utf8");
  // Only LOCAL scripts — a CDN file is not ours to fix and not ours to gate.
  const tags = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/gi)];
  for (const t of tags) {
    const attrs = `${t[1]} ${t[3]}`;
    const src = t[2];
    if (/^https?:|^\/\//i.test(src)) continue;
    const clean = src.split("?")[0].replace(/^\//, "");
    const abs = path.join(SITE, clean);
    if (!fs.existsSync(abs)) {
      console.log(`  🔴 ${rel} loads ${src} — that file does not exist`);
      process.exit(1);
    }
    const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
    const prev = targets.get(abs);
    if (prev) { prev.from.push(rel); prev.module = prev.module || isModule; }
    else targets.set(abs, { module: isModule, from: [rel] });
  }
}

if (!targets.size) {
  // 🔴 Finding nothing means the probe broke, not that the site stopped loading scripts.
  console.log("  ⚠️  found NO local <script src> at all — the probe must be wrong.");
  process.exit(2);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A <script src> TAG IS NOT THE ONLY WAY A FILE REACHES THE BROWSER.
//
// 2026-09-26. This gate reported "all 6 local script(s) parse" — and `admin/calls.js` was not one
// of them, because nothing loads it with a tag: `admin.js` does `import { openCallConsole } from
// "/admin/calls.js"`. I edited calls.js that same minute, and a syntax error in it would have
// broken the Call Console with this gate green. `shared/*.js` are reached the same way.
//
// 🔑 Follow the import graph from every entry point. A module's dependencies ARE scripts the site
// loads; discovering them by tag alone is a claim about how files get included.
// → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const queue = [...targets.keys()];
  const seen = new Set(queue);
  while (queue.length) {
    const abs = queue.shift();
    let src;
    try { src = fs.readFileSync(abs, "utf8"); } catch { continue; }
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2];
      if (!spec || /^https?:|^\/\//i.test(spec)) continue;       // a CDN file is not ours to gate
      if (!/^[./]/.test(spec)) continue;                          // bare specifier — not a file path
      const clean = spec.split("?")[0];
      const dep = clean.startsWith("/")
        ? path.join(SITE, clean.replace(/^\//, ""))
        : path.resolve(path.dirname(abs), clean);
      if (seen.has(dep) || !fs.existsSync(dep) || !dep.endsWith(".js")) continue;
      seen.add(dep);
      queue.push(dep);
      // Anything reached by `import` is, by definition, parsed under the MODULE goal.
      targets.set(dep, { module: true, from: [`${path.relative(SITE, abs)} (import)`] });
    }
  }
}

let fails = 0;
for (const [abs, info] of targets) {
  const rel = path.relative(SITE, abs);
  let src;
  try { src = fs.readFileSync(abs, "utf8"); }
  catch (e) { console.log(`  ⚠️  could not read ${rel}: ${e.message}`); process.exit(2); }

  let error = null;
  if (info.module) {
    // The module goal. Node only applies it to .mjs, so write one — this is the whole point of
    // the gate, and using the same extension as the source would reproduce the original blind spot.
    const tmp = path.join(os.tmpdir(), `rga-parse-${path.basename(abs)}-${src.length}.mjs`);
    try {
      fs.writeFileSync(tmp, src);
      execFileSync(process.execPath, ["--check", tmp], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const out = `${e.stderr || ""}`.split("\n").find((l) => /SyntaxError/.test(l)) || `${e.message}`.split("\n")[0];
      error = out.trim();
    } finally { try { fs.unlinkSync(tmp); } catch { /* best effort */ } }
  } else {
    // The script goal — exactly what a plain <script src> gets, including "import is illegal here".
    try { new vm.Script(src, { filename: rel }); }
    catch (e) { error = e.message; }
  }

  const goal = info.module ? "module" : "script";
  if (error) {
    console.log(`  🔴 ${rel} (${goal}) — ${error}`);
    console.log(`       loaded by: ${info.from.join(", ")} → that page renders NOTHING.`);
    fails++;
  } else {
    console.log(`  ✅ ${rel.padEnd(22)} parses as a ${goal}`);
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} script(s) would leave a blank page in the browser.`);
  console.log("   🔑 `node --check <file>.js` does NOT catch this — it uses the CommonJS goal.");
  process.exit(1);
}
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A BLOCK-COMMENT OPENER INSIDE A LINE COMMENT (added 2026-09-29)
//
// A line comment mentioning a path with a star in it is perfectly valid JavaScript — the line
// comment swallows it. It is POISON to every tool that strips comments with a regex, because the
// opener pairs with the NEXT close and eats everything between. One such line in admin.js swallowed
// 33,354 characters, including the only reads of `client_input`, and a gate then reported six
// client steps as dead ends — of code that was right there.
//
// 🔑 Same family as a backtick inside a template literal: the CONTENT of a comment can break the
// tools that read the file, long after the compiler has stopped caring.
// → feedback_a_gate_window_measured_in_characters_will_lie · project_admin_was_blank_for_a_day
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const poisoned = [];
  for (const abs of targets.keys()) {
    let lines;
    try { lines = fs.readFileSync(abs, "utf8").split("\n"); } catch { continue; }
    lines.forEach((ln, i) => {
      const t = ln.trim();
      if (t.startsWith("//") && t.includes("/" + "*")) {
        poisoned.push(`${path.relative(SITE, abs)}:${i + 1}`);
      }
    });
  }
  if (poisoned.length) {
    console.error(`\n🔴 FAIL — ${poisoned.length} line comment(s) carry a block-comment opener:`);
    for (const q of poisoned) console.error(`   • ${q}`);
    console.error("   Any tool that strips comments by regex swallows everything to the next close.");
    process.exit(1);
  }
  console.log("  ✅ no line comment carries a block-comment opener");
}

console.log(`\n✅ all ${targets.size} local script(s) parse under the goal their own tag declares.`);
process.exit(0);
