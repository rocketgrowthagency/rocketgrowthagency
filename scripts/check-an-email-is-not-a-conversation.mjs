#!/usr/bin/env node
// check-an-email-is-not-a-conversation.mjs — on a step, an email RGA sent is one row that opens in place; the
// conversation (heading + reply box) shows only when there is one; otherwise one quiet "Ask" line opens the same box; the
// duplicate-removal letter files under step 6.
//
// 🔒 WHY (approved step_emails_not_conversation_v1 v2, 2026-10-15). Chris on step 7: "why is this inside the upload photos
// card? … this is verify GBP right? … and its not a conversation either?" Every email copy sat under "Your conversation
// about this step" with a reply box, and the duplicate letter showed on step 7 because it was also the step-7-open email.
// The portal's own threadHtml (lifted) is drawn in Chrome with the shipped portal.css.
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js");
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf("{", m.index); k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const lifted = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), pick(/^function fmtDateTimeDot\(/m), pick(/^function letterHtml\(/m),
  pick(/^function threadHtml\(/m), line("MAIL_ICON"), pick(/^function threadBlock\(/m), pick(/^function typeLinesHtml\(/m), line("DUP_PHOTO_STEP"), line("STORE_ICON"), line("GOOGLE_G"), line("MSG_ICON"), pick(/^function unreadReplies\(/m), pick(/^function renderReplyPointer\(/m)];
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
  await page.addScriptTag({ content: `var _portalThread = [];\nvar _portalThreadSeenAt = null;\n${lifted.join("\n")}` });
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
  const want = { one: ["New email from Rocket Growth Agency", "1"], two: ["2 new emails from Rocket Growth Agency", "2"], reply: ["Rocket Growth Agency replied about Step 3", "1"], replies: ["Rocket Growth Agency replied about Step 3 · 2 new", "2"], mix: ["Rocket Growth Agency replied, and sent 1 new email", "2"], test: ["", ""] };
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
    _portalThread = [letter, test, ask, reply, nudge, general];
    const h = document.getElementById("h");
    const at = (stepId) => { h.innerHTML = threadHtml(stepId); return h; };
    const t = (e) => (e ? e.innerText.replace(/\s+/g, " ").trim() : "");
    const only = at("m1.gbp.verify");
    const onlyR = { rows: only.querySelectorAll(".pm-mails details.pm-mail").length, open: only.querySelector(".pm-mail")?.open, summary: t(only.querySelector(".pm-mail summary")), convo: !!only.querySelector(".pm-thread"), heading: /Your conversation about this step/.test(only.innerHTML),
      ask: !!only.querySelector("details.pm-ask form[data-thread-reply='m1.gbp.verify'] [data-thread-input]"), askMsg: !!only.querySelector("details.pm-ask [data-thread-msg]"), askOpen: only.querySelector("details.pm-ask")?.open, wrap: only.querySelector(".pm-stepmsgs")?.getAttribute("data-thread-for") };
    only.querySelector(".pm-mail summary").click();
    onlyR.opened = !!only.querySelector(".pm-mail[open] .pm-m-letter") && only.querySelector(".pm-mail .pm-m-letter").checkVisibility();
    onlyR.closedHidden = (() => { at("m1.gbp.verify"); return !h.querySelector(".pm-m-letter").checkVisibility(); })();
    const both = at("m1.tracking.call_setup");
    const bothR = { order: [...both.querySelector(".pm-stepmsgs").children].map((c) => c.className.split(" ")[0]).join(","), bubbles: both.querySelectorAll(".pm-thread .pm-m").length, heading: both.querySelector(".pm-thread .pm-thread-k")?.textContent.trim(), form: !!both.querySelector(".pm-thread form[data-thread-reply='m1.tracking.call_setup']"), ask: !!both.querySelector(".pm-ask"), rows: both.querySelectorAll(".pm-mail").length };
    const tst = t(at("m1.review.first_5").querySelector(".pm-mail summary"));
    const gen = at(null);
    const genR = { heading: gen.querySelector(".pm-thread-k")?.textContent.trim(), rows: gen.querySelectorAll(".pm-mail").length, form: !!gen.querySelector("form[data-thread-reply='']") };
    return { onlyR, bothR, tst, genR, none: threadHtml("m1.gbp.photos") };
  });
  const o = r.onlyR;
  if (o.rows !== 1 || o.open || !/^Confirmed: your duplicate Google Business Profile is gone We emailed you · Oct 15, 2026/.test(o.summary) || !/Read$/.test(o.summary)) fail(`an email isn't one closed row with its subject, "We emailed you · date" and Read (${o.summary})`);
  if (!o.opened || !o.closedHidden) fail("Read doesn't open the letter in place, or a closed row shows it");
  if (o.convo || o.heading) fail("a step with only an email still shows \"Your conversation about this step\"");
  if (!o.ask || !o.askMsg || o.askOpen) fail("a step with only an email doesn't offer the quiet Ask line (closed, opening the same reply box)");
  if (o.wrap !== "m1.gbp.verify") fail("the step's messages lost their step marker");
  const b = r.bothR;
  if (b.order !== "pm-mails,pm-thread" || b.bubbles !== 2 || b.heading !== "Your conversation about this step" || !b.form || b.ask || b.rows !== 1) fail(`a step with emails and a conversation isn't: emails first, then the conversation with its reply box (${JSON.stringify(b)})`);
  if (!/^Step 12 is open Test send · /.test(r.tst)) fail(`a test send isn't marked on its row (${r.tst})`);
  if (r.genR.heading !== "Your messages with RGA" || r.genR.rows || !r.genR.form) fail("the general thread (no step) changed");
  if (r.none !== "") fail("a step with no messages shows something");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 an email reads as a conversation, or the duplicate letter is on the wrong step:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ an email is not a conversation: on a step each email RGA sent is one closed row (subject · We emailed you / Test send · date · Read) that opens in place; the conversation heading and reply box only when there is one, after the emails; otherwise a quiet Ask line with the same box; the general thread unchanged; the duplicate-removal letter files under step 6; the Setup banner names what arrived (an email as an email, a reply as a reply, a mix as both; a test send never counts)");
