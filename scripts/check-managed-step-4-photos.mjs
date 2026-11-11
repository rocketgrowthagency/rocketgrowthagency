#!/usr/bin/env node
// check-managed-step-4-photos.mjs — a MANAGED client's step 4 (photos), DRAWN. Approved client_step04_photos_v1 (11-4, its three decisions as
// recommended; the owner: "step 4 approved … build and go live. just be sure spacing is fixed on live").
//
// BOOTS THE REAL PORTAL in headless Chrome (scripts/lib/portal-boot-harness.mjs: the real portal.js + portal.css, our fake database, nothing
// leaves the laptop) for invented clients of three shapes, each with its own trade's real shot list (netlify/functions/_photo-lists.js):
// a marketing agency and a plumber that go to their customers, and a hair salon with a public address. HOLDS:
//   1 · NOT MANAGED DRAWS AS BEFORE. self_serve, no mode and a missing column draw the same step 4, with none of the managed markup; and when
//       STEP4_BEFORE_DIR names a copy of the site from before this build, byte for byte what that older portal drew.
//   2 · THE LOGO LEAVES THE 20 for a business with no public address, and the kind with the most room takes one more shot (filed under the next
//       free shot number); the client reads shots 1 to 20 in the new order. A storefront keeps its logo shot.
//   3 · ONE KIND AT A TIME: a kind's first 3 shots, the open one among them, its chip marked; "+ N more <kind> shots" opens the kind, "See all
//       20 shots" the full grid, "Show one kind at a time" goes back; a chip or ‹ Shot › moves the tiles to that shot's kind. A business that
//       goes to its customers opens on At work.
//   4 · WHAT COUNTS, under the band: one line per photo Google holds (counted ones by kind), the count beside it, and the lines add up to the
//       band. The logo Google hides says "Google hides it" (0); the old logo copy is one line with "Let RGA remove it" (no card of its own).
//       A failed read of Google's list draws no lines.
//   5 · WORDS: never "Saved, not showing" and never "Google asked us to change something" on a managed step 4; a photo Google didn't take says
//       "Google didn't take it yet. RGA is fixing it; nothing needed from you." An answered team question is one line, "Just me · Change".
//       A messages row holding only RGA's emails reads "Emails from RGA · N".
//   6 · SPACING, at every width from 360 to 1440 (every 20px) in both views: no two tiles overlap, every chip sits inside its photo and every
//       name inside its tile, nothing clips, the page never scrolls sideways.
// exit 0 = holds · 1 = a drawn step 4 is wrong · 2 = can't tell (no browser, the page didn't boot, a fixture can't be built)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { bootPortal, HarnessUnavailable, SITE } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const F = [], fail = (m) => F.push(m);
const can = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const BEFORE = process.env.STEP4_BEFORE_DIR || "";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const ROW = '[id="step-row-m1.gbp.photos"]';
let buildShotList;
try { ({ buildShotList } = createRequire(path.join(SITE, "netlify/functions/_x.js"))("./_photo-lists.js")); } catch (e) { can(`the shot lists don't load (${e.message})`); }
const list = (type, storefront, teamSize = null) => { const L = buildShotList({ typeOverride: type, storefront, teamSize }); if (!L.ok) can(`no ${type} list`); return { items: L.items, groups: L.groups, count: L.count, list: L.list, listName: L.listName, type: L.type, storefront: L.storefront, teamSize: L.teamSize }; };
const NOW = Date.now(), ago = (d) => new Date(NOW - d * 86400000).toISOString();

