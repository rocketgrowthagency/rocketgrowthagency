#!/usr/bin/env node
// _look-admin-managed.mjs — screenshots of the LIVE admin for one client: the Overview "Client portal" switch and the admin checklist
// rows whose titles are given, each opened. Reads only; it presses nothing that saves.
// Usage: node --env-file=.env scripts/_look-admin-managed.mjs <client id> <out dir> "<row title>" ["<row title>" …]
import fs from "node:fs";
import puppeteer from "puppeteer";
const { nav, openAdminClient } = await import("./_admin-session.mjs");   // the sign-in the admin gates share
const [clientId, OUT, ...titles] = process.argv.slice(2);
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, SITE = "https://www.rocketgrowthagency.com";
if (!clientId || !OUT || !SUPA || !KEY) { console.log("usage: <client id> <out dir> <row title>…"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const out = { rows: {}, errors: [] };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1100 });
  page.on("pageerror", (e) => out.errors.push(e.message.split("\n")[0]));
  await openAdminClient(page, clientId, "overview");
  await page.waitForSelector("[data-portal-mode-sec]", { timeout: 60000 }).catch(() => {});
  const sw = await page.$("[data-portal-mode-sec]"); if (sw) await sw.screenshot({ path: `${OUT}/0-switch.png` });
  await openAdminClient(page, clientId, "onboarding-v2");
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
