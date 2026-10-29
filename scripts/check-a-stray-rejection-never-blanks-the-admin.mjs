#!/usr/bin/env node
// 🔴 A STRAY PROMISE REJECTION NEVER BLANKS THE ADMIN (10-29). admin.js's "unhandledrejection" handler names a failed BOOT
// ("Couldn't load the admin"). Its `dataset.adminView = "boot-failed"` line sat OUTSIDE the boot check, so ANY rejection after the
// admin had loaded (a background read, a card loader) flipped the view; admin.css shows #clientView only while the view is "client",
// and the whole client page went blank with no message. Found by the acceptance walk, whose own bad waitForFunction call threw in the page.
// This gate RUNS the real handler (lifted from admin.js) against both cases:
//   · loaded admin (view "client", a workspace) + a rejection → the view stays "client", no error shell
//   · booting admin + a rejection → "boot-failed" and the error shell shows (the handler's job is kept)
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let AJS; try { AJS = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read admin/admin.js"); process.exit(2); }

// lift the handler: from `window.addEventListener("unhandledrejection"` to its closing `});`
const start = AJS.indexOf('window.addEventListener("unhandledrejection"');
if (start < 0) { console.error("⚠️  INDETERMINATE — admin.js has no unhandledrejection handler (renamed? the boot error went somewhere else)"); process.exit(2); }
let depth = 0, end = -1;
for (let i = AJS.indexOf("(", start); i < AJS.length; i++) { const c = AJS[i]; if (c === "(") depth++; else if (c === ")") { depth--; if (depth === 0) { end = i + 1; break; } } }
if (end < 0) { console.error("⚠️  INDETERMINATE — couldn't lift the handler"); process.exit(2); }
const src = AJS.slice(start, end) + ";";

function run(view, workspace) {
  const shell = { dataset: {}, hidden: true, innerHTML: "" };
  const body = { dataset: { adminView: view } };
  let handler = null;
  const ctx = { window: { addEventListener: (k, fn) => { if (k === "unhandledrejection") handler = fn; } },
    document: { body, getElementById: (id) => (id === "adminLockShell" ? shell : null) },
    state: { workspace }, console: { error() {} }, String };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  if (!handler) return null;
  handler({ reason: new Error("a background read failed") });
  return { view: body.dataset.adminView, shellShown: shell.hidden === false };
}

const F = [];
const loaded = run("client", { id: "w1" });
if (!loaded) { console.error("⚠️  INDETERMINATE — the lifted code registered no handler"); process.exit(2); }
if (loaded.view !== "client") F.push(`a rejection on a LOADED admin turned the view into "${loaded.view}" — the client page goes blank`);
if (loaded.shellShown) F.push("a rejection on a LOADED admin showed the boot error over a working page");
const booting = run("booting", null);
if (booting.view !== "boot-failed" || !booting.shellShown) F.push(`a rejection DURING BOOT no longer says the admin failed to load (view "${booting.view}", error shown: ${booting.shellShown})`);

if (F.length) { console.error(`🔴 the admin's rejection handler:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ a stray rejection leaves a loaded admin on its page; a failed boot still says so");
