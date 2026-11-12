#!/usr/bin/env node
// check-the-audit-and-quarter-steps-hold.mjs — FIVE STEPS NO SCHEDULED GATE AIMED AT, NOW HELD (checkers build 11-11; master map approved).
//
// GUARDS the steps the 11-11 checkers inventory found with no gate (or one, with no suite), by running their real runners from
// website netlify/functions/flow-execute.js on fakes (no network, no model, no database):
//   m1.audit.website            admin 12 · audits the PAGE, not the tracking link (UTMs stripped); a non-2xx page is INDETERMINATE, never
//                               a list of "MISSING" findings; a styled H1 (nested markup) is read; GA4 behind GTM is "cannot tell", not absent.
//   m1.audit.ai_readiness       admin 14 · runs the deployed ai-readiness-audit through callDeployedAudit (the spread that wins); a refusal
//                               or an HTML error page is INDETERMINATE, never "verified".
//   m1.audit.recommendations    admin 30 · runs build-recommendations-plan after every audit it depends on, the plan reads each audit's
//                               surface, a success records the client brain, and admin draws the fix-plan card from what was stored.
//   m2.exec.local_pr            Monthly 15 · drafts the quarter's links-and-press plan from the model, labelled with the real quarter, and a
//                               model failure is not swallowed into an empty "done".
//   m2.exec.cannibalization_audit Monthly 17 · no sitemap is INDETERMINATE with the reason; a page it could not read makes the result PARTIAL,
//                               never "No collisions detected"; two pages with one H1 are a conflict.
// Exit 0 = the five hold · 1 = one regressed · 2 = INDETERMINATE (a runner moved, a lift failed).
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const rd = (rel) => { try { return fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { idk(`${rel} moved`); } };
const FE = rd("netlify/functions/flow-execute.js");

// ── lifting: the text of a balanced block that starts at `start` (naive brace count; these runners have balanced braces) ──
const block = (src, start, from = start) => {
  const open = src.indexOf("{", from);
  if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) return src.slice(start, i + 1); }
  return null;
};
const runnerText = (id) => {
  const at = FE.lastIndexOf(`  "${id}": async (`);
  if (at < 0) idk(`the ${id} runner moved out of flow-execute.js`);
  const t = block(FE, at + `  "${id}": `.length, FE.indexOf("=> {", at));
  if (!t) idk(`can't lift the ${id} runner`);
  return t;
};
const fnText = (name) => {
  const at = FE.search(new RegExp(`^(async )?function ${name}\\(`, "m"));
  if (at < 0) idk(`${name} moved out of flow-execute.js`);
  return block(FE, at);
};
const make = (text, deps) => new Function(...Object.keys(deps), `return (${text});`)(...Object.values(deps));
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const clientSiteUrl = make(fnText("clientSiteUrl"), {});

// ── m1.audit.website ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const id = "m1.audit.website";
  const run = (page, client = { website_url: "https://acme-plumbing.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp_listing", primary_market: "Austin, TX", primary_service: "Plumbing" }) => {
    const seen = { fetched: [], written: [] };
    const fn = make(runnerText(id), {
      clientSiteUrl,
      fetchHomepage: async (u) => { seen.fetched.push(u); return { status: page.status, body: page.body }; },
      clientLocality: () => ({ locality: "Austin", market: "Austin, TX" }),
      writeOnboardingFormFields: async (_c, f) => { seen.written.push(f); },
      fetch: async () => ({ ok: true }),
    });
    return fn({ client, clientId: "c1" }).then((r) => ({ r, seen }));
  };
  const ok = await run({ status: 200, body: `<html><head><title>Austin Plumbing | Acme</title><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script></head><body><h1>Austin's <span>best</span> plumber</h1><a href="tel:+15125550100">Call</a></body></html>` }).catch((e) => idk(`${id} threw: ${e.message}`));
  if (ok.seen.fetched[0] !== "https://acme-plumbing.com") F.push(`${id}: audits ${ok.seen.fetched[0]}, not the page (the tracking link's UTMs reach a client-facing audit)`);
  if (!/best plumber/.test(ok.r.outcome_data?.h1 || "")) F.push(`${id}: a styled H1 reads as ${JSON.stringify(ok.r.outcome_data?.h1)} (nested markup must be read, 09-08 reported RGA's own H1 MISSING)`);
  if (ok.r.outcome_data?.has_ga4 !== null || !/cannot tell \(GTM present\)/.test(ok.r.summary)) F.push(`${id}: GA4 behind Google Tag Manager reads as ${ok.r.outcome_data?.has_ga4} — an absence we cannot prove`);
  if (!ok.seen.written.length || ok.seen.written[0]["9.5 Click To Call Present - Yes/No"] !== "Yes") F.push(`${id}: the Section 9 fields are not filled from the page`);
  const down = await run({ status: 503, body: "<html>Service Unavailable</html>" });
  if (down.r.outcome !== "indeterminate") F.push(`${id}: a page that answered HTTP 503 is outcome ${down.r.outcome}, not indeterminate`);
  if (/MISSING/.test(down.r.summary)) F.push(`${id}: an error page is reported as MISSING title/H1 — false findings for a client`);
  if (down.seen.written.length) F.push(`${id}: an error page still fills the Section 9 fields`);
  const none = await run({ status: 200, body: "" }, { website_url: "" });
  if (none.r.outcome !== "indeterminate") F.push(`${id}: a client with no website is not indeterminate`);
}

