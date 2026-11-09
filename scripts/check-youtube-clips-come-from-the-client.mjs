#!/usr/bin/env node
// check-youtube-clips-come-from-the-client.mjs — batch 4 item 9 (approved step mockup m1-55 "client records the clips").
// Step 55's instructions need the client on camera, but nothing ever asked them. Now: RGA's draft is 2 validated scripts
// (data); the client's step 14 shows them and takes 2 clips (upload ≤ 50 MB into their OWN folder, verified to exist, or a
// share link); row 55 lists them; Done needs both. RUNS portal-video-clip on a fake DB + storage.
//   exit 0 = holds · 1 = a clip can be faked / cross-client / lost, or the step done without them · 2 = harness
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS = `${SITE}/netlify/functions`;
const req = createRequire(`${FNS}/x.js`);
// 🔑 require.cache is keyed by the REAL path: a copy under /var/… is /private/var/… there, so compare real paths or the
// cache is never cleared and one case leaks module state into the next (found 10-19 by the mutation runner).
const FNS_REAL = fs.realpathSync(FNS);
const F = [], fail = (m) => F.push(m);
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.URL = "https://site.test";
globalThis.__rgaFetchDeadlineInstalled = true;
let yt; try { yt = req("./_youtube-clips.js"); } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }
// ── the draft is data ──
const PLAN = { channel: { name: "Acme Plumbing", description: "Local plumbing.", keywords: ["plumber"] },
  videos: [{ title: "Meet Acme", hook: "Hi, I'm Sam.", script: "We fix pipes.", cta: "Call us.", description: "Intro", tags: ["plumber"] },
    { title: "One tip", hook: "Quick tip.", script: "Shut the valve.", cta: "Call us.", description: "Tip", tags: [] }] };
{ const r = yt.parseYoutube(`ok ${JSON.stringify(PLAN)}`);
  if (!r.plan || r.plan.videos.length !== 2 || r.plan.videos[1].n !== 2) fail("a valid draft isn't parsed into 2 scripts");
  if (yt.parseYoutube("CHANNEL_NAME: Acme\nVIDEO 1 …").plan) fail("prose is accepted as scripts");
  if (yt.parseYoutube(JSON.stringify({ ...PLAN, videos: PLAN.videos.slice(0, 1) })).plan) fail("one script is accepted as two");
  if (yt.parseYoutube(JSON.stringify({ ...PLAN, videos: [{ ...PLAN.videos[0], script: "" }, PLAN.videos[1]] })).plan) fail("a video with no script is accepted");
  if (!/VIDEO 2 · One tip/.test(yt.renderYoutube(r.plan || PLAN))) fail("the rendered draft doesn't show both videos"); }
if (yt.MAX_BYTES !== 50 * 1024 * 1024) fail("the clip size limit isn't the project's 50 MB upload limit");
if (yt.shareLinkOf("javascript:alert(1)") || yt.shareLinkOf("drive.google.com/x") || !yt.shareLinkOf("https://drive.google.com/file/d/x")) fail("share links aren't limited to real https URLs");
// ── portal-video-clip, run for real ──
const C = "11111111-1111-1111-1111-111111111111", OTHER = "22222222-2222-2222-2222-222222222222";
let rec, stored, calls;
globalThis.fetch = async (u, init = {}) => {
  const url = String(u), m = (init.method || "GET").toUpperCase(); calls.push(`${m} ${url}`);
  const j = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b, text: async () => (b == null ? "" : JSON.stringify(b)) });
  if (url.includes("/storage/v1/object/info/client-videos/")) return stored.has(decodeURIComponent(url.split("/client-videos/")[1])) ? j({ size: 1 }) : j({ error: "not found" }, 400);
  if (url.includes("notify-rga")) return j({ ok: true, delivered: true });
  if (url.includes("/client_onboarding_records")) { if (m === "PATCH") { rec = { ...rec, data: JSON.parse(init.body).data }; return j(null, 204); } return j([rec]); }
  return j({}, 404);
};
function load() {
  for (const k of Object.keys(req.cache)) if (k.startsWith(FNS_REAL)) delete req.cache[k];
  const ap = req.resolve("./_auth.js");
  req.cache[ap] = { id: ap, filename: ap, loaded: true, exports: { jsonRes: (s, b) => ({ statusCode: s, body: JSON.stringify(b) }), requirePortalOwner: async () => ({ email: "owner@acme.test" }) } };
  return req("./portal-video-clip.js").handler;
}
const post = async (body) => { calls = []; const r = await load()({ httpMethod: "POST", headers: {}, body: JSON.stringify({ client_id: C, ...body }) }); return { s: r.statusCode, b: JSON.parse(r.body || "{}") }; };
const clips = () => (rec.data.tasks["m1.brand.youtube_setup"]?.clips || []);
rec = { id: "r1", data: { keep: 1, tasks: { "m1.brand.youtube_setup": { status: "in_progress", outcome_data: { videos: PLAN.videos } }, "m1.other": { status: "done" } } } }; stored = new Set();
{ const r = await post({ kind: "upload", path: `${C}/a.mp4`, name: "a.mp4", size: 1000 });
  if (r.s === 200 || clips().length) fail("an upload the server can't see in storage is recorded as received"); }
