#!/usr/bin/env node
// check-step-7-top-is-calm.mjs — step 7's top is one plain line, one progress panel, one toolbar and one tips line, then
// the list; the counts say what is true; a retake is never folded out of sight; the batch picker opens on a kind you
// can take today.
//
// 🔒 WHY (approved step7_streamlined_v1 v2, 2026-10-15). Chris: "the top section of step 7 has a lot going on". Six
// blocks stood between the title and the first slot: an orange "Only you can do this step" box, the count, "Why it
// matters" (with an unsourced "20+ photos get noticeably more calls"), the already-on-Google box, the tip cards, the team
// question and the batch bar. And "2 to retake, marked below" pointed at two retakes folded under "When your space is
// ready", while the picker opened on Cover, a folded premises kind. Rendered by the portal's own photoSlotsHtml (lifted),
// then drawn in Chrome with the shipped portal.css.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const P = createRequire(`${SITE}/netlify/functions/flow-execute.js`)("./_photo-lists.js");
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
const howSrc = cut("function photoReviewTail(step, photos) {", "\n// ============== PHOTO UPLOAD");
if (!slotsSrc || !stateSrc || !bigSrc || !howSrc) { console.error("⚠️  INDETERMINATE — could not lift the step 7 renderer"); process.exit(2); }
process.removeAllListeners("warning");
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console };
vm.createContext(ctx);
try { vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// the real step 7, from the SOP the portal reads
const steps = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return null; } if (o && typeof o === "object") { if (o.id === "m1.gbp.photos") return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const STEP = find(steps);
if (!STEP?.clientHow) { console.error("⚠️  INDETERMINATE — step 7 (m1.gbp.photos) has no clientHow in client-steps.json"); process.exit(2); }
const step = { ...STEP, clientForm: "photo_upload" };
const shape = P.buildShotList({ typeOverride: "Marketing agencies", storefront: false, teamSize: "1" });
const detected = { n: 2, threshold: 20, source: "google_profile", items: [{ name: "g/1", category: "EXTERIOR", at: "2025-12-02T00:00:00Z" }] };
const turned = (n) => ({ id: `t${n}`, shot_n: n, publish_state: "turned_down", review_note: "This is a test image, not a real photo of your office, so we didn't send it to Google.\nHow to fix: Upload a real photo of your own space, taken with your phone.", reviewed_by: "RGA" });
const photos = [turned(7), turned(8), { id: "p1", shot_n: 1, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-09T00:00:00Z", storage_path: "x" }];
const task = { draft_shape: shape, team_size: "1", detected };

// ── 1 · the order and the pieces ──
const h = ctx.how(step, task, true, photos, "c1", null);
const at = (s) => h.indexOf(s);
const iLine = at('<p class="pm-p2-sub">'), iPanel = at('<div class="pm-p2" data-photo-progress>'), iTool = at('<div class="pm-tool'), iTips = at('<details class="pm-tipline"'), iList = at('<div class="pm-slots');
if ([iLine, iPanel, iTool, iTips, iList].some((x) => x < 0) || !(iLine < iPanel && iPanel < iTool && iTool < iTips && iTips < iList)) fail(`the top isn't: plain line → progress panel → toolbar → tips line → the list (${[iLine, iPanel, iTool, iTips, iList]})`);
if (/pm-how-only|Only you can do this step|pm-how-why|Why it matters:|pm-sec pm-already|Have a batch already/.test(h)) fail("an old block is back above the list (the orange box, \"Why it matters\", the already-on-Google box or the batch bar)");
if (!/Only you can take these\. Upload them below and we handle the rest\./.test(text(h))) fail("the plain line under the title is missing");
if (/Only you can take these/.test(ctx.how(step, task, false, photos, "c1", null))) fail("\"Only you can take these\" shows on a step that isn't the client's move");
// ── 2 · the counts say what is true ──
const panel = text(h.slice(iPanel, iTool));
for (const want of ["2 of 20 on your Google profile", "18 to go", "2 on Google", "2 to retake, marked below", "16 still to take", "1 of them was already on Google."]) if (!panel.includes(want)) fail(`the progress panel doesn't say "${want}" (${panel.slice(0, 200)})`);
if (!/<i class="ok" style="width:10%"><\/i><i class="re" style="width:10%"><\/i>/.test(h)) fail("the bar doesn't show on-Google (green) and to-retake (amber) at their real share");
{ const solo = text(ctx.how(step, { ...task, detected: { ...detected, n: 3 } }, true, [{ id: "r", shot_n: 9, publish_state: "in_review" }], "c1", null));
  if (!solo.includes("1 with RGA for review") || !solo.includes("16 still to take") || /to retake/.test(solo)) fail("a photo with RGA for review isn't counted apart from what's still to take"); }
if (/noticeably more calls/.test(JSON.stringify(STEP)) || /noticeably more calls/.test(read("data/playbooks/playbooks.json"))) fail("the unsourced \"20+ photos get noticeably more calls\" is back in step 7");
if (!h.slice(iTips, iList).includes(esc(STEP.clientHow.why))) fail("the tips' Why no longer holds why it matters");
// ── 3 · a retake is never folded out of sight ──
if (!/<details class="pm-later pm-fold" data-fold="later" open data-fold-held>/.test(h)) fail("\"When your space is ready\" stays folded while it holds a retake");
if (/data-fold-held/.test(ctx.how(step, task, true, photos.filter((p) => p.publish_state !== "turned_down"), "c1", null))) fail("\"When your space is ready\" is held open with nothing to retake");
if (!/if \(d\.hasAttribute\("data-fold-held"\)\) return;/.test(portal)) fail("what this device remembered can fold a retake away again");
// ── 4 · the toolbar holds the team question; "upload several" lives in each kind (step7_later_and_upload_v1 v2) ──
const tool = h.slice(iTool, iTips);
if (!/data-photo-team/.test(tool) || !/People in your business/.test(tool) || /data-batch|<select/.test(tool)) fail("the toolbar isn't just the team question (the batch upload moved into each kind)");
const kindUp = (key) => { const a = h.indexOf(`data-fold="${key}"`); if (a < 0) return null; const b = h.indexOf("</details>", a); const m = /<div class="pm-kind-up">.*?Upload up to (\d+) at once<input[^>]*data-batch[^>]*data-cat="([^"]+)" data-empty="([^"]*)"/s.exec(h.slice(a, b)); return m ? { n: m[1], cat: m[2], empty: m[3] } : null; };
const team = kindUp("kind:team"), work = kindUp("kind:at-work"), interior = kindUp("kind:interior:later");
if (!team || team.n !== "5" || team.empty !== "9,10,11,12,13" || team.cat !== "team") fail(`Team doesn't offer its own "Upload up to 5 at once" into its empty slots (${JSON.stringify(team)})`);
if (!work || work.n !== "6") fail(`At work (today) doesn't offer its own batch for its 6 empty slots (${JSON.stringify(work)})`);
if (!interior || interior.empty !== "6,7,8") fail(`a kind with retakes doesn't count the retake slots as room (${JSON.stringify(interior)})`);
if (kindUp("kind:logo") || kindUp("kind:cover:later")) fail("a full kind, or a kind with one slot, offers a batch");
const ask = ctx.how(step, { ...task, team_size: null }, true, photos, "c1", null);
if (!/<div class="pm-tool ask">/.test(ask) || !/How many people work in your business\?/.test(ask)) fail("before it's answered, the toolbar doesn't ask the whole question, outlined");
// ── 4b · "Not ready yet? Remind me later" sits under the plain line, only on the client's move ──
if (!(h.indexOf('<div class="pm-later-ctl"') > iLine && h.indexOf('<div class="pm-later-ctl"') < iPanel) || !/Not ready to take photos yet\? <b>Remind me later<\/b>/.test(h)) fail("\"Remind me later\" isn't under the plain line");
if (/Remind me later/.test(ctx.how(step, task, false, photos, "c1", null))) fail("\"Remind me later\" shows on a step that isn't the client's move");
// the control's wrapper must not reuse the "When your space is ready" fold's class (it drew a dashed box, 10-15)
if (/<div class="pm-later"[ >]/.test(h.slice(0, iPanel))) fail("\"Remind me later\" reuses the later-shots fold's class (a dashed box around it)");

// ── 5 · drawn in Chrome with the shipped stylesheet: nothing spills, the toolbar is one row at card width ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  for (const w of [976, 400]) {
    await page.setViewport({ width: w, height: 900 });
    await page.setContent(`<html><body style="margin:0"><div class="pm-step-ground"><div class="pm-step-row is-now"><div id=h style="padding:0 16px">${h}</div></div></div></body></html>`);
    await page.addStyleTag({ content: read("portal/portal.css") });
    const r = await page.evaluate(() => {
      const later = document.querySelector(".pm-later");
      const retake = [...document.querySelectorAll('.pm-slot.turned')].filter((e) => e.checkVisibility()).length;
      return { spill: document.documentElement.scrollWidth > innerWidth + 1, retake, laterOpen: later?.open,
        bar: getComputedStyle(document.querySelector(".pm-p2-bar i.re")).backgroundColor, ok: getComputedStyle(document.querySelector(".pm-p2-bar i.ok")).backgroundColor };
    });
    if (r.spill) fail(`step 7's top spills sideways at ${w}px`);
    if (r.retake !== 2) fail(`at ${w}px ${r.retake} of 2 retakes are on screen`);
    if (r.bar === r.ok || /rgba\(0, 0, 0, 0\)/.test(r.bar + r.ok)) fail(`the bar's colours aren't drawn (${r.ok} / ${r.bar})`);
  }
} finally { await browser.close(); }

if (F.length) { console.error("🔴 step 7's top isn't the approved calm top:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 7's top is calm: one plain line (only on the client's move), one progress panel that says what's true (on Google · with RGA · to retake · still to take, the bar at their real share, the already-on-Google photos folded in), the toolbar is the team question (the full question until answered); \"upload several\" in each kind with 2+ empty slots; \"Remind me later\" under the plain line on the client's move, one tips line whose Why holds why it matters, no unsourced claim; a retake is never folded away; drawn in Chrome at 976 and 400px without spilling");
