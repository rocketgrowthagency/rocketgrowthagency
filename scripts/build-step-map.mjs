#!/usr/bin/env node
// build-step-map.mjs — every step, in both portals, with the number each portal prints and what the step is.
//
// 🔒 WHY (Chris 10-31: "its actually step 38. we need all steps for client and portal saved and shown what each is").
// I'd been calling it admin step 39 from a hand-kept table that had drifted. The admin number comes from the page itself,
// read by _probe-numbering.mjs (a read-only sign-in); the client number comes from the playbook, which the portal draws.
//
// Writes the memory file reference_all_steps_map.md and the website's reports/steps/rga-step-map.html.
// Exit 0 written · 1 the map came out wrong, the old one is left in place · 2 couldn't read the page
//
// STEP_MAP_ROWS=<json> uses rows already read, so it can be tested with no browser.
import { stepMapPrint } from "./lib/step-map-print.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MEMORY = process.env.STEP_MAP_MEMORY || `${os.homedir()}/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory/reference_all_steps_map.md`;
const HTML = process.env.STEP_MAP_HTML || `${SITE}/reports/steps/rga-step-map.html`;

function readRows() {
  if (process.env.STEP_MAP_ROWS) return JSON.parse(fs.readFileSync(process.env.STEP_MAP_ROWS, "utf8"));
  const out = path.join(os.tmpdir(), `rga-step-map-${process.pid}.json`);
  const r = spawnSync("node", [`${HERE}/_probe-numbering.mjs`], { encoding: "utf8", env: { ...process.env, PROBE_JSON: out } });
  if (r.status !== 0 || !fs.existsSync(out)) { console.error(`⚠️  INDETERMINATE: couldn't read the checklist (exit ${r.status}): ${String(r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" ").slice(0, 300)}`); process.exit(2); }
  const rows = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return rows;
}

const rows = readRows();
const play = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
const defs = new Map();
for (const [month, list] of Object.entries(play)) for (const s of list.steps || list) defs.set(s.id, { ...s, month });

