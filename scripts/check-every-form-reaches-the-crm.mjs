#!/usr/bin/env node
// check-every-form-reaches-the-crm.mjs — THE DAILY FORM CHECK (approved master mockup #15 public site, Chris 11-11: "marked test, read back, deleted").
//
// 🔴 WHY: a form submission reaches the CRM only through webhooks set in the Netlify UI, which no code can see. Before 08-17, 2 of 3 forms forwarded
// nowhere for months and nobody knew. This gate is the proof that all three still arrive.
// A. THE CODE (always runs, against the shipped intakes with a fake database): a submission from CHECK_EMAIL is written as ONE row marked
//    raw_payload.test = true with the "TEST - daily form check" name; the audit intake stops there (no Airtable, no search, no report, no email);
//    an ordinary submission is never marked; a check never writes a second row on a repeat.
// B. THE LIVE SITE (runs when the live intakes know the mark, i.e. after this build is deployed; before that it says so and holds):
//    posts one check submission per form (contact, growth-plan, audit) to the live site's own form, waits, READS THE ROW BACK from lead_intakes,
//    requires it marked as a test, then DELETES it. A form whose row never arrives is a red, the same day. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//    in the environment (never printed); without them part B reports "cannot read back" and exits 2.
// Exit 0 holds · 1 broken · 2 couldn't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const LIVE = process.env.FORM_CHECK_SITE || "https://rocketgrowthagency.com";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
// the live read-back's own credentials are kept apart; the harness (part A) always runs on a fake database
const REAL = { url: process.env.SUPABASE_URL || "", key: process.env.SUPABASE_SERVICE_ROLE_KEY || "", fake: !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) };
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SUPABASE_WORKSPACE_ID = "ws-gate";
process.env.FGA_WEBHOOK_SECRET = "gate-secret-not-real";
// part B talks to the real site only in the real daily run, never in a mutation copy (run-mutations sets SCRAPER_COPY_DIR)
const MUTATION_COPY = !!process.env.SCRAPER_COPY_DIR || !!process.env.APPROVAL_ARCHIVE_SITE_DIR;
let FC, FORM, FGA, src = "";
try {
  FC = req("./_form-check.js");
  src = fs.readFileSync(`${SITE}/netlify/functions/fga-intake.js`, "utf8");
  // the fake database: the harness replaces fetch before the intakes load
  var writes = [], others = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://supa.test")) { if (u.includes("/lead_intakes")) writes.push(JSON.parse(init.body || "{}")); return new Response("[]", { status: 201 }); }
    others.push(u); return new Response("{}", { status: 200 });
  };
  globalThis.__realFetch = realFetch;
  FORM = req("./form-intake.js"); FGA = req("./fga-intake.js");
} catch (e) { ind(`harness: ${e.message}`); }
for (const k of ["isFormCheck", "testMark"]) if (typeof FC[k] !== "function") ind(`_form-check.js has no ${k}`);
const ev = (form, email, id) => ({ httpMethod: "POST", queryStringParameters: { k: "gate-secret-not-real" }, headers: {}, body: JSON.stringify({ payload: { form_name: form, id, created_at: "2026-11-11T10:00:00Z", data: { "form-name": form, name: "Form Check", email, website: "https://example.com", message: "m" } } }) });

