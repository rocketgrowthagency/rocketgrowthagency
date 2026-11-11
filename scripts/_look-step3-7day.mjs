#!/usr/bin/env node
// check-managed-step3-go-ahead.mjs — MANAGED STEP 3'S 7-DAY GO-AHEAD (approved client_step03_seven_day_rule_v1, 11-5, all 8 decisions as recommended;
// the rule is managed_month1_and_after_v1 decision 2). Nothing here reaches Google, a website or the database: every server path RUNS with its
// reads and writes answered in memory, and the portal is DRAWN in headless Chrome by the portal-boot harness (our fake database). HOLDS:
//   1 · DAY COUNTING: day 1 = the Pacific calendar day of the stamp, day N counts calendar days, capped at 7; the night after day 7 is due; across the
//       Nov 1 clock change too. Stamped ONCE (the portal's "day1" and the nightly both refuse a second stamp).
//   2 · THE HEADS-UP FROM DAY 5: not on days 1 to 4, on days 5 to 7, never when due, held or waiting on verification; its words are the plan's own.
//   3 · EACH ROW'S RULE (plan), for businesses of different shapes (an agency that goes to customers, a storefront bakery, a plumber with two
//       phones, a business outside the US, one whose site shows other hours, one with no services): website, how they serve, areas, hours,
//       services, name and phone (never changed; different on the site = step 3 stays open on that row), about-you (always blank).
//   4 · HOLD stops it (the nightly reads nothing and writes nothing for a held client); Lift lets it run; both read back.
//   5 · UNDO restores EXACTLY what was there (deep equality, absent keys stay absent), only on steps the client hasn't answered since, and holds.
//   6 · NO WEBSITE: how they serve and hours go ahead on Google alone, labeled so; the website is never fetched.
//   7 · A SITE THAT CAN'T BE READ (refused, timed out, drawn by script): "couldn't read", nothing goes ahead that night, one night counted per
//       night, RGA's To do move after 3 nights, and a good read the next night goes ahead and clears it.
//   8 · NEVER name, phone, address or main category: the go-ahead writes only status · completed_at · completed_by · go_ahead, never
//       client_input, google_push or core_changes, and never marks name or phone "went ahead".
//   9 · NEVER WRITES TO GOOGLE: the whole nightly pass and every RGA press RUN against the REAL Google readers with a fetch that records every
//       request: every Google request is a GET; no file in the path names a Google writer.
//  10 · GUARDS: not managed (self-serve, no mode) = nothing; step 3 done (RGA's own record's shape) = nothing read, nothing written; unverified =
//       nothing read; a step the client answered, flagged or RGA is changing is never touched; once gone ahead, never again by itself.
//  11 · THE PORTAL (drawn): day 1 is today's card exactly; days 5 to 7 add the line under the title and the band; after the go-ahead the Done card
//       (rows in the mockup's order, its words and chips, the head, the foot, Fix something only); self-serve draws none of it; "Your turn" stamps day 1.
//  12 · ADMIN STEP 28 (lifted into jsdom): the line, the counters, the 7 days, the table, Ask the client · Hold · Read the website again; held =
//       Lift the hold; after = the went-ahead line + Undo (with its dialog) + the pill; 27/32/34/35 point to 28; To do says "goes ahead <day>".
// exit 0 = holds · 1 = something is wrong · 2 = can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const can = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const req = createRequire(path.join(SITE, "netlify/functions/_x.js"));
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let G, S, X, OM, GP;
try {
  G = req("../../shared/step3-go-ahead.js"); S = req("./_site-read.js"); X = req("./_step3-go-ahead.js"); OM = req("./_open-moves.js"); GP = req("./_gbp-profile.js");
} catch (e) { can(`the go-ahead's modules don't load (${e.message})`); }
const clone = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CID = "11111111-1111-4111-8111-111111111111";
const DAY1 = "2026-11-05T20:00:00Z";   // Thu Nov 5, 12 PM Pacific
const at = (d, hhmm = "20:00") => Date.parse(`${d}T${hhmm}:00Z`);
const WEEK = (open, close, closed = ["sat", "sun"]) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, closed.includes(d) ? { closed: true } : { open, close }]));

