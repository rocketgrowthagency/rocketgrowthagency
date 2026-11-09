#!/usr/bin/env node
// check-citation-brand-discovery.mjs — directories found by searching brand names, for the industry-specific citations step (approved admin_last_research_items_v1, item 3, 11-01).
// File-only: no browser, no database, no real search. It proves:
//   · it SHIPS OFF: unless CITATION_BRAND_DISCOVERY is exactly "1" nothing is searched, and the result says it is showing the suggested list
//   · when on it spends about 4 searches once per client: the brand and up to 3 competitors, then reuses the finished result and never searches again
//   · it refuses (searches nothing) with no key, with a count that can't be read, with the plan out, and with no competitors recorded (one search can't show a repeat)
//   · a search that fails keeps the existing list and says why; nothing partial is counted as a market
//   · it works for any client: no competitors, a competitor with no website, a shared name (the market narrows each query), a non-US market, and the brands' own sites left out of the count
//   · it never uses a quoted-phone query, and the result always names which list it is showing
// 🔴 WHY: SerpAPI has a handful of searches left. A "directories found" list built from a failed or partial search would send RGA to build listings on sites nobody ranks on.
// Exit 0 pass · 1 fail · 2 cannot tell.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rd = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
let BD, lib, exec, pb;
try { BD = createRequire(import.meta.url)(path.join(SITE, "netlify/functions/_citation-brand-discovery.js")); lib = rd("netlify/functions/_citation-brand-discovery.js"); exec = rd("netlify/functions/flow-execute.js"); pb = JSON.parse(rd("data/playbooks/playbooks.json")); }
catch (e) { console.error(`⚠️  INDETERMINATE — a file moved: ${e.message}`); process.exit(2); }
const fails = [], F = (m) => fails.push(m);

const client = { business_name: "Acme Plumbing", primary_market: "Austin, TX", website_url: "https://www.acmeplumbing.com", identity_phone: "(512) 555-0142", primary_contact_phone: "(512) 555-0142" };
const comp = (n, w) => ({ name: n, website: w || null });
const tasksWith = (cs, extra = {}) => ({ "m1.audit.competitors": { auto_result: { outcome_data: { competitors: cs } } }, ...extra });
const THREE = tasksWith([comp("Beta Pipes", "https://betapipes.com"), comp("Gamma Drains", null), comp("Delta Rooter", "https://delta-rooter.com")]);
const org = (...hosts) => hosts.map((h) => ({ link: `https://${h}/page` }));
// a fake provider: the results depend on the query
const make = (answer, log = []) => async (u) => { log.push(String(u)); const q = new URL(u).searchParams.get("q"); const a = answer(q); return a instanceof Error ? (() => { throw a; })() : { ok: true, status: 200, json: async () => a }; };
const ANSWER = (q) => ({ organic_results: org(
  /Acme/.test(q) ? "acmeplumbing.com" : /Beta/.test(q) ? "betapipes.com" : /Gamma/.test(q) ? "gamma-drains.net" : "delta-rooter.com",
  "plumbersguild.example", /Gamma|Delta/.test(q) ? "tradepages.example" : `solo-${q.replace(/\W/g, "").slice(0, 5).toLowerCase()}.example`, /Acme/.test(q) ? "solo-acme-twice.example" : `solo-${q.replace(/\W/g, "").slice(0, 5).toLowerCase()}x.example`, /Acme/.test(q) ? "solo-acme-twice.example" : `solo-${q.replace(/\W/g, "").slice(0, 5).toLowerCase()}y.example`, "www.google.com") });
const deps = (o = {}) => ({ env: { CITATION_BRAND_DISCOVERY: "1", SERPAPI_KEY: "k" }, left: async () => 100, fetchFn: make(ANSWER), now: () => Date.parse("2026-11-01T12:00:00Z"), ...o });

// ── it ships off ──
for (const v of [undefined, "", "0", "true", "yes", "1 "]) {
  const env = { SERPAPI_KEY: "k", ...(v === undefined ? {} : { CITATION_BRAND_DISCOVERY: v }) };
  const log = [];
  const r = await BD.forStep({ client, tasks: THREE, deps: deps({ env, fetchFn: make(ANSWER, log) }) });
  const expectOn = String(v).trim() === "1";
  if (expectOn) continue;   // "1 " is trimmed on purpose, like the other switches
  if (log.length) F(`with the switch at ${JSON.stringify(v)} it searched ${log.length} time(s)`);
  if (r.found) F(`with the switch at ${JSON.stringify(v)} it offered a searched list`);
  if (!/Showing: the suggested list/.test(r.head) || !/switched off/.test(r.head)) F(`off must say it is showing the suggested list and why, got: ${r.head}`);
}

