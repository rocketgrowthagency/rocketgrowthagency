#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A REBUILT DRAFT KEEPS ITS FENCES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"what happened to the design we had from the mockup its gone now?"*
 *
 * The approved keyword card — query pill, volume chip, the why beneath — had reverted to raw text:
 * `keywords:` as a paragraph, `- term: …` as a bullet, and an empty **TEMPLATE** box underneath.
 *
 * The keyword step REBUILDS its draft from the measured `demand` list so the card and the data
 * cannot diverge. That rebuild started the document at `"keywords:"` — throwing away the ```yaml
 * fence that OPENS the block, while the tail it kept still carried the CLOSING fence. So:
 *   1. unfenced, the renderer sees ordinary markdown and the structured card can never be built;
 *   2. the orphaned closing fence OPENS a block that runs to the end — the empty TEMPLATE box.
 *
 * 🔑 A REBUILD REPLACES A SECTION, NOT THE DOCUMENT AROUND IT.
 *
 * Asserts the source reassembles from the head, and — when the database is reachable — that every
 * stored draft for the step has BALANCED fences.
 *
 * Exit 0 pass · 1 a rebuild can strip its own fence · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = `${SITE}/netlify/functions/flow-execute.js`;
let src;
try { src = fs.readFileSync(F, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

const fail = [];
const code = src.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

// ── 1 · THE REASSEMBLY KEEPS THE HEAD ───────────────────────────────────────────────────────────
// 🔑 Pin the PROPERTY — everything before the section being replaced survives — not the variable
// names. Accept any reassembly whose first spread is a slice starting at 0.
{
  const m = code.match(/draft\s*=\s*\[([^\]]*)\]\.join\(/);
  if (!m) {
    console.error("⚠️  INDETERMINATE — cannot find the draft reassembly; re-pin this gate.");
    process.exit(2);
  }
  const parts = m[1];
  const keepsHead = /\.\.\.\s*head\b/.test(parts)
    || /\.\.\.\s*lines0\.slice\(\s*0\s*,/.test(parts)
    || /\.\.\.\s*\w+\.slice\(\s*0\s*,/.test(parts);
  if (!keepsHead) {
    fail.push("the draft is reassembled without the lines BEFORE the rebuilt section — the opening "
      + "``` fence is thrown away, the structured card can never be built, and the closing fence "
      + "is left orphaned");
  }
  // 🔴 And the head must be declared from a slice that starts at 0, not re-derived.
  if (/\.\.\.\s*head\b/.test(parts) && !/const head\s*=\s*lines0\.slice\(\s*0\s*,/.test(code)) {
    fail.push("`head` is spread into the draft but is not the slice of lines before the section");
  }
}

// ── 2 · THE STORED DRAFTS HAVE BALANCED FENCES ──────────────────────────────────────────────────
// 🔑 The source test proves the code is right today; this proves the DATA is. An odd number of
// fences is exactly what produced the empty TEMPLATE box on Chris's screen.
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.log("  ⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — stored drafts not checked.");
} else {
  let rows;
  try {
    const r = await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data`,
      { headers: { apikey: K, Authorization: `Bearer ${K}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    rows = await r.json();
  } catch (e) {
    console.log(`  ⚠️  could not read stored drafts: ${e.message} — NOT reporting healthy.`);
    process.exit(2);
  }
  let checked = 0;
  for (const row of rows) {
    const t = row?.data?.tasks?.["m1.strategy.keywords_locations"];
    const txt = t?.auto_result?.summary || t?.result?.text || "";
    if (typeof txt !== "string" || !txt) continue;
    checked++;
    const fences = (txt.match(/^\s*```/gm) || []).length;
    if (fences % 2 !== 0) {
      fail.push(`client ${String(row.client_id).slice(0, 8)}… has a stored keyword draft with `
        + `${fences} fence marker(s) — an odd number leaves one open, which renders everything after `
        + `it as a single empty block`);
    }
    // 🔴 If it declares keywords at all, the block must be fenced — otherwise the locked card is
    // rendered as plain markdown and the design is simply gone.
    if (/^\s*keywords\s*:/m.test(txt) && fences === 0) {
      fail.push(`client ${String(row.client_id).slice(0, 8)}… has a keyword draft with NO fence — `
        + `the structured card cannot be built from it and it renders as raw text`);
    }
  }
  console.log(`  checked ${checked} stored keyword draft(s)`);
}

if (fail.length) {
  console.error("🔴 a rebuilt draft loses the fence its card is built from:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ the rebuild replaces a section and keeps the document around it; every stored draft's fences are balanced");
