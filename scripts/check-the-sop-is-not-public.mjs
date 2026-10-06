#!/usr/bin/env node
/**
 * check-the-sop-is-not-public.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 OUR ENTIRE OPERATING METHOD WAS ONE UNAUTHENTICATED GET.
 *
 * `/data/playbooks/playbooks.json` served 200 to anybody: 87KB, 89 steps, 67 admin-only, 80 of them
 * carrying the internal `instructions` describing exactly how we do the work. The client portal and
 * the admin screen both fetched it as a static public file — so `clientBucket`, the single field
 * that is supposed to decide what a client sees, was enforced only in the renderers while the
 * source sat open on the internet.
 *
 * Found during the dormant-code/gap audit of 2026-09-16, having survived a security pass in July
 * and another on 2026-09-11 — both of which looked at ENDPOINTS, and this was a FILE.
 *
 * This gate asserts, statically and then against production:
 *   1. the portal fetches the projection, never the SOP
 *   2. admin fetches the authenticated endpoint, never the SOP, and sends credentials
 *   3. that endpoint is gated
 *   4. the raw path is 404'd at the edge, forcibly
 *   5. the projection is in step with the source (same steps, same wording)
 *   6. the projection carries no internal field
 *   7. 🔴 LIVE: the raw URL really is unreachable, and the projection really is reachable
 *
 * → project_client_admin_boundary · feedback_a_guard_must_reach_the_thing_it_guards
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
const BASE = process.env.SITE_BASE || "https://www.rocketgrowthagency.com";
const RAW = "/data/playbooks/playbooks.json";

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };
const ok = (m) => console.log(`  ✅ ${m}`);

console.log("── the SOP is not public ──");

// ── 1-2. nobody in the browser fetches the raw file ────────────────────────────────────────────
const portal = read("portal/portal.js");
const admin = read("admin/admin.js");

for (const [name, src] of [["portal/portal.js", portal], ["admin/admin.js", admin]]) {
  // Ignore comments — this path is named in the explanations of why it was closed.
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (code.includes(RAW)) bad(`${name} still fetches ${RAW} — that is the public SOP`);
}
if (!/client-steps\.json/.test(portal)) bad("the portal does not read the client-safe projection");
const adminFetches = [...admin.matchAll(/fetch\(\s*["'`]\/\.netlify\/functions\/admin-playbook["'`][^)]*\)/g)];
if (!adminFetches.length) bad("admin does not fetch the authenticated playbook endpoint");
for (const m of adminFetches) {
  if (!/authHeaders\(\)/.test(m[0])) bad("an admin playbook fetch sends no credentials — it would just 401");
}

// ── 3. the endpoint is gated ───────────────────────────────────────────────────────────────────
let fn;
try { fn = read("netlify/functions/admin-playbook.js"); }
catch { bad("netlify/functions/admin-playbook.js is missing — admin has nowhere authenticated to read from"); }
if (fn) {
  if (!/require\(["']\.\/_auth["']\)/.test(fn)) bad("admin-playbook does not import the auth helper");
  if (!/requireWorkspaceUser\(event\)/.test(fn)) bad("admin-playbook does not call requireWorkspaceUser — it is public again");
  if (!/if \(gate\.error\) return gate\.error/.test(fn)) bad("admin-playbook computes a gate and ignores its result");
  if (!/no-store/.test(fn)) bad("admin-playbook is cacheable — a CDN copy is the same leak one hop out");
}

// ── 4. the edge blocks the raw path ────────────────────────────────────────────────────────────
const toml = read("netlify.toml");
const block = toml.split("[[redirects]]").find((b) => b.includes(RAW));
if (!block) bad(`netlify.toml has no redirect blocking ${RAW}`);
else {
  if (!/status\s*=\s*404/.test(block)) bad("the SOP redirect does not return 404");
  if (!/force\s*=\s*true/.test(block)) bad("the SOP redirect is not forced — a real file at that path still wins");
}

// ── 5-6. the projection is in step, and clean ──────────────────────────────────────────────────
let pb, cs;
try {
  pb = JSON.parse(read("data/playbooks/playbooks.json"));
  cs = JSON.parse(read("data/playbooks/client-steps.json"));
} catch (e) { bad(`could not read both files: ${e.message}`); }

if (pb && cs) {
  const visible = (s) => !s.ongoing && s.clientLabel && (s.clientBucket === "supply" || s.clientBucket === "act");
  const srcIds = [...(pb.month1 || []), ...(pb.month2plus || [])].filter(visible).map((s) => s.id);
  const outIds = [...(cs.month1 || []), ...(cs.month2plus || [])].map((s) => s.id);
  if (srcIds.join("|") !== outIds.join("|")) {
    bad(`the projection is STALE — source has ${srcIds.length} client steps, it has ${outIds.length}. Run scripts/build-client-steps.mjs`);
  }
  // 🔑 Same ids is not the same content: a re-worded label would leave the client on old copy.
  const byId = Object.fromEntries([...(pb.month1 || []), ...(pb.month2plus || [])].map((s) => [s.id, s]));
  const drift = outIds.filter((id) => {
    const a = byId[id], b = [...(cs.month1 || []), ...(cs.month2plus || [])].find((x) => x.id === id);
    return a.clientLabel !== b.clientLabel || (a.clientHint || "") !== (b.clientHint || "")
      || (a.clientDone || "") !== (b.clientDone || "");
  });
  if (drift.length) bad(`the projection's wording has drifted from the source on: ${drift.slice(0, 3).join(", ")}`);

  const text = JSON.stringify(cs);
  for (const f of ["hasRunner", "dependsOn", "actionLabel", '"sop"', '"tools"', '"instructions"']) {
    if (text.includes(f)) bad(`the projection leaks the internal field ${f}`);
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴🔴 EVERY FIELD THE RENDERER READS MUST SURVIVE THE PROJECTION. 2026-09-16: five input
  // surfaces shipped, every gate was green, and NOT ONE rendered — the portal reads
  // `client-steps.json`, and `clientInput` was not on the allow-list, so it was stripped.
  //
  // An allow-list is the right call for a boundary, but it fails SILENTLY in the other
  // direction: the renderer asks for a field that is simply not there and draws nothing. This
  // closes that half. → feedback_a_guard_must_reach_the_thing_it_guards
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const portalSrc = read("portal/portal.js");
    const rs = portalSrc.indexOf("const rowHtml = ({");
    const re = portalSrc.indexOf("// 🔴 SETUP POINTS, IT DOES NOT DUPLICATE", rs);
    const ih = portalSrc.indexOf("function inputHtml(");
    const scope = (rs >= 0 && re > rs ? portalSrc.slice(rs, re) : "")
      + (ih >= 0 ? portalSrc.slice(ih, ih + 4000) : "");
    const wanted = new Set([...scope.matchAll(/step\.(client[A-Za-z]+)\b/g)].map((m) => m[1]));
    const projected = new Set([...(cs.month1 || []), ...(cs.month2plus || [])].flatMap(Object.keys));
    const declared = new Set([...(pb.month1 || []), ...(pb.month2plus || [])].flatMap(Object.keys));
    for (const f of wanted) {
      if (!declared.has(f)) continue;           // the renderer reads it, no step sets it yet — fine
      if (!projected.has(f)) {
        bad(`the renderer reads step.${f} but the projection drops it — the client sees nothing. Add it to SAFE_FIELDS in build-client-steps.mjs`);
      }
    }
  }

  const admOnly = [...(pb.month1 || []), ...(pb.month2plus || [])].filter((s) => !visible(s));
  const leakedAdmin = admOnly.filter((s) => text.includes(`"${s.id}"`));
  if (leakedAdmin.length) bad(`${leakedAdmin.length} admin-only step(s) are in the client projection, e.g. ${leakedAdmin[0].id}`);
}

if (!fail) ok("the portal reads the projection, admin reads the gated endpoint, the raw path is force-404'd");

// ── 7. and it is actually true in production ───────────────────────────────────────────────────
// 🔴 The five checks above read files. A redirect that was never deployed passes every one of them.
// → feedback_correct_is_not_the_same_as_happening
if (process.env.SKIP_LIVE === "1") {
  console.log("  ▫️  live check skipped (SKIP_LIVE=1) — static assertions only");
} else {
  try {
    const raw = await fetch(`${BASE}${RAW}`, { redirect: "follow" });
    const body = await raw.text();
    const looksLikeSop = body.includes('"hasRunner"') || body.includes('"instructions"');
    if (raw.status === 200 && looksLikeSop) bad(`🔴 LIVE: ${BASE}${RAW} still serves the SOP (${body.length} bytes)`);
    else ok(`live: the raw SOP path returns ${raw.status} and no SOP content`);

    // 🔴 A 200 PROVES NOTHING. A missing path here returns the site's HTML fallback with status
    // 200, so `.json()` throws and the whole gate reports INDETERMINATE instead of FAIL — which is
    // how a real outage reads as "could not check". Parse defensively and judge the CONTENT.
    // → feedback_curl_status_is_useless_check_content_type
    const proj = await fetch(`${BASE}/data/playbooks/client-steps.json`);
    const ptext = await proj.text();
    let pj = null;
    try { pj = JSON.parse(ptext); } catch { /* HTML fallback, or nothing there */ }
    const n = pj ? (pj.month1 || []).length + (pj.month2plus || []).length : 0;
    if (!n) bad(`🔴 LIVE: the client projection is unreachable (${proj.status}, ${proj.headers.get("content-type")}) — every client's checklist would be empty`);
    else ok(`live: the projection serves ${n} client steps`);

    const ep = await fetch(`${BASE}/.netlify/functions/admin-playbook`);
    if (ep.status === 200) bad("🔴 LIVE: admin-playbook answered an UNAUTHENTICATED request");
    else ok(`live: admin-playbook refuses an unauthenticated request (${ep.status})`);
  } catch (e) {
    console.error(`  [sop] INDETERMINATE — could not reach ${BASE}: ${e.message}`);
    process.exit(2);
  }
}

console.log(fail ? `\n🔴 ${fail} problem(s) — the SOP is reachable by someone who should not have it.`
                 : "\n✅ the SOP is staff-only; clients get the projection.");
process.exit(fail ? 1 : 0);
