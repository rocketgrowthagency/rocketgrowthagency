#!/usr/bin/env node
// check-a-client-can-choose-later.mjs — "Not ready to take photos yet? Remind me later": the client puts step 7 off for 1
// or 2 weeks (saved, read back, owner only, only step 7); while it's later the step isn't their NEXT step and its pill
// says when it comes back; an upload ends it; one reminder email on the date (stamped first, held outside sending
// hours, cleared instead if a photo came in); admin sees it.
//
// 🔒 WHY (approved step7_later_and_upload_v1 v2, 2026-10-15). Chris: "i dont have images yet to load so is there an option
// to skip?" Nothing is skipped — the step stays on the list. The endpoint runs for real against a faked database (the real
// _step-record read → write → read back); the portal's own laterOf / photoSlotsHtml are lifted; the sweep's helpers run.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/x.js`);

// ── 1 · the endpoint, against a faked database ──
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
let owner = true;
req.cache[req.resolve("./_auth")] = { id: "auth", filename: req.resolve("./_auth"), loaded: true, exports: {
  requirePortalOwner: async () => (owner ? {} : { error: { statusCode: 403, body: JSON.stringify({ error: "Not yours" }) } }) } };
let store = null, dropLater = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = init.method || "GET";
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? "" : JSON.stringify(body)), json: async () => body });
  if (/client_onboarding_records\?client_id=eq\./.test(u)) return res(200, [{ id: "r1", data: store }]);
  if (/client_onboarding_records\?id=eq\.r1$/.test(u) && m === "PATCH") { const d = JSON.parse(init.body).data; if (dropLater && d.tasks["m1.gbp.photos"]) delete d.tasks["m1.gbp.photos"].later; store = d; return res(204, null); }
  if (/client_onboarding_records\?id=eq\.r1&select=data/.test(u)) return res(200, [{ data: store }]);
  return res(404, { error: "no route " + u });
};
let H;
try { H = req("./portal-step-later.js").handler; } catch (e) { console.error(`⚠️  INDETERMINATE — portal-step-later did not load: ${e.message}`); process.exit(2); }
const CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const call = async (body) => { const r = await H({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, step_id: "m1.gbp.photos", ...body }) }); return { status: r.statusCode, body: JSON.parse(r.body) }; };
{
  store = { tasks: { "m1.gbp.photos": { status: "pending" } } };
  const t0 = Date.now();
  const r = await call({ action: "set", days: 7 });
  const l = store.tasks["m1.gbp.photos"].later;
  if (r.status !== 200 || !l || l.days !== 7 || l.set_by !== "client" || Math.abs(Date.parse(l.until) - (t0 + 7 * 86400000)) > 60000) fail(`"In 1 week" doesn't save a reminder 7 days out, read back (${r.status} ${JSON.stringify(l)})`);
  const r14 = await call({ action: "set", days: 14 });
  if (r14.status !== 200 || store.tasks["m1.gbp.photos"].later.days !== 14) fail("\"In 2 weeks\" doesn't change it to 14 days");
  if ((await call({ action: "set", days: 3 })).status !== 400) fail("any number of days is accepted (only 1 or 2 weeks)");
  if ((await call({ action: "set", days: 7, step_id: "m1.gbp.hours_attributes" })).status !== 400) fail("a step other than the photo step can be put off");
  const c = await call({ action: "clear" });
  if (c.status !== 200 || store.tasks["m1.gbp.photos"].later || !store.tasks["m1.gbp.photos"].later_cleared_at) fail("\"I'm ready now\" doesn't clear it (and say when)");
  store.tasks["m1.gbp.photos"].status = "done";
  if ((await call({ action: "set", days: 7 })).status !== 409) fail("a finished step can be put off");
  store.tasks["m1.gbp.photos"].status = "pending"; dropLater = true;
  if ((await call({ action: "set", days: 7 })).status !== 500) fail("a save that didn't stick reports success (no read-back)");
  dropLater = false; owner = false;
  if ((await call({ action: "set", days: 7 })).status !== 403) fail("someone other than the client can put their step off");
  owner = true;
}

