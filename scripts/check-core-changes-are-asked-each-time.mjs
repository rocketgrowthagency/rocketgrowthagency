#!/usr/bin/env node
// check-core-changes-are-asked-each-time.mjs — a client's Google name, address, phone or main category changes only with their approval of that exact value (approved client_core_change_approval_v1, contract Section 5B, 10-31).
// 🔴 WHY: most of Section 5B held only because the code couldn't write those fields. Admin's "Put it back" rewrote a phone with no ask and could overwrite a number the client changed on purpose; no card asked about the main category; a change by hand went unseen.
// HOLDS, through the real guard with a stubbed network: with consent but no approval each write is refused; the client's own answer, an approved value, and a save in progress pass; a different value doesn't; a categories write that resends the same main category passes; an unreadable record refuses.
// Then: only the owner answers; approval is saved before sending; five checks and a read-back; a week's wait; put-back is refused for these fields; the nightly check compares the main category; the cards exist.
// Files only. Exit 0 = holds · 1 = broken · 2 = can't tell. → project_everything_queued
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const req = createRequire(`${FN}/x.js`);
const world = { facts: {}, live: { name: "categories/gcid:plumber" }, dbDown: false };
const reached = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), m = init.method || "GET";
  if (url.startsWith("https://db.test/")) {
    if (world.dbDown && url.includes("client_onboarding_records")) return new Response("down", { status: 500 });
    if (url.includes("/client_google_oauth")) return new Response(JSON.stringify([{ client_id: "c1" }]));
    if (url.includes("/client_activity")) return new Response(JSON.stringify([{ kind: "google_consent_agreed", created_at: "2026-11-03T18:00:00Z", payload: {} }]));
    if (url.includes("client_onboarding_records")) return new Response(JSON.stringify([{ data: { tasks: { "m1.gbp.business_facts": world.facts } } }]));
    return new Response("[]");
  }
  if (m === "GET" && url.includes("readMask=categories")) return new Response(JSON.stringify({ categories: { primaryCategory: world.live } }));
  reached.push(`${m} ${url}`);
  return new Response("{}", { status: 200 });
};
req("./_deadline.js");
const C = req("./_core-change.js");
const LOC = "https://mybusinessbusinessinformation.googleapis.com/v1/locations/123";
const phone = (v) => fetch(`${LOC}?updateMask=phoneNumbers`, { method: "PATCH", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ phoneNumbers: { primaryPhone: v } }) });
const name = (v) => fetch(`${LOC}?updateMask=title`, { method: "PATCH", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ title: v }) });
const addr = () => fetch(`${LOC}?updateMask=storefrontAddress`, { method: "PATCH", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ storefrontAddress: { addressLines: ["1 New St"] } }) });
const cat = (n) => fetch(`${LOC}?updateMask=categories`, { method: "PATCH", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ categories: { primaryCategory: n ? { name: n } : undefined } }) });
const went = async (label, fn, want) => { reached.length = 0; const r = await fn(); const ok = reached.length > 0; if (ok !== want) fail(`${label}: ${want ? "was refused" : "reached Google"}`); return r; };
const item = (o) => ({ id: "x", kind: "proposal", status: "approved", ...o });

world.facts = {};
const refused = await went("a phone with no approval", () => phone("3105550142"), false);
if (refused.status !== 403 || !/Ask the client first/.test((await refused.clone().json()).error?.message || "")) fail("the refusal doesn't say to ask the client");
await went("a name with no approval", () => name("New Name"), false);
await went("an address with no approval", addr, false);
await went("a new main category with no approval", () => cat("categories/gcid:drain"), false);
await went("a categories write that clears the main category", () => cat(null), false);
await went("resending the same main category", () => cat("categories/gcid:plumber"), true);
await went("a description write", () => fetch(`${LOC}?updateMask=profile.description`, { method: "PATCH", headers: {}, body: "{}" }), true);

