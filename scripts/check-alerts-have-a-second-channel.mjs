#!/usr/bin/env node
// check-alerts-have-a-second-channel.mjs: NO ALERT RIDES ON ONE PATH (runbooks + automation clock master pages, approved 11-11: "A Quo text
// ... for every red that matters", "Add a free outside ping that job-watcher calls hourly", "alerts go to RGA only").
// Every alert went by one email through RGA's Gmail grant: a revoked grant couldn't email that it was revoked (runbook 8b), and if
// Netlify stopped, the watcher and every cloud job stopped together with nothing outside noticing.
// HOLDS, on the WEBSITE repo, with fakes only (no text, email or ping is ever sent; no key is read):
//   1  _alert-text: a text goes ONLY to RGA's business line (+14242422040), from a second Quo number; off unless QUO_TEXTS_ENABLED=1,
//      off without the key or the second number, off when "from" is the Main Line itself (a line can't text itself), and a personal
//      cell is refused by hash; Chris's personal cell appears nowhere in the code in plain text; one POST to Quo, "RGA alert:", no em
//      dash, at most 300 characters; a Quo refusal or no answer is "not sent" with why, never a throw.
//   2  job-watcher's real notify, with Gmail faked: a failed email (a revoked grant) is texted and counts as delivered "via ...text"; the
//      always-text jobs (RGA's grant, Cloud billing, sign-in emails) are texted even when emailed; an ordinary emailed alert is not;
//      with texts off and email failed, the alert is NOT delivered and says why (text: ...); the alert email goes to an RGA inbox only,
//      whatever RGA_NOTIFICATION_EMAIL says.
//   3  _outside-ping: a run that worked pings the URL, one that couldn't pings <url>/fail, an unset or malformed URL is "not set up" and
//      makes no request; job-watcher pings after every compare and pings /fail when it couldn't read the check-ins; the job list's
//      watcher line says the outside watcher's state in words.
// PROVES ITSELF: it must fail on the before state (website c621cc35, scraper 686467af) in 4+ places, else exit 2.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runTwoRepoGate, rd } from "./lib/two-repo-gate.mjs";
import { codeLines } from "./lib/site-rev.mjs";

