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
  line(/^const WC_LB_ICON = [^\n]*;$/m, "WC_LB_ICON"), fn("wcLabelHtml"), line(/^const wcFileVerb = [^\n]*;$/m, "wcFileVerb"), fn("acCardHtml"), fn("acDueChip"), fn("wcDiffHtml"), fn("wcRiskHtml"), fn("wcFormHtml"), fn("wcNewPageHtml"), fn("wcRowPill"), line(/^const wcRowPillHtml = [^\n]*;$/m, "wcRowPillHtml"),
  // approval_tab_and_sent_card_v1 (10-28): the whole trip + what they're approving
  line(/^const wcMergeBy = [^\n]*;$/m, "wcMergeBy"), line(/^const wcTime = [^\n]*;$/m, "wcTime"), fn("wcLoopHtml"),
  // publish_safety_checks_v1 (10-28): the safety panel, who merged, the after-check
  line(/^const wcSafetyCache = [^\n]*$/m, "wcSafetyCache"), line(/^const wcRestAsked = [^\n]*$/m, "wcRestAsked"), line(/^const WC_DAY = [^\n]*;$/m, "WC_DAY"), fn("ghIdHtml"), fn("ghPillText"), fn("ghClientName"), fn("ghBandHtml"), fn("ghPanelHtml"), fn("wcSafetyPanel"), fn("wcMergedHtml"), fn("wcRestHtml"), fn("wcProofHtml"), line(/^const WC_EYE = [^\n]*;$/m, "WC_EYE"), line(/^const wcPathOf = [^\n]*;$/m, "wcPathOf"), fn("wcWhatHtml"), fn("siteChangeAdminHtml")].join("\n");

let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer isn't installed"); process.exit(2); }
const SHOTS = (process.argv.find((a) => a.startsWith("--shots=")) || "").slice(8);
const H = "m1.web.h1_cta", NOW = "2026-10-27T18:00:00Z";
const items = [{ label: "Main headline", before: "Rank Higher on Google Maps and Build a Predictable Pipeline", after: "Local SEO That Puts Your Business on the Map" },
  { label: "Line under the headline", before: "", after: "Honest reporting, 60-Day Guarantee" }, { label: "Main button", before: "See Where You Rank Free", after: "Get Your Free Google Listing Audit" }];
const change = { v: "v1", kind: "visible", where: "Your homepage", items, drafted_at: NOW };
const T = "m1.access.publish_test";
const tchange = { v: "v1", kind: "visible", new_page: true, label: "add_page", where: "A test page on your website, hidden from Google", page_url: "https://www.acme.test/rga-access-test/", drafted_at: NOW,
  items: [{ label: "Page title", after: "Website access check | Acme" }, { label: "Main headline", after: "This page checks that approved changes reach your website" }, { label: "What the page says", after: "Acme's agency published this page after you approved it." }],
  files: [{ path: "rga-access-test/index.html", action: "add", note: "a test page, hidden from Google" }] };
