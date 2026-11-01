#!/usr/bin/env node
// check-a-tick-never-sits-on-nothing.mjs — approved client_step12_forms_v1 (11-01): step 12 is named for its result, and a tick never sits on a zero.
// RUNS rcRow (lifted from portal.js): a row with a tick whose value is "None yet", "None", "Not yet" or a zero ("0 form sends", "0") comes out with NO tick;
// a real number ("3 submissions", "10 submissions", "0.5 average"), "Yes" and "Tracked" keep theirs; a non-tick marker ("RGA") is untouched.
// READS: step 12's client label is "Count the leads from your website form" in all three places it lives (playbooks.json, client-steps.json, _actor-map.mjs),
// the old name is gone, the step id is unchanged, the quiet-month card says "0 form sends", and the tick is dropped by rcRow itself, so a new row cannot forget.
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR ? `${process.env.SCRAPER_COPY_DIR}` : "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (r, base = SITE) => { try { return fs.readFileSync(`${base}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js");
const a = P.indexOf("const rcRow"), b = P.indexOf("const _rcEditing");
if (a < 0 || b < a) { console.error("⚠️  INDETERMINATE — rcRow moved"); process.exit(2); }
const ctx = vm.createContext({ escapeHtml: (s) => String(s) });
vm.runInContext(`${P.slice(a, b)}\nthis.rc = rcRow;`, ctx);
const ticked = (v, st = ["ok", "✓"]) => ctx.rc("Row", st, v).includes("✓");
for (const v of ["None yet<small>a quiet month is normal</small>", "None yet", "none", "Not yet", "0 form sends", "0 sends", "0", "0 submissions", " 0 form sends"]) if (ticked(v)) fail(`a tick sits on nothing: "${v}"`);
for (const v of ["3 submissions", "10 submissions", "1 submission", "Yes", "Tracked", "0.5 average", "05", "Arrived in your inbox Nov 2", "Nonetheless fine"]) if (!ticked(v)) fail(`a real value lost its tick: "${v}"`);
if (!ctx.rc("Row", ["rga", "RGA"], "Not yet<small>RGA is marking it</small>").includes(">RGA<")) fail("the RGA marker on a not-yet row was changed");
const label = "Count the leads from your website form";
const pj = JSON.parse(read("data/playbooks/playbooks.json")), cj = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (j) => { const arr = Array.isArray(j) ? j : j.steps || j.playbook || Object.values(j).flat?.() || []; const walk = (x) => Array.isArray(x) ? x.flatMap(walk) : x && typeof x === "object" ? (x.id === "m1.tracking.form_setup" ? [x] : Object.values(x).flatMap(walk)) : []; return walk(j); };
for (const [where, j] of [["playbooks.json", pj], ["client-steps.json", cj]]) { const s = find(j); if (s.length !== 1) fail(`${where} has ${s.length} entries for m1.tracking.form_setup (expected one)`); else if (s[0].clientLabel !== label) fail(`${where} names step 12 "${s[0].clientLabel}", not "${label}"`); }
const am = read("flow/playbooks/_actor-map.mjs", SCR);
if (!am.includes(`"m1.tracking.form_setup":  { actor: "both",   clientLabel: "${label}"`)) fail("_actor-map.mjs names step 12 differently from the playbook");
for (const [where, t] of [["playbooks.json", read("data/playbooks/playbooks.json")], ["client-steps.json", read("data/playbooks/client-steps.json")], ["_actor-map.mjs", am], ["portal.js", P]]) if (/Allow form tracking on your website/.test(t)) fail(`${where} still says "Allow form tracking on your website"`);
if (!/rcRow\("Last 30 days", \["ok", "✓"\], "0 form sends"\)/.test(P) || /"0 sends"/.test(P)) fail("the quiet-month card does not say \"0 form sends\"");
if (/[—–]/.test("Count the leads from your website form 0 form sends")) fail("a dash in the new copy");
if (F.length) { console.error(`🔴 step 12's name or its ticks regressed — ${F.length}:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ step 12 is \"Count the leads from your website form\" everywhere it lives, and a tick never sits on \"None yet\" or a zero");