// ── m1.audit.ai_readiness + m1.audit.recommendations: the spread that wins, and callDeployedAudit ──────────────────────────────
{
  const spreads = [...FE.matchAll(/\.\.\.Object\.fromEntries\(\[\s*([\s\S]*?)\]\.map\(\(\[(\w+), (\w+)\]\) => \[\w+, async \(\{ clientId \}\) => ([^\n]*)/g)];
  const last = spreads.filter((m) => /"m1\.audit\.ai_readiness"/.test(m[1])).pop();
  if (!last) idk("the audit adapter spread moved");
  if (!/"m1\.audit\.ai_readiness", "ai-readiness-audit"/.test(last[1])) F.push("m1.audit.ai_readiness no longer runs ai-readiness-audit (in the spread that wins)");
  if (!/"m1\.audit\.recommendations", "build-recommendations-plan"/.test(last[1])) F.push("m1.audit.recommendations no longer runs build-recommendations-plan (in the spread that wins)");
  if (!/callDeployedAudit\(/.test(last[4])) F.push("the audit steps no longer go through callDeployedAudit, the path that refuses to call an unread result verified");
  for (const fn of ["ai-readiness-audit", "build-recommendations-plan"]) if (!fs.existsSync(path.join(SITE, `netlify/functions/${fn}.js`))) F.push(`netlify/functions/${fn}.js is gone: its step runs nothing`);

  const calls = [];
  let answer = null;
  const env = { QUO_WEBHOOK_TOKEN: "fake-token", URL: "https://example.test", INTERNAL_FN_SECRET: "fake-secret" };
  const cda = make(fnText("callDeployedAudit"), {
    process: { env },
    fetch: async (u, o) => { calls.push({ u: String(u), method: (o && o.method) || "GET" }); return /brain-record-audit/.test(u) ? res(200, "{}") : answer; },
    console: { warn() {}, log() {}, error() {} },
  });
  answer = res(500, "<html>Internal error</html>");
  let r = await cda("ai-readiness-audit", "c1");
  if (r.outcome !== "indeterminate") F.push(`m1.audit.ai_readiness: an HTML error page is outcome ${r.outcome}, not indeterminate`);
  answer = res(200, JSON.stringify({ ok: false, error: "no website" }));
  r = await cda("ai-readiness-audit", "c1");
  if (r.outcome !== "indeterminate") F.push(`m1.audit.ai_readiness: an ok:false answer is outcome ${r.outcome}, not indeterminate`);
  answer = res(200, JSON.stringify({ ok: true, readiness_score: 62, checks: [], fixes: [] }));
  r = await cda("ai-readiness-audit", "c1");
  if (r.outcome !== "verified" || !/Readiness 62%/.test(r.summary)) F.push(`m1.audit.ai_readiness: a real answer doesn't read as its score (${r.summary})`);
  calls.length = 0;
  answer = res(200, JSON.stringify({ ok: true, totals: { recommendations: 7, unknowns: 2 } }));
  r = await cda("build-recommendations-plan", "c1");
  if (!/7 recommendation\(s\), 2 unknown/.test(r.summary)) F.push(`m1.audit.recommendations: the plan's totals aren't its summary (${r.summary})`);
  if (!calls.some((c) => /brain-record-audit/.test(c.u) && c.method === "POST")) F.push("m1.audit.recommendations: a finished fix plan no longer records the client brain");

  let PB;
  try { PB = JSON.parse(rd("data/playbooks/playbooks.json")); } catch { idk("playbooks.json won't parse"); }
  const step = (PB.month1 || []).find((s) => s.id === "m1.audit.recommendations");
  if (!step) F.push("m1.audit.recommendations is gone from the playbook");
  else for (const dep of ["m1.audit.ai_readiness", "m1.audit.nap_reviews", "m1.audit.social", "m1.audit.citations_nap"]) if (!(step.dependsOn || []).includes(dep)) F.push(`the fix plan no longer waits on ${dep}: it would be built before that audit's findings exist`);
  const plan = rd("netlify/functions/build-recommendations-plan.js");
  const surf = /const SURFACES = \[([^\]]*)\]/.exec(plan);
  for (const s of ["ai_readiness", "nap_reviews", "social", "citations"]) if (!surf || !surf[1].includes(`"${s}"`)) F.push(`build-recommendations-plan no longer reads the ${s} audit: the fix plan leaves out what it found`);
  const adm = rd("admin/admin.js");
  if (!/o\.flowId === "m1\.audit\.recommendations" && s\.task\?\.outcome_data\?\.recommendations \? `<div class="ob-done-card">\$\{fixPlanCardHtml\(/.test(adm)) F.push("admin no longer draws the stored fix plan on the m1.audit.recommendations card");
}

// ── m2.exec.local_pr ───────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const prompts = [];
  let draftErr = null;
  const run = make(runnerText("m2.exec.local_pr"), {
    aiDraft: async (sys, user) => { prompts.push({ sys, user }); if (draftErr) throw draftErr; return "ANGLE 1 · the 50th year"; },
    clientCtx: (c) => `Business: ${c.business_name}`,
  });
  const r = await run({ client: { business_name: "Acme Plumbing" } });
  const q = `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`;
  if (r.summary !== "ANGLE 1 · the 50th year") F.push("m2.exec.local_pr: the step's result is not the drafted plan");
  if (!prompts.length || !prompts[0].user.includes(`Quarter: ${q}`)) F.push(`m2.exec.local_pr: the draft isn't labelled with the real quarter (${q})`);
  if (!prompts.length || !/Business: Acme Plumbing/.test(prompts[0].user)) F.push("m2.exec.local_pr: the draft is not about this client");
  draftErr = new Error("model refused");
  let threw = false;
  try { const r2 = await run({ client: { business_name: "Acme Plumbing" } }); if (r2 && r2.summary == null) threw = false; } catch { threw = true; }
  if (!threw) F.push("m2.exec.local_pr: a model failure is swallowed (the step would read as done with no plan)");
}

// ── m2.exec.cannibalization_audit ──────────────────────────────────────────────────────────────────────────────────────────
{
  const id = "m2.exec.cannibalization_audit";
  const site = (map) => make(runnerText(id), {
    clientSiteUrl,
    fetch: async (u) => { const v = map[String(u)]; if (v instanceof Error) throw v; return v ? res(v[0], v[1]) : res(404, ""); },
  });
  const client = { website_url: "https://acme.com/?utm_source=google" };
  let r = await site({})({ client });
  if (r.outcome !== "indeterminate" || !/sitemap\.xml: HTTP 404/.test(r.summary)) F.push(`${id}: no sitemap is not indeterminate with its reason (${String(r.summary).slice(0, 80)})`);
  const sm = `<urlset><url><loc>https://acme.com/a</loc></url><url><loc>https://acme.com/b</loc></url><url><loc>https://acme.com/c</loc></url></urlset>`;
  r = await site({ "https://acme.com/sitemap.xml": [200, sm], "https://acme.com/a": [200, "<title>Drain cleaning</title><h1>Drain <b>cleaning</b> Austin</h1>"], "https://acme.com/b": [200, "<h1>Drain cleaning   Austin</h1>"], "https://acme.com/c": [500, ""] })({ client });
  if (r.outcome_data?.conflicts !== 1) F.push(`${id}: two pages with one H1 are ${r.outcome_data?.conflicts} conflict(s), not 1`);
  if (r.outcome_data?.unread !== 1 || !/could not be read/.test(r.summary)) F.push(`${id}: a page that answered HTTP 500 is not counted as unread`);
  r = await site({ "https://acme.com/sitemap.xml": [200, sm], "https://acme.com/a": [200, "<h1>One</h1>"], "https://acme.com/b": [200, "<h1>Two</h1>"], "https://acme.com/c": new Error("timeout") })({ client });
  if (/No collisions detected\./.test(r.summary) || !/PARTIAL/.test(r.summary)) F.push(`${id}: with a page unread it says a clean result ("No collisions detected") instead of PARTIAL`);
  r = await site({ "https://acme.com/sitemap.xml": [200, sm.replace(/<url><loc>https:\/\/acme\.com\/c<\/loc><\/url>/, "")], "https://acme.com/a": [200, "<h1>One</h1>"], "https://acme.com/b": [200, "<h1>Two</h1>"] })({ client });
  if (!/No collisions detected\./.test(r.summary)) F.push(`${id}: a complete clean read doesn't say so`);
}

if (F.length) { console.error(`🔴 an audit or quarter step regressed:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ m1.audit.website, m1.audit.ai_readiness, m1.audit.recommendations, m2.exec.local_pr and m2.exec.cannibalization_audit hold: their real runners on fakes read the page not the link, say indeterminate rather than invent findings, and never call a partial read clean");
