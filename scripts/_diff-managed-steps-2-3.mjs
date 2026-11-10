#!/usr/bin/env node
// _diff-managed-steps-2-3.mjs — the approved client_step02_managed_access_v1 + client_step03_business_details_v1 mockups against the REAL portal
// (portal-boot-harness: the local portal.js + portal.css in Chrome, invented data, nothing leaves the laptop), property by property, with the
// comparison set read off each side's declared CSS (_mockup-diff.mjs). Prints every difference; exit 0 always (a look, not a gate).
// Usage: APPROVAL_ARCHIVE_SITE_DIR=<website checkout> node scripts/_diff-managed-steps-2-3.mjs [out dir for screenshots]
import fs from "node:fs";
import path from "node:path";
import { bootPortal, SITE } from "./lib/portal-boot-harness.mjs";
import { SCENARIOS, RGA_CARD_TASKS } from "./lib/managed-portal-scenarios.mjs";
import { comparePairs } from "./_mockup-diff.mjs";

const OUT = process.argv[2] || "";
const BLOG = { ok: true, setup: true, off: false, card: { state: "pages_first", title: "Your website posts", side: "pages come first", note: "Posts are never sold as a way to rank on Maps and never promise calls.", action: "off", actionLabel: "Say no to posts",
  rows: [...["Local SEO Audit", "Citation Building & Cleanup", "Review Strategy & Management", "GBP Posts", "Local Keyword Research"].map((s) => ({ label: `Page for ${s}`, value: "Not yet", sub: "A service page comes before any post" })), { label: "Posts", value: "Waiting", sub: "They start once the pages above are done" }] } };
