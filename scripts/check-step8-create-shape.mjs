#!/usr/bin/env node
// Pre-flight FATAL gate — step-8 Airtable create-payload shape guard.
//
// Locks the 2026-06-11 fix (Scraper edf2eb9): the Airtable CREATE endpoint rejects
// any record key besides `fields`. buildRecord() returns { fields, _skipReason } —
// _skipReason is internal (dedup gate) and must be stripped before the POST.
// postBatchTo() does the strip: `const clean = records.map(r => ({ fields: r.fields }))`.
//
// REGRESSION this catches: if someone removes the strip and passes the raw `records`
// param straight to JSON.stringify (the shorthand `{ records, typecast: true }`), every
// brand-new-lead batch silently 422s (created=0) — invisible because videos still deploy.
//
// Static-scan style (matches check-mobile-finding-priority.mjs / check-absence-finding-gates.mjs
// convention) — keeps step-8's module interface unchanged (no exports needed).
//
// Memory: feedback_step8_create_payload_fields_only.md, feedback_pipeline_invariants_2026-06-03.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STEP8 = path.join(__dirname, '..', 'step-8-publish-to-airtable.mjs');

const fail = (msg) => {
  console.error(`\n✗ check-step8-create-shape FAILED: ${msg}\n`);
  process.exit(1);
};

const src = fs.readFileSync(STEP8, 'utf8');

// 1. Locate the postBatchTo function (the only Airtable create POST path).
const start = src.indexOf('async function postBatchTo');
if (start === -1) {
  fail('postBatchTo() not found — the create POST path moved. Re-point this guard.');
}
const rest = src.slice(start);
const end = rest.indexOf('\n}\n');
const body = end === -1 ? rest : rest.slice(0, end);

// 2. The strip must be present: records mapped to a fields-only object.
const hasStrip = /records\.map\(\s*\(?\s*\w+\s*\)?\s*=>\s*\(\s*\{\s*fields\s*:/.test(body);
if (!hasStrip) {
  fail('postBatchTo() no longer strips records to { fields }-only. ' +
       'Restore: const clean = records.map((r) => ({ fields: r.fields }));');
}

// 3. The raw `records` param must NOT be passed straight to the POST body (the bug).
//    The shorthand `{ records, ` inside JSON.stringify = sending unstripped records.
const sendsRawShorthand = /JSON\.stringify\(\s*\{\s*records\s*,/.test(body);
if (sendsRawShorthand) {
  fail('postBatchTo() passes the RAW `records` param to JSON.stringify ({ records, ... }). ' +
       'This leaks non-`fields` keys (e.g. _skipReason) → Airtable 422 on every new-lead batch. ' +
       'Send the stripped array instead ({ records: clean, ... }).');
}

console.log('✓ check-step8-create-shape: postBatchTo strips records to { fields }-only before POST');
process.exit(0);
