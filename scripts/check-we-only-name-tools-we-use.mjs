#!/usr/bin/env node
/**
 * check-we-only-name-tools-we-use.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 A STEP THAT SAYS "ZOOM" WHEN WE USE GOOGLE MEET IS A CLIENT BEING TOLD SOMETHING UNTRUE.
 *
 * The booking decision was made 2026-09-03: Google Calendar + Meet, not Zoom. Step 1's INTERNAL
 * instructions were updated the same day and `MEMORY_delivery.md` recorded it as **"✅ Zoom→Meet
 * fixed"**.
 *
 * It was not fixed. FOUR client-facing strings still read "30-min Zoom" thirteen days later, and
 * Chris found them by reading his own portal:
 *
 *     "also all places that ZOOM is listed needs to be changed to Google Meets right?
 *      as this is what we agreed we will use"
 *
 * 🔑 The failure mode is specific and it will happen again: **a decision gets applied where the
 * person making it was looking, and nowhere else.** The internal copy and the client copy live in
 * the same file, two lines apart, and only one moved. Nothing checked, so "fixed" meant "fixed the
 * instance I had open".
 *
 * This gate sweeps EVERY surface a client can read for tools we have decided against.
 *
 * → feedback_fix_the_class_not_the_instance · project_call_close_and_contract_flow
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Tools we have DECIDED AGAINST, and what we use instead. Adding a row here is how a decision
// becomes enforceable rather than remembered.
//
// 🔑 `allowNear` exists because naming the rejected tool is sometimes CORRECT — "Google Calendar +
// Meet, NOT Zoom" is the decision itself written down, and a gate that flags its own rationale is
// a gate people switch off. → feedback_a_check_must_not_validate_itself
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const REJECTED = [
  {
    word: /\bZoom\b/,
    use: "Google Meet",
    since: "2026-09-03",
    // A map zoom level is not a video call.
    notWhen: /zoom\s*(level|in|out)|maxZoom|minZoom|zoomLevel|setZoom|--zoom|z=\d/i,
    allowNear: /\bNOT Zoom\b|instead of Zoom|rather than Zoom|not Zoom,/i,
  },
];

// Every field a CLIENT can read, plus the internal ones — because an internal instruction that
// still names the old tool is how a human re-introduces it into client copy.
const CLIENT_FIELDS = ["clientLabel", "clientHint", "clientInstructions", "clientWaitingNote", "clientDoneConfirm", "clientDoneCta"];
const INTERNAL_FIELDS = ["title", "instructions", "why", "actionLabel"];

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── we only name tools we actually use ──");

const check = (text, where, clientFacing) => {
  if (typeof text !== "string") return;
  for (const r of REJECTED) {
    if (!r.word.test(text)) continue;
    if (r.notWhen && r.notWhen.test(text)) continue;      // a map zoom, not a meeting
    if (r.allowNear && r.allowNear.test(text)) continue;  // the decision, written down
    const snip = text.slice(Math.max(0, text.search(r.word) - 30), text.search(r.word) + 40).replace(/\s+/g, " ");
    bad(`${clientFacing ? "🔴 CLIENT-FACING " : ""}${where} still names ${r.word.source.replace(/\\b/g, "")} `
      + `(decided against ${r.since}; we use ${r.use}) — "…${snip}…"`);
  }
};

// ── 1. the playbook, both halves ───────────────────────────────────────────────────────────────
const pb = JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/playbooks.json"), "utf8"));
for (const lst of ["month1", "month2plus"]) {
  for (const s of pb[lst] || []) {
    for (const f of CLIENT_FIELDS) check(s[f], `${s.id}.${f}`, true);
    for (const f of INTERNAL_FIELDS) check(s[f], `${s.id}.${f}`, false);
    for (const c of s.clientChoices || []) {
      check(c.label, `${s.id}.choice(${c.key}).label`, true);
      check(c.confirm, `${s.id}.choice(${c.key}).confirm`, true);
    }
  }
}

// ── 2. the client-safe projection, which is what the portal actually serves ────────────────────
// 🔴 Checking only the source would pass while a stale projection still shipped the old word.
const csPath = path.join(SITE, "data/playbooks/client-steps.json");
if (fs.existsSync(csPath)) {
  const cs = JSON.parse(fs.readFileSync(csPath, "utf8"));
  for (const s of [...(cs.month1 || []), ...(cs.month2plus || [])]) {
    for (const f of CLIENT_FIELDS) check(s[f], `PROJECTION ${s.id}.${f}`, true);
  }
} else bad("client-steps.json is missing — the portal would have nothing to serve");

// ── 3. client-facing copy that lives outside the playbook ──────────────────────────────────────
const SURFACES = [
  "data/client-facts.json",
  "netlify/functions/_client-copy.js",
  "netlify/functions/send-welcome-email.js",
  "netlify/functions/send-confirmation-email.js",
  "netlify/functions/notify-client-stage.js",
];
for (const rel of SURFACES) {
  const full = path.join(SITE, rel);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, "utf8");
  for (const [i, line] of src.split("\n").entries()) {
    if (/^\s*(\/\/|\*)/.test(line)) continue;   // a comment explaining the decision is fine
    check(line, `${rel}:${i + 1}`, true);
  }
}

console.log(fail
  ? `\n🔴 ${fail} place(s) name a tool we decided against. A client reading that is being told something untrue.`
  : "\n✅ no client-facing surface names a tool we have decided against.");
process.exit(fail ? 1 : 0);
