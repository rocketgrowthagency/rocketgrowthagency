#!/usr/bin/env node
// check-email-engagement-is-counted.mjs — 11-10 (the owner: "all emails opens and clicks are tracked and update in airtable and our Calls tab
// ... tested also?"). Three rules, each found broken on live data that morning:
//   1 a Gmail open counts: track-open filed every GoogleImageProxy load as "prefetch", but Gmail loads on OPEN (none of 11 loads came within a
//     minute of the send). Only a load within 60 s of that day's send is prefetch now.
//   2 a click proves an open: track-click sets "Email Opened", the field the Apps Script's suppressDeadFunnelLeads reads, so a clicker is never
//     killed as a "non-opener" (6 real clickers were).
//   3 the Calls tab takes back a lead closed ONLY by that auto-suppress if it clicked, never one a person closed (reply, unsubscribe, bounce,
//     a call outcome), and never by touching its email sequence.
// Fakes only (no Airtable, no network). Proves itself on the before state (380620b1 by default; --against=<rev>): exit 2 if it can't.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BEFORE = (process.argv.find((a) => a.startsWith("--against=")) || "--against=380620b1").slice(10);
const NOTE = "[2026-11-10] [auto-suppress] No opens recorded across Day 1+4+9 (3 touches)";
function check(dir) {
  const bad = [], need = (ok, m) => { if (!ok) bad.push(m); };
  const req = createRequire(path.join(dir, "x.js"));
  const ext = (f) => { try { return req(path.join(dir, "netlify/functions", f))._test || null; } catch (e) { return null; } };
  const T = ext("track-open.js"), Q = ext("sales-call-queue.js");
  const click = fs.readFileSync(path.join(dir, "netlify/functions/track-click.js"), "utf8");
  // 1 · Gmail opens
  const GP = "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)";
  need(T && typeof T.gmailOnReceipt === "function", "1 track-open has no Gmail-open rule (every GoogleImageProxy load is filed as prefetch)");
  if (T && T.gmailOnReceipt) {
    const now = Date.parse("2026-11-10T16:17:38Z");
    need(T.classifyPrefetch(GP) === null, "1 a GoogleImageProxy load is classified as prefetch by its user agent alone");
    need(T.gmailOnReceipt(GP, "2026-11-10T15:08:57Z", now) === false, "1 a Gmail open an hour after the send is not counted");
    need(T.gmailOnReceipt(GP, "2026-11-10T16:17:10Z", now) === true, "1 a Gmail load 28 s after the send is counted as an open (that one IS on receipt)");
    need(T.gmailOnReceipt(GP, undefined, now) === false, "1 a Gmail open with no send time on record is not counted");
    need(T.classifyPrefetch("Mozilla/5.0 (compatible; Mimecast)") !== null && T.classifyPrefetch("") !== null, "1 scanners or an empty user agent now count as opens");
  }
  // 2 · a click proves an open
  need(/const patchFields = \{[^}]*"Email Opened": true[^}]*\};/.test(click), "2 a click doesn't set Email Opened, so the Apps Script kills clickers as non-openers");
  // 3 · Calls takes back auto-suppressed clickers only
  need(Q && typeof Q.callable === "function", "3 sales-call-queue has no callable rule to test");
  if (Q && Q.callable) {
    const base = { Phone: "(310) 555-0100", Status: "dead", Suppressed: true, "Funnel State": "closed_dnc", "Outreach Notes": NOTE, "Day 9 Clicked At": "2026-11-02T15:07:00Z" };
    need(Q.callable(base) === true, "3 a clicker closed only by the auto-suppress is not back on the Calls tab");
    need(Q.callable({ ...base, "Day 9 Clicked At": undefined }) === false, "3 an auto-suppressed lead that never clicked is callable");
    need(Q.callable({ ...base, "Outreach Notes": "[2026-10-01] asked us to stop" }) === false, "3 a lead a person closed is callable");
    need(Q.callable({ ...base, Replied: true }) === false, "3 a lead that replied is callable");
    need(Q.callable({ ...base, "Email Status": "unsubscribed" }) === false, "3 an unsubscribed lead is callable");
    need(Q.callable({ ...base, "Call Outcome": "not_interested" }) === false, "3 a lead with a call outcome is overridden");
    need(Q.callable({ ...base, "Funnel State": "closed_not_interested" }) === false, "3 a not-interested lead is callable");
    need(Q.callable({ ...base, Phone: "" }) === false, "3 a lead with no phone is callable");
  }
  return bad;
}
const now = check(SITE);
let before;
try {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eng-before-"));
  for (const f of ["track-open.js", "track-click.js", "sales-call-queue.js", "_deadline.js", "_airtable-ok.js"]) {
    fs.mkdirSync(path.join(tmp, "netlify/functions"), { recursive: true });
    try { fs.writeFileSync(path.join(tmp, "netlify/functions", f), execFileSync("git", ["-C", SITE, "show", `${BEFORE}:netlify/functions/${f}`], { encoding: "utf8" })); } catch {}
  }
  before = check(tmp);
} catch (e) { console.log(`INDETERMINATE: couldn't rebuild the before state ${BEFORE} (${String(e.message).slice(0, 120)})`); process.exit(2); }
if (before.length < 3) { console.log(`INDETERMINATE: only ${before.length} problem(s) found at ${BEFORE}; this check can't tell before from after`); process.exit(2); }
if (now.length) { console.log(`❌ email engagement — ${now.length} problem(s):`); now.forEach((m) => console.log(`  · ${m}`)); process.exit(1); }
console.log(`✅ email engagement is counted: Gmail opens count (not a load inside 60 s of the send), a click proves an open, and Calls takes back auto-suppressed clickers only. Proven: ${BEFORE} fails ${before.length} ways.`);
