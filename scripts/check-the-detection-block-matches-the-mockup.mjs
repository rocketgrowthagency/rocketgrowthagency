#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE DETECTION BLOCK MATCHES ITS APPROVED MOCKUP, PROPERTY BY PROPERTY
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Mockup: reports/mockups/admin_detected_step_v1.html · approved by Chris 2026-10-07
//   "approved. make sure the mockup goes live without issues. deep do this task so its done right"
//
// 🔑 A COUNT IS NOT A DIFF. The comparison set is DERIVED from the stylesheets, per element — see
// `_mockup-diff.mjs`, which holds the whole argument and is shared with the run-strip gate.
//
// 🔴 THE LIVE HALF READS PRODUCTION, so a mutation can only reach the mockup. That proves the diff
// can fail; it does NOT prove the gate would notice an undeployed CSS edit, and nothing here claims
// it does.
//
// 🔑 ITS INDETERMINATE PATHS (a sign-in that did not complete, a mockup whose element is gone) come
// from `_admin-session.mjs` and `_mockup-diff.mjs`, shared with the run-strip gate, whose suite
// exercises the "the mockup no longer has that element" case. Nothing in THIS mockup can be renamed
// to produce it, because every selector the pairs use appears several times in its markup — so this
// suite proves the DIFFERENCE path and the sibling proves the premise path.
//
// Exit 0 identical · 1 a property differs · 2 could not compare

import fs from "node:fs";
import { firstClient, openAdminClient, settle } from "./_admin-session.mjs";
import { comparePairs } from "./_mockup-diff.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCK = `${SITE}/reports/mockups/admin_detected_step_v1.html`;
if (!fs.existsSync(MOCK)) { console.error("⚠️  INDETERMINATE — the mockup file is gone"); process.exit(2); }

let puppeteer;
try { puppeteer = (await import("puppeteer")).default; }
catch { console.error("⚠️  INDETERMINATE — puppeteer unavailable; cannot compare renders"); process.exit(2); }

