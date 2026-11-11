#!/usr/bin/env node
// check-reminder-texts.mjs — 11-11: texting was switched on (A2P approved, QUO_TEXTS_ENABLED=1) and the Schedule said "texts on", but the reminder job
// had never been given a way to text ("this function never texts today"). This holds the text path both ways, reading the WEBSITE's real files:
// the wording (US English, no em dash, STOP line, their clock only), US-only numbers (never guessed), off unless switched on, and in call-reminders.js
// the text is CLAIMED before it is sent, only when textsAvailable().on, with its own ledger kind. Nothing is sent. --against=<rev> reads that rev.
import { execFileSync } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rev = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const read = (f) => rev ? execFileSync("git", ["-C", SITE, "show", `${rev}:${f}`], { encoding: "utf8" }) : fs.readFileSync(path.join(SITE, f), "utf8");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-"));
for (const f of ["_call-reminders.js", "_call-times.js"]) { try { fs.writeFileSync(path.join(dir, f), read(`netlify/functions/${f}`)); } catch { fs.writeFileSync(path.join(dir, f), "module.exports={}"); } }
const bad = [], C = createRequire(path.join(dir, "x.js"))("./_call-reminders.js"), job = read("netlify/functions/call-reminders.js");
const must = (ok, msg) => { if (!ok) bad.push(msg); };
must(typeof C.reminderText === "function" && typeof C.e164US === "function", "_call-reminders has no reminderText / e164US");
if (typeof C.reminderText === "function") {
  const call = { kind: "monthly", starts_at: "2026-11-12T22:00:00Z" };
  const t24 = C.reminderText(call, "text_24h", { theirTz: "America/New_York", joinLink: "https://meet.google.com/x" }), t1 = C.reminderText(call, "text_1h", {});
  must(/^Rocket Growth Agency: /.test(t24) && /Reply STOP to opt out\.$/.test(t24) && /Reply STOP to opt out\.$/.test(t1), "a reminder text lacks the business name or the STOP line");
  must(/tomorrow, Thursday, Nov 12 at 5:00 PM EST/.test(t24) && !/for RGA/.test(t24), "the 24h text is not in THEIR clock only");
  must(/starts in about an hour, at 2:00 PM PST/.test(t1), "the 1h text does not say the hour and time");
  must(!/—/.test(t24 + t1) && !/\b(colour|organise|centre)\b/.test(t24 + t1), "a reminder text has an em dash or British spelling");
}
if (typeof C.e164US === "function") {
  must(C.e164US("(424) 396-8499") === "+14243968499" && C.e164US("1 424 396 8499") === "+14243968499", "a US number is not normalized");
  must(C.e164US("+44 20 7946 0958") === null && C.e164US("") === null && C.e164US("555-0142") === null, "a non-US or short number would be texted (guessed)");
}
must(C.TEXT_OF && C.TEXT_OF.email_24h === "text_24h" && C.TEXT_OF.email_1h === "text_1h", "the reminder emails do not map to their texts");
must(C.textsAvailable && C.textsAvailable({}).on === false && C.textsAvailable({ QUO_TEXTS_ENABLED: "1" }).on === true, "texts are not off unless QUO_TEXTS_ENABLED=1");
must(/async function sendText\(/.test(job) && /api\.openphone\.com\/v1\/messages/.test(job), "call-reminders.js has no Quo text sender");
const tb = job.slice(job.indexOf("const tk = C.TEXT_OF[kind]"));
must(/!C\.textsAvailable\(\)\.on/.test(tb.slice(0, 300)), "a text can go out with texting switched off");
must(tb.indexOf("claimReminder(call.id, tk)") > -1 && tb.indexOf("claimReminder(call.id, tk)") < tb.indexOf("sendText(to"), "a text is sent before it is claimed (could send twice)");
// reminder_mobile_v1 (11-11): texts go ONLY to clients.reminder_mobile / the prospect note's mobile. Never the contact phone, never the note's phone.
const who = job.slice(job.indexOf("async function whoIs("), job.indexOf("/** Google"));
must(who.length > 50 && /reminder_mobile/.test(who) && /n\.mobile/.test(who), "whoIs does not read reminder_mobile / the note mobile");
must(!/primary_contact_phone/.test(who) && !/n\.phone\b/.test(who), "whoIs falls back to the contact phone or the note phone (RGA's own Quo line would be texted)");
fs.rmSync(dir, { recursive: true, force: true });
if (bad.length) { console.log(`❌ ${bad.length} reminder-text problem(s):`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
console.log("✅ reminder texts hold: their clock, STOP line, no em dash, US numbers only, off unless switched on, claimed before sent (nothing sent)");
