#!/usr/bin/env node
// check-the-social-profiles-step-says-only-what-it-saw.mjs: approved client_social_profiles_v1 (built 11-01). RUNS the real finder, endpoint, website change and card on a fake database and fake websites. Nothing reaches a real site, a search API or Google.
//   · it reads the client's own website and spends no search. "Linked from your website", never "this is yours"; "not linked from your website", never "you don't have one"; a site it can't read is "Could not check"
//   · "opens" is only said where an address can prove it: a login wall's 200 is "Could not check", and only a clear 404 is dead
//   · only the client answers for their profiles. Any trade, any country, no website, no socials: every case ends somewhere
//   · what they confirm becomes a website change: only their approval of that version, read back live, link by link. A dead link reaches RGA's list each month
//   · the number comes from the playbook: 1..21 with no gap, this one right after the booking link. Step 15 reads the channel kept here, so nobody is asked twice
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { createRequire } from "node:module"; import { csBlock } from "./lib/portal-cs.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret", URL: "https://site.test", GITHUB_ADMIN_TOKEN: "gh-test", SUPABASE_WORKSPACE_ID: "w1" });
const CID = "11111111-1111-4111-8111-111111111111", K = "m1.brand.social_profiles", L = "m1.web.social_links", SITEURL = "https://sparks.test";
const ok = (b, s = 200) => new Response(s === 204 ? null : JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const DB = { rec: { id: 7, data: { tasks: {} } }, client: { id: CID, business_name: "Sparks Electric", website_url: SITEURL, workspace_id: "w1" }, writes: 0, dropWrite: false, month: { id: 9, data: { tasks: {} } } };
const WEB = {}, unexpected = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = (init.method || "GET").toUpperCase();
  if (u.startsWith("https://db.test")) {
    if (u.includes("/auth/v1/user")) return ok({ id: "u1", email: JSON.stringify(init.headers || {}).includes("rga") ? "someone@rocketgrowthagency.com" : "owner@sparks.test" });
    if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { if (!DB.dropWrite) { DB.rec.data = JSON.parse(init.body).data; DB.writes++; } return ok(null, 204); } return ok([JSON.parse(JSON.stringify(DB.rec))]); }
    if (u.includes("/rest/v1/profiles")) return ok([{ workspace_id: "w1", role: "owner" }]);
    if (u.includes("/rest/v1/client_portal_access")) return ok(u.includes("owner%40sparks.test") ? [{ client_id: CID }] : []);
    if (u.includes("/rest/v1/clients")) return ok([DB.client]);
    if (u.includes("/rest/v1/client_monthly_records")) return ok([JSON.parse(JSON.stringify(DB.month))]);
    return ok([]);
  }
  if (u.startsWith(SITEURL)) { const k = u.replace(/\?.*$/, ""); return WEB[k] !== undefined ? new Response(WEB[k], { status: 200 }) : new Response("nope", { status: 404 }); }
  unexpected.push(`${m} ${u.slice(0, 70)}`); return new Response("no", { status: 599 });
};
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let SP, H, adminH, portalD, FE, OM;
try { SP = req(path.join(SITE, "netlify/functions/_social-profiles.js")); H = req(path.join(SITE, "netlify/functions/portal-social-profiles.js")); adminH = req(path.join(SITE, "netlify/functions/admin-deliverables.js")).handler; portalD = req(path.join(SITE, "netlify/functions/portal-deliverables.js")).handler; FE = req(path.join(SITE, "netlify/functions/flow-execute.js")); OM = req(path.join(SITE, "netlify/functions/_open-moves.js")); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const net = (pages, { refuse = [], thrown = [] } = {}) => { const asked = []; return { asked, lookup: async () => [{ address: "93.184.216.34" }], now: () => Date.parse("2026-11-01T12:00:00Z"), get: async (u) => { asked.push(u); if (thrown.some((x) => u.includes(x))) throw new Error("no answer"); if (refuse.some((x) => u.includes(x))) return { status: 403, text: "" }; const k = Object.keys(pages).find((x) => u === x || u === `${x}/`); return k ? { status: 200, text: pages[k] } : { status: 404, text: "" }; } }; };
const HOME = `<html><head><script type="application/ld+json">{"@type":"LocalBusiness","sameAs":["https://www.youtube.com/@sparks"]}</script></head><body><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a><a href="https://www.youtube.com/@sparks">YT</a><a href="https://www.facebook.com/sparkselectric/">FB</a><a href="https://www.pinterest.com/sparks">P</a><a href="/about/">About</a></body></html>`;

// ── the finder ───────────────────────────────────────────────────────────────────────────────
let f = await SP.findProfiles(SITEURL, net({ [`${SITEURL}`]: HOME, [`${SITEURL}/about`]: `<a href="https://www.yelp.com/biz/sparks-electric">Yelp</a><a href="https://www.instagram.com/p/abc/">a post</a>` }));
const keyOf = (x) => x.found.map((p) => p.key).sort().join(",");
if (f.state !== "read" || keyOf(f) !== "facebook,yelp,youtube") fail(`the finder doesn't report what's linked, and only profiles (${f.state}: ${f.found && keyOf(f)})`);
if (f.found && f.found.some((p) => /sharer|\/p\//.test(p.url))) fail("a share button or a single post reads as a profile");
if (f.found && !f.found.find((p) => p.key === "youtube")?.in_schema) fail("the finder doesn't see the structured data");
if (f.found && f.found.find((p) => p.key === "facebook")?.in_schema) fail("a page link reads as being in the structured data");
if (!(f.not_linked || []).includes("Nextdoor") || (f.not_linked || []).includes("YouTube") || (f.not_linked || []).length !== 5) fail(`what's not linked is wrong (${f.not_linked})`);
for (const [site, opt, name] of [[SITEURL, { refuse: [SITEURL] }, "a refusal"], [SITEURL, { thrown: [SITEURL] }, "a timeout"]]) { const x = await SP.findProfiles(site, net({}, opt)); if (x.state !== "couldnt" || x.found || x.not_linked) fail(`${name} reads as an answer about their profiles (${x.state})`); }
{ const n0 = net({}); const x = await SP.findProfiles("", n0); if (x.state !== "no_website" || n0.asked.length) fail("no website isn't its own answer"); }
{ const n0 = { ...net({}), lookup: async () => [{ address: "169.254.169.254" }] }; const x = await SP.findProfiles(SITEURL, n0); if (x.state !== "couldnt" || n0.asked.length) fail("a private address is fetched"); }
{ const n0 = net({ [`${SITEURL}`]: `<a href="/contact">C</a><a href="/about">A</a><a href="/about-us">B</a>` }); await SP.findProfiles(SITEURL, n0); if (n0.asked.length > 3) fail(`the finder reads more than 3 pages (${n0.asked.length})`); if (n0.asked.some((u) => !u.startsWith(SITEURL))) fail("the finder reads somewhere other than their site"); }
{ const n0 = net({ [`${SITEURL}`]: `<a href="https://notfacebook.com.evil.test/sparks">x</a><a href="https://evil.test/facebook.com/sparks">y</a>` }); const x = await SP.findProfiles(SITEURL, n0); if (x.found.length) fail("a look-alike address reads as a profile"); }
const SRC = read("netlify/functions/_social-profiles.js") + read("netlify/functions/portal-social-profiles.js");
if (/serpapi|serp_api|google\.com\/search|maps\.googleapis|places\/v1/i.test(SRC.replace(/\/\/.*$/gm, ""))) fail("the finder spends a search");

// ── free text has no format ──────────────────────────────────────────────────────────────────
for (const [t, key] of [["facebook.com/acme", "facebook"], ["https://www.facebook.com/profile.php?id=123", "facebook"], ["https://m.facebook.com/acme?ref=x", "facebook"], ["www.instagram.com/acme/", "instagram"], ["https://www.linkedin.com/company/acme-ltd", "linkedin"], ["youtube.com/@Acme", "youtube"], ["https://www.tiktok.com/@acme", "tiktok"], ["https://twitter.com/acme", "x"], ["x.com/acme", "x"], ["https://www.yelp.com/biz/acme-toronto", "yelp"], ["https://nextdoor.com/pages/acme/", "nextdoor"], ["https://www.facebook.com/café-müller", "facebook"]]) {
  const p = SP.parseProfile(t); if (p.error || p.key !== key || !/^https:\/\//.test(p.url) || !p.handle) fail(`"${t}" isn't read as ${key} (${p.error || p.key})`); }
if (SP.parseProfile("https://www.facebook.com/profile.php?id=123").url !== "https://www.facebook.com/profile.php?id=123") fail("a Facebook id address loses its id");
for (const t of ["", "@acme", "my facebook", "https://example.com/acme", "https://www.facebook.com/sharer/sharer.php", "https://www.facebook.com/", "https://www.yelp.com/search?x=1", "https://facebook.com.evil.test/acme", "javascript:alert(1)"]) if (!SP.parseProfile(t).error) fail(`"${t}" is kept as a profile`);

// ── does it open ─────────────────────────────────────────────────────────────────────────────
const open = async (key, status, thrown) => (await SP.checkOpens({ key, url: "https://x.test/a" }, { now: () => 0, get: async () => { if (thrown) throw new Error("x"); return { status }; } })).state;
if (await open("youtube", 200) !== "opens") fail("a YouTube page that answers doesn't open");
if (await open("youtube", 404) !== "gone" || await open("facebook", 404) !== "gone") fail("a clear 404 isn't dead");
if (await open("facebook", 200) !== "couldnt" || await open("instagram", 200) !== "couldnt") fail("a login wall's 200 is read as the page opening");
if (await open("linkedin", 999) !== "couldnt" || await open("yelp", 403) !== "couldnt" || await open("youtube", 500) !== "couldnt") fail("a refusal reads as dead or open");
if (await open("youtube", 0, true) !== "couldnt") fail("no answer reads as dead");

// ── the endpoint ─────────────────────────────────────────────────────────────────────────────
const reset = (task = {}, site = SITEURL) => { DB.rec = { id: 7, data: { tasks: { "m1.gbp.photos": { keep: 1 }, "m1.access.website": { status: "done", access: { confirmed_at: "2026-10-01T00:00:00Z" } }, "m1.access.publish_test": { site_change: { v: "t1" }, published: { v: "t1", at: "2026-10-01T00:00:00Z" } }, [K]: task } } }; DB.client = { ...DB.client, website_url: site }; DB.writes = 0; DB.dropWrite = false; };
const OWNER = { authorization: "Bearer client" }, RGA = { authorization: "Bearer rga" };
const call = async (b, headers = OWNER) => { const r = await H.handler({ httpMethod: "POST", headers, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };
const T = () => DB.rec.data.tasks[K];
H.__useDeps(net({ [`${SITEURL}`]: HOME, "https://www.youtube.com/@sparks": "ok", "https://www.facebook.com/sparkselectric": "wall", "https://www.facebook.com/other": "wall", "https://www.instagram.com/sparks": "wall" }));
reset(); let x = await call({ action: "find" });
if (x.s !== 200 || T().finder?.state !== "read" || !T().finder.found.length) fail(`the finder's answer isn't kept (${x.s})`);
{ const ps = SP.profilesOf(T()), seen = T().finder.found;   // approved client_step10_auto_confirm_v1: what their own website links counts as theirs, and the step completes itself
  if (T().status !== "done" || SP.pendingOf(T()).length) fail("a site that links profiles doesn't complete the step by itself");
  if (ps.length !== seen.length || !ps.length || ps.some((p) => p.source !== "site" || p.by !== "their website" || !p.at || !p.check || !seen.some((f) => SP.sameUrl(f.url, p.url)))) fail("an auto-counted profile isn't recorded with source site, the date and by their website, or one that wasn't linked got counted");
  if (ps.find((p) => p.key === "facebook")?.check.state !== "couldnt") fail("an auto-counted login-wall profile says it opens"); }
{ const w = DB.writes; await call({ action: "find" }); if (DB.writes !== w) fail("the finder reads their site again on every load"); await call({ action: "find", force: true }); if (DB.writes === w) fail("Check again doesn't read again"); }
{ const n0 = JSON.stringify(T().client_input); for (const b of [{ action: "keep", url: "https://www.youtube.com/@sparks" }, { action: "add", url: "https://www.instagram.com/rgaby" }, { action: "not_mine", url: "https://www.youtube.com/@sparks" }, { action: "remove", url: "https://www.youtube.com/@sparks" }, { action: "change", url: "https://www.youtube.com/@sparks", to: "https://www.facebook.com/other" }]) if ((await call(b, RGA)).s !== 403 || JSON.stringify(T().client_input) !== n0) fail(`RGA can say a profile is the client's by hand (${b.action})`); }
if ((await call({ action: "none" }, RGA)).s !== 403) fail("RGA can answer for the client");
if ((await call({ action: "find", force: true }, RGA)).s !== 200) fail("RGA can't read their site again");
x = await call({ action: "keep", url: "https://notlisted.facebook.com/x" }); if (x.s === 200) fail("a profile the finder never saw can be kept");
x = await call({ action: "keep", url: "https://www.youtube.com/@sparks" });
if (x.s !== 200 || SP.profilesOf(T()).length !== 2 || T().client_input.profiles.find((p) => p.key === "youtube").by !== "their website") fail(`a Yes on an auto-counted profile rewrites it (${x.s} ${x.j.error || ""})`);
if (T().status !== "done") fail("an auto-counted step reopens when they press Yes");
if (DB.rec.data.tasks["m1.gbp.photos"].keep !== 1) fail("saving this step lost another step's record");
x = await call({ action: "not_mine", url: "https://www.facebook.com/sparkselectric/" });
if (x.s !== 200 || T().status !== "done" || SP.pendingOf(T()).length) fail(`"not mine" doesn't settle the step (${x.s} ${T().status})`);
{ const w0 = DB.writes, n0 = SP.profilesOf(T()).length;
  x = await call({ action: "keep", url: "https://www.youtube.com/@sparks" }); if (x.s !== 200 || !x.j.ok || !x.j.task || SP.profilesOf(T()).length !== n0) fail(`a second Yes, it's mine on a kept profile is refused or changes it (${x.s} ${x.j.error || ""})`);
  x = await call({ action: "not_mine", url: "https://www.facebook.com/sparkselectric/" }); if (x.s !== 200 || !x.j.ok) fail(`a second Not mine on one already set aside is refused (${x.s} ${x.j.error || ""})`);
  if (DB.writes !== w0) fail("a repeated answer writes again"); }
await call({ action: "find", force: true }); if (SP.pendingOf(T()).some((p) => p.key === "facebook")) fail("a profile they said isn't theirs comes back");
x = await call({ action: "add", url: "www.instagram.com/sparks" });
if (x.s !== 200 || !SP.profilesOf(T()).some((p) => p.key === "instagram" && p.source === "client" && p.check.state === "couldnt")) fail(`an added profile isn't kept, or its login wall reads as open (${x.s})`);
x = await call({ action: "add", url: "https://example.com/acme" }); if (x.s !== 400 || !/It can be/.test(x.j.error || "")) fail("a link to another site isn't refused plainly");
x = await call({ action: "change", url: "https://www.instagram.com/sparks", to: "https://www.facebook.com/other" });
if (x.s !== 200 || SP.profilesOf(T()).some((p) => p.key === "instagram") || !SP.profilesOf(T()).some((p) => p.key === "facebook")) fail(`Change it doesn't replace it (${x.s} ${x.j.error || ""})`);
x = await call({ action: "none" }); if (x.s !== 200 || SP.profilesOf(T()).length || T().status !== "done" || !T().client_input.none || SP.notMineOf(T()).length < 2) fail("\"I don't use social media\" with profiles saved doesn't turn them all off for good");
x = await call({ action: "find", force: true }); if (SP.profilesOf(T()).length) fail("the rule counts a profile again after they said they don't use social media");
x = await call({ action: "undo_none" });
reset(); await call({ action: "find" }); x = await call({ action: "remove", url: "https://www.facebook.com/sparkselectric/" }); x = await call({ action: "remove", url: "https://www.youtube.com/@sparks" });
if (T().status !== "done" || SP.profilesOf(T()).length) fail("a site that was read with nothing left to ask doesn't stay done when they take theirs off");
reset({ finder: { state: "read", found: [], not_linked: SP.LABELS, at: "x" } }); x = await call({ action: "none" });
if (x.s !== 200 || T().status !== "done" || !T().client_input.none) fail("\"I don't use social media\" isn't a real answer");
x = await call({ action: "undo_none" }); if (T().client_input.none) fail("they can't take that back");
reset({ finder: { state: "read", found: [], at: "x" } }); DB.dropWrite = true; x = await call({ action: "none" }); if (x.s !== 500) fail("a save that didn't read back said it worked"); DB.dropWrite = false;
reset({}, ""); x = await call({ action: "find" }); if (T().finder?.state !== "no_website") fail("no website doesn't end in its own answer");
x = await call({ action: "add", url: "yelp.com/biz/sparks" }); if (x.s !== 200 || T().status !== "done") fail("a client with no website can't finish the step");
reset(); x = await call({ action: "burn" }); if (x.s !== 400) fail("an unknown action is accepted");
{ const f2 = { state: "read", found: [{ key: "youtube", url: "https://www.youtube.com/@a" }, { key: "x", url: "https://x.com/a" }] }; if (SP.settle({ finder: f2, client_input: { profiles: [{ key: "youtube", url: "https://www.youtube.com/@a" }] } }, "t").status === "done") fail("the step finishes with a found profile still unanswered"); }
// the rule's edges: only site-linked and not dead; never without the site; nothing where the client has answered; a site that can't be read doesn't complete
{ const dead = net({ [`${SITEURL}`]: HOME, "https://www.youtube.com/@sparks": "ok" });   // facebook/sparkselectric answers 404 here
  H.__useDeps(dead); reset(); x = await call({ action: "find" });
  const ps = SP.profilesOf(T());
  if (ps.some((p) => p.key === "facebook") || !T().finder.found.find((f) => f.key === "facebook")?.gone) fail("a linked profile that doesn't open is counted, or isn't marked for RGA");
  if (ps.length !== 1 || T().status !== "done" || SP.pendingOf(T()).length) fail("a dead linked profile blocks the step or is asked of the client");
  H.__useDeps(net({ [`${SITEURL}`]: HOME, "https://www.youtube.com/@sparks": "ok", "https://www.facebook.com/sparkselectric": "wall" }));
  const only = await SP.autoCount({ finder: { state: "read", found: [], at: "x" } }, net({}), "t"); if (SP.profilesOf(only).length) fail("auto-counts with nothing linked from the site");
  const nosite = await SP.autoCount({ finder: { state: "couldnt", at: "x" }, client_input: {} }, net({}), "t"); if (SP.profilesOf(nosite).length) fail("auto-counts without the site source (site couldn't be read)");
  const typed = await SP.autoCount({ client_input: { profiles: [], not_mine: [] } }, net({}), "t"); if (SP.profilesOf(typed).length) fail("auto-counts with no finder at all");
  const said = await SP.autoCount({ finder: { state: "read", found: [{ key: "facebook", label: "Facebook", url: "https://www.facebook.com/x", handle: "x" }] }, client_input: { none: { at: "t" } } }, net({}), "t"); if (SP.profilesOf(said).length) fail("auto-counts over an I don't use social media");
  const nm = await SP.autoCount({ finder: { state: "read", found: [{ key: "facebook", label: "Facebook", url: "https://www.facebook.com/x", handle: "x" }] }, client_input: { not_mine: ["https://www.facebook.com/x"] } }, net({}), "t"); if (SP.profilesOf(nm).length) fail("auto-counts one they said isn't theirs");
  // a record from before the rule: nobody's answer on it gets the rule; a client's confirmed profile is left exactly as it is
  const fnd = { state: "read", found: [{ key: "youtube", label: "YouTube", url: "https://www.youtube.com/@sparks", handle: "@sparks" }], at: "x" };
  reset({ finder: fnd, status: "in_progress" }); x = await call({ action: "find" }); if (T().status !== "done" || SP.profilesOf(T()).length !== 1) fail("an old finder with nobody's answer doesn't get the rule");
  const mine = { key: "youtube", label: "YouTube", url: "https://www.youtube.com/@sparks", handle: "@sparks", source: "site", at: "2026-10-30T00:00:00Z", by: "owner@sparks.test", check: { state: "opens", at: "t" } };
  reset({ finder: fnd, status: "done", client_input: { profiles: [mine] } }); const w = DB.writes; x = await call({ action: "find" }); if (DB.writes !== w || JSON.stringify(T().client_input.profiles) !== JSON.stringify([mine])) fail("the rule rewrites a profile the client already confirmed");
  reset({ finder: fnd, status: "done", client_input: { profiles: [mine] } }); await call({ action: "find", force: true }); if (JSON.stringify(T().client_input.profiles.find((p) => p.key === "youtube")) !== JSON.stringify(mine)) fail("the finder running again rewrites a confirmed profile");
  H.__useDeps(net({}, { refuse: ["sparks"] })); reset(); x = await call({ action: "find" }); if (T().finder.state !== "couldnt" || T().status === "done" || SP.profilesOf(T()).length) fail("a site that blocks reading completes the step or counts a profile");
  H.__useDeps(null); }
H.__useDeps(null);

// ── the website change ───────────────────────────────────────────────────────────────────────
const SC = req(path.join(SITE, "shared/site-change.js"));
const seen = { state: "read", found: [{ key: "youtube", label: "YouTube", url: "https://www.youtube.com/@sparks", handle: "@sparks", on_page: true, in_schema: true }, { key: "facebook", label: "Facebook", url: "https://www.facebook.com/sparks", handle: "sparks", on_page: true, in_schema: false }], at: "x" };
const prof = (key, label, url, source = "site") => ({ key, label, url, handle: "h", source, check: { state: "couldnt" } });
if (SP.linkItems({ finder: { ...seen, found: [seen.found[0]] }, client_input: { profiles: [prof("youtube", "YouTube", "https://www.youtube.com/@sparks")] } }).length) fail("a profile already linked and in the schema is drafted as a change");
{ const it = SP.linkItems({ finder: seen, client_input: { profiles: [prof("youtube", "YouTube", "https://www.youtube.com/@sparks"), prof("facebook", "Facebook", "https://www.facebook.com/sparks"), prof("yelp", "Yelp", "https://www.yelp.com/biz/s", "client")] } });
  if (it.length !== 2 || it[0].label !== "Link to Yelp" || !/sameAs/.test(it[1].after) || it[1].check !== false) fail(`the change holds more or less than what's missing (${it.map((i) => i.label)})`); }
const adm = async (b, headers = { "x-internal-secret": "gate-secret" }) => { const r = await adminH({ httpMethod: "POST", headers, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body || "{}") }; };
reset({ finder: seen, status: "done", client_input: { profiles: [prof("yelp", "Yelp", "https://www.yelp.com/biz/s", "client")] } });
const pre = await adm({ key: L, site_action: "prefill" });
if (!(pre.j.change?.items || []).some((i) => i.label === "Link to Yelp" && i.after === "https://www.yelp.com/biz/s")) fail(`the change doesn't draft itself from what they confirmed (${pre.s} ${pre.j.error || ""})`);
if (pre.j.change?.page_url !== SITEURL) fail("the change isn't for their own home page");
const sv = await adm({ key: L, site_action: "save", change: pre.j.change }); if (sv.s !== 200) fail(`the change doesn't save (${sv.j.error})`);
const se = await adm({ key: L, internal_decision: "approved" }); if (se.s !== 200) fail(`the change isn't sent (${se.j.error})`);
if ((await adm({ key: L, site_action: "publish" })).s === 200) fail("the links go live before the client says yes");
if ((await adm({ key: L, site_action: "own_approve", read: true }, RGA)).s === 200) fail("RGA's press approves the links");
const v = DB.rec.data.tasks[L].site_change.v;
const dec = await portalD({ httpMethod: "POST", headers: OWNER, body: JSON.stringify({ client_id: CID, key: L, decision: "approved", change_v: v }) });
if (dec.statusCode !== 200) fail(`the client can't approve the links (${dec.body.slice(0, 100)})`);
if ((await adm({ key: L, site_action: "open_pr" })).s === 200) fail("the links open a pull request that can't be built");
WEB[`${SITEURL}`] = "<html><body><footer>no link yet</footer></body></html>"; WEB[`${SITEURL}/`] = WEB[`${SITEURL}`];
if ((await adm({ key: L, site_action: "publish" })).s === 200) fail("Mark live passes with the link not on the page");
WEB[`${SITEURL}`] = '<html><body><footer><a href="https://www.yelp.com/biz/s">Yelp</a></footer></body></html>'; WEB[`${SITEURL}/`] = WEB[`${SITEURL}`];
{ const live = await adm({ key: L, site_action: "publish" }); if (live.s !== 200 || DB.rec.data.tasks[L].published?.checked !== true) fail(`the link read back from their page doesn't finish it (${live.s} ${live.j.error || ""})`); }

// ── each month, and the channel ──────────────────────────────────────────────────────────────
reset({ status: "done", client_input: { profiles: [prof("youtube", "YouTube", "https://www.youtube.com/@gone")] } });
{ const line = await FE.socialLinksLine(CID, net({})); if (!/didn't open/.test(line) || T().client_input.profiles[0].check.state === "couldnt") fail(`a dead link isn't found each month (${line})`); }
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
{ const moves = OM.openMoves({ playbooks: PB, data: { tasks: { [K]: { status: "done", client_input: { profiles: [{ ...prof("youtube", "YouTube", "u"), check: { state: "gone", at: "2026-11-01T00:00:00Z" } }] } } } }, now: "2026-11-01T12:00:00Z" });
  if (!moves.some((m) => m.kind === "social_link_dead" && m.owner === "rga")) fail("a dead link doesn't reach RGA's list");
  const quiet = OM.openMoves({ playbooks: PB, data: { tasks: { [K]: { status: "done", client_input: { profiles: [prof("facebook", "Facebook", "u")] } } } }, now: "2026-11-01T12:00:00Z" });
  if (quiet.some((m) => m.kind === "social_link_dead")) fail("\"Could not check\" reads as a dead link"); }
reset({ client_input: { profiles: [prof("youtube", "YouTube", "https://www.youtube.com/@sparks")] } });
{ const o = await FE.withTheirChannel(CID, { summary: "S", outcome_data: {} }); if (!/Don't make a second/.test(o.summary) || o.outcome_data.their_channel !== "https://www.youtube.com/@sparks") fail("step 15's run doesn't use the channel they kept"); }
reset({}); { const o = await FE.withTheirChannel(CID, { summary: "S", outcome_data: {} }); if (o.summary !== "S") fail("a client with no channel is told they have one"); }

// ── the number and the row ───────────────────────────────────────────────────────────────────
const CS = JSON.parse(read("data/playbooks/client-steps.json"));
const nums = [...PB.month1, ...PB.month2plus].filter((s) => s.clientStepNo).map((s) => s.clientStepNo).sort((a, b) => a - b);
if (nums.join() !== Array.from({ length: nums.length }, (_, i) => i + 1).join()) fail(`client numbers don't run 1, 2, 3 (${nums})`);
const num = (id) => PB.month1.find((s) => s.id === id)?.clientStepNo;
if (num(K) !== num("m1.gbp.booking_link") + 1 || num("m1.gbp.photos") !== num(K) + 1) fail("the step isn't right after the booking link");
const ix = PB.month1.findIndex((s) => s.id === K); if (PB.month1[ix - 1]?.id !== "m1.gbp.booking_link") fail("the admin row isn't beside the booking link");
if (PB.month1[ix].clientOptional !== true || PB.month1[ix].clientMinutes !== 2) fail("the step isn't the short, optional one approved");
if ((PB.month1[ix].dependsOn || []).length) fail("the step waits on Google or their website, so a client with neither can't do it");
if (!(CS.month1 || CS).length && !CS.month1) fail("no projection");
if (!(CS.month1 || []).some((s) => s.id === K && s.clientStepNo === num(K))) fail("the step isn't in what the portal reads");
if (!read("netlify/functions/_deliverables.js").includes(`CLIENT_APPROVABLE["${L}"]`)) fail("the links can't reach For your approval");

// ── the card, run ────────────────────────────────────────────────────────────────────────────
const P = read("portal/portal.js"), STEP_LOCK = createRequire(import.meta.url)(`${SITE}/shared/step-lock.js`);
const moved = (w) => { console.error(`⚠️  INDETERMINATE: ${w} moved`); process.exit(2); };
const fn = (n) => { const m = new RegExp(`^(?:async )?function ${n}\\(`, "m").exec(P); if (!m) moved(`function ${n}`); const e = P.indexOf("\n}\n", m.index); return P.slice(m.index, e + 2); };
const line = (n) => { const m = new RegExp(`^const ${n} = [^\\n]*$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0].replace(/^const /, "var "); };
const ctx = vm.createContext({ Date, JSON, Number, Set, Map, Array, String, Object, Math, RegExp, Intl, Boolean, console, CSS: { escape: (x) => String(x) }, document: { querySelectorAll: () => [] },
  escapeHtml: (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;"), fmtDateShort: (x) => String(x || "").slice(0, 10), stepLockOf: (id, t) => STEP_LOCK.stepLock(id, t, {}) });
try {
  const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) moved("the plan-card pieces");
  const hand = P.slice(a, b);
  for (const code of [line("monthDay"), hand, csBlock(P, hand)]) vm.runInContext(code.replace(/^const /gm, "var "), ctx);
  vm.runInContext(`var ogK5 = (html) => \`<div class="pm-k5">\${html}</div>\`;`, ctx);
  for (const n of ["_socialForm", "_socialEdit", "_socialFound", "_socialFailed", "_socialChannel", "socialSame", "socialName", "socialLink"]) vm.runInContext(line(n), ctx);
  vm.runInContext(fn("socialCodeOnly") + fn("socialFormHtml") + fn("socialCard"), ctx);
} catch (e) { console.error(`⚠️  INDETERMINATE: the card doesn't load (${e.message})`); process.exit(2); }
const card = (task = {}, c = {}) => { ctx.__c = { clientId: "c1", task, isDone: task.status === "done", status: task.status || "pending", tasks: c.tasks || {} }; const o = vm.runInContext(`socialCard({}, __c)`, ctx); return { ...o, text: o.html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ") }; };
const NEVER = /you (do not|don't) have|you have no\b|no profiles? (found|exist)|this is yours|it's yours\b(?! ·)|your (facebook|instagram|youtube) is\b/i;
const say = (name, o, must, mustNot = []) => { for (const w of must) if (!o.text.includes(w) && !o.html.includes(w)) fail(`${name}: doesn't say "${w}": ${o.text.slice(0, 160)}`); for (const w of mustNot) if (o.text.includes(w) || o.html.includes(w)) fail(`${name}: says "${w}"`); const flat = o.text; if (NEVER.test(flat)) fail(`${name}: claims what it didn't see: ${flat.slice(0, 160)}`); };
const yt = { key: "youtube", label: "YouTube", url: "https://www.youtube.com/@rga", handle: "@rga", on_page: true, in_schema: true };
say("not read yet", card({}), ["Checking your website for your profiles…"], ["Add a profile"]);
{ const o = card({ finder: { state: "read", found: [yt], not_linked: ["Facebook", "Instagram"], at: "x" } }); say("found", o, ["1 profile found · is it yours?", "YouTube · @rga", "Linked from your website", "Yes, it's mine", "Not mine", 'data-social-act="not_mine"', "We only check these are yours. RGA never posts on your accounts or changes them.", "Not linked from your website: Facebook, Instagram.", "Add a profile", "data-social-keep"], ["I don't use social media", "you don't", "RGA's pick", "Keep it", "Change it"]); if (o.pills.map((p) => p[0]).join("|") !== "Your turn|About 2 min|Optional") fail(`the pills aren't the approved ones (${o.pills})`); }
say("found 2", card({ finder: { state: "read", found: [yt, { ...yt, key: "x", label: "X", url: "https://x.com/rga" }], not_linked: [], at: "x" } }), ["2 profiles found · are they yours?"]);
say("nothing linked", card({ finder: { state: "read", found: [], not_linked: ["Facebook"], at: "x" } }), ["No profiles linked from your website · do you have any?", "Not linked from your website: Facebook", "Add a profile"]);
say("couldn't check", card({ finder: { state: "couldnt", reason: "the site refused our check", at: "x" } }), ["Could not check your website", "That says nothing about your profiles", "Check again", "Add a profile"], ["Not linked from your website"]);
say("no website", card({ finder: { state: "no_website", at: "x" } }), ["No website on file to check", "Add a profile"], ["I don't use social media", "Not linked from your website", "On your website"]);
const kept = (state) => ({ ...yt, source: "site", check: { state, at: "2026-11-01T00:00:00Z" } });
{ const o = card({ status: "done", completed_at: "2026-11-01T00:00:00Z", finder: { state: "read", found: [yt], at: "x" }, client_input: { profiles: [kept("opens")] } }); say("done", o, ["RGA keeps these working", "checked", "YouTube · @rga", " opens", "On your website and in its schema", "after your approval", "Change something"]); if (o.pills[0][0] !== "Done") fail("the done row isn't Done"); }
{ const o = card({ finder: { state: "read", found: [], at: "x" }, client_input: { profiles: [{ ...kept("opens"), at: "2026-11-04T12:00:00Z" }] } }); say("confirmed row", o, ["Yours · confirmed", 'data-social-act="not_mine"', "Not mine"], ["Change it", "Remove"]); }
{ const css = read("portal/portal.css"); if (!/\[data-social-step\] \.pm-cs-st \.a > button\.pm-amend \{[^}]*border:1px solid/.test(css)) fail("Yes, it's mine renders as plain text again (the status row's bare-link rule beats .pm-amend)"); if (!/\[data-social-step\] \.pm-k5-acts \{ margin-top:18px/.test(css)) fail("no 18px above Add a profile"); }
{ const h = P.slice(P.indexOf("async function socialCall") - 0, P.indexOf("/** A day tile's span")); if (!/body\.action === "not_mine" && !t\.closest\("\.pm-soc-form"\)\) _socialForm\.set\(clientId, \{ from: null, nm: true \}\)/.test(h)) fail("Not mine doesn't offer the paste field"); }
{ const auto = { ...kept("couldnt"), key: "facebook", label: "Facebook", url: "https://www.facebook.com/sparks", handle: "sparks", by: "their website" };
  const o = card({ status: "done", finder: { state: "read", found: [yt], at: "x" }, client_input: { profiles: [auto] } }); say("auto done", o, ["Done · we found these on your website", "Linked from your website", 'data-social-act="not_mine"', "Not mine", "We only check these are yours. RGA never posts on your accounts or changes them.", "Add a profile", "I don't use social media"], ["Your turn", "About 2 min", "Yes, it's mine"]);
  if (o.pills.length !== 1 || o.pills[0][0] !== "Done") fail("an auto-counted step shows a Your turn pill instead of Done");
  // social_found_where_v1 (approved 11-8): a profile only in the page code (schema sameAs, RGA's YouTube) is never "linked from your website"
  { const A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
    if (!/const codeOnly = \(u\) => \{ const x = \(\(f && f\.found\) \|\| \[\]\)\.find\(\(y\) => same\(y\.url, u\)\); return !!\(x && x\.in_schema && !x\.on_page\); \};/.test(A) || !/\$\{linked\(p\.url\)\} the client confirmed it/.test(A) || !/const linked = \(u, sep = ","\) => \(codeOnly\(u\) \? "In their website's page code, not a link visitors can click ·" : `Linked from their website\$\{sep\}`\);/.test(A)) fail("admin's social card says 'Linked from their website' for a profile only in the page code"); }
  const ytCode = { ...yt, url: "https://www.youtube.com/@code", handle: "@code", on_page: false, in_schema: true };
  const codeAuto = { ...kept("opens"), key: "youtube", label: "YouTube", url: ytCode.url, handle: "@code", by: "their website", source: "site" };
  const oc = card({ status: "done", finder: { state: "read", found: [ytCode], at: "x" }, client_input: { profiles: [codeAuto] } });
  say("code only, done", oc, ["In your website's page code", "We'll add a link your visitors can click."], ["Linked from your website"]);
  const op = card({ finder: { state: "read", found: [ytCode], not_linked: [], at: "x" } }); say("code only, asked", op, ["In your website's page code"], ["Linked from your website"]);
  const n = card({ status: "done", finder: { state: "read", found: [], at: "x" } }); say("auto none found", n, ["Done · no profiles linked from your website", "Have one? Add it, and we'll link it the same way.", "Add a profile"], ["I don't use social media", "Your turn"]);
  say("couldn't read stays open", card({ finder: { state: "couldnt", reason: "x", at: "x" } }), ["Could not check your website"], ["Done · "]); }
say("done, could not check", card({ status: "done", finder: { state: "read", found: [], at: "x" }, client_input: { profiles: [{ ...kept("couldnt"), key: "facebook", label: "Facebook" }] } }), ["Could not check"], [" opens"]);
say("done, dead", card({ status: "done", finder: { state: "read", found: [], at: "x" }, client_input: { profiles: [kept("gone")] } }), ["didn't open. RGA is looking at it."], [" opens"]);
say("done, already on site", card({ status: "done", links_needed: 0, finder: { state: "read", found: [yt], at: "x" }, client_input: { profiles: [kept("opens")] } }), ["Already on your website and in its schema"], ["after your approval"]);
{ const lk = { site_change: { v: "1" }, internal_review: { decision: "approved", change_v: "1" } }; say("sent", card({ status: "done", finder: { state: "read", found: [], at: "x" }, client_input: { profiles: [kept("opens")] } }, { tasks: { [L]: lk } }), ["in For your approval"], ["after your approval"]);
  say("live", card({ status: "done", finder: { state: "read", found: [], at: "x" }, client_input: { profiles: [kept("opens")] } }, { tasks: { [L]: { ...lk, approval: { decision: "approved", change_v: "1" }, published: { v: "1", at: "2026-11-02T00:00:00Z" } } } }), ["On your website and in its schema"], ["after your approval", "in For your approval"]); }
say("done, no website", card({ status: "done", finder: { state: "no_website", at: "x" }, client_input: { profiles: [kept("opens")] } }), ["RGA keeps these working"], ["On your website"]);
say("none", card({ status: "done", client_input: { none: { at: "2026-11-01T00:00:00Z" } } }), ["You don't use social media", "I do use social media"], ["RGA keeps these working"]);
{ const c = card({ client_input: { profiles: [kept("opens")] }, finder: { state: "read", found: [], at: "x" }, status: "done" }); if (vm.runInContext(`_socialChannel.get("c1")`, ctx) !== "@rga") fail("the channel they kept doesn't reach the video step"); void c; }
if (!/vcChannel = _socialChannel\.get\(clientId\)/.test(P) || !/your channel, \$\{escapeHtml\(vcChannel\)\}/.test(P)) fail("the video step doesn't name the channel they kept");

{ const h = P.slice(P.indexOf("document.addEventListener(\"click\", async (e) => {\n  const t = e.target && e.target.closest && e.target.closest(\"[data-social-keep]"), P.indexOf("/** A day tile's span"));
  if (!/const redraw = \(\) => \(listEl\._rerender \? listEl\._rerender\(listEl\._onboarding, undefined, undefined, undefined, true\)/.test(h)) fail("Add / Change / Cancel / Edit / Close redraw with a server round trip (no local flag)");
  if (!/if \(_socialBusy\.has\(clientId\)\) return;[^\n]*\n\s*_socialBusy\.add\(clientId\);\s*t\.classList\.add\("is-busy"\)/.test(h) || !/finally \{ t\.classList\.remove\("is-busy"\); _socialBusy\.delete\(clientId\); \}/.test(h)) fail("a second press is possible while an answer is saving and the screen is redrawing"); }

// ── wiring + the words ───────────────────────────────────────────────────────────────────────
if (!/"m1\.brand\.social_profiles": \(step, c\) => socialCard\(step, c\)/.test(P) || !/const CS_STEPS = new Set\(\[[^\]]*"m1\.brand\.social_profiles"/.test(P)) fail("the card isn't on the system");
if (!/loadSocialProfiles\(clientId, listEl\);/.test(P)) fail("the finder never runs from the card");
const A = read("admin/admin.js");
{ const sp = read("netlify/functions/_social-profiles.js"), ep = read("netlify/functions/portal-social-profiles.js");
  if (!/source: "site", at, by: "their website"/.test(sp) || !/check\.state === "gone"\) gone\.push/.test(sp) || !/f\.state !== "read" \|\| ci\.none\) return t/.test(sp)) fail("the auto-count rule lost a condition: site source, not dead, not over a no");
  if (/autoCount/.test(ep.replace(/\/\/.*$/gm, "").split('action === "keep"')[1] || "")) fail("a hand-marked action reaches the auto-count");
  if (!/READS = new Set\(\["find", "recheck"\]\)/.test(ep) || !/only the client answers|Otherwise only the client answers/.test(ep) || /ONLY THE CLIENT ANSWERS FOR THEIR OWN PROFILES\. RGA can read and re-check; it can't say/.test(ep)) fail("the top comment doesn't carry the approved rule"); }
if (!/id === "m1\.brand\.social_profiles" \? socialAdminHtml\(t\)/.test(A)) fail("the admin row doesn't draw the step");
const ad = A.slice(A.indexOf("function socialAdminHtml"), A.indexOf("function socialChannelAdminHtml"));
if (!/That isn't the same as not having one/.test(ad) || !/Could not check/.test(ad)) fail("the admin card reads an absence as a value");
if (/data-social-keep|action: "keep"/.test(ad)) fail("the admin card can answer for the client");
const block = (P.slice(P.indexOf("function socialCard"), P.indexOf("async function socialCall")) + ad).replace(/\/\/.*$/gm, "");
if (/[—–]/.test(block)) fail("a dash in the step's words");
if (/guarantee|will rank|more calls|boost/i.test(block + PB.month1[ix].clientInstructions)) fail("the step promises a result");
if (/google profile|on google/i.test((PB.month1[ix].clientInstructions || "") + block.replace(/search engines/g, ""))) fail("the step promises something on Google, which isn't tested");
if (/posts? for you\b/i.test(PB.month1[ix].clientInstructions) && !/don't post for you/i.test(PB.month1[ix].clientInstructions)) fail("the step offers posting");
if (unexpected.length) fail(`a request left the fakes: ${unexpected.slice(0, 3).join(" · ")}`);
if (F.length) { console.error(`🔴 the social profiles step regressed: ${F.length}\n${F.map((m) => `   · ${m}`).join("\n")}`); process.exit(1); }
console.log("✅ the social profiles step: reads only their website, says linked / not linked / could not check, a login wall's 200 is never \"opens\", only the client answers, any format and any client ends somewhere, the links go through their approval and read back, a dead link reaches RGA, the number is 1..21. Stubs only.");
process.exit(0);
