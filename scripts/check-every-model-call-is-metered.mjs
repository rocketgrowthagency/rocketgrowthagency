#!/usr/bin/env node
// check-every-model-call-is-metered.mjs — EVERY MODEL CALL IS A LEDGER ROW, AND THE KEY AND THE MONTH ARE CHECKED DAILY
// (content and AI master #12, approved 11-11, finding A1).
//
// 🔴 WHY: nothing metered Anthropic or OpenAI spend: no ledger, no budget, no out-of-credit alert, and ai-model-check ran only by
// hand. An exhausted key would turn every draft into an error across every client with nobody told, and the month's spend was a guess.
// 🔑 WHAT HOLDS: every website file that calls api.anthropic.com or api.openai.com records each answer and each refusal through
// _ai-ledger.js recordAiCall (at least one record per model address, the answer's usage passed on success); the ledger table's SQL
// file exists with row level security in the same file and no grant to anon or authenticated; ai-model-check is on a daily Netlify
// schedule, in the job manifest (so System health and the job watcher see it), guarded for the schedule, records its own calls,
// and reads the month to date against AI_MONTHLY_BUDGET_USD.
// SELF-PROVING on the real _ai-ledger.js: the cost of a known call, an unknown model priced high (never cheaper), a key in an error
// redacted, a refused write (table missing) and a thrown write never throwing, no write with no database, and the budget verdicts
// (not set up, under, at/over, no budget) each said.
// LIVE, read-only (skipped in the mutation copy): whether the ledger table exists yet (⚠️ until Chris runs the SQL, not red).
// 🔴 ONE LEDGER (11-11): _ai-ledger.js is the only one. A second ledger file (_anthropic-ledger.js) or table (anthropic_usage), any `.meter(`
// wrapper, or a call site that both meters and records (two rows for one call) fails. The out-of-credit alert (once in 12 h) and the
// deployed-functions-only rule live in recordAiCall and are proven below.
// Exit 0 = metered · 1 = a model call or the daily check escapes the meter · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const COPY = !!process.env.SCRAPER_COPY_DIR;
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { idk(`cannot read ${r}`); } };
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|#|--)/.test(l)).join("\n");
const FN = "netlify/functions";

