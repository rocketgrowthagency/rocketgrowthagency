#!/usr/bin/env node
// check-ai-search-checks.mjs — the "build now" parts of the approved AI search checks (reports/mockups/ai_search_checks_v1.html, 11-01).
//
// WHAT IT HOLDS
//  1. THE CRAWLER CHECK (_crawler-access.js, run by the monthly site audit): reads the robots file and noindex marks and reports a FACT with the page it
//     was found on. A robots file we could not read is "unreadable", never "nothing blocked"; no file at all (404) blocks nothing; an HTML page answering
//     for the robots address is not a robots file. A tie between Allow and Disallow goes to Allow. It promises nothing about any AI tool, and it is no score.
//  2. THE AUDIT REWRITE (ai-readiness-audit.js): no FAQ-schema line; the header carries no market-share figure; the weights lean on visible facts, not JSON-LD;
//     the score is admin-only and the client gets a list of facts, not a number; a check that did not run is never a "no".
//  3. THE YELP STEP: in both SOP sources, RGA's, a runner that only reads (citations_52_55_v1, 11-9), client-owned, never asks a customer for a Yelp review, makes no AI or ranking promise.
//  4. NOTHING ELSE: no readiness number in the client portal, no "visibility" or "invisible" claim in the new code.
// Runs the SHIPPED modules against fake pages: no network, no production data.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (r, root = SITE) => { try { return fs.readFileSync(`${root}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const req = createRequire(`${SITE}/netlify/functions/`);
let CA;
try { CA = req("./_crawler-access.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — _crawler-access.js did not load: ${e.message}`); process.exit(2); }
const res = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[String(k).toLowerCase()] ?? null }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => body });
const strip = (t) => t.replace(/^\s*\/\/.*$/gm, "");

