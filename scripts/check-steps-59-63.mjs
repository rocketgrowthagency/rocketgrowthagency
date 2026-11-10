#!/usr/bin/env node
// check-steps-59-63.mjs - ADMIN STEPS 59, 60, 63 (approved steps_59_63_v1, the owner 11-9). Runs the SHIPPED code: the review-message
// function against a fake database, and the three cards' own render code in a sandbox.
//
// WHAT IT HOLDS
//   1 step 59 writes ONE message (sms_1): the runner has no sms_2 / email / phone script; outcome_data.messages.sms_1 and
//     google_review_link are still stored; portal-review-requests still reads messages.sms_1.
//   2 the function: check / save refuse a gated, incentive, staff-naming, drafting-note or link-less message; a good one is stored with
//     {{first_name}} / {{review_link}}, read back; a skipped step refuses; Rewrite saves nothing and reports its problems.
//   3 59's card: the message with readable placeholders, Edit + Rewrite, the rules row, the review link with Open + Change; the raw draft
//     and the table of runs are hidden; no Run again; a skipped 59 says the asks use the plain built-in message.
//   4 60's card: "N of 5 customers asked" (never "askeds"), Check again, who marked it; the fewer row; the contradicting banner is gone.
//   5 63 skipped: who asked, when RGA agreed, what still happens, Undo on the card, no Run again.
//   6 the noun of a count agrees with its number in admin, portal and the Month 1 report ("customer asked" -> "customers asked").
//   7 no em dash and no hardcoded step number in the new code.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const admin = read("admin/admin.js"), portal = read("portal/portal.js"), flow = read("netlify/functions/flow-execute.js"), prr = read("netlify/functions/portal-review-requests.js"), m1r = read("netlify/functions/_month1-report.js");
let FN, FEWER;
try { FN = req("./admin-review-message.js"); FEWER = req(path.join(SITE, "shared/setup-fewer.js")); } catch (e) { console.error(`INDETERMINATE: a module did not load: ${e.message}`); process.exit(2); }

