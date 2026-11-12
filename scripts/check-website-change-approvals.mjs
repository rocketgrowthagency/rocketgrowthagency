#!/usr/bin/env node
// check-website-change-approvals.mjs — 2026-10-23, approved website_change_approvals_v1 option B (Chris: "ANY file changes need
// approval first! Not just what visitors can see" → "design is good… send option B" → "approved").
// Pins EVERY website change going through the client's For your approval, end to end:
//   · every m1.web.* step is either a structured website change (shared/site-change.js STEPS) or a page-copy approval (COPY_STEPS),
//     and each is in the playbook's approve bucket on the website surface with client wording — none forgotten
//   · the loop RUNS (the real admin-deliverables + portal-deliverables handlers, against an in-memory record):
//       draft → send → the client sees the change (not before) → a stale version is refused → approve freezes THAT version →
//       publish refuses until approved → Mark live reads the live page back and refuses a page without the approved text →
//       published = approved · the step is done only then · Ask to undo needs a live change · an edit makes a new version
//   · a run never marks a website step done (flow-execute) · admin's Mark done can't skip it · done + locked rows show the card
//   · the client's inbox: queue + pane, inline before/after, Google preview Now/After, code as plain tiles, the version sent back
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), A = read("admin/admin.js"), FX = read("netlify/functions/flow-execute.js"), PD = read("netlify/functions/portal-deliverables.js"), AD = read("netlify/functions/admin-deliverables.js");

