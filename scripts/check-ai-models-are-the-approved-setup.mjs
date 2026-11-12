#!/usr/bin/env node
// check-ai-models-are-the-approved-setup.mjs — THE AI COST SETUP "D" (approved Chris 11-12) STAYS WHAT WAS APPROVED, AND CANNOT GO BLANK.
//
// WHAT WAS APPROVED: client-facing words on claude-sonnet-5-5; simple jobs (alt text, photo look, attributes list, the daily ping) on
// claude-haiku-5-5; the internal jobs (Brain, call plans, keywords, categories, mystery shop) NOT switched yet (a side-by-side test first);
// nothing on an Opus-class model; OpenAI only for _ai-sample.js. The one place is website netlify/functions/_ai-models.js (TIERS).
//
// 🔴 THE 09-06 LESSON this gate exists for: switching to claude-sonnet-5 made the Brain return ZERO characters (clean end_turn, no text) and
// production silently produced nothing. The 5.x models think by default and thinking counts against max_tokens; they refuse temperature.
// FAILS when: any job is pinned to an Opus-class model · a client-facing tier (or a client-facing call site) uses Haiku · a Haiku call
// site is not on the simple allow-list · a Sonnet 5.5 / Haiku 5.5 request carries `temperature` or a thinking shape that 400s
// (Sonnet 5.5 {type:"disabled"}; anything but {type:"between_tools"}) or a trailing assistant prefill · an EMPTY answer is shipped instead of
// moving to the next model · the temperature-refusal retry is gone · a website file asks api.anthropic.com for words outside the helper · an
// internal job was switched before its test.
// SELF-PROVING on the real helper with a fake fetch (never the network, never a key). Exit 0 = holds · 1 = broken · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = path.join(SITE, "netlify/functions");
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const fail = (m) => F.push(m);
const read = (n) => { try { return fs.readFileSync(path.join(FN, n), "utf8"); } catch { idk(`cannot read ${n}`); } };
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const require_ = createRequire(path.join(FN, "x.js"));

process.env.SUPABASE_URL = "https://fake.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
delete process.env.CLAUDE_MODEL; delete process.env.BRAIN_MODEL;
let AM;
try { AM = require_("./_ai-models.js"); } catch (e) { idk(`_ai-models.js did not load (${String(e.message).slice(0, 80)})`); }
if (!AM.TIERS || !AM.callClaude || !AM.bodyFor) idk("_ai-models.js lost TIERS / callClaude / bodyFor");

// ── 1 · the models themselves ──────────────────────────────────────────────────────────────────────────────────────────────
const OPUS = /opus/i, HAIKU = /haiku/i;
const all = Object.entries(AM.TIERS);
for (const [tier, ladder] of all) for (const m of ladder) if (OPUS.test(m)) fail(`tier "${tier}" is pinned to an Opus-class model (${m}): the approved setup has none`);
if (AM.TIERS.client[0] !== "claude-sonnet-5-5") fail(`the client tier starts on ${AM.TIERS.client[0]}, the approved model is claude-sonnet-5-5`);
if (AM.TIERS.client.some((m) => HAIKU.test(m))) fail("a client-facing tier uses Haiku: client words stay on Sonnet");
if (AM.TIERS.simple[0] !== "claude-haiku-5-5") fail(`the simple tier starts on ${AM.TIERS.simple[0]}, the approved model is claude-haiku-5-5`);
if (AM.TIERS.simple.length < 2) fail("the simple tier has no model behind Haiku: an empty Haiku answer would ship nothing");
if (AM.TIERS.client.length < 2) fail("the client tier has no model behind Sonnet 5.5: an empty answer would ship nothing");
if (AM.TIERS.internal.some((m) => /5-5|haiku/i.test(m))) fail(`the internal tier moved to ${AM.TIERS.internal.join(", ")} before Chris saw the side-by-side test`);
if (JSON.stringify(AM.TITLE_META) !== JSON.stringify(AM.TIERS.client)) fail("the title/meta ladder is not the client tier (Sonnet 5.5 first)");
if (AM.BRAIN_MODEL() !== AM.TIERS.internal[0]) fail("the Brain's model is not the internal tier's single value");
if (AM.CHEAPEST !== AM.TIERS.simple[0]) fail("the daily ping does not ask the cheapest model in use");