// ── 1 · the crawler check ──
const origin = "https://acme.test";
const robotsOf = async (status, body) => CA.readRobots(origin, async () => res(status, body));
const pg = (path, o = {}) => ({ url: origin + path, status: 200, noindexBy: [], ...o });
{
  const all = [pg("/"), pg("/services/"), pg("/private/a")];
  const blockedHome = await robotsOf(200, "User-agent: *\nDisallow: /\n");
  let f = CA.crawlerFindings(blockedHome, origin, all);
  if (!f.issues.find((i) => i.id === "crawler.search_blocked")) fail("a robots file that blocks everything is not reported as blocking a search crawler");
  if (!/A person decides/.test(f.issues.find((i) => i.id === "crawler.search_blocked")?.why || "")) fail("the block finding doesn't say a person decides (a block is sometimes on purpose)");

  const some = await robotsOf(200, "User-agent: *\nDisallow: /private\n");
  f = CA.crawlerFindings(some, origin, all);
  const sp = f.issues.find((i) => i.id === "crawler.search_pages_blocked");
  if (!sp || !(sp.examples || []).some((e) => /\/private\/a/.test(e))) fail("a blocked section is not reported with the page it was found on");
  if (f.issues.find((i) => i.id === "crawler.search_blocked")) fail("a blocked section is reported as a whole-site block");

  const tie = await robotsOf(200, "User-agent: Googlebot\nDisallow: /\nAllow: /\n");
  if (CA.crawlerFindings(tie, origin, all).issues.length) fail("a tie between Allow and Disallow was not given to Allow");

  const own = await robotsOf(200, "User-agent: *\nDisallow: /\nUser-agent: Googlebot\nUser-agent: Bingbot\nAllow: /\n");
  f = CA.crawlerFindings(own, origin, all);
  if (f.search.length) fail("a crawler with its own group was judged by the '*' group");

  const ai = await robotsOf(200, "User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n");
  f = CA.crawlerFindings(ai, origin, all);
  if (f.search.length) fail("blocking only AI crawlers was reported as a search block");
  const ai1 = f.issues.find((i) => i.id === "crawler.ai_blocked");
  if (!ai1 || ai1.severity !== "low") fail("blocked AI crawlers are not a low-severity fact");
  if (/\b(rank|ranking|invisible|visibility|mentioned|recommend|lose|losing|cost)/i.test(ai1?.why || "")) fail("the AI crawler finding makes a claim about an AI result");

  // a file we could not read, or that is not a file, or that does not exist
  for (const [name, r, want] of [["500", await robotsOf(500, "oops"), "unreadable"], ["403", await robotsOf(403, "no"), "unreadable"], ["a home page answering for robots.txt", await robotsOf(200, "<!DOCTYPE html><html><body>Hi</body></html>"), "unreadable"], ["404", await robotsOf(404, "nope"), "none"], ["410", await robotsOf(410, "gone"), "none"]]) {
    if (r.status !== want) fail(`robots file answering ${name} was read as "${r.status}", not "${want}"`);
    if (CA.crawlerFindings(r, origin, all).issues.some((i) => /^crawler\.(search|ai)/.test(i.id))) fail(`robots file answering ${name} produced a block finding`);
  }
  if (CA.crawlerFindings({ status: "unreadable", groups: CA.parseRobots("User-agent: *\nDisallow: /") }, origin, all).issues.length) fail("a robots file marked unreadable was still judged");
  const boom = await CA.readRobots(origin, async () => { throw new Error("timeout"); });
  if (boom.status !== "unreadable") fail("a robots fetch that threw was not 'unreadable'");

  // noindex: either attribute order, unquoted, the header; and a page that did not answer is never judged
  if (!CA.noindexMark('<meta content="noindex, follow" name="robots">', "").length) fail("noindex with content before name was missed");
  if (!CA.noindexMark("<meta name=robots content=noindex>", "").length) fail("unquoted noindex was missed");
  if (!CA.noindexMark("<html>", "noindex, nofollow").length) fail("an X-Robots-Tag noindex was missed");
  if (CA.noindexMark('<meta name="viewport" content="noindex">', "").length) fail("noindex in an unrelated meta tag was counted");
  if (CA.noindexMark('<meta name="robots" content="index, follow">', "").length) fail("index,follow was read as noindex");
  const ni = CA.crawlerFindings({ status: "none", groups: [] }, origin, [pg("/services/", { noindexBy: ["meta robots"] }), pg("/x", { status: null, noindexBy: ["meta robots"] })]);
  const nix = ni.issues.find((i) => i.id === "crawler.noindex");
  if (!nix || nix.count !== 1 || !/\/services\//.test(nix.examples[0])) fail("a noindex page is not reported with its address, or a page that did not answer was judged");
  // a clean site reports nothing at all, and there is no score anywhere
  const clean = CA.crawlerFindings(await robotsOf(200, "User-agent: *\nDisallow: /wp-admin/\n"), origin, [pg("/"), pg("/a")]);
  if (clean.issues.length) fail("a clean robots file produced a finding");
  if (/score|rating|grade/i.test(JSON.stringify(clean))) fail("the crawler check carries a score");
}
// the monthly site audit runs it, and a site with no sitemap still gets it
{
  const OP = read("netlify/functions/site-onpage-audit-background.js");
  if (!/require\("\.\/_crawler-access"\)/.test(OP) || !/crawlerFindings\(robots, origin, pages\)/.test(OP)) fail("the monthly site audit doesn't run the crawler check");
  if (!/const partial = !!sitemapError;[^]*if \(partial\) urls = \[`\$\{origin\}\/`\];/.test(OP)) fail("a site with no sitemap loses the crawler check (it should check the home page and say the audit is partial)");
  if (!/x-robots-tag/i.test(OP)) fail("the monthly site audit doesn't read the X-Robots-Tag header");
  if (!/m2\.exec\.site_audit_recurring/.test(read("netlify/functions/flow-execute.js")) || !/site-onpage-audit-background/.test(read("netlify/functions/flow-execute.js"))) fail("the monthly site audit step no longer fires the on-page audit");
}

// ── 2 · the audit rewrite ──
{
  const SRC = read("netlify/functions/ai-readiness-audit.js");
  if (/faq_content|FAQPage|QAPage/.test(strip(SRC))) fail("the readiness audit still has a FAQ-schema line");
  if (/83\s*%|71\s*%|6%\s*→|\b45%|brightlocal_lcrs/i.test(SRC)) fail("the readiness audit's header still quotes the mislabeled figures");
  Object.assign(process.env, { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k", QUO_WEBHOOK_TOKEN: "t", INTERNAL_FN_SECRET: "t", GOOGLE_OAUTH_CLIENT_ID: "i", GOOGLE_OAUTH_CLIENT_SECRET: "s" });
  const run = async (client, html) => {
    globalThis.fetch = async (url) => {
      url = String(url);
      if (url.includes("/rest/v1/clients?")) return res(200, [client]);
      if (url.includes("/rest/v1/client_google_oauth")) return res(200, []);
      if (url.includes("/rest/v1/client_state_snapshots")) return res(201, "");
      return res(200, html);
    };
    const AI = req("./ai-readiness-audit.js");
    const out = await AI.handler({ headers: { "x-internal-secret": "t" }, queryStringParameters: { token: "t", clientId: "c1", dry: "1" } });
    return JSON.parse(out.body);
  };
  const page = (o) => `<html><body><h1>${o.name}</h1><p>Call ${o.phone}</p>${o.ld || ""}</body></html>`;
  const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", name: o.name, telephone: o.phone, sameAs: ["https://a.test", "https://b.test"] })}</script>`;
  // any business: names with an ampersand or apostrophe, a trade with no website schema, no Google connection
  const cases = [
    ["a plain site with schema", { business_name: "Acme Plumbing", website_url: "https://acme.test" }, page({ name: "Acme Plumbing", phone: "(555) 010-0199", ld: ld({ name: "Acme Plumbing", phone: "555-010-0199" }) }), { name: true, phone: null }],
    ["an ampersand in the name", { business_name: "Smith & Sons Roofing", website_url: "https://s.test" }, page({ name: "Smith &amp; Sons Roofing", phone: "555 010 0199" }), { name: true }],
    ["an apostrophe in the name", { business_name: "Joe's Diner", website_url: "https://j.test" }, page({ name: "Joe&#39;s Diner", phone: "555 010 0199" }), { name: true }],
    ["a name that is not on the page", { business_name: "Zed Dental", website_url: "https://z.test" }, page({ name: "Welcome", phone: "555 010 0199" }), { name: false }],
    ["no business name on the record", { website_url: "https://n.test" }, page({ name: "Welcome", phone: "555 010 0199" }), { name: null }],
  ];
  for (const [label, client, html, want] of cases) {
    const out = await run({ id: "c1", workspace_id: "w", ...client }, html);
    if (!out.ok) { fail(`${label}: the audit did not run (${out.error})`); continue; }
    const c = Object.fromEntries(out.checks.map((x) => [x.id, x]));
    if (c["ai.faq_content"]) fail(`${label}: the FAQ-schema check is back`);
    const sum = out.checks.reduce((a, x) => a + x.weight, 0);
    if (sum !== 20) fail(`${label}: the weights add to ${sum}, not 20`);
    const ldW = ["ai.schema_present", "ai.schema_parses", "ai.nap_matches_gbp", "ai.third_party_corroboration"].reduce((a, k) => a + (c[k]?.weight || 0), 0);
    if (ldW / sum > 0.6) fail(`${label}: ${ldW} of ${sum} points still rest on JSON-LD`);
    if (c["ai.name_in_text"]?.pass !== want.name) fail(`${label}: the visible-name check read ${c["ai.name_in_text"]?.pass}, wanted ${want.name}`);
    if (out.admin_only !== true) fail(`${label}: the score is not marked admin-only`);
    if (!Array.isArray(out.client_facts)) fail(`${label}: no list of facts for the client`);
    else {
      if (JSON.stringify(out.client_facts).match(/\d{2,3}\s*%|score|readiness/i)) fail(`${label}: the client's list carries a number or a score`);
      for (const x of out.client_facts) if (c[x.id]?.pass !== true) fail(`${label}: the client's list holds ${x.id}, which did not pass`);
    }
    if (c["ai.nap_matches_gbp"]?.pass !== null) fail(`${label}: with no Google connection the schema/listing check should be indeterminate, not ${c["ai.nap_matches_gbp"]?.pass}`);
  }
  // no website: nothing to audit, said plainly, no score invented
  const none = await run({ id: "c1", workspace_id: "w", business_name: "No Site Co" }, "");
  if (none.ok !== false || none.readiness_score != null) fail("a client with no website was given a result or a score");
  // unreachable site is not a pass
  globalThis.fetch = async (url) => { url = String(url); if (url.includes("/rest/v1/clients?")) return res(200, [{ id: "c1", workspace_id: "w", business_name: "X", website_url: "https://x.test" }]); if (url.includes("client_google_oauth")) return res(200, []); throw new Error("down"); };
  const down = JSON.parse((await req("./ai-readiness-audit.js").handler({ headers: { "x-internal-secret": "t" }, queryStringParameters: { token: "t", clientId: "c1", dry: "1" } })).body);
  if (down.ok !== false) fail("a site that could not be fetched produced a result");
}

// ── 3 · the Yelp step ──
{
  const PB = JSON.parse(read("data/playbooks/playbooks.json"));
  const ids = PB.month1.map((s) => s.id);
  const y = PB.month1.find((s) => s.id === "m1.platform.yelp");
  if (!y) fail("the Yelp step is not in playbooks.json");
  else {
    // 🔄 citations_52_55_v1 (approved 11-9): the step now has a runner that only READS (the details from Google, ready to paste); the claim
    // and the completing stay a person's, proven by reading the Yelp page. So: RGA's hybrid step, with a runner, and the runner never writes to Yelp.
    if (y.actor !== "rga" || y.type !== "hybrid" || y.hasRunner !== true) fail("the Yelp step should be RGA's hybrid step whose runner reads the details");
    if (!(y.dependsOn || []).includes("m1.gbp.business_facts")) fail("the Yelp step doesn't wait on the client-confirmed facts");
    if (!/client/i.test(y.instructions) || !/belongs to the client/i.test(y.instructions)) fail("the Yelp step doesn't say the profile is the client's");
    if (!/Never ask a customer for a Yelp review/.test(y.instructions)) fail("the Yelp step doesn't forbid asking a customer for a Yelp review");
    if (!/Never advertise on Yelp/.test(y.instructions)) fail("the Yelp step doesn't forbid advertising on Yelp");
    if (/appear in AI|AI answers? will|rank(ing)? (higher|number)|ChatGPT/i.test(y.instructions.replace(/it makes no promise about any AI tool or any ranking/i, ""))) fail("the Yelp step promises an AI result");
    if (/[—–]/.test(y.instructions)) fail("the Yelp step's copy has a dash");
    if (!/not AI work|profile hygiene/i.test(y.instructions)) fail("the Yelp step isn't called profile hygiene");
  }
  const M1 = read("flow/playbooks/month1.mjs", SCR);
  if (!/id: "m1\.platform\.yelp"/.test(M1)) fail("the Yelp step is missing from the canonical SOP");
  if (new Set(ids).size !== ids.length) fail("a step id is duplicated in playbooks.json");
  const FX = read("netlify/functions/flow-execute.js");
  // 🔄 citations_52_55_v1: the runner exists and only reads; nothing in it may write to Yelp or claim the page for the client
  { const i = FX.indexOf('"m1.platform.yelp": async'), body = i < 0 ? "" : FX.slice(i, FX.indexOf("\n  },", i));
    if (!body) fail("the Yelp step's reading runner is missing");
    if (/yelp\.com\/[^"'`]*(claim|signup)|method:\s*"(POST|PATCH|PUT)"/i.test(body)) fail("the Yelp step's runner writes to Yelp; the claim is a person's"); }
}

// ── 4 · nothing else ──
{
  for (const f of ["portal/portal.js", "portal/index.html"]) if (/readiness_score|ai\.name_in_text|client_facts/.test(read(f))) fail(`${f} draws the readiness score or its facts to a client; this build adds no client card`);
  for (const f of ["netlify/functions/_crawler-access.js"]) if (/\binvisible\b|AI visibility|visibility (score|up)|rank number one/i.test(strip(read(f)))) fail(`${f} makes a visibility claim`);
}

if (F.length) { console.error(`❌ ${F.length} problem(s):\n  - ${F.join("\n  - ")}`); process.exit(1); }
console.log("✅ AI search checks hold: the crawler check reports facts (unreadable is never 'nothing blocked'), the audit has no FAQ line or mislabeled figures and its score is admin-only, the Yelp step is hygiene with no promise");
