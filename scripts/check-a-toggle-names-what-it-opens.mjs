#!/usr/bin/env node
// check-a-toggle-names-what-it-opens.mjs — 2026-10-22, approved step_toggle_labels_v1 (Chris: "the view/hide needs to say what it
// is that it will open… not just a blank view" + "make hello@rocketgrowthagency.com stand out"). Pins, in the client portal:
//   · every row toggle takes its words from ONE table (DETAIL_LABEL) by the step's state — never a bare "View →" / "Hide ↑"
//   · ▾ closed / ▴ open (it opens in place); the panel strip says the same words as the button
//   · every email in a step's instructions is the tap-to-copy chip — RUNS emailChips (text replaced, never inside a tag)
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let P; try { P = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read portal.js"); process.exit(2); }
const code = P.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const F = [], fail = (m) => F.push(m);
for (const old of ["View →", "Show me how →", "What this is →", "\"Hide ↑\""]) if (code.includes(old)) fail(`a row toggle says "${old.replace(/"/g, "")}" again (it must name what it opens)`);
const lab = P.match(/^const DETAIL_LABEL = \{[\s\S]*?\};$/m);
if (!lab) { console.error("⚠️  DETAIL_LABEL moved"); process.exit(2); }
let L; try { L = new Function(`${lab[0]}; return DETAIL_LABEL;`)(); } catch (e) { console.error(`⚠️  DETAIL_LABEL won't run: ${e.message}`); process.exit(2); }
for (const k of ["do", "done", "rga", "verify"]) if (!L[k] || !L[k][0] || !/^Hide /.test(L[k][1] || "") || L[k][1].slice(5).toLowerCase() !== L[k][0].toLowerCase()) fail(`the "${k}" toggle's open label doesn't name what it hides ("${L[k] && L[k][1]}")`);
// 🔄 10-23 night (approved how_this_step_works_fold_v1): the toggle is now the card's last FOLD LINE — its words still come from
// DETAIL_LABEL (the state names what it opens), and no row draws a top toggle button any more
if (!/<details class="pm-k5-fold pm-how-fold" data-how-fold="\$\{escapeAttribute\(step\.id\)\}"><summary>\$\{PC_DOWN\}\$\{escapeHtml\(DETAIL_LABEL\[detailKind\]\[0\]\)\}<\/summary>/.test(P)) fail("the how-to fold line doesn't take its words from DETAIL_LABEL");
if (/<button class="pm-act[^"]*" data-toggle-detail=/.test(code)) fail("a row draws the old top toggle button again (the how-to is the card's last fold line)");
if (!/howHtml\(step\.clientInstructions, step\.id, step\.clientLabel, DETAIL_LABEL\[detailKind\]\[0\]\)/.test(P)) fail("the fold doesn't open the step's own instructions");
const ec = P.match(/^const emailChips = [\s\S]*?\);$/m);
if (!ec) { console.error("⚠️  emailChips moved"); process.exit(2); }
let chips; try { chips = new Function(`${ec[0]}; return emailChips;`)(); } catch (e) { console.error(`⚠️  emailChips won't run: ${e.message}`); process.exit(2); }
const a = chips("<p>Invite hello@rocketgrowthagency.com as a user.</p>");
if (!/data-copy-email="hello@rocketgrowthagency\.com"/.test(a) || !/class="pm-ax-copy pm-em-chip"/.test(a)) fail("an email in the instructions isn't the copy chip");
const b = chips('<a title="ops@acme.com">Ask ops@acme.com</a>');
if (/title="<button/.test(b) || !/data-copy-email="ops@acme\.com"/.test(b)) fail("emailChips rewrites inside a tag (or misses the text)");
if (!/\$\{emailChips\(body\)\}/.test(P)) fail("the instructions body isn't run through emailChips");
if (!/\.pm-em-chip \{[^}]*font-weight:700/.test(fs.readFileSync(`${SITE}/portal/portal.css`, "utf8"))) fail("the email chip doesn't stand out (bold, control blue)");
if (F.length) { console.error("🔴 a toggle or an email regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ every row toggle names what it opens (4 states, ▾/▴, the strip matches) · every email in a step's instructions is the copy chip (run, never inside a tag)");
