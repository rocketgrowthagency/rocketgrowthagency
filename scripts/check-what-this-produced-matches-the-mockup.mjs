#!/usr/bin/env node
// 🔴 AN UNCAUGHT NAVIGATION TIMEOUT EXITS 1, WHICH MEANS "THE PRODUCT IS BROKEN". Four browser
// gates threw in one sweep on 2026-10-08 purely because they ran concurrently against the live
// admin. `nav` exits 2 and names the navigation it could not complete.
// → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_a_flaky_gate_is_worse_than_a_failing_one
const { nav: _sharedNav } = await import("./_admin-session.mjs");
const navOrIndeterminate = (pg, url) => _sharedNav(pg, url, "a page this gate measures");
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — "WHAT THIS PRODUCED" MATCHES THE APPROVED MOCKUP, PROPERTY BY PROPERTY
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-01, comparing the live card to reports/mockups/admin_what_this_produced_v2.html:
 *   "these were supposed to be updated???? with the new mockup design? why did this not happen"
 *   "this mockup was meant for this on every card"
 *
 * Three things were wrong and none of them was a count:
 *   · the green "done" wash ran the FULL CARD, so the output needed its own white box to escape it.
 *     In the mockup the HEADER carries the tint and the body is white, and the note has no box.
 *   · a bullet CHARACTER was not a bullet — the list regex matched -, * and + but not `•`, so five
 *     lines of step 5's output rendered as five paragraphs. The wall in Chris's screenshot.
 *   · outShapes' closing-remark regex spanned block boundaries and wrapped a whole <ul> inside a
 *     <p>, leaving its rule on a LABEL after the browser re-parsed it.
 *
 * Renders the live admin signed in AND the mockup from disk in ONE browser, and diffs
 * getComputedStyle(). → feedback_how_design_work_gets_done_first_time
 *
 * 🔴 READ-ONLY. It opens phases and output disclosures; it never clicks Done / Skip / Reset.
 * Exit 0 pass · 1 the live render differs · 2 could not sign in / nothing rendered.
 */
// Property-by-property: the live "What this produced" vs the approved mockup, in one browser.
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W=`${__SITE}/`;
// ═══ PART 1 — THE SOURCE, before any browser ═══════════════════════════════════════════════════
// 🔴 The render half reads the DEPLOYED site, so a regression in the working tree would pass here
// until someone deploys it. These read the source, so the gate fails the moment the rule is undone.
{
  const css = fs.readFileSync(W + "admin/admin.css", "utf8");
  const js  = fs.readFileSync(W + "admin/admin.js", "utf8");
  const S = [
    ["the done tint is on the HEADER ROW, not the whole card",
      /\.ob-step\.done\s*\{[^}]*background:\s*var\(--admin-surface/.test(css)
      && /\.ob-step\.done\s*>\s*\.ob-row\s*\{[^}]*background:\s*#e6f2e6/i.test(css)],
    ["the note body has NO box — the mockup's .note-b is typography only",
      !/\.ob-out-body\s*\{[^}]*(padding|border|background)\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, ""))],
    ["a bullet CHARACTER is treated as a bullet",
      /const ul = t\.match\([^)]*\\u2022/.test(js)],
    // 🔴🔴 THE CARD FRAME, IN THE SOURCE. The render half reads the DEPLOYED page and is also the
    // flaky half — a load failure there is COULD-NOT-RUN, so it cannot be the only guard on the
    // regression Chris actually hit: steps inside a phase stripped of border, radius and gap.
    ["a step inside a phase keeps its frame",
      (() => {
        const m = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.ob-ph-b\s*>\s*\.ob-step\s*\{([^}]*)\}/);
        if (!m) return false;                       // the rule may be gone entirely, which is fine
        return !/border[a-z-]*\s*:\s*0|border-radius\s*:\s*0/.test(m[1]);
      })()],
    ["a step inside a phase keeps a gap before the next",
      (() => {
        const m = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.ob-ph-b\s*>\s*\.ob-step\s*\{([^}]*)\}/);
        if (!m) return true;                        // no rule means it keeps .ob-step's own margin
        const mm = m[1].match(/margin\s*:\s*([^;]+)/);
        if (!mm) return true;
        const parts = mm[1].trim().split(/\s+/);
        const bottom = parts.length === 1 ? parts[0] : parts.length === 2 ? parts[0] : parts[2];
        return parseFloat(bottom) >= 6;
      })()],
    ["the closing remark cannot swallow a block",
      /ob-out-why[\s\S]{0,80}/.test(js) && /\(\?!<\\\/\?\(\?:p\|ul\|ol/.test(js)],
  ];
  let sbad = 0;
  for (const [what, ok] of S) { console.log(`  ${ok ? "\u2705" : "\ud83d\udd34"} ${what}`); if (!ok) sbad++; }
  if (sbad) {
    console.log(`\n\ud83d\udd34 ${sbad} of the approved output rules are undone IN THE SOURCE — the live page is only still right because it has not been deployed.`);
    process.exit(1);
  }
}

