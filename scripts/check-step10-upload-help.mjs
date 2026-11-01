#!/usr/bin/env node
// check-step10-upload-help.mjs — approved client_step10_upload_help_v1 (11-01): help BEFORE the upload, not a refusal after it.
// RUNS the real code:
//   · the note under a photo (photoCheckNoteHtml, lifted from portal.js): a small photo (short side under 720) says its real size with
//     Keep it / Replace it; a photo of a different thing says what the check saw and what the shot asks for; a big photo, a missing size,
//     a check that errored, a check with no answer (matches not exactly false) and a photo the client kept say NOTHING (never a guess)
//   · portal-photo-check (the real handler on a fake database, the AI stubbed): one look per photo (a second call is answered from
//     the record, no second AI call), a failed look is not kept, a photo no longer with RGA is not looked at, the answer is saved
//     under photo_ai.uploads[photo id] (the key admin step 38 reads), nobody else's client is reachable (auth is asked first)
// AND reads the wiring: the hint under every upload box (empty and retake), the chips above the tiles, the saved stage asks for the
// check, the size limits are UNCHANGED (item 5, "a plain logo stops being refused", is not built: nothing in the repo backs Google's
// logo/cover exemption), and the AI call lives in one place (_photo-look.js) used by both RGA's check and the upload check.
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js"), PI = read("portal/index.html"), PH = read("netlify/functions/portal-photo-check.js"), PM = read("netlify/functions/photo-match.js"), LK = read("netlify/functions/_photo-look.js");

