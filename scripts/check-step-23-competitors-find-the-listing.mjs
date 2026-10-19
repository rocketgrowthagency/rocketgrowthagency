#!/usr/bin/env node
// check-step-23-competitors-find-the-listing.mjs — batch 4 item 6 (approved m1-23 "Couldn't locate the listing", 10-19).
// A gbp_url without "@lat,lng" (a short / share link) is NOT "no listing": step 23 falls back to the connected profile's
// latlng, then its Place ID → SerpAPI place lookup, and excludes the client's own listing by Place ID. Only when every
// measured source is empty is it indeterminate — and it says what was tried. Runs the real runner (vm lift) on fakes.
//   exit 0 = holds · 1 = a fallback / exclusion broke · 2 = the runner moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let flow; try { flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }
const at = flow.indexOf('"m1.audit.competitors": async');
if (at < 0) { console.error("⚠️  INDETERMINATE — step 23's runner moved"); process.exit(2); }
const fnStart = flow.indexOf("async", at);
let d = 0, end = -1;
for (let i = flow.indexOf("{", flow.indexOf("=>", fnStart)); i < flow.length; i++) { if (flow[i] === "{") d++; else if (flow[i] === "}") { d--; if (!d) { end = i + 1; break; } } }
const F = [];
const ok = (j, status = 200) => ({ ok: status < 400, status, json: async () => j });
const RIVALS = [
  { title: "Acme Plumbing", data_id: "0xown:0x1", place_id: "ChIJOWN", rating: 5, reviews: 9 },          // the client, under a different name spelling? no — same name
  { title: "Acme Plumbing & Drain", place_id: "ChIJOWN", rating: 5, reviews: 9 },                          // the client by Place ID, renamed on Maps
  { title: "Westside Pros", place_id: "ChIJ1", rating: 4.8, reviews: 142 },
  { title: "Rapid Rooter", place_id: "ChIJ2", rating: 4.6, reviews: 88 },
  { title: "Blue Pipe Co", place_id: "ChIJ3", rating: 4.9, reviews: 51 },
];
function mk({ oauth = { gbp_location_id: "locations/1" }, loc = { latlng: { latitude: 42.36, longitude: -71.06 }, metadata: { placeId: "ChIJOWN" } }, locStatus = 200, place = null } = {}) {
  const ctx = { calls: [] };
  vm.createContext(Object.assign(ctx, { URL, JSON, String, Number, Array, Date, Math, process: { env: { SERPAPI_KEY: "x" } },
    markDone: (o) => ({ ...o, completed: true }),
    loadOauth: async () => oauth, googleAccessToken: async () => "t",
    fetch: async (u) => {
      const url = String(u); ctx.calls.push(url);
      if (url.includes("mybusinessbusinessinformation")) return ok(loc, locStatus);
      const q = new URL(url).searchParams;
      if (q.get("place_id")) return ok(place || { place_results: {} });
      ctx.ll = q.get("ll");
      return ok({ local_results: RIVALS });
    } }));
  return { run: vm.runInContext(`(${flow.slice(fnStart, end)})`, ctx), ctx };
}
const base = { business_name: "Acme Plumbing", primary_service: "plumber", primary_market: "Boston, MA" };
// 1 · a full Maps link still works on its own (no extra calls)
{ const { run, ctx } = mk();
  const r = await run({ client: { ...base, gbp_url: "https://www.google.com/maps/place/Acme/@42.1,-71.2,15z/data=!1s0xown:0x1" }, clientId: "c" });
  if (r.outcome !== "verified") F(`a full Maps link no longer measures (${r.outcome}: ${String(r.summary).slice(0, 120)})`);
  if (ctx.calls.some((c) => c.includes("mybusinessbusinessinformation") || c.includes("place_id="))) F("a full Maps link spends extra Google / SerpAPI calls");
  if (ctx.ll !== "@42.1,-71.2,14z") F(`the map pack is searched at ${ctx.ll}, not the listing's coordinates`); }
// 2 · a short link → the connected profile's pin; the client's own listing excluded by Place ID even when renamed
{ const { run, ctx } = mk();
  const r = await run({ client: { ...base, gbp_url: "https://maps.app.goo.gl/AbCdEf" }, clientId: "c" });
  if (r.outcome !== "verified") F(`a short link with a connected profile is still not measured (${r.outcome}: ${String(r.summary).slice(0, 160)})`);
  if (!/^@42\.36/.test(ctx.ll || "")) F(`the fallback did not search at the connected profile's pin (${ctx.ll})`);
  const names = (r.outcome_data?.competitors || []).map((c) => c.name);
  if (names.some((n) => /Acme/.test(n))) F(`the client is counted as their own competitor (${names.join(", ")})`);
  if (names.length !== 3) F(`expected the top 3 rivals, got ${names.length}`);
  if (r.outcome_data?.coords_from !== "connected_profile") F("the snapshot doesn't record where its coordinates came from");
  if (ctx.calls.some((c) => c.includes("place_id="))) F("a profile with a pin still spends a SerpAPI place lookup"); }
// 3 · profile without a pin → Place ID lookup
{ const { run, ctx } = mk({ loc: { metadata: { placeId: "ChIJOWN" } }, place: { place_results: { gps_coordinates: { latitude: 42.5, longitude: -71.5 } } } });
  const r = await run({ client: { ...base, gbp_url: "" }, clientId: "c" });
  if (r.outcome !== "verified" || !/^@42\.5/.test(ctx.ll || "") || r.outcome_data?.coords_from !== "place_id") F(`no pin on the profile didn't fall back to the Place ID lookup (${r.outcome}, ${ctx.ll})`); }
// 4 · nothing measurable anywhere → indeterminate, says what it tried, never a market from a guess
{ const { run, ctx } = mk({ oauth: {}, loc: {} });
  const r = await run({ client: { ...base, gbp_url: "https://maps.app.goo.gl/x" }, clientId: "c" });
  if (r.outcome !== "indeterminate" || r.completed === true) F("no coordinates anywhere isn't indeterminate");
  if (!/no Google Business Profile is connected/.test(r.summary || "")) F("the indeterminate doesn't say what was tried");
  if (ctx.ll) F("it searched a map pack with no coordinates of the listing"); }
// 5 · Google refuses the profile read → still tries the stored Place ID, else indeterminate (never a throw)
{ const { run } = mk({ locStatus: 403, loc: { error: { message: "denied" } } });
  let r; try { r = await run({ client: { ...base, gbp_url: "x", google_place_id: "ChIJOWN" }, clientId: "c" }); } catch (e) { r = { outcome: "threw " + e.message }; }
  if (r.outcome !== "indeterminate" || !/could not be read/.test(r.summary || "")) F(`a refused profile read is not an honest indeterminate (${r.outcome})`); }
if (F.length) { console.error("🔴 step 23 can't find the client's listing honestly:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 23: full link → its coords · short link → the connected pin → the Place ID lookup · own listing excluded by Place ID · nothing measurable → indeterminate naming what was tried");
