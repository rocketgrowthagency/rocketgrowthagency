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
import { planCardKit } from "./lib/plan-card-kit.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let G, B, W;
try { G = req("./_gbp-profile.js"); B = req("./_booking-link.js"); W = req("./_gbp-watch.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const F = []; const fail = (m) => F.push(m);
const STEP = "m1.gbp.booking_link";
const TAGGED = (u) => `${u}${u.includes("?") ? "&" : "?"}utm_source=google&utm_medium=organic&utm_campaign=gbp-booking`;

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
  await G.applyForStep(STEP, { value: "https://joes-plumbing.com/book?utm_source=newsletter", choice: "tool" }, w.deps);
  if (w.writes()[0]?.body.attributes[0].uriValues[0].uri !== "https://joes-plumbing.com/book?utm_source=newsletter") fail("a link with its own utm_ tags got ours on top");
  const w2 = fakeGoogle({ offered: APPT });
  const o2 = await G.applyForStep(STEP, { value: "http://localhost:8080/book", choice: "tool" }, w2.deps);
  if (o2.state !== "needs_client" || w2.pages().length || w2.writes().length) fail("a link to a private address was fetched or sent to Google");
  const w3 = fakeGoogle({ offered: APPT, linkStatus: 404 });
  const o3 = await G.applyForStep(STEP, { value: "https://joes-plumbing.com/gone", choice: "tool" }, w3.deps);
  if (o3.state !== "needs_client" || !o3.fix || w3.writes().length) fail("a link that doesn't open was sent to Google");
  const w4 = fakeGoogle({ offered: APPT, normalize: true });
  const o4 = await G.applyForStep(STEP, { value: "https://www.joes-plumbing.com/contact/", choice: "website" }, w4.deps);
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
  // 🔒 10-29, tested on 40 real businesses in 10 trades: a booking tool we don't know by name is still theirs when the BUTTON says so
  // (a chiropractor's scheduler on a second domain); Boulevard + Modento by name (med spas, a dentist); an href is HTML, so "&amp;"
  // becomes "&" (Mindbody's link reached Google broken); never a social / marketplace page or a bare home page.
  const u = await B.findBookingPages("spine.com", site(`<a href="https://drmina.com/?selected_agent=any&#038;latepoint=instant">Book Appointment</a><a href="https://partner-site.com/about">Our partners</a><a href="https://www.yelp.com/biz/spine">Book on Yelp</a><a href="https://otherdomain.com/">Book now</a>`, "https://spine.com/"));
  if (u.tools.length !== 1 || u.tools[0].platform !== "drmina.com" || u.tools[0].url !== "https://drmina.com/?selected_agent=any&latepoint=instant") fail(`a "Book Appointment" button to a tool we don't know by name isn't found as theirs, or a yelp / home / non-booking link is (${JSON.stringify(u.tools)})`);
  const bv = await B.findBookingPages("luxe.com", site(`<a href="https://www.joinblvd.com/b/luxe/widget">Reserve</a><a href="https://book.modento.io/c/1/Relate">Schedule</a>`, "https://luxe.com/"));
  if (bv.tools.map((t) => t.platform).join() !== "Boulevard,Modento") fail(`Boulevard / Modento aren't named (${JSON.stringify(bv.tools)})`);
  const mb = await B.findBookingPages("hot8.com", site(`<a href="https://clients.mindbodyonline.com/classic/ws?studioid=8179&amp;stype=-2">Sign up</a>`, "https://hot8.com/"));
  if (mb.tools[0]?.url !== "https://clients.mindbodyonline.com/classic/ws?studioid=8179&stype=-2") fail(`"&amp;" in a link isn't decoded — Google would get a broken link (${mb.tools[0]?.url})`);
}
// who runs a link; the tag; the same link with or without it
if (B.platformOf("https://acme.as.me/x") !== "Acuity" || B.platformOf("https://calendly.com/a") !== "Calendly" || B.platformOf("https://example.com") !== null) fail("a booking tool isn't recognized by its host");
if (B.withTag("https://joes-plumbing.com/a#top") !== "https://joes-plumbing.com/a?utm_source=google&utm_medium=organic&utm_campaign=gbp-booking#top") fail("our tag doesn't go before the #anchor");
if (B.safeUrl("http://10.0.0.5/") || B.safeUrl("https://192.168.1.1/x") || B.safeUrl("https://[::1]/") || !B.safeUrl("https://book.squareup.com/x")) fail("a private address counts as a public page (or a public one doesn't)");

// ── 3 · the nightly check: our tag isn't a change ──
{
  const task = { client_input: { value: "https://joes-plumbing.com/contact/", choice: "website" }, google_push: { state: "on_google", link_type: "url_reservations" } };
  const now = (u) => ({ types: [{ key: "url_reservations", links: [u] }], links: [] });
  if (W.driftOf(STEP, task, now("https://www.joes-plumbing.com/contact?utm_source=google&utm_medium=organic&utm_campaign=gbp-booking"))) fail("the nightly check reads our tagged link on Google as a change");
  if (!W.driftOf(STEP, task, now("https://other.com/book"))) fail("the nightly check misses a different link on Google");
}

// ── 3b · step10_booking_link_v2 (approved 10-20): links Google refuses, partners, login walls, "Google took it down" ──
for (const [u, code] of [["https://www.facebook.com/joesplumbing", "social"], ["https://instagram.com/joes", "social"], ["https://bit.ly/joes", "short"], ["https://linktr.ee/joes", "short"],
  ["https://www.yelp.com/biz/joes", "marketplace"], ["https://www.thumbtack.com/ca/joes", "marketplace"], ["https://wa.me/15550100", "messaging"], ["https://apps.apple.com/app/x", "store"], ["https://joes-plumbing.com/", "home"], ["https://www.joes-plumbing.com", "home"]]) {
  const r = B.refuseReason(u); if (!r || r.code !== code || !r.said || !r.fix) fail(`a link Google refuses isn't refused with its fix (${u} → ${JSON.stringify(r)})`);
}
for (const u of ["https://joes-plumbing.com/book", "https://joes.setmore.com/", "https://book.joes-plumbing.com/", "https://calendly.com/joe/30min", "https://joes-plumbing.com/?service=drain"]) if (B.refuseReason(u)) fail(`a page people can book on is refused (${u})`);
{
  const w = fakeGoogle({ offered: APPT });
  const o = await G.applyForStep(STEP, { value: "https://www.facebook.com/joesplumbing", choice: "tool" }, w.deps);
  if (o.state !== "needs_client" || !/social media/.test(o.said || "") || w.writes().length || w.pages().length) fail(`a social link reaches Google or the link check (${JSON.stringify(o)})`);
  const w2 = fakeGoogle({ offered: APPT });
  const o2 = await G.applyForStep(STEP, { value: "https://book.squareup.com/appointments/joe", choice: "partner", platform: "Square" }, w2.deps);
  if (o2.state !== "not_sent" || o2.reason !== "partner" || o2.platform !== "Square" || w2.writes().length) fail(`a booking partner isn't settled with nothing written (${JSON.stringify(o2)})`);
  const w3 = fakeGoogle({ offered: APPT });
  const loginFetch = async (url, init) => (/googleapis/.test(url) ? w3.fetch(url, init) : { ok: true, status: 200, url: "https://app.joes-tool.com/users/sign_in", json: async () => ({}) });
  const o3 = await G.applyForStep(STEP, { value: "https://app.joes-tool.com/bookings/admin", choice: "tool" }, { ...w3.deps, fetch: loginFetch });
  if (o3.state !== "needs_client" || !/sign in/.test(o3.said || "") || w3.writes().length) fail(`a page behind a sign-in is saved (${JSON.stringify(o3)})`);
  if (B.TAG.map((x) => x.join("=")).join("&") !== "utm_source=google&utm_medium=organic&utm_campaign=gbp-booking") fail("the tag isn't google / organic / gbp-booking (Google Analytics files it under Organic Search)");
  if (!B.isPartner("Square") || !B.isPartner("Housecall Pro") || B.isPartner("Calendly")) fail("the booking-partner list is wrong (Square / Housecall Pro are; Calendly isn't)");
  const site = await B.findBookingPages("https://joes-plumbing.com", async () => ({ ok: true, url: "https://joes-plumbing.com/", text: async () => '<a href="https://book.squareup.com/appointments/joe">Book now</a><a href="https://calendly.com/joe/30">Call</a>' }));
  const sq = (site.tools || []).find((t) => t.platform === "Square"), cal = (site.tools || []).find((t) => t.platform === "Calendly");
  if (!sq || sq.partner !== true || !cal || cal.partner !== false) fail(`reading their website doesn't flag a Google booking partner (${JSON.stringify(site.tools)})`);
}
{
  const task = { client_input: { value: "https://joes-plumbing.com/book", choice: "website" }, google_push: { state: "on_google", link_type: "url_appointment", link: "https://joes-plumbing.com/book" } };
  const gone = W.driftOf(STEP, task, { types: [{ key: "url_appointment", links: [] }], links: [] });
  const other = W.driftOf(STEP, task, { types: [{ key: "url_appointment", links: ["https://other.com/book"] }], links: [] });
  if (!gone || gone.removed !== true || !other || other.removed) fail("the nightly check doesn't tell \"Google took it down\" (no link) from \"someone changed it\" (a different link)");
  // run the watch: the step reopens, the state is removed, recorded, RGA told once
  const recs = [], told = [];
  let stored = { tasks: { [STEP]: { ...task, status: "done", completed_at: "2026-10-16T00:00:00Z" } } };
  const d = { supa: null, connect: async () => ({ token: "t", loc: "locations/1" }), fetch: fakeGoogle({ offered: APPT, attrs: [] }).fetch,
    readStepRecord: async () => stored, readRecord: async () => stored, writeStepTasks: async (_s, _r, tasks) => { stored = { ...stored, tasks }; return stored; },
    record: async (x) => recs.push(x), notifyRga: async (_c, t) => told.push(t) };
  let out; try { out = await W.watchClient("c1", d); } catch (e) { out = { error: e.message }; }
  const t2 = stored.tasks[STEP];
  if (!t2 || t2.status !== "pending" || !t2.google_push || t2.google_push.state !== "removed" || !t2.google_push.removed_at || t2.google_push.removed_link !== "https://joes-plumbing.com/book" || t2.completed_at)
    fail(`"Google took it down" doesn't reopen the step as the client's move (${JSON.stringify(out).slice(0, 160)} · ${JSON.stringify(t2 && t2.google_push)})`);
  else if (!recs.some((x) => x.kind === "gbp_booking_removed") || told.length !== 1) fail(`"Google took it down" isn't recorded, or RGA isn't told exactly once (${recs.length} recs, ${told.length} told)`);
  else { await W.watchClient("c1", d); if (told.length !== 1) fail("a second night tells RGA again about the same removed link"); }
}

// ── 4 · the portal, the admin, the words ──
const portal = read("portal/portal.js"), js = portal.replace(/^[ \t]*\/\/.*$/gm, ""), css = read("portal/portal.css"), admin = read("admin/admin.js");
const prof = read("netlify/functions/portal-gbp-profile.js"), inp = read("netlify/functions/portal-step-input.js"), flow = read("netlify/functions/flow-execute.js");
const pb = JSON.parse(read("data/playbooks/playbooks.json")).month1.find((s) => s.id === STEP), cs = JSON.parse(read("data/playbooks/client-steps.json")).month1.find((s) => s.id === STEP);
if (!/if \(stepId === "m1\.gbp\.booking_link" && body\.check_link != null\) \{[\s\S]{0,400}if \(!B\.safeUrl\(u\.href\)\)[\s\S]{0,700}B\.linkOpens\(/.test(prof) || prof.indexOf("body.check_link != null") > prof.indexOf("await connectFor(")) fail("\"does it open?\" isn't checked as they type (public pages only, before any Google call)");
if (!/now\.pages = found\.pages; now\.tools = found\.tools;/.test(prof)) fail("the step doesn't read the client's website for a page to recommend");
if (!/if \(spec\.kind === "booking"\) \{[\s\S]{0,700}safeUrl\(u\.value\)[\s\S]{0,300}\["website", "tool", "keep"\]/.test(inp)) fail("the save doesn't check the booking answer's shape (public link, choice, link type)");
// step10_booking_link_v2: a Google booking partner their site uses comes before a pasted tool link
if (!/const rec = cur\.length \? "keep" : partner \? "partner" : tools\.length \? "tool" : pages\.length \? "website" : "tool";/.test(js)) fail("RGA's recommendation isn't keep → a booking partner → the tool their site links to → a page on their site");
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
lift.push(planCardKit(portal, lift.join("\n")));   // 10-23: the plan card's shared pieces (steps_6_20_clean_v1)
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
      // 🔄 10-23 night (steps_6_20_clean_v1): the plan card — its BAND carries the state tint, RGA's recommendation is the card's foot
      const band = h.querySelector(".pm-k5-h");
      return { cls: c && c.className, bg: band && getComputedStyle(band).backgroundColor, sel: sel && sel.getAttribute("data-bk-opt"), rec: ([...h.querySelectorAll(".pm-pc-foot")].map((x) => x.innerText).find((x) => /^RGA recommends/.test(x)) || "").replace(/\s+/g, " "),
        text: h.innerText.replace(/\s+/g, " ").trim(), page: (h.querySelector("[data-bk-page].on") || {}).getAttribute?.("data-bk-page") || null, tool: (h.querySelector('[data-bk-url="tool"]') || {}).value || "",
        types: [...h.querySelectorAll("[data-bk-type]")].map((b) => b.getAttribute("data-bk-type")), act: ((h.querySelector(".pm-k5-acts") || {}).innerText || "").replace(/\s+/g, " ").trim(), edit: !!h.querySelector('[data-step-edit="m1.gbp.booking_link"]'), keep: (h.querySelector('[data-bk-opt="keep"]') || {}).getAttribute?.("data-bk-keep") || null }; };
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
if (R.site.cls !== "pm-k5-plan you" || R.site.bg !== TINT_YOU || R.site.sel !== "website" || !/^RGA recommends Your request form, rocketgrowthagency\.com\/free-growth-audit\. People can ask for a time without phoning, and Google keeps links that let people do that\./i.test(R.site.rec) || R.site.page !== "https://www.rocketgrowthagency.com/free-growth-audit/" || !/^Where should Google send people who want to book\? Google shows no booking link/i.test(R.site.text) || !/Where should Google send people who want to book\?/.test(R.site.text)) fail(`with a page on their website, it isn't recommended and preselected in the amber Google card (${JSON.stringify(R.site)})`);
if (R.tool.sel !== "tool" || !/^RGA recommends Your booking tool\. Your website already links to Housecall Pro\./i.test(R.tool.rec) || R.tool.tool !== "https://book.housecallpro.com/book/joe/1" || !/Your website links to Housecall Pro/.test(R.tool.text)) fail(`the booking tool their website links to isn't recommended and filled in (${JSON.stringify(R.tool)})`);
if (R.keep.sel !== "keep" || !/^RGA recommends Keep the link Google shows/i.test(R.keep.rec) || R.keep.keep !== "https://square.site/book/glow?utm_source=gbp" || !/Keep the link Google shows/.test(R.keep.text)) fail(`a link Google already shows isn't "Keep the link Google shows", recommended (${JSON.stringify(R.keep)})`);
if (R.saved.sel !== "website" || R.saved.page !== "https://www.rocketgrowthagency.com/contact/") fail("a saved answer doesn't come back as they left it");
if (R.old.sel !== "tool" || R.old.tool !== "https://calendar.app.google/x") fail("an answer saved in the old shape (a bare link) doesn't come back in the booking-tool box");
if (JSON.stringify(R.rest.types) !== JSON.stringify(["url_reservations", "url_order_ahead"]) || !/We don't take reservations online/.test(R.rest.text) || /Book button|Customers call us/.test(R.rest.text)) fail(`a restaurant isn't asked for the links Google offers it (${JSON.stringify(R.rest)})`);
if (R.noType.sel !== "none" || !/Google doesn't offer your kind of business a booking link/.test(R.noType.text)) fail("a business Google offers no booking link can't finish the step");
if (R.editing.cls !== "pm-k5-plan ok" || !/On Google now: /.test(R.editing.text) || R.editing.rec) fail("editing a done step doesn't show what's on Google now in a green card");
// 🔄 10-23 night (steps_6_20_clean_v1 v2): "Your booking link is on Google · checked", the profile picture with its booking button, what it
// opens, Change link + See it on Google Maps. 🔴 Google picks its button's words — the card never promises "Book online"
if (!/^pm-k5$/.test(R.done.cls || "") || R.done.act !== "Change link See it on Google Maps ↗" || !R.done.edit || !/^Your booking link is on Google checked Oct 16 /i.test(R.done.text) || !/The book button opens rocketgrowthagency\.com\/contact, your page\. Google picks the button's exact words\./.test(R.done.text) || /Book online|Book button/.test(R.done.text)) fail(`the done card isn't the booking link on Google + the picture + what it opens + Change link + Maps, or it promises a button label (${R.done.text})`);
if (!/^Your reservations link is on Google checked Oct 16 .*The reserve button opens (?:www\.)?opentable\.com\/r\/bistro, your OpenTable page\./i.test(R.resDone.text)) fail(`a restaurant's done card doesn't say reservations link (${R.resDone.text})`);
if (R.call.act !== "Add a link" || !/Customers call you/.test(R.call.text)) fail("\"Customers call us\" isn't a settled card with Add a link");
if (R.x) fail("a page name from the client's website became HTML");

// step10_booking_link_v2 in the portal / admin
if (!/if \(step\.id === "m1\.gbp\.booking_link" && g\.state === "removed"\) \{[\s\S]{0,260}title: "Google took your booking link down"/.test(js)) fail("the portal doesn't say Google took the booking link down");
if (!/function bkGoneNoteHtml\(tasks\)[\s\S]{0,200}g\.state !== "removed"[\s\S]{0,120}7 \* 86400000/.test(js) || !/if \(bNote\) card\.insertAdjacentHTML\("afterend", bNote\);/.test(js)) fail("no 7-day top note when Google takes the link down");
if (!/partner \? opt\("partner", `Connect \$\{escapeHtml\(partner\.platform\)\} to Google`/.test(js) || !/else if \(choice === "partner"\) value = \{ choice, platform:/.test(js)) fail("a booking partner their site uses isn't offered as \"Connect it to Google\"");
if (!/pages\.some\(\(pg\) => pg\.kind === "contact"\) \? `<span class="pm-bk-warn" data-bk-warn>Google sometimes removes contact pages/.test(js) || !/KIND\[pg\.kind\] \? ` <i>· \$\{KIND\[pg\.kind\]\}<\/i>` : ""/.test(js)) fail("the pages don't say what they are, or a contact page has no warning");
if (/Book button go|Book button\b/.test(js.slice(js.indexOf("function bookingFormHtml("), js.indexOf("function bookingFormHtml(") + 9000))) fail("step 10 promises a \"Book button\" (Google decides the label)");
if (!/Google's own report doesn't count clicks on this link, so we add a small tag to count every visit it sends you\./.test(js)) fail("the footer doesn't say why we tag the link");
if (!/g\.state === "removed" \? adminGoogleCardHtml\(\{ state: "you", small: "Google took it down"/.test(admin) || !/g\.state === "needs_client" \|\| g\.state === "removed"\)\) return "you"/.test(admin)) fail("admin doesn't show \"Google took it down\" as the client's move");
if (F.length) { console.error("🔴 Step 10 isn't the approved booking-link step:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 10 works for any business: the link type Google offers it (restaurants: reservations / order ahead; none → settled), our tag once, public pages only, opens-checked; RGA finds a booking / quote / contact page or the tool their site links to and recommends keep → tool → page; the nightly check ignores our tag; three choices in the one Google card, Change link without a write, admin shows choice + type + Try it; no Generate runner");
