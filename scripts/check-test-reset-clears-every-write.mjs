#!/usr/bin/env node
/**
 * check-test-reset-clears-every-write.mjs — a partial reset produces a run that silently skips steps.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. `reset-test-client.mjs` cleared invoices, the subscription and the stage — but not
 * the STAGE-NOTIFICATION LOG. `notify-client-stage` is idempotent:
 *
 *     if (sent[stage] && !force) return { alreadySent: true }
 *
 * So the re-test advanced the stage correctly and sent NO "next step" email, because the system
 * believed it had already told the client. **The flow looked broken. The flow was fine.** That cost
 * a round of debugging aimed at the wrong thing.
 *
 * 🔑 A reset that clears SOME of what a flow writes is worse than no reset: the next run skips
 * steps for reasons that look exactly like defects. Whatever the flow WRITES, the reset must CLEAR
 * — or explicitly say why it keeps it.
 *
 * This derives the write-set from the code rather than a hand-list, so a new write added to the
 * payment flow next month fails this gate instead of quietly surviving a reset.
 *
 * Exit 0 = every write is cleared or excused · 1 = a write survives · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SABOTAGE = process.env.SABOTAGE === "1";
const RESET = path.join(SITE, "scripts/reset-test-client.mjs");

// What the post-close payment flow writes. Derived by scanning these files for table writes.
// 🔴 THIS LIST WAS HAND-PICKED AND THAT IS WHY THE GATE MISSED A REAL ONE. It omitted
// send-invoice-email.js, which writes `invoice_email_<kind>_<tone>_<num>` idempotency keys into
// client_onboarding_records.data. The reset cleared stage_notifications but not those, so the next
// test paid successfully and sent NO RECEIPT — the exact failure this gate exists to prevent,
// sailing past it because I chose the scope by memory.
// 🔑 A gate is only as honest as its input set. Every function that writes client state during the
// post-close flow belongs here.
const FLOW = [
  "netlify/functions/stripe-webhook.js",
  "netlify/functions/portal-payment-intent.js",
  "netlify/functions/notify-client-stage.js",
  "netlify/functions/send-invoice-email.js",
  "netlify/functions/billing-daily-check.js",
  "netlify/functions/admin-record-payment.js",
  // Earlier-stage senders. They are NOT cleared (see KEPT_KEYS) — but they are listed so that
  // decision is re-checked every run instead of being invisible.
  "netlify/functions/send-confirmation-email.js",
  "netlify/functions/send-kickoff-invite.js",
];

// Writes the reset deliberately KEEPS, each with the reason. An entry here is a decision, not an
// oversight — and it has to stay true, so the reason names what depends on it.
// Nested keys deliberately NOT cleared, with the reason. The reset rewinds to stage_2_payment —
// keys written at EARLIER stages are not replayed, so clearing them would only re-send emails the
// client already has. Listed rather than omitted, so the judgement is re-checked, not assumed.
const KEPT_KEYS = {
  confirmation_email_sent: "written at contract stage (1b), before the point the reset rewinds to — re-clearing would re-send an intro email the client already has",
  kickoff_invite: "written at stage 4, after setup; the reset never reaches that stage, and a duplicate calendar invite is worse than none",
  report_sent: "monthly reporting, unrelated to the post-close payment flow",
};

const KEPT = {
  client_contracts: "the signed contract IS the test fixture — invoiceNumber() derives from its id, so clearing it would change the invoice number and void the 'same number before and after payment' property",
  client_activity: "an append-only audit log; the reset ADDS to it rather than erasing history",
  clients: "the client row is patched back to stage_2_payment, not deleted — a client with history is archive-only by DB trigger",
  client_portal_access: "the portal invite is not part of the payment flow and re-inviting is a separate test",
  rga_google_credentials: "workspace-level Gmail credential, nothing to do with one client's payment",
  client_onboarding_records: "the row is kept; only its stage_notifications key is cleared, because the playbook tasks are not payment state",
};

console.log("── the test reset clears everything the payment flow writes ──");

if (!fs.existsSync(RESET)) { console.log(`  ⚠️  missing: ${RESET}`); process.exit(2); }
let reset = fs.readFileSync(RESET, "utf8");

if (SABOTAGE) {
  const before = reset;
  reset = reset.replace(/delete nextData\.stage_notifications;/, "// removed");
  if (reset === before) { console.log("  ⚠️  SABOTAGE did not apply — the pattern is stale."); process.exit(2); }
}

// ── discover what the flow writes ─────────────────────────────────────────────────────────────
const written = new Map();   // table -> file that writes it
for (const rel of FLOW) {
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) { console.log(`  ⚠️  missing: ${rel}`); process.exit(2); }
  const s = fs.readFileSync(p, "utf8");
  // POST/PATCH through the supa() helper: supa(`/table…`, { method: "POST"|"PATCH" })
  for (const m of s.matchAll(/supa\(\s*`\/([a-z_]+)[^`]*`\s*,\s*\{[^}]*method:\s*"(POST|PATCH)"/g)) {
    if (!written.has(m[1])) written.set(m[1], rel);
  }
  // 🔑 Nested KEYS inside client_onboarding_records.data are state too, and a table-level scan
  // cannot see them. Discovered from the code rather than listed, so a new key fails this gate.
  // 🔴 Match the key PREFIX anywhere, not `data[literal]`. send-invoice-email builds its key in a
  // variable — `const sentKey = \`invoice_email_${kind}_${tone}_${invoiceNum}\`` — so a pattern
  // anchored on `data[` saw nothing and the gate passed while the bug was live. Twice now the
  // scope, not the logic, has been what failed.
  for (const prefix of ["stage_notifications", "invoice_email_", "confirmation_email_sent",
                        "kickoff_invite", "report_sent"]) {
    if (!s.includes(prefix)) continue;
    const norm = prefix === "invoice_email_" ? "invoice_email_*" : prefix;
    if (!written.has(`client_onboarding_records.${norm}`)) written.set(`client_onboarding_records.${norm}`, rel);
  }
  if (/stage_notifications/.test(s) && !written.has("client_onboarding_records.stage_notifications")) {
    written.set("client_onboarding_records.stage_notifications", rel);
  }
}

if (!written.size) { console.log("  ⚠️  found NO writes at all — the probe is wrong."); process.exit(2); }

let fails = 0;
for (const [target, by] of [...written].sort()) {
  const base = target.split(".")[0];
  const key = target.includes(".") ? target.split(".")[1] : null;

  // Cleared = the reset DELETEs the table, or explicitly removes the nested key.
  const clearsTable = new RegExp(`supa\\(\\s*\`/${base}[^\`]*\`[^)]*method:\\s*"DELETE"`).test(reset);
  const clearsKey = key
    ? (key === "invoice_email_*"
        ? /startsWith\("invoice_email_"\)/.test(reset) && /delete nextData\[k\]/.test(reset)
        : new RegExp(`delete\\s+\\w+\\.${key}\\b`).test(reset))
    : false;
  const cleared = key ? clearsKey : clearsTable;
  const excused = key
    ? Object.prototype.hasOwnProperty.call(KEPT_KEYS, key)
    : Object.prototype.hasOwnProperty.call(KEPT, base);

  if (cleared) {
    console.log(`  ✅ ${target.padEnd(46)} cleared`);
  } else if (excused) {
    console.log(`  ▫️  ${target.padEnd(46)} kept — ${(key ? KEPT_KEYS[key] : KEPT[base]).slice(0, 58)}…`);
  } else {
    console.log(`  🔴 ${target.padEnd(46)} written by ${by}, NOT cleared and NOT excused`);
    fails++;
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} write(s) survive the reset.`);
  console.log("   The next test run will skip steps for reasons indistinguishable from defects —");
  console.log("   exactly how a missing next-step email cost a debugging round on 2026-09-10.");
  console.log("   Either clear it in reset-test-client.mjs, or add it to KEPT with a real reason.");
  process.exit(1);
}
console.log("\n✅ every write the payment flow makes is cleared, or kept for a stated reason.");
process.exit(0);
