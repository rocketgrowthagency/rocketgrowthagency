#!/usr/bin/env node
// check-master-sop-is-current.mjs: THE MASTER SOP CAN NEVER GO STALE (Chris 11-11: "a complete MASTER SOP and all related items in a
// database… a brain also and memory"; reference_master_sop). The SOP is the website repo's docs/master-sop/ (index.json + each area's data,
// compiled by scripts/build-master-sop.mjs into SOP.md, index.html, chapters.json). A reference nobody keeps current is worse than none:
// it answers confidently and wrongly. HOLDS, on the WEBSITE repo:
//   1  STEPS = THE PLAYBOOK. Every step id the product runs (data/playbooks/playbooks.json every phase, managed-steps.json, the end-of-service
//      lines offboarding.<key> from netlify/functions/_closing-list.js ITEMS, the client_portal_stage values from the stage constraint in
//      docs/supabase/*STAGE*.sql) has a row in docs/master-sop/steps/steps.json, and steps.json names no id that no longer exists. No duplicates.
//   2  EVERY SCHEDULED JOB in netlify/functions/_job-manifest.js has an entry in the checkers schedule (docs/master-sop/checkers/checkers.json).
//   3  EVERY SUPABASE TABLE named in code (rest/v1/<t>, supa*(`/<t>`, .from("<t>") in netlify/functions, shared, admin, portal) has an entry in
//      the database area, ONCE that area's data exists (docs/master-sop/database/db.json, a `tables` array). Before that: skipped, and said.
//   4  INDEX. Every area has an id, a title and a known status; ids unique; the master list 1..17 has no hole; every data file named exists;
//      an APPROVED area has its artifact URL (https://claude.ai/artifact/...).
//   5  SOP.md IS NOT OLDER THAN ITS DATA. The website's own generator (scripts/lib/master-sop.mjs) rebuilds SOP.md, index.html and
//      chapters.json in memory: each must equal the committed file byte for byte, and SOP.md's first line must carry the digest of today's
//      inputs. (By CONTENT, not mtime: git checkouts and copies rewrite mtimes, so an mtime rule would be red after every merge.)
//   6  ONE PLACE. reports/master-audit/ holds nothing but its README pointer (a data file there again = the data in two places).
//   7  INTERNAL. netlify.toml still answers /docs/* with a forced 404 (the SOP is never web-public).
// PROVES ITSELF every run: a copy of the real Master SOP with 8 known defects planted, one at a time (a playbook step the steps data lacks,
// a steps row for a dead id, a new job, an approved area without a URL, a data edit without a rebuild, a table missing from the database
// area, a data file back in reports/master-audit, the /docs/* block gone) MUST be caught by the matching rule, and the clean copy MUST pass;
// otherwise exit 2. --against=<rev> runs the rules on the website at that revision (9fbb0dd8, before the SOP existed, fails).
//   node scripts/check-master-sop-is-current.mjs [--against=<rev>] [--no-selftest]
// exit 0 holds · 1 the SOP has drifted · 2 INDETERMINATE (no docs/master-sop on this checkout yet, a source cannot be read, the self-test failed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const GIT_SITE = fs.existsSync(path.join(SITE, ".git")) ? SITE : (process.env.WEBSITE_GIT_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code");
const SOP = "docs/master-sop";
const ARGV = process.argv.slice(2);
const AGAINST = (ARGV.find((a) => a.startsWith("--against=")) || "").slice(10) || null;
const CODE_DIRS = ["netlify/functions", "shared", "admin", "portal"];
const STATUSES = ["approved", "for approval", "in progress", "planned"];
const indeterminate = (m) => { console.error(`⚠️  INDETERMINATE: ${m}`); process.exit(2); };