const S = SCENARIOS.allDone;
const now = { ...S.now, "m1.gbp.services_products": { ...S.now["m1.gbp.services_products"], approved: { at: "2026-09-15T17:15:46Z", rows: [{ name: "Drain cleaning", on: true }, { name: "Leak repair", on: false }] } } };
const ACCESS = { status: "done", completed_at: "2026-10-27T18:00:00Z", completed_by: "client", client_input: { via: "invite", platform: "wix", at: "2026-10-26T18:00:00Z" }, access: { confirmed_at: "2026-10-27T18:00:00Z" } };
const h = await bootPortal({ mode: "managed", tasks: { ...S.tasks, ...RGA_CARD_TASKS, "m1.access.website": ACCESS }, now, verify: S.verify, fns: { "portal-blog-posts": () => BLOG } }, {}, SITE);
const puppeteer = (await import("puppeteer")).default;
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  await h.page.goto(`${h.base}/portal/`, { waitUntil: "domcontentloaded" });
  await h.ready("[id^='action-items-list-'][id$='-m1'] .pm-step-row", 20000);
  await h.page.evaluate(() => document.querySelector(".portal-nav a[data-view=setup]")?.click());
  await new Promise((r) => setTimeout(r, 1500));
  await h.page.evaluate(() => { const r = document.getElementById("step-row-managed.check_found"); if (r && r.classList.contains("is-collapsed")) r.querySelector(".pm-step-row-head").click(); });
  await new Promise((r) => setTimeout(r, 800));
  await h.page.evaluate(() => document.querySelector('[data-mc-rc="managed.website_posts"]')?.click());
  await new Promise((r) => setTimeout(r, 500));
  const mk = async (file) => { const p = await browser.newPage(); await p.setViewport({ width: 1100, height: 1400 }); await p.goto(`file://${path.join(SITE, "reports/mockups", file)}`, { waitUntil: "load" }).catch(() => {}); return p; };
  const m2 = await mk("client_step02_managed_access_v1.html"), m3 = await mk("client_step03_business_details_v1.html");
  const P3 = [
    ["areas: a tag", ".fr.new:nth-of-type(6) .tags .t", '[data-mc-r="areas"] .mc-tag'],
    ["areas: the tags", ".fr.new:nth-of-type(6) .tags", '[data-mc-r="areas"] .mc-tags'],
    ["services: a dashed tag", ".t.d", '[data-mc-r="services"] .mc-tag.is-off'],
    ["services: a green tag", ".fr.new:nth-of-type(8) .t:not(.d)", '[data-mc-r="services"] .mc-tag:not(.is-off)'],
    ["serve: the no-address line", ".fr.new:nth-of-type(5) .sub", '[data-mc-r="serve"] .v small'],
    ["services: the green/dashed line", ".fr.new:nth-of-type(8) .sub", '[data-mc-r="services"] .v small'],
    ["details: the date line", ".fr:nth-of-type(9) .sub", '[data-mc-r="details"] .v small'],
    ["services: N of M chip", ".chip.rga", '[data-mc-r="services"] .mc-pill.rga'],
    ["a result chip", ".fr:nth-of-type(2) .chip", '[data-mc-r="name"] .mc-pill.ok'],
    ["a row", ".fr:nth-of-type(2)", '[data-mc-r="name"]'],
    ["a row label", ".fr:nth-of-type(2) .k", '[data-mc-r="name"] .k'],
  ];
  const P2 = [
    ["posts: the line", ".rr.new", '[data-mc-card="managed.website_posts"]'],
    ["posts: the open mark", ".rr.new .open", '[data-mc-card="managed.website_posts"] .mc-mk'],
    ["posts: See the plan", ".rr.new .lnk", '[data-mc-card="managed.website_posts"] .mc-lk'],
    ["posts: the panel", ".panel", ".mc-blogp"],
    ["posts: a page row", ".panel .pi", ".mc-blogp > .mc-pi"],
    ["posts: the amber mark", ".pi .w", ".mc-blogp > .mc-pi .mk.you"],
    ["posts: the reason line", ".pi small", ".mc-blogp > .mc-pi small"],
    ["posts: + N more pages", ".more", ".mc-blogp .mc-more"],
    ["posts: the note", ".panel .note", ".mc-blogp .mc-bnote"],
    ["posts: Say no to posts", ".panel .btn", ".mc-blogp > .pm-amend"],
    ["rga group: a row", ".rr:nth-of-type(2)", ".mc-rrow"],
    ["rga group: the head", ".rgac .hd", ".mc-rh"],
  ];
  for (const [name, m, pairs] of [["STEP 3", m3, P3], ["STEP 2 / WHAT RGA IS DOING", m2, P2]]) {
    const r = await comparePairs(m, h.page, pairs);
    console.log(`\n── ${name}: ${r.compared} properties compared, ${r.inherited} inherited, ${r.diffs.length} differences`);
    for (const d of r.diffs) console.log("  · " + d);
    if (r.missingInMock.length) console.log("  ⚠️ not in the mockup: " + r.missingInMock.join(", "));
  }
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    { const s3 = await h.page.$('[id="step-row-managed.check_found"]'); if (s3) await s3.screenshot({ path: path.join(OUT, "harness-step3.png") }); }
    await h.page.evaluate(() => document.querySelector(".mc-rga")?.scrollIntoView());
    const el = await h.page.$(".mc-rga"); if (el) await el.screenshot({ path: path.join(OUT, "harness-rga.png") });
  }
  // step 2: "Ask for a change" on its own row — the space above it (from the card) and below it (to what follows), against the mockup's 12px row gap
  await h.page.evaluate(() => { const r = document.getElementById("step-row-m1.access.website"); if (r && r.classList.contains("is-collapsed")) r.querySelector(".pm-step-row-head").click(); });
  await new Promise((r) => setTimeout(r, 900));
  const sp = await h.page.evaluate(() => {
    const row = document.getElementById("step-row-m1.access.website"), b = row && row.querySelector("[data-cs-ask]");
    if (!b) return { button: null, text: row ? row.innerText.replace(/\s+/g, " ").slice(0, 300) : null };
    const card = row.querySelector(".pm-cs-card"), br = b.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const after = [...row.querySelectorAll("*")].filter((e) => e.offsetParent && e.getBoundingClientRect().top >= br.bottom - 0.5 && !b.contains(e) && e.getBoundingClientRect().height > 0).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0];
    return { button: b.textContent, above: Math.round(br.top - cr.bottom), below: after ? Math.round(after.getBoundingClientRect().top - br.bottom) : null, next: after ? (after.className || after.tagName) : null, w: Math.round(br.width), h: Math.round(br.height), posts: !!row.querySelector("[data-blog-plan]") };
  });
  console.log("step 2:", JSON.stringify(sp));
  if (OUT) { const s2 = await h.page.$('[id="step-row-m1.access.website"]'); if (s2) await s2.screenshot({ path: path.join(OUT, "harness-step2.png") }); }
  console.log("page errors:", h.errs.slice(0, 3));
} finally { await browser.close(); await h.close(); }
