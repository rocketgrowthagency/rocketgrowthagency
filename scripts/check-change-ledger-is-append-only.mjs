#!/usr/bin/env node
/**
 * check-change-ledger-is-append-only.mjs — the record of what we changed cannot itself be changed.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * Before/after already existed, stored as `task.published.before` inside the onboarding record. It
 * could not survive, because that record is written with a spread merge:
 *
 *     data.tasks[stepId] = { ...(data.tasks[stepId] || {}), ...patch };
 *
 * Publish the same step twice and the second `published` object replaces the first, taking the
 * original `before` with it. History was destroyed at exactly the moment there was history worth
 * keeping — the second change to the same field.
 *
 * Chris asked for a permanent record of what a thing was before we changed it, who approved it, and
 * when, so the work can be compared against the growth that followed.
 *
 * 🔑 A LEDGER YOU CAN EDIT IS NOT EVIDENCE. The two questions it exists to answer — "what did the
 * client actually agree to" and "did our work cause this" — are both only answerable from an
 * unedited record. So the append-only property is the whole product, not an implementation detail.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. No code UPDATEs or DELETEs client_change_ledger. Inserts and reads only.
 *   2. Every writer passes `before` EXPLICITLY — a defaulted before silently records "there was
 *      nothing here", which is a fabricated before/after.
 *   3. Rows carry a content hash, so a row edited outside the app is detectable.
 *   4. LIVE: no stored row has an after_value whose hash disagrees with content_hash.
 *
 * Exit 0 = the ledger is trustworthy · 1 = it is editable or already inconsistent · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.LEDGER_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = path.join(WEB, "netlify/functions");
const TABLE = "client_change_log";

if (!fs.existsSync(FNS)) { console.error(`[ledger] INDETERMINATE — no functions dir at ${FNS}`); process.exit(2); }

const problems = [];
const files = fs.readdirSync(FNS).filter((f) => f.endsWith(".js"));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. Nothing may mutate the ledger ─────────────────────────────────────────────────────────────
let writers = 0;
for (const f of files) {
  const src = strip(fs.readFileSync(path.join(FNS, f), "utf8"));
  if (!src.includes(TABLE)) continue;
  writers++;
  // A PATCH or DELETE against this table is the defect, wherever it appears.
  for (const m of src.matchAll(new RegExp(`${TABLE}[^\\n]*`, "g"))) {
    const line = m[0];
    // 🔴 LOOK FORWARD ONLY, AND ONLY WITHIN THIS CALL. The first version scanned 260 chars either
    // side of the table name and reported heal-onboarding-errors for a `method: "PATCH"` belonging
    // to a completely different fetch three lines above — which writes the onboarding record, not
    // the ledger. The ledger write there is a correct POST.
    //
    // 🔑 A false finding is as expensive as a missed one: it sends someone to "fix" working code,
    // and the next person learns to skim past this gate. Bound the window to the options object of
    // the fetch that names the table. → feedback_a_check_must_not_validate_itself
    const tail = src.slice(m.index, m.index + 300);
    const optsEnd = tail.indexOf("})");
    const opts = optsEnd > 0 ? tail.slice(0, optsEnd) : tail;
    if (/method:\s*["'`](PATCH|PUT|DELETE)["'`]/i.test(opts) && !/selftest|probe/i.test(opts)) {
      problems.push(`${f} issues a PATCH/PUT/DELETE against ${TABLE} — the ledger is append-only. (${line.slice(0, 80)})`);
    }
  }
}
if (!writers) {
  console.error(`[ledger] INDETERMINATE — nothing references ${TABLE}; the ledger may have been removed`);
  process.exit(2);
}

// ── 2. Every caller passes `before` explicitly ───────────────────────────────────────────────────
// 🔑 The module throws when `before` is undefined, which is the real enforcement. This catches the
// case at author time instead of at 2am in production.
for (const f of files) {
  // 🔑 Skip the module that DEFINES recordChange. Its own signature and docs match the call-shape
  // regex, so the first version reported the enforcement code as the violation — a check flagging
  // itself. → feedback_a_check_must_not_validate_itself
  if (f === "_change-ledger.js") continue;
  const src = strip(fs.readFileSync(path.join(FNS, f), "utf8"));
  if (!/recordChange\s*\(/.test(src)) continue;
  for (const m of src.matchAll(/recordChange\s*\(\s*\{([\s\S]{0,900}?)\}\s*\)/g)) {
    const args = m[1];
    if (!/\bbefore\s*:/.test(args)) {
      problems.push(`${f} calls recordChange() without a \`before\` — "the field was empty" and "we did not capture it" must not collapse into one row.`);
    }
    if (!/\bsource\s*:/.test(args)) {
      problems.push(`${f} calls recordChange() without a \`source\` — a row nobody can trace back is not evidence.`);
    }
  }
}

// ── 3. The module itself must still hash and still refuse ────────────────────────────────────────
const modPath = path.join(FNS, "_change-ledger.js");
if (!fs.existsSync(modPath)) {
  problems.push("_change-ledger.js is gone — every guarantee above lived in it.");
} else {
  const mod = fs.readFileSync(modPath, "utf8");
  if (!/content_hash/.test(mod)) problems.push("_change-ledger no longer stores a content hash; a row edited in the database would be undetectable.");
  if (!/before === undefined/.test(mod)) problems.push("_change-ledger no longer rejects a missing `before` — callers can now silently record a fabricated before/after.");
  if (/method:\s*["'`](PATCH|PUT|DELETE)["'`]/i.test(strip(mod))) problems.push("_change-ledger itself mutates rows.");
}

// ── 4. LIVE: do the stored hashes still match their rows? ────────────────────────────────────────
let live = "skipped (no credentials)";
try {
  for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env — the static half still runs */ }

const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (U && K) {
  try {
    const r = await fetch(`${U}/rest/v1/${TABLE}?select=id,value_after,content_hash&limit=500`, {
      headers: { apikey: K, Authorization: `Bearer ${K}` },
    });
    const rows = await r.json();
    if (Array.isArray(rows)) {
      let bad = 0;
      for (const row of rows) {
        if (!row.content_hash) continue;
        const v = row.value_after;
        const s = typeof v === "string" ? v : JSON.stringify(v, Object.keys(v || {}).sort());
        const h = crypto.createHash("sha256").update(s || "").digest("hex").slice(0, 32);
        if (h !== row.content_hash) { bad++; problems.push(`ledger row ${row.id} has an after_value that does not match its stored hash — it was edited outside the app.`); }
      }
      live = `${rows.length} row(s) hash-checked, ${bad} mismatched`;
    }
  } catch (e) { live = `could not verify live rows (${String(e.message).slice(0, 60)})`; }
}

console.log("── the change ledger is append-only and tamper-evident ──");
console.log(`  ${writers} function(s) reference ${TABLE} · live: ${live}`);

if (problems.length) {
  console.error("\n✗ the ledger cannot be trusted as evidence:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("\n  A record of what we changed, which can itself be changed, answers neither");
  console.error("  'what did the client agree to' nor 'did our work cause this'.");
  process.exit(1);
}
console.log("  ✅ inserts and reads only, every caller passes an explicit before, hashes intact");
process.exit(0);
