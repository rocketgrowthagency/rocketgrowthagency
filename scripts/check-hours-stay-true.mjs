#!/usr/bin/env node
// check-hours-stay-true.mjs — step 8's closed days reach Google and are read back, the owner's own special hours are kept,
// admin says what's true, and the nightly check keeps steps 8 / 10 / 11 true on Google (and renews the yearly holidays).
//
// 🔒 WHY (approved hours_stay_true_v1, 2026-10-15). Chris: "make sure that step 8 syncs with GBP and sends update to admin
// side". Found: the holidays were written but never read back or recorded; the save replaced every special day on Google
// (the owner's own too); the yearly holidays ran out after 12 months; nothing noticed a later change on Google; admin said
// "their word, not something we verified" above "verified", over an empty AI hours template. Google is FAKED; nothing
// here reaches a real profile.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const nc = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
const G = req("./_gbp-profile.js"), W = req("./_gbp-watch.js");
const { STEP } = G;

// a fake Google that keeps weekly AND special hours
function fakeGoogle({ hours, special = [], dropSpecial = false } = {}) {
  const w = { calls: [], hours, special: [...special] };
  w.fetch = async (url, init = {}) => {
    const m = init.method || "GET"; w.calls.push({ url, m, body: init.body ? JSON.parse(init.body) : null });
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (m === "PATCH") { const b = JSON.parse(init.body); if (b.regularHours) w.hours = b.regularHours; if (b.specialHours) w.special = dropSpecial ? [] : b.specialHours.specialHourPeriods; return res(200, {}); }
    return res(200, { regularHours: w.hours, specialHours: { specialHourPeriods: w.special } });
  };
  w.deps = (extra = {}) => ({ fetch: w.fetch, token: "t", loc: "locations/1", now: Date.parse("2026-10-16T12:00:00Z"), ...extra });
  return w;
}
const P = (d) => ({ openDay: d, openTime: { hours: 9 }, closeDay: d, closeTime: { hours: 18 } });
const HOURS = { periods: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(P) };
const o = { open: "09:00", close: "18:00" };
const DAYS = { mon: o, tue: o, wed: o, thu: o, fri: o, sat: { closed: true }, sun: { closed: true } };
const ANSWER = { days: DAYS, holidays: ["thanksgiving", "christmas_eve", "christmas_day"], oneOffs: [] };
const OWNER = { startDate: { year: 2027, month: 3, day: 9 }, closed: true };   // a day the owner closed in Google themselves

// ── 1 · the save: closed days written, read back, recorded; the owner's own kept ──
{
  const w = fakeGoogle({ hours: HOURS, special: [OWNER] });
  const r = await G.applyForStep(STEP.HOURS, ANSWER, w.deps());
  const sent = (r.special && r.special.sent) || [];
  if (r.state !== "on_google" || sent.map((x) => x.date).join(",") !== "2026-11-26,2026-12-24,2026-12-25") fail(`the closed days aren't sent and recorded with their dates (${r.state} ${JSON.stringify(sent)})`);
  if (!sent.every((x) => x.name && x.yearly)) fail("a recorded holiday has no name, or isn't marked yearly (the card can't say what it is / that it's renewed)");
  if (!w.special.some((p) => p.startDate.year === 2027 && p.startDate.month === 3 && p.startDate.day === 9)) fail("the save wiped a special day the owner set in Google themselves");
  if (!(r.special.kept || []).some((x) => x.date === "2027-03-09")) fail("the owner's own special day isn't recorded as kept");
  if (r.renewed_to !== "2026-12-25") fail(`renewed_to isn't the last yearly holiday on Google (${r.renewed_to})`);
  // a second save replaces OUR days (not the owner's) — no duplicates
  const r2 = await G.applyForStep(STEP.HOURS, { ...ANSWER, holidays: ["christmas_day"] }, w.deps({ prev: r }));
  const dates = w.special.map((p) => `${p.startDate.year}-${p.startDate.month}-${p.startDate.day}`).sort();
  if (r2.state !== "on_google" || dates.join(",") !== "2026-12-25,2027-3-9") fail(`a second save doesn't replace our closed days and keep the owner's (${dates.join(",")})`);
  // Google drops the closed days → not "on Google"
  const wd = fakeGoogle({ hours: HOURS, dropSpecial: true });
  const rd = await G.applyForStep(STEP.HOURS, ANSWER, wd.deps());
  if (rd.state === "on_google") fail("closed days Google didn't keep are reported as on Google (no read-back)");
  // the read the portal/watch uses includes the closed days
  const now = await G.readForStep(STEP.HOURS, w.deps());
  if (!Array.isArray(now.closed) || !now.closed.some((x) => x.date === "2026-12-25")) fail("reading Google's hours doesn't include the closed days");
}

