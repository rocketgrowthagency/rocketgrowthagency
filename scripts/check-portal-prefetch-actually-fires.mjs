#!/usr/bin/env node
/**
 * check-portal-prefetch-actually-fires.mjs — the boot prefetch must not silently become a no-op.
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
 * Chris, 2026-09-26: *"takes a very long time … we need to work on speed of portal."* The portal
 * booted in six serial waves: twelve Supabase reads at +556ms, then the Netlify functions only once
 * the slowest of them finished, and `kickoff-availability` — the single slowest call — LAST.
 *
 * The fix starts the two slowest independent calls as soon as the client id exists. It shipped,
 * deployed, parsed clean — and did NOTHING, because I called `portalToken()` inside it. That reads
 * `_portalSupabase`, which is not assigned until `renderPortalDashboard` runs, ~600 lines and one
 * `Promise.all` later. At boot it was null, `portalToken()` threw, and my own `.catch(() => null)`
 * swallowed the reason. Three profiling runs showing the identical staircase is the only reason I
 * caught it instead of reporting a speed-up that never happened.
 *
 * 🔑 A silent catch around an optimisation hides the optimisation not working. This gate pins the
 * three things that make it real, because "it is in the bundle" proved nothing.
 * → feedback_correct_is_not_the_same_as_happening · feedback_a_swallowed_send_failure_is_an_outage
 *
 * Exit 0 = the prefetch can actually fire · 1 = it is a no-op again · 2 = cannot tell.
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
console.log("── the portal's boot prefetch actually fires ──");

// 1 ─ it exists and is started at boot, BEFORE the Supabase fan-out it is meant to overlap.
const iCall = src.indexOf("prefetchPortalData(");
const iAll = src.indexOf("await Promise.all([");
if (iCall === -1) {
  fail.push("nothing calls prefetchPortalData — the slowest two calls go back to queueing behind twelve Supabase reads");
} else if (iAll !== -1 && iCall > iAll) {
  fail.push("prefetchPortalData is started AFTER the Promise.all it exists to overlap — that is the serial staircase it was written to remove");
}

// 2 ─ 🔴 THE TOKEN IS PASSED IN. Calling portalToken() inside the prefetch is the exact bug: at boot
//     `_portalSupabase` is still null, so it throws and the whole prefetch quietly does nothing.
{
  const i = src.indexOf("function prefetchPortalData");
  if (i === -1) {
    fail.push("prefetchPortalData is gone");
  } else {
    const body = src.slice(i, i + 1800);
    if (/await\s+portalToken\(\)/.test(body)) {
      fail.push("prefetchPortalData calls portalToken() — `_portalSupabase` is not assigned until renderPortalDashboard runs, "
        + "so at boot that throws and the prefetch becomes a silent no-op. The token must be passed in");
    }
    if (!/tokenPromise/.test(body)) {
      fail.push("prefetchPortalData does not take a token — it has no way to authenticate at boot");
    }
    // 3 ─ a miss must be LOGGED, never swallowed. This is what hid the failure for a whole deploy.
    const swallow = (body.match(/\.catch\(\(\)\s*=>\s*(null|\{\}|undefined)\)/g) || []).length;
    if (swallow) {
      fail.push(`prefetchPortalData swallows ${swallow} error(s) with a bare .catch(() => null) — that is precisely what hid this being broken; log the reason`);
    }
  }
}

// 4 ─ the consumers must actually read it, or the head start is thrown away.
for (const [fn, key] of [["loadKickoffSlots", "kickoff"], ["_loadPortalThread", "thread"]]) {
  const i = src.indexOf(`function ${fn}`);
  if (i === -1) { fail.push(`${fn} is gone — it is one of the two consumers of the prefetch`); continue; }
  if (!new RegExp(`takePrefetch\\([^)]*"${key}"`).test(src.slice(i, i + 3000))) {
    fail.push(`${fn} does not consume the "${key}" prefetch — the head start is fetched and then thrown away, which costs a request and saves nothing`);
  }
}

if (fail.length) {
  console.log(`\n🔴 ${fail.length} problem(s):`);
  for (const f of fail) console.log(`    ${f}`);
  console.log("\n   Measured live: with the prefetch firing, kickoff-availability starts at ~+450ms instead");
  console.log("   of ~+1880ms, and the Setup tab paints in ~120ms instead of ~650ms.");
  process.exit(1);
}
console.log("  started before the Supabase fan-out · token passed in · misses logged · both consumers read it");
console.log("\n✅ the boot prefetch can actually fire.");
process.exit(0);