const BUSINESS = "+14242422040", ALERT_FROM = "+13105550100";
const fakeFetch = (rules) => { const calls = []; const f = async (url, init = {}) => { calls.push({ url: String(url), method: init.method || "GET", body: init.body }); for (const [re, res] of rules) if (re.test(String(url))) return typeof res === "function" ? res(url, init) : res; return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" }; }; f.calls = calls; return f; };
const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

async function checkTree(site, scr, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), W = rd(site);
  const req = createRequire(path.join(site, "netlify/functions/x.js"));
  // ── 0 the personal cell is nowhere in the code ───────────────────────────────────────────────────────────────────────────
  for (const dir of ["netlify/functions", "shared", "admin", "portal"]) {
    let files = []; try { files = fs.readdirSync(path.join(site, dir)).filter((f) => /\.(js|mjs|html)$/.test(f)); } catch { continue; }
    // code, not comments: a comment that quotes a number as an example sends nothing (portal-deliverables.js:540)
    for (const f of files) if (/424\W{0,2}396\W?8499|4243968499/.test(codeLines(W(`${dir}/${f}`) || "").map((x) => x.l.replace(/\s\/\/ .*$/, "")).join("\n"))) fail(`${dir}/${f} carries Chris's personal cell in plain text (the owner 11-11: never use it for anything)`);
  }
  // ── 1 _alert-text ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  let AT = null;
  try { AT = req("./_alert-text.js"); } catch { fail("netlify/functions/_alert-text.js is missing: alerts have no second channel"); }
  if (AT) {
    const base = { QUO_TEXTS_ENABLED: "1", QUO_API_KEY: "fake-quo-key", QUO_ALERT_FROM_NUMBER: ALERT_FROM };
    const P = (env) => AT.textPlan(env);
    if (P({ ...base, QUO_TEXTS_ENABLED: "" }).on !== false) fail("alert texts go out without QUO_TEXTS_ENABLED=1");
    if (P({ ...base, QUO_API_KEY: "" }).on !== false) fail("alert texts are 'on' with no Quo key");
    if (P({ ...base, QUO_ALERT_FROM_NUMBER: "" }).on !== false || !/second Quo number/.test(P({ ...base, QUO_ALERT_FROM_NUMBER: "" }).why || "")) fail("with no second Quo number the plan doesn't say texts wait for one");
    if (P({ ...base, QUO_ALERT_FROM_NUMBER: "(424) 242-2040" }).on !== false) fail("an alert text would be sent from the Main Line to itself (a line can't text itself)");
    if (P({ ...base, QUO_ALERT_FROM_NUMBER: "424 396 8499" }).on !== false) fail("Chris's personal cell is accepted as the alert number");
    const on = P({ ...base, RGA_ALERT_TEXT_TO: "+13105559999", ALERT_TEXT_TO: "+13105559999", QUO_ALERT_TO_NUMBER: "+13105559999" });
    if (on.on !== true || on.to !== BUSINESS || on.from !== ALERT_FROM) fail(`the text doesn't go to RGA's business line only (to=${on.to}, from=${on.from}); a setting could point it at someone else`);
    if (!(AT.NEVER_TEXT instanceof Set) || !AT.NEVER_TEXT.has(AT.hashOf("14243968499"))) fail("the personal cell isn't on the never-text list");
    { const f = fakeFetch([[/openphone/, ok({ data: {} })]]);
      const r = await AT.sendAlertText("Billing check: Failed — the run died", { env: base, fetchFn: f });
      const posts = f.calls.filter((c) => c.method === "POST");
      const b = posts[0] ? JSON.parse(posts[0].body) : {};
      if (r.sent !== true || posts.length !== 1 || !/api\.openphone\.com\/v1\/messages$/.test(posts[0].url)) fail("one alert text isn't one POST to Quo's messages");
      else {
        if (JSON.stringify(b.to) !== JSON.stringify([BUSINESS]) || b.from !== ALERT_FROM) fail(`the text went to ${JSON.stringify(b.to)} from ${b.from}`);
        if (!/^RGA alert: /.test(b.content || "") || /—/.test(b.content || "") || (b.content || "").length > 300) fail(`the text isn't "RGA alert: ...", short, no em dash (${String(b.content).slice(0, 60)})`);
      } }
    { const f = fakeFetch([[/openphone/, { ok: false, status: 401, json: async () => ({ message: "Unauthorized" }) }]]);
      const r = await AT.sendAlertText("x", { env: base, fetchFn: f });
      if (r.sent !== false || !/Quo 401/.test(r.why || "")) fail("a Quo refusal isn't 'not sent' with Quo's answer"); }
    { let threw = false, r; try { r = await AT.sendAlertText("x", { env: base, fetchFn: async () => { throw new Error("ECONNRESET"); } }); } catch { threw = true; }
      if (threw || !r || r.sent !== false) fail("Quo not answering throws into the caller (an alert path must never throw)"); }
    { const f = fakeFetch([]); const r = await AT.sendAlertText("x", { env: { ...base, QUO_TEXTS_ENABLED: "0" }, fetchFn: f });
      if (r.sent !== false || f.calls.length) fail("with texts off a request still went to Quo"); }
    for (const j of ["integration-watch", "cloud-billing-probe", "magic-link-delivery"]) if (!AT.ALWAYS_TEXT || !AT.ALWAYS_TEXT.has(j)) fail(`${j} (a blind spot) isn't texted when it goes red`);
  }

  // ── 2 job-watcher's real notify, Gmail faked ─────────────────────────────────────────────────────────────────────────────
  const wsrc = W("netlify/functions/job-watcher.js");
  if (!wsrc) { fail("job-watcher.js moved"); return F; }
  const gmailPath = req.resolve("./_gmail.js");
  const saved = { ...process.env }, savedFetch = globalThis.fetch;
  let mode = "fail", sentTo = [];
  try {
    req("./_deadline.js");
    req.cache[gmailPath] = { id: gmailPath, filename: gmailPath, loaded: true, exports: { sendAsRga: async ({ to }) => { sentTo.push(to); if (mode === "fail") throw new Error("RGA's Google grant is revoked or expired, reconnect"); return { id: "m1" }; } } };
    const jwPath = req.resolve("./job-watcher.js"); delete req.cache[jwPath];
    const JW = req("./job-watcher.js");
    Object.assign(process.env, { SUPABASE_URL: "https://fake.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake-service", INTERNAL_FN_SECRET: "fake-secret", QUO_TEXTS_ENABLED: "1", QUO_API_KEY: "fake-quo-key", QUO_ALERT_FROM_NUMBER: ALERT_FROM, RGA_NOTIFICATION_EMAIL: "owner@gmail.com" });
    const go = async (job, m, env = {}) => {
      mode = m; sentTo = []; Object.assign(process.env, env);
      const f = fakeFetch([[/notify-rga/, ok({ delivered: false })], [/openphone/, ok({})], [/\/rest\/v1\/clients/, ok([{ id: "rga" }])]]);
      globalThis.fetch = f;
      const res = await JW.realDeps().notify(job, { label: "Google Cloud billing", tag: "Failed", line: "Places said billing is off" }, "text");
      return { res, texts: f.calls.filter((c) => /openphone/.test(c.url)), sentTo: [...sentTo] };
    };
    { const { res, texts } = await go("gbp-posts-sweep", "fail");
      if (texts.length !== 1) fail("an alert whose email failed (a revoked grant) isn't texted");
      else if (res.delivered !== true || !/text/.test(res.via || "")) fail(`a texted alert isn't counted as delivered via text (${JSON.stringify(res).slice(0, 100)})`);
      else if (JSON.parse(texts[0].body).to[0] !== BUSINESS) fail("the watcher's text didn't go to RGA's business line"); }
    { const { texts, sentTo: to } = await go("gbp-posts-sweep", "ok");
      if (texts.length) fail("an ordinary alert that was emailed is texted too (texts are for the reds that matter)");
      if (to[0] !== "hello@rocketgrowthagency.com") fail(`the alert email went to ${to[0]}: a setting outside rocketgrowthagency.com must fall back to hello@`); }
    { const { texts } = await go("cloud-billing-probe", "ok");
      if (texts.length !== 1) fail("a Cloud billing red is not texted when it was emailed (it's a blind spot: always texted)"); }
    { const { res } = await go("gbp-posts-sweep", "fail", { QUO_TEXTS_ENABLED: "0" });
      if (res.delivered !== false || !/text:/.test(res.error || "")) fail("with email failed and texts off the alert reads delivered, or doesn't say why the text didn't go"); }
    { const { sentTo: to } = await go("gbp-posts-sweep", "ok", { RGA_NOTIFICATION_EMAIL: "ops@rocketgrowthagency.com" });
      if (to[0] !== "ops@rocketgrowthagency.com") fail("an RGA inbox named in RGA_NOTIFICATION_EMAIL isn't used"); }
  } catch (e) { fail(`job-watcher's notify couldn't be run on fakes: ${String(e.message).slice(0, 140)}`); }
  finally { globalThis.fetch = savedFetch; for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); delete req.cache[gmailPath]; }

  // ── 3 the outside ping ────────────────────────────────────────────────────────────────────────────────────────────────────
  let OP = null;
  try { OP = req("./_outside-ping.js"); } catch { fail("netlify/functions/_outside-ping.js is missing: nothing outside Netlify watches the watcher"); }
  if (OP) {
    { const f = fakeFetch([]); const r = await OP.pingOutside("https://hc-ping.com/abc-123", { ok: true, fetchFn: f });
      if (r !== "sent" || f.calls.length !== 1 || f.calls[0].url !== "https://hc-ping.com/abc-123") fail("a good run doesn't ping the outside URL"); }
    { const f = fakeFetch([]); await OP.pingOutside("https://hc-ping.com/abc-123", { ok: false, fetchFn: f });
      if (!f.calls[0] || f.calls[0].url !== "https://hc-ping.com/abc-123/fail") fail("a run that couldn't do its job doesn't ping /fail"); }
    for (const u of ["", undefined, "not a url", "http://hc-ping.com/x"]) { const f = fakeFetch([]); const r = await OP.pingOutside(u, { fetchFn: f });
      if (r !== "not set up" || f.calls.length) fail(`an unset or bad ping URL (${JSON.stringify(u)}) isn't "not set up", or still made a request`); }
    { const r = await OP.pingOutside("https://hc-ping.com/x", { fetchFn: async () => { throw new Error("down"); } });
      if (r !== "failed") fail("a ping that couldn't be sent isn't 'failed'"); }
  }
  const handler = wsrc.slice(wsrc.indexOf("exports.handler = async"));
  const code = codeLines(handler).map((x) => x.l).join("\n");
  if (!/pingOutside\(process\.env\.JOB_WATCHER_PING_URL/.test(code)) fail("job-watcher never pings the outside watcher");
  if (!/catch \(e\) \{[^\n]*await ping\(false\)/.test(code)) fail("job-watcher doesn't ping /fail when it can't read the check-ins");
  if (!/const out = await runWatch\([\s\S]*?const outside_ping = await ping\(true\)/.test(code)) fail("job-watcher doesn't ping after it compared the jobs");
  try {
    const M = req("./_job-manifest.js"); const w = M.byName("job-watcher");
    const n = w && w.read({ jobs: 40, alerts_sent: 0, outside_ping: "not set up", texts: "Texts are off" }).note || "";
    if (!/outside watcher: not set up yet/.test(n) || !/texts: Texts are off/.test(n)) fail(`the watcher's System health line doesn't say the outside watcher and texts state ("${n.slice(0, 100)}")`);
  } catch (e) { fail(`the job list won't load: ${String(e.message).slice(0, 80)}`); }
  return F;
}

try {
  await runTwoRepoGate({ name: "check-alerts-have-a-second-channel", siteBefore: "c621cc35", scrBefore: "686467af", checkTree, minBefore: 4 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
