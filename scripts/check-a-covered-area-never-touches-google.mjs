#!/usr/bin/env node
// check-a-covered-area-never-touches-google.mjs — 2026-10-29, approved step4_done_in_portal_v2. Chris: "make it the best it can be
// so it doesnt trigger google to ask client to reverify". A service-area place inside a city that's ALREADY on the profile is
// COVERED (Google already shows the business there): nothing is sent to Google and the step finishes from the read alone.
// RUNS the real code against a fake Google (no network, no database):
//   · _gbp-area-cover: Mar Vista (a neighborhood whose city is Los Angeles, which is on the list) → covered by "Los Angeles, CA, USA";
//     Inglewood (its own city) → to_add; a "Los Angeles" in ANOTHER state doesn't cover; a shop called "Palms" isn't a place;
//     no key / no answer → unknown (fail closed); a place Google already lists → on_google; a ZIP inside a listed city → covered
//   · _gbp-facts.rgaDone: true only when every place is on Google or covered; one unknown keeps the step open
//   · the nightly watch (factsOnly, as "Check Google now" runs it): looks the places up, finishes the step, records "Nothing was
//     sent to Google", and makes NO write to Google (no PATCH, no POST to the profile)
//   · _gbp-facts.factsDrift: a covered place isn't "changed on Google"; a real change still is, and the card shows it (admin driftHtml)
//   · admin step 28 draws card A (approved): "All 3 areas are already covered", "Inside Los Angeles", "Nothing was sent to Google",
//     no "Open Google Business Profile"; the client portal draws the covered chip ("Mar Vista · in Los Angeles")
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let C, GF, W;
try { C = req(`${SITE}/netlify/functions/_gbp-area-cover.js`); GF = req(`${SITE}/netlify/functions/_gbp-facts.js`); W = req(`${SITE}/netlify/functions/_gbp-watch.js`); }
catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };

// ── a fake Google place list, in the Places API (New) shape ───────────────────────────────────────
const ac = (types, longText, shortText = longText) => ({ types, longText, shortText });
const PL = {
  "Mar Vista": { id: "p-mv", displayName: { text: "Mar Vista" }, types: ["neighborhood", "political"], formattedAddress: "Mar Vista, Los Angeles, CA, USA",
    addressComponents: [ac(["neighborhood", "political"], "Mar Vista"), ac(["locality", "political"], "Los Angeles"), ac(["administrative_area_level_1", "political"], "California", "CA"), ac(["country", "political"], "United States", "US")] },
  "Palms": { id: "p-pa", displayName: { text: "Palms" }, types: ["neighborhood", "political"], formattedAddress: "Palms, Los Angeles, CA, USA",
    addressComponents: [ac(["neighborhood", "political"], "Palms"), ac(["locality", "political"], "Los Angeles"), ac(["administrative_area_level_1", "political"], "California", "CA")] },
  "Playa Vista": { id: "p-pv", displayName: { text: "Playa Vista" }, types: ["neighborhood", "political"], formattedAddress: "Playa Vista, Los Angeles, CA, USA",
    addressComponents: [ac(["neighborhood", "political"], "Playa Vista"), ac(["locality", "political"], "Los Angeles"), ac(["administrative_area_level_1", "political"], "California", "CA")] },
  "Inglewood": { id: "p-in", displayName: { text: "Inglewood" }, types: ["locality", "political"], formattedAddress: "Inglewood, CA, USA",
    addressComponents: [ac(["locality", "political"], "Inglewood"), ac(["administrative_area_level_1", "political"], "California", "CA")] },
  "90066": { id: "p-zip", displayName: { text: "90066" }, types: ["postal_code"], formattedAddress: "Los Angeles, CA 90066, USA",
    addressComponents: [ac(["postal_code"], "90066"), ac(["locality", "political"], "Los Angeles"), ac(["administrative_area_level_1", "political"], "California", "CA")] },
  "Shopsville": { id: "p-shop", displayName: { text: "Shopsville" }, types: ["restaurant", "food"], formattedAddress: "1 Main St, Los Angeles, CA",
    addressComponents: [ac(["locality", "political"], "Los Angeles"), ac(["administrative_area_level_1", "political"], "California", "CA")] },
  "Austin Heights": { id: "p-ah", displayName: { text: "Austin Heights" }, types: ["neighborhood", "political"], formattedAddress: "Austin Heights, Los Angeles, TX, USA",
    addressComponents: [ac(["neighborhood", "political"], "Austin Heights"), ac(["locality", "political"], "Los Angeles"), ac(["administrative_area_level_1", "political"], "Texas", "TX")] },
};
const calls = [];
const placesFetch = async (url, init) => {
  calls.push({ url: String(url), method: (init && init.method) || "GET" });
  if (!String(url).includes("places.googleapis.com")) throw new Error("gate: unexpected call " + url);
  const q = JSON.parse(init.body).textQuery.split(",")[0].trim();
  return new Response(JSON.stringify({ places: PL[q] ? [PL[q]] : [] }), { status: 200 });
};
const AREA = ["El Segundo, CA, USA", "Culver City, CA, USA", "Los Angeles, CA, USA", "Santa Monica, CA, USA", "Manhattan Beach, CA, USA", "Marina Del Rey, CA 90292, USA"];
const now = { area: AREA, state: "CA", region: "US", name: "Rocket Growth Agency", come: false };

