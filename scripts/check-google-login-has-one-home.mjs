#!/usr/bin/env node
// check-google-login-has-one-home.mjs — one place swaps a stored Google key for an access token (approved 11-1: "tidies 30 copies of the same login code into one, so a future bug gets fixed in one place").
// 🔴 WHY: 29 functions each POSTed to Google on their own, in small variations, so a fix had to be remembered 29 times and the next copy would drift again.
// HOLDS: only netlify/functions/_google-token.js POSTs a refresh grant, apart from the named exceptions, each still true; a sealed key is revealed there and a plain one passes through, with RGA's client and one request per call;
// and every merged copy still does what it did: its own refusal words, its null or error-shaped failure, its returned shape, saving the new token only where it saved before.
// RUNS the real functions against a stubbed network. Every request is answered here, every value is fake, and the real .env values are overwritten before anything loads.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. Exit 0 = holds · 1 = broken · 2 = can't tell.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Module, { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const HOME = "_google-token.js";
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — ${w} moved; re-read it before trusting this gate`); process.exit(2); };
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ── who may talk to Google's token address, and why ────────────────────────────────────────────────
// (?!info): Google's tokeninfo only READS which permissions a token carries (_google-token.tokenScopes, 11-11); it swaps no key, so it isn't this address
const ENDPOINT = /oauth2\.googleapis\.com\/token(?!info)|googleapis\.com\/oauth2\/v\d+\/token(?!info)|accounts\.google\.com\/o\/oauth2\/token/g;
const REFRESH_GRANT = /grant_type["']?\s*[:=,]\s*["']?refresh_token/g;
const CODE_GRANT = /grant_type["']?\s*[:=,]\s*["']?authorization_code/g;
const EXCEPTIONS = {
  "_ads-keywords.js": { why: "Google Ads has its own client and its own key from the environment, never a stored key", refresh: 1, code: 0, env: /refresh_token: process\.env\.GOOGLE_ADS_REFRESH_TOKEN/ },
  "_listing-removal-flow.js": { why: "the first step of a sign-in swaps a one-time code; no stored key exists yet", refresh: 0, code: 1 },
  "oauth-google-callback.js": { why: "the first step of the client's and RGA's sign-in swaps a one-time code; no stored key exists yet", refresh: 0, code: 2 },
};
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" ? [] : walk(`${dir}/${e.name}`)) : /\.(js|cjs|mjs|ts)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
if (!fs.existsSync(`${FN}/${HOME}`)) moved(HOME);
const all = walk(FN);
const HOME_FNS = /\b(?:refreshGrant|googleKeyToToken|auditToken|rgaToken|rgaTokenWithDetail)\b/;
let routed = 0;
const seen = new Set();
for (const p of all) {
  const f = path.relative(FN, p), s = code(fs.readFileSync(p, "utf8"));
  const hits = (s.match(ENDPOINT) || []).length, grants = (s.match(REFRESH_GRANT) || []).length, codes = (s.match(CODE_GRANT) || []).length;
  if (f === HOME) {
    if (hits !== 1 || grants !== 1) fail(`the one home should POST once; it has ${hits} address(es) and ${grants} grant(s)`);
    continue;
  }
  if (HOME_FNS.test(s)) {
    routed++;
    if (!/_google-token/.test(s)) fail(`${f} calls the one home without loading it`);
  }
  const ex = EXCEPTIONS[f];
  if (!ex) {
    if (hits || grants) fail(`${f} talks to Google's token address itself (${hits} address, ${grants} refresh grant). Use _google-token.js, or list it as an exception with a reason`);
    continue;
  }
  seen.add(f);
  if (!hits) fail(`${f} is a listed exception but no longer talks to Google's token address: take it off the list`);
  if (grants !== ex.refresh) fail(`${f} is excepted for "${ex.why}" but has ${grants} refresh grant(s), expected ${ex.refresh}`);
  if (codes !== ex.code) fail(`${f} is excepted for "${ex.why}" but has ${codes} one-time-code grant(s), expected ${ex.code}`);
  if (ex.env && (!ex.env.test(s) || /\.refresh_token\b/.test(s))) fail(`${f} must use only its key from the environment, never a stored one`);
}
for (const f of Object.keys(EXCEPTIONS)) if (!seen.has(f)) fail(`the exception ${f} no longer exists: take it off the list`);
// a scan that finds nothing to route looks the same as one where everything is fine
if (all.length < 100) moved(`netlify/functions (only ${all.length} files scanned)`);
if (routed < 28) fail(`only ${routed} files route through the one home, so copies came back or this scan has gone blind`);

