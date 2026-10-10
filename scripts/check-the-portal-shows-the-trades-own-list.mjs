#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-portal-shows-the-trades-own-list.mjs
//
// 🔒 WHY (2026-10-09): Chris — "make sure that the system is wired to show the correct list depending on the industry
// for the client in the portal". Only ONE real client exists (RGA), so "it works for RGA" proves nothing about a
// plumber or a dentist. This runs the REAL step 7 runner (lifted from flow-execute.js) against faked Google answers for
// many trades, hands its real output to the REAL portal slot renderer (lifted from portal.js), and reads what a
// client of that trade would see.
// HOLDS, per trade:
//   1. the runner picks the trade from the Google category, and the hidden address decides van vs building shots
//   2. the portal renders that trade's own 20 shots — its 3 trade shots by name — with that list's drawings
//   3. RGA's pick overrides the category; a category with no list sends NOTHING and the portal shows no slots
//   4. a changed category never switches a list under photos already in its slots (unless RGA picked)
//   5. Google unreachable → the stored business type still gives the right list
// exit 0 = every client sees its own trade's list · 1 = a client would see the wrong list · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/flow-execute.js`);
const P = req("./_photo-lists.js");

// ── the real runner ──
const flow = read("netlify/functions/flow-execute.js");
const a = flow.indexOf('  "m1.gbp.photos": async ({ client }) => {'), b = flow.indexOf('  "m1.gbp.hours_attributes": async');
if (a < 0 || b < 0) { console.error("⚠️  INDETERMINATE — could not lift the m1.gbp.photos runner"); process.exit(2); }
const runnerSrc = flow.slice(a, b);
async function runRunner({ category, storefront, businessType, record = {}, photosInSlots = 0, googleDown = false }) {
  const ctx = {
    require: req, console: { error() {}, log() {}, warn() {} },
    supa: async (path) => {
      if (path.startsWith("/client_onboarding_records")) return [{ data: record }];
      if (path.startsWith("/client_photos")) return Array.from({ length: photosInSlots }, (_, i) => ({ id: `p${i}` }));
      return [];
    },
    loadOauth: async () => ({ gbp_location_id: "locations/123", gbp_account_id: "accounts/9" }),
    googleAccessToken: async () => "tok",
    fetch: async () => googleDown ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ categories: { primaryCategory: { displayName: category } }, ...(storefront ? { storefrontAddress: { addressLines: ["1 Main St"], locality: "Culver City" } } : {}) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(`this.R = {\n${runnerSrc}\n};`, ctx);
  return ctx.R["m1.gbp.photos"]({ client: { id: "c1", business_type: businessType ?? category } });
}

// ── the real portal slot renderer ──
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails");
const stateSrc = cut("const PHOTO_STATE = {", "\n\n");
const bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
if (!slotsSrc || !stateSrc || !bigSrc) { console.error("⚠️  INDETERMINATE — could not lift the portal slot renderer"); process.exit(2); }
process.removeAllListeners("warning");
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const ART = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: ART.artKey, console };
vm.createContext(pctx);
try { vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\nthis.render = photoSlotsHtml;`, pctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the portal renderer did not load: ${e.message}`); process.exit(2); }
const render = (shape) => pctx.render({ clientForm: "photo_upload" }, { draft_shape: shape }, [], "c1");
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ── the trades ──
const CASES = [
  { category: "Plumber", storefront: false, type: "Plumbers", list: "A", see: ["A water heater you installed", "Your van from the side"] },
  { category: "Plumber", storefront: true, type: "Plumbers", list: "A", see: ["Your building from the street", "A drain camera"] },
  { category: "HVAC contractor", storefront: false, type: "HVAC", list: "A", see: ["A new condenser on its pad"] },
  { category: "Roofing contractor", storefront: false, type: "Roofers", list: "B", see: ["The crew on a roof in harnesses"] },
  { category: "Auto body shop", storefront: true, type: "Body shop", list: "C", see: ["A car in the paint booth", "The service bays"] },
  { category: "Dentist", storefront: true, type: "Cosmetic dentists", list: "D", see: ["A dental chair and room", "The waiting room"] },
  { category: "Personal injury attorney", storefront: true, type: "Personal injury lawyers", list: "E", see: ["An attorney at the local courthouse"] },
  { category: "Attorney", storefront: true, type: "Law firms", list: "E", see: ["Reviewing case files at a desk"] },
  { category: "Internet marketing service", storefront: false, type: "Marketing agencies", list: "E", see: ["Photographing a client's business"] },
  { category: "Hair salon", storefront: true, type: "Hair salons", list: "F", see: ["A cut or color in progress"] },
  { category: "Wedding photographer", storefront: false, type: "Wedding photographers", list: "G", see: ["A ceremony moment"] },
  { category: "General contractor", storefront: false, type: "General contractors", list: "B", see: ["The crew framing or building"] },
];
let rendered = 0;
for (const c of CASES) {
  const label = `${c.category}${c.storefront ? " (shop)" : " (comes to you)"}`;
  const out = await runRunner(c);
  const s = out?.draft_shape;
  if (!s || s.type !== c.type || s.list !== c.list) { fail(`${label}: the runner built ${s ? `${s.type}/${s.list}` : "nothing"}, expected ${c.type}/${c.list}`); continue; }
  if (s.storefront !== c.storefront) fail(`${label}: the runner read the address wrong (storefront=${s.storefront})`);
  const html = render(s), txt = textOf(html);
  const slots = (html.match(/class="pm-slot[^"]*" data-slot="/g) || []).length;
  if (slots !== 20) fail(`${label}: the portal shows ${slots} slots, not 20`);
  for (const w of c.see) if (!txt.includes(w)) fail(`${label}: the portal does not show "${w}"`);
  const t = P.typeByName(c.type);
  for (const shot of t.shots) if (!txt.includes(shot.replace(/\s*\(.*\)\s*$/, ""))) fail(`${label}: trade shot "${shot}" missing from the portal`);
  if (!new RegExp(`class="pm-ex-art" data-ex-art="${c.list}\\|t\\|${c.type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\|0"`).test(html)) fail(`${label}: the trade shots don't carry ${c.type}'s own drawings`);
  if (/computer screen|monitor/i.test(txt) && c.type !== "Marketing agencies") fail(`${label}: a screen shot reached a ${c.type} client`);
  rendered++;
}
// RGA's pick overrides the category
{ const out = await runRunner({ category: "Plumber", storefront: false, record: { photo_list: { type: "Roofers", set_at: "2026-10-09T00:00:00Z" } } });
  if (out?.draft_shape?.type !== "Roofers") fail(`RGA picked Roofers for a "Plumber" profile, but the runner built ${out?.draft_shape?.type}`); }
