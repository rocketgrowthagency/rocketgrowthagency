#!/usr/bin/env node
// check-dialog-tone.mjs — every popup in the admin and the client portal wears the kind its WORDS and its ACTION say it is.
//
// 11-10: the free/busy grant dialog ("This sends you to Google to approve one extra permission") wore the orange THIS REACHES THE
// CLIENT pill, because rgaInferTone read "sends" as mail leaving the building. It reaches no client.
// 11-11 (master audit #3, website reports/master-audit/ui.md): 87 of 211 dialogs wore the wrong kind. 63 error alerts and 13
// instructions showed a green DONE pill (an alert defaulted to `result`), Google writes and a live-site merge were INTERNAL, and
// eight outward actions (Approve all, Publish description, the booking link, the two drift restores, the Messages reply, the
// confirmation email, the portal core-change Approve) asked nothing at all. This gate scans EVERY rgaDialog / rgaConfirm /
// rgaAlert / rgaPrompt / portalConfirm / portalModal / portalAlert call in admin/*.js and portal/*.js and classifies each:
//   · an alert whose words are an error ("couldn't", "failed", "didn't", "error", a caught err.message) → tone failure, never DONE
//   · an alert that is an instruction ("Pick a plan.", "… first.") → never DONE
//   · a confirm whose action emails, invites, or writes Google or a website → the outward kind (portal: turn), or PERMANENT
//   · a confirm whose action deletes or voids → PERMANENT
//   · a confirm that puts something in front of the client in their portal, with nothing emailed → the outward kind too (11-11)
// plus the audit's wrong kinds pinned at their call sites, the outward actions that must ask first, the call console popups, the
// background-read wording and the kinds themselves. The small allow-list below says why each exception is right.
// --against=<rev> reads that rev of the website (red on the before state).
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rev = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const read = (rel) => rev ? execFileSync("git", ["-C", SITE, "show", `${rev}:${rel}`], { encoding: "utf8", maxBuffer: 64 << 20 }) : fs.readFileSync(`${SITE}/${rel}`, "utf8");
const list = (dir) => rev
  ? execFileSync("git", ["-C", SITE, "ls-tree", "--name-only", `${rev}:${dir}`], { encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".js")).map((f) => `${dir}/${f}`)
  : fs.readdirSync(`${SITE}/${dir}`).filter((f) => f.endsWith(".js")).map((f) => `${dir}/${f}`);
let src;
try { src = read("admin/admin.js"); } catch (e) { console.log(`⚠️  INDETERMINATE — cannot read admin/admin.js (${e.message})`); process.exit(2); }
const bad = [];