// ── the three clients (invented) ──
const agencyShape = list("Marketing agencies", false, "1");
const agency = {
  task: { status: "pending", team_size: "1", draft_shape: agencyShape, photo_ai: { google: { "m/copy": { slot: 1, what: "a logo" } } }, photo_kept: { "m/copy": { at: "2026-10-16T01:58:45Z" } },
    detected: { n: 1, n_all: 3, threshold: 20, source: "google_profile", at: ago(0.2), items: [{ name: "m/copy", category: "EXTERIOR", at: "2025-12-02T16:41:12Z" }, { name: "m/logo", category: "PROFILE", at: "2026-10-09T18:00:00Z" }, { name: "m/cover", category: "COVER", at: "2026-10-31T22:23:43Z" }] } },
  photos: [
    { id: "p-logo", client_id: "C", storage_path: "c/logo.png", category: "logo", shot_n: 1, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-09T17:59:50Z", gbp_media_name: "m/logo", created_at: "2026-10-09T17:00:00Z" },
    { id: "p-cover", client_id: "C", storage_path: "c/cover.jpg", category: "cover", shot_n: 2, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-31T22:23:39Z", gbp_media_name: "m/cover-up", created_at: "2026-10-31T22:20:00Z" },
    // a photo Google didn't take (a connection error RGA fixes), and one with RGA, so the tile chips and the words are drawn
    { id: "p-fail", client_id: "C", storage_path: "c/team.jpg", category: "team", shot_n: 9, publish_state: "failed", created_at: ago(1) },
    { id: "p-rev", client_id: "C", storage_path: "c/team2.jpg", category: "team", shot_n: 10, publish_state: "in_review", created_at: ago(1) },
  ],
};
const plumberShape = list("Plumbers", false, null);
const plumber = { task: { status: "pending", draft_shape: plumberShape, detected: { n: 0, n_all: 0, threshold: 20, source: "google_profile", at: ago(0.2), items: [] } }, photos: [] };
const salonShape = list("Hair salons", true, null);
const salon = { task: { status: "pending", draft_shape: salonShape, detected: { n: 1, n_all: 1, threshold: 20, source: "google_profile", at: ago(0.2), items: [{ name: "m/slogo", category: "PROFILE", at: "2026-10-20T10:00:00Z" }] } },
  photos: [{ id: "s-logo", client_id: "C", storage_path: "s/logo.png", category: "logo", shot_n: 1, publish_state: "published", pushed_to_gbp: true, pushed_at: "2026-10-20T09:59:58Z", gbp_media_name: "m/slogo", created_at: "2026-10-20T09:00:00Z" }] };
const EMAIL = { id: "e1", step_id: "m1.gbp.photos", letter: true, message: "Your photo step is waiting\n\nHi Pat,\n\nYour photo step is open.", at: "2026-10-23T15:00:00Z" };

// a busy machine can be slow to boot a page: one more try before "can't tell" (a page that draws wrong still fails on the first)
async function open(c, mode, overrides = {}, extra = {}) {
  try { return await open1(c, mode, overrides, extra); }
  catch (e) { if (!(e instanceof HarnessUnavailable) && e?.name !== "TimeoutError") throw e; return open1(c, mode, overrides, extra); }
}
async function open1(c, mode, overrides = {}, extra = {}) {
  const S = SCENARIOS.allMatch || SCENARIOS.plumber;
  const done = (o = {}) => ({ status: "done", completed_at: "2026-11-02T18:00:00Z", completed_by: "rga", ...o });
  const tasks = { ...S.tasks, ...RGA_CARD_TASKS, "m1.gbp.business_facts": done(), "m1.gbp.hours_attributes": done(), "m1.gbp.services_products": done(), "m1.gbp.attributes": done(), "m1.gbp.booking_link": done(), "m1.gbp.photos": c.task };
  const h = await bootPortal({ mode, tasks, now: S.now, verify: S.verify, tables: { client_photos: c.photos.map((p) => ({ ...p, client_id: "11111111-1111-4111-8111-111111111111" })) }, fns: { "portal-thread": () => ({ ok: true, messages: extra.thread || [] }) }, viewport: extra.viewport || 1100 }, overrides, SITE);
  try { await h.ready(`${ROW}`, 40000); } catch { await h.close(); throw new HarnessUnavailable(`step 4 never drew (${h.errs[0] || "no error"})`); }
  // setup_vs_month1_v1 (approved 11-10): a MANAGED client's photos are Month 1 work, drawn in the Month 1 card on Ongoing work; self-serve keeps them in Setup
  await h.page.evaluate((m) => document.querySelector(`.portal-nav a[data-view=${m === "managed" ? "ongoing" : "setup"}]`)?.click(), mode);
  await tick(400);
  // open the row if it's folded (the way a person would)
  await h.page.evaluate((R) => { const r = document.querySelector(R); if (r && !r.querySelector(".pm-p10")?.offsetParent) r.querySelector("[data-step-toggle]")?.click(); }, ROW);
  await tick(500);
  return h;
}
const rowHtml = async (h) => { let last = "", same = 0; for (let i = 0; i < 30 && same < 3; i++) { await tick(250); const now = await h.page.evaluate((R) => document.querySelector(R)?.outerHTML || "", ROW); same = now === last ? same + 1 : 0; last = now; } return last; };
const state = (h) => h.page.evaluate((R) => {
  const row = document.querySelector(R), host = row && row.querySelector(".pm-p10");
  if (!host) return null;
  const tiles = [...host.querySelectorAll(".pm-p10-t")];
  const shot = row.querySelector("[data-p10-shot]:not([hidden]) .pm-p10-hd span");
  return {
    all: tiles.map((t) => ({ n: Number(t.getAttribute("data-p10-t")), num: t.querySelector(".n").textContent, lab: t.querySelector(".lab").textContent, chip: (t.querySelector(".pm-p10-chip") || {}).textContent || "", hidden: t.hidden, g: t.getAttribute("data-p10-g") })),
    shown: tiles.filter((t) => !t.hidden && t.offsetParent).map((t) => t.querySelector(".n").textContent).join(","),
    onScreen: tiles.filter((t) => t.offsetParent && t.getBoundingClientRect().width > 0).length,
    show: host.getAttribute("data-p10-show"), more: (row.querySelector("[data-p10-more-line]") || {}).textContent || "",
    shot: shot ? shot.textContent : "", cur: [...row.querySelectorAll(".pm-cs-chips .pm-cs-chip.cur")].map((c) => c.textContent.trim()).join("|"),
    chips: [...row.querySelectorAll(".pm-cs-chips .pm-cs-chip")].map((c) => c.textContent.trim()),
    band: (row.querySelector(".pm-k5-h b") || {}).textContent || "",
    lines: [...row.querySelectorAll("[data-photo-counts] .pm-p10-cl")].map((l) => ({ text: l.querySelector(":scope > span:nth-child(2)").innerText.replace(/\s+/g, " ").trim(), n: (l.querySelector(".pm-p10-cn") || {}).textContent ?? null, act: (l.querySelector(".pm-linkbtn") || {}).textContent || "", mark: l.querySelector(".mk").className })),
    text: row.innerText.replace(/\s+/g, " "),
    team: (row.querySelector("[data-p10-team]") || {}).innerText || "",
    teamTop: [...row.querySelectorAll("[data-photo-team]")].filter((q) => q.offsetParent).length,
    mails: (row.closest(".pm-step-row")?.querySelector(".pm-cs-msgs summary b") || row.querySelector(".pm-cs-msgs summary b") || {}).textContent || "",
  };
}, ROW);
const click = async (h, sel) => { const ok = await h.page.evaluate((R, s) => { const b = [...document.querySelector(R).querySelectorAll(s)].find((x) => x.offsetParent); if (!b) return false; b.click(); return true; }, ROW, sel); await tick(300); return ok; };
const measure = (h) => h.page.evaluate((R) => {
  const row = document.querySelector(R), T = [...row.querySelectorAll(".pm-p10-t")].filter((t) => t.offsetParent);
  const rs = T.map((t) => t.getBoundingClientRect()), bad = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) bad.push(`tiles ${T[i].querySelector(".n").textContent} and ${T[j].querySelector(".n").textContent} overlap`); }
  for (const t of T) {
    const tr = t.getBoundingClientRect(), im = t.querySelector(".im").getBoundingClientRect();
    for (const lab of t.querySelectorAll(".pm-p10-chip, .lab, .n")) {
      const r = lab.getBoundingClientRect(), box = lab.classList.contains("lab") ? tr : im;
      if (lab.scrollWidth > lab.clientWidth + 1 || lab.scrollHeight > lab.clientHeight + 1 || r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) bad.push(`"${lab.textContent.trim()}" clips (${Math.round(r.width)}×${Math.round(r.height)} in ${Math.round(box.width)}×${Math.round(box.height)})`);
    }
    const chip = t.querySelector(".pm-p10-chip"), n = t.querySelector(".n");
    if (chip && n) { const a = chip.getBoundingClientRect(), b = n.getBoundingClientRect(); if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(`"${chip.textContent.trim()}" covers the shot number`); }
  }
  const d = document.documentElement;
  if (d.scrollWidth > d.clientWidth + 1) bad.push(`the page scrolls sideways (${d.scrollWidth} > ${d.clientWidth})`);
  return { n: T.length, bad };
}, ROW);
const MG_MARKUP = /is-mg|data-photo-counts|pm-p10-more|data-p10-g=|data-p10-team|Emails from RGA|Google hides it|Google didn't take it yet/;

