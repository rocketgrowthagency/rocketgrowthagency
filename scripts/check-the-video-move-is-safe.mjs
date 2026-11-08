#!/usr/bin/env node
/**
 * check-the-video-move-is-safe.mjs — RGA'S OUTREACH VIDEOS GO TO FILE STORAGE WITHOUT LOSING OR BREAKING ONE (approved
 * rga_videos_to_storage_v1, the owner 11-8: "test everything and confirm the system now will be updated so it will still work seamlessly
 * and automatically"). Runs _video-move.js against a fake live site and a fake storage: a video counts as moved only when storage reads
 * it back with the same size, type and fingerprint; a wrong or missing live file is never copied; a run picks up where the last stopped,
 * never overlaps another, gives up after 3 tries and says so; nothing is ever deleted. Then System health's row is rendered in Chrome:
 * Running with a bar, then Done. Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
let VM, A, CSS, MAN, TOML, LIST, puppeteer;
try {
  VM = req(`${SITE}/netlify/functions/_video-move.js`);
  A = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); CSS = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
  MAN = fs.readFileSync(`${SITE}/netlify/functions/_job-manifest.js`, "utf8"); TOML = fs.readFileSync(`${SITE}/netlify.toml`, "utf8");
  LIST = JSON.parse(fs.readFileSync(`${SITE}/data/outreach-videos.json`, "utf8"));
  puppeteer = req("puppeteer-core");
} catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");

// ── the fakes ───────────────────────────────────────────────────────────────────────────────────────────────
const SUPA = "https://supa.test";
function world(live) {
  const store = new Map(), deletes = [], uploads = [];
  let ledger = null, corrupt = new Set(), etagless = false;
  const res = (status, body = "", headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => String(body), arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(String(body))) });
  const fetch = async (url, init = {}) => {
    const u = new URL(url), m = (init.method || "GET").toUpperCase();
    if (m === "DELETE") { deletes.push(url); return res(200); }
    if (u.host === "www.rocketgrowthagency.com") {
      const s = (u.pathname.match(/^\/v\/([^/]+)\/video\.mp4$/) || [])[1], v = live[s];
      if (!v) return res(404, "not found", { "content-type": "text/html" });
      return res(v.status || 200, v.bytes, { "content-type": v.type || "video/mp4" });
    }
    if (u.pathname === "/storage/v1/object/raw-store/video-move/ledger.json") {
      if (m === "POST") { ledger = String(init.body); return res(200); }
      return ledger === null ? res(400, '{"statusCode":"404","error":"not_found","message":"Object not found"}') : res(200, ledger);
    }
    const up = u.pathname.match(/^\/storage\/v1\/object\/outreach-videos\/([^/]+)\/video\.mp4$/);
    if (up && m === "POST") { uploads.push(up[1]); store.set(up[1], corrupt.has(up[1]) ? Buffer.concat([init.body, Buffer.from("x")]).subarray(1) : init.body); return res(200); }
    const pub = u.pathname.match(/^\/storage\/v1\/object\/public\/outreach-videos\/([^/]+)\/video\.mp4$/);
    if (pub) { const b = store.get(pub[1]); if (!b) return res(400); return res(200, m === "HEAD" ? "" : b, { "content-type": "video/mp4", "content-length": String(b.length), etag: etagless ? '"abc-2"' : `"${md5(b)}"` }); }
    return res(404);
  };
  return { fetch, store, deletes, uploads, get ledger() { return ledger && JSON.parse(ledger); }, setLedger: (l) => { ledger = JSON.stringify(l); }, corrupt, setEtagless: (v) => { etagless = v; } };
}
const vid = (n) => crypto.randomBytes(n);
const run = (w, list, extra = {}) => VM.runMove({ fetch: w.fetch, supaUrl: SUPA, key: "k", list, budgetMs: 60000, ...extra });

try {
  const a = vid(2000), b = vid(3000), c = vid(1500);
  const list = [{ slug: "acme-plumbing", size: a.length }, { slug: "bay-hvac", size: b.length }, { slug: "cedar-roofing", size: c.length }];

  // a clean move: every one copied, read back, ledgered; nothing deleted
  const w1 = world({ "acme-plumbing": { bytes: a }, "bay-hvac": { bytes: b }, "cedar-roofing": { bytes: c } });
  const r1 = await run(w1, list);
  if (r1.done !== 3 || r1.left !== 0 || !w1.store.get("bay-hvac")?.equals(b)) fail(`a clean move didn't copy all 3 exactly (${JSON.stringify(r1)})`);
  if (w1.deletes.length) fail("the move deleted something");
  if (w1.ledger.lock !== null || w1.ledger.done["acme-plumbing"].md5 !== md5(a)) fail("the ledger doesn't record each video's fingerprint, or the lock was left on");
  if (VM.moveLine(r1, 66) !== "All 3 in storage, each checked · 66 still taken down") fail(`the done line is wrong (${VM.moveLine(r1, 66)})`);

  // resumable: a second run copies nothing again
  const before = w1.uploads.length; await run(w1, list);
  if (w1.uploads.length !== before) fail("a finished video was copied again");

  // a live answer that isn't the video is never copied
  const w2 = world({ "acme-plumbing": { bytes: Buffer.from("<html>home</html>"), type: "text/html" }, "bay-hvac": { bytes: b.subarray(0, 100) }, "cedar-roofing": { status: 302, bytes: "" } });
  const r2 = await run(w2, list);
  if (r2.done !== 0 || w2.uploads.length) fail(`a page, a short file or a forward was copied as a video (${w2.uploads.join(",")})`);
  if (!/not a video/.test(w2.ledger.failed["acme-plumbing"].why) || !/bytes/.test(w2.ledger.failed["bay-hvac"].why) || !/302/.test(w2.ledger.failed["cedar-roofing"].why)) fail("why a video wasn't copied isn't recorded");

  // storage that reads back different bytes is never counted as moved
  const w3 = world({ "acme-plumbing": { bytes: a }, "bay-hvac": { bytes: b }, "cedar-roofing": { bytes: c } }); w3.corrupt.add("bay-hvac");
  const r3 = await run(w3, list);
  if (w3.ledger.done["bay-hvac"] || r3.done !== 2) fail("a stored copy that isn't the live file was counted as moved");
  w3.setEtagless(true); w3.corrupt.clear();
  const r3b = await run(w3, list);
  if (!w3.ledger.done["bay-hvac"] || r3b.done !== 3) fail("with no md5 fingerprint from storage, a good copy wasn't confirmed by reading it back");

  // gives up after 3 tries and says so
  const w4 = world({ "acme-plumbing": { bytes: a }, "bay-hvac": { bytes: b } });
  for (let i = 0; i < 4; i++) await run(w4, list);
  const r4 = VM.summary(list, w4.ledger);
  if (w4.ledger.failed["cedar-roofing"].tries !== 3 || r4.failed !== 1 || r4.left !== 0) fail(`a video that never answers isn't given up after 3 tries (${JSON.stringify(w4.ledger.failed["cedar-roofing"])})`);
  if (VM.moveLine(r4, 66) !== "2 of 3 copied and checked · 1 couldn't be copied") fail(`a video that couldn't be copied isn't said (${VM.moveLine(r4, 66)})`);

  // never two runs at once
  const w5 = world({ "acme-plumbing": { bytes: a } }); w5.setLedger({ done: {}, failed: {}, lock: new Date().toISOString() });
  const r5 = await run(w5, list);
  if (!r5.skipped || w5.uploads.length) fail("a run started while another held the lock");
  w5.setLedger({ done: {}, failed: {}, lock: new Date(Date.now() - 20 * 60e3).toISOString() });
  if ((await run(w5, list)).skipped) fail("a stale lock (a run that died) blocks the move forever");

  // the list itself: every live video, taken-down ones left out
  const takeDown = new Set((TOML.match(/from = "\/v\/[a-z0-9-]+/g) || []).map((x) => x.slice(11)));
  if (LIST.videos.some((x) => takeDown.has(x.slug)) || LIST.taken_down !== 66 || LIST.videos.length !== 1533) fail(`the list isn't the 1,533 live videos without the 66 taken down (${LIST.videos.length}, ${LIST.taken_down})`);
} catch (e) { console.error(`⚠️  INDETERMINATE — the move threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); process.exit(2); }

// ── System health's row, rendered ───────────────────────────────────────────────────────────────────────────
const lift = (name) => { const i = A.indexOf(`function ${name}(`); if (i < 0) return null; let d = 0; for (let k = A.indexOf("{", A.indexOf(")", i)); k < A.length; k++) { if (A[k] === "{") d++; else if (A[k] === "}") { d--; if (!d) return A.slice(i, k + 1); } } return null; };
const code = ["shProgress", "systemHealthRow"].map(lift);
if (code.some((x) => !x)) { console.error("⚠️  INDETERMINATE — shProgress or systemHealthRow moved"); process.exit(2); }
const b = await puppeteer.launch({ headless: "new", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--no-sandbox"] });
let out;
try {
  const pg = await b.newPage();
  await pg.setContent(`<style>${CSS}</style><div id="h" style="padding:20px;width:700px"></div>`);
  out = await pg.evaluate((code) => {
    const escapeHtml = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), escapeAttribute = escapeHtml;
    const api = eval(`(() => { ${code.join("\n")}; return { systemHealthRow }; })()`);
    const h = document.getElementById("h"), read = (r) => { h.innerHTML = api.systemHealthRow(r); const bar = h.querySelector(".sh-bar i"); return { text: h.textContent.replace(/\s+/g, " ").trim(), bar: bar ? bar.style.width : null, barPx: bar ? bar.getBoundingClientRect().width : 0, cls: h.firstElementChild.className }; };
    return { run: read({ job: "video-move", label: "Moving outreach videos", line: "640 of 1,533 copied and checked", tone: "ok", tag: "OK" }),
      done: read({ job: "video-move", label: "Moving outreach videos", line: "All 1,533 in storage, each checked · 66 still taken down", tone: "ok", tag: "OK" }),
      other: read({ job: "site-watch", label: "Website up", line: "3 clients · 3 checked", tone: "ok", tag: "OK" }) };
  }, code);
} catch (e) { console.error(`⚠️  INDETERMINATE — the row wouldn't render: ${String(e.message).split("\n")[0]}`); process.exit(2); } finally { await b.close(); }
if (out.run.text.replace(/\s+/g, "") !== "↻Movingoutreachvideos640of1,533copiedandcheckedRunning" || out.run.bar !== "42%" || !(out.run.barPx > 0) || !/sh-run/.test(out.run.cls)) fail(`the move in progress isn't Running with a bar (${out.run.text} · ${out.run.bar})`);
if (out.done.text.replace(/\s+/g, "") !== "✓OutreachvideosinstorageAll1,533checked·66stilltakendownDone") fail(`the finished move doesn't read Done (${out.done.text})`);
if (out.other.bar || /Running|Done/.test(out.other.text)) fail("another job's row changed");
if (!/j\.job !== "video-move"/.test(A)) fail("the move's row can be folded into the grouped Netlify jobs, hiding its progress");
if (!/\[functions\."video-move"\]\s*\n\s*schedule = "\*\/15 \* \* \* \*"/.test(TOML) || !/job: "video-move"[^\n]*cron: "\*\/15 \* \* \* \*"/.test(MAN)) fail("the move isn't scheduled every 15 minutes, or isn't on System health's list");

if (bad.length) { console.error(`❌ the video move — ${bad.length} regression(s):`); for (const x of bad) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ the outreach videos move safely: each counted only when storage reads it back with the same size, type and fingerprint; a page, a short file or a forward is never copied; resumable, never two runs at once, gives up after 3 tries and says so; nothing deleted; the list is the 1,533 live videos without the 66 taken down; System health shows Running with a bar, then Done");
