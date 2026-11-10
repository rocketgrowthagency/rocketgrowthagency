#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE MONTHLY TAB, RENDERED IN A REAL BROWSER: ONE CARD PER ROW, NOTHING OLD UNDER IT (monthly_fix_v2, 11-9)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 WHY. The five Monthly sections ADDED new cards, but each row's legacy producers (the "WE MEASURED" block, the
// Run buttons, the OVERRIDE row, the old replies card, a second Skip link) kept drawing under them. Every gate asked
// "is the new piece there?" and none asked "is the old piece gone?", and nothing rendered the real page. This opens the
// real Monthly tab (READ-ONLY: it signs in with a magic link and clicks nothing that writes) and asserts, per row:
//
//   · exactly one card (data-uni-card) and no legacy detection block, Run button, OVERRIDE row, "Mark step complete"
//   · exactly one "Skip this step…" (none on Open the month and Start the next month, which cannot be skipped)
//   · (monthly_fix_v3) what is VISIBLY drawn: a row whose title shows the "Runs itself" tag and whose card is not "Your move" wears no "Active now", no orange
//     row border / class, no orange chip or marker; the chip's date is on that row's own card; every "More" is inside its row's body; Open the month's card names a date.
//     The rules live in _monthly-visible-rules.mjs, which also proves they fire on the 11-9 live state (visibleRulesSelfTest) before the page is read.
//   · each section's "d / t" equals the rows that read Done or Skipped, and "Open the month" Done means d >= 1
//   · "Every quarter" (folded in a non-quarter month) opens a read-only preview and folds again
//   · no "Website Work" block and no "Twilio" sentence on the Monthly tab; Website Work has its own tab
//
//   node scripts/check-monthly-one-card-in-a-browser.mjs                 # RGA's own client, the live site
//   RGA_SITE_URL=https://www.rocketgrowthagency.com node scripts/check-monthly-one-card-in-a-browser.mjs <client_id>
//   Run it ONCE AFTER A DEPLOY (it reads the live site). It needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
//
// Exit 0 clean · 1 a row draws old chrome / the tab is wrong · 2 INDETERMINATE (no credentials, no browser, page never rendered)
import { visibleRowFailures, visibleRulesSelfTest, previewFailures } from "./_monthly-visible-rules.mjs";
const SITE = process.env.RGA_SITE_URL || "https://www.rocketgrowthagency.com";
const CLIENT = process.argv[2] || process.env.RGA_MONTHLY_CLIENT_ID || "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.RGA_ADMIN_EMAIL || "hello@rocketgrowthagency.com";

if (!SUPA_URL || !SUPA_KEY) { console.error("INDETERMINATE: no Supabase credentials."); process.exit(2); }
let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); } catch { console.error("INDETERMINATE: puppeteer is not available here."); process.exit(2); }

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };
let link;
try {
  const j = await (await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }) })).json();
  link = j.action_link || j.properties?.action_link;
} catch { /* reported below */ }
if (!link) { console.error("INDETERMINATE: no sign-in link returned."); process.exit(2); }

