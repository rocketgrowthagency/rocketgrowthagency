// portal-boot-harness.mjs — BOOT THE REAL CLIENT PORTAL in a headless Chrome and read what it DRAWS. Nothing leaves the laptop:
//   · the website folder is served from localhost (any file can be swapped for another with `overrides`, e.g. an older portal.js)
//   · portal.js's own read-only look hook (window.__rgaClientPreview) hands it OUR fake database client, so the real boot, the real
//     loaders and the real renderers run on data we choose (including `clients.portal_mode`)
//   · every /.netlify/functions/* call is answered by us (and recorded); every other outside request is refused
// A gate built on this DRAWS the page. It does not grep it. → feedback_the_harness_i_wrote_to_check_my_work_can_lie: the fake only
// answers; it decides nothing the product decides (the product still chooses the mode, the rows, the order, the words).
// exit semantics are the caller's: this module only throws `HarnessUnavailable` (→ the gate exits 2, never 0).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export class HarnessUnavailable extends Error {}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

export const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
export const CID = "11111111-1111-4111-8111-111111111111";

function serve(root, overrides) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = overrides[u] || path.join(root, u.endsWith("/") ? `${u}index.html` : u);
      if (!overrides[u] && !file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(buf);
      });
    });
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

/** The fake database client, as a string the page runs. Tables answer with their rows (filtered by .eq/.in); writes are recorded. */
const FAKE_CLIENT = `(() => {
  const F = window.__FAKE, calls = (window.__DB_CALLS = []);
  const rowsOf = (t) => (F.tables[t] || []).map((r) => ({ ...r }));
  const query = (table) => {
    const flt = []; let op = "select", payload = null, cols = "*";
    const run = () => {
      let rows = rowsOf(table);
      for (const [k, c, v] of flt) rows = rows.filter((r) => c === "eq" ? r[k] === v : c === "in" ? (v || []).includes(r[k]) : true);
      if (op !== "select") { calls.push({ table, op, payload }); return { data: payload ? [payload] : [], error: null }; }
      const miss = ((F.missing || {})[table] || []).find((c) => new RegExp("\\b" + c + "\\b").test(cols));
      if (miss) return { data: null, error: { message: "column " + table + "." + miss + " does not exist" } };
      return { data: rows, error: null, count: rows.length };
    };
    const chain = new Proxy({}, { get(_, prop) {
      if (prop === "then") return (res, rej) => Promise.resolve(run()).then(res, rej);
      if (prop === "single" || prop === "maybeSingle") return () => { const r = run(); return Promise.resolve({ data: (r.data || [])[0] || null, error: r.error }); };
      return (...a) => {
        if (prop === "select") cols = String(a[0] || "*");
        if (prop === "eq") flt.push([a[0], "eq", a[1]]); else if (prop === "in") flt.push([a[0], "in", a[1]]);
        else if (prop === "insert" || prop === "update" || prop === "upsert" || prop === "delete") { op = prop; payload = a[0] || null; }
        return chain;
      };
    } });
    return chain;
  };
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  const token = "h." + b64({ sub: "u1", session_id: "s1", email: "client@example.test" }) + ".s";
  const session = { access_token: token, refresh_token: "r", user: { id: "u1", email: "client@example.test" } };
  return {
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}), getUser: async () => ({ data: { user: session.user } }) },
    from: (t) => query(t),
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})()`;

/**
 * Boot the portal for one scenario.
 * scenario = { mode: "managed" | "self_serve" | null | "column_missing", tasks: { stepId: task }, now: { stepId: portal-gbp-profile `now` }, verify: {...},
 *              tables: { extra table rows }, fns: { name: (body, url) => json }, viewport }
 * overrides = { "/portal/portal.js": "/abs/path/to/another/portal.js" } — e.g. the portal as it was before a change.
 */
