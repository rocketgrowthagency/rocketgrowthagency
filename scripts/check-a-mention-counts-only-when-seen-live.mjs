#!/usr/bin/env node
// check-a-mention-counts-only-when-seen-live.mjs: "BEST OF" LISTS AND LOCAL MENTIONS (approved tier3_best_in_class_v1, section 3, the owner
// 11-11). Runs the SHIPPED website code (shared/mentions.js, netlify/functions/_mentions.js, admin-mentions.js, portal-mentions.js,
// mentions-check.js) against fakes: a fake database, fake list pages, a fake SerpAPI, a fake model and a fake sender. No network, no
// production data, no real search, no email.
//
// WHAT IT HOLDS (the checker the mockup names)
//   1 "Listed" needs a page fetched in the last 35 days, answering 200, with the business name on it (or a common form: with or without
//     LLC, "and" or "&"), kept as evidence. A name split across the page is not on it. A stale read, or no evidence, is never counted
//     on either screen, and no press (Undo included) can write "listed".
//   2 A page that wouldn't open reads "Could not check", never "not on it", and the client never sees it.
//   3 A pay-to-be-listed page is never pitched: no draft, no Send button, and the server refuses a send.
//   4 The step never spends below the client reserve (_serpapi-reserve.js): an unreadable count or one at the reserve spends nothing and
//     says so ("Next try"); 2 to 4 searches a quarter, once; searches off = none; no trade or no city = none, said. Any country.
//   5 Nothing sends by itself: the run and the schedule never reach a sender; Send happens only on RGA's press, with an address.
//   6 Before CLIENT_MENTIONS_2026-11-11.sql runs, everything degrades: no search, no write, ready:false. The SQL has RLS on and anon and
//     authenticated revoked for both tables, and the listed-needs-evidence check, in the same file.
//   7 The pitch uses facts on the record only (a number that isn't there refuses the draft); the client sees no pitch or address.
//   8 Wired: the schedule is in netlify.toml and the job manifest, admin 55 and Monthly 15 draw the one list, the portal draws its card,
//     the busters moved.
// 🔑 SELF-PROVING: before it judges the code, each detector it relies on is run on a planted bad sample and a good one; a detector that
// can't tell them apart makes the gate exit 2 ("can't tell"), never a false green.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const cant = (m) => { console.error(`⚠️  INDETERMINATE: ${m}`); process.exit(2); };
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { cant(`cannot read ${r}`); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", SERPAPI_KEY: "serp-test", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", INTERNAL_FN_SECRET: "s" });
delete process.env.MENTIONS_SEARCH; delete process.env.CITATION_LIVE_SEARCH;
// 🔴 the real network is never reached: any fetch the shipped code makes outside the fakes is logged and refused
const leaked = [];
globalThis.fetch = async (u) => { leaked.push(String(u)); return { ok: false, status: 599, json: async () => ({}), text: async () => "" }; };
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let M, MN, ADM, POR, CHK, RESERVE;
try {
  M = req(path.join(SITE, "shared/mentions.js")); MN = req("./_mentions.js"); ADM = req("./admin-mentions.js"); POR = req("./portal-mentions.js");
  CHK = req("./mentions-check.js"); RESERVE = req("./_serpapi-reserve.js").SERPAPI_RESERVE;
} catch (e) { cant(`a module did not load: ${e.message}`); }
if (!Number.isFinite(RESERVE)) cant("_serpapi-reserve.js has no SERPAPI_RESERVE");

const NOW = Date.parse("2026-11-11T18:00:00Z"), DAY = 864e5, iso = (ms) => new Date(ms).toISOString();
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const card = ({ tone, head, side = "", body = "" }) => `<div class="pm-k5-plan pm-cs-card ${tone}"><div class="pm-k5-h ${tone}"><b>${head}</b>${side ? `<span>${side}</span>` : ""}</div>${body}</div>`;
const adminHtml = (v) => M.adminCardHtml(v, { esc, attr: esc, num: "55" });
const clientHtml = (v) => M.clientCardsHtml(v, { esc, card, cid: "c" });

// ── the detectors, and their self-proof ──
const D = {
  listedPill: (html) => /ob-mn-pill ok">Listed</.test(html),
  seenLine: (html) => /Seen [A-Z][a-z]{2} \d/.test(html),
  sendBtn: (html) => /data-mn-act="send"/.test(html),
  notOnIt: (html) => /Not on it\./.test(html),
  leaksPitch: (html) => /@|SUBJECT|Draft ready|asks businesses to pay|wouldn.t open|Could not check/i.test(html),
};
for (const [k, bad, good] of [
  ["listedPill", '<span class="ob-mn-pill ok">Listed</span>', '<span class="ob-mn-pill unk">Could not check</span>'],
  ["seenLine", "<small>Seen Nov 9</small>", "<small>We asked Nov 2</small>"],
  ["sendBtn", '<button data-mn-act="send">', '<button data-mn-act="edit">'],
  ["notOnIt", "<small>Not on it. Draft ready.</small>", "<small>Could not check</small>"],
  ["leaksPitch", "editor@site.example", "Seen Nov 9"],
]) if (!D[k](bad) || D[k](good)) cant(`the gate's own detector "${k}" can't tell a planted bad sample from a good one`);

