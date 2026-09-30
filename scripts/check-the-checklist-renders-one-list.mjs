#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE ONBOARDING CHECKLIST RENDERS ALL 61 STEPS, ONE PILL EACH, AND THE SWITCH FILTERS THEM
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `check-the-checklist-is-one-list.mjs` reads the SOURCE. It cannot see a blank phase, a pill that
 * never reaches the DOM, or a view switch that renders and does nothing — the class of defect that
 * has cost the most here:
 *
 *   · the call console was built correctly and could NEVER render (it lived in the one branch the
 *     step was never in)                                    → feedback_correct_is_not_the_same_as_happening
 *   · `clk.phase === "after"` was computed and never read    → feedback_a_capability_nobody_calls_looks_finished
 *   · the admin was blank for a day behind code that parsed  → project_admin_was_blank_for_a_day
 *
 * So this one OPENS THE TAB, signed in, and counts what is on the screen.
 *
 * 🔴🔴 READ-ONLY, DELIBERATELY. It opens a REAL client. It clicks the view switch (pure client-side
 * re-render) and it clicks phases open. It NEVER touches Done / Skip / Reset — those write to a live
 * client's record, and an audit that can write is a user.
 * → feedback_an_audit_that_can_write_is_a_user · feedback_a_write_test_on_a_live_client_is_a_user
 *
 * WHAT IS PINNED, ON SCREEN:
 *   1. Every step in the playbook renders as a row — the page's count equals the SOP's.
 *   2. Every row wears exactly one kind pill.
 *   3. Each view filters to the rows wearing its pill, and Everything brings them all back.
 *   4. The head's "N of M done" agrees with the rows the filter left, in every view.
 *   5. The client's rows carry the override the deleted card used to hold.
 *
 * Exit 0 pass · 1 a real rendering defect · 2 could not sign in / no browser.
 */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "hello@rocketgrowthagency.com";
const SITE = "https://www.rocketgrowthagency.com";

import fs from "node:fs";
const SITE_DIR = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

console.log("── the onboarding checklist renders one list ──");

