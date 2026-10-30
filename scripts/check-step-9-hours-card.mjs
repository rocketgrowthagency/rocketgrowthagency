#!/usr/bin/env node
// check-step-9-hours-card.mjs — step 9 "Confirm your business hours", the approved card: done = ONE green card (the week as 7
// tiles, holidays with their dates, saved / checked, Google Maps, ONE "Change something" — client_step07_hours_v1, 10-29), no second copy; "Change hours" opens a grey
// "Editing" editor WITHOUT writing (Save writes, Cancel closes), a switch per day, "Copy Monday's hours to Tue–Fri", holiday
// chips that show each holiday's NEXT date from the server.
//
// 🔒 WHY (approved step9_hours_card_v1, 2026-10-16). Chris on the done card: the hours appeared twice (Google's box + 24-hour
// chips + an italic holidays line); "Change" wrote "pending" to the database and flipped the pill to amber "Your turn" before
// anything changed, with no way back; a long form with six stacked lines of text above it.
import fs from "node:fs";
import vm from "node:vm";
import { csBlock } from "./lib/portal-cs.mjs";
import { planCardKit } from "./lib/plan-card-kit.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js"), css = read("portal/portal.css"), prof = read("netlify/functions/portal-gbp-profile.js");
const js = portal.replace(/^[ \t]*\/\/.*$/gm, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── 1 · the done card, drawn for real ──
const i0 = portal.indexOf("const GBP_DAY = ["), i1 = portal.indexOf("function gbpPushHtml(");
if (i0 < 0 || i1 < i0) { console.error("⚠️  INDETERMINATE — could not lift the hours card"); process.exit(2); }
const ctx = { document: { addEventListener() {} }, escapeHtml: esc, escapeAttribute: esc, GOOGLE_G: "", monthDay: (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
vm.createContext(ctx);
{ const kit = planCardKit(portal, "const monthDay =\n" + portal.slice(i0, i1)); vm.runInContext(`${kit}\n${csBlock(portal, kit + "\n" + portal.slice(i0, i1))}\n${portal.slice(i0, i1)}\nthis.card = hoursCardHtml;`, ctx); }   // 10-29: + the client card system (client_step07_hours_v1)   // 10-23: + the plan card's shared pieces
{
  const o = { open: "09:00", close: "18:00" };
  const g = { state: "on_google", at: "2026-10-16T02:48:09Z", after: { mon: o, tue: o, wed: o, thu: o, fri: o, sat: { closed: true }, sun: { closed: true } },
    special: { sent: [{ date: "2026-11-26", name: "Thanksgiving", yearly: true }, { date: "2026-12-24", name: "Christmas Eve", yearly: true }, { date: "2026-12-25", name: "Christmas Day", yearly: true }, { date: "2027-03-02", end: "2027-03-04", name: "Team trip" }] } };
  const h = ctx.card({ id: "m1.gbp.hours_attributes" }, { status: "done", client_input_at: "2026-10-16T02:48:09Z" }, g, "https://maps.google.com/?cid=1");
  // 🔄 10-29 (approved client_step07_hours_v1, the card system): the band "Your hours are on Google · checked", the week as seven
  // small tiles ("9–6"), the holidays as chips EACH WITH ITS NEXT DATE (that is how a yearly closure shows it renews — the old
  // "How holidays renew" fold is gone), one-offs apart with their dates, Maps in the card's foot, and ONE "Change something"
  // (it was "Change hours" + "Something's not right?")
  if ((h.match(/class="pm-cs-day"/g) || []).length !== 5 || (h.match(/class="pm-cs-day c"/g) || []).length !== 2 || !/<div class="pm-cs-week">/.test(h) || !/<div class="pm-cs-day"><b>MON<\/b>9–6<\/div>/.test(h)) fail("the done card doesn't show the week as 7 tiles (5 open \"9–6\", 2 closed)");
  if (!/<span class="k">Closed for holidays<\/span><div class="pm-cs-chipw"><span class="pm-cs-chip">Thanksgiving · Nov 26<\/span><span class="pm-cs-chip">Christmas Eve · Dec 24<\/span><span class="pm-cs-chip">Christmas Day · Dec 25<\/span><\/div>/.test(h)
    || !/<span class="k">Closed once<\/span><div class="pm-cs-chipw"><span class="pm-cs-chip">Team trip · Mar 2<\/span>/.test(h)) fail("the done card doesn't show the yearly holidays as chips with their next dates, and one-offs apart with their dates");
  if (!/<div class="pm-k5-plan pm-cs-card ok">/.test(h) || !/<b>Your hours are on Google<\/b><span>checked Oct 16<\/span>/.test(h) || !/<div class="pm-cs-foot"><a class="lk" href="https:\/\/maps\.google\.com\/\?cid=1"[^>]*>See it on Google Maps ↗<\/a><\/div>/.test(h)) fail("the done card isn't the green band \"Your hours are on Google · checked\" with Maps in its foot");
  if (/Something's not right\?|>Change hours</.test(h)) fail("the done card still has the old pair (\"Change hours\" + \"Something's not right?\") instead of ONE Change something");
  if ((h.match(/>Change something<\/button>/g) || []).length !== 1 || !/<div class="pm-k5-acts"><button type="button" class="pm-amend pm-hc-change" data-hours-edit="m1\.gbp\.hours_attributes">Change something<\/button><\/div>/.test(h)) fail("the done card has no ONE \"Change something\" (data-hours-edit) under the card");
  // by appointment only: no week, one note
  const ap = ctx.card({ id: "m1.gbp.hours_attributes" }, { status: "done", client_input: { by_appointment: true } }, g, "");
  if (!/By appointment only, on Google/.test(ap) || /pm-cs-week/.test(ap) || !/No regular hours on Google: customers call or book a time\./.test(ap)) fail("a by-appointment business still shows a week of hours");
}
if (!/if \(g\.state === "on_google" && step\.id === "m1\.gbp\.hours_attributes" && taskState && taskState\.status === "done"\) return hoursCardHtml\(/.test(js)) fail("done hours don't draw the one green card");
// 🔑 10-16 (step10_booking_link_v1): the done hours card is one of the steps that draw their own card (ownGoogleCard)
if (!/const ownGoogleCard = hoursCard \|\| bookingCard(?: \|\| attrsCard)?(?: \|\| svcCard)?;/.test(js) || !/clientDoneConfirm && !ownGoogleCard && !editing/.test(js) || !/!\(step\.id === "m1\.gbp\.business_facts" && gbpWithRga && !amendBtn\) && !ownGoogleCard/.test(js)) fail("the done hours still show a second copy (\"You gave us your hours\" + chips) or the Change / View row");

// ── 2 · Change hours = Editing, without writing; Save writes; Cancel closes ──
if (!/^const EDIT_IN_PLACE = new Set\(\[[^\]]*"m1\.gbp\.hours_attributes"/m.test(portal) || !/const editing = EDIT_IN_PLACE\.has\(step\.id\) && status === "done" && _editingSteps\.has\(step\.id\);/.test(js) || !/const isDone = \(status === "done" \|\| status === "skipped"\) && !editing;/.test(js)) fail("Change hours doesn't open the editor on a done step");
if (!/: editing \? \{ text: "Editing", cls: "edit" \}/.test(js)) fail("editing reads \"Your turn\" (amber) instead of \"Editing\"");
const HB = 'e.target.closest("[data-hours-edit],[data-step-edit],[data-in-cancel]")';
const hb = js.indexOf(HB) < 0 ? "" : js.slice(js.indexOf(HB), js.indexOf(HB) + 800);
if (!hb || /fetch\(/.test(hb) || !/_editingSteps\.add\(id\); else _editingSteps\.delete\(id\);/.test(hb)) fail("Change hours / Cancel write to the database (or don't open / close the editor)");
if (!/\(s\.kind === "hours"(?: \|\| s\.kind === "booking")?(?: \|\| step\.id === "m1\.gbp\.attributes")?(?: \|\| step\.id === "m1\.gbp\.services_products")?\) && _editingSteps\.has\(step\.id\) \? `<button type="button" class="pm-amend" data-in-cancel="\$\{id\}">Cancel<\/button>`/.test(js)) fail("the editor has no Cancel");
if (!/_editingSteps\.delete\(stepId\);\s*\/\/ 🔑 Back into the record/.test(portal)) fail("a saved edit doesn't close the editor");
if (!/if \(EDIT_IN_PLACE\.has\(step\.id\) && _editingSteps\.has\(step\.id\)\) return "";/.test(js)) fail("the editor still repeats the old green Google line above it");

// ── 3 · the editor itself ──
if (!/class="pm-in-closed pm-dsw\$\{[^}]*\}" data-in-closed aria-pressed=/.test(js) || !/function setDaySwitch\(b, off\) \{/.test(js) || !/setDaySwitch\(closed, off\);/.test(js)) fail("a day's Open / Closed isn't a switch");
if (!/data-in-copy-mon>Copy Monday's hours to Tue–Fri<\/button>/.test(js) || !/for \(const k of \["tue", "wed", "thu", "fri"\]\)/.test(js)) fail("there's no \"Copy Monday's hours to Tue–Fri\"");
if (!/data-in-hol="\$\{escapeAttribute\(h\.key\)\}">\$\{escapeHtml\(h\.label\)\} <i data-hol-date><\/i>/.test(js) || !/now\.holidayDates\[hb\.getAttribute\("data-in-hol"\)\]/.test(js)) fail("holiday chips don't show the next date");
if (!/now\.holidayDates = Object\.fromEntries\(H\.holidayOptions\(\)\.map\(\(o\) => \[o\.key, H\.nextOccurrence\(o\.key\)\]\)/.test(prof)) fail("the next holiday dates aren't computed on the server (one source, never stale)");
if (!/✓ matches what you saved/.test(js)) fail("the editor doesn't say whether Google matches what they saved");
if (!/const head = (?:s\.kind === "booking"(?: \|\| step\.id === "m1\.gbp\.attributes")?(?: \|\| step\.id === "m1\.gbp\.services_products")? \? "" : )?s\.kind === "facts" \|\| s\.kind === "hours" \? gnow :/.test(js)) fail("the editor still stacks a label + help above the days");
if (!/\.pm-dsw\.on \.tg \{ background:var\(--state-ok(?:,#0c5132)?\); \}/.test(css) || !/\.pm-cs-week \{ display:grid; grid-template-columns:repeat\(7,minmax\(0,1fr\)\);/.test(css)) fail("the switch / week tiles aren't styled");

// 🔴 10-16: the switch first used ".pm-sw" — already the legend's 12px swatch — and shrank to 12px, its label over the time box.
// Its class is its own: defined in one place only.
if ((css.match(/^\.pm-dsw\s*\{/gm) || []).length !== 1 || /^\.pm-sw \{ display:inline-flex/m.test(css)) fail("the day switch's class is styled by another rule too (it shrinks)");
if (F.length) { console.error("🔴 Step 9 isn't the approved hours card:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 9 is the approved card: done = one green card (week tiles, holiday chips with next dates, checked, Maps in the foot, ONE Change something), no second copy; Change hours = \"Editing\" without a write, Cancel / Save; a switch per day, Copy Monday to Tue–Fri, holiday chips with the server's next dates");
