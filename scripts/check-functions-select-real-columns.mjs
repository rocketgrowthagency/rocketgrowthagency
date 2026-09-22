#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-functions-select-real-columns.mjs
//
// 🔴 WHY (2026-09-22). A new executor in flow-execute.js read
// `client_onboarding_records?select=tasks`. There is no `tasks` column — the tasks live inside the
// `data` JSONB. PostgREST answered `400 42703 column ... does not exist`, the surrounding
// `.catch(() => null)` swallowed it, and the pre-flight silently concluded the keyword had never
// been validated — blocking the rank baseline for EVERY client whose validation had actually
// passed. It was found by RUNNING the executor, not by any gate.
//
// `check-admin-selects-real-columns.mjs` already does this for admin.js and ONLY admin.js. The
// ~60 Netlify functions build their SELECTs as PostgREST query strings and nothing checked them.
//
// 🔑 A 400 from a missing column is invisible in normal operation: the catch turns it into an empty
// result, and empty reads as "nothing there" rather than "I asked wrongly".
// → project_admin_selected_a_missing_column · project_client_activity_writes_were_dropped
//
// exit 0 = every column exists · exit 1 = a SELECT names a missing column · exit 2 = cannot tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN_DIR = path.join(SITE, "netlify", "functions");
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!fs.existsSync(FN_DIR)) {
  console.error("⚠️  INDETERMINATE — netlify/functions not found.");
  process.exit(2);
}
if (!U || !K) {
  console.error("⚠️  INDETERMINATE — no Supabase credentials; the live schema could not be read.");
  process.exit(2);
}

const headers = { apikey: K, Authorization: `Bearer ${K}` };
const schema = new Map();   // table -> Set(columns) | null when no row is readable

async function columnsOf(table) {
  if (schema.has(table)) return schema.get(table);
  let cols = null;
  try {
    const r = await fetch(`${U}/rest/v1/${table}?select=*&limit=1`, { headers });
    if (r.ok) {
      const rows = await r.json();
      // An empty table teaches nothing about its columns — that is UNVERIFIABLE, not a pass.
      if (Array.isArray(rows) && rows.length) cols = new Set(Object.keys(rows[0]));
    }
  } catch { /* leave null */ }
  schema.set(table, cols);
  return cols;
}

