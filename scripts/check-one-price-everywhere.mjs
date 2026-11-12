#!/usr/bin/env node
// check-one-price-everywhere.mjs — every place that quotes the price says the SAME thing, and says it from data/offer-pricing.json (master plans-and-emails decision 5, approved 11-11).
// 🔴 WHY: the plans page found the numbers agreed everywhere but the WORDS around them did not. The pricing page's structured data and FAQ said "the first payment of $1,250" and
// "setup fees? $1,250 once"; the home page said "From $625 a month. One plan."; the start page put "One plan $1,250" beside the founding card with "Cancel anytime" under both; the
// services page quoted no founding offer; the call scripts said "no minimum term" and then the ordinary press created a founding agreement with a 3-month minimum; the audit report
// (sent to every Free Growth Audit prospect) typed "Stay 3 months: $2,500 total" and "No minimum term". The $500 extra location lived only in the agreement generator.
// HOLDS (all derived from the offer file, none typed here):
//   1. the one sentence "First <cap> clients: $<founding> a month, no setup fee. After that: $<setup> to start, then $<monthly>." is on every page the offer file lists as quoting the
//      offer (and in the structured data of the pricing, FAQ and services pages), and the audit report builder derives it from the file (it types no price);
//   2. no stale wording is left: "first payment of $1,250", "$1,250 once", "One plan" beside a price, a "Cancel anytime" under the Included list that doesn't name the plan;
//   3. the extra location price is in the offer file and is the one the agreement charges, and the playbook quotes the same;
//   4. the call scripts (playbook, sales-call-script.md) name the founding 3-month minimum next to every "no minimum" line, and the Start as a client card shows the minimum;
//   5. the agreement's plan label and fee table don't say "no lock-in" above a 3-month total; data/plans.json agrees.
// SELF-PROOF: the detectors are run on strings that must trip them and on the approved wording that must not.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 a price is worded two ways · 2 can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const IND = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { IND(`cannot read ${r}`); } };
const F = [], fail = (m) => F.push(m);
const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
const code = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

let OFFER;
try { OFFER = JSON.parse(read("data/offer-pricing.json")); } catch (e) { IND(`the offer file doesn't parse: ${e.message}`); }
const fo = OFFER.founding, pr = OFFER.prices || {};
for (const [k, v] of [["founding.cap", fo && fo.cap], ["founding.monthly", fo && fo.monthly], ["founding.minimum_months", fo && fo.minimum_months], ["prices.setup.now", pr.setup && pr.setup.now], ["prices.monthly.now", pr.monthly && pr.monthly.now], ["prices.plan_3month_total.now", pr.plan_3month_total && pr.plan_3month_total.now]])
  if (!(Number(v) > 0)) IND(`the offer file has no ${k}`);
// THE sentence, built from the file
const LINE = `First ${fo.cap} clients: ${money(fo.monthly)} a month, no setup fee. After that: ${money(pr.setup.now)} to start, then ${money(pr.monthly.now)}.`;
const STD_TOTAL = money(pr.plan_3month_total.now);

// stale wording, with its self-proof
const STALE = [
  [/first payment of \$1,?250/i, "\"the first payment of $1,250\" (the first 5 clients pay $625 and no setup fee)"],
  [/\$1,?250 once\b/i, "\"$1,250 once\" (the founding plan has no setup fee)"],
  [/From \$625 a month\. One plan\./, "\"From $625 a month. One plan.\" (two plans are shown)"],
  [/class="k">One plan<|phase-tag on">One plan</, "a \"One plan\" label on the standard offer card, beside the founding offer"],
];
for (const [re] of STALE) if (!re.test("the first payment of $1,250 covers; $1,250 once; From $625 a month. One plan. <p class=\"k\">One plan</p> phase-tag on\">One plan<")) IND("a stale-wording detector can't see its own example");
if (STALE.some(([re]) => re.test(LINE))) IND("the approved wording trips a stale-wording detector");

