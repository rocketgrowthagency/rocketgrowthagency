#!/usr/bin/env node
// check-the-sale-and-the-name-stay-gone.mjs — the public site states real prices, one plan, and no owner's name (approved pricing_page_v2, 10-31).
// 🔴 WHY: an open-ended "50% off" outlasted list prices nobody actively sold (California B&P 17501, 16 CFR 233.1, 233.5); "commit 3 months" contradicted a contract that says no lock-in;
// Google retired GBP Q&A on Nov 3, 2025 while the site still sold it; and Chris works at a company, so his name stays off everything public (feedback_no_personal_name_on_public_site).
// HOLDS: the owner's name in no served file (v/ excluded, stated below); no sale, struck price or unbacked comparison on any public page; pricing and home carry the exact approved line, the refund's condition and the founding terms; the offer file has no "was";
// the contract's retired plan is refused and the founding cap really stops; no public page names him; Q&A is not sold; the drip is on hold; the internal playbook is blocked.
// Files only. Exit 0 = holds · 1 = it came back · 2 = moved (indeterminate). → project_additions_map
import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.SCRAPER_COPY_DIR ? path.join(process.env.SCRAPER_COPY_DIR, "scripts") : HERE;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
// 11-11 (master plans-and-emails decision 5): the approved line names both offers; check-one-price-everywhere derives the first sentence from the offer file
const LINE = "First 5 clients: $625 a month, no setup fee. After that: $1,250 to start, then $625. Standard plan: stay 3 months for $2,500 total, and cancel anytime with 30 days' notice.";

