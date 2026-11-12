#!/usr/bin/env node
// check-a-spam-report-has-evidence.mjs — THE COMPETITOR WATCH FLAGS ONLY WITH EVIDENCE, AND GOOGLE DECIDES (tier3_best_in_class_v1 item 4, Chris 11-11).
//
// 🔴 WHY: Monthly 9 now flags competitor listings that look like they break Google's rules and lets RGA report them (Google's complaint form, by
// hand). A flag with no evidence is an accusation against an honest business; a "changed" read from a scan made BEFORE the report is a claim we
// can't back; a client card that says RGA removed a listing promises what Google decides. And it must all come from the scans already paid for.
// This RUNS the real code (shared/competitor-watch.js, _competitor-watch.js, admin-competitor-watch.js, portal-competitor-watch.js) on fixtures:
//   · a flag carries at least one evidence row WITH its scan date; no website / a site that didn't open = "can't compare", never a flag
//   · any trade, any country: a UK number in two formats is one phone; accents fold; a practice and its practitioner (same website) are not a flag
//   · the client's own listing is never flagged; a report is refused without evidence and stored with it
//   · "changed" / "gone" only from a LATER scan (and "gone" only from a full one); 30 days with no change = a decision
//   · the client's card never names a flagged or reported listing and never says anything was removed
//   · no search is ever made: the watch reads the rank job's stored listings; a partial map keeps none
// Exit 0 holds · 1 broken · 2 indeterminate (the code moved).
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
let CW, CWJ, ADM, POR;
try { CW = req("../../shared/competitor-watch.js"); CWJ = req("./_competitor-watch.js"); ADM = req("./admin-competitor-watch.js"); POR = req("./portal-competitor-watch.js"); }
catch (e) { ind(`harness: ${e.message}`); }
for (const k of ["flagsFor", "statusOf", "adminView", "clientView", "preparedReport", "FORM_URL"]) if (!(k in CW)) ind(`shared/competitor-watch.js has no ${k}`);
for (const k of ["watch", "act", "readMonth", "scanOfGrid"]) if (typeof CWJ[k] !== "function") ind(`_competitor-watch.js has no ${k}`);

// ── fixtures: a US roofer, a Toronto dentist, a London plumber, a Mexico City plumber, a Greek name ──────────────────────────
const L = (id, name, o = {}) => ({ id, name, phone: null, address: null, website: null, category: "Roofing contractor", appearances: 10, top3: 2, ...o });
const scan = (at, listings, o = {}) => ({ at, keyword: "roofer culver city", market: "Culver City, CA", complete: true, points: 25, self: { id: "ChIJself", name: "Beta Roofing Culver City", top3: 9 }, listings, ...o });
const LISTINGS = [
  L("ChIJace", "Ace Roofing", { website: "https://ace.example", phone: "(310) 555-0101", appearances: 24, top3: 18 }),
  L("ChIJhonest", "Culver City Roofing", { website: "https://ccr.example", phone: "(310) 555-0102", appearances: 20, top3: 11 }),
  L("ChIJstuff", "Best Roofer Culver City 24/7 Roof Repair", { website: "https://jr.example", phone: "(310) 555-0199", appearances: 19, top3: 8 }),
  L("ChIJnosite", "Cheap Roofer Culver City Emergency", { website: null, phone: "(310) 555-0177" }),
  L("ChIJdown", "Top Roofer Culver City Fast", { website: "https://down.example", phone: "(310) 555-0166" }),
  L("ChIJself", "Beta Roofing Culver City", { website: "https://beta.example", phone: "(310) 555-0100" }),
  L("ChIJgreek", "Στέγες Αθήνα Επισκευές", { website: "https://greek.example", phone: "+30 210 000 0000" }),
  L("ChIJlon1", "Thames Plumbing Ltd", { website: "https://thames.example", phone: "+44 20 7946 0000", category: "Plumber" }),
  L("ChIJlon2", "Leak Fixers London", { website: "https://leak.example", phone: "020 7946 0000", category: "Plumber" }),
  L("ChIJdoc1", "Smile Dental Toronto", { website: "https://smile.example/", phone: "+1 416 555 0100", category: "Dentist" }),
  L("ChIJdoc2", "Dr. Ana Li, DDS", { website: "https://www.smile.example/team", phone: "(416) 555-0100", category: "Dentist" }),
  L("ChIJapt", "Quick Drain Co", { website: "https://qd.example", address: "12 Oak St Apt 4B, Culver City, CA 90230", category: "Plumber" }),
  L("ChIJcondo", "Oak Towers", { website: "https://oak.example", address: "14 Oak St Apt 2, Culver City, CA 90230", category: "Apartment complex" }),
  L("ChIJcity1", "Roofs R Us", { website: "https://r1.example", address: "Culver City, CA", category: "Roofing contractor" }),
  L("ChIJcity2", "Sky Roof", { website: "https://r2.example", address: "Culver City, CA", category: "Roofing contractor" }),
];
const TITLES = { ChIJstuff: { url: "https://jr.example", title: "J&R Roofing", at: "2026-11-01T13:00:00Z" }, ChIJhonest: { url: "https://ccr.example", title: "Culver City Roofing | Home", at: "2026-11-01T13:00:00Z" },
  ChIJdown: { url: "https://down.example", title: null, at: "2026-11-01T13:00:00Z", error: "the page answered 503" }, ChIJself: { url: "https://beta.example", title: "Beta Roofing", at: "2026-11-01T13:00:00Z" },
  ChIJgreek: { url: "https://greek.example", title: "Στέγες", at: "2026-11-01T13:00:00Z" } };