// ── fixtures ──
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const CLIENT = { id: CID, business_name: "Beta Roofing, LLC", business_type: "Roofing contractor", primary_market: "Culver City, CA", website_url: "https://betaroofing.example", client_portal_stage: "stage_5_monthly", source: null };
const PACK = { name: "Beta Roofing, LLC", category: "Roofing contractor", service_area: "Culver City, Palms, Mar Vista", website: "https://betaroofing.example", phone: "(310) 555-0100", description: "Family roofers in Culver City and Palms." };
const LIST_URL = "https://westsidehomeguide.example/best-roofers-culver-city", PAY_URL = "https://toppros.example/10-best-roofers", BAD_URL = "https://blocked.example/roofers", ON_URL = "https://culvercitychamber.example/members";
const PAGES = {
  [LIST_URL]: [200, `<html><title>Best Roofers in Culver City - Westside Home Guide</title><body><h1>Best roofers</h1><p>Acme Roofing. Beta Construction. Roofing by Gamma.</p><a href="mailto:editor@westsidehomeguide.example">Contact the editor</a></body></html>`],
  [PAY_URL]: [200, `<html><title>10 Best Roofers - Top Pros LA</title><body>Want to be here? Pay to be listed: $99 a month. <a href="mailto:sales@toppros.example">sales</a></body></html>`],
  [BAD_URL]: [403, ""],
  [ON_URL]: [200, `<html><title>Members - Culver City Chamber</title><body><li>Beta Roofing</li><li>Delta Dental</li></body></html>`],
};
const SERP = [{ link: LIST_URL, title: "Best Roofers in Culver City - Westside Home Guide" }, { link: PAY_URL, title: "10 Best Roofers - Top Pros LA" }, { link: BAD_URL, title: "Roofers near you - Blocked Mag" },
  { link: ON_URL, title: "Members - Culver City Chamber" }, { link: "https://www.yelp.com/search?find_desc=roofers", title: "Top 10 Best Roofers - Yelp" }, { link: "https://betaroofing.example/", title: "Beta Roofing" },
  { link: "https://www.facebook.com/betaroofing", title: "Beta Roofing | Facebook" }];

/** A fake PostgREST over in-memory tables. `missing` = the SQL hasn't run (404 PGRST205 on the two new tables). */
function fakeDb({ missing = false, rows = [], task55 = { status: "in_progress" }, tips = [] } = {}) {
  const T = { clients: [{ ...CLIENT }], client_onboarding_records: [{ id: "rec1", client_id: CID, data: { tasks: { "m1.platform.mentions": { ...task55, outcome_data: { ...(task55.outcome_data || {}), pack: PACK } } } } }],
    client_mentions: rows.map((r) => ({ ...r })), client_mention_searches: [], client_activity: tips.map((t) => ({ client_id: CID, kind: "client_mention_tip", occurred_at: t.at, payload: { answer: { text: t.text } } })) };
  let seq = 1; const log = [];
  const parse = (p) => { const [t, qs] = p.slice(1).split("?"); const params = new URLSearchParams(qs || ""); return { t, params }; };
  const match = (row, params) => [...params.entries()].every(([k, v]) => {
    if (["select", "order", "limit", "on_conflict"].includes(k)) return true;
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    if (op === "eq") return String(row[k] ?? "") === val;
    if (op === "gte") return String(row[k] ?? "") >= val;
    if (op === "is") return val === "null" ? row[k] == null : true;
    return true;
  });
  const supa = async (p, init = {}) => {
    const m = (init.method || "GET").toUpperCase(), { t, params } = parse(p); log.push(`${m} ${p}`);
    if (missing && (t === "client_mentions" || t === "client_mention_searches")) throw new Error("Supabase 404: {\"code\":\"PGRST205\",\"message\":\"Could not find the table\"}");
    const tbl = T[t]; if (!tbl) return [];
    if (m === "GET") { let out = tbl.filter((r) => match(r, params)); if ((params.get("order") || "").startsWith("at.desc")) out = out.sort((a, b) => String(b.at).localeCompare(String(a.at))); return JSON.parse(JSON.stringify(out.slice(0, Number(params.get("limit")) || 1000))); }
    if (m === "POST") {
      const body = JSON.parse(init.body), list = Array.isArray(body) ? body : [body], made = [];
      for (const r of list) {
        if (t === "client_mentions" && tbl.some((x) => x.client_id === r.client_id && x.url_key === r.url_key)) continue;
        const row = { ...(t === "client_mentions" ? { id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, on_page: null, pay_to_list: false, status: "found" } : { id: seq }), ...r };
        if (t === "client_mentions" && row.status === "listed" && !(row.seen_at && row.evidence)) throw new Error("check constraint: listed needs seen_at and evidence");
        seq++; tbl.push(row); made.push(row);
      }
      return JSON.parse(JSON.stringify(made));
    }
    if (m === "PATCH") {
      const patch = JSON.parse(init.body), hit = tbl.filter((r) => match(r, params));
      for (const r of hit) { Object.assign(r, patch); for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k]; if (t === "client_mentions" && r.status === "listed" && !(r.seen_at && r.evidence)) throw new Error("check constraint: listed needs seen_at and evidence"); }
      return JSON.parse(JSON.stringify(hit));
    }
    return [];
  };
  return { T, supa, log };
}
function fakeDeps(db, { left = 500, now = NOW, env = {}, draftText = null, pages = PAGES } = {}) {
  const calls = { searches: [], sends: [], drafts: 0, reads: [] };
  const d = { supa: db.supa, env, now: () => now, searchesLeft: async () => left, record: async () => ({}),
    search: async (q, o) => { calls.searches.push({ q, gl: o && o.gl }); return { ran: true, results: SERP }; },
    fetch: async (u) => { calls.reads.push(String(u)); const p = pages[String(u)]; return p ? res(p[0], p[1]) : res(404, ""); },
    draft: async () => { calls.drafts++; return draftText != null ? draftText : "SUBJECT: A Culver City roofer for your list\nBODY:\nHi, I saw your list of the best roofers in Culver City. Beta Roofing, LLC works in Culver City and Palms, and you can reach them at (310) 555-0100. If you update the list, we'd be glad to send photos or anything you need. There's no fee involved on either side.\n\nThanks, Chris, Rocket Growth Agency, on behalf of Beta Roofing, LLC"; },
    send: async (m) => { calls.sends.push(m); return { id: "gm1" }; } };
  return { d, calls };
}
const listed = (url, seenMs, extra = {}) => ({ id: `11111111-1111-4111-8111-${String(Math.floor(seenMs / 1000) % 1e12).padStart(12, "0")}`, client_id: CID, url, url_key: M.urlKey(url), host: M.hostOf(url), title: "Members - Culver City Chamber", kind: "association", status: "listed", on_page: true,
  seen_at: iso(seenMs), evidence: { url, http: 200, name_form: "beta roofing", at: iso(seenMs) }, checked_at: iso(seenMs), found_at: iso(seenMs - DAY), updated_at: iso(seenMs), ...extra });