world.facts = { client_input: { phone: "(310) 555-0142" } };
await went("the client's own step 4 phone", () => phone("+1 310-555-0142"), true);
await went("a different phone than they gave", () => phone("3105550199"), false);
world.facts = { core_pending: { phone: "3105550142", at: new Date().toISOString() } };
await went("a step 4 save in progress", () => phone("3105550142"), true);
world.facts = { core_pending: { phone: "3105550142", at: new Date(Date.now() - 3600000).toISOString() } };
await went("an old pending save", () => phone("3105550142"), false);
world.facts = { core_changes: [item({ field: "phone", to: "3105550142" })] };
await went("an approved phone", () => phone("3105550142"), true);
await went("a phone other than the approved one", () => phone("3105550100"), false);
world.facts = { core_changes: [item({ field: "phone", to: "3105550142", status: "asked" })] };
await went("a phone only asked about", () => phone("3105550142"), false);
world.facts = { core_changes: [item({ field: "phone", to: "3105550142", status: "kept" })] };
await went("a phone the client said no to", () => phone("3105550142"), false);
world.facts = { core_changes: [item({ field: "main_category", to: "Drain cleaning service", to_name: "categories/gcid:drain" })] };
await went("an approved main category", () => cat("categories/gcid:drain"), true);
await went("a main category other than the approved one", () => cat("categories/gcid:other"), false);
world.facts = { core_changes: [item({ field: "name", to: "New Name" })] };
await went("an approved name", () => name("New Name"), true);
world.dbDown = true;
await went("an unreadable record", () => phone("3105550142"), false);
world.dbDown = false;
// the core guard ON ITS OWN: through the full guard an unreadable record is already refused by the suspension read before it, so the core
// guard's own catch was never reached. It must refuse by itself, so it holds the day the order of the reads changes.
{ const r = await C.refusalForCore(`${LOC}?updateMask=phoneNumbers`, { method: "PATCH", body: JSON.stringify({ phoneNumbers: { primaryPhone: "3105550142" } }) },
    { readRows: async () => { throw new Error("Supabase 500"); }, rawFetch: fetch, clientIds: ["c1"] });
  if (typeof r !== "string" || !r) fail("the core guard lets a write through when the client's record can't be read"); }

// the send: checks, week, test run, read back
const send = async (it, task, script) => {
  const calls = [];
  const res = await C.sendApproved(it, task, { token: "t", loc: "locations/123", now: Date.parse("2026-11-10T12:00:00Z"), fetch: async (u, i = {}) => { calls.push(`${i.method || "GET"} ${u}`); const r = script(u, i); return new Response(JSON.stringify(r.body || {}), { status: r.status || 200 }); } });
  return { res, calls };
};
const good = { metadata: { hasVoiceOfMerchant: true }, phoneNumbers: { primaryPhone: "3105550142" } };
let out = await send(item({ field: "phone", to: "3105550142" }), {}, () => ({ body: good }));
if (!out.res.sentOk || out.res.item.status !== "on_google") fail("an approved phone didn't go on Google");
if (!out.calls.some((c) => c.includes("validateOnly=true"))) fail("the send skips Google's test run");
out = await send(item({ field: "phone", to: "3105550142" }), { google_push: { last_core_at: "2026-11-08T12:00:00Z" } }, () => ({ body: good }));
if (out.res.item.status !== "waiting" || out.calls.some((c) => c.startsWith("PATCH"))) fail("a second core change in a week went straight on");
out = await send(item({ field: "phone", to: "3105550142" }), {}, () => ({ body: { metadata: { hasVoiceOfMerchant: false } } }));
if (out.res.item.status !== "waiting" || out.calls.some((c) => c.startsWith("PATCH"))) fail("a change went on while Google is reviewing the profile");
out = await send(item({ field: "phone", to: "3105550142" }), {}, (u, i) => (i.method ? { body: {} } : { body: { metadata: { hasVoiceOfMerchant: true }, phoneNumbers: { primaryPhone: "3105550000" } } }));
if (out.res.sentOk) fail("a change is called done when the read back shows something else");
out = await send(item({ field: "main_category", to: "Drain", to_name: "categories/gcid:drain" }), {}, (u, i) => {
  if (i.method) { const b = JSON.parse(i.body); if (b.categories.additionalCategories.some((c) => c.name === "categories/gcid:drain")) fail("the new main category is also left in the others"); if (!b.categories.additionalCategories.some((c) => c.name === "categories/gcid:keep")) fail("a main category change drops the other categories"); }
  return { body: { metadata: { hasVoiceOfMerchant: true }, categories: { primaryCategory: { name: "categories/gcid:drain" }, additionalCategories: [{ name: "categories/gcid:keep" }, { name: "categories/gcid:drain" }] } } };
});
if (!out.res.sentOk) fail("an approved main category didn't go on Google");
const t2 = C.withSendResult({ core_changes: [{ id: "x" }], google_push: {} }, { item: { id: "x", status: "on_google" }, sentOk: true, taskPatch: { phone: "3105550142", last_core_at: "2026-11-10T12:00:00Z" } });
if (t2.client_input.phone !== "3105550142" || t2.google_push.confirmed.phone !== "3105550142" || t2.google_push.last_core_at !== "2026-11-10T12:00:00Z") fail("after sending, the record doesn't say so, so tomorrow's check would call it changed");

