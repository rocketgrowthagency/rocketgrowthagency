#!/usr/bin/env node
// check-the-contract-promises-only-what-the-code-does.mjs — the scope section of the agreement names work the system really does.
// 🔴 FOUND 10-31 (research + audit): the contract promised 50+ directories (13 in code), 30+ manual submissions (the same 13), a 9×9 grid on 3 keywords (5×5, 1 keyword,
// parked), automated SMS/email outreach (a request the client sends from their own phone), monthly blog content (not built), Q&A management (no code) and read-only access
// including YouTube (no YouTube; the profile scope can write). Section 6 commits to deliverables, so the no-guarantee clause doesn't cover them. Public pages: a "60-day guarantee"
// with no terms, a double price in the meta description. Chris approved the rewrite 10-31.
// HOLDS: none of those promises is back; the citation list in the contract is the real list (_citation-directories.js), name for name; the prices in the meta description are the page's own.
// Files only. Exit 0 = holds · 1 = a promise the code can't keep · 2 = moved (indeterminate). → project_growth_plan_backlinks · project_audit_2026-10-31
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const C = read("netlify/functions/contract-generate.js"), PR = read("pricing/index.html"), H = read("index.html");
const F = [], fail = (m) => F.push(m);
const scopeAt = C.indexOf("function buildScopeSection");
if (scopeAt < 0) { console.error("⚠️  INDETERMINATE — buildScopeSection moved"); process.exit(2); }
for (const [re, why] of [
  [/\b(?:50|30|100)\+/, "a directory count the 13-directory list can't meet"],
  [/9\s*[×x]\s*9/, "a 9×9 grid (the scan is 5×5)"],
  [/\b(?:3|three) keywords\b/i, "3 keywords on the grid (it tracks the main keyword)"],
  [/Q&(?:amp;)?A management/i, "Q&A management (there's no code for it)"],
  [/automated (?:SMS|text|email)/i, "automated outreach (the client sends the request from their own phone)"],
  [/template SMS\/email sequences/i, "SMS and email sequences (it's one ready-to-send request)"],
  [/YouTube/, "YouTube access (no YouTube connection exists)"],
  [/monthly blog/i, "monthly blog content (not built)"],
]) if (re.test(C)) fail(`the contract promises ${why}`);
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let real;
try { real = req("./_citation-directories.js").CITATION_DIRECTORIES.map((d) => d.source); } catch { console.error("⚠️  INDETERMINATE — the citation list can't be read"); process.exit(2); }
const list = (C.match(/RGA's core list: ([^<]+?), where they apply/) || [])[1];
if (!list) fail("the citation line no longer names the core list");
else {
  const named = list.replace(/ and /g, ", ").split(/,\s*/).map((x) => x.trim()).map((x) => (x === "Angi" ? "Angie" : x));   // Angi is the brand's name; the code's label says Angie
  const miss = real.filter((x) => !named.includes(x)), extra = named.filter((x) => !real.includes(x));
  if (miss.length) fail(`the contract leaves out directories the code works: ${miss.join(", ")}`);
  if (extra.length) fail(`the contract names directories the code doesn't work: ${extra.join(", ")}`);
}
if (!/read-only access to Client's Google Analytics 4 and Google Search Console/.test(C) || !/manage access to Client's Google Business Profile/.test(C)) fail("the Google access line doesn't say read-only for GA4 + Search Console and manage for the profile");
if (!/a ready-to-send personal request that Client sends from their own phone/.test(C)) fail("the review line no longer says the client sends the request");
for (const [name, page] of [["pricing", PR], ["home", H]]) if (/60-day/.test(page)) fail(`the ${name} page mentions a 60-day guarantee with no terms`);
const meta = (PR.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
if (!meta) fail("the pricing page has no meta description");
if (/\$2,500|\$1,250\/mo/.test(meta)) fail("the pricing description shows a price the page doesn't charge");
if (!/\$1,250/.test(meta) || !/\$625/.test(meta)) fail("the pricing description doesn't show the page's own prices");
if (F.length) { console.error(`🔴 the agreement or a public page promises more than the code does:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ the agreement promises only what the code does: the ${real.length} directories match the real list, one keyword on the grid, the client sends the review request, no Q&A, no YouTube, no blog, no 60-day claim`);
