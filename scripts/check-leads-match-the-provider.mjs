#!/usr/bin/env node
// check-leads-match-the-provider.mjs: LEADS TO BOOKED JOBS counts what the provider counts, once, and never a guessed 0
// (approved tier3_best_in_class_v1 §1, Chris 11-11; website shared/leads.js, netlify/functions/_leads.js, portal-leads.js).
// HOLDS, on the WEBSITE repo (fakes only: no provider, no Google, nothing written; the live part below is one database read):
//   1  ROWS = THE COUNT. Every provider adapter (CallRail, Quo, CallTrackingMetrics, WhatConverts) hands back one row per call from the SAME
//      read (CallRail: still one request per page), and its counted rows equal its own `calls` (answered and 30 seconds or more).
//   2  LAST 4 ONLY. No row, no saved body and no view carries a caller's full number; last4 is exactly 4 digits. The SQL can't hold more.
//   3  NO LEAD TWICE. A lead read twice is one lead; a form that fired form_submit AND generate_lead is one form, not two.
//   4  NOT READ IS NEVER 0. A failed provider read says "aren't read yet" (client) and names the answer + next try (admin); a missing
//      table / no provider says "Not counted yet"; no tile draws a 0 it didn't count.
//   5  COST PER BOOKED JOB only with at least one booked job and a plan price; the report leaves the row out otherwise.
//   6  QUO IS THE BUSINESS LINE: its calls read "All calls to your business line", never "Google profile number".
//   7  BEFORE THE SQL IS RUN every reader answers table:false (portal-leads 200 "Not counted yet"), and saving writes nothing.
//   8  THE SQL: client_leads with row level security ON and anon/authenticated revoked in the SAME file (feedback_every_table_has_rls).
//   9  WIRED: call-tracking-sync saves the rows and notes a miss; the nightly job syncs forms; the report freezes the totals when it is built
//      and prints the section; both portals import shared/leads.js and draw the hosts.
//  LIVE (daily, skipped in a mutation copy): for this month, a client whose last read saved lead rows has exactly `connected` counted rows.
// PROVES ITSELF (LIVE_BEFORE): it MUST fail on the website before this build (default f113d9c5) in 8+ places, else exit 2 INDETERMINATE.
//   node scripts/check-leads-match-the-provider.mjs [--against=<rev>] [--no-before]
// exit 0 holds · 1 a lead is miscounted, doubled, leaked or shown as a guessed 0 · 2 INDETERMINATE
import fs from "node:fs";
import path from "node:path";
import { runGate, reader, loader, codeLines, SITE } from "./lib/site-rev.mjs";

const BEFORE = "f113d9c5";
const FULL = ["3105550123", "4245559876", "8185550147", "7145550199"];   // fixture callers' full numbers: none may survive the adapter

