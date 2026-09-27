#!/usr/bin/env node
/**
 * sweep-kickoff-rsvps.mjs — notice an acceptance without anybody opening a tab.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 THE ONLY THING THAT EVER ASKED GOOGLE WAS AN ADMIN PAGE VIEW.
 *
 * `kickoff-rsvp-check` has been able to read a client's acceptance since the day it was written, and
 * it was called from exactly one place: `refreshKickoffRsvp`, which runs when Chris opens that
 * client's Overview tab. So a client could accept on Friday and the record would still say
 * `awaiting` on Monday morning — the fact was knowable the whole time and nobody asked.
 *
 * 🔑 A capability nobody calls looks finished. This is the caller.
 * → feedback_a_capability_nobody_calls_looks_finished · feedback_correct_is_not_the_same_as_happening
 *
 * It asks only about clients that have an invite out and no settled answer, so a workspace with no
 * pending kickoffs costs one Supabase read and no Google calls at all.
 *
 * Exit 0 = swept (including "nothing to sweep") · 1 = a client could not be checked · 2 = could not
 * tell (no credentials, endpoint unreachable) — never a silent pass.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/%20/g, " "));
// .env lives beside the repo root, not in scripts/
for (const f of [path.join(ROOT, "..", ".env")]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.INTERNAL_FN_SECRET;
const SITE = process.env.SITE_URL || "https://www.rocketgrowthagency.com";

console.log("── kickoff invites: has the client answered yet? ──");

if (!SUPA || !KEY) { console.log("  ⚠️  no Supabase credentials — cannot tell."); process.exit(2); }
if (!SECRET) { console.log("  ⚠️  INTERNAL_FN_SECRET not set — the checker would refuse us."); process.exit(2); }

async function supa(p) {
  const r = await fetch(`${SUPA}/rest/v1${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

let rows;
try {
  rows = await supa("/client_onboarding_records?select=client_id,data&limit=500");
} catch (e) {
  console.log(`  ⚠️  could not read the onboarding records: ${e.message}`);
  process.exit(2);
}

// 🔑 Only the ones with a live question. An invite with no event_id was never sent; `accepted` and
// `declined` are settled answers and re-asking Google about them is a call for nothing.
const OPEN = new Set(["awaiting", "tentative", "unknown", undefined, null, ""]);
const pending = rows.filter((r) => {
  const k = r?.data?.kickoff_invite;
  if (!k || !k.event_id) return false;
  // 🔴 RE-ASK WHEN THE ANSWER AND THE STEP DISAGREE. The first version filtered on the ANSWER alone
  // — `accepted` is settled, so skip — which stranded any client whose acceptance was recorded while
  // the step write failed: the step sits pending and nothing ever asks again, because the answer
  // looks finished. Found 2026-09-27 the first time a real acceptance came back.
  // 🔑 A sweep that only looks at its own last answer cannot heal a half-applied write.
  // → feedback_verify_the_write_not_just_the_intent · feedback_a_cleanup_that_only_runs_on_success_is_not_a_cleanup
  const step = r?.data?.tasks?.["m1.close.kickoff_invite"] || {};
  const outOfSync = k.rsvp === "accepted" && step.status !== "done";
  if (!OPEN.has(k.rsvp) && !outOfSync) return false;
  // A call whose time has long passed is history, not a pending answer.
  if (k.start && new Date(k.start).getTime() < Date.now() - 36 * 3600000) return false;
  return true;
});

if (!pending.length) {
  console.log(`  ✅ no invite is waiting on an answer (${rows.length} record(s) read)`);
  process.exit(0);
}

let failed = 0, changed = 0;
for (const r of pending) {
  const before = r.data.kickoff_invite.rsvp || "(never checked)";
  try {
    const res = await fetch(`${SITE}/.netlify/functions/kickoff-rsvp-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({ client_id: r.client_id }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { console.log(`  🔴 ${r.client_id} — HTTP ${res.status} ${j.error || ""}`); failed++; continue; }
    // 🔑 The checker itself stamps the record, completes the step and notifies on a CHANGE. This
    // sweep's only job is to make it run; it deliberately duplicates none of that logic.
    if (j.state !== before) { changed++; console.log(`  ✅ ${r.client_id}: ${before} → ${j.state}`); }
    else console.log(`  ·  ${r.client_id}: still ${j.state}${j.chase_due ? `  ⚠️  unanswered ${j.hours_since_sent}h — chase it` : ""}`);
  } catch (e) {
    console.log(`  🔴 ${r.client_id} — ${e.message}`);
    failed++;
  }
}

console.log(`\n  ${pending.length} invite(s) checked · ${changed} changed · ${failed} could not be checked`);
if (failed) { console.log("🔴 an invite could not be checked — an acceptance may be sitting unseen."); process.exit(1); }
console.log("✅ every open invite was asked about.");
process.exit(0);
