#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-photo-lists-are-the-researched-ones.mjs
//
// 🔒 WHY (2026-10-09, approved photo_shot_lists_by_industry_v1): Chris — "equipment is saying show computer screen. this
// is for an SEO company how will this be updated to lets say a plumber … research the best images … so when you do
// create this you dont just make it up". The step asked an AI for 20 shots in seven fixed kinds for every client; RGA got
// 13 photos of monitors. Now the list is the researched one for the client's trade, in Google's own categories.
// HOLDS (run against the real _photo-lists.js, the runner, the measurement, the publisher, the portal and the admin):
//   1. every list: 20 shots · one Logo, one Cover · ≥3 Team · ≥3 At work · exactly 3 trade slots · each shot sourced
//      (G/P) with a why · no screens, monitors, dashboards or screenshots · US spelling
//   2. every business type: a list that exists, 3 trade shots; all 48 outreach verticals have a type
//   3. Google categories land on the right type — and a category we have no list for returns NOTHING (never a guess)
//   4. an unapproved list or trade never reaches a client (buildShotList refuses); A + marketing agencies are approved
//   5. a hidden address swaps building shots for vehicle shots, and a public one swaps them back
//   6. the runner builds from _photo-lists (no AI) and hands its shape over; the admin picker names = TYPES names
//   7. the measurement reads every photo by category with done rule B; a publish recounts; the portal fills slots
//      from photos already on Google and marks a full group done
// exit 0 = the lists are the researched ones · 1 = a list drifted · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (r, base = SITE) => { try { return fs.readFileSync(`${base}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const require = createRequire(import.meta.url);
let P;
try { P = require(`${SITE}/netlify/functions/_photo-lists.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — _photo-lists.js did not load: ${e.message}`); process.exit(2); }
const F = []; const fail = (m) => F.push(m);

// 1 · the lists
for (const [k, L] of Object.entries(P.LISTS)) {
  const c = {}; let trade = 0;
  if (L.shots.length !== 20) fail(`list ${k} has ${L.shots.length} shots — the step asks for 20`);
  for (const [i, sh] of L.shots.entries()) {
    c[sh.google] = (c[sh.google] || 0) + 1;
    if (!P.CATEGORY[sh.google]) fail(`list ${k} shot ${i + 1}: "${sh.google}" is not a Google photo category`);
    if (Number.isInteger(sh.trade)) trade++; else if (!sh.do) fail(`list ${k} shot ${i + 1} has no text`);
    if (!/^[GP]$/.test(sh.src || "")) fail(`list ${k} shot ${i + 1} is unsourced — every shot cites Google (G) or practitioner consensus (P)`);
    if (!sh.why) fail(`list ${k} shot ${i + 1} has no why`);
    const text = [sh.do, sh.why, sh.storefront?.do, sh.storefront?.why].filter(Boolean).join(" ");
    if (/\b(monitor|dashboard|screenshot|laptop)\b|\bon (a )?screen\b|\bscreen showing\b/i.test(text)) fail(`list ${k} shot ${i + 1} asks for a screen: "${text.slice(0, 80)}"`);
    if (/\b(centred|colour|organis|favour|catalogue|neighbour)/i.test(text)) fail(`list ${k} shot ${i + 1} is British: "${text.slice(0, 80)}"`);
  }
  if (c.PROFILE !== 1 || c.COVER !== 1) fail(`list ${k} needs exactly one Logo and one Cover`);
  if ((c.TEAMS || 0) < 3 || (c.AT_WORK || 0) < 3) fail(`list ${k} has fewer than 3 Team or At work shots — Google recommends at least 3`);
  if (trade !== 3) fail(`list ${k} has ${trade} trade slots — every list carries exactly 3`);
}
// 2 · the trades
const verticals = JSON.parse(read("config/outreach-verticals.json", SCRAPER)).verticals;
for (const t of P.TYPES) {
  if (!P.LISTS[t.list]) fail(`${t.type} points at list "${t.list}", which does not exist`);
  if (!Array.isArray(t.shots) || t.shots.length !== 3 || t.shots.some((x) => !x)) fail(`${t.type} needs exactly 3 trade shots`);
  for (const x of t.shots || []) if (/\b(monitor|dashboard|screenshot)\b|\bon screen\b/i.test(x)) fail(`${t.type} trade shot asks for a screen: "${x}"`);
}
const names = new Set(P.TYPES.map((t) => t.type.toLowerCase()));
for (const v of verticals) if (![...names].some((n) => n === v.toLowerCase() || n.startsWith(v.toLowerCase()))) fail(`outreach vertical "${v}" has no photo list type`);
// 3 · Google categories → type
const CASES = [["Plumber", "Plumbers"], ["HVAC contractor", "HVAC"], ["Air conditioning contractor", "HVAC"], ["Electrician", "Electricians"],
  ["Roofing contractor", "Roofers"], ["Pest control service", "Pest control"], ["Moving company", "Movers"], ["Auto body shop", "Body shop"],
  ["Auto repair shop", "Auto repair"], ["Tire shop", "Auto repair"], ["Auto glass shop", "Auto glass repair"], ["Dentist", "Cosmetic dentists"],
  ["Medical spa", "Med spas"], ["Personal injury attorney", "Personal injury lawyers"], ["DUI attorney", "DUI lawyers"],
  ["Internet marketing service", "Marketing agencies"], ["Hair salon", "Hair salons"], ["Barber shop", "Hair salons"],
  ["Wedding photographer", "Wedding photographers"], ["Kitchen remodeler", "Kitchen remodeling"], ["Landscaper", "Landscapers"],
  ["Lawyer", null], ["Restaurant", null], ["", null], [null, null]];
