#!/usr/bin/env node
/**
 * check-the-host-builds-rgas-changes.mjs — SETUP PROVES THE CLIENT'S HOST BUILDS RGA'S CHANGES (approved website_access_host_builds_v1, the
 * owner 11-8: "we must fix in the portal setup for ALL CLIENTS and UNIVERSAL"). Netlify refused RGA Admin's commits on RGA's own private repo
 * ("unrecognized Git contributor"), and the 10-28 access test hadn't caught it because it went live through the Mac deploy.
 * Part 1 runs _host-check.js against a fake GitHub: once access is confirmed a hidden test pull request opens (never merged), the host's own
 * report decides built / refused / no report, the test is always tidied, a refusal blocks only while RGA merges. Part 2 renders the portal
 * row + fix and the admin row in Chrome. Part 3 pins the wiring. Exit 0 = holds · 1 = doesn't · 2 = couldn't tell.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
let HC, P, A, PCSS, ACSS, SPW, PMC, PB, puppeteer;
try {
  HC = req(`${SITE}/netlify/functions/_host-check.js`);
  P = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  PCSS = fs.readFileSync(`${SITE}/portal/portal.css`, "utf8"); ACSS = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
  SPW = fs.readFileSync(`${SITE}/netlify/functions/site-publish-watch.js`, "utf8"); PMC = fs.readFileSync(`${SITE}/netlify/functions/portal-merge-choice.js`, "utf8");
  PB = req(`${SITE}/netlify/functions/_publish-blocked.js`);
  puppeteer = req("puppeteer-core");
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

// ── part 1 · the check against a fake GitHub ───────────────────────────────────────────────────────────────
const REPO = "acme/site";
function gh(o = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetch = async (url, init = {}) => {
    const u = new URL(url), m = (init.method || "GET").toUpperCase(), p = u.pathname;
    calls.push(`${m} ${p}`);
    if (p === `/repos/${REPO}` && m === "GET") return o.noWrite ? res(200, { permissions: { pull: true }, default_branch: "main" }) : res(200, { permissions: { push: true }, default_branch: "main" });
    if (p.startsWith(`/repos/${REPO}/contents/`) && m === "GET") return res(404, {});
    if (p === `/repos/${REPO}/git/ref/heads/main`) return res(200, { object: { sha: "base1" } });
    if (p === `/repos/${REPO}/git/refs` && m === "POST") return res(201, {});
    if (p.startsWith(`/repos/${REPO}/contents/`) && m === "PUT") { o.put = JSON.parse(init.body); o.putPath = p; return res(201, {}); }
    if (p === `/repos/${REPO}/pulls` && m === "POST") return res(201, { number: 7, html_url: "https://github.com/acme/site/pull/7" });
    if (p === `/repos/${REPO}/pulls/7` && m === "GET") return res(200, { merged: false, state: "open", head: { sha: "head7" }, base: { ref: "main" } });
    if (p === `/repos/${REPO}/pulls/7` && m === "PATCH") return res(200, {});
    if (p.startsWith(`/repos/${REPO}/git/refs/heads/rga/host-check-`) && m === "DELETE") return res(204, {});
    if (p === `/repos/${REPO}/pulls/7/merge`) { o.merged = true; return res(200, {}); }
    if (p === `/repos/${REPO}/commits/head7/status`) return res(200, { statuses: o.statuses || [] });
    if (p === `/repos/${REPO}/commits/head7/check-runs`) return res(200, { check_runs: o.checks || [] });
    return res(404, {});
  };
  return { fetch, calls, o };
}
const T0 = Date.parse("2026-11-08T12:00:00Z");
const ACC = { status: "done", access: { repo: REPO, confirmed_at: "2026-11-08T11:00:00Z" } };
const step = (g, task, now = T0) => HC.step({ token: "t", fetch: g.fetch, task, now });
try {
  if (HC.due({}) || HC.due({ access: { repo: REPO } }) || HC.due({ ...ACC, change_request: { at: "x" } }) || !HC.due(ACC)) fail("the check runs without a confirmed GitHub connection, or while access is being changed, or not when it should");
  const g1 = gh(); const s1 = await step(g1, ACC);
  if (!s1 || s1.state !== "checking" || s1.pr.number !== 7 || !/^rga\/host-check-/.test(s1.pr.branch)) fail(`confirmed access doesn't open the hidden test pull request (${JSON.stringify(s1)})`);
  const page = Buffer.from(g1.o.put.content, "base64").toString("utf8");
  if (!/noindex/.test(page) || !/\/rga-host-check-[a-z0-9]+\/index\.html$/.test(g1.o.putPath) || g1.o.merged) fail("the test change isn't a hidden page, or it was merged");
  const checking = { ...ACC, host_check: s1 };
  const built = await step(gh({ statuses: [{ context: "netlify/acme/deploy-preview", state: "success", description: "Deploy Preview ready!", target_url: "https://app.netlify.com/x" }] }), checking, T0 + 5 * 60e3);
  if (!built || built.state !== "built" || built.host !== "Netlify") fail(`a host that built the test isn't recorded as built (${JSON.stringify(built)})`);
  const g3 = gh({ statuses: [{ context: "netlify/acme/deploy-preview", state: "failure", description: "Deploy Preview failed.", target_url: "" }] });
  const refused = await step(g3, checking, T0 + 5 * 60e3);
  if (!refused || refused.state !== "refused" || refused.host !== "Netlify" || !/failed/.test(refused.detail)) fail(`a host that refused the test isn't recorded as refused (${JSON.stringify(refused)})`);
  if (!g3.calls.includes("PATCH /repos/acme/site/pulls/7") || !g3.calls.some((c) => /^DELETE \/repos\/acme\/site\/git\/refs\/heads\/rga\/host-check-/.test(c))) fail("a finished test isn't closed and its branch deleted");
  if (await step(gh({ statuses: [{ context: "netlify/acme/deploy-preview", state: "pending", description: "", target_url: "" }] }), checking, T0 + 5 * 60e3) !== null) fail("a build still running is decided early");
  // one of its checks done while the build itself still runs: not decided yet
  if (await step(gh({ statuses: [{ context: "netlify/acme/deploy-preview", state: "pending", description: "Deploy Preview processing", target_url: "" }], checks: [{ name: "Pages changed - acme", app: { slug: "netlify" }, status: "completed", conclusion: "success", output: { title: "1 page" } }] }), checking, T0 + 5 * 60e3) !== null) fail("a host still building is called built because one of its checks finished");
  const late = await step(gh({}), checking, T0 + 40 * 60e3);
  if (!late || late.state !== "no_report") fail("no report for 30 minutes isn't 'no report'");
  const vercel = HC.readVerdict({ statuses: [], checks: [{ name: "Deployment", app: "vercel", status: "completed", conclusion: "failure", title: "Git author must have access" }] });
  if (vercel.verdict !== "refused" || vercel.host !== "Vercel") fail("a host's failed check run isn't read as a refusal");
  if (HC.readVerdict({ statuses: [{ context: "ci/tests", state: "failure", description: "lint", url: "" }], checks: [] }).verdict !== "none") fail("their own CI failing reads as the host refusing");
  const cant = await step(gh({ noWrite: true }), ACC);
  if (!cant || cant.state !== "cant_open") fail("a test that couldn't open isn't said");
  if (!HC.blocks({ ...ACC, host_check: refused }) || HC.blocks({ ...ACC, host_check: refused, merge_by: { by: "client" } }) || HC.blocks({ ...ACC, host_check: built })) fail("a refusal doesn't block while RGA merges, or still blocks once the client merges");
  const g4 = gh(); const again = await step(g4, { ...ACC, host_check: { ...refused, state: "recheck" } });
  if (!again || again.state !== "checking" || !g4.calls.includes("PATCH /repos/acme/site/pulls/7")) fail("asking to check again doesn't open a fresh test (and close the old)");
  if (HC.due({ ...ACC, host_check: built }) || HC.due({ ...ACC, host_check: refused })) fail("a decided check runs again by itself");
  // the website warning reads it
  const pub = await PB.publishChecks({ client: { website_url: "" }, tasks: { "m1.access.website": { ...ACC, host_check: refused } }, token: "", fetch: async () => { throw new Error("off"); }, now: T0 });
  const gl = pub.checks.find((c) => c.id === "goes_live");
  if (!gl || gl.ok !== false || !/Netlify didn't build RGA's test change/.test(gl.line)) fail(`the website warning doesn't say the host refused RGA's changes (${gl && gl.line})`);
} catch (e) { console.error(`⚠️  INDETERMINATE — the check threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }

// ── part 2 · the portal row + fix and the admin row, rendered ─────────────────────────────────────────────
const liftFn = (src, name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) return null; let d = 0; for (let k = src.indexOf("{", src.indexOf(")", i)); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); } } return null; };
const lineOf = (src, start) => { const i = src.indexOf(start); return i < 0 ? null : src.slice(i, src.indexOf("\n", i)); };
const pcode = [lineOf(P, "const csEv = "), liftFn(P, "hostCheckParts"), liftFn(P, "hostFixHtml")];
const acode = [liftFn(A, "hostCheckAdminHtml")];
if ([...pcode, ...acode].some((x) => !x)) { console.error("⚠️  INDETERMINATE — the host-check render functions moved"); process.exit(2); }
const b = await puppeteer.launch({ headless: "new", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
let out;
try {
  const pg = await b.newPage();
  await pg.setContent(`<style>${PCSS}</style><style>${ACSS}</style><div id="p" style="width:640px"></div><div id="a" style="width:900px"></div>`);
  out = await pg.evaluate(({ pcode, acode }) => {
    const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml;
    const monthDay = () => "Nov 8", acDay = () => "Nov 8", CS_ICON = { ok: "✓", rga: "↻", bad: "✕" };
    const api = eval(`(() => { ${pcode.join("\n")}\n${acode.join("\n")}; return { hostCheckParts, hostCheckAdminHtml }; })()`);
    const acc = { repo: "acme/site", confirmed_at: "x" }, pr = { number: 7, url: "https://github.com/acme/site/pull/7" };
    const P = (hc, by) => { const r = api.hostCheckParts({ access: acc, host_check: hc, merge_by: by ? { by } : undefined }, "c1"); const el = document.getElementById("p"); el.innerHTML = r.row + r.fix; return { text: el.textContent.replace(/\s+/g, " ").trim(), fix: !!r.fix, opts: [...el.querySelectorAll("input[type=radio]")].map((i) => i.value + (i.checked ? "*" : "")), save: !!el.querySelector("[data-merge-save]") }; };
    const Ad = (hc, by) => { const el = document.getElementById("a"); el.innerHTML = api.hostCheckAdminHtml({ access: acc, host_check: hc, merge_by: by ? { by } : undefined }); return el.textContent.replace(/\s+/g, " ").trim(); };
    return {
      checking: P(null), built: P({ state: "built", host: "Netlify", read_at: "x" }), refused: P({ state: "refused", host: "Netlify", detail: "Deploy Preview failed.", pr }), merges: P({ state: "refused", host: "Netlify", pr }, "client"), noRepo: api.hostCheckParts({ access: {} }, "c1"),
      aChecking: Ad({ state: "checking", pr }), aBuilt: Ad({ state: "built", host: "Netlify", pr }), aRefused: Ad({ state: "refused", host: "Netlify", detail: "Deploy Preview failed.", pr }), aMerges: Ad({ state: "refused", host: "Netlify", pr }, "client"), aNone: Ad({ state: "no_report", host: "Netlify" }),
    };
  }, { pcode, acode });
} catch (e) { console.error(`⚠️  INDETERMINATE — the rows wouldn't render: ${String(e.message).split("\n")[0]}`); process.exit(2); } finally { await b.close(); }
if (!/Checking your host builds RGA's changes ?A hidden test page, about 5 minutes\. Nothing for you to do\./.test(out.checking.text) || out.checking.fix) fail(`the portal doesn't say it's checking (${out.checking.text})`);
if (!/Netlify built RGA's test change ?A private preview, then removed\. Your website didn't change\./.test(out.built.text)) fail(`the portal doesn't say the host built it (${out.built.text})`);
if (!/Netlify didn't build RGA's test change/.test(out.refused.text) || !out.refused.fix || out.refused.opts.join(",") !== "client*,rga_recheck" || !out.refused.save || !/I'll merge RGA's changes myself/.test(out.refused.text) || !/Add RGA on Netlify/.test(out.refused.text) || !/rocketgrowthagency-admin/.test(out.refused.text)) fail(`a refusal doesn't offer the two fixes (${out.refused.text} · ${out.refused.opts})`);
if (!/You merge RGA's changes yourself/.test(out.merges.text) || out.merges.fix) fail("once the client merges themselves, the fix still shows");
if (out.noRepo.row || out.noRepo.fix) fail("a site without GitHub shows the host check");
if (!/Checking their host builds RGA's changes/.test(out.aChecking) || !/test pull request #7/.test(out.aChecking)) fail(`admin doesn't show the check running with its pull request (${out.aChecking})`);
if (!/Netlify builds RGA's changes.*Proven/.test(out.aBuilt) || !/Netlify didn't build RGA's test change.*Can't go live/.test(out.aRefused) || !/The client merges RGA's changes themselves/.test(out.aMerges) || !/didn't report/.test(out.aNone)) fail(`admin's row doesn't read each state (${out.aRefused})`);

// ── part 3 · the wiring ───────────────────────────────────────────────────────────────────────────────────
if (!/HC\.due\(task\)/.test(SPW) || !/HC\.step\(\{ token: process\.env\.GITHUB_ADMIN_TOKEN/.test(SPW) || !/readStepRecord\(supa, row\.client_id, "m1\.access\.website"\)/.test(SPW) || !/host_check: next/.test(SPW)) fail("the publish watcher doesn't run the check, or writes without reading the record again");
if (!/\+ hostCheckParts\(t, clientId\)\.row/.test(P) || !/hostCheckParts\(t, clientId\)\.fix \|\| accMergeChoiceHtml\(t, clientId\)/.test(P)) fail("the portal's access card doesn't show the host check");
if (!/const recheck = pick === "rga_recheck"/.test(P) || !/const recheck = body\.recheck === true && by === "rga"/.test(PMC) || !/state: "recheck"/.test(PMC)) fail("'Add RGA on the host' doesn't ask for the check again");
if (!/\$\{accessDoneMiniHtml\(s\.task, ask\)\}\$\{hostCheckAdminHtml\(s\.task\)\}/.test(A)) fail("admin's access step doesn't show the host check");

if (bad.length) { console.error(`❌ the host check — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ setup proves the client's host builds RGA's changes: a hidden test pull request opens once access is confirmed (never merged, always tidied), the host's own report decides built / refused / no report (their own CI never counts), a refusal blocks only while RGA merges and the website warning says so; the portal offers merge-myself or add-RGA (which checks again); admin shows each state");
