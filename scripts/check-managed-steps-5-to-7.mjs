#!/usr/bin/env node
// check-managed-steps-5-to-7.mjs — managed Setup steps 5, 6 and 7 and the one wording per status, DRAWN (approved 11-4: client_step05_reviews_v1 ·
// client_step06_videos_v1 · client_step07_closeout_v1 · client_setup_status_protocol_v1; the owner: "all approved. go live").
//
// BOOTS THE REAL PORTAL (scripts/lib/portal-boot-harness.mjs: the real portal.js + portal.css + shared/*, our fake database, every function
// answered and recorded, nothing leaves the laptop) on the Foundation stage — the path that drew step 5 with NO customer lists — and reads
// what the client sees, at 375, 768 and 1280 wide. Invented clients (a plumber with a YouTube channel kept, a cleaner with none); nothing
// keys on a name.
// HOLDS, for a MANAGED client:
//   5 · the customers already asked are counted ("1 of 5 asked" · "4 to go", the first circle asked); "Write the request" is never pale, and
//       pressed with the fields empty it says "Add a first name and a cell number or email." and puts the cursor in First name, saving
//       nothing; a row of only RGA's emails is "Emails from RGA · N" and the email that opened the step reads "This step opened: <title>";
//       a row with their own message in it stays "Messages · N"
//   6 · the title has no "(optional)"; the disc is blue with the blue pill; RGA's part reads "in progress" (never "now"); the kept channel
//       is named ("on YouTube, @…, and your website"; none kept = "on your YouTube channel"); "Not doing videos? Skip this" sits under the
//       card at its own size and posts the existing skip (portal-video-clip kind "skip"), after which the step reads Skipped
//   7 · no "step left"; the band says it opens when the Month 1 report is ready, about <the pill's date>; the report and "Then you pick a
//       time" rows; the foot gives Month 1's end, 30 days from the kickoff; a client step the call still needs is listed as yours and the
//       band says "1 of your steps left"
//   · nothing in steps 5–7 overlaps another line or runs out of its row, at any of the three widths
// AND WHEN THE SERVER'S "WAITS ON RGA" LIST DOESN'T LOAD (11-5, 2:33 PM: the database was slow and step 5 read "Can't start yet · RGA is on
// it · Writing your review request message" for a client RGA had already written it for), managed AND self-serve: step 5 says "We couldn't
// check this step just now" under one "Couldn't check" pill, grey disc, no form, never "Can't start yet" / "RGA is on it" / "Your turn", and
// it is not the NEXT step; its Try again asks the server again (spins), says "Still couldn't check" in place when it still can't, and once
// the server answers the row draws that answer ("Your turn" for a step that doesn't wait). → feedback_unloaded_is_not_an_answer
// AND FOR A SELF-SERVE / NO-MODE / COLUMN-MISSING CLIENT, the same record draws today's words ("Messages · 1", "now", "(optional)",
// "1 step left", the pale button). With MANAGED_PORTAL_BEFORE_JS (portal.js before this build) the list is also byte-for-byte equal.
// exit 0 holds · 1 a drawn page is wrong · 2 can't tell (no browser / the page didn't boot)
import fs from "node:fs";
import { bootPortal, HarnessUnavailable, SITE, CID } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const F = [], fail = (m) => F.push(m);
const BEFORE = process.env.MANAGED_PORTAL_BEFORE_JS || "";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const STAGE = "stage_4_onboarding";   // the Foundation stage: buildStageContent drew step 5 with `null` customer lists here
const KICKOFF = "2026-10-09T16:11:50Z";   // Month 1 ends Nov 8; the call opens about Nov 5
const md = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const END = new Date(Date.parse(KICKOFF) + 30 * 86400000), OPENS = new Date(END.getTime() - 3 * 86400000);
const VIDEO_TITLE_SELF = (() => { const cs = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/client-steps.json`, "utf8")); const s = cs.month1.find((x) => x.id === "m1.brand.youtube_setup"); return { self: s.clientLabel, managed: s.managedLabel || null }; })();
const REVIEW_TITLE = (() => { const cs = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/client-steps.json`, "utf8")); return cs.month1.find((x) => x.id === "m1.review.first_5").clientLabel; })();

