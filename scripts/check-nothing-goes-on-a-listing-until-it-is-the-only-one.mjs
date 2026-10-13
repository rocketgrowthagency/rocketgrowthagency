#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-nothing-goes-on-a-listing-until-it-is-the-only-one.mjs
//
// 🔒 WHY (2026-10-12, approved one_google_listing_first_v1): Chris — "RGA has 2 Google Business Profiles … we need a
// safeguard that won't let the client do these upload photo steps until 1 GBP is confirmed and not multiple."
// Step 11 (m1.audit.gbp_duplicate) had FOUND RGA's second listing and then marked itself DONE (two writers wrote
// `status: "done"` for every verdict), and nothing waited on it.
// HOLDS — running the real code where it can:
//   1. ONE rule: `_one-listing.listingState` — clean / RGA's written override open it; a duplicate, "could not look"
//      and "never checked" keep it shut. The admin's and the portal's copies give the same answer for every case.
//   2. Every writer to a listing asks first: photo publish (held, nothing written), photo approval (409), gbp-publish,
//      gbp-apply-change (a dry run / category search may still read).
//   3. Step 11 is never DONE while a duplicate is live: the scan writes done only for clean (or an override for
//      exactly the listings it named); a failed look keeps the last real answer; a run that found one says
//      `completed: false`, and flow-execute honours it.
//   4. The 8 steps that write to the listing depend on step 11 — in BOTH SOP copies.
//   5. Client step 7: locked → the band, every file input disabled, the batch row hidden; open → none of that.
//   6. Admin step 39: paused → the pause band and every Send disabled; open → Send enabled.
//   7. The nightly re-check asks every client without a real answer, and tells a client "it's gone" ONLY when a
//      duplicate it had checks clean.
//   8. The portal never asks the client to do a waiting step: "Waits on your Google listing", the form disabled, never
//      the NEXT step; the projection carries `waitsOnListing`; both portal save endpoints refuse with a 409.
// exit 0 = nothing goes on a listing until it is the only one · 1 = something can · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SOP_SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (r, base = SITE) => { try { return fs.readFileSync(`${base}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const DUP = "m1.audit.gbp_duplicate";

// ── 1 · one rule, three copies that agree ──
const { listingState } = req("./_one-listing.js");
const CASES = [
  ["clean", { outcome_data: { verdict: "clean" } }, true],
  ["duplicate", { outcome_data: { verdict: "duplicate", duplicates: [{ place_id: "p2" }] } }, false],
  ["could not look", { outcome_data: { verdict: "indeterminate" } }, false],
  ["never checked", undefined, false],
  ["duplicate + RGA's written override", { outcome_data: { verdict: "duplicate", duplicates: [{ place_id: "p2" }] }, override: { reason: "A different business with the same name.", places: ["p2"] } }, true],
  ["an override with no reason", { outcome_data: { verdict: "duplicate", duplicates: [{}] }, override: { reason: "" } }, false],
];
const tasksOf = (t) => (t === undefined ? {} : { [DUP]: t });
for (const [name, t, open] of CASES) if (listingState(tasksOf(t)).open !== open) fail(`the rule says ${open ? "shut" : "open"} for "${name}" — expected ${open ? "open" : "shut"}`);
const lift = (src, start, end) => { const i = src.indexOf(start); const j = i < 0 ? -1 : src.indexOf(end, i); return i < 0 || j < 0 ? null : src.slice(i, j); };
const admin = read("admin/admin.js"), portal = read("portal/portal.js");
const aFn = lift(admin, "function listingStateOf(tasks) {", "\nconst adminListing");
const pFn = lift(portal, "function portalListingStateOf(tasks) {", "\nfunction photoListingLockHtml");
if (!aFn || !pFn) { console.error("⚠️  INDETERMINATE — could not lift the admin/portal copies of the rule"); process.exit(2); }
const ctx = { DUP_STEP: DUP }; vm.createContext(ctx);
vm.runInContext(`${aFn}\n${pFn}\nthis.a = listingStateOf; this.p = portalListingStateOf;`, ctx);
for (const [name, t, open] of CASES) {
  if (ctx.a(tasksOf(t)).open !== open) fail(`the ADMIN's copy of the rule disagrees for "${name}"`);
  if (ctx.p(tasksOf(t)).open !== open) fail(`the PORTAL's copy of the rule disagrees for "${name}"`);
}