// ── the env + a fake network, BEFORE any function module loads (they read env at require time) ──
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret", URL: "https://site.test" });
const CID = "00000000-0000-4000-8000-000000000001";
const DB = { rec: { id: 7, data: { tasks: { "m1.access.website": { status: "done", access: { confirmed_at: "2026-10-01T00:00:00Z" } }, "m1.access.publish_test": { site_change: { v: "t1" }, published: { v: "t1", at: "2026-10-01T00:00:00Z" } } } } }, ledger: [], activity: [], notified: [] };   // website_access_gaps_v1: access proven (the access test went live), so website work may be sent and published
let LIVE_HTML = "";
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || "GET").toUpperCase();
  const ok = (j, s = 200) => ({ ok: s < 400, status: s, json: async () => j, text: async () => (j == null ? "" : JSON.stringify(j)) });
  if (u.startsWith("https://db.test/auth/v1/user")) return ok({ id: "u1", email: "owner@client.test" });
  if (u.includes("/rest/v1/client_portal_access")) return ok([{ client_id: CID }]);
  if (u.includes("/rest/v1/clients?")) return ok([{ business_name: "Joe's Plumbing", website_url: "joesplumbing.test" }]);
  if (u.includes("/rest/v1/client_onboarding_records")) {
    if (m === "PATCH") { DB.rec.data = JSON.parse(init.body).data; return ok(null, 204); }
    return ok([JSON.parse(JSON.stringify(DB.rec))]);
  }
  if (u.includes("/rest/v1/client_change_log")) { if (m === "POST") DB.ledger.push(JSON.parse(init.body)); return ok([]); }
  if (u.includes("/rest/v1/client_activity")) { DB.activity.push(JSON.parse(init.body)); return ok(null, 201); }
  if (u.includes("/rest/v1/")) return ok([]);
  if (u.includes("/.netlify/functions/notify-rga")) { DB.notified.push(JSON.parse(init.body)); return ok({ ok: true, delivered: true }); }
  if (u.startsWith("https://joesplumbing.test")) return { ok: true, status: 200, url: u, text: async () => LIVE_HTML };
  throw new Error(`gate fetch: unexpected ${m} ${u}`);
};
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let SC, adminH, portalH, DLV;
try {
  SC = req(path.join(SITE, "shared/site-change.js"));
  DLV = req(path.join(SITE, "netlify/functions/_deliverables.js"));
  adminH = req(path.join(SITE, "netlify/functions/admin-deliverables.js")).handler;
  portalH = req(path.join(SITE, "netlify/functions/portal-deliverables.js")).handler;
} catch (e) { console.error(`⚠️  INDETERMINATE — cannot load the modules: ${e.message}`); process.exit(2); }
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const call = async (h, body, headers) => { const r = await h({ httpMethod: "POST", headers, body: JSON.stringify({ client_id: CID, ...body }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };
const adm = (b) => call(adminH, b, { "x-internal-secret": "gate-secret" });
const cli = (b) => call(portalH, b, { authorization: "Bearer client-jwt" });

// ── 1. NONE FORGOTTEN: every Month 1 website step goes through the client ──
const webSteps = (PB.month1 || []).filter((s) => /^m1\.web\./.test(s.id));
if (webSteps.length < 10) fail(`only ${webSteps.length} m1.web.* steps found — the playbook moved?`);
// 🔄 11-1 (admin_last_research_items_v1, approved 11-2): "Decide which page the Google profile links to" sits under m1.web.* but SAVES A
// DECISION ONLY — it writes nothing to Google or to the website, so there is nothing for the client to approve. Exempt BY NAME, and only
// while that stays true: the day it gets a site change, a runner, or its functions start writing to a site, it is a website step again.
const DECISION_ONLY = { "m1.web.gbp_landing_page": ["netlify/functions/_gbp-landing.js", "netlify/functions/admin-gbp-landing.js"] };
for (const s of webSteps) {
  if (DECISION_ONLY[s.id]) {
    const src = DECISION_ONLY[s.id].map(read).join("\n");
    if (SC.isSiteChangeStep(s.id) || SC.COPY_STEPS.includes(s.id) || s.hasRunner !== false || s.actor !== "rga" || !/It writes nothing to Google or to the website/.test(s.instructions || "") || /site-change|siteChange|api\.github\.com|ftp|wp-json/i.test(src))
      fail(`${s.id} is exempt as a decision-only step, but it no longer is one (a site change, a runner, or a write to the website) — it must go through the client's approval`);
    continue;
  }
  if (!SC.isSiteChangeStep(s.id) && !SC.COPY_STEPS.includes(s.id)) fail(`${s.id} edits the client's website but is in neither the website-change list nor the page-copy list (it would skip their approval)`);
  if (s.clientBucket !== "approve" || s.approvalSurface !== "website") fail(`${s.id} isn't in the approve bucket on the website surface (bucket ${s.clientBucket}, surface ${s.approvalSurface})`);
  if (!s.clientLabel || !s.clientHint) fail(`${s.id} has no client wording (clientLabel / clientHint = "Why this helps")`);
  if (!DLV.CLIENT_APPROVABLE[s.id]) fail(`${s.id} isn't client-approvable (_deliverables dropped it)`);
}
// a TEST change (the access test page, 10-28) is deliberately not a playbook step, and neither is the Monthly post's record: its row is m2.exec.blog_posts (admin_blog_step_v1), which must exist
for (const id of Object.keys(SC.STEPS)) if (!SC.STEPS[id].test && !SC.STEPS[id].draftFrom && !SC.STEPS[id].recordOf && !webSteps.some((s) => s.id === id)) fail(`site-change step ${id} is not a Month 1 playbook step`);
for (const id of Object.keys(SC.STEPS)) if (SC.STEPS[id].draftFrom && !(PB.month2plus || []).some((s) => s.id === SC.STEPS[id].draftFrom)) fail(`site-change record ${id} takes its draft from ${SC.STEPS[id].draftFrom}, which isn't a Monthly row`);

// ── 2. the rules, as functions ──
{
  const c = { v: "a" };
  const st = (t) => SC.changeState({ site_change: c, ...t });
  if (SC.changeState({}) !== "none" || st({}) !== "drafted") fail("changeState: none / drafted wrong");
  if (st({ internal_review: { decision: "approved", change_v: "a" } }) !== "sent") fail("changeState: a sent change isn't 'sent'");
  if (st({ internal_review: { decision: "approved", change_v: "OLD" } }) !== "drafted") fail("changeState: an edited draft still counts as sent (an old send covers a new version)");
  if (st({ approval: { decision: "approved", change_v: "OLD" } }) === "approved") fail("changeState: an approval of an OLD version approves the new one");
  if (st({ approval: { decision: "approved", change_v: "a" } }) !== "approved" || st({ approval: { decision: "changes_requested", change_v: "a" } }) !== "changes") fail("changeState: approved / changes wrong");
  if (st({ approval: { decision: "approved", change_v: "a" }, published: { v: "a" } }) !== "live") fail("changeState: live wrong");
  if (SC.stepMayBeDone({ site_change: c, approval: { decision: "approved", change_v: "a" } })) fail("stepMayBeDone: approved-but-not-live counts as done");
  if (!SC.stepMayBeDone({ no_change_needed: { note: "already right" } }) || SC.stepMayBeDone({ no_change_needed: {} })) fail("stepMayBeDone: 'nothing needed changing' needs its note");
  if (!SC.cleanChange("m1.web.homepage_meta", { items: [{ label: "Page title", after: "" }] }).error) fail("cleanChange: a visible change with no new text is accepted");
  if (!SC.cleanChange("m1.web.schema", { kind: "code", adds: "", code: "<x>" }).error && SC.STEPS["m1.web.schema"].adds === "") fail("cleanChange: a code change with no plain words is accepted");
  if (!SC.cleanChange("m1.web.h1_cta", { items: [{ label: "Main headline", after: "Best plumber 🔧" }] }).error) fail("cleanChange: emoji accepted into the client's website text");
  if (SC.cleanChange("m1.web.h1_cta", { items: [{ label: "Main headline", after: "Acme® Roofing™ © 2026" }] }).error) fail("cleanChange: refuses ® ™ © (business names carry them) — universal");
  if (!SC.cleanChange("m1.gbp.business_description", {}).error) fail("cleanChange: accepts a step that isn't a website change");
  const vc = { kind: "visible", items: [{ label: "Page title", after: "Joe's Plumbing & Drains – Culver City" }] };
  if (SC.missingOnPage(vc, "<title>Joe&#39;s Plumbing &amp; Drains &ndash; Culver City</title>").length) fail("missingOnPage: an entity-encoded title isn't found (a correct publish would be refused)");
  if (SC.missingOnPage(vc, "<title>Joe’s Plumbing &amp; Drains — Culver City</title>").length) fail("missingOnPage: curly quotes / dashes break the read-back");
  if (!SC.missingOnPage(vc, "<title>Home</title>").length) fail("missingOnPage: a page WITHOUT the approved text passes the read-back");
}

// ── 3. THE LOOP, RUN ──
const K = "m1.web.homepage_meta";
const draft = { kind: "visible", where: "Your homepage", page_url: "https://joesplumbing.test/", items: [{ label: "Page title", role: "title", before: "Home | Joe's Plumbing", after: "Emergency Plumber in Culver City | Joe's Plumbing" }, { label: "Description under the title", role: "description", before: "", after: "Fast, licensed plumbers in Culver City." }] };
const listFor = async () => ((await cli({})).j.deliverables || []).find((d) => d.key === K);
{
  let r = await adm({ key: K, site_action: "publish" });
  if (r.s !== 409) fail(`publish with nothing drafted wasn't refused (${r.s})`);
  r = await adm({ key: K, site_action: "save", change: draft });
  if (r.s !== 200 || r.j.state !== "drafted") fail(`saving a draft failed (${r.s} ${r.j.error || r.j.state})`);
  const v1 = DB.rec.data.tasks[K]?.site_change?.v;
  if (await listFor()) fail("the client sees a website change RGA hasn't sent");
  r = await cli({ key: K, decision: "approved", change_v: v1 });
  if (r.s === 200) fail("the client could approve an unsent change by URL");
  r = await adm({ key: K, internal_decision: "approved" });
  if (r.s !== 200 || DB.rec.data.tasks[K]?.internal_review?.change_v !== v1) fail(`sending didn't record the version sent (${r.s} ${r.j.error || ""})`);
  const d = await listFor();
  if (!d || !d.change || d.change.v !== v1 || d.change.items.length !== 2) fail("the client's For your approval doesn't carry the structured change (before / after) at the sent version");
  if (d && (!d.change.preview || d.change.preview.site !== "Joe's Plumbing")) fail("the homepage change has no Google preview with the business name");
  if (d && JSON.stringify(d).includes("internal_review")) fail("our internal review leaks to the client");
  r = await cli({ key: K, decision: "approved", change_v: "stale-version" });
  if (r.s !== 409) fail("an approval of a version the client wasn't shown was accepted");
  r = await adm({ key: K, site_action: "publish" });
  if (r.s !== 409) fail("Publish unlocked before the client approved");
  r = await cli({ key: K, decision: "changes_requested", note: "", change_v: v1 });
  if (r.s !== 400) fail("a change request with no note was accepted");
  r = await cli({ key: K, decision: "approved", change_v: v1 });
  const ap = DB.rec.data.tasks[K]?.approval;
  if (r.s !== 200 || ap?.change_v !== v1 || ap?.approved_change?.items?.[0]?.after !== draft.items[0].after) fail(`the approval didn't freeze the exact version (${r.s} ${r.j.error || ""})`);
  if (DB.rec.data.tasks[K]?.status === "done") fail("the step is done at approval (it's done only when live)");
  LIVE_HTML = "<html><head><title>Home | Joe's Plumbing</title></head></html>";
  r = await adm({ key: K, site_action: "publish" });
  if (r.s !== 409 || !/doesn't show the approved text/.test(r.j.error || "")) fail("Mark live accepted a live page that doesn't show the approved text");
  if (DB.rec.data.tasks[K]?.published) fail("a refused Mark live still recorded a publish");
  LIVE_HTML = "<html><head><title>Emergency Plumber in Culver City | Joe&#39;s Plumbing</title><meta name=\"description\" content=\"Fast, licensed plumbers in Culver City.\"></head></html>";
  r = await adm({ key: K, site_action: "publish" });
  const t = DB.rec.data.tasks[K];
  if (r.s !== 200 || t?.published?.v !== v1 || t?.published?.checked !== true || t?.status !== "done") fail(`Mark live on the right page didn't record a checked publish and finish the step (${r.s} ${r.j.error || ""})`);
  if (!DB.ledger.some((l) => String(l.target || "").includes(K) && l.actor === "rga" && l.verified === true)) fail("the publish wasn't written to the change ledger");
  const live = await listFor();
  if (!live || !live.site_live || live.approval?.decision !== "approved") fail("the client's page doesn't show the change as live");
  r = await cli({ key: K, undo_request: "ask", note: "Put the old title back" });
  if (r.s !== 200 || !DB.rec.data.tasks[K]?.undo_request || !DB.notified.length) fail(`Ask to undo didn't record + tell RGA (${r.s} ${r.j.error || ""})`);
  r = await adm({ key: K, site_action: "save", change: { ...draft, items: draft.items.map((i) => ({ ...i, before: i.after, after: i.before || "Joe's Plumbing" })) } });
  const t2 = DB.rec.data.tasks[K];
  if (r.s !== 200 || t2.status === "done" || t2.published || !(t2.site_change_log || []).length || SC.changeState(t2) !== "drafted") fail("a new change after a live one doesn't keep the old one (site_change_log) and reopen the step");
  if (await listFor()) fail("the client still sees the old version after RGA started a new one (it shows again only when sent)");
  r = await cli({ key: K, undo_request: "ask" });
  if (r.s !== 409) fail("Ask to undo is accepted with no live change");
  r = await adm({ key: "m1.web.schema", site_action: "no_change", note: "" });
  if (r.s !== 400) fail("'nothing needed changing' with no reason was accepted");
}

// ── 4. no back door to done ──
// 11-8: an already-right check finishes the step (noChangeNeeded), a draft never does
if (!/const isDone = result\?\.completed === false \? false : \(!!noChangeNeeded \|\| runnerCompleted/.test(FX)) fail("a website step whose check found it already right stays in progress (RGA's 45-47 had to be finished by hand)");
if (!/if \(result && SiteChange\.isSiteChangeStep\(step_id\) && !is_monthly\) \{[\s\S]{0,400}else result\.completed = false;\n    \}\n    const isDone = result\?\.completed === false \? false :/.test(FX)) fail("a run can mark a website step done (flow-execute's website lock is gone)");
const g = A.indexOf("async function guardUnsubstantiatedDone(stepId, patch) {");
if (g < 0 || !/SCg\.isSiteChangeStep\(stepId\) \? !SCg\.stepMayBeDone\(t\) : !SCg\.copyMayBeDone\(t\)/.test(A.slice(g, g + 2000))) fail("admin's Mark done can finish a website step with no approved, live change");
if (!/: globalThis\.rgaSiteChange && globalThis\.rgaSiteChange\.isSiteChangeStep\(id\) \? siteChangeAdminHtml\(id, t\)/.test(A)) fail("the website rows lost their change card (rowStepCardsHtml)");
if ((A.match(/isSiteChangeStep\(o\.flowId\)[^\n]{0,120}siteChangeAdminHtml\(o\.flowId, s\.task\)/g) || []).length < 2) fail("done or locked website rows don't show the change card (an approval or an undo request would be invisible to RGA)");
if (!/data-ob-wc-live>Mark live</.test(A) || !/Publish exactly what they approved, then Mark live/.test(A)) fail("admin's Publish → Mark live step is gone");
if (!/import "\/shared\/site-change\.js\?v=/.test(A) || !/const servedHtml = await r\.text\(\);[\s\S]{0,1600}SC\.missingOnPage\(c, servedHtml\)/.test(AD)) fail("admin doesn't load the shared rules, or Mark live no longer reads the page back");
if (!/String\(body\.change_v \|\| ""\) !== site\.v/.test(PD)) fail("the client's answer isn't tied to the version they saw");

// ── 5. the client's inbox ──
for (const [re, what] of [
  [/class="ib-qi\$\{e === pick \? " on" : ""\}/, "the queue (left) with the selected item"],
  [/data-ib-pane="\$\{e\.id\}"/, "one pane per item (right)"],
  [/function ibDiff\(before, after\)/, "the inline before/after (removed words struck out, new words green)"],
  [/ibChangedPlaces\(i\.before, i\.after\) >= 3\s*\n?\s*\? `<div class="ib-diff" data-ib-rewrite>/, "a rewritten line reads whole, Today then New (portal_change_lines_v1)"],
  [/How it looks in Google/, "the Google preview"], [/data-ib-gp="now"[\s\S]{0,200}data-ib-gp="after"/, "the Google preview's Now / After switch"],
  [/<b>Nothing visible changes<\/b>/, "code changes as plain tiles"], [/Show the code \(for your developer\)/, "Show the code"],
  [/<b>Why this helps<\/b>/, "Why this helps"], [/data-ib-do="approved">\$\{IB_ICON\.check\}/, "Approve this change"],
  [/data-ib-ask>\$\{IB_ICON\.msg\}Change<\/button>/, "Change (note in place; card_notice_designs_v1 renamed Ask for a change, 11-11)"],
  [/change_v: box\.getAttribute\("data-ib-v"\)/, "the version sent back with the answer"],
  [/grp\("", "What RGA did", D,/, "What RGA did (the list; v5 dropped the separate timeline, 10-28)"], [/Ask to undo/, "Ask to undo"],
  [/Nothing changes on your site until you approve\./, "the promise line under the decision"],
]) if (!re.test(P)) fail(`the client's inbox lost: ${what}`);

if (F.length) { console.error("🔴 website change approvals regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
// 🔒 portal_change_lines_v1 (approved 11-7, the owner's 1:43 PM screenshot): a rewritten line reads whole; a small edit keeps the word marks
{
  const P = fs.readFileSync(path.join(SITE, "portal", "portal.js"), "utf8"), a = P.indexOf("function ibDiffParts"), b = P.indexOf("function ibReadTime");
  if (a < 0 || b < a) { console.error("  ✗ the portal's line diff moved"); process.exitCode = 1; }
  else {
    const D = new Function("escapeHtml", `${P.slice(a, b)}; return { ibChangedPlaces };`)((x) => String(x));
    const rewrites = [["Local SEO & Google Maps Agency | Rocket Growth Agency", "Local SEO Services in Culver City | Rocket Growth Agency"], ["We set up and keep up your Google Business Profile, clean up your listings, and improve the pages Google reads. See where you rank, free.", "Google Business Profile & Maps SEO for Culver City businesses. Month-to-month from $625/mo. Call (424) 242-2040."], ["A b c d e f g", "A x c y e z g"]];
    const small = [["Plumber in Culver City", "Emergency Plumber in Culver City"], ["Call us today for a quote", "Call us today for a free quote on Saturday"], ["Best plumber in town", "Trusted plumber in town"]];
    for (const [x, y] of rewrites) if (D.ibChangedPlaces(x, y) < 3) { console.error(`  ✗ a rewritten line is marked word by word: "${y}"`); process.exitCode = 1; }
    for (const [x, y] of small) if (D.ibChangedPlaces(x, y) >= 3) { console.error(`  ✗ a small edit loses its word marks: "${y}"`); process.exitCode = 1; }
  }
}

console.log(`✅ Website changes: all ${webSteps.length} Month 1 website steps go through For your approval (${Object.keys(SC.STEPS).length} as structured changes, ${SC.COPY_STEPS.length} as page copy) · the loop runs: draft → send → the client sees it → a stale version is refused → approval freezes it → Mark live reads the page back → done → Ask to undo · no run or Mark done skips it · the inbox renders the change`);