// ── 2 · the nightly check: drift found, stamped first, told once; cleared when it matches; holidays renewed ──
{
  const task = (gp, extra = {}) => ({ status: "done", client_input: ANSWER, google_push: gp, ...extra });
  const w = fakeGoogle({ hours: HOURS });
  const gp = await G.applyForStep(STEP.HOURS, ANSWER, w.deps());
  if (W.driftOf(STEP.HOURS, task(gp), await G.readForStep(STEP.HOURS, w.deps()), Date.parse("2026-10-16T12:00:00Z"))) fail("hours that match are reported as changed");
  w.hours = { periods: [...HOURS.periods, { openDay: "SATURDAY", openTime: { hours: 10 }, closeDay: "SATURDAY", closeTime: { hours: 14 } }] };
  const dr = W.driftOf(STEP.HOURS, task(gp), await G.readForStep(STEP.HOURS, w.deps()), Date.parse("2026-10-16T12:00:00Z"));
  if (!dr || dr.what !== "weekly hours") fail("a Saturday opened on Google isn't noticed");
  if (!W.driftOf(STEP.BOOKING, { client_input: "https://a.test/book", google_push: { state: "on_google" } }, { links: ["https://b.test"] })) fail("a different booking link on Google isn't noticed");
  if (W.driftOf(STEP.BOOKING, { client_input: { none: true }, google_push: { state: "not_sent" } }, { links: [] })) fail("\"we don't take bookings online\" is reported as changed");
  if (!W.driftOf(STEP.ATTRS, { client_input: ["a"], google_push: { state: "on_google" } }, { options: [{ key: "a" }, { key: "b" }], ticked: ["a", "b"] })) fail("a detail ticked on Google but not by the client isn't noticed");
  // watchClient: stamp first, tell once, second night quiet
  let store = { r: { id: "r1", tasks: { [STEP.HOURS]: task(gp) } } }, told = 0;
  const d = { supa: null, fetch: w.fetch, now: () => Date.parse("2026-10-16T12:00:00Z"), connect: async () => ({ token: "t", loc: "locations/1" }),
    readStepRecord: async () => ({ id: "r1", tasks: JSON.parse(JSON.stringify(store.r.tasks)) }),
    writeStepTasks: async (_s, _r, t) => { store.r.tasks = t; return { tasks: t }; }, notifyRga: async () => { told++; } };
  const o1 = await W.watchClient("c1", d);
  if (!o1.drift.includes(STEP.HOURS) || !store.r.tasks[STEP.HOURS].google_drift || told !== 1) fail(`a change on Google isn't stamped and told to RGA once (${JSON.stringify(o1)} told ${told})`);
  await W.watchClient("c1", d);
  if (told !== 1) fail("RGA is told about the same change twice");
  w.hours = HOURS;
  const o3 = await W.watchClient("c1", d);
  if (!o3.cleared.includes(STEP.HOURS) || store.r.tasks[STEP.HOURS].google_drift) fail("a change that's gone stays flagged");
  // renewal: the last yearly holiday less than ~11 months away → re-written
  if (!W.needsRenewal(task({ ...gp, renewed_to: "2026-12-25" }), Date.parse("2026-10-16T12:00:00Z"))) fail("yearly holidays two months from running out aren't renewed");
  if (W.needsRenewal(task({ ...gp, renewed_to: "2027-10-01" }), Date.parse("2026-10-16T12:00:00Z"))) fail("holidays a year ahead are renewed again (a write every night)");
  if (W.needsRenewal({ status: "done", client_input: { days: DAYS, holidays: [] }, google_push: gp })) fail("a client with no holidays is renewed");
}

