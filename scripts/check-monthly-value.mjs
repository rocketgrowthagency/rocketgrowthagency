#!/usr/bin/env node
// check-monthly-value.mjs — 2026-10-31. The client's monthly card "What we watched for you" (approved reports/mockups/client_monthly_value_v1.html,
// Chris 10-31). RUNS the real code: _monthly-value.js (every shape), _site-check.js (addresses + fake network), the portal's ogValueRow (vm).
//   · every line is a recorded reading with its date, or an "off" line that SAYS it wasn't read: never a green tick for something nobody
//     checked, never a 0 for something nobody counted (feedback_an_absence_must_never_be_readable_as_a_value)
//   · Google's numbers past the 30-day keep are left out, not shown as 0 (_gbp-keep.js)
//   · the website check refuses localhost / private / metadata addresses, never calls a failed lookup "up", never turns a missing certificate into 0 days
//   · READ ONLY: nothing here writes to Google or the client's site, emails anyone, or asks Google for more quota
//   · the new job is bounded (one row a client a day, a cap and a time budget), scheduled, and in the job manifest; no schema change (no monthly_value.sql)
//   · the card is the approved one: With RGA · Every month, "What we watched for you in <month>", the event rows of the card system, no em dash
// Businesses are NOT RGA: no website, no Google, a plumber in Denver, a dentist in Toronto, an accented name, a site typed in capitals.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 indeterminate (code moved)
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(import.meta.url);
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — ${w} moved; re-read it before trusting this gate`); process.exit(2); };

const P = read("portal/portal.js"), IDX = read("portal/index.html");
const MV_SRC = read("netlify/functions/_monthly-value.js"), SC_SRC = read("netlify/functions/_site-check.js"), SW_SRC = read("netlify/functions/site-watch.js"), PV_SRC = read("netlify/functions/portal-monthly-value.js");
const MAN = read("netlify/functions/_job-manifest.js"), TOML = read("netlify.toml");
const MOCK = read("reports/mockups/client_monthly_value_v1.html");
let MV, SC;
try { MV = req(`${SITE}/netlify/functions/_monthly-value.js`); SC = req(`${SITE}/netlify/functions/_site-check.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — the modules don't load (${e.message})`); process.exit(2); }

// ── 1 · the lines: every shape ──
const NOW = new Date("2026-10-31T18:00:00Z"), MONTH = "2026-10-01";
const base = (o = {}) => ({ month: MONTH, now: NOW, website_url: "", google_connected: false, google_watched: false, activity: [], watch: { table_ready: false, runs: [] }, site_checks: null, record: null, speed: null, ...o });
const build = (o) => MV.buildMonthlyValue(base(o));
const by = (v, k) => v.lines.find((l) => l.key === k);
const runs = (n) => Array.from({ length: n }, (_, i) => ({ finished_at: `2026-10-${String(i + 1).padStart(2, "0")}T10:31:00Z`, ok: true }));
const checks = (n, p = {}) => Array.from({ length: n }, (_, i) => ({ created_at: `2026-10-${String(i + 1).padStart(2, "0")}T12:16:00Z`, payload: { up: true, status: 200, https: true, ssl_days: 60, ...p } }));
const WIRED = { website_url: "https://www.denver-plumbing.example", google_connected: true, google_watched: true, watch: { table_ready: true, runs: runs(30) }, site_checks: { ready: true, rows: checks(30) } };

