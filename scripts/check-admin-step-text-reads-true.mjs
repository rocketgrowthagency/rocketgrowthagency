#!/usr/bin/env node
/**
 * check-admin-step-text-reads-true.mjs — what the SOP tells RGA's own operator matches the rules and what the system does.
 *
 * ─── WHY (2026-10-31, research_audit_v1) ─────────────────────────────────────────────────────────
 * Eight research notes compared the step text with Google's rules, the client's own copy and the code. The admin text had
 * fallen behind: invented numbers ("Most businesses miss 60%+", "~10% combined market share", "Goal: 30%+"), a four-touch SMS
 * and email cadence and "top 5 most-likely-to-review" while the client is told one reminder and most recent first (Google
 * doesn't allow selective asking), "Push hard" and review-count targets while the client's step counts asks, "absence means
 * ZERO" against the rule that an absence is never a value, a kickoff that collected a "Google Business Profile login" against
 * the no-password rule, a rename Apple made on April 14, 2026, FAQ text from 2023, an env var that doesn't exist, and
 * terminal commands in steps that have a button.
 *
 * 🔑 It reads the text in BOTH sources, month 2 too: check-sop-sources-agree compares month 1 only. And the runners that print
 * the same claims. → feedback_no_hardcoded_stats · feedback_an_absence_must_never_be_readable_as_a_value
 *
 * Exit 0 = the text reads true · 1 = a false line is back · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");

let pb, flow, dirs, admin, m1, m2;
try {
  // The SOP files import packages at the top. A mutation's throwaway copy has no node_modules of its own, so lend it the real one.
  if (process.env.SCRAPER_COPY_DIR && !fs.existsSync(`${SCRAPER}/node_modules`)) {
    fs.symlinkSync(path.resolve(HERE, "..", "node_modules"), `${SCRAPER}/node_modules`);
  }
  pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  dirs = fs.readFileSync(`${SITE}/netlify/functions/_citation-directories.js`, "utf8");
  admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  ({ month1: m1 } = await import(`${SCRAPER}/flow/playbooks/month1.mjs`));
  ({ month2plus: m2 } = await import(`${SCRAPER}/flow/playbooks/month2plus.mjs`));
} catch (e) { console.log(`⚠️  INDETERMINATE — cannot read the sources: ${e.message}`); process.exit(2); }

const admins = [...(pb.month1 || []), ...(pb.month2plus || [])].filter((s) => s && s.id);
if (admins.length < 50 || !Array.isArray(m1) || !Array.isArray(m2)) { console.log("⚠️  INDETERMINATE — too few steps read."); process.exit(2); }
const locals = [...m1, ...m2];

const fails = [];
const check = (ok, what) => { console.log(`  ${ok ? "✅" : "🔴"} ${what}`); if (!ok) fails.push(what); };

// ── 1. No step, in either source, carries these lines (titles and instructions; client-facing fields are not read here) ──
const BANNED = [
  [/\d+%\+/, "an unsourced percent target (60%+, 30%+)"],
  [/~\s?\d+%\s*(combined|market|of\b)/i, "an unsourced approximate share"],
  [/ranking opportunity/i, "a ranking claim with no source"],
  [/push hard/i, "pushing for a review count"],
  [/most[- ]likely[- ]to[- ]review/i, "picking who gets asked (Google's selective-ask ban)"],
  [/\bSMS_[12]\b|\bEMAIL_[12]\b|PHONE_SCRIPT/, "the old multi-touch cadence"],
  [/(goal|target):?\s*\d+\+?\s*(new )?reviews/i, "a review-count target"],
  [/\bAdd \d+\+/, "a monthly photo quota the client is told doesn't exist"],
  [/chris@/i, "a personal address where the invite goes to hello@"],
  [/means ZERO/i, "reading an absence as zero"],
  [/Business Connect\b(?! on)|businessconnect\.apple/i, "Apple's old name or address"],
  [/since 2023/i, "the 2023 FAQ rule; FAQ rich results ended May 7, 2026"],
  [/(?<!GOOGLE_)PAGESPEED_API_KEY/, "an env var that doesn't exist"],
  [/\bFix Core Web Vitals\b/i, "calling a measurement a fix"],
  [/Apply image SEO\. Upload to GBP|geotagged when possible/i, "advice with no evidence for Google uploads"],
  [/Google Business Profile login|CMS login/i, "asking for a login (RGA takes invites, never passwords)"],
  [/node (flow|gbp)\.mjs|node -e|lib\/gbp-automation/, "a terminal command in a step that has a button"],
  [/local machine/i, "saying a server step runs on the local machine"],
  [/approval to start Month 2|approved_month2/i, "asking approval for what the contract already continues"],
  [/\bcampaign above\b|Toggle ON every/i, "text saying RGA sends the asks or ticks for the client"],
];
// 🔒 Known and recorded: this one really does print a local scraper command until raw grid pins replace it. It isn't a words fix.
const STILL_LOCAL = new Set(["m2.snap.competitors"]);
const hits = [];
for (const [src, list] of [["playbooks.json", admins], ["flow/playbooks", locals]]) {
  for (const s of list) {
    const text = `${s.title || ""}\n${s.instructions || ""}`;
    for (const [rx, why] of BANNED) if (rx.test(text)) hits.push(`${src} ${s.id}: ${why}`);
    if (!STILL_LOCAL.has(s.id) && /run the scraper|step-1-maps-scraper/i.test(text)) hits.push(`${src} ${s.id}: "run the scraper"`);
  }
}
for (const h of hits) console.log(`     ${h}`);
check(!hits.length, `no false line in any step, either source (${admins.length} + ${locals.length} steps, ${BANNED.length} patterns)`);

// ── 2. The steps fixed here say the same words in both sources. Month 2 isn't compared anywhere else. ──
const FIXED = ["m1.access.gbp", "m1.kickoff.call", "m1.audit.nap_reviews", "m1.web.core_web_vitals", "m1.strategy.keywords_locations",
  "m1.gbp.optimize_categories", "m1.gbp.attributes", "m1.web.expanded_schema", "m1.platform.bing_apple", "m1.review.system",
  "m1.review.first_5", "m1.review.response", "m1.call.close", "m1.handoff.month2",
  "m2.exec.gbp_photos", "m2.exec.review_push", "m2.exec.gbp_attributes_refresh", "m2.call.monthly"];
const A = new Map(admins.map((s) => [s.id, s])), L = new Map(locals.map((s) => [s.id, s]));
const drift = FIXED.filter((id) => !A.has(id) || !L.has(id) || A.get(id).title !== L.get(id).title || A.get(id).instructions !== L.get(id).instructions);
if (drift.length) console.log(`     differ: ${drift.join(", ")}`);
check(!drift.length, `the ${FIXED.length} corrected steps read the same in playbooks.json and flow/playbooks`);

// ── 3. What the corrected steps must say, not only what they must not ──
const says = (id, rx, what) => check(rx.test(A.get(id)?.instructions || ""), `${id}: ${what}`);
says("m1.access.gbp", /hello@rocketgrowthagency\.com/, "the invite goes to hello@, matching the client's text");
says("m1.review.system", /one reminder after 3 days/i, "one ask and one reminder, matching the client's text");
says("m1.review.system", /RGA never sends/i, "the client sends, RGA doesn't");
says("m1.review.first_5", /5 asks sent/i, "it counts asks");
says("m2.exec.review_push", /no review-count target/i, "it has no review-count target");
says("m1.web.expanded_schema", /May 7, 2026/, "FAQ rich results ended, with the date");
says("m1.web.core_web_vitals", /GOOGLE_PAGESPEED_API_KEY/, "the env var that exists");
says("m1.platform.bing_apple", /business\.apple\.com/, "Apple Business's address");
says("m1.kickoff.call", /never a password/i, "an invite, never a password");

// ── 4. The runners print to the same operator ──
const inFlow = [
  [/Most businesses miss/i, "the attributes prompt's 60%+"],
  [/TARGET \(5\+|target_reviews/, "a review-count target in the monthly prompt or its record"],
  [/SMS_BATCH|48hr followup/, "the multi-touch SMS batch"],
  [/5 new reviews|4-step funnel|AFTER_5_LIVE/, "the review target in the first-5 prompt"],
  [/APPLE BUSINESS CONNECT|businessconnect\.apple|Apple Business Connect/, "Apple's old name or address in the Bing + Apple runner"],
  [/~15% of search/, "the unsourced share in the Bing + Apple runner"],
].filter(([rx]) => rx.test(flow)).map(([, w]) => w);
if (inFlow.length) console.log(`     ${inFlow.join(" · ")}`);
check(!inFlow.length, "flow-execute's runners don't print those claims either");
check(!/~\s?\d+%/.test(dirs), "_citation-directories.js states no unsourced share");
check(!/label: "[^"]*CMS login/.test(admin), "the kickoff console's list doesn't ask for a login");

console.log("");
if (fails.length) { console.error(`🔴 ${fails.length} false or drifted line(s) in the admin step text.`); process.exit(1); }
console.log("✅ the admin step text reads true, in both sources.");
process.exit(0);