// ── the businesses (invented, of different shapes; none is RGA, nothing keys on a name) ──
const AGENCY = { facts: { name: "Northwind Marketing", phone: "(424) 555-0140", website: "https://www.northwind.test/", come: false, address: null, area: ["El Segundo, CA, USA", "Culver City, CA, USA", "Los Angeles, CA, USA"], region: "US" },
  hours: { has: true, days: WEEK("09:00", "18:00") }, services: { categories: { primary: { label: "Marketing agency" } }, options: [{ key: "s1", label: "Local SEO" }, { key: "s2", label: "Ads" }], on: ["s1"] },
  attrs: { options: [{ key: "women_led", label: "Women-owned", about: true }, { key: "appt", label: "Online appointments" }], ticked: [] } };
const AGENCY_SITE = { ok: true, url: "https://www.northwind.test", at: "2026-11-12T10:30:40Z", pages: ["https://www.northwind.test/"], text: "Northwind Marketing helps businesses in Culver City grow. Call +1-424-555-0140.", name: "Northwind Marketing LLC", phones: ["+1-424-555-0140"], street: { found: false, text: "" }, hours: { kind: "none" } };
const BAKERY = { ...clone(AGENCY), facts: { name: "Corner Bakery & Co", phone: "020 7946 0958", website: "cornerbakery.test", come: true, address: "123 Main St, Springfield IL 62701", area: [], region: "US" },
  hours: { has: true, days: WEEK("07:00", "15:00", ["sun"]) } };
const BAKERY_SITE = { ok: true, text: "Fresh bread daily at 123 Main Street, Springfield.", name: "Corner Bakery and Co", phones: ["+44 20 7946 0958"], street: { found: true, text: "123 Main Street, Springfield, IL" }, hours: { kind: "week", days: WEEK("07:00", "15:00", ["sun"]) } };
const PLUMBER = { ...clone(AGENCY), facts: { name: "Acme Plumbing", phone: "5550101234", website: "https://acmeplumbing.test", come: false, address: null, area: ["Springfield, IL", "Shelbyville, IL"], region: "US" } };
const PLUMBER_SITE = { ok: true, text: "Serving Springfield and Shelbyville. Sales (555) 010-9999 · Service (555) 010-1234", name: null, phones: ["(555) 010-9999", "(555) 010-1234"], street: { found: false, text: "" }, hours: { kind: "week", days: WEEK("08:00", "17:00") } };
const LISBON = { ...clone(AGENCY), facts: { name: "Casa Azul", phone: "+351 21 123 4567", website: "https://casaazul.test", come: false, address: null, area: ["Lisboa, Portugal"], region: "PT" } };
const LISBON_SITE = { ok: true, text: "Casa Azul, Lisboa. Ligue 21 123 4567", name: "Casa Azul", phones: ["21 123 4567"], street: { found: null, text: "" }, hours: { kind: "none" } };
const REC = (w) => ({ website: w });

