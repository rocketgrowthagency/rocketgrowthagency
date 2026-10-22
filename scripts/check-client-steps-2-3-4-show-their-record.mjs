#!/usr/bin/env node
// check-client-steps-2-3-4-show-their-record.mjs — 2026-10-20, approved step2_website_access_v2 · step3_call_tracking_v2 ·
// step4_form_tracking_v2 (research: website research_notes/Client steps 2 3 4 5/). Chris: "where did these steps go, why are
// they blank". A done step drew NOTHING; step 2 asked for a PASSWORD link; step 3 promised "Calls from Google" and an
// RGA-owned number; step 4 counted form STARTS as submissions. RUNS the real builders on fakes, plus the wiring.
//   exit 0 holds · 1 a step regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), A = read("admin/admin.js"), IN = read("netlify/functions/portal-step-input.js"), RC = read("netlify/functions/portal-step-recheck.js");
const FT = read("netlify/functions/portal-form-test.js"), AC = read("netlify/functions/admin-access-confirm.js"), CH = read("netlify/functions/portal-step-choice.js"), PB = read("data/playbooks/playbooks.json");

// ── step 2: an invite, never a password; the builder is detected (2 signs stated · 1 asked · 0 picked) ──
let S; try { S = req("./_site-platform.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const d2 = S.detectFromHtml('<meta name="generator" content="WordPress 6.6"><link href="/wp-content/themes/x.css">');
const d1 = S.detectFromHtml('<img src="https://static.wixstatic.com/media/x.jpg">');
const d0 = S.detectFromHtml("<html><body>Hello</body></html>");
if (d2.platform !== "wordpress" || d2.confidence !== "stated") fail(`two WordPress signs aren't stated (${JSON.stringify(d2)})`);
if (d1.platform !== "wix" || d1.confidence !== "ask") fail(`one Wix sign isn't asked as "right?" (${JSON.stringify(d1)})`);
if (d0.platform !== null || d0.confidence !== "none") fail("a page with no builder signs is guessed");
if (S.detectFromHtml('<img src="https://img1.wsimg.com/x.png">').confidence === "stated") fail("one GoDaddy sign is stated as fact");
{ const r = await S.detectPlatform("https://www.facebook.com/joesplumbing", async () => { throw new Error("no fetch"); }); if (r.status !== "no_site") fail("a Facebook page counts as a website"); }
{ const r = await S.detectPlatform("https://joes-plumbing.com", async () => { throw new Error("dns"); }); if (r.status !== "couldnt_check" || r.platform) fail("a site we couldn't reach is guessed instead of \"couldn't check\""); }
for (const k of Object.keys(S.PLATFORMS)) { const p = S.PLATFORMS[k]; if (!p.name || !p.role || !(p.steps || []).length) fail(`builder ${k} has no name / role / steps`); const { rga, ...pub } = p; /* rga = RGA's own note, never sent to the client (step3_website_access_v3) */ if (JSON.stringify(pub).replace(/never (take|need) your password|Never your password|we never take your password/gi, "").match(/password|passcode|2fa|code you get/i)) fail(`builder ${k}'s steps ask for a password or code`); }
if (/onetimesecret|"kind": "url",\s*"placeholder": "https:\/\/onetimesecret/.test(PB)) fail("step 2 still asks for a one-time password link");
if (!/if \(spec\.kind === "access"\) \{[\s\S]{0,1400}\["invite", "designer", "none", "request", "workaround"\]\.includes\(o\.via\)/.test(IN)) fail("step 2's answer isn't the access kind (invite · designer · none · request · workaround — step3_website_access_v3)");
if (!/const waitsOnRga = stepId === "m1\.access\.website" && parsed\.value && typeof parsed\.value === "object" && \["invite", "designer", "request", "workaround"\]\.includes\(parsed\.value\.via\);/.test(IN) || !/const settled = !waitsOnRga && /.test(IN)) fail("an invite finishes step 2 before RGA has signed in");
if (!/const gate = await requireWorkspaceForClient\(event, clientId\);/.test(AC) || !/access: \{ role, account, confirmed_at: now, confirmed_by:/.test(AC) || !/status: "done"/.test(AC)) fail("RGA's Confirm access doesn't record the grant and finish the step (or isn't RGA-only)");
// ── step 3: honest words, the client's own number ──
if (/Calls from Google|under our account/.test(PB)) fail("step 3 says \"Calls from Google\" or puts the number under RGA's account");
// 🔒 call_tracking_upgrade_v1 (10-22): one allow-list of the two provider groups
if (!/client_choice_provider: CT_PROVIDER_LIST\.includes\(String\(body\.provider/.test(CH) || !/const CT_PROVIDER_LIST = \["CallRail", "CallTrackingMetrics", "WhatConverts", "ServiceTitan", "Quo \(OpenPhone\)", "RingCentral", "Housecall Pro", "Other"\];/.test(CH)) fail("the call-tracking provider isn't allow-listed");
// ── step 4: only the installed lead event; key event; counts ──
if (/form_start\|submit/.test(RC) || !/const LEAD_EVENTS = \["generate_lead", "contact_submit"\];/.test(RC) || !/inListFilter: \{ values: installed \}/.test(RC)) fail("step 4 counts form starts or any \"submit\"-like event as submissions");
if (!/analyticsadmin\.googleapis\.com\/v1beta\/\$\{t\.ga4_property_id\}\/keyEvents/.test(RC) || !/n30: probe\.n30, n90: probe\.n90, last_at: probe\.last_at, gbp30: probe\.gbp30/.test(RC)) fail("step 4 doesn't check the key event, or doesn't keep its counts");
if (!/const gate = action === "log" \? await requireWorkspaceForClient\(event, clientId\) : await requirePortalOwner\(event, clientId\);/.test(FT)) fail("the form test isn't RGA-logs / client-answers");

// ── the portal cards, RUN ──
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
const line = (n) => ((P.match(new RegExp(`^const ${n} = [^\\n]*`, "m")) || [""])[0]).replace(/^const /, "var ");
const STEP_LOCK = createRequire(import.meta.url)(`${SITE}/shared/step-lock.js`);   // the real lock rule (step_lock_after_rga_confirms_v1)
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10), fmtDateTimeDot: (x) => String(x || "").slice(0, 16),
  stepLockOf: (id, t) => STEP_LOCK.stepLock(id, t, {}), googleCardHtml: (o) => `<card state="${o.state}">${[o.small, o.side, o.title, o.body, o.why ? `${o.why.label} ${o.why.text}` : "", o.act].filter(Boolean).join(" ¦ ")}</card>`, Date, JSON, Number, Set, Array, String });
// a whole top-level `const X = …;` even across lines (step 11's question table, 10-22) — bracket depth, ignoring quotes
const block = (n) => { const at = P.search(new RegExp(`\\nconst ${n} = `)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); }
  let d = 0, q = null; for (let i = P.indexOf("=", at) + 1; i < P.length; i++) { const c = P[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === ";" && d === 0) return P.slice(at + 1, i + 1).replace(/^const /, "var "); }
  return ""; };
for (const n of ["RECORD_CARD", "rcRow", "_rcEditing", "CT_ATTRIB", "CT_COUNT", "CT_PROVIDERS", "CT_QS", "CT_YN", "ctWhy", "_ctAnswers", "_accNames", "_accRoles", "ACC_TAG"]) vm.runInContext(block(n), ctx);
for (const n of ["accPart", "accDidLine", "accStep1Name"]) vm.runInContext(lift(n), ctx);
for (const n of ["ctRecommend", "doneNoRecordHtml"]) vm.runInContext(lift(n), ctx);
for (const n of ["recordCardHtml", "accessCardHtml", "callTrackingCardHtml", "formTrackingCardHtml"]) vm.runInContext(lift(n), ctx);
vm.runInContext("var RC_LOCK='', RC_WEB='', RC_PHONE='', RC_FORM='';", ctx);
const run = (id, ts) => { ctx.__ts = ts; return vm.runInContext(`recordCardHtml({ id: "${id}" }, __ts, "c1")`, ctx); };
const ok2 = run("m1.access.website", { status: "done", client_input: { via: "invite", platform: "wordpress", platform_source: "detected", at: "2026-10-20T21:14:00Z" }, access: { role: "Administrator", account: "hello@rocketgrowthagency.com", confirmed_at: "2026-10-20T23:02:00Z", confirmed_by: "chris" } });
if (!/state="ok"/.test(ok2) || !/RGA can edit your website/.test(ok2) || !/Role Administrator · account hello@rocketgrowthagency\.com/.test(ok2) || !/hello@rocketgrowthagency\.com/.test(ok2) || !/wordpress/.test(ok2)) fail(`step 2's done card doesn't show the grant (${ok2.slice(0, 160)})`);
if (/password/i.test(ok2.replace(/never send us your password/i, ""))) fail("step 2's done card mentions a password");
const wait2 = run("m1.access.website", { status: "in_progress", client_input: { via: "invite", platform: "wix", at: "2026-10-20T21:14:00Z" } });
if (!/state="rga"/.test(wait2) || !/Checking we can sign in/.test(wait2)) fail("an invite sent isn't \"RGA is checking we can sign in\"");
const old2 = run("m1.access.website", { status: "done", client_input: "https://onetimesecret.com/secret/abc", client_input_at: "2026-09-21T16:20:00Z" });
if (!/Switch to an invite \(safer\)/.test(old2) || /onetimesecret/.test(old2)) fail("an old password link isn't offered the switch to an invite, or its link is shown");
const ask2 = run("m1.access.website", {});
if (!/data-acc-host/.test(ask2) || !/Takes 2–5 minutes · you never share a password/.test(ask2) || !/My web designer manages my site/.test(ask2) || !/I don't have a website/.test(ask2) || /type="password"|onetimesecret/i.test(ask2)) fail("step 2's ask isn't the invite card (designer / no-website paths), or has a password field");
const skip3 = run("m1.tracking.call_setup", { status: "done", client_choice: "skip", client_choice_at: "2026-10-20T12:00:00Z" });
if (!/Call tracking: skipped for now/.test(skip3) || !/call-button clicks/.test(skip3) || !/raise it again/.test(skip3)) fail(`step 3 skipped doesn't say what it means and when it comes back (${skip3.slice(0, 160)})`);
const live3 = run("m1.tracking.call_setup", { status: "done", client_choice: "rga_sets_up", client_choice_at: "2026-10-20T12:00:00Z", tracking: { number: "(213) 555-0188", rings: "(424) 242-2040", live_at: "2026-10-23T12:00:00Z", provider: "CallRail" } });
if (!/Your tracking number/.test(live3) || !/in your name/.test(live3) || !/Directories/.test(live3) || !/additional phone/.test(live3)) fail("a live tracking number doesn't show where it is and that the client owns it");
const ask3 = run("m1.tracking.call_setup", {});
if (!/Do you want call tracking\?/.test(ask3) || !/RGA recommends/.test(ask3) || !/data-ct-save/.test(ask3) || !/yours to keep if you ever leave/.test(ask3) || /account in your name/.test(ask3) || !/data-ct-q="calls"/.test(ask3)) fail("step 3's ask isn't the one card with the three questions, RGA's recommendation and Save (and the true ownership line)");
const ok4 = run("m1.tracking.form_setup", { status: "done", detected: { verdict: "confirmed", at: "2026-10-22T03:30:00Z", n30: 3, n90: 3, last_at: "2026-10-19", gbp30: 1, events: ["generate_lead"], key_event: true }, test: { at: "2026-10-21T10:00:00Z", inbox: true, inbox_at: "2026-10-21T11:00:00Z" } });
if (!/Form tracking on your website/.test(ok4) || !/3 submissions · 1 from your Google Business Profile/.test(ok4) || !/Counted as a lead/.test(ok4) || !/finished submissions only/.test(ok4) || !/Arrived in your inbox/.test(ok4)) fail(`step 4's done card doesn't show what's tracked (${ok4.slice(0, 200)})`);
const test4 = run("m1.tracking.form_setup", { test: { at: "2026-10-21T10:00:00Z", inbox: null } });
if (!/Did our test arrive in your inbox\?/.test(test4) || !/data-ft-inbox="yes"/.test(test4)) fail("the inbox test question isn't asked");
const quiet4 = run("m1.tracking.form_setup", { status: "done", detected: { verdict: "indeterminate", at: "2026-10-22T03:30:00Z", n30: 0, n90: 0 } });
if (!/No submissions yet/.test(quiet4) || /broken/i.test(quiet4)) fail("zero submissions reads as broken instead of \"nothing yet\"");
// wiring: the card replaces the empty done body, the old pieces are off for these steps
if (!/: RECORD_CARD\.has\(step\.id\) && !month2Only \? \(ownWait \? "" : recordCardHtml\(step, taskState, clientId, onboarding\?\.data\?\.tasks\)\)/.test(P)) fail("the record card isn't drawn in the row (a done step would be blank again)");
if (!/accessAdminHtml\(t\)/.test(A) || !/data-ob-acc-confirm/.test(A) || !/data-ob-ft-test/.test(A)) fail("admin can't confirm access or log a form test");
if (F.length) { console.error("🔴 client steps 2 · 3 · 4 regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ steps 2 · 3 · 4 show their record: an invite (never a password, builder detected, done when RGA signs in) · an honest call-tracking decision (the client's own number) · real form leads only (key event, counts, inbox test) — the card in every state, done included");
