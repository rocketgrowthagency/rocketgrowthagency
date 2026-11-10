#!/usr/bin/env node
// check-step56-reads-step52.mjs — ADMIN STEP 56 IS STEP 52'S BING PLACES AND APPLE MAPS ROWS (approved step56_reads_step52_v1, the owner
// 11-9 walk: RGA's 56 read Done, ticked Sep 15 with only the setup instructions behind it, while 52 listed Bing and Apple as still to do).
// Runs the SHIPPED code against fakes (a fake database; no network):
//   1 56's rows are 52's bing + apple rows (never a copy); 52 not built = not ready; 52 built without them says so
//   2 done by 52's rule over those rows; a hand tick they don't prove reads "Done, but not proven" and is kept as it was
//   3 a press on 52 settles 56 in the same write (admin function), and the nightly look does the same; 56 takes only Skip / Undo itself
//   4 the admin card: its row buttons press 52, a skipped 52 says so, the row chip says "Done, but not proven"
//   5 the service area to paste: each town once, the state once, no "USA" on each, a non-US country kept once
//   6 56 has no runner and no Run label (it can't run itself into a different answer)
// exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
const read = (r) => fs.readFileSync(path.join(SITE, r), "utf8");
let B, P, ADM, A, FXSRC, PB;
try {
  B = req("./_citation-build.js"); P = req(path.join(SITE, "shared/citation-progress.js")); ADM = req("./admin-citation-build.js");
  A = read("admin/admin.js"); FXSRC = read("netlify/functions/flow-execute.js"); PB = JSON.parse(read("data/playbooks/playbooks.json"));
  if (typeof P.bingAppleProgress !== "function" || typeof B.settleBingApple !== "function" || typeof B.areaLine !== "function") throw new Error("the step 56 rule isn't exported");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const NOW = Date.parse("2026-11-09T18:00:00Z"), iso = (ms) => new Date(ms).toISOString();
const S56 = P.STEP.BING_APPLE, TOP = P.STEP.TOP;
const RGA = { id: "c-rga", business_name: "Rocket Growth Agency", business_type: "Local SEO agency", primary_market: "Culver City, CA", geography_model: "service_area", website_url: "https://www.rocketgrowthagency.com/", country: "US" };
const pack = B.buildPack(RGA, { title: "Rocket Growth Agency", phoneNumbers: { primaryPhone: "(424) 242-2040" }, websiteUri: "https://www.rocketgrowthagency.com/",
  serviceArea: { places: { placeInfos: ["El Segundo, CA, USA", "Culver City, CA, USA", "Los Angeles, CA, USA"].map((placeName) => ({ placeName })) } } }, { readAt: iso(NOW) });
const NF = (r = "Not for this test business") => ({ state: "not_for", reason: r, by: "chris@x", at: iso(NOW) });

try {
  // ── 1 · the rows are 52's ──
  const list = B.buildList(TOP, RGA, []);
  if (!list.items.some((i) => i.key === "bing") || !list.items.some((i) => i.key === "apple")) throw new Error("52's list for RGA has no Bing or Apple row to read");
  const top = { status: "in_progress", outcome_data: { pack, list } };
  const T = (t52, t56 = {}) => ({ [TOP]: t52, [S56]: t56 });
  let p = P.bingAppleProgress({}, T(top));
  if (!p.ready || p.rows.map((r) => r.key).sort().join() !== "apple,bing" || p.done) fail(`56's rows aren't exactly 52's Bing and Apple rows (${JSON.stringify(p.rows.map((r) => r.key))})`);
  const top2 = { ...top, listings: { apple: { state: "submitted", at: iso(NOW), tries: 0 } } };
  p = P.bingAppleProgress({}, T(top2));
  if ((p.rows.find((r) => r.key === "apple") || {}).state !== "checking") fail("a press on 52's Apple row doesn't show on 56");
  if (P.bingAppleProgress({ listings: { apple: NF(), bing: NF() } }, T(top)).done) fail("56 keeps a list of its own (its own task's listings count)");
  if (P.bingAppleProgress({}, T({})).ready) fail("56 reads ready while 52's list isn't built");
  const noBA = { ...top, outcome_data: { pack, list: { ...list, items: list.items.filter((i) => !["bing", "apple"].includes(i.key)) } } };
  p = P.bingAppleProgress({}, T(noBA));
  if (!p.none || p.done) fail("52's list without Bing or Apple isn't said on 56");

  // ── 2 · the done rule and the old tick ──
  const both = { ...top, listings: { bing: NF(), apple: { state: "live", url: "https://maps.apple.com/place?place-id=I1", live_at: iso(NOW), match: { name: true } } } };
  if (!P.bingAppleProgress({}, T(both)).done) fail("Bing marked not for this business + Apple live isn't done");
  if (P.bingAppleProgress({}, T({ ...top, listings: { bing: NF() } })).done) fail("56 is done with Apple still to do");
  if (P.progressOf(S56, {}, T(both)).done !== true) fail("progressOf doesn't answer for 56");
  const handTick = { status: "done", completed_at: "2026-09-15T17:00:00Z" };
  if (!P.doneUnproven(S56, handTick, T(top))) fail("a hand tick its rows don't prove isn't 'Done, but not proven'");
  if (P.doneUnproven(S56, handTick, T(both))) fail("a hand tick its rows DO prove still reads not proven");
  if (P.doneUnproven(S56, { status: "done", done_by: "checks" }, T(both))) fail("a step its checks finished reads not proven");
  if (P.doneUnproven(TOP, handTick, T(top))) fail("'not proven' leaks to another step");
  let s = B.settle(S56, handTick, NOW, T(top));
  if (s.task.status !== "done" || s.moved) fail("the old hand tick is rewritten instead of kept");
  s = B.settle(S56, {}, NOW, T(both));
  if (s.task.status !== "done" || s.task.done_by !== "checks" || s.moved !== "done") fail("56 doesn't finish itself when both settle");
  s = B.settle(S56, { status: "done", done_by: "checks" }, NOW, T(top));
  if (s.task.status !== "in_progress" || s.moved !== "reopened") fail("an Undo on 52 doesn't reopen a 56 its checks finished");
  if (B.settle(S56, { status: "skipped" }, NOW, T(both)).task.status !== "skipped") fail("a skipped 56 is un-skipped by its rows");

  // ── 3 · through the admin function: a press on 52 settles 56 in the same write ──
  const store = (tasks) => {
    const rec = { id: "rec1", data: { tasks: JSON.parse(JSON.stringify(tasks)) } }, calls = { writes: 0, records: [], acts: [] };
    const supa = async (q, init = {}) => {
      const m = (init.method || "GET").toUpperCase();
      if (q.startsWith("/client_onboarding_records") && m === "GET") return [JSON.parse(JSON.stringify(rec))];
      if (q.startsWith("/client_onboarding_records") && m === "PATCH") { calls.writes++; rec.data = JSON.parse(init.body).data; return [JSON.parse(JSON.stringify(rec))]; }
      if (q.startsWith("/client_activity")) calls.acts.push(JSON.parse(init.body));
      return [{ id: "x" }];
    };
    return { rec, calls, deps: { supa, fetch: async () => ({ ok: false, status: 404, text: async () => "" }), env: {}, now: () => NOW, search: async () => ({ ran: true, results: [] }), searchesLeft: async () => 100,
      record: async (o) => { calls.records.push(o); return { activity: true }; }, draft: async () => "", gate: { email: "chris@x" } } };
  };
  const call = async (body) => JSON.parse((await ADM.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "ae817a9c-60a2-4cc9-a196-0582b7b7e7c3", ...body }) })).body);
  let st = store(T({ ...top, listings: { bing: NF() } }, { status: "pending" })); ADM.__useDeps(st.deps);
  let j = await call({ step_id: TOP, action: "not_for", key: "apple", reason: "Not for this test business" });
  const t56 = st.rec.data.tasks[S56] || {};
  if (!j.ok || t56.status !== "done" || t56.done_by !== "checks" || st.calls.writes !== 1) fail(`the last of Bing/Apple settling on 52 doesn't finish 56 in the same write (${JSON.stringify(j).slice(0, 200)} · 56=${JSON.stringify(t56)})`);
  if (!j.tasks || !j.tasks[S56]) fail("the press's answer doesn't carry 56, so the 56 card keeps the old state");
  if (!st.calls.acts.some((a) => a.payload && a.payload.step_id === S56)) fail("56 finishing writes no feed line");
  j = await call({ step_id: TOP, action: "undo", key: "apple" });
  if (!j.ok || (st.rec.data.tasks[S56] || {}).status !== "in_progress") fail("Undo on 52's Apple row doesn't reopen 56");
  st = store(T(top, handTick)); ADM.__useDeps(st.deps);
  for (const action of ["submitted", "not_for", "link", "undo", "ask", "asked", "add"]) {
    j = await call({ step_id: S56, action, key: "apple", reason: "Not for this test business", url: "https://maps.apple.com/place?place-id=I1", name: "x" });
    if (j.ok || st.calls.writes || !/isn't on this step/.test(j.error || "")) { fail(`56 takes a "${action}" press of its own (its rows are 52's; they're pressed on 52): ${JSON.stringify(j).slice(0, 120)}`); break; }
  }
  j = await call({ step_id: S56, action: "skip", reason: "Sign-ups later for this test" });
  if (!j.ok || st.rec.data.tasks[S56].status !== "skipped") fail(`Skip this step… on 56 doesn't skip (${JSON.stringify(j).slice(0, 160)})`);
  j = await call({ step_id: S56, action: "unskip" });
  if (!j.ok || st.rec.data.tasks[S56].status !== "done" || st.rec.data.tasks[S56].completed_at !== handTick.completed_at) fail("Undo on 56's skip doesn't bring the old tick back exactly");
  ADM.__useDeps(null);
  // the nightly look settles 56 whenever it wrote 52
  const cc = String(B.checkClient);
  if (!/if \(looks\[STEP\.TOP\]\) \{ const s = settleBingApple\(nextTasks, now\); if \(s\) \{ nextTasks\[STEP\.BING_APPLE\] = s\.task; moved\[STEP\.BING_APPLE\] = s\.moved; \} \}/.test(cc)) fail("the nightly look writes 52 without settling 56");

  // ── 4 · the admin card ──
  const lift = (name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(A); if (!m) throw new Error(`${name} moved`); return A.slice(m.index, A.indexOf("\n}\n", m.index) + 2); };
  const line = (name) => { const m = new RegExp(`^const ${name} = [^\\n]*$`, "m").exec(A); if (!m) throw new Error(`${name} moved`); return m[0].replace(/^const /, "var "); };
  const ctx = vm.createContext({ rgaCitationProgress: P, escapeHtml: (x) => String(x), escapeAttribute: (x) => String(x), acDay: (d) => `D(${String(d).slice(0, 10)})`,
    obStepRef: () => "step 52", acCardHtml: (o) => `<CARD ${JSON.stringify(o)}>`, state: {} });
  vm.runInContext(["stepTitleOf", "CB_TILE", "_cbCopy", "cbP", "CB_MARK", "cbMark", "CB_RIGHT", "cbOpen", "cbSkipLink"].map(line).concat(["cbBtn", "cbCopyBtn", "cbPackHtml", "cbSkippedHtml", "cbListActs", "cbRowsHtml", "cbBingAppleCardHtml", "cbCardHtml", "cbRowPill"].map(lift)).join("\n"), ctx);
  // 11-9 night fixer: the skipped-52 title reads 52's name from the playbook (stepTitleOf, check-a-step-title-has-one-home), so the lift carries it and the playbook
  const PB1 = JSON.parse(read("data/playbooks/playbooks.json")).month1;
  const card = (tasks) => { ctx.state = { flowM1State: { tasks }, flowM1Playbook: PB1 }; return vm.runInContext(`cbCardHtml(${JSON.stringify(S56)}, state.flowM1State.tasks[${JSON.stringify(S56)}])`, ctx); };
  const opts = (h) => { const m = /<CARD (.*)>/s.exec(h); return m ? JSON.parse(m[1].slice(0, m[1].lastIndexOf("}") + 1)) : {}; };
  let h = card(T(top, {})), o = opts(h);
  if (o.label !== "0 of 2 live" || !/Bing Places and Apple Maps, the same rows as step 52/.test(o.title || "")) fail(`the open 56 card isn't the approved one (${o.label} · ${o.title})`);
  if (!/data-cb-act="submitted" data-cb-step="m1\.cit\.priority_top10" data-cb-key="apple"/.test(o.body || "") || /data-cb-step="m1\.platform\.bing_apple" data-cb-key/.test(o.body || "")) fail("56's row buttons don't press 52's rows");
  if (!/data-cb-act="skip" data-cb-step="m1\.platform\.bing_apple"/.test(o.acts || "")) fail("56 has no Skip this step…");
  if (!/Service area/.test(o.body || "") || !/El Segundo, Culver City, Los Angeles \(CA\)/.test(o.body || "")) fail("56's details to paste aren't 52's pack, cleaned");
  o = opts(card(T(top, handTick)));
  if (o.label !== "Done, but not proven" || !/Ticked by hand D\(2026-09-15\)/.test(o.say || "")) fail(`the old tick doesn't read Done, but not proven (${o.label})`);
  o = opts(card(T(both, { status: "done", done_by: "checks" })));
  if (o.label !== "Done" || o.acts) fail(`a proven 56 doesn't read Done (${o.label})`);
  o = opts(card(T({ status: "skipped" }, {})));
  if (!/^Build top-10 priority citations \(step 52\) is skipped/.test(o.title || "")) fail(`a skipped 52 doesn't say so on 56, by its name (${o.title})`);
  o = opts(card(T({}, handTick)));
  if (o.label !== "Done, but not proven" || !/Build the list on step 52 first/.test(o.title || "")) fail(`56 before 52 is built isn't said (${o.label} · ${o.title})`);
  if (!/Skipped: Sign-ups later/.test(card(T(top, { status: "skipped", skip_reason: "Sign-ups later", skipped_at: iso(NOW) })))) fail("a skipped 56 loses its Skipped card");
  ctx.state = { flowM1State: { tasks: T(top, handTick) } };
  const pill = vm.runInContext(`cbRowPill(${JSON.stringify(S56)}, state.flowM1State.tasks[${JSON.stringify(S56)}])`, ctx);
  if (!pill || pill.text !== "Done, but not proven") fail(`56's row chip still says ${pill && pill.text}`);
  if (!/: step === cbP\(\)\.STEP\.BING_APPLE \? cbBingAppleCardHtml\(step, task, tasks\)/.test(A)) fail("cbCardHtml doesn't draw 56's card");

  // ── 5 · the service area ──
  const AL = [
    [["El Segundo, CA, USA", "Culver City, CA, USA", "Los Angeles, CA, USA"], "El Segundo, Culver City, Los Angeles (CA)"],
    [["Los Angeles County, CA, USA"], "Los Angeles County (CA)"],
    [["Reno, NV, USA", "Sacramento, CA, USA", "Davis, CA, USA"], "Reno (NV); Sacramento, Davis (CA)"],
    [["Toronto, ON, Canada", "Ottawa, ON, Canada"], "Toronto, Ottawa (ON, Canada)"],
    [["California, USA"], "California"],
    [["Austin, TX, USA", "Austin, TX, USA"], "Austin (TX)"],
  ];
  for (const [inp, want] of AL) { const got = B.areaLine(inp); if (got !== want) fail(`service area ${JSON.stringify(inp)} → "${got}", wanted "${want}"`); }
  if (pack.service_area !== "El Segundo, Culver City, Los Angeles (CA)") fail(`the pack's service area isn't cleaned (${pack.service_area})`);
  if (B.buildPack({ ...RGA }, { title: "x", serviceArea: { places: { placeInfos: [] } } }).service_area !== "Culver City, CA") fail("no Google places no longer falls back to the record");

  // ── 6 · no runner ──
  const pb = (PB.month1 || []).find((x) => x.id === S56);
  if (!pb || pb.hasRunner !== false || pb.actionLabel) fail("56 offers a Run button again in playbooks.json");
  if (new RegExp(`\\n  "${S56.replace(/\./g, "\\.")}": async`).test(FXSRC)) fail("56 has a runner again in flow-execute (it printed manual sign-up steps)");
  if (!/const resultBlock = o\.flowId === "m1\.platform\.bing_apple"(?: \|\| o\.flowId === "[a-z0-9._]+")* \? "" : stepOutputHtml\(result, s\.task, o\);/.test(A)) fail("56's retired checklist output (Import from Google, Apple's old address) shows again under its card");
  if (!/same two rows/.test((pb && pb.instructions) || "") || /Import from Google →/.test((pb && pb.instructions) || "")) fail("56's instructions don't say it reads 52's rows, or tell RGA to import from Google again");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ step 56: ${F.length} regression(s)`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ step 56 is step 52's Bing Places + Apple Maps rows: one record (a press on either shows on both, settled in the same write, nightly too), done by 52's rule, a hand tick they don't prove reads 'Done, but not proven' and is kept, Skip/Undo only on 56 itself, no runner; the service area lists each town once with the state once");
