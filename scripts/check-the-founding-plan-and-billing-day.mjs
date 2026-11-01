#!/usr/bin/env node
// check-the-founding-plan-and-billing-day.mjs — the contract's money terms are what the code does (approved contract_v2_redline + pricing_page_v3, 10-31).
// 🔴 WHY: a founding agreement charged $1,250, printed the setup refund and said "no lock-in" while the offer said no setup fee and a real minimum. "$625/month" billed every 30 days, about
// $104 a year over 12 x $625. The liability cap could come out to $0. And NOTHING recorded a cancellation, so a client who left kept getting charged.
// HOLDS, through the real generator and real functions: founding bills 625, 625, 625 and says so with no standard-plan words; the standard plan is untouched; every V2 section is in the signed text and the
// retired V1 lines are gone; every invoice path uses one calendar-day module; a month-end date doesn't walk; a notice stops billing and prorates; the founding minimum can't be shortened; a withdrawn notice reopens billing;
// the invoice document states what the row charges and that Google's profile is free; the public founding card matches the source.
// Files only. Exit 0 = holds · 1 = broken · 2 = can't tell. → project_price_change_runbook
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const money = (a) => JSON.stringify(a);
function lift(file, names) {
  const p = `${FN}/${file}`;
  const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
  try { m._compile(`${fs.readFileSync(p, "utf8")}\nmodule.exports.__lift = { ${names.join(", ")} };`, p); } catch (e) { console.error(`🔴 ${file} would not load: ${e.message}`); process.exit(1); }
  return m.exports.__lift;
}
const req = createRequire(`${FN}/x.js`);
const cg = req("./contract-generate.js"), { buildContractHtml } = lift("contract-generate.js", ["buildContractHtml"]);
const bd = req("./_billing-dates.js"), { planInvoices } = req("./admin-record-cancellation.js");
const client = { business_name: "Acme Plumbing", primary_contact_name: "Sam Lee" };
const doc = (plan_code, addons = {}, project_total = 0) => buildContractHtml({ client, plan_code, addons: { extra_gbp_locations: 0, founding: plan_code === "founding", ...addons }, project_total, governing_state: "California" });

