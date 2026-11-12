#!/usr/bin/env node
// check-no-one-is-staff-by-accident.mjs — A CLIENT IS NEVER STAFF, AND CAN'T MAKE ITSELF STAFF (11-11 database audit; Chris ran
// website docs/supabase/SECURITY_LOCKDOWN_2026-11-11.sql).
//
// GUARDS the two holes that SQL closed, and the class around them:
//   HOLE 1 · public.is_internal_user() returned TRUE for any signed-in user with NO profile (`role <> 'client'`, a deny-list), so every
//            staff-only policy was open to them.
//   HOLE 2 · profiles_self_insert / profiles_self_update let a user write their OWN role, so anyone could make themselves 'owner'.
//   HOLE 3 · (11-11 security master S1; Chris ran SECURITY_LOCKDOWN_2_2026-11-11.sql) profiles_guard_role() checked the workspace only on
//            UPDATE, so a portal client could INSERT its own profile naming RGA's workspace (read off its own clients row) and pass every
//            admin function guard. Now checked both ways: the guard's INSERT branch must refuse a non-null workspace_id (static), and the
//            portal client's insert naming RGA's workspace must be refused P0001 (static only: no live probe).
// (a) STATIC, read-only (Supabase Management API read-only SQL, SUPABASE_ACCESS_TOKEN): is_internal_user() ALLOW-lists staff roles
//     (an `in (...)` list, no `<>`); the trigger profiles_guard_role_trg is on public.profiles and enabled; no policy for the public,
//     authenticated or anon roles has USING or WITH CHECK exactly `true`, outside TRUE_POLICY_ALLOW (with a reason) in scripts/lib/staff-rules.mjs.
// (b) LIVE, as the portal client rocketgrowthagencyadmin@gmail.com (a one-time link, verified; the public anon key from admin-config):
//     0 rows from client_notes, lead_intakes, brain_knowledge, fga_report_cache; at most 1 from clients; and POST profiles {role:'owner'}
//     is REFUSED by the guard (P0001). 🔴 That probe runs only after (a) proved the guard exists, and if it were ever ACCEPTED the gate puts
//     the profile back as it was (service role) before it reports red: a check must never leave a client as owner.
// 🔑 SELF-PROVING: every rule (scripts/lib/staff-rules.mjs, read from SCRAPER_COPY_DIR when set) is run on fixtures first: the 11-10 deny-list
// definition, a missing trigger, a `true` policy for authenticated, an accepted role write must each be caught, the fixed shapes passed;
// else INDETERMINATE. In the mutation harness only the self-test runs (the live database is not touched).
// Exit 0 = nobody is staff by accident · 1 = a hole is open · 2 = INDETERMINATE (no token, no network, a sign-in failed, self-test failed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const libPath = fs.existsSync(path.join(SCR, "scripts/lib/staff-rules.mjs")) ? path.join(SCR, "scripts/lib/staff-rules.mjs") : path.join(REAL, "scripts/lib/staff-rules.mjs");
const R = await import(pathToFileURL(libPath).href);

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const before = "CREATE OR REPLACE FUNCTION public.is_internal_user()\n RETURNS boolean\nAS $function$\n  select coalesce(public.current_profile_role(), '') <> 'client';\n$function$\n";
  const after = "CREATE OR REPLACE FUNCTION public.is_internal_user()\n RETURNS boolean\nAS $function$\n  select coalesce(public.current_profile_role(), '') in ('owner', 'admin', 'staff', 'rep');\n$function$\n";
  const t = (cond, m) => { if (!cond) idk(`self-test: ${m}`); };
  t(R.judgeInternalFn(before).length > 0, "the 11-10 deny-list definition (role <> 'client') passes");
  t(R.judgeInternalFn(after).length === 0, "the fixed allow-list definition fails");
  t(R.judgeInternalFn("").length > 0, "a missing is_internal_user() passes");
  t(R.judgeInternalFn(after.replace("in ('owner', 'admin', 'staff', 'rep')", "in ('owner', 'admin') or public.current_profile_role() <> 'client'")).length > 0, "an allow-list with a deny-list tacked on passes");
  t(R.judgeInternalFn(after.replace("coalesce(public.current_profile_role(), '') in ('owner', 'admin', 'staff', 'rep')", "auth.uid() is not null")).length > 0, "a definition with no role list at all (every signed-in user is staff) passes");
  t(R.judgeTrigger([]).length > 0, "a missing profiles_guard_role_trg passes");
  t(R.judgeTrigger([{ tgname: "profiles_guard_role_trg", rel: "profiles", tgenabled: "D" }]).length > 0, "a disabled guard trigger passes");
  t(R.judgeTrigger([{ tgname: "profiles_guard_role_trg", rel: "profiles", tgenabled: "O" }]).length === 0, "an enabled guard trigger fails");
  const pol = (roles, qual, wc = null) => ({ schemaname: "public", tablename: "brain_knowledge", policyname: "Service role full access", roles, cmd: "ALL", qual, with_check: wc });
  t(R.judgePolicies([pol("{public}", "true")], {}).length === 1, "a `true` policy granted to public passes (the 11-10 brain_* hole)");
  t(R.judgePolicies([pol("{authenticated}", null, "true")], {}).length === 1, "a WITH CHECK true policy for authenticated passes");
  t(R.judgePolicies([pol("{service_role}", "true", "true")], {}).length === 0, "a service_role `true` policy is flagged (the service role bypasses RLS anyway)");
  t(R.judgePolicies([pol("{authenticated}", "is_internal_user()")], {}).length === 0, "a staff-only policy is flagged");
  t(R.judgePolicies([pol("{anon}", "true")], { "public.brain_knowledge.Service role full access": "a reason long enough to be a reason" }).length === 0, "an allow-listed policy with a reason is flagged");
  const live = { client_notes: 0, lead_intakes: 0, brain_knowledge: 0, fga_report_cache: 0, clients: 1 };
  t(R.judgeLive({ counts: live, insert: { status: 400, code: "P0001" } }).length === 0, "a locked-down client fails");
  t(R.judgeLive({ counts: { ...live, brain_knowledge: 3 }, insert: { status: 400, code: "P0001" } }).length > 0, "a client reading brain_knowledge passes");
  t(R.judgeLive({ counts: { ...live, clients: 4 }, insert: { status: 400, code: "P0001" } }).length > 0, "a client reading 4 client rows passes");
  t(R.judgeLive({ counts: live, insert: { status: 201, code: null } }).length > 0, "a client given role owner passes");
  t(R.judgeLive({ counts: { ...live, lead_intakes: null }, insert: { status: 400, code: "P0001" } }).length > 0, "an unread table passes as zero rows");
  // HOLE 3 (11-11 security master S1, SECURITY_LOCKDOWN_2_2026-11-11.sql): the insert case
  const guard1 = "begin\n  if coalesce(auth.role(), '') = 'service_role' then return new; end if;\n  if tg_op = 'INSERT' then\n    if coalesce(new.role, '') not in ('', 'client') and not public.is_internal_user() then\n      raise exception 'x';\n    end if;\n  elsif (new.role is distinct from old.role or new.workspace_id is distinct from old.workspace_id) and not public.is_internal_user() then\n    raise exception 'y';\n  end if;\n  return new;\nend";
  const guard2 = guard1.replace("if coalesce(new.role, '') not in ('', 'client') and not", "if (coalesce(new.role, '') not in ('', 'client') or new.workspace_id is not null) and not");
  t(R.judgeGuardFn(guard1).length > 0, "the first lockdown's guard (role only on INSERT, the 11-11 HOLE 3) passes");
  t(R.judgeGuardFn(guard2).length === 0, "the second lockdown's guard (workspace refused on INSERT) fails");
  t(R.judgeGuardFn("").length > 0, "a missing profiles_guard_role() passes");
  t(R.judgeGuardFn(guard2.replace("raise exception 'x';", "null;")).length > 0, "an INSERT branch that never refuses passes");
  t(R.judgeGuardFn(guard2.replace("and not public.is_internal_user()", "")).length > 0, "an INSERT branch that can't tell staff from a client passes");
  t(R.judgeGuardFn(guard2.replace(/tg_op = 'INSERT'/, "tg_op = 'UPDATE'")).length > 0, "a guard with no INSERT branch passes");
}
if (process.env.SCRAPER_COPY_DIR) { console.log("✅ self-test held (mutation copy: the live database is not read)"); process.exit(0); }