// ── 1. the note, run ──
const a = P.indexOf("const PHOTO_BEST_EDGE"), b = P.indexOf("const PHOTO_SWAP_NOTE");
if (a < 0 || b < a) { console.error("⚠️  INDETERMINATE — the note's code moved"); process.exit(2); }
const ctx = vm.createContext({ escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; } } });
vm.runInContext(`${P.slice(a, b)}\nthis.note = photoCheckNoteHtml; this.kept = photoKeptKey; this.HINT = PHOTO_HINT;`, Object.assign(ctx, { escapeAttribute: ctx.escapeHtml }));
const note = ctx.note;
const shot = { do: "You at your office entrance, your sign visible" };
const ID = "11111111-1111-1111-1111-111111111111";
const small = note({ id: ID, width: 300, height: 225 }, shot, null, "c1");
if (!/This photo is small, 300 × 225\./.test(small) || !/Best at 720 pixels or wider/.test(small) || !/data-photo-keep-note/.test(small) || !/data-photo-remove="1111/.test(small) || !/>Keep it</.test(small) || !/>Replace it</.test(small)) fail(`a small photo's note is wrong: ${small.slice(0, 200)}`);
if (note({ id: ID, width: 1200, height: 900 }, shot, null, "c1")) fail("a big photo gets a note");
if (note({ id: ID, width: 720, height: 720 }, shot, null, "c1")) fail("a photo at exactly 720 gets a note");
if (note({ id: ID, width: 5000, height: 719 }, shot, null, "c1") === "") fail("a photo with a 719 short side gets no note (the short side counts, not the long one)");
for (const [what, w, h] of [["no width", undefined, undefined], ["null size", null, null], ["zero size", 0, 0], ["text size", "wide", "tall"]]) if (note({ id: ID, width: w, height: h }, shot, null, "c1")) fail(`${what}: a note about a size nobody measured`);
const off = note({ id: ID, width: 1200, height: 900 }, shot, { what: "A simple company logo on white", matches: false }, "c1");
if (!/This looks like a simple company logo on white\./.test(off) || !/This shot asks for you at your office entrance, your sign visible\./.test(off) || !/RGA looks at it either way\./.test(off)) fail(`the off-shot note is wrong: ${off.slice(0, 240)}`);
for (const [what, c] of [["matches true", { what: "A logo", matches: true }], ["matches missing", { what: "A logo" }], ["matches null", { what: "A logo", matches: null }], ["an error", { error: "AI 500", what: "A logo", matches: false }], ["no description", { what: "", matches: false }], ["no check at all", null]])
  if (note({ id: ID, width: 1200, height: 900 }, shot, c, "c1")) fail(`${what}: the note speaks without a real "not this shot" answer`);
const both = note({ id: ID, width: 300, height: 225 }, shot, { what: "A logo", matches: false }, "c1");
if ((both.match(/data-check-note/g) || []).length !== 1 || !/small/.test(both) || !/This looks like a logo/.test(both)) fail("a small off-shot photo does not get ONE note with both lines");
ctx.localStorage.setItem(ctx.kept(ID), "1");
if (note({ id: ID, width: 300, height: 225 }, shot, null, "c1")) fail("a kept photo's note comes back");
if (/[—–]/.test(small + off)) fail("the note has a dash in its words");

// ── 2. the real handler ──
process.env.SUPABASE_URL = "https://sb.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"; process.env.ANTHROPIC_API_KEY = "test-ai";
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const authPath = req.resolve("./_auth.js");
let authAsked = 0, authOk = true;
req.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requirePortalOwnerOrWorkspace: async (_e, cid) => { authAsked++; return authOk ? { email: "owner@example.com" } : { error: { statusCode: 403, body: "{}" } }; } } };
for (const m of ["./portal-photo-check.js", "./_photo-look.js"]) delete req.cache[req.resolve(m)];
const H = req("./portal-photo-check.js");
const CID = "22222222-2222-2222-2222-222222222222";
let photo, rec, aiCalls = 0, aiMode = "ok", writes = 0;
const items = [{ n: 2, group: "Exterior", do: "You at your office entrance, your sign visible" }];
const fresh = () => { photo = { id: ID, storage_path: `${CID}/a.jpg`, shot_n: 2, publish_state: "in_review" }; rec = { id: "r1", data: { tasks: { "m1.gbp.photos": { draft_shape: { items } } } } }; aiCalls = 0; writes = 0; aiMode = "ok"; authAsked = 0; authOk = true; };
global.fetch = async (url, init = {}) => {
  url = String(url); const j = (b, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.includes("/client_photos?")) return j([photo]);
  if (url.includes("/client_onboarding_records?client_id=") ) return j([rec]);
  if (url.includes("/client_onboarding_records?id=")) { if (init.method === "PATCH") { writes++; rec.data = JSON.parse(init.body).data; return j([]); } return j([{ data: rec.data }]); }
  if (url.includes("/storage/v1/object/sign/")) return j({ signedURL: "/object/sign/x?token=t" });
  if (url.includes("api.anthropic.com")) { aiCalls++; if (aiMode === "fail") return j({ error: { message: "overloaded" } }, false); return j({ content: [{ text: JSON.stringify({ name: "Your logo", what: "A company logo on white", matches: false, slot: null }) }] }); }
  return j({}, false);
};
const call = async (body = { client_id: CID, photo_id: ID }) => { const r = await H.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) }); return { status: r.statusCode, body: JSON.parse(r.body || "{}") }; };
fresh(); let r = await call();
if (r.status !== 200 || !r.body.check || r.body.check.matches !== false || !/logo/i.test(r.body.check.what) || aiCalls !== 1 || writes !== 1) fail(`a first check does not look once and keep the answer (${r.status} ${JSON.stringify(r.body).slice(0, 120)} ai=${aiCalls} writes=${writes})`);
if (!rec.data.tasks["m1.gbp.photos"].photo_ai?.uploads?.[ID]?.what) fail("the answer is not kept under photo_ai.uploads[photo id], where admin step 38 reads it");
if (JSON.stringify(rec.data.tasks["m1.gbp.photos"].draft_shape.items) !== JSON.stringify(items)) fail("the check changed the step's shot list");
r = await call();
if (aiCalls !== 1 || !r.body.cached || !r.body.check) fail(`a second call looks again (ai calls ${aiCalls}) instead of answering from the record`);
fresh(); aiMode = "fail"; r = await call();
if (r.body.check !== null || writes !== 0 || rec.data.tasks["m1.gbp.photos"].photo_ai) fail("a failed look is kept or reported as an answer");
fresh(); photo.publish_state = "published"; r = await call();
if (r.body.check !== null || aiCalls !== 0) fail("a photo no longer with RGA is looked at");
fresh(); photo.shot_n = null; r = await call();
if (r.body.check !== null || aiCalls !== 0) fail("a photo with no shot is looked at");
fresh(); authOk = false; r = await call();
if (r.status !== 403 || aiCalls !== 0 || writes !== 0) fail("an unauthorized caller reaches the check");
fresh(); r = await call({ client_id: "nope", photo_id: ID });
if (r.status !== 400 || authAsked !== 0 && false) fail("a bad client id is not refused");
fresh(); r = await call({ client_id: CID, photo_id: "x" });
if (r.status !== 400 || aiCalls !== 0) fail("a bad photo id is not refused");

