#!/usr/bin/env node
// check-setup-steps-read-in-order.mjs — the client's Setup list reads 1 to 13, in order, and a Done step keeps its number.
//
// 🔒 WHY (approved setup_numbers_in_order_v1, option A, 2026-10-15). Chris: "is this numbering correct?" The numbers
// were right, but the page grouped steps by whose job they are and drew a Done step as ✓: steps 4–6 sat below 12 with
// no number, and the close-out call (a call the client attends) sat under "We check these ourselves". The list read
// 10, 11, 12, ✓, ✓, ✓, 13. Now: one list in number order, no groups, a Done step shows its number with a small tick.
//
// Reads files only, then draws the marker with the shipped portal.css in Chrome (the tick is a ::after).
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const js = read("portal/portal.js"), css = read("portal/portal.css");
const code = js.replace(/^[ \t]*\/\/.*$/gm, "");

// ── 1 · one list, in the projection's order (which is client number order) ──
if (/function groupedRows\s*\(/.test(code) || /class="pm-group-h"/.test(code)) fail("the Setup list is grouped again (steps jump out of number order)");
// (anchored on "${numbered.length" — the Month-1 list; Month 2's own branch is "(numbered.length ? …")
if (!/\$\{numbered\.length\s*\?\s*numbered\.map\(rowHtml\)\.join\(""\)\s*:\s*`<div class="pm-empty"/.test(code)) fail("the Month-1 list doesn't render every step from one list, in order");
const proj = JSON.parse(read("data/playbooks/client-steps.json"));
const nums = (proj.month1 || []).map((s) => s.clientStepNo).filter((n) => n != null);
for (let i = 1; i < nums.length; i++) if (nums[i] <= nums[i - 1]) { fail(`the client's steps aren't in number order in the projection (${nums.join(", ")})`); break; }
if (nums.length && (nums[0] !== 1 || nums[nums.length - 1] !== nums.length)) fail(`the client's numbers have a gap (${nums.join(", ")})`);

// ── 2 · a Done step keeps its number ──
if (!/<span class="pm-step-num\$\{isDone \? " is-done" : ""\}">\$\{num == null \? \(isDone \? "✓" : "·"\) : num\}<\/span>/.test(code)) fail("a Done step shows ✓ instead of its number again");
if (/\.pm-group-h\b/.test(css)) fail("the group heading style is still shipped with nothing drawing it");

// ── 3 · the tick, drawn ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent(`<html><body><span class="pm-step-num is-done" id="d">4</span><span class="pm-step-num" id="o">7</span></body></html>`);
  await page.addStyleTag({ content: css });
  const r = await page.evaluate(() => {
    const d = document.getElementById("d"), o = document.getElementById("o");
    const a = getComputedStyle(d, "::after"), b = getComputedStyle(o, "::after");
    return { text: d.textContent, tick: a.content, tickBg: a.backgroundColor, openTick: b.content, bg: getComputedStyle(d).backgroundColor, obg: getComputedStyle(o).backgroundColor };
  });
  if (r.text !== "4" || r.tick !== '"✓"' || r.tickBg === "rgba(0, 0, 0, 0)") fail(`a Done step's marker isn't its number with a green tick (${JSON.stringify(r)})`);
  if (r.openTick !== "none" && r.openTick !== "normal") fail("an open step's marker carries a tick");
  if (r.bg === r.obg) fail("a Done step's number looks the same as an open one");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 the Setup list doesn't read 1 to 13 in order:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ Setup reads 1 to ${nums.length} in order (one list, no groups) and a Done step keeps its number with a green tick (setup_numbers_in_order_v1)`);
