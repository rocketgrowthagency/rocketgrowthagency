#!/usr/bin/env node
// check-review-requests-ask-everyone.mjs — 2026-10-20, found reviewing RGA's own step 56 draft before marking it done.
// Step 12 texts customers step 56's SMS_1 VERBATIM. The prose draft would have sent "(send immediately after job completion
// — must be under 160 characters) Hi …", and two messages asked "if you had a good experience" — REVIEW GATING, which
// Google's review policy forbids (a suspension risk for the client's listing). Now: the messages are validated data,
// _review-policy blocks gating / incentives / drafting notes / [brackets], step 12 sends only a message that passes, and
// Monthly's review campaign is checked the same way. RUNS the real runner + extractor on fakes.
//   exit 0 holds · 1 a gated or annotated message can reach a customer · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`;
const req = createRequire(`${FNS}/x.js`);
const F = [], fail = (m) => F.push(m);
let P; try { P = req("./_review-policy.js"); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
const bad = (t, o) => P.reviewMessageProblems(t, o).length > 0;
// the policy itself — any trade, any wording
for (const t of ["Hi {{first_name}}, if you had a good experience, leave a review: {{review_link}}", "If you were happy with the work, we'd love a review {{review_link}}",
  "Enjoyed the service? If you enjoyed it, review us {{review_link}}", "Only if you loved it — {{review_link}}", "Leave a review and get 10% off {{review_link}}",
  "(send right after the job) Hi {{first_name}} {{review_link}}", "Hi {{first_name}} {{review_link}} (158 characters)", "Hi, this is [your name] {{review_link}}"])
  if (!bad(t)) fail(`the policy lets this through: "${t}"`);
for (const t of ["Hi {{first_name}}, thanks for choosing Acme Plumbing! Would you mind leaving a quick review? {{review_link}}", "Hi {{first_name}}, if you have a minute, a quick Google review really helps: {{review_link}}"])
  if (bad(t)) fail(`the policy refuses an honest request: "${t}" (${P.reviewMessageProblems(t).join("; ")})`);
// the step 56 runner, run on fakes
const flow = fs.readFileSync(`${FNS}/flow-execute.js`, "utf8");
const at = flow.indexOf('"m1.review.system": async'); if (at < 0) { console.error("⚠️  step 56's runner moved"); process.exit(2); }
const st = flow.indexOf("async", at); let d = 0, end = -1;
for (let i = flow.indexOf("{", flow.indexOf("=>", st)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
const run = (reply) => vm.runInContext(`(${flow.slice(st, end)})`, vm.createContext({ JSON, String, Object, require: (m) => (m === "./_review-policy" ? P : null),
  reviewLink: () => "https://g.test/r", clientCtx: () => "ctx", aiDraft: async () => reply }))({ client: {} });
const CLEAN = { sms_1: "Hi {{first_name}}, thanks for choosing Acme! Would you mind a quick review? {{review_link}}", sms_2: "Hi {{first_name}}, a quick review helps: {{review_link}}",
  email_1_subject: "How did we do?", email_1_body: "Hi {{first_name}}, thanks! Review us here: {{review_link}}", email_2_subject: "A quick favor", email_2_body: "Hi {{first_name}}, one minute: {{review_link}}", phone_script: "Thanks again — can I text you our review link?" };
{ const r = await run(JSON.stringify(CLEAN));
  if (r.outcome === "indeterminate" || r.outcome_data?.messages?.sms_1 !== CLEAN.sms_1) fail("a clean draft isn't stored as validated messages");
  if (/characters|send immediately/i.test(r.summary)) fail("drafting notes reach the summary"); }
{ const r = await run(JSON.stringify({ ...CLEAN, email_2_body: "If you had a good experience, a review helps: {{review_link}}" }));
  if (r.outcome !== "indeterminate" || r.outcome_data?.messages) fail("a GATED draft is saved"); }
{ const r = await run("SMS_1: Hi {{first_name}} {{review_link}}"); if (r.outcome !== "indeterminate") fail("a prose draft is saved as the messages"); }
// step 12 uses only a message that passes
const rr = fs.readFileSync(`${FNS}/portal-review-requests.js`, "utf8");
if (!/const bad = require\("\.\/_review-policy"\)\.reviewMessageProblems\(msg \|\| ""\);\s*if \(bad\.length\)[^\n]*return null;/.test(rr)) fail("step 12 can text a message that fails the review policy");
if (!/t\.outcome_data && t\.outcome_data\.messages && t\.outcome_data\.messages\.sms_1/.test(rr)) fail("step 12 doesn't read the validated message first");
if (!/const \{ GATING, INCENTIVE \} = require\("\.\/_review-policy"\);\s*if \(GATING\.test\(draft\) \|\| INCENTIVE\.test\(draft\)\) return/.test(flow)) fail("Monthly's review campaign isn't checked for gating / incentives");
if (F.length) { console.error("🔴 a review request can ask only happy customers, or carry drafting notes:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ review requests ask everyone: gating / incentives / drafting notes / [brackets] refused; step 56 stores validated messages; step 12 sends only a passing one; Monthly checked");
