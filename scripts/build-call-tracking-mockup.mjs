#!/usr/bin/env node
/**
 * build-call-tracking-mockup.mjs — render the call-tracking step's mockup FROM THE PLAYBOOK.
 *
 * 🔑 Same rule as the owner-questions mockup: the copy is read from `data/playbooks/playbooks.json`
 * and the provider list from `_call-providers.js`, so the mockup cannot claim the product says
 * something it does not. A hand-written mockup drifts, and then a correct screen looks wrong.
 * → project_owner_facts_questions
 *
 * Usage: node scripts/build-call-tracking-mockup.mjs   (writes reports/mockups/portal_call_tracking.html)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(path.join(SITE, "package.json"));
const PB = JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/playbooks.json"), "utf8"));
const PROV = req("./netlify/functions/_call-providers.js");
const step = [...(PB.month1 || []), ...(PB.month2plus || [])].find((s) => s.id === "m1.tracking.call_setup");
if (!step) { console.error("step not found"); process.exit(2); }

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const btn = (c, chosen) =>
  `<button class="svc${chosen === c.key ? " on" : ""}">${chosen === c.key ? "✓ " : ""}${esc(c.label)}</button>`;

const card = (chosen, num = 6, status = chosen ? "Done" : "To do") => {
  const picked = step.clientChoices.find((c) => c.key === chosen);
  return `<div class="item">
    <div class="row">
      <span class="n">${num}.</span>
      <span class="badge ${chosen ? "g" : "a"}">${chosen ? "✓ " : "○ "}${status}</span>
      <span class="ttl">${esc(step.clientLabel)}</span>
      <button class="ghost">${chosen ? "View →" : "Show me how →"}</button>
    </div>
    <p class="hint">${esc(step.clientHint)}</p>
    <div class="choices">
      ${step.clientChoices.map((c) => btn(c, chosen)).join("")}
      ${picked ? `<span class="note">${esc(picked.confirm)}</span>` : ""}
    </div>
  </div>`;
};

const instructions = step.clientInstructions.split("\n").map((l) =>
  l.trim() === "" ? "" :
  /^[A-Z][A-Z .,'’—-]+$/.test(l.trim()) ? `<p class="ih">${esc(l)}</p>` : `<p>${esc(l)}</p>`).join("");

const html = `<title>Step 6 — call tracking</title>
<style>
:root{--bg:#f1f2f4;--card:#fff;--ink:#303030;--muted:#616161;--line:#e3e3e3;--accent:#2457e6;
  --ok:#0c5132;--okbg:#e3f1df;--warn:#8a5a00;--warnbg:#fdf3e4;--page:#eceef1;--chrome:#303030;--cline:#d5d9e0}
@media (prefers-color-scheme:dark){:root{--page:#16181c;--chrome:#e8eaed;--cline:#2c3038}}
:root[data-theme="dark"]{--page:#16181c;--chrome:#e8eaed;--cline:#2c3038}
:root[data-theme="light"]{--page:#eceef1;--chrome:#303030;--cline:#d5d9e0}
body{margin:0;background:var(--page);color:var(--chrome);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:34px 22px 80px}
h1{font:650 25px/1.25 inherit;margin:0 0 6px;letter-spacing:-.01em}
.sub{color:var(--muted);margin:0 0 4px;max-width:72ch}
h2{font:650 17px/1.3 inherit;margin:34px 0 6px}
.lede{color:var(--muted);font-size:14px;margin:0 0 14px;max-width:74ch}
hr{border:0;height:1px;background:var(--cline);margin:26px 0}
.frame{overflow-x:auto}
.item{width:860px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:12px;
  padding:14px 16px;margin:0 0 12px;box-shadow:0 1px 2px rgb(0 0 0/5%)}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.n{font-weight:700;color:var(--muted);font-size:14px}
.badge{font:700 11px/1 system-ui;letter-spacing:.04em;padding:5px 9px;border-radius:99px;white-space:nowrap}
.badge.g{background:var(--okbg);color:var(--ok)} .badge.a{background:var(--warnbg);color:var(--warn)}
.ttl{flex:1;min-width:230px;font-weight:650;font-size:15px}
.ghost{background:#fff;color:var(--accent);border:1px solid var(--accent);padding:5px 12px;
  border-radius:5px;font:600 12px/1 inherit;cursor:pointer}
.hint{margin:9px 0 0;font-size:13.5px;color:var(--muted);max-width:74ch}
.choices{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:11px 0 0}
.svc{padding:7px 14px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);
  font:600 13.5px/1 inherit;cursor:pointer}
.svc.on{background:#1f7a4d;border-color:#1f7a4d;color:#fff}
.note{flex:1 1 100%;font-size:12.5px;color:var(--muted);margin-top:2px}
.panel{width:860px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:10px;
  padding:14px 16px;font-size:13.5px;line-height:1.6}
.panel p{margin:0 0 7px} .panel .ih{font-weight:700;color:var(--ink);margin-top:12px}
.tiles{display:flex;gap:12px;flex-wrap:wrap;margin:0}
.tile{flex:1 1 200px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:13px 15px}
.tile .l{font:700 11px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.tile .v{font:650 26px/1.2 inherit;margin-top:6px}
.tile .d{font-size:12.5px;color:var(--muted);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--cline);vertical-align:top}
th{font-weight:650;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
code{font:12.5px ui-monospace,Menlo,monospace;background:rgb(127 127 127/12%);padding:1px 5px;border-radius:4px}
.flow{font:13px/1.9 ui-monospace,Menlo,monospace;background:rgb(127 127 127/8%);border-left:3px solid var(--accent);
  padding:12px 14px;border-radius:0 8px 8px 0;overflow-x:auto}
</style>
<div class="wrap">
<h1>Step 6 — Decide on call tracking</h1>
<p class="sub">Generated from <code>data/playbooks/playbooks.json</code> and the provider adapters, so it
cannot say something the product does not.</p>

<h2>What the client sees — before they choose</h2>
<p class="lede">Three buttons. The recommendation is stated in the instructions, not implied by button order.</p>
<div class="frame">${card(null)}</div>

<h2>Behind “Show me how →”</h2>
<p class="lede">Real instructions. Before today this panel repeated the sentence already printed above it.</p>
<div class="frame"><div class="panel">${instructions}</div></div>

<h2>After they choose</h2>
<p class="lede">The step marks done, the pick stays visible, and it can be changed at any time.</p>
<div class="frame">
  ${card("skip")}
  ${card("rga_sets_up")}
  ${card("already_have")}
</div>

<h2>What each choice actually does</h2>
<table>
  <tr><th>Choice</th><th>Flag</th><th>You are emailed</th><th>Then</th></tr>
  <tr><td><b>Skip for now</b></td><td><code>call_tracking: false</code></td><td>no</td>
      <td>Calls from Google keeps reporting. Nothing else changes.</td></tr>
  <tr><td><b>Set one up for me</b></td><td><code>call_tracking: true</code></td><td><b>yes</b> — with the provisioning list</td>
      <td>We create the company + number on our account and install the swap snippet.</td></tr>
  <tr><td><b>I already use call tracking</b></td><td><code>call_tracking: true</code></td><td><b>yes</b> — with the connect list</td>
      <td>We connect to <i>their</i> account. <b>No second number</b> — two would split their reporting.</td></tr>
</table>

<h2>The chain, end to end</h2>
<div class="flow">tap  →  kpi_config.call_tracking = true
     →  RGA emailed with the exact TODO
     →  provider company + number provisioned (or theirs connected)
     →  call-tracking-sync pulls the month
     →  client_monthly_records.total_calls
     →  “Tracked calls” tile appears in the portal + monthly report</div>

<h2>Providers we can pull from</h2>
<p class="lede">One adapter each, all returning the same shape. A provider is only offered if we can
actually read calls from it.</p>
<table>
  <tr><th>Provider</th><th>What we store</th><th>Credentials</th><th>Ready</th></tr>
  ${PROV.allProviders().map((p) => `<tr><td><b>${esc(p.label)}</b></td><td>${esc(p.idLabel)}</td>
    <td><code>${esc(PROV.PROVIDERS[p.key].envKey)}</code></td>
    <td>${p.configured ? "✅ key present" : "— no key yet"}</td></tr>`).join("")}
</table>

<h2>What the client sees once calls arrive</h2>
<p class="lede">Two tiles, never one. They measure different events, so a fallback would hide one and a
sum would count the same caller twice.</p>
<div class="frame"><div class="tiles" style="width:860px">
  <div class="tile"><div class="l">Calls from Google</div><div class="v">14</div>
    <div class="d">People who tapped “call” on your Google listing.</div></div>
  <div class="tile"><div class="l">Tracked calls</div><div class="v">9</div>
    <div class="d">Calls to the tracking number on your website — these tell us which search made the phone ring.</div></div>
</div></div>

<hr>
<p class="sub"><b>Counting rule:</b> a call counts at <b>30 seconds</b> connected. A 3-second misdial is
not a lead, and reporting it as one erodes the number you are judged by. Total rings are kept separately.</p>
<p class="sub"><b>Never a zero:</b> no API key, no company id, or a provider error all return
<i>indeterminate</i>. A 0 is a claim that nobody rang.</p>
</div>`;

const out = path.join(SITE, "reports/mockups/portal_call_tracking.html");
fs.writeFileSync(out, html);
console.log(`✅ built ${out} — ${step.clientChoices.length} choices, ${PROV.allProviders().length} providers`);
