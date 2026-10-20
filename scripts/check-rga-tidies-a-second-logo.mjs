#!/usr/bin/env node
// check-rga-tidies-a-second-logo.mjs — a second copy of a client's logo on Google is found for every client; RGA
// recommends removing it and removes it (admin Your action + step 39), the client is told why and keeps a veto.
//
// 🔄 (approved rga_manages_cleanup_v1, 2026-10-15) Chris on the live "Your call" card: "they hire us to do the work … RGA
// needs more of a manager role to decide these things." → feedback_rga_is_the_manager_client_gets_a_veto
//
// 🔒 WHY (approved second_logo_cleanup_v1, 2026-10-15). RGA's Dec 2025 logo-with-name image sat on Google filed as
// "Exterior": the AI check already called it "Your logo", admin showed "A second copy of slot 1" with no way to resolve
// it, and the client's portal said "RGA is sorting it, nothing to do". Chris: "#5 must be a universal fix implemented into
// the portal … if it's something the client needs to do then we make the message in the portal and a card to notify
// them … and sync with admin so admin knows too." The shared rule runs on cases across trades; the Keep endpoint runs
// against a faked database; the portal's renderer is lifted.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const nc = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
process.removeAllListeners("warning");

// ── 1 · the rule, for every client ──
const SL = await import(pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
const P = req("./_photo-lists.js");
const PARENT = "accounts/1/locations/2";
const g = (id, category, extra = {}) => ({ name: `${PARENT}/media/${id}`, category, thumb: "t", at: "2025-12-02T00:00:00Z", ...extra });
const caseFor = (type, storefront) => {
  const shape = P.buildShotList({ typeOverride: type, storefront, teamSize: "3-5" });
  const logoN = Number(shape.items.find((it) => it.google === "PROFILE").n);
  const other = Number(shape.items.find((it) => it.google !== "PROFILE").n);
  return { shape, logoN, other };
};
for (const [type, storefront] of [["Marketing agencies", false], ["Plumbers", false], ["Dentists", true], ["Restaurants", true]]) {
  let c;
  try { c = caseFor(type, storefront); } catch { continue; }
  const T = (items, ai = {}, extra = {}) => ({ draft_shape: c.shape, detected: { items }, photo_ai: { google: ai }, ...extra });
  const copy = g("copy", "EXTERIOR"), prof = g("profile", "PROFILE");
  const yes = SL.secondLogos(T([copy, prof], { [copy.name]: { name: "Your logo", slot: c.logoN } }), []);
  if (yes.open.length !== 1 || yes.open[0].name !== copy.name) fail(`${type}: a logo filed as Exterior beside the profile's logo isn't flagged`);
  if (SL.secondLogos(T([copy], { [copy.name]: { slot: c.logoN } }), []).open.length) fail(`${type}: flagged with no logo on the profile (it might BE their only logo)`);
  if (!SL.secondLogos(T([copy], { [copy.name]: { slot: c.logoN } }), [{ category: "logo", publish_state: "published", gbp_media_name: "x" }]).open.length) fail(`${type}: our published logo doesn't count as the profile's logo`);
  if (SL.secondLogos(T([copy, prof], { [copy.name]: { slot: c.other } }), []).open.length) fail(`${type}: a photo that isn't the logo is flagged (only the logo)`);
  if (SL.secondLogos(T([g("c", "COVER"), prof], { [`${PARENT}/media/c`]: { slot: c.logoN } }), []).open.length) fail(`${type}: the cover is flagged (it can't be removed)`);
  if (SL.secondLogos(T([copy, prof], { [copy.name]: { error: "x", slot: c.logoN } }), []).open.length) fail(`${type}: a failed AI look flags a photo`);
  if (SL.secondLogos(T([copy, prof], { [copy.name]: { slot: c.logoN } }), [{ gbp_media_name: copy.name }]).open.length) fail(`${type}: our own upload is flagged`);
  const kept = SL.secondLogos(T([copy, prof], { [copy.name]: { slot: c.logoN } }, { photo_kept: { [copy.name]: { at: "2026-10-16T00:00:00Z" } } }), []);
  if (kept.open.length || kept.kept.length !== 1) fail(`${type}: a kept copy still asks (or isn't listed as kept)`);
}
if (SL.FILED_AS.EXTERIOR !== "an outside photo") fail("Google's category isn't put in the client's words");

// ── 2 · Keep it: owner only, a photo the step measured, saved and read back ──
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
let owner = true, ws = false, store = null, drop = false;
req.cache[req.resolve("./_auth")] = { id: "auth", filename: req.resolve("./_auth"), loaded: true, exports: {
  requirePortalOwnerOrWorkspace: async () => (ws ? { email: "rga@x.test", viaWorkspace: true } : owner ? { email: "c@x.test" } : { error: { statusCode: 403, body: "{}" } }) } };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = init.method || "GET";
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? "" : JSON.stringify(body)), json: async () => body });
  if (/client_onboarding_records\?client_id=eq\./.test(u)) return res(200, [{ id: "r1", data: store }]);
  if (/client_onboarding_records\?id=eq\.r1$/.test(u) && m === "PATCH") { const d = JSON.parse(init.body).data; if (drop) delete d.tasks["m1.gbp.photos"].photo_kept; store = d; return res(204, null); }
  if (/client_onboarding_records\?id=eq\.r1&select=data/.test(u)) return res(200, [{ data: store }]);
  return res(404, { error: "no route " + u });
};
let K;
try { K = req("./portal-photo-keep.js").handler; } catch (e) { console.error(`⚠️  INDETERMINATE — portal-photo-keep did not load: ${e.message}`); process.exit(2); }
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", NAME = `${PARENT}/media/copy`;
const keep = async (name = NAME) => { const r = await K({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, media_name: name }) }); return r.statusCode; };
store = { tasks: { "m1.gbp.photos": { detected: { items: [{ name: NAME, category: "EXTERIOR" }] } } } };
if ((await keep()) !== 200 || !store.tasks["m1.gbp.photos"].photo_kept?.[NAME]?.at) fail("\"Keep it\" isn't saved");
if ((await keep(`${PARENT}/media/other`)) !== 404) fail("any photo name can be kept (only one the step measured)");
drop = true; if ((await keep()) !== 500) fail("a keep that didn't stick reports success (no read-back)"); drop = false;
owner = false; if ((await keep()) !== 403) fail("someone other than the client (or RGA) can answer for them"); owner = true;
ws = true; if ((await keep()) !== 200 || !/^rga:rga@x\.test \(client asked\)$/.test(store.tasks["m1.gbp.photos"].photo_kept[NAME].by)) fail("RGA can't record that the client asked to keep it (or it isn't marked as RGA's)"); ws = false;