let files;
try { files = execFileSync("git", ["-C", SITE, "ls-files", "*.html"], { encoding: "utf8", maxBuffer: 1e8 }).split("\n").filter(Boolean); }
catch {   // a suite's copy of the site isn't a git repo
  const walk = (d) => fs.readdirSync(`${SITE}/${d}`, { withFileTypes: true }).flatMap((e) => { const r = d ? `${d}/${e.name}` : e.name; return e.isDirectory() ? walk(r) : e.name.endsWith(".html") ? [r] : []; });
  files = walk("");
}
const NOT_PUBLIC = /^(reports|docs|research_notes|tests|supabase|scripts|netlify|admin|portal|new-client-playbook|_site-snapshots|\.claude|\.github)\/|^(mockup|preview)-/;
const pub = files.filter((f) => !NOT_PUBLIC.test(f));
if (pub.length < 200) { console.error(`⚠️  INDETERMINATE — only ${pub.length} public pages found`); process.exit(2); }
const SALE = [[/class="promo-bar"/, "the promo bar"], [/Limited-time/i, "Limited-time"], [/50% ?off/i, "50% off"], [/Most Popular/, "Most Popular"], [/Half the price/i, "Half the price"], [/same work/i, "same work"], [/Typical agency/i, "Typical agency"], [/twelve-month contract/i, "twelve-month contract"], [/Commit 3 months|Commit to three|Committing to three/i, "a commitment that doesn't exist"], [/leave anytime/i, "leave anytime"], [/no notice period/i, "no notice period"], [/No contracts? /, "No contract"], [/\$1,875|\$3,750|\$5,190/, "a retired figure"], [/<s\b[^>]*>\s*\$[\d,]+/, "a struck price"], [/class="was"/, "a was price"], [/Only \d+ client spots/i, "made-up scarcity"]];
const NAME = /\bChris\b|\bChristopher\b/;
const QA = /Q&(?:amp;)?A/;
for (const f of pub) {
  const raw = fs.readFileSync(`${SITE}/${f}`, "utf8");
  const s = raw.replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  for (const [re, what] of SALE) if (re.test(s)) fail(`${f}: ${what}`);
  // v/ pages are prospects' own business names ("Chris' Pro Wash"), not the owner's
  if (!f.startsWith("v/") && NAME.test(raw)) fail(`${f} names the owner`);
  if (QA.test(s.replace(/<p class="bp-update">[\s\S]*?<\/p>/, ""))) fail(`${f} still sells Google Q&A, which Google retired`);
}
// 🔒 THE OWNER'S NAME IN ANY SERVED FILE (website_audit_v1_v2 rows 4, 10, 11, 10-31). `publish = "."` serves more than pages: style.css, script.js, admin/*, portal/*, shared/* and data/* can all be read by anyone, comments included.
// STATED EXCLUSIONS: v/ (video is parked and out of scope; those pages also hold prospects' own names), whatever netlify.toml blocks at the edge, and netlify.toml itself (Netlify doesn't serve it: 404 live, 10-31).
// The one allowed token: the towns "Christopher" and "Christopher Creek" in data/us-places.json.
const TOML = read("netlify.toml");
const BLOCKED = [...TOML.matchAll(/\[\[redirects\]\][^[]*?from = "([^"]+)"[^[]*?status = 404\s*\n\s*force = true/g)].map((m) => m[1]).filter((b) => !b.startsWith("/v/"));
const isBlocked = (f) => BLOCKED.some((b) => (b.endsWith("*") ? `/${f}`.startsWith(b.slice(0, -1)) : `/${f}` === b));
const TEXT = /\.(js|mjs|css|html|json|xml|txt|svg|webmanifest|md)$/;
let tracked;
try { tracked = execFileSync("git", ["-C", SITE, "ls-files"], { encoding: "utf8", maxBuffer: 1e9 }).split("\n").filter(Boolean); }
catch { const w = (d) => fs.readdirSync(`${SITE}/${d}`, { withFileTypes: true }).flatMap((e) => { const r = d ? `${d}/${e.name}` : e.name; if (r === "v" || r === "node_modules" || r === "__scraper" || e.name.startsWith(".")) return []; return e.isDirectory() ? w(r) : [r]; }); tracked = w(""); }
const served = tracked.filter((f) => !f.startsWith("v/") && !f.startsWith(".") && f !== "netlify.toml" && TEXT.test(f) && !isBlocked(f) && fs.existsSync(`${SITE}/${f}`));
if (served.length < 250) { console.error(`⚠️  INDETERMINATE — only ${served.length} served files found`); process.exit(2); }
const OWNER = /\bchris\b|\bchristopher\b|kapranos/i;
for (const f of served) {
  let s = fs.readFileSync(`${SITE}/${f}`, "utf8");
  if (f === "data/us-places.json") s = s.replace(/\["Christopher(?: Creek)?","[A-Z]{2}"\]/g, "");
  if (OWNER.test(s)) { const i = s.search(OWNER); fail(`${f} names the owner: "${s.slice(Math.max(0, i - 40), i + 30).replace(/\s+/g, " ")}"`); }
}
if (/"Chris"/.test(read("netlify/functions/_fga-report-builder.js"))) fail("the audit follow-up to a prospect is signed with the owner's name");
if (!/<div class="rga-signature-name">Rocket Growth Agency<\/div>/.test(read("shared/contract-doc.js")) || !/Authorized signatory<br>Date:/.test(read("shared/contract-doc.js"))) fail("the contract's signature block no longer signs as the company");

const P = read("pricing/index.html"), H = read("index.html"), SG = read("start-growth-plan/index.html");
for (const [n, s] of [["pricing", P], ["home", H]]) {
  if (!s.includes(LINE)) fail(`${n} lost the approved price line`);
  if (!/aren't delivered within 30 days of signing and your first payment, your \$1,250 is refunded on request\. Late access moves that date by the same number of days\./.test(s)) fail(`${n}: the refund's condition isn't beside it`);
  if (!/Be one of our first 5/.test(s) || !/A review of RGA is never part of the deal, and your price never depends on one\./.test(s)) fail(`${n} lost the founding terms`);
}
if (!SG.includes(LINE)) fail("the checkout page lost the approved price line");
const OFFER = JSON.parse(read("data/offer-pricing.json"));
if (OFFER.offer?.active !== false) fail("the offer file says a sale is on");
if (Object.values(OFFER.prices || {}).some((p) => "was" in p)) fail("the offer file has a was price");
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const C = req("./contract-generate.js"), CS = read("netlify/functions/contract-generate.js"), PJ = JSON.parse(read("data/plans.json")), AJ = read("admin/admin.js");
if (!C.PLANS.monthly?.retired || !PJ.monthly?.retired) fail("the $1,875 plan isn't retired in both the contract and its mirror");
if (!/if \(PLANS\[plan_code\]\.retired\) return json\(400/.test(CS)) fail("a new agreement can still use a retired plan");
if (C.PLANS.commit_3mo.schedule.map((r) => r.amount).join() !== "1250,625,625") fail("the plan no longer bills 1250, 625, 625");
if (C.firstInvoiceAmount("commit_3mo") !== 1250) fail("the charge isn't the shown price");
if (!/j\[k\] && !j\[k\]\.retired/.test(AJ)) fail("admin's picker still offers a retired plan");
if (C.FOUNDING_CAP !== 5) fail("the founding cap isn't 5");
// master audit #9 item 6 (11-11): a place is a SIGNED founding agreement; one sent and never signed (or expired) holds none
const rows = Array.from({ length: 5 }, (_, i) => ({ client_id: `c${i}`, status: "signed" }));
if (C.foundingPlacesTaken(rows, []) !== 5) fail("five founding clients aren't counted as five");
if (C.foundingPlacesTaken([...rows, { client_id: "c0", status: "signed" }], []) !== 5) fail("one client with two agreements takes two places");
if (C.foundingPlacesTaken([{ client_id: "x", status: "voided" }], []) !== 0) fail("a voided agreement takes a place");
if (C.foundingPlacesTaken([{ client_id: "s", status: "sent" }, { client_id: "e", status: "expired" }, { client_id: "d", status: "draft" }], []) !== 0) fail("an agreement sent and never signed (or expired) takes a place");
if (C.foundingPlacesTaken([{ client_id: "t", status: "signed" }], ["t"]) !== 0) fail("a test record takes a place");
if (!/if \(taken >= FOUNDING_CAP\) return json\(409/.test(CS)) fail("a 6th founding agreement isn't refused");
if (!/catch \{ return json\(503/.test(CS)) fail("an unreadable count doesn't stop a founding agreement");
if (!/!ctx\.addons\.data_consent \? ""/.test(CS)) fail("the data clause isn't conditional on the client agreeing");
if (/\/questions`/.test(read("netlify/functions/v2-push-gbp-content.js")) || /v2PushQABtn/.test(read("admin/index.html"))) fail("admin can still push Q&A to a retired Google API");
// the content generator is deleted (approved content-AI decision, 11-11: fe418a02), so the rule is now wider: NO function writes Q&A
{ const FN = `${SITE}/netlify/functions`, qa = fs.readdirSync(FN).filter((f) => f.endsWith(".js") && /gbp_qa/.test(fs.readFileSync(`${FN}/${f}`, "utf8")));
  if (qa.length) fail(`a function writes Q&A again: ${qa.join(", ")}`); }
if (!/from = "\/new-client-playbook\/\*"/.test(read("netlify.toml"))) fail("the internal playbook isn't blocked at the edge");
for (const f of ["drip-content.sh", "blog-engine-cron.sh"]) {
  let s = ""; try { s = fs.readFileSync(path.join(DIR, f), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — ${f} moved`); process.exit(2); }
  if (!/if \[ -z "\$\{RGA_ALLOW_TEMPLATE_DRIP:-\}" \]; then echo "HOLD[^\n]*exit 0; fi/.test(s)) fail(`${f}: the hold is gone, so template posts can publish and deploy by themselves`);
}
if (F.length) { console.error(`🔴 the sale, the name or a retired promise came back — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ ${pub.length} public pages: no sale, no struck price, no Q&A; ${served.length} served files without the owner's name (v/ excluded); one plan with the approved line, the refund's condition and the founding terms; the cap stops at 5; the drip is on hold`);
