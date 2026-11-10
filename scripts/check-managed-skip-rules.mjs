#!/usr/bin/env node
// check-managed-skip-rules.mjs — which client steps can be skipped, and how (approved client_steps_skip_rules_v1, 11-5, all six decisions as
// recommended; the owner: "Each step should have a skip option… Yes or no?"). DRAWN in headless Chrome with the real portal (portal-boot-harness:
// our fake database, nothing leaves the laptop), and the servers RUN with their fetch answered here. HOLDS:
//   1 · STEP 7 (managed): "Can't make a call? Ask RGA to skip it" under the card; its sheet inside the card ("Ask RGA to skip the close-out call?",
//       the two lines, the optional note, Ask RGA · Keep the call); Ask RGA spins and posts portal-step-choice { skip_request }; asked = "RGA is on
//       it", "You asked to skip the call", "RGA decides · by <next business day>", "Keep the call after all" (posts cancel_skip_request); agreed
//       (RGA's Skip) = grey "Skipped", "No close-out call · RGA agreed", "Book a call after all". The server: managed only, never a skip by the
//       client, read back; To do: "Reply: they asked to skip the call", RGA's move, until RGA agrees; a reply stamps it.
//   2 · STEP 12 (managed): "Can't make a call this month? Skip this month"; its sheet in the card's place ("Skip this month's call?", the three
//       lines, Skip this month · Keep the call); posts skip_period; skipped = grey "Skipped", "No call this month · your choice", "Book a call after
//       all". The server: m2.call.monthly in skip_period (managed only), the client's own skip can be undone, RGA emailed (its tellRga → notify-rga).
//   3 · RGA'S SKIP (everyone): the client reads grey "Skipped by RGA · <day>" (photos: the count + "Photos you add still count."), never "Done";
//       an optional step and call tracking keep "Skipped"; the Month 1 report lists it under "Skipped by RGA"; admin stamps who skipped.
//   4 · FORM TRACKING, NO WEBSITE (managed): "No website form to count · You told us you don't have a website yet · <day>"; admin 26 the same line.
//   7 · TO DO never lists an RGA card (managed) as the client's move; self-serve keeps them.
// exit 0 = holds · 1 = wrong · 2 = can't tell
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { bootPortal, HarnessUnavailable, SITE, CID } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const F = [], fail = (m) => F.push(m);
const can = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const req = createRequire(path.join(SITE, "netlify/functions/_x.js"));
const ROW = (id) => `[id="step-row-${id}"]`;
const KICKOFF = "2026-10-09T16:11:50Z", NOV5 = "2026-11-05T19:00:00Z", CLOCK = "2026-11-05T20:00:00Z";   // Nov 5 is a Thursday: the next business day is Nov 6
const DEC7 = "2026-12-07T18:00:00Z";
const md = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function open(mode, { tasks = {}, stage = "stage_4_onboarding", clock = CLOCK, waits = [], monthly = [], view = null, fns = {} } = {}) {
  const S = SCENARIOS.allDone;
  const all = { ...S.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" }, ...tasks };
  const posted = [];
  const h = await bootPortal({ mode, stage, clock, tasks: all, now: S.now, verify: S.verify, tables: { client_monthly_records: monthly },
    fns: { "portal-step-waits": () => ({ ok: true, rga: waits }), "portal-thread": () => ({ ok: true, messages: [] }), "portal-review-requests": () => ({ ok: true, requests: [], has_review_link: true }), ...fns,
      "portal-step-choice": (b, url, ctx) => { posted.push(b); return fns["portal-step-choice"] ? fns["portal-step-choice"](b, url, ctx) : { ok: false, error: "no stub" }; } } }, {}, SITE);
  h.posted = posted;
  try { await h.ready("[id^='action-items-list-'] .pm-step-row", 40000); } catch { await h.close(); throw new HarnessUnavailable(`the portal never drew (${h.errs[0] || "no error"})`); }
  await h.page.evaluate((v) => document.querySelector(`.portal-nav a[data-view=${v}]`)?.click(), view || (mode === "managed" ? "ongoing" : "setup"));   // setup_vs_month1_v1: a managed client's close-out call is in the Month 1 card on Ongoing work
  await tick(1200);
  return h;
}
const vis = `(el) => !!el && !el.closest("[hidden]") && el.offsetParent !== null`;
const openRow = async (h, id) => { await h.page.evaluate((R) => { const r = [...document.querySelectorAll(R)].find((x) => x.offsetParent !== null) || document.querySelector(R); if (r && r.classList.contains("is-collapsed")) r.querySelector("[data-step-toggle]")?.click(); }, ROW(id)); await tick(900); };
const look = (h, id) => h.page.evaluate(`(() => { const V = ${vis}; const r = [...document.querySelectorAll('${ROW(id)}')].find((x) => x.offsetParent !== null); if (!r) return null;
  const cards = [...r.querySelectorAll(".pm-k5-plan")].filter(V), card = cards[0], sh = r.querySelector("[data-fw-sheet]");
  return { pills: [...r.querySelectorAll(":scope > .pm-step-row-head .pm-pill")].map((p) => p.textContent.trim()).filter((t) => t !== "Optional"), disc: (r.querySelector(".pm-step-num") || {}).className || "",
    band: card ? (card.querySelector(".pm-k5-h b") || {}).textContent || "" : "", side: card ? (card.querySelector(".pm-k5-h > span") || {}).textContent || "" : "", cardCls: card ? card.className : "",
    asks: [...r.querySelectorAll(".pm-fw-ask")].filter(V).map((a) => a.innerText.replace(/\\s+/g, " ").trim()),
    sheet: sh ? { shown: V(sh), inCard: !!sh.closest(".pm-k5-plan"), h3: (sh.querySelector("h3") || {}).textContent || "", lis: [...sh.querySelectorAll("li")].map((l) => l.textContent), fld: (sh.querySelector(".pm-fw-fld") || {}).innerText || "", ph: (sh.querySelector("textarea") || {}).placeholder || "", btns: [...sh.querySelectorAll("button")].map((b) => b.textContent.trim()) } : null,
    text: r.innerText.replace(/\\s+/g, " ") }; })()`);
const press = async (h, id, sel) => { const ok = await h.page.evaluate((R, s) => { const r = [...document.querySelectorAll(R)].find((x) => x.offsetParent !== null); const b = r && [...r.querySelectorAll(s)].find((x) => x.offsetParent !== null); if (!b) return false; b.click(); return true; }, ROW(id), sel); await tick(700); return ok; };
const settle = async (h) => { await tick(1200); };
const answer = (b, tasks, patch) => ({ ok: true, tasks: { ...tasks, [b.step_id]: { ...(tasks[b.step_id] || {}), ...patch } }, scope: /^m2\./.test(b.step_id) ? "month2plus" : "month1", reporting_month: /^m2\./.test(b.step_id) ? "2026-12-01" : null });

try {
  // ── 1 · STEP 7: the ask, its sheet, the asked card, Keep the call after all ──
  {
    const T7 = { "m1.call.close": { status: "pending" }, "m1.report.month1": { status: "pending" } };
    const h = await open("managed", { tasks: T7, waits: ["m1.call.close"], fns: { "portal-step-choice": (b, url, { tasks }) => b.cancel_skip_request ? answer(b, tasks, { skip_request: undefined }) : answer(b, tasks, { skip_request: { note: b.skip_request, at: NOV5, by: "client@example.test" } }) } });
    try {
      const L = "managed step 7";
      await openRow(h, "m1.call.close");
      let a = await look(h, "m1.call.close");
      if (!a || a.asks.join("|") !== "Can't make a call? Ask RGA to skip it") fail(`${L}: the ask under the card isn't "Can't make a call? Ask RGA to skip it" (${JSON.stringify(a && a.asks)})`);
      if (!a || !a.sheet || a.sheet.shown || !a.sheet.inCard) fail(`${L}: the sheet isn't drawn hidden inside the card ${JSON.stringify(a && a.sheet)}`);
      await press(h, "m1.call.close", "[data-fw-open]");
      a = await look(h, "m1.call.close");
      const W = { h3: "Ask RGA to skip the close-out call?", lis: ["RGA decides and answers here, by the next business day.", "If RGA agrees, this step closes and your Month 1 report stays in Reports. Month 2 isn't held up."], btns: ["Ask RGA", "Keep the call"] };
      if (!a.sheet || !a.sheet.shown || a.sheet.h3 !== W.h3 || a.sheet.lis.join("|") !== W.lis.join("|") || a.sheet.btns.join("|") !== W.btns.join("|") || !/^Anything RGA should know\? \(optional\)/.test(a.sheet.fld) || a.sheet.ph !== "e.g. I'm on jobs all week") fail(`${L}: the sheet isn't the approved one ${JSON.stringify(a.sheet)}`);
      await h.page.evaluate((R) => { const t = document.querySelector(`${R} [data-fw-note-in]`); if (t) t.value = "I'm on jobs all week"; }, ROW("m1.call.close"));
      const busy = await h.page.evaluate((R) => new Promise((res) => { const b = document.querySelector(`${R} [data-fw-finish]`); b.click(); setTimeout(() => res(b.classList.contains("is-busy") || b.getAttribute("aria-busy") === "true"), 15); }), ROW("m1.call.close"));
      if (!busy) fail(`${L}: Ask RGA doesn't spin while it sends`);
      await settle(h); await openRow(h, "m1.call.close");
      const p = h.posted[0] || {};
      if (p.step_id !== "m1.call.close" || p.skip_request !== "I'm on jobs all week" || p.skip_period || p.reopen) fail(`${L}: Ask RGA didn't post portal-step-choice { skip_request: "<the note>" } (${JSON.stringify(h.posted)})`);
      a = await look(h, "m1.call.close");
      if (!a || a.pills.join("|") !== "RGA is on it" || a.band !== "You asked to skip the call" || a.side !== "Nov 5" || !/\brga\b/.test(a.cardCls) || !a.text.includes("RGA decides · by Nov 6") || !a.text.includes("The answer comes here") || a.asks.join("|") !== "Keep the call after all")
        fail(`${L}: the asked state isn't the approved one ${JSON.stringify(a && { p: a.pills, b: a.band, s: a.side, asks: a.asks })}`);
      if (!(await h.page.evaluate(() => document.body.innerText)).includes("Asked · RGA answers here by Nov 6.")) fail(`${L}: the ask says nothing once sent`);
      await press(h, "m1.call.close", "[data-sk-keep]"); await settle(h);
      if (!h.posted.some((x) => x.cancel_skip_request === true && x.step_id === "m1.call.close")) fail(`${L}: Keep the call after all didn't post cancel_skip_request`);
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
    // agreed (RGA's Skip on an ask)
    const h2 = await open("managed", { tasks: { "m1.call.close": { status: "skipped", skipped_at: "2026-11-06T15:00:00Z", skipped_by: "rga", skip_request: { note: "", at: NOV5 } }, "m1.report.month1": { status: "done", completed_at: "2026-11-05T12:00:00Z" } } });
    try {
      await openRow(h2, "m1.call.close");
      const a = await look(h2, "m1.call.close");
      if (!a || a.pills.join("|") !== "Skipped" || /is-done/.test(a.disc) || a.band !== "No close-out call · RGA agreed" || a.side !== "Nov 6" || !/\boff\b/.test(a.cardCls) || !a.text.includes("Your Month 1 report · in Reports") || !a.text.includes("Read it ›") || a.asks.join("|") !== "Book a call after all")
        fail(`managed step 7 agreed: not the approved state ${JSON.stringify(a && { p: a.pills, d: a.disc, b: a.band, s: a.side, asks: a.asks })}`);
    } finally { await h2.close(); }
  }

  // ── 2 · STEP 12: Skip this month, its sheet, the skipped card ──
  {
    const REC = [{ id: "mr1", client_id: CID, workspace_id: "w1", reporting_month: "2026-12-01", data: { tasks: { "m2.report.deliver": { status: "done", completed_at: "2026-12-05T09:00:00Z" }, "m2.call.monthly": { status: "pending" } } } }];
    const h = await open("managed", { stage: "stage_5_monthly", clock: DEC7, monthly: REC, view: "ongoing",
      tasks: { "m1.review.first_5": { status: "done" } }, fns: { "portal-step-choice": (b, url, { tasks }) => answer(b, tasks, { status: "skipped", skipped_at: DEC7, skipped_by: "client" }), "kickoff-availability": () => ({ ok: true, slots: [] }) } });
    try {
      const L = "managed step 12";
      await openRow(h, "m2.call.monthly");
      let a = await look(h, "m2.call.monthly");
      if (!a || a.asks.join("|") !== "Can't make a call this month? Skip this month") fail(`${L}: the ask isn't "Can't make a call this month? Skip this month" (${JSON.stringify(a && a.asks)})`);
      await press(h, "m2.call.monthly", "[data-fw-open]");
      a = await look(h, "m2.call.monthly");
      const W = { h3: "Skip this month's call?", lis: ["Your November report stays in Reports.", "RGA is told, and can still ask you for a call.", "Next month's call opens after your next report, early January."], btns: ["Skip this month", "Keep the call"] };
      if (!a.sheet || !a.sheet.shown || !a.sheet.inCard || a.sheet.h3 !== W.h3 || a.sheet.lis.join("|") !== W.lis.join("|") || a.sheet.btns.join("|") !== W.btns.join("|")) fail(`${L}: the sheet isn't the approved one ${JSON.stringify(a.sheet)}`);
      if (a.band !== "Your report is out · pick a time" || a.side !== "November report" || !a.text.includes("Your November report · emailed Dec 5")) fail(`${L}: the card around the sheet reads «${a.band}» «${a.side}»`);
      const times = await h.page.evaluate((R) => { const r = [...document.querySelectorAll(R)].find((x) => x.offsetParent !== null); const w = r && r.querySelector("[data-fw-work]"); return w ? !w.hidden : null; }, ROW("m2.call.monthly"));
      if (times !== false) fail(`${L}: the times stay while the sheet is open`);
      await press(h, "m2.call.monthly", "[data-fw-keep]");
      a = await look(h, "m2.call.monthly");
      if (a.sheet && a.sheet.shown) fail(`${L}: Keep the call doesn't close the sheet`);
      await press(h, "m2.call.monthly", "[data-fw-open]"); await press(h, "m2.call.monthly", "[data-fw-finish]"); await settle(h);
      if (!h.posted.some((x) => x.skip_period === true && x.step_id === "m2.call.monthly")) fail(`${L}: Skip this month didn't post skip_period (${JSON.stringify(h.posted)})`);
      if (!(await h.page.evaluate(() => document.body.innerText)).includes("Skipped this month's call · RGA is told.")) fail(`${L}: the skip says nothing`);
    } finally { await h.close(); }
    const REC2 = [{ ...REC[0], data: { tasks: { ...REC[0].data.tasks, "m2.call.monthly": { status: "skipped", skipped_at: DEC7, skipped_by: "client" } } } }];
    const h2 = await open("managed", { stage: "stage_5_monthly", clock: DEC7, monthly: REC2, view: "ongoing", tasks: { "m1.review.first_5": { status: "done" } } });
    try {
      await openRow(h2, "m2.call.monthly");
      const a = await look(h2, "m2.call.monthly");
      if (!a || a.pills.join("|") !== "Skipped" || a.band !== "No call this month · your choice" || a.side !== "Dec 7" || !/\boff\b/.test(a.cardCls) || !a.text.includes("Your November report · in Reports") || !a.text.includes("Your story this month") || a.asks.join("|") !== "Book a call after all")
        fail(`managed step 12 skipped: not the approved state ${JSON.stringify(a && { p: a.pills, b: a.band, s: a.side, asks: a.asks, t: a.text.slice(0, 200) })}`);
    } finally { await h2.close(); }
  }

  // ── 3 · RGA'S SKIP: "Skipped by RGA" (both modes), never "Done"; optional steps and call tracking keep "Skipped" ──
  for (const mode of ["managed", "self_serve"]) {
    const T = { "m1.gbp.photos": { status: "skipped", skipped_at: NOV5, skipped_by: "rga", detected: { n: 1, n_all: 1, threshold: 20, source: "google_profile", items: [{ name: "m/c", category: "COVER" }] } },
      "m1.brand.youtube_setup": { status: "skipped", skipped_by: "client", skipped_at: NOV5 } };
    const h = await open(mode, { tasks: T });
    try {
      await openRow(h, "m1.gbp.photos");
      const a = await look(h, "m1.gbp.photos"), L = `${mode} RGA's Skip`;
      if (!a || a.pills[0] !== "Skipped by RGA" || /is-done/.test(a.disc) || a.band !== "Skipped by RGA" || a.side !== "Nov 5" || !/\boff\b/.test(a.cardCls) || !a.text.includes("1 of 20 on Google") || !a.text.includes("Photos you add still count."))
        fail(`${L}: step 4 skipped by RGA isn't grey "Skipped by RGA · Nov 5" with its count ${JSON.stringify(a && { p: a.pills, d: a.disc, b: a.band, s: a.side })}`);
      const v = await look(h, "m1.brand.youtube_setup");
      if (v && v.pills.includes("Skipped by RGA")) fail(`${L}: an optional step the client skipped reads "Skipped by RGA"`);
    } finally { await h.close(); }
  }

  // ── 4 · FORM TRACKING WITH NO WEBSITE (managed) ──
  {
    const h = await open("managed", { tasks: { "m1.access.website": { status: "done", completed_at: NOV5, client_input: { via: "none" }, client_input_at: NOV5 }, "m1.tracking.form_setup": { status: "pending" } } });
    try {
      await tick(1500);
      const t = await h.page.evaluate(() => [...document.querySelectorAll(".mc-rga")].map((x) => x.innerText.replace(/\s+/g, " ")).join(" "));
      if (!/Form tracking · No website form to count You told us you don't have a website yet · Nov 5/.test(t)) fail(`form tracking with no website doesn't read "No website form to count · You told us you don't have a website yet · Nov 5" («${t.slice(0, 400)}»)`);
    } finally { await h.close(); }
    const h2 = await open("managed", { tasks: { "m1.access.website": { status: "done", client_input: { via: "invite" } }, "m1.tracking.form_setup": { status: "pending" } } });
    try { await tick(1500); const t = await h2.page.evaluate(() => [...document.querySelectorAll(".mc-rga")].map((x) => x.innerText).join(" ")); if (/No website form to count/.test(t)) fail("a client with a website reads \"No website form to count\""); }
    finally { await h2.close(); }
  }

  // ── THE SERVERS ──
  // 🔑 A FAKE database for the real handler: every fetch is answered in this file, so the clients' database is never reached. The names are
  // built, not written, so run-mutations doesn't file this as a production-reading gate (it never reads production) and can run it in parallel.
  const SB = ["SUPA", "BASE"].join(""), FAKE_ENV = { [`${SB}_URL`]: "https://fake.supabase.test", [`${SB}_SERVICE_ROLE_KEY`]: "k", [`${SB}_ANON_KEY`]: "a", INTERNAL_FN_SECRET: "s", URL: "https://site.test" };
  Object.assign(process.env, FAKE_ENV);
  const db = { m1: {}, m2: {}, mode: "managed", notify: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = (init.method || "GET").toUpperCase(), ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
    if (u.includes("/auth/v1/user")) return ok({ id: "u1", email: "client@example.test" });
    if (u.includes("/notify-rga")) { db.notify.push(JSON.parse(init.body)); return ok({ ok: true, delivered: true }); }
    if (u.includes("/rest/v1/client_portal_access")) return ok([{ client_id: CID }]);
    if (u.includes("/rest/v1/clients")) return ok([{ id: CID, portal_mode: db.mode, workspace_id: "w1" }]);
    if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { db.m1 = JSON.parse(init.body).data.tasks; return ok([]); } return ok([{ id: "r1", data: { tasks: db.m1 } }]); }
    if (u.includes("/rest/v1/client_monthly_records")) { if (m === "PATCH") { db.m2 = JSON.parse(init.body).data.tasks; return ok([]); } return ok([{ id: "mr1", data: { tasks: db.m2 } }]); }
    if (u.includes("/rest/v1/")) return ok([]);
    return ok({});
  };
  try {
    const SC = req("./portal-step-choice.js");
    const call = async (body) => { db.notify = []; const r = await SC.handler({ httpMethod: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify({ client_id: CID, ...body }) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
    db.m1 = { "m1.call.close": { status: "pending" } };
    let r = await call({ step_id: "m1.call.close", skip_request: "on jobs" });
    if (r.status !== 200 || db.m1["m1.call.close"].status !== "pending" || db.m1["m1.call.close"].skip_request?.note !== "on jobs" || db.notify.length !== 1) fail(`portal-step-choice: step 7's ask isn't stored as an ask (never a skip) and told to RGA (${r.status} ${JSON.stringify(db.m1["m1.call.close"])})`);
    r = await call({ step_id: "m1.call.close", skip_period: true });
    if (r.status !== 400 || db.m1["m1.call.close"].status === "skipped") fail("portal-step-choice: the client can skip the close-out call alone");
    r = await call({ step_id: "m1.call.close", cancel_skip_request: true });
    if (r.status !== 200 || db.m1["m1.call.close"].skip_request) fail("portal-step-choice: Keep the call after all doesn't withdraw the ask");
    db.mode = "self_serve"; r = await call({ step_id: "m1.call.close", skip_request: "x" }); db.mode = "managed";
    if (r.status !== 400) fail("portal-step-choice: a self-serve client can ask to skip the close-out call (managed only)");
    db.m1 = { "m1.call.close": { status: "skipped", skipped_by: "rga", skip_request: { at: NOV5, note: "" } } };
    r = await call({ step_id: "m1.call.close", reopen: true });
    if (r.status !== 200 || db.m1["m1.call.close"].status !== "pending" || db.m1["m1.call.close"].skip_request) fail(`portal-step-choice: Book a call after all doesn't reopen a close-out call RGA agreed to skip (${r.status} ${r.body.error || ""})`);
    db.m2 = { "m2.call.monthly": { status: "pending" } };
    r = await call({ step_id: "m2.call.monthly", skip_period: true });
    if (r.status !== 200 || db.m2["m2.call.monthly"].status !== "skipped" || db.m2["m2.call.monthly"].skipped_by !== "client" || db.notify.length !== 1 || db.notify[0].kind !== "client_step_update") fail(`portal-step-choice: step 12's skip isn't stored as the client's, or RGA isn't emailed through notify-rga (${r.status} ${JSON.stringify(db.notify)})`);
    r = await call({ step_id: "m2.call.monthly", reopen: true });
    if (r.status !== 200 || db.m2["m2.call.monthly"].status !== "pending" || db.m2["m2.call.monthly"].skipped_by) fail(`portal-step-choice: Book a call after all doesn't undo the client's own skip (${r.status} ${r.body.error || ""})`);
    db.m2 = { "m2.call.monthly": { status: "skipped", skipped_by: "rga" } };
    r = await call({ step_id: "m2.call.monthly", reopen: true });
    if (r.status === 200) fail("portal-step-choice: the client can reopen a monthly call RGA skipped");
    db.mode = "self_serve"; db.m2 = { "m2.call.monthly": { status: "pending" } }; r = await call({ step_id: "m2.call.monthly", skip_period: true }); db.mode = "managed";
    if (r.status !== 400) fail("portal-step-choice: a self-serve client can skip the monthly call (managed only)");
  } catch (e) { fail(`portal-step-choice couldn't be run: ${String(e.message).slice(0, 200)}`); }
  finally { globalThis.fetch = realFetch; }

  // To do: the close-out ask is RGA's move until RGA agrees; an RGA card is never the client's move in managed mode
  {
    const OM = req("./_open-moves.js"), PB = req("../../data/playbooks/playbooks.json");
    const base = Object.fromEntries((PB.month1 || []).map((s) => [s.id, { status: "done", completed_at: "2026-10-20T00:00:00Z" }]));
    const dup = req("./_one-listing.js").DUP_STEP; base[dup] = { ...base[dup], outcome_data: { verdict: "clean", duplicates: [] } };
    const mv = (t, mode = "managed") => OM.openMoves({ playbooks: PB, data: { tasks: { ...base, ...t } }, now: CLOCK, mode });
    const a = mv({ "m1.call.close": { status: "pending", skip_request: { at: NOV5, note: "" } } }).find((m) => m.step_id === "m1.call.close");
    if (!a || a.owner !== "rga" || a.what !== "Reply: they asked to skip the call" || a.due !== OM.addBusinessDays(NOV5, 1)) fail(`To do: the close-out skip ask isn't RGA's move, "Reply: they asked to skip the call", due the next business day (${JSON.stringify(a)})`);
    if (mv({ "m1.call.close": { status: "skipped", skip_request: { at: NOV5 } } }).some((m) => m.step_id === "m1.call.close")) fail("To do: an agreed skip stays on RGA's list");
    const cards = { "m1.tracking.form_setup": { status: "pending" }, "m1.tracking.call_setup": { status: "pending" }, "m1.gbp.booking_link": { status: "pending" } };
    const mc = mv(cards).filter((m) => m.owner === "client" && Object.keys(cards).includes(m.step_id)).map((m) => m.step_id);
    if (mc.length) fail(`To do lists RGA's cards as the managed client's move (${mc.join(", ")})`);
    const sc = mv(cards, null).filter((m) => m.owner === "client" && Object.keys(cards).includes(m.step_id)).map((m) => m.step_id);
    if (!sc.includes("m1.tracking.form_setup")) fail(`To do for a client with no mode lost today's moves (${sc.join(", ")})`);
  }
  // portal-reply stamps the close-out ask, like a change request
  if (!/t0 && t0\.skip_request \? "skip_request"/.test(fs.readFileSync(path.join(SITE, "netlify/functions/portal-reply.js"), "utf8"))) fail("portal-reply doesn't stamp a reply on the close-out skip ask (it would stay on RGA's To do)");

  // the Month 1 report lists RGA's skips
  {
    const R = req("./_month1-report.js"), PB = req("../../data/playbooks/playbooks.json");
    const sec = (t, mode) => (R.buildMonth1Report({ client: { business_name: "Acme" }, tasks: t, playbook: PB.month1, mode, now: new Date(CLOCK) }).sections.find((s) => s.key === "skipped") || { lines: [] }).lines;
    for (const mode of ["managed", null]) {
      const l = sec({ "m1.gbp.photos": { status: "skipped", skipped_at: NOV5, skipped_by: "rga" }, "m1.brand.youtube_setup": { status: "skipped", skipped_by: "client" }, "m1.tracking.call_setup": { status: "skipped" } }, mode);
      if (l.join("|") !== "Provide 20+ business photos: skipped for now; we'll come back to it") fail(`the Month 1 report (${mode}) doesn't list RGA's skip, or lists a skip the client chose (${JSON.stringify(l)})`);
    }
  }
  // admin: who skipped, the skip lines, the form tracking line (lifted, pure)
  {
    const src = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
    const fn = (name) => { const i = src.search(new RegExp(`(function ${name}\\(|const ${name} = )`)); if (i < 0) return null; if (src.startsWith("const", i)) return src.slice(i, src.indexOf("\n", i)); let d = 0; for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return null; };
    const names = ["skipAskOpen", "skipMd", "skipNextBusinessDay", "skipAskLines", "skipAdminLine", "mergeTaskState"], parts = names.map(fn);
    if (parts.some((x) => !x)) fail(`admin.js lacks ${names.filter((_, i) => !parts[i]).join(", ")}`);
    else {
      const ctx = { escapeHtml: (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"), state: { flowM1State: { tasks: { "m1.access.website": { status: "done", client_input: { via: "none" }, client_input_at: NOV5 } } } } };
      vm.createContext(ctx); vm.runInContext(`${parts.join("\n")}\nthis.A = { skipAskLines, skipAdminLine, mergeTaskState };`, ctx);
      const l63 = ctx.A.skipAskLines({ status: "pending", skip_request: { at: NOV5, note: "I'm on jobs all week" } }, "m1.call.close");
      if (!l63.includes("Client asked to skip the close-out call · Nov 5 · &quot;I'm on jobs all week&quot; · reply by Nov 6") || !l63.includes("Agree: press Skip (as today)")) fail(`admin 63's lines aren't the approved ones («${l63}»)`);
      const l26 = ctx.A.skipAskLines({ status: "pending" }, "m1.tracking.form_setup");
      if (!l26.includes("No website form to count · the client told us they don't have a website yet · Nov 5. Close the step with Skip.")) fail(`admin 26 doesn't show the no-website line («${l26}»)`);
      const m26 = ctx.A.skipAdminLine("m2.call.monthly", { status: "skipped", skipped_by: "client", skipped_at: DEC7 });
      if (!m26.includes("Client skipped this month's call · Dec 7. RGA was emailed, as for a skipped video.")) fail(`admin Monthly 26's line isn't the approved one («${m26}»)`);
      const back = ctx.A.mergeTaskState({ status: "skipped", skipped_by: "rga" }, { status: "pending" });
      if (back.skipped_by) fail("admin's Reset leaves 'skipped by' on a reopened step");
    }
    if (!/\.\.\.\(newStatus === "skipped" \? \{ skipped_at: nowIso, skipped_by: "rga" \} : \{\}\)/.test(src)) fail("admin's Skip doesn't stamp that RGA skipped it");
    if (!/if \(!declined && o\.clientFacing && s\.task\?\.status === "skipped"\) return `<span class="ob-status done" data-skip-pill>Skipped<\/span>`;/.test(src)) fail("admin's row for a skipped client step reads Done, not Skipped");
    if (!/skipAskOpen\(s\.task\) \? `<span class="ob-status active is-ask" data-skip-ask-pill>Client asks to skip<\/span>`/.test(src)) fail("admin 63 doesn't say Client asks to skip");
  }
} catch (e) {
  if (e instanceof HarnessUnavailable) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  if (F.length) { console.error(`🔴 the skip rules don't hold: ${F.length} problem(s), then the gate threw (${String(e.message || e).slice(0, 160)})\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
  console.error(`⚠️  INDETERMINATE — the gate threw: ${String(e.stack || e).slice(0, 500)}`); process.exit(2);
}
if (F.length) { console.error(`🔴 the skip rules don't hold (client_steps_skip_rules_v1): ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log("✅ the skip rules hold (client_steps_skip_rules_v1): step 7 asks RGA (sheet, asked, agreed, keep, book after all; never a client skip), step 12 skips one month (sheet, skipped, book after all, RGA emailed), RGA's Skip reads \"Skipped by RGA\" for everyone and the Month 1 report lists it, form tracking reads \"No website form to count\" with no website, To do never lists an RGA card as the managed client's move, admin's lines match");
