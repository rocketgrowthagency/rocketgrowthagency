#!/usr/bin/env node
// check-internal-files-are-not-public.mjs — everything in the website repo is either meant for the public or blocked at the edge.
//
// 🔴 WHY (found 10-31 by the dormant-code audit, confirmed by comparing live content with the files). `publish = "."` serves the whole
// repo, so CLAUDE.md, scripts/, supabase/*.sql and netlify/functions/*.js (contract-generate.js, _auth.js) were readable by anyone. No key
// was in them. reports/ had the same hole on 08-31 and data/playbooks before that: blocking one folder at a time keeps missing the next.
// So: every top-level name in git has to be on one list or the other, and a new one fails here until someone decides.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const REAL = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const toml = fs.readFileSync(`${SITE}/netlify.toml`, "utf8");
const fail = [];
const blocked = new Set([...toml.matchAll(/\[\[redirects\]\][^[]*?from = "([^"]+)"[^[]*?status = 404\s*\n\s*force = true/g)].map((m) => m[1]));
const MUST_BLOCK = ["/data/playbooks/what-it-does.json", "/netlify/*", "/scripts/*", "/supabase/*", "/research_notes/*", "/tests/*", "/docs/*", "/reports/*", "/.claude/*", "/.githooks/*", "/CLAUDE.md", "/PROJECT_CONTEXT.md", "/RGA-ASSET-GUARDRAILS.md", "/.github/*", "/.vscode/*", "/package.json", "/package-lock.json", "/stylelint.config.js", "/data/playbooks/playbooks.json", "/data/rga-admin-logins.json", "/data/client-facts.json", "/data/geography-models.json", "/data/outreach-verticals.json", "/data/playbooks/mature.json", "/_site-snapshots/*"];
for (const b of MUST_BLOCK) if (!blocked.has(b)) fail.push(`${b} isn't blocked at the edge`);
// the public side, decided by name
const PUBLIC = new Set(process.env.PUBLIC_NAMES ? process.env.PUBLIC_NAMES.split(",") : []);
const IS_PUBLIC = (n) => PUBLIC.has(n) || /\.(html|css|js|xml|txt|ico|png|jpe?g|svg|webp|webmanifest)$/.test(n) && n !== "stylelint.config.js";
const PUBLIC_DIRS = ["walkthrough-expired", "v", "images", "blog", "local-seo", "industries", "shared", "data", "admin", "portal", "services", "vendor", "free-growth-audit", "terms", "client-login", "contact", "faq", "app", "demo", "state-of-local-seo", "start-growth-plan", "process", "privacy", "pricing", "about", "how-we-test", "corrections"];
const names = process.env.REPO_NAMES ? process.env.REPO_NAMES.split(",") : [...new Set(execFileSync("git", ["-C", REAL, "ls-files"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean).map((f) => f.split("/")[0]))];
const SERVER_ONLY = new Set(["netlify.toml", ".gitignore", ".stylelintrc", ".netlifyignore", ".nvmrc", "_redirects", "_headers"]);
for (const n of names) {
  if (SERVER_ONLY.has(n) || IS_PUBLIC(n) || PUBLIC_DIRS.includes(n)) continue;
  if (blocked.has(`/${n}/*`) || blocked.has(`/${n}`) || /^mockup-/.test(n) && blocked.has("/mockup-*") || /^preview-/.test(n) && blocked.has("/preview-*")) continue;
  fail.push(`"${n}" is in the repo and is neither public by decision nor blocked: add it to netlify.toml, or to this gate's public list`);
}
// 🔴 THE CLASS BELOW THE TOP LEVEL (11-01): data/playbooks/what-it-does.json was added and served 200 publicly, because data/ is a
// "public by decision" folder and netlify.toml blocks its files one at a time. Every file under data/ is now either blocked at the edge
// or actually fetched by browser code (admin/, portal/, shared/, script.js, public html). A file that is neither fails here. A file that is
// BOTH blocked and fetched fails too: the block would break the page that reads it. Functions read these by require(), which a block
// does not affect, so "not fetched by a browser" means "block it".
const SKIPPED_DIRS = /^(node_modules|\.git|\.claude|\.netlify|netlify|scripts|supabase|reports|docs|tests|v|images|_site-snapshots|research_notes|data)$/;
const walk = (rel, out = []) => {
  let es; try { es = fs.readdirSync(`${SITE}/${rel}`, { withFileTypes: true }); } catch { return out; }
  for (const e of es) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) { if (!SKIPPED_DIRS.test(e.name)) walk(r, out); } else out.push(r); }
  return out;
};
const dataFiles = [];
const walkData = (rel) => { for (const e of fs.readdirSync(`${SITE}/${rel}`, { withFileTypes: true })) { const r = `${rel}/${e.name}`; if (e.isDirectory()) walkData(r); else dataFiles.push(r); } };
try { walkData("data"); } catch { console.error(`⚠️  INDETERMINATE: no data/ folder in ${SITE}`); process.exit(2); }
const browserSrc = walk("").filter((f) => /\.(js|html)$/.test(f) && (/^(admin|portal|shared)\//.test(f) || !f.includes("/") || /\.html$/.test(f)) && !/^(mockup-|preview-)/.test(f));
const code = browserSrc.map((f) => fs.readFileSync(`${SITE}/${f}`, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join("\n")).join("\n");
const unfetched = [], both = [];
for (const f of dataFiles) {
  if (!/\.json$/.test(f)) { fail.push(`${f} is a non-JSON file under data/: decide whether it is public`); continue; }
  const url = `/${f}`;
  const isBlocked = blocked.has(url) || blocked.has("/data/*");
  const esc = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fetched = new RegExp(`["'\`]/?${esc}["'\`?#]`).test(code);
  if (isBlocked && fetched) both.push(url);
  else if (!isBlocked && !fetched) unfetched.push(url);
}
for (const u of unfetched) fail.push(`${u} is served publicly but no browser code fetches it: add a 404 block in netlify.toml (functions read it by require, which a block does not affect)`);
for (const u of both) fail.push(`${u} is blocked at the edge AND fetched by browser code: the page that reads it breaks`);
console.log(`data/: ${dataFiles.length} files, ${dataFiles.length - unfetched.length - both.length} accounted for (blocked or fetched), ${unfetched.length} public-but-unfetched, ${both.length} blocked-and-fetched`);
if (/from = "\/\.netlify/.test(toml)) fail.push("a block touches /.netlify/, where the functions run");
if (fail.length) { console.error(`🔴 internal files can reach the public site:\n${fail.map((f) => `   · ${f}`).join("\n")}`); process.exit(1); }
console.log(`✅ every top-level name in the repo is public by decision or blocked at the edge (${blocked.size} blocks)`);