for (const [cat, want] of CASES) {
  const got = P.typeForCategory(cat)?.type || null;
  if (got !== want) fail(`Google category "${cat}" picks ${got ? `"${got}"` : "nothing"} — expected ${want ? `"${want}"` : "nothing (RGA picks)"}`);
}
// 4 · approval
const ok = (cat, extra = {}) => P.buildShotList({ category: cat, ...extra });
// 🔄 2026-10-09: Chris approved every list and trade. The refusal is still proven — on a copy flagged unapproved —
// because the next list or trade added starts unapproved.
for (const cat of ["Plumber", "Internet marketing service", "Dentist", "Locksmith", "Roofing contractor", "Hair salon", "Wedding photographer"])
  if (!ok(cat).ok) fail(`"${cat}" is approved but buildShotList refused it (${ok(cat).reason})`);
{
  const L = P.LISTS.D, t = P.typeByName("Cosmetic dentists"), keepL = L.approved, keepT = t.approved;
  L.approved = false; const r1 = ok("Dentist"); L.approved = keepL;
  t.approved = false; const r2 = ok("Dentist"); t.approved = keepT;
  if (r1.ok || r1.reason !== "not_approved") fail("an UNAPPROVED list still builds — a new list would reach clients before Chris sees it");
  if (r2.ok || r2.reason !== "not_approved") fail("an UNAPPROVED trade still builds — a new trade would reach clients before Chris sees it");
}
if (ok("Restaurant").ok || ok("Restaurant").reason !== "no_match") fail("a category with no list must return no_match, never a list");
// 5 · storefront swap
const sab = ok("Plumber", { storefront: false }), shop = ok("Plumber", { storefront: true }), unk = ok("Plumber");
if (!/van/i.test(sab.items?.[2]?.do || "") || !/building/i.test(shop.items?.[2]?.do || "")) fail("a hidden address must ask for the van; a public one for the building");
if (unk.storefront !== false) fail("list A must default to comes-to-you when Google did not say");
if (!sab.items.every((it) => it.google && it.category)) fail("every built shot must carry its Google category and stored category");
const rga = ok("Internet marketing service");
const need = P.categoryNeeds(rga.items);
if (need.TEAMS !== 3 || need.PROFILE !== 1 || need.EXTERIOR !== 3) fail(`done rule B needs ≥3 per category (or all slots): got ${JSON.stringify(need)}`);
// 6 · runner + admin
const flow = read("netlify/functions/flow-execute.js");
const runner = (flow.match(/"m1\.gbp\.photos": async[\s\S]*?\n  },\n/) || [""])[0];
if (!/buildShotList\(/.test(runner) || /aiDraft\(/.test(runner)) fail("the photo step's runner no longer builds from _photo-lists.js (or asks an AI again)");
if (!/draft_shape: result\?\.draft_shape \|\| draftShape\(result\?\.summary\)/.test(flow)) fail("flow-execute drops the runner's own shot-list shape");
const admin = read("admin/admin.js");
const pick = (admin.match(/const PHOTO_LIST_TYPES = \{[\s\S]*?\n\};/) || [""])[0];
const adminNames = [...pick.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((n) => !/ · /.test(n));
const typeNames = P.TYPES.map((t) => t.type);
if (adminNames.sort().join("|") !== [...typeNames].sort().join("|")) fail("the admin's photo-list picker no longer names exactly the business types in _photo-lists.js");
for (const m of pick.matchAll(/"([A-G]) · [^"]+": \[([^\]]*)\]/g)) for (const n of [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])) {
  const t = P.typeByName(n); if (t && t.list !== m[1]) fail(`the admin picker files "${n}" under list ${m[1]}; _photo-lists.js says ${t.list}`);
}
// 7 · measurement, recount, portal
const recheck = read("netlify/functions/portal-step-recheck.js");
if (!/media\?pageSize=100`,/.test(recheck) || !/byCategory\[cat\]/.test(recheck) || !/photoCategoryNeeds\(clientId\)/.test(recheck)) fail("the photo measurement no longer reads every photo by category with done rule B");
if (!/\.\.\.\(probe\.byCategory \? \{ byCategory: probe\.byCategory, need: probe\.need, have: probe\.have, items: probe\.items \}/.test(recheck)) fail("the per-category reading is measured but not kept on the step");
const pub = read("netlify/functions/_photo-publish.js");
if (!/if \(summary\.published && d\.recount\)/.test(pub) || !/step_id: "m1\.gbp\.photos"/.test(pub)) fail("a publish no longer recounts the profile — the step goes stale (\"1 of 20\" with 2 on Google)");
if (!/at_work: "AT_WORK"/.test(pub) || !/exterior: "EXTERIOR"/.test(pub)) fail("the publisher cannot send the lists' Google categories");
const portal = read("portal/portal.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (!/const existingByShot = new Map\(\)/.test(portal) || !/Already on your Google profile/.test(portal)) fail("a confirmed photo already on Google no longer fills its slot in the portal");
if (!/class="pm-sgrp\$\{done \? " done" : ""\}/.test(portal)) fail("a full group no longer shows done");
if (!/const itemCategory = \(it\) => it\.category \|\|/.test(portal)) fail("the portal ignores the shot's own Google category");

if (F.length) { console.error("🔴 the photo lists drifted from the researched ones:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ ${Object.keys(P.LISTS).length} photo lists × 20 researched shots, ${P.TYPES.length} trades, every vertical covered; unknown categories pick nothing; existing Google photos fill slots; a publish recounts`);
