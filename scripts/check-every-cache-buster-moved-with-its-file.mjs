#!/usr/bin/env node
// check-every-cache-buster-moved-with-its-file.mjs — A CHANGED BROWSER FILE NEVER SHIPS UNDER ITS OLD ?v= (checkers build 11-11; master map
// approved by Chris). → memory feedback_a_stale_cache_buster_hides_the_whole_fix
//
// GUARDS: a fix to admin/, portal/ or shared/ reaches the browser. A browser (and Netlify's CDN) keeps a file by its URL, so a changed
// admin.js still loaded as admin.js?v=OLD shows the OLD code to everyone who had it, and the fix looks shipped while nobody sees it. Until
// 11-11 only playbook.js's ?v= was checked against its file.
// HOLDS: for every admin/ portal/ shared/ .js or .css file that differs from what is live (origin/main: in GitHub deploy mode a push to
// main IS the deploy), every reference to it in an HTML or JS file (src=, href=, import from, import()) carries a different ?v= than that
// same referencing file carried live. A file new since the deploy, or a reference new since the deploy, has nothing to compare with.
// --against=<rev> compares with another revision instead of origin/main (e.g. the commit before a build, to prove a bump was made).
// 🔑 SELF-PROVING: every run first runs the rule (scripts/lib/cache-buster.mjs, read from SCRAPER_COPY_DIR when set) on fixtures, where it
// must find exactly the one stale reference; else INDETERMINATE.
// Exit 0 = every changed file's ?v= moved · 1 = a stale ?v= (file and reference named) · 2 = INDETERMINATE (no git base, self-test failed).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const REAL_SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const lib = fs.existsSync(path.join(SCR, "scripts/lib/cache-buster.mjs")) ? path.join(SCR, "scripts/lib/cache-buster.mjs") : path.join(REAL, "scripts/lib/cache-buster.mjs");
const { staleRefs, refsIn } = await import(pathToFileURL(lib).href);
const SCOPE = (a) => /^(admin|portal|shared)\/[^]*\.(m?js|css)$/.test(a);

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const base = new Map([
    ["admin/index.html", `<link href="/admin/admin.css?v=20261110a"><script src="/admin/admin.js?v=20261110a"></script><script src="/shared/kit.js?v=1"></script>`],
    ["admin/admin.css", "a{}"], ["admin/admin.js", `import x from "/shared/one.js?v=7"; import("./two.js?v=2");`], ["shared/kit.js", "k1"], ["shared/one.js", "o1"], ["admin/two.js", "t1"],
    ["portal/index.html", `<script src="https://cdn.example/x.js?v=1"></script>`],
  ]);
  const cur = new Map([
    ["admin/index.html", `<link href="/admin/admin.css?v=20261110a"><script src="/admin/admin.js?v=20261111a"></script><script src="/shared/kit.js?v=1"></script><script src="/shared/new.js?v=1"></script>`],
    ["admin/admin.css", "a{color:red}"],   // changed, same ?v= → STALE (the one)
    ["admin/admin.js", `import x from "/shared/one.js?v=8"; import("./two.js?v=2");`],   // changed, ?v= moved → fine
    ["shared/kit.js", "k1"], ["shared/one.js", "o2"], ["admin/two.js", "t1"], ["shared/new.js", "n"],
    ["portal/index.html", `<script src="https://cdn.example/x.js?v=1"></script>`],
  ]);
  const got = staleRefs(base, cur, SCOPE).map((s) => `${s.from}>${s.asset}`).join(",");
  if (got !== "admin/index.html>admin/admin.css") idk(`self-test: the rule found [${got}], not exactly [admin/index.html>admin/admin.css]`);
  if (refsIn("admin/admin.js", `import("./two.js?v=2")`).map((r) => r.asset).join() !== "admin/two.js") idk("self-test: a relative import is not resolved against its file");
}

// ── the real check ───────────────────────────────────────────────────────────────────────────────────────────────────────
const arg = process.argv.find((a) => a.startsWith("--against="));
const GIT = fs.existsSync(path.join(SITE, ".git")) ? SITE : REAL_SITE;
const BASE = arg ? arg.slice(10) : "origin/main";
try { execFileSync("git", ["-C", GIT, "rev-parse", "--verify", "-q", `${BASE}^{commit}`], { stdio: "ignore" }); } catch { idk(`no git revision ${BASE} in ${GIT}`); }
const list = (dir) => { const out = []; const walk = (d) => { let es = []; try { es = fs.readdirSync(path.join(SITE, d), { withFileTypes: true }); } catch { return; } for (const e of es) { const r = `${d}/${e.name}`; if (e.isDirectory()) { if (!/node_modules/.test(e.name)) walk(r); } else if (/\.(html?|m?js|css)$/.test(e.name)) out.push(r); } }; walk(dir); return out; };
const paths = [...list("admin"), ...list("portal"), ...list("shared"), ...fs.readdirSync(SITE).filter((f) => /\.html?$/.test(f))];
if (paths.length < 20) idk(`only ${paths.length} admin/portal/shared files found under ${SITE}`);
const cur = new Map(paths.map((p) => { try { return [p, fs.readFileSync(path.join(SITE, p), "utf8")]; } catch { return [p, null]; } }));
// the live text of each, in one git process (cat-file --batch); a path absent at BASE is null
const base = new Map();
{
  const out = execFileSync("git", ["-C", GIT, "cat-file", "--batch"], { input: paths.map((p) => `${BASE}:${p}`).join("\n") + "\n", maxBuffer: 256 * 1024 * 1024 });
  let i = 0;
  for (const p of paths) {
    const nl = out.indexOf(10, i);
    const head = out.subarray(i, nl).toString();
    if (/ missing$/.test(head)) { base.set(p, null); i = nl + 1; continue; }
    const size = Number(head.split(" ")[2]);
    base.set(p, out.subarray(nl + 1, nl + 1 + size).toString("utf8"));
    i = nl + 1 + size + 1;
  }
}
const changed = paths.filter((p) => SCOPE(p) && base.get(p) != null && cur.get(p) != null && base.get(p) !== cur.get(p));
const stale = staleRefs(base, cur, SCOPE);
if (stale.length) {
  console.error(`🔴 ${stale.length} reference(s) still carry the ?v= that is live, though the file changed since (${BASE}): a browser keeps the old file`);
  for (const s of stale) console.error(`   · ${s.asset} changed; ${s.from} still loads it as ?v=${s.v}`);
  console.error("   Bump each ?v= (the date + a letter) in the same commit as the file.");
  process.exit(1);
}
console.log(`✅ every cache buster moved with its file: ${changed.length} admin/portal/shared file(s) differ from ${BASE}, and every reference to them carries a new ?v=`);