// A. the code
if (FC.isFormCheck({ email: "someone@example.com" })) fail("an ordinary address is read as the check");
if (!FC.isFormCheck({ email: ` ${FC.CHECK_EMAIL.toUpperCase()} ` })) fail("the check address is not recognised (case or spaces)");
for (const form of ["contact", "growth-plan"]) {
  writes.length = 0; others.length = 0;
  const r = await FORM.handler(ev(form, FC.CHECK_EMAIL, "chk1"));
  if (r.statusCode !== 200) fail(`form-intake ${form}: check answered ${r.statusCode}`);
  const w = writes[0];
  if (writes.length !== 1) fail(`form-intake ${form}: a check wrote ${writes.length} rows, not 1`);
  else {
    if (!w.raw_payload || w.raw_payload.test !== true) fail(`form-intake ${form}: the check's row is not marked as a test`);
    if (w.business_name !== FC.CHECK_NAME) fail(`form-intake ${form}: the check's row does not carry the test name`);
  }
  writes.length = 0;
  await FORM.handler(ev(form, "real.person@example.com", "real1"));
  if (writes[0] && (writes[0].raw_payload || {}).test) fail(`form-intake ${form}: an ordinary submission was marked as a test`);
}
writes.length = 0; others.length = 0;
const ra = await FGA.handler(ev("audit", FC.CHECK_EMAIL, "chk2"));
if (ra.statusCode !== 200) fail(`fga-intake: check answered ${ra.statusCode}`);
if (writes.length !== 1 || !(writes[0].raw_payload || {}).test) fail("fga-intake: the audit check did not write exactly one row marked as a test");
if (others.length) fail(`fga-intake: the audit check reached ${others.length} other service(s) (${others.map((x) => new URL(x).host).join(", ").slice(0, 80)}): a check does no search, report or email`);
for (const [n, h] of [["form-intake", FORM], ["fga-intake", FGA]]) {
  const g = await h.handler({ httpMethod: "GET", headers: {}, queryStringParameters: {} });
  if (!JSON.parse(g.body || "{}").form_check) fail(`${n}: a GET does not say it knows the check (the live check would submit blind)`);
}
if (/CHECK_EMAIL|isFormCheck/.test(src) === false && !/FC\.isFormCheck/.test(src)) fail("fga-intake does not ask FC.isFormCheck");

// B. the live site
let liveNote = "";
globalThis.fetch = globalThis.__realFetch;
async function live() {
  const up = await Promise.all(["form-intake", "fga-intake"].map(async (n) => { try { const r = await fetch(`${LIVE}/.netlify/functions/${n}`); const j = await r.json().catch(() => ({})); return !!j.form_check; } catch { return null; } }));
  if (up.includes(null)) return "the live site could not be reached; part B not run";
  if (up.includes(false)) return "the live intakes do not know the check yet (this build is not deployed); part B waits for the deploy";
  if (REAL.fake) { ind("part B needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to read the row back"); }
  const H = { apikey: REAL.key, Authorization: `Bearer ${REAL.key}`, "Content-Type": "application/json" };
  const pages = { contact: "/contact/", "growth-plan": "/start-growth-plan/", audit: "/free-growth-audit/" };
  for (const [form, path] of Object.entries(pages)) {
    const stamp = Date.now();
    const body = new URLSearchParams({ "form-name": form, name: `Form Check ${stamp}`, email: FC.CHECK_EMAIL, website: "https://example.com", message: "daily form check" });
    let sent;
    try { sent = await fetch(`${LIVE}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "manual" }); } catch (e) { fail(`${form}: could not submit (${e.message})`); continue; }
    if (sent.status >= 400) { fail(`${form}: the live form answered ${sent.status}`); continue; }
    let row = null;
    for (let i = 0; i < 9 && !row; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const q = await fetch(`${REAL.url}/rest/v1/lead_intakes?contact_email=eq.${encodeURIComponent(FC.CHECK_EMAIL)}&business_name=eq.${encodeURIComponent(FC.CHECK_NAME)}&created_at=gte.${encodeURIComponent(new Date(stamp - 60000).toISOString())}&select=id,source,raw_payload`, { headers: H });
      const rows = q.ok ? await q.json() : [];
      row = rows.find((x) => (x.raw_payload || {}).form === form || (x.raw_payload || {}).form_name === form) || null;
    }
    if (!row) { fail(`${form}: the submission never reached the CRM (no row after 45 seconds): its webhook is broken`); continue; }
    if ((row.raw_payload || {}).test !== true) fail(`${form}: the row arrived but is not marked as a test`);
    const d = await fetch(`${REAL.url}/rest/v1/lead_intakes?id=eq.${row.id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
    if (!d.ok) fail(`${form}: the test row could not be deleted (${d.status})`);
  }
  return "";
}
liveNote = MUTATION_COPY ? "not run against a test copy of the site" : await live();
if (F.length) { console.error(`❌ ${F.length} form-check problem(s):\n - ${F.join("\n - ")}`); process.exit(1); }
console.log(`✅ every form reaches the CRM: the check is written marked as a test (contact, growth-plan, audit; audit does nothing else), an ordinary lead never is, and ${liveNote ? `the live read-back is waiting: ${liveNote}` : "all three live forms arrived, were read back marked as tests and deleted"}`);
