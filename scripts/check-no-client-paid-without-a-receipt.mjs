#!/usr/bin/env node
/**
 * check-no-client-paid-without-a-receipt.mjs — money in, receipt out. Every time.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. A client paid $3,625 and got no receipt. The daily-email tripwire had been consumed
 * by testing, `send-invoice-email` correctly refused, and `stripe-webhook` logged
 * `console.warn("receipt NOT emailed")` and carried on. Nothing surfaced it.
 *
 * From the outside that is indistinguishable from the email being broken — it cost three rounds of
 * debugging aimed at the wrong thing, and Chris's reaction was "why is this so hard".
 *
 * 🔑 The send failing is FINE — a cap is a safety feature. The send failing SILENTLY is the defect.
 * A swallowed error is an outage nobody has noticed yet.
 *
 * This queries the real ledger: every PAID invoice must have a matching `invoice_email_sent`, and
 * no `receipt_email_failed` may sit unresolved. It is the mechanism by which a missing receipt
 * reaches a human instead of a log file.
 *
 * Exit 0 = every payment has its receipt · 1 = someone paid and heard nothing · 2 = could not tell.
 */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── every paid invoice has a receipt the client actually received ──");

if (!SUPA_URL || !SUPA_KEY) {
  console.log("  ⚠️  SUPABASE env not set — cannot tell. (exit 2, not a pass)");
  process.exit(2);
}

async function supa(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

let paid, activity;
try {
  paid = await supa("/client_invoices?status=eq.paid&select=id,client_id,invoice_num,amount,paid_at&order=paid_at.desc&limit=200");
  activity = await supa("/client_activity?kind=in.(invoice_email_sent,receipt_email_failed)&select=client_id,kind,payload,created_at&order=created_at.desc&limit=400");
} catch (e) {
  console.log(`  ⚠️  could not read the ledger: ${e.message}`);
  process.exit(2);
}

if (SABOTAGE) {
  // Re-create the real incident: a paid invoice whose receipt was never recorded as sent.
  paid = [{ id: "sabotage", client_id: "sabotage-client", invoice_num: 1, amount: 3625,
            paid_at: new Date(Date.now() - 3600e3).toISOString() }, ...paid];
}

// 🔴 KEYED BY TIME, NOT JUST BY NUMBER. My first version matched on `client:invoice_num` and
// declared the incident covered — because an EARLIER test run had sent a receipt for invoice #1,
// and the re-test's invoice #1 inherited that credit. The gate written to catch this exact bug
// gave it a pass on its first run.
// 🔑 A receipt only covers a payment if it was sent AFTER it. Same shape as every other miss
// today: the logic was right over the wrong key.
const sentAt = new Map();   // "client:num" -> newest timestamp
const failed = [];
for (const a of activity) {
  const n = a.payload?.invoice_num;
  if (a.kind === "invoice_email_sent" && n != null) {
    const k = `${a.client_id}:${n}`;
    const t = new Date(a.created_at).getTime();
    if (!sentAt.has(k) || t > sentAt.get(k)) sentAt.set(k, t);
  }
  if (a.kind === "receipt_email_failed") failed.push(a);
}
const sent = { size: sentAt.size, covers: (clientId, num, paidAt) => {
  const t = sentAt.get(`${clientId}:${num}`);
  return t != null && t >= new Date(paidAt).getTime() - 60e3;   // 60s slack for clock skew
} };

// Only look at payments old enough that the webhook has certainly finished.
const SETTLE_MS = 2 * 60 * 1000;
const now = Date.now();
const ripe = paid.filter((p) => p.paid_at && (now - new Date(p.paid_at).getTime()) > SETTLE_MS);

if (!paid.length) {
  console.log("  ▫️  no paid invoices yet — nothing to check.");
  process.exit(0);
}

const missing = ripe.filter((p) => Number(p.amount) > 0 && !sent.covers(p.client_id, p.invoice_num, p.paid_at));

console.log(`  ${paid.length} paid invoice(s) · ${ripe.length} settled long enough to judge · ${sent.size} receipt(s) on record`);

let fails = 0;
if (missing.length) {
  console.log(`\n  🔴 ${missing.length} payment(s) with NO receipt recorded:`);
  missing.slice(0, 10).forEach((p) =>
    console.log(`       client ${String(p.client_id).slice(0, 8)} · invoice #${p.invoice_num} · $${Number(p.amount).toLocaleString()} · paid ${String(p.paid_at).slice(0, 19)}`));
  console.log("\n     They paid and heard nothing. Check the daily-email cap first:");
  console.log("     rga_google_credentials.sends_today vs RGA_EMAIL_DAILY_CAP.");
  fails++;
} else {
  console.log("  ✅ every settled payment has a receipt on record");
}

if (failed.length) {
  console.log(`\n  🔴 ${failed.length} recorded receipt FAILURE(S):`);
  failed.slice(0, 5).forEach((f) =>
    console.log(`       ${String(f.created_at).slice(0, 19)} · ${f.payload?.reason || "no reason recorded"}`));
  fails++;
} else {
  console.log("  ✅ no recorded receipt failures");
}

if (fails) {
  console.log("\n🔴 A client paid and did not get told. The send failing is fine; failing SILENTLY is not.");
  process.exit(1);
}
console.log("\n✅ money in, receipt out — every time.");
process.exit(0);
