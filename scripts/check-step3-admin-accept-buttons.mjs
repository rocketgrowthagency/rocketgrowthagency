#!/usr/bin/env node
// check-step3-admin-accept-buttons.mjs — 2026-10-27, Chris on admin row 8 (step3_admin_accept_v1 live): "the white button cant read
// text inside" + "make sure all buttons work". CLICKS every control on the GitHub card in real Chrome, with admin.css, the card's
// own code lifted from admin.js, and a fake server that records each request:
//   · every button and link on the card is READABLE (its words aren't the colour of its own background)
//   · found → Accept and confirm access sends github_accept with that invite's id; "confirmed" → the before-snapshot is taken
//   · Open on GitHub → the repo's /invitations page, a new tab; Open the repo → the repo
//   · none → Check again re-reads (github_check); Ask the client… opens the preview and sends ONLY through send-step-email
//     (kind nudge, step m1.access.website) after Send; Not yet sends nothing
//   · accepted, not their repo → It's the right repo: confirm sends github_confirm
//   · Read only → Ask the client to switch to Write; key not set up → Check again + Confirm access by hand (the manual path)
//   · other builders: Open <builder>'s invite in access@ → Gmail as access@, searched for that builder
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved / no Chrome
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const A = read("admin/admin.js"), CSS = read("admin/admin.css");
const F = [], fail = (m) => F.push(m);
const fn = (name) => { const at = A.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${name} moved`); process.exit(2); }
  let d = 0, i = A.indexOf("{", A.indexOf(")", at)); for (; i < A.length; i++) { if (A[i] === "{") d++; else if (A[i] === "}" && --d === 0) break; } return A.slice(A.lastIndexOf("\n", at) + 1, i + 1); };
const line = (re, what) => { const m = A.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${what} moved`); process.exit(2); } return m[0]; };
const objBlock = (start, what) => { const at = A.indexOf(start); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${what} moved`); process.exit(2); } const end = A.indexOf("\n};\n", at); return A.slice(at, end + 3); };
const hStart = A.indexOf('document.addEventListener("click", async (ev) => {\n  const b = ev.target.closest && ev.target.closest("[data-ob-gh-check]');
if (hStart < 0) { console.error("⚠️  INDETERMINATE — the GitHub card's click handler moved"); process.exit(2); }
const handler = A.slice(hStart, A.indexOf("\n});\n", hStart) + 4);
const code = [line(/^const G_ICON = [^\n]*;$/m, "G_ICON"), line(/^const OB_WEB_TILE = [^\n]*;/m, "OB_WEB_TILE"), line(/^const RGA_ACCESS_GITHUB = "[^"]+";/m, "RGA_ACCESS_GITHUB"),
  line(/^const GH_MONO = [^\n]*;$/m, "GH_MONO"), line(/^const GH_PERM = [^\n]*;$/m, "GH_PERM"), "const ghState = {};",
  fn("adminGoogleCardHtml"), fn("acCardHtml"), fn("acDueChip"), line(/^const acConsent = [^\n]*;$/m, "acConsent"), line(/^const acSite = [^\n]*;$/m, "acSite"), line(/^const GH_DOMAIN = [^\n]*;$/m, "GH_DOMAIN"),
  line(/^const mvDay = [^\n]*;$/m, "mvDay"), line(/^const mvDueDays = [^\n]*;$/m, "mvDueDays"),
  fn("accInviteLinkHtml"), fn("ghLoad"), fn("ghAccessCardHtml"), objBlock("const GH_ASK = {", "GH_ASK"), handler].join("\n");

let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer isn't installed"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const CI = { via: "invite", platform: "custom", files: "github", at: "2026-10-27T02:46:00Z", detected: { host: "netlify", site: "rocketgrowthagency.com" }, consent: { at: "2026-10-27T02:46:00Z", promise: "2026-10-23b" } };
const INV = { id: 991, repo: "rocketgrowthagency/rga-website", inviter: "rocketgrowthagency", permissions: "write", expired: false };
// scenario → what github_check answers (the card's first read), plus the task's stored github_accept
const SCEN = {
  found: { check: { ok: true, state: "found", invites: [INV], checked_at: "2026-10-27T17:20:00Z" } },
  none: { check: { ok: true, state: "none", invites: [], checked_at: "2026-10-27T17:20:00Z" } },
  wrongrepo: { check: { ok: true, state: "none", invites: [], accepted: { repo: "johndev/site-2024", role: "Write", can_change: true, domain: "acme.com", domain_found_in: [], accepted_at: "2026-10-27T17:00:00Z" }, now: { role: "Write", can_change: true }, checked_at: "2026-10-27T17:20:00Z" } },
  readonly: { check: { ok: true, state: "none", invites: [], accepted: { repo: "acme/site", role: "Read", can_change: false, domain: "acme.com", domain_found_in: ["CNAME"], accepted_at: "2026-10-27T17:00:00Z" }, now: { role: "Read", can_change: false }, checked_at: "2026-10-27T17:20:00Z" } },
  nokey: { check: { ok: true, state: "no_key", checked_at: "2026-10-27T17:20:00Z" } },
};
async function open(name) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body style="padding:30px;background:#fff"><div id="host"></div><script>
    window.REQ = []; window.BANNERS = []; window.SNAP = 0; window.DIALOG = null; window.NEXT_DIALOG = "edited text";
    const RGA_ACCESS_ACCOUNT = "access@rocketgrowthagency.com"; const RGA_DIALOG_ALT = Symbol("alt");
    const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); const escapeAttribute = escapeHtml;
    const adminGcardWhen = (x) => String(x || "").slice(0, 16).replace("T", " ");
    const admPlatforms = () => ({ custom: { hosts: { netlify: { name: "Netlify" } } } });
    const movesForSelected = () => [{ owner: "rga", step_id: "m1.access.website", kind: "accept_access", due: new Date().toISOString(), due_today: true, late: false }];
    const state = { selectedClient: { id: ${JSON.stringify(CID)}, business_name: "Rocket Growth Agency", primary_contact_name: "Chris K", primary_contact_email: "rocketgrowthagencyadmin@gmail.com" },
      onboardingData: { tasks: { "m1.access.website": ${JSON.stringify({ status: "in_progress", client_input: CI })} } } };
    const authHeaders = async () => ({ "Content-Type": "application/json" });
    const setBanner = (m, kind) => window.BANNERS.push([typeof m === "string" ? m : m.title, kind]);
    const snapshotTake = async () => { window.SNAP++; return true; };
    const loadStepNudges = async () => {};
    const rgaDialog = async (o) => { window.DIALOG = o; return window.NEXT_DIALOG; };
    const SCEN = ${JSON.stringify(SCEN[name])};
    window.fetch = async (url, init) => { const body = JSON.parse(init && init.body || "{}"); window.REQ.push({ url, body });
      const ans = url.includes("send-step-email") ? { ok: true, to: "rocketgrowthagencyadmin@gmail.com" }
        : body.action === "github_check" ? SCEN.check : body.action === "github_accept" ? { ok: true, state: "confirmed", tasks: {} } : body.action === "github_confirm" ? { ok: true, state: "confirmed", tasks: {} } : { ok: false, error: "unexpected" };
      return { ok: true, status: 200, json: async () => ans }; };
    function renderOnboardingChecklist() { document.getElementById("host").innerHTML = ghAccessCardHtml(state.onboardingData.tasks["m1.access.website"], state.onboardingData.tasks["m1.access.website"].client_input)
      + '<div id="other" class="ob-gq"><div class="ob-gcard-act">' + accInviteLinkHtml({ via: "invite", platform: "wix" }, { name: "Wix" }, "Wix") + '</div></div>'; }
    ${code}
    renderOnboardingChecklist();
  </script></body></html>`, { waitUntil: "load" });
  await page.waitForFunction(() => !/Checking GitHub/.test(document.getElementById("host").textContent), { timeout: 5000 }).catch(() => {});
  return page;
}
const readable = (page, label) => page.evaluate(() => [...document.querySelectorAll("#host a, #host button, #other a")].map((e) => {
  const cs = getComputedStyle(e); return { t: e.textContent.trim(), c: cs.color, bg: cs.backgroundColor, href: e.getAttribute("href"), target: e.getAttribute("target") }; }))
  .then((els) => { for (const e of els) { if (!e.t) fail(`${label}: a control with no words`); if (e.c === e.bg || (e.bg === "rgb(255, 255, 255)" && /rgb\(25[0-5], 25[0-5], 25[0-5]\)/.test(e.c))) fail(`${label}: "${e.t}" can't be read (${e.c} on ${e.bg})`); } return els; });
