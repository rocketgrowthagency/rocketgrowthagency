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
  // LOOK_FEWER=1 (client_setup_fewer_v1 + client_steps_skip_rules_v1): this browser reads the client's REAL record with steps 38 and 60 finished with
  // fewer (their real counts) and a close-out skip ask on step 63. Only the answer this page reads changes; nothing is written (no write is sent).
  if (process.env.LOOK_FEWER === "1") {
    await page.setRequestInterception(true);
    page.on("request", async (r) => {
      const u = r.url();
      if (r.method() !== "GET" || !/\/rest\/v1\/client_onboarding_records/.test(u)) return r.continue();
      try {
        const res = await fetch(u, { headers: r.headers() }); const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { return r.respond({ status: res.status, body: txt, contentType: "application/json" }); }
        const at = "2026-11-05T19:00:00Z";
        const one = (row) => { if (!row || !row.data || !row.data.tasks) return row; const t = { ...row.data.tasks };
          for (const [id, goal] of [["m1.gbp.photos", 20], ["m1.review.first_5", 5]]) { const x = t[id] || {}; const n = Number.isFinite(x.detected && x.detected.n) ? x.detected.n : 0; t[id] = { ...x, status: "done", completed_at: at, completed_by: "client", fewer: { n, goal, by: "client", who: null, at } }; }
          t["m1.call.close"] = { ...(t["m1.call.close"] || {}), skip_request: { note: "I'm on jobs all week", at, by: null } };
          return { ...row, data: { ...row.data, tasks: t } }; };
        out.fewer = true;
        return r.respond({ status: res.status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": res.headers.get("content-range") || "" }, body: JSON.stringify(Array.isArray(j) ? j.map(one) : one(j)) });
      } catch (e) { out.errors.push(`look interception: ${e.message}`); return r.continue(); }
    });
  }
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
