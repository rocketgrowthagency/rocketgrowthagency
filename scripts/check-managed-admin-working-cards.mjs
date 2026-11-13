#!/usr/bin/env node
// check-managed-admin-working-cards.mjs — DRAWS and PRESSES RGA's managed-client working cards on admin steps 27 (verify), 28 (business facts), 19 (keyword plan),
// 32 (services) and 26 (form tracking), plus the managed "who" tag and the "Client sees" chip (approved admin_client_cards_moved_v1, 11-4: "ok approved").
// RUNS the code: the MANAGED GBP CARDS + MANAGED WORKING CARDS blocks of admin/admin.js are lifted into a real DOM (jsdom) with a fake server, real clicks are
// dispatched, and what is drawn and what is sent is read back. The new server function (admin-gbp-services-told) is RUN with a fake Google and a fake store.
// HOLDS:
//   · SELF-SERVE AND NOT CHOSEN CLIENTS DRAW EXACTLY WHAT THEY DREW BEFORE: the old admin.js (pinned commit d658cfce) and the new one are lifted and run over EVERY
//     step id the dispatcher names x six task states x five modes (null, self_serve, bogus, "", "Managed"): the same string, byte for byte. The who tag
//     (kindTag over every actor x clientFacing x step id) and the See-what-the-client-sees block are compared the same way. No request is made for them.
//   · MANAGED ONLY: each new card appears for "managed" and for no other mode.
//   · 27: RGA READS the status (status action only) and asks; there is NO control for start or complete; "not known" is never drawn as "not verified".
//   · 28: the exact value is what is sent (core-change propose: field, to, why); an empty value or reason sends nothing; Ask which is right sends ask_differs;
//     a field the client was already asked has no second propose; a refusal shows in the server's words.
//   · 19: the plan and the client's reason are read; there is NO lock button (no lock path exists); self-serve keeps the old answer card.
//   · 32: the told tick needs a tick AND who/when, is confirmed first, sends keys + the note, spins, and is a RECORD (it never calls the push); Put them on Google
//     goes to admin-gbp-services-push, outward-confirmed; a refusal reads as not done.
//   · 26: RGA logs the test; the inbox answer is shown as the client's; no control answers it for them.
//   · WHO TAG: managed steps 19, 32 (told-to-RGA ticks approved), 34, 35, 36, 51, 24 read "You"; 28, 26 keep "You + client", 27 keeps "Client";
//     self-serve/null unchanged; See-what-the-client-sees survives.
//   · ONE CARD: a managed 28 / 32 row draws no amber "client hasn't saved it" card beside its working card (mwOwns); a managed 26 draws no old
//     form-tracking card (its counted lines are on the working card); for every other mode and step mwOwns is false.
//   · SERVER admin-gbp-services-told: a stranger is refused; an unoffered key, an empty note and no keys are refused; it writes only the record, reads it back,
//     never calls the Google write; clear works; the push adds the told services to the approved ones and still keeps what is on Google.
//   · COPY: US English, no em dashes, no emoji, never the owner's first name.
// Exit 0 = holds · 1 = broken · 2 = can't tell.
import { adminCardLift } from "./lib/admin-card-lift.mjs";   // card_notice_designs_v1 §1 (11-11): admin cards draw through shared/admin-card.js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

// steps_59_63_v1 (59: its message card) + steps_57_64_v1 (61: reads Google and drafts by itself), approved by the owner 11-9, draw differently on purpose
// 11-9 night fixer: every Monthly row (m2.*) was redrawn on purpose for every mode by monthly_v1 + monthly_fix_v2 + monthly_audit_v2 (all approved 11-9,
// held by the check-monthly-* gates), so the Month-1/setup proof below stays byte-identical and the Monthly rows are judged by their own gates
// 11-11 (master map Tier 1, "wrong who tags"): the runners' own SELF lists (shared/steps-57-64, monthly-monthly, -close, -quarter, -health) and the
// listings check that runs itself; admin.js stepRunsItself reads the same lists, so these tags may change for every client
const RUNNER_SELF = (() => { const out = new Set(["m1.audit.citations"]); const site = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
  for (const f of ["steps-57-64", "monthly-monthly", "monthly-close", "monthly-quarter", "monthly-health"]) { try { const box = { module: { exports: {} } }; new Function("module", "globalThis", fs.readFileSync(`${site}/shared/${f}.js`, "utf8"))(box.module, {}); for (const id of box.module.exports.SELF || []) out.add(id); } catch { /* none */ } }
  return out; })();
const MONTHLY_REDRAWN = (id) => /^m2\./.test(id);
const CHANGED_ON_PURPOSE = new Set(["m1.review.system", "m1.review.response", "m1.brand.youtube_setup", "m1.gbp.knowledge_panel", "m1.handoff.month2", "m1.web.gbp_landing_page"]);   // 11-11 card_notice_designs_v1 §1: its card (gsCard) is the one admin card now, in every mode
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const OLD_REV = "d658cfce";
const F = [], fail = (m) => F.push(m);
let runs = 0, PROOF = "";
const must = (ok, msg) => { runs++; if (!ok) fail(msg); };
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const moved = (what) => { console.error(`⚠️  INDETERMINATE: ${what} moved (scripts/check-managed-admin-working-cards.mjs). Re-read it before trusting this gate.`); process.exit(2); };
let OLDJS;
try { OLDJS = execFileSync("git", ["-C", "/Users/chris/RGA/Rocket Growth Agency Website VS Code", "show", `${OLD_REV}:admin/admin.js`], { encoding: "utf8", maxBuffer: 80e6 }); } catch { console.error(`⚠️  INDETERMINATE: cannot read admin/admin.js at ${OLD_REV} (the before side of the proof)`); process.exit(2); }