// ── 2 · what each model is sent: nothing it 400s on ────────────────────────────────────────────────────────────────────────
const msgs = [{ role: "user", content: "hi" }];
for (const m of new Set(all.flatMap(([, l]) => l))) {
  for (const t of [undefined, 0, 0.4, 0.6]) {
    const b = AM.bodyFor(m, { maxTokens: 300, temperature: t, system: "s", messages: msgs });
    if (/^claude-(sonnet|haiku|opus)-5/.test(m) && b.temperature != null) fail(`${m} is sent temperature ${b.temperature}: a non-default temperature is a 400 on the 5.x models`);
    if (/^claude-sonnet-5-5/.test(m) && !(b.thinking && b.thinking.type === "between_tools" && Object.keys(b.thinking).length === 1)) fail(`${m} must send thinking {type:"between_tools"} alone ({type:"disabled"} is a 400); sent ${JSON.stringify(b.thinking)}`);
    if (/^claude-haiku-5-5/.test(m) && !(b.thinking && b.thinking.type === "disabled")) fail(`${m} must send thinking {type:"disabled"} (adaptive thinking would eat a small max_tokens); sent ${JSON.stringify(b.thinking)}`);
    if (b.messages[b.messages.length - 1].role === "assistant") fail(`${m} is sent an assistant prefill: a 400 on the 5.x models`);
    if (!/^claude-(sonnet|haiku|opus)-5/.test(m) && t != null && b.temperature !== t) fail(`${m} lost its temperature: older models keep theirs`);
  }
}

// ── 3 · an EMPTY answer is a failure that moves on (the 09-06 failure), on the real helper with a fake fetch ────────────────
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), clone() { return resp(status, body); } });
const ok = (text, model = "m", stop = "end_turn") => resp(200, { model, content: text == null ? [{ type: "thinking", thinking: "..." }] : [{ type: "text", text }], stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } });
async function run(script, over = {}) {
  const sent = [], ledger = [];
  const fetchFn = async (url, init) => {
    if (/ai_call_ledger/.test(url)) { ledger.push(JSON.parse(init.body)); return resp(201, {}); }
    const body = JSON.parse(init.body); sent.push(body);
    const next = script.shift(); return typeof next === "function" ? next(body) : next;
  };
  let out, err = null;
  try { out = await AM.callClaude({ ladder: ["claude-sonnet-5-5", "claude-sonnet-4-6"], system: "s", messages: msgs, maxTokens: 200, temperature: 0.5, ledger: { fn: "gate", step: "t" }, deps: { fetchFn, key: "fake" }, ...over }); } catch (e) { err = e; }
  return { out, err, sent, ledger };
}
{ // a: the new model answers with thinking only → the next model answers; the empty one is a failed ledger row
  const r = await run([ok(null, "claude-sonnet-5-5", "end_turn"), ok("the words", "claude-sonnet-4-6")]);
  if (r.err || !r.out || r.out.text !== "the words" || !r.out.fellBack) fail("an empty answer from the first model did not move to the next model");
  if (r.sent.length !== 2 || r.sent[1].model !== "claude-sonnet-4-6") fail("the empty-answer fallback did not ask the next model in the ladder");
  if (r.sent[1] && r.sent[1].temperature !== 0.5) fail("the fallback to Sonnet 4.6 lost its temperature");
  if (!r.ledger.some((l) => l.ok === false && /empty/i.test(l.error || ""))) fail("an empty answer is not written to the ledger as a failure");
}
{ // b: a max_tokens stop with no text is the same failure
  const r = await run([ok(null, "claude-sonnet-5-5", "max_tokens"), ok("fine", "claude-sonnet-4-6")]);
  if (!r.out || r.out.text !== "fine") fail("a max_tokens stop with no text did not move to the next model");
}
{ // c: every model empty → reported empty, never a made-up answer
  const r = await run([ok(null), ok(null)]);
  if (!(r.out && r.out.empty === true && r.out.text === "")) fail("all models empty must report empty:true, not words");
}
{ // d: the temperature-refusal retry still works (older model)
  const r = await run([resp(400, { error: { type: "invalid_request_error", message: "temperature is deprecated for this model" } }), ok("w")], { ladder: ["claude-sonnet-4-6"] });
  if (!r.out || r.out.text !== "w" || r.sent.length !== 2 || r.sent[1].temperature != null) fail("the temperature-refusal retry (ask again without it) is gone");
}
{ // e: a refused thinking shape is asked again without it, with room for the words
  const r = await run([resp(400, { error: { type: "invalid_request_error", message: "thinking.type 'between_tools' is not supported" } }), ok("w")], { ladder: ["claude-sonnet-5-5"] });
  if (!r.out || r.out.text !== "w" || r.sent.length !== 2 || r.sent[1].thinking != null || !(r.sent[1].max_tokens > 200)) fail("a refused thinking setting is not retried without it and with more room");
}
{ // f: a model that doesn't exist moves on
  const r = await run([resp(404, { error: { type: "not_found_error", message: "model" } }), ok("w", "claude-sonnet-4-6")]);
  if (!r.out || r.out.text !== "w") fail("a missing model did not move to the next one");
}
{ // g: a real failure on the LAST model throws (never a quiet empty)
  const r = await run([resp(500, { error: { type: "api_error", message: "x" } })], { ladder: ["claude-sonnet-4-6"] });
  if (!r.err) fail("a 500 from the last model did not throw");
}

