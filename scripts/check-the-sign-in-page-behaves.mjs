#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE CLIENT SIGN-IN PAGE BEHAVES — every state of /client-login/, in a real browser
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Approved client_login_v3 (Shopify-style), 2026-10-13 → project_client_sign_in_page.
// Chris on v2: "not impressed make it better. make sure logo is accurate also" · "think shopify".
//
// This serves the site's own files (client-login/index.html, portal/client-login.js, portal.css, the
// vendored supabase-js) and drives chromium through every state. The network is MOCKED: admin-config
// returns a stub project, and the stub's /auth/v1/otp answers 200, 429 or 500 on demand. No email is
// ever sent, and no live data is read, so this cannot flake on the network or become a user.
// → feedback_a_flaky_gate_is_worse_than_a_failing_one · feedback_an_audit_that_can_write_is_a_user
//
// What it pins (each is a promise on the page or a decision Chris approved):
//   · the logo is images/assets/rga-logo.svg exactly (every path, the colours, Inter 800)
//   · "Sign in", one full-width 40px action, no "magic link" anywhere a client reads
//   · a bad address is stopped before anything is sent; a common-provider typo gets "Did you mean"
//     and a real provider or a business domain never does
//   · a send turns the card into "Check your email": the address, the subject, 1 hour, a resend that
//     counts down, Open Gmail only for Gmail, and the way back ("Use a different email")
//   · Supabase's 429 "after N seconds" is a link already sent → the same screen, counting from N
//   · any other failure stays on the form and says what to do, never a raw Supabase message
//   · ?expired=1 and ?reason=session_expired each explain themselves
//   · a live session leaves for /portal/ (the 2026-09-10 rule); ?switch=1 shows the account and
//     signs out; "No portal on this email" appears ONLY with ?reason=no_access
//   · no sideways scroll at phone width
//
// Points at a copy via APPROVAL_ARCHIVE_SITE_DIR (mutation suite scripts/mutations/<this>.json).
// Exit 0 healthy · 1 the page misbehaves · 2 INDETERMINATE (no browser, files missing)

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const STUB = "https://stub-project.supabase.test";
const STORAGE_KEY = "sb-stub-project-auth-token";

for (const f of ["client-login/index.html", "portal/client-login.js", "portal/portal.css", "vendor/supabase-js-2.52.1.js", "images/assets/rga-logo.svg"]) {
  if (!fs.existsSync(`${SITE}/${f}`)) { console.log(`⚠️  INDETERMINATE — ${f} is missing under ${SITE}`); process.exit(2); }
}

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); } catch { console.log("⚠️  INDETERMINATE — puppeteer not installed"); process.exit(2); }

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