if (!SUPA_URL || !SUPA_KEY) { console.log("  ⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(2); }

let m1;
try { m1 = JSON.parse(fs.readFileSync(SITE_DIR + "/data/playbooks/playbooks.json", "utf8")).month1; }
catch (e) { console.log(`  ⚠️  playbooks.json unreadable: ${e.message}`); process.exit(2); }

// 🔑 The EXPECTED numbers come from the SOP, never from a constant here. A gate that restates the
// count it is checking goes green on the day both are wrong together. → feedback_no_hardcoded_stats
const clientFacing = (s) => !s.ongoing && (s.clientBucket === "supply" || s.clientBucket === "act") && !!s.clientLabel;
const EXPECT = { total: m1.length, client: 0, auto: 0, you: 0 };
m1.forEach((s) => { EXPECT[clientFacing(s) ? "client" : s.type === "auto" ? "auto" : "you"]++; });

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch { console.log("  ⚠️  puppeteer unavailable — NOT reporting healthy."); process.exit(2); }

let clientId;
try {
  const r = await fetch(`${SUPA_URL}/rest/v1/clients?archived_at=is.null&select=id&limit=1`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  clientId = (await r.json())?.[0]?.id;
  if (!clientId) { console.log("  ⚠️  no active client to open."); process.exit(2); }
} catch (e) { console.log(`  ⚠️  could not read a client: ${e.message}`); process.exit(2); }

let link;
try {
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
  });
  const j = await r.json();
  link = j.action_link || j.properties?.action_link;
  if (!link) { console.log(`  ⚠️  no sign-in link: ${JSON.stringify(j).slice(0, 140)}`); process.exit(2); }
} catch (e) { console.log(`  ⚠️  could not mint a sign-in link: ${e.message}`); process.exit(2); }

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let fails = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fails++; };
try {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 140)));

  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=onboarding-v2`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 14000));

  // 🔑 OPEN EVERY PHASE BEFORE COUNTING. Nine of ten are collapsed by design, and their rows are
  // `hidden`, not absent — counting without opening them would report 6 of 61 and call the feature
  // broken. → feedback_unloaded_is_not_an_answer
  const openAll = async () => page.evaluate(() => {
    document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((b) => b.click());
    document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((b) => b.click());
  });
  const survey = async () => page.evaluate(() => {
    const host = document.getElementById("onboardingChecklistHost");
    if (!host) return null;
    const rows = [...host.querySelectorAll(".ob-step")];
    const kinds = {};
    let noPill = 0, twoPills = 0;
    rows.forEach((r) => {
      const ps = r.querySelectorAll(".ob-row .ob-kind");
      if (!ps.length) { noPill++; return; }
      if (ps.length > 1) twoPills++;
      const c = [...ps[0].classList].find((x) => x !== "ob-kind") || "?";
      kinds[c] = (kinds[c] || 0) + 1;
    });
    const pill = (host.querySelector(".ob-pill")?.textContent || "").trim();
    const m = pill.match(/(\d+)\s+of\s+(\d+)\s+done/);
    return {
      rows: rows.length,
      kinds, noPill, twoPills,
      phases: host.querySelectorAll(".ob-phase").length,
      headDone: m ? +m[1] : null,
      headTotal: m ? +m[2] : null,
      doneRows: host.querySelectorAll(".ob-step.done, .ob-step.declined").length,
      overrideOnClientRows: rows.filter((r) => r.querySelector(".ob-row .ob-kind.cl") && r.querySelector("[data-task-set]")).length,
      clientRows: rows.filter((r) => r.querySelector(".ob-row .ob-kind.cl")).length,
      note: (host.querySelector(".ob-viewnote")?.textContent || "").replace(/\s+/g, " ").trim(),
      views: [...host.querySelectorAll(".ob-views [data-ob-view]")].map((b) => b.dataset.obView),
    };
  });

  await openAll();
  const all = await survey();
  if (!all) { console.log("  ⚠️  #onboardingChecklistHost is not on the page — the probe is wrong."); await browser.close(); process.exit(2); }

  // ── 1 · every step in the SOP is a row on the screen ─────────────────────────────────────────
  if (all.rows !== EXPECT.total) {
    bad(`the checklist renders ${all.rows} rows; the SOP has ${EXPECT.total}. `
      + (all.rows === EXPECT.total - EXPECT.client
        ? "That is exactly the client's steps missing — the rgaSide() filter is back and they have nowhere to live but a second card."
        : "Steps are being dropped between the playbook and the page."));
  } else console.log(`  ✅ all ${all.rows} SOP steps render as rows, in ${all.phases} phases`);

  // ── 2 · one pill each ────────────────────────────────────────────────────────────────────────
  if (all.noPill || all.twoPills) {
    bad(`${all.noPill} row(s) carry no kind pill and ${all.twoPills} carry more than one. Every row `
      + "must say whose move it is, exactly once — two pills stating one fact 61 times is what this replaced.");
  } else console.log("  ✅ every row wears exactly one kind pill");

  for (const [k, cls] of [["you", "you"], ["client", "cl"], ["auto", "fl"]]) {
    if ((all.kinds[cls] || 0) !== EXPECT[k]) {
      bad(`the page shows ${all.kinds[cls] || 0} "${k}" rows; the SOP has ${EXPECT[k]}. The pill and `
        + "the data disagree about who owns the work.");
    }
  }
  if (!fails) console.log(`  ✅ the pills match the SOP — ${EXPECT.you} you · ${EXPECT.client} client · ${EXPECT.auto} runs itself`);

  // ── 3 · the client's rows carry the override the deleted card held ──────────────────────────
  //    Done rows do not: ↩ Undo already reopens them by the same write.
  if (all.clientRows && all.overrideOnClientRows === 0) {
    bad(`none of the ${all.clientRows} client rows offers Done/Skip/Reset. The override was moved out `
      + "of its own card onto these rows; if it is not here it exists nowhere.");
  } else console.log(`  ✅ ${all.overrideOnClientRows} of ${all.clientRows} client rows carry the override (done rows use ↩ Undo)`);

  // ── 4 · the head agrees with the rows below it ───────────────────────────────────────────────
  if (all.headTotal !== all.rows || all.headDone !== all.doneRows) {
    bad(`the head says "${all.headDone} of ${all.headTotal} done" over ${all.doneRows} done rows of `
      + `${all.rows}. A count that describes a different set from the one on screen is the defect `
      + "that produced 27/59 above 26 of 59.");
  } else console.log(`  ✅ the head's "${all.headDone} of ${all.headTotal} done" counts the rows on screen`);

  // ── 5 · the switch filters, and every view comes back ────────────────────────────────────────
  const KINDCLS = { you: "you", client: "cl", auto: "fl" };
  for (const v of ["you", "client", "auto"]) {
    if (!all.views.includes(v)) { bad(`the view switch offers no "${v}" view.`); continue; }
    await page.evaluate((k) => document.querySelector(`.ob-views [data-ob-view="${k}"]`).click(), v);
    await new Promise((r) => setTimeout(r, 900));
    await openAll();
    const s = await survey();
    const own = s.kinds[KINDCLS[v]] || 0;
    const foreign = Object.entries(s.kinds).filter(([c]) => c !== KINDCLS[v]).reduce((a, [, n]) => a + n, 0);
    if (s.rows !== EXPECT[v] || foreign) {
      bad(`the "${v}" view shows ${s.rows} rows (${foreign} of them wearing another pill); it should `
        + `show exactly the ${EXPECT[v]} rows that wear its own. The switch and the pill are supposed `
        + "to be one function.");
    } else if (s.headTotal !== s.rows || s.headDone !== s.doneRows) {
      bad(`the "${v}" view's head says "${s.headDone} of ${s.headTotal} done" over ${s.doneRows} of `
        + `${s.rows} rows — the counts still describe the unfiltered list.`);
    } else if (!/of\s+\d+\s+steps/.test(s.note) || !/everything/i.test(s.note)) {
      bad(`the "${v}" view does not name the total it filtered from and offer the way back. Without `
        + `that, "Showing ${s.rows}" reads as a list that lost ${EXPECT.total - s.rows} steps.`);
    } else console.log(`  ✅ "${v}" filters to its own ${s.rows} rows, counts them, and names the way back`);
  }

  await page.evaluate(() => document.querySelector('.ob-views [data-ob-view="all"]').click());
  await new Promise((r) => setTimeout(r, 900));
  await openAll();
  const back = await survey();
  if (back.rows !== EXPECT.total) {
    bad(`"Everything" comes back with ${back.rows} of ${EXPECT.total} rows — a filter that cannot be `
      + "undone has deleted the list as far as the operator is concerned.");
  } else console.log(`  ✅ "Everything" restores all ${back.rows} rows`);

  if (errs.length) bad(`the page threw while the checklist was being worked: ${[...new Set(errs)].slice(0, 2).join(" | ")}`);
  else console.log("  ✅ nothing threw across every view and every phase opened");
} finally {
  // 🔴 A CLEAN PASS MUST NOT EXIT NON-ZERO. Closing the browser occasionally throws after every
  // check has already printed ✅, and the throw became the exit code — a gate reported as failing
  // on a run where nothing failed. Teardown is not a finding.
  // → feedback_the_harness_i_wrote_to_check_my_work_can_lie
  await browser.close().catch(() => {});
}

if (fails) { console.log(`\n🔴 FAIL — ${fails} rendering defect(s) in the one list.`); process.exit(1); }
console.log("\n✅ the checklist renders one list: every step, one pill each, the switch filtering it.");

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — each must turn this gate red (verify against a local build, never on prod):
 *   1. restore rgaSide()                              → rows = 59, and the message names the cause
 *   2. render both pills again                        → twoPills > 0
 *   3. drop clientOverride from the rows              → 0 of 16 client rows carry it
 *   4. leave the head pill on the unfiltered counts   → head disagrees inside a view
 *   5. filter the rows but not the phase counts       → same
 *   6. remove the filter note                         → the view is red for hiding without saying so
 *   7. make "Everything" keep the last filter         → the restore check
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */
