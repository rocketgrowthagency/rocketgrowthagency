#!/usr/bin/env node
// check-an-upload-proves-it-is-the-right-website.mjs — 2026-10-28, approved publish_safety_checks_v1. Chris: "should we build this
// checker for our clients also… this is critical we dont mess up their other work or other websites". RUNS _publish-safety.js
// against a fake GitHub and a fake website (no network), then checks the wiring:
//   BEFORE · six checks — business · website · this repo IS the site (their domain in its files, or its home page title = the live
//            one; a framework repo is "couldn't check" until a person confirms) · the repo on record · RGA Admin · only the approved
//            files — and the pull request opens only when all six pass and a before-snapshot from the last day exists
//   AFTER OPENING · the PR's own files read back; anything extra → RGA closes it
//   AFTER MERGING · who merged; the repo's owner expected, anyone else flagged until RGA says "That's them"
//   AFTER LIVE · exactly the before pages re-read (never a fresh crawl); another page changed / gone → red; nothing readable → never a pass
//   the client sees "Checked before and after" lines only for what really passed
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let PS; try { PS = req(`${SITE}/netlify/functions/_publish-safety.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const F = [], fail = (m) => F.push(m);

// ── a fake GitHub + a fake website ─────────────────────────────────────────────────────────────
const mk = ({ repoFiles = {}, live = "<title>SEO Company in Culver City | Acme</title>", pages = {} } = {}) => {
  const asked = [];
  const f = async (u) => { u = String(u); asked.push(u);
    const m = u.match(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\/(.+?)(\?|$)/);
    if (m) { const p = decodeURIComponent(m[1]); return p in repoFiles ? new Response(repoFiles[p], { status: 200 }) : new Response("", { status: 404 }); }
    if (/^https:\/\/acme\.test\/$/.test(u)) return new Response(live, { status: 200 });
    if (u in pages) { const v = pages[u]; return typeof v === "number" ? new Response("", { status: v }) : new Response(v, { status: 200 }); }
    if (u.includes("timeout")) { const e = new Error("The operation was aborted"); e.name = "TimeoutError"; throw e; }
    return new Response("", { status: 404 }); };
  return { f, asked };
};
const V = "v1", AT = "2026-10-28T16:01:29Z";
const build = { v: V, files: [{ path: "rga-access-test/index.html", action: "add", sha: "201cd46c0f", size: 27780 }] };
const task = (over = {}) => ({ site_change: { v: V, page_url: "https://www.acme.test/rga-access-test/", label: "add_page" }, site_build: build,
  approval: { decision: "approved", change_v: V, at: AT, approved_build: build.files.map(({ path, action, sha }) => ({ path, action, sha })) }, ...over });
const base = { clientId: "11111111-2222-4333-8444-555555555555", client: { business_name: "Acme", website_url: "https://www.acme.test" }, acc: { repo: "acme/site", confirmed_at: "2026-10-26T00:00:00Z" }, token: "t", me: { ok: true, login: "rocketgrowthagency-admin" } };
const run = async (over, gh) => { const g = mk(gh); return PS.safetyChecks({ ...base, fetch: g.f, ...over }); };
const by = (cs, id) => (cs.find((x) => x.id === id) || {}).ok;

{ const cs = await run({ task: task() }, { repoFiles: { CNAME: "www.acme.test" } });
  if (cs.length !== 6 || !PS.allOk(cs)) fail(`the right repository (their domain in its CNAME) doesn't pass all six (${cs.map((x) => `${x.id}:${x.ok}`).join(" ")})`); }
{ const cs = await run({ task: task() }, { repoFiles: { "index.html": "<title>SEO Company in Culver City | Acme</title>" } });
  if (by(cs, "repo_is_site") !== true) fail("a repository whose home page title = the live site's isn't recognised as that website"); }
{ const cs = await run({ task: task() }, { repoFiles: { "index.html": "<title>Acme Plumbing · Old site</title>" } });
  if (by(cs, "repo_is_site") !== false || PS.allOk(cs)) fail("a repository that ISN'T the live website (different home page) passes — the change could land on the wrong website"); }
{ const cs = await run({ task: task() }, { repoFiles: { "src/app.jsx": "x" } });
  if (by(cs, "repo_is_site") !== null || PS.allOk(cs)) fail("a repository we can't check (no home page / address file) is treated as checked — it must be \"couldn't check\", never a pass");
  const cs2 = await run({ task: task({ repo_confirmed: { repo: "acme/site", by: "chris@", at: AT } }) }, { repoFiles: {} });
  if (by(cs2, "repo_is_site") !== true) fail("a person's recorded \"This is their website\" doesn't count");
  const cs3 = await run({ task: task({ repo_confirmed: { repo: "acme/OTHER", by: "chris@", at: AT } }) }, { repoFiles: {} });
  if (by(cs3, "repo_is_site") === true) fail("a confirmation for ANOTHER repository counts for this one"); }
{ const cs = await run({ task: task({ site_change: { v: V, page_url: "https://www.other-client.test/x/", label: "add_page" } }) }, { repoFiles: { CNAME: "acme.test" } });
  if (by(cs, "website") !== false || PS.allOk(cs)) fail("a page bound for a different website than the client's record passes"); }
{ const t = task(); t.approval.approved_build = [{ path: "rga-access-test/index.html", action: "add", sha: "deadbeef" }];
  const cs = await run({ task: t }, { repoFiles: { CNAME: "acme.test" } });
  if (by(cs, "files") !== false || PS.allOk(cs)) fail("a build whose fingerprint isn't the approved one passes"); }
{ const cs = await run({ task: task(), me: { ok: false, state: "wrong_account", login: "rocketgrowthagency" } }, { repoFiles: { CNAME: "acme.test" } });
  if (by(cs, "admin") !== false || PS.allOk(cs)) fail("acting as an account other than RGA Admin passes"); }
{ const cs = await run({ task: task(), acc: { repo: "acme/site" } }, { repoFiles: { CNAME: "acme.test" } });
  if (by(cs, "recorded") !== false) fail("a repository never confirmed on the access step passes as \"the one they gave us\""); }
{ const t = task(); t.approval.change_v = "older";
  const cs = await run({ task: t }, { repoFiles: { CNAME: "acme.test" } });
  if (by(cs, "business") !== false) fail("an approval of an OLDER version passes as this one"); }

// ── after opening · after merging ──────────────────────────────────────────────────────────────
if (!PS.prHoldsOnly([{ path: "rga-access-test/index.html", action: "add" }], build.files).ok) fail("a pull request holding exactly the approved file is called wrong");
{ const h = PS.prHoldsOnly([{ path: "rga-access-test/index.html", action: "add" }, { path: "index.html", action: "edit" }], build.files);
  if (h.ok || !h.extra.includes("index.html")) fail("a pull request holding an extra file (their home page!) isn't caught"); }
{ const m = PS.mergerState({ merged: true, merged_by: "acme", base: "main" }, "acme/site", null); if (m.ok !== true) fail("the repository's owner merging is flagged"); }
{ const m = PS.mergerState({ merged: true, merged_by: "someone-else" }, "acme/site", null); if (m.ok !== null || m.by !== "someone-else") fail("a merge by an account we don't know isn't flagged"); }
{ const m = PS.mergerState({ merged: true, merged_by: "someone-else" }, "acme/site", { login: "someone-else" }); if (m.ok !== true) fail("RGA's \"That's them\" doesn't clear the flag"); }

// ── merge_without_the_browser_v1: RGA merges on the server — only the commit it opened ───────────
{ const GA = req(`${SITE}/netlify/functions/_github-access.js`), pr = { head: "abc123", base: "main" }, files = [{ path: "rga-access-test/index.html", action: "add" }];
  const st = (o) => ({ ok: true, merged: false, state: "open", head: "abc123", base: "main", ...o });
  if (!PS.mergeReady(st(), files, build.files, pr).ok) fail("a pull request that's still exactly what we opened isn't ready to merge");
  if (PS.mergeReady(st({ head: "zzz999" }), files, build.files, pr).ok) fail("a pull request someone pushed to after we opened it would still merge");
  if (PS.mergeReady(st({ state: "closed" }), files, build.files, pr).ok) fail("a closed pull request would merge");
  if (PS.mergeReady(st({ base: "dev" }), files, build.files, pr).ok) fail("a pull request retargeted to another branch would merge");
  if (PS.mergeReady(st(), [...files, { path: "index.html", action: "edit" }], build.files, pr).ok) fail("a pull request holding an extra file would merge");
  { const r = PS.mergeReady(st(), files, build.files, { base: "main" }); if (r.ok || !/no record of the commit we opened/.test(r.why)) fail("we'd merge without a record of the commit we opened (blind)"); }
  const calls = []; const f = async (u, init = {}) => { calls.push({ u: String(u), m: init.method || "GET", b: init.body ? JSON.parse(init.body) : null }); return String(u).endsWith("/merge") ? new Response(JSON.stringify({ merged: true, sha: "m1" }), { status: 200 }) : new Response("{}", { status: 404 }); };
  const mg = await GA.mergePullRequest("t", f, { repo: "acme/site", number: 2, sha: "abc123", title: "x" });
  if (!mg.ok || calls[0].m !== "PUT" || !calls[0].u.endsWith("/repos/acme/site/pulls/2/merge") || calls[0].b.sha !== "abc123") fail("the merge doesn't pin the commit we opened (GitHub must refuse if the head moved)");
  const f409 = async () => new Response("{}", { status: 409 });
  if ((await GA.mergePullRequest("t", f409, { repo: "acme/site", number: 2, sha: "abc123" })).state !== "head_moved") fail("GitHub's 'head moved' refusal isn't recognised");
  if (PS.mergerState({ merged: true, merged_by: GA.ADMIN_LOGIN }, "acme/site", null).ok !== true) fail("RGA Admin merging for them (after their approval) is flagged as unexpected"); }

// ── auto_live_and_proof_v1: fingerprint · the GitHub connection · our branch only · the watcher · late after a day ─────────
{ const crypto = await import("node:crypto");
  if (PS.fingerprintOf("<html>x</html>") !== crypto.createHash("sha256").update("<html>x</html>").digest("hex")) fail("the page fingerprint isn't the sha256 the build uses");
  const acc = { repo: "acme/site", github: "rocketgrowthagency-admin", confirmed_at: "2026-10-26T00:00:00Z" }, me = { ok: true, login: "rocketgrowthagency-admin" }, access = { ok: true, role: "Write", canChange: true };
  if (PS.connectionCheck({ acc, me, access, repoIsSite: true }).match !== true) fail("the right account, role, repo and record isn't a VERIFIED match");
  if (PS.connectionCheck({ acc, me: { ok: false, state: "wrong_account", login: "rocketgrowthagency" }, access, repoIsSite: true }).match !== false) fail("our key belonging to RGA's own business account isn't NOT A MATCH");
  if (PS.connectionCheck({ acc: { ...acc, github: "someone-else" }, me, access, repoIsSite: true }).match !== false) fail("posting as an account other than the one they invited is called a match");
  if (PS.connectionCheck({ acc, me, access: { ok: true, role: "Read", canChange: false }, repoIsSite: true }).match !== false) fail("a Read-only role (can't post) is called a match");
  if (PS.connectionCheck({ acc, me, access, repoIsSite: null }).match !== null) fail("a repository we couldn't check is called a match (it must be couldn't check)");
  if (PS.connectionCheck({ acc, me: { ok: false, state: "no_key" }, access: { ok: false }, repoIsSite: null }).match !== null) fail("GitHub not answering is called a match or a mismatch (it must be couldn't check)");
  const GA = req(`${SITE}/netlify/functions/_github-access.js`), del = []; const f = async (u, i = {}) => { del.push(`${i.method || "GET"} ${u}`); return new Response(null, { status: 204 }); };
  if ((await GA.deleteBranch("t", f, { repo: "acme/site", branch: "main" })).ok || del.length) fail("RGA would delete a branch it didn't make (main)");
  if (!(await GA.deleteBranch("t", f, { repo: "acme/site", branch: "rga/add-page-x1" })).ok || !del.some((x) => /DELETE .*\/git\/refs\/heads\/rga\/add-page-x1$/.test(x))) fail("RGA doesn't delete its own branch after the merge");
  let W; try { W = req(`${SITE}/netlify/functions/site-publish-watch.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — the watcher won't load: ${e.message}`); process.exit(2); }
  const SCx = req(`${SITE}/shared/site-change.js`), T2 = "m1.access.publish_test", chg = { v: "v1", kind: "visible", new_page: true, label: "add_page", items: [{ label: "Main headline", after: "x" }] };
  const base2 = { site_change: chg, internal_review: { decision: "approved", change_v: "v1", at: AT }, approval: { decision: "approved", change_v: "v1", at: AT } };
  if (W.waitingKeys({ [T2]: { ...base2, publish_pr: { v: "v1", number: 2, merged: { at: AT } } } }).join() !== T2) fail("the watcher doesn't pick up a merged change that isn't live yet");
  if (W.waitingKeys({ [T2]: { ...base2, publish_pr: { v: "v1", number: 2 } } }).length) fail("the watcher would mark live a change that isn't merged");
  if (W.waitingKeys({ [T2]: { ...base2, status: "done", publish_pr: { v: "v1", number: 2, merged: { at: AT } }, published: { v: "v1", at: AT } } }).length || SCx.changeState({ ...base2, published: { v: "v1", at: AT } }) !== "live") fail("the watcher would mark live a change that's already live");
  const WS = read("netlify/functions/site-publish-watch.js");
  if (!/"x-internal-secret": process\.env\.INTERNAL_FN_SECRET/.test(WS) || !/await call\(row\.client_id, key, "publish"\)/.test(WS) || !/if \(live\.ok\) \{ const rest = await call\(row\.client_id, key, "rest_check"\)/.test(WS) || /\/rest\/v1\/client_onboarding_records\?id=eq\.[^`]*PATCH|method: "PATCH"/.test(WS)) fail("the watcher writes the record itself, or doesn't go through admin-deliverables (Mark live, then the after-check)");
  if (!/\[functions\."site-publish-watch"\]\s*schedule = "\*\/5 \* \* \* \*"/.test(read("netlify.toml"))) fail("the watcher isn't scheduled every 5 minutes");
  const OM2 = req(`${SITE}/netlify/functions/_open-moves.js`), PB = JSON.parse(read("data/playbooks/playbooks.json"));
  const tk = { "m1.access.website": { access: { repo: "acme/site", confirmed_at: AT } }, [T2]: { ...base2, publish_pr: { v: "v1", number: 2, merged: { at: "2026-10-28T20:00:00Z" } } } };
  const mv = OM2.openMoves({ playbooks: { month1: PB.month1 || [] }, data: { tasks: tk }, now: "2026-10-30T20:00:00Z" }).find((m) => m.kind === "publish_change");
  if (!mv || mv.since !== "2026-10-28T20:00:00Z" || !mv.late || !/not on their site yet/.test(mv.what)) fail(`merged but not live for 2 days isn't RGA's LATE move from the merge (${JSON.stringify(mv)})`); }
{ const ADy = read("netlify/functions/admin-deliverables.js");
  if (!/if \(want1\) fingerprint = \{ match: PS\.fingerprintOf\(servedHtml\) === want1/.test(ADy) || !/\.\.\.\(fingerprint \? \{ fingerprint \} : \{\}\)/.test(ADy)) fail("Mark live doesn't record whether the live page IS the approved file (fingerprint)");
  if (!/const del = await GA\.deleteBranch\(token, fetch, \{ repo, branch: pr\.branch \}\)/.test(ADy)) fail("RGA's merge doesn't tidy its own branch"); }

// ── after live ─────────────────────────────────────────────────────────────────────────────────
const P = (url, title, h1 = "H") => ({ url, read: true, title, h1, description: "d", canonical: null });
const before = { pages: [P("https://www.acme.test/", "Home"), P("https://www.acme.test/about/", "About"), P("https://www.acme.test/plumbing/", "Plumbing")] };
{ const g = mk({ pages: { "https://www.acme.test/": "<title>Home</title><h1>H</h1><meta name=\"description\" content=\"d\">", "https://www.acme.test/about/": "<title>About</title><h1>H</h1><meta name=\"description\" content=\"d\">", "https://www.acme.test/plumbing/": "<title>Plumbing</title><h1>H</h1><meta name=\"description\" content=\"d\">" } });
  const after = await PS.rereadPages(before, g.f);
  if (g.asked.some((u) => /sitemap/.test(u)) || g.asked.length !== 3) fail(`the after-check crawls afresh instead of re-reading exactly the before pages (${g.asked.join(", ")})`);
  const c = PS.compareSnapshots(before, after, ["https://www.acme.test/rga-access-test/"]);
  if (c.ok !== true || c.read !== 3) fail(`unchanged pages aren't "nothing else changed" (${JSON.stringify(c)})`); }
{ const after = { pages: [P("https://www.acme.test/", "Home"), P("https://acme.test/about", "About US — new"), P("https://www.acme.test/plumbing/", "Plumbing")] };
  const c = PS.compareSnapshots(before, after, []);
  if (c.ok !== false || c.changed.length !== 1 || !/about/.test(c.changed[0].url)) fail("another page's title changing isn't caught"); }
{ const after = { pages: [P("https://www.acme.test/", "Home"), { url: "https://www.acme.test/about/", read: false, why: "http_404" }, { url: "https://www.acme.test/plumbing/", read: false, why: "timeout" }] };
  const c = PS.compareSnapshots(before, after, []);
  if (c.ok !== false || !c.changed.some((x) => x.what.includes("no longer opens")) || !c.unread.includes("https://www.acme.test/plumbing/")) fail("a page that now 404s isn't a change, or a page that timed out is called changed instead of unread"); }
{ const after = { pages: before.pages.map((p) => ({ url: p.url, read: false, why: "timeout" })) };
  if (PS.compareSnapshots(before, after, []).ok !== null) fail("nothing readable after live is called \"nothing changed\" (it must be couldn't check, never a pass)"); }
{ const b2 = { pages: [...before.pages, P("https://www.acme.test/old/", "Old page")] }, after = { pages: [...before.pages, { url: "https://www.acme.test/old/", read: false, why: "http_404" }] };
  if (PS.compareSnapshots(b2, after, ["https://www.acme.test/old/"]).ok !== true) fail("the page being REMOVED (approved) is counted as an unexpected change"); }

// ── the wiring ─────────────────────────────────────────────────────────────────────────────────
const AD = read("netlify/functions/admin-deliverables.js"), PD = read("netlify/functions/portal-deliverables.js"), A = read("admin/admin.js"), P0 = read("portal/portal.js");
if (!/const checks = await PS\.safetyChecks\(\{ clientId, client, task: t, acc, token, fetch, me \}\);\s*if \(!PS\.allOk\(checks\)\)/.test(AD)) fail("Open the pull request doesn't refuse unless all six checks pass");
if (!/if \(!snap0 \|\| !\(snap0\.read > 0\) \|\| !snap0\.at \|\| Date\.now\(\) - Date\.parse\(snap0\.at\) > 864e5\) return json\(409/.test(AD)) fail("the pull request can open without a before-snapshot from the last day");
if (!/const held = pf\.ok \? PS\.prHoldsOnly\(pf\.files, bld\.files\) : null;\s*if \(!held \|\| !held\.ok\) \{\s*await GA\.closePullRequest/.test(AD)) fail("a pull request holding anything else (or unreadable) isn't closed by RGA");
if (!/if \(!s1\.merged\) return json\(409/.test(AD) || !/merged: \{ at: s1\.merged_at \|\| now, by: s1\.merged_by/.test(AD)) fail("Mark live doesn't need the merge, or doesn't record who merged it");
if (!/t\.publish_before = \{ at: snap0\.at/.test(AD) || !/const after = await PS\.rereadPages\(before, fetch/.test(AD)) fail("the before isn't frozen at the pull request, or the after-check doesn't re-read exactly those pages");
if (!/safety: t\.publish_safety && t\.publish_pr && t\.publish_pr\.v === c\.v \?/.test(PD) || !/rest: t\.publish_after \? \(t\.publish_after\.ok === true \? true/.test(PD)) fail("the client is told it was checked before it really was");
if (!/if \(s\.rest === true\) rows\.push/.test(P0)) fail("the client's \"rest of your site\" line shows without the after-check passing");
if (!/data-ob-wc-pr\$\{sf && sf\.ready \? "" : " disabled"\}>Open the pull request/.test(A)) fail("admin's Open the pull request isn't off until the checks pass");
{ const ADX = read("netlify/functions/admin-deliverables.js"), PMC = read("netlify/functions/portal-merge-choice.js");
  if (!/\.merge_by \|\| \{\}\)\.by === "client"\) return json\(409/.test(ADX) || !/const ready = PS\.mergeReady\(s2, f2\.ok \? f2\.files : null, bld2 \? bld2\.files : \[\], pr\);\s*if \(!ready\.ok\) return json\(409/.test(ADX) || !/GA\.mergePullRequest\(token, fetch, \{ repo, number: pr\.number, sha: pr\.head,/.test(ADX)) fail("RGA's merge doesn't respect the client's choice, skip the re-check, or merge without pinning the commit");
  if (!/requirePortalOwner\(event, clientId\)/.test(PMC) || !/\["rga", "client"\]\.includes\(by\)/.test(PMC) || !/saved\.at !== at \|\| saved\.by !== by/.test(PMC)) fail("the client's merge choice isn't owner-only, allow-listed and read back");
  if (!/url: \(\(\(tasks\["m1\.access\.website"\] \|\| \{\}\)\.merge_by\) \|\| \{\}\)\.by === "client" \? t\.publish_pr\.url : null/.test(PD)) fail("the client gets the GitHub link even when RGA merges (only when they chose to merge themselves)"); }
if (F.length) { console.error(`❌ an upload can reach the wrong website (or change more than approved) — ${F.length}:\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ an upload proves it's the right website: six checks before (business · website · the repo IS the site, or \"couldn't check\" until a person confirms · the repo on record · RGA Admin · only the approved files) + a fresh before-snapshot gate the pull request; its files are read back (extra → closed); who merged is recorded (unknown → flagged); after live exactly the before pages are re-read (changed / gone → red, unreadable → never a pass); the client sees only what passed");