// Pull `/rest/v1/<table>?...select=<list>` out of a source file. Both the table and the select
// list must be literal; anything interpolated is counted as skipped and SAID, never silently
// dropped. → feedback_indeterminate_is_not_a_finding
// 🔴 THE FIRST VERSION ONLY MATCHED `/rest/v1/<table>?…` AND WAS THEREFORE A DEAD CHECK. Most of
// these functions call a local `supa(path)` helper that PREPENDS `/rest/v1`, so the literal in the
// source is just `/client_onboarding_records?…` — including the exact line this gate was written
// to catch. Re-introducing that bug left the verdict green. Found by mutation, not by review: a
// gate you have not watched FAIL on the original defect has not been tested.
// → feedback_dead_check_selector_gap · feedback_a_fix_without_a_gate_regresses
function selectsIn(src) {
  const out = [];
  const seen = new Set();
  const add = (table, qs, index) => {
    const sel = qs.match(/[?&]select=([^&`"']*)/i);
    if (!sel) return;
    const key = `${table}|${sel[1]}|${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ table, list: sel[1], line: src.slice(0, index).split("\n").length });
  };
  // a) a full REST url written out in the source
  for (const m of src.matchAll(/\/rest\/v1\/([a-z_][a-z0-9_]*)\?([^`"']*)/gi)) add(m[1], m[2], m.index);
  // b) a path handed to a helper that prepends /rest/v1 — `supa(`/table?select=…`)`
  for (const m of src.matchAll(/[`"']\/([a-z_][a-z0-9_]*)\?([^`"']*)/gi)) {
    if (m[0].includes("/rest/v1/")) continue;   // already counted by (a)
    add(m[1], m[2], m.index);
  }
  return out;
}

// `alias:column`, `column`, `relation(a,b)`, `*`. Only bare columns are checkable here: a relation
// is a foreign table and `*` names nothing.
function columnsNamed(list) {
  const cols = [], skipped = [];
  let depth = 0, buf = "";
  const flush = () => {
    const t = buf.trim(); buf = "";
    if (!t) return;
    if (t === "*") return;
    if (t.includes("(")) { skipped.push(t.slice(0, t.indexOf("("))); return; }  // embedded relation
    // `%%` is what an interpolation was collapsed to above. It is NOT a column name — an early
    // version used "IX", which is a valid identifier, so six fully-interpolated select lists were
    // reported as missing columns. The placeholder has to be unmistakably not-an-identifier.
    if (t.includes("${") || t.includes("%%")) { skipped.push("${...}"); return; }
    const name = t.includes(":") ? t.slice(t.indexOf(":") + 1) : t;             // alias:column
    if (/^[a-z_][a-z0-9_]*$/i.test(name)) cols.push(name); else skipped.push(t);
  };
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { flush(); continue; }
    buf += ch;
  }
  flush();
  return { cols, skipped };
}

const files = fs.readdirSync(FN_DIR).filter((f) => f.endsWith(".js"));
const problems = [];
let checkedSelects = 0, checkedCols = 0, unverifiable = 0, interpolated = 0;

for (const file of files) {
  // 🔴 JOIN ADJACENT STRING LITERALS FIRST. Long query strings are written as
  //     supa(`/client_activity?client_id=in.(${ids})`
  //        + `&order=created_at.asc&select=id,client_id,kind`)
  // so the TABLE and its `select=` live in different literals and a single-literal match sees a
  // table with no select, and a select with no table — silently checking neither. Two mutations
  // sailed through the gate this way before the concatenation was collapsed.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const src = fs.readFileSync(path.join(FN_DIR, file), "utf8")
    .replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/`\s*\+\s*`/g, "")      // `a` + `b`  ->  `ab`
    .replace(/"\s*\+\s*"/g, "")      // "a" + "b"  ->  "ab"
    // 🔴 AND NEUTRALISE INTERPOLATIONS, because they can CONTAIN QUOTES.
    // `/client_activity?client_id=in.(${ids.join(",")})&…&select=id,kind` — the `"` inside
    // `join(",")` ends the literal as far as any quote-terminated scan is concerned, so the match
    // stopped before ever reaching `select=`. The whole query silently went unchecked while the
    // gate reported a healthy count. Collapse `${…}` to a quote-free placeholder first; run it
    // twice so one level of nesting is handled too.
    .replace(/\$\{[^{}]*\}/g, "%%").replace(/\$\{[^{}]*\}/g, "%%");
  for (const s of selectsIn(src)) {
    const { cols, skipped } = columnsNamed(s.list);
    interpolated += skipped.filter((x) => x.includes("${")).length;
    if (!cols.length) continue;
    const known = await columnsOf(s.table);
    if (!known) { unverifiable++; continue; }
    checkedSelects++;
    checkedCols += cols.length;
    const missing = cols.filter((c) => !known.has(c));
    if (missing.length) {
      problems.push(`${file}:${s.line}  ${s.table}?select= names ${missing.length} column(s) that `
        + `do not exist: ${missing.join(", ")}  — PostgREST answers 400 and a catch turns that into `
        + `an empty result, which reads as "nothing there" rather than "I asked wrongly".`);
    }
  }
}

// 🔴 A MASS FINDING MEANS THE PROBE IS WRONG, not that the codebase is. If a large share of the
// SELECTs look broken, this parser has drifted — say so instead of filing 40 false reports.
// → feedback_a_check_must_not_validate_itself
if (checkedSelects && problems.length > Math.max(5, checkedSelects * 0.25)) {
  console.error(`⚠️  INDETERMINATE — ${problems.length} of ${checkedSelects} SELECTs look broken. `
    + `That is a parser fault, not a codebase fault. Fix this gate before believing it.`);
  process.exit(2);
}

if (!checkedSelects) {
  console.error("⚠️  INDETERMINATE — no verifiable SELECT was found; the parser has drifted.");
  process.exit(2);
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} SELECT(s) name a column that does not exist:\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ ${checkedCols} column(s) across ${checkedSelects} SELECT(s) in ${files.length} `
  + `function(s) all exist in the live schema.`);
if (unverifiable || interpolated) {
  console.log(`   (${unverifiable} SELECT(s) on empty tables could not be verified; `
    + `${interpolated} interpolated column name(s) skipped — reported, not hidden.)`);
}
process.exit(0);
