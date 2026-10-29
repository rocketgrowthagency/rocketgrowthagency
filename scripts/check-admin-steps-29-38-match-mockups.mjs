#!/usr/bin/env node
// check-admin-steps-29-38-match-mockups.mjs — 2026-10-29, Chris approved 11 mockups ("all approved."): admin steps 29–38, one page each,
// and client portal step 4's done card (project_admin_steps_29_38_redesign). This gate pins each one AS IT IS BUILT — it RUNS the lifted
// admin / portal code with real-shaped records and checks what's drawn:
//   · step 34 (admin_step34_hours_v1): one week of tiles (12-hour clock), closed days as dated chips, one proof line, no client email,
//     "the same as before" when Google's hours didn't change, a changed day shows "was …"
//   · step 33 (admin_step33_description_v1): the published description whole, the 750 meter, approved + published dates, ONE action
//     (Draft a new one), never "ready to paste"
//   · step 37 (admin_step37_image_seo_v1) — every website-change step: no second Draft button and no Mark step complete on the row
//   · client step 4 (client_step4_done_card_v1): the done card leads with the service area when places were added/covered, says why the
//     covered ones count, folds the rest by name; the lock line's own "Need a change? ›" is hidden (Change something opens it)
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const AJS = read("admin/admin.js"), PJS = read("portal/portal.js");
const lift = (src, name) => { const m = new RegExp(`^(?:const ${name} = |function ${name}\\()`, "m").exec(src); if (!m) return null;
  const lines = src.slice(m.index).split("\n"); let d = 0, o = []; for (const l of lines) { o.push(l); for (const c of l) { if (c === "{" || c === "(" || c === "[") d++; else if (c === "}" || c === ")" || c === "]") d--; } if (d <= 0 && /[;}`\]]\s*$/.test(l)) break; } return o.join("\n"); };
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── admin: steps 33 + 34 ────────────────────────────────────────────────────────────────────────
const parts = ["ZC_DAYS", "zcClock", "zcSpan", "hoursDoneCardHtml", "descriptionOnGoogle", "descriptionDoneCardHtml"].map((n) => lift(AJS, n));
if (parts.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step 33/34 card moved (${parts.findIndex((x) => !x)})`); process.exit(2); }
const ctx = { escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg data-g></svg>", adminGcardMaps: () => '<a class="ob-gcard-maps">See it on Google Maps ↗</a>',
  adminGcardWhen: (iso) => (iso ? "Oct 29, 3:30 AM" : "") };
vm.createContext(ctx); vm.runInContext(parts.join("\n") + "\nthis.hours = hoursDoneCardHtml; this.desc = descriptionDoneCardHtml; this.descOn = descriptionOnGoogle;", ctx);
const wk = (o, c) => ({ open: o, close: c }), DAYS = { mon: wk("09:00", "18:00"), tue: wk("09:00", "18:00"), wed: wk("09:00", "18:00"), thu: wk("09:00", "18:00"), fri: wk("09:00", "18:00"), sat: { closed: true }, sun: { closed: true } };
const g34 = { state: "on_google", at: "2026-10-29T10:30:00Z", before: { days: DAYS }, after: { days: DAYS }, renewed_to: "2026-12-25",
  special: { sent: [{ name: "Thanksgiving", date: "2026-11-26" }, { name: "Christmas Eve", date: "2026-12-24" }, { name: "Christmas Day", date: "2026-12-25" }], kept: [] } };
const h = ctx.hours({ days: DAYS }, g34);
if ((h.match(/class="ob-zc-day/g) || []).length !== 7) fail("step 34: not one tile per day");
if ((h.match(/9 AM – 6 PM/g) || []).length !== 5 || (h.match(/>Closed</g) || []).length !== 2) fail("step 34: the week isn't 12-hour (9 AM – 6 PM) with Sat/Sun Closed");
if (!/Thanksgiving · Nov 26/.test(h) || !/Christmas Day · Dec 25/.test(h)) fail("step 34: the closed days aren't dated chips");
if (!/the same as before \(nothing needed changing\)/.test(h) || !/renewed through Dec 25/.test(h) || !/their own special hours on Google: none/.test(h)) fail("step 34: the proof line is missing a part");
if (/Before \(Google\)|After \(read back\)|@/.test(h)) fail("step 34: the hours are written out again (before/after) or a client email shows");
const h2 = ctx.hours({ days: { ...DAYS, sat: wk("10:00", "14:00") } }, g34);
if (!/was Closed/.test(h2) || !/class="ob-zc-day chg"/.test(h2)) fail("step 34: a day that changed doesn't show what Google had (was …)");
if (!/if \(spec\.kind === "hours" && g && g\.state === "on_google" && !\(v && v\.by_appointment\)\) return `<div class="ob-in ob-in-facts">\$\{hoursDoneCardHtml\(v, g\)\}/.test(AJS)) fail("step 34's on-Google state doesn't use the week card");
if (!/o\.flowId === "m1\.gbp\.hours_attributes" && gp && gp\.state === "on_google" && !\(s\.task\?\.client_input\?\.by_appointment\) \? ""/.test(AJS)) fail("step 34 still prints 'Saved by the client (email)' above the card");
const D = "Rocket Growth Agency helps local businesses in Culver City, CA stand out online & attract more customers.";
const t33 = { approval: { by: "Chris Kapranos", at: "2026-09-14T23:20:34Z", approved_content: D }, published: { at: "2026-09-15T02:52:59Z", field: "profile.description", after: { description_chars: 592 } } };
if (!ctx.descOn(t33) || ctx.descOn({ ...t33, published: null }) || ctx.descOn({ ...t33, published: { ...t33.published, field: "categories" } })) fail("step 33: 'on Google' is decided wrong (it must be published with field profile.description)");
const d = ctx.desc(t33);
if (!d.includes(esc(D)) || !/<b>592<\/b> characters/.test(d) || !/592 \/ 750 characters/.test(d)) fail("step 33: the text isn't whole, or the 750 meter is missing");
if (!/Approved by Chris Oct 29 · published Oct 29/.test(d.replace(/Sep 1[45]/g, "Oct 29")) || !/On Google · published/.test(d)) fail("step 33: who approved / when published is missing");
if (/ready to paste|push via API|each night/.test(d)) fail("step 33: says 'ready to paste' (it's live) or claims a nightly re-read that doesn't exist");
if ((d.match(/<button/g) || []).length !== 1 || !/>Draft a new one</.test(d)) fail("step 33: not ONE action (Draft a new one)");
if (!/: descriptionOnGoogle\(s\.task\) \? `<div class="ob-done-card">\$\{descriptionDoneCardHtml\(s\.task\)\}<\/div>`/.test(AJS)) fail("step 33's done row doesn't use the description card");

// ── admin: step 37 — every website-change step ─────────────────────────────────────────────────
if (!/const siteStep = !!\(globalThis\.rgaSiteChange && globalThis\.rgaSiteChange\.isSiteChangeStep\(o\.flowId\)\);\s*const runBtn = runnable && !siteStep/.test(AJS)) fail("step 37: a website step's row still has its own Draft button (the card has one)");
if (!/const doneBtn = zcWaits \|\| siteStep \? "" :/.test(AJS)) fail("step 37: a website step's row still offers Mark step complete");

// ── admin: steps 35 + 36 — the client's move ───────────────────────────────────────────────────
if (!/const ZC_NO_HAND_DONE = new Set\(\["m1\.gbp\.attributes", "m1\.gbp\.booking_link", "m1\.gbp\.photos"\]\)/.test(AJS) || !/const inner = \(rowHasDone \|\| ZC_NO_HAND_DONE\.has\(o\.flowId\) \? "" : btn\("done", "Done"\)\)/.test(AJS)) fail("steps 35/36/38: RGA can still tick a client's Google step Done");
{ const p2 = ["ZC_CLIENT_ASK", "zcClientAskHtml"].map((n) => lift(AJS, n));
  if (p2.some((x) => !x)) { console.error("⚠️  INDETERMINATE — the client's-move card moved"); process.exit(2); }
  const c2 = { escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg></svg>", CLIENT_GBP_STEPS: { "m1.gbp.attributes": "What's true of the business (Google details)", "m1.gbp.booking_link": "Booking link" } };
  vm.createContext(c2); vm.runInContext(p2.join("\n") + "\nthis.ask = zcClientAskHtml;", c2);
  const a = c2.ask("m1.gbp.attributes", "c1"), b = c2.ask("m1.gbp.booking_link", "c1");
  if (!/Client's move/.test(a) || !/Waiting for the client to tick what's true/.test(a) || !/On Google · read back/.test(a)) fail("step 35: the card doesn't say whose move, what they do, and the path");
  if (!/data-step-nudge="m1\.gbp\.attributes">Remind the client…/.test(a) || !/Nothing is sent until you confirm/.test(a)) fail("step 35: Remind the client… isn't the confirm-first nudge");
  if (/data-task-status="done"|<button[^>]*>Done</.test(a + b)) fail("steps 35/36: a Done button is in the card");
  if (!/data-ob-bk-rec="c1"/.test(b) || !/What the client sees first/.test(b)) fail("step 36: RGA's pick isn't shown as the client sees it");
}
if (!/function gNotSavedHtml\(flowId\) \{\s*if \(ZC_CLIENT_ASK\[flowId\]\) \{/.test(AJS)) fail("steps 35/36 still draw the old 'Not saved yet' card");
if (!/if \(step && step\.obj && step\.obj\.flowId === "m1\.gbp\.business_description" && descriptionOnGoogle\(step\.task\)\) return "";/.test(AJS)) fail("step 33: the out-of-date paragraph still shows above a description that's on Google");

// ── client step 4's done card ──────────────────────────────────────────────────────────────────
if (!/const lead = adds\.length \|\| drops\.length \? \[0, 4\] : \[0, 1\]/.test(PJS)) fail("client step 4: the done card doesn't lead with the service area when places were added/covered");
if (!/\+ \$\{rest\.length\} more · \$\{rest\.map\(\(i\) => names\[i\]\)\.join\(", "\)\}/.test(PJS)) fail("client step 4: the fold doesn't name what's inside it");
if (!/so Google already shows you there\./.test(PJS) || !/row\("Service area", escapeHtml\(areaLine\), areaSt, escapeHtml\(coveredSub\)\)/.test(PJS)) fail("client step 4: the covered areas don't say why they count (or the sentence isn't escaped)");
if (!/const CARD_ASKS_CHANGE = new Set\(\["m1\.gbp\.business_facts"\]\)/.test(PJS) || !/data-ask-open aria-expanded="false"\$\{CARD_ASKS_CHANGE\.has\(stepId\) \? " hidden" : ""\}>Need a change\? ›/.test(PJS)) fail("client step 4: the lock line still shows a second 'Need a change? ›' button");

if (F.length) { console.error(`🔴 admin steps 29–38 / client step 4 drifted from the approved mockups:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ admin steps 33 · 34 · 37 + client step 4's done card match their approved mockups: the week of tiles, the live description whole, one Draft button, the service area first");
