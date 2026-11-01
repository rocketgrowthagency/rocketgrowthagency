#!/usr/bin/env node
// check-the-step-map-is-current.mjs — the sheet of every step in both portals matches the steps that exist (Chris 11-1: "when you add anything or update you check this and then update it ... we can never get numbering wrong").
// 🔴 WHY: the sheet rebuilt each morning, so a step added at night read wrong until then, and nothing failed. On 11-1 a new Month 1 step moved the numbers while the sheet still showed the old ones.
// HOLDS, from files only, so it costs the clients' database nothing: the sheet was built from the steps as they are now (a fingerprint of everything it shows or that moves a number, so a move or a rename is caught too);
// every step is on the sheet; nothing on the sheet has left the playbook; the admin numbers run 1, 2, 3; every client number is the playbook's clientStepNo; a step shows what it does; and the build reads the numbers off the page, not a typed table.
// The admin's order is worked out on the page, not in the playbook, so a change to that sort alone shows up at the next morning's rebuild, not here.
// Exit 0 = current · 1 = stale, rebuild with build-step-map.mjs and republish the page · 2 = can't tell.
import fs from "node:fs";
import os from "node:os";
import { stepMapPrint } from "./lib/step-map-print.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MAP = process.env.STEP_MAP_MEMORY || `${os.homedir()}/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory/reference_all_steps_map.md`;
const F = [], fail = (m) => F.push(m);
let play, md;
let what;
try { play = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8")); what = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/what-it-does.json`, "utf8")); md = fs.readFileSync(MAP, "utf8"); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.message).slice(0, 120)}`); process.exit(2); }
const defs = new Map();
for (const [month, list] of Object.entries(play)) for (const s of list.steps || list) if (s && s.id) defs.set(s.id, { ...s, month });
const rows = [...md.matchAll(/^\|(.+)\|\s*`([a-z0-9_.]+)`\s*\|\s*$/gm)].map((m) => ({ cells: m[1].split("|").map((c) => c.trim()), id: m[2] }));
if (rows.length < 50) { console.error(`⚠️  INDETERMINATE: only ${rows.length} rows on the sheet`); process.exit(2); }
const sections = md.split(/^## /m);
const part = (re) => { const s = sections.find((x) => re.test(x.split("\n")[0])) || ""; return [...s.matchAll(/^\|(.+)\|\s*`([a-z0-9_.]+)`\s*\|\s*$/gm)].map((m) => ({ cells: m[1].split("|").map((c) => c.trim()), id: m[2] })); };
const client = part(/client/i), m1 = part(/month 1/i), mo = part(/monthly/i);
if (!client.length || !m1.length || !mo.length) { console.error("⚠️  INDETERMINATE: the sheet's sections moved"); process.exit(2); }
if (!md.includes(`Steps fingerprint: \`${stepMapPrint(play)}\``)) fail("the steps changed after the sheet was built");
if (!/\| Admin step \| Title \| What it does \|/.test(md) || !/\| Client step \| Title \| What it does \|/.test(md)) fail("the sheet has no What it does column");
const onSheet = new Set([...m1, ...mo].map((r) => r.id));
for (const r of [...m1, ...mo]) {
  if (!defs.has(r.id)) { fail(`${r.id} is on the sheet but no longer in the playbook`); continue; }
  const d = defs.get(r.id), names = [d.title, d.clientLabel].map((x) => String(x || "").replace(/\s+/g, " ").trim()).filter(Boolean);   // the row prints the step's title, or the client's wording of it
  if (names.length && !names.some((t) => r.cells[1].includes(t) || t.includes(r.cells[1]))) fail(`${r.id}: the sheet says "${r.cells[1]}", the step says "${names[0]}"`);
  if (!what.admin[r.id]) fail(`admin step ${r.cells[0]} (${r.id}) doesn't say what it does: add it to data/playbooks/what-it-does.json`);
  else if (r.cells[2] !== what.admin[r.id]) fail(`admin step ${r.cells[0]} (${r.id}): the sheet's description is out of date`);
}
for (const list of [m1, mo]) list.forEach((r, i) => { if (Number(r.cells[0]) !== i + 1) fail(`the sheet's numbers don't run in order at ${r.id}: ${r.cells[0]}, expected ${i + 1}`); });
for (const [id, d] of defs) if (!onSheet.has(id)) fail(`${id} ("${d.title}") is in the playbook but not on the sheet`);
for (const r of client) { const d = defs.get(r.id); if (!d || Number(d.clientStepNo) !== Number(r.cells[0])) fail(`client step ${r.cells[0]} (${r.id}) is ${d ? `number ${d.clientStepNo}` : "gone"} in the playbook`); }
for (const r of client) { if (!what.client[r.id]) fail(`client step ${r.cells[0]} (${r.id}) doesn't say what it does: add it to data/playbooks/what-it-does.json`); else if (r.cells[2] !== what.client[r.id]) fail(`client step ${r.cells[0]} (${r.id}): the sheet's description is out of date`); }
for (const part of ["admin", "client"]) for (const id of Object.keys(what[part])) if (!defs.has(id) || (part === "client" && !defs.get(id).clientStepNo)) fail(`what-it-does.json describes ${id} as a ${part} step, and it isn't one`);
for (const [id, d] of defs) if (d.clientStepNo && !client.some((r) => r.id === id)) fail(`client step ${d.clientStepNo} (${id}) isn't on the sheet`);
// "Approved, not built yet" on the sheet: a step that has a number has been built, so it comes off that list
let proposed = [];
try { proposed = JSON.parse(fs.readFileSync(`${SITE}/reports/steps/proposed.json`, "utf8")); } catch { /* no list, nothing to compare */ }
for (const x of proposed) { const hit = [...m1, ...mo, ...client].find((r) => r.cells[1] === x.name); if (hit) fail(`"${x.name}" is listed as not built, and it's step ${hit.cells[0]}: take it off reports/steps/proposed.json`); }
const B = fs.readFileSync(process.env.SCRAPER_COPY_DIR ? `${process.env.SCRAPER_COPY_DIR}/scripts/build-step-map.mjs` : new URL("./build-step-map.mjs", import.meta.url), "utf8");
if (!/_probe-numbering\.mjs/.test(B)) fail("the sheet no longer reads its numbers off the page");
if (!/WHAT\.admin\[r\.id\]/.test(B) || !/WHAT\.client\[d\.id\]/.test(B)) fail("the sheet no longer says what each step does");
if (F.length) { console.error(`🔴 the step sheet is out of date — ${F.length}:\n${F.slice(0, 12).map((x) => `   · ${x}`).join("\n")}\n   Run: node scripts/build-step-map.mjs, then republish the page.`); process.exit(1); }
console.log(`✅ the step sheet is current: ${client.length} client, ${m1.length} admin Month 1, ${mo.length} admin Monthly, each with what it does`);
