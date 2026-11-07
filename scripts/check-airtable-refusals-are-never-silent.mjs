#!/usr/bin/env node
/**
 * check-airtable-refusals-are-never-silent — an Airtable refusal is never read as "no records" or "done".
 *
 * 🔴 Nov 3-6 2026 Airtable refused every call: HTTP 429, body `{"errors":[{"error":"PUBLIC_API_BILLING_LIMIT_EXCEEDED"}]}`
 * (`errors`, PLURAL). Callers checked only `d.error`, or nothing, so admin Calls said "Nothing here yet" on every tab,
 * tracking wrote nothing, and nobody knew for four days. Fixed 11-7: every caller checks its answer through
 * netlify/functions/_airtable-ok.js. → project_airtable_outage_2026_11
 *
 * Two reads:
 *   1. Every website function that calls api.airtable.com requires ./_airtable-ok and uses it, unless excused BY NAME
 *      with a reason this gate re-checks.
 *   2. The helper itself, run on the exact shapes Airtable sends: an ok answer passes; the billing-limit 429 throws the
 *      plain sentence; a 200 that carries an error throws; a refusal logged by airtableLogRefusal names status + code
 *      and never throws.
 *
 * SITE can be pointed elsewhere (APPROVAL_ARCHIVE_SITE_DIR, the shared override) so the gate can be proven red on a broken copy.
 * Exit 0 = holds, 1 = a silent path exists, 2 = couldn't read.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const DIR = path.join(SITE, "netlify/functions");
const F = [];
const bad = (m) => F.push(m);

let files;
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js")); }
catch (e) { console.error(`[airtable-refusals] INDETERMINATE — ${DIR} unreadable: ${e.message}`); process.exit(2); }
if (!files.includes("_airtable-ok.js")) { console.error("🔴 netlify/functions/_airtable-ok.js is missing — every Airtable caller depends on it"); process.exit(1); }

// 🔑 Excused BY NAME, each with the reason this gate re-checks. A new exclusion has to be a decision.
const EXCUSED = {
  "_fga-airtable.js": { why: "checks r.ok on every call and returns its own { ok:false, status } shape", holds: (src) => (src.match(/await fetch\(/g) || []).length <= (src.match(/\.ok\b/g) || []).length },
  "deep-assess-client.js": { why: "declares the Airtable URL only; makes no Airtable call", holds: (src) => !/fetch\([^)]*\bAT\b/.test(src) },
};

let callers = 0;
for (const f of files) {
  if (f === "_airtable-ok.js") continue;
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  if (!/api\.airtable\.com/.test(src)) continue;
  callers++;
  if (EXCUSED[f]) { if (!EXCUSED[f].holds(src)) bad(`${f}: excused ("${EXCUSED[f].why}") but that is no longer true`); continue; }
  if (!/require\(["']\.\/_airtable-ok["']\)/.test(src)) { bad(`${f}: calls Airtable without ./_airtable-ok — a refusal can read as "no records" or as success`); continue; }
  if (!/\bairtable(Ok|LogRefusal)\(/.test(src)) bad(`${f}: requires ./_airtable-ok but never calls airtableOk or airtableLogRefusal`);
}
for (const f of Object.keys(EXCUSED)) if (!files.includes(f)) bad(`excused file ${f} no longer exists — drop the excuse`);
if (callers < 5) bad(`only ${callers} Airtable caller(s) found — the scan is reading the wrong thing`);

// ── 2. The helper on Airtable's real shapes ────────────────────────────────────────────────────────────────────────
const req = createRequire(path.join(DIR, "x.js"));
let H;
try { H = req("./_airtable-ok.js"); } catch (e) { bad(`_airtable-ok.js won't load: ${e.message}`); }
if (H) {
  const resp = (status) => ({ ok: status >= 200 && status < 300, status });
  const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message || "threw"; } };
  if (throws(() => H.airtableOk(resp(200), { records: [] }))) bad("an ok answer with records throws");
  const lim = throws(() => H.airtableOk(resp(429), { errors: [{ error: "PUBLIC_API_BILLING_LIMIT_EXCEEDED", message: "API billing plan limit exceeded" }] }));
  if (!lim) bad("the billing-limit 429 (errors[], plural) does NOT throw — that is the Nov 3-6 bug");
  else if (!/used up its requests for this month/.test(lim)) bad(`the billing-limit 429 throws, but not in plain words: "${lim}"`);
  if (!throws(() => H.airtableOk(resp(200), { error: { type: "INVALID_REQUEST", message: "x" } }))) bad("a 200 carrying `error` passes as ok");
  if (!throws(() => H.airtableOk(resp(422), { error: { type: "INVALID_VALUE_FOR_COLUMN", message: "x" } }))) bad("a 422 passes as ok");
  if (!throws(() => H.airtableOk(resp(500), {}))) bad("a 500 with an empty body passes as ok");
  if (typeof H.airtableLogRefusal === "function") {
    const seen = [], keep = console.error; console.error = (m) => seen.push(String(m));
    try {
      await H.airtableLogRefusal("x-fn", "recA", { ok: false, status: 429, json: async () => ({ errors: [{ error: "PUBLIC_API_BILLING_LIMIT_EXCEEDED" }] }) });
      await H.airtableLogRefusal("x-fn", "recA", { ok: true, status: 200, json: async () => ({}) });
      await H.airtableLogRefusal("x-fn", "recA", { ok: false, status: 503, json: async () => { throw new Error("not json"); } });
    } catch (e) { bad(`airtableLogRefusal threw: ${e.message}`); }
    console.error = keep;
    if (!seen.some((l) => /\[x-fn\].*429.*PUBLIC_API_BILLING_LIMIT_EXCEEDED/.test(l))) bad("a refusal isn't logged with its status and code");
    if (seen.length !== 2) bad(`airtableLogRefusal logged ${seen.length} line(s) for two refusals and one ok answer`);
  } else bad("airtableLogRefusal is missing from _airtable-ok.js");
}

if (F.length) { console.error(`🔴 an Airtable refusal can still go unnoticed:\n${F.map((m) => `   · ${m}`).join("\n")}`); process.exit(1); }
console.log(`✅ Airtable refusals are never silent: ${callers} caller(s) check the answer (${Object.keys(EXCUSED).length} excused by name), and the helper throws on every refusal shape Airtable sends`);