// 🔴 a shipped function that throws is a FAILURE here, never a crash that reads as something else
try {
// ══ 1 · Listed only when SEEN LIVE ══
{
  const names = ["Beta Roofing, LLC"];
  const on = MN.applyCheck({ url: ON_URL, host: M.hostOf(ON_URL), status: "found" }, { status: 200, html: PAGES[ON_URL][1] }, names, "betaroofing.example", NOW);
  if (on.status !== "listed" || on.evidence.http !== 200 || on.evidence.at !== on.seen_at || !on.evidence.name_form || on.evidence.url !== ON_URL) fail(`1: a page naming "Beta Roofing" (the LLC dropped) isn't listed with its read as evidence: ${JSON.stringify(on).slice(0, 200)}`);
  const split = MN.applyCheck({ url: LIST_URL, status: "found" }, { status: 200, html: PAGES[LIST_URL][1] }, names, "", NOW);
  if (split.status === "listed" || split.on_page !== false) fail("1: a page with 'Beta' and 'Roofing' in different names counts as naming the business");
  const amp = MN.applyCheck({ url: "https://x.example/a", status: "found" }, { status: 200, html: "<p>Smith &amp; Sons Plumbing is great</p>" }, ["Smith and Sons Plumbing Inc."], "", NOW);
  if (amp.status !== "listed") fail("1: \"Smith and Sons Plumbing Inc.\" isn't found as \"Smith & Sons Plumbing\" (the & and Inc. forms)");
  if (MN.nameOnPage("<p>Beta is a letter</p>", ["Beta"])) fail("1: a one-word short name matches any page that says it");
  const fresh = listed(ON_URL, NOW - 3 * DAY), stale = listed(ON_URL, NOW - 36 * DAY), noEv = { ...listed(ON_URL, NOW - DAY), evidence: null }, wrongUrl = { ...listed(ON_URL, NOW - DAY), evidence: { url: "https://other.example/", http: 200, name_form: "beta roofing", at: iso(NOW - DAY) } }, e403 = { ...listed(ON_URL, NOW - DAY), evidence: { url: ON_URL, http: 403, name_form: "beta roofing", at: iso(NOW - DAY) } };
  if (!M.seenLive(fresh, NOW)) fail("1: a listing read 3 days ago with its evidence isn't counted");
  for (const [n, r] of [["read 36 days ago", stale], ["with no evidence", noEv], ["whose evidence is another page", wrongUrl], ["whose read answered 403", e403]]) {
    if (M.seenLive(r, NOW)) fail(`1: a listing ${n} counts as seen live`);
    const av = M.adminView({ ready: true, rows: [r], searches: [{ kind: "search", ran: true, counted: true, quarter: M.quarterOf(NOW), at: iso(NOW - DAY) }], now: NOW }), ah = adminHtml(av);
    if (D.listedPill(ah) || /on 1/.test(av.side.join(" "))) fail(`1: the admin card shows a listing ${n} as Listed / on 1`);
    const cv = M.clientView({ ready: true, rows: [r], searches: [], now: NOW }), ch = clientHtml(cv);
    if (D.seenLine(ch) || /On 1/.test(ch)) fail(`1: the client card shows a listing ${n} as seen`);
  }
  const av = M.adminView({ ready: true, rows: [fresh], searches: [{ kind: "search", ran: true, counted: true, quarter: M.quarterOf(NOW), at: iso(NOW - DAY) }], now: NOW });
  if (!D.listedPill(adminHtml(av)) || !/on 1/.test(av.side.join(" "))) fail("1: a fresh, proven listing isn't drawn as Listed on the admin card");
  if (!D.seenLine(clientHtml(M.clientView({ ready: true, rows: [fresh], now: NOW })))) fail("1: a fresh, proven listing isn't 'Seen' on the client card");
  if (MN.ACTIONS.includes("listed") || MN.ACTIONS.includes("live")) fail("1: 'listed' is a press");
  // Undo can't bring back a "listed" no read just proved
  const db = fakeDb({ rows: [{ ...fresh, status: "declined", prev: { ...fresh, prev: undefined } }] }), { d } = fakeDeps(db);
  const u = await MN.act({ clientId: CID, id: fresh.id, action: "undo", body: {}, deps: d, by: "chris@x" });
  if (!u.ok || u.row.status === "listed") fail(`1: Undo writes "listed" back without a new read: ${JSON.stringify(u).slice(0, 160)}`);
  ADM.__useDeps({ ...d, gate: { ok: true, email: "chris@x" } });
  const r = await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "listed", id: fresh.id }) });
  if (r.statusCode !== 400) fail(`1: the admin function accepts a "listed" press (${r.statusCode})`);
}

