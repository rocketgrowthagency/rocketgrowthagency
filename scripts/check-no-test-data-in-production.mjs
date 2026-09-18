#!/usr/bin/env node
/**
 * check-no-test-data-in-production.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 A CLEANUP THAT ONLY RUNS ON SUCCESS IS NOT A CLEANUP.
 *
 * 2026-09-18. A script that verified the new client-conversation thread seeded two rows —
 * "RENDERTEST — where do I find my CMS login?" and a reply — then crashed on its admin step, three
 * lines before the delete. The rows stayed. Chris opened his portal to test the feature and found
 * my test conversation sitting on step 2 of his own checklist, and sent a screenshot with one
 * character: "?"
 *
 * Every individual script is one crash away from leaving its scaffolding in production, and the
 * scripts that crash are exactly the ones that found something. Wrapping each in try/finally helps
 * and will be forgotten; this notices regardless of which script failed or who wrote it.
 *
 * 🔑 IT SCANS FOR THE MARKERS WE ACTUALLY USE, in the tables a client can SEE. Not a heuristic for
 * "looks like a test" — that would flag a client legitimately writing "this is a test", which is
 * precisely what Chris's own first message says.
 *
 * → feedback_never_stage_a_failure_in_production · feedback_an_audit_that_can_write_is_a_user
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const ENV = "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/.env";
for (const line of fs.readFileSync(ENV, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) { console.error("[test-data] INDETERMINATE — no Supabase credentials"); process.exit(2); }
const H = { apikey: K, Authorization: `Bearer ${K}` };

// 🔑 ALL-CAPS PREFIXES AND EXPLICIT AUDIT PHRASES ONLY. A marker has to be something no client
// would ever type. "This is a test" is NOT on this list, deliberately — a client wrote it.
const MARKERS = [
  "RENDERTEST", "ROUNDTRIP", "ADMINRENDER", "NETLIFY-EXEC-PROBE", "XSSTEST", "SWEEPTEST",
  "Timing check", "Live check from the audit", "Email delivery check", "FINAL CHECK",
  "probe from the audit", "please ignore, sent by the audit", "seed question",
];

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── no test scaffolding is sitting in a client's portal ──");

// The surfaces a CLIENT can see. An orphaned row in an internal-only table is untidy; one of these
// is a client reading our test data as if it were their own conversation.
const rows = await get(`/client_activity?kind=in.(client_message,rga_reply)`
  + `&order=created_at.desc&limit=500&select=id,kind,payload,created_at,client_id`);

let checked = 0;
for (const r of Array.isArray(rows) ? rows : []) {
  checked++;
  const text = String(r.payload?.message || "");
  const hit = MARKERS.find((m) => text.startsWith(m) || text.includes(m));
  if (hit) {
    bad(`${r.created_at.slice(0, 19)} ${r.kind} carries the test marker "${hit}" — a client sees this `
      + `in their own conversation. Delete row ${r.id}.`);
  }
}

// 🔑 A SECOND HEURISTIC WAS WRITTEN HERE AND PULLED THE SAME DAY. It flagged four owner-fact
// answers inside one minute as "a script clicking, not an owner deciding" — and immediately fired
// on 2026-09-16, when Chris legitimately tapped five option tiles in under a minute. Tapping fast
// IS the designed interaction; the answers autosave precisely so it can be that quick.
//
// It could not distinguish the sweep that damaged those facts from an owner using the product as
// intended, and a gate that cries wolf gets muted — which would cost more than it ever caught.
// The marker scan above is certain; this was a guess wearing a red flag.
// → feedback_a_check_must_not_validate_itself

console.log(fail
  ? `\n🔴 ${fail} piece(s) of test data are live. Remove them — a client is reading them.`
  : `\n✅ ${checked} client-visible message(s): none carry a test marker.`);
process.exit(fail ? 1 : 0);

async function get(p) {
  const r = await fetch(`${U}/rest/v1${p}`, { headers: H });
  if (!r.ok) { console.error(`[test-data] INDETERMINATE — ${r.status} ${await r.text()}`); process.exit(2); }
  return r.json();
}
