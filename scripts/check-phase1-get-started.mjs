#!/usr/bin/env node
// check-phase1-get-started.mjs — 2026-10-20, approved phase1_get_started_v1 (final review R3). Chris: "all approved… make sure
// they integrate with admin and database too". RUNS the server code on fakes and pins, for client steps 1–6:
//   1 kickoff  — "Booked" until the call is held (never Done on a diarised call); the agenda email is OFF unless
//                KICKOFF_AGENDA_EMAIL=on, goes 12–30 h before a confirmed call once, and promises nothing
//   2 verify   — the code goes on Google's own screen (typing it here is a fold, not the way); the filming guide covers a
//                storefront AND a service-area business; categories don't publish while Google reviews
//   4 facts    — ONE core change per week: a save writes phone OR website, queues the other 7 days on, a save inside the window
//                writes nothing new, RGA's name/address changes carry the same not-before; the nightly sends what's due
//   5 plan     — "Looks right" is the client's own answer (owner only, a locked plan only), shown on admin row 21
//   6 services — Google's own service types for the categories + what's on the profile (kept) + RGA's draft; ticks write
//                serviceItems (free-form under the main category) and read back; a client step 6 on every layer
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (m) => { try { return req(`${SITE}/netlify/functions/${m}`); } catch (e) { console.error(`⚠️  ${m} won't load: ${e.message}`); process.exit(2); } };
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), PB = JSON.parse(read("data/playbooks/playbooks.json"));
const NSO = read("netlify/functions/notify-step-open.js"), PUB = read("netlify/functions/gbp-publish.js"), WATCH = read("netlify/functions/_gbp-watch.js");
const OK = read("netlify/functions/portal-plan-ok.js"), INP = read("netlify/functions/portal-step-input.js"), DRIFT = read("netlify/functions/admin-gbp-drift.js");
const F = [], fail = (m) => F.push(m);
const A = Object.fromEntries([...PB.month1, ...PB.month2plus].map((s) => [s.id, s]));

// ── 1 · kickoff
if (!/booked && held \? \{ cls: "done", text: "Done" \}/.test(P) || !/: booked \? \{ cls: "rga booked", text: "Booked" \}/.test(P)) fail("step 1: a confirmed call reads Done before it's held (want Booked until the outcome or recap)");
if (!/kickoffBooked && !isDone \? \{ text: "Booked", cls: "rga booked" \}/.test(P)) fail("step 1: the row's own pill doesn't say Booked for a confirmed call");
const N = load("notify-step-open.js");
const NOW = Date.parse("2026-10-20T15:00:00Z"), at = (h) => new Date(NOW + h * 3600000).toISOString();
const on = { KICKOFF_AGENDA_EMAIL: "on" };
const cases = [["off by default", { kickoff_invite: { event_id: "e", start: at(20) } }, {}, false], ["confirmed, 20 h out", { kickoff_invite: { event_id: "e", start: at(20) } }, on, true],
  ["only requested", { kickoff_invite: { start: at(20) } }, on, false], ["already sent", { kickoff_invite: { event_id: "e", start: at(20), agenda_sent_at: "x" } }, on, false],
  ["held", { kickoff_invite: { event_id: "e", start: at(20), call_outcome: "held" } }, on, false], ["3 days out", { kickoff_invite: { event_id: "e", start: at(72) } }, on, false], ["2 h out", { kickoff_invite: { event_id: "e", start: at(2) } }, on, false]];