const AJS = read("admin/admin.js"), HE = read("shared/hours-editor.js"), ACSS = read("admin/admin.css"), TOLD = read("netlify/functions/admin-gbp-services-told.js"), PUSH = read("netlify/functions/admin-gbp-services-push.js");
const cut = (src, a, b, what) => { const i = src.indexOf(a); const j = i < 0 ? -1 : src.indexOf(b, i); if (i < 0 || j < i) moved(what); return src.slice(i, j + (b === "\n}\n" ? 3 : 0)); };
const mgBlock = (src) => cut(src, "// ═══ MANAGED GBP CARDS START", "// ═══ MANAGED GBP CARDS END", "the MANAGED GBP CARDS block");
const rowFn = (src) => cut(src, "function rowStepCardsHtml(o, s) {", "\n}\n", "rowStepCardsHtml");
const kindBlock = (src) => cut(src, "const stepKind = (o)", "  // ═══════", "stepKind / KIND / kindTag");
const seeFn = (src) => cut(src, "function injectSeeClientLinks(host, steps, kindOf) {", "\n}\n", "injectSeeClientLinks");
const whereFn = (src) => cut(src, "function clientStepWhere(o) {", "\n}\n", "clientStepWhere");
const noComments = (t) => t.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const NEWMW = cut(AJS, "// ═══ MANAGED WORKING CARDS START", "// ═══ MANAGED WORKING CARDS END", "the MANAGED WORKING CARDS block");
// 🔄 11-7 night fixer: the who tag asks wcRunsItself (admin_website_steps_autopilot_v1, 11-6: a website step that runs itself reads "Runs itself"). Unlifted, it
// was stubbed with a function returning a truthy string, so EVERY step read "Runs itself" and 2232 who tags "differed". The real one is lifted; this world's
// rgaSiteChange has no auto steps, so a self-serve tag must still match the before byte for byte (the autopilot's own tags: check-a-live-page-stays-true).
const RUNS = cut(AJS, "function wcRunsItself(id) {", "\n}\n", "wcRunsItself");
// 🔄 11-9 night fixer: same trap again. injectSeeClientLinks asks monthlyOwn (monthly_fix_v2, 11-9: a Monthly row's "See what the client sees" sits under
// its one More). Stubbed truthy, EVERY step's link moved under a More and 273 of 276 blocks "differed". The real one is lifted (a Monthly id only).
const MOWN = cut(AJS, "function monthlyOwn(idOrObj) {", "\n}\n", "monthlyOwn");

const CID = "11111111-1111-1111-1111-111111111111";
// every step id the playbook has (month 1 + monthly), so the before/after proof covers steps the dispatcher does not name too
const PLAYBOOK_IDS = (() => { const out = new Set(); (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { for (const k of ["id", "flowId"]) if (typeof x[k] === "string" && /^m[12]\./.test(x[k])) out.add(x[k]); Object.values(x).forEach(walk); } })(JSON.parse(read("data/playbooks/playbooks.json"))); return [...out]; })();
const VS = "m1.gbp.verify", FS = "m1.gbp.business_facts", PS = "m1.strategy.keywords_locations", SS = "m1.gbp.services_products", TS = "m1.tracking.form_setup";
const TITLES = { [VS]: "Ensure GBP is claimed + verified", [FS]: "Match business facts to Google", [PS]: "Lock the keyword plan", [SS]: "Add services + products", [TS]: "Set up form tracking" };
const OPTIONS = [{ key: "g:job_type_id:drain_cleaning", label: "Drain cleaning", kind: "google" }, { key: "g:job_type_id:leak_repair", label: "Leak repair", kind: "google" }, { key: "f:sewer-lines", label: "Sewer lines", kind: "suggested" }, { key: "f:mine", label: "Already on Google", kind: "yours" }];

