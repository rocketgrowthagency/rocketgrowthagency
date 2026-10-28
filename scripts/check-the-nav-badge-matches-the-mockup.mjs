#!/usr/bin/env node
// check-the-nav-badge-matches-the-mockup.mjs — 2026-10-28. Chris (screenshots 8.20.06 mockup / 8.20.10 live): "can we match live
// to mockup exactly. the circle with number is different. must match mockup". Before, live's To do count was a PALE amber pill with
// amber text, and Setup's was an 18px blue dot right after the word; the mockup (approval_tab_and_sent_card_v1, .nav .bd) is a SOLID
// amber 20px circle, white number, right-aligned.
// Renders the portal's OWN menu markup (portal/index.html) with its OWN stylesheet (portal/portal.css) in Chrome, beside the mockup,
// and compares the badge property by property. Also holds the 10-28 rule "For your approval should never split to 2 lines" (it
// did once, 3px short — project_client_admin_boundary): every menu label stays ONE line with a two-digit badge at 1024 · 1280 ·
// 1440, and on a phone (chips). Offline: no sign-in, no client data. Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR.
// exit 0 holds · 1 differs · 2 can't tell
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const IDX = read("portal/index.html"), CSS = read("portal/portal.css"), MOCK = `${SITE}/reports/mockups/approval_tab_and_sent_card_v1.html`;
if (!fs.existsSync(MOCK)) { console.error("⚠️  INDETERMINATE — the mockup file is gone"); process.exit(2); }
let puppeteer; try { puppeteer = (await import("puppeteer")).default; } catch { console.error("⚠️  INDETERMINATE — puppeteer unavailable"); process.exit(2); }
const shell = (IDX.match(/<div class="portal-shell">[\s\S]*?<\/aside>/) || [])[0];
const font = (IDX.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/) || [""])[0];
if (!shell || !/id="approvalsBadge"/.test(shell)) { console.error("⚠️  INDETERMINATE — the portal menu (with #approvalsBadge) moved"); process.exit(2); }
// the menu as portal.js leaves it: signed in, the To do count showing, Setup's unread dot added the way portal.js adds it
const page = (n) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${font}<style>${CSS}</style></head>
<body data-portal-auth="in">${shell}</div><script>const b=document.getElementById("approvalsBadge");b.hidden=false;b.textContent="${n}";
const s=document.querySelector('.portal-nav a[data-view="setup"]');const d=document.createElement("span");d.className="pm-navdot";d.textContent="${n}";s.appendChild(d);</script></body></html>`;
const F = [], fail = (m) => F.push(m);
const measure = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect(), a = e.closest("a"), ar = a.getBoundingClientRect(), ac = getComputedStyle(a);
  return { bg: c.backgroundColor, color: c.color, h: r.height, w: r.width, minW: c.minWidth, pl: c.paddingLeft, fs: c.fontSize, fw: c.fontWeight, rad: parseFloat(c.borderTopLeftRadius),
    right: Math.round(ar.right - parseFloat(ac.paddingRight) - r.right), mid: Math.round((r.top + r.height / 2) - (ar.top + ar.height / 2)) }; };
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const m = await b.newPage(); await m.setViewport({ width: 1280, height: 900 });
  await m.goto(`file://${MOCK}`, { waitUntil: "networkidle0", timeout: 45000 });
  const want = await m.evaluate(measure, ".nav a.on .bd");
  if (!want) { console.error("⚠️  INDETERMINATE — the mockup's badge (.nav a.on .bd) is gone"); process.exit(2); }
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  await p.setContent(page(5), { waitUntil: "networkidle0", timeout: 45000 });
  for (const [name, sel, sameColour] of [["the To do count", "#approvalsBadge", true], ["Setup's unread count", ".pm-navdot", false]]) {
    const got = await p.evaluate(measure, sel);
    if (!got) { fail(`${name} isn't in the menu`); continue; }
    const cmp = [["height", got.h, want.h], ["min width", got.minW, want.minW], ["side padding", got.pl, want.pl], ["font size", got.fs, want.fs], ["font weight", got.fw, want.fw], ["number colour", got.color, want.color]];
    if (sameColour) cmp.push(["fill", got.bg, want.bg]);
    for (const [k, g, w] of cmp) if (String(g) !== String(w)) fail(`${name}: ${k} is ${g}, the mockup's is ${w}`);
    if (!sameColour && /rgba\(0, 0, 0, 0\)/.test(got.bg)) fail(`${name} has no fill (the mockup's circle is solid)`);
    if (got.rad < got.h / 2) fail(`${name} isn't round (radius ${got.rad}px on a ${got.h}px badge)`);
    if (Math.round(got.w) !== Math.round(got.h)) fail(`${name} with one digit is ${Math.round(got.w)}×${Math.round(got.h)}, not a circle`);
    if (got.right !== 0) fail(`${name} isn't against the right edge of its menu item (${got.right}px short) — the mockup's is`);
    if (Math.abs(got.mid) > 1) fail(`${name} isn't centred on its label (${got.mid}px off)`);
  }
  // ── one line, always ─────────────────────────────────────────────────────────────────────────
  await p.setContent(page(99), { waitUntil: "networkidle0", timeout: 45000 });
  for (const w of [1024, 1280, 1440, 390]) {
    await p.setViewport({ width: w, height: 900 });
    const bad = await p.evaluate(() => [...document.querySelectorAll(".portal-nav a")].filter((a) => { const lh = parseFloat(getComputedStyle(a).lineHeight) || parseFloat(getComputedStyle(a).fontSize) * 1.5;
      const r = document.createRange(); r.selectNodeContents(a); const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0 && x.height > 4).map((x) => Math.round(x.top / (lh * 0.75))));
      return tops.size > 1 || a.scrollWidth > a.clientWidth + 1; }).map((a) => a.textContent.trim()));
    if (bad.length) fail(`at ${w}px wide, with a "99" badge, ${bad.join(" · ")} doesn't fit on one line`);
  }
} finally { await b.close(); }
if (F.length) { console.error(`❌ the menu's number badge doesn't match the approved mockup, or a label wraps — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ the menu's number badges match approval_tab_and_sent_card_v1 (solid circle, white number, 20px, right-aligned, centred; To do in the mockup's amber, Setup's unread in blue) and every menu label stays on one line with a \"99\" badge at 1024 · 1280 · 1440 · phone");
