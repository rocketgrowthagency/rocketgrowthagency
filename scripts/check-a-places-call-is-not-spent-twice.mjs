#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A PLACES LOOKUP IS NOT SPENT TWICE FOR THE SAME ANSWER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `admin-onboarding-autofill` called `enrichAuditRecord` UNCONDITIONALLY at the top of its handler.
 * The saved snapshot was merged in AFTERWARDS, so the spend had already happened before anything
 * checked whether we already had the answer. Places SearchText is capped at **32 a day** — deliberate
 * blast-radius protection after the $755 spike that got Google Cloud billing suspended — and nothing
 * stopped an admin pressing Autofill ten times while filling one form.
 *
 * 🔑 Rule 4 of the billing runbook: CACHE ANYTHING THAT CANNOT CHANGE. A business's address, category
 * and review count do not move between two presses of a button a minute apart.
 * → feedback_google_cloud_billing_safety · project_places_searchtext_quota_ceiling
 *
 * WHAT IS PINNED — the properties, not the spellings:
 *   1. The cache is READ BEFORE the billed call, not after. Order is the whole defect.
 *   2. The billed call is CONDITIONAL on the cache missing.
 *   3. A miss WRITES the result, or every press is a miss forever.
 *   4. The freshness window is a sane finite number.
 *   5. A cache hit does not describe itself as a live scan.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = path.join(SITE, "netlify", "functions", "admin-onboarding-autofill.js");
const fail = [], pass = [];

if (!fs.existsSync(F)) { console.error("⚠️  INDETERMINATE — admin-onboarding-autofill.js not found."); process.exit(2); }
const raw = fs.readFileSync(F, "utf8");
// 🔴 The comments here quote the defect in detail — strip them, or the gate passes on the prose that
// describes the fix rather than the code performing it.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
if (code.length < 3000) { console.error(`⚠️  INDETERMINATE — only ${code.length} bytes of code.`); process.exit(2); }

console.log("── the cache is read BEFORE the billed call ──");
{
  const read = code.indexOf("readCachedEnrichment(");
  const spend = code.indexOf("enrichAuditRecord(enrichmentRecord)");
  if (read < 0) { fail.push("no cache read before the Places lookup"); console.log("  🔴 readCachedEnrichment is gone"); }
  else if (spend < 0) { console.log("  ▫️  enrichAuditRecord call site not found by name — checking conditionality only"); }
  else if (read < spend) { pass.push("read before spend"); console.log("  ✅ the cache is consulted before enrichAuditRecord runs"); }
  else { fail.push("the Places lookup happens BEFORE the cache is consulted — the original defect"); console.log("  🔴 enrichAuditRecord runs before the cache is read"); }
}

console.log("\n── the billed call is CONDITIONAL on a miss ──");
{
  // 🔑 Pin that the spend sits on the false branch of the cache, in whatever form — a ternary, an
  // if, or a short-circuit. What must never return is an unconditional call.
  const conditional = /cached\s*\?[^;]*:\s*await\s+enrichAuditRecord/.test(code)
    || /if\s*\(\s*!\s*cached\s*\)[\s\S]{0,120}?enrichAuditRecord/.test(code)
    || /cached\s*\|\|\s*await\s+enrichAuditRecord/.test(code);
  if (conditional) { pass.push("spend is conditional"); console.log("  ✅ enrichAuditRecord only runs on a cache miss"); }
  else { fail.push("the Places lookup is unconditional again"); console.log("  🔴 enrichAuditRecord is NOT guarded by the cache"); }
}

