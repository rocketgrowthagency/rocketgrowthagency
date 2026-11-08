#!/usr/bin/env node
/**
 * check-admin-code-result.mjs — WHAT A CODE STEP PRODUCED ON SEVERAL PAGES READS AS A TABLE (approved admin_code_result_v1, the owner 11-8:
 * "please mockup this part better"). Step 49's "What this produced" was a block of text: every page on its own line with its path run
 * together. Now: one row per page (name, link, address · what Google reads it as · its path · its state), one footer (what it's tied to,
 * what's left out and why, how it's read back), and the run history says which run is live and which were replaced.
 * Rendered in Chrome with admin.css. Fixtures: a made-up plumber's two service pages. Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SHOTS = (process.argv.find((x) => x.startsWith("--shots=")) || "").slice(8);
const req = createRequire(import.meta.url);
let A, CSS, SCsrc, puppeteer;
try { A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); CSS = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8"); SCsrc = fs.readFileSync(`${SITE}/shared/site-change.js`, "utf8"); puppeteer = req("puppeteer-core"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the admin: ${e.message}`); process.exit(2); }
const lift = (name) => { const i = A.indexOf(`function ${name}(`); if (i < 0) return null; let d = 0; for (let k = A.indexOf("{", A.indexOf(")", i)); k < A.length; k++) { if (A[k] === "{") d++; else if (A[k] === "}") { d--; if (!d) return A.slice(i, k + 1); } } return null; };
const code = ["codeResultHtml", "stepRunHistoryHtml", "runCounts"].map(lift);
if (code.some((x) => !x)) { console.error("⚠️  INDETERMINATE — codeResultHtml or stepRunHistoryHtml moved"); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);
const B = "https://acme.test";
const pages = [{ url: `${B}/services/drain-cleaning/`, name: "Drain Cleaning Service", path: "Home › Our Services › Drain Cleaning Service" }, { url: `${B}/services/water-heaters/`, name: "Water Heaters", path: "Home › Our Services › Water Heaters" }];
const live = { ran_at: "2026-11-07T20:50:00Z", auto_result: { outcome_data: { pages, provider: `${B}/#business` } }, site_change: { v: "1", kind: "code", pages }, published: { v: "1", at: "2026-11-08T15:57:00Z" } };
const runs = [{ ran_at: "2026-11-07T20:50:00Z", summary: "Service and breadcrumb code for 2 service pages" }, { ran_at: "2026-11-07T20:48:00Z", summary: "Service and breadcrumb code for 1 service page" }];
const b = await puppeteer.launch({ headless: "new", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
const out = {};
try {
  for (const [name, task] of [["live", live], ["sent", { ...live, published: null, internal_review: { decision: "approved", change_v: "1" } }], ["drift", { ...live, live_drift: { missing: ["Drain Cleaning Service: name isn't as approved"] } }], ["none", { ran_at: "x", auto_result: { outcome_data: {} } }]]) {
    const page = await b.newPage(); await page.setViewport({ width: 1000, height: 800 });
    await page.setContent(`<style>${CSS}</style><div id="h" style="padding:20px"></div>`);
    out[name] = await page.evaluate(({ code, SCsrc, task, runs }) => {
      const module = { exports: {} }; new Function("module", "exports", "window", SCsrc)(module, module.exports, window);
      globalThis.rgaSiteChange = module.exports && module.exports.STEPS ? module.exports : window.rgaSiteChange;
      const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml;
      const state = { stepRuns: { "m1.web.expanded_schema": runs } };
      const api = eval(`(() => { ${code.join("\n")}; return { codeResultHtml }; })()`);
      const html = api.codeResultHtml(task, { flowId: "m1.web.expanded_schema" }, {});
      document.getElementById("h").innerHTML = html;
      return { html, text: document.getElementById("h").textContent.replace(/\s+/g, " ").trim(), rows: document.querySelectorAll(".ob-cr-t tbody tr").length };
    }, { code, SCsrc, task, runs });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    await page.close();
  }
} catch (e) { console.error(`⚠️  INDETERMINATE — the card wouldn't render: ${String(e.message).split("\n")[0]}`); process.exit(2); } finally { await b.close(); }

const L = out.live;
if (L.rows !== 2) fail(`a code step on several pages isn't one row per page (got ${L.rows})`);
if (!/2 service pages described for Google/.test(L.text) || !/href="https:\/\/acme\.test\/services\/drain-cleaning\/"/.test(L.html) || !/\/services\/water-heaters\//.test(L.text)) fail("a row doesn't name its page with a link and its address");
if (!/A service: Drain Cleaning Service/.test(L.text) || !/<span>Home<\/span><i>›<\/i><span>Our Services<\/span><i>›<\/i><span>this page<\/span>/.test(L.html)) fail("a row doesn't say what Google reads it as, or its path");
if ((L.text.match(/✓ Live/g) || []).length !== 2 || !/Read back on all 2 pages, field by field/.test(L.text) || !/Provided by your business details on the homepage/.test(L.text) || !/Left out on purpose: questions code/.test(L.text)) fail("the live state or the footer (tied to, left out and why, read back) is missing");
if (!/class="ob-cr-tag cur">Live</.test(L.html) || !/class="ob-cr-tag old">Replaced</.test(L.html)) fail("the run history doesn't say which run is live and which was replaced");
if ((out.sent.text.match(/With the client/g) || []).length !== 2 || /Read back on all/.test(out.sent.text) || /class="ob-cr-tag/.test(out.sent.html)) fail("a version with the client reads as live");
if ((out.drift.html.match(/class="ob-cr-st bad">Changed on the site</g) || []).length !== 2 || !/name isn't as approved/.test(out.drift.text)) fail("a page whose code changed on the site isn't said");
if (out.none.html !== "") fail("a run with no pages gets the table (it should keep its usual output)");
if (!/const crHtml = codeResultHtml\(task, o, opts\);\s*if \(crHtml\) return crHtml;/.test(A)) fail("the step card doesn't use the table");

if (bad.length) { console.error(`❌ the admin code result — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ what a code step produced on several pages is a table (page with link and address · what Google reads it as · its path · its state), one footer, and the run history marks the live run and the replaced ones; with the client, changed on the site and no pages each read right");
