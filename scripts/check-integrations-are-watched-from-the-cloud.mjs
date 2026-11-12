#!/usr/bin/env node
// check-integrations-are-watched-from-the-cloud.mjs — integrations_hardening_v1 (master page docs/master-sop/pages/integrations.html, Chris
// approved every recommendation 11-11). The WEBSITE repo's integration checks hold:
//   1 · RGA's Google grant is probed daily with NO send: a token, every permission (gmail.send read from Google's own token info, since a
//       send-only permission allows no Gmail read), a free/busy read, which account. A dead grant is an ERROR, and admin draws a red banner
//       (the alert email goes through the grant that broke)
//   2 · sign-in links: generate_link (sends nothing) + the auth email settings (Management API, read only); unreadable = INDETERMINATE
//   3 · ONE AI ledger (_ai-ledger.js, table ai_call_ledger): an out-of-credit refusal is recorded and said once in 12 h (an ERROR + one Messages alert),
//       a laptop never writes it, and the second Anthropic ledger (_anthropic-ledger.js, anthropic_usage) stays deleted
//   4 · budgets: orange at 80% of a cap, red at 95% (SerpAPI, Places, Anthropic, Netlify), one rule
//   5 · GITHUB_ADMIN_TOKEN is read only by the invite accept (an app can't accept an invitation); repository work is RGA's app only
//   6 · the dormant CallRail constants and the legacy SERP_API_KEY alias are gone
//   7 · Stripe ledger, Quo key and Supabase advisor run from a Netlify schedule (the Mac keeps its own as a second opinion)
// Every check runs the shipped code on FAKES (no network, no email, no text, nothing written to Google, no secret printed). Each part is its
// own System health row (`part_of`), and each row's level reaches the card (warn = orange, over = red + an alert, indeterminate = couldn't tell).
// It proves itself: the same checker runs on the website at the build's before state (--against=c8cdb169) and MUST fail there.
// Exit 0 = holds · 1 = a regression · 2 = INDETERMINATE (the before state can't be built, or the checker can't tell old from new).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.dirname(HERE);
// the before state is read from the website's own git history (a mutation copy has no .git, so this is the real checkout)
const GIT_SITE = process.env.WEBSITE_GIT_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const BEFORE = (process.argv.find((a) => a.startsWith("--against=")) || "--against=c8cdb169").slice(10);
const MIN_BEFORE = 12;

// ── fakes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const res = (status, body, extra = {}) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const r = { ok: status >= 200 && status < 300, status, url: extra.url || "", text: async () => text, json: async () => JSON.parse(text), headers: { get: () => "application/json" } };
  r.clone = () => res(status, body, extra);
  return r;
};
const PLANTED_LINK = "https://jetgayimvfeslqnkbfdq.supabase.co/auth/v1/verify?token=PLANTEDSECRETLINK123";
const ALL_SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/userinfo.email openid";

