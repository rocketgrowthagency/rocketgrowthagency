#!/usr/bin/env node
// check-admin-see-what-client-sees.mjs — approved admin_see_what_client_sees_v1 + admin_recommended_fixes_v1 item 3 (Nov 1). File-only: no network, no database, no browser.
// The guard and the read function are RUN here, against stub windows and a stub fetch. That proves their logic, not a browser: the owner's browser test after the deploy proves that.
// HOLDS: nothing in the admin's "See what the client sees" look can run as the client, read past its list, or draw a guess.
//   1. neutralize() leaves no button, link, form, field, script, data-* hook, on* handler, href or action, whatever it is fed; every result the admin shows passes through it.
//   2. the shown card sits in a sandboxed iframe with no scripts / forms / navigation, around an inert body, under the approved lock line.
//   3. the admin's code: only on press, one at a time, spinner on the control, no fetch of its own, never a route that can act as the client.
//   4. the render frame: removed on every outcome; takes messages only from itself with the nonce; can't reach forms, popups or the admin's page.
//   5. the guard: first script on the page; asleep without the flag and the admin's frame; reroutes reads; refuses every write; storage in memory; fails closed on a refused or failed call.
//   6. the portal's boot: every preview branch is guarded, and the client's own boot lines are all still there.
//   7. the read function: staff check, forced client filter, allow-list, no secret, no write smuggled through a read; its columns match the portal's loaders.
//   8. the client-only functions: their auth is pinned, line for line. None gained a staff branch.
//   9. every numbered client step has a card entry, and a step that can't be drawn says "Preview not available".
//  10. the client card is drawn by ONE function: portal.js uses the kit's blogCardHtml, and the kit's primitives equal portal.js's word for word.
// exit 0 = holds · 1 = broken · 2 = can't tell
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const adm = read("admin/admin.js"), portal = read("portal/portal.js"), kit = read("shared/client-card-kit.js"), prev = read("shared/client-preview.js"), guardSrc = read("shared/preview-guard.js"), index = read("portal/index.html"), fnSrc = read("netlify/functions/admin-preview-read.js");
const F = []; const fail = (m) => F.push(m);
const noComments = (t) => t.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
// load the two shared modules from a temp dir (their imports are browser paths)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cv-gate-"));
fs.writeFileSync(path.join(tmp, "client-card-kit.mjs"), kit);
fs.writeFileSync(path.join(tmp, "client-preview.mjs"), prev.replace(/from "\/shared\/client-card-kit\.js[^"]*"/, 'from "./client-card-kit.mjs"'));
let P, K;
try { P = await import(path.join(tmp, "client-preview.mjs")); K = await import(path.join(tmp, "client-card-kit.mjs")); } catch (e) { console.error("INDETERMINATE: the shared modules do not load: " + e.message); process.exit(2); }
const ACTS = [[/<button\b/i, "a button"], [/<a\b/i, "a link"], [/<form\b/i, "a form"], [/<(input|select|textarea)\b/i, "a field"], [/<script\b/i, "a script"],
  [/\sdata-[\w-]+/i, "a data- hook"], [/\son[a-z]+\s*=/i, "an event handler"], [/\shref\s*=/i, "an href"], [/\s(form)?action\s*=/i, "an action"], [/\stabindex\s*=/i, "a tab stop"], [/<iframe\b|<object\b|<embed\b/i, "an embed"]];
const acts = (html) => ACTS.filter(([re]) => re.test(html)).map(([, n]) => n);
const unescape = (t) => String(t).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const srcdocOf = (html) => { const m = /srcdoc="([^"]*)"/.exec(html); return m ? unescape(m[1]) : ""; };

// ─── 1. the scrub ──────────────────────────────────────────────────────────────────────────────────
const hostile = [
  `<button type="button" class="x" data-blog-off onclick="steal()">Say no</button>`,
  `<a href="javascript:go()" data-portal-goto="x" target="_blank">go</a>`,
  `<form action="/.netlify/functions/portal-step-recheck"><input name="a" value="1"><select><option>1</option></select><textarea>t</textarea><button>Send</button></form>`,
  `<div onclick="x()" data-cs-how tabindex="0" role="button" contenteditable="true">hi</div><script>alert(1)</script>`,
  `<BUTTON DATA-SAVE="1" ONCLICK='x()'>Caps</BUTTON><A HREF=http://x>caps</A><INPUT TYPE=text>`,
  `<button\n data-a="1"\n>multi\nline</button><iframe src="x"></iframe><object data="y"></object>`,
  `<span class="pm-amend" onmouseover=evil()>text</span><img src=x onerror=evil()>`,
];
for (const h of hostile) { const out = P.neutralize(h); const bad = acts(out); if (bad.length) fail(`neutralize left ${bad.join(", ")} in: ${h.slice(0, 50).replace(/\n/g, " ")}`); }
if (!/hi/.test(P.neutralize(hostile[3]))) fail("neutralize deleted the words, not just the actions");
if (!/Maria/.test(P.neutralize(`<input type="text" value="Maria" data-x>`))) fail("neutralize dropped a value the client typed (the card would read as blank)");
if (/secret/.test(P.neutralize(`<input type="hidden" value="secret">`))) fail("neutralize shows a hidden field's value");
// a real-shaped row, through the one function the admin shows results with
const row = `<div class="pm-step-row pm-cs cs-you" id="step-row-m1.gbp.booking_link"><div class="pm-step-row-head" data-step-toggle="m1.gbp.booking_link" role="button" tabindex="0" aria-expanded="true"><strong class="pm-step-title">Add your booking link</strong></div><form data-step-input><input value="https://example.com/book" name="v"><button class="pm-act is-go" data-save>Save my choice</button></form><a class="pm-link" href="/portal/#x" data-portal-goto="x">Go</a></div>`;
const shown = P.lookResultHtml("m1.gbp.booking_link", { ok: true, html: row, at: Date.parse("2026-11-01T22:14:00Z") }, "/portal/portal.css");
const shownDoc = srcdocOf(shown), shownBody = shownDoc.slice(shownDoc.indexOf("<body"));
{ const bad = acts(shownBody); if (bad.length) fail(`a drawn card reaches the admin carrying ${bad.join(", ")}: neutralize did not run on it`); }
if (!/Add your booking link/.test(shownBody) || !/Save my choice/.test(shownBody)) fail("the scrubbed card lost the client's words");
// the kit's preview drawing, still scrub-proof in every state
const states = [
  { state: "pages_first", title: "Your website posts", side: "pages come first", rows: [{ label: "Page for Drain cleaning", value: "Not yet", sub: "x" }, { label: "Posts", value: "Waiting", sub: "y" }], note: "n", action: "off", actionLabel: "Say no to posts" },
  { state: "ready", title: "Your website posts", side: "up to 2 a month", rows: [{ label: "Posts", value: "Up to 2 a month", sub: "z" }], note: "n", action: "off", actionLabel: "Say no to posts" },
  { state: "off", title: "Your website posts: off", side: "you decided Nov 3", rows: [], note: "n", action: "on", actionLabel: "Turn posts back on" },
  { state: "not_set_up", title: "Your website posts", side: "", rows: [], note: "n", action: null },
];
for (const card of states) {
  const drawn = K.blogCardHtml({ ok: true, card }, { preview: true });
  if (/<button\b|data-blog-/.test(drawn)) fail(`${card.state}: the kit's preview drawing has a button`);
  const bad = acts(P.neutralize(K.blogCardHtml({ ok: true, card }))); if (bad.length) fail(`${card.state}: the real posts card, scrubbed, still carries ${bad.join(", ")}`);
}

