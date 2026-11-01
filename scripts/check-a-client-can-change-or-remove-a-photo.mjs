#!/usr/bin/env node
// check-a-client-can-change-or-remove-a-photo.mjs — the client changes or removes a photo themselves; the logo says the
// truth about Google hiding it; a done step 7 folds; all 20 sent is RGA's move, not theirs.
//
// 🔒 WHY (approved photo_change_remove_v1, 2026-10-15). Chris: "the one image says 'On your Google profile' — this image IS
// NOT ON THE GBP" (Google keeps a logo but shows it only on a profile with a street address), then "should we have an
// option to Delete and Change image … should they be able to, or it sends request to RGA?" and "what happens when a client
// has all photos listed". The remove endpoint and the replace step run for real against a faked database and a faked
// Google (delete → read back); the portal's own renderer is lifted and drawn; every reader of client_photos must leave a
// retired photo out.
// 🔄 2026-10-30 night fixer: the fake deps gain readStepRecord / writeStepTasks (the remove endpoint clears a slot's retake
// since 10-16); the folded row's quote takes batch 1's `withRga && withRga.n != null` guard (the "All undefined sent" fix)
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";   // 10-30: step 10 joined the card system (batch 2) — photoSlotsHtml asks CS_STEPS / csNote / csChips

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// the step 7 renderer reads the shared second-logo rule (second_logo_cleanup_v1), imported by the portal itself
const SECOND_LOGO = await import((await import("node:url")).pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const nc = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");

// ── 1 · the schema knows the three retired states, and the log takes what the code writes ──
const sql = read("docs/supabase/RGA_CLIENT_PHOTO_CHANGE_REMOVE_2026-10-15.sql");
for (const st of ["replaced", "removed", "withdrawn"]) if (!new RegExp(`'published','waiting_connection','failed','rejected',\\s*'replaced','removed','withdrawn'`).test(sql)) { fail(`the migration doesn't allow the photo state "${st}"`); break; }
for (const o of ["returned_to_client", "rga_told", "replaced", "removed", "withdrawn", "remove_failed"]) if (!new RegExp(`outcome in \\([^)]*'${o}'`).test(sql)) fail(`the publish log refuses the outcome "${o}" the code writes`);
if (!/trigger in \('upload','admin','schedule','review','client'\)/.test(sql)) fail("the publish log refuses trigger \"client\" (a removal)");

// ── 2 · Remove, against a fake database and a fake Google ──
const R = req("./_photo-retire.js");
const PARENT = "accounts/1/locations/2";
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
function world({ rows = [], detected = [], googleGone = true, googleRefuses = false, owner = true } = {}) {
  const w = { rows: rows.map((r) => ({ ...r })), calls: [], logs: [], acts: [], ledger: [], recounts: 0, tasks: { "m1.gbp.photos": { detected: { items: detected } } } };
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? "" : JSON.stringify(body)), json: async () => body });
  w.d = {
    now: () => Date.parse("2026-10-16T18:00:00Z"),
    gate: async () => (owner ? { email: "client@x.test" } : { error: { statusCode: 403, body: "{}" } }),
    accessToken: async () => "tok",
    recount: async () => { w.recounts++; },
    recordChange: async (c) => { w.ledger.push(c); },
    // the step record (clear_a_retake_v1 · rga_manages_cleanup_v1): a withdraw / remove drops the slot's retake_cleared, read back
    readStepRecord: async () => ({ tasks: w.tasks }),
    writeStepTasks: async (_s, _r, tasks) => { w.tasks = tasks; return { tasks }; },
    fetch: async (url, init = {}) => {
      const m = init.method || "GET"; w.calls.push(`${m} ${url}`);
      if (m === "DELETE") return googleRefuses ? res(403, { error: { message: "nope" } }) : res(200, {});
      return googleGone ? res(404, {}) : res(200, { name: url });
    },
    supa: async (p, init = {}) => {
      const m = init.method || "GET";
      if (p.startsWith("/client_photo_publishes")) { w.logs.push(JSON.parse(init.body)); return null; }
      if (p.startsWith("/client_activity")) { w.acts.push(JSON.parse(init.body)); return null; }
      if (p.startsWith("/clients?")) return [{ workspace_id: "ws" }];
      if (p.startsWith("/client_google_oauth")) return [{ refresh_token: "r", gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }];
      if (p.startsWith("/client_onboarding_records")) return [{ data: { tasks: { "m1.gbp.photos": { detected: { items: detected } } } } }];
      if (p.startsWith("/client_photos")) {
        const q = new URLSearchParams(p.split("?")[1]);
        let out = w.rows.filter((r) => r.client_id === CID);
        const eq = (k) => (q.get(k) || "").replace(/^eq\./, "");
        if (q.get("id")?.startsWith("eq.")) out = out.filter((r) => r.id === eq("id"));
        if (q.get("id")?.startsWith("neq.")) out = out.filter((r) => r.id !== q.get("id").slice(4));
        if (q.get("shot_n")) out = out.filter((r) => String(r.shot_n) === eq("shot_n"));
        if (q.get("gbp_media_name")) out = out.filter((r) => r.gbp_media_name === eq("gbp_media_name"));
        if (q.get("created_at")?.startsWith("lt.")) out = out.filter((r) => r.created_at < q.get("created_at").slice(3));
        if (q.get("publish_state")?.startsWith("eq.")) out = out.filter((r) => r.publish_state === eq("publish_state"));
        if (m === "PATCH") { const patch = JSON.parse(init.body); for (const r of out) Object.assign(r, patch); return out.map((r) => ({ ...r })); }
        return out.map((r) => ({ ...r }));
      }
      throw new Error("no route " + p);
    },
  };
  return w;
}
const ROW = (o) => ({ client_id: CID, created_at: "2026-10-09T16:00:00Z", file_name: "f.jpg", ...o });
let RM;
try { RM = req("./portal-photo-remove.js").removePhoto; } catch (e) { console.error(`⚠️  INDETERMINATE — portal-photo-remove did not load: ${e.message}`); process.exit(2); }
const rm = async (w, body) => { const r = await RM({ event: {}, clientId: CID, deps: w.d, ...body }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
{
  // with RGA, never on Google → withdrawn, no Google call
  const w = world({ rows: [ROW({ id: "11111111-1111-1111-1111-111111111111", publish_state: "in_review", shot_n: 5, category: "at_work" })] });
  const r = await rm(w, { photoId: "11111111-1111-1111-1111-111111111111" });
  if (r.status !== 200 || r.body.state !== "withdrawn" || w.rows[0].publish_state !== "withdrawn" || w.calls.length) fail(`a photo still with RGA isn't simply withdrawn (${r.status} ${w.rows[0].publish_state}, ${w.calls.length} Google calls)`);
  if (!w.logs.some((l) => l.outcome === "withdrawn" && l.trigger === "client") || !w.acts.some((a) => a.kind === "gbp_photo_removed")) fail("a withdrawal isn't logged, or RGA can't see it (activity)");
}
{
  // on Google → deleted, read back gone, then removed + recount + ledger
  const w = world({ rows: [ROW({ id: "22222222-2222-2222-2222-222222222222", publish_state: "published", shot_n: 12, category: "at_work", gbp_media_name: `${PARENT}/media/abc` })] });
  const r = await rm(w, { photoId: "22222222-2222-2222-2222-222222222222" });
  if (r.status !== 200 || r.body.state !== "removed" || w.rows[0].publish_state !== "removed") fail(`a photo on Google isn't removed (${r.status} ${JSON.stringify(r.body).slice(0, 120)})`);
  // the first call reads Google's list, for the name it holds the photo under (audit 10-31; check-step10-photo-truth runs that rule)
  const gCalls = w.calls.filter((c) => !c.includes("/media?"));
  if (gCalls[0] !== `DELETE https://mybusiness.googleapis.com/v4/${PARENT}/media/abc` || gCalls[1] !== `GET https://mybusiness.googleapis.com/v4/${PARENT}/media/abc`) fail(`a removal isn't a Google delete then a read-back (${w.calls.join(" | ")})`);
  if (!w.recounts || !w.ledger.length || !w.logs.some((l) => l.outcome === "removed")) fail("a removal doesn't recount, log, or reach the change ledger");
  if (!r.body.tasks) fail("a removal doesn't return the record (the portal can't redraw with Google's new count)");
}
{
  // Google still shows it → not removed, said so
  const w = world({ googleGone: false, rows: [ROW({ id: "33333333-3333-3333-3333-333333333333", publish_state: "published", shot_n: 12, category: "at_work", gbp_media_name: `${PARENT}/media/abc` })] });
  const r = await rm(w, { photoId: "33333333-3333-3333-3333-333333333333" });
  if (r.status === 200 || w.rows[0].publish_state !== "published") fail("a photo Google still lists is marked removed (no read-back)");
  const w2 = world({ googleRefuses: true, rows: [ROW({ id: "33333333-3333-3333-3333-333333333333", publish_state: "published", shot_n: 12, category: "at_work", gbp_media_name: `${PARENT}/media/abc` })] });
  const r2 = await rm(w2, { photoId: "33333333-3333-3333-3333-333333333333" });
  if (r2.status === 200 || w2.rows[0].publish_state !== "published" || !w2.logs.some((l) => l.outcome === "remove_failed")) fail("a refused delete is reported as done, or not kept in the log");
}
{
  const w = world({ rows: [ROW({ id: "44444444-4444-4444-4444-444444444444", publish_state: "published", shot_n: 1, category: "logo", gbp_media_name: `${PARENT}/media/profile` })] });
  if ((await rm(w, { photoId: "44444444-4444-4444-4444-444444444444" })).status !== 400 || w.calls.length) fail("the logo can be removed (one per profile: change only)");
  const w2 = world({ rows: [ROW({ id: "55555555-5555-5555-5555-555555555555", publish_state: "publishing", shot_n: 3, category: "at_work" })] });
  if ((await rm(w2, { photoId: "55555555-5555-5555-5555-555555555555" })).status !== 409) fail("a photo mid-send to Google can be removed");
  const w3 = world({ owner: false, rows: [ROW({ id: "66666666-6666-6666-6666-666666666666", publish_state: "in_review", shot_n: 3, category: "at_work" })] });
  if ((await rm(w3, { photoId: "66666666-6666-6666-6666-666666666666" })).status !== 403 || w3.rows[0].publish_state !== "in_review") fail("someone other than the client can remove their photo");
}
{
  // a photo on Google before RGA: only one the step measured, on this client's own location, never the logo / cover
  const g = { name: `${PARENT}/media/old1`, category: "EXTERIOR" };
  const w = world({ detected: [g, { name: `${PARENT}/media/profile`, category: "PROFILE" }] });
  const r = await rm(w, { mediaName: g.name });
  if (r.status !== 200 || w.calls[0] !== `DELETE https://mybusiness.googleapis.com/v4/${g.name}` || !w.recounts) fail(`a photo that was on Google before RGA can't be removed (${r.status})`);
  if ((await rm(world({ detected: [g] }), { mediaName: `${PARENT}/media/nothere` })).status !== 404) fail("any Google media name can be removed (it must be one the step measured)");
  if ((await rm(world({ detected: [{ name: `${PARENT}/media/profile`, category: "PROFILE" }] }), { mediaName: `${PARENT}/media/profile` })).status !== 400) fail("the logo on Google can be removed");
  const other = { name: "accounts/9/locations/9/media/x", category: "EXTERIOR" };
  if ((await rm(world({ detected: [other] }), { mediaName: other.name })).status !== 400) fail("a photo on another Google profile can be removed");
}

// ── 3 · Change: the old photo of the slot comes off Google only after the new one is up ──
{
  const old = ROW({ id: "o1", publish_state: "published", shot_n: 12, category: "at_work", gbp_media_name: `${PARENT}/media/old`, created_at: "2026-10-09T10:00:00Z" });
  const w = world({ rows: [old] });
  const nu = { id: "n1", shot_n: 12, created_at: "2026-10-16T10:00:00Z", file_name: "new.jpg", uploaded_by_email: "client@x.test" };
  const out = await R.retireReplaced({ d: w.d, token: "t", clientId: CID, photo: nu, media: `${PARENT}/media/new`, nowIso: "2026-10-17T00:00:00Z", trigger: "admin" });
  if (out.replaced !== 1 || w.rows[0].publish_state !== "replaced" || w.rows[0].replaced_by !== "n1" || w.calls.filter((c) => !c.includes("/media?"))[0] !== `DELETE https://mybusiness.googleapis.com/v4/${PARENT}/media/old`) fail(`a change doesn't take the old photo off Google and retire it (${JSON.stringify(out)} ${w.rows[0].publish_state} ${w.calls.join("|")})`);
  if (!w.logs.some((l) => l.outcome === "replaced")) fail("a change isn't kept in the publish log");
  const wl = world({ rows: [{ ...old, category: "logo", gbp_media_name: `${PARENT}/media/logo-before` }] });
  await R.retireReplaced({ d: wl.d, token: "t", clientId: CID, photo: nu, media: `${PARENT}/media/profile`, nowIso: "2026-10-17T00:00:00Z", trigger: "admin" });
  if (wl.calls.length || wl.rows[0].publish_state !== "replaced") fail("a new logo deletes the logo on Google (Google swaps it itself), or the old row isn't retired");
  const wf = world({ googleRefuses: true, rows: [old] });
  const of = await R.retireReplaced({ d: wf.d, token: "t", clientId: CID, photo: nu, media: `${PARENT}/media/new`, nowIso: "2026-10-17T00:00:00Z", trigger: "admin" });
  if (of.failed !== 1 || wf.rows[0].publish_state !== "published" || !wf.logs.some((l) => l.outcome === "remove_failed")) fail("an old photo Google wouldn't delete is marked replaced (it's still on Google)");
  const pub = nc(read("netlify/functions/_photo-publish.js"));
  const i = pub.indexOf('await record("published", { category, status, media, url });'), j = pub.indexOf("retireReplaced({ d, token, clientId, photo, media, nowIso, trigger })");
  if (i < 0 || j < 0 || j < i) fail("the publisher doesn't retire the replaced photo AFTER the new one is on Google");
}

// ── 4 · every reader of client_photos leaves a retired photo out ──
const READERS = [
  ["netlify/functions/flow-execute.js", /shot_n=not\.is\.null&publish_state=not\.in\.\(turned_down,replaced,removed,withdrawn\)&select=id`/],
  ["netlify/functions/flow-execute.js", /shot_n=not\.is\.null&publish_state=not\.in\.\(turned_down,replaced,removed,withdrawn\)&select=shot_n`/],
  ["netlify/functions/portal-photo-team.js", /publish_state=not\.in\.\(turned_down,replaced,removed,withdrawn\)&select=shot_n/],
  ["netlify/functions/admin-photo-review.js", /client_photos\?client_id=eq\.\$\{encodeURIComponent\(client_id\)\}&\$\{NOT_RETIRED\}&select=id,storage_path/],
  ["netlify/functions/photo-match.js", /client_photos\?client_id=eq\.\$\{encodeURIComponent\(client_id\)\}&\$\{NOT_RETIRED\}&select=id,gbp_media_name/],
  ["netlify/functions/portal-step-recheck.js", /const rows = await supa\(`\/client_photos\?client_id=eq\.\$\{clientId\}&\$\{NOT_RETIRED\}&select=id`\);/],
  ["netlify/functions/portal-step-recheck.js", /\$\{table === "client_photos" \? `&\$\{NOT_RETIRED\}` : ""\}&select=id/],
  ["portal/portal.js", /\.in\("client_id", clientIds\)\s*\n[^\n]*\n\s*\.not\("publish_state", "in", `\(\$\{PHOTO_RETIRED\.join\(","\)\}\)`\)/],
  ["portal/portal.js", /from\("client_photos"\)\.select\("\*"\)\.eq\("client_id", clientId\)\.not\("publish_state", "in", `\(\$\{PHOTO_RETIRED\.join\(","\)\}\)`\)/],
  ["admin/admin.js", /const photosOfClient = \(\) => \(state\.photos \|\| \[\]\)\.filter\(\(p\) => p\.client_id === state\.selectedClient\?\.id && !PHOTO_RETIRED\.includes\(p\.publish_state\)\);/],
];
for (const [f, re] of READERS) if (!re.test(nc(read(f)))) fail(`${f} can count a replaced / removed / withdrawn photo`);
if (R.NOT_RETIRED !== "publish_state=not.in.(replaced,removed,withdrawn)") fail("NOT_RETIRED doesn't exclude all three retired states");

// ── 5 · the portal: the slot controls, the honest logo, the change in flight, the done fold ──
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
const howSrc = cut("function photoReviewTail(step, photos) {", "\n// ============== PHOTO UPLOAD");
if (!slotsSrc || !stateSrc || !bigSrc || !howSrc) { console.error("⚠️  INDETERMINATE — could not lift the renderer"); process.exit(2); }
process.removeAllListeners("warning");
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { secondLogos: SECOND_LOGO.secondLogos, photoListedNames: SECOND_LOGO.photoListedNames, photoLiveByLine: SECOND_LOGO.photoLiveByLine, photoOnlyVisible: SECOND_LOGO.photoOnlyVisible, photoShortfall: SECOND_LOGO.photoShortfall, photoMissingFromList: SECOND_LOGO.photoMissingFromList, photoCountable: SECOND_LOGO.photoCountable, tidiedByRga: SECOND_LOGO.tidiedByRga, FILED_AS: SECOND_LOGO.FILED_AS, escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console, Date };
vm.createContext(ctx);
try { vm.runInContext(`${planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n"))}\n${csBlock(portal, planCardKit(portal, [stateSrc, bigSrc, slotsSrc].join("\n")))}\n${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml; this.allSent = photosAllSent;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }
const P = req("./_photo-lists.js");
const steps = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return null; } if (o && typeof o === "object") { if (o.id === "m1.gbp.photos") return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const step = { ...find(steps), clientForm: "photo_upload" };
const shapeFor = (storefront) => P.buildShotList({ typeOverride: "Marketing agencies", storefront, teamSize: "1" });
const sab = shapeFor(false), shop = shapeFor(true);
const logoN = Number(sab.items.find((it) => it.google === "PROFILE").n), workN = Number(sab.items.find((it) => it.google === "AT_WORK").n);
const slotOf = (html, n) => { const i = html.indexOf(`data-slot="${n}"`); if (i < 0) return ""; const j = html.indexOf('<div class="pm-ex-big"', i); return html.slice(i, j < 0 ? i + 3000 : j); };
const task = (shape, extra = {}) => ({ draft_shape: shape, team_size: "1", detected: { n: 2, threshold: 20, source: "google_profile" }, ...extra });
const PUB = (n, cat, o = {}) => ({ id: `p${n}`, shot_n: n, category: cat, publish_state: "published", pushed_at: "2026-10-09T16:20:00Z", created_at: "2026-10-09T16:00:00Z", storage_path: "x.jpg", ...o });
{
  const h = ctx.how(step, task(sab), true, [PUB(logoN, "logo"), PUB(workN, "at_work")], "c1", null);
  const lg = slotOf(h, logoN), wk = slotOf(h, workN);
  if (!/Saved, not showing<\/span>/.test(lg) || /On your Google profile/.test(lg)) fail("the logo on a profile with no street address still says \"On your Google profile\" (Google hides it)");
  if (!/<label class="add">Change<input[^>]*data-slot-file[^>]*data-shot-n="\d+"/.test(lg) || /data-photo-remove/.test(lg)) fail("the logo isn't changeable, or can be removed");
  // 🔴 10-15: the note borrowed .pm-note (the message shape, max 62ch) and stopped at 60% of the row — its own class only
  if (/class="[^"]*\bpm-note\b/.test(lg)) fail("the logo row borrows .pm-note, capped at 62ch");
  if (!/(?:Sent · up to 48 hours|Not on Google&#39;s list yet|On Google&#39;s list)<\/span><small class="pm-ctl">Published Oct 9 · <label class="add">Change<input/.test(wk) || !/data-photo-remove="p\d+" data-on-google/.test(wk)) fail("a photo on Google has no Change · Remove under its date");
  const hs = ctx.how(step, task(shop), true, [PUB(logoN, "logo")], "c1", null);
  if (!/(?:Sent · up to 48 hours|Not on Google&#39;s list yet|On Google&#39;s list)<\/span>/.test(slotOf(hs, logoN)) || /Saved, not showing/.test(hs)) fail("a storefront's logo is called hidden (only a profile with no street address is)");
}
{
  // a change on its way: the new one with RGA, the old one still counts
  const nu = { id: "n1", shot_n: workN, category: "at_work", publish_state: "in_review", created_at: "2026-10-16T10:00:00Z", storage_path: "y.jpg" };
  const h = ctx.how(step, task(sab), true, [nu, PUB(workN, "at_work")], "c1", null);
  const wk = slotOf(h, workN);
  if (!/With RGA for review/.test(wk) || !/Your new photo replaces the one on Google once it(?:'|&#39;)s up there\. Until then the old one stays, so your count doesn(?:'|&#39;)t drop\./.test(wk)) fail("a change in review doesn't say the old photo stays on Google until the new one is up");
  if (!/data-photo-remove="n1"(?! data-on-google)/.test(wk)) fail("a photo with RGA can't be withdrawn (Remove, no dialog)");
  // the logo kind has one slot: with a new logo in review it must still read done (the old logo is still on Google)
  const nuLogo = { id: "n2", shot_n: logoN, category: "logo", publish_state: "in_review", created_at: "2026-10-16T10:00:00Z", storage_path: "z.jpg" };
  const lk = ctx.how(step, task(sab), true, [nuLogo, PUB(logoN, "logo")], "c1", null);
  // 🔄 10-30 (client_step10_photos_v3, step 10 on the card system): the kinds are TILES + the shot list's chips, not folds — the logo's
  // tile stays done (✓, is-on) and its kind chip reads 1/1 (marked main), never "with RGA" or empty
  const logoTile = (new RegExp(`<button type="button" class="pm-p10-t([^"]*)" data-p10-t="${logoN}"`).exec(lk) || [])[1];
  const logoChip = /<span class="pm-cs-chip ?([^"]*)"><button type="button" class="pm-p10-k" data-p10-kind="[^"]*">Logo <em>(\d+)\/(\d+)<\/em>/.exec(lk);
  if (logoTile == null || !/\bis-on\b/.test(logoTile) || !logoChip || logoChip[2] !== logoChip[3]) fail(`a change in review makes its kind look unfinished (the old photo is still on Google) — tile "${logoTile}", chip ${logoChip ? logoChip[0].slice(-40) : "missing"}`);
}
{
  const g = { name: `${PARENT}/media/g1`, category: "EXTERIOR", thumb: "t.jpg", at: "2025-12-02T00:00:00Z" };
  const h = ctx.how(step, task(sab, { detected: { n: 2, threshold: 20, source: "google_profile", items: [g] } }), true, [], "c1", null);
  if (!new RegExp(`data-media-name="${PARENT.replace(/\//g, "\\/")}\\/media\\/g1" data-on-google`).test(h)) fail("a photo that was on Google before RGA can't be removed");
}
{
  const done = ctx.how(step, task(sab, { status: "done", completed_at: "2026-10-30T12:00:00Z", detected: { n: 20, threshold: 20, source: "google_profile", verdict: "confirmed" } }), false, [PUB(workN, "at_work")], "c1", null);
  // 🔄 10-26 (approved steps_6_20_clean_v1 v2, step 10 done): the plan card — "20 photos on Google", a tile per kind with one of their
  // photos, "Add more any time" — then the photos one click away (each keeps Change / Remove)
  const band = done.indexOf('class="pm-k5-plan ok"'), fold = done.indexOf('<details class="pm-later-list pm-pc-more" data-fold="done-list"><summary>Show your photos');
  // 🔄 10-30 (client_step10_photos_v4 "Done · on Google"): a tile per shot, "On your profile" by kind, "Add more any time; fresh photos help."
  if (band < 0 || !/<b>20 photos on Google<\/b><span>done Oct 30<\/span>/.test(done) || !/<div class="pm-p10 is-done">/.test(done) || !/<span class="k">On your profile<\/span>/.test(done) || !/Add more any time; fresh photos help\./.test(done) || !/data-photo-addmore>Add more<\/button>/.test(done)) fail("a done photo step isn't the plan card (N photos on Google · a tile per shot · On your profile · Add more)");
  if (fold < band || done.indexOf('class="pm-slots') < fold) fail("a done photo step doesn't fold its photos behind \"Show your photos\"");
  if (/Remind me later|data-later-days/.test(done)) fail("a done photo step still offers \"Remind me later\"");
  if (/data-fold="done-list"/.test(ctx.how(step, task(sab), true, [], "c1", null))) fail("an open photo step is folded as if done");
}
{
  const all = sab.items.map((it) => ({ shot_n: Number(it.n), publish_state: Number(it.n) === workN ? "in_review" : "published" }));
  const a = ctx.allSent({ id: "m1.gbp.photos" }, { draft_shape: sab }, all);
  if (!a || a.n !== sab.items.length || a.review !== 1) fail(`all ${sab.items.length} sent isn't recognised (${JSON.stringify(a)})`);
  if (ctx.allSent({ id: "m1.gbp.photos" }, { draft_shape: sab }, all.slice(1))) fail("a step with an empty slot reads as all sent");
  if (ctx.allSent({ id: "m1.gbp.photos" }, { draft_shape: sab }, all.map((p) => (p.shot_n === workN ? { ...p, publish_state: "turned_down" } : p)))) fail("a slot to retake counts as sent");
}
const pc = nc(portal);
if (!/: withRga \? \{ text: "With RGA", cls: "rga" \}/.test(pc) || !/&& !gbpWithRga && !withRga && \(Boolean\(step\.clientInput\)/.test(pc)) fail("all photos sent still says Your turn");
if (!/&& !r\.later && !r\.withRga(?: && !r\.notDue)?(?: && r\.taskState\?\.google_push\?\.state !== "with_rga")?\)/.test(pc) || !/&& !i\.withRga/.test(pc)) fail("all photos sent can still be the client's next step / the banner's headline");
if (!/withRga && withRga\.n != null \? `<span class="pm-step-sub">All \$\{withRga\.n\} sent\$\{withRga\.review \? ` · \$\{withRga\.review\} with RGA for review` : ""\} · nothing needed from you<\/span>`/.test(pc)) fail("the folded row doesn't say all photos are sent and nothing is needed");
if (!/\(!isDone \|\| \(status === "done" && step\.clientForm === "photo_upload" && !month2Only\)\) && step\.clientHow/.test(pc)) fail("a done photo step can't be opened to its photos");
const rmh = (() => { const i = pc.indexOf('closest("[data-photo-remove]")'); return i < 0 ? "" : pc.slice(i, pc.indexOf("\n});", i)); })();
if (!/if \(onGoogle\) \{\s*const ok = await portalConfirm\(\{ tone: "danger", pill: "TAKES IT OFF GOOGLE", title: "Remove this photo from Google\?"/.test(rmh) || !/if \(!ok\) return;/.test(rmh)) fail("removing a photo on Google doesn't ask first (the red permanent dialog)");
if (!/b\.classList\.add\("is-busy"\)/.test(rmh) || !/fetch\("\/\.netlify\/functions\/portal-photo-remove"/.test(rmh) || !/await settleStepResult\(listEl, j, fresh\);/.test(rmh)) fail("Remove doesn't spin, call the endpoint, or redraw with the fresh photos");
if (!/listEl\._rerender = \(freshOnboarding, freshMonthly, freshLists, freshPhotos(, local = false)?\) => renderActionItemsLive\([^)]*freshPhotos \|\| photos/.test(pc) || !/tasks: j\.tasks \} \}, undefined, undefined, freshPhotos\);/.test(pc)) fail("the step can't redraw with fresh photos");
// the moment a Change is sent (before any reload) the slot says the old photo stays, and its kind's count doesn't move
{ const h = ctx.how(step, task(sab), true, [PUB(workN, "at_work")], "c1", null);
  if (!new RegExp(`data-slot="${workN}" data-on-google-slot`).test(h)) fail("a slot on Google isn't marked, so a Change in progress can't say the old photo stays"); }
if (!/if \(row\.hasAttribute\("data-on-google-slot"\)\) \{ if \(!row\.querySelector\("\.pm-swap"\)\) row\.insertAdjacentHTML\("beforeend", PHOTO_SWAP_NOTE\); \}\s*else bumpGroupCount\(row\);/.test(pc)) fail("a Change just sent doesn't say the old photo stays on Google (or bumps the kind's count twice)");
const pcss = read("portal/portal.css");
if (!/\.pm-linkbtn\.pm-photo-rm\.is-busy::after \{ border-color:var\(--portal-error\);/.test(pcss) || !/\.pm-pc-ptile \{/.test(pcss)) fail("the Remove spinner or the done band has no style");   /* 10-26: the done band became the plan card's photo tiles (steps_6_20_clean_v1); 10-30: the logo note became the card's own note (check-step10-photo-truth) */

// ── 6 · admin sees it ──
const admin = nc(read("admin/admin.js"));
if (!/out\.push\("Logo saved on Google · hidden: the profile shows no street address"\)/.test(admin)) fail("admin's step 39 doesn't say Google hides the logo");
if (!/changed by the client · \$\{md\(changed\[0\]\.retired_at\)\}/.test(admin) || !/Client removed \$\{gone\.length === 1 \? "1 photo" : `\$\{gone\.length\} photos`\} from Google · \$\{md\(gone\[0\]\.at\)\}/.test(admin)) fail("admin's step 39 doesn't say what the client changed or removed");
if (!/\.in\("kind", \["step_nudge_sent", "gbp_photo_removed"\]\)/.test(admin) || !/\+ laterLine\(task\) \+ photoLines\(task, stepId\);/.test(admin)) fail("admin doesn't read the client's removals, or doesn't show the photo lines");
if (!/Replaces the one on Google since/.test(admin) || !/\$\{replacesHtml\(p\)\}/.test(admin)) fail("a change in RGA's review doesn't say which photo on Google it replaces");

if (F.length) { console.error("🔴 Change / Remove / the honest logo / the done step don't work the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a client can change or remove a photo: Remove is owner-only, read back from Google, never the logo or cover, a photo with RGA is simply withdrawn; a change takes the old photo off Google only after the new one is up; every reader leaves retired photos out; the logo says Google hides it on a profile with no street address; a done step folds to one green line; all sent is RGA's move; admin sees all of it");