// ══ 2 · wouldn't open = Could not check, never "not on it"; the client never sees it ══
{
  const c = MN.applyCheck({ url: BAD_URL, status: "asked", asked_at: iso(NOW - 20 * DAY) }, { status: 403, html: "" }, ["Beta Roofing"], "", NOW);
  if (c.status !== "could_not_check" || c.on_page !== null || c.last_check.http !== 403) fail(`2: a 403 page isn't "could not check" with on_page null: ${JSON.stringify(c)}`);
  const row = { id: "r403", url: BAD_URL, host: "blocked.example", title: "Roofers near you - Blocked Mag", kind: "list", ...c, asked_at: iso(NOW - 20 * DAY) };
  const ah = adminHtml(M.adminView({ ready: true, rows: [row], searches: [], now: NOW }));
  if (D.notOnIt(ah) || !/Could not check/.test(ah) || !/403/.test(ah)) fail("2: the admin card says a page that wouldn't open is 'Not on it', or doesn't say Could not check (403)");
  if (MN.clientRows([row], NOW).length || /Blocked/.test(clientHtml(M.clientView({ ready: true, rows: [row], now: NOW })))) fail("2: the client sees a page that wouldn't open");
  const back = MN.applyCheck(row, { status: 200, html: "<p>Nothing here</p>" }, ["Beta Roofing"], "", NOW + DAY);
  if (back.status !== "asked") fail(`2: a page that opens again doesn't go back to where it was (asked), got ${back.status}`);
}

// ══ 3 · pay to be listed: never pitched ══
{
  const p = MN.applyCheck({ url: PAY_URL, status: "found" }, { status: 200, html: PAGES[PAY_URL][1] }, ["Beta Roofing"], "", NOW);
  if (p.status !== "pay_to_list" || !p.pay_to_list) fail("3: a page that asks businesses to pay to be listed isn't marked so");
  if (MN.payToList("<p>Advertise with us. Read our sponsored content policy.</p>")) fail("3: an ordinary 'advertise with us' footer reads as pay-to-be-listed");
  const row = { id: "rpay", url: PAY_URL, host: "toppros.example", title: "10 Best Roofers - Top Pros LA", kind: "list", ...p, pitch: { to: "sales@toppros.example", subject: "x", body: "y".repeat(50) } };
  const ah = adminHtml(M.adminView({ ready: true, rows: [row], searches: [], now: NOW }));
  if (D.sendBtn(ah) || !/Pay to be listed/.test(ah)) fail("3: a pay-to-be-listed page has a Send button, or isn't labeled");
  const db = fakeDb({ rows: [{ ...row, client_id: CID, url_key: M.urlKey(PAY_URL), updated_at: iso(NOW - DAY) }] }), { d, calls } = fakeDeps(db);
  const s = await MN.act({ clientId: CID, id: "rpay", action: "send", body: {}, deps: d, by: "chris@x" });
  if (s.ok || calls.sends.length) fail("3: the server sends a pitch to a pay-to-be-listed page");
}

