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
    console.error("   A measurement taken off a page that threw is not a measurement.");
    await b.close(); process.exit(2);
  }
  const n = await settle(p, ".ob-det");
  if (!n) {
    console.error("⚠️  INDETERMINATE — no detection block rendered on any card.");
    console.error(`   Nine steps declare clientDone: "detected"; this client's checklist rendered ${rows} rows.`);
    await b.close(); process.exit(2);
  }

  // 🔑 THE CHIP AND THE METER ARE MATCHED ON THEIR ACTUAL STATE. `.ob-detchip` carries yes|no|unk
  // and each has its own colours BY DESIGN, so reading the mockup's `.no` against whatever the live
  // card happens to show would be a false difference. Ask the live card what it is.
  const state = await p.evaluate(() => {
    const el = document.querySelector(".ob-det-r.m .ob-detchip");
    if (!el) return null;
    return ["yes", "no", "unk"].find((k) => el.classList.contains(k)) || "";
  });
  if (state === null) { console.error("🔴 the live block has no state chip at all — the mockup gives every reading one."); await b.close(); process.exit(1); }
  if (!state) { console.error("⚠️  INDETERMINATE — the live chip carries no yes/no/unk class."); await b.close(); process.exit(2); }
  const MOCKSTATE = { yes: "yes", no: "no", unk: "unk" }[state];

  const pairs = [
    ["block",    ".det",               ".ob-det"],
    ["row",      ".det-r",             ".ob-det-r"],
    ["label",    ".det-r .k",          ".ob-det-r .k"],
    ["value",    ".det-r .v",          ".ob-det-r .v"],
    ["measured", ".det-r.m",           ".ob-det-r.m"],
    ["ruleValue",".det-r.rule .v",     ".ob-det-r.rule .v"],
    ["chip",     `.state.${MOCKSTATE}`, `.ob-detchip.${state}`],
    ["evidence", ".evid",              ".ob-evid"],
    ["when",     ".when",              ".ob-when"],
    ["recheck",  ".recheck",           ".ob-recheck"],
  ];
  // the meter only exists on a counted step; compare it only when the live card has one
  const hasMeter = await p.evaluate(() => !!document.querySelector(".ob-meter"));
  if (hasMeter) {
    pairs.push(["meter", ".bar", ".ob-meter"], ["meterFill", ".bar i", ".ob-meter > i"]);
  }
  // the override row only exists on an ACTIVE detected step
  const hasOvr = await p.evaluate(() => !!document.querySelector(".ob-ovr"));
  if (hasOvr) {
    pairs.push(["override", ".ovr", ".ob-ovr"], ["overrideLabel", ".ovr .lab", ".ob-ovr .lab"]);
  }

  const { diffs, compared, inherited, missingInMock } = await comparePairs(m, p, pairs);
  if (missingInMock.length) {
    console.error(`⚠️  INDETERMINATE — the mockup no longer has: ${missingInMock.join(", ")}`);
    console.error("   The design moved under this gate; re-read the mockup and update the pairs.");
    await b.close(); process.exit(2);
  }

  console.log(`  ${pairs.length} paired elements · ${compared} declared properties compared`);
  console.log(`  live state: "${state}" · ${n} detection block(s) on screen · meter ${hasMeter ? "present" : "absent"} · override row ${hasOvr ? "present" : "absent"}`);
  console.log(`  ${inherited} property/element pairs are declared by neither side (inherited from the host page) and are not design decisions`);

  if (diffs.length) {
    console.error(`🔴 the live detection block differs from its approved mockup in ${diffs.length} propert${diffs.length === 1 ? "y" : "ies"}:`);
    for (const d of diffs) console.error("   · " + d);
    await b.close(); process.exit(1);
  }
} finally { await b.close(); }
console.log("✅ the detection block matches the approved mockup, property by property — 0 differences");
