#!/usr/bin/env node
/**
 * heal-onboarding-errors.mjs — daily runner for the heal-onboarding-errors function.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * Runs BEFORE check-onboarding-errors-surfaced in daily-health-check, so a failure whose underlying
 * cause has since been fixed retries itself rather than sitting red until a human notices.
 *
 * 🔑 It clears an error ONLY when the real operation is re-run and succeeds. It never clears on the
 * strength of "the code was fixed" — that is the exact false-success the check exists to catch.
 * A failed retry REPLACES the stored error with the current one, which is strictly more useful.
 *
 * 🔴 EXIT CODES: 0 = nothing to heal, or something healed. 2 = could not reach the endpoint
 * (indeterminate — not a fault). 1 = the endpoint reported an error.
 * A retry that legitimately still fails is NOT this script's failure — the following check is what
 * reports that, and double-reporting one problem in two places trains people to skim both.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const TOKEN = process.env.QUO_WEBHOOK_TOKEN;
if (!TOKEN) { console.error("✗ QUO_WEBHOOK_TOKEN not set"); process.exit(2); }

let res;
try {
  const r = await fetch(
    `https://www.rocketgrowthagency.com/.netlify/functions/heal-onboarding-errors?token=${encodeURIComponent(TOKEN)}`,
    { signal: AbortSignal.timeout(180000) });
  const text = await r.text();
  try { res = JSON.parse(text); }
  catch {
    console.error(`✗ non-JSON response (HTTP ${r.status}): ${text.slice(0, 140)}`);
    process.exit(r.status >= 500 ? 2 : 1);
  }
} catch (e) {
  console.error(`✗ could not reach the healer: ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}

if (!res.ok) { console.error(`✗ healer error: ${String(res.error).slice(0, 180)}`); process.exit(1); }

if (!res.results?.length) {
  console.log("── onboarding error healer ──\n  nothing stored to heal");
  process.exit(0);
}
console.log("── onboarding error healer ──");
for (const r of res.results) {
  console.log(`  ${r.cleared ? "✅" : "▫️ "} ${String(r.client).padEnd(24)} ${r.error_key}`);
  console.log(`     ${String(r.result).slice(0, 150)}`);
}
console.log(`\n  healed ${res.healed}, still failing ${res.still_failing}` +
  (res.still_failing ? " — the next check reports those, so they are not double-flagged here" : ""));
process.exit(0);
