#!/usr/bin/env node
// check-step-12-review-requests.mjs — step 12 (review requests to 5 past customers) is the approved design, and honest.
//
// 🔒 WHY (approved step12_review_requests_v1, 2026-10-14, Chris: "APPROVED"): the step used to say "Submit list →" and
// jump to a paste-a-list card on another tab. The approved step leads with WHAT each thing is (Review request message ·
// Customer · Google Business Profile), takes the 5 customers IN THE ROW (one labelled card each, "N of 5", "Send 5
// customers →"), then shows each customer with its status, and the step-open email uses the letter blocks.
// 🔴 HONESTY, the two rules this step lives on: we never see a text go out (it leaves from the client's phone), so a
// request is "you marked it sent", never "sent"; and Google never tells us WHICH customer reviewed, so the reviews line
// is a count of new reviews, measured after the customers came in, or nothing.
//
// Draws the shipped portal.js functions with the shipped portal.css in real Chrome, at desktop and phone width; the
// endpoint's count and the email builder run as the server runs them. Reads files only (no Supabase, no network).
// SHOTS=<dir> also saves a screenshot of each state (for the diff against the mockup).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/`);
const F = []; const fail = (m) => F.push(m);
const src = read("portal/portal.js"), css = read("portal/portal.css"), mock = read("reports/mockups/step12_review_requests_v1.html") + read("reports/mockups/step12_review_requests_v3.html");   // v3 approved 10-20
const pb = JSON.parse(read("data/playbooks/playbooks.json")), proj = JSON.parse(read("data/playbooks/client-steps.json"));
const pick = (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const line = (name) => (new RegExp(`^const ${name} = .*;$`, "m").exec(src) || [""])[0];
const S = "m1.review.first_5";
const sop = (pb.month1 || []).find((s) => s.id === S), step = (proj.month1 || []).find((s) => s.id === S);
if (!sop || !step) { console.error(`⚠️  INDETERMINATE — ${S} is not in the playbook / the projection`); process.exit(2); }

// 🔴 The portal reads the PROJECTION; the words are written in the SOP. A projection not rebuilt is a second copy.
if (JSON.stringify(step.clientWait) !== JSON.stringify(sop.clientWait)) fail("client-steps.json's step 12 isn't the SOP's (rebuild it: node scripts/build-client-steps.mjs)");
// ── 1 · the words are the approved mockup's (a new wording needs a new approval) ──
// 🔑 a step NUMBER is computed (review requests moved 12 → 13 when "Check your business on Google" joined, 10-16): the approved
// words are compared with the number as N
const numless = (x) => String(x).replace(/\b(step|Step) \d+\b/g, "$1 N");
const inMock = (t) => numless(mock).includes(numless(String(t).replace(/'/g, "'")));
const w = step.clientWait || {}, th = w.thing || {}, how = w.how || [];
for (const [k, v] of [["head", w.head], ["body", w.body], ["foot", w.foot], ["thing.small", th.small], ["thing.title", th.title], ["thing.detail", th.detail], ["thing.tag", th.tag]]) {
  if (!v || !inMock(v)) fail(`step 12's waiting ${k} isn't the approved words ("${v}")`);
}
if (how.length !== 4) fail(`"how it works" has ${how.length} parts, not the approved 4`);
for (const h of how) if (!inMock(h.title) || !inMock(h.sub)) fail(`"how it works" says "${h.title}" / "${h.sub}", not the approved words`);
const oe = sop.clientOpenEmail || {};
for (const k of ["heading", "need", "cta", "next"]) if (!oe[k] || !inMock(oe[k])) fail(`the step-open email's ${k} isn't the approved words ("${oe[k]}")`);
if (oe.intro) fail("the step-open email's intro is written in the SOP again (it hardcoded \"step 12\"; numbers are computed)");
// 🔒 step12_review_requests_v3 (approved 10-20) on the server and in the done rule
{
  const ep = read("netlify/functions/portal-review-requests.js"), rc = read("netlify/functions/portal-step-recheck.js");
  if (!/: MARK === "reminded" \? c\.marked_sent_by_client && !c\.reminded_at && !c\.stopped && !c\.reviewed_mark && Date\.now\(\) - Date\.parse\(c\.marked_sent_at \|\| 0\) >= 3 \* 86400000/.test(ep)) fail("the server allows a reminder before day 3, a second reminder, or one after \"stop\" / \"reviewed\"");
  if (!/const ok = \(c\) => MARK === "sent" \? !c\.stopped/.test(ep)) fail("a customer who asked to stop can still be marked sent");
  if (!/if \(refused\.length\) return json\(409,/.test(ep)) fail("a refused mark isn't refused (409)");
  if (!/Would you leave an honest review on Google\? It takes a minute and really helps: \$\{reviewUrl\}/.test(ep)) fail("the plain request doesn't ask for an honest review");
  if (!/return require\("\.\/_review-policy"\)\.reviewMessageProblems\(msg, \{ needsLink: false \}\)\.length \? null : msg;/.test(ep)) fail("the reminder isn't checked against the review policy");
  if (!/\.filter\(\(r\) => r\.name && \(r\.phone \|\| r\.email\)\)/.test(ep)) fail("an email-only customer is dropped from step 12");
  if (!/const n = all\.filter\(\(c\) => c && c\.marked_sent_by_client\)\.length/.test(rc) || !/return n >= 5/.test(rc.slice(rc.indexOf('"m1.review.first_5": async (clientId)')))) fail("the server's step 12 check counts customers added, not customers asked");
  if (!/if \(s\.id === "m1\.review\.first_5" && customersAsked >= 5\) status = "done";/.test(src)) fail("the portal calls step 12 done before 5 are asked");
  if (/"clientLabel": "Send personalized review requests to 5 past customers"/.test(read("data/playbooks/playbooks.json")) || !/"clientLabel": "Ask your 5 most recent customers for a review"/.test(read("data/playbooks/playbooks.json"))) fail("step 12's title isn't \"Ask your 5 most recent customers for a review\"");
}
// decision 6: ONE review request message
const words = JSON.stringify({ w, oe, label: sop.clientLabel, hint: sop.clientHint });
if (/review (request )?messages/i.test(words)) fail("step 12 says \"messages\" again (approved: RGA writes ONE review request message)");

// ── 2 · the row is wired the approved way ──
const wires = [
  // 🔒 v2: while RGA writes the message, the blue card says it all — no disabled button (still disabled while it waits on its own step / the listing)
  [/: step\.clientForm === "customer_list" \? \(ownWait \|\| listingWait \|\| \(rgaWait && !\(step\.clientWait && step\.clientWait\.how\)\) \? `<button class="pm-act is-go" disabled>Add your 5 customers →<\/button>` : ""\)/, "the waiting row's button isn't the disabled \"Add your 5 customers →\" (or it shows while the step is open)"],
  [/const reviewStep = !month2Only && step\.clientForm === "customer_list";[\s\S]{0,400}?reviewStep \? \(rgaWait \|\| ownWait \|\| listingWait \? "" : reviewStepHtml\(step, clientId, customerLists \|\| \[\], isDone\)\)/, "step 12 doesn't take its customers in the row (reviewStepHtml)"],
  [/month2Only && step\.clientForm === "customer_list" \? buildCustomerListHtml\(clientId, customerLists \|\| \[\]\)/, "Month 2's weekly list lost its paste card"],
  [/_openStep\.set\(clientId, "m1\.review\.first_5"\);/, "after sending, step 12 closes (the requests they now send appear in it)"],
  [/loadReviewStep\(clientId\);/, "the customers' statuses never load after the rows render"],
];
for (const [re, msg] of wires) if (!re.test(src)) fail(msg);
if ((src.match(/\.from\("client_customer_lists"\)\.insert\(/g) || []).length !== 1) fail("a customer list is saved by more than one path (one save: saveCustomerList)");
if ((src.match(/await saveCustomerList\(/g) || []).length !== 2) fail("step 12's cards and the weekly card don't both save through saveCustomerList");
// 🔴 "sent" is never ours to claim
if (/Customer · sent|"Sent \$\{|>Sent [A-Z]/.test(src)) fail("a request reads \"sent\" (we can't see a text go out: \"you marked it sent\")");

// ── 3 · the endpoint: the count is measured on both sides or nothing, and reading is open to the admin ──
const ep = req("./portal-review-requests.js");
const epSrc = read("netlify/functions/portal-review-requests.js");
const snap = (d, n) => ({ captured_at: d, payload: { review_count: n } });
const since = "2026-10-20T15:00:00Z";
const cases = [
  ["a reading before and after → the difference", [snap("2026-10-19T09:00:00Z", 3), snap("2026-10-22T09:00:00Z", 5)], 2],
  ["no reading after the customers came in (the series stopped) → nothing", [snap("2026-09-16T09:00:00Z", 0)], null],
  ["no reading before → nothing", [snap("2026-10-22T09:00:00Z", 5)], null],
  ["the count dropped → nothing (a drop isn't new reviews)", [snap("2026-10-19T09:00:00Z", 6), snap("2026-10-22T09:00:00Z", 4)], null],
  ["no reviews since → 0 (measured)", [snap("2026-10-19T09:00:00Z", 4), snap("2026-10-21T09:00:00Z", 4)], 0],
  ["nothing at all → nothing", [], null],
];
for (const [name, rows, want] of cases) {
  const r = ep.countSince(rows, since);
  const got = r ? r.count : null;
  if (got !== want) fail(`reviews since: ${name} — got ${JSON.stringify(r)}`);
}
if (!/const MARK = \["sent", "reminded", "reviewed", "stopped"\]\.find\(\(k\) => Array\.isArray\(body\[k\]\)\) \|\| null;\s*const gate = MARK \? await requirePortalOwner\(event, clientId\) : await requirePortalOwnerOrWorkspace\(event, clientId\);/.test(epSrc)) fail("the admin can't read the requests (the 403), or the admin can mark a request sent (that's the client's word)");
if (!/require\("\.\/_review-link"\)/.test(epSrc) || /function reviewLinkFor/.test(epSrc)) fail("the requests carry their own copy of the review link (one copy: _review-link.js)");

// ── 4 · the email: the letter blocks, and the link claimed only when we hold it ──
const N = req("./notify-step-open.js");
const s57 = (N.CANDIDATES || []).find((s) => s.id === S);
if (!s57) fail("step 12 isn't announced when it opens");
else {
  const withLink = N.buildEmail({ primary_contact_name: "Chris Lee", google_place_id: "ChIJx" }, [s57]).markup;
  const noLink = N.buildEmail({ primary_contact_name: "Chris" }, [s57]).markup;
  const want = [`# ✓ ${oe.heading}`, `Hi Chris, step ${s57.clientStepNo} in your portal is open now.`,
    `:: msg | ✓ Ready | Review request message | Written by RGA · with your Google review link`, "## What we need from you", `>> [${oe.cta}](https://www.rocketgrowthagency.com/portal/#step-${S})`, "## What happens next"];
  for (const l of want) if (!withLink.split("\n").includes(l)) fail(`the email lacks the line "${l}"`);
  if (!inMock(`Hi Chris, step ${s57.clientStepNo} in your portal is open now.`)) fail("the email's opening line isn't the approved one");
  if (/review link/.test(noLink)) fail("a client we hold no review link for is told the message has one");
  const L = req("./_letter.js").letter(withLink);
  if (!/border:1px solid #cfe6c8;[^"]*background:#e3f1df/.test(L.html) || /border-left:4px/.test(L.html) || !/>Review request message</.test(L.html)) fail("the email's Review request message line isn't the green TYPE line");
  if (/::|>>|^#/m.test(L.text)) fail("the email's plain text shows letter markup");
}

// ── 5 · drawn in Chrome: the three states, and the form ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
// 🔑 start at the BODY's brace (") {"): googleCardHtml's destructured parameter has braces of its own
const pickBody = (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf(") {", m.index) + 2; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const lifted = [
  pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), pick(/^function typeLineHtml\(/m), pick(/^function rgaWaitHtml\(/m), line("GOOGLE_G"), line("GC_ICON"), pickBody(/^function googleCardHtml\(/m),
  pick(/^function reviewStepHtml\(/m), pick(/^function reviewStepLinesHtml\(/m), pick(/^function reviewBandNote\(/m), pick(/^function reviewFiveTally\(/m), pick(/^function letterHtml\(/m),
  line("MSG_ICON"), line("PERSON_ICON"), line("STAR_ICON"), line("STORE_ICON"), line("REVIEW_GOAL"), line("monthDay"), line("smsHref"), line("r5Val"), line("r5IsEmail"), line("r5Complete"), line("r5Started"),
];
const listeners = [pick(/^document\.addEventListener\("input", \(ev\) => \{\s*const form = ev\.target && ev\.target\.closest && ev\.target\.closest\("form\[data-review-five\]"\);/m),
  pick(/^document\.addEventListener\("submit", async \(ev\) => \{\s*const form = ev\.target && ev\.target\.closest && ev\.target\.closest\("form\[data-review-five\]"\);/m)];
if (lifted.some((x) => !x) || listeners.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step-12 function moved (${lifted.findIndex((x) => !x)} / ${listeners.findIndex((x) => !x)})`); process.exit(2); }
const stubs = `var _portalSupabase = {}, _openStep = new Map(); window.__saved = null; window.__refreshed = null;
  async function saveCustomerList(cid, wk, customers) { window.__saved = { cid, wk, customers }; return [{ customer_count: customers.length, created_at: "2026-10-20T15:00:00Z" }]; }
  function refreshAfterCustomers(cid, lists) { window.__refreshed = lists; }
  function portalToast() {} async function portalToken() { return "t"; } function currentWeekLabel() { return "Week of October 19"; }
  function clientError(e) { return String(e && e.message || e); } window.fetch = async () => ({ ok: true, json: async () => ({}) });`;
const SHOTS = process.env.SHOTS || "";
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900 });
  await page.setContent(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#f1f2f4;margin:0"><div class="pm-step-row" style="max-width:820px;margin:16px;padding:16px;background:#fff;border-radius:14px" id="h"></div></body></html>`);
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: [...lifted, stubs, ...listeners.map((l) => `${l});`)].join("\n") });
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted step-12 code doesn't run: ${errs[0]}`); process.exit(2); }
  const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await (await page.$("#h")).screenshot({ path: path.join(SHOTS, `${n}.png`) }); } };
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  // A · waits on RGA — 🔒 step12_review_requests_v2: ONE blue card, the path inside (RGA's part current)
  const a = await page.evaluate((st) => { const h = document.getElementById("h"); h.innerHTML = rgaWaitHtml(st);
    const card = h.querySelector(".gcard.rga");
    return { card: !!card, st: card ? card.querySelector(".gcard-st").innerText.replace(/\s+/g, " ").trim() : "", title: card ? card.querySelector(".gcard-t").textContent : "",
      meta: card ? (card.querySelector(".gcard-meta") || {}).textContent : "", how: [...h.querySelectorAll(".pm-how li")].map((li) => [li.className, li.querySelector("b").textContent]), btn: !!h.querySelector("button") };
  }, step);
  if (!a.card || !/^RGA is on it$/i.test(a.st) || a.title !== "Writing your review request message") fail(`A: the wait isn't the blue card "RGA is on it · Writing your review request message" (${a.st} · ${a.title})`);
  if (a.meta !== w.body) fail(`A: the card doesn't say when it opens ("${w.body}" → "${a.meta}")`);
  if (a.how.length !== 4 || a.how[0][0] !== "now" || a.how.slice(1).some((x) => x[0])) fail(`A: "how it works" isn't 4 parts with the first (RGA's) highlighted (${JSON.stringify(a.how)})`);
  await shot("A-waiting");

  // B · open: the form, in the amber card
  const b = await page.evaluate((st) => { const h = document.getElementById("h"); h.innerHTML = reviewStepHtml(st, "c1", [], false);
    const btn = h.querySelector("[data-r5-send]");
    return { card: (h.querySelector(".gcard") || {}).className, ready: ((h.querySelector(".pm-fx-pl.on") || {}).textContent || "").trim(), note: !!h.querySelector("[data-review-link-note]"),
      cards: h.querySelectorAll("[data-r5-card]").length, labels: [...h.querySelectorAll("[data-r5-card]")[0].querySelectorAll(".pm-r5-f > span")].map((x) => x.textContent),
      count: ((h.querySelector(".gcard-when") || {}).textContent || ""), title: ((h.querySelector(".gcard-t") || {}).textContent || ""), btn: btn.textContent, dis: btn.disabled, list: !!h.querySelector("[data-review-step]"),
      under: !!btn.closest(".gcard-act") && !btn.closest(".gcard"), why: ((h.querySelector(".gcard-why") || {}).innerText || "").replace(/\s+/g, " ").trim() };
  }, step);
  if (b.card !== "gcard you" || b.ready !== "✓ Your review request message is ready · written by RGA" || !b.note) fail(`B: the open step isn't the amber card leading with "✓ Your review request message is ready" (${b.card} · ${b.ready})`);
  // 🔒 step12_review_requests_v3 (approved 10-20): recency + real customers only, a cell number OR an email, "N of 5 asked", send as you go
  if (b.cards !== 5 || b.labels.join("|") !== "Customer 1 · First name|Cell number or email|The job you did") fail(`B: not 5 labelled customer cards (${b.cards} · ${b.labels.join("|")})`);
  if (b.title !== "Ask your 5 most recent customers for a review" || b.count !== "0 of 5 asked" || b.btn !== "Write 1 request" || !b.dis || b.list || !b.under) fail(`B: an empty form reads "${b.title}" / "${b.count}" / "${b.btn}" (disabled ${b.dis}, under the card ${b.under}), or shows customers it doesn't have`);
  if (!/^Who to ask Your 5 most recently finished jobs, whoever they are\. Real customers only: not family, friends or anyone who works with you\. Google doesn't allow picking only the ones you expect to be happy, or offering anything for a review\.$/i.test(b.why)) fail(`B: "who to ask" isn't the approved words (${b.why})`);
  const type = async (i, name, phone, job) => {
    const card = (await page.$$("[data-r5-card]"))[i];
    if (name) await (await card.$('[name="first_name"]')).type(name);
    if (phone) await (await card.$('[name="phone"]')).type(phone);
    if (job) await (await card.$('[name="service_done"]')).type(job);
  };
  await type(0, "Maria", "(424) 555-0142", "Website redesign");
  await type(1, "Søren", "+44 7700 900123", "");
  const b2 = await page.evaluate(() => ({ btn: document.querySelector("[data-r5-send]").textContent, dis: document.querySelector("[data-r5-send]").disabled, done: document.querySelectorAll("[data-r5-card].done").length }));
  if (b2.btn !== "Write 2 requests" || b2.dis || b2.done !== 2) fail(`B: two customers in read "${b2.btn}" (disabled ${b2.dis}, ${b2.done} done) — an international number or no job must count`);
  await shot("B-open-2-of-5");
  await type(2, "Ana", "", "");
  await page.click("[data-r5-send]");
  await new Promise((r) => setTimeout(r, 150));
  const b3 = await page.evaluate(() => ({ st: document.querySelector("[data-r5-status]").textContent, saved: window.__saved }));
  if (b3.saved || !/^Customer 3 needs a first name and a full cell number or email\.$/.test(b3.st)) fail(`B: a half-filled card is sent or dropped without a word (${b3.st} · saved ${!!b3.saved})`);
  await (await (await page.$$("[data-r5-card]"))[2].$('[name="phone"]')).type("818 555 0110");
  await type(3, "Lee", "lee@example.com", "Logo refresh");
  await page.click("[data-r5-send]");
  await new Promise((r) => setTimeout(r, 150));
  const b4 = await page.evaluate(() => ({ saved: window.__saved, refreshed: window.__refreshed, open: _openStep.get("c1") }));
  const sent = b4.saved && b4.saved.customers;
  if (!sent || sent.length !== 4 || sent[1].first_name !== "Søren" || sent[1].phone !== "+44 7700 900123" || sent[0].service_done !== "Website redesign" || b4.saved.wk !== "Week of October 19") fail(`B: the save didn't get the 4 customers as typed (${JSON.stringify(b4.saved)})`);
  if (!sent || !sent[3] || sent[3].email !== "lee@example.com" || sent[3].phone !== "") fail(`B: an email instead of a cell number isn't saved as the email (${JSON.stringify(sent && sent[3])})`);
  if (!b4.refreshed || b4.open !== "m1.review.first_5") fail("B: after sending, the step isn't redrawn or doesn't stay open");
  await page.setViewport({ width: 375, height: 800 });
  if (await overflow()) fail("B: the form scrolls sideways on a phone");
  // 🔑 Not only "no sideways scroll": a 4-column card squeezed to a phone fits, with fields too narrow to type in.
  const narrow = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".pm-r5-f")].map((f) => f.getBoundingClientRect().width)));
  if (narrow < 200) fail(`B: on a phone the customer fields don't stack (the narrowest is ${Math.round(narrow)}px)`);
  await page.setViewport({ width: 900, height: 900 });

  // C · after: each customer with its status, and the reviews
  const lists = [{ customer_count: 5, created_at: "2026-10-20T15:00:00Z" }];
  const data = { requests: [
    { index: 0, list_id: "L1", name: "Maria", phone: "(424) 555-0142", job: "Website redesign", already_marked: false, message: "Hi Maria, it's Acme. Thanks again <b>x</b>: https://search.google.com/local/writereview?placeid=1" },
    { index: 1, list_id: "L1", name: "James", phone: "(310) 555-0199", job: "Google Ads setup", already_marked: true, marked_at: new Date(Date.now() - 5 * 864e5).toISOString(), message: "Hi James", reminder: "Hi James, just a quick nudge in case you have a minute for that Google review: https://g.page/r/x/review. Thanks either way!" },
    { index: 2, list_id: "L1", name: "Ana", phone: "(818) 555-0110", job: "", already_marked: false, message: null },
    { index: 3, list_id: "L1", name: "Tom", phone: "(213) 555-0123", job: "", already_marked: true, marked_at: new Date(Date.now() - 1 * 864e5).toISOString(), message: "Hi Tom", reminder: "Hi Tom, nudge https://g.page/r/x/review" },
    { index: 4, list_id: "L1", name: "Lee", phone: "", email: "lee@example.com", job: "", already_marked: false, message: "Hi Lee, thanks https://g.page/r/x/review" },
    { index: 5, list_id: "L1", name: "Kim", phone: "(213) 555-0144", job: "", already_marked: true, marked_at: new Date(Date.now() - 2 * 864e5).toISOString(), stopped: true, message: "Hi Kim" },
    { index: 6, list_id: "L1", name: "Pat", phone: "(213) 555-0155", job: "", already_marked: true, marked_at: new Date(Date.now() - 6 * 864e5).toISOString(), reviewed_mark: true, message: "Hi Pat", reminder: "x" },
  ], reviews: { since: "2026-10-20T15:00:00Z", count: 2, checked_at: "2026-10-22T09:00:00Z" } };
  // 🔒 step12_review_requests_v2: the requests card (a row per customer) + the reviews card, drawn from the endpoint's first 5
  const c = await page.evaluate((st, lists, data) => { const h = document.getElementById("h"); h.innerHTML = reviewStepHtml(st, "c1", lists, true);
    const form = !!h.querySelector("form"), ready = !!h.querySelector(".pm-fx-pl.on");
    h.querySelector("[data-review-step]").innerHTML = reviewStepLinesHtml({ ...data, since: "2026-10-20T15:00:00Z" });
    const R = [...h.querySelectorAll(".pm-r5-rq")].map((x) => ({ who: x.querySelector(".pm-r5-who").innerText.replace(/\s+/g, " ").trim(), chip: ((x.querySelector(".pm-fx-pl") || {}).textContent || "").trim(),
      act: (x.querySelector("a[data-review-send]") || {}).getAttribute?.("href") || "", mark: !!x.querySelector("[data-review-mark]"), bolds: x.querySelectorAll(".pm-r5-read b").length,
      remind: (x.querySelector("a[data-review-remind]") || {}).getAttribute?.("href") || "", remindText: (x.querySelector("a[data-review-remind]") || {}).textContent || "", when: ((x.querySelector(".pm-r5-when") || {}).textContent || ""),
      reviewed: !!x.querySelector("[data-review-reviewed]"), stop: !!x.querySelector("[data-review-stop]"), sendText: (x.querySelector("a[data-review-send]") || {}).textContent || "" }));
    const cards = [...h.querySelectorAll(".gcard")].map((x) => ({ cls: x.className, st: x.querySelector(".gcard-st").innerText.replace(/\s+/g, " ").trim(), t: x.querySelector(".gcard-t").textContent, when: ((x.querySelector(".gcard-when") || {}).textContent || "") }));
    return { form, ready, R, cards, text: h.textContent };
  }, step, lists, data);
  if (c.form || c.ready) fail(`C: a done step still shows the form or the ready line`);
  // 🔑 Month 3: 30 more customers came in from the weekly card. Step 12 is still about the FIRST 5 — the endpoint stops at 5.
  if (!/for \(const l of Array\.isArray\(all\) \? all : \[\]\) \{ if \(n >= 5\) break;/.test(read("netlify/functions/portal-review-requests.js"))) fail("C: step 12 counts every list ever, not its own first 5");
  const [m, j, an, tom, lee, kim, pat] = c.R;
  if (!m || m.who !== "Maria · Website redesign (424) 555-0142" || !/^sms:/.test(m.act) || !m.mark || m.bolds) fail(`C: a ready request isn't Maria's row with Text Maria + I sent it, or its text became HTML (${JSON.stringify(m)})`);
  // 🔒 step12_review_requests_v3: asked → ONE reminder from day 3 (never sooner, never a second) · they reviewed · asked to stop (final)
  if (!j || !/^Asked [A-Z][a-z]{2} \d{1,2}$/.test(j.chip) || j.mark || j.act || !/^sms:/.test(j.remind) || j.remindText !== "Remind James once" || !j.reviewed || !j.stop) fail(`C: a request asked 5 days ago isn't "Asked <date>" with Remind James once + They reviewed + They asked me to stop (${JSON.stringify(j)})`);
  if (!tom || tom.remind || !/^Remind once from [A-Z][a-z]{2} \d{1,2}$/.test(tom.when)) fail(`C: a reminder is offered before day 3 (${JSON.stringify(tom)})`);
  if (!lee || !/^mailto:lee%40example\.com\?subject=/.test(lee.act) || lee.sendText !== "Email Lee") fail(`C: an email-only customer isn't "Email Lee" with a mailto (${JSON.stringify(lee)})`);
  if (!kim || kim.remind || kim.reviewed || kim.stop || !/Asked not to be contacted/.test(kim.chip)) fail(`C: a customer who asked to stop still has actions (${JSON.stringify(kim)})`);
  if (!pat || pat.remind || pat.reviewed || !/They reviewed/.test(pat.chip)) fail(`C: a customer marked reviewed still gets a reminder (${JSON.stringify(pat)})`);
  if (!an || an.chip !== "RGA is writing it" || an.act) fail(`C: a request with no message yet offers a send, or isn't "RGA is writing it" (${JSON.stringify(an)})`);
  const [rq, rv] = c.cards;
  if (!rq || rq.cls !== "gcard you" || !/^Your move$/i.test(rq.st) || rq.when !== "4 of 5 asked") fail(`C: the requests card isn't "Your move · 4 of 5 asked" (${JSON.stringify(rq)})`);
  if (!rv || rv.cls !== "gcard ok" || !/^On Google$/i.test(rv.st) || rv.t !== "2 new Google reviews since you started") fail(`C: the reviews card isn't the measured count (${JSON.stringify(rv)})`);
  const dn = await page.evaluate((data) => { const h = document.getElementById("h");
    h.innerHTML = `<div>${reviewStepLinesHtml({ ...data, review_link: "https://g.page/r/x/review", requests: data.requests.map((x) => ({ ...x, already_marked: true, marked_at: x.marked_at || "2026-10-21T18:00:00Z" })) })}</div>`;
    const c0 = h.querySelector(".gcard"); return { cls: c0.className, t: c0.querySelector(".gcard-t").textContent, st: c0.querySelector(".gcard-st").innerText.trim(), copy: (h.querySelector("[data-copy-review-link]") || {}).getAttribute?.("data-copy-review-link") || "", text: h.innerText };
  }, data);
  if (dn.cls !== "gcard ok" || dn.t !== "5 customers asked" || !/^Done$/i.test(dn.st) || dn.copy !== "https://g.page/r/x/review" || !/ask every customer when a job is finished/.test(dn.text)) fail(`C: 5 asked isn't the Done card pointing to the habit with Copy your review link (${JSON.stringify(dn).slice(0, 200)})`);
  if (/\bSent\b(?! from)/.test(c.text.replace(/Marked sent/g, ""))) fail("C: a request reads \"Sent\" (we can't see a text go out)");
  await shot("C-after");
  const c2 = await page.evaluate((data) => { const h = document.getElementById("h"); h.innerHTML = `<div>${reviewStepLinesHtml({ ...data, reviews: null })}</div>`;
    return { stars: /new (Google )?review/.test(h.textContent),
      notes: [reviewBandNote(data), reviewBandNote({ requests: [{ already_marked: true }] }), reviewBandNote({ requests: [{}], blocked: "We need your Google review link to finish these." }), reviewBandNote({ requests: [] })] };
  }, data);
  if (c2.stars) fail("C: with no measured count, a reviews line still shows (absence must not read as 0)");
  if (c2.notes[0] !== "Your personal requests are ready: send each one from your own phone." || c2.notes[1] !== "You've marked every request sent." || !/review link/.test(c2.notes[2]) || c2.notes[3] !== "") fail(`C: the band says something the requests aren't (${JSON.stringify(c2.notes)})`);
  await page.setViewport({ width: 375, height: 800 });
  await page.evaluate((st, lists, data) => { const h = document.getElementById("h"); h.innerHTML = reviewStepHtml(st, "c1", lists, true); h.querySelector("[data-review-step]").innerHTML = reviewStepLinesHtml(data); }, step, lists, data);
  if (await overflow()) fail("C: the customer lines scroll sideways on a phone");
  if (SHOTS) await shot("C-after-phone");

  // D · the email's copy in the step's thread
  if (s57) {
    await page.setViewport({ width: 900, height: 900 });
    const mk = N.buildEmail({ primary_contact_name: "Chris", google_place_id: "x" }, [s57]).markup;
    const d = await page.evaluate((mk) => { const h = document.getElementById("h"); h.innerHTML = `<div class="pm-m-bub pm-m-letter">${letterHtml(mk)}</div>`;
      return { h: (h.querySelector(".pm-ml-h") || {}).textContent, tl: !!h.querySelector(".tl2.keep svg"), b: (h.querySelector(".tl2 b") || {}).textContent, raw: /::|>>|##/.test(h.textContent) }; }, mk);
    if (d.h !== `✓ ${oe.heading}` || !d.tl || d.b !== "Review request message" || d.raw) fail(`D: the email's copy in the thread doesn't read like the email (${JSON.stringify(d)})`);
    await shot("D-thread");
  }
} finally { await browser.close(); }

// E · 🔒 step12_review_requests_v2: the request text is RGA's approved message; test sends stay out of a client's step; admin
// says when a client step waits on RGA (only when RGA's row is the real blocker), and row 57 reads the client's progress live.
{
  const { createRequire } = await import("node:module");
  const RR = createRequire(`${SITE}/netlify/functions/x.js`)("./portal-review-requests.js");
  const sum = "GOOGLE REVIEW LINK:\n  x\n\n## SMS\\_1 — Under 160 characters\n\n```\nHi {{first_name}}, thanks for choosing Acme Plumbing!\nA quick review helps: {{review_link}}\n```\n\n## SMS\\_2\n```\nlater\n```";
  const tpl = RR.smsOneOf(sum);
  if (tpl !== "Hi {{first_name}}, thanks for choosing Acme Plumbing! A quick review helps: {{review_link}}") fail(`E: RGA's approved message (step 56's SMS_1) isn't read (${tpl})`);
  // 🔴 10-19: the prompt never asks for a fence — every shape a model writes SMS_1 in is read, and SMS_2's text never is.
  const SHAPES = {
    "SMS_1: label then the text": ["SMS_1: Hi {{first_name}}, thanks for trusting Bella Salon! {{review_link}}\nSMS_2: later", "Hi {{first_name}}, thanks for trusting Bella Salon! {{review_link}}"],
    "**SMS_1** heading, unfenced": ["**SMS_1** (under 160ch)\nHi {{first_name}}, thank you for dining with us. {{review_link}}\n\n**SMS_2** (day 2)\nlater", "Hi {{first_name}}, thank you for dining with us. {{review_link}}"],
    "SMS_1 unfenced, SMS_2 fenced": ["SMS_1 (under 160ch)\nHi {{first_name}}, thanks! {{review_link}}\n\nSMS_2\n```\nWRONG\n```", "Hi {{first_name}}, thanks! {{review_link}}"],
  };
  for (const [k, [inp, want]] of Object.entries(SHAPES)) { const got = RR.smsOneOf(inp); if (got !== want) fail(`E: SMS_1 written as "${k}" reads as ${JSON.stringify(got)} — the client's approved wording falls back to the generic text`); }
  if (RR.fillRgaMessage(tpl, { name: "Maria", service: "drain", business: "Acme", reviewUrl: "https://g.page/r" }) !== "Hi Maria, thanks for choosing Acme Plumbing! A quick review helps: https://g.page/r") fail("E: a request isn't RGA's message with the name and link filled in");
  if (RR.fillRgaMessage("Hi {{first_name}}, about {{weird}}", { name: "M", reviewUrl: "u" }) !== null || RR.fillRgaMessage(null, { name: "M", reviewUrl: "u" }) !== null) fail("E: a message with a placeholder left over could be sent");
  const rr = read("netlify/functions/portal-review-requests.js");
  if (!/if \(!t \|\| t\.status !== "done"\) return null;/.test(rr) || !/message_source: reviewUrl && fillRgaMessage\(/.test(rr)) fail("E: an unapproved step 56 draft is sent, or the record doesn't say whose text it is");
  if (!/const letters = msgs\.filter\(\(m\) => m\.letter && !m\.test\)/.test(src)) fail("E: a test send can appear in a client's step");
  const adm = read("admin/admin.js");
  if (!/const clientsWaitingOn = \(flowId\) => \(steps\.find\(\(x\) => x\.obj && x\.obj\.flowId === flowId\)\?\.uiState === "locked"\) \? \[\] :/.test(adm) || !/\(r\.dependsOn \|\| \[\]\)\.every\(\(id\) => id === flowId \|\| obSettled\(id\)\)/.test(adm)) fail("E: admin's \"the client waits on this\" isn't limited to the real blocker");
  if (!/small: "Your move", side: "the client waits on this"/.test(adm) || !/title: `\$\{waitedOn\.obj\.t\}: the client waits on it`/.test(adm)) fail("E: an RGA row a client waits on doesn't say so (row card + Your action)");
  if (!((adm.match(/\$\{rowLiveCardsHtml\(o, s\)\}/g) || []).length >= 2 && /id === "m1\.review\.first_5" \? r5AdminHtml\(\)/.test(adm)) || !/RGA's approved review message, personalized per customer/.test(adm)) fail("E: admin's step-12 row doesn't read the client's customers live, or hides whose text it is");
}

if (F.length) { console.error("🔴 step 12 isn't the approved design, or isn't honest:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 12 is step12_review_requests_v2 (the v1 rules in the Google card): waits with \"RGA is writing it · Review request message\" and the 4-part path; opens with \"✓ Ready\", 5 labelled customer cards, a live \"N of 5\" and a button that says what it sends (an international number counts, a half card is named); one save path; after, each customer reads request ready / you marked it sent / RGA is writing it, never \"sent\"; new reviews only when measured after the customers came in; the email has the letter blocks and claims the review link only when we hold it; no sideways scroll on a phone");
