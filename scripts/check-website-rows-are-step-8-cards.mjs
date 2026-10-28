#!/usr/bin/env node
// check-website-rows-are-step-8-cards.mjs — 2026-10-27, approved admin_website_steps_v1 (Chris: "use the step 8 design for all
// steps on admin side" → "i meant mockup of the steps for admin website" → "approved"). RENDERS the admin website row in real
// Chrome with admin.css + the row's own code lifted from admin.js, once per state, and checks each is the approved card:
//   · draft it (⚡ Draft this for me) · done-but-not-proven (a September tick with nothing on record never reads "Done")
//   · draft ready: Now → After lines only, ONE "Send for approval", Edit the lines, Nothing needs changing — and a claim we
//     can't back ("60-Day Guarantee") FLAGGED · editing in place: NO Kind / Where / address inputs showing, today's words above
//     each box · with the client: checks (drafted ✓ · sent ✓ · their approval open) · publish: Mark live · live: checks ·
//     already right · the client asked · a failed draft says why + Draft again
//   · the old always-open form and the Drafted/Sent trail are gone; nothing on the card is a box inside a box
//   · the row's one chip: Draft ready · With the client · Publish · Live · Already right · Not proven
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved / no Chrome.  --shots=<dir> saves a PNG per state.
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const A = read("admin/admin.js"), CSS = read("admin/admin.css"), SCJS = read("shared/site-change.js");
const F = [], fail = (m) => F.push(m);
const fn = (name) => { const at = A.indexOf(`function ${name}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${name} moved`); process.exit(2); }
  let d = 0, i = A.indexOf("{", A.indexOf(")", at)); for (; i < A.length; i++) { if (A[i] === "{") d++; else if (A[i] === "}" && --d === 0) break; } return A.slice(A.lastIndexOf("\n", at) + 1, i + 1); };
