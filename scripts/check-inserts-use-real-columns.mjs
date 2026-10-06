#!/usr/bin/env node
/**
 * check-inserts-use-real-columns.mjs — a WRITE that names a column the table does not have is lost.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09. `send-confirmation-email.js` logged every send to the activity feed like this:
 *
 *     { workspace_id, client_id, activity_type: "confirmation_email_sent", description: "…" }
 *
 * `client_activity` has no `activity_type` and no `description`. It has `kind` and `payload`. Every
 * insert 400'd, a `catch` turned it into `console.warn`, and the function reported success. Twelve
 * other callers already used kind/payload correctly — this one invented its own shape and nothing
 * noticed, because a swallowed write is indistinguishable from a write nobody looked at.
 *
 * 🔴 IT ALSO MISLED THE INVESTIGATION. Querying with the same invented column names returned a
 * PostgREST error object; the reading script did `if (!rows.length)` on it and reported "0 activity
 * rows for RGA". The table had 48. A wrong column name lies in BOTH directions.
 *
 * 🔑 `check-admin-selects-real-columns` already guards SELECTs. Reads were covered and writes were
 * not — and a write failing silently is the worse half ([[feedback-verify-the-write-not-just-the-intent]]).
 *
 * Verifies every column any function INSERTs against the LIVE schema. Needs Supabase; exits 2 if it
 * cannot reach it, never 0 — an unreachable schema is "could not tell", not "fine".
 *
 * Exit 0 = every inserted column exists · 1 = a write is being dropped · 2 = could not verify.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${__SITE}/netlify/functions`;
const SABOTAGE = process.env.SABOTAGE === "1";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) { console.error("  ✗ SUPABASE_URL / SERVICE_ROLE_KEY not set — cannot verify"); process.exit(2); }
if (!fs.existsSync(FNS)) { console.error("  ✗ functions dir not found"); process.exit(2); }

// Collect table → columns written, per file, so a failure names the file to fix.
const writes = [];
for (const f of fs.readdirSync(FNS).filter((x) => x.endsWith(".js"))) {
  let src = fs.readFileSync(path.join(FNS, f), "utf8");
  if (SABOTAGE && f === "send-confirmation-email.js") {
    src = src.replace(/kind: "confirmation_email_sent",/, 'activity_type: "confirmation_email_sent",');
  }
  // 🔴 ONLY TOP-LEVEL KEYS ARE COLUMNS. The first version regex-scraped every `key:` in the body,
  // including keys NESTED inside `payload: { … }` — so it reported `step_title`, `step_type` and
  // `status` as missing columns on flow-execute, which had demonstrably written 8 rows that same
  // day. A probe that cannot tell a column from a JSON field invents failures.
  // Brace-match the object and take depth-1 keys only.
  // 🔴 STAY INSIDE ONE CALL. A lazy `[\s\S]{0,400}?` between the table name and `body:` happily
  // crossed a `});` and picked up the NEXT call's body — it attributed client_activity's kind/payload
  // to client_subscriptions, inventing a failure in stripe-webhook. Brace-match the options object
  // and only look for `body:` within it.
  // 🔴 AND ALLOW A QUERY STRING (2026-09-22). This required a BARE table path — supa(`/clients`, {
  // — so it could only ever see INSERTs. Every UPDATE needs a filter (`/clients?id=eq.${id}`), which
  // means no PATCH was matchable BY CONSTRUCTION, whatever the method test said. Widening POST to
  // PATCH changed nothing until this line changed too, and the count stayed at 49 — a coverage
  // number that does not move when you widen the net is telling you the net never reached.
  // → feedback_dead_check_selector_gap
  const re = /supa\(`\/([a-z_]+)(?:\?[^`]*)?`\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const optOpen = src.lastIndexOf("{", re.lastIndex);
    let od = 0, optEnd = -1;
    for (let i = optOpen; i < src.length; i++) {
      if (src[i] === "{") od++;
      else if (src[i] === "}") { od--; if (od === 0) { optEnd = i; break; } }
    }
    if (optEnd < 0) continue;
    const opts = src.slice(optOpen, optEnd + 1);
    // 🔴 PATCH COUNTS TOO (2026-09-22). This tested only for POST, so an UPDATE naming a column
    // that does not exist sailed straight through. `gbp-duplicate-scan` PATCHed
    // `clients.gbp_duplicate_finding` — no such column — and Supabase answered PGRST204 on EVERY
    // run since it shipped, so the duplicate finding was never saved and the client portal
    // rendered a frozen verdict for a week while promising it re-checked automatically.
    // A write is a write: the verb does not change whether the column has to exist.
    // → project_admin_selected_a_missing_column · feedback_verify_the_write_not_just_the_intent
    if (!/method:\s*"(POST|PATCH|PUT)"/.test(opts)) continue;
    const bodyIdx = opts.indexOf("body: JSON.stringify(");
    // A pre-built `body` variable carries no visible columns — nothing to verify, so skip it.
    if (bodyIdx < 0) continue;
    const open = src.indexOf("{", optOpen + bodyIdx + "body: JSON.stringify(".length - 1);
    if (open < 0 || open > optEnd) continue;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const body = src.slice(open + 1, end);
    // Walk the body tracking depth; a key at depth 0 (relative to the object) is a column.
    // 🔴 DEPTH AT THE START OF THE LINE, not the end. This used to test `d === 0` at the newline —
    // by which point a closing `}` on that same line had already decremented d back to 0. So
    //
    //     payload: { invoice_num: 1,
    //       summary: "…" },          ← starts at depth 1, ENDS at depth 0
    //
    // read `summary` as a column of client_activity and invented a failure in billing-daily-check.
    // Every other caller happened to put payload on ONE line, which is why it never showed before.
    // 🔑 A parser that samples state at the wrong instant is not a stricter check, it is a wrong one.
    // 🔴 SPLIT ON DEPTH-0 COMMAS, NOT ON NEWLINES (2026-09-22). This harvested a key only when it
    // reached a `\n`, with `^\s*` anchored to the line start — so a single-line body,
    // `JSON.stringify({ data: {...}, updated_at: x, not_a_column: 1 })`, surrendered only its FIRST
    // key and every later column on that line went unchecked. Multi-line bodies happened to work,
    // which is why it looked correct. Commas at depth 0 separate columns in BOTH shapes, and
    // nesting is still skipped because a nested key never sits at depth 0.
    const cols = [];
    {
      let d = 0, buf = "";
      const take = () => {
        const km = buf.match(/^\s*([a-z_][a-z0-9_]*)\s*:/);
        if (km) cols.push(km[1]);
        buf = "";
      };
      for (const ch of body) {
        if (ch === "{" || ch === "[") d++;
        else if (ch === "}" || ch === "]") d--;
        if (ch === "," && d === 0) { take(); continue; }
        buf += ch;
      }
      take();
    }
    const uniq = [...new Set(cols)];
    if (uniq.length) writes.push({ file: f, table: m[1], cols: uniq });
  }
}
if (!writes.length) { console.error("  ✗ no INSERTs found — the probe is broken, not the code"); process.exit(2); }

console.log("── every column a function INSERTs must exist on the table ──");

// 🔑 READ THE SCHEMA, NOT A ROW. The first version learned each table's shape from `select=*&limit=1`,
// which teaches nothing about an EMPTY table — three tables here have no rows, so five writes came
// back "unverified" and the gate exited 2 forever. PostgREST publishes its full OpenAPI definition
// at the API root; that knows every column whether or not anything has been inserted yet.
let SCHEMA = null;
async function loadSchema() {
  const r = await fetch(`${SUPA}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const defs = j && (j.definitions || (j.components && j.components.schemas));
  if (!defs || !Object.keys(defs).length) return null;
  return defs;
}

async function columnsOf(table) {
  if (SCHEMA && SCHEMA[table] && SCHEMA[table].properties) {
    return { cols: new Set(Object.keys(SCHEMA[table].properties)) };
  }
  // Fallback: a real row still proves the shape when the spec is unavailable.
  const r = await fetch(`${SUPA}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) return { err: `HTTP ${r.status}` };
  const rows = await r.json();
  if (!Array.isArray(rows)) return { err: "unexpected response" };
  if (!rows.length) return { empty: true };
  return { cols: new Set(Object.keys(rows[0])) };
}

SCHEMA = await loadSchema();
if (!SCHEMA) console.log("  ▫️  OpenAPI schema unavailable — falling back to row sampling");
const tables = [...new Set(writes.map((w) => w.table))];
const schema = {};
for (const t of tables) schema[t] = await columnsOf(t);

const fails = [];
let unknown = 0;
for (const w of writes) {
  const s = schema[w.table];
  if (s.err) { console.log(`  ▫️  ${w.table.padEnd(26)} unreadable (${s.err}) — cannot verify ${w.file}`); unknown++; continue; }
  if (s.empty) { console.log(`  ▫️  ${w.table.padEnd(26)} no rows — shape unknowable, ${w.file} unverified`); unknown++; continue; }
  const missing = w.cols.filter((c) => !s.cols.has(c));
  if (missing.length) {
    fails.push(`${w.file} → ${w.table}: ${missing.join(", ")}`);
    console.log(`  🔴 ${w.file} writes ${missing.join(", ")} to ${w.table} — NO SUCH COLUMN, the row is dropped`);
  } else {
    console.log(`  ✅ ${w.file.padEnd(34)} → ${w.table} (${w.cols.length} col${w.cols.length === 1 ? "" : "s"})`);
  }
}

console.log("");
if (fails.length) {
  console.error(`🔴 ${fails.length} INSERT(s) name a column that does not exist:`);
  fails.forEach((f) => console.error(`     ${f}`));
  console.error("   PostgREST rejects the row; a catch turns that into silence and the caller reports success.");
  process.exit(1);
}
if (unknown) { console.error(`▫️  ${unknown} write(s) could not be verified — treating as indeterminate, not a pass.`); process.exit(2); }
console.log(`✅ ${writes.length} INSERT(s) across ${tables.length} table(s): every column exists`);
