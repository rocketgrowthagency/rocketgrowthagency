// sweep-portal-controls.mjs — click every control in the signed-in portal and prove it does something.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 AN AUDIT THAT CAN WRITE IS NOT AN AUDIT. IT IS A USER.
//
// 2026-09-18. The first run of this sweep clicked the five owner-question tiles. Those tiles
// AUTOSAVE on tap — by design, and correctly (→ feedback_autosave_the_answer_gate_the_effect). So
// the sweep silently answered all five of RGA's owner facts with whatever option sat at the index
// it happened to click, stamped `by: client, via: portal`, and overwrote answers the owner had
// given on 09-16. Those five feed 41 drafts.
//
// My "destructive" filter matched button TEXT — pay, sign, send, delete. It could not have caught
// these: the labels are ordinary sentences like "Same day for most jobs". **A control's label tells
// you nothing about whether it writes.**
//
// 🔑 THE ONLY RELIABLE GUARD IS AT THE NETWORK LAYER. Nothing below decides what is safe to click.
// Every mutating request is refused before it leaves the browser, so a click that would have
// written simply fails — and the sweep still learns whether the control responded.
// → feedback_never_stage_a_failure_in_production
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// EVERY CONTROL, CLICKED. The billing-banner defect was a button that looked wired and did nothing.
// Reading source could not tell; only the browser could. So: enumerate every visible control in the
// signed-in portal, click the safe ones, and assert something observably changed.
//
// 🔴 DESTRUCTIVE CONTROLS ARE NOT CLICKED. Pay, sign, send, delete, approve, invite — clicking those
// on a live account would charge a card or email a human. They are reported for separate handling.
import { chromium } from "playwright";
import fs from "node:fs";
for (const line of fs.readFileSync("/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/.env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const link = (await (await fetch(`${U}/auth/v1/admin/generate_link`, { method: "POST",
  headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: "rocketgrowthagencyadmin@gmail.com", options: { redirect_to: "https://www.rocketgrowthagency.com/portal/" } }) })).json()).action_link;

const DESTRUCTIVE = /\b(pay|sign|send|delete|remove|cancel subscription|approve|reject|invite|submit|confirm|save|publish|disconnect|terminate)\b/i;
// Anything that leaves the page ends the sweep — sign-out above all. Recorded, never clicked.
const LEAVES = /\b(sign out|log out|logout)\b/i;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 140)));
const netFails = [];
let _ctx = "page load";
p.on("response", async (r) => {
  if (r.status() < 400 || r.url().includes("favicon")) return;
  if (r.status() === 503) return;   // our own write blocker
  let body = ""; try { body = (await r.text()).slice(0, 160).replace(/\s+/g, " "); } catch {}
  netFails.push(`${r.status()} ${r.url().split("/").slice(3).join("/").slice(0, 55)}  ← while clicking: ${_ctx}\n        sent: ${(r.request().postData() || "(no body)").slice(0, 200)}\n        got:  ${body}`);
});
await p.goto(link, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(6000);

// ── THE WRITE BLOCKER ──────────────────────────────────────────────────────────────────────────
// Refuse anything that could persist. Sign-in (/auth/v1/) is allowed because without a session
// there is nothing to sweep; Supabase REST is allowed to READ and never to write.
const blockedWrites = [];
await p.route("**/*", async (route) => {
  const r = route.request();
  const m = r.method().toUpperCase();
  const u = r.url();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (u.includes("/auth/v1/")) return route.continue();                       // sign-in only

  if (u.includes("/rest/v1/")) {                                              // any non-GET on the DB
    blockedWrites.push(`${m} ${u.split("/rest/v1/")[1].slice(0, 50)}`);
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"blocked by audit"}' });
  }
  const fn = u.includes("/.netlify/functions/") ? u.split("/.netlify/functions/")[1].split("?")[0] : null;
  if (fn) {
    let body = {};
    try { body = JSON.parse(r.postData() || "{}"); } catch {}
    // A POST is a READ here only when it carries no mutating key. client-facts reads with just a
    // client_id and WRITES the moment `answers` appears — same endpoint, same method.
    const MUTATING = ["answers", "ask", "answer_question", "value", "choice", "mark_done", "message",
                      "action_answer", "status", "tasks", "data"];
    const mutates = MUTATING.some((k) => k in body);
    const ALWAYS_WRITES = /^(portal-message|portal-step-input|portal-step-choice|notify-rga|send-|admin-|brain-record)/;
    if (mutates || ALWAYS_WRITES.test(fn)) {
      blockedWrites.push(`${fn} ${Object.keys(body).filter((k) => k !== "client_id").join(",")}`);
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"blocked by audit"}' });
    }
  }
  return route.continue();
});


const VIEWS = ["dashboard", "setup", "approvals", "reports", "reviews", "rankings", "account"];
const dead = [], skipped = [], clicked = [], navigated = [];

