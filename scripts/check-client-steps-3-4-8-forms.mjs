#!/usr/bin/env node
// check-client-steps-3-4-8-forms.mjs — 2026-10-30. The three inner forms batch 1 left inside the system card, rebuilt from Chris's approved
// pages: reports/mockups/client_step03_builder_v2 · client_step04_fact_check_v2 · client_step08_details_v2. → project_client_card_system
//
// RUNS the real renderers AND the real click handlers in a blank Chrome page (every request is refused: nothing leaves the laptop, no sign-in,
// no Supabase, no Google), for four kinds of business: a builder site · no website · a storefront · a service area. It holds:
//   · step 3's words the client AGREED to, verbatim: the consent, the promise version, the promise fold (§5, §8), "Never send us your
//     password", the developer's email. A new promise is a NEW version, never a silent edit
//   · the send button is UNDER the card, off until the consent is ticked, on once it is; a builder with no safe invite asks no consent
//   · the builder's OWN time on the band (it wrote to .gcard-when, which the system card doesn't have, so it always read "takes 2–5 min")
//   · ONE card and ONE How on each form, and the foot says "How this step works"
//   · step 4: "From your plan · N of M on Google" is one line; "yes, customers come here" shows the warning and does NOT save by itself; no Cancel
//   · step 8: RGA's recommendation on its own row; Cancel only while changing a done step; "Google offers none" can finish; while Google is being
//     read, or couldn't be, the button sends NOTHING (an empty answer would take every detail off Google)
//   · THE SAVE BODIES, key by key: what the client's answers post to portal-step-input is what the old forms posted
//   · nothing wider than a 400px phone, in any state
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
const PUB = Object.fromEntries(Object.entries(JSON.parse(read("data/site-platforms.json")).platforms).map(([k, { rga, ...pub }]) => [k, pub]));

