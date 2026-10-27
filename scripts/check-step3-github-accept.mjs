#!/usr/bin/env node
// check-step3-github-accept.mjs — 2026-10-27, approved step3_admin_accept_v1 (Chris: "can admin card have a place to accept invite
// inside portal or links"). RUNS netlify/functions/_github-access.js against FAKE GitHub replies, then pins the one writer and
// admin row 8:
//   · identity first: no key → no_key; a refused key → key_refused; a key for ANY other account (rocketgrowthagency included)
//     → wrong_account, and nothing is listed or accepted
//   · accept → our role read back → their domain looked for in the repo's own files; "their site" ONLY when found (strict)
//   · Read-only → not changeable; an expired invite is never accepted; a vanished invite → invite_gone
//   · admin-access-confirm.js records the grant only when canChange && theirSite (else it keeps github_accept, never "done");
//     github_confirm re-reads the role LIVE; github_check never writes
//   · admin row 8: the GitHub card, its states, Accept and confirm, the access@ invite link for other builders
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let GA; try { GA = req(`${SITE}/netlify/functions/_github-access.js`); } catch (e) { console.error(`⚠️  _github-access won't load: ${e.message}`); process.exit(2); }
const DATA = JSON.parse(read("data/site-platforms.json"));
if (GA.ADMIN_LOGIN !== DATA.github) fail(`the accept runs as ${GA.ADMIN_LOGIN}, not site-platforms.json github (${DATA.github})`);

// ── a fake GitHub: routes → [status, body]; records every call (method + path)
function fakeGitHub(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const path = url.replace("https://api.github.com", ""), m = (init.method || "GET").toUpperCase();
    calls.push(`${m} ${path}`);
    const hit = routes[`${m} ${path}`] ?? routes[path];
    const [status, body] = hit === undefined ? [404, { message: "Not Found" }] : typeof hit === "function" ? hit() : hit;
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
  f.calls = calls;
  return f;
}
const ME = { login: DATA.github };
const INV = (o = {}) => ({ id: 77, repository: { full_name: "acme/site", owner: { login: "acme" }, private: true }, inviter: { login: "acme" }, permissions: "write", created_at: "2026-10-26T02:46:11Z", expired: false, html_url: "https://github.com/acme/site/invitations", ...o });
const REPO = (perm) => ({ full_name: "acme/site", permissions: perm });
const W = { admin: false, maintain: false, push: true, triage: true, pull: true }, R = { admin: false, maintain: false, push: false, triage: false, pull: true };

// identity
{ const r = await GA.whoAmI("", fakeGitHub({})); if (r.state !== "no_key") fail(`no key → ${r.state} (want no_key)`); }
{ const r = await GA.whoAmI("k", fakeGitHub({ "/user": [401, {}] })); if (r.state !== "key_refused") fail(`a refused key → ${r.state} (want key_refused)`); }
for (const login of ["rocketgrowthagency", "someone-else"]) {
  const gh = fakeGitHub({ "/user": [200, { login }] });
  const r = await GA.whoAmI("k", gh);
  if (r.ok || r.state !== "wrong_account") fail(`a key for ${login} is accepted (${r.state}) — the accept could run as RGA's own business account`);
}
{ const r = await GA.whoAmI("k", fakeGitHub({ "/user": [200, ME] })); if (!r.ok) fail("RGA Admin's own key is refused"); }
// domain + role helpers
for (const [u, want] of [["https://www.Acme.com/about", "acme.com"], ["acme.co.uk", "acme.co.uk"], ["http://shop.acme.com:8080/", "shop.acme.com"], ["", null], ["not a site", null]])
  if (GA.siteDomain(u) !== want) fail(`siteDomain(${JSON.stringify(u)}) = ${GA.siteDomain(u)} (want ${want})`);
