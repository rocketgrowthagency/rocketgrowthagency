#!/usr/bin/env node
// check-profile-answers-reach-google.mjs — steps 8 (hours), 10 (booking link) and 11 (what's true of the business) put
// the client's answer on their Google profile, and the step is Done only when Google's read-back matches.
//
// 🔒 WHY (approved profile_answers_reach_google_v1, 2026-10-15). The three steps said the answer goes on the Google
// listing and turned Done on save while nothing sent it anywhere. Now: read → write → read back; Done only on a match;
// a refusal the client fixes reopens with "Google said" + "How to fix"; anything else is RGA's ("RGA is doing it", RGA
// told once). Step 11's options are Google's own list for the business type; step 10 takes "We don't take bookings
// online". Shapes are the real ones read from RGA's profile on 10-15 (regularHours periods, BOOL attributes,
// url_appointment as a URL attribute).
//
// Google is FAKED (deps): nothing here reaches a real profile. The status line is drawn in Chrome with portal.css.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const G = createRequire(`${SITE}/netlify/functions/`)("./_gbp-profile.js");
const { STEP } = G;

// ── a fake Google ──
function fakeGoogle({ hours = null, attrs = [], offered = [], refuse = null, linkStatus = 200, saveDifferent = false } = {}) {
  const w = { calls: [], state: { hours, attrs: [...attrs] } };
  w.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    w.calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (!url.startsWith("https://mybusinessbusinessinformation.googleapis.com/")) return res(linkStatus, {});   // the link check
    if (refuse && method === "PATCH") return res(refuse.status, { error: { status: refuse.code, message: refuse.message } });
    if (/\/attributes\?parent=/.test(url)) return res(200, { attributeMetadata: offered });
    if (/\/attributes(\?attributeMask=.*)?$/.test(url)) {
      if (method === "PATCH") {
        const mask = decodeURIComponent(url.split("attributeMask=")[1] || "").split(",");
        const keep = w.state.attrs.filter((a) => !mask.includes(a.name));
        w.state.attrs = [...keep, ...JSON.parse(init.body).attributes];
        if (saveDifferent) w.state.attrs = [];
        return res(200, {});
      }
      return res(200, { name: "locations/1/attributes", attributes: w.state.attrs });
    }
    if (method === "PATCH") { const b = JSON.parse(init.body); w.state.hours = saveDifferent ? { periods: [] } : b.regularHours; return res(200, {}); }
    return res(200, { regularHours: w.state.hours });
  };
  w.deps = { fetch: w.fetch, token: "tok", loc: "locations/1" };
  w.writes = () => w.calls.filter((c) => c.method === "PATCH");
  return w;
}
const P = (d, o, c) => ({ openDay: d, openTime: o, closeDay: d, closeTime: c });
const RGA_HOURS = { periods: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((d) => P(d, { hours: 9 }, { hours: 18 })) };
const DAYS = (o) => ({ mon: o, tue: o, wed: o, thu: o, fri: o, sat: { closed: true }, sun: { closed: true } });
const OFFERED = [
  { parent: "attributes/is_owned_by_women", valueType: "BOOL", displayName: "Identifies as women-owned" },
  { parent: "attributes/offers_online_appointments", valueType: "BOOL", displayName: "Online appointments" },
  { parent: "attributes/url_appointment", valueType: "URL", displayName: "Appointment links" },
  { parent: "attributes/preferred_messaging_service", valueType: "ENUM", displayName: "Messaging" },
];

