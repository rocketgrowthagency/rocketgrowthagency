#!/usr/bin/env node
// check-admin-see-what-client-sees.mjs — approved mockup admin_see_what_client_sees_v1 (Nov 1), option A. File-only: no network, no database, no browser.
// HOLDS: nothing in the admin's "See what the client sees" preview can run as the client.
//   1. neutralize() leaves no button, link, form, field, script, data-* hook, on* handler, href or action, whatever it is fed (runtime, hostile inputs).
//   2. every preview card the drawers draw, in every state, carries none of those either.
//   3. the container is a sandboxed iframe with no scripts / forms / navigation, around an inert body; the frame says "Preview · read only" and
//      "Only the client can do this".
//   4. the admin's preview code makes only the READS in PREVIEW_CALLS and never names portal-step-recheck (it accepts an admin), a consent route,
//      core-change, a booking route, nor any write action (off / on / agree / withdraw / keep / save / send).
//   5. the client card is drawn by ONE function: portal.js uses the kit's blogCardHtml, and the kit's primitives equal portal.js's word for word.
//   6. a step with no drawer says "Preview not available" and shows no guess.
// exit 0 = holds · 1 = broken · 2 = can't tell
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const adm = read("admin/admin.js"), portal = read("portal/portal.js"), kit = read("shared/client-card-kit.js"), prev = read("shared/client-preview.js");
const F = []; const fail = (m) => F.push(m);
// load the two shared modules from a temp dir (their imports are browser paths)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cv-gate-"));
fs.writeFileSync(path.join(tmp, "client-card-kit.mjs"), kit);
fs.writeFileSync(path.join(tmp, "client-preview.mjs"), prev.replace(/from "\/shared\/client-card-kit\.js[^"]*"/, 'from "./client-card-kit.mjs"'));
let P, K;
try { P = await import(path.join(tmp, "client-preview.mjs")); K = await import(path.join(tmp, "client-card-kit.mjs")); } catch (e) { console.error("INDETERMINATE: the shared modules do not load: " + e.message); process.exit(2); }
const ACTS = [[/<button\b/i, "a button"], [/<a\b/i, "a link"], [/<form\b/i, "a form"], [/<(input|select|textarea)\b/i, "a field"], [/<script\b/i, "a script"],
  [/\sdata-[\w-]+/i, "a data- hook"], [/\son[a-z]+\s*=/i, "an event handler"], [/\shref\s*=/i, "an href"], [/\s(form)?action\s*=/i, "an action"], [/\stabindex\s*=/i, "a tab stop"], [/<iframe\b|<object\b|<embed\b/i, "an embed"]];
const acts = (html) => ACTS.filter(([re]) => re.test(html)).map(([, n]) => n);
// 1. hostile inputs
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
// 2. every drawer, every state
const states = [
  { state: "pages_first", title: "Your website posts", side: "pages come first", rows: [{ label: "Page for Drain cleaning", value: "Not yet", sub: "x" }, { label: "Posts", value: "Waiting", sub: "y" }], note: "n", action: "off", actionLabel: "Say no to posts" },
  { state: "ready", title: "Your website posts", side: "up to 2 a month", rows: [{ label: "Posts", value: "Up to 2 a month", sub: "z" }], note: "n", action: "off", actionLabel: "Say no to posts" },
  { state: "no_material", title: "Your website posts", side: "", rows: [], note: "n", action: "off", actionLabel: "Say no to posts" },
  { state: "off", title: "Your website posts: off", side: "you decided Nov 3", rows: [], note: "n", action: "on", actionLabel: "Turn posts back on" },
  { state: "unread", title: "Your website posts", side: "", rows: [], note: "n", action: "off", actionLabel: "Say no to posts" },
  { state: "not_set_up", title: "Your website posts", side: "", rows: [], note: "n", action: null },
];
let drawers = 0;
for (const [id, d] of Object.entries(P.DRAWERS)) {
  drawers++;
  for (const card of states) {
    const data = Object.fromEntries(d.calls.map(([fn]) => [fn, { ok: true, card }]));
    const raw = P.previewPartsHtml(id, data);
    const doc = P.previewDocument(raw, "/portal/portal.css");
    const body = doc.slice(doc.indexOf("<body"));
    const bad = acts(body); if (bad.length) fail(`${id} / ${card.state}: the preview document carries ${bad.join(", ")}`);
    const drawn = K.blogCardHtml({ ok: true, card }, { preview: true });
    if (/<button\b|data-blog-/.test(drawn)) fail(`${id} / ${card.state}: the preview drawing itself has a button (layer 1)`);
  }
  if (!d.calls.length) fail(`${id}: a drawer with no listed read`);
}
if (drawers === 0) fail("no drawers: nothing is previewable");
// 3. container + labels
const iframe = P.previewIframeHtml("<p>x</p>", "/portal/portal.css");
const sb = (iframe.match(/sandbox="([^"]*)"/) || [])[1];
if (sb === undefined) fail("the preview iframe has no sandbox");
else if (/allow-scripts|allow-forms|allow-top-navigation|allow-popups|allow-modals/.test(sb)) fail(`the preview sandbox allows ${sb}`);
if (!/<body[^>]*\binert\b/.test(P.previewDocument("<p>x</p>", "/c.css"))) fail("the preview body is not inert");
const frame = P.previewFrameHtml({ inner: iframe, asOf: new Date() });
if (!/Preview · read only/.test(frame) || !/Only the client can do this/.test(frame) || !/refreshed on open/.test(frame)) fail("the frame lost its read-only label, time line or lock line");
// 4. the admin's preview code
const a0 = adm.indexOf("// CV-PREVIEW-START"), a1 = adm.indexOf("// CV-PREVIEW-END");
if (a0 < 0 || a1 < a0) { console.error("INDETERMINATE: the preview block markers are gone from admin.js"); process.exit(2); }
const block = adm.slice(a0, a1).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (/portal-step-recheck|portal-google-consent|portal-core-change|portal-booking|kickoff-book|portal-step-input|portal-step-choice|portal-photo|portal-social/.test(block)) fail("the preview code names a route that can act as the client");
const actionsSent = [...block.matchAll(/action:\s*([^,}\s]+)/g)].map((m) => m[1]);
if (actionsSent.length !== 1 || actionsSent[0] !== '"read"') fail(`the preview sends an action other than read (${actionsSent.join(" ")})`);
if ((block.match(/fetch\(/g) || []).length !== 1) fail("the preview makes a call other than its one guarded read");
if (!/PREVIEW_CALLS\.some/.test(block)) fail("the preview read is not checked against PREVIEW_CALLS");
if (/\.innerHTML\s*=\s*[^;]*\b(card|html|task)\b/.test(block.replace(/previewFrameHtml[\s\S]*?asOf: new Date\(\) \}\)/, ""))) fail("the preview puts raw html into the page outside the frame");
for (const [fn, a] of P.PREVIEW_CALLS) if (a !== "read") fail(`PREVIEW_CALLS lists a write: ${fn} ${a}`);
// the server: reads accept an admin, writes do not
const bp = read("netlify/functions/portal-blog-posts.js");
if (!/action === "read" \? await requirePortalOwnerOrWorkspace\(event, clientId\) : await requirePortalOwner\(event, clientId\)/.test(bp)) fail("portal-blog-posts lets an admin press the client's buttons");
// 5. one drawing
if (!/import \{ blogCardHtml \} from "\/shared\/client-card-kit\.js/.test(portal) || !/function blogPlanInner\(c\) \{ return blogCardHtml\(c\); \}/.test(portal)) fail("the portal draws the posts card with its own copy, not the shared function");
const norm = (t) => t.replace(/\s+/g, " ").trim();
const grab = (src, name) => { const i = src.indexOf(`const ${name} = `); if (i < 0) return null; const m = /\n(?=\/\*\*|const |\/\/ |function |export )/.exec(src.slice(i + 5)); return norm(src.slice(i, i + 5 + (m ? m.index : src.length))); };
for (const n of ["PC_TICK", "PC_OPEN", "PC_DOWN", "csCard", "csEv", "csNote", "csFoot", "pcActs"]) {
  const a = grab(portal, n), b = grab(kit, n);
  if (!a || !b) fail(`the primitive ${n} is missing from ${!a ? "portal.js" : "the shared kit"}`); else if (a !== b) fail(`the shared kit's ${n} differs from portal.js: the admin preview would not look like the client's card`);
}
const ci = (src) => { const i = src.indexOf("const CS_ICON = {"); return i < 0 ? null : norm(src.slice(i, src.indexOf("\n};", i) + 3)); };
if (!ci(portal) || ci(portal) !== ci(kit)) fail("the shared kit's CS_ICON differs from portal.js");
// 6. no drawer = not available
if (!/Preview not available/.test(P.previewPartsHtml("m9.no.such.step", {}))) fail('a step with no drawer does not say "Preview not available"');
const noComments = (t) => t.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (/\u2014/.test(noComments(prev) + kit.slice(kit.indexOf("function blogCardHtml")) + block)) fail("an em dash in the new preview copy");
fs.rmSync(tmp, { recursive: true, force: true });
if (F.length) { console.error("the admin preview might run as the client, or has drifted from the client's card:"); for (const f of F) console.error("   - " + f); process.exit(1); }
console.log(`OK: nothing in the admin preview can act as the client (${hostile.length} hostile inputs, ${drawers} drawer x ${states.length} states, one guarded read)`);
