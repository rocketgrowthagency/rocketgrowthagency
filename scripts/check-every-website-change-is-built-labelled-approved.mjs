#!/usr/bin/env node
// check-every-website-change-is-built-labelled-approved.mjs — 2026-10-28, approved for_your_approval_v2. Chris: "we build it, then
// we send to client portal For your approval and then after they APPROVE it only then do we upload. Also we need a hard rule to show
// ADDING PAGE, EDITING PAGE, REMOVING PAGE… Also that this is in the contract." (feedback_website_changes_built_labelled_approved_then_uploaded)
// RUNS the shared rules, the PR remover against a fake GitHub and the preview function; checks the wiring:
//   · every change carries ONE label (add_page · edit_page · remove_page · code) — every default step change, a new page, a removal
//   · a removal needs its address + a "remove" file; it's proven gone by the live check (not "the words are there")
//   · Send BUILDS first (refuses to send if the build fails); the client's approval freezes the build's fingerprints; the upload is
//     refused unless what's built is exactly what was approved
//   · the preview: only with the signature, never indexed, says it's a preview, their styles (<base>)
//   · the client sees the label on the queue row, the card, the Approve button and What RGA did; To do leads with "For your approval"
//   · the agreement has §5A with the labelled / built-first / approved-version lines
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let SC, GA; try { SC = req(`${SITE}/shared/site-change.js`); GA = req(`${SITE}/netlify/functions/_github-access.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }

// ── 1 · labels ─────────────────────────────────────────────────────────────────────────────────
for (const [id, def] of Object.entries(SC.STEPS)) {
  const items = (def.items || []).map((i) => ({ ...i, after: "x" })), raw = def.kind === "code" ? { kind: "code", adds: "x", code: "<x>" } : def.newPage ? { page_url: "https://x.test/p/", items, files: [{ path: "p/index.html", action: "add" }] } : { items: items.length ? items : [{ label: "Line", after: "x" }] };
  const r = SC.cleanChange(id, raw);
  const want = def.kind === "code" ? "code" : def.newPage ? "add_page" : "edit_page";
  if (r.error || r.change.label !== want) fail(`${id}: labelled ${r.error || r.change.label}, should be ${want}`);
}
const T = "m1.access.publish_test";
const rm = SC.cleanChange(T, { removes_page: true, page_url: "https://x.test/rga-access-test/", removed_title: "Website access check", items: [{ label: "What stops working", before: "https://x.test/rga-access-test/", after: "" }, { label: "Where visitors go instead", after: "Not found" }], files: [{ path: "rga-access-test/index.html", action: "remove" }] });
if (!rm.change || rm.change.label !== "remove_page" || rm.change.removed_title !== "Website access check") fail(`a removal isn't labelled "Removing a page" or loses the page's title (${rm.error || rm.change.label})`);
if (!SC.cleanChange(T, { removes_page: true, page_url: "https://x.test/a/", items: [{ label: "x", after: "y" }], files: [] }).error) fail("a removal saves without the file it removes");
if (!/^Removing a page: /.test(SC.changeText(rm.change, "A test page")) || !/Removing: rga-access-test\/index\.html/.test(SC.changeText(rm.change, "x"))) fail("the frozen approval text doesn't say \"Removing a page\" and \"Removing: <file>\"");
if (SC.changeLabel({ kind: "unknown" }) !== null) fail("a change that does nothing nameable still gets a label");
if (SC.LABELS.add_page.verb !== "adding this page" || SC.LABELS.remove_page.done !== "Removed a page") fail("the labels' words changed (Approve adding this page · Removed a page)");

// ── 2 · removing a file by pull request (fake GitHub) ─────────────────────────────────────────
const fake = (exists) => { const calls = []; const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
  return { calls, f: async (u, init = {}) => { const m = (init.method || "GET").toUpperCase(), p = String(u).replace("https://api.github.com", "").split("?")[0]; calls.push(`${m} ${p}`);
    if (m === "GET" && /^\/repos\/[^/]+\/[^/]+$/.test(p)) return J({ default_branch: "main", permissions: { push: true } });
    if (m === "GET" && /\/contents\//.test(p)) return exists ? J({ sha: "s1" }) : J({}, 404);
    if (m === "GET" && /\/git\/ref\/heads\//.test(p)) return J({ object: { sha: "abc" } });
    if (m === "POST" && /\/git\/refs$/.test(p)) return J({}, 201);
    if (m === "DELETE" && /\/contents\//.test(p)) return J({ commit: {} });
    if (m === "POST" && /\/pulls$/.test(p)) return J({ number: 9, html_url: "u" }, 201);
    return J({}, 404); } }; };
{ const { f, calls } = fake(true); const r = await GA.openPullRequest("t", f, { repo: "o/r", branch: "b", title: "T", body: "", message: "M", files: [{ path: "rga-access-test/index.html", action: "remove", content: "" }] });
  if (!r.ok || !calls.includes("DELETE /repos/o/r/contents/rga-access-test/index.html")) fail(`removing a page doesn't delete its file in the pull request (${calls.join(" · ")})`); }
{ const { f, calls } = fake(false); const r = await GA.openPullRequest("t", f, { repo: "o/r", branch: "b", title: "T", body: "", message: "M", files: [{ path: "x/index.html", action: "remove", content: "" }] });
  if (r.ok || r.state !== "file_missing" || calls.some((c) => /^(POST|PUT|DELETE)/.test(c))) fail("removing a file that isn't there still writes"); }

// ── 3 · the preview function ───────────────────────────────────────────────────────────────────
{ process.env.INTERNAL_FN_SECRET = "gate-secret"; process.env.SUPABASE_URL = "https://sb.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const C = "11111111-2222-4333-8444-555555555555", V = "2026-10-28T10:00:00Z", sig = crypto.createHmac("sha256", "gate-secret").update(`${C}|${T}|${V}`).digest("hex").slice(0, 32);
  globalThis.fetch = async (u) => { u = String(u); if (u.includes("client_onboarding_records")) return new Response(JSON.stringify([{ data: { tasks: { [T]: { site_build: { v: V, files: [{ path: "a/index.html", html: "<html><head><title>T</title></head><body><main>x</main></body></html>" }] } } } } }]), { status: 200 });
    if (u.includes("/clients?")) return new Response(JSON.stringify([{ website_url: "https://www.acme.test/" }]), { status: 200 }); return new Response("[]", { status: 200 }); };
  let H; try { H = req(`${SITE}/netlify/functions/site-preview.js`).handler; } catch (e) { console.error(`⚠️  INDETERMINATE — site-preview won't load: ${e.message}`); process.exit(2); }
  const bad = await H({ queryStringParameters: { c: C, k: T, v: V, s: "0".repeat(32) } });
  if (bad.statusCode !== 403) fail("the preview opens without a valid signature");
  const ok = await H({ queryStringParameters: { c: C, k: T, v: V, s: sig } });
  if (ok.statusCode !== 200 || !/noindex/.test(ok.headers["X-Robots-Tag"] || "") || !/<base href="https:\/\/www\.acme\.test\/">/.test(ok.body) || !/It goes live only after you approve it\./.test(ok.body) || !/<a href="https:\/\/[^"]+\/portal\/#for-your-approval" target="_top"[^>]*>Back to approve<\/a>/.test(ok.body)) fail("the preview isn't private (noindex), on their styles (<base>), doesn't say it's a preview, or has no absolute \"Back to approve\" link");
  const stale = await H({ queryStringParameters: { c: C, k: T, v: "older", s: crypto.createHmac("sha256", "gate-secret").update(`${C}|${T}|older`).digest("hex").slice(0, 32) } });
  if (stale.statusCode !== 404) fail("an older version's preview still opens (it must say it's no longer current)");
  // 10-28: the client's link carries NO step id — found by its version, signed over client|version (check-client-never-sees-our-internals)
  const sig2 = crypto.createHmac("sha256", "gate-secret").update(`${C}|${V}`).digest("hex").slice(0, 32);
  const nok = await H({ queryStringParameters: { c: C, v: V, s: sig2 } });
  if (nok.statusCode !== 200 || !/It goes live only after you approve it\./.test(nok.body)) fail(`a preview link without the step id doesn't open (${nok.statusCode})`);
  const nbad = await H({ queryStringParameters: { c: C, v: V, s: sig } });
  if (nbad.statusCode !== 403) fail("a step-less preview link opens with the OLD signature (it must be signed over client|version)"); }
const PDX = read("netlify/functions/portal-deliverables.js");
if (/preview_url: t\.site_build && t\.site_build\.v === c\.v && t\.site_build\.preview_url \? t\.site_build\.preview_url/.test(PDX) || !/site-preview\?c=\$\{encodeURIComponent\(clientId\)\}&v=/.test(PDX)) fail("the client's preview link is the stored one (it names our step id) instead of the client|version link");

// ── 4 · the wiring ─────────────────────────────────────────────────────────────────────────────
const AD = read("netlify/functions/admin-deliverables.js"), PD = read("netlify/functions/portal-deliverables.js"), P = read("portal/portal.js"), A = read("admin/admin.js"), CG = read("netlify/functions/contract-generate.js");
if (!/const b = await buildChangeFiles\(key, t\.site_change, cl0, tasks, clientId\);\s*if \(b && b\.error\) return json\(409, \{ error: `The page couldn't be built, so nothing was sent/.test(AD)) fail("Send doesn't BUILD the change first (or sends when the build fails)");
if (!/tasks\[key\]\.approval\.approved_build = bd\.files\.map\(\(f\) => \(\{ path: f\.path, action: f\.action, sha: f\.sha \}\)\);/.test(PD)) fail("the client's approval doesn't freeze the build's fingerprints");
if (!/if \(!same\) return json\(409, \{ error: "What's built isn't what the client approved/.test(AD) || !/if \(!bld \|\| !okd\) return json\(409/.test(AD)) fail("the upload doesn't refuse a build the client didn't approve");
if (!/if \(c\.removes_page && url\) \{/.test(AD) || !/if \(stillThere && !String\(body\.unchecked_reason/.test(AD)) fail("Mark live on a removal doesn't prove the page is gone");
if (!/\$\{ibLabelHtml\(e\.d && e\.d\.change\)\}<b>\$\{escapeHtml\(ibTitle\(e\)\)\}/.test(P) || !/let h = ibLabelHtml\(c\);/.test(P) || !/`Approve \$\{IB_LABELS\[c\.label\]\.verb\}`/.test(P) || !/\$\{ibLabelHtml\(d\.change\)\}<b>/.test(P)) fail("the client doesn't see the label on the queue row, the card, the Approve button and What RGA did");
// 🔄 approval_tab_and_sent_card_v1 (10-28): For your approval is its own tab; To do carries one strip that opens it
if (!/grp\(" y", "Waiting for you", W, /.test(P) || !/class="ib-fstrip"[\s\S]{0,600}data-goto-approve>Open For your approval</.test(P) || !/if \(fyaHost\) fyaHost\.innerHTML = fyaHtml\(_apItems, when, ""\);/.test(P) || !/host\.innerHTML = `\$\{strip\}<div class="ib">/.test(P)) fail("For your approval isn't its own tab (Waiting for you first), or To do's strip doesn't open it across the full width");
if (!/<b>Nothing is uploaded until you approve\.<\/b>/.test(P) || !/<span class="pvw-go">\$\{IB_ICON\.eye\}Preview page<\/span>/.test(P)) fail("the card lost its promise or its Preview page picture");
if (!/label: c\.label \|\| SC\.changeLabel\(c\)/.test(PD) || !/preview_url: t\.site_build && t\.site_build\.v === c\.v/.test(PD)) fail("the client's card isn't sent the label / the preview");
if (!/function wcLabelHtml\(c\)/.test(A) || (A.match(/\$\{wcLabelHtml\(/g) || []).length < 5 || !/data-ob-wc-remove>Remove this page…/.test(A)) fail("admin's cards don't carry the label in every state, or can't draft a removal");
if (!/<h2>5A\. Website Access and Changes<\/h2>/.test(CG) || !/identified as adding a page, editing a page, removing a page, or changing code/.test(CG) || !/publishes only the version Client approved/.test(CG) || !/including a copy of any page it removes/.test(CG)) fail("the agreement doesn't carry §5A with the labelled / built-first / approved-version lines");
if (F.length) { console.error(`❌ a website change can skip built → labelled → approved → uploaded — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ every website change is built, labelled, approved, then uploaded: every step's change has one of the 4 labels; a removal needs its file and is proven gone; Send builds first; approval freezes the fingerprints; the upload refuses anything else; the preview is signed, noindex, on their styles; the client sees the label everywhere and To do leads with For your approval; §5A is in the agreement");
