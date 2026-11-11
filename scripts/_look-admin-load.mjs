#!/usr/bin/env node
// _look-admin-load.mjs — LOCAL LOOK TOOL (11-6, the owner's mid-load screenshot). Signs in to the LIVE admin (generate_link, emails nobody),
// opens RGA's Overview and samples the status badges and the Needs your attention titles every 300 ms while it loads. Read-only.
import puppeteer from "puppeteer";
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = "https://www.rocketgrowthagency.com", RGA = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "hello@rocketgrowthagency.com" }) });
const j = await r.json(); const link = j.action_link || j.properties?.action_link;
if (!link) { console.log("no sign-in link"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let bad = 0;
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 }); await new Promise((r) => setTimeout(r, 5000));
  page.goto(`${SITE}/admin/?view=client&id=${RGA}&tab=overview`, { timeout: 60000 }).catch(() => {});
  let last = "";
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await page.evaluate(() => {
      const t = document.body.innerText;
      const pick = ["Client Setup: Checklist (1/4)", "Client Setup: Complete (4/4)", "Contract signed", "No contract", "Google connected", "Google not connected", "Create and send the service agreement", "Loading the onboarding checklist", "Go to step 37", "onboarding step is blocked", "All clear", "Checking…"];
      const no = [...document.querySelectorAll('#clientNextActionList .mv3-no')].map((x) => x.textContent.trim()); return JSON.stringify([...pick.filter((w) => t.includes(w)), ...(no.length ? ['photo step no: ' + no.join(',')] : [])]);
    }).catch(() => "(navigating)");
    if (s !== last) { console.log(`${(i + 1) * 300}ms ${s}`); last = s; }
    if (/service agreement|Checklist \(1\/4\)|Google not connected|No contract|All clear|photo step no: 4\b/.test(s)) bad++;
  }
} finally { await browser.close(); }
console.log(bad ? `🔴 a false fact showed in ${bad} samples` : "✅ no false fact while it loaded");
process.exit(bad ? 1 : 0);
