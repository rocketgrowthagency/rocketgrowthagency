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
import { planCardKit } from "./lib/plan-card-kit.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// the step 7 renderer reads the shared second-logo rule (second_logo_cleanup_v1), imported by the portal itself
const SECOND_LOGO = await import((await import("node:url")).pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
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
const ctx = { secondLogos: SECOND_LOGO.secondLogos, tidiedByRga: SECOND_LOGO.tidiedByRga, FILED_AS: SECOND_LOGO.FILED_AS, escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console };
vm.createContext(ctx);
try { vm.runInContext(`${planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n"))}\n${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml;`, ctx); }
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
// 🔄 one list (photo_kinds_equal_v1): six kinds, each once — Logo, Cover, Exterior, Interior, Team, At work
if (folds.length !== 6) fail(`expected 6 kind folds (Logo, Cover, Exterior, Interior, Team, At work), found ${folds.length}`);
if (/<div class="pm-sgrp/.test(h)) fail("a kind is still an always-open block");
if (new Set(folds.map((f) => f.key)).size !== folds.length) fail(`two folds share a remembered state (${folds.map((f) => f.key).join(", ")})`);
const interior = folds.find((f) => f.key === "kind:interior"), team = folds.find((f) => f.key === "kind:team"), logo = folds.find((f) => f.key === "kind:logo");
if (!interior || !/ open data-fold-held/.test(interior.attrs) || !/has-re/.test(interior.cls)) fail("the kind holding two retakes isn't held open");
if (folds.filter((f) => f !== interior).some((f) => / open/.test(f.attrs))) fail("a kind with nothing to retake opens by default");
const sec = (key) => { const i = h.indexOf(`data-fold="${key}"`); return h.slice(i, h.indexOf("</summary>", i)); };
if (!/<span class="acc-re">2 to retake<\/span>/.test(sec("kind:interior"))) fail("the retake kind's line doesn't say \"2 to retake\"");
// 🔄 10-15 (Chris: "make the 4/5 like how it is in admin so they match"): "x / n", the admin card's bar and count
if (!/<i style="width:100%"><\/i><\/span><span class="acc-n">1 \/ 1<\/span>/.test(sec("kind:logo")) || !/ done/.test(logo?.cls || "")) fail("a finished kind doesn't show a full bar and \"1 / 1\"");
if (!/<i style="width:20%"><\/i><\/span><span class="acc-n">1 \/ 5<\/span>/.test(sec("kind:team"))) fail(`a kind with a photo going in doesn't show its share ("1 / 5", 20%): ${sec("kind:team").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}`);
if ((h.match(/class="pm-slot[^"]*" data-slot="/g) || []).length !== 20) fail("the folds dropped or duplicated a slot");
// ── 2 · the opened tips are one short list ──
const ti = h.indexOf('<details class="pm-k5-fold pm-tipline"'),   // 🔄 10-26: the tips are the plan card's fold (steps_6_20_clean_v1)
     _ti0 = 0, tips = h.slice(ti, h.indexOf("</details>", ti));
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
  if (up.n !== "2 / 5" || up.w !== "40%") fail(`a photo going in doesn't move the kind's count and bar (${up.n}, ${up.w})`);
  // ── every kind's bar and count line up; "2 to retake" sits beside the name (Chris 10-15: "retake should go on left side
  // so all the 3/3 line up") ──
  await draw(976, h);
  const line = await page.evaluate(() => {
    const r = (e) => e.getBoundingClientRect();
    const out = [];
    for (const box of document.querySelectorAll(".pm-slots, .pm-later")) {
      const sums = [...box.querySelectorAll(":scope > details.pm-acc > summary, :scope > .pm-acc > summary")];
      const bars = sums.map((x) => Math.round(r(x.querySelector(".acc-bar")).left)), ns = sums.map((x) => Math.round(r(x.querySelector(".acc-n")).right));
      if (new Set(bars).size > 1 || new Set(ns).size > 1) out.push(`bars ${bars.join(",")} · counts ${ns.join(",")}`);
    }
    const re = document.querySelector(".acc-re");
    // 🔄 10-26 (steps_6_20_clean_v1): the row shows the count, not the bar — the chip sits beside the name, left of the count
    const chipLeft = re ? r(re).right < r(re.closest("summary").querySelector(".acc-n")).left && re.previousElementSibling?.tagName === "B" : false;
    return { out, chipLeft };
  });
  if (line.out.length) fail(`the kinds' bars and counts don't line up: ${line.out.join(" | ")}`);
  if (!line.chipLeft) fail("\"2 to retake\" isn't beside the kind's name, left of the bar");
  // ── the bar and count look exactly like admin's Onboarding card header, in every state ──
  const adminCss = read("admin/admin.css");
  const look = (bar, fill, cnt) => { const b = getComputedStyle(bar), f = getComputedStyle(fill), c = getComputedStyle(cnt); return { w: b.width, h: b.height, r: b.borderRadius, track: b.backgroundColor, fill: f.backgroundColor, size: c.fontSize, color: c.color, weight: c.fontWeight, nums: c.fontVariantNumeric }; };
  const adminLook = async (cls) => {
    await page.setContent(`<html><body><div class="ob-phase ${cls}"><button class="ob-ph-h" type="button"><span class="ob-ph-state"></span><span class="ob-ph-name">Kind</span><span class="ob-ph-bar"><i style="width:40%"></i></span><span class="ob-ph-cnt">2 / 5</span></button></div></body></html>`);
    await page.addStyleTag({ content: adminCss });
    return page.evaluate(`(${look.toString()})(document.querySelector(".ob-ph-bar"), document.querySelector(".ob-ph-bar i"), document.querySelector(".ob-ph-cnt"))`);
  };
  const portalLook = async (key, open) => {
    await draw(976, h);
    return page.evaluate(`(() => { const d = document.querySelector('[data-fold="${key}"]'); d.open = ${open}; return (${look.toString()})(d.querySelector(".acc-bar"), d.querySelector(".acc-bar i"), d.querySelector(".acc-n")); })()`);
  };
  for (const [state, adminCls, key, open] of [["closed, in progress", "", "kind:team", false], ["open, in progress", "open", "kind:team", true], ["complete", "is-complete", "kind:logo", false], ["open, complete", "open is-complete", "kind:logo", true]]) {
    const a = await adminLook(adminCls), p = await portalLook(key, open);
    const diff = Object.keys(a).filter((k) => a[k] !== p[k]);
    if (diff.length) fail(`the ${state} kind doesn't look like admin's card: ${diff.map((k) => `${k} ${p[k]} ≠ admin ${a[k]}`).join(" · ")}`);
  }
  for (const w of [390, 430, 600, 768, 976]) {
    for (const [label, html] of [["answered", h], ["unanswered", ask]]) {
      await draw(w, html);
      const r = await page.evaluate(() => {
        document.querySelectorAll("details").forEach((d) => { d.open = true; });
        const cut = [...document.querySelectorAll(".pm-slot .add, .pm-slot .st")].filter((a) => a.checkVisibility()).filter((a) => { const s = a.closest(".pm-slot").getBoundingClientRect(), b = a.getBoundingClientRect(); return b.right > s.right + 1 || b.right > innerWidth; }).map((a) => a.closest(".pm-slot").dataset.slot);
        const ku = [...document.querySelectorAll(".pm-kind-up")].filter((e) => e.checkVisibility()).some((e) => e.getBoundingClientRect().right > e.closest("details").getBoundingClientRect().right + 1);
        return { spill: document.documentElement.scrollWidth > innerWidth + 1, cut, kindUpCut: ku, toolHasUpload: !!document.querySelector(".pm-tool [data-batch]") };
      });
      if (r.spill) fail(`step 7 spills sideways at ${w}px (${label})`);
      if (r.cut.length) fail(`at ${w}px a slot's button is cut off (slots ${[...new Set(r.cut)].join(", ")})`);
      if (r.kindUp) fail(`at ${w}px a kind's "upload several" row is cut off (${label})`);
      if (r.kindUpCut) fail(`at ${w}px a kind's "upload several" row is cut off (${label})`);
      if (r.toolHasUpload) fail(`the toolbar still carries an upload (${label})`);
    }
  }
} finally { await browser.close(); }

if (F.length) { console.error("🔴 step 7's kinds don't fold the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 7's kinds fold: closed by default, each with its own bar and \"x / n\" styled exactly like admin's Onboarding cards in all four states (closed, open, complete, open + complete), a retake kind held open and saying so, one remembered state per fold, all 20 slots kept; the opened tips are one short list; a batch opens its kind and moves its count and bar; \"upload several\" sits in its kind and the toolbar carries none; at 390–976px nothing spills and no button is cut off");
