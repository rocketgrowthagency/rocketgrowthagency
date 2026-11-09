#!/usr/bin/env node
// check-end-of-service-runs-itself.mjs — END OF SERVICE RUNS ITSELF (approved client_offboarding_v1, the owner 11-8: "no must get done now").
// Against fakes only (no real client, Google, GitHub or storage is touched): each line acts and READS ITS RESULT BACK before it says done;
// anything it can't do is open with the reason (RGA's move); "not applicable" is never the system's word; the Google figures go only after
// the files are ready, and only from the end date; the daily run records one event per line and keeps a person's mark made meanwhile;
// the confirmation lists every line as recorded and sends only after a person presses Send, once every other line is marked.
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "svc", INTERNAL_FN_SECRET: "gate-secret" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let OB, CL, OR, CF, P, PC;
try {
  OB = req(path.join(SITE, "netlify/functions/_offboarding.js")); CL = req(path.join(SITE, "netlify/functions/_closing-list.js"));
  OR = req(path.join(SITE, "netlify/functions/offboarding-run.js")); CF = req(path.join(SITE, "netlify/functions/admin-offboarding-confirm.js"));
  P = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8"); PC = fs.readFileSync(path.join(SITE, "netlify/functions/portal-cancel.js"), "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const safe = async (f) => { try { return await f(); } catch (e) { return { status: "threw", reason: e.message }; } };

try {
  // ── when each line runs ──
  const notice = { event: "cancel_notice", notice_on: "2026-11-02", ends_on: "2026-12-02" };
  const st = (log, today) => CL.closingState({ audit_log: [notice, ...log] }, { today });
  const due = (log, today) => OB.dueLines(st(log, today), today).join();
  if (due([], "2026-11-10") !== "files") fail(`weeks before the end only the files run (${due([], "2026-11-10")})`);
  if (due([], "2026-12-01") !== "files,phone") fail(`the day before the end the real number goes back (${due([], "2026-12-01")})`);
  if (due([], "2026-12-02") !== "files,phone,stop,site,gbp,google") fail(`on the end date the figures wait for the files (${due([], "2026-12-02")})`);
  const filesDone = CL.markEvent({ key: "files", status: "done", by: "RGA (automatic)", auto: true, evidence: "x", at: "2026-11-10T00:00:00Z" });
  if (!due([filesDone], "2026-12-02").includes("figures")) fail("with the files ready, the Google figures aren't deleted on the end date");
  const tried = CL.markEvent({ key: "files", status: "open", by: "RGA (automatic)", auto: true, reason: "x", at: "2026-11-10T09:00:00Z" });
  if (due([tried], "2026-11-10").includes("files")) fail("a line tries more than once a day");
  if (CL.markEvent({ key: "site", status: "na", note: "x", auto: true }) !== null) fail("the system can mark a line 'not applicable'");
  const auto = st([], "2026-11-10").items.filter((i) => i.auto).map((i) => i.key).join();
  if (auto !== "files,phone,stop,site,gbp,google,figures") fail(`the lines that run themselves aren't the approved ones (${auto})`);

  // ── each line against fakes ──
  const mk = (o = {}) => {
    const calls = [], store = {}, db = { client_google_oauth: o.oauth === false ? [] : [{ client_id: "c1", refresh_token: "sealed" }], clients: [{ id: "c1", status: "active" }] };
    for (const tb of OB.GOOGLE_TABLES) db[tb] = [{ client_id: "c1" }];
    const d = { clientId: "c1", client: { business_name: "Acme Plumbing", identity_phone: "(555) 010-2000", ...(o.client || {}) }, tasks: o.tasks || {}, now: () => Date.parse("2026-12-02T12:00:00Z"), rgaEmail: "hello@rocketgrowthagency.com",
      supa: async (p, init = {}) => {
        const m = (init.method || "GET").toUpperCase(), tb = p.split("?")[0].slice(1); calls.push(`${m} ${tb}`);
        if (m === "DELETE") { if (!(o.stuck || []).includes(tb)) db[tb] = []; return []; }
        if (m === "PATCH" && tb === "clients") { if (o.noArchive) return []; db.clients[0] = { ...db.clients[0], ...JSON.parse(init.body) }; return [db.clients[0]]; }
        if (tb === "client_photos") return [{ storage_path: "c1/a.jpg", file_name: "a.jpg" }];
        if (tb === "client_citations") return [{ site: "Yelp", url: "https://yelp.test/acme" }];
        if (tb === "client_monthly_records") return [{ reporting_month: "2026-10", total_calls: 12 }];
        return db[tb] || [];
      },
      google: async () => (o.google === false ? null : { token: "tok", loc: "locations/9", account: "accounts/7" }),
      fetch: async (url, init = {}) => {
        const u = String(url), m = (init.method || "GET").toUpperCase(); calls.push(`${m} ${u.replace(/^https:\/\/[^/]+/, "")}`);
        if (/\/admins$/.test(u)) return res(200, { accountAdmins: o.admins ? [...o.admins] : [] });
        if (/\/admins\//.test(u) && m === "DELETE") { if (!o.adminStays) o.admins = (o.admins || []).filter((a) => !u.endsWith(a.name)); return res(200, {}); }
        if (/locations\/9\?readMask/.test(u)) return res(200, { phoneNumbers: o.phone || { primaryPhone: "(555) 999-0000", additionalPhones: ["555-010-2000"] } });
        if (/locations\/9\?updateMask/.test(u)) { o.sent = JSON.parse(init.body).phoneNumbers; if (!o.phoneRefused && !o.phoneIgnored) o.phone = o.sent; return o.phoneRefused ? res(403, {}) : res(200, {}); }
        return res(404, {});
      },
      removeApp: async () => o.removeApp || { ok: true, how: "uninstalled" },
      revoke: async () => { calls.push("REVOKE"); },
      putFile: async (p, html) => { if (o.putFails) return false; store[p] = o.garble ? html.slice(1) : html; return true; },
      getFile: async (p) => store[p] || null,
      signPhoto: async () => "https://db.test/signed/a.jpg",
    };
    return { d, calls, store, db, o };
  };
  // files
  let x = mk({ tasks: { "m1.web.homepage_meta": { approval: { decision: "approved", approved_content: "Page title: Plumbers in Denver", at: "2026-10-01" }, published: { at: "2026-10-02" } } } });
  let r = await safe(() => OB.RUN.files(x.d));
  const page = x.store[OB.FILES_PATH("c1")] || "";
  if (r.status !== "done" || !/1 website change, 1 photo, 1 listing, 1 month/.test(r.evidence || "") || !/Plumbers in Denver/.test(page) || !/signed\/a\.jpg/.test(page) || !/yelp\.test/.test(page)) fail(`the files page isn't made and read back with their approved changes, photos and listings (${JSON.stringify(r)})`);
  if (/<script/i.test(page)) fail("the files page carries a script");
  x = mk({ garble: true }); r = await safe(() => OB.RUN.files(x.d));
  if (r.status !== "open") fail("files that don't read back the same are called ready");
  x = mk({ putFails: true }); r = await safe(() => OB.RUN.files(x.d));
  if (r.status !== "open") fail("files that weren't saved are called ready");
  // phone
  x = mk(); r = await safe(() => OB.RUN.phone(x.d));
  if (r.status !== "open" || !/No tracking number on record/.test(r.reason || "") || x.calls.some((c) => /updateMask/.test(c))) fail(`with no tracking number, the phone line acts or guesses (${JSON.stringify(r)})`);
  const tr = { "m1.tracking.call_setup": { tracking: { number: "(555) 999-0000", provider: "CallRail" } } };
  x = mk({ tasks: tr, phone: { primaryPhone: "(555) 999-0000", additionalPhones: ["555-010-2000", "(555) 999-0000", "(555) 444-1111"] } }); r = await safe(() => OB.RUN.phone(x.d));
  if (r.status !== "open" || !/real number \(555\) 010-2000 as the main number again \(read back\)/.test(r.evidence || "") || !/Turn off \(555\) 999-0000 in CallRail/.test(r.reason || "") || x.o.phone.primaryPhone !== "(555) 010-2000" || (x.o.phone.additionalPhones || []).join() !== "(555) 444-1111") fail(`the real number isn't put back as main (tracking number dropped), read back, with CallRail left as RGA's move (${JSON.stringify(r)} ${JSON.stringify(x.o.phone)})`);
  x = mk({ tasks: tr, phoneIgnored: true }); r = await safe(() => OB.RUN.phone(x.d));
  if (r.status !== "open" || /read back/.test(r.evidence || "") || !/doesn't show/.test(r.reason || "")) fail("a number change Google didn't take reads as put back (no read-back)");
  x = mk({ tasks: tr, phoneRefused: true }); r = await safe(() => OB.RUN.phone(x.d));
  if (r.status !== "open" || /read back/.test(r.evidence || "")) fail("a refused number change reads as put back");
  x = mk({ tasks: tr, google: false }); r = await safe(() => OB.RUN.phone(x.d));
  if (r.status !== "open" || !/No Google connection/.test(r.reason || "")) fail("with no Google connection, the phone line doesn't say it's RGA's move");
  // stop
  x = mk(); r = await safe(() => OB.RUN.stop(x.d));
  if (r.status !== "done" || x.db.clients[0].status !== "archived" || !x.db.clients[0].archived_at) fail(`their record isn't archived and read back (${JSON.stringify(r)})`);
  x = mk({ noArchive: true }); r = await safe(() => OB.RUN.stop(x.d));
  if (r.status !== "open") fail("a record that didn't save as archived is called stopped");
  // site
  const app = { "m1.access.website": { access: { confirmed_at: "x", via: "github_app", repo: "acme/site" } } };
  x = mk({ tasks: app }); r = await safe(() => OB.RUN.site(x.d));
  if (r.status !== "done" || !/removed itself from acme\/site; GitHub confirms/.test(r.evidence || "")) fail(`RGA's app doesn't remove itself (${JSON.stringify(r)})`);
  x = mk({ tasks: app, removeApp: { ok: false, state: "shared", others: ["other/biz"] } }); r = await safe(() => OB.RUN.site(x.d));
  if (r.status !== "open" || !/other\/biz/.test(r.reason || "")) fail("a shared install isn't left as the client's move with what else it reaches");
  x = mk({ tasks: { "m1.access.website": { access: { confirmed_at: "x", via: "invite", account: "access@rocketgrowthagency.com" } } } }); r = await safe(() => OB.RUN.site(x.d));
  if (r.status !== "open" || !/leave their site as RGA/.test(r.reason || "")) fail("a builder invite isn't RGA's move to leave by hand");
  x = mk(); r = await safe(() => OB.RUN.site(x.d));
  if (r.status !== "open" || !/No website access on record/.test(r.reason || "")) fail("no access on record is guessed instead of left for a person");
  // gbp
  x = mk({ admins: [{ name: "accounts/7/admins/1", admin: "owner@acme.test" }, { name: "accounts/7/admins/2", admin: "Hello@RocketGrowthAgency.com" }] }); r = await safe(() => OB.RUN.gbp(x.d));
  if (r.status !== "done" || !x.calls.some((c) => c === "DELETE /v1/accounts/7/admins/2") || x.calls.some((c) => /admins\/1$/.test(c))) fail(`RGA isn't removed as manager (only RGA), read back (${JSON.stringify(r)} ${x.calls.join(" | ")})`);
  x = mk({ admins: [{ name: "accounts/7/admins/2", admin: "hello@rocketgrowthagency.com" }], adminStays: true }); r = await safe(() => OB.RUN.gbp(x.d));
  if (r.status !== "open") fail("a manager Google still lists is called removed");
  x = mk({ google: false }); r = await safe(() => OB.RUN.gbp(x.d));
  if (r.status !== "open") fail("with no Google connection, the manager line is called done");
  // google
  x = mk(); r = await safe(() => OB.RUN.google(x.d));
  if (r.status !== "done" || !x.calls.includes("REVOKE") || x.db.client_google_oauth.length) fail(`the Google connection isn't revoked and deleted, read back (${JSON.stringify(r)})`);
  x = mk({ stuck: ["client_google_oauth"] }); r = await safe(() => OB.RUN.google(x.d));
  if (r.status !== "open") fail("a Google connection that's still there is called removed");
  // figures
  x = mk(); r = await safe(() => OB.RUN.figures(x.d));
  if (r.status !== "done" || OB.GOOGLE_TABLES.some((tb) => x.db[tb].length)) fail(`the Google figures aren't deleted and read back (${JSON.stringify(r)})`);
  x = mk({ stuck: ["client_gsc_daily"] }); r = await safe(() => OB.RUN.figures(x.d));
  if (r.status !== "open" || !/client_gsc_daily/.test(r.reason || "")) fail("figures that are still there are called deleted");
  if (OB.GOOGLE_TABLES.some((tb) => /monthly|contract|invoice|activity|onboarding/.test(tb))) fail("the figures line deletes records of RGA's work");

  // ── the daily run: one event per line, a person's mark meanwhile is kept ──
  const C = { id: "k1", client_id: "c1", tier: "growth", signed_at: "2026-01-01", audit_log: [notice] };
  let patched = null, readsC = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = (init.method || "GET").toUpperCase();
    if (u.includes("/client_contracts?status=eq.signed")) return res(200, [C]);
    if (u.includes("/client_contracts?id=eq.k1&select=")) { readsC++; return res(200, [{ id: "k1", audit_log: [notice, CL.markEvent({ key: "phone", status: "na", note: "RGA never set a tracking number", by: "chris@x", at: "2026-12-01T08:00:00Z" })] }]); }
    if (u.includes("/client_contracts?id=eq.k1") && m === "PATCH") { patched = JSON.parse(init.body).audit_log; return res(200, [{ audit_log: patched }]); }
    if (u.includes("/clients?id=eq.c1")) return res(200, [{ id: "c1", business_name: "Acme" }]);
    if (u.includes("/client_onboarding_records")) return res(200, [{ data: { tasks: {} } }]);
    if (u.includes("/storage/v1/object/raw-store/")) return m === "POST" ? res(200, {}) : res(404, "");
    return res(200, []);
  };
  try {
    await OR.runAll({ today: "2026-12-01" });   // the day before the end: files + phone are due; a person marks phone meanwhile
  } finally { globalThis.fetch = realFetch; }
  if (!patched || readsC !== 1) fail(`the daily run doesn't read the contract again before writing (${readsC} re-read)`);
  else {
    const added = patched.slice(2);
    if (added.some((e) => e.key === "phone")) fail("the daily run overwrote a line a person marked meanwhile");
    if (!added.some((e) => e.key === "files" && e.auto && e.by === "RGA (automatic)")) fail("the daily run didn't record the line it ran");
    if (patched[1].status !== "na" || patched[1].by !== "chris@x") fail("a person's mark made meanwhile was lost");
  }

  // ── the confirmation ──
  const fin = (log) => CL.closingState({ audit_log: [notice, ...log] }, { today: "2026-12-05" });
  const all = ["files", "phone", "stop", "site", "gbp", "google", "figures", "accounts", "refund"].map((k, n) => k === "accounts" ? CL.markEvent({ key: k, status: "na", note: "RGA made none" }) : CL.markEvent({ key: k, status: "done", by: "RGA (automatic)", auto: true, evidence: `${k} read back`, at: `2026-12-0${n % 3 + 2}T10:00:00Z` }));
  const dr = CF.draftFor({ business_name: "Acme", primary_contact_name: "Dana Smith", primary_contact_email: "dana@acme.test" }, fin(all));
  if (!dr.ready || dr.to !== "dana@acme.test" || !/^Hi Dana,/.test(dr.body) || !/gbp read back/.test(dr.body) || !/not applicable \(RGA made none\)/.test(dr.body) || !/nothing we built was taken off your site/.test(dr.body) || /—/.test(dr.body)) fail(`the confirmation doesn't list every line as recorded (${dr.body.slice(0, 200)})`);
  const missing = fin(all).items.filter((i) => i.key !== "confirm" && !dr.body.includes(i.label));
  if (missing.length) fail(`the confirmation leaves out ${missing.map((i) => i.label).join(", ")}`);
  const dr2 = CF.draftFor({ primary_contact_email: "dana@acme.test" }, fin(all.slice(0, 3)));
  if (dr2.ready || !dr2.waiting.length) fail("the confirmation is ready while lines are still open");
  const CFsrc = fs.readFileSync(path.join(SITE, "netlify/functions/admin-offboarding-confirm.js"), "utf8");
  if (!/if \(body\.action !== "send"\) return json\(200/.test(CFsrc) || !/if \(!draft\.ready\) return json\(409/.test(CFsrc) || !/if \(!closing\.ended\) return json\(409/.test(CFsrc) || !/if \(sent && sent\.suppressed\) return json\(409/.test(CFsrc) || !/const gate = await requireWorkspaceForClient\(event, clientId\);\s*if \(gate\.error\) return gate\.error;/.test(CFsrc)) fail("the confirmation can send without a staff press, before the end, with lines open, or while client email is off");

  // ── the client's card ──
  if (!/files_ready: !!\(files && files\.status === "done"\)/.test(PC) || !/if \(v\.state !== "notice" \|\| !v\.notice\.files_ready\) return json\(409/.test(PC) || !/expiresIn: 3600/.test(PC)) fail("the client's files link isn't only for a ready file, or isn't short-lived");
  const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); return m ? src.slice(m.index, src.indexOf("\n}\n", m.index) + 2) : null; };
  const ctx = vm.createContext({ escapeHtml: (s) => String(s), csCard: (o) => `[${o.head}|${o.side}]${o.body}`, csEv: (w) => `<ev>${w}</ev>`, csNote: (w) => `<note>${w}</note>` });
  vm.runInContext(`const longDay = ${(/^const longDay = ([^\n]*);$/m.exec(P) || [])[1]};\n${lift(P, "cancelCardHtml")}`, ctx);
  const cardReady = vm.runInContext(`cancelCardHtml({ view: { state: "notice", notice: { notice_on: "2026-11-02", ends_on: "2026-12-02", remove_access_by: "2026-12-09", files_ready: true } } })`, ctx);
  const cardWait = vm.runInContext(`cancelCardHtml({ view: { state: "notice", notice: { notice_on: "2026-11-02", ends_on: "2026-12-02", remove_access_by: "2026-12-09", files_ready: false } } })`, ctx);
  if (!/^\[Your service ends December 2, 2026\|/.test(cardReady) || !/Your files are ready to download/.test(cardReady) || !/data-cx-files>Download your files</.test(cardReady) || !/You can sign in for 90 days to download them again/.test(cardReady)) fail(`the client's card doesn't hand over their files in the approved words (${cardReady.slice(0, 160)})`);
  if (/data-cx-files/.test(cardWait) || !/^\[Your notice is recorded/.test(cardWait)) fail("the client's card offers files before they're ready");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }

if (F.length) { console.error(`❌ end of service — ${F.length} regression(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ end of service runs itself: files before the end, the real number back where RGA set a tracking number, then stop, leave the website and Google, delete the Google figures (only after the files) — each read back, anything it can't do left as RGA's move with the reason, never 'not applicable' by itself; the daily run keeps a person's mark; the confirmation lists every line and sends only on a staff press once all are marked; the client gets their files in the approved words");
