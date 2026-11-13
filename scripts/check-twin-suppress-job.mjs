#!/usr/bin/env node
// check-twin-suppress-job.mjs: A DO-NOT-CONTACT APPLIES TO THE BUSINESS, AND A JOB ENFORCES IT EVERY DAY (the owner 11-11: "DO IT AND
// FIX ALL ISSUES"). On 11-11 five live leads shared an inbox or a website with an opted-out lead and were suppressed by hand; the
// sender is an Apps Script outside our repos, so the website's daily job lead-twin-suppress (netlify/functions/_twin-suppress.js)
// does it before the 7 AM Pacific send.
// HOLDS, on the WEBSITE repo, static + fixtures (a fake Airtable; NOTHING is ever sent anywhere):
//   1  the rule IS this repo's check-duplicate-identity-leads.mjs (its RULE START..END block run beside the job's module on the same
//      cases): the domain and email keys, the dead test, the platform and free-mail skip lists.
//   2  named cases: a domain twin, an email twin, a shared inbox, platform / subdomain / free-mail / blank never match, exact gmail does.
//   3  SET-ONLY: every write is Suppressed=true plus, at most, one line APPENDED to Outreach Notes; no other field, no delete, no
//      create, no typecast; a lead that changed since the list is left alone; a long note is never cut.
//   4  the cap: 50 suppresses 50; 51 suppresses NONE and is an error that says a human looks.
//   5  the kill switch TWIN_SUPPRESS=0 makes no request at all; an Airtable refusal, an empty table and a write not read back are errors.
//   6  the schedule: netlify.toml runs it daily before 13:30 UTC (7 AM Pacific in summer is 14:00 UTC), the job list has the same cron,
//      and the handler that ships is wrapped by withCheckin, so System health sees a refusal.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website as it was before this build (default 05ccdf0f) in 4+ places, else exit 2.
//   node scripts/check-twin-suppress-job.mjs [--against=<rev>] [--no-before]
import { runGate, reader, loader, codeLines } from "./lib/site-rev.mjs";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const BEFORE = "05ccdf0f";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCR = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
const idk = (m) => { console.error(`⚠️  INDETERMINATE: ${m}`); process.exit(2); };

// ── the reference rule: this repo's live-data check, its marked block run on its own ────────────────────────────────────────────
const REF = (() => {
  const src = (() => { try { return fs.readFileSync(path.join(SCR, "scripts/check-duplicate-identity-leads.mjs"), "utf8"); } catch { return null; } })();
  if (src == null) idk("scripts/check-duplicate-identity-leads.mjs moved");
  const a = src.indexOf("// ── RULE START"), b = src.indexOf("// ── RULE END");
  if (a < 0 || b < a) idk("check-duplicate-identity-leads.mjs has no RULE START..END block to compare against");
  try {
    return vm.runInNewContext(`${src.slice(a, b)}\n({ DEAD, domain, PLATFORM_DOMAINS, FREE_EMAIL_DOMAINS, skipDomain, keysOf, isDead })`, {});
  } catch (e) { idk(`the reference rule won't run: ${String(e.message).slice(0, 120)}`); }
})();

const WEBSITES = ["https://www.Joes-Plumbing.com/contact", "http://joes-plumbing.com", "JOES-PLUMBING.COM", "joes-plumbing.com/", "", "   ", undefined,
  "facebook.com/joes", "https://m.facebook.com/bobs", "joes.wixsite.com/home", "https://sites.google.com/view/joes", "gmail.com", "www.yahoo.com",
  "none", "N/A", "https://bhcmg.com/", "www.vca-inc.com/hospitals/x", "joes.co.uk", "joe.business.site", "https://www.yelp.com/biz/joes",
  "linktr.ee/joes", "awesome.com", "olive.com", "x.com/joes", "box.com", "shop.mail.com", "joes.myshopify.com"];
const EMAILS = ["Center@VCA-inc.helpshift.com ", "center@vca-inc.helpshift.com", "", undefined, "bob@gmail.com", "BOB@GMAIL.COM", "noemail", "a@b.com"];
const STATES = ["closed_dnc", "closed_bounced", "Closed_Unsubscribed", "day_4_opened", "not_yet_sent", "reengagement_opened", "unsubscribed", "", undefined];
const SUPP = [true, false, undefined, "true", 1];

