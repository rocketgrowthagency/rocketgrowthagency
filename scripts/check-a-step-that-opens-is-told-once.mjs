#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-step-that-opens-is-told-once.mjs
//
// 🔒 WHY (2026-10-13, approved step_open_now_email_v1, decisions 1–3): portal step 12 waits on RGA until step 56 (the
// review request messages) is done, and when it opened nothing told the client. Chris approved one email in the one
// client-email format, sent automatically within the hour, 8 AM–7 PM the client's time, once per step.
// HOLDS — running the real function where it can (netlify/functions/notify-step-open.js):
//   1. Only a step that was SEEN waiting on RGA, is open now (nothing else holds it), unfinished and not yet told is
//      due. Never for a step that opened before the sweep saw it wait, never twice, never while the client's own step
//      or the listing still holds it. Only steps that ask the client for something.
//   2. The words are the approved mockup's; the link is words; the letter signs it once.
//   3. 8 AM to 7 PM in the client's time zone.
//   4. The sweep starts only from the scheduler or the internal secret; the test send (its own function) is staff-only
//      and stamps nothing.
//   5. The stamp is written BEFORE the send (two runs can't both send), a failed send takes it back, and the detection
//      runs first so a step already done is finished instead of announced.
//   6. Scheduled hourly; the client sees it in the step's thread.
// exit 0 = a step that opens is told once, in the approved words · 1 = it isn't · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const S57 = "m1.review.first_5", S56 = "m1.review.system";
const done = { status: "done" };

