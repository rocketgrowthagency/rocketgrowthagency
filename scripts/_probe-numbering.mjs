#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT NUMBER IS THIS STEP? — read off the LIVE checklist, never reconstructed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 WHY THIS EXISTS AT ALL. Ops memory has told every session since 2026-10-05 to
// "recompute with `node scripts/_probe-numbering.mjs` before naming a number".
// **THE SCRIPT DID NOT EXIST.** The instruction was right and the tool it named was imaginary, so
// the honest thing a session could do was the thing the rule forbids: guess.
//
// 🔴 AND RECONSTRUCTING IT IS NOT GOOD ENOUGH. Rebuilding the input to `obPageNumbers` by hand gave
// keywords=26 and the grid=22, while the actual card reads 25 and 26 — the admin filters and wraps
// the playbook before numbering it, and every layer of that is a chance to be wrong. The number a
// step is "called by" is whatever the page prints beside it.
//
//   node scripts/_probe-numbering.mjs                  # the whole month-1 checklist
//   node scripts/_probe-numbering.mjs citation         # rows whose title matches
//
// → feedback_a_step_number_is_computed_and_i_changed_the_computation · project_a_step_number_has_one_home
// Exit 0 printed · 2 could not read the page (no browser, no credentials, not signed in)

const SITE = process.env.RGA_SITE_URL || "https://www.rocketgrowthagency.com";
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.RGA_ADMIN_EMAIL || "hello@rocketgrowthagency.com";
const needle = (process.argv[2] || "").toLowerCase();

if (!SUPA_URL || !SUPA_KEY) { console.error("⚠️  INDETERMINATE — no Supabase credentials."); process.exit(2); }
let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch { console.error("⚠️  INDETERMINATE — puppeteer is not available here."); process.exit(2); }

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
let clientId;
try {
  const rows = await (await fetch(`${SUPA_URL}/rest/v1/clients?archived_at=is.null&select=id&limit=1`, { headers: H })).json();
  clientId = rows?.[0]?.id;
} catch { /* reported below */ }
if (!clientId) { console.error("⚠️  INDETERMINATE — no active client to open."); process.exit(2); }

// 🔑 generate_link RETURNS the link and emails nobody.
let link;
try {
  const j = await (await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
  })).json();
  link = j.action_link || j.properties?.action_link;
} catch { /* reported below */ }
if (!link) { console.error("⚠️  INDETERMINATE — no sign-in link returned."); process.exit(2); }

const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await b.newPage();
  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=client-setup`, { waitUntil: "networkidle2", timeout: 60000 });
  // 🔴🔴 THE SWALLOWED WAIT WAS THE FLAKINESS. `waitForSelector(...).catch(() => {})` followed by a
  // fixed 2.5s sleep meant a slow render reported "the checklist rendered no rows" — which reads as
  // "the admin is broken" and did exactly that today, right after a deploy. A probe that cannot tell
  // "not loaded yet" from "nothing there" is worse than no probe.
  // 🔑 WAIT FOR THE CONDITION, NOT A CLOCK: poll until the row count is non-zero AND stable.
  // → feedback_a_flaky_gate_is_worse_than_a_failing_one · feedback_a_silent_catch_hides_an_optimisation_doing_nothing
  const countRows = () => page.evaluate(() => document.querySelectorAll(".ob-step").length);
  let n = 0, stable = 0;
  for (let i = 0; i < 60; i++) {
    const c = await countRows();
    if (c > 0 && c === n) { if (++stable >= 3) break; } else { stable = 0; }
    n = c;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!n) {
    console.error("⚠️  INDETERMINATE — the checklist never rendered a row in 30s.");
    console.error("   This is the PROBE failing to see the page, not proof the admin is broken.");
    console.error("   Check it by hand: " + `${SITE}/admin/?view=client&id=${clientId}&tab=client-setup`);
    process.exit(2);
  }

  const rows = await page.evaluate(() => [...document.querySelectorAll(".ob-step")].map((el) => ({
    // 🔑 `.ob-num` is the STATUS DISC (✓ / ·). The number is `.ob-sid`, right beside it — reading the
    // disc printed a glyph where a number belongs, which is the whole failure this probe prevents.
    n: (el.querySelector(".ob-sid")?.textContent || "").trim(),
    title: (el.querySelector(".ob-title")?.textContent || "").trim(),
    // 🔑 `data-ob-step` is the id the card actually carries (added 2026-10-07 so a finished step can
    // be scrolled back to). `data-flow-id` never existed, so filtering by id silently matched nothing.
    // → feedback_a_symbol_name_is_a_claim_about_the_codebase
    id: el.getAttribute("data-ob-step") || "",
    state: [...el.classList].find((c) => ["done", "active", "ready", "queued", "locked", "skipped", "declined"].includes(c)) || "",
    until: (el.querySelector(".ob-until")?.textContent || "").trim(),
  })).filter((r) => r.title));

  // 🔴 NAME THE SCOPE THE PAGE IS ACTUALLY SHOWING. This printed "month-1 checklist" over whatever
  // was on screen, and today that was the 28-row Month 2+ list — a label stating something the rows
  // contradicted. → feedback_a_client_message_must_agree_with_itself
  const scope = `${rows.length} rows on screen`;
  const show = needle ? rows.filter((r) => r.title.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)) : rows;
  console.log(`── checklist as the page prints it — ${scope}\n`);
  for (const r of show) console.log(`  step ${String(r.n || "?").padStart(3)}  ${r.title.slice(0, 46).padEnd(48)}${r.state ? `[${r.state}]`.padEnd(10) : "".padEnd(10)}${r.until}`);
  if (needle && !show.length) console.log(`  (no row matches "${needle}")`);
} finally { await b.close(); }