const whoOf = (d) => (d?.actor === "client" ? "Client" : d?.actor === "both" ? "You + client" : d?.actor === "auto" ? "Runs itself" : "You");
const clean = (t) => String(t || "").replace(/\s+(You \+ client|You|Client|Runs itself)\s*$/, "").trim();
const say = (t) => String(t || "").replace(/\s+/g, " ").trim();
// 🔒 Chris 11-1: "all numbers and titles and what they do". One plain sentence per step, kept in data/playbooks/what-it-does.json. A step with none draws blank and check-the-step-map-is-current fails, so a new step can't skip it; the numbers still update.
const WHAT = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/what-it-does.json`, "utf8"));

const admin = rows.map((r) => {
  const d = defs.get(r.id) || {};
  const who = (/(You \+ client|Runs itself|Client|You)\s*$/.exec(String(r.title || "")) || [])[1] || whoOf(d);
  return { n: r.n, id: r.id, title: clean(r.title) || d.title || r.id, who, client: d.clientStepNo || null, clientLabel: d.clientLabel || null, what: WHAT.admin[r.id] || "", month: d.month || (String(r.id).startsWith("m1.") ? "month1" : "month2plus") };
});
const month1 = admin.filter((a) => a.month === "month1");
// 🔒 MONTHLY NUMBERS RUN IN SECTION ORDER (11-11, master map Tier 1; before that monthly_audit_v2 appended 26, 27 … mid-list). The "Every quarter"
// section (outside months 3, 6, 9 …) and "Account health" (before Month 4) are folded, so their steps draw no .ob-step row at all.
// 🔑 So the sheet lists Monthly BY NUMBER, every step, and a step the page does not draw this month gets its number from the SAME
// rule the admin numbers with (obMonthlyPageNumbers over shared/monthly-sections.js) — trusted only if that rule reproduces EVERY
// number the page did print. One disagreement and the sheet is not rebuilt. (11-11: the sheet was 13 steps short and read as out of order.)
const monthlyRule = (() => {
  let M;
  try { const src = fs.readFileSync(`${SITE}/shared/monthly-sections.js`, "utf8"); const box = { module: { exports: {} } }; new Function("module", "globalThis", src)(box.module, {}); M = box.module.exports; }
  catch { return null; }
  if (!M || !Array.isArray(M.SECTIONS)) return null;
  const list = (play.month2plus && (play.month2plus.steps || play.month2plus)) || [], ids = list.map((s) => s.id), app = M.APPENDED || [];
  const order = []; for (const sec of M.SECTIONS) for (const id of sec.ids) if (ids.includes(id) && !order.includes(id)) order.push(id);
  for (const id of ids) if (!order.includes(id)) order.push(id);
  // 🔄 11-11 (master map Tier 1): the admin numbers in section order (obMonthlyPageNumbers). Until that build is live the page still prints the
  // retired rule (APPENDED numbered last). 🔑 THE PAGE DECIDES: of the two, the one that reproduces EVERY number the page printed fills the folded
  // steps; if neither does, the sheet is not rebuilt. The sheet always says which rule the live page uses.
  const section = new Map(); let n = 0; order.forEach((id) => section.set(id, ++n));
  const appended = new Map(); n = 0; order.filter((id) => !app.includes(id)).forEach((id) => appended.set(id, ++n)); app.forEach((id) => { if (ids.includes(id)) appended.set(id, ++n); });
  const sec = (id) => (M.SECTIONS.find((s) => s.ids.includes(id)) || M.SECTIONS[M.SECTIONS.length - 1]);
  return { rules: { "section order": section, "appended (retired 11-11)": appended }, num: section, name: "section order", sec };
})();
// the same lists admin.js stepRunsItself reads (11-11): a step its runner starts AND finishes reads "Runs itself"
const SELF_IDS = (() => { const out = new Set(); for (const f of ["steps-57-64", "monthly-monthly", "monthly-close", "monthly-quarter", "monthly-health"]) {
  try { const box = { module: { exports: {} } }; new Function("module", "globalThis", fs.readFileSync(`${SITE}/shared/${f}.js`, "utf8"))(box.module, {}); for (const id of box.module.exports.SELF || []) out.add(id); } catch { /* a missing list adds nothing */ } }
  return out; })();
const runsItselfById = (id) => SELF_IDS.has(id);
const monthlyShown = admin.filter((a) => a.month !== "month1");
const monthlyBad = [];
if (!monthlyRule) monthlyBad.push("shared/monthly-sections.js couldn't be read, so a folded Monthly step has no number");
else {
  const fits = Object.entries(monthlyRule.rules).find(([, num]) => monthlyShown.every((a) => Number(a.n) === num.get(a.id)));
  if (fits) { monthlyRule.name = fits[0]; monthlyRule.num = fits[1]; }
  else for (const a of monthlyShown) if (Number(a.n) !== monthlyRule.num.get(a.id)) monthlyBad.push(`Monthly ${a.id}: the page prints ${a.n}, the section-order rule says ${monthlyRule.num.get(a.id)} (and the retired rule disagrees too)`);
}
const monthly = monthlyRule ? [...monthlyShown, ...[...monthlyRule.num.keys()].filter((id) => !monthlyShown.some((a) => a.id === id)).map((id) => {
  const d = defs.get(id) || {};
  return { n: String(monthlyRule.num.get(id)), id, title: `${d.title || id} (folded this month: ${monthlyRule.sec(id).name})`, who: runsItselfById(id) && d.actor !== "client" ? "Runs itself" : whoOf(d), client: d.clientStepNo || null, clientLabel: d.clientLabel || null, what: WHAT.admin[id] || "", month: "month2plus" };
})].sort((a, b) => Number(a.n) - Number(b.n)) : monthlyShown;
const client = [...defs.values()].filter((d) => d.clientStepNo).sort((a, b) => a.clientStepNo - b.clientStepNo).map((d) => {
  const a = admin.find((x) => x.id === d.id);
  return { n: d.clientStepNo, id: d.id, label: d.clientLabel || d.title, what: WHAT.client[d.id] || "", admin: a ? a.n : null, adminMonth: a ? a.month : null };
});

// 🔒 MANAGED MODE, AS THE LIVE PORTAL PRINTS IT (11-11, master map Tier 1: the section said "being built, no client uses it" with 1–12 long after
// setup_vs_month1_v1). Every number comes from shared/portal-mode.js stepNo, the one rule the portal prints with: Getting started 1–3 (step 3 is
// "Check what we found", client-steps.json managed.check); Month 1 work (photos, review asks, videos, the Month 1 review) is a line in the Month 1
// card on Ongoing work with NO number; the Monthly cards print what stepNo gives them.
const CS = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/client-steps.json`, "utf8"));
// 11-11: a real require, not a sandbox: portal-mode.js reads the Month 1 list from setup-split.js with require (ONE LIST), and a sandbox without it gave every managed step no number
const PMODE = (await import("node:module")).createRequire(import.meta.url)(`${SITE}/shared/portal-mode.js`);
const ROLE_WORDS = { check: "a row in managed step 3", card: "an RGA card, no number", setup: "part of a Setup step", step: "a step with no number" };
const managedRows = (() => {
  const all = [...(CS.month1 || []), ...(CS.month2plus || [])], chk = CS.managed && CS.managed.check;
  const noOf = (d) => (d.id === "managed.check_found" ? Number(d.managedStepNo) : PMODE.stepNo(d, "managed"));
  const withNo = [...all, ...(chk ? [{ ...chk, clientStepNo: null }] : [])].map((d) => ({ d, n: noOf(d) }));
  const numbered = withNo.filter((x) => x.n != null).sort((a, b) => a.n - b.n);
  const month1Work = new Set(PMODE.MONTH1_WORK || []);
  const rest = withNo.filter((x) => x.n == null).map((x) => x.d).sort((a, b) => (month1Work.has(b.id) - month1Work.has(a.id)) || ["check", "card", "setup", "step"].indexOf(a.managedRole) - ["check", "card", "setup", "step"].indexOf(b.managedRole) || (a.clientStepNo || 99) - (b.clientStepNo || 99));
  const where = (d) => (/^m2\./.test(d.id) ? "a Monthly card on Ongoing work" : "Getting started (Setup)");
  return [...numbered.map(({ d, n }) => ({ n, id: d.id, label: PMODE.stepLabel(d, "managed") || d.clientLabel, becomes: d.id === "managed.check_found" ? `Getting started: one step for ${d.covers.length} checks (today's ${d.covers.map((id) => (all.find((x) => x.id === id) || {}).clientStepNo).join(", ")})` : where(d), today: d.clientStepNo ?? "new" })),
    ...rest.map((d) => ({ n: "", id: d.id, label: PMODE.stepLabel(d, "managed") || d.clientLabel, becomes: month1Work.has(d.id) ? "Month 1 work: a line in the Month 1 card on Ongoing work, no number" : (ROLE_WORDS[d.managedRole] || ""), today: d.clientStepNo ?? "" }))];
})();