// ── the founding plan
const PF = cg.PLANS.founding, PJ = JSON.parse(read("data/plans.json")), OFFER = JSON.parse(read("data/offer-pricing.json"));
if (!PF) fail("the founding plan is gone");
else {
  if (PF.schedule.map((r) => r.amount).join() !== "625,625,625") fail("the founding plan doesn't bill 625, 625, 625");
  if (cg.firstInvoiceAmount("founding") !== 625) fail("a founding client's first charge isn't $625");
  if (PF.minimum_months !== 3) fail("the founding plan has no 3-month minimum");
  if (money(PJ.founding?.schedule) !== money(PF.schedule) || PJ.founding?.minimum_months !== PF.minimum_months) fail("data/plans.json disagrees with the founding plan");
  const o = OFFER.founding || {};
  if (o.monthly !== PF.schedule[0].amount || o.setup !== 0 || o.minimum_months !== PF.minimum_months || o.minimum_total !== 1875 || o.cap !== cg.FOUNDING_CAP) fail("the advertised founding offer disagrees with the plan it bills");
}
const FD = doc("founding"), SD = doc("commit_3mo");
for (const w of ["2A. Founding Client Terms", "No setup fee:", "Three-month minimum:", "$1,875", "the fees for all three remain due", "No part of the price depends on Client leaving a review of RGA", "Published results come from public sources and those figures"]) if (!FD.includes(w)) fail(`the founding agreement lost: ${w}`);
for (const w of ["$1,250", "There is no lock-in", "4A. Setup Delivery Promise", "not a commitment", "There is no minimum term"]) if (FD.includes(w)) fail(`the founding agreement carries a standard-plan line: ${w}`);
const CS = read("netlify/functions/contract-generate.js");
if (!/plan_code === "commit_3mo" && addons\.founding \? "founding"/.test(CS)) fail("the old founding add-on can still produce a $1,250 founding agreement");
if (!/founding: plan_code === "founding"/.test(CS)) fail("a founding agreement isn't marked, so the cap can't count it");
if (!/if \(plan_code === "founding"\) \{\s*let taken;/.test(CS)) fail("the founding plan doesn't go through the cap");

// ── the standard plan didn't move
if (cg.PLANS.commit_3mo.schedule.map((r) => r.amount).join() !== "1250,625,625") fail("the standard plan no longer bills 1250, 625, 625");
for (const w of ["There is no lock-in", "There is no minimum term", "4A. Setup Delivery Promise", "$1,250", "$2,500"]) if (!SD.includes(w)) fail(`the standard agreement lost: ${w}`);
if (SD.includes("2A. Founding")) fail("the standard agreement prints founding terms");

// ── every plan's text is V2
for (const [name, html] of [["founding", FD], ["standard", SD], ["project", doc("done_for_you", {}, 2000)], ["beta", doc("beta_unbilled")]]) {
  for (const w of ["5B. Google Business Profile Authorization", "5C. Account Ownership and Leaving", "5D. Call Tracking and Recording", "5E. AI and Software Tools", "6A. Platforms", "9A. Data, Security and Breach", "10A. Indemnification", "16. General", "THE GREATER OF", "$2,500", "Google Business Profile is a service Google provides at no extra cost", "2C. Testimonials", "At the end, in every case and whatever is owed"]) if (!html.includes(w)) fail(`${name}: missing "${w}"`);
  for (const w of ["cannot guarantee results if", "account manager", "Data Axle", "Neustar", "AS IS", "1.5%", "RGA founder", "login credentials", "industry-proven", "Google Inc", "every 30 days", "first two weeks", "three (3) calendar months"]) if (html.includes(w)) fail(`${name}: V1 wording is back: "${w}"`);
}
for (const [name, html] of [["founding", FD], ["standard", SD]]) if (!html.includes("on the same calendar day each month")) fail(`${name}: the agreement doesn't state the billing day`);
if (!FD.includes("RGA bills through the end date, prorated") || !SD.includes("RGA bills through the end date, prorated")) fail("the agreement no longer says the last bill is prorated");

// ── one billing-day module, used everywhere an invoice opens
for (const f of ["stripe-webhook.js", "admin-record-payment.js", "billing-daily-check.js"]) {
  const code = read(`netlify/functions/${f}`).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  if (/getDate\(\) \+ 30/.test(code)) fail(`${f} opens an invoice 30 days out, not on the billing day`);
  if (!/invoiceFor\(\{/.test(code)) fail(`${f} doesn't ask _billing-dates.js when the next invoice falls`);
  if (!/standingNotice\(contract\)/.test(code)) fail(`${f} opens invoices without looking for a cancellation notice`);
}
if (/30 \* 24 \* 60 \* 60 \* 1000\)\s*\n\s*: null/.test(read("portal/portal.js"))) fail("the portal still estimates the next invoice as +30 days");
const eq = (got, want, what) => { if (money(got) !== money(want)) fail(`${what}: got ${money(got)}, expected ${money(want)}`); };
eq(bd.billingDateFor("2027-01-31", 2), "2027-02-28", "Jan 31 + 1 month");
eq(bd.billingDateFor("2027-01-31", 3), "2027-03-31", "the day walks down after a short month");
eq(bd.billingDateFor("2028-01-31", 2), "2028-02-29", "a leap year");
eq(bd.businessYmd("2026-09-11T00:28:36Z"), "2026-09-10", "a payment after 5 PM Pacific is dated in UTC");
eq(bd.endDateFromNotice("2027-02-10", "2027-01-01"), "2027-03-12", "thirty days' notice");
eq(bd.endDateFromNotice("2027-01-05", "2027-01-01", 3), "2027-04-01", "notice inside the founding minimum");
eq(bd.endDateFromNotice("2027-03-20", "2027-01-01", 3), "2027-04-19", "notice near the end of the minimum");
eq(bd.invoiceFor({ firstYmd: "2027-01-01", invoiceNum: 3, amount: 625, endsOn: "2027-03-12" }), { due_date: "2027-03-01", amount: 221.77, prorated: true }, "the last invoice");
eq(bd.invoiceFor({ firstYmd: "2027-01-01", invoiceNum: 4, amount: 625, endsOn: "2027-03-12" }), null, "an invoice after the end date");
eq(bd.invoiceFor({ firstYmd: "2027-01-01", invoiceNum: 3, amount: 625, endsOn: "2027-04-01" }), { due_date: "2027-03-01", amount: 625, prorated: false }, "a founding third month is billed whole");
eq(bd.standingNotice({ audit_log: [{ event: "cancel_notice", ends_on: "2027-03-12" }, { event: "cancel_withdrawn" }] }), null, "a withdrawn notice still stands");

// ── a notice really changes the invoices, and withdrawing undoes it
const contract = (log = []) => ({ tier: "commit_3mo", audit_log: [{ event: "generated_and_sent", addons: {} }, ...log] });
const paid = [{ id: "a", invoice_num: 1, amount: 1250, status: "paid", due_date: "2027-01-01" }, { id: "b", invoice_num: 2, amount: 625, status: "paid", due_date: "2027-02-01" }];
let plan = planInvoices({ contract: contract(), invoices: [...paid, { id: "c", invoice_num: 3, amount: 625, status: "upcoming", due_date: "2027-03-01" }], firstYmd: "2027-01-01", endsOn: "2027-03-12" }).changes;
if (plan.update[0]?.want.amount !== 221.77) fail("a notice doesn't prorate the open invoice");
plan = planInvoices({ contract: contract(), invoices: [...paid, { id: "c", invoice_num: 3, amount: 625, status: "upcoming", due_date: "2027-03-01" }], firstYmd: "2027-01-01", endsOn: "2027-03-01" }).changes;
if (plan.remove[0]?.id !== "c") fail("an invoice after the end date stays on the books");
plan = planInvoices({ contract: contract(), invoices: [...paid, { id: "c", invoice_num: 3, amount: 625, status: "overdue", due_date: "2027-03-01" }], firstYmd: "2027-01-01", endsOn: "2027-03-01" }).changes;
if (plan.remove.length) fail("an invoice someone has already been asked to pay was deleted");
plan = planInvoices({ contract: contract(), invoices: paid, firstYmd: "2027-01-01", endsOn: null }).changes;
if (plan.create?.invoice_num !== 3 || plan.create?.amount !== 625 || plan.create?.due_date !== "2027-03-01") fail("withdrawing a notice doesn't open the next invoice");
if (!/await closeEndedAgreements\(\)/.test(read("netlify/functions/billing-daily-check.js"))) fail("nothing closes an agreement when its notice runs out");
const AJ = read("admin/admin.js");
if (!/data-contract-action="record_notice"/.test(AJ) || !/data-contract-action="withdraw_notice"/.test(AJ)) fail("admin has no way to record or withdraw a notice");
if (!/admin-record-cancellation/.test(AJ)) fail("admin's notice button doesn't reach the function");
if (!/handleContractAction\(action, id, btn\)/.test(AJ)) fail("the notice button can't show it's working");
if (/rga-plan-founding/.test(AJ)) fail("the picker can still tick founding on the standard plan");
if (!/ORDER = \["commit_3mo", "founding"/.test(AJ)) fail("the picker doesn't offer the founding plan");

// ── the document matches the charge
const { buildInvoiceDoc } = await import(path.join(SITE, "shared/invoice-doc.js"));
const inv = (over) => buildInvoiceDoc({ tier: "commit_3mo", invoiceNum: 3, plans: PJ, contractId: "6c32e26f-0000-0000-0000-000000000000", status: "due", mode: "email", ...over });
const finalDoc = inv({ chargedAmount: 221.77, finalThrough: "2027-03-12" });
if (!/final period/.test(finalDoc) || !/221\.77/.test(finalDoc) || !/March 12, 2027/.test(finalDoc)) fail("the last invoice's document doesn't state the prorated amount and date");
if (/What comes next/.test(finalDoc)) fail("the last invoice promises another one");
if (/final period/.test(inv({ chargedAmount: 625, finalThrough: "2027-04-01" }))) fail("a whole month reads as prorated");
if (!/at no extra cost/.test(inv({}))) fail("the invoice no longer says Google's profile is free");
if (/at no extra cost/.test(inv({ tier: "beta_unbilled", invoiceNum: 1 }))) fail("a no-charge invoice talks about a fee");
if (!/\$625/.test(inv({ tier: "founding", invoiceNum: 1 })) || /\$1,250/.test(inv({ tier: "founding", invoiceNum: 1 }).replace(/What comes next[\s\S]*/, ""))) fail("a founding client's first invoice isn't $625");
const SE = read("netlify/functions/send-invoice-email.js");
if (!/chargedAmount: inv\?\.amount/.test(SE) || !/finalThrough: standingNotice\(contract\)/.test(SE)) fail("the emailed invoice isn't told about the final period");

// ── the public founding card
const CARD = "No setup fee. Your price stays $625 a month for 12 months. 3-month minimum, then cancel with 30 days' notice.";
for (const [n, f] of [["pricing", "pricing/index.html"], ["home", "index.html"]]) if (!read(f).includes(CARD)) fail(`${n} lost the founding terms`);
const SG = read("start-growth-plan/index.html");
if (!SG.includes("<strong>$625/month, no setup fee.</strong> Your price stays $625 a month for 12 months. 3-month minimum, then cancel with 30 days' notice.")) fail("the checkout page lost the founding terms");
for (const [n, f] of [["pricing", "pricing/index.html"], ["home", "index.html"], ["checkout", "start-growth-plan/index.html"]]) if (/The same price, held for 12 months/.test(read(f))) fail(`${n} still says founding is the same price`);
for (const [n, s] of [["pricing", read("pricing/index.html")], ["checkout", SG]]) if (!/Founding clients have a 3-month minimum/.test(s)) fail(`${n}: "no minimum term" reads as if it covers founding clients`);
if (/\bfree\b/i.test((read("pricing/index.html").match(/Founding clients &middot; 5 places[\s\S]*?Ask about a founding place/) || [""])[0])) fail("the founding card says \"free\" (it's \"no setup fee\")");
if (!/<b>\$625\/mo, no setup fee<\/b>/.test(read("admin/playbook.js"))) fail("the rep's playbook doesn't state the founding price");
if (!/plan\.minimum_months/.test(read("netlify/functions/send-confirmation-email.js"))) fail("the agreement email says a founding client can stop at any point");

if (F.length) { console.error(`🔴 the contract's money terms and the code disagree — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ founding bills 625 x3 with a real minimum; the standard plan is unchanged; V2 is in all 4 plans; one calendar-day module opens every invoice; a notice prorates and stops billing, withdrawing undoes it; the document matches the charge");