function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root);
  const modSrc = rd("netlify/functions/_twin-suppress.js"), fnSrc = rd("netlify/functions/lead-twin-suppress.js");
  const toml = rd("netlify.toml") || "";

  // ── 6 the schedule + System health ───────────────────────────────────────────────────────────────────────────────────────────
  const m = /^\[functions\."lead-twin-suppress"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/m.exec(toml);
  if (!m) fail("netlify.toml doesn't schedule lead-twin-suppress, so the twins are only ever suppressed by hand");
  else {
    const c = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(m[1]);
    const at = c ? Number(c[2]) * 60 + Number(c[1]) : null;
    if (at == null) fail(`lead-twin-suppress runs on "${m[1]}", not once every day at a fixed UTC time`);
    else if (at > 13 * 60 + 30 || at < 10 * 60) fail(`lead-twin-suppress runs at ${m[1]} UTC; it must be between 10:00 and 13:30 UTC, so it finishes before the 7 AM Pacific send in summer (14:00 UTC) and winter (15:00 UTC), after the night's scrape has started`);
  }
  let jobs = [];
  try { jobs = loader(root)("./netlify/functions/_job-manifest.js").JOBS || []; } catch (e) { fail(`the job list won't load: ${String(e.message).slice(0, 100)}`); }
  const j = jobs.find((x) => x.job === "lead-twin-suppress");
  if (!j) fail("lead-twin-suppress isn't on System health's job list (_job-manifest.js), so a refusal would be silent");
  else {
    if (m && j.cron !== m[1]) fail(`the job list says ${j.cron} for lead-twin-suppress and netlify.toml says ${m[1]}`);
    if (typeof j.read !== "function") fail("the job list can't read what lead-twin-suppress did");
    else {
      const r = j.read({ ok: false, error: "x refused", scanned: 9, planned: 2, suppressed: 0 }) || {};
      if (r.error !== "x refused") fail("the job list drops lead-twin-suppress's error, so System health would show a refusal as fine");
    }
  }
  if (fnSrc == null) fail("netlify/functions/lead-twin-suppress.js is missing");
  else {
    const assigns = [...fnSrc.matchAll(/^exports\.handler\s*=\s*(.*)$/gm)];
    if (!assigns.length || !assigns[assigns.length - 1][1].includes('withCheckin("lead-twin-suppress", exports.handler)')) fail("lead-twin-suppress's shipped handler isn't wrapped by withCheckin, so it never checks in");
    if (!/requireCronOrInternal\(event\)/.test(fnSrc)) fail("lead-twin-suppress doesn't check its caller (scheduler or internal secret)");
    if (!/run\(\{\s*env:\s*process\.env,\s*fetchFn:\s*fetch/.test(fnSrc)) fail("lead-twin-suppress doesn't hand the job its real settings and fetch, so what the fixtures prove isn't what runs");
  }

  // ── 3 static set-only ────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (modSrc == null) { fail("netlify/functions/_twin-suppress.js is missing (the rule, the cap, the set-only write)"); return F; }
  const code = codeLines(modSrc).map((x) => x.l).join("\n") + "\n" + codeLines(fnSrc || "").map((x) => x.l).join("\n");
  if (/Suppressed\s*:\s*(false|0|null|undefined|"")/.test(code)) fail("the job can write Suppressed to something other than true");
  if (/["'](DELETE|POST|PUT)["']/.test(code)) fail("the job can delete, create or replace a record; it may only PATCH");
  if (/typecast/.test(code)) fail("the job writes with typecast, which can make new select options");
  if (/process\.env/.test(codeLines(modSrc).map((x) => x.l).join("\n"))) fail("_twin-suppress.js reads process.env itself; settings must be passed in so no test can reach the real Airtable");
  if (!/String\(env\.TWIN_SUPPRESS\) === "0"/.test(modSrc)) fail("the kill switch TWIN_SUPPRESS=0 is gone");

  let M;
  try { M = loader(root)("./netlify/functions/_twin-suppress.js"); } catch (e) { fail(`_twin-suppress.js won't load: ${String(e.message).slice(0, 120)}`); return F; }
  if (M.CAP !== 50) fail(`the cap is ${M.CAP}, not 50`);

  // ── 1 the rule is the reference's ────────────────────────────────────────────────────────────────────────────────────────────
  const sorted = (a) => JSON.stringify([...(a || [])].sort());
  if (sorted(M.PLATFORM_DOMAINS) !== sorted(REF.PLATFORM_DOMAINS)) fail("the platform skip list differs from check-duplicate-identity-leads.mjs");
  if (sorted(M.FREE_EMAIL_DOMAINS) !== sorted(REF.FREE_EMAIL_DOMAINS)) fail("the free-mail skip list differs from check-duplicate-identity-leads.mjs");
  if (!M.DEAD || M.DEAD.source !== REF.DEAD.source || M.DEAD.flags !== REF.DEAD.flags) fail(`the dead test is /${M.DEAD && M.DEAD.source}/, the check's is /${REF.DEAD.source}/`);
  for (const p of ["facebook.com", "wixsite.com", "squarespace.com", "yelp.com", "linktr.ee", "google.com", "business.site"]) if (!(M.PLATFORM_DOMAINS || []).includes(p)) fail(`${p} is not on the platform skip list`);
  for (const p of ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"]) if (!(M.FREE_EMAIL_DOMAINS || []).includes(p)) fail(`${p} is not on the free-mail skip list`);
  let diffs = 0;
  for (const w of WEBSITES) for (const e of EMAILS) {
    const f = { Website: w, Email: e };
    const a = JSON.stringify(M.keysOf(f)), b = JSON.stringify(REF.keysOf(f));
    if (a !== b && diffs++ < 4) fail(`identity of ${JSON.stringify(f)}: the job says ${a}, the check says ${b}`);
  }
  for (const s of STATES) for (const x of SUPP) {
    const f = { "Funnel State": s, Suppressed: x };
    if (M.isDead(f) !== REF.isDead({ fields: f }) && diffs++ < 8) fail(`dead or live for ${JSON.stringify(f)}: the job and the check disagree`);
  }
  if (diffs > 8) fail(`…${diffs} disagreements in all`);

  // ── 2 named cases ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const R = (id, f) => ({ id, fields: { "Business Name": id, ...f } });
  const FIX = [
    R("recA", { Website: "bhcmg.com", "Funnel State": "closed_dnc" }), R("recB", { Website: "https://www.bhcmg.com/about", "Funnel State": "not_yet_sent" }),
    R("recC", { Email: "pt@lamain.com", Suppressed: true }), R("recD", { Email: "PT@LAMain.com ", "Funnel State": "day_4_opened" }),
    R("recE", { Email: "center@vca-inc.helpshift.com", "Funnel State": "closed_dnc" }), R("recF", { Email: "center@vca-inc.helpshift.com" }), R("recG", { Email: "Center@vca-inc.helpshift.com" }),
    R("recH", { Website: "facebook.com/h", "Funnel State": "closed_dnc" }), R("recI", { Website: "https://facebook.com/i" }),
    R("recJ", { Website: "joes.wixsite.com", Suppressed: true }), R("recK", { Website: "joes.wixsite.com/about" }),
    R("recL", { Website: "gmail.com", "Funnel State": "closed_bounced" }), R("recM", { Website: "gmail.com" }),
    R("recN", { Email: "bob@gmail.com", "Funnel State": "closed_unsubscribed" }), R("recO", { Email: "bob@gmail.com", "Funnel State": "reengagement_opened" }),
    R("recP", { Email: "a@gmail.com", "Funnel State": "closed_dnc" }), R("recQ", { Email: "b@gmail.com" }),
    R("recR", { Website: "", "Funnel State": "closed_dnc" }), R("recS", { Website: "" }),
    R("recT", { Website: "dead.com", "Funnel State": "closed_dnc" }), R("recU", { Website: "dead.com", Suppressed: true }),
    R("recV", { Website: "live.com.au" }), R("recW", { Website: "live.com.au/x" }),
    R("recX", { Website: "none", "Funnel State": "closed_dnc" }), R("recY", { Website: "none" }),
  ];
  const WANT = ["recB", "recD", "recF", "recG", "recO"];
  let plan = [];
  try { plan = M.findTwins(FIX).plan.map((p) => p.id).sort(); } catch (e) { fail(`findTwins threw: ${String(e.message).slice(0, 100)}`); }
  if (JSON.stringify(plan) !== JSON.stringify(WANT)) fail(`on the named cases it would suppress [${plan.join(", ")}], it must be exactly [${WANT.join(", ")}]`);
  // and the reference, grouped the way the check groups, agrees with the job on the same records
  const refPlan = (() => {
    const g = new Map();
    for (const x of FIX) for (const k of REF.keysOf(x.fields)) { if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
    const out = new Set();
    for (const v of g.values()) { const d = v.filter(REF.isDead), l = v.filter((x) => !REF.isDead(x)); if (v.length > 1 && d.length && l.length) l.forEach((x) => out.add(x.id)); }
    return [...out].sort();
  })();
  if (JSON.stringify(refPlan) !== JSON.stringify(plan)) fail(`the check would flag [${refPlan.join(", ")}] and the job would suppress [${plan.join(", ")}]`);
  return runFlows(M, FIX, WANT, fail).then(() => F);
}

// ── 3 4 5 the run, on a fake Airtable ──────────────────────────────────────────────────────────────────────────────────────────
function fakeAirtable(records, { listStatus = 200, listBody = null, rereadPatch = {}, patchEcho = true } = {}) {
  const calls = [];
  const byId = new Map(records.map((x) => [x.id, x]));
  const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchFn = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : null, auth: (init.headers || {}).Authorization });
    if (!String(url).startsWith("https://api.airtable.com/v0/")) return answer(400, { error: "not airtable" });
    if (method === "PATCH") {
      const b = JSON.parse(init.body);
      return answer(200, { records: b.records.map((r) => ({ id: r.id, fields: patchEcho ? { ...(byId.get(r.id) || {}).fields, ...r.fields } : {} })) });
    }
    if (method !== "GET") return answer(405, { error: "method" });
    const u = new URL(url);
    const formula = u.searchParams.get("filterByFormula");
    if (formula) {
      const ids = [...formula.matchAll(/RECORD_ID\(\)='(rec\w+)'/g)].map((x) => x[1]);
      return answer(200, { records: ids.filter((id) => byId.has(id)).map((id) => ({ id, fields: { ...byId.get(id).fields, "Outreach Notes": `old note for ${id}`, ...(rereadPatch[id] || {}) } })) });
    }
    if (listBody) return answer(listStatus, listBody);
    const half = Math.ceil(records.length / 2), second = u.searchParams.get("offset") === "page2";
    const page = second ? records.slice(half) : records.slice(0, half);
    return answer(200, { records: page.map((x) => ({ id: x.id, fields: { ...x.fields } })), ...(second || records.length <= half ? {} : { offset: "page2" }) });
  };
  return { calls, fetchFn };
}
const ENV = { AIRTABLE_API_KEY: "keyFIXTUREonly", AIRTABLE_BASE_ID: "appFIXTURE", AIRTABLE_TABLE_NAME: "Leads" };
const NOW = () => new Date("2026-11-12T13:00:00Z");
const patches = (calls) => calls.filter((c) => c.method === "PATCH").flatMap((c) => c.body.records);

async function runFlows(M, FIX, WANT, fail) {
  const go = async (records, opts = {}, runOpts = {}) => {
    const A = fakeAirtable(records, opts);
    let out;
    try { out = await M.run({ env: { ...ENV, ...(runOpts.env || {}) }, fetchFn: A.fetchFn, now: NOW, dry: !!runOpts.dry }); }
    catch (e) { out = { threw: String(e.message).slice(0, 120) }; }
    return { out: out || {}, calls: A.calls };
  };

  // the normal day
  {
    const { out, calls } = await go(FIX);
    const P = patches(calls);
    if (out.threw) fail(`the run threw: ${out.threw}`);
    if (out.ok !== true || out.suppressed !== WANT.length) fail(`the normal day: ok=${out.ok}, suppressed=${out.suppressed}, must be ok with ${WANT.length}`);
    if (JSON.stringify(P.map((r) => r.id).sort()) !== JSON.stringify(WANT)) fail(`the normal day wrote [${P.map((r) => r.id).sort().join(", ")}], must be [${WANT.join(", ")}]`);
    for (const r of P) {
      const extra = Object.keys(r.fields).filter((k) => k !== "Suppressed" && k !== "Outreach Notes");
      if (extra.length) fail(`${r.id}: the write touches ${extra.join(", ")}; only Suppressed (and an appended note) may be written`);
      if (r.fields.Suppressed !== true) fail(`${r.id}: Suppressed is written as ${JSON.stringify(r.fields.Suppressed)}, never anything but true`);
      const n = r.fields["Outreach Notes"];
      if (n != null && !(n.startsWith(`old note for ${r.id}\n`) && /\[2026-11-12\] \[twin-suppress\]/.test(n))) fail(`${r.id}: the note isn't the old notes with one dated line appended`);
    }
    if (calls.some((c) => !["GET", "PATCH"].includes(c.method))) fail("the run made a request that isn't a read or a PATCH");
    if (calls.some((c) => c.auth !== `Bearer ${ENV.AIRTABLE_API_KEY}`)) fail("a request didn't use the key it was handed");
    if (!calls.some((c) => /offset=page2/.test(c.url))) fail("the run didn't read the second page of leads");
  }
  // kill switch: nothing at all
  {
    const { out, calls } = await go(FIX, {}, { env: { TWIN_SUPPRESS: "0" } });
    if (calls.length || out.off !== true) fail(`TWIN_SUPPRESS=0 still made ${calls.length} request(s) (off=${out.off})`);
  }
  // dry run: reads, never writes
  {
    const { out, calls } = await go(FIX, {}, { dry: true });
    if (patches(calls).length || out.planned !== WANT.length) fail(`a dry run wrote ${patches(calls).length} or planned ${out.planned}`);
  }
  // the cap: 50 is fine, 51 writes nothing and says a human looks
  const many = (n) => [{ id: "recDEAD0", fields: { Website: "chain.com", "Funnel State": "closed_dnc" } },
    ...Array.from({ length: n }, (_, i) => ({ id: `recLIVE${i}`, fields: { Website: `https://chain.com/loc${i}` } }))];
  {
    const { out, calls } = await go(many(50));
    if (out.ok !== true || patches(calls).length !== 50) fail(`50 twins: ok=${out.ok}, wrote ${patches(calls).length}, must write all 50`);
    if (calls.filter((c) => c.method === "PATCH").some((c) => c.body.records.length > 10)) fail("a PATCH carries more than 10 records (Airtable's limit)");
  }
  {
    const { out, calls } = await go(many(51));
    if (patches(calls).length) fail(`51 twins wrote ${patches(calls).length}; over the cap must write NONE`);
    if (out.ok !== false || !/over the cap of 50/.test(out.error || "") || !/a human looks/i.test(out.error || "")) fail(`51 twins: the run must fail with "over the cap of 50 … a human looks", it said ok=${out.ok} "${String(out.error || "").slice(0, 80)}"`);
  }
  // an Airtable refusal is never "no data"
  {
    const { out, calls } = await go(FIX, { listStatus: 429, listBody: { errors: [{ error: "PUBLIC_API_BILLING_LIMIT_EXCEEDED", message: "limit" }] } });
    if (patches(calls).length || out.ok !== false || !/could not be read/.test(out.error || "") || !/used up its requests/.test(out.error || "")) fail(`Airtable's 429 must be this job's error, it said ok=${out.ok} "${String(out.error || "").slice(0, 80)}"`);
  }
  {
    const { out } = await go(FIX, { listStatus: 200, listBody: { records: [] } });
    if (out.ok !== false || !/zero leads/.test(out.error || "")) fail(`an empty table must be an error, it said ok=${out.ok}`);
  }
  // 🔒 11-13: ONE slow page is asked again, not the end of the run (that morning the first page took >10s, nothing was read and 5
  // opted-out twins stayed live through the 7 AM send)
  {
    const A = fakeAirtable(FIX); let failed = 0;
    const flaky = async (url, init = {}) => {
      if ((init.method || "GET").toUpperCase() === "GET" && !new URL(url).searchParams.get("filterByFormula") && !failed) { failed++; const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
      return A.fetchFn(url, init);
    };
    let out; try { out = await M.run({ env: ENV, fetchFn: flaky, now: NOW, dry: true }); } catch (e) { out = { threw: String(e.message) }; }
    if (!out || out.ok !== true || out.scanned !== FIX.length) fail(`one timed-out page must be asked again, the run said ok=${out && out.ok} scanned=${out && out.scanned} "${String((out && (out.error || out.threw)) || "").slice(0, 120)}"`);
  }
  // changed since the list: left alone
  {
    const { out, calls } = await go(FIX, { rereadPatch: { recD: { Suppressed: true }, recB: { Website: "another.com" } } });
    const ids = patches(calls).map((r) => r.id);
    if (ids.includes("recD") || ids.includes("recB") || out.skipped !== 2) fail(`a lead that changed since the list was written anyway ([${ids.join(", ")}], skipped ${out.skipped})`);
  }
  // a write Airtable doesn't read back as Suppressed is an error
  {
    const { out } = await go(FIX, { patchEcho: false });
    if (out.ok !== false || out.suppressed !== 0) fail(`a write not read back as Suppressed must be an error, it said ok=${out.ok} suppressed=${out.suppressed}`);
  }
  // a long note is never cut: Suppressed alone
  {
    const big = "x".repeat(95000);
    const A = fakeAirtable(FIX, { rereadPatch: Object.fromEntries(FIX.map((x) => [x.id, { "Outreach Notes": big }])) });
    await M.run({ env: ENV, fetchFn: A.fetchFn, now: NOW }).catch(() => {});
    for (const r of patches(A.calls)) if ("Outreach Notes" in r.fields) fail(`${r.id}: a note at the limit was rewritten (it would be cut); only Suppressed may be written then`);
  }
}

try {
  await runGate({ name: "check-twin-suppress-job", beforeRev: BEFORE, checkTree, minBefore: 4 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
