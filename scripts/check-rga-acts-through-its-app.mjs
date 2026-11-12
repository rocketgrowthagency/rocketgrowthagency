#!/usr/bin/env node
/**
 * check-rga-acts-through-its-app.mjs — RGA CHANGES A CLIENT'S REPOSITORY THROUGH ITS OWN GITHUB APP WHEN IT'S INSTALLED (approved
 * rga_github_app_v1, the owner 11-8). Netlify built the app's commit on RGA's one-account plan where it refused RGA Admin's (test PRs #7 vs #4/#6).
 * Against fakes: the app's key is read from private storage; an installed app gives an installation key and the bot identity; no install →
 * NO key at all and "app not installed" in words (integrations_hardening_v1, approved 11-11: the RGA Admin user key GITHUB_ADMIN_TOKEN is
 * retired for repository work; GitHub not answering stays "couldn't tell"); an app key counts as write access; the app merging is expected;
 * the safety rows say "RGA's app"; every client-repo action in the functions asks the helper, never the RGA Admin key directly.
 * Exit 0 = holds · 1 = doesn't · 2 = couldn't tell.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const bad = [], fail = (m) => bad.push(m);
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs1", format: "pem" });
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.GITHUB_ADMIN_TOKEN = "ghp_user";
let ID, GA, PS, FN = {};
try {
  ID = req(`${SITE}/netlify/functions/_github-identity.js`); GA = req(`${SITE}/netlify/functions/_github-access.js`); PS = req(`${SITE}/netlify/functions/_publish-safety.js`);
  for (const f of ["admin-deliverables.js", "site-publish-check.js", "site-publish-watch.js", "admin-github-connection.js"]) FN[f] = fs.readFileSync(`${SITE}/netlify/functions/${f}`, "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load: ${e.message}`); process.exit(2); }

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const fake = (installed, down = false) => async (url, init = {}) => {
  const u = new URL(url), auth = (init.headers || {}).Authorization || "";
  if (u.host === "supa.test") return u.pathname.endsWith("/raw-store/secrets/github-app-private-key.pem") && (init.headers || {}).apikey === "svc" ? res(200, PEM) : res(400, "no");
  if (u.pathname.match(/^\/repos\/[^/]+\/[^/]+\/installation$/)) {
    const jwt = auth.replace(/^Bearer /, "").split("."); if (jwt.length !== 3) return res(401, {});
    const ok = crypto.verify("RSA-SHA256", Buffer.from(`${jwt[0]}.${jwt[1]}`), privateKey, Buffer.from(jwt[2], "base64url"));
    if (!ok || JSON.parse(Buffer.from(jwt[1], "base64url")).iss !== "5672462") return res(401, {});
    if (down) return res(502, {});
    return installed ? res(200, { id: 42 }) : res(404, {});
  }
  if (u.pathname === "/app/installations/42/access_tokens") return res(201, { token: "ghs_app" });
  if (u.pathname === "/user") return auth === "Bearer ghp_user" ? res(200, { login: GA.ADMIN_LOGIN }) : res(401, {});
  return res(404, {});
};
try {
  const a = await ID.forRepo("acme/site", fake(true));
  if (a.via !== "app" || a.token !== "ghs_app" || !a.me.ok || !a.me.app || a.me.login !== "rocket-growth-agency[bot]") fail(`an installed app isn't used (${JSON.stringify({ via: a.via, me: a.me })})`);
  // 🔒 11-11: the RGA Admin key is retired for repository work. No app = no key, said in words; GitHub silent = couldn't tell, never "not installed"
  const u = await ID.forRepo("acme/other", fake(false));
  if (u.via !== "none" || u.token !== "" || u.me.ok || u.me.state !== "app_not_installed") fail(`without the app, a key still acts on the repository (the RGA Admin key is retired): ${JSON.stringify({ via: u.via, user_key: u.token === "ghp_user", me: u.me })}`);
  const dn = await ID.forRepo("acme/third", fake(false, true));
  if (dn.token !== "" || dn.me.ok || dn.me.state !== "github_error") fail("GitHub not answering reads as 'app not installed' (or hands out a key)");
  if (!GA.isAppToken("ghs_x") || GA.isAppToken("ghp_x")) fail("an app key isn't told from a user key");
  const ra = await GA.repoAccess("ghs_app", async () => res(200, { default_branch: "main" }), "acme/site");
  if (!ra.ok || !ra.canChange || ra.role !== "RGA's app") fail("the app's installation doesn't count as write access");
  const ro = await GA.repoAccess("ghp_user", async () => res(200, { permissions: { pull: true } }), "acme/site");
  if (ro.canChange) fail("a read-only user still counts as write access");
  if (PS.mergerState({ merged: true, merged_by: "rocket-growth-agency[bot]" }, "acme/site", null).ok !== true) fail("the app merging after approval is flagged as unexpected");
  if (PS.mergerState({ merged: true, merged_by: "stranger" }, "acme/site", null).ok !== null) fail("a stranger merging isn't flagged");
  const cc = PS.connectionCheck({ acc: { repo: "acme/site", confirmed_at: "x" }, me: { ok: true, login: "rocket-growth-agency[bot]", app: true }, access: { ok: true, role: "RGA's app", canChange: true }, repoIsSite: true });
  const acct = cc.rows.find((r) => r.id === "account");
  if (!acct || acct.ok !== true || !/RGA's app is installed/.test(acct.title)) fail("the connection check asks for an invited account when RGA's app is installed");
} catch (e) { console.error(`⚠️  INDETERMINATE — threw: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }

// every client-repository action asks the helper first
for (const [f, src] of Object.entries(FN)) {
  const direct = (src.match(/process\.env\.GITHUB_ADMIN_TOKEN/g) || []).length, helper = (src.match(/_github-identity"\)\.forRepo\(/g) || []).length;
  if (!helper) fail(`${f} acts on a client's repository without the identity helper`);
  if (direct) fail(`${f} still uses the RGA Admin key directly (${direct}×); only RGA's app acts on a client's repository (11-11)`);
}
// the publish checks say "install RGA's app", never "set the RGA Admin key", when the app isn't there
try {
  const pb = fs.readFileSync(`${SITE}/netlify/functions/_publish-blocked.js`, "utf8"), ps = fs.readFileSync(`${SITE}/netlify/functions/_publish-safety.js`, "utf8");
  if (!/me\.state === "app_not_installed"\) add\("connection", false, "RGA's GitHub app isn't installed on their repository\."/.test(pb)) fail("the publish check doesn't say RGA's app isn't installed (it would ask for the retired RGA Admin key)");
  if (!/me\.state === "app_not_installed"\) add\("account", false,/.test(ps)) fail("the connection check doesn't say RGA's app isn't installed");
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't read the publish checks: ${e.message}`); process.exit(2); }

if (bad.length) { console.error(`❌ RGA's app — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ RGA acts on a client's repository through its own GitHub app when it's installed (key from private storage, signed app token, bot identity), and with no app no key acts (the RGA Admin key is retired, said as 'app not installed'); an app key is write access, the app merging is expected, the connection check says so; every client-repo action asks the helper");
