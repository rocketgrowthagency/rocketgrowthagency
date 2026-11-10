#!/usr/bin/env node
// check-setup-vs-month1.mjs: SETUP IS "GETTING STARTED" (3 STEPS); MONTH 1 WORK IS THE FIRST MONTH CARD (approved setup_vs_month1_v1, Chris 11-10).
//
// HOLDS, for a MANAGED client (the self-serve 21-step portal is KEPT unchanged and is checked for parity):
//   1  Setup = Getting started 1 to 3 (kickoff, website access, Google details); each can be skipped with a reason and Undo; a skip says what waits and keeps a way back;
//      "Setup complete" = all 3 done or skipped, and NOTHING else (never RGA's own tasks, never m2.* leftovers in the Month 1 record).
//   2  BUG 1: the "Locked: complete Step 4 to unlock" card depends only on those 3 steps, and never shows after Getting started or after the hand-off.
//   3  Month 1 work (review asks, photos, 2 videos, call tracking) is OPTIONAL and lives in the Month 1 card; the close-out call is under End of Month 1, never in Setup;
//      review asks are never required (To do never lists them as the client's move).
//   4  First-review wording: while Google shows 0 reviews: "Get your first reviews", "0 so far", "your first ones come from your customer list", never "more reviews".
//   5  BUG 2: RGA's channel setup is RGA's work; the client's videos count only on THEIR channel (read from YouTube); an unread count says "couldn't read", never 0.
//   6  Call tracking is a choice (yes / no / unanswered); the choice only records the answer; nothing is provisioned from the portal.
//   7  Numbering: Getting started 1 to 3; Month 1 work has no number; admin's playbook numbers do not move; self-serve numbering is unchanged.
//   8  BUG 3: every unanswered client question (business answers, Ask RGA messages) is an RGA To do row with its age, late after 2 business days (counted in the client's own week);
//      the client never sees these as their own moves; a reply removes the row.
//   9  The browser: the real portal (scripts/lib/portal-boot-harness.mjs) DRAWS each of the above for invented clients (no website, details matching Google, no kickoff call,
//      every step skipped, 0 reviews / some, unread / 0 / 2 YouTube videos, call tracking unanswered, self-serve parity).
// PROVES ITSELF: it MUST FAIL on the website as it was before this build (--against=<rev>, default 7f615889, the main it branched from). That "LIVE_BEFORE" run fails or this gate
// exits 2 INDETERMINATE. Exit 0 holds · 1 something is wrong · 2 can't tell (no browser, no git, the before state didn't fail).
//   node scripts/check-setup-vs-month1.mjs [--against=<rev>] [--no-browser] [--no-before]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { HarnessUnavailable } from "./lib/portal-boot-harness.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const argv = process.argv.slice(2);
const AGAINST = (argv.find((a) => a.startsWith("--against=")) || "").slice(10) || null;
const BEFORE_REV = "7f615889";
const NO_BROWSER = argv.includes("--no-browser"), NO_BEFORE = argv.includes("--no-before");
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

/** Export a git revision of the website into a temp folder (only what the gate reads), so the "before" state is checked with the same code as "after". */
function exportRev(rev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svm1-"));
  try {
    const tar = execFileSync("git", ["-C", SITE, "archive", rev, "shared", "netlify/functions", "data", "portal", "admin", "package.json"], { maxBuffer: 512 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar });
  } catch (e) { console.error(`⚠️  INDETERMINATE: can't read revision ${rev} of the website (${String(e.message).slice(0, 100)})`); process.exit(2); }
  // netlify/functions requires its dependencies from the site's node_modules: link them
  try { fs.symlinkSync(path.join(SITE, "node_modules"), path.join(dir, "node_modules")); } catch { /* optional */ }
  return dir;
}