stored.add(`${C}/a.mp4`); stored.add(`${OTHER}/x.mp4`);
{ const r = await post({ kind: "upload", path: `${OTHER}/x.mp4`, name: "x.mp4", size: 1000 });
  if (r.s === 200 || clips().length) fail("a clip in ANOTHER client's folder is accepted"); }
{ const r = await post({ kind: "upload", path: `${C}/a.mp4`, name: "a.mp4", size: 60 * 1024 * 1024 });
  if (r.s === 200) fail("a clip over 50 MB is accepted"); }
{ const r = await post({ kind: "upload", path: `${C}/a.mp4`, name: "a.mp4", size: 1000 });
  if (r.s !== 200 || clips().length !== 1 || clips()[0].kind !== "upload") fail(`a real upload isn't recorded (${r.s} ${r.b.error || ""})`);
  if (calls.some((c) => c.includes("notify-rga"))) fail("RGA is told 'both clips' after one"); }
{ const r = await post({ kind: "link", url: "not a link" }); if (r.s === 200) fail("a non-link is accepted as a share link"); }
{ const r = await post({ kind: "link", url: "https://drive.google.com/file/d/abc" });
  if (r.s !== 200 || clips().length !== 2) fail("a share link isn't recorded as the second clip");
  if (!calls.some((c) => c.includes("notify-rga"))) fail("RGA isn't told when both clips are in"); }
if (rec.data.keep !== 1 || rec.data.tasks["m1.other"]?.status !== "done" || !rec.data.tasks["m1.brand.youtube_setup"].outcome_data?.videos) fail("recording a clip overwrote the rest of the record");
{ const id = clips()[0].id; const r = await post({ kind: "remove", id }); if (r.s !== 200 || clips().some((c) => c.id === id)) fail("a clip can't be removed"); }
// ── surfaces ──
const src = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");
const pb = JSON.parse(src("data/playbooks/playbooks.json")), cs = JSON.parse(src("data/playbooks/client-steps.json"));
const step = (pb.month1 || []).find((x) => x.id === "m1.brand.youtube_setup");
if (!step || step.clientForm !== "video_upload" || step.clientBucket !== "act" || step.clientDone !== "rga" || !step.clientLabel) fail("step 55 no longer asks the client for their clips (playbook)");
if (!(cs.month1 || []).some((x) => x.id === "m1.brand.youtube_setup" && x.clientForm === "video_upload")) fail("client-steps.json wasn't rebuilt — the portal doesn't know the client step");
// 🔑 client numbers run across Month 1 AND Monthly, 1..N with the Setup list reading 1..14 in order (check-setup-steps-read-in-order),
// so the new Month 1 step is 14 and Monthly moved to 15–19 (10-19; only test clients had seen Monthly numbers)
const nums = [...(pb.month1 || []), ...(pb.month2plus || [])].map((x) => x.clientStepNo).filter((n) => n != null);
if (new Set(nums).size !== nums.length) fail("two client steps share a number (Month 1 + Monthly are one sequence)");
if (step && step.clientStepNo !== 15) fail(`step 55's client number moved (${step && step.clientStepNo}) — the Setup list must read 1..15 in order`);
const portal = src("portal/portal.js"), admin = src("admin/admin.js"), fe = src("netlify/functions/flow-execute.js");
if (!/step\.clientForm === "video_upload" \? \(ownWait \|\| isDone \? "" : videoClipsHtml\(step, taskState, clientId\)\)/.test(portal)) fail("the portal step doesn't render the scripts + clips");
if (!/file\.size > VC_MAX/.test(portal) || !/storage\/v1\/object\/client-videos\//.test(portal)) fail("the portal doesn't check the size before uploading to client-videos");
// steps_57_64_v1 (the owner 11-9): Done = their channel confirmed + the details pasted; the clips are optional and never hold or reopen the step
if (!/"m1\.brand\.youtube_setup": \{\s*proof: \(d\) => !!d\?\.tasks\?\.\["m1\.brand\.youtube_setup"\]\?\.channel_pasted,/.test(admin)) fail("step 58's Done isn't guarded by the pasted channel details");
if (!((admin.match(/\$\{rowLiveCardsHtml\(o, s\)\}/g) || []).length >= 2 && /id === "m1\.brand\.youtube_setup" \? uniChannelCardHtml\(t\)/.test(admin) && /Clips · optional/.test(admin))) fail("row 58 doesn't list the client's clips");   // steps_57_64_v1: the clips are the second card
if (!/"m1\.brand\.youtube_setup": async[\s\S]{0,1800}?parseYoutube\(raw\)[\s\S]{0,500}?outcome_data: \{ draft, channel: plan\.channel, videos: plan\.videos/.test(fe)) fail("the runner no longer stores the scripts as data");
const sql = src("docs/supabase/RGA_CLIENT_VIDEOS_BUCKET_2026-10-19.sql");
if (!/'client-videos', 'client-videos', false, 52428800/.test(sql) || !/current_user_portal_access/.test(sql)) fail("the bucket SQL isn't private / 50 MB / scoped to the client's folder");
if (F.length) { console.error("🔴 the YouTube clips step can be faked or skipped:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ YouTube clips: 2 validated scripts → client uploads (own folder, verified, ≤ 50 MB) or links → RGA told at 2 → row 55 lists them → Done needs both");