// ── on: about 4 searches, repeats counted, brands' own sites left out ──
{
  const log = [];
  const r = await BD.forStep({ client, tasks: THREE, deps: deps({ fetchFn: make(ANSWER, log) }) });
  if (log.length !== 4) F(`expected 4 searches (brand + 3 competitors), got ${log.length}`);
  if (!r.found) F(`the happy path must offer a searched list, got ${JSON.stringify(r.result)}`);
  else {
    const hosts = r.found.brand_discovery.directories.map((d) => d.host);
    if (hosts[0] !== "plumbersguild.example" || r.found.brand_discovery.directories[0].appears !== 4) F(`the directory in all four searches must lead with 4, got ${JSON.stringify(r.found.brand_discovery.directories)}`);
    if (!hosts.includes("tradepages.example") || r.found.brand_discovery.directories.find((d) => d.host === "tradepages.example").appears !== 2) F("a directory in two searches must count 2");
    if (hosts.some((h) => /^solo-/.test(h))) F("a host that appeared once is not a repeat");
    if (hosts.some((h) => /acmeplumbing|betapipes|delta-rooter|google/.test(h))) F("the brands' own sites and google.com must not be counted as directories");
    if (!/Showing: directories found by searching 4 business names/.test(r.head)) F(`the headline must name what it shows, got: ${r.head}`);
  }
  if (log.some((u) => /\+?\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}/.test(decodeURIComponent(u).replace(/api_key=[^&]*/, "")))) F("a phone number was searched: a quoted-phone query is untested and not allowed");
  if (!log.every((u) => /q=%22/.test(u) && /Austin/.test(decodeURIComponent(u)))) F("each query must be the quoted name plus the market");
  // once per client
  const log2 = [];
  const again = await BD.forStep({ client, tasks: THREE, deps: deps({ fetchFn: make(ANSWER, log2) }) });
  const withPrior = await BD.forStep({ client, tasks: { ...THREE, "m1.cit.industry_specific": { auto_result: { outcome_data: { brand_discovery: r.found.brand_discovery } } } }, deps: deps({ fetchFn: make(ANSWER, log2) }) });
  if (log2.length !== 4) F(`a finished discovery must be reused: expected the 4 searches of the no-prior call only, got ${log2.length}`);
  if (!withPrior.found || withPrior.result.reused !== true || withPrior.result.state !== "done") F("a reused discovery must stay 'done' (so it is reused again) and say reused");
  void again;
}

