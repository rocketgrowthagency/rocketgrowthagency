#!/usr/bin/env node
// check-an-approval-shows-its-receipt.mjs — 2026-10-28, approved approval_confirmed_v1. Chris (9:01, after pressing Approve on the
// test page): "after clicking approve we need some card showing approved confirmed or something as it just lands here. with such a big
// change i think it needs to be more clear that the approval was confirmed" — the screen read "Nothing is waiting for your approval"
// and the approved row said "You asked for a change · RGA is revising it" (approved items shared the "rga" group).
// RENDERS For your approval in Chrome with portal.css and the tab's own code lifted from portal.js, as the client sees it the moment
// after Approve, and checks:
//   · the item they approved is OPEN (never "Nothing is waiting"), even when another change still waits
//   · its card is the receipt: green "Approved · recorded", "You approved <the label's verb>", when + who, the exact version, What
//     happens next (approved ✓ · RGA uploads = current, blue), Preview what you approved
//   · the row under "Approved · going up" says "You approved it … · RGA is putting it up" — never "You asked for a change"
//   · once RGA opens the upload the card turns blue "RGA is uploading it" (step 2 ✓, step 3 current)
//   · the words follow the label (removing a page) and a change with no built file says "Exactly what you approved"
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), CSS = read("portal/portal.css");
// lift a top-level `function X(` / `const X =` from portal.js: whole lines until its braces close
const lift = (name) => {
  const m = new RegExp(`^(?:async )?function ${name}\\(|^const ${name} = `, "m").exec(P);
  if (!m) { console.error(`⚠️  INDETERMINATE — ${name} moved`); process.exit(2); }
  const lines = P.slice(m.index).split("\n"); let depth = 0, out = [];
  for (const l of lines) { out.push(l); for (const ch of l) { if (ch === "{") depth++; else if (ch === "}") depth--; } if (depth <= 0 && /[;}]\s*$/.test(l)) break; }
  return out.join("\n");
};
const code = ["IB_SVG", "IB_ICON", "IB_LABELS", "ibLabelHtml", "FYA_SURF", "fyaSurf", "ibIcon", "ibIsPage", "ibPageName", "ibTitle", "ibSub", "fyaSafetyHtml", "fyaReceiptHtml", "fyaHtml"].map(lift).join("\n");
let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { console.error("⚠️  INDETERMINATE — puppeteer isn't installed"); process.exit(2); }