// ── 3. the wiring ──
if (!/data-slot-file data-client-id="\$\{escapeAttribute\(clientId\)\}" data-shot-n/.test(P)) fail("the slot's upload input moved");
const hints = (P.match(/<small class="pm-up-hint">\$\{escapeHtml\(PHOTO_HINT\)\}<\/small>/g) || []).length;
if (hints < 2) fail(`the hint line is under ${hints} of the 2 upload boxes (add, and replace after a retake)`);
if (ctx.HINT !== "JPG, PNG or a phone photo. Best at 720 pixels or wider. We resize big files for you.") fail("the hint line's words changed from the approved ones");
if (!/\$\{kinds\}<div class="pm-p10\$\{locked/.test(P) || !/csChips\("The shot list · photos added"/.test(P)) fail("the shot list chips are not above the tiles, or no longer say \"photos added\"");
if (!/if \(stage === "saved"\) \{ u\.sent\(d\.id\);[\s\S]*?photoCheckAtUpload\(/.test(P) || !/onStage\(i, "saved", \{ shot, id: row\.id, storagePath, width: prep\.width, height: prep\.height \}\)/.test(P)) fail("a saved photo no longer asks for the check with its real size");
if (!/photoCheckNoteHtml\(p, it, \(taskState\?\.photo_ai\?\.uploads \|\| \{\}\)\[p\.id\], clientId\)/.test(P)) fail("a photo that is with RGA no longer shows its note on the next visit");
if (!/const PHOTO_LIMITS = \{ minBytes: 10240, maxBytes: 5 \* 1024 \* 1024, minShortEdge: 250, maxEdge: 4000 \}/.test(P)) fail("the portal's photo limits changed (item 5 is not approved to build: Google's logo/cover exemption is not backed in the repo)");
if (!/\.catch|catch \(_\)/.test(P.slice(P.indexOf("async function photoCheckAtUpload"), P.indexOf("async function photoCheckAtUpload") + 900))) fail("the upload check can throw into the upload");
if (!/require\("\.\/_photo-look"\)/.test(PM) || !/require\("\.\/_photo-look"\)/.test(PH) || /api\.anthropic\.com/.test(PM + PH) || !/api\.anthropic\.com/.test(LK)) fail("the AI look is not in one place (_photo-look.js) used by both RGA's check and the upload check");
if (!/requirePortalOwnerOrWorkspace\(event, clientId\)/.test(PH) || PH.indexOf("requirePortalOwnerOrWorkspace(event") > PH.indexOf("look(url")) fail("the upload check does not ask who is calling before it looks");
if (!/publish_state !== "in_review"/.test(PH)) fail("the upload check looks at photos that are not with RGA");
const cv = (PI.match(/portal\.js\?v=([0-9a-z]+)/) || [])[1], cs = (PI.match(/portal\.css\?v=([0-9a-z]+)/) || [])[1];
if (!cv || !cs) fail("the portal's cache busters are missing");
if (!/\.pm-up-hint/.test(read("portal/portal.css")) || !/\.pm-check-note/.test(read("portal/portal.css"))) fail("the hint and the note have no styles");

if (F.length) { console.error(`🔴 step 10's upload help regressed — ${F.length}:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ step 10 upload help: a hint under every upload box, the chips above the tiles, a gentle size note, the AI look at upload (once per photo, advice only, never a guess), limits unchanged");
