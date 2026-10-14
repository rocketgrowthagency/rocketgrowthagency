#!/usr/bin/env node
// check-back-restores-the-pressed-button.mjs — a button that sends you to Google or Stripe comes back from Back the way it
// was before you pressed it, in the client portal AND admin.
//
// 🔴 2026-10-14, Chris: "i clicked continue with google and then back and now the continue with google button is stuck in
// loading". Chrome kept the portal in its back/forward cache, so Back showed the page exactly as it was left: the button
// spinning and disabled, with nothing left to stop it. Every button that leaves the page has the same shape (Google
// sign-in, connect Google, pay an invoice, admin's Google connects), so the fix is one listener per page, not per button.
//
// 🔑 Run against reality: a real Chrome, a real page served over http, a real navigation away and a real Back. The gate
// proves the back/forward cache was actually used (pageshow.persisted), or it can't tell (exit 2), because a page that
// reloads on Back would pass while proving nothing. → feedback_run_it_against_reality_before_calling_it_done
// Reads files only; never touches production.
import fs from "node:fs";
import http from "node:http";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [];
const fail = (m) => F.push(m);

// the block, lifted from each file exactly as it ships
const lift = (file) => {
  const src = read(file);
  const m = /\/\/ 🔑 BACK SHOWS THE PAGE AS IT WAS LEFT\.[\s\S]*?window\.addEventListener\("pageshow"[\s\S]*?\n\}\);\n/.exec(src);
  if (!m) { fail(`${file} no longer puts the pressed button back after Back (the "BACK SHOWS THE PAGE AS IT WAS LEFT" block is gone)`); return ""; }
  return m[0];
};
const FILES = ["portal/portal.js", "admin/admin.js"];
// the cache-busters must move with the code, or browsers keep the old file
if (!/portal\.js\?v=/.test(read("portal/index.html")) || !/admin\.js\?v=/.test(read("admin/index.html"))) fail("the portal or admin page no longer loads its script with a ?v= cache-buster");

let puppeteer = null;
try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }

// the page: the shipped block + buttons shaped like the real ones (the Google sign-in: disabled + is-busy; pay: the label
// changes; connect Google: an <a> with inline style + aria-busy), each leaving for another page the way the real ones do
const page = (block) => `<!doctype html><html><body>
<button id="g" class="portal-button dl-go dl-google">Continue with Google</button>
<button id="pay" class="portal-button">Pay invoice</button>
<a id="conn" href="#" class="portal-button" style="opacity: 1">Connect Google</a>
<button id="stay" class="portal-button">Stays here</button>
<script>
window.__shows = [];
window.addEventListener("pageshow", (e) => { window.__shows.push(e.persisted); });
${block}
const away = () => setTimeout(() => { location.href = "/away"; }, 20);
document.getElementById("g").addEventListener("click", (e) => { const b = e.currentTarget; b.disabled = true; b.classList.add("is-busy"); away(); });
document.getElementById("pay").addEventListener("click", (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = "Loading payment…"; away(); });
document.getElementById("conn").addEventListener("click", (e) => { e.preventDefault(); const a = e.currentTarget; a.innerHTML = "Opening Google…"; a.style.pointerEvents = "none"; a.style.opacity = ".6"; a.setAttribute("aria-busy", "true"); away(); });
document.getElementById("stay").addEventListener("click", (e) => { e.currentTarget.textContent = "Done"; });
</script></body></html>`;

const state = (sel) => (document.querySelector(sel) ? (({ el }) => ({ text: el.textContent.trim(), cls: el.className, disabled: !!el.disabled, style: el.getAttribute("style"), busy: el.getAttribute("aria-busy") }))({ el: document.querySelector(sel) }) : null);

// 🔑 A restore from the back/forward cache fires no "load", so waiting for one hangs. Go back and wait for the
// restored page's pageshow to be counted instead.
const back = async (tab) => {
  await tab.evaluate(() => { history.back(); });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const n = await tab.evaluate(() => (window.__shows ? window.__shows.length : 0)).catch(() => 0);
    if (n >= 2) return;
  }
};
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let cantTell = 0;
try {
  for (const file of FILES) {
    const block = lift(file);
    if (!block) continue;
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(req.url.startsWith("/away") ? "<!doctype html><p>Google</p>" : page(block));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      // 🔑 a fresh tab per case: puppeteer's next goto after a cache restore can wait forever for a "load" it missed
      for (const [sel, want] of [["#g", "Continue with Google"], ["#pay", "Pay invoice"], ["#conn", "Connect Google"]]) {
        const tab = await browser.newPage();
        await tab.goto(`${base}/portal/?n=${Math.random()}`, { waitUntil: "load" });
        const before = await tab.evaluate(state, sel);
        await Promise.all([tab.waitForNavigation({ waitUntil: "load" }), tab.click(sel)]);
        await back(tab);
        const shows = await tab.evaluate(() => window.__shows);
        const after = await tab.evaluate(state, sel);
        await tab.close();
        if (!shows.includes(true)) { cantTell++; continue; } // Chrome reloaded instead of restoring: proves nothing
        if (JSON.stringify(after) !== JSON.stringify(before)) fail(`${file}: after Back, "${want}" isn't the way it was before the press (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
      }
      // a press that finished on this page (it isn't busy) is not undone by a later restore
      const tab = await browser.newPage();
      await tab.goto(`${base}/portal/?n=${Math.random()}`, { waitUntil: "load" });
      await tab.click("#stay");
      await Promise.all([tab.waitForNavigation({ waitUntil: "load" }), tab.evaluate(() => { location.href = "/away"; })]);
      await back(tab);
      const stay = await tab.evaluate(state, "#stay");
      if ((await tab.evaluate(() => window.__shows)).includes(true) && stay.text !== "Done") fail(`${file}: Back undid a press that never left the page ("Stays here" went back from "Done")`);
      await tab.close();
    } finally { server.close(); }
  }
} finally { await browser.close(); }

if (F.length) { console.error("🔴 Back can leave a button stuck:"); for (const f of F) console.error("   · " + f); process.exit(1); }
if (cantTell) { console.error(`⚠️  INDETERMINATE — Chrome didn't use its back/forward cache (${cantTell} case(s)), so Back proved nothing`); process.exit(2); }
console.log("✅ Back puts the pressed button back as it was, in the portal and admin: Continue with Google (disabled + spinner), Pay invoice (label), Connect Google (style + aria-busy), each through a real navigation and a real back/forward-cache restore; a press that never left the page stays");
