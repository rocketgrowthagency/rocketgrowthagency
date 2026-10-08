// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ONE WAY TO OPEN THE ADMIN IN A BROWSER — used by every gate that renders a real admin page.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 THERE ARE TWO IDENTITIES AND SIGNING IN AS THE WRONG ONE LOOKS LIKE A BROKEN PRODUCT.
//
//   hello@rocketgrowthagency.com        profiles.role = owner  → the ADMIN
//   rocketgrowthagencyadmin@gmail.com   a client login         → the CLIENT PORTAL
//
// `check-the-run-strip-matches-the-mockup` signed into the ADMIN with the PORTAL identity. The page
// threw `[portal] load error` inside `init`, rendered zero rows, and the gate reported *"the run
// strip did not render on the live card"* — about a card that renders perfectly. I spent the first
// pass of that investigation looking for a defect in the strip.
// → project_the_numbering_probe_was_flaky · feedback_the_harness_i_wrote_to_check_my_work_can_lie
//
// 🔑 AND THE SEQUENCE IS NOT OBVIOUS. Three separate gates each learned the same three lessons the
// hard way, in comments, independently:
//
//   1. `networkidle2` is the WRONG condition for an admin that polls — it may never go idle.
//   2. The session needs a beat to establish after the magic link before the next navigation.
//   3. WAIT FOR THE RENDER, NEVER FOR A CLOCK. A fixed sleep is how a gate returns 0, 1 and 2 on
//      three runs against an unchanged site.
//
// A fourth copy would have had to learn them a fourth time. → feedback_fix_the_class_not_the_instance
//
// 🔑 EVERY FAILURE HERE IS "I COULD NOT TELL", NEVER "THE PRODUCT IS BROKEN". These helpers exit 2
// and say which step of the sign-in failed. → feedback_a_gate_that_throws_is_not_a_gate_that_fails

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SITE = process.env.RGA_SITE_URL || "https://www.rocketgrowthagency.com";

// 🔴 NOT OVERRIDABLE BY ENV. `RGA_ADMIN_EMAIL` is what let the portal identity in: a default that a
// stray variable can replace is a default that will be replaced, and the failure is invisible.
export const ADMIN_EMAIL = "hello@rocketgrowthagency.com";

const die = (msg) => { console.error(`⚠️  INDETERMINATE — ${msg}`); process.exit(2); };

export const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

export function requireCreds() {
  if (!SUPA || !KEY) die("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set; cannot sign in to read a live page");
  return { SUPA, KEY };
}

/** The first client row — gates render against whatever client exists, never a hardcoded id. */
export async function firstClient(select = "id") {
  requireCreds();
  let rows;
  try { rows = await (await fetch(`${SUPA}/rest/v1/clients?select=${select}&limit=1`, { headers: H() })).json(); }
  catch (e) { die(`could not read a client: ${e.message}`); }
  if (!Array.isArray(rows) || !rows[0]) die("there is no client row to render");
  return rows[0];
}

/** A one-time sign-in link for the OWNER identity. */
export async function adminLink() {
  requireCreds();
  let j;
  try {
    j = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
    })).json();
  } catch (e) { die(`could not mint a sign-in link: ${e.message}`); }
  const link = j?.action_link || j?.properties?.action_link;
  if (!link) die(`no sign-in link returned: ${JSON.stringify(j).slice(0, 160)}`);
  return link;
}

/** Navigate, or exit 2 — a navigation timeout is never a product defect. */
export async function nav(page, url, what) {
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); }
  catch (e) { die(`could not load ${what}: ${String(e.message).split("\n")[0]}`); }
}

/**
 * Poll until `selector`'s count is non-zero and has stopped moving. Returns the count, or 0 if it
 * never rendered — the CALLER decides whether that is a defect or an indeterminate.
 */
export async function settle(page, selector = ".ob-step", { tries = 200, every = 150 } = {}) {
  let last = -1, stable = 0;
  for (let i = 0; i < tries; i++) {
    const n = await page.evaluate((s) => document.querySelectorAll(s).length, selector);
    if (n > 0 && n === last) { if (++stable >= 3) return n; } else { stable = 0; last = n; }
    await new Promise((r) => setTimeout(r, every));
  }
  return last > 0 ? last : 0;
}

/**
 * Sign in as the owner and open a client's admin tab, with every phase fold open. Returns the
 * settled row count. Collects page errors into `errs` if one is passed.
 */
export async function openAdminClient(page, clientId, tab = "onboarding-v2", { errs } = {}) {
  if (errs) page.on("pageerror", (e) => errs.push(String(e?.message || e).split("\n")[0].slice(0, 160)));
  await nav(page, await adminLink(), "the sign-in link");
  // 🔑 the session needs a beat before the next navigation, or the admin loads unauthenticated
  await new Promise((r) => setTimeout(r, 6000));
  await nav(page, `${SITE}/admin/?view=client&id=${clientId}&tab=${tab}`, `the admin ${tab} tab`);
  const rows = await settle(page);
  if (rows) {
    // 🔑 OPEN EVERY PHASE AND ROLLUP FIRST. Nine of ten phases are collapsed by design and their
    // rows are `hidden`, not absent — measuring without opening them reports 6 of 61 and calls a
    // healthy feature broken. → feedback_unloaded_is_not_an_answer
    await page.evaluate(() => {
      document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach((b) => b.click());
      document.querySelectorAll("[data-ob-rollup-toggle][aria-expanded='false']").forEach((b) => b.click());
    });
  }
  return rows;
}
