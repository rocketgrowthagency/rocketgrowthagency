#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-every-plan-is-wired-end-to-end.mjs
//
// 🔒 WHY (2026-10-08, approved every_plan_end_to_end_v1): Chris — "make sure its hooked up for
// actualy paying contracts". No paying contract had ever run, and tracing each plan found that the
// FIRST paying client would have hit three breaks: the Accept email was refused (no sign-in sent),
// the "book your kickoff call" welcome email was blocked by the agreement email, and the emailed
// price left out add-ons. Done-For-You was broken three more ways (email threw, deposit ignored
// website add-ons, the 50% balance was never invoiced).
//
// HOLDS — rendered through the REAL code for every plan × add-on mix, not quoted:
//   1. the agreement/welcome email plan line states the SAME first invoice the charge computes
//      (firstInvoiceAmount / dfyHalf), for 3-Month, Monthly, Done-For-You and Beta, ± add-ons
//   2. the agreement email's NEXT STEPS name Google before the kickoff; beta is never told of an invoice
//   3. "Your first invoice is ready" states the amount; no stray line; beta's stage-1b email has no invoice
//   4. the agreement send keeps its own record; step 1's "already sent" ignores agreement emails
//   5. Accept's stage email carries the admin sign-in; "Send payment link" is gone; Accept says what it does
//   6. beta is never charged; every Done-For-You deposit reads dfyHalf (project + website add-ons)
//   7. the Done-For-You balance invoice exists (function + admin button)
//   8. the agreement never calls the 3-month plan a commitment, and states the real billing day
//
// exit 0 = every plan is wired · 1 = a plan breaks · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); } };
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const fails = []; const F = (m) => fails.push(m);

// Load a function file as a module rooted in the site's functions dir, exposing named internals.
function lift(file, names) {
  const p = `${FN}/${file}`;
  const src = fs.readFileSync(p, "utf8") + `\nmodule.exports.__lift = { ${names.join(", ")} };`;
  const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
  try { m._compile(src, p); } catch (e) { console.error(`🔴 ${file} would not load: ${e.message}`); process.exit(1); }
  return m.exports.__lift;
}
let cg;
try { const req = Module.createRequire(`${FN}/x.js`); cg = req("./contract-generate.js"); }
catch (e) { console.error(`🔴 contract-generate.js would not load: ${e.message}`); process.exit(1); }
for (const k of ["priceSummaryForContract", "dfyHalf", "firstInvoiceAmount", "contractGenerated"]) if (typeof cg[k] !== "function") F(`contract-generate no longer exports ${k}`);
const sce = lift("send-confirmation-email.js", ["planLine", "buildEmail"]);
const ncs = lift("notify-client-stage.js", ["messageFor"]);

const money = (n) => `$${Number(n).toLocaleString()}`;
const mk = (tier, addons = {}, project_total = 0, status = "sent") => ({ id: "c1", tier, status, monthly_price: 0, audit_log: [{ event: "generated_and_sent", addons, project_total }] });
const client = { business_name: "Acme Plumbing", primary_contact_name: "Sam Lee", primary_contact_email: "sam@example.com" };
const CASES = [
  ["commit_3mo", {}], ["commit_3mo", { website_full: true, extra_gbp_locations: 1 }],
  ["monthly", {}], ["monthly", { website_lite: true }], ["monthly", { extra_gbp_locations: 2 }],
  ["done_for_you", {}, 2000], ["done_for_you", { website_lite: true }, 1000],
  ["beta_unbilled", {}],
];
let rendered = 0;
for (const [tier, addons, pt] of CASES) {
  const c = mk(tier, addons, pt || 0);
  const label = `${tier}${Object.keys(addons).length ? " + " + JSON.stringify(addons) : ""}`;
  let line, email;
  try { line = sce.planLine(c); email = sce.buildEmail({ client, contract: c, kickoffWhen: null, tasks: {}, portalUrl: "https://example.com/portal/" }); }
  catch (e) { F(`${label}: the agreement email throws — ${e.message}`); continue; }
  rendered++;
  if (!line) { F(`${label}: no plan line`); continue; }
  const first = tier === "done_for_you" ? cg.dfyHalf(c) : cg.firstInvoiceAmount(tier, addons);
  if (tier === "beta_unbilled") { if (!/no charge/i.test(line)) F(`${label}: beta plan line does not say "no charge"`); }
  else if (!line.includes(money(first))) F(`${label}: the plan line does not state the first invoice the charge computes (${money(first)}): "${line.replace(/\s+/g, " ")}"`);
  if (addons.website_full && !/Website Full/.test(line)) F(`${label}: the add-on is missing from the plan line`);
  const next = email.body.slice(email.body.indexOf("NEXT STEPS"));
  if (!/NEXT STEPS/.test(email.body)) F(`${label}: the agreement email has no NEXT STEPS`);
  else {
    const g = next.search(/Google/), k = next.search(/kickoff/);
    if (g < 0 || k < 0 || g > k) F(`${label}: NEXT STEPS do not put connecting Google before the kickoff`);
    if (tier === "beta_unbilled" && /invoice/i.test(next)) F(`${label}: a beta partner is told about an invoice`);
    if (tier !== "beta_unbilled" && !/invoice/i.test(next)) F(`${label}: a paying client is not told the invoice comes next`);
    if (/nothing else for you to do/i.test(next)) F(`${label}: NEXT STEPS still say "nothing else for you to do"`);
  }
}
// stage emails
{
  const m2 = ncs.messageFor("stage_2_payment", { first: "Sam", kickoffWhen: null, beta: false, amount: 1875 });
  if (!m2 || !m2.body.includes("$1,875")) F("\"Your first invoice is ready\" does not state the amount it was given");
  if (m2 && /\n\s*you\. I will email/.test(m2.body)) F("the stray \"you. I will email you…\" line is back in the invoice email");
  const b1 = ncs.messageFor("stage_1b_admin_review", { first: "Sam", kickoffWhen: null, beta: true });
  if (!b1 || /invoice|before you pay/i.test(b1.body)) F("a beta partner's \"Got your signed agreement\" mentions an invoice");
  const p1 = ncs.messageFor("stage_1b_admin_review", { first: "Sam", kickoffWhen: null, beta: false });
  if (!p1 || !/invoice/i.test(p1.body)) F("a paying client's \"Got your signed agreement\" lost the invoice");
}

