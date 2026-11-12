#!/usr/bin/env node
// check-contracts-cannot-be-deleted.mjs — A SIGNED AGREEMENT AND A PAID INVOICE ARE KEPT FOR GOOD; "DELETE CLIENT" IS ARCHIVE
// (master data audit G12 + G16, approved by Chris 11-11).
//
// 🔴 WHY. client_contracts and client_invoices hung off clients with ON DELETE CASCADE, and the client delete guard counted only rankings,
// snapshots and months: a new client who had signed could be deleted, and the signature, signer IP, hash and every invoice went with it.
// Staff could issue that DELETE from the browser (clients_internal_delete). And stripe_webhook_events.processed was never written, so
// "received" could not be told from "done", and a failed run's retry was deduped away.
//
// WHAT THIS HOLDS (static + a fake database: nothing is read or written for real)
//   1 the SQL file (website docs/supabase/CONTRACTS_INVOICES_KEPT_2026-11-11.sql): a delete trigger on each table that allows ONLY a
//     voided contract never signed, and an invoice no money touched (upcoming, unpaid, no payment intent) or a test client's; both
//     foreign keys RESTRICT; the client guard counts contracts and invoices; the browser delete policy on clients is dropped
//   2 the code, both repos: nothing deletes a client; the only contract delete is admin.js's voided one (checked first); the only
//     invoice deletes are the cancellation's upcoming ones and the test-client reset
//   3 the Stripe webhook, run with a signed fake event: a finished event is marked processed (with the time), a failed one keeps its
//     error, Stripe's retry of a failed one runs again (claimed once), and a retry of a finished one is still a duplicate
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SCRAPER_COPY_DIR || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const F = [], fail = (m) => F.push(m);
const read = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
const SQL_REL = "docs/supabase/CONTRACTS_INVOICES_KEPT_2026-11-11.sql";

let SQL;
try { SQL = read(SQL_REL).replace(/--[^\n]*/g, ""); } catch (e) { console.error(`⚠️  INDETERMINATE: can't read ${SQL_REL} (${e.message})`); process.exit(2); }

