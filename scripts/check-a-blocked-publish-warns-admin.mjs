#!/usr/bin/env node
/**
 * check-a-blocked-publish-warns-admin.mjs — WHAT STOPS A CLIENT'S WEBSITE CHANGES FROM GOING LIVE IS A RED WARNING IN ADMIN (approved
 * admin_publish_blocked_warning, the owner 11-8: "i want to be notified inside admin of anythign thats preventing the build").
 * Part 1 runs the five checks (_publish-blocked.js) against made-up sites behind a fake GitHub and a fake live site: a made-up
 * plumber whose live site matches its repository, then one thing broken at a time. Only a found problem warns; a check that couldn't
 * run never does. Part 2 renders the warning, the step tag and the System health row in Chrome with admin.css. Part 3 pins the wiring
 * (nightly, before each pull request, the client page). Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
let PB, A, CSS, IDX, DEL, TOML, MAN, puppeteer;
try {
  PB = req(`${SITE}/netlify/functions/_publish-blocked.js`);
  A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); CSS = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8"); IDX = fs.readFileSync(`${SITE}/admin/index.html`, "utf8");
  DEL = fs.readFileSync(`${SITE}/netlify/functions/admin-deliverables.js`, "utf8"); TOML = fs.readFileSync(`${SITE}/netlify.toml`, "utf8"); MAN = fs.readFileSync(`${SITE}/netlify/functions/_job-manifest.js`, "utf8");
  puppeteer = req("puppeteer-core");
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

// ── part 1 · the five checks against fakes ─────────────────────────────────────────────────────────────────────────────────
const HOME = "https://acme-plumbing.test", REPO = "acme/site";
const page = (h1, extra = "") => `<html><head><title>${h1}</title></head><body><h1>${h1}</h1><p>Licensed plumbers.</p>${extra}</body></html>`;
const base = () => ({
  repo: { "index.html": page("Acme Plumbing", '<img src="/img/van.jpg">'), "services/drains/index.html": page("Drain cleaning"), "img/van.jpg": "x" },
  live: null, me: { status: 200, login: "rocketgrowthagency-admin" }, perm: { push: true }, liveDown: false,
});
function fakeFetch(s) {
  const live = s.live || s.repo;
  return async (url, init = {}) => {
    const u = new URL(url), r = (status, body = "") => ({ ok: status >= 200 && status < 300, status, text: async () => String(body), json: async () => JSON.parse(body) });
    if (u.host === "api.github.com") {
      if (u.pathname === "/user") return s.me.status === 200 ? r(200, JSON.stringify({ login: s.me.login })) : r(s.me.status, "{}");
      if (u.pathname === `/repos/${REPO}`) return r(200, JSON.stringify({ permissions: s.perm }));
      if (u.pathname === `/repos/${REPO}/git/trees/HEAD`) return r(200, JSON.stringify({ tree: Object.keys(s.repo).map((p) => ({ path: p, type: "blob" })) }));
      const m = u.pathname.match(new RegExp(`^/repos/${REPO}/contents/(.+)$`));
      if (m) { const p = decodeURIComponent(m[1]); return p in s.repo ? r(200, s.repo[p]) : r(404); }
      return r(404);
    }
    if (s.liveDown) throw new Error("timeout");
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    return p in live ? r(200, init.method === "HEAD" ? "" : live[p]) : r(404);
  };
}
const GH = { status: "done", access: { repo: REPO, confirmed_at: "2026-10-01T00:00:00Z" } };
const run = (s, tasks = { "m1.access.website": GH }, now = Date.parse("2026-11-08T12:00:00Z")) => PB.publishChecks({ client: { website_url: HOME }, tasks, token: "t", fetch: fakeFetch(s), now });
const byId = (r, id) => r.checks.find((c) => c.id === id) || {};
try {
  const ok = await run(base());
  if (ok.ok !== true || ok.problems.length) fail(`a site whose live pages are its repository warns (${ok.problems.join(" | ")})`);
  if (byId(ok, "builder").ok !== null) fail("the builder check passes on a GitHub site instead of saying it isn't used");

  const stale = base(); stale.live = { ...stale.repo, "index.html": page("Acme Plumbing & Drains", '<img src="/img/van.jpg">'), "services/drains/index.html": page("Drain cleaning, 24/7") };
  const r1 = await run(stale);
  if (r1.ok !== false || byId(r1, "matches").ok !== false || !/isn't built from its GitHub repository/.test(r1.problems.join(" "))) fail("a live site that isn't its repository doesn't warn");
  const one = base(); one.live = { ...one.repo, "services/drains/index.html": page("Drain cleaning, 24/7") };
  if (byId(await run(one), "matches").ok !== true) fail("one page just changed (a merge on its way) reads as a site not built from its repository");

  const vids = base(); vids.repo["v/joe/index.html"] = page("A video for Joe", '<video src="video.mp4?v=3"></video>'); vids.live = { ...vids.repo, "v/joe/video.mp4": "mp4" };
  const r2 = await run(vids);
  if (byId(r2, "nothing_lost").ok !== false || !/videos the repository doesn't \(under \/v\/\)/.test(r2.problems.join(" "))) fail(`files on the live site the repository doesn't hold don't warn (${byId(r2, "nothing_lost").line})`);
  const gone = base(); gone.repo["v/joe/index.html"] = page("A video for Joe", '<video src="video.mp4"></video>');
  if (byId(await run(gone), "nothing_lost").ok === false) fail("a file missing on BOTH sides reads as one a deploy would remove");

  const refused = base(); refused.me = { status: 401 };
  const r3 = await run(refused);
  if (byId(r3, "connection").ok !== false || r3.ok !== false) fail("a refused GitHub key doesn't warn");
  const ro = base(); ro.perm = { pull: true };
  if (byId(await run(ro), "connection").ok !== false) fail("read-only access to their repository doesn't warn");

  const gen = base(); delete gen.repo["index.html"]; gen.repo["package.json"] = "{}"; gen.repo["src/index.jsx"] = "x";
  const r4 = await run(gen);
  if (r4.ok === false || byId(r4, "matches").ok !== null) fail("a site generator's repository (source, not pages) warns instead of saying it couldn't compare");

  const down = base(); down.liveDown = true;
  const r5 = await run(down);
  if (r5.ok === false) fail(`a live site that didn't answer warns (${r5.problems.join(" | ")}): couldn't check is never a problem`);

  const merged = { "m1.access.website": GH, "m1.web.schema": { site_change: { v: "2" }, approval: { decision: "approved", change_v: "2" }, publish_pr: { v: "2", number: 4, merged: { at: "2026-11-08T10:30:00Z" } } } };
  const r6 = await run(base(), merged);
  if (byId(r6, "goes_live").ok !== false || !r6.steps.includes("m1.web.schema")) fail("a change merged over an hour ago and not live doesn't warn, or its step isn't named");
  if (byId(await run(base(), merged, Date.parse("2026-11-08T11:00:00Z")), "goes_live").ok !== true) fail("a change merged 30 minutes ago already warns");

  const builder = await run(base(), { "m1.access.website": { status: "done", access: { via: "invite", confirmed_at: "2026-10-01T00:00:00Z" } } });
  if (builder.ok !== true || byId(builder, "builder").ok !== true) fail("a site builder with confirmed access warns");
  const none = await run(base(), { "m1.access.website": { status: "done", access: {} } });
  if (none.ok !== false || byId(none, "connection").ok !== false) fail("a finished access step with no way to publish doesn't warn");
  const fresh = await run(base(), {});
  if (fresh.ok === false) fail("a new client before the website access step warns");

  if (!PB.sameReading(r1, { ...r1, at: "later" }) || PB.sameReading(r1, ok)) fail("the same reading would be written again, or a changed one wouldn't");
  if (ok.steps.length) fail("a clear reading names blocked steps");
} catch (e) { console.error(`⚠️  INDETERMINATE — the checks threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }

// ── part 2 · rendered in Chrome ────────────────────────────────────────────────────────────────────────────────────────────
const lift = (name) => { const i = A.indexOf(`function ${name}(`); if (i < 0) return null; let d = 0; for (let k = A.indexOf("{", A.indexOf(")", i)); k < A.length; k++) { if (A[k] === "{") d++; else if (A[k] === "}") { d--; if (!d) return A.slice(i, k + 1); } } return null; };
const code = ["publishBlockedHtml", "pbTagHtml", "publishBlockedRowsHtml"].map(lift);
if (code.some((x) => !x)) { console.error("⚠️  INDETERMINATE — publishBlockedHtml, pbTagHtml or publishBlockedRowsHtml moved"); process.exit(2); }
const reading = { ok: false, at: "2026-11-08T12:45:00Z", problems: ["The live site isn't built from its GitHub repository.", "The live site has videos the repository doesn't (under /v/)."], steps: ["m1.web.schema", "m1.web.blog_seed"],
  checks: [{ id: "connection", ok: true, line: "The publishing connection works", detail: "Write access." }, { id: "matches", ok: false, line: "The live site isn't built from its GitHub repository.", detail: "6 of 7 pages differ.", fix: "Point their host at the repository." }, { id: "builder", ok: null, line: "Not used", detail: "GitHub." }] };
const b = await puppeteer.launch({ headless: "new", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
let out;
try {
  const pg = await b.newPage(); await pg.setViewport({ width: 1000, height: 900 });
  await pg.setContent(`<style>${CSS}</style><div id="h" style="padding:20px"></div><div id="s"></div>`);
  out = await pg.evaluate(({ code, reading }) => {
    const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml;
    const NUM = { "m1.web.schema": 41, "m1.web.blog_seed": 48 }, obNumberOf = (id) => NUM[id] || null;
    const PB_NOT_SHOWN = new Set(["Not used"]);
    const state = { selectedClient: { id: "c1" } }, PB = { clientId: "c1", reading };
    const api = eval(`(() => { ${code.join("\n")}; return { publishBlockedHtml, pbTagHtml, publishBlockedRowsHtml }; })()`);
    const h = document.getElementById("h");
    h.innerHTML = api.publishBlockedHtml(reading, { open: false });
    const closed = { text: h.textContent.replace(/\s+/g, " ").trim(), chips: [...h.querySelectorAll(".pbw-chip")].map((x) => x.textContent), detailsHidden: h.querySelector(".pbw-details").hidden, red: getComputedStyle(h.querySelector(".pbw-warn")).backgroundColor, btn: !!h.querySelector("button[data-pb-details]") };
    h.innerHTML = api.publishBlockedHtml(reading, { open: true });
    const open = { text: h.querySelector(".pbw-details").textContent.replace(/\s+/g, " ").trim(), visible: h.querySelector(".pbw-details").offsetHeight > 0 };
    const none = [api.publishBlockedHtml({ ...reading, ok: true }), api.publishBlockedHtml({ ...reading, ok: null }), api.publishBlockedHtml(null)];
    const tag = api.pbTagHtml("m1.web.schema"), noTag = api.pbTagHtml("m1.web.tracking");
    PB.clientId = "other"; const otherTag = api.pbTagHtml("m1.web.schema");
    document.getElementById("s").innerHTML = api.publishBlockedRowsHtml([{ client_id: "c1", name: "Acme Plumbing", problems: reading.problems }]);
    const row = document.getElementById("s");
    return { closed, open, none, tag, noTag, otherTag, row: { text: row.textContent.replace(/\s+/g, " ").trim(), open: !!row.querySelector('[data-open-client="c1"]') } };
  }, { code, reading });
} catch (e) { console.error(`⚠️  INDETERMINATE — the warning wouldn't render: ${String(e.message).split("\n")[0]}`); process.exit(2); } finally { await b.close(); }
const C = out.closed;
if (!/^!\s*Website changes can't go live/.test(C.text) || !C.text.includes(reading.problems[0]) || !C.text.includes(reading.problems[1])) fail(`the warning doesn't say it can't go live with each problem on its own line (${C.text.slice(0, 120)})`);
if (C.chips.join(",") !== "41,48" || !/Steps 41 ?48/.test(C.text)) fail(`the blocked steps aren't chips by number (${C.chips})`);
if (!C.btn || !C.detailsHidden) fail("Details isn't a button, or the details show before it's pressed");
if (!/rgb\(254, 233, 232\)/.test(C.red)) fail(`the warning isn't red (${C.red})`);
if (!out.open.visible || !/6 of 7 pages differ/.test(out.open.text) || !/Would fix it: Point their host/.test(out.open.text) || /Not used/.test(out.open.text) || !/Clears by itself once the check passes/.test(out.open.text)) fail(`Details doesn't say how we know, what would fix it and that it clears (${out.open.text.slice(0, 160)})`);
if (out.none.some((x) => x !== "")) fail("a reading that passed, couldn't check, or is missing still shows the warning");
if (!/Can't go live/.test(out.tag) || out.noTag || out.otherTag) fail("the step tag is missing on a blocked step, on another step, or carried to another client");
if (!/Website work blocked · Acme Plumbing/.test(out.row.text) || !out.row.open) fail("the System health row doesn't name the client with Open to it");

// ── part 3 · the wiring ─────────────────────────────────────────────────────────────────────────────────────────────────────
if ((A.match(/\$\{badge\}\$\{pbTagHtml\(o\.flowId\)\}/g) || []).length < 5) fail("the step rows don't carry the tag");
if (!/loadPublishBlocked\(state\.selectedClient\.id\)/.test(A) || !/<div id="publishBlockedBanner" hidden><\/div>/.test(IDX)) fail("the client page doesn't read the newest reading into its warning");
if (!/publishBlockedRowsHtml\(blocked\)\}\$\{alerts\}/.test(A) || !/\$\{pbRows\}<\/div>`;/.test(A)) fail("System health (full or on the Dashboard) doesn't list blocked clients");
const openPr = DEL.slice(DEL.indexOf('if (act === "open_pr")'), DEL.indexOf("// 🔒 ONLY THE APPROVED BUILD UPLOADS"));
if (!/PB\.publishChecks\(/.test(openPr) || !/PB\.saveReading\(/.test(openPr) || !/if \(pub\.ok === false\) return json\(409/.test(openPr)) fail("a pull request can open without the publish checks, or a found problem doesn't stop it");
if (!/\[functions\."site-publish-check"\]\s*\n\s*schedule = "45 12 \* \* \*"/.test(TOML) || !/job: "site-publish-check"[^\n]*cron: "45 12 \* \* \*"/.test(MAN)) fail("the nightly check isn't scheduled, or isn't on System health's list");

if (bad.length) { console.error(`❌ a blocked publish warns admin — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ what stops website changes going live is a red warning in admin: the five checks find a stale repository, files a deploy would remove, a refused or read-only key, a merge that didn't go live and no way to publish; a site generator, a site that didn't answer and a new client never warn; the warning, Details, step tags and System health row render; nightly and before each pull request");
