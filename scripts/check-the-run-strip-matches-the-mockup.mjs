#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE RUN STRIP MATCHES ITS APPROVED MOCKUP, PROPERTY BY PROPERTY
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 Chris, 2026-10-07: *"i told you before that you must spend the time to get the mockup live and
// correct first time and not the back and forth."* He had told me — the method is written down in
// feedback_how_design_work_gets_done_first_time, and step 4 of it is this diff. Skipping it is what
// caused three rounds of "still not like the mockup" on 10-01.
//
// 🔑 A COUNT IS NOT A DIFF. Rendering the strip and checking it has three rows proves nothing about
// surface, size, colour or spacing. This reads getComputedStyle on BOTH renders and prints every
// property that differs.
//
// Mockup: reports/mockups/admin_every_run_is_kept_v1.html  ·  published at claude.ai/artifact/AuaDVjHLNes246MNYFjoat
//
// 🔴🔴 THIS GATE ACCUSED A CORRECT STRIP TWICE BEFORE IT EVER COMPARED ANYTHING (2026-10-07).
// It signed into the ADMIN with the CLIENT PORTAL identity, so the page threw inside `init` and
// rendered nothing; then, with that fixed, it gave the checklist 15s to render where the admin needs
// up to 30. Both times it printed *"the run strip did not render on the live card"* about a strip
// that renders three rows perfectly. Sign-in and settling now come from `_admin-session.mjs`, which
// is the one place those lessons live. → feedback_fix_the_class_not_the_instance
//
// Exit 0 identical · 1 a property differs · 2 could not compare

import fs from "node:fs";
import { firstClient, openAdminClient, settle } from "./_admin-session.mjs";
// 🔑 THE COMPARISON MACHINERY IS SHARED WITH check-the-detection-block-matches-the-mockup.
// It held a blind spot BOTH gates had: a CSS shorthand is enumerated as its longhands, so
// "borderRadius" was never actually compared. One copy, fixed once.
// → feedback_fix_the_class_not_the_instance
import { PROPS, comparePairs } from "./_mockup-diff.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCK = `${SITE}/reports/mockups/admin_every_run_is_kept_v1.html`;

if (!fs.existsSync(MOCK)) { console.error("⚠️  INDETERMINATE — the mockup file is gone"); process.exit(2); }

let puppeteer;
try { puppeteer = (await import("puppeteer")).default; }
catch { console.error("⚠️  INDETERMINATE — puppeteer unavailable; cannot compare renders"); process.exit(2); }

const client = await firstClient("id");

const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const diffs = [];
try {
  // ── the mockup ──────────────────────────────────────────────────────────────────────────
  // 🔑 ONE TABLE, BOTH SELECTORS. Two parallel object literals let a pair drift apart silently —
  // the live `chip` was read as `.ob-hrun .delta` against the mockup's `.delta.up`, so a FLAT chip
  // live was being compared with an UP chip in the mockup and only the skipped colours hid it.
  const PAIRS = [
    ["strip", ".runs",        ".ob-history"],
    ["head",  ".runs-h b",    ".ob-history-h b"],
    ["count", ".runs-h .c",   ".ob-history-h .c"],
    ["row",   ".run",         ".ob-hrun"],
    ["when",  ".run .when",   ".ob-hrun .when"],
    ["what",  ".run .what",   ".ob-hrun .what"],
    ["cur",   ".run.cur .when", ".ob-hrun.cur .when"],
  ];

  const m = await b.newPage();
  await m.goto(`file://${MOCK}`, { waitUntil: "networkidle2", timeout: 45000 });

  // ── the live card ───────────────────────────────────────────────────────────────────────
  const p = await b.newPage();
  const errs = [];
  // 🔑 SIGN-IN, NAVIGATION, SETTLING AND THE PHASE FOLDS ALL COME FROM ONE PLACE. Exits 2 itself
  // if it cannot get there — a sign-in it could not complete is never a design difference.
  const rows = await openAdminClient(p, client.id, "onboarding-v2", { errs });
  if (!rows) {
    console.error("⚠️  INDETERMINATE — the checklist rendered no rows, so there is no card to measure.");
    console.error(`   This is the PROBE failing to see the page, not proof the strip is wrong.${errs.length ? ` Page errors: ${errs[0]}` : ""}`);
    await b.close(); process.exit(2);
  }
  if (errs.length) {
    console.error(`⚠️  INDETERMINATE — the admin threw while loading: ${errs[0]}`);
    console.error("   A measurement taken off a page that threw is not a measurement.");
    await b.close(); process.exit(2);
  }
  // 🔴 WAIT FOR THE STRIP, NOT A CLOCK — the lesson from the numbering probe, which reported a
  // healthy admin as empty because it slept a fixed 2.5s. → project_the_numbering_probe_was_flaky
  const n = await settle(p, ".ob-hrun");
  // 🔑 2026-10-08 — ON A STEP WAITING ON THE CLIENT, "What this produced" is folded shut under the
  // approved "Our part · done" line (step31_waiting_on_client_v1.html). A person opens it to look;
  // so does the gate, before it measures. Measuring a closed fold reads layout that is not drawn.
  await p.evaluate(() => document.querySelectorAll("details.ob-out").forEach((d) => { d.open = true; }));
  if (!n) {
    console.error("⚠️  INDETERMINATE — no run-history row rendered on any card.");
    console.error(`   A step needs TWO runs before the strip appears, by design; this client's checklist rendered ${rows} rows.`);
    await b.close(); process.exit(2);
  }
  // 🔑 THE CHIP IS MATCHED ON ITS ACTUAL STATE. `.delta` carries up | flat | down and each has its
  // own colours by design. Reading the mockup's `.up` against whatever the live row happens to show
  // would be a false difference, so ask the live chip what it is and compare like with like.
  const chipState = await p.evaluate(() => {
    const el = document.querySelector(".ob-hrun .delta");
    if (!el) return null;
    return ["up", "flat", "down"].find((k) => el.classList.contains(k)) || "";
  });
  if (chipState === null) {
    console.error("🔴 the live run rows carry no change chip at all — the mockup gives every run one.");
    await b.close(); process.exit(1);
  }
  if (!chipState) {
    console.error("⚠️  INDETERMINATE — the live chip has no up/flat/down class, so there is nothing to compare it with.");
    await b.close(); process.exit(2);
  }
  PAIRS.push(["chip", `.run .delta.${chipState}`, `.ob-hrun .delta.${chipState}`]);

  const { diffs: d2, compared, inherited, missingInMock } = await comparePairs(m, p, PAIRS);
  diffs.push(...d2);
  if (missingInMock.length) {
    console.error(`⚠️  INDETERMINATE — the mockup no longer has: ${missingInMock.join(", ")}`);
    console.error("   The design moved under this gate; re-read the mockup and update the pairs.");
    await b.close(); process.exit(2);
  }
  console.log(`  ${PAIRS.length} paired elements · ${compared} declared properties compared on ${n} live run row(s)`);
  console.log(`  ${inherited} property/element pairs are declared by neither side (pure inheritance from the host page) and are not design decisions`);
} finally { await b.close(); }

if (diffs.length) {
  console.error(`🔴 the live run strip differs from its approved mockup in ${diffs.length} propert${diffs.length === 1 ? "y" : "ies"}:`);
  for (const d of diffs) console.error("   · " + d);
  process.exit(1);
}
console.log("✅ the run strip matches the approved mockup, property by property — 0 differences");
