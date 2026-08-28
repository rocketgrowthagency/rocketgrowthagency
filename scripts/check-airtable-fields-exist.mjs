#!/usr/bin/env node
/**
 * check-airtable-fields-exist.mjs — every field the Apps Script writes must exist in Airtable.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * `syncReplies` writes Replied, Reply Date, Reply Sentiment, Suggested Reply and Status in ONE
 * `patchLead` call. Three of those fields did not exist in the Leads table — and **Airtable rejects
 * the ENTIRE patch with 422 UNKNOWN_FIELD_NAME when any single field is unknown.**
 *
 * So one missing field silently broke the whole reply path:
 *   • `Replied` never got set        → `NOT({Replied})` kept repliers in the follow-up sequence
 *   • the dedup `if (lead.fields.Replied) return;` never fired → ONE reply logged 48 times
 *   • the digest's reply rate reads those Lead fields → permanently 0
 *   • computeFunnelState never reached closed_replied
 *
 * > **A partial write is not what happened — NOTHING was written.** The Outreach Log row still
 * > appeared, so from the outside replies looked handled. The only visible trace was a 422 in the
 * > Apps Script execution log, which nobody reads.
 *
 * This compares the field names the .gs actually patches against the live Airtable schema.
 *
 * Usage:  node scripts/check-airtable-fields-exist.mjs [--json]
 * Exit 0 = every written field exists · 1 = a write will 422 · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const GS = path.join(WEBSITE, 'docs', 'apps-scripts', 'gmail-to-airtable.gs');
const JSON_OUT = process.argv.includes('--json');

const env = Object.fromEntries(
  fs.readFileSync(path.join(SCRAPER, '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID;
if (!KEY || !BASE) { console.error('✗ missing Airtable credentials'); process.exit(2); }
if (!fs.existsSync(GS)) { console.error(`✗ gmail-to-airtable.gs not found at ${GS}`); process.exit(2); }

// Live schema
let schema;
try {
  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`, { headers: { Authorization: `Bearer ${KEY}` } });
  schema = await r.json();
  if (schema.error) { console.error(`✗ meta API: ${JSON.stringify(schema.error).slice(0, 140)}`); process.exit(2); }
} catch (e) { console.error(`✗ could not reach Airtable meta API: ${String(e.message).slice(0, 90)}`); process.exit(2); }

const leads = (schema.tables || []).find((t) => t.name === (env.AIRTABLE_TABLE_NAME || 'Leads'));
if (!leads) { console.error('✗ Leads table not in the schema response — refusing to judge.'); process.exit(2); }
const existing = new Set(leads.fields.map((f) => f.name));
if (!existing.size) { console.error('✗ schema returned zero fields — bad query, refusing to judge.'); process.exit(2); }

// 🔴 Scope to ACTUAL Lead writes. A first pass scanned every quoted key in the file and produced 8
// false positives out of 11 — email headers, log strings, severity labels. A gate that is 70% noise
// gets ignored, which is the same alarm-fatigue failure as a stale breach warning.
//
// Only two things write Lead fields: `patchLead(<id>, { ... })` and the `_patch` object built in
// createOutreachDrafts. Parse those, nothing else.
const src = fs.readFileSync(GS, 'utf8');
const written = new Set();

// Balanced-brace scan of each patchLead(...) object literal.
for (const m of src.matchAll(/patchLead\([^,]+,\s*\{/g)) {
  let i = m.index + m[0].length - 1, depth = 0, end = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  // Key position only: preceded by `{`, `,` or a line start. Without this, a ternary value like
  // `isUnsub ? 'dead' : ...` matches as if it were a field name.
  for (const k of src.slice(m.index, end).matchAll(/(?:[{,]|\n)\s*'([^']+)'\s*:/g)) written.add(k[1]);
}
// createOutreachDrafts builds `_patch` then passes it to patchLead.
for (const m of src.matchAll(/_patch\['([^']+)'\]\s*=/g)) written.add(m[1]);
for (const m of src.matchAll(/const _patch = \{([^}]*)\}/g)) {
  for (const k of m[1].matchAll(/(?:[{,]|\n)\s*'([^']+)'\s*:/g)) written.add(k[1]);
}

const candidates = [...written].sort();
if (!candidates.length) { console.error('✗ parsed no field names out of the .gs — the parser is wrong, refusing to judge.'); process.exit(2); }
// Sanity: fields we KNOW are written must appear, or the parser silently missed the call sites.
for (const canary of ['Replied', 'Email Status']) {
  if (!candidates.includes(canary)) {
    console.error(`✗ parser did not find '${canary}', which the script definitely writes — it is not`);
    console.error('  reading the patchLead call sites. Refusing to report a clean result.');
    process.exit(2);
  }
}

const missing = candidates.filter((f) => !existing.has(f)).sort();
const ok = candidates.filter((f) => existing.has(f));

if (JSON_OUT) {
  console.log(JSON.stringify({ leadFields: existing.size, written: candidates.length, ok: ok.length, missing }, null, 2));
  process.exit(missing.length ? 1 : 0);
}

console.log(`\n===== APPS SCRIPT WRITES vs AIRTABLE SCHEMA =====`);
console.log(`  Leads table fields   ${existing.size}`);
console.log(`  fields the .gs writes ${candidates.length}`);
console.log(`  present               ${ok.length}`);

if (!missing.length) {
  console.log(`\n✅ every field the script writes exists. No patch can 422 on an unknown field.`);
  process.exit(0);
}

console.error(`\n✗ ${missing.length} FIELD(S) WRITTEN BUT NOT IN AIRTABLE:`);
for (const f of missing) console.error(`     • ${f}`);
console.error(`\n   Airtable rejects the WHOLE patch on any unknown field, so every write containing`);
console.error(`   one of these fails entirely — the other fields in that same call are lost too.`);
console.error(`   Fix: add the field in Airtable, or stop writing it in gmail-to-airtable.gs.`);
process.exit(1);
