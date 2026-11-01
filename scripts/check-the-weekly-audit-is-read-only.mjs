#!/usr/bin/env node
// check-the-weekly-audit-is-read-only.mjs — the weekly audit session can read and nothing else (Chris 10-31: "we shoul drun this weekly").
// HOLDS: the session is given only Read, Grep, Glob and read-only git; write tools and the web are refused by name; it never skips permissions; the prompt says read-only and no secrets; only the script saves the report.
// Files only. Exit 0 = holds · 1 = the job can change something · 2 = moved (indeterminate). → project_audit_2026-10-31
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts") : HERE;
let sh, prompt;
try { sh = fs.readFileSync(path.join(DIR, "weekly-audit.sh"), "utf8"); prompt = fs.readFileSync(path.join(DIR, "weekly-audit-prompt.md"), "utf8"); }
catch { console.error("⚠️  INDETERMINATE — the weekly audit's files moved"); process.exit(2); }
const F = [];
const allowed = (sh.match(/--allowedTools ([^\n\\]+)/) || [])[1];
if (!allowed) { console.error("⚠️  INDETERMINATE — no --allowedTools line"); process.exit(2); }
const tools = [...allowed.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const OK = /^(Read|Grep|Glob|Bash\(git (log|show|diff|status):\*\))$/;
for (const t of tools) if (!OK.test(t)) F.push(`the session is given ${t}, which isn't read-only`);
const refused = (sh.match(/--disallowedTools ([^\n\\]+)/) || [])[1] || "";
for (const t of ["Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Agent"]) if (!refused.includes(`"${t}"`)) F.push(`${t} isn't refused by name`);
if (/dangerously|bypassPermissions|acceptEdits|--permission-mode/.test(sh)) F.push("the session's permission checks are loosened");
if (!/> "\$OUT\/audit\.md\.tmp"/.test(sh)) F.push("the script isn't what saves the report");
if (!/read-only/i.test(prompt) || !/Never print a secret value/.test(prompt)) F.push("the prompt no longer says read-only and no secrets");
if (F.length) { console.error(`🔴 the weekly audit can do more than read:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ the weekly audit can only read: Read, Grep, Glob and read-only git; write tools and the web refused by name; the script saves its report");
