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
  await page.waitForSelector(".ob-step", { timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const rows = await page.evaluate(() => [...document.querySelectorAll(".ob-step")].map((el) => ({
    // 🔑 `.ob-num` is the STATUS DISC (✓ / ·). The number is `.ob-sid`, right beside it — reading the
    // disc printed a glyph where a number belongs, which is the whole failure this probe prevents.
    n: (el.querySelector(".ob-sid")?.textContent || "").trim(),
    title: (el.querySelector(".ob-title")?.textContent || "").trim(),
    id: el.getAttribute("data-flow-id") || el.getAttribute("data-step") || "",
    state: [...el.classList].find((c) => ["done", "active", "ready", "queued", "locked", "skipped"].includes(c)) || "",
    until: (el.querySelector(".ob-until")?.textContent || "").trim(),
  })).filter((r) => r.title));
  if (!rows.length) { console.error("⚠️  INDETERMINATE — the checklist rendered no rows."); process.exit(2); }
  const show = needle ? rows.filter((r) => r.title.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)) : rows;
  console.log(`── month-1 checklist as the page prints it (${rows.length} rows)\n`);
  for (const r of show) console.log(`  step ${String(r.n || "?").padStart(3)}  ${r.title.slice(0, 46).padEnd(48)}${r.state ? `[${r.state}]`.padEnd(10) : "".padEnd(10)}${r.until}`);
  if (needle && !show.length) console.log(`  (no row matches "${needle}")`);
} finally { await b.close(); }
