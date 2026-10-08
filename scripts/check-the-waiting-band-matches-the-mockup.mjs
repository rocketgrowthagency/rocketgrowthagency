#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-waiting-band-matches-the-mockup.mjs
//
// 🔴 WHY: Chris, three times (10-01, 10-07, 10-08): mockup to live must be right the FIRST time,
// "exactly the correct way". The approved design is reports/mockups/step31_waiting_on_client_v1.html
// (v2). This renders BOTH the live admin card and the live client portal row and diffs them against
// it, property by property — the method that works, and the step I kept skipping.
// → feedback_how_design_work_gets_done_first_time
//
// Two deliberate departures from the mockup are NOT compared, because building them would have
// shipped something false or banned (both reported to Chris):
//   · the client's "Done when" line — that strip was deleted from every client card on 2026-09-29
//   · the log title "Nudges and replies" — uploads are not in a per-step feed, so it reads "Nudges"
//
// exit 0 = live matches the approved mockup · 1 = it differs · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { firstClient, openAdminClient, settle, nav, requireCreds, H, SITE as LIVE } from "./_admin-session.mjs";
import { comparePairs, PROPS } from "./_mockup-diff.mjs";

// 🔑 A `1fr` TRACK RESOLVES TO WHATEVER WIDTH IS LEFT, and the live card is narrower than the
// mockup page — so "150px 610px" vs "150px 636px" is the container, not the design. For rows built
// as fixed + fr, compare everything else by property and the FIXED track by value.
const NO_GTC = PROPS.filter((x) => x !== "gridTemplateColumns");
const firstTrack = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).gridTemplateColumns.split(" ")[0] : null; }, sel);

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCK = `${SITE}/reports/mockups/step31_waiting_on_client_v1.html`;
if (!fs.existsSync(MOCK)) { console.error("⚠️  INDETERMINATE — the mockup file is gone"); process.exit(2); }

let puppeteer;
try { puppeteer = (await import("puppeteer")).default; }
catch { console.error("⚠️  INDETERMINATE — puppeteer unavailable; cannot compare renders"); process.exit(2); }

