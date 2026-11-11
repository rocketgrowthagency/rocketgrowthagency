#!/usr/bin/env node
// check-supabase-security-advisor.mjs — 11-10: Supabase emailed "Table publicly accessible" (rls_disabled_in_public: kickoff_slot_holds,
// as of 08 Nov) and a security_definer_view (client_change_effect). Nothing of ours caught it; Supabase did, days later. This reads
// Supabase's own security advisor (read-only Management API, SUPABASE_ACCESS_TOKEN) every day and FAILS on any ERROR-level finding,
// so a new table made without row-level security is caught the next morning. It also checks every CREATE TABLE in docs/supabase/*.sql
// enables RLS in the same file. No token or the API unreachable = INDETERMINATE (2), never green.
import fs from "node:fs"; import path from "node:path";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const REF = "jetgayimvfeslqnkbfdq", T = process.env.SUPABASE_ACCESS_TOKEN;
const bad = [];
// 1 · the SQL files we hand Chris: every new public table turns RLS on in the same file
const dir = path.join(SITE, "docs/supabase");
for (const f of fs.readdirSync(dir).filter((x) => /\.sql$/i.test(x) && /2026-1[1-2]-|2027-/.test(x))) {
  const s = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    const t = m[1];
    if (!new RegExp(`alter\\s+table\\s+(?:public\\.)?${t}\\s+enable\\s+row\\s+level\\s+security`, "i").test(s)) bad.push(`${f}: creates ${t} without enabling row level security`);
  }
}
// 2 · Supabase's own advisor, live
if (!T) { console.log("INDETERMINATE: SUPABASE_ACCESS_TOKEN is not set, so the live advisor wasn't read"); process.exit(2); }
let lints;
try {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/advisors/security`, { headers: { Authorization: `Bearer ${T}` } });
  if (!r.ok) { console.log(`INDETERMINATE: the advisor answered ${r.status}`); process.exit(2); }
  const j = await r.json(); lints = Array.isArray(j) ? j : j.lints;
} catch (e) { console.log(`INDETERMINATE: the advisor couldn't be reached (${e.message})`); process.exit(2); }
if (!Array.isArray(lints)) { console.log("INDETERMINATE: the advisor's answer had no findings list"); process.exit(2); }
for (const l of lints.filter((x) => x.level === "ERROR")) bad.push(`Supabase advisor ERROR ${l.name}: ${(l.metadata && (l.metadata.name || l.metadata.table)) || ""} (${String(l.title || l.detail || "").slice(0, 90)})`);
const warns = lints.filter((x) => x.level === "WARN").length;
if (bad.length) { console.log(`❌ ${bad.length} database security problem(s):`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
console.log(`✅ no ERROR-level finding in Supabase's security advisor, and every new table in our SQL files enables row level security (${warns} warnings logged, not blocking)`);