// what the client also sees with no step number: approvals and asks tied to an admin step, plus the cards that aren't steps at all (data/playbooks/what-it-does.json clientCards)
const clientUnnumbered = [
  ...[...defs.values()].filter((d) => d.clientLabel && !d.clientStepNo).map((d) => { const a = admin.find((x) => x.id === d.id); return { id: d.id, label: d.clientLabel, what: WHAT.admin[d.id] || "", admin: a ? a.n : null, adminMonth: a ? a.month : null }; }),
  ...Object.entries(WHAT.clientCards || {}).map(([id, c]) => ({ id, label: c.title, what: c.what, admin: null, adminMonth: null })),
];

// a map that came out wrong must not replace one that's right
const bad = [];
const nums = month1.map((a) => a.n);
if (month1.length < 40) bad.push(`only ${month1.length} Month 1 rows`);
if (new Set(nums).size !== nums.length || nums.some((n, i) => Number(n) !== i + 1)) bad.push("the Month 1 numbers don't run 1, 2, 3 in order");
if (!month1.some((a) => a.id === "m1.gbp.photos")) bad.push("the photo step isn't in the Month 1 rows");
if (client.length < 10 || client.some((c, i) => c.n !== i + 1)) bad.push("the client numbers don't run 1, 2, 3 in order");
bad.push(...monthlyBad);
if (monthly.some((a, i) => Number(a.n) !== i + 1)) bad.push("the Monthly numbers aren't 1 to N, each once");
// the managed portal: Getting started is 1, 2, 3; a gap after it (Month 1 work has no number) is printed as it is and said under the table
{ const mn = managedRows.filter((r) => r.n !== "").map((r) => r.n); if (mn.slice(0, 3).join() !== "1,2,3" || new Set(mn).size !== mn.length) bad.push("the managed Getting started numbers aren't 1, 2, 3, or a managed number is used twice"); }
const managedGap = (() => { const mn = managedRows.filter((r) => r.n !== "").map((r) => r.n); const gaps = mn.filter((n, i) => i && n !== mn[i - 1] + 1); return gaps.length ? `The live managed portal prints ${mn.join(", ")}: after Getting started the numbers jump to ${gaps[0]} (Month 1 work has no number). Renumbering is Chris's call.` : ""; })();
if (bad.length) { console.error(`🔴 the step map came out wrong, the old one stays:\n${bad.map((b) => `   · ${b}`).join("\n")}`); process.exit(1); }

