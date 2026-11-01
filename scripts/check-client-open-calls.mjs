#!/usr/bin/env node
// check-client-open-calls.mjs — 2026-10-30. Chris's five calls on client_open_calls_v1 ("all approved"), and the fixes that match approved cards. → project_client_card_system
//
// RUNS the real card code in a blank Chrome page (every request refused) and the real server functions on a fake Google + a fake database. Nothing leaves the laptop.
//   1 · steps 4 + 8, Google unreadable: "Please reload the page in a minute", no button (a save can't work without Google's answer)
//   2 · step 4 warns about verifying again only for a name or address change, never a service area, and names the step by its number from the playbook
//       step 2's verify-again card, Verify now opens the ways Google offers. THE ONE WRITER of `reverify`: only a step that was done, only a positive read of the
//       CLIENT'S OWN profile (an unverified duplicate on the account must never pause their changes), the first date kept, cleared when it's verified again.
//       Every Google writer holds while it says lost; listingState doesn't move (it would lock steps behind "one Google profile").
//   3 · step 9's done card names the tool the server saved, for any business; no tool = today's words
//   4 · steps 7, 8 on Google but not done: the words each step's Done card uses
//   5 · steps 7, 8, 9 said no / taken down: the problem and its one button; the form opens when it's pressed, and the card's foot is Maps + How
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