// ── every model call records itself ──────────────────────────────────────────────────────────────────────────────────────
const fns = fs.readdirSync(path.join(SITE, FN)).filter((n) => n.endsWith(".js"));
const callers = [];
for (const n of fns) {
  const src = code(read(`${FN}/${n}`));
  const calls = (src.match(/api\.anthropic\.com|api\.openai\.com/g) || []).length;
  if (!calls) continue;
  callers.push(n);
  if (/_anthropic-ledger|anthropic_usage|\.meter\(/.test(src)) fail(`${n} uses a second ledger (the Anthropic meter): one ledger only, so a call is recorded once`);
  const records = (src.match(/recordAiCall\(/g) || []).length;
  if (records < calls) fail(`${n} calls a model ${calls} time(s) but records ${records} ledger row(s)`);
  if (records && !/usage: [a-zA-Z_.?]*usage\b|usage: r\.ok \? [a-zA-Z_.]*\.usage/.test(src)) fail(`${n} records its calls without the answer's token usage`);
  if (records && !/ok: false/.test(src) && !/ok: r\.ok/.test(src)) fail(`${n} records only answers, never a refused call (an exhausted key would leave no trace)`);
}
// flow-execute holds 25 draft call sites behind ONE boundary: aiDraft records Anthropic's refusal and answer AND OpenAI's, and the
// photo describer records both of its outcomes
{
  const fe = code(read(`${FN}/flow-execute.js`));
  const body = (start, end) => { const a = fe.indexOf(start), b = fe.indexOf(end, a + 1); return a >= 0 && b > a ? fe.slice(a, b) : null; };
  const ai = body("async function aiDraft(", "\nfunction markIfTruncated(");
  const ph = body("async function describePhoto(", "\nfunction cleanAlt(");
  if (!ai || !ph) idk("flow-execute has no aiDraft(...) / describePhoto(...) to read");
  // 🔒 setup D (11-12): aiDraft and the photo describer ask through _ai-models.callClaude, which writes the refusal, the answer and an empty answer
  const am = code(read(`${FN}/_ai-models.js`));
  if (!/AM\.callClaude\(/.test(ai)) fail("aiDraft doesn't ask Anthropic through _ai-models.callClaude (the one place that records the call)");
  if (!/AM\.callClaude\(/.test(ph) || !/ledger: \{/.test(ph)) fail("the photo describer doesn't ask through callClaude with a ledger step");
  for (const [what, re] of [["Anthropic's refusal", /await rec\(\{ model, ok: false, status: r\.status, error: AL\.errorType/], ["Anthropic's answer", /await rec\(\{ model: data\.model \|\| model, usage: data\.usage, ok: true/], ["Anthropic's empty answer", /ok: false, status: r\.status, error: `empty answer/]]) if (!re.test(am)) fail(`_ai-models.callClaude doesn't record ${what}`);
  for (const [what, re] of [["OpenAI's refusal", /provider: "openai", model: process\.env\.GBP_AI_MODEL \|\| "gpt-4o-mini", ok: false/], ["OpenAI's answer", /provider: "openai", model: data\.model[^,]*, usage: data\.usage, ok: true/]]) if (!re.test(ai)) fail(`aiDraft doesn't record ${what}`);
}
for (const n of fns) if (/ledger/i.test(n) && n !== "_ai-ledger.js" && /anthropic|openai|ai|model/i.test(n)) fail(`${n} is a second AI ledger file (only _ai-ledger.js)`);
if (fs.readdirSync(path.join(SITE, "docs/supabase")).some((n) => /^ANTHROPIC_USAGE/i.test(n))) fail("docs/supabase/ANTHROPIC_USAGE_*.sql is back: a second table for the same calls");
if (callers.length < 4) idk(`only ${callers.length} website files call a model (flow-execute, the Brain, the blog chain, the photo look, the mature deps and ai-model-check are expected)`);

// ── the table: its own SQL file, row level security in it ────────────────────────────────────────────────────────────────
const sqlName = (fs.readdirSync(path.join(SITE, "docs/supabase")).filter((n) => /^AI_CALL_LEDGER_.*\.sql$/.test(n)).sort().pop());
if (!sqlName) fail("no docs/supabase/AI_CALL_LEDGER_*.sql: the ledger table has nowhere to come from");
else {
  const sql = code(read(`docs/supabase/${sqlName}`));
  if (!/create table if not exists public\.ai_call_ledger/i.test(sql)) fail(`${sqlName} doesn't create public.ai_call_ledger`);
  if (!/alter table public\.ai_call_ledger enable row level security/i.test(sql)) fail(`${sqlName} has no row level security for ai_call_ledger (every table has it, in the same file)`);
  if (/grant[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i.test(sql)) fail(`${sqlName} grants the ledger to anon or authenticated`);
  for (const col of ["fn", "step", "client_id", "model", "input_tokens", "output_tokens", "cost_usd", "ok", "error"]) if (!new RegExp(`\\n\\s*${col}\\s`).test(sql)) fail(`${sqlName} has no ${col} column (_ai-ledger.js writes it)`);
}

// ── the daily check ──────────────────────────────────────────────────────────────────────────────────────────────────────
const toml = code(read("netlify.toml"));
if (!/\[functions\."ai-model-check"\]\s*\n\s*schedule = "[^"]+"/.test(toml)) fail("ai-model-check isn't on a Netlify schedule (an exhausted key is found by a client's failed draft)");
const man = read(`${FN}/_job-manifest.js`);
if (!/job: "ai-model-check"/.test(man)) fail("ai-model-check isn't in the job manifest (System health and the job watcher never see it)");
const mc = code(read(`${FN}/ai-model-check.js`));
if (!/requireCronOrInternal\(event\)/.test(mc)) fail("ai-model-check isn't guarded for its schedule (requireCronOrInternal)");
if (!/withCheckin\("ai-model-check"/.test(mc)) fail("ai-model-check doesn't check in (a run that never happens reads as fine)");
if (!/AL\.monthToDate\(\)/.test(mc) || !/AL\.judgeBudget\(month, AL\.budgetOf\(process\.env\)\)/.test(mc)) fail("ai-model-check doesn't read the month to date against AI_MONTHLY_BUDGET_USD");
if (!/error = !first \?/.test(mc)) fail("ai-model-check doesn't make 'no model answered' its error");

// ── self-proving: the real ledger helper ─────────────────────────────────────────────────────────────────────────────────
const require = createRequire(path.join(SITE, FN, "_ai-ledger.js"));
let AL; try { AL = require("./_ai-ledger.js"); } catch (e) { idk(`_ai-ledger.js won't load: ${String(e.message).slice(0, 120)}`); }
const near = (a, b) => Math.abs(Number(a) - b) < 1e-6;
if (!near(AL.costUsd("claude-sonnet-4-6", { input_tokens: 1e6, output_tokens: 1e6 }), 18)) fail("a million tokens in and out on claude-sonnet-4-6 doesn't cost $3 + $15");
if (!near(AL.costUsd("claude-sonnet-4-6-20260101", { input_tokens: 1e6, output_tokens: 0 }), 3)) fail("a dated model id isn't priced as its family");
if (!(AL.costUsd("claude-brand-new-9", { input_tokens: 1e6, output_tokens: 1e6 }) >= AL.costUsd("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 1e6 }))) fail("an unknown model is priced below Opus (the month would look cheaper than it is)");
if (!near(AL.costUsd("gpt-4o-mini", { prompt_tokens: 1e6, completion_tokens: 1e6 }), 0.75)) fail("an OpenAI answer's usage isn't read");
const row = AL.rowFor({ fn: "x", step: "m1.gbp.business_description", clientId: "123e4567-e89b-12d3-a456-426614174000", model: "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 4 }, ok: false, status: 401, error: "authentication_error sk-ant-api03-AbCdEf123456789xyz" });
if (row.input_tokens !== 14 || row.output_tokens !== 5) fail("the row's token counts are wrong (cache reads are input)");
if (/sk-ant/.test(row.error || "")) fail("a key in an error is written to the ledger");
if (row.client_id !== "123e4567-e89b-12d3-a456-426614174000" || AL.rowFor({ fn: "x", clientId: "not-a-uuid" }).client_id !== null) fail("the client id isn't kept, or a non-id is written");
const res = (status) => ({ ok: status < 300, status, json: async () => [], text: async () => "" });
const seen = [];
let r = await AL.recordAiCall({ fn: "x", model: "m" }, { url: "https://sb.test", key: "k", fetch: async (u, o) => { seen.push({ u, o }); return res(201); } });
if (!r.written || !/\/rest\/v1\/ai_call_ledger$/.test(seen[0] && seen[0].u) || JSON.parse(seen[0].o.body).fn !== "x") fail("a ledger row isn't written to ai_call_ledger");
const warn = console.warn; console.warn = () => {};
try {
  r = await AL.recordAiCall({ fn: "x" }, { url: "https://sb.test", key: "k", fetch: async () => res(404) });
  if (r.written) fail("a refused ledger write (the table missing) reads as written");
  r = await AL.recordAiCall({ fn: "x" }, { url: "https://sb.test", key: "k", fetch: async () => { throw new Error("network down"); } });
  if (r.written) fail("a failed ledger write reads as written");
} catch { fail("a failed ledger write throws (a draft would fail because the meter did)"); }
console.warn = warn;
let called = 0;
const saveU = process.env.SUPABASE_URL; delete process.env.SUPABASE_URL;
r = await AL.recordAiCall({ fn: "x" }, { key: "k", fetch: async () => { called++; return res(201); } });
if (saveU !== undefined) process.env.SUPABASE_URL = saveU;
if (called || r.written) fail("with no database set, the ledger still tries to write");
{
  const seenRows = [], told = []; let already = false;
  const lf = async (u, o = {}) => { u = String(u); if (u.includes("error=like.")) return { ok: true, status: 200, json: async () => (already ? [{ id: 1 }] : []), text: async () => "" }; if (o.method === "POST") seenRows.push(JSON.parse(o.body)); return res(201); };
  const refuse = { fn: "x", provider: "anthropic", model: "m", ok: false, status: 402, error: AL.errorType(402, JSON.stringify({ error: { type: "billing_error", message: "Your credit balance is too low" } })) };
  await AL.recordAiCall(refuse, { url: "https://sb.test", key: "k", fetch: lf, notify: async (m) => told.push(m) });
  if (told.length !== 1 || !/credit_balance_too_low/.test(seenRows[0] && seenRows[0].error || "")) fail("an out-of-credit refusal isn't recorded and told");
  already = true;
  await AL.recordAiCall(refuse, { url: "https://sb.test", key: "k", fetch: lf, notify: async (m) => told.push(m) });
  if (told.length !== 1) fail("an out-of-credit refusal is told again inside 12 hours");
  await AL.recordAiCall({ fn: "x", provider: "openai", ok: false, status: 402, error: "x (402)" }, { url: "https://sb.test", key: "k", fetch: lf, notify: async (m) => told.push(m) });
  if (told.length !== 1) fail("an OpenAI refusal raises the Anthropic out-of-credit alert");
  const hit = []; const gf = globalThis.fetch; globalThis.fetch = async () => { hit.push(1); return res(201); };
  const keepEnv = { L: process.env.AWS_LAMBDA_FUNCTION_NAME, R: process.env.LAMBDA_TASK_ROOT, A: process.env.AI_LEDGER, B: process.env.ANTHROPIC_LEDGER };
  delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.LAMBDA_TASK_ROOT; delete process.env.AI_LEDGER; delete process.env.ANTHROPIC_LEDGER;
  await AL.recordAiCall({ fn: "x" }, { url: "https://sb.test", key: "k" });
  process.env.AWS_LAMBDA_FUNCTION_NAME = "f"; const onNetlify = AL.inRuntime(); process.env.AI_LEDGER = "0"; const forcedOff = AL.inRuntime();
  for (const [k, v] of [["AWS_LAMBDA_FUNCTION_NAME", keepEnv.L], ["LAMBDA_TASK_ROOT", keepEnv.R], ["AI_LEDGER", keepEnv.A], ["ANTHROPIC_LEDGER", keepEnv.B]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  globalThis.fetch = gf;
  if (hit.length) fail("the ledger writes to the real database from a laptop (only a deployed function writes)");
  if (!onNetlify || forcedOff) fail("on Netlify the ledger is off, or AI_LEDGER=0 doesn't switch it off");
}
const nb = AL.judgeBudget({ ready: false }, "50");
if (!/Not set up/.test(nb.error || "")) fail("a missing ledger table doesn't say 'Not set up'");
const under = AL.judgeBudget({ ready: true, cost_usd: 12.5, calls: 40 }, "50");
if (under.over || under.error || !/\$12\.50 of \$50\.00/.test(under.note || "")) fail("a month under budget isn't said as the month to date against the budget");
const over = AL.judgeBudget({ ready: true, cost_usd: 50, calls: 400 }, "50");
if (!over.over || !/over the \$50\.00 budget/.test(over.error || "")) fail("a month at the budget isn't an error");
const none = AL.judgeBudget({ ready: true, cost_usd: 3, calls: 9 }, undefined);
if (none.over || none.error || !/no budget set/.test(none.note || "")) fail("no budget set isn't said");
const pages = []; const mtd = await AL.monthToDate({ url: "https://sb.test", key: "k", fetch: async (u) => { pages.push(u); return { ok: true, status: 200, json: async () => [{ cost_usd: 1.25, ok: true }, { cost_usd: 2, ok: false }] }; } }, new Date("2026-11-20T10:00:00Z"));
if (!mtd.ready || mtd.calls !== 2 || mtd.failed !== 1 || mtd.cost_usd !== 3.25 || !/at=gte\.2026-11-01T00%3A00%3A00/.test(pages[0] || "")) fail("the month to date isn't this calendar month's sum");
const gone = await AL.monthToDate({ url: "https://sb.test", key: "k", fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
if (gone.ready !== false) fail("a missing ledger table reads as a month of nothing");

// ── the key's own expiry (11-12): the Anthropic key "rga-netlify" expires 2027-11-19; said from 30 days before ──────────────
// A key that expires with nothing watching it turns every draft, the Brain and the photo describer into errors on one morning.
// The date is a constant in _ai-ledger.js (never the key); ai-model-check makes the warning its error and sends the date to System health.
if (typeof AL.keyExpiry !== "function" || AL.KEY_EXPIRES_ON !== "2027-11-19" || AL.KEY_WARN_DAYS !== 30) fail("_ai-ledger.js doesn't hold the key's expiry (KEY_EXPIRES_ON 2027-11-19, KEY_WARN_DAYS 30)");
else {
  const at = (d) => AL.keyExpiry(Date.parse(`${d}T12:00:00Z`));
  if (at("2026-11-12").warn || at("2026-11-12").error) fail("a key with a year to run is warned about");
  if (at("2027-10-18").warn) fail("the key warning starts before 30 days out");
  const w = at("2027-10-20");
  if (!w.warn || !/expires in 29 days \(2027-11-19\)/.test(w.error || "") || !/ANTHROPIC_API_KEY/.test(w.error || "")) fail("30 days before the expiry the key isn't an error that names the date and the Netlify key to replace");
  if (!at("2027-11-19").error || !/expired/.test(at("2027-11-20").error || "")) fail("an expired key isn't an error");
  if (AL.keyExpiry(NaN).warn || AL.keyExpiry(Date.now(), "not a date").error) fail("an unreadable date raises a false key alarm");
  if (/sk-ant/.test(fs.readFileSync(path.join(SITE, FN, "_ai-ledger.js"), "utf8"))) fail("a key value is written in _ai-ledger.js");
}
if (!/AL\.keyExpiry\(\)/.test(mc) || !/: budget && budget\.error \? budget\.error : keyExp\.error;/.test(mc)) fail("ai-model-check doesn't make the key's expiry warning its error");
if (!/key_expires_on: keyExp\.expires_on/.test(mc) || !/key_note: keyExp\.note/.test(mc)) fail("ai-model-check doesn't send the key's expiry date and note to System health");
if (!/\$\{b\.key_note \? ` · \$\{b\.key_note\}` : ""\}/.test(man)) fail("System health's AI row doesn't show the key note");

if (F.length) { console.error(`🔴 a model call escapes the meter:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
const head = `✅ every model call is metered: ${callers.length} files (${callers.join(", ")}) record each answer and refusal; ai-model-check runs daily with the month against the budget`;
if (COPY) { console.log(`${head} (mutation copy: the live database is not read)`); process.exit(0); }

// ── live, read-only ──────────────────────────────────────────────────────────────────────────────────────────────────────
let envText = ""; try { envText = fs.readFileSync(path.join(path.dirname(HERE), ".env"), "utf8"); } catch { /* the environment may carry them */ }
const env = (k) => process.env[k] || ((new RegExp(`^${k}=(.*)$`, "m").exec(envText) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
const DB = env("SUPABASE_URL"), SVC = env("SUPABASE_SERVICE_ROLE_KEY");
let live = "";
if (DB && SVC) {
  try {
    const t = await fetch(`${DB}/rest/v1/ai_call_ledger?select=id&limit=1`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }, signal: AbortSignal.timeout(15000) });
    live = t.ok ? " · the ledger table is live" : ` · ⚠️  the ledger table isn't there yet (HTTP ${t.status}): Chris's step 1 in website docs/supabase/PENDING_FOR_CHRIS.md`;
  } catch { live = " · the ledger table couldn't be read"; }
}
console.log(`${head}${live}`);