// ══ 4 · the reserve, the quarter, the trade ══
{
  const plan = MN.listQueries(CLIENT, PACK);
  if (plan.none || plan.queries.length < MN.SEARCHES_MIN || plan.queries.length > MN.SEARCHES_MAX) fail(`4: the plan isn't 2 to 4 searches: ${JSON.stringify(plan)}`);
  if (!/^best roofing contractor in Culver City$/.test(plan.queries[0].q) || !/^top roofing contractor Palms$/.test((plan.queries[1] || {}).q || "")) fail(`4: the searches aren't "best {trade} in {city}" and "top {trade} {area}": ${plan.queries.map((x) => x.q).join(" | ")}`);
  const noTrade = MN.listQueries({ business_name: "X", primary_market: "Austin, TX" }, null);
  if (noTrade.queries.length || !/No trade/.test(noTrade.none || "")) fail("4: a client with no trade is searched, or isn't told why not");
  if (MN.listQueries({ business_type: "Dentist" }, null).queries.length) fail("4: a client with no city is searched");
  const tor = MN.listQueries({ business_type: "Dentist", primary_market: "Toronto, ON" }, null);
  if (!tor.queries.length || !/Toronto/.test(tor.queries[0].q)) fail("4: a client outside the US isn't searched in their own city");
  const S = MN.searchBudget;
  if (S({ left: RESERVE + 1, need: 2, now: NOW }).ok) fail("4: a search runs with the count one above the reserve and two needed");
  if (!S({ left: RESERVE + 2, need: 2, now: NOW }).ok) fail("4: two searches above the reserve are refused");
  if (S({ left: null, need: 2, now: NOW }).ok || S({ left: NaN, need: 2, now: NOW }).ok) fail("4: an unreadable count spends");
  if (S({ left: 999, need: 2, spentThisQuarter: 3, now: NOW }).ok) fail("4: the quarter's cap of 4 is passed");
  if (S({ left: 999, need: 2, off: true, now: NOW }).ok) fail("4: searches run while switched off");
  if (!/reserve/.test(S({ left: RESERVE, need: 2, now: NOW }).why || "") || !/^2026-12-01/.test(S({ left: RESERVE, need: 2, now: NOW }).next || "")) fail("4: a refusal at the reserve doesn't say so or name the next try (the plan's renewal)");
  // the run, end to end
  let db = fakeDb(), f = fakeDeps(db, { left: RESERVE + 1 });
  let o = await MN.runClient({ clientId: CID, deps: f.d, now: NOW });
  if (f.calls.searches.length || o.searched) fail(`4: the run searched into the reserve (${f.calls.searches.length})`);
  const refused = db.T.client_mention_searches.find((x) => x.kind === "refused");
  if (!refused || !/reserve/.test(refused.why)) fail("4: the reserve refusal isn't kept for the card");
  const failedView = M.adminView({ ready: true, rows: [], searches: db.T.client_mention_searches, now: NOW });
  if (failedView.state !== "failed" || !/didn't run: client work's SerpAPI reserve is down to the part kept for map scans\. Next try Dec 1\./.test(failedView.failed)) fail(`4: the admin card doesn't say the search didn't run and when it tries next: ${failedView.failed}`);
  f = fakeDeps(db, { left: 9999 });
  o = await MN.runClient({ clientId: CID, deps: f.d, now: NOW + 3600e3 });
  if (f.calls.searches.length) fail("4: a refusal with a next try is ignored the same day");
  db = fakeDb(); f = fakeDeps(db, { left: 9999 });
  o = await MN.runClient({ clientId: CID, deps: f.d, now: NOW });
  if (f.calls.searches.length < MN.SEARCHES_MIN || f.calls.searches.length > MN.SEARCHES_MAX) fail(`4: one run spent ${f.calls.searches.length} searches (2 to 4)`);
  if (f.calls.searches.some((s) => s.gl !== "us")) fail("4: a US client's searches aren't localized to the US");
  const hosts = db.T.client_mentions.map((r) => r.host).sort().join();
  if (hosts !== "blocked.example,culvercitychamber.example,toppros.example,westsidehomeguide.example") fail(`4: the list isn't exactly the search's pages minus directories, social sites and their own site: ${hosts}`);
  const again = fakeDeps(db, { left: 9999 });
  await MN.runClient({ clientId: CID, deps: again.d, now: NOW + 5 * DAY });
  if (again.calls.searches.length) fail("4: a second run in the same quarter searches again");
  // the quarter is searched ONCE even when the first run left room under the cap (2 searches: a city with no other areas)
  const two = fakeDb(); two.T.client_onboarding_records[0].data.tasks["m1.platform.mentions"].outcome_data.pack = { ...PACK, service_area: "" };
  const t1 = fakeDeps(two, { left: 9999 }); await MN.runClient({ clientId: CID, deps: t1.d, now: NOW });
  const t2 = fakeDeps(two, { left: 9999 }); await MN.runClient({ clientId: CID, deps: t2.d, now: NOW + 2 * DAY });
  if (t1.calls.searches.length !== 2 || t2.calls.searches.length) fail(`4: a quarter is searched more than once (${t1.calls.searches.length} then ${t2.calls.searches.length})`);
  const nextQ = fakeDeps(db, { left: 9999 });
  await MN.runClient({ clientId: CID, deps: nextQ.d, now: Date.parse("2027-01-05T18:00:00Z") });
  if (!nextQ.calls.searches.length) fail("4: the next quarter never searches");
  const off = fakeDb(), fo = fakeDeps(off, { env: { MENTIONS_SEARCH: "0" } });
  await MN.runClient({ clientId: CID, deps: fo.d, now: NOW });
  if (fo.calls.searches.length) fail("4: MENTIONS_SEARCH=0 still searches");
  // the end state of that run: what each page became
  const by = Object.fromEntries(db.T.client_mentions.map((r) => [r.host, r]));
  if ((by["culvercitychamber.example"] || {}).status !== "listed" || (by["toppros.example"] || {}).status !== "pay_to_list" || (by["blocked.example"] || {}).status !== "could_not_check" || (by["westsidehomeguide.example"] || {}).on_page !== false) fail(`4: the run's page reads are wrong: ${JSON.stringify(Object.fromEntries(Object.entries(by).map(([h, r]) => [h, r.status])))}`);
  const w = by["westsidehomeguide.example"] || {};
  if (!w.pitch || !w.pitch.body || w.pitch.to !== "editor@westsidehomeguide.example") fail(`4: the not-on-it list has no drafted pitch to the address its page lists: ${JSON.stringify(w.pitch)}`);
  if ((by["toppros.example"] || {}).pitch) fail("3: a pay-to-be-listed page got a pitch drafted");
  if (db.T.client_mention_searches.some((x) => x.kind === "run" && !x.finished_at)) fail("4: a run's ledger row is left unfinished (the card would say Working forever)");
  // the drawn admin card in that state matches the mockup's words
  const av = M.adminView({ ready: true, rows: db.T.client_mentions, searches: db.T.client_mention_searches, name: "Beta Roofing", now: NOW });
  const ah = adminHtml(av);
  if (av.pill !== "Your move · 1" || !/Not on it\. The page lists a contact email\. Draft ready\./.test(ah) || !D.sendBtn(ah) || !/>Edit</.test(ah) || !/>Skip</.test(ah) || !/Searched Nov 11/.test(av.side.join(" ")) || !/4 found · on 1/.test(av.side.join(" "))) fail(`4: the admin card isn't as drawn: ${av.pill} · ${av.side.join(" / ")}`);
  if (!/The page asks businesses to pay to be listed\. We don't\./.test(ah) || !/On it\. Seen Nov 11\./.test(ah)) fail("4: the admin card's pay and listed rows aren't as drawn");
}

// ══ 5 · nothing sends by itself ══
{
  const db = fakeDb(), f = fakeDeps(db, { left: 9999 });
  await MN.runClient({ clientId: CID, deps: f.d, now: NOW });
  if (f.calls.sends.length) fail("5: the run sent a pitch");
  for (const file of ["netlify/functions/_mentions.js", "netlify/functions/mentions-check.js", "netlify/functions/mentions-run-background.js"]) {
    const src = read(file).replace(/^\s*\/\/.*$/gm, "");
    if (/_gmail|sendAsRga|gmail\.googleapis|\.send\(/.test(src.replace(/d\.send\(\{ to: p\.to/g, ""))) fail(`5: ${file} can reach a sender outside RGA's Send press`);
  }
  if (!/d\.send\(\{ to: p\.to/.test(read("netlify/functions/_mentions.js"))) fail("5: the Send press no longer goes through deps.send");
  const row = db.T.client_mentions.find((r) => r.host === "westsidehomeguide.example");
  ADM.__useDeps({ ...f.d, gate: { ok: true, email: "chris@x" } });
  const call = async (b) => { const r = await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, ...b }) }); return { code: r.statusCode, j: JSON.parse(r.body) }; };
  let r = await call({ action: "read" });
  if (!r.j.ok || !r.j.ready || r.j.rows.length !== 4) fail(`5: the admin read isn't the list: ${JSON.stringify(r.j).slice(0, 160)}`);
  r = await call({ action: "send", id: row.id });
  if (!r.j.ok || f.calls.sends.length !== 1 || f.calls.sends[0].to !== "editor@westsidehomeguide.example" || r.j.row.status !== "asked" || !r.j.row.next_look_at) fail(`5: RGA's Send doesn't send once to the page's address and mark it asked: ${JSON.stringify(r.j).slice(0, 200)}`);
  r = await call({ action: "send", id: row.id });
  if (r.j.ok || f.calls.sends.length !== 1) fail("5: a pitch can be sent twice");
  const noTo = db.T.client_mentions.find((x) => x.host === "westsidehomeguide.example");
  Object.assign(noTo, { status: "found", pitch: { subject: "s", body: "b".repeat(60) }, asked_at: null });
  r = await call({ action: "send", id: noTo.id });
  if (r.j.ok || f.calls.sends.length !== 1) fail("5: a pitch with no address is sent");
  r = await call({ action: "skip", id: noTo.id, reason: "" });
  if (r.j.ok) fail("5: Skip without a reason is saved");
  r = await call({ action: "skip", id: noTo.id, reason: "Their list is about commercial roofers" });
  if (!r.j.ok || r.j.row.status !== "skipped") fail("5: Skip with a reason isn't saved");
  r = await call({ action: "undo", id: noTo.id });
  if (!r.j.ok || r.j.row.status !== "found") fail("5: Undo doesn't put a skipped page back exactly");
  const cd = fakeDb(); cd.T.clients[0].client_portal_stage = "stage_5_monthly"; const fc = fakeDeps(cd); let queued = 0;
  CHK.__useDeps({ ...fc.d, queue: async () => { queued++; return { ok: true, status: 202 }; } });
  const out = JSON.parse((await CHK.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: "{}" })).body);
  if (out.queued !== 1 || fc.calls.searches.length || fc.calls.sends.length) fail(`5: the schedule doesn't just queue the due client (queued ${out.queued}, searched ${fc.calls.searches.length}, sent ${fc.calls.sends.length})`);
  const td = fakeDb(); td.T.clients[0].source = "test:x"; const ft = fakeDeps(td); queued = 0;
  CHK.__useDeps({ ...ft.d, queue: async () => { queued++; return { ok: true }; } });
  await CHK.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: "{}" });
  if (queued) fail("5: a test client is queued");
}

