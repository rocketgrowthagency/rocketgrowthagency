#!/usr/bin/env node
/**
 * check-contract-matches-playbook.mjs — the contract must charge what the rep quoted.
 *
 * ─── WHY (2026-08-25) ────────────────────────────────────────────────────────────────────────────
 * `admin/playbook.js` (what a rep reads on the call) sold the current 50%-off offer:
 *
 *     setup $1,250 once · $625/mo from month 2
 *     month-to-month  month 1 $1,875   ·  3-month plan $2,500 all-in, "optional, not a lock-in"
 *
 * `netlify/functions/contract-generate.js` (what produces the actual signed document) still held the
 * PRE-DISCOUNT structure:
 *
 *     monthly     month 1 $3,750, then $1,250/mo
 *     commit_3mo  $2,500 + $1,250 + $1,250 = $5,000, early_termination "lockout"
 *
 * So closing a prospect at $1,875 month-to-month and pressing "Send contract" handed them a document
 * charging **$3,750 with a three-month lockout we do not sell**. Either the client walks, or we honour
 * the quote and eat half the recurring — discovered on the first real call.
 *
 * This had already happened once: `docs/sales-call-script.md` quoted the same old structure and was
 * fixed in 4b90994. That fix corrected the doc a REP reads and left the CONTRACT GENERATOR untouched,
 * because nothing compared the two.
 *
 * > **Two places holding the same price will drift. The only question is whether anything notices.**
 *
 * INVARIANTS
 *  1. The playbook Pricing table still states setup $1,250 / monthly $625 / 3-month $2,500 / M2M $1,875.
 *  2. `monthly` bills month 1 = $1,875 and recurs at $625.
 *  3. `commit_3mo` totals $2,500 across its schedule and recurs at $625.
 *  4. The 3-month plan saves exactly $625 against three months of month-to-month.
 *  5. 🔒 `commit_3mo` is NOT a lockout — we sell it as "optional, not a lock-in".
 *
 * Exit 0 = they agree, 1 = they have drifted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE = path.join(path.dirname(path.dirname(HERE)), 'Rocket Growth Agency Website VS Code');
const PLAYBOOK = path.join(WEBSITE, 'admin', 'playbook.js');
const GENERATOR = path.join(WEBSITE, 'netlify', 'functions', 'contract-generate.js');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

for (const [p, n] of [[PLAYBOOK, 'admin/playbook.js'], [GENERATOR, 'contract-generate.js']]) {
  if (!fs.existsSync(p)) fail(`${n} not found at ${p}`);
}
const pb = fs.readFileSync(PLAYBOOK, 'utf8');
const gen = fs.readFileSync(GENERATOR, 'utf8');

// ── 1. The playbook still says what we think it says ────────────────────────────────────────────
// If the OFFER changes, this check must fail loudly so both sides get updated together — rather than
// silently validating the generator against a playbook that itself moved.
const EXPECT = { setup: 1250, monthly: 625, threeMonthTotal: 2500, m2mMonth1: 1875 };
const pbHas = (s) => pb.includes(s);
if (!pbHas('$1,250') || !pbHas('$625/mo') || !pbHas('$2,500 total') || !pbHas('$1,875')) {
  fail('the playbook Pricing table no longer states $1,250 setup / $625 a month / $2,500 3-month /\n' +
       '         $1,875 month-to-month. If the OFFER changed, update this check AND the generator in the\n' +
       '         same commit — that is the whole point of this gate.');
}
ok('playbook Pricing table reads $1,250 setup · $625/mo · $2,500 3-month · $1,875 M2M');

// ── 2-3. Pull the generator's real numbers out of its plan registry ─────────────────────────────
const planBlock = (name) => {
  const i = gen.indexOf(`${name}: {`);
  if (i === -1) fail(`plan "${name}" is missing from contract-generate.js.`);
  return gen.slice(i, gen.indexOf('\n  },', i));
};
const amounts = (block) => [...block.matchAll(/amount:\s*(\d+)/g)].map((m) => Number(m[1]));
const recurring = (block) => {
  const m = block.match(/recurring_after_term:\s*(\d+)/);
  if (!m) fail('recurring_after_term missing.');
  return Number(m[1]);
};

const monthly = planBlock('monthly');
const mAmt = amounts(monthly);
if (mAmt.length !== 1 || mAmt[0] !== EXPECT.m2mMonth1) {
  fail(`monthly plan bills month 1 = $${mAmt.join('+') || '?'}, but the rep quotes $${EXPECT.m2mMonth1}.\n` +
       '         A prospect who says yes to the quote would open a contract for a different number.');
}
if (recurring(monthly) !== EXPECT.monthly) {
  fail(`monthly plan recurs at $${recurring(monthly)}/mo, but the rep quotes $${EXPECT.monthly}/mo.`);
}
ok(`monthly plan: month 1 $${mAmt[0]}, then $${recurring(monthly)}/mo — matches the quote`);

const commit = planBlock('commit_3mo');
const cAmt = amounts(commit);
const cTotal = cAmt.reduce((a, b) => a + b, 0);
if (cTotal !== EXPECT.threeMonthTotal) {
  fail(`commit_3mo totals $${cTotal} (${cAmt.join(' + ')}), but the rep sells $${EXPECT.threeMonthTotal} all-in.`);
}
if (recurring(commit) !== EXPECT.monthly) {
  fail(`commit_3mo recurs at $${recurring(commit)}/mo after the term, expected $${EXPECT.monthly}.`);
}
ok(`commit_3mo: ${cAmt.join(' + ')} = $${cTotal} all-in, then $${recurring(commit)}/mo`);

// ── 4. The advertised saving must be real ───────────────────────────────────────────────────────
const m2mThree = EXPECT.m2mMonth1 + EXPECT.monthly * 2;
const saving = m2mThree - cTotal;
if (saving !== 625) {
  fail(`the 3-month plan saves $${saving} against three months month-to-month ($${m2mThree}), but the\n` +
       '         playbook advertises "Saves $625". Never advertise a discount the contract does not give.');
}
ok(`3-month plan saves $${saving} vs $${m2mThree} month-to-month — matches "Saves $625"`);

// ── 5. 🔒 Not a lockout ─────────────────────────────────────────────────────────────────────────
if (/early_termination:\s*"lockout"/.test(commit)) {
  fail('commit_3mo is marked early_termination "lockout". The playbook sells it as "optional, not a\n' +
       '         lock-in" and reps say "cancel any month". Generating a lockout after saying that is a\n' +
       '         contradiction the client reads back to you.');
}
ok('commit_3mo is not a lockout — matches "optional, not a lock-in"');

// Website add-ons: the playbook sells $750 / $1,750.
if (!/WEBSITE_LITE\s*=\s*750/.test(gen) || !/WEBSITE_FULL\s*=\s*1750/.test(gen)) {
  fail('website add-ons are not $750 / $1,750 — the playbook Pricing table sells those figures.');
}
ok('website add-ons $750 / $1,750 match the playbook');

console.log('✅ the contract charges exactly what the rep quoted.');
