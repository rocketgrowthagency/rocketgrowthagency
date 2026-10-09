#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-activity-rows-use-real-columns.mjs
//
// 🔴 WHY (2026-10-09, the first real kickoff test call): the recap said "It is on the client's timeline".
// It never was. send-kickoff-recap.js — and kickoff-call-outcome.js — wrote `at:` into client_activity, whose
// time column is `occurred_at`. PostgREST refused the unknown column every time; a catch swallowed it. Zero
// `kickoff_recap_sent` rows had ever been written.
// HOLDS: every object written to client_activity (server POST bodies + browser .insert) uses only the
// table's real columns. exit 0 = all real · 1 = one is not · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// the live table (information_schema, 2026-10-09)
const COLUMNS = new Set(["id", "client_id", "workspace_id", "kind", "payload", "occurred_at", "created_at"]);
const files = [];
try {
  for (const f of fs.readdirSync(`${SITE}/netlify/functions`)) if (f.endsWith(".js")) files.push(`netlify/functions/${f}`);
} catch { console.error("⚠️  INDETERMINATE — cannot read netlify/functions"); process.exit(2); }
files.push("admin/admin.js", "portal/portal.js");

// the top-level keys of the object literal that opens at `i` (the "{")
function topKeys(s, i) {
  const keys = []; let depth = 0, j = i, tok = "", expectKey = true;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === "`") { const q = c; j++; while (j < s.length && s[j] !== q) { if (s[j] === "\\") j++; j++; } continue; }
    if ("{[(".includes(c)) { depth++; if (depth === 1) { expectKey = true; tok = ""; } continue; }
    if ("}])".includes(c)) { if (depth === 1 && tok.trim()) keys.push(tok.trim()); depth--; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (c === ":" && expectKey) { keys.push(tok.trim()); tok = ""; expectKey = false; continue; }
    if (c === ",") { if (expectKey && tok.trim()) keys.push(tok.trim()); tok = ""; expectKey = true; continue; }
    if (expectKey) tok += c;
  }
  return keys.filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
}

const bad = []; let seen = 0;
for (const rel of files) {
  let s; try { s = fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { continue; }
  const re = /(?:"\/client_activity"[\s\S]{0,160}?JSON\.stringify\(\s*|\.from\("client_activity"\)\s*\.insert\(\s*)(\{)/g;
  let m;
  while ((m = re.exec(s))) {
    seen++;
    const at = m.index + m[0].length - 1;
    for (const k of topKeys(s, at)) if (!COLUMNS.has(k)) bad.push(`${rel}:${s.slice(0, at).split("\n").length} writes \`${k}\` — client_activity has no such column`);
  }
}
if (!seen) { console.error("⚠️  INDETERMINATE — found no client_activity writes; the pattern is stale"); process.exit(2); }
if (bad.length) { console.error("🔴 a timeline row names a column that does not exist (the insert fails):"); for (const b of bad) console.error("   · " + b); process.exit(1); }
console.log(`✅ ${seen} client_activity writes, every key a real column`);
