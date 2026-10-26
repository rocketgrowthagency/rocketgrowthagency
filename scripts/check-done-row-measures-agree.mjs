#!/usr/bin/env node
// check-done-row-measures-agree.mjs — 2026-10-26 (done_without_record_v2, Chris: "document all and save to memory so we never forget
// or regress"). THREE places decide whether a done row "says something": the portal's own blank-row fallback (DONE_STRIP in
// portal.js), the browser gate check-a-done-step-is-never-the-ask, and the daily walk's "Every done step shows its record". Each
// strips the chrome (buttons, the conversation, the how-to…) and measures what is left.
// 🔴 10-26: the cards build moved "How this step works" INSIDE the card (details.pm-k5-fold). None of the three strip lists knew it,
// so all three counted the how-to as a record: steps 7–10, done with nothing saved, showed ONLY the how-to and every check was green.
// This gate holds the three lists together: each strips everything the portal's list strips, each strips the in-card fold under
// the class pcFold ACTUALLY draws (read from the code, not a literal), and the gate + walk both refuse our bookkeeping words.
//   exit 0 holds · 1 the measures disagree · 2 code moved
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const ME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCR = process.env.SCRAPER_COPY_DIR || ME;
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { console.log(`⚠️  INDETERMINATE — can't read ${p}`); process.exit(2); } };
const P = read(path.join(SITE, "portal/portal.js"));
const WALK = read(path.join(SCR, "scripts/acceptance-walk.mjs"));
const GATE = read(path.join(SCR, "scripts/check-a-done-step-is-never-the-ask.mjs"));
const F = [];
const sel = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const strip = P.match(/^const DONE_STRIP = "([^"]+)";/m);
if (!strip) { console.log("⚠️  INDETERMINATE — DONE_STRIP moved"); process.exit(2); }
const portalList = sel(strip[1]);
// the class the in-card how-to is drawn with, from the code that draws it
const fold = (P.match(/^const pcFold = [^\n]*<details class="([\w-]+)"/m) || [])[1];
if (!fold) { console.log("⚠️  INDETERMINATE — pcFold moved"); process.exit(2); }
// the walk's and the gate's strip lists: the querySelectorAll(…).forEach((x) => x.remove()) on the cloned row
const listOf = (src, name) => {
  const m = [...src.matchAll(/c\.querySelectorAll\("([^"]+)"\)\.forEach\(\(x\) => x\.remove\(\)\)/g)];
  if (m.length !== 1) { console.log(`⚠️  INDETERMINATE — ${name}'s done-row strip list moved (${m.length} found)`); process.exit(2); }
  return sel(m[0][1]);
};
const walkList = listOf(WALK, "the walk"), gateList = listOf(GATE, "the gate");
const foldSel = `details.${fold}`;
if (!portalList.includes(foldSel)) F.push(`the portal's blank-row fallback counts the in-card how-to (${foldSel}) as a record`);
for (const [name, list] of [["the walk", walkList], ["the gate", gateList]]) {
  const missing = portalList.filter((s) => !list.includes(s));
  if (missing.length) F.push(`${name} doesn't strip what the portal strips: ${missing.join(", ")}`);
  if (!list.includes(foldSel)) F.push(`${name} counts the in-card how-to (${foldSel}) as a record`);
}
// both refuse our bookkeeping on a done card (done_without_record_v2)
const BK = ["Marked done", "not on record", "before this page", "Not recorded"];
for (const [name, src] of [["the walk", WALK], ["the gate", GATE]]) {
  const re = src.match(/\/Marked done\|not on record\|before this page\|Not recorded\/i/);
  if (!re) F.push(`${name} no longer refuses our bookkeeping words (${BK.join(" · ")}) on a done row`);
}
if (!/\.pm-k5-plan\.you, \.gcard\.you/.test(GATE) || !/\.pm-k5-prog/.test(GATE)) F.push("the gate no longer finds the ask by its STATE (a your-move card · the building tracker)");
if (F.length) { console.log("🔴 the done-row measures disagree:"); for (const f of F) console.log("   · " + f); process.exit(1); }
console.log(`✅ the three done-row measures agree: portal fallback · browser gate · daily walk each strip ${portalList.length} chrome selectors incl. the in-card how-to (${foldSel}); gate + walk refuse "Marked done / not on record / Not recorded"; the gate finds the ask by state`);