// ── 1 · DAY COUNTING ──
{
  const data = (extra = {}) => ({ tasks: { "m1.gbp.verify": { status: "done" } }, step3_rule: { day1: { at: DAY1, by: "portal" } }, ...extra });
  const want = [["2026-11-05", 1, false, false], ["2026-11-08", 4, false, false], ["2026-11-09", 5, true, false], ["2026-11-11", 7, true, false]];
  for (const [d, day, hu, due] of want) { const s = G.standing(data(), true, at(d)); if (s.state !== "counting" || s.day !== day || !!s.headsUp !== hu || s.due !== due) fail(`day counting: ${d} should be day ${day} (heads-up ${hu}, due ${due}), got ${JSON.stringify(s)}`); }
  const night = G.standing(data(), true, at("2026-11-12", "10:30"));
  if (!night.due || night.goes !== "2026-11-12" || night.day !== 7) fail(`the night after day 7 (Nov 12, 10:30 UTC) isn't due: ${JSON.stringify(night)}`);
  const late = G.standing({ ...data(), step3_rule: { day1: { at: "2026-11-06T07:30:00Z" } } }, true, at("2026-11-06", "08:00"));
  if (late.day1 !== "2026-11-05") fail(`day 1 is the PACIFIC day: 11:30 PM Pacific on Nov 5 is Nov 5, not ${late.day1}`);
  const dst = G.standing({ ...data(), step3_rule: { day1: { at: "2026-10-31T19:00:00Z" } } }, true, at("2026-11-07", "10:30"));
  if (dst.goes !== "2026-11-07" || !dst.due) fail(`over the Nov 1 clock change the 7 days still end on the 7th calendar day: ${JSON.stringify(dst)}`);
  if (G.standing({ tasks: {} }, true, at("2026-11-05")).state !== "not_started") fail("no stamp must read not_started, never a guessed day");
  if (G.runWords("2026-11-12") !== "2:30 AM" || G.dayWords("2026-11-12") !== "Thu, Nov 12") fail(`the day words aren't the mockup's (${G.dayWords("2026-11-12")}, ${G.runWords("2026-11-12")})`);
}

