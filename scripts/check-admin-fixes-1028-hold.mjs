#!/usr/bin/env node
// check-admin-fixes-1028-hold.mjs — 2026-10-28, approved admin_fixes_1028_v1. Chris (9:33–9:35): "this is now not the updated approved
// is it?" · "this is row (STEP 28)" · "the check boxes are not clickable on step 28". RUNS the code, doesn't quote it:
//   C · an APPROVED website change is RGA's move (openMoves): "Open the pull request · Adding a page: …" filed under step 8 for the
//       access test, since = the approval, RGA's 2 business days; "Merge #N on GitHub, then Mark live" once the PR is open; gone when
//       live; NEVER in the client's To do (it's in their For your approval) — it was on no list at 9:01
//   A · "Check Google now" never writes to Google: watchClient(factsOnly) reads only the facts step and never connects for a queued
//       change; the endpoint passes factsOnly and checks the signed-in user's workspace
//   B · the website cards' file list reads like the client's (A new page / Their page list for Google / A page they have, the path)
//   D · no "row N" / "Open row" left in admin text (Chris 10-28: say step)
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m);
let OM, W, PB;
try { OM = req(`${SITE}/netlify/functions/_open-moves.js`); W = req(`${SITE}/netlify/functions/_gbp-watch.js`); PB = JSON.parse(read("data/playbooks/playbooks.json")); }
catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const playbooks = { month1: PB.month1 || (PB.playbooks || {}).month1 || [] };

// ── C · an approved change is RGA's move ───────────────────────────────────────────────────────
const T = "m1.access.publish_test", AT = "2026-10-28T16:01:29Z";
const change = { v: "v1", kind: "visible", new_page: true, label: "add_page", page_url: "https://www.acme.test/rga-access-test/", items: [{ label: "Main headline", after: "x" }], files: [{ path: "rga-access-test/index.html", action: "add" }] };
const base = { "m1.access.website": { status: "done", access: { confirmed_at: AT, repo: "acme/site" } } };
const approved = { ...base, [T]: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: AT }, approval: { decision: "approved", change_v: "v1", at: AT } } };
const now = "2026-10-28T17:00:00Z";
const m1 = OM.openMoves({ playbooks, data: { tasks: approved }, now }).filter((m) => m.kind === "publish_change");
if (m1.length !== 1 || m1[0].owner !== "rga" || m1[0].step_id !== "m1.access.website" || !/^Open the pull request · Adding a page: /.test(m1[0].what || "") || m1[0].since !== AT || !m1[0].due)
  fail(`an approved website change isn't RGA's move under step 8 ("Open the pull request · Adding a page: …", since the approval, with a due date): ${JSON.stringify(m1)}`);