// ── A · the seats no lift can reach: the pill chain, the row's hold, the unread branch ──
if (!P.includes(`GBP_STEPS.has(step.id) && taskState?.google_push?.state === "needs_client" ? { text: "Google said no", cls: "bad" }`)) fail("Google said no doesn't reach the pill");
if (!P.includes(`taskState?.google_push?.state === "removed" ? { text: "Google took it down", cls: "you" }`)) fail("Google took it down doesn't reach the pill");
if (!/auto: "wait", bad: "bad" \}\[ownerPill\.cls\]/.test(P)) fail("a said-no row isn't red (the pill's colour never reaches the row)");
if (!/const GC_HOLD = new Set\(\["m1\.gbp\.hours_attributes", "m1\.gbp\.attributes", "m1\.gbp\.booking_link"\]\);/.test(P)) fail("the form-holding steps aren't 7, 8, 9");
if ((P.match(/<div class="pm-doit"\$\{gcHold \? " data-gc-hold hidden" : ""\}>/g) || []).length !== 2) fail("a form path still draws under the red card (both pm-doit returns must hold it)");
if (!/const csCardOf = \(row\) => \{ const cs = row \? \[\.\.\.row\.querySelectorAll\("\.pm-cs-card"\)\]\.filter\(\(c\) => (?:!c\.closest\("\[data-cs-extra\]"\) && )?!c\.closest\("\[data-gc-hold\]"\)/.test(P)) fail("How this step works would seat into the hidden form, not the red card");
if (!P.includes("HOW_WORKS_FOOT.has(step.id) || gcHold ? DETAIL_LABEL.done[0]")) fail("a held form's fold doesn't say How this step works");
if (!/verify: \["How this step works", "Hide how this step works"\]/.test(P)) fail("step 2's fold doesn't say How this step works");
if (/How verification works/.test(P)) fail("How verification works is back");
if (!/\["m1\.gbp\.business_facts", "m1\.gbp\.attributes", "m1\.gbp\.services_products", "m1\.gbp\.booking_link"\]\.includes\(stepId\)\) \{ const noSave = host\.closest\("\.pm-step-row"\)\?\.querySelector\("\[data-in-submit\]"\); if \(noSave\) noSave\.hidden = true; \}/.test(P)) fail("steps 4 and 8 keep a button that can't save while Google is unreadable");
if (!P.includes('stepId === "m1.gbp.business_facts" ? `<span class="pm-in-help">We couldn\'t read your Google profile just now. Please reload the page in a minute.</span>`')) fail("step 4's unreadable line isn't the approved one");
if (!/gvLost \? "Verify again" : "Your turn"/.test(P)) fail("the verify-again pill isn't there");
if (!/\.pm-pc-f \.c\.st > svg \{ color:var\(--state-other/.test(CSS)) fail("the icon on a fact RGA is changing isn't blue");

// ── B · drawn and clicked for real ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const lifted = [
  `var _editingSteps = new Set(); var _lockData = { tasks: {} }; var _portalPlaybook = { month1: [{ id: "m1.gbp.verify", clientStepNo: 2 }] }; var _factsClientId = "c1";`,
  `function factsLocked() { return false; } function factsEditorHtml() { return ""; } function googleCardHtml() { return "<i>old card</i>"; } function hoursCardHtml() { return "<i>done hours</i>"; } function attrsCardHtml() { return "<i>done attrs</i>"; } function svcCardHtml() { return "<i>done services</i>"; } function hoursSummary() { return "Mon–Fri 9 AM–6 PM"; } function factsSummary() { return ""; } function gvJoinDup() {} function portalToken() { return "t"; } function gvCodeFallbackHtml() { return ""; } function gvFilmGuideHtml() { return ""; } var GV_ON_GOOGLE = ""; var BK_NOUN_X = 0;`,
  fn("escapeHtml"), fn("escapeAttribute"), line("monthDay"), line("siteShow"), line("placeName"), line("GBP_STEPS"), line("GC_HOLD"), line("GBP_THING"), line("EDIT_IN_PLACE"), line("BK_NOUN"), between("const portalStepNo = (id) => {", "const seeStepText"),
  fn("gbpPushHtml"), fn("bookingCardHtml"), fn("factsCardV2"), fn("gvProfileHtml"), fn("gvOptionsHtml"), fn("gvGoogleRouteHtml"), fn("loadGbpVerify"),
  between("// client_open_calls_v1 call 2: Verify now opens the ways Google offers", '// 🔒 "Remind me later" (step7_later_and_upload_v1 v2)'),
  // the Fix it handler, as it stands
  `document.addEventListener("click", (e) => {${between('  const fix = e.target && e.target.closest && e.target.closest("[data-gcard-fix]");', '\n});\ndocument.addEventListener("click", async (e) => {\n  const t = e.target && e.target.closest && e.target.closest("[data-step-recheck]");')}});`,
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
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted cards won't load: ${errs[0]}`); await browser.close(); process.exit(2); }
  R = await page.evaluate(async () => {
    const H = document.getElementById("h");
    const draw = (html) => { H.innerHTML = html; const c = H.querySelector(".pm-cs-card"); return { text: H.innerText.replace(/\s+/g, " ").trim(), tone: c ? [...c.classList].find((x) => ["ok", "you", "rga", "bad", "wait", "off"].includes(x)) : "", maps: !!H.querySelector(".pm-cs-foot a.lk"), btn: (H.querySelector("[data-gcard-fix]") || {}).textContent || "", wider: document.documentElement.scrollWidth > 400 }; };
    const M = { maps: "https://maps.google.com/?cid=1" };
    const push = (id, t, o = M) => draw(gbpPushHtml({ id }, t, o));
    const NO = (x = {}) => ({ status: "pending", google_push: { state: "needs_client", said: "Google's reason", fix: "The fix", at: "2026-10-29T12:00:00Z", ...x } });
    const out = {};
    out.no7 = push("m1.gbp.hours_attributes", NO());
    out.no8 = push("m1.gbp.attributes", NO());
    out.no9 = push("m1.gbp.booking_link", { ...NO(), client_input: { value: "https://facebook.com/rocketgrowth", choice: "tool" } });
    out.no9bare = push("m1.gbp.booking_link", { ...NO(), client_input: "https://facebook.com/x" });
    out.gone = push("m1.gbp.booking_link", { status: "pending", google_push: { state: "removed", removed_at: "2026-10-29T12:00:00Z", removed_link: "https://rocketgrowthagency.com/contact" } });
    out.gone0 = push("m1.gbp.booking_link", { status: "pending", google_push: { state: "removed", removed_at: "2026-10-29T12:00:00Z" } });
    out.rga7 = push("m1.gbp.hours_attributes", { status: "in_progress", google_push: { state: "with_rga", at: "2026-10-29T12:00:00Z" } });
    const ON = (x = {}) => ({ status: "pending", google_push: { state: "on_google", at: "2026-10-29T12:00:00Z", ...x } });
    out.on7 = push("m1.gbp.hours_attributes", ON({ after: { periods: [] } }));
    out.on7a = push("m1.gbp.hours_attributes", ON({ after: { appointment: true } }));
    out.on8 = push("m1.gbp.attributes", ON({ after: ["a", "b"], labels: { a: "A", b: "B" } }));
    out.on8one = push("m1.gbp.attributes", ON({ after: ["a"], labels: { a: "A" } }));
    out.on8none = push("m1.gbp.attributes", ON({ after: [], labels: {} }));
    out.on9 = push("m1.gbp.booking_link", ON({ after: ["https://x.com/book"] }));
    const DONE9 = (x) => ({ status: "done", client_input_at: "2026-10-20T12:00:00Z", google_push: { state: "on_google", at: "2026-10-29T12:00:00Z", link: "https://x.com/book", link_type: "url_appointment", ...x } });
    out.tool = draw(bookingCardHtml({ id: "m1.gbp.booking_link" }, DONE9({ platform: "OpenTable" }), DONE9({ platform: "OpenTable" }).google_push, "m"));
    out.notool = draw(bookingCardHtml({ id: "m1.gbp.booking_link" }, DONE9({ platform: null }), DONE9({ platform: null }).google_push, "m"));
    const put = { ...DONE9({ platform: "Calendly" }), rga_put: { at: "2026-10-29T12:00:00Z" } };
    out.put = draw(bookingCardHtml({ id: "m1.gbp.booking_link" }, put, put.google_push, "m"));
    const FACTS = (rga) => ({ status: "in_progress", client_input: { name: "Main Street Plumbing" }, google_push: { state: "with_rga", rga, at: "2026-10-29T12:00:00Z", after: { name: "Main Street Plumbing", phone: "(424) 242-2040", website: "https://x.com/", come: false, area: ["El Segundo, CA"] } } });
    const facts = (rga) => { const t = FACTS(rga); return draw(factsCardV2({ id: "m1.gbp.business_facts" }, t, t.google_push)); };
    out.factName = facts([{ fact: "name", to: "Main Street Plumbing" }]);
    out.factCome = facts([{ fact: "come", to: true }]);
    out.factArea = facts([{ fact: "area", add: ["Palms"] }]);
    out.nameIcon = (() => { facts([{ fact: "name", to: "x" }]); const c = H.querySelector(".pm-pc-f .c"), box = c && c.getBoundingClientRect(), f = H.querySelector(".pm-pc-f").getBoundingClientRect(); return { pill: !!H.querySelector(".pm-pc-f .pm-fxt-s"), inside: !!box && box.right <= f.right + 0.5 }; })();
    // the hold + the click, on the real handler's own lines
    H.innerHTML = `<div class="pm-step-row"><div class="pm-k5"><button type="button" data-gcard-fix>Fix it</button></div><div class="pm-doit" data-gc-hold hidden><input id="f"></div></div>`;
    const before = H.querySelector(".pm-doit").getClientRects().length;
    H.querySelector("[data-gcard-fix]").click();
    out.hold = { before, after: H.querySelector(".pm-doit").getClientRects().length, btnGone: H.querySelector("[data-gcard-fix]").hidden, focus: document.activeElement && document.activeElement.id };
    // step 2: the live read says not verified
    const verifyDraw = async (task, j) => { _lockData = { tasks: { "m1.gbp.verify": task } }; H.innerHTML = `<div class="pm-step-row pm-cs cs-wait"><span class="pm-pill wait">x</span><div data-gbp-verify data-client-id="c1"></div></div>`; window.fetch = async () => ({ ok: true, status: 200, json: async () => j }); await loadGbpVerify("c1"); return { text: H.innerText.replace(/\s+/g, " ").trim(), pill: H.querySelector(".pm-pill").textContent, row: H.querySelector(".pm-step-row").className, again: !!H.querySelector("[data-gv-again]"), waysHidden: H.querySelector("[data-gv-again-ways]") ? H.querySelector("[data-gv-again-ways]").hidden : null }; };
    const NV = { ok: true, facts: { title: "Biz", phone: "(424) 242-2040", mapsUri: "m", verified: false }, verify: { available: true, options: [{ method: "SMS", code: true, phone: "x" }], pending: null } };
    const LOST = { status: "pending", reverify: { state: "lost", at: "2026-10-29T12:00:00Z" } };
    out.lost = await verifyDraw(LOST, NV);
    H.querySelector("[data-gv-again]")?.click();
    { const w = H.querySelector("[data-gv-again-ways]"); out.lostOpen = { ways: !!w && !w.hidden, btn: !!H.querySelector("[data-gv-again-acts]")?.hidden, send: !!w?.querySelector("[data-gv-start]") }; }
    out.never = await verifyDraw({ status: "pending" }, NV);
    out.lostPending = await verifyDraw(LOST, { ...NV, verify: { pending: { method: "SMS", at: "2026-10-29T12:00:00Z" } } });
    out.lostBack = await verifyDraw(LOST, { ok: true, facts: { ...NV.facts, verified: true }, verify: {} });
    return out;
  });
} catch (e) { console.error(`⚠️  INDETERMINATE — the lifted cards threw: ${String(e.message || e).slice(0, 200)}`); await browser.close(); process.exit(2); } finally { await browser.close().catch(() => {}); }

const has = (o, ...w) => w.every((x) => o.text.includes(x));
// call 5 + the fixes that match approved cards
if (R.no7.tone !== "bad" || !has(R.no7, "Google didn't accept these hours", "Google's reason", "The fix") || R.no7.btn !== "Fix it" || !R.no7.maps) fail(`step 7's said-no isn't the approved card (${JSON.stringify(R.no7)})`);
if (R.no8.tone !== "bad" || !has(R.no8, "Google didn't accept these details") || R.no8.btn !== "Fix it" || !R.no8.maps) fail(`step 8's said-no isn't the approved card (${JSON.stringify(R.no8)})`);
if (R.no9.tone !== "bad" || !has(R.no9, "Google didn't accept this link", "Your link", "facebook.com/rocketgrowth") || R.no9.btn !== "Pick another link" || !R.no9.maps) fail(`step 9's said-no isn't the approved card (${JSON.stringify(R.no9)})`);
if (!has(R.no9bare, "Your link", "facebook.com/x")) fail("an old answer saved as a bare link loses its Your link row");
if (R.gone.tone !== "you" || !has(R.gone, "Google took your booking link down", "Was", "rocketgrowthagency.com/contact", "Google removes links that don't let people book") || R.gone.btn !== "Pick a page" || !R.gone.maps) fail(`Google took it down isn't the approved card (${JSON.stringify(R.gone)})`);
if (/\bWas\b/.test(R.gone0.text)) fail("a taken-down link with no address still draws a Was row");
if (R.rga7.tone !== "rga" || !R.rga7.maps) fail(`RGA is on it has no Maps in its foot (${JSON.stringify(R.rga7)})`);
if (R.hold.before !== 0 || R.hold.after === 0 || !R.hold.btnGone || R.hold.focus !== "f") fail(`the form isn't held until the button is pressed, or pressing it doesn't open it (${JSON.stringify(R.hold)})`);
// call 4
if (!has(R.on7, "Your hours are on Google")) fail(`step 7 on Google doesn't say so (${R.on7.text})`);
if (!has(R.on7a, "By appointment only, on Google")) fail(`by appointment on Google doesn't say so (${R.on7a.text})`);
if (!has(R.on8, "2 details on Google") || !has(R.on8one, "1 detail on Google") || !has(R.on8none, "None of these apply")) fail(`step 8 on Google doesn't count its details (${R.on8.text} · ${R.on8one.text} · ${R.on8none.text})`);
if (!has(R.on9, "Your booking link is on Google")) fail(`step 9 on Google doesn't say so (${R.on9.text})`);
// call 3
if (!has(R.tool, "OpenTable · Google picks the button's words")) fail(`the done card doesn't name the tool (${R.tool.text})`);
if (!has(R.notool, "Google picks the button's words") || / · Google picks/.test(R.notool.text) || /null|undefined/.test(R.notool.text)) fail(`no tool isn't today's words (${R.notool.text})`);
if (!has(R.put, "Put on by RGA · the page people book on")) fail(`RGA's pick lost its own line (${R.put.text})`);
// call 2 · step 4
const WARN = "Google may ask you to verify again after a name or address change. If it does, step 2 shows you how.";
if (!has(R.factName, WARN, "RGA is changing it")) fail(`a name change has no warning (${R.factName.text})`);
if (!has(R.factCome, WARN, "RGA is changing it · ")) fail(`an address change has no warning (${R.factCome.text})`);
if (R.factArea.text.includes("verify again")) fail(`a service-area change warns about verifying again (${R.factArea.text})`);
if (R.nameIcon.pill || !R.nameIcon.inside) fail(`"RGA is changing it" is a pill again, or its mark is cut off (${JSON.stringify(R.nameIcon)})`);
for (const [k, o] of Object.entries(R)) if (o && o.wider) fail(`${k} is wider than a 400px phone`);
// call 2 · step 2
if (R.lost.pill !== "Verify again" || !/cs-you/.test(R.lost.row) || !R.lost.again || R.lost.waysHidden !== true || !R.lost.text.includes("Google wants your business verified again") || !R.lost.text.includes("Your Google changes are paused until it's verified") || !R.lost.text.includes("Google chooses how. A code takes minutes; a video or postcard can take days.")) fail(`the verify-again card isn't the approved one (${JSON.stringify(R.lost)})`);
if (/few minutes|stays up/.test(R.lost.text)) fail("the verify-again card promises what isn't true for every method");
if (!R.lostOpen.ways || !R.lostOpen.btn || !R.lostOpen.send) fail(`Verify now doesn't open the ways Google offers (${JSON.stringify(R.lostOpen)})`);
if (R.never.pill !== "Your turn" || R.never.text.includes("verified again") || !R.never.text.includes("Not verified yet")) fail(`a business never verified reads as losing it (${JSON.stringify(R.never)})`);
if (!R.lostPending.text.includes("Waiting for your code") || R.lostPending.text.includes("verified again")) fail(`a code already asked for isn't shown first (${R.lostPending.text})`);
if (R.lostBack.text.includes("verified again") || !R.lostBack.text.includes("Verified by Google")) fail(`Google says verified but the card still asks (${R.lostBack.text})`);

// ── C · the server, on a fake Google + a fake database ──
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.INTERNAL_FN_SECRET = "s"; process.env.GOOGLE_OAUTH_CLIENT_ID = "i"; process.env.GOOGLE_OAUTH_CLIENT_SECRET = "c"; process.env.URL = "https://fake.site.test";
const require = createRequire(`${SITE}/netlify/functions/portal-step-recheck.js`);
const realFetch = globalThis.fetch;
const CID = "00000000-0000-4000-8000-000000000001", V = "m1.gbp.verify";
async function recheck(task, locs, { status = 200, loc = "accounts/1/locations/A" } = {}) {
  let rec = { id: "r1", data: { tasks: { [V]: { ...task } } } };
  globalThis.fetch = async (u, o = {}) => { const url = String(u), m = o.method || "GET", ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (/oauth2\.googleapis/.test(url)) return ok({ access_token: "t" });
    if (/mybusinessbusinessinformation/.test(url)) return status === 200 ? ok({ locations: locs }) : { ok: false, status, json: async () => ({}), text: async () => "" };
    if (/client_google_oauth/.test(url)) return ok([{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: loc }]);
    if (/client_onboarding_records/.test(url)) { if (m === "PATCH") { const b = JSON.parse(o.body); rec = { ...rec, data: b.data }; return ok([rec]); } return ok([JSON.parse(JSON.stringify(rec))]); }
    return ok([]); };
  const h = require("./portal-step-recheck.js").handler;
  const r = await h({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, step_id: V }) });
  globalThis.fetch = realFetch;
  return { code: r.statusCode, task: rec.data.tasks[V] };
}
const L = (id, on) => ({ name: `locations/${id}`, title: id, metadata: { hasVoiceOfMerchant: on } });
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
let S;
try {
  S = {
    lost: await recheck({ status: "done" }, [L("A", false)]),
    dup: await recheck({ status: "done" }, [L("A", true), L("B", false)]),
    never: await recheck({ status: "pending" }, [L("A", false)]),
    notFound: await recheck({ status: "done" }, [L("Z", false)]),
    repeat: await recheck({ status: "pending", reverify: { state: "lost", at: "2026-10-01T00:00:00Z" } }, [L("A", false)]),
    back: await recheck({ status: "pending", reverify: { state: "lost", at: "2026-10-01T00:00:00Z" } }, [L("A", true)]),
    backDup: await recheck({ status: "pending", reverify: { state: "lost", at: "2026-10-01T00:00:00Z" } }, [L("A", true), L("B", false)]),
    blind: await recheck({ status: "done" }, [], { status: 403 }),
  };
} catch (e) { console.log = log; console.error = err; console.error(`⚠️  INDETERMINATE — the recheck won't run on the fakes: ${e.message}`); process.exit(2); }
console.log = log; console.error = err;
if (S.lost.task.reverify?.state !== "lost" || !S.lost.task.reverify?.at || S.lost.task.status !== "pending") fail(`a done step whose own profile lost verification isn't recorded (${JSON.stringify(S.lost.task)})`);
if (S.dup.task.reverify) fail("an unverified duplicate on the account pauses the client's Google changes");
if (S.never.task.reverify) fail("a business that was never verified reads as losing it");
if (S.notFound.task.reverify) fail("a profile we couldn't find on the account reads as lost (not known must record nothing)");
if (S.repeat.task.reverify?.at !== "2026-10-01T00:00:00Z") fail("a repeat night moves the first date");
if (S.back.task.reverify) fail("verified again doesn't clear the hold");
if (S.backDup.task.reverify) fail("verified again doesn't clear the hold when a duplicate is still on the account");
if (S.blind.task.reverify || S.blind.task.status !== "done") fail("a failed read of Google moved the step");

