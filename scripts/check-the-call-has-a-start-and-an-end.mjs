#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-call-has-a-start-and-an-end.mjs
//
// 🔒 WHY (2026-10-09, approved kickoff_call_script_v1): the first real test call. Chris: "while the call is on
// there is still the join the call button. should this not change to end the call? and also if you end the
// call on google meets should it end it here … still showing in the call timer after i have left". The clock
// ran from the booked time, nothing ended the call, the yeses lived in one browser's localStorage, and the
// client's portal kept "Change the time / Can't make it" under "Happening now".
// (check-the-kickoff-call-fits-its-slot runs the clock cases; this pins the wiring around it.)
// HOLDS:
//   1. kickoff-call-live writes call_started_at on start and call_outcome "held" + call_ended_at on end
//   2. the console's Join and start / End the call buttons call it; the call state saves to it, not localStorage
//   3. the client portal: held outranks the clock (Done the moment RGA ends it), and once the call has started
//      there is no Change the time / Can't make it — at render AND when the ticker crosses the start
// exit 0 = holds · 1 = broken · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const fn = strip(read("netlify/functions/kickoff-call-live.js")), admin = strip(read("admin/admin.js")), portal = strip(read("portal/portal.js"));
const F = []; const fail = (m) => F.push(m);

// 1
if (!/if \(!invite\.call_started_at\) \{ next\.call_started_at = at;/.test(fn)) fail("start no longer records call_started_at (first press wins)");
if (!/next\.call_outcome = "held";/.test(fn) || !/next\.call_ended_at = invite\.call_ended_at \|\| at;/.test(fn)) fail("End the call no longer records the call as held with its end time");
if (!/await requireWorkspaceForClient\(event, clientId\)/.test(fn)) fail("kickoff-call-live is not RGA-only");
// 2
const save = (admin.match(/function kickoffCallSave\(\) \{[\s\S]*?\n\}/) || [""])[0];
if (!save) fail("kickoffCallSave is gone");
else {
  if (/localStorage/.test(save)) fail("the call state saves to localStorage again — another screen sees none of it");
  if (!/kickoff-call-live/.test(save) || !/action: "save"/.test(save)) fail("the call state no longer saves to the record");
}
if (!/data-kc-start="/.test(admin) || !/kickoffCallLive\("start"/.test(admin)) fail("the console has no Join and start the call");
if (!/data-kc-end="/.test(admin) || !/kickoffCallLive\("end"/.test(admin)) fail("the console has no End the call");
if (!/else if \(ki\.call_started_at\) name = "live";/.test(admin) || !/else if \(outcome === "held"( \|\| \([^)]+\))?\) name = "held";/.test(admin)) fail("kickoffState no longer reads a started call as live and an ended one as held");
// 3
if (!/if \(confirmed && \(ended \|\| held\)\) \{/.test(portal)) fail("the portal waits for the clock even after RGA ended the call");
if (!/\$\{confirmed && Number\.isFinite\(startMs\) && Date\.now\(\) >= startMs \? ""/.test(portal)) fail("the portal offers Change the time / Can't make it on a call that has started");
if (!/if \(cd\.tone === "live"\) el\.parentElement\?\.querySelector\(":scope > \.pm-kickoff-amend"\)\?\.remove\(\);/.test(portal)) fail("an open portal tab keeps Change the time / Can't make it after the start");
if (!/heldRecorded: j\.heldRecorded === true/.test(portal)) fail("the portal's lede cannot know RGA ended the call");

if (F.length) { console.error("🔴 the call's start and end are broken:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the call has a start and an end: recorded on the client, driven by the console, honoured by the portal");
