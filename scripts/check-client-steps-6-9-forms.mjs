#!/usr/bin/env node
// check-client-steps-6-9-forms.mjs — 2026-10-30. The open forms of client steps 6 and 9, on Chris's approved client_step06_services_v2 + client_step09_form_v2. → project_client_card_system
//
// RUNS the real renderers, click handlers and save in a blank Chrome page (every request refused), and the real server code on fakes. Nothing leaves the laptop.
//   · ONE card on each form, one How, no second band; the button under the card
//   · step 6: the live count; Google lists none CAN finish (it stopped with words about a box this step doesn't have) and no request reaches Google for it; zero ticked is stopped in step 6's words
//   · step 6: no main category = RGA's move, no button; a near-duplicate of what's on Google isn't suggested, and admin's approved list doesn't read it as missing
//   · step 9: RGA's pick first and chosen; the button says what's true (Put it on Google · I connected it · Save)
//   · step 9's SAVE BODIES, key by key: the same answers admin reads. One paste box: their own site saves as website, anything else as tool
//   · categories: admin refuses past Google's 10, in admin-gbp-categories and gbp-publish
//   · Never "Book button" in the client's words; every line stays inside a 400px phone
// exit 0 = holds · 1 = regressed · 2 = can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — portal.js ${w} moved; re-read it before trusting this gate`); process.exit(2); };
const P = read("portal/portal.js"), CSS = read("portal/portal.css");
const fn = (name) => { let at = P.indexOf(`\nfunction ${name}(`), start = at + 1; if (at < 0) { at = P.indexOf(`\nasync function ${name}(`); start = at + 1; } if (at < 0) moved(`function ${name}`); const end = P.indexOf("\n}\n", at); if (end < 0) moved(`function ${name}`); return P.slice(start, end + 2); };
const line = (n) => { const m = new RegExp(`^(?:const|let) ${n} = .*;(?:\\s*//.*)?$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0]; };
const between = (a, b) => { const i = P.indexOf(a), j = P.indexOf(b, i + 1); if (i < 0 || j < 0) moved(`"${a}"`); return P.slice(i, j); };

// ── 1 · the seats ──
if (/Book button/.test(read("data/playbooks/client-steps.json")) || /"client[A-Za-z]*": "[^"\n]*Book button/.test(read("data/playbooks/playbooks.json"))) fail("a client's How this step works promises a Book button (Google picks the words)");
if (!/data-in-submit\$\{step\.id === "m1\.gbp\.services_products" \|\| s\.kind === "booking" \? " hidden" : ""\}>/.test(P)) fail("steps 6 and 9 show a button before Google has answered");
if (!/isDone && !taskState\?\.google_push\?\.state && !_editingSteps\.has\(step\.id\) \? svcNoRecordHtml\(/.test(P)) fail("step 6's old done card sits under the form while it's being changed");
if (!/r\.status !== "done" \|\| _editingSteps\.has\(r\.step\.id\)\) continue;/.test(P)) fail("a step being changed still gets the blank-row done card under its form");
if (!/\.pm-bk-ot > \.pm-bk-warn \{ color:var\(--state-you/.test(CSS)) fail("the contact-page warning isn't amber");
if (!/\.pm-cs \.pm-in-foot > \[data-in-cancel\] \{ order:2; \}/.test(CSS)) fail("Cancel sits before the button (every approved form page: the button, then Cancel)");
if (!/stepId === "m1\.gbp\.services_products" && host\.hasAttribute\("data-sv-had"\)\) \{ atDraw\(host, svCard\(\{[^\n]*We couldn't read your services on Google just now\. Please reload the page in a minute\./.test(P)) fail("step 6's unreadable line isn't the approved one");
if (!/stepId === "m1\.gbp\.booking_link" && host\.hasAttribute\("data-bk-had"\)\) \{ atDraw\(host, bkCard\(\{[^\n]*We couldn't read your Google profile just now\. Please reload the page in a minute\./.test(P)) fail("step 9's unreadable line isn't the approved one");
if (!/if \(svSub\) svSub\.hidden = noCat;/.test(P) || !/svPill\.textContent = "RGA is on it"/.test(P)) fail("step 6 with no main category isn't RGA's move");
if (!/const bkSub = [^\n]*if \(bkSub\) bkSub\.hidden = false;\s*bkSubmitLabel\(wrap\);/.test(P)) fail("step 9's button doesn't appear, or doesn't say what's true, once Google answers");
if (!/parsed = \{ value: \{ none: true, \.\.\.\(body\.value\.not_offered === true \? \{ not_offered: true \} : \{\}\) \} \};/.test(read("netlify/functions/portal-step-input.js"))) fail("the server drops Google offers none, so its Done card says customers call you");
if (!/if \(parsed\.additional\.length > 9\) return json\(409,/.test(read("netlify/functions/gbp-publish.js"))) fail("gbp-publish can send more than Google's 10 categories");

// ── 2 · drawn, clicked, saved ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const lifted = [
  `var __posts = []; window.fetch = async (u, o) => { __posts.push({ u: String(u), b: JSON.parse((o && o.body) || "null") }); return { ok: false, status: 400, json: async () => ({ ok: false, error: "stopped by the gate" }) }; };`,
  `async function portalToken() { return "t"; } function clientError(e) { return (e && e.message) || "x"; } function stepLockOf() { return null; } function portalStepNo() { return 2; } function settleStepResult() { return true; } function showPortalToast() {} function portalAlert() {} function isMonth2Step() { return false; } var _portalPlaybook = {}; var _lockData = {}; var _editingSteps = new Set(); var _rcEditing = new Set(); var _factsClientId = "c1";`,
  fn("escapeHtml"), fn("escapeAttribute"), line("monthDay"), line("siteShow"), line("GBP_STEPS"), line("BK_NOUN"),
  line("gbpMapsOf"), line("BK_Q"), line("bkCard"), line("svCard"), line("svCountWords"), fn("bkSubmitLabel"), fn("bookingFormHtml"), fn("svcFormHtml"), fn("atDraw"), fn("atSubmitLabel"), fn("submitStepInput"), fn("bkSelect"),
  between("// 🔒 step11_details_v1: a tick re-labels", "// 🔒 step10_booking_link_v1: picking a choice"),
  between("// 🔒 step10_booking_link_v1: picking a choice", "function bkSelect(o) {"),
  `document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-in-tick]"); if (t) t.classList.toggle("on"); }, true);`,
  `document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-in-submit]"); if (b) submitStepInput(b); });`,
];
const kit = planCardKit(P, lifted.join("\n"));
const src = [lifted[0], lifted[1], lifted[2], lifted[3], kit, csBlock(P, kit), ...lifted.slice(4)].join("\n");
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let R;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url() === "about:blank" || r.url().startsWith("data:") ? r.continue() : r.abort()));
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="h" style="padding:0 16px"></div></body></html>`);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: src });
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted forms won't load: ${errs[0]}`); await browser.close(); process.exit(2); }
  R = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const H = document.getElementById("h");
    const form = (id, kind, inner, btn) => { H.innerHTML = `<div class="pm-step-row pm-cs cs-you" id="step-row-${id}"><div class="pm-input" data-step-input="${id}" data-in-kind="${kind}" data-client-id="c1">${inner}<div class="pm-in-foot"><button type="button" class="pm-commit" data-in-submit>${btn}</button><span class="pm-msg" data-in-msg hidden></span></div></div></div>`; return H.querySelector(".pm-input"); };
    const info = () => { const cards = [...H.querySelectorAll(".pm-cs-card")]; return { cards: cards.length, nested: cards.filter((c) => cards.some((o) => o !== c && o.contains(c))).length, bands: H.querySelectorAll(".pm-k5-h").length, oldHow: /How to do this/.test(H.textContent), maps: !!H.querySelector(".pm-cs-foot a.lk"), underCard: !H.querySelector(".pm-cs-card [data-in-submit]"), tone: [...(cards[0] || { classList: [] }).classList].find((x) => ["ok", "you", "rga"].includes(x)), text: H.innerText.replace(/\s+/g, " ").trim(), wider: document.documentElement.scrollWidth > 400 }; };
    const out = {};
    _lockData = { tasks: { "m1.gbp.business_facts": { google_push: { maps_uri: "https://maps/x" } } } };
    // step 6
    const CATS = { primary: { label: "Plumber" }, additional: [] };
    const NOW6 = { categories: CATS, options: [{ key: "f:a", label: "Drain cleaning", kind: "yours" }, { key: "f:b", label: "Water heaters", kind: "suggested" }, { key: "g:c", label: "Leak repair", kind: "google" }], on: ["f:a"], suggested: ["f:b"] };
    const sv = (now, had = null, o = {}) => form("m1.gbp.services_products", "checklist", `<div class="pm-at pm-sv" data-gbp-now="m1.gbp.services_products">${svcFormHtml(now, had, o)}</div>`, "Put it on Google");
    const posts = async () => { await sleep(30); const p = __posts.filter((x) => /portal-step-input/.test(x.u)).map((x) => x.b.value); __posts.length = 0; return p; };
    const msg = () => { const m = H.querySelector("[data-in-msg]"); return m && !m.hidden ? m.textContent.trim() : ""; };
    sv(NOW6); out.s6 = info();
    out.s6Count0 = H.querySelector("[data-sv-count]")?.textContent;
    H.querySelector('[data-in-tick="g:c"]').click(); await sleep(20); out.s6Count1 = H.querySelector("[data-sv-count]")?.textContent;
    H.querySelector("[data-in-submit]").click(); out.s6Post = await posts();
    sv(NOW6, ["f:a"]); out.s6CountOne = H.querySelector("[data-sv-count]")?.textContent;
    sv(NOW6, []); H.querySelector("[data-in-submit]").click(); await sleep(20); out.s6Zero = { msg: msg(), posts: await posts() };
    sv({ categories: CATS, options: [], on: [], suggested: [] }); out.s6None = info(); H.querySelector("[data-in-submit]").click(); out.s6NonePost = await posts(); out.s6NoneMsg = msg();
    sv({ categories: {}, options: [], on: [], suggested: [] }); out.s6NoCat = info();
    sv(NOW6, ["f:a"], { editing: true }); out.s6Edit = info();
    // step 9
    const A = { key: "url_appointment", label: "Appointments", none: "Customers call us", links: [] };
    const SITE9 = { site: "joes.com", types: [A], pages: [{ url: "https://www.joes.com/schedule/", label: "Schedule", kind: "book" }, { url: "https://www.joes.com/contact/", label: "Contact", kind: "contact" }], tools: [] };
    const bk = (now, had = null, o = {}) => { const w = form("m1.gbp.booking_link", "booking", `<div class="pm-bk" data-gbp-now="m1.gbp.booking_link" data-client-id="c1">${bookingFormHtml(now, had, o)}</div>`, "x"); bkSubmitLabel(w); return w; };
    const btn = () => H.querySelector("[data-in-submit]").textContent.trim();
    const pickOpt = (sel) => { const o = H.querySelector(sel); o.click(); return btn(); };
    const send = async () => { H.querySelector("[data-in-submit]").click(); return (await posts())[0] || null; };
    bk(SITE9); out.pasteShut = getComputedStyle(H.querySelector('[data-bk-opt="paste"] .pm-bk-in')).display === "none"; out.b = info(); out.bBtn = btn(); out.bSel = H.querySelector("[data-bk-opt].sel b").textContent; out.bRec = H.querySelector("[data-bk-opt].sel").textContent; out.bWarn = !!H.querySelector("[data-bk-warn]");
    out.bPage = await send();
    out.bNoneBtn = pickOpt('[data-bk-opt="none"]'); out.bNone = await send();
    bk(SITE9); pickOpt('[data-bk-opt="paste"]');
    const type = (v) => { const i = H.querySelector('[data-bk-url="paste"]'); i.value = v; };
    type(""); out.bEmpty = await send(); out.bEmptyMsg = msg();
    type("https://www.joes.com/quote"); out.bOwn = await send();
    bk(SITE9); pickOpt('[data-bk-opt="paste"]'); type("https://calendly.com/joes/visit"); out.bTool = await send();
    const PARTNER = { site: "joes.com", types: [A], pages: [], tools: [{ platform: "Square", url: "https://book.squareup.com/joes", partner: true }] };
    bk(PARTNER); out.pBtn = btn(); out.pSel = H.querySelector("[data-bk-opt].sel").getAttribute("data-bk-opt"); out.pSend = await send();
    bk(PARTNER); out.pAddBtn = pickOpt('[data-bk-opt="tool"]'); out.pAdd = await send();
    const KEEP = { site: "joes.com", types: [{ ...A, links: [{ url: "https://www.joes.com/schedule/?utm=1", clean: "https://www.joes.com/schedule/", platform: null }] }], pages: SITE9.pages, tools: [] };
    bk(KEEP); out.k = info(); out.kRows = H.querySelectorAll('[data-bk-opt="website"]').length; out.kSel = H.querySelector("[data-bk-opt].sel").getAttribute("data-bk-opt"); out.kSend = await send();
    bk({ site: "joes.com", types: [A], pages: [], tools: [] }); out.nf = info(); out.nfSel = H.querySelector("[data-bk-opt].sel").getAttribute("data-bk-opt"); out.nfPaste = getComputedStyle(H.querySelector('[data-bk-url="paste"]')).display !== "none";
    bk(SITE9, { value: "https://other.com/book", choice: "tool" }); out.hSel = H.querySelector("[data-bk-opt].sel").getAttribute("data-bk-opt"); out.hVal = H.querySelector('[data-bk-url="paste"]').value;
    bk(SITE9, { none: true }); out.hNone = H.querySelector("[data-bk-opt].sel").getAttribute("data-bk-opt"); out.hNoneBtn = btn();
    bk({ types: [] }); out.off = info(); out.offBtn = btn(); out.offSend = await send();
    const FOOD = { site: "bistro.com", types: [{ key: "url_reservations", label: "Reservations", none: "We don't take reservations", links: [] }, { key: "url_order_ahead", label: "Order ahead", none: "We don't take orders", links: [] }], pages: [{ url: "https://bistro.com/reserve", label: "Reserve", kind: "book" }], tools: [] };
    bk(FOOD); out.food = info(); out.foodSend = await send();
    bk(SITE9, { value: "https://www.joes.com/schedule/", choice: "website" }, { editing: true }); out.ed = info();
    return out;
  });
} catch (e) { console.error(`⚠️  INDETERMINATE — the lifted forms threw: ${String(e.message || e).slice(0, 220)}`); await browser.close(); process.exit(2); } finally { await browser.close().catch(() => {}); }