const OL = require("./_one-listing.js");
const lostTasks = { "m1.gbp.verify": { reverify: { state: "lost" } } };
if (!OL.verifyLost(lostTasks) || OL.verifyLost({ "m1.gbp.verify": {} }) || OL.verifyLost(null) || OL.verifyLost({ "m1.gbp.verify": { reverify: { state: "back" } } })) fail("verifyLost answers wrong");
const clean = { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } }, ...lostTasks };
if (!OL.listingState(clean).open) fail("verify-again closed the one-listing rule: it would lock steps behind \"one Google profile\"");
// every Google writer holds
const GW = { "portal-step-input": /if \(toGoogle && verifyLost\(rec\.listingTasks\)\) return json\(409,/, "gbp-publish": /if \(verifyLost\(rec\?\.data\?\.tasks\)\) return json\(409,/, "gbp-apply-change": /if \(verifyLost\(rec\?\.data\?\.tasks\)\) return json\(409,/, "_photo-publish": /if \(listing\.verify_lost\) \{\s*summary\.held = photos\.length;/ };
for (const [f, re] of Object.entries(GW)) if (!re.test(read(`netlify/functions/${f}.js`))) fail(`${f} doesn't hold while Google wants it verified again`);
for (const f of ["admin-gbp-area-add", "admin-gbp-booking", "admin-gbp-services-push", "admin-gbp-categories"]) if (!/rv && rv\.state === "lost"\) return json\(409/.test(read(`netlify/functions/${f}.js`))) fail(`${f} stopped holding while Google wants it verified again`);
{ const { runForClient, STEP } = require("./_gbp-posts.js"); let googled = 0;
  const supa = async (p) => /client_monthly_records/.test(p) ? [{ id: "m", data: { tasks: { [STEP]: { approval: { decision: "approved" }, post_queue: [{ status: "queued", week: 1, due: "2020-01-01" }] } } } }] : /client_onboarding_records/.test(p) ? [{ data: { tasks: lostTasks } }] : [];
  const r = await runForClient({ supa, clientId: CID, fetchFn: async () => { googled++; return { ok: true, status: 200, json: async () => ({}) }; } });
  if (googled || !/verified again/.test(String(r.skipped || ""))) fail(`a Google post goes out while Google wants it verified again (${JSON.stringify(r)})`); }
{ const m = read("netlify/functions/_open-moves.js"); if (!/what: lostAt \? "Google wants your business verified again" : s\.clientLabel \|\| s\.title/.test(m)) fail("To do doesn't say why step 2 is back"); }

if (F.length) { console.error(`🔴 client_open_calls_v1 isn't what Chris approved:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client_open_calls_v1 holds: steps 4 + 8 say reload with no button when Google is unreadable; step 4 warns only for a name or address change; step 2's verify-again card, written only from the client's own profile on a step that was done and cleared when it's back, with every Google writer holding; step 9 names the tool; steps 7, 8, 9 say on Google in their Done words; said-no and taken-down show the problem and one button, the form opens when it's pressed");