// ── the fake world: no real value, no real request ─────────────────────────────────────────────────
Object.assign(process.env, {
  GOOGLE_TOKEN_KEY: crypto.randomBytes(32).toString("base64"), GOOGLE_OAUTH_CLIENT_ID: "client-id-of-rga", GOOGLE_OAUTH_CLIENT_SECRET: "client-secret-of-rga",
  GOOGLE_ADS_CLIENT_ID: "client-id-of-ads", GOOGLE_ADS_CLIENT_SECRET: "client-secret-of-ads",
  SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service-key", URL: "https://site.test", INTERNAL_FN_SECRET: "s", RGA_EMAIL_DAILY_CAP: "1000", FGA_REPORT_SIGNING_SECRET: "test-only",
});
delete process.env.RGA_SUPPRESS_CLIENT_EMAIL;
globalThis.__rgaFetchDeadlineInstalled = true;   // _deadline.js must not capture the real fetch
const quiet = {}; for (const k of ["log", "warn", "error", "info"]) { quiet[k] = console[k]; console[k] = () => {}; }

const INVALID = { error: "invalid_grant", error_description: "Token has been expired or revoked." };
const ANSWERS = {
  good: () => new Response(JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }), { status: 200 }),
  invalid_grant: () => new Response(JSON.stringify(INVALID), { status: 400 }),
  no_words: () => new Response(JSON.stringify({ error: "unauthorized_client" }), { status: 401 }),
  with_words: () => new Response(JSON.stringify({ error: "invalid_client", error_description: "The OAuth client was not found." }), { status: 401 }),
  bare: () => new Response("{}", { status: 500 }),
  not_json: () => new Response("<!DOCTYPE html>", { status: 502 }),
  ok_no_token: () => new Response("{}", { status: 200 }),
  ok_with_error: () => new Response(JSON.stringify({ error: "odd" }), { status: 200 }),
  network: () => { throw new TypeError("fetch failed"); },
};
let answer = "good", posts = [], writes = [], world = {};
const row = (b, status = 200) => new Response(status === 204 ? null : JSON.stringify(b), { status });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  if (ENDPOINT.test(url)) { ENDPOINT.lastIndex = 0; posts.push({ url, method, ct: (init.headers || {})["Content-Type"], body: String(init.body) }); return ANSWERS[answer](); }
  ENDPOINT.lastIndex = 0;
  if (method !== "GET") writes.push({ url, method, body: String(init.body || "") });
  if (url.startsWith("https://db.test/rest/v1/client_google_oauth")) return method === "GET" ? row([world.oauth]) : row(null, 204);
  if (url.startsWith("https://db.test/rest/v1/rga_google_credentials")) return method === "GET" ? row([world.cred]) : row(null, 204);
  if (url.startsWith("https://db.test/rest/v1/clients")) return row([{ id: "c1", workspace_id: "w1", primary_market: "Denver, CO" }]);
  if (url.startsWith("https://db.test/")) return method === "GET" ? row([]) : row(null, 204);
  if (url.includes("gmail.googleapis.com")) return row({ id: "m1" });
  return row({});
};

const req = createRequire(`${FN}/x.js`);
let C, H;
try { C = req("./_token-crypt.js"); H = req(`./${HOME}`); } catch (e) { fail(`${HOME} doesn't load: ${String(e.message).slice(0, 120)}`); }
// the authorization rules have their own gates; here they stand aside so a handler reaches its token code
try {
  const authPath = req.resolve("./_auth.js"), real = req(authPath);
  req.cache[authPath].exports = new Proxy(real, { get: (t, k) => (/^require/.test(String(k)) ? async () => ({ ok: true }) : t[k]) });
} catch (e) { moved(`_auth.js (${String(e.message).slice(0, 80)})`); }

// the real file, with its private functions reachable. Nothing in it is changed.
const NAMES = ["accessToken", "token", "refreshAccessToken", "googleAccessToken", "googleToken", "googleProbe", "sendGmail", "getAccessToken"];
function load(file) {
  const fp = `${FN}/${file}`;
  if (!fs.existsSync(fp)) moved(file);
  const m = new Module(fp, null); m.filename = fp; m.paths = Module._nodeModulePaths(FN);
  m._compile(`${fs.readFileSync(fp, "utf8")}\n;module.exports.__t = {};\n${NAMES.map((n) => `if (typeof ${n} !== "undefined") module.exports.__t.${n} = ${n};`).join("\n")}\n`, fp);
  return m.exports;
}
const PLAIN = "1//plain-stored-key", SEALED = C ? C.sealToken(PLAIN) : "";
const started = () => { posts = []; writes = []; };
async function attempt(fn) { started(); try { return { value: await fn() }; } catch (e) { return { threw: String(e.message), name: e.name }; } }
const params = (p) => Object.fromEntries(new URLSearchParams(p.body));
const say = (v) => JSON.stringify(v);

