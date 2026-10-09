#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-client-journey-tells-one-story.mjs
//
// 🔒 WHY (2026-10-08, approved client_journey_video_to_kickoff_v1): Chris asked what happens when a
// client has no Google accounts. The portal told them THREE different things — "we'll guide you
// through it on the kickoff call" (Business Profile), "RGA installs it in week 1" (GA4, GSC), and
// "RGA hops on a quick screen-share" linked to a CALENDLY page we never use — and the sales playbook
// promised "as soon as it's signed we kick off" / "I start … this week", skipping the invoice and the
// Google connect that now come first.
//
// THE RULE (one story, everywhere the client hears it):
//   · a missing Business Profile is the CLIENT's to set up, RIGHT AWAY at the connect step — it must
//     be theirs (Google verifies the owner) and 18 Month-1 steps wait on a verified profile; never
//     deferred to the kickoff call
//   · GA4 / Search Console: RGA sets them up in week 1; they never hold anything up
//   · no Calendly link (bookings are Google Calendar; "Stuck? Message us" opens the portal composer)
//   · "Setup Complete" is never shown while the client still owes their Business Profile
//   · the playbook's after-yes order: sign → invoice → connect Google → book the kickoff call
//
// The playbook is read from PARKED (PDF-only mode, the draft that prints the Desktop PDF) unless
// PLAYBOOK_FILE points elsewhere. When admin is updated, point this at admin/playbook.js.
//
// exit 0 = one story · 1 = a surface contradicts it · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const PB = process.env.PLAYBOOK_FILE || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/parked/playbook.js";
const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${f}`); process.exit(2); } };
const portal = read(`${SITE}/portal/portal.js`);
const playbook = read(PB);
const code = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const fails = []; const F = (m) => fails.push(m);

// ── the portal's Google setup step ─────────────────────────────────────────────────────────────
const P = code(portal);
const svcAt = P.indexOf("const PORTAL_GOOGLE_SERVICES = [");
const svcEnd = svcAt < 0 ? -1 : P.indexOf("\n];", svcAt);
if (svcAt < 0 || svcEnd < 0) { console.error("⚠️  INDETERMINATE — PORTAL_GOOGLE_SERVICES not found"); process.exit(2); }
const svcs = P.slice(svcAt, svcEnd);
const gbp = svcs.slice(svcs.indexOf('key: "gbp"'), svcs.indexOf('key: "ga4"'));
if (!/rgaPromise:/.test(gbp)) F("the Business Profile entry has no rgaPromise to check");
if (/kickoff/i.test(gbp)) F("the Business Profile setup is deferred to the kickoff call — it starts at the connect step");
if (!/set it up now/i.test(gbp)) F("the Business Profile promise does not tell the client to set it up now");
for (const k of ["ga4", "gsc"]) {
  const a = svcs.indexOf(`key: "${k}"`); const seg = svcs.slice(a, svcs.indexOf("detect:", a));
  if (!/RGA sets it up for you in week 1/.test(seg)) F(`${k}: the promise is not "RGA sets it up for you in week 1"`);
}
if (/calendly\.com/i.test(P)) F("a Calendly link is back in the portal — bookings run on Google Calendar; use \"Message us\"");
if (/RGA_BOOKING_URL/.test(P)) F("RGA_BOOKING_URL is back — the setup-call link pointed at a page nobody watches");
if (!/\} else if \(status === "no" && svc\.key === "gbp"\) \{/.test(P)) F("a client with no Business Profile gets the generic \"RGA sets it up\" branch");
if (!/svc\.key === "gbp" \? "No — I need to set it up" : "No — RGA sets it up"/.test(P)) F("the Business Profile \"No\" answer still says RGA sets it up");
if (!/const gbpOwed = [^\n]+inventory\.gbp\?\.status === "no";/.test(P)) F("the portal no longer knows when the client still owes their Business Profile");
const allAns = P.indexOf("if (allAnswered) {");
const owedAt = P.indexOf("if (gbpOwed && (oauthGranted || !hasYes)) {", allAns);
const completeAt = P.indexOf("Setup Complete", allAns);
if (allAns < 0 || owedAt < 0 || completeAt < 0 || owedAt > completeAt) F("\"Setup Complete\" can show while the client still owes their Business Profile");
// the CONNECTED path (Google linked, profile missing) — the real case for most new clients
if (!/if \(svc\.key === "gbp"\) return inventory\.gbp\?\.status === "yes" \? "connected" : "gap";/.test(P)) F("after connecting, a missing Business Profile can become \"RGA is handling this\"");
if (!/if \(svc\.key === "ga4" \|\| svc\.key === "gsc"\) return "rga";/.test(P)) F("after connecting, Analytics / Search Console become a gap the client must clear");
if (/Have RGA set it up/.test(P)) F("the connected path offers \"Have RGA set it up\" for the profile again");
if (/You asked us to set this up/.test(P)) F("an RGA row claims the client asked for it");
if (!/if \(phase === "awaiting_rga" && inventory\.gbp\?\.status !== "no"\) \{/.test(P)) F("the \"RGA is setting up your accounts\" card can hide the profile guide");
if (/creating any missing Google accounts/.test(P)) F("the waiting card says RGA creates the missing accounts (the profile is theirs)");
if (/hops on a quick screen-share/.test(P)) F("the old header promise (\"RGA hops on a quick screen-share\") is back");

// ── the sales playbook: what happens after yes ─────────────────────────────────────────────────
const B = code(playbook);
if (/we kick off/i.test(B)) F("the playbook promises \"as soon as it's signed we kick off\" — Google is connected first");
if (/(work|profile work) this week/i.test(B)) F("the playbook promises work \"this week\" — nothing starts before Google is connected");
const closeLines = B.match(/connect your Google accounts[^"”]*kickoff call/g) || [];
if (closeLines.length < 3) F(`the close line naming Google-then-kickoff appears ${closeLines.length}× (Call 2, What we sell, Close & log need it)`);
const steps = B.indexOf('["4. They connect Google"'); const kick = B.indexOf('["5. The kickoff call"');
if (steps < 0 || kick < 0 || steps > kick) F("What we sell §6 does not list connecting Google before the kickoff call");
if (!/You don't have a Google Business Profile yet\./.test(B)) F("Call 2 lost the no-Business-Profile line");

console.log(`  portal setup step + playbook (${PB.includes("/parked/") ? "parked draft" : PB}) checked`);
if (fails.length) { console.error("🔴 the client journey tells more than one story:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ one story: the client sets up their profile now, RGA sets up GA4/GSC in week 1, no Calendly, Google before the kickoff");
