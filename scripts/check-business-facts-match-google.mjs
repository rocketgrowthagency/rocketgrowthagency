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
  if (!/RGA to change on Google: business name, whether customers come to you, service area/.test(r5.error || "")) fail("RGA's to-do doesn't name what to change");
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
if (!/if \(stepId === "m1\.gbp\.business_facts"\) \{[\s\S]{0,700}F\.factsView\(google, F\.toldFacts\(client \|\| \{\}, rec && rec\.data && rec\.data\.tasks && rec\.data\.tasks\[stepId\]\)\)/.test(nc(read("netlify/functions/portal-gbp-profile.js")))) fail("the portal isn't sent Google beside what they told us");
const watch = nc(read("netlify/functions/_gbp-watch.js"));
if (!/if \(stepId === STEP\.FACTS\) return require\("\.\/_gbp-facts"\)\.factsDrift\(task, now\);/.test(watch) || !/if \(F\.rgaDone\(task, now\)\)/.test(watch) || !/kind: "gbp_facts_matched"/.test(watch)) fail("the nightly check doesn't watch the facts / finish RGA's change (recorded)");
const drift = nc(read("netlify/functions/admin-gbp-drift.js"));
if (!/stepId === STEP\.FACTS && push\.state === "with_rga"/.test(drift) || !/stepId === STEP\.FACTS \? \{ name: now\.name, come: now\.come \? "yes" : "no"/.test(drift)) fail("admin's put back / keep Google's doesn't handle the facts");
const admin = nc(read("admin/admin.js"));
if (!/const CLIENT_GBP_STEPS = \{ "m1\.gbp\.business_facts":/.test(admin) || !/const GBP_DRIFT_STEPS = \{ "m1\.gbp\.business_facts": "Business details"/.test(admin)) fail("admin doesn't count the step as the client's, or doesn't show a change on Google for it");
if (!/<table class="ob-facts"><thead><tr><th>Fact<\/th><th>Client confirmed<\/th><th>Google before<\/th><th>Google now<\/th>/.test(admin)) fail("admin's step card doesn't show confirmed · before · now for each fact");
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
// 🔒 the line above the rows says what's left to check, never the help sentence again (Chris 10-16 screenshot)
if (!/host\.innerHTML = left\.length \? `<span class="pm-gnow-k">\$\{left\.length\} to check:<\/span> \$\{escapeHtml\(left\.map\(\(k\) => LEFT\[k\]\)\.join\(", "\)\)\}\.`/.test(js) || /What Google shows now, next to what you told us\./.test(portal)) fail("the line above the facts repeats the help text instead of saying what's left to check");
if (!/else if \(kind === "facts"\) \{[\s\S]{0,1600}if \(missing\.length\) \{\s*if \(msg\) \{[^\n]*Answer \$\{missing\.join\(", "\)\} first\.[^\n]*\}\s*return;\s*\}/.test(js)) fail("a save with an unanswered line isn't stopped in the browser");
// 🔒 a pick SHOWS its answer at once, and the last open line SAVES (the pressed button spins) — Chris 10-16: "clicking it now
// and doing nothing"; a caution (showing an address) waits for Save
if (!/ans\.innerHTML = `✓ Your answer: <b>\$\{escapeHtml\(pick\.textContent\.trim\(\)\)\}<\/b> <button type="button" class="pm-linkbtn" data-fact-redo>Change<\/button>`;/.test(js)) fail("a pick doesn't show the client's answer (the button looks dead)");
if (!/if \(allAnswered && !caution\) \{ submitStepInput\(pick\); return; \}/.test(js) || !/async function submitStepInput\(btn\) \{/.test(js)) fail("answering the last open line doesn't save the step");
if (!/e\.target\.closest\("\[data-fact-redo\]"\)/.test(js)) fail("an answered line can't be changed");
if (!/step\.id === "m1\.gbp\.business_facts" && Array\.isArray\(g\.rga\) && g\.rga\.length/.test(js) || !/Google may ask you to verify the business again; we(?:'|’)ll tell you if it does\./.test(portal)) fail("the client isn't told RGA is changing their name / address on Google");

if (F.length) { console.error("🔴 \"Check your business on Google\" isn't the approved build:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ business facts match Google: read first, compared universally (names, phones with country codes, sites with tags), a difference shows both, phone + website written and read back, name / address / area RGA's (Your action, nightly finishes it), the client record follows the answer (read back, recorded), admin shows confirmed · before · now, the nightly check watches it; step 7 after verify, numbers 1…N");
