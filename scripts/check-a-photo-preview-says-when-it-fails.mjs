#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-photo-preview-says-when-it-fails.mjs
//
// 🔒 WHY (2026-10-09): Chris — "the #1 logo is just a grey box is this correct?" The logo was on his Google profile
// and in storage (solid blue, 1080²); the portal's thumbnail signing failed and `catch { }` swallowed it, so a failed
// PREVIEW looked like an empty PHOTO beside "On your Google profile". → feedback_a_silent_catch_hides_an_optimisation_doing_nothing
// HOLDS (portal fillSlotThumbs):
//   1. no catch swallows a signing failure silently — it is logged
//   2. one retry after refreshing the sign-in
//   3. each image is proven to load (Image onload) before it is shown; onerror → the unavailable state
//   4. the unavailable state SAYS so ("No preview") and has its own style — never a bare grey square
// exit 0 = a failed preview says so · 1 = it can go silent again · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const js = read("portal/portal.js"), css = read("portal/portal.css");
const at = js.indexOf("async function fillSlotThumbs(");
if (at < 0) { console.error("⚠️  INDETERMINATE — fillSlotThumbs is gone from portal.js; re-read how slot thumbnails load"); process.exit(2); }
const fn = js.slice(at, js.indexOf("\n}\n", at) + 2).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
if (/catch\s*(\(\w*\))?\s*\{\s*(\/\*[^*]*\*\/)?\s*\}/.test(fn)) fail("a catch in fillSlotThumbs swallows the failure — a failed preview turns back into a silent grey square");
if (!/refreshSession\(\)/.test(fn) || (fn.match(/await sign\(\)/g) || []).length < 2) fail("no retry after refreshing the sign-in");
if (!/new Image\(\)/.test(fn) || !/\.onerror\s*=\s*unavailable/.test(fn) || !/\.onload\s*=/.test(fn)) fail("the image is shown without proving it loads (no Image onload/onerror)");
if (!/if \(!url\) return unavailable\(\)/.test(fn)) fail("a slot with no signed link is left blank instead of saying so");
if (!/classList\.add\("nothumb"\)/.test(fn) || !/textContent = "No preview"/.test(fn)) fail("the unavailable state does not say \"No preview\"");
if (!/\.pm-slot \.thumb\.nothumb\s*\{[^}]*display:flex/.test(css)) fail("the \"No preview\" state has no style of its own");
if (F.length) { console.error("🔴 a photo preview can fail silently:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a photo preview that cannot load retries once, then says \"No preview\" — never a silent grey square");
