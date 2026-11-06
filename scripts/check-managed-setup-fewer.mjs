#!/usr/bin/env node
// check-managed-setup-fewer.mjs — "finish with fewer" on MANAGED Setup steps 4 (photos) and 5 (customers asked), and the move to Ongoing work
// when Monthly starts. Approved client_setup_fewer_v1 (11-5, all six decisions as recommended; the owner: "What if we don't have 20 photos and 5
// reviews? … skip to complete Setup?", then "ok we need that option").
//
// DRAWN (scripts/lib/portal-boot-harness.mjs: the real portal.js + portal.css in headless Chrome, our fake database, nothing leaves the laptop),
// for invented clients of three shapes (a marketing agency and a plumber that go to their customers, a hair salon with a public address), each on
// its own trade's real shot list (netlify/functions/_photo-lists.js). HOLDS:
//   1 · STEP 4 BELOW THE MINIMUM: no option, and one line under the card naming what's still needed, counted from the client's OWN list (3 of each
//       kind, or every shot of a kind with fewer; the logo out where Google hides it, in where it shows). No sheet, nothing pale.
//   2 · STEP 4 AT THE MINIMUM (client_setup_fewer_visible_v2, 11-5): the row inside the card at the foot of the work area, above "See it on Google
//       Maps" ("Fewer than 20 photos?" · "Every kind has its 3 on Google." · a plain Finish); it opens ONE sheet in the row's place ("Are you sure you
//       want to finish this step with N of 20 photos? The rest come with step 10." + one line, Finish · Keep adding), the tiles and the row step back,
//       Keep adding puts them back. Every button is one plain word. Finish spins, posts
//       portal-step-fewer { action: "finish" }, redraws done from the answer and says so; a refusal says the server's own words in the sheet.
//   3 · STEP 5 FROM 1 ASKED: the row "Fewer than 5 recent customers?" + Finish under the customer fields, above "Who to ask"; its sheet ("Are you sure
//       you want to finish this step with N of 5 customers asked? The rest come with step 8." + one line, Finish · Keep asking), the row, the form and its
//       buttons step back; 0 asked offers nothing.
//   4 · DONE WITH FEWER: step 4 green "N on Google · the rest come with step 10" · finished <day>, the kinds, "We keep counting every night…",
//       Add more; step 5 green "N of 5 asked · the rest come with step 8" · finished <day>, "Step 8 is open · This week's customer list · Weekly ·
//       due Mondays" with Go to step 8. MOVED TO ONGOING WORK (Monthly started): grey pill, grey disc, grey card "· Monthly started", "Not in To
//       do. We keep counting every night; at 20 this turns green." No Add more.
//   5 · MONTHLY'S "YOUR NEXT STEP" names neither step once they moved (it named step 4 before: the mockup's Not verified item, recorded here).
//   6 · NOT MANAGED (self-serve, no mode) draws none of it, with the same fixtures, a fewer note included; and with FEWER_BEFORE=<a portal.js from
//       before the build>, the same steps byte for byte.
//   7 · THE SERVER, RUN: portal-step-fewer's handler on an in-memory record (managed only; the owner finishes, RGA's workspace moves; below the
//       minimum, at the goal, already done, Google unread = refused; done + the note, read back); the nightly check (portal-step-recheck, its real
//       handler on a stubbed fetch) leaves a fewer step done and tells nobody, reopens a plain done one, and clears the note at the goal; To do
//       (_open-moves.openMoves) drops a fewer step; the Month 1 report says the count, never the bare "20+" title; admin's line, pill, Reset and
//       Advance dialog (lifted from admin.js) say what the mockup says.
// exit 0 = holds · 1 = something is wrong · 2 = can't tell (no browser, the page didn't boot, a fixture can't be built)
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
let buildShotList;
try { ({ buildShotList } = req("./_photo-lists.js")); } catch (e) { can(`the shot lists don't load (${e.message})`); }
const list = (type, storefront, teamSize = null) => { const L = buildShotList({ typeOverride: type, storefront, teamSize }); if (!L.ok) can(`no ${type} list`); return { items: L.items, groups: L.groups, count: L.count, list: L.list, listName: L.listName, type: L.type, storefront: L.storefront, teamSize: L.teamSize }; };
const NOV5 = "2026-11-05T19:00:00Z", CLOCK = "2026-11-05T20:00:00Z", KICKOFF = "2026-10-09T16:11:50Z";
const PH = "m1.gbp.photos", RV = "m1.review.first_5";
const ROW = (id) => `[id="step-row-${id}"]`;

