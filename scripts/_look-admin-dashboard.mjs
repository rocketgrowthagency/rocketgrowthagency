#!/usr/bin/env node
// _look-admin-dashboard.mjs — LOCAL LOOK TOOL (11-9): signs in to the LIVE admin (generate_link, emails nobody), opens the Dashboard,
// full-page screenshot + the order of the top-level blocks. Read-only. node --env-file=.env scripts/_look-admin-dashboard.mjs <outdir>
import puppeteer from "puppeteer";
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, out = process.argv[2] || "/tmp";
const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "hello@rocketgrowthagency.com" }) });
const j = await r.json(); const link = j.action_link || j.properties?.action_link;
if (!link) { console.log("no sign-in link"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 }); await new Promise((r) => setTimeout(r, 4000));
  await page.goto("https://www.rocketgrowthagency.com/admin/?view=dashboard", { waitUntil: "networkidle2", timeout: 60000 }); await new Promise((r) => setTimeout(r, 9000));
  await page.screenshot({ path: `${out}/admin-dashboard.png`, fullPage: true });
  console.log(await page.evaluate(() => [...document.querySelectorAll(".admin-main > *")].filter((e) => !e.hidden && e.offsetHeight > 0).map((e) => `${e.id || e.className} · ${e.offsetHeight}px · ${(e.innerText || "").replace(/\s+/g, " ").slice(0, 160)}`).join("\n")));
  // To do, then RGA's Website Work tab (where the Blog card lives now)
  await page.goto("https://www.rocketgrowthagency.com/admin/?view=todo", { waitUntil: "networkidle2", timeout: 60000 }); await new Promise((r) => setTimeout(r, 9000));
  await page.screenshot({ path: `${out}/admin-todo.png`, fullPage: true });
  console.log("TODO blog band:", await page.evaluate(() => [...document.querySelectorAll(".mv-bh")].map((e) => e.innerText).join(" | ")));
  await page.goto("https://www.rocketgrowthagency.com/admin/?view=client&id=ae817a9c-60a2-4cc9-a196-0582b7b7e7c3&tab=websitework", { waitUntil: "networkidle2", timeout: 60000 }); await new Promise((r) => setTimeout(r, 12000));
  await page.screenshot({ path: `${out}/admin-websitework.png` });
  console.log("WEBSITE WORK:", await page.evaluate(() => { const b = document.getElementById("blogCard"); return b && !b.hidden && b.offsetHeight ? `blog card shown · ${b.offsetHeight}px · ${b.innerText.replace(/\s+/g, " ").slice(0, 120)}` : "blog card NOT shown"; }));
} finally { await browser.close(); }