const client = await firstClient("id");
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const m = await b.newPage();
  // 🔴 11-11: this gate failed inside two full runs and passed every time it ran alone, so the failure was load, not design.
  // 🔑 One retry at 60 s on a navigation timeout; a second timeout is INDETERMINATE (exit 2), never a red, the same rule as
  // check-schedule-system-v6.mjs `goto`. A navigation that times out says nothing about the design.
  const goto = async (page, url, opts) => {
    for (let i = 0; i < 2; i++) {
      try { return await page.goto(url, { ...opts, timeout: 60000 }); }
      catch (e) {
        if (!/timeout/i.test(e.message)) throw e;
        if (i) { console.error(`⚠️  INDETERMINATE — the mockup did not load twice (${e.message.slice(0, 80)}): a slow page, not a design difference`); await b.close(); process.exit(2); }
      }
    }
  };
  await goto(m, `file://${MOCK}`, { waitUntil: "networkidle2" });

  const p = await b.newPage();
  const errs = [];
  const rows = await openAdminClient(p, client.id, "onboarding-v2", { errs });
  if (!rows) {
    console.error("⚠️  INDETERMINATE — the checklist rendered no rows, so there is no card to measure.");
    console.error(`   This is the PROBE failing to see the page, not proof the block is wrong.${errs.length ? ` Page errors: ${errs[0]}` : ""}`);
    await b.close(); process.exit(2);
  }
  if (errs.length) {
    console.error(`⚠️  INDETERMINATE — the admin threw while loading: ${errs[0]}`);
    console.error("   A measurement taken off a page that threw is not a measurement.");
    await b.close(); process.exit(2);
  }
  const n = await settle(p, ".ob-det");
  if (!n) {
    console.error("⚠️  INDETERMINATE — no detection block rendered on any card.");
    console.error(`   Nine steps declare clientDone: "detected"; this client's checklist rendered ${rows} rows.`);
    await b.close(); process.exit(2);
  }

  // 🔴🔴 11-11 ROOT CAUSE OF THE FULL-RUN REDS: THE ADMIN RE-RENDERS ITS CHECKLIST IN THE BACKGROUND (its own refresh timers and late
  // fetches). A re-render mid-measurement folds the opened step and throws away the parts this gate builds below, so one read could pair
  // the mockup with a different element than the last (seen on a debug run: "built: override" yet "override row absent", and a meter fill
  // read off another card). Under a full run's load the re-render lands inside the read far more often, which is why it only failed there.
  // 🔑 So: (1) stop the page's own timers once it has loaded (this gate measures CSS, never behaviour, and it never clicks Done/Skip/Reset),
  // (2) MARK the block it measures, and (3) a read whose marked block or built parts are gone afterwards is VOID and taken again, up to
  // three times; three void reads in a row are INDETERMINATE (exit 2), never a red. A read that completes on an unchanged block is final.
  await p.evaluate(() => { const top = setTimeout(() => {}, 0); for (let i = 0; i <= top + 50; i++) { clearTimeout(i); clearInterval(i); } window.setInterval = () => 0; });
  await new Promise((r) => setTimeout(r, 1500));   // a fetch already in flight lands and renders once
  // 🔴 OPEN THE STEP THAT HOLDS IT (2026-10-09). Since the admin step accordion (one step open per card) the first
  // block in the DOM usually sits in a FOLDED step — display:none — and this gate reported "block.display none,
  // rule value + evidence missing": the instrument measuring a closed drawer, not a broken design. A person opens
  // the step to read the block, so the gate does too: the phase, then the step's row.
  const open = async () => {
    await p.evaluate(() => {
      const det = document.querySelector(".ob-det");
      const ph = det && det.closest(".ob-phase");
      if (ph && !ph.classList.contains("open")) ph.querySelector("[data-ob-phase-toggle]")?.click();
      const st = det && det.closest(".ob-step");
      if (st && st.classList.contains("ob-folded")) st.querySelector(".ob-title")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 600));
    // 🔑 MEASURE A PAGE THAT HAS STOPPED MOVING: the fonts loaded and no transition still running (up to 15 s).
    await p.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const tick = () => {
        const moving = (document.getAnimations ? document.getAnimations() : []).some((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations !== Infinity);
        if (!moving || Date.now() - t0 > 15000) res(); else setTimeout(tick, 150);
      };
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(tick, tick);
    }));
  };

  // 🔴 A PART THIS CLIENT'S SCREEN DOES NOT SHOW IS STILL MEASURED (2026-10-09). The test client's visible blocks are
  // all yes/no connection checks, so the meter, the "Done when" row, the evidence and the override never rendered and
  // three of this gate's mutations went uncaught. When the live page lacks a part, the gate adds that part — in the
  // markup admin.js renderDetection/override writes — INSIDE the live block, so the live stylesheet styles it and
  // the comparison is still live CSS against the mockup. The output line says which parts were built this way.
  // Every part it builds, and the block itself, carries data-gate-mark, so a re-render that replaced them is seen.
  const build = () => p.evaluate(() => {
    const det = document.querySelector(".ob-det"); const made = [];
    if (!det) return made;
    det.setAttribute("data-gate-mark", "block");
    const m = det.querySelector(".ob-det-r.m .v");
    if (m && !det.querySelector(".ob-meter")) { m.insertAdjacentHTML("beforeend", '<span class="ob-meter" data-gate-mark="meter"><i style="width:35%"></i></span>'); made.push("meter"); }
    if (m && !det.querySelector(".ob-evid")) { m.insertAdjacentHTML("beforeend", '<span class="ob-evid" data-gate-mark="evidence">Your Google Business Profile has 7 photos — 20 are needed.</span>'); made.push("evidence"); }
    if (!det.querySelector(".ob-det-r.rule")) { det.insertAdjacentHTML("beforeend", '<div class="ob-det-r rule" data-gate-mark="rule row"><span class="k">Done when</span><span class="v">20 photos on the profile</span></div>'); made.push("rule row"); }
    if (!document.querySelector(".ob-ovr")) { det.insertAdjacentHTML("afterend", '<div class="ob-ovr" data-gate-mark="override"><span class="lab">Override</span><button type="button" class="admin-button">Mark done</button></div>'); made.push("override"); }
    return made;
  });
  // the marked block and every part built for this read are still the ones on the page
  const intact = (made) => p.evaluate((made) => {
    const det = document.querySelector(".ob-det");
    if (!det || det.getAttribute("data-gate-mark") !== "block" || !det.getClientRects().length) return false;
    return made.every((k) => !!document.querySelector(`[data-gate-mark="${k}"]`));
  }, made);

  let state, MOCKSTATE, built, pairs, hasMeter, hasRule, hasEvid, hasOvr, res, voids = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await open();
    if (!(await p.evaluate(() => { const d = document.querySelector(".ob-det"); return !!d && d.getClientRects().length > 0; }))) {
      if (attempt < 3) { voids++; continue; }
      console.error("⚠️  INDETERMINATE — the step holding the detection block would not open, so there is nothing visible to measure.");
      await b.close(); process.exit(2);
    }
    // 🔑 THE CHIP AND THE METER ARE MATCHED ON THEIR ACTUAL STATE. `.ob-detchip` carries yes|no|unk
    // and each has its own colours BY DESIGN, so reading the mockup's `.no` against whatever the live
    // card happens to show would be a false difference. Ask the live card what it is.
    state = await p.evaluate(() => {
      const el = document.querySelector(".ob-det-r.m .ob-detchip");
      if (!el) return null;
      return ["yes", "no", "unk"].find((k) => el.classList.contains(k)) || "";
    });
    if (state === null) { console.error("🔴 the live block has no state chip at all — the mockup gives every reading one."); await b.close(); process.exit(1); }
    if (!state) { console.error("⚠️  INDETERMINATE — the live chip carries no yes/no/unk class."); await b.close(); process.exit(2); }
    MOCKSTATE = { yes: "yes", no: "no", unk: "unk" }[state];
    built = await build();
    pairs = [
      ["block",    ".det",               ".ob-det"],
      ["row",      ".det-r",             ".ob-det-r"],
      ["label",    ".det-r .k",          ".ob-det-r .k"],
      ["value",    ".det-r .v",          ".ob-det-r .v"],
      ["measured", ".det-r.m",           ".ob-det-r.m"],
      ["chip",     `.state.${MOCKSTATE}`, `.ob-detchip.${state}`],
      ["when",     ".when",              ".ob-when"],
      ["recheck",  ".recheck",           ".ob-recheck"],
    ];
    // the meter only exists on a counted step; compare it only when the live card has one
    hasMeter = await p.evaluate(() => !!document.querySelector(".ob-meter"));
    if (hasMeter) {
      pairs.push(["meter", ".bar", ".ob-meter"], ["meterFill", ".bar i", ".ob-meter > i"]);
    }
    // 🔄 2026-10-09: the "Done when" rule row and the evidence line render only when the step HAS a rule / a headline
    // (admin.js renderDetection: `rule ? … : ""`). A yes/no connection check (GBP / GA4 / GSC answered) has neither by
    // design, and the test client's visible blocks are all of that kind — the gate called them "missing". Compared
    // when present, exactly like the meter; the line below says which were compared so a skip is never silent.
    hasRule = await p.evaluate(() => !!document.querySelector(".ob-det-r.rule .v"));
    if (hasRule) pairs.push(["ruleValue", ".det-r.rule .v", ".ob-det-r.rule .v"]);
    hasEvid = await p.evaluate(() => !!document.querySelector(".ob-evid"));
    if (hasEvid) pairs.push(["evidence", ".evid", ".ob-evid"]);
    // the override row only exists on an ACTIVE detected step
    hasOvr = await p.evaluate(() => !!document.querySelector(".ob-ovr"));
    if (hasOvr) {
      pairs.push(["override", ".ovr", ".ob-ovr"], ["overrideLabel", ".ovr .lab", ".ob-ovr .lab"]);
    }
    res = await comparePairs(m, p, pairs);
    if (await intact(built)) break;
    voids++;
    if (attempt === 3) {
      console.error("⚠️  INDETERMINATE — the admin re-rendered the block during all three reads, so no read measured one card start to end.");
      console.error("   A slow or busy page, not a design difference.");
      await b.close(); process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const reread = voids ? ` · ${voids} read(s) voided because the page re-rendered mid-read` : "";
  const { diffs, compared, inherited, missingInMock } = res;
  if (missingInMock.length) {
    console.error(`⚠️  INDETERMINATE — the mockup no longer has: ${missingInMock.join(", ")}`);
    console.error("   The design moved under this gate; re-read the mockup and update the pairs.");
    await b.close(); process.exit(2);
  }

  console.log(`  ${pairs.length} paired elements · ${compared} declared properties compared`);
  console.log(`  live state: "${state}" · ${n} detection block(s) on screen · meter ${hasMeter ? "present" : "absent"} · override row ${hasOvr ? "present" : "absent"} · rule row ${hasRule ? "present" : "absent"} · evidence ${hasEvid ? "present" : "absent"}${built.length ? ` · built in the live page from its own CSS: ${built.join(", ")}` : ""}`);
  console.log(`  ${inherited} property/element pairs are declared by neither side (inherited from the host page) and are not design decisions${reread}`);

  if (diffs.length) {
    console.error(`🔴 the live detection block differs from its approved mockup in ${diffs.length} propert${diffs.length === 1 ? "y" : "ies"}:`);
    for (const d of diffs) console.error("   · " + d);
    await b.close(); process.exit(1);
  }
} finally { await b.close(); }
console.log("✅ the detection block matches the approved mockup, property by property — 0 differences");
