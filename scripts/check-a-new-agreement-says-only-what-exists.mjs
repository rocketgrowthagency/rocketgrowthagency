#!/usr/bin/env node
// check-a-new-agreement-says-only-what-exists.mjs — a NEW agreement promises only a payment method the system really takes, and calls each plan what it is (master plans-and-emails decision 4, approved 11-11).
// 🔴 WHY: Section 4 said "Fees are billed monthly in advance via Stripe (credit card or ACH)". Since 09-11 both the Checkout session (stripe-create-checkout.js) and the portal's payment
// intent (portal-payment-intent.js) send payment_method_types card ONLY. A client who tried to pay by ACH had nothing to press, and the agreement they signed said they could.
// check-the-contract-promises-only-what-the-code-does looked for directories and grids, not for payment methods. And the standard plan was labelled "(no lock-in)" above a "Total for the
// first 3 months" row: correct in law, easy to misread as a 3-month commitment.
// HOLDS (nothing is typed here that the code can tell us):
//   1. the payment methods the code takes are READ from the two payment functions; an agreement for EVERY plan (founding, standard, monthly, done-for-you, beta) names only those methods;
//   2. no plan's agreement says "ACH", "bank transfer", "wire" or "credit card or" as a way to pay (self-proof below);
//   3. the standard plan's label has no "lock-in" and its fee table reads "If you stay 3 months"; the founding plan's reads as a minimum;
//   4. a SIGNED agreement is never rewritten: the only server code that writes contract_html is the generator's insert of a new row, and the signature check re-hashes the stored text;
//   5. signed agreements are not re-rendered from the template anywhere on the server (no second call of the section builders).
// SELF-PROOF: the method detector is run on "credit card or ACH" and must see two methods, and on today's sentence and must see one.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 the agreement promises something that doesn't exist · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const IND = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { IND(`cannot read ${r}`); } };
const code = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = [], fail = (m) => F.push(m);

// the ways a document can say "pay this way"
const METHODS = { card: /\bcredit card|\bdebit card|\bby card\b|\bcard\b/i, ach: /\bACH\b|\bbank (?:account|transfer|debit)\b|us_bank_account/i, wire: /\bwire transfer|\bby wire\b/i, check: /\bby check\b|\bpay(?:ing)? by check\b|\bcheque\b/i, paypal: /\bPayPal\b/i, crypto: /\bcrypto|\bbitcoin/i };
const methodsIn = (text) => Object.entries(METHODS).filter(([, re]) => re.test(text)).map(([k]) => k);
{ const a = methodsIn("billed via Stripe (credit card or ACH)"), b = methodsIn("billed via Stripe by card");
  if (!(a.includes("card") && a.includes("ach")) || b.join() !== "card") IND(`the method detector can't tell "credit card or ACH" (${a}) from "by card" (${b})`); }