// ── 1 · areaCover ──────────────────────────────────────────────────────────────────────────────
const cov = await C.areaCover(["Mar Vista", "Palms", "Playa Vista", "Inglewood", "Shopsville", "Culver City", "90066", "Nowhere"], now, { fetch: placesFetch, key: "k", now: Date.parse("2026-10-29T15:00:00Z") });
const st = Object.fromEntries(cov.items.map((x) => [x.name, x]));
for (const n of ["Mar Vista", "Palms", "Playa Vista"]) if (st[n].state !== "covered" || st[n].by !== "Los Angeles, CA, USA") fail(`${n} (a Los Angeles neighborhood) isn't covered by "Los Angeles, CA, USA" (got ${st[n].state} ${st[n].by || ""})`);
if (st["90066"].state !== "covered") fail("a ZIP inside Los Angeles isn't covered");
if (st.Inglewood.state !== "to_add") fail(`Inglewood (its own city, not on the list) should be to_add, got ${st.Inglewood.state}`);
if (st.Shopsville.state !== "unknown") fail(`a business that happens to match ("Shopsville", a restaurant) was taken as a place (${st.Shopsville.state})`);
if (st["Culver City"].state !== "on_google") fail("a place Google already lists isn't on_google");
if (st.Nowhere.state !== "unknown") fail("a place Google can't find isn't unknown (fail closed)");
if (!st.Nowhere.why) fail("a place Google can't find doesn't say why (Google's reason must be kept on it)");
if (/key=k\b|"k"/.test(JSON.stringify(cov))) fail("the Places key leaked into what's saved on the step");
const tx = await C.areaCover(["Austin Heights"], now, { fetch: placesFetch, key: "k" });
if (tx.items[0].state === "covered") fail("a place in Los Angeles, TEXAS was counted as covered by Los Angeles, CA");
const nokey = await C.areaCover(["Mar Vista"], now, { fetch: placesFetch, key: "" });
if (nokey.items[0].state !== "unknown") fail("with no Places key a place was decided anyway (it must stay unknown)");

// ── 2 · rgaDone ────────────────────────────────────────────────────────────────────────────────
const task0 = { status: "in_progress", client_input: { name: "Rocket Growth Agency", come: "no", area: { keep: AREA, add: ["Mar Vista", "Palms", "Playa Vista"] } },
  google_push: { state: "with_rga", rga: [{ fact: "area", add: ["Mar Vista", "Palms", "Playa Vista"], remove: [] }] } };
const allCov = { ...task0, google_push: { ...task0.google_push, area_cover: await C.areaCover(["Mar Vista", "Palms", "Playa Vista"], now, { fetch: placesFetch, key: "k" }) } };
if (!GF.rgaDone(allCov, now)) fail("every place covered, but the step isn't done");
if (GF.rgaDone({ ...task0, google_push: { ...task0.google_push, area_cover: { at: "x", items: [{ name: "Mar Vista", state: "covered", by: "Los Angeles, CA, USA" }, { name: "Palms", state: "unknown" }, { name: "Playa Vista", state: "covered", by: "Los Angeles, CA, USA" }] } } }, now))
  fail("one place unknown, but the step finished (it must fail closed)");