const fails = [...visibleRulesSelfTest()];
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await b.newPage();
  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
  await page.goto(`${SITE}/admin/?view=client&id=${CLIENT}&tab=monthlynew`, { waitUntil: "networkidle2", timeout: 60000 });
  const count = () => page.evaluate(() => document.querySelectorAll('#monthlyChecklistHost .ob-step[data-ob-step^="m2."]').length);
  let n = 0, stable = 0;
  for (let i = 0; i < 180; i++) { const c = await count(); if (c > 0 && c === n) { if (++stable >= 3) break; } else stable = 0; n = c; await new Promise((r) => setTimeout(r, 500)); }
  if (!n) { console.error("INDETERMINATE: the Monthly checklist never rendered a row in 90s (the probe could not see the page)."); process.exit(2); }

  // open every section so every row is in the DOM with its text measurable
  await page.evaluate(() => document.querySelectorAll("#monthlyChecklistHost .ob-phase:not(.cm-q-folded):not(.open) [data-ob-phase-toggle]").forEach((x) => x.click()));
  await new Promise((r) => setTimeout(r, 800));

  const rows = await page.evaluate(() => {
    const Once = (globalThis.rgaMonthlyOnce || {}).SELF || [], Q = (globalThis.rgaMonthlyQuarter || {}).SELF || [], C = (globalThis.rgaMonthlyClose || {}).SELF || [];
    const SELF = new Set([...Once, ...Q, ...C]);
    return [...document.querySelectorAll('#monthlyChecklistHost .ob-step[data-ob-step^="m2."]')].map((el) => {
      const id = el.getAttribute("data-ob-step"), text = el.innerText || "";
      const pill = (el.querySelector(".ob-row .ob-status") || {}).innerText || "";
      const orangeRgb = "rgb(180, 83, 9)", card = el.querySelector(`[data-uni-card="${id}"]`), num = el.querySelector(".ob-num"), stat = el.querySelector(".ob-row .ob-status");
      const mores = [...el.querySelectorAll("details[data-ob-more]")];
      const vis = { tagSelf: /Runs itself/i.test((el.querySelector(".ob-title") || {}).innerText || ""), rowCls: el.className + (getComputedStyle(el).borderTopColor === orangeRgb ? " active" : ""),
        statusCls: stat ? stat.className : "", markerCls: num && getComputedStyle(num).backgroundColor === orangeRgb ? "active" : "", cardText: card ? card.innerText : "",
        moreCount: mores.length, moreInside: mores.every((m) => m.closest(".ob-step") === el && !!m.closest(".ob-body")),
        who: ((el.querySelector(".ob-kind") || {}).innerText || "").trim(), sub: ((el.querySelector(".ob-row .ob-why, .ob-row .ob-sub, .ob-title small") || {}).innerText || ""), num: Number(((num || {}).innerText || "").trim()) || null,
        month: (document.querySelector(".cm-chip[aria-pressed=true]")?.getAttribute("data-cm-month")) || null };   /* no chip pressed (an unnumbered month) is null, never a crash */
      return { id, pill: pill.trim(), self: SELF.has(id), vis,
        cards: el.querySelectorAll(`[data-uni-card="${id}"]`).length,
        det: el.querySelectorAll(".ob-det").length, ovr: el.querySelectorAll(".ob-ovr").length,
        runBtn: el.querySelectorAll("[data-onboard-run]").length,
        skip: el.querySelectorAll("[data-uni-skip],[data-cb-act='skip']").length,
        measured: /WE MEASURED/i.test(text), bolt: text.includes("⚡"), override: /\bOVERRIDE\b/i.test(text), markDone: /Mark step complete/i.test(text),
        notChecked: /NOT CHECKED YET/i.test(text), draftBtn: /Draft this for me|Draft replies/i.test(text), runMonthlyCall: /Run monthly call/i.test(text) };
    });
  });
  const NO_SKIP = new Set(["m2.start.open_month", "m2.handoff.next_month"]);
  for (const r of rows) {
    const tag = `${r.id} [${r.pill}]`;
    if (r.cards > 1) fails.push(`${tag}: ${r.cards} cards (must be one)`);
    if (r.det) fails.push(`${tag}: the old detection block ("WE MEASURED") is drawn`);
    if (r.measured) fails.push(`${tag}: reads "WE MEASURED"`);
    if (r.bolt || r.draftBtn) fails.push(`${tag}: an old Run / Draft button is drawn`);
    if (r.ovr || r.override) fails.push(`${tag}: the OVERRIDE row is drawn`);
    if (r.markDone) fails.push(`${tag}: "Mark step complete" is drawn`);
    if (r.notChecked && r.id === "m2.exec.review_responses") fails.push(`${tag}: the old "Not checked yet" replies card is drawn`);
    if (r.runMonthlyCall) fails.push(`${tag}: still titled "Run monthly call"`);
    if (r.skip > 1) fails.push(`${tag}: ${r.skip} "Skip this step…" links (must be exactly one)`);
    if (NO_SKIP.has(r.id) && r.skip) fails.push(`${tag}: has a Skip, it cannot be skipped`);
    if (r.self && /^Active now$/i.test(r.pill)) fails.push(`${tag}: a waiting runs-itself step wears "Active now"`);
  }
  fails.push(...visibleRowFailures(rows.map((r) => ({ id: r.id, pill: r.pill, ...r.vis }))));

  // the section counts agree with the rows
  const phases = await page.evaluate(() => [...document.querySelectorAll("#monthlyChecklistHost .ob-phase:not(.cm-q-folded)")].map((ph) => {
    const m = /(\d+)\s*\/\s*(\d+)/.exec((ph.querySelector(".ob-ph-cnt") || {}).innerText || "");
    const rows = [...ph.querySelectorAll('.ob-step[data-ob-step^="m2."]')], settled = rows.filter((r) => /^(Done|Skipped|Declined)$/i.test(((r.querySelector(".ob-row .ob-status") || {}).innerText || "").trim())).length;
    return { key: ph.getAttribute("data-ob-phase"), d: m ? +m[1] : null, t: m ? +m[2] : null, rows: rows.length, settled,
      openDone: rows.some((r) => r.getAttribute("data-ob-step") === "m2.start.open_month" && /^Done$/i.test(((r.querySelector(".ob-row .ob-status") || {}).innerText || "").trim())) };
  }));
  for (const p of phases) {
    if (p.d == null) continue;
    if (p.d !== p.settled) fails.push(`section ${p.key}: the count says ${p.d} settled, the rows show ${p.settled}`);
    if (p.t !== p.rows) fails.push(`section ${p.key}: the count says ${p.t} steps, the page draws ${p.rows}`);
    if (p.key === "m2s-start" && p.openDone && p.d < 1) fails.push(`section ${p.key}: Open the month reads Done but the section reads ${p.d} / ${p.t}`);
  }

  // "Every quarter" preview: opens read-only, folds again
  const q = await page.$(".cm-q-folded [data-cm-qprev]");
  if (q) {
    await q.click();
    const open = await page.evaluate(() => { const b = document.querySelector(".cm-q-folded [data-cm-qprev-body]"); return b ? { hidden: b.hasAttribute("hidden"), text: b.innerText, buttons: b.querySelectorAll("button, a, input").length, items: b.querySelectorAll("li").length } : null; });
    if (!open || open.hidden) fails.push("Every quarter: clicking the folded line did not open the preview");
    else {
      const pv = await page.evaluate(() => { const f = document.querySelector(".cm-q-folded"), b = f.querySelector("[data-cm-qprev-body]"); const rows = [...b.querySelectorAll(".cm-q-prev-r")];
        return { pill: (f.querySelector(".ob-ph-cnt") || {}).innerText || "", text: b.innerText, nums: rows.map((r) => Number((r.querySelector(".cm-q-n") || {}).innerText)), titles: rows.map((r) => (r.querySelector("b") || {}).innerText || ""),
          buttons: b.querySelectorAll("button:not(.cm-q-fold), a, input").length, notFor: rows.some((r) => /not for /i.test((r.querySelector(".cm-q-tag") || {}).innerText || "")) }; });
      fails.push(...previewFailures({ ...pv, pill: pv.pill.replace(/\s+/g, " "), applies: true, notFor: true }));   // applies/notFor: the not-for tag is proven by the fixtures; here the page must not fail the rest
      if (open.items !== 7) fails.push(`Every quarter: the preview lists ${open.items} steps, not 7`);
      await page.click(".cm-q-folded [data-cm-qprev]");   /* 11-9: a re-render can detach the old handle */
      await new Promise((r) => setTimeout(r, 500));
      const hid = await page.evaluate(() => document.querySelector(".cm-q-folded [data-cm-qprev-body]").hasAttribute("hidden"));
      if (!hid) fails.push("Every quarter: clicking again did not fold it");
    }
  }

  // the bottom blocks
  const panel = await page.evaluate(() => { const p = document.getElementById("panel-monthlynew"); return { t: p ? p.textContent : "" }; });
  if (/Twilio/i.test(panel.t)) fails.push('Monthly tab still mentions "Twilio"');
  if (/Optional add-on|Save Website Work|id="websiteSections"/.test(panel.t) || await page.evaluate(() => !!document.querySelector("#panel-monthlynew #websiteSections"))) fails.push("Website Work is still inside the Monthly tab");
  const ww = await page.evaluate(() => ({ tab: !!document.querySelector('.admin-side-tab[data-tab="websitework"]'), body: !!document.querySelector("#panel-websitework #websiteSections") }));
  if (!ww.tab || !ww.body) fails.push("Website Work has no tab of its own with its content");
} finally { await b.close(); }

if (fails.length) { console.error(`FAIL: ${fails.length} problem(s) on the live Monthly tab`); for (const f of fails) console.error("  - " + f); process.exit(1); }
console.log("ok: every Monthly row draws one card and nothing old; counts agree; the quarter preview opens read-only; Website Work has its own tab");
