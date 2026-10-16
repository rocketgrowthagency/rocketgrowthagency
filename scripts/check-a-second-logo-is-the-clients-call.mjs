#!/usr/bin/env node
// check-a-second-logo-is-the-clients-call.mjs — a second copy of a client's logo on Google is found for every client,
// shown to the client as a card + a "Your call" row (Remove from Google · Keep it), and admin knows.
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
let owner = true, store = null, drop = false;
req.cache[req.resolve("./_auth")] = { id: "auth", filename: req.resolve("./_auth"), loaded: true, exports: {
  requirePortalOwner: async () => (owner ? { email: "c@x.test" } : { error: { statusCode: 403, body: "{}" } }) } };
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
owner = false; if ((await keep()) !== 403) fail("someone other than the client can answer for them"); owner = true;

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
const ctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, secondLogos: SL.secondLogos, FILED_AS: SL.FILED_AS, console, Date };
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
  if (!/<details class="pm-p2-also" data-fold="already" open data-fold-held>/.test(h)) fail("the photo's fold doesn't open by itself while it's the client's call");
  if (!/It(?:'|&#39;)s a second copy of your logo: your call\./.test(h) || /RGA is filing it/.test(h)) fail("the fold still says RGA is filing it");
  const r0 = h.indexOf("data-second-logo-row"), r1 = h.indexOf('<div class="pm-arow">', r0);
  const row = r0 < 0 ? "" : h.slice(r0, r1 < 0 ? h.indexOf("</details>", r0) : r1);
  if (!row || /RGA is sorting it/.test(row) || !/<span class="pm-pill you">Your call<\/span><\/div>$/.test(row)) fail("the second logo's row doesn't say it's the client's call (or still says RGA is sorting it)");
  if (!/Google filed it as an outside photo/.test(row) || !/Google can show this copy at the top of your profile, as if it were a photo of your business\./.test(row)) fail("the row doesn't say what it is and why it matters");
  if (!new RegExp(`class="pm-act is-go is-danger" data-photo-remove="" data-media-name="${PARENT.replace(/\//g, "\\/")}\\/media\\/copy" data-on-google`).test(row) || !/class="pm-act is-guide" data-photo-keep="/.test(row)) fail("the row has no Remove from Google / Keep it");
  const k = ctx.how(step, T({ photo_kept: { [copy.name]: { at: "2026-10-16T12:00:00Z" } } }), true, [], "c1", null);
  if (/data-photo-keep|data-fold-held/.test(k) || !/you kept it Oct 16/.test(k) || !/Extra · counts toward 20/.test(k)) fail("a kept copy still asks, or doesn't say they kept it");
  const card = ctx.card([copy]);
  if (!/class="pm-notice is-warn pm-second-logo" data-second-logo/.test(card) || !/Tidy your Google profile/.test(card) || !/A second copy of your logo is on Google, filed as an outside photo/.test(card) || !/data-portal-goto="setup" data-portal-scroll="step-row-m1\.gbp\.photos">Review it in step 7/.test(card)) fail("the top card doesn't say what it is and take them to step 7");
}
const pc = nc(portal);
const refresh = (() => { const i = pc.indexOf("function refreshNextStepCards()"); return i < 0 ? "" : pc.slice(i, pc.indexOf("\n}\n", i)); })();
if (!/const sl = photoTask \? secondLogos\(photoTask, _nextStepInputs\.photos \|\| \[\]\) : \{ open: \[\] \};/.test(refresh) || !/if \(next && next\.hasAttribute\("data-second-logo"\)\) next\.remove\(\);\s*if \(sl\.open\.length\) card\.insertAdjacentHTML\("afterend", secondLogoCardHtml\(sl\.open\)\);/.test(refresh)) fail("the card isn't placed under \"Your next step\", or never goes away once they've decided");
if (!/rgaWaits, photos: photos \|\| \[\] \};/.test(pc)) fail("the banner doesn't get the client's photos (so it can't tell their logo is up)");
const kh = (() => { const i = pc.indexOf('closest("[data-photo-keep]")'); return i < 0 ? "" : pc.slice(i, pc.indexOf("\n});", i)); })();
if (!/fetch\("\/\.netlify\/functions\/portal-photo-keep"/.test(kh) || !/await settleStepResult\(listEl, j\);/.test(kh) || !/b\.classList\.add\("is-busy"\)/.test(kh)) fail("Keep it doesn't save, spin, or redraw");
const pcss = read("portal/portal.css");
if (!/\.pm-act\.is-go\.is-danger \{ background:var\(--portal-error\);/.test(pcss) || !/\.pm-second-logo \.k \{ color:var\(--state-you\); \}/.test(pcss)) fail("Remove from Google isn't red, or the card's label isn't amber");

// ── 5 · admin knows ──
const admin = nc(read("admin/admin.js"));
if (!/if \(sl\.open\.length\) out\.push\(`Waiting on the client: \$\{sl\.open\.length === 1 \? "a second copy of their logo is"/.test(admin) || !/out\.push\(`Client kept the second copy of their logo · /.test(admin)) fail("admin's step 39 doesn't say it's waiting on the client, or that they kept it");
if (!/const toSort = existing\.filter\(\(m\) => !matches\[m\.name\] && !asked\.has\(m\.name\)\);/.test(admin) || !/const toSort = items\.length \? existing\.filter\(\(m\) => !matches\[m\.name\] && !asked\.has\(m\.name\)\)\.length : 0;/.test(admin)) fail("a second logo still counts as RGA's \"to sort\" (it's the client's call)");
if (!/A second copy of their logo · \$\{withClient\.length\}/.test(admin)) fail("admin doesn't list the second logo as with the client");
// 🔴 found live 10-15: photoLines compared the row's (merged copy of the) task to the stored one, so no line ever drew
if (!/if \(!task \|\| stepId !== PHOTO_REVIEW_STEP\) return "";/.test(admin) || (admin.match(/\$\{clientChose\(s\.task, o\.flowId\)\}/g) || []).length < 4 || /\$\{clientChose\(s\.task\)\}/.test(admin)) fail("admin's step-39 lines don't know which step they're on (they never draw)");

if (F.length) { console.error("🔴 A second copy of the logo isn't handled the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a second copy of the logo is the client's call: one rule (any trade, storefront or not; logo only; never the cover, ours, or with no logo on the profile), found when the profile is counted; a card under Your next step and a held-open \"Your call\" row with Remove from Google / Keep it (saved, read back, owner only); admin says it's waiting on the client and never counts it as RGA's");
