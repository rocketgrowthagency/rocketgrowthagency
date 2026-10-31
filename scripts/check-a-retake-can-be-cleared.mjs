#!/usr/bin/env node
// check-a-retake-can-be-cleared.mjs — a photo RGA (or Google) turned down can be cleared without uploading a new one; the
// retake reads as one thin line; the shot's facts sit together in one quiet style.
//
// 🔒 WHY (approved clear_a_retake_v1 v2, 2026-10-16). Chris: "how can I clear this without loading new? is this something we
// should have an option for?", "the Needs your space and then No people changes based on if there is no issue or issue",
// and of v1 "not so tall on the yellow cards". The withdraw runs for real against a faked database (Google is never
// called: a turned-down photo never reached it); the portal's own renderer is lifted and drawn.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";   // 10-30: step 10 joined the card system (batch 2) — photoSlotsHtml asks CS_STEPS / csNote / csChips

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", STEP = "m1.gbp.photos", PARENT = "accounts/1/locations/2";
const T1 = "11111111-1111-1111-1111-111111111111", T2 = "22222222-2222-2222-2222-222222222222";

// ── 1 · the server: Clear it = withdraw, recorded on the step and in the activity log; any other emptying drops the note ──
function world(rows) {
  const w = { rows: rows.map((r) => ({ ...r })), acts: [], google: 0, tasks: { [STEP]: { draft_shape: {} } } };
  const res = (status, body) => ({ ok: status < 300, status, text: async () => "", json: async () => body });
  w.d = {
    now: () => Date.parse("2026-10-16T18:00:00Z"), gate: async () => ({ email: "client@x.test" }), accessToken: async () => "tok",
    recount: async () => {}, recordChange: async () => {},
    fetch: async (url, init = {}) => { w.google++; return (init.method || "GET") === "DELETE" ? res(200, {}) : res(404, {}); },
    readStepRecord: async () => ({ id: "r1", tasks: JSON.parse(JSON.stringify(w.tasks)) }),
    writeStepTasks: async (_s, _r, t) => { w.tasks = JSON.parse(JSON.stringify(t)); return { tasks: w.tasks }; },
    supa: async (p, init = {}) => {
      const m = init.method || "GET";
      if (p.startsWith("/client_photo_publishes")) return null;
      if (p.startsWith("/client_activity")) { w.acts.push(JSON.parse(init.body)); return null; }
      if (p.startsWith("/clients?")) return [{ workspace_id: "ws" }];
      if (p.startsWith("/client_google_oauth")) return [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }];
      if (p.startsWith("/client_onboarding_records")) return [{ data: { tasks: w.tasks } }];
      if (p.startsWith("/client_photos")) {
        const q = new URLSearchParams(p.split("?")[1]); const eq = (k) => (q.get(k) || "").replace(/^eq\./, "");
        let out = w.rows;
        if (q.get("id")) out = out.filter((r) => r.id === eq("id"));
        if (q.get("publish_state")?.startsWith("eq.")) out = out.filter((r) => r.publish_state === eq("publish_state"));
        if (m === "PATCH") { const patch = JSON.parse(init.body); for (const r of out) Object.assign(r, patch); }
        return out.map((r) => ({ ...r }));
      }
      throw new Error("no route " + p);
    },
  };
  return w;
}
let RM;
try { RM = req("./portal-photo-remove.js").removePhoto; } catch (e) { console.error(`⚠️  INDETERMINATE — portal-photo-remove did not load: ${e.message}`); process.exit(2); }
const rm = async (w, photoId) => { const r = await RM({ event: {}, clientId: CID, deps: w.d, photoId }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
const ROW = (o) => ({ client_id: CID, created_at: "2026-10-10T16:00:00Z", file_name: "f.jpg", category: "interior", ...o });
{
  const w = world([ROW({ id: T1, shot_n: 7, publish_state: "turned_down", review_note: "Not your space.\nHow to fix: Take it in your office." })]);
  const r = await rm(w, T1);
  const c = w.tasks[STEP].retake_cleared?.["7"];
  if (r.status !== 200 || r.body.state !== "withdrawn" || w.rows[0].publish_state !== "withdrawn") fail(`"Clear it" doesn't withdraw the turned-down photo (${r.status} ${JSON.stringify(r.body)})`);
  if (w.google) fail("clearing a photo that never reached Google called Google");
  if (!c || c.at !== "2026-10-16T18:00:00.000Z" || c.by !== "client@x.test" || c.photo_id !== T1) fail(`a cleared retake isn't kept on the step with when / who / which (${JSON.stringify(w.tasks[STEP].retake_cleared)})`);
  if (!r.body.tasks?.[STEP]?.retake_cleared?.["7"]) fail("the response doesn't carry the cleared slot (the portal redraws without its note)");
  const a = w.acts[0]?.payload;
  if (!a || a.cleared_retake !== true || a.summary !== "The client withdrew a photo before it went on Google (slot 7).") fail(`admin's activity line for a cleared retake isn't the approved one (${JSON.stringify(a)})`);
  // a later photo in that slot withdrawn → the old "Cleared" date goes
  w.rows.push(ROW({ id: T2, shot_n: 7, publish_state: "in_review" }));
  await rm(w, T2);
  if (w.tasks[STEP].retake_cleared?.["7"]) fail("a slot emptied another way still says \"Cleared <old date>\"");
}
{
  // removed from Google → the note goes too
  const w = world([ROW({ id: T1, shot_n: 7, publish_state: "published", gbp_media_name: `${PARENT}/media/m1` })]);
  w.tasks[STEP].retake_cleared = { 7: { at: "2026-10-01T00:00:00Z" } };
  const r = await rm(w, T1);
  if (r.body.state !== "removed" || w.tasks[STEP].retake_cleared?.["7"]) fail("a slot emptied by removing its photo from Google still says \"Cleared\"");
}

// ── 2 · the portal draws it: one thin line, Clear it at its end, Replace the only button; facts together and quiet ──
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
const howSrc = cut("function photoReviewTail(step, photos) {", "\n// ============== PHOTO UPLOAD");
if (!slotsSrc || !stateSrc || !bigSrc || !howSrc) { console.error("⚠️  INDETERMINATE — could not lift the renderer"); process.exit(2); }
process.removeAllListeners("warning");
const SECOND_LOGO = await import(pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { secondLogos: SECOND_LOGO.secondLogos, photoListedName: SECOND_LOGO.photoListedName, photoCountable: SECOND_LOGO.photoCountable, tidiedByRga: SECOND_LOGO.tidiedByRga, FILED_AS: SECOND_LOGO.FILED_AS, escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console, Date };
vm.createContext(ctx);
try { vm.runInContext(`${planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n"))}\n${csBlock(portal, planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n")))}\n${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }
const P = req("./_photo-lists.js");
const steps = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return null; } if (o && typeof o === "object") { if (o.id === STEP) return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const step = { ...find(steps), clientForm: "photo_upload" };
const sab = P.buildShotList({ typeOverride: "Marketing agencies", storefront: false, teamSize: "1" });
const shop = P.buildShotList({ typeOverride: "Marketing agencies", storefront: true, teamSize: "1" });
const spaceN = Number(sab.items.find((it) => it.place).n), plainN = Number(sab.items.find((it) => !it.place && it.google !== "PROFILE").n);
const slotOf = (html, n) => { const i = html.indexOf(`data-slot="${n}"`); if (i < 0) return ""; const j = html.indexOf('<div class="pm-ex-big"', i); return html.slice(i, j < 0 ? i + 3000 : j); };
const task = (shape, extra = {}) => ({ draft_shape: shape, team_size: "1", detected: { n: 2, threshold: 20, source: "google_profile" }, ...extra });
const TURNED = (n, o = {}) => ({ id: T1, shot_n: n, category: "interior", publish_state: "turned_down", created_at: "2026-10-10T16:00:00Z", storage_path: "x.jpg",
  reviewed_by: "hello@rocketgrowthagency.com", review_note: "This is a test image, not a real photo of your office, so we didn't send it to Google.\nHow to fix: Upload a real photo of your own space, taken with your phone.", ...o });
{
  const s = slotOf(ctx.how(step, task(sab), true, [TURNED(spaceN)], "c1", null), spaceN);
  if (!/<div class="pm-turned pm-retake-line"><span><b>Please retake\.<\/b> This is a test image, not a real photo of your office, so we didn(?:'|&#39;)t send it to Google\. Upload a real photo of your own space, taken with your phone\.<\/span><button type="button" class="pm-linkbtn pm-clear" data-photo-remove="11111111-1111-1111-1111-111111111111" data-photo-clear data-client-id="c1">Clear it<\/button><\/div>/.test(s)) fail(`a retake isn't one line "Please retake. <reason> <fix>" ending in Clear it (${s.slice(s.indexOf("pm-turned"), s.indexOf("pm-turned") + 400)})`);
  if (/data-on-google/.test(s.slice(s.indexOf("pm-clear") - 200))) fail("Clear it asks the \"takes it off Google\" question about a photo that never reached Google");
  if (/class="st you"|>Please retake<\/span>/.test(s) || !/<label class="add">\+ Replace photo<input/.test(s)) fail("a retake's status column isn't the one \"+ Replace photo\" button (the row grows tall again)");
  if (/From RGA:|How to fix:/.test(s)) fail("a retake line still carries the two-line labels");
  const g = slotOf(ctx.how(step, task(sab), true, [TURNED(spaceN, { reviewed_by: "Google", review_note: "This photo is too small for Google.\nHow to fix: Send the original." })], "c1", null), spaceN);
  if (!/<b>Please retake\.<\/b> Google said: This photo is too small for Google\. Send the original\./.test(g)) fail("a refusal from Google no longer says it was Google");
  if (!/<b>[^<]+<\/b><span class="pm-facts"><span class="pm-space-tag">Needs your space<\/span><span class="pm-ppl" data-ex-ppl=/.test(s)) fail("on a retake the shot's facts don't sit together right under the shot");
}
{
  const cleared = task(sab, { retake_cleared: { [spaceN]: { at: "2026-10-16T18:00:00Z" }, [plainN]: { at: "2026-10-16T18:00:00Z" } } });
  const h = ctx.how(step, cleared, true, [], "c1", null);
  const s = slotOf(h, spaceN), p = slotOf(h, plainN);
  if (!/<span class="pm-facts"><span class="pm-space-tag">Needs your space<\/span><span class="pm-ppl"[^>]*><\/span><\/span><em class="pm-cleared">Cleared Oct 16\. Take it whenever your space is ready\.<\/em>/.test(s) || !/\+ Add photo/.test(s)) fail("a cleared space shot isn't empty with \"Cleared Oct 16. Take it whenever your space is ready.\"");
  if (!/<em class="pm-cleared">Cleared Oct 16\. Take it whenever you(?:'|&#39;)re ready\.<\/em>/.test(p)) fail("a cleared shot that needs no space talks about a space");
  if (/pm-retake-line|Please retake/.test(s)) fail("a cleared slot still shows the retake");
  // a slot with a photo in it never shows an old "Cleared"
  const filled = slotOf(ctx.how(step, cleared, true, [{ id: "n", shot_n: spaceN, category: "interior", publish_state: "in_review", created_at: "2026-10-17T00:00:00Z", storage_path: "y.jpg" }], "c1", null), spaceN);
  if (/pm-cleared/.test(filled)) fail("a slot with a new photo still says \"Cleared\"");
  const sh = ctx.how(step, task(shop), true, [], "c1", null);
  if (/pm-space-tag/.test(sh)) fail("a storefront is told a shot needs its space");
}

// ── 3 · quiet facts, thin line; the click clears without a dialog and says so ──
const css = read("portal/portal.css");
const rule = (sel) => { const i = css.indexOf(`${sel} {`); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
const factRule = rule(".pm-slot .sd .pm-facts .pm-space-tag, .pm-slot .sd .pm-facts .pm-ppl");
if (!factRule || /state-(care|you|other)/.test(factRule) || !/color:var\(--portal-muted\)/.test(factRule)) fail("the shot's facts aren't one quiet style (amber / blue are for states, not facts)");
if (!/display:flex/.test(rule(".pm-turned.pm-retake-line")) || !/padding:5px 10px/.test(rule(".pm-turned.pm-retake-line"))) fail("the retake line isn't one thin flex line");
const js = portal.replace(/^[ \t]*\/\/.*$/gm, "");
if (!/portalToast\(b\.hasAttribute\("data-photo-clear"\) \? "<b>Cleared<\/b> · add a photo here whenever you're ready"/.test(js)) fail("Clear it doesn't say it cleared");

if (F.length) { console.error("🔴 A retake can't be cleared the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a retake can be cleared: one thin line (\"Please retake. <reason> <fix>\" … Clear it, Google still named), + Replace photo the only button; Clear it withdraws without a dialog or a Google call, kept on the step (when / who / which) and in admin's activity, and the slot reads \"Cleared <date>\" until it's filled or emptied another way; the facts sit together, quiet");
