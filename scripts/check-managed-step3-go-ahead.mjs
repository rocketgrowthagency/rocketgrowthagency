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
function world({ mode = "managed", data, client = { website_url: "northwind.test" }, google = AGENCY, site = AGENCY_SITE, siteFn = null, conn = { token: "t", loc: "locations/1" }, lose = false } = {}) {
  const db = { rec: { id: "r1", data: clone(data) }, writes: [], activity: [] };
  const calls = { google: [], site: [], connect: 0 };
  const supa = async (p, init = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (p.startsWith("/client_onboarding_records")) {
      if (m === "PATCH") { db.writes.push(clone(JSON.parse(init.body))); if (!lose) db.rec.data = clone(JSON.parse(init.body).data); return []; }   // lose: the write never lands (read back finds the old record)
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

// 11-6 night fixer: a write that doesn't land is said, never treated as done (no go-ahead notice recorded, no crash)
{ const w = world({ data: DUE(), lose: true }); let r;
  try { r = await X.nightlyPass(CID, w.d); } catch (e) { r = { threw: String(e.message || e) }; }
  if (!r || r.error !== "the record didn't read back" || w.db.activity.some((a) => a.kind === "step3_go_ahead")) fail(`a go-ahead whose write didn't land isn't reported as not read back: ${JSON.stringify(r).slice(0, 160)}`); }
// ── 8 · the go-ahead, the night after day 7: only untouched steps, only the four keys ──
{
  const before = DUE();
  const w = world({ data: before });
  const r = await X.nightlyPass(CID, w.d);
  const t = w.db.rec.data.tasks;
  if (!eq((r.went_ahead || []).slice().sort(), G.COVERED.slice().sort())) fail(`the due night should go ahead on the four covered steps: ${JSON.stringify(r)}`);
  for (const id of G.COVERED) {
    const ks = changedKeys(before.tasks[id], t[id]);
    if (ks.some((k) => !ONLY.includes(k))) fail(`${id}: the go-ahead wrote ${ks.filter((k) => !ONLY.includes(k)).join(", ")} (only ${ONLY.join(", ")} may change)`);
    if (t[id].client_input !== undefined || t[id].google_push || t[id].core_changes) fail(`${id}: the go-ahead wrote an answer, a Google push or a core change`);
    if (t[id].status !== "done" || t[id].completed_by !== "rga") fail(`${id}: not done by RGA after the go-ahead`);
  }
  const rows = G.COVERED.flatMap((id) => (t[id].go_ahead || {}).rows || []);
  if (rows.some((x) => ["name", "phone"].includes(x.key) && x.result !== "left")) fail("name or phone was marked as gone ahead");
  if (!t["m1.gbp.business_facts"].go_ahead.site_read || t["m1.gbp.business_facts"].go_ahead.site_read.ok !== true || "text" in t["m1.gbp.business_facts"].go_ahead.site_read) fail("the record keeps the site read's stamp (and never the page's text)");
  if (!w.db.rec.data.step3_rule.went_ahead || w.db.rec.data.step3_rule.went_ahead.by !== "nightly check") fail("the rule doesn't record who went ahead");
  if (w.db.activity.filter((a) => a.kind === "step3_go_ahead").length !== 4) fail("one activity line per step went ahead is missing");
  for (const [k, v] of Object.entries(before.tasks)) if (!G.COVERED.includes(k) && !eq(v, t[k])) fail(`the go-ahead changed ${k}, a step it doesn't cover`);
  // a second night: never again by itself
  const w2 = world({ data: w.db.rec.data });
  const r2 = await X.nightlyPass(CID, w2.d);
  if (w2.db.writes.length || w2.calls.google.length || r2.step3 !== "went_ahead") fail(`a client already gone ahead was read or written again: ${JSON.stringify(r2)}`);
  // ── 5 · UNDO: exactly back, then held ──
  const w3 = world({ data: w.db.rec.data });
  const u = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "undo" }) }, { ...w3.d, requireWorkspaceForClient: async () => ({ email: "rga@example.test" }), requirePortalOwnerOrWorkspace: async () => ({}), clientMode: async () => "managed" });
  const ut = w3.db.rec.data.tasks;
  if (u.statusCode !== 200) fail(`Undo answered ${u.statusCode} ${u.body}`);
  for (const id of G.COVERED) if (!eq(ut[id], before.tasks[id])) fail(`Undo didn't restore ${id} exactly: ${JSON.stringify(ut[id])} vs ${JSON.stringify(before.tasks[id])}`);
  if (!eq(Object.keys(ut).sort(), Object.keys(before.tasks).sort())) fail("Undo added or removed a step");
  const ur = w3.db.rec.data.step3_rule;
  if (!ur.hold || ur.hold.why !== "undo" || !ur.went_ahead.undone_at) fail("after Undo the rule must be held and the go-ahead marked undone");
  const w4 = world({ data: w3.db.rec.data });
  const r4 = await X.nightlyPass(CID, w4.d);
  if (w4.calls.google.length || w4.db.writes.length || r4.step3 !== "held") fail(`after Undo the next night must do nothing (held): ${JSON.stringify(r4)}`);
  // pure undo round-trip on unusual shapes: absent keys stay absent, a step answered since is left alone
  const odd = { ...BASE(), "m1.gbp.business_facts": { status: "in_progress", later: { until: "2026-11-20" }, started_at: "2026-11-05T20:00:00Z" } };
  const p = G.plan({ g: AGENCY, site: AGENCY_SITE, record: REC("northwind.test") });
  const ap = G.applyPlan(odd, p, "2026-11-12T10:30:00.000Z", null);
  if (!eq(G.undoPlan(ap.tasks).tasks, odd)) fail("the pure undo isn't an exact round trip");
  const answered = clone(ap.tasks); answered["m1.gbp.hours_attributes"].client_input = { days: WEEK("08:00", "16:00") };
  const un = G.undoPlan(answered);
  if (un.restored.includes("m1.gbp.hours_attributes") || !eq(un.tasks["m1.gbp.hours_attributes"], answered["m1.gbp.hours_attributes"])) fail("Undo touched a step the client answered after the go-ahead");
}

