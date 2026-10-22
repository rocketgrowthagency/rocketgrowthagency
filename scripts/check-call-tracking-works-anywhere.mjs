#!/usr/bin/env node
// check-call-tracking-works-anywhere.mjs — 2026-10-22 (Chris: "what if client is in a different city or state? this system must work for
// all clients in the USA"; research reports/Call tracking for local businesses.md). RUNS the provisioning handler and every provider
// adapter on a fake network and pins:
//   · the tracking account uses the CLIENT's time zone (TX → Chicago, NY → New York, HI → Honolulu), never RGA's Los Angeles
//   · the area code comes from the client's own number in ANY typed format ("+1 (512) …", "512.555…", "15125550142") — never "151"
//   · a sold-out area code says so and asks for a nearby one
//   · every adapter reads EVERY page (CallRail, CTM, WhatConverts numbered pages; Quo page tokens); a full page with no page count, or
//     too many pages, is "indeterminate", never a short count reported as the month
//   exit 0 holds · 1 regressed · 2 harness
import { createRequire } from "node:module";
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`, FNS_REAL = fs.realpathSync(FNS);
const req = createRequire(`${FNS}/x.js`);
const F = [], fail = (m) => F.push(m);
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
process.env.CALLRAIL_API_KEY = "crk"; process.env.CALLRAIL_ACCOUNT_ID = "ACC1";
globalThis.__rgaFetchDeadlineInstalled = true;
let calls = [], world = {};
const J = (b, st = 200) => ({ ok: st < 400, status: st, json: async () => b, text: async () => JSON.stringify(b) });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input), method = (init.method || "GET").toUpperCase();
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  calls.push({ url, method, body });
  if (url.includes("/companies.json") && method === "POST") return J({ id: 77, script_hash: "h" });
  if (url.includes("/trackers.json") && method === "POST") return world.soldOut ? J({ error: "No numbers available for area code" }, 422) : J({ tracking_number: "+15125550100" });
  if (url.startsWith("https://db.test/rest/v1/clients")) { if (method !== "GET" && body && typeof body === "object") Object.assign(world.client, body); return method === "GET" ? J([world.client]) : J([world.client]); }
  if (url.startsWith("https://db.test/rest/v1/client_onboarding_records")) return J([{ data: { tasks: { "m1.tracking.call_setup": { client_choice: "rga_sets_up" } } } }]);
  if (url.startsWith("https://db.test/rest/v1/")) return J([]);
  // paged providers: world.pages = [n per page...]; total_pages unless world.noCount
  const pg = Number((url.match(/[?&](?:page|page_number)=(\d+)/) || [])[1] || 1);
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ answered: true, duration: 90, call_duration: 90, id: `${pg}-${i}` }));
  if (url.includes("api.callrail.com") && url.includes("/calls.json")) return J({ calls: mk(world.pages[pg - 1] || 0), ...(world.noCount ? {} : { total_pages: world.pages.length }) });
  if (url.includes("calltrackingmetrics.com")) return J({ calls: mk(world.pages[pg - 1] || 0), total_pages: world.pages.length });
  if (url.includes("whatconverts.com")) return J({ leads: mk(world.pages[pg - 1] || 0), total_pages: world.pages.length });
  if (url.includes("openphone.com/v1/phone-numbers")) return J({ data: [{ id: "PN1", number: "+15125550142" }] });
  if (url.includes("openphone.com/v1/conversations")) {
    const t = (url.match(/pageToken=([^&]+)/) || [])[1];
    return t ? J({ data: [{ participants: ["+15550000002"], lastActivityAt: "2026-10-10T00:00:00Z" }] }) : J({ data: [{ participants: ["+15550000001"], lastActivityAt: "2026-10-10T00:00:00Z" }], nextPageToken: "P2" });
  }
  if (url.includes("openphone.com/v1/calls")) return J({ data: [{ direction: "incoming", createdAt: "2026-10-10T15:00:00Z", answeredAt: "x", duration: 120 }] });
  return J({}, 404);
};
function load(name) {
  for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k];
  const authPath = req.resolve("./_auth.js");
  req.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireWorkspaceForClientOrInternal: async () => ({ workspaceId: "w1", email: "chris@rga.test" }) } };
  return req(`./${name}`);
}
const CID = "11111111-2222-4333-8444-555555555555";
const provision = async (client, extra = {}) => { calls = []; world.client = { id: CID, business_name: "Acme", ...client };
  const r = await load("call-tracking-provision.js").handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, provider: "callrail", ...extra }) });
  return { status: r.statusCode, body: JSON.parse(r.body || "{}") }; };
for (const [market, phone, tz, ac] of [["Austin, TX", "+1 (512) 555-0142", "America/Chicago", "512"], ["Brooklyn, NY", "718.555.0199", "America/New_York", "718"],
  ["Honolulu, HI", "18085550123", "Pacific/Honolulu", "808"], ["Phoenix, AZ", "(602) 555-0100", "America/Phoenix", "602"]]) {
  world = { pages: [] };
  const r = await provision({ primary_market: market, identity_phone: phone });
  const co = calls.find((c) => c.url.includes("/companies.json")), tr = calls.find((c) => c.url.includes("/trackers.json"));
  if (!co || co.body.time_zone !== tz) fail(`${market}: the tracking account runs on ${co && co.body.time_zone} (want the client's ${tz})`);
  if (!tr || tr.body.tracking_number?.area_code !== ac) fail(`${market}: a number typed "${phone}" gets area code ${tr && tr.body.tracking_number?.area_code} (want ${ac})`);
  if (r.status >= 500) fail(`${market}: provisioning failed (${r.status} ${r.body.error || ""})`);
}
world = { pages: [], soldOut: true };
{ const r = await provision({ primary_market: "Manhattan, NY", identity_phone: "212-555-0100" });
  if (!/No local numbers are free in area code 212/.test(r.body.error || "")) fail(`a sold-out area code doesn't say so and ask for a nearby one (${r.body.error})`); }
// pagination
const P = load("_call-providers.js").PROVIDERS;
const A = { companyId: "C1", month: "2026-10-01", end: "2026-10-31", key: "a:b", account: "ACC1" };
for (const k of ["callrail", "calltrackingmetrics", "whatconverts"]) {
  world = { pages: [250, 250, 37] };
  const r = await P[k].fetchMonth(A);
  if (r.outcome !== "verified" || r.rings !== 537) fail(`${k}: a 3-page month counts ${r.rings} calls (want 537) · ${r.outcome}`);
}
world = { pages: [250, 250], noCount: true };
{ const r = await P.callrail.fetchMonth(A); if (r.outcome !== "indeterminate") fail(`CallRail: a full page with no page count is reported as the whole month (${r.rings})`); }
world = { pages: Array(60).fill(250) };
{ const r = await P.callrail.fetchMonth(A); if (r.outcome !== "indeterminate") fail("CallRail: more pages than the cap is reported as complete"); }
world = { pages: [] };
{ const r = await P.quo.fetchMonth({ ...A, companyId: "PN1", key: "q" }); if (r.outcome !== "verified" || r.rings !== 2) fail(`Quo: the second page of conversations is ignored (${r.rings} calls, want 2)`); }
if (F.length) { console.error("🔴 call tracking doesn't work everywhere:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ call tracking works in any state: the client's time zone (TX/NY/HI/AZ), their area code from any typed format, a sold-out area code asks for a nearby one; CallRail/CTM/WhatConverts/Quo read every page or say indeterminate");