// ── 1 · hours ──
{
  const r0 = G.hoursFromGoogle(RGA_HOURS);
  if (r0.days.mon.open !== "09:00" || r0.days.mon.close !== "18:00" || !r0.days.sat.closed) fail(`Google's hours don't read into the form (${JSON.stringify(r0.days.mon)})`);
  const split = G.hoursFromGoogle({ periods: [P("MONDAY", { hours: 9 }, { hours: 12 }), P("MONDAY", { hours: 13 }, { hours: 17 })] });
  if (!split.split.includes("mon")) fail("a day with two openings on Google isn't flagged (saving would silently merge it)");
  const night = G.periodsFromDays({ fri: { open: "18:00", close: "02:00" } });
  if (night[0]?.closeDay !== "SATURDAY") fail("hours past midnight don't close on the next day");
  const w = fakeGoogle({ hours: RGA_HOURS });
  const out = await G.applyForStep(STEP.HOURS, { days: DAYS({ open: "09:00", close: "17:30" }), holidays: [], oneOffs: [] }, w.deps);
  const wr = w.writes();
  if (out.state !== "on_google" || wr.length !== 1) fail(`hours didn't go on Google and read back (${out.state}, ${wr.length} writes)`);
  if (!/updateMask=regularHours$/.test(wr[0]?.url || "")) fail(`hours with no closures touched Google's special hours (${wr[0]?.url})`);
  if (JSON.stringify(wr[0]?.body.regularHours.periods[0]) !== JSON.stringify(P("MONDAY", { hours: 9 }, { hours: 17, minutes: 30 }))) fail(`Monday was sent as ${JSON.stringify(wr[0]?.body.regularHours.periods[0])}`);
  if (out.before?.mon?.close !== "18:00" || out.after?.mon?.close !== "17:30") fail("the before → after record is wrong");
  const w2 = fakeGoogle({ hours: RGA_HOURS });
  await G.applyForStep(STEP.HOURS, { days: DAYS({ open: "09:00", close: "17:00" }), holidays: ["christmas"], oneOffs: [{ from: "2026-12-26", to: "2026-12-31", label: "" }] }, w2.deps);
  const sp = w2.writes()[0]?.body.specialHours?.specialHourPeriods || [];
  if (!/updateMask=regularHours,specialHours$/.test(w2.writes()[0]?.url || "") || !sp.some((p) => p.endDate?.day === 31) || !sp.every((p) => p.closed === true)) fail("the client's closures don't reach Google's special hours as closed dates");
  const w3 = fakeGoogle({ hours: RGA_HOURS, saveDifferent: true });
  if ((await G.applyForStep(STEP.HOURS, { days: DAYS({ open: "09:00", close: "17:00" }) }, w3.deps)).state !== "with_rga") fail("a read-back that doesn't match still reads as on Google");
  const w4 = fakeGoogle({ hours: RGA_HOURS, refuse: { status: 403, code: "PERMISSION_DENIED", message: "The caller does not have permission" } });
  const o4 = await G.applyForStep(STEP.HOURS, { days: DAYS({ open: "09:00", close: "17:00" }) }, w4.deps);
  if (o4.state !== "with_rga" || o4.said) fail("a permission refusal is handed to the client (it's RGA's to fix)");
}

// ── 2 · booking link ──
{
  const w = fakeGoogle();
  const none = await G.applyForStep(STEP.BOOKING, { none: true }, w.deps);
  if (none.state !== "not_sent" || w.calls.length) fail("\"We don't take bookings online\" reached Google, or didn't settle");
  const bad = fakeGoogle({ linkStatus: 404, offered: OFFERED });
  const b = await G.applyForStep(STEP.BOOKING, "https://example.com/gone", bad.deps);
  if (b.state !== "needs_client" || !b.said || !b.fix || bad.writes().length) fail(`a link that doesn't open was sent to Google, or came back without how to fix it (${JSON.stringify(b)})`);
  const ok = fakeGoogle({ offered: OFFERED });
  const o = await G.applyForStep(STEP.BOOKING, "https://www.rocketgrowthagency.com/contact/", ok.deps);
  const wr = ok.writes()[0];
  if (o.state !== "on_google" || !/attributeMask=attributes%2Furl_appointment$/.test(wr?.url || "") || wr?.body.attributes[0]?.uriValues?.[0]?.uri !== "https://www.rocketgrowthagency.com/contact/?utm_source=gbp&utm_medium=booking&utm_campaign=local-seo") fail(`the booking link isn't written as Google's appointment link (${wr?.url})`);
  const bot = fakeGoogle({ linkStatus: 403, offered: OFFERED });
  if ((await G.applyForStep(STEP.BOOKING, "https://example.com/book", bot.deps)).state !== "on_google") fail("a booking page that blocks robots (403) is refused");
  // a permission refusal is RGA's, even when Google's message mentions the link
  const perm = fakeGoogle({ offered: OFFERED, refuse: { status: 403, code: "PERMISSION_DENIED", message: "The caller does not have permission to update url_appointment" } });
  const pr = await G.applyForStep(STEP.BOOKING, "https://example.com/book", perm.deps);
  if (pr.state !== "with_rga" || pr.said) fail("a permission refusal on the booking link is handed to the client (it's RGA's to fix)");
  const ref = fakeGoogle({ offered: OFFERED, refuse: { status: 400, code: "INVALID_ARGUMENT", message: "Invalid uri" } });
  const r = await G.applyForStep(STEP.BOOKING, "https://example.com/book", ref.deps);
  if (r.state !== "needs_client" || !r.fix || /Invalid uri/.test(r.said)) fail("Google refusing the link doesn't come back to the client in plain words with how to fix it");
}