const S1 = scan("2026-11-01T12:00:00Z", LISTINGS);
const flags = CW.flagsFor({ scan: S1, titles: TITLES, self: S1.self });
const fl = (id) => flags.flags.find((f) => f.id === id);
const ev = (id, kind) => (fl(id) && fl(id).evidence || []).find((e) => e.kind === kind);
if (!fl("ChIJstuff") || !ev("ChIJstuff", "name")) fail("a keyword-stuffed name its own site doesn't use is not flagged");
for (const f of flags.flags) { if (!f.evidence.length) fail(`"${f.name}" is flagged with no evidence`); for (const e of f.evidence) if (e.scan_at !== S1.at) fail(`evidence on "${f.name}" has no scan date (${e.scan_at})`); }
if (fl("ChIJhonest")) fail("an honest name its own website uses (Culver City Roofing) is flagged");
if (fl("ChIJace")) fail("Ace Roofing is flagged");
if (fl("ChIJnosite") && ev("ChIJnosite", "name")) fail("a listing with no website is flagged for its name (it can't be compared)");
if (!flags.cant.some((c) => c.id === "ChIJnosite")) fail("a listing with no website isn't said as \"can't compare the name\"");
if (fl("ChIJdown") && ev("ChIJdown", "name")) fail("a listing whose website didn't open is flagged for its name");
if (fl("ChIJself")) fail("the client's own listing is flagged");
if (fl("ChIJgreek")) fail("a Greek name is flagged with nothing to show");
if (!ev("ChIJlon1", "phone") || !ev("ChIJlon2", "phone")) fail("a UK number written two ways (+44 20 … / 020 …) is not read as one phone");
if (fl("ChIJdoc1") || fl("ChIJdoc2")) fail("a practice and its practitioner (same website, same phone) are flagged");
if (!ev("ChIJapt", "home")) fail("an apartment address on a business listing is not flagged");
if (fl("ChIJcondo")) fail("an apartment complex is flagged for its apartment address");
if (ev("ChIJcity1", "address") || ev("ChIJcity2", "address")) fail("two listings that only show the city are flagged for a shared address");

