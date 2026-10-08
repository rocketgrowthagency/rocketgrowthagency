#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-jump-opens-what-it-lands-on.mjs
//
// 🔴 WHY (Chris, 2026-10-08): "Upload photos button doesnt work?"
//
// It did run. It switched to Setup, opened `article.querySelector("details")` — the card's FIRST fold —
// and scrolled to the form. Once the shot list went into the photo card, the first fold was "See what
// to photograph", so the list opened and the upload form stayed folded shut. A scroll to a hidden
// element moves nothing: from the client's chair, the button did nothing.
//
// `check-every-jump-lands-somewhere-visible` reads source; it proves the handler switches tab first.
// It cannot see a fold. This one asks the BROWSER: render the real photo card, run the real handler,
// click the real button, and ask whether the form can be seen.
// → feedback_the_harness_i_wrote_to_check_my_work_can_lie · feedback_a_property_read_is_a_claim_about_the_shape
//
// exit 0 = the button reveals the form · 1 = it lands on something folded shut · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";
import { chromium } from "playwright";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let code;
try { code = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read portal/portal.js"); process.exit(2); }

// ── the real pieces, lifted by their own boundaries ─────────────────────────────────────────────
const between = (start, end) => {
  const a = code.indexOf(start);
  if (a < 0) return null;
  const b = code.indexOf(end, a);
  return b < 0 ? null : code.slice(a, b);
};
const card = between("const PHOTO_CATEGORIES = [", "\n// ═══════════════════════════════════════════════════════════════════════════════════════════════\n// 🔑 MEET GOOGLE'S PHOTO RULES");
const handler = (code.match(/  listEl\.querySelectorAll\("\[data-jump-to\]"\)\.forEach\(\(b\) => \{[\s\S]*?\n  \}\);\n/) || [])[0];
if (!card || !handler) {
  console.error(`⚠️  INDETERMINATE — could not lift ${!card ? "the photo card" : "the data-jump-to handler"}; re-read portal.js.`);
  process.exit(2);
}

// Render the card in node with the portal's own builder, for a client WITH a shot list (the case that broke).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { escapeHtml: esc, escapeAttribute: esc };
vm.createContext(ctx);
let html;
try {
  vm.runInContext(`${card}\nthis.__build = buildPhotoUploadHtml;`, ctx);
  html = ctx.__build("client-1", [{ id: "p", file_name: "a.jpg", category: "logo", publish_state: "published" }],
    { count: 20, groups: [{ name: "Logo", n: 1 }], items: [{ n: 1, do: "The logo", why: "" }] });
} catch (e) {
  console.error(`⚠️  INDETERMINATE — the photo card did not build: ${e.message}`);
  process.exit(2);
}

const page = `<!doctype html><html><body style="margin:0">
  <div class="pv pv-setup">
    <div style="height:1400px">step rows above</div>
    <button data-jump-to="photo" id="go">Upload photos →</button>
    <div style="height:600px"></div>
    ${html}
    <div style="height:1400px"></div>
  </div>
  <script>
    function setPortalView() {}
    const listEl = document;
    ${handler}
  </script></body></html>`;

let browser;
try {
  browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setContent(page);
  if (errors.length) { console.error(`⚠️  INDETERMINATE — the lifted handler threw: ${errors[0]}`); process.exit(2); }
  const before = await p.evaluate(() => document.querySelector("[data-photo-upload-form]").checkVisibility());
  await p.click("#go");
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => {
    const f = document.querySelector("[data-photo-upload-form]");
    const r = f.getBoundingClientRect();
    return { visible: f.checkVisibility(), inView: r.top < innerHeight && r.bottom > 0 && r.height > 0 };
  });
  console.log(`  form before the click: ${before ? "visible" : "folded"} · after: ${after.visible ? "visible" : "FOLDED"}${after.inView ? ", on screen" : ", off screen"}`);
  if (!after.visible || !after.inView) {
    console.error("🔴 \"Upload photos →\" lands on an upload form the client cannot see — the button appears to do nothing.");
    process.exit(1);
  }
  console.log("✅ the jump opens the fold that holds its target and brings it on screen");
  process.exit(0);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — browser check failed to run: ${String(e.message).slice(0, 160)}`);
  process.exit(2);
} finally {
  if (browser) await browser.close().catch(() => {});
}