async function check(DIR) {
  const bad = [];
  const need = (ok, msg) => { if (!ok) bad.push(msg); };
  const req = createRequire(path.join(DIR, "netlify/functions/x.js"));
  const rd = (p) => { try { return fs.readFileSync(path.join(DIR, p), "utf8"); } catch { return null; } };
  const load = (m) => { try { return req(`./${m}`); } catch (e) { bad.push(`${m} won't load (${String(e.message).split("\n")[0].slice(0, 90)})`); return null; } };
  const section = async (name, fn) => { try { await fn(); } catch (e) { bad.push(`${name}: threw ${String(e && e.message || e).split("\n")[0].slice(0, 120)}`); } };
  const savedFetch = globalThis.fetch;
  const env0 = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://jetgayimvfeslqnkbfdq.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-fake-key-0000", INTERNAL_FN_SECRET: "gate-secret-0000", URL: "https://site.test", AI_LEDGER: "0", ANTHROPIC_LEDGER: "0", PLACES_LEDGER: "0" });
  delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.LAMBDA_TASK_ROOT;

  const C = load("_integration-checks.js"), S = load("_job-status.js"), CK = load("_job-checkin.js"), M = load("_job-manifest.js"), L = load("_ai-ledger.js");

  // ── 4 · the budget rule, one for every service ─────────────────────────────────────────────────────────────────────────
  await section("budget rule", async () => {
    if (!C) return;
    need(C.budgetLevel(79, 100) === null && C.budgetLevel(80, 100) === "warn" && C.budgetLevel(94.9, 100) === "warn" && C.budgetLevel(95, 100) === "over" && C.budgetLevel(120, 100) === "over",
      "the budget rule isn't orange at 80% and red at 95% of the cap");
    need(C.budgetLevel(10, 0) === "indeterminate" && C.budgetLevel(NaN, 100) === "indeterminate", "a budget with no cap (or no reading) is judged instead of 'couldn't tell'");
  });

  // ── the level reaches the row and the card ──────────────────────────────────────────────────────────────────────────────
  await section("levels on the row", async () => {
    if (!S || !CK || !M) return;
    const job = M.JOBS.find((j) => j.job === "serpapi-budget");
    need(!!job, "there's no SerpAPI budget row on the job list");
    if (!job) return;
    const now = Date.parse("2026-11-12T14:00:00Z");
    const evalOf = (reply) => {
      const f = CK.outcome("serpapi-budget", { statusCode: 200, body: JSON.stringify(reply) });
      return S.evaluateJob(job, { job: job.job, started_at: new Date(now - 60e3).toISOString(), finished_at: new Date(now - 50e3).toISOString(), ok: f.ok, count: f.count, expected_min: f.expected_min, note: f.note, error: f.error }, null, { now, tableReady: true, systemStart: 0 });
    };
    const w = evalOf({ ok: true, level: "warn", note: "850 of 1,000 searches (85% of the cap)", used: 850 });
    need(w.state === "warn" && w.tone === "care" && w.problem === false, `a budget over 80% isn't an orange row that alerts nobody (got ${w.state}/${w.tone}/${w.problem})`);
    const o = evalOf({ ok: true, level: "over", error: "970 of 1,000 searches (97% of the cap)", used: 970 });
    need(o.state === "over" && o.tone === "bad" && o.problem === true && /970 of 1,000/.test(o.line), `a budget over 95% isn't a red row that alerts, in its own words (got ${o.state}/${o.tone}/${o.problem})`);
    const i = evalOf({ ok: true, level: "indeterminate", note: "no token" });
    need(i.state === "indeterminate" && i.problem === false && i.tone !== "ok", `a check that couldn't read its source isn't 'couldn't tell' (got ${i.state}/${i.tone})`);
    const k = evalOf({ ok: true, note: "850 of 1,000 searches (85% of the cap)", used: 850 });
    need(k.state === "ok", "a note that merely mentions a percentage changes the row's state");
    const sum = S.summarize([w, o, i, k]);
    need(sum.warn === 1 && sum.problems === 1, "the card's summary doesn't count the orange rows on their own");
    const watched = S.alertDecision(o, null, now), quiet = S.alertDecision(w, null, now);
    need(watched.send === "first" && !quiet.send, "the watcher doesn't alert on red, or alerts on orange");
  });

  // ── one run, one row per check ──────────────────────────────────────────────────────────────────────────────────────────
  await section("parts", async () => {
    if (!CK || !M) return;
    const writes = [];
    globalThis.fetch = async (url, init = {}) => { if (String(url).includes("/rest/v1/job_checkins")) { writes.push(JSON.parse(init.body || "{}")); return res(201, [{ id: `row${writes.length}` }]); } return res(404, {}); };
    for (const parent of ["integration-watch", "budget-watch"]) {
      const parts = M.JOBS.filter((j) => j.part_of === parent).map((j) => j.job);
      need(parts.length >= 4, `${parent} has ${parts.length} checks on the job list`);
      const replies = Object.fromEntries(parts.slice(1).map((p) => [p, { ok: true, note: "fine" }]));
      writes.length = 0;
      const h = CK.withCheckin(parent, async () => ({ statusCode: 200, body: JSON.stringify({ ok: true, parts: replies }) }));
      await h({ body: JSON.stringify({ next_run: "2026-11-12T13:25:00Z" }) }, {});
      const byJob = new Map(writes.filter((w) => w.job).map((w) => [w.job, w]));
      for (const p of parts.slice(1)) need(byJob.get(p) && byJob.get(p).ok === true, `${parent}: the ${p} check didn't get its own row`);
      const miss = byJob.get(parts[0]);
      need(miss && miss.ok === false && /didn't report/.test(miss.error || ""), `${parent}: a check the run left out isn't a failure in words`);
      // the source: the run reports exactly the checks on the list
      const src = rd(`netlify/functions/${parent}.js`) || "";
      const keys = [...src.matchAll(/^\s*"([a-z0-9-]+)": \(\) => C\./gm)].map((m) => m[1]).sort();
      need(JSON.stringify(keys) === JSON.stringify(parts.slice().sort()), `${parent}.js runs [${keys.join(", ")}], the job list says [${parts.join(", ")}]`);
      need(new RegExp(`\\[functions\\."${parent}"\\]\\s*\\n\\s*schedule = "${M.JOBS.find((j) => j.job === parent).cron.replace(/[*.]/g, "\\$&")}"`).test(rd("netlify.toml") || ""), `${parent} isn't on a Netlify schedule matching the job list`);
    }
    globalThis.fetch = savedFetch;
  });

  // ── 1 · RGA's Google grant ─────────────────────────────────────────────────────────────────────────────────────────────
  await section("Google grant", async () => {
    if (!C) return;
    const run = async ({ cred = { refresh_token: "k", google_email: "hello@rocketgrowthagency.com" }, token = { access_token: "at" }, tokenStatus = 200, scopes = ALL_SCOPES, info = 200, fb = 200, email = "hello@rocketgrowthagency.com" } = {}) => {
      const calls = [];
      const f = async (url, init = {}) => {
        const u = String(url); calls.push({ u, m: init.method || "GET" });
        if (u.startsWith("https://oauth2.googleapis.com/tokeninfo")) return res(info, { scope: scopes, email });
        if (u === "https://oauth2.googleapis.com/token") return res(tokenStatus, token);
        if (u.startsWith("https://www.googleapis.com/calendar/v3/freeBusy")) return res(fb, { calendars: { primary: { busy: [] } } });
        if (u.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) return res(200, { email });
        return res(404, {});
      };
      const tok = req("./_google-token.js");
      const out = await C.googleGrant({ supa: async () => (cred ? [cred] : []), fetchFn: f, revealToken: (x) => x, tokenFor: (k) => tok.rgaTokenWithDetail(k, f), now: () => Date.parse("2026-11-12T13:25:00Z") });
      return { out, calls };
    };
    const good = await run();
    need(good.out.ok === true && !good.out.level, `a healthy grant doesn't read OK (${JSON.stringify(good.out).slice(0, 120)})`);
    need(good.calls.some((c) => /tokeninfo/.test(c.u)) && good.calls.some((c) => /freeBusy/.test(c.u) && c.m === "POST") && good.calls.some((c) => /userinfo/.test(c.u)), "the probe doesn't read the permissions, the free/busy and the account");
    const all = [good, await run({ tokenStatus: 400, token: { error: "invalid_grant" } }), await run({ scopes: ALL_SCOPES.replace(/\S*gmail\.send\S*/, "") })];
    need(!all.some((r) => r.calls.some((c) => /gmail\.googleapis\.com/.test(c.u))), "the probe calls Gmail (a send-only permission allows no read, and nothing may be sent)");
    need(all[1].out.ok === false && /revoked or expired/i.test(all[1].out.error || ""), "a revoked grant isn't an ERROR that says revoked");
    need(all[2].out.ok === false && /send email/.test(all[2].out.error || ""), "a grant without gmail.send isn't an ERROR naming the missing permission");
    const none = await run({ cred: null });
    need(none.out.ok === false && /isn't connected/.test(none.out.error || ""), "no stored grant isn't an ERROR");
    const wrong = await run({ email: "someone@gmail.com" });
    need(wrong.out.ok === false && /wrong account|on record/.test(wrong.out.error || ""), "a grant for another Google account isn't an ERROR");
    const unk = await run({ info: 500 });
    need(unk.out.ok === true && unk.out.level === "indeterminate", "Google's permission list failing reads as a verdict instead of 'couldn't tell'");
  });

  // ── the red banner (the alert email goes through the grant that broke) ──────────────────────────────────────────────────
  await section("banner", async () => {
    const A = rd("admin/admin.js") || "", IDX = rd("admin/index.html") || "", CSS = rd("admin/admin.css") || "";
    const m = /function googleGrantBannerHtml\(d\) \{[\s\S]*?\n\}\n/.exec(A);
    need(!!m, "admin has no Google connection banner");
    if (m) {
      const ctx = { escapeHtml: (s) => String(s).replace(/</g, "&lt;") };
      vm.createContext(ctx); vm.runInContext(`${m[0]}; this.g = googleGrantBannerHtml;`, ctx);
      const row = (state) => ({ jobs: [{ job: "google-grant", state, problem: ["failed", "late"].includes(state), line: "Nov 12. The RGA Google connection was revoked or expired." }] });
      need(/connection is down/.test(ctx.g(row("failed"))) && /revoked/.test(ctx.g(row("failed"))), "a failed google-grant row draws no red banner");
      need(ctx.g(row("late")) === "" && ctx.g(row("ok")) === "" && ctx.g(null) === "", "the banner draws for a row that didn't say the grant broke");
    }
    const paint = /function paintSystemHealth\(\) \{\n([\s\S]*?)\n\}/.exec(A);
    need(!!paint && /paintGoogleGrantBanner\(\)/.test(paint[1]) && paint[1].indexOf("paintGoogleGrantBanner()") < paint[1].indexOf("if (!full)"), "the banner isn't painted on every screen (it must come before the card's own-tab-only return)");
    need(/<div id="rgaGoogleBanner" hidden><\/div>/.test(IDX) && IDX.indexOf('id="rgaGoogleBanner"') < IDX.indexOf('id="systemHealthView"'), "admin has no banner slot above the views");
    need(/tone === "bad" \? "ob-zc-bad"/.test(A) && /tone === "care" \? "ob-zc-care"/.test(A) && /\.ob-zc-bad\b/.test(CSS) && /\.ob-zc-care\b/.test(CSS), "the card can't draw a red or orange row");
    need(/Number\(sum\.warn\) > 0\) \{ cls = "care"/.test(A), "a budget over 80% can read 'All clear' in the card's header");
  });

  // ── 2 · sign-in links ─────────────────────────────────────────────────────────────────────────────────────────────────
  await section("sign-in links", async () => {
    if (!C) return;
    const run = async ({ gen = 200, env = {}, auth = 200, cfg = { smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_admin_email: "hello@rocketgrowthagency.com", external_email_enabled: true } } = {}) => {
      const calls = [];
      const f = async (url, init = {}) => {
        const u = String(url); calls.push(u);
        if (u.endsWith("/auth/v1/admin/generate_link")) return res(gen, gen === 200 ? { action_link: PLANTED_LINK, properties: { action_link: PLANTED_LINK, hashed_token: "h" } } : { msg: "boom" });
        if (/api\.supabase\.com\/v1\/projects\/[a-z0-9]+\/config\/auth$/.test(u)) return res(auth, cfg);
        return res(404, {});
      };
      const out = await C.signinLinks({ fetchFn: f, env: { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "svc", ...env } });
      return { out, calls };
    };
    const noPat = await run();
    need(noPat.out.ok === true && noPat.out.level === "indeterminate", "without the Management token, the sign-in row reads as a verdict instead of 'couldn't tell'");
    const good = await run({ env: { SUPABASE_ACCESS_TOKEN: "pat" } });
    need(good.out.ok === true && !good.out.level && /Resend/.test(good.out.note || ""), `a made link + Resend settings doesn't read OK (${JSON.stringify(good.out).slice(0, 140)})`);
    const noSmtp = await run({ env: { SUPABASE_ACCESS_TOKEN: "pat" }, cfg: { smtp_admin_email: "x@y.z", external_email_enabled: true } });
    need(noSmtp.out.ok === false && /server/.test(noSmtp.out.error || ""), "no email server in Supabase's settings isn't an ERROR");
    const dead = await run({ gen: 500 });
    need(dead.out.ok === false, "Supabase refusing to make a sign-in link isn't an ERROR");
    const unread = await run({ env: { SUPABASE_ACCESS_TOKEN: "pat" }, auth: 401 });
    need(unread.out.ok === true && unread.out.level === "indeterminate", "unreadable email settings read as a verdict");
    const every = [noPat, good, noSmtp, dead, unread];
    need(!every.some((r) => r.calls.some((u) => /\/auth\/v1\/(otp|recover|magiclink|invite)\b/.test(u))), "the sign-in check calls an endpoint that EMAILS a link");
    need(!every.some((r) => JSON.stringify(r.out).includes("PLANTEDSECRETLINK")), "the sign-in link itself reaches the row");
  });

  // ── 7 · Stripe ledger, Quo key, Supabase advisor from the cloud ─────────────────────────────────────────────────────────
  await section("Stripe ledger", async () => {
    if (!C) return;
    const R = (probeMissing, real) => async (ev) => { const b = JSON.parse(ev.body); return { statusCode: 200, body: JSON.stringify(b.fixture ? { fixture: true, missing_from_ledger: probeMissing } : real) }; };
    const clean = await C.stripeLedger({ reconcile: R([{ id: "x" }], { ok: true, charges_found: 2, reconciled: [1, 2], missing_from_ledger: [], unattributed: [] }), env: { INTERNAL_FN_SECRET: "s" } });
    need(clean.ok === true && !clean.level, "a week where every payment is in the ledger doesn't read OK");
    const miss = await C.stripeLedger({ reconcile: R([{ id: "x" }], { ok: false, charges_found: 1, reconciled: [], missing_from_ledger: [{ amount: 900, invoice_num: 1 }], unattributed: [] }), env: { INTERNAL_FN_SECRET: "s" } });
    need(miss.ok === false && /NOT paid in our ledger/.test(miss.error || ""), "a payment missing from the ledger isn't an ERROR");
    const blind = await C.stripeLedger({ reconcile: R([], { ok: true, charges_found: 0, missing_from_ledger: [] }), env: { INTERNAL_FN_SECRET: "s" } });
    need(blind.ok === true && blind.level === "indeterminate", "a reconciler that can't catch a planted miss is trusted");
    const src = rd("netlify/functions/integration-watch.js") || "";
    need(/"stripe-ledger": \(\) => C\.stripeLedger\(\)/.test(src), "the Stripe ledger isn't checked from the Netlify schedule");
  });
  await section("Quo key", async () => {
    if (!C) return;
    const q = (st) => async () => (st === "throw" ? (() => { throw new Error("ECONNRESET"); })() : res(st, {}));
    const ok = await C.quoKey({ fetchFn: q(200), env: { QUO_API_KEY: "k" } }), no = await C.quoKey({ fetchFn: q(401), env: { QUO_API_KEY: "k" } });
    const gone = await C.quoKey({ fetchFn: q(200), env: {} }), down = await C.quoKey({ fetchFn: q("throw"), env: { QUO_API_KEY: "k" } });
    need(ok.ok === true && no.ok === false && gone.ok === false && down.level === "indeterminate", "the Quo row doesn't tell ok / refused / missing / unreachable apart");
    const sd = rd("netlify/functions/schedule-data.js") || "";
    need(/require\("\.\/_quo-key"\)\.quoKeyState\(\)/.test(sd) && !/api\.openphone\.com\/v1\/phone-numbers/.test(sd), "the Schedule and the daily row test the Quo key two different ways");
  });
  await section("Supabase advisor", async () => {
    if (!C) return;
    const f = (lints) => async () => res(200, lints);
    const none = await C.supabaseAdvisor({ fetchFn: f([]), env: { SUPABASE_URL: process.env.SUPABASE_URL } });
    const bad1 = await C.supabaseAdvisor({ fetchFn: f([{ level: "ERROR", name: "rls_disabled_in_public", metadata: { name: "t" } }]), env: { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ACCESS_TOKEN: "p" } });
    const fine = await C.supabaseAdvisor({ fetchFn: f([{ level: "WARN", name: "w" }]), env: { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ACCESS_TOKEN: "p" } });
    need(none.level === "indeterminate" && bad1.ok === false && /rls_disabled_in_public/.test(bad1.error || "") && fine.ok === true && !fine.level, "the advisor row doesn't tell no-token / ERROR / clean apart");
  });

  // ── 3 · Anthropic: one meter, a ledger row per call, out-of-credit said ─────────────────────────────────────────────────
  await section("Anthropic meter", async () => {
    if (!L) return;
    const rows = [], told = [];
    let ledgerHasRefusal = false;
    const ledgerFetch = async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/rest/v1/ai_call_ledger?provider=eq.anthropic&error=like.")) return res(200, ledgerHasRefusal ? [{ id: 1 }] : []);
      if (u.endsWith("/rest/v1/ai_call_ledger") && init.method === "POST") { rows.push(JSON.parse(init.body)); return res(201, ""); }
      return res(404, {});
    };
    const deps = { fetch: ledgerFetch, notify: async (m) => told.push(m) };
    const broke = JSON.stringify({ type: "error", error: { type: "billing_error", message: "Your credit balance is too low to access the Anthropic API." } });
    await L.recordAiCall({ fn: "gate", provider: "anthropic", model: "claude-sonnet-4-6", usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 100 }, ok: true, status: 200 }, deps);
    need(rows.length === 1 && rows[0].input_tokens === 1300 && rows[0].output_tokens === 300 && rows[0].fn === "gate" && rows[0].ok === true && told.length === 0, `a call isn't written to ai_call_ledger with its tokens (${JSON.stringify(rows[0] || {})})`);
    await L.recordAiCall({ fn: "gate", provider: "anthropic", model: "claude-sonnet-4-6", ok: false, status: 402, error: L.errorType(402, broke) }, deps);
    need(rows.length === 2 && /credit_balance_too_low/.test(rows[1].error || "") && told.length === 1, "an out-of-credit refusal isn't recorded and told once");
    ledgerHasRefusal = true;
    const wording400 = JSON.stringify({ error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
    await L.recordAiCall({ fn: "gate", provider: "anthropic", model: "claude-sonnet-4-6", ok: false, status: 400, error: L.errorType(400, wording400) }, deps);
    need(rows.length === 3 && /credit_balance_too_low/.test(rows[2].error || "") && told.length === 1, "a second refusal in 12 hours is told again (or the 400 credit wording isn't read as one)");
    // a refused alert path never breaks the call it records
    let threw = false; const warn = console.warn, err = console.error; console.warn = () => {}; console.error = () => {};
    try { await L.recordAiCall({ fn: "gate", provider: "anthropic", ok: false, status: 402, error: "credit_balance_too_low (402)" }, { fetch: async () => { throw new Error("down"); }, notify: async () => { throw new Error("down"); } }); } catch { threw = true; }
    console.warn = warn; console.error = err;
    need(!threw, "a failed ledger or alert write breaks the call it records");
    // off Netlify, with no fetch handed in, nothing is written (the gates share the clients' database)
    let touched = 0;
    globalThis.fetch = async () => { touched++; return res(200, {}); };
    await L.recordAiCall({ fn: "gate", provider: "anthropic", ok: true, status: 200 });
    globalThis.fetch = savedFetch;
    need(touched === 0, "the ledger writes to the real database from a laptop");
    need(Math.abs(L.costUsd("claude-sonnet-4-6", { input_tokens: 1e6, output_tokens: 1e6 }) - 18) < 1e-9, "the $ estimate isn't Anthropic's price per token");
    // ONE ledger: the second one stays deleted and no caller reaches it
    need(rd("netlify/functions/_anthropic-ledger.js") === null, "a second Anthropic ledger file (_anthropic-ledger.js) is back");
    need(rd("docs/supabase/ANTHROPIC_USAGE_2026-11-11.sql") === null, "the second ledger's SQL file (ANTHROPIC_USAGE) is back");
    const dir = path.join(DIR, "netlify/functions"), twice = [], second = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      if (/_anthropic-ledger|anthropic_usage|\.meter\(/.test(src)) second.push(f);
    }
    need(second.length === 0, `${second.length} file(s) still use a second ledger: ${second.slice(0, 4).join(", ")}`);
    void twice;
  });
  await section("Anthropic row", async () => {
    if (!C) return;
    const sum = (o) => async () => ({ mode: "ok", calls: 10, input: 1, output: 1, usd: 5, exact: true, refusals: [], last_ok_at: null, ...o });
    const ns = await C.anthropicSpend({ summary: async () => ({ mode: "not-set-up" }), env: {} });
    need(ns.level === "indeterminate" && /AI_CALL_LEDGER/.test(ns.note || ""), "no ledger table reads as $0 instead of 'not set up'");
    const out = await C.anthropicSpend({ summary: sum({ refusals: [{ at: "2026-11-12T10:00:00Z", caller: "brain-analysis", status: 402 }], last_ok_at: "2026-11-12T09:00:00Z" }), env: {} });
    need(out.ok === false && /credit/.test(out.error || ""), "an out-of-credit refusal isn't the Anthropic row's ERROR");
    const back = await C.anthropicSpend({ summary: sum({ refusals: [{ at: "2026-11-12T10:00:00Z", caller: "x", status: 402 }], last_ok_at: "2026-11-12T11:00:00Z" }), env: {} });
    need(back.ok === true, "a refusal a good call came after is still read as out of credit");
    const w = await C.anthropicSpend({ summary: sum({ usd: 41 }), env: { AI_MONTHLY_BUDGET_USD: "50" } }), o = await C.anthropicSpend({ summary: sum({ usd: 48 }), env: { AI_MONTHLY_BUDGET_USD: "50" } });
    const fb = await C.anthropicSpend({ summary: sum({ usd: 48 }), env: { ANTHROPIC_MONTHLY_CAP_USD: "50" } });
    need(fb.level === "over", "the old ANTHROPIC_MONTHLY_CAP_USD is no longer read as the budget when AI_MONTHLY_BUDGET_USD is unset");
    need(w.level === "warn" && o.level === "over", "Anthropic spend isn't orange at 80% / red at 95% of its cap");
  });

  // ── 4 · the other budgets ───────────────────────────────────────────────────────────────────────────────────────────────
  await section("SerpAPI", async () => {
    if (!C) return;
    const calls = [];
    const f = (a) => async (u) => { calls.push(String(u)); return res(200, a); };
    const w = await C.serpapiBudget({ fetchFn: f({ searches_per_month: 1000, this_month_usage: 850, total_searches_left: 150 }), env: { SERPAPI_KEY: "k" } });
    const o = await C.serpapiBudget({ fetchFn: f({ searches_per_month: 1000, this_month_usage: 960 }), env: { SERPAPI_KEY: "k" } });
    const k = await C.serpapiBudget({ fetchFn: f({ searches_per_month: 1000, this_month_usage: 100 }), env: { SERPAPI_KEY: "k" } });
    need(w.level === "warn" && o.level === "over" && k.ok === true && !k.level, "SerpAPI isn't orange at 80% / red at 95% of the plan");
    need(calls.every((u) => /^https:\/\/serpapi\.com\/account\.json\?/.test(u)), "the SerpAPI budget spends a search (only account.json is free)");
    need(!JSON.stringify([w, o, k]).includes("api_key"), "the SerpAPI key reaches the row");
  });
  await section("Places", async () => {
    if (!C) return;
    const day = (used, refused = null) => async () => ({ mode: "ok", used, cap: 32, refused });
    const w = await C.placesBudget({ summary: day(26) }), k = await C.placesBudget({ summary: day(10) });
    const r = await C.placesBudget({ summary: day(5, { at: "2026-11-11T16:21:00Z", consumer: "backfill-gbp-hours", sentence: "Google refused a Places lookup (429, daily quota)" }) });
    const ns = await C.placesBudget({ summary: async () => ({ mode: "not-set-up" }) });
    need(w.level === "warn" && k.ok === true && !k.level && r.level === "over" && /429/.test(r.error || "") && ns.level === "indeterminate", "Places isn't orange at 80% / red at a refusal / 'not set up' without the ledger");
  });
  await section("Netlify", async () => {
    if (!C) return;
    const nt = await C.netlifyCredits({ fetchFn: async () => res(200, {}), env: {} });
    need(nt.level === "indeterminate", "without a Netlify token the credits row reads as a verdict");
    // the website's copy of the forecast = the Mac's, on fixed scenarios
    const W = req("./_netlify-credit-forecast.js").forecast;
    const { forecast: Mac } = await import(pathToFileURL(fs.existsSync(`${SCR}/scripts/lib/netlify-credit-forecast.mjs`) ? `${SCR}/scripts/lib/netlify-credit-forecast.mjs` : `${HERE}/lib/netlify-credit-forecast.mjs`).href);
    const now = "2026-10-13T12:00:00Z", at = (h) => ({ context: "production", created_at: new Date(Date.parse(now) - h * 3600000).toISOString() });
    const base = { bandwidthBytes: 5e9, periodStart: "2026-09-21T07:00:00Z", periodEnd: "2026-10-21T07:00:00Z", now };
    const scen = [{ ...base, anchorLeft: 100000, anchorAt: "2026-10-11T12:00:00Z", deploys: Array.from({ length: 12 }, (_, i) => at(i * 1.6)) },
      { ...base, anchorLeft: 400, anchorAt: "2026-10-11T12:00:00Z", deploys: Array.from({ length: 8 }, (_, i) => at(i * 6)) },
      { ...base, anchorLeft: 6000, anchorAt: "2026-09-01T00:00:00Z", deploys: Array.from({ length: 8 }, (_, i) => at(i * 6)) }];
    const same = scen.every((s) => JSON.stringify(W(s)) === JSON.stringify(Mac(s)));
    need(same, "the website's Netlify forecast disagrees with the Mac's on a fixed scenario");
  });

  // ── 5 · the RGA Admin key ───────────────────────────────────────────────────────────────────────────────────────────────
  await section("GitHub key", async () => {
    const dir = path.join(DIR, "netlify/functions"), readers = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) if (/process\.env\.GITHUB_ADMIN_TOKEN/.test(fs.readFileSync(path.join(dir, f), "utf8"))) readers.push(f);
    need(JSON.stringify(readers) === JSON.stringify(["admin-access-confirm.js"]), `GITHUB_ADMIN_TOKEN is read by ${readers.join(", ") || "nothing"}; only the invite accept may (an app can't accept an invitation)`);
    const ac = rd("netlify/functions/admin-access-confirm.js") || "";
    need(/THE ONE PLACE GITHUB_ADMIN_TOKEN STAYS/.test(ac), "the invite accept doesn't say why it keeps the RGA Admin key");
  });

  // ── 6 · dormant integrations ────────────────────────────────────────────────────────────────────────────────────────────
  await section("dormant", async () => {
    const dir = path.join(DIR, "netlify/functions"), alias = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) if (/process\.env\.SERP_API_KEY/.test(fs.readFileSync(path.join(dir, f), "utf8"))) alias.push(f);
    need(alias.length === 0, `the legacy SERP_API_KEY alias is still read (${alias.join(", ")})`);
    need(!/CALLRAIL_|api\.callrail\.com/.test((rd("netlify/functions/call-tracking-sync.js") || "").replace(/^\s*\/\/.*$/gm, "")), "call-tracking-sync still carries the dormant CallRail constants");
  });

  globalThis.fetch = savedFetch;
  for (const k of Object.keys(process.env)) if (!(k in env0)) delete process.env[k];
  Object.assign(process.env, env0);
  return bad;
}

