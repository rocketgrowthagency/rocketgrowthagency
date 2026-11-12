// billing-world.mjs — a FAKE WORLD for the billing gates (master audit #9, 11-11): a fake database that answers PostgREST queries,
// a fake Stripe, a fake Gmail and Google token, and the site's own functions run IN-PROCESS. Any address it doesn't know THROWS,
// so nothing can charge, refund or email for real. Used by check-a-paid-invoice-always-settles and check-the-pause-follows-the-contract.
// 🔑 The filters are PostgREST's own grammar (eq, neq, in, is, gte, lte, gt, lt, cs, payload->>key, order, limit), so the real
// queries run unchanged. A query shape this fake doesn't understand throws rather than matching everything.
import crypto from "node:crypto";
import { createRequire } from "node:module";

export const CID = "11111111-1111-4111-8111-111111111111";
export const WS = "22222222-2222-4222-8222-222222222222";
export const SECRET = "internal-test-secret";
export const WHSEC = "whsec_test_world";

const TABLES = ["clients", "client_invoices", "client_subscriptions", "client_contracts", "client_activity", "client_onboarding_records",
  "stripe_webhook_events", "rga_google_credentials", "client_portal_access", "client_monthly_records", "job_checkins", "client_google_oauth"];

const res = (status, body) => status === 204 ? new Response(null, { status: 204 })
  : new Response(body === undefined || body === null ? "" : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function getPath(r, key) {
  const m = /^([a-z_]+)->>([a-z_]+)$/.exec(key);
  if (m) { const o = r[m[1]]; return o && typeof o === "object" && o[m[2]] != null ? String(o[m[2]]) : null; }
  return r[key];
}
// deep partial "contains" for jsonb cs.
function contains(hay, needle) {
  if (Array.isArray(needle)) return Array.isArray(hay) && needle.every((n) => hay.some((h) => contains(h, n)));
  if (needle && typeof needle === "object") return !!hay && typeof hay === "object" && Object.entries(needle).every(([k, v]) => contains(hay[k], v));
  return hay === needle;
}
function cond(r, key, v) {
  const val = getPath(r, key);
  if (v.startsWith("eq.")) return val != null && String(val) === v.slice(3);
  if (v.startsWith("neq.")) return val == null || String(val) !== v.slice(4);
  if (v.startsWith("in.(")) return v.slice(4, -1).split(",").includes(String(val));
  if (v === "is.null") return val == null;
  if (v === "not.is.null") return val != null;
  if (v === "is.true") return val === true;
  if (v.startsWith("gte.")) return val != null && String(val) >= v.slice(4);
  if (v.startsWith("lte.")) return val != null && String(val) <= v.slice(4);
  if (v.startsWith("gt.")) return val != null && String(val) > v.slice(3);
  if (v.startsWith("lt.")) return val != null && String(val) < v.slice(3);
  if (v.startsWith("cs.")) return contains(val, JSON.parse(v.slice(3)));
  if (v.startsWith("like.")) { const re = new RegExp(`^${v.slice(5).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`); return val != null && re.test(String(val)); }
  throw new Error(`billing-world: a filter this fake can't read: ${key}=${v}`);
}

export function makeWorld(SITE) {
  const W = { db: {}, gmail: [], stripe: [], fns: [], seq: 0, clock: Date.now(),
    stripeHandler: null,                      // (method, path, params, headers) → [status, body]
    fnHandler: {},                            // name → async (body, headers) → [status, body]; unset = run the real function
    failNext: [],                             // [{ table, method }] the next matching write answers 500
  };
  W.reset = () => {
    for (const t of TABLES) W.db[t] = [];
    W.gmail = []; W.stripe = []; W.fns = []; W.failNext = []; W.fnHandler = {}; W.stripeHandler = null;
    W.db.rga_google_credentials.push({ workspace_id: WS, refresh_token: "rt", google_email: "hello@rocketgrowthagency.com", scopes: "gmail.send", sends_date: null, sends_today: 0, sends_total: 0 });
  };
  const stamp = () => new Date(W.clock + (W.seq += 1000)).toISOString();
  const realFetch = globalThis.fetch;
  W.restore = () => { globalThis.fetch = realFetch; };
  const req = createRequire(`${SITE}/netlify/functions/x.js`);
  W.require = (rel) => req(`${SITE}/${rel}`);

  globalThis.fetch = async (input, init = {}) => {
    const u = String(input), method = String(init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (u.startsWith("https://oauth2.googleapis.com/token")) return res(200, { access_token: "tok", expires_in: 3600 });
    if (u.startsWith("https://gmail.googleapis.com/")) {
      const raw = Buffer.from(JSON.parse(init.body).raw, "base64url").toString("utf8");
      const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n(?=--)/g)].map((x) => Buffer.from(x[1].replace(/\s/g, ""), "base64").toString("utf8"));
      W.gmail.push({ raw, text: `${raw.split("\r\n\r\n")[0]}\n\n${parts[0] || raw.split("\r\n\r\n").slice(1).join("\n")}` });
      return res(200, { id: `g${W.gmail.length}`, threadId: "t" });
    }
    if (u.startsWith("https://api.stripe.com/")) {
      const url = new URL(u), params = new URLSearchParams(method === "GET" ? url.search : String(init.body || ""));
      W.stripe.push({ method, path: url.pathname, params, headers });
      if (!W.stripeHandler) return res(500, { error: { message: "the world has no Stripe for this case" } });
      const [status, body] = await W.stripeHandler(method, url.pathname, params, headers);
      return res(status, body);
    }
    const fn = /^https:\/\/site\.test\/\.netlify\/functions\/([a-z0-9-]+)/.exec(u);
    if (fn) {
      const name = fn[1], body = init.body ? JSON.parse(init.body) : {};
      W.fns.push({ name, body, headers });
      if (W.fnHandler[name]) { const [status, b] = await W.fnHandler[name](body, headers); return res(status, b); }
      if (name === "notify-client-stage") {
        const H = W.require("netlify/functions/notify-client-stage.js");
        const out = await H.handler({ httpMethod: "POST", headers, body: init.body });
        return res(out.statusCode, out.body);
      }
      return res(200, { ok: true });
    }
    if (u.startsWith("https://supa.test/auth/v1/user")) return res(200, { id: "u1", email: "owner@acme.test" });
    const m = /^https:\/\/supa\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/.exec(u);
    if (!m) throw new Error(`billing-world has no ${u}: nothing leaves this machine`);
    const [, table, q = ""] = m;
    const rows = W.db[table];
    if (!rows) return res(404, { message: `relation ${table} does not exist`, code: "PGRST205" });
    const fi = W.failNext.findIndex((f) => f.table === table && f.method === method);
    if (fi >= 0) { W.failNext.splice(fi, 1); return res(500, { message: "the world failed this write on purpose" }); }
    const params = new URLSearchParams(q);
    let order = null, limit = null;
    const filters = [];
    for (const [k, v] of params.entries()) {
      if (k === "select") continue;
      if (k === "order") { order = v; continue; }
      if (k === "limit") { limit = Number(v); continue; }
      filters.push([k, v]);
    }
    const match = (r) => filters.every(([k, v]) => cond(r, k, v));
    if (method === "GET") {
      let out = rows.filter(match);
      if (order) { const [col, dir] = order.split("."); out = out.slice().sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (dir === "desc" ? -1 : 1)); }
      if (limit != null) out = out.slice(0, limit);
      return res(200, JSON.parse(JSON.stringify(out)));
    }
    if (method === "POST") {
      const body = JSON.parse(init.body);
      const list = Array.isArray(body) ? body : [body];
      const made = [];
      for (const row of list) {
        if (table === "stripe_webhook_events" && rows.some((r) => r.stripe_event_id === row.stripe_event_id)) return res(409, { message: "duplicate key", code: "23505" });
        const at = stamp();
        const full = { id: row.id || crypto.randomUUID(), created_at: at, ...(table === "stripe_webhook_events" ? { received_at: at, processed: false } : {}), ...(table === "client_activity" ? { occurred_at: at } : {}), ...row };
        rows.push(full); made.push(full);
      }
      return /return=representation/.test(String(headers.prefer || "")) ? res(201, made) : res(201, "");
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init.body), hit = rows.filter(match);
      for (const r of hit) Object.assign(r, patch);
      // PostgREST: 204 unless the caller asked for the rows back
      return /return=representation/.test(String(headers.prefer || "")) ? res(200, hit) : res(204);
    }
    if (method === "DELETE") { W.db[table] = rows.filter((r) => !match(r)); return res(204); }
    return res(405, {});
  };
  W.reset();
  return W;
}

