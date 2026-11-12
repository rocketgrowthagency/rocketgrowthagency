#!/usr/bin/env node
// check-video-cta-keeps-the-lead.mjs: AN AUDIT REQUEST FROM A VIDEO PAGE OR A FOLLOW-UP EMAIL IS MATCHED TO ITS LEAD (master audit #7 + #15, 11-11).
//
// 🔴 WHY: every v/<slug> page links the audit as /free-growth-audit/?...&lead=<slug>, and every follow-up email as /growth-audit/?ref=dayN&lead=<recId>
// (301 to /free-growth-audit/, query kept). The audit form filled its hidden "vid" field ONLY from ?vid= (script.js), so the field went out empty and
// fga-intake matched on email or business name alone: a prospect who typed another email or name was never linked (Leads.Audit Form Submitted = 0
// against 60 CTA clicks). And the match it did make set Status "booked" and stamped "Date FGA Delivered" before any report existed.
//
// HOLDS:
//   1  The REAL script.js in jsdom, on the audit page: ?lead=<slug>, ?vid=<slug> and ?lead=<Airtable id> each fill the hidden field; junk
//      (markup, spaces, a full address) fills nothing; the lead is kept for the tab's session, so the home page form a click later still carries it;
//      the submitted form body carries vid=<the lead>.
//   2  Every video page's audit link passes lead=<its own slug> (or vid=), and the Apps Script's follow-up audit link passes lead=${leadId}.
//   3  The REAL fga-intake match against a fake Airtable: a slug is searched ALONE first ({Vid Slug} = "<slug>"), and wins over a name match; an
//      Airtable id is read directly; an unknown slug falls back to email / name; the write is honest (Audit Form Submitted, Pipeline Stage
//      audit_submitted) with no Status "booked" and no "Date FGA Delivered".
// PROVES ITSELF: the same checks MUST fail on the website as it was before this build (--against=<rev>, default 95ad5f5c), in 4+ ways, or it exits 2.
// Files and fakes only: nothing real is read or written, no form is sent.   node scripts/check-video-cta-keeps-the-lead.mjs [--against=<rev>] [--no-before]
// Exit 0 holds · 1 something is wrong · 2 can't tell.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const argv = process.argv.slice(2);
const BEFORE_REV = (argv.find((a) => a.startsWith("--against=")) || "").slice(10) || "95ad5f5c";
const NO_BEFORE = argv.includes("--no-before");
const MIN_BEFORE_FAILS = 4;
const SLUG = "acme-plumbing-austin", REC = "recLEADabcdefgh01";
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require("jsdom")); } catch (e) { console.log(`INDETERMINATE: jsdom is missing (${e.message})`); process.exit(2); }

// ── 1 · the browser side ──
const FORM = `<div class="form-card"><form name="audit" data-audit-form>
  <input name="name" value="Pat Owner"><input name="businessName" value="Acme Plumbing"><input name="email" value="pat@acme.example">
  <input name="website" value="acme.example"><input name="phone" value=""><input type="hidden" name="vid" id="audit-vid" value="">
  <input type="hidden" name="source" id="audit-source" value=""><button type="submit">Send My Audit</button></form></div><footer class="footer"></footer>`;
