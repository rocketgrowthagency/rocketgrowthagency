#!/usr/bin/env node
// check-step58-reads-youtube.mjs — ADMIN STEP 58 READS THE CHANNEL BACK FROM YOUTUBE (approved step58_youtube_readback_v1, the owner 11-9).
// Runs the SHIPPED _youtube-read.js, admin-step-press.js, _morning-run.js and shared/steps-57-64.js against FAKES (a fake database, a fake YouTube). No network, no key.
//   matches / differs / no key (Pasted stays) / handle not found / API error + quota / key set (Pasted gone and refused) / Check now read-back / morning run is a free read
//   Copy puts EXACTLY what goes in YouTube Studio (no labels; ends "Call <phone>"), and the website alone beside it
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE: cannot read ${r}`); process.exit(2); } };
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", INTERNAL_FN_SECRET: "x" });
delete process.env.YOUTUBE_API_KEY;
globalThis.fetch = async () => { throw new Error("the gate must not touch the network"); };
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let Y, PRESS, M, S, PB;
try { Y = req("./_youtube-read.js"); PRESS = req("./admin-step-press.js"); M = req("./_morning-run.js"); S = req(path.join(SITE, "shared/steps-57-64.js")); PB = JSON.parse(read("data/playbooks/playbooks.json")).month1; }
catch (e) { console.error(`⚠️  INDETERMINATE: a module did not load: ${e.message}`); process.exit(2); }

const NOW = Date.parse("2026-11-10T14:20:00Z"), ID = S.ID, CID = "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", KEY = "SECRET-KEY-VALUE-123";
const PACK = { description_full: "Rocket Growth Agency helps local service businesses\nget found on Google Maps.", phone: "(424) 242-2040", website: "https://www.rocketgrowthagency.com/", read_from: "google" };
const social = { client_input: { profiles: [{ key: "youtube", url: "https://www.youtube.com/@rocketgrowthagency", handle: "@rocketgrowthagency" }] } };
const store = (yt, extra = {}) => {
  const st = { rec: { id: "rec1", data: { tasks: JSON.parse(JSON.stringify({ [ID.SOCIAL]: social, [ID.YT]: yt, ...extra })) } }, writes: 0, records: [] };
  st.supa = async (q, init = {}) => {
    const m = (init.method || "GET").toUpperCase(), c = (x) => JSON.parse(JSON.stringify(x));
    if (q.startsWith("/client_onboarding_records") && m === "GET") return [c(st.rec)];
    if (q.startsWith("/client_onboarding_records") && m === "PATCH") { st.writes++; st.rec.data = JSON.parse(init.body).data; return [c(st.rec)]; }
    if (q.startsWith("/clients")) return [{ id: CID, business_name: "Rocket Growth Agency" }];
    return [{ id: "x" }];
  };
  return st;
};
const yt = (status, body) => async (u) => { yt.urls.push(u); return { ok: status >= 200 && status < 300, status, json: async () => body }; };
yt.urls = [];
const item = (description) => ({ items: [{ snippet: { description } }] });
const deps = (st, over = {}) => ({ supa: st.supa, now: () => NOW, pack: async () => PACK, record: async (o) => { st.records.push(o); return {}; }, gate: { email: "chris@rga" }, key: KEY, ...over });
const press = async (st, over, body) => { PRESS.__useDeps(deps(st, over)); const r = JSON.parse((await PRESS.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, step_id: ID.YT, ...body }) })).body); PRESS.__useDeps(null); return r; };
const task = (st) => st.rec.data.tasks[ID.YT];

try {
  // the pure rules
  if (!Y.matches("a  b\nc", "x a b c y")) fail("matches: spacing and line breaks aren't ignored, or a channel that says more doesn't match");
  if (Y.matches("a b d", "a b c")) fail("matches: a different description matches");
  if (Y.matches("", "anything") || Y.matches("a", "")) fail("matches: an empty side matches");
  if (Y.queryFor("@rocketgrowthagency") !== "forHandle=%40rocketgrowthagency" || Y.queryFor("rocketgrowthagency")) fail("queryFor: a handle isn't looked up by forHandle, or a non-handle is guessed");

  // 1 · MATCHES: the row is done by itself, and so is the step; a channel that says more still matches
  {
    const st = store({ status: "pending" });
    const j = await press(st, { fetchFn: yt(200, item("Welcome!  Rocket Growth Agency helps local service businesses get found on Google Maps. Call us.")) }, { action: "youtube_check" });
    const t = task(st);
    if (!j.ok || j.read.state !== "matches" || t.yt_read.state !== "matches" || t.status !== "done" || t.done_by !== "youtube read" || !t.completed_at) fail(`matches: the step isn't done by itself (${JSON.stringify(j).slice(0, 200)})`);
    if (!/forHandle=%40rocketgrowthagency/.test(yt.urls[0] || "") || !/part=snippet,brandingSettings/.test(yt.urls[0])) fail("matches: the request isn't channels.list forHandle with snippet,brandingSettings");
    if (JSON.stringify(t).includes("Welcome") || t.yt_read.yt_desc) fail("matches: the channel's whole description is stored when it isn't needed");
    if (!st.records.some((r) => r.kind === "youtube_channel" && r.answer.action === "youtube_check")) fail("matches: Check now isn't recorded");
    if (JSON.stringify(st.records).includes(KEY) || JSON.stringify(st.rec).includes(KEY) || JSON.stringify(j).includes(KEY)) fail("matches: the key reached the record, the log or the answer");
    const v = S.channelView(t, st.rec.data.tasks, {});
    if (v.label !== "Done" || !/matches their Google profile/.test(JSON.stringify(v.rows)) || /paste:true|"fix":true|"check":true/.test(JSON.stringify(v.rows))) fail("matches: the card isn't Done with no buttons on the details row");
    if (!/Links: website and phone/.test(JSON.stringify(v.rows)) || !/not checked/.test(JSON.stringify(v.rows))) fail("matches: the links row doesn't say they're pasted and not checked");
  }
  // 2 · DIFFERS: RGA's move, with what YouTube has; never done
  {
    const st = store({ status: "pending" });
    const j = await press(st, { fetchFn: yt(200, item("Something else entirely")) }, { action: "youtube_check" });
    const t = task(st), v = S.channelView(t, st.rec.data.tasks, {});
    if (!j.ok || t.yt_read.state !== "differs" || t.status === "done" || t.yt_read.yt_desc !== "Something else entirely") fail("differs: not RGA's move, or what YouTube has isn't kept");
    const row = v.rows.find((r) => r.fix);
    if (!row || !row.check || row.paste || v.ytDesc !== "Something else entirely" || v.label === "Done") fail("differs: the row lacks Open YouTube Studio / Copy / Check now, shows Pasted, or doesn't carry what YouTube has");
    // an empty channel description differs, it is not "missing"
    const s2 = store({ status: "pending" }); await press(s2, { fetchFn: yt(200, item("")) }, { action: "youtube_check" });
    if (task(s2).yt_read.state !== "differs") fail("differs: a channel with no description isn't 'differs'");
    // a step this read finished reopens when YouTube later differs; a hand-pasted one doesn't
    const s3 = store({ status: "done", done_by: "youtube read", completed_at: "2026-11-09T10:00:00Z", yt_read: { state: "matches" } }); await press(s3, { fetchFn: yt(200, item("changed")) }, { action: "youtube_check" });
    if (task(s3).status === "done") fail("differs: a step the read finished stays done after YouTube changed");
    const s4 = store({ status: "done", done_by: "rga", channel_pasted: { by: "x", at: "y" } }); await press(s4, { fetchFn: yt(200, item("changed")) }, { action: "youtube_check" });
    if (task(s4).status !== "done") fail("differs: a hand-pasted step reopens");
  }
  // 3 · CAN'T READ: never matches, never missing, stored with why; the step is not moved
  for (const [name, over, re] of [
    ["handle not found", { fetchFn: yt(200, { items: [] }) }, /couldn't be found/],
    ["API error", { fetchFn: yt(500, { error: {} }) }, /YouTube answered 500/],
    ["quota", { fetchFn: yt(403, { error: { errors: [{ reason: "quotaExceeded" }] } }) }, /daily limit/],
    ["bad key", { fetchFn: yt(400, { error: { errors: [{ reason: "keyInvalid" }] } }) }, /refused the key/],
    ["no answer", { fetchFn: async () => { throw new Error(`boom ${KEY}`); } }, /didn't answer/],
  ]) {
    const st = store({ status: "pending" });
    const j = await press(st, over, { action: "youtube_check" });
    const t = task(st), v = S.channelView(t, st.rec.data.tasks, {}), rows = JSON.stringify(v.rows);
    if (!j.ok || t.yt_read.state !== "cant" || !re.test(t.yt_read.why) || t.status === "done") fail(`can't read (${name}): not stored as can't tell with its reason (${JSON.stringify(t.yt_read)})`);
    if (!/Couldn't read YouTube: /.test(rows) || !/tries again tomorrow/.test(rows) || /matches their Google|"paste":true/.test(rows)) fail(`can't read (${name}): the card doesn't say Couldn't read YouTube with a retry, or offers Pasted/matches`);
    if (JSON.stringify(st.rec).includes(KEY) || JSON.stringify(st.records).includes(KEY)) fail(`can't read (${name}): the key was stored`);
  }
  // 4 · NO KEY YET: Pasted stays the only way to finish; with a key, Pasted is refused
  {
    const st = store({ status: "pending", channel_details: { pack: PACK } });
    const j = await press(st, { key: "", fetchFn: yt(200, item("x")) }, { action: "youtube_check" });
    const t = task(st), v = S.channelView(t, st.rec.data.tasks, {});
    if (!j.ok || t.yt_read.state !== "cant" || !t.yt_read.no_key || !/no key yet/.test(t.yt_read.why) || yt.urls.length > 6 && false) fail("no key: not stored as 'no key yet'");
    const before = yt.urls.length; await press(st, { key: "", fetchFn: yt(200, item("x")) }, { action: "youtube_check" });
    const row = v.rows.find((r) => r.paste);
    if (!row || !row.fix || !/Couldn't read YouTube: no key yet/.test(JSON.stringify(v.rows))) fail("no key: Pasted isn't the way to finish, or the card doesn't say 'Couldn't read YouTube: no key yet'");
    const p = await press(st, { key: "" }, { action: "youtube_pasted" });
    if (!p.ok || task(st).status !== "done" || !task(st).channel_pasted) fail("no key: Pasted doesn't finish the step");
    // key set → Pasted refused (server) and absent (card)
    const s2 = store({ status: "pending", channel_details: { pack: PACK } });
    const p2 = await press(s2, { key: KEY }, { action: "youtube_pasted" });
    if (p2.ok || task(s2).channel_pasted) fail("key set: the server still accepts Pasted");
    await press(s2, { fetchFn: yt(200, item("else")) }, { action: "youtube_check" });
    if (S.channelView(task(s2), s2.rec.data.tasks, {}).rows.some((r) => r.paste)) fail("key set: the card still offers Pasted");
    // the env var is the one place the key is read
    process.env.YOUTUBE_API_KEY = KEY; const s3 = store({ status: "pending" }); PRESS.__useDeps({ supa: s3.supa, now: () => NOW, gate: { email: "c" }, pack: async () => PACK, record: async () => ({}), fetchFn: yt(200, item(PACK.description_full)) });
    const j3 = JSON.parse((await PRESS.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, step_id: ID.YT, action: "youtube_check" }) })).body); PRESS.__useDeps(null);
    if (!j3.ok || task(s3).yt_read.state !== "matches") fail("key from YOUTUBE_API_KEY isn't used");
    const j4 = JSON.parse((await PRESS.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: CID, step_id: ID.YT, action: "youtube_pasted" }) })).body); delete process.env.YOUTUBE_API_KEY;
    void j4; void before;
  }
  // 5 · CHECK NOW is read-before-write, written, read back; a skipped step stays skipped; an unconfirmed channel isn't read
  {
    const st = store({ status: "pending" }); let reads = 0; const sup = st.supa; st.supa = async (q, i = {}) => { if (q.startsWith("/client_onboarding_records") && (i.method || "GET") === "GET") reads++; return sup(q, i); };
    await press(st, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_check" });
    if (reads < 2) fail("Check now: the record isn't read again right before the write");
    const bad = store({ status: "pending" }); const sup2 = bad.supa; bad.supa = async (q, i = {}) => { const r = await sup2(q, i); if ((i.method || "") === "PATCH") { bad.rec.data.tasks[ID.YT] = { status: "pending" }; return [{ data: { tasks: { [ID.YT]: { status: "pending" } } } }]; } return r; };
    const jb = await press(bad, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_check" });
    if (jb.ok) fail("Check now: a write that did not land is reported as saved");
    const sk = store({ status: "skipped", skip_reason: "r" }); await press(sk, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_check" });
    if (task(sk).status !== "skipped") fail("Check now: a skipped step is moved");
    const un = store({ status: "pending" }, { [ID.SOCIAL]: {} }); const ju = await press(un, { fetchFn: yt(200, item("x")) }, { action: "youtube_check" });
    if (ju.ok) fail("Check now: reads a channel the client hasn't confirmed");
    const clipped = store({ status: "pending", clips: [{ id: "c1", kind: "link", url: "https://x.example/a" }] }); await press(clipped, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_check" });
    if (task(clipped).status !== "done") fail("clips hold the step");
  }
  // 6 · THE MORNING RUN: a free read, never the runner, never a model; only while 58 isn't done and the channel is confirmed
  {
    const done = (ids) => Object.fromEntries(ids.map((i) => [i, { status: "done" }]));
    const step = PB.find((s) => s.id === ID.YT), deps0 = done(step.dependsOn || []);
    const plan = (tasks) => M.planClient({ tasks, playbook: PB, now: NOW }).map((p) => p.id);
    const open = { ...deps0, [ID.SOCIAL]: social, [ID.YT]: { status: "pending", outcome_data: { draft: "x" }, ran_at: "2026-11-01T10:00:00Z" } };
    if (!plan(open).includes(ID.YT)) fail("morning: 58 isn't read while it isn't done (even after its script runner ran)");
    if (plan({ ...open, [ID.YT]: { ...open[ID.YT], status: "done" } }).includes(ID.YT)) fail("morning: a done 58 is read again");
    if (plan({ ...open, [ID.YT]: { status: "skipped" } }).includes(ID.YT)) fail("morning: a skipped 58 is read");
    if (plan({ ...deps0, [ID.YT]: { status: "pending" } }).includes(ID.YT)) fail("morning: 58 is read with no confirmed channel");
    if (plan({ ...open, [ID.YT]: { ...open[ID.YT], morning_run: { at: new Date(NOW - 3600e3).toISOString() } } }).includes(ID.YT)) fail("morning: 58 is read twice in a day");
    if (!M.READS.includes(ID.YT)) fail("morning: 58 isn't marked a read");
    const src = read("netlify/functions/_morning-run.js").replace(/\/\/[^\n]*/g, "");
    if (!/READS\.includes\(p\.id\)\) await d\.readYoutube\(c\.id\); else await d\.start/.test(src)) fail("morning: 58 can reach the runner (d.start)");
    const called = []; const st = store({ status: "pending" });
    const sup = st.supa;
    const d = { supa: async (q, i = {}) => { if (q.startsWith("/clients?status")) return [{ id: CID, business_name: "R", source: "manual" }]; return sup(q, i); }, now: () => NOW, env: {}, playbook: () => PB, searchesLeft: async () => 100,
      start: async (c, s) => { called.push(["start", s]); }, readYoutube: async (c) => { called.push(["read", c]); }, record: async () => ({}) };
    for (const id of step.dependsOn || []) st.rec.data.tasks[id] = { status: "done" };
    const out = await M.runMorning({ deps: d });
    if (!called.some((c) => c[0] === "read") || called.some((c) => c[0] === "start" && c[1] === ID.YT)) fail(`morning: 58 wasn't read (or went through the runner): ${JSON.stringify(called)}`);
    if (task(st).status === "done") fail("morning: the run marked 58 done itself");
    void out;
    const ytsrc = read("netlify/functions/_youtube-read.js").replace(/\/\/[^\n]*/g, "");
    if (/console\./.test(ytsrc) || /anthropic|openai|aiDraft/i.test(ytsrc)) fail("youtube read: logs, or calls a model");
    if (/process\.env(?!\[KEY_ENV\])/.test(ytsrc) || !/KEY_ENV = "YOUTUBE_API_KEY"/.test(ytsrc)) fail("youtube read: the key is read from somewhere other than process.env.YOUTUBE_API_KEY");
  }
  // 7 · COPY: exactly what goes in YouTube Studio
  {
    const c = S.ytCopy(PACK);
    if (/Description|Links:/.test(c.description) || c.description !== `${PACK.description_full}\n\nCall (424) 242-2040` || !c.description.endsWith("Call (424) 242-2040")) fail(`copy: the Description box text isn't the description, a blank line, then Call <phone> (${JSON.stringify(c.description)})`);
    if (c.website !== "https://www.rocketgrowthagency.com/") fail("copy: the website copy isn't the URL alone");
    if (S.ytCopy({ description_full: "Only text" }).description !== "Only text") fail("copy: no phone still adds a Call line");
    if (!Y.matches(PACK.description_full, c.description)) fail("copy: the Call line breaks the read-back match");
    const A = read("admin/admin.js");
    if (/Description\\n\$\{det/.test(A) || !/cbCopyBtn\(UNI_YT, "website", cp\.website, "Copy website"\)/.test(A) || !/In Links: \+ Add link, title Website/.test(A) || !/text = cp\.description/.test(A)) fail("copy: the admin Copy button isn't the Studio-ready text, or the Website copy and its hint are missing");
    if (!/data-uni-yt="youtube_check"/.test(A) || !/mgBusy\(b, true\)/.test(A)) fail("Check now: no button that spins");
  }
  // 8 · UNIVERSAL: any channel link format, and missing data, each say what they need (never a silent "can't read", never "matches")
  {
    const L = (url, handle, ov) => Y.lookupFor({ url, handle }, ov);
    if (L("https://www.youtube.com/user/oldname", "oldname").q !== "forUsername=oldname") fail("universal: a legacy /user/<name> link isn't looked up by forUsername");
    if (L("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "UCabcdefghijklmnopqrstuv").q !== "id=UCabcdefghijklmnopqrstuv") fail("universal: a /channel/UC id isn't looked up by id");
    if (!L("https://www.youtube.com/c/SomeName", "SomeName").need || !L("https://www.youtube.com/SomeName", "SomeName").need) fail("universal: a /c/ link with no @handle is guessed instead of asking for the handle");
    if (L("https://www.youtube.com/c/SomeName", "SomeName", "@realhandle").q !== "forHandle=%40realhandle") fail("universal: the handle RGA entered doesn't win");
    // legacy user link: the request carries forUsername
    { const social2 = { client_input: { profiles: [{ key: "youtube", url: "https://www.youtube.com/user/oldname", handle: "oldname" }] } }; yt.urls.length = 0;
      const st = store({ status: "pending" }, { [ID.SOCIAL]: social2 }); const j = await press(st, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_check" });
      if (!j.ok || j.read.state !== "matches" || !/forUsername=oldname/.test(yt.urls[0] || "")) fail(`universal: a /user/ link isn't read (${JSON.stringify(j).slice(0, 160)})`); }
    // /c/ link: says it needs the handle; no request is made; the card asks; entering it saves (read back, recorded) and reads
    { const social3 = { client_input: { profiles: [{ key: "youtube", url: "https://www.youtube.com/c/SomeName", handle: "SomeName" }] } }; yt.urls.length = 0;
      const st = store({ status: "pending" }, { [ID.SOCIAL]: social3 }); const j = await press(st, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_check" });
      const v = S.channelView(task(st), st.rec.data.tasks, {}), row = v.rows.find((r) => r.handle);
      if (yt.urls.length || !row || !/need the channel.s @handle/.test(row.title) || v.label === "Done") fail(`universal: a /c/ link isn't the "We need the channel's @handle" row (${JSON.stringify(v.rows).slice(0, 200)})`);
      const bad = await press(st, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_handle", handle: "no spaces allowed!" });
      if (bad.ok) fail("universal: a junk handle is saved");
      const ok = await press(st, { fetchFn: yt(200, item(PACK.description_full)) }, { action: "youtube_handle", handle: "@SomeName" });
      if (!ok.ok || task(st).yt_handle !== "@SomeName" || task(st).yt_read.state !== "matches" || !/forHandle=%40SomeName/.test(yt.urls[0] || "")) fail(`universal: the entered handle isn't saved and read (${JSON.stringify(ok).slice(0, 160)})`);
      if (!st.records.some((r) => r.answer && r.answer.action === "youtube_handle")) fail("universal: the entered handle isn't recorded");
      const nc = store({ status: "pending" }, { [ID.SOCIAL]: {} }); if ((await press(nc, {}, { action: "youtube_handle", handle: "@x_name" })).ok) fail("universal: a handle is saved for an unconfirmed channel"); }
    // no Google description: "Nothing to compare yet", never matches, never a plain can't-read
    { const st = store({ status: "pending" }); const j = await press(st, { pack: async () => ({ ...PACK, description_full: "" }), fetchFn: yt(200, item("Anything at all")) }, { action: "youtube_check" });
      const v = S.channelView(task(st), st.rec.data.tasks, { ref: (id) => `step <${id}>` }), r = JSON.stringify(v.rows);
      if (!/Nothing to compare yet: their Google profile has no description/.test(r) || !/Write it on step <m1\.gbp\.business_description> first/.test(r) || /Couldn.t read YouTube|matches their Google/.test(r) || task(st).status === "done" || j.read.state === "matches") fail(`universal: no Google description isn't "Nothing to compare yet" (${r.slice(0, 200)})`); }
    // the card draws the handle field button and the nothing-to-compare row
    { const A = read("admin/admin.js"); if (!/data-uni-yt="youtube_handle"/.test(A) || !/Enter the @handle/.test(A)) fail("universal: the card has no way to enter the @handle"); }
  }
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.stack || e.message}`); process.exit(2); }

// 11-9 on RGA: "Draft 2 scripts" reopened a finished 58; a matching read showed "You marked it pasted"
{ const FXS = fs.readFileSync(path.join(SITE, "netlify/functions/flow-execute.js"), "utf8"), AS = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  if (!/const KEEP_STATUS_ON_RUN = new Set\(\["m1\.brand\.youtube_setup"\]\);/.test(FXS) || !/status: keptStatus \|\| \(isDone \? "done" : "in_progress"\),/.test(FXS) || !/keptStatus \? \{ started_at: new Date\(\)\.toISOString\(\) \} :/.test(FXS)) fail("58: drafting the optional scripts can reopen a finished step again");
  if (!/matched = !!\(yr && yr\.state === "matches"\);/.test(AS)) fail("58: a matching YouTube read is hidden behind 'You marked it pasted'");
  if (!/if \(o && o\.flowId === "m1\.brand\.youtube_setup"\) return "";\n[\s\S]{0,300}?\n  const s = stepSetting\(task\);/.test(AS)) fail("58: the old 'Now set to CHANNEL · Draft copy' row is back under the card"); }
if (F.length) { console.error(`❌ step 58 reads YouTube: ${F.length} regression(s)`); for (const f of F) console.error("  · " + f); process.exit(1); }
console.log("✅ step 58 reads YouTube back: matches finishes the step by itself, a different description is RGA's move with both side by side, a read that can't be made says why and is never matches or missing, Pasted is the only way only while there is no key (then refused and gone), Check now is read-before-write and read back, the morning run is a free read that never starts the runner, Copy is exactly what Studio takes, the key is read only from YOUTUBE_API_KEY and never stored");
