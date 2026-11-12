#!/usr/bin/env node
// check-the-blind-spots-are-probed.mjs: THE FAILURES NOTHING NOTICED ARE PROBED FROM THE SERVER EVERY DAY (runbooks master page, approved
// 11-11: Tier 1 "Probe Google Cloud billing daily", "An outside health read of Supabase", "Prove magic-link email arrives"; decisions
// "a restart always waits for your OK" and "Resend's own delivery log for the sign-in emails").
// HOLDS, on the WEBSITE repo, with fakes only (no Google, Supabase or Resend call is made; nothing is sent; no key is read):
//   1  cloud-billing-probe: a billing refusal (403 BILLING_DISABLED) is red and says to fix the payment, never to raise a quota; both
//      answering is OK; a quota answer (429) is "could not tell", never red; the Places call is a free ID-only details read (field mask
//      id), not SearchText; no call goes to Cloud Billing, Service Usage or any quota endpoint; the key never appears in what it returns.
//   2  supabase-health: fast answers are healthy; over 1 s is slow (OK, said); no answer in 2 s or a 5xx is UNHEALTHY, and its words say
//      nothing was restarted and exactly what Chris presses, only with his OK; it texts once when it turns bad, not again within 6 hours,
//      once when it recovers, and every bad hour if its state can't be kept; it pings its outside check, /fail when unhealthy.
//   3  NOTHING RESTARTS SUPABASE: no code line in the website's functions, shared, admin, portal or scripts, or this repo's scripts,
//      calls a Supabase /restart.
//   4  magic-link-delivery: Resend's log read once (a GET, never a send); a bounce, a complaint, a failure or a delay over 2 hours is red;
//      all delivered is OK; no key, or a send-only key, is red "Not set up" (an absence is never fine); no email address leaves it.
//   5  each of the three is on the job list and in netlify.toml with the same cron, wrapped by withCheckin; the Places budget is not spent.
// PROVES ITSELF: it must fail on the before state (website c621cc35, scraper 686467af) in 4+ places, else exit 2.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runTwoRepoGate, rd } from "./lib/two-repo-gate.mjs";
import { codeLines } from "./lib/site-rev.mjs";

const J = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const rec = (route) => { const calls = []; const f = async (url, init = {}) => { calls.push({ url: String(url), method: init.method || "GET", init }); return route(String(url), init); }; f.calls = calls; return f; };
const hang = (url, init) => new Promise((_, rej) => { const s = init && init.signal; if (s) s.addEventListener("abort", () => rej(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }))); });

function walk(dir, out = []) {
  let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of es) { if (/^(node_modules|\.git|v|reports|mutations)$/.test(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(m?js|sh)$/.test(e.name)) out.push(p); }
  return out;
}

