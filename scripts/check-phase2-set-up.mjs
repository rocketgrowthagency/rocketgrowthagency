#!/usr/bin/env node
// check-phase2-set-up.mjs — 2026-10-20, approved phase2_set_up_v1 (final review R4). RUNS the hours code on fakes and pins, for
// client steps 7–12:
//   7 hours    — a second opening per day goes to Google and reads back (split hours); "by appointment only" CLEARS the hours
//                (never seven closed days); open 24 hours needs the client's tick; the copy names Google's rules
//  10 photos   — done = 20 photos ON GOOGLE (never 20 uploads, never "Google unreachable, so count uploads"); no invented stat
//  11 calls    — "Set one up for me" stays with RGA until a test call rang through (admin-call-test, RGA only, read back);
//                the card + admin row show what it needs and its own week on Google
//  12 forms    — done when RGA's test reached the client's inbox; admin row 28 (verify GA4) comes first and the step waits on
//                it; "Google connected, no Analytics" says RGA is setting it up
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const read = (p) => { try { return fs.readFileSync(p.startsWith("/") ? p : `${SITE}/${p}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), PB = JSON.parse(read("data/playbooks/playbooks.json"));
const INP = read("netlify/functions/portal-step-input.js"), PROF = read("netlify/functions/_gbp-profile.js"), CHO = read("netlify/functions/portal-step-choice.js");
const CT = read("netlify/functions/admin-call-test.js"), FT = read("netlify/functions/portal-form-test.js"), RECHK = read("netlify/functions/portal-step-recheck.js");
const M1 = read(`${SCR}/flow/playbooks/month1.mjs`);
const F = [], fail = (m) => F.push(m);
const A = Object.fromEntries([...PB.month1, ...PB.month2plus].map((s) => [s.id, s]));

// ── 7 · hours, RUN
let G; try { G = req(`${SITE}/netlify/functions/_gbp-profile.js`); } catch (e) { console.error(`⚠️  _gbp-profile won't load: ${e.message}`); process.exit(2); }
const days = { mon: { open: "08:00", close: "12:00", open2: "13:00", close2: "17:00" }, tue: { open: "09:00", close: "17:00" }, wed: { closed: true }, thu: { closed: true }, fri: { closed: true }, sat: { closed: true }, sun: { closed: true } };
const periods = G.periodsFromDays(days);
if (periods.filter((p) => p.openDay === "MONDAY").length !== 2) fail("step 7: a split day doesn't write two openings to Google");
const back = G.hoursFromGoogle({ periods: [...periods].reverse() }).days;
if (back.mon.open !== "08:00" || back.mon.close !== "12:00" || back.mon.open2 !== "13:00" || back.mon.close2 !== "17:00" || back.tue.open2) fail("step 7: a split day doesn't read back as the same two openings (in time order)");
const three = G.hoursFromGoogle({ periods: [...periods, { openDay: "MONDAY", openTime: { hours: 18 }, closeDay: "MONDAY", closeTime: { hours: 20 } }] });
if (!three.split.includes("mon")) fail("step 7: a day with three openings isn't flagged as more than the form holds");
if (!/const body = periods\.length \? \{ regularHours: \{ periods \} \} : \{\}, mask = \["regularHours"\];/.test(PROF)) fail("step 7: by appointment only doesn't CLEAR the hours on Google");
if (!/const byAppt = v\.by_appointment === true;/.test(INP) || !/if \(byAppt \|\| day\.closed\)/.test(INP) || !/if \(byAppt\) out\.by_appointment = true;/.test(INP)) fail("step 7: the save doesn't take \"by appointment only\" as a real answer");
if (!/if \(any24 && v\.confirm24 !== true\) return \{ error:/.test(INP)) fail("step 7: a day open 24 hours saves without the client confirming someone answers");
if (!/open2 < close \|\| close2 <= open2/.test(INP)) fail("step 7: a second opening that overlaps the first is accepted");
const hi = A["m1.gbp.hours_attributes"]?.clientInstructions || "";
if (!/GOOGLE'S RULES/.test(hi) || !/24 hours/.test(hi) || !/appointment/i.test(hi) || !/temporarily closed/.test(hi)) fail("step 7: the copy doesn't name Google's hours rules");
if (!/data-in-appt/.test(P) || !/data-in-second-add/.test(P) || !/data-in-24/.test(P) || !/title: appt \? "By appointment only" : "Your hours"/.test(P)) fail("step 7: the portal form / done card lost appointment-only, the second opening or the 24-hour tick");
if (!/v\.by_appointment \? `<span class="ob-in-chip">By appointment only/.test(ADM)) fail("step 7: admin doesn't show appointment-only / split hours");
// ── 10 · photos
if (!/const photosOnGoogle = \(photos \|\| \[\]\)\.filter\(\(p\) => p && photoOnGoogle\(p\)\)\.length;\s*const hasPhotosThreshold = photosOnGoogle >= 20;/.test(P)) fail("step 10: the portal counts uploads, not photos on Google");
if (/photos received from you \(we could not reach Google/.test(RECHK) || !/verdict: n >= threshold \? "indeterminate" : "not_done"/.test(RECHK)) fail("step 10: an unreachable Google confirms the step from uploads");
if (/materially more calls/.test(JSON.stringify(A["m1.gbp.photos"] || {}))) fail("step 10: the photo copy makes an unsourced claim again");
if (!/don't change your rank/.test(A["m1.gbp.photos"]?.clientWhy || "")) fail("step 10: the photo copy no longer says photos win customers, not rank");
// ── 11 · call tracking
if (!/stepId === "m1\.tracking\.call_setup" && choice\.key === "rga_sets_up" && !\(prev\.tracking && prev\.tracking\.live_at\)\s*\? \{ status: "in_progress", completed_at: null \}/.test(CHO)) fail("step 11: \"Set one up for me\" reads Done the moment it's chosen");
if (!/requireWorkspaceForClient\(event, clientId\)/.test(CT) || !/tracking\.live_at !== now\) return json\(500/.test(CT) || !/t\.client_choice !== "rga_sets_up"\) return json\(409/.test(CT)) fail("step 11: the test-call record isn't RGA-only, read back, or tied to the client's choice");
if (!/data-ob-ct-live/.test(ADM) || !/number on Google not before/.test(ADM)) fail("step 11: admin row 26 lost the test-call form or the one-change-a-week date");
if (!/rcRow\("Needs", ready/.test(P) || !/rcRow\("Done when", \["rga", "Test call"\]/.test(P)) fail("step 11: the client's card doesn't say what it needs and what makes it done");
// ── 12 · form tracking
if (!/if \(body\.arrived === true\) Object\.assign\(task, \{ status: "done"/.test(FT)) fail("step 12: the test reaching the inbox doesn't finish the step");
if (!(A["m1.tracking.form_setup"]?.dependsOn || []).includes("m1.web.tracking")) fail("step 12: form tracking doesn't wait on admin row 28 (verify GA4)");
const ids = PB.month1.map((s) => s.id);
if (ids.indexOf("m1.web.tracking") > ids.indexOf("m1.tracking.form_setup")) fail("step 12: admin row 28 (verify GA4) still comes after form tracking in playbooks.json");
if (M1.indexOf('id: "m1.web.tracking"') > M1.indexOf('id: "m1.tracking.form_setup"') || !/id: "m1\.tracking\.form_setup"[^\n]*\n\s*type: "[a-z]+", dependsOn: \[[^\]]*"m1\.web\.tracking"/.test(M1)) fail("step 12: the canonical SOP disagrees (order or dependsOn)");
if (!/const gaByRga = ownFirstId === "m1\.access\.analytics" && !!oauth\?\.gbp_account_id && !oauth\?\.ga4_property_id;/.test(P) || !/RGA is setting up your Google Analytics/.test(P)) fail("step 12: \"no Analytics yet\" still asks the client to connect Google");
if (F.length) { console.error("🔴 Phase 2 (steps 7–12) regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Phase 2 holds: split hours round-trip, appointment-only clears, 24 h needs a tick, Google's rules in the copy · photos done on Google only · call tracking done by a test call (RGA-only, read back) with its needs + own week · form tracking done by the test, after row 28, and RGA named when Analytics doesn't exist");
