#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-an-upload-confirms-in-its-slot.mjs
//
// 🔒 WHY (2026-10-09, approved photo_upload_confirmation_v1): Chris — "is it when i load it reloads the entire portal
// too? both times i did upload it reloaded entire portal. i dont want this." + "send mockup of confirmation … i want
// better design". Every upload ended with location.reload() 2.5–3 s later, and the only confirmation was a green line
// under the shot's text beside an empty box.
// HOLDS (portal/portal.js):
//   1. no photo upload reloads the page — the slot path and the monthly form both update in place
//   2. the photo shows in "Yours" the moment it's picked (a local preview), with a ring while it uploads
//   3. progress is REAL (XHR upload.onprogress to the same storage endpoint), never a made-up number
//   4. the Status column walks: Preparing → Uploading… N% → ✓ Sent to RGA (2 s) → With RGA for review · Sent just now
//   5. a failure says so in Status with Try again; a photo Google won't take says why with Pick another
//   6. one file's failure never stops the others; a bottom note says how many were sent, with Show me
// exit 0 = an upload confirms in its slot and nothing reloads · 1 = it regressed · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const js = read("portal/portal.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const css = read("portal/portal.css");
const F = []; const fail = (m) => F.push(m);
const between = (a, b) => { const i = js.indexOf(a); if (i < 0) return ""; const j = js.indexOf(b, i + a.length); return js.slice(i, j < 0 ? undefined : j); };
const slotHandler = between('const input = ev.target.closest && ev.target.closest("input[data-slot-file]");', "function slotUploadUi(");
const formHandler = between('const form = ev.target.closest("form[data-photo-upload-form]");', "document.addEventListener(");
if (!slotHandler || !formHandler) { console.error("⚠️  INDETERMINATE — could not find the upload handlers"); process.exit(2); }
// 1
if (/location\.reload/.test(slotHandler)) fail("a slot upload reloads the whole portal again");
if (/location\.reload/.test(formHandler)) fail("the monthly photo form reloads the whole portal again");
if (!/refreshPhotoCard\(form, clientId,/.test(formHandler)) fail("the monthly form no longer rebuilds its own card after an upload");
// 2 + 3
if (!/URL\.createObjectURL\(file\)/.test(js)) fail("the photo no longer appears in Yours the moment it's picked");
if (!/x\.upload\.onprogress = \(e\) => \{ if \(e\.lengthComputable\) onPct\(Math\.round\(\(e\.loaded \/ e\.total\) \* 100\)\); \};/.test(js)) fail("upload progress is no longer the real one (XHR upload.onprogress)");
// 4
for (const [w, re] of [["Preparing", /Preparing your photo…/], ["Uploading %", /`Uploading… \$\{pct\}%`/], ["Sent to RGA", /<\/span>Sent to RGA<\/span><small>We review it before it goes on Google\.<\/small>/],
  ["settles on With RGA for review", /\$\{escapeHtml\(PHOTO_STATE\.in_review\.label\)\}<\/span><small>Sent just now<\/small>/], ["after 2 seconds", /\}, 2000\);/]])
  if (!re.test(js)) fail(`the Status column lost "${w}"`);
// 5
if (!/<span class="pm-pill bad">Didn't upload<\/span>/.test(js) || !/addAgain\("Try again"\)/.test(js)) fail("a failed upload no longer says so with Try again");
if (!/addAgain\("Pick another"\)/.test(js) || !/Too small for Google/.test(js)) fail("a photo Google won't take no longer says why with Pick another");
// 6
if (!/catch \(e\) \{\s*failed\.push\(e\);\s*onStage\(i, "failed"/.test(js)) fail("one file's failure stops the rest of the batch");
if (!/function photoToast\(n, target = null\)/.test(js) || !/Show me/.test(js)) fail("the bottom note (N photos sent to RGA · Show me) is gone");
if (!/\.pm-toast \{ position:fixed;/.test(css) || !/\.pm-slot \.thumb\.pm-up\.dim/.test(css)) fail("the upload styles are gone");
// 7 · the weekly customer list (2026-10-09, Chris: "YES" — the same fix): no reload, a true message, its card rebuilds
const custHandler = between('const form = ev.target.closest("form[data-customer-list-form]");', "\n});");   // the handler's own closing line
if (!custHandler) fail("the customer-list handler could not be found");
if (/location\.reload/.test(custHandler)) fail("submitting the customer list reloads the whole portal again");
if (/will start going out automatically/.test(js)) fail("the customer list promises review requests go out automatically — nothing sends them; the client does");
// 🔑 Since step12_review_requests_v1 (10-14) the rebuild is shared: refreshAfterCustomers redraws every card (and step 12's row).
const refresher = between("function refreshAfterCustomers(clientId, lists) {", "\n}\n");
if (!/refreshAfterCustomers\(clientId, lists\);/.test(custHandler) || !refresher || !/card\.replaceWith\(/.test(refresher) || !/loadReviewRequests\(clientId\);/.test(refresher)) fail("the customer card no longer rebuilds itself (and loads its review requests) after a submit");

if (F.length) { console.error("🔴 an upload no longer confirms in its slot:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ an upload confirms in its own slot — preview, real progress, Sent to RGA, then With RGA for review — and nothing reloads");