// planned work, so a proposal can't be forgotten and its effect on the numbers is written down before anything moves
let proposed = [];
// audit 10-31 low 41: a missing file is "none"; a malformed one is a failure, or the planned work would vanish from the page
const proposedPath = `${SITE}/reports/steps/proposed.json`;
if (fs.existsSync(proposedPath)) {
  try { proposed = JSON.parse(fs.readFileSync(proposedPath, "utf8")); if (!Array.isArray(proposed)) throw new Error("not a list"); }
  catch (e) { console.error(`🔴 reports/steps/proposed.json can't be read (${e.message}), so the step map was not rebuilt`); process.exit(1); }
}
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const adminLabel = (c) => (c.admin == null ? "" : `${c.adminMonth === "month1" ? "" : "Monthly "}${c.admin}`);
const md = `---
name: reference_all_steps_map
description: "GENERATED daily (scraper scripts/build-step-map.mjs): every step in both portals, with the number each portal really prints and what the step is. Admin numbers read off the live checklist. USE THIS, never a remembered number. Chris 10-31: 'we need all steps for client and portal saved and shown what each is'."
metadata:
  type: reference
---
**GENERATED ${stamp}. Do not edit by hand.** Say "ADMIN PORTAL step N" / "CLIENT PORTAL step N" from these tables. Page for Chris: https://claude.ai/artifact/LJpj2Pd7AkazqXrFnRqgjQ. Steps fingerprint: \`${stepMapPrint(play)}\`.

## Approved, not built yet (no number until built)
| What | Where | Effect on numbers | Mockup |
|---|---|---|---|
${proposed.map((x) => `| ${x.name} | ${x.where} | ${x.numbers} | ${x.url} |`).join("\n")}

## Client portal
| Client step | Title | What it does | Admin step | id |
|---|---|---|---|---|
${client.map((c) => `| ${c.n} | ${c.label} | ${c.what.replace(/\|/g, "/")} | ${adminLabel(c)} | \`${c.id}\` |`).join("\n")}

## Client portal, no number
| Client portal shows | What it does | Admin step | id |
|---|---|---|---|
${clientUnnumbered.map((c) => `| ${c.label} | ${c.what.replace(/\|/g, "/")} | ${c.admin ? adminLabel(c) : "none"} | \`${c.id}\` |`).join("\n")}

## Managed client portal (live: RGA's clients default to managed, setup_vs_month1_v1 11-10)
| Managed step | Title | Where it is | Self-serve client step | id |
|---|---|---|---|---|
${managedRows.map((r) => `| ${r.n} | ${r.label} | ${r.becomes} | ${r.today} | \`${r.id}\` |`).join("\n")}
${managedGap ? `\n${managedGap}\n` : ""}

## Admin portal · Month 1
| Admin step | Title | What it does | Who | Client step | id |
|---|---|---|---|---|---|
${month1.map((a) => `| ${a.n} | ${a.title} | ${a.what.replace(/\|/g, "/")} | ${a.who} | ${a.client ?? ""} | \`${a.id}\` |`).join("\n")}

## Admin portal · Monthly
Numbered by the live page's rule: ${monthlyRule ? monthlyRule.name : "unknown"}.

