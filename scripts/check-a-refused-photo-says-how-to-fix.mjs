#!/usr/bin/env node
// check-a-refused-photo-says-how-to-fix.mjs — when a photo comes back to the client (Google refused it, or RGA turned it
// down), the slot says why AND how to fix it; when the fix is RGA's, the client is told nothing is needed; and Google's
// raw text never reaches the client's screen.
//
// 🔒 WHY (approved photo_google_said_no_v1, 2026-10-15). Chris: "we tell them how to resolve the issue if an image was
// rejected with reason and the resolution in the note so the client knows how to resolve it." Before: a Google refusal
// read "With RGA for review" whoever had to fix it, RGA was never told, an older list printed Google's raw text, and an
// RGA turn-down could be sent with a reason but no fix.
//
// Files only; the slot note is drawn with the shipped portal.css in real Chrome.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js"), admin = read("admin/admin.js"), css = read("portal/portal.css");
const strip = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
const pc = strip(portal), ac = strip(admin);
const pick = (src, re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };

// ── 1 · the one table: every client-fixable reason has plain words and a fix; unknown is RGA's ──
const { classifyRefusal, clientNote, RULES } = createRequire(`${SITE}/netlify/functions/`)("./_photo-refusal.js");
for (const r of RULES) if (r.who === "client" && (!r.said || !r.fix)) fail(`a reason the client fixes has no ${!r.said ? "plain words" : "How to fix"} (${r.re})`);
if (classifyRefusal("Something Google has never said before").who !== "rga") fail("an unknown Google reason is handed to the client (it must go to RGA)");
if (classifyRefusal("Photo tag 'interior' does not apply to this location").who !== "rga_auto") fail("the photo-type refusal isn't RGA's automatic fix");
if (!/\nHow to fix: /.test(clientNote({ said: "a", fix: "b" }))) fail("the client's note isn't '<reason>\\nHow to fix: <fix>'");

// ── 2 · the portal: reads who said it, never prints Google's raw text ──
if (!/review_note, reviewed_by, created_at"\)/.test(portal)) fail("the portal doesn't fetch reviewed_by, so it can't say whether Google or RGA sent the photo back");
if (/escapeHtml\(p\.publish_error\)/.test(pc)) fail("the portal prints Google's raw refusal text again");
if (!/failed: \{ cls: "other", label: "With RGA · a Google issue" \}/.test(pc)) fail("a refusal RGA fixes doesn't read \"With RGA · a Google issue\"");
if (!/after: turned \? photoBackNoteHtml\(turned\)/.test(pc)) fail("a returned slot doesn't use the reason + how-to-fix note");
const noteFn = pick(portal, /^function photoBackNoteHtml\(/m), esc = pick(portal, /^function escapeHtml\(/m);
if (!noteFn || !esc) { console.error("⚠️  INDETERMINATE — photoBackNoteHtml / escapeHtml moved"); process.exit(2); }

// ── 3 · the admin: every turn-down carries how to fix it ──
const presets = (/const PHOTO_TURN_DOWN_REASONS = \[([\s\S]*?)\n\];/.exec(admin) || [])[1] || "";
const rows = [...presets.matchAll(/\["([^"]+)", "([^"]*)", "([^"]*)"\]/g)];
if (rows.length < 6) fail(`the admin's turn-down reasons aren't [label, what's wrong, how to fix] (${rows.length} found)`);
for (const [, label, why, fix] of rows) if (label !== "Other" && (!why || !fix)) fail(`the turn-down reason "${label}" has no ${!why ? "reason" : "How to fix"}`);
if (!rows.some(([, label]) => /outside|where the slot/i.test(label))) fail("there's no reason for a photo not taken where the slot asks (Chris's example: must be taken outside)");
if (!/if \(!fix\) \{ setBanner\("Say how to fix it/.test(ac) || !/const note = `\$\{why\}\\nHow to fix: \$\{fix\}`;/.test(ac)) fail("an RGA turn-down can be sent without telling the client how to fix it");
if (!/data-photo-td-fixtext=/.test(ac)) fail("the admin's preview of what the client sees has no How to fix line");

// ── 4 · drawn ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: `${esc}\n${noteFn}` });
  const r = await page.evaluate(() => {
    const draw = (p) => { const h = document.getElementById("h"); h.innerHTML = photoBackNoteHtml(p); const n = h.querySelector(".pm-turned"); return n ? { lines: [...n.children].map((c) => c.textContent.trim()), x: h.querySelectorAll("script,img").length } : null; };
    return {
      google: draw({ reviewed_by: "Google", review_note: "This photo is too small for Google.\nHow to fix: Send the original from your camera." }),
      rga: draw({ reviewed_by: "hello@rocketgrowthagency.com", review_note: "This slot needs a photo taken outside.\nHow to fix: Take it outside, from the street." }),
      old: draw({ reviewed_by: "hello@rocketgrowthagency.com", review_note: "An older note with no fix line." }),
      none: draw({ reviewed_by: "Google", review_note: "" }),
      evil: draw({ reviewed_by: "Google", review_note: "<img src=x onerror=1>\nHow to fix: <script>1</script>" }),
    };
  });
  if (!r.google || r.google.lines.join("|") !== "Google said: This photo is too small for Google.|How to fix: Send the original from your camera.") fail(`a Google refusal doesn't read "Google said" + "How to fix" (${JSON.stringify(r.google)})`);
  if (!r.rga || r.rga.lines.join("|") !== "From RGA: This slot needs a photo taken outside.|How to fix: Take it outside, from the street.") fail(`an RGA turn-down doesn't read "From RGA" + "How to fix" (${JSON.stringify(r.rga)})`);
  if (!r.old || r.old.lines.length !== 1) fail("an older turn-down note (no fix line) doesn't render on its own");
  if (r.none) fail("an empty note draws an empty box");
  if (!r.evil || r.evil.x) fail("a note's text became HTML");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 a photo that comes back doesn't say how to fix it:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ a returned photo says why and how to fix it ("Google said" / "From RGA" + "How to fix"), RGA's own fixes read "With RGA · a Google issue", Google's raw text never reaches the client, and every one of ${rows.length - 1} RGA turn-down reasons carries its fix (photo_google_said_no_v1)`);