// ── 3 · EACH ROW'S RULE ──
const row = (p, k) => (p.rows || []).find((r) => r.key === k) || {};
{
  const p = G.plan({ g: AGENCY, site: AGENCY_SITE, record: REC("northwind.test") });
  const got = Object.fromEntries(p.rows.map((r) => [r.key, `${r.result}:${r.why}`]));
  const want = { website: "went_ahead:same_and_opens", serve: "went_ahead:site_none", name: "left:needs_client_ok", phone: "left:needs_client_ok", areas: "left:site_names_fewer", hours: "went_ahead:site_none", services: "went_ahead:kept_google", about: "left:client_only" };
  if (!eq(got, want)) fail(`the agency (the mockup's case) plans ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  if (!Object.values(p.close).every(Boolean) || p.open_on.length) fail(`the agency's four steps should all close: ${JSON.stringify(p.close)} open_on ${p.open_on}`);
  if (!eq(row(p, "areas").named, ["Culver City"])) fail(`areas: the site names Culver City only (${JSON.stringify(row(p, "areas").named)})`);
  const c = G.counters(p);
  if (c.go !== 4 || c.goList !== "website · how they serve · hours · services on Google" || c.stay !== 3 || c.stayList !== "name and phone (their OK) · areas (the site doesn't name them)") fail(`admin's counters aren't the mockup's: ${JSON.stringify(c)}`);
  const h = G.headsUp({ goes: "2026-11-12" }, p);
  if (h.head !== "RGA goes ahead on Thu, Nov 12 with what Google and your website agree on." || h.small !== "That's your website, how you serve customers, your hours and the services already on Google. Your name, phone and areas stay exactly as Google has them until you say. If you press Looks right or fix a row before then, your answer wins." || h.sub !== "RGA goes ahead on Thu, Nov 12 if you're busy") fail(`the heads-up isn't the mockup's words: ${JSON.stringify(h)}`);
  if (G.doneWords(row(p, "areas")).sub !== "Your website names Culver City only, so RGA didn't go ahead. Nothing was added or removed." || G.doneWords(row(p, "areas")).chip.text !== "3 · Not changed") fail(`the areas row's done words: ${JSON.stringify(G.doneWords(row(p, "areas")))}`);
  if (G.doneWords(row(p, "hours")).sub !== "From Google. Your website doesn't list hours, so nothing disagreed.") fail("the hours row's done words aren't the mockup's");
  if (G.doneWords(row(p, "services")).chip.text !== "1 on Google") fail("the services chip isn't \"1 on Google\"");
  // all areas named → kept
  const all = G.plan({ g: AGENCY, site: { ...AGENCY_SITE, text: "We serve El Segundo, Culver City and all of Los Angeles." }, record: REC("northwind.test") });
  if (row(all, "areas").result !== "went_ahead") fail("areas: every town named on the site should go ahead");
  // the storefront: same street on both = how they serve goes ahead; a suffix and & are the same name; a phone written two ways is the same phone
  const b = G.plan({ g: BAKERY, site: BAKERY_SITE, record: REC("https://cornerbakery.test/") });
  if (row(b, "serve").why !== "same_street" || row(b, "name").why !== "needs_client_ok" || row(b, "phone").why !== "needs_client_ok" || row(b, "hours").why !== "site_same" || b.open_on.length) fail(`the storefront bakery: ${JSON.stringify(b.rows.map((r) => [r.key, r.why]))}`);
  if (b.rows.some((r) => r.key === "areas")) fail("a storefront with no service area gets no areas row");
  const b2 = G.plan({ g: BAKERY, site: { ...BAKERY_SITE, street: { found: true, text: "9 Oak Ave, Springfield" } }, record: REC("cornerbakery.test") });
  if (row(b2, "serve").result !== "left" || row(b2, "serve").why !== "site_differs") fail("a different street on the site must not go ahead");
  const b3 = G.plan({ g: AGENCY, site: { ...AGENCY_SITE, street: { found: true, text: "77 Ocean Blvd, Culver City, CA 90230" } }, record: REC("northwind.test") });
  if (row(b3, "serve").why !== "site_shows_address") fail("a site showing a street address while Google hides it must not go ahead");
  // two phones: agree if Google's is one of them; a different phone keeps step 3 open on that row only
  const pl = G.plan({ g: PLUMBER, site: PLUMBER_SITE, record: REC("acmeplumbing.test") });
  if (row(pl, "phone").why !== "needs_client_ok" || pl.open_on.length) fail("two phones on the site, one is Google's: that agrees");
  if (row(pl, "hours").why !== "site_differs" || pl.close["m1.gbp.hours_attributes"]) fail("hours: a site showing another week must hold the hours");
  const pd = G.plan({ g: PLUMBER, site: { ...PLUMBER_SITE, phones: ["(555) 010-9999"] }, record: REC("acmeplumbing.test") });
  if (row(pd, "phone").why !== "site_differs" || !eq(pd.open_on, ["phone"]) || pd.close["m1.gbp.business_facts"] !== false || !pd.close["m1.gbp.attributes"]) fail(`a different phone: step 3 stays open on that row only (${JSON.stringify({ open_on: pd.open_on, close: pd.close })})`);
  const pn = G.plan({ g: PLUMBER, site: { ...PLUMBER_SITE, name: "Ace Drains" }, record: REC("acmeplumbing.test") });
  if (!eq(pn.open_on, ["name"])) fail("a different name on the site keeps step 3 open on the name");
  // outside the US: a street can't be proven absent → how they serve is left, never "agrees"
  const li = G.plan({ g: LISBON, site: LISBON_SITE, record: REC("casaazul.test") });
  if (row(li, "serve").why !== "site_cant_tell" || row(li, "phone").why !== "needs_client_ok" || row(li, "areas").result !== "went_ahead") fail(`the Lisbon business: ${JSON.stringify(li.rows.map((r) => [r.key, r.why]))}`);
  // hours the site shows that we couldn't read → held; Google with no hours → nothing goes ahead
  if (row(G.plan({ g: AGENCY, site: { ...AGENCY_SITE, hours: { kind: "unparsed" } }, record: REC("northwind.test") }), "hours").why !== "site_cant_tell") fail("hours we couldn't compare must hold, never read as \"none\"");
  if (row(G.plan({ g: { ...AGENCY, hours: { has: false, days: {} } }, site: AGENCY_SITE, record: REC("northwind.test") }), "hours").result !== "left") fail("no hours on Google: nothing goes ahead");
  // services: keep only Google's; nothing on Google = nothing to keep
  const ns = G.plan({ g: { ...AGENCY, services: { ...AGENCY.services, on: [] } }, site: AGENCY_SITE, record: REC("northwind.test") });
  if (row(ns, "services").result !== "left" || ns.close["m1.gbp.services_products"]) fail("services: with none on Google nothing goes ahead");
  // the website: Google's must be the record's
  if (row(G.plan({ g: AGENCY, site: AGENCY_SITE, record: REC("someoneelse.test") }), "website").why !== "differs_record") fail("website: Google's site differing from the record must not go ahead");
  // Google unread → no plan at all
  if (G.plan({ g: { ...AGENCY, hours: null }, site: AGENCY_SITE, record: {} }).ok) fail("Google unread must plan nothing");
  // the site parser: v2-audit's patterns + markup + plain hours lines; a page drawn by script is "couldn't read"
  const H = S.hoursFromText("Hours: Mon - Fri: 9am - 6pm, Sat 10am-2pm, Sun closed");
  if (!H || !H.mon || H.mon.open !== "09:00" || H.sat.close !== "14:00" || !H.sun.closed) fail(`plain hours text isn't read: ${JSON.stringify(H)}`);
  if (!(S.hoursFromText("We're open 24 hours") || {}).unparsed) fail("unreadable hours text must say unparsed");
  if (S.hoursFromText("Family owned since 1990.") !== null) fail("no hours text must be null");
  const mk = S.hoursFromMarkup([{ openingHoursSpecification: [{ dayOfWeek: ["Monday", "Tuesday"], opens: "09:00", closes: "17:00" }, { dayOfWeek: "https://schema.org/Saturday", opens: "00:00", closes: "00:00" }] }]);
  if (!mk || mk.mon.open !== "09:00" || !mk.sat.closed) fail(`markup hours aren't read: ${JSON.stringify(mk)}`);
}

// ── fake world for the server paths ──
function world({ mode = "managed", data, client = { website_url: "northwind.test" }, google = AGENCY, site = AGENCY_SITE, siteFn = null, conn = { token: "t", loc: "locations/1" } } = {}) {
  const db = { rec: { id: "r1", data: clone(data) }, writes: [], activity: [] };
  const calls = { google: [], site: [], connect: 0 };
  const supa = async (p, init = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (p.startsWith("/client_onboarding_records")) {
      if (m === "PATCH") { db.writes.push(clone(JSON.parse(init.body))); db.rec.data = clone(JSON.parse(init.body).data); return []; }
      return [clone(db.rec)];
    }
    if (p.startsWith("/clients")) return [client];
    if (p.startsWith("/client_activity")) { db.activity.push(JSON.parse(init.body)); return [{}]; }
    throw new Error(`unexpected ${m} ${p}`);
  };
  const d = { supa, mode, now: () => at("2026-11-12", "10:30"), fetch: async () => { throw new Error("no network in the gate"); },
    connect: async () => { calls.connect++; return conn; },
    readForStep: async (id) => { calls.google.push(id); const k = { "m1.gbp.business_facts": "facts", "m1.gbp.hours_attributes": "hours", "m1.gbp.services_products": "services", "m1.gbp.attributes": "attrs" }[id]; if (!google || google[k] == null) throw new Error("Google didn't answer"); return clone(google[k]); },
    readSite: async (url, o) => { calls.site.push(url); return siteFn ? siteFn(url, o) : clone(site); },
    record: async (o) => { db.activity.push(o); return { activity: true }; } };
  return { d, db, calls };
}
// a managed client whose step 3 is the client's move (the four covered steps open, verified, earlier steps done)
const BASE = () => {
  const T = { "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T16:00:00Z", completed_by: "client" }, "m1.access.website": { status: "done", client_input: { via: "invite" } },
    "m1.access.gbp": { status: "done" }, "m1.access.analytics": { status: "done" }, "m1.access.search_console": { status: "done" }, "m1.audit.gbp_duplicate": { status: "done", outcome_data: { verdict: "clean", duplicates: [] } },
    "m1.gbp.verify": { status: "done", detected: { verdict: "confirmed" } }, "m1.gbp.business_facts": { status: "pending" }, "m1.gbp.hours_attributes": { status: "pending" }, "m1.gbp.services_products": { status: "pending", draft: "Local SEO\nCitations" }, "m1.gbp.attributes": { status: "pending" } };
  // every other playbook prerequisite of the covered steps is done, so the covered steps are the client's move
  for (const s of req("../../data/playbooks/playbooks.json").month1 || []) if (!T[s.id] && !["m1.gbp.business_facts", "m1.gbp.hours_attributes", "m1.gbp.services_products", "m1.gbp.attributes"].includes(s.id)) T[s.id] = { status: "done", completed_at: "2026-10-20T00:00:00Z" };
  return T;
};
const DUE = (extra = {}) => ({ tasks: BASE(), step3_rule: { day1: { at: DAY1, by: "portal" } }, ...extra });
const ONLY = ["status", "completed_at", "completed_by", "go_ahead"];
const changedKeys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => !eq((a || {})[k], (b || {})[k]));

