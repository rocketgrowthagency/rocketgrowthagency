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

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// The app surfaces. A marketing page with no local script has nothing to break.
const HTML = ["admin/index.html", "portal/index.html", "index.html", "client-login/index.html"];

console.log("── every script the site loads parses the way the browser parses it ──");

/** @type {Map<string, {module: boolean, from: string[]}>} */
const targets = new Map();

for (const rel of HTML) {
  const file = path.join(SITE, rel);
  if (!fs.existsSync(file)) continue;
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
console.log(`\n✅ all ${targets.size} local script(s) parse under the goal their own tag declares.`);
process.exit(0);
