#!/usr/bin/env node
// check-gbp-words-need-the-clients-approval.mjs — THE GOOGLE DESCRIPTION, SERVICES AND DETAILS GO OUT ONLY WITH THE CLIENT'S SAY
// (content and AI master #12, approved 11-11, finding A4).
//
// 🔴 WHY: gbp-apply-change (a hand tool) took any ?value= and wrote it as the listing's description with no approval behind it.
// The client's words on a public listing must be the words the client approved, or their own answers, never a model's draft.
// 🔑 WHAT HOLDS (static on the website; nothing is sent anywhere):
//   1. DESCRIPTION: only gbp-publish.js writes `profile.description`, it refuses (409) unless approval.decision === "approved" BEFORE any
//      fetch to Google, and it sends approval.approved_content verbatim; gbp-apply-change's description branch refuses and writes nothing.
//   2. SERVICES: only _gbp-services.js writes `updateMask=serviceItems`; admin-gbp-services-push refuses (409) when the client approved no
//      list, before it reads or writes Google, and writes only the names approvedOf() gives it.
//   3. DETAILS (yes/no attributes) and links: only _gbp-profile.js writes `/attributes`; the files allowed to call applyForStep are a
//      fixed list (each passes the CLIENT'S input or RGA's recorded edit on the client's word); a new caller fails until it is reviewed.
// SELF-PROVING: the scanner is run on fixtures first (a rogue description writer, a services writer elsewhere, a publish that checks
// approval after the fetch, an unlisted applyForStep caller must each be caught; the real shapes passed), else INDETERMINATE.
// Exit 0 held · 1 a way round the approval is open · 2 INDETERMINATE.
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const code = (s) => String(s).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

const DESCRIPTION_WRITERS = ["gbp-publish.js"];
const SERVICE_WRITERS = ["_gbp-services.js"];
const ATTRIBUTE_WRITERS = ["_gbp-profile.js"];
const APPLY_CALLERS = ["_gbp-profile.js", "_gbp-watch.js", "admin-gbp-drift.js", "admin-gbp-booking.js", "admin-gbp-details-save.js", "portal-step-input.js", "_monthly-quarter.js"];