// ── the minimum, worked out HERE from the client's own list (never read back from the code under test) ──
const LABEL = { PROFILE: "Logo", COVER: "Cover", EXTERIOR: "Exterior", INTERIOR: "Interior", PRODUCT: "Products", AT_WORK: "At work", TEAMS: "Team", ADDITIONAL: "Other" };
function minOf(shape, filled = {}) {
  const per = new Map();
  for (const it of shape.items) { if (shape.storefront === false && it.google === "PROFILE") continue; per.set(it.google, (per.get(it.google) || 0) + 1); }
  const kinds = [...per.entries()].map(([g, n]) => ({ g, label: (shape.items.find((it) => it.google === g) || {}).group || LABEL[g], need: Math.min(3, n), have: filled[g] || 0 }));
  return { kinds, total: kinds.reduce((a, k) => a + k.need, 0), still: kinds.filter((k) => k.have < k.need).map((k) => `${k.label} ${k.need - k.have}`).join(" · ") };
}
/** A photo step where `pick(kind) → how many of that kind are on Google`. Our photos fill the shots in list order; Google's list holds them (+ the logo). */
function photoTask(shape, pick, extra = {}) {
  const photos = [], items = [], used = {};
  for (const it of shape.items) {
    const g = it.google, k = used[g] || 0;
    if (k >= pick(g)) continue;
    used[g] = k + 1;
    const name = `m/${it.n}`;
    photos.push({ id: `p${it.n}`, client_id: CID, storage_path: `c/${it.n}.jpg`, category: it.category, shot_n: Number(it.n), publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-20T10:00:00Z", gbp_media_name: name, created_at: "2026-10-20T09:00:00Z" });
    items.push({ name, category: g, at: "2026-10-20T10:00:10Z" });
  }
  const counted = items.filter((x) => !(shape.storefront === false && x.category === "PROFILE")).length;
  return { photos, task: { status: "pending", team_size: shape.teamSize || "1", draft_shape: shape, detected: { verdict: "not_done", n: counted, n_all: items.length, threshold: 20, source: "google_profile", at: "2026-11-05T06:00:00Z", items }, ...extra }, counted, filled: used };
}
const asked = (name, phone, at, extra = {}) => ({ first_name: name, phone, service_done: "drain cleaning", marked_sent_by_client: true, marked_sent_at: at, ...extra });
const LIST1 = { id: "l1", client_id: CID, workspace_id: "w1", week_label: "Week of October 26", created_at: "2026-10-26T19:59:53Z", customer_count: 1, customers: [asked("James", "5550100000", "2026-10-26T20:01:48Z")] };
const REQ1 = { ok: true, has_review_link: true, list: { id: "l1" }, requests: [{ index: 0, list_id: "l1", name: "James", phone: "5550100000", email: "", job: "drain cleaning", already_marked: true, marked_at: "2026-10-26T20:01:48Z", reminded_at: null, reviewed_mark: false, stopped: false, reminder: "Hi James, a reminder.", message: "Hi James" }] };
const EMPTY_REVIEWS = { ok: true, scope: "reviews", feed: { reviews: [], count: 0, rating: null, new_30d: 0, gap_days: null, checked_at: "2026-11-05T11:00:00Z", stale: false }, google: { status: "ok" }, matches: [], profile_url: null, replies: null };
const fewerT = (t, stepId, n, by) => ({ ...t, status: "done", completed_at: NOV5, completed_by: by, fewer: { n, goal: stepId === PH ? 20 : 5, by, who: by === "client" ? "client@example.test" : "rga@example.test", at: NOV5 } });

async function open(mode, { tasks, photos = [], lists = [], stage = "stage_4_onboarding", fns = {}, overrides = {} }) {
  const S = SCENARIOS.allDone;
  const all = { ...S.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" }, ...tasks };
  const calls = [];
  const h = await bootPortal({ mode, stage, clock: CLOCK, tasks: all, now: S.now, verify: S.verify, tables: { client_photos: photos, client_customer_lists: lists },
    fns: { "portal-review-requests": (b) => (b && b.scope === "reviews" ? EMPTY_REVIEWS : lists.length ? REQ1 : { ok: true, requests: [], has_review_link: true }), "portal-thread": () => ({ ok: true, messages: [] }), ...fns } }, overrides, SITE);
  h.calls = calls;
  try { await h.ready(ROW(PH), 40000); } catch { await h.close(); throw new HarnessUnavailable(`step 4 never drew (${h.errs[0] || "no error"})`); }
  await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
  await tick(700);
  return h;
}
// open a row the way a person would (its header), never shut an open one
const openRow = async (h, id) => { await h.page.evaluate((R) => { const r = document.querySelector(R); if (r && r.classList.contains("is-collapsed")) r.querySelector("[data-step-toggle]")?.click(); }, ROW(id)); await tick(900); };
const settled = async (h, id) => { let last = "", same = 0; for (let i = 0; i < 30 && same < 3; i++) { await tick(250); const now = await h.page.evaluate((R) => document.querySelector(R)?.outerHTML || "", ROW(id)); same = now === last ? same + 1 : 0; last = now; } return last; };
const look = (h, id) => h.page.evaluate((R) => {
  const r = document.querySelector(R); if (!r) return null;
  const vis = (el) => !!el && !el.closest("[hidden]") && el.offsetParent !== null;
  const sh = r.querySelector("[data-fw-sheet]"), card = r.querySelector(".pm-k5-plan");
  return {
    pills: [...r.querySelectorAll(":scope > .pm-step-row-head .pm-pill")].map((p) => p.textContent.trim()), disc: (r.querySelector(".pm-step-num") || {}).className || "", rowCls: r.className,
    band: card ? (card.querySelector(".pm-k5-h b") || {}).textContent || "" : "", side: card ? (card.querySelector(".pm-k5-h > span") || {}).textContent || "" : "", cardCls: card ? card.className : "",
    note: [...r.querySelectorAll("[data-fw-row]")].filter(vis).map((n) => n.textContent.replace(/\s+/g, " ").trim()),
    fwRow: (() => { const w = r.querySelector("[data-fw-row]"); if (!w) return null; const nx = w.nextElementSibling, pv = w.previousElementSibling, cs = getComputedStyle(w);
      return { shown: vis(w), inCard: !!w.closest(".pm-k5-plan"), b: (w.querySelector("b") || {}).textContent || "", small: (w.querySelector("small") || {}).textContent || "", btn: [...w.querySelectorAll("button")].map((x) => x.textContent.trim()),
        btnCls: (w.querySelector("button") || {}).className || "", next: nx ? `${nx.tagName.toLowerCase()}.${nx.className}` : "", nextText: nx ? nx.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "", prev: pv ? pv.className : "",
        css: { pad: cs.padding, bt: cs.borderTopWidth + " " + cs.borderTopStyle, fs: cs.fontSize, disp: cs.display },
        // client_step05_buttons_v1 (approved 11-5): the row sits in the grey foot band (.pm-fw-foot); the band's neighbours are the work area and the card's foot
        band: (() => { const f = w.closest(".pm-fw-foot"); if (!f) return null; const bn = f.nextElementSibling, bp = f.previousElementSibling;
          return { bg: getComputedStyle(f).backgroundColor, next: bn ? `${bn.tagName.toLowerCase()}.${bn.className}` : "", nextText: bn ? bn.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "", prev: bp ? bp.className : "", prev2: bp && bp.previousElementSibling ? bp.previousElementSibling.className : "",
            later: !!f.querySelector(".pm-later-ctl"), rowNext: nx ? nx.className : "" }; })() }; })(),
    open: [...r.querySelectorAll("[data-fw-open]")].filter(vis).map((b) => b.textContent.trim()), openAt: (() => { const b = r.querySelector("[data-fw-open]"); const p = b && b.closest(".pm-k5-acts, .pm-fw-ask"); return p ? p.innerText.replace(/\s+/g, " ").trim() : ""; })(),
    sheet: sh ? { shown: vis(sh), inCard: !!sh.closest(".pm-k5-plan"), h3: (sh.querySelector("h3") || {}).textContent || "", p: (sh.querySelector("p:not([data-fw-msg])") || {}).textContent || "", lis: [...sh.querySelectorAll("li")].map((l) => l.textContent), btns: [...sh.querySelectorAll("button")].map((b) => b.textContent.trim()), msg: vis(sh.querySelector("[data-fw-msg]")) ? sh.querySelector("[data-fw-msg]").textContent : "" } : null,
    work: [...r.querySelectorAll("[data-fw-work]")].map((w) => vis(w)), tiles: vis(r.querySelector(".pm-p10")),
    chips: [...(card ? card.querySelectorAll(".pm-cs-chips .pm-cs-chip") : [])].map((c) => c.textContent.replace(/\s+/g, " ").trim()),
    foot: card ? [...card.querySelectorAll(".pm-pc-foot")].map((f) => f.textContent.trim()) : [], addMore: [...r.querySelectorAll("[data-photo-addmore]")].filter(vis).length,
    s8: (() => { const l = r.querySelector(".pm-fw-s8"); return l ? { text: l.innerText.replace(/\s+/g, " ").trim(), go: (l.querySelector("[data-portal-goto]") || {}).getAttribute?.("data-portal-scroll") || "" } : null; })(),
    text: r.innerText.replace(/\s+/g, " "),
  };
}, ROW(id));
const press = async (h, id, sel) => { const ok = await h.page.evaluate((R, s) => { const b = [...document.querySelector(R).querySelectorAll(s)].find((x) => x.offsetParent !== null); if (!b) return false; b.click(); return true; }, ROW(id), sel); await tick(500); return ok; };
// 🔒 client_setup_fewer_visible_v2 (feedback_a_button_says_one_plain_word): no count or reason on a finish-with-fewer button
const ONE_WORD = (btns) => btns.filter((t) => /\d|\bwith\b|\bfor now\b/i.test(t));
const FW_MARKUP = /data-fw-|pm-fw-|That's all I have for now|I don't have 5 recent customers yet|Moved to Ongoing work|the rest come with step/;

const agency = list("Marketing agencies", false, "3-5");
const plumber = list("Plumbers", false, null);
const salon = list("Hair salons", true, null);

try {
  // ── 1 · STEP 4 BELOW THE MINIMUM (three shapes), and step 5 with nobody asked ──
  for (const [nm, shape] of [["agency", agency], ["plumber", plumber], ["salon", salon]]) {
    const P = photoTask(shape, (g) => (g === "COVER" ? 1 : 0)), M = minOf(shape, P.filled);
    const h = await open("managed", { tasks: { [PH]: P.task, [RV]: { status: "pending" } }, photos: P.photos, lists: [] });
    try {
      await openRow(h, PH); await settled(h, PH);
      const a = await look(h, PH), L = `${nm} below the minimum`;
      // client_setup_fewer_visible_v2: the row in the card, "Fewer than 20 photos?" + what's still needed, no button
      const want = `Fewer than 20 photos?Once each kind has 3 on Google, you can finish with what you have. Still needed: ${M.still}.`;
      if (!a || a.note.length !== 1 || a.note[0].replace(/\s+/g, "") !== want.replace(/\s+/g, "")) fail(`${L}: step 4's row isn't «${want}» (${JSON.stringify(a && a.note)})`);
      if (a && a.fwRow && (!a.fwRow.inCard || a.fwRow.btn.length || a.fwRow.b !== "Fewer than 20 photos?")) fail(`${L}: the row isn't in the card with no button ${JSON.stringify(a.fwRow)}`);
      if (a && /Have fewer than 20\?|That's all I have for now/.test(a.text)) fail(`${L}: the old line or link is still drawn`);
      if (a && (a.open.length || (a.sheet && a.sheet.shown))) fail(`${L}: step 4 offers to finish before every kind has its minimum (${JSON.stringify(a.open)})`);
      if (a && a.sheet) fail(`${L}: a sheet is drawn below the minimum`);
      if (nm === "salon" && !/Logo 1/.test(M.still)) fail(`${L}: a storefront's logo shows on Google, so it must be on its list of what's needed (${M.still})`);
      if ((nm === "agency" || nm === "plumber") && /Logo/.test(a && a.note[0] || "")) fail(`${L}: a business with no public address is asked for the logo Google hides`);
      if (nm === "agency") {
        await openRow(h, RV); await settled(h, RV);
        const b = await look(h, RV);
        if (b && (b.open.length || b.sheet)) fail(`step 5 with nobody asked offers "finish with fewer" (approved: from 1 asked)`);
      }
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }

  // ── 2 + 3 · AT THE MINIMUM (step 4) and 1 ASKED (step 5): the option, the sheet, Keep, Finish ──
  const AT = photoTask(agency, (g) => minOf(agency).kinds.find((k) => k.g === g)?.need || 0), AM = minOf(agency);
  if (AT.counted !== AM.total) can(`the at-minimum fixture counts ${AT.counted}, its minimum is ${AM.total}`);
  const finishAnswer = (stepId, n, tasks) => ({ ok: true, step_id: stepId, n, goal: stepId === PH ? 20 : 5, tasks: { ...tasks, [stepId]: fewerT(tasks[stepId] || {}, stepId, n, "client") }, scope: "month1", reporting_month: null });
  {
    const posted = [];
    const h = await open("managed", { tasks: { [PH]: AT.task, [RV]: { status: "pending" } }, photos: AT.photos, lists: [LIST1],
      fns: { "portal-step-fewer": (b, url, { tasks }) => { posted.push(b); return finishAnswer(b.step_id, b.step_id === PH ? AM.total : 1, tasks); } } });
    try {
      const L = "agency at the minimum";
      await openRow(h, PH); await settled(h, PH);
      let a = await look(h, PH);
      // client_setup_fewer_visible_v2: the row at the foot of the work area (above the card's foot: See it on Google Maps · How this step works), one plain word
      if (!a || a.open.join("|") !== "Finish") fail(`${L}: the row's plain "Finish" isn't offered (${JSON.stringify(a && a.open)})`);
      const R4 = a && a.fwRow;
      if (!R4 || !R4.shown || !R4.inCard || R4.b !== "Fewer than 20 photos?" || R4.small !== "Every kind has its 3 on Google." || R4.btn.join("|") !== "Finish" || !/\bpm-amend\b/.test(R4.btnCls)) fail(`${L}: the row isn't the mockup's ${JSON.stringify(R4)}`);
      else {
        // client_step05_buttons_v1 (approved 11-5): the row leads the grey foot band, "Remind me later" under it, the band right above the card's foot
        const B4 = R4.band;
        if (!B4) fail(`${L}: the row isn't in the grey foot band (.pm-fw-foot)`);
        else {
          if (!/pm-fw-sheet/.test(B4.prev)) fail(`${L}: the band isn't at the foot of the work area, its sheet beside it (after: ${B4.prev})`);
          if (!/pm-cs-foot/.test(B4.next)) fail(`${L}: the band isn't right above the card's foot (next: ${B4.next} «${B4.nextText}»)`);
          if (!B4.later || !/pm-fw-later/.test(B4.rowNext)) fail(`${L}: "Remind me later" isn't under the row in the band (${B4.rowNext})`);
          if (B4.bg !== "rgb(246, 246, 247)") fail(`${L}: the band isn't the grey tray (${B4.bg})`);
        }
        if (R4.css.pad !== "11px 16px" || R4.css.fs !== "14.5px" || R4.css.bt !== "0px none" || R4.css.disp !== "flex") fail(`${L}: the row's look isn't the mockup's ${JSON.stringify(R4.css)}`);
      }
      if (a && /That's all I have for now|Have fewer than 20\?/.test(a.text)) fail(`${L}: the old link or grey line is still drawn`);
      if (a && !/Not ready to take photos yet\? Remind me later/.test(a.text)) fail(`${L}: "Remind me later" is no longer drawn`);
      if (!a || !a.sheet || a.sheet.shown || !a.sheet.inCard) fail(`${L}: the sheet isn't drawn hidden inside the card ${JSON.stringify(a && a.sheet)}`);
      await press(h, PH, "[data-fw-open]");
      a = await look(h, PH);
      const W4 = { h3: `Are you sure you want to finish this step with ${AM.total} of 20 photos? The rest come with step 10.`, p: "Any photo you add later still counts, here and in step 10, New photos (no monthly quota). RGA is told.",
        lis: [], btns: ["Finish", "Keep adding"] };
      if (!a.sheet || !a.sheet.shown || a.sheet.h3 !== W4.h3 || a.sheet.p !== W4.p || a.sheet.lis.join("|") !== W4.lis.join("|") || a.sheet.btns.join("|") !== W4.btns.join("|")) fail(`${L}: the sheet isn't the approved one ${JSON.stringify(a.sheet)}`);
      if (a.tiles) fail(`${L}: the tiles stay while the sheet is open (the sheet takes the card's working part)`);
      if (ONE_WORD([...(a.sheet ? a.sheet.btns : []), "Finish"]).length) fail(`${L}: a button carries a count or a reason (${JSON.stringify(a.sheet && a.sheet.btns)})`);
      // v2: the sheet opens in the row's place (right after the work area, the row stepping back)
      const pos = await h.page.evaluate((R) => { const r = document.querySelector(R), sh = r.querySelector("[data-fw-sheet]"), nx = sh && sh.nextElementSibling; return { prev: sh && sh.previousElementSibling ? sh.previousElementSibling.className : "", next: nx && (nx.hasAttribute("data-fw-row") || (nx.matches(".pm-fw-foot") && nx.querySelector("[data-fw-row]"))) ? "row" : "" }; }, ROW(PH));
      if (pos.next !== "row") fail(`${L}: the sheet doesn't open in the row's place ${JSON.stringify(pos)}`);
      if (a.fwRow && a.fwRow.shown) fail(`${L}: the row stays while the sheet is open`);
      await press(h, PH, "[data-fw-keep]");
      a = await look(h, PH);
      if (a.sheet.shown || !a.tiles) fail(`${L}: Keep adding doesn't put the tiles back`);
      // step 5 at 1 asked
      await openRow(h, RV); await settled(h, RV);
      let b = await look(h, RV);
      if (!b || b.open.join("|") !== "Finish") fail(`step 5 at 1 asked: the row's plain "Finish" isn't offered (${JSON.stringify(b && b.open)})`);
      const R5 = b && b.fwRow;
      if (!R5 || !R5.shown || !R5.inCard || R5.b !== "Fewer than 5 recent customers?" || R5.small || R5.btn.join("|") !== "Finish" || !/\bpm-amend\b/.test(R5.btnCls)) fail(`step 5 at 1 asked: the row isn't the mockup's ${JSON.stringify(R5)}`);
      else {
        // client_step05_buttons_v1 (approved 11-5): fields → "Write the request" (inside the card) → the grey foot band → Who to ask
        const B5 = R5.band;
        if (!B5) fail("step 5: the row isn't in the grey foot band (.pm-fw-foot)");
        else {
          if (!/pm-r5-acts/.test(B5.prev) || !/pm-rv-next/.test(B5.prev2)) fail(`step 5: the band isn't under the customer fields and Write the request (after: ${B5.prev2} · ${B5.prev})`);
          if (!/Who to ask/.test(B5.nextText)) fail(`step 5: the band isn't above "Who to ask" (next: «${B5.nextText}»)`);
          if (B5.bg !== "rgb(246, 246, 247)") fail(`step 5: the band isn't the grey tray (${B5.bg})`);
        }
      }
      if (b && /I don't have 5 recent customers yet/.test(b.text)) fail("step 5: the old link under the buttons is still drawn");
      if (!b || !b.sheet || b.sheet.shown || !b.sheet.inCard) fail(`step 5 at 1 asked: the sheet isn't drawn hidden inside the card`);
      const work0 = b ? b.work.join(",") : "";
      await press(h, RV, "[data-fw-open]");
      b = await look(h, RV);
      const W5 = { h3: "Are you sure you want to finish this step with 1 of 5 customers asked? The rest come with step 8.", p: "Step 8, This week's customer list, opens now in Ongoing work, and every customer asked there still counts here. RGA is told.", lis: [], btns: ["Finish", "Keep asking"] };
      if (!b.sheet.shown || b.sheet.h3 !== W5.h3 || b.sheet.p !== W5.p || b.sheet.lis.join("|") !== W5.lis.join("|") || b.sheet.btns.join("|") !== W5.btns.join("|")) fail(`step 5: the sheet isn't the approved one ${JSON.stringify(b.sheet)}`);
      if (b.fwRow && b.fwRow.shown) fail("step 5: the row stays while the sheet is open");
      if (ONE_WORD(b.sheet.btns).length) fail(`step 5: a button carries a count or a reason (${JSON.stringify(b.sheet.btns)})`);
      if (!b.work.length || b.work.some(Boolean)) fail(`step 5: the form and its buttons stay while the sheet is open (${JSON.stringify(b.work)})`);
      if (/Write the request/.test(b.text.replace(/Finish.*$/, "")) && b.work.some(Boolean)) fail("step 5: Write the request shows beside the sheet");
      await press(h, RV, "[data-fw-keep]");
      b = await look(h, RV);
      if (b.sheet.shown || b.work.join(",") !== work0 || !b.work.some(Boolean)) fail(`step 5: Keep asking doesn't bring the form back (${b.work.join(",")} vs ${work0})`);
      // Finish step 4: it spins, posts, redraws done from the answer, says so
      await openRow(h, PH); await press(h, PH, "[data-fw-open]");
      const busy = await h.page.evaluate((R) => new Promise((res) => { const b = document.querySelector(`${R} [data-fw-finish]`); b.click(); setTimeout(() => res({ busy: b.classList.contains("is-busy") || b.getAttribute("aria-busy") === "true", text: b.textContent }), 15); }), ROW(PH));
      if (!busy.busy || busy.text !== "Finishing…") fail(`${L}: Finish doesn't spin and say "Finishing…" while it saves (${JSON.stringify(busy)})`);
      await tick(1500); await settled(h, PH);
      if (!posted.length || posted[0].action !== "finish" || posted[0].step_id !== PH || posted[0].client_id !== CID) fail(`${L}: Finish didn't post portal-step-fewer { action: "finish", step_id: "${PH}" } (${JSON.stringify(posted)})`);
      await openRow(h, PH);
      a = await look(h, PH);
      if (!a || a.pills.join("|") !== "Done" || a.band !== `${AM.total} on Google · the rest come with step 10` || a.side !== "finished Nov 5") fail(`${L}: after Finish, step 4 isn't done with fewer ${JSON.stringify(a && { pills: a.pills, band: a.band, side: a.side })}`);
      const toast = await h.page.evaluate(() => document.body.innerText);
      if (!toast.includes(`Step 4 is done · ${AM.total} photos on Google. RGA is told.`)) fail(`${L}: the finish says nothing (no "Step 4 is done · ${AM.total} photos on Google. RGA is told.")`);
      // Finish step 5
      await openRow(h, RV); await settled(h, RV); await press(h, RV, "[data-fw-open]"); await press(h, RV, "[data-fw-finish]"); await tick(1500); await settled(h, RV);
      if (posted.length < 2 || posted[1].step_id !== RV) fail(`step 5: Finish didn't post (${JSON.stringify(posted)})`);
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }
  // a refusal says the server's own words, in the sheet, and the button comes back
  {
    const h = await open("managed", { tasks: { [PH]: AT.task, [RV]: { status: "pending" } }, photos: AT.photos, lists: [LIST1],
      fns: { "portal-step-fewer": () => ({ ok: false, error: "Not yet: each kind needs its minimum on Google first. Still needed: Team 1." }) } });
    try {
      await openRow(h, PH); await settled(h, PH); await press(h, PH, "[data-fw-open]"); await press(h, PH, "[data-fw-finish]"); await tick(900);
      const a = await look(h, PH);
      if (!a.sheet || !a.sheet.shown || a.sheet.msg !== "Not yet: each kind needs its minimum on Google first. Still needed: Team 1.") fail(`a refused finish doesn't say the server's words in the sheet (${JSON.stringify(a.sheet)})`);
      if (a.sheet && a.sheet.btns[0] !== "Finish") fail(`a refused finish leaves the button saying "${a.sheet.btns[0]}"`);
      if (a.pills.join("|") === "Done") fail("a refused finish drew the step done");
    } finally { await h.close(); }
  }

  // ── 4 · DONE WITH FEWER, and MOVED TO ONGOING WORK ──
  const BELOW = photoTask(agency, (g) => (g === "COVER" ? 1 : 0));
  for (const [by, L] of [["client", "done with fewer"], ["monthly", "moved to Ongoing work"]]) {
    const tasks = { [PH]: fewerT(by === "client" ? AT.task : BELOW.task, PH, by === "client" ? AM.total : 1, by), [RV]: fewerT({}, RV, 1, by) };
    const h = await open("managed", { tasks, photos: by === "client" ? AT.photos : BELOW.photos, lists: [LIST1], stage: by === "client" ? "stage_4_onboarding" : "stage_5_monthly" });
    try {
      await openRow(h, PH); await settled(h, PH);
      const a = await look(h, PH);
      if (by === "client") {
        if (a.pills.join("|") !== "Done" || !/is-done/.test(a.disc) || a.band !== `${AM.total} on Google · the rest come with step 10` || a.side !== "finished Nov 5" || !/\bok\b/.test(a.cardCls)) fail(`step 4 ${L}: band/pill/disc aren't the approved done ${JSON.stringify({ p: a.pills, d: a.disc, b: a.band, s: a.side, c: a.cardCls })}`);
        const wantChips = AM.kinds.map((k) => `${k.label} ${k.need}`);
        if (a.chips.join("|") !== wantChips.join("|")) fail(`step 4 ${L}: the kinds read ${a.chips.join(" · ")}; approved ${wantChips.join(" · ")}`);
        if (a.foot.join("|") !== 'We keep counting every night. At 20 this reads "20 photos on Google".') fail(`step 4 ${L}: the foot reads «${a.foot.join("|")}»`);
        if (a.addMore !== 1) fail(`step 4 ${L}: no Add more (decision 4: adding more is always open)`);
      } else {
        if (a.pills.join("|") !== "Moved to Ongoing work" || /is-done/.test(a.disc) || !/cs-wait/.test(a.rowCls) || !/\boff\b/.test(a.cardCls)) fail(`step 4 ${L}: not the grey state ${JSON.stringify({ p: a.pills, d: a.disc, r: a.rowCls, c: a.cardCls })}`);
        if (a.band !== "1 of 20 on Google · the rest come with step 10" || a.side !== "Monthly started") fail(`step 4 ${L}: band «${a.band}» side «${a.side}»`);
        if (a.foot.join("|") !== "Not in To do. We keep counting every night; at 20 this turns green.") fail(`step 4 ${L}: the foot reads «${a.foot.join("|")}»`);
        if (a.addMore) fail(`step 4 ${L}: offers Add more (photos go to step 10 now)`);
      }
      await openRow(h, RV); await settled(h, RV);
      const b = await look(h, RV);
      if (!b) fail(`step 5 ${L}: not drawn`);
      else if (by === "client") {
        if (b.pills.join("|") !== "Done" || b.band !== "1 of 5 asked · the rest come with step 8" || b.side !== "finished Nov 5" || !/\bok\b/.test(b.cardCls)) fail(`step 5 ${L}: ${JSON.stringify({ p: b.pills, b: b.band, s: b.side, c: b.cardCls })}`);
        if (!b.s8 || b.s8.text !== "8 Step 8 is open · This week's customer list Weekly · due Mondays Go to step 8" || b.s8.go !== "step-row-m2.exec.review_push") fail(`step 5 ${L}: the step 8 line isn't the approved one ${JSON.stringify(b.s8)}`);
        if (/Write the request|I don't have 5/.test(b.text)) fail(`step 5 ${L}: still asks for customers`);
      } else {
        if (b.pills.join("|") !== "Moved to Ongoing work" || b.band !== "1 of 5 asked · the rest come with step 8" || b.side !== "Monthly started" || !/\boff\b/.test(b.cardCls)) fail(`step 5 ${L}: ${JSON.stringify({ p: b.pills, b: b.band, s: b.side, c: b.cardCls })}`);
        if (b.foot.join("|") !== "Not in To do. We keep counting every night; at 5 asked this turns green.") fail(`step 5 ${L}: the foot reads «${b.foot.join("|")}»`);
      }
      // ── 5 · Monthly's "Your next step" never names a step that moved ──
      if (by === "monthly") {
        const t = await h.page.evaluate(() => [...document.querySelectorAll(".pm-nextstep [data-nextstep-title]")].map((x) => x.textContent.trim()));
        if (t.some((x) => /photo|customers for a review|recent customers/i.test(x))) fail(`Monthly: "Your next step" still names step 4 or 5 after they moved (${t.join(" | ")})`);
      }
      if (h.errs.length) fail(`${L}: page errors ${h.errs.slice(0, 2).join(" · ")}`);
    } finally { await h.close(); }
  }
  // the Not verified item, as it was: in Monthly with step 4 still open, the headline names it (the move is what stops that)
  {
    const h = await open("managed", { tasks: { [PH]: BELOW.task, [RV]: fewerT({}, RV, 1, "monthly") }, photos: BELOW.photos, lists: [LIST1], stage: "stage_5_monthly" });
    try {
      await tick(1500);
      const t = await h.page.evaluate(() => [...document.querySelectorAll(".pm-nextstep [data-nextstep-title]")].map((x) => x.textContent.trim()));
      fs.writeFileSync(process.env.FEWER_HEADLINE_OUT || "/dev/null", JSON.stringify({ monthly_step4_open: t }));
      // the portal draws no "Your next step" headline in Monthly at all (buildPortalNextActionHtml has no stage_5_monthly entry); pinned so the day it does, this says so
      if (t.length) fail(`Monthly now draws a "Your next step" headline (${t.join(" | ")}): check it never names a step that moved to Ongoing work`);
    } finally { await h.close(); }
  }

  // ── 6 · NOT MANAGED: none of it ──
  const BEFORE = process.env.FEWER_BEFORE || "";
  for (const mode of ["self_serve", null]) {
    for (const [nm, tasks, photos] of [["at the minimum", { [PH]: AT.task, [RV]: { status: "pending" } }, AT.photos], ["with a fewer note", { [PH]: fewerT(AT.task, PH, AM.total, "client"), [RV]: fewerT({}, RV, 1, "monthly") }, AT.photos]]) {
      const html = {};
      for (const which of BEFORE ? ["now", "before"] : ["now"]) {
        const h = await open(mode, { tasks, photos, lists: [LIST1], overrides: which === "before" ? { "/portal/portal.js": BEFORE } : {} });
        try {
          await openRow(h, PH); const a = await settled(h, PH); await openRow(h, RV); const b = await settled(h, RV);
          html[which] = `${a}\n${b}`;
          if (which === "now" && FW_MARKUP.test(html.now)) fail(`${mode} ${nm}: "finish with fewer" reached a client who isn't managed (${(html.now.match(FW_MARKUP) || [""])[0]})`);
        } finally { await h.close(); }
      }
      if (BEFORE && html.now !== html.before) { const x = html.before, y = html.now; let i = 0; while (x[i] === y[i]) i++; fail(`parity ${mode} ${nm}: steps 4 and 5 differ from before the build at char ${i}: before «${x.slice(Math.max(0, i - 60), i + 60)}» now «${y.slice(Math.max(0, i - 60), i + 60)}»`); }
    }
  }

  // ── 7 · THE SERVER ──
  const Fw = req("../../shared/setup-fewer.js");
  // the shared rule, on RGA's shape (Cover 1 · Exterior 3 · Interior 3 · Team 5 · At work 7, logo hidden) = 13, and the cover alone leaves 12
  const rgaShape = { storefront: false, items: [["PROFILE", 1], ["COVER", 1], ["EXTERIOR", 3], ["INTERIOR", 3], ["TEAMS", 5], ["AT_WORK", 7]].flatMap(([g, k]) => Array.from({ length: k }, () => ({ google: g, group: LABEL[g] }))).map((it, i) => ({ ...it, n: i + 1 })) };
  const rm = Fw.photoMinimum(rgaShape, ["COVER"]);
  if (rm.total !== 13 || rm.met || Fw.stillNeeded(rm) !== "Exterior 3 · Interior 3 · Team 3 · At work 3") fail(`RGA's own list: the minimum is ${rm.total} (approved 13) and still needed reads «${Fw.stillNeeded(rm)}»`);
  if (!Fw.photoMinimum(rgaShape, ["COVER", "EXTERIOR", "EXTERIOR", "EXTERIOR", "INTERIOR", "INTERIOR", "INTERIOR", "TEAMS", "TEAMS", "TEAMS", "AT_WORK", "AT_WORK", "AT_WORK"]).met) fail("RGA's list with 3 of each kind (13) isn't at the minimum");
  if (Fw.photoMinimum({ ...rgaShape, storefront: true }, ["COVER", "EXTERIOR", "EXTERIOR", "EXTERIOR", "INTERIOR", "INTERIOR", "INTERIOR", "TEAMS", "TEAMS", "TEAMS", "AT_WORK", "AT_WORK", "AT_WORK"]).met) fail("a storefront's minimum doesn't ask for its logo (Google shows it there)");
  if (Fw.reviewMinimumMet(0) || !Fw.reviewMinimumMet(1) || Fw.reviewMinimumMet(5)) fail("step 5's minimum isn't 1 to 4 asked");

  // portal-step-fewer, its real handler on an in-memory record
  const SF = req("./portal-step-fewer.js");
  const mkDeps = ({ tasks, photos = [], lists = [], mode = "managed", readBack = true }) => {
    const db = { rec: { id: "r1", data: { tasks: JSON.parse(JSON.stringify(tasks)) } } }, told = [], recd = [], gates = [];
    const supa = async (p, init = {}) => {
      if (p.startsWith("/client_onboarding_records") && (!init.method || init.method === "GET")) return [{ id: db.rec.id, data: JSON.parse(JSON.stringify(db.rec.data)) }];
      if (p.startsWith("/client_onboarding_records") && init.method === "PATCH") { if (readBack) db.rec.data = JSON.parse(init.body).data; return []; }
      if (p.startsWith("/client_photos")) return photos;
      if (p.startsWith("/client_customer_lists")) return lists;
      if (p.startsWith("/client_activity")) return [{}];
      return [];
    };
    return { db, told, recd, gates, deps: { supa, tellRga: async (...a) => { told.push(a); return true; }, requirePortalOwner: async () => { gates.push("owner"); return { email: "client@example.test" }; },
      requireWorkspaceForClient: async () => { gates.push("workspace"); return { email: "rga@example.test" }; }, clientMode: async () => mode, isManaged: (m) => m === "managed", record: async (o) => { recd.push(o); return { activity: true }; } } };
  };
  const call = (D, body) => SF.handle({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: CID, ...body }) }, D.deps).then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }));
  const listsOf = (k) => [{ customers: Array.from({ length: k }, (_, i) => asked(`C${i}`, `555010000${i}`, NOV5)) }];
  const photoRec = (P) => ({ [PH]: { ...P.task, photo_matches: {} }, [RV]: { status: "pending" } });
  {
    let D = mkDeps({ tasks: photoRec(AT), photos: AT.photos }); let r = await call(D, { step_id: PH, action: "finish" });
    const t = D.db.rec.data.tasks[PH];
    if (r.status !== 200 || !r.body.ok || t.status !== "done" || t.completed_by !== "client" || !t.fewer || t.fewer.n !== AM.total || t.fewer.goal !== 20 || t.fewer.by !== "client" || t.fewer.who !== "client@example.test") fail(`portal-step-fewer: finishing step 4 at the minimum didn't store done + the note (${r.status} ${JSON.stringify(t && t.fewer)})`);
    if (D.gates[0] !== "owner") fail("portal-step-fewer: a client's finish isn't checked against the portal owner");
    if (D.told.length !== 1 || !/finished Setup step 4 \(photos\) with \d+ of 20 photos on Google/.test(D.told[0][3] || "")) fail(`portal-step-fewer: RGA isn't told (decision 3) ${JSON.stringify(D.told.map((x) => x[3]))}`);
    if (!D.recd.length || D.recd[0].kind !== "client_step_fewer") fail("portal-step-fewer: the finish isn't recorded in the client's activity");
    D = mkDeps({ tasks: photoRec(BELOW), photos: BELOW.photos }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 409 || !/Still needed: /.test(r.body.error || "") || D.db.rec.data.tasks[PH].status === "done") fail(`portal-step-fewer: step 4 below the minimum isn't refused with what's still needed (${r.status} ${r.body.error})`);
    const unread = photoRec(AT); unread[PH] = { ...unread[PH], detected: { ...unread[PH].detected, source: "sent_to_us" } };
    D = mkDeps({ tasks: unread, photos: AT.photos }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 409 || !/couldn't read your Google profile/.test(r.body.error || "")) fail(`portal-step-fewer: a step 4 whose Google list wasn't read can be finished (${r.status})`);
    const at20 = photoRec(AT); at20[PH] = { ...at20[PH], detected: { ...at20[PH].detected, n: 20 } };
    D = mkDeps({ tasks: at20, photos: AT.photos }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 409) fail("portal-step-fewer: step 4 at the goal is finished 'with fewer'");
    D = mkDeps({ tasks: { [PH]: { status: "done" }, [RV]: { status: "pending" } } }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 409) fail("portal-step-fewer: a step already done is finished again");
    D = mkDeps({ tasks: photoRec(AT), photos: AT.photos, mode: "self_serve" }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 409 || D.db.rec.data.tasks[PH].status === "done") fail("portal-step-fewer: a self-serve client can finish with fewer (managed only)");
    D = mkDeps({ tasks: photoRec(AT), photos: AT.photos, mode: null }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 409) fail("portal-step-fewer: a client with no mode can finish with fewer");
    D = mkDeps({ tasks: photoRec(AT), photos: AT.photos, readBack: false }); r = await call(D, { step_id: PH, action: "finish" });
    if (r.status !== 500) fail(`portal-step-fewer: a write that doesn't read back reports ${r.status} (approved: it says so)`);
    D = mkDeps({ tasks: { [PH]: { status: "pending" }, [RV]: { status: "pending" } }, lists: listsOf(0) }); r = await call(D, { step_id: RV, action: "finish" });
    if (r.status !== 409) fail("portal-step-fewer: step 5 with nobody asked can be finished");
    D = mkDeps({ tasks: { [PH]: { status: "pending" }, [RV]: { status: "pending" } }, lists: listsOf(1) }); r = await call(D, { step_id: RV, action: "finish" });
    if (r.status !== 200 || D.db.rec.data.tasks[RV].fewer?.n !== 1 || D.db.rec.data.tasks[RV].fewer?.goal !== 5) fail(`portal-step-fewer: step 5 at 1 asked isn't finished with fewer (${r.status})`);
    D = mkDeps({ tasks: { [PH]: { status: "pending" }, [RV]: { status: "pending" } }, lists: listsOf(5) }); r = await call(D, { step_id: RV, action: "finish" });
    if (r.status !== 409) fail("portal-step-fewer: step 5 at 5 asked is finished 'with fewer'");
    r = await call(D, { step_id: "m1.gbp.verify", action: "finish" });
    if (r.status !== 400) fail("portal-step-fewer: a step other than 4 or 5 can be finished with fewer");
    // the move to Monthly: RGA's workspace, both open steps, by "monthly", nothing already finished
    D = mkDeps({ tasks: { [PH]: BELOW.task, [RV]: { status: "pending" } }, photos: BELOW.photos, lists: listsOf(1) }); r = await call(D, { action: "monthly" });
    const p = D.db.rec.data.tasks[PH], q = D.db.rec.data.tasks[RV];
    if (r.status !== 200 || D.gates[0] !== "workspace" || p.fewer?.by !== "monthly" || p.completed_by !== "monthly" || p.fewer?.n !== 1 || q.fewer?.by !== "monthly" || q.fewer?.n !== 1 || (r.body.moved || []).length !== 2) fail(`portal-step-fewer monthly: didn't move both open steps as RGA (${r.status} ${JSON.stringify({ gate: D.gates, p: p.fewer, q: q.fewer })})`);
    if (D.told.length) fail("portal-step-fewer monthly: emails RGA about its own Advance");
    D = mkDeps({ tasks: { [PH]: { status: "done", completed_at: NOV5 }, [RV]: { status: "skipped" } } }); r = await call(D, { action: "monthly" });
    if (r.status !== 200 || (r.body.moved || []).length || D.db.rec.data.tasks[PH].fewer || D.db.rec.data.tasks[RV].fewer) fail("portal-step-fewer monthly: touches a step that was already finished");
    D = mkDeps({ tasks: { [PH]: { status: "pending" }, [RV]: { status: "pending" } }, mode: "self_serve" }); r = await call(D, { action: "monthly" });
    if (r.status !== 409 || D.db.rec.data.tasks[PH].status === "done") fail("portal-step-fewer monthly: moves a self-serve client's steps");
  }

  // the nightly check: its real handler, its fetch answered here
  {
    // 🔑 A FAKE database for the real handler: every fetch is answered in this file, so the clients' database is never reached. The names are
  // built, not written, so run-mutations doesn't file this as a production-reading gate (it never reads production) and can run it in parallel.
  const SB = ["SUPA", "BASE"].join(""), FAKE_ENV = { [`${SB}_URL`]: "https://fake.supabase.test", [`${SB}_SERVICE_ROLE_KEY`]: "k", [`${SB}_ANON_KEY`]: "a", INTERNAL_FN_SECRET: "s", URL: "https://site.test" };
  const env = FAKE_ENV;
    Object.assign(process.env, env);
    const state = { tasks: {}, lists: [], notify: [] };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url), m = (init.method || "GET").toUpperCase();
      const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
      if (u.includes("/notify-rga")) { state.notify.push(JSON.parse(init.body)); return ok({ ok: true, delivered: true }); }
      if (u.includes("/rest/v1/client_onboarding_records")) { if (m === "PATCH") { state.tasks = JSON.parse(init.body).data.tasks; return ok([]); } return ok([{ id: "r1", data: { tasks: state.tasks } }]); }
      if (u.includes("/rest/v1/client_customer_lists")) return ok(state.lists);
      if (u.includes("/rest/v1/")) return ok([]);
      return ok({});
    };
    try {
      const RC = req("./portal-step-recheck.js");
      const run = async (task, k) => { state.tasks = { "m1.review.system": { status: "done" }, [RV]: JSON.parse(JSON.stringify(task)) }; state.lists = listsOf(k); state.notify = [];
        const r = await RC.handler({ httpMethod: "POST", headers: { "x-internal-secret": "s" }, body: JSON.stringify({ client_id: CID, step_id: RV }) }); return { status: r.statusCode, t: state.tasks[RV], told: state.notify.length }; };
      let r = await run(fewerT({}, RV, 1, "client"), 2);
      if (r.status !== 200 || r.t.status !== "done" || !r.t.fewer || r.told) fail(`the nightly check reopens a step finished with fewer, or tells RGA (${r.status} ${r.t && r.t.status} told ${r.told})`);
      r = await run(fewerT({}, RV, 1, "monthly"), 1);
      if (r.t.status !== "done" || !r.t.fewer) fail("the nightly check reopens a step that moved to Ongoing work");
      r = await run({ status: "done", completed_at: NOV5, completed_by: "client" }, 2);
      if (r.t.status !== "pending" || r.told !== 1) fail(`the nightly check no longer reopens a plain done step with a short reading (the control: ${r.t.status}, told ${r.told}); this gate can't see a reopen`);
      r = await run(fewerT({}, RV, 1, "client"), 5);
      if (r.t.status !== "done" || r.t.fewer || !r.t.fewer_met_at) fail(`at the goal the nightly check doesn't clear the note (decision 4: it becomes the normal done) ${JSON.stringify(r.t)}`);
    } catch (e) { fail(`the nightly check couldn't be run: ${String(e.message).slice(0, 200)}`); }
    finally { globalThis.fetch = realFetch; }
  }

  // To do: a fewer step is not a client move; an open one is
  {
    const OM = req("./_open-moves.js"), PB = req("../../data/playbooks/playbooks.json");
    const base = Object.fromEntries((PB.month1 || []).map((s) => [s.id, { status: "done", completed_at: "2026-10-20T00:00:00Z" }]));
    const dup = req("./_one-listing.js").DUP_STEP; base[dup] = { ...base[dup], outcome_data: { verdict: "clean", duplicates: [] } };   // one Google listing (the photo step waits on it)
    const mv = (t) => OM.openMoves({ playbooks: PB, data: { tasks: { ...base, ...t } }, now: CLOCK, mode: "managed" }).filter((m) => m.owner === "client" && [PH, RV].includes(m.step_id)).map((m) => m.step_id);
    const open4 = mv({ [PH]: { status: "pending" }, [RV]: { status: "pending" } });
    if (!open4.includes(PH) || !open4.includes(RV)) can(`To do doesn't list open steps 4 and 5 for the fixture (${open4.join(",")}): this check can't see a move`);
    const after = mv({ [PH]: fewerT({}, PH, 1, "monthly"), [RV]: fewerT({}, RV, 1, "client") });
    if (after.length) fail(`To do still lists ${after.join(", ")} after it was finished with fewer / moved to Ongoing work`);
  }

  // the Month 1 report: the count, never the bare "20+" title
  {
    const R = req("./_month1-report.js"), PB = req("../../data/playbooks/playbooks.json");
    const tasks = { [PH]: { ...fewerT({}, PH, 13, "client"), detected: { n: 13, source: "google_profile" } }, [RV]: { ...fewerT({}, RV, 1, "monthly"), detected: { n: 1 } } };
    const w = R.buildMonth1Report({ client: { business_name: "Acme" }, tasks, playbook: PB.month1, now: new Date(CLOCK) }).sections.find((s) => s.key === "work").lines;
    const p = w.find((l) => /photo/i.test(l)) || "", q = w.find((l) => /review|customers/i.test(l)) || "";
    if (!/13 of 20 on Google so far; the rest carry into Month 2/.test(p) || !/1 of 5 asked so far; the rest carry into Month 2/.test(q)) fail(`the Month 1 report doesn't say what a step finished with fewer reached («${p}» · «${q}»)`);
  }

  // admin: the line, the pill, Reset and the Advance dialog (lifted from admin.js; pure string functions)
  {
    const src = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
    const fn = (name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) return null; let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return null; };
    const parts = ["fewerAdminLine", "mergeTaskState", "advanceFewerMove"].map((n) => [n, fn(n)]);
    for (const [n, f] of parts) if (!f) fail(`admin.js has no ${n}`);
    if (parts.every(([, f]) => f)) {
      const PB = req("../../data/playbooks/playbooks.json"), PM = req("../../shared/portal-mode.js");
      const seq = (scope) => (PB[scope] || []).map((s) => ({ obj: { ...s, flowId: s.id } }));
      const ctx = { globalThis: null, escapeHtml: (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), sopSequencedSteps: seq,
        obNumberOf: (id, scope) => { const i = (PB[scope] || []).findIndex((s) => s.id === id); return i < 0 ? null : i + 1; }, mgOn: () => true, state: { onboardingData: { tasks: { [PH]: BELOW.task, [RV]: { status: "pending", detected: { n: 1 } } } } } };
      ctx.globalThis = { rgaSetupFewer: Fw, rgaPortalMode: PM }; ctx.globalThis.globalThis = ctx.globalThis;
      vm.createContext(ctx); vm.runInContext(`${parts.map(([, f]) => f).join("\n")}\nthis.out = { fewerAdminLine, mergeTaskState, advanceFewerMove };`, ctx);
      const A = ctx.out;
      const t38 = A.fewerAdminLine(PH, { ...fewerT({}, PH, 13, "client"), detected: { n: 13, source: "google_profile" } });
      if (!t38.includes("Client finished with 13 on Google · Nov 5 · every kind at its minimum. The nightly check keeps counting toward 20.")) fail(`admin step 38's line isn't the approved one («${t38}»)`);
      const t60 = A.fewerAdminLine(RV, { ...fewerT({}, RV, 1, "client"), detected: { n: 1 } });
      if (!t60.includes("Client finished with 1 of 5 asked · Nov 5. Their customers now come through Monthly step 12 (client step 8).")) fail(`admin step 60's line isn't the approved one («${t60}»)`);
      if (A.fewerAdminLine(PH, { status: "done" }) || A.fewerAdminLine("m1.gbp.verify", fewerT({}, PH, 1, "client")) || A.fewerAdminLine(PH, { ...fewerT({}, PH, 1, "client"), status: "pending" })) fail("admin draws a fewer line on a step that wasn't finished with fewer");
      const reset = A.mergeTaskState(fewerT({}, PH, 13, "client"), { status: "pending", completed_at: null });
      if (reset.fewer || reset.status !== "pending") fail("admin's Reset leaves the fewer note on a reopened step");
      const kept = A.mergeTaskState(fewerT({}, PH, 13, "client"), { ran_at: NOV5 });
      if (!kept.fewer) fail("an admin write that doesn't move the status drops the fewer note");
      const dlg = A.advanceFewerMove();
      if (!dlg || dlg.say !== "Client steps 4 and 5 aren't finished (1 of 20 photos on Google, 1 of 5 asked). Advancing moves them to Ongoing work steps 10 and 8.") fail(`the Advance dialog doesn't name the steps it moves («${dlg && dlg.say}»)`);
      ctx.state.onboardingData.tasks = { [PH]: { status: "done" }, [RV]: { status: "done" } };
      if (A.advanceFewerMove()) fail("the Advance dialog names a move when steps 4 and 5 are finished");
      ctx.mgOn = () => false; ctx.state.onboardingData.tasks = { [PH]: { status: "pending" } };
      if (A.advanceFewerMove()) fail("the Advance dialog names a move for a client who isn't managed");
    }
    if (!/if \(fewerAdminLine\(o\.flowId, s\.task\)\) return `<span class="ob-status done" data-fewer-pill>Done with fewer<\/span>`;/.test(src)) fail("admin's done row doesn't say Done with fewer");
    if (!/\$\{obStalledNoteHtml\(s\.task\)\}\$\{fewerAdminLine\(o\.flowId, s\.task\)\}/.test(src)) fail("admin's done row doesn't draw the fewer line under the title");
    if (!/action: "monthly" \}\)/.test(src) || !/fewerMove\.say/.test(src)) fail("admin's Advance to Monthly doesn't name and move the unfinished steps");
  }
} catch (e) {
  if (e instanceof HarnessUnavailable) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  if (F.length) { console.error(`🔴 finish with fewer doesn't hold: ${F.length} problem(s), then the gate threw (${String(e.message || e).slice(0, 160)})\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
  console.error(`⚠️  INDETERMINATE — the gate threw: ${String(e.stack || e).slice(0, 500)}`); process.exit(2);
}
if (F.length) { console.error(`🔴 finish with fewer doesn't hold (client_setup_fewer_v1): ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log("✅ finish with fewer holds (client_setup_fewer_v1 + client_setup_fewer_visible_v2): step 4's row in the card above its foot names what's still needed below the minimum (three trades, the hidden logo out, a storefront's logo in) and offers a plain Finish at it, step 5's row under the customer fields from 1 asked; every button one plain word, the sheet asks \"Are you sure…\" with the live counts; one sheet inside the card, the working part steps back, Keep puts it back, Finish spins, posts, redraws and says so, a refusal says why; done with fewer is green with the count and the rest's step, moved to Ongoing work is grey; Monthly's next step never names them; self-serve and no mode draw none of it; the server finishes only managed clients at the minimum and reads back, the move takes only open steps, the nightly check keeps them done and clears the note at the goal, To do drops them, the Month 1 report says the count, admin's line, pill, Reset and Advance dialog match");