// ── 4 · each switched job, through its own code, asks the right model with valid params ───────────────────────────────────
const realFetch = globalThis.fetch;
function stubGlobal(script) {
  const sent = [];
  globalThis.fetch = async (url, init) => { if (/api\.anthropic\.com/.test(String(url))) { sent.push(JSON.parse(init.body)); const n = script.shift(); return n || ok("x"); } return resp(404, {}); };
  return sent;
}
process.env.ANTHROPIC_API_KEY = "fake-key-for-the-gate";
try {
  { // mature deps (client-facing)
    const sent = stubGlobal([ok(null), ok("quarterly words", "claude-sonnet-4-6")]);
    const MD = require_("./_mature-deps.js");
    const out = await MD.aiText("sys", "user").catch((e) => `ERR ${e.message}`);
    if (String(out).startsWith("ERR") || !/quarterly words/.test(out)) fail(`the quarterly review (mature deps) did not fall back on an empty answer: ${out}`);
    if (sent[0]?.model !== "claude-sonnet-5-5" || sent[0]?.temperature != null || sent[0]?.thinking?.type !== "between_tools") fail("the quarterly review's first request is not Sonnet 5.5 / thinking between_tools / no temperature");
  }
  { // photo look (simple, vision)
    const sent = stubGlobal([ok(null), ok('{"name":"Logo","what":"a logo","slot":1}', "claude-sonnet-4-6")]);
    const PL = require_("./_photo-look.js");
    const out = await PL.look("https://example.com/a.jpg", [{ n: 1, group: "g", do: "logo" }]);
    if (!out || out.error || out.name !== "Logo") fail(`the photo look did not fall back on an empty Haiku answer: ${JSON.stringify(out)}`);
    if (sent[0]?.model !== "claude-haiku-5-5" || sent[0]?.temperature != null || sent[0]?.thinking?.type !== "disabled") fail("the photo look's first request is not Haiku 5.5 / thinking disabled / no temperature");
    if (sent[1]?.model !== "claude-sonnet-4-6" || sent[1]?.temperature !== 0) fail("the photo look's fallback is not Sonnet 4.6 at temperature 0");
  }
  { // aiDraft: client, simple, internal tiers, and a pinned ladder
    const FE = require_("./flow-execute.js");
    if (typeof FE.aiDraft !== "function") idk("flow-execute no longer exports aiDraft");
    for (const [tier, first, th] of [["client", "claude-sonnet-5-5", "between_tools"], ["simple", "claude-haiku-5-5", "disabled"]]) {
      const sent = stubGlobal([ok(null), ok(`${tier} words`, "claude-sonnet-4-6")]);
      const out = await FE.aiDraft("sys", "user", { maxTokens: 300, tier }).catch((e) => `ERR ${e.message}`);
      if (!/words/.test(String(out))) fail(`aiDraft(${tier}) did not fall back on an empty answer: ${out}`);
      if (sent[0]?.model !== first || sent[0]?.temperature != null || sent[0]?.thinking?.type !== th) fail(`aiDraft(${tier}) first request is not ${first} / thinking ${th} / no temperature`);
    }
    { const sent = stubGlobal([ok("internal words")]); await FE.aiDraft("sys", "user", { maxTokens: 300, tier: "internal" });
      if (sent[0]?.model !== "claude-sonnet-4-6" || sent[0]?.temperature !== 0.6 || sent[0]?.thinking) fail("an internal job is no longer the unchanged Sonnet 4.6 request"); }
    { const sent = stubGlobal([ok("t", "claude-sonnet-5-5")]); const info = {}; await FE.aiDraft("sys", "user", { maxTokens: 300, models: require_("./_title-meta.js").MODELS, info });
      if (sent[0]?.model !== "claude-sonnet-5-5" || info.model !== "claude-sonnet-5-5") fail("titles/meta do not ask Sonnet 5.5 first"); }
  }
} catch (e) { fail(`a call-site fixture threw: ${String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")}`); }
finally { globalThis.fetch = realFetch; }

