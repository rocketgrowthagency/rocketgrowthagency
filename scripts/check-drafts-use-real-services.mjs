#!/usr/bin/env node
/**
 * check-drafts-use-real-services.mjs — never describe a client's business from a search term.
 *
 * ─── WHY (2026-09-14) ────────────────────────────────────────────────────────────────────────────
 * **32 of 38 drafting steps** described the client's business using `client.primary_service`. That
 * field holds the **tracked KEYWORD**, not a service. For RGA it is `"seo company"`.
 *
 * So the drafted Google Business Profile description sold *"keyword strategy and on-page
 * optimization"*, and the services list offered **Link Building · Technical SEO · SEO Audits**.
 * RGA sells three things — GBP Optimization, Google Maps Local SEO, Website Support — and **none of
 * them are those.** `secondary_services`, which holds the real list, was passed to zero prompts.
 *
 * Worse, `m1.web.expanded_schema` emits schema.org `serviceType` **onto the client's website**, so
 * the keyword would have been published as a declared service in structured data.
 *
 * 🔑 Fixing 32 prompts by hand invites missing one, so the interpolation itself was fixed: a single
 * `svcCtx(client)` helper feeds every prompt the real list and labels the keyword as a keyword. This
 * gate stops a 33rd step reintroducing it.
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. `svcCtx()` exists and names `secondary_services`.
 *   2. No executor interpolates `${client.primary_service}` into a prompt — it must go through svcCtx.
 *   3. Steps that BUILD from services (schema, matrix) prefer `secondary_services`.
 *
 * Exit 0 = every draft describes the real business · 1 = a step describes a keyword · 2 = could not read.
 */
import fs from 'node:fs';

const SELF_TEST = process.argv.includes('--self-test');
const FLOW = '/Users/chris/RGA/Rocket Growth Agency Website VS Code/netlify/functions/flow-execute.js';

export function verdict(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  if (!/function svcCtx\s*\(/.test(code)) {
    problems.push('svcCtx() is missing — there is no single place that feeds prompts the real service list');
  } else if (!/svcCtx[\s\S]{0,600}secondary_services/.test(code)) {
    problems.push('svcCtx() does not read secondary_services — it cannot know the real services');
  }

  // 🔴 The actual bug: the keyword interpolated straight into a prompt.
  const raw = [...code.matchAll(/\$\{client\.primary_service\}/g)];
  if (raw.length) {
    problems.push(`${raw.length} prompt interpolation(s) still use \${client.primary_service} — that is the tracked keyword, not a service. Use svcCtx(client).`);
  }

  // Steps that construct service objects (not prose) must prefer the real list.
  for (const step of ['m1.web.expanded_schema', 'm1.web.service_location_matrix']) {
    const m = code.match(new RegExp(`"${step.replace(/\./g, '\\.')}"[\\s\\S]{0,900}`));
    if (m && /primary_service/.test(m[0]) && !/secondary_services/.test(m[0])) {
      problems.push(`${step} builds from primary_service without falling back from secondary_services`);
    }
  }
  return problems;
}

if (SELF_TEST) {
  const good = 'function svcCtx(client){ return client.secondary_services.join(", "); }\nconst p = `Service: ${svcCtx(client)}`;';
  const cases = [
    ['all prompts go through svcCtx', good, 0],
    ['THE BUG: keyword interpolated into a prompt', good + '\nconst q = `Service: ${client.primary_service}`;', 1],
    ['svcCtx missing entirely', 'const p = `Service: ${svcCtx(client)}`;', 1],
    ['svcCtx that ignores the real list', 'function svcCtx(client){ return client.primary_service; }', 1],
    ['a COMMENT mentioning it is fine', good + '\n// do not use ${client.primary_service} here', 0],
  ];
  let bad = 0;
  for (const [label, src, want] of cases) {
    const got = verdict(src).length;
    const ok = (got > 0) === (want === 1);
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} (want ${want ? 'flagged' : 'clean'}, got ${got})`);
  }
  console.log(`\n[services] self-test: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

let src;
try { src = fs.readFileSync(FLOW, 'utf8'); }
catch (e) { console.error(`[services] INDETERMINATE — ${e.message}`); process.exit(2); }

const problems = verdict(src);
if (problems.length) {
  console.error('✗ a drafting step would describe the client using their search term, not their services:');
  for (const p of problems) console.error(`    ${p}`);
  console.error('\n  primary_service is the tracked KEYWORD. secondary_services is what they sell.');
  process.exit(1);
}
console.log('✅ every drafting step describes the real business, not the keyword.');
process.exit(0);
