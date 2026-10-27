#!/usr/bin/env node
// check-every-control-spins.mjs — any control that waits on the server shows it, in the client portal and in admin.
//
// 🔒 WHY (Chris, 2026-10-15, pressing "Prefer to keep it?"): "has delay needs a spinner. any button needs spinner make this
// master css note". 62 click handlers (20 portal, 42 admin) waited on the server with nothing on screen. One fix for all:
// shared/busy.js (imported FIRST by portal.js and admin.js) marks the pressed control `.is-busy` while the requests it
// started are out; one master rule per stylesheet draws a ring BESIDE the words (10-27; it was a ring in place of the label). Clicked for real in Chrome
// with the shipped stylesheets and a slow fake request. → feedback_every_control_spins
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);

const busySrc = read("shared/busy.js"), pcss = read("portal/portal.css"), acss = read("admin/admin.css");
const portal = read("portal/portal.js"), admin = read("admin/admin.js");

// ── 1 · loaded first, by both ──
for (const [name, src] of [["portal", portal], ["admin", admin]]) {
  const first = src.split("\n").find((l) => /^import /.test(l)) || "";
  if (!/^import "\/shared\/busy\.js\?v=[0-9a-z]+";$/.test(first)) fail(`${name}.js doesn't import shared/busy.js FIRST (the Supabase client captures fetch when it's created, so a later wrap misses it)`);
}

// ── 2 · one rule each, no second ring ──
if (!/:is\(button, \[role="button"\], label, a, \.pm-linkbtn\):not\(\.portal-button, \.dl-back, \.si-btn, \.si-link\)\.is-busy \{ position:relative; cursor:progress; pointer-events:none; transition:none; opacity:1 !important; \}/.test(pcss)) fail("portal.css has no master busy rule (same size, can't be pressed twice, never faded)");
if (!/:is\(button, \[role="button"\], label, a\):not\(\.admin-button, \.rga-call-refresh\)\.is-busy \{ position:relative; cursor:progress; pointer-events:none; transition:none; opacity:1 !important; \}/.test(acss)) fail("admin.css has no master busy rule");
// 🔒 10-27 (Chris: "should spinner circle always be on one side of button. Lets say right side"): no ring is drawn BEFORE the words
{ const left = [...(pcss + acss).matchAll(/([^{}\n]*\.is-busy::before)\s*\{[^}]*content/g)].map((m) => m[1].trim()); if (left.length) fail(`a ring drawn on the LEFT of the words: ${left.join(" · ")}`); }
if (/\.pm-act\.is-busy::before|\.pm-team-chip\.is-busy::before|\.pm-photo-rm\.is-busy::before/.test(pcss)) fail("an old per-button spinner is still there (it would draw a second ring beside the master one)");

