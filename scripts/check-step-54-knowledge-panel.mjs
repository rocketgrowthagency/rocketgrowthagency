#!/usr/bin/env node
// check-step-54-knowledge-panel.mjs — step 54 MEASURES before it drafts (approved step mockup m1-54, "approved build all"
// 2026-10-19): a brand search finds a knowledge panel → its facts + the checklist, Done; NO panel → "No panel yet", stays
// open (normal for a business few people search for by name — never a failure, never Done); a failed search → indeterminate.
// 🔴 WHY: it drafted a "claim your panel" checklist for every client, including the many with nothing to claim.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow; try { flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }
const at = flow.indexOf('"m1.gbp.knowledge_panel": async');
if (at < 0) { console.error("⚠️  INDETERMINATE — step 54's runner moved"); process.exit(2); }
const fnStart = flow.indexOf("async", at);
let d = 0, end = -1;
for (let i = flow.indexOf("{", flow.indexOf("=>", fnStart)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
const F = [];
const mk = (reply) => {
  const ctx = vm.createContext({ URL, JSON, String, Array, Date, process: { env: { SERPAPI_KEY: "x" } },
    clientLocality: () => ({ locality: "Denver", region: "CO" }), clientCtx: () => "ctx", aiDraft: async () => "CHECKLIST",
    fetch: async (u) => { ctx.lastQ = new URL(String(u)).searchParams.get("q"); return reply; } });
  return { run: vm.runInContext(`(${flow.slice(fnStart, end)})`, ctx), ctx };
};
const ok = (j) => ({ ok: true, status: 200, json: async () => j });
const client = { business_name: "Smith & Sons Plumbing" };
{ const { run, ctx } = mk(ok({ knowledge_graph: { title: "Smith and Sons Plumbing", type: "Plumber", website: "https://ss.com", profiles: [{}, {}] } }));
  const r = await run({ client });
  if (r.outcome !== "verified" || r.completed === false || !/Knowledge panel found: Smith and Sons Plumbing/.test(r.summary)) F(`a panel that exists isn't reported as found (${r.outcome}) — "&" vs "and" must still match`);
  if (!/"Smith & Sons Plumbing" Denver CO/.test(ctx.lastQ || "")) F(`the brand search isn't "<name>" + city + state (${ctx.lastQ})`); }
{ const { run } = mk(ok({ organic_results: [] }));
  const r = await run({ client });
  if (r.completed !== false || r.outcome !== "not_applicable_yet" || !/No knowledge panel yet/.test(r.summary) || /CHECKLIST/.test(r.summary)) F("no panel isn't 'No panel yet', open, without a claim checklist"); }
{ const { run } = mk(ok({ knowledge_graph: { title: "Smithsonian Institution" } }));
  const r = await run({ client });
  if (r.outcome !== "not_applicable_yet") F("someone else's knowledge panel is read as this business's"); }
{ const { run } = mk({ ok: false, status: 500, json: async () => ({ error: "quota" }) });
  const r = await run({ client });
  if (r.outcome !== "indeterminate") F("a failed search isn't indeterminate (it would read as 'no panel' or Done)"); }
if (F.length) { console.error("🔴 step 54 doesn't measure before it drafts:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 54 measures first: panel → facts + checklist (Done) · none → 'No panel yet' (open) · someone else's panel ≠ ours · failed search → indeterminate");
