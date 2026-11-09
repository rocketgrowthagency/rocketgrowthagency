#!/usr/bin/env node
// check-admin-steps-29-38-match-mockups.mjs — 2026-10-29, Chris approved 11 mockups ("all approved."): admin steps 29–38, one page each,
// and client portal step 4's done card (project_admin_steps_29_38_redesign). This gate pins each one AS IT IS BUILT — it RUNS the lifted
// admin / portal code with real-shaped records and checks what's drawn:
//   · step 34 (admin_step34_hours_v1): one week of tiles (12-hour clock), closed days as dated chips, one proof line, no client email,
//     "the same as before" when Google's hours didn't change, a changed day shows "was …"
//   · step 33 (admin_step33_description_v1): the published description whole, the 750 meter, approved + published dates, ONE action
//     (Draft a new one), never "ready to paste"
//   · step 37 (admin_step37_image_seo_v1) — every website-change step: no second Draft button and no Mark step complete on the row
//   · client step 4 (client_step4_done_card_v1 → client_step04_business_facts_v1, the card system 10-29): the done card shows ALL five
//     facts, the service area as one chip row right after the name, a covered place says where ("Mar Vista in Los Angeles"); the
//     lock line's own "Need a change? ›" is hidden (Change something opens it)
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const AJS = read("admin/admin.js"), PJS = read("portal/portal.js"), ACSS = read("admin/admin.css");
const lift = (src, name) => { const m = new RegExp(`^(?:const ${name} = |function ${name}\\()`, "m").exec(src); if (!m) return null;
  const lines = src.slice(m.index).split("\n"); let d = 0, o = []; for (const l of lines) { o.push(l); for (const c of l) { if (c === "{" || c === "(" || c === "[") d++; else if (c === "}" || c === ")" || c === "]") d--; } if (d <= 0 && /[;}`\]]\s*$/.test(l)) break; } return o.join("\n"); };
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── admin: steps 33 + 34 ────────────────────────────────────────────────────────────────────────
const parts = ["ZC_DAYS", "zcClock", "zcSpan", "hoursDoneCardHtml", "descriptionOnGoogle", "descriptionDoneCardHtml"].map((n) => lift(AJS, n));
if (parts.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step 33/34 card moved (${parts.findIndex((x) => !x)})`); process.exit(2); }
const ctx = { escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg data-g></svg>", adminGcardMaps: () => '<a class="ob-gcard-maps">See it on Google Maps ↗</a>',
  adminGcardWhen: (iso) => (iso ? "Oct 29, 3:30 AM" : "") };
vm.createContext(ctx); ctx.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */  vm.runInContext(parts.join("\n") + "\nthis.hours = hoursDoneCardHtml; this.desc = descriptionDoneCardHtml; this.descOn = descriptionOnGoogle;", ctx);
const wk = (o, c) => ({ open: o, close: c }), DAYS = { mon: wk("09:00", "18:00"), tue: wk("09:00", "18:00"), wed: wk("09:00", "18:00"), thu: wk("09:00", "18:00"), fri: wk("09:00", "18:00"), sat: { closed: true }, sun: { closed: true } };
const g34 = { state: "on_google", at: "2026-10-29T10:30:00Z", before: { days: DAYS }, after: { days: DAYS }, renewed_to: "2026-12-25",
  special: { sent: [{ name: "Thanksgiving", date: "2026-11-26" }, { name: "Christmas Eve", date: "2026-12-24" }, { name: "Christmas Day", date: "2026-12-25" }], kept: [] } };
const h = ctx.hours({ days: DAYS }, g34);
if ((h.match(/class="ob-zc-day/g) || []).length !== 7) fail("step 34: not one tile per day");
if ((h.match(/9 AM – 6 PM/g) || []).length !== 5 || (h.match(/>Closed</g) || []).length !== 2) fail("step 34: the week isn't 12-hour (9 AM – 6 PM) with Sat/Sun Closed");
if (!/Thanksgiving · Nov 26/.test(h) || !/Christmas Day · Dec 25/.test(h)) fail("step 34: the closed days aren't dated chips");
if (!/the same as before \(nothing needed changing\)/.test(h) || !/renewed through Dec 25/.test(h) || !/their own special hours on Google: none/.test(h)) fail("step 34: the proof line is missing a part");
if (/Before \(Google\)|After \(read back\)|@/.test(h)) fail("step 34: the hours are written out again (before/after) or a client email shows");
const h2 = ctx.hours({ days: { ...DAYS, sat: wk("10:00", "14:00") } }, g34);
if (!/was Closed/.test(h2) || !/class="ob-zc-day chg"/.test(h2)) fail("step 34: a day that changed doesn't show what Google had (was …)");
if (!/if \(spec\.kind === "hours" && g && g\.state === "on_google" && !\(v && v\.by_appointment\)\) return `<div class="ob-in ob-in-facts">\$\{hoursDoneCardHtml\(v, g\)\}/.test(AJS)) fail("step 34's on-Google state doesn't use the week card");
if (!/o\.flowId === "m1\.gbp\.hours_attributes" && gp && gp\.state === "on_google" && !\(s\.task\?\.client_input\?\.by_appointment\) \? ""/.test(AJS)) fail("step 34 still prints 'Saved by the client (email)' above the card");
const D = "Rocket Growth Agency helps local businesses in Culver City, CA stand out online & attract more customers.";
const t33 = { approval: { by: "Chris Kapranos", at: "2026-09-14T23:20:34Z", approved_content: D }, published: { at: "2026-09-15T02:52:59Z", field: "profile.description", after: { description_chars: 592 } } };
if (!ctx.descOn(t33) || ctx.descOn({ ...t33, published: null }) || ctx.descOn({ ...t33, published: { ...t33.published, field: "categories" } })) fail("step 33: 'on Google' is decided wrong (it must be published with field profile.description)");
const d = ctx.desc(t33);
if (!d.includes(esc(D)) || !/<b>592<\/b> characters/.test(d) || !/592 \/ 750 characters/.test(d)) fail("step 33: the text isn't whole, or the 750 meter is missing");
if (!/Approved by Chris Oct 29 · published Oct 29/.test(d.replace(/Sep 1[45]/g, "Oct 29")) || !/On Google · read back/.test(d)) fail("step 33: who approved / when published is missing");
if (/ready to paste|push via API|each night/.test(d)) fail("step 33: says 'ready to paste' (it's live) or claims a nightly re-read that doesn't exist");
if ((d.match(/<button/g) || []).length !== 1 || !/>Draft a new one</.test(d)) fail("step 33: not ONE action (Draft a new one)");
if (!/: descriptionOnGoogle\(s\.task\) \? `<div class="ob-done-card">\$\{descriptionDoneCardHtml\(s\.task\)\}<\/div>`/.test(AJS)) fail("step 33's done row doesn't use the description card");

// ── admin: step 37 — every website-change step ─────────────────────────────────────────────────
if (!/const siteStep = !!\(globalThis\.rgaSiteChange && globalThis\.rgaSiteChange\.isSiteChangeStep\(o\.flowId\)\);\s*const runBtn = runnable && !siteStep/.test(AJS)) fail("step 37: a website step's row still has its own Draft button (the card has one)");
// (citations_52_55_v1, 11-9: steps 52–55 joined the same no-hand-tick line)
if (!/const doneBtn = zcWaits \|\| siteStep (\|\| o\.flowId === GL_STEP )?(\|\| globalThis\.rgaCitationProgress\?\.isStep\(o\.flowId\) )?(\|\| uniS\(\)\?\.noHandDone\?\.\(o\.flowId\) )?\? "" :/.test(AJS))   // steps_57_64_v1: 57/58/61/62/64 finish by their own rule, so they add one more clause fail("step 37: a website step's row still offers Mark step complete");

// ── admin: steps 29 · 30 · 31 — the result first ──────────────────────────────────────────────────
{ const p3 = ["ZC_FOLD_T", "ZC_LIST", "ZC_PLAIN", "zcPlainTitle", "zcFixAct", "zcCatPlan", "citationsCardHtml", "fixPlanCardHtml", "categoriesCardHtml"].map((n) => lift(AJS, n));
  if (p3.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step 29/30/31 card moved (${p3.findIndex((x) => !x)})`); process.exit(2); }
  const c3 = { escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg></svg>", adminGcardWhen: (iso) => (iso ? "Sep 14, 7:52 PM" : "") };
  vm.createContext(c3); c3.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */  vm.runInContext(p3.join("\n") + "\nthis.cit = citationsCardHtml; this.plan = fixPlanCardHtml; this.cat = categoriesCardHtml;", c3);
  const DIRS = ["Yelp", "Better Business Bureau", "Facebook", "Angi", "Thumbtack", "Nextdoor", "Apple Maps", "Bing Places"];
  const cit = { outcome_data: { citations_held: 0, fixes: [{ id: "cit.linked_from_site", fix: "Site links to its own directory profiles", why: "links to NONE of the 8 tracked directories. Linking your own profiles corroborates them." }],
    checks: [...DIRS.map((d, i) => ({ id: `cit.d${i}`, label: `${d} citation`, pass: null })), { id: "cit.linked_from_site", label: "Site links to its own directory profiles", pass: false }] } };
  const h29 = c3.cit(cit, '<div data-stale></div>');
  if (!/Directory listings: 1 fix found/.test(h29) || !/Their website links to none of their directory profiles/.test(h29) || !/Linking their own profiles tells Google \(and AI answers\) the listings are theirs\. Fixed in the fix plan\./.test(h29)) fail("step 29: the fix isn't said in the mockup's plain words");
  if (!/data-onboard-run="m1\.audit\.citations_nap">⚡ Run again/.test(h29) || !/Runs on RGA's server, no laptop needed\./.test(h29) || !/data-zc-goto="m1\.audit\.recommendations">Open the fix plan ›/.test(h29)) fail("step 29: the footer (Run again · server · Open the fix plan) is missing");
  if ((h29.match(/no link on file/g) || []).length !== 8 || /missing<\/i>|>Missing/.test(h29) || !/It is not proof the listing is missing/.test(h29)) fail("step 29: the 8 directories aren't 'no link on file' (never 'missing')");
  if (/Produced|fix\(es\)/.test(h29) || !/data-stale/.test(h29)) fail("step 29: bookkeeping wording, or the re-check line isn't inside the card");
  const plan = { outcome_data: { recommendations: [{ title: "No Facebook profile linked from the site", surface: "social" }, { title: "Site links to its own directory profiles", surface: "citations" }, { title: "No Yelp profile linked from the site", surface: "social" }],
    unknowns: [{ label: "Review count vs the vertical's top-3 median", why_unknown: "no publishable benchmark yet" }, ...DIRS.map((d) => ({ label: `${d} citation`, why_unknown: "no Yelp URL held — we link to it from neither the site nor schema" }))] } };
  const h30 = c3.plan(plan, "");
  if (!/The fix plan: 3 fixes, in order/.test(h30) || (h30.match(/class="ob-zc-place you"/g) || []).length !== 3) fail("step 30: the 3 fixes aren't listed in order");
  if (!/9 we can't measure yet<\/b> · review count vs the top 3 \(no benchmark yet\) · 8 directory listings \(no link on file\)/.test(h30)) fail("step 30: the 9 unknowns don't fold into one line naming each reason");
  if (!/No Facebook profile linked from their site/.test(h30) || !/Add the link on their website \(a website change → For your approval\)/.test(h30) || !/Their website links to none of their directory profiles/.test(h30)) fail("step 30: the fixes aren't in the mockup's plain words");
  if (!/data-onboard-run="m1\.audit\.recommendations">⚡ Run again/.test(h30)) fail("step 30: Run again isn't in the card footer");
  if (/Produced|recommendation\(s\)/.test(h30)) fail("step 30: bookkeeping wording is back");
  const cat = { outcome_data: { draft: 'primary: "Internet marketing service"\nadditional:\n  - "Marketing agency"\n  - "Marketing consultant"\n  - "Website designer"\n  - "Computer consultant"\n  - "Business management consultant"' },
    approval: { by: "Chris Kapranos", at: "2026-09-14T22:11:15Z" }, published: { at: "2026-09-15T02:53:12Z", after: { primary_category: "Internet marketing service", additional_categories: ["Marketing agency", "Website designer", "Marketing consultant"] } } };
  const h31 = c3.cat(cat);
  if (!/2 approved categories aren't on Google/.test(h31) || !/Computer consultant <i>not on Google<\/i>/.test(h31) || !/Business management consultant <i>not on Google<\/i>/.test(h31)) fail("step 31: the 2 approved-but-not-on-Google categories aren't shown");
  if (!/Additional · 3 of 5 on Google/.test(h31) || !/Primary · Internet marketing service/.test(h31) || !/the other 2 never went on/.test(h31)) fail("step 31: what's on Google isn't counted against the plan");
  if (/NOW SET TO|Draft copy/i.test(h31)) fail("step 31: 'Now set to … Draft copy' is back");
  if (!/data-zc-cat-add disabled>Add them on Google/.test(h31) || !/data-zc-cat-check>↻ Check Google now/.test(h31) || !/data-zc-cat-drop>Drop them from the plan instead/.test(h31) || !/Same 5 checks as the business facts step first \(a category is a core change\)\./.test(h31)) fail("step 31: Add them on Google / Check Google now / Drop them from the plan instead is missing");
  if (!/unchanged \(it was already right\)/.test(c3.cat({ ...cat, published: { ...cat.published, before: { primary_category: "Internet marketing service" } } }))) fail("step 31: the primary doesn't say it was already right");
  if (/Computer consultant/.test(c3.cat({ ...cat, categories_dropped: ["Computer consultant", "Business management consultant"] })) ) fail("step 31: a dropped category still shows");
  const okCat = c3.cat({ ...cat, published: { ...cat.published, after: { ...cat.published.after, additional_categories: ["Marketing agency", "Marketing consultant", "Website designer", "Computer consultant", "Business management consultant"] } } });
  if (!/Categories match the plan/.test(okCat) || /not on Google/.test(okCat)) fail("step 31: a matching profile isn't a green 'match' card");
}
if (!/if \(step && step\.obj && ZC_CARD_STEPS\.has\(step\.obj\.flowId\)/.test(AJS)) fail("steps 29/30/31: the out-of-date paragraph still shows in the row header");

// ── admin: step 32 — the client's approved services, on Google ──────────────────────────────────
{ const req = (await import("node:module")).createRequire(`${SITE}/netlify/functions/x.js`);
  let SP; try { SP = req(`${SITE}/netlify/functions/admin-gbp-services-push.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  const view = { on: ["g:job_type_id:seo", "f:their-own"], options: [{ key: "g:job_type_id:seo", label: "SEO" }, { key: "f:their-own", label: "Their Own Service" }, { key: "f:local-seo-audit", label: "Local SEO Audit" }, { key: "f:google-maps-local-seo", label: "Google Maps Local SEO" }, { key: "f:not-approved", label: "Not Approved" }] };
  const pl = SP.plan(["Local SEO Audit", "Google Maps Local SEO", "SEO"], view);
  if (!pl.keys.includes("g:job_type_id:seo") || !pl.keys.includes("f:their-own")) fail("step 32: the write would WIPE services already on Google (a serviceItems write replaces the whole list)");
  if (pl.keys.includes("f:not-approved")) fail("step 32: the write adds a service the client didn't approve");
  if (!pl.keys.includes("f:local-seo-audit") || !pl.keys.includes("f:google-maps-local-seo") || pl.adding !== 2) fail("step 32: the approved services aren't the ones added");
  if (!pl.rows.find((r) => r.name === "SEO").on || pl.rows.find((r) => r.name === "Local SEO Audit").on) fail("step 32: 'on Google' per service is decided wrong");
  const SRC = read("netlify/functions/admin-gbp-services-push.js");
  if (!/if \(dry\) return json\(200, \{ ok: true, rows: p\.rows/.test(SRC) || SRC.indexOf("if (dry) return") > SRC.indexOf("S.applyServices(")) fail("step 32: the dry read can write to Google");
  if (!/task\.approval && task\.approval\.decision === "approved" \? String\(task\.approval\.approved_content/.test(SRC)) fail("step 32: the services come from somewhere other than the client's approval");
  if (!/if \(!dry && rv && rv\.state === "lost"\) return json\(409/.test(SRC)) fail("step 32: the write doesn't wait while Google wants the business verified again");
  const p4 = ["zcSvcNames", "servicesCardHtml"].map((n) => lift(AJS, n));
  if (p4.some((x) => !x)) { console.error("⚠️  INDETERMINATE — step 32's card moved"); process.exit(2); }
  const c4 = { escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg></svg>", adminGcardWhen: () => "Sep 15, 10:15 AM" };
  vm.createContext(c4); c4.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */  vm.runInContext(p4.join("\n") + "\nthis.svc = servicesCardHtml;", c4);
  const h32 = c4.svc({ approval: { decision: "approved", at: "2026-09-15T17:15:46Z", approved_content: "services:\n  - displayName: Google Business Profile Optimization\n  - displayName: Local SEO Audit\n" } });
  if (!/Approved by the client Sep 15 · 2 services/.test(h32) || (h32.match(/data-zc-svc-name=/g) || []).length !== 2) fail("step 32: the approved list isn't shown whole");
  if (!/data-zc-svc-push disabled>Put them on Google/.test(h32) || !/Keeps every service already on Google/.test(h32) || !/Do it in Google Business Profile instead/.test(h32)) fail("step 32: Put them on Google (disabled until Google is read), the keep-their-own line or the escape hatch is missing");
  if (/NOW SET TO|Draft copy|Drafted services list/i.test(h32)) fail("step 32: the old draft bookkeeping is back");
}

{ const req2 = (await import("node:module")).createRequire(`${SITE}/netlify/functions/x.js`);
  let CG; try { CG = req2(`${SITE}/netlify/functions/admin-gbp-categories.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  const task = { outcome_data: { draft: '- "A"\n- "B"\n- "C"\n- "D"\n- "E"\n- "F"' }, categories_dropped: ["F"] };
  if (CG.planOf(task).includes("F") || CG.planOf(task).length !== 5) fail("step 31: a dropped category is still in the plan");
  const loc = { categories: { primaryCategory: { name: "categories/gcid:p", displayName: "P" }, additionalCategories: [{ name: "categories/gcid:a", displayName: "A" }] }, metadata: { hasVoiceOfMerchant: true } };
  const found = { b: { name: "categories/gcid:b", displayName: "B" }, c: { name: "categories/gcid:c", displayName: "C" }, d: { name: "categories/gcid:d", displayName: "D" }, e: { name: "categories/gcid:e", displayName: "E" } };
  const r = CG.checksFor(CG.planOf(task), loc, found, 0, Date.parse("2026-10-29T15:00:00Z"), { ok: true });
  if (r.body.categories.primaryCategory.name !== "categories/gcid:p" || !r.body.categories.additionalCategories.some((x) => x.name === "categories/gcid:a")) fail("step 31: the change would drop the primary or a category already on Google");
  if (r.add.length > 3) fail("step 31: more than 3 categories in one change");
  if (CG.checksFor(["B"], { ...loc, metadata: { hasVoiceOfMerchant: false } }, found, 0, Date.now(), { ok: true }).checks.find((k) => k.key === "verified").ok) fail("step 31: an unverified profile passes");
  if (CG.checksFor(["B"], loc, found, Date.now() - 86400000, Date.now(), { ok: true }).checks.find((k) => k.key === "week").ok) fail("step 31: a core change yesterday passes the one-change-a-week check");
  const SRC = read("netlify/functions/admin-gbp-categories.js");
  if (!/if \(action === "check"\) return json\(200, view\);/.test(SRC) || SRC.indexOf('if (action === "check") return') > SRC.indexOf("updateMask=categories`, { method")) fail("step 31: Check Google now can write");
  if (!/if \(passed !== r\.checks\.length\) return json\(409/.test(SRC) || !/updateMask=categories&validateOnly=true/.test(SRC)) fail("step 31: Add can skip the checks or the test run");
}

// ── admin: step 38 — photo progress at a glance ─────────────────────────────────────────────────
const ACSS5 = () => fs.readFileSync(`${process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code"}/admin/admin.css`, "utf8");
{ const p5 = ["ZC_FOLD_T", "ZC_CAM", "photosWaitState", "photosWaitCardHtml"].map((n) => lift(AJS, n));
  if (p5.some((x) => !x)) { console.error("⚠️  INDETERMINATE — step 38's card moved"); process.exit(2); }
  const NOW5 = new Date().toISOString();
  const photos5 = [{ id: "a", shot_n: 1, category: "logo", publish_state: "published", storage_path: "l", pushed_at: "2026-10-09T16:20:00Z", gbp_media_name: "media/profile" },
    { id: "b", shot_n: 2, category: "cover", publish_state: "published", storage_path: "c", pushed_at: NOW5, gbp_media_name: "upload-name" }];
  const SECOND_LOGO_RULE = await import(pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
  const c5 = { escapeHtml: esc, escapeAttribute: esc, PHOTO_REVIEW_STEP: "m1.gbp.photos", photoReviewCount: () => 0, PHOTO_KIND_LABEL: { cover: "Cover", logo: "Logo" }, photosOfClient: () => photos5, photoReviewHtml: () => ({ get rgaN() { return c5.rv; }, reviewN: c5.rv || 0, html: c5.rv ? "<div class=pr-card>BLOCK</div>" : "", existingHtml: "<div>OLDCOPY</div>" }), photoCountable: () => 1, photoListedNames: SECOND_LOGO_RULE.photoListedNames, photoLiveByLine: SECOND_LOGO_RULE.photoLiveByLine, photoOnlyVisible: SECOND_LOGO_RULE.photoOnlyVisible, photoShortfall: SECOND_LOGO_RULE.photoShortfall, photoMissingFromList: SECOND_LOGO_RULE.photoMissingFromList, state: { selectedClient: { identity_phone: "(424) 242-2040" } } };
  vm.createContext(c5); c5.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */  vm.runInContext(p5.join("\n") + "\nthis.ws = photosWaitState; this.ph = photosWaitCardHtml;", c5);
  const G = [["Logo", 1, "PROFILE"], ["Cover", 1, "COVER"], ["Exterior", 3, "EXTERIOR"], ["Interior", 3, "INTERIOR"], ["Team", 5, "TEAMS"], ["At work", 7, "AT_WORK"]];
  const items = G.flatMap(([g, n, k]) => Array.from({ length: n }, () => ({ group: g, google: k })));
  const task = { status: "pending", draft_shape: { items: items.map((x, i) => ({ ...x, n: i + 1 })), storefront: false }, detected: { n: 1, have: { PROFILE: 1 }, items: [] }, later: { reminded_at: "2026-10-23T21:40:18Z", followup_told_at: "2026-10-26T21:40:37Z" },
    photo_kept: { x: { at: "2026-10-16T01:58:45Z" } } };
  const h = c5.ph(task, { clientStepNo: 10, clientLabel: "Provide 20+ business photos" });
  // 🔒 admin_step38_review_v2 (approved Chris 10-31): real photos, a Sent line, one count, no Call them, no green
  if (!/2 of 20 photos added · 1 sent today/.test(h) || !/<b>1<\/b> \/ 20 on Google/.test(h) || !/Client's move · late/.test(h)) fail("step 38: the header (photos added · sent today · on Google) is wrong");
  if (!/Client portal step 10, Provide 20\+ business photos/.test(h)) fail("step 38: the client's step is missing");
  if (!/Logo <i>1\/1<\/i>/.test(h) || !/Cover <i>1\/1<\/i>/.test(h) || !/At work <i>0\/7<\/i>/.test(h) || (h.match(/class="ob-zc-slot( pic)?"/g) || []).length !== 20 || (h.match(/class="ob-zc-slot pic"/g) || []).length !== 2) fail("step 38: the shot list by group, or the 20 slots with real photos, are wrong");
  if (/ob-zc-chip ok|ob-zc-slot on/.test(h)) fail("step 38: a chip or tile goes green or blue-with-a-tick, not the real photo");
  if (!/data-review-thumb="c"><span>Sent · up to 48 hours/.test(h) || !/data-review-thumb="l"><span>Hidden by Google/.test(h)) fail("step 38: a tile doesn't say where its photo stands");
  if (!/Cover · sent to Google/.test(h) || !/Google took the upload/.test(h)) fail("step 38: no Sent confirmation after a send");
  if (!/Logo · saved, not showing/.test(h) || !/OLDCOPY/.test(h)) fail("step 38: the hidden logo or the old copy line is missing");
  if (!/data-step-nudge="m1\.gbp\.photos">Remind the client…/.test(h) || /Call them|href="tel:/.test(h) || !/data-task-status="skipped">Skip this step…/.test(h)) fail("step 38: the foot isn't Remind the client… + Skip");
  c5.rv = 1; const hr = c5.ph(task, { clientStepNo: 10 }); c5.rv = 0;
  if (!/Review 1 photo before it goes on Google/.test(hr) || !/>Your move</.test(hr) || !/BLOCK/.test(hr)) fail("step 38: a photo to review doesn't lead the card");
  if (!/\.pr-ph\.photo \{ background-size:contain;/.test(ACSS5())) fail("step 38: a square photo is cropped to a rectangle");
  if (!/function openPhotoZoom\(url\b/.test(AJS) || !/\.ob-zc-photos \[data-photo-zoom\]/.test(AJS) || !/class="pr-zoom-link" data-photo-zoom>View larger/.test(AJS)) fail("step 38: no way to see a photo larger");
  if (/>Done<|Run again|Mark step complete/.test(h)) fail("step 38: Done / Run again is on the card");
  c5.state.stepRuns = { "m1.gbp.photos": [["2026-10-08T00:06:48Z", "# 20-Photo"], ["2026-10-08T14:07:54Z", "# 20-Photo"], ["2026-10-09T23:04:53Z", "20-photo shot list"], ["2026-10-10T00:54:28Z", "20-photo shot list"]].map(([ran_at, summary_head]) => ({ ran_at, summary_head })) };
  const hh = c5.ph(task, null);
  if (!/4 runs since Oct 7 · shot list unchanged since Oct 9/.test(hh)) fail("step 38: the history line isn't 'N runs since … · shot list unchanged since …'");
  if (!/if \(el\.querySelector\("\.ob-zc-photos"\)\) return;/.test(AJS)) fail("step 38: the old photo section is still injected above the card");
  if (c5.ws({ ...task, detected: { have: { PROFILE: 1, COVER: 1, EXTERIOR: 3, INTERIOR: 3, TEAMS: 5, AT_WORK: 7 } } })) fail("step 38: a complete set still shows as waiting");
  if ((AJS.match(/if \(o\.flowId === PHOTO_REVIEW_STEP && photosWaitState\(s\.task\)\) return zcPhotosRowHtml\(/g) || []).length !== 2) fail("step 38: the queued/active row doesn't use the photos card");
}

// ── admin: steps 35 + 36 — the client's move ───────────────────────────────────────────────────
if (!/\(ZC_CLIENT_ASK\[o\.flowId\] && task\?\.client_input == null && st !== "skipped" \? "" : btn\("skipped", "Skip"\)\)/.test(AJS)) fail("steps 35/36: Skip is still a header button (the mockup puts it in the card as a quiet link)");
if (!/const ZC_NO_HAND_DONE = new Set\(\["m1\.gbp\.attributes", "m1\.gbp\.booking_link", "m1\.gbp\.photos"\]\)/.test(AJS) || !/const inner = \(rowHasDone \|\| ZC_NO_HAND_DONE\.has\(o\.flowId\) (\|\| uniS\(\)\?\.noHandDone\?\.\(o\.flowId\) )?\? "" : btn\("done", "Done"\)\)/.test(AJS)) fail("steps 35/36/38: RGA can still tick a client's Google step Done");
{ const p2 = ["ZC_CLIENT_ASK", "zcClientAskHtml", "bk36Card"].map((n) => lift(AJS, n));
  if (p2.some((x) => !x)) { console.error("⚠️  INDETERMINATE — the client's-move card moved"); process.exit(2); }
  const c2 = { escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg></svg>", CLIENT_GBP_STEPS: { "m1.gbp.attributes": "What's true of the business (Google details)", "m1.gbp.booking_link": "Booking link" } };
  vm.createContext(c2); c2.clientStepWhere = (o) => (o && o.clientStepNo != null ? `step ${o.clientStepNo}` : null); /* managed_admin_v1: admin.js names a step by the client mode; these cards are drawn for a client with none */  vm.runInContext(p2.join("\n") + "\nthis.ask = zcClientAskHtml;", c2);
  const a = c2.ask("m1.gbp.attributes", "c1", { clientStepNo: 8, clientLabel: "Confirm what's true of your business" }), b = c2.ask("m1.gbp.booking_link", "c1", { clientStepNo: 9, clientLabel: "Add your booking link" });
  if (!/Client portal step 8, "Confirm what&#39;s true of your business"|Client portal step 8, "Confirm what's true of your business"/.test(a)) fail("step 35: the client's step isn't named by its playbook number and title");
  if (!/data-task-set="m1\.gbp\.attributes" data-task-status="skipped">Skip this step…/.test(a)) fail("steps 35/36: Skip isn't the quiet link in the card");
  if (!/Client's move/.test(a) || !/Waiting for the client to tick what's true/.test(a) || !/On Google · read back/.test(a)) fail("step 35: the card doesn't say whose move, what they do, and the path");
  if (!/data-step-nudge="m1\.gbp\.attributes">Remind the client…/.test(a)) fail("step 35: Remind the client… isn't the confirm-first nudge");
  if (/Shows you the message first/.test(a + b)) fail("steps 35/36: the footer carries a note the approved mockups don't have");
  if (!/class="ob-zc-prog"/.test(a)) fail("step 35: the 1-2-3 path is gone");
  if (/data-task-status="done"|<button[^>]*>Done</.test(a + b)) fail("steps 35/36: a Done button is in the card");
  // 🔒 step 36 is now step36_booking_rga_does_it_v1 (approved Chris 10-29, SUPERSEDES admin_step36_booking_v1): its card is drawn once Google
  // and their website are read — every scenario is pinned by check-step-36-booking-every-scenario.mjs
  if (!/data-ob-bk36="c1"/.test(b) || !/Reading their Google profile and website…/.test(b)) fail("step 36: the card isn't drawn from what Google and their website say (step36_booking_rga_does_it_v1)");
}
// 🔴 Remind the client… on a QUEUED row (35 · 36 · 38 aren't the active step) did NOTHING: the nudge handler reads state.waitCtx, which only
// the active branch filled (found 10-29 by clicking it in a write-blocked browser). Every branch that can draw the card registers it, and
// the handler never returns silently.
if (!/const qActions = `\$\{qRerun\}\$\{clientOverride\(o, s\.task\)\}`;[\s\S]{0,400}?\(state\.waitCtx = state\.waitCtx \|\| \{\}\)\[o\.flowId\] = \{ o, task: s\.task \};/.test(AJS)) fail("Remind the client… on a queued row does nothing (the queued branch doesn't register the step)");
if (!/function zcPhotosRowHtml\(o, s, marker, badge, resultBlock, extra = \{\}\) \{\n  \(state\.waitCtx = state\.waitCtx \|\| \{\}\)\[o\.flowId\] = \{ o, task: s\.task \};/.test(AJS)) fail("step 38: the photos card doesn't register itself for Remind the client…");
if (/if \(!ctx \|\| !c\) return;/.test(AJS)) fail("the Remind handler returns silently when it can't find the step: the button looks like it did something");
if (!/function gNotSavedHtml\(flowId(?:, o)?\) \{\s*if \(ZC_CLIENT_ASK\[flowId\]\) \{/.test(AJS)) fail("steps 35/36 still draw the old 'Not saved yet' card");
if (!/if \(step && step\.obj && step\.obj\.flowId === "m1\.gbp\.business_description" && descriptionOnGoogle\(step\.task\)\) return "";/.test(AJS)) fail("step 33: the out-of-date paragraph still shows above a description that's on Google");

// ── client step 4's done card ──────────────────────────────────────────────────────────────────
// 🔒 since client_step04_business_facts_v1 (the card system, Chris 10-29) the done card is ALL FIVE facts as rows (the "+ 3 more" fold
// is gone), the service area as ONE chip row right after the name ("Service area · N places on Google"), and a covered place says
// where it is covered ("Mar Vista <em>in Los Angeles</em>") — the same three promises (area first, nothing hidden, covered explained)
// in the new design. The runtime check is check-client-card-system-batch1.mjs; this pins the source.
{ const at = PJS.indexOf("function factsCardV2("), fc = at < 0 ? "" : PJS.slice(at, PJS.indexOf("\n}\n", at));
  if (!fc) { console.error("⚠️  INDETERMINATE — factsCardV2 moved"); process.exit(2); }
  if (!/body: rows\[0\] \+ \(areaItems\.length \? csChips\(`Service area · \$\{areaItems\.length\} place\$\{areaItems\.length === 1 \? "" : "s"\} on Google`, areaItems\) : rows\[4\]\) \+ rows\[1\] \+ rows\[2\] \+ comeRow/.test(fc)) fail("client step 4: the done card doesn't put the service area (one chip row) right after the name, then phone · website · how customers reach you");
  if (/pm-k5-more|more · \$\{|pcFold\(/.test(fc) || !/head: `All \$\{rows\.length\} match Google`/.test(fc)) fail("client step 4: the done card hides facts behind a fold again (all five show — client_step04_business_facts_v1)");
  if (!/x\.covered_by \? \[`\$\{escapeHtml\(placeName\(x\.name\)\)\} <em>in \$\{escapeHtml\(placeName\(x\.covered_by\)\)\}<\/em>`, "dot"\]/.test(fc)) fail("client step 4: a covered place doesn't say where it's covered (\"Mar Vista in Los Angeles\"), or the names aren't escaped");
  if (!/row\("Service area", escapeHtml\(areaLine\), areaSt, escapeHtml\(coveredSub\)\)/.test(fc)) fail("client step 4: the covered sentence (no-chips fallback) isn't escaped"); }
if (!/const CARD_ASKS_CHANGE = new Set\(\["m1\.gbp\.business_facts"\]\)/.test(PJS) || !/data-ask-open aria-expanded="false"\$\{CARD_ASKS_CHANGE\.has\(stepId\) \? " hidden" : ""\}>Need a change\? ›/.test(PJS)) fail("client step 4: the lock line still shows a second 'Need a change? ›' button");

if (F.length) { console.error(`🔴 admin steps 29–38 / client step 4 drifted from the approved mockups:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ admin steps 33 · 34 · 37 + client step 4's done card match their approved mockups: the week of tiles, the live description whole, one Draft button, the service area first");