// ══ 6 · before the SQL runs: nothing spent, nothing written; the SQL itself ══
{
  const db = fakeDb({ missing: true }), f = fakeDeps(db, { left: 9999 });
  const o = await MN.runClient({ clientId: CID, deps: f.d, now: NOW });
  if (o.ready !== false || f.calls.searches.length || f.calls.drafts || db.log.some((l) => /^(POST|PATCH) \/client_mention/.test(l))) fail("6: with no table the run searches, drafts or writes");
  ADM.__useDeps({ ...f.d, gate: { ok: true } });
  const a = JSON.parse((await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "read" }) })).body);
  POR.__useDeps({ ...f.d, gate: { ok: true } });
  const p = JSON.parse((await POR.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID }) })).body);
  if (a.ready !== false || p.ready !== false) fail("6: the screens don't say the list isn't set up");
  if (M.clientView({ ready: false }) !== null || M.adminView({ ready: false }).state !== "not_ready") fail("6: a missing table draws a list");
  let queued = 0; CHK.__useDeps({ ...f.d, queue: async () => { queued++; return { ok: true }; } });
  const c = JSON.parse((await CHK.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: "{}" })).body);
  if (queued || c.ready !== false) fail("6: the schedule queues runs with no table");
  const sql = read("docs/supabase/CLIENT_MENTIONS_2026-11-11.sql").replace(/--.*$/gm, "");
  for (const t of ["client_mentions", "client_mention_searches"]) {
    if (!new RegExp(`create table if not exists public\\.${t}\\b`).test(sql)) fail(`6: the SQL doesn't create ${t}`);
    if (!new RegExp(`alter table public\\.${t} enable row level security`).test(sql)) fail(`6: ${t} has no row level security in the same file`);
    if (!new RegExp(`revoke all on public\\.${t} from anon, authenticated`).test(sql)) fail(`6: ${t} isn't revoked from anon and authenticated`);
  }
  if (!/check \(status <> 'listed' or \(seen_at is not null and evidence is not null\)\)/.test(sql)) fail("6: the database lets a row be listed without the read that proves it");
  if (/create policy/i.test(sql)) fail("6: the SQL opens a policy (service role only)");
}