// ── (a) static, read-only ───────────────────────────────────────────────────────────────────────────────────────────────
let envText = "";
try { envText = fs.readFileSync(path.join(REAL, ".env"), "utf8"); } catch { /* the environment may carry them */ }
const env = (k) => process.env[k] || ((new RegExp(`^${k}=(.*)$`, "m").exec(envText) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
const TOKEN = env("SUPABASE_ACCESS_TOKEN"), DB = env("SUPABASE_URL"), SVC = env("SUPABASE_SERVICE_ROLE_KEY");
if (!TOKEN) idk("no SUPABASE_ACCESS_TOKEN: the Management API can't be asked");
const REF = "jetgayimvfeslqnkbfdq";
const sql = async (query) => {
  let r;
  try { r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query/read-only`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000) }); }
  catch (e) { idk(`the Management API didn't answer: ${String(e.message).slice(0, 120)}`); }
  if (!r.ok) idk(`the Management API answered HTTP ${r.status}`);
  try { return await r.json(); } catch { idk("the Management API's answer is not JSON"); }
};
const F = [];
const fn = await sql("select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_internal_user'");
F.push(...R.judgeInternalFn((fn[0] || {}).def));
const trg = await sql("select tgname, tgrelid::regclass::text as rel, tgenabled from pg_trigger where tgname = 'profiles_guard_role_trg'");
const trgProblems = R.judgeTrigger(trg);
F.push(...trgProblems);
const pols = await sql("select schemaname, tablename, policyname, roles::text as roles, cmd, qual, with_check from pg_policies where qual = 'true' or with_check = 'true'");
F.push(...R.judgePolicies(pols));
const gfn = await sql("select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'profiles_guard_role'");
const guardProblems = R.judgeGuardFn((gfn[0] || {}).def);
F.push(...guardProblems);

// ── (b) live, as the portal client ─────────────────────────────────────────────────────────────────────────────────────
const EMAIL = "rocketgrowthagencyadmin@gmail.com";
if (!DB || !SVC) idk("no database address or service key: can't mint the portal client's sign-in");
let ANON;
try { ANON = (await (await fetch("https://www.rocketgrowthagency.com/.netlify/functions/admin-config", { signal: AbortSignal.timeout(15000) })).json()).supabaseAnonKey; } catch (e) { idk(`admin-config didn't answer: ${String(e.message).slice(0, 100)}`); }
if (!ANON) idk("admin-config gave no public anon key");
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
let link, session;
try { link = await (await fetch(`${DB}/auth/v1/admin/generate_link`, { method: "POST", headers: svcH, body: JSON.stringify({ type: "magiclink", email: EMAIL }), signal: AbortSignal.timeout(15000) })).json(); } catch (e) { idk(`no sign-in link: ${String(e.message).slice(0, 100)}`); }
const hashed = link && (link.hashed_token || (link.properties || {}).hashed_token);
if (!hashed) idk("the sign-in link came back without a token");
try { session = await (await fetch(`${DB}/auth/v1/verify`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: hashed }), signal: AbortSignal.timeout(15000) })).json(); } catch (e) { idk(`the sign-in didn't verify: ${String(e.message).slice(0, 100)}`); }
if (!session || !session.access_token || !session.user) idk("the sign-in didn't verify (no session)");
const userH = { apikey: ANON, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
const counts = {};
for (const t of ["client_notes", "lead_intakes", "brain_knowledge", "fga_report_cache", "clients"]) {
  try { const r = await fetch(`${DB}/rest/v1/${t}?select=id&limit=5`, { headers: userH, signal: AbortSignal.timeout(15000) }); const b = await r.json(); counts[t] = r.ok && Array.isArray(b) ? b.length : null; } catch { counts[t] = null; }
}
// the role probe: only once the guard is known to exist, and undone if it were ever accepted
let insert = null;
// STAFF_PROBE_NO_WRITE=1 skips the probe for a by-hand look; the run is then RED ("the role probe did not run"), never green
if (process.env.STAFF_PROBE_NO_WRITE) insert = null;
else if (!trgProblems.length) {
  const me = session.user.id;
  let prior = null;
  try { prior = (await (await fetch(`${DB}/rest/v1/profiles?id=eq.${me}&select=*`, { headers: svcH })).json())[0] || null; } catch { idk("could not read the portal client's profile first (the probe needs a way back)"); }
  try {
    const r = await fetch(`${DB}/rest/v1/profiles`, { method: "POST", headers: { ...userH, Prefer: "return=minimal" }, body: JSON.stringify({ id: me, role: "owner" }), signal: AbortSignal.timeout(15000) });
    const b = await r.json().catch(() => ({}));
    insert = { status: r.status, code: b && b.code ? b.code : null };
    if (r.ok) {
      // 🔴 accepted: put it back exactly as it was, then report red
      if (prior) await fetch(`${DB}/rest/v1/profiles?id=eq.${me}`, { method: "PATCH", headers: svcH, body: JSON.stringify({ role: prior.role }) });
      else await fetch(`${DB}/rest/v1/profiles?id=eq.${me}`, { method: "DELETE", headers: svcH });
    }
  } catch (e) { idk(`the role probe didn't answer: ${String(e.message).slice(0, 100)}`); }
} else insert = { status: 0, code: "skipped: the guard trigger is missing, so the probe would make the client owner" };
// HOLE 3 (the insert case) is checked STATICALLY above (judgeGuardFn on profiles_guard_role()'s own text): no live probe ever tries to give a
// client RGA's workspace (Chris, 11-11).
F.push(...R.judgeLive({ counts, insert }));

if (F.length) { console.error(`🔴 someone can be staff by accident:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ nobody is staff by accident: is_internal_user() allow-lists staff roles, profiles_guard_role_trg is on profiles, no public-role policy is \`true\`; the portal client reads 0 staff rows and ${counts.clients} client row, and its ask for role 'owner' was refused (P0001); profiles_guard_role() refuses a workspace on insert (read from its own text, no probe)`);
