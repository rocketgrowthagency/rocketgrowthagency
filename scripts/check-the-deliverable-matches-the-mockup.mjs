#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE DELIVERABLE BLOCK AND ITS LIST MATCH THE APPROVED MOCKUP, PROPERTY BY PROPERTY
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Mockup: reports/mockups/admin_shot_list_deliverable_v2.html · approved by Chris 2026-10-07
//   "i want new dseign i think you can do better." → "approved."
//
// 🔑 The comparison set is DERIVED from the stylesheets, per element — `_mockup-diff.mjs` holds the
// whole argument and is shared with the run-strip and detection-block gates.
//
// 🔴 THE LIVE HALF READS PRODUCTION, so a mutation can only reach the mockup.
//
// Exit 0 identical · 1 a property differs · 2 could not compare

import fs from "node:fs";
import { firstClient, openAdminClient, settle } from "./_admin-session.mjs";
import { comparePairs } from "./_mockup-diff.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCK = `${SITE}/reports/mockups/admin_shot_list_deliverable_v2.html`;
if (!fs.existsSync(MOCK)) { console.error("⚠️  INDETERMINATE — the mockup file is gone"); process.exit(2); }

let puppeteer;
try { puppeteer = (await import("puppeteer")).default; }
catch { console.error("⚠️  INDETERMINATE — puppeteer unavailable; cannot compare renders"); process.exit(2); }

const client = await firstClient("id");
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const m = await b.newPage();
  await m.goto(`file://${MOCK}`, { waitUntil: "networkidle2", timeout: 45000 });

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
    await b.close(); process.exit(2);
  }
  const n = await settle(p, ".ob-dlv");
  // 🔑 2026-10-08 — ON A STEP WAITING ON THE CLIENT, "What this produced" is folded shut under the
  // approved "Our part · done" line (step31_waiting_on_client_v1.html). A person opens it to look;
  // so does the gate, before it measures. Measuring a closed fold reads layout that is not drawn.
  await p.evaluate(() => document.querySelectorAll("details.ob-out").forEach((d) => { d.open = true; }));
  if (!n) {
    console.error("⚠️  INDETERMINATE — no deliverable block rendered.");
    console.error("   A step only has one once its runner has drafted a list the server could parse;");
    console.error("   press Draft this for me on step 31, then re-run.");
    await b.close(); process.exit(2);
  }

  // 🔑 THE PANEL IS CLOSED BY DEFAULT, so open it before measuring what is inside it. Measuring a
  // hidden element returns the geometry of nothing. → feedback_unloaded_is_not_an_answer
  const opened = await p.evaluate(() => {
    const btn = document.querySelector("[data-dlv-open]");
    if (!btn) return false;
    btn.click();
    return !!document.querySelector("[data-dlv-panel]:not([hidden])");
  });
  if (!opened) {
    console.error("🔴 the list panel does not open — 'Open the list' is the only way to reach the twenty rows.");
    await b.close(); process.exit(1);
  }
  await settle(p, ".ob-sc");

  const pairs = [
    ["block",      ".dlv",        ".ob-dlv"],
    ["title",      ".dlv-t",      ".ob-dlv-t"],
    ["titleName",  ".dlv-t b",    ".ob-dlv-t > b"],
    ["titleSub",   ".dlv-t .sub", ".ob-dlv-t > .sub"],
    ["chipRow",    ".chips",      ".ob-dlv-chips"],
    ["chip",       ".chip",       ".ob-dchip"],
    ["chipCount",  ".chip i",     ".ob-dchip > i"],
    ["actions",    ".acts",       ".ob-dlv-acts"],
    ["panelTop",   ".ptop",       ".ob-dlv-ptop"],
    ["grid",       ".grid",       ".ob-dlv-grid"],
    ["shot",       ".sc",         ".ob-sc"],
    ["shotHeader", ".sc header",  ".ob-sc > header"],
    ["shotNum",    ".num",        ".ob-scn"],
    ["shotCat",    ".cat",        ".ob-scc"],
    ["shotDo",     ".sc .do",     ".ob-scd"],
    ["shotWhy",    ".sc .why",    ".ob-scw"],
  ];

  const { diffs, compared, inherited, missingInMock } = await comparePairs(m, p, pairs);
  if (missingInMock.length) {
    console.error(`⚠️  INDETERMINATE — the mockup no longer has: ${missingInMock.join(", ")}`);
    console.error("   The design moved under this gate; re-read the mockup and update the pairs.");
    await b.close(); process.exit(2);
  }

  // 🔴 AND THE CARD MUST NOT ALSO BE A DOCUMENT VIEWER. The whole point of this design is that the
  // 6,262-character draft stopped being rendered as prose inside a checklist row.
  const stillProse = await p.evaluate(() => {
    const dlv = document.querySelector(".ob-dlv");
    const fold = dlv && dlv.closest(".ob-out");
    return !!(fold && fold.querySelector(".ob-out-b"));
  });
  if (stillProse) diffs.push("the card renders the deliverable AND the old document body — the draft is on screen twice");

  const counts = await p.evaluate(() => ({
    shots: document.querySelectorAll(".ob-sc").length,
    chips: document.querySelectorAll(".ob-dchip").length,
  }));
  console.log(`  ${pairs.length} paired elements · ${compared} declared properties compared`);
  console.log(`  live: ${counts.shots} shot rows · ${counts.chips} group chips · ${n} deliverable block(s)`);
  console.log(`  ${inherited} property/element pairs are declared by neither side (inherited) and are not design decisions`);

  if (diffs.length) {
    console.error(`🔴 the live deliverable differs from its approved mockup in ${diffs.length} place(s):`);
    for (const d of diffs) console.error("   · " + d);
    await b.close(); process.exit(1);
  }
} finally { await b.close(); }
console.log("✅ the deliverable and its list match the approved mockup, property by property — 0 differences");
