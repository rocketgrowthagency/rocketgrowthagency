#!/usr/bin/env node
// check-step-7-works-in-any-state.mjs — "Check your business on Google" runs end to end for a business in TEXAS and one in
// NEW YORK, not just RGA in California: Google's read → what they told us → step 5's targets → the portal card → the answer →
// the write + read back → the client record → the nightly progress → done / "Google doesn't list it" → admin's checklist.
//
// 🔒 WHY (Chris 10-16): "make sure if a company is in texas or new york that it will work for them too. test that". Found while
// writing it: a place matched by name only, so "Williamsburg" (Brooklyn, NY) matched "Williamsburg, VA" — a place in the wrong
// state could tick a client's area done. Now when both names carry a state, the state must agree. Google and the database are
// FAKED here; nothing reaches a real profile or a real client.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let X, M;
try { X = req("./_gbp-facts.js"); M = req("./admin-gbp-facts-area.js").markMissing; } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── the portal's own renderer and note, and admin's checklist, lifted ──
const portal = read("portal/portal.js"), admin = read("admin/admin.js");
const p0 = portal.indexOf("const FACT_WORDS = {"), p1 = portal.indexOf("async function loadGbpNow(clientId) {");
const n0 = portal.indexOf("function factsNoteHtml(t) {"), n1 = portal.indexOf("\n}\n", n0);
const a0 = admin.indexOf("function areaChecklistHtml(g) {"), a1 = admin.indexOf("\n}\n", a0);
if (p0 < 0 || p1 < p0 || n0 < 0 || a0 < 0) { console.error("⚠️  INDETERMINATE — could not lift the renderers"); process.exit(2); }
// portalStepNo (10-20): client numbers come from the playbook; the lift has none, so a fixed one
const ctx = { escapeHtml: esc, escapeAttribute: esc, Date, portalStepNo: () => 5, seeStepText: () => "See step 4 →" };
vm.createContext(ctx);
vm.runInContext(`${portal.slice(p0, p1)}\n${portal.slice(n0, n1 + 2)}\n${admin.slice(a0, a1 + 2)}\nthis.rows = factsRowsHtml; this.note = factsNoteHtml; this.check = areaChecklistHtml;`, ctx);

// ── a fake Google for one business ──
function fakeGoogle(loc) {
  const w = { loc: JSON.parse(JSON.stringify(loc)), patches: [] };
  w.fetch = async (url, init = {}) => {
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if ((init.method || "GET") === "PATCH") { const b = JSON.parse(init.body); w.patches.push(b); if (b.phoneNumbers) w.loc.phoneNumbers = b.phoneNumbers; if (b.websiteUri) w.loc.websiteUri = b.websiteUri; return res(200, {}); }
    return res(200, w.loc);
  };
  w.deps = { fetch: w.fetch, token: "t", loc: "locations/1" };
  return w;
}
const places = (...n) => ({ placeInfos: n.map((placeName) => ({ placeName })) });
const plan = (...locs) => ({ "m1.strategy.keywords_locations": { outcome_data: { draft: `keywords:\n  - term: x\nlocations:\n${locs.map((l) => `  - ${l} (why)`).join("\n")}\n` } } });

