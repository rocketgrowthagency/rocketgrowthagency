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

const admin = rows.map((r) => {
  const d = defs.get(r.id) || {};
  const who = (/(You \+ client|Runs itself|Client|You)\s*$/.exec(String(r.title || "")) || [])[1] || whoOf(d);
  return { n: r.n, id: r.id, title: clean(r.title) || d.title || r.id, who, client: d.clientStepNo || null, clientLabel: d.clientLabel || null, month: d.month || (String(r.id).startsWith("m1.") ? "month1" : "month2plus") };
});
const month1 = admin.filter((a) => a.month === "month1");
const monthly = admin.filter((a) => a.month !== "month1");
const client = [...defs.values()].filter((d) => d.clientStepNo).sort((a, b) => a.clientStepNo - b.clientStepNo).map((d) => {
  const a = admin.find((x) => x.id === d.id);
  return { n: d.clientStepNo, id: d.id, label: d.clientLabel || d.title, what: say(d.clientWhy || d.clientHint || ""), admin: a ? a.n : null, adminMonth: a ? a.month : null };
});

// a map that came out wrong must not replace one that's right
const bad = [];
const nums = month1.map((a) => a.n);
if (month1.length < 40) bad.push(`only ${month1.length} Month 1 rows`);
if (new Set(nums).size !== nums.length || nums.some((n, i) => Number(n) !== i + 1)) bad.push("the Month 1 numbers don't run 1, 2, 3 in order");
if (!month1.some((a) => a.id === "m1.gbp.photos")) bad.push("the photo step isn't in the Month 1 rows");
if (client.length < 10 || client.some((c, i) => c.n !== i + 1)) bad.push("the client numbers don't run 1, 2, 3 in order");
if (bad.length) { console.error(`🔴 the step map came out wrong, the old one stays:\n${bad.map((b) => `   · ${b}`).join("\n")}`); process.exit(1); }

// planned work, so a proposal can't be forgotten and its effect on the numbers is written down before anything moves
let proposed = [];
try { proposed = JSON.parse(fs.readFileSync(`${SITE}/reports/steps/proposed.json`, "utf8")); } catch { /* none */ }
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const adminLabel = (c) => (c.admin == null ? "" : `${c.adminMonth === "month1" ? "" : "Monthly "}${c.admin}`);
const md = `---
name: reference_all_steps_map
description: "GENERATED daily (scraper scripts/build-step-map.mjs): every step in both portals, with the number each portal really prints and what the step is. Admin numbers read off the live checklist. USE THIS, never a remembered number. Chris 10-31: 'we need all steps for client and portal saved and shown what each is'."
metadata:
  type: reference
---
**GENERATED ${stamp}. Do not edit by hand.** Say "ADMIN PORTAL step N" / "CLIENT PORTAL step N" from these tables. Page for Chris: https://claude.ai/artifact/LJpj2Pd7AkazqXrFnRqgjQ

## Approved, not built yet (no number until built)
| What | Where | Effect on numbers | Mockup |
|---|---|---|---|
${proposed.map((x) => `| ${x.name} | ${x.where} | ${x.numbers} | ${x.url} |`).join("\n")}

## Client portal
| Client step | What it is | Admin step | id |
|---|---|---|---|
${client.map((c) => `| ${c.n} | ${c.label} | ${adminLabel(c)} | \`${c.id}\` |`).join("\n")}

## Admin portal · Month 1
| Admin step | What it is | Who | Client step | id |
|---|---|---|---|---|
${month1.map((a) => `| ${a.n} | ${a.title} | ${a.who} | ${a.client ?? ""} | \`${a.id}\` |`).join("\n")}

## Admin portal · Monthly
| Admin step | What it is | Who | Client step | id |
|---|---|---|---|---|
${monthly.map((a) => `| ${a.n} | ${a.title} | ${a.who} | ${a.client ?? ""} | \`${a.id}\` |`).join("\n")}
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
<div class="wrap"><header><div class="k">Both portals · updated ${esc(stamp)}</div><h1>Every step, by the number each portal shows</h1><p class="lede">Admin numbers are read off the live checklist. The list rebuilds each morning, so it can't drift from what's on screen.</p></header>
<section><h2>Approved, not built yet</h2><p class="lede">None of these has a number yet. A new step gets its number when it's built, and then this page updates itself.</p>${table(["What", "Where", "Effect on numbers"], proposed.map((x) => [`<a href="${esc(x.url)}">${esc(x.name)}</a>`, esc(x.where), esc(x.numbers)]))}</section>
<section><h2>Client portal (${client.length} steps)</h2>${table(["Client step", "What it is", "Admin step"], client.map((c) => [c.n, `${esc(c.label)}${c.what ? `<small>${esc(c.what)}</small>` : ""}`, esc(adminLabel(c))]))}</section>
<section><h2>Admin portal · Month 1 (${month1.length} steps)</h2>${table(["Admin step", "What it is", "Who", "Client step"], month1.map((a) => [a.n, esc(a.title), esc(a.who), a.client ?? ""]))}</section>
<section><h2>Admin portal · Monthly (${monthly.length} steps)</h2>${table(["Admin step", "What it is", "Who", "Client step"], monthly.map((a) => [a.n, esc(a.title), esc(a.who), a.client ?? ""]))}</section>
</div>
`;
fs.mkdirSync(path.dirname(HTML), { recursive: true });
fs.writeFileSync(HTML, html);
fs.writeFileSync(MEMORY, md);
console.log(`✅ step map: ${client.length} client, ${month1.length} admin Month 1, ${monthly.length} admin Monthly → ${path.basename(MEMORY)}`);
