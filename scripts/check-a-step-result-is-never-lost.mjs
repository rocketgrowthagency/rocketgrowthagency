#!/usr/bin/env node
// check-a-step-result-is-never-lost.mjs — TWO STEPS SAVING AT ONCE BOTH KEEP THEIR RESULT (11-9, the first morning-run start on RGA:
// steps 57, 61 and 62 finished together; each read the whole record, set its own task and wrote it all back, and 57's result vanished).
// flow-execute's saveTaskState now writes only if the record is unchanged since it read it (updated_at), else reads again and retries;
// it never overwrites and never silently drops: after the tries it throws. _step-record's writes move updated_at too, so a press made
// while a runner works is seen. Runs the SHIPPED save against a fake database. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
Object.assign(process.env, { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "k", SUPA_TIMEOUT_MS: "5000" });
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let DB = null;   // { rec, onPatch }
globalThis.fetch = async (u, init = {}) => {
  const url = decodeURIComponent(String(u)), m = (init.method || "GET").toUpperCase();
  const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (!url.startsWith("https://db.test/rest/v1/client_onboarding_records")) return ok([]);
  if (m === "GET") return ok([JSON.parse(JSON.stringify(DB.rec))]);
  if (m === "PATCH") {
    DB.patches++;
    const want = (url.match(/updated_at=eq\.([^&]+)/) || [])[1];
    if (DB.onPatch) DB.onPatch(DB);   // another writer lands between our read and our write
    if (want !== undefined && want !== DB.rec.updated_at) return ok([]);
    if (want === undefined && !/updated_at=is\.null/.test(url) && DB.strict) return ok([]);
    const body = JSON.parse(init.body); DB.rec = { ...DB.rec, data: body.data, updated_at: body.updated_at || DB.rec.updated_at };
    return ok([DB.rec]);
  }
  return ok([]);
};
let FX, SR, SRC;
try { FX = req(path.join(SITE, "netlify/functions/flow-execute.js")); SR = fs.readFileSync(path.join(SITE, "netlify/functions/_step-record.js"), "utf8"); SRC = fs.readFileSync(path.join(SITE, "netlify/functions/flow-execute.js"), "utf8");
  if (typeof FX.saveTaskState !== "function") throw new Error("flow-execute no longer exports saveTaskState"); }
catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const client = { id: "c1", workspace_id: "w1" };
try {
  // 1 · another step's result lands between our read and our write → ours re-reads, both stay
  DB = { patches: 0, rec: { id: "r1", client_id: "c1", updated_at: "2026-11-09T19:10:00.000Z", data: { tasks: { a: { status: "pending" } } } } };
  let once = false;
  DB.onPatch = (d) => { if (once) return; once = true; d.rec = { ...d.rec, updated_at: "2026-11-09T19:10:01.000Z", data: { tasks: { ...d.rec.data.tasks, other: { status: "done", ran_at: "x" } } } }; };
  try { await FX.saveTaskState(client, "mine", { status: "done", ran_at: "y" }, false); } catch (e) { fail(`a save that lost one race gave up instead of reading again (${e.message})`); }
  const T = DB.rec.data.tasks;
  if (!T.other || T.other.status !== "done") fail("a step's save erased another step's result that landed while it worked");
  if (!T.mine || T.mine.status !== "done") fail("the step's own result wasn't saved after re-reading");
  if (DB.patches < 2) fail("the save didn't retry after the record changed under it");
  // 2 · the record keeps changing → it throws (never overwrites, never silently drops)
  let n = 0;
  DB = { patches: 0, rec: { id: "r1", client_id: "c1", updated_at: "t0", data: { tasks: {} } } };
  DB.onPatch = (d) => { n++; d.rec = { ...d.rec, updated_at: `t${n}` }; };
  let threw = false; try { await FX.saveTaskState(client, "mine", { status: "done" }, false); } catch { threw = true; }
  if (!threw) fail("a save that could never land reported success");
  if (DB.rec.data.tasks.mine) fail("a save wrote over a record that had changed");
  // 3 · the quiet path: one read, one write
  DB = { patches: 0, rec: { id: "r1", client_id: "c1", updated_at: "t0", data: { tasks: {} } } };
  try { await FX.saveTaskState(client, "mine", { status: "in_progress" }, false); } catch (e) { fail(`an uncontested save threw (${e.message})`); }
  if (DB.patches !== 1 || !DB.rec.data.tasks.mine) fail("an uncontested save didn't land in one write");
  // 4 · the other writer moves updated_at on every write
  if (!/body: JSON\.stringify\(\{ data, updated_at: new Date\(\)\.toISOString\(\) \}\)/.test(SR)) fail("_step-record's writes don't move updated_at (a runner can't see a press made while it worked)");
  if (!/const same = record\.updated_at \? `&updated_at=eq\.\$\{encodeURIComponent\(record\.updated_at\)\}` : "&updated_at=is\.null";/.test(SRC)) fail("saveTaskState's write is no longer conditional on the record being unchanged");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ a step result can be lost: ${F.length}`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ a step result is never lost: a save re-reads when another write landed first (both kept), never overwrites a changed record (throws after its tries), lands in one write when uncontested, and every _step-record write moves updated_at");