// ═══ TEXAS: a roofer in Austin — a storefront that ALSO serves an area, ZIP codes in the mix ═══
{
  const google = { title: "Lone Star Roofing", phoneNumbers: { primaryPhone: "(512) 555-0147" }, websiteUri: "https://www.lonestarroofing.com/?utm_source=gbp",
    storefrontAddress: { addressLines: ["1100 Congress Ave"], locality: "Austin", administrativeArea: "TX", postalCode: "78701", regionCode: "US" },
    serviceArea: { businessType: "CUSTOMER_AND_BUSINESS_LOCATION", regionCode: "US", places: places("Austin, TX, USA", "Round Rock, TX, USA", "Austin, TX 78704, USA") },
    metadata: { mapsUri: "https://maps.google.com/?cid=111" } };
  const client = { business_name: "Lone Star Roofing", identity_phone: "512-555-0147", website_url: "lonestarroofing.com", geography_model: "single_location" };
  const g = X.factsFromGoogle(google), told = X.toldFacts(client, null), targets = X.targetsOf(plan("Cedar Park", "Pflugerville", "78704"));
  const view = X.factsView(g, told, targets);
  if (g.state !== "TX" || g.come !== true || g.address !== "1100 Congress Ave, Austin TX 78701" || g.mapsUri !== "https://maps.google.com/?cid=111") fail(`TX: Google's read is wrong (${JSON.stringify(g)})`);
  if (JSON.stringify(view.same) !== JSON.stringify({ name: true, come: true, area: null, phone: true, website: true })) fail(`TX: what they told us doesn't compare right (${JSON.stringify(view.same)})`);
  if (JSON.stringify(view.recommend?.area?.add) !== '["Cedar Park","Pflugerville"]' || !view.recommend.area.targets.find((t) => t.name === "78704" && t.on)) fail(`TX: RGA's recommendation is wrong — a ZIP already on Google must count (${JSON.stringify(view.recommend)})`);
  const h = ctx.rows(view);
  if (!/placeholder="Add another area in TX"/.test(h) || !/>78704<em class="ok">On Google<\/em>/.test(h) || !/Add the 2 areas we(?:'|&#39;)re targeting for you/.test(h)) fail("TX: the portal card isn't drawn for Texas");
  // the client keeps Google's list, adds both recommendations and types Georgetown (the portal adds ", TX")
  const v = X.validateFacts({ name: "Lone Star Roofing", come: "yes", phone: "512-555-0147", website: "lonestarroofing.com",
    area: { keep: g.area, add: ["Cedar Park", "Pflugerville", "Georgetown, TX"] } });
  if (v.error) fail(`TX: the answer isn't accepted (${v.error})`);
  const w = fakeGoogle(google);
  const push = await X.applyFacts(v.value, w.deps);
  if (w.patches.length || push.state !== "with_rga" || JSON.stringify(push.rga.find((x) => x.fact === "area")?.add) !== '["Cedar Park","Pflugerville","Georgetown, TX"]') fail(`TX: the save isn't RGA's service-area list (${JSON.stringify(push)})`);
  if (Object.keys(X.clientsPatch(v.value, client)).length) fail("TX: a save that changes nothing rewrites the client record");
  const task = { status: "in_progress", client_input: v.value, google_push: push };
  if (X.progressOf(task, g, null).items.some((x) => x.on)) fail("TX: nothing is on Google yet, but progress says otherwise");
  const g2 = X.factsFromGoogle({ ...google, serviceArea: { ...google.serviceArea, places: places("Austin, TX, USA", "Round Rock, TX, USA", "Austin, TX 78704, USA", "Cedar Park, TX, USA", "Pflugerville, TX, USA") } });
  const half = X.progressOf(task, g2, "2026-10-17T10:30:00Z");
  if (half.items.filter((x) => x.on).length !== 2 || X.rgaDone(task, g2)) fail(`TX: 2 of 3 on Google isn't 2 of 3 (or is called done) (${JSON.stringify(half.items)})`);
  const chk = ctx.check({ ...push, area_now: g2.area, area_now_at: "2026-10-17T10:30:00Z" });
  if ((chk.match(/is-done/g) || []).length !== 2 || !/Add Georgetown, TX <button[^>]*data-area-missing="Georgetown, TX"/.test(chk)) fail("TX: admin's checklist doesn't tick the 2 Google lists and offer \"Google doesn't list it\" for the third");
  const g3 = X.factsFromGoogle({ ...google, serviceArea: { ...google.serviceArea, places: places("Austin, TX, USA", "Round Rock, TX, USA", "Austin, TX 78704, USA", "Cedar Park, TX, USA", "Pflugerville, TX, USA", "Georgetown, TX, USA") } });
  if (!X.rgaDone(task, g3)) fail("TX: all 3 on Google doesn't finish the step");
}

// ═══ NEW YORK: a cleaner in Brooklyn — goes to customers, a phone that differs, a town name that exists in another state ═══
{
  const google = { title: "Brooklyn Bright Cleaners", phoneNumbers: { primaryPhone: "+1 718-555-0123" }, websiteUri: "https://brooklynbright.nyc/",
    serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY", regionCode: "US", places: places("Brooklyn, NY, USA", "Queens, NY, USA") }, metadata: { mapsUri: "https://maps.google.com/?cid=222" } };
  const client = { business_name: "Brooklyn Bright Cleaners", identity_phone: "(718) 555-0199", website_url: "https://www.brooklynbright.nyc", geography_model: null };
  const g = X.factsFromGoogle(google), told = X.toldFacts(client, null), targets = X.targetsOf(plan("Williamsburg", "Greenpoint", "Astoria"));
  const view = X.factsView(g, told, targets);
  if (g.state !== "NY" || g.come !== false) fail(`NY: Google's read is wrong (${JSON.stringify(g)})`);
  if (JSON.stringify(view.same) !== JSON.stringify({ name: true, come: null, area: null, phone: false, website: true })) fail(`NY: what they told us doesn't compare right (${JSON.stringify(view.same)})`);
  const h = ctx.rows(view);
  if (!/data-area-chip="add" data-area-name="Williamsburg, NY"/.test(h)) fail("NY: a recommended place isn't saved with the business's state (\"Williamsburg\" could mean Virginia)");
  if (!/These don(?:'|&#39;)t match\. Which number should customers call\?/.test(h) || !/placeholder="Add another area in NY"/.test(h) || !/Add the 3 areas we(?:'|&#39;)re targeting for you/.test(h) || !/Should Google show your address\?/.test(h)) fail("NY: the portal doesn't ask about the phone, customers coming, and the 3 areas");
  // their number is right; customers don't come to them; add the 3 + Long Island City
  const v = X.validateFacts({ name: "Brooklyn Bright Cleaners", come: "no", phone: "(718) 555-0199", website: "https://www.brooklynbright.nyc",
    area: { keep: g.area, add: ["Williamsburg", "Greenpoint", "Astoria", "Long Island City, NY"] } });
  if (v.error) fail(`NY: the answer isn't accepted (${v.error})`);
  const w = fakeGoogle(google);
  const push = await X.applyFacts(v.value, w.deps);
  if (w.patches[0]?.phoneNumbers?.primaryPhone !== "(718) 555-0199" || !push.written.includes("phone") || push.state !== "with_rga") fail(`NY: their phone isn't written to Google and read back (${JSON.stringify(push)})`);
  const patch = X.clientsPatch(v.value, client);
  if (patch.geography_model !== "service_area" || "identity_phone" in patch) fail(`NY: the client record doesn't follow (customers don't come → service_area; the phone already ours) (${JSON.stringify(patch)})`);
  const task = { status: "in_progress", client_input: v.value, google_push: push };
  // Google lists Williamsburg, VA by mistake, plus Greenpoint and Astoria — Virginia must NOT count
  const g2 = X.factsFromGoogle({ ...google, serviceArea: { ...google.serviceArea, places: places("Brooklyn, NY, USA", "Queens, NY, USA", "Williamsburg, VA, USA", "Greenpoint, Brooklyn, NY, USA", "Astoria, Queens, NY, USA") } });
  const pr = X.progressOf(task, g2, "2026-10-17T10:30:00Z");
  const on = Object.fromEntries(pr.items.map((x) => [x.name, x.on]));
  if (on.Williamsburg !== false || on.Greenpoint !== true || on.Astoria !== true) fail(`NY: a place in the WRONG STATE ticks a client's area (${JSON.stringify(on)})`);
  // RGA: Google has no "Long Island City" → back to the client, named at the top, never recommended again
  const mm = M({ ...task, client_input: v.value }, "Long Island City, NY", "rga@x", "2026-10-17T12:00:00Z");
  if (!mm.task || mm.task.status !== "pending" || JSON.stringify(mm.task.google_push.area_missing) !== '["Long Island City, NY"]') fail(`NY: "Google doesn't list it" doesn't send the step back (${JSON.stringify(mm)})`);
  if (!/Google doesn(?:'|&#39;)t list &quot;Long Island City&quot;: pick a nearby area/.test(ctx.note(mm.task))) fail("NY: the top of the portal doesn't say which place Google doesn't list");
  if (X.factsView(g2, told, ["Long Island City"], mm.task.google_push.area_missing).recommend?.area?.add?.includes("Long Island City")) fail("NY: a place Google doesn't list is recommended again");
  const g3 = X.factsFromGoogle({ ...google, serviceArea: { ...google.serviceArea, places: places("Brooklyn, NY, USA", "Queens, NY, USA", "Williamsburg, Brooklyn, NY, USA", "Greenpoint, Brooklyn, NY, USA", "Astoria, Queens, NY, USA") } });
  const t2 = { ...task, google_push: { ...push, rga: [{ fact: "area", add: ["Williamsburg", "Greenpoint", "Astoria"], remove: [] }] } };
  if (!X.rgaDone(t2, g3)) fail("NY: all of Brooklyn's areas on Google doesn't finish the step");
  const done = ctx.note({ status: "done", client_input: v.value, google_push: { ...t2.google_push, done_note_until: new Date(Date.now() + 86400000).toISOString().slice(0, 10) } });
  if (!/Your 3 new service areas are on Google/.test(done)) fail("NY: the top of the portal doesn't say it's done");
}

// ═══ a storefront with NO service area (a Manhattan bakery): the state comes from its address alone ═══
{
  const g = X.factsFromGoogle({ title: "Elm Street Bakery", storefrontAddress: { addressLines: ["14 Elm St"], locality: "New York", administrativeArea: "NY", postalCode: "10013", regionCode: "US" } });
  if (g.state !== "NY" || g.come !== true || g.area.length !== 0) fail(`a storefront-only business doesn't get its state from its address (${JSON.stringify(g)})`);
  const h = ctx.rows(X.factsView(g, X.toldFacts({ business_name: "Elm Street Bakery", geography_model: "single_location" }, null), []));
  if (!/placeholder="Add another area in NY"/.test(h) || !/none listed/.test(h)) fail("a storefront with no service area isn't asked the right way");
}

// ═══ the rule itself: a state, when both names have one, must agree ═══
for (const [a, b, want] of [["Williamsburg, NY", "Williamsburg, VA, USA", false], ["Franklin, TX", "Franklin, TN, USA", false], ["Springfield, IL", "Springfield, MO, USA", false],
  ["Astoria, NY", "Astoria, Queens, NY, USA", true], ["78701", "Austin, TX 78701, USA", true], ["Cedar Park", "Cedar Park, TX, USA", true]])
  if (X.samePlace(a, b) !== want) fail(`"${a}" vs "${b}" should ${want ? "match" : "differ"}`);
if (X.stateTok("Austin, TX 78701, USA") !== "TX" || X.stateTok("Williamsburg, Brooklyn, NY, USA") !== "NY" || X.stateTok("Mar Vista") !== null) fail("a place's state isn't read from its name");

if (F.length) { console.error("🔴 Step 7 doesn't work end to end for a business outside California:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 7 works in Texas and New York end to end: Google's read (state, storefront + area, ZIPs, Maps link), what they told us, step 5's targets, the portal card (\"in TX\" / \"in NY\"), the answer, phone written + read back, the client record, nightly progress (a place in the wrong state never ticks), admin's checklist, \"Google doesn't list it\" back to the client, and done");
