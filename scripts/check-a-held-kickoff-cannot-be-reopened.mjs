#!/usr/bin/env node
// check-a-held-kickoff-cannot-be-reopened.mjs — 2026-10-20 (Chris pressed "Change" on his own held kickoff → the step went back
// to pending while the card still said "Done", marked as his next step; the walk FAILed step 7). RUNS portal-step-choice on a fake
// database and pins:
//   · a kickoff whose recap went out, or whose time has passed, REFUSES a reopen (409) and writes nothing
//   · a kickoff still in the future can be reopened as before (a settled step is never locked — Chris 09-16)
//   · "Not right?" (flag_wrong) still works on a held kickoff — the escape hatch stays
//   · the portal: kickoffHeld() is the same rule, and the held kickoff's row offers "Not right?", never "Change"
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const CID = "11111111-2222-4333-8444-555555555555";
const HOUR = 3600000;
let db, patches;
process.env.SUPABASE_URL = "https://stub.supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
const J = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/auth/v1/user") return J({ id: "u1", email: "owner@acme.test" });
  if (u.pathname.endsWith("/notify-rga")) return J({ ok: true });
  const t = u.pathname.split("/").pop(); const rows = db[t] || [];
  const q = [...u.searchParams].filter(([, v]) => /^eq\./.test(v));
  const hit = rows.filter((r) => q.every(([k, v]) => String(r[k]) === v.slice(3)));
  if ((opt.method || "GET") === "PATCH") { patches++; const b = JSON.parse(opt.body || "{}"); for (const r of hit) Object.assign(r, b); return J(hit); }
  if ((opt.method || "GET") === "POST") return J([{}]);
  return J(hit);
};
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let H; try { H = req(`${SITE}/netlify/functions/portal-step-choice.js`).handler; } catch (e) { console.error(`⚠️  portal-step-choice won't load: ${e.message}`); process.exit(2); }
const world = (invite, status = "done") => {
  patches = 0;
  db = { client_portal_access: [{ portal_email: "owner@acme.test", client_id: CID }], clients: [{ id: CID, business_name: "Acme Plumbing" }],
    client_onboarding_records: [{ id: "ob1", client_id: CID, data: { kickoff_invite: invite, tasks: { "m1.kickoff.call": { status, completed_at: status === "done" ? "2026-10-09T16:11:50Z" : null } } } }] };
};
const call = async (body) => { const r = await H({ httpMethod: "POST", headers: { authorization: "Bearer jwt" }, body: JSON.stringify({ client_id: CID, step_id: "m1.kickoff.call", ...body }) }); return { status: r.statusCode, body: JSON.parse(r.body || "{}") }; };
const task = () => db.client_onboarding_records[0].data.tasks["m1.kickoff.call"];
// held: the recap went out
world({ start: new Date(Date.now() - 11 * 24 * HOUR).toISOString(), recap_sent_at: new Date(Date.now() - 11 * 24 * HOUR).toISOString(), event_id: "e1" });
let r = await call({ reopen: true });
if (r.status !== 409 || patches || task().status !== "done") fail(`a kickoff whose recap went out can be reopened (${r.status}, ${patches} write(s), now ${task().status})`);
if (!/already happened/.test(r.body.error || "") || !/Nothing was changed/.test(r.body.error || "")) fail(`the refusal doesn't say the call already happened and nothing changed (${r.body.error})`);
// held: no recap yet, but the time has passed
world({ start: new Date(Date.now() - HOUR).toISOString(), event_id: "e1" });
r = await call({ reopen: true });
if (r.status !== 409 || patches) fail(`a kickoff whose time has passed (no recap yet) can be reopened (${r.status})`);
// the step lock refuses a reopen too (10-27) — so pin THIS rule by its reason: a past call says it already happened, not "locked"
if (!/already happened/.test(r.body.error || "")) fail(`a past call is refused for another reason, not because it already happened (${r.body.error}) — the time rule may be gone`);
// not held: a future call is still the client's to change
world({ start: new Date(Date.now() + 3 * 24 * HOUR).toISOString(), event_id: "e1" });
r = await call({ reopen: true });
if (r.status !== 200 || task().status !== "pending") fail(`a kickoff still in the future can't be reopened any more (${r.status} ${r.body.error || ""}) — a settled step is never locked`);
// the escape hatch on a held call
world({ start: new Date(Date.now() - 11 * 24 * HOUR).toISOString(), recap_sent_at: new Date(Date.now() - 11 * 24 * HOUR).toISOString(), event_id: "e1" });
r = await call({ flag_wrong: true });
if (r.status !== 200 || !task().client_flagged) fail(`"Not right?" doesn't work on a held kickoff (${r.status} ${r.body.error || ""})`);
// ── the portal
const P = read("portal/portal.js");
const m = P.match(/^const kickoffHeld = .*$/m);
if (!m) { console.error("⚠️  kickoffHeld moved"); process.exit(2); }
const ctx = vm.createContext({ Date });
vm.runInContext(m[0].replace(/^const /, "var "), ctx);
const held = (k) => vm.runInContext(`kickoffHeld(${JSON.stringify(k)})`, ctx);
if (!held({ recap_sent_at: "2026-10-09T16:11:50Z", start: new Date(Date.now() + HOUR).toISOString() }) || !held({ start: new Date(Date.now() - HOUR).toISOString() })) fail("the portal doesn't treat a recapped or past kickoff as held");
if (held({ start: new Date(Date.now() + HOUR).toISOString() }) || held(null)) fail("the portal treats a future or missing kickoff as held");
if (!/: mech === "rga" \|\| \(step\.id === "m1\.kickoff\.call" && kickoffHeld\(onboarding\?\.data\?\.kickoff_invite\)\)\s*\?\s*`<button class="pm-amend" data-step-wrong=/.test(P)) fail("a held kickoff's row offers \"Change\" (reopen) instead of \"Not right?\"");
if (F.length) { console.error("🔴 a held kickoff can be reopened:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a held kickoff (recap sent or time passed) refuses a reopen and writes nothing; a future one still can; \"Not right?\" still flags it; the portal offers \"Not right?\", never Change");