/** A reader over a root, with `over` (rel -> text, or null = absent) laid on top, and a fallback root for files the copy does not carry. */
function fsOf(root, over = {}, fallback = null) {
  const pick = (rel) => (fs.existsSync(path.join(root, rel)) || !fallback ? path.join(root, rel) : path.join(fallback, rel));
  return {
    root,
    read(rel) { if (rel in over) return over[rel]; try { return fs.readFileSync(pick(rel), "utf8"); } catch { return null; } },
    list(rel) { const k = Object.keys(over).filter((p) => p.startsWith(`${rel}/`) && over[p] != null).map((p) => p.slice(rel.length + 1));
      let real = []; try { real = fs.readdirSync(pick(rel)); } catch { real = []; } return [...new Set([...real, ...k])].sort(); },
    walk(rel) { const out = []; const go = (r) => { let es; try { es = fs.readdirSync(pick(r), { withFileTypes: true }); } catch { return; }
      for (const e of es) { const x = `${r}/${e.name}`; if (e.isDirectory()) { if (e.name !== "node_modules") go(x); } else if (/\.(m?js|cjs)$/.test(e.name)) out.push(x); } }; go(rel); return out; },
  };
}
const codeOnly = (src) => String(src || "").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const jparse = (F, rel, fail) => { const t = F.read(rel); if (t == null) { fail(`${rel} is missing`); return null; } try { return JSON.parse(t); } catch (e) { fail(`${rel} does not parse (${String(e.message).slice(0, 80)})`); return null; } };

