#!/usr/bin/env node
// check-the-contract-promises-only-what-the-code-does.mjs — the scope section of the agreement names work the system really does.
// 🔴 FOUND 10-31 (research + audit): the contract promised 50+ directories (13 in code), 30+ manual submissions (the same 13), a 9×9 grid on 3 keywords (5×5, 1 keyword,
// parked), automated SMS/email outreach (a request the client sends from their own phone), monthly blog content (not built), Q&A management (no code) and read-only access
// including YouTube (no YouTube; the profile scope can write). Section 6 commits to deliverables, so the no-guarantee clause doesn't cover them. Public pages: a "60-day guarantee"
// with no terms, a double price in the meta description. Chris approved the rewrite 10-31.
// HOLDS: none of those promises is back; the citation list in the contract is the real list (_citation-directories.js), name for name; the prices in the meta description are the page's own.
// 11-02 (report_live_google_30_day_v2, approved): the contract and privacy page say Google Business Profile data is kept no more than 30 days, and neither offers to keep it longer.
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
  // contract_v2_redline §2 (10-31): Data Axle and Neustar Localeze have no API and were never shown done, so the contract doesn't promise them. Add them back once a vendor is chosen.
  const miss = real.filter((x) => !named.includes(x) && !["Data Axle", "Neustar Localeze"].includes(x)), extra = named.filter((x) => !real.includes(x));
  if (miss.length) fail(`the contract leaves out directories the code works: ${miss.join(", ")}`);
  if (extra.length) fail(`the contract names directories the code doesn't work: ${extra.join(", ")}`);
}
if (!/read-only access to Client's Google Analytics 4 and Google Search Console/.test(C) || !/manage access to Client's Google Business Profile/.test(C)) fail("the Google access line doesn't say read-only for GA4 + Search Console and manage for the profile");
// pricing_page_v2 (10-31): what the page says about refunds and founding clients is in the agreement, in words a client can hold us to
if (!/4A\. Setup Delivery Promise<\/h2>\s*<p>If RGA has not delivered the setup items[^<]*within thirty \(30\) days of the later of the Effective Date and Client's first payment[^<]*refund the Month 1 fee/.test(C)) fail("the page promises a setup refund the agreement doesn't carry");
if (!/No part of the price depends on Client leaving a review of RGA/.test(C)) fail("the founding terms can read as paying for a review");
if (!/There is no lock-in\./.test(C)) fail("the agreement no longer says there's no lock-in");
if (!/a ready-to-send personal request that Client sends from their own phone/.test(C)) fail("the review line no longer says the client sends the request");
// 🔴 NO LLC EXISTS YET (Chris 10-31): nothing a client signs, receives or pays may name one. When it's formed, change this rule along with the docs.
for (const f of ["netlify/functions/contract-generate.js", "shared/contract-doc.js", "shared/email-doc.js", "shared/invoice-doc.js"]) {
  const code = read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  if (/Rocket Growth Agency,? LLC|a limited liability company/.test(code)) fail(`${f} names an LLC that doesn't exist yet`);
}
if (/process\.env\.RGA_LEGAL_ENTITY/.test(C.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"))) fail("the contract can pick up an old LLC name from a Netlify setting");
// report_live_google_30_day_v2 (11-02): word for word, and no sentence beside them that offers to keep Google's figures longer
const GOOGLE_LINE = "Google Business Profile figures in your reports are read from Google when the report opens, as far back as Google makes them available. RGA keeps its copy of them for no more than 30 days. If you disconnect Google or end service, those figures can no longer be shown. Records of RGA's work, rankings RGA measures and leads RGA tracks are kept.";
const PRIVACY_LINE = "Data we receive through Google Business Profile APIs is kept for no more than 30 days.";
if (!C.includes(GOOGLE_LINE)) fail("the contract lost the approved line about Google figures");
const PV = read("privacy/index.html"), s6 = (PV.match(/<h2 id="s6">[\s\S]*?<h2 id="s7">/) || [])[0];
if (!s6) { console.error("⚠️  INDETERMINATE — the privacy page's Data Retention section moved"); process.exit(2); }
if (!s6.includes(`<p>${PRIVACY_LINE}</p>`)) fail("the privacy page's Data Retention section lost the 30-day line");
if (/copies of retrieved metrics/.test(PV)) fail("the privacy page says copies of every metric are kept to show change over time, Business Profile included");
const noComments = C.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (/(?:Google|GBP|Business Profile)[^.<]{0,60}\b(?:history|historical|indefinitely|permanently)\b/i.test(noComments)) fail("the contract offers to keep Google's history");
for (const [name, page] of [["pricing", PR], ["home", H]]) if (/60-day/.test(page)) fail(`the ${name} page mentions a 60-day guarantee with no terms`);
const meta = (PR.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
if (!meta) fail("the pricing page has no meta description");
if (/\$2,500|\$1,250\/mo/.test(meta)) fail("the pricing description shows a price the page doesn't charge");
if (!/\$1,250/.test(meta) || !/\$625/.test(meta)) fail("the pricing description doesn't show the page's own prices");
if (F.length) { console.error(`🔴 the agreement or a public page promises more than the code does:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ the agreement promises only what the code does: the ${real.length} directories match the real list, one keyword on the grid, the client sends the review request, no Q&A, no YouTube, no blog, no 60-day claim`);