const now = await check(SITE);
let before;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "integrations-before-"));
try {
  execFileSync("bash", ["-c", `git -C "${GIT_SITE}" archive ${BEFORE} netlify/functions netlify.toml admin data shared docs/supabase | tar -x -C "${TMP}"`], { stdio: ["ignore", "ignore", "pipe"] });
  before = await check(TMP);
} catch (e) {
  console.log(`INDETERMINATE: couldn't read the before state ${BEFORE} (${String(e.message).slice(0, 120)}), so this check can't prove it can fail`);
  process.exit(2);
} finally { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ } }
if (before.length < MIN_BEFORE) { console.log(`INDETERMINATE: the checker finds only ${before.length} problem(s) at ${BEFORE}; it can't tell the old integrations from the new`); process.exit(2); }
if (now.length) { console.log(`❌ integrations aren't watched from the cloud — ${now.length} problem(s):`); now.forEach((m) => console.log(`  · ${m}`)); process.exit(1); }
console.log(`✅ integrations are watched from the cloud: RGA's Google grant probed with no send (red banner when it breaks), sign-in links made without email, one AI ledger for every model call (out of credit said once), budgets orange at 80% / red at 95%, Stripe ledger + Quo key + Supabase advisor on a Netlify schedule, the RGA Admin key only in the invite accept, the dormant aliases gone. Proven: the old code at ${BEFORE} fails ${before.length} ways.`);
