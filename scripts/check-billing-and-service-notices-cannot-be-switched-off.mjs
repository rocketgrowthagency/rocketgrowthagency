#!/usr/bin/env node
// check-billing-and-service-notices-cannot-be-switched-off.mjs — A CLIENT CAN SWITCH OFF A REMINDER, NEVER THEIR BILL OR THEIR SERVICE
// (approved card_notice_designs_v1 section 2, Chris 11-11: "Billing and service notices can't be switched off"). The SHIPPED code on fakes:
//   1 the one gate function (shared/notices.js gate) answers "send" for billing and service whatever a settings row says, and for any kind
//     it doesn't know (a new message is a service notice until someone decides otherwise); _notices.mayRemind says send even when the
//     settings can't be read
//   2 the settings API (portal-notices.js set_pref) refuses a write for billing / service / an unknown kind, and writes nothing
//   3 the portal draws the two "Always sent" rows locked (aria-disabled, no switch that saves); texts exist only for call reminders
//   4 every billing code (C5 C8 R3 R4 R5 R6 R7) counts as billing; the table itself refuses a settings row for billing or service
//   5 self-proof: the same checks against a gate that honors a billing row fail
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const F = [], fail = (m) => F.push(m);
let N, S, PN, SQL;
try {
  N = req(path.join(SITE, "shared/notices.js")); S = req("./_notices.js"); PN = req("./portal-notices.js");
  SQL = fs.readFileSync(path.join(SITE, "docs/supabase/NOTICES_AND_COMMENTS_2026-11-11.sql"), "utf8");
  for (const [n, f] of [["gate", N.gate], ["validatePref", N.validatePref], ["prefsHtml", N.prefsHtml], ["mayRemind", S.mayRemind], ["handle", PN.handle]]) if (typeof f !== "function") throw new Error(`${n} isn't exported`);
} catch (e) { console.error(`⚠️  INDETERMINATE: couldn't load: ${e.message}`); process.exit(2); }

const OFF = (kind) => [{ kind, email_on: false, text_on: false }];
/** The rule, against any gate function. → problems */
function rule(gate) {
  const bad = [];
  for (const kind of ["billing", "service", "something_new"]) for (const ch of ["email", "text", "invite", "portal"]) {
    const g = gate(OFF(kind), kind, ch);
    if (!g || g.send !== true) bad.push(`${kind} by ${ch} can be switched off (${JSON.stringify(g)})`);
  }
  if (gate(OFF("step_waiting"), "step_waiting", "email").send !== false) bad.push("a switched-off step reminder still says send (so the lock above proves nothing)");
  return bad;
}
for (const b of rule(N.gate)) fail(b);
// 5 · self-proof: a gate that honors a billing row is caught
{
  const broken = (prefs, kind, ch) => { const r = (prefs || []).find((p) => p.kind === kind); return r && r[`${ch}_on`] === false ? { send: false } : { send: true }; };
  if (!rule(broken).some((m) => /billing/.test(m))) fail("the rule can't see a gate that lets billing be switched off (its own before state passes)");
}
for (const kind of ["billing", "service"]) if (!N.ALWAYS.some((a) => a.kind === kind) || N.SWITCHABLE.has(kind)) fail(`${kind} is not in the always-sent list, or is switchable`);
for (const r of N.REMINDERS) if (r.text !== /^call_/.test(r.kind)) fail(`"${r.label}": a text switch exists only for call reminders`);

// mayRemind: a settings read that FAILED still sends billing / service (never held back on a guess)
for (const kind of ["billing", "service"]) {
  const m = await S.mayRemind({ clientId: "c", kind, channel: "email", supa: async () => { throw new Error("Supabase 500: down"); } });
  if (!m.send) fail(`a ${kind} notice is held back when the settings can't be read`);
}

// 2 · the settings API refuses, and writes nothing
{
  const writes = [];
  const supa = async (p, init = {}) => { if ((init.method || "GET") !== "GET") writes.push(p); return []; };
  const guard = { requirePortalOwner: async () => ({ email: "sam@x.test" }), requirePortalOwnerOrWorkspace: async () => ({ email: "sam@x.test" }), requireWorkspaceForClient: async () => ({ error: { statusCode: 403 } }) };
  const call = (b) => PN.handle({ httpMethod: "POST", body: JSON.stringify({ client_id: "11111111-1111-4111-8111-111111111111", action: "set_pref", ...b }) }, { supa, guard });
  for (const kind of ["billing", "service", "anything_else"]) {
    const r = await call({ kind, channel: "email", on: false });
    if (r.statusCode < 400) fail(`the settings API took a write switching off ${kind} (${r.statusCode})`);
  }
  const t = await call({ kind: "step_waiting", channel: "text", on: true });
  if (t.statusCode < 400) fail("the settings API took a text switch for an email-only reminder");
  if (writes.length) fail(`a refused setting still wrote to the database (${writes.join(", ")})`);
  for (const kind of ["billing", "service"]) if (!N.validatePref(kind, "email", false)) fail(`validatePref takes ${kind}`);
}

// 3 · the portal draws them locked
{
  const html = N.prefsHtml({ prefs: OFF("billing").concat(OFF("service")), mobile: "(310) 555-0142" });
  const always = html.slice(html.indexOf("Always sent"));
  if (!/Always sent/.test(html)) fail("the settings have no Always sent part");
  if ((always.match(/nt-sw lock" role="switch" aria-checked="true" aria-disabled="true"/g) || []).length !== 2) fail("the two Always sent rows aren't drawn locked on");
  if (/data-nt-sw="(billing|service):/.test(html)) fail("a billing or service row has a switch that saves");
  if (!/can't be switched off/.test(always)) fail("the settings don't say the two can't be switched off");
}

// 4 · codes and the table
for (const c of ["C5", "C8", "R3", "R4", "R5", "R6", "R7"]) if (N.kindOfCode(c) !== "billing") fail(`${c} doesn't count as billing`);
if (!/kind\s+text not null check \(kind in \('call_day_before', 'call_hour_before', 'step_waiting', 'photos_later'\)\),?\s+--\s*never billing or service/.test(SQL)) fail("client_notice_prefs no longer refuses a row for billing or service");

if (F.length) { console.error(`❌ billing and service notices can't be switched off — ${F.length} regression(s):`); for (const m of F) console.error(`  · ${m}`); process.exit(1); }
console.log("✅ billing and service notices can't be switched off: the one gate says send whatever a row says (and when settings can't be read), the API refuses the write, the portal draws them locked, the table refuses the row");
