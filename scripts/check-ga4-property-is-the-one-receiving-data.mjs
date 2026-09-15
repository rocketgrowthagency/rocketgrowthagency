#!/usr/bin/env node
/**
 * check-ga4-property-is-the-one-receiving-data.mjs — we are reading the property the site sends to.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * RGA's baseline read **"Analytics: not measured — the property is connected but returned no rows"**.
 * That was true and completely misleading. The account held TWO GA4 properties for the same site:
 *
 *     properties/514075067   G-HE00MZ971F   ← CONNECTED        0 events in 90 days
 *     properties/529089636   G-SF8S8XEHM6   ← not connected  6,828 events in 90 days
 *
 * The live site collects to **G-SF8S8XEHM6**. We were reading the empty one. Every GA4 number in
 * every report — sessions, channels, conversions — was legitimately zero, from a property nothing
 * reports to.
 *
 * 🔑 "Connected" is not "correct". The OAuth flow binds A property; nothing checked it was THE
 * property. Same failure family as binding the first property it finds, except here both belonged to
 * the right account, so no ownership check would have caught it.
 * → feedback_the_connect_flow_binds_the_first_property_it_finds
 *
 * ─── WHAT IT ASSERTS, PER CLIENT ─────────────────────────────────────────────────────────────────
 *   A connected GA4 property that has recorded ZERO events over 90 days is a misbinding IF the same
 *   Google account holds another property that HAS events. Zero everywhere is a dead tag (a real but
 *   different problem, reported separately). Zero here and data next door is us reading the wrong one.
 *
 * Exit 0 = reading the right property · 1 = connected to an empty one while data sits elsewhere
 *        · 2 = could not tell (no credentials, no network, no GA4 linked).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 🔴 THE CHECK RUNS WHERE THE CREDENTIALS ARE. The first version called Google directly from here and
// exited 2 forever, because GOOGLE_OAUTH_CLIENT_ID/SECRET live in Netlify, not the scraper .env — a
// dead check wearing a warning label. It now calls the deployed function, which already holds them.
// → feedback_dead_check_selector_gap · feedback_a_test_nobody_runs_is_not_a_guard
const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SECRET = process.env.INTERNAL_FN_SECRET || process.env.QUO_WEBHOOK_TOKEN;
const BASE = process.env.SITE_URL || "https://www.rocketgrowthagency.com";
if (!SECRET) { console.error("[ga4] INDETERMINATE — no internal secret to call the checker with"); process.exit(2); }

let data;
try {
  const r = await fetch(`${BASE}/.netlify/functions/ga4-property-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
  });
  data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data?.error || `HTTP ${r.status}`);
} catch (e) {
  console.error(`[ga4] INDETERMINATE — could not run the check: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}

console.log("── the connected GA4 property is the one receiving data ──");
if (!data.checked) { console.log("  no client has a GA4 property linked — nothing to judge"); process.exit(2); }

for (const r of data.results) {
  if (r.verdict === "ok")            console.log(`  \u2705 ${r.client} — ${r.property} has ${r.events} event(s)`);
  else if (r.verdict === "dead_tag") console.log(`  \u26a0\ufe0f  ${r.client} — ${r.property} is empty, and so is every other property in the account. That is a DEAD TAG, not a misbinding.`);
  else if (r.verdict === "indeterminate") console.log(`  \u26a0\ufe0f  ${r.client} — ${r.why}`);
}

const wrong = data.results.filter((r) => r.verdict === "wrong_property");
console.log("");
if (wrong.length) {
  console.error("\u2717 a client's analytics are being read from the wrong property:");
  for (const w of wrong) {
    const where = (w.data_lives_in || []).map((d) => `${d.property} (${d.events} events)`).join(", ");
    console.error(`    ${w.client}: connected to ${w.property}, which recorded NOTHING in 90 days — while ${where} in the same account HAS data.`);
  }
  console.error("\n  'Connected' is not 'correct'. Repoint client_google_oauth.ga4_property_id at the");
  console.error("  property the site actually collects to, then re-run the deep assessment.");
  process.exit(1);
}
const judged = data.results.filter((r) => r.verdict === "ok").length;
if (!judged) { console.error("[ga4] INDETERMINATE — nothing could be judged"); process.exit(2); }
console.log(`\u2705 ${judged} client(s) reading a GA4 property that actually receives data`);
process.exit(0);
