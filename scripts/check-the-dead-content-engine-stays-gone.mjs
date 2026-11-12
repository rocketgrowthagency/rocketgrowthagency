#!/usr/bin/env node
// check-the-dead-content-engine-stays-gone.mjs — THE DEAD CONTENT ENGINE, ITS "APPLY TO FLOW" BUTTON AND THE BRAIN'S "BEST INFERENCE" STAY GONE
// (content and AI master #12, approved 11-11, findings A8 and A6).
//
// 🔴 WHY: v2-generate-content-background was called by the Brain with no auth header, so every call was refused (401), while a
// brain_applied_to_flow row said it had been sent, and the admin's "Apply to FLOW" button fed a card that no longer exists in Monthly. It
// also spent model money outside any ledger. Proven dead 11-11 (no schedule, no link, no email, no other caller; no run ever finished)
// and deleted. The Brain prompt also told the model to "make your best inference" where a source was missing: a guessed figure in a client's brief.
// 🔑 WHAT HOLDS (an ABSENCE check, so it scans, it doesn't assume): the function file is gone; no file in the website (functions, admin,
// portal, shared, public pages, netlify.toml, partials, emails) names it, its button, its handler or its activity row; the Brain prompt has no
// "best inference" and says to name the missing source instead.
// SELF-PROVING: the scanner is run on fixtures (a stray caller, a button, a schedule, a brand-new "best inference" must each be caught).
// Exit 0 gone · 1 something of it is back · 2 INDETERMINATE.
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const COMMENT = /^\s*(\/\/|\*|\/\*|<!--)/;
const NAMES = [/v2-generate-content/, /v2ApplyToFlow/, /applyBrainToFlow/, /v2FlowInstructions/, /Apply to FLOW/i, /brain_applied_to_flow/];

/** { relPath: source } → problems (comments are skipped: the removal notes name what they removed) */
export function judge(files) {
  const p = [];
  if (Object.keys(files).some((f) => /netlify\/functions\/v2-generate-content-background\.js$/.test(f))) p.push("netlify/functions/v2-generate-content-background.js is back");
  for (const [f, src] of Object.entries(files)) {
    const lines = String(src).split("\n").filter((l) => !COMMENT.test(l));
    const body = lines.join("\n");
    for (const re of NAMES) if (re.test(body)) p.push(`${f} names ${re.source} (the dead content engine)`);
    if (/make your best inference/i.test(body)) p.push(`${f} tells the model to "make your best inference" (a guessed figure in a client's brief)`);
  }
  return p;
}

const GOOD = { "netlify/functions/a.js": "// the v2-generate-content engine was deleted\nconst x = 1;", "admin/admin.js": "const y = 2;" };
{
  const t = (c, m) => { if (!c) idk(`self-test: ${m}`); };
  t(judge(GOOD).length === 0, "a repo with only a removal note fails");
  t(judge({ ...GOOD, "netlify/functions/v2-generate-content-background.js": "x" }).length > 0, "the function file back passes");
  t(judge({ ...GOOD, "netlify/functions/b.js": "fetch('/.netlify/functions/v2-generate-content-background')" }).length > 0, "a caller passes");
  t(judge({ ...GOOD, "admin/index.html": '<button id="v2ApplyToFlowBtn">→ Apply to FLOW</button>' }).length > 0, "the button passes");
  t(judge({ ...GOOD, "admin/admin.js": "function applyBrainToFlow() {}" }).length > 0, "its handler passes");
  t(judge({ ...GOOD, "netlify.toml": '[functions."v2-generate-content-background"]\n  schedule = "0 * * * *"' }).length > 0, "a schedule passes");
  t(judge({ ...GOOD, "x.js": "kind: 'brain_applied_to_flow'" }).length > 0, "the activity row passes");
  t(judge({ ...GOOD, "netlify/functions/v2-brain-analysis-background.js": "- If missing, make your best inference but flag it" }).length > 0, "'best inference' back in the Brain prompt passes");
}
if (process.env.GATE_SELFTEST_ONLY) { console.log("✅ self-test held"); process.exit(0); }

const files = {};
const walk = (rel, depth = 0) => {
  let ents = []; try { ents = fs.readdirSync(path.join(SITE, rel), { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|\.git|\.claude|\.netlify|reports|docs|v|videos|archive|research_notes|mockups?|__scraper)$/.test(e.name) && depth < 5) walk(r, depth + 1); }
    else if (/\.(js|mjs|cjs|html|toml|json|sh)$/.test(e.name) && !/^(package-lock\.json)$/.test(e.name) && !/^mockup-/.test(e.name)) {
      try { if (fs.statSync(path.join(SITE, r)).size < 3_000_000) files[r] = fs.readFileSync(path.join(SITE, r), "utf8"); } catch { /* skip */ }
    }
  }
};
walk("");
if (Object.keys(files).length < 150) idk(`only ${Object.keys(files).length} files read under ${SITE}`);
if (!files["netlify/functions/v2-brain-analysis-background.js"]) idk("the Brain function was not found");
const F = judge(files);
if (!/never guess or estimate/i.test(files["netlify/functions/v2-brain-analysis-background.js"])) F.push("the Brain prompt no longer tells the model to name a missing source instead of guessing");
if (F.length) { console.error(`🔴 the dead content engine (or a guess in the Brain) is back:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ the dead content engine stays gone: ${Object.keys(files).length} files scanned, no function, caller, schedule, button, handler or activity row, and the Brain prompt names a missing source instead of guessing`);
