#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-kickoff-promises-agree.mjs
//
// 🔒 WHY (2026-10-09, after the first real recap landed): Chris — "also worth sending to confirm all steps
// regarding kickoff call … harden all work so we confirm all steps". Read side by side, the recap and the
// call script disagreed: the recap said "Rankings usually move in month 2–3" while the script says "first
// movement in 30 to 60 days", and the script promised "every Friday … a short email" — no such email exists
// (the weekly update is a PORTAL post on Mondays, flow-cron-weekly-digest). The 9:11 recap also said "by
// Sunday", the made-up date the v3 console retired.
// HOLDS:
//   1. the call script and the recap state the SAME timeline (30 to 60 days) and neither says "month 2–3"
//   2. every cadence the script/recap promise is a scheduled job that exists: Monday portal update
//      (flow-cron-weekly-digest, Mondays, client_portal_content) · monthly report email (send-monthly-report, the 1st)
//   3. nothing promises a Friday email
//   4. the recap reads back each item's own agreed date (call.yes), never a computed weekday
// exit 0 = one story · 1 = they disagree · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const admin = read("admin/admin.js"), toml = read("netlify.toml"), digest = read("netlify/functions/flow-cron-weekly-digest.js");
const code = admin.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const agenda = (code.match(/const KICKOFF_AGENDA = \[[\s\S]*?\n\];/) || [""])[0];
const recapAt = code.indexOf("`WHAT HAPPENS NEXT`");
const recap = recapAt < 0 ? "" : code.slice(code.lastIndexOf('e.target.closest("[data-kickoff-recap]")', recapAt), code.indexOf("].join(\"\\n\");", recapAt));
if (!agenda || !recap) { console.error("⚠️  INDETERMINATE — could not find the script or the recap body"); process.exit(2); }
const F = []; const fail = (m) => F.push(m);

// 1
if (!/30 to 60 days/.test(agenda)) fail("the call script no longer states the 30-to-60-day timeline");
if (!/30 to 60 days/.test(recap)) fail("the recap does not state the same 30-to-60-day timeline the call script says");
for (const [where, txt] of [["script", agenda], ["recap", recap]]) if (/month 2[–-]3|month two/i.test(txt)) fail(`the ${where} still says "month 2–3" — the call says 30 to 60 days`);
// 2
const promisesMonday = /Every Monday your portal shows what we did/.test(agenda + recap);
if (promisesMonday) {
  if (!/schedule:\s*"0 \d+ \* \* 1"/.test(digest) || !/client_portal_content/.test(digest)) fail("the script/recap promise a Monday portal update, but flow-cron-weekly-digest is not a Monday job writing to the portal");
}
if (/report arrives by email/.test(agenda + recap) && !/\[functions\."send-monthly-report"\]\s*\n\s*schedule = "0 \d+ 1 \* \*"/.test(toml)) fail("the script promises a monthly report email on the 1st, but send-monthly-report is not scheduled for the 1st");
// 3
if (/Friday/i.test(agenda) || /Friday/i.test(recap)) fail("the kickoff script or recap promises something on a Friday — nothing sends on Fridays");
// 4
if (/kickoffAgreedBy\(/.test(code) || /by Sunday/.test(code)) fail("a computed weekday (kickoffAgreedBy / \"by Sunday\") is back in the kickoff");
if (!/const y = kickoffCallObj\(\)\.yes\[r\.id\];/.test(recap) || !/y \? ` — by \$\{y\.by\}, as agreed` : ""/.test(recap)) fail("the recap no longer reads back each item's own agreed date");

if (F.length) { console.error("🔴 the kickoff's promises disagree:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the kickoff's promises agree: one timeline, every cadence is a scheduled job, per-item agreed dates in the recap");