// ── refusals: nothing is searched ──
{
  const none = async (name, d, tasks, rx) => {
    const log = []; const r = await BD.forStep({ client, tasks, deps: deps({ ...d, fetchFn: make(ANSWER, log) }) });
    if (log.length) F(`${name}: it searched ${log.length} time(s)`);
    if (r.found) F(`${name}: it offered a searched list`);
    if (!rx.test(r.head)) F(`${name}: the headline must say why, got: ${r.head}`);
    if (!/Showing: the suggested list/.test(r.head)) F(`${name}: the headline must name the list it shows`);
  };
  await none("no key", { env: { CITATION_BRAND_DISCOVERY: "1" } }, THREE, /no search key/);
  await none("count unreadable", { left: async () => null }, THREE, /couldn't read how many searches/);
  await none("count throws", { left: async () => { throw new Error("x"); } }, THREE, /couldn't read how many searches/);
  await none("plan out", { left: async () => 3 }, THREE, /plan is out/);
  await none("plan out at the reserve", { left: async () => 8 }, THREE, /plan is out/);
  await none("no competitors", {}, tasksWith([]), /no competitors are recorded/);
  await none("no competitor snapshot at all", {}, {}, /no competitors are recorded/);
  const ok9 = []; const r9 = await BD.forStep({ client, tasks: THREE, deps: deps({ left: async () => 9, fetchFn: make(ANSWER, ok9) }) });
  if (ok9.length !== 4 || !r9.found) F("exactly the searches needed plus the reserve must go ahead");
}

// ── failures keep the existing list ──
{
  const r = await BD.forStep({ client, tasks: THREE, deps: deps({ fetchFn: make((q) => (/Gamma/.test(q) ? new Error("boom") : ANSWER(q))) }) });
  if (r.found) F("one search failing must not produce a list from the other three");
  if (!/Showing: the suggested list/.test(r.head) || !/didn't answer/.test(r.head)) F(`a failed search must say so and name the list shown, got: ${r.head}`);
  const bad = await BD.forStep({ client, tasks: THREE, deps: deps({ fetchFn: async () => ({ ok: false, status: 429, json: async () => ({ error: "out of searches" }) }) }) });
  if (bad.found || !/didn't answer/.test(bad.head)) F("an error answer from the provider must fall back and say so");
  if (bad.result.state === "done") F("a failed discovery must never be 'done' (it would be reused as if it worked)");
  const nothing = await BD.forStep({ client, tasks: THREE, deps: deps({ fetchFn: make(() => ({ organic_results: [] })) }) });
  if (nothing.found) F("searches that found nothing must not offer a list");
  if (!/no directory came up in more than one/.test(nothing.head)) F(`an empty comparison must say so, got: ${nothing.head}`);
}

// ── universal ──
{
  const q1 = BD.queriesFor({ business_name: "Smith Electrical Ltd", primary_market: "Leeds, UK" }, [comp("Jones Sparks")]);
  if (q1.length !== 2 || !/"Smith Electrical Ltd" Leeds, UK/.test(q1[0].query)) F("a non-US market must narrow the query as written");
  const q2 = BD.queriesFor({ business_name: "Solo Co", primary_market: "" }, [comp("Solo Co"), comp("  "), comp("Other")]);
  if (q2.length !== 2 || q2[0].query !== '"Solo Co"') F("with no market the query is the quoted name alone, and a competitor with the client's own name is left out");
  const q3 = BD.queriesFor(client, [comp("A"), comp("B"), comp("C"), comp("D"), comp("E")]);
  if (q3.length !== 4) F(`at most the brand and 3 competitors, got ${q3.length}`);
  if (BD.queriesFor({ business_name: "" }, [comp("A")]).some((x) => x.who === "client")) F("a client with no name has no brand search");
  const q4 = BD.queriesFor({ business_name: 'The "Best" Plumber', primary_market: "X" }, [comp("A")]);
  if (/""/.test(q4[0].query) || (q4[0].query.match(/"/g) || []).length !== 2) F("quotes inside a name must not break the query");
  if (BD.competitorsOf(null).length || BD.competitorsOf({ "m1.audit.competitors": { auto_result: { outcome_data: { competitors: "x" } } } }).length) F("a competitor list in the wrong shape must read as none");
  if (BD.competitorsOf(tasksWith([{ website: "https://x.com" }, null, comp("Real", null)])).length !== 1) F("a competitor with no name can't be searched; one with no website still is");
}

// ── the step's wiring and words ──
if (!/require\("\.\/_citation-brand-discovery"\)\.forStep\(/.test(exec)) F("the industry-specific step doesn't call the discovery");
// 🔄 citations_52_55_v1 (approved 11-9): the step's list is RGA's own list per trade now, never a model's "suggested list". A real search
// list is shown BESIDE it (labelled as found by searching business names) and recorded, never instead of it; the result says it is the trade list.
if (!/if \(bd && bd\.found\) return \{ \.\.\.out, summary: `\$\{out\.summary\}\\n\\nAlso found by searching business names:\\n\$\{bd\.found\.text\}`/.test(exec)) F("a real brand-search list must be shown beside the trade list, labelled");
if (!/brand_discovery: bd\.found\.brand_discovery/.test(exec)) F("the result must record the brand-search list when it shows one");
if (!/list_source: "trade_list"/.test(exec)) F("the result must record that its list is RGA's trade list");
if (/list_source: "suggested"/.test(exec)) F("a model-suggested list is back");
if (/CITATION_BRAND_DISCOVERY\s*[:=]\s*["']?1/.test((exec + lib).replace(/\/\/.*$/gm, ""))) F("the switch is turned on in code");
if (!/String\(env\.CITATION_BRAND_DISCOVERY \|\| ""\)\.trim\(\) === "1"/.test(lib)) F("the switch must be exactly 1");
{
  const s = pb.month1.find((x) => x.id === "m1.cit.industry_specific");
  if (!s) F("the step is gone");
  else {
    if (s.title !== "Build industry-specific citations") F("the step's title changed");
    if (!/Directories found by searching real business names are shown beside it/.test(s.instructions) || /suggested list/.test(s.instructions)) F("the step's words must say the brand-search list is shown beside the trade list (citations_52_55_v1)");
    const order = pb.month1.map((x) => x.id);
    if (order.indexOf("m1.cit.industry_specific") < 0) F("the step moved out of the playbook");
  }
  const mjs = fs.readFileSync(path.join(process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "flow/playbooks/month1.mjs"), "utf8");
  if (!/Directories found by searching real business names are shown beside it/.test(mjs)) F("the canonical month1.mjs doesn't carry the same words");
}
if (/\bChris\b/.test(lib)) F("the owner's name is in a served file");
if (/—/.test(lib.replace(/^\/\/.*$/gm, "").replace(/\/\/.*$/gm, ""))) F("an em dash in user-visible text");

if (fails.length) { console.error("🔴 brand-name directory discovery isn't right:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ brand discovery: ships off · 4 searches once per client (reused, never repeated) · refuses with no key, an unreadable count, the plan out or no competitors · a failed search keeps the existing list and says so · repeats counted, the brands' own sites left out · no phone query · works with no competitors, no competitor website, a shared name and any market");
