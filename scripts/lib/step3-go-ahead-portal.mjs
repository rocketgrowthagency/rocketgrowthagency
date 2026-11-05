// step3-go-ahead-portal.mjs — the portal half of check-managed-step3-go-ahead: managed step 3 DRAWN in headless Chrome (portal-boot-harness: the real
// portal.js + portal.css, our fake database, a fixed clock; nothing leaves the laptop). Day 1 = today's card exactly; days 5 to 7 = the line under
// the title + the band; after the go-ahead = the Done card in the mockup's order and words; self-serve none of it; "Your turn" stamps day 1 once.
import { bootPortal, HarnessUnavailable, CID } from "./portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./managed-portal-scenarios.mjs";

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const ROW = '[id="step-row-managed.check_found"]';
const KICKOFF = "2026-10-09T16:11:50Z";

export async function drawPortal({ SITE, G, X, AGENCY, AGENCY_SITE, DAY1, fail }) {
  const S = SCENARIOS.plumber;
  // what Google shows now, for the open forms and the finished rows (the same shape portal-gbp-profile answers)
  const now = {
    "m1.gbp.business_facts": { google: AGENCY.facts, told: { name: AGENCY.facts.name, phone: AGENCY.facts.phone, website: AGENCY.facts.website, come: false }, same: { name: true, phone: true, website: true, come: true, area: null }, recommend: null, missing: [] },
    "m1.gbp.hours_attributes": { ...AGENCY.hours, closed: [], holidayDates: {}, split: [] },
    "m1.gbp.services_products": { ...AGENCY.services, suggested: [] },
    "m1.gbp.attributes": { ...AGENCY.attrs, recommend: [] },
  };
  const overrides = {};
  if (process.env.G7_PORTAL_JS) overrides["/portal/portal.js"] = process.env.G7_PORTAL_JS;
  if (process.env.G7_PORTAL_CSS) overrides["/portal/portal.css"] = process.env.G7_PORTAL_CSS;
  const open = async (mode, { clock, onboarding = {}, tasks = {} }) => {
    const all = { ...S.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" }, ...tasks };
    const posted = [];
    const h = await bootPortal({ mode, stage: "stage_4_onboarding", clock, tasks: all, now, verify: S.verify, onboarding,
      fns: { "portal-thread": () => ({ ok: true, messages: [] }), "portal-review-requests": () => ({ ok: true, requests: [], has_review_link: true }),
        "portal-step3-go-ahead": (b) => { posted.push(b); return { ok: true, rule: { day1: { at: clock, by: "portal" } } }; } } }, overrides, SITE);
    h.posted = posted;
    try { await h.ready(ROW, 40000); } catch { const e = h.errs[0] || "no error"; await h.close(); throw new HarnessUnavailable(`step 3 never drew (${e})`); }
    await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
    await tick(600);
    await h.page.evaluate((R) => { const r = document.querySelector(R); if (r && r.classList.contains("is-collapsed")) r.querySelector("[data-step-toggle]")?.click(); }, ROW);
    let last = "", same = 0; for (let i = 0; i < 40 && same < 4; i++) { await tick(250); const t = await h.page.evaluate((R) => document.querySelector(R)?.outerHTML || "", ROW); same = t === last ? same + 1 : 0; last = t; }
    h.html = last;
    return h;
  };
  const look = (h) => h.page.evaluate((R) => {
    const r = document.querySelector(R); if (!r) return null;
    const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
    const card = r.querySelector("[data-mc-sum] .pm-cs-card"), band = r.querySelector("[data-g7-band]");
    const cs = band ? getComputedStyle(band) : null;
    return { pill: t(r.querySelector(".pm-step-pills .pm-pill")), sub: t(r.querySelector(".pm-step-headings .pm-step-sub")), head: t(card && card.querySelector(".pm-k5-h b")), side: t(card && card.querySelector(".pm-k5-h > span")),
      band: band ? { text: t(band), small: t(band.querySelector("small")), afterHead: !!band.previousElementSibling && band.previousElementSibling.classList.contains("pm-k5-h"),
        css: { fw: cs.fontWeight, fs: cs.fontSize, pad: cs.padding, mar: cs.margin, rad: cs.borderRadius, smallFw: getComputedStyle(band.querySelector("small")).fontWeight, smallFs: getComputedStyle(band.querySelector("small")).fontSize } } : null,
      rows: [...r.querySelectorAll("[data-mc-sum] .mc-r")].map((x) => ({ key: x.getAttribute("data-mc-r"), k: t(x.querySelector(".k")), v: t(x.querySelector(".v > span")), sub: t(x.querySelector(".v small")), chip: t(x.querySelector(".p .mc-pill, .p button")), cls: (x.querySelector(".p .mc-pill") || {}).className || "" })),
      note: t(card && card.querySelector(".pm-cs-note")), btns: [...r.querySelectorAll(".mc-acts button")].filter((b) => !b.hidden).map((b) => t(b)), g7: !!r.querySelector("[data-g7-band],[data-g7-sub]") };
  }, ROW);
  try {
    // ── day 1: today's card, exactly (the same drawing as a client with no rule on the record) ──
    const d1 = await open("managed", { clock: "2026-11-05T20:30:00Z", onboarding: { step3_rule: { day1: { at: DAY1, by: "portal" } } } });
    const d0 = await open("managed", { clock: "2026-11-05T20:30:00Z" });
    try {
      const a = await look(d1);
      if (!a || a.band || a.g7 || a.sub !== "Your details, hours and services, filled in for you" || a.pill !== "Your turn") fail(`portal day 1 isn't today's card: ${JSON.stringify(a && { pill: a.pill, sub: a.sub, band: a.band })}`);
      if (d1.html !== d0.html) fail("portal day 1 draws differently from a client with no rule (the mockup: \"Nothing here changes\")");
      if (d1.posted.length) fail(`a stamped day 1 was stamped again (${JSON.stringify(d1.posted)})`);
      if (!d0.posted.some((b) => b.action === "day1" && b.client_id === CID) || d0.posted.length !== 1) fail(`"Your turn" with no day 1 must ask the server to stamp it, once (${JSON.stringify(d0.posted)})`);
      if (d1.errs.length || d0.errs.length) fail(`portal day 1: page errors ${[...d1.errs, ...d0.errs].slice(0, 2).join(" · ")}`);
    } finally { await d1.close(); await d0.close(); }
    // ── day 6: the line under the title + the band, from the stored preview ──
    const p = G.plan({ g: AGENCY, site: AGENCY_SITE, record: { website: "northwind.test" } });
    const rule6 = { day1: { at: DAY1, by: "portal" }, preview: X.stored(p, "2026-11-10T10:30:00.000Z", { at: "2026-11-10T10:30:40Z", url: "https://www.northwind.test", ok: true }) };
    const d6 = await open("managed", { clock: "2026-11-10T20:00:00Z", onboarding: { step3_rule: rule6 } });
    try {
      const a = await look(d6);
      const small = "That's your website, how you serve customers, your hours and the services already on Google. Your name, phone and areas stay exactly as Google has them until you say. If you press Looks right or fix a row before then, your answer wins.";
      const text = `RGA goes ahead on Thu, Nov 12 with what Google and your website agree on.${small}`;
      if (!a || !a.band || a.band.text.replace(/\s+/g, "") !== text.replace(/\s+/g, "") || a.band.small !== small) fail(`portal day 6: the band isn't the mockup's (${JSON.stringify(a && a.band)})`);
      else {
        if (!a.band.afterHead) fail("portal day 6: the band isn't right under the card's head");
        const c = a.band.css;
        if (c.fw !== "700" || c.fs !== "14px" || c.pad !== "10px 14px" || c.mar !== "12px 16px 0px" || c.rad !== "10px" || c.smallFw !== "500" || c.smallFs !== "13.5px") fail(`portal day 6: the band's look isn't the mockup's ${JSON.stringify(c)}`);
      }
      if (a && a.sub !== "RGA goes ahead on Thu, Nov 12 if you're busy") fail(`portal day 6: the line under the title is «${a && a.sub}»`);
      if (a && (a.pill !== "Your turn" || !a.btns.includes("Looks right"))) fail(`portal day 6: the card must still be the client's (Your turn, Looks right): ${JSON.stringify({ pill: a.pill, btns: a.btns })}`);
      if (d6.errs.length) fail(`portal day 6: page errors ${d6.errs.slice(0, 2).join(" · ")}`);
    } finally { await d6.close(); }
    // ── day 4 and held: no heads-up ──
    for (const [nm, o] of [["day 4", { clock: "2026-11-08T20:00:00Z", onboarding: { step3_rule: rule6 } }], ["held", { clock: "2026-11-10T20:00:00Z", onboarding: { step3_rule: { ...rule6, hold: { at: "2026-11-09T00:00:00Z", by: "rga" } } } }]]) {
      const h = await open("managed", o);
      try { const a = await look(h); if (!a || a.g7) fail(`portal ${nm}: the heads-up shows`); } finally { await h.close(); }
    }
    // ── after the go-ahead: the Done card ──
    const tasks = {}; for (const id of G.COVERED) tasks[id] = { status: "pending" };
    const ap = G.applyPlan(tasks, p, "2026-11-12T10:30:00.000Z", { at: "2026-11-12T10:30:40Z", url: "https://www.northwind.test", ok: true });
    const ruleD = { day1: { at: DAY1, by: "portal" }, went_ahead: { at: "2026-11-12T10:30:00.000Z", by: "nightly check", steps: ap.changed } };
    const dd = await open("managed", { clock: "2026-11-12T20:00:00Z", tasks: ap.tasks, onboarding: { step3_rule: ruleD } });
    try {
      const a = await look(dd);
      if (!a) fail("portal after: step 3 didn't draw");
      else {
        if (a.pill !== "Done" || a.sub !== "RGA went ahead Nov 12 · you can still fix anything") fail(`portal after: the row head ${JSON.stringify({ pill: a.pill, sub: a.sub })}`);
        if (a.head !== "RGA went ahead with what Google and your website agree on" || a.side !== "Nov 12") fail(`portal after: the card head ${JSON.stringify({ head: a.head, side: a.side })}`);
        const want = [
          ["website", "Website", "northwind.test", "The same on Google and on your record, and the site opens.", "RGA went ahead", "ok"],
          ["serve", "How you serve customers", "You go to your customers", "Google shows no address and your website shows no street address.", "RGA went ahead", "ok"],
          ["hours", "Hours", "Mon–Fri 9 AM–6 PM · Sat–Sun closed", "From Google. Your website doesn't list hours, so nothing disagreed.", "RGA went ahead", "ok"],
          ["services", "Services you offer", "Local SEO", "Kept what Google lists. RGA's suggestions weren't added; they wait for you.", "1 on Google", "ok"],
          ["name", "Business name", "Northwind Marketing", "Left exactly as Google has it. RGA never changes your name without your OK.", "Not changed", "rga"],
          ["phone", "Phone", "(424) 555-0140", "Left exactly as Google has it. RGA never changes your phone without your OK.", "Not changed", "rga"],
          ["areas", "Areas you serve", "El SegundoCulver CityLos Angeles", "Your website names Culver City only, so RGA didn't go ahead. Nothing was added or removed.", "3 · Not changed", "rga"],
          ["about", "Only you can say", "Left blank", "Only you can say what's true about you.", "Yours any time", "wait"],
        ];
        const got = a.rows.map((r) => [r.key, r.k, r.v.replace(/\s+/g, ""), r.sub, r.chip, (r.cls.match(/\b(ok|rga|wait|you)\b/) || [])[1] || ""]);
        const norm = want.map((w) => [w[0], w[1], w[2].replace(/\s+/g, ""), w[3], w[4], w[5]]);
        if (JSON.stringify(got) !== JSON.stringify(norm)) fail(`portal after: the rows aren't the mockup's\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(norm)}`);
        if (a.note !== "Something wrong? Press Fix something and tell us; RGA changes it. Name, address, phone and main category change on Google only with your OK on the exact value.") fail(`portal after: the foot is «${a.note}»`);
        if (JSON.stringify(a.btns) !== JSON.stringify(["Fix something"])) fail(`portal after: only "Fix something" stays (${JSON.stringify(a.btns)})`);
      }
      if (dd.errs.length) fail(`portal after: page errors ${dd.errs.slice(0, 2).join(" · ")}`);
    } finally { await dd.close(); }
    // ── self-serve: none of it, and no stamp ──
    const posted = [];
    const h = await bootPortal({ mode: "self_serve", stage: "stage_4_onboarding", clock: "2026-11-10T20:00:00Z", tasks: { ...S.tasks, ...RGA_CARD_TASKS, "m1.kickoff.call": { status: "done", completed_at: KICKOFF, completed_by: "client" } }, now, verify: S.verify, onboarding: { step3_rule: rule6 },
      fns: { "portal-thread": () => ({ ok: true, messages: [] }), "portal-step3-go-ahead": (b) => { posted.push(b); return { ok: false }; } } }, overrides, SITE);
    try {
      await h.ready('[id^="step-row-m1."]', 40000).catch(() => {});
      await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
      await tick(2500);
      const html = await h.page.evaluate(() => document.body.innerHTML);
      if (!/step-row-m1\./.test(html)) fail("the self-serve portal didn't draw (can't prove it draws none of the rule)");
      if (/data-g7-|mc-band|RGA goes ahead on|RGA went ahead/.test(html)) fail("a self-serve client's portal draws the 7-day rule");
      if (posted.length) fail("a self-serve client's portal asked to stamp day 1");
    } finally { await h.close(); }
  } catch (e) { if (e instanceof HarnessUnavailable) return `unavailable: ${e.message}`; throw e; }
  return "ok";
}