// wiring
const N = code(read("netlify/functions/notify-client-stage.js"));
if (!/const msg = messageFor\(stage, \{ first, kickoffWhen, beta, amount \}\);/.test(N)) F("the stage email is no longer given the invoice amount");
if (!/cg\.dfyHalf\(signedContract\)[\s\S]{0,200}cg\.firstInvoiceAmount\(signedContract\.tier/.test(N)) F("the stage email's amount is not computed by the charge's own helpers");
const S = code(read("netlify/functions/send-confirmation-email.js"));
if (!/if \(isAgreementSend\) \{\s*data\.agreement_email = /.test(S)) F("the agreement email writes step 1 again — it would block the welcome email");
if (!/find\(\(c\) => c && c\.gmail_message_id && !isAgreementRecord\(c\)\)/.test(S)) F("step 1's \"already sent\" counts an agreement email");
if (!/require\("\.\/contract-generate\.js"\);\s*const plan = PLANS\[contract\.tier\];\s*const s = priceSummaryForContract\(contract\);/.test(S)) F("the plan line no longer reads the client's own contract");
const A = code(read("admin/admin.js"));
if (!/fetch\("\/\.netlify\/functions\/notify-client-stage", \{\s*method: "POST",\s*headers: await authHeaders\(\),/.test(A)) F("Accept calls the stage email without the admin sign-in — it is refused (401)");
if (/data-send-payment-link|handleSendPaymentLink\(/.test(A)) F("the broken \"Send payment link\" button is back");
if (/Send Payment Link/.test(A)) F("Accept still says \"Send Payment Link\" — no link is sent");
if (!/data-dfy-balance/.test(A) || !/fetch\("\/\.netlify\/functions\/admin-send-balance-invoice"/.test(A)) F("the Done-For-You balance button is missing or not wired");
const PI = code(read("netlify/functions/portal-payment-intent.js"));
if (!/if \(contract\.tier === "beta_unbilled"\) amount = 0;/.test(PI)) F("the payment function can charge a beta contract");
for (const f of ["netlify/functions/portal-payment-intent.js", "netlify/functions/stripe-webhook.js", "netlify/functions/admin-record-payment.js", "netlify/functions/stripe-create-checkout.js"]) {
  const t = code(read(f));
  if (/project_total \|\| 0\) \/ 2|projectTotal \/ 2/.test(t)) F(`${f}: a Done-For-You deposit halves the bare project price again (leaves out website add-ons)`);
  if (/done_for_you/.test(t) && !/dfyHalf\(contract\)/.test(t)) F(`${f}: the Done-For-You deposit does not read dfyHalf`);
}
const ID = code(read("shared/invoice-doc.js"));
if (!/const half = dfyHalf\(\{ projectTotal, addons, plans \}\);/.test(ID)) F("the invoice document halves the bare project price");
const BAL = code(read("netlify/functions/admin-send-balance-invoice.js"));
if (!/invoice_num: 2, amount/.test(BAL) || !/const amount = dfyHalf\(contract\);/.test(BAL)) F("the balance invoice is not invoice #2 at dfyHalf");
if (!/String\(inv1\.status\)\.toLowerCase\(\) !== "paid"/.test(BAL)) F("the balance invoice can open before the deposit is paid");
const OC = code(read("netlify/functions/oauth-google-callback.js"));
if (!/await notifyClientStage\(clientId, "stage_4_onboarding"\);\s*await sendWelcomeEmail\(supaUrl, supaKey, clientId\);/.test(OC)) F("connecting Google no longer sends the welcome email (the stage-3 email promises it)");
if (!/kind: "welcome_email_failed"/.test(OC)) F("a failed automatic welcome email is no longer recorded on the client");
const CG = code(read("netlify/functions/contract-generate.js"));
if (/Client has committed to a/.test(CG) || /-month commitment<\/strong>/.test(CG)) F("the 3-Month agreement calls itself a commitment again");
if (/first business day of each billing period/.test(CG)) F("the agreement promises a billing day the code does not use");
if (/"3-Month Commitment"/.test(code(read("portal/portal.js")))) F("the portal labels the 3-Month plan a commitment");

console.log(`  ${rendered}/${CASES.length} plan × add-on agreement emails rendered through the real code`);
if (fails.length) { console.error("🔴 a plan is not wired end to end:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ every plan is wired: one price from agreement to charge, Accept emails, the welcome email unblocked, DFY balance billed");
