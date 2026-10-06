#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — AN ARROW POINTS THE WAY THE CONTENT ACTUALLY MOVES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02, on the output fold: *"on the open full the arrow makes it look like it will
 * open in a new tab. can you make the arrow a down arrow for all these."*
 *
 * `↗` is the stamp for LEAVING OUR ORIGIN — it is how a control promises a new tab. "Open full"
 * never left: it expands the preview in place, which admin.js's own comment above the handler
 * already said ("the fold is a preview of something already on the page, not a door to somewhere
 * else"). The glyph contradicted the code beside it.
 * → feedback_an_action_that_leaves_our_origin_must_stamp_itself
 *
 * 🔑 THE RULE, NOT THE THREE INSTANCES: every `↗` in emitted markup must sit on something that
 * genuinely leaves. Each one is REGISTERED below, so a new `↗` on an in-place control fails this
 * gate until someone says which it is. → feedback_fix_the_class_not_the_instance
 *
 * Exit 0 pass · 1 an arrow promises something the control does not do · 2 could not run.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W = `${__SITE}/`;
let src, html, portal;
try {
  src = fs.readFileSync(W + "admin/admin.js", "utf8");
  html = fs.readFileSync(W + "admin/index.html", "utf8");
  portal = fs.readFileSync(W + "portal/portal.js", "utf8");
} catch { console.error("⛔ cannot read the sources"); process.exit(2); }

const fail = [];

// ═══ PART 1 — THE EXPAND CONTROL POINTS DOWN, AND REVERSES ═══════════════════════════════════
if (/Open full ↗/.test(src)) fail.push('"Open full" is stamped ↗ again — it expands in place and never leaves');
const outFull = (src.match(/>Open full ↓<\/button>/g) || []).length;
if (outFull !== 2) fail.push(`expected 2 "Open full ↓" controls in the output fold, found ${outFull}`);
if (!/btn\.textContent = full \? "Show less ↑" : "Open full ↓";/.test(src)) {
  fail.push("the expand toggle no longer points down when collapsed and up when open");
}
// 🔴 The ternary it replaced had two IDENTICAL branches — a choice that could not choose.
if (/\? "Open full [^"]*" : "Open full [^"]*"/.test(src)) fail.push("the expand label is back to a ternary whose branches are the same");

// ═══ PART 2 — EVERY REMAINING ↗ IS ON SOMETHING THAT LEAVES ══════════════════════════════════
// 🔑 Registered by what the control IS. An unregistered ↗ fails rather than being assumed correct.
const LEAVES = [
  { needle: 'open.textContent = "Open ↗"', why: "a cs-linkopen anchor with target=_blank" },
  { needle: ">View as client ↗</a>", why: "an anchor to the client report" },
  { needle: ">Join the call ↗</a>", why: "the Meet link, target=_blank" },
  { needle: ">Their website ↗</a>", why: "the client's site, target=_blank" },
  { needle: ">Join Meet ↗</a>", why: "the Meet link, target=_blank" },
  { needle: "${label} ↗</a>", why: "a linkified URL in stored output, target=_blank" },
];
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
let checked = 0;
src.split("\n").forEach((l, i) => {
  if (!l.includes("↗") || isComment(l)) return;
  const hit = LEAVES.find((x) => l.includes(x.needle));
  if (!hit) {
    fail.push(`admin/admin.js:${i + 1} stamps ↗ and is not registered as leaving our origin: ${l.trim().slice(0, 72)}`);
    return;
  }
  checked++;
});
for (const x of LEAVES) {
  if (!src.includes(x.needle)) fail.push(`a registered leaving-control is gone (${x.why}) — update the registry rather than leaving it stale`);
}

// 🔴 And an anchor that carries ↗ must actually open elsewhere. The two inline anchors declare it
// on the same line; the DOM-built one sets it two lines above, so check its block.
for (const [needle, want] of [[">Join the call ↗</a>", 'target="_blank"'], [">Their website ↗</a>", 'target="_blank"'],
  [">Join Meet ↗</a>", 'target="_blank"'], ["${label} ↗</a>", 'target="_blank"']]) {
  const line = src.split("\n").find((l) => l.includes(needle));
  if (line && !line.includes(want)) fail.push(`${needle.replace(/[<>/]/g, "")} carries ↗ but no ${want} on its own line`);
}
const csBlock = src.slice(src.indexOf("const open = document.createElement"), src.indexOf('open.textContent = "Open ↗"') + 40);
if (!/open\.target = "_blank"/.test(csBlock)) fail.push('the "Open ↗" link no longer sets target=_blank');

// ═══ PART 3 — AND NOWHERE ELSE INVENTS ONE ═══════════════════════════════════════════════════
portal.split("\n").forEach((l, i) => {
  if (!l.includes("↗") || isComment(l)) return;
  if (!/target="_blank"|targ/.test(l)) fail.push(`portal/portal.js:${i + 1} stamps ↗ without opening elsewhere`);
});
html.split("\n").forEach((l, i) => {
  if (!l.includes("↗")) return;
  if (!/target="_blank"/.test(l)) fail.push(`admin/index.html:${i + 1} stamps ↗ without target=_blank`);
});

if (fail.length) {
  console.error("🔴 an arrow does not point the way the content moves:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ ↗ only where the control leaves (${checked} registered) · the output fold expands with ↓ and collapses with ↑`);