// ── 1 · rgaInferTone, lifted and held to cases both ways ───────────────────────────────────────────────────────────
const m = src.match(/function rgaInferTone\(message, danger\) \{[\s\S]*?\n\}/);
if (!m) { console.log("❌ rgaInferTone not found in admin/admin.js"); process.exit(1); }
const infer = new Function(`${m[0]}; return rgaInferTone;`)();
const CASES = [
  ["Let RGA read your Google free/busy?\n\nThis sends you to Google to approve one extra permission.", "routine"],
  ["Send the invite?\n\nNathan gets a Google Meet invite.", "outward"],
  ["Email the Month 1 report to the client?", "outward"],
  ["Resend the magic link?", "outward"],
  ["This sends the agreement to the client.", "outward"],
  ["Delete this block?", "danger"],
  ["Save these hours?", "routine"],
];
for (const [msg, want] of CASES) { const got = infer(msg, false); if (got !== want) bad.push(`rgaInferTone: "${msg.split("\n")[0]}" → ${got}, want ${want}`); }
// the free/busy call site states its tone, so a later wording change cannot repaint it
if (!rev && !/tone: "routine", message:\s*\n\s*"Let RGA read your Google free\/busy\?/.test(src)) bad.push("the free/busy grant dialog does not state tone: \"routine\"");
const confirmDanger = (() => { const d = src.match(/function rgaConfirm\(message\) \{ return rgaDialog\(\{ message, kind: "confirm", danger: (\/[^\n]*?\/i)\.test/); return d ? new Function(`return ${d[1]};`)() : null; })();
if (!confirmDanger) bad.push("rgaConfirm's danger test was not found (the gate mirrors it to know what a bare rgaConfirm renders)");

// ── 2 · the kinds: a failure kind exists on BOTH sides, red like PERMANENT, and alerts can be given a tone ────────────
let portal = ""; try { portal = read("portal/portal.js"); } catch { bad.push("portal/portal.js could not be read"); }
if (!/failure:\s*\{\s*cls:\s*"is-bad",\s*pill:\s*"NOT SENT"\s*\}/.test(src)) bad.push("admin RGA_DIALOG_KIND.failure is not the red NOT SENT kind");
if (!/if \(t === "failure" && !RGA_FAIL_SEND\.test\([^\n]*\)\) return "DIDN'T WORK";/.test(src)) bad.push("admin: a failure that is not a send does not read DIDN'T WORK");
if (!/function rgaAlert\(message, opts\) \{ return rgaDialog\(\{ \.\.\.\(opts \|\| \{\}\), message, kind: "alert" \}\); \}/.test(src)) bad.push("admin rgaAlert does not forward { tone } (every alert would be DONE)");
if (!/rgaKindPill\(t, k, head, pill\)/.test(src)) bad.push("admin rgaDialog does not draw its pill through rgaKindPill");
if (!/failure:\s*\{\s*edge:\s*"var\(--portal-error[^"]*\)",\s*pill:\s*"DIDN'T WORK",\s*bg:\s*"var\(--portal-error-bg[^"]*\)",\s*fg:\s*"var\(--portal-error[^"]*\)"\s*\}/.test(portal)) bad.push("portal PORTAL_MODAL_KIND has no red failure kind (red edge + DIDN'T WORK pill)");
if (!/t === "failure" && PORTAL_FAIL_SEND\.test\(/.test(portal)) bad.push("portal: a failed send does not read NOT SENT");

// ── 3 · every call site, classified from its words and its action ───────────────────────────────────────────────────
const NAMES = ["rgaDialog", "rgaConfirm", "rgaAlert", "rgaPrompt", "portalConfirm", "portalModal", "portalAlert"];
// one scanner for strings, templates and nesting; `stop(c, depth)` ends the walk
function walk(s, i, stop) {
  const st = [];
  for (; i < s.length; i++) {
    const c = s[i], top = st[st.length - 1];
    if (top === "'" || top === '"') { if (c === "\\") i++; else if (c === top) st.pop(); continue; }
    if (top === "`") { if (c === "\\") i++; else if (c === "`") st.pop(); else if (c === "$" && s[i + 1] === "{") { st.push("${"); i++; } continue; }
    // a comment inside an option object ("// 🔑 Proof-read in the page font…") holds apostrophes that are not quotes
    if (c === "/" && s[i + 1] === "/" && s[i - 1] !== ":" && s[i - 1] !== "\\") { const n = s.indexOf("\n", i); if (n < 0) return -1; i = n; continue; }
    if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i) + 1; if (i <= 0) return -1; continue; }
    if (c === "'" || c === '"' || c === "`") { st.push(c); continue; }
    if (c === "{" || c === "(" || c === "[") { st.push(c); const r = stop(c, st.length, i); if (r !== undefined) return r; continue; }
    // a closer reports the depth it leaves: -1 when it closes something opened before the walk began
    if (c === "}" || c === ")" || c === "]") { const before = st.length; st.pop(); const r = stop(c, before - 1, i); if (r !== undefined) return r; continue; }
    const r = stop(c, st.length, i); if (r !== undefined) return r;
  }
  return -1;
}
// the matching ")" of a call that opens at s[open] === "("
const argEnd = (s, open) => walk(s, open, (c, d, i) => (c === ")" && d === 0 ? i : undefined));
// the depth-0 objects of an argument: a ternary of two option objects is two dialogs
function topObjects(a) {
  const out = []; let start = -1;
  walk(a, 0, (c, d, i) => { if (c === "{" && d === 1) start = i; else if (c === "}" && d === 0 && start >= 0) { out.push(a.slice(start, i + 1)); start = -1; } return undefined; });
  return out;
}
// the words a string-ish expression would show (string + template text; ${…} becomes a gap)
const words = (expr) => (String(expr || "").match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [])
  .map((q) => q.slice(1, -1).replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, " … ").replace(/\\n/g, "\n").replace(/\\(.)/g, "$1")).join(" ");