// 1 · what the code takes
const stripeTypes = (file) => [...code(read(file)).matchAll(/payment_method_types(?:\[\])?["']?\s*[:\]=]?\s*["'\[]*\s*([a-z_]+)/g)].map((m) => m[1]);
const TAKEN = new Set();
for (const f of ["netlify/functions/stripe-create-checkout.js", "netlify/functions/portal-payment-intent.js"]) {
  const t = stripeTypes(f);
  if (!t.length) IND(`${f} no longer names payment_method_types`);
  for (const x of t) TAKEN.add(x === "us_bank_account" ? "ach" : x);
}
if (!TAKEN.size) IND("could not read the payment methods the code takes");

// build an agreement for every plan
function lift(file, names) {
  const p = `${FN}/${file}`;
  const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
  try { m._compile(`${fs.readFileSync(p, "utf8")}\nmodule.exports.__lift = { ${names.join(", ")} };`, p); } catch (e) { IND(`${file} would not load: ${e.message}`); }
  return m.exports.__lift;
}
Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
process.removeAllListeners("warning");
const req = createRequire(`${FN}/x.js`);
let cg, buildContractHtml;
try { cg = req("./contract-generate.js"); ({ buildContractHtml } = lift("contract-generate.js", ["buildContractHtml"])); } catch (e) { IND(`contract-generate did not load: ${e.message}`); }
const client = { business_name: "Acme Plumbing", primary_contact_name: "Sam Lee" };
const doc = (plan_code, addons = {}, project_total = 0) => buildContractHtml({ client, plan_code, addons: { extra_gbp_locations: 0, founding: plan_code === "founding", ...addons }, project_total, governing_state: "California" });
const PLANS = ["founding", "commit_3mo", "monthly", "done_for_you", "beta_unbilled"];
const html = {};
for (const p of PLANS) { try { html[p] = doc(p, {}, p === "done_for_you" ? 3000 : 0); } catch (e) { fail(`the ${p} agreement would not build: ${e.message}`); } }
if (Object.keys(html).length < 4) IND("fewer than 4 agreements built");
const text = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&mdash;/g, "-").replace(/\s+/g, " ");

for (const [p, h] of Object.entries(html)) {
  const said = methodsIn(text(h)), notTaken = said.filter((m) => !TAKEN.has(m));
  if (notTaken.length) fail(`the ${p} agreement names a way to pay the system doesn't take: ${notTaken.join(", ")} (the code takes: ${[...TAKEN].join(", ")})`);
  if (/\bACH\b/.test(text(h))) fail(`the ${p} agreement says "ACH"`);
  if (/credit card or/i.test(text(h))) fail(`the ${p} agreement says "credit card or …"`);
}
// the billing line itself, where it exists, says how a client pays and names a method that exists
for (const p of ["founding", "commit_3mo", "monthly", "beta_unbilled"]) {
  if (!html[p]) continue;
  const line = (text(html[p]).match(/Fees are billed monthly in advance via Stripe[^.]*\./) || [])[0];
  if (!line) fail(`the ${p} agreement's billing line moved (Section 4)`);
  else if (!/\bby card\b/i.test(line)) fail(`the ${p} agreement's billing line doesn't say how a client pays ("${line}")`);
}

// 3 · the labels
{
  const std = html.commit_3mo || "", fnd = html.founding || "";
  if (/no lock-in\)/i.test(cg.PLANS.commit_3mo.label) || /\(no lock-in\)/i.test(text(std).replace(/There is no lock-in\./g, ""))) fail("the standard plan is labelled \"(no lock-in)\" above its 3-month total");
  if (!/If you stay 3 months/.test(text(std))) fail("the standard plan's fee table doesn't read \"If you stay 3 months\"");
  if (/Total for the first 3 months/.test(text(std))) fail("the standard plan's fee table still reads \"Total for the first 3 months\"");
  if (!/Total for the first 3 months/.test(text(fnd))) fail("the founding plan's fee table lost its \"Total for the first 3 months\" (it is a real minimum)");
  if (!/Three-month minimum:\s*Client commits to the first three \(3\) months/.test(text(fnd))) fail("the founding agreement doesn't state its three-month minimum in its founding terms (Section 2A)");
}

// 4 + 5 · a signed agreement is never rewritten
{
  const files = fs.readdirSync(FN).filter((f) => f.endsWith(".js"));
  const writers = files.filter((f) => /contract_html\s*:/.test(code(fs.readFileSync(`${FN}/${f}`, "utf8"))));
  if (writers.join() !== "contract-generate.js") fail(`server code other than the generator writes contract_html: ${writers.filter((f) => f !== "contract-generate.js").join(", ") || "(the generator no longer does)"}`);
  const sign = code(read("netlify/functions/contract-sign.js"));
  if (!/createHash\("sha256"\)\.update\(contract\.contract_html\)/.test(sign)) fail("the signature check no longer re-hashes the stored agreement text");
  const callers = files.filter((f) => f !== "contract-generate.js" && /buildContractHtml|buildFeesSection|buildTermSection/.test(code(fs.readFileSync(`${FN}/${f}`, "utf8"))));
  if (callers.length) fail(`${callers.join(", ")} re-render the agreement from the template, which would change a signed one`);
  const G = code(read("netlify/functions/contract-generate.js"));
  if (!/contract_html: html/.test(G)) IND("the generator's insert of contract_html moved");
  if (/method:\s*"PATCH"[^\n]*contract_html|contract_html[^\n]*method:\s*"PATCH"/.test(G)) fail("the generator PATCHes contract_html on an existing row (it would rewrite a signed agreement)");
}

if (F.length) { console.error(`🔴 a new agreement promises something that doesn't exist, or calls a plan the wrong thing (${F.length}):`); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ a new agreement names only the way to pay the code takes (${[...TAKEN].join(", ")}), for all ${Object.keys(html).length} plans; the standard plan reads "If you stay 3 months"; a signed agreement is never rewritten`);
