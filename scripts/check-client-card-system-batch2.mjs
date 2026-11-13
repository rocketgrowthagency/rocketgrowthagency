#!/usr/bin/env node
// check-client-card-system-batch2.mjs — 2026-10-30. Batch 2 of the client card system (client_card_system_v1): Chris approved one page
// per step — reports/mockups/client_step11_call_tracking_v1 · client_step12_form_tracking_v1 · client_step13_first_reviews_v1 ·
// client_step14_videos_v1 · client_step15_closeout_call_v1 · client_step01_kickoff_v3 (APPROVED, the calendar in the card) ·
// client_step10_photos_v3 (APPROVED, tiles + one shot panel). Steps 1 and 10 came OFF HOLD with it, so CS_STEPS is now every Month 1
// client step. → project_client_card_system · batch 1 (steps 2–9) is check-client-card-system-batch1.
//
// RUNS the real renderers (vm for the cards, Chrome for the pieces that live in the DOM — the kickoff calendar and its click, the
// kickoff and video pills) and checks what each approved page promises:
//   · CS_STEPS is EXACTLY the 15 Month 1 client steps (batch 1's 8 + batch 2's 7)
//   · step 11: Set one up · I already use · Skip, "RGA recommends" on the ONE option the three questions pick, "Change something"
//     (data-ct-change) on a saved choice, a Cancel (data-ct-cancel) while a SAVED choice is being changed; pill "Skipped" for a skip,
//     "RGA is on it" while RGA sets a saved choice up
//   · step 12: done with zero sends = the GREEN "Tracking your forms · None yet" (the blue "No submissions yet" stays off the system);
//     no Check again on the done counting card; no second "Ask a question" beside Allow it; pill "Your turn" over "Did our test
//     arrive?" and "RGA is on it" once they allowed it — both ahead of "Detected automatically"
//   · steps 13–15: no Check again / Not right? beside a settled card (csQuiet) unless they flagged it
//   · step 14: "Your turn" / "RGA is on it" + a SECOND pill "Optional" (data-opt-pill, once); skipped = the grey "No videos for now ·
//     your choice" card with "Record them after all" under it
//   · step 15: the waiting card is ONE grey "Opens about <date> · N steps left" listing ONLY what's left (you amber · RGA blue); the
//     close-out picker isn't wrapped in a second card; no "What to do" heading over a system card; the times are boxes in a grid; the
//     done row's ask line reads "Questions about the call?"
//   · step 1: the calendar draws INSIDE one amber card ("Pick a time for your kickoff call · 30 min", or "Pick a new time · now <time>"
//     when re-picking, with Keep this time), the facts as chips; a tap on a time only MARKS it (status row + "Request this time");
//     "Request this time" sends it with NO dialog (the old card keeps its dialog); every booked / requested / on-now / passed / held
//     state is one system card keeping data-kickoff-change / -release / -withdraw and the countdown hooks; the pill reads "RGA
//     confirms your time" · "Booked" · "Couldn't load times" on a system row, whose "Questions about this step?" line is never
//     overwritten; the held card drops its own ask line
//   · step 10: the open step is 20 tiles (data-p10-t, the example drawing on an empty one, is-on / is-rga / is-re / is-sel) + ONE shot
//     open (data-p10-shot) whose row is BYTE-FOR-BYTE the row slot() draws everywhere (every upload / Replace / Remove / Clear it hook),
//     "Add N at once" (data-batch, data-empty) for a kind with 2+ empty, the Needs-your-space note, then the team question, the shot
//     list (data-p10-kind), already on Google, the hidden-logo note, "How this step works"; the band adds "· N with RGA for review" /
//     "· N to retake"; the open shot is remembered (_p10Sel) but never a finished one; the tile handler is the file's LAST listener
// Businesses are NOT RGA: a Denver plumber, a Toronto dentist (America/Toronto), a London cleaner (Europe/London).
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 indeterminate (code moved)
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), C = read("portal/portal.css");
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — portal.js ${w} moved; re-read it before trusting this gate`); process.exit(2); };
// a top-level function, by brace depth (quote-aware enough for these renderers: they end with "\n}\n")
const fn = (n) => { const m = new RegExp(`^(?:async )?function ${n}\\(`, "m").exec(P); if (!m) moved(`function ${n}`); const e = P.indexOf("\n}\n", m.index); if (e < 0) moved(`the end of ${n}`); return P.slice(m.index, e + 2); };
const line = (n) => { const m = new RegExp(`^const ${n} = [^\\n]*?;(?=\\s*(?:\\/\\/[^\\n]*)?$)`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0].replace(/^const /, "var "); };
// a whole top-level `const X = …;` even across lines — bracket depth, ignoring quotes
const block = (n) => { const at = P.search(new RegExp(`\\nconst ${n} = `)); if (at < 0) moved(`const ${n}`);
  let d = 0, q = null; for (let i = P.indexOf("=", at) + 1; i < P.length; i++) { const c = P[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === ";" && d === 0) return P.slice(at + 1, i + 1).replace(/^const /, "var "); }
  moved(`the end of const ${n}`); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STEP_LOCK = createRequire(import.meta.url)(`${SITE}/shared/step-lock.js`);
const BATCH1 = ["m1.access.website", "m1.gbp.attributes", "m1.gbp.booking_link", "m1.gbp.business_facts", "m1.gbp.hours_attributes", "m1.gbp.services_products", "m1.gbp.verify", "m1.strategy.keywords_locations"];
const BATCH3 = ["m2.call.monthly", "m2.exec.gbp_photos", "m2.exec.review_push", "m2.exec.youtube_video", "m2.snap.business_outcomes", "m2.win_story.capture"];
const BATCH2 = ["m1.brand.youtube_setup", "m1.call.close", "m1.gbp.photos", "m1.kickoff.call", "m1.review.first_5", "m1.tracking.call_setup", "m1.tracking.form_setup"];

// ── 0 · the set ──────────────────────────────────────────────────────────────────────────────────────
{ const m = /^const CS_STEPS = new Set\(\[([^\]]*)\]\);$/m.exec(P);
  if (!m) moved("CS_STEPS");
  const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort(), want = [...BATCH1, ...BATCH2, ...BATCH3, "m1.brand.social_profiles"].sort();   // 🔄 batch 3 (Ongoing work) is check-client-card-system-batch3
  if (ids.join("|") !== want.join("|")) fail(`CS_STEPS isn't exactly the 22 client steps (batches 1, 2 + 3 + social profiles): ${ids.join(", ")}`);
  // every numbered Month 1 client step in the SOP is on the system — one that's added later must join it (or this gate is re-read)
  const sop = []; const walk = (o) => { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === "object") { if (o.id && o.clientStepNo != null && /^m1\./.test(o.id)) sop.push(o.id); Object.values(o).forEach(walk); } };
  walk(JSON.parse(read("data/playbooks/client-steps.json")));
  const off = sop.filter((id) => !ids.includes(id));
  if (off.length) fail(`a numbered Month 1 client step isn't on the card system: ${off.join(", ")}`); }

// ── 1 · steps 11 + 12 (the record cards, run) ────────────────────────────────────────────────────────
const rc = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10), fmtDateShort: (x) => String(x || "").slice(0, 10), fmtDateTimeDot: (x) => String(x || "").slice(0, 16),
  stepLockOf: (id, t) => STEP_LOCK.stepLock(id, t, {}), googleCardHtml: () => "<old-google-card>", Date, JSON, Number, Set, Map, Array, String, Object, Math });