// ── 2 · every writer asks first ──
const pub = code("netlify/functions/gbp-publish.js");
if (!/const listing = listingState\(rec\?\.data\?\.tasks\);\s*if \(!listing\.open\) return json\(409/.test(pub)) fail("gbp-publish can write to a listing step 11 hasn't confirmed");
const apply = code("netlify/functions/gbp-apply-change.js");
if (!/if \(q\.dry !== "1" && field !== "categories_search"\) \{[\s\S]{0,400}listingState\([\s\S]{0,120}if \(!listing\.open\) return json\(409/.test(apply)) fail("gbp-apply-change can write to a listing step 11 hasn't confirmed");
const review = code("netlify/functions/admin-photo-review.js");
if (!/const listing = await oneListingFor\(supa, client_id\);\s*if \(!listing\.open\) return json\(409/.test(review)) fail("a photo can be approved for Google while step 11 hasn't confirmed one listing");
const photoPub = code("netlify/functions/_photo-publish.js");
if (!/const listing = await oneListingFor\(d\.supa, clientId\);\s*if \(!listing\.open\) \{[\s\S]{0,200}return summary;/.test(photoPub)) fail("the photo publisher sends while step 11 hasn't confirmed one listing");

// ── 3 · step 11 is never done while a duplicate is live ──
const scan = code("netlify/functions/gbp-duplicate-scan.js");
if (/tasks\["m1\.audit\.gbp_duplicate"\] = \{\s*\.\.\.prev,\s*status: "done"/.test(scan)) fail("the scan writes status done for every verdict again");
if (!/if \(record\.verdict === "clean"\) \{\s*next = \{ status: "done"/.test(scan)) fail("the scan no longer marks done ONLY on a clean result");
if (!/status: keep \? "done" : "pending"/.test(scan) || !/\.every\(\(x\) => \(ov\.places \|\| \[\]\)\.includes\(placeOf\(x\)\)\)/.test(scan)) fail("a duplicate can be done without an override naming exactly those listings");
if (!/\} else if \(prevReal\) \{\s*next = \{ last_failed_scan: record \};/.test(scan)) fail("a failed look overwrites the last real answer");
const flow = code("netlify/functions/flow-execute.js");
if (!/const isDone = result\?\.completed === false \? false :/.test(flow)) fail("flow-execute marks a step done even when its runner says completed:false");
const runner = lift(flow, '"m1.audit.gbp_duplicate": async', '"m1.audit.deep_assess": async');
if (!runner || !/completed: !!j\.override/.test(runner) || (runner.match(/completed: false/g) || []).length < 2) fail("step 11's runner no longer keeps itself open on a duplicate / a failed look");
if (!/const kept = j\.task && j\.task\.outcome_data;[\s\S]{0,900}outcome_data: kept,/.test(runner || "")) fail("a failed look's runner result can overwrite step 11's last real answer (flow-execute saves the runner's outcome_data)");
if (!/const noResults = d\.error && \/hasn't returned any results\/i/.test(scan) || !/if \(!r\.ok \|\| \(d\.error && !noResults\)\) throw/.test(scan)) fail("zero Maps results is read as 'could not look' again, so a known duplicate is never re-checked");
if (!/if \(v\.verdict !== "duplicate"\) \{\s*const priorTask = await priorFinding\(clientId\);/.test(scan)) fail("a known duplicate is re-checked only when the name search looks clean — Google hiding both listings would read as 'could not tell'");
if (!/task: storedTask \}\);/.test(scan)) fail("the scan no longer hands back what it saved");
const ovFn = code("netlify/functions/gbp-listing-override.js");
if (!/requireWorkspaceForClient\(event, clientId\)/.test(ovFn) || !/reason\.length < 10/.test(ovFn)) fail("the override is not staff-only with a written reason");

// ── 4 · the 8 listing-writing steps wait on step 11, in both SOP copies ──
const WRITERS = ["m1.gbp.optimize_categories", "m1.gbp.services_products", "m1.gbp.business_description", "m1.gbp.hours_attributes", "m1.gbp.attributes", "m1.gbp.messaging", "m1.gbp.booking_link", "m1.gbp.qa_seed"];
const pj = JSON.parse(read("data/playbooks/playbooks.json"));
const byId = new Map(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.id && o.dependsOn) byId.set(o.id, o); Object.values(o).forEach(walk); } })(pj);
const m1 = await import(pathToFileURL(`${SCRAPER}/flow/playbooks/month1.mjs`).href);
const canon = new Map(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.id && o.dependsOn) canon.set(o.id, o); Object.values(o).forEach(walk); } })(Object.values(m1));
for (const id of WRITERS) {
  if (!(byId.get(id)?.dependsOn || []).includes(DUP)) fail(`${id} (website SOP) can run before step 11 confirms one listing`);
  if (!(canon.get(id)?.dependsOn || []).includes(DUP)) fail(`${id} (canonical SOP) can run before step 11 confirms one listing`);
}
if ((byId.get("m1.gbp.photos")?.dependsOn || []).includes(DUP)) fail("the photo step depends on step 11 — then its shot list can't be built on Google connect; it locks the upload instead");

// ── 5 · client step 7 ──
const slotsSrc = lift(portal, "const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails");
const stateSrc = lift(portal, "const PHOTO_STATE = {", "\n\n");
const bigSrc = lift(portal, "const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
if (!slotsSrc || !stateSrc || !bigSrc) { console.error("⚠️  INDETERMINATE — could not lift the portal slot renderer"); process.exit(2); }
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const ART = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: ART.artKey, console };
vm.createContext(pctx);
vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\nthis.render = photoSlotsHtml; this.ls = portalListingStateOf;`, pctx);
const P = req("./_photo-lists.js");
const shape = P.buildShotList({ category: "Plumber", storefront: false });
const shut = pctx.render({ clientForm: "photo_upload" }, { draft_shape: shape }, [], "c1", "", pctx.ls({ [DUP]: { outcome_data: { verdict: "duplicate", duplicates: [{}] } } }));
const open = pctx.render({ clientForm: "photo_upload" }, { draft_shape: shape }, [], "c1", "", pctx.ls({ [DUP]: { outcome_data: { verdict: "clean" } } }));
const inputs = (h) => (h.match(/<input[^>]*type="file"[^>]*>/g) || []);
if (!/class="pm-lock"/.test(shut) || !/two Google listings/.test(shut)) fail("a locked step 7 doesn't say why");
if (!inputs(shut).length || inputs(shut).some((i) => !/\bdisabled\b/.test(i))) fail("a locked step 7 still lets the client pick a photo");
if (!/<div class="pm-batch" hidden>/.test(shut)) fail("a locked step 7 still offers the batch upload");
if (!/The meeting|data-slot="1"/.test(shut) || (shut.match(/data-slot="/g) || []).length !== 20) fail("a locked step 7 hides the shot list — it should stay visible to plan");
if (/class="pm-lock"/.test(open) || inputs(open).some((i) => /\bdisabled\b/.test(i))) fail("step 7 is locked even though step 11 found one listing");

// ── 6 · admin step 39 ──
const partA = lift(admin, "const PHOTO_KIND_LABEL = {", "let photoAiAsked");
const partB = lift(admin, "// 🔒 THE SAME FILE IN TWO SLOTS", "\n// 🔴 PHOTOS ARRIVE WHENEVER");
if (!partA || !partB || !/function listingStateOf\(tasks\)/.test(partB)) { console.error("⚠️  INDETERMINATE — could not lift the step 39 renderer"); process.exit(2); }
const items = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, group: "g", google: "INTERIOR", do: `Shot ${i + 1}` }));
const step39 = (verdict) => {
  const c = {
    escapeHtml: esc, escapeAttribute: esc, PHOTO_REVIEW_STEP: "m1.gbp.photos", PHOTO_EXAMPLE_SPRITE: "", ADMIN_PHOTO_STATE: {},
    photoExampleOf: () => ({ art: "x" }), photoExampleArt: () => "<svg></svg>", artKey: () => "E|g|1", formatDateTime: () => "Oct 9", obNumberOf: () => 11,
    state: { selectedClient: { id: "c1" }, photos: [{ id: "p8", client_id: "c1", shot_n: 8, category: "interior", publish_state: "in_review", storage_path: "x" }, { id: "p9", client_id: "c1", shot_n: 9, category: "interior", publish_state: "in_review", storage_path: "y" }],
      onboardingData: { tasks: { [DUP]: verdict ? { outcome_data: { verdict, duplicates: [{}] } } : undefined, "m1.gbp.photos": { draft_shape: { items }, photo_ai: { uploads: { p8: { matches: true }, p9: { matches: true } } } } } } },
  };
  vm.createContext(c);
  vm.runInContext(`${partA}\n${partB}\nthis.render = photoReviewHtml;`, c);
  return c.render();
};
const paused = step39("duplicate"), going = step39("clean");
if (!/Sending to Google is paused/.test(paused) || !/step 11 found 2 Google listings/.test(paused)) fail("admin step 39 doesn't say sending is paused, and why");
const sends = (h) => h.match(/<button[^>]*data-photo-approve(?:-all)?=[^>]*>/g) || [];
if (!sends(paused).length || sends(paused).some((b) => !/\bdisabled\b/.test(b))) fail("admin step 39 still offers Send to Google with 2 listings");
if (/Sending to Google is paused/.test(going) || sends(going).some((b) => /\bdisabled\b/.test(b))) fail("admin step 39 is paused even though step 11 found one listing");
if (!/el\.querySelectorAll\("\.ob-body:not\(\.ol-host\) > \.ob-actions, \.ob-body:not\(\.ol-host\) > details\.ob-out"\)\.forEach\(\(n\) => \{ n\.style\.display = "none"; \}\);/.test(admin)) fail("step 11 shows its generic 'Mark step complete' beside a live duplicate again");
if (!/Waits on \$\{dupStepName\(\)\}/.test(admin)) fail("the step 39 row no longer says it waits on step 11");

// ── 7 · the nightly re-check ──
const re = code("netlify/functions/gbp-duplicate-recheck.js");
if (!/if \(!hasRecord \|\| before\?\.verdict === "clean" \|\| task\?\.override\?\.reason\) continue;/.test(re)) fail("the nightly re-check skips clients that have no real answer yet");
if (!/if \(!\(before\?\.verdict === "duplicate" && finding\?\.verdict === "clean"\)\)/.test(re)) fail("the re-check can tell a client 'the second listing is gone' when there never was one");

// ── 8 · the client is never asked to do a step that waits (acceptance walk, 2026-10-12: steps 33, 34, 36, 39 read
//        admin "Locked" / "Waits on step 11" while the portal said "Your turn", and saving hours there marked the step
//        Done with nothing able to reach Google). Approved one_google_listing_first_v1, decisions 2 + 3.
const { waitsOnListing } = req("./_one-listing.js");
const allSteps = [...(pj.month1 || []), ...(pj.month2plus || [])];
for (const id of ["m1.gbp.hours_attributes", "m1.gbp.attributes", "m1.gbp.booking_link", "m1.gbp.messaging", "m1.gbp.photos"]) {
  if (!waitsOnListing(allSteps.find((x) => x.id === id))) fail(`${id} does not wait on one Google listing (waitsOnListing)`);
}
if (waitsOnListing(allSteps.find((x) => x.id === "m1.gbp.verify"))) fail("waitsOnListing is true for a step that doesn't touch the listing (m1.gbp.verify)");
const cs = JSON.parse(read("data/playbooks/client-steps.json"));
for (const st of [...(cs.month1 || []), ...(cs.month2plus || [])]) {
  const want = waitsOnListing(allSteps.find((x) => x.id === st.id));
  if (!!st.waitsOnListing !== want) fail(`client-steps.json: ${st.id} waitsOnListing is ${!!st.waitsOnListing}, the SOP says ${want} — re-run build-client-steps`);
}
for (const [f, label] of [["netlify/functions/portal-step-input.js", "saving an answer"], ["netlify/functions/portal-step-choice.js", "\"I've done it\""]]) {
  const src = code(f);
  // 🔑 EVERY "done" write has its own guard in its own branch (2026-10-12: a guard added to a later branch kept this
  // green with the "I've done it" guard removed): the nearest guard before each write, with no other write between.
  const guards = [...src.matchAll(/if \(waitsOnListing\((?:step|s)\) && !listingState\(rec\.listingTasks\)\.open\) return json\(409/g)].map((m) => m.index);
  const writes = [...src.matchAll(/status: "done"/g)].map((m) => m.index);
  if (!writes.length) fail(`${label}: no status write found in ${f} — re-read this gate`);
  for (const w of writes) {
    const g = guards.filter((x) => x < w).pop();
    if (g === undefined || writes.some((o) => o > g && o < w)) fail(`${label} in the portal can finish a listing step while step 11 hasn't found one listing (${f})`);
  }
}
const waitFns = lift(portal, "function rowListingWaits(step, status, tasks) {", "\nfunction photoListingLockHtml");
if (!waitFns) fail("the portal's row-wait helpers are gone (rowListingWaits / listingWaitHtml)");
else {
  const wctx = {}; vm.createContext(wctx);
  vm.runInContext(`${pFn}\n${waitFns}\nthis.w = rowListingWaits; this.h = listingWaitHtml; this.ls = portalListingStateOf;`, wctx);
  const dupT = { [DUP]: { outcome_data: { verdict: "duplicate", duplicates: [{}] } } }, cleanT = { [DUP]: { outcome_data: { verdict: "clean" } } };
  const hrs = { id: "m1.gbp.hours_attributes", waitsOnListing: true };
  if (!wctx.w(hrs, "pending", dupT) || !wctx.w(hrs, "pending", {})) fail("a portal listing step doesn't wait on a duplicate / an unchecked listing");
  if (wctx.w(hrs, "pending", cleanT) || wctx.w(hrs, "done", dupT) || wctx.w({ id: "x" }, "pending", dupT)) fail("a portal step waits when it shouldn't (one listing, already done, or not a listing step)");
  if (!/two Google listings/.test(wctx.h(wctx.ls(dupT))) || !/data-photo-lock-approvals/.test(wctx.h(wctx.ls(dupT)))) fail("a waiting portal step doesn't say why or offer the way out");
}
const pcode = code("portal/portal.js");
// 🔑 2026-10-12: the same lines now also carry the RGA wait (check-a-client-step-waits-on-what-it-needs); this pins the
// listing half: `!listingWait` stays in the turn, and `rowWaits` (the marker's + the headline's question) includes it.
if (!/const theirsToAct = !kickoffPending && (?:!ownWait && )?!listingWait && (?:!rgaWait && )?\(/.test(pcode)) fail("a waiting portal step still counts as the client's turn (the orange edge)");
if (!/: listingWait \? \{ text: "Waits on your Google listing", cls: "wait" \}\s*: theirsToAct \? \{ text: "Your turn"/.test(pcode)) fail("a waiting portal step says \"Your turn\" — the approved pill is \"Waits on your Google listing\"");
if (!/const theirs = \(r\) => !(?:rowListingWaits|rowWaits)\(r\.step, r\.status/.test(pcode)
  || (/const theirs = \(r\) => !rowWaits\(/.test(pcode) && !/function rowWaits\(step, status, tasks(?:, \w+)?\) \{\s*return (?:!!rowOwnWaits\(step, status, tasks\) \|\| )?rowListingWaits\(step, status, tasks\) \|\|/.test(pcode))) fail("a waiting portal step can be marked as the client's NEXT step");
if (!/const completionCtl = listingWait && completionCtlLive && !step\.clientHow\s*\? `<fieldset class="pm-waits" disabled>/.test(pcode)) fail("a waiting portal step's form is still live");

if (F.length) { console.error("🔴 something can go on a Google listing that isn't confirmed to be the only one:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ one rule (3 copies agree on ${CASES.length} cases); 4 writers ask first; step 11 is never done on a duplicate; 8 profile steps wait on it in both SOPs; client step 7 locks and admin step 39 pauses — and both open on one listing; the portal never says "Your turn" on a waiting step and its saves refuse`);