// ── what a later scan read ──────────────────────────────────────────────────────────────────
const R = { listing_id: "ChIJstuff", name: "Best Roofer Culver City 24/7 Roof Repair", evidence: ev("ChIJstuff", "name") ? [ev("ChIJstuff", "name")] : [], status: "reported", reported_at: "2026-11-16T17:00:00Z", by: "t", again: [] };
const renamed = (at, o) => scan(at, LISTINGS.map((l) => (l.id === "ChIJstuff" ? { ...l, name: "J&R Roofing" } : l)), o);
const without = (at, o) => scan(at, LISTINGS.filter((l) => l.id !== "ChIJstuff"), o);
const day = (iso) => Date.parse(iso);
if (CW.statusOf(R, [renamed("2026-11-15T12:00:00Z")], day("2026-11-17T00:00:00Z")).state !== "reported") fail("a scan made BEFORE the report is read as a change");
if (CW.statusOf(R, [renamed("2026-11-20T12:00:00Z")], day("2026-11-21T00:00:00Z")).state !== "changed") fail("a later scan with the new name isn't read as changed");
if (CW.statusOf(R, [without("2026-11-20T12:00:00Z")], day("2026-11-21T00:00:00Z")).state !== "gone") fail("a later full scan without the listing isn't read as gone");
if (CW.statusOf(R, [without("2026-11-20T12:00:00Z", { complete: false })], day("2026-11-21T00:00:00Z")).state === "gone") fail("a PARTIAL later scan is read as gone");
if (CW.statusOf(R, [without("2026-11-20T12:00:00Z"), scan("2026-11-25T12:00:00Z", LISTINGS)], day("2026-11-26T00:00:00Z")).state !== "reported") fail("a listing missing from one scan and back in the newest is read as gone (the newest scan must win)");
if (CW.statusOf(R, [scan("2026-11-20T12:00:00Z", LISTINGS)], day("2026-12-17T00:00:00Z")).state !== "decide") fail("30 days with no change doesn't ask RGA to decide");

// ── the admin card and the client card ──────────────────────────────────────────────────────
const W = { keyword: S1.keyword, market: S1.market, self: S1.self, scans: [S1], titles: TITLES };
const av = CW.adminView({ watch: W, reports: [], allScans: [S1], now: day("2026-11-02T00:00:00Z") });
const stuffRow = av.rows.find((r) => r.id === "ChIJstuff");
if (!stuffRow || stuffRow.kind !== "flag" || !(stuffRow.chips || []).length || !(stuffRow.acts || []).some((a) => a.act === "report")) fail("the admin card doesn't show the suspect with its evidence and a Report press");
for (const r of av.rows) for (const a of r.acts || []) if (!/^[A-Z][a-z]+$/.test(a.label)) fail(`a button says "${a.label}" (one plain word)`);
const Rpalms = { ...R, listing_id: "ChIJace", name: "Ace Roofing" };
const cv = CW.clientView({ watch: W, reports: [Rpalms], allScans: [S1], now: day("2026-11-02T00:00:00Z") });
const names = cv.rows.map((r) => r.title).join(" | ");
if (/Ace Roofing/.test(names)) fail("the client's card names a listing RGA reported");
if (/Best Roofer/.test(names)) fail("the client's card names a flagged listing");
if (!cv.reports || !/Listings we reported to Google: 1/.test(cv.reports.head)) fail("the client's card doesn't say how many listings were reported");
const cvText = JSON.stringify(cv);
if (/\b(remov(e|ed|al)|took down|taken down|delet(e|ed)|got rid)\b/i.test(cvText)) fail("the client's card says a listing was removed (Google decides)");
if (!/Google decides every report/.test(cvText)) fail("the client's card doesn't say Google decides");
if (/\(\d{3}\)|\+\d|Apt|Same phone|search words/.test(cvText)) fail("the client's card shows another business's phone, address or evidence");
// a change the client is told is only one a later scan read
const cv2 = CW.clientView({ watch: { ...W, scans: [S1, renamed("2026-11-20T12:00:00Z")] }, reports: [R], allScans: [S1, renamed("2026-11-20T12:00:00Z")], now: day("2026-11-21T00:00:00Z") });
if (!/One changed its name on Google on Nov 20\./.test(JSON.stringify(cv2))) fail("the client isn't told the name change a later scan read");
const cv3 = CW.clientView({ watch: { ...W, scans: [renamed("2026-11-15T12:00:00Z")] }, reports: [R], allScans: [renamed("2026-11-15T12:00:00Z")], now: day("2026-11-21T00:00:00Z") });
if (/changed its name/.test(JSON.stringify(cv3))) fail("the client is told of a change read in a scan made before the report");

