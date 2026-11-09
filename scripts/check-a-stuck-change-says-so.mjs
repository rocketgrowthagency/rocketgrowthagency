#!/usr/bin/env node
// check-a-stuck-change-says-so.mjs — AN APPROVED CHANGE THAT CAN'T GO UP SAYS SO, AND TRIES AGAIN BY ITSELF (approved publish_failure_shows_v1,
// the owner 11-8). RGA's step 50 was approved, the safety check refused its pull request, nothing recorded it and nothing retried: it sat at
// "RGA is putting it up". Now a refused snapshot / pull request / merge is written on the step with its reason, admin's row and card say
// "Can't go up" with the reason, the red warning lists it, it retries every hour (a snapshot first when that was the reason), a success
// clears it, and after a day the client reads only that RGA is fixing something. exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m);
const req = createRequire(path.join(SITE, "netlify/functions/x.js"));
let AR, SC, A, AD, PD, P;
try {
  AR = req(path.join(SITE, "netlify/functions/_website-autorun.js")); SC = req(path.join(SITE, "shared/site-change.js"));
  A = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8"); AD = fs.readFileSync(path.join(SITE, "netlify/functions/admin-deliverables.js"), "utf8");
  PD = fs.readFileSync(path.join(SITE, "netlify/functions/portal-deliverables.js"), "utf8"); P = fs.readFileSync(path.join(SITE, "portal/portal.js"), "utf8");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const lift = (src, name) => { const m = new RegExp(`^function ${name}\\(`, "m").exec(src); return m ? src.slice(m.index, src.indexOf("\n}\n", m.index) + 2) : null; };
try {
  // ── the hourly retry ──
  const now = Date.parse("2026-11-09T12:00:00Z"), iso = (ms) => new Date(ms).toISOString(), v = "v1";
  const base = { "m1.access.website": { status: "done", access: { repo: "o/r", confirmed_at: "x", via: "github_app" }, host_check: { state: "built" } },
    "m1.access.publish_test": { site_change: { v: "t" }, published: { v: "t", at: "y" } } };
  const step = { id: "m1.web.location_pages", dependsOn: [] };
  const appr = (extra = {}) => ({ site_change: { v, new_page: true, items: [{ label: "x", after: "y" }] }, approval: { decision: "approved", change_v: v, at: iso(now - 2 * 864e5) }, auto_done: { [`pub:open:${v}`]: "x" }, ...extra });
  const plan = (t, data = { site_snapshot: { at: iso(now - 3600e3) } }) => { try { return AR.planStep(step, { ...base, [step.id]: t }, now, data); } catch (e) { return { act: `threw: ${e.message}` }; } };
  if (plan(appr()) !== null) fail("a used-up open with nothing recorded retries (it should only retry a recorded refusal)");
  const pf = (act, ago, why = "Safety check: The page isn't on their website.") => ({ publish_failed: { v, act, at: iso(now - ago), why } });
  if (plan(appr(pf("open", 30 * 60e3))) !== null) fail("a refusal retries within the hour");
  const r1 = plan(appr(pf("open", 61 * 60e3)));
  if (!r1 || r1.act !== "open" || !/^pub:open:v1:r\d+$/.test(r1.sig || "")) fail(`a refused pull request doesn't retry after an hour (${JSON.stringify(r1)})`);
  if (plan(appr({ ...pf("open", 61 * 60e3), auto_done: { [`pub:open:${v}`]: "x", [r1 && r1.sig]: "y" } })) !== null) fail("the hourly retry runs twice in the same hour");
  const r2 = plan(appr(pf("open", 61 * 60e3, "Take the before-snapshot of their pages first (it's how we prove nothing else changes). Nothing was opened.")));
  if (!r2 || r2.act !== "snap") fail(`a pull request refused for a missing snapshot doesn't retake the snapshot first (${JSON.stringify(r2)})`);
  const merged = appr({ ...pf("merge", 61 * 60e3), publish_pr: { v, number: 4 }, auto_done: { [`pub:open:${v}`]: "x", [`pub:merge:${v}`]: "x" } });
  const r3 = plan(merged);
  if (!r3 || r3.act !== "merge") fail(`a refused merge doesn't retry after an hour (${JSON.stringify(r3)})`);
  if (plan(appr({ publish_failed: { v: "older", act: "open", at: iso(now - 7200e3), why: "x" } })) !== null) fail("an older version's refusal retries the new one");

  // ── a refusal is written on the step ──
  let stored = null;
  const rec = { id: "ob1", data: { tasks: { [step.id]: appr({ auto_n: 3 }) } } };
  const d = { now: () => now, call: async () => ({ ok: false, status: 409, error: "Safety check: The page isn't on their website. Nothing was opened." }),
    supa: async (p, init = {}) => {
      if ((init.method || "GET") === "PATCH") { stored = JSON.parse(init.body).data; rec.data = stored; return [{ id: "ob1" }]; }
      return [JSON.parse(JSON.stringify(rec))];
    } };
  if (typeof AR.runAction !== "function") throw new Error("_website-autorun.js no longer exports runAction");
  await AR.runAction(d, { id: "c1" }, rec, step, rec.data.tasks[step.id], { act: "open", sig: "pub:open:v1:r1" }, "test", false);
  const w = stored && stored.tasks[step.id].publish_failed;
  if (!w || w.act !== "open" || !/isn't on their website/.test(w.why) || w.v !== v) fail(`a refused pull request isn't written on the step with its reason (${JSON.stringify(w)})`);
  stored = null; d.call = async () => ({ ok: false, error: "snapshot couldn't read their pages" });
  await AR.runAction(d, { id: "c1" }, rec, step, rec.data.tasks[step.id], { act: "snap", sig: "pub:snap:v1:r1" }, "test", false);
  if (!stored || (stored.tasks[step.id].publish_failed || {}).act !== "snap") fail("a refused snapshot isn't written on the step");
  if ((AD.match(/delete t\.publish_failed;/g) || []).length !== 2) fail("a pull request that opens / merges doesn't clear the refusal");

  // ── admin ──
  const ctx = vm.createContext({ globalThis: { rgaSiteChange: SC } });
  vm.runInContext(lift(A, "wcStuck"), ctx);
  const st = (t) => vm.runInContext(`wcStuck(${JSON.stringify(t)})`, ctx);
  if (!st(appr(pf("open", 60e3)))) fail("admin doesn't see an approved change whose pull request was refused");
  if (st(appr({ ...pf("merge", 60e3), publish_pr: { v, merged: { at: "z" } } }))) fail("a change that went up still reads as stuck");
  if (st(appr({ publish_failed: { v: "older", act: "open", at: "x", why: "y" } }))) fail("an older version's refusal reads as stuck");
  if (!/if \(wcStuck\(task\)\) return \{ text: "Can't go up", cls: "active" \};/.test(A)) fail("admin's row doesn't say 'Can't go up'");
  if (!/label: "Your move · it can't go up"/.test(A) || !/tries again by itself every hour/.test(A) || !/“\$\{escapeHtml\(stuck\.why\)\}”/.test(A) || !/Nothing on their website changed\./.test(A)) fail("admin's card doesn't say it can't go up, the reason, and that it retries");
  if (!/const stuck = Object\.entries\(tasks\)\.map\(\(\[id, x\]\) => \(\{ id, pf: wcStuck\(x\) \}\)\)/.test(A) || !/\.\.\.stuckLines\]/.test(A)) fail("the red publish warning doesn't list a stuck change");
  const card = (A.match(/const stuck = wcStuck\(task\);[\s\S]*?const move = wcAutoMove\(id, task\)/) || [""])[0];
  if (!card) throw new Error("the stuck card moved");
  if (/<button|data-ob-wc-/.test(card)) fail("the stuck card has a button (it retries by itself; no Try again)");

  // ── the client: only after a day, never our error ──
  if (!/stuck: stc === "approved" && !!\(t\.publish_failed && t\.publish_failed\.v === c\.v\) && !!\(ans && ans\.at\) && Date\.now\(\) - Date\.parse\(ans\.at\) >= 864e5,/.test(PD)) fail("the client is told before a day has passed, or about another version");
  if (/publish_failed\.why|why: t\.publish_failed/.test(PD)) fail("the client is sent RGA's error text");
  if (!/: d\.stuck \? \["now", "Going up soon", "We're fixing something on our side first\. Nothing on your website changed\."\]/.test(P) || !/if \(e\.group === "going" && d\.stuck\) return "Going up soon · we're fixing something on our side first";/.test(P)) fail("the client's card doesn't say 'Going up soon · we're fixing something on our side first'");
} catch (e) { console.error(`⚠️  INDETERMINATE: ${String(e.stack || e.message).split("\n").slice(0, 2).join(" ")}`); process.exit(2); }
if (F.length) { console.error(`❌ a stuck change — ${F.length} regression(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ an approved change that can't go up says so: the refusal is written on the step, admin's row and card say 'Can't go up' with the reason, the red warning lists it, it retries every hour (the snapshot first when that was the reason), a success clears it, and after a day the client reads only 'Going up soon'");