// the expression after `key:` at depth 1 of an object literal
function prop(obj, key) {
  let found = null;
  walk(obj, 0, (c, d, i) => {
    if (found !== null || d !== 1) return found !== null ? -2 : undefined;
    if (!/[\s,{]/.test(c)) return undefined;
    const mm = obj.slice(i + 1).match(new RegExp(`^\\s*${key}:\\s*`));
    if (!mm) return undefined;
    const s0 = i + 1 + mm[0].length;
    const e = walk(obj, s0, (c2, d2, j) => ((c2 === "," && d2 === 0) || ((c2 === "}" || c2 === ")" || c2 === "]") && d2 < 0) ? j : undefined));
    found = obj.slice(s0, e < 0 ? obj.length - 1 : e);
    return -2;
  });
  return found;
}
const ERR = /\bcould(?:n['’]t| not)\b|\bcan['’]t\b|\bcannot\b|\bfail(?:ed|s|ure)?\b|\bdidn['’]t\b|\bdid not\b|\bwasn['’]t\b|\bnot loaded\b|\berror\b|\bexpired\b|\bblocked\b|\btry again\b|\bretry\b|\bsign in again\b|\btimed out\b|\bnothing (?:was|is) (?:changed|removed|saved|sent)\b|\bstill (?:there|with)\b/i;
const ERR_CODE = /\bclientError\(|\berr2?\.(?:message|said)\b|\be\.message\b|\bj\.error\b|\bres\.error\b|\bout\.error\b|\bdata\.error\b/;
const INSTR = /^\s*(?:caution\b|pick\b|enter\b|paste\b|say\b|tell us\b|run\b|choose\b|select\b|type\b|fill\b|write\b|give\b|finish\b|only\b|please\b|no \w+ (?:selected|chosen)\b)|\bfirst\.?\s*$|\bfirst\.\s|\bwith no (?:text|note)\b|\bit['’]s done once\b/i;
// what a confirm's ACTION does. Negated clauses ("Nothing goes on Google until…", "it is NOT sent") are not the action.
const NEG = /\b(?:nothing|not|never|no|without|don['’]t|isn['’]t)\b[^.?!\n]*/gi;
const EMAIL = /\bemail(?:s|ed)?\b|\binvit(?:e|es|ation)\b|\bmagic link\b|\bresend\b|\bsend(?:s|ing)?\b(?!\s+you\s+to\b)|\bnotified\b/i;
const GOOGLE_WRITE = /\b(?:put|add|publish|push|post|send|write|restore|replace)\w*\b(?!\s+you\b)[^.?!\n]{0,60}?\b(?:on|to|onto) (?:[\w'’]+ ){0,4}?Google\b|\b(?:put|add|publish|push|restore)\w*\b[^.?!\n]{0,40}?\bGoogle (?:profile|listing|service area)\b/i;
const SITE_WRITE = /\bmerge\b|\bpull request\b|\bpublish(?:es)?\b[^.?!\n]{0,40}\b(?:site|website|blog|page)\b/i;
const DELETE = /\bdelete\b|\bvoid\b|\bpermanently\b|\berase\b/i;
// 🔒 11-11 (ui master, Chris approved; gap "no rule for 'the client sees it in the portal but nothing is emailed'"): A CHANGE THE
// CLIENT WILL SEE IN THEIR PORTAL REACHES THE CLIENT, EMAIL OR NOT. "Send this change to the client?" was orange while "request
// OAuth" (a big Grant Google Access button on their portal) and "ask to put the category back" (an ask in their For your
// approval) were INTERNAL. The rule: words that put something in front of the client in their portal → the outward kind
// (portal side: turn), the same as an email. Held both ways by PORTAL_SEE_CASES below.
const PORTAL_SEE = /\b(?:in|on) (?:their|the client['’]s) (?:client )?portal\b|\b(?:the client|they) (?:will |['’]ll )?(?:see|sees)\b[^.?!\n]{0,40}\bportal\b|\bFor your approval\b|\bsend (?:this|it|that)(?: change)?(?: back)? to the client\b|\b(?:puts?|adds?) an ask\b|\bask the client to\b/i;
const PORTAL_SEE_CASES = [
  ["Mark setup complete and request OAuth from Acme? The client will see a big \"Grant Google Access\" button in their portal.", true],
  ["Ask the client to put their main category back to Plumber? It goes to their For your approval.", true],
  ["Send this to the client? They will see it in their portal immediately.", true],
  ["Go to their portal in a new tab?", false],
  ["Save these hours?", false],
  ["Promote Acme to a client record?", false],
];
for (const [msg, want] of PORTAL_SEE_CASES) {
  const got = PORTAL_SEE.test(msg.replace(NEG, " "));
  if (got !== want) bad.push(`PORTAL_SEE: "${msg.slice(0, 60)}" → ${got ? "reaches the client" : "internal"}, want ${want ? "reaches the client" : "internal"}`);
}

const FILES = [...list("admin"), ...list("portal")];
const sites = [];
for (const f of FILES) {
  let s; try { s = read(f); } catch { continue; }
  const re = new RegExp(`(?<![\\w.])(${NAMES.join("|")})\\(`, "g"); let mm;
  while ((mm = re.exec(s))) {
    if (/function\s*$/.test(s.slice(Math.max(0, mm.index - 9), mm.index))) continue;
    // a call inside a // comment line is not a call
    const ls = s.lastIndexOf("\n", mm.index) + 1; if (/^\s*(?:\/\/|\*)/.test(s.slice(ls, mm.index))) continue;
    const open = mm.index + mm[1].length, end = argEnd(s, open); if (end < 0) continue;
    sites.push({ file: f, line: s.slice(0, mm.index).split("\n").length, fn: mm[1], arg: s.slice(open + 1, end) });
  }
}
// 🔑 THE ALLOW-LIST. Each entry: [file, the call's whole argument or a unique piece of it, why the rule does not apply]
const ALLOW = [
  ["admin/admin.js", "{ ...(opts || {}), message, kind: \"alert\" }", "rgaAlert's own body: its callers are checked one by one"],
  ["admin/admin.js", "{ message, kind: \"confirm\", danger:", "rgaConfirm's own body: its callers are checked through the mirrored danger test"],
  ["admin/admin.js", "{ message, kind: \"prompt\", defaultValue }", "rgaPrompt's own body"],
  ["admin/admin.js", "=m", "the window.alert shim: zero native alerts remain (check-no-native-browser-dialogs), so it has no caller to classify"],
  ["admin/admin.js", "Publish this post on Rocket Growth Agency's own blog", "RGA's OWN blog: no client sees or receives it, so THIS REACHES THE CLIENT would be false"],
  ["admin/admin.js", "=ask", "the data-gs-ask texts (suspension: Tell the client / Google lifted it) live on the button beside each action"],
  ["admin/admin.js", "=promptCopy", "advance a stage: promptCopy is built a few lines up from two stage sentences; nothing leaves the building"],
  ["portal/portal.js", "=typeof opts === \"string\" ? { message: opts } : opts", "portalConfirm's own body"],
  ["portal/portal.js", "Object.assign({ alertOnly: true, confirmText: \"OK\" }", "portalAlert's own body"],
  ["portal/portal.js", "=_oauthAbandoned", "resolveGoogleGrantOutcome() returns tone \"turn\" + NOT CONNECTED explicitly"],
];
const allowed = (x) => ALLOW.find(([f, piece]) => f === x.file && (piece.startsWith("=") ? x.arg.trim() === piece.slice(1) : x.arg.includes(piece)));
const usedAllow = new Set();
const at = (x) => `${x.file}:${x.line}`;
const short = (t) => String(t).replace(/\s+/g, " ").trim().slice(0, 90);
let checked = 0;
for (const x of sites) {
  const al = allowed(x); if (al) { usedAllow.add(al); continue; }
  const side = x.file.startsWith("portal/") ? "portal" : "admin";
  const objs = topObjects(x.arg);
  const startsObj = /^\s*\{/.test(x.arg);
  // a ternary of two option objects is two dialogs; otherwise one (a string, or a string + rgaAlert's trailing { tone })
  const branches = objs.length > 1 && /\?\s*\{/.test(x.arg) ? objs : [null];
  for (const br of branches) {
    checked++;
    const obj = br || (startsObj ? objs[0] : null);
    const optObj = !obj && objs.length ? objs[objs.length - 1] : null;   // rgaAlert(message, { tone: "failure" })
    const msgExpr = optObj ? x.arg.slice(0, x.arg.lastIndexOf(optObj)) : x.arg;
    const toneExpr = (obj && prop(obj, "tone")) || (optObj && prop(optObj, "tone"));
    const tones = toneExpr ? (toneExpr.match(/"(\w+)"/g) || []).map((t) => t.slice(1, -1)) : [];
    if (toneExpr && !tones.length) { bad.push(`${at(x)}: tone is not a literal (${short(toneExpr)}); a gate cannot read a computed kind`); continue; }
    const kindLit = obj ? String(prop(obj, "kind") || "").replace(/"/g, "") : "";
    const isAlert = /Alert$/.test(x.fn) || kindLit === "alert" || !!(obj && /\balertOnly:\s*true\b/.test(obj));
    // the words a person reads: not the kind keys themselves (tone: "failure" is not the word "failure" on screen)
    const all = obj ? words(obj.replace(toneExpr ? `tone: ${toneExpr}` : "\u0000", "").replace(/\bkind:\s*"\w+"/, "")) : words(msgExpr);
    // the ACTION: title, button and consequence; with no title, rgaDialog splits `message` into the title, so the message is the action
    const action = (obj ? [prop(obj, "title") == null ? "message" : "title", "okLabel", "confirmText", "consequence"].map((k) => words(prop(obj, k))).join(" · ") : all).replace(NEG, " ");
    // what it renders today
    let shows = tones;
    if (!shows.length) {
      if (side === "admin") {
        const dangerFlag = !!(obj && /\bdanger:\s*true\b/.test(obj)) || (x.fn === "rgaConfirm" && !!confirmDanger && confirmDanger.test(all));
        shows = [isAlert ? "result" : infer(all, dangerFlag)];
      } else shows = [obj && /\bdanger:\s*true\b/.test(obj) ? "danger" : isAlert ? "result" : "routine"];
    }
    const has = (...k) => shows.some((t) => k.includes(t));
    const OUT = side === "portal" ? "turn" : "outward";
    if (isAlert) {
      const code = obj || msgExpr;
      const isErr = ERR.test(all) || ERR_CODE.test(code);
      const isInstr = INSTR.test(all);
      const blind = !all.replace(/[\s…]/g, "") && !isErr;   // portalAlert(msg): no words to read, so the kind must be stated
      if (blind && !tones.length) bad.push(`${at(x)} ${x.fn}: its message is a variable (${short(code)}), so it must state its tone; it shows DONE`);
      else if (isErr && !isInstr && !shows.every((t) => t === "failure")) bad.push(`${at(x)} ${x.fn}: an ERROR shows ${shows.join("/")} (want failure): "${short(all || code)}"`);
      else if ((isErr || isInstr) && has("result")) bad.push(`${at(x)} ${x.fn}: an ${isInstr ? "INSTRUCTION" : "ERROR"} shows DONE (want ${isInstr ? "routine" : "failure"}): "${short(all || code)}"`);
    } else {
      if (DELETE.test(action) && !has("danger")) bad.push(`${at(x)} ${x.fn}: a DELETE / VOID shows ${shows.join("/")} (want danger, PERMANENT): "${short(action)}"`);
      // the portal-visible rule reads the WHOLE dialog (the consequence often lives in the message: "The client will see …")
      else if (!DELETE.test(action) && !EMAIL.test(action) && !GOOGLE_WRITE.test(action) && !SITE_WRITE.test(action) && PORTAL_SEE.test(all.replace(NEG, " ")) && !has(OUT, "danger"))
        bad.push(`${at(x)} ${x.fn}: a change the client sees in their portal (nothing emailed) shows ${shows.join("/")} (want ${OUT}, the same as an email): "${short(all)}"`);
      else if (!DELETE.test(action) && (EMAIL.test(action) || GOOGLE_WRITE.test(action) || SITE_WRITE.test(action)) && !has(OUT, "danger"))
        bad.push(`${at(x)} ${x.fn}: an action that ${EMAIL.test(action) ? "emails / invites" : GOOGLE_WRITE.test(action) ? "writes Google" : "writes a website"} shows ${shows.join("/")} (want ${OUT}): "${short(action)}"`);
    }
  }
}
for (const a of ALLOW) if (!usedAllow.has(a)) bad.push(`allow-list entry no longer matches a call (remove it): ${a[0]} "${short(a[1])}"`);
if (sites.length < 150) bad.push(`only ${sites.length} dialog call sites found (the audit counted 211): the scan has gone blind`);

// ── 4 · the audit's wrong kinds, pinned at their call sites ─────────────────────────────────────────────────────────
const PINS = [
  // [file, a piece of the call, the tone it must state, its consequence line (if it needs one)]
  ["admin/admin.js", "title: \"Cancel this kickoff meeting?\"", "outward", /consequence:\s*"They get a cancellation email from Google/],
  ["admin/admin.js", "title: `Restore \"${lead.business_name", "routine"],
  ["admin/admin.js", "with the same ${keyLabel}", "routine"],
  ["admin/admin.js", "title: `Merge #${pr.number}", "outward", /consequence:/],
  ["admin/admin.js", "title: \"Open a pull request on their GitHub?\"", "outward", /consequence:/],
  ["admin/admin.js", "title: \"Put the approved services on Google?\"", "outward"],
  ["admin/admin.js", "title: isAdd ? \"Add them on Google?\"", "outward"],
  ["admin/admin.js", "title: \"Add it to their Google service area?\"", "outward"],
  ["admin/admin.js", "title: `Google doesn't list ${place}?`", "outward", /consequence:/],
  ["admin/admin.js", "request Google access from", "outward", /consequence:/],
  ["admin/admin.js", "Ask the client to put their main category back", "outward", /consequence:/],
];
for (const [f, piece, tone, cons] of PINS) {
  const hit = sites.find((x) => x.file === f && x.arg.includes(piece));
  if (!hit) { bad.push(`pinned dialog not found: ${f} "${piece}"`); continue; }
  if (!new RegExp(`\\btone:[^,]*"${tone}"`).test(hit.arg)) bad.push(`${at(hit)}: "${short(piece)}" must state tone: "${tone}"`);
  if (cons && !cons.test(hit.arg)) bad.push(`${at(hit)}: "${short(piece)}" must carry its consequence line`);
}

// ── 5 · outward actions ASK FIRST: a dialog with the outward kind and a consequence before the request leaves ──────────
const ASK_FIRST = [
  // [file, the anchor of the handler, the request it guards, what it is]
  ["admin/admin.js", "allBtn.addEventListener(\"click\"", "updatePortalContentState", "Approve all (publishes to every client's portal)"],
  ["admin/admin.js", "closest(\"[data-desc-publish]\")", "gbp-publish", "Publish the description to Google"],
  ["admin/admin.js", "closest?.(\"[data-bk36-put]\")", "admin-gbp-booking", "put the booking link on Google"],
  ["admin/admin.js", "closest(\"[data-onc-drift]\")", "admin-gbp-drift", "Put it back on Google (Monthly profile watch)"],
  ["admin/admin.js", "closest(\"[data-drift]\")", "admin-gbp-drift", "Put it back on Google (the Changed on Google card)"],
  ["admin/admin.js", "async function sendClientReply(btn)", "portal-reply", "the reply that emails the client (Messages queue + activity)"],
  ["admin/admin.js", "querySelectorAll(\"[data-send-confirmation]\")", "send-confirmation-email", "the confirmation email"],
  ["portal/portal.js", "closest(\"[data-core-answer]\")", "core-change", "the client's core-change Approve / Put back (goes to Google)"],
];
for (const [f, anchor, req, what] of ASK_FIRST) {
  const s = f === "admin/admin.js" ? src : portal;
  const a = s.indexOf(anchor);
  if (a < 0) { bad.push(`ask-first: the handler for ${what} was not found ("${anchor}")`); continue; }
  const r = s.indexOf(req, a);
  if (r < 0 || r - a > 6000) { bad.push(`ask-first: ${what}: its request "${req}" was not found in the handler`); continue; }
  const body = s.slice(a, r);
  const OUT = f.startsWith("portal") ? "turn" : "outward";
  const asks = [];
  const re = /\b(?:rgaDialog|portalConfirm)\(/g; let mm;
  while ((mm = re.exec(body))) { const e = argEnd(body, mm.index + mm[0].length - 1); if (e > 0) asks.push(body.slice(mm.index, e)); }
  if (!asks.some((d) => new RegExp(`tone:\\s*"${OUT}"`).test(d) && /consequence:/.test(d))) bad.push(`ask-first: ${what} sends with no ${OUT} dialog + consequence before it`);
}

// ── 6 · the call console's three popups go through rgaDialog (a kind and an X), never a bespoke .cc-modal ────────────
let calls = ""; try { calls = read("admin/calls.js"); } catch { bad.push("admin/calls.js could not be read"); }
if (/class="cc-modal"|cc-modal-backdrop/.test(calls)) bad.push("admin/calls.js still draws its own .cc-modal popup (no X, no kind pill)");
for (const fn of ["askCallback", "askObjection", "askCommitment"]) {
  const body = (calls.match(new RegExp(`function ${fn}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`)) || [""])[0];
  if (!/\bccDialog\(\{[\s\S]*?tone:\s*"routine"/.test(body)) bad.push(`admin/calls.js ${fn} does not open through rgaDialog (ccDialog) with tone "routine"`);
}
if (!/const ccDialog = \(o\) => \(typeof window !== "undefined" && window\.rgaDialog \?/.test(calls)) bad.push("admin/calls.js has no ccDialog bridge to the admin's rgaDialog");
if (!/window\.rgaDialog = rgaDialog;/.test(src)) bad.push("admin.js does not hand rgaDialog to the self-contained call console (window.rgaDialog)");

// ── 7 · a background READ is not a write: no "Nothing changed" on page load; one wording; small copy bugs ────────────
const wc = (src.match(/async function wcAction\(btn, stepId, body\) \{[\s\S]*?\n\}/) || [""])[0];
if (!wc) bad.push("wcAction not found");
else if (!/if \(!btn\) \{ console\.warn\(RGA_READ_FAIL\(/.test(wc)) bad.push("wcAction: a background read (no button pressed) pops \"Nothing changed: …\" on page load");
if (!/const RGA_READ_FAIL = \(what\) => `Couldn't load \$\{what\} just now\.`;/.test(src)) bad.push("admin: the one background-read wording (RGA_READ_FAIL: \"Couldn't load … just now.\") is missing");
if (!/const PORTAL_READ_FAIL = \(what\) => `Couldn't load \$\{what\} just now\.`;/.test(portal)) bad.push("portal: the one background-read wording (PORTAL_READ_FAIL) is missing");
if (/setBanner\(error\.message \|\| "Could not load/.test(src)) bad.push("admin: a failed load still says \"Could not load …\" instead of RGA_READ_FAIL");
if (/escapeHtml\(keptNote\) \+ "\."/.test(portal)) bad.push("portal Reviews: \"Couldn't read Google just now..\" (a period added after a sentence that has one)");
if (/Rechecked monthly/.test(portal)) bad.push("portal Rankings says \"Rechecked monthly\"; _rank-schedule scans twice a month (and Ongoing says so)");

if (bad.length) { console.log(`❌ ${bad.length} dialog problem(s):`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
console.log(`✅ dialog kinds hold: ${sites.length} call sites (${checked} dialogs) classified from their words and action; errors DIDN'T WORK / NOT SENT, never DONE; mail, Google and website writes THIS REACHES THE CLIENT; deletes PERMANENT; ${ASK_FIRST.length} outward actions ask first; the call console uses rgaDialog; background reads say "Couldn't load … just now" (${ALLOW.length} allow-listed, each with its reason)`);
