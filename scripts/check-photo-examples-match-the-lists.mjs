#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-photo-examples-match-the-lists.mjs
//
// 🔒 WHY (2026-10-09, approved photo_examples_by_industry_v1): Chris — "mockup all the example images and for each
// industry … more detailed … if two or more people then have 2 people type of instructions". Every shot on every list
// and every trade's 3 shots has its own drawing and people count, served from /shared/photo-art/<LIST>.json.
// HOLDS:
//   1. every non-trade shot of every list has a drawing + a people count; every trade has exactly 3
//   2. the served files ARE a fresh build of scripts/photo-examples (kit + scenes) — an edit nobody rebuilt fails here
//   3. artKey: a list shot → "<L>|s|<n>"; the k-th trade slot → "<L>|t|<type>|k"; a pre-industry list → "" (keeps the
//      per-kind drawing, never a wrong one)
//   4. the portal slot and the big example carry the key and fill it; the admin review does too; no silent catch there
// exit 0 = every shot has its drawing · 1 = a drawing is missing, stale or unwired · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const require = createRequire(import.meta.url);
let P, K, S;
try {
  P = require(`${SITE}/netlify/functions/_photo-lists.js`);
  K = require(`${SITE}/scripts/photo-examples/kit.js`);
  S = require(`${SITE}/scripts/photo-examples/scenes.js`);
} catch (e) { console.error(`⚠️  INDETERMINATE — a source did not load: ${e.message}`); process.exit(2); }
const F = []; const fail = (m) => F.push(m);
const svg = (inner) => `<svg viewBox="0 0 240 180" aria-hidden="true" focusable="false">${inner}</svg>`;

let drawings = 0;
for (const [k, L] of Object.entries(P.LISTS)) {
  let f;
  try { f = JSON.parse(read(`shared/photo-art/${k}.json`)); } catch { fail(`shared/photo-art/${k}.json is not valid JSON`); continue; }
  if (f.defs !== K.DEFS) fail(`list ${k}: the shared drawing definitions are stale — run scripts/photo-examples/build-art.js`);
  L.shots.forEach((sh, i) => {
    if (Number.isInteger(sh.trade)) return;
    const d = f.shots?.[i + 1], src = S.SCENES[k + (i + 1)];
    if (!src) return fail(`list ${k} shot ${i + 1} has no scene in scenes.js`);
    if (!d || !d.svg || d.p === undefined) return fail(`list ${k} shot ${i + 1} has no served drawing or people count`);
    if (d.svg !== svg(src[1]()) || d.p !== src[0]) fail(`list ${k} shot ${i + 1}: the served drawing is not a fresh build — run build-art.js`);
    drawings++;
  });
  for (const t of P.TYPES.filter((x) => x.list === k)) {
    const d = f.trades?.[t.type], src = S.TRADE[t.type];
    if (!src || src.length !== 3) { fail(`${t.type} needs exactly 3 trade scenes`); continue; }
    if (!Array.isArray(d) || d.length !== 3) { fail(`${t.type} has no served trade drawings`); continue; }
    d.forEach((x, i) => { if (x.svg !== svg(src[i][1]()) || x.p !== src[i][0]) fail(`${t.type} trade shot ${i + 1}: the served drawing is not a fresh build`); else drawings++; });
  }
}

process.removeAllListeners("warning");
const A = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const shape = { list: "E", type: "Marketing agencies", items: P.buildShotList({ category: "Internet marketing service" }).items };
const tradeNs = shape.items.filter((it) => it.trade).map((it) => it.n);
const want = { 3: "E|s|3", [tradeNs[0]]: "E|t|Marketing agencies|0", [tradeNs[2]]: "E|t|Marketing agencies|2" };
for (const [n, k] of Object.entries(want)) { const got = A.artKey(shape, shape.items.find((it) => it.n === Number(n))); if (got !== k) fail(`artKey for shot ${n} is "${got}", expected "${k}"`); }
if (A.artKey({ items: shape.items }, shape.items[2]) !== "") fail("a shot list from before the industry lists must keep the per-kind drawing (artKey \"\")");

const portal = read("portal/portal.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (!/const exArt = \(it, ex\) => \{ const k = artKey\(shape, (?:it|it\.artFrom \|\| it)\);/.test(portal) || !/data-ex-art=/.test(portal)) fail("portal slots no longer carry their drawing key");
if (!/<span class="pm-ppl" data-ex-ppl=/.test(portal)) fail("portal slots no longer say how many people belong in the photo");
if (!/photoExampleBigHtml\(ex, artKey\(shape, (?:it|it\.artFrom \|\| it)\)\)/.test(portal)) fail("the big example no longer shows the shot's own drawing");
if (!/fillSlotThumbs\(listEl\);\s*fillExampleArt\(listEl\);/.test(portal)) fail("the portal never fills the drawings");
const admin = read("admin/admin.js");
if (!/async function fillPhotoReviewThumbs\(root\) \{\s*fillExampleArt\(root\);/.test(admin) || !/data-ex-art="\$\{escapeAttribute\(k\)\}"/.test(admin)) fail("the admin photo review no longer shows the slot's own drawing");
if (/catch \{ \/\* a missing thumbnail is a grey square, not an error \*\/ \}/.test(admin)) fail("the admin review swallows a failed preview again (a silent grey square)");

if (F.length) { console.error("🔴 the example drawings drifted from the lists:"); for (const f of F.slice(0, 20)) console.error("   · " + f); process.exit(1); }
console.log(`✅ ${drawings} example drawings, one per shot and trade shot, served as a fresh build; portal and admin show them`);
