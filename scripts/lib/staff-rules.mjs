// staff-rules.mjs — THE RULES check-no-one-is-staff-by-accident.mjs JUDGES THE LIVE DATABASE BY (11-11). Pure: handed what the database
// said, it returns the problems in words, so the gate proves each rule on fixtures every run and a mutation suite can break them.
// → website docs/supabase/SECURITY_LOCKDOWN_2026-11-11.sql (HOLE 1: is_internal_user() was a deny-list, `role <> 'client'`, so a user
// with NO profile read as staff; HOLE 2: profiles_self_insert/update let a user write their own role).

// policies a public role may hold with `true`, each with its reason (none today: every `true` policy is on service_role)
export const TRUE_POLICY_ALLOW = {
  // "public.some_table.policy_name": "why anyone may read or write every row",
};
const PUBLIC_ROLES = ["public", "authenticated", "anon"];

/** is_internal_user()'s definition → problems. Staff must be an ALLOW-list of roles (`in ('owner', …)`), never "not a client". */
export function judgeInternalFn(def) {
  const p = [];
  const body = String(def || "");
  if (!body.trim()) return ["public.is_internal_user() is missing"];
  const sql = body.replace(/--[^\n]*/g, " ").replace(/\$function\$/g, " ");
  if (!/\bin\s*\(\s*'[a-z_]+'(\s*,\s*'[a-z_]+')*\s*\)/i.test(sql)) p.push("is_internal_user() does not allow-list staff roles with an in ('owner', …) list");
  if (/<>|!=|\bnot\s+in\b|\bis\s+distinct\s+from\b/i.test(sql)) p.push("is_internal_user() decides staff by what a role is NOT (a deny-list): a user with no profile, or a new role, reads as staff");
  if (/\bin\s*\([^)]*'client'/i.test(sql)) p.push("is_internal_user() counts 'client' as staff");
  return p;
}

/** pg_trigger rows for profiles_guard_role_trg → problems */
export function judgeTrigger(rows) {
  const t = (Array.isArray(rows) ? rows : []).find((r) => r && r.tgname === "profiles_guard_role_trg");
  if (!t) return ["the trigger profiles_guard_role_trg is gone: a user can give themselves a staff role"];
  if (!/(^|\.)profiles$/.test(String(t.rel || ""))) return [`profiles_guard_role_trg is on ${t.rel}, not public.profiles`];
  if (t.tgenabled === "D") return ["profiles_guard_role_trg is DISABLED"];
  return [];
}

/** pg_policies rows (roles as text) → problems: a public-role policy whose USING or WITH CHECK is exactly `true` */
export function judgePolicies(rows, allow = TRUE_POLICY_ALLOW) {
  const p = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const roles = String(r.roles || "").replace(/[{}"]/g, "").split(",").map((x) => x.trim());
    if (!roles.some((x) => PUBLIC_ROLES.includes(x))) continue;
    const open = String(r.qual).trim() === "true" || String(r.with_check).trim() === "true";
    if (!open) continue;
    const key = `${r.schemaname}.${r.tablename}.${r.policyname}`;
    if (allow[key] && String(allow[key]).length >= 20) continue;
    p.push(`${key} (${roles.join(",")}, ${r.cmd}) lets ${roles.includes("anon") || roles.includes("public") ? "anyone" : "any signed-in user"} ${r.cmd === "SELECT" ? "read" : "touch"} every row (USING/WITH CHECK true)`);
  }
  return p;
}

/** what the portal client could do → problems. counts: { table: n|null }, insert: { status, code } */
export function judgeLive({ counts, insert }) {
  const p = [];
  for (const t of ["client_notes", "lead_intakes", "brain_knowledge", "fga_report_cache"]) {
    if (counts[t] == null) p.push(`could not read ${t} as the portal client`);
    else if (counts[t] > 0) p.push(`the portal client reads ${counts[t]} row(s) of ${t}: staff-only data is open to a client`);
  }
  if (counts.clients == null) p.push("could not read clients as the portal client");
  else if (counts.clients > 1) p.push(`the portal client reads ${counts.clients} client rows (its own only, at most 1)`);
  if (!insert) p.push("the role probe did not run");
  else if (insert.code !== "P0001") p.push(`a client asking for role 'owner' was ${insert.status >= 200 && insert.status < 300 ? "GIVEN IT" : `answered ${insert.status} ${insert.code || ""}`}, not refused by the guard (P0001)`);
  return p;
}
