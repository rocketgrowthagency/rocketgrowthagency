#!/usr/bin/env node
// check-business-facts-match-google.mjs — "Check your business on Google": Google is read first, each fact sits beside what
// the client told us, a difference shows both and asks which is right, phone + website go on Google and are read back,
// name / address / service area are RGA's, the client record follows the answer, admin and the nightly check know it.
//
// 🔒 WHY (approved business_on_google_v1, 2026-10-16). Chris: "all steps for a GBP should have a walkthrough steps to verify
// and then we match against their GBP", "find discrepancies saying you listed you are this but your GBP shows that", and
// "make sure its tied to database" + "synced to admin". Found first: no step asked the client their address or whether
// customers come to them — the portal only READ Google. Google is FAKED here; nothing reaches a real profile.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const nc = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
const X = req("./_gbp-facts.js"), G = req("./_gbp-profile.js");
const STEP = "m1.gbp.business_facts";

// ── 1 · universal comparisons: any name, any country, any way of writing a site ──
const cases = [
  ["name", X.sameName, "Joe's Plumbing", "JOES PLUMBING", true], ["name", X.sameName, "Smith & Sons", "Smith and Sons", true],
  ["name", X.sameName, "Café Lumière", "Cafe Lumiere", true], ["name", X.sameName, "Joe's Plumbing", "Joe's Heating", false],
  ["phone", X.samePhone, "(424) 242-2040", "+1 424-242-2040", true], ["phone", X.samePhone, "4242422040", "(424) 242-2040", true],
  ["phone", X.samePhone, "+44 20 7946 0958", "020 7946 0958", true], ["phone", X.samePhone, "+61 2 9374 4000", "(02) 9374 4000", true],
  ["phone", X.samePhone, "(603) 555-0142", "(603) 555-0199", false], ["phone", X.samePhone, "555-0142", "(603) 555-0142", false],
  ["site", X.sameSite, "https://www.rocketgrowthagency.com/", "https://www.rocketgrowthagency.com/?utm_source=google&utm_medium=organic", true],
  ["site", X.sameSite, "rocketgrowthagency.com", "http://rocketgrowthagency.com", true],
  ["site", X.sameSite, "joesplumbingnashville.com", "joesplumbing.wixsite.com/home", false],
];
for (const [k, fn, a, b, want] of cases) if (fn(a, b) !== want) fail(`${k}: "${a}" vs "${b}" should ${want ? "match" : "differ"}`);
if (!X.stuffed("Joe's Plumbing - Best Plumber Nashville 24/7", "Joe's Plumbing") || X.stuffed("Rocket Growth Agency", "Rocket Growth Agency") || X.stuffed("Joe's", "Joe's Plumbing")) fail("a keyword-stuffed name isn't told apart from the real one");

