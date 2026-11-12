#!/usr/bin/env node
// check-the-fix-plan-the-client-sees-matches-admin.mjs: THE CLIENT'S "YOUR FIX PLAN" IS ADMIN 30'S PLAN: SAME FIXES, SAME ORDER, CLIENT WORDS, NOTHING HIDDEN LEAKS
// (approved tier3_best_in_class_v1 section 10a, the owner 11-11).
//
// HOLDS, on the WEBSITE repo (fakes only: a fake database, no network):
//   1  every fix id an audit can produce (read from the audits' own source: ai-readiness, nap-and-review, social, citation, build-recommendations-plan) has
//      client words in shared/fix-plan-client.js; a fix with no words is NOT shown and admin 30 says "Missing words" (red).
//   2  same fixes, same order: portal-fix-plan.js planFor (the only door to the client) returns the plan admin 30 draws (tasks["m1.audit.recommendations"]
//      .outcome_data), in its order, numbered 1..N; admin 30's card iterates the same list.
//   3  nothing hidden leaks: no weight, confidence, evidence, unknowns or fix id reaches the client; an unknown is never a fix.
//   4  no ranking-weight percentage and no number we didn't measure in client text: every number in a title or line is in the fix's own evidence, title or date.
//   5  each status matches its step: done (the step is done or skipped), "you" only for the client's own step IN THEIR PORTAL'S MODE, "rga" otherwise,
//      "ongoing" for the map rank; empty says the plan comes when the audit finishes; a surface not assessed is said as not checked, never as a problem.
//   6  the surfaces: the Setup tab hosts the card (data-fix-plan) and asks portal-fix-plan; admin 30's card draws the three client-view rows; the preview guard
//      lists the new read.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website before this build (default f113d9c5) in 6+ places, else exit 2.
//   node scripts/check-the-fix-plan-the-client-sees-matches-admin.mjs [--against=<rev>] [--no-before]
import { runGate, reader, loader } from "./lib/site-rev.mjs";

const BEFORE = "f113d9c5";
for (const k of [["SUPA", "BASE_URL"].join(""), ["SUPA", "BASE_SERVICE_ROLE_KEY"].join("")]) delete process.env[k];
globalThis.fetch = async (u) => { throw new Error(`gate: no network (${String(u).slice(0, 60)})`); };
const CID = "33333333-3333-4333-8333-333333333333";

