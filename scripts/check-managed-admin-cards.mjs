#!/usr/bin/env node
// check-managed-admin-cards.mjs — DRAWS and PRESSES RGA's three managed-client admin cards: step 34 (hours), step 35 (attributes) and step 24 (the kickoff
// answer), plus the shared hours editor they use (approved admin_managed_move_v1 section 3 A to C + admin_step34_hours_v1 + admin_step35_attributes_v1, Chris 11-4).
// RUNS the code: the MANAGED GBP CARDS block of admin/admin.js and shared/hours-editor.js are lifted into a real DOM (jsdom) with a fake server, real
// clicks are dispatched, and what is drawn and what is sent is read back. Nothing here reads a shape from source except where it says so.
// HOLDS:
//   · ONLY A MANAGED CLIENT: mgOn / mgOwns are true for "managed" and false for self-serve, not chosen, an unknown word and nothing; the row's dispatcher
//     (rowStepCardsHtml, lifted and run) draws EXACTLY the old string for steps 34, 35 and 24 in those modes, and the managed cards in managed mode only
//   · HOURS: a week editor started from Google's hours (seven days, holidays, special days), a Source choice that starts UNPICKED, "Told to RGA" needs a
//     note, nothing is sent until both are right and RGA confirms; the request is the editor's own answer + source + note; the press spins; the result
//     line and the card are drawn from the server's READ-BACK (a different value than the one pressed proves it); Undo shows only when there is a change to
//     put back and sends the undo; a server refusal is shown in its own words and nothing reads as done
//   · ATTRIBUTES: only PROVEN details are RGA's ticks (with the proof line); "about you" details are shown and have no control; ones already on Google
//     are shown and never sent; the request names only ticked proven keys; with nothing proven the button is disabled
//   · CALL TRACKING: the kickoff answer needs one of the three answers AND a note before anything is sent; the request is record_answer + note to
//     call-tracking-provision; the recorded answer is drawn from the stored record
//   · THE SERVER'S read ACTION reads and writes nothing, refuses a stranger, an unknown card and an unreachable profile
//   · COPY: US English, no em dashes, no emoji, never the owner's first name, in everything drawn
// Exit 0 = holds · 1 = broken · 2 = can't tell.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
let runs = 0;
const must = (ok, msg) => { runs++; if (!ok) fail(msg); };
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const moved = (what) => { console.error(`⚠️  INDETERMINATE: ${what} moved (scripts/check-managed-admin-cards.mjs). Re-read it before trusting this gate.`); process.exit(2); };

const AJS = read("admin/admin.js"), HE = read("shared/hours-editor.js"), SRV = read("netlify/functions/admin-gbp-details-save.js"), ACSS = read("admin/admin.css");
const s0 = AJS.indexOf("// ═══ MANAGED GBP CARDS START"), s1 = AJS.indexOf("// ═══ MANAGED GBP CARDS END");
if (s0 < 0 || s1 < s0) moved("the MANAGED GBP CARDS block in admin/admin.js");
const BLOCK = AJS.slice(s0, s1);
const r0 = AJS.indexOf("function rowStepCardsHtml(o, s) {"), r1 = AJS.indexOf("\n}\n", r0);
if (r0 < 0 || r1 < r0) moved("rowStepCardsHtml");
const ROWFN = AJS.slice(r0, r1 + 3);
const lh = /^let _hoursHolidays = \[\];/m.exec(AJS); if (!lh) moved("_hoursHolidays");

const CID = "11111111-1111-1111-1111-111111111111";
const HS = "m1.gbp.hours_attributes", AS = "m1.gbp.attributes", CS = "m1.tracking.call_setup";
const TITLES = { "m1.gbp.hours_attributes": "Confirm hours", "m1.gbp.attributes": "Fill ALL relevant GBP attributes" };
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const HOURS_DAYS = Object.fromEntries(DAYS.map((d) => [d, ["sat", "sun"].includes(d) ? { closed: true } : { open: "08:00", close: "17:00" }]));
const HOLS = [{ key: "thanksgiving", label: "Thanksgiving" }, { key: "christmas_eve", label: "Christmas Eve" }, { key: "christmas_day", label: "Christmas Day" }];
const OPTIONS = [
  { key: "accepts_reservations", label: "Accepts reservations", group: "Service options", about: false },
  { key: "offers_online_estimates", label: "Online estimates", group: "Service options", about: false },
  { key: "has_wheelchair_accessible_entrance", label: "Wheelchair accessible entrance", group: "Accessibility", about: false },
  { key: "is_owned_by_women", label: "Women-owned", group: "Identity", about: true },
  { key: "identifies_as_veteran_led", label: "Veteran-owned", group: "Identity", about: true },
];
const PROVEN = [{ key: "accepts_reservations", why: "your reservations link is on Google" }];

