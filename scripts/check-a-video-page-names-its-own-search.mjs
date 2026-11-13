#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-video-page-names-its-own-search.mjs
//
// 🔒 WHY (Chris 11-13, screenshot of /v/plastic-surgery-institute/): the page said "based on the search 'Plastic
// surgeons in Culver City, CA'" over a video of the Beverly Hills search (rank #31 THERE). build-video-landing took
// the CRM's Search Term first, which is where the lead was FIRST found (08-19), so every lead re-filmed from another
// search named the wrong city. The rank already used "the scrape the video was built from" (08-24); the wording now
// uses the same rule. This holds it:
//   1. the page's searchTerm asks searchTermAtVideoTime FIRST, the CRM only after;
//   2. every step-2 row's search goes into searchTermHistory;
//   3. the REAL searchTermAtVideoTime on files with real mtimes: the newest CSV that existed when the MP4 was
//      written wins, a CSV written after the video never does, and no CSV means null (the CRM fallback).
// exit 0 = the page names its video's search · 1 = it can name another search · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the mutation runner points this at its mutated copy
let src;
try { src = fs.readFileSync(path.join(ROOT, "build-video-landing.mjs"), "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read build-video-landing.mjs"); process.exit(2); }
const F = [];

// 1. the order of sources
const line = (src.match(/const searchTerm = searchTermAtVideoTime\([^\n]*\n[^\n]*;/) || [])[0];
if (!line) F.push("the page's searchTerm no longer starts with searchTermAtVideoTime (the CRM's first-found search wins again)");
else if (!/\|\| airtableRecord\?\.fields\?\.\["Search Term"\]/.test(line)) F.push("the CRM's Search Term is no longer the fallback after the video's own search");
if (/const searchTerm = airtableRecord\?\.fields\?\.\["Search Term"\]/.test(src)) F.push("a searchTerm still reads the CRM's Search Term FIRST");

// 2. every row's search is kept with its file time
if (!/if \(sterm\) \(searchTermHistory\[s\] \|\| \(searchTermHistory\[s\] = \[\]\)\)\.push\(\{ mtime: fileMtime, term: sterm \}\);/.test(src))
  F.push("step-2 rows no longer record their search with the CSV's time (searchTermHistory)");

// 3. the real function, on real files
const fm = src.match(/function searchTermAtVideoTime[\s\S]*?\n}\n/);
if (!fm) { console.error("⚠️  INDETERMINATE — searchTermAtVideoTime not found"); process.exit(2); }
let pick;
try { pick = new Function("fs", `${fm[0]}\nreturn searchTermAtVideoTime;`)(fs); } catch (e) { console.error(`⚠️  INDETERMINATE — it does not load: ${e.message}`); process.exit(2); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rga-term-"));
const video = path.join(dir, "01_x.mp4"); fs.writeFileSync(video, "");
const vt = Date.now() / 1000; fs.utimesSync(video, vt, vt);
const H = (agoSec, term) => ({ mtime: (vt - agoSec) * 1000, term });
const CASES = [
  ["first found in Culver City (Aug), re-filmed from Beverly Hills (today)", [H(86400 * 86, "Plastic surgeons in Culver City, CA"), H(420, "Plastic surgeons in Beverly Hills, CA")], "Plastic surgeons in Beverly Hills, CA"],
  ["a scrape written AFTER the video never names it", [H(3600, "Locksmiths in El Segundo, CA"), H(-7200, "Locksmiths in Hawthorne, CA")], "Locksmiths in El Segundo, CA"],
  ["the same run's CSV a few seconds after the MP4 counts (60s slack)", [H(86400, "Roofers in Pasadena, CA"), H(-30, "Roofers in Glendale, CA")], "Roofers in Glendale, CA"],
  ["no CSV before the video: null, so the CRM fallback is used", [H(-600, "Plumbers in Santa Monica, CA")], null],
  ["no history at all: null", [], null],
];
for (const [name, hist, want] of CASES) {
  let got; try { got = pick(hist, video); } catch (e) { F.push(`${name}: threw ${e.message}`); continue; }
  if (got !== want) F.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
if (pick([H(10, "x")], path.join(dir, "missing.mp4")) !== null) F.push("a missing video file must give null, not a guess");
fs.rmSync(dir, { recursive: true, force: true });

if (F.length) {
  console.log(`❌ A VIDEO PAGE CAN NAME A SEARCH ITS VIDEO WAS NOT MADE FROM (${F.length}):`);
  for (const x of F) console.log("   • " + x);
  process.exit(1);
}
console.log(`✅ a video page names the search its video was made from (${CASES.length + 1} cases on real file times; the CRM's first-found search is only the fallback)`);
process.exit(0);
