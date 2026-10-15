#!/usr/bin/env node
// check-step-7-kinds-fold.mjs — step 7's kinds fold closed with their own bar; a retake is never folded away; the opened
// tips are one short list; uploads still show in the header; the toolbar wraps on purpose; on a phone nothing is cut off.
//
// 🔒 WHY (approved step7_sections_fold_v1, 2026-10-15). Chris, after "Just me": "each section needs accordion and shows
// not expanded as default. it gets very long. also the 1/5 or 2/5 type showing on bar". Building it found the live step
// cutting every "+ Add photo" off by 45–96px on a 390px phone. Rendered by the portal's own photoSlotsHtml and
// clientHowHtml (lifted), then drawn in Chrome with the shipped portal.css; the upload helpers run against that DOM.
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
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf("{", m.index); k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
const howSrc = cut("function photoReviewTail(step, photos) {", "\n// ============== PHOTO UPLOAD");
const helpers = [pick(/^function groupUploading\(/m), pick(/^function bumpGroupCount\(/m)];
if (!slotsSrc || !stateSrc || !bigSrc || !howSrc || helpers.some((h) => !h)) { console.error("⚠️  INDETERMINATE — could not lift step 7's renderer or its upload helpers"); process.exit(2); }
process.removeAllListeners("warning");
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console };
vm.createContext(ctx);
try { vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }

const steps = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return null; } if (o && typeof o === "object") { if (o.id === "m1.gbp.photos") return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const STEP = find(steps);
if (!STEP?.clientHow) { console.error("⚠️  INDETERMINATE — step 7 has no clientHow"); process.exit(2); }
const step = { ...STEP, clientForm: "photo_upload" };
const shape = P.buildShotList({ typeOverride: "Marketing agencies", storefront: false, teamSize: "1" });
const turned = (n) => ({ id: `t${n}`, shot_n: n, publish_state: "turned_down", review_note: "Not a real photo of your office.\nHow to fix: Upload a real photo of your own space.", reviewed_by: "RGA" });
const photos = [turned(7), turned(8), { id: "p1", shot_n: 1, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-09T00:00:00Z", storage_path: "x" }, { id: "p9", shot_n: 9, publish_state: "in_review", storage_path: "y" }];
const task = { draft_shape: shape, team_size: "1", detected: { n: 2, threshold: 20, source: "google_profile" } };
const h = ctx.how(step, task, true, photos, "c1", null);

// ── 1 · every kind is a fold; closed unless it holds a retake ──
const folds = [...h.matchAll(/<details class="pm-sgrp pm-acc([^"]*)" data-fold="([^"]+)"([^>]*)>/g)].map((m) => ({ cls: m[1], key: m[2], attrs: m[3] }));
if (folds.length !== 7) fail(`expected 7 kind folds (Logo, Team, At work · Cover, Exterior, Interior, At work), found ${folds.length}`);
if (/<div class="pm-sgrp/.test(h)) fail("a kind is still an always-open block");
if (new Set(folds.map((f) => f.key)).size !== folds.length) fail(`two folds share a remembered state (${folds.map((f) => f.key).join(", ")})`);
const interior = folds.find((f) => f.key === "kind:interior:later"), team = folds.find((f) => f.key === "kind:team"), logo = folds.find((f) => f.key === "kind:logo");
if (!interior || !/ open data-fold-held/.test(interior.attrs) || !/has-re/.test(interior.cls)) fail("the kind holding two retakes isn't held open");
if (folds.filter((f) => f !== interior).some((f) => / open/.test(f.attrs))) fail("a kind with nothing to retake opens by default");
const sec = (key) => { const i = h.indexOf(`data-fold="${key}"`); return h.slice(i, h.indexOf("</summary>", i)); };
if (!/<span class="acc-re">2 to retake<\/span>/.test(sec("kind:interior:later"))) fail("the retake kind's line doesn't say \"2 to retake\"");
if (!/class="acc-bar done"[^>]*><i style="width:100%">/.test(sec("kind:logo")) || !/acc-n done"><span class="pm-tick"[^>]*>✓<\/span>1 of 1/.test(sec("kind:logo")) || !/ done/.test(logo?.cls || "")) fail("a finished kind doesn't show a full green bar and ✓ 1 of 1");
if (!/<i style="width:20%"><\/i><\/span><span class="acc-n">1 of 5<\/span>/.test(sec("kind:team"))) fail(`a kind with a photo going in doesn't show its share ("1 of 5", 20%): ${sec("kind:team").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}`);
if ((h.match(/class="pm-slot[^"]*" data-slot="/g) || []).length !== 20) fail("the folds dropped or duplicated a slot");
// ── 2 · the opened tips are one short list ──
const ti = h.indexOf('<details class="pm-tipline"'), tips = h.slice(ti, h.indexOf("</details>", ti));
if ((tips.match(/class="tl-row"/g) || []).length !== 3 || /class="pm-tip"/.test(tips) || !/<em>How: /.test(tips)) fail("the opened tips aren't one short list of three with their How");

// ── 3 · in Chrome: the upload helpers, the toolbar, phone widths ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const ask = ctx.how(step, { ...task, team_size: null }, true, photos, "c1", null);
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const draw = async (w, html) => {
    await page.setViewport({ width: w, height: 900 });
    await page.setContent(`<html><body style="margin:0"><div class="pm-step-ground"><div class="pm-step-row is-now"><div id=h style="padding:0 16px">${html}</div></div></div></body></html>`);
    await page.addStyleTag({ content: read("portal/portal.css") });
  };
  await draw(976, h);
  await page.addScriptTag({ content: helpers.join("\n") });
  const up = await page.evaluate(() => {
    const list = document.getElementById("h"), row = list.querySelector('[data-slot="10"]'), team = row.closest("details");
    const closed = !team.open;
    row.insertAdjacentHTML("beforeend", '<span class="pm-up"></span>');
    groupUploading(list, 3);
    const note = team.querySelector(".acc-meta .pm-uping")?.textContent || "";
    bumpGroupCount(row);
    return { closed, opened: team.open, note, n: team.querySelector(".acc-n").textContent, w: team.querySelector(".acc-bar i").style.width };
  });
  if (!up.closed || !up.opened) fail("a batch going into a folded kind doesn't open it");
  if (!/3 uploading/.test(up.note)) fail(`the "uploading" note isn't on the kind's line (${up.note})`);
  if (up.n !== "2 of 5" || up.w !== "40%") fail(`a photo going in doesn't move the kind's count and bar (${up.n}, ${up.w})`);
  for (const w of [390, 430, 600, 768, 976]) {
    for (const [label, html] of [["answered", h], ["unanswered", ask]]) {
      await draw(w, html);
      const r = await page.evaluate(() => {
        document.querySelectorAll("details").forEach((d) => { d.open = true; });
        const cut = [...document.querySelectorAll(".pm-slot .add, .pm-slot .st")].filter((a) => a.checkVisibility()).filter((a) => { const s = a.closest(".pm-slot").getBoundingClientRect(), b = a.getBoundingClientRect(); return b.right > s.right + 1 || b.right > innerWidth; }).map((a) => a.closest(".pm-slot").dataset.slot);
        const t = document.querySelector(".pm-tool"), q = t.querySelector(".pm-tool-q").getBoundingClientRect(), u = t.querySelector(".pm-tool-up").getBoundingClientRect(), T = t.getBoundingClientRect();
        const wrapped = u.top > q.top + 6;
        // the row's natural width: each half's children + their gaps, plus the gap between the halves
        const nat = (e) => { const k = [...e.children].filter((c) => c.checkVisibility()); const g = parseFloat(getComputedStyle(e).columnGap) || 0; return k.reduce((a, c) => a + c.getBoundingClientRect().width, 0) + g * Math.max(0, k.length - 1); };
        const cs = getComputedStyle(t), inner = T.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        // it may wrap up to ~30px early (the CSS thresholds sit ~20px above the measured row so a wider font never wraps it without
        // the divider); wrapping with more room than that is the bug
        const fits = nat(t.querySelector(".pm-tool-q")) + (parseFloat(cs.columnGap) || 0) + nat(t.querySelector(".pm-tool-up")) <= inner - 30;
        return { spill: document.documentElement.scrollWidth > innerWidth + 1, cut, wrapped, fits, inner: Math.round(inner), rightAligned: Math.abs(u.right - (T.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth))) < 4, divider: getComputedStyle(t.querySelector(".pm-tool-up")).borderTopStyle };
      });
      if (r.spill) fail(`step 7 spills sideways at ${w}px (${label})`);
      if (r.cut.length) fail(`at ${w}px a slot's button is cut off (slots ${[...new Set(r.cut)].join(", ")})`);
      // wraps only when the row can't fit (a little slack either side of the measured thresholds)
      if (r.wrapped && r.fits && r.inner > 0) fail(`at ${w}px the toolbar wraps though its row fits (${label}, ${r.inner}px)`);
      if (r.wrapped && (!r.rightAligned || r.divider !== "solid")) fail(`at ${w}px the wrapped upload isn't on its own right-aligned line under a divider (${label})`);
      if (!r.wrapped && r.divider === "solid") fail(`at ${w}px the toolbar shows a divider without wrapping (${label})`);
    }
  }
} finally { await browser.close(); }

if (F.length) { console.error("🔴 step 7's kinds don't fold the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 7's kinds fold: closed by default, each with its own bar and \"x of n\" (green ✓ when on Google), a retake kind held open and saying so, one remembered state per fold, all 20 slots kept; the opened tips are one short list; a batch opens its kind and moves its count and bar; the toolbar wraps on purpose; at 390–976px nothing spills and no button is cut off");