// ═══ 1 · the SQL file ═══
const fnBody = (name) => (new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i").exec(SQL) || [])[1] || "";
const c = fnBody("client_contracts_no_delete"), inv = fnBody("client_invoices_no_delete");
if (!c) fail("1: no delete trigger function for client_contracts");
if (!/^\s*if old\.status = 'voided' and old\.signed_at is null then\s*return old;/m.test(c) || (c.match(/return old;/g) || []).length !== 1) fail("1: a contract delete must be allowed ONLY for a voided agreement that was never signed");
if (!/raise exception/.test(c)) fail("1: every other contract delete must raise");
if (!inv) fail("1: no delete trigger function for client_invoices");
if (!/if old\.status = 'upcoming' and old\.paid_at is null and old\.stripe_payment_intent_id is null then\s*return old;/.test(inv)) fail("1: an invoice delete must be allowed only when no money touched it (upcoming, unpaid, no payment intent)");
if (!/c\.source like 'test:%'/.test(inv) || (inv.match(/return old;/g) || []).length !== 2) fail("1: the only other invoice delete allowed is a test client's");
if (!/raise exception/.test(inv)) fail("1: every other invoice delete must raise");
for (const [t, f] of [["client_contracts", "client_contracts_no_delete"], ["client_invoices", "client_invoices_no_delete"]]) {
  if (!new RegExp(`create trigger ${f}_trg before delete on public\\.${t}\\s+for each row execute function public\\.${f}\\(\\);`).test(SQL)) fail(`1: the delete trigger is not attached to ${t}`);
  if (!new RegExp(`alter table public\\.${t} add constraint ${t}_client_id_fkey\\s+foreign key \\(client_id\\) references public\\.clients\\(id\\) on delete restrict;`).test(SQL)) fail(`1: ${t}'s foreign key from clients is not ON DELETE RESTRICT`);
  if (!new RegExp(`alter table public\\.${t} drop constraint if exists ${t}_client_id_fkey;`).test(SQL)) fail(`1: ${t}'s CASCADE foreign key is not dropped first`);
}
if (/on delete cascade/i.test(SQL)) fail("1: the file still makes a CASCADE");
const guard = (/create or replace function public\.prevent_delete_client_with_data\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(SQL) || [])[1] || "";
for (const t of ["client_keyword_rankings", "brain_rank_snapshots", "client_monthly_records", "client_contracts", "client_invoices"]) if (!new RegExp(`select count\\(\\*\\) into n_\\w+\\s+from public\\.${t}\\s+where client_id = old\\.id;`).test(guard)) fail(`1: the client delete guard does not count ${t}`);
if (!/total := n_rank \+ n_snap \+ n_month \+ n_contract \+ n_invoice;/.test(guard)) fail("1: the guard's total leaves a count out");
if (!/^drop policy if exists clients_internal_delete on public\.clients;/m.test(SQL)) fail("1: staff can still delete a client from the browser (clients_internal_delete)");
if (/create policy[^;]*on public\.clients[^;]*for delete/i.test(SQL)) fail("1: a delete policy on clients is created");

// ═══ 2 · the code, both repos ═══
const skip = /^(node_modules|\.git|\.claude|\.netlify|v|dist|coverage|reports|docs|output|memory|__scraper|mutations)$/;
const files = [];
const walk = (root, rel, tag) => { let es; try { es = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of es) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) { if (!skip.test(e.name)) walk(root, r, tag); } else if (/\.(js|mjs|cjs|html)$/.test(e.name)) files.push({ tag, rel: r, abs: path.join(root, r) }); } };
walk(SITE, "", "website"); walk(SCRAPER, "", "scraper");
if (files.filter((f) => f.tag === "website").length < 200) { console.error("⚠️  INDETERMINATE: the website code was not found"); process.exit(2); }
const deletes = (src, table) => {
  const out = [];
  for (const m of src.matchAll(new RegExp(`/${table}\\?[^\`'"]*[\`'"][^;]{0,240}?method:\\s*["']DELETE["']`, "g"))) out.push(m.index);
  for (const m of src.matchAll(new RegExp(`\\.from\\(["']${table}["']\\)\\s*\\.delete\\(`, "g"))) out.push(m.index);
  return out;
};
const lineOf = (src, i) => src.slice(0, i).split("\n").length;
const self = path.basename(fileURLToPath(import.meta.url));
const seen = { contract: 0, cancel: 0, reset: 0 };   // the deletes known to exist (admin.js, the cancellation, the reset) must be FOUND, or the scan is blind
for (const f of files) {
  if (f.tag === "scraper" && /check-|run-mutations/.test(f.rel) && f.rel.endsWith(self)) continue;
  if (f.tag === "scraper" && /^scripts\/check-/.test(f.rel)) continue;   // gates build their own fakes
  let src; try { src = fs.readFileSync(f.abs, "utf8"); } catch { continue; }
  for (const i of deletes(src, "clients")) fail(`2: ${f.tag} ${f.rel}:${lineOf(src, i)} deletes a client: archive it instead (clients.archived_at)`);
  for (const i of deletes(src, "client_contracts")) {
    const ok = f.tag === "website" && f.rel === "admin/admin.js" && /if \(c\.status !== "voided"\) \{\s*rgaAlert\("Only voided contracts can be deleted\. Void it first\."(?:, \{[^}]*\})?\);\s*return;\s*\}/.test(src.slice(Math.max(0, i - 900), i));
    if (f.tag === "website" && f.rel === "admin/admin.js") seen.contract++;
    if (!ok) fail(`2: ${f.tag} ${f.rel}:${lineOf(src, i)} deletes a contract (only admin.js's voided-contract delete, checked first, may)`);
  }
  for (const i of deletes(src, "client_invoices")) {
    const at = src.slice(i, i + 200);
    const cancel = f.tag === "website" && f.rel === "netlify/functions/admin-record-cancellation.js" && /^\/client_invoices\?id=eq\.\$\{inv\.id\}&status=eq\.upcoming`/.test(at);
    const reset = f.tag === "website" && f.rel === "scripts/reset-test-client.mjs" && /for \(const clientId of TEST_IDS\)/.test(src.slice(0, i));
    if (f.tag === "website" && f.rel === "netlify/functions/admin-record-cancellation.js") seen.cancel++;
    if (f.tag === "website" && f.rel === "scripts/reset-test-client.mjs") seen.reset++;
    const twin = f.tag === "website" && f.rel === "netlify/functions/billing-daily-check.js" && /^\/client_invoices\?id=eq\.\$\{t\.id\}&status=eq\.upcoming`/.test(at);   // the duplicate of the next UPCOMING invoice a race left (oldest kept)
    if (!cancel && !reset && !twin) fail(`2: ${f.tag} ${f.rel}:${lineOf(src, i)} deletes an invoice (only the cancellation's upcoming invoices and the test-client reset may)`);
  }
}
if (!seen.contract || !seen.cancel || !seen.reset) { console.error(`⚠️  INDETERMINATE: the delete scan did not find the allowed deletes it knows exist (${JSON.stringify(seen)}): the pattern is blind`); process.exit(2); }

