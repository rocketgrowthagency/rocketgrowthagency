#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-every-mutation-still-applies.mjs
//
// 🔒 WHY (2026-10-13): a mutation suite proves its gate CAN fail by breaking one line of the product and watching the
// gate go red. When the product changes under that line, the anchor stops matching, run-mutations skips it ("anchor
// matched 0×, mutation not applied"), and the suite proves nothing about that defect. run-mutations is not part of the
// daily check, so nobody saw it: 6 such mutations on 10-09, 20 across 14 suites by 10-13, one of them hiding a gate
// that had gone half blind (check-a-plan-can-satisfy-its-own-step read nothing for the photo step for 4 days).
// HOLDS: every mutation in every suite names a known target, and its anchor matches that file EXACTLY once — the
// same test run-mutations applies, with the same target map (lib/mutation-targets.mjs). Static and fast, so it runs
// daily; whether each gate CATCHES its mutation is still run-mutations' job.
// exit 0 = every mutation still applies · 1 = one or more went blind · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES } from "./lib/mutation-targets.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const DIR = process.env.MUTATIONS_DIR || `${HERE}/mutations`;

let suites;
try { suites = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort(); }
catch { console.error(`⚠️  INDETERMINATE — cannot read ${DIR}`); process.exit(2); }
if (suites.length < 10) { console.error(`⚠️  INDETERMINATE — only ${suites.length} suites found in ${DIR}`); process.exit(2); }

const blind = [], cache = new Map();
let n = 0;
const text = (abs) => {
  if (!cache.has(abs)) { try { cache.set(abs, fs.readFileSync(abs, "utf8")); } catch { cache.set(abs, null); } }
  return cache.get(abs);
};
for (const file of suites) {
  let muts;
  try { muts = JSON.parse(fs.readFileSync(`${DIR}/${file}`, "utf8")); }
  catch (e) { blind.push(`${file}: the suite doesn't parse (${e.message.slice(0, 60)})`); continue; }
  if (!Array.isArray(muts)) { blind.push(`${file}: the suite isn't a list`); continue; }
  for (const m of muts) {
    n++;
    const [name, which, find] = m;
    const rel = FILES[which];
    if (!rel) { blind.push(`${file} · "${name}": unknown target "${which}" (add it to lib/mutation-targets.mjs)`); continue; }
    const abs = rel.startsWith("scraper:") ? `${SCRAPER}/${rel.slice(8)}` : `${SITE}/${rel}`;
    const src = text(abs);
    if (src == null) { blind.push(`${file} · "${name}": its target ${rel} doesn't exist`); continue; }
    if (typeof find !== "string" || !find) { blind.push(`${file} · "${name}": no anchor`); continue; }
    const c = src.split(find).length - 1;
    if (c !== 1) blind.push(`${file} · "${name}": the anchor matches ${rel} ${c}× (must be exactly 1) — re-aim it at today's code`);
  }
}

if (blind.length) {
  console.error(`🔴 ${blind.length} of ${n} mutations no longer apply, so their suites prove nothing about those defects:`);
  for (const b of blind) console.error("   · " + b);
  console.error("   Then run: node scripts/run-mutations.mjs <suite> — an anchor that applies must also be CAUGHT.");
  process.exit(1);
}
console.log(`✅ all ${n} mutations in ${suites.length} suites still apply (each anchor matches its file exactly once)`);
