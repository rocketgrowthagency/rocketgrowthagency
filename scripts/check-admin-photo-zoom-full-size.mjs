#!/usr/bin/env node
// check-admin-photo-zoom-full-size.mjs — approved mockup admin_photo_zoom_v1 (Nov 1). File-only.
// HOLDS: a photo read from the client's Google profile keeps its full link (full) beside the small one (thumb); the admin zoom
// opens the full one, falls back to the small one if it fails and says so, and the caption states the pixel size on screen.
// exit 0 = holds · 1 = broken · 2 = can't tell
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const rc = read("netlify/functions/portal-step-recheck.js"), adm = read("admin/admin.js");
const F = []; const fail = (m) => F.push(m);
if (!/thumb: m\.thumbnailUrl \|\| m\.googleUrl \|\| null, full: m\.googleUrl \|\| null/.test(rc)) fail("the recheck no longer saves Google's full link (full) beside the thumbnail");
const at = adm.indexOf("function openPhotoZoom(");
if (at < 0) { console.error("INDETERMINATE: openPhotoZoom is gone"); process.exit(2); }
const fn = adm.slice(at, adm.indexOf("\n}\n", at) + 2).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (!/const first = full \|\| url/.test(fn)) fail("the zoom does not open the full link first");
if (!/img\.src = url/.test(fn) || !/usedSmall/.test(fn)) fail("a failed full link does not fall back to the small version");
if (!/naturalWidth/.test(adm.slice(adm.indexOf("function photoZoomCaption("), at))) fail("the caption does not read the size from the image");
for (const k of ["full", "failed", "small"]) if (!new RegExp(`kind === "${k}"`).test(adm)) fail(`the caption has no "${k}" state`);
if (!/did not load, so this is the small version/.test(adm)) fail("the failed state does not say it is the small version");
if (!/Press "Check again" on the step/.test(adm)) fail("the older-list state does not say how to get the full link");
if (!/This photo could not be loaded\. Close this and open it again\./.test(fn)) fail("the last-resort message is gone (audit low 26)");
if (!/cap\.className|ob-zoom-cap/.test(fn) || !/back\.append\(img, cap, x\)/.test(fn)) fail("the caption line is not shown");
const uses = (adm.match(/\$\{photoFullAttr\((m|g)\)\}/g) || []).length;
if (uses < 5) fail(`only ${uses} Google-listed photo places carry the full link (need 5)`);
if (!/getAttribute\("data-photo-full"\)/.test(adm)) fail("the click handler does not pass the full link to the zoom");
if (/ — |—/.test(adm.slice(adm.indexOf("function photoZoomCaption("), at))) fail("an em dash in the new zoom copy");
if (F.length) { console.error("the photo zoom can go back to a thumbnail:"); for (const f of F) console.error("   - " + f); process.exit(1); }
console.log("OK: the zoom opens Google's full link, falls back and says so, and states the size on screen");
