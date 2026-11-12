#!/usr/bin/env node
// check-gbp-safety-steps.mjs — the Google profile safety steps do what the approved page says (gbp_protocols_v1, 11-1): the recheck dates, the suspension procedure, the website
// link choice, the pin line and the call-button taps label.
// 🔴 WHY: each of these is a promise that is easy to keep only on paper. "Stop every edit" means nothing unless the writes stop. "Tagged" is false unless Google read it back.
// A suspension card that says RGA will appeal contradicts contract Section 6A. A date nobody is told about is never looked at.
// HOLDS, through the real guard, the real send and the real list of open moves, with a stubbed network. Nothing here reaches Google or the database.
// Files only. Exit 0 = holds · 1 = broken · 2 = can't tell. → project_gbp_protocols
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m), ok = (c, m) => { if (!c) fail(m); };
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const req = createRequire(`${FN}/x.js`);
const FACTS = "m1.gbp.business_facts";
const world = { facts: {}, dbDown: false, consent: true };
const reached = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), m = init.method || "GET";
  if (url.startsWith("https://db.test/")) {
    if (world.dbDown && url.includes("client_onboarding_records")) return new Response("down", { status: 500 });
    if (url.includes("/client_google_oauth")) return new Response(JSON.stringify([{ client_id: "c1" }]));
    if (url.includes("/client_activity")) return new Response(JSON.stringify(world.consent ? [{ kind: "google_consent_agreed", created_at: "2026-11-03T18:00:00Z", payload: {} }] : []));
    if (url.includes("client_onboarding_records")) return new Response(JSON.stringify([{ data: { tasks: { [FACTS]: world.facts } } }]));
    return new Response("[]");
  }
  reached.push(`${m} ${url}`);
  return new Response("{}", { status: 200 });
};
req("./_deadline.js");
const S = req("../../shared/gbp-safety.js"), G = req("./_gbp-safety.js"), A = req("./_client-alerts.js"), Facts = req("./_gbp-facts.js");
const { openMoves, clientMoves } = req("./_open-moves.js");
const playbooks = JSON.parse(read("data/playbooks/playbooks.json"));
const LOC = "https://mybusinessbusinessinformation.googleapis.com/v1/locations/123";
const write = () => fetch(`${LOC}?updateMask=profile`, { method: "PATCH", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ profile: { description: "x" } }) });
const post = () => fetch(`https://mybusiness.googleapis.com/v4/accounts/1/locations/123/localPosts`, { method: "POST", body: "{}" });
const went = async (label, fn, want) => { reached.length = 0; const r = await fn(); const got = reached.length > 0; if (got !== want) fail(`${label}: ${want ? "was refused" : "reached Google"} (status ${r.status})`); return r; };