const lists = [{ id: "l1", client_id: CID, workspace_id: "w1", week_label: "Week of October 26", created_at: "2026-10-26T19:59:53Z", customer_count: 1,
  customers: [{ first_name: "Maria", phone: "5550100000", service_done: "drain cleaning", marked_sent_by_client: true, marked_sent_at: "2026-10-26T20:01:48Z" }] }];
const openLetter = { id: "e1", from: "rga", step_id: "m1.review.first_5", where: null, letter: true, opened: true, test: false, card: null, at: "2026-10-19T15:00:00Z",
  message: "Your next step is ready: send us 5 recent customers\n\nHi Pat,\n\nStep 5 in your portal is open now." };
const theirWord = { id: "c1", from: "you", step_id: "m1.review.first_5", where: "Portal", letter: false, test: false, card: null, at: "2026-10-27T15:00:00Z", message: "Do I text them or email them?" };
const requests = { ok: true, has_review_link: true, review_link: "https://g.page/r/x/review", requests: [{ list_id: "l1", index: 0, name: "Maria", phone: "5550100000", job: "drain cleaning", already_marked: true, marked_at: "2026-10-26T20:01:48Z", reminder: "Hi Maria, just a reminder…", message: "Hi Maria…" }] };
const social = (yt) => ({ status: "done", completed_at: "2026-11-04T16:53:46Z", client_input: { profiles: [{ key: "facebook", label: "Facebook", url: "https://facebook.com/acme" }, ...(yt ? [{ key: "youtube", label: "YouTube", handle: yt, url: `https://www.youtube.com/${yt}` }] : [])] } });
const baseTasks = (over = {}) => ({ ...SCENARIOS.allDone.tasks, ...RGA_CARD_TASKS,
  "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" },
  "m1.gbp.photos": { status: "pending" }, "m1.review.first_5": { status: "pending" }, "m1.brand.youtube_setup": { status: "in_progress", outcome_data: {} },
  "m1.brand.social_profiles": social("@acmeplumbing"), ...over });

async function open(mode, { tasks = baseTasks(), thread = [openLetter], waits = ["m1.call.close"], waitsFn = null, viewport = 1280, overrides = {} } = {}) {
  const fnCalls = [];
  const h = await bootPortal({ mode, stage: STAGE, viewport, tasks, now: SCENARIOS.allDone.now, tables: { client_customer_lists: lists },
    fns: { "portal-thread": () => ({ ok: true, messages: thread, threads: [] }), "portal-step-waits": waitsFn || (() => ({ ok: true, rga: waits })),
      "portal-review-requests": () => requests, "portal-video-clip": (b) => { fnCalls.push(b); return { ok: true, clips: [], needed: 2, skipped: b && b.kind === "skip" }; } } }, overrides, SITE);
  h.videoCalls = fnCalls;
  try { await h.ready("[id^='action-items-list-'] .pm-step-row", 20000); } catch { await h.close(); throw new HarnessUnavailable(`the Setup list never drew (${h.errs[0] || "no error"})`); }
  await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
  await tick(1200);
  return h;
}
// the list a person sees, and one of its rows opened the way they open it
const LISTV = "[...document.querySelectorAll(\"[id^='action-items-list-']\")].find((l) => l.offsetParent !== null)";
const listHtml = async (h) => { const g = () => h.page.evaluate(`(() => { const l = ${LISTV}; return l ? l.innerHTML : null; })()`); let last = await g(), same = 0; for (let i = 0; i < 30 && same < 3; i++) { await tick(250); const now = await g(); same = now === last ? same + 1 : 0; last = now; } return last; };
const openRow = (h, id) => h.page.evaluate(`(() => { const l = ${LISTV}; const r = l && l.querySelector('[id="step-row-${id}"]'); if (!r) return false; if (r.classList.contains("is-collapsed")) r.querySelector(".pm-step-row-head").click(); return true; })()`);
const rowFacts = (h, id) => h.page.evaluate(`(() => { const l = ${LISTV}; const r = l && l.querySelector('[id="step-row-${id}"]'); if (!r) return null;
  const num = r.querySelector(".pm-step-num"), pill = r.querySelector(".pm-step-pills .pm-pill");
  return { cls: r.className, text: r.innerText.replace(/\\s+/g, " ").trim(), html: r.innerHTML, title: (r.querySelector(".pm-step-title") || {}).textContent,
    pills: [...r.querySelectorAll(".pm-step-pills .pm-pill")].map((p) => p.textContent.trim()), disc: num && getComputedStyle(num).backgroundColor, discInk: num && getComputedStyle(num).color,
    pillBg: pill && getComputedStyle(pill).backgroundColor, band: (r.querySelector(".pm-k5-h b") || {}).textContent || "", side: (r.querySelector(".pm-k5-h > span") || {}).textContent || "" }; })()`);
