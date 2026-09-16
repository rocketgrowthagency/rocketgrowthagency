#!/usr/bin/env node
/**
 * check-only-the-client-can-approve.mjs — an approval is the CLIENT's signature, never ours.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * `portal-deliverables` now lets the workspace that owns a client READ that client's portal, so
 * Chris can see exactly what they see. Before this, one page held two disagreeing authorities:
 * `client-facts` accepted admin-or-owner and `portal-deliverables` accepted owner-only, so the
 * facts card rendered and the approvals tab showed "We could not load your approvals just now."
 *
 * 🔴🔴 Widening a READ must never widen a WRITE. An approval is the client putting their name to
 * copy that gets published as their claim; a decision we could record on their behalf is not their
 * approval at all, and "they approved it" stops being true.
 * → project_deliverable_approval_system · project_client_admin_boundary
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. portal-deliverables still imports requirePortalOwner.
 *   2. Its admin fallback is reachable ONLY when the request is not a write.
 *   3. Every write branch it handles is named in the isWrite predicate.
 *
 * Exit 0 = the client alone approves · 1 = a write escaped · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FILE = path.join(SITE, "netlify/functions/portal-deliverables.js");

let src;
try { src = fs.readFileSync(FILE, "utf8"); }
catch (e) { console.error(`[approve] INDETERMINATE — cannot read portal-deliverables: ${e.message}`); process.exit(2); }

const fail = [];
console.log("── only the client can approve ──");

if (!/requirePortalOwner\s*\(/.test(src)) fail.push("portal-deliverables no longer calls requirePortalOwner");

// 2 ─ the admin fallback must sit behind an explicit not-a-write check
const fallback = src.match(/if\s*\(gate\.error\)\s*\{([\s\S]{0,400}?)\n\s*\}/);
if (!fallback) {
  fail.push("could not find the gate.error branch — the admin fallback may no longer be guarded");
} else if (!/if\s*\(isWrite\)\s*return\s+gate\.error/.test(fallback[1])) {
  fail.push("the admin fallback is NOT gated on isWrite — an admin could record a decision as the client");
}

// 3 ─ every branch that mutates must be counted as a write
const branches = [...src.matchAll(/^\s{2}if \(body\.([a-z_]+)\)/gm)].map((m) => m[1]);
const predicate = (src.match(/const isWrite = [^;]+;/) || [""])[0];
for (const b of branches) {
  if (!predicate.includes(`body.${b}`)) {
    fail.push(`body.${b} is a request branch but is not in the isWrite predicate — it would be reachable by an admin`);
  }
}
console.log(`  ${branches.length} request branch(es): ${branches.join(", ") || "(none)"}`);
console.log(`  predicate: ${predicate || "(missing)"}`);

if (fail.length) {
  console.error(`\n✗ an approval could be recorded by someone other than the client — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  Reading what a client sees is not the same act as answering for them.");
  process.exit(1);
}
console.log("  ✅ admin may READ the client's portal; only the client may APPROVE");
process.exit(0);
