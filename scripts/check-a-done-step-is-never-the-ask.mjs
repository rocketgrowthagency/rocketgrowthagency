#!/usr/bin/env node
// check-a-done-step-is-never-the-ask.mjs — 2026-10-22, approved done_without_record_all_steps_v1 (Chris walking step 3: "can you find
// all instances of this on all client steps"). An admin tick can finish a client step with NOTHING recorded. Found by simulation:
// steps 1 (empty), 5 ("RGA is on it · building"), 10 (the ask), 11 ("Done" + "Your move"), 12 ("RGA is on it"), 13 (empty).
// 🔑 RUN, IN A BROWSER: signs in to the portal as the walk's test client, every WRITE blocked (acceptance/guard.mjs), rewrites ONLY
// the page's copy of the step record so every client step reads {status: done, completed_by: rga}, and serves THIS repo's
// portal.js / portal.css / shared / client-steps.json (pointable at a copy → APPROVAL_ARCHIVE_SITE_DIR, so the suite can fail it).
// Each done row, minus its toggle, buttons, how-to, conversation and the lock footer, must SAY something, and never the ask.
//   exit 0 holds · 1 a done step shows the ask / nothing · 2 couldn't run (no creds, sign-in failed, no rows)
import fs from "node:fs";
import path from "node:path";
import { classify } from "./acceptance/guard.mjs";
import { WALK_CLIENTS } from "./acceptance/clients.mjs";
const SITE_DIR = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SUPA = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) { console.log("⚠️  INDETERMINATE — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(2); }
const SITE = "https://www.rocketgrowthagency.com", PORTAL = `${SITE}/portal/`;
const WHO = WALK_CLIENTS.main;
const CS = JSON.parse(fs.readFileSync(`${SITE_DIR}/data/playbooks/client-steps.json`, "utf8"));
const IDS = CS.month1.filter((x) => x.clientStepNo != null).map((x) => x.id);
const ASK = /Your move|RGA is on it|Only you can do this step|Do you want call tracking\?|Building your keyword plan|Setting up form tracking/;
let link;
try { const g = await (await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: WHO.email, options: { redirect_to: PORTAL } }) })).json(); link = g.action_link || g.properties?.action_link; } catch { /* below */ }
if (!link) { console.log("⚠️  INDETERMINATE — no sign-in link"); process.exit(2); }
let chromium; try { ({ chromium } = await import("playwright")); } catch { console.log("⚠️  INDETERMINATE — playwright missing"); process.exit(2); }
const browser = await chromium.launch({ headless: true });
const fails = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  // 1) every write blocked (Playwright runs the LAST-registered route first, so this one is added first and FALLS BACK)
  await ctx.route("**/*", (route) => { const q = route.request(); const d = classify(q.url(), q.method(), q.postData(), { supabaseHost: new URL(SUPA).host }); if (!d.allow) return d.stub ? route.fulfill({ status: 204, body: "" }) : route.abort(); return route.fallback(); });
  // 2) THIS repo's code, not the deployed one
  const local = { "/portal/portal.js": "portal/portal.js", "/portal/portal.css": "portal/portal.css", "/data/playbooks/client-steps.json": "data/playbooks/client-steps.json", "/shared/step-lock.js": "shared/step-lock.js" };
  await ctx.route((u) => u.hostname.endsWith("rocketgrowthagency.com") && Object.prototype.hasOwnProperty.call(local, u.pathname), (route) => {
    const p = new URL(route.request().url()).pathname, f = path.join(SITE_DIR, local[p]);
    route.fulfill({ status: 200, contentType: p.endsWith(".css") ? "text/css" : p.endsWith(".json") ? "application/json" : "text/javascript", body: fs.readFileSync(f, "utf8") });
  });
  // 3) the page's copy of the record: every client step done, nothing recorded
  await ctx.route(/\/rest\/v1\/client_onboarding_records/, async (route) => {
    if (route.request().method() !== "GET") return route.abort();
    const res = await route.fetch(); let body; try { body = await res.json(); } catch { return route.fulfill({ response: res }); }
    const rows = Array.isArray(body) ? body : [body];
    for (const r of rows) if (r && r.data && r.data.tasks) for (const id of IDS) r.data.tasks[id] = { status: "done", completed_at: "2026-10-01T17:00:00Z", completed_by: "rga" };
    return route.fulfill({ response: res, json: Array.isArray(body) ? rows : rows[0] });
  });
  const page = await ctx.newPage();
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('.portal-nav a[data-view="setup"]', { timeout: 45000 });
  await page.waitForSelector("#portalLoadingPanel", { state: "hidden", timeout: 45000 });
  await page.evaluate(() => document.querySelector('.portal-nav a[data-view="setup"]')?.click());
  await page.waitForFunction(() => document.querySelectorAll('[id^="step-row-m1."]').length > 0, { timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  const rows = await page.evaluate((ids) => ids.map((id) => {
    const row = document.getElementById(`step-row-${id}`);
    if (!row) return { id, missing: true };
    const pill = (row.querySelector(".pm-step-pills .pm-pill") || {}).textContent?.trim() || "";
    const c = row.cloneNode(true);
    c.querySelectorAll(".pm-step-row-head, button, a.pm-act, .pm-row-actions, .pm-thread, .pm-mails, .pm-m, .pm-detail, .pm-stepmsgs, .pm-lockfoot, input, textarea, select, .pm-msg, details.pm-convo").forEach((x) => x.remove());
    return { id, pill, said: (c.textContent || "").replace(/\s+/g, " ").trim() };
  }), IDS);
  const seen = rows.filter((r) => !r.missing);
  if (!seen.length) { console.log("⚠️  INDETERMINATE — no Month 1 rows rendered"); await browser.close(); process.exit(2); }
  for (const r of seen) {
    if (!/^Done$/i.test(r.pill)) continue;
    const m = r.said.match(ASK);
    if (m) fails.push(`${r.id}: done, but it shows "${m[0]}"`);
    else if (r.said.length < 25) fails.push(`${r.id}: done, and the card says nothing ("${r.said}")`);
  }
  if (seen.filter((r) => /^Done$/i.test(r.pill)).length < Math.min(10, seen.length - 3)) fails.push(`only ${seen.filter((r) => /^Done$/i.test(r.pill)).length} of ${seen.length} rows read Done — the simulation didn't take`);
} finally { await browser.close().catch(() => {}); }
if (fails.length) { console.log("🔴 a done step shows the ask or nothing:"); for (const f of fails) console.log("   · " + f); process.exit(1); }
console.log("✅ every Month 1 client step, done with nothing recorded, shows a record (never the ask, \"RGA is on it\" or an empty card)");
