#!/usr/bin/env node
// check-open-moves-reach-every-surface.mjs — 2026-10-26, approved todo_inbox_v1 (Chris: "anything queued for RGA… so its not
// lost… we should test all these are wired correctly"). RGA's own step 4 sat `with_rga` for 10 days and nothing showed it.
// ONE list (_open-moves.js) now says, per client, whose move each open step is, since when, the promise, late or not; the
// admin To do queue + nav number, each client's "Next up", the portal row pill + step 4, and the morning email read it.
// This RUNS the real module on fixture records (every state), and checks every surface reads that one list:
//   · with_rga → RGA's move since google_push.at; late after 2 business days; needs_client → the client's
//   · a picked call time → RGA confirms in 1 business day · an open client step → theirs, since its last prerequisite / the
//     kickoff / the one-listing clear · a client step that waits on RGA → that RGA step is RGA's move, naming what it holds
//   · the Month 1 report is not a move before kickoff + 27 · finished / "remind me later" → no move · no date → no age
//   · the client's projection never carries an RGA-only step id or wording (the graph never leaves the building)
//   · admin badge = RGA's LATE moves · morning email = late + due today, none when nothing is
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const require = createRequire(import.meta.url);
const F = [];
const fail = (m) => F.push(m);
const read = (p) => { try { return fs.readFileSync(path.join(SITE, p), "utf8"); } catch { console.log(`⚠️  INDETERMINATE — can't read ${p}`); process.exit(2); } };
let OM, PB;
try { OM = require(path.join(SITE, "netlify/functions/_open-moves.js")); PB = JSON.parse(read("data/playbooks/playbooks.json")); }
catch (e) { console.log(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const M1 = PB.month1 || [];
const has = (id) => M1.some((s) => s.id === id);
for (const id of ["m1.gbp.business_facts", "m1.gbp.attributes", "m1.kickoff.call", "m1.review.first_5", "m1.report.month1", "m1.call.close", "m1.audit.gbp_duplicate"]) if (!has(id)) { console.log(`⚠️  INDETERMINATE — step ${id} moved`); process.exit(2); }

// a client who has done everything — then each case opens one thing
const NOW = "2026-10-26T17:00:00.000Z";
const allDone = () => Object.fromEntries(M1.map((s) => [s.id, { status: "done", completed_at: "2026-09-20T17:00:00.000Z" }]));
const run = (tasks, extra = {}, now = NOW) => OM.openMoves({ playbooks: PB, data: { tasks, ...extra }, now });
const find = (ms, id, owner) => ms.find((m) => m.step_id === id && (!owner || m.owner === owner));

// 0 · everything finished → nothing open
if (run(allDone()).length) fail(`a client with every step finished still has open moves (${run(allDone()).map((m) => m.step_id).join(", ")})`);

// 1 · RGA changes it by hand on Google: since = google_push.at; 2 business days; late after
{
  const t = allDone(); t["m1.gbp.business_facts"] = { status: "in_progress", google_push: { state: "with_rga", at: "2026-10-16T18:38:57.122Z", rga: [{ fact: "area", add: ["Mar Vista", "Palms", "Playa Vista"], remove: [] }] } };
  const m = find(run(t), "m1.gbp.business_facts", "rga");
  if (!m) fail("a step RGA must change by hand on Google (with_rga) is not RGA's move — the 10-day miss");
  else {
    if (m.since !== "2026-10-16T18:38:57.122Z") fail(`RGA's by-hand move is dated ${m.since}, not when it became RGA's (google_push.at)`);
    if (!m.late || m.age_days !== 9) fail(`a by-hand move 9.9 days old is not late / not 9 whole days (late ${m.late}, age ${m.age_days})`);
    if (!/Mar Vista, Palms, Playa Vista/.test(m.what)) fail(`RGA's move doesn't say what to do ("${m.what}")`);
  }
  // 2 business days: Fri 10:00 → due Tue 10:00 → on Mon 17:00 it's on track, not late
  t["m1.gbp.business_facts"].google_push.at = "2026-10-23T17:00:00.000Z";
  const m2 = find(run(t, {}, "2026-10-26T17:00:00.000Z"), "m1.gbp.business_facts", "rga");
  if (!m2 || m2.late) fail("RGA's promise isn't 2 BUSINESS days (a Friday move was late on Monday)");
  const m3 = find(run(t, {}, "2026-10-27T18:00:00.000Z"), "m1.gbp.business_facts", "rga");
  if (!m3 || !m3.late) fail("an RGA move past its 2 business days is not late");
}
// 2 · Google said no → the client's move
{
  const t = allDone(); t["m1.gbp.attributes"] = { status: "in_progress", google_push: { state: "needs_client", said: "Google didn't accept this.", at: "2026-10-24T10:00:00Z" } };
  const m = find(run(t), "m1.gbp.attributes");
  if (!m || m.owner !== "client" || m.kind !== "google_said_no") fail("a step Google refused (needs_client) is not the client's move");
}
// 3 · the client picked a kickoff time → RGA confirms it (1 business day)
{
  const t = allDone(); delete t["m1.kickoff.call"];
  const m = find(run(t, { kickoff_invite: { status: "requested", requested_at: "2026-10-26T09:00:00Z" } }), "m1.kickoff.call");
  if (!m || m.owner !== "rga" || m.kind !== "confirm_call" || m.days !== OM.CONFIRM_DAYS) fail("a picked kickoff time is not RGA's move to confirm in 1 business day");
  const b = find(run(t, { kickoff_invite: { status: "booked" } }), "m1.kickoff.call");
  if (b) fail("a BOOKED kickoff still shows as an open move");
}
// 4 · an open client step: theirs, since its last prerequisite / the kickoff / the listing clear — never earlier
{
  const t = allDone(); t["m1.gbp.attributes"] = { status: "pending" };
  t["m1.kickoff.call"].completed_at = "2026-10-09T16:00:00Z";
  t["m1.audit.gbp_duplicate"] = { status: "done", completed_at: "2026-10-15T18:10:42Z", outcome_data: { verdict: "clean" }, owner_removal: { status: "removed", at: "2026-10-14T23:25:55Z" } };
  const m = find(run(t), "m1.gbp.attributes", "client");
  if (!m) fail("an open client step (Your turn) is not the client's move");
  else if (m.since !== "2026-10-14T23:25:55Z") fail(`an open listing step isn't dated from the one-listing clear (${m.since}) — it read 25 days on RGA's record`);
  // and while the listing isn't cleared, it isn't the client's move at all
  const u = allDone(); u["m1.gbp.attributes"] = { status: "pending" }; u["m1.audit.gbp_duplicate"] = { status: "pending" };
  if (find(run(u), "m1.gbp.attributes", "client")) fail("a listing step still waiting on the one-listing check is listed as the client's move");
  if (m && OM.asksClient(M1.find((s) => s.id === "m1.gbp.attributes")) !== true) fail("the portal's own 'asks the client' test changed");
}
// 5 · a client step waiting on RGA's part → RGA's move, naming the client step it holds; the client's view gets only their id
{
  const s13 = M1.find((s) => s.id === "m1.review.first_5");
  const holder = (s13.dependsOn || []).find((id) => { const x = M1.find((y) => y.id === id); return x && !(x.clientLabel && ["supply", "act"].includes(x.clientBucket)); });
  if (!holder) { console.log("⚠️  INDETERMINATE — step 13 no longer waits on an RGA step"); process.exit(2); }
  const t = allDone(); t["m1.review.first_5"] = { status: "pending" }; t[holder] = { status: "pending" };
  const ms = run(t);
  const m = ms.find((x) => x.kind === "blocks_client" && x.step_id === holder);
  if (!m || !(m.blocks_ids || []).includes("m1.review.first_5")) fail("an RGA step a client step waits on is not RGA's move naming what it holds");
  if (find(ms, "m1.review.first_5", "client")) fail("a client step that waits on RGA is ALSO listed as the client's move");
  const cv = OM.clientMoves(ms, PB);
  const visible = new Set(M1.filter((s) => s.clientLabel && ["supply", "act"].includes(s.clientBucket) && !s.ongoing).map((s) => s.id));
  const leak = cv.filter((x) => !visible.has(x.step_id));
  if (leak.length) fail(`the client's projection carries RGA-only step ids: ${leak.map((x) => x.step_id).join(", ")}`);
  if (cv.some((x) => "what" in x || "step" in x || "blocks" in x)) fail("the client's projection carries RGA's wording (what / step / blocks)");
  if (!cv.some((x) => x.step_id === "m1.review.first_5" && x.kind === "waits_on_rga" && x.owner === "rga")) fail("the client's view doesn't mark the held step as waiting on RGA");
  // an RGA-only step RGA must finish by hand on Google: on RGA's list, never on the client's
  t[holder] = { status: "in_progress", google_push: { state: "with_rga", at: "2026-10-20T10:00:00Z", rga: [] } };
  const ms2 = run(t);
  if (!ms2.some((x) => x.step_id === holder && x.owner === "rga")) fail("an RGA-only step with a by-hand Google change is not on RGA's list");
  if (OM.clientMoves(ms2, PB).some((x) => x.step_id === holder)) fail(`an RGA-only step (${holder}) reaches the client's projection`);
}
// 6 · the Month 1 report is not a move before kickoff + 27
{
  const t = allDone(); t["m1.report.month1"] = { status: "pending" }; t["m1.call.close"] = { status: "pending" };
  t["m1.kickoff.call"].completed_at = "2026-10-09T16:00:00Z";
  if (run(t).some((m) => m.step_id === "m1.report.month1")) fail("the Month 1 report is a move before kickoff + 27 (it read 19 days late on RGA's record)");
  if (!run(t, {}, "2026-11-06T17:00:00Z").some((m) => m.step_id === "m1.report.month1")) fail("the Month 1 report never becomes RGA's move after kickoff + 27");
}
// 7 · "remind me later" → not a move until the date; no date → no age (never 0)
{
  const t = allDone(); t["m1.audit.gbp_duplicate"].outcome_data = { verdict: "clean" };
  t["m1.gbp.photos"] = { status: "pending" };
  if (!find(run(t), "m1.gbp.photos", "client")) fail("an open photo step is not the client's move (the later case below would prove nothing)");
  t["m1.gbp.photos"] = { status: "pending", later: { until: "2026-11-02T00:00:00Z" } };
  if (find(run(t), "m1.gbp.photos")) fail("a step the client put off (Remind me later) is still listed as theirs");
  const u = allDone(); u["m1.gbp.business_facts"] = { status: "in_progress", google_push: { state: "with_rga", rga: [] } };
  const m = find(run(u), "m1.gbp.business_facts");
  if (!m || m.since !== null || m.age_days !== null || m.late) fail("a move with no known start shows an age or a lateness (absence read as a value)");
}

// ── every surface reads the ONE list
const ADM = read("admin/admin.js"), POR = read("portal/portal.js"), IDX = read("admin/index.html"), TOML = read("netlify.toml");
const AOM = read("netlify/functions/admin-open-moves.js"), POM = read("netlify/functions/portal-open-moves.js"), MORN = read("netlify/functions/rga-todo-morning.js");
if (!/require\("\.\/_open-moves"\)/.test(AOM) || !/require\("\.\/_open-moves"\)/.test(POM)) fail("an open-moves endpoint doesn't read _open-moves.js");
if (!/clientMoves\(openMoves\(/.test(POM)) fail("the portal endpoint returns the full list, not the client's projection");
if (!/requirePortalOwnerOrWorkspace/.test(POM) || !/requireWorkspaceUser/.test(AOM)) fail("an open-moves endpoint lost its caller check");
if (!/or=\(source\.is\.null,source\.not\.like\.test:\*\)/.test(AOM)) fail("the admin queue / morning email reads the walk's test clients");
if (!/require\("\.\/admin-open-moves"\)/.test(MORN) || !/movesForWorkspace\(/.test(MORN)) fail("the morning email doesn't read the same list as the admin queue");
if (!/\[functions\."rga-todo-morning"\]\s*\n\s*schedule = "30 14 \* \* 1-5"/.test(TOML)) fail("the morning email isn't scheduled weekdays 7:30 Pacific");
if (!/fetch\("\/\.netlify\/functions\/admin-open-moves"/.test(ADM)) fail("admin doesn't read admin-open-moves");
if (!/setTodoBadge\(j\.count\.rga_late \|\| 0\)/.test(ADM)) fail("the To do nav number isn't RGA's LATE moves");
if (!/data-nav="openTodoButton"/.test(IDX) || !/id="todoNavBadge"/.test(IDX) || !/id="todoView"/.test(IDX) || !/id="adminNextActionMoves"/.test(IDX) || /id="clientNextUp"/.test(IDX)) fail("the admin To do link / number / view is missing, or Next up is a second panel again (it lives IN the next-action card)");
// Next up = the next-action card (Chris 10-26: the panel showed the same moves twice above the card)
if (!/const listMoves = movesForSelected\(\);/.test(ADM) || !/listMoves \? listMoves\.filter\(\(m\) => m\.owner === "client" && m\.step_id !== activeFlowId\)/.test(ADM)) fail("the card's \"Also waiting on the client\" isn't the client's moves from the one list");
if (!/na\.innerHTML = h; na\.hidden = !h;/.test(ADM) || !/Your move \$\{tag\(mine\)\}/.test(ADM)) fail("the next-action card lost \"Your move since … · late\" / RGA's other moves");
for (const [k, re] of [["view flag", /todo: name === "todo"/], ["nav highlight", /todo: "openTodoButton"/], ["URL in", /rawView === "todo"\) return "todo"/], ["URL out", /view === "todo"\) \{\s*url\.searchParams\.set\("view", "todo"\)/], ["reload opener", /todo: handleOpenTodo/], ["nav click", /nav === "openTodoButton"\) \{ handleOpenTodo\(\)/], ["boot count", /refreshTodoCount\(\)\.catch/], ["client load", /renderClientNextUp\(state\.selectedClient\.id\)/]])
  if (!re.test(ADM)) fail(`admin To do isn't wired: ${k}`);
if (!/fetch\(`\/\.netlify\/functions\/portal-open-moves\?client_id=/.test(POR)) fail("the portal doesn't read portal-open-moves");
// the client's To do tab: next to Dashboard, its number = approvals + their own steps, steps in the inbox, the yellow card agrees
const PIDX = read("portal/index.html");
const navs = [...PIDX.matchAll(/<a [^>]*data-view="([a-z]+)"/g)].map((m) => m[1]);
if (navs[0] !== "dashboard" || navs[1] !== "approvals" || !/data-view="approvals"[^\n]*>To do<span class="portal-nav-badge" id="approvalsBadge"/.test(PIDX)) fail(`the client tab isn't "To do" next to Dashboard (order: ${navs.join(", ")})`);
if (!/const n = pending \+ stepNeeds\.length; badge\.textContent = String\(n\)/.test(POR)) fail("the To do number doesn't count the client's own open steps");
if (!/stepNeeds\.forEach\(\(m\) => add\("needs", \{ type: "step"/.test(POR) || !/stepRga\.forEach\(\(m\) => add\("rga", \{ type: "step"/.test(POR)) fail("steps don't join the To do inbox (Needs you / RGA is working on)");
if (!/\$\{total && !stepNeeds\.length && !stepRga\.length \? `<span class="ib-prog">/.test(POR)) fail("the To do header shows approvals-only progress beside open steps (\"4 things need you · 1 of 1 done\")");
if (!/taking longer than we promised/.test(POR)) fail("a late RGA step doesn't tell the client it's taking longer than promised");
if (!/if \(e\.type === "step"\) \{/.test(POR) || !/href="#step-\$\{escapeAttribute\(e\.step_id\)\}"/.test(POR)) fail("a To do step doesn't open the step itself");
if (!/data-nextstep-owed hidden href="#" data-portal-goto="approvals"/.test(POR) || !/const n = n0 \+ \(_todoApprovalsN \|\| 0\);/.test(POR)) fail("the yellow card's \"N other things\" doesn't count what To do counts / doesn't open To do");
if (!/RGA is doing it\$\{gbpWithRga \? moveSince\(openMv && openMv\.get\(step\.id\)\) : ""\}/.test(POR)) fail("the row pill lost its \"· since\" on RGA's by-hand move");
if (!/pcTlNow\(`<b>RGA \$\{addingN \? "adds them" : "makes the change"\} on Google<\/b>\$\{moveSince\(byHand\)\}`/.test(POR)) fail("step 4 no longer shows RGA's part (since) before Google's 48 hours");
// ── todo_redesign_v1 (approved 10-26): the redesign's moving parts
{
  const CS = JSON.parse(read("data/playbooks/client-steps.json")), BCS = read("scripts/build-client-steps.mjs"), SSE = read("netlify/functions/send-step-email.js");
  if (!/"clientMinutes",/.test(BCS) || !(CS.month1 || []).some((x) => x.clientMinutes)) fail("a step's minutes don't reach the client (clientMinutes in the projection)");
  if (!/e === firstStep \? `<span class="ib-next">Start here<\/span>` : ""/.test(POR) || !/st\.clientMinutes \? `<span class="ib-tm">/.test(POR)) fail("the client's To do cards lost \"Start here\" or the minutes");
  if (!/Month 1 · \$\{m1Done\} of \$\{m1Steps\.length\} done/.test(POR) || !/stepNeeds\.every\(\(m\) => mvStep\(m\.step_id\)\.clientMinutes\)/.test(POR)) fail("the To do header isn't the Month 1 progress line / sums minutes it doesn't have");
  if (!/function ibOpenStep\(id\)/.test(POR) || !/t\.hasAttribute\("data-ib-step"\) && window\.matchMedia/.test(POR)) fail("a To do step doesn't open the step itself (phone tap / a second tap)");
  if (!/band\("late", "Late · do these first", "late"/.test(ADM) || !/data-mv-filter/.test(ADM) || !/state\.todoFilter = state\.todoFilter === k \? "all" : k/.test(ADM)) fail("the admin queue isn't in urgency bands with chips that filter");
  if (!/m\.kind === "google_by_hand"\s*\? `<a class="admin-button mv-main" href="https:\/\/business\.google\.com\/"/.test(ADM)) fail("a by-hand Google change's main button isn't Open Business Profile");
  if (!/\(m\.reminders \|\| 0\) === 0 \? m\.age_days >= 3/.test(ADM) || !/m\.reminders === 1 && m\.age_days >= 7/.test(ADM)) fail("the reminder rule isn't 3 days, then 7 days, at most 2");
  if (!/okLabel: "Send reminder"/.test(ADM) || !/kind: "nudge", clientId: cid, stepId: ids\[0\], also_step_ids: ids\.slice\(1\)/.test(ADM)) fail("Draft reminder doesn't go through the nudge dialog + send path");
  if (!/const badAlso = alsoSteps\.find\(\(x\) => !NUDGE_STEPS\.has\(x\)\);/.test(SSE) || !/for \(const id of \[stepId, \.\.\.alsoSteps\]\) \{/.test(SSE) || !/step_ids: \[stepId, \.\.\.alsoSteps\]/.test(SSE)) fail("a reminder's extra steps skip the nudge checks, or aren't recorded");
  if (!/kind=eq\.step_nudge_sent/.test(AOM) || !/reminders: rs\.length, reminded_at:/.test(AOM)) fail("the admin list doesn't know each step's reminders");
  if (!/#adminNextActionDesc\.mv-folded \{ display:none; \}/.test(read("admin/admin.css")) || !/els\.adminNextActionDesc\.classList\.toggle\("mv-folded", mineByHand\)/.test(ADM)) fail("the client card's long before / after sentence doesn't fold (the card's own See the details opens the step)");
  if (!/const month1 = \{ total: m1\.length, done:/.test(POM) || !/_openMovesMonth1\.set\(clientId, j\.month1\)/.test(POR)) fail("the To do header's Month 1 progress isn't read from the server with the moves");
  if (/class="ib-tl/.test(POR.slice(POR.indexOf("const stepRow = (e) =>"), POR.indexOf("const row = (e) =>")))) fail("a To do task reuses .ib-tl (the website timeline's class)");
}
// 10-26: while the list loads, the card's client side says "Checking…" — never the card's old guess ("11 items" before the real 4)
if (!/state\.openMoves = undefined;/.test(ADM) || !/if \(countEl && listEl && movesLoading\) \{/.test(ADM)) fail("the admin card flashes its old guess of the client's list while the real one loads");
// no surface carries its own copy of the promise rule
for (const [name, src] of [["admin.js", ADM], ["portal.js", POR]]) if (/addBusinessDays|RGA_DAYS|CLIENT_DAYS/.test(src)) fail(`${name} carries its own copy of the promise rule`);
// the morning email, built from the list
{
  const { morningEmail } = require(path.join(SITE, "netlify/functions/rga-todo-morning.js"));
  const mk = (o) => ({ client_id: "c1", client: "Client A", step: "Step 4 · X", what: "do it", age_days: 3, owner: "rga", late: false, due_today: false, ...o });
  if (morningEmail([mk({}), mk({ owner: "client", late: true })]) !== null) fail("the morning email is sent when nothing of RGA's is due or late");
  const e = morningEmail([mk({ late: true }), mk({ due_today: true }), mk({ owner: "client", late: true })]);
  if (!e || e.to !== "hello@rocketgrowthagency.com" || !/1 late, 1 due today/.test(e.subject) || !/Late\n- Client A/.test(e.body) || !/1 step across 1 client/.test(e.body)) fail(`the morning email doesn't say late + due today + who's waiting (${JSON.stringify(e)})`);
}
if (F.length) { console.log("🔴 the open moves don't reach every surface:"); for (const f of F) console.log("   · " + f); process.exit(1); }
console.log("✅ one list of open moves reaches every surface: RGA's by-hand / confirm / blocking moves with since · 2 business days · late; the client's turn since it really opened; the report not before kickoff + 27; no age without a date; the client sees only their own steps; admin queue + late number + Next up, portal pill + step 4, and the morning email all read it");