// ── lifting: a function by name (async kept), a const line, a slice between two markers ──
const fn = (name) => {
  let at = P.indexOf(`\nfunction ${name}(`);
  let start = at + 1;
  if (at < 0) { at = P.indexOf(`\nasync function ${name}(`); start = at + 1; }
  if (at < 0) moved(`function ${name}`);
  // to the first column-0 close: a brace counter is fooled by the facts branch's regex (/^\{/)
  const end = P.indexOf("\n}\n", at);
  if (end < 0) moved(`function ${name}`);
  return P.slice(start, end + 2);
};
const line = (n) => { const m = new RegExp(`^(?:const|let) ${n} = .*;(?:\\s*//.*)?$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0]; };
const between = (a, b) => { const i = P.indexOf(a), j = P.indexOf(b, i + 1); if (i < 0 || j < 0) moved(`"${a}"`); return P.slice(i, j); };
const multi = (name, end) => { const i = P.indexOf(`const ${name} = `); if (i < 0) moved(`const ${name}`); const j = P.indexOf(end, i); if (j < 0) moved(`const ${name}`); return P.slice(i, j + end.length); };

// the form's own return, lifted as it stands (never a copy of its shape in this gate)
const factsTplAt = P.indexOf('if (s.kind === "facts") return `<div class="pm-input"');
if (factsTplAt < 0) moved("step 4's form template");
const factsTplEnd = P.indexOf("</div>`;", P.indexOf('data-in-msg', factsTplAt));
if (factsTplEnd < 0) moved("step 4's form template");
const factsTpl = P.slice(factsTplAt + 'if (s.kind === "facts") '.length, factsTplEnd + "</div>`;".length);

// ── 1 · what's in the source: the words, the seats, the guards ──
const CONSENT = "I allow Rocket Growth Agency to access my website and edit its pages and files for the work in our promise. No change goes live until I approve it.";
if (!P.includes(`const ACC_CONSENT_TEXT = "${CONSENT}";`)) fail("the consent words changed: what the client agrees to is word for word (a new promise is a NEW version)");
if (!/const ACC_PROMISE_VERSION = "2026-10-23b";/.test(P)) fail("the promise version changed without a new approved promise");
if (!P.includes("value.consent = host._accConsent ? { promise: ACC_PROMISE_VERSION, text: ACC_CONSENT_TEXT } : null;")) fail("what's recorded on consent changed");
if (!P.includes('<details class="pm-ax-promise"><summary><span class="pm-ax-pr-ok">✓ You approve every change</span><span class="pm-ax-pr-ok">✓ Every change is listed</span><span class="pm-ax-pr-ok">✓ Remove us anytime</span><span class="pm-ax-pr-more">What we\'ll do with access</span></summary>')) fail("the promise line changed (You approve every change · Every change is listed · Remove us anytime · What we'll do with access)");
for (const w of ["Our promise about your website", "We need access so we can do the website work for you, instead of sending you instructions. Your website stays yours, and nothing changes until you approve it.", "Your consent below is our written record. Our Service Agreement covers website access (§5, §8)", "In your To do tab. Nothing changes before this", "Listed in What RGA did, with the old text kept"])
  if (!P.includes(w)) fail(`the promise fold lost its words: "${w}"`);
if (!P.includes("<b>Never send us your password.</b> An invite gives us exactly what we need, and you can take it back anytime.")) fail("the approved password line changed");
if (/pm-ax-why|gcard-when/.test(fn("accessCardHtml") + fn("accDrawFound") + fn("accDrawPlatform"))) fail("the old Why line, or the time written to .gcard-when (a class the system card doesn't have), is back");
if (!/const HOW_WORKS_FOOT = new Set\(\["m1\.access\.website", "m1\.gbp\.business_facts", "m1\.gbp\.attributes", "m1\.gbp\.services_products", "m1\.gbp\.booking_link", "m1\.brand\.social_profiles"\]\);/.test(P) || !P.includes("escapeHtml(HOW_WORKS_FOOT.has(step.id) || gcHold ? DETAIL_LABEL.done[0] : DETAIL_LABEL[detailKind][0])")) fail("these forms' foot doesn't say \"How this step works\"");
if (!/\(s\.kind === "hours" \|\| s\.kind === "booking" \|\| step\.id === "m1\.gbp\.attributes" \|\| step\.id === "m1\.gbp\.services_products"\) && _editingSteps\.has\(step\.id\) \? `<button type="button" class="pm-amend" data-in-cancel=/.test(P)) fail("step 8's Cancel isn't only while changing a done step");
if (/data-in-cancel/.test(factsTpl)) fail("step 4 has a Cancel: it has no edit mode");
const noComments = (x) => x.replace(/^[ \t]*\/\/.*$/gm, "");
if (/pm-sa-ico|We target|pm-sa-cmp|pm-fx-oklist/.test(noComments(fn("areaCardHtml") + fn("factsRowsHtml")))) fail("the service-area box, or the two lists under section labels, are back");
const block = CSS.slice(CSS.indexOf("THE INNER FORMS ON THE CARD SYSTEM"));
if (CSS.indexOf("THE INNER FORMS ON THE CARD SYSTEM") < 0) moved("the inner forms' CSS");
if (/font:[^;}]*inherit/.test(block)) fail("the inner forms' CSS uses a font shorthand with inherit (the browser drops the declaration)");

// ── 2 · drawn and clicked for real ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }

const lifted = [
  `const STUB = 1; var RC_WEB = ""; var _accPickSelf = new Set(); var _accRoles = {}; var _accHosts = {}; var _accNames = {}; var _factsClientId = "c1"; var _portalContractCache = {};`,
  `var __posts = []; window.fetch = async (u, o) => { __posts.push({ u: String(u), b: JSON.parse((o && o.body) || "null") }); return { ok: false, status: 400, json: async () => ({ ok: false, error: "stopped by the gate" }) }; };`,
  `async function portalToken() { return "t"; } function clientError(e) { return (e && e.message) || "x"; } function stepLockOf() { return null; } function portalStepNo() { return 5; } function settleStepResult() { return true; } function showPortalToast() {} function portalAlert() {} function isMonth2Step() { return false; } var _portalPlaybook = {};`,
  fn("escapeHtml"), fn("escapeAttribute"), line("monthDay"),
  line("_rcEditing"), line("_editingSteps"), line("GBP_STEPS"),
  line("RGA_ADMIN_EMAIL"), line("RGA_ADMIN_GITHUB"), line("ACC_COMMON"), line("ACC_SEND"), line("ACC_CHECK_ICON"), line("ACC_PROMISE_VERSION"), line("ACC_CONSENT_TEXT"),
  multi("ACC_FILES", "\n};"), multi("ACC_PROMISE_ICON", "\n};"), multi("ACC_PROMISE_DO", "];"), multi("ACC_PROMISE_NEVER", "];"),
  ...["accPart", "accSetWhen", "accSetSend", "accConsentHtml", "accPromiseHtml", "accessCardHtml", "accSiteName", "accStep1Name", "accHostOf", "accHostMono", "accMono", "accWhoOf", "accDevNote", "accDevNoteText", "accProgHtml", "accSetupHtml", "accCustomSetupHtml", "accBuilderWho", "accBuilderNote", "accBuilderSetupHtml", "accFoundPill", "accDrawFound", "accDrawDesigner", "accDrawPlatform", "accSave", "accRequestCheck", "accOpenDesigner"].map(fn),
  ...["factRowHtml", "factPick", "areaCardHtml", "factsRowsHtml", "factsProgress", "areaListOf", "areaRecount", "atCardHtml", "atDraw", "attrsFormHtml", "atSubmitLabel", "readStepInputValue", "submitStepInput"].map(fn),
  line("siteShow"),
  `function factsForm(id, s, head, fields) { ${factsTpl} }`,
  between("// the consent tick: record it", "// ── step 3: the call tracking decision"),
  between("// 🔒 BUSINESS FACTS (business_on_google_v1): a pick answers", "// 🔒 KEEP IT (second_logo_cleanup_v1)"),
  between("// 🔒 step11_details_v1: a tick re-labels", "// 🔒 step10_booking_link_v1: picking a choice"),
  // the portal's general handlers, as they stand: a tap on a tick toggles it (unchanged by this work), the button sends
  `document.addEventListener("click", (e) => { const t = e.target.closest && e.target.closest("[data-in-tick]"); if (t) t.classList.toggle("on"); }, true);`,
  `document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-in-submit]"); if (b) submitStepInput(b); });`,
];
const kit = planCardKit(P, lifted.join("\n"));
const src = [lifted.slice(0, 3).join("\n"), lifted[3], lifted[4], kit, csBlock(P, kit), ...lifted.slice(5)].join("\n");

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
  R = await page.evaluate(async (PUB) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const h = document.getElementById("h"), out = { wide: [], gone: [] };
    // the page, and every drawn element: a card with overflow:hidden would hide a too-wide row from the page's own width
    const wide = (name) => { if (document.scrollingElement.scrollWidth > 400) out.wide.push(`${name} (${document.scrollingElement.scrollWidth}px)`);
      const over = [...h.querySelectorAll("*")].find((e) => e.getClientRects().length && e.getBoundingClientRect().right > 401); if (over) out.wide.push(`${name} (.${String(over.className).split(" ")[0]} ends at ${Math.round(over.getBoundingClientRect().right)}px)`); };
    const q = (s) => h.querySelector(s);
    const tap = async (s) => { const e = q(s); if (!e) { out.gone.push(s); return; } e.click(); await sleep(15); };
    const said = async () => { await sleep(30); const p = __posts.map((x) => x.b); __posts.length = 0; return p; };

    // ── step 3 ──
    const open3 = (j, t = { status: "in_progress" }) => {
      h.innerHTML = `<div class="pm-step-row pm-cs" id="step-row-m1.access.website"><div id="action-items-list-x">${accessCardHtml({ id: "m1.access.website" }, t, "c1")}</div></div>`;
      const host = q("[data-acc-host]");
      if (j) { host._acc = { platforms: PUB, ...j }; host._accCheckedAt = "T"; if (j.designer || (j.platform && (j.confidence === "stated" || j.confidence === "ask"))) accDrawFound(host); else accDrawPlatform(host, null, null); }
      return host;
    };
    const sendInfo = () => { const b = q("[data-acc-send]"); return b && { off: b.disabled, words: b.textContent.trim(), inCard: !!b.closest(".pm-cs-card"), underCard: !!b.closest(".pm-k5-acts") }; };
    const whenTxt = () => q("[data-acc-when]")?.textContent || null;

    // a builder site, found: the builder's own time, Step 1 one line + Change, the button off → on
    open3({ status: "ok", platform: "squarespace", confidence: "stated", signs: 2, evidence: ["x"], site: "plumb.example" }); wide("3 found");
    out.found = { when: whenTxt(), cards: h.querySelectorAll(".pm-cs-card").length, nested: h.querySelectorAll(".pm-cs-card .pm-cs-card").length, pwd: !!q(".pm-cs-card > .pm-cs-note")?.textContent.includes("Never send us your password"), parts: h.querySelectorAll("[data-acc-part]").length };
    await tap("[data-acc-yes]"); wide("3 builder steps");
    out.builder = { when: whenTxt(), one: q('[data-acc-part="1"]').textContent.replace(/\s+/g, " "), change: !!q('[data-acc-part="1"] .pm-ax-rr [data-acc-change]'), send: sendInfo(), consentInPart: !!q('[data-acc-part="3"] [data-acc-consent]') };
    q("[data-acc-send]").click(); out.builder.postOff = await said();
    await tap("[data-acc-consent]"); out.builder.sendOn = sendInfo();
    q("[data-acc-consent]").click(); await sleep(15); out.builder.sendOffAgain = sendInfo();
    await tap("[data-acc-consent]"); await tap("[data-acc-send]"); out.builder.post = await said();

    // no website on file: the answer under the card, no consent asked
    open3({ status: "no_site" }); wide("3 no site"); out.noSiteWhen = whenTxt(); out.noSiteSend = sendInfo();
    await tap("[data-acc-none]"); out.none = await said();

    // a developer-built site on Netlify: the picture, who, GitHub's steps, the email word for word
    open3({ status: "ok", platform: "custom", confidence: "stated", signs: 2, evidence: ["x"], host: "netlify", site: "dev.example" });
    out.devFoundWhen = whenTxt();
    const waitSide = (who) => { const d = document.createElement("div"); d.innerHTML = accessCardHtml({ id: "m1.access.website" }, { status: "in_progress", client_input: { via: "designer", who, platform: "custom", at: "2026-10-30T12:00:00Z" } }, "c1"); return d.querySelector(".pm-cs-card")?.textContent.replace(/\s+/g, " ") || ""; };
    out.waitDev = waitSide("developer"); out.waitDesigner = waitSide("self");
    await tap("[data-acc-yes]"); wide("3 who");
    out.who = { when: whenTxt(), one: q('[data-acc-part="1"]').textContent.replace(/\s+/g, " "), two: q('[data-acc-part="2"]').textContent.replace(/\s+/g, " "), send: sendInfo(), three: q('[data-acc-part="3"]').textContent.replace(/\s+/g, " ") };
    await tap('[data-acc-who="self"]'); await tap('[data-acc-files="github"]'); wide("3 github");
    out.self = { two: q('[data-acc-part="2"]').textContent.replace(/\s+/g, " "), send: sendInfo() };
    await tap("[data-acc-consent]"); await tap("[data-acc-send]"); out.selfPost = await said();
    await tap('[data-acc-who="dev"]'); wide("3 dev");
    out.dev = { mail: q("[data-acc-notetext]")?.value, send: sendInfo(), ticked: q("[data-acc-consent]")?.checked };
    await tap("[data-acc-send]"); out.devPost = await said();

    // a builder with no safe invite: never a password, no consent, the button on
    open3({ status: "unknown", site: "x.example" }); wide("3 tiles"); out.tilesWhen = whenTxt();
    await tap("[data-acc-more]"); await tap('[data-acc-pick="jimdo"]'); wide("3 jimdo");
    out.jimdo = { when: whenTxt(), send: sendInfo(), consent: !!q("[data-acc-consent]"), what: q(".pm-ax-what")?.textContent };
    await tap("[data-acc-send]"); out.jimdoPost = await said();

    // blocked: why + Check it for me; a footer credit: the note under the card, its button off until consent
    open3({ status: "couldnt_check", reason: "blocked", site: "x.example" }); wide("3 blocked"); await tap("[data-acc-check]"); out.check = await said();
    open3({ status: "ok", designer: { name: "Main Street Web" }, site: "x.example", evidence: [] }); await tap("[data-acc-dyes]"); wide("3 designer");
    out.designer = { off: q("[data-acc-designer-done]").disabled, oneCard: q("[data-acc-designer-box] .pm-cs-card .pm-cs-card") === null };
    await tap("[data-acc-consent]"); await tap("[data-acc-designer-done]"); out.designerPost = await said();
    // the retired one-time link: its side stays its own (no time written over it)
    open3(null, { status: "in_progress", client_input: "https://onetimesecret.example/x", client_input_at: "2026-10-20T00:00:00Z" }); out.oldLinkWhen = whenTxt();

    // ── step 4 ──
    const FID = "m1.gbp.business_facts";
    const open4 = (now) => {
      const head = `<p class="pm-gnow" data-gbp-now="${FID}"></p>`, fields = `<div class="pm-facts-rows" data-gbp-facts="${FID}"></div>`;
      h.innerHTML = `<div class="pm-step-row pm-cs">${factsForm(FID, { cta: "Save and check Google" }, head, fields)}</div>`;
      const wrap = q("[data-step-input]");
      if (now) { q("[data-gbp-facts]").innerHTML = factsRowsHtml(now); factsProgress(wrap); }
      return wrap;
    };
    const A6 = ["El Segundo, CA", "Culver City, CA", "Los Angeles, CA", "Santa Monica, CA", "Manhattan Beach, CA", "Marina Del Rey, CA"];
    const G = { name: "Acme Roofing", phone: "(424) 242-2040", website: "https://acme.example/", come: false, area: A6, state: "CA", region: "US" }, T = { name: "Acme Roofing", phone: "(424) 242-2040", website: "https://acme.example/", come: false };
    const SAME = { name: true, come: true, area: true, phone: true, website: true };
    const facts4 = () => ({ side: q("[data-fx-side]")?.textContent, bar: q(".pm-fx-txt")?.textContent, segs: [...h.querySelectorAll(".pm-fx-bar i")].map((i) => i.className).join(""), cards: h.querySelectorAll(".pm-cs-card").length, nested: h.querySelectorAll(".pm-cs-card .pm-k5-plan").length, saveInCard: !!q("[data-in-submit]").closest(".pm-cs-card"), cancel: !!q("[data-in-cancel]"), marks: h.querySelectorAll('[data-gbp-facts] .pm-fact-s .mk.ok svg').length, text: q(".pm-cs-card").textContent.replace(/\s+/g, " ") });

    // a service area, three plan areas not on Google
    const rec = { google: G, told: T, same: { ...SAME, area: null }, recommend: { area: { add: ["Mar Vista", "Palms", "Playa Vista"], targets: [{ name: "Mar Vista", on: false }, { name: "Palms", on: false }, { name: "Playa Vista", on: false }], state: "CA" } }, missing: [] };
    open4(rec); wide("4 recommend"); out.rec = facts4(); out.recCount = q("[data-area-count]").textContent; out.chips = [...h.querySelectorAll('[data-area-chip="add"]')].map((c) => c.getAttribute("data-area-name"));
    await tap("[data-area-use]"); out.recPost = await said();
    open4(rec); await tap('[data-area-chip="keep"][data-area-name="Culver City, CA"]'); q("[data-area-input]").value = "Venice"; await tap("[data-area-add]"); await tap('[data-area-chip="add"][data-area-name="Palms, CA"]'); out.editedCount = q("[data-area-count]").textContent; await tap("[data-area-use]"); out.recEditPost = await said();
    open4(rec); await tap('[data-fact-pick="area"][data-fact-val="ok"]'); out.recKeepPost = await said();
    // some of the plan already on Google: only the missing get a chip
    open4({ ...rec, recommend: { area: { add: ["Palms"], targets: [{ name: "Culver City", on: true }, { name: "Palms", on: false }, { name: "Santa Monica", on: true }], state: "CA" } } }); out.rec1 = facts4();

    // a storefront: customers come, no service area, no website on Google
    const shop = { google: { ...G, name: "Bluebird Cafe", come: true, area: [], website: null, state: "NY" }, told: { ...T, name: "Bluebird Cafe", come: true, website: null }, same: { ...SAME, area: null, website: null }, recommend: {}, missing: [] };
    open4(shop); wide("4 storefront"); out.shop = facts4(); await tap('[data-fact-pick="area"][data-fact-val="ok"]'); out.shopAns = { ans: q('[data-fact="area"] .pm-fact-ans')?.textContent.replace(/\s+/g, " "), side: q("[data-fx-side]").textContent, posts: await said() };
    await tap('[data-fact-other-go="website"]'); q('[data-fact-other="website"]').value = "https://bluebird.example"; await tap("[data-in-submit]"); out.shopPost = await said();

    // a number that differs: two answers, each saying whose; the last answer saves by itself
    const diff = { google: { ...G, phone: "(424) 555-0188" }, told: { ...T, phone: "(424) 555-0147" }, same: { ...SAME, phone: false }, recommend: {}, missing: [] };
    open4(diff); wide("4 phone"); out.diff = { opts: h.querySelectorAll('.pm-fact-opts [data-fact-pick="phone"]').length, text: facts4().text };
    await tap('[data-fact-pick="phone"][data-fact-val="(424) 555-0147"]'); out.diffPost = await said();

    // yes, customers come here: the warning, NO save, the button sends it; no takes the warning away and saves
    const come = { google: G, told: { ...T, come: null }, same: { ...SAME, come: null }, recommend: {}, missing: [] };
    open4(come); await tap('[data-fact-pick="come"][data-fact-val="yes"]'); wide("4 come");
    out.come = { posts: await said(), careShows: !!q("[data-fact-care]").getClientRects().length, askShows: !!q('[data-fact="come"] .pm-fact-ask').getClientRects().length, side: q("[data-fx-side]").textContent, on: q('[data-fact-val="yes"]').classList.contains("on") };
    await tap("[data-in-submit]"); out.comePost = await said();
    open4(come); await tap('[data-fact-pick="come"][data-fact-val="yes"]'); await said(); await tap('[data-fact-pick="come"][data-fact-val="no"]'); out.comeNo = { careHidden: !q("[data-fact-care]").getClientRects().length, posts: await said() };

    // extra words in the name: RGA's call, the Save carries RGA's name, the veto keeps theirs
    const long = { google: { ...G, name: "Acme Roofing | Best Roofer Denver" }, told: T, same: { ...SAME, name: false }, recommend: { name: "Acme Roofing" }, missing: [] };
    open4(long); wide("4 long"); out.long = { pill: !!q('[data-fact="name"] .pm-pill.rga') }; await tap("[data-in-submit]"); out.longPost = await said();
    // a place Google doesn't list: the list open with the line in it, the two answers
    const miss = { google: G, told: T, same: { ...SAME, area: null }, recommend: {}, missing: ["Del Rey Heights"] };
    open4(miss); wide("4 missing"); out.miss = { cardOpen: !!q("[data-area-card]").getClientRects().length, line: q("[data-area-card] .pm-fact-care")?.textContent, ownValue: !!q('[data-fact="area"] > .pm-fact-v').getClientRects().length }; await tap('[data-fact-pick="area"][data-fact-val="ok"]'); out.missPost = await said();
    // the list asked, then opened
    const areaq = { google: G, told: T, same: { ...SAME, area: null }, recommend: {}, missing: [] };
    open4(areaq); out.areaq = facts4(); await tap("[data-area-edit]"); wide("4 edit"); out.areaOpen = { chips: !!q('[data-fact="area"] > .pm-fact-chips').getClientRects().length, card: !!q("[data-area-card]").getClientRects().length }; await tap('[data-area-chip="keep"][data-area-name="El Segundo, CA"]'); await tap("[data-area-use]"); out.areaEditPost = await said();
    // everything matches; an open line stops the save; Google unread
    const all = { google: G, told: T, same: SAME, recommend: {}, missing: [] };
    open4(all); wide("4 all"); out.all = facts4(); await tap("[data-in-submit]"); out.allPost = await said();
    open4(come); await tap("[data-in-submit]"); out.openStop = { posts: await said(), msg: q("[data-in-msg]").textContent };
    open4(null); await tap("[data-in-submit]"); out.unread = { posts: await said(), msg: q("[data-in-msg]").textContent };

    // ── step 8 ──
    const TID = "m1.gbp.attributes";
    const open8 = (html) => { h.innerHTML = `<div class="pm-step-row pm-cs"><div class="pm-input" data-step-input="${TID}" data-in-kind="checklist" data-client-id="c1"><div class="pm-at" data-gbp-now="${TID}">${html}</div><div class="pm-in-foot"><button type="button" class="pm-commit" data-in-submit>Put it on Google</button><span class="pm-msg" data-in-msg hidden></span></div></div></div>`; atSubmitLabel(q("[data-step-input]")); };
    const O = (key, label, group, about = false) => ({ key, label, group, about });
    const RGA8 = { options: [O("is_owned_by_women", "Identifies as women-owned", "From the business", true), O("offers_online_appointments", "Online appointments", "Service options"), O("welcomes_lgbtq", "LGBTQ+ friendly", "Crowd", true), O("requires_appointments", "Appointment required", "Planning")], ticked: [], recommend: [] };
    const card8 = () => ({ cards: h.querySelectorAll(".pm-cs-card").length, nested: h.querySelectorAll(".pm-cs-card .pm-k5-plan").length, hows: h.querySelectorAll("[data-cs-how]").length, howWords: q("[data-cs-how]")?.textContent.trim(), saveInCard: !!q("[data-in-submit]").closest(".pm-cs-card"), text: q(".pm-cs-card").textContent.replace(/\s+/g, " ") });
    open8(attrsFormHtml(RGA8, null)); wide("8 list"); out.list = card8(); out.btn = q("[data-in-submit]").textContent;
    await tap('[data-in-tick="requires_appointments"]'); await tap('[data-in-tick="is_owned_by_women"]'); await tap("[data-in-submit]"); await sleep(30); out.tickPost = await said();
    open8(attrsFormHtml(RGA8, null)); await tap("[data-in-submit]"); out.nothing = { posts: await said(), msg: q("[data-in-msg]").textContent };
    open8(attrsFormHtml({ ...RGA8, ticked: ["requires_appointments"] }, null)); out.onG = q('[data-in-tick="requires_appointments"]').classList.contains("on") && !!q('[data-in-tick="requires_appointments"] .pm-at-now'); await tap("[data-at-none]"); await sleep(10); out.noneClears = !h.querySelector("[data-in-tick].on"); await tap("[data-in-submit]"); await sleep(30); out.nonePost = await said();
    const recd = { options: [O("accepts_reservations", "Accepts reservations", "Service options"), O("is_owned_by_women", "Identifies as women-owned", "From the business", true)], ticked: [], recommend: [{ key: "accepts_reservations", why: "your reservations link is on Google" }, { key: "is_owned_by_women", why: "must never show" }] };
    open8(attrsFormHtml(recd, null)); wide("8 rec"); out.rec8 = { row: q('[data-in-tick="accepts_reservations"]').textContent.replace(/\s+/g, " "), on: q('[data-in-tick="accepts_reservations"]').classList.contains("on"), aboutOn: q('[data-in-tick="is_owned_by_women"]').classList.contains("on"), text: card8().text };
    await tap("[data-in-submit]"); await sleep(30); out.rec8Post = await said();
    const many = { options: Array.from({ length: 30 }, (_, i) => O(`k${i}`, `Detail ${i}`, `Group ${Math.floor(i / 6)}`)), ticked: ["k1"], recommend: [] };
    open8(attrsFormHtml(many, null)); wide("8 long"); out.many = { folds: h.querySelectorAll("details.pm-at-more").length, hows: h.querySelectorAll("[data-cs-how]").length };
    open8(attrsFormHtml(RGA8, null, { editing: true })); wide("8 edit"); out.edit = card8();
    open8(attrsFormHtml({ options: [] }, null)); wide("8 offers none"); out.offers = { text: q(".pm-cs-card").textContent.replace(/\s+/g, " ") }; await tap("[data-in-submit]"); await sleep(30); out.offersPost = await said();
    open8(atCardHtml({ body: csNote("Reading the details Google offers your business…") })); wide("8 reading"); await tap("[data-in-submit]"); out.readingSave = { posts: await said(), msg: q("[data-in-msg]").textContent };
    open8(atCardHtml({ body: csNote("We couldn't read the details Google offers your business just now. Please reload the page in a minute.") })); await tap("[data-in-submit]"); out.noreadSave = { posts: await said(), msg: q("[data-in-msg]").textContent };
    return out;
  }, PUB);
  if (errs.length) fail(`a page error while clicking through: ${errs[0]}`);
} catch (e) {
  await browser.close();
  console.error(`⚠️  INDETERMINATE — the forms didn't run: ${e.message}`);
  process.exit(2);
}
await browser.close();

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const body = (post) => post && post[0] && post[0].value;
const sorted = (o) => Object.keys(o || {}).sort().join(",");
const DET = "answer,archived_at,checked_at,confidence,designer,designer_answer,evidence,host,platform,reason,shopify_store,signs,site,source,status";
const CONSENTED = { promise: "2026-10-23b", text: CONSENT };
const offUnder = (s) => s && s.off === true && s.inCard === false && s.underCard === true;
const fact = (o) => ({ name: "Acme Roofing", come: "no", area: { ok: true }, phone: "(424) 242-2040", website: "https://acme.example/", ...o });
const sameFacts = (post, want) => post.length === 1 && post[0].step_id === "m1.gbp.business_facts" && Object.keys(want).every((k) => eq(body(post)[k], want[k])) && sorted(body(post)) === sorted(want);