// ── 3 · wiring: the save passes what we sent before; the nightly runs; admin decides ──
const sin = nc(read("netlify/functions/portal-step-input.js"));
if (!/applyForStep\(stepId, parsed\.value, \{ fetch, token: conn\.token, loc: conn\.loc, prev: prev\.google_push \|\| null(?:, draft: servicesDraft)? \}\)/.test(sin)) fail("the save doesn't pass what we sent last time (the owner's own closed days would be wiped)");
if (!/\[functions\."gbp-profile-watch"\]\s*\n\s*schedule = "30 10 \* \* \*"/.test(read("netlify.toml"))) fail("the nightly check has no schedule");
const drift = nc(read("netlify/functions/admin-gbp-drift.js"));
if (!/const gate = await requireWorkspaceForClient\(event, clientId\); if \(gate\.error\) return gate\.error;/.test(drift) || !/if \(!task \|\| !task\.google_drift\) return json\(409/.test(drift)) fail("admin's restore/accept isn't RGA-only, or acts with nothing changed");

// ── 4 · the client sees what Google holds; admin says what's true ──
const portal = nc(read("portal/portal.js"));
if (!/<span class="gcard-says">Closed on Google: \$\{escapeHtml\(g\.special\.sent\.map\(/.test(portal) || !/ · we renew these every year/.test(portal)) fail("the client's step 8 card doesn't list the closed days Google holds");
const admin = nc(read("admin/admin.js"));
if (!/byClient && gp && gp\.state === "on_google"\s*\? `<p class="ob-attested is-ok">Saved by the client/.test(admin) || !/<b>verified on Google<\/b>/.test(admin)) fail("admin still calls a Google-verified answer \"their word, not something we verified\"");
if (!/if \(o && o\.clientInput && task && task\.client_input !== undefined\) return stepRunHistoryHtml\(o\.flowId\);/.test(admin)) fail("a step the client answers in the portal still shows an old AI draft");
if (!/<b>Closed on Google:<\/b>/.test(admin) || !/<b>Their own Google special hours kept:<\/b>/.test(admin)) fail("admin doesn't show the closed days on Google / the owner's kept days");
if (!/\$\{gHtml\}\$\{driftHtml\(task, spec\)\}/.test(admin) || !/<b>After \(read back[^<]*\):<\/b> \$\{escapeHtml\(show\(g\.after\)\)\}<\/span>\$\{specialHtml\}`/.test(admin) || !/data-drift="restore"/.test(admin) || !/data-drift="accept"/.test(admin)) fail("admin doesn't show a change on Google with Put back / Keep Google's");
if (!/const driftStep = Object\.keys\(GBP_DRIFT_STEPS\)\.find\(\(k\) => state\.onboardingData\?\.tasks\?\.\[k\]\?\.google_drift\);\s*if \(driftStep\) \{\s*return \{\s*title: `\$\{GBP_DRIFT_STEPS\[driftStep\]\} on Google changed`/.test(admin)) fail("a change on Google isn't RGA's Your action");

if (F.length) { console.error("🔴 Step 8 / 10 / 11 don't stay true on Google the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ hours stay true: closed days written, read back and recorded with names (the owner's own kept, ours replaced, none duplicated); the client's card lists them; admin says \"verified on Google\" with closed days, no stale AI draft; the nightly check notices changes on steps 8/10/11 (stamped first, RGA told once, cleared when gone) and renews the yearly holidays; RGA puts back or keeps Google's");