// ── 3 · in Chrome: press → words stay + ring beside, same height → request back → ring gone ──
let puppeteer = null;
try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const moduleSrc = busySrc.replace(/^export /gm, "");
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  for (const [side, css] of [["portal", pcss], ["admin", acss]]) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      if (/slow\.test/.test(u)) setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: "{}" }), /slow2/.test(u) ? 1600 : 700);
      else if (/^data:|^about:/.test(u)) r.continue();
      else r.respond({ status: 200, body: "" });
    });
    const btnClass = side === "portal" ? "pm-act is-guide" : "rga-plain";
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="padding:40px">
      <button id="b" class="${btnClass}" type="button">Keep it</button>
      <button id="lnk" class="pm-linkbtn" type="button">Prefer to keep it?</button>
      <button id="open" type="button">Remove</button>
      <button id="late" type="button">Later</button>
      <button id="two" type="button">Save both</button>
      <button id="say" class="${side === "portal" ? "pm-commit" : "rga-plain"}" type="button" style="${side === "portal" ? "" : "background:#2457e6;color:#fff;border:0;padding:8px 14px"}">Save my hours</button>
      <div id="host"></div>
      <script>${moduleSrc}
        document.getElementById("b").addEventListener("click", async () => { await fetch("https://slow.test/a"); });
        document.getElementById("lnk").addEventListener("click", async () => { await Promise.resolve(); await fetch("https://slow.test/b"); });
        document.getElementById("open").addEventListener("click", () => {
          const d = document.createElement("div"); d.setAttribute("role", "dialog"); d.innerHTML = '<button id="ok" type="button">Remove from Google</button>';
          document.getElementById("host").appendChild(d);
          d.querySelector("#ok").addEventListener("click", async () => { d.remove(); await fetch("https://slow.test/c"); });
        });
        document.getElementById("late").addEventListener("click", () => { setTimeout(() => fetch("https://slow.test/d"), 1800); });
        document.getElementById("say").addEventListener("click", async (e) => { const b = e.currentTarget; b.textContent = "Sending to Google…"; b.disabled = true; await fetch("https://slow.test/f"); b.textContent = "Save my hours"; b.disabled = false; });
        document.getElementById("two").addEventListener("click", async () => { await Promise.all([fetch("https://slow.test/e"), fetch("https://slow.test/slow2")]); });
      </script></body></html>`, { waitUntil: "load" });
    const state = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); const cs = getComputedStyle(e), af = getComputedStyle(e, "::after");
      return { busy: e.classList.contains("is-busy"), aria: e.getAttribute("aria-busy"), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height),
        color: cs.color, ring: af.content !== "none" && af.content !== "normal" ? af.borderTopColor : null, pe: cs.pointerEvents }; }, sel);
    for (const sel of ["#b", "#lnk"]) {
      const before = await state(sel);
      await page.click(sel); await new Promise((r) => setTimeout(r, 150));
      const during = await state(sel);
      if (!during.busy || during.aria !== "true") fail(`${side}: ${sel} doesn't turn busy while its request is out`);
      else {
        if (!during.ring) fail(`${side}: ${sel} is busy but no ring is drawn`);
        // 🔒 10-27 (Chris: "spinner inside blue button should still show text right?"): the words STAY, the ring sits beside them
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(during.color)) fail(`${side}: ${sel}'s words disappear while it works (the button goes blank)`);
        if (Math.abs(during.h - before.h) > 1 || during.w < before.w - 1 || during.w - before.w > 24) fail(`${side}: ${sel} jumps while busy (${before.w}×${before.h} → ${during.w}×${during.h}); the ring may widen it by its own width only`);
        if (during.pe !== "none") fail(`${side}: ${sel} can be pressed twice while busy`);
      }
      await new Promise((r) => setTimeout(r, 900));
      const after = await state(sel);
      if (after.busy || after.aria) fail(`${side}: ${sel} keeps spinning after its request is back`);
    }
    // a confirm dialog: the press on its button is credited to the control that opened it
    await page.click("#open"); await new Promise((r) => setTimeout(r, 100));
    await page.click("#ok"); await new Promise((r) => setTimeout(r, 150));
    if (!(await state("#open")).busy) fail(`${side}: after a confirm dialog, the control that opened it doesn't spin`);
    await new Promise((r) => setTimeout(r, 900));
    // 🔴 10-15 (step 8 "Save my hours"): a handler that writes its own words keeps them, the ring beside them, never faded
    await page.click("#say"); await new Promise((r) => setTimeout(r, 150));
    { const st = await page.evaluate(() => { const e = document.getElementById("say"), cs = getComputedStyle(e), af = getComputedStyle(e, "::after");
        return { busy: e.classList.contains("is-busy"), say: e.classList.contains("is-busy-say"), text: e.textContent, color: cs.color, opacity: cs.opacity, ring: af.content !== "none" ? af.borderTopColor : null, pos: af.position }; });
      if (!st.busy || !st.say) fail(`${side}: a control whose handler wrote "Sending…" isn't marked as saying its own words`);
      else {
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(st.color)) fail(`${side}: the handler's own progress words are hidden (the button went blank)`);
        if (st.opacity !== "1") fail(`${side}: a working (disabled) button is faded (${st.opacity})`);
        if (!st.ring || st.pos !== "static" || st.ring === st.color.replace(/, 1\)$/, ")") && false) fail(`${side}: no ring beside the words`);
        if (st.ring && /rgba\(0, 0, 0, 0\)/.test(st.ring)) fail(`${side}: the ring beside the words is invisible`);
      } }
    await new Promise((r) => setTimeout(r, 900));
    if (await page.evaluate(() => document.getElementById("say").className.includes("is-busy"))) fail(`${side}: "say" busy state doesn't clear`);
    // two requests: busy until BOTH are back
    await page.click("#two"); await new Promise((r) => setTimeout(r, 1100));
    if (!(await state("#two")).busy) fail(`${side}: a control that started two requests stops spinning when the first is back`);
    await new Promise((r) => setTimeout(r, 900));
    if ((await state("#two")).busy) fail(`${side}: a control that started two requests keeps spinning after both are back`);
    // a request long after the press isn't the press's
    await page.click("#late"); await new Promise((r) => setTimeout(r, 1950));
    if ((await state("#late")).busy) fail(`${side}: a request started long after a press makes that control spin`);
    await page.close();
  }
  // ── 4 · 10-16 (Chris: "made sure all buttons have spinners when loading?"): the controls steps 10–13 added, with their REAL
  // classes — Text <name> is a LINK (it opens the messages app and records the send), the rest are buttons
  {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => { if (/slow\.test/.test(r.url())) setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: "{}" }), 700); else if (/^data:|^about:/.test(r.url())) r.continue(); else r.respond({ status: 200, body: "" }); });
    await page.setContent(`<!doctype html><html><head><style>${pcss}</style></head><body style="padding:40px">
      <a id="text" class="pm-act is-go" href="#" data-review-send="0">Text Maria</a>
      <button id="sent" type="button" class="pm-amend" data-review-mark="0">I sent it</button>
      <button id="put" type="button" class="pm-commit" data-in-submit>Put it on Google</button>
      <button id="five" type="submit" class="pm-act is-go" data-r5-send>Send 5 customers →</button>
      <script>${moduleSrc}
        for (const id of ["text", "sent", "five"]) document.getElementById(id).addEventListener("click", async (e) => { e.preventDefault(); await fetch("https://slow.test/" + id); });
        document.getElementById("put").addEventListener("click", async (e) => { const b = e.currentTarget; b.textContent = "Putting it on Google…"; b.disabled = true; await fetch("https://slow.test/put"); b.textContent = "Put it on Google"; b.disabled = false; });
      </script></body></html>`, { waitUntil: "load" });
    for (const sel of ["#text", "#sent", "#put", "#five"]) {
      await page.click(sel); await new Promise((r) => setTimeout(r, 150));
      const st = await page.evaluate((sel) => { const e = document.querySelector(sel), af = getComputedStyle(e, "::after"); return { busy: e.classList.contains("is-busy"), ring: af.content !== "none" && af.content !== "normal" }; }, sel);
      if (!st.busy || !st.ring) fail(`portal: ${sel} (a step 10–13 control) doesn't spin while it works (${JSON.stringify(st)})`);
      await new Promise((r) => setTimeout(r, 900));
    }
  }
} finally { await browser.close(); }

if (F.length) { console.error("🔴 A control can wait on the server with nothing on screen:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ every control spins: shared/busy.js loads first in portal and admin; a press that starts a request turns busy (words stay, the ring beside them, same height, can't be pressed twice) until every request it started is back — a dialog's confirm credits the control that opened it; one master rule per stylesheet, no second ring");