// ── 10 · GUARDS ──
{
  for (const mode of ["self_serve", null]) { const w = world({ mode, data: DUE() }); const r = await X.nightlyPass(CID, w.d); if (r.step3 !== "off" || w.db.writes.length || w.calls.google.length) fail(`a ${mode || "no-mode"} client was touched: ${JSON.stringify(r)}`); }
  // step 3 done (RGA's own record's shape: every covered step finished): nothing read, nothing written
  const done = DUE(); for (const id of G.COVERED) done.tasks[id] = { status: "done", completed_at: "2026-10-29T00:00:00Z", completed_by: "client", client_input: {} };
  const wd = world({ data: done }); const rd = await X.nightlyPass(CID, wd.d);
  if (rd.step3 !== "done" || wd.db.writes.length || wd.calls.google.length || wd.calls.site.length) fail(`a client whose step 3 is done was read or written: ${JSON.stringify(rd)}`);
  const hd = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "hold" }) }, { ...wd.d, requireWorkspaceForClient: async () => ({}), clientMode: async () => "managed" });
  if (hd.statusCode !== 409 || wd.db.writes.length) fail("Hold on a finished step 3 must be refused");
  // unverified: nothing read, nothing goes ahead
  const uv = DUE(); uv.tasks["m1.gbp.verify"] = { status: "pending" };
  const wu = world({ data: uv }); const ru = await X.nightlyPass(CID, wu.d);
  if (ru.step3 !== "waits_verify" || wu.calls.google.length || wu.db.writes.length) fail(`an unverified client was read or gone ahead: ${JSON.stringify(ru)}`);
  const lost = DUE(); lost.tasks["m1.gbp.verify"].reverify = { state: "lost", at: "2026-11-10T00:00:00Z" };
  if (G.standing(lost, true, at("2026-11-12", "10:30")).state !== "waits_verify") fail("Google asking to verify again must stop it");
  // touched steps are never closed: answered, flagged, RGA changing it, a core change open
  const mix = DUE();
  mix.tasks["m1.gbp.hours_attributes"] = { status: "pending", client_input: { days: WEEK("08:00", "16:00") } };
  mix.tasks["m1.gbp.services_products"] = { status: "pending", client_flagged: { at: "2026-11-10T00:00:00Z" } };
  mix.tasks["m1.gbp.business_facts"] = { status: "in_progress", google_push: { state: "with_rga", rga: [{ fact: "name" }] } };
  const wm = world({ data: mix }); const rm = await X.nightlyPass(CID, wm.d);
  if (!eq(rm.went_ahead, ["m1.gbp.attributes"])) fail(`only the untouched step may go ahead: ${JSON.stringify(rm.went_ahead)}`);
  for (const id of ["m1.gbp.hours_attributes", "m1.gbp.services_products", "m1.gbp.business_facts"]) if (!eq(wm.db.rec.data.tasks[id], mix.tasks[id])) fail(`${id} (touched) was changed by the go-ahead`);
  // not the client's move yet (verify open) → no day 1 stamp
  const ns = { tasks: { ...BASE(), "m1.gbp.verify": { status: "pending" } } };
  const wn = world({ data: ns }); await X.nightlyPass(CID, wn.d);
  if ((wn.db.rec.data.step3_rule || {}).day1) fail("day 1 was stamped while step 3 wasn't the client's move");
  // the client's move → the nightly stamps day 1 once, and reads the preview
  const wf = world({ data: { tasks: BASE() } }); wf.d.now = () => at("2026-11-05", "10:30");
  const rf = await X.nightlyPass(CID, wf.d);
  const st1 = wf.db.rec.data.step3_rule;
  if (!rf.stamped || !st1.day1 || st1.day1.by !== "nightly check" || !st1.preview || !st1.preview.ok) fail(`the nightly didn't stamp day 1 and read the preview: ${JSON.stringify(rf)}`);
  if (G.COVERED.some((id) => wf.db.rec.data.tasks[id].status === "done")) fail("day 1 went ahead (it must wait 7 days)");
  const again = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "day1" }) }, { ...wf.d, requirePortalOwnerOrWorkspace: async () => ({ email: "client@example.test" }), clientMode: async () => "managed" });
  if (!JSON.parse(again.body).already || wf.db.rec.data.step3_rule.day1.at !== st1.day1.at) fail("a second day-1 stamp replaced the first");
  // the portal's stamp: refused when step 3 isn't the client's move; stamped and read back when it is
  const wp = world({ data: ns });
  const rp = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "day1" }) }, { ...wp.d, requirePortalOwnerOrWorkspace: async () => ({ email: "client@example.test" }), clientMode: async () => "managed" });
  if (rp.statusCode !== 409 || wp.db.writes.length) fail("the portal's day-1 stamp must be refused while step 3 isn't the client's move");
  const wq = world({ data: { tasks: BASE() } }); wq.d.now = () => at("2026-11-05", "20:00");
  const rq = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "day1" }) }, { ...wq.d, requirePortalOwnerOrWorkspace: async () => ({ email: "client@example.test" }), clientMode: async () => "managed" });
  if (rq.statusCode !== 200 || (wq.db.rec.data.step3_rule.day1 || {}).by !== "portal") fail(`the portal's day-1 stamp didn't save: ${rq.body}`);
  const rs = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "day1" }) }, { ...wq.d, requirePortalOwnerOrWorkspace: async () => ({}), clientMode: async () => "self_serve" });
  if (rs.statusCode !== 409) fail("a self-serve client's day-1 stamp must be refused");
}

