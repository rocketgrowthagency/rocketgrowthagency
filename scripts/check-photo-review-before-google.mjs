#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-photo-review-before-google.mjs
//
// 🔒 WHY (2026-10-09, approved photo_review_before_google_v1): Chris — "should it send to google or RGA?
// then RGA loads? whats the right protocol here?" + "maybe we have sample photos for each … not real live
// photo but a graphic style". A client's photo now waits for RGA's yes; each slot shows an example drawing
// of its KIND. (check-a-photo-reaches-google holds the server + database half.)
// HOLDS:
//   1. EVERY kind a slot can file under has an example: each value of the portal's SLOT_CATEGORY, plus
//      "additional", is a key of PHOTO_EXAMPLE, its drawing exists in the sprite, and it has 4 tips
//   2. the client slot: a turned-down photo does not fill its slot (it reopens with RGA's note), the slot
//      carries the example toggle, and the review states are worded from the client's side
//   3. admin: step 39 renders the review list, its status says "Review N", Your action names the photos and
//      opens the step, and the buttons call admin-photo-review
// exit 0 = holds · 1 = broken · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const portal = strip(read("portal/portal.js")), admin = strip(read("admin/admin.js")), shared = read("shared/photo-examples.js");
const F = []; const fail = (m) => F.push(m);

// 1
const sc = portal.match(/const SLOT_CATEGORY = \{([\s\S]*?)\};/);
if (!sc) fail("portal SLOT_CATEGORY is gone — re-read this gate");
const cats = new Set([...(sc ? sc[1].matchAll(/:\s*"([a-z_]+)"/g) : [])].map((m) => m[1]).concat("additional"));
let EX;
try { EX = await import(`data:text/javascript;base64,${Buffer.from(shared).toString("base64")}`); } catch (e) { fail(`shared/photo-examples.js does not load: ${e.message}`); }
if (EX) {
  for (const c of cats) {
    const ex = EX.PHOTO_EXAMPLE[c];
    if (!ex) { fail(`a slot can file under "${c}" but there is no example for it`); continue; }
    if (!EX.PHOTO_EXAMPLE_SPRITE.includes(`id="pmx-${ex.art}"`)) fail(`the "${c}" example draws #pmx-${ex.art}, which the sprite does not have`);
    if (!Array.isArray(ex.tips) || ex.tips.length !== 4) fail(`the "${c}" example has ${ex?.tips?.length} tips — the approved design shows 4`);
  }
  if (EX.photoExampleOf("no-such-kind") !== EX.PHOTO_EXAMPLE.additional) fail("an unknown kind does not fall back to the Other example");
}
// 2
if (!/if \(p\.publish_state === "turned_down"\) \{ if \(!turnedByShot\.has/.test(portal)) fail("a turned-down photo fills its slot again — the client could never replace it");
if (!/data-ex-toggle/.test(portal) || !/PHOTO_EXAMPLE_SPRITE/.test(portal)) fail("the client slots lost their example drawing");
if (!/in_review: \{ cls: "other", label: "With RGA for review" \}/.test(portal)) fail("a photo in review is not shown as \"With RGA for review\"");
if (!/turned_down: \{ cls: "you", label: "Please retake" \}/.test(portal)) fail("a turned-down photo is not shown as the client's move");
if (!/From RGA:<\/b> \$\{escapeHtml\(turned\.review_note\)\}/.test(portal)) fail("RGA's reason is not shown on the slot it was given for");
if (!/review_note/.test((portal.match(/\.from\("client_photos"\)\s*\.select\("([^"]+)"/) || [])[1] || "")) fail("the portal's photo query does not read review_note — the reason could never render");
// 3
if (!/\$\{prvHtml\}\$\{waitHtml\}/.test(admin) || !/\$\{prvHtml\}\$\{bandHtml\}/.test(admin)) fail("step 39 no longer renders the review list in both of its states");
if (!/\$\{prvN \? `Review \$\{prvN\}` : waiting/.test(admin)) fail("step 39's status does not say Review N while photos wait");
if (!/reveal: PHOTO_REVIEW_STEP/.test(admin) || !/data\.admin\.reveal/.test(admin)) fail("Your action does not name the waiting photos, or does not open step 39");
if (!/fetch\("\/\.netlify\/functions\/admin-photo-review"/.test(admin)) fail("the review buttons do not call admin-photo-review");
if (!/const PHOTO_REVIEW_STEP = "m1\.gbp\.photos";/.test(admin)) fail("the review is not attached to step 39 (m1.gbp.photos)");

if (F.length) { console.error("🔴 the photo review before Google is broken:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ photo review before Google: ${cats.size} kinds each have an example, slots reopen on a turn-down, step 39 + Your action carry the review`);