for (const [name, data, env, want] of cases) if (N.agendaDue(data, NOW, env) !== want) fail(`step 1 agenda: "${name}" → ${!want}, want ${want}`);
const mail = N.buildAgendaEmail({ business_name: "Rocket Plumbing", primary_contact_name: "Ana Lee", primary_contact_phone: "+1 424 555 0142", website_url: "https://www.rocketplumbing.com/", primary_market: "Culver City, CA" }, { start: at(20), client_tz: "America/Los_Angeles" });
if (!/Hi Ana,/.test(mail.markup) || !/Name: Rocket Plumbing/.test(mail.markup) || !/Phone: \(424\) 555-0142/.test(mail.markup) || !/Website: rocketplumbing\.com/.test(mail.markup) || !/Reply to this email/.test(mail.markup)) fail("step 1 agenda: the email doesn't carry the found facts to check and the reply line");
if (/guarantee|#1|rank(ing)? (in|on) \d|promise/i.test(mail.markup)) fail("step 1 agenda: the email promises a result");
const noSite = N.buildAgendaEmail({ business_name: "X" }, { start: at(20) });
if (/Website:|Phone:|undefined|NaN/.test(noSite.markup)) fail("step 1 agenda: missing facts print as empty lines / undefined");
if (!/if \(agendaDue\(data\)\) \{[\s\S]{0,700}agenda_sent_at: new Date\(\)\.toISOString\(\)[\s\S]{0,200}await writeTasks\(rec\.id, data, tasks\);[\s\S]{0,60}stamp first/.test(NSO)) fail("step 1 agenda: the sweep doesn't stamp before it sends");
// ── 2 · verify
if (!/Enter Google's code on Google, not here\./.test(P) || !/href="https:\/\/business\.google\.com\/"[^>]*>Enter it on Google ↗/.test(P)) fail("step 2: the code isn't sent to Google's own screen");
if (!/function gvCodeFallbackHtml\(\) \{\s*return `<details class="pm-gv-other">/.test(P)) fail("step 2: typing the code here isn't behind a fold (it must not be the way)");
if (/When the code arrives, type it here/.test(P) || /Type it here:`/.test(P)) fail("step 2: the card asks them to type the code here again");
if (!/A shop or office customers visit/.test(P) || !/You go to your customers/.test(P) || !/Only you, the owner, can record it/.test(P)) fail("step 2: the filming guide doesn't cover both kinds of business, or drops who can record it");
if (!/stepId === "m1\.gbp\.optimize_categories" && rec\?\.data\?\.tasks\?\.\["m1\.gbp\.verify"\]\?\.status !== "done"/.test(PUB)) fail("step 2: categories can go on Google while it's still being verified");
// ── 4 · one core change per week, RUN
const Fx = load("_gbp-facts.js");
const fakeApi = (loc) => { const patches = []; return { patches, fetch: async (url, init = {}) => {
  if ((init.method || "GET") === "PATCH") { const b = JSON.parse(init.body); patches.push({ mask: new URL(url).searchParams.get("updateMask"), body: b }); if (b.phoneNumbers) loc.phoneNumbers = b.phoneNumbers; if (b.websiteUri) loc.websiteUri = b.websiteUri; return { ok: true, json: async () => loc }; }
  return { ok: true, json: async () => loc }; } }; };
const base = () => ({ title: "Rocket Plumbing", phoneNumbers: { primaryPhone: "(424) 555-0199" }, websiteUri: "https://old.example.com", serviceArea: { places: { placeInfos: [{ placeName: "Culver City, CA, USA" }] }, regionCode: "US" } });
const val = { name: "Rocket Plumbing", come: "no", phone: "(424) 555-0142", website: "https://rocketplumbing.com", area: { ok: true } };
{ const loc = base(), api = fakeApi(loc);
  const r = await Fx.applyFacts(val, { fetch: api.fetch, token: "t", loc: "locations/1", now: NOW });
  if (api.patches.length !== 1 || api.patches[0].mask !== "phoneNumbers") fail(`step 4: a save with phone + website changed wrote ${api.patches.map((p) => p.mask).join(" + ") || "nothing"} (want the phone only)`);
  const q = (r.queue || []).find((x) => x.fact === "website");
  if (!q || Date.parse(q.not_before) !== NOW + 7 * 86400000) fail("step 4: the website isn't queued for 7 days later");
  if (r.state !== "with_rga" || !r.last_core_at) fail("step 4: a queued change doesn't keep the step with RGA, or the window start isn't recorded");
  // inside the window: nothing new written, both queued
  const loc2 = base(), api2 = fakeApi(loc2);
  const r2 = await Fx.applyFacts(val, { fetch: api2.fetch, token: "t", loc: "locations/1", now: NOW + 2 * 86400000, prev: { last_core_at: new Date(NOW).toISOString() } });
  if (api2.patches.length) fail("step 4: a save inside the week wrote a core field anyway");
  if ((r2.queue || []).length !== 2 || Date.parse(r2.queue[0].not_before) !== NOW + 7 * 86400000) fail("step 4: a save inside the week doesn't queue both changes from the window's end");
  // RGA's name change waits for the window too
  const loc3 = base(), api3 = fakeApi(loc3);
  const r3 = await Fx.applyFacts({ ...val, name: "Rocket Plumbing & Drain", website: "https://old.example.com" }, { fetch: api3.fetch, token: "t", loc: "locations/1", now: NOW });
  const nm = (r3.rga || []).find((x) => x.fact === "name");
  if (!nm || Date.parse(nm.not_before) !== NOW + 7 * 86400000) fail("step 4: RGA's name change doesn't wait for the next week after a phone change");
  // nothing to change: done, no queue
  const loc4 = { ...base(), phoneNumbers: { primaryPhone: "(424) 555-0142" }, websiteUri: "https://rocketplumbing.com" }, api4 = fakeApi(loc4);
  const r4 = await Fx.applyFacts(val, { fetch: api4.fetch, token: "t", loc: "locations/1", now: NOW });
  if (r4.state !== "on_google" || r4.queue) fail("step 4: a save that matches Google doesn't finish cleanly"); }
if (!/task\.google_push\.queue\.some\(\(x\) => Date\.parse\(x\.not_before \|\| ""\) <= nowMs\)/.test(WATCH) || !/F\.rgaDone\(task, now\) && !\(\(task\.google_push\.queue \|\| \[\]\)\.length\)/.test(WATCH)) fail("step 4: the nightly doesn't send a due change, or finishes the step while one is still queued");
if (!/Goes on Google \$\{escapeHtml\(monthDay\(x\.not_before\)\)\}/.test(P) || !/Queued · one change a week/.test(ADM)) fail("step 4: the portal or admin doesn't show the queued change and its date");
// ── 5 · looks right
if (!/requirePortalOwner\(event, clientId\)/.test(OK) || /requirePortalOwnerOrWorkspace/.test(OK)) fail("step 5: someone other than the client can answer \"Looks right\"");
if (!/if \(t\.status !== "done"\) return json\(409/.test(OK) || !/client_ok_at !== now\) return json\(500/.test(OK)) fail("step 5: \"Looks right\" saves on an unlocked plan or isn't read back");
if (!/data-kw-ok=/.test(P) || !/function planAnswerAdminHtml\(t\)/.test(ADM) || !/id === "m1\.strategy\.keywords_locations" \? planAnswerAdminHtml\(t\)/.test(ADM)) fail("step 5: the portal button or admin row 21's answer is gone");
if (/Opens once Search Console is connected/.test(P)) fail("step 5: the card still says it waits on Search Console");
// ── 6 · categories + services, RUN
const S = load("_gbp-services.js");
const loc = { categories: { primaryCategory: { name: "categories/gcid:plumber", displayName: "Plumber" }, additionalCategories: [{ name: "categories/gcid:drainage_service", displayName: "Drainage service" }] },
  serviceItems: [{ structuredServiceItem: { serviceTypeId: "job_type_id:drain_cleaning" } }, { freeFormServiceItem: { category: "categories/gcid:plumber", label: { displayName: "Gas line repair" } } }] };
const full = { categories: [{ name: "categories/gcid:plumber", displayName: "Plumber", serviceTypes: [{ serviceTypeId: "job_type_id:drain_cleaning", displayName: "Drain cleaning" }, { serviceTypeId: "job_type_id:leak_detection", displayName: "Leak detection" }] },
  { name: "categories/gcid:drainage_service", displayName: "Drainage service", serviceTypes: [{ serviceTypeId: "job_type_id:leak_detection", displayName: "Leak detection" }] }] };
const draft = "- displayName: Water heater repair\n  description: x\n- displayName: \"Leak detection\"\n- displayName: Gas line repair";
const v = S.servicesView(loc, full, draft);
const keys = v.options.map((o) => o.key);
if (v.categories.primary?.label !== "Plumber" || v.categories.additional.length !== 1) fail("step 6: the categories on Google aren't read");
if (keys.filter((k) => k === "g:job_type_id:leak_detection").length !== 1) fail("step 6: a service two categories share shows twice");
if (!keys.includes("f:gas-line-repair") || v.options.find((o) => o.key === "f:gas-line-repair").kind !== "yours") fail("step 6: a service the owner already has on Google isn't kept as theirs");
if (!keys.includes("f:water-heater-repair") || !v.suggested.includes("f:water-heater-repair")) fail("step 6: RGA's drafted service isn't offered as a suggestion");
if (keys.some((k) => /^f:leak-detection$/.test(k))) fail("step 6: RGA's draft duplicates one of Google's own services");
if (JSON.stringify([...v.on].sort()) !== JSON.stringify(["f:gas-line-repair", "g:job_type_id:drain_cleaning"])) fail(`step 6: what's on Google now is read wrong (${v.on.join(", ")})`);
const items = S.itemsFor(["g:job_type_id:leak_detection", "f:water-heater-repair", "x:not-offered"], v);
if (items.length !== 2 || !items[0].structuredServiceItem || items[1].freeFormServiceItem?.category !== "categories/gcid:plumber" || items[1].freeFormServiceItem.label.displayName !== "Water heater repair") fail("step 6: the write isn't Google's shape (structured ids; free-form under the main category; unknown keys dropped)");
const empty = S.servicesView({ categories: {} }, { categories: [] }, "");
if (empty.categories.primary || empty.options.length) fail("step 6: a profile with no categories invents options");
const s6 = A["m1.gbp.services_products"] || {};
if (s6.clientStepNo !== 6 || s6.clientPhase !== 1 || s6.clientBucket !== "supply" || s6.approvalSurface || s6.clientInput?.kind !== "checklist" || s6.clientInput?.cta !== "Put it on Google") fail("step 6: the playbook doesn't make admin 32 client step 6 (number, phase, supply, checklist, no separate approval)");
if (!/SERVICES: "m1\.gbp\.services_products"/.test(read("netlify/functions/_gbp-profile.js")) || !/stepId === STEP\.SERVICES\) return (await )?require\("\.\/_gbp-services"\)\.applyServices/.test(read("netlify/functions/_gbp-profile.js"))) fail("step 6: the save doesn't route to Google's services");
if (!/stepId === GSTEP\.ATTRS \|\| stepId === GSTEP\.SERVICES/.test(INP) || !/draft: servicesDraft/.test(INP)) fail("step 6: the save doesn't validate against the live options (with RGA's draft)");
if (!/if \(stepId === STEP\.SERVICES\) \{[\s\S]{0,200}now\.on/.test(WATCH) || !/stepId === STEP\.SERVICES \? now\.on \|\| \[\]/.test(DRIFT)) fail("step 6: the nightly drift check or admin's keep-Google's doesn't read the services");
if (!/"m1\.gbp\.services_products": "Services on Google/.test(ADM)) fail("step 6: admin row 32 isn't a Google row");
if (!/function svcFormHtml\(now, had/.test(P) || !/const picked = new Set\(Array\.isArray\(had\) \? had : \[\.\.\.onG, \.\.\.sug\]\)/.test(P) || !/Untick anything you don't offer/.test(P)) fail("step 6: the portal card is gone, or ticks Google's other services for them");
if (F.length) { console.error("🔴 Phase 1 (steps 1–6) regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ Phase 1 holds: kickoff Booked until held + agenda off-until-approved, once, no promises · code typed on Google, film guide for both kinds, categories held while verifying · one core change a week (queued, window, RGA too, nightly sends) · Looks right = the client's own · step 6 = Google's services + theirs kept + RGA's draft, written in Google's shape, on every layer");
