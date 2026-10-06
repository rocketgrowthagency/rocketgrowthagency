#!/usr/bin/env node
/**
 * check-the-client-reads-their-own-timezone.mjs — the picker shows the CLIENT'S zone, everywhere.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-27: *"when a client logs in to select the date and time they want it must be in
 * their timezone period!"*
 *
 * The server derives a zone from the STATE in `primary_market` ("Culver City, CA" → CA →
 * America/Los_Angeles). Fine for an email sent unattended; wrong for a person at the picker:
 *   · nine states straddle two zones — Knoxville, the Florida panhandle, north Idaho and El Paso
 *     are an hour out BY CONSTRUCTION. The state map cannot ever get them right.
 *   · an owner living or travelling outside their business's state reads times that are not theirs.
 *
 * 🔴 AND FIXING ONE RENDERER JUST MOVES THE CONTRADICTION. Measured after switching the picker:
 * the next-step card read "1:00 PM" on a New York browser while the confirmed card six inches below
 * still read "10:00 AM". Five renderers had to move together, including the calendar's month seed —
 * the cells are keyed in the client's zone, so seeding from the server's yields a `selected` key
 * matching no cell: a grid that opens on the wrong month with nothing highlighted.
 *
 * 🔑 The old bug was never "the browser zone" — it was the CHIP naming one zone while the BUTTONS
 * rendered in another. One function answers for both, so they cannot disagree.
 *
 * Exit 0 = one zone, everywhere · 1 = a renderer drifted · 2 = cannot tell.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = process.env.SITE_DIR || `${__SITE}`;
const P = path.join(SITE, "portal/portal.js");
if (!fs.existsSync(P)) { console.log(`  ⚠️  ${P} missing — cannot judge.`); process.exit(2); }
const raw = fs.readFileSync(P, "utf8");
if (raw.length < 100000) { console.log(`  ⚠️  portal.js is only ${raw.length} bytes — cannot judge.`); process.exit(2); }
const src = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const fail = [];
console.log("── the client reads their own timezone ──");

// 1 ─ one resolver, and it asks the browser first
const i = src.indexOf("function clientReadingZone");
if (i === -1) {
  fail.push("clientReadingZone is gone — every kickoff time would fall back to whatever each caller passed, which is how the chip and the buttons came to name different zones");
} else {
  const body = src.slice(i, i + 700);
  if (!/resolvedOptions\(\)\.timeZone/.test(body)) {
    fail.push("clientReadingZone does not read the browser's zone — the address-derived zone cannot be right inside the nine states that straddle two zones");
  }
  if (!/return serverTz/.test(body)) {
    fail.push("clientReadingZone has no server fallback — a browser without the Intl API would render times in no zone at all");
  }
}

// 2 ─ 🔴 EVERY kickoff time routes through it. One missed renderer puts two times on one screen.
{
  const zones = [...src.matchAll(/timeZone:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
  const stray = zones.filter((z) => !/clientReadingZone|^zone\b|^zone0\b|keyOf|"UTC"/.test(z));
  if (stray.length) {
    fail.push(`${stray.length} timeZone expression(s) bypass clientReadingZone — ${stray.slice(0, 3).join(" · ")}. `
      + "Every kickoff time in the portal must come from the one resolver, or two of them will name different hours on the same page");
  }
}

// 3 ─ the chip must name the zone the buttons used, not the one the server sent
if (/pm-chip[^`]*ICON_GLOBE[^`]*String\(tz\)/.test(src)) {
  fail.push("the timezone chip renders String(tz) — the server's zone — while the buttons render the client's. "
    + "A label that contradicts the thing it labels is worse than no label, and that exact pair is the original bug");
}

// 4 ─ the booking must tell the server which zone they were reading
if (!/client_tz/.test(src)) {
  fail.push("the booking does not send client_tz — the confirmation email would be written from the address-derived guess and can name a different hour than the screen did");
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   Verified live: LA 10:00 AM · New York 1:00 PM · London 6:00 PM — one instant, read where they are.");
  process.exit(1);
}
console.log("  one resolver, browser-first with a server fallback · every kickoff time routed through it");
console.log("  the chip names the zone the buttons used · the booking reports the zone they read");
console.log("\n✅ the client picks in their own timezone.");
process.exit(0);
