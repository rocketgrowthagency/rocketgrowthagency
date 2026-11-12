#!/usr/bin/env node
// check-google-links-carry-the-campaign-tag.mjs: THE GOOGLE PROFILE'S LINKS CARRY THE CAMPAIGN NAME, THE CLIENT SEES THE CLEAN LINK, AND THE DASHBOARD NEVER
// ADDS GOOGLE'S TAPS TO ANALYTICS' VISITS (approved tier3_best_in_class_v1 section 9, the owner 11-11).
//
// The website link on Google already carried utm_source=google&utm_medium=organic, the booking link also utm_campaign=gbp-booking. What was missing is a
// campaign name on the website link, so Analytics could tell a visit from the profile apart from any other Google search (GA4 sessionCampaignName).
//
// HOLDS, on the WEBSITE repo (fakes only: no network, no real key, nothing written, Google is a fake that keeps one websiteUri):
//   1  shared/gbp-safety.js: the website link's tag is google / organic / gbp-listing; linkTagState says tagged, no_campaign (our older two), own (the client's
//      own utm_ tags) and none; cleanLink drops every utm_ tag.
//   2  _gbp-safety.js linkFor: a fresh page gets all three; our older two get the campaign added; the client's own tags are kept; an untagged choice stays bare.
//   3  RGA's one Update (campaignChoiceFor + the existing website link path, sendWebsiteChoice): on a fake Google holding our older link it runs Google's test
//      run, ONE write and the read back, and what Google reads back carries utm_campaign=gbp-listing. A link already tagged, one with the client's own tags,
//      or no link is refused with no write. admin-gbp-safety.js routes "website_campaign" through that same path (never a write of its own).
//   4  the booking link (_booking-link.js) is tagged gbp-booking.
//   5  the client's Google card (shared/profile-visits.js clientLinkCard) shows the link WITHOUT tags.
//   6  the Dashboard's tiles (dashboardView) each read ONE counter: Google's taps, Analytics' visits, Analytics' form leads, the call count, never a sum of a
//      Google figure and an Analytics one; a visit count nobody read is null (never 0) and says why; the note says the two are never added.
//   7  _metrics.js ga4Campaigns: one Analytics report by sessionCampaignName; visits are session_start, form leads submit-type events; a failed read is an
//      error, never a 0. admin step 42 + Monthly 27 draw the card (tagCardHtml) and its Update posts "website_campaign"; the portal draws the tiles from
//      dashboardView inside the Google live repaint.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website before this build (default f113d9c5) in 8+ places, else exit 2.
//   node scripts/check-google-links-carry-the-campaign-tag.mjs [--against=<rev>] [--no-before]
import { runGate, reader, loader } from "./lib/site-rev.mjs";

const BEFORE = "f113d9c5";
// 🔒 NEVER A REAL REQUEST, NEVER A REAL SECRET. The database settings' names are built, not written (daily-health-check.sh reads a gate naming them as LIVE).
for (const k of [["SUPA", "BASE_URL"].join(""), ["SUPA", "BASE_SERVICE_ROLE_KEY"].join(""), "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_KEY", "AIRTABLE_API_KEY"]) delete process.env[k];
const NO_NET = async (u) => { throw new Error(`gate: no network (${String(u).slice(0, 60)})`); };
globalThis.fetch = NO_NET;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const OLD = "https://betaroofing.com/?utm_source=google&utm_medium=organic";

