#!/usr/bin/env node
// check-google-data-has-an-expiry.mjs — NO COPY OF GOOGLE BUSINESS PROFILE CONTENT SHIPS WITHOUT AN EXPIRY (google_30_day_part_b_v1).
// Google's Business Profile API policy: stored content is kept at most 30 days and "cannot be manipulated or aggregated". The delete list
// (netlify/functions/_gbp-purge.js: TARGETS, MONTHLY, KEYS, RAW) and its registry (_gbp-keep.js) are the ONE list of what is kept and for how long.
// This gate holds the code to it, statically (nothing is called, nothing is written):
//  (1) every function file that talks to a Business Profile API host is in the INVENTORY below, with what it does about storage:
//        covered:<ids>  its saved copies are on the delete list under those ids (each id must exist there)
//        none:<why>     it saves no Google content (it pushes RGA's own work, keeps ids or status words, or only reads)
//        open:<why>     NOT YET DECIDED. Printed on every run so it can't be forgotten; the owner reviews these.
//      A file that mentions a Business Profile host and is NOT in the inventory FAILS: someone added a writer without deciding its expiry.
//  (2) every Google column a job writes to a monthly record (patch.gbp_*, review_count, new_reviews, average_rating) is in _gbp-keep.js GOOGLE_FIELDS,
//      and the raw pull (data.gbp) is only written behind the expired-month guard.
//  (3) every saveRaw source in a Business Profile file, and the monthly report's, is on GOOGLE_RAW_SOURCES; the Google-free copy is not.
//  (4) the delete list is wired: the daily job runs all four parts (rows, monthly fields, JSON keys, saved files), checks in to System Health, fails the
//      run when a part fails (so RGA is alerted), and ships OFF (GBP_PURGE_ENABLED, nothing set here).
//  (5) a state snapshot surface written by a job is classified (Business Profile = on the list, or other = with a reason); a NEW surface fails.
// Exit 0 holds · 1 broken · 2 can't tell.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const F = [];
const ok = (c, m) => { if (!c) F.push(m); };
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const req = createRequire(`${FN}/x.js`);
let K, P;
try { K = req("./_gbp-keep.js"); P = req("./_gbp-purge.js"); } catch (e) { idk(`_gbp-keep / _gbp-purge won't load: ${e.message}`); }
const read = (f) => { try { return fs.readFileSync(`${FN}/${f}`, "utf8"); } catch { return null; } };
let files; try { files = fs.readdirSync(FN).filter((f) => f.endsWith(".js")); } catch { idk("netlify/functions is unreadable"); }
if (files.length < 100) idk(`only ${files.length} function files found`);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");   // comments don't count as code

// every id the delete list knows
const IDS = new Set([...P.TARGETS.map((t) => t.id), P.MONTHLY.id, ...K.GOOGLE_JSON_KEYS.map((k) => k.id), "raw_files"]);

