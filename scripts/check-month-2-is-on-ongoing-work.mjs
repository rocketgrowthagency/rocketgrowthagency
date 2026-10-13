#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-month-2-is-on-ongoing-work.mjs
//
// 🔒 WHY (2026-10-13, approved month2_ongoing_cards_v1): the first Month-2 walk found that a client in the Monthly cycle
// (stage 5) had NO portal home for the five Month-2 client steps. Setup showed no step rows at stage 5, and Ongoing work
// listed the four monthly jobs during setup and then dropped three of them once setup ended, so the client could not send
// their numbers or a video link, and never saw the check-in call or its wait. Chris approved finishing the 10-08 design:
// the five steps are cards on Ongoing work, drawn by the SAME row renderer as Setup.
// HOLDS:
//   1. After setup, Ongoing work IS the Month-2 list (buildActionItemsHtml month2Only); during setup it is unchanged.
//   2. Setup lists Month 1 only, and its stage-5 / stage-6 layouts no longer carry the customer list or photo upload
//      (one home each). Every Month-2 client step is in the approved card order; the weekly job comes first.
//   3. Each card is open (not an accordion), shows its period ("Week of …" for the weekly job, the reporting month for
//      the rest, in UTC like the record), and the photo upload + customer list sit IN the card (no jump button).
//   4. Step 15's progress is counted ("N of 5 photos this month"), in step 7's progress component.
//   5. One list owns "Your next step": the Month-2 list whenever it is on the page.
//   6. Buttons keep the design-system size: the cards use the step button `.pm-act`, never a resized one.
// The behaviour on the live site is proven by the daily Month-2 walk (acceptance-walk-month2.mjs).
// exit 0 = a Monthly-cycle client can do every Month-2 step on Ongoing work · 1 = one has no home · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔑 The period must be the record's UTC month, so run where local ≠ UTC.
process.env.TZ = "America/Los_Angeles";
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);

const portal = read("portal/portal.js");
const pcode = code("portal/portal.js");
const cs = JSON.parse(read("data/playbooks/client-steps.json"));
const M2 = cs.month2plus || [];
if (M2.length < 3) { console.error(`⚠️  INDETERMINATE — only ${M2.length} Month-2 client steps in the projection`); process.exit(2); }

// ── lift the helpers and run them ──
const lift = (start, end) => { const i = portal.indexOf(start); const j = i < 0 ? -1 : portal.indexOf(end, i); return i < 0 || j < 0 ? null : portal.slice(i, j); };
const helpers = lift("const ONGOING_ORDER = [", "\nfunction isMonth2Step(");
const pm = lift("function portalReportingMonth(", "\nconst sameReportingMonth");
const wk = lift("function currentWeekLabel() {", "\n}\n");
if (!helpers || !pm || !wk) { fail("the Ongoing helpers (ONGOING_ORDER / ongoingPeriod / monthPhotosProgressHtml) are gone — Month 2 has no card order or period"); }
else {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${pm}\n${wk}\n}\n${helpers}\nthis.O = ONGOING_ORDER; this.rank = ongoingRank; this.period = ongoingPeriod; this.prog = monthPhotosProgressHtml;`, ctx);
  // 2 · every Month-2 client step has a place, the weekly job first
  for (const s of M2) if (!ctx.O.includes(s.id)) fail(`Month-2 step ${s.id} (${s.clientLabel}) is not in the approved card order — it would sort last`);
  const weekly = M2.find((s) => s.clientForm === "customer_list");
  if (weekly && ctx.O[0] !== weekly.id) fail("the weekly job is not the first card (approved: weekly first, then the monthly jobs)");
  // 3 · the period
  const edge = new Date("2026-10-31T23:30:00-07:00");           // Oct 31 in LA, Nov 1 UTC — the record's month is November
  if (ctx.period({ clientForm: "generic" }, edge) !== "November") fail(`a monthly card's period isn't the record's (UTC) month: Oct 31 11:30 PM Pacific → "${ctx.period({ clientForm: "generic" }, edge)}"`);
  if (!/^Week of /.test(ctx.period({ clientForm: "customer_list" }))) fail("the weekly card's period isn't \"Week of …\"");
  // 4 · counted progress
  const p2 = ctx.prog(2), p5 = ctx.prog(5), p0 = ctx.prog(0);
  if (!/<b>2 of 5<\/b> photos this month/.test(p2) || !/3 to go/.test(p2) || !/width:40%/.test(p2)) fail("step 15's progress doesn't read \"2 of 5 photos this month · 3 to go\" with a 40% bar");
  if (!/All there/.test(p5) || !/<b>0 of 5<\/b>/.test(p0)) fail("step 15's progress mis-states 0 or 5 photos");
  if (!/class="pm-how-prog"/.test(p2)) fail("step 15's progress isn't step 7's progress component (pm-how-prog)");
}