// ── 2 · the reminder: once, on the date, never for a finished step ──
const N = req("./notify-step-open.js");
const day = 86400000, now = Date.now();
const T = (later, extra = {}) => ({ "m1.gbp.photos": { status: "pending", later, ...extra } });
if (!N.laterDue(T({ until: new Date(now - 1000).toISOString(), set_at: new Date(now - 7 * day).toISOString() }))) fail("the reminder isn't due on its date");
if (N.laterDue(T({ until: new Date(now + day).toISOString() }))) fail("the reminder goes before its date");
if (N.laterDue(T({ until: new Date(now - 1000).toISOString(), reminded_at: new Date().toISOString() }))) fail("the reminder can go twice");
if (N.laterDue(T({ until: new Date(now - 1000).toISOString() }, { status: "done" }))) fail("a finished step gets a reminder");
const mail = N.buildLaterEmail({ primary_contact_name: "Chris K" });
if (mail.subject !== "Your photo step is waiting" || !/Hi Chris, you asked us to remind you about your business photos today\./.test(mail.markup) || !/#step-m1\.gbp\.photos\)/.test(mail.markup)) fail("the reminder email doesn't say what it is and link to the step");
const sweep = read("netlify/functions/notify-step-open.js").replace(/^[ \t]*\/\/.*$/gm, "");
if (!/const since = await supa\(`\/client_photos\?client_id=eq\.\$\{client\.id\}&created_at=gt\./.test(sweep) || !/if \(since\.length\) \{\s*tasks\[PHOTO\.id\] = \{ \.\.\.tasks\[PHOTO\.id\], later_cleared_at: new Date\(\)\.toISOString\(\) \}; delete tasks\[PHOTO\.id\]\.later;/.test(sweep)) fail("a photo that came in after \"later\" doesn't cancel the reminder");
if (!/later: \{ \.\.\.l, reminded_at: new Date\(\)\.toISOString\(\) \} \};\s*await writeTasks\(rec\.id, data, tasks\);[^\n]*\n\s*try \{ out\.sent\.push\(\{ client: client\.id, steps: \[PHOTO\.id\], reason: "later_reminder", \.\.\.\(await sendLaterReminder\(client\)\)/.test(sweep)) fail("the reminder isn't stamped before it's sent (two runs could both send)");
if (!/else if \(!inSendingHours\(client\)\) out\.held\.push\(\{ client: client\.id, due: \[PHOTO\.id\], why: "later reminder/.test(sweep)) fail("the reminder can go outside the client's sending hours");

// ── 3 · the portal: the state, the pill, the next step, the controls ──
const portal = read("portal/portal.js");
const cut = (start, endMark) => { const i = portal.indexOf(start); if (i < 0) return null; const j = portal.indexOf(endMark, i); return j < 0 ? null : portal.slice(i, j); };
const slotsSrc = cut("const SLOT_CATEGORY = {", "\n/** Fill the slot thumbnails"), stateSrc = cut("const PHOTO_STATE = {", "\n\n"), bigSrc = cut("const photoExampleBigHtml = (ex, key = \"\") =>", "\n\n");
const howSrc = cut("function photoReviewTail(step, photos) {", "\n// ============== PHOTO UPLOAD");
if (!slotsSrc || !stateSrc || !bigSrc || !howSrc) { console.error("⚠️  INDETERMINATE — could not lift the renderer"); process.exit(2); }
process.removeAllListeners("warning");
const EX = await import(pathToFileURL(`${SITE}/shared/photo-examples.js`).href);
const AK = await import(pathToFileURL(`${SITE}/shared/photo-art.js`).href);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = { escapeHtml: esc, escapeAttribute: esc, photoExampleOf: EX.photoExampleOf, photoExampleArt: EX.photoExampleArt, PHOTO_EXAMPLE_SPRITE: "", artKey: AK.artKey, console, Date };
vm.createContext(ctx);
try { vm.runInContext(`${stateSrc}\n${bigSrc}\n${slotsSrc}\n${howSrc}\nthis.how = clientHowHtml; this.laterOf = laterOf;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }
const P = req("./_photo-lists.js");
const steps = JSON.parse(read("data/playbooks/client-steps.json"));
const find = (o) => { if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return null; } if (o && typeof o === "object") { if (o.id === "m1.gbp.photos") return o; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } } return null; };
const step = { ...find(steps), clientForm: "photo_upload" };
const shape = P.buildShotList({ typeOverride: "Marketing agencies", storefront: false, teamSize: "1" });
const set = new Date(now - day).toISOString(), until = new Date(now + 6 * day).toISOString();
const later = { until, set_at: set, days: 7 };
if (!ctx.laterOf(step, { later }, [])) fail("a chosen \"later\" isn't active");
if (ctx.laterOf(step, { later }, [{ created_at: new Date(now - 1000).toISOString() }])) fail("an upload after choosing \"later\" doesn't end it");
if (ctx.laterOf(step, { later: { ...later, until: new Date(now - 1000).toISOString() } }, [])) fail("\"later\" outlives its date");
if (ctx.laterOf({ id: "m1.gbp.hours_attributes" }, { later }, [])) fail("\"later\" applies to a step that can't be put off");
const task = { draft_shape: shape, team_size: "1", detected: { n: 2, threshold: 20, source: "google_profile" } };
const on = ctx.how(step, { ...task, later }, true, [], "c1", null);
// 🔄 approved step7_later_state_v1 v2: a calm band with two real buttons; the rest of the step folds behind one line
if (!/<div class="pm-later-band">[\s\S]*?Set for later · we'll email you a reminder on [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}<\/b>/.test(on) || !/class="pm-act is-guide" data-later-change>Change date</.test(on) || !/class="pm-act is-guide" data-later-clear>I(?:'|&#39;)m ready now</.test(on) || /Not ready to take photos yet/.test(on)) fail("a step that's \"later\" doesn't show the band (when, Change date, I'm ready now)");
const fold = /<details class="pm-later-list" data-fold="later-list"><summary>Show your photo list <span class="m">2 of 20 on Google · 18 to go<\/span>/.exec(on);
if (!fold || on.indexOf('class="pm-p2"') < fold.index || on.indexOf('class="pm-slots') < fold.index) fail("while it's \"later\" the progress, toolbar and list aren't folded behind \"Show your photo list\"");
if (/pm-later-list/.test(ctx.how(step, task, true, [], "c1", null))) fail("the photo list is folded away when nothing is \"later\"");
const off = ctx.how(step, task, true, [], "c1", null);
if (!/Not ready to take photos yet\? <b>Remind me later<\/b>/.test(off) || !/data-later-days="7">In 1 week</.test(off) || !/data-later-days="14">In 2 weeks</.test(off)) fail("the step doesn't offer \"Remind me later\" with 1 or 2 weeks");
const pc = portal.replace(/^[ \t]*\/\/.*$/gm, "");
if (!/: later \? \{ text: `Later · \$\{laterDay\(later\.until\)\}`, cls: "wait" \}\s*: theirsToAct \? \{ text: "Your turn"/.test(pc)) fail("a step that's \"later\" doesn't say so in its pill (or says Your turn)");
if (!/nowStepId = \(numbered\.find\(\(r\) => isOpenRow\(r\) && theirs\(r\) && !r\.later\)/.test(pc)) fail("a step that's \"later\" can still be the client's now step");
if (!/&& !i\.later\n\s*&& !\(i\.step\?\.clientForm === "kickoff_booking" && !kickoffOwed\)\);/.test(pc) || !/parts\.push\(`\$\{LATER_STEPS\[i\.step\.id\] \|\| "a step"\} later \(\$\{laterDay\(i\.later\.until\)\}\)`\)/.test(pc)) fail("the next-step banner doesn't move on, or doesn't say the photos come back later");
if (!/later: status !== "done" && status !== "skipped" \? laterOf\(s, ts, photos\) : null/.test(pc)) fail("the step list doesn't know which step is \"later\"");
if (!/b\.classList\.add\("is-busy"\); b\.setAttribute\("aria-busy", "true"\);/.test(pc) || !/finally \{ delete host\.dataset\.busy; b\.classList\.remove\("is-busy"\);/.test(pc)) fail("a click on a later choice shows nothing while it saves (the pressed button must spin)");
if (!/if \(days\) _openStep\.delete\(cid\); else _openStep\.set\(cid, host\.getAttribute\("data-later-step"\)\);/.test(pc)) fail("choosing later doesn't fold the step (or I'm ready now doesn't keep it open)");
if (!/\$\{later \? `<span class="pm-step-sub">Reminder by email on \$\{escapeHtml\(laterDay\(later\.until\)\)\} · your other steps carry on<\/span>/.test(pc)) fail("the folded row doesn't say when the reminder comes");
if (!/querySelector\("\[data-later-step\] \.pm-later-band"\)/.test(pc)) fail("an upload can't tell the step is \"later\" (so it never ends it)");
if (!/action: days \? "set" : "clear"/.test(pc) || !/await settleStepResult\(host\.closest\("\[id\^='action-items-list-'\]"\), j\);/.test(pc)) fail("the later controls don't save and redraw");
if (!/if \(lat\) fetch\("\/\.netlify\/functions\/portal-step-later", \{ method: "POST"[\s\S]{0,400}?action: "clear" \}\) \}\)/.test(pc)) fail("an upload doesn't end \"later\" in the record");
// the spinner keeps the button's size and shows at once (a colour fade on .pm-act hid it, 10-15)
const pcss = read("portal/portal.css");
if (!/\.pm-team-chip\.is-busy, \.pm-act\.is-busy \{ position:relative; color:transparent !important; transition:none; cursor:progress; \}/.test(pcss) || /\.pm-act\.is-busy \{[^}]*padding/.test(pcss)) fail("the pressed button's spinner resizes it, or fades in too late to be seen");
// ── 4 · admin sees it ──
const admin = read("admin/admin.js");
if (!/Client chose later · reminder \$\{escapeHtml\(new Date\(until\)/.test(admin) || !/\+ laterLine\(task\);/.test(admin)) fail("admin doesn't see that the client chose later, and until when");

if (F.length) { console.error("🔴 \"Remind me later\" doesn't work the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ a client can choose later: 1 or 2 weeks on the photo step only, owner only, read back, cleared by \"I'm ready now\" or an upload; while later the pill and the folded row say when, the opened step is the band with the list folded, it's never the now step and the banner moves on; the pressed button spins; one reminder on the date (stamped first, in sending hours, cancelled by a photo); admin sees it");
