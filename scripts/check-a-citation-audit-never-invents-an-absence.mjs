#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// A CITATION AUDIT MUST NEVER REPORT A FAILED SEARCH AS AN ABSENT LISTING
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 THE SHAPE THIS EXISTS TO STOP. On 2026-10-06 all five map-pack probes timed out, `pack: null`
// held correctly — and then every sentence downstream counted the nulls as answers: "0 of 5 trigger
// a map pack", with a recommendation to abandon grid reporting built on top of it. A count is a
// consumer, and `length` turns "we did not find out" into "it is not so".
// → feedback_a_failed_measurement_must_not_become_a_finding · feedback_an_absence_must_never_be_readable_as_a_value
//
// Step 22 runs ten Google `site:` searches and tells Chris which directories the client is NOT
// listed on. That output starts work: step 52 builds the listings it names. So a timeout read as
// "missing" does not merely misreport — it sends someone to create a duplicate of a listing that
// already exists, which is the single worst thing a citation process can do to local rankings.
//
// 🔑 THE RULE: `missing` is reachable ONLY from a search that returned a readable result set.
// Every other path — no key, non-200, error body, timeout, budget spent, a body with no
// `organic_results` ARRAY — is `unknown`, and `unknown` is never written to `client_citations`.
//
// This gate RUNS the real function against stubbed responses. A static read of the source cannot
// tell whether the branches actually land where the comments say.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
//
// Exit 0 healthy · 1 the product is wrong · 2 INDETERMINATE

import fs from "node:fs";
import vm from "node:vm";
import { liftAdmin } from "./_lift-admin.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

const fails = [];
const F = (m) => fails.push(m);

// ── the stub bench ────────────────────────────────────────────────────────────────────────────
let written = [];          // every row handed to client_citations
let asked = [];            // every SerpAPI URL the run requested
const resp = (body, ok = true, status = 200) => ({
  ok, status, async json() { if (body instanceof Error) throw body; return body; }, async text() { return "{}"; },
});

function bench({ reply, key = "test-key", cached = [], writeFails = false }) {
  written = []; asked = [];
  const supa = async (path, init) => {
    if (init && init.method === "POST") {
      if (writeFails) throw new Error("Supabase 503: upstream unavailable");
      written.push(...JSON.parse(init.body)); return null;
    }
    return cached;
  };
  return {
    supa,
    fetch: async (url) => { asked.push(String(url)); return reply(String(url)); },
    AbortSignal: { timeout: () => undefined },
    process: { env: { SERPAPI_KEY: key } },
  };
}

async function run(opts) {
  const extra = bench(opts);
  // 🔑 A FRESH LIFT PER CASE. The stubs are globals in the sandbox; reusing one context across
  // cases would let case 2 answer case 3's searches. → feedback_a_fixture_must_fail_for_the_reason_it_tests
  // 🔑 `call`, NOT `get` — it resolves whatever the function reaches for mid-run, so this gate does
  // not carry a hand-written list of CIT_* constants that goes stale the day one is renamed.
  // → feedback_a_lift_list_is_a_promise_somebody_will_remember
  const api = liftAdmin(["auditCitations"], { file: "netlify/functions/flow-execute.js", extraGlobals: extra });
  return api.call("auditCitations", [{ business_name: opts.businessName || "Rocket Growth Agency" }, "client-1"]);
}

const count = (rows, s) => rows.filter((r) => r.status === s).length;

// ── CASE 1 · every search times out ───────────────────────────────────────────────────────────
{
  const rows = await run({ reply: () => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; } });
  if (count(rows, "missing")) F(`CASE 1 — every search timed out and ${count(rows, "missing")} directories were still reported MISSING`);
  if (count(rows, "unknown") !== rows.length) F(`CASE 1 — ${rows.length - count(rows, "unknown")} rows claimed an answer no search produced`);
  if (written.length) F(`CASE 1 — ${written.length} unknown row(s) were written to client_citations`);
}

// ── CASE 2 · a real hit ───────────────────────────────────────────────────────────────────────
{
  const rows = await run({ reply: (u) => resp(u.includes("yelp.com")
    ? { organic_results: [{ link: "https://www.yelp.com/biz/rocket-growth-agency" }] }
    : { organic_results: [] }) });
  const yelp = rows.find((r) => r.source === "Yelp");
  if (yelp?.status !== "found") F(`CASE 2 — a yelp.com result in the SERP produced status "${yelp?.status}", not "found"`);
  if (!yelp?.url) F("CASE 2 — a found listing carries no URL, so nobody can go and check it");
  if (count(rows, "missing") !== rows.length - 1) F(`CASE 2 — ${count(rows, "missing")} missing, expected ${rows.length - 1}`);
  if (written.length !== rows.length) F(`CASE 2 — ${written.length} rows written, expected all ${rows.length} to be stored`);
}