// one fetch for the whole process: _deadline.js wraps whatever fetch exists when it first loads, so the fake must be installed first
let route = () => { throw new Error("no fake route set"); };
const calls = [];
const REAL_FETCH = globalThis.fetch;   // the live part's one database read uses the real one
globalThis.fetch = async (url, init) => { calls.push(String(url)); return route(String(url), init || {}); };
const txt = (h) => String(h || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");   // what a person reads
const res = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

const PROVIDER_FIXTURES = {
  callrail: () => {
    const page = (n) => ({ total_pages: 2, calls: n === 1
      ? [{ id: "C1", start_time: "2026-11-10T17:42:00Z", duration: 240, answered: true, first_call: true, customer_phone_number: "+13105550123", source: "Google My Business" },
         { id: "C2", start_time: "2026-11-09T21:00:00Z", duration: 12, answered: true, first_call: false, customer_phone_number: "+14245559876", source: "Google My Business" }]
      : [{ id: "C3", start_time: "2026-11-09T20:03:00Z", duration: 0, answered: false, first_call: true, customer_phone_number: "+18185550147", source: "Google My Business" },
         { id: "C4", start_time: "2026-11-08T18:00:00Z", duration: 31, answered: true, first_call: false, customer_phone_number: "+17145550199", source: "Google My Business" }] });
    return { route: (u) => res(page(/[?&]page=2(&|$)/.test(u) ? 2 : 1)), args: { companyId: "co1", month: "2026-11-01", end: "2026-11-30", key: "k", account: "a" }, expect: { calls: 2, requests: 2 } };
  },
  quo: () => ({
    route: (u) => /phone-numbers/.test(u) ? res({ data: [{ id: "PN1", number: "+13105550000" }] })
      : /conversations/.test(u) ? res({ data: [{ participants: ["+13105550123"], lastActivityAt: "2026-11-10T00:00:00Z" }, { participants: ["+14245559876"], lastActivityAt: "2026-11-09T00:00:00Z" }] })
        : /participants%5B%5D=%2B1310|participants\[\]=%2B1310/.test(u) ? res({ data: [{ id: "Q1", createdAt: "2026-11-10T17:42:00Z", answeredAt: "2026-11-10T17:42:05Z", duration: 200, direction: "incoming" }, { id: "Q2", createdAt: "2026-11-10T18:00:00Z", answeredAt: null, duration: 0, direction: "incoming" }] })
          : res({ data: [{ id: "Q3", createdAt: "2026-11-09T10:00:00Z", answeredAt: "2026-11-09T10:00:03Z", duration: 9, direction: "incoming" }, { id: "Q4", createdAt: "2026-11-09T11:00:00Z", answeredAt: "2026-11-09T11:00:03Z", duration: 90, direction: "outgoing" }] }),
    args: { companyId: "PN1", month: "2026-11-01", end: "2026-11-30", key: "k" }, expect: { calls: 1 } }),
  calltrackingmetrics: () => ({
    route: () => res({ total_pages: 1, calls: [{ id: 11, unix_time: 1762796520, duration: 75, status: "answered", caller_number: "+13105550123", source: "Google Organic", is_new_caller: true },
      { id: 12, unix_time: 1762796600, duration: 0, status: "no answer", caller_number: "+14245559876", source: "Website" }] }),
    args: { companyId: "", month: "2026-11-01", end: "2026-11-30", key: "a:b", account: "acc" }, expect: { calls: 1 } }),
  whatconverts: () => ({
    route: () => res({ total_pages: 1, leads: [{ lead_id: 91, date_created: "2026-11-10 17:42:00", call_duration: 45, caller_number: "(310) 555-0123", lead_source: "google" },
      { lead_id: 92, date_created: "2026-11-10 18:42:00", call_duration: 10, caller_number: "(424) 555-9876", lead_source: "google" }] }),
    args: { companyId: "p1", month: "2026-11-01", end: "2026-11-30", key: "a:b" }, expect: { calls: 1 } }),
};

/** A fake Supabase REST: tables as arrays; `missing` names tables that answer PGRST205. Records every write. */
function fakeSupa({ tables = {}, missing = [] } = {}) {
  const writes = [];
  const supa = async (p, init = {}) => {
    const table = p.replace(/^\//, "").split("?")[0];
    if (missing.includes(table)) throw new Error(`404 {"code":"PGRST205","message":"Could not find the table 'public.${table}' in the schema cache"}`);
    const m = (init.method || "GET").toUpperCase();
    if (m !== "GET") { writes.push({ table, method: m, path: p, body: init.body ? JSON.parse(init.body) : null }); if (m === "PATCH") { const id = (p.match(/id=eq\.(\d+)/) || [])[1]; const row = (tables[table] || []).find((r) => String(r.id) === id); if (row) Object.assign(row, JSON.parse(init.body)); } return []; }
    let rows = (tables[table] || []).slice();
    const q = new URLSearchParams(p.split("?")[1] || "");
    for (const [k, v] of q) { if (["select", "order", "limit", "on_conflict"].includes(k) || k.includes("->")) continue; const [op, val] = [v.split(".")[0], v.slice(v.indexOf(".") + 1)];
      if (op === "eq") rows = rows.filter((r) => String(r[k]) === val); else if (op === "in") { const set = val.replace(/^\(|\)$/g, "").split(","); rows = rows.filter((r) => set.includes(String(r[k]).slice(0, 10)) || set.includes(String(r[k]))); } }
    return rows;
  };
  return { supa, writes };
}

async function checkTree(root, label) {
  const F = [], fail = (m) => F.push(`${label}: ${m}`), rd = reader(root), req = loader(root);
  const need = ["shared/leads.js", "netlify/functions/_leads.js", "netlify/functions/portal-leads.js", "docs/supabase/CLIENT_LEADS_2026-11-11.sql"];
  for (const f of need) if (rd(f) == null) fail(`${f} does not exist`);

  // 8 · the SQL
  const sql = rd("docs/supabase/CLIENT_LEADS_2026-11-11.sql") || "";
  if (!/create table if not exists public\.client_leads/i.test(sql)) fail("the SQL file doesn't create public.client_leads");
  if (!/alter table public\.client_leads enable row level security/i.test(sql)) fail("client_leads is created without row level security in the same file");
  if (!/revoke all on public\.client_leads from anon, authenticated/i.test(sql)) fail("client_leads doesn't revoke anon and authenticated in the same file");
  if (!/last4\s+text check \(last4 is null or last4 ~ '\^\[0-9\]\{4\}\$'\)/i.test(sql)) fail("client_leads.last4 isn't held to exactly 4 digits");
  const tableDef = (sql.match(/create table[\s\S]*?\n\);/i) || [""])[0].split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  if (/\b(phone|caller_number|customer_phone\w*|full_number)\b/i.test(tableDef)) fail("client_leads has a column that could hold a caller's full number");
  if (!/unique \(client_id, lead_key\)/i.test(sql)) fail("client_leads has no unique (client_id, lead_key): a lead read twice could be stored twice");

  // 1 + 2 · every adapter: rows from the same read, counted rows = calls, last 4 only
  let P = null;
  try { P = req("./netlify/functions/_call-providers.js"); } catch (e) { fail(`_call-providers.js doesn't load: ${String(e.message).slice(0, 120)}`); }
  if (P) {
    if (!/fields=answered,duration,first_call,source/.test(rd("netlify/functions/_call-providers.js") || "")) fail("CallRail's read doesn't ask for the call's source (needed to tell Google profile calls from others)");
    for (const [key, mk] of Object.entries(PROVIDER_FIXTURES)) {
      const fx = mk(); route = fx.route; calls.length = 0;
      let out;
      try { out = await P.PROVIDERS[key].fetchMonth(fx.args); } catch (e) { fail(`${key}: fetchMonth threw on the fixture (${String(e.message).slice(0, 100)})`); continue; }
      if (out.outcome !== "verified") { fail(`${key}: the fixture read wasn't verified (${out.reason || "no reason"})`); continue; }
      if (!Array.isArray(out.rows)) { fail(`${key}: hands back no per-call rows, so a lead can't be marked`); continue; }
      const counted = out.rows.filter((r) => r.counted === true).length;
      if (counted !== out.calls) fail(`${key}: ${counted} counted rows but the provider count says ${out.calls}: the lead list and the number disagree`);
      if (out.calls !== fx.expect.calls) fail(`${key}: counted ${out.calls} calls of 30 seconds or more, the fixture has ${fx.expect.calls}`);
      if (fx.expect.requests && calls.length !== fx.expect.requests) fail(`${key}: made ${calls.length} requests for ${fx.expect.requests} pages: the rows must come from the same read`);
      const keys = out.rows.map((r) => r.lead_key);
      if (new Set(keys).size !== keys.length || keys.some((k) => !k)) fail(`${key}: a row has no lead_key or two rows share one`);
      const blob = JSON.stringify(out.rows);
      if (FULL.some((n) => blob.includes(n) || blob.includes(n.slice(3)))) fail(`${key}: a row carries more of the caller's number than the last 4 digits`);
      if (out.rows.some((r) => r.last4 != null && !/^\d{4}$/.test(r.last4))) fail(`${key}: a row's last4 isn't exactly 4 digits`);
      if (key === "quo" && out.rows.some((r) => r.source != null)) fail("quo: a Quo row claims a source; Quo can't tell where a call came from");
    }
  }

  // 3 4 5 6 · the shared rules and drawings
  let L = null;
  try { L = req("./shared/leads.js"); } catch (e) { fail(`shared/leads.js doesn't load: ${String(e.message).slice(0, 120)}`); }
  if (L) {
    const NOW = Date.parse("2026-11-11T19:30:00Z"), month = "2026-11-01", prov = { key: "callrail", label: "CallRail", attributed: true }, forms = { connected: true };
    const row = (o) => ({ month, kind: "call", provider: "callrail", answered: true, counted: true, seconds: 120, at: "2026-11-10T17:42:00Z", last4: "4471", source: "Google My Business", ...o });
    const rows = [row({ id: "1", lead_key: "callrail:A" }), row({ id: "1b", lead_key: "callrail:A", read_at: "2026-11-11" }), row({ id: "2", lead_key: "callrail:B", answered: false, counted: false, seconds: 0, last4: "9902" })];
    const s = L.summaryOf({ month, now: NOW, rows, record: { data: { calls: { connected: 1, answered: 1, missed: 1, at: "2026-11-11T14:05:00Z" } } }, price: 625, provider: prov, forms });
    if (s.calls !== 1) fail(`a call read twice was counted ${s.calls} times`);
    if (s.leads !== 2) fail(`a counted call and a missed call should be 2 leads, got ${s.leads}`);
    if (s.cost != null) fail("cost per booked job appears with no booked job");
    const dash0 = L.dashHtml(L.viewOf({ table: true, now: NOW, month, rows, records: { [month]: { data: { calls: { connected: 1, at: "2026-11-11T14:05:00Z" } } } }, price: 625, provider: prov, forms }), { cid: "c" });
    if (/Your \$625 plan divided by/.test(dash0)) fail("the cost tile divides the plan by 0 booked jobs");
    const sec0 = L.reportSection(s, {});
    if (!sec0 || sec0.rows.some((r) => /Cost per booked job/.test(r.label))) fail("the report prints a cost per booked job with no booked job (or prints no section at all)");
    const booked = rows.map((r) => (r.id === "1b" ? { ...r, mark: "booked", job_value: 1200 } : r));
    const s1 = L.summaryOf({ month, now: NOW, rows: booked, record: {}, price: 625, provider: prov, forms });
    if (s1.cost !== 625) fail(`one booked job on a $625 plan should cost $625 per booked job, got ${s1.cost}`);
    // 4 · not read / not set up is never 0
    const failedRec = { [month]: { data: { calls: { connected: 1, at: "2026-11-10T14:05:00Z" }, calls_read: { ok: false, at: "2026-11-11T14:05:00Z", status: "503", reason: "CallRail returned 503", misses: 1 } } } };
    const vf = L.viewOf({ table: true, now: NOW, tz: "America/Los_Angeles", month, rows, records: failedRec, price: 625, provider: prov, forms });
    const dashF = txt(L.dashHtml(vf, { cid: "c" })), admF = txt(L.adminHtml(vf, { month, number: 30 }));
    if (!/aren't read yet\. They'll appear here\. Nothing is shown as 0\./.test(dashF)) fail("a failed provider read doesn't tell the client which calls aren't read yet");
    if (!/answered 503/.test(admF) || !/Next try/.test(admF) || !/System health/.test(admF)) fail("the admin card doesn't name the provider's answer, the next try and System health on a failed read");
    const vNone = L.viewOf({ table: false, now: NOW, month, provider: prov, forms, taps: 3 });
    const dashN = L.dashHtml(vNone, { cid: "c" }), markN = L.markHtml(vNone, {}), admN = L.adminHtml(vNone, { month });
    if (!/Not counted yet/.test(dashN) || /class="n">0</.test(dashN)) fail('before the table exists the Dashboard must say "Not counted yet" and draw no 0');
    if (!/Not counted yet/.test(markN)) fail('before the table exists the Mark card must say "Not counted yet"');
    if (!/CLIENT_LEADS_2026-11-11\.sql/.test(admN)) fail("before the table exists the admin card doesn't name the SQL file to run");
    const vEmpty = L.viewOf({ table: true, now: NOW, month, rows: [], provider: null, forms: { connected: false } });
    if (/class="n">0</.test(L.dashHtml(vEmpty, { cid: "c" }))) fail("with no provider and no form tracker a tile draws 0");
    // 6 · Quo
    const quo = { key: "quo", label: "Quo / OpenPhone", attributed: false };
    const qRows = [row({ id: "q1", lead_key: "quo:Q1", provider: "quo", source: null })];
    const vq = L.viewOf({ table: true, now: NOW, month, rows: qRows, records: { [month]: { data: { calls: { connected: 1, at: "2026-11-11T14:05:00Z" } } } }, price: 625, provider: quo, forms });
    const dq = L.dashHtml({ ...vq, showPrev: false }, { cid: "c" }), rq = L.reportSection(vq.cur_s, {});
    if (!/All calls to your business line/.test(dq) || /Google profile number/.test(dq)) fail('Quo calls aren\'t labeled "All calls to your business line" on the Dashboard');
    if (!rq || !rq.rows.some((r) => r.label === "All calls to your business line")) fail('the report doesn\'t label Quo calls "All calls to your business line"');
    // 2 · the drawings show the last 4 only
    const mk = L.markHtml(L.viewOf({ table: true, now: NOW, tz: "America/Los_Angeles", month, rows, records: {}, price: 625, provider: prov, forms }), {});
    if (!/ends in 4471/.test(mk)) fail("the Mark card doesn't show the caller's last 4 digits");
    if (!/data-lds-mark="booked"/.test(mk) || !/>Booked</.test(mk) || !/>Not booked</.test(mk) || !/>Not a lead</.test(mk)) fail("the Mark card doesn't offer Booked, Not booked and Not a lead");
    for (const { l, n } of codeLines(rd("shared/leads.js") || "")) if (/—/.test(l)) { fail(`shared/leads.js:${n} has an em dash in code a person can read`); break; }
  }

  // 3 4 7 · the server half with a fake database
  let LD = null;
  try { LD = req("./netlify/functions/_leads.js"); } catch (e) { fail(`_leads.js doesn't load: ${String(e.message).slice(0, 120)}`); }
  if (LD) {
    const cid = "11111111-1111-1111-1111-111111111111";
    const miss = fakeSupa({ missing: ["client_leads"], tables: { clients: [{ id: cid, business_name: "Example", kpi_config: { call_tracking: true }, call_tracking_provider: "callrail", primary_market: "Austin, TX" }] } });
    const s0 = await LD.saveCalls(miss.supa, { clientId: cid, month: "2026-11-01", rows: [{ kind: "call", lead_key: "callrail:A", counted: true, answered: true, last4: "4471" }] }).catch((e) => ({ threw: e.message }));
    if (s0.threw || s0.table !== false) fail(`saving call rows before the SQL is run should answer table:false, got ${JSON.stringify(s0).slice(0, 120)}`);
    const v0 = await LD.readView(miss.supa, { clientId: cid, now: new Date("2026-11-11T19:30:00Z"), PROVIDERS: P ? P.PROVIDERS : {} }).catch((e) => ({ threw: e.message }));
    if (v0.threw || !v0.view || v0.view.table !== false) fail(`reading before the SQL is run should give view.table:false, got ${JSON.stringify(v0).slice(0, 160)}`);
    const db = fakeSupa({ tables: { client_leads: [], client_ga4_daily: [
      { client_id: cid, kind: "event", date: "2026-11-08", page: "/contact", event_name: "form_submit", events: 2 },
      { client_id: cid, kind: "event", date: "2026-11-08", page: "/contact", event_name: "generate_lead", events: 2 },
      { client_id: cid, kind: "event", date: "2026-11-08", page: "/contact", event_name: "form_start", events: 9 },
      { client_id: cid, kind: "event", date: "2026-11-09", page: "/quote", event_name: "generate_lead", events: 1 }] } });
    const fz = await LD.syncForms(db.supa, { clientId: cid, month: "2026-11-01" }).catch((e) => ({ threw: e.message }));
    if (fz.threw || fz.forms !== 3) fail(`one form that fired form_submit and generate_lead must be one lead (and a form_start none): expected 3 form rows, got ${fz.threw || fz.forms}`);
    const sc = await LD.saveCalls(db.supa, { clientId: cid, month: "2026-11-01", rows: [
      { kind: "call", lead_key: "callrail:A", counted: true, answered: true, last4: "+1 (310) 555-0123", customer_phone_number: "+13105550123", phone: "+13105550123" },
      { kind: "call", lead_key: "callrail:B", counted: false, answered: true, seconds: 8, last4: "9876" },
      { kind: "call", lead_key: "callrail:C", counted: false, answered: false, last4: "0147" }] });
    const posted = db.writes.filter((w) => w.table === "client_leads" && w.method === "POST" && w.body && w.body.some((r) => r.kind === "call")).flatMap((w) => w.body);
    if (sc.saved !== 2 || posted.length !== 2) fail(`a counted call and a missed call are leads, a short answered call is not: expected 2 saved, got ${sc.saved}`);
    const pb = JSON.stringify(posted);
    if (FULL.some((n) => pb.includes(n)) || /phone/i.test(pb) || posted.some((r) => r.last4 != null && !/^\d{4}$/.test(r.last4))) fail("saveCalls sends more of a caller's number than the last 4 digits");
    const mk1 = await LD.mark(db.supa, { clientId: cid, leadId: "1", mark: "maybe" });
    if (mk1.ok !== false) fail("a mark that isn't Booked, Not booked or Not a lead was accepted");
  }

  // 7 · the endpoint before the SQL is run
  try {
    const PL = req("./netlify/functions/portal-leads.js"), cid = "11111111-1111-1111-1111-111111111111";
    const miss = fakeSupa({ missing: ["client_leads"], tables: { clients: [{ id: cid, business_name: "Example", kpi_config: {}, primary_market: "Austin, TX" }] } });
    const r = await PL.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: cid, action: "read" }) }, { supa: miss.supa, auth: async () => ({ email: "x" }), now: () => new Date("2026-11-11T19:30:00Z") });
    const j = JSON.parse(r.body || "{}");
    if (r.statusCode !== 200 || !j.ok || !j.view || j.view.table !== false) fail(`portal-leads before the SQL is run should answer 200 with view.table:false, got ${r.statusCode} ${String(r.body).slice(0, 120)}`);
  } catch (e) { fail(`portal-leads.js can't be run with a fake database (${String(e.message).slice(0, 120)})`); }

  // 9 · wired
  const cts = rd("netlify/functions/call-tracking-sync.js") || "";
  if (!/require\("\.\/_leads"\)\.saveCalls\(supa, \{ clientId, month, rows: res\.rows/.test(cts)) fail("call-tracking-sync doesn't save the lead rows from the read it makes");
  if (!/calls_read: \{ ok: false/.test(cts)) fail("call-tracking-sync doesn't note a failed read (calls_read), so a miss would look like silence");
  const mdr = rd("netlify/functions/metrics-daily-refresh.js") || "";
  if (!/LD\.syncForms\(/.test(mdr)) fail("the nightly job doesn't sync the form leads");
  if (!/leads_stuck: leadResults\.stuck/.test(mdr) || !/Number\(b\.leads_stuck\)/.test(rd("netlify/functions/_job-manifest.js") || "")) fail("three failed call reads in a row don't reach System health (leads_stuck)");
  const mc = rd("netlify/functions/_monthly-close.js") || "";
  if (!/d\.freezeLeads\(clientId, month\)/.test(mc) || mc.indexOf("d.freezeLeads(clientId, month)") > mc.indexOf("const m = await composeLetter({ clientId, month, frozen, tasks, deps: d, letter: (rec.data && rec.data.quarter_letter) || null, leads })")) fail("the report build doesn't freeze the lead totals before it composes the letter");
  if (!/reportSection\(x\.leads/.test(rd("netlify/functions/_monthly-report-email.js") || "")) fail("the monthly report letter doesn't print the Leads and booked jobs section");
  const portal = rd("portal/portal.js") || "", admin = rd("admin/admin.js") || "";
  if (!/import "\/shared\/leads\.js\?v=\d{8}[a-z]+";/.test(portal)) fail("portal.js doesn't import shared/leads.js (with a cache-buster)");
  if (!/data-lds-dash=/.test(portal) || !/data-lds-mark-host=/.test(portal) || !/\/\.netlify\/functions\/portal-leads/.test(portal)) fail("the portal draws no Leads host on the Dashboard / Ongoing work, or never reads portal-leads");
  if (!/import "\/shared\/leads\.js\?v=\d{8}[a-z]+";/.test(admin) || !/id === "m2\.report\.generate" \? clsBuildCardHtml\(\) \+ ldsAdminCardHtml\(\)/.test(admin)) fail("the admin Monthly doesn't draw the Leads card with the report build");
  return F;
}

// LIVE (the working tree only, never in a mutation copy): this month's saved lead rows equal the provider's own count from the same read
async function live() {
  if (process.env.SCRAPER_COPY_DIR) return;   // a mutation run: files only, and never parallel production reads
  const envFile = path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".env");
  try { for (const line of fs.readFileSync(decodeURIComponent(envFile), "utf8").split("\n")) { const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim()); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* no .env */ }
  const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) { console.log("  live: no database settings here; the files were checked, the live comparison was not"); return; }
  const H = { apikey: K, Authorization: `Bearer ${K}` }, month = `${new Date().toISOString().slice(0, 7)}-01`;
  let r = await REAL_FETCH(`${U}/rest/v1/client_leads?select=id&limit=1`, { headers: H });
  if (!r.ok) { const t = await r.text(); if (/PGRST205|does not exist|schema cache/.test(t) || r.status === 404) { console.log("  live: client_leads isn't set up yet (docs/supabase/CLIENT_LEADS_2026-11-11.sql not run); nothing to compare"); return; } console.error(`⚠️  INDETERMINATE: client_leads answered ${r.status}`); process.exit(2); }
  r = await REAL_FETCH(`${U}/rest/v1/client_monthly_records?reporting_month=eq.${month}&data->calls->>leads_table=eq.true&select=client_id,data->calls`, { headers: H });
  if (!r.ok) { console.error(`⚠️  INDETERMINATE: the month's records answered ${r.status}`); process.exit(2); }
  const recs = await r.json(), bad = [];
  for (const x of recs) {
    const c = x.calls || {}; if (c.lead_rows_error || c.connected == null) continue;
    const q = await REAL_FETCH(`${U}/rest/v1/client_leads?client_id=eq.${x.client_id}&month=eq.${month}&kind=eq.call&counted=eq.true&select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    const n = Number((q.headers.get("content-range") || "").split("/")[1]);
    if (!Number.isFinite(n)) { console.error("⚠️  INDETERMINATE: couldn't count a client's lead rows"); process.exit(2); }
    if (n !== Number(c.connected)) bad.push(`client ${String(x.client_id).slice(0, 8)}: ${n} counted lead rows, the provider counted ${c.connected} (read ${c.at || "?"})`);
  }
  console.log(`  live: ${recs.length} client(s) with lead rows this month compared to the provider's count`);
  if (bad.length) { console.log(`✗ check-leads-match-the-provider (live): ${bad.length} problem(s)\n${bad.map((x) => "  · " + x).join("\n")}`); process.exit(1); }
}

try {
  if (!process.argv.slice(2).some((a) => a.startsWith("--against="))) await live();
  await runGate({ name: "check-leads-match-the-provider", beforeRev: BEFORE, checkTree, minBefore: 8 });
} catch (e) { console.error(`⚠️  INDETERMINATE: the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); process.exit(2); }
