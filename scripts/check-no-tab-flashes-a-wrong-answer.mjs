#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-no-tab-flashes-a-wrong-answer.mjs
//
// 🔴 WHY (2026-09-24). Chris refreshed the client page and screenshotted the first second:
//
//     0 of 9 done · Set up call tracking      ← the OLD curated list, a different data set
//     🔴 Google is not connected yet          ← while the header chip read "Google connected"
//
// …then it repainted to 27 of 59, step 2, Google connected. The product was not slow for that
// second, it was WRONG, and every number on it invited the operator to act. Chris: *"make sure each
// page and each part or tab is working on refresh and not glitch."*
//
// 🔑 Reading the code cannot find this class. The early frame is produced by whatever state happens
// to be null at that instant, across dozens of render paths. The only honest way to know is to LOAD
// each surface and WATCH what it says before its data arrives.
//
// HOW: open every admin tab (and the portal report), sample the visible text a few hundred
// milliseconds in, then again once settled, and compare the CLAIMS. A claim is a sentence that
// asserts a fact an operator could act on — a progress count, a "not connected", a "none yet". If an
// early frame makes a claim the settled frame contradicts, that is a flash of a wrong answer.
//
// 🔑 A surface is allowed to say NOTHING, or to say "loading". It is not allowed to say something
// false and then correct itself.
// → feedback_an_absence_must_never_be_readable_as_a_value · feedback_poll_for_what_the_screen_renders
//
// exit 0 = no tab flashes a wrong answer · 1 = one does · 2 = could not tell (no browser/creds)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.RGA_ADMIN_EMAIL || "rocketgrowthagencyadmin@gmail.com";
const SITE = process.env.FLASH_SITE || "https://www.rocketgrowthagency.com";

const say = (s) => console.log(s);
say("── no tab flashes a wrong answer on refresh ──");

if (!SUPA_URL || !SUPA_KEY) { say("  ⚠️  Supabase credentials not set — cannot sign in."); process.exit(2); }
let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch { say("  ⚠️  puppeteer unavailable — NOT reporting healthy."); process.exit(2); }

const api = async (p, init) => {
  const r = await fetch(`${SUPA_URL}${p}`, { ...init, headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...(init?.headers) } });
  return r.json();
};

let clientId;
try {
  const rows = await api("/rest/v1/clients?archived_at=is.null&select=id&limit=1");
  clientId = rows?.[0]?.id;
} catch { /* handled */ }
if (!clientId) { say("  ⚠️  no active client to open."); process.exit(2); }

let link;
try {
  const j = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }) });
  link = j.action_link || j.properties?.action_link;
} catch { /* handled */ }
if (!link) { say("  ⚠️  could not mint a sign-in link."); process.exit(2); }

// ── what counts as a CLAIM an operator could act on ───────────────────────────────────────────
// Each returns a normalised string when it matches, so early and settled frames can be compared.
const CLAIMS = [
  { id: "progress",      re: /(\d+)\s+of\s+(\d+)\s+done/gi },
  { id: "percent",       re: /Onboarding\s+(\d+)%\s*\((\d+)\/(\d+)\)/gi },
  { id: "notConnected",  re: /(Google is not connected yet|Google not connected)/gi },
  { id: "noContract",    re: /(No contract|Contract not sent)/gi },
  { id: "nextStep",      re: /Step\s+(\d+)\s*·\s*([^\n]{3,60})/gi },
];
const claimsIn = (text) => {
  const out = new Set();
  for (const c of CLAIMS) {
    c.re.lastIndex = 0;
    for (const m of text.matchAll(c.re)) out.add(`${c.id}:${m[0].replace(/\s+/g, " ").trim()}`);
  }
  return out;
};
// A frame that admits it is loading is honest, whatever else it shows.
const admitsLoading = (t) => /loading|…|checking|please wait/i.test(t);

const TABS = ["overview", "mission", "client-setup", "onboarding-v2", "monthlynew", "customer-value", "kpis", "notes", "portal"];

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const problems = [];
let checked = 0;
try {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 120)));

  await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));

  const targets = [
    ...TABS.map((t) => ({ name: `admin:${t}`, url: `${SITE}/admin/?view=client&id=${clientId}&tab=${t}` })),
    { name: "admin:clients", url: `${SITE}/admin/?view=clients` },
    { name: "portal:report", url: `${SITE}/portal/report/?client=${clientId}` },
  ];

  for (const t of targets) {
    // A REAL refresh: go there, then reload, sampling while it comes back.
    await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 4500));      // let it settle once
    const reload = page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const early = [];
    for (const ms of [250, 500, 900, 1400]) {
      await new Promise((r) => setTimeout(r, ms === 250 ? 250 : 250));
      const txt = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      early.push({ ms, txt });
    }
    await reload;
    await new Promise((r) => setTimeout(r, 5500));
    const settledTxt = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (settledTxt.trim().length < 100) continue;       // nothing rendered; other gates own that
    checked++;
    const settled = claimsIn(settledTxt);

    for (const f of early) {
      if (!f.txt || f.txt.trim().length < 100) continue;
      if (admitsLoading(f.txt)) continue;               // honest about not knowing
      for (const claim of claimsIn(f.txt)) {
        if (settled.has(claim)) continue;               // same claim survived — not a flash
        const kind = claim.split(":")[0];
        // Only flag when the settled frame makes a DIFFERENT claim of the same kind. A claim that
        // simply disappears may be a panel that legitimately collapsed.
        const settledSame = [...settled].filter((s) => s.startsWith(`${kind}:`));
        if (!settledSame.length) continue;
        problems.push(`${t.name} — at ${f.ms}ms it said "${claim.split(":").slice(1).join(":")}" `
          + `but it settles on "${settledSame[0].split(":").slice(1).join(":")}". An operator reading `
          + `that first frame would act on a wrong number.`);
      }
    }
  }

  if (errs.length) {
    say(`  ⚠️  ${[...new Set(errs)].length} page error(s) seen while sweeping; first: ${[...new Set(errs)][0]}`);
  }
} finally {
  await browser.close();
}

if (!checked) { say("  ⚠️  no surface rendered enough to judge — cannot tell."); process.exit(2); }

if (problems.length) {
  const uniq = [...new Set(problems)];
  console.error(`🔴 ${uniq.length} SURFACE(S) FLASH A WRONG ANSWER ON REFRESH\n`);
  for (const p of uniq.slice(0, 12)) console.error(`  🔴 ${p}\n`);
  if (uniq.length > 12) console.error(`  … and ${uniq.length - 12} more`);
  console.error("  A surface may render nothing, or say it is loading. It may not state something false.");
  process.exit(1);
}

say(`✅ no wrong answer flashed — ${checked} surface(s) swept, sampled at 250–1400ms against settled`);