// ── 1 · Stop every edit means the writes stop ──
world.facts = {};
await went("no suspension, consent on file: a write goes", write, true);
world.facts = { suspension: { status: "open", found_at: "2026-11-01T00:00:00Z" } };
const refused = await went("an open suspension: a description write", write, false);
await went("an open suspension: a post", post, false);
ok(/suspended/i.test(JSON.stringify(await refused.json())), "the refusal doesn't say the profile is suspended");
world.facts = { suspension: { status: "closed", closed_at: "2026-11-02T00:00:00Z" } };
await went("a closed suspension: a write goes again", write, true);
world.dbDown = true; world.facts = {};
await went("can't read the record: fail closed", write, false);
world.dbDown = false;
world.consent = false; world.facts = {};
await went("the consent rule still comes first", write, false);
world.consent = true;
const consentSrc = read("netlify/functions/_google-consent.js");
ok(/if \(!agreed\) return REFUSAL;/.test(consentSrc) && /refusalForCore\(url, init/.test(consentSrc), "the consent or core-change guard was removed");

// ── 2 · the recheck dates ──
const item = (o = {}) => ({ id: "a", field: "main_category", status: "on_google", from: "Plumber", to: "Drainage service", sent_at: "2026-11-03T12:00:00Z", ...o });
const p = S.recheckPlan([item()]);
ok(p && p.rows[0].due.startsWith("2026-11-10") && p.rows[1].due.startsWith("2026-12-01"), "the dates aren't 1 week and 4 weeks after the change");
ok(!S.recheckPlan([item({ sent_at: null })]) && !S.recheckPlan([item({ status: "asked" })]) && !S.recheckPlan([item({ field: "phone" })]) && !S.recheckPlan(null), "a change that isn't a main category on Google got dates");
ok(S.recheckPlan([item(), item({ id: "b", sent_at: "2026-11-20T12:00:00Z" })]).id === "b", "an older change's dates outlive a newer change");
const T = (s) => Date.parse(s);
ok(S.rechecksDue([item()], T("2026-11-09T00:00:00Z")).length === 0, "a look is due before its date");
ok(S.rechecksDue([item()], T("2026-11-11T00:00:00Z")).map((r) => r.key).join() === "w1", "the 1-week look isn't due after its date");
ok(S.rechecksDue([item({ rechecks: { w1: { at: "x" } } })], T("2026-12-02T00:00:00Z")).map((r) => r.key).join() === "w4", "a recorded look stays due");
const wr = (it, key, res, now) => S.withRecheck(it, key, res, { by: "a@b", at: "2026-12-02T00:00:00Z", nowMs: T(now) });
ok(wr(item(), "w4", "keep", "2026-11-15T00:00:00Z").error, "a 4-week look can be recorded at 2 weeks");
ok(wr(item(), "w1", "put_back", "2026-11-11T00:00:00Z").error, "a put back can be recorded at 1 week");
ok(wr(item({ rechecks: { w4: { at: "x" } } }), "w4", "keep", "2026-12-02T00:00:00Z").error, "a look can be recorded twice");
ok(wr(item(), "w4", "keep", "2026-12-02T00:00:00Z").item?.rechecks?.w4?.result === "keep", "a 4-week look doesn't record");
const coreFn = read("netlify/functions/core-change.js");
ok(/lookDone = \{/.test(coreFn) && /action = "propose";/.test(coreFn) && /\[\.\.\.items\.map\(\(x\) => \(lookDone/.test(coreFn), "a put back doesn't go through the client's approval card");
ok(/requireWorkspaceForClient\(event, clientId\)/.test(coreFn) && /action === "answer" \? await requirePortalOwner/.test(coreFn), "who may answer changed");
ok(!/will (help|improve|rank)|guarantee/i.test(`${S.PUT_BACK_WHY} ${S.PUT_BACK_RULE}`) && /can't promise/.test(S.PUT_BACK_WHY), "the put-back words promise an outcome");
ok(/client approves/i.test(S.PUT_BACK_RULE), "the put-back rule doesn't say the client approves");

// ── 3 · reaching a person: To do ──
const moves = (facts, now = "2026-11-11T00:00:00Z", extra = {}) => openMoves({ playbooks, data: { tasks: { [FACTS]: facts, ...extra } }, now });
ok(moves({ core_changes: [item()] }).some((m) => m.kind === "category_recheck" && m.owner === "rga"), "a recheck that is due isn't on To do");
ok(!moves({ core_changes: [item()] }, "2026-11-05T00:00:00Z").some((m) => m.kind === "category_recheck"), "a recheck not yet due is on To do");
ok(!moves({ core_changes: [item({ rechecks: { w1: { at: "x" } } })] }).some((m) => m.kind === "category_recheck"), "a recorded look stays on To do");
const sm = moves({ suspension: { status: "open", found_at: "2026-11-01T00:00:00Z" } });
ok(sm.some((m) => m.kind === "profile_suspended" && m.owner === "rga" && /tell the client/i.test(m.what)), "an open suspension isn't on To do, or doesn't say to tell the client");
ok(!moves({ suspension: { status: "closed" } }).some((m) => m.kind === "profile_suspended"), "a closed suspension stays on To do");
ok(!clientMoves(sm, playbooks).some((m) => m.kind === "profile_suspended") && !clientMoves(moves({ core_changes: [item()] }), playbooks).some((m) => m.kind === "category_recheck"), "RGA's safety moves reach the client's To do");

// ── 4 · the website link: any client, their own site only ──
const V = (raw, base) => G.validateChoice(raw, base);
ok(/no website/i.test(V({ kind: "home" }, "").error || ""), "no website on file: the refusal doesn't say so, or something can still be chosen");
ok(V({ kind: "location", url: "https://other.com/x" }, "https://joes.com").error, "a page on another domain is allowed");
ok(V({ kind: "location", url: "" }, "https://joes.com").error, "a location page with no address is allowed");
ok(V({ kind: "other" }, "https://joes.com").error, "an unknown kind is allowed");
ok(V({ kind: "location", url: "https://www.joes.com/dallas" }, "joes.com").value?.url === "https://www.joes.com/dallas", "www or a bare address on file refuses their own page");
ok(V({ kind: "location", url: "https://smith.co.uk/leeds" }, "https://www.smith.co.uk").value, "a site outside the US is refused");
ok(V({ kind: "home" }, "https://facebook.com/joes").value?.url === "https://facebook.com/joes", "a client whose site is a page on another service loses their page");
ok(V({ kind: "home", tagged: false }, "https://joes.com").value?.tagged === false, "the tag can't be left off");
ok(V({ kind: "home" }, "https://joes.com/?utm_source=google&utm_medium=organic").value?.url === "https://joes.com/", "an old tag stays in the page address");
ok(G.baseWebsite({ google_push: { confirmed: { website: "https://joes.com/dallas" } } }, { website_url: "https://joes.com" }) === "https://joes.com", "a location page chosen earlier reads as the home page");
const tagged = new URL(G.linkFor("https://joes.com/", true));
ok(tagged.searchParams.get("utm_source") === "google" && tagged.searchParams.get("utm_medium") === "organic", "the link isn't tagged with google / organic");
ok(!/utm_/.test(G.linkFor("https://joes.com/", false)), "an untagged choice gets a tag");
ok(G.linkFor("https://joes.com/?utm_source=x", true) === "https://joes.com/?utm_source=x", "a link with its own tags gets ours too");
ok(G.linkKey("https://WWW.joes.com/?a=1&b=2") === G.linkKey("https://joes.com?b=2&a=1"), "the same link written two ways reads as different");
ok(G.linkKey("https://joes.com/a") !== G.linkKey("https://joes.com/b"), "two pages read as the same link");
// a redirect
const hopper = (map) => async (u) => { const h = map[u]; if (h === undefined) throw new Error("no"); return { status: h.s, headers: { get: () => h.to || null } }; };
const look = async () => [{ address: "93.184.216.34" }];
ok((await G.checkRedirect("https://joes.com/", { fetch: hopper({ "https://joes.com/": { s: 200 } }), lookup: look })).result === "ok", "a page that answers isn't ok");
ok((await G.checkRedirect("http://joes.com/", { fetch: hopper({ "http://joes.com/": { s: 301, to: "https://www.joes.com/" }, "https://www.joes.com/": { s: 200 } }), lookup: look })).result === "ok", "https + www on the same site reads as a forward");
const away = await G.checkRedirect("https://joes.com/", { fetch: hopper({ "https://joes.com/": { s: 302, to: "https://sold.example/x" } }), lookup: look });
ok(away.result === "redirects" && away.to === "sold.example", "a forward to another domain isn't caught");
ok((await G.checkRedirect("https://joes.com/", { fetch: async () => { throw new Error("x"); }, lookup: look })).result === "unknown", "a page that won't answer reads as a pass or a fail");
ok((await G.checkRedirect("https://joes.com/", { fetch: hopper({ "https://joes.com/": { s: 403 } }), lookup: look })).result === "unknown", "a 403 reads as a pass");
ok((await G.checkRedirect("https://joes.com/", { fetch: hopper({ "https://joes.com/": { s: 200 } }), lookup: async () => [{ address: "10.0.0.1" }] })).result === "unknown", "a private address gets fetched");
ok((await G.checkRedirect("https://joes.com/a", { fetch: hopper({ "https://joes.com/a": { s: 302, to: "/b" }, "https://joes.com/b": { s: 302, to: "/a" } }), lookup: look })).result === "unknown", "a redirect loop never ends, or reads as a pass");
const fnSrc = read("netlify/functions/admin-gbp-safety.js");
ok(/red\.result === "redirects"\) return json\(409/.test(fnSrc), "a forwarding page isn't refused on save");
// the send
const NOW = T("2026-11-20T00:00:00Z");
const send = async ({ live = {}, task = {}, after, refuseTest = false, refuseWrite = false }) => {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${url}`);
    if ((init.method || "GET") === "GET") return new Response(JSON.stringify(/readMask=websiteUri,metadata/.test(url) ? { websiteUri: live.site ?? "https://joes.com/", metadata: { hasVoiceOfMerchant: live.voice ?? true, hasPendingEdits: live.pending ?? false } } : { websiteUri: after ?? "https://joes.com/?utm_source=google&utm_medium=organic" }));
    if (/validateOnly/.test(url)) return refuseTest ? new Response(JSON.stringify({ error: { message: "no" } }), { status: 400 }) : new Response("{}");
    return refuseWrite ? new Response(JSON.stringify({ error: { message: "no" } }), { status: 403 }) : new Response("{}");
  };
  const res = await G.sendWebsiteChoice({ kind: "home", url: "https://joes.com/", link: "https://joes.com/?utm_source=google&utm_medium=organic", tagged: true }, task, { fetch: f, token: "t", loc: "locations/123", now: NOW });
  return { res, calls, writes: calls.filter((c) => c.startsWith("PATCH") && !/validateOnly/.test(c)), tests: calls.filter((c) => /validateOnly/.test(c)) };
};
let s = await send({});
ok(s.res.sentOk && s.res.wrote && s.res.choice.status === "on_google", "the normal send doesn't finish on Google");
ok(s.tests.length === 1 && s.writes.length === 1 && s.calls.findIndex((c) => /validateOnly/.test(c)) < s.calls.findIndex((c) => c.startsWith("PATCH") && !/validateOnly/.test(c)), "the test run doesn't come before the write");
ok(/readMask=websiteUri$/.test(s.calls[s.calls.length - 1]), "the link isn't read back after the write");
ok(!(await send({ after: "https://joes.com/" })).res.sentOk, "Google not showing the tag still says on Google");
s = await send({ live: { voice: false } }); ok(s.res.choice.status === "waiting" && !s.writes.length, "an unverified profile gets written");
s = await send({ live: { pending: true } }); ok(s.res.choice.status === "waiting" && !s.writes.length, "a write goes while Google shows a pending edit");
s = await send({ task: { google_push: { last_core_at: "2026-11-18T00:00:00Z" } } }); ok(s.res.choice.status === "waiting" && s.res.choice.not_before?.startsWith("2026-11-25") && !s.writes.length, "the one core change a week doesn't hold it");
s = await send({ live: { site: "https://other.com/" } }); ok(s.res.choice.status === "needs_rga" && !s.writes.length, "a link on another domain gets overwritten by a page choice");
s = await send({ live: { site: "https://joes.com/?utm_medium=organic&utm_source=google" } }); ok(s.res.sentOk && !s.res.wrote && !s.writes.length, "a link Google already shows is written again");
s = await send({ refuseTest: true }); ok(s.res.choice.status === "needs_rga" && !s.writes.length, "Google's test run saying no still writes");
s = await send({ refuseWrite: true }); ok(s.res.choice.status === "needs_rga" && !s.res.sentOk, "a refused write says on Google");
const withWrote = G.withChoiceResult({ google_push: { confirmed: { website: "https://joes.com" } }, client_input: { website: "https://joes.com" } }, { sentOk: true, wrote: true, choice: { status: "on_google", link: "L", url: "U" } }, "AT");
ok(withWrote.google_push.last_core_at === "AT" && withWrote.google_push.confirmed.website === "L" && withWrote.client_input.website === "L", "a sent link doesn't follow through to the record, or doesn't count toward the week");
ok(!G.withChoiceResult({ google_push: {} }, { sentOk: true, wrote: false, choice: { status: "on_google" } }, "AT").google_push.last_core_at, "a link already on Google counts as this week's change");
ok(G.choiceDueTonight({ website_choice: { status: "waiting", not_before: "2026-11-19T00:00:00Z" } }, NOW) && G.choiceDueTonight({ website_choice: { status: "saved" } }, NOW), "a due choice isn't sent");
ok(!G.choiceDueTonight({ website_choice: { status: "waiting", not_before: "2026-11-25T00:00:00Z" } }, NOW) && !G.choiceDueTonight({ website_choice: { status: "needs_rga" } }, NOW) && !G.choiceDueTonight({ website_choice: { status: "on_google" } }, NOW) && !G.choiceDueTonight({}, NOW), "a choice that isn't due goes out, or a failed one retries forever");
let touched = 0;
const capped = await G.nightlyChoice({ website_choice: { status: "waiting", nights: G.MAX_NIGHTS } }, { fetch: async () => { touched++; return new Response("{}"); }, token: "t", loc: "locations/1", now: NOW });
ok(capped.choice.status === "needs_rga" && touched === 0, "a waiting link is tried forever");
const counted = await G.nightlyChoice({ website_choice: { status: "waiting", nights: 2, link: "https://joes.com/", url: "https://joes.com/" } }, { fetch: async () => new Response(JSON.stringify({ websiteUri: "https://joes.com/", metadata: {} })), token: "t", loc: "locations/1", now: NOW });
ok(counted.choice.nights === 3, "a night's try isn't counted");
const gw = read("netlify/functions/_gbp-watch.js");
ok(/Safety\.choiceDueTonight\(task, nowMs\)/.test(gw) && /!d\.factsOnly && task && stepId === STEP\.FACTS\) \{\s*const Safety/.test(gw), "the nightly check doesn't send a waiting link, or Check Google now can write");
// step 4 agrees with the choice
const chosen = { website_choice: { status: "on_google", url: "https://joes.com/dallas", link: "https://joes.com/dallas?utm_source=google&utm_medium=organic" }, google_push: { confirmed: { website: "https://joes.com/dallas?utm_source=google&utm_medium=organic" } } };
ok(Facts.toldFacts({ website_url: "https://joes.com" }, chosen).website === "https://joes.com/dallas", "step 4 calls the chosen page a difference");
ok(Facts.toldFacts({ website_url: "https://joes.com" }, {}).website === "https://joes.com", "with no choice step 4 stops reading their website");
ok(!Facts.factsDrift(chosen, { website: "https://joes.com/dallas?utm_source=google&utm_medium=organic" }), "the nightly drift check calls the chosen link a change");
ok(!Facts.clientsPatch({ phone: "", website: "https://joes.com/dallas", come: "x" }, { website_url: "https://joes.com" }, chosen).website_url, "a chosen page overwrites the client's website on record");
ok(Facts.clientsPatch({ phone: "", website: "https://newsite.com", come: "x" }, { website_url: "https://joes.com" }, chosen).website_url === "https://newsite.com", "a client's real new website stops saving");
ok(/F\.clientsPatch\(parsed\.value, client \|\| \{\}, rec\.tasks\[stepId\]\)/.test(read("netlify/functions/portal-step-input.js")), "step 4's save doesn't tell clientsPatch about the choice");
ok(S.linkChoiceState({ ...chosen, google_push: { confirmed: { website: "https://other.com" } } }) === "stale", "a website changed on step 4 still says the choice stands");
ok(S.linkChoiceState(chosen) === "on_google" && S.linkChoiceState({}) === null && S.linkChoiceState({ website_choice: { url: "u", status: "waiting" } }) === "waiting", "the choice's state reads wrong");

// ── 5 · the pin ──
ok(S.pinApplies({ google_push: { after: { come: true } } }) === true && S.pinApplies({ google_push: { after: { come: false } } }) === false, "the pin line doesn't follow what Google shows");
ok(S.pinApplies({}, { geography_model: "single_location" }) === true && S.pinApplies({}, { geography_model: "service_area" }) === false, "the pin line doesn't follow the client's record");
ok(S.pinApplies({}, {}) === null && S.pinApplies(null, null) === null, "not knowing reads as a yes or a no");
ok(/S\.pinApplies\(task, client\) === false\) return json\(409/.test(fnSrc), "a pin answer saves on a business that hides its address");

// ── 6 · a suspension: what Google says ──
const J = A.judgeVoiceState;
ok(J({ complyWithGuidelines: { recommendationReason: "BUSINESS_LOCATION_SUSPENDED" } }).suspended === true, "Google's suspended isn't read");
ok(J({ complyWithGuidelines: { recommendationReason: "BUSINESS_LOCATION_DISABLED" } }).reason === "disabled", "Google's disabled isn't read");
ok(J({ verify: {} }).suspended === false && J({ hasVoiceOfMerchant: true }).suspended === false && J({ waitForVoiceOfMerchant: {} }).suspended === false, "needing to verify reads as suspended");
ok(J({}).suspended === null && J(null).suspended === null, "no answer reads as an answer");
ok(/start the suspension steps/.test(A.judgeListing({ metadata: { hasVoiceOfMerchant: false } }).message || ""), "when Google can't say which, the alert doesn't point at the steps");
const listing = async (loc, voice) => { const urls = []; const r = await A.readListing({ token: "t", loc: "locations/1", fetch: async (u) => { urls.push(u); if (/VoiceOfMerchantState/.test(u)) return typeof voice === "number" ? new Response("{}", { status: voice }) : new Response(JSON.stringify(voice)); return new Response(JSON.stringify(loc)); } }); return { r, urls }; };
let l = await listing({ openInfo: { status: "OPEN" }, metadata: { hasVoiceOfMerchant: true } }, {});
ok(l.urls.length === 1 && l.r.suspended === false && l.r.bad === false, "a listing in good standing costs a second read, or reads as suspended");
l = await listing({ openInfo: { status: "OPEN" }, metadata: { hasVoiceOfMerchant: false } }, { complyWithGuidelines: {} });
ok(l.r.suspended === true && l.r.bad === false, "a suspended listing isn't read, or raises two alerts");
l = await listing({ openInfo: { status: "OPEN" }, metadata: {} }, { complyWithGuidelines: {} });
ok(l.r.suspended === true, "Google leaving the false out hides a suspension");
l = await listing({ openInfo: { status: "OPEN" }, metadata: { hasVoiceOfMerchant: false } }, 403);
ok(l.r.suspended === null && l.r.bad === true, "a failed second read loses the listing alert, or reads as an answer");
l = await listing({ openInfo: { status: "OPEN" }, metadata: { hasVoiceOfMerchant: false } }, { verify: {} });
ok(l.r.suspended === false && l.r.bad === true, "an unverified listing stops alerting, or reads as suspended");
ok(/mybusinessverifications\.googleapis\.com\/v1\/\$\{loc\}\/VoiceOfMerchantState/.test(read("netlify/functions/_client-alerts.js")), "the read isn't Google's documented address");
ok(/method/.test(read("netlify/functions/_client-alerts.js").match(/async function readListing[\s\S]*?\n}\n/)[0]) === false, "the listing check does more than read");
// the record: one row per change, never a loop
const db = { rec: { tasks: {}, data: {} }, writes: 0, logged: 0 };
const dep = { supa: null, now: () => T("2026-11-20T00:00:00Z"), readStepRecord: async () => db.rec, writeStepTasks: async (_s, _r, tasks) => { db.writes++; db.rec = { tasks, data: { tasks } }; return { tasks }; }, record: async () => { db.logged++; } };
const sync = (suspended, reason) => G.syncSuspension(dep, { clientId: "c1", suspended, reason });
ok(await sync(null) === "unchanged" && db.writes === 0, "an unknown changes the record");
ok(await sync(false) === "unchanged" && db.writes === 0, "a healthy listing writes a row every night");
ok(await sync(true, "suspended") === "opened" && db.writes === 1 && db.logged === 1, "a suspension doesn't open the card, or isn't recorded");
ok(await sync(true, "suspended") === "unchanged" && db.writes === 1, "a listing that stays suspended writes a row every night");
ok(S.openSuspension(db.rec.tasks[FACTS]).told_at === null, "the client counts as told before anyone told them");
ok(await sync(null) === "unchanged" && !!S.openSuspension(db.rec.tasks[FACTS]), "an unknown closes the card");
ok(await sync(false) === "closed" && !S.openSuspension(db.rec.tasks[FACTS]) && db.rec.tasks[FACTS].suspension.closed_at, "Google saying it's clear doesn't close the card");
ok(await G.syncSuspension({ ...dep, readStepRecord: async () => null }, { clientId: "c1", suspended: true }) === "no_record", "a client with no record throws");
const watch = read("netlify/functions/client-alerts-watch.js");
ok(/alert: "suspended", bad: listing\.suspended/.test(watch) && /Safety\.syncSuspension\(/.test(watch), "the nightly check doesn't raise the alert or open the card");
ok(/or=\(source\.is\.null,source\.not\.like\.test:\*\)/.test(watch) && /MAX_PER_RUN/.test(watch), "the nightly check touches test clients or lost its bound");
ok(/client_listing_suspended_failed/.test(read("netlify/functions/notify-rga.js")) && A.ALERTS.suspended?.kind === "client_listing_suspended_failed", "the alert has no label");
const man = createRequire(`${FN}/x.js`)("./_job-manifest.js");
ok(!!(man.byName ? man.byName("client-alerts-watch") : null), "the nightly job left the manifest");

// ── 7 · the procedure and the client's words match contract Section 6A ──
const contract = read("netlify/functions/contract-generate.js");
ok(/Verification and reinstatement requests belong to Client\. Reinstatement work is not included/.test(contract), "the contract's Section 6A words changed: re-read this procedure against them");
const C = S.SUSPENSION_CLIENT;
const words = `${C.head} ${C.says} ${C.note}`;
ok(!/\b(we|rga)\b[^.]{0,30}\b(will|'ll|are going to)\b[^.]{0,30}\b(appeal|reinstate|restore|recover|fix)/i.test(words), "the client's card says RGA will appeal or get it back");
ok(!/\b(will come back|get it back|we'?ll get|guarantee|nothing .{0,20}lost)\b/i.test(words), "the client's card promises the profile comes back");
ok(/your own account/i.test(C.says) && /do not create a new listing/i.test(C.says) && /What RGA did/.test(C.says), "the client's card leaves out their own account, the new-listing warning or the records");
ok(/up to Google/i.test(C.note) && /isn't part of your plan unless we agree to it in writing/i.test(C.note) && /stay the owner/i.test(C.note), "the note leaves out that Google decides, that the work isn't included, or that they stay the owner");
const steps = S.SUSPENSION_STEPS;
ok(steps.map((x) => x.key).join() === "stop,fix,docs,appeal,no_new,tell", "the procedure's steps changed from the approved six");
const appeal = steps.find((x) => x.key === "appeal"), docs = steps.find((x) => x.key === "docs");
ok(/client sends it/i.test(appeal.detail) && /Section 6A/.test(appeal.detail) && /isn't included/.test(appeal.detail), "the procedure has RGA sending the appeal, or drops Section 6A");
ok(/match the profile/.test(docs.detail), "the documents line lost its rule");
ok(/no email/i.test(steps.find((x) => x.key === "tell").detail), "the tell step doesn't say no email");
const safetyFiles = ["shared/gbp-safety.js", "netlify/functions/_gbp-safety.js", "netlify/functions/admin-gbp-safety.js"].map(read).join("\n");
ok(!/—/.test(safetyFiles), "an em dash in the new copy");
ok(!/\b\d{1,3}\s?%|\bsuspension rate\b/i.test(words + steps.map((x) => `${x.label} ${x.detail}`).join(" ")), "a hardcoded rate in the procedure");
ok(!/send-|sendEmail|resend|mailer|notify-client/i.test(fnSrc), "the safety actions send a client email");
ok(/requireWorkspaceForClient\(event, clientId\)/.test(fnSrc), "the safety actions lost their auth");
ok(/open\.told_at\) return json\(409/.test(fnSrc), "the client can be told twice");
ok(!/googleapis\.com/.test(fnSrc) && !/method: "PATCH"[^\n]*googleapis/.test(fnSrc), "the safety actions write to Google outside the guarded send");
ok(/S\.openSuspension\(task\)\) return json\(409, \{ error: "Google has suspended/.test(fnSrc), "a link can be saved while the profile is suspended");

// ── 8 · the surfaces: one card design, what the client sees, the label ──
const adm = read("admin/admin.js"), por = read("portal/portal.js"), admCss = read("admin/admin.css");
ok(/import "\/shared\/gbp-safety\.js\?v=/.test(adm) && /import "\/shared\/gbp-safety\.js\?v=/.test(por), "the shared rules aren't loaded");
ok(/id === "m1\.gbp\.business_facts" \? (?:\(mgOn\(\) \? mwFactsCardHtml\(o, t\) : ""\) \+ )?gsFactsCardsHtml\(t\)/.test(adm), "step 28 doesn't carry the cards");
ok(/o\.flowId === "m1\.gbp\.business_facts" \? `<div class="ob-done-card">\$\{gsFactsCardsHtml\(s\.task\)\}/.test(adm), "a done step 28 loses the cards");
ok(/o\.flowId === "m1\.gbp\.optimize_categories" \? `<div class="ob-done-card"><div data-admin-core/.test(adm), "a done step 31 loses the dates");
ok(/gsCategoryCardsHtml\(items, clientId\)/.test(adm), "step 31 doesn't draw the dates");
const blockOf = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); return i < 0 || j < 0 ? "" : s.slice(i, j); };
const gsBlock = blockOf(adm, "const GS_FACTS", "function adminGoogleCardHtml(");
ok(gsBlock.length > 2000, "the admin block moved");
ok(/^const gsCard = [^\n]*=> adminCard\(/m.test(gsBlock) && !/ob-gcard/.test(gsBlock), "the admin cards aren't the one admin card");   // card_notice_designs_v1 §1: shared/admin-card.js
ok(!/—/.test(gsBlock), "an em dash in the admin cards");
ok(!/#[0-9a-f]{3,8}\b/i.test(gsBlock.replace(/&#\d+;/g, "")), "a colour picked in the admin cards");
ok(/plan\.rows\.some\(\(r\) => !r\.done\)\) return after/.test(gsBlock), "the scan-first card shows while a look is open");
ok(/No scan on record/.test(gsBlock), "a missing scan reads as a scan");
ok(/obStepRef\("m1\.audit\.grid_baseline"\)/.test(gsBlock) && !/step \d/.test(gsBlock.replace(/obStepRef/g, "")), "a step number is written by hand");
ok(/We do not move it/.test(gsBlock), "the pin line says RGA may move it");
ok(/applies === false\) return gsCard/.test(gsBlock), "a service-area business is asked about a pin");
ok(/if \(!base\) return gsCard/.test(gsBlock), "a client with no website is asked to choose");
ok(/Never a redirect or a forwarding domain/.test(gsBlock), "the redirect rule left the card");
ok(/data-gs-ask="Show this message on their portal Dashboard now\? No email is sent\."/.test(gsBlock), "the tell button doesn't confirm first");
const paused = blockOf(por, "function gbpPausedHtml", "// 🔒 WHAT TO EXPECT");
ok(/if \(!s \|\| !s\.told_at\) return "";/.test(paused), "the client sees the card before RGA tells them");
ok(/data-portal-goto="approve"/.test(paused), "the card doesn't link to their record of changes");
ok(/\$\{gbpPausedHtml\(onboarding\)\}/.test(por), "the Dashboard doesn't draw the paused card");
const res = blockOf(por, "function gbpLinkResultHtml", "/** Contract Section 6A");
ok(/linkChoiceState\(t\) !== "on_google"\) return "";/.test(res), "the client sees a link Google doesn't show");
ok(/data-cs-extra/.test(res) && /!c\.closest\("\[data-cs-extra\]"\)/.test(por), "the link card takes the step's how-to");
ok(!/best page/i.test(res) && !/best page/i.test(`${S.LINK_WHY.home} ${S.LINK_WHY.location}`) && /the page we chose/.test(S.LINK_WHY.home), "the client is told it's the best page");
ok(/\$\{step\.id === "m1\.gbp\.business_facts" \? gbpLinkResultHtml\(taskState\) : ""\}/.test(por), "step 4 doesn't draw the link result");
ok(/else if \(gvPaused\) html = csCard/.test(por), "step 2 asks a told client to verify");
// the label, everywhere a person reads it
ok(/caTile\("Call-button taps", cur\.gbp_calls/.test(por) && /<div class="lbl">Call-button taps<\/div>/.test(por), "the portal's tiles don't say Call-button taps");
ok(/call-button taps on Google<\/b>/.test(por), "the portal's summary sentence says calls");
ok(!/>Calls from Google<|"Calls from Google"|calls from Google<\/b>/.test(por), "the portal still says Calls from Google");
ok(/tile\("Call-button taps", cur\.gbp_calls/.test(adm) && !/"Calls \(GBP\)"/.test(adm), "admin's tile doesn't say Call-button taps");
ok(!/label: "Calls from Google"/.test(read("shared/monthly-health.js")), "the KPI alert label still says calls");
ok(!/ringing from search/.test(por), "the tile still says a tap is the phone ringing");
ok(!/\bspam\b/i.test(gsBlock), "spam reporting got built: it waits until a client exists");

if (F.length) { console.error(`❌ the Google profile safety steps — ${F.length} broken`); for (const m of F) console.error(`   ${m}`); process.exit(1); }
console.log("✅ Google profile safety steps: an open suspension stops every automated write (consent + approval rules intact) · recheck dates reach To do and a put back goes through the client's approval · the website link stays on their site, tagged, test-run, read back, never a redirect, tried a bounded number of nights · pin line for storefronts only · the procedure and the client's words match contract 6A and promise nothing · one admin card · call-button taps everywhere");