if (GF.rgaDone(task0, now)) fail("no lookup at all, but the step finished");

// ── 3 · the watch (as "Check Google now" runs it) ──────────────────────────────────────────────
{ const google = []; let written = null; const records = [];
  const bi = { title: "Rocket Growth Agency", phoneNumbers: { primaryPhone: "(424) 242-2040" }, websiteUri: "https://www.rocketgrowthagency.com/",
    serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY", regionCode: "US", places: { placeInfos: AREA.map((n, i) => ({ placeName: n, placeId: `id${i}` })) } }, metadata: { mapsUri: "https://maps.google.com/?cid=1", hasVoiceOfMerchant: true } };
  const fetchAll = async (url, init = {}) => {
    const u = String(url), m = init.method || "GET";
    if (u.includes("places.googleapis.com")) return placesFetch(url, init);
    google.push(m);
    if (m !== "GET") return new Response("{}", { status: 500 });
    return new Response(JSON.stringify(bi), { status: 200 });
  };
  const out = await W.watchClient("c1", { factsOnly: true, supa: async () => [], now: () => Date.parse("2026-10-29T15:00:00Z"), fetch: fetchAll, places: { key: "k" },
    readStepRecord: async (_s, _c, id) => ({ tasks: { [id]: JSON.parse(JSON.stringify(task0)) } }),
    writeStepTasks: async (_s, _r, tasks) => { written = tasks; return { tasks }; }, notifyRga: async () => {}, record: async (o) => records.push(o),
    connect: async () => ({ token: "t", loc: "locations/1" }) }).catch((e) => ({ errors: [{ error: e.message }] }));
  const t = written && written["m1.gbp.business_facts"];
  if ((out.errors || []).length) fail(`the watch errored: ${out.errors[0].error}`);
  if (google.some((m) => m !== "GET")) fail(`Check Google now WROTE to Google (${google.join(", ")}) — a covered place must never be sent`);
  if (!t || t.status !== "done" || t.google_push.state !== "on_google") fail(`all 3 covered, but the step didn't finish (${t ? `${t.status} / ${t.google_push.state}` : "nothing written"})`);
  if (t && !(t.google_push.progress.items || []).every((x) => x.covered_by === "Los Angeles, CA, USA")) fail("the progress items don't say which city covers each place");
  const r = records.find((x) => x.kind === "gbp_facts_matched");
  if (!r || !/Nothing was sent to Google/.test(r.summary) || !/Mar Vista is in Los Angeles/.test(r.summary)) fail(`the record doesn't say nothing was sent and why (${r && r.summary})`);
}

// ── 4 · admin card A + the client's covered chip ───────────────────────────────────────────────
const AJS = read("admin/admin.js"), PJS = read("portal/portal.js");
const lift = (src, name) => { const m = new RegExp(`^(?:const ${name} = |function ${name}\\()`, "m").exec(src); if (!m) return null;
  const lines = src.slice(m.index).split("\n"); let depth = 0, out = []; for (const l of lines) { out.push(l); for (const ch of l) { if (ch === "{" || ch === "(") depth++; else if (ch === "}" || ch === ")") depth--; } if (depth <= 0 && /[;}`]\s*$/.test(l)) break; } return out.join("\n"); };
const parts = ["ZC_PIN", "areaCoveredItems", "areaCoveredCardHtml"].map((n) => lift(AJS, n));
if (parts.some((x) => !x)) { console.error("⚠️  INDETERMINATE — admin card A moved"); process.exit(2); }
const ctx = { OL_G: "<svg data-g></svg>", escapeHtml: (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  adminGcardWhen: () => "Oct 29, 8:00 AM" };
vm.createContext(ctx); vm.runInContext(parts.join("\n") + "\nthis.card = areaCoveredCardHtml;", ctx);
const gA = { state: "on_google", area_now: AREA, area_cover: { at: "2026-10-29T15:00:00Z" }, progress: { items: ["Mar Vista", "Palms", "Playa Vista"].map((n) => ({ kind: "area", name: n, on: true, covered_by: "Los Angeles, CA, USA" })) } };
const html = ctx.card(gA);
if (!/All 3 areas are already covered/.test(html)) fail("admin card A doesn't say 'All 3 areas are already covered'");
if ((html.match(/Inside <em>Los Angeles<\/em>, which is already on their Google profile\./g) || []).length !== 3) fail("admin card A doesn't say each place is inside Los Angeles");
if (!/Done · no Google change/.test(html) || !/Nothing was sent to Google/.test(html) || !/<b>6<\/b> places · unchanged/.test(html)) fail("admin card A is missing 'Done · no Google change', 'Nothing was sent to Google' or '6 places · unchanged'");
if (/Open Google Business Profile|Mark step complete/.test(html)) fail("admin card A still sends RGA to Google Business Profile or offers Mark step complete");
if (!/g\.state === "on_google" && areaCoveredItems\(g\)\.length \? areaCoveredCardHtml\(g\)/.test(AJS)) fail("admin step 28's done card doesn't use card A when places are covered");
if (!/x\.covered_by \? `<span class="pm-fxt-pl cov">[^`]*· in \$\{escapeHtml\(placeName\(x\.covered_by\)\)\}/.test(PJS)) fail("the client portal doesn't draw a covered place as 'Mar Vista · in Los Angeles'");
if (!/\.pm-fxt-pl\.cov \{[^}]*var\(--state-ok-bg\)/.test(read("portal/portal.css"))) fail("the covered chip isn't green (.pm-fxt-pl.cov)");
// both callers give the watch the Places key (the nightly AND Check Google now)
for (const f of ["netlify/functions/admin-google-check.js", "netlify/functions/gbp-profile-watch.js"])
  if (!/places: process\.env\.GOOGLE_PLACES_API_KEY \? \{ key: process\.env\.GOOGLE_PLACES_API_KEY \} : null/.test(read(f))) fail(`${f} doesn't give the watch the Places key (covered places would never be decided)`);

// ── 4b · billing safety: a FAILED lookup isn't retried every night (feedback_google_cloud_billing_safety) ──
{ const NOW = Date.parse("2026-10-29T15:00:00Z"), fresh = { at: "2026-10-29T10:00:00Z", items: [{ name: "Mar Vista", state: "unknown", why: "places 403 PERMISSION_DENIED" }] };
  if (C.coverStale(fresh, ["Mar Vista"], NOW, false)) fail("the NIGHTLY re-looks up a place that failed today (a failed lookup retried every night is how both Google bills happened)");
  if (!C.coverStale(fresh, ["Mar Vista"], NOW, true)) fail("Check Google now doesn't retry a place that failed");
  if (!C.coverStale({ ...fresh, at: "2026-10-20T10:00:00Z" }, ["Mar Vista"], NOW, false)) fail("a lookup over a week old is never refreshed");
  if (!/C\.coverStale\(task\.google_push\.area_cover, areaItem\.add, nowMs, !!d\.factsOnly\)/.test(read("netlify/functions/_gbp-watch.js"))) fail("the watch doesn't tell the lookup whether a person pressed Check Google now");
  if (C.whyPlain("places 403 PERMISSION_DENIED x · geocode 200 REQUEST_DENIED This API is not activated") !== "RGA's Google key isn't allowed to use Places (New) · Geocoding is switched off in RGA's Google Cloud project") fail("Google's reason isn't put in one plain line");
}

// ── 5 · card B + the five checks (admin-gbp-area-add) ─────────────────────────────────────────────
{ let AD; try { AD = req(`${SITE}/netlify/functions/admin-gbp-area-add.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  const task = { google_push: { area_cover: { items: [{ name: "Inglewood", state: "to_add", place_id: "p-in", google: "Inglewood, CA, USA" }, { name: "Mar Vista", state: "covered", by: "Los Angeles, CA, USA" }, { name: "Nowhere", state: "unknown" }] } } };
  const raw = { metadata: { hasVoiceOfMerchant: true }, serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY", places: { placeInfos: AREA.map((n, i) => ({ placeName: n, placeId: `id${i}` })) } } };
  const NOW = Date.parse("2026-10-29T15:00:00Z");
  const ok = AD.checksFor(task, raw, NOW, { ok: true });
  if (!ok.checks.every((c) => c.ok) || ok.checks.length !== 5) fail(`five clean checks didn't all pass (${ok.checks.map((c) => `${c.key}:${c.ok}`).join(" ")})`);
  const sent = ok.body.serviceArea.places.placeInfos;
  if (sent.length !== AREA.length + 1 || !AREA.every((n, i) => sent[i].placeId === `id${i}` && sent[i].placeName === n)) fail("the change doesn't keep every place already on Google exactly (name + place id)");
  if (!sent.some((x) => x.placeId === "p-in") || sent.some((x) => /Mar Vista|Nowhere/.test(x.placeName))) fail("the change sends a covered or unknown place, or drops the one to add");
  const bad = (t, r, test, key) => { const c = AD.checksFor(t, r, NOW, test).checks.find((x) => x.key === key); return c && !c.ok; };
  if (!bad(task, { ...raw, metadata: { hasVoiceOfMerchant: false } }, { ok: true }, "verified")) fail("an unverified profile passes the verified check");
  if (!bad(task, { ...raw, metadata: { hasVoiceOfMerchant: true, hasPendingEdits: true } }, { ok: true }, "verified")) fail("Google's own pending edits pass the verified check");
  if (!bad({ google_push: { ...task.google_push, last_core_at: "2026-10-26T15:00:00Z" } }, raw, { ok: true }, "week")) fail("a core change 3 days ago passes the one-change-a-week check");
  if (!bad(task, raw, { ok: false, why: "x" }, "test")) fail("a refused test run passes");
  const many = { google_push: { area_cover: { items: Array.from({ length: 16 }, (_, i) => ({ name: `P${i}`, state: "to_add", place_id: `q${i}` })) } } };
  if (AD.checksFor(many, raw, NOW, { ok: true }).add.length > 3) fail("more than 3 places go in one change");
  const AD_SRC = read("netlify/functions/admin-gbp-area-add.js");
  if (!/if \(dry\) return json\(200/.test(AD_SRC) || !/if \(passed !== checks\.length\) return json\(409/.test(AD_SRC)) fail("the add runs without all five checks (or the dry run can write)");
  if (!/updateMask=serviceArea&validateOnly=true/.test(AD_SRC) || [...AD_SRC.matchAll(/\$\{conn\.loc\}\?updateMask=([A-Za-z,]+)/g)].map((m) => m[1]).join("|") !== "serviceArea|serviceArea") fail("the test run isn't validateOnly, or another field can change");
  if (!/rv && rv\.state === "lost"/.test(AD_SRC)) fail("the add doesn't wait while Google wants the business verified again");
  const partsB = ["areaAddCardHtml"].map((n) => lift(AJS, n));   // ZC_PIN is already in the context (card A)
  if (partsB.some((x) => !x)) { console.error("⚠️  INDETERMINATE — card B moved"); process.exit(2); }
  vm.runInContext(partsB.join("\n") + "\nthis.cardB = areaAddCardHtml;", ctx);
  const hb = ctx.cardB({ rga: [{ fact: "area", add: ["Inglewood", "Nowhere"] }], area_now: AREA, area_cover: task.google_push.area_cover });
  if (!/Add 1 area to their Google service area/.test(hb) || !/<b>6 → 7<\/b> places/.test(hb) || !/Google knows it as <em>Inglewood, CA, USA<\/em>/.test(hb) || !/\+ New/.test(hb)) fail("card B doesn't show the place to add (title, 6 → 7, Google's name, + New)");
  if (!/Couldn't look it up in Google's place list/.test(hb) || !/Not looked up/.test(hb)) fail("card B hides a place it couldn't look up");
  if (!/data-zc-checks/.test(hb) || !/data-zc-add disabled>Add it on Google/.test(hb) || !/Do it in Google Business Profile instead ↗/.test(hb)) fail("card B: the checks, the disabled-until-checked Add button, or the escape hatch is missing");
  if (/Mark step complete|Done by hand on purpose/.test(hb)) fail("card B still has the old hand-tick / 'done by hand' wording");
  if (!/g\.state === "with_rga" && \(g\.rga \|\| \[\]\)\.length && g\.rga\.every\(\(x\) => x\.fact === "area" && Array\.isArray\(x\.add\)\) \? areaAddCardHtml\(g\)/.test(AJS)) fail("step 28 still draws the old 'change it in Google Business Profile' card for an area-only change (card B)");
  if (!/const doneBtn = zcWaits(?: \|\| siteStep)? \? "" :/.test(AJS)) fail("step 28 still offers Mark step complete while places wait on Google");
  if (!/body: JSON\.stringify\(\{ client_id: c\.id, dry: true \}\)/.test(AJS) || !/if \(add\) add\.disabled = !all;/.test(AJS)) fail("card B doesn't fill its checks from the dry run, or enables Add without all five");
}

// ── after the step is done: a covered place isn't a change on Google (night of 10-30: RGA's own step 28 finished with "Nothing was sent to
//    Google", and the next nightly said "The service area on Google isn't what the client saved" and offered to put it back) ──
for (const [area, place, by] of [[["Los Angeles, CA, USA", "Culver City, CA, USA"], "Mar Vista", "Los Angeles, CA, USA"], [["London, UK", "Croydon, UK"], "Camden", "London, UK"]]) {
  const push = (st) => ({ google_push: { state: "on_google", confirmed: { area: [...area, place] }, area_cover: { items: [{ name: place, state: st, ...(st === "covered" ? { by } : {}) }] } } });
  if (GF.factsDrift(push("covered"), { area })) fail(`a covered place (${place}) reads as a change on Google`);
  for (const st of ["to_add", "unknown"]) if (!GF.factsDrift(push(st), { area })) fail(`a place that's ${st} (${place}) and not on Google isn't noticed`);
  const gone = GF.factsDrift(push("covered"), { area: area.slice(1) });
  if (!gone || gone.what !== "service area") fail(`a city dropped from Google (${area[0]}) isn't noticed because a place inside it is covered`);
  else if (gone.saved["service area"] !== area.join(", ")) fail(`the card offers to put back a place that was never on Google (${gone.saved["service area"]})`);
}
// the amber card: what the client saved and what Google shows are on it, and it closes every box it opens (one </div> too many threw the row's Undo and pill out of the row)
{
  const parts3 = ["G_ICON", "adminGoogleCardHtml", "GBP_DRIFT_STEPS", "driftHtml"].map((n) => lift(AJS, n));
  if (parts3.some((x) => !x)) { console.error("⚠️  INDETERMINATE — the changed-on-Google card moved"); process.exit(2); }
  const cd = { ...ctx, escapeAttribute: ctx.escapeHtml, state: { onboardingData: { tasks: {} } } };
  vm.createContext(cd); vm.runInContext(parts3.join("\n") + "\nthis.drift = driftHtml;", cd);
  const dr = (saved, google) => cd.drift({ google_drift: { what: "x", at: "2026-10-30T10:30:00Z", saved, google } }, {});
  const one = dr({ "service area": "Los Angeles, Culver City" }, { "service area": "Culver City" });
  if (!/<b>Saved by the client:<\/b> Los Angeles, Culver City</.test(one) || !/<b>Google shows now:<\/b> Culver City</.test(one)) fail("the changed-on-Google card doesn't show the business fact the client saved, or what Google shows");
  const two = dr({ phone: "(424) 555-0100", website: "https://a.test/" }, { phone: null, website: "https://b.test/" });
  if (!/phone: \(424\) 555-0100 · website: https:\/\/a\.test\//.test(two) || !/phone: nothing · website: https:\/\/b\.test\//.test(two)) fail("with several facts changed, the card doesn't name each one (or a fact Google no longer shows isn't \"nothing\")");
  if (!/Mon closed/.test(dr({ days: { mon: { closed: true } } }, { days: {} })) || !/<b>Saved by the client:<\/b> https:\/\/x\.test</.test(dr("https://x.test", null))) fail("the card stopped showing hours or a booking link");
  if ((one.match(/<div\b/g) || []).length !== (one.match(/<\/div>/g) || []).length) fail("the changed-on-Google card doesn't close every <div> it opens, so the row's pill and Undo fall out of the row");
}

if (F.length) { console.error(`🔴 a covered area could touch Google, or the step can't tell:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ a covered area never touches Google: Los Angeles neighborhoods + a ZIP are covered, Inglewood is to add, a shop and a Texas namesake aren't, no key = unknown; the step finishes from the read with no write; admin card A + the client's covered chip");