// nothing overlaps or runs out of the row (visible boxes only: a closed <details> has none)
const layoutBad = (h, id) => h.page.evaluate(`(() => { const l = ${LISTV}; const r = l && l.querySelector('[id="step-row-${id}"]'); if (!r) return ["the row is gone"];
  const R = r.getBoundingClientRect(), bad = [];
  const vis = [...r.querySelectorAll("*")].filter((e) => e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }) && e.getClientRects().length);
  for (const e of vis) { const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (b.width && (b.right > R.right + 0.5 || b.left < R.left - 0.5)) bad.push("outside the row: " + e.tagName + "." + e.className);
    if (e.clientWidth && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== "visible" && cs.textOverflow !== "ellipsis") bad.push("clipped: " + e.tagName + "." + e.className); }
  const leaves = vis.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => [e, e.getBoundingClientRect()]);
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) { const [a, A] = leaves[i], [b, B] = leaves[j]; if (a.contains(b) || b.contains(a)) continue;
    if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 1 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 1) bad.push("overlap: " + a.textContent.trim().slice(0, 30) + " × " + b.textContent.trim().slice(0, 30)); }
  return bad; })()`);

const bandUnder = (h, id) => h.page.evaluate(`(() => { const l = ${LISTV}; const b = l && l.querySelector('[id="step-row-${id}"] .pm-k5-h > b'), s = b && b.parentElement.querySelector(":scope > span");
  // UNDER the words means below them AND starting where they start: a date dropped into the icon's 22px column is below, but squeezed to a word a line
  if (!b || !s) return "no band"; const bb = b.getBoundingClientRect(), sb = s.getBoundingClientRect();
  return sb.top < bb.bottom - 1 ? "beside" : sb.left < bb.left - 1 ? "under the icon, squeezed" : true; })()`);