/** A fake Google Business Profile holding one websiteUri. Records every call. */
function fakeGoogle(uri) {
  const g = { uri, calls: [] };
  g.fetch = async (u, init = {}) => {
    const url = String(u), method = init.method || "GET";
    g.calls.push({ method, url, body: init.body ? JSON.parse(init.body) : null });
    if (!url.startsWith("https://mybusinessbusinessinformation.googleapis.com/v1/locations/1")) throw new Error(`gate: unexpected ${url.slice(0, 80)}`);
    if (method === "GET") return res(200, { websiteUri: g.uri, metadata: { hasVoiceOfMerchant: true, hasPendingEdits: false } });
    if (method === "PATCH" && /validateOnly=true/.test(url)) return res(200, {});
    if (method === "PATCH") { g.uri = JSON.parse(init.body).websiteUri; return res(200, { websiteUri: g.uri }); }
    return res(400, {});
  };
  return g;
}

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const load = (p) => { try { return req(p); } catch (e) { fail(`${p} won't load: ${String(e.message).slice(0, 120)}`); return null; } };
  const guard = async (name, fn) => { try { await fn(); } catch (e) { fail(`${name}: threw ${String(e && e.message || e).slice(0, 160)}`); } finally { globalThis.fetch = NO_NET; } };

  // ── 1 · the tag and its states ──
  const S = load("./shared/gbp-safety.js");
  if (S) {
    const tag = Object.fromEntries((S.LINK_TAG || []).map(([k, v]) => [k, v]));
    if (tag.utm_source !== "google" || tag.utm_medium !== "organic") fail("the website link's tag no longer files Google visits under google / organic");
    if (tag.utm_campaign !== "gbp-listing") fail(`the website link's tag carries no campaign name gbp-listing (it is ${JSON.stringify(tag.utm_campaign || null)}), so profile visits can't be told apart`);
    if (typeof S.linkTagState !== "function") fail("shared/gbp-safety.js has no linkTagState: nothing can tell a tagged link from an older one");
    else {
      const want = [[`${OLD}&utm_campaign=gbp-listing`, "tagged"], [OLD, "no_campaign"], ["https://betaroofing.com/?utm_source=fb&utm_campaign=spring", "own"], ["https://betaroofing.com/", "none"], ["", null],
        ["https://betaroofing.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp-listing&utm_content=x", "own"]];
      for (const [u, s] of want) if (S.linkTagState(u) !== s) fail(`linkTagState(${u || "''"}) is ${JSON.stringify(S.linkTagState(u))}, should be ${JSON.stringify(s)}`);
      if (S.linkTagState("https://betaroofing.com/book?utm_source=google&utm_medium=organic&utm_campaign=gbp-booking", "gbp-booking") !== "tagged") fail("linkTagState can't read the booking link's campaign");
    }
    if (typeof S.cleanLink !== "function" || /utm_/.test(S.cleanLink(`${OLD}&utm_campaign=gbp-listing`)) || S.cleanLink(`${OLD}&utm_campaign=gbp-listing`) !== "betaroofing.com") fail("cleanLink doesn't give the link a person reads (no utm_ tags, no scheme)");
  }

  // ── 2 + 3 · linkFor and the one Update through the existing path ──
  const G = load("./netlify/functions/_gbp-safety.js");
  if (G && S && typeof S.linkTagState === "function") {
    const fresh = G.linkFor("https://betaroofing.com/", true);
    if (S.linkTagState(fresh) !== "tagged") fail(`a fresh website link goes to Google as ${fresh} (not tagged with the campaign name)`);
    if (S.linkTagState(G.linkFor(OLD, true)) !== "tagged") fail("our older two tags don't get the campaign name added");
    const own = "https://betaroofing.com/?utm_source=fb&utm_campaign=spring";
    if (G.linkFor(own, true) !== own) fail("the client's own utm_ tags are changed (they must be kept as they are)");
    if (S.linkTagState(G.linkFor("https://betaroofing.com/", false)) !== "none") fail("an untagged choice gets tags anyway");
    if (typeof G.campaignChoiceFor !== "function") fail("_gbp-safety.js has no campaignChoiceFor: RGA can't add the campaign name to an existing client's link");
    else {
      const client = { website_url: "betaroofing.com" };
      for (const [why, task] of [["already tagged", { google_push: { confirmed: { website: `${OLD}&utm_campaign=gbp-listing` } } }], ["the client's own tags", { google_push: { confirmed: { website: own } } }], ["no link on Google", {}]]) {
        const cc = G.campaignChoiceFor(task, client);
        if (!cc || !cc.error) fail(`Update isn't refused when ${why} (it would write to Google for nothing, or overwrite the client's tags)`);
      }
      await guard("the Update on a fake Google", async () => {
        const task = { google_push: { confirmed: { website: OLD } } }, cc = G.campaignChoiceFor(task, client);
        if (cc.error) { fail(`Update refused an existing client with our older tags: ${cc.error}`); return; }
        const v = G.validateChoice({ kind: cc.kind, url: cc.url, tagged: true }, G.baseWebsite(task, client));
        if (v.error) { fail(`the Update's page doesn't pass the existing checks: ${v.error}`); return; }
        const g = fakeGoogle(OLD), choice = { ...v.value, link: G.linkFor(v.value.url, v.value.tagged), status: "saved" };
        const out = await G.sendWebsiteChoice(choice, task, { fetch: g.fetch, token: "gate-token", loc: "locations/1", now: Date.parse("2026-11-11T18:00:00Z") });
        const writes = g.calls.filter((c) => c.method === "PATCH" && !/validateOnly/.test(c.url)), tests = g.calls.filter((c) => /validateOnly=true/.test(c.url));
        if (!out.sentOk || out.choice.status !== "on_google") fail(`the Update didn't finish on Google (${out.choice && out.choice.status}: ${out.choice && out.choice.said})`);
        if (tests.length !== 1 || writes.length !== 1) fail(`the Update made ${tests.length} test run(s) and ${writes.length} write(s); it must be Google's test run and ONE write`);
        const reads = g.calls.filter((c) => c.method === "GET");
        if (reads.length < 2 || g.calls[g.calls.length - 1].method !== "GET") fail("the Update isn't read back from Google after the write");
        if (S.linkTagState(g.uri) !== "tagged" || !/utm_campaign=gbp-listing/.test(g.uri)) fail(`what Google reads back after the Update is ${g.uri}, without utm_campaign=gbp-listing`);
      });
    }
  }
  const fn = rd("netlify/functions/admin-gbp-safety.js") || "";
  if (!/ACTIONS = \[[^\]]*"website_campaign"/.test(fn)) fail("admin-gbp-safety.js doesn't accept website_campaign: there is no way to Update an existing client");
  else {
    if (!/action === "website_choice" \|\| action === "website_campaign"/.test(fn)) fail("website_campaign doesn't share the website link path (its checks, the redirect check, the saved choice, Google's test run and the read back)");
    if (!/G\.campaignChoiceFor\(task, client\)/.test(fn)) fail("website_campaign doesn't ask campaignChoiceFor, so it could write an already tagged link or the client's own tags");
    if (!/G\.sendWebsiteChoice\(choice, current/.test(fn)) fail("the website link path no longer sends through sendWebsiteChoice (test run, write, read back)");
  }

  // ── 4 · the booking link ──
  const B = load("./netlify/functions/_booking-link.js");
  if (B && S && typeof S.linkTagState === "function") {
    const w = (B.withTag || (() => ""))("https://betaroofing.com/book");
    if (S.linkTagState(w, "gbp-booking") !== "tagged") fail(`the booking link goes to Google as ${w}, not tagged gbp-booking`);
  }

  // ── 5 + 6 · the client's card and the Dashboard ──
  const PV = load("./shared/profile-visits.js");
  if (PV) {
    const card = PV.clientLinkCard({ "m1.gbp.business_facts": { website_choice: { status: "on_google", link: `${OLD}&utm_campaign=gbp-listing`, checked_at: "2026-11-10T18:30:00Z" } } });
    if (!card || /utm_|\?/.test(card.title) || !/betaroofing\.com/.test(card.title)) fail(`the client's Google card shows "${card && card.title}" (it must show the clean link, without tags)`);
    if (PV.clientLinkCard({}) !== null) fail("with no website link on Google the client still gets a link card (nothing to tag)");
    const row = { reporting_month: "2026-10-01", gbp_website_clicks: 71, total_calls: 23, data: { calls: { provider: "callrail" }, ga4_campaigns: { from: "2026-10-01", campaigns: { "gbp-listing": { visits: 64, form_leads: 3 }, "gbp-booking": { visits: 9, form_leads: 1 } } } } };
    const v = PV.dashboardView({ row, analytics: true });
    const by = Object.fromEntries((v && v.tiles || []).map((t) => [t.key, t.n]));
    if (by.taps !== 71 || by.visits !== 64 || by.forms !== 3 || by.calls !== 23) fail(`the tiles read ${JSON.stringify(by)}; each must read one counter (taps 71, visits 64, forms 3, calls 23)`);
    const sums = [71 + 64, 71 + 9, 71 + 64 + 9, 64 + 9, 71 + 3, 64 + 23, 71 + 23];
    if ((v && v.tiles || []).some((t) => sums.includes(t.n))) fail("a tile adds a Google figure and an Analytics one together");
    if (!/never add them together/i.test((v && v.note) || "")) fail("the Dashboard's note doesn't say the two counters are never added");
    const failed = PV.dashboardView({ row: { ...row, data: { ga4_campaigns: { from: "2026-10-01", last_error: "Analytics said 500" } } }, analytics: true });
    const fv = (failed.tiles.find((t) => t.key === "visits") || {});
    if (fv.n !== null || !/Couldn't read/i.test(fv.sub || "")) fail(`a failed Analytics read shows ${JSON.stringify(fv.n)} visits (${fv.sub}); it must be blank and say so, never 0`);
    const off = PV.dashboardView({ row, analytics: false }), ov = off.tiles.find((t) => t.key === "visits") || {};
    if (ov.n !== null || !/isn't connected/i.test(ov.sub || "")) fail("with Analytics not connected the visits tile doesn't say visits aren't counted");
    const ad = PV.adminView({ tasks: { "m1.gbp.business_facts": { google_push: { confirmed: { website: OLD } } } }, row, analytics: true, provider: "callrail" });
    if (!ad.rows[0] || !ad.rows[0].side || ad.rows[0].side.button !== "Update" || ad.tone !== "you") fail("admin's card doesn't offer Update on a link with our older tags");
    const ad2 = PV.adminView({ tasks: { "m1.gbp.business_facts": { google_push: { confirmed: { website: "https://betaroofing.com/?utm_source=fb" } } } }, row, analytics: true });
    if (ad2.rows[0] && ad2.rows[0].side && ad2.rows[0].side.button) fail("admin's card offers Update on the client's own tags");
    if (!ad.rows.some((r) => r.kind === "kv" && r.label === "Recording" && /Off, and stays off/.test(r.value))) fail("admin's card doesn't say recording is off");
  } else fail("shared/profile-visits.js is missing: no screen can show visits from the profile");

  // ── 7 · the Analytics read, and the surfaces ──
  const M = load("./netlify/functions/_metrics.js");
  if (M && typeof M.ga4Campaigns !== "function") fail("_metrics.js has no ga4Campaigns: nothing reads visits by campaign");
  else if (M) await guard("ga4Campaigns on a fake Analytics", async () => {
    let body = null;
    const ok = await M.ga4Campaigns("properties/1", "t", "2026-10-01", async (u, init) => { body = JSON.parse(init.body); return res(200, { rows: [
      { dimensionValues: [{ value: "gbp-listing" }, { value: "session_start" }], metricValues: [{ value: "64" }] },
      { dimensionValues: [{ value: "gbp-listing" }, { value: "generate_lead" }], metricValues: [{ value: "3" }] },
      { dimensionValues: [{ value: "gbp-listing" }, { value: "form_start" }], metricValues: [{ value: "9" }] },
      { dimensionValues: [{ value: "gbp-booking" }, { value: "session_start" }], metricValues: [{ value: "9" }] }] }); });
    if (!body || !(body.dimensions || []).some((d) => d.name === "sessionCampaignName")) fail("the Analytics report isn't by sessionCampaignName");
    const l = ok.campaigns && ok.campaigns["gbp-listing"];
    if (!l || l.visits !== 64 || l.form_leads !== 3) fail(`ga4Campaigns read ${JSON.stringify(l)}; visits are session_start (64), form leads submit-type events, never a form opening (3)`);
    const bad = await M.ga4Campaigns("properties/1", "t", "2026-10-01", async () => res(500, { error: "boom" }));
    if (!bad.error || bad.campaigns) fail("a failed Analytics read isn't an error (it would show as 0 visits)");
  });
  const adm = rd("admin/admin.js") || "";
  if (!/gbpLandingAdminHtml\(t, s\) \+ tagCardHtml\(/.test(adm)) fail("admin step 42 doesn't draw Links on Google carry the tag");
  if (!/oncTrackingCardHtml\(\) \+ tagCardHtml\(/.test(adm)) fail("Monthly 27 doesn't draw Links on Google carry the tag");
  if (!/gsPost\(cid, \{ action: "website_campaign" \}\)/.test(adm)) fail("admin's Update doesn't post website_campaign through the safety door");
  const por = rd("portal/portal.js") || "";
  if (!/gliveWrap\("gpv"/.test(por) || !/PV\.dashboardView\(/.test(por) || !/PV\.clientLinkCard\(/.test(por)) fail("the portal Dashboard doesn't draw From your Google profile from the shared view (inside the Google live repaint)");
  return F;
}

await runGate({ name: "check-google-links-carry-the-campaign-tag", beforeRev: BEFORE, checkTree, minBefore: 8 });