/** One request, to the right place, with RGA's client, the key revealed and nothing else in it. */
function requestIsRight(label, expectedKey = PLAIN) {
  if (posts.length !== 1) { fail(`${label}: ${posts.length} requests to Google, expected exactly 1`); return; }
  const p = params(posts[0]);
  if (posts[0].method !== "POST") fail(`${label}: not a POST`);
  if (posts[0].url !== "https://oauth2.googleapis.com/token") fail(`${label}: the wrong address`);
  if (p.refresh_token !== expectedKey) fail(`${label}: ${String(p.refresh_token).startsWith("enc:") ? "a stored key went to Google still sealed" : "the key was changed on the way"}`);
  if (p.grant_type !== "refresh_token") fail(`${label}: the wrong grant`);
  if (p.client_id !== "client-id-of-rga" || p.client_secret !== "client-secret-of-rga") fail(`${label}: the wrong client id or secret`);
  if (Object.keys(p).length !== 4) fail(`${label}: extra fields in the request`);
}
/** Nothing in an error message that could act as a key. */
function noSecretIn(label, text) {
  for (const x of [PLAIN, SEALED, "client-secret-of-rga", "fresh-token"]) if (x && String(text).includes(x)) fail(`${label}: the message carries a key or secret`);
}
let cases = 0;
async function expectCase(label, fn, want) {
  cases++;
  const got = await attempt(fn);
  if (want.threw !== undefined) {
    if (got.threw !== want.threw) fail(`${label}: expected the words ${say(want.threw)}, got ${say(got.threw ?? got.value)}`);
    noSecretIn(label, got.threw);
  } else if (want.errorLike) {
    if (!want.errorLike.test(got.threw || "")) fail(`${label}: expected an error like ${want.errorLike}, got ${say(got.threw ?? got.value)}`);
  } else if (say(got.value) !== say(want.value)) fail(`${label}: expected ${say(want.value)}, got ${say(got.threw ?? got.value)}`);
  if (want.posts !== undefined) { if (posts.length !== want.posts) fail(`${label}: ${posts.length} requests to Google, expected ${want.posts}`); }
  else requestIsRight(label);
  const saved = writes.filter((w) => /access_token/.test(w.body));
  if (want.saves ? saved.length !== 1 : saved.length) fail(`${label}: ${want.saves ? "should save the new token exactly once" : "must not save a token"}, wrote ${saved.length}`);
  if (want.saves && !(want.saves.test(saved[0]?.body || "") && /"access_token":"fresh-token"/.test(saved[0]?.body || ""))) fail(`${label}: saved the wrong fields`);
  return got;
}

