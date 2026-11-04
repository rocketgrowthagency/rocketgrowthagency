// scripts/lib/managed-surfaces-dump.mjs — RUNS the 8 portal-mode surfaces' server code against fixtures and returns what each one says,
// for one portal mode. Used by check-managed-surfaces-by-mode.mjs (the gate) and for the before/after proof that a self-serve or
// not-chosen client gets byte-identical output to the code before the mode work.
//
// 🔴 `mode` is passed the way the NEW code reads it (the client row's portal_mode / a `mode` argument). Old code ignores both, so the
// same dump runs against the old tree for the baseline.
import { createRequire } from "node:module";
import path from "node:path";

export function dump(WEB, mode) {
  const req = createRequire(path.join(WEB, "netlify/functions/_x.js"));
  process.env.SUPABASE_URL = "http://supabase.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  delete process.env.STEP_REMINDERS_EMAIL;
  const PLAYBOOKS = req("../../data/playbooks/playbooks.json");
  const CS = req("../../data/playbooks/client-steps.json");
  const W = req("./_client-waits");
  const OM = req("./_open-moves");
  const M1R = req("./_month1-report");
  const ON = req("./_onboarding-notes");
  const NSO = req("./notify-step-open");
  const M1 = PLAYBOOKS.month1 || [], M2 = PLAYBOOKS.month2plus || [];
  const out = {};
  const check = (CS.managed && CS.managed.check) || null;

  // _client-waits: every step, nothing finished → the message it would give
  out.waits = {};
  for (const s of [...M1, ...M2]) { const w = W.waitNow(PLAYBOOKS, s, {}, mode, check); out.waits[s.id] = w ? { on: w.on, id: w.id, message: w.message } : null; }
  out.firstStepWords = Object.fromEntries([...M1, ...M2].map((s) => [s.id, W.firstStepWords(s, mode, check)]));

  // _open-moves: a client asked about each step (names the step), and the empty record (waits)
  const at = "2026-10-01T10:00:00.000Z", now = "2026-10-03T10:00:00.000Z";
  out.moves = {};
  for (const s of M1) out.moves[s.id] = OM.openMoves({ playbooks: PLAYBOOKS, data: { tasks: { [s.id]: { client_flagged: { at } } } }, now, mode, check }).filter((m) => m.step_id === s.id).map((m) => m.step);
  const fresh = OM.openMoves({ playbooks: PLAYBOOKS, data: { tasks: {} }, now, mode, check });
  out.freshMoves = fresh.map((m) => ({ kind: m.kind, step: m.step, blocks: m.blocks || null }));
  out.clientMoves = OM.clientMoves(fresh, PLAYBOOKS).map((m) => `${m.step_id}:${m.kind}`);

  // _month1-report: nothing done → the "still open" lines
  const rep = M1R.buildMonth1Report({ client: { business_name: "Acme", portal_mode: mode }, tasks: {}, playbook: M1, months: [], baseline: {}, now: new Date("2026-11-01T12:00:00Z"), mode, check });
  out.report = rep.text;

  // _onboarding-notes: everything done → the day-50 "done so far" list
  const done = Object.fromEntries(M1.map((s) => [s.id, { status: "done" }]));
  out.day50 = ON.day50({ anchorIso: "2026-08-01T00:00:00Z", now: Date.parse("2026-10-01T00:00:00Z"), tasks: done, steps: M1, terms: { known: false }, mode, check });

  // notify-step-open: the letter for each candidate alone, and all together
  out.openEmail = {};
  const cl = { primary_contact_name: "Pat Lee", portal_mode: mode };
  for (const s of NSO.CANDIDATES) out.openEmail[s.id] = NSO.buildEmail(cl, [s], {});
  out.openEmailMany = NSO.buildEmail(cl, NSO.CANDIDATES.slice(0, 3), {});
  return out;
}

// the two HTTP handlers, with auth + Supabase faked: what they store / return for each step
export async function dumpHandlers(WEB, mode) {
  const req = createRequire(path.join(WEB, "netlify/functions/_x.js"));
  process.env.SUPABASE_URL = "http://supabase.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  delete process.env.STEP_REMINDERS_EMAIL;
  delete process.env.RGA_NOTIFICATION_WEBHOOK_URL;
  const authPath = req.resolve("./_auth");
  req(authPath);
  const auth = req.cache[authPath].exports;
  auth.requirePortalOwner = async () => ({ email: "pat@example.com" });
  auth.requirePortalOwnerOrWorkspace = async () => ({ email: "pat@example.com" });
  const PLAYBOOKS = req("../../data/playbooks/playbooks.json");
  const M1 = PLAYBOOKS.month1 || [];
  const realFetch = globalThis.fetch;
  const CID = "11111111-1111-1111-1111-111111111111";
  const out = { message: {}, openMoves: null };
  let stored = null;
  const reply = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj), json: async () => obj });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes("/rest/v1/clients?") && url.includes("portal_mode")) return reply([{ portal_mode: mode }]);
    if (url.includes("/rest/v1/client_activity") && init.method === "POST") { stored = JSON.parse(init.body); return reply([{ id: 1 }]); }
    if (url.includes("/rest/v1/client_onboarding_records")) return reply([{ data: { tasks: { [M1[0].id]: { status: "done" } } } }]);
    if (url.includes("/rest/v1/clients?")) return reply([{ id: CID, portal_mode: mode, primary_market: "Austin, TX" }]);
    return reply([]);
  };
  try {
    const PM = req("./portal-message");
    for (const s of [...M1, ...(PLAYBOOKS.month2plus || [])]) {
      stored = null;
      const r = await PM.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, step_id: s.id, message: "hello", suppress: true }) });
      out.message[s.id] = { status: r.statusCode, where: JSON.parse(r.body).where || null, summary: stored && stored.payload ? stored.payload.summary : null };
    }
    const OMV = req("./portal-open-moves");
    const r = await OMV.handler({ httpMethod: "GET", headers: {}, queryStringParameters: { client_id: CID } });
    out.openMoves = { status: r.statusCode, body: JSON.parse(r.body) };
  } finally { globalThis.fetch = realFetch; }
  return out;
}