| Admin step | Title | What it does | Who | Client step | id |
|---|---|---|---|---|---|
${monthly.map((a) => `| ${a.n} | ${a.title} | ${a.what.replace(/\|/g, "/")} | ${a.who} | ${a.client ?? ""} | \`${a.id}\` |`).join("\n")}
`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const table = (cols, rs) => `<div class="tw"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rs.map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="n"' : ""}>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const html = `<title>RGA Step Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
:root{--bg:#f1f2f4;--paper:#fff;--ink:#303030;--mut:#616161;--line:#e3e3e3;--acc:#2457e6;--soft:#f6f6f7}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#12151b;--paper:#1a1f27;--ink:#e8ebf1;--mut:#a2a9b6;--line:#2c333e;--acc:#7aa2ff;--soft:#20262f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12151b;--paper:#1a1f27;--ink:#e8ebf1;--mut:#a2a9b6;--line:#2c333e;--acc:#7aa2ff;--soft:#20262f;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.5 "Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding-block:32px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:22px}
.k{font-weight:700;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--acc)}h1{margin:8px 0 6px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.02em;text-wrap:balance}.lede{margin:0;color:var(--mut);max-width:70ch}
section{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px;display:grid;gap:12px;min-width:0}h2{margin:0;font-size:19px;font-weight:700}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}.n{font-weight:700;font-variant-numeric:tabular-nums}a{color:var(--acc)}small{display:block;color:var(--mut);font-size:12.5px;max-width:60ch}
</style>
<div class="wrap"><header><div class="k">Both portals · updated ${esc(stamp)}</div><h1>Every step, by the number each portal shows</h1><p class="lede">Admin numbers are read off the live checklist. The list rebuilds each morning and after any step change, and a check fails if it falls behind.</p></header>
<section><h2>Approved, not built yet</h2><p class="lede">None of these has a number yet. A new step gets its number when it's built, and then this page updates itself.</p>${table(["What", "Where", "Effect on numbers"], proposed.map((x) => [`<a href="${esc(x.url)}">${esc(x.name)}</a>`, esc(x.where), esc(x.numbers)]))}</section>
<section><h2>Client portal (${client.length} steps)</h2>${table(["Client step", "What it is", "Admin step"], client.map((c) => [c.n, `${esc(c.label)}${c.what ? `<small>${esc(c.what)}</small>` : ""}`, esc(adminLabel(c))]))}</section>
<section><h2>Client portal, no number (${clientUnnumbered.length} cards)</h2><p class="lede">The client sees these too, as approvals, asks or standing cards. They carry no step number.</p>${table(["Client portal shows", "Admin step"], clientUnnumbered.map((c) => [`${esc(c.label)}${c.what ? `<small>${esc(c.what)}</small>` : ""}`, c.admin ? esc(adminLabel(c)) : "none"]))}</section>
<section><h2>Managed client portal (${managedRows.filter((r) => r.n !== "").length} numbered)</h2><p class="lede">Live: RGA's clients see this portal. Getting started is numbered 1 to 3; Month 1 work is a line in the Month 1 card on Ongoing work with no number.${managedGap ? ` ${esc(managedGap)}` : ""}</p>${table(["Managed step", "What it is", "Where it is", "Self-serve step"], managedRows.map((r) => [r.n, esc(r.label), esc(r.becomes), esc(r.today)]))}</section>
<section><h2>Admin portal · Month 1 (${month1.length} steps)</h2>${table(["Admin step", "Title and what it does", "Who", "Client step"], month1.map((a) => [a.n, `${esc(a.title)}${a.what ? `<small>${esc(a.what)}</small>` : ""}`, esc(a.who), a.client ?? ""]))}</section>
<section><h2>Admin portal · Monthly (${monthly.length} steps)</h2>${table(["Admin step", "Title and what it does", "Who", "Client step"], monthly.map((a) => [a.n, `${esc(a.title)}${a.what ? `<small>${esc(a.what)}</small>` : ""}`, esc(a.who), a.client ?? ""]))}</section>
</div>
`;
fs.mkdirSync(path.dirname(HTML), { recursive: true });
fs.writeFileSync(HTML, html);
fs.writeFileSync(MEMORY, md);
console.log(`✅ step map: ${client.length} client, ${month1.length} admin Month 1, ${monthly.length} admin Monthly → ${path.basename(MEMORY)}`);