let browser;
try { browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] }); }
catch (e) { server.close(); console.log(`⚠️  INDETERMINATE — chromium would not launch: ${e.message}`); process.exit(2); }

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✅ ${msg}`); else { console.log(`  🔴 ${msg}`); fails++; } };

// One page per scenario. otp: "ok" | "wait:<n>" | "error". session: null | email.
async function open(query = "", { otp = "ok", session = null, width = 1280, otpDelay = 0, realPortal = false } = {}) {
  // A fresh context each time: one scenario's session in localStorage must never leak into the next.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on("close", () => context.close().catch(() => {}));
  await page.setViewport({ width, height: 900 });
  const calls = { otp: [], logout: 0, portal: 0 };
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    const url = req.url();
    if (url.startsWith(`${ORIGIN}/.netlify/functions/admin-config`)) return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, supabaseUrl: STUB, supabaseAnonKey: "stub-anon-key" }) });
    if (url.startsWith(`${ORIGIN}/.netlify/functions/portal-hint`)) return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ portal_email_hint: "o•••@lonestardrain.com", business_name: "Lone Star Drain & Plumbing" }) });
    if (!realPortal && url.startsWith(`${ORIGIN}/portal/`) && req.resourceType() === "document") { calls.portal++; return req.respond({ status: 200, contentType: "text/html", body: "<title>portal</title>portal" }); }
    if (url.startsWith(`${STUB}/auth/v1/otp`)) {
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors() });
      calls.otp.push(JSON.parse(req.postData() || "{}"));
      if (otpDelay) await new Promise((r) => setTimeout(r, otpDelay));
      // "waitonce:N" = Supabase's real per-address limit: the first request is refused for N seconds, the next one sends
      if (otp.startsWith("waitonce:")) return calls.otp.length === 1
        ? req.respond({ status: 429, headers: cors(), contentType: "application/json", body: JSON.stringify({ code: "over_email_send_rate_limit", msg: `For security purposes, you can only request this after ${otp.slice(9)} seconds.` }) })
        : req.respond({ status: 200, headers: cors(), contentType: "application/json", body: "{}" });
      if (otp === "ok") return req.respond({ status: 200, headers: cors(), contentType: "application/json", body: "{}" });
      if (otp.startsWith("wait:")) return req.respond({ status: 429, headers: cors(), contentType: "application/json", body: JSON.stringify({ code: "over_email_send_rate_limit", msg: `For security purposes, you can only request this after ${otp.slice(5)} seconds.` }) });
      return req.respond({ status: 500, headers: cors(), contentType: "application/json", body: JSON.stringify({ code: "unexpected_failure", msg: "Error sending magic link email" }) });
    }
    if (url.startsWith(`${STUB}/auth/v1/logout`)) { if (req.method() !== "OPTIONS") calls.logout++; return req.respond({ status: 204, headers: cors() }); }
    // the real portal's reads: a signed-in email with NO portal rows (empty lists), and every other function says ok
    if (url.startsWith(`${STUB}/rest/v1/`)) return req.method() === "OPTIONS" ? req.respond({ status: 204, headers: cors() }) : req.respond({ status: 200, headers: cors(), contentType: "application/json", body: "[]" });
    if (url.startsWith(STUB)) return req.respond({ status: 200, headers: cors(), contentType: "application/json", body: "{}" });
    if (url.startsWith(`${ORIGIN}/.netlify/functions/`)) return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    // Fonts are blocked (the page must work without them), except in screenshot mode, where the diff needs real Inter.
    if (!url.startsWith(ORIGIN)) return process.env.SIGNIN_SHOTS && /fonts\.(googleapis|gstatic)\.com/.test(url) ? req.continue() : req.abort();
    return req.continue();
  });
  if (session) {
    const now = Math.floor(Date.now() / 1000);
    const s = { access_token: "stub.access.token", refresh_token: "stub-refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user: { id: "00000000-0000-0000-0000-000000000001", email: session, aud: "authenticated", role: "authenticated" } };
    // Seed once per tab (sessionStorage survives a reload), so the reload after "Sign out" is really signed out.
    await page.evaluateOnNewDocument((k, v) => { try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem(k, v); } } catch {} }, STORAGE_KEY, JSON.stringify(s));
  }
  await page.goto(`${ORIGIN}/client-login/${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.readyState === "complete");
  await new Promise((r) => setTimeout(r, 250));
  return { page, calls };
}
function cors() { return { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }; }
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest("[hidden]") && r.width > 0 && r.height > 0; }, sel);
const text = (page, sel) => page.evaluate((s) => (document.querySelector(s)?.innerText || "").trim(), sel);
const typeEmail = async (page, v) => { await page.click("#clientLoginEmail", { clickCount: 3 }); await page.keyboard.press("Backspace"); await page.type("#clientLoginEmail", v); };
// SIGNIN_SHOTS=<dir> saves each state as a PNG, for the box-by-box diff against the mockup.
const shot = async (page, name) => { if (process.env.SIGNIN_SHOTS) await page.screenshot({ path: `${process.env.SIGNIN_SHOTS}/signin_${name}.png` }); };
// 🔑 A scenario that THROWS is a failure, not "indeterminate": a hidden button that cannot be clicked
// is exactly what a regression looks like. Only the browser not launching is exit 2.
let scenario = 0;
const run = async (fn) => { scenario++; try { await fn(); } catch (e) { console.log(`  🔴 scenario ${scenario} broke mid-walk: ${e.message.split("\n")[0]}`); fails++; } };
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