// ── 3 · what's true of the business ──
{
  const opts = G.offeredOptions({ attributeMetadata: OFFERED });
  if (opts.map((o) => o.key).join(",") !== "is_owned_by_women,offers_online_appointments") fail(`step 11 offers links or lists as yes/no details (${opts.map((o) => o.key)})`);
  const w = fakeGoogle({ offered: OFFERED, attrs: [{ name: "attributes/offers_online_appointments", valueType: "BOOL", values: [true] }] });
  const now = await G.readForStep(STEP.ATTRS, w.deps);
  if (JSON.stringify(now.ticked) !== '["offers_online_appointments"]') fail("the form doesn't start from what Google shows");
  const o = await G.applyForStep(STEP.ATTRS, ["is_owned_by_women", "not_offered_thing"], w.deps);
  const wr = w.writes()[0];
  const mask = decodeURIComponent(wr?.url.split("attributeMask=")[1] || "").split(",");
  if (mask.sort().join(",") !== "attributes/is_owned_by_women,attributes/offers_online_appointments") fail(`an unticked detail isn't cleared, or a link is touched (mask ${mask})`);
  if (wr?.body.attributes.length !== 1 || wr.body.attributes[0].name !== "attributes/is_owned_by_women") fail("a detail Google doesn't offer was sent");
  if (o.state !== "on_google" || JSON.stringify(o.after) !== '["is_owned_by_women"]' || o.labels?.is_owned_by_women !== "Identifies as women-owned") fail(`the read-back or labels are wrong (${JSON.stringify(o)})`);
}

// ── 4 · saving settles by the read-back (portal-step-input) ──
const si = read("netlify/functions/portal-step-input.js").replace(/^[ \t]*\/\/.*$/gm, "");
const wires = [
  [/const settled = !push \|\| push\.state === "on_google" \|\| push\.state === "not_sent";/, "the step is Done before Google shows it"],
  [/status: settled \? "done" : push\.state === "with_rga" \? "in_progress" : "pending",/, "a refusal doesn't reopen the step (client) or move it to RGA"],
  [/\.\.\.\(push \? \{ google_push: push \} : \{\}\),/, "where the answer stands on Google isn't recorded on the step"],
  [/rgaToldNow \? tellRga\(/, "RGA isn't told when an answer doesn't reach Google"],
  [/parsed = validate\(\{ \.\.\.spec, options: offered \}, body\.value\);/, "step 11's ticks aren't checked against Google's own list"],
  [/body\.value\.none === true\) parsed = \{ value: \{ none: true \} \};/, "step 10 doesn't take \"We don't take bookings online\""],
];
for (const [re, msg] of wires) if (!re.test(si)) fail(msg);