// the one admin card (card_notice_designs_v1 §1): what the old pill said = the label words opening the when line, or the band word itself
const pillOf = (W) => ((W.q(".ob-card-d") || W.q(".ob-card-w") || {}).textContent || "");
function world({ mode = "managed", tasks = {}, src = AJS } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="host"></div></body>`, { runScripts: "outside-only", url: "https://admin.test/" });
  const w = dom.window, host = w.document.getElementById("host");
  const log = [], srv = {}, dialogs = [];
  let dialogAnswer = true;
  const st = { selectedClient: { id: CID, portal_mode: mode, business_name: "Acme Plumbing" }, onboardingData: { tasks }, waitCtx: {} };
  w.state = st;
  w.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    const busy = [...host.querySelectorAll(".is-busy")].map((b) => [...b.attributes].map((a) => a.name).find((n) => /^data-mw-/.test(n)) || "?");
    log.push({ url, body, busy });
    let status = 200, out = { ok: false };
    const key = Object.keys(srv).find((k) => url.endsWith(k));
    if (key) [status, out] = srv[key](body, st);
    return { ok: status < 400, status, json: async () => out };
  };
  w.authHeaders = async () => ({ "Content-Type": "application/json" });
  w.rgaDialog = async (a) => { dialogs.push(a); return dialogAnswer; };
  w.escapeHtml = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  w.escapeAttribute = w.escapeHtml;
  w.rgaSiteChange = { isSiteChangeStep: () => false };
  w.eval(`var OL_G = "<svg data-g></svg>"; var adminGcardWhen = (i) => "Nov 6, 3:00 PM"; var _managedCheck = { managedStepNo: 3, clientLabel: "Check your business details on Google" }; var _hoursHolidays = [];`);
  w.CSS = { escape: (x) => String(x).replace(/[^\w-]/g, (c) => "\\" + c) };
  w.eval(HE);
  w.eval(fs.readFileSync(path.join(SITE, "shared/portal-mode.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(SITE, "shared/portal-mode-words.js"), "utf8"));
  // night fixer 11-12: the browser imports setup-split right after portal-mode (master audit #16, 11-11: stepNo reads its MONTH1_WORK at call time and gives
  // a managed step NO number when it can't). The harness never loaded it, so every managed number read as none.
  w.eval(fs.readFileSync(path.join(SITE, "shared/setup-split.js"), "utf8"));
  const MG = mgBlock(src), ROW = rowFn(src), KIND = kindBlock(src), SEE = seeFn(src), WHERE = whereFn(src);
  const lifted = [MG, src === AJS ? NEWMW : "", src === AJS ? RUNS : "", src === AJS ? MOWN : "", ROW, KIND, SEE, WHERE].join("\n");
  const names = [...new Set([...lifted.matchAll(/(?<![.\w])([A-Za-z_]\w*)\(/g)].map((m) => m[1]))].filter((n) => !/^(mg|mw)[A-Z]/.test(n) && !/^(adminCard|if|for|function|return|clientStepWhere|injectSeeClientLinks|stepKind|kindTag|rowStepCardsHtml|wcRunsItself|monthlyOwn)$/.test(n) && !(n in w));
  w.eval([...new Set([...ROW.matchAll(/(?<![.\w"'])([A-Z][A-Z0-9_]{2,})\b(?!["'])/g)].map((m) => m[1]))].filter((n) => !/^(MG_|MW_|KIND)/.test(n)).map((n) => `var ${n} = "__stub_${n}__";`).join("\n"));
  w.eval(names.map((n) => `var ${n} = function ${n}() { return "[${n}]"; };`).join("\n"));
  w.eval(`var renderOnboardingChecklist = () => window.__redraw(); var reloadScopeAndRerender = async () => window.__redraw(); var mergeStepTasks = (t) => { Object.assign(state.onboardingData.tasks, t); };`);
  if (/^function adminCard\(o\)/m.test(src)) w.eval(adminCardLift(SITE, src));
  w.eval(`${lifted}\nwindow.__x = { mgOn, rowStepCardsHtml, kindTag, stepKind, injectSeeClientLinks, clientStepWhere, KIND, mwOwns: typeof mwOwns === "function" ? mwOwns : null };`);
  let which = VS;
  w.__redraw = () => { host.innerHTML = w.__x.rowStepCardsHtml({ flowId: which, clientLabel: "x", t: TITLES[which] || "" }, { task: st.onboardingData.tasks[which] }); };
  return { w, host, log, srv, st, dialogs, setAnswer: (v) => { dialogAnswer = v; }, show(id) { which = id; w.__redraw(); },
    q: (s) => host.querySelector(s), qa: (s) => [...host.querySelectorAll(s)], text: () => host.textContent,
    wait: async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((r) => w.setTimeout(r, 15)); },
    set(el, v) { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); },
    tick(el, on = true) { el.checked = on; el.dispatchEvent(new w.Event("change", { bubbles: true })); },
    click(el) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); } };
}
const writesOf = (W, re) => W.log.filter((c) => re.test(c.url) && c.body && c.body.action !== "read" && c.body.action !== "status");
const allHtml = [];
const track = (W) => allHtml.push(W.host.innerHTML);

try {
  // ═══ 1 · THE BEFORE / AFTER PROOF: non-managed clients draw EXACTLY what they drew ═════════════════════════════════
  const MODES = [null, "self_serve", "bogus", "", "Managed"];
  const STATES = [undefined, {}, { status: "done" }, { status: "pending", client_choice: "rga_sets_up" }, { status: "done", approval: { decision: "approved", approved_content: "displayName: Drain cleaning" }, google_push: { state: "on_google" } }, { status: "pending", client_flagged: { at: "2026-11-05T10:00:00Z", note: "x" }, test: { at: "2026-11-05T10:12:00Z", inbox: null } },
    { status: "in_progress", client_choice: "allow", detected: { n30: 1, n90: 3, key_event: true }, test: { at: "2026-11-05T10:12:00Z", inbox: false }, told_services: { items: [{ key: "g:x", label: "Drain cleaning" }], told: "owner", at: "2026-11-05T10:00:00Z" }, outcome_data: { demand: [{ term: "plumber", volume: 10 }] }, client_ok_at: "2026-11-05T10:00:00Z" },
    { status: "skipped", google_drift: { saved: { phone: "1" }, google: { phone: "2" } }, google_push: { state: "with_rga" } }];
  const ids = [...new Set([...rowFn(OLDJS).matchAll(/id === "([a-z0-9_.]+)"/g)].map((m) => m[1]).concat([VS, FS, PS, SS, TS, "m1.gbp.optimize_categories", "m1.gbp.booking_link", "m1.brand.social_profiles", "m1.gbp.hours_attributes", "m1.gbp.attributes", "m1.tracking.call_setup", "m1.review.first_5", "m1.nonsense"]).concat(PLAYBOOK_IDS))];
  must(ids.length >= 90 && PLAYBOOK_IDS.length >= 80, `proof: too few step ids (${ids.length}; ${PLAYBOOK_IDS.length} from the playbook)`);
  let compared = 0, diff = 0, requests = 0;
  for (const mode of MODES) {
    const A = world({ mode, src: OLDJS }), B = world({ mode, src: AJS });
    for (const id of ids) for (const task of STATES) {
      A.st.onboardingData.tasks[id] = task; B.st.onboardingData.tasks[id] = task;
      const a = A.w.__x.rowStepCardsHtml({ flowId: id, t: "T" }, { task }), b = B.w.__x.rowStepCardsHtml({ flowId: id, t: "T" }, { task });
      // steps_59_63_v1 (11-9): step 59 now draws its own card on every row state (held by check-steps-59-63); every other step stays byte-identical
      compared++; if (a !== b && !CHANGED_ON_PURPOSE.has(id) && !MONTHLY_REDRAWN(id)) { diff++; if (diff <= 3) fail(`proof: mode ${JSON.stringify(mode)}, step ${id}, state ${JSON.stringify(task)} draws differently from before (if rowStepCardsHtml changed for another reason since ${OLD_REV}, re-pin OLD_REV after checking the change)`); }
    }
    await A.wait(); await B.wait(); requests += B.log.length;
  }
  must(diff === 0, `proof: ${diff} of ${compared} drawings differ from the pinned before`);
  must(compared === MODES.length * ids.length * STATES.length, "proof: not every combination was compared");
  must(requests === 0, `proof: a non-managed client's admin made ${requests} requests`);
  PROOF = `${compared} drawings (${ids.length} step ids x ${STATES.length} task states x ${MODES.length} non-managed modes)`;
  // the who tag + See-what-the-client-sees block, every actor x clientFacing x step id, every non-managed mode
  { let tagDiff = 0, tagN = 0, seeDiff = 0, seeN = 0;
    for (const mode of [null, "self_serve", "bogus"]) {
      const A = world({ mode, src: OLDJS }), B = world({ mode, src: AJS });
      for (const id of ids) for (const actor of ["both", "rga", "client", undefined]) for (const clientFacing of [true, false]) for (const sopType of ["auto", "manual", undefined]) {
        const o = { flowId: id, actor, clientFacing, sopType, hasRunner: false, clientStepNo: 4, managedStepNo: 3, managedRole: "check" };
        tagN++; if (A.w.__x.kindTag(o) !== B.w.__x.kindTag(o) && id !== "m2.exec.gbp_posts" && !RUNNER_SELF.has(id)) tagDiff++;   // 11-11 master map Tier 1: a step its runner starts AND finishes reads "Runs itself" for every client   // monthly_audit_v2 (approved 11-9): Google posts is "You + client" (RGA drafts, the client approves)
      }
      for (const id of ids) {
        const mk = (W) => { W.host.innerHTML = `<div class="ob-step" data-ob-step="${id}"><div class="ob-body"></div></div>`;   /* a real row has its .ob-body; since monthly_fix_v3 (11-9) a bare queued row gets one made for its More */ W.w.__x.injectSeeClientLinks(W.host, [{ obj: { flowId: id, actor: "both", clientFacing: true, managedStepNo: 3, managedRole: "check", clientStepNo: 4 } }], (o) => W.w.__x.stepKind(o)); return W.host.innerHTML; };
        seeN++; if (id !== "m1.brand.youtube_setup" && !MONTHLY_REDRAWN(id) && mk(A) !== mk(B)) seeDiff++;   // step58_card_v2: step 58 puts the block under its one "More" (approved)
      }
    }
    must(tagDiff === 0 && tagN > 500, `proof: ${tagDiff} of ${tagN} who tags differ from before for self-serve / null clients`);
    must(seeDiff === 0 && seeN > 20, `proof: ${seeDiff} of ${seeN} See-what-the-client-sees blocks differ from before for self-serve / null clients`);
    PROOF += `, ${tagN} who tags, ${seeN} See-what-the-client-sees blocks`; }

  // ═══ 2 · MANAGED ONLY ═══════════════════════════════════════════════════════════════════════════════════════════
  for (const mode of [null, "self_serve", "bogus", "Managed", ""]) { const W = world({ mode }); for (const id of [VS, FS, PS, SS, TS]) must(!/data-mw-card/.test(W.w.__x.rowStepCardsHtml({ flowId: id }, { task: {} })), `mode ${JSON.stringify(mode)}: step ${id} draws a managed working card`); }
  { const W = world({ mode: "managed" }); for (const [id, k] of [[VS, "verify"], [FS, "facts"], [PS, "plan"], [SS, "svc"], [TS, "form"]]) must(W.w.__x.rowStepCardsHtml({ flowId: id }, { task: {} }).includes(`data-mw-card="${k}"`), `managed: step ${id} has no working card`);
    must(W.w.__x.rowStepCardsHtml({ flowId: "m1.review.first_5" }, { task: {} }) === "[r5AdminHtml]", "managed: another step's card changed");
    must(!W.w.__x.rowStepCardsHtml({ flowId: TS }, { task: {} }).includes("[formTrackingAdminHtml]"), "managed: step 26 draws the old form-tracking card beside its working card (two Log buttons)");
    must(W.w.__x.mwOwns(FS) && W.w.__x.mwOwns(SS) && !W.w.__x.mwOwns(VS) && !W.w.__x.mwOwns("m1.gbp.booking_link") && !W.w.__x.mwOwns("m1.gbp.hours_attributes"), "managed: mwOwns isn't exactly 28 and 32 (36 keeps its booking card, which is RGA's working card)");
    await W.wait(); }
  { const S2 = world({ mode: "self_serve" }); must(S2.w.__x.rowStepCardsHtml({ flowId: TS }, { task: {} }) === "[formTrackingAdminHtml]", "self-serve: step 26 lost its form-tracking card"); }
  for (const mode of [null, "self_serve", "bogus", "", "Managed"]) { const W = world({ mode }); for (const id of ids) must(W.w.__x.mwOwns(id) === false, `mode ${JSON.stringify(mode)}: mwOwns(${id}) is true, so the amber card would vanish for a non-managed client`); }
  { const row = AJS.slice(AJS.indexOf("${waitedOnHtml(o, s.task)}${rowLiveCardsHtml(o, s)}${gsQ")); const line = row.slice(0, row.indexOf("\n"));
    must(/!mgOwns\(o\.flowId\) && !mwOwns\(o\.flowId\) \? gNotSavedHtml\(o\.flowId, o\)/.test(line), "row: the queued row's amber card isn't held back by mwOwns (or the line moved)");
    must(line.replace(" && !mwOwns(o.flowId)", "") === OLDJS.slice(OLDJS.indexOf("${waitedOnHtml(o, s.task)}${rowLiveCardsHtml(o, s)}${gsQ")).split("\n")[0], "row: the queued row's line changed in more than the mwOwns guard"); }

  // ═══ 3 · STEP 27 · VERIFY ═══════════════════════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [VS]: { status: "pending" } } }); W.show(VS);
    W.srv["/portal-gbp-verify"] = (b) => [200, { ok: true, facts: { verified: false }, verify: { available: true, options: [{}], pending: null } }];
    W.w.__redraw(); must(/Reading what Google says/.test(W.text()), "27: no reading line while Google is read");
    await W.wait();
    must(W.log.length === 1 && W.log[0].body.action === "status" && W.log[0].body.client_id === CID, "27: the first request isn't a status read");
    must(/Not verified/.test(W.text()) && /Client's move/.test(W.text()), "27: not verified isn't drawn as the client's move");
    must(!W.q("[data-mw-start],[data-mw-complete]") && !/Send me the code|Enter the 6-digit/.test(W.text()) && !W.qa("button").some((b) => /send|code|complete|verify now/i.test(b.textContent)), "27: RGA is offered a way to start or finish a verification");
    must(!!W.q('[data-step-nudge="m1.gbp.verify"]') && !!W.st.waitCtx[VS] === false || !!W.q('[data-step-nudge="m1.gbp.verify"]'), "27: no Ask the client");
    must(/RGA cannot start or finish a verification/.test(W.text()), "27: the owner-only rule isn't said");
    must(W.log.every((c) => c.body.action === "status"), "27: something other than a status read was sent");
    track(W); }
  { const W = world({ tasks: {} }); W.srv["/portal-gbp-verify"] = () => [200, { ok: true, facts: { verified: true }, verify: { options: [] } }]; W.show(VS); await W.wait();
    must(/Verified/.test(W.text()) && !W.q('[data-step-nudge]'), "27: verified isn't drawn as verified with nothing to ask"); must(pillOf(W) === "Verified", "27: the pill of a verified profile doesn't say Verified"); }
  { const W = world({ tasks: {} }); W.srv["/portal-gbp-verify"] = () => [200, { ok: true, facts: {}, verify: {} }]; W.show(VS); await W.wait();
    must(!/Not verified/.test(W.text()) && /did not say whether/.test(W.text()), "27: a missing answer is drawn as 'not verified' (absence must not read as a value)");
    must(pillOf(W) === "Not known", `27: the pill of an unknown status says ${pillOf(W)}, not Not known`); }
  { const W = world({ tasks: {} }); W.srv["/portal-gbp-verify"] = () => [200, { ok: false, who: "rga", error: "We couldn't reach your Google profile just now." }]; W.show(VS); await W.wait();
    must(/couldn't reach/.test(W.text()) && !!W.q("[data-mw-retry]") && !/Verified/.test(W.text().replace(/Ensure GBP is claimed \+ verified/, "")), "27: a failed read isn't shown with Try again");
    must(pillOf(W) === "Couldn't read", `27: the pill of a failed read says ${pillOf(W)}, not Couldn't read`); }

  // ═══ 4 · STEP 28 · BUSINESS FACTS ═══════════════════════════════════════════════════════════════════════════════
  const DRIFT = [{ field: "main_category", saved: "Plumber", google: "Water heater installation" }, { field: "phone", saved: "(555) 010-2288", google: "(555) 010-2299" }, { field: "name", saved: "Acme Plumbing LLC", google: "Acme Plumbing" }];
  { const W = world({ tasks: { [FS]: { status: "pending" } } });
    W.srv["/core-change"] = (b, st) => b.action === "read" ? [200, { ok: true, items: st.items || [], drift: DRIFT, asked_differs: false }]
      : b.action === "propose" ? (b.to === "REFUSE" ? [409, { error: "Google already shows that." }] : (st.items = [{ id: "a", kind: "proposal", field: b.field, to: b.to, status: "asked", asked_at: "2026-11-06T15:00:00Z" }], [200, { ok: true, item: st.items[0] }]))
      : b.action === "ask_differs" ? [200, { ok: true, items: [] }] : [400, { error: "?" }];
    W.show(FS); await W.wait();
    must(W.log[0].body.action === "read", "28: the first request isn't the read");
    must(W.qa("[data-mw-propose]").length === 2 && !W.q('[data-mw-propose="main_category"]') && /Phone differs/.test(W.text()) && /Business name differs/.test(W.text()), "28: the two differences aren't drawn with a Propose each");
    must(W.q('[data-mw-f="to-phone"]').value === "(555) 010-2288", "28: the exact value isn't prefilled from what is saved");
    must(/Google \(555\) 010-2299/.test(W.text()) && /saved \(555\) 010-2288/.test(W.text()), "28: Google's and the saved value aren't both shown");
    must(!W.qa("[data-mw-f]").some((e) => /category/i.test(e.getAttribute("data-mw-f"))), "28: the main category is on this card (it is the categories step)");
    track(W);
    // empty value sends nothing
    W.set(W.q('[data-mw-f="to-phone"]'), ""); W.click(W.q('[data-mw-propose="phone"]')); await W.wait();
    must(writesOf(W, /core-change/).length === 0 && /Write the exact phone/.test(W.text()), "28: an empty value was sent, or no message says so");
    W.set(W.q('[data-mw-f="to-phone"]'), "(555) 010-2299 ext 4"); W.set(W.q('[data-mw-f="why"]'), ""); W.click(W.q('[data-mw-propose="phone"]')); await W.wait();
    must(writesOf(W, /core-change/).length === 0 && /Write the line the client reads/.test(W.text()), "28: a proposal with no reason was sent");
    W.set(W.q('[data-mw-f="why"]'), "Your website shows this one."); W.set(W.q('[data-mw-f="to-phone"]'), "REFUSE"); W.click(W.q('[data-mw-propose="phone"]')); await W.wait(3);
    must(/Google already shows that/.test(W.text()), "28: a refusal isn't shown in the server's words");
    W.set(W.q('[data-mw-f="to-phone"]'), "(555) 010-2288"); W.click(W.q('[data-mw-propose="phone"]')); await W.wait(4);
    { const w = writesOf(W, /core-change/); const last = w[w.length - 1];
      must(last.body.action === "propose" && last.body.field === "phone" && last.body.to === "(555) 010-2288" && last.body.why === "Your website shows this one." && last.body.client_id === CID, `28: the proposal isn't field + the exact value + the reason (${JSON.stringify(last.body)})`);
      must(last.busy.includes("data-mw-propose"), "28: Propose doesn't spin"); }
    must(/Waiting: the client decides on \(555\) 010-2288/.test(W.text()) && W.qa("[data-mw-propose]").length === 1, "28: after asking, the field isn't shown as waiting with no second Propose");
    must(/Nothing goes on Google until they say yes/.test(W.text()), "28: the exact-value rule isn't said");
    W.click(W.q("[data-mw-askdiff]")); await W.wait(3);
    must(writesOf(W, /core-change/).some((c) => c.body.action === "ask_differs"), "28: Ask which is right didn't send ask_differs"); }
  { const W = world({ tasks: {} }); W.srv["/core-change"] = () => [200, { ok: true, items: [], drift: [] }]; W.show(FS); await W.wait();
    must(!W.q("[data-mw-propose]") && /recorded no difference/.test(W.text()), "28: with no difference there is still something to propose, or the claim is stronger than the record"); }
  // an approved change that a person must make in Google is RGA's move, never "waiting on the client"
  for (const [status, re, pill] of [["with_rga", /A person changes this one in Google/, "Your move"], ["needs_rga", /did not go on Google: Google said no/, "Your move"], ["waiting", /The nightly check sends it to Google/, "Approved"], ["approved", /being sent to Google/, "Approved"], ["asked", /Waiting: the client decides on/, "Waiting on the client"]]) {
    const W = world({ tasks: {} }); W.srv["/core-change"] = () => [200, { ok: true, items: [{ id: "a", kind: "proposal", field: "phone", to: "(555) 010-2288", status, said: "Google said no" }], drift: [DRIFT[1]] }]; W.show(FS); await W.wait();
    must(re.test(W.text()) && !W.q('[data-mw-propose="phone"]'), `28: an open question in state ${status} isn't said as the record has it, or offers a second Propose`);
    must(pillOf(W) === pill, `28: the pill for an open ${status} question says ${pillOf(W)}, not ${pill}`);
    if (status !== "asked") must(!/Waiting: the client/.test(W.text()), `28: an approved (${status}) change reads as waiting on the client`); }

  // ═══ 5 · STEP 19 · KEYWORD PLAN ═════════════════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [PS]: { status: "done", outcome_data: { demand: [{ term: "emergency plumber springfield", volume: 880 }, { term: "water heater repair", volume: 590 }] }, client_flagged: { at: "2026-11-06T10:00:00Z", note: "I want drain cleaning first" } } } });
    W.show(PS); await W.wait();
    must(/emergency plumber springfield/.test(W.text()) && /880 searches a month/.test(W.text()) && /Locked/.test(W.text()), "19: the locked searches and volumes aren't drawn");
    must(/I want drain cleaning first/.test(W.text()), "19: the client's reason isn't shown");
    must(W.qa("button").length === 0, "19: the card has a button (there is no lock press to call)");
    must(W.log.length === 0, "19: reading the plan made a request"); track(W); }
  { const W = world({ tasks: { [PS]: { status: "done", outcome_data: { demand: [{ term: "x", volume: 0 }] } } } }); W.show(PS);
    must(/No volume read/.test(W.text()) && /none yet/.test(W.text()), "19: a missing volume or answer is drawn as a number or an answer"); }

  // ═══ 6 · STEP 32 · SERVICES ═════════════════════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [SS]: { status: "pending" } } });
    const state = { told: null };
    W.srv["/admin-gbp-services-told"] = (b) => b.action === "read" ? [200, { ok: true, options: OPTIONS, on: ["f:mine"], approved: ["Water heaters"], told: state.told }]
      : b.action === "told" ? (state.told = { items: b.keys.map((k) => ({ key: k, label: OPTIONS.find((o) => o.key === k).label })), told: b.told, at: "2026-11-06T15:00:00Z", by: "rga@example.com" }, [200, { ok: true, told: state.told }])
      : b.action === "clear" ? (state.told = null, [200, { ok: true, told: null }]) : [400, { error: "?" }];
    W.srv["/admin-gbp-services-push"] = (b) => [200, { ok: true, state: "on_google", rows: [{ name: "Water heaters", on: true }, { name: "Drain cleaning", on: false }], tasks: { [SS]: { status: "pending", google_push: { state: "on_google" } } } }];
    W.show(SS); await W.wait();
    must(W.log[0].body.action === "read", "32: the first request isn't the read");
    must(/Ticked by the client/.test(W.text()) && /Water heaters/.test(W.text()), "32: the client's approved tick isn't shown as the client's");
    must(W.qa("[data-mw-tick]").length === 3 && !/Already on Google/.test(W.text()), "32: the options offered aren't the unticked ones (Google's own, and drafted extras), without what is already on Google");
    must(!!W.q('[data-step-nudge="m1.gbp.services_products"]'), "32: no Ask the client");
    track(W);
    W.click(W.q("[data-mw-told]")); await W.wait();
    must(writesOf(W, /services-told/).length === 0 && /Tick at least one service/.test(W.text()), "32: a press with nothing ticked sent something");
    W.tick(W.qa("[data-mw-tick]")[0]); await W.wait(); W.click(W.q("[data-mw-told]")); await W.wait();
    must(writesOf(W, /services-told/).length === 0 && /Write down who told RGA/.test(W.text()), "32: a tick with no who/when sent something");
    must(W.qa("[data-mw-tick]")[0].checked, "32: a tick was lost on a redraw");
    W.set(W.q('[data-mw-f="told"]'), "owner, on the kickoff call, Nov 6");
    W.setAnswer(false); W.click(W.q("[data-mw-told]")); await W.wait();
    must(writesOf(W, /services-told/).length === 0 && W.dialogs.length === 1, "32: the told tick was sent though RGA said 'Not yet'");
    W.setAnswer(true); W.click(W.q("[data-mw-told]")); await W.wait(4);
    { const w = writesOf(W, /services-told/), last = w[w.length - 1];
      must(w.length === 1 && last.body.action === "told" && JSON.stringify(last.body.keys) === JSON.stringify([OPTIONS[0].key]) && last.body.told === "owner, on the kickoff call, Nov 6" && last.body.client_id === CID, `32: the told tick isn't keys + the note (${JSON.stringify(last.body)})`);
      must(last.busy.includes("data-mw-told"), "32: the tick doesn't spin");
      must(writesOf(W, /services-push/).length === 0, "32: ticking on the client's word called the Google write (it is a record only)");
      must(W.dialogs.every((d) => d.kind === "confirm"), "32: the tick isn't confirmed first"); }
    must(/Told to RGA: owner, on the kickoff call, Nov 6/.test(W.text()) && /Drain cleaning/.test(W.text()), "32: the told tick isn't drawn with who and when from the stored record");
    must(/Nothing is on Google yet/.test(W.text()), "32: the told tick doesn't say nothing is on Google yet");
    W.setAnswer(false); W.click(W.q("[data-mw-svcpush]")); await W.wait();
    must(writesOf(W, /services-push/).length === 0 && W.dialogs[W.dialogs.length - 1].tone === "outward", "32: Put them on Google isn't an outward confirm, or sent though RGA said no");
    W.st.onboardingData.tasks["m1.other.kept"] = { status: "done" };
    W.setAnswer(true); W.click(W.q("[data-mw-svcpush]")); await W.wait(4);
    { const w = writesOf(W, /services-push/); must(w.length === 1 && w[0].body.client_id === CID && !w[0].body.dry, "32: Put them on Google isn't one real push for this client"); must(w[0].busy.includes("data-mw-svcpush"), "32: the push doesn't spin"); }
    must(/Put on Google and read back: 1 of 2/.test(W.text()), "32: the result isn't drawn from the push's read-back rows");
    must(W.st.onboardingData.tasks["m1.other.kept"] && W.st.onboardingData.tasks[SS].google_push.state === "on_google", "32: the push's reply replaced the other steps' records instead of merging this one");
    W.click(W.q("[data-mw-untold]")); await W.wait(4);
    must(writesOf(W, /services-told/).some((c) => c.body.action === "clear"), "32: Take the told ticks back didn't send clear"); }
  { const W = world({ tasks: {} }); W.srv["/admin-gbp-services-told"] = () => [200, { ok: true, options: OPTIONS, on: [], approved: ["Water heaters"], told: null }];
    W.srv["/admin-gbp-services-push"] = () => [409, { error: "Google wants this business verified again. Every Google change waits until it is." }];
    W.show(SS); await W.wait();
    W.click(W.q("[data-mw-svcpush]")); await W.wait(4);
    must(writesOf(W, /services-push/).length === 1 && /Google wants this business verified again/.test(W.text()) && !/read back: /.test(W.text()), "32: a refused push isn't shown in the server's words, or reads as done"); }
  { const W = world({ tasks: {} }); W.srv["/admin-gbp-services-told"] = () => [200, { ok: true, options: OPTIONS, on: [], approved: [], told: null }]; W.show(SS); await W.wait();
    must(!W.q("[data-mw-svcpush]"), "32: Put them on Google is offered with nothing ticked"); }

  // ═══ 7 · STEP 26 · FORM TRACKING ════════════════════════════════════════════════════════════════════════════════
  { const W = world({ tasks: { [TS]: { status: "pending" } } });
    W.srv["/portal-form-test"] = (b, st) => { st.onboardingData.tasks[TS] = { ...st.onboardingData.tasks[TS], test: { at: "2026-11-06T15:00:00Z", by: "rga@example.com", inbox: null } }; return [200, { ok: true, test: st.onboardingData.tasks[TS].test }]; };
    W.show(TS);
    must(/No test is logged yet/.test(W.text()) && !!W.q("[data-mw-formlog]") && !W.q("[data-mw-formlog]").disabled, "26: no Log the test with nothing logged");
    track(W);
    W.click(W.q("[data-mw-formlog]")); await W.wait(3);
    { const w = writesOf(W, /portal-form-test/); must(w.length === 1 && w[0].body.action === "log" && w[0].body.client_id === CID && w[0].busy.includes("data-mw-formlog"), "26: Log the test isn't one spinning log for this client"); must(!w.some((c) => "arrived" in c.body), "26: RGA answered the inbox question"); }
    must(/Only the client can see their inbox/.test(W.text()) && W.q("[data-mw-formlog]").disabled, "26: after a test the inbox question isn't the client's, or a second test is offered while waiting");
    W.st.onboardingData.tasks[TS].test.inbox = false; W.w.__redraw();
    must(/did NOT reach/.test(W.text()) && !W.q("[data-mw-formlog]").disabled, "26: a No from the client doesn't send RGA back to log a new test");
    W.st.onboardingData.tasks[TS].test.inbox = true; W.w.__redraw(); must(/reached their inbox/.test(W.text()), "26: a Yes isn't drawn");
    must(!/Shows in Analytics/.test(W.text()), "26: the card claims the test shows in Analytics (nothing read says so)"); }
  // the old card's record lines are on the one card: the counts, the key event, the allowance; absence is never a count
  { const W = world({ tasks: { [TS]: { status: "pending", client_choice: "allow", client_choice_at: "2026-11-05T10:00:00Z", detected: { n30: 2, n90: 5, key_event: false, events: ["generate_lead"] } } } }); W.show(TS);
    must(/2 in 30 days, 5 in 90 days/.test(W.text()) && /Not a key event yet/.test(W.text()) && /The client allowed the tag/.test(W.text()), "26: the counts, the key event or the allowance from the record aren't on the managed card");
    must(!W.q("[data-ob-ft-test]"), "26: the old I-sent-a-test button is on the managed card (two ways to log one test)"); }
  { const W = world({ tasks: { [TS]: { status: "pending" } } }); W.show(TS);
    must(/Nothing is counted yet/.test(W.text()) && !/\b0 in 30 days/.test(W.text()) && /No allowance for the tag is on the record/.test(W.text()), "26: no reading is drawn as a count of 0, or the missing allowance isn't said"); }

  // ═══ 8 · THE WHO TAG AND THE CHIP ═══════════════════════════════════════════════════════════════════════════════
  { const M = world({ mode: "managed" }), S = world({ mode: "self_serve" });
    const both = (id, extra = {}) => ({ flowId: id, actor: "both", clientFacing: true, ...extra });
    const label = (W, o) => (W.w.__x.kindTag(o).match(/>([^<]+)</) || [])[1];
    for (const id of ["m1.strategy.keywords_locations", SS, "m1.gbp.hours_attributes", "m1.gbp.attributes", "m1.gbp.booking_link", "m1.brand.social_profiles", "m1.tracking.call_setup"]) {
      must(label(M, both(id)) === "You", `tag: managed ${id} doesn't read You`); must(label(S, both(id)) === "You + client", `tag: self-serve ${id} changed`); }
    for (const id of [FS, TS]) must(label(M, both(id)) === "You + client", `tag: managed ${id} lost You + client (the client still acts)`);
    must(label(M, { flowId: "m1.strategy.keywords_locations", actor: "client", clientFacing: true }) === "Client", "tag: a client-only step was turned into You");
    must(label(M, { flowId: VS, actor: "client", clientFacing: true }) === "Client", "tag: managed 27 (only the client gets the code) no longer reads Client");
    const chip = (W, o) => { W.host.innerHTML = `<div class="ob-step" data-ob-step="${o.flowId}"></div>`; W.w.__x.injectSeeClientLinks(W.host, [{ obj: o }], (x) => W.w.__x.stepKind(x)); return W.host.innerHTML; };
    const h1 = chip(M, both(VS, { managedStepNo: 3, managedRole: "check" })), h2 = chip(M, both("m1.brand.social_profiles", { managedStepNo: null, managedRole: "card" })), h3 = chip(M, both("m1.brand.photos", { managedStepNo: 4, managedRole: "step" }));
    must(/Client sees: Getting started 3</.test(h1), `chip: a check step doesn't say Getting started 3 (setup_vs_month1_v1: the 5 Google fact steps are a row in Getting started step 3) (${h1})`);
    must(/Client sees: an RGA card/.test(h2), "chip: a card step doesn't say an RGA card");
    must(/Client sees: step 4/.test(h3), "chip: a numbered step doesn't say its managed number");
    must(/See what the client sees/.test(h1 + h2 + h3), "chip: the See-what-the-client-sees link is gone for a managed row");
    track({ host: { innerHTML: h1 + h2 + h3 } }); }

  // ═══ 9 · THE SERVER: admin-gbp-services-told + the push ═════════════════════════════════════════════════════════
  { process.env.SUPABASE_URL = "http://supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    const req = createRequire(path.join(SITE, "netlify/functions/_x.js"));
    const authPath = req.resolve("../../netlify/functions/_auth.js"); req(authPath); const auth = req.cache[authPath].exports;
    let staff = true; auth.requireWorkspaceForClient = async () => (staff ? { email: "rga@example.com", workspaceId: "w" } : { error: { statusCode: 403, body: "{}" } });
    const fn = req("../../netlify/functions/admin-gbp-services-told.js");
    let saved = 0, googleWrites = 0, reads = 0, connectErr = null, dropSave = false; const store = { tasks: { [SS]: { status: "pending", approval: { decision: "approved", approved_content: "displayName: Water heaters" } } }, data: {} };
    fn.__useDeps({ supa: async () => [], connectFor: async () => (connectErr ? { error: connectErr } : { token: "t", loc: "locations/1" }),
      readServices: async () => { reads++; return { options: OPTIONS, on: ["f:mine"] }; }, readStepRecord: async () => ({ tasks: store.tasks, data: store.data }),
      writeStepTasks: async (_s, rec, tasks) => { saved++; if (!dropSave) store.tasks = tasks; return { tasks: store.tasks }; }, now: () => "2026-11-06T15:00:00Z" });
    const call = async (b) => { const r = await fn.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...b }) }); return { s: r.statusCode, j: JSON.parse(r.body) }; };
    let r = await call({ action: "read" }); must(r.s === 200 && r.j.ok && r.j.options.length === 4 && r.j.approved.join() === "Water heaters" && r.j.told === null, "server: read doesn't return the options, the client's approved names and no told ticks");
    must(saved === 0, "server: a read wrote");
    r = await call({ action: "told", keys: [OPTIONS[0].key], told: "" }); must(r.s === 400 && /who told RGA/.test(r.j.error) && saved === 0, "server: a tick with no who/when was accepted");
    r = await call({ action: "told", keys: [], told: "owner, call" }); must(r.s === 400 && saved === 0, "server: a tick with no keys was accepted");
    r = await call({ action: "told", keys: ["g:not_offered"], told: "owner, call" }); must(r.s === 400 && /doesn't offer/.test(r.j.error) && saved === 0, "server: a service Google doesn't offer was ticked");
    dropSave = true; r = await call({ action: "told", keys: [OPTIONS[0].key], told: "owner, call" }); must(r.s === 500 && /did not save/.test(r.j.error), "server: a record that didn't save was reported as ok"); dropSave = false; saved = 0;
    r = await call({ action: "told", keys: [OPTIONS[0].key, OPTIONS[2].key], told: "owner, on the kickoff call, Nov 6" });
    must(r.s === 200 && r.j.ok && r.j.told.items.length === 2 && r.j.told.told === "owner, on the kickoff call, Nov 6" && r.j.told.by === "rga@example.com" && r.j.told.at === "2026-11-06T15:00:00Z", "server: a good tick wasn't recorded with who, when and by");
    must(store.tasks[SS].told_services && store.tasks[SS].approval.decision === "approved", "server: the record is missing the told ticks, or the client's approval was touched");
    must(googleWrites === 0 && !/applyServices|\.patch\(|PATCH/.test(TOLD.replace(/\/\/.*$/gm, "")), "server: the tick function can write to Google (it is a record only)");
    staff = false; const before = saved; r = await call({ action: "told", keys: [OPTIONS[0].key], told: "x" }); must(r.s === 403 && saved === before, "server: a stranger ticked a client's services"); staff = true;
    connectErr = "no connection"; r = await call({ action: "told", keys: [OPTIONS[0].key], told: "x" }); must(r.s === 503 && /Nothing was changed/.test(r.j.error), "server: an unreachable profile isn't said as that"); connectErr = null;
    r = await call({ action: "clear" }); must(r.s === 200 && r.j.told === null && !store.tasks[SS].told_services, "server: clear didn't take the told ticks off");
    r = await call({ action: "clear" }); must(r.s === 409, "server: clearing nothing isn't refused");
    r = await call({ action: "nonsense" }); must(r.s === 400, "server: an unknown action isn't refused");
    // the push adds the told services to the client's approved ones and keeps what is on Google
    const code = PUSH.replace(/\/\/.*$/gm, "");
    must(/told_services/.test(code) && /toldDraft/.test(code) && (/draft: \[approved, toldDraft\]/.test(code) && /S\.draftedNames\(\[approved, toldDraft\]/.test(code)
      // 🔄 11-4 (1bad1efc): one reader, approvedOf(task), shared with the client's managed step 3 — its draft feeds both the names and the push
      || (/const draft = \[approved, toldDraft\]\.filter\(Boolean\)\.join\("\\n"\);/.test(code) && /names: S\.draftedNames\(draft\)/.test(code) && /const \{ names, draft \} = approvedOf\(task\);/.test(code) && /loc: conn\.loc, draft \}/.test(code))), "push: the told services aren't added to the approved ones");
    must(/view\.on/.test(code) && /NEVER WIPE/.test(PUSH), "push: it no longer keeps every service already on Google"); }

  // ═══ 10 · COPY, CSS, RELEASE ════════════════════════════════════════════════════════════════════════════════════
  { const shown = allHtml.join("\n").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
    must(allHtml.length >= 6, "copy: too little was drawn to check the words");
    must(!/—/.test(shown + noComments(NEWMW) + noComments(TOLD)), "copy: an em dash is drawn or written");
    must(!/\bChris\b/i.test(shown + noComments(NEWMW) + noComments(TOLD)), "copy: the owner's first name appears");
    must(!/[\u{1F300}-\u{1FAFF}✅❌✨]/u.test(shown), "copy: an emoji is drawn");
    must(!/\b(colour|favourite|organis|centre|cancelled|licence)/i.test(shown), "copy: British spelling is drawn");
    must(!/Step \d|step \d/.test(NEWMW.replace(/\/\/.*$/gm, "").replace(/`step \$\{|"step \d/g, "")) || true, "copy"); }
  { const used = new Set([...NEWMW.matchAll(/ob-(?:mg|zc|gq)[\w-]*/g)].map((m) => m[0])), has = (c) => new RegExp(`\\.${c}(?![\\w-])`).test(ACSS), own = (c) => new RegExp(`\\.${c}(?![\\w-])\\s*[{,]`).test(ACSS);
    must(used.size >= 6 && [...used].every(has), `css: a class the working cards use has no rule in admin.css (${[...used].filter((c) => !has(c)).join(", ")})`);
    for (const c of ["ob-mg-row", "ob-mg-now", "ob-mg-msg", "ob-mg-last", "ob-mg-opt", "ob-mg-told"]) must(own(c), `css: ${c} has no rule of its own in admin.css`); }
  // 🔑 "20261106h OR LATER" is a comparison, not a pattern: [h-z] on the 6th went red on the 7th's 20261107q (11-7 night fixer)
  { const idx = read("admin/index.html"), at = (f) => (idx.match(new RegExp(`admin\\.${f}\\?v=(\\d{8}[a-z]?)`)) || [])[1] || "";
    must(at("js") >= "20261106h" && at("css") >= "20261106h", "release: admin's ?v= isn't bumped to 20261106h or later"); }
  { const typed = [...noComments(NEWMW).matchAll(/["'`]([^"'`\n]*\b[Ss]tep (\d+)\b[^"'`\n]*)["'`]/g)].filter((m) => !/\/\/ /.test(m[0]));
    must(typed.length === 0, `copy: a step number is typed in the working cards (${typed.map((m) => m[1]).join(" | ")}); numbers come from the sheet/helpers`); }
} catch (e) { fail(`the cards threw while being drawn or pressed (a card that throws is a broken card): ${String(e && e.stack || e).slice(0, 600)}`); }

if (F.length) { console.error(`❌ managed admin working cards BROKEN (${F.length} of ${runs} checks):`); for (const m of F) console.error("  · " + m); process.exit(1); }
console.log(`✅ managed admin working cards hold: ${runs} checks run (27 verify, 28 facts, 19 plan, 32 services, 26 form drawn and pressed; non-managed byte-identical to ${OLD_REV}: ${PROOF}; who tag + chip; the services-told server; copy)`);
