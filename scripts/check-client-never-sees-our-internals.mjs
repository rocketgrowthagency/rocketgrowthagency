#!/usr/bin/env node
/**
 * check-client-never-sees-our-internals.mjs — nothing a client can load contains OUR vocabulary.
 *
 * ─── WHY (2026-09-15) ────────────────────────────────────────────────────────────────────────────
 * Chris opened his own portal as a client and screenshotted the "What we changed" panel showing him:
 *
 *     onboarding · gbp_manager_auto_add_error
 *       BEFORE  400: { "error": { "code": 400, "message": "Invalid JSON payload received.
 *                Unknown name \"adminEmail\" at 'admi…
 *     website · m1.web.homepage_meta              ← our STEP ID
 *     gbp · secondary_categories   BEFORE  []     ← raw JSON
 *     system code · ga4_property_id  properties/514075067
 *
 * Internal API error payloads, step ids, field names and raw JSON on a client's screen — hours after
 * the boundary forbidding exactly this was agreed and shipped.
 *
 * 🔑 IT WAS NOT THE ENDPOINT I HAD JUST FIXED. I verified `portal-deliverables` returned clean blocks
 * and reported the page clean. The ledger renders from `client-change-history`, which I never opened.
 * **A clean payload is not a clean page.** This gate therefore sweeps EVERY client-reachable endpoint,
 * not the one that broke. → feedback_fix_the_class_not_the_instance · feedback_poll_for_what_the_screen_renders
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 * For a real signed-in client session, every JSON value returned by every client endpoint is free of:
 *   step ids (m1.* / m2.*) · raw JSON or array literals · API error payloads · HTTP status objects
 *   · our internal field names (*_error, ga4_property_id, place_id …) · markdown/YAML authoring syntax
 *
 * Exit 0 = clean · 1 = a client can see our internals · 2 = could not tell (no creds / maintenance).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF_TEST = process.argv.includes("--self-test");

// ── What must never appear in a value a client can read ─────────────────────────────────────────
const FORBIDDEN = [
  [/\bm[12]\.[a-z_]+\.[a-z_]+/, "a step id from our checklist"],
  [/\[object Object\]/, "a coerced object — the real value was destroyed on write"],
  [/"(code|message|error|status)"\s*:/, "an API error payload"],
  [/^\s*\d{3}\s*:\s*[{[]/, "an HTTP status with a raw body"],
  [/^\s*[{[][\s\S]*[}\]]\s*$/, "raw JSON"],
  [/[a-z_]+_error\b/, "one of our internal error fields"],
  [/\bga4_property_id\b|\bproperties\/\d+/, "our GA4 plumbing"],
  [/\bplace_id\b|\bdata_id\b|\bgbp_[a-z_]+\b/, "our internal Google identifiers"],
  [/```|^\s*#{1,6}\s|\*\*[^*]+\*\*|\{\{[a-z_]+\}\}/, "markdown or template authoring syntax"],
  [/[A-Z]{2,}_[A-Z0-9]{2,}/, "an ALL_CAPS field name from our templates"],
];

/** Keys whose values are legitimately opaque to this check (ids we already send, timestamps). */
const SKIP_KEYS = new Set(["key", "id", "when", "occurred_at", "approved_at", "prepared_at", "found_at", "maps_url", "claim_url", "href"]);

function scan(node, pathStr = "", hits = []) {
  if (node === null || node === undefined) return hits;
  if (Array.isArray(node)) { node.forEach((v, i) => scan(v, `${pathStr}[${i}]`, hits)); return hits; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      scan(v, pathStr ? `${pathStr}.${k}` : k, hits);
    }
    return hits;
  }
  if (typeof node !== "string") return hits;
  for (const [re, why] of FORBIDDEN) {
    if (re.test(node)) { hits.push({ path: pathStr, why, sample: node.slice(0, 90) }); break; }
  }
  return hits;
}

