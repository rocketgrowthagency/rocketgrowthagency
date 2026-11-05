// Load the live admin with a LOCAL admin.js swapped in (proved by a marker), and report rows + render errors.
const { adminLink } = await import("./_admin-session.mjs");
const { default: puppeteer } = await import("puppeteer");
const fs = await import("node:fs");
const [clientId, localJs] = process.argv.slice(2);
const body = fs.readFileSync(localJs, "utf8") + "\n;globalThis.__LOCAL_ADMIN = true;";
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 1000 });
await p.setCacheEnabled(false);
const errs = [];
p.on("console", async (m) => { if (/Flow render failed|load error/.test(m.text())) { for (const a of m.args()) { try { errs.push(await a.evaluate((e) => (e && e.stack) ? String(e.stack).split("\n").slice(0, 3).join(" | ") : String(e))); } catch {} } } });
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 200)));
await p.setRequestInterception(true);
p.on("request", (r) => { if (new URL(r.url()).pathname === "/admin/admin.js") return r.respond({ status: 200, contentType: "text/javascript", body }); r.continue(); });
await p.goto(await adminLink(), { waitUntil: "domcontentloaded" }); await new Promise((r) => setTimeout(r, 6000));
await p.goto(`https://www.rocketgrowthagency.com/admin/?view=client&id=${clientId}&tab=onboarding-v2`, { waitUntil: "domcontentloaded" });
let st;
for (let s = 0; s < 90; s += 5) { await new Promise((r) => setTimeout(r, 5000)); st = await p.evaluate(() => ({ local: !!globalThis.__LOCAL_ADMIN, rows: document.querySelectorAll(".ob-step").length, chips: document.querySelectorAll("[data-mw-chip], .mw-chip").length })); if (st.rows) break; }
console.log(JSON.stringify(st)); console.log(errs.slice(0, 6).join("\n")); await b.close();