try {
  for (const n of ["RECORD_CARD", "rcRow", "_rcEditing", "CT_ATTRIB", "CT_COUNT", "CT_PROVIDERS", "CT_QS", "CT_YN", "ctWhy", "_ctAnswers", "_accNames", "_accRoles"]) vm.runInContext(block(n), rc);
  const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) moved("the plan-card pieces (PC_TICK … pcActs)");
  vm.runInContext(P.slice(a, b), rc); vm.runInContext(csBlock(P, P.slice(a, b)), rc);
  for (const n of ["accPart", "accDidLine", "accStep1Name", "accSiteName"]) vm.runInContext(fn(n), rc);
  vm.runInContext(`var _accHosts = {}; var ACC_FILES = {}; ${(P.match(/^const RGA_ADMIN_(?:EMAIL|GITHUB) = "[^"]*";$/gm) || []).join(" ").replace(/const /g, "var ")}`, rc);
  vm.runInContext(planCardKit(P, "const RC_PHONE =\nconst RC_FORM =\nconst RC_WEB =\n" + P.slice(a, b)), rc);
  vm.runInContext(`var _portalContractCache = {}; ${["ACC_PROMISE_ICON", "ACC_PROMISE_DO", "ACC_PROMISE_NEVER"].map((n) => ((P.match(new RegExp(`^const ${n} = [\\[{][\\s\\S]*?[\\]}];$`, "m")) || [""])[0]).replace(/^const /, "var ")).join("\n")}`, rc);
  for (const n of ["ctRecommend", "doneNoRecordHtml", "accPromiseHtml", "recordCardHtml", "accessTestRow", "accessCardHtml", "callTrackingCardHtml", "formTrackingCardHtml"]) vm.runInContext(fn(n), rc);
  vm.runInContext("var RC_LOCK='', RC_WEB='', RC_PHONE='', RC_FORM='';", rc);
} catch (e) { console.error(`⚠️  INDETERMINATE — steps 11/12's renderers don't load (${e.message})`); process.exit(2); }
const card = (id, t, { cs = true, editing = false } = {}) => {
  rc.__t = t;
  vm.runInContext(`${cs ? `CS_STEPS.add("${id}")` : `CS_STEPS.delete("${id}")`}; ${editing ? `_rcEditing.add("${id}")` : `_rcEditing.delete("${id}")`};`, rc);
  try { return vm.runInContext(`recordCardHtml({ id: "${id}" }, __t, "c1")`, rc); } catch (e) { fail(`${id}: the card threw (${e.message})`); return ""; }
  finally { vm.runInContext(`CS_STEPS.add("${id}"); _rcEditing.delete("${id}");`, rc); }
};
const AT = "2026-10-20T15:00:00Z";
// step 11 · the ask: the order, and "RGA recommends" on the one the three questions pick
{ const optsOf = (h) => [...h.matchAll(/data-ct-opt="([a-z_]+)"[^>]*>[^]*?<span class="pm-bk-ot"><b>[^<]*<\/b><span>([^]*?)<\/span>/g)].map((m) => ({ key: m[1], sub: m[2] }));
  const ask = card("m1.tracking.call_setup", {});
  const o = optsOf(ask);
  if (o.map((x) => x.key).join(",") !== "rga_sets_up,already_have,skip") fail(`step 11's choices aren't Set one up · I already use · Skip (${o.map((x) => x.key).join(", ")})`);
  if (o.some((x) => /RGA recommends/.test(x.sub))) fail("step 11 says \"RGA recommends\" on a choice before the three questions are answered");
  if (!/data-ct-save>Save my choice<\/button>/.test(ask) || /data-ct-cancel/.test(ask)) fail("step 11's first ask lost Save my choice, or offers a Cancel with nothing saved to go back to");
  for (const [ans, want] of [[{ calls: "yes", unanswered: "yes", ads: "no" }, "rga_sets_up"], [{ calls: "no", unanswered: "no", ads: "no" }, "skip"]]) {
    const oo = optsOf(card("m1.tracking.call_setup", { client_answers: ans }));
    const recd = oo.filter((x) => /· <b>RGA recommends<\/b>/.test(x.sub)).map((x) => x.key);
    if (recd.join() !== want) fail(`step 11's "RGA recommends" isn't on the ONE choice the answers pick (${JSON.stringify(ans)} → want ${want}, on ${recd.join(", ") || "none"})`);
  }
  // a saved choice: "Change something"; changing it: the question again with a Cancel beside Save
  for (const ch of ["rga_sets_up", "already_have", "skip"]) {
    const t = { client_choice: ch, client_choice_at: AT, status: ch === "skip" ? "done" : "in_progress" };
    const saved = card("m1.tracking.call_setup", t);
    if ((saved.match(/<button type="button" class="pm-amend" data-ct-change>Change something<\/button>/g) || []).length !== 1 || /data-ct-change>Change<\/button>/.test(saved)) fail(`step 11 saved "${ch}": not ONE "Change something" (data-ct-change)`);
    const ed = card("m1.tracking.call_setup", t, { editing: true });
    if (!/How should we count your calls\?/.test(ed) || !/data-ct-save>Save my choice<\/button><button type="button" class="pm-amend" data-ct-cancel>Cancel<\/button>/.test(ed)) fail(`step 11 changing a saved "${ch}" has no Cancel beside Save (there was no way back)`);
  }
  if (/data-ct-cancel/.test(card("m1.tracking.call_setup", {}, { editing: true }))) fail("step 11 offers Cancel while nothing is saved");
  if (/data-ct-change/.test(card("m1.tracking.call_setup", { client_choice: "rga_sets_up", client_choice_at: AT, status: "done", tracking: { number: "(303) 555-0101", rings: "(303) 555-0147", live_at: AT } }))) fail("step 11's live tracking number (locked) still offers Change something");
  // the Cancel handler leaves without saving
  if (!/const cnl = tgt\.closest\("\[data-ct-cancel\]"\);\s*if \(cnl\) \{ e\.preventDefault\(\); _rcEditing\.delete\("m1\.tracking\.call_setup"\);[^\n]*_rerender\(/.test(P)) fail("step 11's Cancel doesn't drop the edit and redraw (it must leave the saved choice as it was)"); }
// step 12 · zero sends on the system is the green card; the old card keeps the blue one
{ const zero = { status: "done", detected: { verdict: "indeterminate", at: "2026-10-22T03:30:00Z", n30: 0, n90: 0 } };
  const cs = card("m1.tracking.form_setup", zero), old = card("m1.tracking.form_setup", zero, { cs: false });
  if (!/^<div class="pm-k5"><div class="pm-k5-plan ok"><div class="pm-k5-h ok">[^]*?<b>Tracking your forms<\/b>/.test(cs) || !/None yet<small>a quiet month is normal · we check every night<\/small>/.test(cs) || !/>0 form sends</.test(cs) || /No submissions yet|broken/i.test(cs)) fail("step 12 done with zero sends isn't the GREEN \"Tracking your forms · None yet · 0 form sends\" (client_step12_form_tracking_v1)");
  if (!/pm-k5-plan rga/.test(old) || !/No submissions yet/.test(old)) fail("off the card system, zero sends lost its blue \"No submissions yet\" card");
  if (/data-ft-recheck|Check again/.test(cs)) fail("step 12's green zero-sends card offers Check again");
  const counting = { status: "done", detected: { verdict: "confirmed", at: "2026-10-22T03:30:00Z", n30: 4, n90: 6, last_at: "2026-10-27", gbp30: 1, events: ["generate_lead"], key_event: true } };
  const cc = card("m1.tracking.form_setup", counting), co = card("m1.tracking.form_setup", counting, { cs: false });
  if (!/<b>Tracking your forms<\/b>/.test(cc) || /Check again/.test(cc)) fail("step 12's done counting card still offers Check again on the card system");
  if (!/Check again/.test(co)) fail("off the card system the done counting card lost its Check again (only the system drops it)");
  const allow = card("m1.tracking.form_setup", {}), allowOld = card("m1.tracking.form_setup", {}, { cs: false });
  if (!/<b>One tag on your website<\/b>/.test(allow) || !/data-ft-allow>Allow it<\/button>/.test(allow) || /data-ask|Ask a question/.test(allow)) fail("step 12's ask on the system isn't \"One tag on your website · Allow it\" alone (the Ask RGA line under the card is the one way to ask)");
  if (!/>Ask a question<\/button>/.test(allowOld)) fail("off the card system step 12's ask lost its Ask a question");
  const test = card("m1.tracking.form_setup", { test: { at: "2026-10-22T10:00:00Z", inbox: null } });
  if (!/Did our test arrive in your inbox\?/.test(test) || !/data-ft-inbox="yes"/.test(test)) fail("step 12 doesn't ask \"Did our test arrive in your inbox?\""); }

// ── 2 · the row pills, steps 11 / 12 / 14 / 15 + steps 13–15 quiet (renderActionItemsLive, read in place) ───────────────────
{ const pillAt = (re) => { const m = re.exec(P); return m ? m.index : -1; };
  const skip11 = pillAt(/: isDone && step\.id === "m1\.tracking\.call_setup" && \(status === "skipped" \|\| taskState\?\.client_choice === "skip"\) && !month2Only \? \{ text: "Skipped", cls: "done" \}/);
  const done = pillAt(/\n\s*: isDone \? \{ text: "Done", cls: "done" \}/);
  if (skip11 < 0 || done < 0 || skip11 > done) fail("step 11 skipped isn't the \"Skipped\" pill (or it sits after \"Done\", so it never shows)");
  const rga11 = pillAt(/: step\.id === "m1\.tracking\.call_setup" && !month2Only && \["rga_sets_up", "already_have"\]\.includes\(taskState\?\.client_choice\) && !_rcEditing\.has\(step\.id\) \? \{ text: "RGA is on it", cls: "rga" \}/);
  const theirs = pillAt(/\n\s*: theirsToAct \? \{ text: "Your turn", cls: "you" \}/);
  if (rga11 < 0 || theirs < 0 || rga11 > theirs) fail("step 11's saved choice RGA sets up doesn't read \"RGA is on it\" ahead of \"Your turn\"");
  const test12 = pillAt(/: step\.id === "m1\.tracking\.form_setup" && !month2Only && taskState\?\.test\?\.at && taskState\.test\.inbox == null \? \{ text: "Your turn", cls: "you" \}/);
  const allow12 = pillAt(/: step\.id === "m1\.tracking\.form_setup" && !month2Only && taskState\?\.client_choice === "allow" \? \{ text: "RGA is on it", cls: "rga" \}/);
  const det = pillAt(/\n\s*: mech === "detected" \? \{ text: "Detected automatically", cls: "auto" \}/);
  if (test12 < 0 || det < 0 || test12 > det) fail("step 12's \"Did our test arrive?\" isn't \"Your turn\" ahead of \"Detected automatically\"");
  if (allow12 < 0 || allow12 > det) fail("step 12 allowed isn't \"RGA is on it\" ahead of \"Detected automatically\"");
  if (!/else if \(step\.clientOptional && ownerPill\.text === "Optional"\) Object\.assign\(ownerPill, \{ text: "Your turn", cls: "you" \}\);/.test(P)
    || !/const csOptPill = csRow && step\.clientOptional && \(!isDone \|\| status === "skipped"\) \? `<span class="pm-pill wait off" data-opt-pill>Optional<\/span>` : "";/.test(P)
    || !/<span class="pm-pill \$\{ownerPill\.cls\}">\$\{escapeHtml\(ownerPill\.text\)\}<\/span>`\}\$\{og \? \(csAsk \? `<span class="pm-pill rga">\$\{csAsk\}<\/span>` : ""\) : `\$\{csEditPill\}\$\{csMinPill\}\$\{csOptPill\}/.test(P)) fail("step 14's row on the system isn't \"Your turn\" + its own second \"Optional\" pill (data-opt-pill)");
  if (!/else if \(step\.id === "m1\.call\.close" && !isDone(?: && !ccAsked)? && \(ownWait \|\| rgaWait\)\) \{ const e = month1EndOf\(waitTasks\); Object\.assign\(ownerPill, \{ text: e \? `Opens about \$\{monthDay\(new Date\(e\.getTime\(\) - 3 \* 86400000\)\.toISOString\(\)\)\}` : "Opens near the end of Month 1"/.test(P)) fail("step 15 waiting isn't the \"Opens about <date>\" pill (like its card)");
  if (!/const csQuiet = CS_STEPS\.has\(step\.id\) && \(\["m1\.review\.first_5", "m1\.brand\.youtube_setup", "m1\.call\.close", "m1\.gbp\.photos"\]\.includes\(step\.id\) \|\| !!OG_CARD\[step\.id\]\) && !flagged;/.test(P) || !/const amendBtn = stepLk \|\| csQuiet \? ""\n\s*: flagged/.test(P)) fail("steps 13–15 draw Check again / Not right? beside a settled card again (or a raised flag loses its \"It's fine after all\")"); }

// ── 3 · step 14 (videos), run ────────────────────────────────────────────────────────────────────────
const vc = vm.createContext({ escapeHtml: esc, escapeAttribute: esc, Date, JSON, Number, Set, Map, Array, String, Object, Math });
try {
  const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = "));
  const kit = planCardKit(P, P.slice(a, b));
  vm.runInContext(`${P.slice(a, b).replace(/^const /gm, "var ")}\n${kit.replace(/^const /gm, "var ")}\n${csBlock(P, P.slice(a, b))}\n${line("rcRow")}\n${line("_vcState")}\n${line("VC_ICON")}\n${fn("videoClipsHtml")}\n${fn("videoClipsInner")}`, vc);
} catch (e) { console.error(`⚠️  INDETERMINATE — step 14's renderers don't load (${e.message})`); process.exit(2); }
{ const VIDS = [{ n: 1, title: "Why choose a local plumber", script: "…" }, { n: 2, title: "What happens on a call-out", script: "…" }];
  const draw = (cid, cs, t) => { vc.__t = t; vm.runInContext(`${cs ? "" : `CS_STEPS.delete("m1.brand.youtube_setup");`} _vcState.delete("${cid}");`, vc);
    try { return vm.runInContext(`videoClipsHtml({ id: "m1.brand.youtube_setup" }, __t, "${cid}")`, vc); } finally { vm.runInContext(`CS_STEPS.add("m1.brand.youtube_setup")`, vc); } };
  const sk = { status: "skipped", completed_at: "2026-10-25T16:00:00Z", outcome_data: { videos: VIDS } };
  const h = draw("v-den", true, sk), old = draw("v-tor", false, sk);
  const ci = h.indexOf('<div class="pm-k5-plan pm-cs-card off">'), ce = h.indexOf("</div></div>", ci), ub = h.indexOf('data-video-unskip="v-den">Record them after all</button>');
  if (ci < 0 || !/<b>No videos for now · your choice<\/b><span>[^<]+<\/span>/.test(h)) fail("step 14 skipped isn't the grey \"No videos for now · your choice\" card with the date");
  if (!/<div class="pm-cs-note">Record them any time; we'll edit and post them\.<\/div>/.test(h)) fail("step 14 skipped lost \"Record them any time; we'll edit and post them.\"");
  if (ub < 0 || ub < ce || !/<div class="pm-k5-acts"><button type="button" class="pm-amend" data-video-unskip=/.test(h)) fail("step 14 skipped: \"Record them after all\" isn't the one action UNDER the card");
  if (/Not right\?|data-step-wrong/.test(h)) fail("step 14 skipped draws \"Not right?\" again (client_step14_videos_v1 drops it)");
  if (!/pm-k5-plan ok/.test(old) || !/No videos for now/.test(old) || /pm-cs-card/.test(old)) fail("off the card system step 14 skipped lost its old card"); }

// ── 4 · step 15 (close-out), run ─────────────────────────────────────────────────────────────────────
const cw = vm.createContext({ escapeHtml: esc, escapeAttribute: esc, Date, JSON, Number, Set, Map, Array, String, Object, Math });
try {
  const lift = [line("GOOGLE_G"), line("GC_ICON"), line("CLOSE_CAL_ICON"), fn("googleCardHtml"), line("monthDay"), fn("month1EndOf"), fn("closeWaitHtml"), fn("rowRgaWaits"), fn("laterOf")].join("\n");
  const kit = planCardKit(P, lift);
  vm.runInContext(`${lift}\n${kit.replace(/^const /gm, "var ")}\n${csBlock(P, kit)}\nvar LATER_STEPS = { "m1.gbp.photos": "photos" }; function laterDay(u) { return String(u).slice(0, 10); }`, cw);
} catch (e) { console.error(`⚠️  INDETERMINATE — step 15's renderers don't load (${e.message})`); process.exit(2); }
{ const SOP = JSON.parse(read("data/playbooks/client-steps.json"));
  const step = (SOP.month1 || []).find((s) => s.id === "m1.call.close");
  if (!step || !Array.isArray(step.needsFirst) || step.needsFirst.length < 2) { console.error("⚠️  INDETERMINATE — step 15 or its prerequisites aren't in the projection"); process.exit(2); }
  const base = Object.fromEntries(step.needsFirst.map((id) => [id, { status: "done" }]));
  cw.__a = [step, { ...base, "m1.access.analytics": { status: "pending" }, "m1.strategy.keywords_locations": { status: "pending" }, "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T16:11:50Z" } }, new Set(["m1.strategy.keywords_locations"]), [], SOP, true];
  const h = vm.runInContext("closeWaitHtml(...__a)", cw);
  const evs = [...h.matchAll(/<div class="pm-cs-ev"><span class="mk (\w+)">[^]*?<\/span><span>([^]*?)<\/span>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, "").replace(/&#39;/g, "'")]);
  if ((h.match(/class="pm-k5-plan/g) || []).length !== 1 || !/^<div class="pm-k5"><div class="pm-k5-plan pm-cs-card off">/.test(h)) fail("step 15 waiting isn't ONE grey system card");
  if (!/<b>Opens about Nov 5 · 3 steps left<\/b>/.test(h)) fail(`step 15's band isn't "Opens about <date> · N steps left" (${(/<b>[^<]*<\/b>/.exec(h) || [""])[0]})`);
  const want = [["you", /^Grant RGA access to Google Analytics[^·]*· yours$/], ["rga", /^Your keyword plan · RGA's$/], ["rga", /^Your Month 1 report · RGA's$/]];
  if (evs.length !== 3 || want.some(([mk, re], i) => !evs[i] || evs[i][0] !== mk || !re.test(evs[i][1]))) fail(`step 15 doesn't list ONLY what's left, each marked whose (${JSON.stringify(evs)})`);
  if (/pm-pc-tl|Month 1 ends|pm-cw-go/.test(h)) fail("step 15's system card still draws the old timeline (done rows, Month 1 ends, Go to step)");
  // the picker paints its own card; no "What to do" over a system card; the times are a grid; the done ask line
  if (!/if \(csRow && !\/pm-k5-plan\|pm-cs-card\|<fieldset class="pm-waits"\|data-closeout-call\|data-kickoff-slots\/\.test\(completionCtl\)\)/.test(P)) fail("the close-out picker (or the kickoff calendar) is wrapped in a second system card");
  if (!/return `<div class="pm-doit"\$\{gcHold \? " data-gc-hold hidden" : ""\}>\$\{head && !csRow \? `<p class="pm-doit-h">/.test(P)) fail("a system card gets a \"What to do\" heading over it again");
  if (!/\.pm-cs \.pm-pc-body > \.pm-cc-opts \{ display:grid; grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,180px\),1fr\)\); \}/.test(C) || !/\.pm-cs \.pm-pc-body \.pm-cc-opt \{ display:grid; grid-template-columns:minmax\(0,1fr\);/.test(C)) fail("step 15's times aren't boxes in a grid on the system (each was squeezed into the hidden radio's 22px column)");
  if (!/csRow && isDone && \(step\.id === "m1\.kickoff\.call" \|\| step\.id === "m1\.call\.close" \|\| step\.id === "m2\.call\.monthly"\) \? threadHtml\(step\.id\)\.replace\("Questions about this step\?", "Questions about the call\?"\)/.test(P)) fail("a done call's ask line doesn't read \"Questions about the call?\""); }

// ── 5 · step 1 (the kickoff cards), run ──────────────────────────────────────────────────────────────
const kc = vm.createContext({ escapeHtml: esc, escapeAttribute: esc, clientReadingZone: (tz) => tz || "America/Denver", kickoffCountdown: (ms) => ({ text: ms > 0 ? `In ${Math.round(ms / 3600000)}h` : "now", tone: ms > 0 ? "far" : "live" }), Date, JSON, Number, Set, Map, Array, String, Object, Math, Boolean, console });
try {
  const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = "));
  vm.runInContext(`${P.slice(a, b).replace(/^const /gm, "var ")}\n${csBlock(P, P.slice(a, b))}\n${line("monthDay")}\n${fn("kickoffPhase")}\n${fn("kickoffCsHtml")}\n${fn("kickoffRequestedHtml")}\n${fn("kickoffDoneHtml")}\n${line("ccDay")}\n${line("ccTime")}\n${line("CLOSE_CAL_ICON")}\nfunction doneNoRecordHtml() { return "NO RECORD"; }`, kc);
} catch (e) { console.error(`⚠️  INDETERMINATE — step 1's kickoff cards don't load (${e.message})`); process.exit(2); }
{ const H = 3600000, iso = (ms) => new Date(Date.now() + ms).toISOString(), MEET = "https://meet.google.com/abc-defg-hij";
  const k = (...a) => { kc.__a = a; try { return vm.runInContext("kickoffRequestedHtml(...__a)", kc); } catch (e) { fail(`kickoffRequestedHtml threw (${e.message})`); return ""; } };
  const cards = (h) => (h.match(/class="pm-k5-plan pm-cs-card (\w+)"/g) || []).map((x) => x.replace(/.*card /, "").replace(/"$/, ""));
  for (const [tz, who] of [["America/Denver", "a Denver plumber"], ["America/Toronto", "a Toronto dentist"], ["Europe/London", "a London cleaner"]]) {
    // requested (RGA confirms it): the time is the band, "We're holding this time", Pick a different time · Cancel this request
    const rq = k(iso(48 * H), tz, "requested", "c1", null, null, 30);
    if (cards(rq).join() !== "rga" || !/We're holding this time for you/.test(rq) || !/class="pm-amend" data-kickoff-change="c1">Pick a different time<\/button>/.test(rq) || !/class="pm-k5-tell is-release" data-kickoff-withdraw="c1" data-when="[^"]+" data-moving-from="">Cancel this request<\/button>/.test(rq)) fail(`step 1 requested (${who}) isn't ONE blue card keeping data-kickoff-change + data-kickoff-withdraw (with data-when / data-moving-from)`);
    // a move: "moving from" + the booked call stays
    const mv = k(iso(72 * H), tz, "requested", "c1", null, null, 30, iso(48 * H));
    if (cards(mv).join() !== "rga" || !/moving from /.test(mv) || !/call stays booked until we confirm/.test(mv) || !/data-moving-from="20\d\d-/.test(mv)) fail(`step 1 moving a booked call (${who}) doesn't say "moving from" and that the old call stays booked`);
    // booked: green, In your calendar, the countdown hooks, Change the time · Can't make it?
    const bk = k(iso(48 * H), tz, "booked", "c1", MEET, null, 30, null, "abc-defg-hij");
    if (cards(bk).join() !== "ok" || !/In your calendar<\/b> · invite sent/.test(bk) || !/data-kickoff-cd data-kickoff-countdown="\d+" data-kickoff-mins="30" data-kickoff-meet="https:\/\/meet\.google\.com\/abc-defg-hij" data-kickoff-code="abc-defg-hij"/.test(bk) || !/data-kickoff-cd-text>/.test(bk)) fail(`step 1 booked (${who}) isn't the green card with the countdown's hooks (data-kickoff-countdown · -mins · -meet · -code · -cd-text)`);
    if (!/class="pm-amend" data-kickoff-change="c1">Change the time<\/button><button type="button" class="pm-k5-tell is-release" data-kickoff-release="c1" data-when="[^"]+">Can't make it\?<\/button>/.test(bk)) fail(`step 1 booked (${who}) lost Change the time (data-kickoff-change) · Can't make it? (data-kickoff-release + data-when)`);
    if (/Join the video call/.test(bk)) fail(`step 1 booked (${who}) offers Join two days early`);
    // on now: blue, the countdown hooks, Join
    const on = k(iso(-10 * 60000), tz, "booked", "c1", MEET, null, 30, null, "abc-defg-hij", false, null, true);
    if (cards(on).join() !== "rga" || !/Your kickoff call is on now/.test(on) || !/data-kickoff-countdown=/.test(on) || !/href="https:\/\/meet\.google\.com\/abc-defg-hij"[^>]*>Join the video call<\/a>/.test(on)) fail(`step 1 on now (${who}) isn't the blue "on now" card with the countdown hooks and Join`);
    // passed, no recap: amber, "time passed", Book another time — never Can't make it
    const ps = k(iso(-3 * H), tz, "booked", "c1", MEET, null, 30);
    if (cards(ps).join() !== "you" || !/time passed/.test(ps) || !/class="pm-act is-go" data-kickoff-change="c1">Book another time<\/button>/.test(ps) || /data-kickoff-release|Join the video call|Call held/.test(ps)) fail(`step 1 passed (${who}) isn't the amber "time passed" card with Book another time only`);
    // held (a recap): green "Call held", no controls
    const hd = k(iso(-26 * H), tz, "booked", "c1", MEET, iso(-24 * H), 30);
    if (cards(hd).join() !== "ok" || !/Call held · /.test(hd) || !/Recap in your inbox/.test(hd) || /data-kickoff-change|data-kickoff-release|data-kickoff-withdraw/.test(hd)) fail(`step 1 held (${who}) isn't the green "Call held" card without controls`);
    // a request whose time passed, nothing booked: amber, Pick a new time
    const rp = k(iso(-2 * H), tz, "requested", "c1", null, null, 30);
    if (cards(rp).join() !== "you" || !/<s>[^<]+<\/s> passed/.test(rp) || !/class="pm-act is-go" data-kickoff-change="c1">Pick a new time<\/button>/.test(rp) || /We're holding/.test(rp)) fail(`step 1 request passed (${who}) isn't the amber "passed" card with Pick a new time (and no "we're holding")`);
  }
  // the held DONE card drops its own ask line on the system (the row's "Questions about the call?" says it once)
  const done = vm.runInContext(`kickoffDoneHtml({}, { start: "2026-10-09T15:00:00Z", client_tz: "America/Denver", recap_sent_at: "2026-10-09T18:00:00Z" })`, kc);
  if (/pm-k5-askq|data-ask/.test(done) || !/Call held · /.test(done)) fail("step 1's held done card draws its own ask line on the card system"); }

const P10S = {};   // the remaining states, drawn in Chrome below
// ── 6 · step 10 (the tiles + one shot), run ─────────────────────────────────────────────────────────
{ const SECOND_LOGO = await import(pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
  process.removeAllListeners("warning");
  const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href), AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
  const PL = createRequire(`${SITE}/netlify/functions/flow-execute.js`)("./_photo-lists.js");
  const cut = (start, endMark) => { const i = P.indexOf(start); if (i < 0) moved(`"${start.slice(0, 30)}"`); const j = P.indexOf(endMark, i); if (j < 0) moved(`the end of "${start.slice(0, 30)}"`); return P.slice(i, j); };
  const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
  const pc = { secondLogos: SECOND_LOGO.secondLogos, photoListedNames: SECOND_LOGO.photoListedNames, photoLiveByLine: SECOND_LOGO.photoLiveByLine, photoOnlyVisible: SECOND_LOGO.photoOnlyVisible, photoShortfall: SECOND_LOGO.photoShortfall, photoMissingFromList: SECOND_LOGO.photoMissingFromList, photoCountable: SECOND_LOGO.photoCountable, tidiedByRga: SECOND_LOGO.tidiedByRga, FILED_AS: SECOND_LOGO.FILED_AS, escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console, Date };
  vm.createContext(pc);
  try { const kit = planCardKit(P, [stateSrc, bigSrc, slotsSrc].join("\n")); vm.runInContext(`${kit}\n${csBlock(P, kit)}\n${stateSrc}\n${bigSrc}\n${slotsSrc}\nthis.render = photoSlotsHtml; this.sel = _p10Sel;`, pc); }
  catch (e) { console.error(`⚠️  INDETERMINATE — step 10's renderer doesn't load (${e.message})`); process.exit(2); }
  const STEP = { id: "m1.gbp.photos", clientForm: "photo_upload" }, OFF = { clientForm: "photo_upload" };   // OFF: no id → off the system (the folds)
  for (const [biz, type, storefront, team] of [["a Denver plumber", "Plumbers", false, "1"], ["a Toronto dentist", "Cosmetic dentists", true, "3-5"], ["a London cleaner", "Home cleaning services", false, "2"]]) {
    const shape = PL.buildShotList({ typeOverride: type, storefront, teamSize: team });
    const ns = shape.items.map((it) => Number(it.n));
    if (ns.length < 10) { console.error(`⚠️  INDETERMINATE — ${biz}'s shot list has ${ns.length} shots`); process.exit(2); }
    // n1 published (a shot that isn't the logo / cover, so it can be removed) · n2 with RGA · n3 to retake · n4 empty
    const n1 = ns[4], n2 = ns[1], n3 = ns[2], n4 = ns[3];
    const turned = { id: "t", shot_n: n3, publish_state: "turned_down", review_note: "Blurry.\nHow to fix: Hold the phone steady.", reviewed_by: "RGA" };
    const photos = [{ id: "p1", shot_n: n1, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-09T00:00:00Z", storage_path: "a.jpg" }, { id: "r2", shot_n: n2, publish_state: "in_review", storage_path: "b.jpg", created_at: "2026-10-28T00:00:00Z" }, turned];
    const task = { draft_shape: shape, team_size: team, detected: { n: 1, threshold: 20, source: "google_profile" } };
    pc.sel.clear();
    const TIPS = '<details class="pm-tipline" data-fold="tips"><summary>Photo tips</summary><p>Send the original.</p></details>';   // the tips line clientHowHtml hands in
    const h = pc.render(STEP, task, photos, "c1", TIPS), off = pc.render(OFF, task, photos, "c1", TIPS);
    const tiles = [...h.matchAll(/<button type="button" class="pm-p10-t([^"]*)" data-p10-t="(\d+)" aria-pressed="(true|false)"[^>]*><span class="im">([^]*?)<span class="n">\d+<\/span>(?:<span class="pm-p10-chip">([^<]*)<\/span>)?<\/span><span class="lab">([^<]*)<\/span><\/button>/g)].map((m) => ({ cls: m[1].trim(), n: Number(m[2]), pressed: m[3] === "true", im: m[4], chip: m[5] || "", lab: m[6] }));
    // client_step11_photo_labels_v1: the shot's NAME is under every tile, always; the status is a chip on the photo
    const STATUS_WORDS = /^(Saved, not showing|Sent|Sent · up to 48 hours|On Google's list|Not on Google's list yet|With RGA|Retake)$/;
    if (tiles.some((t) => !t.lab || STATUS_WORDS.test(t.lab))) fail(`step 11 (${biz}): a tile lost the shot's name (it shows a status or nothing): ${tiles.filter((t) => !t.lab || STATUS_WORDS.test(t.lab)).map((t) => t.n + " \"" + t.lab + "\"").join(", ")}`);
    if (tiles.some((t) => /\bis-(on|rga|re)\b/.test(t.cls) && !t.chip)) fail(`step 11 (${biz}): a filled tile has no status chip on the photo`);
    const tile = (n) => tiles.find((t) => t.n === n) || { cls: "missing", im: "", lab: "" };
    if (tiles.length !== ns.length || tiles.map((t) => t.n).join() !== ns.join()) fail(`step 10 (${biz}): the tiles aren't every shot once, in the list's order (${tiles.length} of ${ns.length})`);
    if (!/\bis-on\b/.test(tile(n1).cls) || !/\bg-(?:sent|list|missing|hide)\b/.test(tile(n1).cls) || /class="ok"/.test(tile(n1).im)) fail(`step 10 (${biz}): a photo on Google claims more than Google's list tells us (${tile(n1).cls})`);
    if (tile(n2).cls !== "is-rga" || tile(n2).chip !== "With RGA" || !/data-thumb="b\.jpg"/.test(tile(n2).im)) fail(`step 10 (${biz}): a photo with RGA isn't the blue tile with their own photo (${tile(n2).cls} · ${tile(n2).lab})`);
    if (tile(n3).cls !== "is-re is-sel" || tile(n3).chip !== "Retake" || !tile(n3).pressed) fail(`step 10 (${biz}): the retake isn't the amber tile, selected (${tile(n3).cls} · ${tile(n3).lab})`);
    if (tile(n4).cls !== "" || !/data-ex-art=|pm-ex-art/.test(tile(n4).im)) fail(`step 10 (${biz}): an empty tile doesn't carry its example drawing (${tile(n4).cls})`);
    if (tiles.filter((t) => /is-sel/.test(t.cls)).length !== 1 || tiles.filter((t) => t.pressed).length !== 1) fail(`step 10 (${biz}): not exactly one tile selected`);
    // ONE shot open, and every shot's row is byte-for-byte the row the folds draw (every upload / Replace / Remove / Clear it hook)
    const shots = [...h.matchAll(/<div class="pm-p10-shot" data-p10-shot="(\d+)"( hidden)?>/g)].map((m) => ({ n: Number(m[1]), hidden: !!m[2] }));
    if (shots.length !== ns.length || shots.filter((s) => !s.hidden).map((s) => s.n).join() !== String(n3)) fail(`step 10 (${biz}): not ONE shot open (the retake): ${shots.filter((s) => !s.hidden).map((s) => s.n).join(", ")}`);
    const rowOf = (html, n) => { const i = html.indexOf(`" data-slot="${n}"`); if (i < 0) return ""; const a = html.lastIndexOf("<div class=\"pm-slot", i); const j = html.indexOf('<div class="pm-ex-big"', i); const e = html.indexOf("</div></div>", j); return html.slice(a, e + 12); };
    const bad = ns.filter((n) => !rowOf(h, n) || rowOf(h, n) !== rowOf(off, n));
    if (bad.length) fail(`step 10 (${biz}): the shot's row isn't the same row the folds draw (shots ${bad.join(", ")}) — an upload / Remove / Clear it hook can be lost`);
    for (const [hook, n] of [[/data-slot-file data-client-id="c1" data-shot-n="\d+"/, n4], [/data-photo-remove="r2"/, n2], [/data-photo-remove="t" data-photo-clear/, n3], [/data-photo-remove="p1" data-on-google/, n1]]) if (!hook.test(rowOf(h, n))) fail(`step 10 (${biz}): shot ${n}'s row lost ${hook.source}`);
    // the band, the order of the card, the shot list, the batch
    if (!/<b>1 of 20 on Google · 1 with RGA for review · 1 to retake<\/b><span>19 to go<\/span>/.test(h)) fail(`step 10 (${biz}): the band doesn't add "· 1 with RGA for review · 1 to retake" (${(/<b>[^<]*of 20[^<]*<\/b>/.exec(h) || [""])[0]})`);
    const at = (s) => h.indexOf(s), order = [at('<div class="pm-tool'), at('<span class="k">The shot list · photos added</span>'), at('<div class="pm-p10-tiles">'), at('<div class="pm-p10-panel"'), at('<details class="pm-k5-fold pm-tipline" data-fold="tips"><summary>How this step works</summary>')];
    if (order.some((x) => x < 0) || order.some((x, i) => i && x < order[i - 1])) fail(`step 10 (${biz}): the card isn't (v4) team question → the shot list chips → tiles → the shot → How this step works (${order})`);
    if (/<div class="pm-slots[" ]|<details class="pm-sgrp/.test(h)) fail(`step 10 (${biz}): the open step still draws the folds`);
    const kinds = [...h.matchAll(/<button type="button" class="pm-p10-k" data-p10-kind="([\d,]+)">/g)].map((m) => m[1].split(",").map(Number));
    if (!kinds.length || kinds.flat().sort((a, b) => a - b).join() !== [...ns].sort((a, b) => a - b).join()) fail(`step 10 (${biz}): the shot list's kinds don't cover every shot once`);
    const many = [...h.matchAll(/<div class="pm-kind-up pm-p10-many"><span>[^<]*<\/span><label class="pm-act is-guide">Add (\d+) at once<input type="file" multiple [^>]*data-slot-file data-batch data-cat="[^"]+" data-empty="([\d,]+)" data-client-id="c1" hidden><\/label>/g)];
    if (!many.length || many.some((m) => Number(m[1]) !== Math.min(10, m[2].split(",").length) || m[2].split(",").length < 2)) fail(`step 10 (${biz}): "Add N at once" (data-batch + data-empty) isn't on a kind with 2+ empty shots`);
    if (/<div class="pm-tool[^"]*">[^]*?data-batch[^]*?<div class="pm-p10-tiles">/.test(h)) fail(`step 10 (${biz}): the team question carries an upload`);
    // the open shot is remembered, but never a finished one
    pc.sel.set("c1", n4); const r4 = pc.render(STEP, task, photos, "c1", TIPS);
    if (!new RegExp(`<div class="pm-p10-shot" data-p10-shot="${n4}">`).test(r4)) fail(`step 10 (${biz}): the shot they opened isn't kept across a redraw (_p10Sel)`);
    pc.sel.set("c1", n1); const r1 = pc.render(STEP, task, photos, "c1", TIPS);
    if (!new RegExp(`<div class="pm-p10-shot" data-p10-shot="${n3}">`).test(r1)) fail(`step 10 (${biz}): a redraw re-opens a finished shot instead of the next one to do`);
    // ── client_step10_photos_v4, the remaining states ──
    // Not open yet (waiting on one listing): the grey card, the tiles to plan from, nothing can upload, nothing opens by itself
    pc.sel.clear();
    const WAIT = { open: false, state: "unknown", duplicates: [] }, DUP = { open: false, state: "duplicate", duplicates: [{ name: "locations/2" }] };
    const lk = pc.render(STEP, task, photos, "c1", TIPS, WAIT), dup = pc.render(STEP, task, photos, "c1", TIPS, DUP);
    if (!new RegExp(`<div class="pm-k5-plan pm-cs-card off"><div class="pm-k5-h off">[^]*?<b>Your ${ns.length} shots · uploading opens soon</b>`).test(lk)) fail(`step 10 (${biz}): the waiting step isn't the grey card "Your ${ns.length} shots · uploading opens soon"`);
    if ((lk.match(/<button type="button" class="pm-p10-t/g) || []).length !== ns.length || !/<div class="pm-p10 is-locked" data-p10="c1">/.test(lk) || !/<div class="pm-p10-panel" hidden>/.test(lk)) fail(`step 10 (${biz}): the waiting step doesn't draw every tile (read-only, no shot open)`);
    if (!/The shot list · photos added/.test(lk) || !/<div class="pm-cs-note">Plan your photos now\. Uploading opens the moment your listing is down to one\.<\/div>/.test(lk)) fail(`step 10 (${biz}): the waiting step lost its shot list or "Plan your photos now"`);
    if (/<input type="file"/.test(lk) || /data-batch/.test(lk) || /data-team-size/.test(lk) || /pm-cs-foot/.test(lk) || /class="pm-lock"/.test(lk)) fail(`step 10 (${biz}): the waiting step can upload, or still shows the people question, a foot or the old lock band`);
    if (!/data-photo-lock-approvals/.test(dup) || dup.indexOf("data-photo-lock-approvals") < dup.indexOf("pm-p10-tiles") || dup.indexOf("data-photo-lock-approvals") > dup.indexOf("Plan your photos now")) fail(`step 10 (${biz}): a real duplicate lost its way out ("Remove your second Business Profile"), or it isn't inside the card`);
    // Reminder later: below (a run of the whole step, check-a-client-can-choose-later) · Done: all green + On your profile by kind + Add more
    pc.sel.clear();
    const allOn = ns.map((x) => ({ id: `a${x}`, shot_n: x, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-09T00:00:00Z", storage_path: `${x}.jpg` }));
    const dn = pc.render(STEP, { ...task, status: "done", completed_at: "2026-10-30T12:00:00Z", detected: { n: ns.length, threshold: 20, source: "google_profile", at: "2026-10-29T12:00:00Z" } }, allOn, "c1", TIPS);
    const dcard = dn.slice(0, dn.indexOf('data-fold="done-list"'));
    if ((dcard.match(/<div class="pm-p10-t is-on g-(?:sent|list|missing|hide)"><span class="im">/g) || []).length !== ns.length) fail(`step 10 (${biz}): done doesn't mark every tile with what Google's list says`);
    if (/data-p10-t=/.test(dcard)) fail(`step 10 (${biz}): done's tiles are buttons (nothing happens when they're pressed)`);
    if (!/<span class="k">On your profile<\/span>/.test(dcard) || !/Add more any time; fresh photos help\.<\/div><div class="pm-cs-foot">/.test(dcard)) fail(`step 10 (${biz}): done lost "On your profile", its note or its foot`);
    const chipN = [...dcard.matchAll(/<span class="pm-cs-chip">[^<]*<em>(\d+)<\/em>/g)].reduce((a, m) => a + Number(m[1]), 0);
    if (chipN !== ns.length) fail(`step 10 (${biz}): "On your profile" doesn't add up to the photos on Google (${chipN} of ${ns.length})`);
    if (!/data-photo-addmore>Add more<\/button>/.test(dcard) || !/<details class="pm-later-list pm-pc-more" data-fold="done-list">/.test(dn) || !/<input type="file"[^>]*data-slot-file|data-photo-remove=/.test(dn.slice(dn.indexOf('data-fold="done-list"')))) fail(`step 10 (${biz}): done's Add more lost the list under the card (each photo's Change / Remove)`);
    // Reminder later (client_step10_photos_v4): the whole card; the rest of its rules run in check-a-client-can-choose-later
    pc.sel.clear();
    const lt = pc.render(STEP, task, photos, "c1", TIPS, null, { later: { until: "2030-11-04T12:00:00Z" }, canLater: true });
    if (!/<b>Set for later · we'll email you a reminder on Nov 4/.test(lt) || !/<div class="pm-p10-panel" hidden>/.test(lt) || /The shot list · photos added/.test(lt) || !/class="pm-k5-acts pm-later-under"/.test(lt) || !/Your other steps carry on\./.test(lt)) fail(`step 10 (${biz}): the later state isn't the card with its tiles and the two choices under it`);
    Object.assign(P10S, { wait: lk, dup, done: dn, later: lt });
    // a count reached with photos RGA hasn't matched to a shot: that shot's tile is NOT green, the rest is "Other N"
    pc.sel.clear();
    const dn2 = pc.render(STEP, { ...task, status: "done", completed_at: "2026-10-30T12:00:00Z", detected: { n: 27, threshold: 20, source: "google_profile" } }, [allOn[0]], "c1", TIPS);
    const d2 = dn2.slice(0, dn2.indexOf('data-fold="done-list"'));
    if ((d2.match(/<div class="pm-p10-t is-on g-/g) || []).length !== 1 || !/Other <em>26<\/em>/.test(d2)) fail(`step 10 (${biz}): a done count made of unmatched photos turns tiles green for shots that aren't there (or loses "Other 26")`);
  }
  // Needs your space · the hidden logo — a business that goes to its customers
  const sab = PL.buildShotList({ typeOverride: "Marketing agencies", storefront: false, teamSize: "1" });
  const logoN = Number(sab.items.find((it) => it.google === "PROFILE").n);
  pc.sel.clear();
  const s = pc.render(STEP, { draft_shape: sab, team_size: "1", detected: { n: 1, threshold: 20, source: "google_profile" } }, [{ id: "lg", shot_n: logoN, category: "logo", publish_state: "published", pushed_at: "2026-10-09T00:00:00Z", storage_path: "l.jpg" }], "c1", '<details class="pm-tipline" data-fold="tips"><summary>Photo tips</summary></details>');
  if (!/<div class="pm-cs-note"><b>Needs your space:<\/b> Google lists you as a business that goes to its customers/.test(s)) fail("step 10: an all-premises kind's shot lost \"Needs your space\" for a business that goes to its customers");
  if (!/<div class="pm-cs-note"><b>Why it isn't showing:<\/b> Google only shows a logo for a business with a public address[^<]*Nothing to do\.<\/div><div class="pm-cs-foot">[^]*?<\/div><details class="pm-k5-fold pm-tipline"/.test(s)) fail("step 10: the hidden-logo note isn't on the card (before How this step works)");
  if (!/csListingOut \? listingWaitHtml\(csListing\) : csNote\(/.test(P)) fail("a client with a duplicate listing lost \"Remove your second Business Profile\" on the grey wait card: it's their only way forward");
  // ── 10-30: how_this_step_works_v2 + step 10 v4 ──
  if (!/const p10Foot = p10 \? csFoot\(\{ maps:/.test(P) || !/\$\{p10Foot\}\$\{tipsFold\.replace\(/.test(P)) fail("step 10's foot lost See it on Google Maps (How must share one line with it)");
  const CSS10 = read("portal/portal.css");
  if (!/\.pm-cs \.pm-cs-card > details\.pm-cs-howb:not\(\[open\]\) \{ display:none; \}/.test(CSS10)) fail("a closed How leaves a strip under the foot (the card shows two bottoms)");
  if (!/details\.pm-tipline \.pm-tiplist \{ margin:0; border:0;/.test(CSS10)) fail("an open How draws a box inside the card");
  if (!/\.pm-cs \.pm-cs-foot \.how:focus:not\(:focus-visible\)/.test(CSS10)) fail("clicking How leaves a blue box round it");
  if (!/\.pm-cs \.pm-doit > \.pm-k5 \+ \.pm-k5-acts/.test(CSS10)) fail("step 3's Change something sits flush under its card (it must be 12px, like every step)");
  if (!/content:"Your photo goes here"/.test(CSS10)) fail("the empty photo box doesn't say what goes there");
  if (!/const csMinPill = csRow && ownerPill\.cls === "you" && ownerPill\.text === "Your turn" && Number\(step\.clientMinutes\) > 0/.test(P)) fail("a step on the client's turn lost its \"about N min\" pill (from clientMinutes)");
  if (!/const csEditPill = csRow && editing/.test(P)) fail("changing a done step isn't \"Done\" + an amber \"Editing\"");
  // ── 10-30: client_step10_photos_v4, the row around the remaining states ──
  if (!/const csPhotoWait = csRow && !isDone && listingWait && step\.clientForm === "photo_upload";/.test(P) || !/\(ownWait \|\| listingWait\) && !csPhotoWait &&/.test(P) || !/if \(\(csWaitHtml && listingWait\) \|\| csPhotoWait\) Object\.assign\(ownerPill, \{ text: "Opens when you have one Google profile"/.test(P)) fail("step 10 waiting on one listing isn't its own grey card under \"Opens when you have one Google profile\" (the row swaps it for the general wait card)");
  if (!/ownerPill\.cls === "wait" && later && ownerPill\.text\.startsWith\("Later · "\)\) Object\.assign\(ownerPill, \{ text: "Your turn", cls: "you" \}\)/.test(P) || !/const csLaterPill = csRow && later && ownerPill\.text === "Your turn" \? `<span class="pm-pill wait off" data-later-pill>Reminder \$\{escapeHtml\(monthDay\(later\.until\)\)\}/.test(P) || !/\$\{csOptPill\}\$\{csLaterPill\}/.test(P)) fail("step 10 later isn't the pills \"Your turn\" + \"Reminder <date>\"");
  if (!/Number\(step\.clientMinutes\) > 0 && !later \?/.test(P)) fail("a step that's later still says how many minutes it takes");
  // 11-6 night fixer: finish with fewer (client_setup_fewer_v1, approved 11-5) adds one more condition after this one (its count is in the band)
  if (!/!\(csRow && step\.clientForm === "photo_upload"\)(?:\s*(?:\/\/[^\n]*)?\n\s*&& !\(globalThis\.rgaSetupFewer[^\n]*)?\s*\? `<p class="pm-evidence">/.test(P)) fail("step 10 done repeats \"20 photos received\" under its card");
  if (!/const csCardOf = [^\n]*!c\.closest\("\.pm-pc-more"\)/.test(P)) fail("a done step's lock or How seats on the card inside the closed Add more list, where nobody sees it");
  // the tile handler: ONE document click listener handles a tile, a kind and ‹ Shot › (night fixer 11-12: this pinned "the file's LAST
  // listener", a position; the mobile-number listener (11-12) was appended after it and the step was no less wired. The listener is now
  // found by its selector and read to its own closing `\n});`.)
  const p10At = P.indexOf('closest("[data-p10-t], [data-p10-kind]")'), lst = p10At < 0 ? -1 : P.lastIndexOf('document.addEventListener("click"', p10At);
  const tail = lst < 0 ? "" : P.slice(lst, P.indexOf("\n});", lst) + 4);
  if (!/closest\("\[data-p10-t\], \[data-p10-kind\]"\)/.test(tail) || !/_p10Sel\.set\(/.test(tail) || P.indexOf('closest("[data-p10-t], [data-p10-kind]")', p10At + 1) >= 0) fail("step 10's tile / kind handler isn't one document click listener in portal.js");
  if (!/\.pm-cs \.pm-p10-shot\[hidden\] \{ display:none; \}/.test(C) || !/\.pm-cs \.pm-p10-tiles \{ display:grid;/.test(C)) fail("portal.css lost step 10's tiles grid or the hidden shot rule"); }

// ── 7 · Chrome: the kickoff calendar in the card + its tap · the kickoff pill · the video pill ───────────────────────────
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const pickHandler = (() => { const i = P.indexOf('document.addEventListener("click", async (ev) => {\n  const retry = ev.target.closest?.("[data-kickoff-retry]");'); if (i < 0) moved("the kickoff pick handler"); return P.slice(i, P.indexOf("\n});\n", i) + 4); })();
const pageSrc = [fn("escapeHtml"), fn("escapeAttribute"), P.slice(P.indexOf("const PC_TICK = "), P.indexOf("\n", P.indexOf("const pcActs = "))), csBlock(P, P.slice(P.indexOf("const PC_TICK = "), P.indexOf("\n", P.indexOf("const pcActs = ")))),
  line("ICON_CLOCK"), line("ICON_GLOBE"), line("ICON_CAL"), fn("kickoffStandingPassed"), fn("renderKickoffCalendar"), fn("markKickoffWaitingOnRga"), line("_vcState"), fn("videoPill"),
  `var _kickoffCache = new Map(), _kickoffMine = new Map(), _kickoffUnknown = new Set(), _kickoffWhen = new Map(), _kickoffPicking = new Set();
   function clientReadingZone(tz) { return tz || "America/Denver"; } function refreshKickoffNextStepBanner() {} function refreshNextStepCards() {}
   var __confirms = [], __posts = []; async function portalConfirm(o) { __confirms.push(o.title); return true; } async function portalToken() { return "t"; }
   window.fetch = async (u, o) => { __posts.push({ u, body: o && o.body }); return { ok: false, json: async () => ({ error: "test" }) }; };
   function loadKickoffSlots() {} function clientError(e) { return String(e && e.message || e); } async function portalAlert() {}`,
  pickHandler].join("\n");
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const errs = [];
  const fresh = async () => { const pg = await browser.newPage(); await pg.setViewport({ width: 900, height: 900 }); pg.on("pageerror", (e) => errs.push(String(e.message || e))); return pg; };
  let page;
  for (const [tz, who] of [["America/Denver", "Denver"], ["America/Toronto", "Toronto"], ["Europe/London", "London"]]) {
    for (const cs of [true, false]) {
      if (page) await page.close();
      page = await fresh();
      await page.setContent(`<html><body><div class="pm-step-row${cs ? " pm-cs cs-you" : ""}" id="row"><div class="pm-step-pills"><span class="pm-pill you">Your turn</span></div><details class="pm-ask pm-cs-ask"><summary>Questions about this step? <b>Ask RGA ›</b></summary></details><div data-kickoff-picker="c1" data-kickoff-slots></div></div></body></html>`);
      await page.addStyleTag({ content: C });
      errs.length = 0;
      await page.addScriptTag({ content: pageSrc });
      if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted kickoff code doesn't run in the page: ${errs[0]}`); process.exit(2); }
      const r = await page.evaluate(async (tz, cs) => {
        const day = new Date(Date.now() + 3 * 86400000); day.setUTCHours(16, 0, 0, 0);
        const slots = [0, 1, 2].map((i) => ({ start: new Date(day.getTime() + i * 3600000).toISOString() }));
        const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
        const [y, m] = key.split("-").map(Number);
        const fresh = (standing) => { _kickoffCache.set("c1", { slots, tz, rules: { days: [1, 2, 3, 4, 5], slotMinutes: 30, firstHour: 9, lastHour: 16 }, year: y, month: m - 1, selected: key, standing }); renderKickoffCalendar("c1"); };
        const host = document.querySelector("[data-kickoff-slots]");
        fresh(null);
        const out = { cards: host.querySelectorAll(".pm-cs-card").length, tone: host.querySelector(".pm-cs-card")?.className || "", head: host.querySelector(".pm-cs-card .pm-k5-h b")?.textContent || "", side: host.querySelector(".pm-cs-card .pm-k5-h span")?.textContent || "",
          grid: !!host.querySelector(".pm-cs-card .kc .kc-grid .kc-day"), times: host.querySelectorAll(".pm-cs-card .kickoff-slot[data-kickoff-pick]").length || host.querySelectorAll(".kickoff-slot[data-kickoff-pick]").length,
          chips: [...host.querySelectorAll(".pm-cs-card .pm-cs-kmeta .pm-chip")].map((c) => c.textContent.trim()), selHidden: !!host.querySelector("[data-kc-sel]")?.hidden, actsHidden: !!host.querySelector("[data-kc-acts]")?.hidden,
          go: host.querySelector("[data-kc-acts] button[data-kickoff-pick][data-kc-go]")?.textContent || "" };
        const t = [...host.querySelectorAll(".kickoff-slot[data-kickoff-pick]:not([data-kc-go])")];
        t[1]?.click(); await new Promise((res) => setTimeout(res, 30));
        out.afterTap = { confirms: __confirms.length, posts: __posts.length, on: [...host.querySelectorAll(".kickoff-slot.is-on")].map((b) => b.getAttribute("data-start")), pressed: t[1]?.getAttribute("aria-pressed"),
          sel: host.querySelector("[data-kc-sel]") ? { hidden: host.querySelector("[data-kc-sel]").hidden, st: host.querySelector("[data-kc-sel] .pm-cs-st.you b")?.textContent || "" } : null,
          actsHidden: !!host.querySelector("[data-kc-acts]")?.hidden, goStart: host.querySelector("[data-kc-go]")?.getAttribute("data-start") || "", picked: t[1]?.getAttribute("data-start") };
        t[2]?.click(); await new Promise((res) => setTimeout(res, 30));
        out.second = { on: [...host.querySelectorAll(".kickoff-slot.is-on")].length, goStart: host.querySelector("[data-kc-go]")?.getAttribute("data-start") || "", picked: t[2]?.getAttribute("data-start") };
        host.querySelector("[data-kc-go]")?.click(); await new Promise((res) => setTimeout(res, 60));
        out.sent = { confirms: __confirms.length, posts: __posts.map((p) => { try { return JSON.parse(p.body).start; } catch { return ""; } }) };
        // re-picking a booked call: "Pick a new time · now <their time>", Keep this time; a tap says the old call stays booked
        __confirms.length = 0; __posts.length = 0;
        fresh({ start: new Date(day.getTime() + 86400000).toISOString(), status: "booked" });
        out.re = { head: host.querySelector(".pm-cs-card .pm-k5-h b")?.textContent || "", side: host.querySelector(".pm-cs-card .pm-k5-h span")?.textContent || "", keep: !!host.querySelector('.pm-k5-acts [data-kickoff-keep="c1"]') };
        [...host.querySelectorAll(".kickoff-slot[data-kickoff-pick]:not([data-kc-go])")][0]?.click(); await new Promise((res) => setTimeout(res, 30));
        out.re.st = host.querySelector("[data-kc-sel] .pm-cs-st")?.textContent || ""; out.re.confirms = __confirms.length;
        return out;
      }, tz, cs);
      if (cs) {
        if (r.cards !== 1 || !/pm-cs-card you/.test(r.tone) || r.head !== "Pick a time for your kickoff call" || r.side !== "30 min") fail(`step 1 (${who}): the calendar isn't INSIDE one amber card "Pick a time for your kickoff call · 30 min" (${r.cards} · ${r.tone} · ${r.head} · ${r.side})`);
        if (!r.grid || r.times !== 3) fail(`step 1 (${who}): the card lost the month grid or the day's times (${r.times})`);
        if (r.chips.join("|") !== `30 min|Mon–Fri|${tz.replace(/_/g, " ")}|Invite by email once confirmed`) fail(`step 1 (${who}): the facts aren't the chips 30 min · Mon–Fri · their zone · Invite by email (${r.chips.join(" · ")})`);
        if (!r.selHidden || !r.actsHidden || r.go !== "Request this time") fail(`step 1 (${who}): before a tap the status row / "Request this time" show (or the button lost data-kickoff-pick + data-kc-go)`);
        const a = r.afterTap;
        if (a.confirms || a.posts) fail(`step 1 (${who}): a tap on a time asks or sends (${a.confirms} dialog · ${a.posts} request) — it must only mark it`);
        if (a.on.join() !== a.picked || a.pressed !== "true" || !a.sel || a.sel.hidden || !a.sel.st || a.actsHidden || a.goStart !== a.picked) fail(`step 1 (${who}): a tap doesn't mark the time, show it as the status row and arm "Request this time" with it (${JSON.stringify(a)})`);
        if (r.second.on !== 1 || r.second.goStart !== r.second.picked) fail(`step 1 (${who}): a second tap leaves two times marked, or "Request this time" keeps the first (${JSON.stringify(r.second)})`);
        if (r.sent.confirms !== 0 || r.sent.posts.length !== 1 || r.sent.posts[0] !== r.second.picked) fail(`step 1 (${who}): "Request this time" doesn't send the marked time without a dialog (${JSON.stringify(r.sent)})`);
        if (r.re.head !== "Pick a new time" || !/^now [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d\d [AP]M$/.test(r.re.side) || !r.re.keep) fail(`step 1 (${who}): re-picking isn't "Pick a new time · now <their time>" with Keep this time (${r.re.head} · ${r.re.side})`);
        if (!/^Moving to /.test(r.re.st) || !/call stays booked until we confirm the new time/.test(r.re.st) || r.re.confirms) fail(`step 1 (${who}): a tap while re-picking doesn't say the booked call stays until the new time is confirmed (${r.re.st})`);
      } else {
        // off the system the old calendar keeps its dialog
        if (r.cards || !r.afterTap.confirms) fail(`step 1 (${who}) off the card system: the old calendar lost its confirm dialog (or drew the system card)`);
      }
    }
  }
  // the kickoff pill on a system row · the old row; the "Questions about this step?" line is never overwritten on a system row
  const pills = await page.evaluate(() => {
    const out = {};
    for (const cs of [true, false]) for (const [name, set] of Object.entries({
      requested: () => { _kickoffMine.set("c1", "requested"); _kickoffWhen.set("c1", { startMs: Date.now() + 86400000, mins: 30 }); },
      booked: () => { _kickoffMine.set("c1", "booked"); _kickoffWhen.set("c1", { startMs: Date.now() + 86400000, mins: 30 }); },
      held: () => { _kickoffMine.set("c1", "booked"); _kickoffWhen.set("c1", { startMs: Date.now() - 86400000, mins: 30, recapSentAt: new Date().toISOString() }); },
      unknown: () => { _kickoffUnknown.add("c1"); },
      lapsed: () => { _kickoffMine.set("c1", "requested"); _kickoffWhen.set("c1", { startMs: Date.now() - 3600000, mins: 30 }); },
    })) {
      document.body.innerHTML = `<div class="pm-step-row${cs ? " pm-cs cs-you" : ""}"><div class="pm-step-pills"><span class="pm-pill you">Your turn</span></div><details class="pm-ask pm-cs-ask"><summary>Questions about this step? <b>Ask RGA ›</b></summary></details><div data-kickoff-picker="c1" data-kickoff-slots></div></div>`;
      _kickoffMine.clear(); _kickoffWhen.clear(); _kickoffUnknown.clear(); _kickoffPicking.clear(); set();
      try { markKickoffWaitingOnRga("c1"); } catch (e) { out.err = String(e.message); }
      const row = document.querySelector(".pm-step-row"), p = row.querySelector(".pm-pill");
      out[`${cs ? "cs" : "old"}:${name}`] = { text: p.textContent, cls: p.className, row: (row.className.match(/\bcs-\w+/) || [""])[0], ask: row.querySelector(".pm-ask").textContent };
    }
    return out;
  });
  if (pills.err) fail(`markKickoffWaitingOnRga threw (${pills.err})`);
  const want = { requested: ["RGA confirms your time", "pm-pill rga", "cs-rga"], booked: ["Booked", "pm-pill done", "cs-ok"], held: ["Done", "pm-pill done", "cs-ok"], unknown: ["Couldn't load times", "pm-pill bad", "cs-bad"], lapsed: ["Your turn", "pm-pill you", "cs-you"] };
  for (const [k, [text, cls, row]] of Object.entries(want)) {
    const g = pills[`cs:${k}`] || {};
    if (g.text !== text || g.cls !== cls || g.row !== row) fail(`step 1's pill on a system row (${k}) reads "${g.text}" (${g.cls} · ${g.row}); want "${text}" (${cls} · ${row})`);
    if (g.ask !== "Questions about this step? Ask RGA ›") fail(`step 1 (${k}): the kickoff lede writer overwrote the system row's "Questions about this step?" line ("${g.ask}")`);
  }
  if (pills["old:requested"]?.text !== "RGA is doing it" || pills["old:booked"]?.text !== "Booked") fail(`off the card system the kickoff pill changed (${pills["old:requested"]?.text} · ${pills["old:booked"]?.text})`);
  // the video pill: "Your turn" / "RGA is on it" / "Skipped" + ONE "Optional" on a system row; the old row keeps "Optional" alone
  const vp = await page.evaluate(() => {
    const out = {};
    for (const cs of [true, false]) for (const [name, st] of Object.entries({ open: { videos: [{ n: 1 }, { n: 2 }], clips: [] }, writing: { videos: null, clips: [] }, skipped: { videos: [{ n: 1 }], clips: [], skipped: true } })) {
      document.body.innerHTML = `<div class="pm-step-row${cs ? " pm-cs" : ""}"><div class="pm-step-pills"><span class="pm-pill auto">Optional</span></div><div data-video-clips="v1"></div></div>`;
      _vcState.set("v1", st); videoPill("v1"); videoPill("v1");   // twice: a repaint must not add a second "Optional"
      const ps = [...document.querySelectorAll(".pm-step-pills .pm-pill")];
      out[`${cs ? "cs" : "old"}:${name}`] = ps.map((p) => `${p.className}|${p.textContent}${p.hasAttribute("data-opt-pill") ? "|opt" : ""}`);
    }
    return out;
  });
  const vwant = { "cs:open": ["pm-pill you|Your turn", "pm-pill wait off|Optional|opt"], "cs:writing": ["pm-pill rga|RGA is on it", "pm-pill wait off|Optional|opt"], "cs:skipped": ["pm-pill done|Skipped", "pm-pill wait off|Optional|opt"], "old:open": ["pm-pill auto|Optional"], "old:writing": ["pm-pill rga|RGA is doing it"], "old:skipped": ["pm-pill done|Skipped"] };
  for (const [k, w] of Object.entries(vwant)) if ((vp[k] || []).join(" · ") !== w.join(" · ")) fail(`step 14's pills (${k}) are ${JSON.stringify(vp[k])}; want ${JSON.stringify(w)}`);
  // ── client_step10_photos_v4: the remaining states at a phone's width, in Chrome with the shipped stylesheet ──
  { const pg = await browser.newPage();
    for (const [name, html] of Object.entries(P10S)) {
      await pg.setViewport({ width: 400, height: 900 });
      await pg.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div class="pm-step-row pm-cs" id="r" style="padding:0 16px">${html}</div></body></html>`);
      await pg.addStyleTag({ content: C });
      const m = await pg.evaluate(() => { const s = document.querySelector(".pm-p10.is-locked [data-p10-shot][hidden]"); if (s) { s.hidden = false; s.parentElement.hidden = false; }
        const add = [...document.querySelectorAll(".pm-p10.is-locked .pm-slot .add")].filter((a) => a.checkVisibility());
        const more = document.querySelector("details.pm-pc-more"), closed = more ? getComputedStyle(more).display : "", was = more ? (more.open = true, getComputedStyle(more).display) : "";
        if (more) more.open = false;
        const dt = document.querySelector("div.pm-p10-t");
        return { sw: document.documentElement.scrollWidth, add: add.length, closed, was, cur: dt ? getComputedStyle(dt).cursor : "" }; });
      if (m.sw > 400) fail(`step 10 (${name}): the page is ${m.sw}px wide on a 400px phone`);
      if (m.add) fail(`step 10 (${name}): a waiting shot still shows + Add photo (${m.add})`);
      if (name === "done" && (m.closed !== "none" || m.was === "none")) fail(`step 10 (done): Add more's list isn't hidden until it's opened (closed: ${m.closed}, open: ${m.was})`);
      if (name === "done" && m.cur !== "default") fail(`step 10 (done): a tile that does nothing looks pressable (${m.cur})`);
    }
    await pg.close(); }

} finally { await browser.close(); }

if (F.length) { console.error(`🔴 the client card system (batch 2: steps 1, 10–15) drifted — ${F.length} problem(s):\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client card system, batch 2 (steps 1, 10–15) holds for a Denver plumber, a Toronto dentist and a London cleaner: CS_STEPS is exactly the 15 Month 1 client steps; step 11 Set one up · I already use · Skip with RGA recommends on the one the answers pick, Change something, Cancel while changing; step 12 zero sends is the green None yet, no Check again, no second ask; the 11/12/14/15 pills; steps 13–15 quiet; step 14 Optional as its own pill (once) and the grey skipped card; step 15 one grey card with only what's left; step 1 the calendar in one card, a tap marks, Request this time sends without a dialog, every state keeps its hooks, the pill + lede on a system row; step 10 the tiles + ONE shot whose row is the folds' row byte for byte, Add N at once, the band's counts, the remembered shot");