// ══ 7 · the pitch: facts on the record only; the client sees none of it ══
{
  const p = MN.pitchPrompt(CLIENT, PACK, { url: LIST_URL, title: "Best Roofers" });
  if (MN.parsePitch("SUBJECT: Hi\nBODY:\nBeta Roofing has worked in Culver City since 2011 and has 48 five-star reviews, no fee either side.", p.facts).subject) fail("7: a draft naming numbers that aren't on the record is kept");
  if (!MN.parsePitch("SUBJECT: A roofer for your list\nBODY:\nHi, Beta Roofing works in Culver City and Palms. Call (310) 555-0100. There's no fee involved on either side.", p.facts).subject) fail("7: a draft using only record facts is refused");
  if (/[—]/.test(MN.parsePitch("SUBJECT: A roofer — for you\nBODY:\nHi there, Beta Roofing works in Culver City — Palms too. No fee involved on either side.", p.facts).body || "")) fail("7: an em dash survives the draft");
  const db = fakeDb({ tips: [{ text: "Best of the Westside 2024", at: iso(NOW - DAY) }] }), f = fakeDeps(db, { left: 9999 });
  await MN.runClient({ clientId: CID, deps: f.d, now: NOW });
  POR.__useDeps({ ...f.d, gate: { ok: true, email: "owner@beta.example" } });
  const j = JSON.parse((await POR.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID }) })).body);
  const s = JSON.stringify(j.rows || []);
  if (/pitch|contact_email|editor@|sales@|toppros|blocked\.example/.test(s)) fail(`7: the client read carries a pitch, an address or a page they shouldn't see: ${s.slice(0, 200)}`);
  const ch = clientHtml(M.clientView({ ...j, now: NOW }));
  if (D.leaksPitch(ch.replace(/placeholder="[^"]*"/g, ""))) fail("7: the client card shows a pitch, an address, or a page that wouldn't open");
  if (!/On 1 · asked 1/.test(ch) || !/We're asking this week/.test(ch) || !/Seen Nov 11/.test(ch) || !/RGA is on it/.test(ch) || !/never pay to be listed/.test(ch)) fail("7: the client card isn't as drawn (On · asked, Seen, We're asking this week, the plain note)");
  if (!/You told us: "Best of the Westside 2024"/.test(ch) || !/For example: Best of the Westside 2024/.test(ch) || !/data-mn-tip-send/.test(ch)) fail("7: the client's optional part isn't drawn (their note, the example, Send)");
  const t = JSON.parse((await POR.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, action: "tip", text: "Chamber member since 2019" }) })).body);
  if (!t.ok || !db.T.client_activity.some((a) => a.kind === "client_mention_tip" && a.payload.answer.text === "Chamber member since 2019")) fail("7: the client's note isn't kept in their words");
}