// no list → nothing reaches the client
{ const out = await runRunner({ category: "Restaurant", storefront: true });
  if (out?.draft_shape || out?.outcome !== "manual_required") fail("a category with no list still produced a shot list");
  if (render(null) !== "" && render(undefined) !== "") fail("the portal renders slots with no list"); }
// a category change never switches a list under photos in its slots
{ const cur = (await runRunner({ category: "Plumber", storefront: false })).draft_shape;
  const out = await runRunner({ category: "Roofing contractor", storefront: false, photosInSlots: 2, record: { tasks: { "m1.gbp.photos": { draft_shape: cur, ran_at: "2026-10-09T01:00:00Z" } } } });
  if (out?.draft_shape?.type !== "Plumbers" || out?.outcome !== "manual_required") fail("a changed Google category switched the list under photos already in its slots");
  const out2 = await runRunner({ category: "Roofing contractor", storefront: false, photosInSlots: 0, record: { tasks: { "m1.gbp.photos": { draft_shape: cur, ran_at: "2026-10-09T01:00:00Z" } } } });
  if (out2?.draft_shape?.type !== "Roofers") fail("with no photos in slots, a changed category did not rebuild the list"); }
// Google unreachable → the stored business type still decides
{ const out = await runRunner({ category: "Plumber", businessType: "Dentist", storefront: false, googleDown: true });
  if (out?.draft_shape?.type !== "Cosmetic dentists" || out?.draft_shape?.from !== "the client record") fail("with Google unreachable, the stored business type no longer decides the list"); }

if (F.length) { console.error("🔴 a client would see the wrong photo list:"); for (const f of F.slice(0, 25)) console.error("   · " + f); process.exit(1); }
console.log(`✅ ${rendered} trades run through the real runner and the real portal: each client sees its own trade's 20 shots and drawings; RGA's pick wins; no list means no slots; photos never get switched under`);
