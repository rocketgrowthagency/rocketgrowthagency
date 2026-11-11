#!/usr/bin/env node
// _look-admin-jump.mjs — LOCAL LOOK TOOL (11-6, the owner: "go to onboarding shows for a split second then switches to this").
// Signs in to the LIVE admin (generate_link, emails nobody), opens RGA's Overview, presses a Needs your attention button that names a step,
// and samples the URL, the active tab and the open step every 250 ms for 5 s. Navigation only: nothing is written.
import puppeteer from "puppeteer";
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = "https://www.rocketgrowthagency.com", RGA = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const SEL = process.env.SEL || "#panel-overview [data-goto-step]";
const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "hello@rocketgrowthagency.com" }) });
const j = await r.json(); const link = j.action_link || j.properties?.action_link;
if (!link) { console.log("no sign-in link"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 140)));
  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 }); await new Promise((r) => setTimeout(r, 5000));
  await page.goto(`${SITE}/admin/?view=client&id=${RGA}&tab=overview`, { waitUntil: "networkidle2", timeout: 60000 }); for (let i = 0; i < 300 && !(await page.$(SEL)); i++) await new Promise((r) => setTimeout(r, 100));
  if (!process.env.EARLY) await new Promise((r) => setTimeout(r, 12000));
  const btns = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((b) => `${b.textContent.trim()} → ${b.getAttribute("data-goto-step")}`), SEL);
  console.log("buttons:", JSON.stringify(btns));
  const ok = await page.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true; }, SEL);
  if (!ok) { console.log("no such button"); process.exit(2); }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const s = await page.evaluate(() => ({ url: location.search.replace(/.*tab=/, "tab="), panel: (document.querySelector(".admin-tab-panel.is-active") || {}).id, open: [...document.querySelectorAll(".ob-step:not(.ob-folded)")].filter((e) => e.querySelector(".ob-body")).map((e) => e.getAttribute("data-ob-step")).join(","), y: Math.round(scrollY), target: (() => { const t = document.querySelector('.ob-step[data-ob-step="m1.web.location_pages"]'); if (!t) return "no row"; const b = t.getBoundingClientRect(); return b.height ? `top ${Math.round(b.top)}px` : "hidden"; })() }));
    console.log(`${(i + 1) * 250}ms`, JSON.stringify(s));
  }
  if (errs.length) console.log("errors:", [...new Set(errs)].join(" | "));
} finally { await browser.close(); }
