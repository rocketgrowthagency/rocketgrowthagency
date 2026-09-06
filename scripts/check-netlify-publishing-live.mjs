#!/usr/bin/env node
/**
 * check-netlify-publishing-live.mjs — is what we PUSHED actually what's SERVED?
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-06: three commits were pushed, built, and reported `state: "ready"` — and none of them
 * were live. The site's production deploy was **LOCKED**, so every subsequent build was published
 * to nothing. It was found only because a content check (`grep` for the new symbol in the served
 * file) disagreed with the deploy state.
 *
 *   published deploy: 21:14:05   ← a manual `netlify deploy --prod`, which PINS production
 *   pushed since:     21:14:52, 21:42:42, 21:43:16   all "ready", none served
 *
 * 🔑 THE TRAP: a manual CLI deploy locks the site. From that moment git pushes still build, still
 * go green, and still say "ready" — they just stop reaching production. There is no error anywhere.
 * Every signal you would normally trust says the deploy worked.
 *
 * 🔴 This is the deploy-layer twin of the rule we already hold for videos: a status code proves
 * nothing, only CONTENT proves a thing is live ([[feedback-curl-status-is-useless-check-content-type]]).
 *
 * CHECKS
 *   1. 🔴 Production must NOT be locked — a lock silently disables git auto-publish.
 *   2. 🔴 The published deploy must be the newest ready deploy on main. Anything newer is stranded.
 *
 * Exit 0 = publishing is live.  1 = locked or stranded.  2 = could not tell (never 1 —
 * [[feedback-exit-code-semantics-for-gates]]).
 */
import { execFileSync } from "node:child_process";

const SITE = "38f275c7-a4a8-4531-9989-1fc1ccb78f9e";   // hilarious-baklava-87fbab / rocketgrowthagency.com

function api(method, data) {
  try {
    const out = execFileSync("netlify", ["api", method, "--data", JSON.stringify(data)], {
      // 🔑 maxBuffer matters: the deploy list runs past Node's 1MB default and execFileSync then
      // throws, which this function would report as "API unreachable" — an INDETERMINATE that hides
      // a real answer. A truncated read must never look like a missing one.
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000, maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch {
    return null;                                        // unauthenticated, offline, CLI absent
  }
}

console.log("── Netlify: is what we pushed actually served? ──");

const site = api("getSite", { site_id: SITE });
if (!site) {
  // 🔑 Indeterminate is NOT a pass and NOT a failure. In CI or on a machine where the Netlify CLI
  // is not logged in, we simply cannot tell — say so and exit 2.
  console.log("  ▫️  cannot reach the Netlify API (CLI absent or not logged in) — INDETERMINATE");
  console.log("     Run `netlify login` to enable this gate.");
  process.exit(2);
}

const pub = site.published_deploy || {};
let fail = 0;

// 1. The lock.
if (pub.locked) {
  fail++;
  console.log("  🔴 PRODUCTION IS LOCKED — git pushes are building but NOT publishing.");
  console.log(`     Production is pinned to ${String(pub.id).slice(0, 8)} from ${String(pub.published_at || pub.created_at).slice(0, 19)}.`);
  console.log("     Everything pushed since then is stranded. Unlock:");
  console.log(`       netlify api unlockDeploy --data '{"deploy_id":"${pub.id}"}'`);
  console.log("     Then publish the newest build with restoreSiteDeploy.");
} else {
  console.log(`  ✅ not locked — git pushes auto-publish`);
}

// 2. Stranded builds.
const deploys = api("listSiteDeploys", { site_id: SITE, per_page: 30 });
if (!Array.isArray(deploys)) {
  console.log("  ▫️  deploy list unavailable — cannot check for stranded builds");
  process.exit(fail ? 1 : 2);
}

const newest = deploys.find((d) => d.state === "ready" && d.branch === "main");
if (newest && pub.id && newest.id !== pub.id) {
  fail++;
  console.log(`  🔴 STRANDED: deploy ${String(newest.id).slice(0, 8)} (${String(newest.commit_ref || "manual").slice(0, 8)}) is ready but NOT published.`);
  console.log(`     Published is ${String(pub.id).slice(0, 8)}, from ${String(pub.published_at || pub.created_at).slice(0, 19)}.`);
  const stranded = deploys.filter((d) => d.state === "ready" && d.branch === "main" && new Date(d.created_at) > new Date(pub.published_at || pub.created_at));
  for (const d of stranded.slice(0, 8)) {
    console.log(`       ${String(d.created_at).slice(5, 19)}  ${String(d.commit_ref || "(manual)").slice(0, 8)}  ${String(d.title || "").slice(0, 56)}`);
  }
} else if (newest) {
  console.log(`  ✅ newest ready deploy IS the published one (${String(pub.commit_ref || "manual").slice(0, 8)})`);
}

console.log("");
if (fail) {
  console.error(`🔴 ${fail} publishing problem(s) — pushed code is not reaching production.`);
  console.error("   A 'ready' deploy is not a live one. See project_netlify_deploy_lock_stranded_pushes.");
  process.exit(1);
}
console.log("✅ production is publishing — what is pushed is what is served");
