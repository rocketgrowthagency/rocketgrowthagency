#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-staff-list-is-known.mjs
//
// 🔒 WHY (11-13): RGA has exactly two staff sign-ins: Chris (owner, hello@rocketgrowthagency.com) and the checks' ROBOT
// (rocketgrowthagencyadmin+robot@gmail.com, role staff, created 11-13 by scripts/create-robot-staff.mjs so admin two-step can go ON
// without locking out every check). A staff account sees every client's data, so a THIRD one appearing — or the robot losing its
// authenticator, or gaining a second — must go red the next morning, not be found in an audit. READ-ONLY (Management API, read_only).
// exit 0 = the staff list is exactly the known accounts · 1 = it isn't · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// the list lives in lib/known-staff.mjs so the mutation runner can change it (it points SCRAPER_COPY_DIR at its copy)
const ROOT = process.env.SCRAPER_COPY_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let KNOWN;
try { ({ KNOWN } = await import(pathToFileURL(path.join(ROOT, "scripts/lib/known-staff.mjs")).href)); } catch (e) { console.error(`⚠️  INDETERMINATE — lib/known-staff.mjs won't load: ${e.message}`); process.exit(2); }
const T = process.env.SUPABASE_ACCESS_TOKEN, ref = ((process.env.SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\./) || [])[1];
if (!T || !ref) { console.error("⚠️  INDETERMINATE — no SUPABASE_ACCESS_TOKEN / SUPABASE_URL (run from the Scraper with .env loaded)"); process.exit(2); }
const q = `select u.email, p.role, (select count(*) from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')::int as factors
  from public.profiles p join auth.users u on u.id = p.id where p.role in ('owner','admin','staff','rep') order by u.email`;
let rows;
try {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query?read_only=true`, { method: "POST", headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q, read_only: true }), signal: AbortSignal.timeout(20000) });
  rows = await r.json();
  if (!r.ok || !Array.isArray(rows)) throw new Error(`${r.status} ${JSON.stringify(rows).slice(0, 120)}`);
} catch (e) { console.error(`⚠️  INDETERMINATE — the staff list could not be read: ${e.message}`); process.exit(2); }
if (!rows.length) { console.error("⚠️  INDETERMINATE — no staff at all came back (an owner always exists): the read is wrong, not the list"); process.exit(2); }

const F = [];
for (const r of rows) {
  const k = KNOWN[String(r.email || "").toLowerCase()];
  if (!k) { F.push(`${r.email} is ${r.role} and is not a known staff sign-in: if this is on purpose add it to KNOWN with its reason, else remove the role`); continue; }
  if (k.role !== r.role) F.push(`${r.email} is ${r.role}, known as ${k.role}`);
  if (k.factors != null && r.factors !== k.factors) F.push(`${r.email} has ${r.factors} verified authenticator(s), expected ${k.factors}${r.factors === 0 ? " (the checks can't reach aal2: run scripts/create-robot-staff.mjs)" : ""}`);
}
for (const e of Object.keys(KNOWN)) if (!rows.some((r) => String(r.email || "").toLowerCase() === e)) F.push(`${e} (${KNOWN[e].why}) is no longer staff`);

if (F.length) { console.log(`❌ THE STAFF LIST IS NOT THE KNOWN ONE (${F.length}):`); for (const x of F) console.log("   • " + x); process.exit(1); }
console.log(`✅ the staff list is exactly the known sign-ins (${rows.length}): ${rows.map((r) => `${r.role}`).join(", ")}; the robot has one authenticator`);
process.exit(0);
