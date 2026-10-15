#!/usr/bin/env node
// check-photos-fit-the-team.mjs — step 7's shot list fits the client's real team size, and leads with what they can take
// today.
//
// 🔒 WHY (approved step7_photos_today_v1, 2026-10-15). Chris's step-7 screenshots: five slots asked for "3+ people",
// which a solo owner or a two-person business can never fill, and the office shots came first for a business whose
// office isn't ready. Now: the team size is asked once ("Just me" · 2 · 3 to 5 · 6 or more) and refits the EMPTY shots
// that need the client's own staff (never a shot with a customer in it); every fitted shot has its own drawing with the
// right number of people; a slot holding a photo keeps its wording; and a business that goes to its customers sees
// "You can take these today" first, the premises shots folded under "When your space is ready".
// Files only (the real runner and the real portal renderer, faked I/O).
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/flow-execute.js`);
const P = req("./_photo-lists.js");
const ART = (k) => JSON.parse(read(`shared/photo-art/${k}.json`));

// ── 1 · the builder: which shots change, and only those ──
const staffy = /team|crew|second shooter|front-desk/i;
for (const [k, L] of Object.entries(P.LISTS)) {
  const t = P.TYPES.find((x) => x.list === k && x.approved);
  if (!t) continue;
  const base = P.buildShotList({ typeOverride: t.type });
  const one = P.buildShotList({ typeOverride: t.type, teamSize: "1" });
  const two = P.buildShotList({ typeOverride: t.type, teamSize: "2" });
  const big = P.buildShotList({ typeOverride: t.type, teamSize: "6+" });
  if (JSON.stringify(big.items.map((i) => i.do)) !== JSON.stringify(base.items.map((i) => i.do))) fail(`list ${k}: "6 or more" changed the shots`);
  const art = ART(k);
  base.items.forEach((it, i) => {
    const o = one.items[i], w = two.items[i];
    // a staff shot (by its own words) must be refitted for "just me"; a non-staff shot must not be
    // ("a local team you sponsor" isn't staff; "the crew" in the same shot is)
    if (!it.trade && staffy.test(it.do.replace(/a local team you sponsor/i, "")) && !/customer|client|patient|couple|family/i.test(it.do) && !o.fit) fail(`list ${k} shot ${it.n} "${it.do}" still asks for your team when you work alone`);
    if (o.fit && /customer|homeowner|patient|client's|a client|with the customer/i.test(base.items[i].do) && !staffy.test(base.items[i].do)) fail(`list ${k} shot ${it.n}: a shot with a customer in it was refitted`);
    for (const [x, size] of [[o, "1"], [w, "2"]]) {
      if (!x.fit) continue;
      if (x.fit !== size || /\bteam\b|\bcrew\b/i.test(x.do.replace(/a local team you sponsor/i, ""))) fail(`list ${k} shot ${it.n} fitted to ${size} still says "${x.do}"`);
      const key = (ART && !x.trade) ? `${x.n}~${size}` : null;
      // a fitted drawing shows at most that many people (a "just me" vehicle shot may show none)
      if (key) { const d = art.shots[key]; if (!d || !(Number(d.p) <= Number(size))) fail(`list ${k} shot ${it.n}: no "${size}" drawing (or it shows ${d?.p} people)`); }
    }
  });
}
for (const t of P.TYPES.filter((x) => x.teamFit)) {
  const art = ART(t.list);
  for (const [idx, bySize] of Object.entries(t.teamFit)) for (const size of Object.keys(bySize)) {
    const d = art.tradeFit?.[t.type]?.[`${idx}~${size}`];
    if (!d || !(Number(d.p) <= Number(size))) fail(`${t.type} shot ${idx}: no "${size}" drawing (or it shows ${d?.p} people)`);
  }
}
const cpa = P.buildShotList({ typeOverride: "CPAs", teamSize: "1" });
if (!cpa.items.some((i) => i.do === "You during tax season, busy and organized.")) fail("a trade's own staff shot isn't refitted for \"just me\"");

// ── 2 · a held slot keeps its words (endpoint + runner) ──
const T = req("./portal-photo-team.js");
{
  const cur = P.buildShotList({ typeOverride: "Marketing agencies", storefront: false });
  const shape = { ...cur, items: cur.items };
  const out = T.refit(shape, "1", new Set([11]));
  const n11 = out.items.find((i) => i.n === 11), n12 = out.items.find((i) => i.n === 12);
  if (n11.do !== "The team planning at a whiteboard, faces to camera." || n12.do !== "You at your desk, relaxed.") fail(`a slot holding a photo was refitted, or an empty one wasn't (${n11.do} · ${n12.do})`);
}
const flow = read("netlify/functions/flow-execute.js");
if (!/buildShotList\(\{ category, typeOverride: override, storefront, teamSize: current\?\.team_size \|\| null \}\)/.test(flow)) fail("the nightly list rebuild ignores the client's team size");
if (!/if \(held\.size\) L\.items = L\.items\.map\(\(it\) => \(held\.has\(Number\(it\.n\)\) \? \(cur\.items\.find/.test(flow)) fail("the nightly list rebuild rewrites a slot that holds a photo");
const ep = read("netlify/functions/portal-photo-team.js").replace(/^[ \t]*\/\/.*$/gm, "");
if (!/const gate = await requirePortalOwner\(event, clientId\);/.test(ep) || !/if \(!TEAM_SIZES\.includes\(size\)\)/.test(ep) || !/after\?\.tasks\?\.\[STEP\]\?\.team_size !== size/.test(ep)) fail("the team size can be set by someone else, set to anything, or not read back");

// ── 3 · the portal: the question, and what you can take today first ──
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
if (!slotsSrc || !stateSrc || !bigSrc) { console.error("⚠️  INDETERMINATE — could not lift the portal slot renderer"); process.exit(2); }
process.removeAllListeners("warning");
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console };
vm.createContext(pctx);
try { vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\nthis.render = photoSlotsHtml;`, pctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the portal renderer did not load: ${e.message}`); process.exit(2); }
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
{
  const sab = P.buildShotList({ typeOverride: "Marketing agencies", storefront: false, teamSize: "1" });
  const h = pctx.render({ clientForm: "photo_upload" }, { draft_shape: sab, team_size: "1" }, [], "c1");
  const iToday = h.indexOf("You can take these today"), iLater = h.indexOf("When your space is ready");
  if (iToday < 0 || iLater < 0 || iToday > iLater) fail("a business that goes to its customers doesn't see \"You can take these today\" first and the premises shots after");
  const later = h.slice(iLater);
  for (const n of [2, 3, 4, 5, 6, 7, 8, 18]) if (!later.includes(`data-slot="${n}"`)) fail(`premises shot ${n} isn't under "When your space is ready"`);
  if (h.slice(iToday, iLater).includes('data-slot="3"')) fail("a premises shot is in \"You can take these today\"");
  if (!/<details class="pm-later pm-fold" data-fold="later">/.test(h) || !/files these as "Additional" photos/.test(h)) fail("the premises shots aren't folded with the one-line reason");
  if (!/data-team-size="1"[^>]*>Just me/.test(h) || !/class="pm-team-chip on"[^>]*data-team-size="1"/.test(h)) fail("the team-size question isn't there, or doesn't show the saved answer");
  if (!/data-ex-art="E\|s\|11~1"/.test(h)) fail("a fitted shot doesn't carry its own drawing");
  if ((h.match(/class="pm-slot[^"]*" data-slot="/g) || []).length !== 20) fail("the split dropped or duplicated a slot");
  if (!/You planning at a whiteboard, face to camera\./.test(text(h))) fail("the portal doesn't show the fitted wording");
  const shop = P.buildShotList({ typeOverride: "Law firms", storefront: true });
  const hs = pctx.render({ clientForm: "photo_upload" }, { draft_shape: shop }, [], "c1");
  if (/When your space is ready/.test(hs)) fail("a storefront business has its premises shots folded away");
}

if (F.length) { console.error("🔴 step 7's shots don't fit the team, or lead with the wrong ones:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 7 fits the team: staff shots (never customer shots) refit for \"just me\" / \"two of us\", each with its own drawing; 6+ unchanged; a held slot keeps its words (portal + nightly); owner-only, read back; a business that goes to its customers sees what it can take today first, premises shots folded with the reason");
