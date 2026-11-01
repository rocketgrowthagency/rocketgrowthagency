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
const MUST_BLOCK = ["/netlify/*", "/scripts/*", "/supabase/*", "/research_notes/*", "/tests/*", "/docs/*", "/reports/*", "/.claude/*", "/.githooks/*", "/CLAUDE.md", "/PROJECT_CONTEXT.md", "/RGA-ASSET-GUARDRAILS.md", "/.github/*", "/.vscode/*", "/package.json", "/package-lock.json", "/stylelint.config.js", "/data/playbooks/playbooks.json", "/data/rga-admin-logins.json", "/data/client-facts.json", "/data/geography-models.json", "/data/outreach-verticals.json", "/data/playbooks/mature.json", "/_site-snapshots/*"];
for (const b of MUST_BLOCK) if (!blocked.has(b)) fail.push(`${b} isn't blocked at the edge`);
// the public side, decided by name
const PUBLIC = new Set(process.env.PUBLIC_NAMES ? process.env.PUBLIC_NAMES.split(",") : []);
const IS_PUBLIC = (n) => PUBLIC.has(n) || /\.(html|css|js|xml|txt|ico|png|jpe?g|svg|webp|webmanifest)$/.test(n) && n !== "stylelint.config.js";
const PUBLIC_DIRS = ["v", "images", "blog", "local-seo", "industries", "shared", "data", "admin", "portal", "services", "vendor", "free-growth-audit", "terms", "client-login", "contact", "faq", "app", "demo", "state-of-local-seo", "start-growth-plan", "process", "privacy", "pricing", "about", "how-we-test", "corrections"];
const names = process.env.REPO_NAMES ? process.env.REPO_NAMES.split(",") : [...new Set(execFileSync("git", ["-C", REAL, "ls-files"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean).map((f) => f.split("/")[0]))];
const SERVER_ONLY = new Set(["netlify.toml", ".gitignore", ".stylelintrc", ".netlifyignore", ".nvmrc", "_redirects", "_headers"]);
for (const n of names) {
  if (SERVER_ONLY.has(n) || IS_PUBLIC(n) || PUBLIC_DIRS.includes(n)) continue;
  if (blocked.has(`/${n}/*`) || blocked.has(`/${n}`) || /^mockup-/.test(n) && blocked.has("/mockup-*") || /^preview-/.test(n) && blocked.has("/preview-*")) continue;
  fail.push(`"${n}" is in the repo and is neither public by decision nor blocked: add it to netlify.toml, or to this gate's public list`);
}
if (/from = "\/\.netlify/.test(toml)) fail.push("a block touches /.netlify/, where the functions run");
if (fail.length) { console.error(`🔴 internal files can reach the public site:\n${fail.map((f) => `   · ${f}`).join("\n")}`); process.exit(1); }
console.log(`✅ every top-level name in the repo is public by decision or blocked at the edge (${blocked.size} blocks)`);
