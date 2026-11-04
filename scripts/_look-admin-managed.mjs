#!/usr/bin/env node
// _look-admin-managed.mjs — screenshots of the LIVE admin for one client: the Overview "Client portal" switch and the admin checklist
// rows whose titles are given, each opened. Reads only; it presses nothing that saves.
// Usage: node --env-file=.env scripts/_look-admin-managed.mjs <client id> <out dir> "<row title>" ["<row title>" …]
import fs from "node:fs";
import puppeteer from "puppeteer";
const [clientId, OUT, ...titles] = process.argv.slice(2);
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, SITE = "https://www.rocketgrowthagency.com";
if (!clientId || !OUT || !SUPA || !KEY) { console.log("usage: <client id> <out dir> <row title>…"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const j = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: "hello@rocketgrowthagency.com" }) })).json();
const link = j.action_link || j.properties?.action_link;
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const out = { rows: {}, errors: [] };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1100 });
  page.on("pageerror", (e) => out.errors.push(e.message.split("\n")[0]));
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 }); await new Promise((r) => setTimeout(r, 5000));
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-portal-mode-sec]", { timeout: 60000 }).catch(() => {});
  const sw = await page.$("[data-portal-mode-sec]"); if (sw) await sw.screenshot({ path: `${OUT}/0-switch.png` });
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=client-setup`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll(".ob-step").length > 40, { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  let i = 1;
  for (const t of titles) {
    const id = await page.evaluate((t, i) => {
      const row = [...document.querySelectorAll(".ob-step")].find((r) => (r.querySelector(".ob-title")?.textContent || "").trim().startsWith(t));
      if (!row) return null;
      row.setAttribute("data-look", String(i));
      for (let el = row.parentElement; el; el = el.parentElement) { if (el.tagName === "DETAILS") el.open = true; if (el.hidden) el.hidden = false; if (getComputedStyle(el).display === "none") el.style.display = "block"; }
      const opener = row.querySelector("[aria-expanded='false'], summary, .ob-row-toggle, button");
      if (opener && opener.getAttribute("aria-expanded") === "false") opener.click();
      row.scrollIntoView(); return String(i);
    }, t, i);
    await new Promise((r) => setTimeout(r, 2500));
    if (id) { const el = await page.$(`[data-look="${id}"]`); try { await el.screenshot({ path: `${OUT}/${i}.png` }); out.rows[t] = `${i}.png`; } catch (e) { out.rows[t] = `not visible: ${e.message.slice(0, 60)}`; } } else out.rows[t] = null;
    i++;
  }
} finally { await browser.close(); }
console.log(JSON.stringify(out));