// ── 2 · what they told us, and the comparison (RGA's real record + Google, 10-16) ──
const RGA_CLIENT = { business_name: "Rocket Growth Agency", identity_phone: "4242422040", primary_contact_phone: "(424) 242-2040", website_url: "https://www.rocketgrowthagency.com/", geography_model: "service_area" };
const RGA_GOOGLE = { title: "Rocket Growth Agency", phoneNumbers: { primaryPhone: "(424) 242-2040" }, websiteUri: "https://www.rocketgrowthagency.com/?utm_source=google&utm_medium=organic",
  serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY", regionCode: "US", places: { placeInfos: [{ placeName: "El Segundo, CA, USA" }, { placeName: "Culver City, CA, USA" }] } } };
{
  const g = X.factsFromGoogle(RGA_GOOGLE), t = X.toldFacts(RGA_CLIENT, null), view = X.factsView(g, t);
  if (g.come !== false || g.address !== null || g.area.length !== 2) fail(`a service-area profile isn't read as "address hidden" with its places (${JSON.stringify(g)})`);
  if (JSON.stringify(view.same) !== JSON.stringify({ name: true, come: true, area: null, phone: true, website: true })) fail(`RGA's real profile doesn't compare as 4 matches + the service area to confirm (${JSON.stringify(view.same)})`);
  const shop = X.factsFromGoogle({ title: "Elm St Bakery", storefrontAddress: { addressLines: ["14 Elm St"], locality: "Concord", administrativeArea: "NH", postalCode: "03301" } });
  if (shop.come !== true || shop.address !== "14 Elm St, Concord NH 03301") fail("a storefront's address isn't read");
  for (const [gm, want] of [["single_location", true], ["multi_location", true], ["service_area", false], ["national_one_office", null], [null, null]])
    if (X.toldFacts({ geography_model: gm }, null).come !== want) fail(`"Where does your work happen?" = ${gm} doesn't read as customers-come ${want}`);
}

// ── 3 · the save: phone / website written and read back; name / address / area are RGA's ──
function fakeGoogle(loc, { refuse = null, drop = false } = {}) {
  const w = { loc: JSON.parse(JSON.stringify(loc)), patches: [] };
  w.fetch = async (url, init = {}) => {
    const m = init.method || "GET";
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (m === "PATCH") {
      if (refuse) return res(400, { error: { status: "INVALID_ARGUMENT", message: refuse } });
      const b = JSON.parse(init.body); w.patches.push({ url, body: b });
      if (!drop) { if (b.phoneNumbers) w.loc.phoneNumbers = b.phoneNumbers; if (b.websiteUri) w.loc.websiteUri = b.websiteUri; }
      return res(200, {});
    }
    return res(200, w.loc);
  };
  w.deps = { fetch: w.fetch, token: "t", loc: "locations/1" };
  return w;
}
const ANS = (o = {}) => ({ name: "Rocket Growth Agency", come: "no", area: { ok: true }, phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/", ...o });
{
  const w = fakeGoogle(RGA_GOOGLE);
  const r = await G.applyForStep(STEP, ANS(), w.deps);
  if (r.state !== "on_google" || w.patches.length || r.rga.length) fail(`a profile that already matches is written to (${r.state}, ${w.patches.length} writes)`);
  if (!r.confirmed || r.confirmed.come !== false || r.confirmed.area.length !== 2) fail("the confirmed facts (incl. Google's service area) aren't kept for the nightly check");
  // phone differs → written with the other numbers kept, read back
  const w2 = fakeGoogle({ ...RGA_GOOGLE, phoneNumbers: { primaryPhone: "(424) 555-0100", additionalPhones: ["(424) 555-0101"] } });
  const r2 = await G.applyForStep(STEP, ANS(), w2.deps);
  if (r2.state !== "on_google" || !r2.written.includes("phone") || !/updateMask=phoneNumbers/.test(w2.patches[0]?.url || "") || w2.patches[0]?.body?.phoneNumbers?.additionalPhones?.[0] !== "(424) 555-0101") fail(`a new phone isn't written to Google (keeping their other numbers) and read back (${JSON.stringify(r2)})`);
  // Google keeps the old one → not on Google
  const w3 = fakeGoogle({ ...RGA_GOOGLE, phoneNumbers: { primaryPhone: "(424) 555-0100" } }, { drop: true });
  if ((await G.applyForStep(STEP, ANS(), w3.deps)).state === "on_google") fail("a phone Google didn't keep is reported as on Google (no read-back)");
  // Google refuses the number → back to the client with how to fix
  const w4 = fakeGoogle({ ...RGA_GOOGLE, phoneNumbers: { primaryPhone: "(424) 555-0100" } }, { refuse: "Invalid phone number" });
  const r4 = await G.applyForStep(STEP, ANS(), w4.deps);
  if (r4.state !== "needs_client" || !/phone/i.test(r4.said || "") || !r4.fix) fail("a phone Google refuses doesn't go back to the client with how to fix");
  // name + show the address + a new area → RGA's, never written
  const w5 = fakeGoogle({ ...RGA_GOOGLE, title: "Rocket Growth Agency - Best SEO Los Angeles" });
  const r5 = await G.applyForStep(STEP, ANS({ come: "yes", area: { text: "Venice, Santa Monica" } }), w5.deps);
  if (r5.state !== "with_rga" || w5.patches.length || JSON.stringify(r5.rga.map((x) => x.fact).sort()) !== JSON.stringify(["area", "come", "name"])) fail(`a name / address / area change isn't RGA's (or was written by the machine) (${JSON.stringify(r5)})`);
  if (r5.error) fail("RGA's to-do is stored as an \"error\" (reads as an untold failure)");
  if (!/RGA to change on Google: business name, whether customers come to you, service area/.test(r5.rga_note || "")) fail("RGA's to-do doesn't name what to change");
}
{
  // answers that can't be saved
  for (const [bad, why] of [[{ ...ANS(), name: "" }, "no name"], [{ ...ANS(), come: "maybe" }, "come not yes/no"], [{ ...ANS(), phone: "12" }, "short phone"], [{ ...ANS(), area: {} }, "no area answer"], [{ ...ANS(), website: "not a site" }, "bad website"]])
    if (!X.validateFacts(bad).error) fail(`an answer with ${why} is accepted`);
  const ok = X.validateFacts({ ...ANS(), website: "rocketgrowthagency.com" });
  if (ok.error || ok.value.website !== "https://rocketgrowthagency.com") fail("a website typed without https:// isn't accepted as one");
}

// ── 4 · the record follows the answer; the nightly check; RGA's change finishes itself ──
{
  const p = X.clientsPatch(ANS({ phone: "(424) 555-0100", come: "yes" }), RGA_CLIENT);
  if (p.identity_phone !== "(424) 555-0100" || p.geography_model !== "single_location" || "website_url" in p) fail(`the client record doesn't follow the confirmed phone / where the work happens (only what changed) (${JSON.stringify(p)})`);
  if (Object.keys(X.clientsPatch(ANS(), RGA_CLIENT)).length) fail("a save that changes nothing rewrites the client record");
  if (X.clientsPatch(ANS({ come: "yes" }), { ...RGA_CLIENT, geography_model: "multi_location" }).geography_model) fail("a multi-location business is turned into a single location");
  const task = { client_input: ANS(), google_push: { state: "on_google", confirmed: { name: "Rocket Growth Agency", come: false, phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/", area: ["El Segundo, CA, USA", "Culver City, CA, USA"] } } };
  if (X.factsDrift(task, X.factsFromGoogle(RGA_GOOGLE))) fail("a profile that still matches is reported as changed");
  const d = X.factsDrift(task, X.factsFromGoogle({ ...RGA_GOOGLE, phoneNumbers: { primaryPhone: "(424) 555-0199" } }));
  if (!d || !/phone/.test(d.what)) fail("a phone changed on Google (a suggested edit) isn't noticed");
  const pend = { client_input: ANS({ name: "Joe's Plumbing", come: "yes" }), google_push: { state: "with_rga", rga: [{ fact: "name" }, { fact: "come" }] } };
  if (X.rgaDone(pend, X.factsFromGoogle({ title: "Joe's Plumbing - Best" }))) fail("RGA's change is called done before Google shows it");
  if (!X.rgaDone(pend, X.factsFromGoogle({ title: "Joes Plumbing", storefrontAddress: { addressLines: ["1 Main St"] } }))) fail("RGA's change isn't finished once Google shows it");
  if (X.rgaDone({ ...pend, google_push: { state: "with_rga", rga: [{ fact: "area" }] } }, X.factsFromGoogle(RGA_GOOGLE))) fail("a service area typed in the client's words is matched by a machine");
  if (X.rgaDone({ client_input: ANS({ name: "Joe's Plumbing" }), google_push: { state: "with_rga", rga: [{ fact: "name" }] } }, X.factsFromGoogle({ title: "Joe's Plumbing - Best Plumber Nashville" }))) fail("a name change is called done while Google still shows the old name");
}

// ── 4b · SERVICE AREA, ANY US LOCATION (approved service_area_recommend_v2): the client's OWN targets, their state, places by
// their own name or ZIP, a picked list goes to RGA, only Google ticks a place, a place Google lacks goes back ──
{
  for (const [a, b, want] of [["Mar Vista", "Mar Vista, Los Angeles, CA, USA", true], ["37215", "Nashville, TN 37215", true], ["Marina Del Rey", "Marina Del Rey, CA 90292, USA", true],
    ["Franklin", "Franklin, TN, USA", true], ["Palms", "Palm Springs, CA, USA", false], ["Allen", "Allentown, PA, USA", false], ["78701", "Austin, TX 78702", false]])
    if (X.samePlace(a, b) !== want) fail(`place "${a}" vs "${b}" should ${want ? "match" : "differ"}`);
  const TN = { title: "Joe's Plumbing", serviceArea: { regionCode: "US", places: { placeInfos: [{ placeName: "Nashville, TN, USA" }, { placeName: "Brentwood, TN, USA" }, { placeName: "Green Hills, Nashville, TN, USA" }, { placeName: "Nashville, TN 37215, USA" }] } } };
  const tn = X.factsFromGoogle(TN);
  if (tn.state !== "TN") fail(`the state isn't read from the business's own Google listing (${tn.state})`);
  if (X.factsFromGoogle({ storefrontAddress: { addressLines: ["1 Main"], administrativeArea: "TX" } }).state !== "TX") fail("a storefront's state isn't read from its address");
  const v = X.factsView(tn, X.toldFacts({}, null), ["Brentwood", "Green Hills", "Franklin"]);
  if (JSON.stringify(v.recommend?.area?.add) !== '["Franklin"]' || v.recommend.area.state !== "TN" || v.recommend.area.targets.filter((t) => t.on).length !== 2) fail(`RGA's recommendation isn't the client's own targets missing from Google (${JSON.stringify(v.recommend)})`);
  if (X.factsView(tn, X.toldFacts({}, null), []).recommend?.area) fail("a client with no target areas is shown a recommendation");
  if (X.factsView(tn, X.toldFacts({}, null), ["Franklin"], ["Franklin, TN"]).recommend?.area?.add?.length) fail("a place Google said it doesn't have is recommended again (a loop)");
  // the targets are read from the client's OWN step 5 (rank scan list, else the plan's locations)
  if (JSON.stringify(X.targetsOf({ "m1.strategy.keywords_locations": { outcome_data: { sub_locations: [{ name: "Franklin" }] } } })) !== '["Franklin"]') fail("targets aren't read from step 5's scan list");
  if (JSON.stringify(X.targetsOf({ "m1.strategy.keywords_locations": { outcome_data: { draft: "keywords:\n  - term: plumber\nlocations:\n  - Franklin (south)\n  - name: Brentwood\n" } } })) !== '["Franklin","Brentwood"]') fail("targets aren't read from step 5's plan");
  // a picked list → RGA's add / drop list; 20 max; nothing to change → no RGA item
  const ok = X.validateFacts({ ...ANS(), area: { keep: ["Nashville, TN, USA", "Brentwood, TN, USA"], add: ["Franklin, TN", "Brentwood"] } });
  if (ok.error || JSON.stringify(ok.value.area.add) !== '["Franklin, TN"]') fail(`a picked list isn't accepted (or a kept place is added twice) (${JSON.stringify(ok)})`);
  if (!X.validateFacts({ ...ANS(), area: { keep: Array.from({ length: 21 }, (_, i) => `Town ${i}`) } }).error) fail("more than Google's 20 areas is accepted");
  if (!X.validateFacts({ ...ANS(), area: { keep: [], add: [] } }).error) fail("an empty service area is accepted");
  const items = X.rgaItems({ ...ANS(), area: ok.value.area }, tn);
  const ai = items.find((x) => x.fact === "area");
  if (!ai || JSON.stringify(ai.add) !== '["Franklin, TN"]' || JSON.stringify(ai.remove) !== '["Green Hills, Nashville, TN, USA","Nashville, TN 37215, USA"]') fail(`a picked list isn't turned into RGA's add / drop list (${JSON.stringify(ai)})`);
  if (X.rgaItems({ ...ANS(), area: { keep: tn.area, add: [] } }, tn).some((x) => x.fact === "area")) fail("keeping Google's list makes work for RGA");
  // only Google ticks it
  const pend = { client_input: ANS(), google_push: { state: "with_rga", rga: [ai] } };
  if (X.rgaDone(pend, tn)) fail("a service-area change is done before Google lists the new place");
  if (X.rgaDone({ client_input: ANS(), google_push: { state: "with_rga", rga: [{ fact: "area", add: ["Franklin, TN"], remove: [] }] } }, tn)) fail("adding a place is done before Google lists it");
  if (!X.rgaDone(pend, X.factsFromGoogle({ serviceArea: { places: { placeInfos: [{ placeName: "Nashville, TN, USA" }, { placeName: "Brentwood, TN, USA" }, { placeName: "Franklin, TN, USA" }] } } }))) fail("a service-area change isn't finished once Google lists it");
  // RGA: Google doesn't list it → back to the client, recorded
  let M;
  try { M = req("./admin-gbp-facts-area.js").markMissing; } catch (e) { console.error(`⚠️  INDETERMINATE — admin-gbp-facts-area didn't load: ${e.message}`); process.exit(2); }
  const mm = M({ client_input: { area: { keep: [], add: ["Franklin, TN"] } }, status: "in_progress", google_push: { state: "with_rga", rga: [{ fact: "area", add: ["Franklin, TN"], remove: [] }] } }, "Franklin", "rga@x", "2026-10-16T00:00:00Z");
  if (!mm.task || mm.task.status !== "pending" || JSON.stringify(mm.task.google_push.area_missing) !== '["Franklin, TN"]' || mm.task.google_push.rga.length || mm.task.client_input.area.add.length) fail(`"Google doesn't list it" doesn't send the step back to the client with the place named (${JSON.stringify(mm)})`);
  if (!M({ google_push: { rga: [] } }, "Franklin", "x", "t").error) fail("RGA can mark a place missing that isn't on its list");
  const aMiss = nc(read("netlify/functions/admin-gbp-facts-area.js"));
  if (!/const gate = await requireWorkspaceForClient\(event, clientId\); if \(gate\.error\) return gate\.error;/.test(aMiss) || !/kind: "gbp_area_not_on_google"/.test(aMiss)) fail("the missing-place action isn't RGA-only, or isn't recorded");
}

// ── 5 · wiring: the step, the save, the database, admin, the nightly check ──
const pb = JSON.parse(read("data/playbooks/playbooks.json")), cs = JSON.parse(read("data/playbooks/client-steps.json"));
const m1 = pb.month1.map((s) => s.id), step = pb.month1.find((s) => s.id === STEP), cstep = cs.month1.find((s) => s.id === STEP);
if (!step || m1.indexOf(STEP) !== m1.indexOf("m1.gbp.verify") + 1 || step.clientInput?.kind !== "facts" || !(step.dependsOn || []).includes("m1.gbp.verify")) fail("the step isn't in the playbook right after verify, taking a facts answer");
if (!cstep || cstep.clientStepNo !== 7 || !cstep.waitsOnListing || cstep.clientInput?.kind !== "facts") fail("the client portal doesn't carry the step as 7, waiting on one listing");
const nos = cs.month1.filter((s) => s.clientStepNo != null).map((s) => s.clientStepNo);
if (new Set(nos).size !== nos.length || Math.max(...nos) !== nos.length) fail(`client step numbers aren't 1…N, each once (${nos.join(",")})`);
if (!G.GOOGLE_STEPS.has(STEP)) fail("the step isn't one of the Google steps (read, write, read back, nightly)");
const sin = nc(read("netlify/functions/portal-step-input.js"));
if (!/if \(spec\.kind === "facts"\) return require\("\.\/_gbp-facts"\)\.validateFacts\(raw\);/.test(sin)) fail("the save doesn't check a facts answer");
if (!/const patch = F\.clientsPatch\(parsed\.value, client \|\| \{\}\);/.test(sin) || !/Prefer: "return=representation" \}, body: JSON\.stringify\(patch\) \}\);\s*const ok = back && Object\.entries\(patch\)/.test(sin)) fail("the client record isn't updated from the answer (and read back)");
if (!/via: "portal_gbp_check"/.test(sin)) fail("where the work happens is written without the owner-facts meta");
if (!/google: push && \(push\.state === "on_google" \|\| \(stepId === GSTEP\.FACTS && \(push\.written \|\| \[\]\)\.length\)\)/.test(sin)) fail("a phone / website written to Google isn't in the Google change log");
if (!/client_record: toldSync/.test(sin)) fail("the activity row doesn't say what changed on the client record");
if (!/change on Google: \$\{push\.rga\.map/.test(sin)) fail("RGA isn't told what to change on Google");
if (!/if \(stepId === "m1\.gbp\.business_facts"\) \{[\s\S]{0,700}F\.factsView\(google, F\.toldFacts\(client \|\| \{\}, tasks\[stepId\]\), F\.targetsOf\(tasks\), \(tasks\[stepId\] && tasks\[stepId\]\.google_push && tasks\[stepId\]\.google_push\.area_missing\) \|\| \[\]\)/.test(nc(read("netlify/functions/portal-gbp-profile.js")))) fail("the portal isn't sent Google beside what they told us");
const watch = nc(read("netlify/functions/_gbp-watch.js"));
if (!/if \(stepId === STEP\.FACTS\) return require\("\.\/_gbp-facts"\)\.factsDrift\(task, now\);/.test(watch) || !/if \(F\.rgaDone\(task, now\)\)/.test(watch) || !/kind: "gbp_facts_matched"/.test(watch)) fail("the nightly check doesn't watch the facts / finish RGA's change (recorded)");
const drift = nc(read("netlify/functions/admin-gbp-drift.js"));
if (!/stepId === STEP\.FACTS && push\.state === "with_rga"/.test(drift) || !/stepId === STEP\.FACTS \? \{ name: now\.name, come: now\.come \? "yes" : "no"/.test(drift)) fail("admin's put back / keep Google's doesn't handle the facts");
const admin = nc(read("admin/admin.js"));
if (!/const CLIENT_GBP_STEPS = \{ "m1\.gbp\.business_facts":/.test(admin) || !/const GBP_DRIFT_STEPS = \{ "m1\.gbp\.business_facts": "Business details"/.test(admin)) fail("admin doesn't count the step as the client's, or doesn't show a change on Google for it");
if (!/<table class="ob-gbpfacts"><thead><tr><th>Fact<\/th><th>Client confirmed<\/th><th>Google before<\/th><th>Google now<\/th>/.test(admin)) fail("admin's step card doesn't show confirmed · before · now for each fact");
if (!/if \(factsTodo\.length\) \{\s*return \{\s*title: `Change on Google: \$\{factsTodo\.map/.test(admin)) fail("a name / address / area to change isn't RGA's Your action");

// ── 6 · the portal draws the rows: matches green, a difference both values, a gap asks, a stuffed name is RGA's ──
const portal = read("portal/portal.js");
const i0 = portal.indexOf("const FACT_WORDS = {"), i1 = portal.indexOf("async function loadGbpNow(clientId) {");
if (i0 < 0 || i1 < i0) { console.error("⚠️  INDETERMINATE — could not lift the facts renderer"); process.exit(2); }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { escapeHtml: esc, escapeAttribute: esc };
vm.createContext(ctx);
vm.runInContext(`${portal.slice(i0, i1)}\nthis.rows = factsRowsHtml; this.sum = factsSummary;`, ctx);
{
  const h = ctx.rows(X.factsView(X.factsFromGoogle(RGA_GOOGLE), X.toldFacts(RGA_CLIENT, null)));
  const row = (k) => { const a = h.indexOf(`data-fact="${k}"`); const b = h.indexOf('data-fact="', a + 12); return h.slice(a, b < 0 ? undefined : b); };
  for (const k of ["name", "come", "phone", "website"]) if (!/✓ Matches/.test(row(k)) || new RegExp(`class="pm-fact is-open" data-fact="${k}"`).test(h)) fail(`RGA's ${k} (matches) isn't one green line`);
  if (!/Your turn/.test(row("area")) || !/El Segundo, CA, USA/.test(row("area")) || !/data-fact-pick="area" data-fact-val="ok">Yes, that(?:'|&#39;)s right/.test(row("area"))) fail("the service area (never asked) isn't the client's turn with Google's places");
  if (!/Google(?:'|&#39;)s link carries our tracking tags/.test(row("website"))) fail("a website with tracking tags doesn't say why it still matches");
  if (!/You told us: \(424\) 242-2040/.test(row("phone"))) fail("a US number stored as bare digits isn't shown as (424) 242-2040");
  const inMob = ctx.rows(X.factsView(X.factsFromGoogle({ ...RGA_GOOGLE, phoneNumbers: { primaryPhone: "98123 45678" }, serviceArea: { regionCode: "IN" } }), X.toldFacts({ ...RGA_CLIENT, identity_phone: "9812345678" }, null)));
  if (!/You told us: 9812345678/.test(inMob) || /\(981\)/.test(inMob)) fail("a 10-digit number outside North America is reformatted as a US number");
  const diff = ctx.rows(X.factsView(X.factsFromGoogle({ ...RGA_GOOGLE, phoneNumbers: { primaryPhone: "(603) 555-0199" } }), X.toldFacts({ ...RGA_CLIENT, identity_phone: "(603) 555-0142" }, null)));
  if (!/These don(?:'|&#39;)t match\. Which number should customers call\?/.test(diff) || !/data-fact-val="\(603\) 555-0142">\(603\) 555-0142, mine/.test(diff) || !/data-fact-val="\(603\) 555-0199">\(603\) 555-0199, Google(?:'|&#39;)s/.test(diff)) fail("a phone that differs doesn't show both numbers and ask which is right");
  const st = ctx.rows(X.factsView(X.factsFromGoogle({ ...RGA_GOOGLE, title: "Joe's Plumbing - Best Plumber Nashville 24/7" }), X.toldFacts({ ...RGA_CLIENT, business_name: "Joe's Plumbing" }, null)));
  if (!/With RGA/.test(st) || !/RGA recommends "Joe(?:'|&#39;)s Plumbing"\.<\/b> Google can suspend a profile that adds extra words to its name/.test(st) || !/>Keep the long name</.test(st)) fail("a keyword-stuffed name isn't RGA's recommendation with a veto");
  const hid = ctx.rows(X.factsView(X.factsFromGoogle(RGA_GOOGLE), X.toldFacts({ ...RGA_CLIENT, geography_model: "single_location" }, null)));
  if (!/Should Google show your address\?/.test(hid) || !/<b>Before you say yes:<\/b> show an address only if customers can walk in during your hours/.test(hid)) fail("customers-come that differs doesn't ask, with the re-verification caution");
}
const js = nc(portal);
// 🔒 step7_card_hardened_v1: the head is a progress bar counted from the lines themselves ("2 to check" once counted the
// matching name because ANOTHER line had a recommendation); no section label, no help line, no repeated sentence
if (!/function factsProgress\(wrap\) \{/.test(js) || !/const st = rows\.map\(\(r\) => \(r\.classList\.contains\("is-answered"\) \? "a" : r\.classList\.contains\("is-open"\) \? "o" : "m"\)\);/.test(js) || /What Google shows now, next to what you told us\./.test(portal)) fail("the head isn't a progress bar counted from the lines (or repeats the help text)");
if (!/const head = s\.kind === "facts"(?: \|\| s\.kind === "hours")? \? gnow :/.test(js)) fail("the facts form still stacks a section label and help line above the rows");
if (!/\(?step\.id === "m1\.gbp\.business_facts"(?: \|\| step\.id === "m1\.gbp\.hours_attributes"\))? && !isDone && !gbpWithRga && !ownWait && !listingWait \? `<div class="pm-fx-sub"><p class="pm-ask">\$\{escapeHtml\(step\.clientHint \|\| ""\)\}<\/p>\$\{actionBtn\}<\/div>`/.test(js)) fail("the top isn't one line with Show me how on its right");
if (!/else if \(kind === "facts"\) \{[\s\S]{0,1600}if \(missing\.length\) \{\s*if \(msg\) \{[^\n]*Answer \$\{missing\.join\(", "\)\} first\.[^\n]*\}\s*return;\s*\}/.test(js)) fail("a save with an unanswered line isn't stopped in the browser");
// 🔒 a pick SHOWS its answer at once, and the last open line SAVES (the pressed button spins) — Chris 10-16: "clicking it now
// and doing nothing"; a caution (showing an address) waits for Save
if (!/ans\.innerHTML = `<span class="ck" aria-hidden="true">✓<\/span><span class="l">\$\{escapeHtml\(row\.getAttribute\("data-fact-name"\) \|\| ""\)\}<\/span><span class="v">\$\{escapeHtml\(pick\.getAttribute\("data-fact-label"\) \|\| pick\.textContent\.trim\(\)\)\}<\/span><button type="button" class="pm-linkbtn" data-fact-redo>Change<\/button>`;/.test(js)) fail("a pick doesn't show the client's answer (the button looks dead)");
if (!/const save = allAnswered && !caution && wrap\.querySelector\("\[data-in-submit\]"\);\s*if \(save\) \{\s*save\.classList\.add\("is-busy", "is-busy-say"\);[^\n]*\n\s*submitStepInput\(save\)/.test(js) || !/async function submitStepInput\(btn\) \{/.test(js)) fail("answering the last open line doesn't save the step");
if (!/e\.target\.closest\("\[data-fact-redo\]"\)/.test(js)) fail("an answered line can't be changed");
if (!/step\.id === "m1\.gbp\.business_facts" && Array\.isArray\(g\.rga\) && g\.rga\.length/.test(js) || !/Google may ask you to verify the business again; we(?:'|’)ll tell you if it does\./.test(portal)) fail("the client isn't told RGA is changing their name / address on Google");

// ── 7 · the card: RGA's recommendation drawn side by side; no text box; the state in the input; admin ticks only from Google ──
{
  const view = X.factsView(X.factsFromGoogle(RGA_GOOGLE), X.toldFacts(RGA_CLIENT, null), ["Mar Vista", "Palms", "Culver City"]);
  const h = ctx.rows(view);
  if (!/<small>Where you work · RGA recommends<\/small><b>Add the 2 areas we(?:'|&#39;)re targeting for you/.test(h) || !/class="pm-fact is-open pm-fx-cardonly" data-fact="area"/.test(h)) fail("the service area doesn't lead with RGA's recommendation as one card");
  // To check first, matches folded under their own heading
  const tc = h.indexOf("To check · 1"), mg = h.indexOf("Matches Google · 4");
  if (tc < 0 || mg < tc || !/<div class="pm-fx-oklist">/.test(h.slice(mg))) fail("open lines don't come first with matches folded under \"Matches Google\"");
  if (!/>Mar Vista<em class="">Not on Google<\/em>/.test(h) || !/>Culver City<em class="ok">On Google<\/em>/.test(h)) fail("the targets aren't drawn beside their Google status");
  if (!/data-area-chip="add" data-area-name="Mar Vista, CA" aria-pressed="true">\+ Mar Vista/.test(h) || !/placeholder="Add another area in CA"/.test(h) || !/<b data-area-count>4 \/ 20<\/b>/.test(h)) fail("the card lacks the add chips, the state in the input, or the 20-place meter");

  const none = ctx.rows(X.factsView(X.factsFromGoogle(RGA_GOOGLE), X.toldFacts(RGA_CLIENT, null), []));
  if (!/data-fact-val="ok">Yes, that(?:'|&#39;)s right/.test(none) || !/data-area-edit>Change the list/.test(none)) fail("with no targets, the line isn't Yes / Change the list (opening the card)");
  if (/<textarea[^>]*data-fact-other="area"/.test(h + none) || !/data-area-card hidden/.test(none)) fail("the service area still asks for a text box (\"Change the list\" must open the card)");
  const miss = ctx.rows({ ...X.factsView(X.factsFromGoogle(RGA_GOOGLE), X.toldFacts(RGA_CLIENT, null), []), missing: ["Palms, CA"] });
  if (!/Google doesn(?:'|&#39;)t list Palms, CA\.<\/b> Pick a nearby area, or keep your list without it\./.test(miss)) fail("a place Google doesn't list isn't told to the client");
}
if (!/\.pm-sa-ico \{[^}]*width:40px; height:40px;[^}]*align-items:center; justify-content:center;/.test(read("portal/portal.css")) || !/\.pm-sa-ico svg \{ width:22px; height:22px;/.test(read("portal/portal.css"))) fail("the card's icon isn't a centred 22px icon in a 40px tile (Chris 10-16: the icon looked lost)");
if (!/function areaChecklistHtml\(g\)/.test(admin) || !/data-area-missing=/.test(admin) || !/const now = Array\.isArray\(g\.area_now\) \? g\.area_now : null;/.test(admin)) fail("admin's service-area checklist isn't ticked from Google (or has no \"Google doesn't list it\")");
if (!/area_now: now\.area/.test(watch)) fail("the nightly check doesn't record which places Google lists (admin can't tick)");

// ── 8 · Chris 10-16, after his real save: the last answer saves IN PLACE (no collapse, the pressed button spins); after saving
// the row is RGA's (blue edge, not "now", no ask / why / Show me how) with a summary that says what he chose; the how-to opens
// under its button; admin shows the answer on an ACTIVE row ──
if (!/if \(lastOne\) \{\s*pick\.classList\.add\("is-busy", "is-busy-say"\);/.test(js) || !/submitStepInput\(pick\)\.finally/.test(js)) fail("the last answer collapses the card while it saves (the screen jumps)");
if (!/: step\.id === "m1\.gbp\.business_facts" && \(isDone \|\| gbpWithRga\) \? ""/.test(js)) fail("after saving, step 7 still repeats the ask and the why");
if (!/const area = ar\.keep \|\| ar\.add \? `Service area: \$\{nPl\} place/.test(js)) fail("the summary says \"as on Google\" after the client picked a list");
if (!/nowStepId = \(numbered\.find\(\(r\) => isOpenRow\(r\) && theirs\(r\) && !r\.later && !r\.withRga && r\.taskState\?\.google_push\?\.state !== "with_rga"\)/.test(js) || !/&& i\.taskState\?\.google_push\?\.state !== "with_rga"/.test(js)) fail("a step RGA is finishing is still the client's \"now\" / next step");
if (!/\$\{!isDone && gbpWithRga \? " is-rga-turn" : ""\}/.test(js)) fail("a step RGA is finishing keeps the client's amber edge");
if (!/const anchor = b\.closest\("\.pm-fx-sub, \.pm-row-actions"\);\s*if \(detail\.hidden && anchor && anchor\.nextElementSibling !== detail\) anchor\.after\(detail\);/.test(js)) fail("Show me how opens its panel off screen, below the form");
if (!/<div class="ob-body">\$\{askNote\}\$\{\/\*[\s\S]{0,400}?\*\/\s*clientInputHtml\(o, s\.task\)\}/.test(read("admin/admin.js")) || !/<div class="ob-body">\$\{clientInputHtml\(o, s\.task\)\}\$\{outHtml\}/.test(admin)) fail("admin shows the client's answer only once the step is done (not while RGA is finishing it)");

if (!/\["Service area", "area", v\.area\?\.keep \|\| v\.area\?\.add \? `\$\{\(v\.area\.keep \|\| \[\]\)\.length \+ \(v\.area\.add \|\| \[\]\)\.length\} places/.test(admin)) fail("admin's facts table says the service area is \"as on Google\" after the client picked a list");
// ── 9 · THE CLIENT SEES EACH CHANGE REACH GOOGLE (approved step7_client_progress_v1) ──
{
  const task = { client_input: ANS({ name: "Joe's Plumbing", come: "yes" }), google_push: { state: "with_rga", rga: [{ fact: "area", add: ["Mar Vista", "Palms"], remove: ["Culver City, CA, USA"] }, { fact: "name" }, { fact: "come" }] } };
  const now = X.factsFromGoogle({ title: "Joes Plumbing", storefrontAddress: { addressLines: ["1 Main"] }, metadata: { mapsUri: "https://maps.google.com/?cid=1" },
    serviceArea: { places: { placeInfos: [{ placeName: "Mar Vista, Los Angeles, CA, USA" }, { placeName: "El Segundo, CA, USA" }] } } });
  if (now.mapsUri !== "https://maps.google.com/?cid=1" || !/metadata/.test(X.READ_MASK)) fail("the listing's own Google Maps link isn't read");
  const pr = X.progressOf(task, now, "2026-10-17T10:30:00Z");
  const st = Object.fromEntries(pr.items.map((x) => [`${x.kind}:${x.name}`, x.on]));
  if (st["area:Mar Vista"] !== true || st["area:Palms"] !== false || st["drop:Culver City, CA, USA"] !== true || st["name:Joe's Plumbing"] !== true || st["come:Address shown"] !== true || pr.at !== "2026-10-17T10:30:00Z" || pr.maps_uri !== "https://maps.google.com/?cid=1")
    fail(`each change isn't marked waiting / on Google from Google's own read (${JSON.stringify(pr)})`);
  if (X.progressOf(task, null, null).items.some((x) => x.on)) fail("with no read of Google yet, something is called \"on Google\"");
}
if (!/const prog = F\.progressOf\(task, now, atNow\);/.test(watch) || !/progress: prog/.test(watch) || !/done_note_until: new Date\(nowMs \+ 86400000\)/.test(watch) || !/let task = rec && rec\.tasks && rec\.tasks\[stepId\];/.test(watch)) fail("the nightly check doesn't store the client's progress / the one-day done note");
if (!/const chip = \(x\) => `<span class="pm-fx-pl \$\{x\.on \? "on" : "wait"\}">/.test(js) || !/return googleCardHtml\(\{ state: "rga", small: `RGA is changing this on Google[\s\S]{0,900}\$\{maps \? ` · \$\{gcardMaps\(maps\)\}` : ""\}` \}\);/.test(js)) fail("the client's step 7 doesn't show each change (waiting / on Google) with their Google Maps link");
if (!/function factsNoteHtml\(t\) \{/.test(js) || !/Google doesn't list \$\{/.test(js) || !/today <= g\.done_note_until/.test(js) || !/const fNote = factsNoteHtml\(factsTask\);/.test(js)) fail("the portal's top doesn't say when step 7 is done on Google, or that a place can't be found");
if (!/<span class="pm-fx-pls">\$\{items\.map\(chip\)\.join\(""\)\}<\/span>/.test(js)) fail("the client's step 7 doesn't draw the per-change chips");
{
  // the note, run for real
  const ni = portal.indexOf("function factsNoteHtml(t) {"), nj = portal.indexOf("\n}\n", ni);
  const nctx = { escapeHtml: esc, Date };
  vm.createContext(nctx);
  vm.runInContext(`${portal.slice(ni, nj + 2)}\nthis.note = factsNoteHtml;`, nctx);
  const miss = nctx.note({ status: "pending", google_push: { area_missing: ["Palms, CA"] } });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10), yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const done = nctx.note({ status: "done", client_input: { area: { add: ["Mar Vista", "Palms", "Playa Vista"] } }, google_push: { done_note_until: tomorrow } });
  if (!/Your turn/.test(miss) || !/Google doesn(?:'|&#39;)t list &quot;Palms&quot;: pick a nearby area/.test(miss)) fail("a place Google can't find isn't told at the top of the portal");
  if (!/Your 3 new service areas are on Google/.test(done) || !/Mar Vista, Palms, Playa Vista now show on your profile/.test(done)) fail("the top of the portal doesn't say step 7 is done on Google");
  if (nctx.note({ status: "done", google_push: { done_note_until: yesterday } })) fail("the done note stays after its day");
}
if (/send-email|sendEmail|send-step-email/.test(js.slice(js.indexOf("function factsNoteHtml"), js.indexOf("function factsNoteHtml") + 1800))) fail("the done note sends an email (not approved)");

// 🔴 10-16: the table first used ".ob-facts", a class an older admin component already styles as a flex column, so the
// headings fell out of line with the columns. Its class is defined once, as a table.
{ const acss = read("admin/admin.css"); if ((acss.match(/^\.ob-gbpfacts\s*\{/gm) || []).length !== 1 || !/\.ob-gbpfacts \{ width:100%; border-collapse:collapse;/.test(acss)) fail("the admin facts table's class is styled by another rule too (or isn't a table)"); }
if (F.length) { console.error("🔴 \"Check your business on Google\" isn't the approved build:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ business facts match Google: read first, compared universally (names, phones with country codes, sites with tags), a difference shows both, phone + website written and read back, name / address / area RGA's (Your action, nightly finishes it), the client record follows the answer (read back, recorded), admin shows confirmed · before · now, the nightly check watches it; step 7 after verify, numbers 1…N");