// ── 5 · the source: no job slips around the helper, no Opus anywhere, Haiku only where approved ────────────────────────────
const files = fs.readdirSync(FN).filter((n) => n.endsWith(".js"));
for (const n of files) {
  const src = code(read(n));
  if (n !== "_ai-ledger.js" && /claude-opus/i.test(src)) fail(`${n} names an Opus-class model: the approved setup has none`);
  if (!["_ai-models.js", "_ai-ledger.js"].includes(n) && /["'`]claude-haiku/i.test(src)) fail(`${n} hardcodes a Haiku model: Haiku is chosen only in _ai-models.js (tier simple)`);
  if (!["_ai-models.js", "v2-brain-analysis-background.js", "ai-model-check.js"].includes(n) && /api\.anthropic\.com/.test(src)) fail(`${n} calls api.anthropic.com itself: every other job goes through _ai-models.callClaude (empty-answer fallback, valid params)`);
  if (/api\.openai\.com/.test(src) && !["_ai-sample.js", "flow-execute.js"].includes(n)) fail(`${n} calls OpenAI: OpenAI stays only for _ai-sample.js (flow-execute keeps its no-Anthropic-key fallback)`);
  if (n !== "_ai-models.js" && /temperature/.test(src) && /api\.anthropic\.com/.test(src)) fail(`${n} sends temperature straight to the API`);
}
const fe = code(read("flow-execute.js"));
// who is on which tier: the runner key above each tier tag
const runnerOf = (idx) => { const m = [...fe.slice(0, idx).matchAll(/^\s*"(m[12]\.[a-z_.0-9]+)": async/gm)]; return m.length ? m[m.length - 1][1] : "?"; };
const tagged = (t) => [...fe.matchAll(new RegExp(`tier: "${t}"`, "g"))].map((m) => runnerOf(m.index));
const SIMPLE_OK = new Set(["m2.exec.gbp_attributes_refresh"]);
const INTERNAL_OK = new Set(["m1.strategy.keywords_locations", "m1.gbp.optimize_categories", "m1.kickoff.call", "m1.call.close", "m2.exec.mystery_shop", "m2.call.monthly"]);
for (const r of tagged("simple")) if (!SIMPLE_OK.has(r)) fail(`${r} is on the simple (Haiku) tier but is not on the approved simple list: client-facing words never use Haiku`);
for (const r of tagged("internal")) if (!INTERNAL_OK.has(r)) fail(`${r} is on the internal tier but is not an approved internal job`);
for (const r of SIMPLE_OK) if (!tagged("simple").includes(r)) fail(`${r} is no longer on the simple (Haiku) tier: the approved saving is gone`);
for (const r of INTERNAL_OK) if (!tagged("internal").includes(r)) fail(`${r} lost its internal tier tag (its model must be a single config value)`);
for (const re of [/\btier: "(?!simple"|internal"|client")/]) if (re.test(fe)) fail("flow-execute names a tier that does not exist");
if (!/photo|describePhoto/.test(fe) || !/ladderOf\("simple"\)/.test(fe.slice(fe.indexOf("async function describePhoto(")))) fail("the website photo describer is no longer on the simple tier");
if (!/ladderOf\("simple"\)/.test(code(read("_photo-look.js")))) fail("_photo-look is no longer on the simple tier");
if (!/AM\.CHEAPEST/.test(code(read("ai-model-check.js")))) fail("ai-model-check no longer pings the one cheapest model");
if ((code(read("ai-model-check.js")).match(/api\.anthropic\.com/g) || []).length !== 1 || !/for \(const model of \[AM\.CHEAPEST\]\)/.test(code(read("ai-model-check.js")))) fail("ai-model-check pings more than the one cheapest model");
if (!/budgetOf/.test(code(read("_ai-ledger.js"))) || AM && require_("./_ai-ledger.js").budgetOf({}) !== 10) fail("the monthly AI budget no longer defaults to $10 when AI_MONTHLY_BUDGET_USD is unset");
{ const L = require_("./_ai-ledger.js"); const c = (m) => L.costUsd(m, { input_tokens: 1e6, output_tokens: 1e6 });
  if (c("claude-sonnet-5-5") !== 12) fail("the ledger prices claude-sonnet-5-5 wrong (should be $2 in + $10 out per million)");
  if (c("claude-haiku-5-5") !== 0.6) fail("the ledger prices claude-haiku-5-5 wrong (should be $0.10 in + $0.50 out per million)"); }
{ const brain = code(read("v2-brain-analysis-background.js")); if (/claude-(sonnet|haiku|opus)-\d/.test(brain)) fail("the Brain hardcodes a model: it must read the single config value"); }

if (F.length) { console.error(`🔴 the approved AI cost setup is broken:\n${F.map((m) => `   · ${m}`).join("\n")}`); process.exit(1); }
console.log("✅ AI cost setup D holds: client words on Sonnet 5.5, simple jobs on Haiku 5.5, internal jobs unchanged, no Opus, no 400-ing params, an empty answer falls back, budget $10, prices right.");
