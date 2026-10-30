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
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";   // 10-30: step 10 joined the card system (batch 2) — photoSlotsHtml asks CS_STEPS / csNote / csChips

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// the step 7 renderer reads the shared second-logo rule (second_logo_cleanup_v1), imported by the portal itself
const SECOND_LOGO = await import((await import("node:url")).pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
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
const ctx = { secondLogos: SECOND_LOGO.secondLogos, tidiedByRga: SECOND_LOGO.tidiedByRga, FILED_AS: SECOND_LOGO.FILED_AS, escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console };
vm.createContext(ctx);
try { vm.runInContext(`${planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n"))}\n${csBlock(portal, planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n")))}\n${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml;`, ctx); }
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
// 🔄 10-30 (approved client_step10_photos_v3, card system batch 2 — "ok V3 approved"): ONE card — the band (count · with RGA · to
// retake · to go) → the 20 tiles → the ONE shot open below them → the team question → the shot list → already on Google → "How this
// step works"; "Remind me later" under the card. The folds (and their bar) are now only the waiting state's (the listing isn't open).
const h = ctx.how(step, task, true, photos, "c1", null);
const at = (s) => h.indexOf(s);
const iLine = at('<div class="pm-k5-plan you">'), iTiles = at('<div class="pm-p10-tiles">'), iPanel = at('<div class="pm-p10-panel"'), iTool = at('<div class="pm-tool'), iList = at('<span class="k">The shot list'), iAlso = at('<div class="pm-pc-also">'), iTips = at('<details class="pm-k5-fold pm-tipline"');
if ([iLine, iTiles, iPanel, iTool, iList, iAlso, iTips].some((x) => x < 0) || !(iLine < iTiles && iTiles < iPanel && iPanel < iTool && iTool < iList && iList < iAlso && iAlso < iTips)) fail(`the card isn't: band → tiles → the shot → team question → the shot list → already on Google → tips (${[iLine, iTiles, iPanel, iTool, iList, iAlso, iTips]})`);
if (/<div class="pm-slots[" ]|<details class="pm-sgrp/.test(h)) fail("the open step still draws the folded kinds (client_step10_photos_v3: tiles + one shot)");
if (/pm-how-only|Only you can do this step|pm-how-why|Why it matters:|pm-sec pm-already|Have a batch already/.test(h)) fail("an old block is back above the list (the orange box, \"Why it matters\", the already-on-Google box or the batch bar)");
if (/Only you can take these/.test(text(h))) fail("a line sits above the card again (the band says it)");
if (!/<b>2 of 20 on Google · 2 to retake<\/b><span>18 to go<\/span>/.test(h)) fail("the band isn't \"2 of 20 on Google · 2 to retake · 18 to go\"");
if (!/<summary>How this step works<\/summary>/.test(h.slice(iTips))) fail("the tips fold isn't \"How this step works\" (the card's one fold)");
// ── 2 · the counts say what is true ──
const tileOf = (html, n) => (new RegExp(`<button type="button" class="pm-p10-t([^"]*)" data-p10-t="${n}"[^>]*>[^]*?<span class="lab">([^<]*)</span></button>`).exec(html) || []).slice(1);
const tiles = [...h.matchAll(/data-p10-t="(\d+)" aria-pressed/g)].map((m) => Number(m[1]));
if (tiles.length !== 20 || new Set(tiles).size !== 20) fail(`the tiles aren't the 20 shots, each once (${tiles.length})`);
{ const [c1] = tileOf(h, 1), [c7, l7] = tileOf(h, 7), [c8, l8] = tileOf(h, 8), [c2] = tileOf(h, 2);
  if (!/\bis-on\b/.test(c1 || "") || !/\bis-re\b/.test(c7 || "") || !/\bis-re\b/.test(c8 || "") || l7 !== "Retake" || l8 !== "Retake" || /\bis-(on|re|rga)\b/.test(c2 || "x")) fail(`the tiles don't say what's true (on Google ✓ · Retake · empty): 1 "${c1}" · 7 "${c7}" ${l7} · 8 "${c8}" ${l8} · 2 "${c2}"`); }
if (!text(h.slice(iAlso, iTips)).includes("1 of them was already on Google.")) fail("the card doesn't say \"1 of them was already on Google.\"");
{ const soloH = ctx.how(step, { ...task, detected: { ...detected, n: 3 } }, true, [{ id: "r", shot_n: 9, publish_state: "in_review" }], "c1", null), solo = text(soloH);
  const [c9, l9] = tileOf(soloH, 9);
  if (!/<b>3 of 20 on Google · 1 with RGA for review<\/b><span>17 to go<\/span>/.test(soloH) || /to retake/.test(solo) || !/\bis-rga\b/.test(c9 || "") || l9 !== "With RGA") fail(`a photo with RGA for review isn't counted apart (band "· 1 with RGA for review", its tile "With RGA") (${(/<b>[^<]*of 20[^<]*<\/b>/.exec(soloH) || [""])[0]} · ${c9} ${l9})`); }
if (/noticeably more calls/.test(JSON.stringify(STEP)) || /noticeably more calls/.test(read("data/playbooks/playbooks.json"))) fail("the unsourced \"20+ photos get noticeably more calls\" is back in step 7");
if (!h.slice(iTips).includes(esc(STEP.clientHow.why))) fail("the tips' Why no longer holds why it matters");
// ── 3 · a retake is never out of sight: the one shot open is the first retake ──
const shown = [...h.matchAll(/<div class="pm-p10-shot" data-p10-shot="(\d+)"( hidden)?>/g)].filter((m) => !m[2]).map((m) => Number(m[1]));
if (shown.join() !== "7" || !/class="pm-p10-t is-re is-sel" data-p10-t="7" aria-pressed="true"/.test(h) || !/<div class="pm-p10-shot" data-p10-shot="7"><div class="pm-p10-hd">[^]*?<div class="pm-slot turned" data-slot="7">/.test(h)) fail(`the shot open isn't the first retake (shown: ${shown.join(", ") || "none"})`);
{ const calm = ctx.how(step, task, true, photos.filter((p) => p.publish_state !== "turned_down"), "c1", null);
  const sh = [...calm.matchAll(/<div class="pm-p10-shot" data-p10-shot="(\d+)"( hidden)?>/g)].filter((m) => !m[2]).map((m) => m[1]);
  if (sh.join() !== "2" || /is-re/.test(calm)) fail(`with nothing to retake the shot open isn't the first empty one (${sh.join(", ")})`); }
if (!/if \(d\.hasAttribute\("data-fold-held"\)\) return;/.test(portal)) fail("what this device remembered can fold a retake away again");
// while the listing waits the step is still the folds — the kind holding a retake opens itself there
{ const wait = ctx.how(step, task, true, photos, "c1", { open: false, duplicates: [{ name: "locations/2" }] });
  if (!/<details class="pm-sgrp pm-acc[^"]*has-re" data-fold="kind:interior" open data-fold-held>/.test(wait)) fail("while the listing waits, the kind holding a retake stays folded"); }
// ── 4 · the toolbar holds the team question; "Add N at once" lives in each kind's empty shots ──
const tool = h.slice(iTool, iList);
if (!/data-photo-team/.test(tool) || !/How many people are in your business\?/.test(tool) || /data-batch|<select/.test(tool)) fail("the toolbar isn't just the team question (the batch upload lives in each kind's shot)");
const many = (n) => { const a = h.indexOf(`data-p10-shot="${n}"`); if (a < 0) return null; const b = h.indexOf('<div class="pm-p10-shot"', a + 10); const m = /<div class="pm-kind-up pm-p10-many">.*?Add (\d+) at once<input[^>]*data-batch[^>]*data-cat="([^"]+)" data-empty="([^"]*)"/s.exec(h.slice(a, b < 0 ? undefined : b)); return m ? { n: m[1], cat: m[2], empty: m[3] } : null; };
const team = many(9), work = many(14), interior = many(6);
if (!team || team.n !== "5" || team.empty !== "9,10,11,12,13" || team.cat !== "team") fail(`Team doesn't offer its own "Add 5 at once" into its empty shots (${JSON.stringify(team)})`);
if (!work || work.n !== "7" || work.empty !== "14,15,16,17,18,19,20") fail(`At work doesn't offer its own batch for all 7 empty shots (${JSON.stringify(work)})`);
if (!interior || interior.empty !== "6,7,8") fail(`a kind with retakes doesn't count the retake shots as room (${JSON.stringify(interior)})`);
if (many(1) || many(2)) fail("a full kind, or a kind with one shot, offers a batch");
const ask = ctx.how(step, { ...task, team_size: null }, true, photos, "c1", null);
if (!/<div class="pm-tool ask">/.test(ask) || !/How many people are in your business\?/.test(ask)) fail("before it's answered, the toolbar doesn't ask the whole question, outlined");
// ── 4b · "Not ready yet? Remind me later" sits under the card, only on the client's move ──
if (!(h.indexOf('<div class="pm-k5-acts pm-later-under"><div class="pm-later-ctl"') > iTips) || !/Not ready to take photos yet\? <b>Remind me later<\/b>/.test(h)) fail("\"Remind me later\" isn't the quiet action under the card");
if (/Remind me later/.test(ctx.how(step, task, false, photos, "c1", null))) fail("\"Remind me later\" shows on a step that isn't the client's move");
// the control's wrapper must not reuse the "When your space is ready" fold's class (it drew a dashed box, 10-15)
if (/<div class="pm-later"[ >]/.test(h)) fail("\"Remind me later\" reuses the later-shots fold's class (a dashed box around it)");

// ── 5 · drawn in Chrome with the shipped stylesheet (a card-system row: .pm-cs): nothing spills, one shot on screen and it's the
// retake, the tile states drawn in their own colours ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  for (const w of [976, 400]) {
    await page.setViewport({ width: w, height: 900 });
    await page.setContent(`<html><body style="margin:0"><div class="pm-step-ground"><div class="pm-step-row pm-cs is-now"><div id=h style="padding:0 16px">${h}</div></div></div></body></html>`);
    await page.addStyleTag({ content: read("portal/portal.css") });
    const r = await page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.checkVisibility());
      const look = (sel) => { const e = document.querySelector(`${sel} .im`); if (!e) return "missing"; const c = getComputedStyle(e); return `${c.backgroundColor}|${c.boxShadow}|${c.borderTopStyle}`; };
      return { spill: document.documentElement.scrollWidth > innerWidth + 1, shots: vis(".pm-p10-shot").map((e) => e.dataset.p10Shot), retake: vis(".pm-slot.turned .pm-retake-line").length /* the row is display:contents in the panel — its retake line shows */, reTiles: vis(".pm-p10-t.is-re").length,
        on: look('.pm-p10-t.is-on'), re: look('.pm-p10-t.is-re:not(.is-sel)'), empty: look('.pm-p10-t:not(.is-on):not(.is-re):not(.is-rga):not(.is-sel)'), tilesW: Math.round(document.querySelector(".pm-p10-tiles").getBoundingClientRect().right) <= innerWidth };
    });
    if (r.spill || !r.tilesW) fail(`step 10's card spills sideways at ${w}px`);
    if (r.shots.join() !== "7" || r.retake !== 1) fail(`at ${w}px the shot on screen isn't the retake alone (${r.shots.join(", ")} · ${r.retake} retake rows)`);
    if (r.reTiles !== 2) fail(`at ${w}px ${r.reTiles} of 2 retake tiles are on screen`);
    if (new Set([r.on, r.re, r.empty]).size !== 3 || [r.on, r.re, r.empty].includes("missing")) fail(`the tile states aren't drawn apart (on ${r.on} · retake ${r.re} · empty ${r.empty})`);
  }
} finally { await browser.close(); }

if (F.length) { console.error("🔴 step 7's top isn't the approved calm top:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 10's card is calm (client_step10_photos_v3): band (on Google · with RGA · to retake · to go) → 20 tiles that say what's true → the ONE shot open (the first retake, else the first empty) → the team question (the full question until answered) → the shot list → already on Google → How this step works; \"Add N at once\" in each kind's empty shots; \"Remind me later\" under the card on the client's move; no unsourced claim; while the listing waits a retake kind is held open; drawn in Chrome at 976 and 400px without spilling. Was: step 7's top is calm: one plain line (only on the client's move), one progress panel that says what's true (on Google · with RGA · to retake · still to take, the bar at their real share, the already-on-Google photos folded in), the toolbar is the team question (the full question until answered); \"upload several\" in each kind with 2+ empty slots; \"Remind me later\" under the plain line on the client's move, one tips line whose Why holds why it matters, no unsourced claim; a retake is never folded away; drawn in Chrome at 976 and 400px without spilling");
