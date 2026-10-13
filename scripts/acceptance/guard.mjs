// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE WRITE GUARD for acceptance-walk.mjs — one policy, used by BOTH browsers (admin + portal).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The walk is READ-ONLY. It only clicks toggles, but a page can fire writes on its own (on load, on a
// poll, on opening a step). So every request is classified here, and anything that could write is
// ABORTED and logged as "blocked write: <what>" in the report.
//
// Default: DENY every non-GET request, everywhere. Allowed exceptions are listed below, each one
// verified by reading the code that serves it. Anything not on the list is blocked — an unknown
// POST is treated as a write until someone reads it and adds it here.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Netlify functions that a page calls with a non-GET method but which only READ.
// key = function name; value = predicate on the parsed JSON body (or null = any body).
// 🔴 Add an entry ONLY after reading the function source and confirming no branch writes for that body.
const onlyKeys = (allowed) => (b) => !!b && typeof b === "object" && Object.keys(b).every((k) => allowed.includes(k));
export const READ_ONLY_FN_POSTS = {
  // netlify/functions/admin-messages.js — every branch only GETs client_activity/clients; `scope` picks the view.
  "admin-messages": onlyKeys(["scope"]),
  // netlify/functions/client-facts.js — POST {client_id} returns the card; it WRITES only when the body
  // carries answers / ask / answer_question / confirm.
  "client-facts": onlyKeys(["client_id"]),
  // portal-thread.js — {client_id} reads the thread; `mark_read_at` PATCHes messages_seen_at (stays blocked).
  "portal-thread": onlyKeys(["client_id"]),
  // portal-get-contracts.js / portal-get-audit-snapshot.js — no write path at all (GET-only supa calls).
  "portal-get-contracts": onlyKeys(["client_ids"]),
  "portal-get-audit-snapshot": onlyKeys(["client_ids"]),
  // portal-deliverables.js — writes (saveRecord/logActivity) only when action_answer or decision is present.
  "portal-deliverables": onlyKeys(["client_id", "monthly"]),
  // portal-review-requests.js — writes only when `sent` is present.
  "portal-review-requests": onlyKeys(["client_id"]),
  // client-change-history.js → _change-ledger.historyFor: GET client_change_log only (recordChange is not reachable).
  "client-change-history": onlyKeys(["client_id", "limit", "surface"]),
};

// Writes the pages cannot load without, answered with an empty 204 instead of being sent — so the
// page proceeds and nothing is written.
// claim_client_portal_access (docs/supabase/RGA_CLIENT_PORTAL_PATCH.sql) UPDATEs client_portal_access
// (auth_user_id, invite_status, last_login_at); portal.js throws "Something went wrong" if it errors.
// The test client's row is already claimed, so skipping it changes no read.
const STUB_RPCS = new Set(["claim_client_portal_access"]);

// GET endpoints that are known to have SIDE EFFECTS (start an OAuth flow, send, push). Blocked even
// though they are GETs. Kept short and explicit.
const SIDE_EFFECT_GET_FNS = new Set([
  "oauth-google-init", "oauth-rga-init",
]);

// Hosts the walk must never talk to with anything but a read.
const NEVER_HOSTS = [/stripe\.com$/i, /googleapis\.com$/i, /calendar\.google\.com$/i, /mail\.google\.com$/i];

function fnNameOf(u) {
  const m = u.pathname.match(/^\/\.netlify\/functions\/([^/?#]+)/);
  return m ? m[1] : null;
}

function bodyAction(postData) {
  if (!postData) return "";
  try { const j = JSON.parse(postData); return j && typeof j === "object" ? String(j.action || j.op || j.mode || "") : ""; }
  catch { return ""; }
}

/**
 * Decide one request. Returns { allow: boolean, stub?: true, label?: string, kind?: string }.
 * stub = answer it with an empty 204 locally (the write is not sent).
 * `label` is what the report prints for a blocked request.
 */
export function classify(url, method, postData, { supabaseHost } = {}) {
  let u;
  try { u = new URL(url); } catch { return { allow: true }; }
  method = String(method || "GET").toUpperCase();
  const fn = fnNameOf(u);

  if (fn) {
    if (SAFE_METHODS.has(method)) {
      if (SIDE_EFFECT_GET_FNS.has(fn)) return { allow: false, kind: "function", label: `${method} ${fn} (side-effect GET)` };
      return { allow: true };
    }
    const act = bodyAction(postData);
    const pred = Object.prototype.hasOwnProperty.call(READ_ONLY_FN_POSTS, fn) ? READ_ONLY_FN_POSTS[fn] : undefined;
    if (pred !== undefined) {
      let body = null; try { body = postData ? JSON.parse(postData) : null; } catch { /* not JSON */ }
      if (pred === null || pred(body)) return { allow: true };
    }
    return { allow: false, kind: "function", label: `${method} ${fn}${act ? ` (action: ${act})` : ""}` };
  }

  if (SAFE_METHODS.has(method)) {
    return { allow: true };
  }

  // Supabase: auth token refresh keeps the session alive (no business data written); storage
  // sign/list are reads that happen to be POSTs. Everything else non-GET is a write.
  if (supabaseHost && u.host === supabaseHost) {
    if (u.pathname === "/auth/v1/token") return { allow: true };
    if (/^\/storage\/v1\/object\/(sign|list)\//.test(u.pathname)) return { allow: true };
    const rpc = (u.pathname.match(/^\/rest\/v1\/rpc\/([^/?#]+)/) || [])[1];
    if (rpc && STUB_RPCS.has(rpc)) return { allow: false, stub: true, kind: "supabase", label: `${method} supabase rpc/${rpc}` };
    const what = rpc ? `rpc/${rpc}` : u.pathname.replace(/^\/rest\/v1\//, "table/");
    return { allow: false, kind: "supabase", label: `${method} supabase ${what}` };
  }

  if (NEVER_HOSTS.some((re) => re.test(u.hostname))) {
    return { allow: false, kind: "external", label: `${method} ${u.hostname}${u.pathname}` };
  }

  // Any other non-GET (analytics beacons, third parties) — blocked, reported as external.
  return { allow: false, kind: "external", label: `${method} ${u.hostname}${u.pathname.slice(0, 60)}` };
}
