#!/usr/bin/env node
// check-step-7-hours-editor-v2.mjs — client step 7's hours EDITOR on the card system (approved client_step07_hours_editor_v2,
// Chris 10-30 "aproved"; V1 = reports/mockups/v1-live/client_step07_hours_editor_v1_live.png).
// Pins: the Set hours / By appointment choice FIRST as two options (RGA recommends Set hours); "Set hours" only ever turns By
// appointment OFF; choosing By appointment shows what it costs (no hours on Google, out of "open now") before saving and hides the
// week AND its copy link; the holidays heading counts what's picked live; closed days say "—" instead of empty time boxes; on a phone
// each day stacks (the time boxes were cut to "09:"). The save path is untouched: it still reads [data-in-appt].on.
// Exit 0 = holds · 1 = drifted · 2 = moved (indeterminate). → project_client_card_system
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const js = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"), css = fs.readFileSync(`${SITE}/portal/portal.css`, "utf8");
const at = js.indexOf('} else if (s.kind === "hours") {');
if (at < 0) { console.error("⚠️  INDETERMINATE — the hours editor (s.kind === \"hours\") moved"); process.exit(2); }
const ed = js.slice(at, js.indexOf('} else if (s.kind === "booking")', at));
const fail = [];
if (!/const csh = CS_STEPS\.has\(step\.id\)/.test(ed)) fail.push("the editor no longer asks whether step 7 is on the card system");
if (!/data-in-appt-off role="radio"[^`]*RGA recommends<\/span><b>Set hours<\/b>/.test(ed)) fail.push("\"Set hours\" (RGA recommends) isn't the first option");
if (!/class="pm-in-o pm-in-appt\$\{appt \? " on" : ""\}" data-in-appt role="radio"/.test(ed)) fail.push("\"By appointment only\" isn't the second option carrying data-in-appt (the save reads [data-in-appt].on)");
if (!/data-in-apptnote\$\{appt \? "" : " hidden"\}><span><b>Google will show no opening hours\.<\/b>[^<]*open now/.test(ed)) fail.push("choosing By appointment no longer says what it costs (no hours, out of \"open now\")");
if (!/data-hol-count>\$\{\(had\?\.holidays \|\| \[\]\)\.length\}<\/span> picked/.test(ed)) fail.push("the holidays heading doesn't count what's picked");
if (!/csh \? `<span class="pm-in-shut"/.test(ed)) fail.push("a closed day lost its \"—\" (the empty time boxes come back)");
if (!/const apOff = t\.closest\("\[data-in-appt-off\]"\);\s*if \(apOff\) \{[^}]*if \(a && a\.classList\.contains\("on"\)\) \{ a\.classList\.remove\("on"\)/.test(js)) fail.push("\"Set hours\" no longer turns By appointment OFF (or it can turn it on)");
if (!/function hoursApptSync\(wrap\) \{[\s\S]{0,400}n\.hidden = !on;/.test(js)) fail.push("the options and the cost note don't follow the saved flag (hoursApptSync)");
if (!/toggle\("is-appt", on\); hoursApptSync\(wrap\); return; \}/.test(js)) fail.push("the By appointment toggle doesn't sync the options + note");
if (!/if \(hc\) hc\.textContent = String\(tick\.closest\("\.pm-in-ticks"\)\.querySelectorAll\("\[data-in-hol\]\.on"\)\.length\)/.test(js)) fail.push("ticking a holiday doesn't update the picked count");
if (!/\.pm-in-hours\.is-appt ~ \.pm-in-copy \{ display:none; \}/.test(css)) fail.push("By appointment leaves \"Copy Monday to Tue–Fri\" showing (the old + selector never matched)");
if (!/\.pm-cs \.pm-in-day\.is-closed > \[data-in-open\], \.pm-cs \.pm-in-day\.is-closed > \[data-in-close\]/.test(css)) fail.push("a closed day shows its empty time boxes again");
if (!/@media \(max-width:560px\) \{\s*\/\*[^*]*\*\/\s*\.pm-cs \.pm-in-how2 \{ grid-template-columns:minmax\(0,1fr\); \}\s*\.pm-cs \.pm-in-day \{ grid-template-columns:40px minmax\(0,1fr\); \}/.test(css)) fail.push("on a phone the day rows don't stack (the time boxes get cut to \"09:\")");
if (!/\.pm-cs \.pm-in-day > \.pm-in-second-add \{ grid-column:6; justify-self:start; \}/.test(css)) fail.push("\"+ 2nd time\" drifts across the row instead of sitting after the times");
if (fail.length) { console.log(`🔴 step 7's hours editor isn't the approved V2 — ${fail.length} problem(s):\n${fail.map((f) => `   · ${f}`).join("\n")}`); process.exit(1); }
console.log("✅ step 7's hours editor is the approved V2: Set hours (RGA recommends) / By appointment first, the cost said before saving, the week + copy link hidden by appointment, holidays counted live, closed days say —, phone rows stack");