export async function bootPortal(scenario = {}, overrides = {}, siteRoot = SITE) {
  let puppeteer;
  try { ({ default: puppeteer } = await import("puppeteer")); } catch { throw new HarnessUnavailable("puppeteer is missing"); }
  const srv = await serve(siteRoot, overrides);
  const base = `http://127.0.0.1:${srv.address().port}`;
  let browser;
  try { browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] }); } catch (e) { srv.close(); throw new HarnessUnavailable(`no browser: ${e.message}`); }
  const page = await browser.newPage();
  await page.setViewport({ width: scenario.viewport || 1100, height: 1400 });
  const fnCalls = [], errs = [], logs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`); });
  const playbookTasks = scenario.tasks || {};
  const fake = {
    tables: {
      clients: [{ id: CID, business_name: "Acme Plumbing", portal_mode: scenario.mode === "column_missing" ? undefined : scenario.mode ?? null, workspace_id: "w1", client_portal_stage: scenario.stage || "stage_3_foundation", website_url: scenario.website === undefined ? "https://acmeplumbing.test" : scenario.website, primary_contact_name: "Pat Smith", primary_contact_email: "client@example.test", status: "active" }],
      client_onboarding_records: [{ id: "r1", workspace_id: "w1", client_id: CID, data: { tasks: playbookTasks, ...(scenario.onboarding || {}) } }],
      client_google_oauth: scenario.oauth === false ? [] : [{ client_id: CID, gbp_account_id: "accounts/1", ga4_property_id: "p1", gsc_site_url: "https://acmeplumbing.test/", connected_at: "2026-11-01T12:00:00Z" }],
      client_photos: [], client_customer_lists: [], client_invoices: [], client_subscriptions: [], client_portal_content: [], client_keyword_rankings: [], client_gbp_snapshots: [], client_monthly_records: [],
      client_portal_access: [], ...(scenario.tables || {}),
    },
    // a column that doesn't exist fails ONLY the read that names it, like the real database before the SQL file is run
    missing: scenario.mode === "column_missing" ? { clients: ["portal_mode"] } : {},
  };
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    const url = r.url();
    if (url.startsWith(base)) {
      const m = /^\/\.netlify\/functions\/([\w-]+)/.exec(new URL(url).pathname);
      if (!m) return r.continue();
      let body = null; try { body = r.postData() ? JSON.parse(r.postData()) : null; } catch { body = null; }
      const name = m[1];
      fnCalls.push({ name, body, method: r.method() });
      const h = (scenario.fns || {})[name];
      let out;
      if (h) out = await h(body, url, { tasks: playbookTasks, fake });
      else if (name === "admin-config") out = { ok: true, supabaseUrl: "https://fake.supabase.test", supabaseAnonKey: "anon" };
      else if (name === "portal-step-waits") out = { ok: true, rga: [] };
      else if (name === "portal-open-moves") out = { ok: true, moves: [], month1: { done: 0, total: 0 } };
      else if (name === "portal-deliverables") out = { ok: true, deliverables: [], actions: [], items: [] };
      else if (name === "portal-thread") out = { ok: true, messages: [], threads: [] };
      else if (name === "portal-gbp-profile") out = body && scenario.now && scenario.now[body.step_id] !== undefined ? (scenario.now[body.step_id] === null ? { ok: false, error: "Google did not answer" } : { ok: true, now: scenario.now[body.step_id] }) : { ok: false, error: "no stub" };
      else if (name === "portal-gbp-verify") out = scenario.verify || { ok: true, facts: { verified: true }, verify: {} };
      else out = { ok: false, error: `no stub for ${name}` };
      await new Promise((res) => setTimeout(res, scenario.latency ?? 60));   // a fixed answer time, so what draws first does not depend on which reply the machine delivers first
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    }
    if (url.startsWith("data:") || url === "about:blank") return r.continue();
    return r.abort();
  });
  await page.evaluateOnNewDocument((fakeJson, clientSrc, cid) => {
    window.__FAKE = JSON.parse(fakeJson);
    window.__rgaClientPreview = { clientId: cid, client: () => eval(clientSrc), fail: (why) => { window.__PREVIEW_FAIL = why; } };
  }, JSON.stringify(fake), FAKE_CLIENT, CID);
  // scenario.clock (ISO): the page's clock starts there and runs on (Date and Date.now only). A gate that reads a due day or a quarter draws the
  // same page every day; without it the page runs on the real clock, as before.
  if (scenario.clock) await page.evaluateOnNewDocument((t0) => { const D = Date, off = t0 - D.now(); class FD extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } } window.Date = FD; }, Date.parse(scenario.clock));
  // 🔑 a loaded machine (several gate runs at once) can take longer than puppeteer's 30 s default to reach DOMContentLoaded; and a boot that
  // fails must not leave its Chrome and server behind (11-4: both were seen while three builds ran their gates together)
  try { await page.goto(`${base}/portal/`, { waitUntil: "domcontentloaded", timeout: 120000 }); }
  catch (e) { await browser.close().catch(() => {}); srv.close(); throw new HarnessUnavailable(`the portal didn't load: ${String(e.message || e).slice(0, 120)}`); }
  const api = {
    page, errs, logs, fnCalls, base,
    /** wait until the Setup list has drawn rows */
    async ready(selector = ".pm-step-row", ms = 15000) { await page.waitForSelector(selector, { timeout: ms }); await new Promise((r) => setTimeout(r, 900)); },
    async close() { await browser.close().catch(() => {}); srv.close(); },
  };
  return api;
}