try {
  // ── MANAGED ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    const h = await open("managed");
    try {
      // 5 · the customer already asked, the pressable button, the emails row
      await openRow(h, "m1.review.first_5"); await tick(900);
      let r = await rowFacts(h, "m1.review.first_5");
      if (!r) fail("managed: step 5 isn't drawn");
      else {
        if (r.band !== "1 of 5 asked" || r.side !== "4 to go") fail(`managed step 5's band reads "${r.band}" · "${r.side}"; approved "1 of 5 asked" · "4 to go" (the customer saved Oct 26 is counted)`);
        if (!/<span class="pm-rv-s sent"><i>✓<\/i>asked<\/span><span class="pm-rv-s on"><i>2<\/i>next<\/span>/.test(r.html)) fail("managed step 5: the first circle isn't the asked customer, the second the next");
        if (!/Maria/.test(r.text) || !/asked Oct 26/.test(r.text)) fail("managed step 5 doesn't show the customer already asked (today's asked row)");
        if (!/Customer 2: who was your next job\?/.test(r.text) || !/Add all 4 at once/.test(r.text)) fail("managed step 5 doesn't ask for customer 2 / offer the other 4 at once");
        const msg = /<summary><span class="i">[\s\S]*?<\/span><span class="s"><b>([^<]*)<\/b><small>([^<]*)<\/small>/.exec(r.html);
        if (!msg || msg[1] !== "Emails from RGA · 1") fail(`managed step 5's email row reads "${msg && msg[1]}"; approved "Emails from RGA · 1"`);
        const opened = `${md(openLetter.at)} · This step opened: ${REVIEW_TITLE.replace(/^./, (c) => c.toLowerCase())}`;
        if (!msg || msg[2] !== opened) fail(`managed step 5's email line reads "${msg && msg[2]}"; approved "${opened}"`);
        if (/send us 5 recent customers/.test((msg || [])[2] || "")) fail("managed step 5's row still names the old subject");
      }
      const btn = await h.page.evaluate(`(() => { const l = ${LISTV}; const b = l.querySelector('#step-row-m1\\\\.review\\\\.first_5 [data-r5-send]'); return b ? { dis: b.disabled, t: b.textContent.trim(), op: getComputedStyle(b).opacity, says: !!b.closest("form[data-r5-says]") } : null; })()`);
      if (!btn || btn.dis || btn.t !== "Write the request" || Number(btn.op) < 1) fail(`managed step 5's "Write the request" is pale or disabled (${JSON.stringify(btn)})`);
      else {
        const calls0 = h.fnCalls.length;
        await h.page.evaluate(`(() => { const l = ${LISTV}; l.querySelector('#step-row-m1\\\\.review\\\\.first_5 [data-r5-send]').click(); })()`); await tick(500);
        const after = await h.page.evaluate(`(() => { const l = ${LISTV}; const row = l.querySelector('#step-row-m1\\\\.review\\\\.first_5'); const st = row.querySelector('[data-r5-status]'); const a = document.activeElement;
          return { st: st && st.textContent, bad: st && st.classList.contains("bad"), focus: a && a.getAttribute("name"), inCard: !!(a && a.closest("[data-r5-card]") && !a.closest("[data-r5-card]").hidden), db: (window.__DB_CALLS || []).filter((c) => c.table === "client_customer_lists").length }; })()`);
        if (after.st !== "Add a first name and a cell number or email." || !after.bad) fail(`managed step 5 pressed empty says "${after.st}"; approved "Add a first name and a cell number or email."`);
        if (after.focus !== "first_name" || !after.inCard) fail(`managed step 5 pressed empty doesn't put the cursor in the empty field (focus: ${after.focus})`);
        if (after.db || h.fnCalls.slice(calls0).some((c) => c.name === "notify-rga")) fail("managed step 5 pressed empty saved something");
        // a first name only → the cursor goes to the contact field
        await h.page.evaluate(`(() => { const l = ${LISTV}; const f = l.querySelector('#step-row-m1\\\\.review\\\\.first_5 [data-r5-card]:not([hidden]) [name=first_name]'); f.value = "Sam"; f.dispatchEvent(new Event("input", { bubbles: true })); l.querySelector('#step-row-m1\\\\.review\\\\.first_5 [data-r5-send]').click(); })()`); await tick(300);
        const f2 = await h.page.evaluate(() => document.activeElement && document.activeElement.getAttribute("name"));
        if (f2 !== "phone") fail(`managed step 5 with only a first name puts the cursor in "${f2}", not the empty cell-or-email field`);
      }
      // 6 · the title, the blue disc, "in progress", the channel, Skip this
      await openRow(h, "m1.brand.youtube_setup"); await tick(700);
      r = await rowFacts(h, "m1.brand.youtube_setup");
      if (!r) fail("managed: step 6 isn't drawn");
      else {
        if (VIDEO_TITLE_SELF.managed !== "Record 2 short videos" || r.title !== VIDEO_TITLE_SELF.managed) fail(`managed step 6's title is "${r.title}"; approved "Record 2 short videos" (managedLabel "${VIDEO_TITLE_SELF.managed}")`);
        if (r.pills.join(" · ") !== "RGA is on it · Optional") fail(`managed step 6's pills are ${JSON.stringify(r.pills)}`);
        if (!/\bcs-rga\b/.test(r.cls) || /\bcs-you\b/.test(r.cls) || r.disc !== r.pillBg) fail(`managed step 6's number disc isn't blue with the pill (row ${r.cls}; disc ${r.disc}, pill ${r.pillBg})`);
        if (!/RGA writes 2 scripts in progress/.test(r.text) || /\bnow\b/.test(r.text)) fail(`managed step 6 doesn't say "in progress" for RGA's part (${r.text.slice(0, 200)})`);
        if (!/<div class="pm-cs-ev"><span class="mk rga">/.test(r.html)) fail("managed step 6: RGA's part doesn't carry RGA's mark");
        if (!/You film them · on your phone, when the scripts are here/.test(r.text)) fail("managed step 6 lost \"You film them · on your phone, when the scripts are here\"");
        if (!/RGA publishes · on YouTube, @acmeplumbing, and your website/.test(r.text)) fail("managed step 6 doesn't name the channel they kept (\"on YouTube, @acmeplumbing, and your website\")");
        const sk = await h.page.evaluate(`(() => { const l = ${LISTV}; const row = l.querySelector('#step-row-m1\\\\.brand\\\\.youtube_setup'); const b = row.querySelector("button[data-video-skip]"), card = row.querySelector(".pm-k5-plan");
          return b ? { t: b.textContent.trim(), under: !!card && !!(card.compareDocumentPosition(b) & 4) && !card.contains(b), w: b.getBoundingClientRect().width, cw: card.getBoundingClientRect().width, color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor } : null; })()`);
        if (!sk || sk.t !== "Not doing videos? Skip this" || !sk.under) fail(`managed step 6 has no "Not doing videos? Skip this" under the card (${JSON.stringify(sk)})`);
        else if (sk.w > sk.cw * 0.6) fail(`managed step 6's Skip this stretches (${Math.round(sk.w)} of ${Math.round(sk.cw)}px)`);
        else {
          await h.page.evaluate(`(() => { const l = ${LISTV}; l.querySelector('#step-row-m1\\\\.brand\\\\.youtube_setup button[data-video-skip]').click(); })()`); await tick(700);
          const s2 = await rowFacts(h, "m1.brand.youtube_setup");
          if (!h.videoCalls.some((b) => b && b.kind === "skip" && b.client_id === CID)) fail("managed step 6's Skip this didn't post the existing skip (portal-video-clip kind \"skip\")");
          if (!/No videos for now · your choice/.test(s2.text) || !/Record them after all/.test(s2.text) || s2.pills[0] !== "Skipped" || !/\bcs-ok\b/.test(s2.cls)) fail(`managed step 6 after Skip this isn't the Skipped card with its disc (${s2.pills.join(" · ")}, ${s2.cls}: ${s2.text.slice(0, 300)})`);
        }
      }
      // 7 · what it waits for
      await openRow(h, "m1.call.close"); await tick(700);
      r = await rowFacts(h, "m1.call.close");
      if (!r) fail("managed: step 7 isn't drawn");
      else {
        if (/step(s)? left/.test(r.text) && !/of your steps left/.test(r.text)) fail("managed step 7 still counts RGA's report as a step (\"… step left\")");
        if (r.band !== "Opens when your Month 1 report is ready" || r.side !== `about ${md(OPENS)}`) fail(`managed step 7's band reads "${r.band}" · "${r.side}"; approved "Opens when your Month 1 report is ready" · "about ${md(OPENS)}"`);
        if (r.pills.join(" · ") !== `Opens about ${md(OPENS)}`) fail(`managed step 7's pill is ${JSON.stringify(r.pills)}`);
        if (!/Your Month 1 report · RGA is building it It's posted to your portal, then the call opens/.test(r.text)) fail("managed step 7 doesn't say what happens to the report");
        if (!/Then you pick a time · a 30-minute call RGA walks you through the report and Month 2/.test(r.text)) fail("managed step 7 doesn't say what comes next (\"Then you pick a time\")");
        const foot = `Month 1 ends about ${md(END)}, 30 days from your kickoff on ${md(KICKOFF)}. Nothing here waits on you.`;
        if (!r.text.includes(foot)) fail(`managed step 7's foot isn't "${foot}"`);
      }
      // the wording per status (client_setup_status_protocol_v1): no "Waiting on Google" pill on any Setup step
      const pills = await h.page.evaluate(`(() => [...${LISTV}.querySelectorAll(".pm-step-row-head .pm-pill")].map((p) => p.textContent.trim()))()`);
      if (pills.some((p) => /waiting on google|waits on google/i.test(p))) fail(`a managed Setup step shows a Google-wait pill: ${pills.join(" · ")}`);
      // nothing overlaps or clips, at the three widths
      for (const w of [375, 768, 1280]) {
        await h.page.setViewport({ width: w, height: 1400 }); await tick(400);
        for (const id of ["m1.review.first_5", "m1.brand.youtube_setup", "m1.call.close"]) { await openRow(h, id); await tick(300); const bad = await layoutBad(h, id); if (bad.length) fail(`managed ${id} at ${w}px: ${bad.slice(0, 3).join(" · ")}`); }
        // the email's line is read whole on a phone (the mockup wraps it), never cut to "Oct 19 · This step …"
        await openRow(h, "m1.review.first_5"); await tick(300);
        const cut = await h.page.evaluate(`(() => { const s = ${LISTV}.querySelector('#step-row-m1\\\\.review\\\\.first_5 .pm-cs-msgs .s small'); return s ? s.scrollWidth > s.clientWidth + 1 : "gone"; })()`);
        if (cut) fail(`managed step 5's email line is cut off at ${w}px (${cut})`);
        // on a phone the band's date goes UNDER its words (the mockup at 375), never squeezing them to a word a line
        if (w === 375) { await openRow(h, "m1.call.close"); await tick(300); const u = await bandUnder(h, "m1.call.close"); if (u !== true) fail(`managed step 7's band at 375px keeps its date beside the words (${u})`); }
      }
      if (h.errs.length) fail(`managed: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }
  // 5 with their own message in the row → "Messages · 2" · 6 with no channel kept · 7 with a client step still open
  {
    const h = await open("managed", { thread: [openLetter, theirWord], tasks: baseTasks({ "m1.brand.social_profiles": social(null), "m1.access.analytics": { status: "pending" } }), waits: ["m1.call.close"] });
    try {
      await openRow(h, "m1.review.first_5"); await tick(600);
      const r5 = await rowFacts(h, "m1.review.first_5");
      if (!r5 || !/<b>Messages · 2<\/b>/.test(r5.html) || /Emails from RGA/.test(r5.html)) fail("managed step 5 with the client's own message in it isn't \"Messages · 2\" (it holds their words, not only RGA's emails)");
      await openRow(h, "m1.brand.youtube_setup"); await tick(500);
      const r6 = await rowFacts(h, "m1.brand.youtube_setup");
      if (!r6 || !/RGA publishes · on your YouTube channel and your website/.test(r6.text) || /@/.test(r6.text)) fail("managed step 6 with no channel kept doesn't read \"on your YouTube channel\"");
      await h.page.setViewport({ width: 375, height: 1400 }); await tick(400);
      const u6 = await bandUnder(h, "m1.brand.youtube_setup"); if (u6 !== true) fail(`managed step 6's band at 375px keeps "about 30 seconds each" beside the words (${u6})`);
      const bad6 = await layoutBad(h, "m1.brand.youtube_setup"); if (bad6.length) fail(`managed step 6 at 375px: ${bad6.slice(0, 3).join(" · ")}`);
      await h.page.setViewport({ width: 1280, height: 1400 }); await tick(300);
      await openRow(h, "m1.call.close"); await tick(500);
      const r7 = await rowFacts(h, "m1.call.close");
      if (!r7 || r7.band !== "Opens when your Month 1 report is ready · 1 of your steps left") fail(`managed step 7 with a client step open reads "${r7 && r7.band}"; approved "… · 1 of your steps left"`);
      if (!r7 || !/ · yours/.test(r7.text) || /Nothing here waits on you/.test(r7.text) || !/Your Month 1 report · RGA is building it/.test(r7.text)) fail("managed step 7 with a client step open doesn't list it as yours above the report, or still says nothing waits on them");
    } finally { await h.close(); }
  }
  // ── THE WAITS LIST DIDN'T LOAD (11-5): an unloaded answer is never drawn as a state, in either mode ───────────────────────────────
  for (const mode of ["managed", "self_serve"]) {
    const W = { answer: null, n: 0 };   // answer null = the server can't read the record (portal-step-waits says 502)
    const h = await open(mode, { waitsFn: () => { W.n++; return W.answer ? { ok: true, rga: W.answer } : { error: "Could not read the setup record." }; } });
    try {
      await openRow(h, "m1.review.first_5"); await tick(700);
      let r = await rowFacts(h, "m1.review.first_5");
      if (!r) fail(`${mode}, waits list failed: step 5 isn't drawn`);
      else {
        if (!r.text.includes("We couldn't check this step just now")) fail(`${mode}, waits list failed: step 5 doesn't say "We couldn't check this step just now" (${r.text.slice(0, 160)})`);
        if (r.pills.join(" · ") !== "Couldn't check") fail(`${mode}, waits list failed: step 5's pill is ${JSON.stringify(r.pills)}; it must be the one "Couldn't check"`);
        for (const [re, what] of [[/Can't start yet/i, "Can't start yet"], [/RGA is on it/i, "RGA is on it"], [/Writing your review request message/i, "Writing your review request message"], [/Waits on RGA/i, "Waits on RGA"], [/Your turn/i, "Your turn"]])
          if (re.test(r.text)) fail(`${mode}, waits list failed: step 5 claims "${what}" from an answer it never had`);
        if (/\bis-now\b/.test(r.cls)) fail(`${mode}, waits list failed: step 5 is drawn as the client's NEXT step`);
        if (!/\bcs-wait\b/.test(r.cls)) fail(`${mode}, waits list failed: step 5's disc isn't the grey couldn't-check state (${r.cls})`);
        if (/data-r5-send|data-r5-card/.test(r.html)) fail(`${mode}, waits list failed: step 5 still draws its customer form (an ask is a claim the step is theirs)`);
      }
      const nowIds = await h.page.evaluate(`(() => [...${LISTV}.querySelectorAll(".pm-step-row.is-now")].map((x) => x.id))()`);
      if (nowIds.includes("step-row-m1.review.first_5")) fail(`${mode}, waits list failed: step 5 is the "now" step`);
      // Try again while the server still can't answer → it asks again, says so in place, stops spinning
      const n0 = W.n;
      const press = () => h.page.evaluate(`(() => { const b = ${LISTV}.querySelector('#step-row-m1\\\\.review\\\\.first_5 [data-rga-waits-retry]'); if (!b) return false; b.click(); return true; })()`);
      if (!(await press())) { fail(`${mode}, waits list failed: step 5 has no Try again`); continue; }
      await tick(900);
      const still = await h.page.evaluate(`(() => { const row = ${LISTV}.querySelector('#step-row-m1\\\\.review\\\\.first_5'); const s = row && row.querySelector("[data-rga-waits-say]"), b = row && row.querySelector("[data-rga-waits-retry]");
        return { say: s && !s.hidden ? s.textContent : "", busy: !!b && b.classList.contains("is-busy") }; })()`);
      if (W.n <= n0) fail(`${mode}: step 5's Try again didn't ask the server again`);
      if (!/^Still couldn't check\./.test(still.say)) fail(`${mode}: step 5's Try again, still unanswered, doesn't say so ("${still.say}")`);
      if (still.busy) fail(`${mode}: step 5's Try again keeps spinning after the server answered with an error`);
      // Try again once the server answers (nothing waits) → the row draws that answer
      W.answer = [];
      if (!(await press())) { fail(`${mode}: step 5's Try again is gone after an unanswered try`); continue; }
      await tick(1200);
      await openRow(h, "m1.review.first_5"); await tick(500);
      r = await rowFacts(h, "m1.review.first_5");
      if (!r || /couldn't check/i.test(r.text) || r.pills[0] !== "Your turn") fail(`${mode}: after Try again got the answer, step 5 doesn't draw it (pills ${JSON.stringify(r && r.pills)}; ${(r && r.text || "").slice(0, 120)})`);
      if (h.errs.length) fail(`${mode}, waits list failed: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }
  // ── SELF-SERVE · NO MODE · COLUMN MISSING: today's words, and (with BEFORE) the same bytes ──────────────────
  for (const mode of ["self_serve", null, "column_missing"]) {
    const h = await open(mode);
    try {
      const html = await listHtml(h);
      if (/Emails from RGA|This step opened|in progress<\/small>|Not doing videos|Opens when your Month 1 report|data-r5-says|pm-cs-mail/.test(html || "")) fail(`${mode}: the managed step 5–7 wording reached a client who isn't managed`);
      { const want = [["Messages · 1", (x) => /<b>Messages · 1<\/b>/.test(x)], ["now", (x) => />now</.test(x)], [VIDEO_TITLE_SELF.self, (x) => x.includes(VIDEO_TITLE_SELF.self)], ["N step left", (x) => / steps? left<\/b>/.test(x)], ["the pale button", (x) => /data-r5-send(="")? disabled(="")?>Write the request</.test(x)]].filter(([, t]) => !t(html || ""));
        if (want.length) fail(`${mode}: today's step 5–7 words aren't drawn: missing ${want.map(([w]) => w).join(" · ")}`); }
      if (BEFORE && fs.existsSync(BEFORE)) {
        const b = await open(mode, { overrides: { "/portal/portal.js": BEFORE } });
        try { const x = await listHtml(b); if (x !== html) { let i = 0; while (x && html && x[i] === html[i]) i++; fail(`parity ${mode}: the list differs from before the build at char ${i}: before «${(x || "").slice(Math.max(0, i - 60), i + 80)}» now «${(html || "").slice(Math.max(0, i - 60), i + 80)}»`); } }
        finally { await b.close(); }
      }
    } finally { await h.close(); }
  }
  // the kickoff's time-passed words (protocol step 1): the managed copy has no dash; self-serve keeps its own
  { const P = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"), m = /pmManaged\(\) \? "If you missed it, no problem\. Pick another time and we'll send a new invite\." : "If you missed it, no problem — pick another time and we'll send a new invite\."/.exec(P);
    if (!m) fail("the kickoff's time-passed line for a managed client isn't \"If you missed it, no problem. Pick another time and we'll send a new invite.\" (with today's line kept for everyone else)"); }
} catch (e) {
  if (e instanceof HarnessUnavailable) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  console.error(`⚠️  INDETERMINATE — the gate threw: ${String(e.stack || e).slice(0, 400)}`); if (F.length) console.error("  failures so far:\n" + F.map((m) => "  · " + m).join("\n")); process.exit(2);
}
if (F.length) { console.error(`🔴 managed Setup steps 5–7 don't draw as approved: ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log(`✅ managed steps 5–7 draw as approved for a plumber and a client with no channel: step 5 counts the customer already asked, its button says what's missing, its row is "Emails from RGA"; step 6 is blue with its pill, "in progress", the channel named, Skip this posts the existing skip; step 7 waits on the Month 1 report, never "1 step left", with Month 1's end; nothing overlaps at 375/768/1280; self-serve, no mode and column-missing draw today's words${BEFORE ? " byte-for-byte as before the build" : " (parity not run: set MANAGED_PORTAL_BEFORE_JS)"}`);
