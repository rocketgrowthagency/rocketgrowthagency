#!/usr/bin/env node
// check-step-10-booking-link.mjs — client step 10 "Add your booking link" is the approved build, for ANY business:
//   · the link goes in the link type Google offers THIS business (a restaurant has no appointment link: Reservations /
//     Order ahead), never url_appointment by default; none offered → the step settles with nothing written
//   · our tracking tag goes on the link Google gets (once; a link with its own utm_ tags keeps them); the client sees it clean
//   · we only ever fetch a public page (never localhost / a private address), and a link that doesn't open isn't sent
//   · RGA finds a page on the client's website (booking first, then quote, then contact) and any booking tool it links to
//   · the nightly check treats the tagged link on Google as the same link the client saved
//   · the portal draws three choices inside the one Google card (RGA's recommendation preselected), the done card has
//     "Change link" (Editing, nothing written) + Try it + Maps; admin row shows the choice, the link type and Try it
//
// 🔒 WHY (approved step10_booking_link_v1, 2026-10-16). Chris: "mockup step 10 with new design and think it through".
// Reading Google on 10-16: a restaurant's category offers url_reservations / url_order_ahead / url_menu and NO
// url_appointment, so step 10 told every restaurant "Google didn't accept this link". The form also stacked a label + help
// above a bare box, "Show me how" promised a setup the form couldn't take, the link went on Google untagged, and Change
// marked the step not-done before anything changed.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let G, B, W;
try { G = req("./_gbp-profile.js"); B = req("./_booking-link.js"); W = req("./_gbp-watch.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const F = []; const fail = (m) => F.push(m);
const STEP = "m1.gbp.booking_link";
const TAGGED = (u) => `${u}${u.includes("?") ? "&" : "?"}utm_source=gbp&utm_medium=booking&utm_campaign=local-seo`;

// ── a fake Google (+ the pages the link check / the website read fetch) ──
const URLT = (k) => ({ parent: `attributes/${k}`, valueType: "URL", displayName: k });
function fakeGoogle({ offered = [], attrs = [], linkStatus = 200, normalize = false } = {}) {
  const w = { calls: [], state: { attrs: [...attrs] } };
  w.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    w.calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (!url.startsWith("https://mybusinessbusinessinformation.googleapis.com/")) return res(linkStatus, {});
    if (/\/attributes\?parent=/.test(url)) return res(200, { attributeMetadata: offered.map(URLT) });
    if (method === "PATCH") {
      const mask = decodeURIComponent(url.split("attributeMask=")[1] || "").split(",");
      const body = JSON.parse(init.body).attributes.map((a) => normalize ? { ...a, uriValues: a.uriValues.map((v) => ({ uri: v.uri.replace("https://www.", "https://WWW.").replace("/?", "?") })) } : a);
      w.state.attrs = [...w.state.attrs.filter((a) => !mask.includes(a.name)), ...body];
      return res(200, {});
    }
    return res(200, { attributes: w.state.attrs });
  };
  w.deps = { fetch: w.fetch, token: "t", loc: "locations/1" };
  w.writes = () => w.calls.filter((c) => c.method === "PATCH");
  w.pages = () => w.calls.filter((c) => !c.url.startsWith("https://mybusinessbusinessinformation"));
  return w;
}
const APPT = ["url_appointment", "url_facebook"], REST = ["url_reservations", "url_order_ahead", "url_menu"];

// ── 1 · the write: the right link type, tagged, read back ──
{
  const w = fakeGoogle({ offered: APPT });
  const o = await G.applyForStep(STEP, { value: "https://www.joesplumbing.com/request-a-quote", choice: "website" }, w.deps);
  const wr = w.writes()[0];
  if (o.state !== "on_google" || !/attributeMask=attributes%2Furl_appointment$/.test(wr?.url || "") || wr?.body.attributes[0].uriValues[0].uri !== TAGGED("https://www.joesplumbing.com/request-a-quote")) fail(`a plumber's link isn't written as Google's appointment link with our tag (${wr?.url} ${JSON.stringify(wr?.body)})`);
  if (o.link !== "https://www.joesplumbing.com/request-a-quote" || o.choice !== "website" || o.link_type !== "url_appointment") fail(`the saved record doesn't keep the clean link, the choice and the link type (${JSON.stringify(o)})`);
}
{
  const w = fakeGoogle({ offered: REST });
  const o = await G.applyForStep(STEP, { value: "https://www.opentable.com/r/bistro", choice: "tool" }, w.deps);
  if (o.state !== "on_google" || !/attributes%2Furl_reservations$/.test(w.writes()[0]?.url || "") || o.platform !== "OpenTable") fail(`a restaurant's link doesn't go in Google's reservations link (${w.writes()[0]?.url} ${o.state})`);
  const w2 = fakeGoogle({ offered: REST });
  await G.applyForStep(STEP, { value: "https://www.doordash.com/store/bistro", choice: "tool", link_type: "url_order_ahead" }, w2.deps);
  if (!/attributes%2Furl_order_ahead$/.test(w2.writes()[0]?.url || "")) fail("a restaurant picking Order ahead doesn't get the order-ahead link");
  const w3 = fakeGoogle({ offered: REST });
  await G.applyForStep(STEP, { value: "https://bistro.com/book", choice: "website", link_type: "url_appointment" }, w3.deps);
  if (/url_appointment/.test(w3.writes()[0]?.url || "")) fail("a link type Google doesn't offer this business is written anyway");
}
{
  const w = fakeGoogle({ offered: ["url_facebook", "url_menu"] });
  const o = await G.applyForStep(STEP, { value: "https://x-cafe.com/contact", choice: "website" }, w.deps);
  if (o.state !== "not_sent" || o.reason !== "google_offers_no_link" || w.writes().length || w.pages().length) fail(`a business Google offers no booking link isn't settled with nothing written (${JSON.stringify(o)})`);
}
{
  const w = fakeGoogle({ offered: APPT });
  await G.applyForStep(STEP, { value: "https://x.com/book?utm_source=newsletter", choice: "tool" }, w.deps);
  if (w.writes()[0]?.body.attributes[0].uriValues[0].uri !== "https://x.com/book?utm_source=newsletter") fail("a link with its own utm_ tags got ours on top");
  const w2 = fakeGoogle({ offered: APPT });
  const o2 = await G.applyForStep(STEP, { value: "http://localhost:8080/book", choice: "tool" }, w2.deps);
  if (o2.state !== "needs_client" || w2.pages().length || w2.writes().length) fail("a link to a private address was fetched or sent to Google");
  const w3 = fakeGoogle({ offered: APPT, linkStatus: 404 });
  const o3 = await G.applyForStep(STEP, { value: "https://x.com/gone", choice: "tool" }, w3.deps);
  if (o3.state !== "needs_client" || !o3.fix || w3.writes().length) fail("a link that doesn't open was sent to Google");
  const w4 = fakeGoogle({ offered: APPT, normalize: true });
  const o4 = await G.applyForStep(STEP, { value: "https://www.x.com/contact/", choice: "website" }, w4.deps);
  if (o4.state !== "on_google") fail(`Google writing the host in capitals / dropping a slash reads as a failed save (${o4.state})`);
  const none = fakeGoogle({ offered: APPT });
  const n = await G.applyForStep(STEP, { none: true }, none.deps);
  if (n.state !== "not_sent" || none.writes().length || none.pages().length) fail("\"Customers call us\" reached Google");
}
{
  const w = fakeGoogle({ offered: REST, attrs: [{ name: "locations/1/attributes/url_reservations", valueType: "URL", uriValues: [{ uri: "https://resy.com/x" }] }] });
  const now = await G.readForStep(STEP, w.deps);
  const r = (now.types || []).find((t) => t.key === "url_reservations");
  if (!r || r.links[0] !== "https://resy.com/x" || (now.types || []).some((t) => t.key === "url_appointment") || r.button !== "Reserve") fail(`the read doesn't list the link types Google offers with what each holds (${JSON.stringify(now)})`);
}

// ── 2 · a page on their website, any trade ──
const site = (html, url) => async () => ({ ok: true, url, text: async () => html });
{
  const p = await B.findBookingPages("joesplumbing.com", site(`<a href="/">Home</a><a href="/contact-us/">Contact Us</a><a href="/request-a-quote">Free Estimate</a><a href="https://book.housecallpro.com/book/joe/1">Book Online</a><a href="mailto:a@b.com">Email us</a><a href="tel:5551234">Call</a><a href="/blog/booking-tips">Booking tips</a><a href="/files/booking.pdf">Book</a><a href="https://facebook.com/joe">Book on FB</a>`, "https://www.joesplumbing.com/"));
  if (JSON.stringify(p.pages.map((x) => x.label)) !== JSON.stringify(["joesplumbing.com/request-a-quote", "joesplumbing.com/contact-us"]) || p.tools[0]?.platform !== "Housecall Pro" || p.tools.length !== 1) fail(`a plumber's website pages / tool are found wrong (${JSON.stringify(p)})`);
  const s = await B.findBookingPages("https://glowsalon.com", site(`<a href="/contact">Contact</a><a href="/appointments">Appointments</a><a href="https://www.vagaro.com/glow">Book now</a>`, "https://glowsalon.com/"));
  if (s.pages[0]?.label !== "glowsalon.com/appointments" || s.tools[0]?.platform !== "Vagaro") fail(`a booking page doesn't come before a contact page (${JSON.stringify(s)})`);
  const l = await B.findBookingPages("smithlaw.com", site(`<a href="/practice-areas">Areas</a><a href="/schedule-a-consultation">Free consultation</a>`, "https://smithlaw.com/"));
  if (l.pages[0]?.label !== "smithlaw.com/schedule-a-consultation") fail(`a law firm's consultation page isn't found (${JSON.stringify(l)})`);
  const r = await B.findBookingPages("bistro.com", site(`<a href="https://www.opentable.com/r/bistro">Reserve a table</a><a href="/menu">Menu</a>`, "https://bistro.com/"));
  if (r.tools[0]?.platform !== "OpenTable" || r.pages.length) fail(`a restaurant's reservations tool isn't found, or its menu reads as a booking page (${JSON.stringify(r)})`);
  const dead = await B.findBookingPages("gone.com", async () => ({ ok: false, status: 404 }));
  let hit = false; const local = await B.findBookingPages("http://localhost:3000", async () => { hit = true; return { ok: true, text: async () => "" }; });
  if (dead.pages.length || local.pages.length || hit) fail("an unreadable or private website produces pages (or was fetched)");
}
// who runs a link; the tag; the same link with or without it
if (B.platformOf("https://acme.as.me/x") !== "Acuity" || B.platformOf("https://calendly.com/a") !== "Calendly" || B.platformOf("https://example.com") !== null) fail("a booking tool isn't recognized by its host");
if (B.withTag("https://x.com/a#top") !== "https://x.com/a?utm_source=gbp&utm_medium=booking&utm_campaign=local-seo#top") fail("our tag doesn't go before the #anchor");
if (B.safeUrl("http://10.0.0.5/") || B.safeUrl("https://192.168.1.1/x") || B.safeUrl("https://[::1]/") || !B.safeUrl("https://book.squareup.com/x")) fail("a private address counts as a public page (or a public one doesn't)");

// ── 3 · the nightly check: our tag isn't a change ──
{
  const task = { client_input: { value: "https://x.com/contact/", choice: "website" }, google_push: { state: "on_google", link_type: "url_reservations" } };
  const now = (u) => ({ types: [{ key: "url_reservations", links: [u] }], links: [] });
  if (W.driftOf(STEP, task, now("https://www.x.com/contact?utm_source=gbp&utm_medium=booking&utm_campaign=local-seo"))) fail("the nightly check reads our tagged link on Google as a change");
  if (!W.driftOf(STEP, task, now("https://other.com/book"))) fail("the nightly check misses a different link on Google");
}

// ── 4 · the portal, the admin, the words ──
const portal = read("portal/portal.js"), js = portal.replace(/^[ \t]*\/\/.*$/gm, ""), css = read("portal/portal.css"), admin = read("admin/admin.js");
const prof = read("netlify/functions/portal-gbp-profile.js"), inp = read("netlify/functions/portal-step-input.js"), flow = read("netlify/functions/flow-execute.js");
const pb = JSON.parse(read("data/playbooks/playbooks.json")).month1.find((s) => s.id === STEP), cs = JSON.parse(read("data/playbooks/client-steps.json")).month1.find((s) => s.id === STEP);
if (!/if \(stepId === "m1\.gbp\.booking_link" && body\.check_link != null\) \{[\s\S]{0,400}if \(!B\.safeUrl\(u\.href\)\)[\s\S]{0,200}B\.linkOpens\(/.test(prof) || prof.indexOf("body.check_link != null") > prof.indexOf("await connectFor(")) fail("\"does it open?\" isn't checked as they type (public pages only, before any Google call)");
if (!/now\.pages = found\.pages; now\.tools = found\.tools;/.test(prof)) fail("the step doesn't read the client's website for a page to recommend");
if (!/if \(spec\.kind === "booking"\) \{[\s\S]{0,700}safeUrl\(u\.value\)[\s\S]{0,300}\["website", "tool", "keep"\]/.test(inp)) fail("the save doesn't check the booking answer's shape (public link, choice, link type)");
if (!/const rec = cur\.length \? "keep" : tools\.length \? "tool" : pages\.length \? "website" : "tool";/.test(js)) fail("RGA's recommendation isn't keep → the tool their site links to → a page on their site");
if (!/data-bk-had=/.test(js) || !/host\.innerHTML = bookingFormHtml\(now, bkHad,/.test(js)) fail("the form isn't drawn from Google + their website");
if (!/value = \{ value: url\.trim\(\), choice, \.\.\.\(linkType \? \{ link_type: linkType \} : \{\}\) \};/.test(js)) fail("the save doesn't send the choice and the link type");
const inH = js.slice(js.indexOf('document.addEventListener("input", (e) => {\n  const inp = e.target && e.target.closest && e.target.closest("[data-bk-url]")'), js.indexOf('document.addEventListener("input", (e) => {\n  const inp = e.target && e.target.closest && e.target.closest("[data-bk-url]")') + 1800);
if (!inH || !/check_link: v/.test(inH) || /portal-step-input/.test(inH) || !/setTimeout\(async/.test(inH)) fail("typing a link doesn't check it opens (debounced, without saving)");
if (!/^const EDIT_IN_PLACE = new Set\(\[[^\]]*"m1\.gbp\.booking_link"/m.test(portal) || !/^const ONE_LINE_ASK = new Set\(\[[^\]]*"m1\.gbp\.booking_link"/m.test(portal)) fail("Change link doesn't open the editor without a write, or the ask isn't one line");
if ((css.match(/^\.pm-bk-opt \{/gm) || []).length !== 1 || /^\.pm-bk-opt[^{]*\{[^}]*background:\s*var\(--state-/m.test(css)) fail("the choices aren't styled once, on white");
if (!/if \(spec\.kind === "booking"\) \{[\s\S]{0,400}BK_CHOICE/.test(admin) || !/spec\.kind === "booking" && g\.sent \? `<a class="ob-gcard-maps" href="\$\{escapeAttribute\(g\.sent\)\}"/.test(admin)) fail("admin doesn't show which choice, the link type and Try it");
if (pb.hasRunner || pb.actionLabel || /"m1\.gbp\.booking_link": async/.test(flow)) fail("admin still has a Generate runner for a step that goes to Google by itself");
if (cs.clientInput.kind !== "booking" || /set either one up|a sentence telling us/i.test(cs.clientInstructions) || !/PICK WHERE IT GOES/.test(cs.clientInstructions)) fail("\"Show me how\" still promises what the form can't do");

// ── 4b · WIRED: every field the save stores in the database is read by the client portal and by admin (Chris 10-16: "make sure
// all is wired to both client, admin and database"). A field written and read by nobody is a promise nobody sees.
{
  const gp = read("netlify/functions/_gbp-profile.js");
  const writer = (gp.match(/return \{ state: "on_google", before, after, at, link_type: type\.key, link_label: type\.label, link: B\.withoutTag\(sent\), sent, choice, platform: B\.platformOf\(url\) \};/) || [""])[0];
  if (!writer) fail("the step-10 save no longer stores { link, sent, link_type, link_label, choice, platform } on google_push");
  const READ = { "g.link": [js, admin], "g.sent": [admin], "g.link_type": [js], "g.link_label": [admin], "g.choice": [js], "g.platform": [js, admin], "v.choice": [admin] };
  for (const [f, srcs] of Object.entries(READ)) for (const src of srcs) if (!new RegExp(f.replace(".", "\\.") + "\\b").test(src)) fail(`${f} is stored but ${src === admin ? "admin" : "the client portal"} never reads it`);
  if (!/recordSubmission\(\{ supa, clientId, kind: "client_step_input"/.test(inp) || !/\[GSTEP\.BOOKING\]: `booking link \(\$\{\(push && push\.link_type\) \|\| "url_appointment"\}\)`/.test(inp)) fail("a step-10 save isn't recorded (activity row + change-log row naming the link type)");
}

// 🔒 10-16 (brand-new client walk): a WAITING Google step never reads Google, so it can't say "couldn't read it… you can still save"
if (!/if \(host\.closest\("\.pm-waits"\)\) \{ host\.innerHTML = `<span class="pm-in-help">This fills in from your Google profile once the step opens\.<\/span>`; continue; \}/.test(portal)) fail("a waiting Google step reads Google and shows a read failure");

// ── 5 · drawn for real ──
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf(") {", m.index) + 2; k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const lift = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), line("GOOGLE_G"), line("GC_ICON"), pick(/^function googleCardHtml\(/m), line("gcardMaps"), line("siteShow"), line("monthDay"), line("BK_NOUN"), pick(/^function bookingCardHtml\(/m), pick(/^function bookingFormHtml\(/m)];
if (lift.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step-10 helper moved (${lift.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let R;
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: lift.join("\n") });
  R = await page.evaluate(async () => {
    const A = { key: "url_appointment", label: "Booking link", button: "Book", none: "Customers call us" };
    const h = document.getElementById("h");
    const draw = (html) => { h.innerHTML = html; const c = h.firstElementChild; const sel = h.querySelector("[data-bk-opt].sel");
      return { cls: c && c.className, bg: c && getComputedStyle(c).backgroundColor, sel: sel && sel.getAttribute("data-bk-opt"), rec: ((h.querySelector(".gcard-why") || {}).innerText || "").replace(/\s+/g, " "),
        text: h.innerText.replace(/\s+/g, " ").trim(), page: (h.querySelector("[data-bk-page].on") || {}).getAttribute?.("data-bk-page") || null, tool: (h.querySelector('[data-bk-url="tool"]') || {}).value || "",
        types: [...h.querySelectorAll("[data-bk-type]")].map((b) => b.getAttribute("data-bk-type")), act: (h.querySelector(".gcard-act") || {}).innerText || "", edit: !!h.querySelector('[data-step-edit="m1.gbp.booking_link"]'), keep: (h.querySelector('[data-bk-opt="keep"]') || {}).getAttribute?.("data-bk-keep") || null }; };
    const site = { site: "rocketgrowthagency.com", types: [{ ...A, links: [] }], pages: [{ url: "https://www.rocketgrowthagency.com/free-growth-audit/", label: "rocketgrowthagency.com/free-growth-audit" }, { url: "https://www.rocketgrowthagency.com/contact/", label: "rocketgrowthagency.com/contact" }], tools: [] };
    return {
      site: draw(bookingFormHtml(site, null)),
      tool: draw(bookingFormHtml({ ...site, tools: [{ url: "https://book.housecallpro.com/book/joe/1", platform: "Housecall Pro" }] }, null)),
      keep: draw(bookingFormHtml({ ...site, types: [{ ...A, links: [{ url: "https://square.site/book/glow?utm_source=gbp", clean: "https://square.site/book/glow", platform: "Square" }] }] }, null)),
      saved: draw(bookingFormHtml(site, { value: "https://www.rocketgrowthagency.com/contact/", choice: "website" })),
      old: draw(bookingFormHtml(site, "https://calendar.app.google/x")),
      rest: draw(bookingFormHtml({ site: "bistro.com", types: [{ key: "url_reservations", label: "Reservations link", button: "Reserve", none: "We don't take reservations online", links: [] }, { key: "url_order_ahead", label: "Order-ahead link", button: "Order", none: "We don't take orders online", links: [] }], pages: [], tools: [] }, null)),
      noType: draw(bookingFormHtml({ types: [] }, null)),
      editing: draw(bookingFormHtml(site, null, { editing: true })),
      done: draw(bookingCardHtml({ id: "m1.gbp.booking_link" }, { client_input_at: "2026-10-16T22:00:00Z" }, { state: "on_google", at: "2026-10-16T22:00:00Z", link: "https://www.rocketgrowthagency.com/contact/", choice: "website", link_type: "url_appointment", after: [] }, "https://maps.google.com/?cid=1")),
      resDone: draw(bookingCardHtml({ id: "m1.gbp.booking_link" }, {}, { state: "on_google", at: "2026-10-16T22:00:00Z", link: "https://www.opentable.com/r/bistro", platform: "OpenTable", choice: "tool", link_type: "url_reservations", after: [] }, null)),
      call: draw(bookingCardHtml({ id: "m1.gbp.booking_link" }, {}, { state: "not_sent", reason: "no_online_booking" }, null)),
      // 🔑 drawn last and LEFT in the page: an injected <img onerror> fires after its load fails, not while drawing
      xss: draw(bookingFormHtml({ site: "<img src=x onerror=window.__x=1>", types: [{ ...A, links: [] }], pages: [{ url: "https://a.com/\"><img src=x onerror=window.__x=1>", label: "<img src=x onerror=window.__x=1>" }], tools: [] }, null)),
      x: await new Promise((r) => setTimeout(() => r(window.__x || 0), 300)),
    };
  });
} finally { await browser.close(); }
// 🔒 google_card_best_v1: the amber TINT is the state; RGA's recommendation is the "why" line, and it is the preselected choice
const TINT_YOU = "rgb(255, 241, 227)";
if (R.site.cls !== "gcard you" || R.site.bg !== TINT_YOU || R.site.sel !== "website" || !/^RGA recommends A page on your website, rocketgrowthagency\.com\/free-growth-audit\./i.test(R.site.rec) || R.site.page !== "https://www.rocketgrowthagency.com/free-growth-audit/" || !/Your move Where should Google's Book button go\? Google shows no booking link/i.test(R.site.text) || !/Where should Google's Book button go\?/.test(R.site.text)) fail(`with a page on their website, it isn't recommended and preselected in the amber Google card (${JSON.stringify(R.site)})`);
if (R.tool.sel !== "tool" || !/^RGA recommends Your booking tool\. Your website already links to Housecall Pro\./i.test(R.tool.rec) || R.tool.tool !== "https://book.housecallpro.com/book/joe/1" || !/Your website links to Housecall Pro/.test(R.tool.text)) fail(`the booking tool their website links to isn't recommended and filled in (${JSON.stringify(R.tool)})`);
if (R.keep.sel !== "keep" || !/^RGA recommends Keep the link Google shows/i.test(R.keep.rec) || R.keep.keep !== "https://square.site/book/glow?utm_source=gbp" || !/Keep the link Google shows/.test(R.keep.text)) fail(`a link Google already shows isn't "Keep the link Google shows", recommended (${JSON.stringify(R.keep)})`);
if (R.saved.sel !== "website" || R.saved.page !== "https://www.rocketgrowthagency.com/contact/") fail("a saved answer doesn't come back as they left it");
if (R.old.sel !== "tool" || R.old.tool !== "https://calendar.app.google/x") fail("an answer saved in the old shape (a bare link) doesn't come back in the booking-tool box");
if (JSON.stringify(R.rest.types) !== JSON.stringify(["url_reservations", "url_order_ahead"]) || !/We don't take reservations online/.test(R.rest.text) || /Book button|Customers call us/.test(R.rest.text)) fail(`a restaurant isn't asked for the links Google offers it (${JSON.stringify(R.rest)})`);
if (R.noType.sel !== "none" || !/Google doesn't offer your kind of business a booking link/.test(R.noType.text)) fail("a business Google offers no booking link can't finish the step");
if (R.editing.cls !== "gcard ok" || !/^On Google now (?!·)/i.test(R.editing.text) || R.editing.rec) fail("editing a done step doesn't show what's on Google now in a green card");
if (R.done.cls !== "gcard ok" || R.done.act !== "Change link" || !R.done.edit || !/Your booking link Last checked Oct 16 rocketgrowthagency\.com\/contact Your website/i.test(R.done.text) || !/Try it ↗ See it on Google Maps ↗ Change link$/.test(R.done.text)) fail(`the done card isn't the link + who runs it + Try it + Maps + Change link (${R.done.text})`);
if (!/Your reservations link Last checked Oct 16 (?:www\.)?opentable\.com\/r\/bistro OpenTable/i.test(R.resDone.text)) fail(`a restaurant's done card doesn't say reservations link (${R.resDone.text})`);
if (R.call.act !== "Add a link" || !/Customers call you/.test(R.call.text)) fail("\"Customers call us\" isn't a settled card with Add a link");
if (R.x) fail("a page name from the client's website became HTML");

if (F.length) { console.error("🔴 Step 10 isn't the approved booking-link step:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 10 works for any business: the link type Google offers it (restaurants: reservations / order ahead; none → settled), our tag once, public pages only, opens-checked; RGA finds a booking / quote / contact page or the tool their site links to and recommends keep → tool → page; the nightly check ignores our tag; three choices in the one Google card, Change link without a write, admin shows choice + type + Try it; no Generate runner");
