#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-done-step-is-never-the-headline.mjs
//
// 🔒 WHY (2026-10-09, 6:21 PM): Chris — "why is book your kickoff call showing now on client portal? … it cannot show
// at any point a step already completed this is a glitch". The call had happened that morning (recap sent 9:11). The
// portal's first paint said YOUR NEXT STEP · Book your kickoff call, then corrected itself to the photos.
// Two causes, both held here:
//   1. the RECORD: sending the recap never marked tasks["m1.kickoff.call"] done — it stayed "pending" forever
//   2. the PORTAL: the headline read an empty booking map as "no booking" before the ledger had answered
// HOLDS:
//   1. send-kickoff-recap marks the stored kickoff step done when the recap goes
//   2. the portal has a positive "the ledger answered" flag, set on a successful answer
//   3. the headline may name the kickoff ONLY when the ledger answered with no booking, it didn't fail to load, and no
//      recap was sent — and it re-runs once the answer lands
// exit 0 = a done step never headlines · 1 = it can flash again · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const code = (r) => read(r).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const recap = code("netlify/functions/send-kickoff-recap.js"), portal = code("portal/portal.js");
const F = []; const fail = (m) => F.push(m);
if (!/if \(kt\.status !== "done"\) tasks\["m1\.kickoff\.call"\] = \{ \.\.\.kt, status: "done"/.test(recap) || !/kickoff_invite: invite, tasks \}/.test(recap)) fail("sending the recap no longer marks the stored kickoff step done");
if (!/const _kickoffAnswered = new Set\(\);/.test(portal) || !/_kickoffUnknown\.delete\(clientId\);\s*_kickoffAnswered\.add\(clientId\);/.test(portal)) fail("the portal can't tell \"the booking ledger hasn't answered\" from \"no booking\"");
if (!/const kickoffOwed = _kickoffAnswered\.has\(clientId\) && !_kickoffMine\.has\(clientId\) && !_kickoffUnknown\.has\(clientId\)\s*&& !\(kStamp && kStamp\.recap_sent_at\);/.test(portal)) fail("the headline can name the kickoff before the ledger answered, after a failed load, or after the recap");
if (!/&& !\(i\.step\?\.clientForm === "kickoff_booking" && !kickoffOwed\)\);/.test(portal)) fail("the kickoff step reaches the headline without passing kickoffOwed");
if (!/_kickoffAnswered\.add\(clientId\);\s*[\s\S]{0,200}refreshNextStepCards\(\)/.test(portal)) fail("the headline does not re-run when the booking answer lands");
if (!/kickoffStamp: onboarding\?\.data\?\.kickoff_invite/.test(portal)) fail("the headline can't see that a recap was sent");
if (F.length) { console.error("🔴 a done step can flash as the headline:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a done step is never the headline: the recap settles the stored step, and the kickoff headlines only after the ledger answers with no booking");
