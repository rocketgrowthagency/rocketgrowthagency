#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-photo-is-what-rga-confirmed.mjs
//
// 🔒 WHY (2026-10-09, approved photo_matching_and_slot_layout_v1): Chris — "#3 is wrong its my logo not building … how
// does the system know which image is which". The portal filled slot 3 ("your building from the street") with RGA's
// logo because Google FILES that photo as EXTERIOR. A category is where a photo was filed, not what is in it.
// And — "when an image is showing it pushes everything left … all things aligned and stay the same format".
// HOLDS:
//   1. a photo already on Google fills a slot ONLY through RGA's confirmation (photo_matches) — never by its category
//   2. photo-match: workspace-only; confirm takes only a slot on the client's list (or null); one Google photo per slot;
//      an AI that could not look is kept as an error ("Couldn't check"), never a guess; our own logo/cover copy is skipped;
//      the write goes onto a fresh read of the record
//   3. the done rule counts a kind from slots truly filled (published or confirmed), not from Google's categories
//   4. admin step 39 lists the photos to sort, asks the AI once, confirms; an upload carries the AI's mismatch flag
//   5. every slot row is the same five columns (# · shot · Example · Yours · Status) with an empty box until a photo
// exit 0 = a slot shows only what RGA confirmed · 1 = a label can fill a slot again / the row moves · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const portal = code("portal/portal.js"), css = read("portal/portal.css"), fn = code("netlify/functions/photo-match.js"),
  recheck = code("netlify/functions/portal-step-recheck.js"), admin = code("admin/admin.js");
const F = []; const fail = (m) => F.push(m);