// ── CASE 3 · 🔴 THE CRITICAL ONE — a 200 with no result set is NOT an empty result set ─────────
{
  const rows = await run({ reply: () => resp({ search_metadata: { status: "Success" } }) });
  if (count(rows, "missing")) F(`CASE 3 — a 200 carrying NO organic_results key was read as proof of absence on ${count(rows, "missing")} directories`);
  if (count(rows, "unknown") !== rows.length) F("CASE 3 — a body with no result set must be unknown on every directory");
}

// ── CASE 4 · an error body, and a non-200 ─────────────────────────────────────────────────────
{
  const rows = await run({ reply: () => resp({ error: "Your account has run out of searches" }) });
  if (count(rows, "missing")) F(`CASE 4 — a SerpAPI refusal was reported as ${count(rows, "missing")} absent listings`);
  if (!rows.every((r) => /refused/.test(r.note))) F("CASE 4 — a refusal does not say it was refused, so the reader cannot tell it from a real answer");
}
{
  const rows = await run({ reply: () => resp({}, false, 429) });
  if (count(rows, "missing")) F(`CASE 4b — a 429 was reported as ${count(rows, "missing")} absent listings`);
}

// ── CASE 5 · no API key at all ────────────────────────────────────────────────────────────────
{
  const rows = await run({ reply: () => resp({ organic_results: [] }), key: "" });
  if (count(rows, "missing")) F(`CASE 5 — with no SERPAPI_KEY, ${count(rows, "missing")} directories were declared missing without a single search`);
  if (written.length) F("CASE 5 — rows were stored although nothing was measured");
}

// ── CASE 6 · a lookalike host must not satisfy a directory ────────────────────────────────────
{
  const rows = await run({ reply: () => resp({ organic_results: [{ link: "https://notyelp.com/rocket" }, { link: "https://yelp.com.evil.test/x" }] }) });
  const yelp = rows.find((r) => r.source === "Yelp");
  if (yelp?.status === "found") F(`CASE 6 — "${yelp.url}" was accepted as a Yelp listing`);
}

// ── CASE 6b · 🔴 A PAGE ON THE HOST IS NOT A LISTING ──────────────────────────────────────────
// project_citation_audit records the standing rule: telling a client they have no Yelp listing when
// they do is the finding that ends a relationship — and the inverse sends step 52 to build a
// DUPLICATE. A directory's own search page, a city index and a listicle all sit on the right host.
{
  const rows = await run({ reply: () => resp({ organic_results: [
    { link: "https://www.yelp.com/search?find_desc=seo&find_loc=Culver+City", title: "Best SEO in Culver City" },
    { link: "https://www.yelp.com/c/culver-city/seo", title: "SEO in Culver City" },
  ] }) });
  const yelp = rows.find((r) => r.source === "Yelp");
  if (yelp?.status === "found") F(`CASE 6b — "${yelp.url}" is a directory index, not this business's listing, and was accepted as one`);
  if (yelp?.status !== "missing") F(`CASE 6b — a search that ran and surfaced no profile should be missing, got "${yelp?.status}"`);
}

// ── CASE 7 · a cached unknown must never be reused ────────────────────────────────────────────
{
  const stale = [{ source: "Yelp", url: null, status: "unknown", updated_at: new Date().toISOString() }];
  const rows = await run({ reply: () => resp({ organic_results: [{ link: "https://www.yelp.com/biz/x" }] }), cached: stale });
  const yelp = rows.find((r) => r.source === "Yelp");
  if (yelp?.status !== "found") F(`CASE 7 — a cached "unknown" was re-read instead of retried, so pressing Run again changes nothing (got "${yelp?.status}")`);
}

// ── CASE 8 · the measurement survives a failed write, and says so ─────────────────────────────
// 🔴 A failed write loses the hand-off to step 52, not the answer on the card. But it must be said
// ONCE, for the whole output — appending it to each row's note hid it on every `found` row, because
// a found row renders its URL and never its note.
{
  const rows = await run({ reply: () => resp({ organic_results: [{ link: "https://www.yelp.com/biz/x" }] }), writeFails: true });
  if (!rows.writeError) F("CASE 8 — a failed write left no trace at all, so the card would imply step 52 can read these rows");
  if (rows.some((r) => /not saved/.test(r.note || ""))) F("CASE 8 — the write failure is stamped on individual rows, where a found row's note never renders");
  if (rows.find((r) => r.source === "Yelp")?.status !== "found") F("CASE 8 — a failed write threw away the measurement that did succeed");
}