const { default: puppeteer } = await import("puppeteer");
const MOCK=W+"reports/mockups/admin_what_this_produced_v2.html";
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY,SITE="https://www.rocketgrowthagency.com";
// 🔴 WITHOUT CREDENTIALS THIS THREW, AND A THROW IS NOT A FAILURE. The bare fetch below built the
// URL "undefined/rest/v1/clients?…" and the TypeError propagated — in the sweep that reads as the
// product being broken, which is how a real red signal gets ignored. Could-not-tell is exit 2.
// → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_a_flaky_gate_is_worse_than_a_failing_one
if(!U||!K){console.error("⚠️  INDETERMINATE — no Supabase credentials; cannot sign in to read the live card.");process.exit(2);}
let cid;
try{
  const rows=await (await fetch(`${U}/rest/v1/clients?archived_at=is.null&select=id&limit=1`,{headers:{apikey:K,Authorization:`Bearer ${K}`},signal:AbortSignal.timeout(20000)})).json();
  if(!Array.isArray(rows)||!rows[0]?.id){console.error("⚠️  INDETERMINATE — no unarchived client to render the card against.");process.exit(2);}
  cid=rows[0].id;
}catch(e){console.error(`⚠️  INDETERMINATE — could not reach Supabase: ${e.message}`);process.exit(2);}
const j=await (await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:"hello@rocketgrowthagency.com"})})).json();
const b=await puppeteer.launch({headless:"new",args:["--no-sandbox"]});
const read=(sel,props)=>{const el=document.querySelector(sel); if(!el)return null;
  const cs=getComputedStyle(el); const o={}; props.forEach(p=>o[p]=cs[p]); o.__t=(el.textContent||"").trim().slice(0,28); return o;};

const SPEC=[
 {name:"done header row",  mock:".row", live:".ob-step.done > .ob-row",
  props:["backgroundColor","borderBottomWidth","borderBottomStyle","display","alignItems"]},
 {name:"done card body",   mock:".body", live:".ob-step.done",
  props:["backgroundColor"]},
 {name:"the note body",    mock:".note-b", live:".ob-step.done .ob-out-body",
  props:["fontSize","lineHeight","color","marginTop","paddingTop","paddingLeft","borderTopWidth","backgroundColor"]},
 {name:"a note paragraph", mock:".note-b > p", live:".ob-step.done .ob-out-body > p",
  props:["marginBottom","maxWidth"]},
 {name:"a note list",      mock:".note-b ul, .note-b ol", live:".ob-step.done .ob-out-body ul, .ob-step.done .ob-out-body ol",
  props:["marginBottom","paddingLeft"]},
 {name:"a list item",      mock:".note-b li", live:".ob-step.done .ob-out-body li",
  props:["marginBottom"]},
 {name:"the provenance",   mock:".prov", live:".ob-step.done .ob-out-prov",
  props:["marginTop","color"]},
];
const mp=await b.newPage(); await mp.setViewport({width:1280,height:1000});
await mp.goto("file://"+MOCK,{waitUntil:"load",timeout:30000});
const want={}; for(const s of SPEC) want[s.name]=await mp.evaluate(read,s.mock,s.props);

const page=await b.newPage(); await page.setViewport({width:1280,height:1000});
const errs=[]; page.on("pageerror",e=>errs.push(e.message.split("\n")[0].slice(0,140)));
await navOrIndeterminate(page, j.action_link||j.properties.action_link);
await new Promise(r=>setTimeout(r,6000));
await navOrIndeterminate(page, `${SITE}/admin/?view=client&id=${cid}&tab=onboarding-v2`);
await new Promise(r=>setTimeout(r,15000));
await page.evaluate(()=>{document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach(x=>x.click());});
await new Promise(r=>setTimeout(r,1200));
await page.evaluate(()=>{document.querySelectorAll("details.ob-out:not([open]) > summary").forEach(x=>x.click());});
await new Promise(r=>setTimeout(r,1200));

const struct=await page.evaluate(()=>({
  outs:document.querySelectorAll(".ob-out").length,
  notes:document.querySelectorAll(".ob-out.note").length,
  docs:document.querySelectorAll(".ob-out.doc").length,
  lines:document.querySelectorAll(".ob-out-line").length,
  lists:document.querySelectorAll(".ob-out-body ul, .ob-out-body ol").length,
  items:document.querySelectorAll(".ob-out-body li").length,
  litDots:[...document.querySelectorAll(".ob-out-body p")].filter(p=>/^[•·]/.test(p.textContent.trim())).length,
}));
console.log(`  page errors: ${errs.length}${errs.length?" :: "+errs[0]:""}`);
console.log(`  outputs on screen: ${struct.outs}  (${struct.lines} line · ${struct.notes} note · ${struct.docs} doc)`);
console.log(`  real lists: ${struct.lists} with ${struct.items} items · 🔴 paragraphs still starting with a bullet glyph: ${struct.litDots}`);

