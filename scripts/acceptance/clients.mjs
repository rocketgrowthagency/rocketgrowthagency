/**
 * The clients the acceptance walk signs in as. ONE list, read by the walk, the fixture script and the
 * "the new client stays new" gate, so the three can never disagree about who the test clients are.
 *
 * 🔑 Why two (approved client_step_waits_on_own_step_v1, 2026-10-13): the original test client is far along,
 *    so a step that waits on the client's OWN earlier step ("Do step 6 first" / "Connect Google first") and
 *    the kickoff booking row never show up on it. The NEW client is frozen at day 0 (paid, Google not
 *    connected, nothing done) so the walk checks a brand-new stranger's view every morning.
 *
 * The new client is deliberately NOT RGA-shaped: another trade (plumbing), another state + timezone
 * (Austin, TX), no website, no Google listing, no tracked keyword.
 */
export const WALK_CLIENTS = {
  main: {
    label: "Test client (far along)",
    id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3",
    email: "rocketgrowthagencyadmin@gmail.com",
    report: "latest.md",
    dir: "",
    // Both test clients are at a stage whose portal shows every Month-1 row, so a client-facing step with no portal
    // row is a FAIL, not an UNKNOWN (the first new-client walk compared 0 of 13 and passed).
    portalRowsRequired: true,
  },
  new: {
    label: "Brand-new client (day 0)",
    // Set by scripts/create-new-test-client.mjs (looked up by `source` when null).
    id: "cde1ca89-1b89-4af1-8b01-b7a0c3ea0fe0",
    email: "rocketgrowthagencyadmin+newclient@gmail.com",
    report: "latest-new-client.md",
    dir: "new-client",
    portalRowsRequired: true,
  },
  // 🔑 A MONTH-2 CLIENT (2026-10-13, Chris: "yes we dont stop until all steps and checks are done"). Month 1 finished,
  // the Monthly cycle open (stage 5), and nothing sent THIS month: the state every client is in on the 1st. No monthly
  // record is ever written for it, so it is the same state every month with nothing to reset. Walked with `--month=2`
  // against the admin's Monthly checklist. Again NOT RGA-shaped: house cleaning, Manchester NH (Eastern time).
  month2: {
    label: "Month-2 client (start of the month)",
    // Created 2026-10-13 by scripts/create-new-test-client.mjs --as=month2.
    id: "7e62bbb3-7d9c-4f72-99f1-9884fcc5765c",
    email: "rocketgrowthagencyadmin+month2@gmail.com",
    report: "latest-month2.md",
    dir: "month2",
    portalRowsRequired: true,
    month: 2,
  },
};

// The Month-2 fixture's marker and row (scripts/create-new-test-client.mjs --as=month2; gate
// check-the-month-2-client-stays-at-month-start). stage_5_monthly = the Monthly cycle. status "active" like a real
// Month-2 client: every cron that acts on active / billing-active / stage 5-6 clients skips `source` = test:*.
// primary_service, website, GBP and Place id stay null so rankings-refresh and the grid never spend on it.
export const MONTH2_CLIENT_SOURCE = "test:acceptance-walk-month2";
export const MONTH2_CLIENT_ROW = {
  business_name: "Granite State Home Cleaning (TEST - month 2 walk)",
  portal_slug: "test-daily-walk-month2",
  primary_contact_name: "Walk Tester",
  primary_contact_email: "rocketgrowthagencyadmin+month2@gmail.com",
  primary_contact_phone: null,
  website_url: null,
  gbp_url: null,
  google_place_id: null,
  primary_service: null,
  primary_market: "Manchester, NH",
  industry: "House Cleaning",
  business_type: "House cleaning service",
  geography_model: "service_area",
  status: "active",
  billing_status: "active",
  client_portal_stage: "stage_5_monthly",
  contract_signed: true,
  invoice_paid: true,
  source: MONTH2_CLIENT_SOURCE,
};

// The marker the fixture is created with and found by. Never reused for anything else.
export const NEW_CLIENT_SOURCE = "test:acceptance-walk-new-client";

// What "day 0" means. The fixture script writes these; the gate fails if any of them drift.
// status "onboarding" (not "active") keeps flow-cron-daily + flow-cron-weekly-digest off it (the daily robot
// AUTO-RUNS Month-1 steps for status=active clients). billing_status must be "active": the column is NOT NULL and
// every other value puts an overdue/paused banner on the portal, so the fixture would not look like a paid client.
// Instead brain-weekly-dispatch (Claude spend) and the two flow crons skip `source` = test:* (website code).
// primary_service null keeps rankings-refresh (Places spend) off it.
// 🔴 stage_4_onboarding, NOT stage_3_setup: at stage 3 the portal shows only "Connect your accounts" and no Month-1
// rows, so the first walk (2026-10-13) compared nothing. Stage 4 with NO Google connection = Month 1 has opened and
// nothing is granted yet — the state where "Connect Google first", "Do step N first" and the kickoff picker show.
export const NEW_CLIENT_ROW = {
  business_name: "Lone Star Drain & Plumbing (TEST - daily walk)",
  portal_slug: "test-daily-walk-new-client",
  primary_contact_name: "Walk Tester",
  primary_contact_email: "rocketgrowthagencyadmin+newclient@gmail.com",
  primary_contact_phone: null,
  website_url: null,
  gbp_url: null,
  google_place_id: null,
  primary_service: null,
  primary_market: "Austin, TX",
  industry: "Plumbers",
  business_type: "Plumber",
  geography_model: "service_area",
  status: "onboarding",
  billing_status: "active",
  client_portal_stage: "stage_4_onboarding",
  contract_signed: true,
  invoice_paid: true,
  source: NEW_CLIENT_SOURCE,
};

/** The fixture behind a walk client key: { row, source }, or null for `main` (a real record, never re-made). */
export function fixtureFor(as) {
  if (as === "new") return { row: NEW_CLIENT_ROW, source: NEW_CLIENT_SOURCE };
  if (as === "month2") return { row: MONTH2_CLIENT_ROW, source: MONTH2_CLIENT_SOURCE };
  return null;
}

export async function resolveNewClientId(supa, key) {
  if (WALK_CLIENTS.new.id) return WALK_CLIENTS.new.id;
  const r = await fetch(`${supa}/rest/v1/clients?source=eq.${encodeURIComponent(NEW_CLIENT_SOURCE)}&select=id`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length === 1 ? rows[0].id : null;
}
