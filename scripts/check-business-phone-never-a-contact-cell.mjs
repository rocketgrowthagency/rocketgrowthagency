#!/usr/bin/env node
// check-business-phone-never-a-contact-cell.mjs: THE BUSINESS PHONE IS identity_phone; A CONTACT'S CELL NEVER STANDS IN FOR IT
// (approved business_phone_only_v1, section F of the calls-catchup mockup, 11-11). A contact's phone could be compared with Google,
// written to Google at end of service, or used as where tracked calls ring.
// HOLDS, on the WEBSITE repo:
//   1  no code line in netlify/functions falls back from identity_phone to primary_contact_phone (either order), except the
//      listed OPEN files (OPEN below: found 11-11, outside the five, reported to Chris, each with its reason).
//   2  the five files never read primary_contact_phone in a code line at all.
//   3  the five messages exist, exactly: dup-cleared, account health, step notices, call tracking (400), end of service.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default df9de9b5) in 6+ places, else exit 2.
//   node scripts/check-business-phone-never-a-contact-cell.mjs [--against=<rev>] [--no-before]
import { runGate, reader, codeLines } from "./lib/site-rev.mjs";
import fs from "node:fs";
import path from "node:path";

const BEFORE = "df9de9b5";
const FIVE = ["_dup-cleared.js", "_monthly-health.js", "notify-step-open.js", "call-tracking-provision.js", "_offboarding.js"];
// Known, NOT yet fixed (outside the five): file -> why. A new fallback anywhere else fails the gate.
const OPEN = {
  "portal-deliverables.js": "the Google-listing step shows the contact's phone when no business phone is saved (found 11-11; needs its own fix)",
  "_citation-trade.js": "reads both phones to recognize a trade for citation matching; it never writes either anywhere",
};
const MSG = [
  ["_dup-cleared.js", "Phone not compared: no business phone on file"],
  ["_ai-check.js", "Business phone not on file · Add it"],
  ["notify-step-open.js", "No business phone on file to compare with Google"],
  ["call-tracking-provision.js", "Where should tracked calls ring? Enter the business phone first"],
  ["_offboarding.js", "Real business number unknown: RGA enters it before Google is changed"],
];

function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root);
  const dir = path.join(root, "netlify/functions");
  if (!fs.existsSync(dir)) { fail("netlify/functions is missing"); return F; }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = rd(`netlify/functions/${f}`);
    for (const { l, n } of codeLines(src)) {
      if (!/identity_phone/.test(l) || !/primary_contact_phone/.test(l) || /select=/.test(l)) continue;
      if (!/\|\||\?\?|\[\s*[\w.]*identity_phone\s*,/.test(l)) continue;
      if (OPEN[f]) continue;
      fail(`${f}:${n} falls back from the business phone to a contact's phone`);
    }
  }
  for (const f of FIVE) {
    const src = rd(`netlify/functions/${f}`);
    if (src == null) { fail(`${f} is missing`); continue; }
    for (const { l, n } of codeLines(src)) if (/primary_contact_phone/.test(l)) fail(`${f}:${n} reads primary_contact_phone; this file may use the business phone only`);
  }
  for (const [f, m] of MSG) {
    const src = rd(`netlify/functions/${f}`);
    if (src == null || !src.includes(m)) fail(`${f} does not say "${m}"`);
  }
  return F;
}
try {
  await runGate({ name: "check-business-phone-never-a-contact-cell", beforeRev: BEFORE, checkTree, minBefore: 6 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
