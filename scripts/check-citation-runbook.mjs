#!/usr/bin/env node
// check-citation-runbook.mjs — the runbook card on the listings step when a name, address or phone changes (approved admin_last_research_items_v1, item 2, 11-01).
// File-only: no browser, no database, no real search. It proves:
//   · the card finds the latest change that is ON GOOGLE and recent, with the old and new value as recorded, and says "not recorded" instead of guessing
//   · the browser's copy of that rule (admin.js) gives the same answer as the server's, on the same fixtures
//   · "Search old and new" REFUSES when the plan is out, when the count can't be read, with no key, with nothing recorded, or twice in a day
//   · it searches only recorded values (one search each), a failed search says so and proves nothing, and the result is "what the search found", never "fixed"
//   · the writer claims before it searches, reads both saves back, records the action, and reaches no listing
// 🔴 WHY: SerpAPI has a handful of searches left and "I couldn't tell" must never spend one; a search result that says "fixed" would be a claim no search can make.
// Exit 0 pass · 1 fail · 2 cannot tell.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rd = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
let RB, lib, fn, admin;
try { RB = createRequire(import.meta.url)(path.join(SITE, "netlify/functions/_citation-runbook.js")); lib = rd("netlify/functions/_citation-runbook.js"); fn = rd("netlify/functions/admin-citation-runbook.js"); admin = rd("admin/admin.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — a file moved: ${e.message}`); process.exit(2); }
const fails = [], F = (m) => fails.push(m);
const NOW = Date.parse("2026-11-01T12:00:00Z"), DAYS = (n) => new Date(NOW - n * 86400000).toISOString();
const item = (o) => ({ id: "cc_x", kind: "proposal", field: "phone", from: "(310) 555-0100", to: "(310) 555-0199", status: "on_google", sent_at: DAYS(20), ...o });

// ── which change, and what was recorded ──
{
  const c = RB.changeOf({ core_changes: [item({})] }, NOW);
  if (!c || c.field !== "phone" || c.old !== "(310) 555-0100" || c.new !== "(310) 555-0199") F(`the change must carry the recorded old and new value, got ${JSON.stringify(c)}`);
  if (RB.changeOf({ core_changes: [] }, NOW) !== null || RB.changeOf(null, NOW) !== null || RB.changeOf({}, NOW) !== null) F("no change on record must give null");
  if (RB.changeOf({ core_changes: [item({ status: "asked" })] }, NOW) !== null) F("a change that is not on Google yet must not start the runbook");
  if (RB.changeOf({ core_changes: [item({ field: "main_category" })] }, NOW) !== null) F("a category change is not a name, address or phone change");
  if (RB.changeOf({ core_changes: [item({ sent_at: DAYS(200) })] }, NOW) !== null) F("a change months old must not keep the card up forever");
  const two = RB.changeOf({ core_changes: [item({ field: "name", from: "Old Name LLC", to: "New Name Co", sent_at: DAYS(40) }), item({ sent_at: DAYS(5) })] }, NOW);
  if (!two || two.field !== "phone") F("the latest change must win");
  const nf = RB.changeOf({ core_changes: [item({ from: null })] }, NOW);
  if (!nf || nf.old !== null) F("an old value that wasn't recorded must be null, never guessed");
  const sh = RB.changeOf({ core_changes: [item({ field: "address", from: "shown", to: "12 Main St, Leeds LS1 4AB" })] }, NOW);
  if (!sh || sh.old !== null) F('"shown" is an answer, not an address: it must not be treated as the old value');
  const uk = RB.changeOf({ core_changes: [item({ field: "address", from: "1 Rue de Rivoli, 75001 Paris", to: "5 Avenue Foch, 75116 Paris" })] }, NOW);
  if (!uk || uk.new !== "5 Avenue Foch, 75116 Paris") F("an address in another country must pass through unchanged");
  // the browser's copy
  const at = admin.indexOf("function citRunbookChange(");
  if (at < 0) F("the browser's copy of the rule moved");
  else {
    let d = 0, end = -1;
    for (let i = admin.indexOf("{", at); i < admin.length; i++) { if (admin[i] === "{") d++; else if (admin[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
    const ctx = vm.createContext({ CIT_RB_FIELDS: { name: "name", address: "address", phone: "phone number" }, Date, Number, String, Array });
    const browser = vm.runInContext(`(${admin.slice(at, end).replace(/^function citRunbookChange/, "function")})`, ctx);
    const cases = [{ core_changes: [item({})] }, { core_changes: [item({ from: null })] }, { core_changes: [item({ status: "asked" })] }, { core_changes: [item({ sent_at: DAYS(200) })] }, { core_changes: [item({ field: "address", from: "shown" })] },
      { core_changes: [item({ field: "name", sent_at: DAYS(40), from: "A", to: "B" }), item({ sent_at: DAYS(5) })] }, {}, null];
    for (const [i, c] of cases.entries()) {
      const a = RB.changeOf(c, NOW), b = browser(c, NOW);
      const pick = (x) => (x ? { f: x.field, at: x.at, o: x.old, n: x.new } : null);
      if (JSON.stringify(pick(a)) !== JSON.stringify(pick(b))) F(`the browser and the server disagree on fixture ${i}: ${JSON.stringify(pick(b))} vs ${JSON.stringify(pick(a))}`);
    }
  }
}

// ── reading a result ──
{
  const S = RB.shows;
  if (!S("phone", "(310) 555-0100", "Call us: 310-555-0100 today")) F("a phone matches by its digits whatever the separators");
  if (!S("phone", "(310) 555-0100", "tel +1 310.555.0100")) F("a phone with dots must match");
  if (S("phone", "(310) 555-0100", "Call 310-555-0199")) F("a different number must not match");
  if (S("phone", "555", "555")) F("a short digit run is not a phone number");
  if (!S("name", "Old Name LLC", "welcome to OLD   name llc, plumbers")) F("a name matches in any case");
  if (S("name", "", "anything")) F("an empty value matches nothing");
}

// ── the refusals ──
{
  const change = RB.changeOf({ core_changes: [item({})] }, NOW);
  const R = (o) => RB.refusal({ change, prior: null, left: 100, key: "k", need: 2, nowMs: NOW, ...o });
  if (R({}) !== null) F("a clean request must go ahead");
  if (!/plan is out/.test(R({ left: 3 }) || "")) F("with the plan out it must refuse and say so");
  if (!/couldn't read/.test(R({ left: null }) || "")) F("a count that can't be read must refuse (I couldn't tell is a reason not to spend)");
  if (!/couldn't read/.test(R({ left: NaN }) || "")) F("NaN must refuse");
  if (!R({ key: "" })) F("no key must refuse");
  if (!R({ change: null })) F("no change must refuse");
  if (!R({ need: 0 })) F("nothing recorded must refuse");
  if (!R({ prior: { change_at: change.at, at: new Date(NOW - 3600e3).toISOString() } })) F("a second search inside a day must refuse");
  if (R({ prior: { change_at: change.at, at: new Date(NOW - 2 * 86400000).toISOString() } }) !== null) F("a search two days later may go ahead");
  if (R({ left: 2 + RB.RESERVE }) !== null) F("exactly enough searches plus the reserve must go ahead");
  if (!R({ left: 2 + RB.RESERVE - 1 })) F("one short of the reserve must refuse");
}

// ── the searches ──
{
  let calls = 0; const urls = [];
  const ok = async (u) => { calls++; urls.push(String(u)); return { ok: true, status: 200, json: async () => ({ organic_results: [{ title: "Acme Plumbing", link: "https://x.example/a", snippet: "Call 310-555-0100" }, { title: "Other", link: "https://y.example/", snippet: "no number" }] }) }; };
  const change = RB.changeOf({ core_changes: [item({})] }, NOW);
  const r = await RB.searchOldNew({ change, fetchFn: ok, env: { SERPAPI_KEY: "k" }, nowMs: NOW });
  if (calls !== 2 || r.searches !== 2) F(`old and new recorded must cost exactly two searches, got ${calls}`);
  if (!urls.every((u) => /q=%22/.test(u))) F("the value must be searched in quotes");
  const o = r.values.find((v) => v.which === "old");
  if (!o || o.state !== "searched" || o.results.length !== 2 || o.results[0].shows !== true || o.results[1].shows !== false) F("a result must say whether it shows the value");
  if (/fixed|clean|gone|updated/i.test(JSON.stringify(r))) F("a search result must never say a listing is fixed");
  calls = 0;
  const half = await RB.searchOldNew({ change: { ...change, old: null }, fetchFn: ok, env: { SERPAPI_KEY: "k" }, nowMs: NOW });
  if (calls !== 1 || half.values.find((v) => v.which === "old").state !== "not_recorded") F("a value that wasn't recorded must not be searched");
  const bad = await RB.searchOldNew({ change, fetchFn: async () => { throw new Error("boom"); }, env: { SERPAPI_KEY: "k" }, nowMs: NOW });
  if (!bad.values.every((v) => v.state === "couldnt" && !v.results.length)) F("a search that fails must say it didn't answer, with no results");
  const out = await RB.searchOldNew({ change, fetchFn: async () => ({ ok: false, status: 429, json: async () => ({ error: "Your account has run out of searches." }) }), env: { SERPAPI_KEY: "k" }, nowMs: NOW });
  if (!out.values.every((v) => v.state === "couldnt" && /plan is out/.test(v.reason))) F("a plan that runs out mid-search must say so");
}

// ── the writer ──
if (/mybusiness|googleapis\.com\/(?!webmasters)|yelp\.com|bingplaces|bingapis|apple\.com|graph\.facebook|api\.github\.com|method:\s*"(PUT|DELETE|PATCH)"/.test(fn + lib)) F("the runbook reaches a listing or a website: it must only search");
{
  const iClaim = fn.indexOf('state: "running"'), iSearch = fn.indexOf("deps.search("), iRefuse = fn.indexOf("RB.refusal(");
  if (iRefuse < 0 || iClaim < 0 || iSearch < 0 || !(iRefuse < iClaim && iClaim < iSearch)) F("the order must be: refuse, claim, then search");
  if (!/old_new_search\.at !== at\) return json\(500/.test(fn) || !/old_new_search\.state !== "done"\) return json\(500/.test(fn)) F("the claim and the result must both be read back");
  if (!/if \(why\) return json\(409/.test(fn) || !/if \(pre\) return json\(409/.test(fn)) F("the refusals must stop the request before anything is spent");
  if (!/left = await deps\.left\(\)/.test(fn)) F("the plan's own count of searches left must be read before spending");
  if (!/recordSubmission\(/.test(fn)) F("the search must be recorded (check-every-submission-is-recorded)");
  if (!/requireWorkspaceForClient\(/.test(fn)) F("the runbook search must be RGA-only");
  if (!/serpAccount\(\)/.test(fn)) F("the plan's own count of searches left must be read before spending");
}

// ── the card ──
{
  const card = (admin.split("function citRunbookHtml")[1] || "").split("/** Monthly \"Post 4 GBP updates\"")[0];
  if (!card) F("the card moved");
  for (const w of ["Search old and new", "Update the listings in this order", "value wasn't recorded", "because it wasn't recorded", "what the search found", "it refuses when the plan is out", "Nothing changes on any listing unless a person does it"]) if (!card.includes(w)) F(`the card doesn't say "${w}"`);
  for (const d of ["Bing", "Apple", "Yelp", "Facebook", "Data Axle"]) if (!/CIT_RB_ORDER = \[[^\]]*/.exec(admin)[0].includes(d)) F(`the order is missing ${d}`);
  if (!/CIT_RB_ORDER = \["Google", "Bing", "Apple", "Yelp", "Facebook", "Data Axle"\]/.test(admin)) F("the order must be Google, Bing, Apple, Yelp, Facebook, Data Axle");
  if (/\bfixed\b/i.test(card + (fn + lib).replace(/^\/\/.*$/gm, ""))) F('the card or writer says "fixed"');
  if (!/classList\.add\("is-busy"\)/.test(card) || !/classList\.remove\("is-busy"\)/.test(card)) F("the Search button must spin and un-spin");
  if (!/id === "m1\.audit\.citations" \? citAutoHtml\(t\) \+ citNapHtml\(t\) \+ citRunbookHtml\(\)/.test(admin)) F("the card isn't drawn on the listings step");
  if (/\b(?:step|Step) \d+\b/.test(card)) F("the card types a step number");
  if (/—/.test(card)) F("the card has an em dash");
  if (/\bChris\b/.test(card + fn + lib)) F("the owner's name is in a served file");
}

if (fails.length) { console.error("🔴 the citation runbook isn't right:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ citation runbook: the latest name/address/phone change with its recorded old and new (missing = said so) · browser = server · refuses when the plan is out or can't be read · searches only recorded values · a failed search proves nothing · never \"fixed\" · claim before search, read back, recorded, reaches no listing");
