#!/usr/bin/env node
// check-managed-portal-list.mjs — the MANAGED client portal's Month 1 list, DRAWN (approved client_portal_slim_v1 + client_portal_slim_visual_v1, 11-4).
//
// BOOTS THE REAL PORTAL in headless Chrome (scripts/lib/portal-boot-harness.mjs: the real portal.js and portal.css, our fake database, every
// function call answered and recorded; nothing leaves the laptop) and reads what it draws, for invented clients of four shapes.
// HOLDS:
//   1 · SELF-SERVE AND NO MODE DRAW EXACTLY AS BEFORE. The same clients, drawn by portal.js as it was before this build (git HEAD) and as it
//       is now, in self_serve, no-mode and column-missing: the Setup list's markup is byte-for-byte equal.
//   2 · MANAGED draws 1 kickoff · 2 website access · 3 Check your business details on Google · 4 photos · 5 review customers · 6 videos · 7 close-out, in that
//       order, with the five "check" steps NOT drawn as rows of their own and the five RGA cards in a "What RGA is doing" group, each with its action.
//   3 · STEP 3 is one card with the approved rows, each filled from what the portal reads. A phone that differs says "Which is right?", never
//       a pick. Nothing found is a blank field, never a guess. No website, a storefront (no service area), nothing found, Google down: each draws.
//   4 · "LOOKS RIGHT" posts, to portal-step-input, exactly what each covered step's own form posts, in order, one per step, and posts nothing
//       when a line is still open. "Fix something" opens the five steps' own cards. A tick in the summary is the form's own tick.
//   5 · THE RGA CARDS' ASK goes through the existing flag (portal-step-choice flag_wrong + the client's own words), and promises nothing more.
//   6 · THE PROFILE CHECK shows a card only when Google needs a code.
//   7 · (client_step02_managed_access_v1 + client_step03_business_details_v1, approved 11-4) STEP 2 is only the access, its lock ask reads
//       "Ask for a change" on its own spaced row; "Website pages and posts" is the sixth RGA line, opening to the posts card's own rows (3 + "+ N
//       more pages" + Posts), note and "Say no to posts" (the same portal-blog-posts press); step 3 is "Check your business details on Google";
//       "How you serve customers" + "Areas you serve" (every area a tag, the count in the chip); a FINISHED row reads Google now (portal-gbp-profile),
//       "Not on Google" when Google returns nothing, never the stored copy; services list each approved one (green on Google, dashed not yet,
//       "N of M on Google"); "Details on your profile" is the client's answer with its date. With MANAGED_PORTAL_BEFORE_KIT the parity proof
//       allows exactly one change for everyone else: the posts card's reason on its own line.
// exit 0 = holds · 1 = a drawn page is wrong · 2 = can't tell (no browser, the page didn't boot)
import fs from "node:fs";
import { bootPortal, HarnessUnavailable, SITE } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";

