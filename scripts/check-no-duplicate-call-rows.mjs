#!/usr/bin/env node
/**
 * check-no-duplicate-call-rows.mjs — one call, one Outreach Log row, one Lead.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * A real inbound call produced TWO Outreach Log rows and TWO Lead records, one second apart, both
 * carrying the same `quoCallId`. OpenPhone delivered the webhook twice and both invocations ran
 * "does a row with this id exist?" before either had written one — a check-then-write dedup loses
 * that race every time it is run concurrently.
 *
 * 🔴 It had been happening for two weeks. THREE calls were doubled (2026-09-03, 09-14, 09-16) and
 * nothing noticed, because the function's own header claimed it was idempotent and no check ever
 * tested the claim. Every doubled call inflated the CRM by one phantom inbound lead.
 * → feedback_correct_is_not_the_same_as_happening · feedback_a_check_must_not_validate_itself
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. No call id appears on more than one Outreach Log row.
 *   2. No phone number has more than one "Unknown caller" lead — the placeholder leads the webhook
 *      creates, which is where the duplicate surfaces in the CRM.
 *   3. Every phone row carrying a quoCallId in Notes also has it in the `Call ID` field, because
 *      that field is the upsert key and a row missing it cannot be merged on.
 *   4. The webhook still refuses to create a lead from a first silent inbound call. Chris:
 *      *"usually when I answer it's a spam call."* Every unanswered unknown number was becoming a
 *      "New / Queued" lead and two had been auto-promoted to "Warm (MQL)" — for a nought-second
 *      call nobody picked up. The second call is the signal; spam dialers do not ring back.
 *
 * Exit 0 = one row per call · 1 = duplicates present · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SCRAPER = process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
try {
  for (const line of fs.readFileSync(path.join(SCRAPER, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* fall through */ }

const K = process.env.AIRTABLE_API_KEY, B = process.env.AIRTABLE_BASE_ID;
if (!K || !B) { console.error("[calls] INDETERMINATE — no Airtable credentials"); process.exit(2); }
const AT = "https://api.airtable.com/v0";
const H = { Authorization: `Bearer ${K}` };

async function all(table) {
  const out = [];
  let offset;
  do {
    const u = new URL(`${AT}/${B}/${encodeURIComponent(table)}`);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error(`${table} ${r.status}`);
    const j = await r.json();
    out.push(...(j.records || []));
    offset = j.offset;
  } while (offset);
  return out;
}

const fail = [];
console.log("── one call, one row, one lead ──");

let logs, leads;
try { logs = await all("Outreach Log"); leads = await all("Leads"); }
catch (e) { console.error(`[calls] INDETERMINATE — ${e.message}`); process.exit(2); }

// 1 ─ no call id on two rows
const byCall = new Map();
for (const r of logs) {
  const id = r.fields["Call ID"];
  if (!id) continue;
  if (!byCall.has(id)) byCall.set(id, []);
  byCall.get(id).push(r.id);
}
for (const [id, recs] of byCall) {
  if (recs.length > 1) fail.push(`call ${id} is logged ${recs.length}× (${recs.join(", ")})`);
}

// 2 ─ no phone with two placeholder leads
const byPhone = new Map();
for (const r of leads) {
  if (!/^Unknown (caller|texter)/.test(String(r.fields["Business Name"] || ""))) continue;
  const ten = String(r.fields.Phone || "").replace(/\D/g, "").slice(-10);
  if (!ten) continue;
  if (!byPhone.has(ten)) byPhone.set(ten, []);
  byPhone.get(ten).push(r.id);
}
for (const [ten, recs] of byPhone) {
  if (recs.length > 1) fail.push(`${ten} has ${recs.length} unknown-caller leads (${recs.join(", ")})`);
}

// 3 ─ the upsert key is populated wherever it can be
let unkeyed = 0;
for (const r of logs) {
  const inNotes = (String(r.fields.Notes || "").match(/quoCallId=([A-Za-z0-9]+)/) || [])[1];
  if (inNotes && !r.fields["Call ID"]) unkeyed++;
}
if (unkeyed) fail.push(`${unkeyed} phone row(s) carry a call id in Notes but not in the Call ID field — they cannot be merged on`);

// 4 ─ the spam rule is still in the code that enforces it
try {
  const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
  const wh = fs.readFileSync(path.join(SITE, "netlify/functions/quo-call-webhook.js"), "utf8");
  const code = wh.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/const silent = !answeredAt/.test(code)) {
    fail.push("the webhook no longer distinguishes a silent call — every unanswered unknown number would become a lead again");
  }
  if (!/first-silent-call/.test(code)) {
    fail.push("the first-silent-call branch is gone — a spam dialer would create a lead on its first ring");
  }
  if (!/calledBefore/.test(code)) {
    fail.push("nothing checks whether the number has called before — the repeat call is the only signal separating a customer from a dialer");
  }
  // 🔴 A VOICEMAIL IS ALWAYS A LEAD. Chris, 2026-09-16: *"spam don't leave voicemails."* Someone who
  // takes the trouble to record a message is a person with something to say, and dropping them into
  // the silent-call branch would lose a real enquiry — a far worse error than one phantom lead.
  // 🔑 Read the `silent` DECLARATION, not the whole file: `voicemail && voicemail.url` also appears
  // in the Notes line, so a file-wide match passed even with the exclusion deleted.
  // → feedback_dead_check_selector_gap
  const silentDecl = (code.match(/const silent = [^;]+;/) || [""])[0];
  if (!/answeredAt/.test(silentDecl) || !/duration/.test(silentDecl)) {
    fail.push(`the silent-call test is malformed: ${silentDecl.trim() || "(not found)"}`);
  }
  if (!/voicemail/.test(silentDecl)) {
    fail.push("the silent-call test no longer excludes voicemails — a caller who left a message would be discarded as spam");
  }
} catch (e) {
  console.error(`[calls] INDETERMINATE — cannot read the webhook: ${e.message}`);
  process.exit(2);
}

// A first silent call is logged with no lead. Those rows are expected and are NOT a defect.
const silentRows = logs.filter((r) => /firstSilentCall=yes/.test(String(r.fields.Notes || "")));
console.log(`  ${logs.length} log rows · ${byCall.size} distinct calls · ${byPhone.size} unknown-caller numbers · ${silentRows.length} first-silent (no lead, by design)`);

if (fail.length) {
  console.error(`\n✗ a call was recorded more than once — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  Every doubled call is a phantom inbound lead in the CRM.");
  process.exit(1);
}
console.log("  ✅ no call is logged twice and no caller has two placeholder leads");
process.exit(0);