/** All the static + pure checks for one website folder. Returns the list of failures. */
function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`);
  const rd = (p) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return null; } };
  const req = createRequire(path.join(root, "x.js"));
  const portal = rd("portal/portal.js") || "", modeSrc = rd("shared/portal-mode.js") || "", stepChoice = rd("netlify/functions/portal-step-choice.js") || "";
  const play = JSON.parse(rd("data/playbooks/playbooks.json") || "{}");
  let SS = null, PM = null, OM = null, CM = null;
  try { SS = req(path.join(root, "shared/setup-split.js")); } catch { /* absent in the before state */ }
  try { PM = req(path.join(root, "shared/portal-mode.js")); } catch (e) { fail(`shared/portal-mode.js won't load: ${String(e.message).slice(0, 80)}`); }
  try { OM = req(path.join(root, "netlify/functions/_open-moves.js")); } catch (e) { fail(`_open-moves.js won't load: ${String(e.message).slice(0, 80)}`); }
  try { CM = req(path.join(root, "shared/client-monthly.js")); } catch { /* optional */ }

  // ── 2 · BUG 1: the Locked card ──
  if (/const step4TrulyDone = onboardingTasks\.length > 0 && onboardingTasks\.every/.test(portal)) fail("the Locked card still waits on EVERY onboarding task (step4TrulyDone), RGA's own and the Month 2 leftovers included");
  if (!/function setupSettled\(onboarding, website\)/.test(portal) || !/pmManaged\(\) && globalThis\.rgaSetupSplit\) return globalThis\.rgaSetupSplit\.gettingStarted/.test(portal)) fail("portal.js has no Getting-started-only 'setup settled' rule for a managed client");
  const lockFn = (portal.match(/function buildServicePhaseLockedGated\(\) \{[\s\S]*?\n\}/) || [""])[0];
  const mgdLock = lockFn.split("return `")[0] + (lockFn.match(/if \(pmManaged\(\)\) return `[\s\S]*?`;/) || [""])[0];
  if (!/if \(pmManaged\(\)\) return `/.test(lockFn) || /Step 4/.test((lockFn.match(/if \(pmManaged\(\)\) return `[\s\S]*?`;/) || [""])[0])) fail("a managed client's locked card still names 'Step 4' (managed has no such step)");
  void mgdLock;
  if (/domSuffix: "-setup"/.test(portal)) fail("the orphaned '-setup' list (it drew into no element but fetched waits, moves and the thread on every load) is still produced");

  // ── 3 · what is in Setup, what is not ──
  if (!/numbered = numbered\.filter\(\(r\) => \(group === "gs"\) === !!isGs\(r\)\)/.test(portal)) fail("a managed Setup list is not filtered to Getting started (the Month 1 work rows still draw in Setup)");
  const isGs = (portal.match(/const isGs = \(r\) => [^\n]*/) || [""])[0];
  if (!isGs || /CLOSE|call\.close|PHOTOS|REVIEWS|VIDEOS/.test(isGs)) fail("Getting started must hold only the kickoff, website access and the Google details check (the close-out call, photos, reviews and videos are not Setup)");
  if (!/step = \{ \.\.\.r\.step, clientOptional: true, m1w: true \}/.test(portal)) fail("Month 1 work rows are not optional (review asks would still be required)");
  if (!/Month 1 work \(review asks, photos, videos, the Month 1 review\) is optional/.test(rd("netlify/functions/_open-moves.js") || "")) fail("To do still lists Month 1 work as the client's move (only Getting started blocks)");
  if (!/End of Month 1/.test(portal) || !/draw\(SPL\.CLOSE\)/.test(portal)) fail("the close-out call is not under End of Month 1 in the Month 1 card");

  // ── 5 · BUG 2: the videos ──
  if (!/status = vm\.client\.state === "done" \? "done" : "pending"/.test(portal)) fail("the videos row can still read Done because RGA set up the channel (it must read the client's own channel)");
  if (!/portal-youtube-count/.test(portal) || !fs.existsSync(path.join(root, "netlify/functions/portal-youtube-count.js"))) fail("no YouTube read of the client's own channel");

  // ── 7 · numbering (parity + the new rule) ──
  if (PM) {
    const M1 = play.month1 || [];
    for (const s of M1) for (const mode of [null, undefined, "self_serve", "bogus"]) {
      const want = s.clientStepNo == null ? null : Number(s.clientStepNo);
      if (PM.stepNo(s, mode) !== want) fail(`self-serve parity: ${s.id} reads ${PM.stepNo(s, mode)} for mode ${JSON.stringify(mode)}, the playbook says ${want}`);
    }
    const num = (id) => PM.stepNo(M1.find((x) => x.id === id), "managed");
    if (num("m1.kickoff.call") !== 1 || num("m1.access.website") !== 2) fail("Getting started is not numbered 1, 2 (kickoff, website access)");
    if (["m1.gbp.photos", "m1.review.first_5", "m1.brand.youtube_setup", "m1.call.close"].some((id) => num(id) !== null)) fail("Month 1 work still has a step number in a managed portal (month cards have none)");
    const steps = M1.filter((s) => s.managedRole === "step" && s.managedStepNo != null).map((s) => s.managedStepNo).sort();
    if (steps.join() !== "1,2,4,5,6,7") fail(`admin numbering moved: the playbook managed steps are ${steps.join()}, they must stay 1,2,4,5,6,7 (3 is the check step in managed-steps.json)`);
  }
  if (!SS) { fail("shared/setup-split.js does not exist"); return F; }

  // ── pure fixtures: Getting started ──
  const covers = SS.CHECK_COVERS, T = (over = {}) => ({ ...Object.fromEntries(covers.map((id) => [id, { status: "done" }])), "m1.kickoff.call": { status: "done" }, "m1.access.website": { status: "done" }, ...over });
  const gs = (tasks, extra = {}) => SS.gettingStarted({ tasks, kickoffInvite: extra.invite, ...(extra.noSite ? { website: "" } : { website: "https://acme.example" }) });
  const RGA_LEFTOVERS = { "m1.gbp.qa_seed": { status: "in_progress" }, "m2.exec.gbp_photos": { status: "pending" }, "m2.exec.review_push": { status: "pending" }, "m1.report.month1": { status: "pending" } };
  if (!gs({ ...T(), ...RGA_LEFTOVERS }).complete) fail("Setup is not complete when the 3 steps are done but RGA's own tasks (m1.gbp.qa_seed in progress, m2.* pending) are open");
  if (SS.lockedCardShows(gs({ ...T(), ...RGA_LEFTOVERS }), false)) fail("the Locked card shows for a client whose 3 Getting started steps are done (RGA's tasks and m2.* leftovers must never count)");
  if (!SS.lockedCardShows(gs(T({ "m1.access.website": { status: "pending" } })), false)) fail("the Locked card does not show while a Getting started step is open");
  if (SS.lockedCardShows(gs(T({ "m1.access.website": { status: "pending" } })), true)) fail("the Locked card shows after the hand-off");
  const noSite = gs(T({ "m1.access.website": { status: "pending" } }), { noSite: true });
  if (noSite.rows[1].state !== "settled" || !noSite.complete) fail("a client with NO website: the website step does not settle by itself");
  const matching = gs({ "m1.kickoff.call": { status: "done" }, "m1.access.website": { status: "done" }, ...Object.fromEntries(covers.map((id) => [id, { status: "done" }])) });
  if (matching.rows[2].state !== "done") fail("details already matching Google (every check row done) do not settle step 3");
  const formPath = gs(T({ "m1.kickoff.call": { status: "skipped", skipped_by: "client", skip_reason: "no time" } }));
  if (formPath.rows[0].state !== "skipped" || !/short form/.test(formPath.rows[0].waits) || !formPath.complete) fail("no kickoff call (the form path): a skipped kickoff does not say the questions come as a short form, or blocks Setup complete");
  const allSkipped = gs({ "m1.kickoff.call": { status: "skipped", skipped_by: "client" }, "m1.access.website": { status: "skipped", skipped_by: "client" }, ...Object.fromEntries(covers.map((id) => [id, { status: "skipped", skipped_by: "client" }])) });
  if (!allSkipped.complete || allSkipped.rows.some((r) => r.state !== "skipped" || !r.waits || !r.back) || SS.whatWaits(allSkipped).length !== 3) fail("every Getting started step skipped: Setup is not complete, or a skip does not say what waits and offer a way back");
  if (!/Give access/.test(allSkipped.rows[1].back)) fail("a skipped website step has no 'Give access' way back");
  if (gs({}).complete || gs({}).done !== 0) fail("nothing done reads as complete");
  if (SS.GETTING_STARTED.includes("m1.call.close")) fail("the close-out call is in Getting started");

  // ── 4 · review asks ──
  const r0 = SS.reviewsWords({ reviews: { state: "ok", count: 0 }, asked: 0 }), r4 = SS.reviewsWords({ reviews: { state: "ok", count: 4 }, asked: 2 }), ru = SS.reviewsWords({ reviews: { state: "unread", count: null }, asked: 0 });
  if (r0.title !== "Get your first reviews" || !/0 so far/.test(r0.status) || !/your first ones come from your customer list/.test(r0.status)) fail(`0 reviews on Google: the card reads "${r0.title} · ${r0.status}"`);
  if (/more reviews/i.test(JSON.stringify(r0))) fail("0 reviews on Google: the card says 'more reviews'");
  if (r4.first || !/4 reviews on Google so far/.test(r4.status) || /first reviews/i.test(r4.title)) fail(`some reviews: the card reads "${r4.title} · ${r4.status}"`);
  if (ru.first || /\b0\b/.test(ru.status) || !/couldn't read/.test(ru.status)) fail(`an unread review count reads "${ru.status}" (it must say it couldn't read, never 0)`);
  if (SS.reviewsWords({ reviews: { state: "ok", count: 3 }, noJobs: true }).state !== "no_jobs" || SS.reviewsWords({ reviews: { state: "ok", count: 3 }, notNow: true }).state !== "not_now") fail("'No jobs yet' / 'Not now' do not settle the review asks");
  if (!/Skip this week/.test(SS.weeklyListWords({ state: "ok", count: 0 }).skippable) || !SS.weeklyListWords({ state: "ok", count: 0 }).first || SS.weeklyListWords({ state: "ok", count: 2 }).first || SS.weeklyListWords({ state: "unread", count: null }).first) fail("the weekly list's first-review wording does not switch with Google's count");

  // ── 5 · videos ──
  const setupDone = { status: "done", completed_by: "rga" };
  const v0 = SS.videosModel({ setup: setupDone, yt: { state: "ok", count: 0 } }), vU = SS.videosModel({ setup: setupDone, yt: { state: "cant" } }), v2 = SS.videosModel({ setup: setupDone, yt: { state: "ok", count: 2 } }), vN = SS.videosModel({ setup: setupDone, yt: { state: "none" } });
  if (v0.client.state === "done" || v0.rga.state !== "ok") fail("RGA set up the channel and 0 videos are on it: the client's videos read Done");
  if (vU.client.state !== "unread" || vU.client.count !== null || !/couldn't read/.test(vU.client.small + vU.client.side) || /\b0 on your channel/.test(vU.client.small)) fail("an unreadable YouTube channel does not say 'couldn't read' (or reads 0)");
  if (v2.client.state !== "done") fail("2 videos on the client's channel do not count");
  if (vN.client.state === "done" || vN.client.count !== null) fail("no YouTube channel counts as videos");
  if (SS.videosModel({ setup: { status: "pending" }, yt: { state: "ok", count: 0 } }).rga.state === "ok") fail("RGA's channel setup shows done before it is");

  // ── 6 · call tracking ──
  const c0 = SS.callChoice({}), cy = SS.callChoice({ client_choice: "rga_sets_up", status: "in_progress" }), cn = SS.callChoice({ client_choice: "skip", status: "done" });
  if (c0.state !== "unanswered" || cy.state !== "yes" || !cy.rgaMove || cn.state !== "no" || cn.rgaMove || !/Google call taps only/.test(cn.small) || !/lead test is skipped/.test(cn.small)) fail("the call-tracking choice does not read back as unanswered / yes (RGA's move) / no (call taps only, lead test skipped)");
  if (!/Google listing keeps your own number/.test(cy.small)) fail("the call-tracking answer does not say Google keeps the business's own number");
  if (/provision/i.test(portal.slice(portal.indexOf("function splitCallChoiceHtml"), portal.indexOf("function splitCallChoiceHtml") + 3000))) fail("the call-tracking choice card provisions something");

  // ── 7 · the skip endpoint ──
  if (!/body\.skip_setup === true \|\| body\.unskip_setup === true \|\| body\.video_choice !== undefined/.test(stepChoice) || !/isManaged\(await require\("\.\/_portal-mode"\)\.clientMode/.test(stepChoice.slice(stepChoice.indexOf("skip_setup"), stepChoice.indexOf("skip_setup") + 1500))) fail("portal-step-choice has no managed-only skip / undo for the Getting started and Month 1 steps");
  if (!/skip_reason: reason/.test(stepChoice) || !/skip_prev/.test(stepChoice)) fail("a client's skip keeps no reason or no way back");

  // ── 8 · BUG 3: the questions in To do ──
  if (OM) {
    const DAYMS = 86400000, now = "2026-11-09T15:00:00Z";
    const ask = { id: "geography_model-1", key: "geography_model", message: "Does an old licence still count?", at: "2026-09-15T15:00:00Z", reply: null };
    const run = (o) => OM.openMoves({ playbooks: play, data: { tasks: {} }, now, mode: "managed", ...o });
    const q = run({ asks: [ask] }).filter((m) => m.kind === "client_question");
    if (q.length !== 1 || q[0].owner !== "rga" || !q[0].late || q[0].age_days !== 55) fail(`the Sep 15 question is not a late RGA To do row of 55 days (got ${JSON.stringify(q.map((m) => ({ o: m.owner, late: m.late, age: m.age_days })))})`);
    else if (!/old licence/.test(q[0].quote || "")) fail("the To do row does not show the question");
    if (run({ asks: [{ ...ask, reply: { text: "yes", at: "2026-09-16T10:00:00Z" } }] }).some((m) => m.kind === "client_question")) fail("an answered question is still in To do");
    const fresh = run({ asks: [{ ...ask, at: "2026-11-09T09:00:00Z" }] }).find((m) => m.kind === "client_question");
    if (!fresh || fresh.late) fail("a question asked this morning is already late");
    // 2 business days, counted in the client's own week: Friday 8 PM Eastern is Saturday in UTC
    const fri = { ...ask, at: "2026-11-06T20:00:00-05:00" };
    const et = OM.openMoves({ playbooks: play, data: { tasks: {} }, now: "2026-11-10T13:00:00Z", mode: "managed", asks: [fri], tz: "America/New_York" }).find((m) => m.kind === "client_question");
    const utc = OM.openMoves({ playbooks: play, data: { tasks: {} }, now: "2026-11-10T13:00:00Z", mode: "managed", asks: [fri] }).find((m) => m.kind === "client_question");
    if (!et || et.late) fail("Eastern-time client: a question asked Friday evening is already late on Tuesday morning (the weekend started the clock)");
    if (utc && !utc.late && et && et.due === utc.due) void 0;
    const msg = run({ messages: [{ id: "_general", where: "Ask RGA", answered: false, since: "2026-11-02T15:00:00Z", preview: "Can you move my call?" }] }).find((m) => m.kind === "client_message");
    if (!msg || msg.owner !== "rga" || !msg.late) fail("an unanswered Ask RGA message is not a late RGA To do row");
    if (run({ messages: [{ id: "_general", answered: true, since: null, preview: "x" }] }).some((m) => m.kind === "client_message")) fail("an answered message is still in To do");
    const cm = OM.clientMoves(run({ asks: [ask] }), play);
    if (cm.some((m) => /^ask:|^msg:/.test(m.step_id || ""))) fail("a client's question shows up as the client's own move");
    // only Getting started blocks: Month 1 work is never the client's To do move; self-serve is unchanged
    const doneGs = Object.fromEntries([...SS.GETTING_STARTED].map((id) => [id, { status: "done", completed_at: "2026-10-09T15:00:00Z" }]));
    const month1Open = { ...doneGs, "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T15:00:00Z" } };
    const mgdMoves = OM.openMoves({ playbooks: play, data: { tasks: month1Open, kickoff_invite: { status: "held" } }, now, mode: "managed" }).filter((m) => m.owner === "client").map((m) => m.step_id);
    const ssMoves = OM.openMoves({ playbooks: play, data: { tasks: month1Open, kickoff_invite: { status: "held" } }, now, mode: "self_serve" }).filter((m) => m.owner === "client").map((m) => m.step_id);
    if (mgdMoves.some((id) => SS.MONTH1_WORK.includes(id))) fail(`To do lists Month 1 work as the client's move: ${mgdMoves.filter((id) => SS.MONTH1_WORK.includes(id)).join(", ")}`);
    if (!ssMoves.some((id) => SS.MONTH1_WORK.includes(id))) fail("self-serve parity: Month 1 work stopped being the client's To do move in the self-serve portal");
    const sk = OM.openMoves({ playbooks: play, data: { tasks: { ...month1Open, "m1.access.website": { status: "skipped", skipped_by: "client", skip_reason: "not ready", skipped_at: "2026-10-20T15:00:00Z" } }, kickoff_invite: { status: "held" } }, now, mode: "managed" }).find((m) => m.kind === "client_skipped");
    if (!sk || !/Waiting/.test(sk.what) || sk.late) fail("a skipped Getting started step does not list what is waiting in To do (or is chased as late)");
    const prog = OM.month1Progress(play.month1, month1Open, "managed", { id: "managed.check_found", covers: SS.CHECK_COVERS, managedStepNo: 3 });
    if (prog.total !== 3) fail(`To do's Month 1 progress counts ${prog.total} steps, Getting started is 3`);
  }
  // ── 7 · Monthly 2+ carries every Month 1 item ──
  const m2ids = new Set((play.month2plus || []).map((s) => s.id));
  for (const id of [SS.REVIEWS, SS.PHOTOS, SS.VIDEOS, SS.CLOSE]) if (!SS.carriesTo(id).id || !m2ids.has(SS.carriesTo(id).id) || !SS.carriesTo(id).words) fail(`${id} has no Monthly version`);
  if (CM) {
    const cur = { number: 3, month: "2027-01-01", monthName: "January" };
    const card = CM.monthCard({ cur, nowMs: Date.parse("2027-01-12T12:00:00Z"), record: { data: { tasks: {} } }, postsWanted: 2, callTracking: true, listOpen: true, nextMonthName: "February" });
    const kinds = card.your.rows.map((r) => r.kind);
    if (!kinds.includes("customers") || !kinds.includes("photos") || !card.quarter || !card.quarter.rows.some((r) => r.kind === "video") || !card.end.some((r) => r.kind === "call")) fail("Month 3 (a quarter): the month card lacks the weekly list, photos, the quarterly video or the monthly call");
  }
  // ── the new client words carry no em dash ──
  const words = JSON.stringify([r0, r4, ru, v0, vU, c0, cy, cn, allSkipped, noSite, SS.weeklyListWords({ state: "ok", count: 0 }), SS.endOfMonth1({ tasks: {} })]);
  if (/—/.test(words)) fail("an em dash in the new client wording");
  return F;
}

// ── the browser: the real portal draws it ──────────────────────────────────────────────────────────
async function checkBrowser(root, label) {
  const { bootPortal } = await import("./lib/portal-boot-harness.mjs");
  const { SCENARIOS, RGA_CARD_TASKS } = await import("./lib/managed-portal-scenarios.mjs");
  const F = [], fail = (m) => F.push(`${label}: ${m}`);
  const KICKOFF = "2026-10-09T16:11:50Z", CLOCK = "2026-11-04T15:00:00Z";
  const REV = (count) => ({ ok: true, scope: "reviews", feed: { reviews: [], count, rating: null, new_30d: 0, gap_days: null, checked_at: "2026-11-04T11:00:00Z", stale: false }, google: { status: "ok" } });
  const base = (over = {}) => ({ ...SCENARIOS.allDone.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" },
    "m1.brand.youtube_setup": { status: "done", completed_at: "2026-11-02T12:00:00Z", completed_by: "rga" },
    "m1.gbp.qa_seed": { status: "in_progress" }, "m2.exec.gbp_photos": { status: "pending" }, "m2.exec.review_push": { status: "pending" },
    "m1.tracking.call_setup": { status: "pending" }, "m1.gbp.photos": { status: "pending" }, "m1.review.first_5": { status: "pending" }, ...over });
  async function draw(mode, { tasks = base(), stage = "stage_4_onboarding", website, reviews = 0, yt = { ok: true, state: "cant", count: null }, clock = CLOCK, tables = {} } = {}) {
    const h = await bootPortal({ mode, stage, clock, tasks, website, tables, fns: {
      "portal-review-requests": (b) => (b && b.scope === "reviews" ? REV(reviews) : { ok: true, requests: [], has_review_link: true }),
      "portal-youtube-count": () => yt, "portal-open-moves": () => ({ ok: true, moves: [], month1: { done: 0, total: 0 }, rga_work: { done: 31, total: 36 } }) } }, {}, root);
    await h.page.goto(`${h.base}/portal/`, { waitUntil: "domcontentloaded" });
    try { await h.ready("[id^='action-items-list-'] .pm-step-row", 30000); }
    catch {
      // the before state has no Month 1 list in the service phase: that is the finding, not a broken harness
      if (label.startsWith("before")) { F.push(`${label}: nothing is drawn for a ${stage} client (no Setup list, no Month 1 card)`); return { setup: "", ongoing: "", h, pillOf: async () => null }; }
      await h.close(); throw new HarnessUnavailable(`the portal never drew its list (${h.errs[0] || "no error"})`);
    }
    await tick(2500);
    const read = async (v) => { await h.page.evaluate((x) => document.querySelector(`.portal-nav a[data-view=${x}]`)?.click(), v); await tick(500); return h.page.evaluate((x) => document.querySelector(`.pv-${x}`)?.innerText || "", v); };
    const out = { setup: await read("setup"), ongoing: await read("ongoing"), h };
    out.pillOf = (title) => h.page.evaluate((t) => { const row = [...document.querySelectorAll(".pm-step-row")].find((r) => (r.querySelector(".pm-step-title") || {}).textContent?.trim() === t); return row ? [...row.querySelectorAll(".pm-pill")].map((p) => p.textContent.trim()) : null; }, title);
    return out;
  }
  const done = async (p) => { await p.h.close(); };
  // A · Month 1, 0 reviews, the YouTube read fails, call tracking unanswered, RGA's leftovers present, in the service phase (where the Locked card used to show)
  const LOCKED = /complete Step 4|Locked\s*[:\u2014-]|Service phase dashboard|Finish Getting started to unlock/i;
  let p = await draw("managed", { stage: "stage_5_monthly" });
  if (LOCKED.test(p.setup + p.ongoing)) fail("the Locked card still draws for a managed client whose Getting started is done (service phase, RGA's leftovers in the record)");
  if (!/Setup complete/.test(p.setup)) fail("the service phase does not say Setup is complete");
  await done(p);
  p = await draw("managed");
  if (LOCKED.test(p.setup + p.ongoing)) fail("the Locked card draws in Setup for a managed client whose Getting started is done");
  if (!/GETTING STARTED/i.test(p.setup) || !/Setup complete/.test(p.setup) || !/3 of 3|Setup complete/.test(p.setup)) fail("Setup does not show Getting started complete");
  if (/close-out|Month 1 review/i.test(p.setup)) fail("the close-out call is in Setup");
  if (/Provide 20\+ business photos|Ask your 5 most recent/.test(p.setup)) fail("Month 1 work rows are in Setup");
  for (const w of ["MONTH 1", "YOUR PART THIS MONTH", "RGA'S WORK THIS MONTH", "END OF MONTH 1"]) if (!p.ongoing.toUpperCase().includes(w)) fail(`the Month 1 card lacks "${w}"`);
  if (!/Get your first reviews/.test(p.ongoing) || !/0 so far/.test(p.ongoing) || /more reviews/i.test(p.ongoing)) fail("0 reviews on Google: the Month 1 card does not read 'Get your first reviews · 0 so far'");
  const vp = await p.pillOf("Record 2 short videos");
  if (!vp || vp.includes("Done")) fail(`'Record 2 short videos' is Done because RGA set up the channel (pills: ${JSON.stringify(vp)})`);
  if (!/couldn't read your channel/.test(p.ongoing)) fail("an unreadable YouTube channel does not say 'couldn't read'");
  if (!/Your YouTube channel/.test(p.ongoing)) fail("RGA's channel setup is not under RGA's work");
  if (!/Track calls from your website\?/.test(p.ongoing) || !/Yes, track calls/.test(p.ongoing) || !/No thanks/.test(p.ongoing)) fail("call tracking is not an optional choice card (Yes, track calls / No thanks)");
  if (!/End of Month 1[\s\S]*Month 1 review/i.test(p.ongoing)) fail("the close-out call is not under End of Month 1");
  if (!/Not now/.test(p.ongoing) || !/No jobs yet/.test(p.ongoing)) fail("the review asks have no 'Not now' / 'No jobs yet'");
  await done(p);
  // B · every step skipped
  p = await draw("managed", { tasks: base({ "m1.kickoff.call": { status: "skipped", skipped_by: "client", skip_reason: "no time", skipped_at: KICKOFF, skip_prev: { status: "pending" } }, "m1.access.website": { status: "skipped", skipped_by: "client", skip_reason: "not ready", skipped_at: KICKOFF, skip_prev: { status: "pending" } },
    ...Object.fromEntries(["m1.gbp.verify", "m1.gbp.business_facts", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"].map((id) => [id, { status: "skipped", skipped_by: "client", skip_reason: "later", skipped_at: KICKOFF, skip_prev: { status: "pending" } }])) }) });
  if (!/Setup complete/.test(p.setup) || !/2 skipped|3 skipped/.test(p.setup)) fail("every Getting started step skipped: Setup does not read complete with the skips");
  if (!/Give access/.test(p.setup) || !/website steps wait/i.test(p.setup)) fail("a skipped website step does not say what waits and offer 'Give access'");
  if (LOCKED.test(p.setup)) fail("Locked draws with every step skipped");
  await done(p);
  // C · some reviews + 2 videos on the client's channel
  p = await draw("managed", { reviews: 3, yt: { ok: true, state: "ok", count: 2 } });
  if (/Get your first reviews/.test(p.ongoing) || !/3 reviews on Google so far/.test(p.ongoing)) fail("some reviews on Google: the card still reads first-review wording or lacks the count");
  const vp2 = await p.pillOf("Record 2 short videos");
  if (!vp2 || !vp2.includes("Done")) fail(`2 videos on the client's channel do not read Done (pills: ${JSON.stringify(vp2)})`);
  await done(p);
  // D · a YouTube read that succeeds and finds 0
  p = await draw("managed", { yt: { ok: true, state: "ok", count: 0 } });
  const vp0 = await p.pillOf("Record 2 short videos");
  if (!vp0 || vp0.includes("Done") || !/0 on your channel so far/.test(p.ongoing)) fail("a successful YouTube read of 0 does not read '0 on your channel so far' and not Done");
  await done(p);
  // E · no website
  p = await draw("managed", { website: "", tasks: base({ "m1.access.website": { status: "pending" } }) });
  if (!/No website on file|nothing to give access to/i.test(p.setup) || !/Setup complete/.test(p.setup)) fail("no website: the website step does not settle by itself");
  await done(p);
  // G · between months (Month 1 done Nov 9, Month 2 starts Dec 1): Month 1 stays readable as a past month
  const sent = { "m1.report.month1": { status: "done", completed_at: "2026-11-09T15:00:00Z", auto_result: { sent_message_id: "m1", sent_at: "2026-11-09T15:00:00Z" } } };
  p = await draw("managed", { stage: "stage_5_monthly", clock: "2026-11-12T15:00:00Z", tasks: base({ ...sent, "m1.review.first_5": { status: "skipped", skipped_by: "client", no_jobs: true, skip_reason: "No jobs yet" }, "m1.gbp.photos": { status: "skipped", skipped_by: "client", skip_reason: "later" } }) });
  const past = await p.h.page.evaluate(() => (document.querySelector("[data-og-m1-past]") || {}).textContent || "");
  if (!/Month 1 \u00b7 done Nov 9/.test(p.ongoing + past) || !/Month 1 work/i.test(past) || !/read only/i.test(past)) fail("between months: Month 1 is not readable as a past month (read only)");
  if (!/No jobs yet in Month 1/.test(past) || !/weekly customer list picks it up/.test(past)) fail("between months: 'No jobs yet' is not carried into the weekly customer list in the past Month 1 card");
  await done(p);
  // H · Month 3 (a quarter): the weekly list takes the first-review wording while Google shows 0, and the plain title once reviews exist
  const m3 = (reviews) => draw("managed", { stage: "stage_5_monthly", clock: "2027-01-12T15:00:00Z", reviews, tasks: base({ ...sent }), tables: { client_monthly_records: ["2026-12-01", "2027-01-01"].map((m, i) => ({ id: `mr${i}`, client_id: "11111111-1111-4111-8111-111111111111", workspace_id: "w1", reporting_month: m, data: { tasks: {} } })) } });
  p = await m3(0);
  if (!/Month 3/i.test(p.ongoing) || !/Get your first reviews/.test(p.ongoing) || /more reviews/i.test(p.ongoing)) fail("Month 3: the weekly list does not read 'Get your first reviews' while Google shows 0 reviews");
  if (/Step \d/.test(p.ongoing)) fail("Month 3: the month card draws a step number");
  await done(p);
  p = await m3(3);
  if (!/This week's customer list/.test(p.ongoing) || /Get your first reviews/.test(p.ongoing)) fail("Month 3 with reviews on Google: the weekly list still reads first-review wording");
  await done(p);
  // F · self-serve parity
  p = await draw("self_serve", { tasks: base() });
  if (/GETTING STARTED/i.test(p.setup) || !/Provide 20\+ business photos/.test(p.setup) || /YOUR PART THIS MONTH/i.test(p.ongoing)) fail("the self-serve portal changed: it shows Getting started or the Month 1 card");
  await done(p);
  return F;
}

// ── run ────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const rev = AGAINST;
  const root = rev ? exportRev(rev) : SITE;
  const label = rev ? `before(${rev})` : "after";
  let F = checkTree(root, label);
  if (!NO_BROWSER) {
    try { F = F.concat(await checkBrowser(root, label)); }
    catch (e) { if (e instanceof HarnessUnavailable || /puppeteer|browser/i.test(String(e && e.message))) { console.error(`⚠️  INDETERMINATE: ${String(e.message).slice(0, 200)}`); process.exit(2); } throw e; }
  }
  if (rev) {
    console.log(F.length ? `✗ ${rev}: ${F.length} problem(s) (this is the BEFORE state, so failing is correct)\n${F.slice(0, 60).map((x) => "  · " + x).join("\n")}` : `✓ ${rev} passes`);
    process.exit(F.length ? 1 : 0);
  }
  if (F.length) { console.log(`✗ setup vs month 1: ${F.length} problem(s)\n${F.map((x) => "  · " + x).join("\n")}`); process.exit(1); }
  if (!NO_BEFORE) {
    // LIVE_BEFORE: today's pieces are present in the before state, so this gate MUST fail there
    const bdir = exportRev(BEFORE_REV);
    const B = checkTree(bdir, `before(${BEFORE_REV})`);
    if (B.length < 8) { console.error(`⚠️  INDETERMINATE: the gate found only ${B.length} problem(s) on the before state ${BEFORE_REV}; it must fail there in 8+ places`); process.exit(2); }
    console.log(`✓ setup vs month 1 holds (${NO_BROWSER ? "no browser" : "browser fixtures drawn"}); on the before state ${BEFORE_REV} the gate finds ${B.length} problems.`);
  } else console.log("✓ setup vs month 1 holds");
  process.exit(0);
}
main().catch((e) => { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); });