// ─── 2. the shown frame ────────────────────────────────────────────────────────────────────────────
const iframe = P.previewIframeHtml("<p>x</p>", "/portal/portal.css");
const sb = (iframe.match(/sandbox="([^"]*)"/) || [])[1];
if (sb === undefined) fail("the preview iframe has no sandbox");
else if (/allow-scripts|allow-forms|allow-top-navigation|allow-popups|allow-modals/.test(sb)) fail(`the preview sandbox allows ${sb}`);
if (!/<body[^>]*\binert\b/.test(P.previewDocument("<p>x</p>", "/c.css"))) fail("the preview body is not inert");
if (!/<b>Read only\.<\/b> This is the client's card as of \d{1,2}:\d{2}\s?[AP]M\. Nothing here can be pressed\./.test(shown.replace(/ /g, " "))) fail("the approved lock line is gone or changed");
if (/as of/.test(P.lookResultHtml("m1.gbp.booking_link", { ok: false, why: "timeout" }, "/c.css"))) fail('a look that drew nothing still claims "this is the client\'s card"');

// ─── 3. the admin's code ───────────────────────────────────────────────────────────────────────────
const a0 = adm.indexOf("// CV-PREVIEW-START"), a1 = adm.indexOf("// CV-PREVIEW-END");
if (a0 < 0 || a1 < a0) { console.error("INDETERMINATE: the preview block markers are gone from admin.js"); process.exit(2); }
const block = noComments(adm.slice(a0, a1));
if (/portal-step-recheck|portal-google-consent|portal-core-change|core-change|portal-booking|kickoff-book|portal-book-kickoff|portal-step-input|portal-step-choice|portal-photo|portal-social/.test(block)) fail("the preview code names a route that can act as the client");
if (/\bfetch\(/.test(block)) fail("the admin's preview code makes a call of its own");
if ((adm.match(/\blookAtClientCard\(/g) || []).length !== 1) fail("a look starts from somewhere other than the one press");
const clickAt = block.indexOf('document.addEventListener("click"'), lookAt = block.indexOf("lookAtClientCard(");
if (clickAt < 0 || lookAt < clickAt) fail("a look can start outside the click handler (it must never run on page load)");
if (!/closest\("\[data-cv-open\]"\)/.test(block)) fail("the look does not start from the link's press");
if (!/if \(_cvLooking\) \{[^\n]*return; \}/.test(block) || !/_cvLooking = true;/.test(block) || !/_cvLooking = false;/.test(block)) fail("two looks can run at once");
if (!/b\.classList\.add\("is-busy"\)/.test(block) || !/b\.classList\.remove\("is-busy"\)/.test(block)) fail("the control does not spin during a look");
if (!/host\.innerHTML = lookResultHtml\(stepId, result,/.test(block)) fail("the admin shows a look's result some other way than lookResultHtml (the scrub)");
if (/\.innerHTML\s*=\s*[^;]*\bresult\.html\b/.test(block)) fail("the admin puts a look's raw html into the page");
if (!/hasOwnProperty\.call\(CLIENT_CARDS, stepId\)/.test(block)) fail("a look starts for a step with no client card");
if (/<script[^>]*preview-guard/.test(read("admin/index.html"))) fail("the guard is loaded on the admin page");

// ─── 4. the render frame, run ──────────────────────────────────────────────────────────────────────
function stubAdmin() {
  const listeners = new Set(), frames = [];
  const win = { location: { origin: "https://site.test" }, crypto, clearTimeout, setTimeout: (f) => { win._timeout = f; return 1; },
    addEventListener: (t, f) => { if (t === "message") listeners.add(f); }, removeEventListener: (t, f) => { if (t === "message") listeners.delete(f); },
    document: { body: { appendChild: (f) => { frames.push(f); f.isIn = true; } }, createElement: () => {
      const frame = { attrs: {}, style: {}, isIn: false, loads: [], sent: [], contentWindow: { postMessage: (m, o) => frame.sent.push([m, o]) },
        setAttribute: (k, v) => { frame.attrs[k] = v; }, addEventListener: (t, f) => { if (t === "load") frame.loads.push(f); }, remove: () => { frame.isIn = false; } };
      return frame; } } };
  return { win, frames, listeners, emit: async (e) => { for (const f of [...listeners]) await f(e); } };
}
const within = (p, ms = 1500) => Promise.race([p, new Promise((r) => setTimeout(() => r({ ok: false, why: "hung", hung: true }), ms))]);
const nonceOf = (fr) => new URLSearchParams(String(fr.attrs.src).split("?")[1]).get("rga_nonce");
{
  const s = stubAdmin(); const token = "staff-jwt";
  const p = P.lookAtClientCard({ win: s.win, clientId: "c", stepId: "m1.gbp.verify", getToken: async () => token });
  const fr = s.frames[0];
  if (!fr) fail("a look does not create its render frame");
  else {
    const sand = fr.attrs.sandbox || "";
    if (!/allow-scripts/.test(sand) || !/allow-same-origin/.test(sand)) fail("the render frame cannot run the portal");
    if (/allow-forms|allow-top-navigation|allow-popups|allow-modals/.test(sand)) fail(`the render frame may reach ${sand}`);
    if (/display:\s*none/.test(fr.style.cssText)) fail("the render frame is display:none: the portal's animation frames would never run");
    if (!/opacity:0/.test(fr.style.cssText) || !/pointer-events:none/.test(fr.style.cssText)) fail("the render frame can be seen or pressed");
    if (!/^\/portal\/\?rga_preview=/.test(fr.attrs.src || "")) fail("the render frame is not the real portal page with the flag");
    const n = nonceOf(fr), src = fr.contentWindow, origin = s.win.location.origin;
    await s.emit({ source: {}, origin, data: { type: "rga-preview-hello", nonce: n } });
    if (fr.sent.length) fail("the staff login was handed to a message that did not come from the render frame");
    await s.emit({ source: src, origin: "https://evil.test", data: { type: "rga-preview-hello", nonce: n } });
    if (fr.sent.length) fail("the staff login was handed to another origin");
    await s.emit({ source: src, origin, data: { type: "rga-preview-hello", nonce: "wrong" } });
    if (fr.sent.length) fail("the staff login was handed to the wrong nonce");
    await s.emit({ source: src, origin, data: { type: "rga-preview-hello", nonce: n } });
    if (!fr.sent.length || fr.sent[0][0].token !== token || fr.sent[0][1] !== origin) fail("the render frame did not get the staff login, or it went to any origin");
    await s.emit({ source: {}, origin, data: { type: "rga-preview-result", nonce: n, ok: true, html: "<b>forged</b>" } });
    if (!fr.isIn) fail("a result from outside the frame was accepted");
    await s.emit({ source: src, origin, data: { type: "rga-preview-result", nonce: n, ok: true, html: "<p>card</p>", at: 5 } });
    const res = await within(p);
    if (!res.ok || res.html !== "<p>card</p>") fail("a look does not return the drawn row");
    if (fr.isIn) fail("the render frame is not removed after a drawn card");
    if (s.listeners.size) fail("the look leaves its message listener behind");
  }
}
for (const [name, act] of [["a timeout", (s) => s.win._timeout()], ["a refused look", (s, fr) => s.emit({ source: fr.contentWindow, origin: s.win.location.origin, data: { type: "rga-preview-result", nonce: nonceOf(fr), ok: false, why: "refused", refused: ["x"] } })],
  ["the page leaving", (s, fr) => { fr.loads[0](); fr.loads[0](); }]]) {
  const s = stubAdmin();
  const p = P.lookAtClientCard({ win: s.win, clientId: "c", stepId: "m1.gbp.verify", getToken: async () => "t" });
  const fr = s.frames[0];
  await act(s, fr);
  const res = await within(p);
  if (res.hung) fail(`${name} never ended the look`);
  if (res.ok) fail(`${name} still drew a card`);
  if (fr.isIn) fail(`the render frame is not removed after ${name}`);
  if (!/Preview not available/.test(P.lookResultHtml("m1.gbp.verify", res, "/c.css"))) fail(`${name} does not say "Preview not available"`);
}
{
  const s = stubAdmin();
  const p = P.lookAtClientCard({ win: s.win, clientId: "c", stepId: "m1.gbp.verify", getToken: async () => "" });
  const fr = s.frames[0];
  await s.emit({ source: fr.contentWindow, origin: s.win.location.origin, data: { type: "rga-preview-hello", nonce: nonceOf(fr) } });
  const res = await within(p);
  if (res.ok || fr.isIn) fail("a look with no staff login did not end, or left its frame");
}

// ─── 5. the guard ──────────────────────────────────────────────────────────────────────────────────
{
  const firstScript = /<script\b[^>]*>/i.exec(index);
  if (!firstScript || !/src="\/shared\/preview-guard\.js/.test(firstScript[0])) fail("the guard is not the first script on the portal page");
  else if (/\b(defer|async|type=)/i.test(firstScript[0])) fail("the guard is deferred: portal code could run before it");
  if (index.indexOf("preview-guard.js") > index.indexOf("/portal/portal.js")) fail("portal.js loads before the guard");
  if (/^\s*(import|export)\s/m.test(guardSrc)) fail("the guard has a module import or export: it must run as a plain script, before modules");
}
const CID = "11111111-2222-3333-4444-555555555555", OTHER = "99999999-2222-3333-4444-555555555555", ORIGIN = "https://site.test";
function runGuard({ search, parent = "admin", answers = {} } = {}) {
  const calls = [], posted = [], intervals = [], clock = { t: 1000 };
  const realStore = new Map();
  class Storage { setItem(k, v) { realStore.set(k, v); } removeItem(k) { realStore.delete(k); } clear() { realStore.clear(); } getItem(k) { return realStore.has(k) ? realStore.get(k) : null; } }
  const realLocal = new Storage();
  const realFetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/.netlify/functions/admin-preview-read")) {
      const b = JSON.parse(init.body);
      const a = answers[b.read];
      if (a) return new Response(JSON.stringify(a.out), { status: a.status || 200 });
      if (b.read === "tables") return new Response(JSON.stringify({ ok: true, status: 200, body: { tables: { clients: [{ id: CID }], client_photos: [], client_onboarding_records: [] }, failed: [] } }));
      return new Response(JSON.stringify({ ok: true, status: 200, body: { ok: true, read: b.read } }));
    }
    return new Response("{}", { status: 200 });
  };
  const msgListeners = [];
  const row = { outerHTML: '<div id="step-row-m1.gbp.verify">card</div>', hosts: new Set(), classList: { remove: () => {} }, querySelector: (sel) => (row.hosts.has(sel) ? {} : null), matches: () => false,
    cloneNode: () => ({ classList: { remove: (c) => { row.removed = c; } }, querySelector: () => null, outerHTML: row.outerHTML }) };
  const doc = { rows: {}, dashHidden: false, head: { appendChild: (m) => { doc.meta = m; } }, documentElement: {}, createElement: () => ({}),
    getElementById: (id) => (id === "portalDashboard" ? { hidden: doc.dashHidden } : doc.rows[id] || null) };
  const parentWin = parent === "admin" ? { location: { origin: ORIGIN, pathname: "/admin/" }, postMessage: (m, o) => posted.push([m, o]) }
    : parent === "other-page" ? { location: { origin: ORIGIN, pathname: "/portal/report/" }, postMessage: (m) => posted.push([m]) }
    : parent === "foreign" ? { get location() { throw new Error("cross-origin"); }, postMessage: (m) => posted.push([m]) } : null;
  const win = { location: { search: search == null ? `?rga_preview=${CID}&rga_step=m1.gbp.verify&rga_nonce=abcdef0123456789`: search, origin: ORIGIN, href: `${ORIGIN}/portal/` },
    URLSearchParams, URL, Headers, Response, Request, fetch: realFetch, localStorage: realLocal, sessionStorage: new Storage(), Storage, navigator: {}, document: doc,
    history: { replaceState: () => {}, pushState: () => { win.pushed = true; } }, XMLHttpRequest: function NativeXHR() {}, WebSocket: function NativeWS() {}, EventSource: function NativeES() {}, open: () => ({}),
    setTimeout: (f) => { setTimeout(f, 0); return 1; }, setInterval: (f) => { intervals.push(f); return 1; }, addEventListener: (t, f) => { if (t === "message") msgListeners.push(f); } };
  win.parent = parentWin || win;
  const ctx = vm.createContext({ window: win, console: { warn: () => {}, error: () => {} }, Promise, JSON, Map, Array, Object, String, Date: { now: () => clock.t }, Math, RegExp, Error });
  vm.runInContext(guardSrc, ctx, { filename: "preview-guard.js" });
  const sendMsg = (e) => msgListeners.forEach((f) => f(e));
  const giveToken = (token = "staff-jwt") => sendMsg({ source: win.parent, origin: ORIGIN, data: { type: "rga-preview-token", nonce: "abcdef0123456789", token } });
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const tick = async (ms = 900) => { clock.t += ms; intervals.forEach((f) => f()); await settle(); };
  const result = () => posted.map(([m]) => m).find((m) => m.type === "rga-preview-result") || null;
  return { win, calls, posted, realFetch, realLocal, realStore, doc, row, giveToken, sendMsg, settle, tick, result };
}
// asleep for every normal load
for (const [name, opts] of [["no flag", { search: "" }], ["a client's normal page with other params", { search: "?paid=1" }], ["the flag on a typed URL (no frame)", { parent: "none" }],
  ["the flag in a foreign frame", { parent: "foreign" }], ["the flag in a same-origin frame that is not the admin", { parent: "other-page" }],
  ["a flag with a bad client id", { search: "?rga_preview=../x&rga_step=m1.gbp.verify&rga_nonce=abcdef0123456789" }]]) {
  const g = runGuard(opts);
  if (g.win.fetch !== g.realFetch) fail(`${name}: the guard replaced fetch (normal boot must be untouched)`);
  if (g.win.localStorage !== g.realLocal) fail(`${name}: the guard touched storage`);
  if (g.win.__rgaClientPreview) fail(`${name}: the preview is switched on`);
  if (g.posted.length) fail(`${name}: the guard talked to a parent`);
}
// awake: reads go to the staff function, carrying the staff login, and nowhere else
const J = { "Content-Type": "application/json", Authorization: "Bearer preview" };
const post = (b) => ({ method: "POST", headers: J, body: JSON.stringify(b) });
const FN = "/.netlify/functions/";
const READ_OK = [
  [`${FN}portal-open-moves?client_id=${CID}`, { headers: J }, "portal-open-moves"],
  [`${FN}portal-step-waits?client_id=${CID}`, { headers: J }, "portal-step-waits"],
  [`${FN}kickoff-availability?client_id=${CID}&purpose=m1_close`, { headers: J }, "kickoff-availability"],
  [`${FN}portal-thread`, post({ client_id: CID }), "portal-thread"],
  [`${FN}portal-get-contracts`, post({ client_ids: [CID] }), "portal-get-contracts"],
  [`${FN}portal-get-audit-snapshot`, post({ client_ids: [CID] }), "portal-get-audit-snapshot"],
  [`${FN}portal-gbp-profile`, post({ client_id: CID, step_id: "m1.gbp.verify" }), "portal-gbp-profile"],
  [`${FN}portal-gbp-verify`, post({ client_id: CID, action: "status" }), "portal-gbp-verify"],
];
{
  const g = runGuard(); g.giveToken();
  if (g.win.fetch === g.realFetch) fail("the guard did not replace fetch");
  if (!g.win.__rgaClientPreview || !Object.isFrozen(g.win.__rgaClientPreview)) fail("the preview flag object is missing or can be changed from outside");
  for (const [u, init, name] of READ_OK) {
    const before = g.calls.length;
    const r = await g.win.fetch(u, init);
    const j = await r.json().catch(() => ({}));
    const c = g.calls.slice(before);
    if (c.length !== 1 || !c[0].url.endsWith("/admin-preview-read")) fail(`${name}: not rerouted to admin-preview-read (${c.map((x) => x.url).join(" ")})`);
    else {
      const b = JSON.parse(c[0].init.body);
      if (b.read !== name || b.client_id !== CID) fail(`${name}: rerouted as the wrong read or client`);
      if (c[0].init.headers.Authorization !== "Bearer staff-jwt") fail(`${name}: the reroute does not carry the staff login`);
    }
    if (j.read !== name) fail(`${name}: the answer does not reach the portal`);
  }
  // one look, one snapshot
  const n = g.calls.length; await g.win.fetch(`${FN}portal-thread`, post({ client_id: CID }));
  if (g.calls.length !== n) fail("the same read is sent twice in one look");
  // a table read comes from the staff read, for this client
  const t = await g.win.fetch(`https://db.test/rest/v1/clients?select=id&id=eq.${CID}`, { headers: J });
  const rows = await t.json();
  if (!Array.isArray(rows) || rows[0].id !== CID) fail("a database read does not answer from the staff function");
  if (g.calls.some((c) => c.url.includes("db.test"))) fail("a database read reached the database from the browser");
  if (!g.calls.some((c) => c.url.endsWith("/admin-preview-read") && JSON.parse(c.init.body).read === "tables")) fail("the table reads did not go through the staff function");
  if (g.calls.some((c) => c.url.endsWith("/admin-preview-read") && c.init.body.includes("params") && !/"read":"(tables|portal-|kickoff-)/.test(c.init.body))) fail("an unknown read was sent");
  // the site's own files and the public config pass; nothing is added to them
  await g.win.fetch("/data/playbooks/client-steps.json");
  await g.win.fetch(`${FN}admin-config`, { cache: "no-store" });
  if (!g.calls.some((c) => c.url.includes("/data/playbooks/client-steps.json"))) fail("the page's own files are blocked");
  if (!g.calls.some((c) => c.url.includes("admin-config"))) fail("the public config is blocked");
}
// the staff login is taken only from the admin's frame
{
  for (const [name, e] of [["another window", { source: {}, origin: ORIGIN, data: { type: "rga-preview-token", nonce: "abcdef0123456789", token: "forged" } }],
    ["another origin", { source: "PARENT", origin: "https://evil.test", data: { type: "rga-preview-token", nonce: "abcdef0123456789", token: "forged" } }],
    ["the wrong nonce", { source: "PARENT", origin: ORIGIN, data: { type: "rga-preview-token", nonce: "0000000000000000", token: "forged" } }]]) {
    const g = runGuard();
    g.sendMsg({ ...e, source: e.source === "PARENT" ? g.win.parent : e.source });
    g.win.fetch(`${FN}portal-thread`, post({ client_id: CID }));
    await g.settle();
    if (g.calls.length) fail(`the guard took a login from ${name} and sent a read with it`);
  }
  const hello = runGuard().posted.find(([m]) => m.type === "rga-preview-hello");
  if (!hello || hello[1] !== ORIGIN) fail("the guard's hello is missing or goes to any origin");
}
// no write route: refused in the browser, nothing leaves, and the look fails
const WRITES = [
  [`${FN}portal-step-recheck`, post({ client_id: CID, step_id: "m1.gbp.verify" })],
  [`${FN}portal-google-consent`, post({ client_id: CID, action: "agree" })],
  [`${FN}portal-google-consent`, post({ client_id: CID, action: "withdraw" })],
  [`${FN}core-change`, post({ client_id: CID, action: "answer", id: "x", answer: "keep" })],
  [`${FN}portal-book-kickoff`, post({ client_id: CID, start: "x" })],
  [`${FN}cancel-kickoff-invite`, post({ client_id: CID })],
  [`${FN}portal-booking-keep`, post({ client_id: CID })],
  [`${FN}portal-step-input`, post({ client_id: CID, step_id: "m1.gbp.verify", value: "x" })],
  [`${FN}portal-step-choice`, post({ client_id: CID, step_id: "m1.gbp.verify", choice: "x" })],
  [`${FN}portal-step-later`, post({ client_id: CID })],
  [`${FN}portal-message`, post({ client_id: CID, message: "x" })],
  [`${FN}portal-photo-remove`, post({ client_id: CID })],
  [`${FN}portal-video-clip`, post({ client_id: CID })],
  [`${FN}portal-plan-ok`, post({ client_id: CID })],
  [`${FN}portal-review-cadence`, post({ client_id: CID })],
  [`${FN}contract-sign`, post({ client_id: CID })],
  [`${FN}notify-rga`, post({ client_id: CID })],
  [`${FN}portal-thread`, post({ client_id: CID, mark_read_at: "2026-11-01T00:00:00Z" })],
  [`${FN}portal-review-requests`, post({ client_id: CID, list_id: "x", sent: [0] })],
  [`${FN}portal-gbp-profile`, post({ client_id: CID, step_id: "m1.gbp.verify", check_link: "http://x" })],
  [`${FN}portal-gbp-verify`, post({ client_id: CID, action: "start", method: "SMS" })],
  [`${FN}portal-blog-posts`, post({ client_id: CID, action: "off" })],
  [`${FN}client-facts`, post({ client_id: CID, answers: { a: 1 } })],
  [`${FN}portal-deliverables`, post({ client_id: CID, decision: "approved", key: "k" })],
  [`${FN}portal-social-profiles`, post({ client_id: CID, action: "keep", url: "x" })],
  [`${FN}portal-cancel`, post({ client_id: CID, action: "notice" })],
  [`https://db.test/rest/v1/client_photos`, { method: "POST", headers: J, body: "{}" }],
  [`https://db.test/rest/v1/client_onboarding_records?client_id=eq.${CID}`, { method: "PATCH", headers: J, body: "{}" }],
  [`https://db.test/rest/v1/rpc/claim_client_portal_access`, { method: "POST", headers: J, body: "{}" }],
  [`https://db.test/rest/v1/client_photos?id=eq.1`, { method: "DELETE", headers: J }],
  [`https://db.test/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: J, body: "{}" }],
  [`https://db.test/storage/v1/object/client-photos/x.jpg`, { method: "POST", headers: J, body: "x" }],
  [`https://other.test/steal`, { method: "GET" }],
  [`https://other.test/steal`, post({ a: 1 })],
  [`/portal/anything`, post({ a: 1 })],
  [`${FN}portal-thread`, post({ client_id: OTHER })],
  [`${FN}portal-get-contracts`, post({ client_ids: [CID, OTHER] })],
  [`${FN}portal-open-moves?client_id=${OTHER}`, { headers: J }],
  [`https://db.test/rest/v1/clients?select=id&id=eq.${OTHER}`, { headers: J }],
  [`https://db.test/rest/v1/client_portal_access?client_id=eq.${CID}`, { headers: J }],
];
for (const [u, init] of WRITES) {
  const g = runGuard(); g.giveToken();
  const r = await g.win.fetch(u, init);
  await g.settle();
  const left = g.calls.filter((c) => !(c.url.endsWith("/admin-preview-read") && /"read":"tables"/.test(c.init.body)));
  if (left.length) fail(`${init.method || "GET"} ${u.replace(FN, "")} ${init.body || ""}: it left the browser`);
  if (r.status < 400) fail(`${init.method || "GET"} ${u.replace(FN, "")} ${init.body || ""}: answered ${r.status} instead of a refusal`);
  g.doc.rows["step-row-m1.gbp.verify"] = g.row;
  await g.tick();
  const res = g.result();
  if (!res || res.ok !== false || res.why !== "refused") fail(`${init.method || "GET"} ${u.replace(FN, "")} ${init.body || ""}: refused, but the look still drew a card`);
}
{
  const g = runGuard(); g.giveToken();
  const x = new g.win.XMLHttpRequest();
  x.open("POST", "https://db.test/storage/v1/object/client-photos/x.jpg"); x.send("data");
  await g.settle();
  if (g.calls.length) fail("an XHR left the browser");
  if (g.win.navigator.sendBeacon("/x", "y") !== false) fail("sendBeacon is not neutralized");
  g.doc.rows["step-row-m1.gbp.verify"] = g.row; await g.tick();
  if (!g.result() || g.result().ok !== false) fail("a refused XHR or beacon still drew a card");
  let threw = false; try { new g.win.WebSocket("wss://x"); } catch { threw = true; }
  if (!threw) fail("a WebSocket can open");
  if (g.win.open("/x") !== null) fail("a popup can open");
  g.win.history.pushState({}, "", "/x");
  if (g.win.pushed) fail("a look can push a Back step into the admin's history");
  if (!g.doc.meta || !/connect-src 'self'/.test(g.doc.meta.content || "") || !/form-action 'none'/.test(g.doc.meta.content || "")) fail("the browser-level wall (CSP) is gone");
}
// storage lands in memory; the admin's session is untouched
{
  const g = runGuard(); g.giveToken();
  g.realStore.set("sb-x-auth-token", "admin-session");
  if (g.win.localStorage === g.realLocal) fail("the guard left the real localStorage in place");
  g.win.localStorage.setItem("rga_portal_session_first_seen", "x");
  g.win.localStorage.removeItem("sb-x-auth-token");
  g.win.localStorage.clear();
  g.realLocal.setItem("sb-x-auth-token", "overwritten");     // even the real object's writer, through this frame's prototype
  g.realLocal.removeItem("sb-x-auth-token");
  if (g.realStore.get("sb-x-auth-token") !== "admin-session") fail("a storage write in the frame reached the admin's session");
  const client = g.win.__rgaClientPreview.client((u, k, o) => ({ opts: o, auth: {} }), "u", "k");
  const au = client.opts && client.opts.auth;
  if (!au || au.persistSession !== false || au.autoRefreshToken !== false || au.detectSessionInUrl !== false) fail("the look's database client can store or refresh a session");
  const se = await client.auth.getSession();
  if (!se.data.session || se.data.session.access_token !== "preview") fail("a look's stand-in session is gone: a loader would read no session as no data");
}
// fail closed, run
{
  const g = runGuard(); g.giveToken();
  await g.win.fetch(`${FN}portal-thread`, post({ client_id: CID }));
  await g.tick(100);
  if (g.result()) fail("the guard answered before its row had drawn");
  g.doc.rows["step-row-m1.gbp.verify"] = g.row;
  await g.tick(100);
  if (g.result()) fail("the guard answered before the page went quiet");
  await g.tick();
  const res = g.result();
  if (!res || res.ok !== true || !/card/.test(res.html || "")) fail("a clean look does not post the drawn row");
  else if (g.row.removed !== "is-collapsed") fail("the row is posted collapsed: the card would be hidden");
  const toParent = g.posted.find(([m]) => m.type === "rga-preview-result");
  if (toParent[1] !== ORIGIN) fail("the result is posted to any origin");
}
{ // a listed refusal that doesn't touch the card: drawn. One whose host is in the card: not.
  const listed = post({ client_id: CID });
  const g1 = runGuard(); g1.giveToken();
  await g1.win.fetch(`${FN}portal-feed`, listed);
  g1.doc.rows["step-row-m1.gbp.verify"] = g1.row;
  await g1.tick();
  if (!g1.result() || g1.result().ok !== true) fail("a call on the no-effect list blocked the card");
  const g2 = runGuard(); g2.giveToken();
  await g2.win.fetch(`${FN}portal-feed`, listed);
  g2.row.hosts.add("[data-rga-feed]");
  g2.doc.rows["step-row-m1.gbp.verify"] = g2.row;
  await g2.tick();
  if (!g2.result() || g2.result().ok !== false) fail("a refused call whose host is inside the card still drew it");
  // the finder WRITES: refused, and the social card says not available
  const g3 = runGuard(); g3.giveToken();
  const r3 = await g3.win.fetch(`${FN}portal-social-profiles`, post({ client_id: CID, action: "find" }));
  if (r3.status !== 403 || g3.calls.some((c) => c.url.includes("social"))) fail("the social finder (a write) was not refused");
  g3.row.hosts.add("[data-social-step]");
  g3.doc.rows["step-row-m1.gbp.verify"] = g3.row;
  await g3.tick();
  if (!g3.result() || g3.result().ok !== false) fail("a social card whose finder was refused still drew");
}
for (const [name, ans] of [["a 401", { status: 401, out: { error: "x" } }], ["a 403", { status: 403, out: { error: "x" } }], ["an inner 403", { out: { ok: true, status: 403, body: { error: "x" } } }], ["an inner 500", { out: { ok: true, status: 500, body: { error: "x" } } }]]) {
  const g = runGuard({ answers: { "portal-get-contracts": ans } }); g.giveToken();
  const r = await g.win.fetch(`${FN}portal-get-contracts`, post({ client_ids: [CID] }));
  if (r.status < 400) fail(`${name} from the read reached the portal as a success (it would draw "not signed")`);
  g.doc.rows["step-row-m1.gbp.verify"] = g.row; await g.tick();
  if (!g.result() || g.result().ok !== false) fail(`${name} from the read still drew a card`);
}
{ // a table that failed, and an empty row list
  const g = runGuard({ answers: { tables: { out: { ok: true, status: 200, body: { tables: { client_photos: [] }, failed: ["clients"] } } } } }); g.giveToken();
  const r = await g.win.fetch(`https://db.test/rest/v1/clients?select=id&id=eq.${CID}`, { headers: J });
  if (r.status < 400) fail("a table the server could not read reached the portal as empty");
  g.doc.rows["step-row-m1.gbp.verify"] = g.row; await g.tick();
  if (!g.result() || g.result().ok !== false) fail("a failed table read still drew a card");
}
{ // no staff login at all: every read fails, nothing is sent
  const g = runGuard(); g.giveToken("");
  const r = await g.win.fetch(`${FN}portal-thread`, post({ client_id: CID }));
  if (r.status < 400 || g.calls.length) fail("a look with no staff login reached the server, or read as a success");
}
{ // the row never draws: the plain line, or a failure, never a card
  const g = runGuard(); g.giveToken();
  await g.tick(3100);
  if (!g.result() || g.result().why !== "not_on_page") fail('a row that is not on the page does not say so');
  const g2 = runGuard(); g2.giveToken(); g2.doc.dashHidden = true;
  await g2.tick(3100);
  if (g2.result()) fail("a portal that showed an error page was read as a step the client does not see");
}
// the static side of the guard's list: nothing the approved design refuses is served
for (const r of ["portal-step-recheck", "portal-book-kickoff", "cancel-kickoff-invite", "portal-step-input", "portal-step-choice"]) if (new RegExp(`fn === "${r}"`).test(guardSrc)) fail(`the guard routes ${r}`);

// ─── 6. the portal's boot ──────────────────────────────────────────────────────────────────────────
{
  const i0 = portal.indexOf("async function init() {"), i1 = portal.indexOf("function cacheElements()", i0);
  if (i0 < 0 || i1 < 0) { console.error("INDETERMINATE: portal init is gone"); process.exit(2); }
  const init = portal.slice(i0, i1);
  for (const line of ["createClient(config.supabaseUrl, config.supabaseAnonKey)", "supabase.auth.getSession()", 'showStatus(new URLSearchParams(window.location.search).get("dup_owner") ? "back_from_google" : "signed_out"',
    'window.location.replace("/client-login/?reason=session_expired")', "await loadPortalClients(supabase)", "await claimPortalAccess(supabase)", 'showStatus("no_access"', 'showStatus("error")'])
    if (!init.includes(line)) fail(`the client's normal boot lost: ${line}`);
  if (!/if \(!_preview\) await claimPortalAccess\(supabase\);/.test(init)) fail("the membership claim is not skipped only for a look");
  if (!/const portalClients = _preview \? await loadPreviewClient\(supabase\) : await loadPortalClients\(supabase\);/.test(init)) fail("the client load is not the normal one for a client");
  if (!/const supabase = _preview \? _preview\.client\(createClient, config\.supabaseUrl, config\.supabaseAnonKey\) : createClient\(config\.supabaseUrl, config\.supabaseAnonKey\);/.test(init)) fail("the database client is not the normal one for a client");
  const uses = noComments(portal).match(/\b_preview\b/g) || [];
  // 11-6 night fixer: 10th use = managed step 3's day-1 stamp skips an admin look (mcStampDay1), read from the guard's flag instead of the URL
  // 11-8: 11th use = an admin look never finishes a GitHub app install from the address bar (const _gha = _preview ? null : ghAppReturnParams())
  if (uses.length !== 11) fail(`portal.js has ${uses.length} preview uses (expected 11): a branch was added or removed. Read it, then change this number.`);
  if (!/^const _preview = window\.__rgaClientPreview \|\| null;$/m.test(portal)) fail("the preview flag in portal.js comes from somewhere other than the guard");
  if (/rga_preview|URLSearchParams[^;]*preview/.test(noComments(portal))) fail("portal.js reads the preview flag from the URL: only the guard, with its frame check, may");
  for (const f of ["portal/portal.js", "admin/admin.js", "shared/client-preview.js"]) if (/__rgaClientPreview\s*=[^=]/.test(read(f))) fail(`${f} sets the preview flag: only the guard may`);
}

// ─── 7. the read function, run ─────────────────────────────────────────────────────────────────────
{
  if (!/const gate = await requireWorkspaceForClient\(event, clientId\);\s*\n\s*if \(gate\.error\) return gate\.error;/.test(fnSrc)) fail("the read function's staff check is gone");
  if (fnSrc.indexOf("requireWorkspaceForClient(event") > fnSrc.indexOf('const read = String(b.read')) fail("the read function reads before it checks the caller");
  process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.URL = "https://site.test"; process.env.INTERNAL_FN_SECRET = "";
  const log = []; let who = "staff";
  const leak = { refresh_token: "LEAK-rt", access_token: "LEAK-at", client_secret: "LEAK-cs", gbp_account_id: "acc1", nested: { deep: [{ id_token: "LEAK-id", token_enc: "LEAK-enc", keep: "visible" }] } };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input), method = String(init.method || "GET").toUpperCase();
    log.push({ url, method, body: init.body || null });
    const j = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/auth/v1/user")) return who === "nobody" ? j({ msg: "bad" }, 401) : j({ id: "u1", email: "staff@test" });
    if (url.includes("/profiles?")) return j(who === "client" ? [] : [{ workspace_id: who === "other-staff" ? "ws-other" : "ws1", role: "owner" }]);
    if (url.includes("/client_portal_access")) return j(who === "client" ? [{ client_id: CID }] : []);
    if (/\/clients\?id=eq\.[^&]+&select=id,workspace_id$/.test(url)) return j([{ id: CID, workspace_id: "ws1" }]);
    if (url.includes("/client_google_oauth")) return j([{ client_id: CID, ...leak }]);
    if (url.includes("/rest/v1/client_contracts")) return j([{ id: "k1", client_id: CID, status: "signed", contract_html: "LEAK-html", signer_ip: "LEAK-ip", signer_user_agent: "LEAK-ua", audit_log: [] }]);
    if (url.includes("/rest/v1/client_onboarding_records")) return j([{ client_id: CID, data: { tasks: {}, oauth_copy: leak } }]);
    if (url.includes("/rest/v1/")) return j([]);
    return j({}, 404);
  };
  const req = createRequire(path.join(SITE, "netlify/functions/admin-preview-read.js"));
  let H;
  try { H = req(path.join(SITE, "netlify/functions/admin-preview-read.js")); } catch (e) { console.error("INDETERMINATE: the read function does not load: " + e.message); process.exit(2); }
  const call = (b, auth = "Bearer staff-jwt", method = "POST") => H.handler({ httpMethod: method, headers: { authorization: auth }, body: JSON.stringify(b) });
  const parse = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };
  // staff only
  for (const [w, label] of [["nobody", "a caller with no valid login"], ["client", "the client's own login"], ["other-staff", "staff of another workspace"]]) {
    who = w; log.length = 0;
    const r = await call({ client_id: CID, read: "tables" });
    if (r.statusCode !== 401 && r.statusCode !== 403) fail(`${label} got ${r.statusCode} from the read function`);
    if (log.some((c) => /client_onboarding_records|client_google_oauth|client_contracts/.test(c.url))) fail(`${label} reached client data through the read function`);
  }
  who = "staff";
  if ((await call({ client_id: CID, read: "tables" }, "Bearer x", "GET")).statusCode !== 405) fail("the read function answers a GET");
  if ((await call({ client_id: "not-a-uuid", read: "tables" })).statusCode !== 400) fail("the read function accepts a bad client id");
  // forced client filter; a request can't steer it
  log.length = 0;
  const t = await call({ client_id: CID, read: "tables", table: "rga_google_credentials", filter: `client_id=eq.${OTHER}`, select: "refresh_token", names: ["rga_google_credentials"], params: { client_id: OTHER, by: "id", path: "/rga_google_credentials" } });
  const tb = parse(t);
  if (t.statusCode !== 200 || !tb.ok || !tb.body || !tb.body.tables) fail("the table read does not answer staff");
  const reads = log.filter((c) => c.url.includes("/rest/v1/") && !/\/profiles\?|\/clients\?id=eq\.[^&]+&select=id,workspace_id$/.test(c.url));
  if (reads.length !== Object.keys(H.TABLES).length) fail(`the table read made ${reads.length} reads for ${Object.keys(H.TABLES).length} tables`);
  for (const c of reads) {
    const tableName = /\/rest\/v1\/(\w+)/.exec(c.url)[1];
    const by = tableName === "clients" ? "id" : "client_id";
    if (!c.url.endsWith(`&${by}=eq.${CID}`)) fail(`${tableName}: the client filter is not forced by the server (${c.url.slice(-60)})`);
    if (c.url.includes(OTHER)) fail(`${tableName}: the request steered the filter to another client`);
    if (c.method !== "GET") fail(`${tableName}: the read function sends ${c.method}`);
    if (!Object.prototype.hasOwnProperty.call(H.TABLES, tableName)) fail(`${tableName}: read, but not on the list`);
  }
  if (log.some((c) => c.url.includes("rga_google_credentials"))) fail("a table named in the request was read");
  // the list refuses everything else
  for (const name of ["rga_google_credentials", "client_portal_access", "portal-step-recheck", "portal-google-consent", "core-change", "portal-book-kickoff", "portal-step-input", "client-facts", "portal-deliverables", "constructor", "__proto__", "toString", "hasOwnProperty", ""]) {
    log.length = 0;
    const r = await call({ client_id: CID, read: name, params: {} });
    if (r.statusCode !== 403) fail(`the read "${name}" is not refused (${r.statusCode})`);
    if (log.some((c) => c.method !== "GET" && !c.url.includes("/auth/"))) fail(`the read "${name}" wrote`);
  }
  // no write gets through a read
  for (const [name, params] of [["portal-thread", { mark_read_at: "2026-11-01T00:00:00Z" }], ["portal-review-requests", { list_id: CID, sent: [0], scope: "evil" }], ["portal-gbp-profile", { step_id: "m1.gbp.booking_link", check_link: "http://evil.test/" }],
    ["portal-gbp-verify", { action: "start", method: "SMS", phone: "1" }], ["portal-blog-posts", { action: "off" }], ["portal-site-platform", { action: "x", force: true }], ["portal-open-moves", { x: 1 }], ["portal-step-waits", {}], ["kickoff-availability", { purpose: "../../x" }]]) {
    log.length = 0;
    await call({ client_id: CID, read: name, params });
    const writes = log.filter((c) => c.method !== "GET" && !c.url.includes("/auth/") && !c.url.includes("oauth2.googleapis.com"));
    if (writes.length) fail(`${name}: a read wrote ${writes[0].method} ${writes[0].url.slice(0, 80)}`);
    if (log.some((c) => c.url.includes("evil.test"))) fail(`${name}: a param from the request reached the function (it called out)`);
  }
  for (const [name, entry] of Object.entries(H.READS)) {
    let mod; try { mod = entry.load(); } catch (e) { fail(`${name}: its handler does not load (${e.message})`); continue; }
    if (typeof mod.handler !== "function") fail(`${name}: no handler to reuse`);
    if (entry.method === "POST" && /mark_read_at|sent|answers|decision/.test(JSON.stringify(entry.body({ mark_read_at: "x", sent: [0], answers: {}, decision: "x" })))) fail(`${name}: a write key passes through its body builder`);
  }
  // no secret, anywhere
  log.length = 0;
  const all = await call({ client_id: CID, read: "tables" });
  if (/LEAK-/.test(all.body)) fail(`a secret left the read function: ${(/LEAK-\w+/.exec(all.body) || [])[0]}`);
  if (!/visible/.test(all.body)) fail("the secret strip ate more than secrets (or the fixture never ran)");
  const contracts = await call({ client_id: CID, read: "portal-get-contracts" });
  if (/LEAK-/.test(contracts.body)) fail(`a contract read left with ${(/LEAK-\w+/.exec(contracts.body) || [])[0]}`);
  if (!/"status":"signed"/.test(contracts.body)) fail("the contract read does not answer staff (a card would say not signed)");
  const SECRET_COL = /token|secret|password|api_?key|stripe_customer|checkout_url|signer_ip|signer_user_agent|contract_html/i;
  for (const [name, t2] of Object.entries(H.TABLES)) {
    const sel = (/[?&]select=([^&]*)/.exec(t2.path) || [])[1] || "";
    if (SECRET_COL.test(sel)) fail(`${name}: its column list names a sensitive column (${sel.match(SECRET_COL)[0]})`);
    if (/\w+\(|:/.test(sel)) fail(`${name}: its column list reaches another table (${sel})`);
    if (sel === "*" && name !== "client_portal_content") fail(`${name}: select=* can reach any column, present or future`);
    if (!/^\/\w+\?select=/.test(t2.path)) fail(`${name}: not a plain table read`);
    if (t2.by !== "client_id" && !(name === "clients" && t2.by === "id")) fail(`${name}: filtered on ${t2.by}`);
  }
  if (!H.TABLES.client_google_oauth || /\*/.test(H.TABLES.client_google_oauth.path)) fail("client_google_oauth has no explicit column list");
  if (H.TABLES.client_portal_access) fail("client_portal_access is on the list: a look skips the membership lookup");
  if (/\bb\.(table|filter|select|path|by)\b/.test(fnSrc)) fail("the read function reads a table, filter or column from the request");
  // the columns match what the portal's loaders read, so a card can't quietly lose a field
  const OMIT = new Set(["stripe_customer_id", "stripe_checkout_url"]);   // a look has no use for a payment link or a Stripe id; no step card reads them
  const loaderCols = {};
  for (const m of portal.matchAll(/\.from\("(\w+)"\)\s*\n\s*\.select\("([^"]+)"\)/g)) if (!loaderCols[m[1]]) loaderCols[m[1]] = m[2];
  const parts = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  for (const [name, t2] of Object.entries(H.TABLES)) {
    const sel = (/[?&]select=([^&]*)/.exec(t2.path) || [])[1] || "";
    if (name === "clients") {
      const block2 = /client:clients \(([\s\S]*?)\)/.exec(portal);
      if (!block2) { fail("the portal's clients column list is gone"); continue; }
      for (const c of parts(block2[1])) if (!parts(sel).includes(c)) fail(`clients: the portal reads ${c}, the read function does not`);
      continue;
    }
    if (!loaderCols[name]) { fail(`${name}: the portal no longer loads this table on boot`); continue; }
    if (loaderCols[name] === "*") { if (sel !== "*") fail(`${name}: the portal reads every column, the read function does not`); continue; }
    for (const c of parts(loaderCols[name])) if (!OMIT.has(c) && !parts(sel).includes(c)) fail(`${name}: the portal reads ${c}, the read function does not`);
    for (const c of parts(sel)) if (!parts(loaderCols[name]).includes(c)) fail(`${name}: the read function reads ${c}, which the portal's loader does not`);
  }
  const portalLoads = [...portal.slice(portal.indexOf("async function loadConfig()"), portal.indexOf("let _portalSupabase = null;")).matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]).filter((n) => n !== "client_portal_access");
  for (const n of new Set(portalLoads)) if (!H.TABLES[n]) fail(`the portal loads ${n} on boot, and it is not on the read function's list: every look would fail`);
  const retired = /const PHOTO_RETIRED = \[([^\]]*)\]/.exec(portal);
  if (!retired || !H.TABLES.client_photos.path.includes(`not.in.(${retired[1].replace(/["\s]/g, "")})`)) fail("client_photos: the retired photo states differ from the portal's");
  if (/—/.test(fnSrc) || /—/.test(guardSrc)) fail("an em dash in the new files");
  for (const [n, t] of [["guard", guardSrc], ["read function", fnSrc], ["preview", prev]]) if (/\bchris\b/i.test(t)) fail(`the owner's first name is in the ${n} file (a served file)`);
}

// ─── 8. the client-only functions: auth pinned, line for line ─────────────────────────────────────
// sha1 of each file's auth lines at the time this was built. A staff branch added to one of these fails here. If an auth line changes for a real reason, read why, then re-pin it.
const AUTH_PIN = {
 "cancel-kickoff-invite.js": "9a1753fd024c",
 "client-change-history.js": "1c0b8d8694ac",
 "client-facts.js": "1c0b8d8694ac",
 "contract-sign.js": "448255116ff3",
 "core-change.js": "9ce3e72bd4d2",
 "gbp-duplicate-owner-init.js": "8d09abf4a7cc",
 "gbp-duplicate-remove.js": "241d9fccdff6",
 "kickoff-availability.js": "3f9aa2f20934",
 "notify-rga.js": "6a4d1fd683a7",
 "oauth-google-disconnect.js": "8d09abf4a7cc",
 "oauth-google-init.js": "8d09abf4a7cc",
 "oauth-google-recheck.js": "8d09abf4a7cc",
 "portal-blog-posts.js": "7b78af38ecba",
 "portal-book-kickoff.js": "3e5b9dfec593",
 "portal-cancel.js": "241d9fccdff6",
 "portal-deliverables.js": "7690d21c2eef",
 "portal-form-test.js": "f300681bd16a",
 "portal-gbp-verify.js": "006ebf90f6f9",
 "portal-get-audit-snapshot.js": "60acb902007e",
 "portal-get-contracts.js": "60acb902007e",
 "portal-google-consent.js": "7b78af38ecba",
 "portal-invoice-pay.js": "763189a57bf9",
 "portal-merge-choice.js": "241d9fccdff6",
 "portal-message.js": "241d9fccdff6",
 "portal-onboarding-notes.js": "87aa004dc428",
 "portal-page-proof.js": "241d9fccdff6",
 "portal-payment-intent.js": "241d9fccdff6",
 "portal-photo-team.js": "241d9fccdff6",
 "portal-plan-ok.js": "241d9fccdff6",
 "portal-review-cadence.js": "1978536c6e89",   // 11-6 night fixer re-pin: requirePortalOwner now runs beside the record read (53274fdd); gate.error is still returned before the record is used, no staff branch
 "portal-review-requests.js": "735fe2a29a98",
 "portal-social-profiles.js": "3cc2b9cfdec2",
 "portal-step-choice.js": "241d9fccdff6",
 "portal-step-input.js": "241d9fccdff6",
 "portal-step-later.js": "241d9fccdff6",
 "portal-thread.js": "1f5d6e70dd2f",
 "portal-vertical-targets.js": "241d9fccdff6",
 "portal-video-clip.js": "3e5b9dfec593",
 "stripe-create-checkout.js": "3282dfaac94b"
};
{
  const authLines = (t) => t.split("\n").filter((l) => /require(?:PortalOwner\w*|Workspace\w*|InternalSecret|User|CronOrInternal)\(|\/auth\/v1\/user|client_portal_access\?|allowedClientIds/.test(l) && !/^\s*\/\//.test(l)).map((l) => l.trim()).join("\n");
  const files = Object.keys(AUTH_PIN);
  if (files.length < 36) fail(`only ${files.length} client-login functions are pinned`);
  for (const f of files) {
    const src = read(`netlify/functions/${f}`);
    const sum = crypto.createHash("sha1").update(authLines(src)).digest("hex").slice(0, 12);
    if (sum !== AUTH_PIN[f]) fail(`${f}: its auth lines changed. The approved design adds no staff branch to a client function`);
    if (/admin-preview|rga_preview|__rgaClientPreview/.test(noComments(src))) fail(`${f}: it knows about the preview`);
  }
  const bp = read("netlify/functions/portal-blog-posts.js");
  if (!/action === "read" \? await requirePortalOwnerOrWorkspace\(event, clientId\) : await requirePortalOwner\(event, clientId\)/.test(bp)) fail("portal-blog-posts lets an admin press the client's buttons");
}

// ─── 9. every numbered client step ────────────────────────────────────────────────────────────────
if (!/Preview not available/.test(P.lookResultHtml("m9.no.such.step", { ok: false, why: "no_card" }, "/c.css"))) fail('a step with no card does not say "Preview not available"');
if (!/does not see this step/.test(srcdocOf(P.lookResultHtml("m1.gbp.verify", { ok: false, why: "not_on_page" }, "/c.css")))) fail("a step the client's page doesn't have does not say so");
for (const bad of [{ ok: true, html: "" }, { ok: true, html: "   " }, { ok: true }, null, undefined, {}]) if (!/Preview not available/.test(P.lookResultHtml("m1.gbp.verify", bad, "/c.css"))) fail(`an empty look result (${JSON.stringify(bad)}) draws as a card`);
const pbRaw = read("data/playbooks/playbooks.json");
const clientSteps = [];
(function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.clientStepNo != null && o.id) clientSteps.push(o.id); Object.values(o).forEach(walk); } })(JSON.parse(pbRaw));
const stepIds = [...new Set(clientSteps)];
if (stepIds.length < 21) fail(`the playbook lists only ${stepIds.length} numbered client steps (expected at least 21): the count the preview covers shrank`);
const CARDS = P.CLIENT_CARDS || {};
for (const id of stepIds) {
  if (!Object.prototype.hasOwnProperty.call(CARDS, id)) fail(`${id}: a numbered client step with no card entry`);
  else if (!CARDS[id] || /—/.test(CARDS[id])) fail(`${id}: its card label is empty or has an em dash`);
}
for (const id of Object.keys(CARDS)) if (!stepIds.includes(id)) fail(`CLIENT_CARDS names ${id}, which is not a numbered client step in the playbook`);

// ─── 10. one drawing ───────────────────────────────────────────────────────────────────────────────
if (!/import \{ blogCardHtml(?:, \w+)* \} from "\/shared\/client-card-kit\.js/.test(portal) || !/function blogPlanInner\(c\) \{ return blogCardHtml\(c\); \}/.test(portal)) fail("the portal draws the posts card with its own copy, not the shared function");
const norm = (t) => t.replace(/\s+/g, " ").trim();
const grab = (src, name) => { const i = src.indexOf(`const ${name} = `); if (i < 0) return null; const m = /\n(?=\/\*\*|const |\/\/ |function |export )/.exec(src.slice(i + 5)); return norm(src.slice(i, i + 5 + (m ? m.index : src.length))); };
for (const n of ["PC_TICK", "PC_OPEN", "PC_DOWN", "csCard", "csEv", "csNote", "csFoot", "pcActs"]) {
  const a = grab(portal, n), b = grab(kit, n);
  if (!a || !b) fail(`the primitive ${n} is missing from ${!a ? "portal.js" : "the shared kit"}`); else if (a !== b) fail(`the shared kit's ${n} differs from portal.js: the admin preview would not look like the client's card`);
}
const ci = (src) => { const i = src.indexOf("const CS_ICON = {"); return i < 0 ? null : norm(src.slice(i, src.indexOf("\n};", i) + 3)); };
if (!ci(portal) || ci(portal) !== ci(kit)) fail("the shared kit's CS_ICON differs from portal.js");
if (/—/.test(noComments(prev) + block)) fail("an em dash in the new preview copy");
fs.rmSync(tmp, { recursive: true, force: true });
if (F.length) { console.error("the admin preview might run as the client, or read past its list, or draw a guess:"); for (const f of F) console.error("   - " + f); process.exit(1); }
console.log(`OK: the admin look can't act as the client (${hostile.length} hostile inputs, ${WRITES.length} refused routes, ${Object.keys(AUTH_PIN).length} client functions pinned, ${stepIds.length} numbered client steps)`);
process.exit(0);