try {
  // ── 1 · not managed draws as before ──
  for (const [nm, c] of [["agency", agency], ["plumber", plumber], ["salon", salon]]) {
    const html = {};
    for (const mode of ["self_serve", null, "column_missing"]) {
      const b = await open(c, mode, {}, { thread: [EMAIL] });
      try {
        html[mode] = await rowHtml(b);
        if (!html[mode]) fail(`${nm}/${mode}: step 4 didn't draw`);
        if (MG_MARKUP.test(html[mode])) fail(`${nm}/${mode}: managed step 4 reached a client who is not managed (${(html[mode].match(MG_MARKUP) || [""])[0]})`);
        if (BEFORE) {
          const ov = { "/portal/portal.js": path.join(BEFORE, "portal/portal.js"), "/shared/photo-second-logo.js": path.join(BEFORE, "shared/photo-second-logo.js") };
          if (!fs.existsSync(ov["/portal/portal.js"])) can(`STEP4_BEFORE_DIR has no portal/portal.js (${BEFORE})`);
          const a = await open(c, mode, ov, { thread: [EMAIL] });
          try { const x = await rowHtml(a), y = html[mode]; if (x !== y) { let i = 0; while (x[i] === y[i]) i++; fail(`parity ${nm}/${mode}: step 4 differs from before the build at char ${i}: before «${x.slice(Math.max(0, i - 60), i + 60)}» now «${y.slice(Math.max(0, i - 60), i + 60)}»`); } }
          finally { await a.close(); }
        }
      } finally { await b.close(); }
    }
    if (html.self_serve !== html[null] || html[null] !== html.column_missing) fail(`${nm}: self-serve, no mode and a missing column don't draw the same step 4`);
  }

  // ── 2–5 · the agency (goes to customers, logo hidden, a kept old copy, a photo Google didn't take, one with RGA) ──
  const h = await open(agency, "managed", {}, { thread: [EMAIL] });
  try {
    await rowHtml(h);
    const s = await state(h);
    if (!s) fail("agency: managed step 4 has no tiles");
    else {
      const stored = agencyShape.items, logoN = stored.find((it) => it.google === "PROFILE").n;
      if (s.all.length !== 20) fail(`agency: the 20 aren't 20 (${s.all.length})`);
      if (s.all.some((t) => t.n === logoN)) fail("agency: the logo is still one of the 20 for a business with no public address");
      if (s.all.map((t) => t.num).join(",") !== Array.from({ length: 20 }, (_, i) => i + 1).join(",")) fail(`agency: the shots aren't read 1 to 20 in order (${s.all.map((t) => t.num).join(",")})`);
      const extra = s.all.find((t) => t.n === Math.max(...stored.map((it) => Number(it.n))) + 1);
      // the kind with the most room = most shots needing no space of their own: At work (6) beats Team (5) on this list
      if (!extra || extra.lab !== "Work" || extra.num !== "20") fail(`agency: the extra shot isn't the 20th, an At work shot (${JSON.stringify(extra)})`);
      if (s.all.filter((t) => t.lab === "Work").length !== 8) fail("agency: At work doesn't hold 8 shots");
      // one kind at a time, opening on At work
      if (s.show !== "3" || s.shown !== "13,14,15" || s.cur !== "At work 0/8" || !/^Shot 13 of 20 · At work 1 of 8$/.test(s.shot)) fail(`agency: it doesn't open on At work's first 3 shots (${s.shown} · ${s.cur} · ${s.shot})`);
      if (s.onScreen !== 3) fail(`agency: ${s.onScreen} tiles are on screen, not one kind's 3 (a hidden tile still draws)`);
      if (s.more !== "+ 5 more At work shots · See all 20 shots") fail(`agency: the line under the tiles is "${s.more}"`);
      if (s.chips.join("|") !== "Exterior 0/3|Interior 0/3|Team 0/5|At work 0/8") fail(`agency: the chips aren't the kinds still to take (${s.chips.join("|")})`);
      // what counts
      const L = s.lines;
      if (L.length !== 3) fail(`agency: what counts isn't 3 lines (${L.length})`);
      else {
        if (!/^Your cover photo · counts On Google's list since Oct 31$/.test(L[0].text) || L[0].n !== "1" || !/\bok\b/.test(L[0].mark)) fail(`agency: the cover line (${JSON.stringify(L[0])})`);
        if (!/^Your logo · Google hides it Google shows a logo only for a business with a public address\. Yours goes to customers, so it doesn't count\. Nothing to do\.$/.test(L[1].text) || L[1].n !== "0" || !/\bover\b/.test(L[1].mark)) fail(`agency: the hidden logo line (${JSON.stringify(L[1])})`);
        if (!/^An old copy of your logo · from Dec 2, 2025 You kept it Oct 1[56]\. It doesn't count, and RGA recommends removing it\. Your cover is on Google now, so your profile keeps a photo\.$/.test(L[2].text) || L[2].act !== "Let RGA remove it") fail(`agency: the old copy line (${JSON.stringify(L[2])})`);
        const sum = L.reduce((a, l) => a + (Number(l.n) || 0), 0), band = Number((s.band.match(/^(\d+) of 20/) || [])[1]);
        if (sum !== band) fail(`agency: the lines (${sum}) don't add up to the band (${s.band})`);
      }
      if (/An old logo copy is on your profile/.test(s.text)) fail("agency: the old logo copy still has its own card");
      if (/Saved, not showing/.test(s.text)) fail('agency: "Saved, not showing" on a managed step 4');
      if (s.team !== "Just me · Change") fail(`agency: the answered team question isn't "Just me · Change" (${s.team})`);
      if (s.teamTop !== 0) fail(`agency: the answered team question still shows its four choices (${s.teamTop})`);
      if (s.mails !== "Emails from RGA · 1") fail(`agency: a row of RGA's emails reads "${s.mails}"`);
      const tchip = (n) => (s.all.find((t) => t.num === String(n)) || {}).chip;
      if (tchip(1) !== "On Google's list") fail(`agency: the cover tile says "${tchip(1)}"`);
      // interactions
      if (!(await click(h, "[data-p10-more]"))) fail("agency: no + 5 more");
      let t = await state(h);
      if (t.shown !== "13,14,15,16,17,18,19,20" || t.more !== "See all 20 shots") fail(`agency: + 5 more doesn't open the kind (${t.shown} · ${t.more})`);
      await click(h, "[data-p10-all]"); t = await state(h);
      if (t.shown.split(",").length !== 20 || t.more !== "Show one kind at a time") fail(`agency: See all 20 shots isn't the full grid (${t.shown})`);
      await click(h, "[data-p10-one]"); t = await state(h);
      if (t.shown !== "13,14,15") fail(`agency: Show one kind at a time doesn't go back (${t.shown})`);
      await click(h, '.pm-cs-chips .pm-p10-k[data-p10-kind^="3,"]'); t = await state(h);
      if (t.shown !== "2,3,4" || t.cur !== "Exterior 0/3" || !/^Shot 2 of 20 · Exterior 1 of 3$/.test(t.shot) || t.more !== "See all 20 shots") fail(`agency: the Exterior chip doesn't move the tiles (${t.shown} · ${t.cur} · ${t.shot} · ${t.more})`);
      await click(h, ".pm-p10-shot:not([hidden]) .nav .pm-linkbtn"); t = await state(h);
      if (!/^Shot 1 of 20 · Cover$/.test(t.shot) || t.shown !== "1") fail(`agency: ‹ Shot 1 doesn't move the tiles to the cover (${t.shot} · ${t.shown})`);
      // the failed photo's words
      if (!(await click(h, '.pm-cs-chips .pm-p10-k[data-p10-kind^="9,"]'))) fail("agency: no Team chip");   // its first shot not on Google: the one Google didn't take
      const fx = await h.page.evaluate((R) => document.querySelector(R).querySelector('[data-p10-shot="9"]')?.innerText.replace(/\s+/g, " ") || "", ROW);
      if (!/Google didn't take it yet\. RGA is fixing it; nothing needed from you\./.test(fx) || /Google asked us to change something/.test(fx)) fail(`agency: a photo Google didn't take doesn't say so truthfully (${fx.slice(0, 160)})`);
      if (!/^Shot 8 of 20 · Team 1 of 5$/.test((await state(h)).shot)) fail("agency: the failed team photo isn't shot 8 of 20");
      // Change opens the team question in place
      await click(h, "[data-p10-team-change]");
      const q = await h.page.evaluate((R) => { const r = document.querySelector(R), b = r.querySelector("[data-p10-team-q]"); return { open: !!b && !b.hidden && b.querySelectorAll("[data-team-size]").length === 4, line: !!r.querySelector("[data-p10-team]:not([hidden])") }; }, ROW);
      if (!q.open || q.line) fail("agency: Change doesn't open the team question in place");
      // 6 · spacing, both views, 360 → 1440
      for (const view of ["3", "all"]) {
        await click(h, view === "all" ? "[data-p10-all]" : "[data-p10-one]");
        for (let w = 360; w <= 1440; w += 20) {
          await h.page.setViewport({ width: w, height: 1400 }); await tick(60);
          const m = await measure(h);
          if (!m.n) { fail(`agency ${view} @${w}: no tiles on screen`); break; }
          if (m.bad.length) { fail(`agency ${view} @${w}px: ${m.bad.slice(0, 3).join("; ")}`); break; }
        }
      }
      if (h.errs.length) fail(`agency: page errors (${h.errs.slice(0, 2).join(" | ")})`);
    }
  } finally { await h.close(); }

  // a failed read of Google's list (the last list kept beside it): the band says sent to us, and no line claims what counts
  const down = { ...agency, task: { ...agency.task, detected: { n: 2, threshold: 20, source: "sent_to_us", at: ago(0.2), items: agency.task.detected.items } } };
  const hd = await open(down, "managed");
  try { await rowHtml(hd); const s = await state(hd); if (!s || s.lines.length) fail(`agency, Google unread: what counts is drawn from no list (${s && s.lines.length})`); if (s && !/sent to us/.test(s.band)) fail(`agency, Google unread: the band is "${s && s.band}"`); }
  finally { await hd.close(); }

  // ── the plumber: goes to customers, nothing yet; logo out, one more At work, opens on At work ──
  const hp = await open(plumber, "managed");
  try {
    await rowHtml(hp);
    const s = await state(hp);
    const st = plumberShape.items, aw = st.filter((it) => it.google === "AT_WORK").length;
    if (!s || s.all.length !== 20 || s.all.some((t) => t.n === 1)) fail(`plumber: the logo isn't out of the 20 (${s && s.all.length})`);
    else {
      if (s.all.filter((t) => t.lab === "Work").length !== aw + 1) fail("plumber: At work didn't take the extra shot");
      if (!/· At work 1 of /.test(s.shot) || !/^At work 0\//.test(s.cur)) fail(`plumber: it doesn't open on At work (${s.shot} · ${s.cur})`);
      if (s.shown.split(",").length !== 3) fail(`plumber: one kind isn't 3 tiles (${s.shown})`);
      if (s.lines.length) fail("plumber: what counts draws lines for an empty Google list");
      if (/Just me ·/.test(s.text)) fail("plumber: an unanswered team question became a line");
      const ex = await hp.page.evaluate((R) => { const r = document.querySelector(R), n = Math.max(...[...r.querySelectorAll(".pm-p10-t")].map((t) => Number(t.getAttribute("data-p10-t")))); return r.querySelector(`[data-p10-shot="${n}"] .sd b`)?.textContent || ""; }, ROW);
      if (ex !== "One more photo of the work: a different job, or another stage of one.") fail(`plumber: the extra shot reads "${ex}"`);
    }
  } finally { await hp.close(); }

  // ── the salon: a public address keeps its logo shot, and the logo counts ──
  const hs = await open(salon, "managed");
  try {
    await rowHtml(hs);
    const s = await state(hs);
    if (!s || s.all.length !== 20 || !s.all.some((t) => t.n === 1 && t.lab === "Logo") || s.all.map((t) => t.num).join(",") !== s.all.map((t) => String(t.n)).join(",")) fail("salon: a storefront lost its logo shot or its numbers");
    else {
      if (!s.lines.length || !/^Your logo · counts/.test(s.lines[0].text) || s.lines[0].n !== "1") fail(`salon: a storefront's logo doesn't count (${JSON.stringify(s.lines[0])})`);
      if (/Google hides it/.test(s.text)) fail("salon: a storefront's logo reads Google hides it");
      if (s.show !== "3") fail("salon: a managed storefront isn't one kind at a time");
    }
  } finally { await hs.close(); }
} catch (e) {
  if (e instanceof HarnessUnavailable) can(e.message);
  console.error(`⚠️  INDETERMINATE — the gate threw: ${String(e.stack || e).slice(0, 400)}`); if (F.length) console.error("  failures so far:\n" + F.map((m) => "  · " + m).join("\n")); process.exit(2);
}
if (F.length) { console.error(`🔴 a managed client's step 4 is wrong: ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log(`✅ a managed client's step 4 (client_step04_photos_v1), drawn for an agency, a plumber and a salon: not managed draws as before${BEFORE ? " (byte for byte, against the build before)" : ""}; the logo leaves the 20 only without a public address and At work takes one more; one kind at a time with + more / See all 20 / back; what counts adds up to the band, the hidden logo and the old copy are lines; the true words; and from 360 to 1440px no tile overlaps and no label clips`);