try {
  // ── 1. the first screen ──────────────────────────────────────────────────────────────────────────
  console.log("\n1 · the first screen");
  await run(async () => {
    const { page } = await open();
    const logo = fs.readFileSync(`${SITE}/images/assets/rga-logo.svg`, "utf8");
    const html = fs.readFileSync(`${SITE}/client-login/index.html`, "utf8");
    const paths = [...logo.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    const tspans = (logo.match(/<tspan[\s\S]*<\/tspan>/) || [""])[0];
    const drawing = (x) => { const m = x.replace(/<!--[\s\S]*?-->/g, "").match(/<svg[^>]*viewBox="0 0 1046 100"[^>]*>([\s\S]*?)<\/svg>/); return m ? m[1].replace(/>\s+</g, "><").replace(/\s+/g, " ").trim() : "?"; };
    ok(drawing(logo) === drawing(html), "the logo on the page is images/assets/rga-logo.svg's drawing, byte for byte (shapes, transforms, colours, type)");
    ok(paths.length === 4 && paths.every((d) => html.includes(`d="${d}"`)) && html.includes(tspans) && html.includes('rx="24" fill="#2457e6"') && html.includes('font-weight="800" letter-spacing="-1.6"'),
      "the logo is images/assets/rga-logo.svg exactly (4 rocket paths, the squircle, Rocket/Growth/Agency colours, Inter 800)");
    ok(await page.evaluate(() => !!document.querySelector(".si-logo svg text") && getComputedStyle(document.querySelector(".si-logo svg")).height === "22px"), "the logo is inline (so its wordmark gets Inter) at 22px");
    ok(await text(page, "#siTitle") === "Sign in", "the heading reads \"Sign in\"");
    ok(await page.evaluate(() => document.activeElement?.id === "clientLoginEmail"), "the email field has focus on arrival");
    ok(await text(page, "#clientLoginButton") === "Email me a sign-in link", "the action reads \"Email me a sign-in link\"");
    const geo = await page.evaluate(() => { const b = document.querySelector("#clientLoginButton").getBoundingClientRect(); const f = document.querySelector("#clientLoginEmail").getBoundingClientRect(); return { bw: Math.round(b.width), fw: Math.round(f.width), bh: Math.round(b.height), fh: Math.round(f.height) }; });
    ok(geo.bw === geo.fw && geo.bh === 40, `the action spans the card at 40px (button ${geo.bw}×${geo.bh}, field ${geo.fw} wide)`);
    ok(geo.fh === 48, `the field is 48px tall (${geo.fh})`);
    ok(!/magic link/i.test(await page.evaluate(() => document.body.innerText)), "no \"magic link\" anywhere a client reads");
    const links = await page.evaluate(() => [...document.querySelectorAll(".si-foot a, .si-alt a")].map((a) => a.getAttribute("href")));
    ok(["/contact/", "/privacy/", "/terms/", "/free-growth-audit/"].every((h) => links.includes(h)), `Help · Privacy · Terms and the growth-audit line link where they say (${links.join(" ")})`);
    for (const h of ["contact", "privacy", "terms", "free-growth-audit"]) ok(fs.existsSync(`${SITE}/${h}/index.html`), `/${h}/ exists`);
    await shot(page, "first");
    ok(!(await visible(page, "#siBanner")), "no banner when nothing sent them here");
    await page.close();
  });

  // ── 2. a bad address never sends ─────────────────────────────────────────────────────────────────
  console.log("\n2 · a bad address is stopped, a typo is caught");
  await run(async () => {
    const { page, calls } = await open();
    await typeEmail(page, "owner@lonestardrain");
    await page.click("#clientLoginButton"); await settle();
    ok(calls.otp.length === 0, "\"owner@lonestardrain\" sends nothing");
    await shot(page, "invalid");
    ok(/Enter your full email/.test(await text(page, "#siHint")) && await page.evaluate(() => document.querySelector("#siHint").classList.contains("is-bad") && document.querySelector("#clientLoginEmail").getAttribute("aria-invalid") === "true"), "…and says \"Enter your full email\" in red on the field");
    await typeEmail(page, "owner@gmial.com"); await page.click("#siTitle"); await settle(600);
    await shot(page, "typo");
    ok(/Did you mean owner@gmail\.com\?/.test(await text(page, "#siHint")), "\"owner@gmial.com\" → \"Did you mean owner@gmail.com?\"");
    await page.click("[data-si-fix]"); await settle();
    ok(await page.$eval("#clientLoginEmail", (e) => e.value) === "owner@gmail.com", "tapping the fix puts owner@gmail.com in the field");
    for (const v of ["owner@lonestardrain.com", "owner@ymail.com", "owner@mail.com", "owner@email.com", "owner@gmail.com", "owner@me.com"]) {
      await typeEmail(page, v); await page.click("#siTitle"); await settle(600);
      ok(!(await visible(page, "#siHint")), `no suggestion for ${v}`);
    }
    for (const [v, want] of [["owner@yaho.com", "yahoo.com"], ["owner@hotmial.com", "hotmail.com"], ["owner@gmail.con", "gmail.com"], ["owner@outlok.com", "outlook.com"]]) {
      await typeEmail(page, v); await page.click("#siTitle"); await settle(600);
      ok((await text(page, "#siHint")).includes(want), `${v} → suggests ${want}`);
    }
    await page.close();
  });

  // ── 3. a send ─────────────────────────────────────────────────────────────────────────────────────
  console.log("\n3 · a send becomes \"Check your email\"");
  await run(async () => {
    const { page, calls } = await open("", { otpDelay: 500 });
    await typeEmail(page, "Owner@Gmail.com");
    await page.click("#clientLoginButton"); await settle(150);
    await shot(page, "sending");
    ok(await page.evaluate(() => { const b = document.querySelector("#clientLoginButton"); return b.disabled && b.classList.contains("is-busy") && /Sending/.test(b.textContent) && document.querySelector("#clientLoginEmail").disabled; }), "while sending: the button is disabled, spinning, \"Sending your link…\", and the field is greyed");
    await settle(800);
    ok(calls.otp.length === 1 && calls.otp[0].email === "owner@gmail.com", `one request, lower-cased (${JSON.stringify(calls.otp.map((c) => c.email))})`);
    ok(calls.otp[0]?.create_user === true, "it still creates the user (shouldCreateUser, unchanged)");
    ok(await visible(page, "#siSentView") && !(await visible(page, "#siFormView")), "the card is now \"Check your email\" (the form is gone)");
    await shot(page, "sent");
    ok(await text(page, "#siSentTo") === "owner@gmail.com", "it names the address");
    const sent = (await text(page, "#siSentView")).replace(/\u00a0/g, " "); // a non-breaking space still reads as a space
    // v4 (approved client_login_sent_v4, 2026-10-14): the email itself as an inbox row; one action; Change beside the address
    ok(await page.evaluate(() => { const r = document.querySelector("#siSentView .si-row"); return !!r && r.querySelector(".si-row-who")?.textContent === "Rocket Growth Agency" && /^Your Rocket Growth Agency sign-in link/.test(r.querySelector(".si-row-subj")?.textContent || "") && /Client Portal Your secure sign-in link/.test(r.textContent); }), "the inbox row shows the email itself: our name, the real subject, the template's real opening");
    ok(await page.evaluate(() => !document.querySelector("#siSentView .si-what, #siSentView .si-badge") && document.querySelectorAll("#siSentView .si-btn:not([hidden])").length === 1), "one action on the screen (no From/Subject box, no envelope tile, no second button)");
    ok(await page.evaluate(() => !!document.querySelector(".si-chip #siSentTo") && document.querySelector(".si-chip #siChangeEmail")?.textContent.trim() === "Change"), "\"Change\" sits beside the address");
    ok(await page.evaluate(() => { const t = document.querySelector("#siSentTo"); const w = t.querySelector("wbr"); return !!w && w.previousSibling?.textContent.endsWith("@") && getComputedStyle(t).overflowWrap !== "anywhere"; }), "a long address wraps after the \"@\", never mid-word");
    ok(!(await visible(page, "#siResent")), "the first send shows no \"sent again\" note");
    ok(/^You can send a new link in \d:\d\d$/.test((await text(page, "#siResendLine")).replace(/\s+/g, " ")) && !(await page.$("#siResend")), `resend waits as a quiet line with nothing to press (${await text(page, "#siResendLine")})`);
    ok(sent.includes("Your Rocket Growth Agency sign-in link") && sent.includes("1 hour") && sent.includes("Rocket Growth Agency") && /spam/i.test(sent), "it gives the subject, the sender, \"1 hour\" and the spam hint");
    ok(await visible(page, "#siOpenMail") && (await text(page, "#siOpenMail")) === "Open Gmail" && (await page.$eval("#siOpenMail", (a) => a.href)).startsWith("https://mail.google.com/"), "\"Open Gmail\" opens Gmail");
    ok(/in (0:5\d|1:00)$/.test(await text(page, "#siResendLine")), `…counting down from 1:00 (${await text(page, "#siResendLine")})`);
    await page.click("#siChangeEmail"); await settle();
    ok(await visible(page, "#siFormView") && await page.$eval("#clientLoginEmail", (e) => e.value) === "", "\"Use a different email\" goes back to an empty field");
    await page.close();
  });
  await run(async () => {
    const { page } = await open();
    await typeEmail(page, "owner@lonestardrain.com");
    await page.click("#clientLoginButton"); await settle(500);
    ok(await visible(page, "#siSentView") && !(await visible(page, "#siOpenMail")), "a business address gets no \"Open …\" button (we can't know its inbox)");
    await page.close();
  });

  // ── 4. a link already sent, and a real failure ────────────────────────────────────────────────────
  console.log("\n4 · 429 is a link already sent; any other failure stays and says what to do");
  await run(async () => {
    const { page, calls } = await open("", { otp: "waitonce:2" });
    await typeEmail(page, "owner@lonestardrain.com");
    await page.click("#clientLoginButton"); await settle(400);
    ok(await visible(page, "#siSentView") && /0:0[12]/.test(await text(page, "#siResendLine")), `429 "after 2 seconds" → "Check your email", counting from 0:02 (${await text(page, "#siResendLine")})`);
    await settle(2600);
    ok(await page.evaluate(() => { const b = document.querySelector("#siResend"); return !!b && b.textContent.trim() === "Send a new link" && /^Still nothing\?/.test(document.querySelector("#siResendLine").textContent.trim()); }), "at zero, \"Still nothing? Send a new link\" appears");
    await page.click("#siResend"); await settle(400);
    ok(calls.otp.length === 2 && calls.otp[1].email === "owner@lonestardrain.com", "resend sends to the same address");
    ok(await page.evaluate(() => !document.querySelector("#siResend")) && /You can send a new link in/.test(await text(page, "#siResendLine")), "and the countdown starts again");
    await shot(page, "resent");
    ok(await visible(page, "#siResent") && /^New link sent at \d{1,2}:\d\d\s?(AM|PM)?\. Use the newest email\.$/i.test(await text(page, "#siResent")), `a resend confirms itself with the time (${await text(page, "#siResent")})`);
    await page.close();
  });
  await run(async () => {
    const { page } = await open("", { otp: "error" });
    await typeEmail(page, "owner@lonestardrain.com");
    await page.click("#clientLoginButton"); await settle(500);
    const hint = await text(page, "#siHint");
    ok(await visible(page, "#siFormView") && !(await visible(page, "#siSentView")), "a 500 stays on the form (never claims a send)");
    await shot(page, "error");
    ok(/couldn't send a link/.test(hint) && hint.includes("hello@rocketgrowthagency.com") && !/Error sending/i.test(hint), `…says what to do, not Supabase's words ("${hint}")`);
    ok(await page.evaluate(() => { const b = document.querySelector("#clientLoginButton"); return !b.disabled && b.textContent === "Email me a sign-in link"; }), "…and the button is back");
    await page.close();
  });

  // ── 5. why they're here ───────────────────────────────────────────────────────────────────────────
  console.log("\n5 · an old link and the 30-day sign-out explain themselves");
  await run(async () => {
    const { page } = await open("?expired=1");
    await shot(page, "expired");
    ok(await visible(page, "#siBanner") && /expired or was already used/.test(await text(page, "#siBanner")), "?expired=1 → \"That link has expired or was already used\"");
    ok(await text(page, "#clientLoginButton") === "Email me a new link", "…and the button reads \"Email me a new link\"");
    await page.close();
    const b = await open("?reason=session_expired");
    ok(await visible(b.page, "#siBanner") && /signed out to keep your account safe/.test(await text(b.page, "#siBanner")), "?reason=session_expired → \"You were signed out to keep your account safe\"");
    await b.page.close();
    const c = await open("?slug=lone-star");
    await settle(300);
    ok((await text(c.page, "#siSub")).includes("Lone Star Drain & Plumbing") && (await c.page.$eval("#clientLoginEmail", (e) => e.placeholder)).includes("•••"), "?slug= names the business and shows the masked email as a placeholder");
    await c.page.close();
  });

  // ── 6. a live session ────────────────────────────────────────────────────────────────────────────
  console.log("\n6 · a live session leaves; ?switch=1 is the way out");
  await run(async () => {
    const { page, calls } = await open("", { session: "owner@lonestardrain.com" });
    await settle(500);
    ok(calls.portal === 1 || page.url().startsWith(`${ORIGIN}/portal/`), `a live session goes straight to /portal/ (${page.url().replace(ORIGIN, "")})`);
    await page.close();
  });
  await run(async () => {
    const { page } = await open("?switch=1", { session: "chriskapranos2@gmail.com" });
    ok(await visible(page, "#siSwitchView") && !(await visible(page, "#siFormView")), "?switch=1 shows \"Use a different email\", not the form");
    await shot(page, "switch");
    ok(await text(page, "#siWho") === "chriskapranos2@gmail.com" && await text(page, "#siAvatar") === "C", "…with the signed-in account");
    ok(!/No portal/.test(await text(page, "#siSwitchView")), "…and makes no \"no portal\" claim it can't know");
    await page.close();
  });
  await run(async () => {
    const { page, calls } = await open("?switch=1&reason=no_access", { session: "chriskapranos2@gmail.com" });
    ok(/No portal on this email/.test(await text(page, "#siWhoNote")), "?reason=no_access (the portal's own link) → \"No portal on this email\"");
    await page.click("#clientLoginSignOut");
    await page.waitForFunction(() => location.search === "", { timeout: 4000 }).catch(() => {});
    ok(calls.logout >= 1 && new URL(page.url()).pathname === "/client-login/" && new URL(page.url()).search === "", "\"Sign out and use another email\" signs out and reloads the plain page");
    await settle(600);
    ok(await visible(page, "#siFormView") && !(await visible(page, "#siSwitchView")), "…which then shows the sign-in form (the session is really gone)");
    await page.close();
  });
  await run(async () => {
    const portal = fs.readFileSync(`${SITE}/portal/portal.js`, "utf8");
    ok(portal.includes('"/client-login/?switch=1&reason=no_access"'), "the portal's no-access message links with &reason=no_access");
  });

  // ── 7. phone width ───────────────────────────────────────────────────────────────────────────────
  console.log("\n7 · phone width");
  await run(async () => {
    const { page } = await open("", { width: 375 });
    await typeEmail(page, "frontdesk.scheduling@granitestatehomecleaning.com");
    await page.click("#clientLoginButton"); await settle(500);
    await shot(page, "phone-long");
    const g = await page.evaluate(() => { const t = document.querySelector("#siSentTo"); const r = document.createRange(); r.selectNodeContents(t); const rows = [...new Set([...r.getClientRects()].map((x) => Math.round(x.top)))].length; return { sw: document.documentElement.scrollWidth, rows, first: t.firstChild.textContent }; });
    ok(g.sw <= 375 && g.rows === 2 && g.first.endsWith("@"), `375px, a long business address: two lines split at the "@", no sideways scroll (rows ${g.rows}, scroll ${g.sw})`);
    await page.close();
  });
  for (const q of ["", "?expired=1"]) {
    const { page } = await open(q, { width: 375 });
    const g = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, card: (({ left, right }) => ({ left, right }))(document.querySelector(".si-card").getBoundingClientRect()) }));
    ok(g.sw <= 375 && g.card.left >= 15 && g.card.right <= 360, `375px${q ? " " + q : ""}: no sideways scroll, 16px gutters (scroll ${g.sw}, card ${Math.round(g.card.left)}–${Math.round(g.card.right)})`);
    await page.close();
  }
  // ── 8. THE PORTAL'S STATUS SCREENS, same design (approved portal_status_screens_v1, 2026-10-14) ─────────────────
  console.log("\n8 · the portal's status screens");
  const openPortal = async (query, session) => {
    const { page } = await open("", { session, realPortal: true });
    await page.goto(`${ORIGIN}/portal/${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.body.dataset.portalStatus || !document.getElementById("portalDashboard")?.hidden, { timeout: 8000 }).catch(() => {});
    await settle(300);
    return page;
  };
  await run(async () => {
    const page = await openPortal("", null);
    const r = await page.evaluate(() => ({ status: document.body.dataset.portalStatus, h: document.querySelector("#portalMessagePanel " + ".ps-hd h1")?.textContent, btn: document.querySelector("#portalMessagePanel " + ".ps-btn")?.textContent, href: document.querySelector("#portalMessagePanel " + ".ps-btn")?.getAttribute("href"),
      side: getComputedStyle(document.querySelector(".portal-side")).display, logo: !!document.querySelector(".ps-logo text"), text: document.body.innerText,
      bw: Math.round(document.querySelector("#portalMessagePanel " + ".ps-btn").getBoundingClientRect().width), cw: Math.round(document.querySelector("#portalMessagePanel " + ".ps-card").getBoundingClientRect().width), bh: Math.round(document.querySelector("#portalMessagePanel " + ".ps-btn").getBoundingClientRect().height) }));
    await shot(page, "portal-signedout");
    ok(r.status === "signed_out" && r.h === "Sign in to see your portal" && r.btn === "Sign in" && r.href === "/client-login/", `signed out: "Sign in to see your portal" → /client-login/ (${r.status} · ${r.h} · ${r.href})`);
    ok(r.side === "none" && r.logo, "…with no portal menu and the real logo");
    ok(!/magic link/i.test(r.text), "…and no \"magic link\" anywhere");
    ok(r.bh === 40 && r.bw > 300 && r.bw > r.cw - 80, `…one full-width 40px action (${r.bw}×${r.bh} in a ${r.cw} card)`);
    await page.close();
  });
  await run(async () => {
    const page = await openPortal("?dup_owner=found", null);
    const r = await page.evaluate(() => ({ status: document.body.dataset.portalStatus, h: document.querySelector("#portalMessagePanel " + ".ps-hd h1")?.textContent, text: document.querySelector("#portalMessagePanel " + ".ps-card")?.innerText || "" }));
    ok(r.status === "back_from_google" && r.h === "Sign in to finish" && /Nothing was removed/.test(r.text), `back from Google, signed out: "Sign in to finish… Nothing was removed" (${r.status})`);
    await page.evaluate(() => { document.querySelector("#portalMessagePanel " + "[data-ps-resume]").addEventListener("click", (e) => e.preventDefault(), { once: true }); });
    await page.click("[data-ps-resume]");
    const flag = await page.evaluate(() => { try { return localStorage.getItem("rga_portal_resume"); } catch { return "x"; } });
    ok(flag === "approvals", `…"Sign in" remembers to reopen the removal step (${flag})`);
    await page.close();
  });
  await run(async () => {
    const page = await openPortal("", "someone.else@example.test");
    const r = await page.evaluate(() => ({ status: document.body.dataset.portalStatus, h: document.querySelector("#portalMessagePanel " + ".ps-hd h1")?.textContent, text: document.querySelector("#portalMessagePanel " + ".ps-card")?.innerText || "", href: document.querySelector("#portalMessagePanel " + ".ps-btn")?.getAttribute("href") }));
    await shot(page, "portal-noaccess");
    ok(r.status === "no_access" && r.h === "This email doesn't have a portal" && r.text.includes("someone.else@example.test") && r.href === "/client-login/?switch=1&reason=no_access", `an email with no portal: says so, names it, and offers "Use a different email" (${r.status} · ${r.href})`);
    await page.close();
  });

  // ── 9. THE GOOGLE SIGN-IN ERROR PAGE + "LOADING" (approved client_remaining_screens_v1, 2026-10-14) ─────────────
  console.log("\n9 · the Google sign-in error page and the loading screen");
  await run(async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire(`${SITE}/netlify/functions/x.js`);
    const { googleError, renderStatusPage } = req("./_status-page.js");
    for (const [raw, title] of [
      ["Google denied access: access_denied", "The Google sign-in was stopped"],
      ["This connect link expired — please retry Connect Google from your dashboard.", "That sign-in took too long"],
      ["Invalid or tampered state token", "That sign-in took too long"],
      ["Missing code or state from Google", "That sign-in took too long"],
      ["Google returned no refresh_token. Revoke the previous grant at myaccount.google.com/permissions, then reconnect.", "Google needs a fresh connection"],
      ["Token exchange failed: invalid_grant — Bad Request", "We couldn't connect your Google account"],
      ["Supabase upsert failed (500): boom", "We couldn't connect your Google account"],
      ["Google denied access: invalid_scope", "We couldn't connect your Google account"],
    ]) {
      const pg = googleError(raw);
      pg.title = pg.title.replace(/\u2011/g, "-");
      ok(pg.title === title && pg.detail && (pg.detail === "no refresh_token" || raw.startsWith(pg.detail.slice(0, 20))), `"${raw.slice(0, 42)}…" → "${title}", with the raw message kept for support (${pg.title})`);
    }
    const d = googleError("Google sign-in failed: invalid_grant", { flow: "dup" }); d.title = d.title.replace(/\u2011/g, "-");
    ok(d.title === "We couldn't finish the Google sign-in" && /Nothing was removed/.test(d.copy) && d.action.href === "/portal/?dup_owner=failed", `during the duplicate removal: "Nothing was removed" and back to the removal step (${d.action.href})`);
    const s1 = googleError("Google denied access: access_denied");
    ok(s1.action.href === "/portal/#step-m1.access.analytics" && /Nothing changed/.test(s1.copy), "in Setup: \"Nothing changed\" and Try again opens Connect Google");
    const html = renderStatusPage(googleError(`Token exchange failed: <script>alert(1)</script>`));
    ok(!html.includes("<script>alert") && html.includes("&lt;script&gt;"), "the raw message is escaped, never run");
    ok(!/color:#c00|Could not connect Google account/.test(html) && /<a href="\/contact\/">Help<\/a>/.test(html) && /max-width:420px/.test(html), "the page is the sign-in card (no red heading), with Help · Privacy · Terms");
    const cb = fs.readFileSync(`${SITE}/netlify/functions/oauth-google-callback.js`, "utf8");
    ok(/body: renderStatusPage\(googleError\(msg, opts\)\)/.test(cb) && /handleCallback\(code, state, \(m\) => errorPage\(m, \{ flow: "dup" \}\)\)/.test(cb), "both Google flows render it (Setup's connection, and the duplicate removal with its own wording)");
  });
  await run(async () => {
    // the portal before its script runs: what everyone sees for a second on every visit
    const { page } = await open("", {});
    await page.setRequestInterception(true);
    page.on("request", (r) => (/\/portal\/portal\.js/.test(r.url()) ? r.abort() : null));
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1280, height: 900 });
    await page2.setRequestInterception(true);
    page2.on("request", (r) => (r.url().startsWith(ORIGIN) && !/\/portal\/portal\.js/.test(r.url()) ? r.continue() : r.abort()));
    await page2.goto(`${ORIGIN}/portal/`, { waitUntil: "load" });
    await settle(300);
    const r = await page2.evaluate(() => ({ h: document.querySelector("#portalLoadingPanel h2")?.textContent, logo: !!document.querySelector("#portalLoadingPanel .ps-logo text"),
      card: !!document.querySelector("#portalLoadingPanel .ps-card"), side: getComputedStyle(document.querySelector(".portal-side")).display, text: document.body.innerText }));
    await shot(page2, "portal-loading");
    ok(r.h === "Loading your portal" && r.logo && r.card && r.side === "none", `loading: the sign-in card with the logo, no menu (${r.h})`);
    ok(!/Checking your secure session and access/.test(r.text), "…not the old \"Checking your secure session and access\"");
    // once signed in (the menu shows): the same panel fills the space beside it (approved portal_loading_full_width_v1)
    const inn = await page2.evaluate(() => {
      document.body.dataset.portalAuth = "in";
      const card = document.querySelector("#portalLoadingPanel .ps-card"), main = document.querySelector(".portal-main");
      const vis = (el) => !!el && getComputedStyle(el).display !== "none";
      return { cw: Math.round(card.getBoundingClientRect().width), mw: Math.round(main.getBoundingClientRect().width), logo: vis(document.querySelector("#portalLoadingPanel .ps-logo")),
        text: document.querySelector("#portalLoadingPanel .ps-hd p").innerText.trim(), side: getComputedStyle(document.querySelector(".portal-side")).display };
    });
    await shot(page2, "portal-loading-in");
    ok(inn.cw >= inn.mw - 4 && inn.side !== "none" && !inn.logo, `signed in, loading: the panel fills the space beside the menu (${inn.cw}px of ${inn.mw}), no second logo`);
    ok(inn.text === "Getting your steps, rankings and reports…", `…and says what's loading ("${inn.text}")`);
    await page.close(); await page2.close();
  });

} catch (e) {
  console.log(`⚠️  INDETERMINATE — the walk threw: ${e.message}`);
  await browser.close(); server.close();
  process.exit(2);
}

await browser.close();
server.close();
if (fails) { console.log(`\n🔴 ${fails} check(s) failed — the sign-in page does not do what the approved mockup says.`); process.exit(1); }
console.log("\n✅ the sign-in page behaves: every state of client_login_v3, in a real browser.");
