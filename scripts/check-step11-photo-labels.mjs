#!/usr/bin/env node
// check-step11-photo-labels.mjs — 2026-11-04. Approved client_step11_photo_labels_v1 (m1.gbp.photos).
//   · the shot's NAME is under every tile, always; the status (GS_LABEL words) is a chip ON the photo
//   · "Saved, not showing" always says why, beside the photo; a reason the code can't read says "Google hasn't said why. Ask RGA if you want it looked into." (no promise RGA can't keep: no To do is raised)
//   · Remove sits beside Change on every filled slot except the logo and cover, and asks first with the approved line
// File-only. exit 0 = holds · 1 = regressed · 2 = can't tell
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), CSS = read("portal/portal.css");
if (!/const p10Lab = \(g\) => escapeHtml\(short\(g\.name\)\);/.test(P)) fail("the tile's name label isn't the shot's name, always");
if ((P.match(/<span class="lab">\$\{p10Lab\(g\)\}<\/span>/g) || []).length !== 2) fail("a tile (open card or done card) doesn't carry the name under it");
if ((P.match(/\$\{p10Chip\(st, (?:n|Number\(it\.n\))\)\}<\/span><span class="lab">/g) || []).length !== 2) fail("a tile's status isn't a chip on the photo");
if (!/const p10Chip = \(st, n\) => \{ const w = st === "on" \? gsLabel\(tileGoogle\(n\), pubByShot\.get\(n\)\)/.test(P)) fail("the chip stops using the GS_LABEL words");
if (!/\.pm-p10-chip \{[^}]*position:absolute[^}]*overflow-wrap:anywhere/.test(CSS)) fail("the chip isn't on the photo, wrapping inside it");
if (/\.pm-p10-chip \{[^}]*#[0-9a-fA-F]{3,6}[^}]*#[0-9a-fA-F]{3,6}[^}]*#[0-9a-fA-F]{3,6}[^}]*#[0-9a-fA-F]{3,6}/.test(CSS)) fail("the chip invents colours");
// why, always
const hw = /const hideWhy = \(ph\) => \(([^]*?)\);\n/.exec(P);
if (!hw) fail("hideWhy is gone");
else {
  if (!/ph\.category === "logo" && shape && shape\.storefront === false/.test(hw[1])) fail("the logo reason isn't based on the hidden-logo rule (storefront === false)");
  if (!/Google only shows a logo for a business with a public address\. Yours serves customers where they are, so Google keeps the logo but doesn't show it\. Your cover photo shows instead\. Nothing to do\./.test(hw[1])) fail("the logo reason isn't the approved words");
  if (!/Google hasn't said why\. Ask RGA if you want it looked into\./.test(hw[1])) fail("a reason the code can't read doesn't say so");
}
if (!/gs === "hide" \? `<div class="pm-turned is-rga pm-hide-why" data-hide-why><span>\$\{hideWhy\(p\)\}<\/span><\/div>`/.test(P)) fail("a Saved, not showing slot doesn't show its reason beside the photo");
if (!/\$\{p10HiddenPh && !p10Short \? csNote\(hideWhy\(p10HiddenPh\)\) : ""\}/.test(P)) fail("the card doesn't show the reason for a hidden photo");
// remove
if (!/PHOTO_SINGLE\.has\(cat\) \? "" : rmBtn\(\{ id: p\.id, onGoogle: true \}\)/.test(P)) fail("a filled slot has no Remove beside Change, or the logo/cover can be removed");
if (!/PHOTO_SINGLE = new Set\(\["logo", "cover"\]\)/.test(P)) fail("the logo and cover are no longer the single slots");
if (!/message: "This takes the photo off your Google profile\. You can add another anytime\."/.test(P)) fail("Remove doesn't ask with the approved line");
if (!/const ok = await portalConfirm\(\{ tone: "danger", pill: "TAKES IT OFF GOOGLE"/.test(P)) fail("Remove doesn't ask first through portalConfirm");
if (!/b\.dataset\.busy = "1"; b\.classList\.add\("is-busy"\)/.test(P)) fail("Remove doesn't spin");
if (F.length) { console.error("🔴 step 11 photo labels regressed:\n" + F.map((m) => "   · " + m).join("\n")); process.exit(1); }
console.log("✅ step 11 photo labels: the name is under every tile, the status is a chip on the photo, Saved not showing always says why, Remove beside Change except logo and cover, asking first");
