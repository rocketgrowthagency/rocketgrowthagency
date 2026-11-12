#!/usr/bin/env node
// check-website-rows-are-step-8-cards.mjs — 2026-10-27, approved admin_website_steps_v1 (Chris: "use the step 8 design for all
// steps on admin side" → "i meant mockup of the steps for admin website" → "approved"). RENDERS the admin website row in real
// Chrome with admin.css + the row's own code lifted from admin.js, once per state, and checks each is the approved card:
//   · draft it (⚡ Draft this for me) · done-but-not-proven (a September tick with nothing on record never reads "Done")
//   · draft ready: Now → After lines only, ONE "Send for approval", Edit the lines, Nothing needs changing — and a claim we
//     can't back ("60-Day Guarantee") FLAGGED · editing in place: NO Kind / Where / address inputs showing, today's words above
//     each box · with the client: checks (drafted ✓ · sent ✓ · their approval open) · publish: Mark live · live: checks ·
//     already right · the client asked · a failed draft says why + Draft again
//   · the old always-open form and the Drafted/Sent trail are gone; nothing on the card is a box inside a box
//   · the row's one chip: Draft ready · With the client · Publish · Live · Already right · Not proven
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved / no Chrome.  --shots=<dir> saves a PNG per state.
import { adminCardLift } from "./lib/admin-card-lift.mjs";   // card_notice_designs_v1 §1 (11-11): admin cards draw through shared/admin-card.js
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const A = read("admin/admin.js"), CSS = read("admin/admin.css"), SCJS = read("shared/site-change.js");
const F = [], fail = (m) => F.push(m);
const fn = (name) => { const at = A.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${name} moved`); process.exit(2); }
  let d = 0, i = A.indexOf("{", A.indexOf(")", at)); for (; i < A.length; i++) { if (A[i] === "{") d++; else if (A[i] === "}" && --d === 0) break; } return A.slice(A.lastIndexOf("\n", at) + 1, i + 1); };
const line = (re, what) => { const m = A.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${what} moved`); process.exit(2); } return m[0]; };
if (/function wcTrailHtml\(/.test(A)) fail("the old Drafted / Sent / … trail is back on the website rows");
const code = [adminCardLift(SITE, A), line(/^const WC_TILE = [^\n]*;$/m, "WC_TILE"), line(/^const WC_KIND = [^\n]*;$/m, "WC_KIND"), "const wcDraftCache = new Map();",
  line(/^const wcEditing = new Set\(\);[^\n]*$/m, "wcEditing"), line(/^const wcPrefilling = new Set\(\);[^\n]*$/m, "wcPrefilling"),
  line(/^const wcStepDef = [^\n]*;$/m, "wcStepDef"), line(/^const wcTitleOf = [^\n]*;$/m, "wcTitleOf"), line(/^const wcDay = [^\n]*;$/m, "wcDay"),
  line(/^const acDay = [^\n]*;$/m, "acDay"), line(/^const acCk = [^\n]*;$/m, "acCk"),
  line(/^const WC_LB_ICON = [^\n]*;$/m, "WC_LB_ICON"), fn("wcLabelHtml"), line(/^const wcSame = [^\n]*$/m, "wcSame"), line(/^const wcFileVerb = [^\n]*;$/m, "wcFileVerb"), fn("acCardHtml"), fn("acDueChip"), fn("wcLinesOf"), line(/^const wcAfter = [^\n]*;$/m, "wcAfter"), line(/^const WC_PG_ICON = [^\n]*;$/m, "WC_PG_ICON"), fn("wcChgHtml"), line(/^const wcMeasureCache = [^\n]*;$/m, "wcMeasureCache"), fn("wcMeasureHtml"), fn("wcProofRowHtml"), fn("wcBriefHtml"), fn("wcReviewChecksHtml"), fn("wcGooglePreviewHtml"), fn("wcPageReadsHtml"), fn("wcReviewHtml"), fn("wcDiffHtml"), fn("wcRiskHtml"), fn("wcFormHtml"), fn("wcNewPageHtml"), fn("wcRowPill"), line(/^const wcRowPillHtml = [^\n]*;$/m, "wcRowPillHtml"),
  // approval_tab_and_sent_card_v1 (10-28): the whole trip + what they're approving
  line(/^const wcMergeBy = [^\n]*;$/m, "wcMergeBy"), line(/^const wcTime = [^\n]*;$/m, "wcTime"), fn("wcActor"), fn("wcLoopHtml"),
  // publish_safety_checks_v1 (10-28): the safety panel, who merged, the after-check
  line(/^const wcSafetyCache = [^\n]*$/m, "wcSafetyCache"), line(/^const wcRestAsked = [^\n]*$/m, "wcRestAsked"), line(/^const WC_DAY = [^\n]*;$/m, "WC_DAY"), fn("ghIdHtml"), fn("ghPillText"), fn("ghClientName"), fn("ghBandHtml"), fn("ghPanelHtml"), fn("wcSafetyPanel"), fn("wcMergedHtml"), fn("wcRestHtml"), fn("wcProofHtml"), line(/^const WC_EYE = [^\n]*;$/m, "WC_EYE"), line(/^const wcPathOf = [^\n]*;$/m, "wcPathOf"), fn("wcWhatHtml"),
  // admin_website_steps_autopilot_v1 (11-6): the card while the system has the step, the raw output inside the card
  line(/^let wcStepNoOf = [^\n]*$/m, "wcStepNoOf"), fn("wcRunsItself"), fn("wcAutoMove"), fn("wcAlreadyRightWins"), fn("wcStuck"), line(/^const WC_STUCK_ACT = [^\n]*;$/m, "WC_STUCK_ACT"), line(/^const WC_CLOCK = [^\n]*;$/m, "WC_CLOCK"), fn("wcDue"), fn("wcAutoCardHtml"), line(/^const TM_CHECK = [^\n]*;$/m, "TM_CHECK"), fn("wcRecipeHtml"), fn("wcRawHtml"), fn("siteChangeAdminHtml")].join("\n");

let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer isn't installed"); process.exit(2); }
const SHOTS = (process.argv.find((a) => a.startsWith("--shots=")) || "").slice(8);
const H = "m1.web.h1_cta", NOW = "2026-10-27T18:00:00Z";
const items = [{ label: "Main headline", before: "Rank Higher on Google Maps and Build a Predictable Pipeline", after: "Local SEO That Puts Your Business on the Map" },
  { label: "Line under the headline", before: "", after: "Honest reporting, 60-Day Guarantee" }, { label: "Main button", before: "See Where You Rank Free", after: "Get Your Free Google Listing Audit" }];
const change = { v: "v1", kind: "visible", where: "Your homepage", items, drafted_at: NOW };
const T = "m1.access.publish_test";
const tchange = { v: "v1", kind: "visible", new_page: true, label: "add_page", where: "A test page on your website, hidden from Google", page_url: "https://www.acme.test/rga-access-test/", drafted_at: NOW,
  items: [{ label: "Page title", after: "Website access check | Acme" }, { label: "Main headline", after: "This page checks that approved changes reach your website" }, { label: "What the page says", after: "Acme's agency published this page after you approved it." }],
  files: [{ path: "rga-access-test/index.html", action: "add", note: "a test page, hidden from Google" }] };
const tbuild = { v: "v1", built_at: NOW, preview_url: "/.netlify/functions/site-preview?x", files: [{ path: "rga-access-test/index.html", action: "add", sha: "201cd46c0f0e0d0c", size: 27780, html: "<html></html>" }] };
const ran = { auto_result: { summary: "H1: …", ran_at: NOW, outcome_data: {} } };
const L = "m1.web.location_pages";
const pageChange = { v: "v1", kind: "visible", new_page: true, label: "add_page", where: "A new page on your website", page_url: "https://sparks.test/electrician-springfield-il/", drafted_at: NOW, searches: ["electrician springfield", "emergency electrician springfield"],
  files: [{ path: "electrician-springfield-il/index.html", action: "add", note: "the new page" }, { path: "sitemap.xml", action: "edit", note: "adds the new page's address" }],
  items: [{ label: "Page title", role: "title", after: "Electrician in Springfield, IL | Sparks" }, { label: "Description under the title", role: "description", after: "Licensed electrical work across Springfield and nearby towns." }, { label: "Main headline", after: "Your electrician in Springfield" },
    { label: "Opening", after: "We work on homes here.\n\nWe also work on small shops." }, { label: "How we work", after: "You call, we look, we quote, we fix it." }, { label: "Links on the page", check: false, after: "Panels → /panels/\nLighting → /lighting/" }, { label: "Areas named", check: false, after: "Springfield, Chatham, Rochester" },
    { label: "Questions answered", check: false, after: "Do you work weekends?\nAsk us when you call.\n\nDo you pull permits?\nWhen the job needs one." }, { label: "Main button", after: "Call Sparks" }] };
const S = {
  draftit: { task: { status: "pending" } },
  notproven: { task: { status: "done", completed_at: "2026-09-14T17:00:00Z" } },
  ready: { task: { status: "in_progress", ...ran }, pre: change },
  failed: { task: { status: "in_progress", auto_result: { summary: "The draft broke the page rules, so nothing was saved:\n- not JSON", ran_at: NOW, outcome_data: { problems: ["the answer wasn't the page's words (not JSON)"] } } }, pre: { items: [] } },
  editing: { task: { status: "in_progress", ...ran }, pre: change, edit: true },
  unread: { task: { status: "in_progress", ...ran }, pre: { items: [], read_failed: true } },
  stale: { task: { status: "in_progress", ...ran }, pre: { items: [] }, stale: true },
  drafted: { task: { status: "in_progress", site_change: change } },
  sent: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW } } },
  changes: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "changes_requested", change_v: "v1", at: NOW, note: "Keep the button as See Where You Rank Free" } } },
  approved: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: change } } },
  live: { task: { status: "done", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test" }, published: { v: "v1", at: NOW, by: "hello@", url: "https://x.test/", checked: true, check_note: "Read back from https://x.test/" } } },
  // the access test on GitHub access (approval_tab_and_sent_card_v1): 6 stops — built · sent · approves · pull request · merge · live
  ghSent: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild } },
  ghApproved: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange } } },
  ghPr: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange }, publish_pr: { v: "v1", number: 14, url: "https://github.com/acme/site/pull/14", at: NOW } } },
  ghPrClient: { id: T, gh: true, mergeBy: "client", task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange }, publish_pr: { v: "v1", number: 14, url: "https://github.com/acme/site/pull/14", at: NOW, head: "abc" } } },
  ghMerged: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange }, publish_pr: { v: "v1", number: 14, url: "https://github.com/acme/site/pull/14", at: NOW, head: "abc", merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", base: "main" } } } },
  // a REMOVAL sent after the add went live: the add's approval (v1) is still on the record — it must not tick "Approves it" (Chris 10-28 5:56 PM)
  ghRemoveSent: { id: T, gh: true, task: { status: "in_progress", site_change: { ...tchange, v: "v2", label: "remove_page", removes_page: true, new_page: false, page_url: "https://acme.test/rga-access-test/" },
    internal_review: { decision: "approved", change_v: "v2", at: NOW }, site_build: { ...tbuild, v: "v2", files: [{ path: "rga-access-test/index.html", action: "remove", sha: "0612e019" }] },
    approval: { decision: "approved", change_v: "v1", at: "2026-10-28T16:01:29Z" }, published: { v: "v1", at: NOW } } },
  // a REMOVAL that went live: proven by "gone" (removal_proof_v1, 10-28) — 9 of 9, and no View page for a page that's gone
  ghRemoveLive: { id: T, gh: true, task: { status: "done", site_change: { ...tchange, v: "v2", label: "remove_page", removes_page: true, new_page: false, page_url: "https://acme.test/rga-access-test/" },
    internal_review: { decision: "approved", change_v: "v2", at: NOW }, site_build: { ...tbuild, v: "v2", files: [{ path: "rga-access-test/index.html", action: "remove", sha: "0612e019" }] },
    approval: { decision: "approved", change_v: "v2", at: NOW, by: "owner@x.test", approved_build: [{ path: "rga-access-test/index.html", action: "remove", sha: "0612e019" }] },
    publish_safety: { checks: [{ id: "website", ok: true, detail: "x" }, { id: "repo_is_site", ok: true, detail: "acme/site: x." }, { id: "recorded", ok: true }], pr_files: [{ path: "rga-access-test/index.html", action: "remove" }], repo: "acme/site", site: "acme.test" },
    publish_pr: { v: "v2", number: 3, url: "https://github.com/acme/site/pull/3", at: NOW, head: "abc", branch: "rga/remove-page-x", merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", base: "main", sha: "b644560", branch_deleted_at: NOW, branch_how: "deleted" } },
    published: { v: "v2", at: NOW, checked: true, check_note: "Read back: gone" }, publish_after: { ok: true, read: 25, of: 25, at: NOW } } },
  ghLiveProven: { id: T, gh: true, task: { status: "done", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild,
    approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_build: [{ path: "rga-access-test/index.html", action: "add", sha: "201cd46c0f0e0d0c" }] },
    publish_safety: { checks: [{ id: "website", ok: true, detail: "The page goes on acme.test." }, { id: "repo_is_site", ok: true, detail: "acme/site: their address is written in its CNAME." }], pr_files: [{ path: "rga-access-test/index.html", action: "add" }], repo: "acme/site", site: "acme.test" },
    publish_pr: { v: "v1", number: 2, branch: "rga/add-page-x", at: NOW, merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", by_person: "hello@", base: "main", sha: "d907d73abc", branch_deleted_at: NOW } },
    publish_before: { pages: [{ url: "https://acme.test/", read: true }] }, publish_after: { at: NOW, ok: true, read: 25, of: 25, changed: [], unread: [] },
    published: { v: "v1", at: NOW, by: "RGA (automatic)", url: "https://www.acme.test/rga-access-test/", checked: true, fingerprint: { match: true, want: "201cd46c", got: "201cd46c" } } } },
  ghLivePartial: { id: T, gh: true, task: { status: "done", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW },
    publish_pr: { v: "v1", number: 2, at: NOW, merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", base: "main" } }, published: { v: "v1", at: NOW, checked: true } } },
  // draft_review_v1 (build 7): a new page is reviewed by reading it; any client, any page; a too-long title isn't ticked
  pageReady: { id: L, task: { status: "in_progress", auto_result: { summary: "NEW PAGE: x", ran_at: NOW, outcome_data: { page_draft: { page_for: "Springfield", beside: "beside their 2 Springfield pages" } } } }, pre: pageChange },
  pageDrafted: { id: L, task: { status: "in_progress", site_change: pageChange, auto_result: { summary: "NEW PAGE: x", ran_at: NOW, outcome_data: { page_draft: { page_for: "Springfield" } } } } },
  pageLong: { id: L, task: { status: "in_progress", site_change: { ...pageChange, items: pageChange.items.map((i) => (i.role === "title" ? { ...i, after: "A title well past what Google shows in a result for anybody at all in Springfield" } : i)) }, auto_result: { summary: "x", ran_at: NOW, outcome_data: { page_draft: { page_for: "Springfield" } } } } },
  // the nightly re-read found the approved words gone; a live page shows what was checked and Search Console's numbers (no number while it reads)
  pageDrift: { id: L, task: { status: "in_progress", live_drift: { at: NOW, missing: ["Page title"], url: "https://sparks.test/electrician-springfield-il/" }, site_change: pageChange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW }, published: { v: "v1", at: NOW, checked: true, url: "https://sparks.test/electrician-springfield-il/" } } },
  pageChecks: { id: L, task: { status: "done", site_change: pageChange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW }, published: { v: "v1", at: NOW, checked: true, url: "https://sparks.test/electrician-springfield-il/", checks: [{ id: "title", ok: true, what: "Title as approved" }, { id: "sitemap", ok: null, what: "Couldn't read their sitemap" }] } } },
  // page 1 of 3 is live: the step stays open and offers the next page
  pageOf: { id: L, task: { status: "in_progress", site_change: { ...pageChange, page_of: { at: 1, of: 3 } }, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW }, published: { v: "v1", at: NOW, checked: true, url: "https://sparks.test/electrician-springfield-il/" } } },
  // what the brief found + a stuffed draft + a copied sentence
  pageFlags: { id: L, task: { status: "in_progress", site_change: { ...pageChange, items: pageChange.items.map((i) => (i.label === "Opening" ? { ...i, after: "We rank for electrician springfield and emergency electrician springfield in one breath." } : i)) },
    auto_result: { summary: "x", ran_at: NOW, outcome_data: { page_draft: { page_for: "Springfield", duplicates: [{ sentence: "We show up on time and leave your home clean every day.", url: "https://sparks.test/a/" }],
      brief_lines: [{ warn: true, title: "Already shows for these searches", text: "https://sparks.test/panels/ · position 8" }, { open: true, title: "Competitor pages", text: "No competitor websites on record" }] } } } } },
  // an edit to a page they have keeps Now → After and names the page
  pageEdit: { id: "m1.web.service_location_matrix", task: { status: "in_progress", site_change: { v: "v1", kind: "visible", edits_page: true, label: "edit_page", where: "A page on your website", page_url: "https://x.test/hvac-denver/", drafted_at: NOW, files: [{ path: "hvac-denver/index.html", action: "edit", note: "named lines on this page, nothing else" }], items: [{ label: "Line 1", before: "Why hvac lose", after: "Why HVAC companies lose" }] } } },
  right: { task: { status: "done", no_change_needed: { note: "One phone number on every page", at: NOW, by: "RGA" } } },
  // admin_website_steps_autopilot_v1 (approved 11-6): a client whose website steps run themselves — no Run button anywhere, the card says what the system does
  autoQueued: { auto: true, task: { status: "pending" } },
  autoNotProven: { auto: true, task: { status: "done", completed_at: "2026-09-14T12:00:00Z" } },
  autoScheduled: { auto: true, task: { status: "in_progress", ran_at: NOW, auto_result: { summary: "Headline: Local SEO That Puts Your Business on the Map\nButton: Get Your Free Audit", ran_at: NOW },
    site_change: { v: "v1", kind: "visible", label: "edit_page", where: "Your homepage", drafted_at: NOW, drafted_by: "RGA (automatic)", items: [{ label: "Main headline", before: "Rank Higher on Google Maps", after: "Local SEO That Puts Your Business on the Map" }] },
    auto_send: { v: "v1", at: NOW, due_at: "2099-11-07T16:00:00Z", failed: [], held: null } } },
  autoFixed: { auto: true, task: { status: "in_progress", ran_at: NOW, site_change: { v: "v1", kind: "visible", label: "edit_page", where: "Your homepage", drafted_at: NOW, drafted_by: "RGA (automatic)", items: [{ label: "Description under the title", before: "A", after: "Call (424) 242-2040." }] },
    auto_send: { v: "v1", at: NOW, due_at: "2099-11-08T19:10:00Z", failed: [], fixed: [{ label: "Description under the title", removed: "same-day start available" }], held: null, rev: 2 } } },
  autoCheckFailed: { auto: true, task: { status: "in_progress", ran_at: NOW, site_change: { v: "v1", kind: "visible", label: "edit_page", where: "Your homepage", drafted_at: NOW, drafted_by: "RGA (automatic)", items: [{ label: "Main headline", before: "A", after: "Guaranteed first place" }] },
    auto_send: { v: "v1", at: NOW, due_at: NOW, failed: [{ label: "Main headline", why: "It says a guarantee we can't back (\"Guaranteed\")." }], held: null } } },
  autoFailedTwice: { auto: true, task: { status: "in_progress", ran_at: NOW, auto_result: { summary: "x", ran_at: NOW }, auto_failed: { at: NOW, run: NOW, rev: 3, why: "The draft didn't come out right twice: The run has no lines to fill." } } },
  autoCheck: { auto: true, task: { status: "in_progress", ran_at: NOW, auto_result: { summary: "Mobile PSI: 92/100", ran_at: NOW }, auto_failed: { at: NOW, run: NOW, rev: 3, kind: "check", why: "The check found: Mobile PSI: 92/100 CLS=0.116. There's no change it can draft from that by itself." } } },
};
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const out = {};
try {
  for (const [name, sc] of Object.entries(S)) {
    const page = await browser.newPage(); await page.setViewport({ width: 1000, height: 900 });
    await page.setContent(`<style>${CSS}</style><div class="ob-step" style="max-width:940px;margin:16px"><div id="h"></div></div>`);
    out[name] = await page.evaluate(({ SCJS, code, sc, H, name }) => {
      const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"), escapeAttribute = escapeHtml;   // = admin.js escapeHtml
      const adminGcardWhen = () => "Oct 27, 11:00 AM", renderOnboardingChecklist = () => {}, movesForSelected = () => [], mvDueDays = () => 0, mvDay = () => "Oct 27";
      const wcAction = async () => null, GH_MONO = "", OB_WEB_TILE = "", DESC_STEP = "m1.gbp.business_description", descriptionToPublish = () => false;
      // the GitHub connection panel (names_not_addresses_v1) from a fixed read-only check — never a fetch
      const ghConnOf = () => ({ ok: true, match: true, checked_at: "2026-10-28T20:00:00Z", login: "rocketgrowthagency-admin", repo: "acme/site", owner: "acme", site: "acme.test",
        rows: [{ id: "account", ok: true, title: "The account they invited is the one we post as", detail: "The client invited rocketgrowthagency-admin on Oct 26. Our key is the same account today.", ev: "Oct 26 → today" }] });
      const state = { onboardingData: sc.gh ? { tasks: { "m1.access.website": { access: { repo: "acme/site", confirmed_at: "2026-10-01T00:00:00Z" }, ...(sc.mergeBy ? { merge_by: { by: sc.mergeBy } } : {}) }, "m1.access.publish_test": { site_change: { v: "t1" }, published: { v: "t1", at: "2026-10-01T00:00:00Z" } } } } : { tasks: { "m1.access.website": { status: "done", access: { confirmed_at: "2026-10-01T00:00:00Z" } }, "m1.access.publish_test": { site_change: { v: "t1" }, published: { v: "t1", at: "2026-10-01T00:00:00Z" } } } }, selectedClient: { id: "c1", business_name: "Acme", ...(sc.auto ? { website_url: "https://acme.test", client_portal_stage: "stage_4_onboarding" } : {}) }, flowM1Playbook: [{ id: H, title: "Fix H1 + primary CTA", clientLabel: "Homepage headline + main button", hasRunner: true }] };
      eval(SCJS);   // globalThis.rgaSiteChange
      // eslint-disable-next-line no-eval
      const api = eval(`(() => { ${code}; return { wcDraftCache, wcEditing, siteChangeAdminHtml, wcRowPill, ghPillText, ghPanelHtml, ghBandHtml }; })()`);
      const sig = `${sc.task.ran_at || (sc.task.auto_result && sc.task.auto_result.ran_at) || sc.task.completed_at || ""}|${String((sc.task.auto_result && sc.task.auto_result.summary) || "").length}`;
      if (sc.pre) api.wcDraftCache.set(`c1:${sc.id || H}`, { ...sc.pre, _run: sc.stale ? "an older run" : sig });
      if (sc.edit) api.wcEditing.add(`c1:${H}`);
      const el = document.getElementById("h"); el.innerHTML = api.siteChangeAdminHtml(sc.id || H, sc.task);
      const vis = (q) => [...el.querySelectorAll(q)].filter((x) => x.offsetParent !== null);
      const nested = [...el.querySelectorAll(".ob-card form, .ob-card .ob-wc-line")].some((x) => { const s = getComputedStyle(x); return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && s.backgroundColor !== "rgba(0, 0, 0, 0)"; });
      // the pill helper on a hostile sentence: the text around it is escaped, a name inside another name never splits it
      const pillT = api.ghPillText("<img src=x> by acme into acme/site", [["acme", "login"], ["acme/site", "repo"]]);
      if (sc.gh && sc.task.publish_pr) state.onboardingData.tasks["m1.access.publish_test"] = sc.task;   // the footer's "Last merged here"
      const ghp = document.createElement("div"); ghp.innerHTML = api.ghPanelHtml({ github: "rocketgrowthagency-admin", repo: "acme/site" }, true);
      document.body.appendChild(ghp);   // measured with admin.css (Chris 10-28 3:16 PM: "too close together")
      const box = ghp.querySelector(".ob-ghp-g > div"), rowSmall = ghp.querySelector(".ob-safe-l small");
      const panel = { text: ghp.textContent.replace(/\s+/g, " "), html: ghp.innerHTML,
        pad: box ? getComputedStyle(box).paddingTop : "", lblMb: box ? getComputedStyle(box.querySelector(".lbl")).marginBottom : "", nameMb: box ? getComputedStyle(box.querySelector("b")).marginBottom : "",
        rowPad: ghp.querySelector(".ob-safe-l li") ? getComputedStyle(ghp.querySelector(".ob-safe-l li")).paddingTop : "",
        band: ghp.querySelector(".ob-ghcv") ? { cls: ghp.querySelector(".ob-ghcv").className, text: ghp.querySelector(".ob-ghcv").textContent.replace(/\s+/g, " "), bg: getComputedStyle(ghp.querySelector(".ob-ghcv")).backgroundColor } : null,
        bad: (() => { const d = document.createElement("div"); d.innerHTML = api.ghBandHtml({ match: false, checked_at: "2026-10-28T20:00:00Z", rows: [{ ok: true, title: "a" }, { ok: false, title: "Our key isn't the account the client invited" }] }); return d.textContent.replace(/\s+/g, " "); })(),
        err: (() => { const d = document.createElement("div"); d.innerHTML = api.ghBandHtml({ error: true }); return d.textContent.replace(/\s+/g, " "); })(),
        foot: (() => { if (!sc.gh) return ""; const keep = state.onboardingData.tasks["m1.access.publish_test"];
          state.onboardingData.tasks["m1.access.publish_test"] = { publish_pr: { v: "v2", number: 3 }, site_change_log: [{ pr: { number: 2, merged: { at: "2026-10-28T19:58:00Z", by: "rocketgrowthagency-admin" } } }] };
          const d = document.createElement("div"); d.innerHTML = api.ghPanelHtml({ github: "rocketgrowthagency-admin", repo: "acme/site" }, true);
          state.onboardingData.tasks["m1.access.publish_test"] = keep; const f = d.querySelector(".ob-ghp-f"); return f ? f.textContent.replace(/\s+/g, " ") : ""; })(),
        chg: (() => { if (!sc.gh) return ""; const w = state.onboardingData.tasks["m1.access.website"]; w.change_request = { note: "We moved our website to a different place", at: "2026-10-28T23:00:00Z" };
          const d = document.createElement("div"); d.innerHTML = api.ghBandHtml({ match: true, checked_at: "2026-10-28T20:00:00Z", rows: [] }); delete w.change_request; return d.textContent.replace(/\s+/g, " "); })(), lh: rowSmall ? parseFloat(getComputedStyle(rowSmall).lineHeight) / parseFloat(getComputedStyle(rowSmall).fontSize) : 0 };
      return { panel, pillT, text: el.textContent.replace(/\s+/g, " "), html: el.innerHTML, buttons: vis("button, a.admin-button").map((b) => b.textContent.trim()), inputs: vis("input:not([type=hidden]), select").length,
        textareas: vis("textarea").length, label: [(el.querySelector(".ob-card-w") || {}).textContent || "", (el.querySelector(".ob-card-when") || {}).textContent || ""].filter(Boolean).join(" · "), pill: (api.wcRowPill(H, sc.task) || {}).text || "", nested, cards: el.querySelectorAll(".ob-card").length, checks: el.querySelectorAll(".ob-ac-ck li").length,
        loop: [...el.querySelectorAll(".ob-wc-loop li")].map((li) => li.className), tone: (el.querySelector(".ob-card") || {}).className || "",
        rawInside: !!el.querySelector(".ob-card > .ob-wc-raw"), rawOutside: !!el.querySelector(".ob-wc > .ob-wc-raw"),
        loopOneRow: (() => { const l = el.querySelector(".ob-wc-loop"); if (!l) return null; const t = [...l.children].map((x) => Math.round(x.getBoundingClientRect().top)); return new Set(t).size === 1; })(),
        // 10-28 (Chris, 10:09): every stop's name sits on one line across the trip, whatever the length of its note
        proofUnk: el.querySelectorAll(".ob-proof-r.unk").length,
        loopLevel: (() => { const l = el.querySelector(".ob-wc-loop"); if (!l) return null; return new Set([...l.querySelectorAll("li > b")].map((b) => Math.round(b.getBoundingClientRect().top))).size === 1; })() };
    }, { SCJS, code, sc, H, name });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); }
    await page.close();
  }
} finally { await browser.close(); }
const has = (n, re, what) => { if (!re.test(out[n].text)) fail(`${n}: ${what}`); };
for (const [n, o] of Object.entries(out)) { if (o.cards !== 1) fail(`${n}: not ONE row-8 card (${o.cards})`); if (o.nested) fail(`${n}: a box inside the card's box`); if (/Drafted\s*Sent\s*Client approval/.test(o.text)) fail(`${n}: the old trail is back`); }
// admin_website_steps_autopilot_v1: the steps run themselves — no Run button, the card's label is what the system is doing, RGA's only on a failed check / two failed drafts
for (const n of ["autoQueued", "autoNotProven", "autoScheduled", "autoFixed", "autoCheckFailed", "autoFailedTwice"]) if (out[n].buttons.some((b) => /^⚡|Draft/.test(b))) fail(`${n}: a step that runs itself still has a Run / Draft button (${out[n].buttons})`);
if (!/Runs itself · drafts itself shortly/.test(out.autoQueued.label) || out.autoQueued.pill !== "Drafts itself") fail(`auto queued: not "Runs itself · drafts itself shortly" / "Drafts itself" (${out.autoQueued.label} · ${out.autoQueued.pill})`);
has("autoNotProven", /ticked done before every website change went through approval[\s\S]*drafts itself again within 10 minutes/, "a step ticked before approvals doesn't say it drafts itself again");
if (!/^RGA working · Runs itself · goes to the client Nov 7, \d{1,2}( |:)/.test(out.autoScheduled.label) && !/^RGA working · Runs itself · goes to the client Nov [78],/.test(out.autoScheduled.label)) fail(`auto scheduled: the label isn't "Runs itself · goes to the client <day, time>" (${out.autoScheduled.label})`);
if (["Hold", "Edit the lines", "Send now"].some((b) => !out.autoScheduled.buttons.includes(b)) || out.autoScheduled.buttons.includes("Send for approval")) fail(`auto scheduled: not Hold · Edit the lines · Send now (${out.autoScheduled.buttons})`);
has("autoScheduled", /every check passed\. It goes to their For your approval on Nov \d+, \d{1,2}[^.]* unless you hold it/, "the scheduled card doesn't say when it goes unless held");
has("autoFixed", /every check passed\. It fixed one thing by itself: took out “same-day start available”/, "a draft the system fixed by itself doesn't say what it took out");
if (!/^Goes out /.test(out.autoScheduled.pill)) fail(`auto scheduled: the row's chip isn't "Goes out <day>" (${out.autoScheduled.pill})`);
if (!out.autoScheduled.rawInside || out.autoScheduled.rawOutside) fail("the run's raw output isn't inside the card");
if (!/Your move · a check failed/i.test(out.autoCheckFailed.label) || !/a guarantee we can't back[\s\S]*Nothing was sent\. Edit the lines, then send\./.test(out.autoCheckFailed.text) || !out.autoCheckFailed.buttons.includes("Edit the lines") || out.autoCheckFailed.pill !== "Check failed") fail("a failed check isn't RGA's move with the reason and Edit the lines");
if (!/\$\{\(\) => \{\n\s*\/\/ 🔒 admin_steps_43_44_v1/.test(A) && !/Waits for step \$\{escapeHtml\(bNo1\)\}/.test(A)) fail("a waiting website step's row says \"Locked · until step N · title\" instead of \"Waits for step N\"");
if (!/label: `Runs itself · waits for \$\{no \? `step \$\{escapeHtml\(no\)\}` : "an earlier step"\}`/.test(A) || !/is \$\{theirs\}\$\{fmWhy\}/.test(A)) fail("the waiting card doesn't name the step by number and whose move it is");
if (!/Your move · the check needs you/i.test(out.autoCheck.label) || !/The check found: Mobile PSI[\s\S]*Write the change with Edit the lines/.test(out.autoCheck.text) || out.autoCheck.buttons.some((b) => /^⚡|Draft/.test(b))) fail("a check that found something isn't \"the check needs you\" with what it found");
if (!/Your move · the draft didn't come out right/i.test(out.autoFailedTwice.label) || !/It won't draft again by itself/.test(out.autoFailedTwice.text) || out.autoFailedTwice.pill !== "Your move") fail("a draft that failed twice isn't RGA's move with its reason");
if (!out.draftit.buttons.includes("⚡ Draft this for me") || out.draftit.textareas) fail("draft it: no ⚡ Draft this for me, or the empty form is open before there's a draft");
has("notproven", /Done, but not proven/, "a September tick with nothing on record reads as Done"); if (out.notproven.pill !== "Not proven") fail("not proven: the row's chip still says Done");
if (!/Your move · review the draft/i.test(out.ready.label)) fail("ready: " + "the draft isn't \"review the draft\"");
if (out.ready.buttons.filter((b) => b === "Send for approval").length !== 1 || !out.ready.buttons.includes("Edit the lines") || !out.ready.buttons.includes("Nothing needs changing…")) fail(`draft ready: not ONE Send for approval + Edit the lines + Nothing needs changing (${out.ready.buttons})`);
if (out.ready.textareas || out.ready.inputs) fail("draft ready: shows form boxes before you press Edit");
if (!/Rank Higher on Google Maps[\s\S]*→[\s\S]*Local SEO That Puts Your Business on the Map/.test(out.ready.text)) fail("draft ready: the lines aren't Now → After");
has("ready", /says “Guarantee”: a guarantee we can't back/, "\"60-Day Guarantee\" isn't flagged before sending"); if (out.ready.pill !== "Draft ready") fail("draft ready: the row's chip isn't \"Draft ready\"");
has("failed", /The draft didn't come out right/, "a failed draft doesn't say so"); has("stale", /Reading the draft…/, "a reading of an OLDER run is shown over the new draft (10-28: \"didn't come out right\" over a good draft)"); has("unread", /Couldn't read the draft/, "a draft we couldn't LOAD is called a bad draft"); if (!out.unread.buttons.includes("Try again") || /didn't come out right/.test(out.unread.text)) fail("couldn't read: no Try again, or it says the draft is bad"); if (!out.failed.buttons.includes("⚡ Draft again")) fail("a failed draft has no Draft again");
if (out.editing.inputs) fail(`editing: shows ${out.editing.inputs} Kind / Where / address input(s) (the step sets them)`);
if (out.editing.textareas !== 3 || !/Now: “Rank Higher on Google Maps/.test(out.editing.text) || !out.editing.buttons.includes("Save and send for approval") || !out.editing.buttons.includes("Cancel")) fail("editing: not one box per line with today's words above it, Save and send + Cancel");
if (!/Your move · send it/i.test(out.drafted.label)) fail("drafted: a saved draft isn't \"send it\"");
// 🔄 approval_tab_and_sent_card_v1 (10-28): the checks became the whole trip — every state shows every stop, the current one marked
const loopIs = (name, want, why) => { const got = (out[name].loop || []).join(","); if (got !== want.join(",")) fail(`${name}: the trip reads [${got}], should be [${want.join(",")}] — ${why}`); if (out[name].loopOneRow === false) fail(`${name}: the trip wraps onto two rows at 1000px`); if (out[name].loopLevel === false) fail(`${name}: the stops' names don't sit level (a 2-line note pushes its neighbours — Chris 10-28 10:09)`); };
has("sent", /With the client · in their For your approval/, "sent isn't \"With the client · in their For your approval\""); loopIs("sent", ["done", "done", "now", "", ""], "drafted · sent ticked, the client's approval current (blue)");
if (!/\both\b/.test(out.sent.tone) || /\b(wait|you|over)\b/.test(out.sent.tone)) fail(`sent: the card is "${out.sent.tone}" — with the client is BLUE (state system decision 1), never the grey "over"`);
if (!out.sent.buttons.includes("Take it back to edit")) fail("sent: no Take it back to edit"); if (out.sent.pill !== "With the client") fail("sent: chip isn't \"With the client\"");
for (const k of Object.keys(out)) if (/\b1 (files|lines|pages)\b/.test(out[k].text)) fail(`${k}: says "1 files/lines/pages"`);
has("ghSent", /Adding a page/, "the sent card loses its label"); loopIs("ghSent", ["done", "done", "now", "", "", ""], "built · sent ticked, approves current, then pull request · merge · live");
has("ghSent", /Built[\s\S]*1 file[\s\S]*Sent[\s\S]*Approves it[\s\S]*Pull request[\s\S]*Merge[\s\S]*Live, read back/, "the six stops aren't named in order");
has("ghSent", /Built from\s*their live homepage's design · fingerprint 201cd46c \(27\.8 KB\), frozen when they approve/, "the facts don't show the fingerprint and size");
if (!out.ghSent.buttons.includes("Preview page")) fail("ghSent: no Preview page"); has("ghSent", /See their card, word for word/, "their card isn't one click away");
loopIs("ghApproved", ["done", "done", "done", "you", "", ""], "approved → the pull request is RGA's move (amber)"); if (!/Your move · open the pull request/i.test(out.ghApproved.label)) fail("ghApproved: " + "approved on GitHub isn't \"Your move · open the pull request\""); if (!out.ghApproved.buttons.includes("Open the pull request")) fail("ghApproved: no Open the pull request");
// 🔄 merge_without_the_browser_v1 (10-28): RGA merges on the server by default — never the browser's GitHub account
loopIs("ghPr", ["done", "done", "done", "done", "you", ""], "the pull request is open → RGA merges it for the client (amber)"); if (!/Your move · merge it for the client/i.test(out.ghPr.label)) fail("ghPr: " + "an open pull request isn't \"Your move · merge it for the client\""); if (!out.ghPr.buttons.includes("Merge #14 for the client") || !out.ghPr.buttons.includes("View on GitHub ↗")) fail("ghPr: no Merge #14 for the client / View on GitHub");
loopIs("ghPrClient", ["done", "done", "done", "done", "now", ""], "the client chose to merge → theirs on GitHub (blue)"); has("ghPrClient", /With the client · merge #14 on GitHub/, "the client-merges path isn't \"With the client · merge #14 on GitHub\""); if (out.ghPrClient.buttons.some((b) => /for the client|for them/.test(b))) fail("ghPrClient: RGA offers to merge although the client chose to");
loopIs("ghMerged", ["done", "done", "done", "done", "done", "you"], "merged → Mark live is RGA's move"); has("ghMerged", /Merged #14/, "a merged pull request isn't said"); has("ghMerged", /for the client, after their approval/, "RGA's merge isn't recorded as for the client, after their approval"); if (!out.ghMerged.buttons.includes("Mark live")) fail("ghMerged: no Mark live");
has("changes", /The client asked for a change/, "the client's ask isn't shown"); has("changes", /Keep the button as See Where You Rank Free/, "their words are missing"); if (!out.changes.buttons.includes("Edit and send again")) fail("the client's ask has no Edit and send again");
has("approved", /Publish exactly what they approved, then Mark live/, "approved isn't \"publish\""); loopIs("approved", ["done", "done", "done", "you", ""], "approved → publishing is RGA's move (amber)"); if (!out.approved.buttons.includes("Mark live")) fail("approved: no Mark live"); if (out.approved.pill !== "Publish") fail("approved: chip isn't \"Publish\"");
has("live", /Live · read back from the site/, "live doesn't say it was read back");
// auto_live_and_proof_v1: the Proof box — 9 of 9 only from the record; a line not proven is grey, never a tick
// 🔒 names_not_addresses_v1 (Chris 10-28 "make these rocketgrowthagency-admin more like a pill"): a GitHub login / repository in admin is a pill
if (!/<span class="ob-ghid"><span class="a r" aria-hidden="true">R<\/span>rocketgrowthagency-admin<\/span>/.test(out.ghMerged.html)) fail("ghMerged: the merging account isn't in its pill (ob-ghid)");
if (!/<span class="ob-ghid"><span class="a g" aria-hidden="true">G<\/span>acme\/site<\/span>/.test(out.ghMerged.html)) fail("ghMerged: the repository isn't in its pill (ob-ghid, G)");
{ const pt = out.ghMerged.pillT || "";
  if (/<img/.test(pt) || !/^&lt;img src=x&gt; by /.test(pt)) fail(`ghPillText doesn't escape the sentence around the pills: ${pt.slice(0, 80)}`);
  if (!/<span class="ob-ghid"><span class="a g" aria-hidden="true">G<\/span>acme\/site<\/span>$/.test(pt) || (pt.match(/ob-ghid/g) || []).length !== 2) fail(`ghPillText splits one name inside another (want 2 pills, the repo whole): ${pt.slice(-140)}`); }
{ const P = out.ghMerged.panel;
  if (!/RGA posts as\s*RGA Admin/.test(P.text) || !/Into the client's website code\s*Acme/.test(P.text) || !/Goes live on acme\.test/.test(P.text)) fail(`the GitHub panel's boxes aren't name-first (RGA Admin → the client's name · Goes live on): ${P.text.slice(0, 200)}`);
  if ((P.html.match(/class="ob-ghid"/g) || []).length < 4) fail(`the GitHub panel doesn't pill every login / repository (boxes, the check row, the footer): ${(P.html.match(/class="ob-ghid"/g) || []).length} pills`);
  if (/Into their repository|it publishes|Owner: /.test(P.text)) fail("the GitHub panel still says the old addresses-first wording");
  // 🔒 step8_spacing_v1 (approved 10-28, Chris "too crampt"): box 16px · label → name 8px · name → pill 10px · rows 14px · a pill row on 1.8
  if (P.pad !== "16px" || P.lblMb !== "8px" || P.nameMb !== "10px") fail(`the GitHub panel's boxes are packed again (padding ${P.pad}, label ${P.lblMb}, name ${P.nameMb}; the mockup is 16px / 8px / 10px)`);
  if (P.rowPad !== "14px") fail(`the GitHub panel's check rows are packed again (${P.rowPad}; the mockup is 14px)`);
  if (!(P.lh >= 1.75)) fail(`a check row with a pill sits on a tight line (${P.lh.toFixed(2)}; the mockup is 1.8)`);
  // the CONNECTION VERIFIED band, in the state colours (green · red · grey), always saying what it checked
  if (!P.band || !/Connection verified/.test(P.band.text) || !/RGA Admin can post to the Acme website code · (\d+) of \1 checks match/.test(P.band.text) || P.band.bg !== "rgb(227, 241, 223)") fail(`the panel doesn't open on a green "Connection verified" band naming the client and the checks (${P.band && P.band.text} · ${P.band && P.band.bg})`);
  if (!/Connection not verified/.test(P.bad) || !/Our key isn't the account the client invited · nothing opens or merges/.test(P.bad)) fail(`a mismatch isn't a "Connection not verified" band naming what failed (${P.bad})`);
  if (!/Couldn't check the connection/.test(P.err) || !/Check the connection now/.test(P.err)) fail(`GitHub not answering isn't the grey "Couldn't check the connection" band with its button (${P.err})`);
  if (!/Last merged here: #2 by/.test(P.foot)) fail(`while a new pull request is open, the panel forgets the last merge (${P.foot})`);
  if (!/Being changed/.test(P.chg) || !/nothing opens or merges until the new access is confirmed/.test(P.chg) || /Connection verified/.test(P.chg)) fail(`an open ask to change their access still reads "Connection verified" (${P.chg})`); }
if (!/Merged<\/b><span>by <span class="ob-ghid">/.test(out.ghLiveProven.html)) fail("the Proof box's Merged line doesn't put the account in its pill");
// Chris 10-28 4:03 PM "View Page with eye icon again": the live card opens the page with the eye button, in a new tab
if (!/<a class="admin-button admin-button-secondary ob-wc-view" href="https:\/\/[^"]+" target="_blank" rel="noopener"><svg[^>]*>[\s\S]*?<\/svg>View page<\/a>/.test(out.ghLiveProven.html) || /Open the page/.test(out.ghLiveProven.text)) fail("the live card doesn't open the page with the eye-icon \"View page\" (new tab)");
// while GitHub is checked, ONE icon: the master wait spinner — no dashed circle beside it (Chris 10-28 4:00 PM)
if (!/if \(v\.loading\) return `<span class="ob-ghv unk"><span><span class="vt">Checking GitHub…<\/span>/.test(fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"))) fail("the Checking GitHub… badge draws its own circle beside the wait spinner again");
if (!/Approves it\s*nothing goes up before this/.test(out.ghRemoveSent.text) || /Approves it\s*Oct/.test(out.ghRemoveSent.text)) fail("a sent removal ticks \"Approves it\" with the ADD's old approval");
if (!/Gone from their site\s*acme\.test\/rga-access-test\/ no longer shows the page · read back/.test(out.ghRemoveLive.text) || !/Proof · every step, on record\s*9 of 9/.test(out.ghRemoveLive.text) || /On their site, exactly/.test(out.ghRemoveLive.text)) fail(`a live removal isn't proven by "Gone from their site" (9 of 9): ${out.ghRemoveLive.text.slice(out.ghRemoveLive.text.indexOf("Proof"), out.ghRemoveLive.text.indexOf("Proof") + 160)}`);
if (out.ghRemoveLive.buttons.some((b) => /View page/.test(b))) fail("a removed page still offers View page");
has("ghLiveProven", /Proof · every step, on record\s*9 of 9/, "a fully proven change doesn't show Proof 9 of 9");
has("ghLiveProven", /the live page's fingerprint = 201cd46c, the approved file/, "the Proof box doesn't say the live page IS the approved file");
has("ghLiveProven", /Live · proven/, "a fully proven change isn't labelled \"Live · proven\" (mockup C)"); has("ghLiveProven", /acme\.test = their record = their approval/, "the Proof's website line isn't the mockup's \"= their record = their approval\"");
if (/Live · proven/.test(out.ghLivePartial.text)) fail("a change with missing proof is labelled \"Live · proven\"");
if (out.ghLivePartial.proofUnk !== 6 || /9 of 9/.test(out.ghLivePartial.text) || !/The branch tidied\s*not yet: checked again within 5 minutes/.test(out.ghLivePartial.text) || !/not fingerprinted/.test(out.ghLivePartial.text)) fail("a change with missing proof still shows 9 of 9 / ticks (a line not proven must be grey with why)"); loopIs("live", ["done", "done", "done", "done", "done"], "live and read back → every stop ticked"); if (out.live.pill !== "Live") fail("live: chip isn't \"Live\"");
has("right", /Already right · nothing needed changing/, "already right isn't said"); if (out.right.pill !== "Already right") fail("already right: chip isn't \"Already right\"");
// the prefill reads a run's field in EITHER shape a run writes it ("H1: words" or "**H1**" + the words on the next line)
{ const AD = read("netlify/functions/admin-deliverables.js"), i = AD.indexOf("  const line = (re) => {"), j = AD.indexOf("  let html = \"\";", i);
  if (i < 0 || j < 0) { console.error("⚠️  INDETERMINATE — the prefill reader moved"); process.exit(2); }
  const f = new Function("draft", `${AD.slice(i, j)}; return [line(/H1:\\s*(.+)/i), line(/PRIMARY_CTA:\\s*(.+)/i), line(/TITLE:\\s*(.+)/i)];`);
  const a1 = f("Here is the hero:\n---\n**H1**\nLocal SEO That Puts Your Business on the Map\n**PRIMARY_CTA**\nGet Your Free Audit"), a2 = f("TITLE: SEO Company in Culver City | RGA");
  if (a1[0] !== "Local SEO That Puts Your Business on the Map" || a1[1] !== "Get Your Free Audit") fail("a \"**H1**\" + next-line draft fills nothing (row 43's September draft read as \"didn't come out right\")");
  if (a2[2] !== "SEO Company in Culver City | RGA") fail("a \"TITLE: words\" draft no longer fills"); }
// the wiring the browser can't see
if (!/if \(t\.hasAttribute\("data-ob-wc-savesend"\)\) \{/.test(A) || !/site_action: "save", change: pre \}\);[\s\S]{0,200}internal_decision: "approved"/.test(A)) fail("Send for approval on a draft doesn't save it and send it");
if (!/\$\{(?:skipAskOpen\(s\.task\) \? `[^`]*` : )?gsQ \? gPill\(gsQ, s\.task\) : wcRowPill\(o\.flowId, s\.task\) \? wcRowPillHtml\(o\.flowId, s\.task\)/.test(A) || !/if \(!declined && wcRowPill\(o\.flowId, s\.task\)\) return wcRowPillHtml\(o\.flowId, s\.task\);/.test(A)) fail("the row's chip isn't the website state (queued / done rows)");
// ── builds 10, 11, 16 on the card ──
if (!/changed since it went live/i.test(out.pageDrift.text) || !/aren't on it: Page title/.test(out.pageDrift.text) || out.pageDrift.pill !== "Changed") fail("drift doesn't reopen the row and say which line");
if (!/Title as approved/.test(out.pageChecks.text) || !/<li><i class="o"[^>]*><\/i><span><b>Couldn't read their sitemap/.test(out.pageChecks.html)) fail("the live card doesn't show what was checked, with couldn't check left open");
if (!/Reading Search Console…/.test(out.pageChecks.text)) fail("the live card doesn't read Search Console");
if (!out.pageChecks.buttons.includes("Use this page for Google's link") || out.live.buttons.includes("Use this page for Google's link")) fail("the Google link button isn't on a live city page, or shows elsewhere");
if (!out.pageChecks.buttons.includes("Remove this page…")) fail("a real page can't be taken down through approval");
// ── builds 4, 6, 15 on the card ──
if (!/Page 1 of 3 is live/.test(out.pageOf.text) || !out.pageOf.buttons.includes("Start the next page")) fail("a page with more to go doesn't say so or offer the next one");
if (out.pageOf.pill !== "Live · 1 of 3") fail(`the row's chip hides that pages are left ("${out.pageOf.pill}")`);
if (out.live.buttons.includes("Start the next page")) fail("a finished step offers a next page");
if (!/two search phrases jammed into one sentence/.test(out.pageFlags.text) || !/can't be sent until you edit it/.test(out.pageFlags.text)) fail("a stuffed draft isn't flagged on the card");
if (!/Copied from their own page https:\/\/sparks\.test\/a\//.test(out.pageFlags.text)) fail("a copied sentence isn't flagged on the card");
if (!/Already shows for these searches/.test(out.pageFlags.text) || !/No competitor websites on record/.test(out.pageFlags.text)) fail("what the brief found isn't on the card");
if (!/No proof yet/.test(out.pageReady.text) || !out.pageReady.buttons.includes("Ask the client for one real result")) fail("a page with no proof doesn't offer the ask");
if (!/<del>Why hvac lose<\/del>/.test(out.pageEdit.html) || !/The page:/.test(out.pageEdit.text) || /class="ob-wc-rev"/.test(out.pageEdit.html)) fail("an edit to a page they have isn't Now → After on that page");
// ── draft_review_v1 (website_system_v2 build 7) ──
if (!/Your move · review the draft/i.test(out.pageReady.label)) fail("pageReady: a page draft isn't \"review the draft\"");
for (const [re, what] of [[/Its address\/electrician-springfield-il\/ · beside their 2 Springfield pages/, "the address + what it sits beside"], [/Title 39 of 65 characters, names Springfield/, "the title's measured length and what it names"], [/Description 61 of 160 characters/, "the description's measured length"],
  [/Written for 2 searches from the locked plan/, "the searches"], [/2 links · 3 areas · 2 questions/, "the counts (3 areas from a comma list, 2 questions)"], [/2 files change/, "the files"], [/How it looks in Google/, "the Google preview"], [/Your electrician in Springfield/, "the headline as it reads"], [/We also work on small shops\./, "the second paragraph as it reads"], [/How we work/, "how we work"], [/Do you pull permits\?/, "the questions"]])
  if (!re.test(out.pageReady.text)) fail(`the page review doesn't show ${what}`);
if (out.pageReady.buttons.filter((b) => b === "Send for approval").length !== 1 || !out.pageReady.buttons.includes("Edit the lines") || !out.pageReady.buttons.includes("Nothing needs changing…")) fail("the page review doesn't keep Send · Edit · Nothing needs changing");
if (out.pageReady.textareas) fail("the page review shows form boxes before you press Edit");
if ((out.pageReady.html.match(/<del>|<ins>/g) || []).length) fail("a new page is a wall of green highlight again (read the page, not Now → After)");
if (!/class="ob-wc-rev"/.test(out.pageDrafted.html)) fail("a saved page draft isn't reviewed the same way");
if (!/<li><i class="o"[^>]*><\/i><span><b>Title \d+ of 65 characters/.test(out.pageLong.html)) fail("a title past 65 characters still gets a tick");
if (!/<span class="ob-wc-new">New<\/span>Honest reporting/.test(out.ready.html)) fail("a short change's new line isn't marked New in plain text");
if (!/<del>Rank Higher/.test(out.ready.html) || !/<ins>Local SEO That Puts/.test(out.ready.html)) fail("a replacement lost its strike-through → new");
if (!/scDef\.kind === "visible" && task && \(scDef\.page \|\| task\.site_change/.test(A) || !/The run's raw output<\/summary>/.test(A)) fail("the raw run isn't one quiet link under a website card");

if (F.length) { console.error(`❌ the website rows aren't the approved step 8 cards — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log(`✅ the website rows are the approved step 8 cards: ${Object.keys(out).length} states rendered in Chrome — draft it · not proven · draft ready (one Send, the guarantee flagged) · failed · editing (no Kind/Where boxes) · send it · with the client · client asked · publish · live · already right — one card, no box in a box, one chip each`);
