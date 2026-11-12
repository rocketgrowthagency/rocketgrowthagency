#!/usr/bin/env node
// check-ai-sample-says-date-and-runs.mjs — THE MONTHLY AI VISIBILITY SAMPLE IS A DATED SAMPLE, NEVER A PROMISE (approved tier3_best_in_class_v1 §6, the owner 11-11).
// Extends check-ai-search-checks (the hand check, the crawler facts) to the automatic sample.
//
// WHAT IT HOLDS
//  1. Every shown sample states its date, its questions and the runs per tool; never the words rank, position, score, visibility or invisible
//     ("ranking" only as "not a ranking"); one line per tool, never added up; its own block AFTER the numbers, never inside anything about the map.
//  2. "Could not check" (no AI answer) is never counted as "did not come up", in the stored runs and in every line drawn from them.
//  3. SPEND: at most 18 SerpAPI searches and 6 OpenAI requests a client a month, even when every AI Overview needs a follow-up; nothing is spent when SerpAPI's
//     own count leaves less than the shared floor (_serpapi-reserve mayTake), or cannot be read: the month says "Not sampled", never "did not".
//  4. PILOT: RGA's own business only, from Month 2, from the 3rd, once a month; no client report carries it while PILOT.clientVisible is false.
//  5. The client reserve grows with clients: _serpapi-reserve clientReserve = 250 + per client (its map scans, the AI sample's 18, the link finder), and the
//     Scraper's nightly reserve reads that formula from the preflight's count (lib/serpapi-budget.cjs), never below 250.
//  6. The OpenAI key is read by name only, never logged; the sample runs itself (no Run button), started only by the morning run with the internal secret.
// Universal fixtures: a name with an accent, an apostrophe and "&", a UK market, a business found only by its website in the sources.
// FAKES ONLY: no SerpAPI search, no OpenAI request, no database. SELF-PROVING: after a pass, the same checks on the website at LIVE_BEFORE must fail 5+ ways
// (else exit 2). --against=<revision> runs them on that revision and exits 1 when they fail.
// Exit 0 healthy · 1 a rule is broken · 2 INDETERMINATE
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB_GIT = process.env.WEBSITE_GIT_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCR = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const AGAINST = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const LIVE_BEFORE = process.env.LIVE_BEFORE || "b1a48dda";
const MIN_BEFORE_FAILS = 5;
const strip = (t) => String(t || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const WORDS = /\b(rank|ranks|ranked|position|positions|score|scores|visibility|invisible)\b|(?<!(?:not|never) a )\branking\b/i;

async function checks(root) {
  const F = [], fail = (m) => F.push(m);
  const req = createRequire(`${root}/netlify/functions/`);
  const read = (r) => { try { return fs.readFileSync(`${root}/${r}`, "utf8"); } catch { return null; } };
  let AS, AIS, R, E;
  try { AS = req("../../shared/ai-sample.js"); AIS = req("./_ai-sample.js"); } catch (e) { fail(`the AI sample does not load: ${String(e.message).split("\n")[0]}`); }
  try { R = req("./_serpapi-reserve.js"); } catch (e) { fail(`_serpapi-reserve.js does not load: ${e.message}`); }
  try { E = req("./_monthly-report-email.js"); } catch (e) { fail(`the report email does not load: ${e.message}`); }

  // ── 5 · the reserve formula (website) ──
  if (R) {
    if (typeof R.clientReserve !== "function") fail("_serpapi-reserve.js has no clientReserve formula (the client reserve does not grow with clients)");
    else {
      if (R.clientReserve(0) !== 250) fail(`clientReserve(0) is ${R.clientReserve(0)}, not the 250 base`);
      const per = R.clientReserve(1) - R.clientReserve(0);
      if (R.clientReserve(10) !== 250 + 10 * per) fail("clientReserve does not grow by the same amount per client");
      if (AS && per < AS.SERP_MAX + 1) fail(`the reserve grows by ${per} a client, less than the AI sample's ${AS.SERP_MAX} plus the link finder`);
      if (R.clientReserve("x") !== 250 || R.clientReserve(-3) !== 250) fail("a client count that is not a number moves the reserve off its base");
    }
    if (typeof R.mayTake !== "function") fail("_serpapi-reserve.js has no mayTake (the floor check)");
    else if (AS) {
      if (!R.mayTake(AS.SERP_MAX + R.SERPAPI_RESERVE, AS.SERP_MAX) || R.mayTake(AS.SERP_MAX + R.SERPAPI_RESERVE - 1, AS.SERP_MAX) || R.mayTake(null, 1) || R.mayTake(NaN, 0)) fail("mayTake does not keep exactly the floor behind, or takes on an unknown count");
    }
  }
  // ── 5b · the Scraper's nightly reserve reads the formula (fakes: a fake fetch, a temp state file) ──
  try {
    const sreq = createRequire(`${SCR}/lib/`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aisr-")), keep = { ...process.env };
    process.env.SERPAPI_STATE_FILE = `${tmp}/state.json`; delete process.env.SERPAPI_RESERVE; process.env.SERPAPI_RESERVE_FORMULA = `${root}/netlify/functions/_serpapi-reserve.js`;
    const B = sreq("./serpapi-budget.cjs");
    if (typeof B.clientReserveNow !== "function") fail("the Scraper's serpapi-budget.cjs does not read the Website's client reserve formula");
    else {
      const rows = [{ id: "a", website_url: "https://acme.co.uk" }, { id: "b", website_url: "brightsmile.com" }, { id: "r", website_url: "https://www.rocketgrowthagency.com/" }];
      const fake = async (url) => ({ ok: true, json: async () => (/billing_status=in\.\(active,overdue,warning\)/.test(url) && /archived_at=is\.null/.test(url) ? rows : []) });
      const got = await B.clientReserveNow({ fetchFn: fake, env: { SUPABASE_URL: "https://db.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" } });
      const want = R && R.clientReserve ? R.clientReserve(2) : null;
      if (!got || got.active !== 2 || got.reserve !== want) fail(`the nightly reserve for 2 paying clients (RGA's own not counted) is ${JSON.stringify(got)}, wanted ${want}`);
      const bad = await B.clientReserveNow({ fetchFn: async () => ({ ok: false, status: 500 }), env: { SUPABASE_URL: "https://db.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" } });
      if (bad !== null) fail("a failed client count still produced a reserve");
      fs.writeFileSync(`${tmp}/state.json`, JSON.stringify({ snapshotAt: new Date().toISOString(), remaining: 900, clientReserve: want }));
      if (B.reserve() !== want) fail(`the night's reserve is ${B.reserve()} with the preflight's ${want} saved`);
      fs.writeFileSync(`${tmp}/state.json`, JSON.stringify({ snapshotAt: new Date().toISOString(), remaining: 900, clientReserve: 40 }));
      if (B.reserve() !== 250) fail("a saved client reserve under 250 lowered the night's reserve");
      const pre = strip(fs.readFileSync(`${SCR}/scripts/serpapi-budget.mjs`, "utf8"));
      if (!/clientReserveNow\(/.test(pre) || !/clientReserve:/.test(pre)) fail("the night's preflight does not count the clients and save the client reserve");
      if (!/SERPAPI_ACCOUNT_FIXTURE[^\n]*\?\s*null/.test(pre)) fail("the preflight would read the real database on a fixture run");
    }
    process.env = keep; fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { fail(`the Scraper's reserve could not be checked: ${String(e.message).split("\n")[0]}`); }

  if (AS && AIS) {
    // ── 3, 4 · the spend, the pilot, the stored record (fakes only) ──
    const mk = (o = {}) => {
      const store = { tasks: {} }, calls = { serp: [], openai: 0 };
      const d = { now: () => Date.parse(o.now || "2026-11-03T15:00:00Z"),
        readStepRecord: async () => ({ tasks: JSON.parse(JSON.stringify(store.tasks)) }), writeStepTasks: async (rec, tasks) => { store.tasks = JSON.parse(JSON.stringify(tasks)); return { tasks: store.tasks }; },
        client: async () => ({ business_name: o.name || "Café Société & Sons", website_url: o.site || "https://cafe-societe.co.uk", primary_market: o.market || "Leeds, West Yorkshire", identity_phone: "0113 496 0000" }),
        isOwn: () => o.own !== false, monthNumber: async () => (o.month == null ? 3 : o.month), plan: async () => ({ keywords: ["coffee shop", "brunch"], areas: ["Leeds", "Headingley"] }),
        serpLeft: async () => (o.left === "fail" ? { ok: false } : { ok: true, left: o.left == null ? 900 : o.left }), hasOpenAiKey: () => o.key !== false,
        serp: async (p) => { calls.serp.push(p); if (o.serp) return o.serp(p, calls.serp.length); return p.engine === "google_ai_mode" ? { text_blocks: [{ snippet: "Try Cafe Societe and Sons for brunch." }] } : { ai_overview: { page_token: "t" } }; },
        openai: async () => { calls.openai++; return o.openai ? o.openai() : { output: [{ type: "message", content: [{ type: "output_text", text: "Leeds Brew is lovely.\nNAMED: Leeds Brew", annotations: [{ url: "https://cafe-societe.co.uk/menu" }] }] }] }; } };
      return { d, store, calls };
    };
    let x = mk();
    let r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    if (r.state !== "done") fail(`a due month did not take the sample (${r.state}: ${r.why || ""})`);
    if (x.calls.serp.length > AS.SERP_MAX || x.calls.serp.length > 18) fail(`the sample spent ${x.calls.serp.length} SerpAPI searches (cap 18), with every AI Overview needing a follow-up`);
    if (x.calls.openai > AS.OPENAI_MAX || x.calls.openai > 6) fail(`the sample made ${x.calls.openai} OpenAI requests (cap 6)`);
    const s = (((x.store.tasks["m2.quarter.ai_check"] || {}).outcome_data) || {}).sample;
    if (!s || s.state !== "done") fail("the sample is not stored at tasks[m2.quarter.ai_check].outcome_data.sample");
    else {
      if (!s.asked_at || !Array.isArray(s.questions) || s.questions.length !== 2 || s.runs_each !== 3) fail("the stored sample does not keep its date, its two questions and its runs each");
      if (s.runs.filter((u) => u.tool === "chatgpt").some((u) => u.result !== "came_up")) fail("a business found only by its own website in ChatGPT's sources was not counted as came up");
      if (s.runs.filter((u) => u.tool === "google_ai_mode").some((u) => u.result !== "came_up")) fail(`"Cafe Societe and Sons" did not match "Café Société & Sons" (accents, "&")`);
      // the follow-ups past the cap are could_not, never did_not
      const ov = s.runs.filter((u) => u.tool === "google_overviews");
      if (ov.some((u) => u.result === "did_not")) fail("an AI Overview that never loaded was counted as did not come up");
      if (s.runs.some((u) => u.tool === "perplexity")) fail("Perplexity was sampled automatically (it stays a hand check: no key on the server)");
      if (/when you|we promise|guarantee/i.test(JSON.stringify(s))) fail("the stored sample carries a promise");
    }
    // the budget: below the floor, an unreadable count
    x = mk({ left: AS.SERP_MAX + 24 }); r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    if (x.calls.serp.length || r.state !== "not_sampled") fail(`with ${AS.SERP_MAX + 24} searches left (floor 25) the sample spent ${x.calls.serp.length} searches / said ${r.state}`);
    const ns = (((x.store.tasks["m2.quarter.ai_check"] || {}).outcome_data) || {}).sample;
    if (!ns || ns.state !== "not_sampled" || !/searches left/i.test(ns.why || "")) fail("a month the budget can't cover does not say Not sampled and why");
    else { const v = AS.sampleView(ns); if (!v || !/^Not sampled in November$/.test(v.title)) fail(`a not-sampled month reads "${v && v.title}", not "Not sampled in November"`); }
    x = mk({ left: "fail" }); r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    if (x.calls.serp.length || x.calls.openai || r.state !== "not_sampled") fail("an unreadable SerpAPI count still spent, or was not said");
    x = mk(); x.d.serpLeft = async () => ({ ok: false, left: 900, error: "SerpAPI's account page answered 503." }); r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    if (x.calls.serp.length || r.state !== "not_sampled") fail("a SerpAPI count the provider marked as failed still spent");
    // the caps themselves are enforced (not only implied by 2 x 3 x 3): with smaller caps the spend stops at them
    if (AS.SERP_MAX !== 18 || AS.OPENAI_MAX !== 6) fail(`the caps are ${AS.SERP_MAX} SerpAPI and ${AS.OPENAI_MAX} OpenAI a month, not the approved 18 and 6`);
    const keepCaps = [AS.SERP_MAX, AS.OPENAI_MAX]; AS.SERP_MAX = 10; AS.OPENAI_MAX = 2;
    x = mk(); r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    [AS.SERP_MAX, AS.OPENAI_MAX] = keepCaps;
    if (x.calls.serp.length > 10 || x.calls.openai > 2) fail(`with caps of 10 and 2 the sample spent ${x.calls.serp.length} searches and ${x.calls.openai} requests`);
    const capped = (((x.store.tasks["m2.quarter.ai_check"] || {}).outcome_data) || {}).sample;
    if (capped && capped.runs.some((u) => u.result === "did_not" && u.tool === "chatgpt")) fail("a ChatGPT run skipped by the cap was counted as did not come up");
    if (R && R.PER_CLIENT && !(R.PER_CLIENT.ai_sample >= AS.SERP_MAX)) fail("the per-client reserve does not hold the AI sample's monthly searches");
    x = mk({ left: AS.SERP_MAX + 25 }); r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    if (r.state !== "done") fail("with exactly the cap plus the floor left, the sample did not run");
    // the pilot and the schedule
    for (const [o, why] of [[{ own: false }, "a client outside the pilot"], [{ month: 1 }, "Month 1"], [{ month: null, now: "2026-11-03T15:00:00Z" }, "an unknown month number"], [{ now: "2026-11-02T15:00:00Z" }, "the 2nd"]]) {
      x = mk(o); if (o.month === null) x.d.monthNumber = async () => null;
      r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
      if (x.calls.serp.length || x.calls.openai || r.state === "done") fail(`the sample ran for ${why}`);
    }
    x = mk(); await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d }); const n1 = x.calls.serp.length; await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    if (x.calls.serp.length !== n1) fail("the sample ran twice in one month");
    x = mk({ key: false }); r = await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    const nk = (((x.store.tasks["m2.quarter.ai_check"] || {}).outcome_data) || {}).sample;
    if (x.calls.openai || !nk || nk.runs.filter((u) => u.tool === "chatgpt").some((u) => u.result !== "could_not")) fail("without an OpenAI key ChatGPT was asked, or its runs were not could not check");
    // AI answers that never came back
    x = mk({ serp: () => ({ error: "Google hasn't returned any results for this query." }), openai: () => ({ error: { message: "rate limited" } }) });
    await AIS.runSample({ clientId: "c", month: "2026-11-01", deps: x.d });
    const nc = (((x.store.tasks["m2.quarter.ai_check"] || {}).outcome_data) || {}).sample;
    if (!nc || nc.runs.some((u) => u.result !== "could_not")) fail("an error from SerpAPI or OpenAI was read as did not come up");
    else for (const t of AS.TOOLS) if (AS.toolLine(nc, t.key) !== "Could not check") fail(`${t.label} with no answers reads "${AS.toolLine(nc, t.key)}", not "Could not check"`);

    // ── 1, 2 · the words ──
    const ex = { month: "2026-11-01", state: "done", asked_at: "2026-11-03T15:00:00Z", questions: ["best roofer in Culver City", "roof repair near Palms"], runs_each: 3,
      runs: [...[0, 1].flatMap((q) => [1, 2, 3].map((run) => ({ tool: "google_overviews", q, run, result: q === 0 && run !== 2 ? "came_up" : "did_not" }))),
        ...[0, 1].flatMap((q) => [1, 2, 3].map((run) => ({ tool: "google_ai_mode", q, run, result: run === 3 ? "could_not" : q === 0 && run === 2 ? "came_up" : "did_not" }))),
        ...[0, 1].flatMap((q) => [1, 2, 3].map((run) => ({ tool: "chatgpt", q, run, result: "did_not", named: ["Ace Roofing"] })))], facts: [] };
    const av = AS.sampleView(ex), all = JSON.stringify(av);
    if (!av || !/Nov 3/.test(av.title)) fail("the admin sample does not say its date");
    if (!/18 runs/.test(av.when || "") || !/2 could not check/.test(av.when || "")) fail(`the admin sample does not say its runs and how many could not be checked ("${av && av.when}")`);
    if (WORDS.test(all)) fail(`the admin sample says a forbidden word: ${(all.match(WORDS) || [])[0]}`);
    if (!/Perplexity/.test(all) || !/[Hh]and check/.test(all)) fail("the admin sample does not keep Perplexity as the hand check");
    const mode = (av.rows || []).find((x2) => /AI Mode/.test(x2.title));
    if (!mode || !/could not check/.test(mode.line)) fail("the admin AI Mode line hides its could-not-check runs");
    const tl = AS.toolLine(ex, "google_ai_mode");
    if (!/Came up 1 of 6/.test(tl) || !/2 could not check/.test(tl)) fail(`AI Mode reads "${tl}": could not check must be said beside the count, never folded into did not`);
    if (AS.toolLine(ex, "chatgpt") !== "Did not come up") fail("ChatGPT with six did-not runs does not read Did not come up");
    const cb = AS.clientBlock(ex, { visible: true }), cs = JSON.stringify(cb || {});
    if (!cb || !/On Nov 3/.test(cb.intro) || !/2 questions, 3 times each/.test(cb.intro) || !/best roofer in Culver City/.test(cb.intro)) fail("the client block does not say its date, its questions and the runs each");
    if (cb && cb.lines.length !== 3) fail("the client block is not one line per tool");
    if (WORDS.test(cs)) fail(`the client block says a forbidden word: ${(cs.match(WORDS) || [])[0]}`);
    if (/map results above/i.test(cs)) fail("the client block points at map results 'above', which the report does not have");
    if (/\d+ of (12|18)\b/.test(cs) || /\btotal\b/i.test(cs)) fail("the client block adds the tools together");
    if (AS.PILOT.clientVisible !== false && !/PILOT_OPENED/.test(process.env.AI_SAMPLE_PILOT || "")) fail("the AI sample is open to clients before the pilot was compared by hand");
    if (AS.clientBlock(ex) !== null && AS.PILOT.clientVisible === false) fail("a client block is drawn while the pilot is closed to clients");
    // the report: no block while the pilot is closed; its own block after the numbers when open
    if (E) {
      const base = { month: "2026-11-01", monthNumber: 5, frozen: { google: { views: 210, calls: 22, prev_views: 200, prev_calls: 20 }, other: { clicks: 61, prev_clicks: 58 } }, client: { primary_contact_name: "Sam", business_name: "Beta" }, playbook: [], tasks: { "m2.quarter.ai_check": { outcome_data: { sample: ex } } }, now: Date.parse("2026-12-03T10:00:00Z") };
      const closed = E.buildMonthlyEmail(base);
      if (!closed.ok || /What AI tools said/.test(closed.html)) fail("a client report carries the AI sample while the pilot is closed to clients");
      AS.PILOT.clientVisible = true;
      const open = E.buildMonthlyEmail(base);
      AS.PILOT.clientVisible = false;
      if (!open.ok || !/What AI tools said \(a sample\)/.test(open.html)) fail("with the pilot open, the report has no AI sample block");
      else {
        const i = open.html.indexOf("What AI tools said"), w = open.html.indexOf("Where things stand");
        if (!(i > w)) fail("the AI block is not after the numbers");
        if (!/On Nov 3 we asked 2 questions, 3 times each/.test(open.html) || !open.lines.some((l) => /^- ChatGPT: Did not come up$/.test(l))) fail("the report's AI block (html or text) does not say its date, runs and one line per tool");
        if (WORDS.test(open.html.slice(i, open.html.indexOf("Coming next")))) fail("the report's AI block says a forbidden word");
      }
    }
  }
  // ── 6 · static ──
  const srv = strip(read("netlify/functions/_ai-sample.js") || "");
  if (srv && /console\.[a-z]+\([^)]*OPENAI_API_KEY|OPENAI_API_KEY[^\n]*console\./.test(srv)) fail("_ai-sample.js logs the OpenAI key");
  const bg = strip(read("netlify/functions/ai-sample-background.js") || "");
  if (!/requireInternalSecret\(/.test(bg)) fail("ai-sample-background is not behind the internal secret (it spends)");
  const mr = strip(read("netlify/functions/_morning-run.js") || "");
  if (!/ai-sample-background/.test(mr) || !/AS\.dueNow\(/.test(mr)) fail("the morning run does not start the month's sample (after its free due check)");
  const adm = read("admin/admin.js") || "";
  if (/data-(?:hl|qrt)-act="ai_sample/.test(adm) || /hlBtn\("ai_sample/.test(adm)) fail("the admin has a Run button for the AI sample (a step that runs itself has none)");
  if (!/rgaAiSample/.test(adm) || !/sampleView\(/.test(adm)) fail("the admin's AI search check card does not draw the sample");
  try { const AIC = req("./_ai-check.js"); if (!AIC.TOOLS.some((t) => t.key === "perplexity")) fail("the hand check lost Perplexity"); } catch (e) { fail(`_ai-check.js does not load: ${e.message}`); }
  return F;
}

function extract(rev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aisample-"));
  try { execFileSync("sh", ["-c", `git -C "$0" archive "$1" shared netlify/functions admin/admin.js data/playbooks | tar -x -C "$2"`, WEB_GIT, rev, dir], { stdio: ["ignore", "ignore", "pipe"] }); return dir; }
  catch { return null; }
}

if (!fs.existsSync(`${SITE}/netlify/functions/_ai-check.js`)) { console.error(`⚠️  INDETERMINATE — cannot read ${SITE}/netlify/functions/_ai-check.js`); process.exit(2); }
if (AGAINST) {
  const dir = extract(AGAINST); if (!dir) { console.error(`⚠️  INDETERMINATE — could not read the website at ${AGAINST}`); process.exit(2); }
  const F = await checks(dir); fs.rmSync(dir, { recursive: true, force: true });
  console.log(F.length ? `✗ ${F.length} rule(s) fail at ${AGAINST}:\n${F.map((f) => `  - ${f}`).join("\n")}` : `✓ every rule holds at ${AGAINST}`);
  process.exit(F.length ? 1 : 0);
}
const F = await checks(SITE);
if (F.length) { console.error(`✗ check-ai-sample-says-date-and-runs: ${F.length} problem(s)\n${F.map((f) => `  - ${f}`).join("\n")}`); process.exit(1); }
const dir = extract(LIVE_BEFORE);
if (!dir) { console.error(`⚠️  INDETERMINATE — could not read the website at ${LIVE_BEFORE} to prove this checker can fail`); process.exit(2); }
const B = await checks(dir); fs.rmSync(dir, { recursive: true, force: true });
if (B.length < MIN_BEFORE_FAILS) { console.error(`⚠️  INDETERMINATE — on the before state (${LIVE_BEFORE}) only ${B.length} rule(s) failed; it must fail ${MIN_BEFORE_FAILS}+ to prove it can tell`); process.exit(2); }
console.log(`✓ check-ai-sample-says-date-and-runs: dated, its questions and runs per tool, no forbidden word, could-not-check never did-not, at most 18 SerpAPI + 6 OpenAI above the floor, pilot only, the reserve grows with clients (before state ${LIVE_BEFORE}: ${B.length} failures)`);
process.exit(0);