async function checkTree(site, scr, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), W = rd(site);
  const req = createRequire(path.join(site, "netlify/functions/x.js"));
  const load = (n) => { try { req("./_deadline.js"); const p = req.resolve(`./${n}`); delete req.cache[p]; return req(`./${n}`); } catch { return null; } };

  // ── 1 Google Cloud billing ────────────────────────────────────────────────────────────────────────────────────────────────
  const CB = load("cloud-billing-probe.js");
  if (!CB || typeof CB.probe !== "function") fail("cloud-billing-probe.js is missing: Google Cloud billing going off reaches no one (the $755 runaway, 2026-05-07)");
  else {
    const env = { GOOGLE_PLACES_API_KEY: "FAKEKEY-places-123", GOOGLE_PAGESPEED_API_KEY: "FAKEKEY-psi-456" };
    const billing = J(403, { error: { code: 403, message: "This API method requires billing to be enabled.", status: "PERMISSION_DENIED", details: [{ reason: "BILLING_DISABLED" }] } });
    { const f = rec(() => billing); const o = await CB.probe({ env, fetchFn: f });
      if (o.ok !== false || o.billing_off !== true || !/billing/i.test(o.error || "")) fail("a billing refusal from Google isn't red");
      if (!/Never raise a quota/.test(o.error || "") || /raise (the|a|your) quota(?! )/i.test((o.error || "").replace(/Never raise a quota/g, ""))) fail("the billing alert doesn't say never to raise a quota");
      if (JSON.stringify(o).includes("FAKEKEY")) fail("a Google key appears in what the probe returns");
      const pl = f.calls.find((c) => /places\.googleapis\.com/.test(c.url));
      if (!pl || /searchText/i.test(pl.url) || (pl.init.headers || {})["X-Goog-FieldMask"] !== "id") fail("the Places probe isn't the free ID-only details read (it would spend the 32-a-day SearchText budget or a paid SKU)");
      if (f.calls.some((c) => /cloudbilling|serviceusage|quota|billingAccounts/i.test(c.url))) fail("the probe calls a billing or quota endpoint; it must only read");
      if (f.calls.some((c) => c.method !== "GET")) fail("the probe writes something; it must only read");
      if (f.calls.length !== 2) fail(`the probe made ${f.calls.length} calls, not one Places and one PageSpeed`); }
    // Google says it either way: in the message, or only in the details' reason
    { const o = await CB.probe({ env, fetchFn: rec(() => J(403, { error: { code: 403, message: "This API project is not authorized to use this API. Please ensure billing is enabled.", status: "PERMISSION_DENIED" } })) });
      if (o.billing_off !== true) fail("a billing refusal said only in Google's message isn't red"); }
    { const o = await CB.probe({ env, fetchFn: rec(() => J(403, { error: { code: 403, message: "Permission denied", status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "BILLING_DISABLED" }] } })) });
      if (o.billing_off !== true) fail("a billing refusal said only in Google's details (BILLING_DISABLED) isn't red"); }
    { const o = await CB.probe({ env, fetchFn: rec(() => J(200, { id: "x" })) });
      if (o.ok !== true || o.error) fail("two good answers aren't OK"); }
    { const o = await CB.probe({ env, fetchFn: rec(() => J(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } })) });
      if (o.ok !== true || o.billing_off || o.could_not_tell !== 2) fail("a quota answer is read as billing (or red); it is 'could not tell'"); }
    { const o = await CB.probe({ env: {}, fetchFn: rec(() => J(200, {})) });
      if (o.places !== "missing") fail("no key reads as an answer"); }
  }

  // ── 2 Supabase health ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const SH = load("supabase-health.js");
  if (!SH || typeof SH.run !== "function") fail("supabase-health.js is missing: a slow or unhealthy database reaches no one (10-08, 11-6)");
  else {
    const env = { SUPABASE_URL: "https://abcdefgh.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake-service", SUPABASE_HEALTH_PING_URL: "https://hc-ping.com/sb" };
    const mem = () => { let v = {}; return { get: async () => v, set: async (x) => { v = x; } }; };
    const texts = [], pings = [];
    const text = async (m) => { texts.push(m); return { sent: true }; };
    const ping = async (u, o) => { pings.push(o.ok); return "sent"; };
    { const o = await SH.run({ env, fetchFn: rec(() => J(200, [])), state: mem(), text, ping });
      if (o.verdict !== "healthy" || o.ok !== true || texts.length) fail(`fast answers aren't healthy, or a healthy hour texted (${o.verdict})`); }
    { const f = rec((u) => /rest\/v1/.test(u) ? new Promise((r) => setTimeout(() => r(J(200, [])), 1300)) : J(200, {}));
      const o = await SH.run({ env, fetchFn: f, state: mem(), text, ping });
      if (o.verdict !== "slow" || o.ok !== true) fail(`a 1.3-second read isn't "slow" (OK, said): ${o.verdict}`); }
    const st = mem(); texts.length = 0; pings.length = 0;
    const down = rec((u, i) => /rest\/v1/.test(u) ? hang(u, i) : J(200, {}));
    { const t0 = Date.now(); const o = await SH.run({ env, fetchFn: down, state: st, text, ping, now: 1e12 });
      if (Date.now() - t0 > 4500) fail("the read budget isn't 2 seconds");
      if (o.verdict !== "unhealthy" || o.ok !== false) fail("no answer in 2 seconds isn't UNHEALTHY");
      if (!/Nothing was restarted/.test(o.error || "") || !/only with your OK/.test(o.error || "") || !/Project Settings > General > Restart project/.test(o.error || "")) fail("the unhealthy alert doesn't say nothing was restarted and exactly what Chris presses, with his OK");
      if (texts.length !== 1) fail("an unhealthy database isn't texted (the email and Messages need the database itself)");
      if (pings[pings.length - 1] !== false) fail("an unhealthy read doesn't ping its outside check's /fail"); }
    { await SH.run({ env, fetchFn: down, state: st, text, ping, now: 1e12 + 3600000 });
      if (texts.length !== 1) fail("a second bad hour within 6 hours texts again"); }
    { await SH.run({ env, fetchFn: down, state: st, text, ping, now: 1e12 + 6.5 * 3600000 });
      if (texts.length !== 2 || !/^Still: /.test(texts[1] || "")) fail("a database still bad after 6 hours isn't reminded"); }
    { await SH.run({ env, fetchFn: rec(() => J(200, [])), state: st, text, ping, now: 1e12 + 7 * 3600000 });
      if (texts.length !== 3 || !/healthy again/.test(texts[2] || "")) fail("recovery isn't texted once"); }
    { texts.length = 0; const broken = { get: async () => { throw new Error("blobs"); }, set: async () => {} };
      await SH.run({ env, fetchFn: down, state: broken, text, ping }); await SH.run({ env, fetchFn: down, state: broken, text, ping });
      if (texts.length !== 2) fail("with no state kept, a bad hour doesn't text (silence is the worst answer)"); }
    { const o = await SH.run({ env, fetchFn: rec((u) => /rest\/v1/.test(u) ? J(503, {}) : J(200, {})), state: mem(), text, ping });
      if (o.verdict !== "unhealthy") fail("a 503 from the database isn't unhealthy"); }
    { const o = await SH.run({ env: { ...env, SUPABASE_MANAGEMENT_TOKEN: "fake-mgmt" }, fetchFn: rec((u) => /api\.supabase\.com/.test(u) ? J(200, [{ name: "db", status: "UNHEALTHY" }, { name: "auth", status: "ACTIVE_HEALTHY" }]) : J(200, [])), state: mem(), text, ping });
      if (o.verdict !== "unhealthy" || !/db UNHEALTHY/.test(o.error || "")) fail("Supabase's own 'db UNHEALTHY' isn't red"); }
  }

  // ── 3 nothing restarts Supabase ───────────────────────────────────────────────────────────────────────────────────────────
  for (const root of [path.join(site, "netlify/functions"), path.join(site, "shared"), path.join(site, "admin"), path.join(site, "portal"), path.join(site, "scripts"), path.join(scr, "scripts")]) {
    for (const f of walk(root)) {
      const code = codeLines(fs.readFileSync(f, "utf8")).map((x) => x.l).join("\n");
      if (/\/v1\/projects\/[^\n"'`]*\/restart|supabase\.com[^\n]*\/restart|projects\/\$\{[^}]+\}\/restart/.test(code)) fail(`${path.relative(path.dirname(root), f)} calls a Supabase restart: a restart always waits for Chris's OK`);
    }
  }

  // ── 4 the sign-in emails ──────────────────────────────────────────────────────────────────────────────────────────────────
  const ML = load("magic-link-delivery.js");
  if (!ML || typeof ML.check !== "function") fail("magic-link-delivery.js is missing: sign-in emails that don't arrive reach no one");
  else {
    const now = Date.parse("2026-11-11T18:00:00Z"), ago = (h) => new Date(now - h * 3600000).toISOString();
    const env = { RESEND_API_KEY: "re_fake" };
    const list = (rows) => rec(() => J(200, { object: "list", data: rows }));
    { const f = list([{ to: ["owner@client-one.com"], created_at: ago(2), last_event: "delivered" }, { to: ["pat@client-two.com"], created_at: ago(3), last_event: "bounced" }]);
      const o = await ML.check({ env, fetchFn: f, now });
      if (o.ok !== false || !/did not arrive/.test(o.error || "")) fail("a bounced sign-in email isn't red");
      if (/client-one|client-two|@/.test(JSON.stringify(o))) fail("an email address leaves the check (counts only)");
      if (f.calls.length !== 1 || f.calls[0].method !== "GET" || !/api\.resend\.com\/emails/.test(f.calls[0].url)) fail("the check isn't one GET of Resend's email log (it must never send)"); }
    { const o = await ML.check({ env, fetchFn: list([{ created_at: ago(1), last_event: "delivered" }, { created_at: ago(5), last_event: "opened" }, { created_at: ago(30), last_event: "bounced" }]), now });
      if (o.ok !== true || o.sent !== 2) fail("all delivered in 24 hours isn't OK (or a bounce older than a day is counted)"); }
    { const o = await ML.check({ env, fetchFn: list([{ created_at: ago(3), last_event: "delivery_delayed" }]), now });
      if (o.ok !== false) fail("a sign-in email delayed over 2 hours isn't red"); }
    { const o = await ML.check({ env, fetchFn: list([{ created_at: ago(4), last_event: "complained" }]), now });
      if (o.ok !== false) fail("a complaint isn't red"); }
    { const o = await ML.check({ env: {}, fetchFn: list([]), now });
      if (o.ok !== false || !/Not set up/.test(o.error || "")) fail("no Resend key reads as fine; an absence is never fine"); }
    { const o = await ML.check({ env, fetchFn: rec(() => J(401, { name: "restricted_api_key", message: "This API key is restricted to only send emails" })), now });
      if (o.ok !== false || !/full-access key/.test(o.error || "")) fail("a send-only Resend key isn't said as needing a full-access key"); }
  }

  // ── 5 scheduled, listed, wrapped ──────────────────────────────────────────────────────────────────────────────────────────
  const toml = W("netlify.toml") || "";
  let JOBS = []; try { JOBS = req("./_job-manifest.js").JOBS; } catch { /* said below */ }
  for (const j of ["cloud-billing-probe", "supabase-health", "magic-link-delivery"]) {
    const m = new RegExp(`\\[functions\\."${j}"\\]\\s*\\n\\s*schedule\\s*=\\s*"([^"]+)"`).exec(toml), on = JOBS.find((x) => x.job === j);
    if (!m || !on || on.cron !== m[1]) fail(`${j} isn't scheduled in netlify.toml with the job list's cron`);
    if (!new RegExp(`exports\\.handler = require\\("\\./_job-checkin"\\)\\.withCheckin\\("${j}", exports\\.handler\\);\\s*$`).test(W(`netlify/functions/${j}.js`) || "")) fail(`${j} isn't wrapped by withCheckin as the handler that ships`);
  }
  if (/_places-budget|take\(/.test(W("netlify/functions/cloud-billing-probe.js") || "") && /take\(/.test(W("netlify/functions/cloud-billing-probe.js") || "")) fail("the billing probe spends the Places SearchText budget");
  return F;
}

// AbortSignal.timeout timers are unref'd: something must keep the process alive while a fake read waits out its 2-second budget
setInterval(() => {}, 1000);
try {
  await runTwoRepoGate({ name: "check-the-blind-spots-are-probed", siteBefore: "c621cc35", scrBefore: "686467af", checkTree, minBefore: 4 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