// 🔴 NOTHING RENDERED IS "COULD NOT RUN", NOT "EVERY PROPERTY DIFFERS". Every selector lookup fails
// on a page that did not load, and reporting seven design defects about a blank page is crying wolf.
// → feedback_an_absence_must_never_be_readable_as_a_value
if (!struct.outs) {
  console.log("  ⚠️  no output cards rendered — the page did not load. Reported as COULD-NOT-RUN.");
  await b.close();
  process.exit(2);
}
let n=0,d=0;
// ═══ THE CARD ITSELF ═══════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE GATE THAT PASSED WHILE THE CARDS RAN TOGETHER. The first version compared seven elements
// I had chosen, and the card was not one of them — so 21 properties matched while the steps had no
// border, no radius and no gap, and step 6's green header butted onto step 5's last line.
// Chris: "i told you to follow the design of this". A chosen property list is a claim about what I
// thought to look at. → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
{
  const card = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".ob-phase .ob-step.done")];
    if (!els.length) return null;
    const cs = getComputedStyle(els[0]);
    const r1 = els[0].getBoundingClientRect();
    const r2 = els[1] ? els[1].getBoundingClientRect() : null;
    const row = els[0].querySelector(".ob-row");
    return {
      borderWidth: cs.borderTopWidth, borderStyle: cs.borderTopStyle, borderColor: cs.borderTopColor,
      radius: cs.borderTopLeftRadius, bottomRadius: cs.borderBottomLeftRadius,
      cardBg: cs.backgroundColor,
      headerBg: row ? getComputedStyle(row).backgroundColor : null,
      gapToNext: r2 ? Math.round(r2.top - r1.bottom) : null,
      count: els.length,
    };
  });
  if (!card) { console.log("  ⚠️  no done step inside a phase — nothing to measure."); }
  else {
    const want = [
      ["the card has a visible border", parseFloat(card.borderWidth) >= 1 && card.borderStyle === "solid", `${card.borderWidth} ${card.borderStyle}`],
      ["the border is the mockup's green", card.borderColor === "rgb(207, 227, 207)", card.borderColor],
      ["the card is rounded, top and bottom", parseFloat(card.radius) >= 10 && parseFloat(card.bottomRadius) >= 10, `${card.radius} / ${card.bottomRadius}`],
      ["the card body is white", card.cardBg === "rgb(255, 255, 255)", card.cardBg],
      ["the header carries the tint", card.headerBg === "rgb(230, 242, 230)", card.headerBg],
      ["cards do not touch", card.gapToNext === null || card.gapToNext >= 6, `${card.gapToNext}px to the next card`],
    ];
    for (const [what, ok, got] of want) {
      if (ok) console.log(`  \u2705 ${what}`);
      else { console.log(`  \ud83d\udd34 ${what} — got ${got}`); d++; }
    }
  }
}

for(const s of SPEC){
  const w=want[s.name]; if(!w){console.log(`  ⚠️  mockup has no ${s.mock}`);continue;}
  const g=await page.evaluate(read,s.live,s.props);
  if(!g){console.log(`  🔴 live has no ${s.live}`);d++;continue;}
  const diffs=[]; for(const p of s.props){n++; const num=(v)=>parseFloat(v); const near=(x,y)=>Number.isFinite(num(x))&&Number.isFinite(num(y))&&Math.abs(num(x)-num(y))<=1.5&&/px$/.test(x)&&/px$/.test(y);
    if(String(g[p])!==String(w[p]) && !near(g[p],w[p])){diffs.push(`${p}: mockup "${w[p]}" → live "${g[p]}"`);d++;}}
  if(diffs.length){console.log(`  🔴 ${s.name}`);diffs.forEach(x=>console.log("       "+x));}
  else console.log(`  ✅ ${s.name} — ${s.props.length} properties identical`);
}
console.log(`\n  ${n} computed properties compared · ${d} differ`);
if (struct.litDots) console.log(`  🔴 ${struct.litDots} paragraph(s) still start with a bullet glyph — those are list items rendered as prose.`);
if (!struct.lists) console.log("  🔴 not one output rendered a real list — the bullet handling has regressed.");
await b.close();
const fail = d || struct.litDots || !struct.lists;
console.log(fail ? "\n🔴 the live output card does not match the approved mockup" : "\n✅ the output card matches the approved mockup, property by property");
process.exit(fail ? 1 : 0);
