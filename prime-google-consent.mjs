#!/usr/bin/env node
// One-time Google Maps consent warm-up for step-3.
//
// Run once:
//   node prime-google-consent.mjs
//
// A Chrome window opens on Google Maps. Click "Accept all" (or whatever the
// consent banner shows). Then close the window. The saved cookies go into
// output/google-storage-state.json, which step-3 will load for every recording
// so the Maps UI renders immediately without a consent blocker.
//
// Re-run if Google resets cookies or after a long break (~3-6 months).

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
const STATE_PATH = path.join(OUTPUT_DIR, "google-storage-state.json");

mkdirSync(OUTPUT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  console.log("👉 Opening Google Maps...");
  await page.goto("https://www.google.com/maps", { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log("");
  console.log("====================================================================");
  console.log("  In the Chrome window that just opened:");
  console.log("  1. If you see a cookie/consent banner, click 'Accept all'");
  console.log("  2. If you see a sign-in prompt, click 'Stay signed out' or dismiss");
  console.log("  3. Wait until you can see the Google Maps interface normally");
  console.log("  4. Come back here and press ENTER to save cookies and close");
  console.log("====================================================================");
  console.log("");

  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", resolve);
  });

  await context.storageState({ path: STATE_PATH });
  console.log(`✅ Saved Google storage state → ${STATE_PATH}`);
  await browser.close();
  process.exit(0);
})();