// 1
if (!/const m = matches\[g\.name\];/.test(portal) || !/if \(n !== null && items\.some\(\(it\) => Number\(it\.n\) === n\)/.test(portal)) fail("the portal no longer fills a slot only from RGA's confirmation");
if (/items\.find\(\(it\) => it\.google === g\.category/.test(portal)) fail("the portal fills a slot from Google's CATEGORY again — that is how RGA's logo became \"your building\"");
// 🔄 2026-10-09 (approved photo_step_already_on_google_and_tips_v1): its own section near the top, one tile per photo
// 🔄 approved photo_step_compact_layout_v1: one line until opened, small rows inside
// 🔄 approved step7_streamlined_v1 (2026-10-15): the photos already on Google fold INTO the progress panel — one line
// ("1 of them was already on Google. RGA is filing it, nothing to do.") until opened, the same small rows inside, a state
// per photo. Order: the plain line → the progress panel (with that fold) → the toolbar → the tips line → the list.
if (!/<details class="pm-p2-also" data-fold="already"(?:\$\{askN\.size \? " open data-fold-held" : ""\})?>/.test(portal) || !/already on Google\./.test(portal) || !/RGA is sorting it<\/span>/.test(portal) || !/Extra · counts toward 20/.test(portal)) fail("photos already on Google no longer get their one-line fold with a state per photo");
if (!/<div class="pm-arow">(?:<span class="th"|\$\{th\(a\)\})/.test(portal) || !/const th = \(a\) => `<span class="th"/.test(portal)) fail("an opened already-on-Google photo is no longer a small row");
// 🔄 step7_later_state_v1 v2: the list (progress → toolbar → tips → slots) is one block, folded behind one line while "later"
// 🔄 10-26 (approved steps_6_20_clean_v1, step 10): ONE plan card — band → bar → team question → the kinds → already on Google → tips
// 🔄 10-30 (approved client_step10_photos_v3, card system batch 2): while the listing waits it's still the folds (band → bar → team
// question → the kinds → already on Google → tips); once open it's band → the 20 tiles → the one shot → team question → the shot
// list → already on Google → the hidden-logo note → "How this step works"
if (!/: `\$\{barRow \? `<div class="pm-pc-pbar">\$\{barRow\}<\/div>` : ""\}\$\{toolbar\}<div class="pm-slots\$\{locked \? " is-locked" : ""\}">\$\{PHOTO_EXAMPLE_SPRITE\}\$\{groupHtml\}<\/div>\$\{alsoFold \? `<div class="pm-pc-also">\$\{alsoFold\}<\/div>` : ""\}\$\{tipsFold\}`/.test(portal)) fail("the photo card's order changed — it is: band → bar → team question → the kinds → already on Google → tips");
if (!/body: p10 \? `\$\{toolbar\}\$\{p10\}\$\{p10LiveNote\}\$\{p10ShortHtml\}\$\{keptCard\}\$\{alsoFold \? `<div class="pm-pc-also">\$\{alsoFold\}<\/div>` : ""\}\$\{p10LogoHidden && !p10Short \? csNote\([^)]*\) : ""\}\$\{p10Done \? "" : p10How\}`/.test(portal)
  || !/const p10How = `\$\{p10Foot\}\$\{tipsFold\.replace\(/.test(portal)
  || !/<div class="pm-p10-tiles">\$\{tiles\}<\/div><div class="pm-p10-panel"\$\{sel == null \? " hidden" : ""\}>\$\{shots\}<\/div><\/div>\$\{kinds\}`/.test(portal)) fail("step 10's open card isn't in the approved order (client_step10_photos_v4) — band → team question → tiles → the shot → the shot list → already on Google → logo note → foot (Maps · How this step works)");
const alreadySrc = (portal.match(/const alsoRows = already\.map[\s\S]*?const alsoFold = [^\n]*/) || [""])[0];
if (!alreadySrc) fail("the already-on-Google section could not be found");
if (/class="pm-pill you"|pm-pill warn|pm-pill bad/.test(alreadySrc)) fail("the already-on-Google section uses \"your move\" colours — the client has nothing to do there");
// 2
// 🔄 second_logo_cleanup_v1: the step's own count may ask too (internal secret), but only to CHECK — never confirm
if (!/const g = await requireWorkspaceForClientOrInternal\(event, client_id\);\s*if \(g\.error\) return g\.error;\s*if \(g\.internal && action !== "check"\) return json\(403/.test(fn)) fail("photo-match is not workspace-only (an internal caller may only check)");
if (!/That slot is not on this client's list/.test(fn)) fail("confirm accepts a slot that is not on the client's list");
if (!/if \(v && v\.slot === slot && k !== name\) matches\[k\] = \{ \.\.\.v, slot: null, freed_by: name \}/.test(fn)) fail("two Google photos can be confirmed into one slot");
if (!/return \{ error: /.test(fn) || !/AI gave no answer/.test(fn)) fail("an AI that could not look is no longer kept as an error");
if (!/!ourSingleton\(m\.category\)/.test(fn)) fail("photo-match checks our own logo/cover copy as \"another photo\"");
if (!/const \[fresh\] = await supa/.test(fn)) fail("photo-match writes back onto the record it read first — a detection in between would be lost");
// 3
if (!/const \{ need, have \} = await photoCategoryNeeds\(clientId\);/.test(recheck) || !/\(have\[cat\] \|\| 0\) < k/.test(recheck)) fail("the done rule counts a kind from Google's categories again");
if (!/confirmed\.has\(Number\(it\.n\)\)/.test(recheck)) fail("the done rule ignores RGA's confirmations");
// 4
if (!/function photoExistingHtml\(\)/.test(admin) || !/data-pm-confirm=/.test(admin) || !/data-pm-none=/.test(admin)) fail("admin step 39 cannot sort the photos already on Google");
if (!/fillExampleArt\(root\);\s*ensurePhotoAiCheck\(\);/.test(admin)) fail("admin never asks the AI to look");
if (!/a\.matches \? prVerdict\("ok"[^;]{0,160}?: prVerdict\("you", "\?", "Doesn't look like this shot\."/.test(admin)) fail("an upload that doesn't match its slot no longer carries the AI's flag");
// 5
if (!/\.pm-slot \{ grid-template-columns:28px minmax\(0,1fr\) 64px 64px 190px; \}/.test(css)) fail("the slot row is no longer five fixed columns — a photo would push the text again");
if (!/<div class="sy">\$\{yours\}<\/div>\s*<div class="sz">\$\{status\}<\/div>/.test(portal)) fail("the slot no longer renders its Yours and Status columns");
if (!/yours: p \? [^\n]*: `<span class="thumb empty" aria-hidden="true"><\/span>`,/.test(portal)) fail("an empty slot no longer holds its photo's place with an empty box");

if (F.length) { console.error("🔴 a photo can be called what it isn't, or the row moves:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a slot shows a photo already on Google only after RGA confirms it; the done rule counts what's truly there; every row holds its columns");
