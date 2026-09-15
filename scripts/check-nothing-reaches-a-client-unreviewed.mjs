#!/usr/bin/env node
/**
 * check-nothing-reaches-a-client-unreviewed.mjs — the internal gate is real, not decorative.
 *
 * ─── WHY (2026-09-15, decision #58 recommendation 3) ─────────────────────────────────────────────
 * Two gates with different jobs:
 *   · the INTERNAL gate is QUALITY  — is this right, is it readable, is it ours to send?
 *   · the CLIENT gate is CONSENT    — do they agree to publish it in their name?
 *
 * Every defect a client actually saw that day would have died at the first gate and none of them
 * were caught, because nothing was checking:
 *   · a raw ```yaml fence rendered into an approval card
 *   · "592 chars — ready to paste in GBP or push via API" where the description should have been
 *   · a 400 API error body in the change ledger
 *
 * Chris would not have passed any of them through. The gate existed nowhere, so they went straight
 * out. → project_client_admin_boundary
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. Every deliverable the live portal serves a client carries `internal_review.decision ===
 *      "approved"` in the database. No exceptions, including grandfathered rows.
 *   2. Nothing REJECTED is being served.
 *   3. The gate DEFAULTS CLOSED — an item with no review is not served. Proven against the live
 *      endpoint, not just the predicate.
 *   4. The predicate itself treats missing/unknown as NOT approved.
 *
 * 🔑 (3) is the one that matters. A gate that opens when the flag is absent is not a gate.
 *
 * Exit 0 = nothing unreviewed is reachable · 1 = a client can see unreviewed work · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SELF_TEST = process.argv.includes("--self-test");

const req = createRequire(path.join(SITE, "package.json"));
let isInternallyApproved;
try { ({ isInternallyApproved } = req("./netlify/functions/_deliverables.js")); }
catch (e) { console.error(`[gate] INDETERMINATE — could not load _deliverables: ${e.message}`); process.exit(2); }

// ── 4. the predicate defaults CLOSED ────────────────────────────────────────────────────────────
const PREDICATE_CASES = [
  [undefined, false, "no task at all"],
  [{}, false, "task with no review"],
  [{ internal_review: {} }, false, "review object with no decision"],
  [{ internal_review: { decision: "rejected" } }, false, "rejected"],
  [{ internal_review: { decision: "pending" } }, false, "an unknown decision value"],
  [{ internal_review: { decision: "approved" } }, true, "approved"],
];
let predicateOk = true;
for (const [task, want, label] of PREDICATE_CASES) {
  const got = isInternallyApproved(task);
  if (got !== want) { predicateOk = false; console.error(`  ✗ predicate: ${label} → ${got}, expected ${want}`); }
}

if (SELF_TEST) {
  for (const [task, want, label] of PREDICATE_CASES) {
    console.log(`  ${isInternallyApproved(task) === want ? "✅" : "✗ "} ${want ? "opens" : "stays shut"} for: ${label}`);
  }
  console.log(predicateOk ? "\n✅ self-test — the gate defaults closed" : "\n✗ self-test FAILED");
  process.exit(predicateOk ? 0 : 1);
}

if (!predicateOk) { console.error("\n✗ the predicate does not default closed — everything below is moot."); process.exit(1); }

// ── live: what is the portal actually serving? ──────────────────────────────────────────────────
for (const line of fs.readFileSync(path.resolve(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.SITE_URL || "https://www.rocketgrowthagency.com";
const EMAIL = process.env.PORTAL_TEST_EMAIL || "rocketgrowthagencyadmin@gmail.com";
if (!U || !K) { console.error("[gate] INDETERMINATE — Supabase credentials unavailable"); process.exit(2); }

const sb = (p, init = {}) => fetch(`${U}/rest/v1${p}`, { ...init, headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", ...(init.headers || {}) } });

let clientId, token, tasks;
try {
  const cr = await sb("/clients?select=id&limit=1");
  if (cr.status >= 500) { console.error(`[gate] INDETERMINATE — Supabase ${cr.status}`); process.exit(2); }
  clientId = (await cr.json())[0]?.id;
  if (!clientId) { console.error("[gate] INDETERMINATE — no client to test against"); process.exit(2); }

  const rec = await (await sb(`/client_onboarding_records?client_id=eq.${clientId}&select=data`)).json();
  tasks = rec?.[0]?.data?.tasks || {};

  const g = await fetch(`${U}/auth/v1/admin/generate_link`, {
    method: "POST", headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  const gj = await g.json();
  if (!gj.hashed_token) { console.error("[gate] INDETERMINATE — could not mint a client session"); process.exit(2); }
  const v = await fetch(`${U}/auth/v1/verify?token=${gj.hashed_token}&type=magiclink`, { redirect: "manual", headers: { apikey: K } });
  token = new URLSearchParams((v.headers.get("location") || "").split("#")[1] || "").get("access_token");
} catch (e) { console.error(`[gate] INDETERMINATE — ${String(e.message).slice(0, 140)}`); process.exit(2); }
if (!token) { console.error("[gate] INDETERMINATE — no client session"); process.exit(2); }

let served;
try {
  const r = await fetch(`${BASE}/.netlify/functions/portal-deliverables`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ client_id: clientId }),
  });
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
  served = d.deliverables || [];
} catch (e) { console.error(`[gate] INDETERMINATE — could not read the portal: ${String(e.message).slice(0, 140)}`); process.exit(2); }

console.log("── nothing reaches a client unreviewed ──");
console.log("  ✅ the predicate defaults closed (6 cases)");

const bad = [];
for (const d of served) {
  const t = tasks[d.key];
  const state = t?.internal_review?.decision || "(none)";
  if (state !== "approved") bad.push(`${d.key} is being SERVED to the client with internal_review = ${state}`);
}
const withheld = Object.keys(tasks).filter((k) => tasks[k]?.internal_review?.decision !== "approved" && !served.some((s) => s.key === k));

console.log(`  ${served.length} deliverable(s) served · ${withheld.length} step(s) held back by the gate`);
if (!served.length && !withheld.length) {
  console.error("[gate] INDETERMINATE — nothing served and nothing held; there is nothing to judge");
  process.exit(2);
}

if (bad.length) {
  console.error("\n✗ the internal gate is not holding:");
  for (const b of bad) console.error(`    ${b}`);
  console.error("\n  A deliverable reaches a client only after an RGA admin approves it in the admin");
  console.error("  review queue. Missing review means NOT reviewed, which is not consent to send.");
  process.exit(1);
}
console.log("  ✅ every served deliverable carries an explicit internal approval");
process.exit(0);