/** The env every billing function reads. Call BEFORE requiring any site module (they read env at load). */
export function setEnv(extra = {}) {
  Object.assign(process.env, { SUPABASE_URL: "https://supa.test", SUPABASE_SERVICE_ROLE_KEY: "svc", SUPABASE_ANON_KEY: "anon", STRIPE_WEBHOOK_SECRET: WHSEC,
    STRIPE_SECRET_KEY: "sk_test_world", STRIPE_SECRET_KEY_TEST: "sk_test_world2", INTERNAL_FN_SECRET: SECRET, URL: "https://site.test",
    GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", RGA_GOOGLE_CLIENT_ID: "x", RGA_GOOGLE_CLIENT_SECRET: "y", RGA_EMAIL_DAILY_CAP: "50", ...extra });
  for (const k of ["RGA_SUPPRESS_CLIENT_EMAIL", "STRIPE_TEST_CLIENT_IDS", "STRIPE_WEBHOOK_SECRET_TEST", "RGA_NOTIFICATION_WEBHOOK_URL", "STEP_REMINDERS_EMAIL"]) delete process.env[k];
}

/** A signed webhook delivery through the real handler. */
export async function deliver(WH, type, object, { id, livemode = false } = {}) {
  const payload = JSON.stringify({ id: id || `evt_${crypto.randomUUID().slice(0, 8)}`, type, livemode, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", WHSEC).update(`${t}.${payload}`).digest("hex");
  return quiet(() => WH.handler({ httpMethod: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: payload }));
}

// re-entrant: two deliveries at once (Promise.all) must not leave the console silenced for the rest of the gate
const KEYS = ["log", "warn", "error"], ORIGINAL = KEYS.map((x) => console[x]);
let quietDepth = 0;
export async function quiet(fn) {
  if (quietDepth++ === 0) KEYS.forEach((x) => { console[x] = () => {}; });
  try { return await fn(); } finally { if (--quietDepth === 0) KEYS.forEach((x, i) => { console[x] = ORIGINAL[i]; }); }
}

/** A client, its signed agreement, its onboarding record and its saved card: the state after the first payment. */
export function seedClient(W, { tier = "commit_3mo", billing = "active", stage = "stage_5_monthly", signedAt = null, heldMonths, card = true, tasks = {} } = {}) {
  W.db.clients.push({ id: CID, workspace_id: WS, business_name: "Acme Plumbing", primary_contact_name: "Pat Lee", primary_contact_email: "pat@acme.test",
    primary_market: "Austin, TX", client_portal_stage: stage, billing_status: billing, source: null, portal_mode: null });
  W.db.client_contracts.push({ id: "k1", client_id: CID, workspace_id: WS, status: "signed", tier, signed_at: signedAt || new Date(Date.now() - 90 * 86400000).toISOString(),
    audit_log: [{ event: "generated_and_sent", at: "2026-01-01T00:00:00Z", plan_code: tier, addons: { founding: tier === "founding" }, ...(heldMonths ? { held_months: heldMonths } : {}) }] });
  W.db.client_onboarding_records.push({ id: "r1", client_id: CID, workspace_id: WS, data: { tasks } });
  if (card) W.db.client_subscriptions.push({ id: "s1", client_id: CID, workspace_id: WS, stripe_customer_id: "cus_1", metadata: { stripe_payment_method_id: "pm_1" } });
  W.db.client_portal_access.push({ id: "pa1", client_id: CID, portal_email: "owner@acme.test", invite_status: "active" });
}
export function addInvoice(W, { num, due, status = "upcoming", amount = 625, paidAt = null, id }) {
  const row = { id: id || `inv-${num}`, workspace_id: WS, client_id: CID, invoice_num: num, amount, currency: "usd", due_date: due, status,
    paid_at: paidAt, stripe_checkout_session_id: null, stripe_checkout_url: null, stripe_payment_intent_id: null, reminder_sent_at: null, created_at: new Date(Date.now() - (100 - num) * 1000).toISOString() };
  W.db.client_invoices.push(row);
  return row;
}