const AT = "2026-10-28T16:01:29Z", T = "m1.access.publish_test";
const add = { label: "add_page", new_page: true, where: "A test page on your website, hidden from Google", page_url: "https://www.acme.test/rga-access-test/", preview_url: "/.netlify/functions/site-preview?x", files: [{ path: "rga-access-test/index.html", action: "add" }] };
const item = (key, change, approval, extra = {}) => ({ key, title: "A test page, to check we can publish", surface: "website", change, approval, ...extra });
const CASES = {
  justApproved: { focus: T, items: [item(T, add, { decision: "approved", at: AT, by: "owner@acme.test", version: "201cd46c" }), item("m1.web.h1_cta", { label: "edit_page", where: "Your homepage", items: [] }, null, { title: "Your homepage headline" })] },
  uploading: { items: [item(T, add, { decision: "approved", at: AT, by: "owner@acme.test", version: "201cd46c" }, { uploading: true })] },
  // names_not_addresses_v1 (10-28): the "Checked before and after" box says the business's NAME, never its address or a fingerprint
  checked: { focus: T, biz: "Smiths Plumbing", items: [item(T, add, { decision: "approved", at: AT, by: "owner@acme.test", version: "201cd46c" }, { uploading: true, safety: { site: "acme.test", files: true, rest: true } })] },
  checkedNoName: { focus: T, biz: "", items: [item(T, add, { decision: "approved", at: AT, by: "owner@acme.test", version: "201cd46c" }, { uploading: true, safety: { site: "acme.test", files: true, rest: true } })] },
  // 🔒 step3_finish_v1 D (Chris 10-28 5:01 PM): a finished change from the step's HISTORY stays in What RGA did — read-only, no Ask to undo
  history: { focus: `${T}~0`, items: [item(`${T}~0`, add, { decision: "approved", at: AT, by: "owner@acme.test", version: "201cd46c" }, { history: true, site_state: "live", site_live: { at: "2026-10-28T20:25:17Z" } }),
    item(T, add, { decision: "approved", at: AT, by: "owner@acme.test", version: "201cd46c" }, { site_state: "live", site_live: { at: "2026-10-28T21:00:00Z" } })] },
  removing: { focus: T, items: [item(T, { ...add, label: "remove_page", removes_page: true, new_page: false, preview_url: null }, { decision: "approved", at: AT, by: "owner@acme.test", version: null })] },
};
const F = [], fail = (m) => F.push(m);
const SHOTS = (process.argv.find((x) => x.startsWith("--shots=")) || "").slice(8);
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const out = {};
try {
  for (const [name, sc] of Object.entries(CASES)) {
    const page = await b.newPage(); await page.setViewport({ width: 1280, height: 1000 });
    await page.setContent(`<style>${CSS}</style><div class="pv-fya-host" id="h"></div>`);
    out[name] = await page.evaluate(({ code, sc }) => {
      const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml;
      const ibPaneHtml = (e) => `<p class="stub-pane">${escapeHtml(e.d.title)}</p>`, _portalBusinessName = sc.biz === undefined ? "Acme" : sc.biz;
      let _fyaFocus = sc.focus || null;
      const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
      // eslint-disable-next-line no-eval
      const api = eval(`(() => { ${code}; return { fyaHtml }; })()`);
      const el = document.getElementById("h"); el.innerHTML = api.fyaHtml(sc.items, when, "");
      const open = [...el.querySelectorAll("[data-ib-pane]")].find((p) => !p.hidden);
      const rc = open && open.querySelector(".fya-rc");
      const tiles = [...el.querySelectorAll(".ib-qi .fya-g")].map((x) => x.textContent);
      const did = [...el.querySelectorAll(".ib-qi.done")].length, undos = [...el.querySelectorAll("[data-ib-pane]")].map((p) => !!p.querySelector("[data-ib-undo-show]"));
      return { tiles, did, undos, open: open ? open.textContent.replace(/\s+/g, " ") : "", rows: [...el.querySelectorAll(".ib-qi")].map((r) => r.textContent.replace(/\s+/g, " ").trim()),
        steps: rc ? [...rc.querySelectorAll(".fya-nx li")].map((li) => li.className) : [], up: rc ? rc.classList.contains("up") : null,
        safe: open && open.querySelector(".fya-safe") ? open.querySelector(".fya-safe").textContent.replace(/\s+/g, " ") : "", head: rc ? getComputedStyle(rc.querySelector(".fya-rc-h")).backgroundColor : "", see: !!(open && open.querySelector("a.fya-rc-see")) };
    }, { code, sc });
    await page.close();
  }
  // 🔒 for_your_approval_add_remove_v5 (approved 10-28): the REAL card for a page to add / take off, in Chrome with portal.css
  const pcode = code + "\n" + ["ibDiffParts", "ibChangedPlaces", "ibDiff", "ibChgHtml", "ibPreviewHtml", "ibChangeHtml", "ibCrumb", "ibReadTime", "ibPaneHtml"].map(lift).join("\n");   // the old long card too, so a fall-back is SEEN (fails), not a crash
  for (const [name, change] of [["addCard", { ...add, items: [{ label: "Page title", role: "title", after: "Website access check | Rocket Growth Agency" }] }],
    ["rmCard", { ...add, label: "remove_page", removes_page: true, new_page: false, preview_url: null, removed_title: "Website access check | Rocket Growth Agency", items: [{ label: "What stops working", before: "acme.test/rga-access-test/", after: "", note: "x" }] }]]) {
    const page = await b.newPage(); await page.setViewport({ width: 900, height: 900 });
    await page.setContent(`<style>${CSS}</style><div class="pv-fya-host"><div class="ib-d" id="h"></div></div>`);
    out[name] = await page.evaluate(({ pcode, change }) => {
      const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml, _portalBusinessName = "Acme";
      const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
      // eslint-disable-next-line no-eval
      const api = eval(`(() => { ${pcode}; return { ibPaneHtml, ibTitle, ibSub }; })()`);
      const d = { key: "m1.access.publish_test", title: "A test page, to check we can publish", surface: "website", blurb: "Why this helps text", change, approval: null, prepared_at: "2026-10-28T16:00:00Z" };
      const el = document.getElementById("h"); el.innerHTML = api.ibPaneHtml({ group: "needs", type: "item", d }, when);
      return { text: el.textContent.replace(/\s+/g, " ").trim(), html: el.innerHTML, row: api.ibTitle({ d }) + " | " + api.ibSub({ group: "needs", d }, when) };
    }, { pcode, change });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    await page.close();
  }
} catch (e) { console.error(`⚠️  INDETERMINATE — the tab's code didn't run: ${String(e.message).split("\n")[0]}`); process.exit(2); } finally { await b.close(); }