const line = (re, what) => { const m = A.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${what} moved`); process.exit(2); } return m[0]; };
if (/function wcTrailHtml\(/.test(A)) fail("the old Drafted / Sent / … trail is back on the website rows");
const code = [line(/^const WC_TILE = [^\n]*;$/m, "WC_TILE"), line(/^const WC_KIND = [^\n]*;$/m, "WC_KIND"), "const wcDraftCache = new Map();",
  line(/^const wcEditing = new Set\(\);[^\n]*$/m, "wcEditing"), line(/^const wcPrefilling = new Set\(\);[^\n]*$/m, "wcPrefilling"),
  line(/^const wcStepDef = [^\n]*;$/m, "wcStepDef"), line(/^const wcTitleOf = [^\n]*;$/m, "wcTitleOf"), line(/^const wcDay = [^\n]*;$/m, "wcDay"),
  line(/^const acDay = [^\n]*;$/m, "acDay"), line(/^const acCk = [^\n]*;$/m, "acCk"),
  fn("acCardHtml"), fn("acDueChip"), fn("wcDiffHtml"), fn("wcRiskHtml"), fn("wcFormHtml"), fn("wcNewPageHtml"), fn("wcRowPill"), line(/^const wcRowPillHtml = [^\n]*;$/m, "wcRowPillHtml"), fn("siteChangeAdminHtml")].join("\n");

let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer isn't installed"); process.exit(2); }
const SHOTS = (process.argv.find((a) => a.startsWith("--shots=")) || "").slice(8);
const H = "m1.web.h1_cta", NOW = "2026-10-27T18:00:00Z";
const items = [{ label: "Main headline", before: "Rank Higher on Google Maps and Build a Predictable Pipeline", after: "Local SEO That Puts Your Business on the Map" },
  { label: "Line under the headline", before: "", after: "Honest reporting, 60-Day Guarantee" }, { label: "Main button", before: "See Where You Rank Free", after: "Get Your Free Google Listing Audit" }];
const change = { v: "v1", kind: "visible", where: "Your homepage", items, drafted_at: NOW };
const ran = { auto_result: { summary: "H1: …", ran_at: NOW, outcome_data: {} } };
const S = {
  draftit: { task: { status: "pending" } },
  notproven: { task: { status: "done", completed_at: "2026-09-14T17:00:00Z" } },
  ready: { task: { status: "in_progress", ...ran }, pre: change },
  failed: { task: { status: "in_progress", auto_result: { summary: "The draft broke the page rules, so nothing was saved:\n- not JSON", ran_at: NOW, outcome_data: { problems: ["the answer wasn't the page's words (not JSON)"] } } }, pre: { items: [] } },
  editing: { task: { status: "in_progress", ...ran }, pre: change, edit: true },
  unread: { task: { status: "in_progress", ...ran }, pre: { items: [], read_failed: true } },
  drafted: { task: { status: "in_progress", site_change: change } },
  sent: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW } } },
  changes: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "changes_requested", change_v: "v1", at: NOW, note: "Keep the button as See Where You Rank Free" } } },
  approved: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: change } } },
  live: { task: { status: "done", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test" }, published: { v: "v1", at: NOW, by: "hello@", url: "https://x.test/", checked: true, check_note: "Read back from https://x.test/" } } },
  right: { task: { status: "done", no_change_needed: { note: "One phone number on every page", at: NOW, by: "RGA" } } },
};
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const out = {};
try {
  for (const [name, sc] of Object.entries(S)) {
    const page = await browser.newPage(); await page.setViewport({ width: 1000, height: 900 });
    await page.setContent(`<style>${CSS}</style><div class="ob-step" style="max-width:940px;margin:16px"><div id="h"></div></div>`);
    out[name] = await page.evaluate(({ SCJS, code, sc, H, name }) => {
      const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml;
      const adminGcardWhen = () => "Oct 27, 11:00 AM", renderOnboardingChecklist = () => {}, movesForSelected = () => [], mvDueDays = () => 0, mvDay = () => "Oct 27";
      const wcAction = async () => null, GH_MONO = "", OB_WEB_TILE = "";
      const state = { selectedClient: { id: "c1", business_name: "Acme" }, flowM1Playbook: [{ id: H, title: "Fix H1 + primary CTA", clientLabel: "Homepage headline + main button", hasRunner: true }] };
      eval(SCJS);   // globalThis.rgaSiteChange
      // eslint-disable-next-line no-eval
      const api = eval(`(() => { ${code}; return { wcDraftCache, wcEditing, siteChangeAdminHtml, wcRowPill }; })()`);
      if (sc.pre) api.wcDraftCache.set(`c1:${H}`, sc.pre);
      if (sc.edit) api.wcEditing.add(`c1:${H}`);
      const el = document.getElementById("h"); el.innerHTML = api.siteChangeAdminHtml(H, sc.task);
      const vis = (q) => [...el.querySelectorAll(q)].filter((x) => x.offsetParent !== null);
      const nested = [...el.querySelectorAll(".ob-ac form, .ob-ac .ob-wc-line")].some((x) => { const s = getComputedStyle(x); return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && s.backgroundColor !== "rgba(0, 0, 0, 0)"; });
      return { text: el.textContent.replace(/\s+/g, " "), html: el.innerHTML, buttons: vis("button, a.admin-button").map((b) => b.textContent.trim()), inputs: vis("input:not([type=hidden]), select").length,
        textareas: vis("textarea").length, label: (el.querySelector(".ob-ac-st") || {}).textContent || "", pill: (api.wcRowPill(H, sc.task) || {}).text || "", nested, cards: el.querySelectorAll(".ob-ac").length, checks: el.querySelectorAll(".ob-ac-ck li").length };
    }, { SCJS, code, sc, H, name });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); }
    await page.close();
  }
} finally { await browser.close(); }
const has = (n, re, what) => { if (!re.test(out[n].text)) fail(`${n}: ${what}`); };
for (const [n, o] of Object.entries(out)) { if (o.cards !== 1) fail(`${n}: not ONE row-8 card (${o.cards})`); if (o.nested) fail(`${n}: a box inside the card's box`); if (/Drafted\s*Sent\s*Client approval/.test(o.text)) fail(`${n}: the old trail is back`); }
if (!out.draftit.buttons.includes("⚡ Draft this for me") || out.draftit.textareas) fail("draft it: no ⚡ Draft this for me, or the empty form is open before there's a draft");
has("notproven", /Done, but not proven/, "a September tick with nothing on record reads as Done"); if (out.notproven.pill !== "Not proven") fail("not proven: the row's chip still says Done");
has("ready", /Your move · review the draft/, "the draft isn't \"review the draft\"");
if (out.ready.buttons.filter((b) => b === "Send for approval").length !== 1 || !out.ready.buttons.includes("Edit the lines") || !out.ready.buttons.includes("Nothing needs changing…")) fail(`draft ready: not ONE Send for approval + Edit the lines + Nothing needs changing (${out.ready.buttons})`);
if (out.ready.textareas || out.ready.inputs) fail("draft ready: shows form boxes before you press Edit");
if (!/Rank Higher on Google Maps[\s\S]*→[\s\S]*Local SEO That Puts Your Business on the Map/.test(out.ready.text)) fail("draft ready: the lines aren't Now → After");
has("ready", /says “Guarantee”: a guarantee we can't back/, "\"60-Day Guarantee\" isn't flagged before sending"); if (out.ready.pill !== "Draft ready") fail("draft ready: the row's chip isn't \"Draft ready\"");
has("failed", /The draft didn't come out right/, "a failed draft doesn't say so"); has("unread", /Couldn't read the draft/, "a draft we couldn't LOAD is called a bad draft"); if (!out.unread.buttons.includes("Try again") || /didn't come out right/.test(out.unread.text)) fail("couldn't read: no Try again, or it says the draft is bad"); if (!out.failed.buttons.includes("⚡ Draft again")) fail("a failed draft has no Draft again");
if (out.editing.inputs) fail(`editing: shows ${out.editing.inputs} Kind / Where / address input(s) (the step sets them)`);
if (out.editing.textareas !== 3 || !/Now: “Rank Higher on Google Maps/.test(out.editing.text) || !out.editing.buttons.includes("Save and send for approval") || !out.editing.buttons.includes("Cancel")) fail("editing: not one box per line with today's words above it, Save and send + Cancel");
has("drafted", /Your move · send it/, "a saved draft isn't \"send it\"");
has("sent", /In their For your approval/, "sent isn't \"In their For your approval\""); has("sent", /Drafted[\s\S]*Sent for approval[\s\S]*They approve it/, "sent doesn't show the checks"); if (out.sent.checks !== 3) fail(`sent: not 3 check rows (${out.sent.checks})`); if (out.live.checks !== 3) fail(`live: not 3 check rows (${out.live.checks})`); if (out.sent.pill !== "With the client") fail("sent: chip isn't \"With the client\"");
has("changes", /The client asked for a change/, "the client's ask isn't shown"); has("changes", /Keep the button as See Where You Rank Free/, "their words are missing"); if (!out.changes.buttons.includes("Edit and send again")) fail("the client's ask has no Edit and send again");
has("approved", /Publish exactly what they approved, then Mark live/, "approved isn't \"publish\""); if (!out.approved.buttons.includes("Mark live")) fail("approved: no Mark live"); if (out.approved.pill !== "Publish") fail("approved: chip isn't \"Publish\"");
has("live", /They approved it[\s\S]*Published[\s\S]*Read back from the live page/, "live doesn't show its checks"); if (out.live.pill !== "Live") fail("live: chip isn't \"Live\"");
has("right", /Already right · nothing needed changing/, "already right isn't said"); if (out.right.pill !== "Already right") fail("already right: chip isn't \"Already right\"");
// the prefill reads a run's field in EITHER shape a run writes it ("H1: words" or "**H1**" + the words on the next line)
{ const AD = read("netlify/functions/admin-deliverables.js"), i = AD.indexOf("  const line = (re) => {"), j = AD.indexOf("  let html = \"\";", i);
  if (i < 0 || j < 0) { console.error("⚠️  INDETERMINATE — the prefill reader moved"); process.exit(2); }
  const f = new Function("draft", `${AD.slice(i, j)}; return [line(/H1:\\s*(.+)/i), line(/PRIMARY_CTA:\\s*(.+)/i), line(/TITLE:\\s*(.+)/i)];`);
  const a1 = f("Here is the hero:\n---\n**H1**\nLocal SEO That Puts Your Business on the Map\n**PRIMARY_CTA**\nGet Your Free Audit"), a2 = f("TITLE: SEO Company in Culver City | RGA");
  if (a1[0] !== "Local SEO That Puts Your Business on the Map" || a1[1] !== "Get Your Free Audit") fail("a \"**H1**\" + next-line draft fills nothing (row 43's September draft read as \"didn't come out right\")");
  if (a2[2] !== "SEO Company in Culver City | RGA") fail("a \"TITLE: words\" draft no longer fills"); }
// the wiring the browser can't see
if (!/if \(t\.hasAttribute\("data-ob-wc-savesend"\)\) \{/.test(A) || !/site_action: "save", change: pre \}\);[\s\S]{0,200}internal_decision: "approved"/.test(A)) fail("Send for approval on a draft doesn't save it and send it");
if (!/\$\{gsQ \? gPill\(gsQ, s\.task\) : wcRowPill\(o\.flowId, s\.task\) \? wcRowPillHtml\(o\.flowId, s\.task\)/.test(A) || !/if \(!declined && wcRowPill\(o\.flowId, s\.task\)\) return wcRowPillHtml\(o\.flowId, s\.task\);/.test(A)) fail("the row's chip isn't the website state (queued / done rows)");
if (F.length) { console.error(`❌ the website rows aren't the approved step 8 cards — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log(`✅ the website rows are the approved step 8 cards: ${Object.keys(out).length} states rendered in Chrome — draft it · not proven · draft ready (one Send, the guarantee flagged) · failed · editing (no Kind/Where boxes) · send it · with the client · client asked · publish · live · already right — one card, no box in a box, one chip each`);