// ── CASE 9 · a quote in the business name must not escape the exact-phrase query ──────────────
// 🔴 `"Bob's "Best" Plumbing" site:yelp.com` closes the phrase after one word and searches for
// something else — and the search SUCCEEDS, so the wrong answer is stored as a real measurement.
// A malformed query is the worst kind: it returns 200.
{
  await run({ reply: () => resp({ organic_results: [] }), businessName: 'Bob\'s "Best" Plumbing' });
  const first = asked[0] || "";
  const q = decodeURIComponent((first.match(/[?&]q=([^&]*)/) || [])[1] || "");
  const quotes = (q.match(/"/g) || []).length;
  if (quotes !== 2) F(`CASE 9 — the query carries ${quotes} quote characters, so the exact phrase does not enclose the whole name: ${q}`);
  if (!/^"[^"]+" site:/.test(q)) F(`CASE 9 — the query is not one quoted phrase followed by the site: filter: ${q}`);
}

// ═══ PART 2 — THE CARD MUST NOT SAY THE SAME THING ABOUT TWO OPPOSITE RUNS ═══════════════════
// 🔴🔴 "no new searches — every result was still current" was printed whenever nothing was spent,
// INCLUDING the run where every search failed. The cheap path (we already knew) and the broken path
// (we learned nothing) produced one confident sentence. Zero searches has two causes and they are
// opposites. → feedback_a_card_can_state_two_true_things_that_contradict
//
// This runs the REAL executor body out of flow-execute.js — a static read cannot tell what a
// template literal resolves to. → feedback_a_comment_asserting_a_fix_is_not_the_fix
{
  const src = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  const start = src.indexOf('  "m1.audit.citations": async ({ client, clientId }) => {');
  if (start < 0) { console.error("⚠️  INDETERMINATE — cannot find the m1.audit.citations executor"); process.exit(2); }
  let d = 0, end = -1;
  for (let i = src.indexOf("{", start + 40); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  if (end < 0) { console.error("⚠️  INDETERMINATE — cannot brace-match the executor"); process.exit(2); }
  const body = src.slice(src.indexOf("async", start), end);

  const runExec = async (rows) => {
    const ctx = vm.createContext({ auditCitations: async () => rows, Date, JSON, Math, String, Number, Array, Object, console });
    return vm.runInContext(`(${body})`, ctx)({ client: { business_name: "RGA" }, clientId: "c1" });
  };
  const failedRow = (source) => ({ source, host: `${source.toLowerCase()}.com`, status: "unknown", searched: false, spent: false, url: null, note: "the search returned 429" });
  const cachedRow = (source) => ({ source, host: `${source.toLowerCase()}.com`, status: "missing", searched: true, spent: false, url: null, note: `nothing on ${source.toLowerCase()}.com` });

  const allFailed = await runExec([failedRow("Yelp"), failedRow("BBB")]);
  const allCached = await runExec([cachedRow("Yelp"), cachedRow("BBB")]);
  const unsaved = Object.assign([cachedRow("Yelp")], { writeError: "Supabase 503" });
  const unsavedOut = await runExec(unsaved);
  if (unsavedOut.completed !== false) F("a run whose results could not be saved still marks the step complete — step 52 would find nothing");
  if (!/could NOT be saved/.test(unsavedOut.summary)) F("a run whose results could not be saved does not say so on the card");

  if (allFailed.summary === allCached.summary) F("a run where every search FAILED produces the same summary as a run that re-read current results");
  if (/still current/.test(allFailed.summary)) F('a run where every search failed claims its results were "still current" — it has no results');
  if (allFailed.completed !== false) F("a run that measured nothing reports the step as completed");
  if (allCached.completed !== true) F("a run that re-read real results refuses to complete the step");
  if (!/Press Run again/.test(allFailed.summary)) F("a run that learned nothing does not tell the reader to run it again");
  if (/reads these rows/.test(allFailed.summary)) F("a run that stored nothing still promises step 52 rows to read — it handed over nothing");
  if (!/reads these rows/.test(allCached.summary)) F("a run with real results does not name the step that consumes them");
}

if (fails.length) {
  console.error("🔴 a citation audit is inventing an absence:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a failed citation search is never an absent listing — 10 discovery cases + 3 summary runs, unknown stays unknown and is never stored");
