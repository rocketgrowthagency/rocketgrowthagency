#!/usr/bin/env node
// check-no-client-record-was-lost.mjs — 2026-10-20, Chris: "verify against all steps that we don't lose any records … we must
// harden the system so we never lose work, regress or forget while we are building and improving."
//
// READ-ONLY against production (one gate at a time — feedback_my_test_runs_share_the_clients_database). Two checks:
//   1 · HISTORY: every answer a client ever gave is in `client_activity` (recordSubmission). The latest one per step must still
//       be on the step: a `client_step_input` → tasks[step].client_input present; a `client_step_choice` → client_choice equal;
//       a `client_step_marked_done` → the step still done (or a later client activity on it explains why not).
//   2 · SNAPSHOT: a keys-only snapshot of every task (status + which fields exist — never values, so no secret or customer
//       data is written) is compared with the last one: a field that vanished, a task that vanished, or done → not done is
//       reported. Snapshots: website reports/records/snapshots/<date>.json (+ latest.json).
// Month 1 = client_onboarding_records, Monthly = client_monthly_records (every reporting month).
//   exit 0 nothing lost · 1 something lost or regressed (report: website reports/records/record-check-<date>.md) · 2 can't read
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let analyze;
try { ({ analyze } = await import(pathToFileURL(path.join(SITE, "scripts", "record-loss.mjs")).href)); } catch (e) { console.error(`⚠️  INDETERMINATE — record-loss.mjs did not load: ${e.message}`); process.exit(2); }
const env = (k) => { if (process.env[k]) return process.env[k]; try { return execSync(`netlify env:get ${k} --context production`, { cwd: SITE, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
// 🔑 --self-test: the analysis must CATCH each kind of loss on fixtures (a check that can't fail protects nothing)
{
  const C = "c1", T0 = "2026-10-01T00:00:00Z";
  const base = () => ({ ob: [{ client_id: C, data: { tasks: { "m1.a": { status: "done", client_input: "x", completed_at: T0 }, "m1.b": { status: "done", client_choice: "skip" }, "m1.d": { status: "pending", detected: { verdict: "not_done", evidence: "0 of 5" } } } } }], mr: [],
    acts: [{ client_id: C, kind: "client_step_input", payload: { step_id: "m1.a" }, created_at: T0 }, { client_id: C, kind: "client_step_choice", payload: { step_id: "m1.b", choice: "skip" }, created_at: T0 },
      { client_id: C, kind: "client_step_marked_done", payload: { step_id: "m1.d" }, created_at: T0 }], name: { [C]: "Acme" }, DETECTED: new Set(["m1.d"]), ackFor: () => null, prev: null });
  const fails = [];
  const ok = analyze(base()); if (ok.lost.length) fails.push(`a healthy record reads as lost (${ok.lost})`); if (!ok.notes.length) fails.push("a detected step reopened by its reading isn't noted");
  const b1 = base(); delete b1.ob[0].data.tasks["m1.a"].client_input; if (!analyze(b1).lost.length) fails.push("a removed client answer isn't caught");
  const b2 = base(); delete b2.ob[0].data.tasks["m1.b"].client_choice; if (!analyze(b2).lost.length) fails.push("a removed choice isn't caught");
  const b3 = base(); b3.DETECTED = new Set(); if (!analyze(b3).lost.length) fails.push("a marked-done step reopened with no reason isn't caught");
  const b4 = base(); b4.prev = { at: T0, tasks: { [`${C}|m1|m1.a`]: { status: "done", keys: ["client_input", "completed_at", "status", "access"] } } }; if (!analyze(b4).changed.length) fails.push("a field that vanished since the last snapshot isn't caught");
  const b5 = base(); b5.prev = { at: T0, tasks: { [`${C}|m1|m1.z`]: { status: "done", keys: ["status"] } } }; if (!analyze(b5).changed.length) fails.push("a task that vanished isn't caught");
  const b6 = base(); b6.prev = { at: T0, tasks: { [`${C}|m1|m1.d`]: { status: "done", keys: Object.keys(b6.ob[0].data.tasks["m1.d"]) } } }; if (!analyze(b6).changed.length) fails.push("done → pending since the last snapshot isn't caught");
  const b7 = base(); delete b7.ob[0].data.tasks["m1.a"].client_input; b7.ackFor = () => ({ at: "2026-10-20", reason: "test" }); const a7 = analyze(b7); if (a7.lost.length || !a7.acked.length) fails.push("an acknowledged loss still fails the run (or vanishes from the report)");
  if (fails.length) { console.error("🔴 the record check can't catch:\n   · " + fails.join("\n   · ")); process.exit(1); }
  console.log("✅ self-test: the record check catches a lost answer, a lost choice, an unexplained reopen, a vanished field, a vanished task and done → pending; detected reopens and acknowledged losses are reported, not failed");
  // a COPY of the site (the mutation runner) is never production truth: it proves the analysis, then stops
  if (process.argv.includes("--self-test") || process.env.APPROVAL_ARCHIVE_SITE_DIR) process.exit(0);
}
const URL = env("SUPABASE_URL"), KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !KEY) { console.error("⚠️  INDETERMINATE — no Supabase credentials (netlify env:get)"); process.exit(2); }
async function all(p) {
  const out = []; let from = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${p.split("?")[0]} ${r.status}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) return out; from += 1000;
  }
}

let clients, ob, mr, acts;
try {
  [clients, ob, mr, acts] = await Promise.all([
    all("/clients?select=id,business_name,archived_at"),
    all("/client_onboarding_records?select=id,client_id,data"),
    all("/client_monthly_records?select=id,client_id,reporting_month,data"),
    all("/client_activity?kind=in.(client_step_input,client_step_choice,client_step_marked_done)&select=client_id,kind,payload,created_at&order=created_at.asc"),
  ]);
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't read production (${e.message})`); process.exit(2); }

const name = Object.fromEntries(clients.map((c) => [c.id, c.business_name || c.id]));
// steps whose Done is DETECTED: a nightly reading can rightly reopen them, so "marked done → reopened" is a note, not a loss
let DETECTED = new Set();
try { const cs = JSON.parse(fs.readFileSync(path.join(SITE, "data", "playbooks", "client-steps.json"), "utf8")); const list = Array.isArray(cs) ? cs : cs.steps || Object.values(cs).flat();
  DETECTED = new Set(list.filter((x) => x && x.clientDone === "detected").map((x) => x.id)); } catch (_) { DETECTED = new Set(); }
// historical losses already investigated (reason recorded) — reported every time, but they don't fail the run
let ACK = []; try { ACK = JSON.parse(fs.readFileSync(path.join(SITE, "reports", "records", "acknowledged.json"), "utf8")); } catch (_) { ACK = []; }
const ackFor = (cid, step) => ACK.find((a) => a.client_id === cid && a.step_id === step) || null;
const dir = path.join(SITE, "reports", "records", "snapshots"); fs.mkdirSync(dir, { recursive: true });
const latestFile = path.join(dir, "latest.json");
let prev = null; try { prev = JSON.parse(fs.readFileSync(latestFile, "utf8")); } catch { prev = null; }
const { lost, notes, acked, changed, snap } = analyze({ ob, mr, acts, name, DETECTED, ackFor, prev });
const day = new Date().toISOString().slice(0, 10);
const out = { at: new Date().toISOString(), tasks: snap };
fs.writeFileSync(path.join(dir, `${day}.json`), JSON.stringify(out));
fs.writeFileSync(latestFile, JSON.stringify(out));

const rep = [`# Client record check — ${day}`, "",
  `${clients.length} clients · ${ob.length} Month-1 records · ${mr.length} monthly records · ${acts.length} recorded client answers · ${Object.keys(snap).length} tasks snapshotted${prev ? ` (compared with ${prev.at.slice(0, 16)})` : " (first snapshot — the baseline)"}`, "",
  `## Lost (${lost.length})`, ...(lost.length ? lost.map((x) => `- 🔴 ${x}`) : ["- none"]), "",
  `## Acknowledged historical losses (${acked.length})`, ...(acked.length ? acked.map((x) => `- ⚪ ${x}`) : ["- none"]), "",
  `## Changed since the last snapshot (${changed.length})`, ...(changed.length ? changed.map((x) => `- 🟠 ${x}`) : ["- none"]), "",
  `## Notes (${notes.length})`, ...(notes.length ? notes.map((x) => `- ${x}`) : ["- none"]), ""].join("\n");
fs.mkdirSync(path.join(SITE, "reports", "records"), { recursive: true });
fs.writeFileSync(path.join(SITE, "reports", "records", `record-check-${day}.md`), rep);
console.log(rep);
if (lost.length || changed.length) { console.error(`🔴 ${lost.length} lost · ${changed.length} changed — see reports/records/record-check-${day}.md`); process.exit(1); }
console.log("✅ no client record was lost: every recorded answer, choice and done mark is still on its step, and nothing vanished since the last snapshot");