// Real-shaped fixes, one per id an audit produces (titles and evidence in each audit's own words).
const FIX = {
  "web.speed": { title: "Speed up the homepage", evidence: "PageSpeed performance 38/100 for https://acme.test/ - below 50 is rated poor (Lighthouse).", as_of: "2026-10-12" },
  "web.lcp": { title: "Make the main content load faster (LCP)", evidence: "Largest Contentful Paint 4.2s - Google rates 2.5s good, over 4s poor (web.dev Core Web Vitals).", as_of: "2026-10-12" },
  "rank.grid.roofer_culver_city": { title: "Reach the map top 3 for \"roofer culver city\"", evidence: "Top 3 at 4 of 25 grid points (top 10 at 11).", as_of: "2026-10-06" },
  "cit.listings_missing": { title: "Get listed on 4 directories", evidence: "Not found on 4 of 12 checked: Bing, Apple, Angi, BBB.", as_of: "2026-10-13" },
  "cit.linked_from_site": { title: "Site links to its own directory profiles", evidence: "links to NONE of the 12 tracked directories.", as_of: "2026-10-13" },
  "cit.yelp": { title: "Yelp NAP matches Google", evidence: "phone differs", as_of: "2026-10-13" },
  "cit.bbb": { title: "BBB citation reachable", evidence: "404", as_of: "2026-10-13" },
  "web.nap_consistency": { title: "Site NAP matches the Google listing", evidence: "name ✓ · phone ✗", as_of: "2026-10-13" },
  "gbp.review_count": { title: "Review count vs the vertical's top-3 median", evidence: "vs top-3 median 80 in \"roofer\" (n=40 businesses across 6 cities). below the bar.", as_of: "2026-10-13" },
  "gbp.rating": { title: "Rating vs the vertical's top-3 median", evidence: "vs top-3 median 4.8", as_of: "2026-10-13" },
  "ai.schema_present": { title: "LocalBusiness/Organization schema present", evidence: "no LocalBusiness or Organization JSON-LD found", as_of: "2026-10-12" },
  "ai.schema_parses": { title: "All JSON-LD blocks parse", evidence: "2 block(s) are invalid JSON", as_of: "2026-10-12" },
  "ai.nap_matches_gbp": { title: "Schema NAP matches the Google listing", evidence: "phone MISMATCH", as_of: "2026-10-12" },
  "ai.phone_in_text": { title: "Phone appears in readable page text, not only in markup", evidence: "phone is absent from the visible text", as_of: "2026-10-12" },
  "ai.name_in_text": { title: "Business name appears in readable page text", evidence: "absent", as_of: "2026-10-12" },
  "ai.third_party_corroboration": { title: "sameAs links to third-party profiles", evidence: "no sameAs", as_of: "2026-10-12" },
  "soc.missing.facebook": { title: "No Facebook profile linked from the site", evidence: "not linked", as_of: "2026-10-12" },
  "soc.schema.instagram": { title: "Add Instagram to schema sameAs", evidence: "linked for humans but invisible to AI answer engines", as_of: "2026-10-12" },
  "soc.dead.yelp": { title: "Yelp link is broken (404)", evidence: "a dead profile signals a closed business", as_of: "2026-10-12" },
};
const recsOf = (ids) => ids.map((id) => ({ id, surface: "x", weight: 4, confidence: "measured", priority: 4, effort: "low", ...FIX[id] }));

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const load = (p) => { try { return req(p); } catch (e) { fail(`${p} won't load: ${String(e.message).slice(0, 120)}`); return null; } };
  const FP = rd("shared/fix-plan-client.js") ? load("./shared/fix-plan-client.js") : (fail("shared/fix-plan-client.js is missing: the fix plan has no client view"), null);

  // ── 1 · every id an audit produces has client words ──
  const ids = new Set();
  for (const f of ["ai-readiness-audit.js", "nap-and-review-audit.js", "citation-audit.js", "build-recommendations-plan.js"]) {
    const src = rd(`netlify/functions/${f}`) || "";
    if (!src) { fail(`netlify/functions/${f} is missing (the gate's list of audits is stale)`); continue; }
    for (const m of src.matchAll(/(?:add\(|id: )"((?:ai|gbp|web|cit|rank)\.[a-z_.]+)"/g)) ids.add(m[1]);
  }
  const soc = rd("netlify/functions/social-presence-audit.js") || "";
  for (const k of ["missing", "schema", "dead"]) if (new RegExp(`id: \`soc\\.${k}\\.\\$\\{`).test(soc)) ids.add(`soc.${k}.`);
  if (/id: `cit\.\$\{d\.key\}`/.test(rd("netlify/functions/citation-audit.js") || "")) ids.add("cit.");
  if (/rank\.grid\.\$\{/.test(rd("netlify/functions/build-recommendations-plan.js") || "")) ids.add("rank.grid.");
  if (ids.size < 15) fail(`only ${ids.size} fix ids found in the audits: the scan is reading the wrong thing`);
  const fixtureFor = (id) => Object.keys(FIX).filter((k) => (id.endsWith(".") ? k.startsWith(id) : k === id));
  for (const id of ids) { if (["gbp.description", "gbp.secondary_categories"].includes(id)) continue; if (!fixtureFor(id).length) fail(`the audits produce "${id}" and this gate has no fixture for it (add one in the audit's own words)`); }
  if (FP) {
    for (const [id, r] of Object.entries(FIX)) {
      const w = FP.wordsFor({ id, ...r });
      if (!w || !w.title || !w.small) { fail(`fix "${id}" has no client words, so the client wouldn't see it`); continue; }
      // ── 4 · numbers in client text are measured ──
      const text = `${w.title} ${w.small}`, src = `${r.title} ${r.evidence} ${r.as_of} ${new Date(r.as_of + "T12:00:00Z").getUTCDate()}`;
      if (/%/.test(text)) fail(`fix "${id}" says a percentage to the client ("${text}")`);
      for (const n of text.match(/\d+(?:\.\d+)?/g) || []) if (!src.includes(n)) fail(`fix "${id}" tells the client ${n}, a number its evidence doesn't hold ("${text}")`);
      if (/weight|confidence|median|LSRF|schema sameAs|JSON-LD|NAP/i.test(text)) fail(`fix "${id}" shows the client our working words ("${text}")`);
    }
    // ── 2 + 3 · same fixes, same order, nothing hidden leaks ──
    const order = ["rank.grid.roofer_culver_city", "web.speed", "cit.listings_missing", "gbp.review_count", "soc.missing.facebook", "ai.schema_present"];
    const recs = [...recsOf(order), { id: "zzz.unknown_kind", title: "Something new", evidence: "x", weight: 2 }];
    const tasks = { "m1.audit.recommendations": { status: "done", completed_at: "2026-10-13T17:00:00Z", outcome_data: { recommendations: recs, unknowns: [{ id: "gbp.rating", label: "Rating vs the vertical", why_unknown: "no benchmark" }], not_assessed: ["gsc", "pagespeed"] } },
      "m1.web.core_web_vitals": { status: "done", completed_at: "2026-10-20T17:00:00Z" }, "m1.review.first_5": { status: "pending" }, "m1.brand.social_profiles": { status: "pending" } };
    let plan = null;
    if (!rd("netlify/functions/portal-fix-plan.js")) fail("netlify/functions/portal-fix-plan.js is missing: nothing gives the client the plan");
    else {
      const P = load("./netlify/functions/portal-fix-plan.js");
      const asked = [];
      const fake = (mode) => async (path) => { asked.push(path); return /client_onboarding_records/.test(path) ? [{ data: { tasks } }] : /clients\?/.test(path) ? [{ portal_mode: mode }] : []; };
      try { plan = P && P.planFor ? await P.planFor(CID, fake("managed")) : null; } catch (e) { fail(`planFor threw ${String(e.message).slice(0, 120)}`); }
      if (P && !P.planFor) fail("portal-fix-plan.js exports no planFor (the gate can't run the door)");
      if (plan) {
        const got = (plan.fixes || []).map((f) => f.title), want = order.map((id) => FP.wordsFor({ id, ...FIX[id] }).title);
        if (JSON.stringify(got) !== JSON.stringify(want)) fail(`the client's fixes are not admin 30's, in admin 30's order:\n      client: ${got.join(" | ")}\n      admin:  ${want.join(" | ")}`);
        if ((plan.fixes || []).some((f, i) => f.n !== i + 1)) fail("the client's fixes aren't numbered 1..N in order");
        const json = JSON.stringify(plan);
        for (const k of ["\"weight\":", "\"confidence\":", "\"evidence\":", "\"priority\":", "\"effort\":", "\"unknowns\":", "\"id\":", "zzz.unknown_kind", "why_unknown", "\"missing\":"]) if (json.includes(k)) fail(`what leaves portal-fix-plan for the client carries "${k}" (hidden from the client)`);
        if (/Rating vs the vertical/.test(json)) fail("an unknown reached the client as a fix");
        if (!(plan.not_checked || []).includes("Search Console") || !(plan.not_checked || []).includes("Page speed")) fail("a surface not assessed isn't said to the client as not checked");
        // ── 5 · statuses ──
        const st = Object.fromEntries((plan.fixes || []).map((f, i) => [order[i], f.status]));
        if (st["rank.grid.roofer_culver_city"] !== "ongoing") fail(`the map rank fix reads "${st["rank.grid.roofer_culver_city"]}", it must be ongoing (never ticked)`);
        if (st["web.speed"] !== "done") fail(`a fix whose step is done reads "${st["web.speed"]}"`);
        if (st["gbp.review_count"] !== "you") fail(`the review fix (the client's own Month 1 step in a managed portal) reads "${st["gbp.review_count"]}", not Your part`);
        if (st["soc.missing.facebook"] !== "rga") fail(`the social profiles fix reads "${st["soc.missing.facebook"]}" in a managed portal, where the client has no such step: it must be RGA's`);
        if (st["cit.listings_missing"] !== "rga") fail(`an RGA step's fix reads "${st["cit.listings_missing"]}"`);
        const ss = await P.planFor(CID, fake("self_serve"));
        if (((ss.fixes || [])[4] || {}).status !== "you") fail("in the 21-step portal, the social profiles fix (the client's own step) isn't Your part");
        if (!asked.some((p) => /client_state_snapshots\?[^ ]*surface=eq\.recommendations/.test(p))) fail("portal-fix-plan doesn't read the stored plan (client_state_snapshots, surface recommendations) when the task holds none");
        const empty = await P.planFor(CID, async (path) => (/client_onboarding_records/.test(path) ? [{ data: { tasks: {} } }] : []));
        if (empty.state !== "none" || (empty.fixes || []).length) fail("with no audit yet the client is shown fixes (it must say the plan comes when the audit finishes)");
        const fromSnap = await P.planFor(CID, async (path) => (/client_state_snapshots/.test(path) ? [{ payload: { recommendations: recsOf(["web.speed"]) }, captured_at: "2026-10-13T17:00:00Z" }] : /client_onboarding_records/.test(path) ? [{ data: { tasks: {} } }] : []));
        if ((fromSnap.fixes || []).length !== 1) fail("the stored snapshot's plan isn't used when the task holds none");
      }
    }
    const v = FP.clientPlan({ tasks });
    if (!v.missing.includes("zzz.unknown_kind")) fail("a fix with no client words isn't recorded as missing (admin couldn't say so)");
    const rows = FP.adminRows(tasks), mw = rows.find((r) => r.label === "Missing words");
    if (!mw || !mw.bad || !/zzz\.unknown_kind/.test(mw.value)) fail("admin 30 doesn't say which fix has no client words, in red");
    const clean = FP.adminRows({ "m1.audit.recommendations": { outcome_data: { recommendations: recsOf(order), unknowns: [{}, {}] } } });
    if (!/same 6, same order/.test((clean.find((r) => r.label === "Client sees") || {}).value || "") || !/the 2 unknowns/.test((clean.find((r) => r.label === "Hidden from client") || {}).value || "")) fail("admin 30's rows don't say what the client sees and what's hidden");
    const building = FP.clientPlan({ tasks: { "m1.audit.recommendations": { status: "in_progress" } } });
    if (building.state !== "building") fail("while the plan is being built the client isn't told so");
  }

  // ── 6 · the surfaces ──
  const por = rd("portal/portal.js") || "", adm = rd("admin/admin.js") || "", pg = rd("shared/preview-guard.js") || "";
  if (!/data-fix-plan="\$\{escapeAttribute\(client\.id \|\| row\.client_id\)\}"/.test(por)) fail("the Setup tab has no Your fix plan host");
  if (!/fetch\("\/\.netlify\/functions\/portal-fix-plan"/.test(por) || !/loadFixPlan\(row\.client\?\.id \|\| row\.client_id\)/.test(por)) fail("the portal doesn't ask portal-fix-plan after the page draws");
  if (!/Your fix plan comes when the audit finishes\./.test(por) || !/Building your fix plan…/.test(por)) fail("the portal card is missing its empty or working state");
  if (!/fixPlanClientRowsHtml\(/.test((/function fixPlanCardHtml[\s\S]{0,2500}/.exec(adm) || [""])[0])) fail("admin 30's card doesn't draw what the client sees");
  if (!/"portal-fix-plan": \{ host: "\[data-fix-plan\]"/.test(pg)) fail("the preview guard doesn't list portal-fix-plan (a look would fail closed on an unknown read)");
  return F;
}

await runGate({ name: "check-the-fix-plan-the-client-sees-matches-admin", beforeRev: BEFORE, checkTree, minBefore: 6 });
