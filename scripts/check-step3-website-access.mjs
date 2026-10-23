#!/usr/bin/env node
// check-step3-website-access.mjs — 2026-10-20, approved step3_website_access_v3 (Chris: "this step shows done but says your move…
// can't X out… does each platform need specific links and setup… where should the conversation go?"). RUNS the detector + the data
// and pins every layer:
//   · ONE source: data/site-platforms.json (the researched 22-builder audit) — server, portal and admin read it; admin keeps no copy
//   · every builder has real steps; no-safe-invite builders (Square Online, Jimdo, Yola) are a checklist, never a password; Shopify
//     takes the 4-digit code; Webflow is a request RGA sends; a Custom-coded option exists
//   · the detector: Square Online beats Weebly, Showit beats WordPress, Framer beats Shopify, a hand-coded site is "none",
//     untested signs only ever "ask"
//   · the client never receives RGA's own notes (`rga`)
//   · the card: a done row never shows the ask (done-without-record = who + when + Not recorded); tiles + Change, never the hidden link
//   · the save: the new paths + Shopify checked; the code is dropped once access is confirmed
//   · the step conversation sits at the BOTTOM of every row, as a closed row that opens for an unread RGA reply
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), EP = read("netlify/functions/portal-site-platform.js");
const INP = read("netlify/functions/portal-step-input.js"), CONF = read("netlify/functions/admin-access-confirm.js");
let DATA; try { DATA = JSON.parse(read("data/site-platforms.json")); } catch (e) { console.error(`⚠️  site-platforms.json won't parse: ${e.message}`); process.exit(2); }
const PL = DATA.platforms || {};
// ── the data
if (Object.keys(PL).length < 20) fail(`only ${Object.keys(PL).length} builders in site-platforms.json (the audit covers 22)`);
for (const [k, p] of Object.entries(PL)) {
  if (!p.name || !p.kind || !Array.isArray(p.steps) || !p.steps.length || p.steps.some((x) => !x || typeof x.t !== "string" || !x.t.trim())) fail(`${k}: missing name / kind / real steps`);
  for (const x of p.steps) { if (x.link && !/^(https:\/\/|\{site\}\/)/.test(x.link)) fail(`${k}: a step link isn't https or {site}`); }
  if (/password/i.test(JSON.stringify(p.steps)) && !/never (take|need) your password|Never your password|we never take your password/i.test(JSON.stringify(p.steps))) fail(`${k}: the steps mention a password without saying we never take it`);
  if (!p.rga) fail(`${k}: no "RGA's move" for admin row 8`);
}
for (const k of ["squareonline", "jimdo", "yola"]) if (PL[k]?.kind !== "workaround") fail(`${k} isn't a checklist/screen-share (no safe invite exists)`);
if (PL.shopify?.kind !== "code") fail("Shopify doesn't take the 4-digit collaborator code");
if (PL.webflow?.kind !== "request") fail("Webflow isn't a request RGA sends");
if (!PL.custom) fail("there is no Custom-coded option (GitHub / Netlify / Vercel)");
if (!/hello@rocketgrowthagency\.com/.test(JSON.stringify(PL.wordpress?.steps || []))) fail("WordPress's steps don't carry the email to copy");
// ── the detector, RUN
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let D; try { D = req(`${SITE}/netlify/functions/_site-platform.js`); } catch (e) { console.error(`⚠️  _site-platform won't load: ${e.message}`); process.exit(2); }
const det = (h, hd) => D.detectFromHtml(h, hd || {});
const sq = det(`<script src="https://cdn3.editmysite.com/a.js"></script><meta name="generator" content="Square Online"><a href="https://x.square.site/"><a href="https://www.weebly.com/">`, { "x-host": "y.weebly.net" });
// ↑ a TIE on purpose (Weebly 2 · Square 2): a real Square Online page carries both; list order alone picks Weebly
if (sq.platform !== "squareonline") fail(`a Square Online site reads as ${sq.platform} (it shares Weebly's editmysite.com)`);
const sh = det(`<script src="https://lib.showit.co/x.js"></script><link href="/blog/wp-content/x.css">`, { link: '<https://x/wp-json/>; rel="https://api.w.org/"', "x-showit": "hosted" });
if (sh.platform !== "showit") fail(`a Showit site reads as ${sh.platform} (its blog sends WordPress's header)`);
const fr = det(`<meta name="generator" content="Framer abc"><script src="https://cdn.shopify.com/consent.js"></script><div class="shopify-section">`, { server: "Framer/123" });
// ↑ ties too: Showit blogs are WordPress (wp-content + api.w.org); framer.com loads Shopify scripts
if (fr.platform !== "framer") fail(`a Framer site reads as ${fr.platform}`);
const wp = det(`<link href="/wp-content/x.css"><meta name="generator" content="WordPress 6.8">`);
if (wp.platform !== "wordpress" || wp.confidence !== "stated") fail("a WordPress site isn't stated as WordPress");
if (det("<html><body>hand coded</body></html>").platform !== null) fail("a hand-coded site is guessed as a builder");
const jm = det(`<link href="https://assets.jimdo.com/x.css">`);
if (jm.platform !== "jimdo" || jm.confidence !== "ask") fail("an untested sign (Jimdo) is stated, not asked");
// ── the client never gets RGA's notes
if (!/Object\.entries\(ALL\)\.map\(\(\[k, \{ rga, \.\.\.pub \}\]\) => \[k, pub\]\)/.test(EP)) fail("portal-site-platform sends RGA's own notes (`rga`) to the client");
// ── the card
const ia = P.indexOf('if (t.status === "done" && !oldLink && !(ci && ci.via) && !acc && !_rcEditing.has(step.id)) {'), ib = P.indexOf('  // the ask (and, for a client who sent the old password link');
if (ia < 0 || ib < 0 || ia > ib) fail("a done row with no answer stored can fall through to the ask (\"Done\" but \"Your move\")");
// 🔒 done with nothing on record = CALM (approved step3_three_screens_v1): plain words, "Nothing for you to do", optional "Add the details"
if (!/<b>Builder not on record<\/b>/.test(P) || !/<small>Nothing for you to do<\/small>/.test(P) || !/data-acc-redo>My website changed<\/button>/.test(P) || /Want it on record\?|>Add the details</.test(P)) fail("done-without-record isn't the calm card (Builder not on record · Nothing for you to do · only \"My website changed\" — never asks the client to fill in RGA's records)");
if (/data-acc-other|>Not right\? Pick another/.test(P)) fail("the hidden \"Not right? Pick another\" link is back");
if (!/data-acc-change>Change<\/button>/.test(P) || !/class="pm-ax-tile\$\{k === key \? " sel" : ""\}" role="radio"/.test(P)) fail("the builder picker isn't tiles + a Change button");
if (!/<a class="pm-ax-go" href="\$\{escapeAttribute\(link\)\}"/.test(P) || !/<a class="pm-ax-go" href="\$\{escapeAttribute\(F\.link\)\}"/.test(P) || !/data-acc-copy=/.test(P)) fail("the setup lost its direct link or copy chips");
if (!/\.pm-ax-go \{[^}]*white-space:nowrap/.test(read("portal/portal.css")) || !/\.pm-ax-setup li \{ display:grid;/.test(read("portal/portal.css"))) fail("a setup button can wrap mid-sentence again (Chris's screenshot)");
// ── Chris's walk-through 10-22 (all fixed, all pinned)
const CSS = read("portal/portal.css");
if (/tile: RC_LOCK/.test(P) || !/const RC_WEB = /.test(P)) fail("step 3 shows a padlock again (since 10-21 the padlock means Locked) — it's a website icon");
if (!/: isDone && _rcEditing\.has\(step\.id\) \? \{ text: "Updating", cls: "edit" \}/.test(P)) fail("a done step being changed says \"Done\" above \"Your move\" (it says Updating)");
// 10-22 (Chris: "no spinner or anything"): the redraw is instant, so the wait is the card's "Checking which builder…" line — it SPINS
if (!/\.pm-msg\.busy \.dot\{[^}]*animation:pm-later-spin/.test(CSS)) fail("a waiting message (\"Checking which builder your website uses…\") shows a still dot, not the spinner");
if (!/const ACC_COMMON = \["wordpress", "wix", "squarespace", "godaddy", "shopify", "webflow", "custom", "other"\];/.test(P) || !/\$\{restOpen \? "Show fewer builders" : `Show all \$\{all\.length\} builders`\}<\/button>/.test(P)) fail("the builder list is a wall again (8 common + Show all ↔ Show fewer)");
if (!/\.pm-ax-tiles \{ grid-auto-rows:1fr; \}/.test(read("portal/portal.css"))) fail("the builder tiles aren't one size (one grid, equal rows)");
if (/class="pm-linkbtn" data-acc-(designer|none)/.test(P)) fail("\"My web designer…\" / \"I don't have a website\" are underlined links again (they're choices: secondary buttons)");
// 🔒 step3_parts_v1 + step3_part_colours_v1 (10-22): three labelled parts coloured by state; before a pick Steps 2–3 read "Not yet";
// the send button lives in Step 3 ("Then"), never as a faded button with no reason
if (!/\$\{accPart\(2, "Instructions: do this", "next", "", "Shows once you pick your builder"\)\}\$\{accPart\(3, "Tell RGA you've sent it", "next"\)\}/.test(P)) fail("before a builder is picked, Steps 2 and 3 don't show as Not yet");
if (!/\$\{accPart\(1, dev \? "Where your website lives" : "Your website builder", "done", picked\)\}\$\{accPart\(2, dev \? "Give RGA access to your website\'s files" : "Instructions: do this", "you", dev \? accCustomSetupHtml\(p, hk, host\) : accSetupHtml\(p, j\.site\)\)\}\$\{accPart\(3, "Tell RGA when it\'s done", s3state, tell/.test(P) || !/<button type="button" class="pm-commit" data-acc-send>/.test(P)) fail("after a pick, the three parts (done · your move · then, with the send button in Step 3) aren't drawn");
if (!/const ACC_TAG = \{ you: "Your move", then: "Then", work: "Working", done: "Done", rga: "With RGA", next: "Not yet" \};/.test(P)) fail("the parts' state tags changed (Your move · Then · Working · Done · With RGA · Not yet)");
// 🔒 CHECKING = the three parts from the first second (step3_three_screens_v1), never a lone pill
if (!/accPart\(1, "Checking your website", "work",/.test(P) || /Checking which builder your website uses…<\/span><\/div>`/.test(P)) fail("while checking, step 3 is a lone pill again (the three parts must show from the first second)");
for (const st of ["st-you", "st-done", "st-rga", "st-next"]) if (!new RegExp(`\\.pm-ax-part\\.${st} \\{`).test(CSS)) fail(`the ${st} part has no colour (it takes the state's token)`);
if (/the builder below says how long|data-acc-send disabled>Pick your builder first/.test(P)) fail("the old confusing wording is back");
if (!/const ini = key === "custom" \? "<\/>" : key === "other" \? "\?" : \(words\[0\] \|\| "\?"\)\[0\]\.toUpperCase\(\);/.test(P)) fail("the builder tile shows two letters again (\"WO\" read like a word)");
if (!/data-acc-cancel>Cancel<\/button>/.test(P) || !/if \(tgt\.closest\("\[data-acc-cancel\]"\)\) \{ e\.preventDefault\(\); _rcEditing\.delete\("m1\.access\.website"\);/.test(P)) fail("there's no way out of Updating without reloading (Cancel)");
if (!/if \(!j\.platforms \|\| !Object\.keys\(j\.platforms\)\.length\) \{/.test(P)) fail("a failed builder detection hides the builder list (it falls back to the file, minus RGA's notes)");
if (!/if \(!opts\.local \|\| !_rgaWaitsCache\.has\(clientId\)\) await loadPortalThread\(clientId\);/.test(P) || (P.match(/listEl\._rerender\(listEl\._onboarding, undefined, undefined, undefined, true\);/g) || []).length < 3) fail("a screen-only redraw (Update / Cancel / call tracking Change) makes server trips again (it took 2.8–4.7 s)");
// ── the builder cards (approved step3_builder_cards_v1, 10-22) — RUN for every builder in the file
{
  const grab = (re, what) => { const m = P.match(re); if (!m) { console.error(`⚠️  ${what} moved`); process.exit(2); } return m[0]; };
  const fnSrc = (name) => { const at = P.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  ${name} moved`); process.exit(2); } let d = 0, i = P.indexOf("{", at); for (; i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}" && --d === 0) break; } return P.slice(at, i + 1); };
  const env = `const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;"); const escapeAttribute = escapeHtml;
    ${grab(/^const ACC_SEND = \{[^\n]*\};$/m, "ACC_SEND")}
    ${fnSrc("accSetupHtml")} ${fnSrc("accMono")} return { accSetupHtml, accMono };`;
  let R; try { R = new Function(env)(); } catch (e) { console.error(`⚠️  the card code won't run: ${e.message}`); process.exit(2); }
  for (const [k, p] of Object.entries(PL)) {
    if (!/^#[0-9a-f]{6}$/i.test(p.color || "")) fail(`${k}: no tile colour in site-platforms.json`);
    let h = ""; try { h = R.accSetupHtml(p, "example.com") + R.accMono(k, p); } catch (e) { fail(`${k}: the card throws (${e.message})`); continue; }
    const rows = (h.match(/class="pm-ax-st/g) || []).length;
    if (!/class="pm-ax-give"/.test(h) || rows < (p.steps || []).length) fail(`${k}: the card lacks "what to give us" or numbered steps (${rows} rows for ${(p.steps || []).length} steps)`);
    if (/Come back and tap/.test(h)) fail(`${k}: the instructions repeat Step 3 ("Come back and tap…")`);
    if (p.kind === "code" && !/class="pm-ax-st last"/.test(h)) fail(`${k}: the code builder lost its store + code row`);
    if (p.kind === "code" && (!/data-acc-store/.test(h) || !/data-acc-code/.test(h) || /Invite this email/.test(h))) fail(`${k}: the code builder asks for an email invite, or lacks the store + code fields`);
    if (p.kind === "workaround" && /Invite this email/.test(h)) fail(`${k}: a no-invite builder asks for an invite`);
    if (["invite", "designer"].includes(p.kind) && !/Invite this email/.test(h)) fail(`${k}: an invite builder doesn't show the email to invite first`);
    if (p.plan && !/<b>Before you start<\/b>/.test(h)) fail(`${k}: a plan requirement isn't "Before you start"`);
    if (/\{site\}/.test(JSON.stringify(p.steps)) && !/On your site/.test(R.accSetupHtml(p, ""))) fail(`${k}: with no web address on file a step ends without its page path`);
  }
  if ((PL.shopify?.steps || []).some((x) => /^Type it below/.test(x.t))) fail("Shopify repeats its last step (\"Type it below…\")");
  if (!/\.pm-ax-give \.pm-ax-copy \{ max-width:100%; min-width:0; \}/.test(CSS)) fail("the email chip can overflow its box again (Chris 10-22)");
  if (!/\.pm-ax-sel \.pm-ax-mono \{ color:#fff; \}/.test(CSS)) fail("the builder's initials are greyed out again");
}
// ── the save
if (!/\["invite", "designer", "none", "request", "workaround"\]\.includes\(o\.via\)/.test(INP) || !/\["invite", "designer", "request", "workaround"\]\.includes\(parsed\.value\.via\)/.test(INP)) fail("the save doesn't take the request / checklist paths (or finishes them without RGA)");
if (!/\^\[a-z0-9\]\[a-z0-9-\]\*\\\.myshopify\\\.com\$/.test(INP) || !/\^\\d\{4\}\$/.test(INP)) fail("the Shopify store / 4-digit code isn't checked");
if (!/shopify: \{ store: task\.client_input\.shopify\.store \}/.test(CONF)) fail("the Shopify code is kept after access is confirmed");
// ── admin
if (/const ACC_ROLE = \{/.test(ADM) || !/fetch\("\/data\/site-platforms\.json"\)/.test(ADM)) fail("admin keeps its own copy of the roles instead of reading site-platforms.json");
if (!/<b>RGA's move:<\/b>/.test(ADM) || !/<b>Collaborator code:<\/b>/.test(ADM)) fail("admin row 8 doesn't say RGA's move per builder (or the Shopify code)");
// ── the conversation at the bottom
const rh = P.slice(P.indexOf("  const rowHtml = ("), P.indexOf("  // 🔴 SETUP POINTS, IT DOES NOT DUPLICATE."));
const iDetail = rh.indexOf('<div class="pm-detail" data-action-detail='), iThread = rh.indexOf("threadHtml(step.id)"), iCtl = rh.indexOf("${completionCtl ? (() => {");
if (iThread < 0 || iDetail < 0 || iThread < iDetail || iThread < iCtl) fail("the step conversation isn't at the bottom of the row (it sits above the card again)");
if (!/<details class="pm-mail pm-convo"\$\{talk\.some\(\(m\) => unreadIds\.has\(m\.id\)\) \? " open" : ""\}>/.test(P)) fail("the conversation isn't a closed row that opens for an unread reply");
if (F.length) { console.error("🔴 step 3 website access regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ step 3 holds: ${Object.keys(PL).length} builders from one audited source (no admin copy), checklist where no safe invite, Shopify code, Webflow request, Custom-coded · detector (Square>Weebly, Showit>WordPress, Framer>Shopify, hand-coded none, untested only asks) · no RGA notes to the client · done never asks · tiles + Change · setup links + chips that don't wrap · new paths + Shopify checked, code dropped · conversation at the bottom, closed unless unread`);