const tbuild = { v: "v1", built_at: NOW, preview_url: "/.netlify/functions/site-preview?x", files: [{ path: "rga-access-test/index.html", action: "add", sha: "201cd46c0f0e0d0c", size: 27780, html: "<html></html>" }] };
const ran = { auto_result: { summary: "H1: …", ran_at: NOW, outcome_data: {} } };
const S = {
  draftit: { task: { status: "pending" } },
  notproven: { task: { status: "done", completed_at: "2026-09-14T17:00:00Z" } },
  ready: { task: { status: "in_progress", ...ran }, pre: change },
  failed: { task: { status: "in_progress", auto_result: { summary: "The draft broke the page rules, so nothing was saved:\n- not JSON", ran_at: NOW, outcome_data: { problems: ["the answer wasn't the page's words (not JSON)"] } } }, pre: { items: [] } },
  editing: { task: { status: "in_progress", ...ran }, pre: change, edit: true },
  unread: { task: { status: "in_progress", ...ran }, pre: { items: [], read_failed: true } },
  stale: { task: { status: "in_progress", ...ran }, pre: { items: [] }, stale: true },
  drafted: { task: { status: "in_progress", site_change: change } },
  sent: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW } } },
  changes: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "changes_requested", change_v: "v1", at: NOW, note: "Keep the button as See Where You Rank Free" } } },
  approved: { task: { status: "in_progress", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: change } } },
  live: { task: { status: "done", site_change: change, internal_review: { decision: "approved", change_v: "v1", at: NOW }, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test" }, published: { v: "v1", at: NOW, by: "hello@", url: "https://x.test/", checked: true, check_note: "Read back from https://x.test/" } } },
  // the access test on GitHub access (approval_tab_and_sent_card_v1): 6 stops — built · sent · approves · pull request · merge · live
  ghSent: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild } },
  ghApproved: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange } } },
  ghPr: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange }, publish_pr: { v: "v1", number: 14, url: "https://github.com/acme/site/pull/14", at: NOW } } },
  ghPrClient: { id: T, gh: true, mergeBy: "client", task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange }, publish_pr: { v: "v1", number: 14, url: "https://github.com/acme/site/pull/14", at: NOW, head: "abc" } } },
  ghMerged: { id: T, gh: true, task: { status: "in_progress", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_change: tchange }, publish_pr: { v: "v1", number: 14, url: "https://github.com/acme/site/pull/14", at: NOW, head: "abc", merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", base: "main" } } } },
  ghLiveProven: { id: T, gh: true, task: { status: "done", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild,
    approval: { decision: "approved", change_v: "v1", at: NOW, by: "owner@x.test", approved_build: [{ path: "rga-access-test/index.html", action: "add", sha: "201cd46c0f0e0d0c" }] },
    publish_safety: { checks: [{ id: "website", ok: true, detail: "The page goes on acme.test." }, { id: "repo_is_site", ok: true, detail: "acme/site: their address is written in its CNAME." }], pr_files: [{ path: "rga-access-test/index.html", action: "add" }], repo: "acme/site", site: "acme.test" },
    publish_pr: { v: "v1", number: 2, branch: "rga/add-page-x", at: NOW, merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", by_person: "hello@", base: "main", sha: "d907d73abc", branch_deleted_at: NOW } },
    publish_before: { pages: [{ url: "https://acme.test/", read: true }] }, publish_after: { at: NOW, ok: true, read: 25, of: 25, changed: [], unread: [] },
    published: { v: "v1", at: NOW, by: "RGA (automatic)", url: "https://www.acme.test/rga-access-test/", checked: true, fingerprint: { match: true, want: "201cd46c", got: "201cd46c" } } } },
  ghLivePartial: { id: T, gh: true, task: { status: "done", site_change: tchange, internal_review: { decision: "approved", change_v: "v1", at: NOW }, site_build: tbuild, approval: { decision: "approved", change_v: "v1", at: NOW },
    publish_pr: { v: "v1", number: 2, at: NOW, merged: { at: NOW, by: "rocketgrowthagency-admin", via: "rga", base: "main" } }, published: { v: "v1", at: NOW, checked: true } } },
  right: { task: { status: "done", no_change_needed: { note: "One phone number on every page", at: NOW, by: "RGA" } } },
};
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const out = {};
try {
  for (const [name, sc] of Object.entries(S)) {
    const page = await browser.newPage(); await page.setViewport({ width: 1000, height: 900 });
    await page.setContent(`<style>${CSS}</style><div class="ob-step" style="max-width:940px;margin:16px"><div id="h"></div></div>`);
    out[name] = await page.evaluate(({ SCJS, code, sc, H, name }) => {
      const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"), escapeAttribute = escapeHtml;   // = admin.js escapeHtml
      const adminGcardWhen = () => "Oct 27, 11:00 AM", renderOnboardingChecklist = () => {}, movesForSelected = () => [], mvDueDays = () => 0, mvDay = () => "Oct 27";
      const wcAction = async () => null, GH_MONO = "", OB_WEB_TILE = "";
      // the GitHub connection panel (names_not_addresses_v1) from a fixed read-only check — never a fetch
      const ghConnOf = () => ({ ok: true, match: true, checked_at: "2026-10-28T20:00:00Z", login: "rocketgrowthagency-admin", repo: "acme/site", owner: "acme", site: "acme.test",
        rows: [{ id: "account", ok: true, title: "The account they invited is the one we post as", detail: "The client invited rocketgrowthagency-admin on Oct 26. Our key is the same account today.", ev: "Oct 26 → today" }] });
      const state = { onboardingData: sc.gh ? { tasks: { "m1.access.website": { access: { repo: "acme/site" }, ...(sc.mergeBy ? { merge_by: { by: sc.mergeBy } } : {}) } } } : undefined, selectedClient: { id: "c1", business_name: "Acme" }, flowM1Playbook: [{ id: H, title: "Fix H1 + primary CTA", clientLabel: "Homepage headline + main button", hasRunner: true }] };
      eval(SCJS);   // globalThis.rgaSiteChange
      // eslint-disable-next-line no-eval
      const api = eval(`(() => { ${code}; return { wcDraftCache, wcEditing, siteChangeAdminHtml, wcRowPill, ghPillText, ghPanelHtml, ghBandHtml }; })()`);
      const sig = `${sc.task.ran_at || (sc.task.auto_result && sc.task.auto_result.ran_at) || sc.task.completed_at || ""}|${String((sc.task.auto_result && sc.task.auto_result.summary) || "").length}`;
      if (sc.pre) api.wcDraftCache.set(`c1:${H}`, { ...sc.pre, _run: sc.stale ? "an older run" : sig });
      if (sc.edit) api.wcEditing.add(`c1:${H}`);
      const el = document.getElementById("h"); el.innerHTML = api.siteChangeAdminHtml(sc.id || H, sc.task);
      const vis = (q) => [...el.querySelectorAll(q)].filter((x) => x.offsetParent !== null);
      const nested = [...el.querySelectorAll(".ob-ac form, .ob-ac .ob-wc-line")].some((x) => { const s = getComputedStyle(x); return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && s.backgroundColor !== "rgba(0, 0, 0, 0)"; });
      // the pill helper on a hostile sentence: the text around it is escaped, a name inside another name never splits it
      const pillT = api.ghPillText("<img src=x> by acme into acme/site", [["acme", "login"], ["acme/site", "repo"]]);
      if (state.onboardingData && sc.task.publish_pr) state.onboardingData.tasks["m1.access.publish_test"] = sc.task;   // the footer's "Last merged here"
      const ghp = document.createElement("div"); ghp.innerHTML = api.ghPanelHtml({ github: "rocketgrowthagency-admin", repo: "acme/site" }, true);
      document.body.appendChild(ghp);   // measured with admin.css (Chris 10-28 3:16 PM: "too close together")
      const box = ghp.querySelector(".ob-ghp-g > div"), rowSmall = ghp.querySelector(".ob-safe-l small");
      const panel = { text: ghp.textContent.replace(/\s+/g, " "), html: ghp.innerHTML,
        pad: box ? getComputedStyle(box).paddingTop : "", lblMb: box ? getComputedStyle(box.querySelector(".lbl")).marginBottom : "", nameMb: box ? getComputedStyle(box.querySelector("b")).marginBottom : "",
        rowPad: ghp.querySelector(".ob-safe-l li") ? getComputedStyle(ghp.querySelector(".ob-safe-l li")).paddingTop : "",
        band: ghp.querySelector(".ob-ghcv") ? { cls: ghp.querySelector(".ob-ghcv").className, text: ghp.querySelector(".ob-ghcv").textContent.replace(/\s+/g, " "), bg: getComputedStyle(ghp.querySelector(".ob-ghcv")).backgroundColor } : null,
        bad: (() => { const d = document.createElement("div"); d.innerHTML = api.ghBandHtml({ match: false, checked_at: "2026-10-28T20:00:00Z", rows: [{ ok: true, title: "a" }, { ok: false, title: "Our key isn't the account the client invited" }] }); return d.textContent.replace(/\s+/g, " "); })(),
        err: (() => { const d = document.createElement("div"); d.innerHTML = api.ghBandHtml({ error: true }); return d.textContent.replace(/\s+/g, " "); })(), lh: rowSmall ? parseFloat(getComputedStyle(rowSmall).lineHeight) / parseFloat(getComputedStyle(rowSmall).fontSize) : 0 };
      return { panel, pillT, text: el.textContent.replace(/\s+/g, " "), html: el.innerHTML, buttons: vis("button, a.admin-button").map((b) => b.textContent.trim()), inputs: vis("input:not([type=hidden]), select").length,
        textareas: vis("textarea").length, label: (el.querySelector(".ob-ac-st") || {}).textContent || "", pill: (api.wcRowPill(H, sc.task) || {}).text || "", nested, cards: el.querySelectorAll(".ob-ac").length, checks: el.querySelectorAll(".ob-ac-ck li").length,
        loop: [...el.querySelectorAll(".ob-wc-loop li")].map((li) => li.className), tone: (el.querySelector(".ob-ac") || {}).className || "",
        loopOneRow: (() => { const l = el.querySelector(".ob-wc-loop"); if (!l) return null; const t = [...l.children].map((x) => Math.round(x.getBoundingClientRect().top)); return new Set(t).size === 1; })(),
        // 10-28 (Chris, 10:09): every stop's name sits on one line across the trip, whatever the length of its note
        proofUnk: el.querySelectorAll(".ob-proof-r.unk").length,
        loopLevel: (() => { const l = el.querySelector(".ob-wc-loop"); if (!l) return null; return new Set([...l.querySelectorAll("li > b")].map((b) => Math.round(b.getBoundingClientRect().top))).size === 1; })() };
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
has("failed", /The draft didn't come out right/, "a failed draft doesn't say so"); has("stale", /Reading the draft…/, "a reading of an OLDER run is shown over the new draft (10-28: \"didn't come out right\" over a good draft)"); has("unread", /Couldn't read the draft/, "a draft we couldn't LOAD is called a bad draft"); if (!out.unread.buttons.includes("Try again") || /didn't come out right/.test(out.unread.text)) fail("couldn't read: no Try again, or it says the draft is bad"); if (!out.failed.buttons.includes("⚡ Draft again")) fail("a failed draft has no Draft again");
if (out.editing.inputs) fail(`editing: shows ${out.editing.inputs} Kind / Where / address input(s) (the step sets them)`);
if (out.editing.textareas !== 3 || !/Now: “Rank Higher on Google Maps/.test(out.editing.text) || !out.editing.buttons.includes("Save and send for approval") || !out.editing.buttons.includes("Cancel")) fail("editing: not one box per line with today's words above it, Save and send + Cancel");
has("drafted", /Your move · send it/, "a saved draft isn't \"send it\"");
// 🔄 approval_tab_and_sent_card_v1 (10-28): the checks became the whole trip — every state shows every stop, the current one marked
const loopIs = (name, want, why) => { const got = (out[name].loop || []).join(","); if (got !== want.join(",")) fail(`${name}: the trip reads [${got}], should be [${want.join(",")}] — ${why}`); if (out[name].loopOneRow === false) fail(`${name}: the trip wraps onto two rows at 1000px`); if (out[name].loopLevel === false) fail(`${name}: the stops' names don't sit level (a 2-line note pushes its neighbours — Chris 10-28 10:09)`); };
has("sent", /With the client · in their For your approval/, "sent isn't \"With the client · in their For your approval\""); loopIs("sent", ["done", "done", "now", "", ""], "drafted · sent ticked, the client's approval current (blue)");
if (/\bwait\b/.test(out.sent.tone) || /\byou\b/.test(out.sent.tone)) fail(`sent: the card is "${out.sent.tone}" — with the client is BLUE (state system decision 1), never the grey "over"`);
if (!out.sent.buttons.includes("Take it back to edit")) fail("sent: no Take it back to edit"); if (out.sent.pill !== "With the client") fail("sent: chip isn't \"With the client\"");
for (const k of Object.keys(out)) if (/\b1 (files|lines|pages)\b/.test(out[k].text)) fail(`${k}: says "1 files/lines/pages"`);
has("ghSent", /Adding a page/, "the sent card loses its label"); loopIs("ghSent", ["done", "done", "now", "", "", ""], "built · sent ticked, approves current, then pull request · merge · live");
has("ghSent", /Built[\s\S]*1 file[\s\S]*Sent[\s\S]*Approves it[\s\S]*Pull request[\s\S]*Merge[\s\S]*Live, read back/, "the six stops aren't named in order");
has("ghSent", /Built from\s*their live homepage's design · fingerprint 201cd46c \(27\.8 KB\), frozen when they approve/, "the facts don't show the fingerprint and size");
if (!out.ghSent.buttons.includes("Preview page")) fail("ghSent: no Preview page"); has("ghSent", /See their card, word for word/, "their card isn't one click away");
loopIs("ghApproved", ["done", "done", "done", "you", "", ""], "approved → the pull request is RGA's move (amber)"); has("ghApproved", /Your move · open the pull request/, "approved on GitHub isn't \"Your move · open the pull request\""); if (!out.ghApproved.buttons.includes("Open the pull request")) fail("ghApproved: no Open the pull request");
// 🔄 merge_without_the_browser_v1 (10-28): RGA merges on the server by default — never the browser's GitHub account
loopIs("ghPr", ["done", "done", "done", "done", "you", ""], "the pull request is open → RGA merges it for the client (amber)"); has("ghPr", /Your move · merge it for the client/, "an open pull request isn't \"Your move · merge it for the client\""); if (!out.ghPr.buttons.includes("Merge #14 for the client") || !out.ghPr.buttons.includes("View on GitHub ↗")) fail("ghPr: no Merge #14 for the client / View on GitHub");
loopIs("ghPrClient", ["done", "done", "done", "done", "now", ""], "the client chose to merge → theirs on GitHub (blue)"); has("ghPrClient", /With the client · merge #14 on GitHub/, "the client-merges path isn't \"With the client · merge #14 on GitHub\""); if (out.ghPrClient.buttons.some((b) => /for the client|for them/.test(b))) fail("ghPrClient: RGA offers to merge although the client chose to");
loopIs("ghMerged", ["done", "done", "done", "done", "done", "you"], "merged → Mark live is RGA's move"); has("ghMerged", /Merged #14/, "a merged pull request isn't said"); has("ghMerged", /for the client, after their approval/, "RGA's merge isn't recorded as for the client, after their approval"); if (!out.ghMerged.buttons.includes("Mark live")) fail("ghMerged: no Mark live");
has("changes", /The client asked for a change/, "the client's ask isn't shown"); has("changes", /Keep the button as See Where You Rank Free/, "their words are missing"); if (!out.changes.buttons.includes("Edit and send again")) fail("the client's ask has no Edit and send again");
has("approved", /Publish exactly what they approved, then Mark live/, "approved isn't \"publish\""); loopIs("approved", ["done", "done", "done", "you", ""], "approved → publishing is RGA's move (amber)"); if (!out.approved.buttons.includes("Mark live")) fail("approved: no Mark live"); if (out.approved.pill !== "Publish") fail("approved: chip isn't \"Publish\"");
has("live", /Live · read back from the site/, "live doesn't say it was read back");
// auto_live_and_proof_v1: the Proof box — 9 of 9 only from the record; a line not proven is grey, never a tick
// 🔒 names_not_addresses_v1 (Chris 10-28 "make these rocketgrowthagency-admin more like a pill"): a GitHub login / repository in admin is a pill
if (!/<span class="ob-ghid"><span class="a r" aria-hidden="true">R<\/span>rocketgrowthagency-admin<\/span>/.test(out.ghMerged.html)) fail("ghMerged: the merging account isn't in its pill (ob-ghid)");
if (!/<span class="ob-ghid"><span class="a g" aria-hidden="true">G<\/span>acme\/site<\/span>/.test(out.ghMerged.html)) fail("ghMerged: the repository isn't in its pill (ob-ghid, G)");
{ const pt = out.ghMerged.pillT || "";
  if (/<img/.test(pt) || !/^&lt;img src=x&gt; by /.test(pt)) fail(`ghPillText doesn't escape the sentence around the pills: ${pt.slice(0, 80)}`);
  if (!/<span class="ob-ghid"><span class="a g" aria-hidden="true">G<\/span>acme\/site<\/span>$/.test(pt) || (pt.match(/ob-ghid/g) || []).length !== 2) fail(`ghPillText splits one name inside another (want 2 pills, the repo whole): ${pt.slice(-140)}`); }
{ const P = out.ghMerged.panel;
  if (!/RGA posts as\s*RGA Admin/.test(P.text) || !/Into the client's website code\s*Acme/.test(P.text) || !/Goes live on acme\.test/.test(P.text)) fail(`the GitHub panel's boxes aren't name-first (RGA Admin → the client's name · Goes live on): ${P.text.slice(0, 200)}`);
  if ((P.html.match(/class="ob-ghid"/g) || []).length < 4) fail(`the GitHub panel doesn't pill every login / repository (boxes, the check row, the footer): ${(P.html.match(/class="ob-ghid"/g) || []).length} pills`);
  if (/Into their repository|it publishes|Owner: /.test(P.text)) fail("the GitHub panel still says the old addresses-first wording");
  // 🔒 step8_spacing_v1 (approved 10-28, Chris "too crampt"): box 16px · label → name 8px · name → pill 10px · rows 14px · a pill row on 1.8
  if (P.pad !== "16px" || P.lblMb !== "8px" || P.nameMb !== "10px") fail(`the GitHub panel's boxes are packed again (padding ${P.pad}, label ${P.lblMb}, name ${P.nameMb}; the mockup is 16px / 8px / 10px)`);
  if (P.rowPad !== "14px") fail(`the GitHub panel's check rows are packed again (${P.rowPad}; the mockup is 14px)`);
  if (!(P.lh >= 1.75)) fail(`a check row with a pill sits on a tight line (${P.lh.toFixed(2)}; the mockup is 1.8)`);
  // the CONNECTION VERIFIED band, in the state colours (green · red · grey), always saying what it checked
  if (!P.band || !/Connection verified/.test(P.band.text) || !/RGA Admin can post to the Acme website code · (\d+) of \1 checks match/.test(P.band.text) || P.band.bg !== "rgb(227, 241, 223)") fail(`the panel doesn't open on a green "Connection verified" band naming the client and the checks (${P.band && P.band.text} · ${P.band && P.band.bg})`);
  if (!/Connection not verified/.test(P.bad) || !/Our key isn't the account the client invited · nothing opens or merges/.test(P.bad)) fail(`a mismatch isn't a "Connection not verified" band naming what failed (${P.bad})`);
  if (!/Couldn't check the connection/.test(P.err) || !/Check the connection now/.test(P.err)) fail(`GitHub not answering isn't the grey "Couldn't check the connection" band with its button (${P.err})`); }
if (!/Merged<\/b><span>by <span class="ob-ghid">/.test(out.ghLiveProven.html)) fail("the Proof box's Merged line doesn't put the account in its pill");
has("ghLiveProven", /Proof · every step, on record\s*9 of 9/, "a fully proven change doesn't show Proof 9 of 9");
has("ghLiveProven", /the live page's fingerprint = 201cd46c, the approved file/, "the Proof box doesn't say the live page IS the approved file");
has("ghLiveProven", /Live · proven/, "a fully proven change isn't labelled \"Live · proven\" (mockup C)"); has("ghLiveProven", /acme\.test = their record = their approval/, "the Proof's website line isn't the mockup's \"= their record = their approval\"");
if (/Live · proven/.test(out.ghLivePartial.text)) fail("a change with missing proof is labelled \"Live · proven\"");
if (out.ghLivePartial.proofUnk !== 6 || /9 of 9/.test(out.ghLivePartial.text) || !/not recorded \(merged before this was built, or not deleted\)/.test(out.ghLivePartial.text) || !/not fingerprinted/.test(out.ghLivePartial.text)) fail("a change with missing proof still shows 9 of 9 / ticks (a line not proven must be grey with why)"); loopIs("live", ["done", "done", "done", "done", "done"], "live and read back → every stop ticked"); if (out.live.pill !== "Live") fail("live: chip isn't \"Live\"");
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