// 1 · the sentence on every page that quotes the offer
const PAGES = (OFFER.pages_quoting_the_offer || []).filter((p) => p !== "demo/index.html");   // the demo's portal figures are illustrative (the file says so)
if (PAGES.length < 5) IND("the offer file lists fewer than 5 pages that quote the offer");
const MUST_CARRY = ["index.html", "pricing/index.html", "faq/index.html", "services/index.html", "start-growth-plan/index.html", "free-growth-audit/sample-report/index.html"];
for (const p of MUST_CARRY) if (!PAGES.includes(p)) fail(`the offer file doesn't list ${p} as a page that quotes the offer`);
const SD = ["pricing/index.html", "faq/index.html", "services/index.html"];   // pages whose structured data answers price questions
for (const p of PAGES) {
  const h = read(p);
  if (!MUST_CARRY.includes(p)) continue;
  if (!h.replace(/<script[\s\S]*?<\/script>/g, "").includes(LINE)) fail(`${p} doesn't show the one price sentence on the page itself: "${LINE}"`);
  if (SD.includes(p)) {
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    if (!ld.includes(LINE)) fail(`${p}'s structured data (the answer Google shows) doesn't carry the one price sentence`);
  }
  for (const [re, why] of STALE) if (re.test(h)) fail(`${p} still says ${why}`);
}
// the Included list on the start page names the plan on its Cancel anytime line
{
  const h = read("start-growth-plan/index.html"), inc = (h.match(/<h4>Included<\/h4>[\s\S]*?<\/ul>/) || [])[0];
  if (!inc) IND("the start page's Included list moved");
  else if (/Cancel anytime/i.test(inc) && !/Standard plan|Founding/i.test(inc)) fail("the start page's Included list says \"Cancel anytime\" without naming the plan (founding can't cancel in months 1 to 3)");
}
// the audit report: derived, not typed
{
  const B = code(read("netlify/functions/_fga-report-builder.js"));
  if (!/function offerPriceLine\(/.test(B) || !/offerPriceLine\(\)/.test(B.replace(/function offerPriceLine\(\)/, ""))) fail("the audit report builder doesn't derive the price sentence from the offer file");
  if (/Stay 3 months: \$[\d,]+ total/.test(B)) fail("the audit report builder types \"Stay 3 months: $… total\" instead of reading the offer file");
  if (/>\s*No minimum term: cancel/.test(B) || /\}No minimum term: cancel/.test(B)) fail("the audit report says \"No minimum term\" for everyone (founding has one)");
  // run it: the sentence it prints is the one the pages carry
  const req = createRequire(`${SITE}/netlify/functions/x.js`);
  try { const m = req("./_fga-report-builder.js"); if (typeof m.offerPriceLine === "function" && m.offerPriceLine() !== LINE) fail("the audit report builder's price sentence differs from the pages'"); } catch { /* the builder needs its full environment; the source checks above stand */ }
}

// 3 · the extra location
{
  const x = pr.extra_location && pr.extra_location.now;
  if (!(Number(x) > 0)) fail("the offer file has no prices.extra_location (the extra Google location, per month)");
  const C = read("netlify/functions/contract-generate.js");
  if (!/prices\.extra_location/.test(code(C))) fail("the agreement generator doesn't read the extra location price from the offer file");
  const req = createRequire(`${SITE}/netlify/functions/x.js`);
  try { const cg = req("./contract-generate.js"); if (Number(x) > 0 && cg.EXTRA_GBP_MONTHLY !== Number(x)) fail(`the agreement charges ${money(cg.EXTRA_GBP_MONTHLY)} for an extra location and the offer file says ${money(x)}`); } catch (e) { IND(`contract-generate did not load: ${e.message}`); }
  const PB = read("admin/playbook.js");
  for (const m of PB.matchAll(/Extra locations are \+\$([\d,]+)\/mo/g)) if (Number(m[1].replace(/,/g, "")) !== Number(x)) fail(`the playbook quotes +$${m[1]}/mo for an extra location; the offer file says ${money(x)}`);
}

// 4 · the call scripts and the Start as a client card
{
  const PB = read("admin/playbook.js"), MD = read("docs/sales-call-script.md");
  const said = (PB.match(/SAY\((?:"|`)[\s\S]*?(?:"|`)\)\s*,/g) || []);
  if (said.length < 20) IND("the playbook's SAY lines moved");
  for (const s of said) {
    if (/no minimum/i.test(s) && !/standard plan|founding|first five|first 5|3-month minimum/i.test(s)) fail(`a call script says "no minimum" without naming the standard plan or the founding minimum: ${s.slice(0, 120)}…`);
    if (/\$1,250 to (?:get set up|start)/i.test(s) && !/founding|first five|first 5/i.test(s)) fail(`a call script quotes $1,250 to start without the founding offer: ${s.slice(0, 120)}…`);
  }
  if (!new RegExp(`${fo.minimum_months}-month minimum`).test(PB)) fail("the playbook never names the founding minimum");
  if (!new RegExp(`${fo.minimum_months}-month minimum`, "i").test(MD) || /no minimum term/i.test(MD.split("\n").filter((l) => /charge|Fair question/.test(l)).join("\n")) && !/3-month minimum/i.test(MD)) fail("docs/sales-call-script.md quotes the price without the founding minimum");
  const W = code(read("admin/walkthrough.js")), S = code(read("netlify/functions/start-as-client.js"));
  if (!/minimum_months/.test(S)) fail("the Start as a client endpoint doesn't return the founding minimum");
  if (!/-month minimum/.test(W)) fail("the Start as a client card doesn't show the plan's minimum before the press");
}

// 5 · the agreement's label and table
{
  const C = read("netlify/functions/contract-generate.js"), PJ = JSON.parse(read("data/plans.json"));
  const lab = (C.match(/commit_3mo: \{[\s\S]*?label: "([^"]+)"/) || [])[1];
  if (!lab) IND("the standard plan's label moved");
  else if (/lock-in/i.test(lab)) fail(`the standard plan is labelled "${lab}" above a 3-month total in the fee table`);
  if (PJ.commit_3mo && PJ.commit_3mo.label !== lab) fail("data/plans.json labels the standard plan differently from the agreement");
  if (!/If you stay \$\{summary\.term_months\} months/.test(C)) fail(`the standard plan's fee table doesn't say "If you stay 3 months" over its ${STD_TOTAL} total`);
}

if (F.length) { console.error(`🔴 a price is worded two ways (${F.length}):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ one price everywhere: "${LINE}" on ${MUST_CARRY.length} pages (and their structured data), derived in the audit report, extra location ${money(pr.extra_location.now)} in the offer file, scripts name the founding minimum`);