if (H && !F.length) {
  // ── the home ───────────────────────────────────────────────────────────────────────────────────
  for (const [label, key] of [["a sealed key", SEALED], ["a plain key", PLAIN]]) {
    answer = "good"; world = {};
    for (const [name, fn] of [["refreshGrant", (k) => H.refreshGrant(k).then((r) => r.json()).then((j) => j.access_token)], ["googleKeyToToken", (k) => H.googleKeyToToken(k, () => null)], ["auditToken", H.auditToken], ["rgaToken", H.rgaToken], ["rgaTokenWithDetail", H.rgaTokenWithDetail]]) {
      if (typeof fn !== "function") { fail(`the home no longer offers ${name}`); continue; }
      await expectCase(`${name} with ${label}`, () => fn(key), { value: "fresh-token" });
    }
    const supa = async (url, init) => { writes.push({ url, method: init.method, body: init.body }); };
    await expectCase(`googleAccessToken with ${label}`, () => H.googleAccessToken(supa, { client_id: "c1", refresh_token: key }), { value: "fresh-token", saves: /access_token_expires_at.*last_refreshed_at/ });
  }
  const supa = async (url, init) => { writes.push({ url, method: init.method, body: init.body }); };
  const later = new Date(Date.now() + 3600e3).toISOString();
  await expectCase("googleAccessToken with a token still good", () => H.googleAccessToken(supa, { client_id: "c1", refresh_token: SEALED, access_token: "kept", access_token_expires_at: later }), { value: "kept", posts: 0 });
  answer = "invalid_grant";
  await expectCase("googleAccessToken refused", () => H.googleAccessToken(supa, { client_id: "c1", refresh_token: SEALED }), { threw: "Google sign-in for this client needs reconnecting (Token has been expired or revoked.)" });
  answer = "bare";
  await expectCase("googleAccessToken refused, no words", () => H.googleAccessToken(supa, { client_id: "c1", refresh_token: SEALED }), { threw: "Google sign-in for this client needs reconnecting (500)" });
  // the caller's own fetch still carries the request
  answer = "good"; started();
  { const mine = []; await H.googleAccessToken(supa, { client_id: "c1", refresh_token: SEALED }, async (u, i) => { mine.push(i); return ANSWERS.good(); });
    if (mine.length !== 1 || posts.length) fail("googleAccessToken no longer uses the fetch it was given"); }

  // ── every copy that takes a key and returns a token ────────────────────────────────────────────
  const REVOKED = "The RGA Google connection was revoked or expired. Reconnect it from the admin.";
  const audit = (o) => `token refresh failed: ${JSON.stringify(o)}`;
  const AUDIT = { invalid_grant: { threw: audit(INVALID) }, no_words: { threw: audit({ error: "unauthorized_client" }) }, bare: { threw: audit({}) }, ok_no_token: { threw: audit({}) } };
  const RGA = { invalid_grant: { threw: REVOKED }, no_words: { threw: "Token refresh failed: unauthorized_client" }, with_words: { threw: "Token refresh failed: invalid_client" }, bare: { threw: "Token refresh failed: 500" }, ok_no_token: { threw: "Token refresh failed: 200" } };
  const DETAIL = { invalid_grant: { threw: REVOKED }, no_words: { threw: "Token refresh failed: unauthorized_client " }, with_words: { threw: "Token refresh failed: invalid_client The OAuth client was not found." }, bare: { threw: "Token refresh failed: 500 " }, ok_no_token: { threw: "Token refresh failed: 200 " } };
  const AVAIL = { ...RGA, invalid_grant: { threw: "RGA's Google connection was revoked or expired. Reconnect it from the admin." } };
  const COULD_NOT = "RGA's Google connection could not be refreshed.";
  const BOOK = { invalid_grant: { threw: COULD_NOT }, no_words: { threw: COULD_NOT }, bare: { threw: COULD_NOT }, ok_no_token: { threw: COULD_NOT } };
  const GA4 = { invalid_grant: { threw: INVALID.error_description }, no_words: { threw: "unauthorized_client" }, with_words: { threw: "The OAuth client was not found." }, bare: { threw: "no access_token" } };
  const COPIES = [
    ...["ai-readiness-audit.js", "backfill-place-ids.js", "citation-audit.js", "deep-assess-client.js", "gbp-apply-change.js", "heal-onboarding-errors.js", "nap-and-review-audit.js", "validate-tracked-keyword.js"].map((f) => [f, "accessToken", AUDIT]),
    ...["cancel-kickoff-invite.js", "kickoff-rsvp-check.js", "notify-client-stage.js"].map((f) => [f, "accessToken", RGA]),
    ...["_gmail.js", "rga-notify-email-background.js", "send-confirmation-email.js", "send-kickoff-invite.js"].map((f) => [f, "accessToken", DETAIL]),
    ["kickoff-availability.js", "accessToken", AVAIL], ["portal-book-kickoff.js", "accessToken", BOOK], ["ga4-property-check.js", "token", GA4],
  ];
  for (const [file, name, words] of COPIES) {
    const fn = load(file).__t[name];
    if (typeof fn !== "function") moved(`${name} in ${file}`);
    answer = "good";
    for (const [label, key] of [["sealed", SEALED], ["plain", PLAIN]]) await expectCase(`${file} with a ${label} key`, () => fn(key), { value: "fresh-token" });
    for (const [a, want] of Object.entries(words)) { answer = a; await expectCase(`${file} refused (${a})`, () => fn(PLAIN), want); }
    answer = "not_json"; await expectCase(`${file} when Google sends a web page`, () => fn(PLAIN), { errorLike: /not valid JSON/ });
    answer = "network"; await expectCase(`${file} when the network fails`, () => fn(PLAIN), { threw: "fetch failed" });
  }

  // ── a caller that treats a failure as "no token": it must still get null, and a lost unlock key must not hide inside that ──
  for (const file of ["kickoff-availability.js", "portal-book-kickoff.js"]) {
    if (!/await accessToken\(revealToken\(cred\.refresh_token\)\)\.catch\(\(\) => null\)/.test(code(fs.readFileSync(`${FN}/${file}`, "utf8")))) fail(`${file} no longer turns a refused token into null`);
    const fn = load(file).__t.accessToken;
    for (const a of ["invalid_grant", "network", "not_json"]) { answer = a; await expectCase(`${file} .catch(() => null) on ${a}`, () => fn(PLAIN).catch(() => null), { value: null }); }
  }
  { const avail = load("kickoff-availability.js");
    world = { cred: { refresh_token: SEALED, scopes: "https://www.googleapis.com/auth/calendar.readonly" } };
    answer = "invalid_grant"; started();
    const r = await avail.handler({ httpMethod: "GET", headers: {}, queryStringParameters: { client_id: "c1" } });
    if (r.statusCode !== 200 || !Array.isArray(JSON.parse(r.body).slots)) fail(`kickoff-availability with a refused key should still offer times (it answered ${r.statusCode})`);
    if (posts.length !== 1) fail(`kickoff-availability sent ${posts.length} requests to Google for one look at the calendar`);
    if (posts[0] && params(posts[0]).refresh_token !== PLAIN) fail("kickoff-availability sent a sealed key"); }

  // ── the copies that read Google's whole answer ─────────────────────────────────────────────────
  const inv = load("_google-inventory.js");
  answer = "good"; await expectCase("_google-inventory shape", () => inv.refreshAccessToken(PLAIN), { value: { accessToken: "fresh-token", expiresIn: 3600 } });
  await expectCase("_google-inventory with a sealed key", () => inv.refreshAccessToken(SEALED), { value: { accessToken: "fresh-token", expiresIn: 3600 } });
  answer = "invalid_grant"; await expectCase("_google-inventory refused", () => inv.refreshAccessToken(PLAIN), { threw: "token refresh failed: invalid_grant Token has been expired or revoked." });
  answer = "no_words"; await expectCase("_google-inventory refused, no description", () => inv.refreshAccessToken(PLAIN), { threw: "token refresh failed: unauthorized_client" });
  answer = "not_json"; await expectCase("_google-inventory when Google sends a web page", () => inv.refreshAccessToken(PLAIN), { threw: "token refresh failed: 502" });

  const base = { client_id: "c1", refresh_token: SEALED, ga4_property_id: "properties/1", gsc_site_url: "https://x.test/", gbp_account_id: "accounts/1", gbp_location_id: "locations/1" };
  const cached = { ...base, access_token: "kept", access_token_expires_at: later };
  world = { oauth: base, cred: { refresh_token: SEALED, google_email: "g@rga.test", scopes: "gmail.send", sends_date: null, sends_today: 0, sends_total: 0 } };
  const flow = load("flow-execute.js").__t.googleAccessToken;
  answer = "good"; await expectCase("flow-execute saves what it gets", () => flow("c1"), { value: "fresh-token", saves: /access_token_expires_at.*last_refreshed_at/ });
  answer = "invalid_grant"; await expectCase("flow-execute refused", () => flow("c1"), { threw: "Token refresh failed: Token has been expired or revoked." });
  world.oauth = cached; answer = "good"; await expectCase("flow-execute with a token still good", () => flow("c1"), { value: "kept", posts: 0 }); world.oauth = base;

  const recheck = load("portal-step-recheck.js").__t;
  answer = "good"; await expectCase("portal-step-recheck token", async () => (await recheck.googleToken("c1")).token, { value: "fresh-token" });
  answer = "invalid_grant"; await expectCase("portal-step-recheck refused", () => recheck.googleToken("c1"), { value: { error: "We could not reach Google just now." } });
  answer = "network"; await expectCase("portal-step-recheck network", () => recheck.googleToken("c1"), { value: { error: "We could not reach Google just now." } });
  answer = "invalid_grant"; await expectCase("the Google probe calls a revoked key not done", () => recheck.googleProbe("c1", "ga4"), { value: { verdict: "not_done", evidence: "Our access to Google Analytics has been revoked — it needs reconnecting." } });
  answer = "no_words"; await expectCase("the Google probe can't tell on any other refusal", () => recheck.googleProbe("c1", "ga4"), { value: { verdict: "indeterminate", evidence: "We could not reach Google to verify Google Analytics." } });

  for (const file of ["send-invoice-email.js", "send-monthly-report.js"]) {
    const send = load(file).__t.sendGmail, mail = { workspaceId: "w1", to: "a@b.test", subject: "S", html: "<p>h</p>", text: "t" };
    answer = "invalid_grant"; await expectCase(`${file} refused`, () => send(mail), { value: { ok: false, error: INVALID.error_description } });
    answer = "no_words"; await expectCase(`${file} refused, no description`, () => send(mail), { value: { ok: false, error: "unauthorized_client" } });
    answer = "bare"; await expectCase(`${file} refused, no words`, () => send(mail), { value: { ok: false, error: "token_refresh_failed" } });
    answer = "not_json"; await expectCase(`${file} when Google sends a web page`, () => send(mail), { value: { ok: false, error: "token_refresh_failed" } });
    answer = "good"; const got = await attempt(() => send(mail));
    if (!got.value?.ok) fail(`${file} didn't send with a good token: ${say(got.threw ?? got.value)}`);
    requestIsRight(`${file} with a good token`);
    if (writes.some((w) => /access_token/.test(w.body))) fail(`${file} must not save a token`);
  }

  // v2-fetch-reviews.js was deleted 11-11 (master map Tier 1: no caller); the same copy is still run through v2-respond-review below.
  const V2 = { "v2-push-gbp-content.js": ["Token refresh error: odd", "No refresh token — user must reconnect Google account."], "v2-respond-review.js": ["Token refresh: odd", "No refresh token — reconnect Google account."] };
  for (const [file, [okError, noKey]] of Object.entries(V2)) {
    const get = load(file).__t.getAccessToken;
    if (typeof get !== "function") moved(`getAccessToken in ${file}`);
    const call = (o) => get(o, "c1", "https://db.test", "service-key");
    answer = "good"; await expectCase(`${file} saves what it gets`, () => call(base), { value: "fresh-token", saves: /access_token_expires_at/ });
    await expectCase(`${file} with a token still good`, () => call(cached), { value: "kept", posts: 0 });
    await expectCase(`${file} with no key`, () => call({ ...base, refresh_token: null }), { threw: noKey, posts: 0 });
    answer = "invalid_grant"; await expectCase(`${file} refused`, () => call(base), { threw: "Token refresh failed: HTTP 400" });
    answer = "not_json"; await expectCase(`${file} when Google sends a web page`, () => call(base), { threw: "Token refresh failed: HTTP 502" });
    answer = "ok_with_error"; await expectCase(`${file} when a 200 carries an error`, () => call(base), { threw: okError });
  }

  const event = { httpMethod: "POST", headers: {}, body: JSON.stringify({ clientId: "c1" }) };
  const profile = load("v2-gbp-profile.js");
  world.oauth = base;
  answer = "invalid_grant"; await expectCase("v2-gbp-profile on a refused key: its null becomes this error", async () => { const r = await profile.handler(event); return [r.statusCode, JSON.parse(r.body).error]; }, { value: [500, "Failed to refresh access token"] });
  answer = "good"; await expectCase("v2-gbp-profile saves what it gets", async () => (await profile.handler(event)).statusCode, { value: 200, saves: /access_token_expires_at/ });
  world.oauth = cached; await expectCase("v2-gbp-profile with a token still good", async () => (await profile.handler(event)).statusCode, { value: 200, posts: 0 }); world.oauth = base;

  const rediscover = load("v2-gbp-rediscover.js");
  answer = "invalid_grant"; await expectCase("v2-gbp-rediscover refused", async () => { const r = await rediscover.handler(event); return [r.statusCode, JSON.parse(r.body).error]; }, { value: [500, "Token refresh failed: invalid_grant"] });
  answer = "good"; await expectCase("v2-gbp-rediscover saves what it gets", async () => (await rediscover.handler(event)).statusCode, { value: 200, saves: /access_token/ });
}

for (const k of Object.keys(quiet)) console[k] = quiet[k];
if (!F.length && cases < 200) moved(`the cases this gate runs (only ${cases} ran)`);
if (F.length) { console.error(`🔴 Google sign-in has more than one home, or a merged copy changed — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ one home for Google sign-in: ${routed} functions use it, ${Object.keys(EXCEPTIONS).length} named exceptions, and in ${cases} stubbed cases every copy keeps its words, its failure shape and who saves`);
process.exit(0);