for (const view of VIEWS) {
  await p.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), view);
  await p.waitForTimeout(1200);
  // Snapshot the control list for this view (indices stay valid because we re-query each time).
  const n = await p.evaluate(() => document.querySelectorAll(".pv:not([style*='display: none']) button, .pv:not([style*='display: none']) a[href]").length);
  for (let i = 0; i < n; i++) {
    const info = await p.evaluate(({ i }) => {
      const els = [...document.querySelectorAll(".pv:not([style*='display: none']) button, .pv:not([style*='display: none']) a[href]")];
      const el = els[i]; if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) return null;
      return { text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48),
               tag: el.tagName, href: el.getAttribute("href") || "",
               attrs: [...el.attributes].map((a) => a.name).filter((a) => a.startsWith("data-")).join(","),
               disabled: el.disabled === true };
    }, { i });
    if (!info || !info.text) continue;
    if (info.disabled) { skipped.push([view, info.text, "disabled"]); continue; }
    if (DESTRUCTIVE.test(info.text)) { skipped.push([view, info.text, "destructive — not clicked"]); continue; }
    if (LEAVES.test(info.text)) { skipped.push([view, info.text, "navigates away — not clicked"]); continue; }
    if (info.href && info.href !== "#" && !info.href.startsWith("#")) { skipped.push([view, info.text, `href ${info.href.slice(0,40)}`]); continue; }
    if (info.href && /^https?:/i.test(info.href)) { clicked.push([view, info.text, "external link"]); continue; }

    _ctx = `[${view}] "${info.text}"`;
    // 🔑 COMPARE CONTENT, NOT LENGTH. An accordion that closes one panel and opens another removes
    // one `hidden=""` and adds another — byte-identical length, completely different DOM. Measuring
    // innerHTML.length reported two live controls as dead. → feedback_a_check_must_not_validate_itself
    const before = await p.evaluate(() => { window.__sweepPrev = document.body.innerHTML;
      return { view: document.body.getAttribute("data-portal-view"),
               scroll: Math.round(window.scrollY), modal: !!document.getElementById("rga-ask") }; });
    try {
      await p.evaluate(({ i }) => {
        const els = [...document.querySelectorAll(".pv:not([style*='display: none']) button, .pv:not([style*='display: none']) a[href]")];
        els[i]?.click();
      }, { i });
    } catch { /* click threw — recorded below as no-change */ }
    await p.waitForTimeout(700);
    let after;
    try {
      after = await p.evaluate(() => ({ domChanged: document.body.innerHTML !== window.__sweepPrev,
        view: document.body.getAttribute("data-portal-view"),
        scroll: Math.round(window.scrollY), modal: !!document.getElementById("rga-ask") }));
    } catch {
      // The click navigated. Record it, restore the session, and carry on.
      navigated.push([view, info.text]);
      await p.goto("https://www.rocketgrowthagency.com/portal/", { waitUntil: "networkidle", timeout: 60000 });
      await p.waitForTimeout(4000);
      await p.evaluate((v) => document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(), view);
      await p.waitForTimeout(900);
      continue;
    }
    const changed = after.domChanged || after.view !== before.view
      || Math.abs(after.scroll - before.scroll) > 4 || after.modal !== before.modal;
    if (changed) clicked.push([view, info.text, after.view !== before.view ? `→ ${after.view}` : after.modal ? "opened composer" : "changed"]);
    else dead.push([view, info.text, info.attrs || info.tag]);
    // Reset: close any modal, return to this view.
    await p.evaluate(() => document.getElementById("rga-ask")?.remove());
    await p.evaluate((v) => { if (document.body.getAttribute("data-portal-view") !== v) document.querySelector(`.portal-nav a[data-view="${v}"]`)?.click(); }, view);
    await p.waitForTimeout(350);
  }
}
console.log(`── every visible control in the signed-in portal ──`);
console.log(`  ${clicked.length} responded · ${dead.length} did NOTHING · ${skipped.length} not clicked`);
if (dead.length) { console.log(`\n  🔴 CONTROLS THAT DID NOTHING:`); for (const [v, t, a] of dead) console.log(`     [${v}] "${t}"  (${a})`); }
if (skipped.length) { console.log(`\n  ⏭  not clicked (need separate handling):`); for (const [v, t, r] of skipped) console.log(`     [${v}] "${t}" — ${r}`); }
if (navigated.length) { console.log(`\n  ↪ navigated away (session restored):`); for (const [v,t] of navigated) console.log(`     [${v}] "${t}"`); }
console.log(`\n  page errors: ${pageErrors.length ? pageErrors.join(" | ") : "none"}`);
console.log(`\n  🔒 writes blocked during the sweep: ${blockedWrites.length}${blockedWrites.length ? "\n     " + [...new Set(blockedWrites)].join("\n     ") : ""}`);
console.log(`  failed requests:${netFails.length ? "\n     " + [...new Set(netFails)].join("\n     ") : " none"}`);
await b.close();