const F = [], fail = (m) => F.push(m);
const BEFORE = process.env.MANAGED_PORTAL_BEFORE_JS || "";   // portal.js as it was before this build; the parity proof skips (exit 2) without it
// shared/client-card-kit.js as it was before this build (optional). With it, the parity proof draws the OLD card kit too, and the ONE change allowed
// for a client who isn't managed is the posts card's reason on its own line (client_step02_managed_access_v1: "Not yetA service page…" was missing
// its separator for every client): <small> → <small class="pm-cs-why">. Anything else that differs fails.
const BEFORE_KIT = process.env.MANAGED_PORTAL_BEFORE_KIT || "";
const LIST = "[id^='action-items-list-'][id$='-m1']";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
// step 6's managed title is its own (client_step06_videos_v1, 11-4: the pill already says Optional) — read from its one home, the published managedLabel
const VIDEOS_MANAGED = (() => { try { const s = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/client-steps.json`, "utf8")).month1.find((x) => x.id === "m1.brand.youtube_setup"); return (s && (s.managedLabel || s.clientLabel)) || "?"; } catch { return "?"; } })();
// client_step03_business_details_v1 (approved 11-4): managed step 3 is "Check your business details on Google" (its one home: managed-steps.json)
const STEP3 = "Check your business details on Google";
// setup_vs_month1_v1 (11-10): a managed Setup is Getting started, 3 steps; photos, review asks, videos and the close-out call are Month 1 work in the Month 1 card on Ongoing work
const MANAGED_ORDER = ["Book your kickoff call", "Give RGA access to your website", STEP3];
// the posts card's answer (portal-blog-posts → _blog-client-plan.js), pages first: five service pages, then posts
const PAGES = ["Drain cleaning", "Water heaters", "Leak repair", "Sewer lines", "Gas lines"];
const BLOG_CARD = (over = {}) => ({ ok: true, setup: true, off: false, card: { state: "pages_first", title: "Your website posts", side: "pages come first", note: "Posts are never sold as a way to rank on Maps and never promise calls.", action: "off", actionLabel: "Say no to posts",
  rows: [...PAGES.map((s) => ({ label: `Page for ${s}`, value: "Not yet", sub: "A service page comes before any post" })), { label: "Posts", value: "Waiting", sub: "They start once the pages above are done" }], ...over } });
// a client whose website access RGA confirmed: the step is locked, and its ask is the lock's note to RGA
const ACCESS_LOCKED = { status: "done", completed_at: "2026-10-27T18:00:00Z", completed_by: "client", client_input: { via: "invite", platform: "wix", at: "2026-10-26T18:00:00Z" }, access: { confirmed_at: "2026-10-27T18:00:00Z" } };

async function open(scn, mode, over = {}, overrides = {}, extra = {}) {
  const S = SCENARIOS[scn] || scn;
  extra = { ...extra, fns: { "portal-blog-posts": () => BLOG_CARD(), ...(extra.fns || {}) } };
  const h = await bootPortal({ mode, tasks: { ...S.tasks, ...(over.cards === false ? {} : RGA_CARD_TASKS), ...(over.tasks || {}) }, now: over.now || S.now, verify: S.verify, website: S.website, ...extra }, overrides, SITE);
  if (process.env.GATE_TRACE) console.error(`· open ${typeof scn === "string" ? scn : "?"} ${mode} ${Object.keys(overrides).join(",")}`);
  // a busy machine (other builds' browsers) can miss the 30 s navigation once: one more try with longer, then it's INDETERMINATE (exit 2), never a pass
  try { await h.page.goto(`${h.base}/portal/`, { waitUntil: "domcontentloaded" }); }
  catch (e) { if (!/timeout/i.test(String(e && e.message))) throw e; await h.page.goto(`${h.base}/portal/`, { waitUntil: "domcontentloaded", timeout: 90000 }); }
  try { await h.ready(over.ready || LIST + " .pm-step-row", 20000); } catch { throw new HarnessUnavailable(`the Setup list never drew (${h.errs[0] || "no error"})`); }
  await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
  // setup_vs_month1_v1 (11-10): Getting started is the Setup tab; the RGA cards and Month 1 work moved to the Month 1 card on Ongoing work. This gate reads and presses both, so show both tabs.
  await h.page.addStyleTag({ content: ".pv-setup,.pv-ongoing{display:block !important}" });
  await tick(500);
  return h;
}
const rowsOf = (h) => h.page.evaluate((L) => [...document.querySelectorAll(`${L} > .pm-step-row:not(.mc-sub)`)].map((r) => ({ id: r.id.replace("step-row-", ""), num: (r.querySelector(".pm-step-num") || {}).textContent?.trim(), title: (r.querySelector(".pm-step-title") || {}).textContent?.trim(), pill: (r.querySelector(".pm-step-pills .pm-pill") || {}).textContent?.trim() })), LIST);
// the words an element holds, each text piece apart (a collapsed row's innerText runs tags and cells together: "SpringfieldShelbyville")
const text = (h, sel) => h.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), out = []; while (w.nextNode()) out.push(w.currentNode.nodeValue); return out.join(" ").replace(/\s+/g, " ").replace(/ ([.,;:!?])/g, "$1").trim(); }, sel);
const rawHtml = (h) => h.page.evaluate((L) => { const e = document.querySelector(L); return e ? e.innerHTML : null; }, LIST);
// the list fills in after it draws (Google's answers): read it only once it has stopped changing
const listHtml = async (h) => { let last = await rawHtml(h), same = 0; for (let i = 0; i < 40 && same < 3; i++) { await tick(300); const now = await rawHtml(h); same = now === last ? same + 1 : 0; last = now; } return last; };
const PARITY = { same: 0, sep: null };

try {
  // ── 0 · "N of M on Google" is admin step 32's own count: portal-gbp-profile adds now.approved from admin-gbp-services-push's reader + plan,
  //        the client's approved list PLUS what RGA ticked on their word (client_step03_business_details_v1). Run, not grepped, for the reader. ──
  {
    const { createRequire } = await import("node:module"), req = createRequire(`${SITE}/netlify/functions/x.js`);
    const SP = req("./admin-gbp-services-push.js");
    const task = { approval: { decision: "approved", at: "2026-09-15T17:15:46Z", approved_content: "services:\n  - displayName: Drain cleaning\n  - displayName: Gas lines\n" }, told_services: { at: "2026-11-01T12:00:00Z", items: [{ label: "Water softeners" }] } };
    const ap = typeof SP.approvedOf === "function" ? SP.approvedOf(task) : null;
    if (!ap || JSON.stringify(ap.names) !== JSON.stringify(["Drain cleaning", "Gas lines", "Water softeners"]) || ap.at !== "2026-09-15T17:15:46Z") fail(`the approved-services reader reads ${JSON.stringify(ap && ap.names)} (${ap && ap.at}), not the approved list plus RGA's ticks`);
    const view = { on: ["g:drain"], options: [{ key: "g:drain", label: "Drain cleaning (residential)" }, { key: "f:gas-lines", label: "Gas lines" }] };
    if (ap && JSON.stringify(SP.plan(ap.names, view).rows) !== JSON.stringify([{ name: "Drain cleaning", on: true }, { name: "Gas lines", on: false }, { name: "Water softeners", on: false }])) fail("the approved services aren't each marked on Google or not by admin step 32's plan");
    if (SP.approvedOf({}).names.length || SP.approvedOf({ approval: { decision: "declined", approved_content: "displayName: X" } }).names.length) fail("a step with no approved list reads as having one");
    const PG = fs.readFileSync(`${SITE}/netlify/functions/portal-gbp-profile.js`, "utf8").replace(/\/\/.*$/gm, "");
    if (!/SP\.approvedOf\(t6\)/.test(PG) || !/if \(ap\.names\.length\) now\.approved = \{ rows: SP\.plan\(ap\.names, now\)\.rows, at: ap\.at \};/.test(PG) || !/require\("\.\/admin-gbp-services-push"\)/.test(PG)) fail("portal-gbp-profile doesn't add now.approved from admin step 32's reader and plan");
  }
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
          const kit = BEFORE_KIT && fs.existsSync(BEFORE_KIT);
          const a = await open(scn, mode, {}, { "/portal/portal.js": BEFORE, ...(kit ? { "/shared/client-card-kit.js": BEFORE_KIT } : {}) });
          try {
            const x = await listHtml(a), raw = html[mode];
            // the one allowed difference (BEFORE_KIT given): the posts card's reason line. It must BE there, and nothing else may differ.
            const y = kit ? String(raw || "").replaceAll('<small class="pm-cs-why">', "<small>") : raw;
            if (kit && !/<small class="pm-cs-why">A service page comes before any post<\/small>/.test(raw || "")) fail(`parity ${scn}/${mode}: the posts card's reason isn't on its own line (no pm-cs-why)`);
            if (kit && scn === "plumber" && mode === null) PARITY.sep = { before: (x.match(/Page for Drain cleaning<\/b> · Not yet<small[^>]*>[^<]*<\/small>/) || [""])[0], now: ((raw || "").match(/Page for Drain cleaning<\/b> · Not yet<small[^>]*>[^<]*<\/small>/) || [""])[0], changed: (raw || "").split('class="pm-cs-why"').length - 1 };
            if (x !== y) { let i = 0; while (x && y && x[i] === y[i]) i++; fail(`parity ${scn}/${mode}: the list differs from before the build, first at char ${i}: before «${(x || "").slice(Math.max(0, i - 40), i + 80)}» now «${(y || "").slice(Math.max(0, i - 40), i + 80)}»`); }
            else PARITY.same++;
          } finally { await a.close(); }
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
      if (JSON.stringify(rows.map((r) => r.num)) !== JSON.stringify(["1", "2", "3"]) && !(scn === "allDone" || scn === "noWebsite")) fail(`${scn}: the numbers read ${rows.map((r) => r.num).join(",")}, approved 1–3`);
      const check = await h.page.evaluate((L) => [...document.querySelectorAll(`${L} > .pm-step-row > .pm-step-row-head .pm-step-title`)].map((e) => e.textContent).filter((t) => /Verify your Google|Check your business on Google|categories|business hours|what's true/i.test(t)), LIST);
      if (check.length) fail(`${scn}: a "check" step is drawn as its own row: ${check.join(" · ")}`);
      await h.page.waitForSelector("[data-mc-blog][data-blog-filled]", { timeout: 8000 }).catch(() => {});
      const grp = await h.page.evaluate(() => [...document.querySelectorAll(".mc-rrow")].map((r) => ({ t: r.querySelector(".mc-rt b")?.textContent, a: r.querySelector(".mc-lk")?.textContent, id: r.getAttribute("data-mc-card") })));
      // client_step02_managed_access_v1: the sixth line, "Website pages and posts", opens to the plan
      const want = [["m1.strategy.keywords_locations", "See why"], ["m1.gbp.booking_link", "Change"], ["m1.brand.social_profiles", "Not mine"], ["m1.tracking.form_setup", "Turn off"], ["managed.website_posts", "See the plan"]];
      if (JSON.stringify(grp.map((g) => [g.id, g.a])) !== JSON.stringify(want)) fail(`${scn}: "What RGA is doing" reads ${JSON.stringify(grp.map((g) => [g.id, g.a]))}, approved ${JSON.stringify(want)}`);
      if (!/what rga is doing/i.test((await text(h, ".mc-phase")) || "")) fail(`${scn}: no "What RGA is doing" heading`);
      // step 2 is only the access: the posts card is not drawn in it (it is the sixth line above)
      if (await h.page.evaluate(() => !!document.querySelector('[id="step-row-m1.access.website"] [data-blog-plan]'))) fail(`${scn}: step 2 still draws the "Your website posts" card`);
      T[scn] = { s3: await text(h, "[data-mc-sum]"), row: await text(h, "[data-mc-row]"), pill: rows[2] && rows[2].pill,
        pills: await h.page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-mc-sum] [data-mc-r]")].map((r) => [r.getAttribute("data-mc-r"), (r.querySelector(".p") || {}).innerText?.trim() || ""]))), looks: await h.page.evaluate(() => { const b = document.querySelector("[data-mc-looks]"); return b ? { hidden: b.hidden, disabled: b.disabled } : null; }),
        verifyShown: await h.page.evaluate(() => { const v = document.querySelector("[data-mc-verify]"); return v ? !v.hidden && getComputedStyle(v).display !== "none" : null; }), subs: await h.page.evaluate(() => document.querySelectorAll("[data-mc-fixarea] > .mc-sub").length) };
      const heads = await h.page.evaluate(() => [...document.querySelectorAll(".mc-sub > .pm-step-row-head")].filter((e) => getComputedStyle(e).display !== "none").length);
      if (heads) fail(`${scn}: ${heads} step card(s) inside step 3 or the RGA group draw a second head of their own`);
      const w = await h.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); if (w) fail(`${scn}: the managed list is wider than the page`);
      if (h.errs.length) fail(`${scn}: the page threw: ${h.errs[0]}`);
    } finally { await h.close(); }
  }
  const has = (k, ...w) => w.forEach((x) => { if (!(T[k].s3 || "").includes(x)) fail(`${k}: step 3 doesn't say "${x}" (reads: ${(T[k].s3 || "").slice(0, 400)})`); });
  const lacks = (k, ...w) => w.forEach((x) => { if ((T[k].s3 || "").includes(x)) fail(`${k}: step 3 says "${x}" and must not (reads: ${(T[k].s3 || "").slice(0, 300)})`); });
  // client_step03_business_details_v1: "Where you work" is two rows; EVERY area is a tag (never "+2"); a missing value is "Not on Google"
  has("plumber", "We filled this in from Google", "Business name", "Acme Plumbing", "(555) 010-1234", "You told us (555) 010-9999", "Which is right?", "How you serve customers", "You go to your customers", "No public address on Google, as for every business that travels to its customers.", "Areas you serve", "Springfield Shelbyville Capital City Ogdenville North Haverbrook", "5 · Matches Google", "Mon–Fri 8 AM–5 PM", "Drain cleaning", "Sewer lines", "Untick any you don't do", "Only you can say", "Women-owned", "Veteran-owned", "Tick only if true", "change on Google only with your OK on the exact value");
  for (const k of Object.keys(T)) lacks(k, "Where you work", "Not found", "+2", "Confirmed");
  has("allMatch", "Matches Google"); lacks("allMatch", "Which is right?");
  has("storefront", "Customers come to you", "Areas you serve Not on Google"); lacks("storefront", "Only you can say", "Which is right?", "undefined", "null", "No public address");
  has("storefront", "Google lists none for your categories");
  has("noWebsite", "Website", "Not on Google", "Add it"); lacks("noWebsite", "acmeplumbing.test");
  has("nothingFound", "Not on Google", "Add it", "Add your hours", "RGA is setting your Google categories first"); lacks("nothingFound", "Customers come to you", "You go to your customers", "Matches Google", "Acme");
  // finished: every value read from Google now, with the real result in place of "Confirmed"
  has("allDone", "You go to your customers", "Springfield Shelbyville Capital City Ogdenville North Haverbrook", "Mon–Fri 8 AM–5 PM", "Drain cleaning Water heaters", "Green is on Google now.", "Details on your profile Women-owned");
  // allDone's record put ONE area on Google (Springfield) and Google now lists five: that is not a match, and it is never called one
  const wantPills = { name: "Matches Google", phone: "Matches Google", website: "Matches Google", serve: "Matches Google", areas: "Which is right?", hours: "Matches Google", services: "2 on Google", details: "Matches Google" };
  if (JSON.stringify(T.allDone.pills) !== JSON.stringify(wantPills)) fail(`allDone: the finished rows' results read ${JSON.stringify(T.allDone.pills)}, want ${JSON.stringify(wantPills)}`);
  // the step-3 title, from its one home
  for (const k of Object.keys(T)) if (!(T[k].row || "").includes(STEP3) || /Check what we found/.test(T[k].row || "")) fail(`${k}: managed step 3 isn't titled "${STEP3}"`);
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
  // ── 4c · a FINISHED step reads Google now (client_step03_business_details_v1: "every value is read from Google"): what Google doesn't return is
  //        "Not on Google", a record with nothing to compare is never "Matches Google", and Google unreadable says so (never the stored copy) ──
  {
    const facts = { status: "done", completed_at: "2026-11-02T18:00:00Z", client_input: { name: "Acme Plumbing" }, google_push: { state: "on_google", after: { name: "Acme Plumbing", phone: "5550101234", website: "https://acmeplumbing.test", come: false, area: ["Springfield, IL"] } } };
    const nowNone = { ...SCENARIOS.allDone.now, "m1.gbp.business_facts": { google: { name: "Acme Plumbing", phone: "", website: "https://acmeplumbing.test", come: null, area: [], region: "US" }, told: {}, same: {}, recommend: null, missing: [] } };
    const h = await open("allDone", "managed", { tasks: { "m1.gbp.business_facts": facts }, now: nowNone });
    try {
      const t = await text(h, "[data-mc-sum]");
      if (!/Phone Not on Google Which is right\?/.test(t || "")) fail(`a finished phone Google no longer returns isn't "Not on Google" + "Which is right?" (${(t || "").slice(0, 400)})`);
      if (!/How you serve customers Not on Google/.test(t || "") || /You go to your customers|Customers come to you/.test(t || "")) fail(`how customers are served is guessed when Google says nothing (${(t || "").slice(0, 400)})`);
      if (!/Areas you serve Not on Google Which is right\?/.test(t || "")) fail(`a finished area list Google no longer returns isn't "Not on Google" (${(t || "").slice(0, 400)})`);
      const calls = h.fnCalls.filter((c) => c.name === "portal-gbp-profile").map((c) => c.body && c.body.step_id);
      for (const id of ["m1.gbp.business_facts", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"]) if (!calls.includes(id)) fail(`a finished ${id} row didn't read Google (portal-gbp-profile was asked for ${JSON.stringify(calls)})`);
    } finally { await h.close(); }
    const down = await open("allDone", "managed", { now: { "m1.gbp.business_facts": null, "m1.gbp.services_products": null, "m1.gbp.hours_attributes": null, "m1.gbp.attributes": null } });
    try {
      const t = await text(down, "[data-mc-sum]");
      if (!/couldn't read Google just now/.test(t || "") || /Acme Plumbing|Matches Google|Drain cleaning/.test(t || "")) fail(`Google unreadable on a finished step shows a stored value or a result (${(t || "").slice(0, 300)})`);
    } finally { await down.close(); }
  }
  // ── 4f · services: each one the client approved, green when Google lists it, dashed when it isn't on Google yet, "N of M on Google" (admin step 32's count) ──
  {
    const nowAp = { ...SCENARIOS.allDone.now, "m1.gbp.services_products": { ...SCENARIOS.allDone.now["m1.gbp.services_products"], approved: { at: "2026-09-15T17:15:46Z", rows: [{ name: "Drain cleaning", on: true }, { name: "Gas lines", on: false }, { name: "Water softeners", on: false }] } } };
    const attr = { status: "done", completed_at: "2026-11-04T16:29:28Z", completed_by: "client", client_input_at: "2026-11-04T16:29:28Z", client_input: [], google_push: { state: "on_google", after: [] } };
    const h = await open("allDone", "managed", { tasks: { "m1.gbp.attributes": attr }, now: { ...nowAp, "m1.gbp.attributes": SCENARIOS.allDone.now["m1.gbp.attributes"] && { ...SCENARIOS.allDone.now["m1.gbp.attributes"], ticked: [] } } });
    try {
      const sv = await h.page.evaluate(() => { const r = document.querySelector('[data-mc-r="services"]'); return r ? { tags: [...r.querySelectorAll(".mc-tag")].map((t) => [t.textContent, t.classList.contains("is-off")]), pill: (r.querySelector(".mc-pill") || {}).textContent, cls: (r.querySelector(".mc-pill") || {}).className, sub: (r.querySelector(".v small") || {}).textContent,
        dashed: getComputedStyle(r.querySelector(".mc-tag.is-off")).borderTopStyle, green: getComputedStyle(r.querySelector(".mc-tag:not(.is-off)")).backgroundColor } : null; });
      if (!sv || JSON.stringify(sv.tags) !== JSON.stringify([["Drain cleaning", false], ["Gas lines", true], ["Water softeners", true]])) fail(`services don't list each approved one, green on Google and dashed not yet (${JSON.stringify(sv && sv.tags)})`);
      if (!sv || sv.pill !== "1 of 3 on Google" || !/\brga\b/.test(sv.cls || "")) fail(`the services count isn't "1 of 3 on Google" in RGA's color (${sv && sv.pill} ${sv && sv.cls})`);
      if (!sv || sv.sub !== "Green is on Google now. Dashed is what you approved Sep 15; RGA is adding them.") fail(`the services line reads "${sv && sv.sub}"`);
      if (!sv || sv.dashed !== "dashed" || sv.green === "rgba(0, 0, 0, 0)") fail(`a not-on-Google service isn't dashed, or an on-Google one isn't green (${sv && sv.dashed} ${sv && sv.green})`);
      const det = await text(h, '[data-mc-r="details"]');
      if (!/None of these apply/.test(det || "") || !/You said so Nov 4\./.test(det || "") || !/Matches Google/.test(det || "")) fail(`"Details on your profile" isn't the client's answer with its date and the result (${det})`);
    } finally { await h.close(); }
  }
  // ── 4g · step 2 is only the access; "Ask for a change" (the lock's note to RGA) on its own row; the sixth RGA line opens to the posts plan ──
  {
    const posts = [];
    const fns = { "portal-blog-posts": (b) => { posts.push(b); return b && b.action === "off" ? BLOG_CARD({ state: "off", title: "Your website posts: off", side: "you decided Nov 4", rows: [], note: "Nothing is written and nothing waits behind it.", action: "on", actionLabel: "Turn posts back on" }) : BLOG_CARD(); } };
    const h = await open("plumber", "managed", { tasks: { "m1.access.website": ACCESS_LOCKED } }, {}, { fns });
    try {
      await h.page.evaluate(() => { const r = document.getElementById("step-row-m1.access.website"); if (r && r.classList.contains("is-collapsed")) r.querySelector(".pm-step-row-head").click(); });
      await tick(900);
      const s2 = await h.page.evaluate(() => {
        const row = document.getElementById("step-row-m1.access.website"), b = row && row.querySelector("[data-cs-ask]"), card = row && row.querySelector(".pm-cs-card");
        if (!b || !card) return { b: !!b, card: !!card };
        const br = b.getBoundingClientRect(), cr = card.getBoundingClientRect(), acts = b.parentElement;
        const next = [...row.querySelectorAll("*")].filter((e) => e.offsetParent && !b.contains(e) && !acts.contains(e) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top >= br.bottom - 0.5).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0];
        return { word: b.textContent, above: Math.round(br.top - cr.bottom), below: next ? Math.round(next.getBoundingClientRect().top - br.bottom) : 99, w: Math.round(br.width), rowW: Math.round(row.getBoundingClientRect().width), alone: acts.children.length, posts: !!row.querySelector("[data-blog-plan]"), change: /Change something/.test(row.innerText) };
      });
      if (s2.word !== "Ask for a change") fail(`managed step 2's lock ask reads "${s2.word}", approved "Ask for a change"`);
      if (s2.change) fail("managed step 2 still says \"Change something\"");
      if (!(s2.above >= 10 && s2.below >= 10)) fail(`"Ask for a change" touches what's around it (${s2.above}px above, ${s2.below}px below)`);
      if (!(s2.w < s2.rowW / 2) || s2.alone !== 1) fail(`"Ask for a change" isn't one button sized to its words on its own row (${s2.w}px of ${s2.rowW}, ${s2.alone} in its row)`);
      if (s2.posts) fail("managed step 2 still draws the posts card");
      // the sixth line, closed then open
      await h.page.waitForSelector("[data-mc-blog][data-blog-filled]", { timeout: 8000 }).catch(() => {});
      const line = await text(h, '[data-mc-card="managed.website_posts"]');
      if (line !== "Website pages and posts · 5 pages first, then posts. Each one waits for your approval See the plan") fail(`the posts line reads "${line}"`);
      const mark = await h.page.evaluate(() => (document.querySelector('[data-mc-card="managed.website_posts"] .mc-mk') || {}).className);
      if (!/\bopen\b/.test(mark || "")) fail(`the posts line isn't drawn as not done yet (${mark})`);
      if (await h.page.evaluate(() => !document.querySelector('[data-mc-panel="managed.website_posts"]').hidden)) fail("the posts plan is open before See the plan is pressed");
      await h.page.click('[data-mc-rc="managed.website_posts"]'); await tick(300);
      const pn = await h.page.evaluate(() => { const p = document.querySelector('[data-mc-panel="managed.website_posts"]'); const vis = (e) => e && e.offsetParent !== null;
        return { open: vis(p), items: [...p.querySelectorAll(".mc-pi")].filter(vis).map((i) => i.innerText.replace(/\s+/g, " ").trim()), more: (p.querySelector("[data-mc-more]") || {}).textContent, note: (p.querySelector(".mc-bnote") || {}).textContent,
          btn: (p.querySelector("[data-blog-off]") || {}).textContent, reasonBlock: getComputedStyle(p.querySelector(".mc-pi small")).display, order: [...p.children].map((c) => c.className.split(" ")[0] || c.tagName) }; });
      if (!pn.open) fail("See the plan doesn't open the posts plan");
      const want3 = ["Page for Drain cleaning · Not yet A service page comes before any post", "Page for Water heaters · Not yet A service page comes before any post", "Page for Leak repair · Not yet A service page comes before any post", "Posts · Waiting They start once the pages above are done"];
      if (JSON.stringify(pn.items) !== JSON.stringify(want3)) fail(`the posts plan shows ${JSON.stringify(pn.items)}, approved the first three pages, "+ 2 more pages", then Posts`);
      if (pn.more !== "+ 2 more pages") fail(`the fold reads "${pn.more}"`);
      if (pn.reasonBlock !== "block") fail(`the reason runs into "Not yet" (display ${pn.reasonBlock})`);
      if (pn.note !== "Posts are never sold as a way to rank on Maps and never promise calls.") fail(`the posts plan's note reads "${pn.note}"`);
      if (pn.btn !== "Say no to posts") fail(`the posts plan has no "Say no to posts" (${pn.btn})`);
      if (JSON.stringify(pn.order) !== JSON.stringify(["mc-pi", "mc-pi", "mc-pi", "mc-more", "mc-pmore", "mc-pi", "mc-bnote", "pm-amend"])) fail(`the posts plan's parts are out of the approved order: ${pn.order.join(", ")}`);
      await h.page.click('[data-mc-panel="managed.website_posts"] [data-mc-more]'); await tick(200);
      const all = await h.page.evaluate(() => [...document.querySelectorAll('[data-mc-panel="managed.website_posts"] .mc-pi')].filter((e) => e.offsetParent !== null).length);
      if (all !== 6) fail(`"+ 2 more pages" doesn't show the rest (${all} rows shown, 6 in the plan)`);
      // the group doesn't say "Open any line" for it: nothing in it waits on the client
      if (!/Nothing here waits on you/.test((await text(h, ".mc-phase")) || "")) fail("the posts line makes What RGA is doing say something waits on the client");
      // Say no to posts: the same press the card has (portal-blog-posts off), and the line says what came back
      await h.page.click('[data-mc-panel="managed.website_posts"] [data-blog-off]'); await tick(800);
      if (!posts.some((p) => p && p.action === "off" && p.client_id)) fail(`Say no to posts didn't go to portal-blog-posts as "off" (${JSON.stringify(posts.slice(-2))})`);
      const after = await text(h, '[data-mc-card="managed.website_posts"]');
      if (!/Off, you decided Nov 4/.test(after || "")) fail(`after Say no to posts the line reads "${after}"`);
      if (await h.page.evaluate(() => document.querySelector('[data-mc-panel="managed.website_posts"]').hidden)) fail("the posts plan closed itself after Say no to posts");
      if (h.errs.length) fail(`step 2 / posts: the page threw: ${h.errs[0]}`);
    } finally { await h.close(); }
    // not set up yet: no line; the five others stay
    const ns = await open("plumber", "managed", {}, {}, { fns: { "portal-blog-posts": () => ({ ok: true, setup: false, off: false, card: { state: "not_set_up", rows: [], action: null } }) } });
    try { await ns.page.waitForSelector("[data-mc-blog][data-blog-filled]", { timeout: 8000 }).catch(() => {}); await tick(200);
      if (await ns.page.evaluate(() => { const b = document.querySelector("[data-mc-blog]"); return !b || !b.hidden || document.querySelectorAll(".mc-rrow").length !== 4; })) fail("posts not set up yet still draws a fifth line");   // setup_vs_month1_v1: call tracking left the group (its own choice card)
    } finally { await ns.close(); }
    // self-serve keeps the card under step 2, with "Change something" on a locked step
    const ss = await open("plumber", "self_serve", { tasks: { "m1.access.website": ACCESS_LOCKED } });
    try { await tick(600);
      await ss.page.waitForSelector("[data-blog-plan][data-blog-filled] .pm-cs-why", { timeout: 8000 }).catch(() => {});
      const r = await ss.page.evaluate(() => { const row = document.getElementById("step-row-m1.access.website"), why = row.querySelector("[data-blog-plan] .pm-cs-ev small.pm-cs-why"); return { posts: !!row.querySelector("[data-blog-plan]"), ask: (row.querySelector("[data-cs-ask]") || {}).textContent, line: !!document.querySelector("[data-mc-blog]"), why: why ? getComputedStyle(why).display : null }; });
      if (!r.posts || r.ask !== "Change something" || r.line) fail(`self-serve step 2 changed (posts card ${r.posts}, ask "${r.ask}", managed line ${r.line})`);
      // the one change for every client: the posts card's reason on its own line ("Not yetA service page…" had no separator)
      if (r.why !== "block") fail(`the posts card's reason still runs into "Not yet" for a self-serve client (display ${r.why})`);
    } finally { await ss.close(); }
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
    const three = open1.filter((i) => i.t.includes(STEP3));
    if (three.length !== 1 || three[0].no !== "3") fail(`To do (managed): step 3 isn't ONE item numbered 3 (${JSON.stringify(open1.map((i) => [i.no, i.t.slice(0, 40)]))})`);
    if (open1.some((i) => /Check your business on Google|categories|business hours|what's true|Verify your Google|keyword plan|call tracking|booking link|social profiles|form/i.test(i.t))) fail(`To do (managed) still lists a step that lives inside step 3 or an RGA card: ${JSON.stringify(open1.map((i) => i.t.slice(0, 50)))}`);
    // setup_vs_month1_v1: only Getting started blocks, so To do lists the open Getting started steps; photos (Month 1 work) have no number and are not a client move
    if (open1.some((i) => i.no === "4")) fail("To do (managed): photos still read as step 4 (Month 1 work has no number)");
    if (!/Month 1 · 2 of 3 done/.test(m.head)) fail(`To do (managed): the progress line isn't "2 of 3" (${m.head.replace(/\s+/g, " ").slice(0, 160)})`);
    if (!/about 20 minutes/.test(m.head)) fail(`To do (managed): the minutes aren't step 3's (from managed.check) plus photos (${m.head.replace(/\s+/g, " ").slice(0, 160)})`);
    const allDone = ["m1.gbp.verify", "m1.gbp.business_facts", "m1.gbp.services_products", "m1.gbp.hours_attributes", "m1.gbp.attributes"].map((id) => ({ id, at: "2026-11-03T12:00:00Z" }));
    const d = await todo("managed", [...allDone, { id: "m1.brand.social_profiles", at: "2026-11-03T12:00:00Z" }], undefined);
    const doneItems = d.items.filter((i) => i.done);
    if (doneItems.filter((i) => i.t.includes(STEP3)).length !== 1 || doneItems.some((i) => /social|business on Google|hours/i.test(i.t))) fail(`To do (managed): Done doesn't hold step 3 once and nothing inside it (${JSON.stringify(doneItems.map((i) => i.t.slice(0, 40)))})`);
    // self-serve is today's list: the covered steps are items of their own, and it is the same markup as with no mode
    const ss = await todo("self_serve", []), nm = await todo(null, []);
    if (ss.html !== nm.html) fail("To do: self-serve and no mode draw different lists");
    if (!ss.items.some((i) => /Check your business on Google/.test(i.t)) || ss.items.some((i) => i.t.includes(STEP3) || /Check what we found/.test(i.t))) fail("To do (self-serve) isn't today's list");
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
  // ── 4h · client_setup_bottom_v1 (approved 11-4): the RGA lines say the real value and when; no Foundation work card; About your business, done,
  //        is one Done pill, each question beside its answer (a row opens it to change it), an unanswered question to RGA, one closing line ──
  {
    const real = {
      "m1.gbp.booking_link": { status: "done", completed_at: "2026-10-30T00:41:58Z", completed_by: "rga", rga_put: { at: "2026-10-30T00:41:58Z", url: "https://www.acmeplumbing.test/book-online/" }, google_push: { state: "on_google", at: "2026-10-29T18:00:00Z", link: "https://www.acmeplumbing.test/book-online/", sent: "https://www.acmeplumbing.test/book-online/?utm_source=google" } },
      "m1.brand.social_profiles": { status: "done", completed_at: "2026-11-04T16:53:46Z", client_input: { profiles: [{ key: "youtube", label: "YouTube", handle: "@acmeplumbing", url: "https://www.youtube.com/@acmeplumbing", check: { at: "2026-11-04T16:53:48Z", state: "opens" } }] } },
      "m1.tracking.call_setup": { status: "skipped", updated_at: "2026-10-02T14:38:26Z" },
      "m1.tracking.form_setup": { status: "done", completed_at: "2026-09-18T06:00:59Z", completed_by: "detected", detected: { n: 0, n90: 0, at: "2026-11-03T18:01:50Z", verdict: "indeterminate", evidence: "No form submissions recorded yet — that may just mean nobody has filled the form in." } },
    };
    const FACTS = { ok: true, answered: 2, total: 2, confirmed: { at: "2026-09-21T18:00:00Z" }, stakes: { heading: "Why we ask.", body: "These publish under your name." },
      questions: [{ key: "geography_model", label: "Where does your work happen?", help: "Whether customers come to you.", answered: true, value: "service_area", selected: "service_area", options: [{ key: "service_area", label: "You travel out to customers across an area" }, { key: "single_location", label: "Customers come to you" }], asks: [] },
        { key: "rush_policy", label: "Do you take urgent jobs?", help: "Someone needs it today.", answered: true, value: "same day", selected: "same_day", options: [{ key: "same_day", label: "Same business day for emergencies" }, { key: "no", label: "No" }], asks: [{ id: "a1", key: "rush_policy", message: "Does an old licence still count?", at: "2026-09-15T18:00:00Z", reply: null }] }] };
    // the Foundation work card is drawn on the onboarding stage (stage_4_onboarding), where the Month 1 list sits in the stage's own card
    const boot = (mode) => open("plumber", mode, { tasks: real, ready: "[id^='action-items-list-'] .pm-step-row" }, {}, { stage: "stage_4_onboarding", fns: { "client-facts": () => FACTS } });
    const h = await boot("managed");
    try {
      await h.page.waitForSelector("#factsCard", { timeout: 8000 }).catch(() => {});
      const lines = await h.page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".mc-rrow")].map((r) => [r.getAttribute("data-mc-card"), { mk: (r.querySelector(".mc-mk").className.split(" ")[1] || ""), t: r.querySelector(".mc-rt").textContent.replace(/\s+/g, " ").trim(), sub: (r.querySelector(".mc-rt small") || {}).textContent || "", act: (r.querySelector(".mc-lk") || {}).textContent || "" }])));
      const want = {
        "m1.gbp.booking_link": { mk: "ok", t: "Booking link on Google · acmeplumbing.test/book-onlineOn Google since Oct 29", sub: "On Google since Oct 29", act: "Change" },
        "m1.brand.social_profiles": { mk: "ok", t: "Social profiles · YouTube, @acmeplumbingThe link opens · checked Nov 4", sub: "The link opens · checked Nov 4", act: "Not mine" },
        "m1.tracking.form_setup": { mk: "ok", t: "Form tracking · Counting your website formNo form sends yet · checked Nov 3", sub: "No form sends yet · checked Nov 3", act: "Turn off" },
      };
      for (const [id, w] of Object.entries(want)) if (JSON.stringify(lines[id]) !== JSON.stringify(w)) fail(`RGA line ${id} reads ${JSON.stringify(lines[id])}, approved ${JSON.stringify(w)}`);
      if (/RGA sets this up|On your Google profile|—/.test(JSON.stringify(lines))) fail(`an RGA line still says a placeholder or carries an em dash: ${JSON.stringify(lines)}`);
      if (await h.page.evaluate(() => [...document.querySelectorAll(".pm-notice")].some((n) => /Foundation work/.test(n.textContent)))) fail("a managed client still sees the Foundation work card");
      const fc = await h.page.evaluate(() => { const c = document.getElementById("factsCard"); if (!c) return null; const t = (e) => (e ? e.textContent.replace(/\s+/g, " ").trim() : "");
        return { open: c.open, h: t(c.querySelector(".ap-h")), pill: t(c.querySelector(".fct-sum-state")), pills: c.querySelectorAll(".fct-sum .fct-sum-state, .fct-sum .pm-pill").length, qa: [...c.querySelectorAll(":scope > .fct-qa")].map((r) => [t(r.children[0]), t(r.children[1])]), ask: t(c.querySelector(".fct-qask")), foot: t(c.querySelector(".fct-mgfoot")), stakes: !!c.querySelector(".fct-stakes"), outcome: !!c.querySelector(".pm-outcome"), qsShown: [...c.querySelectorAll(".fq")].filter((e) => e.offsetParent).length }; });
      if (!fc) fail("About your business isn't drawn for a managed client");
      else {
        if (fc.h !== "2 answers · confirmed Sep 21" || fc.pill !== "Done" || fc.pills !== 1) fail(`About your business (done) reads "${fc.h}" with ${fc.pills} pill(s) "${fc.pill}", approved "2 answers · confirmed Sep 21" + one Done`);
        if (!fc.open) fail("About your business (done) doesn't show its answers");
        if (JSON.stringify(fc.qa) !== JSON.stringify([["Where does your work happen?", "You travel out to customers across an area"], ["Do you take urgent jobs?", "Same business day for emergencies"]])) fail(`About your business rows read ${JSON.stringify(fc.qa)}`);
        if (fc.ask !== 'Your question from Sep 15 · "Does an old licence still count?"RGA hasn\'t replied yet') fail(`the unanswered question reads "${fc.ask}"`);
        if (fc.foot !== "These go on your website, your Google listing and replies we send your customers. Change any answer, and we'll ask you to confirm again.") fail(`the closing line reads "${fc.foot}"`);
        if (fc.stakes || fc.outcome || fc.qsShown) fail(`About your business (done) still draws the stakes, the Confirmed block or the full questions (${JSON.stringify(fc)})`);
        await h.page.click('#factsCard [data-fct-qa="rush_policy"]'); await tick(200);
        const ed = await h.page.evaluate(() => { const b = document.querySelector('[data-fct-qedit="rush_policy"]'); return b && !b.hidden && !!b.querySelector("[data-fq-pick], [data-fq-clear]"); });
        if (!ed) fail("pressing an answer doesn't open that question to change it");
      }
      if (h.errs.length) fail(`setup bottom: the page threw: ${h.errs[0]}`);
    } finally { await h.close(); }
    const s = await boot("self_serve");
    try {
      await s.page.waitForSelector("#factsCard", { timeout: 8000 }).catch(() => {});
      const r = await s.page.evaluate(() => ({ found: !!document.querySelector(".pm-notice") && [...document.querySelectorAll(".pm-notice")].some((n) => /Foundation work/.test(n.textContent)), h: (document.querySelector("#factsCard .ap-h") || {}).textContent, pill: (document.querySelector("#factsCard .fct-sum-state") || {}).textContent, qa: document.querySelectorAll(".fct-qa").length }));
      if (!r.found || r.h !== "2 of 2 answered" || r.pill !== "All answered" || r.qa) fail(`self-serve's bottom of Setup changed: ${JSON.stringify(r)}`);
    } finally { await s.close(); }
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
if (PARITY.sep) console.log(`  parity: ${PARITY.same} not-managed drawings equal to before the build; the one allowed change, ${PARITY.sep.changed} posts-card reason line(s):\n    before «${PARITY.sep.before}»\n    now    «${PARITY.sep.now}»`);
else if (BEFORE) console.log(`  parity: ${PARITY.same} not-managed drawings equal to before the build (portal.js only; set MANAGED_PORTAL_BEFORE_KIT to compare the card kit too)`);
console.log("✅ the managed Month 1 list draws 1–7 with step 3 \"" + STEP3 + "\" and six RGA lines (the sixth: Website pages and posts, opening to the plan); step 2 is only the access with \"Ask for a change\"; finished step 3 rows read Google now (areas and services as tags, the real result); self-serve and no-mode are byte-identical to before; Looks right posts what each form posts; the RGA ask goes through the existing flag");
