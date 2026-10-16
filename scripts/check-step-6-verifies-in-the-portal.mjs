#!/usr/bin/env node
// check-step-6-verifies-in-the-portal.mjs — step 6 leads with the Google Business Profile itself and lets the client
// verify by code in the portal, using only the ways Google offers THAT profile; nothing pretends while Google's
// verification API is off; a wrong code says how to fix it; RGA's problems stay RGA's.
//
// 🔒 WHY (approved step6_verify_profile_v1, 2026-10-15). Chris: "I'd like a way to click and link or have verify more
// easier to do." Before: a long how-to sending the client to business.google.com, and the step found out the next
// night. Google is FAKED (deps); the card is drawn in Chrome with the shipped portal.css.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const G = createRequire(`${SITE}/netlify/functions/`)("./_gbp-verify.js");

function fake(routes) {
  const w = { calls: [] };
  w.fetch = async (url, init = {}) => {
    w.calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    const hit = routes.find(([re]) => re.test(url));
    const [status, body] = hit ? hit[1](url, init) : [404, { error: { status: "NOT_FOUND", message: "no route" } }];
    return { ok: status < 300, status, json: async () => body };
  };
  w.deps = { fetch: w.fetch, token: "tok", loc: "locations/1" };
  return w;
}
const OFF = [403, { error: { status: "PERMISSION_DENIED", message: "My Business Verifications API has not been used in project 1 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } }];
const FACTS = (verified) => [/mybusinessbusinessinformation.*readMask=title,phoneNumbers,metadata/, () => [200, { title: "Rocket Growth Agency", phoneNumbers: { primaryPhone: "(424) 242-2040" }, metadata: { hasVoiceOfMerchant: verified, mapsUri: "https://maps.google.com/maps?cid=1" } }]];

// ── 1 · the module ──
{
  const w = fake([[/fetchVerificationOptions/, () => OFF]]);
  const o = await G.options(w.deps);
  if (o.available !== false) fail("with Google's verification API off, the portal is still offered methods it can't use");
}
{
  const w = fake([
    [/fetchVerificationOptions/, () => [200, { options: [{ verificationMethod: "EMAIL", emailData: { user: "ch•••", domain: "rocketgrowthagency.com" } }, { verificationMethod: "SMS", phoneNumber: "(424) 242-2040" }, { verificationMethod: "ADDRESS" }, { verificationMethod: "SOMETHING_NEW" }] }]],
    [/\/verifications$/, () => [200, { verifications: [{ name: "locations/1/verifications/9", method: "ADDRESS", state: "PENDING", createTime: "2026-10-12T16:10:00Z" }] }]],
  ]);
  const o = await G.options(w.deps);
  const m = o.options.map((x) => x.method).join(",");
  if (m !== "SMS,EMAIL,ADDRESS") fail(`the ways aren't Google's own, fastest first, unknown ones dropped (${m})`);
  if (!/\(424\) 242-2040/.test(o.options[0].label) || !/rocketgrowthagency\.com/.test(o.options[1].label)) fail("a way doesn't name where the code goes");
  if (o.pending?.name !== "locations/1/verifications/9") fail("a code already asked for (a postcard on its way) isn't found");
}
{
  const w = fake([[/:verify$/, (u, i) => [200, { verification: { name: "locations/1/verifications/5", method: JSON.parse(i.body).method, state: "PENDING" } }]]]);
  const s = await G.start(w.deps, "SMS", { phone: "(424) 242-2040" });
  if (s.verification?.name !== "locations/1/verifications/5" || w.calls[0]?.body?.phoneNumber !== "(424) 242-2040") fail("asking for a text code doesn't send Google the method and the number");
  const bad = await G.start(w.deps, "VETTED_PARTNER");
  if (!bad.error || w.calls.length !== 1) fail("a way that has no code was sent to Google as one");
}
{
  const w = fake([[/:complete$/, () => [200, {}]], FACTS(true)]);
  const letters = await G.complete(w.deps, "locations/1/verifications/5", "12ab");
  if (!letters.error || letters.who !== "client" || !letters.fix || w.calls.length) fail("a code with letters reached Google, or came back without how to fix it");
  const ok = await G.complete(w.deps, "locations/1/verifications/5", "481 902");
  if (!ok.verified || w.calls[0]?.body?.pin !== "481902") fail("a right code doesn't verify (spaces must be ignored), or the profile isn't read back");
  const wrong = await G.complete(fake([[/:complete$/, () => [400, { error: { status: "INVALID_ARGUMENT", message: "Invalid pin." } }]]]).deps, "locations/1/verifications/5", "111111");
  if (wrong.who !== "client" || !/didn't match/.test(wrong.said || "") || !wrong.fix || /Invalid pin/.test(wrong.said)) fail("a wrong code doesn't say so in plain words with how to fix it");
  const perm = await G.complete(fake([[/:complete$/, () => [403, { error: { status: "PERMISSION_DENIED", message: "Invalid pin request: the caller does not have permission" } }]]]).deps, "locations/1/verifications/5", "111111");
  if (perm.who !== "rga") fail("a permission refusal is handed to the client");
}

// ── 2 · the endpoint ──
const ep = read("netlify/functions/portal-gbp-verify.js").replace(/^[ \t]*\/\/.*$/gm, "");
if (!/const gate = action === "status" \? await requirePortalOwnerOrWorkspace\(event, clientId\) : await requirePortalOwner\(event, clientId\);/.test(ep)) fail("someone other than the client can ask Google for a code or enter one");
if (!/function publicOf\(r\) \{\s*if \(r\.who === "client"\)/.test(ep) || /said: r\.error/.test(ep.replace(/said: r\.said \|\| r\.error/, ""))) fail("Google's raw text can reach the client");
if (!/portal-step-recheck[\s\S]{0,200}step_id: "m1\.gbp\.verify"/.test(ep)) fail("a completed verification doesn't settle the step now");

// ── 3 · the portal ──
const portal = read("portal/portal.js"), pc = portal.replace(/^[ \t]*\/\/.*$/gm, "");
if (!/loadGbpVerify\(clientId\);/.test(pc) || !/step\.id === "m1\.gbp\.verify" && !month2Only \? `<div class="pm-gv" data-gbp-verify/.test(pc)) fail("step 6 doesn't lead with the profile card");
if (!/mech === "detected" && evidence && step\.id !== "m1\.gbp\.verify"/.test(pc)) fail("step 6 still prints the grey evidence line beside the card");
// 🔑 start at the BODY's brace (") {"): a default parameter like `opts = {}` has braces of its own
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf(") {", m.index) + 2; k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const lifted = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), line("GV_STORE"), pick(/^function gvProfileHtml\(/m), pick(/^function googleCardHtml\(/m), line("GOOGLE_G"), pick(/^function gvGoogleRouteHtml\(/m), pick(/^function gvOptionsHtml\(/m)];
if (lifted.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step-6 helper moved (${lifted.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: read("portal/portal.css") });
  await page.addScriptTag({ content: lifted.join("\n") });
  const r = await page.evaluate(() => {
    const h = document.getElementById("h");
    const f = { title: "Rocket Growth Agency", phone: "(424) 242-2040", mapsUri: "https://maps.google.com/maps?cid=1" };
    h.innerHTML = gvProfileHtml(f, "yes", "✓ Verified by Google", [["Checked", "Oct 15, 9:40 AM"]]);
    const yes = { text: h.innerText.replace(/\s+/g, " ").trim(), maps: h.querySelector(".gcard-maps")?.getAttribute("href"), recheck: !!h.querySelector('.gcard-act [data-step-recheck="m1.gbp.verify"]'), how: !!h.querySelector('.gcard-meta [data-gcard-how="m1.gbp.verify"]'), card: h.firstElementChild?.className };
    h.innerHTML = gvOptionsHtml([{ method: "EMAIL", label: "Email a code to x@y.com", sub: "s", code: true }, { method: "SMS", label: "Text", sub: "s", code: true }]);
    const emailFirst = { fastest: !!h.querySelector("em"), sel: h.querySelector(".pm-gv-m.sel")?.getAttribute("data-gv-method"), google: h.querySelector('a[href="https://business.google.com/"]') ? 1 : 0, codeHidden: h.querySelector("[data-gv-code]")?.hidden };
    h.innerHTML = gvOptionsHtml([{ method: "SMS", label: "Text a code to (424) 242-2040", sub: "s", code: true }]);
    const smsFirst = !!h.querySelector("em");
    h.innerHTML = gvProfileHtml({ ...f, title: '<img src=x onerror="window.__x=1">' }, "no", "Not verified yet");
    return { yes, emailFirst, smsFirst, x: window.__x || 0 };
  });
  // 🔒 one_google_card_v1: the one Google card, green; Checked + Maps + "How verification works" in its bottom line, "Check again" top-right
  if (!/^✓ Verified by Google Google Business Profile Business Rocket Growth Agency Phone on the profile \(424\) 242-2040 Checked Oct 15, 9:40 AM · See it on Google Maps ↗ · How verification works Check again$/i.test(r.yes.text) || r.yes.maps !== "https://maps.google.com/maps?cid=1") fail(`the verified card isn't the profile + See it on Google Maps (${r.yes.text})`);
  if (r.yes.card !== "gcard ok" || !r.yes.recheck || !r.yes.how) fail(`the verified card isn't the one green Google card with Check again + How verification works (${JSON.stringify(r.yes)})`);
  if (r.emailFirst.fastest || r.emailFirst.sel !== "EMAIL" || !r.emailFirst.google || r.emailFirst.codeHidden !== true) fail(`the ways to verify are drawn wrong (${JSON.stringify(r.emailFirst)})`);
  if (!r.smsFirst) fail("a text code isn't marked Fastest");
  if (r.x) fail("the profile's name became HTML");
} finally { await browser.close(); }

if (F.length) { console.error("🔴 step 6 doesn't verify the way it was approved:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 6 leads with the profile (verified card + See it on Google Maps), offers only Google's own ways for THIS profile (none while the API is off), sends the code and verifies it in the portal (spaces ignored, letters refused before Google), a wrong code says how to fix it, RGA's problems stay RGA's, and a completed verification settles the step now");
