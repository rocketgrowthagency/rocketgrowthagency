#!/usr/bin/env node
// scripts/check-stale-suspect-guard.mjs
//
// Regression guard for the STALE-SUSPECT bug (caught 2026-06-12, Chris).
//
// step-1 flags a lead suspect (empty / aggregator / name-mismatch) against the
// GBP-LINKED website, then a search-discovery fallback often substitutes the real
// first-party brand site (step-2.5 audits THAT). The step-1 suspect flag used to
// ride along STALE, so step-6 fired false "you don't have a real website" /
// "your domain doesn't match your business name" claims against a domain that DOES
// carry the brand. Confirmed false positives: Richards Rooter
// (richardsrooterandplumbing.com flagged name-mismatch:richards,rooter), Advanced
// HVAC (advanced-hvac.com flagged "empty"), Murphy Plumbing, Top LA Plumbers,
// Reliance Home Service.
//
// Two-layer fix this test locks:
//   1. step-2.5 — don't propagate the suspect flag when a Discovered Website was used.
//   2. step-6  — stale-suspect guard re-validates the AUDITED url before firing the
//                "no website / domain mismatch" findings (also fixes cached audits).
//
// Usage:  node scripts/check-stale-suspect-guard.mjs   (exit 0 = pass, 1 = fail)
// Runs pre-flight in scripts/overnight-pipeline.sh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failed++; };
const pass = (m) => console.log(`  ✓ ${m}`);

// ── Layer 1: static presence — the guards must exist in source ──────────────
const step6 = fs.readFileSync(path.join(ROOT, 'step-6-voiceover.mjs'), 'utf8');
const step25 = fs.readFileSync(path.join(ROOT, 'step-2.5-audit.mjs'), 'utf8');

if (/function brandTokenInDomain\s*\(/.test(step6) && /STALE-SUSPECT GUARD/.test(step6)
    && /w\.suspectWebsiteMismatch\s*=\s*false/.test(step6)) {
  pass('step-6 carries the stale-suspect guard (brandTokenInDomain + clear)');
} else {
  fail('step-6 stale-suspect guard MISSING — false "no website / domain mismatch" claims will ship');
}

if (/usedDiscoveredSite/.test(step25) && /!usedDiscoveredSite/.test(step25)) {
  pass('step-2.5 does not propagate the suspect flag when a Discovered Website was audited');
} else {
  fail('step-2.5 stale-flag propagation guard MISSING — new audits will re-introduce the bug');
}

// ── Layer 2: logic — replicate the guard decision on canonical cases ────────
// Mirrors the brandTokenInDomain + clearStaleSuspect logic in step-6. If step-6's
// logic changes, update BOTH (the static check above ensures the guard still exists).
const STOP = new Set(['the','and','for','llc','inc','ltd','co','corp','of','at','your','best','top','our','garage','door','doors','repair','repairs','service','services','company','companies','shop','store','center','centers','solution','solutions','group','team','home','professional','professionals','expert','experts','specialist','specialists','pro','pros','plumbing','plumber','plumbers','hvac','heating','cooling','air','conditioning','comfort','roofing','roofer','roofers','locksmith','locksmiths','dentist','dentists','dental','auto','automotive','car','cars','vehicle','vehicles','water','rooter','rooters','painting','painters','painter','cleaning','cleaners','cleaner','landscaping','landscape','lawn','tree','trees','pest','control','exterminator','exterminators','electric','electrician','electricians','contractor','contractors','construction','remodel','remodeling','los','angeles','beverly','hills','santa','monica','city','county','ca']);
const AGG = ['yelp.com','facebook.com','instagram.com','linkedin.com','nextdoor.com','mapquest.com','yellowpages.com','bbb.org','angi.com','thumbtack.com','houzz.com'];
function brandIn(name, url) {
  if (!name || !url) return false;
  let h = ''; try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  const d = h.replace(/\.[a-z]+$/i, '').replace(/[^a-z0-9]/g, ''); if (!d) return false;
  const t = String(name).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length >= 3 && !STOP.has(x));
  return t.some(x => d.includes(x));
}
function isCleared(name, reason, url, auditRan) {
  let h = ''; try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
  const isAgg = AGG.some(a => h === a || h.endsWith('.' + a));
  const bp = brandIn(name, url);
  const r = (reason || '').toLowerCase();
  if (r.startsWith('name-mismatch')) return bp;
  if (r.startsWith('empty') || r.startsWith('aggregator') || r.startsWith('unparseable') || r === '') return auditRan && !isAgg;
  return false;
}

const CASES = [
  // [name, reason, auditedUrl, auditRan, expectCleared, note]
  ['Richards Rooter and Plumbing', 'name-mismatch:tokens=richards,rooter', 'https://richardsrooterandplumbing.com/', true, true, 'brand in domain'],
  ['Advanced HVAC & Water Heating Repair Beverly Hills', 'empty', 'https://advanced-hvac.com/', true, true, 'discovered real site'],
  ['Murphy Plumbing Services', 'empty', 'http://murphyplumbingandheating.com/', true, true, 'discovered real site'],
  ['Top LA Plumbers', 'empty', 'https://toplaplumbers.com/', true, true, 'generic brand but real site'],
  // legit claims that MUST be kept:
  ['Alvin Garage Door', 'name-mismatch:tokens=alvin', 'https://sswhitegaragedoors.com/', true, false, 'brand truly absent — legit mismatch'],
  ['Joes Plumbing', 'aggregator:yelp.com', 'https://www.yelp.com/biz/joes-plumbing', true, false, 'real aggregator — legit no-website'],
  ['Some Shop', 'empty', '', false, false, 'no audited url + no content — legit no-website'],
];
for (const [name, reason, url, ran, expect, note] of CASES) {
  const got = isCleared(name, reason, url, ran);
  if (got === expect) pass(`${expect ? 'CLEAR' : 'KEEP '} — ${name} (${note})`);
  else fail(`${name}: expected ${expect ? 'CLEAR' : 'KEEP'} but got ${got ? 'CLEAR' : 'KEEP'} (${note})`);
}

if (failed) { console.error(`\nstale-suspect guard: ${failed} FAILED`); process.exit(1); }
console.log('\nstale-suspect guard: all checks passed');
