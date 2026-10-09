#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-no-catch-on-a-supabase-query.mjs
//
// 🔴 WHY (2026-10-09): Chris uploaded his logo to step 7 slot 1 and the slot said "We couldn't upload that
// photo". The photo HAD saved. The line after it was `_portalSupabase.from("client_activity").insert({…})
// .catch(() => {})` — a supabase-js query is a thenable with NO .catch, so it threw "catch is not a
// function", the error message showed, and the publish-to-Google call never ran. Same defect in the
// customer-list submit (saved, then said it failed) and admin setInventoryStatus (threw on every click).
// supabase-js never throws for a query — it returns { error } — so a .catch is never needed either.
//
// HOLDS: in the browser code, no statement that starts a Supabase query (`<client>.from(` / `.rpc(`)
// chains a `.catch(` unless it first chains a `.then(` (which DOES return a real Promise).
// exit 0 = none · 1 = one exists · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILES = ["portal/portal.js", "admin/admin.js", "admin/playbook.js"];
const hits = [];
let read = 0;
for (const f of FILES) {
  let s;
  try { s = fs.readFileSync(`${SITE}/${f}`, "utf8"); read++; } catch { continue; }
  const re = /\b(\w*[Ss]upabase\w*|sb)\s*\.\s*(from|rpc)\(/g;
  let m;
  while ((m = re.exec(s))) {
    let depth = 0, j = m.index;
    for (; j < s.length; j++) {
      const c = s[j];
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) { depth--; if (depth < 0) break; }
      else if (c === ";" && depth === 0) break;
    }
    const stmt = s.slice(m.index, j);
    const iThen = stmt.search(/\)\s*\.then\(/), iCatch = stmt.search(/\)\s*\.catch\(/);
    if (iCatch >= 0 && (iThen < 0 || iThen > iCatch)) hits.push(`${f}:${s.slice(0, m.index).split("\n").length}  ${stmt.replace(/\s+/g, " ").slice(0, 80)}…`);
  }
}
if (read < 2) { console.error("⚠️  INDETERMINATE — cannot read portal.js / admin.js"); process.exit(2); }
if (hits.length) {
  console.error("🔴 a Supabase query chains .catch — the builder has none, so it THROWS (\"catch is not a function\"):");
  for (const h of hits) console.error("   · " + h);
  console.error("   Drop the .catch: supabase-js returns { error }, it does not throw.");
  process.exit(1);
}
console.log("✅ no Supabase query chains a .catch it does not have");