// ── one page, one fake server ───────────────────────────────────────────────────────────────────────────────────
function world({ mode = "managed", tasks = {}, proven = PROVEN, ticked = ["has_wheelchair_accessible_entrance"], options = OPTIONS } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="host"></div></body>`, { runScripts: "outside-only", url: "https://admin.test/" });
  const w = dom.window, host = w.document.getElementById("host");
  const log = [];            // every fetch: { url, body, busy }
  const srv = {};            // programmable answers
  const st = { selectedClient: { id: CID, portal_mode: mode, business_name: "Acme Plumbing" }, onboardingData: { tasks }, waitCtx: {} };
  const dialogs = []; let dialogAnswer = true, reloads = 0;
  w.state = st;
  w.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    const busy = [...host.querySelectorAll(".is-busy")].map((b) => b.getAttribute("data-mg-put") || b.getAttribute("data-mg-undo") || b.getAttribute("data-mg-record") || "?");
    log.push({ url, body, busy });
    let status = 200, out = { ok: false };
    if (/admin-gbp-details-save/.test(url) && body.action === "read") out = body.step === "hours" ? { ok: true, step: "hours", now: { days: HOURS_DAYS, closed: [{ date: "2026-11-26" }], has: true } } : { ok: true, step: "attributes", now: { options, ticked, proven } };
    else if (srv[url]) [status, out] = srv[url](body);
    else if (/admin-gbp-details-save/.test(url) && srv.save) [status, out] = srv.save(body, st);
    return { ok: status < 400, status, json: async () => out };
  };
  w.authHeaders = async () => ({ "Content-Type": "application/json" });
  w.rgaDialog = async (a) => { dialogs.push(a); return dialogAnswer; };
  w.escapeHtml = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  w.escapeAttribute = w.escapeHtml;
  w.rgaSiteChange = { isSiteChangeStep: () => false };
  w.eval(`var OL_G = "<svg data-g></svg>"; var adminGcardWhen = (i) => "Nov 6, 3:00 PM";`);
  w.eval(HE);
  w.eval(fs.readFileSync(path.join(SITE, "shared/portal-mode.js"), "utf8"));   // the real helper → window.rgaPortalMode
  // the stubs for everything rowStepCardsHtml calls that this block doesn't own
  const names = [...new Set([...ROWFN.matchAll(/(?<![.\w])([A-Za-z_]\w*)\(/g)].map((m) => m[1]))].filter((n) => !/^(mg|if|for|function|return)/.test(n) && !(n in w));
  w.eval([...new Set([...ROWFN.matchAll(/(?<![.\w"'])([A-Z][A-Z0-9_]{2,})\b(?!["'])/g)].map((m) => m[1]))].map((n) => `var ${n} = "__stub_${n}__";`).join("\n"));
  w.eval(names.map((n) => `var ${n} = function ${n}() { return "[${n}]"; };`).join("\n"));
  w.eval(`var _hoursHolidays = ${JSON.stringify(HOLS)}; var renderOnboardingChecklist = () => window.__redraw(); var reloadScopeAndRerender = async () => window.__reload();`);
  w.__reload = async () => { reloads++; w.__redraw(); };
  w.eval(`${BLOCK}\n${ROWFN}\nwindow.__mg = { mgOn, mgOwns, _mg, mgHoursCardHtml, mgAttrsCardHtml, mgCallAnswerHtml, rowStepCardsHtml };`);
  let which = HS;
  w.__redraw = () => { host.innerHTML = w.__mg.rowStepCardsHtml({ flowId: which, clientLabel: "x", t: TITLES[which] || "" }, { task: st.onboardingData.tasks[which] }); };
  return { w, host, log, srv, st, dialogs, setAnswer: (v) => { dialogAnswer = v; }, reloads: () => reloads, show(id) { which = id; w.__redraw(); },
    q: (s) => host.querySelector(s), qa: (s) => [...host.querySelectorAll(s)], text: () => host.textContent,
    wait: async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((r) => w.setTimeout(r, 15)); },
    set(el, v) { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); },
    pick(el) { el.checked = true; el.dispatchEvent(new w.Event("change", { bubbles: true })); },
    click(el) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); } };
}
const writes = (W) => W.log.filter((c) => /admin-gbp-details-save|call-tracking-provision/.test(c.url) && c.body && c.body.action !== "read");
const allHtml = [];
const track = (W) => allHtml.push(W.host.innerHTML);

try {
  // ═══ 1 · ONLY A MANAGED CLIENT ══════════════════════════════════════════════════════════════════════════════════
  for (const mode of [null, "self_serve", "bogus", "Managed", ""]) {
    const W = world({ mode }); const M = W.w.__mg;
    must(M.mgOn() === false, `mode ${JSON.stringify(mode)}: mgOn() is true`);
    must(!M.mgOwns(HS) && !M.mgOwns(AS), `mode ${JSON.stringify(mode)}: mgOwns is true for the hours or attributes step`);
    for (const id of [HS, AS]) must(M.rowStepCardsHtml({ flowId: id }, { task: {} }) === "", `mode ${JSON.stringify(mode)}: step ${id} draws something (it drew nothing before)`);
    must(M.rowStepCardsHtml({ flowId: CS }, { task: { client_choice: "rga_sets_up" } }) === "[callTrackingAdminHtml]", `mode ${JSON.stringify(mode)}: step 24 draws something besides the old card`);
    must(M.rowStepCardsHtml({ flowId: CS }, { task: {} }) === "[callTrackingAdminHtml]", `mode ${JSON.stringify(mode)}: step 24 (no choice) draws something besides the old card`);
    await W.wait(); must(W.log.length === 0, `mode ${JSON.stringify(mode)}: a non-managed client's admin made a request (${W.log.length})`);
  }
  { const W = world({ mode: "managed" }); const M = W.w.__mg;
    must(M.mgOn() === true && M.mgOwns(HS) && M.mgOwns(AS), "managed: mgOn / mgOwns are not true");
    must(!M.mgOwns("m1.gbp.booking_link") && !M.mgOwns(CS), "managed: mgOwns claims a step it doesn't own");
    must(M.rowStepCardsHtml({ flowId: HS }, { task: {} }).includes("data-mg-card=\"hours\""), "managed: step 34 has no hours card");
    must(M.rowStepCardsHtml({ flowId: AS }, { task: {} }).includes("data-mg-card=\"attributes\""), "managed: step 35 has no attributes card");
    must(M.rowStepCardsHtml({ flowId: CS }, { task: {} }).includes("data-mg-card=\"call\""), "managed: step 24 has no kickoff-answer card");
    must(M.rowStepCardsHtml({ flowId: CS }, { task: { client_choice: "skip" } }).startsWith("[callTrackingAdminHtml]"), "managed: step 24 lost its old card");
    must(M.rowStepCardsHtml({ flowId: "m1.review.first_5" }, { task: {} }) === "[r5AdminHtml]", "managed: another step's card changed"); await W.wait(); }
  // the row's "waiting for the client" card is replaced, only in managed mode
  { const line = AJS.split("\n").find((l) => l.includes("gNotSavedHtml(o.flowId, o) : \"\"}"));
    must(!!line && line.includes("!mgOwns(o.flowId)"), "the 'waiting for the client' card is still drawn for a managed client's hours or attributes step"); }

  // ═══ 2 · HOURS ═════════════════════════════════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [HS]: { status: "pending" } } }); W.show(HS);
    must(/Reading what Google shows/.test(W.text()), "hours: no 'reading' line while Google is being read");
    await W.wait();
    must(W.log.length === 1 && W.log[0].body.action === "read" && W.log[0].body.step === "hours" && W.log[0].body.client_id === CID, "hours: the first thing sent isn't the read");
    must(W.qa("[data-in-day]").length === 7, "hours: the week editor doesn't have seven days");
    must(W.q('[data-in-day="mon"] [data-in-open]').value === "08:00" && W.q('[data-in-day="mon"] [data-in-close]').value === "17:00", "hours: Monday doesn't start from Google's 8 to 5");
    must(W.q('[data-in-day="sat"]').classList.contains("is-closed") && W.q('[data-in-day="sun"]').classList.contains("is-closed"), "hours: the weekend doesn't start closed");
    must(W.qa("[data-in-hol]").length === HOLS.length, "hours: the holiday ticks aren't the published list");
    must(!!W.q("[data-in-oneoff-add]") && !!W.q("[data-oneoff]"), "hours: no special-day (closed day) rows");
    must(/Already closed on Google \(kept\): 2026-11-26/.test(W.text()), "hours: the closed day already on Google isn't shown");
    must(/Starting point: what Google shows today\. RGA changes a day only from what the client told RGA\./.test(W.text()), "hours: the starting-point line (the mockup's words) is missing");
    must(W.qa("[data-mg-source]").length === 2 && W.qa("[data-mg-source]:checked").length === 0, "hours: the Source choice isn't two options starting unpicked");
    must(/From Google/.test(W.text()) && /Told to RGA/.test(W.text()), "hours: the Source options aren't From Google / Told to RGA");
    must(!!W.q("[data-mg-told]"), "hours: no note box for who told RGA");
    must(/Confirm hours/.test(W.text()), "hours: the card isn't titled with the step's own name (read from the playbook, never pasted)");
    must(!!W.q('[data-mg-put="hours"]') && /Put on Google/.test(W.q('[data-mg-put="hours"]').textContent), "hours: no Put on Google button");
    must(!W.q("[data-mg-undo]"), "hours: Undo is offered with nothing to undo");
    must(!!W.q('[data-step-nudge="m1.gbp.hours_attributes"]') && !!W.st.waitCtx[HS], "hours: Ask the client has nothing to open");
    track(W);
    // a press before a source is picked
    W.click(W.q('[data-mg-put="hours"]')); await W.wait();
    must(writes(W).length === 0 && W.dialogs.length === 0, "hours: a press with no source sent something or asked to confirm");
    must(/Pick where these hours came from/.test(W.text()), "hours: no message when the source isn't picked");
    // told, no note
    W.pick(W.qa("[data-mg-source]")[1]); await W.wait();
    must(W.qa("[data-mg-source]:checked").length === 1 && W.q("[data-mg-source]:checked").value === "told", "hours: Told to RGA didn't stay picked after a redraw");
    W.click(W.q('[data-mg-put="hours"]')); await W.wait();
    must(writes(W).length === 0 && W.dialogs.length === 0, "hours: 'Told to RGA' with no note sent something");
    must(/Write down who told RGA these hours and when/.test(W.text()), "hours: no message when the note is empty");
    // an edit survives a redraw (Friday to 4)
    const fri = () => W.q('[data-in-day="fri"] [data-in-close]');
    W.set(fri(), "16:00"); await W.wait(); W.w.__redraw(); must(fri().value === "16:00", "hours: an edit in the editor was lost on a redraw");
    // refused by the server: shown in its own words, nothing reads as done
    W.pick(W.qa("[data-mg-source]")[0]); await W.wait();
    W.srv.save = (b) => [400, { error: "These hours differ from what Google shows. Choose 'the client told RGA' and write down who and when." }];
    W.click(W.q('[data-mg-put="hours"]')); await W.wait();
    must(writes(W).length === 1 && writes(W)[0].body.source === "google", "hours: the source-google press didn't send source google");
    must(/These hours differ from what Google shows/.test(W.text()) && !/Put on Google and read back/.test(W.text()), "hours: a refusal isn't shown in the server's words, or reads as done");
    // RGA says "Not yet" to the confirm: nothing is sent
    W.pick(W.qa("[data-mg-source]")[1]); W.set(W.q("[data-mg-told]"), "owner, on the kickoff call, Nov 6"); await W.wait();
    { const n = writes(W).length; W.setAnswer(false); W.click(W.q('[data-mg-put="hours"]')); await W.wait(); must(writes(W).length === n && W.dialogs.length >= 2, "hours: Put on Google sent something though RGA said 'Not yet'"); W.setAnswer(true); }
    // the real save: told + note
    W.pick(W.qa("[data-mg-source]")[1]); W.set(W.q("[data-mg-told]"), "owner, on the kickoff call, Nov 6"); await W.wait();
    const AFTER = { ...HOURS_DAYS, fri: { open: "08:00", close: "15:30" } };
    W.srv.save = (b, st) => {
      if (b.action === "hours") {
        const push = { state: "on_google", before: HOURS_DAYS, after: AFTER, at: "2026-11-06T15:00:00Z", special: { sent: [{ date: "2026-11-26", name: "Thanksgiving", yearly: true }] } };
        const change = { at: "2026-11-06T15:00:00Z", by: "rga@example.com", field: "hours", source: b.source, told: b.told, before_value: { days: HOURS_DAYS }, undone_at: null };
        st.onboardingData.tasks[HS] = { status: "done", google_push: push, rga_change: change };
        return [200, { ok: true, step_id: HS, push, change }];
      }
      if (b.action === "undo") { const c = st.onboardingData.tasks[HS].rga_change; st.onboardingData.tasks[HS] = { ...st.onboardingData.tasks[HS], rga_change: { ...c, undone_at: "2026-11-06T16:00:00Z", undone_by: "rga@example.com" } }; return [200, { ok: true, step_id: HS, change: {} }]; }
      return [400, { error: "?" }];
    };
    W.click(W.q('[data-mg-put="hours"]')); await W.wait(3);
    const wr = writes(W); const last = wr[wr.length - 1];
    must(wr.length === 2 && last.body.action === "hours" && last.body.source === "told" && last.body.told === "owner, on the kickoff call, Nov 6", "hours: the save didn't send source told + the note");
    must(last.body.client_id === CID && last.url.endsWith("/admin-gbp-details-save"), "hours: the save wasn't sent to admin-gbp-details-save for this client");
    must(last.body.value.days.fri.close === "16:00" && last.body.value.days.mon.open === "08:00" && last.body.value.days.sat.closed === true, "hours: the save didn't carry the editor's week");
    must(Array.isArray(last.body.value.holidays) && Array.isArray(last.body.value.oneOffs), "hours: the save isn't the owner's answer shape (holidays + oneOffs)");
    must(W.dialogs.length >= 2 && W.dialogs.every((d) => d.kind === "confirm" && d.tone === "outward"), "hours: each write wasn't confirmed first");
    must(last.busy.includes("hours"), "hours: the Put on Google button doesn't spin while the request is out");
    must(/3:30 PM/.test(W.text()) && !/4 PM/.test(W.text().replace(/Starting point/g, "")), "hours: the result isn't drawn from the READ-BACK (Google's 3:30 PM)");
    must(/Put on Google and read back: /.test(W.text()), "hours: no read-back line after a save");
    must(/Updated by RGA/.test(W.text()) && /from what the client told RGA: owner, on the kickoff call, Nov 6/.test(W.text()), "hours: the card doesn't say RGA updated it, from what, and who told them");
    must(!!W.q('[data-mg-undo="m1.gbp.hours_attributes"]'), "hours: no Undo after a change");
    must(!!W.q("[data-mg-edit]") && !W.q("[data-mg-source]"), "hours: after a save the card doesn't fold to the summary with Change hours");
    must(/Thanksgiving/.test(W.text()), "hours: the closed day sent isn't shown");
    must(W.reloads() >= 1, "hours: the step record wasn't reloaded after a save");
    track(W);
    // Undo: cancel, then confirm
    W.setAnswer(false); W.click(W.q("[data-mg-undo]")); await W.wait();
    must(writes(W).length === 2, "hours: Undo sent something though RGA said 'Keep it'");
    W.setAnswer(true); W.click(W.q("[data-mg-undo]")); await W.wait(3);
    const u = writes(W)[2];
    must(u && u.body.action === "undo" && u.body.step_id === HS && u.body.client_id === CID, "hours: Undo didn't send undo for the hours step");
    must(u && u.busy.includes(HS), "hours: the Undo button doesn't spin");
    must(!W.q("[data-mg-undo]") && /put back/i.test(W.text()), "hours: after an Undo the button is still offered, or it doesn't say it was put back");
    track(W); }
  // Undo is not offered for a change that kept nothing to put back
  { const W = world({ tasks: { [HS]: { status: "done", google_push: { state: "on_google", after: HOURS_DAYS, at: "2026-11-06T15:00:00Z" }, rga_change: { at: "2026-11-06T15:00:00Z", source: "google", before_value: null, undone_at: null } } } }); W.show(HS); await W.wait();
    must(!W.q("[data-mg-undo]"), "hours: Undo is offered for a change with no stored before-value");
    must(!!W.q("[data-mg-edit]") && /On Google now/.test(W.text()), "hours: a done step doesn't show 'On Google now' + Change hours");
    W.click(W.q("[data-mg-edit]")); await W.wait();
    must(!!W.q("[data-hx]") && !!W.q("[data-mg-cancel]"), "hours: Change hours doesn't open the editor with a Cancel");
    W.click(W.q("[data-mg-cancel]")); await W.wait(); must(!W.q("[data-hx]"), "hours: Cancel doesn't fold the editor"); }
  // a Google read that fails says so, with Try again, and sends nothing
  { const W = world({ tasks: { [HS]: {} } }); const f = W.w.fetch; W.w.fetch = async (u, i) => { W.log.push({ url: u, body: JSON.parse(i.body) }); return { ok: false, status: 503, json: async () => ({ ok: false, error: "This client's Google profile isn't reachable: no connection. Nothing was changed." }) }; };
    W.show(HS); await W.wait();
    must(/isn't reachable/.test(W.text()) && !!W.q("[data-mg-retry]") && !W.q("[data-hx]"), "hours: an unreadable Google profile isn't said, or still offers the editor"); }

  // ═══ 3 · ATTRIBUTES ═════════════════════════════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [AS]: { status: "pending" } } }); W.show(AS); await W.wait();
    must(W.log[0].body.action === "read" && W.log[0].body.step === "attributes", "attributes: the first thing sent isn't the read");
    const boxes = W.qa("[data-mg-tick]");
    must(/Fill ALL relevant GBP attributes/.test(W.text()), "attributes: the card isn't titled with the step's own name");
    must(boxes.length === 1 && boxes[0].value === "accepts_reservations", "attributes: the tickable rows aren't exactly the proven ones");
    const acc = boxes.find((b) => b.value === "accepts_reservations");
    must(acc && acc.checked && !acc.disabled, "attributes: the proven detail isn't RGA's tick, ticked");
    must(/Proved: your reservations link is on Google/.test(W.text()), "attributes: the proof line is missing");
    must(!W.qa("[data-mg-tick]").some((b) => ["is_owned_by_women", "identifies_as_veteran_led", "offers_online_estimates"].includes(b.value)), "attributes: an about-you or unproven detail has a tick");
    must(/Women-owned/.test(W.text()) && /Veteran-owned/.test(W.text()) && (W.text().match(/About the owner\. Only the client says\./g) || []).length === 2, "attributes: the about-you details aren't shown as the client's");
    must(!W.qa(".ob-mg-row.about input, .ob-mg-row.about button").length, "attributes: an about-you row has a control");
    must(/Online appointments" stays off/.test(W.text()), "attributes: the Online appointments note is missing");
    must(/1 of 1 ready/.test(W.text()), "attributes: the count isn't 'ready' proven ones");
    must(!W.q("[data-mg-undo]"), "attributes: Undo offered with nothing to undo");
    W.srv.save = (b, st) => {
      if (b.action === "attributes") { const push = { state: "on_google", before: ["has_wheelchair_accessible_entrance"], after: ["has_wheelchair_accessible_entrance", "accepts_reservations"], at: "2026-11-06T15:00:00Z" };
        const change = { at: "2026-11-06T15:00:00Z", by: "rga@example.com", field: "attributes", source: "proven", told: "accepts_reservations: your reservations link is on Google", before_value: ["has_wheelchair_accessible_entrance"], undone_at: null };
        st.onboardingData.tasks[AS] = { status: "done", google_push: push, rga_change: change }; return [200, { ok: true, step_id: AS, push, change }]; }
      return [400, { error: "?" }];
    };
    W.setAnswer(false); W.click(W.q('[data-mg-put="attributes"]')); await W.wait();
    must(writes(W).length === 0, "attributes: Put ticks sent something though RGA said 'Not yet'");
    W.setAnswer(true); W.click(W.q('[data-mg-put="attributes"]')); await W.wait(3);
    const wr = writes(W);
    must(wr.length === 1 && wr[0].body.action === "attributes" && JSON.stringify(wr[0].body.keys) === JSON.stringify(["accepts_reservations"]) && wr[0].body.client_id === CID, "attributes: the save didn't send exactly the proven, ticked key");
    must(wr[0] && wr[0].busy.includes("attributes"), "attributes: the Put ticks button doesn't spin");
    must(/Put on Google and read back\. Ticked now: .*Accepts reservations/.test(W.text()) && /Wheelchair accessible entrance/.test(W.text().split("Ticked now:")[1] || ""), "attributes: the result isn't drawn from the read-back");
    must(/Updated by RGA/.test(W.text()) && !!W.q('[data-mg-undo="m1.gbp.attributes"]'), "attributes: no 'Updated by RGA' line or Undo after a change");
    track(W); }
  { const W = world({ ticked: ["accepts_reservations"] }); W.show(AS); await W.wait();
    const b = W.qa("[data-mg-tick]"); must(b.length === 1 && b[0].checked && b[0].disabled && /On Google/.test(W.text()), "attributes: a detail already on Google can be re-sent");
    must(W.q('[data-mg-put="attributes"]').disabled && /0 of 1 ready/.test(W.text()), "attributes: Put ticks is enabled with everything proved already on Google"); }
  { const W = world({ proven: [...PROVEN, { key: "offers_online_estimates", why: "a quote form is on the site" }], ticked: ["accepts_reservations"] }); W.show(AS); await W.wait();
    W.srv.save = (b) => [200, { ok: true, push: { after: ["accepts_reservations", "offers_online_estimates"] } }];
    W.click(W.q('[data-mg-put="attributes"]')); await W.wait(3);
    const wr = writes(W); must(wr.length === 1 && JSON.stringify(wr[0].body.keys) === JSON.stringify(["offers_online_estimates"]), `attributes: a detail already on Google was sent again (${JSON.stringify(wr[0] && wr[0].body.keys)})`); }
  // a proven key that is an about-you detail is never a tick (the server already refuses it; the card never offers it)
  { const W = world({ proven: [{ key: "is_owned_by_women", why: "a bad proof" }, ...PROVEN] }); W.show(AS); await W.wait();
    must(!W.qa("[data-mg-tick]").some((b) => b.value === "is_owned_by_women"), "attributes: a proven about-you detail got a tick"); }
  // nothing proven: nothing to put, said plainly
  { const W = world({ proven: [], ticked: [] }); W.show(AS); await W.wait();
    must(W.qa("[data-mg-tick]").length === 0 && /Nothing proves a detail yet/.test(W.text()), "attributes: nothing proven isn't said");
    must(!!W.q('[data-mg-put="attributes"]') && W.q('[data-mg-put="attributes"]').disabled, "attributes: Put ticks is enabled with nothing proven");
    W.click(W.q('[data-mg-put="attributes"]')); await W.wait(); must(writes(W).length === 0, "attributes: a disabled Put ticks sent something"); track(W); }
  // Google offers no yes/no details
  { const W = world({ options: [], proven: [], ticked: [] }); W.show(AS); await W.wait(); must(/Google offers this kind of business no yes\/no details/.test(W.text()), "attributes: a business with no offered details isn't said"); }

  // ═══ 4 · CALL TRACKING: THE KICKOFF ANSWER ═════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [CS]: { status: "pending" } } }); W.show(CS);
    const r = W.qa("[data-mg-answer]");
    must(r.length === 3 && r.map((x) => x.value).join() === "rga_sets_up,already_have,skip", "call: the three answers aren't Sets it up / Already has a provider / No thanks");
    must(/Sets it up/.test(W.text()) && /Already has a provider/.test(W.text()) && /No thanks/.test(W.text()), "call: the answers' words are wrong");
    must(!!W.q("[data-mg-call-note]") && !!W.q('[data-mg-record="call"]'), "call: no note box or Record button");
    must(r.every((x) => !x.checked), "call: an answer starts picked");
    W.click(W.q('[data-mg-record="call"]')); await W.wait();
    must(writes(W).length === 0 && /Pick the client's answer first/.test(W.text()), "call: recorded with no answer");
    W.pick(W.qa("[data-mg-answer]")[0]); await W.wait();
    W.click(W.q('[data-mg-record="call"]')); await W.wait();
    must(writes(W).length === 0 && /Write down who said it and when/.test(W.text()), "call: recorded with no note");
    W.set(W.q("[data-mg-call-note]"), "owner, on the kickoff call, Nov 6"); await W.wait();
    W.srv["/.netlify/functions/call-tracking-provision"] = () => [400, { error: "refused for a test" }];
    W.click(W.q('[data-mg-record="call"]')); await W.wait();
    must(/refused for a test/.test(W.text()) && writes(W).length === 1, "call: a server refusal isn't shown in its words");
    W.srv["/.netlify/functions/call-tracking-provision"] = (b) => { W.st.onboardingData.tasks[CS] = { ...W.st.onboardingData.tasks[CS], rga_recorded_answer: { answer: b.record_answer, note: b.note, at: "2026-11-06T15:00:00Z", by: "rga@example.com" } }; return [200, { ok: true, outcome: "recorded" }]; };
    W.click(W.q('[data-mg-record="call"]')); await W.wait(3);
    const w2 = writes(W), l = w2[w2.length - 1];
    must(l.url === "/.netlify/functions/call-tracking-provision" && l.body.record_answer === "rga_sets_up" && l.body.note === "owner, on the kickoff call, Nov 6" && l.body.client_id === CID, "call: the record isn't record_answer + the answer + the note to call-tracking-provision");
    must(l.busy.includes("call"), "call: the Record button doesn't spin");
    must(!("company_id" in l.body) && !("provider" in l.body), "call: recording an answer also asks for a number");
    must(/Recorded: Sets it up, owner, on the kickoff call, Nov 6\./.test(W.text()), "call: the recorded answer isn't drawn from the stored record");
    track(W); }

  // ═══ 5 · THE SHARED HOURS EDITOR ════════════════════════════════════════════════════════════════════════════════
  { const W = world({}); const H = W.w.rgaHoursEditor; const doc = W.w.document;
    must(H.hoursSummary(HOURS_DAYS) === "Mon–Fri 8 AM–5 PM · Sat–Sun closed", `editor: hoursSummary says "${H.hoursSummary(HOURS_DAYS)}"`);
    must(H.hmSpan("08:00", "17:00") === "8–5" && H.hmSpan("00:00", "23:59") === "24 hours" && H.hmSpan("10:00", "01:00") === "10a–1a", "editor: hmSpan");
    const had = { days: { ...HOURS_DAYS, tue: { open: "08:00", close: "12:00", open2: "13:00", close2: "17:00" } }, holidays: ["thanksgiving"], oneOffs: [{ from: "2026-12-28", to: "2026-12-31", label: "Shutdown week" }] };
    const box = doc.createElement("div"); box.innerHTML = H.hoursFormHtml(had, HOLS); doc.body.appendChild(box); H.hoursBind(doc);
    const got = H.hoursCollect(box.querySelector("[data-hx]"));
    must(JSON.stringify(got.days) === JSON.stringify(had.days), `editor: the week doesn't round trip (${JSON.stringify(got.days.tue)})`);
    must(JSON.stringify(got.holidays) === '["thanksgiving"]' && JSON.stringify(got.oneOffs) === JSON.stringify(had.oneOffs), "editor: holidays or special days don't round trip");
    const click = (s) => box.querySelector(s).dispatchEvent(new W.w.MouseEvent("click", { bubbles: true, cancelable: true }));
    click('[data-in-day="wed"] [data-in-closed]');
    let c = H.hoursCollect(box.querySelector("[data-hx]")); must(c.days.wed.closed === true && !("open" in c.days.wed), "editor: the Open/Closed switch doesn't close a day");
    click('[data-in-day="wed"] [data-in-closed]'); c = H.hoursCollect(box.querySelector("[data-hx]")); must(c.days.wed.closed !== true, "editor: the switch doesn't reopen a day");
    box.querySelector('[data-in-day="mon"] [data-in-close]').value = "18:00"; click("[data-in-copy-mon]");
    c = H.hoursCollect(box.querySelector("[data-hx]")); must(["tue", "wed", "thu", "fri"].every((d) => c.days[d].close === "18:00" && c.days[d].open === "08:00") && c.days.sat.closed, "editor: Copy Monday doesn't copy to Tue to Fri");
    click('[data-in-day="thu"] [data-in-second-add]'); must(!box.querySelector('[data-in-day="thu"] [data-in-second]').hidden, "editor: + 2nd time doesn't open a second opening");
    box.querySelector('[data-in-day="thu"] [data-in-open2]').value = "19:00"; box.querySelector('[data-in-day="thu"] [data-in-close2]').value = "21:00";
    c = H.hoursCollect(box.querySelector("[data-hx]")); must(c.days.thu.open2 === "19:00" && c.days.thu.close2 === "21:00", "editor: a second opening isn't collected");
    click('[data-in-day="thu"] [data-in-second-x]'); c = H.hoursCollect(box.querySelector("[data-hx]")); must(!("open2" in c.days.thu), "editor: removing the second opening keeps it");
    click('[data-in-hol="christmas_day"]'); c = H.hoursCollect(box.querySelector("[data-hx]")); must(c.holidays.join() === "thanksgiving,christmas_day", "editor: a holiday tick isn't collected");
    must(box.querySelector("[data-hol-count]").textContent === "2", "editor: the holiday count doesn't follow the ticks");
    click("[data-in-oneoff-add]"); must(box.querySelectorAll("[data-oneoff]").length === 3, "editor: + Add a closed day doesn't add a row");
    click("[data-oneoff-remove]"); must(box.querySelectorAll("[data-oneoff]").length === 2, "editor: removing a closed day doesn't remove it");
    click("[data-in-appt]"); c = H.hoursCollect(box.querySelector("[data-hx]")); must(c.by_appointment === true && !box.querySelector("[data-in-apptnote]").hidden, "editor: By appointment doesn't set the flag and say what it costs");
    click("[data-in-appt-off]"); c = H.hoursCollect(box.querySelector("[data-hx]")); must(!("by_appointment" in c), "editor: Set hours doesn't turn By appointment off");
    box.querySelector('[data-in-day="fri"] [data-in-open]').value = "00:00"; box.querySelector('[data-in-day="fri"] [data-in-close]').value = "23:59"; box.querySelector('[data-in-day="fri"] [data-in-close]').dispatchEvent(new W.w.Event("input", { bubbles: true }));
    must(!box.querySelector("[data-in-24]").hidden, "editor: a 00:00 to 23:59 day doesn't ask whether someone answers 24 hours");
    box.querySelector("[data-oneoff-from]").value = "2026-12-01"; box.querySelector("[data-oneoff-to]").value = "2026-12-10"; box.querySelector("[data-oneoff-to]").dispatchEvent(new W.w.Event("input", { bubbles: true }));
    must(/temporarily closed/.test(box.textContent), "editor: a closure of a week or more doesn't mention temporarily closed");
    track({ host: box }); }
  // the card the portal draws, extracted: run with plain stand-ins for the card system's primitives
  { const W = world({}); const H = W.w.rgaHoursEditor;
    const kit = { csCard: ({ head, side, body, foot }) => `<div class="card"><b>${head}</b><i>${side}</i>${body}${foot}</div>`, csChips: (l, items) => `<div class="chips">${l}: ${items.map((x) => x[0]).join(" | ")}</div>`, csNote: (h) => `<p>${h}</p>`, csFoot: () => "<foot/>", pcActs: (h) => `<acts>${h}</acts>`, pcDate: () => "Nov 6", monthDay: () => "Nov 26" };
    const html = H.hoursCardHtml(kit, { id: HS }, { client_input: {} }, { after: HOURS_DAYS, at: "2026-11-06T15:00:00Z", special: { sent: [{ name: "Thanksgiving", yearly: true, date: "2026-11-26" }, { name: "Shutdown", date: "2026-12-28" }] } }, "https://maps.test/x");
    must(/Your hours are on Google/.test(html) && (html.match(/class="pm-cs-day/g) || []).length === 7 && /Closed for holidays: Thanksgiving · Nov 26/.test(html) && /Closed once: Shutdown/.test(html) && /data-hours-edit="m1.gbp.hours_attributes"/.test(html), "editor: hoursCardHtml (the card extracted from the portal) doesn't draw the week, the holidays and Change something");
    const ap = H.hoursCardHtml(kit, { id: HS }, { client_input: { by_appointment: true } }, { after: {}, at: "2026-11-06T15:00:00Z" }, ""); must(/By appointment only, on Google/.test(ap), "editor: by appointment isn't said"); }

  // ═══ 6 · THE SERVER'S read ACTION ═══════════════════════════════════════════════════════════════════════════════
  { process.env.SUPABASE_URL = "http://supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    const req = createRequire(path.join(SITE, "netlify/functions/_x.js"));
    const authPath = req.resolve("../../netlify/functions/_auth.js"); req(authPath); const auth = req.cache[authPath].exports;
    let staff = true; auth.requireWorkspaceForClient = async () => (staff ? { email: "rga@example.com", workspaceId: "w" } : { error: { statusCode: 403, body: "{}" } });
    const fn = req("../../netlify/functions/admin-gbp-details-save.js");
    let wrote = 0, readsOf = 0, connectErr = null;
    const tasks = { "m1.gbp.booking_link": { google_push: { state: "on_google", link_type: "url_reservations" } } };
    fn.__useDeps({ supa: async () => { wrote++; return []; }, connectFor: async () => (connectErr ? { error: connectErr } : { token: "t", loc: "locations/1" }),
      readStepRecord: async () => ({ tasks }), writeStepTasks: async () => { wrote++; return null; }, applyForStep: async () => { wrote++; return { state: "on_google" }; },
      readForStep: async (id) => { readsOf++; return id === HS ? { days: HOURS_DAYS, closed: [], has: true } : { options: OPTIONS, ticked: [] }; }, now: () => "2026-11-06T15:00:00Z" });
    const call = async (b) => { const r = await fn.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };
    let r = await call({ action: "read", step: "hours" }); must(r.s === 200 && r.j.ok && r.j.now.days.mon.open === "08:00", "server: read hours didn't return Google's week");
    r = await call({ action: "read", step: "attributes" }); must(r.s === 200 && r.j.now.options.length === OPTIONS.length && JSON.stringify(r.j.now.proven) === JSON.stringify(PROVEN), `server: read attributes didn't return the options + what is proven (${JSON.stringify(r.j.now && r.j.now.proven)})`);
    must(!r.j.now.proven.some((x) => OPTIONS.find((o) => o.key === x.key).about), "server: read says an about-you detail is proven");
    must(wrote === 0, `server: a read wrote something (${wrote})`);
    r = await call({ action: "read", step: "photos" }); must(r.s === 400, "server: read of an unknown card isn't refused");
    connectErr = "no connection"; const before = readsOf; r = await call({ action: "read", step: "hours" }); must(r.s === 503 && /Nothing was changed/.test(r.j.error) && readsOf === before, "server: an unreachable profile isn't said as that, or was read anyway"); connectErr = null;
    staff = false; const b2 = readsOf; r = await call({ action: "read", step: "hours" }); must(r.s === 403 && readsOf === b2, "server: a stranger can read a client's Google profile"); staff = true;
    r = await call({ action: "nonsense" }); must(r.s === 400, "server: an unknown action isn't refused");
    must(wrote === 0, `server: refused reads still wrote (${wrote})`); }

  // ═══ 7 · COPY AND COLLISIONS ═══════════════════════════════════════════════════════════════════════════════════
  { const shown = allHtml.join("\n").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
    must(allHtml.length >= 6, "copy: too little was drawn to check the words");
    must(!/—/.test(shown), "copy: an em dash is drawn");
    must(!/\bChris\b/i.test(shown + BLOCK + HE), "copy: the owner's first name appears");
    must(!/[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2705\u274C\u2728]/u.test(shown), "copy: an emoji is drawn");
    must(!/\b(colour|favourite|organis|centre|cancelled|licence)/i.test(shown), "copy: British spelling is drawn"); }
  { const used = new Set([...BLOCK.matchAll(/ob-mg[\w-]*/g)].map((m) => m[0]));
    must(used.size >= 8 && [...used].every((c) => new RegExp(`\\.${c}\\b`).test(ACSS)), "css: a managed-card class has no rule in admin.css"); }
  // the version stamps: admin's cache-buster moved, and the shared module has its own
  { const idx = read("admin/index.html"); must(/admin\.js\?v=20261106[h-z]/.test(idx), "release: admin.js ?v= isn't bumped to 20261106h or later"); must(/hours-editor\.js\?v=\d+[a-z]/.test(AJS), "release: the shared module has no ?v= of its own"); }
} catch (e) { fail(`the cards threw while being drawn or pressed (a card that throws is a broken card): ${String(e && e.stack || e).slice(0, 500)}`); }

if (F.length) { console.error(`❌ managed admin cards BROKEN (${F.length} of ${runs} checks):`); for (const m of F) console.error("  · " + m); process.exit(1); }
console.log(`✅ managed admin cards hold: ${runs} checks run (hours, attributes and the kickoff answer drawn and pressed in a real DOM; managed only; the shared editor; the server read; copy)`);
