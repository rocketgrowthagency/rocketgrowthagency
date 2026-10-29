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

if (F.length) { console.error(`🔴 a covered area could touch Google, or the step can't tell:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ a covered area never touches Google: Los Angeles neighborhoods + a ZIP are covered, Inglewood is to add, a shop and a Texas namesake aren't, no key = unknown; the step finishes from the read with no write; admin card A + the client's covered chip");