/** files = { name: source } → problems */
export function judge(files) {
  const p = [];
  for (const [name, raw] of Object.entries(files)) {
    const s = code(raw);
    if (/updateMask[^\n]*profile\.description|mask\s*=\s*["']profile\.description|profile:\s*\{\s*description\s*:/.test(s) && !DESCRIPTION_WRITERS.includes(name)) p.push(`${name} writes the Google description (a profile.description write); only gbp-publish.js may, after the client's approval`);
    if (/updateMask=serviceItems/.test(s) && !SERVICE_WRITERS.includes(name)) p.push(`${name} writes the Google services (serviceItems); only _gbp-services.js may, through the approved-list push`);
    if (/\/attributes\?attributeMask/.test(s) && !ATTRIBUTE_WRITERS.includes(name)) p.push(`${name} writes Google details (attributes); only _gbp-profile.js may`);
    if (/\bapplyForStep\s*\(/.test(s) && !APPLY_CALLERS.includes(name) && name !== "_gbp-profile.js") p.push(`${name} calls applyForStep (a write to the Google profile) and is not on the reviewed list`);
  }
  const pub = code(files["gbp-publish.js"] || "");
  if (!pub) p.push("gbp-publish.js is missing");
  else {
    const ap = pub.search(/approval\?*\.decision\s*!==\s*"approved"/), fetchAt = pub.search(/fetch\(\s*`https:\/\/mybusinessbusinessinformation/);
    if (ap < 0) p.push("gbp-publish.js no longer refuses unless approval.decision is \"approved\"");
    else if (fetchAt >= 0 && ap > fetchAt) p.push("gbp-publish.js checks the approval AFTER it has gone to Google");
    else if (!/json\(409[\s\S]{0,200}Nothing was sent/.test(pub.slice(ap, ap + 400))) p.push("gbp-publish.js's approval check doesn't refuse with 409 and say nothing was sent");
    if (!/approved\s*=\s*\(approval\.approved_content/.test(pub) || !/intended\s*=\s*approved\s*;/.test(pub)) p.push("gbp-publish.js doesn't send the approved content verbatim (intended = approved)");
    if (/task\??\.(draft|client_input)/.test(pub)) p.push("gbp-publish.js reads the draft or the client's raw input, not the approved content");
  }
  const app = code(files["gbp-apply-change.js"] || "");
  if (!app) p.push("gbp-apply-change.js is missing");
  else {
    const i = app.search(/field\s*===\s*"description"\s*\)\s*\{/);
    if (i < 0) p.push("gbp-apply-change.js's description branch can't be found");
    else {
      const branch = app.slice(i, app.indexOf("} else if", i));
      if (!/return json\(409/.test(branch)) p.push("gbp-apply-change.js's description branch doesn't refuse");
      if (/body\s*=|description:\s*value/.test(branch)) p.push("gbp-apply-change.js's description branch still builds a write from ?value=");
    }
  }
  const push = code(files["admin-gbp-services-push.js"] || "");
  if (!push) p.push("admin-gbp-services-push.js is missing");
  else {
    const ref = push.search(/if\s*\(!names\.length\)\s*return json\(409/), rd = push.search(/readServices\(/), wr = push.search(/\.(applyServices|writeServices|push)\(|S\.[a-zA-Z]*(Write|Apply|Push)[a-zA-Z]*\(/);
    if (ref < 0) p.push("admin-gbp-services-push.js no longer refuses (409) when the client approved no services");
    else if (rd >= 0 && ref > rd) p.push("admin-gbp-services-push.js reads Google before it checks the client approved a list");
    else if (wr >= 0 && ref > wr) p.push("admin-gbp-services-push.js writes before it checks the client approved a list");
    if (!/task\.approval\.decision\s*===\s*"approved"/.test(push)) p.push("approvedOf() no longer requires approval.decision === \"approved\"");
  }
  return p;
}

// ── self-test on fixtures ────────────────────────────────────────────────────────────────────────────────────────────────
const GOOD = {
  "gbp-publish.js": 'if (approval?.decision !== "approved") {\n return json(409, { error: "x. Nothing was sent to Google." });\n}\nconst approved = (approval.approved_content || "").trim();\nintended = approved;\npatch = { profile: { description: intended } }; mask = "profile.description";\nawait fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/x`);',
  "gbp-apply-change.js": 'if (field === "description") {\n return json(409, { ok: false });\n } else if (field === "x") { body = 1; }',
  "admin-gbp-services-push.js": 'function approvedOf(task) { const a = task && task.approval && task.approval.decision === "approved" ? 1 : 0; }\nconst { names } = approvedOf(task);\nif (!names.length) return json(409, { error: "no" });\nlet view = await S.readServices(deps);\nconst out = await S.applyServices(deps);',
  "_gbp-services.js": "call(`${deps.loc}?updateMask=serviceItems`)",
  "_gbp-profile.js": "call(`${deps.loc}/attributes?attributeMask=${m}`)\nfunction applyForStep(){}",
  "other.js": "const x = 1;",
};
{
  const t = (cond, m) => { if (!cond) idk(`self-test: ${m}`); };
  t(judge(GOOD).length === 0, `the good shapes fail: ${judge(GOOD).join(" | ")}`);
  t(judge({ ...GOOD, "rogue.js": 'body = { profile: { description: v } }; mask = "profile.description";' }).length > 0, "a rogue description writer passes");
  t(judge({ ...GOOD, "rogue.js": "call(`${loc}?updateMask=serviceItems`)" }).length > 0, "a rogue services writer passes");
  t(judge({ ...GOOD, "rogue.js": "call(`${loc}/attributes?attributeMask=x`)" }).length > 0, "a rogue details writer passes");
  t(judge({ ...GOOD, "rogue.js": "await applyForStep(a, b, c)" }).length > 0, "an unlisted applyForStep caller passes");
  t(judge({ ...GOOD, "gbp-publish.js": GOOD["gbp-publish.js"].replace('approval?.decision !== "approved"', "false") }).length > 0, "a publish with no approval check passes");
  t(judge({ ...GOOD, "gbp-publish.js": GOOD["gbp-publish.js"].replace(/if \(approval[\s\S]*?\n}\n/, "") + '\nif (approval?.decision !== "approved") { return json(409, {error:"Nothing was sent"}); }' }).length > 0, "a publish that checks approval after the fetch passes");
  t(judge({ ...GOOD, "gbp-publish.js": GOOD["gbp-publish.js"].replace("intended = approved;", "intended = task.draft;") }).length > 0, "a publish of the draft passes");
  t(judge({ ...GOOD, "gbp-apply-change.js": 'if (field === "description") {\n body = { profile: { description: value } };\n } else if (field === "x") { body = 1; }' }).length > 0, "a hand tool that writes ?value= passes");
  t(judge({ ...GOOD, "admin-gbp-services-push.js": GOOD["admin-gbp-services-push.js"].replace("if (!names.length) return json(409", "if (false) return json(409") }).length > 0, "a services push with no approval refusal passes");
  t(judge({ ...GOOD, "admin-gbp-services-push.js": GOOD["admin-gbp-services-push.js"].replace('decision === "approved"', "decision") }).length > 0, "approvedOf not requiring approval passes");
}
if (process.env.GATE_SELFTEST_ONLY) { console.log("✅ self-test held"); process.exit(0); }

const dir = path.join(SITE, "netlify/functions");
let names = []; try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".js")); } catch { idk(`cannot list ${dir}`); }
if (names.length < 100) idk(`only ${names.length} functions under ${dir}`);
const files = {};
for (const n of names) files[n] = fs.readFileSync(path.join(dir, n), "utf8");
for (const need of ["gbp-publish.js", "gbp-apply-change.js", "admin-gbp-services-push.js", "_gbp-services.js", "_gbp-profile.js"]) if (!files[need]) idk(`${need} not found`);
const F = judge(files);
if (F.length) { console.error(`🔴 the client's approval can be walked round:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ the Google description, services and details need the client's say: ${names.length} functions scanned, one writer each, publish and services push refuse before they touch Google, the hand tool refuses a description`);