// ── 1 · the runner
{
  const a = flow.indexOf('"m1.review.system": async'), b = flow.indexOf("// 🔒 STEP 52 · BUILD THE TOP CITATIONS", a);
  const run = a >= 0 && b > a ? flow.slice(a, b) : "";
  if (!run) { console.error("INDETERMINATE: the m1.review.system runner was not found"); process.exit(2); }
  const code = run.replace(/\/\/.*$/gm, "");
  if (!/const KEYS = \["sms_1"\];/.test(code)) fail("1 the runner's KEYS is not exactly [\"sms_1\"]");
  for (const w of ["sms_2", "email_1", "email_2", "phone_script", "PHONE_SCRIPT", "EMAIL_1", "SMS_2"]) if (code.includes(w)) fail(`1 the runner still writes ${w}`);
  if (!/messages: \{ sms_1: /.test(code) || !/google_review_link: reviewUrl/.test(code)) fail("1 the runner no longer stores messages.sms_1 and google_review_link");
  if (!/reviewMessageProblems\(m\[k\], \{ needsLink: true \}\)/.test(code)) fail("1 the runner no longer checks the message with reviewMessageProblems");
  if (!/exports\.reviewSystemRun = EXECUTORS\["m1\.review\.system"\]/.test(flow)) fail("1 Rewrite has no way to call the runner (reviewSystemRun export)");
  if (!/messages\.sms_1/.test(prr) || !/smsOneOf/.test(prr)) fail("1 portal-review-requests no longer reads messages.sms_1 / smsOneOf");
}

// ── 2 · the function, on a fake database
const CID = "11111111-1111-1111-1111-111111111111";
const ev = (b) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...b }) });
let db, rewriteOut;
const mkDb = (task, lossy = false) => {
  const rec = { id: "r1", data: { tasks: { "m1.review.system": task } } };
  return async (p, init = {}) => {
    if (p.startsWith("/client_onboarding_records") && (!init.method || init.method === "GET")) return [{ id: rec.id, client_id: CID, data: JSON.parse(JSON.stringify(rec.data)) }];
    if (p.startsWith("/client_onboarding_records") && init.method === "PATCH") { if (!lossy) rec.data = JSON.parse(init.body).data; return [{ data: rec.data }]; }
    if (p.startsWith("/clients")) return [{ id: CID, business_name: "Test Co" }];
    return [];
  };
};
FN.__useDeps({ gate: { email: "rga@test" }, supa: async (...a) => db(...a), run: async () => rewriteOut });
const call = async (b) => { const r = await FN.handler(ev(b)); return { s: r.statusCode, j: JSON.parse(r.body) }; };
try {
  db = mkDb({ status: "done", outcome_data: { google_review_link: "https://search.google.com/local/writereview?placeid=X", messages: { sms_1: "Hi {{first_name}}, thanks! {{review_link}}" } } });
  const bad = {
    gating: "Hi {first name}, if you had a good experience, review us: {review link}",
    incentive: "Hi {first name}, get a discount for a review: {review link}",
    staff: "Hi {first name}, please mention your technician by name: {review link}",
    note: "Hi {first name}, review us (140 characters): {review link}",
    nolink: "Hi {first name}, please review us.",
    empty: "",
  };
  for (const [k, text] of Object.entries(bad)) {
    const c = await call({ action: "check", text });
    if (!(c.j.problems || []).length) fail(`2 check lets a ${k} message pass`);
    const s = await call({ action: "save", text });
    if (s.s === 200) fail(`2 save accepts a ${k} message`);
  }
  const good = "Hi {first name}, thanks for choosing Test Co! Share your experience: {review link}";
  const c = await call({ action: "check", text: good });
  if ((c.j.problems || []).length) fail(`2 check refuses a good message: ${(c.j.problems || []).join("; ")}`);
  const s = await call({ action: "save", text: good });
  const stored = s.j.tasks && s.j.tasks["m1.review.system"] && s.j.tasks["m1.review.system"].outcome_data;
  if (s.s !== 200 || !stored || stored.messages.sms_1 !== "Hi {{first_name}}, thanks for choosing Test Co! Share your experience: {{review_link}}") fail(`2 a good message is not stored with the stored placeholders (${JSON.stringify(stored && stored.messages)})`);
  if (stored && stored.google_review_link !== "https://search.google.com/local/writereview?placeid=X") fail("2 save lost the review link");
  const odd = await call({ action: "save", text: "Hi {first name}, {{secret}} {review link}" });
  if (odd.s === 200) fail("2 save accepts an unknown placeholder");
  rewriteOut = { outcome_data: { messages: { sms_1: "Hi {{first_name}}, if you were happy, review us {{review_link}}" } } };
  const before = JSON.stringify(await db("/client_onboarding_records?x"));
  const rw = await call({ action: "rewrite" });
  if (!rw.j.ok || !(rw.j.problems || []).length) fail("2 Rewrite does not report the review-rule problems of what it wrote");
  if (JSON.stringify(await db("/client_onboarding_records?x")) !== before) fail("2 Rewrite saved something");
  rewriteOut = { summary: "unusable", outcome: "indeterminate" };
  const rw2 = await call({ action: "rewrite" });
  if (rw2.j.ok !== false) fail("2 Rewrite says ok when the draft was unusable");
  db = mkDb({ status: "skipped", outcome_data: {} });
  if ((await call({ action: "save", text: good })).s === 200) fail("2 a skipped step accepts a saved message");
  { db = mkDb({ status: "done", outcome_data: { google_review_link: "https://search.google.com/local/writereview?placeid=X", messages: { sms_1: "Hi {{first_name}}, thanks! {{review_link}}" } } }, true);
    const lost = await call({ action: "save", text: good }); if (lost.s === 200) fail("2 a save the database did not keep is reported as saved (not read back)"); }
  FN.__useDeps(null);
  if ((await FN.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, action: "check", text: good }) })).statusCode === 200) fail("2 the function answers without RGA's login");
} catch (e) { console.error(`INDETERMINATE: the function gate threw: ${e.stack || e.message}`); process.exit(2); }

// ── 3, 4, 5 · the cards, rendered by their own code
const fnSrc = (name) => {
  const i = admin.indexOf(`function ${name}(`); if (i < 0) return null;
  let d = 0, j = admin.indexOf("{", admin.indexOf(")", i));
  for (let k = j; k < admin.length; k++) { if (admin[k] === "{") d++; else if (admin[k] === "}" && --d === 0) return admin.slice(i, k + 1); }
  return null;
};
const need = ["acCardHtml", "escapeHtml", "escapeAttribute", "rgaNounPlural", "rvNoRerun", "rvMessageOf", "rvMessageCardHtml", "rvFirst5CardHtml", "rvCloseSkippedCardHtml"];
const srcs = need.map(fnSrc);
if (srcs.some((x) => !x)) { console.error(`INDETERMINATE: could not lift ${need.filter((_, i) => !srcs[i]).join(", ")} from admin.js`); process.exit(2); }
const lineOf = (re) => { const m = admin.match(re); if (!m) { console.error(`INDETERMINATE: ${re} not found in admin.js`); process.exit(2); } return m[0]; };
const consts = [lineOf(/^const rvShow = .*$/m), lineOf(/^const rvLinkOf = .*$/m), lineOf(/^const rvMk = .*$/m), lineOf(/^const rvRow = [\s\S]*?\n.*<\/span><span class="d">.*$/m), lineOf(/^const rvBtn = .*$/m),
  lineOf(/^const cbOpen = .*$/m), lineOf(/^const acDay = .*$/m), lineOf(/^const OB_MSG_TILE = .*$/m), lineOf(/^const OB_CAL_TILE = .*$/m), lineOf(/^const stepTitleOf = .*$/m)];
