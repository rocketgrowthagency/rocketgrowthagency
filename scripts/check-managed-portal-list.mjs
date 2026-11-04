#!/usr/bin/env node
// check-managed-portal-list.mjs — the MANAGED client portal's Month 1 list, DRAWN (approved client_portal_slim_v1 + client_portal_slim_visual_v1, 11-4).
//
// BOOTS THE REAL PORTAL in headless Chrome (scripts/lib/portal-boot-harness.mjs: the real portal.js and portal.css, our fake database, every
// function call answered and recorded; nothing leaves the laptop) and reads what it draws, for invented clients of four shapes.
// HOLDS:
//   1 · SELF-SERVE AND NO MODE DRAW EXACTLY AS BEFORE. The same clients, drawn by portal.js as it was before this build (git HEAD) and as it
//       is now, in self_serve, no-mode and column-missing: the Setup list's markup is byte-for-byte equal.
//   2 · MANAGED draws 1 kickoff · 2 website access · 3 Check what we found · 4 photos · 5 review customers · 6 videos · 7 close-out, in that
//       order, with the five "check" steps NOT drawn as rows of their own and the five RGA cards in a "What RGA is doing" group, each with its action.
//   3 · STEP 3 is one card with the approved rows, each filled from what the portal reads. A phone that differs says "Which is right?", never
//       a pick. Nothing found is a blank field, never a guess. No website, a storefront (no service area), nothing found, Google down: each draws.
//   4 · "LOOKS RIGHT" posts, to portal-step-input, exactly what each covered step's own form posts, in order, one per step, and posts nothing
//       when a line is still open. "Fix something" opens the five steps' own cards. A tick in the summary is the form's own tick.
//   5 · THE RGA CARDS' ASK goes through the existing flag (portal-step-choice flag_wrong + the client's own words), and promises nothing more.
//   6 · THE PROFILE CHECK shows a card only when Google needs a code.
// exit 0 = holds · 1 = a drawn page is wrong · 2 = can't tell (no browser, the page didn't boot)
import fs from "node:fs";
import { bootPortal, HarnessUnavailable, SITE } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const F = [], fail = (m) => F.push(m);
const BEFORE = process.env.MANAGED_PORTAL_BEFORE_JS || "";   // portal.js as it was before this build; the parity proof skips (exit 2) without it
const LIST = "[id^='action-items-list-'][id$='-setup']";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const MANAGED_ORDER = ["Book your kickoff call", "Give RGA access to your website", "Check what we found", "Provide 20+ business photos", "Ask your 5 most recent customers for a review", "Record 2 short videos (optional)", "Attend Month 1 close-out call"];

async function open(scn, mode, over = {}, overrides = {}, extra = {}) {
  const S = SCENARIOS[scn] || scn;
  const h = await bootPortal({ mode, tasks: { ...S.tasks, ...(over.cards === false ? {} : RGA_CARD_TASKS), ...(over.tasks || {}) }, now: S.now, verify: S.verify, website: S.website, ...extra }, overrides, SITE);
  await h.page.goto(`${h.base}/portal/`, { waitUntil: "domcontentloaded" });
  try { await h.ready(LIST + " .pm-step-row", 20000); } catch { throw new HarnessUnavailable(`the Setup list never drew (${h.errs[0] || "no error"})`); }
  await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
  await tick(500);
  return h;
}
const rowsOf = (h) => h.page.evaluate((L) => [...document.querySelectorAll(`${L} > .pm-step-row:not(.mc-sub)`)].map((r) => ({ id: r.id.replace("step-row-", ""), num: (r.querySelector(".pm-step-num") || {}).textContent?.trim(), title: (r.querySelector(".pm-step-title") || {}).textContent?.trim(), pill: (r.querySelector(".pm-step-pills .pm-pill") || {}).textContent?.trim() })), LIST);
const text = (h, sel) => h.page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; }, sel);
const rawHtml = (h) => h.page.evaluate((L) => { const e = document.querySelector(L); return e ? e.innerHTML : null; }, LIST);
// the list fills in after it draws (Google's answers): read it only once it has stopped changing
const listHtml = async (h) => { let last = await rawHtml(h), same = 0; for (let i = 0; i < 40 && same < 3; i++) { await tick(300); const now = await rawHtml(h); same = now === last ? same + 1 : 0; last = now; } return last; };

