#!/usr/bin/env node
// check-citations-additions.mjs — the "build now" parts of the approved Citations additions (reports/mockups/citations_additions_v1.html, 11-01).
//
// WHAT IT HOLDS
//  1. THE NAP CHECK READS WHAT THE AUDIT FOUND (citation-audit.js). Listings the listings check found are the ones checked, not only the site's own links;
//     only rows from the audit's CURRENT method and really on that directory count; a page we could not read (403, 429, a page with no business details)
//     is "could not read", never wrong and never fine; only a page that is GONE (404/410) or plainly this business with a wrong detail is a fix.
//  2. THE STALE TEXT: "No listing found → step 52 will build it" and "it will prioritize the N you are not on" are gone; a search miss is never an absence.
//  3. THE LIST FITS THE CLIENT (_citation-trade.js): trade sets and country, any trade, any country, no website, no market. A directory left out is NOT
//     a missing one: it is never a row, never "No listing found", never sent to the build step. Never a US list for a client who may be elsewhere.
//  4. THE RECHECK (_citation-recheck.js): ships OFF; claim first; never within 7 days of the last; never a test client; a failed start is never retried;
//     nothing starts unless the provider's free count of searches left covers the run. No search is ever made here.
// Runs the SHIPPED modules against fake Supabase / fake pages: no network, no SerpAPI, no production data.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", QUO_WEBHOOK_TOKEN: "t", GOOGLE_OAUTH_CLIENT_ID: "i", GOOGLE_OAUTH_CLIENT_SECRET: "s" });
let route = null; const seen = [];
globalThis.fetch = async (url, init = {}) => { seen.push(String(url)); if (/serpapi\.com\/search/.test(String(url))) { fail(`a paid search was made: ${String(url).slice(0, 80)}`); return res(500, {}); } return route(String(url), init); };
const req = createRequire(`${SITE}/netlify/functions/`);
let CA, DIR, TR, RC;
try { CA = req("./citation-audit.js"); DIR = req("./_citation-directories.js"); TR = req("./_citation-trade.js"); RC = req("./_citation-recheck.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a citations module did not load: ${e.message}`); process.exit(2); }
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

// ── 2 · the stale text ──
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const cit = [...PB.month1].find((s) => s.id === "m1.audit.citations"), napStep = [...PB.month1].find((s) => s.id === "m1.audit.citations_nap");
if (!cit || /step 52 will build/i.test(cit.instructions) || /No listing found\s*→\s*step/i.test(cit.instructions)) fail("the listings check still promises step 52 will build what a search missed");
if (!/can miss a real listing/i.test(cit.instructions)) fail("the listings check doesn't say a search can miss a real listing");
if (!/found/i.test(napStep.instructions) || /ALREADY HOLD/.test(napStep.instructions)) fail("the NAP step's text still says it reads only what we already held");
const fx = read("netlify/functions/flow-execute.js");
if (/it will prioritize the/.test(fx)) fail("the listings summary still says the build step will prioritize the ones not found");
if (!/can miss a real listing/.test(fx)) fail("the listings summary doesn't say a search can miss a real listing");
const adm = read("admin/admin.js");
if (/finding listings needs a directory search we don't have yet/.test(adm)) fail("admin still says a directory search doesn't exist");
if (!/Could not read this page/.test(adm) || !/Left out for this client/.test(adm)) fail("admin doesn't draw the read listings and the left-out ones");
for (const [f, txt] of [["_citation-recheck.js", read("netlify/functions/_citation-recheck.js")], ["_citation-trade.js", read("netlify/functions/_citation-trade.js")]])
  if (/\b(has no listing|have no listing|you don't have a listing|isn't listed|not listed)\b/i.test(txt.replace(/^\s*\/\/.*$/gm, ""))) fail(`${f} tells a client they have no listing`);

// ── 3 · the list fits the client ──
// the trade sets are defined but not offered until the agreement names them, so the matrix runs with them on and a separate case holds the default
const keys = (c) => TR_use(c).use.map((d) => d.key);
const TR_use = (c) => DIR.directoriesForClient(c, { withTradeSets: true });
const CASES = [
  ["a US plumber gets the home marketplaces", { business_type: "Plumber", primary_market: "Austin, TX" }, { has: ["angi", "homeadvisor", "thumbtack", "yelp", "bbb"], not: ["healthgrades", "justia", "tripadvisor"] }],
  ["a US dentist does not get Angi, HomeAdvisor or Thumbtack", { business_type: "Dentist", industry: "Dental", primary_market: "Manchester, NH" }, { has: ["healthgrades", "zocdoc", "yelp"], not: ["angi", "homeadvisor", "thumbtack", "justia"] }],
  ["a lawyer (plural, no trade words elsewhere) gets the legal set", { industry: "Personal injury lawyers", primary_market: "Ontario, CA" }, { has: ["justia", "avvo", "findlaw"], not: ["angi", "healthgrades"] }],
  ["a restaurant (plural) abroad gets Tripadvisor and no US list", { industry: "Restaurants", primary_market: "Leeds, UK" }, { has: ["tripadvisor", "opentable", "yelp", "apple"], not: ["bbb", "yellowpages", "angi", "dataaxle", "localeze", "mapquest"] }],
  ["an Ontario, Canada client is not a US client", { business_type: "Plumber", primary_market: "Toronto, ON" }, { has: ["yelp"], not: ["bbb", "yellowpages", "angi", "homeadvisor"] }],
  ["an international phone is a country too", { business_type: "Plumber", identity_phone: "+44 20 7946 0958" }, { not: ["bbb", "angi"] }],
  ["no trade on the record: the trade-only directories stay out", { primary_market: "Austin, TX" }, { has: ["bbb", "yelp"], not: ["angi", "homeadvisor", "thumbtack", "healthgrades", "justia", "tripadvisor"] }],
  ["no market and no phone: nothing is assumed to be American", { business_type: "Plumber" }, { has: ["yelp", "apple", "facebook"], not: ["bbb", "yellowpages", "angi"] }],
  ["nothing at all on the record (no website, no market, no trade)", {}, { has: ["yelp"], not: ["angi", "bbb", "healthgrades"] }],
  ["a market with no state still isn't guessed", { business_type: "Photographer", primary_market: "Greater Boston" }, { not: ["bbb", "angi"] }],
  ["a US state spelled out counts", { business_type: "Electrician", primary_market: "Austin, Texas" }, { has: ["angi", "bbb"] }],
];
for (const [name, c, want] of CASES) {
  const k = keys(c);
  for (const h of want.has || []) if (!k.includes(h)) fail(`list: ${name}: ${h} is missing`);
  for (const n of want.not || []) if (k.includes(n)) fail(`list: ${name}: ${n} should be left out`);
  const out = TR_use(c).left_out;
  if (out.some((x) => k.includes(x.key))) fail(`list: ${name}: a directory is both used and left out`);
  if (out.some((x) => !String(x.why || "").trim())) fail(`list: ${name}: a directory is left out with no reason`);
}
if (!/person chooses/.test(JSON.stringify(TR_use({ business_type: "Plumber", primary_market: "Toronto, ON" }).left_out))) fail("a left-out country directory doesn't say a person chooses");
if (!/person chooses/.test(JSON.stringify(TR_use({ business_type: "Plumber" }).left_out))) fail("an unknown country doesn't say a person chooses");
const whyOf = (c, key) => (TR_use(c).left_out.find((x) => x.key === key) || {}).why || "";
if (!/no set for this country yet/.test(whyOf({ business_type: "Plumber", primary_market: "Toronto, ON" }, "bbb"))) fail("a Canadian client isn't told apart from one whose country is unknown");
if (!/no set for this country yet/.test(whyOf({ business_type: "Plumber", identity_phone: "+44 20 7946 0958" }, "bbb"))) fail("an international phone isn't read as another country");
if (!/don't know this client's country/.test(whyOf({ business_type: "Plumber" }, "bbb"))) fail("an unknown country is said to be a known one");
// every directory the list can offer without a verified shape must stay unsearchable: no new spending
const ALLDIRS = [...DIR.CITATION_DIRECTORIES, ...DIR.TRADE_DIRECTORIES];
const unsafe = ALLDIRS.filter((d) => d.discoverable && !(d.listingExample && d.listingPath));
if (unsafe.length) fail(`a directory is searched without a verified listing shape: ${unsafe.map((d) => d.key).join(", ")}`);
for (const k of ["healthgrades", "zocdoc", "justia", "avvo", "findlaw", "tripadvisor", "opentable", "mapquest"])
  if (ALLDIRS.find((d) => d.key === k)?.discoverable !== false) fail(`${k} would spend a search with no confirmed listing shape`);
{
  const tradeKeys = DIR.TRADE_DIRECTORIES.map((d) => d.key);
  const contract = read("netlify/functions/contract-generate.js");
  if (DIR.TRADE_SETS_ON) { const miss = DIR.TRADE_DIRECTORIES.filter((d) => !contract.includes(d.source)); if (miss.length) fail(`the trade sets are on but the agreement doesn't name ${miss.map((d) => d.source).join(", ")}`); }
  else if (DIR.directoriesForClient({ business_type: "Dentist", primary_market: "Austin, TX" }).use.some((d) => tradeKeys.includes(d.key))) fail("a trade directory is offered while the sets are off");
  if (DIR.CITATION_DIRECTORIES.some((d) => tradeKeys.includes(d.key))) fail("a trade directory the agreement doesn't name is in the main list");
  // with the sets off, the filter still works: a dentist is never asked about the home marketplaces
  const off = DIR.directoriesForClient({ business_type: "Dentist", primary_market: "Austin, TX" });
  if (off.use.some((d) => ["angi", "homeadvisor", "thumbtack"].includes(d.key)) || !off.left_out.some((x) => x.key === "angi")) fail("with the trade sets off, a dentist is offered the home marketplaces");
}
if (!/directoriesForClient/.test(fx.slice(fx.indexOf("async function auditCitations"), fx.indexOf("async function auditCitations") + 800))) fail("the listings check doesn't build its list from the client");
if (!/directoriesForClient\(client\)/.test(fx.slice(fx.indexOf('"m1.cit.priority_top10": async'), fx.indexOf('"m1.cit.priority_top10": async') + 6000))) fail("the build step lists every submit-only directory for every client");
// the real audit run against a stub: a dentist is never searched for Angie
{
  const { liftAdmin } = await import("./_lift-admin.mjs");
  const run = async (client) => {
    const asked = [];
    const api = liftAdmin(["auditCitations"], { file: "netlify/functions/flow-execute.js", extraGlobals: { supa: async (p, i) => (i && i.method === "POST" ? null : []), ...DIR,
      fetch: async (u) => { asked.push(String(u)); return { ok: true, status: 200, json: async () => ({ organic_results: [] }) }; }, AbortSignal: { timeout: () => undefined }, process: { env: { SERPAPI_KEY: "stub" } } } });
    const rows = await api.call("auditCitations", [client, "c1"]);
    return { rows, asked };
  };
  const d = await run({ business_name: "Bright Smile", business_type: "Dentist", primary_market: "Austin, TX" });
  if (d.rows.some((r) => r.source === "Angie" || r.source === "HomeAdvisor")) fail("a dentist's listings check searches the home marketplaces");
  if (d.asked.some((u) => /angi\.com|homeadvisor/i.test(decodeURIComponent(u)))) fail("a dentist's listings check spent a search on Angie");
  if (!d.rows.leftOut || !d.rows.leftOut.some((x) => x.source === "Angie")) fail("the listings check doesn't say Angie was left out");
  if (d.rows.some((r) => r.status === "missing" && /Angie|HomeAdvisor/.test(r.source))) fail("a directory left out is reported No listing found");
  const abroad = await run({ business_name: "Leeds Plumbing", business_type: "Plumber", primary_market: "Leeds, UK" });
  if (abroad.rows.some((r) => ["BBB", "YellowPages", "Angie", "HomeAdvisor"].includes(r.source))) fail("a client abroad gets the US list");
  const none = await run({ business_name: "" , business_type: "Plumber", primary_market: "Austin, TX" });
  if (!none.rows.length || !none.rows.every((r) => r.status === "unknown") || none.asked.length) fail("no business name still searches or answers");
}

// ── 1 · the NAP check ──
const GBP = { title: "Acme Plumbing", phoneNumbers: { primaryPhone: "+1 512 555 0100" } };
const goodPage = "Acme Plumbing in Austin. Call (512) 555-0100 for same day service. Reviews, hours, photos and more. ".repeat(6);
async function nap({ client, rows, rowsStatus = 200, pages, site = "<html>no links here</html>", gbp = GBP }) {
  seen.length = 0;
  route = async (url, init) => {
    if (url.includes("/rest/v1/clients?")) return res(200, [{ id: "c1", workspace_id: "w", business_name: "Acme Plumbing", website_url: "https://acme.test", ...client }]);
    if (url.includes("client_google_oauth")) return res(200, gbp ? [{ refresh_token: "plain", gbp_location_id: "locations/1" }] : []);
    if (url.includes("oauth2.googleapis.com")) return res(200, { access_token: "tok" });
    if (url.includes("mybusinessbusinessinformation")) return res(200, gbp);
    if (url.includes("client_citations")) return rowsStatus === 200 ? res(200, rows) : res(rowsStatus, "down");
    if (url.includes("client_state_snapshots")) return res(201, "");
    if (url === "https://acme.test") return res(200, site);
    if (pages[url]) { const p = pages[url]; return p.throw ? Promise.reject(new Error(p.throw)) : res(p.status || 200, p.body == null ? goodPage : p.body); }
    return res(404, "not faked: " + url);
  };
  const out = await CA.handler({ queryStringParameters: { token: "t", clientId: "c1", dry: "1" } });
  return JSON.parse(out.body);
}
const CUR = "[v2-listing-shape] 2026-10-20 — listing found at x", OLD = "citation audit 2026-10-07 — listing found by site: search";
const Y = "https://www.yelp.com/biz/acme-plumbing-austin", FB = "https://www.facebook.com/acmeplumbing", FS = "https://foursquare.com/v/acme/1234", BB = "https://www.bbb.org/us/tx/austin/profile/plumber/acme-1", AP = "https://maps.apple.com/place?place-id=I1";
let j = await nap({ client: { business_type: "Plumber", primary_market: "Austin, TX" },
  rows: [{ source: "Yelp", url: Y, notes: CUR }, { source: "Facebook", url: FB, notes: CUR }, { source: "Foursquare", url: FS, notes: CUR }, { source: "BBB", url: BB, notes: CUR },
    { source: "Apple Maps", url: AP, notes: CUR }, { source: "YellowPages", url: "https://www.yellowpages.com/austin/mip/acme-1", notes: OLD }, { source: "HomeAdvisor", url: "https://evil.test/rated.x", notes: CUR }],
  pages: { [Y]: {}, [FB]: { status: 403, body: "" }, [FS]: { body: "Acme Plumbing. Call (512) 555-0199 today. ".repeat(12) }, [BB]: { body: "<html>Loading...</html>" }, [AP]: { status: 404, body: "" } } });
const ck = (id) => (j.checks || []).find((c) => c.id === id);
if (!j.ok) fail(`the NAP check failed to run: ${JSON.stringify(j).slice(0, 200)}`);
if (!ck("cit.yelp") || ck("cit.yelp").pass !== true || ck("cit.yelp").url !== Y) fail(`a listing the audit found isn't read: ${JSON.stringify(ck("cit.yelp"))}`);
if (!(j.found_by_audit || []).includes("yelp")) fail("the check doesn't say which listings came from the audit");
if (ck("cit.facebook") && (ck("cit.facebook").pass !== null || !ck("cit.facebook").could_not_read)) fail("a page that answered 403 is reported wrong or fine");
if (!ck("cit.facebook") || ck("cit.facebook").pass !== null) fail("a 403 page isn't a could-not-read");
if (!ck("cit.foursquare") || ck("cit.foursquare").pass !== false) fail("a page that is plainly this business with an old phone isn't a fix");
if (!ck("cit.bbb") || ck("cit.bbb").pass !== null || !ck("cit.bbb").could_not_read) fail("a page with no business details on it is reported wrong or fine");
if (!ck("cit.apple") || ck("cit.apple").pass !== false) fail("a page that is gone (404) isn't a fix");
if (ck("cit.yellowpages") && ck("cit.yellowpages").url) fail("a row from the OLD host-matching method is trusted");
if (ck("cit.homeadvisor") && ck("cit.homeadvisor").url) fail("a row whose URL isn't on that directory is trusted");
if ((j.fixes || []).some((f) => /bbb|facebook/i.test(f.id))) fail("a page we couldn't read is listed as a fix");
if (!(j.checks || []).every((c) => c.pass === null || typeof c.pass === "boolean")) fail("a check has a pass that is neither true, false nor null");
if ((j.checks || []).filter((c) => c.url).some((c) => !c.checked_at)) fail("a read listing doesn't say when it was checked");
// the site's own link still counts, and wins
j = await nap({ client: { business_type: "Plumber", primary_market: "Austin, TX" }, rows: [{ source: "Yelp", url: Y, notes: CUR }], pages: { [Y]: {}, "https://www.yelp.com/biz/site-link": {} }, site: '<a href="https://www.yelp.com/biz/site-link">Yelp</a>' });
if (!ck("cit.yelp") || ck("cit.yelp").url !== "https://www.yelp.com/biz/site-link") fail("the site's own link doesn't win over the audit's row");
if (!ck("cit.linked_from_site") || ck("cit.linked_from_site").pass !== true || /found by the audit/.test(ck("cit.linked_from_site").detail)) fail("the site-link check counts the audit's rows as the site's links");
// a site that links to nothing: the audit's row is still checked, and "links to none" stays a statement about the SITE only
j = await nap({ client: { business_type: "Plumber", primary_market: "Austin, TX" }, rows: [{ source: "Yelp", url: Y, notes: CUR }], pages: { [Y]: {} } });
if (ck("cit.linked_from_site")?.pass !== false || ck("cit.yelp")?.pass !== true) fail("a site that links to nothing hides the listings the audit found");
// the table can't be read: said, never "none found"
j = await nap({ client: { business_type: "Plumber", primary_market: "Austin, TX" }, rows: [], rowsStatus: 500, pages: {} });
if (j.audit_rows_read !== false || !/couldn't be read/.test(JSON.stringify(ck("cit.yelp") || {}))) fail("an unreadable results table reads as 'none found'");
if (ck("cit.yelp") && ck("cit.yelp").pass !== null) fail("an unreadable results table makes a verdict");
// no Google connection: nothing is claimed about correctness
j = await nap({ client: { business_type: "Plumber", primary_market: "Austin, TX" }, rows: [{ source: "Yelp", url: Y, notes: CUR }], pages: { [Y]: {} }, gbp: null });
if (ck("cit.yelp")?.pass !== null) fail("without a Google profile a listing is judged");
// a dentist is never checked against Angie
j = await nap({ client: { business_type: "Dentist", primary_market: "Austin, TX" }, rows: [], pages: {} });
if ((j.checks || []).some((c) => /angi|homeadvisor|thumbtack/.test(c.id))) fail("the NAP check lists the home marketplaces for a dentist");
if (!(j.left_out || []).some((x) => x.source === "Angie")) fail("the NAP check doesn't say what it left out");

// ── 4 · the recheck ──
const DAY = 864e5, NOW = Date.parse("2026-11-10T12:00:00Z"), iso = (d) => new Date(NOW + d * DAY).toISOString();
const ON = { CITATION_RECHECK: "1" };
const base = { id: "c1", source: null, status: "active", client_portal_stage: "stage_5_monthly", business_type: "Plumber", primary_market: "Austin, TX" };
const task = (ranDays, x = {}) => ({ "m1.audit.citations": { status: "done", ran_at: iso(ranDays), outcome_data: { counts: { found: 1 } }, ...x } });
const due = (c, t, env = ON) => RC.dueFor(c, t, NOW, env);
const DUE = [
  ["off by default", due(base, task(-100), {}).why, "CITATION_RECHECK is off"],
  ["a quarter later", due(base, task(-91)).due, "quarterly"],
  ["89 days is not yet", due(base, task(-89)).why, "not due yet"],
  ["a test client", due({ ...base, source: "test:walk" }, task(-100)).why, "a test client"],
  ["archived", due({ ...base, status: "archived" }, task(-100)).why, "archived"],
  ["setup hasn't reached it", due({ ...base, client_portal_stage: "stage_1_signup" }, task(-100)).why, "setup hasn't reached it"],
  ["the first check hasn't run", due(base, {}).why, "the first check hasn't run"],
  ["the first check ran but left nothing", due(base, { "m1.audit.citations": { status: "done", ran_at: iso(-100) } }).why, "the first check hasn't run"],
  ["within 7 days even after a change", due(base, { ...task(-3), "m1.gbp.business_facts": { core_changes: [{ field: "phone", status: "on_google", sent_at: iso(-1) }] } }).why, "checked less than 7 days ago"],
  ["a phone change on Google triggers it", due(base, { ...task(-20), "m1.gbp.business_facts": { core_changes: [{ field: "phone", status: "on_google", sent_at: iso(-10) }] } }).due, "phone"],
  ["an address change on Google triggers it", due(base, { ...task(-20), "m1.gbp.business_facts": { core_changes: [{ field: "address", status: "on_google", sent_at: iso(-10) }] } }).due, "address"],
  ["a change the client approved but isn't on Google yet does not", due(base, { ...task(-20), "m1.gbp.business_facts": { core_changes: [{ field: "phone", status: "approved", sent_at: iso(-10) }] } }).why, "not due yet"],
  ["a main category change is not a listing change", due(base, { ...task(-20), "m1.gbp.business_facts": { core_changes: [{ field: "main_category", status: "on_google", sent_at: iso(-10) }] } }).why, "not due yet"],
  ["a change already checked does not trigger again", due(base, { ...task(-5, { recheck: { at: iso(-5) } }), "m1.gbp.business_facts": { core_changes: [{ field: "phone", status: "on_google", sent_at: iso(-10) }] } }).why, "checked less than 7 days ago"],
  ["the step is running", due(base, task(-100, { status: "in_progress" })).why, "the step is in_progress"],
];
for (const [n, got, want] of DUE) if (got !== want) fail(`recheck due: ${n} — got ${JSON.stringify(got)}`);
if (RC.lastCheckedMs({ ran_at: iso(-50), recheck: { at: iso(-10) } }) !== NOW - 10 * DAY) fail("the last check isn't the newest of the run and the recheck");
if (RC.searchesFor({ business_type: "Dentist", primary_market: "Austin, TX" }) >= RC.searchesFor({ business_type: "Plumber", primary_market: "Austin, TX" })) fail("a dentist's recheck budgets for the home marketplaces");

async function once({ left, tasks, client = base, claimWins = true, startFails = false, env = ON }) {
  const calls = { patches: [], starts: 0 };
  const deps = { now: () => NOW, env, searchesLeft: async () => left, start: async () => { calls.starts++; if (startFails) throw new Error("runner down"); },
    supa: async (p, init = {}) => {
      if (p.startsWith("/clients")) return [client];
      if (p.startsWith("/client_onboarding_records") && (init.method || "GET") === "GET") return [{ id: "rec1", data: { tasks } }];
      if ((init.method || "") === "PATCH") { calls.patches.push({ p, body: JSON.parse(init.body) }); return claimWins ? [{ id: "rec1" }] : []; }
      return []; } };
  return { r: await RC.recheckOnce({ clientId: "c1", trigger: "t", left, deps }), calls };
}
const LEFT_OK = RC.searchesFor(base) + RC.RESERVE + 19; // enough for the run plus the shared reserve, whatever it is
let o = await once({ left: LEFT_OK, tasks: task(-100) });
if (!o.r.ran || o.calls.starts !== 1 || o.calls.patches.length !== 1) fail(`a due client isn't started once: ${JSON.stringify(o.r)} ${o.calls.starts} starts`);
if (!/recheck=is\.null/.test(o.calls.patches[0] && o.calls.patches[0].p)) fail("the first claim isn't conditional on no earlier recheck");
if (o.calls.patches[0] && o.calls.patches[0].body.data.tasks["m1.audit.citations"].recheck.searches_at_most < 1) fail("the claim doesn't record the most searches it can cost");
o = await once({ left: LEFT_OK, tasks: task(-100, { recheck: { at: iso(-95) } }) });
if (!/recheck->>at=eq\./.test(o.calls.patches[0] && o.calls.patches[0].p)) fail("a later claim isn't conditional on the stamp it read");
o = await once({ left: LEFT_OK, tasks: task(-100), claimWins: false });
if (o.r.ran || o.calls.starts) fail("a caller that lost the claim still started the run");
o = await once({ left: LEFT_OK, tasks: task(-100), startFails: true });
if (o.r.ran || !o.r.stamped || o.calls.starts !== 1) fail("a failed start isn't left stamped");
o = await once({ left: null, tasks: task(-100) });
if (o.r.ran || o.calls.patches.length || o.calls.starts) fail("with no count of searches left, it claimed or started");
if (!/couldn't read how many searches are left/.test(o.r.why || "")) fail("an unreadable count of searches left is said to be too few");
o = await once({ left: 9, tasks: task(-100) });
if (o.r.ran || o.calls.patches.length || o.calls.starts) fail("with about 9 searches left, a plumber's recheck (up to 16) started");
o = await once({ left: RC.searchesFor(base) + RC.RESERVE - 1, tasks: task(-100) });
if (o.r.ran) fail("it spends into the reserve");
o = await once({ left: 400, tasks: task(-100), env: {} });
if (o.r.ran || o.calls.starts) fail("a switched-off recheck started");
o = await once({ left: 400, tasks: task(-100), client: { ...base, source: "test:x" } });
if (o.r.ran) fail("a test client was started");
o = await once({ left: 400, tasks: task(-100), client: { ...base, business_type: "Dentist", industry: "Dental" } });
if (!o.r.ran || o.r.searches_at_most >= RC.searchesFor(base)) fail("a dentist is budgeted for the home marketplaces");

async function sweep(env) {
  const calls = { starts: [], reads: 0 }; let leftReads = 0;
  const mk = (id, src) => ({ ...base, id, source: src });
  const clients = [mk("a"), mk("b"), mk("c", "test:z")];
  const deps = { now: () => NOW, env, searchesLeft: async () => { leftReads++; return 400; }, start: async (id) => { calls.starts.push(id); },
    supa: async (p, init = {}) => {
      if (p.startsWith("/clients?status")) { if (!/not\.like\.test/.test(p)) fail("the sweep's client list doesn't leave test clients out"); return clients; }
      if (p.startsWith("/clients?id=eq.")) return [clients.find((c) => p.includes(`id=eq.${c.id}&`))];
      if (p.startsWith("/client_onboarding_records") && (init.method || "GET") === "GET") return [{ id: `rec-${p}`, data: { tasks: task(-100) } }];
      if ((init.method || "") === "PATCH") return [{ id: "x" }];
      return []; } };
  return { out: await RC.sweepRecheck({ deps }), calls, leftReads };
}
let sw = await sweep({});
if (sw.out.enabled || sw.out.started || sw.calls.starts.length || sw.leftReads) fail("a switched-off sweep started a run or read the provider");
if (sw.out.due !== 2) fail(`a switched-off sweep doesn't count who is due (${sw.out.due})`);
sw = await sweep(ON);
if (sw.calls.starts.length !== RC.NIGHT_CAP || sw.out.started !== RC.NIGHT_CAP) fail(`a sweep starts ${sw.calls.starts.length}, not at most ${RC.NIGHT_CAP}`);
if (sw.calls.starts.includes("c")) fail("a sweep started a test client");
const rcSrc = read("netlify/functions/_citation-recheck.js") + read("netlify/functions/citation-recheck.js");
if (/serpapi\.com\/search|api_key=/.test(rcSrc.replace(/^\s*\/\/.*$/gm, ""))) fail("the recheck code makes a paid search itself");
if (/setInterval|while\s*\(\s*true|for\s*\(\s*;\s*;/.test(rcSrc)) fail("the recheck has a loop with no end");
if (/\bretry\b|attempt\s*[<+]/.test(rcSrc.replace(/^\s*\/\/.*$/gm, "").replace(/\/\/.*$/gm, ""))) fail("the recheck retries");
const man = read("netlify/functions/_job-manifest.js"), toml = read("netlify.toml");
if (!/job: "citation-recheck"/.test(man) || !/\[functions\."citation-recheck"\]/.test(toml)) fail("the recheck isn't a scheduled job in the job manifest");
if (!/exports\.handler = require\("\.\/_job-checkin"\)\.withCheckin\("citation-recheck"/.test(read("netlify/functions/citation-recheck.js"))) fail("the recheck doesn't check in");
if (!/\(approved citations_additions_v1/.test(toml)) fail("the recheck's schedule has no reason in netlify.toml");

if (F.length) { console.error(`❌ citations additions: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ citations additions hold: the NAP check reads the listings the audit found (a page we couldn't read is never wrong or fine), the stale text is gone, the list fits the client's trade and country and a left-out directory is never an absence, the recheck ships off, claims first, never retries, skips test clients and never searches");