const J = out.justApproved, U = out.uploading, R = out.removing;
// 🔒 approval_receipt_simple_v1 (approved 10-28): the receipt = "Approved" · what they approved · when · the page · three plain steps.
// Their sign-in and the exact version stay in OUR record, never on their screen; no dead "Back to For your approval" link.
if (/Nothing is waiting for your approval\. Tap/.test(J.open) || !/Approved/.test(J.open)) fail("after Approve the item they approved isn't open as its receipt (the screen says \"Nothing is waiting\" — Chris, 9:01)");
if (!/You approved this page/.test(J.open) || !/acme\.test\/rga-access-test\//.test(J.open)) fail("the receipt doesn't say what they approved and which page");
if (/by owner@acme\.test|201cd46c|The exact version|this file uploads|saved with the date|Back to For your approval/.test(J.open)) fail("the receipt shows our record's detail (their sign-in, the version, the saved-note) or the dead Back link again");
if (J.steps.join(",") !== "done,now," || !/We put it on your website/.test(J.open) || !/We check it's live/.test(J.open)) fail(`What happens next isn't [approved ✓ · we put it on = current · we check it's live] (${J.steps.join(",")})`);
if (!J.see) fail("the receipt has no Preview what you approved");
if (J.head !== "rgb(227, 241, 223)") fail(`the receipt's header isn't the state system's done green (${J.head})`);
if (J.rows.some((r) => /You asked for a change/.test(r) && /A test page/.test(r))) fail("an approved change reads \"You asked for a change\" (the 9:01 bug)");
if (!J.rows.some((r) => /New page · you approved it \d+:\d\d (AM|PM)/.test(r))) fail(`the row under Approved · going up doesn't say "New page · you approved it <time>" (${J.rows.join(" | ")})`);
if (U.steps.join(",") !== "done,now," || U.head !== "rgb(227, 241, 223)" || /uploading/i.test(U.open)) fail(`once RGA opens the upload the receipt changes its look or words (it stays: approved ✓ · we put it on = current) (${U.steps.join(",")} · ${U.head})`);
if (!/You approved taking this page off/.test(R.open) || !/We take it off your website/.test(R.open) || !/We check it's gone/.test(R.open)) fail("the receipt's words don't follow a removal (taking it off · we check it's gone)");
{ const C = out.checked.safe, N = out.checkedNoName.safe;
  if (!/It went to the Smiths Plumbing website, nowhere else\./.test(C) || /acme\.test/.test(C)) fail(`the safety box doesn't name the business (or still shows its address): ${C.slice(0, 160)}`);
  if (!/Exactly the version you approved\./.test(C) || /201cd46c/.test(C)) fail(`the safety box still shows the fingerprint, not "Exactly the version you approved": ${C.slice(0, 160)}`);
  if (/Plumbing's/.test(C)) fail("the safety box uses a possessive on the business name");
  if (!/It went to your website, nowhere else\./.test(N)) fail(`with no business name on record the safety box doesn't say "your website": ${N.slice(0, 120)}`); }
{ const H = out.history;
  if (H.tiles.join("") !== "++") fail(`a page change's row doesn't carry its + tile (v5): ${JSON.stringify(H.tiles)}`);
  if (H.did !== 2) fail(`a finished change from the step's history isn't in What RGA did (${H.did} of 2 done rows)`);
  // the pane is stubbed in this harness: the rule that a history item never offers Ask to undo is pinned in the source
  if (!/const undo = d\.site_live && !d\.history \? \(d\.undo_request/.test(fs.readFileSync(`${SITE}/portal/portal.js`, "utf8"))) fail("a change from the step's history offers Ask to undo (it must be the latest change only)");
  // and the server sends the history: every finished change in site_change_log, as a read-only item, with its proof kept on save
  const PD = fs.readFileSync(`${SITE}/netlify/functions/portal-deliverables.js`, "utf8"), ADx = fs.readFileSync(`${SITE}/netlify/functions/admin-deliverables.js`, "utf8");
  if (!/\(t\.site_change_log \|\| \[\]\)\.forEach\(\(h, i\) => \{/.test(PD) || !/key: `\$\{key\}~\$\{i\}`, history: true/.test(PD)) fail("the portal isn't sent the step's earlier finished changes (What RGA did loses them on the next draft)");
  // 11-6 night fixer: the access test's history never shows (client_approvals_access_check_v1, approved 11-5), so `&& !isTest` is the one condition allowed
  if (!/if \(t && SC\.isSiteChangeStep\(key\)(?: && !isTest)?\) \{\s*\(t\.site_change_log/.test(PD)) fail("the history is behind the current change's internal gate (a new draft would hide it again)");
  if (!/pr: t\.publish_pr && t\.publish_pr\.v === t\.site_change\.v \? t\.publish_pr : null, safety:/.test(ADx)) fail("a finished change moves to the history without its proof (pull request · checks · after-check)"); }
{ const A = out.addCard, R = out.rmCard;
  if (!/We made a new page for your website/.test(A.text) || !/Website access check/.test(A.text) || /Rocket Growth Agency$|\| Rocket/.test(A.text.split("acme.test")[0]) || !/acme\.test\/rga-access-test\//.test(A.text) || !/Preview page/.test(A.text) || !/Nothing goes on your website until you approve\./.test(A.text) || !/Approve this page/.test(A.text) || !/Ask for a change/.test(A.text)) fail(`the add-a-page card isn't v5 (what happened · the page by its own title · Preview · one line · Approve this page): ${A.text.slice(0, 220)}`);
  if (!/We'd like to take a page off your website/.test(R.text) || !/Website access check/.test(R.text) || !/View this page/.test(R.text) || !/Nothing comes down until you approve\. We keep a copy, so it can be put back\./.test(R.text) || !/Approve removing it/.test(R.text)) fail(`the remove-a-page card isn't v5: ${R.text.slice(0, 220)}`);
  for (const [n, X] of [["add", A], ["remove", R]]) if (/test page, to check we can publish|What stops working|Why this helps|What changes on your website|ib-crumb|Sent by RGA/.test(X.html + X.text)) fail(`the ${n} card still carries the old detail (step name / What stops working / Why this helps / file box / breadcrumb)`);
  if (A.row !== "Website access check | New page" || R.row !== "Website access check | Coming down") fail(`the list rows aren't the page's name + New page / Coming down (${A.row} · ${R.row})`); }
if (F.length) { console.error(`❌ an approval doesn't show its receipt — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ an approval shows its receipt: the approved item stays open as a green \"Approved · recorded\" card (what, who, the exact version, what happens next with RGA's move current, Preview what you approved) — even with another change waiting; its row says \"You approved it … · RGA is putting it up\"; blue \"RGA is uploading it\" once the upload opens; the words follow the label");
