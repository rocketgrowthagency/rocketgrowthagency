#!/usr/bin/env node
/**
 * check-client-portal-renders.mjs — the signed-in client portal actually puts its cards on screen.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * I renamed the owner-questions host to carry the client id and used a variable — `clientId` — that
 * does not exist inside buildClientSection. A ReferenceError inside a template literal kills the
 * WHOLE section, so the facts card and the approvals panel vanished from the live portal.
 *
 * 🔴 Everything that could pass, passed. `node --check` parses the file; the browser-parse gate
 * parses it as a module; every endpoint still returned 200. Nothing calls buildClientSection except
 * a real page load, and a section that throws leaves no error on screen — just absence.
 * → project_admin_was_blank_for_a_day · feedback_a_clean_payload_is_not_a_clean_page
 *
 * ─── WHAT IT ASSERTS ─────────────────────────────────────────────────────────────────────────────
 *   1. A magic-link session reaches the portal, not a login form.
 *   2. Every nav view renders something.
 *   3. The named hosts EXIST and are filled: the owner-questions card and the approvals panel.
 *   4. No element id is duplicated — buildClientSection runs once per client, so a fixed id
 *      silently makes one client's card render into another's.
 *   5. No page errors, and no failing /.netlify/functions call.
 *
 * Exit 0 = the portal renders · 1 = something is missing · 2 = could not tell (offline, no creds).
 */
import fs from "node:fs";
import path from "node:path";

const SCRAPER = process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
for (const line of fs.readFileSync(path.join(SCRAPER, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.PORTAL_TEST_EMAIL || "rocketgrowthagencyadmin@gmail.com";
const BASE = "https://www.rocketgrowthagency.com/portal/";
if (!U || !K) { console.error("[portal] INDETERMINATE — no Supabase credentials"); process.exit(2); }

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("[portal] INDETERMINATE — playwright not installed"); process.exit(2); }

let link;
try {
  const g = await fetch(`${U}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: EMAIL, options: { redirect_to: BASE } }),
  });
  link = (await g.json()).action_link;
} catch (e) { console.error(`[portal] INDETERMINATE — could not mint a link: ${e.message}`); process.exit(2); }
if (!link) { console.error("[portal] INDETERMINATE — no action_link returned"); process.exit(2); }

const fail = [];
console.log("── the signed-in client portal renders ──");

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
const errs = [], bad = [];
p.on("pageerror", (e) => errs.push(String(e.message || JSON.stringify(e)).slice(0, 140)));
p.on("response", (r) => {
  if (r.url().includes("/.netlify/functions/") && r.status() >= 400) {
    bad.push(`${r.status()} ${r.url().split("/").pop().split("?")[0]}`);
  }
});
try {
  await p.goto(link, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(4500);

  if (/sign in|log in|magic link/i.test(await p.evaluate(() => document.body.innerText.slice(0, 400)))) {
    fail.push("a working magic link still landed on a sign-in form");
  }

  const VIEWS = ["dashboard", "approvals", "rankings", "reviews", "reports", "setup"];
  for (const v of VIEWS) {
    await p.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), v);
    await p.waitForTimeout(1600);
    const chars = await p.evaluate(() => [...document.querySelectorAll(".portal-view,.portal-sections,#portalSections,main")]
      .filter((e) => e.offsetParent !== null).map((e) => e.innerText).join("").trim().length);
    if (chars < 60) fail.push(`the "${v}" view rendered ${chars} characters — effectively empty`);
  }

  const dom = await p.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id).filter(Boolean);
    return {
      facts: document.querySelectorAll(".pv-facts").length,
      factsChars: (document.querySelector(".pv-facts")?.innerText || "").trim().length,
      approvals: document.querySelectorAll(".pv-approvals-host").length,
      approvalsChars: (document.querySelector(".pv-approvals-host")?.innerText || "").trim().length,
      dupIds: [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))],
    };
  });

  if (!dom.facts) fail.push("the owner-questions host (.pv-facts) is not on the page — buildClientSection probably threw");
  else if (dom.factsChars < 40) fail.push(`the owner-questions card rendered ${dom.factsChars} characters — the host exists but nothing filled it`);
  if (!dom.approvals) fail.push("the approvals host (.pv-approvals-host) is not on the page");
  else if (dom.approvalsChars < 40) fail.push(`the approvals panel rendered ${dom.approvalsChars} characters`);
  if (dom.dupIds.length) {
    fail.push(`duplicate element id(s): ${dom.dupIds.slice(0, 5).join(", ")} — one client's card would render into another's`);
  }

  console.log(`  views: ${VIEWS.length} · facts host: ${dom.facts} (${dom.factsChars} chars) · approvals host: ${dom.approvals} (${dom.approvalsChars} chars)`);
} catch (e) {
  console.error(`[portal] INDETERMINATE — the run itself failed: ${e.message}`);
  await b.close();
  process.exit(2);
}
await b.close();

if (errs.length) fail.push(`page error(s): ${[...new Set(errs)].slice(0, 3).join(" | ")}`);
if (bad.length) fail.push(`failing function call(s): ${[...new Set(bad)].join(", ")}`);

if (fail.length) {
  console.error(`\n✗ the client portal did not render properly — ${fail.length} problem(s):`);
  for (const f of fail) console.error(`    ${f}`);
  console.error("\n  A section that throws leaves no error on screen — only absence. Parsing proves nothing.");
  process.exit(1);
}
console.log("  ✅ every view renders, both hosts are filled, no duplicate ids, no errors");
process.exit(0);