if (SELF_TEST) {
  // 🔑 Every case below is a value that WAS on Chris's screen. A gate that has never been seen
  // failing is not known to work. → feedback_a_fix_without_a_gate_regresses
  const cases = [
    ["step id", { what: "website · m1.web.homepage_meta" }],
    ["error payload", { before: '400: {"error":{"code":400,"message":"Invalid JSON payload received"}}' }],
    ["raw JSON", { after: '{"primary_category":"Internet marketing service"}' }],
    ["coerced object", { before: "[object Object]" }],
    ["GA4 plumbing", { after: "properties/514075067" }],
    ["internal error field", { what: "onboarding · gbp_manager_auto_add_error" }],
    ["template token", { text: "Hi {{first_name}}, thanks!" }],
    ["ALL_CAPS field", { text: "META_TITLE: Local SEO" }],
  ];
  let pass = 0;
  for (const [name, payload] of cases) {
    const hit = scan(payload).length > 0;
    console.log(`  ${hit ? "✅" : "✗ "} catches: ${name}`);
    if (hit) pass++;
  }
  // And it must NOT fire on legitimate client copy.
  const clean = [
    { what: "The description on your Google listing", after: "Rocket Growth Agency is a local SEO company in Culver City." },
    { after: "Marketing agency, Marketing consultant" },
    { text: "Hi [customer's first name], thanks for choosing us!" },
    { after: "Local SEO & Google Maps Agency | Rocket Growth Agency" },
  ];
  let quiet = 0;
  for (const c of clean) {
    const h = scan(c);
    const ok = h.length === 0;
    console.log(`  ${ok ? "✅" : "✗ "} stays quiet on legitimate copy${ok ? "" : ` — fired on ${h[0].why}: ${h[0].sample}`}`);
    if (ok) quiet++;
  }
  const total = cases.length + clean.length;
  const got = pass + quiet;
  console.log(got === total
    ? `\n✅ self-test ${got}/${total} — catches every leak that shipped, and nothing that did not`
    : `\n✗ self-test ${got}/${total}`);
  process.exit(got === total ? 0 : 1);
}

// ── Live sweep against a real client session ────────────────────────────────────────────────────
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.SITE_URL || "https://www.rocketgrowthagency.com";
const EMAIL = process.env.PORTAL_TEST_EMAIL || "rocketgrowthagencyadmin@gmail.com";
if (!U || !K) { console.error("[internals] INDETERMINATE — Supabase credentials unavailable"); process.exit(2); }

let token, clientId;
try {
  const cr = await fetch(`${U}/rest/v1/clients?select=id&limit=1`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
  if (cr.status >= 500) { console.error(`[internals] INDETERMINATE — Supabase ${cr.status}`); process.exit(2); }
  clientId = (await cr.json())[0]?.id;
  const g = await fetch(`${U}/auth/v1/admin/generate_link`, {
    method: "POST", headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  const gj = await g.json();
  if (!gj.hashed_token) { console.error(`[internals] INDETERMINATE — could not mint a session: ${JSON.stringify(gj).slice(0, 120)}`); process.exit(2); }
  const v = await fetch(`${U}/auth/v1/verify?token=${gj.hashed_token}&type=magiclink`, { redirect: "manual", headers: { apikey: K } });
  token = new URLSearchParams((v.headers.get("location") || "").split("#")[1] || "").get("access_token");
} catch (e) {
  console.error(`[internals] INDETERMINATE — ${String(e.message).slice(0, 140)}`);
  process.exit(2);
}
if (!token || !clientId) { console.error("[internals] INDETERMINATE — no session or no client"); process.exit(2); }

// Every endpoint the client portal calls with the client's own token.
const ENDPOINTS = ["portal-deliverables", "client-change-history", "client-facts", "portal-data"];

console.log("── a client never sees our internals ──");
const findings = [];
let reached = 0;
for (const fn of ENDPOINTS) {
  let body;
  try {
    const r = await fetch(`${BASE}/.netlify/functions/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ client_id: clientId }),
    });
    if (r.status === 404) { console.log(`  –  ${fn} — not deployed, skipped`); continue; }
    body = await r.json();
    if (!r.ok) { console.log(`  ⚠️  ${fn} — HTTP ${r.status}, skipped`); continue; }
  } catch (e) { console.log(`  ⚠️  ${fn} — ${String(e.message).slice(0, 60)}`); continue; }
  reached++;
  const hits = scan(body);
  if (hits.length) { findings.push([fn, hits]); console.log(`  🔴 ${fn} — ${hits.length} leak(s)`); }
  else console.log(`  ✅ ${fn} — clean`);
}

// 🔴 Reaching nothing is NOT a pass. → feedback_indeterminate_is_not_a_finding
if (!reached) { console.error("[internals] INDETERMINATE — no client endpoint answered"); process.exit(2); }

if (findings.length) {
  console.error("\n✗ a client can see our internals:");
  for (const [fn, hits] of findings) {
    for (const h of hits.slice(0, 6)) console.error(`    ${fn} · ${h.path}\n        ${h.why}: ${h.sample}`);
  }
  console.error("\n  Every client-facing surface is an ALLOW-LIST: a surface they recognise, wording");
  console.error("  written for them, and a value that is not machine syntax. Unmapped means hidden.");
  process.exit(1);
}
console.log(`  ✅ ${reached} client endpoint(s) swept — no step ids, JSON, error payloads or field names`);
process.exit(0);