const clickText = async (page, text) => { const ok = await page.evaluate((t) => { const e = [...document.querySelectorAll("#host button, #host a")].find((x) => x.textContent.trim() === t); if (!e) return false; e.click(); return true; }, text);
  if (!ok) fail(`no "${text}" control to press`); await new Promise((r) => setTimeout(r, 150)); return ok; };
const reqs = (page) => page.evaluate(() => window.REQ);
try {
  // found → Accept and confirm access
  { const p = await open("found"); const els = await readable(p, "invite found");
    const gh = els.find((e) => e.t === "Open on GitHub ↗"); if (!gh || gh.href !== "https://github.com/rocketgrowthagency/rga-website/invitations" || gh.target !== "_blank") fail(`Open on GitHub doesn't open the repo's invitations in a new tab (${gh && gh.href})`);
    const wix = els.find((e) => /invite in access@/.test(e.t)); if (!wix || !/authuser=access%40rocketgrowthagency\.com#search\/wix\+newer_than%3A14d/.test(wix.href)) fail(`the other builders' link isn't access@'s Gmail searched for the builder (${wix && wix.href})`);
    if (!(await p.evaluate(() => /Due today/.test(document.getElementById("host").textContent)))) fail("row 8's card doesn't show the move's promise (Due today) from the open-moves list");
    if (!(await p.evaluate(() => [...document.querySelectorAll("#host .ob-ac-foot button, #host .ob-ac-foot a")].some((e) => e.textContent.trim() === "Accept and confirm access")))) fail("Accept and confirm access isn't inside the card's own footer");
    await clickText(p, "Accept and confirm access");
    const r = (await reqs(p)).find((x) => x.body.action === "github_accept"); if (!r || String(r.body.invitation_id) !== "991" || r.body.client_id !== CID) fail(`Accept and confirm access doesn't send github_accept with the invite's id (${JSON.stringify(r)})`);
    if (await p.evaluate(() => window.SNAP) !== 1) fail("a confirmed accept doesn't take the before-snapshot");
    await p.close(); }
  // none → Check again + Ask the client (Send) + (Not yet)
  { const p = await open("none"); await readable(p, "no invite yet");
    const before = (await reqs(p)).filter((x) => x.body.action === "github_check").length;
    await clickText(p, "Check again"); await new Promise((r) => setTimeout(r, 200));
    if ((await reqs(p)).filter((x) => x.body.action === "github_check").length !== before + 1) fail("Check again doesn't read GitHub again");
    await clickText(p, "Ask the client to check the name"); await new Promise((r) => setTimeout(r, 200));
    const d = await p.evaluate(() => window.DIALOG); if (!d || !/rocketgrowthagency-admin/.test(d.defaultValue || "")) fail("Ask the client doesn't preview a message naming rocketgrowthagency-admin");
    const s = (await reqs(p)).find((x) => x.url.includes("send-step-email")); if (!s || s.body.kind !== "nudge" || s.body.stepId !== "m1.access.website" || s.body.text !== "edited text") fail(`Ask the client doesn't send the EDITED preview as this step's nudge (${JSON.stringify(s && s.body)})`);
    await p.evaluate(() => { window.REQ = []; window.NEXT_DIALOG = null; });
    await clickText(p, "Ask the client to check the name"); await new Promise((r) => setTimeout(r, 200));
    if ((await reqs(p)).some((x) => x.url.includes("send-step-email"))) fail("Not yet still sends the message");
    await p.close(); }
  // accepted, not their repo → confirm
  { const p = await open("wrongrepo"); const els = await readable(p, "not their repo");
    const repo = els.find((e) => e.t === "johndev/site-2024 ↗"); if (!repo || repo.href !== "https://github.com/johndev/site-2024" || repo.target !== "_blank") fail("the accepted repo isn't a link to it (new tab) on the card");
    await clickText(p, "It's the right repo: confirm");
    if (!(await reqs(p)).some((x) => x.body.action === "github_confirm")) fail("It's the right repo: confirm doesn't send github_confirm");
    await p.close(); }
  // read only → ask to switch
  { const p = await open("readonly"); await readable(p, "read only");
    if (!(await p.evaluate(() => /can't make changes/.test(document.body.textContent)))) fail("a Read-only accept doesn't say we can't make changes");
    await clickText(p, "Ask the client to switch to Write"); await new Promise((r) => setTimeout(r, 200));
    const d = await p.evaluate(() => window.DIALOG); if (!d || !/Write/.test(d.defaultValue || "")) fail("Ask the client to switch to Write doesn't preview the Write ask");
    await p.close(); }
  // no key → manual path still there
  { const p = await open("nokey"); const els = await readable(p, "key not set up");
    if (!els.some((e) => e.t === "Confirm access by hand")) fail("without the key there's no Confirm access by hand");
    await clickText(p, "Check again");
    await p.close(); }
} finally { await browser.close(); }
if (F.length) { console.error(`❌ step 3 admin accept buttons — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ step 3 admin accept buttons, clicked in Chrome: every control readable · Accept → github_accept with the invite id → before-snapshot · Open on GitHub → /invitations, new tab · Check again re-reads · Ask the client previews, sends the edited text as this step's nudge, Not yet sends nothing · right repo → github_confirm · Read only → switch-to-Write ask · no key → Confirm by hand · other builders → access@'s Gmail searched for the builder");
