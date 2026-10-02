#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE LIVE CHECKLIST'S MARKERS MATCH THE APPROVED MOCKUP, PROPERTY BY PROPERTY
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴🔴 COUNTS CAN ALL BE RIGHT WHILE EVERY VISUAL PROPERTY IS WRONG. On 2026-10-01 I shipped three
 * rounds of "still not like mockup" by verifying counts and eyeballing two screenshots. One
 * property-by-property diff of COMPUTED styles found in a single run what eyeballing had missed
 * three times. → feedback_how_design_work_gets_done_first_time
 *
 * So this gate renders BOTH in the same browser — the live admin, signed in, and the approved
 * mockup from disk — and compares getComputedStyle() on the matching elements.
 *
 * Mockup: reports/mockups/admin_step_numbering_v1.html  (the `#after` block is the spec)
 *
 * 🔴 READ-ONLY. It opens a real client and clicks phase toggles (pure client-side re-render).
 * It never clicks Done / Skip / Reset. → feedback_an_audit_that_can_write_is_a_user
 *
 * Exit 0 pass · 1 the live render differs from the mockup · 2 could not sign in / no browser.
 */
import fs from "node:fs";

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "hello@rocketgrowthagency.com";
const SITE = "https://www.rocketgrowthagency.com";
const SITE_DIR = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCK = SITE_DIR + "/reports/mockups/admin_step_numbering_v1.html";

console.log("── the checklist's numbering matches the mockup ──");
if (!SUPA_URL || !SUPA_KEY) { console.log("  ⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(2); }
if (!fs.existsSync(MOCK)) { console.log(`  ⚠️  mockup missing: ${MOCK}`); process.exit(2); }

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch { console.log("  ⚠️  puppeteer unavailable — NOT reporting healthy."); process.exit(2); }

const api = async (p) => (await fetch(`${SUPA_URL}/rest/v1/${p}`,
  { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })).json();
let clientId;
try { clientId = (await api("clients?archived_at=is.null&select=id&limit=1"))?.[0]?.id; }
catch (e) { console.log(`  ⚠️  could not read a client: ${e.message}`); process.exit(2); }
if (!clientId) { console.log("  ⚠️  no active client to open."); process.exit(2); }

let link;
try {
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
  });
  const j = await r.json();
  link = j.action_link || j.properties?.action_link;
} catch (e) { console.log(`  ⚠️  could not mint a sign-in link: ${e.message}`); process.exit(2); }
if (!link) { console.log("  ⚠️  no sign-in link."); process.exit(2); }

// what each element must match, and on which properties. Font FAMILY of the body face differs
// between a standalone mockup and the admin shell by design, so it is compared only where the
// monospace treatment IS the design (.ob-sid — the row's id column).
const SPEC = [
  { name: "step disc",            live: ".ob-step.done .ob-num",  mock: "#after .ob-step.done .ob-num",
    props: ["width","height","borderRadius","fontSize","fontWeight","display","alignItems","justifyContent","backgroundColor","color"] },
  { name: "step disc (queued)",   live: ".ob-step.queued .ob-num", mock: "#after .ob-step.queued .ob-num",
    props: ["width","height","borderRadius","backgroundColor","color"] },
  { name: "step identifier",      live: ".ob-step.done .ob-sid",  mock: "#after .ob-step.done .ob-sid",
    props: ["fontFamily","fontSize","fontWeight","color","fontVariantNumeric","letterSpacing","flexGrow","flexShrink"] },
  { name: "phase marker (open)",  live: ".ob-phase.open .ob-ph-state", mock: "#after .ob-ph-state",
    props: ["width","height","borderRadius","fontSize","fontWeight","backgroundColor","color","display","alignItems","justifyContent"] },
  { name: "the way back",         live: ".ob-goto",               mock: "#after .ob-goto",
    props: ["minHeight","paddingLeft","paddingRight","borderRadius","borderTopWidth","borderTopStyle","borderTopColor","backgroundColor","color","fontSize","fontWeight","display","alignItems","columnGap","textDecorationLine"] },
  { name: "the way back's row",   live: ".ob-ph-back",            mock: "#after .ob-ph-back",
    props: ["display","justifyContent","paddingTop","marginTop","borderTopWidth","borderTopStyle","borderTopColor"] },
  // 🔴 WAS `.ob-goto .sid` — a grey monospace numeral between two blue phrases. Chris, 2026-10-01:
  // "i dont like how the 9 looks different". Approved treatment: the number lives INSIDE the words
  // ("Step 9 · <title>") and the only quiet mark left is the middot.
  // → admin_the_way_back_control_v1, option 4
  { name: "the way back's middot", live: ".ob-goto .dot",          mock: "#after .ob-goto .dot",
    props: ["fontSize","fontWeight","color"] },
  { name: "the row's spacing",    live: ".ob-step.done .ob-row",  mock: "#after .ob-step.done .ob-row",
    props: ["display","alignItems","columnGap"] },
];