const has = (o, ...w) => w.every((x) => o.text.includes(x));
// step 6
const one = (o, n) => { if (o.cards !== 1 || o.nested || o.bands !== 1 || o.oldHow) fail(`${n} isn't one card with one band and one How (${JSON.stringify({ c: o.cards, n: o.nested, b: o.bands, h: o.oldHow })})`); if (o.wider) fail(`${n} is wider than a 400px phone`); };
for (const [k, n] of [["s6", "step 6"], ["s6None", "step 6, none listed"], ["s6NoCat", "step 6, no category"], ["s6Edit", "step 6, changing"], ["b", "step 9"], ["k", "step 9, keep"], ["nf", "step 9, nothing found"], ["off", "step 9, not offered"], ["food", "step 9, restaurant"], ["ed", "step 9, changing"]]) one(R[k], n);
if (!has(R.s6, "Pick your services", "from Google's list for Plumber", "RGA ticked the ones we think you offer") || !R.s6.maps) fail(`step 6's card isn't the approved one (${R.s6.text})`);
if (R.s6Count0 !== "2 services ticked." || R.s6Count1 !== "3 services ticked." || R.s6CountOne !== "1 service ticked.") fail(`the count isn't live (${R.s6Count0} → ${R.s6Count1} · ${R.s6CountOne})`);
if (JSON.stringify(R.s6Post[0]?.slice().sort()) !== JSON.stringify(["f:a", "f:b", "g:c"])) fail(`step 6's save body changed (${JSON.stringify(R.s6Post)})`);
if (R.s6Zero.msg !== "Tick at least one service." || R.s6Zero.posts.length) fail(`zero ticked isn't stopped in step 6's words (${JSON.stringify(R.s6Zero)})`);
if (!has(R.s6None, "Google lists no services for your categories", "Save to finish this step") || JSON.stringify(R.s6NonePost) !== "[[]]") fail(`Google lists none can't finish (${JSON.stringify(R.s6NonePost)} · ${R.s6NoneMsg})`);
if (R.s6NoCat.tone !== "rga" || !has(R.s6NoCat, "RGA is setting your Google categories")) fail(`no main category isn't RGA's card (${R.s6NoCat.text})`);
if (R.s6Edit.tone !== "ok" || !has(R.s6Edit, "Change your services", "The step stays Done until you save.")) fail(`changing a done step 6 isn't the approved card (${R.s6Edit.text})`);
// step 9
if (R.bBtn !== "Put it on Google" || !/joes\.com\/schedule/.test(R.bSel) || !/RGA recommends/.test(R.bRec) || !R.bWarn || !R.b.maps) fail(`step 9's pick isn't first and chosen (${JSON.stringify([R.bBtn, R.bSel, R.bRec])})`);
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m} (${JSON.stringify(a)})`); };
eq(R.bPage, { value: "https://www.joes.com/schedule/", choice: "website", link_type: "url_appointment" }, "a found page's save body changed");
if (!R.pasteShut) fail("the paste box is open before they choose it");
if (R.bNoneBtn !== "Save") fail(`the button says ${R.bNoneBtn} when nothing goes on Google`);
eq(R.bNone, { none: true }, "Customers call us' save body changed");
if (R.bEmpty || R.bEmptyMsg !== "Paste the link first.") fail("an empty paste box saves");
eq(R.bOwn, { value: "https://www.joes.com/quote", choice: "website", link_type: "url_appointment" }, "a pasted link on their own site doesn't save as website");
eq(R.bTool, { value: "https://calendly.com/joes/visit", choice: "tool", link_type: "url_appointment" }, "a pasted link elsewhere doesn't save as tool");
if (R.pBtn !== "I connected it" || R.pSel !== "partner") fail(`a booking partner's button isn't I connected it (${R.pBtn})`);
eq(R.pSend, { choice: "partner", platform: "Square", value: "https://book.squareup.com/joes", link_type: "url_appointment" }, "a partner's save body changed");
if (R.pAddBtn !== "Put it on Google") fail("adding the partner's link doesn't say Put it on Google");
eq(R.pAdd, { value: "https://book.squareup.com/joes", choice: "tool", link_type: "url_appointment" }, "adding the partner's link changed its save body");
if (R.kSel !== "keep" || R.kRows !== 1 || !has(R.k, "We add a small tag") || !has(R.k, "RGA recommends keeping it")) fail(`the link Google shows isn't kept, disclosed and one row (${JSON.stringify([R.kSel, R.kRows])})`);
eq(R.kSend, { value: "https://www.joes.com/schedule/?utm=1", choice: "keep", link_type: "url_appointment" }, "keep's save body changed");
if (R.nfSel !== "paste" || !R.nfPaste || !has(R.nf, "Paste a link")) fail("with nothing found, the paste box isn't open");
if (R.hSel !== "paste" || R.hVal !== "https://other.com/book") fail("a saved link doesn't come back in the paste box");
if (R.hNone !== "none" || R.hNoneBtn !== "Save") fail("a saved no-link answer doesn't come back");
if (R.offBtn !== "Save" || !has(R.off, "Google doesn't offer your kind of business a booking link")) fail(`Google offers none isn't the approved card (${R.off.text})`);
eq(R.offSend, { none: true, not_offered: true }, "Google offers none doesn't say so to the server");
if (!has(R.food, "Google offers your kind of business these links", "Reservations", "Order ahead", "We don't take reservations")) fail(`a restaurant loses its two kinds of link (${R.food.text})`);
eq(R.foodSend, { value: "https://bistro.com/reserve", choice: "website", link_type: "url_reservations" }, "a restaurant's link type isn't sent");
if (R.ed.tone !== "ok" || !has(R.ed, "On Google now:", "The step stays Done until you save.")) fail(`changing a done step 9 isn't the approved card (${R.ed.text})`);