// ═══ 3 · the Stripe webhook's ledger ═══
try {
  const SECRET = "whsec_gate_only";
  Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "k", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: "sk_test_gate" });
  delete process.env.STRIPE_WEBHOOK_SECRET_TEST;
  const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
  const H = req("./stripe-webhook.js");
  const events = new Map(), log = { patches: [], subsFail: false };
  const res = (status, body) => new Response(body == null ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = async (u, init = {}) => {
    const url = new URL(String(u)), m = (init.method || "GET").toUpperCase(), p = url.pathname.replace("/rest/v1/", "");
    if (url.origin !== "https://db.test") return res(200, {});
    if (p === "stripe_webhook_events") {
      const id = (url.searchParams.get("stripe_event_id") || "").replace(/^eq\./, "");
      if (m === "POST") { const b = JSON.parse(init.body); if (events.has(b.stripe_event_id)) return res(409, { code: "23505" }); events.set(b.stripe_event_id, { ...b, processed: false, processed_at: null, processing_error: null }); return res(201, null); }
      if (m === "PATCH") {
        const row = events.get(id), body = JSON.parse(init.body); log.patches.push({ id, q: url.search, body });
        if (!row) return res(200, []);
        if (url.searchParams.get("processed") === "eq.false" && row.processed !== false) return res(200, []);
        if (url.searchParams.get("processing_error") === "not.is.null" && row.processing_error == null) return res(200, []);
        Object.assign(row, body); return res(200, /representation/.test((init.headers || {}).Prefer || "") ? [{ id: 1 }] : null);
      }
      if (m === "GET") { const row = events.get(id); return res(200, row ? [row] : []); }
    }
    if (p === "client_subscriptions") return log.subsFail ? res(500, { message: "boom" }) : res(200, []);
    return res(200, []);
  };
  const deliver = async (evt) => {
    const payload = JSON.stringify(evt), t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
    const r = await H.handler({ httpMethod: "POST", headers: { "stripe-signature": `t=${t},v1=${v1}` }, body: payload });
    return { status: r.statusCode, body: JSON.parse(r.body || "{}") };
  };
  // a: an event handled to the end is marked processed, with the time
  const a = await deliver({ id: "evt_a", type: "gate.unhandled", livemode: false, data: { object: {} } });
  const ea = events.get("evt_a");
  if (a.status !== 200 || !ea || ea.processed !== true || !ea.processed_at || ea.processing_error !== null) fail(`3a: a finished event is not marked processed (${a.status} ${JSON.stringify(ea)})`);
  // b: a run that throws keeps its error and is not processed
  log.subsFail = true;
  const b = await deliver({ id: "evt_b", type: "customer.subscription.deleted", livemode: false, data: { object: { id: "sub_1" } } });
  const eb = events.get("evt_b");
  if (b.status !== 500 || !eb || eb.processed !== false || !eb.processing_error) fail(`3b: a failed run must keep its error and stay unprocessed (${b.status} ${JSON.stringify(eb)})`);
  // c: Stripe's retry of the failed event runs again and finishes
  log.subsFail = false;
  const c2 = await deliver({ id: "evt_b", type: "customer.subscription.deleted", livemode: false, data: { object: { id: "sub_1" } } });
  if (c2.status !== 200 || c2.body.deduped || events.get("evt_b").processed !== true) fail(`3c: Stripe's retry of a failed event was not run again (${c2.status} ${JSON.stringify(c2.body)})`);
  // d: a retry of a finished event is a duplicate (nothing runs twice)
  const before = log.patches.length;
  const d = await deliver({ id: "evt_a", type: "gate.unhandled", livemode: false, data: { object: {} } });
  if (d.status !== 200 || !d.body.deduped) fail(`3d: a redelivered finished event must be deduped (${JSON.stringify(d.body)})`);
  if (log.patches.slice(before).some((x) => x.body.processed !== undefined)) fail("3d: a duplicate delivery rewrote the finished event");
  // e: the ledger write never fails the payment path
  if (!/async function markEvent\(evt, ledger, error\) \{[\s\S]{0,900}?\} catch \(e\) \{[\s\S]{0,300}?console\.warn/.test(read("netlify/functions/stripe-webhook.js"))) fail("3e: marking the event must never throw (a ledger write may not turn a payment into a 500)");
} catch (e) { console.error(`⚠️  INDETERMINATE (3): ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }

if (F.length) { console.error(`❌ a contract, an invoice or a client can be deleted, or a Stripe event isn't finished (${F.length}):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log(`✅ contracts and invoices are kept: the SQL refuses every delete but a voided unsigned contract and an invoice no money touched (or a test client's), both foreign keys RESTRICT, the client guard counts them and staff can't delete a client; no code in either repo (${files.length} files) deletes a client, and the only contract and invoice deletes are the allowed ones; a Stripe event is marked processed when it finishes, keeps its error when it fails, and a failed one's retry runs again once`);
