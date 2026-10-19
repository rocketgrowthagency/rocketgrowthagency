#!/usr/bin/env node
// check-the-foundation-card-finishes.mjs — the client portal's "Foundation" card says DONE once the client is past
// onboarding (Monthly / Mature), and "in progress" only while onboarding runs.
//
// 🔴 WHY (2026-10-19, the Mature-stage review in sop_step_atlas_v1): buildOnboardingProgressHtml had no finished state —
// a Monthly or Mature client read "Foundation work in progress · We'll notify you the moment it's complete" forever.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src; try { src = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read portal/portal.js"); process.exit(2); }
const F = [];
const set = (src.match(/^const FOUNDATION_DONE_STAGES = new Set\(\[[^\]]*\]\);$/m) || [])[0];
const at = src.indexOf("function buildOnboardingProgressHtml(");
if (!set || at < 0) { console.error("⚠️  INDETERMINATE — FOUNDATION_DONE_STAGES or buildOnboardingProgressHtml moved; re-read the portal"); process.exit(2); }
let d = 0, end = -1;
for (let i = src.indexOf("{", at); i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
const ctx = vm.createContext({});
vm.runInContext(`${set}\n${src.slice(at, end)}\nthis.f = buildOnboardingProgressHtml;`, ctx);
const tasks = { data: { tasks: { a: { status: "done" }, b: { status: "pending" } } } };
const txt = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const st of ["stage_5_monthly", "stage_6_mature"]) {
  const t = txt(ctx.f(tasks, st));
  if (!/Foundation complete/.test(t) || /in progress|notify you the moment/i.test(t)) F(`a ${st} client still reads the foundation as unfinished (${t.trim().slice(0, 90)})`);
}
if (!/Foundation work in progress/.test(txt(ctx.f(tasks, "stage_4_onboarding")))) F("an onboarding client no longer sees the foundation in progress");
if (!/const stage = client\.client_portal_stage[^\n]*\n\s*const onboardingProgressHtml = buildOnboardingProgressHtml\(onboarding, stage\);/.test(src)) F("the portal doesn't pass the client's stage to the foundation card (it would never know it's finished)");
if (F.length) { console.error("🔴 the foundation card doesn't finish:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the foundation card says Done for Monthly + Mature clients, in progress only during onboarding, and is given the client's stage");