// nothing set up at all (no website, no Google): every line is off and SAYS why; no tick, no number
{ const v = build({});
  for (const l of v.lines) if (l.mark !== "off") fail(`no website, no Google: "${l.key}" is "${l.mark}", must be off (nobody checked anything)`);
  if (!/not connected/i.test((by(v, "google_profile") || {}).text || "")) fail("no Google connection: the profile line doesn't say it isn't connected");
  if (!/don't have one/i.test((by(v, "website") || {}).text || "")) fail("no website: the line doesn't say there is none (and must not be an error)");
  if (by(v, "speed")) fail("no website: a site-speed line appears");
  if (v.lines.some((l) => /\b0\b/.test(l.text) && l.mark === "ok")) fail("an off reading shows a 0");
  if (v.lines.some((l) => /undefined|NaN|null/.test(l.text))) fail("a line prints undefined / NaN / null"); }
// everything wired and fine
{ const v = build({ ...WIRED, record: { reporting_month: MONTH, new_reviews: 3, total_calls: 20, form_leads: 6, data: { metrics_refreshed_at: "2026-10-30T06:00:00Z" } }, speed: { captured_at: "2026-10-12T08:00:00Z", payload: { lcp_ms: 2140 } } });
  const g = by(v, "google_profile"); if (!g || g.mark !== "ok" || !/30 nights/.test(g.text) || !g.when) fail(`wired profile: ${JSON.stringify(g)}`);
  const r = by(v, "reviews"); if (!r || r.mark !== "ok" || !/3 new reviews/.test(r.text) || !r.when) fail(`reviews: ${JSON.stringify(r)}`);
  const w = by(v, "website"); if (!w || w.mark !== "ok" || !/up on all 30 checks/.test(w.text) || !/60 more days/.test(w.text) || !w.when) fail(`website: ${JSON.stringify(w)}`);
  const s = by(v, "speed"); if (!s || s.mark !== "ok" || !/2\.1 seconds/.test(s.text)) fail(`speed: ${JSON.stringify(s)}`);
  const l = by(v, "leads"); if (!l || l.mark !== "ok" || !/20 leads/.test(l.text)) fail(`leads: ${JSON.stringify(l)}`);
  if (!v.in_progress || v.month_name !== "October") fail(`month: ${v.month_name} / in_progress ${v.in_progress}`);
  { const past = build({ ...WIRED, month: "2026-09-01" }); if (past.in_progress !== false || past.month_name !== "September") fail(`a finished month says ${past.month_name} / in_progress ${past.in_progress}`); }
  if (new Set(v.lines.map((x) => x.key)).size !== v.lines.length) fail("a line appears twice"); }
// Google changed something: the line says so, with the day, and names the thing
{ const v = build({ ...WIRED, activity: [{ kind: "gbp_changed_on_google", created_at: "2026-10-12T10:31:00Z", payload: { answer: { what: "weekly hours" } } }] });
  const g = by(v, "google_profile"); if (!g || g.mark !== "rga" || !/weekly hours/.test(g.text) || !/^2026-10-12/.test(g.when || "")) fail(`a Google change: ${JSON.stringify(g)}`);
  const v2 = build({ ...WIRED, activity: [{ kind: "gbp_changed_on_google", created_at: "2026-09-28T10:31:00Z", payload: { answer: { what: "weekly hours" } } }] });
  if (by(v2, "google_profile").mark !== "ok") fail("a change from LAST month shows in this month's card");
  const v3 = build({ ...WIRED, activity: [{ kind: "gbp_booking_removed", created_at: "2026-10-05T10:31:00Z", payload: {} }, { kind: "core_main_category_changed", created_at: "2026-10-06T10:31:00Z", payload: {} }] });
  if (!/2 things/.test(by(v3, "google_profile").text)) fail("two changes aren't both named"); }
// the watch didn't run / can't be read / watches nothing: never "checked, all fine"
{ for (const [name, o] of [["table not set up", { watch: { table_ready: false, runs: runs(5) } }], ["no runs this month", { watch: { table_ready: true, runs: [] } }], ["only failed runs", { watch: { table_ready: true, runs: runs(5).map((r) => ({ ...r, ok: false })) } }], ["runs from last month", { watch: { table_ready: true, runs: [{ finished_at: "2026-09-30T10:31:00Z", ok: true }] } }]]) {
    const g = by(build({ ...WIRED, ...o }), "google_profile"); if (g.mark !== "off" || /nothing changed|checked nightly/.test(g.text)) fail(`${name}: the profile line says "${g.text}" (${g.mark})`); }
  const g = by(build({ ...WIRED, google_watched: false }), "google_profile"); if (g.mark !== "off" || !/nothing is watched/.test(g.text)) fail("connected but nothing Done on Google: the line claims a watch"); }
// website
{ const w = (rows, extra = {}) => by(build({ ...WIRED, site_checks: { ready: true, rows }, ...extra }), "website");
  if (w([]).mark !== "off" || !/no check has run/.test(w([]).text)) fail("no checks this month: the website line claims something");
  if (by(build({ ...WIRED, site_checks: null }), "website").mark !== "off") fail("check store unreadable: not off");
  if (w([...checks(2), { created_at: "2026-10-03T12:16:00Z", payload: { up: false, status: 503, https: true, ssl_days: 60 } }]).mark !== "rga") fail("a down day isn't flagged");
  if (!/down on 1 of 3/.test(w([...checks(2), { created_at: "2026-10-03T12:16:00Z", payload: { up: false, https: true, ssl_days: 60 } }]).text)) fail("down count wrong");
  if (w(checks(3, { ssl_days: 5 })).mark !== "rga" || !/5 days/.test(w(checks(3, { ssl_days: 5 })).text)) fail("a certificate 5 days out isn't flagged");
  if (w(checks(3, { ssl_days: -2 })).mark !== "rga") fail("an expired certificate isn't flagged");
  if (w(checks(3, { https: false, ssl_days: null })).mark !== "rga" || !/no security certificate/.test(w(checks(3, { https: false, ssl_days: null })).text)) fail("an http-only site isn't flagged");
  const unknown = w(checks(3, { ssl_days: null })); if (unknown.mark !== "ok" || /certificate/.test(unknown.text)) fail(`an unreadable certificate date is claimed or flagged: ${unknown.text}`);
  if (w([{ created_at: "2026-09-30T12:16:00Z", payload: { up: true, https: true, ssl_days: 60 } }]).mark !== "off") fail("last month's check counts for this month"); }
// reviews + Google's 30-day keep
{ const rv = (rec, o = {}) => by(build({ ...WIRED, record: rec, ...o }), "reviews");
  if (rv({ reporting_month: MONTH, new_reviews: 0, data: {} }).mark !== "ok" || /\b0 new/.test(rv({ reporting_month: MONTH, new_reviews: 0, data: {} }).text) === false && !/no new/.test(rv({ reporting_month: MONTH, new_reviews: 0, data: {} }).text)) fail("zero new reviews reads wrong");
  const none = rv({ reporting_month: MONTH, new_reviews: null, data: {} }); if (none.mark !== "off" || /\d/.test(none.text)) fail(`a missing review count shows as a number: ${none.text}`);
  if (rv(null).mark !== "off") fail("no monthly record: reviews not off");
  if (by(build({ ...WIRED, month: "2026-08-01", record: { reporting_month: "2026-08-01", new_reviews: 4, data: {} } }), "reviews")) fail("a month past the 30-day keep still shows a review count");
  const nog = by(build({ record: { reporting_month: MONTH, new_reviews: null, data: {} } }), "reviews"); if (!/isn't connected/.test(nog.text)) fail("reviews without Google don't say so"); }
// leads + speed
{ const ld = (rec) => by(build({ ...WIRED, record: rec }), "leads");
  if (ld({ total_calls: null, form_leads: null, data: {} }).mark !== "off" || /\d/.test(ld({ total_calls: null, form_leads: null, data: {} }).text)) fail("no lead count shows a number");
  if (ld({ total_calls: 0, form_leads: 0, data: {} }).mark === "ok") fail("zero leads is a green tick");
  if (!/6 leads/.test(ld({ total_calls: null, form_leads: 6, data: {} }).text)) fail("forms alone aren't counted");
  const sp = (s) => by(build({ ...WIRED, speed: s }), "speed");
  if (sp(null).mark !== "off") fail("no speed reading: not off");
  if (sp({ captured_at: "2026-09-12T08:00:00Z", payload: { lcp_ms: 1200 } }).mark !== "off") fail("last month's speed reading shows this month");
  if (sp({ captured_at: "2026-10-12T08:00:00Z", payload: { lcp_ms: null } }).mark !== "off") fail("a null speed is shown as a reading");
  if (sp({ captured_at: "2026-10-12T08:00:00Z", payload: { lcp_ms: 4100 } }).mark === "ok") fail("a 4.1 second site is a green tick"); }

// ── 2 · the site check: addresses + a fake network ──
{ const n = SC.normalize;
  for (const bad of ["", "   ", "localhost", "http://localhost:8888", "127.0.0.1", "http://10.0.0.5/admin", "http://192.168.1.1", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "javascript:alert(1)", "file:///etc/passwd", "ftp://x.com", "http://user:pw@example.com", "intranet", "http://100.64.0.1", "http://[fd00::1]/", "http://[::ffff:10.0.0.1]/", "printer.local"]) if (!n(bad).error) fail(`normalize accepts "${bad}"`);
  for (const [raw, host] of [["example.com", "example.com"], ["  HTTP://WWW.Example.COM/Home  ", "www.example.com"], ["https://café-dentiste.ca/", "xn--caf-dentiste-deb.ca"], ["denver-plumbing.example/a?b=1#c", "denver-plumbing.example"]]) { const r = n(raw); if (r.error || r.host !== host) fail(`normalize("${raw}") -> ${JSON.stringify(r)}`); }
  const DAY = 864e5, t0 = Date.parse("2026-10-31T12:00:00Z");
  const d = (o = {}) => ({ now: () => t0, lookup: async () => [{ address: "93.184.216.34" }], get: async () => ({ status: 200 }), cert: async () => ({ valid_to: new Date(t0 + 40 * DAY + 3600e3).toUTCString(), authorized: true }), ...o });
  const run = async (url, o) => SC.checkSite(url, d(o));
  const a = await run("example.com"); if (!a.checked || !a.up || a.ssl_days !== 40 || a.ssl_ok !== true || a.https !== true) fail(`a healthy site: ${JSON.stringify(a)}`);
  const priv = await run("example.com", { lookup: async () => [{ address: "10.0.0.7" }] }); if (priv.checked) fail("a name that resolves to a private address is fetched (DNS rebinding)");
  let hit = false; await run("http://127.0.0.1/", { get: async () => { hit = true; return { status: 200 }; } }); if (hit) fail("a private address was fetched");
  const nores = await run("example.com", { lookup: async () => { throw new Error("ENOTFOUND"); } }); if (!nores.checked || nores.up !== false) fail(`a name that doesn't resolve: ${JSON.stringify(nores)} (must be a real "down")`);
  const e503 = await run("example.com", { get: async () => ({ status: 503 }) }); if (e503.up !== false) fail("a 503 is up");
  const e404 = await run("example.com", { get: async () => ({ status: 404 }) }); if (e404.up !== true) fail("a 404 on the home page is called down (the server answered)");
  const thr = await run("example.com", { get: async () => { throw new Error("timeout"); } }); if (thr.up !== false) fail("a timeout is up");
  const nocert = await run("example.com", { cert: async () => { throw new Error("no certificate"); } }); if (nocert.ssl_days !== null || nocert.ssl_ok !== null) fail(`an unreadable certificate became ${nocert.ssl_days}`);
  const badcert = await run("example.com", { cert: async () => ({ valid_to: "not a date", authorized: true }) }); if (badcert.ssl_days !== null) fail("an unparseable certificate date became a number");
  const old = await run("example.com", { cert: async () => ({ valid_to: new Date(t0 - 3 * DAY).toUTCString(), authorized: true }) }); if (old.ssl_ok !== false || old.ssl_days >= 0) fail(`an expired certificate: ${JSON.stringify(old)}`);
  const unauth = await run("example.com", { cert: async () => ({ valid_to: new Date(t0 + 40 * DAY).toUTCString(), authorized: false }) }); if (unauth.ssl_ok !== false) fail("an untrusted certificate is ok");
  const plain = await run("http://example.com"); if (plain.https !== false || plain.ssl_days !== null) fail("an http site gets a certificate reading"); }

// ── 3 · the job: read only, bounded, scheduled, listed, no schema change ──
{ const strip = (s) => s.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  for (const [name, src] of [["_monthly-value.js", MV_SRC], ["_site-check.js", SC_SRC], ["site-watch.js", SW_SRC], ["portal-monthly-value.js", PV_SRC]]) {
    const code = strip(src);
    if (/notify-rga|notifyRga|sendEmail|resend|nodemailer|mailgun|postmark/i.test(code)) fail(`${name} can email or alert someone`);
    if (/googleapis\.com|business\.google|mybusiness|oauth2/i.test(code)) fail(`${name} calls Google`);
    if (/method:\s*["'](PATCH|PUT|DELETE)["']/.test(code)) fail(`${name} changes or deletes rows`);
    if (/\bGBP_|applyForStep|writeStepTasks/.test(code)) fail(`${name} reaches the Google write path`); }
  if (/\bmethod:|\.insert\(|Prefer:/.test(strip(PV_SRC))) fail("portal-monthly-value writes something (it must only read)");
  if (!/MAX_PER_RUN\s*=\s*\d+/.test(SW_SRC) || !/TIME_BUDGET_MS\s*=\s*\d+/.test(SW_SRC) || !/doneToday/.test(SW_SRC) || !/kind=eq\.site_check&created_at=gte/.test(SW_SRC)) fail("site-watch isn't bounded: one row a client a day, a cap, a time budget");
  if (!/withCheckin\("site-watch"/.test(SW_SRC)) fail("site-watch doesn't check in (system health)");
  if (!/\[functions\."site-watch"\]\s*\n\s*schedule = "15 12 \* \* \*"/.test(TOML)) fail("site-watch isn't scheduled daily in netlify.toml");
  if (!/job: "site-watch"[^\n]*cron: "15 12 \* \* \*"/.test(MAN)) fail("site-watch isn't in the job manifest with the same schedule");
  if (fs.existsSync(`${SITE}/supabase/monthly_value.sql`)) fail("a schema change appeared; this card needs none (new tables go to Chris as one SQL file, not run)");
  if (/portal\/portal\.js/.test(SW_SRC)) fail("site-watch touches the portal"); }

// ── 4 · the card in the portal ──
{ const m = /^function ogValueRow\(d\) \{[\s\S]*?\n\}\n/m.exec(P); if (!m) moved("function ogValueRow");
  const ia = P.indexOf("const ogRowHtml = "), ib = P.indexOf("const _ogData = "), kx = /^const ogK5 = [^\n]*$/m.exec(P), md = /^const monthDay = [^\n]*$/m.exec(P);
  if (ia < 0 || ib < 0 || !kx || !md) moved("the Ongoing row pieces");
  const ctx = vm.createContext({ Date, JSON, Number, Set, Map, Array, String, Object, Math, RegExp, Intl, Boolean, parseInt, isNaN, console,
    escapeHtml: (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;") });
  const hand = P.slice(P.indexOf("const PC_TICK = "), P.indexOf("\n", P.indexOf("const pcActs = ")));
  try { vm.runInContext([md[0].replace(/^const /, "var "), hand, csBlock(P, hand), kx[0].replace(/^const /, "var "), P.slice(ia, ib).replace(/^const /gm, "var "), m[0]].join("\n"), ctx); } catch (e) { console.error(`⚠️  INDETERMINATE — the card doesn't load (${e.message})`); process.exit(2); }
  const draw = (d) => { ctx.__d = d; return vm.runInContext("ogValueRow(__d)", ctx); };
  const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const v = build({ ...WIRED, record: { reporting_month: MONTH, new_reviews: 3, total_calls: 20, data: { metrics_refreshed_at: "2026-10-30T06:00:00Z" } } });
  const h = draw({ value: { ok: true, ...v } });
  if (!/With RGA/.test(h) || !/Every month/.test(h)) fail("the pills aren't With RGA + Every month");
  if (!/What we watched this month/.test(h)) fail("the row title isn't 'What we watched this month'");
  if (!/What we watched for you in October/.test(text(h))) fail("the band doesn't say 'What we watched for you in October'");
  if (!/pm-cs-card rga/.test(h)) fail("the card isn't the blue RGA card of the mockup");
  if ((h.match(/class="pm-cs-ev"/g) || []).length !== v.lines.length) fail("not one event row per reading");
  if (/so far this month/.test(h) === false) fail("a month in progress doesn't say so");
  const off = draw({ value: { ok: true, ...build({}) } });
  if (/mk ok/.test(off)) fail("a card where nothing was checked has a green mark");
  if (!/mk off/.test(off)) fail("an unchecked line isn't drawn as off");
  const err = draw({ value: { error: true } }); if (/mk ok|class="pm-cs-ev"/.test(err) || !/couldn't read/i.test(text(err))) fail("a failed read shows readings or hides that it failed");
  const busy = draw({}); if (!/Reading/.test(busy) || /mk ok/.test(busy)) fail("the loading state is wrong");
  const evil = draw({ value: { ok: true, month_name: "<b>x</b>", in_progress: false, lines: [{ key: "k", mark: "<script>", text: "<img src=x onerror=1>", when: "2026-10-12T10:00:00Z" }] } });
  if (/<img|<script|<b>x/.test(evil)) fail("the card prints server text unescaped");
  if (!/mk off/.test(evil)) fail("an unknown mark isn't treated as off");
  // two hosts (after setup), a loader that reads, and nothing paints in the setup phase
  if ((P.match(/ogHost\("value"\)/g) || []).length !== 2) fail("the value card host isn't in both after-setup layouts");
  if (/startsAfter[^\n]*ogHost\("value"\)/.test(P)) fail("the card shows during setup");
  if (!/month2Only\) ogSet[^\n]*\n\s*loadMonthlyValue\(clientId\);/.test(P) || !/\/\.netlify\/functions\/portal-monthly-value/.test(P)) fail("the portal never asks for the card");
  if (/portal-monthly-value[\s\S]{0,400}method:\s*"(PATCH|PUT|DELETE)"/.test(P)) fail("the card's loader writes");
  if (!/\?v=[0-9]{8}[a-z]"/.test(IDX.match(/portal\/portal\.js\?v=[^"]*"/)?.[0] || "")) fail("portal.js has no letter cache-buster"); }
// ── 5 · copy: US English, no em dash, nothing hard-coded ──
{ const copy = [MV_SRC, SC_SRC, PV_SRC, P.slice(P.indexOf("function ogValueRow"), P.indexOf("function paintOngoingExtras"))].map((s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, "")).join("\n")).join("\n");
  if (/[—–]/.test(copy)) fail("an em or en dash in the card's copy");
  if (/\b(colour|neighbour|organis|licence|centre|favour|behaviour)\w*/i.test(copy)) fail("British spelling in the card's copy");
  if (/\b(Sample|sample month|Lorem)\b/.test(copy)) fail("sample wording reached the product");
  if (/\b(11 of 13|14 calls|6 forms|2\.1 seconds|30 times|BBB)\b/.test(copy)) fail("a number from the mockup is hard-coded"); }
// the mockup is the approved one and says what the card lists
if (!/APPROVED/.test(MOCK) || !/What we watched this month/.test(MOCK) || !/What we watched for you in/.test(MOCK)) fail("the approved mockup isn't there or changed its wording");

if (F.length) { console.error(`❌ check-monthly-value: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ check-monthly-value: every line is a recorded reading or says it wasn't read; Google keep honored; site check safe + bounded; card matches the mockup");