console.log("\n── a miss writes the result ──");
{
  // 🔴 A CALL SITE, NOT THE DEFINITION. `writeCachedEnrichment(` matches `async function
  // writeCachedEnrichment(` too, so deleting the only call left this check green — the function
  // would sit there, fully written, never invoked. That is a capability nobody calls.
  // → feedback_a_capability_nobody_calls_looks_finished
  const defs = (code.match(/function\s+writeCachedEnrichment\s*\(/g) || []).length;
  const mentions = (code.match(/writeCachedEnrichment\s*\(/g) || []).length;
  if (mentions - defs >= 1) { pass.push("writes on miss"); console.log(`  ✅ a miss stores the enrichment (${mentions - defs} call site)`); }
  else { fail.push("nothing records the lookup — every press would be a miss forever"); console.log("  🔴 no write-back CALL: this is the 1,362-lead shape"); }
  // A write that cannot fail the request: the defect we are preventing must not become an outage.
  if (/writeCachedEnrichment[\s\S]{0,40}catch|catch\s*\{[^}]*\}\s*\n?\s*\}\s*\n\s*function buildEnrichmentRecord/.test(raw)
      || /async function writeCachedEnrichment[\s\S]{0,1400}?catch/.test(raw)) {
    pass.push("write failure cannot break autofill"); console.log("  ✅ a failed cache write cannot break autofill");
  } else { fail.push("a cache write failure could break autofill"); console.log("  🔴 the cache write is not guarded"); }
}

console.log("\n── the freshness window is a sane finite number ──");
{
  const m = raw.match(/const ENRICHMENT_TTL_MS\s*=\s*([^;]+);/);
  let ttl = NaN;
  if (m) { try { ttl = Function(`"use strict";return (${m[1]})`)(); } catch { /* left NaN */ } }
  const sane = Number.isFinite(ttl) && ttl > 0 && ttl <= 7 * 24 * 3600 * 1000;
  if (sane) { pass.push("sane TTL"); console.log(`  ✅ TTL = ${(ttl / 3600000).toFixed(1)}h`); }
  else { fail.push(`the cache TTL is not a sane finite window (${m ? m[1].trim() : "absent"})`); console.log(`  🔴 TTL is ${m ? m[1].trim() : "absent"}`); }

  // 🔴 An unreadable or future timestamp must not read as fresh — unknown is not usable.
  if (/Number\.isFinite\(age\)/.test(code) && /age\s*<\s*0/.test(code)) {
    pass.push("bad timestamp is not fresh"); console.log("  ✅ an unreadable or future captured_at is treated as a miss");
  } else { fail.push("a malformed cache timestamp could read as fresh"); console.log("  🔴 captured_at is not sanity-checked"); }
}

console.log("\n── a cached answer does not call itself live ──");
{
  // The sources list is what an admin reads to decide how much to trust the filled fields.
  const claimsLive = /sources\.push\(\s*["']live website scan["']\s*\)/.test(code);
  const guarded = /cached\s*\?[^;]*:\s*["']live website scan["']/.test(code);
  if (!claimsLive || guarded) { pass.push("no false live claim"); console.log("  ✅ a cache hit is not described as a live scan"); }
  else { fail.push('a cached result is still labelled "live website scan"'); console.log("  🔴 a cached result would be reported as a live scan"); }
}

console.log("");
if (fail.length) {
  console.error(`🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.error(`   · ${f}`);
  console.error(`\n   Places SearchText is 32/day on purpose. See feedback_google_cloud_billing_safety.`);
  process.exit(1);
}
console.log(`✅ ${pass.length} properties hold — the cache is read before the spend, the lookup is`);
console.log(`   conditional, a miss is recorded, the window is finite, and a hit never claims to be live.`);

/* ─── MUTATION LOG (both directions, matched by name) ──────────────────────────────────────────────
 *  1. cache read moved AFTER enrichAuditRecord        → exit 1 "BEFORE the cache is consulted"
 *  2. ternary replaced with an unconditional call      → exit 1 "unconditional again"
 *  3. writeCachedEnrichment call removed               → exit 1 "nothing records the lookup"
 *  4. ENRICHMENT_TTL_MS = Infinity                     → exit 1 "not a sane finite window"
 *  5. Number.isFinite(age) guard removed               → exit 1 "malformed cache timestamp"
 *  6. sources.push("live website scan") unconditional  → exit 1 "labelled live website scan"
 *  7. unmodified source                                 → exit 0
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