const read = (sel, props) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const o = {};
  props.forEach((p) => { o[p] = cs[p]; });
  o.__text = (el.textContent || "").trim().slice(0, 40);
  return o;
};

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let fails = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fails++; };
try {
  // ── the mockup ─────────────────────────────────────────────────────────────────────────
  const mp = await browser.newPage();
  await mp.setViewport({ width: 1280, height: 1000 });
  await mp.goto("file://" + MOCK, { waitUntil: "load", timeout: 30000 });
  const want = {};
  for (const s of SPEC) want[s.name] = await mp.evaluate(read, s.mock, s.props);

  // ── the live admin ─────────────────────────────────────────────────────────────────────
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 160)));
  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=onboarding-v2`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 14000));

  if (errs.length) bad(`the page threw: ${errs.slice(0, 2).join(" | ")}`);

  // 🔑 Open every phase: nine of ten are collapsed and their rows are `hidden`, not absent.
  await page.evaluate(() => {
    document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((b) => b.click());
  });
  await new Promise((r) => setTimeout(r, 1500));

  // ── 1. ON SCREEN: the structure, from the real record ──────────────────────────────────
  const survey = await page.evaluate(() => {
    const host = document.getElementById("onboardingChecklistHost");
    if (!host) return null;
    const rows = [...host.querySelectorAll(".ob-step")];
    const phases = [...host.querySelectorAll(".ob-phase")];
    return {
      rows: rows.length,
      withSid: rows.filter((r) => r.querySelector(".ob-row .ob-sid")).length,
      discHoldsDigit: rows.filter((r) => /\d/.test((r.querySelector(".ob-row .ob-num")?.textContent || ""))).length,
      sidTexts: rows.slice(0, 12).map((r) => (r.querySelector(".ob-row .ob-sid")?.textContent || "").trim()),
      phases: phases.length,
      phaseMarkers: phases.length ? phases.map((p) => (p.querySelector(".ob-ph-state")?.textContent || "∅").trim()) : [],
      oldPhaseNumerals: host.querySelectorAll(".ob-ph-idx").length,
      gotos: host.querySelectorAll(".ob-goto").length,
      queued: host.querySelectorAll(".ob-step.queued").length,
      gotoInActivePhase: phases.filter((p) => p.querySelector(".ob-step.active") && p.querySelector(".ob-goto")).length,
      oldLabel: /Go to step \d/.test(host.textContent || ""),
      gotoText: (host.querySelector(".ob-goto")?.textContent || "").replace(/\s+/g, " ").trim(),
      strayGotoId: host.querySelectorAll(".ob-goto .sid").length,
      // 🔑 a settled phase must never ring green-with-a-circle or amber
      falseTick: phases.filter((p) => {
        const settled = [...p.querySelectorAll(".ob-step")].length > 0 &&
          [...p.querySelectorAll(".ob-step")].every((r) => r.classList.contains("done") || r.classList.contains("declined"));
        return !settled && (p.querySelector(".ob-ph-state")?.textContent || "").trim() === "✓";
      }).length,
    };
  });
  if (!survey) { console.log("  ⚠️  the checklist host never rendered."); await browser.close(); process.exit(2); }

  if (survey.rows === 0 || survey.phases === 0) {
    console.log(`  ⚠️  the checklist rendered ${survey.rows} rows in ${survey.phases} phases — nothing to compare.`);
    console.log("      Every \"every row has X\" assertion is vacuously true at zero rows, so this is");
    console.log("      reported as COULD-NOT-RUN, not as a pass and not as a design failure.");
    await browser.close();
    process.exit(2);
  }
  if (survey.withSid !== survey.rows) bad(`${survey.rows - survey.withSid} of ${survey.rows} rows have no .ob-sid identifier`);
  if (survey.discHoldsDigit) bad(`${survey.discHoldsDigit} discs still contain a digit — that is the bug`);
  if (survey.oldPhaseNumerals) bad(`${survey.oldPhaseNumerals} phases still render the old .ob-ph-idx numeral`);
  if (survey.oldLabel) bad(`the old "Go to step N" label is still on screen`);
  // 🔑 ONE PRODUCER, BOTH SITES. The label is built once per phase on month 1 and once on a queued
  // row on month 2+. Assert the SHAPE every control shows, not just that one of them is right.
  if (survey.gotoText && !/^\u2191 Step \d+ \u00b7 .+/.test(survey.gotoText))
    bad(`the way back reads "${survey.gotoText}" — the approved shape is "\u2191 Step N \u00b7 <title>"`);
  if (survey.strayGotoId) bad(`${survey.strayGotoId} way-back control(s) still carry a separate grey id`);
  if (survey.falseTick) bad(`${survey.falseTick} unsettled phase(s) render ✓ — a false all-clear`);
  if (survey.gotoInActivePhase) bad(`${survey.gotoInActivePhase} phase(s) hold the active step AND a link back to it`);
  if (survey.queued > 2 && survey.gotos >= survey.queued)
    bad(`${survey.gotos} way-back controls for ${survey.queued} queued rows — back to one per row`);
  if (survey.phaseMarkers.some((g) => /\d/.test(g))) bad(`a phase marker is a numeral: ${survey.phaseMarkers.join(" ")}`);

  console.log(`  ✅ ${survey.rows} rows in ${survey.phases} phases · every row carries an .ob-sid · no digit in any disc`);
  console.log(`  ✅ phase markers on screen: ${survey.phaseMarkers.join(" ")}`);
  console.log(`  ✅ ${survey.gotos} way-back control(s) for ${survey.queued} queued rows${survey.gotoText ? ` — "${survey.gotoText}"` : ""}`);
  console.log(`  ·  first identifiers: ${survey.sidTexts.filter(Boolean).join(", ")}`);

  // ── 1b. THE MARKER MUST SURVIVE A CLICK ───────────────────────────────────────────────
  // 🔴 The toggle mutates the DOM and re-renders nothing, so a glyph keyed on `open` goes stale:
  // the ring turns amber while still reading ○. Caught on a screenshot, by no count.
  const agree = () => page.evaluate(() => [...document.querySelectorAll(".ob-phase")].map((p) => {
    const rows = [...p.querySelectorAll(".ob-step")];
    return {
      name: (p.querySelector(".ob-ph-name")?.firstChild?.textContent || "").trim(),
      open: p.classList.contains("open"),
      glyph: (p.querySelector(".ob-ph-state")?.textContent || "").trim(),
      todo: !!p.querySelector(".ob-ph-state")?.classList.contains("is-todo"),
      settled: rows.length > 0 && rows.every((r) => r.classList.contains("done") || r.classList.contains("declined")),
    };
  }));
  const judge = (list, when) => list.forEach((p) => {
    const want = p.settled ? "\u2713" : p.open ? "\u25cf" : "\u25cb";
    if (p.glyph !== want) bad(`${when}: "${p.name}" is ${p.open ? "OPEN" : "closed"}${p.settled ? " and settled" : ""} but its marker reads "${p.glyph}" — expected "${want}"`);
    if (p.todo !== (!p.settled && !p.open)) bad(`${when}: "${p.name}" carries is-todo=${p.todo} while open=${p.open}, settled=${p.settled}`);
  });
  judge(await agree(), "with every phase opened");
  await page.evaluate(() => document.querySelectorAll(".ob-phase.open [data-ob-phase-toggle]").forEach((b) => b.click()));
  await new Promise((r) => setTimeout(r, 900));
  judge(await agree(), "after closing them again");
  await page.evaluate(() => document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((b) => b.click()));
  await new Promise((r) => setTimeout(r, 900));
  judge(await agree(), "after reopening them");
  console.log("  \u2705 the phase marker agrees with open/settled through open \u2192 close \u2192 open");

  // ── 2. THE PROPERTY DIFF, computed style against computed style ────────────────────────
  let compared = 0, differ = 0;
  for (const s of SPEC) {
    const w = want[s.name];
    if (!w) { bad(`the mockup has no \`${s.mock}\` — the spec cannot be read`); continue; }
    const g = await page.evaluate(read, s.live, s.props);
    if (!g) { bad(`the live page has no \`${s.live}\``); continue; }
    const d = [];
    for (const p of s.props) {
      compared++;
      if (String(g[p]) !== String(w[p])) { d.push(`${p}: mockup "${w[p]}" → live "${g[p]}"`); differ++; }
    }
    if (d.length) { console.log(`  🔴 ${s.name} (${s.live})`); d.forEach((x) => console.log(`       ${x}`)); fails++; }
    else console.log(`  ✅ ${s.name} — ${s.props.length} computed properties identical`);
  }
  console.log(`\n  ${compared} computed properties compared · ${differ} differ`);
} catch (e) {
  console.log(`  ⚠️  ${e.message}`);
  await browser.close();
  process.exit(2);
}
await browser.close();
if (fails) { console.log(`\n🔴 the live checklist does not match the mockup (${fails})`); process.exit(1); }
console.log("\n✅ the live render matches the approved mockup, property by property");