const OUT = "/private/tmp/claude-501/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/170203bc-8331-4a47-8081-5214ffc03016/scratchpad/g7";
const { bootPortal } = await import("./lib/portal-boot-harness.mjs");
const { SCENARIOS } = await import("./lib/managed-portal-scenarios.mjs");
const tk = (ms) => new Promise((r) => setTimeout(r, ms));
async function look(name, data, clock) {
  const P = SCENARIOS.plumber;
  const h = await bootPortal({ mode: "managed", stage: "stage_4_onboarding", clock: new Date(clock).toISOString(), tasks: data.tasks, onboarding: { step3_rule: data.step3_rule }, now: P.now, verify: P.verify, website: P.website });
  try {
    await h.page.goto(`${h.base}/portal/`, { waitUntil: "domcontentloaded" });
    await h.ready("[id^='action-items-list-'] .pm-step-row", 30000);
    await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click()); await tk(2500);
    console.log(name, await h.page.evaluate(() => { const l = document.querySelector("[id^='action-items-list-']"); const d = (l && l._onboarding && l._onboarding.data) || {}; const G = globalThis.rgaStep3GoAhead; return JSON.stringify({ now: new Date().toISOString(), rule: d.step3_rule ? Object.keys(d.step3_rule) : null, st: G && G.standing(d, true, Date.now()), mode: !!(globalThis.rgaPortalMode) }); }));
    const el = await h.page.$('[id="step-row-managed.check_found"]');
    if (!el) { console.log(name, "NO STEP 3 ROW", h.errs.slice(0, 2)); return; }
    await el.evaluate((e) => { if (e.classList.contains("is-collapsed")) e.querySelector("[data-step-toggle]")?.click(); e.scrollIntoView({ block: "start" }); }); await tk(1500);
    const H = await el.evaluate((e) => Math.ceil(e.getBoundingClientRect().height)); await h.page.setViewport({ width: 1280, height: Math.min(H + 200, 6000) }); await tk(500);
    await el.evaluate((e) => e.scrollIntoView({ block: "start" })); await tk(400);
    await el.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name, "errs", h.errs.length);
  } finally { await h.close(); }
}
{ const w = world({ data: DUE() }); w.d.now = () => at("2026-11-09", "10:30"); const r = await X.nightlyPass(CID, w.d); console.log("nightly day5:", JSON.stringify(r).slice(0, 200), "preview keys:", Object.keys(w.db.rec.data.step3_rule || {})); await look("day5-heads-up", w.db.rec.data, at("2026-11-09", "20:00")); }
{ const w = world({ data: DUE() }); await X.nightlyPass(CID, w.d); await look("after-day7-went-ahead", w.db.rec.data, at("2026-11-12", "20:00")); }
process.exit(0);
