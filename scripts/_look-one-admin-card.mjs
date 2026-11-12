#!/usr/bin/env node
// _look-one-admin-card.mjs <outDir> — a LOOK (not a gate): every moved admin card family drawn with the SHIPPED producers lifted from admin.js
// (acCardHtml with every literal tone + label at its call sites, bk36Card, gsCard, mgCard, System health, Data, Blog) and shared/leads.js adminHtml,
// in local Chrome with admin.css, next to the mockup's own states (card_notice_designs_v1 §1). Writes moved-cards.png / -phone.png / moved-cards.html.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
import puppeteer from "puppeteer";
import { liftAdmin } from "./_lift-admin.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const out = process.argv[2] || "/tmp/one-admin-card"; fs.mkdirSync(out, { recursive: true });
const A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"), CSS = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
const req = createRequire(path.join(SITE, "shared/x.js"));
globalThis.rgaAdminCard = req(path.join(SITE, "shared/admin-card.js"));
const L = req(path.join(SITE, "shared/leads.js"));
const api = liftAdmin(["acCardHtml", "bk36Card", "mgCard", "systemHealthHtml", "dataKeepHtml", "blogCardHtml"], { extraGlobals: { state: { selectedClient: { id: "c1" } } } });
const groups = [];
// 1 · row 8 / Monthly / website cards: every literal tone + label written at an acCardHtml call
const ac = [];
for (const m of A.matchAll(/acCardHtml\(\{([^]{0,400}?)\}\)/g)) {
  const tone = (/\btone:\s*"([a-z]*)"/.exec(m[1]) || [])[1], label = (/\blabel:\s*"([^"]*)"/.exec(m[1]) || [])[1];
  if (tone != null && label != null && !ac.some((x) => x[0] === tone && x[1] === label)) ac.push([tone, label]);
}
groups.push(["ob-ac callers (acCardHtml): every literal tone + label", ac.map(([tone, label]) => api.call("acCardHtml", [{ tone, label, title: `Fixture · ${label}`, when: "Nov 11, 8:02 AM PT", facts: [["Fact", "A value"]], acts: '<button type="button" class="admin-button admin-button-secondary">Skip</button>' }])) ]);
// 2 · step 36 (bk36Card) and the Google safety cards' pills
const bk = [...A.matchAll(/bk36Card\("([a-z]*)", "([^"]+)"/g)].map((m) => [m[1], m[2]]).filter((x, i, a) => a.findIndex((y) => y[0] === x[0] && y[1] === x[1]) === i);
groups.push(["ob-zc step 36 (bk36Card)", bk.map(([k, p]) => api.call("bk36Card", [k, p, "Their booking link", "Google shows none", '<p class="ob-zc-note">Body</p>', '<button type="button" class="admin-button">Put it on Google</button>']))]);
groups.push(["ob-zc managed cards (mgCard)", [["", "Your move"], ["ok", "On Google"], ["", "Client's move"], ["", "Couldn't read"], ["", "Not known"], ["", "Reading"], ["ok", "Verified"]].map(([k, p]) => api.call("mgCard", [k, p, "Verification", "read from Google", '<p class="ob-zc-note">Body</p>', ""]))]);
// 3 · System health, Data, Blog in their states
const job = (state, problem) => ({ job: state, label: `Job ${state}`, where: "netlify", state, problem, tone: problem ? "you" : state === "ok" ? "ok" : "unk", tag: problem ? "Failed" : state === "ok" ? "Checked in" : "Not recorded", line: "A line" });
groups.push(["ob-zc System health · Data · Blog", [
  api.call("systemHealthHtml", [null, { loading: true }]), api.call("systemHealthHtml", [null, {}]),
  api.call("systemHealthHtml", [{ table_ready: false, jobs: [], summary: {} }, { full: true }]),
  api.call("systemHealthHtml", [{ table_ready: true, read_label: "Nov 11, 8:00 AM", jobs: [job("ok"), job("bad", true)], summary: { ok: 1 } }, { full: true }]),
  api.call("systemHealthHtml", [{ table_ready: true, read_label: "Nov 11, 8:00 AM", jobs: [job("ok")], summary: { ok: 1 } }, { full: false }]),
  api.call("dataKeepHtml", [null, { loading: true }]), api.call("dataKeepHtml", [{ rows: [{ key: "a", label: "Leads", line: "Kept 13 months", tone: "ok", tag: "Saved" }], summary: { you: 0 }, read_label: "Nov 11" }]),
  api.call("blogCardHtml", [null, {}]),
]]);
// 4 · Leads (shared/leads.js) in its states
groups.push(["Leads card (shared/leads.js)", [L.adminHtml(null, { loading: true, month: "2026-11-01", number: 63 }), L.adminHtml(null, { error: "HTTP 500.", month: "2026-11-01", number: 63 }),
  L.adminHtml({ cur: "2026-11-01", prev: "2026-10-01", table: false }, { number: 63 }), L.adminHtml({ cur: "2026-11-01", prev: "2026-10-01", empty: true }, { number: 63 })]]);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style><style>.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;padding:12px 16px}h2{font:700 13px Inter,system-ui;letter-spacing:.06em;text-transform:uppercase;color:#616161;margin:18px 16px 0}</style></head><body class="admin-body">${groups.map(([h, cards]) => `<h2>${h} · ${cards.length}</h2><div class="g">${cards.map((c) => `<div>${c}</div>`).join("")}</div>`).join("")}</body></html>`;
fs.writeFileSync(`${out}/moved-cards.html`, html);
const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] }); const p = await b.newPage();
await p.setViewport({ width: 1180, height: 900 }); await p.setContent(html, { waitUntil: "load" });
await p.screenshot({ path: `${out}/moved-cards.png`, fullPage: true });
const states = await p.evaluate(() => [...document.querySelectorAll(".ob-card")].map((c) => `${c.getAttribute("data-state")}|${c.querySelector(".ob-card-w").textContent}|${(c.querySelector(".ob-card-d") || {}).textContent || ""}`));
await p.setViewport({ width: 390, height: 900 }); await p.screenshot({ path: `${out}/moved-cards-phone.png`, fullPage: true });
await b.close();
console.log(`${states.length} cards drawn`); const tally = {}; for (const s of states) { const k = s.split("|")[0]; tally[k] = (tally[k] || 0) + 1; } console.log(JSON.stringify(tally));
fs.writeFileSync(`${out}/moved-cards-states.txt`, states.join("\n") + "\n");
