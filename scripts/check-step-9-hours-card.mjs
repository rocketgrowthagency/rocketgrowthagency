#!/usr/bin/env node
// check-step-9-hours-card.mjs — step 9 "Confirm your business hours", the approved card: done = ONE green card (the week as 7
// tiles, holidays with their dates, saved / checked, Google Maps, "Change hours"), no second copy; "Change hours" opens a grey
// "Editing" editor WITHOUT writing (Save writes, Cancel closes), a switch per day, "Copy Monday's hours to Tue–Fri", holiday
// chips that show each holiday's NEXT date from the server.
//
// 🔒 WHY (approved step9_hours_card_v1, 2026-10-16). Chris on the done card: the hours appeared twice (Google's box + 24-hour
// chips + an italic holidays line); "Change" wrote "pending" to the database and flipped the pill to amber "Your turn" before
// anything changed, with no way back; a long form with six stacked lines of text above it.
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js"), css = read("portal/portal.css"), prof = read("netlify/functions/portal-gbp-profile.js");
const js = portal.replace(/^[ \t]*\/\/.*$/gm, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── 1 · the done card, drawn for real ──
const i0 = portal.indexOf("const GBP_DAY = ["), i1 = portal.indexOf("function gbpPushHtml(");
if (i0 < 0 || i1 < i0) { console.error("⚠️  INDETERMINATE — could not lift the hours card"); process.exit(2); }
const ctx = { escapeHtml: esc, escapeAttribute: esc, GOOGLE_G: "", monthDay: (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
vm.createContext(ctx);
vm.runInContext(`${portal.slice(i0, i1)}\nthis.card = hoursCardHtml;`, ctx);
{
  const o = { open: "09:00", close: "18:00" };
  const g = { state: "on_google", at: "2026-10-16T02:48:09Z", after: { mon: o, tue: o, wed: o, thu: o, fri: o, sat: { closed: true }, sun: { closed: true } },
    special: { sent: [{ date: "2026-11-26", name: "Thanksgiving", yearly: true }, { date: "2026-12-24", name: "Christmas Eve", yearly: true }, { date: "2026-12-25", name: "Christmas Day", yearly: true }, { date: "2027-03-02", end: "2027-03-04", name: "Team trip" }] } };
  const h = ctx.card({ id: "m1.gbp.hours_attributes" }, { status: "done", client_input_at: "2026-10-16T02:48:09Z" }, g, "https://maps.google.com/?cid=1");
  if ((h.match(/class="pm-hc-day"/g) || []).length !== 5 || (h.match(/class="pm-hc-day off"/g) || []).length !== 2 || !/<b>Mon<\/b>9 AM–6 PM/.test(h)) fail("the done card doesn't show the week as 7 tiles (5 open, 2 closed, 12-hour times)");
  if (!/Closed every year<\/span><span class="pm-hc-hol">Thanksgiving <i>Nov 26<\/i>/.test(h) || !/One-off<\/span><span class="pm-hc-hol">Team trip <i>Mar 2–Mar 4<\/i>/.test(h)) fail("the done card doesn't list the holidays with their dates (and one-offs apart)");
  if (!/Saved Oct 16 · checked on Google Oct 16 · we renew the holidays every year/.test(h) || !/href="https:\/\/maps\.google\.com\/\?cid=1"[^>]*>See it on Google Maps ↗/.test(h)) fail("the done card doesn't say when it was saved / checked, or lacks the Google Maps link");
  if (!/<button type="button" class="pm-amend pm-hc-change" data-hours-edit="m1\.gbp\.hours_attributes">Change hours<\/button>/.test(h)) fail("the done card has no \"Change hours\"");
}
if (!/if \(g\.state === "on_google" && step\.id === "m1\.gbp\.hours_attributes" && taskState && taskState\.status === "done"\) return hoursCardHtml\(/.test(js)) fail("done hours don't draw the one green card");
if (!/clientDoneConfirm && !hoursCard && !editing/.test(js) || !/!\(step\.id === "m1\.gbp\.business_facts" && gbpWithRga && !amendBtn\) && !hoursCard/.test(js)) fail("the done hours still show a second copy (\"You gave us your hours\" + chips) or the Change / View row");

// ── 2 · Change hours = Editing, without writing; Save writes; Cancel closes ──
if (!/const editing = step\.id === "m1\.gbp\.hours_attributes" && status === "done" && _editingSteps\.has\(step\.id\);/.test(js) || !/const isDone = \(status === "done" \|\| status === "skipped"\) && !editing;/.test(js)) fail("Change hours doesn't open the editor on a done step");
if (!/: editing \? \{ text: "Editing", cls: "edit" \}/.test(js)) fail("editing reads \"Your turn\" (amber) instead of \"Editing\"");
const hb = js.slice(js.indexOf('e.target.closest("[data-hours-edit],[data-in-cancel]")'), js.indexOf('e.target.closest("[data-hours-edit],[data-in-cancel]")') + 700);
if (!hb || /fetch\(/.test(hb) || !/_editingSteps\.add\(id\); else _editingSteps\.delete\(id\);/.test(hb)) fail("Change hours / Cancel write to the database (or don't open / close the editor)");
if (!/s\.kind === "hours" && _editingSteps\.has\(step\.id\) \? `<button type="button" class="pm-amend" data-in-cancel="\$\{id\}">Cancel<\/button>`/.test(js)) fail("the editor has no Cancel");
if (!/_editingSteps\.delete\(stepId\);\s*\/\/ 🔑 Back into the record/.test(portal)) fail("a saved edit doesn't close the editor");
if (!/if \(step\.id === "m1\.gbp\.hours_attributes" && _editingSteps\.has\(step\.id\)\) return "";/.test(js)) fail("the editor still repeats the old green Google line above it");

// ── 3 · the editor itself ──
if (!/class="pm-in-closed pm-sw\$\{[^}]*\}" data-in-closed aria-pressed=/.test(js) || !/function setDaySwitch\(b, off\) \{/.test(js) || !/setDaySwitch\(closed, off\);/.test(js)) fail("a day's Open / Closed isn't a switch");
if (!/data-in-copy-mon>Copy Monday's hours to Tue–Fri<\/button>/.test(js) || !/for \(const k of \["tue", "wed", "thu", "fri"\]\)/.test(js)) fail("there's no \"Copy Monday's hours to Tue–Fri\"");
if (!/data-in-hol="\$\{escapeAttribute\(h\.key\)\}">\$\{escapeHtml\(h\.label\)\} <i data-hol-date><\/i>/.test(js) || !/now\.holidayDates\[hb\.getAttribute\("data-in-hol"\)\]/.test(js)) fail("holiday chips don't show the next date");
if (!/now\.holidayDates = Object\.fromEntries\(H\.holidayOptions\(\)\.map\(\(o\) => \[o\.key, H\.nextOccurrence\(o\.key\)\]\)/.test(prof)) fail("the next holiday dates aren't computed on the server (one source, never stale)");
if (!/✓ matches what you saved/.test(js)) fail("the editor doesn't say whether Google matches what they saved");
if (!/const head = s\.kind === "facts" \|\| s\.kind === "hours" \? gnow :/.test(js)) fail("the editor still stacks a label + help above the days");
if (!/\.pm-sw\.on \.tg \{ background:var\(--state-ok(?:,#0c5132)?\); \}/.test(css) || !/\.pm-hc-week \{ display:grid; grid-template-columns:repeat\(7,minmax\(0,1fr\)\);/.test(css)) fail("the switch / week tiles aren't styled");

if (F.length) { console.error("🔴 Step 9 isn't the approved hours card:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 9 is the approved card: done = one green card (week tiles, holidays with dates, saved / checked, Maps, Change hours), no second copy; Change hours = \"Editing\" without a write, Cancel / Save; a switch per day, Copy Monday to Tue–Fri, holiday chips with the server's next dates");