// ── 1 · Ongoing work is the Month-2 list after setup ──
const ow = lift("function buildOngoingWorkHtml(", "\nfunction buildCustomerListHtml") || "";
if (!/if \(!isSetupPhase && month2StepsHtml\) return `<div class="pm-og">\$\{month2StepsHtml\}<\/div>`;/.test(ow)) fail("after setup, Ongoing work isn't the Month-2 list (it drops 3 of the 4 monthly jobs)");
if (!/later\("Every month", "Your business numbers"/.test(ow)) fail("during setup, Ongoing work no longer previews the monthly jobs (\"Starts after setup\")");
if (!/buildActionItemsHtml\(client\.id \|\| row\.client_id, onboarding, monthlyRecords, oauth, contracts, photos, customerLists, \{ month2Only: true \}\)/.test(pcode)) fail("nothing builds the Month-2 list for Ongoing work");
if (!/buildOngoingWorkHtml\(\{ isSetupPhase, customerListHtml, photoUploadHtml, customerLists, month2StepsHtml \}\)/.test(pcode)) fail("Ongoing work isn't handed the Month-2 list");

// ── 2 · Setup is Month 1, and its stage 5 / 6 layouts don't repeat the two forms ──
if (!/const actionItemsHtml = buildActionItemsHtml\([^)]*\{ month1Only: true, domSuffix: "-setup" \}\);/.test(pcode)) fail("Setup still lists Month-2 steps at stage 6 (each step must have one home)");
const st5 = /if \(stage === "stage_5_monthly" \|\| stage === "stage_4_monthly"\) \{[\s\S]{0,400}?\n {2}\}/.exec(pcode)?.[0] || "";
if (!st5) fail("the stage-5 Setup layout is gone (re-read this gate)");
else if (/customerListHtml|photoUploadHtml/.test(st5)) fail("stage-5 Setup still carries the customer list / photo upload (they live in their Ongoing cards)");
const st6 = /return stageBanner \+ ctx\.actionItemsHtml \+ `<div class="portal-detail-grid">[^\n]*/.exec(pcode)?.[0] || "";
if (!st6) fail("the stage-6 Setup layout is gone (re-read this gate)");
else if (/customerListHtml|photoUploadHtml/.test(st6)) fail("stage-6 Setup still carries the customer list / photo upload");
if (!/const m1 = month2Only \? \[\] : playbook\.month1\.filter\(TODO\)/.test(pcode)) fail("the Month-2 list also draws Month-1 rows");
if (!/\.sort\(\(a, b\) => ongoingRank\(a\.id\) - ongoingRank\(b\.id\)\)/.test(pcode)) fail("the Month-2 rows aren't in the approved card order");

// ── 3 · each card is open, shows its period, holds its form ──
if (!/const expanded = month2Only \|\| step\.id === openStepId;/.test(pcode)) fail("Month-2 cards collapse like Setup's accordion (approved: each card open)");
if (!/\$\{month2Only \? `<span class="pm-step-period">\$\{escapeHtml\(ongoingPeriod\(step\)\)\}<\/span>` : ""\}/.test(pcode)) fail("a Month-2 card doesn't show its period");
if (!/: month2Only && \(step\.clientForm === "photo_upload" \|\| step\.clientForm === "customer_list"\) \? ""/.test(pcode)) fail("a Month-2 card still jumps elsewhere for its photo upload / customer list");
if (!/: month2Only && step\.clientForm === "photo_upload"\s*\? `\$\{monthPhotosProgressHtml\(photosThisMonth\)\}\$\{buildPhotoUploadHtml\(/.test(pcode)) fail("step 15's card doesn't hold the photo upload and its counted progress");
if (!/: month2Only && step\.clientForm === "customer_list" \? buildCustomerListHtml\(clientId, customerLists \|\| \[\]\)/.test(pcode)) fail("step 16's card doesn't hold the customer list");
if (!/listEl\.innerHTML = month2Only\s*\? \(numbered\.length \? numbered\.map\(rowHtml\)\.join\(""\)/.test(pcode)) fail("the Month-2 list isn't bare (no pointers, legend or group titles on Ongoing work)");

// ── 5 · one list owns the headline ──
if (!/if \(month2Only \|\| !m2ListOnPage\) _nextStepInputs = /.test(pcode)) fail("two lists on one page race for \"Your next step\" (the Month-2 list must own it)");

// ── 6 · one card, one title, the design's button size ──
const css = read("portal/portal.css");
if (!/\.pm-ongoing-ground \.pm-doit > \.portal-card \{[^}]*border: 0;[^}]*box-shadow: none;/.test(css)) fail("the photo upload / customer list draw a card inside their Ongoing card (nested cards)");
if (!/\.pm-ongoing-ground \.pm-doit > \.portal-card > \.portal-card-head \{ display: none; \}/.test(css)) fail("the form's own heading repeats the card title above it");
if (!/\.pm-step-period \{[^}]*color: var\(--portal-muted/.test(css)) fail("the period label has no quiet style");
const ongoingCss = css.slice(css.indexOf("MONTH 2 ON ONGOING WORK"));
if (/\.pm-act[^{]*\{[^}]*(min-height|padding|font-size|width)/.test(ongoingCss)) fail("the Ongoing cards resize the step button (approved: keep the design's button size)");

if (F.length) { console.error("🔴 a Monthly-cycle client can't do a Month-2 step on Ongoing work:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ Month 2 is on Ongoing work: ${M2.length} cards in the approved order (weekly first), each open with its period (UTC month), photos + customer list in their card with counted progress; Setup is Month 1 only with one home per form; the Month-2 list owns "Your next step"; the design's button size`);
