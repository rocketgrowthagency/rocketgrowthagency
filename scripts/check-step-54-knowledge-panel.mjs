#!/usr/bin/env node
// check-step-54-knowledge-panel.mjs — the brand knowledge panel step MEASURES (approved step mockup m1-54, 2026-10-19; steps_57_64_v1 11-9 changed what
// it does with the measurement: ONE search, NO model; a panel that exists is compared with their profile and is done only on a positive match).
// Kept here: a brand search finds a panel / none / someone else's / a failed search, and none is never a failure, never confused with a failed search.
// The full decision table, the card and the morning run are in check-steps-57-64.mjs. steps_57_64_v1: this gate used to lift the old runner (a model
// wrote a claim checklist after the search); it now drives the shipped runner on a fake network.
// Exit 0 pass · 1 fail · 2 indeterminate.
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SERPAPI_KEY: "serp-test", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } });
const log = []; let serp = {}, serpStatus = 200;
globalThis.fetch = async (u) => {
  const url = String(u); log.push(url);
  if (url.startsWith("https://serpapi.com/search.json")) return serpStatus === 200 ? res(200, serp) : res(serpStatus, { error: "quota" });
  if (url.startsWith("https://sb.test/rest/v1/")) return res(200, []);
  return res(404, "not faked");
};
let run;
try { run = req("./flow-execute.js").stepRunners.panel; } catch (e) { console.error(`⚠️  INDETERMINATE — the runner did not load: ${e.message}`); process.exit(2); }
const F = [], fail = (m) => F.push(m);
const client = { id: "c1", business_name: "Smith & Sons Plumbing", primary_market: "Denver, CO", identity_phone: "(303) 555-0100", website_url: "https://ss.com" };
const go = async (s, st = 200) => { log.length = 0; serp = s; serpStatus = st; return run({ client, clientId: "c1", tasks: {} }); };
{ const r = await go({ knowledge_graph: { title: "Smith and Sons Plumbing", type: "Plumber", phone: "(303) 555-0100", website: "https://ss.com" } });
  if (r.outcome !== "verified" || r.completed !== true || (r.outcome_data.kp || {}).state !== "match") fail(`a panel that is theirs isn't done (${r.outcome}) — "&" vs "and" must still match`);
  const q = new URL(log.find((u) => /serpapi/.test(u))).searchParams.get("q");
  if (q !== '"Smith & Sons Plumbing" Denver CO') fail(`the brand search isn't "<name>" + city + state (${q})`); }
{ const r = await go({ organic_results: [] });
  if (r.completed !== true || r.outcome !== "not_applicable_yet" || !/No knowledge panel yet/.test(r.summary)) fail("no panel isn't 'No panel yet' (done, normal for a business few people search for by name)"); }
{ const r = await go({ knowledge_graph: { title: "Smithsonian Institution" } });
  if (r.outcome !== "not_applicable_yet") fail("someone else's knowledge panel is read as this business's"); }
{ const r = await go({}, 500);
  if (r.outcome !== "indeterminate" || r.completed === true) fail("a failed search isn't indeterminate (it would read as 'no panel' or Done)"); }
if (F.length) { console.error("🔴 the brand panel step doesn't measure first:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the brand panel step measures first: theirs → done · none → 'No panel yet' · someone else's panel ≠ ours · failed search → indeterminate (one search, no model)");
