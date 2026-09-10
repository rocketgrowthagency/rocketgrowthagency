#!/usr/bin/env node
/**
 * check-billing-history-is-derived.mjs — the portal must survive month 3.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. Chris sent three screenshots confirming the payment step looked right: invoice #1
 * PAID $1,250, invoice #2 UPCOMING $625 due ~October 10. It did look right. It was also hardwired
 * to a world with exactly two invoices:
 *
 *     const dbInv2 = clientInvoices.find((inv) => inv.invoice_num === 2);
 *     ▶ Billing history (1 paid invoice)
 *     <button ...>↓ Download Invoice #1</button>
 *
 * On 2026-10-10 the auto-charge collects #2. From that morning:
 *   • the "next payment" card keeps showing #2 — now PAID — as the amount due
 *   • invoice #3 never appears, so the client sees no upcoming bill at all
 *   • the history still reads "1 paid invoice" and offers only #1, so the receipt for the payment
 *     they were just charged is unreachable
 *
 * 🔑 A HARDCODED COUNT IS A QUERY SOMEBODY SKIPPED. It passes review because on the day you look
 * at it, the constant happens to equal the answer. The screenshot is not the proof — the second
 * cycle is.
 *
 * This gate RUNS the real derivation out of portal.js against ledgers the product has not reached
 * yet. Reading the source for a literal would only prove the literal is gone; running it proves
 * the replacement is right.
 *
 * Exit 0 = derived and correct at every cycle · 1 = a future month renders wrong · 2 = can't tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";
const SRC = path.join(SITE, "portal/portal.js");

console.log("── the payment step derives the next invoice + history from the ledger ──");

if (!fs.existsSync(SRC)) { console.log(`  ⚠️  missing: ${SRC}`); process.exit(2); }
let src = fs.readFileSync(SRC, "utf8");

if (SABOTAGE) {
  const before = src;
  src = src.replace(
    /const dbInv2 = _allInv\.find\([\s\S]*?\) \|\| null;/,
    "const dbInv2 = _allInv.find((i) => i.invoice_num === 2) || null;");
  if (src === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

// ── pull the two regions out of the real file ────────────────────────────────────────────────
const derive = src.match(/const _allInv = [\s\S]*?const inv2Amount = [^\n]*\n/);
if (!derive) { console.log("  ⚠️  could not locate the invoice derivation — the shape changed."); process.exit(2); }

const history = src.match(/const historyHtml = \(\(\) => \{[\s\S]*?\n      \}\)\(\);\n/);
if (!history) { console.log("  ⚠️  could not locate historyHtml — the shape changed."); process.exit(2); }

// Stubs for the render helpers. Deliberately identity-ish: this gate tests the NUMBERS and the
// COUNT, not the styling.
const PRELUDE = `
  const formatMoney = (n) => String(Number(n || 0));
  const formatDateTime = (d) => String(d);
  const escapeHtml = (s) => String(s == null ? "" : s);
  const escapeAttribute = (s) => String(s == null ? "" : s);
  const invoiceKeyFor = (n) => "inv" + n + "_c1";
  const showInv2 = true;
`;

let run;
try {
  run = new Function("ctx", "tier", "recurringRate", "amountNum", "paidStr",
    PRELUDE + derive[0] + history[0] +
    "return { inv2Num, inv2Status, inv2Amount, planExhausted: _planExhausted, paid: _paidInv.length, historyHtml };");
} catch (e) {
  console.log(`  ⚠️  could not evaluate the derivation: ${e.message}`);
  process.exit(2);
}

const inv = (n, status, amount, paid_at = null) =>
  ({ invoice_num: n, status, amount, paid_at, due_date: null, id: `i${n}` });

// month 1 paid · month 2 paid · month 3 paid · project plan fully paid · nothing paid yet
const CASES = [
  { name: "month 1 paid, #2 upcoming", tier: "commit_3mo", rate: 625, amountNum: 1250,
    ledger: [inv(1, "paid", 1250, "2026-09-10"), inv(2, "upcoming", 625)],
    wantNum: 2, wantPaid: 1, wantAmount: 625 },

  { name: "month 2 PAID, #3 is next", tier: "commit_3mo", rate: 625, amountNum: 1250,
    ledger: [inv(1, "paid", 1250, "2026-09-10"), inv(2, "paid", 625, "2026-10-10"), inv(3, "upcoming", 625)],
    wantNum: 3, wantPaid: 2, wantAmount: 625 },

  { name: "month 3 paid, #4 not yet written", tier: "commit_3mo", rate: 625, amountNum: 1250,
    ledger: [inv(1, "paid", 1250, "2026-09-10"), inv(2, "paid", 625, "2026-10-10"), inv(3, "paid", 625, "2026-11-10")],
    wantNum: 4, wantPaid: 3, wantAmount: 625 },

  { name: "#2 overdue — the OLDEST unpaid wins", tier: "monthly", rate: 625, amountNum: 1875,
    ledger: [inv(1, "paid", 1875, "2026-09-10"), inv(2, "overdue", 625), inv(3, "upcoming", 625)],
    wantNum: 2, wantPaid: 1, wantAmount: 625 },

  { name: "done_for_you fully paid — NEVER invent a third", tier: "done_for_you", rate: 0, amountNum: 2000,
    ledger: [inv(1, "paid", 2000, "2026-09-10"), inv(2, "paid", 2000, "2026-10-10")],
    wantNum: null, wantPaid: 2, wantAmount: 0 },
];

let fails = 0;
for (const c of CASES) {
  let r;
  try { r = run({ clientInvoices: c.ledger, billingStatus: "active" }, c.tier, c.rate, c.amountNum, "Sep 10"); }
  catch (e) { console.log(`  ⚠️  "${c.name}" threw: ${e.message}`); process.exit(2); }

  const problems = [];
  if (c.wantNum != null && r.inv2Num !== c.wantNum) problems.push(`next invoice is #${r.inv2Num}, want #${c.wantNum}`);
  if (Number(r.inv2Amount) !== c.wantAmount) problems.push(`next amount ${r.inv2Amount}, want ${c.wantAmount}`);
  if (r.paid !== c.wantPaid) problems.push(`counted ${r.paid} paid, want ${c.wantPaid}`);

  // The history must NAME every paid invoice and offer a download for each.
  const countLabel = r.historyHtml.match(/Billing history \((\d+) paid invoice/);
  if (!countLabel) problems.push("history has no counted label");
  else if (Number(countLabel[1]) !== c.wantPaid) problems.push(`history says "${countLabel[1]} paid", want ${c.wantPaid}`);
  const downloads = (r.historyHtml.match(/↓ Download Invoice #\d+/g) || []);
  if (downloads.length !== c.wantPaid) problems.push(`${downloads.length} download button(s), want ${c.wantPaid}`);
  for (const row of c.ledger.filter((i) => i.status === "paid")) {
    if (!downloads.includes(`↓ Download Invoice #${row.invoice_num}`)) {
      problems.push(`no way to download the PAID invoice #${row.invoice_num}`);
    }
  }
  // A paid invoice must never be presented as the amount due.
  if (r.inv2Status === "paid") problems.push("the 'next payment' card is showing an ALREADY-PAID invoice");

  if (problems.length) { console.log(`  🔴 ${c.name}: ${problems.join(" · ")}`); fails++; }
  else console.log(`  ✅ ${c.name.padEnd(44)} next #${r.inv2Num} $${r.inv2Amount} · ${r.paid} downloadable`);
}

if (fails) {
  console.log(`\n🔴 ${fails} cycle(s) render wrong. The client is charged and shown nothing for it.`);
  process.exit(1);
}
console.log(`\n✅ all ${CASES.length} cycles derive correctly — the panel is not pinned to invoice #2.`);
process.exit(0);