// ── 4 · HOLD and LIFT ──
{
  const w = world({ data: DUE() });
  const D = { ...w.d, requireWorkspaceForClient: async () => ({ email: "rga@example.test" }), clientMode: async () => "managed" };
  const h = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "hold" }) }, D);
  if (h.statusCode !== 200 || !(w.db.rec.data.step3_rule.hold || {}).at) fail(`Hold didn't save: ${h.body}`);
  const w2 = world({ data: w.db.rec.data }); const r2 = await X.nightlyPass(CID, w2.d);
  if (r2.step3 !== "held" || w2.calls.google.length || w2.calls.site.length || w2.db.writes.length) fail(`a held client was read or gone ahead: ${JSON.stringify(r2)}`);
  if (G.standing(w.db.rec.data, true, at("2026-11-10")).headsUp) fail("a held client must not get the heads-up");
  const l = await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "lift" }) }, { ...D, supa: w.d.supa });
  if (l.statusCode !== 200 || w.db.rec.data.step3_rule.hold) fail(`Lift didn't save: ${l.body}`);
  const w3 = world({ data: w.db.rec.data }); const r3 = await X.nightlyPass(CID, w3.d);
  if (!r3.went_ahead) fail("after Lift the due night must go ahead");
}

// ── 6 · NO WEBSITE ──
{
  const nw = DUE(); nw.tasks["m1.access.website"] = { status: "done", client_input: { via: "none" } };
  const g = clone(AGENCY); g.facts.website = "";
  const w = world({ data: nw, client: { website_url: null }, google: g });
  const r = await X.nightlyPass(CID, w.d);
  const rows = G.COVERED.flatMap((id) => (w.db.rec.data.tasks[id].go_ahead || {}).rows || []);
  const by = Object.fromEntries(rows.map((x) => [x.key, `${x.result}:${x.why}`]));
  if (w.calls.site.length) fail("a client with no website had a website fetched");
  if (by.serve !== "went_ahead:google_only" || by.hours !== "went_ahead:google_only" || by.name !== "left:needs_client_ok" || by.areas !== "left:no_website" || by.website !== "left:no_website") fail(`no website: ${JSON.stringify(by)}`);
  if (G.doneWords(rows.find((x) => x.key === "hours")).sub !== "From Google; you don't have a website to compare.") fail("no website: the hours row isn't labeled \"From Google; you don't have a website to compare.\"");
  if (!r.went_ahead) fail("no website: the go-ahead didn't run");
  const hu = G.headsUp({ goes: "2026-11-12" }, w.db.rec.data.step3_rule.preview);
  if (hu.head !== "RGA goes ahead on Thu, Nov 12 with what Google shows.") fail(`no website: the heads-up says it compares a website (${hu.head})`);
}