// ── 4b · the admin: these are the client's, never "Your action", unless Google refused and RGA must fix it ──
{
  const admin = read("admin/admin.js").replace(/^[ \t]*\/\/.*$/gm, "");
  if (!/if \(scope === "month1" && CLIENT_GBP_STEPS\[s\.obj\?\.flowId\] && state\.onboardingData\?\.tasks\?\.\[s\.obj\.flowId\]\?\.google_push\?\.state !== "with_rga"\) \{\s*s\.uiState = "queued"; s\.waitsOnClient = true; continue;/.test(admin)) fail("the admin can name the client's hours / details / booking link as RGA's next action");
  if (!/\.concat\(Object\.entries\(CLIENT_GBP_STEPS\)/.test(admin)) fail("\"Also waiting on the client\" doesn't list the client's hours / details / booking link");
  if (!/s\.waitsOnClient \? '<span class="ob-status active is-wait">Waiting on client<\/span>'/.test(admin)) fail("the admin row doesn't say it's waiting on the client");
}

// ── 5 · the portal ──
const portal = read("portal/portal.js"), pc = portal.replace(/^[ \t]*\/\/.*$/gm, "");
if (!/const theirsToAct = !kickoffPending && !ownWait && !listingWait && !rgaWait && !gbpWithRga && /.test(pc)) fail("a step RGA is finishing still says \"Your turn\"");
if (!/\$\{gbpPushHtml\(step, taskState(?:, \{ maps: [^}]*\})?\)\}/.test(pc) || !/loadGbpNow\(clientId\);/.test(pc)) fail("the row doesn't show where the answer stands on Google, or doesn't read Google first");
if (/60%\+/.test(read("data/playbooks/client-steps.json"))) fail("step 11's unsourced \"60%+\" claim is back");
// 🔑 start at the BODY's brace (") {"): a default parameter like `opts = {}` has braces of its own (10-16)
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf(") {", m.index) + 2; k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
// 🔑 10-16: gbpPushHtml also draws step 7's progress and step 9's card, so their helpers ride along
const lifted = [line("_editingSteps"), line("FACT_WORDS"), line("siteShow"), pick(/^function factsSummary\(/m), pick(/^function fmtDateTimeDot\(/m), pick(/^function hoursCardHtml\(/m), pick(/^function escapeAttribute\(/m), pick(/^function escapeHtml\(/m), pick(/^function hoursSummary\(/m), pick(/^function gbpPushHtml\(/m), line("EDIT_IN_PLACE"), line("BK_NOUN"), pick(/^function bookingCardHtml\(/m), pick(/^function googleCardHtml\(/m), line("gcardMaps"), line("GBP_STEPS"), line("GBP_THING"), line("GBP_DAY"), line("hm12"), line("monthDay"), line("GOOGLE_G")];
if (lifted.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a portal helper moved (${lifted.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: read("portal/portal.css") });
  await page.addScriptTag({ content: lifted.join("\n") });
  const r = await page.evaluate(() => {
    const draw = (id, g) => { const h = document.getElementById("h"); h.innerHTML = gbpPushHtml({ id }, { google_push: g }); return h.innerText.replace(/\s+/g, " ").trim(); };
    const days = { mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" }, wed: { open: "09:00", close: "18:00" }, thu: { open: "09:00", close: "18:00" }, fri: { open: "09:00", close: "18:00" }, sat: { closed: true }, sun: { closed: true } };
    return {
      sum: hoursSummary(days),
      on: draw("m1.gbp.hours_attributes", { state: "on_google", after: days, at: "2026-10-15T16:00:00Z" }),
      rga: draw("m1.gbp.booking_link", { state: "with_rga", error: "403" }),
      fix: draw("m1.gbp.booking_link", { state: "needs_client", said: "This link doesn't open.", fix: "Paste the public link." }),
      attrs: draw("m1.gbp.attributes", { state: "on_google", after: ["is_owned_by_women"], labels: { is_owned_by_women: "Identifies as women-owned" }, at: "2026-10-15T16:00:00Z" }),
      other: draw("m1.kickoff.call", { state: "on_google" }),
    };
  });
  if (r.sum !== "Mon–Fri 9 AM–6 PM · Sat–Sun closed") fail(`the hours summary reads "${r.sum}"`);
  // (the small label is uppercase by CSS, so the match ignores case)
  // 🔒 one_google_card_v1: the summary, then "Checked on Google <date>" in the card's bottom line
  if (!/^✓ On your Google Business Profile Your hours Mon–Fri 9 AM–6 PM · Sat–Sun closed Checked on Google Oct 15$/i.test(r.on)) fail(`a verified step doesn't say it's on Google (${r.on})`);
  if (!/^Going on your Google profile Your booking link .*nothing needed from you\.$/i.test(r.rga) || /403/.test(r.rga)) fail(`RGA's fix doesn't read "Going on your Google profile", or shows Google's raw text (${r.rga})`);
  if (!/^Google said This link doesn't open\. How to fix: Paste the public link\. Fix it$/i.test(r.fix)) fail(`a refusal the client fixes doesn't read Google said + How to fix (${r.fix})`);
  if (!/Identifies as women-owned/.test(r.attrs)) fail("step 11's verified details aren't named");
  if (r.other) fail("a step that doesn't go on Google draws a Google line");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 a profile answer can read Done without being on Google:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ steps 8 / 10 / 11 put the answer on Google and read it back (hours + closures, the appointment link after a link check, Google's own yes/no list with unticked ones cleared); Done only on a match; the client fixes what's theirs (Google said + How to fix), RGA the rest (told once); \"We don't take bookings online\" settles with nothing sent");