// ── what the product runs ───────────────────────────────────────────────────────────────────────────────
function productStepIds(F, fail) {
  const ids = new Map(), add = (id, from) => { if (id && !ids.has(id)) ids.set(id, from); };
  const pb = jparse(F, "data/playbooks/playbooks.json", fail);
  if (pb) for (const [k, v] of Object.entries(pb)) if (Array.isArray(v)) for (const s of v) if (s && s.id) add(s.id, `playbooks.json ${k}`);
  const ms = jparse(F, "data/playbooks/managed-steps.json", fail);
  if (ms) for (const v of Object.values(ms)) if (v && v.id) add(v.id, "managed-steps.json");
  const cl = F.read("netlify/functions/_closing-list.js");
  const items = cl && /const ITEMS = \[([\s\S]*?)\n\];/.exec(cl);
  if (!items) fail("netlify/functions/_closing-list.js has no ITEMS list (the end-of-service lines)");
  else for (const m of codeOnly(items[1]).matchAll(/\{\s*key:\s*"([a-z_]+)"/g)) add(`offboarding.${m[1]}`, "_closing-list.js ITEMS");
  const sqls = F.list("docs/supabase").filter((f) => /STAGE.*\.sql$/i.test(f));
  let stages = null, from = null;
  for (const f of sqls) { const m = /clients_client_portal_stage_check\s+check\s*\(\s*client_portal_stage\s+in\s*\(([^)]*)\)/i.exec(F.read(`docs/supabase/${f}`) || ""); if (m) { stages = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]); from = f; } }
  if (!stages || !stages.length) fail("no client_portal_stage constraint found in docs/supabase/*STAGE*.sql (the stage list)");
  else for (const s of stages) add(s, from);
  return ids;
}
function manifestJobs(F, fail) {
  const src = F.read("netlify/functions/_job-manifest.js");
  if (src == null) { fail("netlify/functions/_job-manifest.js is missing"); return []; }
  const jobs = [...codeOnly(src).matchAll(/\{\s*job:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (!jobs.length) fail("_job-manifest.js lists no job (the parse found none)");
  return jobs;
}
const tableCache = new Map();
function codeTables(F) {
  const key = F.root; if (tableCache.has(key)) return tableCache.get(key);
  const names = new Map();
  for (const d of CODE_DIRS) for (const f of F.walk(d)) {
    const src = codeOnly(F.read(f));
    for (const re of [/rest\/v1\/([a-z_][a-z0-9_]*)/g, /\bsupa\w*\(\s*[`"']\/([a-z_][a-z0-9_]*)[?`"'/]/g, /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g])
      for (const m of src.matchAll(re)) if (m[1] !== "rpc" && !names.has(m[1])) names.set(m[1], f);
  }
  tableCache.set(key, names);
  return names;
}

// ── the rules ───────────────────────────────────────────────────────────────────────────────────────────
async function checkTree(F, { sopRoot = F.root, label = "after", strictMissing = false } = {}) {
  const P = [], fail = (m) => P.push(`${label}: ${m}`);
  const idxText = F.read(`${SOP}/index.json`);
  if (idxText == null) { if (strictMissing) { fail(`${SOP}/index.json is missing (no Master SOP at this revision)`); } else return { missing: true, P };
    if (F.list("reports/master-audit").some((f) => f !== "README.md")) fail(`reports/master-audit/ holds data files (${F.list("reports/master-audit").filter((f) => f !== "README.md").slice(0, 4).join(", ")}): the data is not in docs/master-sop`);
    return { P }; }
  let idx; try { idx = JSON.parse(idxText); } catch (e) { fail(`index.json does not parse (${String(e.message).slice(0, 80)})`); return { P }; }
  const areas = Array.isArray(idx.areas) ? idx.areas : [];
  const byId = Object.fromEntries(areas.map((a) => [a && a.id, a]));
  // 4 · the index
  if (!areas.length) fail("index.json lists no area");
  const seen = new Set();
  for (const a of areas) {
    if (!a || !a.id || !a.title) { fail(`an area has no id or title (${JSON.stringify(a).slice(0, 80)})`); continue; }
    if (seen.has(a.id)) fail(`area id "${a.id}" is listed twice`); seen.add(a.id);
    if (!STATUSES.includes(a.status)) fail(`area "${a.id}" has status "${a.status}", not one of ${STATUSES.join(" / ")}`);
    if (a.status === "approved" && !/^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]+$/.test(a.artifact_url || "")) fail(`area "${a.id}" is APPROVED but has no artifact URL`);
    for (const f of [a.data_file, a.readable, ...(a.files || [])]) if (f && F.read(`${SOP}/${f}`) == null) fail(`area "${a.id}" names ${SOP}/${f}, which does not exist`);
    if (a.artifact_file && F.read(a.artifact_file) == null) fail(`area "${a.id}" names ${a.artifact_file}, which does not exist`);
  }
  const nums = areas.map((a) => a && a.n).filter((n) => n != null).sort((x, y) => x - y);
  for (let i = 1; i <= Math.max(17, nums.length ? nums[nums.length - 1] : 0); i++) if (!nums.includes(i)) fail(`the master list has no area number ${i}`);
  if (new Set(nums).size !== nums.length) fail("two areas share a number on the master list");
  // 1 · steps = the playbook
  const st = byId.steps;
  if (!st || !st.data_file) fail('there is no "steps" area with a data file');
  else {
    const rows = jparse(F, `${SOP}/${st.data_file}`, fail);
    if (rows && !Array.isArray(rows)) fail(`${st.data_file} is not a list of step rows`);
    else if (rows) {
      const want = productStepIds(F, fail), have = new Map();
      for (const r of rows) { if (!r || !r.id) { fail("a steps row has no id"); continue; } if (have.has(r.id)) fail(`steps data lists ${r.id} twice`); have.set(r.id, r); }
      for (const [id, from] of want) if (!have.has(id)) fail(`${id} (${from}) is missing from the steps data`);
      for (const id of have.keys()) if (want.size && !want.has(id)) fail(`the steps data names ${id}, which no longer exists in the playbook, managed steps, closing list or stage list`);
      // 🔒 11-13: the admin Monthly numbers run in PAGE ORDER from shared/monthly-sections.js (NUMBERING = section, d43574c2 11-11), but
      // 20 Monthly rows here kept the old numbers (14-20, 31-33 instead of 16-25 …) for two days and nothing noticed. The number a step's
      // row carries must be the number the admin draws.
      const msTxt = F.read("shared/monthly-sections.js");
      if (msTxt != null) {
        let R = null; try { const m = { exports: {} }, g = {}; new Function("module", "exports", "globalThis", "window", msTxt)(m, m.exports, g, g); R = (m.exports && m.exports.SECTIONS) ? m.exports : g.rgaMonthly; } catch (e) { fail(`shared/monthly-sections.js does not load (${String(e.message).slice(0, 80)})`); }
        if (R && Array.isArray(R.SECTIONS) && R.NUMBERING === "section") {
          let n = 0; const pageNo = {}; for (const sec of R.SECTIONS) for (const id of sec.ids || []) pageNo[id] = ++n;
          const off = [...have.values()].filter((r) => pageNo[r.id] != null && Number(r.admin_no) !== pageNo[r.id]);
          if (off.length) fail(`${off.length} Monthly step row(s) carry an admin number the page doesn't draw (page order, shared/monthly-sections.js): ${off.slice(0, 6).map((r) => `${r.id} ${r.admin_no}→${pageNo[r.id]}`).join(", ")}${off.length > 6 ? " …" : ""}`);
        }
      }
    }
  }
  // 2 · every scheduled job has a checker entry
  const ck = byId.checkers;
  if (!ck || !ck.data_file) fail('there is no "checkers" area with a data file');
  else {
    const C = jparse(F, `${SOP}/${ck.data_file}`, fail);
    if (C) {
      const sched = new Set((C.schedule || []).map((s) => String(s.job || "").replace(/^com\.rga\./, "").replace(/\s*\(.*\)\s*$/, "").trim()));
      if (!sched.size) fail("the checkers data has no schedule");
      for (const j of manifestJobs(F, fail)) if (!sched.has(j)) fail(`scheduled job ${j} (_job-manifest.js) is missing from the checkers schedule`);
    }
  }
  // 3 · every table named in code is in the database area, once its data exists
  const db = byId.database, dbFile = db && (db.data_file || db.data_file_expected);
  const dbText = dbFile ? F.read(`${SOP}/${dbFile}`) : null;
  let tablesNote = "the database area has no data yet: the table rule waits for it";
  if (dbText != null) {
    let D = null; try { D = JSON.parse(dbText); } catch { fail(`${SOP}/${dbFile} does not parse`); }
    if (D && !Array.isArray(D.tables)) fail(`${SOP}/${dbFile} has no "tables" list`);
    else if (D) {
      const known = new Set(D.tables.map((t) => t && t.name).filter(Boolean));
      const named = codeTables(F);
      for (const [t, f] of named) if (!known.has(t)) fail(`Supabase table ${t} (named in ${f}) has no entry in the database area`);
      tablesNote = `${named.size} tables named in code, all in the database area`;
    }
  }
  // 5 · SOP.md is not older than its data
  const libPath = path.join(sopRoot, "scripts/lib/master-sop.mjs");
  if (!fs.existsSync(libPath)) fail("scripts/lib/master-sop.mjs (the generator) is missing");
  else {
    let lib = null;
    try { lib = await import(`${pathToFileURL(libPath).href}?r=${encodeURIComponent(sopRoot)}`); } catch (e) { fail(`the generator does not load (${String(e.message).slice(0, 100)})`); }
    if (lib) {
      let out = null, digest = null;
      try { out = lib.build(sopRoot); digest = lib.sourcesDigest(sopRoot); } catch (e) { fail(`the generator throws on today's data (${String(e.message).slice(0, 120)})`); }
      if (out) for (const f of lib.OUTPUTS || Object.keys(out)) {
        const cur = F.read(`${SOP}/${f}`);
        if (cur == null) fail(`${SOP}/${f} is missing: run node scripts/build-master-sop.mjs`);
        else if (cur !== out[f]) fail(`${SOP}/${f} is out of date with its data: run node scripts/build-master-sop.mjs and commit`);
      }
      const first = (F.read(`${SOP}/SOP.md`) || "").split("\n")[0];
      const m = /master-sop-sources: sha256=([0-9a-f]{64})/.exec(first);
      if (digest && (!m || m[1] !== digest)) fail(`SOP.md was built from other data (${m ? m[1].slice(0, 12) : "no digest"}…, today's inputs are ${digest.slice(0, 12)}…)`);
    }
  }
  // 6 · one place
  const extra = F.list("reports/master-audit").filter((f) => f !== "README.md");
  if (extra.length) fail(`reports/master-audit/ holds ${extra.slice(0, 4).join(", ")}${extra.length > 4 ? ", …" : ""}: the data must live in ONE place (docs/master-sop/<area>/)`);
  // 7 · never web-public
  const toml = F.read("netlify.toml") || "";
  if (!/\[\[redirects\]\][^[]*?from\s*=\s*"\/docs\/\*"[^[]*?status\s*=\s*404[^[]*?force\s*=\s*true/.test(toml)) fail('netlify.toml no longer answers /docs/* with a forced 404: the internal SOP would be web-public');
  return { P, areas: areas.length, tablesNote };
}

// ── the self-test: planted defects on a copy of the real SOP ────────────────────────────────────────────
async function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "master-sop-self-"));
  try {
    const cp = (rel) => { const s = path.join(SITE, rel), d = path.join(tmp, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.cpSync(s, d, { recursive: true }); };
    cp(SOP); cp("scripts/lib/master-sop.mjs");
    const idx = JSON.parse(fs.readFileSync(path.join(SITE, SOP, "index.json"), "utf8"));
    for (const a of idx.areas) if (a.artifact_file && fs.existsSync(path.join(SITE, a.artifact_file))) cp(a.artifact_file);
    fs.mkdirSync(path.join(tmp, "reports/master-audit"), { recursive: true });
    const base = fsOf(tmp, {}, SITE);
    const clean = await checkTree(base, { sopRoot: tmp, label: "selftest-clean" });
    const real = await checkTree(fsOf(SITE), { label: "real" });
    if (!real.P.length && clean.P.length) return `the clean copy fails although the real tree passes: ${clean.P[0]}`;
    const rd = (rel) => fs.readFileSync(path.join(SITE, rel), "utf8");
    const pb = JSON.parse(rd("data/playbooks/playbooks.json"));
    const addStep = { ...pb, month1: [...pb.month1, { ...pb.month1[0], id: "m1.selftest.new_step" }] };
    const steps = JSON.parse(rd(`${SOP}/steps/steps.json`));
    const man = rd("netlify/functions/_job-manifest.js");
    const firstJob = /\{\s*job:\s*"([^"]+)"/.exec(man)[1];
    const named = [...codeTables(fsOf(SITE)).keys()];
    const at = (t, rel) => path.join(t, SOP, rel);
    const cases = [
      ["a playbook step the steps data lacks", { "data/playbooks/playbooks.json": JSON.stringify(addStep) }, null, /m1\.selftest\.new_step .* is missing from the steps data/],
      ["a steps row for an id that no longer exists", {}, (t) => fs.writeFileSync(at(t, "steps/steps.json"), JSON.stringify([...steps, { ...steps[0], id: "m1.selftest.gone" }])), /names m1\.selftest\.gone, which no longer exists/],
      ["a new scheduled job", { "netlify/functions/_job-manifest.js": man.replace(`job: "${firstJob}"`, `job: "${firstJob}" }, { job: "selftest-new-job"`) }, null, /scheduled job selftest-new-job .* missing from the checkers schedule/],
      ["an approved area without its URL", {}, (t) => { const j = JSON.parse(fs.readFileSync(at(t, "index.json"), "utf8")); j.areas.find((a) => a.id === "steps").artifact_url = null; fs.writeFileSync(at(t, "index.json"), JSON.stringify(j)); }, /"steps" is APPROVED but has no artifact URL/],
      ["a data edit without a rebuild", {}, (t) => fs.appendFileSync(at(t, "integrations/integrations.md"), "\nselftest edit\n"), /SOP\.md is out of date with its data|SOP\.md was built from other data/],
      ["a table missing from the database area", {}, (t) => { fs.mkdirSync(at(t, "database"), { recursive: true }); fs.writeFileSync(at(t, "database/db.json"), JSON.stringify({ tables: named.slice(1).map((name) => ({ name })) })); }, new RegExp(`Supabase table ${named[0]} .* has no entry in the database area`)],
      ["a data file back in reports/master-audit", {}, (t) => fs.writeFileSync(path.join(t, "reports/master-audit/steps.json"), "[]"), /reports\/master-audit\/ holds steps\.json/],
      ["the /docs/* block removed", { "netlify.toml": rd("netlify.toml").replace('from = "/docs/*"', 'from = "/docs-old/*"') }, null, /no longer answers \/docs\/\* with a forced 404/],
    ];
    const missed = [];
    for (const [name, over, plant, want] of cases) {
      const t = fs.mkdtempSync(path.join(os.tmpdir(), "master-sop-case-"));
      try {
        fs.cpSync(tmp, t, { recursive: true });
        if (plant) plant(t);
        const { P } = await checkTree(fsOf(t, over, SITE), { sopRoot: t, label: "selftest" });
        if (!P.some((m) => want.test(m))) missed.push(`${name} (got: ${P[0] || "no failure"})`);
      } finally { fs.rmSync(t, { recursive: true, force: true }); }
    }
    return missed.length ? `the rules missed ${missed.length} planted defect(s): ${missed.join(" | ")}` : null;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────────
try {
  if (AGAINST) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "master-sop-rev-"));
    try {
      const top = execFileSync("git", ["-C", GIT_SITE, "ls-tree", "--name-only", AGAINST], { encoding: "utf8" }).split("\n").filter(Boolean);
      const want = ["docs", "data", "netlify", "netlify.toml", "shared", "admin", "portal", "scripts"].filter((p) => top.includes(p));
      const tar = execFileSync("git", ["-C", GIT_SITE, "archive", AGAINST, ...want, ...(execFileSync("git", ["-C", GIT_SITE, "ls-tree", "-d", "--name-only", AGAINST, "reports/"], { encoding: "utf8" }).includes("reports/master-audit") ? ["reports/master-audit"] : [])], { maxBuffer: 1024 * 1024 * 1024 });
      execFileSync("tar", ["-x", "-C", dir], { input: tar, maxBuffer: 1024 * 1024 * 1024 });
      // the artifact copies an area points to (e.g. reports/mockups/tier3_best_in_class_v1.html) are inputs of the build too
      let ix = null; try { ix = JSON.parse(fs.readFileSync(path.join(dir, SOP, "index.json"), "utf8")); } catch { ix = null; }
      for (const a of (ix && ix.areas) || []) if (a.artifact_file) {
        try { const body = execFileSync("git", ["-C", GIT_SITE, "show", `${AGAINST}:${a.artifact_file}`], { maxBuffer: 256 * 1024 * 1024 });
          fs.mkdirSync(path.dirname(path.join(dir, a.artifact_file)), { recursive: true }); fs.writeFileSync(path.join(dir, a.artifact_file), body); } catch { /* absent at that revision: the index rule says so */ }
      }
    } catch (e) { indeterminate(`can't read revision ${AGAINST} of the website (${String(e.message).slice(0, 120)})`); }
    const r = await checkTree(fsOf(dir), { sopRoot: dir, label: `before(${AGAINST})`, strictMissing: true });
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(r.P.length ? `✗ ${AGAINST}: ${r.P.length} problem(s) (a revision before the SOP, so failing is correct)\n${r.P.slice(0, 30).map((x) => "  · " + x).join("\n")}` : `✓ ${AGAINST} passes`);
    process.exit(r.P.length ? 1 : 0);
  }
  const r = await checkTree(fsOf(SITE));
  if (r.missing) indeterminate(`${SITE}/${SOP}/index.json does not exist: the Master SOP is not on this checkout yet (website branch master-sop not merged), so there is nothing to hold`);
  if (r.P.length) { console.log(`✗ check-master-sop-is-current: ${r.P.length} problem(s)\n${r.P.map((x) => "  · " + x).join("\n")}`); process.exit(1); }
  if (!ARGV.includes("--no-selftest")) { const why = await selfTest(); if (why) indeterminate(`the self-test failed, so a green here proves nothing: ${why}`); }
  console.log(`✓ check-master-sop-is-current holds: ${r.areas} areas; steps data = the playbook + managed + closing list + stages; every scheduled job in the checkers schedule; ${r.tablesNote}; SOP.md, index.html, chapters.json current; data in one place; /docs/* is 404${ARGV.includes("--no-selftest") ? "" : "; 8/8 planted defects caught"}`);
  process.exit(0);
} catch (e) { indeterminate(`the gate threw: ${String(e && e.stack || e).slice(0, 400)}`); }