// ══ 8 · wired ══
{
  const toml = read("netlify.toml"), man = read("netlify/functions/_job-manifest.js"), adm = read("admin/admin.js"), por = read("portal/portal.js");
  const cron = (/\[functions\."mentions-check"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/.exec(toml) || [])[1];
  if (!cron) fail("8: mentions-check isn't scheduled in netlify.toml");
  if (!new RegExp(`job: "mentions-check"[^\\n]*cron: "${(cron || "x").replace(/\*/g, "\\*")}"`).test(man)) fail("8: the job manifest doesn't list mentions-check with the same schedule");
  if (!/withCheckin\("mentions-check"/.test(read("netlify/functions/mentions-check.js"))) fail("8: mentions-check doesn't check in");
  // 11-11 (one admin card, batch 1): mentions.js moved again (its admin card is the one card), so the pin is "the same buster in both", not one string
  { const va = (/import "\/shared\/mentions\.js\?v=([0-9a-z]+)"/.exec(adm) || [])[1], vp = (/import "\/shared\/mentions\.js\?v=([0-9a-z]+)"/.exec(por) || [])[1];
    if (!va || !vp || va !== vp || va === "20261111x") fail(`8: admin and portal don't import shared/mentions.js at the same moved buster (${va} / ${vp})`); }
  if (!/step === "m1\.platform\.mentions" \? mnHostHtml\(step\)/.test(adm)) fail("8: admin step 55 doesn't draw the one list");
  // 11-11: Monthly 15 now has two bodies (before the links pilot, and in it): EVERY list slot must hold the one list, and there must be one
  { const slots = adm.match(/<div class="ob-mn-in15">[^<]*?<\/div>|<div class="ob-mn-in15">\$\{[^}]*\}<\/div>/g) || [];
    if (!slots.length || slots.some((s) => !/mnHostHtml\(Q2\.ID\.LINKS\)/.test(s))) fail(`8: Monthly 15 doesn't draw the one list in every body (${slots.length} slot(s))`); }
  if ((por.match(/\$\{ogMnHost\(cid\)\}/g) || []).length < 5) fail("8: an Ongoing work layout is missing the Where you're mentioned card");
  // 11-11: one pinned string broke the day another build moved the page (main went to ...mj, then ...nb). Whether a buster MOVED with its file is
  // check-every-cache-buster-moved-with-its-file's job (against origin/main); here: both pages load their script with a buster at all.
  // the page's buster must be this build's (11-11) or a LATER one: a later build bumps it again (11-12 night fixer: 20261112a)
  const busterOf = (f, n) => (new RegExp(`/${n}/${n}\\.js\\?v=(\\d{8}[a-z]*)"`).exec(read(f)) || [])[1] || "";
  if (!(busterOf("admin/index.html", "admin") >= "20261111a") || !(busterOf("portal/index.html", "portal") >= "20261111a")) fail("8: the admin or portal page loads its script with no buster");
}

// ══ 4b · step 55's places join the one list, their state carried over (nothing lost) ══
{
  const task55 = { status: "in_progress", outcome_data: { places: [{ host: "culvercitychamber.example", name: "Culver City Chamber", url: ON_URL, kind: "chamber" }, { host: "westsideweekly.example", name: "Westside Weekly", url: "https://westsideweekly.example/", kind: "news" }] },
    places: { "culvercitychamber.example": { state: "asked", asked_at: iso(NOW - 9 * DAY), by: "chris@x" }, "westsideweekly.example": { state: "not_for", reason: "They only cover restaurants" } } };
  const db = fakeDb({ task55 }), f = fakeDeps(db, { left: 0 });
  await MN.runClient({ clientId: CID, deps: f.d, now: NOW });
  const ch = db.T.client_mentions.find((r) => r.host === "culvercitychamber.example"), ww = db.T.client_mentions.find((r) => r.host === "westsideweekly.example");
  if (!ch || ch.source !== "step55" || ch.kind !== "association" || !ch.asked_at) fail(`4b: step 55's asked chamber isn't on the list as asked: ${JSON.stringify(ch).slice(0, 160)}`);
  if (!ww || ww.kind !== "press" || ww.status !== "skipped" || !/restaurants/.test(ww.reason || "")) fail("4b: step 55's 'not for this business' isn't kept as a skip with its reason");
  const sk = fakeDb({ task55: { status: "skipped" } }), fs2 = fakeDeps(sk, { left: 9999 });
  const o = await MN.runClient({ clientId: CID, deps: fs2.d, now: NOW });
  if (!o.skipped55 || fs2.calls.searches.length) fail("4b: a skipped step 55 still searches");
}
} catch (e) { fail(`the shipped code threw: ${String(e && e.stack || e).split("\n").slice(0, 2).join(" ")}`); }

if (leaked.length) fail(`the shipped code reached the real network: ${leaked.slice(0, 3).join(", ")}`);
if (F.length) { console.error(`❌ best of lists and mentions: ${F.length} problem(s)\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ a mention counts only when seen live: Listed needs a 200 read under 35 days naming the business (its forms, never split), a page that wouldn't open is Could not check, a pay-to-be-listed page is never pitched, searches stay above the reserve (2 to 4 a quarter, once; none with no trade), nothing sends by itself, nothing runs before the SQL (RLS + revoke in the same file), the pitch uses record facts only, the client sees no pitch or address, and it's wired");
