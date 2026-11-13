#!/usr/bin/env node
// _set-portal-mode-via-admin.mjs — set one client's portal mode by pressing the REAL admin switch on the live site (Overview →
// "Client portal"), as RGA would, then read the column back. A one-client write through the product's own path, never a database
// write. Usage: node --env-file=.env scripts/_set-portal-mode-via-admin.mjs <client id> <Managed|Self-serve|Not chosen> [shot.png]
import puppeteer from "puppeteer";
import { signInAdmin } from "./lib/admin-sign-in.mjs";
const [clientId, label, shot] = process.argv.slice(2);
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, SITE = "https://www.rocketgrowthagency.com";
if (!clientId || !label || !SUPA || !KEY) { console.log("usage: <client id> <Managed|Self-serve|Not chosen> [shot.png]"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1300, height: 1000 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
  // 11-13: signs in as the checks' robot staff account (two-step-ready) — scripts/lib/admin-sign-in.mjs
  await signInAdmin(page);
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=overview`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-portal-mode-sec] [data-portal-mode]", { timeout: 45000 });
  const before = await page.$eval("[data-portal-mode-sec] [aria-pressed='true']", (b) => b.textContent.trim());
  const pressed = await page.evaluate((l) => { const b = [...document.querySelectorAll("[data-portal-mode-sec] [data-portal-mode]")].find((x) => x.textContent.trim() === l); if (!b) return false; b.click(); return true; }, label);
  if (!pressed) throw new Error(`no "${label}" button`);
  if (before !== label) {
    await page.waitForFunction((l) => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === `Set to ${l}` && b.offsetParent), { timeout: 15000 }, label);
    await page.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === `Set to ${l}` && b.offsetParent).click(), label);
    await page.waitForFunction((l) => document.querySelector("[data-portal-mode-sec] [aria-pressed='true']")?.textContent.trim() === l, { timeout: 30000 }, label);
  }
  const after = await page.$eval("[data-portal-mode-sec] [aria-pressed='true']", (b) => b.textContent.trim());
  if (shot) await (await page.$("[data-portal-mode-sec]")).screenshot({ path: shot });
  const row = (await (await fetch(`${SUPA}/rest/v1/clients?id=eq.${clientId}&select=portal_mode`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json())[0];
  console.log(JSON.stringify({ before, after, database: row && row.portal_mode, pageErrors: errs.slice(0, 3) }));
} finally { await browser.close(); }