if (GA.roleOf(W) !== "Write" || GA.roleOf(R) !== "Read" || GA.roleOf({ admin: true, push: true }) !== "Admin") fail("the role words are wrong (Write / Read / Admin)");
// accept: Write + domain in a repo file → their site
{
  const gh = fakeGitHub({ "/user/repository_invitations?per_page=100": [200, [INV()]], "PATCH /user/repository_invitations/77": [204, ""], "/repos/acme/site": [200, REPO(W)],
    "/repos/acme/site/contents/index.html": [200, '<link rel="canonical" href="https://www.acme.com/">'] });
  const r = await GA.acceptAndCheck("k", gh, { invitationId: 77, domain: "acme.com" });
  if (!r.ok || !r.canChange || !r.theirSite || r.role !== "Write" || !r.domainFoundIn.includes("index.html")) fail(`Write + domain in index.html isn't "their site, can change" (${JSON.stringify(r)})`);
  if (!gh.calls.includes("PATCH /user/repository_invitations/77")) fail("the invite was never accepted (no PATCH)");
}
// accept: domain nowhere → strict, not their site
{
  const gh = fakeGitHub({ "/user/repository_invitations?per_page=100": [200, [INV()]], "PATCH /user/repository_invitations/77": [204, ""], "/repos/acme/site": [200, REPO(W)], "/repos/acme/site/contents/index.html": [200, "<h1>Other Co</h1>"] });
  const r = await GA.acceptAndCheck("k", gh, { invitationId: 77, domain: "acme.com" });
  if (!r.ok || r.theirSite) fail("a repo without their domain counts as their site — the check must be strict");
}
// accept: read only
{
  const gh = fakeGitHub({ "/user/repository_invitations?per_page=100": [200, [INV({ permissions: "read" })]], "PATCH /user/repository_invitations/77": [204, ""], "/repos/acme/site": [200, REPO(R)], "/repos/acme/site/contents/CNAME": [200, "acme.com"] });
  const r = await GA.acceptAndCheck("k", gh, { invitationId: 77, domain: "acme.com" });
  if (!r.ok || r.canChange || r.role !== "Read") fail("a Read invite reads as one we can change");
}
// expired / gone → never accepted
{
  const gh = fakeGitHub({ "/user/repository_invitations?per_page=100": [200, [INV({ expired: true })]], "PATCH /user/repository_invitations/77": [204, ""] });
  const r = await GA.acceptAndCheck("k", gh, { invitationId: 77, domain: "acme.com" });
  if (r.state !== "expired" || gh.calls.some((c) => c.startsWith("PATCH"))) fail("an expired invite was accepted (or not called expired)");
}
{
  const gh = fakeGitHub({ "/user/repository_invitations?per_page=100": [200, []] });
  const r = await GA.acceptAndCheck("k", gh, { invitationId: 77, domain: "acme.com" });
  if (r.state !== "invite_gone") fail(`a vanished invite → ${r.state} (want invite_gone)`);
}

// ── the one writer
const C = read("netlify/functions/admin-access-confirm.js");
const blk = C.slice(C.indexOf('if (body.action === "github_check"'), C.indexOf("const role = String(body.role"));
if (blk.length < 200) { console.error("⚠️  INDETERMINATE — the github actions moved in admin-access-confirm.js"); process.exit(2); }
if (!/const me = await GA\.whoAmI\(token, fetch\);\s*\n\s*if \(!me\.ok\) return/.test(blk)) fail("the github actions don't check WHOSE key it is before anything else");
if (!/if \(res\.canChange && res\.theirSite\) return record\(gha, "github_one_click"\);/.test(blk)) fail("one click records the grant without BOTH checks passing (can change + their site)");
const checkBranch = blk.slice(blk.indexOf('if (body.action === "github_check") {'), blk.indexOf('if (body.action === "github_confirm") {'));
if (/writeStepTasks|recordSubmission/.test(checkBranch)) fail("github_check writes — opening row 8 must only read");
if (!/const live = await GA\.repoAccess\(token, fetch, gha\.repo\);/.test(blk) || !/if \(!live\.canChange\) return json\(409/.test(blk)) fail("\"It's the right repo: confirm\" trusts the role stored at accept time instead of reading it live");
if (!/github: GA\.ADMIN_LOGIN, repo: gha\.repo/.test(blk)) fail("the grant doesn't name the GitHub user + repo (removing us at the end needs both)");

// ── admin row 8
const A = read("admin/admin.js");
if (!/if \(ci\.platform === "custom" && ci\.files === "github" && ci\.via === "invite"\) return ghAccessCardHtml\(t, ci\);/.test(A)) fail("admin row 8 doesn't draw the GitHub card for a GitHub invite");
for (const [what, re] of [["Checking GitHub…", /title: "Checking GitHub…"/], ["Accept and confirm access", /data-ob-gh-accept="\$\{escapeAttribute\(String\(i\.id\)\)\}">Accept and confirm access</], ["no invite yet + Check again", /No GitHub invite for \$\{RGA_ACCESS_GITHUB\} yet/],
  ["role too low", /We can see their files but can't make changes/], ["not their repo + confirm", /It's the right repo: confirm/], ["expired", /GitHub invites last 7 days; this one ran out/], ["key not set up", /GitHub key not set up yet/]])
  if (!re.test(A)) fail(`admin row 8 lost the "${what}" state`);
if (!/const RGA_ACCESS_GITHUB = "([^"]+)";/.test(A) || A.match(/const RGA_ACCESS_GITHUB = "([^"]+)";/)[1] !== DATA.github) fail("admin's RGA_ACCESS_GITHUB ≠ site-platforms.json github");
if (!/authuser=\$\{encodeURIComponent\(RGA_ACCESS_ACCOUNT\)\}#search\//.test(A) || !/\$\{accInviteLinkHtml\(ci, p, name\)\}<button type="button" class="admin-button" data-ob-acc-confirm/.test(A)) fail("other builders lost \"Open <builder>'s invite in access@\" before Confirm access");
if (/authuser=hello@[^"`]*#search/.test(A)) fail("an invite link opens hello@'s inbox — invites go to access@");

if (F.length) { console.error(`❌ step 3 GitHub accept — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log(`✅ step 3 GitHub accept holds: runs only as ${DATA.github} (no key / refused / wrong account stop it) · accept → role read back → their domain found in the repo (strict) · Read, expired, gone never confirm · the grant is recorded only when both pass, names user + repo; check never writes; confirm reads the role live · admin row 8 states + access@ invite links`);