// step 3
if (!R.found.pwd || R.found.cards !== 1 || R.found.nested || R.found.parts !== 3) fail(`step 3 isn't ONE card with three rows and "Never send us your password" on it (${JSON.stringify(R.found)})`);
if (R.found.when !== "takes about 2 min" || R.builder.when !== "takes about 2 min") fail(`the builder's own time isn't on the band (${R.found.when} · ${R.builder.when})`);
if (R.devFoundWhen !== "takes 2–5 min" || R.who.when !== "takes 2–5 min" || R.jimdo.when !== "takes a few min" || R.tilesWhen !== "takes 2–5 min" || R.noSiteWhen !== "takes 2–5 min") fail(`the band's time doesn't follow the builder (custom ${R.devFoundWhen} · ${R.who.when} · no invite ${R.jimdo.when} · not known ${R.tilesWhen} · no site ${R.noSiteWhen})`);
if (R.oldLinkWhen !== null) fail("the time would write over the old-link card's own side");
if (!/Your website is on Squarespace/.test(R.builder.one) || !R.builder.change) fail(`a finished Step 1 isn't one line with Change (${R.builder.one})`);
if (!offUnder(R.builder.send) || !R.builder.consentInPart) fail(`the send button isn't under the card and off until the consent is ticked (${JSON.stringify(R.builder.send)})`);
if (R.builder.postOff.length) fail("the send button posts before the consent is ticked");
if (!R.builder.sendOn || R.builder.sendOn.off !== false || !R.builder.sendOffAgain || R.builder.sendOffAgain.off !== true) fail("ticking the consent doesn't turn the button on, or unticking doesn't turn it off");
const bp = body(R.builder.post);
if (R.builder.post.length !== 1 || R.builder.post[0].step_id !== "m1.access.website" || R.builder.post[0].client_id !== "c1" || sorted(bp) !== "consent,detected,platform,platform_source,via,who" || bp.via !== "invite" || bp.platform !== "squarespace" || bp.platform_source !== "detected_confirmed" || bp.who !== "self" || !eq(bp.consent, CONSENTED) || sorted(bp.detected) !== DET || bp.detected.answer !== "yes") fail(`a builder's save body changed (${JSON.stringify(bp)})`);
const np = body(R.none);
if (R.none.length !== 1 || sorted(np) !== "detected,platform,platform_source,via" || np.via !== "none" || np.platform !== null || np.platform_source !== "chosen" || R.noSiteSend) fail(`"I don't have a website" changed: it posts no consent and no send button shows (${JSON.stringify(np)})`);
if (!/Hosted on Netlify/.test(R.who.one) || !/we checked dev\.example/.test(R.who.one) || !/We need access here/.test(R.who.two) || !/No need to add us here/.test(R.who.two) || !/I know where my website's files are kept · about 3 minutes/.test(R.who.two) || !/Send them a short email · easiest if someone built it for you/.test(R.who.two) || R.who.send || !/Shows once you choose who will do this/.test(R.who.three)) fail(`a developer-built site's Step 2 isn't the approved rows (${R.who.two})`);
if (/updates itself in a minute or two/.test(R.self.two) || !/Adding us is free, and you can remove us anytime from the same page\. No need to add us on Netlify: it only shows your site, and it can charge for each extra person\./.test(R.self.two) || !/rocketgrowthagency-admin/.test(R.self.two) || !offUnder(R.self.send) || R.self.send.words !== "I added RGA on GitHub") fail(`"I'll do it myself" + GitHub isn't the approved steps (${R.self.two.slice(0, 200)})`);
const sp = body(R.selfPost);
if (sorted(sp) !== "consent,detected,files,platform,platform_source,via,who" || sp.via !== "invite" || sp.platform !== "custom" || sp.files !== "github" || sp.who !== "self" || !eq(sp.consent, CONSENTED)) fail(`the developer-built self save changed (${JSON.stringify(sp)})`);
const MAIL = "Hi,\n\nCould you give Rocket Growth Agency access to our website's files? They're doing our local SEO and will edit page titles, text and tracking code.\n\n- On GitHub: open the project → Settings → Collaborators → Add people → add rocketgrowthagency-admin\n- On GitLab: Manage → Members → Invite members → access@rocketgrowthagency.com as Maintainer\n- On Bitbucket: Repository settings → Repository permissions → add access@rocketgrowthagency.com with Write\n\nIf the files aren't in GitHub, GitLab or Bitbucket (for example, you upload them to Netlify yourself), just reply and we'll find the simplest way together.\n\nThere's no need to add them on Netlify. Thanks!";
if (R.dev.mail !== MAIL) fail(`the developer's email changed: it's word for word (${JSON.stringify(R.dev.mail)})`);
if (!R.dev.send || R.dev.send.words !== "I sent it to my developer" || R.dev.send.inCard || !R.dev.ticked || R.dev.send.off) fail(`"My developer will" lost its button under the card, or a tick already given is forgotten on a redraw (${JSON.stringify(R.dev)})`);
const dp = body(R.devPost);
if (sorted(dp) !== "consent,detected,platform,platform_source,via,who" || dp.via !== "designer" || dp.who !== "developer" || !eq(dp.consent, CONSENTED)) fail(`the developer note's save changed (${JSON.stringify(dp)})`);
if (R.jimdo.consent || !R.jimdo.send || R.jimdo.send.off || R.jimdo.send.inCard || R.jimdo.send.words !== "Send me the checklist" || !/never ask for either/.test(R.jimdo.what || "")) fail(`a builder with no safe invite isn't: no consent, the checklist button on (${JSON.stringify(R.jimdo)})`);
const jp = body(R.jimdoPost);
if (sorted(jp) !== "detected,platform,platform_source,via,workaround" || jp.via !== "workaround" || jp.workaround !== "checklist") fail(`the checklist save changed (${JSON.stringify(jp)})`);
if (!eq(body(R.check), { via: "check", reason: "blocked", site: "x.example" })) fail(`"Check it for me" changed (${JSON.stringify(body(R.check))})`);
const dg = body(R.designerPost);
if (!R.designer.off || !R.designer.oneCard || !dg || dg.via !== "designer" || dg.platform_source !== "designer_credit" || !eq(dg.consent, CONSENTED)) fail(`a credited web designer's path changed (${JSON.stringify({ d: R.designer, dg })})`);

// step 4
if (R.rec.side !== "4 of 5 match · 1 to check" || R.rec.bar !== "4 of 5 match Google" || R.rec.segs !== "mmmmo" || R.rec.cards !== 1 || R.rec.nested || R.rec.saveInCard) fail(`step 4 isn't one card with the bar, the band's count and Save under it (${JSON.stringify({ ...R.rec, text: "" })})`);
if (!/From your plan \(step 5\) · 0 of 3 on Google/.test(R.rec.text) || /We target|Not on Google/.test(R.rec.text) || !/On Google now · 6/.test(R.rec.text) || !/A town, neighborhood or ZIP, within about 2 hours of where you're based\. It has to be a place Google knows\./.test(R.rec.text) || !/9 \/ 20/.test(R.rec.text) || !/Keep Google's list as it is/.test(R.rec.text)) fail(`the service area isn't the approved rows (${R.rec.text.slice(0, 400)})`);
if (!/From your plan \(step 5\) · 2 of 3 on Google/.test(R.rec1.text) || /\+ Culver City/.test(R.rec1.text) || !/\+ Palms/.test(R.rec1.text)) fail("a plan with some already on Google isn't \"2 of 3\" with a chip only for the missing one");
if (R.rec.cancel || R.shop.cancel || R.all.cancel) fail("step 4 draws a Cancel");
if (!eq(R.chips, ["Mar Vista, CA", "Palms, CA", "Playa Vista, CA"])) fail(`a plan place isn't saved with the business's state (${R.chips})`);
const K6 = ["El Segundo, CA", "Culver City, CA", "Los Angeles, CA", "Santa Monica, CA", "Manhattan Beach, CA", "Marina Del Rey, CA"];
if (!sameFacts(R.recPost, fact({ area: { keep: K6, add: ["Mar Vista, CA", "Palms, CA", "Playa Vista, CA"] } }))) fail(`"Use this list" changed its save (${JSON.stringify(body(R.recPost))})`);
if (R.editedCount !== "8 / 20" || !sameFacts(R.recEditPost, fact({ area: { keep: K6.filter((x) => x !== "Culver City, CA"), add: ["Mar Vista, CA", "Playa Vista, CA", "Venice, CA"] } }))) fail(`a dropped + typed place isn't what's saved (${R.editedCount} · ${JSON.stringify(body(R.recEditPost))})`);
if (!sameFacts(R.recKeepPost, fact())) fail(`"Keep Google's list as it is" changed its save (${JSON.stringify(body(R.recKeepPost))})`);
if (!/none listed/.test(R.shop.text) || R.shop.side !== "3 of 5 match · 2 to check" || !/Where you work/.test(R.shopAns.ans || "") || R.shopAns.posts.length) fail(`a storefront's rows aren't right, or the first of two answers saves (${JSON.stringify({ side: R.shop.side, a: R.shopAns })})`);
if (R.shopAns.side !== "3 of 5 match · 1 answered · 1 to check") fail(`an answered row isn't counted on the band (${R.shopAns.side})`);
if (!sameFacts(R.shopPost, { name: "Bluebird Cafe", come: "yes", area: { ok: true }, phone: "(424) 242-2040", website: "https://bluebird.example" })) fail(`a storefront's save changed (${JSON.stringify(body(R.shopPost))})`);
if (R.diff.opts !== 2 || !/\(424\) 555-0147, mine/.test(R.diff.text) || !/\(424\) 555-0188, Google's/.test(R.diff.text) || !/Neither: type it/.test(R.diff.text)) fail("a number that differs isn't two answers, each saying whose, and Neither");
if (!sameFacts(R.diffPost, fact({ phone: "(424) 555-0147" }))) fail(`the last answer doesn't save itself with the same body (${JSON.stringify(body(R.diffPost))})`);
if (R.come.posts.length || !R.come.careShows || !R.come.askShows || !R.come.on || R.come.side !== "4 of 5 match · 1 to check") fail(`"yes, customers come here" must show the warning, keep the question open and NOT save (${JSON.stringify(R.come)})`);
if (!sameFacts(R.comePost, fact({ come: "yes" }))) fail(`the button doesn't save "yes" (${JSON.stringify(body(R.comePost))})`);
if (!R.comeNo.careHidden || !sameFacts(R.comeNo.posts, fact({ come: "no" }))) fail(`changing to "no" keeps the warning or doesn't save (${JSON.stringify(R.comeNo)})`);
if (!R.long.pill || !sameFacts(R.longPost, fact({ name: "Acme Roofing" }))) fail(`extra words in the name aren't RGA's call with RGA's name saved (${JSON.stringify(body(R.longPost))})`);
if (!R.miss.cardOpen || R.miss.ownValue || !/Google doesn't list Del Rey Heights\./.test(R.miss.line || "") || !sameFacts(R.missPost, fact())) fail(`a place Google doesn't list isn't the open list with the line (${JSON.stringify(R.miss)})`);
if (R.areaOpen.chips || !R.areaOpen.card || !sameFacts(R.areaEditPost, fact({ area: { keep: K6.filter((x) => x !== "El Segundo, CA"), add: [] } }))) fail(`"Change the list" doesn't open the list in place of the chips, or its save changed (${JSON.stringify(R.areaOpen)})`);
if (!/Where you work\s*6 places/.test(R.all.text) || R.all.marks !== 5 || R.all.side !== "5 of 5 match" || R.all.segs !== "mmmmm" || !sameFacts(R.allPost, fact())) fail(`everything matching isn't five rows, the count and the button (${R.all.text.slice(0, 200)})`);
if (R.openStop.posts.length || !/^Answer /.test(R.openStop.msg)) fail("an open line doesn't stop the save");
if (R.unread.posts.length) fail("step 4 posts with Google unread and no rows");

// step 8
if (R.list.cards !== 1 || R.list.nested || R.list.hows !== 1 || R.list.howWords !== "How this step works" || R.list.saveInCard || R.btn !== "Save") fail(`step 8 isn't one card, one How, the button under it (${JSON.stringify({ ...R.list, text: "" })})`);
if (!/Can replace a review quote in map results\. RGA recommends leaving it off\./.test(R.list.text) || !/Identifies as women-owned\s*People can filter Maps for it\./.test(R.list.text) || /Shows on your profile/.test(R.list.text) || !/About you · only you can say/.test(R.list.text) || !/Always your choice: RGA never ticks these/.test(R.list.text) || !/None of these apply\s*Nothing new goes on Google; anything listed above comes off\./.test(R.list.text) || !/Anything left unticked comes off Google\./.test(R.list.text)) fail(`step 8's rows aren't the approved words (${R.list.text.slice(0, 300)})`);
if (!eq(body(R.tickPost), ["requires_appointments", "is_owned_by_women"]) || R.tickPost[0].step_id !== "m1.gbp.attributes") fail(`step 8's save isn't the ticked keys (${JSON.stringify(R.tickPost)})`);
if (R.nothing.posts.length || !/Tick what's true, or tick "None of these apply"\./.test(R.nothing.msg)) fail("nothing ticked and None unticked isn't stopped");
if (!R.onG || !R.noneClears || !eq(body(R.nonePost), [])) fail(`On Google doesn't start ticked, or None doesn't clear the rest and post [] (${JSON.stringify(R.nonePost)})`);
if (!/RGA recommends: your reservations link is on Google\./.test(R.rec8.row) || !R.rec8.on || R.rec8.aboutOn || /must never show/.test(R.rec8.text) || !eq(body(R.rec8Post), ["accepts_reservations"])) fail(`RGA's recommendation isn't on its own row, ticked, with its reason; or an About you detail is touched (${JSON.stringify(R.rec8)})`);
if (R.many.folds !== 3 || R.many.hows !== 1) fail(`a long list doesn't fold after two groups, or has two Hows (${JSON.stringify(R.many)})`);
if (R.edit.cards !== 1 || !/^Change what's true/.test(R.edit.text) || !/The step stays Done until you save\. Anything left unticked comes off Google\./.test(R.edit.text)) fail(`changing a done step isn't the green "Change what's true" (${R.edit.text.slice(0, 120)})`);
if (!/Google doesn't offer your kind of business any yes\/no details/.test(R.offers.text) || !/Save to finish this step\./.test(R.offers.text) || !eq(body(R.offersPost), [])) fail(`"Google offers none" can't finish the step: it says Save and the button must do it (${JSON.stringify(R.offersPost)})`);
if (R.readingSave.posts.length || R.noreadSave.posts.length) fail(`while Google is being read, or couldn't be, the button posted: an empty answer takes every detail off Google (${JSON.stringify([R.readingSave, R.noreadSave])})`);

if (!/developer asked/.test(R.waitDev) || !/designer asked/.test(R.waitDesigner)) fail(`step 3's wait card names the wrong person (${R.waitDev.slice(0, 120)} · ${R.waitDesigner.slice(0, 120)})`);
// Step 8's words: the button always says "Save" (approved V2, renamed by the owner 11-4), so the How can't say it changes.
if (/the button says so/.test(JSON.stringify(JSON.parse(read("data/playbooks/client-steps.json"))))) fail("step 8's How still says the button changes when none apply");
// "Google offers none" saves `[]`: nothing to write, so nothing may reach Google. When Google does offer details, the write still goes.
{
  const { applyForStep } = createRequire(import.meta.url)(`${SITE}/netlify/functions/_gbp-profile.js`);
  const fakeGoogle = (meta) => { const calls = []; return { calls, deps: { token: "fake", loc: "locations/1", fetch: async (u, init = {}) => { calls.push(init.method || "GET"); const j = /attributes\?parent=/.test(u) ? { attributeMetadata: meta } : { attributes: [] }; return { ok: true, status: 200, json: async () => j }; } } }; };
  const none = fakeGoogle([]), noneOut = await applyForStep("m1.gbp.attributes", [], none.deps);
  if (none.calls.includes("PATCH")) fail("Google offers none, and an empty write still went to Google");
  if (noneOut.state !== "on_google") fail(`Google offers none doesn't finish the step (${noneOut.state})`);
  const some = fakeGoogle([{ parent: "attributes/x", valueType: "BOOL", displayName: "X", groupDisplayName: "G" }]);
  await applyForStep("m1.gbp.attributes", [], some.deps);
  if (!some.calls.includes("PATCH")) fail("Google offers details, and an unticked one no longer comes off Google");
}

if (R.gone.length) fail(`a control the approved form has is gone: ${[...new Set(R.gone)].join(" · ")}`);
// every state, a phone
if (R.wide.length) fail(`wider than a 400px phone: ${R.wide.join(" · ")}`);

if (F.length) { console.error("🔴 client steps 3 · 4 · 8 forms regressed:"); for (const m of F) console.error(`   · ${m}`); process.exit(1); }
console.log("✅ client steps 3 · 4 · 8: one card, one How, the agreed words verbatim, the button off until consent, the builder's own time, the save bodies unchanged, nothing wider than a phone");
