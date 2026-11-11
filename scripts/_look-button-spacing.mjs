#!/usr/bin/env node
// _look-button-spacing.mjs — LOCAL LOOK TOOL (the owner 11-6: "check all step cards to make sure button spacing is correct").
// Boots the real portal (portal-boot-harness), managed + self-serve, Setup + Ongoing, opens every folded row and every hidden
// "add" form, then measures each button row's gap to what sits above it in a stacked (block / column) parent. Prints every gap < 8px.
import { bootPortal, CID } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const KICKOFF = "2026-10-09T16:11:50Z";
const asked = (name, at) => ({ first_name: name, phone: "5550100000", service_done: "drain cleaning", marked_sent_by_client: true, marked_sent_at: at });
const LIST = { id: "l1", client_id: CID, workspace_id: "w1", week_label: "Week of October 26", created_at: "2026-10-26T19:59:53Z", customer_count: 1, customers: [asked("Maria", "2026-10-26T20:01:48Z")] };
const done = (over = {}) => ({ ...SCENARIOS.allDone.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" }, "m1.review.first_5": { status: "pending" }, ...over });
const CASES = [];
for (const mode of ["managed", null]) {
  CASES.push({ name: `${mode || "self-serve"} · plumber, early setup`, mode, stage: "stage_3_foundation", clock: "2026-11-04T15:00:00Z", tasks: SCENARIOS.plumber.tasks, now: SCENARIOS.plumber.now });
  CASES.push({ name: `${mode || "self-serve"} · setup, step 5 done (step 8 open)`, mode, stage: "stage_4_onboarding", clock: "2026-11-04T15:00:00Z", tasks: done({ "m1.review.first_5": { status: "done", completed_at: "2026-11-02T10:00:00Z" } }) });
  CASES.push({ name: `${mode || "self-serve"} · setup, no jobs this week`, mode, stage: "stage_4_onboarding", clock: "2026-11-04T15:00:00Z", tasks: done({ "m1.review.first_5": { status: "done", completed_at: "2026-11-02T10:00:00Z" } }), pressNoJobs: true });
  CASES.push({ name: `${mode || "self-serve"} · Monthly Nov 6`, mode, stage: "stage_5_monthly", clock: "2026-11-06T15:00:00Z", tasks: done() });
}

const MEASURE = `(() => {
  const vis = (e) => e && e.offsetParent !== null && e.getBoundingClientRect().height > 0 && !e.closest('[hidden]');
  const out = [];
  const groups = [...document.querySelectorAll('.pm-k5-acts, .pm-cs-foot, .pm-lockfoot, .pm-fw-row, .pm-act, .pm-commit, .pm-amend')].filter(vis)
    .filter((g) => !(g.matches('.pm-act, .pm-commit, .pm-amend') && g.parentElement.closest('.pm-k5-acts, .pm-cs-foot, .pm-lockfoot, .pm-fw-row')));
  for (const g of groups) {
    const par = g.parentElement, cs = getComputedStyle(par);
    if (cs.display.includes('flex') && !cs.flexDirection.startsWith('column')) continue;   // side by side: not a stacked gap
    if (cs.display.includes('grid') || cs.display === 'inline' || getComputedStyle(g).display.startsWith('inline') && !g.matches('.pm-act, .pm-commit, .pm-amend')) continue;
    let p = g.previousElementSibling; while (p && !vis(p)) p = p.previousElementSibling;
    if (!p) continue;
    if (g.matches('.pm-cs-foot')) continue;   // a card's foot band sits flush on purpose (its own top border)
    const gap = Math.round(g.getBoundingClientRect().top - p.getBoundingClientRect().bottom);
    if (gap < 8) {
      const row = g.closest('.pm-step-row');
      out.push({ gap, row: row ? (row.querySelector('.pm-step-title') || {}).textContent || row.id : '(no row)', what: (g.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60), above: (p.className || p.tagName).toString().slice(0, 50), cls: g.className.toString().slice(0, 40) });
    }
  }
  return out;
})()`;

let total = 0;
for (const c of CASES) {
  let h;
  try {
    h = await bootPortal({ mode: c.mode, stage: c.stage, clock: c.clock, tasks: c.tasks, now: c.now, onboarding: c.onboarding || {}, tables: { client_customer_lists: [LIST], client_monthly_records: [] },
      fns: { "portal-review-cadence": (b) => ({ ok: true, action: b.action, review_list_no_jobs: b.action === "no_jobs" ? [{ start: b.start, at: c.clock }] : [], review_list_pause: null }), "portal-review-requests": (b) => (b && b.scope === "reviews" ? { ok: true, scope: "reviews", feed: { reviews: [], count: 0, rating: null, new_30d: 0, gap_days: null, checked_at: c.clock, stale: false }, google: { status: "ok" }, matches: [], profile_url: null, replies: null } : { ok: true, requests: [], has_review_link: true }) } });
    await h.ready("[id^='action-items-list-'] .pm-step-row", 30000);
  } catch (e) { console.log(`?? ${c.name}: didn't boot (${e.message})`); if (h) await h.close(); continue; }
  for (const tab of ["setup", "ongoing"]) {
    if (tab === "ongoing") { await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=ongoing]")?.click()); await tick(1800); }
    if (c.pressNoJobs) { await h.page.evaluate(() => { const b = [...document.querySelectorAll("[data-rc-nojobs]")].find((x) => x.offsetParent !== null); if (b) b.click(); }); await tick(1500); }
    // open every folded row, then every hidden add form
    for (let i = 0; i < 3; i++) { await h.page.evaluate(() => { for (const r of document.querySelectorAll(".pm-step-row.is-collapsed")) { if (r.offsetParent === null) continue; r.querySelector("[data-step-toggle], [data-og-toggle], .pm-step-row-head")?.click(); } }); await tick(300); }
    await h.page.evaluate(() => { for (const b of document.querySelectorAll("[data-og-add]")) if (b.offsetParent !== null) b.click(); }); await tick(400);
    if (process.env.SHOW8) console.log("   step 8:", await h.page.evaluate(() => [...document.querySelectorAll('[id="step-row-og-customers"]')].filter((x) => x.offsetParent !== null).map((x) => x.innerText.replace(/\s+/g, " ").slice(0, 160)).join(" | ")));
    const bad = await h.page.evaluate(MEASURE);
    total += bad.length;
    console.log(`${bad.length ? "❌" : "✅"} ${c.name} · ${tab}: ${bad.length} tight`);
    for (const b of bad) console.log(`     ${b.gap}px · ${b.row} · "${b.what}" (${b.cls}) under ${b.above}`);
  }
  await h.close();
}
console.log(total ? `\n${total} button rows sit under 8px from what's above` : "\nall button rows have their space");
process.exit(total ? 1 : 0);
