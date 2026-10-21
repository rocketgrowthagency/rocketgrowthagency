#!/usr/bin/env node
// check-a-thread-email-reads-like-the-email.mjs — the copy of a client email in a step's thread reads the way the EMAIL
// reads: no letter markup ("## …", "[words](https://…)", "**…**") on screen, links as words, a portal link stays in the
// portal, and a TEST send says it's a test and never counts as unread.
//
// 🔴 2026-10-14, Chris in step 12's thread: the 10-13 email showed raw "## What we need from you" and
// "[Send your 5 customers](https://www.rocketgrowthagency.com/portal/#step-m1.review.first_5)", and it was the TEST send,
// reading "step 12 in your portal is open now" over a step that says Waits on RGA.
// Lifts the shipped letterHtml from portal.js and draws it in real Chrome. Reads files only.
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const src = read("portal/portal.js"), thread = read("netlify/functions/portal-thread.js");
const pick = (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const fn = pick(/^function letterHtml\(/m), esc = pick(/^function escapeHtml\(/m);
if (!fn) fail("portal.js has no letterHtml: email copies in the thread would show their markup raw");
if (!/letter: \["step_open_sent", "step_email_sent", "step_nudge_sent"\]\.includes\(r\.kind\),/.test(thread) || !/test: r\.payload\?\.test === true,/.test(thread)) fail("portal-thread doesn't mark email copies (letter) and test sends (test)");
// 🔑 BOTH places a message is drawn (the email row and the thread bubble) label a test send — one alone let the other go unlabelled
if ((src.match(/\$\{m\.test \? `<p class="pm-m-test"><b>Test send<\/b>/g) || []).length < 2) fail("a test send isn't labelled as a test in the thread");
if (!/m\.from === "rga" && !m\.test && (?:!m\.letter && )?(?:!m\.card && )?new Date\(m\.at\)/.test(src)) fail("a test send still counts as unread (the Setup badge)");
if (!/: m\.letter \? \(\(\) => \{/.test(src)) fail("the thread doesn't draw email copies with letterHtml");

let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
// the REAL 10-13 email body (its markup), plus every block the format has, plus something hostile
const MARKUP = `Hi Chris,\n\nYour review request messages are ready, so step 12 in your portal is open now.\n\n## What we need from you\n5 happy past customers: their first name, phone number and the job you did for them.\n\n[Send your 5 customers](https://www.rocketgrowthagency.com/portal/#step-m1.review.first_5)\n\n## What happens next\nWe write a personal request for each one.\n\n- one\n- two\n\n**bold** and [Google](https://www.google.com/maps)\n\n<script>window.__x=1</script> <img src=x onerror="window.__x=2">`;
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addScriptTag({ content: [esc, fn].join("\n") });
  const r = await page.evaluate((mk) => {
    const h = document.getElementById("h"); h.innerHTML = letterHtml(mk);
    const a = [...h.querySelectorAll("a")].map((x) => ({ t: x.textContent, href: x.getAttribute("href"), target: x.getAttribute("target") }));
    return { text: h.textContent, links: a, labels: [...h.querySelectorAll(".pm-ml-k")].map((x) => x.textContent), lis: h.querySelectorAll("li").length, bold: [...h.querySelectorAll("b")].map((x) => x.textContent), x: window.__x || 0, scripts: h.querySelectorAll("script,img").length };
  }, MARKUP);
  if (/##|\]\(|\*\*/.test(r.text)) fail(`the thread shows letter markup raw (${r.text.match(/##|\]\(|\*\*/)[0]})`);
  if (/https?:\/\//.test(r.text)) fail("a link's address shows on screen (links must read as words)");
  const send = r.links.find((l) => l.t === "Send your 5 customers");
  if (!send || send.href !== "#step-m1.review.first_5" || send.target) fail(`a portal link leaves the portal (${JSON.stringify(send)})`);
  const g = r.links.find((l) => l.t === "Google");
  if (!g || g.href !== "https://www.google.com/maps" || g.target !== "_blank") fail("an outside link isn't a words-link opening a new tab");
  if (r.labels.join("|") !== "What we need from you|What happens next" || r.lis !== 2 || !r.bold.includes("bold")) fail(`labels / lists / bold don't render (${r.labels.join("|")} · ${r.lis} · ${r.bold})`);
  if (r.x || r.scripts) fail("message text became HTML (a script or an image ran)");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 an email copy in the thread doesn't read like the email:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ an email copy in a step's thread reads like the email: labels, lists, bold, links as words (portal links stay in the portal), no markup or addresses on screen, nothing it holds becomes HTML; a test send says so and never counts as unread");