// ── 2b · RGA removes it: same read-back removal, signed as RGA, and what it tidied is kept on the step ──
{
  const RM = req("./portal-photo-remove.js").removePhoto;
  const mk = (viaWs) => { const w = { calls: [], acts: [], ledger: [], rec: { id: "r1", tasks: { "m1.gbp.photos": { detected: { items: [{ name: NAME, category: "EXTERIOR", thumb: "t" }] } } } } };
    const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    w.d = { now: () => Date.parse("2026-10-16T18:00:00Z"), gate: async () => (viaWs ? { email: "rga@x.test", viaWorkspace: true } : { email: "c@x.test" }), accessToken: async () => "tok", recount: async () => {},
      recordChange: async (c) => w.ledger.push(c), fetch: async (u, i = {}) => { w.calls.push(`${i.method || "GET"} ${u}`); return (i.method || "GET") === "DELETE" ? res(200, {}) : res(404, {}); },
      readStepRecord: async () => ({ id: "r1", tasks: w.rec.tasks }), writeStepTasks: async (_s, _r, t) => { w.rec.tasks = t; return { tasks: t }; },
      supa: async (p0, init = {}) => { if (p0.startsWith("/client_activity")) { w.acts.push(JSON.parse(init.body)); return null; } if (p0.startsWith("/clients?")) return [{ workspace_id: "w" }];
        if (p0.startsWith("/client_google_oauth")) return [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }];
        if (p0.startsWith("/client_onboarding_records")) return [{ data: { tasks: w.rec.tasks } }]; if (p0.startsWith("/client_photos")) return []; return null; } };
    return w; };
  const w = mk(true);
  const r = await RM({ event: {}, clientId: CID, mediaName: NAME, cleanup: "second_logo", deps: w.d });
  const c = w.rec.tasks["m1.gbp.photos"].photo_cleanup?.[NAME];
  if (r.statusCode !== 200 || !c || c.why !== "second_logo" || !/^rga:/.test(c.done_by) || c.category !== "EXTERIOR" || !c.done_at) fail(`RGA's removal isn't kept on the step as RGA's cleanup (${r.statusCode} ${JSON.stringify(c)})`);
  if (w.calls[0] !== `DELETE https://mybusiness.googleapis.com/v4/${NAME}` || w.calls[1] !== `GET https://mybusiness.googleapis.com/v4/${NAME}`) fail("RGA's removal isn't a Google delete + read-back");
  if (!w.acts.some((a) => a.payload?.rga && /RGA removed a second copy of the logo/.test(a.payload.summary)) || w.ledger[0]?.changedBy !== "rga") fail("RGA's removal is logged as the client's");
  if (!/gate: \(event, clientId\) => requirePortalOwnerOrWorkspace\(event, clientId\),/.test(nc(read("netlify/functions/portal-photo-remove.js")))) fail("RGA's workspace can't remove a photo (the endpoint is owner-only)");
  // 🔴 the client's no is ENFORCED: an admin screen older than their answer can't remove what they kept (found live 10-15)
  const wk = mk(true); wk.rec.tasks["m1.gbp.photos"].photo_kept = { [NAME]: { at: "2026-10-16T01:58:45Z" } };
  const rk = await RM({ event: {}, clientId: CID, mediaName: NAME, cleanup: "second_logo", deps: wk.d });
  if (rk.statusCode !== 409 || wk.calls.length) fail("RGA can remove a photo the client asked to keep (a stale admin screen still offers it)");
  if (!/catch \(e\) \{\s*b\.disabled = false; b\.textContent = label;[^}]*\}[^]*?const fresh = await state\.adapter\.getOnboardingRecord\(c\.id\);/.test(nc(read("admin/admin.js")))) fail("after a refusal, admin doesn't re-read the record (it keeps offering Remove)");
  const wc = mk(false);
  if ((await RM({ event: {}, clientId: CID, mediaName: NAME, cleanup: "second_logo", deps: wc.d })).statusCode !== 400) fail("a client request can be filed as RGA's cleanup");
}