// ── the presses, on a fake database: refused without evidence, stored with it ───────────────
function fakeDb(data) {
  const db = { rec: { scope: "month2plus", table: "client_monthly_records", id: "r1", client_id: "c", reporting_month: "2026-11-01", data: JSON.parse(JSON.stringify(data)), tasks: {} }, writes: 0, gets: [] };
  db.deps = { now: () => day("2026-11-02T00:00:00Z"),
    supa: async (p) => { if (/serpapi|googleapis/i.test(p)) throw new Error("a search was made"); if (p.startsWith("/clients")) return [{ business_name: "Beta Roofing" }]; if (p.startsWith("/client_monthly_records")) return [{ reporting_month: "2026-11-01", data: db.rec.data }]; if (p.startsWith("/client_onboarding_records")) return [{ data: db.ob || {} }]; return []; },
    get: async (u) => { db.gets.push(u); if (/serpapi|googleapis|places/i.test(u)) throw new Error("a search was made"); return { status: 200, text: "<title>J&amp;R Roofing</title>" }; },
    readStepRecord: async () => ({ ...db.rec, data: JSON.parse(JSON.stringify(db.rec.data)) }),
    writeStepTasks: async (rec) => { db.writes++; db.rec.data = JSON.parse(JSON.stringify(rec.data)); return db.rec.data; },
    record: async () => ({ ok: true }), gate: { email: "rga@test" } };
  return db;
}
const call = async (h, body) => { const r = await h({ httpMethod: "POST", body: JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
const CID = "00000000-0000-4000-8000-000000000001";
{
  const db = fakeDb({ competitor_watch: W, spam_reports: [] }); ADM.__useDeps(db.deps);
  const no = await call(ADM.handler, { client_id: CID, month: "2026-11-01", action: "report", listing_id: "ChIJace" });
  if (no.status !== 422 || db.writes) fail(`a report with no evidence is not refused (HTTP ${no.status}, ${db.writes} write(s))`);
  const yes = await call(ADM.handler, { client_id: CID, month: "2026-11-01", action: "report", listing_id: "ChIJstuff" });
  const stored = (db.rec.data.spam_reports || []).find((r) => r.listing_id === "ChIJstuff");
  if (yes.status !== 200 || !stored || stored.status !== "reported") fail(`a report with evidence is not stored (HTTP ${yes.status})`);
  else {
    if (!stored.evidence || !stored.evidence.length || stored.evidence.some((e) => e.scan_at !== S1.at)) fail("the stored report doesn't carry its evidence with the scan date");
    if (!stored.reported_at || !stored.by) fail("the stored report doesn't say when and by whom");
    if (yes.body.form_url !== CW.FORM_URL || !/support\.google\.com\/business/.test(String(yes.body.form_url))) fail("Report doesn't hand back Google's complaint form");
    if (!yes.body.prepared || !/Seen in the map scan of Nov 1/.test(yes.body.prepared) || !/search words/.test(yes.body.prepared)) fail("the prepared report doesn't carry the evidence and its scan date");
  }
  const again = await call(ADM.handler, { client_id: CID, month: "2026-11-01", action: "report", listing_id: "ChIJstuff" });
  if (again.status !== 409) fail("a listing already reported can be reported twice as a new report");
  ADM.__useDeps(null);
}
{ // the watch keeps a full scan, reads titles free, never searches; a partial map keeps no listings
  const grid = { status: "done", keyword: S1.keyword, timestamp: "2026-11-15T12:00:00Z", pins_total: 25, pins_read: 25, grid: Array.from({ length: 5 }, () => [1, 2, 3, 9, null]), anchor: { name: "Beta Roofing Culver City", place_id: "ChIJself", market: "Culver City, CA" }, listings: LISTINGS.filter((l) => l.id !== "ChIJself") };
  const db = fakeDb({ competitor_watch: { scans: [S1], titles: {} }, spam_reports: [] }); db.ob = { v2Campaign: { rank_grid: grid } };
  db.deps.now = () => day("2026-11-16T00:00:00Z");
  const r = await CWJ.watch({ clientId: CID, month: "2026-11-01", deps: db.deps });
  const w = db.rec.data.competitor_watch;
  if (!r.wrote || !w || w.scans.length !== 2) fail("the watch doesn't keep this month's second full scan");
  else { if (w.scans[1].self.top3 !== 15) fail(`the client's own top-3 count is wrong (${w.scans[1].self.top3}, expected 15)`); }
  if (db.gets.some((u) => /serpapi|googleapis|places/i.test(u))) fail("the watch made a search");
  if (!db.gets.length || db.gets.length > CW.TITLE_CAP) fail(`the watch read ${db.gets.length} website titles (expected 1..${CW.TITLE_CAP})`);
  if (CWJ.scanOfGrid({ ...grid, pins_read: 24 })) fail("a partial map is kept as a scan");
}
{ // the client's endpoint: in words, nothing named that was reported
  const db = fakeDb({ competitor_watch: W, spam_reports: [{ ...R, listing_id: "ChIJace", name: "Ace Roofing" }] }); POR.__useDeps(db.deps);
  const r = await call(POR.handler, { client_id: CID });
  if (r.status !== 200 || !r.body.view || /Ace Roofing|Best Roofer/.test(JSON.stringify(r.body.view.rows))) fail(`the client's endpoint names a reported or flagged listing (HTTP ${r.status})`);
  POR.__useDeps(null);
}

// ── static: no search anywhere in the watch; the rank job keeps listings only from a full map; wired in ─────────────────────
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { ind(`missing ${p}`); } };
for (const p of ["shared/competitor-watch.js", "netlify/functions/_competitor-watch.js", "netlify/functions/admin-competitor-watch.js", "netlify/functions/portal-competitor-watch.js"]) {
  const s = read(p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  if (/serpapi\.com|places\.googleapis|searchText|engine=google/i.test(s)) fail(`${p} makes a search`);
}
const grid = read("netlify/functions/v2-rank-grid-background.js");
if (!/listings: complete \? listings : \[\]/.test(grid)) fail("the rank job keeps a partial map's listings");
if (!/phone: typeof x\.phone === "string"/.test(grid)) fail("the rank job no longer keeps each listing's phone from the answer it already has");
const mr = read("netlify/functions/_morning-run.js");
if (!/watchCompetitors: \(clientId, month\) =>/.test(mr) || !/if \(d\.watchCompetitors\)/.test(mr)) fail("the morning run doesn't run the competitor watch");
const adm = read("admin/admin.js");
if (!/C\.adminView\(/.test(adm) || !/win\.location\.href = j\.form_url/.test(adm)) fail("the admin card doesn't draw the watch, or Report doesn't open Google's form");

if (F.length) { console.error("🔴 the competitor watch can accuse without evidence, or claim what Google did:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a spam report has evidence: flags carry what was seen and the scan date (any trade, any country); no website = can't compare; no report without evidence; changed/gone only from a later scan; the client is never told a listing was removed; no search made");