const sb = { state: { selectedClient: { id: CID } }, globalThis: null, setTimeout: () => 0, rvLoadRules: () => {}, sopSequencedSteps: () => [{ obj: { flowId: "m2.exec.review_push" } }],
  obNumberOf: () => 12, document: {}, console };
sb.globalThis = sb; sb.rgaSetupFewer = FEWER; sb.rgaPortalMode = { stepNo: () => 8 };
vm.createContext(sb);
try { vm.runInContext(`${srcs.join("\n")}\n${consts.join("\n")}\nglobalThis.__out = { rvMessageCardHtml, rvFirst5CardHtml, rvCloseSkippedCardHtml, rvNoRerun, rgaNounPlural };`, sb); } catch (e) { console.error(`INDETERMINATE: the card code did not run: ${e.message}`); process.exit(2); }
const R = sb.__out, txt = (h) => String(h).replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const t59 = { status: "done", completed_at: "2026-10-19T15:00:00Z", outcome_data: { google_review_link: "https://search.google.com/local/writereview?placeid=ChIJ51uY", messages: { sms_1: "Hi {{first_name}}, thanks for working with Test Co! Share your experience: {{review_link}}" } },
  auto_result: { summary: "GOOGLE REVIEW LINK:\n SMS_1 RAWDRAFT\nEMAIL_1_SUBJECT x" } };
{
  const h = R.rvMessageCardHtml(t59), x = txt(h);
  for (const w of ["The message every ask sends", "{first name}", "{review link}", "Passes the review rules", "Their review link", "built from the ID Google gave their profile"]) if (!x.includes(w)) fail(`3 the 59 card does not say "${w}"`);
  if (/\{\{/.test(x)) fail("3 the 59 card shows raw {{placeholders}}");
  for (const w of ['data-rv-act="edit"', 'data-rv-act="rewrite"', 'data-setting-change="m1.review.system"', 'value="google_review_link"', "Open"]) if (!h.includes(w)) fail(`3 the 59 card has no ${w}`);
  if (/RAWDRAFT|EMAIL_1|Run again|Every run of this step/.test(h)) fail("3 the 59 card shows the raw draft, a run table or Run again");
  const sk = txt(R.rvMessageCardHtml({ status: "skipped", skip_reason: "no reviews wanted", skipped_at: "2026-10-20T10:00:00Z" }));
  if (!/plain built-in message/.test(sk) || !/Skipped/.test(sk)) fail("3 a skipped 59 does not say the asks use the plain built-in message");
  if (R.rvMessageCardHtml({ status: "pending" }) !== "") fail("3 a 59 with no message and not done draws a card");
  if (!/No message is saved/.test(txt(R.rvMessageCardHtml({ status: "done" })))) fail("3 a done 59 with no saved message does not say so");
  if (!R.rvNoRerun("m1.review.system", t59)) fail("3 59 offers Run again");
  if (R.rvNoRerun("m1.review.system", { status: "skipped" }) === false) fail("3 a skipped 59 offers Run again");
}
{
  const done = { status: "done", completed_by: "client", completed_at: "2026-11-05T12:00:00Z", detected: { n: 1, threshold: 5, noun: "customer asked", at: "2026-11-08T12:00:00Z" },
    fewer: { n: 1, goal: 5, by: "client", who: "x", at: "2026-11-05T12:00:00Z" } };
  const h = R.rvFirst5CardHtml(done), x = txt(h);
  for (const w of ["1 of 5 customers asked", "I sent it", "Check again", "The client finished with fewer", "Their choice", "Monthly step 12", "client step 8"]) if (!x.includes(w)) fail(`4 the 60 card does not say "${w}"`);
  if (/askeds/.test(h)) fail("4 the 60 card says askeds");
  if (/NOT YET|their word|not something we verified|Run again/i.test(h)) fail("4 the 60 card carries the contradiction or Run again");
  if (!h.includes('data-ob-recheck="m1.review.first_5"')) fail("4 the 60 card has no Check again");
  const five = txt(R.rvFirst5CardHtml({ status: "done", detected: { n: 5, threshold: 5, noun: "customer asked", at: "2026-11-08T12:00:00Z" } }));
  if (!five.includes("5 of 5 customers asked") || five.includes("finished with fewer")) fail("4 a 60 done with 5 reads wrong");
  if (!R.rvNoRerun("m1.review.first_5", done)) fail("4 a finished 60 offers Run again");
}
{
  const h = R.rvCloseSkippedCardHtml({ status: "skipped", skip_request: { at: "2026-11-05T12:00:00Z" }, skipped_at: "2026-11-05T15:00:00Z" }, "month1"), x = txt(h);
  for (const w of ["Skipped", "The client asked to skip the call", "RGA agreed Nov 5", "Their Month 1 report goes by email, and the monthly check-in call is still offered"]) if (!x.includes(w)) fail(`5 the 63 card does not say "${w}"`);
  if (!/data-onboard-reset="m1.call.close"/.test(h) || !/>Undo</.test(h)) fail("5 the 63 card has no Undo");
  if (/Run again/.test(h)) fail("5 the 63 card has Run again");
  if (!R.rvNoRerun("m1.call.close", { status: "skipped" })) fail("5 a skipped 63 offers Run again");
  if (R.rvNoRerun("m1.call.close", { status: "pending" })) fail("5 63 loses Run for every state");
  if (!/RGA skipped the call/.test(txt(R.rvCloseSkippedCardHtml({ status: "skipped", skipped_at: "2026-11-05T15:00:00Z" }, "month1")))) fail("5 a 63 RGA skipped by itself reads as a client ask");
}
// the row wiring
{
  if (!/o\.flowId === "m1\.review\.system" \? "" : stepOutputHtml\(/.test(admin)) fail("3 the raw draft and run table are not hidden on 59");
  if (!/o\.flowId === "m1\.review\.first_5" \? ""\s*\n?\s*: byClient && gp/.test(admin) && !/: o\.flowId === "m1\.review\.first_5" \? ""/.test(admin)) fail("4 the 'their word' line still shows on 60");
  if (!/o\.flowId === "m1\.review\.first_5" \? "" : obDetectionHtml\(o, s\.task\)/.test(admin)) fail("4 'We measured' still shows on a done 60");
  if (!/\|\| o\.flowId === "m1\.review\.system" \? "" : stepSettingHtml/.test(admin)) fail("3 59 still shows the duplicate 'Now set to' line");
  if (!/\(o\.flowId === "m1\.call\.close" && s\.task\?\.status === "skipped"\) \? ""/.test(admin)) fail("5 a skipped 63 still has the row's Undo beside the card's");
  if (!/&& !rvNoRerun\(o\.flowId, s\.task\)/.test(admin)) fail("3 the Run again condition does not ask rvNoRerun");
}

// ── 6 · nouns
{
  const fns = [R.rgaNounPlural, vm.runInNewContext(`(${(portal.match(/function rgaNounPlural[\s\S]*?\n/) || [""])[0].replace(/^function rgaNounPlural/, "function")})`), vm.runInNewContext(`(${(m1r.match(/function nounPlural[\s\S]*?\n/) || [""])[0].replace(/^function nounPlural/, "function")})`)];
  fns.forEach((f, i) => {
    const where = ["admin", "portal", "the report"][i];
    if (typeof f !== "function") return fail(`6 ${where} has no noun pluralizer`);
    for (const [n, c, w] of [["customer asked", 5, "customers asked"], ["customer asked", 1, "customer asked"], ["photo", 20, "photos"], ["photo", 1, "photo"], ["form submission", 3, "form submissions"], ["item", 2, "items"]])
      if (f(n, c) !== w) fail(`6 ${where}: ${n} x${c} reads "${f(n, c)}", not "${w}"`);
  });
  for (const [name, src] of [["admin", admin], ["portal", portal], ["the report", m1r]])
    if (/\$\{[^}]*noun[^}]*\}\$\{[^}]*\? ?"" ?: ?"s"\}|\$\{d\.noun\}s/.test(src)) fail(`6 ${name} still appends s to a noun by hand`);
}

// ── 7 · words
{
  const a = admin.indexOf("// 🔒 ADMIN STEPS 59, 60, 63 (approved steps_59_63_v1"), b = admin.indexOf("/** Row 18 (batch 4, approved m1-18)");
  if (a < 0 || b < a) { console.error("INDETERMINATE: the steps 59/60/63 block markers moved"); process.exit(2); }
  const block = admin.slice(a, b).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  if (/—/.test(block) || /—/.test(read("netlify/functions/admin-review-message.js").replace(/\/\/.*$/gm, ""))) fail("7 an em dash is in text a person reads");
  if (/\b(step|Step) \d+/.test(block.replace(/"m[12]\.[a-z_.0-9]+"/g, ""))) fail("7 a hardcoded step number is in the new code");
}
if (F.length) { console.error(`REGRESSED (${F.length}):\n - ${F.join("\n - ")}`); process.exit(1); }
console.log("steps 59, 60, 63: one message, its rules, their link; the count and who marked it; a plain skipped call. All held.");