// ── (1) the inventory ──────────────────────────────────────────────────────────────────────────────────────────────
const INVENTORY = {
  "_metrics.js": "covered:monthly_google_numbers",
  "refresh-review-metrics.js": "covered:reviews,review_replies",
  "deep-assess-client.js": "covered:profile",
  "v2-gbp-profile.js": "covered:onboarding_gbp_profile",
  "nap-and-review-audit.js": "none:the saved line carries the verdict and the vertical's median only, no Google figure of the client's",
  "_client-alerts.js": "none:writes alert status words (suspended, unverified), no Google figures",
  "_core-change.js": "none:pushes a change RGA proposed and the client approved; the change is RGA's own work",
  "core-change.js": "none:the same push, from the admin button",
  "gbp-apply-change.js": "none:applies RGA's change and logs it in the change log (RGA's own work)",
  "_gbp-facts.js": "none:pure; no table is written",
  "_offboarding.js": "none:end of service (client_offboarding_v1, 11-8) reads the profile's phone numbers and managers only to put the real number back and remove RGA; nothing of Google's is saved, and it DELETES the Google figures RGA kept",
  "_gbp-services.js": "none:builds the services RGA sends; no table is written",
  "_gbp-verify.js": "none:reads the verification state to decide; nothing saved",
  "_gbp-profile.js": "none:reads the connection (location id), no Google content saved",
  "_gbp-safety.js": "none:reads the connection state; nothing of Google's saved",
  "_gbp-posts.js": "none:RGA's own posts pushed to Google; Google's reply is not kept",
  "_google-inventory.js": "none:lists what the connection can see; nothing saved",
  "_listing-removal.js": "none:asks Google to remove a duplicate; pure",
  "_photo-publish.js": "none:RGA's own photos pushed to Google (RGA's source, not read back)",
  "_photo-retire.js": "none:RGA's own photos; removal only",
  "admin-gbp-booking.js": "none:pushes a booking link RGA set",
  "admin-gbp-categories.js": "none:pushes categories RGA chose",
  "admin-gbp-area-add.js": "none:pushes an area RGA chose",
  "backfill-place-ids.js": "none:saves place ids (identifiers), not Google content",
  "oauth-google-callback.js": "none:saves the connection (tokens, ids), not Google content",
  "oauth-google-recheck.js": "none:rechecks the connection; ids only",
  "v2-gbp-rediscover.js": "none:finds the location id again; ids only",
  "v2-push-gbp-content.js": "none:pushes content RGA drafted",
  "v2-respond-review.js": "none:sends RGA's reply; the review text is not kept",
  "_listing-removal-flow.js": "covered:listing_removals",
  "gbp-publish.js": "lawyer:keeps the profile as it was BEFORE an edit (change log value_before and the step's published.before), read back from Google, so an edit can be reverted; the owner required this on 2026-09-15; the AFTER side is RGA's own approved words",
  "gbp-duplicate-scan.js": "none:the Business Profile API is read only for the place ids of the client's own locations (identifiers, not saved); the duplicates saved come from the Maps search (SerpAPI)",
  "portal-step-recheck.js": "lawyer:the photo step saves the profile's photo list (thumbnail links, category, date, view count) so the card can draw it, and the verify line names an unverified location; reads of the profile elsewhere in the file save a verdict word only",
  "flow-execute.js": "lawyer:GBP baseline saves the profile's categories only (the first-week note shows them for 7 days; the whole profile is no longer saved); the photo-list step saves the category word; the grid step keeps the map pin as RGA's rank-check center; reviews are read for drafting and only a count is saved; the category list is Google's public catalog, not the client's",
  "v2-fetch-reviews.js": "none:returns the reviews to the admin screen to draw and saves nothing (the screen renders them and keeps no copy)",
  "ai-readiness-audit.js": "none:compares the website to the profile and discards the profile; the saved line says there is a mismatch without repeating Google's name or phone (fixed 11-05)",
  "citation-audit.js": "none:the profile's name and phone are used to compare and discarded; the saved line no longer repeats the phone (fixed 11-05)",
  "heal-onboarding-errors.js": "none:retries RGA's own manager invite and saves a status sentence; it reads no Google content",
  "_gbp-keep.js": "none:the registry itself (names hosts, writes nothing)",
  "_google-live.js": "none:the one live reader: it keeps Google's answer in memory for the request and writes no table, file or cache; it returns the answer to its caller",
};
const HOST_RE = new RegExp(K.BUSINESS_PROFILE_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|"));
const bpFiles = files.filter((f) => HOST_RE.test(strip(read(f) || "")) && f !== "_gbp-purge.js");
for (const f of bpFiles) {
  const d = INVENTORY[f];
  if (!d) { F.push(`(1) ${f} talks to a Business Profile API and is not in the inventory: decide what it saves and when that is deleted (add it to _gbp-purge.js, or say none/open here)`); continue; }
  const [kind, rest] = [d.split(":")[0], d.slice(d.indexOf(":") + 1)];
  if (kind === "covered") for (const id of rest.split(",")) ok(IDS.has(id), `(1) ${f} says its copies are covered by "${id}", which is not on the delete list`);
  else ok(["none", "open", "lawyer"].includes(kind) && rest.length > 10, `(1) ${f}: the inventory line needs covered:/none:/open: and a reason`);
}
for (const f of Object.keys(INVENTORY)) if (!files.includes(f)) F.push(`(1) the inventory names ${f}, which no longer exists`);

// Files that SAVE something derived from Google content without naming a Google host (they read what another job saved). Each id must be on the delete list.
const SAVED_ELSEWHERE = {
  "v2-brain-analysis-background.js": "brain_analysis",
  "brain-record-audit.js": "brain_audit_review_signals,brain_review_benchmarks",
  "send-monthly-report.js": "raw_files",
  "_reply-live.js": "review_replies",
};
for (const [f, ids] of Object.entries(SAVED_ELSEWHERE)) {
  ok(files.includes(f), `(1) ${f} is named in SAVED_ELSEWHERE and no longer exists`);
  for (const id of ids.split(",")) ok(IDS.has(id), `(1) ${f} saves something derived from Google content and "${id}" is not on the delete list`);
}

// ── (2) the monthly columns ─────────────────────────────────────────────────────────────────────────────────────────
for (const f of files) {
  const src = strip(read(f) || "");
  for (const m of src.matchAll(/\bpatch\.(gbp_(?!account_id|location_id)[a-z_]+|review_count|new_reviews|average_rating)\s*=/g))
    ok(K.GOOGLE_FIELDS.includes(m[1]), `(2) ${f} writes ${m[1]} to a monthly record and it is not in _gbp-keep.js GOOGLE_FIELDS (so it has no expiry)`);
  if (/\bdata\.gbp\s*=/.test(src)) ok(/monthIsExpired/.test(src), `(2) ${f} writes the raw Google pull (data.gbp) without the expired-month guard`);
}
{ const m = strip(read("_metrics.js") || "");
  for (const col of ["gbp_calls", "gbp_directions", "gbp_website_clicks", "gbp_impressions", "review_count", "average_rating", "new_reviews"]) ok(new RegExp(`patch\\.${col}\\s*=`).test(m), `(2) the metrics job no longer writes ${col} where this gate looks (re-read the gate)`);
  ok(/if \(gbp && !googleExpired\)/.test(m) && /if \(!googleExpired\) data\.gbp = /.test(m), "(2) the metrics job could write Google numbers into an expired month"); }

// ── (3) saved raw answers ───────────────────────────────────────────────────────────────────────────────────────────
for (const f of files) {
  const src = strip(read(f) || "");
  if (f === "_raw-store.js" || !/saveRaw\(/.test(src)) continue;
  const sources = [...src.matchAll(/saveRaw\(\{\s*source:\s*["']([a-z0-9-]+)["']/g)].map((m) => m[1]);
  if (HOST_RE.test(src)) for (const s of sources) ok(K.GOOGLE_RAW_SOURCES.includes(s), `(3) ${f} saves a raw answer ("${s}") beside a Business Profile call and the source is not on GOOGLE_RAW_SOURCES (no expiry)`);
}
{ const m = read("send-monthly-report.js") || "";
  ok(/saveRaw\(\{ source: "monthly-report", clientId/.test(m) && K.GOOGLE_RAW_SOURCES.includes("monthly-report"), "(3) the report as sent (it carries Google's numbers) isn't saved under a source that expires at 30 days");
  ok(!K.GOOGLE_RAW_SOURCES.includes(K.KEPT_REPORT_SOURCE) && /KEPT_REPORT_SOURCE/.test(m), "(3) the Google-free copy of the report is missing, or it was put on the expiry list"); }

// ── (4) the delete list is wired and ships off ──────────────────────────────────────────────────────────────────────
{ const p = strip(read("_gbp-purge.js") || ""), fn = read("gbp-30-day-purge.js") || "", man = read("_job-manifest.js") || "";
  ok(/await runMonthly\(/.test(p) && /await runKeys\(/.test(p) && /await runRaw\(/.test(p), "(4) the daily purge doesn't run all of its parts (rows, monthly fields, JSON keys, saved files)");
  ok(/for \(const k of keep\.GOOGLE_JSON_KEYS\)/.test(p) && /keep\.GOOGLE_RAW_SOURCES/.test(p), "(4) the purge doesn't read its keys and raw sources from _gbp-keep.js");
  ok(/withCheckin\("gbp-30-day-purge"/.test(fn) && /job: "gbp-30-day-purge"/.test(man), "(4) the daily purge doesn't check in to System Health");
  ok(/const ok = !r\.failed;/.test(fn) && /JSON\.stringify\(\{ ok, /.test(fn), "(4) a purge run with a failed part still reports ok, so RGA isn't alerted");
  ok(/GBP_PURGE_ENABLED === "1"/.test(p) && !/GBP_PURGE_ENABLED\s*=\s*["']1/.test(read("../../netlify.toml") || "") && !/^\s*GBP_PURGE_ENABLED\s*=/m.test(fs.readFileSync(`${SITE}/netlify.toml`, "utf8")), "(4) the purge is switched on in the repo (it must ship OFF)"); }

// ── (5) state snapshot surfaces ─────────────────────────────────────────────────────────────────────────────────────
const SURFACES = {
  reviews: "bp:the google_profile rows are on the list (reviews); the places rows are Places data, not covered",
  review_replies: "bp:review_replies",
  gbp: "bp:profile",
  nap_reviews: "other:verdicts only, no Google figure",
  website: "other:the client's own site", pagespeed: "other:PageSpeed API", onpage: "other:the client's own site", social: "other:social profiles",
  citations: "other:website and directory checks; the profile's values are compared and discarded", ai_readiness: "other:website checks; the profile's values are compared and discarded", recommendations: "other:RGA's plan",
  gsc: "other:Search Console API (a different Google API)", ga4: "other:Analytics API (a different Google API)", rankings: "other:RGA's own rank checks",
  grid: "other:RGA's own rank checks", onboarding: "other:RGA's own record", approval: "other:RGA's own record", directory_listings: "other:directory sites",
};
{ const seen = new Set();
  for (const f of files) {
    const src = strip(read(f) || "");
    if (!/client_state_snapshots/.test(src) || !/POST/.test(src)) continue;
    for (const m of src.matchAll(/surface:\s*["']([a-z_0-9]+)["']/g)) seen.add(m[1]);
    const s = src.match(/const SURFACE\s*=\s*["']([a-z_0-9]+)["']/); if (s) seen.add(s[1]);
  }
  for (const s of seen) ok(s in SURFACES, `(5) a job saves state snapshots on the surface "${s}" and this gate doesn't know whether it holds Google content (classify it in SURFACES, and add it to _gbp-purge.js if it does)`);
  for (const [s, d] of Object.entries(SURFACES)) if (d.startsWith("bp:")) { const id = d.slice(3).split(/[ :]/)[0]; ok(IDS.has(id) || (id === "the" ? true : false), `(5) surface "${s}" is Business Profile content and "${id}" is not on the delete list`); }
  ok(P.TARGETS.some((t) => /surface=eq\.review_replies/.test(t.filter)) && P.TARGETS.some((t) => /surface=eq\.reviews/.test(t.filter)) && P.TARGETS.some((t) => /surface=eq\.gbp/.test(t.filter)), "(5) the reviews, review_replies and gbp surfaces aren't all picked out on the delete list"); }

// ── (6) what is saved never repeats Google's own name or phone (the audits compare and discard; the live reader writes nothing) ────────────────────────────
{ const ai = strip(read("ai-readiness-audit.js") || ""), ci = strip(read("citation-audit.js") || ""), lv = strip(read("_google-live.js") || "");
  ok(!/vs GBP/.test(ai) && !/gbp\.title \|\| "—"/.test(ai) && !/GBP \$\{gbpPhone/.test(ai), "(6) the AI-readiness audit saves Google's name or phone in a finding");
  ok(!/GBP \$\{gPhone/.test(ci), "(6) the citation audit saves Google's phone in a finding");
  ok(lv.length > 500 && !/saveRaw|client_state_snapshots|method:\s*["'](PATCH|PUT|DELETE)["']/.test(lv), "(6) the live reader writes something (it must keep Google's answer in memory only)"); }

// the registry itself
ok(K.GOOGLE_JSON_KEYS.every((k) => k.table && (k.path || (k.paths && k.paths.length)) && k.stamp), "(4) a JSON key on the registry has no table, path or stamp");
ok(K.BUSINESS_PROFILE_HOSTS.every((h) => /\.googleapis\.com$/.test(h)) && !K.BUSINESS_PROFILE_HOSTS.some((h) => /places|maps\.googleapis|serpapi/.test(h)), "(1) the Business Profile host list includes Places or a search provider (not covered by this rule)");

const open = Object.entries(INVENTORY).filter(([, d]) => d.startsWith("open:"));
const lawyer = Object.entries(INVENTORY).filter(([, d]) => d.startsWith("lawyer:"));
// A number typed from a dashboard, or kept on RGA's disk, is not Business Profile API content: listed for the lawyer, never deleted.
const TYPED = ["admin-typed baselines.gbp (the owner types the dashboard figure at kickoff: not from the API)", "v2-baselines screenshots (images of the client's own dashboard that the client or RGA uploaded)", "raw-store copies on the backup drive (the same saved files as the delete list's RAW sources, copied by the nightly backup: the backup copy must expire with them, an open item for the backup job)"];
if (F.length) { console.error(`🔴 check-google-data-has-an-expiry: ${F.length} problem${F.length === 1 ? "" : "s"}`); F.forEach((m) => console.error("  - " + m)); process.exit(1); }
console.log(`✅ check-google-data-has-an-expiry: ${bpFiles.length} Business Profile files all accounted for, every Google column and saved answer has an expiry, the delete list is wired and OFF`);
if (lawyer.length) { console.log(`   ${lawyer.length} kept on purpose, listed for the lawyer (not deleted):`); for (const [f, d] of lawyer) console.log(`   - ${f}: ${d.slice(7)}`); }
console.log(`   typed or uploaded by a person, not API content (for the lawyer):`); for (const t of TYPED) console.log(`   - ${t}`);
if (open.length) { console.log(`   ${open.length} not yet decided (for the owner):`); for (const [f, d] of open) console.log(`   - ${f}: ${d.slice(5)}`); }