const client = await firstClient("id");
const { SUPA } = requireCreds();
const fails = [];
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const m = await b.newPage();
  await m.setViewport({ width: 1280, height: 900 });
  await m.goto(`file://${MOCK}`, { waitUntil: "networkidle2", timeout: 45000 });

  // ── ADMIN ───────────────────────────────────────────────────────────────────────────────────
  const a = await b.newPage();
  await a.setViewport({ width: 1280, height: 900 });
  const errs = [];
  const rows = await openAdminClient(a, client.id, "onboarding-v2", { errs });
  if (!rows) { console.error("⚠️  INDETERMINATE — the checklist rendered no rows."); process.exit(2); }
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the admin threw while loading: ${errs[0]}`); process.exit(2); }
  const band = await settle(a, ".ob-wait", { tries: 60 });
  if (!band) {
    console.error("⚠️  INDETERMINATE — no step is waiting on the client right now, so there is no band to measure.");
    process.exit(2);
  }
  await settle(a, ".ob-wait-log", { tries: 40 });   // nudge history arrives after the client
  const adminPairs = [
    ["pill", ".pill", ".ob-status.is-wait"],
    ["band", ".hand", ".ob-wait"],
    ["bandTop", ".hand-top", ".ob-wait-top"],
    ["eyebrow", ".eyebrow", ".ob-wait-eb"],
    ["headline", ".hand-top .big", ".ob-wait-big"],
    ["sub", ".hand-top .sub", ".ob-wait-sub"],
    ["facts", ".facts", ".ob-wait-facts"],
    ["fact", ".fact", ".ob-wait-f"],
    ["factLabel", ".fact .k", ".ob-wait-f .k"],
    ["factValue", ".fact .v", ".ob-wait-f .v"],
    ["bar", ".hand .bar", ".ob-wait-bar"],
    ["barFill", ".hand .bar i", ".ob-wait-bar i"],
    ["actions", ".hand-acts", ".ob-wait-acts"],
    ["hint", ".hand-acts .hint", ".ob-wait-acts .hint"],
    ["ours", ".ours", ".ob-ours"],
    ["oursDone", ".ours .ok", ".ob-ours .ok"],
    ["log", ".log", ".ob-wait-log"],
    ["logHead", ".log-h", ".ob-wait-log .h"],
  ];
  const ad = await comparePairs(m, a, adminPairs);
  { const r = await comparePairs(m, a, [["logRow", ".lr", ".ob-wait-log .r"]], NO_GTC); ad.compared += r.compared; ad.diffs.push(...r.diffs); ad.missingInMock.push(...r.missingInMock);
    const [w, g] = [await firstTrack(m, ".lr"), await firstTrack(a, ".ob-wait-log .r")];
    if (w !== g) ad.diffs.push(`logRow time column: mockup ${w} · live ${g}`); }
  if (ad.missingInMock.length) { console.error(`⚠️  INDETERMINATE — the mockup no longer has: ${ad.missingInMock.join(", ")}`); process.exit(2); }
  console.log(`  admin: ${adminPairs.length} paired elements · ${ad.compared} declared properties compared`);
  for (const d of ad.diffs) fails.push(`admin ${d}`);

  // ── PORTAL, signed in as the client's own portal login ──────────────────────────────────────
  const acc = await (await fetch(`${SUPA}/rest/v1/client_portal_access?client_id=eq.${client.id}&invite_status=eq.active&select=portal_email&limit=1`, { headers: H() })).json();
  const email = acc?.[0]?.portal_email;
  if (!email) { console.error("⚠️  INDETERMINATE — this client has no active portal login to render as."); process.exit(2); }
  const j = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: H(),
    body: JSON.stringify({ type: "magiclink", email, options: { redirect_to: `${LIVE}/portal/` } }) })).json();
  const link = j?.action_link || j?.properties?.action_link;
  if (!link) { console.error("⚠️  INDETERMINATE — no portal sign-in link"); process.exit(2); }
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await nav(p, link, "the portal sign-in link");
  // 🔴 THE SIGN-IN LINK REDIRECTS, AND THE PORTAL REWRITES ITS OWN URL. A query that lands mid-way
  // throws "execution context was destroyed" — which, uncaught, exited 1 and read as a broken
  // product on the second of two runs. Wait the navigation out, then retry the read.
  // → feedback_a_flaky_gate_is_worse_than_a_failing_one
  let how = 0;
  for (let t = 0; t < 4 && !how; t++) {
    try { await p.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {}); how = await settle(p, ".pm-how2", { tries: 200 }); }
    catch (e) { if (!/context was destroyed|detached|navigat/i.test(String(e.message))) throw e; await new Promise((r) => setTimeout(r, 1500)); }
  }
  if (!how) { console.error("⚠️  INDETERMINATE — no client step carries a how-to right now."); process.exit(2); }
  // 🔑 MEASURE WHAT THE CLIENT SEES: the Setup view, with the row that holds the how-to OPEN. The
  // first run measured a folded row and read "1fr" off layout that was never drawn.
  await p.evaluate(() => {
    document.querySelector('.portal-nav a[data-view="setup"]')?.click();
    const row = document.querySelector(".pm-how2")?.closest(".pm-step-row");
    if (row?.classList.contains("is-collapsed")) row.querySelector("[data-step-toggle]")?.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  if (!(await p.evaluate(() => document.querySelector(".pm-how-st")?.checkVisibility()))) {
    console.error("⚠️  INDETERMINATE — the how-to is on the page but not visible after opening its row.");
    process.exit(2);
  }
  const portalPairs = [
    ["only", ".only", ".pm-how-only"],
    ["onlyIcon", ".only .ic", ".pm-how-only .ic"],
    ["progressLine", ".pprog .l", ".pm-how-prog .l"],
    ["track", ".pprog .track", ".pm-how-prog .track"],
    ["why", ".prow .why", ".pm-how-why"],
    ["list", ".howto", ".pm-how-list"],
    ["listHead", ".howto-h", ".pm-how-h"],
    ["stepNum", ".st .n", ".pm-how-st .n"],
    ["stepDo", ".st .d", ".pm-how-st .d"],
    ["stepWhere", ".st .w", ".pm-how-st .w"],
    ["stepWho", ".st .who", ".pm-how-st .who"],
    ["button", ".pbtn:not(.ghost)", ".pm-how-st .pm-act.is-go"],
    ["tip", ".ptips span", ".pm-how-tips span"],
  ];
  if (await p.evaluate(() => !!document.querySelector(".pm-how-st .pm-act.is-guide"))) portalPairs.push(["ghostButton", ".pbtn.ghost", ".pm-how-st .pm-act.is-guide"]);
  const pd = await comparePairs(m, p, portalPairs);
  { const r = await comparePairs(m, p, [["step", ".st", ".pm-how-st"]], NO_GTC); pd.compared += r.compared; pd.diffs.push(...r.diffs); pd.missingInMock.push(...r.missingInMock);
    const [w, g] = [await firstTrack(m, ".st"), await firstTrack(p, ".pm-how-st")];
    if (w !== g) pd.diffs.push(`step number column: mockup ${w} · live ${g}`); }
  if (pd.missingInMock.length) { console.error(`⚠️  INDETERMINATE — the mockup no longer has: ${pd.missingInMock.join(", ")}`); process.exit(2); }
  console.log(`  portal: ${portalPairs.length} paired elements · ${pd.compared} declared properties compared`);
  for (const d of pd.diffs) fails.push(`portal ${d}`);
} catch (e) {
  // 🔑 A THROW IS NOT A FINDING. Exit 2: the probe could not look, which says nothing about the page.
  console.error(`⚠️  INDETERMINATE — the browser probe threw: ${String(e.message).split("\n")[0].slice(0, 160)}`);
  await b.close().catch(() => {});
  process.exit(2);
} finally { await b.close().catch(() => {}); }

if (fails.length) {
  console.error(`🔴 the live render differs from the approved mockup in ${fails.length} propert${fails.length === 1 ? "y" : "ies"}:`);
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ the waiting band and the client's how-to match the approved mockup, property by property");