// ── 7 · A SITE THAT CAN'T BE READ ──
{
  // the reader itself: refused, timed out, drawn by script → couldn't read
  const ans = (status, html) => async () => ({ ok: status < 400, status, url: "https://x.test/", text: async () => html });
  if ((await S.readSite("x.test", { fetch: ans(403, "") })).why !== "http_403") fail("a refused site isn't \"couldn't read\"");
  if ((await S.readSite("x.test", { fetch: ans(200, "<html><body><div id=app></div><script>render()</script></body></html>") })).why !== "no_text") fail("a page drawn by script must be \"couldn't read\", never \"no hours, no address\"");
  if ((await S.readSite("x.test", { fetch: async () => { throw new Error("ECONNRESET"); } })).ok) fail("a site that doesn't answer read as read");
  if ((await S.readSite("not a url", { fetch: ans(200, "") })).why !== "no_url") fail("junk typed as a website must not be fetched");
  const page = `<html><head><script type="application/ld+json">{"@type":"Plumber","name":"Acme Plumbing","telephone":"+1-555-010-1234","address":{"@type":"PostalAddress","addressLocality":"Springfield"}}</script></head><body>${"Acme Plumbing serves Springfield and Shelbyville. ".repeat(8)}<a href="tel:+15550101234">Call</a><a href="/contact-us">Contact</a></body></html>`;
  const two = []; const ok = await S.readSite("acmeplumbing.test", { fetch: async (u) => { two.push(u); return { ok: true, status: 200, url: u, text: async () => (/contact/.test(u) ? `<p>${"Hours: Mon - Fri: 8am - 5pm. ".repeat(10)}</p>` : page) }; } });
  if (!ok.ok || ok.name !== "Acme Plumbing" || !ok.phones.length || ok.street.found !== false || ok.hours.kind !== "week" || two.length !== 2) fail(`a real page + its contact page aren't read: ${JSON.stringify({ ok: ok.ok, name: ok.name, phones: ok.phones, street: ok.street, hours: ok.hours, pages: two })}`);
  // the nightly: nothing goes ahead, one night counted per night, RGA's move after 3, then a good read goes ahead and clears it
  let data = DUE(), nights = 0;
  for (const d of ["2026-11-12", "2026-11-12", "2026-11-13", "2026-11-14"]) {
    const w = world({ data, siteFn: () => ({ ok: false, url: "https://www.northwind.test", at: `${d}T10:30:40Z`, why: "timeout" }) });
    w.d.now = () => at(d, "10:30");
    const r = await X.nightlyPass(CID, w.d);
    if (r.went_ahead) fail(`${d}: the go-ahead ran on a site it couldn't read`);
    data = w.db.rec.data;
    nights = (data.step3_rule.site_fail || {}).nights;
  }
  if (nights !== 3) fail(`three nights unread should count 3 (the same night twice counts once), got ${nights}`);
  if (data.step3_rule.preview.ok || data.step3_rule.preview.why !== "site_unread") fail("the preview must say the site wasn't read, never a plan");
  const moves = OM.openMoves({ playbooks: req("../../data/playbooks/playbooks.json"), data, mode: "managed", now: "2026-11-14T12:00:00Z" });
  const m = moves.find((x) => x.kind === "site_unread");
  if (!m || m.owner !== "rga" || m.what !== "Couldn't read the website" || m.step_id !== "m1.gbp.business_facts") fail(`after 3 nights it isn't RGA's move "Couldn't read the website": ${JSON.stringify(m)}`);
  if (OM.clientMoves(moves, req("../../data/playbooks/playbooks.json")).some((x) => x.kind === "site_unread")) fail("RGA's site move leaked to the client's list");
  const w5 = world({ data }); w5.d.now = () => at("2026-11-15", "10:30");
  const r5 = await X.nightlyPass(CID, w5.d);
  if (!r5.went_ahead || w5.db.rec.data.step3_rule.site_fail) fail("a good read after unread nights must go ahead and clear the count");
  // To do: each client move of step 3 says the day it goes ahead
  const cm = OM.openMoves({ playbooks: req("../../data/playbooks/playbooks.json"), data: DUE(), mode: "managed", now: "2026-11-10T12:00:00Z" }).filter((x) => x.owner === "client" && G.COVERED.includes(x.step_id));
  if (!cm.length || cm.some((x) => x.go_ahead_on !== "2026-11-12")) fail(`To do's client moves for step 3 don't carry the go-ahead day: ${JSON.stringify(cm.map((x) => [x.step_id, x.go_ahead_on]))}`);
  if (OM.openMoves({ playbooks: req("../../data/playbooks/playbooks.json"), data: DUE(), mode: "self_serve", now: "2026-11-10T12:00:00Z" }).some((x) => x.go_ahead_on)) fail("a self-serve client's To do carries a go-ahead day");
}