/** One page load of the real script.js. carry = the tab's sessionStorage from the page before (a click within the same visit). */
async function page(src, url, carry = null) {
  const dom = new JSDOM(`<!doctype html><html><body>${FORM}</body></html>`, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, posts = [];
  if (carry) for (const [k, v] of Object.entries(carry)) w.sessionStorage.setItem(k, v);
  w.fetch = async (u, init = {}) => { posts.push({ url: String(u), body: String(init.body || "") }); return { ok: true, status: 200, json: async () => ({ success: true }) }; };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.IntersectionObserver = class { observe() {} };
  w.eval(src);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const field = w.document.querySelector("[name='vid']").value;
  const storage = {}; for (let i = 0; i < w.sessionStorage.length; i++) { const k = w.sessionStorage.key(i); storage[k] = w.sessionStorage.getItem(k); }
  return { w, field, storage, posts };
}
async function browserChecks(root, fail) {
  let src; try { src = fs.readFileSync(path.join(root, "script.js"), "utf8"); } catch { fail("script.js is missing"); return; }
  const A = "https://www.rocketgrowthagency.com/free-growth-audit/";
  const cta = await page(src, `${A}?utm_source=cold-email&utm_medium=video&utm_campaign=outreach&utm_content=${SLUG}&lead=${SLUG}`);
  if (cta.field !== SLUG) fail(`the video page CTA (?lead=${SLUG}) leaves the hidden field ${JSON.stringify(cta.field)}`);
  const vid = await page(src, `${A}?vid=${SLUG}`);
  if (vid.field !== SLUG) fail(`?vid=${SLUG} leaves the hidden field ${JSON.stringify(vid.field)}`);
  const mail = await page(src, `${A}?ref=day9&lead=${REC}&utm_source=outreach&utm_medium=email`);
  if (mail.field !== REC) fail(`a follow-up email's ?lead=<Airtable id> leaves the hidden field ${JSON.stringify(mail.field)}`);
  for (const junk of ["<script>alert(1)</script>", "acme plumbing", "https://evil.example/x", "-dash-first", "a".repeat(200)]) {
    const j = await page(src, `${A}?lead=${encodeURIComponent(junk)}`);
    if (j.field) fail(`?lead=${JSON.stringify(junk.slice(0, 30))} was put in the form (${JSON.stringify(j.field.slice(0, 30))}); only a slug or a record id may be`);
  }
  const home = await page(src, "https://www.rocketgrowthagency.com/", cta.storage);
  if (home.field !== SLUG) fail(`a click later in the same visit (the home page form, no query) the lead is gone (${JSON.stringify(home.field)})`);
  const fresh = await page(src, "https://www.rocketgrowthagency.com/");
  if (fresh.field) fail(`a new visit with no lead carries one (${JSON.stringify(fresh.field)})`);
  // the submitted body
  const form = cta.w.document.querySelector("[data-audit-form]");
  form.dispatchEvent(new cta.w.Event("submit", { cancelable: true, bubbles: true }));
  for (let i = 0; i < 20 && !cta.posts.some((p) => p.url === "/"); i++) await new Promise((r) => setTimeout(r, 10));
  const post = cta.posts.find((p) => p.url === "/");
  if (!post) fail("the audit form did not submit in the fixture (the check can't see the body)");
  else if (!new URLSearchParams(post.body).get("vid") || new URLSearchParams(post.body).get("vid") !== SLUG) fail(`the submitted form carries vid=${JSON.stringify(new URLSearchParams(post.body).get("vid"))}, not the lead`);
}

// ── 2 · the links that bring people here ──
function linkChecks(root, fail) {
  // a mutation copy and a revision export carry no v/ (1,599 folders): the video pages are then read from the main checkout
  const vdir = fs.existsSync(path.join(root, "v")) ? path.join(root, "v") : "/Users/chris/RGA/Rocket Growth Agency Website VS Code/v";
  let pages = 0, linked = 0; const bad = [];
  if (fs.existsSync(vdir)) for (const slug of fs.readdirSync(vdir)) {
    let html; try { html = fs.readFileSync(path.join(vdir, slug, "index.html"), "utf8"); } catch { continue; }
    pages++;
    const hrefs = [...html.matchAll(/href="([^"]*\/(?:free-)?growth-audit\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    if (!hrefs.length) continue;
    linked++;
    for (const h of hrefs) { const q = new URL(h, "https://www.rocketgrowthagency.com").searchParams; if (q.get("lead") !== slug && q.get("vid") !== slug) bad.push(`v/${slug}: ${h.slice(0, 90)}`); }
  }
  if (pages && linked < Math.min(50, pages)) fail(`only ${linked} of ${pages} video pages link the audit at all (the reader no longer matches the pages)`);
  if (bad.length) fail(`${bad.length} video page audit link(s) don't pass the page's own slug as lead= (first: ${bad[0]})`);
  let gs = ""; try { gs = fs.readFileSync(path.join(root, "docs/apps-scripts/gmail-to-airtable.gs"), "utf8"); } catch { /* checked below */ }
  if (!/https:\/\/www\.rocketgrowthagency\.com\/(?:free-)?growth-audit\/\?[^`'"]*lead=\$\{leadId\}/.test(gs)) fail("the follow-up emails' audit link no longer passes lead=${leadId}");
  return { pages, linked };
}

// ── 3 · the match on the server ──
function loadMatcher(rootIn) {
  const root = fs.realpathSync(rootIn), fnDir = path.join(root, "netlify/functions"), file = path.join(fnDir, "fga-intake.js");
  const req = createRequire(path.join(fnDir, "x.js"));
  for (const k of Object.keys(req.cache)) if (k.startsWith(root)) delete req.cache[k];
  const stub = (name, exports) => { const f = path.join(fnDir, name); req.cache[f] = { id: f, filename: f, loaded: true, exports }; };
  stub("_fga-report-builder.js", { buildReportBundle: async () => ({}) });
  stub("_fga-airtable.js", { saveFgaSubmission: async () => ({ ok: true }) });
  stub("_supabase-lead.js", { upsertLeadIntake: async () => ({ ok: true }), cleanFirstTouch: () => ({}) });
  stub("_google-consent.js", { installGuard: () => {} });
  const m = new Module(file); m.filename = file; m.paths = Module._nodeModulePaths(fnDir);
  m._compile(`${fs.readFileSync(file, "utf8")}\nmodule.exports.__match = updateAirtableLead;`, file);
  return m.exports.__match;
}
async function serverChecks(root, fail) {
  let match; try { match = loadMatcher(root); } catch (e) { fail(`fga-intake.js won't load in the fixture (${String(e.message).slice(0, 100)})`); return; }
  const env = { AIRTABLE_API_KEY: "fake", AIRTABLE_BASE_ID: "appFAKEbase000001", AIRTABLE_TABLE_NAME: "Leads" }, saved = {};
  const records = { slug: { id: "recSLUGmatchabc01", fields: { "Vid Slug": SLUG, "Business Name": "Acme Plumbing" } }, name: { id: "recNAMEmatchabc01", fields: { "Business Name": "Acme Plumbing" } }, rec: { id: REC, fields: { "Business Name": "Acme Plumbing" } } };
  const runOne = async (vidSlug) => {
    const calls = [], patches = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u, init = {}) => {
      const url = new URL(String(u)), method = (init.method || "GET").toUpperCase(), formula = url.searchParams.get("filterByFormula") || "";
      calls.push({ method, path: decodeURIComponent(url.pathname), formula });
      const ok = (b) => ({ ok: true, status: 200, json: async () => b });
      if (method === "PATCH") { patches.push({ id: url.pathname.split("/").pop(), fields: JSON.parse(init.body).fields }); return ok({ id: "x" }); }
      if (url.pathname.endsWith(`/${REC}`)) return ok(records.rec);
      if (/\{Vid Slug\}/.test(formula) && formula.includes(`"${SLUG}"`)) return ok({ records: [records.slug] });
      if (/\{Vid Slug\}/.test(formula)) return ok({ records: [] });
      if (/Business Name|Email/.test(formula)) return ok({ records: [records.name] });
      return ok({ records: [] });
    };
    for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
    let out = null;
    const err = console.error; console.error = () => {};
    try { out = await match({ auditId: "FGA-ACME-1", contact: { email: "pat@acme.example", vidSlug }, business: { name: "Acme Plumbing" } }); }
    catch (e) { out = { threw: e.message }; }
    finally { console.error = err; globalThis.fetch = realFetch; for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
    return { out, calls, patches };
  };
  const s = await runOne(SLUG);
  if (!s.calls.length || !/^\{Vid Slug\} = "/.test(s.calls[0].formula)) fail(`a video slug is not searched on its own first (first search: ${JSON.stringify((s.calls[0] || {}).formula || "").slice(0, 120)})`);
  if (!s.patches.length || s.patches[0].id !== records.slug.id) fail(`with a slug AND a name match, the audit was put on ${s.patches[0] ? s.patches[0].id : "no lead"}, not the lead the video was for`);
  const r = await runOne(REC);
  if (!r.patches.length || r.patches[0].id !== REC) fail(`a follow-up email's Airtable id was not matched to that lead (patched ${r.patches[0] ? r.patches[0].id : "none"})`);
  const u = await runOne("someone-elses-slug");
  if (!u.patches.length || u.patches[0].id !== records.name.id) fail("an unknown slug does not fall back to the email / business name match");
  const f = (s.patches[0] || {}).fields || {};
  if (f.Status === "booked") fail('an audit REQUEST still sets the lead\'s Status to "booked" (nothing was booked)');
  if ("Date FGA Delivered" in f) fail('an audit REQUEST still stamps "Date FGA Delivered" (no report exists yet)');
  if (f["Audit Form Submitted"] !== true || f["Pipeline Stage"] !== "audit_submitted") fail("the request no longer marks Audit Form Submitted + Pipeline Stage audit_submitted");
}

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`);
  await browserChecks(root, fail);
  const L = linkChecks(root, fail);
  await serverChecks(root, fail);
  return { F, L };
}

function exportRev(rev) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cta-gate-"));
  let gitDir = process.env.WEBSITE_GIT_DIR || SITE;
  try { execFileSync("git", ["-C", gitDir, "rev-parse", "--verify", `${rev}^{commit}`], { stdio: "ignore" }); }
  catch { gitDir = "/Users/chris/RGA/Rocket Growth Agency Website VS Code"; }
  const tar = execFileSync("git", ["-C", gitDir, "archive", rev, "script.js", "netlify/functions", "shared", "data", "docs/apps-scripts"], { maxBuffer: 512 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  return dir;
}

const after = await checkTree(SITE, "after");
if (after.F.length) { console.log(`❌ an audit request can lose the lead it came from (${after.F.length}):`); after.F.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
if (!after.L.pages) { console.log("INDETERMINATE: no v/<slug> pages were found, so the video page links were not checked"); process.exit(2); }
console.log("  ✓ the audit form keeps ?lead= / ?vid= (slug or Airtable id) through the visit and submits it; junk is never put in the form");
console.log(`  ✓ ${after.L.linked} of ${after.L.pages} video pages link the audit with their own slug; the follow-ups pass lead=\${leadId}`);
console.log("  ✓ fga-intake matches the slug alone first, reads an Airtable id directly, falls back to email / name, and writes no 'booked' and no delivery date");
if (!NO_BEFORE) {
  let dir; try { dir = exportRev(BEFORE_REV); } catch (e) { console.log(`INDETERMINATE: can't read revision ${BEFORE_REV} of the website (${String(e.message).slice(0, 100)})`); process.exit(2); }
  let before; try { before = (await checkTree(dir, `before(${BEFORE_REV})`)).F; } catch (e) { before = [`the before state threw: ${e.message}`]; }
  fs.rmSync(dir, { recursive: true, force: true });
  if (before.length < MIN_BEFORE_FAILS) { console.log(`INDETERMINATE: on the before state ${BEFORE_REV} this gate finds only ${before.length} problem(s), fewer than ${MIN_BEFORE_FAILS}`); before.forEach((f) => console.log(`  · ${f}`)); process.exit(2); }
  console.log(`  ✓ proves itself: on the before state ${BEFORE_REV} it finds ${before.length} problems`);
  if (argv.includes("--verbose")) before.forEach((f) => console.log(`      · ${f}`));
}
console.log("✅ an audit request from a video page or a follow-up email reaches the lead it came from");