const withPr = { ...approved, [T]: { ...approved[T], publish_pr: { v: "v1", number: 14, url: "u", at: AT } } };
const m2 = OM.openMoves({ playbooks, data: { tasks: withPr }, now }).filter((m) => m.kind === "publish_change");
if (m2.length !== 1 || !/^Merge #14, then Mark live/.test(m2[0].what || "")) fail(`an open pull request isn't "Merge #14, then Mark live" (${JSON.stringify(m2.map((m) => m.what))})`);
const live = { ...approved, [T]: { ...approved[T], status: "done", published: { v: "v1", at: AT, checked: true } } };
if (OM.openMoves({ playbooks, data: { tasks: live }, now }).some((m) => m.kind === "publish_change")) fail("a live change is still RGA's move");
if (OM.clientMoves(OM.openMoves({ playbooks, data: { tasks: approved }, now }), playbooks).some((m) => m.kind === "publish_change")) fail("the client's To do lists the approved change too (it's in their For your approval — one place each)");
const late = OM.openMoves({ playbooks, data: { tasks: approved }, now: "2026-11-05T17:00:00Z" }).find((m) => m.kind === "publish_change");
if (!late || !late.late) fail("an approved change left for a week isn't Late");

// ── A · Check Google now never writes ──────────────────────────────────────────────────────────
const FACTS = "m1.gbp.business_facts";
const queued = { status: "in_progress", client_input: { name: "Acme" }, google_push: { state: "queued", queue: [{ field: "phone", not_before: "2026-01-01T00:00:00Z" }] } };
const run = async (factsOnly) => {
  const reads = [], connects = [];
  await W.watchClient("c1", { factsOnly, supa: async () => [], now: () => Date.parse(now), fetch: async () => { throw new Error("no network in the gate"); },
    readStepRecord: async (_s, _c, id) => { reads.push(id); return { tasks: { [id]: id === FACTS ? queued : { status: "done", google_push: { state: "not_sent" } } } }; },
    writeStepTasks: async () => null, notifyRga: async () => {}, record: async () => {},
    connect: async () => { connects.push(1); return { error: "gate: no Google" }; } }).catch(() => null);
  return { reads, connects };
};
const ro = await run(true), full = await run(false);
if (ro.reads.some((id) => id !== FACTS) || !ro.reads.includes(FACTS)) fail(`Check Google now reads other steps (${ro.reads.join(", ")})`);
if (ro.connects.length) fail("Check Google now connects to Google for a QUEUED change (it would write to Google)");
if (!full.connects.length || !full.reads.some((id) => id !== FACTS)) fail("the control run didn't reach the queued change / other steps — this test can't see a write");
const EP = read("netlify/functions/admin-google-check.js");
if (!/factsOnly: true/.test(EP) || !/requireWorkspaceForClient\(event, clientId\)/.test(EP)) fail("admin-google-check doesn't pass factsOnly, or doesn't check the signed-in user's workspace");

// ── B · the file list ──────────────────────────────────────────────────────────────────────────
const A = read("admin/admin.js");
const grab = (re, what) => { const m = A.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${what} moved`); process.exit(2); } return m[0]; };
const fnSrc = (name) => { const i = A.indexOf(`function ${name}(`); if (i < 0) { console.error(`⚠️  INDETERMINATE — ${name} moved`); process.exit(2); } return A.slice(i, A.indexOf("\n}\n", i) + 2); };
const ctx = { escapeHtml: (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), state: { selectedClient: { website_url: "https://www.acme.test" } }, URL };
ctx.escapeAttribute = ctx.escapeHtml;
vm.createContext(ctx);
vm.runInContext(`${grab(/^const wcPathOf = [^\n]*;$/m, "wcPathOf")}\n${grab(/^const WC_PG_ICON = [^\n]*;$/m, "WC_PG_ICON")}\n${fnSrc("wcChgHtml")}\nthis.chg = wcChgHtml;`, ctx);
const h = ctx.chg({ page_url: "https://www.acme.test/local-seo/culver-city-ca/", searches: ["a", "b"], files: [{ path: "local-seo/culver-city-ca/index.html", action: "add" }, { path: "sitemap.xml", action: "edit", note: "adds the new page's address" }, { path: "local-seo/index.html", action: "edit", note: "adds one link to the new page" }] });
if (!/A new page<span class="ob-chg-x">Written for 2 searches/.test(h) || !/<span>acme\.test<\/span><span><b>\/local-seo\/culver-city-ca\/<\/b>/.test(h) || !/Their page list for Google<span class="ob-chg-x">adds the new page's address/.test(h) || !/A page they have/.test(h) || !/<code class="ob-chg-p">sitemap\.xml<\/code>/.test(h) || !/3 files/.test(h))
  fail("admin's file list isn't the client's plain list (A new page / Their page list for Google / A page they have, the address unbroken, the path)");
// removal_card_clean_v2 (10-28): the removal branch is just `return wcChgHtml(c)` now — count the calls in wcNewPageHtml, not the "+" form
{ const nf = (A.match(/function wcNewPageHtml\(c\) \{[\s\S]*?\n\}/) || [""])[0];
  if ((nf.match(/wcChgHtml\(c\)/g) || []).length < 2 || /ob-wc-files/.test(nf)) fail("a website card still lists its files as the old code log"); }

// step 28 (Chris 10-28 "does step 28 match mockup?"): the count once — on the place list, not again under the card's title
if (!/side: \(g\.rga \|\| \[\]\)\.every\(\(x\) => x\.fact === "area"\) \? "" :/.test(A)) fail("step 28 says \"0 of 3 on Google\" twice (under the card title and above the list)");

// 10-28 10:09 spacing: a done step's card never touches the step's header band
if (!/\.ob-done-card \{ padding:12px 16px 14px 16px; \}/.test(read("admin/admin.css"))) fail("a done step's card touches the step's header band again (no top padding)");

// ── D · no "row" in admin text ─────────────────────────────────────────────────────────────────
const bad = A.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(([n, l]) => [n, l.replace(/\s\/\/\s.*$/, "")])
  .filter(([, l]) => /[`"'>][^`"'<]*(?<![\w-])(?:[Rr]ow (?:\d+|\$\{)|Open row\b|(?:on|until) this row\b)/.test(l));   // "mv-row ${…}" is a class name
if (bad.length) fail(`admin text says "row" (say "step", Chris 10-28): ${bad.slice(0, 3).map(([n, l]) => `${n}: ${l.trim().slice(0, 60)}`).join(" · ")}`);

if (F.length) { console.error(`❌ admin_fixes_1028_v1 doesn't hold — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ admin_fixes_1028_v1 holds: an approved website change is RGA's move (step 8 for the test, since the approval, due + Late; Merge #N once the PR is open; gone when live; never in the client's To do) · Check Google now reads the facts only and never connects for a queued change · the file list is the client's plain list with the path · no \"row\" in admin text");