try {
  // ── 1 · self-serve and no mode draw today's list ──
  //   always: the three "not managed" shapes draw the SAME list as each other, with none of the managed markup, 16 Month 1 rows
  //   when MANAGED_PORTAL_BEFORE_JS names portal.js as it was before this build: each is also byte-for-byte what that older portal drew
  for (const scn of ["plumber", "allDone", "storefront", "listingUnknown"]) {
    const html = {};
    for (const mode of ["self_serve", null, "column_missing"]) {
      const b = await open(scn, mode);
      try {
        html[mode] = await listHtml(b);
        const rows = await rowsOf(b);
        if (rows.length < 14 || rows.some((r) => r.id === "managed.check_found")) fail(`${scn}/${mode}: today's 16-step list changed (${rows.length} rows)`);
        if (/data-mc-|mc-sub|mc-rga/.test(html[mode] || "")) fail(`${scn}/${mode}: managed markup reached a client who is not managed`);
        if (BEFORE && fs.existsSync(BEFORE)) {
          const a = await open(scn, mode, {}, { "/portal/portal.js": BEFORE });
          try { const x = await listHtml(a), y = html[mode]; if (x !== y) { let i = 0; while (x && y && x[i] === y[i]) i++; fail(`parity ${scn}/${mode}: the list differs from before the build, first at char ${i}: before «${(x || "").slice(Math.max(0, i - 40), i + 80)}» now «${(y || "").slice(Math.max(0, i - 40), i + 80)}»`); } }
          finally { await a.close(); }
        }
      } finally { await b.close(); }
    }
    if (html.self_serve !== html[null] || html[null] !== html.column_missing) fail(`${scn}: self-serve, no mode and a missing column don't draw the same list`);
  }

  // ── 2 + 3 · managed, drawn ──
  const T = {};   // text of step 3 per scenario, for the asserts below
  for (const scn of Object.keys(SCENARIOS)) {
    const h = await open(scn, "managed");
    try {
      const rows = await rowsOf(h);
      const titles = rows.map((r) => r.title);
      if (JSON.stringify(titles) !== JSON.stringify(MANAGED_ORDER)) fail(`${scn}: the managed list reads ${JSON.stringify(titles)}, approved ${JSON.stringify(MANAGED_ORDER)}`);
      if (JSON.stringify(rows.map((r) => r.num)) !== JSON.stringify(["1", "2", "3", "4", "5", "6", "7"]) && !(scn === "allDone" || scn === "noWebsite")) fail(`${scn}: the numbers read ${rows.map((r) => r.num).join(",")}, approved 1–7`);
      const check = await h.page.evaluate((L) => [...document.querySelectorAll(`${L} > .pm-step-row > .pm-step-row-head .pm-step-title`)].map((e) => e.textContent).filter((t) => /Verify your Google|Check your business|categories|business hours|what's true/i.test(t)), LIST);
      if (check.length) fail(`${scn}: a "check" step is drawn as its own row: ${check.join(" · ")}`);
      const grp = await h.page.evaluate(() => [...document.querySelectorAll(".mc-rrow")].map((r) => ({ t: r.querySelector(".mc-rt b")?.textContent, a: r.querySelector(".mc-lk")?.textContent, id: r.getAttribute("data-mc-card") })));
      const want = [["m1.strategy.keywords_locations", "See why"], ["m1.gbp.booking_link", "Change"], ["m1.brand.social_profiles", "Not mine"], ["m1.tracking.call_setup", "Turn off"], ["m1.tracking.form_setup", "Turn off"]];
      if (JSON.stringify(grp.map((g) => [g.id, g.a])) !== JSON.stringify(want)) fail(`${scn}: "What RGA is doing" reads ${JSON.stringify(grp.map((g) => [g.id, g.a]))}, approved ${JSON.stringify(want)}`);
      if (!/what rga is doing/i.test((await text(h, ".mc-phase")) || "")) fail(`${scn}: no "What RGA is doing" heading`);
      T[scn] = { s3: await text(h, "[data-mc-sum]"), row: await text(h, "[data-mc-row]"), pill: rows[2] && rows[2].pill, looks: await h.page.evaluate(() => { const b = document.querySelector("[data-mc-looks]"); return b ? { hidden: b.hidden, disabled: b.disabled } : null; }),
        verifyShown: await h.page.evaluate(() => { const v = document.querySelector("[data-mc-verify]"); return v ? !v.hidden && getComputedStyle(v).display !== "none" : null; }), subs: await h.page.evaluate(() => document.querySelectorAll("[data-mc-fixarea] > .mc-sub").length) };
      const heads = await h.page.evaluate(() => [...document.querySelectorAll(".mc-sub > .pm-step-row-head")].filter((e) => getComputedStyle(e).display !== "none").length);
      if (heads) fail(`${scn}: ${heads} step card(s) inside step 3 or the RGA group draw a second head of their own`);
      const w = await h.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); if (w) fail(`${scn}: the managed list is wider than the page`);
      if (h.errs.length) fail(`${scn}: the page threw: ${h.errs[0]}`);
    } finally { await h.close(); }
  }
  const has = (k, ...w) => w.forEach((x) => { if (!(T[k].s3 || "").includes(x)) fail(`${k}: step 3 doesn't say "${x}" (reads: ${(T[k].s3 || "").slice(0, 400)})`); });
  const lacks = (k, ...w) => w.forEach((x) => { if ((T[k].s3 || "").includes(x)) fail(`${k}: step 3 says "${x}" and must not (reads: ${(T[k].s3 || "").slice(0, 300)})`); });
  has("plumber", "We filled this in from Google", "Business name", "Acme Plumbing", "(555) 010-1234", "You told us (555) 010-9999", "Which is right?", "You go to customers", "Springfield, Shelbyville, Capital City +2", "Mon–Fri 8 AM–5 PM", "Drain cleaning", "Sewer lines", "Untick any you don't do", "Only you can say", "Women-owned", "Veteran-owned", "Tick only if true", "change on Google only with your OK on the exact value");
  has("allMatch", "Matches Google"); lacks("allMatch", "Which is right?");
  has("storefront", "Customers come to you"); lacks("storefront", "Only you can say", "Which is right?", "undefined", "null");
  has("storefront", "Google lists none for your categories");
  has("noWebsite", "Website", "Not found", "Add it"); lacks("noWebsite", "acmeplumbing.test");
  has("nothingFound", "Not found", "Add it", "Add your hours", "RGA is setting your Google categories first"); lacks("nothingFound", "Customers come to you", "You go to customers", "Matches Google", "Acme");
  has("googleDown", "couldn't read Google just now");
  if (!T.googleDown.looks || !T.googleDown.looks.disabled) fail("googleDown: Looks right can be pressed while Google couldn't be read");
  if (T.plumber.verifyShown !== false) fail(`plumber: the profile check shows a card though Google verified it (${T.plumber.verifyShown})`);
  if (T.needsCode.verifyShown !== true) fail(`needsCode: the profile check shows no card though Google needs a code (${T.needsCode.verifyShown})`);
  if (T.needsCode.pill !== "Your turn") fail(`needsCode: Google needs a code but step 3 reads "${T.needsCode.pill}", not Your turn`);
  has("allDone", "On Google"); if (T.allDone.looks && !T.allDone.looks.hidden) fail("allDone: Looks right is offered on a finished step"); if (T.allDone.pill !== "Done") fail(`allDone: step 3's pill reads ${T.allDone.pill}`);
  if (T.plumber.pill !== "Your turn") fail(`plumber: step 3's pill reads ${T.plumber.pill}`);
  if (T.listingUnknown.pill === "Your turn") fail("listingUnknown: step 3 says Your turn while the steps in it wait on one Google listing");
  if (T.plumber.subs !== 4) fail(`plumber: Fix something holds ${T.plumber.subs} step cards, not the 4 covered steps' own`);

  // ── 4 · Looks right, Fix something, the tick ──
  {
    const posts = [];
    const store = { tasks: {} };
    const stepInput = (body, _u, ctx) => { posts.push(body); const t = { ...(ctx.tasks), ...store.tasks, [body.step_id]: { status: "done", completed_at: new Date().toISOString(), completed_by: "client", client_input: body.value } }; store.tasks = t; Object.assign(ctx.tasks, t); return { ok: true, tasks: t }; };
    const h = await open("allMatch", "managed", {}, {}, { fns: { "portal-step-input": stepInput } });
    try {
      await tick(600);
      const looks = await h.page.$("[data-mc-looks]");
      if (!looks || await looks.evaluate((b) => b.disabled || b.hidden)) fail("allMatch: Looks right isn't ready though everything matches");
      else {
        await looks.click(); await tick(1500);
        const ids = posts.map((p) => p.step_id);
        if (JSON.stringify(ids) !== JSON.stringify(["m1.gbp.business_facts", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"])) fail(`Looks right posted ${JSON.stringify(ids)}, not each covered step once in order`);
        const f = posts.find((p) => p.step_id === "m1.gbp.business_facts");
        if (f && !(f.value.name === "Acme Plumbing" && f.value.phone === "5550101234" && f.value.website === "https://acmeplumbing.test" && f.value.come === "no" && f.value.area)) fail(`the business-details answer isn't what the form posts: ${JSON.stringify(f.value)}`);
        const s = posts.find((p) => p.step_id === "m1.gbp.services_products");
        if (s && JSON.stringify([...s.value].sort()) !== JSON.stringify(["drain", "leak", "water"])) fail(`the services answer isn't the ticked ones: ${JSON.stringify(s.value)}`);
        const hr = posts.find((p) => p.step_id === "m1.gbp.hours_attributes");
        if (hr && !(hr.value.days && hr.value.days.mon && hr.value.days.mon.open === "08:00" && hr.value.days.sat.closed)) fail(`the hours answer isn't Google's week: ${JSON.stringify(hr.value).slice(0, 200)}`);
        const row = await rowsOf(h);
        if (row[2] && row[2].pill !== "Done") fail(`after Looks right every covered step is done but step 3 reads ${row[2].pill}`);
      }
    } finally { await h.close(); }
  }
  {
    const posts = [];
    const h = await open("plumber", "managed", {}, {}, { fns: { "portal-step-input": (b) => { posts.push(b); return { ok: true, tasks: {} }; } } });
    try {
      await tick(600);
      await h.page.waitForSelector("[data-mc-looks]", { timeout: 8000 }).catch(async () => { throw new Error("no Looks right: " + (await h.page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300))) + " ERR " + h.errs.join("|") + " MODE " + (await h.page.evaluate(() => window.__FAKE.tables.clients[0].portal_mode)) + " LIST " + (await h.page.evaluate(() => [...document.querySelectorAll(".pm-step-row:not(.mc-sub) .pm-step-title")].map((e) => e.textContent).join("|")))); }); await (await h.page.$("[data-mc-looks]")).click(); await tick(800);
      if (posts.length) fail(`Looks right posted ${posts.length} answers while a phone number still says "Which is right?"`);
      const open1 = await h.page.evaluate(() => { const a = document.querySelector("[data-mc-fixarea]"); return a && !a.hidden; });
      if (!open1) fail("Looks right with an open line didn't open Fix something");
      const msg = await text(h, "[data-mc-msg]"); if (!msg || !/right/i.test(msg)) fail(`Looks right with an open line says nothing about it (${msg})`);
      // a tick in the summary is the form's own tick
      await h.page.evaluate(() => document.querySelector('[data-mc-tick="m1.gbp.services_products|sewer"]')?.click());
      await tick(400);
      const on = await h.page.evaluate(() => { const b = [...document.querySelectorAll('[data-step-input="m1.gbp.services_products"] [data-in-tick]')].find((x) => x.getAttribute("data-in-tick") === "sewer"); return b ? b.classList.contains("on") : null; });
      if (on !== true) fail(`ticking Sewer lines in the summary didn't tick it in the step's own form (${on})`);
      await h.page.evaluate(() => document.querySelector("[data-mc-fix].pm-amend")?.click());
    } finally { await h.close(); }
  }
  // ── 5 · the RGA cards' ask ──
  {
    const calls = [];
    const h = await open("plumber", "managed", {}, {}, { fns: { "portal-step-choice": (b) => { calls.push(b); return { ok: true, tasks: { "m1.strategy.keywords_locations": { status: "done", client_flagged: { at: new Date().toISOString(), note: b.note } } } }; } } });
    try {
      await tick(500);
      await h.page.evaluate(() => document.querySelector('[data-mc-rc="m1.strategy.keywords_locations"]').click());
      const shown = await h.page.evaluate(() => { const p = document.querySelector('[data-mc-panel="m1.strategy.keywords_locations"]'); return !!p && !p.hidden && /plumber 1/i.test(p.innerText); });
      if (!shown) fail("See why doesn't open the keyword plan's own card");
      await h.page.type('[data-mc-panel="m1.strategy.keywords_locations"] form.mc-ask textarea', "Please add emergency plumber to the plan");
      await h.page.click('[data-mc-panel="m1.strategy.keywords_locations"] form.mc-ask button[type=submit]'); await tick(1200);
      const c = calls[0];
      if (!c || c.step_id !== "m1.strategy.keywords_locations" || c.flag_wrong !== true || c.note !== "Please add emergency plumber to the plan") fail(`Say no didn't go through the existing flag with the client's words: ${JSON.stringify(c)}`);
      const line = await text(h, '[data-mc-card="m1.strategy.keywords_locations"]');
      if (!line || !/You asked RGA/.test(line)) fail(`after the ask the card doesn't say so (${line})`);
    } finally { await h.close(); }
  }
  // ── 4b · "On Google" is said only when every covered step is on Google ──
  {
    const h = await open("allDone", "managed", { tasks: { "m1.gbp.hours_attributes": { status: "done", completed_at: "2026-11-02T18:00:00Z", client_input: { days: {} }, google_push: { state: "with_rga" } } } });
    try {
      const t = await text(h, "[data-mc-sum]");
      if (/On Google/.test(t || "")) fail(`step 3 says "On Google" while the hours are still with RGA (${(t || "").slice(0, 200)})`);
      if (!/RGA is finishing it/.test(t || "")) fail("step 3 doesn't say RGA is still finishing a change on Google");
    } finally { await h.close(); }
  }
  // ── 4c · a finished step that never recorded how customers reach the business says nothing about it ──
  {
    const h = await open("allDone", "managed", { tasks: { "m1.gbp.business_facts": { status: "done", completed_at: "2026-11-02T18:00:00Z", client_input: { name: "Acme Plumbing" }, google_push: { state: "on_google", after: { name: "Acme Plumbing" } } } } });
    try {
      const t = await text(h, "[data-mc-sum]");
      if (/You go to customers|Customers come to you/.test(t || "")) fail(`a finished step with no record of how customers reach the business still says one (${(t || "").slice(0, 300)})`);
      if (!/Where you work\s*Not found/.test(t || "")) fail(`the unrecorded "Where you work" isn't a blank field (${(t || "").slice(0, 300)})`);
    } finally { await h.close(); }
  }
  // ── 4d · the To do tab: step 3 is ONE item, the covered steps and RGA's cards are none, numbers are managed numbers ──
  {
    const MOVES = (extra = []) => ({ ok: true, moves: [{ step_id: "m1.gbp.business_facts", owner: "client", kind: "open", since: "2026-11-02T12:00:00Z" }, { step_id: "m1.gbp.hours_attributes", owner: "client", kind: "open" },
      { step_id: "m1.strategy.keywords_locations", owner: "rga", kind: "waits_on_rga" }, { step_id: "m1.tracking.call_setup", owner: "client", kind: "open" }, { step_id: "m1.gbp.photos", owner: "client", kind: "open" }],
      month1: { done: 9, total: 16, done_steps: [{ id: "m1.kickoff.call", at: "2026-11-01T12:00:00Z" }, { id: "m1.access.website", at: "2026-11-02T12:00:00Z" }, ...extra] } });
    const todo = async (mode, extra, tasks) => {
      const h = await open("plumber", mode, { tasks }, {}, { fns: { "portal-open-moves": () => MOVES(extra) } });
      try {
        await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=approvals]")?.click());
        await h.page.waitForSelector(".ib-qi", { timeout: 8000 }).catch(() => {});
        await tick(700);
        return await h.page.evaluate(() => ({ items: [...document.querySelectorAll(".ib-qi")].map((e) => ({ no: (e.querySelector(".ib-no") || {}).textContent, t: e.textContent.replace(/\s+/g, " ").trim(), done: e.classList.contains("done") })), head: (document.querySelector(".ib-mprog") || document.querySelector(".ib-top") || {}).innerText || "" , html: (document.querySelector(".ib") || {}).innerHTML || "" }));
      } finally { await h.close(); }
    };
    const m = await todo("managed", []);
    const open1 = m.items.filter((i) => !i.done);
    const three = open1.filter((i) => /Check what we found/.test(i.t));
    if (three.length !== 1 || three[0].no !== "3") fail(`To do (managed): step 3 isn't ONE item numbered 3 (${JSON.stringify(open1.map((i) => [i.no, i.t.slice(0, 40)]))})`);
    if (open1.some((i) => /Check your business|categories|business hours|what's true|Verify your Google|keyword plan|call tracking|booking link|social profiles|form/i.test(i.t))) fail(`To do (managed) still lists a step that lives inside step 3 or an RGA card: ${JSON.stringify(open1.map((i) => i.t.slice(0, 50)))}`);
    if (!open1.some((i) => i.no === "4")) fail("To do (managed): photos aren't numbered 4");
    if (!/Month 1 · 2 of 7 done/.test(m.head)) fail(`To do (managed): the progress line isn't "2 of 7" (${m.head.replace(/\s+/g, " ").slice(0, 160)})`);
    if (!/about 20 minutes/.test(m.head)) fail(`To do (managed): the minutes aren't step 3's (from managed.check) plus photos (${m.head.replace(/\s+/g, " ").slice(0, 160)})`);
    const allDone = ["m1.gbp.verify", "m1.gbp.business_facts", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"].map((id) => ({ id, at: "2026-11-03T12:00:00Z" }));
    const d = await todo("managed", [...allDone, { id: "m1.brand.social_profiles", at: "2026-11-03T12:00:00Z" }], undefined);
    const doneItems = d.items.filter((i) => i.done);
    if (doneItems.filter((i) => /Check what we found/.test(i.t)).length !== 1 || doneItems.some((i) => /social|business on Google|hours/i.test(i.t))) fail(`To do (managed): Done doesn't hold step 3 once and nothing inside it (${JSON.stringify(doneItems.map((i) => i.t.slice(0, 40)))})`);
    // self-serve is today's list: the covered steps are items of their own, and it is the same markup as with no mode
    const ss = await todo("self_serve", []), nm = await todo(null, []);
    if (ss.html !== nm.html) fail("To do: self-serve and no mode draw different lists");
    if (!ss.items.some((i) => /Check your business on Google/.test(i.t)) || ss.items.some((i) => /Check what we found/.test(i.t))) fail("To do (self-serve) isn't today's list");
    if (BEFORE && fs.existsSync(BEFORE)) {
      const h = await open("plumber", "self_serve", {}, { "/portal/portal.js": BEFORE }, { fns: { "portal-open-moves": () => MOVES([]) } });
      try {
        await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=approvals]")?.click());
        await h.page.waitForSelector(".ib-qi", { timeout: 8000 }).catch(() => {}); await tick(700);
        const old = await h.page.evaluate(() => (document.querySelector(".ib") || {}).innerHTML || "");
        if (old !== ss.html) fail("To do (self-serve): differs from before the build");
      } finally { await h.close(); }
    }
  }
  // ── 4e · RGA changed hours or details for the client: one line + the ask link, never an undo; nothing when RGA changed nothing ──
  {
    const rc = { at: "2026-11-04T18:00:00Z", by: "rga", field: "hours", previous: { mon: { open: "09:00", close: "17:00" } } };
    const withRc = await open("allDone", "managed", { tasks: { "m1.gbp.hours_attributes": { status: "done", completed_at: "2026-11-02T18:00:00Z", completed_by: "rga", client_input: { days: { mon: { open: "08:00", close: "17:00" } } }, google_push: { state: "on_google" }, rga_change: rc } } });
    try {
      const row = await text(withRc, '[data-mc-r="hours"]'), card = await text(withRc, '[data-rga-change="m1.gbp.hours_attributes"]');
      if (!/Updated by RGA · Nov 4/.test(row || "") || !/Ask for a change/.test(row || "")) fail(`step 3's hours row doesn't say RGA updated it (${row})`);
      if (!/Updated by RGA · Nov 4/.test(card || "") || !/Ask for a change/.test(card || "")) fail(`the hours card doesn't say RGA updated it (${card})`);
      const undo = await withRc.page.evaluate(() => /undo|put it back|revert/i.test(document.querySelector('[data-mc-r="hours"]').innerText + (document.querySelector('[data-rga-change]') || {}).innerText));
      if (undo) fail("the client is offered an undo of RGA's change (that is RGA's)");
    } finally { await withRc.close(); }
    const none = await open("allDone", "managed");
    try { if (await none.page.evaluate(() => !!document.querySelector("[data-rga-change]") || /Updated by RGA/.test(document.body.innerText))) fail("a step RGA never changed says RGA updated it"); } finally { await none.close(); }
  }
  // ── 5b · a card RGA hasn't finished is not a tick ──
  {
    const h = await open("plumber", "managed", { cards: false }, {});
    try {
      const marks = await h.page.evaluate(() => [...document.querySelectorAll(".mc-rrow")].map((r) => [r.getAttribute("data-mc-card"), r.querySelector(".mc-mk").className, r.querySelector(".mc-rt").innerText.replace(/\s+/g, " ").trim()]));
      for (const [id, cls, t] of marks) if (/ ok/.test(cls)) fail(`${id}: an unfinished card carries a green tick (${t})`);
      if (!marks.length) fail("no RGA cards drawn for a client whose cards aren't done");
      const offered = await h.page.evaluate(() => [...document.querySelectorAll('[data-mc-card^="m1.tracking."]')].filter((r) => r.querySelector(".mc-lk")).map((r) => r.getAttribute("data-mc-card")));
      if (offered.length) fail(`tracking that isn't on offers "Turn off": ${offered.join(", ")}`);
    } finally { await h.close(); }
  }
} catch (e) {
  if (e instanceof HarnessUnavailable) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
  console.error(`⚠️  INDETERMINATE — the gate threw: ${String(e.stack || e).slice(0, 400)}`); if (F.length) console.error("  failures so far:\n" + F.map((m) => "  · " + m).join("\n")); process.exit(2);
}
if (F.length) { console.error(`🔴 the managed portal's Month 1 list is wrong: ${F.length} problem(s)\n` + F.map((m) => `  · ${m}`).join("\n")); process.exit(1); }
console.log("✅ the managed Month 1 list draws 1–7 with step 3 and the five RGA cards; self-serve and no-mode are byte-identical to before; Looks right posts what each form posts; the RGA ask goes through the existing flag");
