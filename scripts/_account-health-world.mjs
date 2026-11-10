// _account-health-world.mjs — a FAKE WORLD for Account health (Monthly 28-30) and the added quarter steps (31-33): an in-memory set of month rows and every outside reach as a recording fake.
// Used by check-account-health.mjs and check-the-mature-stage-reads-what-is-measured.mjs. No network, no database, no model, no email, no Google. Runs the SHIPPED code in the website repo
// (APPROVAL_ARCHIVE_SITE_DIR, default the main checkout) against these fakes.
import { createRequire } from "node:module";
import fs from "node:fs";

export const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
export const FNS = `${SITE}/netlify/functions`;
const req = createRequire(`${FNS}/x.js`);
export const load = (rel) => req(rel);
export const H = load("../../shared/monthly-health.js");
export const MS = load("../../shared/monthly-sections.js");
export const MC = load("../../shared/monthly-close.js");
export const MH = load("./_monthly-health.js");
export const MR = load("./_monthly-report-email.js");
export const read = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");

export const CID = "11111111-1111-1111-1111-111111111111";
export const addM = (m, k) => H.addMonths(m, k);
/** a frozen record the way _monthly-close.js freeze writes it (a number Google did not give is null) */
export const frozen = (o) => ({ at: "2026-01-02T08:00:00Z", status: {}, google: { views: o.views ?? null, calls: o.calls ?? null, prev_views: o.pv ?? null, prev_calls: o.pc ?? null }, other: { clicks: o.clicks ?? null, prev_clicks: o.pk ?? null } });
export const row = (month, o = {}) => ({ reporting_month: month, ranking_position: o.rank ?? null, month_status: o.closed ? "closed" : "open", data: { tasks: o.tasks || {}, ...(o.frozen ? { frozen: o.frozen } : {}), ...(o.data || {}) } });

/**
 * opts: { now (ISO), month (the current month), number (its Month number), rows[], client, lastLogin, notice, keyword, tracked (extra searches), trackedList, frontier, numbers: { [month]: n } }
 * -> { d (deps), rows, sent[], notes[], records[], keywords[] }
 */
export function world(opts = {}) {
  const w = { rows: opts.rows || [], sent: [], notes: [], records: [], keywords: [...(opts.trackedExtra || [])], mailFails: false };
  const client = { id: CID, business_name: "Acme Plumbing", primary_contact_name: "Sam Rivera", primary_contact_email: "owner@acme.test", workspace_id: "w1", billing_status: "active", geography_model: "service_area",
    primary_service: "plumbing", secondary_services: ["drain cleaning"], primary_market: "Austin, TX", ...(opts.client || {}) };
  const cur = opts.month, byMonth = (m) => w.rows.find((r) => String(r.reporting_month).slice(0, 10) === m);
  const rec = (m) => { let r = byMonth(m); if (!r) { r = row(m); w.rows.push(r); } return r; };
  w.d = {
    now: () => Date.parse(opts.now || "2026-05-10T12:00:00Z"),
    monthNumber: async (_c, m) => (opts.numbers ? (opts.numbers[m] ?? null) : m === cur ? (opts.number ?? null) : null),
    monthRows: async (_c, m) => w.rows.filter((r) => String(r.reporting_month).slice(0, 10) <= m && String(r.reporting_month).slice(0, 10) >= addM(m, -3)).sort((a, b) => String(b.reporting_month).localeCompare(String(a.reporting_month))),
    client: async () => (opts.noClient ? null : client),
    lastLogin: async () => (opts.lastLogin === undefined ? "2026-05-05T09:00:00Z" : opts.lastLogin),
    notice: async () => opts.notice || null,
    mainKeyword: async () => (opts.keyword === undefined ? "plumber austin" : opts.keyword),
    trackedExtras: async () => w.keywords.length,
    trackedSearches: async () => opts.trackedList || ["plumber austin"],
    frontier: async () => (opts.frontier === undefined ? null : opts.frontier),
    areasNow: async () => (opts.areasNow === undefined ? null : opts.areasNow),
    suggestKeywords: async () => opts.suggest || ["tankless water heater install", "emergency plumber"],
    addTrackedSearch: async (_c, v) => { w.keywords.push(String(v).toLowerCase()); return true; },   // no cap here on purpose: the cap under test is the server's own (the real dep checks it again)
    aiFacts: async () => ({ phone: "+1 512 555 0100", address: "12 Main St, Austin TX" }),
    note: async (_c, cat, text) => { w.notes.push({ cat, text }); },
    record: async (o) => { w.records.push(o); },
    sendMail: async (m) => { if (w.mailFails) return { ok: false, error: "cap" }; w.sent.push(m); return { ok: true, id: "gm1" }; },
    readStepRecord: async (_c, _id, m) => { const r = byMonth(m); return { scope: "month2plus", id: `id-${m}`, client_id: CID, reporting_month: m, data: JSON.parse(JSON.stringify((r && r.data) || { tasks: {} })), tasks: JSON.parse(JSON.stringify(((r && r.data) || {}).tasks || {})), closed: !!(r && r.closed) }; },
    writeStepTasks: async (rc, tasks) => {
      const r = rec(rc.reporting_month);
      if (r.month_status === "closed") { const e = new Error("This month is closed and kept as it was."); e.closedMonth = true; throw e; }   // _step-record.js writeStepTasks refuses a closed month
      r.data = { ...(rc.data || {}), tasks }; return JSON.parse(JSON.stringify(r.data));
    },
  };
  w.task = (m, id) => ((byMonth(m) || {}).data || {}).tasks?.[id] || {};
  w.data = (m) => (byMonth(m) || {}).data || {};
  w.client = client;
  return w;
}

/** a run of whole months, each frozen: values = [{views,calls,clicks,...}] oldest first, ending at `lastMonth` */
export function frozenRows(lastMonth, values, extra = {}) {
  return values.map((v, i) => { const m = addM(lastMonth, i - (values.length - 1)); return row(m, { closed: true, frozen: frozen(v), rank: v.rank ?? null, ...(extra[m] || {}) }); });
}
