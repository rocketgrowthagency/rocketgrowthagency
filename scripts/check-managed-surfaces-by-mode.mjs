#!/usr/bin/env node
// check-managed-surfaces-by-mode.mjs — the 8 surfaces that print a client step's number say the number of the CLIENT'S portal, and the admin
// switch + RGA-side saves behave (approved client_portal_slim_v1 + admin_managed_move_v1, Chris 11-4). RUNS the code: no source is read for a
// shape, the functions are called with fixtures and what they SAY is checked.
// 🔴 WHY: a managed client was about to be told "step 11" in an email for a step that is step 4 on their screen, and "step 7" in a refusal
// for a row that is part of step 3. A step with no managed number (a "check" row or an RGA "card") must NEVER print a number of its own.
// HOLDS:
//   · SELF-SERVE, NOT CHOSEN, AN UNKNOWN WORD, NOTHING: byte-identical output to each other, and every number printed is today's clientStepNo
//   · MANAGED: a numbered step prints its managed number; a check step points to step 3 "Check what we found" (never its own number); a card
//     and a setup row print no number; the Month 1 report and Day 50 list what the managed client sees; the To do progress counts the 6 steps + step 3
//   · admin-client-portal-mode: validates, stores "not chosen" as null, reads back, says so when it didn't stick, refuses a stranger
//   · admin-gbp-details-save: only proven facts, never an about-you detail, never unticks the client's own, hours only from Google or from
//     what the client told RGA, an Undo that re-applies the stored previous value, nothing marked done unless Google was read back
//   · call-tracking-provision: a managed client's number is bought only on a recorded yes
// Exit 0 = holds · 1 = broken · 2 = can't tell.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { dump, dumpHandlers } from "./lib/managed-surfaces-dump.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let req, cs, M, W;
try {
  req = createRequire(path.join(SITE, "netlify/functions/_x.js"));
  cs = JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/client-steps.json"), "utf8"));
  M = req("../../shared/portal-mode.js"); W = req("../../shared/portal-mode-words.js");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.message).slice(0, 140)}`); process.exit(2); }
const steps = [...cs.month1, ...cs.month2plus];
const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
const check = cs.managed && cs.managed.check;
if (!check || steps.length < 20) { console.error("⚠️  INDETERMINATE: client-steps.json has no managed step 3"); process.exit(2); }
const sel = steps.filter((s) => s.clientStepNo != null).length;
let runs = 0;
const must = (ok, msg) => { runs++; if (!ok) fail(msg); };

// ── fakes: auth (portal owner + RGA workspace), and a tiny Supabase ─────────────────────────────────────────────
process.env.SUPABASE_URL = "http://supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const authPath = req.resolve("../../netlify/functions/_auth.js"); req(authPath);
const auth = req.cache[authPath].exports;
let staff = true;
auth.requireWorkspaceForClient = async () => (staff ? { email: "rga@example.com", workspaceId: "w" } : { error: { statusCode: 403, body: "{}" } });
auth.requireWorkspaceForClientOrInternal = auth.requireWorkspaceForClient;
const CID = "11111111-1111-1111-1111-111111111111";
const realFetch = globalThis.fetch;
const reply = (o, ok = true, status = 200) => ({ ok, status, text: async () => JSON.stringify(o), json: async () => o });

let started = false;
try {
  started = true;
  // ═══ 1 · the surfaces' words, by mode ═══════════════════════════════════════════════════════════════════════════
  const base = dump(SITE, undefined);
  for (const m of [null, "self_serve", "bogus", "Managed", ""]) must(eq(dump(SITE, m), base), `mode ${JSON.stringify(m)} gets different words than a client with no mode: self-serve and not chosen must be identical`);
  const baseH = await dumpHandlers(SITE, undefined);
  for (const m of [null, "self_serve"]) must(eq(await dumpHandlers(SITE, m), baseH), `the message / open-moves handlers say something different for mode ${m}`);

  // every number a self-serve client is told is today's clientStepNo
  for (const s of steps) {
    const w = base.firstStepWords[s.id];
    if (w === undefined) continue;
    must(w === (s.clientStepNo != null ? `Do step ${s.clientStepNo} first.` : "Connect Google first."), `self-serve "${s.id}": the wait words are "${w}", today's number is ${s.clientStepNo}`);
  }
  for (const [id, names] of Object.entries(base.moves)) {
    const s = byId[id]; if (!s || !names.length) continue;
    must(names[0] === `${s.clientStepNo != null ? `Step ${s.clientStepNo} · ` : ""}${s.clientLabel}`, `self-serve open move for ${id} is named "${names[0]}"`);
  }
  must(Object.values(baseH.message).some((m) => /^Step \d+ — /.test(m.where || "")), "self-serve messages lost their step numbers");

  // MANAGED
  // setup_vs_month1_v1 (11-10): a managed client's numbered steps are Getting started (1 to 3). Month 1 work (photos, review asks, videos, the close-out call) has NO number anywhere the client reads, and does not count in To do's progress.
  const M1W = new Set(["m1.gbp.photos", "m1.review.first_5", "m1.brand.youtube_setup", "m1.call.close"]);
  const mg = dump(SITE, "managed"), mgH = await dumpHandlers(SITE, "managed");
  const checkWords = `step ${check.managedStepNo}, ${check.clientLabel}`;
  for (const s of steps) {
    const role = s.managedRole;
    const w = mg.firstStepWords[s.id], msg = mgH.message[s.id];
    if (w !== undefined) {
      if (role === "step" && s.managedStepNo != null && !M1W.has(s.id)) must(w === `Do step ${s.managedStepNo} first.`, `managed "${s.id}": wait words "${w}", managed number ${s.managedStepNo}`);
      if (M1W.has(s.id)) must(!/step \d/i.test(w), `managed Month 1 work "${s.id}" prints a step number in its wait words: "${w}"`);
      if (role === "check") must(w === `Do ${checkWords}, first.`, `managed check "${s.id}": wait words "${w}" should point to ${checkWords}`);
      if (role === "card") must(!/\bstep \d/i.test(w), `managed card "${s.id}" printed a number: "${w}"`);
      if (role === "setup") must(w === "Connect Google first.", `managed setup row "${s.id}": "${w}"`);
    }
    if (msg) {
      if (role === "step") must(msg.where === (s.managedStepNo != null && !M1W.has(s.id) ? `Step ${s.managedStepNo} — ${s.clientLabel}` : `Step: ${s.clientLabel}`), `managed message for ${s.id} says "${msg.where}"`);
      if (role === "check") must(msg.where === `Step ${check.managedStepNo} — ${check.clientLabel} · ${s.clientLabel}`, `managed check message for ${s.id} says "${msg.where}"`);
      if (role === "card" || role === "setup") must(msg.where === `Step: ${s.clientLabel}`, `managed ${role} message for ${s.id} says "${msg.where}" (no number)`);
    }
  }
  for (const [id, names] of Object.entries(mg.moves)) {
    const s = byId[id]; if (!s || !names.length) continue;
    const n = names[0];
    if (s.managedRole === "step") must(n === (M1W.has(id) ? s.clientLabel : `Step ${s.managedStepNo} · ${s.clientLabel}`), `managed move for ${id} named "${n}"`);
    if (s.managedRole === "check") must(n === `Step ${check.managedStepNo} · ${check.clientLabel} · ${s.clientLabel}`, `managed check move for ${id} named "${n}"`);
    if (s.managedRole === "card") must(n === s.clientLabel, `managed card move for ${id} printed a number: "${n}"`);
  }
  // no managed word ever carries a self-serve number that differs from the managed one
  for (const s of steps.filter((x) => x.managedRole === "check" || x.managedRole === "card"))
    must(!(`${mg.firstStepWords[s.id] || ""}`).includes(`step ${s.clientStepNo} `) || s.clientStepNo === check.managedStepNo, `managed "${s.id}" still says its self-serve number ${s.clientStepNo}`);

  // the RGA step a managed client waits on, and who it holds, are named by managed numbers too
  { const labelNo = new Map(steps.map((s) => [s.clientLabel, s.managedRole === "check" ? null : s.managedStepNo]));
    for (const str of mg.freshMoves.flatMap((m) => [m.step, ...(m.blocks || [])])) {
      const mt = new RegExp(`^Step (\\d+) · (?:${String(check.clientLabel || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · )?(.*)$`).exec(str || ""); if (!mt) continue;   // step 3's name from its one home (managed.check)
      const s = steps.find((x) => x.clientLabel === mt[2]); if (!s) continue;
      must(Number(mt[1]) === (s.managedRole === "check" ? check.managedStepNo : s.managedStepNo), `a managed open move says "${str}" (managed number ${s.managedStepNo})`);
    } }

  // the open-email: a managed client's letter
  const mgMail = Object.entries(mg.openEmail);
  must(mgMail.length > 0, "no candidate step produced an open email to check");
  for (const [id, mail] of mgMail) {
    const s = byId[id] || {}; const t = mail.markup;
    if (s.managedRole === "step" && M1W.has(id)) must(!/\b[Ss]tep \d/.test(t), `managed open email for Month 1 work ${id} prints a step number`);
    else if (s.managedRole === "step") must(t.includes(`Step ${s.managedStepNo} in your portal`) || t.includes(`step ${s.managedStepNo} in your portal`) || !s.clientStepNo, `managed open email for ${id} doesn't say step ${s.managedStepNo}`);
    if (s.managedRole === "check") must(t.includes(`Step ${check.managedStepNo}, ${check.clientLabel}`) || t.includes(`step ${check.managedStepNo}, ${check.clientLabel}`), `managed open email for check step ${id} doesn't point to step ${check.managedStepNo}`);
    if (s.managedRole === "card") must(!/\b[Ss]tep \d/.test(t) && !/Open step/.test(t), `managed open email for card ${id} prints a number`);
  }
  must(!/step null|Step null|undefined/i.test(JSON.stringify(mg.openEmail) + JSON.stringify(mg.openEmailMany)), "a managed open email prints null / undefined");

  // the Month 1 report: what the managed client has still to do = step + check rows, not RGA's cards; labels only
  const open = (txt) => ((txt.split(/STILL OPEN[^\n]*\n/i)[1] || "").split(/\n\n/)[0] || "").split("\n").map((l) => l.replace(/^- /, "")).filter(Boolean);
  const skip = /^m1\.(kickoff\.call|call\.close)$/;
  const m1 = cs.month1.filter((s) => !s.clientOptional && !skip.test(s.id));
  // 11-10 (9423486a, the open item "letters read as done work, never orders"): a still-open line is the step's clientCarry when it has one
  // (a noun phrase: "Review asks to your 5 most recent customers"), else its clientLabel. check-reviews-and-close holds the wording itself.
  const PB_CARRY = (() => { const out = {}; try { JSON.stringify(JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/playbooks.json"), "utf8")), (k, v) => { if (v && typeof v.id === "string" && typeof v.clientCarry === "string") out[v.id] = v.clientCarry; return v; }); } catch { console.error("⚠️  INDETERMINATE: playbooks.json does not read"); process.exit(2); } return out; })();
  const carried = (s) => (PB_CARRY[s.id] && PB_CARRY[s.id].trim()) || s.clientLabel;
  const wantMg = m1.filter((s) => ["step", "check"].includes(s.managedRole)).sort((a, b) => (a.managedStepNo ?? check.managedStepNo) - (b.managedStepNo ?? check.managedStepNo)).map(carried);
  const wantSs = m1.filter((s) => s.clientStepNo != null).sort((a, b) => a.clientStepNo - b.clientStepNo).map(carried);
  must(eq(open(mg.report), wantMg), `managed Month 1 report "still open" lists ${JSON.stringify(open(mg.report))}, expected ${JSON.stringify(wantMg)}`);
  must(eq(open(base.report), wantSs), `self-serve Month 1 report "still open" lists ${JSON.stringify(open(base.report))}, expected ${JSON.stringify(wantSs)}`);
  must(!mg.report.split("\n").some((l) => /^- .*\bstep \d/i.test(l)), "the managed Month 1 report prints a step number");

  // Day 50: "done so far" is what that client sees
  const pbM1 = req("../../data/playbooks/playbooks.json").month1;
  const seenAllSs = pbM1.filter((s) => s.clientStepNo != null).length;
  const seenMg = pbM1.filter((s) => ["step", "check", "card"].includes(s.managedRole)).map((s) => s.clientLabel).slice(0, 8);
  const seenSs = pbM1.filter((s) => s.clientStepNo != null).map((s) => s.clientLabel).slice(0, 8);
  must(eq(mg.day50.done, seenMg), `managed Day 50 lists ${JSON.stringify(mg.day50.done)}, expected ${JSON.stringify(seenMg)}`);
  must(eq(base.day50.done, seenSs), `self-serve Day 50 lists ${JSON.stringify(base.day50.done)}, expected ${JSON.stringify(seenSs)}`);

  // the To do progress
  const OM = req("./_open-moves");
  const doneAll = Object.fromEntries(cs.month1.map((s) => [s.id, { status: "done", completed_at: "2026-10-01T00:00:00Z" }]));
  const pg = OM.month1Progress(cs.month1, doneAll, "managed", check), ps = OM.month1Progress(cs.month1, doneAll, null, check);
  const nStep = cs.month1.filter((s) => s.managedRole === "step").length;
  must(mg.day50.done_count === cs.month1.filter((s) => ["step", "check", "card"].includes(s.managedRole)).length && base.day50.done_count === seenAllSs, `Day 50 counts ${mg.day50.done_count} / ${base.day50.done_count} done steps`);
  must(pg.total === 3 && pg.done === pg.total, `managed progress counts ${pg.done}/${pg.total}, expected 3 (Getting started: kickoff, website access, step 3)`);
  must(pg.done_steps.some((d) => d.id === check.id), "managed progress doesn't list step 3 as done when all five checks are");
  const half = { ...doneAll }; delete half[check.covers[0]];
  must(!OM.month1Progress(cs.month1, half, "managed", check).done_steps.some((d) => d.id === check.id), "managed step 3 counts as done with one of its five rows open");
  must(ps.total === cs.month1.filter((s) => s.clientStepNo != null).length && ps.done === ps.total, "self-serve progress changed");
  must(eq(baseH.openMoves.body.month1, OM.month1Progress(req("../../data/playbooks/playbooks.json").month1, { [req("../../data/playbooks/playbooks.json").month1[0].id]: { status: "done" } }, null, null)), "the open-moves handler's self-serve progress differs from the old rule");
  must(mgH.openMoves.body.month1.total === 3, `the managed handler's progress total is ${mgH.openMoves.body.month1.total} (Getting started is 3)`);

  // ═══ 2 · admin: the words and the switch ═══════════════════════════════════════════════════════════════════════
  const adminSrc = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  const fnText = (adminSrc.match(/function clientStepWhere\(o\) \{[\s\S]*?\n\}\n/) || [""])[0];
  const choices = (adminSrc.match(/const PORTAL_MODE_CHOICES = \[[\s\S]*?\n\];/) || [""])[0];
  must(!!fnText && !!choices, "admin.js: can't find clientStepWhere / PORTAL_MODE_CHOICES");
  if (fnText) {
    const run = (mode, step) => new Function("state", "_managedCheck", "globalThis", `${fnText}; return clientStepWhere(${JSON.stringify(step)});`)({ selectedClient: { portal_mode: mode } }, check, { rgaPortalModeWords: W });
    const photo = byId["m1.gbp.photos"], hrs = byId["m1.gbp.hours_attributes"], card = byId["m1.tracking.call_setup"];
    for (const m of [null, "self_serve", undefined]) must(run(m, photo) === `step ${photo.clientStepNo}`, `admin names photos "${run(m, photo)}" for mode ${m}, today's is step ${photo.clientStepNo}`);
    must(run("managed", photo) === null, `admin names photos "${run("managed", photo)}" for a managed client (Month 1 work has no number)`);
    must(run("managed", hrs) === checkWords, `admin names the hours step "${run("managed", hrs)}" for a managed client, expected "${checkWords}"`);
    must(run("managed", card) === null, `admin printed "${run("managed", card)}" for a card`);
  }
  if (choices) {
    const C = new Function(`${choices}; return PORTAL_MODE_CHOICES;`)();
    must(eq(C.map((c) => [c.wire, c.mode]), [["managed", "managed"], ["self_serve", "self_serve"], ["not_chosen", null]]), "the switch's three choices changed");
    must(C.every((c) => M.label(c.mode) === ({ managed: "Managed", self_serve: "Self-serve" }[c.mode] || "Not chosen")), "a switch label disagrees with shared/portal-mode.js label()");
  }

  // admin-client-portal-mode, RUN with a fake database
  { let row = { id: CID, portal_mode: null }, stick = true, acts = [], missingCol = false;
    globalThis.fetch = async (url, init = {}) => {
      url = String(url);
      if (url.includes("/client_activity")) { acts.push(JSON.parse(init.body)); return reply([]); }
      if (!url.includes("/rest/v1/clients?")) return reply([]);
      if (missingCol) return reply({ message: "column clients.portal_mode does not exist", code: "42703" }, false, 400);
      if (init.method === "PATCH") { if (stick) row = { ...row, ...JSON.parse(init.body) }; return reply([]); }
      return reply([{ id: row.id, portal_mode: row.portal_mode }]);
    };
    const H = req("./admin-client-portal-mode").handler;
    const call = async (b) => { const r = await H({ httpMethod: "POST", headers: {}, body: JSON.stringify(b) }); return { code: r.statusCode, ...JSON.parse(r.body) }; };
    let r = await call({ client_id: CID, mode: "managed" }); must(r.code === 200 && r.ok && r.mode === "managed" && row.portal_mode === "managed" && r.label === "Managed", "the switch didn't set managed and read it back");
    r = await call({ client_id: CID, mode: "not_chosen" }); must(r.code === 200 && row.portal_mode === null && r.label === "Not chosen", "the switch stores 'not chosen' as something other than null");
    r = await call({ client_id: CID, mode: "self_serve" }); must(r.code === 200 && row.portal_mode === "self_serve" && r.previous === null, "the switch didn't set self-serve");
    for (const bad of ["Managed", "bogus", "", null, undefined, 1, "null"]) { const before = row.portal_mode; r = await call({ client_id: CID, mode: bad }); must(r.code === 400 && row.portal_mode === before, `the switch accepted ${JSON.stringify(bad)}`); }
    stick = false; r = await call({ client_id: CID, mode: "managed" }); must(r.code === 502 && r.ok !== true, "the switch said ok when the database didn't keep the change"); stick = true;
    staff = false; const before = row.portal_mode; r = await call({ client_id: CID, mode: "managed" }); must(r.code === 403 && row.portal_mode === before, "the switch let a non-staff caller change a mode"); staff = true;
    r = await call({ client_id: "nope", mode: "managed" }); must(r.code === 400, "the switch took a bad client id");
    missingCol = true; r = await call({ client_id: CID, mode: "managed" }); must(r.code === 409 && /not set up/i.test(r.error || ""), "the switch didn't say the column is missing");
    must(acts.length >= 2 && acts.every((a) => a.kind === "portal_mode_changed"), "mode changes aren't written to the activity log");
  }

  // ═══ 3 · RGA-side hours / attributes save with Undo, fake Google ═══════════════════════════════════════════════
  { const D = req("./admin-gbp-details-save");
    const HOURS = "m1.gbp.hours_attributes", ATTRS = "m1.gbp.attributes";
    const day = (o, c) => ({ open: o, close: c });
    const week = (a) => ({ mon: a, tue: a, wed: a, thu: a, fri: a, sat: { closed: true }, sun: { closed: true } });
    const options = [{ key: "accepts_reservations", label: "Accepts reservations", about: false }, { key: "is_women_owned", label: "Women-owned", about: true }, { key: "has_onsite_services", label: "Onsite services", about: false }];
    const mk = (over = {}) => {
      const g = { hours: week(day("08:00", "17:00")), ticked: ["has_onsite_services"], writes: [], failRead: false, dropWrite: false, tasks: { [ATTRS]: {}, [HOURS]: {}, "m1.gbp.booking_link": over.booking || {} }, saved: [] };
      const deps = {
        supa: async () => [],
        connectFor: async () => (over.noConn ? { error: "not connected" } : { token: "t", loc: "locations/1" }),
        readForStep: async (id) => (g.failRead ? Promise.reject(new Error("down")) : id === HOURS ? { days: g.hours, closed: [], has: true } : { options, ticked: g.ticked }),
        applyForStep: async (id, value) => {
          g.writes.push([id, JSON.parse(JSON.stringify(value))]);
          if (g.dropWrite) return { state: "with_rga", error: "Google saved different hours than we sent.", at: "x" };
          if (id === HOURS) { const before = g.hours; g.hours = value.days; return { state: "on_google", before, after: g.hours, at: "x" }; }
          const before = g.ticked; g.ticked = value; return { state: "on_google", before, after: g.ticked, at: "x" };
        },
        readStepRecord: async () => ({ scope: "month1", table: "t", id: 1, client_id: CID, data: { tasks: g.tasks }, tasks: g.tasks, listingTasks: g.tasks }),
        writeStepTasks: async (_s, _r, tasks) => { g.tasks = tasks; g.saved.push(1); return { tasks }; },
        validate: (spec, v) => ({ value: v }), inputSteps: () => ({ [HOURS]: { clientInput: { kind: "hours" } } }),
        now: () => "2026-11-06T10:00:00.000Z",
      };
      D.__useDeps(deps); return g;
    };
    const call = async (b) => { const r = await D.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...b }) }); return { code: r.statusCode, ...JSON.parse(r.body) }; };
    let g = mk();
    let r = await call({ action: "hours", value: { days: week(day("07:00", "16:00")) } }); must(r.code === 400 && !g.writes.length, "hours were saved with no source");
    r = await call({ action: "hours", source: "told", value: { days: week(day("07:00", "16:00")) } }); must(r.code === 400 && !g.writes.length, "told-hours were saved with no note of who told RGA");
    r = await call({ action: "hours", source: "google", value: { days: week(day("07:00", "16:00")) } }); must(r.code === 400 && !g.writes.length, "hours that differ from Google were saved as 'from Google'");
    r = await call({ action: "hours", source: "told", told: "owner, kickoff call Nov 6", value: { days: week(day("07:00", "16:00")) } });
    must(r.code === 200 && r.ok && g.hours.mon.open === "07:00" && g.tasks[HOURS].rga_change && g.tasks[HOURS].rga_change.before_value.days.mon.open === "08:00" && g.tasks[HOURS].rga_change.told.includes("owner"), "a told-hours save didn't write, read back and keep the previous value");
    const w0 = g.writes.length; r = await call({ action: "undo", step_id: HOURS });
    must(r.code === 200 && r.ok && g.hours.mon.open === "08:00" && g.writes.length === w0 + 1 && g.tasks[HOURS].rga_change.undone_at, "Undo didn't put the previous hours back on Google and mark it undone");
    r = await call({ action: "undo", step_id: HOURS }); must(r.code === 409, "a second Undo was allowed");
    g = mk(); r = await call({ action: "undo", step_id: HOURS }); must(r.code === 409 && !g.writes.length, "Undo with nothing to undo wrote to Google");
    // attributes
    g = mk(); r = await call({ action: "attributes", keys: ["is_women_owned"] }); must(r.code === 400 && !g.writes.length && /owner/i.test(r.error || ""), "RGA ticked an about-the-owner detail");
    r = await call({ action: "attributes", keys: ["has_onsite_services"] }); must(r.code === 400 && !g.writes.length, "RGA ticked a detail nothing proves");
    r = await call({ action: "attributes", keys: ["not_offered_by_google"] }); must(r.code === 400 && !g.writes.length, "RGA ticked a detail Google doesn't offer");
    g = mk({ booking: { google_push: { state: "on_google", link_type: "url_reservations" } } });
    r = await call({ action: "attributes", keys: ["accepts_reservations"] });
    must(r.code === 200 && eq([...g.ticked].sort(), ["accepts_reservations", "has_onsite_services"]), `a proven tick lost the client's own ticks or wasn't written: ${JSON.stringify(g.ticked)}`);
    r = await call({ action: "undo", step_id: ATTRS }); must(r.code === 200 && eq(g.ticked, ["has_onsite_services"]), "Undo of an attribute tick didn't restore the earlier set");
    // Google doesn't read back / can't connect / locked
    g = mk(); g.dropWrite = true; r = await call({ action: "hours", source: "told", told: "owner, Nov 6", value: { days: week(day("07:00", "16:00")) } });
    must(r.code === 502 && r.ok !== true && !g.saved.length && !g.tasks[HOURS].rga_change, "a write Google didn't keep was recorded as done");
    g = mk({ noConn: true }); r = await call({ action: "hours", source: "told", told: "x", value: { days: week(day("07:00", "16:00")) } }); must(r.code === 503 && !g.writes.length, "hours were attempted with no Google connection");
    g = mk(); g.failRead = true; r = await call({ action: "hours", source: "told", told: "x", value: { days: week(day("07:00", "16:00")) } }); must(r.code === 503 && !g.writes.length, "hours were written after Google couldn't be read");
    staff = false; g = mk(); r = await call({ action: "hours", source: "told", told: "x", value: { days: week(day("07:00", "16:00")) } }); must(r.code === 403 && !g.writes.length, "a non-staff caller saved hours"); staff = true;
    r = await call({ action: "undo", step_id: "m1.gbp.business_facts" }); must(r.code === 400, "Undo was allowed on a step that is not hours or attributes");
    r = await call({ action: "name", value: "x" }); must(r.code === 400, "an action outside hours / attributes / undo was accepted (name, address, phone and main category must never go this way)");
    D.__useDeps(null);
  }

  // ═══ 3b · the two other readers of a client's mode: admin's To do list (many clients) and the client's Day 50 card ══════════
  { const PBM1 = req("../../data/playbooks/playbooks.json").month1;
    const verify = byId["m1.gbp.verify"];
    const recs = [{ client_id: CID, data: { tasks: { "m1.gbp.verify": { client_flagged: { at: "2026-10-01T00:00:00Z" } } } } }, { client_id: "22222222-2222-2222-2222-222222222222", data: { tasks: { "m1.gbp.verify": { client_flagged: { at: "2026-10-01T00:00:00Z" } } } } }];
    globalThis.fetch = async (url) => {
      url = String(url);
      if (url.includes("/rest/v1/clients?")) return reply([{ id: CID, business_name: "Managed Co", portal_mode: "managed" }, { id: "22222222-2222-2222-2222-222222222222", business_name: "Plain Co", portal_mode: null }]);
      if (url.includes("client_onboarding_records")) return reply(recs);
      return reply([]);
    };
    const AO = req("./admin-open-moves");
    const mv = await AO.movesForWorkspace({ clientId: null, workspaceId: null });
    const nameFor = (cid) => (mv.find((m) => m.client_id === cid && m.step_id === "m1.gbp.verify") || {}).step;
    must(nameFor(CID) === `Step ${check.managedStepNo} · ${check.clientLabel} · ${verify.clientLabel}`, `admin's To do names a managed client's verify move "${nameFor(CID)}"`);
    must(nameFor("22222222-2222-2222-2222-222222222222") === `Step ${verify.clientStepNo} · ${verify.clientLabel}`, `admin's To do names a no-mode client's verify move "${nameFor("22222222-2222-2222-2222-222222222222")}"`);

    const paid = new Date(Date.now() - 55 * 86400000).toISOString();
    const done = Object.fromEntries(PBM1.map((s) => [s.id, { status: "done" }]));
    let cMode = "managed";
    globalThis.fetch = async (url) => {
      url = String(url);
      if (url.includes("/clients?")) return reply([{ id: CID, business_name: "Acme", primary_contact_name: "Pat", primary_contact_email: "p@x.com", portal_mode: cMode }]);
      if (url.includes("client_onboarding_records")) return reply([{ data: { tasks: done } }]);
      if (url.includes("client_invoices")) return reply([{ paid_at: paid }]);
      return reply([]);
    };
    auth.requirePortalOwner = async () => ({ email: "pat@example.com" });
    const ON = req("./portal-onboarding-notes").handler;
    const d50 = async (m) => { cMode = m; const r = await ON({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID }) }); return JSON.parse(r.body).day50; };
    const want = (f) => PBM1.filter(f).map((s) => s.clientLabel).slice(0, 8);
    const dm = await d50("managed"), ds = await d50(null);
    must(dm && eq(dm.done, want((s) => ["step", "check", "card"].includes(s.managedRole))), `the Day 50 card for a managed client lists ${JSON.stringify(dm && dm.done)}`);
    must(ds && eq(ds.done, want((s) => s.clientStepNo != null)), `the Day 50 card for a client with no mode lists ${JSON.stringify(ds && ds.done)}`);
  }

  // ═══ 4 · call tracking: a managed client's number is bought only on a recorded yes ══════════════════════════════
  { let mode = "managed", task = {}, client = { id: CID, business_name: "Acme", identity_phone: "5125550100", primary_market: "Austin, TX", call_tracking_company_id: null };
    const rec = () => ({ id: 7, data: { tasks: { "m1.tracking.call_setup": task } } });
    globalThis.fetch = async (url, init = {}) => {
      url = String(url);
      if (url.includes("/clients?") && url.includes("select=portal_mode")) return reply([{ portal_mode: mode }]);
      if (url.includes("/clients?")) return reply([client]);
      if (url.includes("/client_onboarding_records")) {
        if (init.method === "PATCH") { task = JSON.parse(init.body).data.tasks["m1.tracking.call_setup"]; return reply([]); }
        return reply(url.includes("select=data") || url.includes("select=id") ? [url.includes("select=id") ? { id: 7 } : rec()] : [rec()]);
      }
      return reply([]);
    };
    delete process.env.CALLRAIL_API_KEY; delete process.env.CALLRAIL_ACCOUNT_ID;
    const H = req("./call-tracking-provision").handler;
    const call = async (b) => { const r = await H({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...b }) }); return { code: r.statusCode, ...JSON.parse(r.body) }; };
    let r = await call({}); must(r.code === 409 && /No yes on record/.test(r.error || ""), "a managed client with no recorded answer reached the provider");
    r = await call({ record_answer: "rga_sets_up" }); must(r.code === 400, "an answer was recorded with no note of who said it");
    r = await call({ record_answer: "maybe", note: "owner" }); must(r.code === 400, "an unknown answer was recorded");
    r = await call({ record_answer: "already_have", note: "owner, kickoff call Nov 6" }); must(r.code === 200 && r.recorded.answer === "already_have", "a recorded answer wasn't saved and read back");
    r = await call({}); must(r.code === 400 && /already use call tracking/.test(r.error || ""), "a recorded 'already have' didn't stop RGA creating a second number");
    r = await call({ record_answer: "rga_sets_up", note: "owner, kickoff call Nov 6" }); must(r.code === 200, "couldn't record the yes");
    r = await call({}); must(r.code !== 409 && !/No yes on record/.test(r.error || r.summary || ""), "a recorded yes still didn't let RGA set it up");
    mode = null; task = {}; r = await call({}); must(r.code !== 409, "a client who has no mode is stopped by the managed rule: self-serve keeps today's rule");
    mode = "self_serve"; task = {}; r = await call({}); must(r.code !== 409, "a self-serve client is stopped by the managed rule");
  }
} catch (e) {
  // code under test that THROWS is broken code, not a gate that cannot tell
  if (started) fail(`the code under test threw: ${String(e.stack || e).split("\n").slice(0, 3).join(" | ").slice(0, 300)}`);
  else { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e).slice(0, 400)}`); process.exit(2); }
}
finally { globalThis.fetch = realFetch; }

if (F.length) { console.error(`🔴 managed surfaces by mode: ${F.length} problem(s) of ${runs} checks\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log(`✅ managed surfaces by mode holds: ${runs} checks RUN · self-serve and not chosen identical (${sel} numbered steps) · managed prints managed numbers, step 3 for the five checks, none for cards · admin switch, RGA hours/attributes save + Undo, call-tracking yes`);