// ── 3 · the check runs by itself when the profile is counted ──
const pm = nc(read("netlify/functions/photo-match.js")), rc = nc(read("netlify/functions/portal-step-recheck.js"));
if (!/const g = await requireWorkspaceForClientOrInternal\(event, client_id\);/.test(pm) || !/if \(g\.internal && action !== "check"\) return json\(403/.test(pm)) fail("the AI photo check can't be asked by the step's own measurement (or an internal caller can confirm)");
const hook = (() => { const i = rc.indexOf('if (stepId === "m1.gbp.photos" && Array.isArray(probe.items) && tasks?.[stepId])'); return i < 0 ? "" : rc.slice(i, rc.indexOf("return json(200", i)); })();
if (!hook) fail("counting step 7's profile never asks the AI check (a second logo is only found when RGA opens step 39)");
else {
  if (!/m\.category !== "PROFILE" && m\.category !== "COVER" && !ours\.has\(m\.name\) && !seen\[m\.name\]/.test(hook)) fail("the automatic check re-looks at photos it has seen, or at ours / the logo / the cover (an AI call every count)");
  if (!/if \(unseen\.length && /.test(hook) || !/"x-internal-secret": process\.env\.INTERNAL_FN_SECRET/.test(hook) || !/action: "check"/.test(hook)) fail("the automatic check doesn't run only when something is unseen, or doesn't sign in as internal");
}

// ── 4 · the portal: the row, the card ──
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
const howSrc = cut("function photoReviewTail(step, photos) {", "\n// ============== PHOTO UPLOAD");
if (!slotsSrc || !stateSrc || !bigSrc || !howSrc) { console.error("⚠️  INDETERMINATE — could not lift the renderer"); process.exit(2); }
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const ctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, secondLogos: SL.secondLogos, tidiedByRga: SL.tidiedByRga, FILED_AS: SL.FILED_AS, console, Date };
vm.createContext(ctx);
try { vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml; this.card = secondLogoCardHtml;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }
const steps = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return null; } if (o && typeof o === "object") { if (o.id === "m1.gbp.photos") return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const step = { ...find(steps), clientForm: "photo_upload" };
const { shape, logoN } = caseFor("Marketing agencies", false);
const copy = g("copy", "EXTERIOR"), prof = g("profile", "PROFILE");
const T = (extra = {}) => ({ draft_shape: shape, team_size: "1", detected: { n: 2, threshold: 20, source: "google_profile", items: [copy, prof] }, photo_ai: { google: { [copy.name]: { name: "Your logo", slot: logoN } } }, ...extra });
{
  const h = ctx.how(step, T(), true, [], "c1", null);
  if (!/<details class="pm-p2-also" data-fold="already" open data-fold-held>/.test(h)) fail("the photo's fold doesn't open by itself while RGA is removing a copy (the card's link lands there)");
  if (!/RGA is removing a second copy of your logo\./.test(h) || /your call|RGA is filing it/i.test(h)) fail("the fold doesn't say RGA is removing it (or still says it's their call)");
  const r0 = h.indexOf("data-second-logo-row"), r1 = h.indexOf('<div class="pm-arow">', r0);
  const row = r0 < 0 ? "" : h.slice(r0, r1 < 0 ? h.indexOf("</details>", r0) : r1);
  if (!/<b class="pm-rec">RGA recommends removing it\.<\/b>/.test(row) || !/Google can show this copy at the top of your profile as if it were a photo of your business\./.test(row) || !/We(?:'|&#39;)ll take it off for you\. Nothing needed from you\./.test(row)) fail("the row doesn't say RGA recommends it, why, and that nothing is needed");
  if (!/<span class="pm-pill other">RGA is doing it<\/span><\/div>$/.test(row) || /data-photo-remove|pm-pill you/.test(row)) fail("the row still hands the client the decision (Remove button / Your call) instead of RGA is doing it");
  if (!/class="pm-linkbtn" data-photo-keep="[^"]+" data-client-id="c1">Prefer to keep it\?<\/button>/.test(row)) fail("the client has no veto (Prefer to keep it?)");
  const k = ctx.how(step, T({ photo_kept: { [copy.name]: { at: "2026-10-16T12:00:00Z" } } }), true, [], "c1", null);
  if (/data-photo-keep|data-fold-held/.test(k) || !/you kept it Oct 16/.test(k) || !/Extra · counts toward 20/.test(k)) fail("a kept copy still shows RGA removing it, or doesn't say they kept it");
  const done = ctx.how(step, { draft_shape: shape, team_size: "1", detected: { n: 1, threshold: 20, source: "google_profile", items: [prof] }, photo_cleanup: { [copy.name]: { why: "second_logo", category: "EXTERIOR", thumb: "t", done_at: new Date().toISOString(), done_by: "rga:x" } } }, true, [], "c1", null);
  if (!/Removed from Google by RGA · /.test(done) || !/✓ Tidied by RGA<\/span>/.test(done)) fail("after RGA removes it, the client isn't told what changed and who did it (Tidied by RGA)");
  const card = ctx.card([copy]);
  if (!/class="pm-notice is-info pm-second-logo" data-second-logo/.test(card) || /is-warn|Your call/.test(card)) fail("the card isn't RGA's (blue) — it still reads as the client's homework");
  if (!/RGA recommends · tidying your Google profile/.test(card) || !/We(?:'|&#39;)re removing a second copy of your logo from Google/.test(card) || !/<b>Why:<\/b> it(?:'|&#39;)s filed as an outside photo/.test(card) || !/Nothing needed from you\. <a class="pm-notice-go" href="#" data-portal-goto="setup" data-portal-scroll="step-row-m1\.gbp\.photos">Prefer to keep it\?/.test(card)) fail("the card doesn't say what RGA is doing, why, that nothing is needed, and how to say no");
}
const pc = nc(portal);
const refresh = (() => { const i = pc.indexOf("function refreshNextStepCards()"); return i < 0 ? "" : pc.slice(i, pc.indexOf("\n}\n", i)); })();
if (!/const sl = photoTask \? secondLogos\(photoTask, _nextStepInputs\.photos \|\| \[\]\) : \{ open: \[\] \};/.test(refresh) || !/(?:if \(next && next\.hasAttribute\("data-second-logo"\)\) next\.remove\(\);|for \(let next = card\.nextElementSibling; next && \(next\.hasAttribute\("data-second-logo"\) \|\| next\.hasAttribute\("data-facts-note"\)(?: \|\| next\.hasAttribute\("data-dup-note"\))?\); next = card\.nextElementSibling\) next\.remove\(\);)\s*(?:if \(dNote\) card\.insertAdjacentHTML\("afterend", dNote\);\s*)?(?:if \(fNote\) card\.insertAdjacentHTML\("afterend", fNote\);\s*)?if \(sl\.open\.length\) card\.insertAdjacentHTML\("afterend", secondLogoCardHtml\(sl\.open\)\);/.test(refresh)) fail("the card isn't placed under \"Your next step\", or never goes away once they've decided");
if (!/rgaWaits, photos: photos \|\| \[\] \};/.test(pc)) fail("the banner doesn't get the client's photos (so it can't tell their logo is up)");
const kh = (() => { const i = pc.indexOf('closest("[data-photo-keep]")'); return i < 0 ? "" : pc.slice(i, pc.indexOf("\n});", i)); })();
if (!/fetch\("\/\.netlify\/functions\/portal-photo-keep"/.test(kh) || !/await settleStepResult\(listEl, j\);/.test(kh) || !/b\.classList\.add\("is-busy"\)/.test(kh)) fail("the client's veto doesn't save, spin, or redraw");
const pcss = read("portal/portal.css");
if (!/\.pm-second-logo \.k \{ color:var\(--state-other\); \}/.test(pcss) || !/\.pm-badge-rga \{/.test(pcss)) fail("the card's label / badge isn't RGA's blue");

// ── 5 · admin: RGA's action ──
const admin = nc(read("admin/admin.js"));
if (!/if \(slOpen\.length\) \{\s*return \{\s*title: `Remove \$\{slOpen\.length === 1 \? "a second copy of the logo"/.test(admin) || !/reveal: PHOTO_REVIEW_STEP, tab: "onboarding-v2", scroll: "panel-onboarding-v2", btn: "See the photo",/.test(admin)) fail("removing a second logo isn't RGA's Your action");
if (!/if \(sl\.open\.length\) out\.push\(`Your action: remove /.test(admin) || !/out\.push\(`Client asked to keep the second copy of their logo · /.test(admin) || !/if \(tidied\.length\) out\.push\(`RGA removed /.test(admin)) fail("step 39 doesn't say it's RGA's action, that the client asked to keep it, or that RGA removed it");
if (!/data-sl-remove="\$\{escapeAttribute\(m\.name\)\}">Remove from Google<\/button><button type="button" class="admin-button admin-button-secondary" data-sl-keep=/.test(admin)) fail("step 39 has no Remove from Google / Keep it (client asked) for RGA");
if (!/\.pr-card\.pr-sl \{ grid-template-columns:150px minmax\(0,1fr\); \}/.test(read("admin/admin.css"))) fail("step 39's second-logo card squeezes its words into the review's middle column");
const slh = (() => { const i = admin.indexOf('closest("[data-sl-remove],[data-sl-keep]")'); return i < 0 ? "" : admin.slice(i, admin.indexOf("\n});", i)); })();
if (!/if \(remove && !await rgaDialog\(\{ kind: "confirm", danger: true, title: "Remove the second logo from Google\?"/.test(slh) || !/\{ client_id: c\.id, media_name: name, cleanup: "second_logo" \}/.test(slh)) fail("RGA's Remove doesn't ask first, or isn't filed as RGA's cleanup");
if (!/const gone = \(state\.photoRemovals \|\| \[\]\)\.filter\(\(r\) => r\.state === "removed" && !r\.rga && recent\(r\.at\)\);/.test(admin)) fail("RGA's own removal is reported as the client's");
const toSortOk = /const toSort = existing\.filter\(\(m\) => !matches\[m\.name\] && !asked\.has\(m\.name\)\);/.test(admin);
if (!toSortOk) fail("a second logo shows twice in step 39 (also in \"to sort\")");
if (!/if \(!task \|\| stepId !== PHOTO_REVIEW_STEP\) return "";/.test(admin) || (admin.match(/\$\{clientChose\(s\.task, o\.flowId\)\}/g) || []).length < 4) fail("admin's step-39 lines don't know which step they're on (they never draw)");

if (F.length) { console.error("🔴 A second copy of the logo isn't RGA's to tidy the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ RGA tidies a second copy of the logo: one rule (any trade, storefront or not; logo only; never the cover, ours, or with no logo on the profile), found when the profile is counted; the client sees a blue RGA-recommends card + why + nothing needed + a veto; RGA's Your action removes it (read back, signed as RGA, kept on the step) and the client sees Tidied by RGA");
