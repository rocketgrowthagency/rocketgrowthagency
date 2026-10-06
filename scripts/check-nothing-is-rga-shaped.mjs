#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE PRODUCT IS CLIENT-SHAPED, NOT RGA-SHAPED
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"make sure all bugs have locked fixes and this is for ALL clients and not just
 * for RGA only. we need all test work to apply to any business and not just RGA."*
 *
 * 🔑 RGA is **client row #1**, onboarding itself — it is the only row in `clients`. That is exactly
 * the condition under which a hardcoded market, keyword or coordinate is invisible: every screen
 * looks right because the one client happens to match the constant.
 *
 * Two different things wear the same name and only one is a defect:
 *   · RGA as the **AGENCY** — the sender address, the domain, the report letterhead. Correct.
 *   · RGA as a **CLIENT** — its market, its keyword, its pin, its place id. A defect: the next
 *     client gets RGA's data.
 *
 * Exit 0 pass · 1 a client's data is baked in, or a query is not client-scoped · 2 could not run.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W = `${__SITE}/`;
const FILES = [
  "netlify/functions/flow-execute.js",
  "netlify/functions/v2-rank-grid-background.js",
  "netlify/functions/v2-brain-analysis-background.js",
  "admin/admin.js",
  "portal/portal.js",
];
let src;
try { src = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(W + f, "utf8")])); }
catch (e) { console.error("⛔ cannot read a source: " + e.message); process.exit(2); }

const fail = [];
// A comment is commentary; only live code can ship a constant to a client.
const strip = (s) => s.split("\n").map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? "" : l.replace(/\s\/\/\s.*$/, ""))).join("\n");

// ── 1 · NO CLIENT DATA AS A CONSTANT ────────────────────────────────────────────────────────
// 🔑 These are RGA's own CLIENT facts. Any of them in live code means the next client inherits them.
const CLIENT_DATA = [
  [/Culver City/, "RGA's market"],
  [/34\.02047|34\.0211|-118\.4117|-118\.3965/, "RGA's grid coordinates"],
  [/ChIJ51uYDIL6vQsRc0CbVFYFCmw/, "RGA's Google place id"],
  [/["'`]seo company["'`]/i, 'RGA\'s tracked keyword as a literal value'],
  [/Mar Vista|Playa Vista/, "RGA's locked sub-locations"],
];
// 🔑 THE AGENCY'S OWN LETTERHEAD IS NOT CLIENT DATA. Registered, so it is a decision and not a hole.
const AGENCY_OK = [
  { file: "netlify/functions/_fga-report-builder.js", needle: "Rocket Growth Agency &middot; Culver City, CA",
    why: "the FGA report footer — RGA's own address on RGA's own report" },
];
for (const [f, text] of Object.entries(src)) {
  const live = strip(text);
  live.split("\n").forEach((l, i) => {
    for (const [re, what] of CLIENT_DATA) {
      if (!re.test(l)) continue;
      if (AGENCY_OK.some((a) => a.file === f && l.includes(a.needle))) continue;
      fail.push(`${f}:${i + 1} hardcodes ${what} — the next client would inherit it: ${l.trim().slice(0, 64)}`);
    }
  });
}

// ── 2 · EVERY CLIENT QUERY IS SCOPED TO A CLIENT ────────────────────────────────────────────
// 🔴 `/clients?...limit=1` WITHOUT a scope means "whichever row is first" — which is RGA today and
// somebody else tomorrow. It must be scoped by id, portal_slug or workspace.
for (const [f, text] of Object.entries(src)) {
  const live = strip(text);
  for (const m of live.matchAll(/\/clients\?([^`"'\s]*)/g)) {
    const q = m[1];
    if (/(^|&)(id|portal_slug|workspace_id)=eq\./.test(q)) continue;
    if (/select=[^&]*&?$/.test(q) && !/limit=/.test(q)) continue;   // a LIST query is not a pick
    fail.push(`${f} queries /clients?${q.slice(0, 54)} without scoping to a client — it would pick whichever row is first`);
  }
}

// ── 3 · A BRAND-NEW CLIENT DEGRADES HONESTLY ────────────────────────────────────────────────
// 🔑 Client #2 has no locked plan, no sub-locations and maybe no market. Each must produce a
// REFUSAL or a documented default — never RGA's values, and never a confident wrong number.
const flow = src["netlify/functions/flow-execute.js"];
const grid = src["netlify/functions/v2-rank-grid-background.js"];
if (!/if \(!plan\) \{/.test(flow)) fail.push("a client with no locked plan is not refused — the grid would scan a placeholder");
if (!/client\.primary_market \|\| "their stated market"/.test(flow)) fail.push("a client with no market no longer gets a safe fallback in the keyword prompt");
if (!/let reachKm = 5, locationsUsed = \[\];/.test(grid)) fail.push("a client with no sub-locations loses the 5 km floor");
if (!/let anchorKind = "none";/.test(grid)) fail.push("a client whose listing is not found gets no anchor state");
// 🔴 and the centre is resolved from THEIR name + THEIR market, never a constant
if (!/`\$\{businessName\} \$\{primaryLocation\}`/.test(grid)) fail.push("the grid centre is no longer derived from the client's own name and market");

if (fail.length) {
  console.error("🔴 the product is RGA-shaped in places — the next client would inherit it:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ no client's data is baked in, every /clients query is scoped, and a brand-new client degrades honestly (${FILES.length} files)`);