// ── 9 · NEVER WRITES TO GOOGLE: the REAL readers, a fetch that records every request ──
{
  const reqs = [];
  const blob = { title: "Northwind Marketing", phoneNumbers: { primaryPhone: "(424) 555-0140" }, websiteUri: "https://www.northwind.test/", serviceArea: { places: { placeInfos: [{ placeName: "Culver City, CA, USA" }] } },
    categories: { primaryCategory: { name: "categories/gcid:marketing_agency", displayName: "Marketing agency" } }, regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 18 } }] },
    attributes: [], attributeMetadata: [], serviceItems: [], metadata: {} };
  const fetchSpy = async (u, init = {}) => {
    reqs.push({ u: String(u), m: String((init && init.method) || "GET").toUpperCase() });
    if (/googleapis\.com/.test(String(u))) return { ok: true, status: 200, json: async () => clone(blob), text: async () => JSON.stringify(blob) };
    return { ok: true, status: 200, url: String(u), text: async () => `<html><body>${"Northwind Marketing in Culver City. ".repeat(10)}</body></html>` };
  };
  const w = world({ data: DUE() });
  const d = { ...w.d, fetch: fetchSpy, readForStep: GP.readForStep, readSite: S.readSite };
  await X.nightlyPass(CID, d);
  const w2 = world({ data: DUE() });
  await X.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "read" }) }, { ...w2.d, fetch: fetchSpy, readForStep: GP.readForStep, readSite: S.readSite, requireWorkspaceForClient: async () => ({}), clientMode: async () => "managed" });
  const gReq = reqs.filter((r) => /googleapis\.com/.test(r.u));
  if (!gReq.length) can("the real Google readers made no request (the proof can't run)");
  const writes = gReq.filter((r) => r.m !== "GET");
  if (writes.length) fail(`the go-ahead sent ${writes.map((r) => `${r.m} ${r.u}`).join(" · ")} to Google`);
  for (const f of ["netlify/functions/_step3-go-ahead.js", "netlify/functions/_site-read.js", "netlify/functions/portal-step3-go-ahead.js", "shared/step3-go-ahead.js"]) {
    const src = read(f).replace(/\/\/.*$/gm, "");
    if (/applyForStep|applyFacts|applyServices|patchHours|patchAttrs|sendApproved|nightlyChoice|method:\s*["'](?:POST|PUT)["']/.test(src)) fail(`${f} names a Google writer`);
  }
  // the record write is the only PATCH, and nothing is mailed
  if (w.db.writes.length !== 1) fail(`the nightly wrote the record ${w.db.writes.length} times (one read-back write expected)`);
  if (/notify-rga|send-step-email|sendEmail|resend/i.test(read("netlify/functions/_step3-go-ahead.js").replace(/\/\/.*$/gm, ""))) fail("the go-ahead sends an email (decision 8: none)");
}

// ── wiring: the nightly runs it, the portal and admin load the rule ──
{
  const watch = read("netlify/functions/gbp-profile-watch.js"), toml = read("netlify.toml");
  if (!/require\("\.\/_step3-go-ahead"\)\.nightlyPass\(clientId/.test(watch)) fail("gbp-profile-watch doesn't run the go-ahead's nightly pass");
  if (!/\[functions\."gbp-profile-watch"\]\s*\n\s*schedule = "30 10 \* \* \*"/.test(toml)) fail("gbp-profile-watch's 10:30 UTC schedule moved (the words say about 2:30 AM Pacific)");
  if (!/import "\/shared\/step3-go-ahead\.js\?v=/.test(read("admin/admin.js"))) fail("admin doesn't import shared/step3-go-ahead.js");
  if (!/import "\/shared\/step3-go-ahead\.js\?v=/.test(read("portal/portal.js"))) fail("the portal doesn't import shared/step3-go-ahead.js");
}

// ── 12 · ADMIN STEP 28, lifted ──
{
  const A = read("admin/admin.js");
  const i = A.indexOf("// ── 28 · managed step 3's 7-day rule"), j = A.indexOf("// ═══ MANAGED WORKING CARDS END");
  if (i < 0 || j < i) can("admin.js has no 7-day rule block where it was");
  const block = A.slice(i, j);
  const mvI = A.indexOf("function mvClientRowHtml(g) {"), mvJ = A.indexOf("\n}\n", mvI);
  const draw = (data, { managed = true } = {}) => {
    const dom = new JSDOM(`<!doctype html><body><div id="h"></div></body>`, { runScripts: "outside-only" });
    const w = dom.window;
    w.state = { selectedClient: { id: CID, portal_mode: managed ? "managed" : "self_serve" }, onboardingData: data, flowM1State: data };
    w.eval(read("shared/step3-go-ahead.js"));
    w.eval(read("shared/portal-mode.js"));
    w.eval(`var escapeHtml = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); var escapeAttribute = escapeHtml;
      var NUM = { "m1.gbp.verify": 27, "m1.gbp.business_facts": 28, "m1.gbp.services_products": 32, "m1.gbp.hours_attributes": 34, "m1.gbp.attributes": 35 };
      var _managedCheck = { managedStepNo: 3, clientLabel: "Check your business details on Google" };
      var obNumberOf = (id) => NUM[id] || null; var obStepRef = (id) => "step " + NUM[id]; var setBanner = () => {}; var mgBusy = () => {}; var renderOnboardingChecklist = () => {}; var authHeaders = async () => ({});
      var mgOn = () => globalThis.rgaPortalMode.isManaged(state.selectedClient.portal_mode);
      var mwNudge = (id) => '<button type="button" class="admin-button admin-button-secondary" data-step-nudge="' + id + '">Ask the client</button>';
      var rgaDialog = async (o) => { window.__dlg = o; return false; };
      var mvInitials = () => "NM"; var mvDay = (x) => "Nov 5"; var mvRemindable = () => false;`);
    w.eval(block + "\n" + A.slice(mvI, mvJ + 3) + "\nwindow.__x = { card: mwG7CardHtml, ptr: mwG7Ptr, pill: mwG7RowPill, mv: mvClientRowHtml };");
    CUR = w;
    return w;
  };
  // the card reads the page's own clock (the window's Date), so the clock is set there
  let CUR = null;
  const atNow = (ms, fn) => { const W = CUR; const real = W.Date.now; W.Date.now = () => ms; try { return fn(); } finally { W.Date.now = real; } };
  const p = G.plan({ g: AGENCY, site: AGENCY_SITE, record: REC("northwind.test") });
  const counting = { ...DUE(), step3_rule: { day1: { at: DAY1, by: "portal" }, preview: X.stored(p, "2026-11-10T10:30:00.000Z", { at: "2026-11-05T10:30:40Z", url: "https://www.northwind.test", ok: true }) } };
  const w = draw(counting);
  const h = w.document.getElementById("h");
  h.innerHTML = atNow(at("2026-11-10", "18:00"), () => w.__x.card());
  const txt = (s) => [...h.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, " ").trim());
  const lead = txt(".ob-g7-line")[0] || "";
  if (lead !== "The 7-day rule. Step 3 opened Thu, Nov 5. If the client doesn't answer, the nightly check goes ahead Thu, Nov 12, about 2:30 AM Pacific, with what Google and the website agree on. It writes to the record only, never to Google.") fail(`admin 28's line isn't the mockup's: «${lead}»`);
  const ctr = txt(".ob-g7-ctr > span");
  if (!eq(ctr, ['Day 6 of 7since step 3 first read "Your turn"', "4 go aheadwebsite · how they serve · hours · services on Google", "3 stay as Google has themname and phone (their OK) · areas (the site doesn't name them)"])) fail(`admin 28's counters: ${JSON.stringify(ctr)}`);
  const days = [...h.querySelectorAll(".ob-g7-days i")].map((x) => (x.classList.contains("left") ? 0 : 1)).join("");
  if (days !== "1111110") fail(`the 7 days should show 6 filled: ${days}`);
  const head = txt(".ob-g7-tbl th"), rowsT = [...h.querySelectorAll(".ob-g7-tbl tbody tr")].map((r) => [...r.children].map((c) => c.textContent.trim()));
  if (!eq(head, ["Row", "Google", "Website (read Nov 5)", "On Nov 12"])) fail(`the table head: ${JSON.stringify(head)}`);
  const firsts = rowsT.map((r) => r[0]), ons = rowsT.map((r) => r[3]);
  if (!eq(firsts, ["Verified (27)", "Business name", "Phone", "Website", "How they serve", "Areas", "Hours (34)", "Services (32)", "About you (35)"])) fail(`the table rows, in the mockup's order: ${JSON.stringify(firsts)}`);
  if (!eq(ons, ["Must pass · passed", "Stays · their OK", "Stays · their OK", "Goes ahead", "Goes ahead", "Stays · no match", "Goes ahead", "Keeps the 1", "Left blank"])) fail(`the table's last column: ${JSON.stringify(ons)}`);
  if (rowsT[2][1] !== "(424) 555-0140") fail(`the phone shows as Google has it (${rowsT[2][1]})`);
  const btns = txt(".ob-g7-btns button");
  if (!eq(btns, ["Ask the client", "Hold for this client", "Read the website again"])) fail(`admin 28's buttons: ${JSON.stringify(btns)}`);
  // held
  const held = { ...counting, step3_rule: { ...counting.step3_rule, hold: { at: "2026-11-09T18:00:00Z", by: "rga@example.test" } } };
  const wh = draw(held); const hh = wh.document.getElementById("h"); hh.innerHTML = atNow(at("2026-11-10"), () => wh.__x.card());
  if (![...hh.querySelectorAll(".ob-g7-btns button")].some((b) => b.textContent === "Lift the hold") || !/Held by RGA Nov 9/.test(hh.textContent)) fail("a held client's step 28 must say held and offer Lift the hold");
  // waiting on verification
  const uv = clone(counting); uv.tasks["m1.gbp.verify"] = { status: "pending" };
  const wv = draw(uv); const hv = wv.document.getElementById("h"); hv.innerHTML = atNow(at("2026-11-13"), () => wv.__x.card());
  if (!/Day 7 of 7Waits on verification/.test(hv.querySelector(".ob-g7-ctr span").textContent) || !/Must pass · waiting/.test(hv.textContent)) fail(`waiting on verification: the counter stops at 7 and says so (${hv.querySelector(".ob-g7-ctr span").textContent})`);
  // after
  const wa0 = world({ data: DUE() }); await X.nightlyPass(CID, wa0.d);
  const after = wa0.db.rec.data;
  const wa = draw(after); const ha = wa.document.getElementById("h"); ha.innerHTML = atNow(at("2026-11-12", "18:00"), () => wa.__x.card());
  const al = (ha.querySelector(".ob-g7-line") || {}).textContent || "";
  if (al.replace(/\s+/g, " ").trim() !== "Went ahead Thu, Nov 12, 2:30 AM Pacific, by the nightly check. Kept as Google shows: website, how they serve, hours, the 1 service. Left for the client: name, phone (their OK), areas (the site names Culver City only), the about-you details. Nothing was written to Google.") fail(`admin 28 after: «${al.replace(/\s+/g, " ").trim()}»`);
  if (!eq(txt(".ob-g7-btns button"), []) && false) void 0;
  const ab = [...ha.querySelectorAll(".ob-g7-btns button")].map((b) => b.textContent);
  if (!eq(ab, ["Undo the go-ahead", "Ask the client"])) fail(`admin 28 after: the buttons ${JSON.stringify(ab)}`);
  const pill = wa.__x.pill("m1.gbp.business_facts", after.tasks["m1.gbp.business_facts"]);
  if (!/Done · went ahead/.test(pill)) fail("a covered step the go-ahead closed doesn't read \"Done · went ahead\"");
  const answered = clone(after.tasks["m1.gbp.business_facts"]); answered.client_input = { name: "x" };
  if (wa.__x.pill("m1.gbp.business_facts", answered)) fail("a step the client answered after the go-ahead still reads \"went ahead\"");
  for (const id of ["m1.gbp.verify", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"]) if (!/The 7-day rule for client step 3 is on admin step 28\./.test(atNow(at("2026-11-12"), () => wa.__x.ptr(id)))) fail(`admin ${id} doesn't point to step 28`);
  if (atNow(at("2026-11-12"), () => wa.__x.ptr("m1.gbp.photos"))) fail("a step step 3 doesn't cover points to step 28");
  // Undo asks first, with the dialog's words; "Keep it" sends nothing
  const sent = []; wa.fetch = async (u, i) => { sent.push(u); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  ha.querySelector('[data-g7-act="undo"]').click();
  await new Promise((r) => setTimeout(r, 30));
  if (!wa.__dlg || wa.__dlg.title !== "Undo the go-ahead?" || sent.length) fail("Undo must ask first, and Keep it sends nothing");
  // self-serve, and a client whose step 3 is done: nothing
  const ws = draw(counting, { managed: false }); if (atNow(at("2026-11-10"), () => ws.__x.card() + ws.__x.ptr("m1.gbp.verify"))) fail("a self-serve client's step 28 draws the rule");
  const dn = clone(counting); for (const id of G.COVERED) dn.tasks[id] = { status: "done", client_input: {} };
  const wdn = draw(dn); if (atNow(at("2026-11-10"), () => wdn.__x.card())) fail("a client whose step 3 is done draws the rule");
  // To do's waiting row
  const mvh = w.__x.mv({ client_id: CID, client: "Northwind Marketing", moves: [{ owner: "client", step: "Step 3 · Check your business details on Google", step_id: "m1.gbp.business_facts", since: "2026-11-05T20:00:00Z", age_days: 5, go_ahead_on: "2026-11-12" }] });
  if (!/goes ahead Thu, Nov 12/.test(mvh)) fail("To do's waiting row doesn't say \"goes ahead Thu, Nov 12\"");
}

// ── 11 · THE PORTAL, drawn ──
{
  const P = await import("./lib/step3-go-ahead-portal.mjs").catch((e) => ({ err: e }));
  if (P.err) can(`the portal part can't load (${P.err.message})`);
  const out = await P.drawPortal({ SITE, G, X, AGENCY, AGENCY_SITE, BASE, DAY1, at, fail });
  if (String(out).startsWith("unavailable")) can(`the portal harness is unavailable (${out})`);
}
// 11-5 walk check: the title line ("RGA goes ahead on <day> if you're busy" · "RGA went ahead <day> · you can still fix anything") was in the
// page but hidden by `.pm-step-row:not(.is-collapsed) .pm-step-sub { display:none }` once the card opened; the mockup draws it open too
if (!/\.pm-step-row:not\(\.is-collapsed\) \.pm-step-sub\[data-g7-sub\] \{ display:block; \}/.test(read("portal/portal.css"))) fail("portal.css: step 3's 7-day title line is hidden while the card is open (the mockup shows it)");

if (F.length) { console.error(`❌ check-managed-step3-go-ahead: ${F.length} problem${F.length === 1 ? "" : "s"}`); for (const f of F) console.error(`  · ${f}`); process.exit(1); }
console.log("✅ check-managed-step3-go-ahead: day counting, the day-5 heads-up, every row's rule for six business shapes, Hold, Undo (exact), no website, an unreadable site (3 nights), never name/phone/address/category, never a Google write, the guards, admin step 28 and the portal hold");
