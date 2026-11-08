#!/usr/bin/env node
/**
 * check-a-client-installs-rgas-app.mjs — THE CLIENT INSTALLS RGA'S GITHUB APP (approved client_github_app_install_v1, the owner 11-8: "ok build
 * mockup how we will do this for clients that need to do it"). GitHub only lets a repository's owner add an app, so the click on GitHub is the
 * client's; then the portal finishes it (portal-github-app.js) and the host check runs by itself.
 * Part 1 runs portal-github-app.js against a fake GitHub + database: the start link carries a signed state; a forged, expired or
 * other-client state is refused; no state and no sign-in is refused; an installation that isn't RGA's is refused; a repository that isn't
 * their website NEVER writes; two that name it never write; a correct install writes access via github_app (read back, recorded), keeps
 * work saved meanwhile (the record is read again right before the write), asks the host check again on a switch, settles step 9.
 * Part 2 renders the portal card states in Chrome: Install on GitHub (word for word), the link for whoever manages their GitHub (names the
 * business), checking / done after install, "Switch to RGA's app" for an invited RGA Admin, the wrong-repository note, non-GitHub untouched.
 * Part 3 pins the wiring (finish before the records load, the signed-out landing, admin's rows). Exit 0 = holds · 1 = doesn't · 2 = couldn't tell.
 */
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const bad = [], fail = (m) => bad.push(m);
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs1", format: "pem" });
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.INTERNAL_FN_SECRET = "gate-secret-not-real";
let FN, RL, P, A, PCSS, PSRC, puppeteer;
try {
  FN = req(`${SITE}/netlify/functions/portal-github-app.js`)._test; RL = req(`${SITE}/netlify/functions/_rga-logins.js`);
  P = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); PCSS = fs.readFileSync(`${SITE}/portal/portal.css`, "utf8");
  PSRC = fs.readFileSync(`${SITE}/netlify/functions/_publish-safety.js`, "utf8");
  puppeteer = req("puppeteer-core");
  if (!FN || !FN.handler) throw new Error("portal-github-app.js has no _test.handler");
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load: ${e.message}`); process.exit(2); }

// ── part 1 · the function against a fake GitHub + database ───────────────────────────────────────────────────
const CID = "11111111-2222-4333-8444-555555555555", OTHER = "99999999-2222-4333-8444-555555555555";
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const INST = { 77: ["acme/site", "acme/blog"], 78: ["acme/blog"], 79: ["acme/site", "acme/site-copy"], 80: ["acme/empty"] };
const FILES = { "acme/site:CNAME": "www.acmeplumbing.com\n", "acme/blog:index.html": "<html><title>Acme Blog</title></html>", "acme/site-copy:netlify.toml": "[[redirects]]\nfrom = \"https://acmeplumbing.com/*\"" };
const jwtOk = (auth) => {
  const j = String(auth || "").replace(/^Bearer /, "").split(".");
  if (j.length !== 3) return false;
  try { return crypto.verify("RSA-SHA256", Buffer.from(`${j[0]}.${j[1]}`), privateKey, Buffer.from(j[2], "base64url")) && JSON.parse(Buffer.from(j[1], "base64url")).iss === "5672462"; } catch { return false; }
};
const ghFetch = async (url, init = {}) => {
  const u = new URL(url), auth = (init.headers || {}).Authorization || "", m = (init.method || "GET").toUpperCase(), p = u.pathname;
  if (u.host === "supa.test") return p.endsWith("/raw-store/secrets/github-app-private-key.pem") && (init.headers || {}).apikey === "svc" ? res(200, PEM) : res(400, "no");
  if (u.host === "acmeplumbing.com") return res(200, "<html><title>Acme Plumbing | Denver</title></html>");
  if (u.host !== "api.github.com") return res(404, {});
  let x;
  if ((x = /^\/app\/installations\/(\d+)$/.exec(p)) && m === "GET") return !jwtOk(auth) ? res(401, {}) : INST[x[1]] ? res(200, { id: Number(x[1]), account: { login: "acme" }, repository_selection: "selected" }) : res(404, {});
  if ((x = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(p)) && m === "POST") return jwtOk(auth) && INST[x[1]] ? res(201, { token: `ghs_ins${x[1]}` }) : res(401, {});
  const tok = /^Bearer ghs_ins(\d+)$/.exec(auth);
  if (p === "/installation/repositories") return tok ? res(200, { repositories: INST[tok[1]].map((full_name) => ({ full_name })) }) : res(401, {});
  if ((x = /^\/repos\/([\w.-]+\/[\w.-]+)\/contents\/(.+)$/.exec(p))) {
    if (!tok || !INST[tok[1]].includes(x[1])) return res(404, {});   // an installation key reaches only its own repositories
    const f = FILES[`${x[1]}:${decodeURIComponent(x[2])}`];
    return f ? res(200, f) : res(404, {});
  }
  return res(404, {});
};
function makeDb(task = {}, o = {}) {
  const db = { data: { tasks: { "m1.access.website": task } }, reads: 0, patches: 0, activity: [] };
  db.supa = async (path, init = {}) => {
    const m = (init.method || "GET").toUpperCase();
    if (path.startsWith(`/client_onboarding_records?client_id=eq.${CID}&select=id,data`)) {
      db.reads++;
      const snap = [{ id: "ob1", data: JSON.parse(JSON.stringify(db.data)) }];
      if (db.reads === 1 && o.meanwhile) db.data = { ...db.data, tasks: { ...db.data.tasks, ...o.meanwhile } };   // saved by someone else while GitHub is asked
      return snap;
    }
    if (path.startsWith("/client_onboarding_records?client_id=eq.")) return [];
    if (path === "/client_onboarding_records?id=eq.ob1" && m === "PATCH") { db.patches++; const d = JSON.parse(init.body).data; if (o.dropWrites) return []; db.data = d; return [{ data: JSON.parse(JSON.stringify(d)) }]; }
    if (path.startsWith("/client_onboarding_records?id=eq.ob1&select=data")) return [{ data: JSON.parse(JSON.stringify(db.data)) }];
    if (path.startsWith(`/clients?id=eq.${CID}`)) return [{ website_url: "https://www.acmeplumbing.com/", business_name: "Acme Plumbing", workspace_id: "w1" }];
    if (path === "/client_activity" && m === "POST") { const row = JSON.parse(init.body); db.activity.push(row); return [row]; }
    return [];
  };
  return db;
}
const owner = async (event, cid) => ((event.headers || {}).authorization === "Bearer owner" && cid === CID ? { email: "owner@acme.test" } : { error: { statusCode: 403, body: JSON.stringify({ error: "No portal access to this client" }) } });
const call = async (db, body, headers = {}) => { const r = await FN.handler({ httpMethod: "POST", headers, body: JSON.stringify(body) }, { supa: db.supa, fetch: ghFetch, requirePortalOwner: owner }); let j = {}; try { j = JSON.parse(r.body); } catch { /* */ } return { status: r.statusCode, j }; };
const acc = (db) => (db.data.tasks["m1.access.website"] || {}).access || null;
let STATE = "";
try {
  // start: the install link, with a state that names this client
  const st = await call(makeDb(), { action: "start", client_id: CID }, { authorization: "Bearer owner" });
  const su = st.j.url ? new URL(st.j.url) : null;
  STATE = su ? su.searchParams.get("state") || "" : "";
  if (st.status !== 200 || !su || `${su.origin}${su.pathname}` !== "https://github.com/apps/rocket-growth-agency/installations/new" || !STATE.startsWith(`${CID}.`) || st.j.business !== "Acme Plumbing") fail(`"start" doesn't give the install link with a state naming this client (${JSON.stringify(st.j)})`);
  if ((await call(makeDb(), { action: "start", client_id: CID }, {})).status === 200) fail("\"start\" answers without the client's portal sign-in");
  const forged = STATE.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  const old = (() => { const ts = Math.floor(Date.now() / 1000) - 31 * 86400; return `${CID}.${ts}.${crypto.createHmac("sha256", process.env.INTERNAL_FN_SECRET).update(`github-app|${CID}|${ts}`).digest("hex").slice(0, 32)}`; })();
  for (const [why, body, headers, want] of [
    ["a forged state", { action: "finish", installation_id: "77", state: forged }, {}, 403],
    ["an expired state", { action: "finish", installation_id: "77", state: old }, {}, 403],
    ["a state for another client", { action: "finish", installation_id: "77", state: STATE, client_id: OTHER }, {}, 403],
    ["no state and no portal sign-in", { action: "finish", installation_id: "77", client_id: CID }, {}, 403],
    ["an installation that isn't RGA's app", { action: "finish", installation_id: "12345", state: STATE }, {}, 404],
  ]) {
    const db = makeDb({ status: "pending" }); const r = await call(db, body, headers);
    if (r.status !== want || r.j.ok || db.patches || db.activity.length || acc(db)) fail(`${why} isn't refused with nothing written (HTTP ${r.status}, ${db.patches} write(s))`);
  }
  // a repository that isn't their website: refused in the approved words, nothing written
  const dbW = makeDb({ status: "pending" }); const w = await call(dbW, { action: "finish", installation_id: "78", state: STATE });
  if (w.status !== 409 || !/^acme\/blog isn't your website\./.test(w.j.error || "") || dbW.patches || dbW.activity.length) fail(`a repository that isn't their website isn't refused as "acme/blog isn't your website" with nothing written (${w.status} · ${w.j.error} · ${dbW.patches} write(s))`);
  const dbM = makeDb({ status: "pending" }); const mm = await call(dbM, { action: "finish", installation_id: "79", state: STATE });
  if (mm.status !== 409 || mm.j.state !== "many" || dbM.patches) fail(`two repositories that both name their website still pick one (${mm.status} · ${mm.j.state})`);
  const dbE = makeDb({ status: "pending" }); const ee = await call(dbE, { action: "finish", installation_id: "80", state: STATE });
  if (ee.status !== 409 || dbE.patches || !/couldn't confirm acme\/empty is your website/.test(ee.j.error || "")) fail(`a repository we couldn't check is treated as their website (${ee.status} · ${ee.j.error})`);
  // the developer's install (the state alone, no sign-in): the site among two repositories → the grant, read back, recorded
  const dbOk = makeDb({ status: "pending", client_input: { via: "invite", platform: "custom", files: "github", at: "2026-11-08T10:00:00Z" } }, { meanwhile: { "m1.kickoff.call": { status: "done", saved: "meanwhile" } } });
  const ok = await call(dbOk, { action: "finish", installation_id: "77", state: STATE, setup_action: "install" });
  const a = acc(dbOk), t = dbOk.data.tasks["m1.access.website"];
  if (ok.status !== 200 || !ok.j.ok || !a || a.via !== "github_app" || a.repo !== "acme/site" || a.installation_id !== 77 || a.github !== "rocket-growth-agency[bot]" || a.role !== "RGA's app" || !a.confirmed_at || a.found_in !== "CNAME" || a.domain !== "acmeplumbing.com" || t.status !== "done")
    fail(`a correct install doesn't record access via RGA's app on acme/site (${ok.status} · ${JSON.stringify(a)})`);
  if (ok.j.tasks || ok.j.scope) fail("the signed link alone (whoever manages their GitHub, no sign-in) is handed the client's whole record");
  if (!(dbOk.data.tasks["m1.kickoff.call"] || {}).saved) fail("work saved while GitHub was checked was lost: the record isn't read again right before the write");
  if (!dbOk.activity.some((r) => r.kind === "website_access_confirmed" && r.payload && r.payload.actor === "client" && r.payload.answer && r.payload.answer.via === "github_app")) fail("the install isn't recorded in client_activity");
  if (((dbOk.data.tasks[RL.STEP9] || {}).vault || {}).state !== "no_login") fail(`step 9 doesn't settle as "no login to save" for RGA's app (${JSON.stringify((dbOk.data.tasks[RL.STEP9] || {}).vault)})`);
  if (RL.loginPlatformOf({ access: { via: "github_app", github: "rocket-growth-agency[bot]", confirmed_at: "x" } }) !== null) fail("step 9 asks for a saved login for RGA's app");
  // the client's own return trip (signed in, no state): their portal owner may finish it
  const dbS = makeDb({ status: "pending" }); const s2 = await call(dbS, { action: "finish", installation_id: "77", client_id: CID }, { authorization: "Bearer owner" });
  if (s2.status !== 200 || (acc(dbS) || {}).installed_by !== "owner@acme.test") fail(`the signed-in client's own return (no state) doesn't finish (${s2.status} · ${s2.j.error})`);
  if (!s2.j.tasks || !s2.j.tasks["m1.access.website"] || s2.j.tasks["m1.access.website"].access.repo !== "acme/site") fail("the signed-in finish doesn't return the record it read back");
  // a write that doesn't read back is never "ok"
  const dbD = makeDb({ status: "pending" }, { dropWrites: true }); const dd = await call(dbD, { action: "finish", installation_id: "77", state: STATE });
  if (dd.status !== 500 || dd.j.ok) fail(`a write that didn't save says it did (${dd.status})`);
  // a client who invited RGA Admin switches to the app: the earlier grant kept as previous, the host check asked again
  const dbX = makeDb({ status: "done", completed_at: "2026-11-01T00:00:00Z", access: { repo: "acme/site", via: "github_one_click", github: "rocketgrowthagency-admin", role: "Write on GitHub", confirmed_at: "2026-11-01T00:00:00Z" }, host_check: { state: "refused", host: "Netlify" } });
  const xx = await call(dbX, { action: "finish", installation_id: "77", state: STATE });
  const ax = acc(dbX), hx = dbX.data.tasks["m1.access.website"].host_check;
  if (xx.status !== 200 || ax.via !== "github_app" || !ax.previous || ax.previous.via !== "github_one_click" || !hx || hx.state !== "recheck" || dbX.data.tasks["m1.access.website"].completed_at !== "2026-11-01T00:00:00Z") fail(`switching from RGA Admin to the app doesn't keep the earlier grant and ask the host check again (${JSON.stringify({ ax, hx })})`);
} catch (e) { console.error(`⚠️  INDETERMINATE — the function threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }

// the return trip's params are read once and taken off the address bar
{
  const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); if (!m) return null; const e = src.indexOf("\n}\n", m.index); return e < 0 ? null : src.slice(m.index, e + 2); };
  const f = lift(P, "ghAppReturnParams");
  if (!f) { console.error("⚠️  INDETERMINATE — ghAppReturnParams moved"); process.exit(2); }
  const calls = [];
  const ctx = vm.createContext({ URLSearchParams, window: { location: { search: `?github_app=installed&installation_id=77&setup_action=install&state=${STATE}` }, history: { replaceState: (a, b, u) => calls.push(u) } } });
  vm.runInContext(f, ctx);
  const v = vm.runInContext("ghAppReturnParams()", ctx);
  if (!v || v.installation_id !== "77" || v.state !== STATE || calls[0] !== "/portal/") fail(`the portal doesn't read GitHub's return (installation_id, state) and clean the address bar (${JSON.stringify(v)} · ${calls})`);
  ctx.window.location.search = "?paid=1"; calls.length = 0;
  if (vm.runInContext("ghAppReturnParams()", ctx) !== null || calls.length) fail("a page load that isn't GitHub's return is treated as one");
}

// ── part 2 · the portal card states, rendered in Chrome ───────────────────────────────────────────────────────
const moved = (w) => { console.error(`⚠️  INDETERMINATE — portal.js ${w} moved; re-read it before trusting this gate`); process.exit(2); };
const fn = (n) => { const m = new RegExp(`^(async )?function ${n}\\(`, "m").exec(P); if (!m) moved(`function ${n}`); const e = P.indexOf("\n}\n", m.index); if (e < 0) moved(`the end of ${n}`); return P.slice(m.index, e + 2); };
const line = (n) => { const m = new RegExp(`^const ${n} = [^\\n]*;$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0].replace(/^const /, "var "); };
const multi = (n) => { const m = new RegExp(`^const ${n} = `, "m").exec(P); if (!m) moved(`const ${n}`); let d = 0, seen = false; for (let k = m.index + m[0].length; k < P.length; k++) { const ch = P[k]; if ("{[(".includes(ch)) { d++; seen = true; } else if ("}])".includes(ch)) d--; else if (ch === ";" && seen && d === 0) return P.slice(m.index, k + 1).replace(/^const /, "var "); } moved(`the end of ${n}`); };
const handler = (needle) => { const i = P.indexOf(needle); if (i < 0) moved(`the handler for ${needle}`); const s = P.lastIndexOf("document.addEventListener(", i); let d = 0; for (let k = P.indexOf("{", P.indexOf("=>", s)); k < P.length; k++) { if (P[k] === "{") d++; else if (P[k] === "}") { d--; if (!d) return P.slice(s, P.indexOf(";", k) + 1); } } moved(`the end of the handler for ${needle}`); };
const base = [fn("escapeHtml"), fn("escapeAttribute")].join("\n");
const kit = planCardKit(P, base);
const SRC = [base, kit, csBlock(P, `${base}\n${kit}`), line("stepLockOf"), line("RGA_ADMIN_EMAIL"), line("RGA_ADMIN_GITHUB"), multi("ACC_FILES"), line("GH_APP_INSTALL_URL"),
  ...["accStep1Name", "accSiteName", "accMergeChoiceHtml", "accessTestRow", "hostCheckParts", "hostFixHtml", "ghAppWanted", "ghAppInstallHtml", "ghAppCardHtml", "ghAppDoneHtml", "accessCardHtml", "accWhoOf", "accDevNote", "accDevNoteText", "accCustomSetupHtml"].map(fn),
  `var _ghAppNote = new Map(), _lockData = { tasks: {} }, _rcEditing = new Set(), _accPickSelf = new Set(), _accNames = { wix: "Wix" }, _accHosts = { netlify: "Netlify" };
   var portalToken = async () => "tok", showPortalToast = (m) => { window.__toast = m; }, portalAlert = (m) => { window.__alert = m; }, clientError = (e, w) => "Couldn't " + w;
   async function ghAppStartUrl(id) { window.__started = id; return { url: "https://github.com/apps/rocket-growth-agency/installations/new?state=" + id + ".1762600000.0123456789abcdef0123456789abcdef", business: "Acme Plumbing" }; }`,
  handler('e.target.closest("[data-gh-app-share],[data-gh-app-copy]")'),
  handler('e.target.closest("[data-gh-app-install]")').replace("window.location.href = (await ghAppStartUrl(clientId)).url;", "window.__go = (await ghAppStartUrl(clientId)).url;"),
].join("\n");
const b = await puppeteer.launch({ headless: "new", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
let out;
try {
  const pg = await b.newPage();
  await pg.setViewport({ width: 900, height: 900 });
  await pg.setContent(`<!doctype html><style>${PCSS}</style><div class="pm-step-row pm-cs" id="step-row-m1.access.website" style="width:680px"><div id="root"></div></div>`);
  await pg.addScriptTag({ content: SRC });
  out = await pg.evaluate(async (CID) => {
    const root = document.getElementById("root"), now = new Date().toISOString();
    const draw = (t, tasks = {}) => { root.innerHTML = accessCardHtml({ id: "m1.access.website" }, t, CID, tasks); return root; };
    const txt = (el) => el.textContent.replace(/\s+/g, " ").trim();
    const r = {};
    // 1 · a GitHub site, no access yet
    const t1 = { status: "in_progress", client_input: { via: "invite", platform: "custom", files: "github", who: "self", at: "2026-11-08T10:00:00Z", detected: { host: "netlify" } } };
    let el = draw(t1);
    const btn = el.querySelector("[data-gh-app-install]"), box = el.querySelector("[data-gh-app-box]"), card = el.querySelector(".pm-cs-card");
    r.install = { text: txt(el), head: txt(el.querySelector(".pm-k5-h")), tone: card && card.className, btn: btn && txt(btn), href: btn && btn.getAttribute("href"), cid: btn && btn.getAttribute("data-client-id"),
      btnW: btn ? btn.getBoundingClientRect().width : 0, btnH: btn ? btn.getBoundingClientRect().height : 0, boxShown: box ? box.getBoundingClientRect().height > 0 : null, change: (el.innerHTML.match(/>Change something</g) || []).length };
    const sh = el.querySelector("[data-gh-app-share]"); if (sh) sh.click();
    await new Promise((res) => setTimeout(res, 50));
    const ta = el.querySelector("[data-gh-app-box] textarea");
    r.share = { shown: !!box && box.getBoundingClientRect().height > 0, text: ta ? ta.value : "", say: box ? txt(box) : "", copy: !!(box && box.querySelector("[data-gh-app-copy]")) };
    if (btn) btn.click();
    await new Promise((res) => setTimeout(res, 50));
    r.go = window.__go || "";
    // 2 · the wrong repository came back: the card says so
    _ghAppNote.set(CID, "acme/blog isn't your website. On GitHub, pick the repository your website is built from.");
    r.wrong = txt(draw(t1)); _ghAppNote.delete(CID);
    // 3 · installed, the host check running
    const appAcc = { repo: "acme/site", via: "github_app", installation_id: 77, github: "rocket-growth-agency[bot]", role: "RGA's app", domain: "acmeplumbing.com", found_in: "CNAME", confirmed_at: now };
    el = draw({ status: "done", access: appAcc });
    r.checking = { text: txt(el), head: txt(el.querySelector(".pm-k5-h")), rows: [...el.querySelectorAll(".pm-cs-ev")].map(txt) };
    // 4 · done by itself
    const tasks = { "m1.access.publish_test": { site_change: { v: 2, removes_page: true }, published: { v: 2, at: "2026-11-08T12:00:00Z" } } };
    el = draw({ status: "done", access: { ...appAcc, confirmed_at: "2026-11-08T11:00:00Z" }, host_check: { state: "built", host: "Netlify", read_at: "2026-11-08T11:06:00Z" } }, tasks);
    r.done = { text: txt(el), head: txt(el.querySelector(".pm-k5-h")), rows: [...el.querySelectorAll(".pm-cs-ev")].map(txt), merge: !!el.querySelector("[data-merge-choice]"), change: (el.innerHTML.match(/>Change something</g) || []).length };
    // 5 · invited RGA Admin before: they keep working, one line to switch
    el = draw({ status: "done", client_input: { via: "invite", platform: "custom", files: "github", at: "2026-11-01T10:00:00Z" }, access: { repo: "acme/site", via: "github_one_click", github: "rocketgrowthagency-admin", role: "Write on GitHub", confirmed_at: "2026-11-01T11:00:00Z" } });
    const sw = [...el.querySelectorAll("[data-gh-app-install]")];
    r.switch = { n: sw.length, text: sw[0] ? txt(sw[0]) : "", href: sw[0] ? sw[0].getAttribute("href") : "", card: txt(el) };
    // 6 · not on GitHub: nothing changes
    r.wix = txt(draw({ status: "in_progress", client_input: { via: "invite", platform: "wix", at: "2026-11-08T10:00:00Z" } }));
    r.wixDone = txt(draw({ status: "done", client_input: { via: "invite", platform: "wix" }, access: { role: "Admin", account: "access@rocketgrowthagency.com", confirmed_at: "2026-11-01T11:00:00Z" } }));
    // 7 · picking GitHub in the ask itself: the install, never the collaborator steps
    const host = { _accWho: "self", _accFiles: "github", getAttribute: (k) => (k === "data-client-id" ? CID : null) };
    r.ask = accCustomSetupHtml({}, { key: "netlify", name: "Netlify" }, host);
    return r;
  }, CID);
} catch (e) { console.error(`⚠️  INDETERMINATE — the cards wouldn't render: ${String(e.message).split("\n")[0]}`); process.exit(2); } finally { await b.close(); }

const I = out.install;
const LINE = "Install Rocket Growth Agency's app on the GitHub repository your website is built from.";
const FINE = "It can only change the repository you pick, and nothing goes live until you approve it. Remove it anytime in GitHub.";
const SHARE = "Someone else manages your GitHub? Send them the link ›";
if (!/^Give RGA access to your website ?Your site: GitHub · Netlify$/.test(I.head) || !/\byou\b/.test(I.tone || "")) fail(`the GitHub card's band isn't "Give RGA access to your website · Your site: GitHub · Netlify" on the client's move (${I.head} · ${I.tone})`);
if (![LINE, FINE, SHARE].every((s) => I.text.includes(s)) || I.btn !== "Install on GitHub") fail(`the GitHub card's words aren't the approved ones (${I.text})`);
if (I.href !== "https://github.com/apps/rocket-growth-agency/installations/new" || I.cid !== "11111111-2222-4333-8444-555555555555") fail(`Install on GitHub doesn't open RGA's app install page for this client (${I.href} · ${I.cid})`);
if (!(I.btnW > 60 && I.btnW < 320 && I.btnH > 20 && I.btnH < 60)) fail(`the Install button is stretched or missing (${Math.round(I.btnW)}×${Math.round(I.btnH)})`);
if (I.boxShown !== false || I.change !== 1) fail("the link for someone else shows before it's asked for, or the card has no Change something");
if (!out.share.shown || !out.share.copy || !/Acme Plumbing/.test(out.share.text) || !/https:\/\/github\.com\/apps\/rocket-growth-agency\/installations\/new\?state=11111111-/.test(out.share.text) || !/names Acme Plumbing/.test(out.share.say)) fail(`"Send them the link" doesn't reveal the install link naming the business, to copy (${out.share.say} · ${out.share.text})`);
if (!/\?state=11111111-/.test(out.go)) fail(`Install on GitHub doesn't go to the signed link (${out.go})`);
if (!/acme\/blog isn't your website\./.test(out.wrong) || !out.wrong.includes(LINE)) fail(`a wrong repository isn't said on the card with Install again (${out.wrong})`);
const C3 = out.checking;
if (!/^Give RGA access to your website ?Checking…$/.test(C3.head) || C3.rows.length !== 3 || !/^RGA's app is installed on acme\/site ?just now$/.test(C3.rows[0]) || !/^acme\/site is your website ?Its files name acmeplumbing\.com\. ?just now$/.test(C3.rows[1]) || !/^Checking your host builds RGA's changes/.test(C3.rows[2])) fail(`after the install, the card isn't installed · is your website · checking the host (${C3.head} | ${C3.rows.join(" | ")})`);
const D = out.done;
if (!/^Rocket Growth Agency has access ?confirmed Nov 8$/.test(D.head) || D.rows.length !== 3 || !/^RGA's app is installed on acme\/site ?Nov 8$/.test(D.rows[0]) || !/^Netlify built RGA's test change/.test(D.rows[1]) || !/^We confirmed we can edit your website/.test(D.rows[2]) || /is your website/.test(D.text) || !D.merge || D.change !== 1) fail(`done by itself isn't installed · host built · the access test (${D.head} | ${D.rows.join(" | ")})`);
if (/Switch to RGA's app/.test(D.text) || /Switch to RGA's app/.test(C3.text)) fail("a client already on RGA's app is asked to switch to it");
if (out.switch.n !== 1 || out.switch.text !== "Switch to RGA's app" || out.switch.href !== "https://github.com/apps/rocket-growth-agency/installations/new" || !/We signed in/.test(out.switch.card)) fail(`a client who invited RGA Admin doesn't keep their card with one "Switch to RGA's app" line (${out.switch.n} · ${out.switch.text})`);
if (/Install on GitHub|Switch to RGA's app|RGA's app/.test(out.wix + out.wixDone)) fail("a website that isn't on GitHub shows RGA's GitHub app");
if (!out.ask.includes(LINE) || /Collaborators/.test(out.ask) || !/data-gh-app-install/.test(out.ask)) fail("picking GitHub in the ask still shows the collaborator steps, not Install on GitHub");

// ── part 3 · the wiring ────────────────────────────────────────────────────────────────────────────────────
const iFin = P.indexOf("_ghaRes = await ghAppFinish(_gha, session.access_token, _ghaClient);"), iLoad = P.indexOf("safe(loadPortalOnboardingProgress(supabase, portalClients), {})"), iRender = P.indexOf("ghAppAnnounce(_ghaRes, _ghaClient);");
if (iFin < 0 || iLoad < 0 || iFin > iLoad || iRender < iLoad) fail("the portal doesn't finish GitHub's install before it loads the records (so the step would draw stale)");
const iOut = P.indexOf("const j = await ghAppFinish(_ghaOut, \"\", \"\");"), iSigned = P.indexOf("showStatus(new URLSearchParams(window.location.search).get(\"dup_owner\")");
if (iOut < 0 || iSigned < 0 || iOut > iSigned || !/github_app_done: \{/.test(P) || !/github_app_wrong: \{/.test(P)) fail("the person who manages their GitHub (no portal sign-in) lands on the sign-in screen instead of the install finishing");
if (!/if \(ghAppWanted\(t\) && !_rcEditing\.has\(step\.id\)\) return ghAppCardHtml\(t, clientId\);/.test(P) || P.indexOf("return ghAppCardHtml(t, clientId)") > P.indexOf('if (ci && ["invite", "designer", "request", "workaround"].includes(ci.via) && !acc')) fail("the access card doesn't show Install on GitHub before the invite-sent card");
if (!/s3state === "gh" \? "" : accPart\(3,/.test(P)) fail("picking GitHub still asks the client to tell RGA when it's done");
if (!/acc\.via === "github_app"\s*\? \[\[`RGA's app is installed on \$\{escapeHtml\(acc\.repo/.test(A) || !/is their website`, acc\.found_in && acc\.domain/.test(A)) fail("admin's step 3 doesn't show the app's install and the repository check");
if (!/let \{ ok: repoIsSite, how \} = await repoIsSiteCheck\(\{ repo: acc\.repo, site, token: d\.token, fetch: d\.fetch \}\);/.test(PSRC)) fail("the upload's repository check and the install's aren't the same check");

if (bad.length) { console.error(`❌ the client installs RGA's app — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ a client installs RGA's GitHub app from their portal: the link carries a signed state (forged, expired or other-client refused), GitHub confirms the installation, only the repository that IS their website is recorded (not their site / two that name it / couldn't check → nothing written), the grant is via github_app, read back, recorded, re-read before the write, step 9 settles; the portal shows Install on GitHub word for word, the link for whoever manages their GitHub, checking then done, Switch to RGA's app for invited clients, and nothing for non-GitHub sites; admin shows the install");
