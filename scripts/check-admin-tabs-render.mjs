#!/usr/bin/env node
/**
 * check-admin-tabs-render.mjs — the admin AND the report it produces must render, signed in.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. Adding one link to the client cockpit used `client.id` inside `renderClientCockpit`,
 * which has no `client` binding — it uses `state.selectedClient`. That threw a ReferenceError and
 * **killed the entire cockpit render**, so the admin client view collapsed to a blank page.
 *
 * 🔴 Nothing caught it. `check-browser-js-parses-as-the-browser-does` passed, because the file parses
 * perfectly — a ReferenceError is a RUNTIME error. `check-app-pages-boot` passed, because it loads
 * pages SIGNED OUT, and signed out the admin is just a login form that renders fine.
 *
 * 🔑 The gap was precisely "signed-in rendering", which had been written down as uncovered twice
 * today and then bit within the hour. This closes it: sign in as the workspace owner with an admin
 * magic link, open a real client, and CLICK EVERY TAB.
 *
 * 🔑 It needs SUPABASE_SERVICE_ROLE_KEY to mint the link. That is why it lives in the daily health
 * check (which sources .env) and not in the deploy path.
 *
 * Exit 0 = every tab renders · 1 = a tab is blank or threw · 2 = could not sign in / no browser.
 */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "hello@rocketgrowthagency.com";   // profiles.role = owner
const SITE = "https://www.rocketgrowthagency.com";
const MIN_CHARS = 40;      // below this a panel is empty, not merely terse

console.log("── every admin tab renders for a signed-in admin ──");

if (!SUPA_URL || !SUPA_KEY) {
  console.log("  ⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot sign in.");
  process.exit(2);
}

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch { console.log("  ⚠️  puppeteer unavailable — NOT reporting healthy."); process.exit(2); }

// A real client to open. Any non-archived one will do; the tabs are what is under test.
let clientId;
try {
  const r = await fetch(`${SUPA_URL}/rest/v1/clients?archived_at=is.null&select=id,business_name&limit=1`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  const rows = await r.json();
  clientId = rows?.[0]?.id;
  if (!clientId) { console.log("  ⚠️  no active client to open — cannot exercise the client view."); process.exit(2); }
} catch (e) { console.log(`  ⚠️  could not read a client: ${e.message}`); process.exit(2); }

// 🔑 generate_link RETURNS the link and does NOT email anyone.
let link;
try {
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
  });
  const j = await r.json();
  link = j.action_link || j.properties?.action_link;
  if (!link) { console.log(`  ⚠️  no sign-in link returned: ${JSON.stringify(j).slice(0, 140)}`); process.exit(2); }
} catch (e) { console.log(`  ⚠️  could not mint a sign-in link: ${e.message}`); process.exit(2); }

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let fails = 0;
try {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 110)));

  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=overview`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 12000));

  const chars = await page.evaluate(() => document.body.innerText.trim().length);
  if (chars < 200) {
    // 🔴 This is the exact symptom the ReferenceError produced. Distinguish it from "not signed in"
    // by whether anything threw — a silent blank page means auth, a thrown page means our code.
    console.log(`  🔴 the admin client view rendered ${chars} characters — effectively blank.`);
    if (errs.length) console.log(`       it threw: ${[...new Set(errs)][0]}`);
    else console.log("       nothing threw, so this is most likely the sign-in, not the code.");
    await browser.close();
    process.exit(errs.length ? 1 : 2);
  }

  const tabs = await page.evaluate(() => [...document.querySelectorAll(".admin-side-tab")].map((t) => t.dataset.tab));
  if (!tabs.length) { console.log("  ⚠️  no tabs found — the probe must be wrong."); await browser.close(); process.exit(2); }

  // 🔑 The CLIENT REPORT is the thing this admin exists to produce, and it is the surface Chris
  // rebuilt today. Checking it in the SAME signed-in session costs one navigation and closes the
  // other half of the gap: the admin renders, but does the document it produces?
  try {
    await page.goto(`${SITE}/portal/report/?client=${clientId}`, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 8000));
    const rep = await page.evaluate(() => ({
      chars: document.body.innerText.trim().length,
      sections: [...document.querySelectorAll("section")].filter((s) => s.offsetParent !== null).length,
      mast: !!document.querySelector(".mast h1"),
    }));
    if (rep.chars < 400 || !rep.mast) {
      console.log(`  🔴 client report rendered ${rep.chars} chars, masthead ${rep.mast ? "present" : "MISSING"} — blank or broken`);
      fails++;
    } else {
      console.log(`  ✅ client report    ${String(rep.chars).padStart(6)} chars · ${rep.sections} sections`);
    }
  } catch (e) { console.log(`  ⚠️  could not load the client report: ${e.message}`); }

  await page.goto(`${SITE}/admin/?view=client&id=${clientId}&tab=overview`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 10000));

  for (const tab of tabs) {
    const before = errs.length;
    await page.evaluate((t) => {
      const btn = [...document.querySelectorAll(".admin-side-tab")].find((x) => x.dataset.tab === t);
      if (btn) btn.click();
    }, tab);
    await new Promise((r) => setTimeout(r, 2200));
    const info = await page.evaluate((t) => {
      const el = document.getElementById("panel-" + t);
      return { exists: !!el, chars: el ? el.innerText.trim().length : -1 };
    }, tab);
    const threw = errs.length - before;

    if (!info.exists) { console.log(`  🔴 ${tab.padEnd(16)} has no panel element`); fails++; }
    else if (info.chars < MIN_CHARS) { console.log(`  🔴 ${tab.padEnd(16)} rendered ${info.chars} chars — blank`); fails++; }
    else if (threw) { console.log(`  🔴 ${tab.padEnd(16)} threw: ${errs.slice(-threw)[0]}`); fails++; }
    else console.log(`  ✅ ${tab.padEnd(16)} ${String(info.chars).padStart(6)} chars`);
  }
} catch (e) {
  console.log(`  ⚠️  the probe could not complete: ${e.message}`);
  await browser.close();
  process.exit(2);
}
await browser.close();

if (fails) {
  console.log(`\n🔴 ${fails} admin tab(s) do not render. A ReferenceError anywhere in a render path`);
  console.log("   takes the whole view down — the file still PARSES, so the parse gate cannot see it.");
  process.exit(1);
}
console.log("\n✅ every admin tab renders for a signed-in admin.");
process.exit(0);