let N;
try { N = req("./notify-step-open.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — notify-step-open.js won't load: ${e.message}`); process.exit(2); }

// ── 1 · who is due ──
const ids = (N.CANDIDATES || []).map((s) => s.id);
if (!ids.includes(S57)) fail("step 12 (5 customers) can't trigger the email");
if (ids.includes("m1.call.close")) fail("the close-out call triggers the email, but it asks the client for nothing");
const own = { "m1.access.gbp": done, "m1.gbp.verify": done };
const seen = { waited_on_rga_at: "2026-10-13T00:00:00Z" };
const cases = [
  ["waiting on RGA, not seen yet → seen (stamped), nothing sent", { ...own }, [S57], []],
  ["waiting on RGA, seen → nothing", { ...own, [S57]: seen }, [], []],
  ["opened after being seen → due", { ...own, [S56]: done, [S57]: seen }, [], [S57]],
  ["opened but never seen waiting (opened before this existed) → nothing", { ...own, [S56]: done }, [], []],
  ["already told → nothing", { ...own, [S56]: done, [S57]: { ...seen, open_told_at: "x" } }, [], []],
  ["already done → nothing", { ...own, [S56]: done, [S57]: { ...seen, status: "done" } }, [], []],
  ["RGA's part done but the client's own step 6 still open → nothing yet", { "m1.access.gbp": done, [S56]: done, [S57]: seen }, [], []],
];
for (const [name, tasks, stamped, due] of cases) {
  const r = N.passFor(tasks);
  if (JSON.stringify(r.stamped.filter((x) => x === S57)) !== JSON.stringify(stamped) || JSON.stringify(r.due.filter((x) => x === S57)) !== JSON.stringify(due)) {
    fail(`${name} — got stamped ${JSON.stringify(r.stamped)}, due ${JSON.stringify(r.due)}`);
  }
}

// ── 2 · the approved words ──
// 🔒 The subject is step_open_now_email_v1's; the body is step12_review_requests_v1's (approved 10-14: the letter blocks —
// "# ✓ heading", the ":: msg" TYPE line, the ">>" button). Each block's words are compared, not its markup.
const mock = read("reports/mockups/step_open_now_email_v1.html");
const mock12 = read("reports/mockups/step12_review_requests_v1.html");
const s57 = (N.CANDIDATES || []).find((s) => s.id === S57);
if (s57) {
  const e = N.buildEmail({ primary_contact_name: "Chris Rivera" }, [s57]);
  if (!mock.includes(e.subject.replace(/'/g, "'"))) fail(`the subject isn't the approved one ("${e.subject}")`);
  const lines = e.markup.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    const btn = /^>> \[([^\]]+)\]\(([^)]+)\)$/.exec(l), type = /^:: \w+ \|([^|]*)\|([^|]*)\|(.*)$/.exec(l);
    const texts = btn ? [btn[1]] : type ? [type[1], type[2], ...type[3].split(" · ")].map((x) => x.trim()) : [l.replace(/^#{1,2} (✓ )?/, "")];
    for (const text of texts) if (!mock12.includes(text)) fail(`"${text.slice(0, 60)}" isn't in the approved email (step12_review_requests_v1) — new words need a new approval`);
    if (btn && !/^https:\/\/www\.rocketgrowthagency\.com\/portal\/#step-m1\.review\.first_5$/.test(btn[2])) fail(`the button goes somewhere else (${btn[2]})`);
  }
  if (!lines.some((l) => /^>> \[Send your 5 customers\]\(/.test(l))) fail("the button isn't written as words");
  // 🔑 A step with no heading of its own gets the plain letter: its link must be words too (step 12 no longer exercises it).
  const plain = N.buildEmail({ primary_contact_name: "Sam" }, [{ ...s57, clientOpenEmail: {} }]).markup;
  if (!/^\[Open step 12\]\(https:\/\/www\.rocketgrowthagency\.com\/portal\/#step-m1\.review\.first_5\)$/m.test(plain)) fail("a plain step-open email's link isn't written as words");
  if (/(^|\s)https?:\/\/\S+(\s|$)/.test(plain.replace(/\]\([^)]+\)/g, "]"))) fail("a bare link shows in a plain step-open email");
  if (/(^|\s)https?:\/\/\S+(\s|$)/.test(e.markup.replace(/\]\([^)]+\)/g, "]"))) fail("a bare link shows in the email");
  const letter = req("./_letter.js").letter(e.markup);
  if ((letter.text.match(/Rocket Growth Agency · \(424\) 242-2040/g) || []).length !== 1) fail("the email isn't signed exactly once");
  const nobody = N.buildEmail({ primary_contact_name: "" }, [s57]);
  if (!/^Hi there,/m.test(nobody.markup)) fail("a contact with no name gets a broken greeting");
}

// ── 3 · sending hours ──
const LA = { primary_market: "Los Angeles, CA" }, NY = { primary_market: "Brooklyn, NY" };
const at = (iso) => new Date(iso);
if (!N.inSendingHours(LA, at("2026-10-13T15:00:00Z"))) fail("8 AM in Los Angeles is outside sending hours");
if (N.inSendingHours(LA, at("2026-10-13T14:59:00Z"))) fail("7:59 AM in Los Angeles is inside sending hours");
if (!N.inSendingHours(LA, at("2026-10-14T01:59:00Z"))) fail("6:59 PM in Los Angeles is outside sending hours");
if (N.inSendingHours(LA, at("2026-10-14T02:00:00Z"))) fail("7 PM in Los Angeles is inside sending hours");
if (N.inSendingHours(NY, at("2026-10-14T02:00:00Z"))) fail("10 PM in New York reads as sending hours (the zone isn't the client's)");

// ── 4 · who can start it ──
const src = code("netlify/functions/notify-step-open.js");
const cronAt = src.search(/const cron = requireCronOrInternal\(event\);\s*if \(!cron\.ok\) return/), sweepAt = src.indexOf("await sweep()");
if (cronAt < 0 || sweepAt < 0 || cronAt > sweepAt) fail("anyone hitting the URL can start the sweep that emails clients");
// 🔑 The test send is its own function: Netlify answers 403 to any URL call on a scheduled one (found live, 10-13).
if (/body\.test/.test(src)) fail("notify-step-open.js carries a test route again; a scheduled function can't be called by URL, so it is dead");
const ts = code("netlify/functions/step-open-test-send.js");
const tGate = ts.search(/const gate = await requireWorkspaceForClientOrInternal\(event, clientId\);\s*if \(gate\.error\) return gate\.error;/);
const tSend = ts.indexOf("await N.sendFor(client, [step], { test: true })");
if (tGate < 0 || tSend < 0 || tGate > tSend) fail("the test send isn't staff-only");
if (/open_told_at|writeTasks|client_onboarding_records/.test(ts)) fail("the test send stamps the step as told");

// ── 5 · never twice, and already-done is finished, not announced ──
const stampAt = src.indexOf("for (const id of still) tasks[id] = { ...(tasks[id] || {}), open_told_at: at };");
const sendAt = src.indexOf("const r = await sendFor(client, still.map(");
const undoAt = src.indexOf("delete tasks[id].open_told_at;");
if (stampAt < 0 || sendAt < 0 || stampAt > sendAt) fail("the step is stamped after the send: two runs could both send it");
if (undoAt < sendAt) fail("a failed send keeps its stamp, so the step is never told");
const recheckAt = src.indexOf("/.netlify/functions/portal-step-recheck");
if (recheckAt < 0 || recheckAt > stampAt) fail("a step already done (5 customers in) is announced instead of finished");
if (!/const still = passFor\(tasks\)\.due;/.test(src)) fail("the due list isn't re-read after the detection runs");

// ── 6 · schedule + thread ──
if (!/\[functions\."notify-step-open"\]\s*\n\s*schedule = "\d{1,2} \* \* \* \*"/.test(read("netlify.toml"))) fail("notify-step-open isn't scheduled hourly");
if (!/const VISIBLE = \[[^\]]*"step_open_sent"/.test(read("netlify/functions/portal-thread.js"))) fail("the client can't see the email in the step's thread");

if (F.length) { console.error("🔴 a step that opens isn't told once, in the approved words:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ ${cases.length} sweep states (seen → opened → told once; never stale, never twice, never while their own step holds it); the approved words, link as words, signed once; 8 AM–7 PM their time; scheduler-only sweep, staff-only test; stamp before send, undo on failure, detection first; hourly, in the thread`);
