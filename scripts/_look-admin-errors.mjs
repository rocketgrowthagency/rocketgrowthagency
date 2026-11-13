#!/usr/bin/env node
// _look-admin-errors.mjs — LOCAL LOOK TOOL (11-6 12:45, "admin just white page now"): sign in to the LIVE admin (generate_link, emails nobody),
// open a URL, and print page errors, console errors and how much text drew. Read-only.
import puppeteer from "puppeteer";
const SUPA_URL = process.env.SUPABASE_URL, SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL_ = process.argv[2] || "https://www.rocketgrowthagency.com/admin/?view=client&id=ae817a9c-60a2-4cc9-a196-0582b7b7e7c3&tab=onboarding-v2";
// 11-13: signs in as the checks' robot staff account (two-step-ready) — scripts/lib/admin-sign-in.mjs
import { signInAdmin } from "./lib/admin-sign-in.mjs";
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e.stack || e.message).split("\n").slice(0, 3).join(" | ").slice(0, 400)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 300)); });
  await signInAdmin(page); await new Promise((r) => setTimeout(r, 5000));
  await page.goto(URL_, { waitUntil: "networkidle2", timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 3000)); const n = await page.evaluate(() => document.body.innerText.trim().length).catch(() => -1); console.log(`${(i + 1) * 3}s text ${n}`); if (n > 2000 && i > 5) break; }
  console.log([...new Set(errs)].join("\n") || "(no errors)");
} finally { await browser.close(); }
