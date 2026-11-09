#!/usr/bin/env node
// check-step-25-reads-google.mjs — STEP 25 VERIFIES TRACKING FROM GOOGLE'S OWN DATA (approved step25_tracking_from_google_v1, the owner 11-8).
// RGA's step 25 read "GA4=not in page source… GSC=MISSING" while GA4 had data through Tag Manager and Search Console is a DNS-verified domain
// property. Working = data on their Google connection in the last 14 days; the homepage only says HOW GA4 loads. Against fakes:
// both working → verified (the autopilot records it already right); each missing / unconnected case says which and is never "verified";
// a tracking check that found something missing looks again once a day; admin's cards draw the lines, never the raw check text.
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "svc" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const today = new Date().toISOString().slice(0, 10), old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
let W = {};
globalThis.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (u.startsWith("https://db.test")) {
    if (u.includes("/client_google_oauth")) return ok(W.conn ? [W.conn] : []);
    const since = (u.match(/date=gte\.(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (u.includes("/client_ga4_daily")) return ok(W.ga4 && W.ga4 >= since ? [{ date: W.ga4 }] : []);
    if (u.includes("/client_gsc_daily")) return ok(W.gsc && W.gsc >= since ? [{ date: W.gsc }] : []);
    return ok([]);
  }
  if (u.startsWith("https://acme.test")) return new Response(W.home || "<html></html>", { status: 200 });
  return new Response("no", { status: 599 });
};
let FX, AR, SC, A;
try { FX = req(path.join(SITE, "netlify/functions/flow-execute.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js")); SC = req(path.join(SITE, "shared/site-change.js")); A = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  if (typeof FX.trackingCheck !== "function") throw new Error("flow-execute.js no longer exports trackingCheck"); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const run = async (w) => { W = w; try { return await FX.trackingCheck({ client: { id: "c1", website_url: "https://acme.test" } }); } catch (e) { return { outcome: `threw: ${e.message}`, summary: "" }; } };
try {
  const conn = { ga4_property_id: "properties/529089636", gsc_site_url: "sc-domain:acme.test" };
  // both working, GA4 through Tag Manager (RGA's case) → verified, and it says how GA4 loads
  let r = await run({ conn, ga4: today, gsc: today, home: '<script>(function(){})("GTM-MCGMSCCR")</script>' });
  if (r.outcome !== "verified" || !SC.ALREADY_RIGHT.includes(r.outcome)) fail(`working GA4 (through Tag Manager) + a domain Search Console isn't verified (${r.outcome}: ${r.summary})`);
  if (!/GA4 is receiving their visits: property 529089636, data through \d{4}-\d{2}-\d{2}, loads through Tag Manager GTM-MCGMSCCR\./.test(r.summary) || !/Search Console is reading their site: acme\.test \(whole domain\)/.test(r.summary)) fail(`the verified summary doesn't say what Google showed (${r.summary})`);
  if (/MISSING|not in page source|VERIFY IN/.test(r.summary)) fail("the old raw check text came back");
  // no tag on the page at all, data still flowing → still verified (the page never decides "missing")
  r = await run({ conn, ga4: today, gsc: today, home: "<html>nothing</html>" });
  if (r.outcome !== "verified") fail(`no tag in the page source turns working tracking into a finding (${r.outcome})`);
  // GA4 data older than 14 days → not verified, says so
  r = await run({ conn, ga4: old, gsc: today });
  if (r.outcome === "verified" || !/GA4 has no visits on record in the last 14 days \(property 529089636\)/.test(r.summary)) fail(`old GA4 data still counts as working (${r.outcome}: ${r.summary})`);
  // no Search Console property → says so
  r = await run({ conn: { ga4_property_id: "properties/1" }, ga4: today });
  if (r.outcome === "verified" || !/No Search Console property on their Google connection/.test(r.summary)) fail(`a missing Search Console property isn't named (${r.summary})`);
  // no Google connection → can't tell, never verified
  r = await run({ conn: null });
  if (r.outcome !== "indeterminate" || !/No GA4 property/.test(r.summary)) fail(`no Google connection isn't 'can't tell' (${r.outcome})`);

  // the daily re-check while something is missing
  const now = Date.parse("2026-11-09T12:00:00Z"), step = { id: "m1.web.tracking", dependsOn: [], hasRunner: true };
  const t = { status: "in_progress", ran_at: new Date(now - 25 * 3600e3).toISOString(), auto_result: { summary: "x", outcome: "missing_tags" }, auto_failed: { at: "x", run: new Date(now - 25 * 3600e3).toISOString(), kind: "check", why: "x", rev: SC.AUTO_FINISH_REV } };
  const p = AR.planStep(step, { "m1.web.tracking": t }, now);
  if (!p || p.act !== "redo" || !/^redo:daily:2026-11-09$/.test(p.sig)) fail(`a tracking check that found something missing doesn't look again the next day (${JSON.stringify(p)})`);
  const p2 = AR.planStep(step, { "m1.web.tracking": { ...t, ran_at: new Date(now - 3600e3).toISOString(), auto_failed: { ...t.auto_failed, run: new Date(now - 3600e3).toISOString() } } }, now);
  if (p2) fail("it re-checks more than once a day");
  if (AR.planStep({ id: "m1.web.schema", dependsOn: [], hasRunner: true }, { "m1.web.schema": { ...t } }, now)) fail("another step's failed check re-runs daily (only tracking does)");

  // admin draws the lines
  const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); return m ? src.slice(m.index, src.indexOf("\n}\n", m.index) + 2) : null; };
  const ctx = vm.createContext({ escapeHtml: (s) => String(s), wcDay: (d) => `D(${d})`, acCk: (rows) => rows.map((r) => `[${r[3] ? "!" : "✓"} ${r[0]} | ${r[1]} | ${r[2]}]`).join("") });
  // 🔄 11-8 night: the "connect it in …" lines name the access steps through obStepRef (the live order); the real line is lifted
  // (no numbering in the vm, so it reads "its step", exactly what admin shows before the order is known)
  vm.runInContext((A.match(/^const obStepRef = .*$/m) || [""])[0].replace(/^const /, "var "), ctx);
  vm.runInContext(lift(A, "wcTrackingRowsHtml"), ctx);
  const rows = (od) => vm.runInContext(`wcTrackingRowsHtml(${JSON.stringify({ auto_result: { outcome_data: od } })})`, ctx);
  const okRows = rows({ checked: "google_data", ga4_property: "529089636", ga4_through: "2026-11-02", gsc_site: "acme.test", gsc_domain: true, gsc_through: "2026-10-31", how: "Tag Manager GTM-X" });
  if (!/\[✓ GA4 is receiving their visits \| Property 529089636 · data through D\(2026-11-02\) · loads through Tag Manager GTM-X \| Google says so\]/.test(okRows) || !/\[✓ Search Console is reading their site \| acme\.test \(whole domain\)/.test(okRows) || !/\[✓ The tag is on their pages/.test(okRows)) fail(`the done card's lines aren't the approved three (${okRows})`);
  const missRows = rows({ checked: "google_data", ga4_property: "1", ga4_through: "2026-11-07", gsc_site: null, gsc_through: null });
  if (!/\[! Search Console has no data for their site \| Their Google connection has no Search Console property\./.test(missRows)) fail(`a missing Search Console isn't RGA's move with what to do (${missRows})`);
  if (rows({ summary: "old run" }) !== "") fail("an older run's card is replaced by empty lines");
  if (!/if \(SC\.autoFailedNow\(task\) && SC\.changeState\(task\) === "none" && id === "m1\.web\.tracking" && wcTrackingRowsHtml\(task\)\) return/.test(A) || !/label: id === "m1\.web\.tracking" && wcTrackingRowsHtml\(task\) \? "Done, by itself"/.test(A)) fail("admin's step 25 cards don't draw the lines");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ step 25 — ${F.length} regression(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ step 25 verifies tracking from Google's own data: GA4 + Search Console data in 14 days = verified however the tag loads (the page only says how), each missing piece named and never verified, no connection = can't tell, a missing one re-checks daily, admin draws the three lines and never the raw check text");