// ── 3 · the server, on fakes ──
const require = createRequire(`${SITE}/netlify/functions/_gbp-services.js`);
const S = require("./_gbp-services.js");
{ const loc = { categories: { primaryCategory: { name: "c/1", displayName: "Marketing" } }, serviceItems: [{ freeFormServiceItem: { label: { displayName: "Google Business Profile (GBP) optimization" } } }] };
  const draft = `- displayName: "Google Business Profile Optimization"\n- displayName: "Google Maps marketing"`;
  const v = S.servicesView(loc, { categories: [] }, draft), labels = v.options.map((o) => o.label);
  if (labels.includes("Google Business Profile Optimization") || !labels.includes("Google Maps marketing") || v.suggested.length !== 1) fail(`a near-duplicate is still suggested, or a real suggestion went (${labels.join(" · ")})`);
  if (S.sameKey("Google Maps marketing") === S.sameKey("Google Maps Local SEO")) fail("two different services read as one");
  process.env.SUPABASE_URL = "https://fake.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const { plan } = require("./admin-gbp-services-push.js");
  const p = plan(["Google Business Profile Optimization", "Google Maps marketing"], v);
  if (!p.rows[0].on || p.rows[1].on || p.adding !== 1) fail(`admin reads the near-duplicate as missing (${JSON.stringify(p)})`);
  const p2 = plan(["Google Business Profile (GBP) optimization"], { on: ["k"], options: [{ key: "k", label: "Google Business Profile Optimization" }] });
  if (!p2.rows[0].on) fail(`admin reads the bracketed name as missing (${JSON.stringify(p2)})`); }
{ let patched = 0; const fetchFake = async (u, o = {}) => { if ((o.method || "GET") === "PATCH") patched++; return { ok: true, status: 200, json: async () => /batchGet/.test(String(u)) ? { categories: [] } : { categories: { primaryCategory: { name: "c/1", displayName: "Bakery" } }, serviceItems: [] } }; };
  const r = await S.applyServices([], { fetch: fetchFake, token: "t", loc: "locations/1" });
  if (patched || r.state !== "on_google") fail(`Google lists none sends a request to Google, or doesn't finish (${patched} · ${r.state})`); }
{ const src = read("netlify/functions/admin-gbp-categories.js"), at = src.indexOf("function checksFor("), end = src.indexOf("\n}\n", at); if (at < 0 || end < 0) { console.error("⚠️  INDETERMINATE — checksFor moved"); process.exit(2); }
  const WK = /const WEEK = [^;]+;/.exec(src); if (!WK || !/AT_A_TIME/.test(WK[0])) { console.error("⚠️  INDETERMINATE — the category limits moved"); process.exit(2); } const low = (x) => String(x || "").toLowerCase().trim(), day = () => "";
  const checksFor = new Function("low", "day", `${WK[0]} ${src.slice(at, end + 2)} return checksFor;`)(low, day);
  const loc = (n) => ({ categories: { primaryCategory: { name: "p" }, additionalCategories: Array.from({ length: n }, (_, i) => ({ name: `c${i}`, displayName: `C${i}` })) }, metadata: { hasVoiceOfMerchant: true } });
  const at10 = checksFor(["X"], loc(9), { x: { name: "x", displayName: "X" } }, 0, 0, { ok: true }).checks.find((c) => c.key === "limit");
  const at9 = checksFor(["X"], loc(8), { x: { name: "x", displayName: "X" } }, 0, 0, { ok: true }).checks.find((c) => c.key === "limit");
  if (!at10 || at10.ok || !/11 of 10/.test(at10.detail)) fail(`admin doesn't refuse an 11th category (${JSON.stringify(at10)})`);
  if (!at9 || !at9.ok || !/10 of 10/.test(at9.detail)) fail(`admin refuses the 10th category (${JSON.stringify(at9)})`); }
{ const G = require("./_gbp-profile.js"); let hits = 0; const f = async () => { hits++; return { ok: true, status: 200, json: async () => ({}) }; };
  const a = await G.applyForStep("m1.gbp.booking_link", { none: true, not_offered: true }, { fetch: f, token: "t", loc: "locations/1" });
  const b = await G.applyForStep("m1.gbp.booking_link", { none: true }, { fetch: f, token: "t", loc: "locations/1" });
  if (a.reason !== "google_offers_no_link" || b.reason !== "no_online_booking" || hits) fail(`a no-link answer reads the wrong reason or reaches Google (${a.reason} · ${b.reason} · ${hits})`); }

if (F.length) { console.error(`🔴 client steps 6 · 9 forms regressed:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client steps 6 and 9 forms hold: one card, one How, the button under it; step 6's live count, Google lists none finishes with nothing sent, no main category is RGA's move, a near-duplicate isn't suggested and admin agrees; step 9's pick first, the button says what's true, the same save bodies; past Google's 10 categories is refused");
