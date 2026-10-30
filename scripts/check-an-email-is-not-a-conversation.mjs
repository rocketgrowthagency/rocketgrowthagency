#!/usr/bin/env node
// check-an-email-is-not-a-conversation.mjs — on a step, an email RGA sent is one row that opens in place; the
// conversation (heading + reply box) shows only when there is one; otherwise one quiet "Ask" line opens the same box; the
// duplicate-removal letter files under step 6.
//
// 🔒 WHY (approved step_emails_not_conversation_v1 v2, 2026-10-15). Chris on step 7: "why is this inside the upload photos
// card? … this is verify GBP right? … and its not a conversation either?" Every email copy sat under "Your conversation
// about this step" with a reply box, and the duplicate letter showed on step 7 because it was also the step-7-open email.
// The portal's own threadHtml (lifted) is drawn in Chrome with the shipped portal.css.
// 2026-10-30 night fixer: threadHtml asks CS_STEPS since the client card system (client_card_system_v1, part 6) — the lift adds
// csBlock + monthDay. The old shapes are held on a step NOT on the system (step 10, on hold); a system step (client step 2) is held
// to the approved shape: ONE closed "Messages · N" row (date · newest line) holding the same email rows, then "Questions about this
// step? Ask RGA ›" always — no "Your conversation" row, no second reply box, a test send never shown.
import fs from "node:fs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js");
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf("{", m.index); k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const lifted = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), pick(/^function fmtDateTimeDot\(/m), pick(/^function letterHtml\(/m),
  pick(/^function threadHtml\(/m), line("MAIL_ICON"), pick(/^function threadBlock\(/m), pick(/^function typeLinesHtml\(/m), line("DUP_PHOTO_STEP"), line("STORE_ICON"), line("GOOGLE_G"), line("MSG_ICON"), pick(/^function unreadReplies\(/m), pick(/^function renderReplyPointer\(/m), line("monthDay")];
if (lifted.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a thread helper moved (${lifted.findIndex((x) => !x)})`); process.exit(2); }

// ── the server files the duplicate letter under step 6, and only that one ──
const fn = read("netlify/functions/portal-thread.js").replace(/^[ \t]*\/\/.*$/gm, "");
if (!/step_id: r\.payload\?\.reason === "duplicate_confirmed_gone" \? "m1\.gbp\.verify" : \(r\.payload\?\.step_id \|\| null\),/.test(fn)) fail("the duplicate-removal letter isn't filed under step 6 (or every letter is)");
if (!/const box = form\.closest\("\.pm-thread, \.pm-ask"\);/.test(portal)) fail("a question sent from the quiet Ask line has nowhere to say it was sent");

let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: read("portal/portal.css") });
  await page.addScriptTag({ content: `var _portalThread = [];\nvar _portalThreadSeenAt = null;\n${lifted.join("\n")}\n${csBlock(portal, lifted.join("\n"))}` });
  // ── the Setup banner says what arrived (Chris 10-15: an email RGA sent is not a reply) ──
  const said = await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<div data-reply-pointer></div><nav class="portal-nav"><a data-view="setup">Setup</a></nav>');
    const L = (id, extra = {}) => ({ id, from: "rga", step_id: "m1.gbp.verify", message: "Subject\n\nBody", letter: true, at: "2026-10-15T18:40:00Z", ...extra });
    const R = (id) => ({ id, from: "rga", step_id: "m1.tracking.call_setup", message: "Here's how.", where: "Step 3", at: "2026-10-15T19:00:00Z" });
    const out = {};
    for (const [k, list] of Object.entries({ one: [L("a")], two: [L("a"), L("b")], reply: [R("r")], replies: [R("r"), R("s")], mix: [R("r"), L("a")], test: [L("a", { test: true })] })) {
      _portalThread = list; renderReplyPointer();
      out[k] = { text: (document.querySelector("[data-reply-pointer]").innerText || "").replace(/\s+/g, " ").trim(), badge: document.querySelector(".pm-navdot")?.textContent || "" };
    }
    return out;
  });
  // 🔄 "do recommendation" (10-15): an email copy never raises the banner or the badge; only a reply does
  const want = { one: ["", ""], two: ["", ""], reply: ["Rocket Growth Agency replied about Step 3", "1"], replies: ["Rocket Growth Agency replied about Step 3 · 2 new", "2"], mix: ["Rocket Growth Agency replied about Step 3", "1"], test: ["", ""] };
  for (const [k, [text, badge]] of Object.entries(want)) {
    const got = said[k];
    if (!(text ? got.text.startsWith(text) && !got.text.slice(text.length).replace(/Read it →/, "").trim() : !got.text) || got.badge !== badge) fail(`the Setup banner says "${got.text}" (badge ${got.badge || "none"}) for ${k}; it should say "${text}"${badge ? ` (badge ${badge})` : " and nothing"}`);
  }
  const r = await page.evaluate(() => {
    const letter = { id: "1", from: "rga", step_id: "m1.gbp.verify", message: "Confirmed: your duplicate Google Business Profile is gone\n\n# ✓ Your duplicate Google Business Profile is gone\n\nHi Chris, Google confirmed it.", letter: true, at: "2026-10-15T18:40:00Z" };
    const test = { ...letter, id: "2", step_id: "m1.review.first_5", message: "Step 12 is open\n\nHi Chris.", test: true };
    const ask = { id: "3", from: "you", step_id: "m1.tracking.call_setup", message: "Help. Step #", at: "2026-09-18T20:08:00Z" };
    const reply = { id: "4", from: "rga", step_id: "m1.tracking.call_setup", message: "Here's how.", at: "2026-09-18T21:00:00Z" };
    const nudge = { ...letter, id: "5", step_id: "m1.tracking.call_setup", message: "A reminder about call tracking\n\nHi Chris." };
    const general = { id: "6", from: "you", step_id: null, message: "Hello", at: "2026-09-18T20:08:00Z" };
    // step 10 (photos) is ON HOLD — not on the card system, so its old shape is still the right one
    const open10 = { ...letter, id: "7", step_id: "m1.gbp.photos", message: "Step 10 is open\n\n# Add your photos\n\nHi Chris, step 10 is open.", at: "2026-10-16T17:00:00Z" };
    // client step 4 (a system step): an email, the client's question and RGA's unread reply
    const f1 = { ...letter, id: "8", step_id: "m1.gbp.business_facts", message: "Step 4 is open\n\nHi Chris.", at: "2026-10-20T16:00:00Z" };
    const f2 = { id: "9", from: "you", step_id: "m1.gbp.business_facts", message: "Is the phone right?", at: "2026-10-21T16:00:00Z" };
    const f3 = { id: "10", from: "rga", step_id: "m1.gbp.business_facts", message: "Yes, we are testing now.", at: "2026-10-22T16:00:00Z" };
    // client step 3 (a system step) with only a TEST send
    const test3 = { ...letter, id: "11", step_id: "m1.access.website", message: "Step 3 is open\n\nHi Chris.", test: true };
    _portalThread = [letter, test, ask, reply, nudge, general, open10, f1, f2, f3, test3];
    const h = document.getElementById("h");
    const at = (stepId) => { h.innerHTML = threadHtml(stepId); return h; };
    const t = (e) => (e ? e.innerText.replace(/\s+/g, " ").trim() : "");
    const only = at("m1.gbp.photos");
    const onlyR = { rows: only.querySelectorAll(".pm-mails details.pm-mail").length, open: only.querySelector(".pm-mail")?.open, summary: t(only.querySelector(".pm-mail summary")), convo: !!only.querySelector(".pm-thread"), heading: /Your conversation about this step/.test(only.innerHTML),
      ask: !!only.querySelector("details.pm-ask form[data-thread-reply='m1.gbp.photos'] [data-thread-input]"), askMsg: !!only.querySelector("details.pm-ask [data-thread-msg]"), askOpen: only.querySelector("details.pm-ask")?.open, wrap: only.querySelector(".pm-stepmsgs")?.getAttribute("data-thread-for") };
    only.querySelector(".pm-mail summary").click();
    onlyR.opened = !!only.querySelector(".pm-mail[open] .pm-m-letter") && only.querySelector(".pm-mail .pm-m-letter").checkVisibility();
    onlyR.closedHidden = (() => { at("m1.gbp.photos"); return !h.querySelector(".pm-m-letter").checkVisibility(); })();
    // ── a system step (client_card_system_v1 part 6): ONE "Messages · N" row, then "Questions about this step? Ask RGA ›" ──
    const cs = at("m1.gbp.verify"), wrapC = cs.querySelector(".pm-stepmsgs");
    const csR = { kids: wrapC ? [...wrapC.children].map((c) => c.className).join(",") : "", msgsRows: cs.querySelectorAll("details.pm-cs-msgs").length, msgsOpen: cs.querySelector("details.pm-cs-msgs")?.open, msgsSum: t(cs.querySelector("details.pm-cs-msgs > summary")),
      rows: cs.querySelectorAll(".pm-cs-msgs details.pm-mail").length, convo: !!cs.querySelector(".pm-thread, .pm-convo"), heading: /Your conversation/.test(cs.innerHTML), forms: cs.querySelectorAll("form[data-thread-reply]").length,
      ask: !!cs.querySelector(".pm-stepmsgs > details.pm-ask:last-child form[data-thread-reply='m1.gbp.verify'] [data-thread-input]"), askMsg: !!cs.querySelector("details.pm-ask [data-thread-msg]"), askOpen: cs.querySelector("details.pm-ask")?.open, askSum: t(cs.querySelector("details.pm-ask > summary")), wrap: wrapC?.getAttribute("data-thread-for") };
    csR.hiddenWhileClosed = !cs.querySelector(".pm-cs-msgs .pm-mail summary")?.checkVisibility();
    cs.querySelector(".pm-cs-msgs > summary").click();
    csR.mailSum = t(cs.querySelector(".pm-cs-msgs .pm-mail summary"));
    csR.letterHidden = !cs.querySelector(".pm-cs-msgs .pm-m-letter").checkVisibility();
    cs.querySelector(".pm-cs-msgs .pm-mail summary").click();
    csR.opened = !!cs.querySelector(".pm-cs-msgs .pm-mail[open] .pm-m-letter") && cs.querySelector(".pm-cs-msgs .pm-m-letter").checkVisibility();
    const cv = at("m1.gbp.business_facts");
    const cvR = { msgsSum: t(cv.querySelector("details.pm-cs-msgs > summary")), msgsOpen: cv.querySelector("details.pm-cs-msgs")?.open, order: [...(cv.querySelector(".pm-cs-msgs-b")?.children || [])].map((c) => c.className.split(" ")[0]).join(","),
      bubbles: cv.querySelectorAll(".pm-cs-msgs .pm-thread .pm-m").length, mailRows: cv.querySelectorAll(".pm-cs-msgs .pm-mail").length, convoRow: !!cv.querySelector(".pm-convo"), heading: /Your conversation/.test(cv.innerHTML), forms: cv.querySelectorAll("form[data-thread-reply]").length, askLast: !!cv.querySelector(".pm-stepmsgs > details.pm-ask:last-child form[data-thread-reply='m1.gbp.business_facts']") };
    const t3 = at("m1.access.website");
    const t3R = { text: t(t3), msgs: !!t3.querySelector(".pm-cs-msgs, .pm-mail"), ask: !!t3.querySelector("details.pm-ask form[data-thread-reply='m1.access.website']") };
    const quiet = at("m1.gbp.attributes");
    const quietR = { kids: [...(quiet.querySelector(".pm-stepmsgs")?.children || [])].map((c) => c.className).join(","), askSum: t(quiet.querySelector("details.pm-ask > summary")), form: !!quiet.querySelector("form[data-thread-reply='m1.gbp.attributes']") };
    const both = at("m1.tracking.call_setup");
    const bothR = { order: [...both.querySelector(".pm-stepmsgs").children].map((c) => c.className.split(" ")[0]).join(","), bubbles: both.querySelectorAll(".pm-thread .pm-m").length, heading: both.querySelector(".pm-thread .pm-thread-k")?.textContent.trim(), convo: t(both.querySelector(".pm-convo > summary")), convoOpen: both.querySelector(".pm-convo")?.open, convoLast: both.querySelector(".pm-stepmsgs").lastElementChild?.classList.contains("pm-convo"), form: !!both.querySelector(".pm-thread form[data-thread-reply='m1.tracking.call_setup']"), ask: !!both.querySelector(".pm-ask"), rows: both.querySelectorAll(".pm-mail").length };
    const tst = t(at("m1.review.first_5").querySelector(".pm-mail summary"));
    const gen = at(null);
    const genR = { heading: gen.querySelector(".pm-thread-k")?.textContent.trim(), rows: gen.querySelectorAll(".pm-mail").length, form: !!gen.querySelector("form[data-thread-reply='']") };
    return { onlyR, csR, cvR, t3R, quietR, bothR, tst, genR, none: threadHtml("m1.call.close") };
  });
  const o = r.onlyR;
  if (o.rows !== 1 || o.open || !/^Step 10 is open We emailed you · Oct 16, 2026/.test(o.summary) || !/Read$/.test(o.summary)) fail(`an email isn't one closed row with its subject, "We emailed you · date" and Read (${o.summary})`);
  if (!o.opened || !o.closedHidden) fail("Read doesn't open the letter in place, or a closed row shows it");
  if (o.convo || o.heading) fail("a step with only an email still shows \"Your conversation about this step\"");
  if (!o.ask || !o.askMsg || o.askOpen) fail("a step with only an email doesn't offer the quiet Ask line (closed, opening the same reply box)");
  if (o.wrap !== "m1.gbp.photos") fail("the step's messages lost their step marker");
  // 🔒 client_card_system_v1 part 6 (approved 10-29): under a system card, ONE closed "Messages · N" row (date · newest line · Open)
  // holding the email rows, then "Questions about this step? Ask RGA ›" — the email is still one closed row that opens in place
  const c = r.csR;
  if (c.msgsRows !== 1 || c.msgsOpen || !/^Messages · 1 Oct 15 · Confirmed: your duplicate Google Business Profile is gone Open$/.test(c.msgsSum) || !c.hiddenWhileClosed) fail(`a system step's email isn't one closed "Messages · 1" row (date · subject · Open) (${c.msgsSum})`);
  if (c.rows !== 1 || !/^Confirmed: your duplicate Google Business Profile is gone We emailed you · Oct 15, 2026/.test(c.mailSum || "") || !/Read$/.test(c.mailSum || "") || !c.letterHidden || !c.opened) fail(`inside Messages, the email isn't one closed row (subject · We emailed you · date · Read) that opens in place (${c.mailSum})`);
  if (c.convo || c.heading) fail("a system step with only an email still shows a conversation");
  if (c.kids !== "pm-cs-msgs,pm-ask pm-cs-ask" || c.forms !== 1 || !c.ask || !c.askMsg || c.askOpen || c.askSum !== "Questions about this step? Ask RGA ›") fail(`a system step isn't Messages, then ONE closed "Questions about this step? Ask RGA ›" line holding the only reply box (${c.kids} · ${c.askSum} · ${c.forms} forms)`);
  if (c.wrap !== "m1.gbp.verify") fail("a system step's messages lost their step marker");
  const v = r.cvR;
  if (!/^Messages · 3 Oct 22 · Yes, we are testing now\. Hide$/.test(v.msgsSum) || v.msgsOpen !== true || v.order !== "pm-mails,pm-thread" || v.bubbles !== 2 || v.mailRows !== 1 || v.convoRow || v.heading || v.forms !== 1 || !v.askLast) fail(`a system step with an email and a conversation isn't ONE "Messages · 3" row (newest line, open for RGA's unread reply) holding the email then the conversation, with the reply box only in Ask RGA (${JSON.stringify(v)})`);
  if (r.quietR.kids !== "pm-ask pm-cs-ask" || r.quietR.askSum !== "Questions about this step? Ask RGA ›" || !r.quietR.form) fail(`a system step with no messages doesn't keep its "Questions about this step? Ask RGA ›" line, alone (${r.quietR.kids})`);
  // 🔒 step12_review_requests_v2 (10-16): a TEST send never appears in a client's step — a system step too
  if (r.t3R.msgs || /Messages|Step 3 is open|Test send/.test(r.t3R.text) || !r.t3R.ask) fail(`a test send shows in a system step (${r.t3R.text})`);
  const b = r.bothR;
  // 🔒 step3_website_access_v3 (10-20): the conversation is the LAST row — "Your conversation · N messages" + date, closed unless RGA's reply is unread
  if (b.order !== "pm-mails,pm-mail" || !b.convoLast || !/^Your conversation · 2 messages Sep 18, 2026/.test(b.convo || "") || b.convoOpen !== true || b.bubbles !== 2 || !b.form || b.ask || b.rows !== 2) fail(`a step with emails and a conversation isn't: emails first, then the conversation row (count + date, open for an unread reply) with its reply box (${JSON.stringify(b)})`);
  // 🔒 step12_review_requests_v2 (10-16): a TEST send (RGA checking how an email looks) never appears in a client's step
  if (r.tst) fail(`a test send shows in the client's step (${r.tst})`);
  if (r.genR.heading !== "Your messages with RGA" || r.genR.rows || !r.genR.form) fail("the general thread (no step) changed");
  if (r.none !== "") fail("a step with no messages shows something");
} finally { await browser.close(); }

// 🔒 10-20 (Chris on the Support card: "is this a message or not?"): "Your messages with RGA" is only what was SAID — no email copy,
// no confirmation card — and the confirmed-gone notice never leaves step 2's card for the general thread
if (!/filter\(\(m\) => \(stepId \? m\.step_id === stepId : !m\.step_id && !m\.letter && !m\.card\)\)/.test(portal)) fail("the Support card (\"Your messages with RGA\") shows email copies or confirmation cards as messages");
if (!/&& !\(r\.kind === "gbp_duplicate_resolved" && r\.payload\?\.removed\)\)/.test(fn)) fail("the duplicate-gone confirmation is said twice (step 2's card AND the general thread)");
if (!/m\.from === "rga" && !m\.test && !m\.letter && !m\.card &&/.test(portal)) fail("a confirmation card counts as \"RGA replied\"");
if (F.length) { console.error("🔴 an email reads as a conversation, or the duplicate letter is on the wrong step:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ an email is not a conversation: on a step each email RGA sent is one closed row (subject · We emailed you / Test send · date · Read) that opens in place; the conversation heading and reply box only when there is one, after the emails; otherwise a quiet Ask line with the same box; on a card-system step ONE closed \"Messages · N\" row holding them, then \"Questions about this step? Ask RGA ›\" (the only reply box), a test send never counted; the general thread unchanged; the duplicate-removal letter files under step 6; the Setup banner and badge count only RGA's replies (an email copy or a test send never raises them)");
