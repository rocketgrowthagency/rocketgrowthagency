#!/usr/bin/env node
// check-website-pages-are-website-changes.mjs: website_system_v2 builds 1 and 2 (approved 10-28, built 11-01).
//   1 · the page steps wait on what makes them true, in BOTH copies of the SOP. Photos and reviews never block a page.
//   2 · a service page and a service × area page are website changes: approved copy alone never finishes them, only live + read back.
//   3 · a step with more pages to go stays open until the last page is live.
//   4 · a change to a page a site already has names the lines it changes.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let SC, PB, M1;
try {
  SC = req(`${SITE}/shared/site-change.js`);
  PB = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  M1 = fs.readFileSync(`${SCR}/flow/playbooks/month1.mjs`, "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }

// ── 1 · the blockers, in both copies ─────────────────────────────────────────────────────────
const WANT = {
  "m1.web.h1_cta": ["m1.web.homepage_meta"],
  "m1.web.priority_pages": ["m1.web.homepage_meta", "m1.gbp.services_products"],
  "m1.web.location_pages": ["m1.gbp.business_facts", "m1.web.homepage_meta", "m1.web.priority_pages"],
  "m1.web.expanded_schema": ["m1.web.location_pages"],
};
const jsonDeps = (id) => (PB.month1.find((s) => s.id === id) || {}).dependsOn || [];
const mjsDeps = (id) => { const i = M1.indexOf(`id: "${id}"`); if (i < 0) return []; const m = M1.slice(i, i + 400).match(/dependsOn: \[([^\]]*)\]/); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []; };
for (const [id, deps] of Object.entries(WANT)) for (const d of deps) {
  if (!jsonDeps(id).includes(d)) fail(`${id} doesn't wait on ${d} in the admin's playbook`);
  if (!mjsDeps(id).includes(d)) fail(`${id} doesn't wait on ${d} in the runner's playbook`);
}
const PAGE_STEPS = ["m1.web.priority_pages", "m1.web.location_pages", "m1.web.service_location_matrix", "m1.web.blog_seed"];
for (const id of PAGE_STEPS) for (const d of jsonDeps(id)) if (/photos|review/.test(d)) fail(`${id} waits on ${d}: a client who never sends photos or reviews still gets a page`);

// ── 2 · pages are website changes ────────────────────────────────────────────────────────────
for (const id of ["m1.web.priority_pages", "m1.web.location_pages", "m1.web.service_location_matrix"]) {
  if (!SC.isSiteChangeStep(id) || SC.COPY_STEPS.includes(id)) fail(`${id} is not a website change`);
  if (!SC.STEPS[id].page) fail(`${id} isn't marked as a page the builder makes`);
  const approvedOnly = { site_change: { v: "1", kind: "visible" }, approval: { decision: "approved", change_v: "1" } };
  if (SC.stepMayBeDone(approvedOnly)) fail(`${id}: an approved page that isn't live counts as done`);
  if (!SC.stepMayBeDone({ ...approvedOnly, published: { v: "1" } })) fail(`${id}: a live page doesn't finish the step`);
}
if (!SC.COPY_STEPS.includes("m1.web.blog_seed") || SC.isSiteChangeStep("m1.web.blog_seed")) fail("the blog step moved: it keeps its own check");
const base = { page_url: "https://x.test/water-heaters/", files: [{ path: "water-heaters/index.html", action: "add" }], items: [{ label: "Page title", role: "title", after: "Water heaters | X" }] };
const made = SC.cleanChange("m1.web.priority_pages", base);
if (!made.change || !made.change.new_page || made.change.label !== "add_page") fail(`a new service page isn't labelled as adding a page (${made.error || made.change.label})`);
if (!SC.cleanChange("m1.web.priority_pages", { ...base, files: [] }).error) fail("a new service page saves without its file");
if (!SC.cleanChange("m1.web.priority_pages", { ...base, page_url: "" }).error) fail("a new service page saves without its address");

// ── 3 · more pages to go ─────────────────────────────────────────────────────────────────────
const q = SC.cleanChange("m1.web.priority_pages", { ...base, page_of: { at: 1, of: 3 } }).change;
if (!q || !q.page_of || q.page_of.of !== 3) fail("a change loses which page of how many it is");
const live = (c) => ({ site_change: { ...c, v: "1" }, published: { v: "1" } });
if (q) {
  if (SC.pagesLeft(live(q)) !== 2) fail("page 1 of 3 doesn't count 2 left");
  if (SC.stepMayBeDone(live(q))) fail("page 1 of 3 going live finishes the whole step");
  if (!SC.stepMayBeDone(live({ ...q, page_of: { at: 3, of: 3 } }))) fail("the last page going live doesn't finish the step");
}
const AD = fs.readFileSync(`${SITE}/netlify/functions/admin-deliverables.js`, "utf8");
if (!/if \(SC\.stepMayBeDone\(t\)\) \{ t\.status = "done"; t\.completed_at = now; \} else t\.status = "in_progress";/.test(AD)) fail("Mark live finishes a step that still has pages to go");

// ── 4 · an edit names its lines ──────────────────────────────────────────────────────────────
const ed = { edits_page: true, page_url: "https://x.test/plumbing-denver/", files: [{ path: "plumbing-denver/index.html", action: "edit" }], items: [{ label: "A line", before: "old words", after: "new words" }] };
const e1 = SC.cleanChange("m1.web.service_location_matrix", ed);
if (!e1.change || !e1.change.edits_page || e1.change.new_page || e1.change.label !== "edit_page") fail(`an edit to a page they have isn't labelled as editing a page (${e1.error || e1.change.label})`);
if (!SC.cleanChange("m1.web.service_location_matrix", { ...ed, items: [{ label: "A line", after: "new words" }] }).error) fail("an edit saves a line with no current words: nothing says what it replaces");
if (!SC.cleanChange("m1.web.service_location_matrix", { ...ed, files: [] }).error) fail("an edit saves without the file it changes");
if (SC.cleanChange("m1.web.priority_pages", ed).change?.edits_page) fail("a step that only adds pages can be saved as an edit");

if (F.length) { console.error(`❌ website pages: ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ website pages wait on what makes them true (both SOP copies), are website changes, stay open until the last page is live, and an edit names its lines");