// the nightly comparison
let n = C.noticeMainCategory({}, { mainCategory: { name: "a", label: "A" } });
if (!n.baseline) fail("the first look doesn't save what it saw");
n = C.noticeMainCategory({ core_main_category: { name: "a", label: "A" } }, { mainCategory: { name: "b", label: "B" } });
if (!n.drift || n.drift.google_name !== "b") fail("a changed main category isn't noticed");
if (C.noticeMainCategory({ core_main_category: { name: "a" } }, { mainCategory: { name: "a" } }).drift) fail("the same main category reads as changed");
if (C.coreDiffs({ saved: { website: "x" }, google: { website: "y" } }).length) fail("a website difference is treated as the client's to decide");
if (C.coreDiffs({ saved: { phone: "1" }, google: { phone: "2" } })[0]?.field !== "phone") fail("a phone difference isn't the client's to decide");

// the code around it
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const FNSRC = code(read("netlify/functions/core-change.js"));
if (!/action === "answer" \? await requirePortalOwner\(event, clientId\)/.test(FNSRC)) fail("someone other than the owner can answer");
if (!FNSRC.includes('status: "approved" };') || FNSRC.indexOf('status: "approved" };') > FNSRC.indexOf("C.sendApproved(")) fail("the approval isn't saved before the send, and the guard would refuse it");
if (!/x\.status === "kept" && x\.kind === "proposal"/.test(FNSRC)) fail("RGA can ask again about a change the client said no to");
if (!/if \(item\.status !== "asked"\)/.test(FNSRC)) fail("an answered question can be answered again");
if (!/require\("\.\/_core-change"\)\.coreDiffs\(task\.google_drift\)\.length\) return json\(409/.test(code(read("netlify/functions/admin-gbp-drift.js")))) fail("admin can put a phone back with no ask");
if (!/core_pending: \{ phone: parsed\.value\.phone/.test(read("netlify/functions/portal-step-input.js"))) fail("a client's own step 4 save would be refused: nothing writes the pending value first");
if (!/requirePortalOwner\(event, clientId\)/.test(read("netlify/functions/portal-step-input.js"))) fail("step 4 isn't the owner's own answer any more, so it can't count as approval");
const W = read("netlify/functions/_gbp-watch.js");
if (!/noticeMainCategory\(task, now\)/.test(W)) fail("the nightly check doesn't compare the main category");
if (!/x\.status === "waiting" && \(!x\.not_before/.test(W)) fail("nothing sends an approved change after its wait");
if (!/mainCategory:/.test(read("netlify/functions/_gbp-facts.js")) || !/READ_MASK = "[^"]*categories/.test(read("netlify/functions/_gbp-facts.js"))) fail("the facts read doesn't bring the main category");
const P = read("portal/portal.js"), A = read("admin/admin.js");
for (const w of ['data-core-answer="approve" data-core-id="${id}">Approve this change', "Keep what I have", "Google's number is right", "We'd like to change your", "Google shows a different"]) if (!P.includes(w)) fail(`the client's card lost: ${w}`);
if (!/fillCoreChanges\(clientId, token\)/.test(P)) fail("the portal never draws the cards");
if ((P.match(/fillCoreChanges\(clientId, token\)\.catch/g) || []).length < 2) fail("one way out of the approval tab skips the cards");
if (!/data-admin-core data-flow=/.test(A) || !/Ask the client which is right/.test(A) || !/data-core-propose/.test(A)) fail("admin can't ask or see the answer");

if (F.length) { console.error(`🔴 a core change can go without the client's approval — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ name, address, phone and a new main category need the client's approval of that exact value; their own answer counts; a resend passes; the send checks, waits and reads back; put-back asks instead; the nightly check compares the main category");
