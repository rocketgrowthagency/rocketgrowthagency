#!/usr/bin/env node
// check-one-admin-card.mjs — THE ONE ADMIN CARD (approved card_notice_designs_v1 section 1, Chris 11-11; website reports/mockups/card_notice_designs_v1.html).
// Admin had 16 card shells and two that each claimed to be the standard (ob-zc, ob-ac). The one card is ob-zc's frame with ob-ac's state band,
// drawn ONLY by shared/admin-card.js, one state per card from ten. Moved family by family (the mockup's 16-row table, batches 1 to 5).
//   1 the ten states: their words exactly as drawn, one colour family each, a drawn SVG icon each (never a text glyph)
//   2 rendered in real Chrome with the SHIPPED admin.css, every state: exactly one band word from the ten, the card's colours ARE that state's
//     tokens (edge, header tint, band ink, icon disc), Done draws its green result block, Failed and Blocked draw their red why block, the
//     label words that are not the state word move to the when line (nothing the card said is lost), no sideways scroll at phone width
//   3 an older caller's tone + label read as the state it meant (a pinned table, and every literal label in admin.js lands on one of the ten)
//   4 MOVED families (batch 1: ob-zc + ob-ac, and the Leads card that wore ob-zc) draw nothing of their old shell: no class in admin.js,
//     shared/*.js or admin.css (the absence check of feedback_a_build_must_remove_what_it_replaces); their producers route through adminCard
//   5 only shared/admin-card.js writes the card's own markup; the Google tinted card stays (a locked rule) and keeps its own gate
//   6 the Leads card (shared/leads.js) is the one card in every state; admin imports the renderer with a cache-buster
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 can't tell (a file moved, no Chrome).  --shots=<dir> saves PNGs.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const req = createRequire(path.join(SITE, "shared/x.js"));
const fresh = (rel) => { const p = path.join(SITE, rel); delete req.cache[req.resolve(p)]; return req(p); };
let AC, L;
// the renderer IS the standard: gone = regressed (every admin card would throw), not "can't tell"
if (!fs.existsSync(path.join(SITE, "shared/admin-card.js"))) { console.error("❌ check-one-admin-card: shared/admin-card.js is gone, so no admin card has its one renderer"); process.exit(1); }
try { AC = fresh("shared/admin-card.js"); delete globalThis.rgaAdminCard; L = fresh("shared/leads.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the renderer: ${e.message}`); process.exit(2); }
for (const k of ["STATES", "cardHtml", "stateOf", "cardState", "paintState"]) if (!AC[k]) { console.error(`⚠️  INDETERMINATE — shared/admin-card.js has no ${k}`); process.exit(2); }
const A = read("admin/admin.js"), CSS = read("admin/admin.css"), IDX = read("admin/index.html"), LS = read("shared/leads.js"), ACS = read("shared/admin-card.js");

// ── 1 · the ten states, as drawn ─────────────────────────────────────────────────────────────────────────────────────────
const WANT = { locked: ["Locked", "over"], you: ["Your move", "you"], client: ["Client's move", "oth"], rga: ["RGA working", "oth"], google: ["Waiting on Google", "oth"],
  done: ["Done", "ok"], skipped: ["Skipped", "over"], failed: ["Failed", "bad"], blocked: ["Blocked", "bad"], unknown: ["Couldn't check", "unk"] };
const keys = Object.keys(AC.STATES);
if (keys.length !== 10 || keys.some((k) => !WANT[k])) fail(`the states aren't the mockup's ten (${keys.join(", ")})`);
for (const [k, [word, tone]] of Object.entries(WANT)) {
  const S = AC.STATES[k];
  if (!S) { fail(`state ${k} is missing`); continue; }
  if (S.word !== word) fail(`${k}'s band word is "${S.word}", the mockup says "${word}"`);
  if (S.tone !== tone) fail(`${k} is drawn in the ${S.tone} colours, the mockup draws it ${tone}`);
  if (!/<path|<circle|<rect/.test(AC.ICON[S.icon] || "")) fail(`${k}'s icon isn't a drawn SVG`);
}
// cardState: a step record -> one state; the order is the rule
const CS = [[{ status: "skipped", owner: "rga" }, "skipped"], [{ locked: true }, "locked"], [{ blocked_by: "m1.access.website" }, "blocked"], [{ status: "done", unread: true }, "unknown"],
  [{ error: "403" }, "failed"], [{ status: "done" }, "done"], [{ google_wait: true }, "google"], [{ status: "running" }, "rga"], [{ owner: "client" }, "client"], [{ owner: "rga" }, "you"]];
for (const [rec, want] of CS) if (AC.cardState(rec) !== want) fail(`cardState(${JSON.stringify(rec)}) is ${AC.cardState(rec)}, not ${want}`);

// ── 3 · an older caller's tone + label read as the state it meant ────────────────────────────────────────────────────────
const PIN = [["rga", "Your move · draft it", "you", "Draft it"], ["you", "Client's move · role too low", "client", "Role too low"], ["you", "Done, but not proven", "you", "Done, but not proven"],
  ["rga", "Done, but not proven", "unknown", "Done, but not proven"], ["ok", "Done", "done", ""], ["ok", "Access confirmed", "done", "Access confirmed"], ["ok", "Locked", "done", "Locked"],
  ["wait", "Skipped", "skipped", ""], ["wait", "Couldn't check", "unknown", ""], ["wait", "Runs itself · drafting", "rga", "Runs itself · drafting"], ["wait", "Runs itself · waits for step 8", "locked", "Runs itself · waits for step 8"],
  ["late", "App removed", "blocked", "App removed"], ["late", "Live · changed since it went live", "failed", "Live · changed since it went live"], ["bad", "Google said no", "failed", "Google said no"],
  ["care", "Couldn't read it", "unknown", "Couldn't read it"], ["rga", "With the client", "client", "With the client"], ["rga", "You replied", "client", "You replied"], ["", "Waiting on the client", "client", "Waiting on the client"]];
for (const [t, l, want, det] of PIN) { const x = AC.stateOf(t, l); if (x.state !== want || x.detail !== det) fail(`stateOf(${t}, "${l}") is ${JSON.stringify(x)}, not ${want} / "${det}"`); }
for (const m of A.matchAll(/acCardHtml\(\{([^]{0,400}?)\}\)/g)) {
  const tone = (/\btone:\s*"([a-z]*)"/.exec(m[1]) || [])[1], label = (/\blabel:\s*"([^"]*)"/.exec(m[1]) || [])[1];
  if (tone != null && label != null && !AC.STATES[AC.stateOf(tone, label).state]) fail(`the label "${label}" (${tone}) lands on no state`);
}

// ── 4 · the moved families draw nothing of their old shell ───────────────────────────────────────────────────────────────
// batch 1 (card_notice_designs_v1's table rows 1 + 2). A later batch ADDS its family's shell here; this list only grows.
const MOVED_SHELL = ["ob-zc", "ob-zc-h", "ob-zc-g", "ob-zc-ht", "ob-zc-pill", "ob-zc-n", "ob-zc-b", "ob-zc-f",
  "ob-ac", "ob-ac-h", "ob-ac-i", "ob-ac-ht", "ob-ac-st", "ob-ac-when", "ob-ac-t", "ob-ac-chip", "ob-ac-f", "ob-ac-foot", "ob-ac-r", "ob-ac-txt", "ob-ac-say", "ob-ac-in", "ob-ac-what", "ob-ac-mut", "ob-ac-warn", "lds-zc"];
// not moved yet (later batches); the one card may sit around them. This list only shrinks.
const NOT_YET = ["ob-gcard", "ob-mg", "ob-wc", "ob-dc", "ob-cb", "ob-cr", "ob-img", "ob-tm", "ob-g7", "ob-sm", "ob-out", "admin-mod", "cc-"];
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/[^\n]*/g, "$1");
const tok = (c) => new RegExp(`(^|[^-a-zA-Z0-9_])${c.replace(/-/g, "\\-")}(?![-a-zA-Z0-9_])`, "m");
const shared = fs.readdirSync(path.join(SITE, "shared")).filter((f) => f.endsWith(".js") && f !== "admin-card.js");
const sources = [["admin/admin.js", noComments(A)], ["admin/admin.css", noComments(CSS)], ["admin/index.html", IDX], ...shared.map((f) => [`shared/${f}`, noComments(read(`shared/${f}`))])];
for (const [name, src] of sources) for (const c of MOVED_SHELL) { const m = tok(c).exec(src); if (m) fail(`${name} still draws the old shell class .${c} (moved to the one admin card): …${src.slice(Math.max(0, m.index - 50), m.index + 60).replace(/\s+/g, " ")}…`); }
for (const c of NOT_YET) if (MOVED_SHELL.includes(c)) fail(`${c} is both moved and not yet moved`);
const fnBody = (src, name) => { const at = src.search(new RegExp(`(function ${name}\\(|const ${name} = )`)); if (at < 0) return null; let d = 0, i = src.indexOf("{", src.indexOf(")", at)), s0 = i; for (; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) break; } return src.slice(s0, i + 1); };
for (const name of ["acCardHtml", "bk36Card", "mgCard", "systemHealthHtml", "dataKeepHtml", "blogCardHtml", "citationsCardHtml", "fixPlanCardHtml", "categoriesCardHtml", "servicesCardHtml", "descriptionPublishCardHtml", "descriptionDoneCardHtml", "areaCoveredCardHtml",
  "photosWaitCardHtml", "hoursDoneCardHtml", "areaAddCardHtml", "zcClientAskHtml", "socialAdminHtml", "closingListHtml", "tagCardHtml"]) {
  const b = fnBody(A, name);
  if (!b) { fail(`${name} is gone from admin.js (a moved card's producer: re-point this gate if it was renamed)`); continue; }
  if (!/adminCard\(|\bcard\(/.test(b)) fail(`${name} doesn't draw through the one admin card`);
}
const gs = /const gsCard = [^\n]*\n[^\n]*/.exec(A);
if (!gs || !/adminCard\(/.test(gs[0])) fail("gsCard (the Google profile safety cards) doesn't draw through the one admin card");
if (!/function adminCard\(o\) \{ return globalThis\.rgaAdminCard\.cardHtml\(o\); \}/.test(A)) fail("admin.js's adminCard isn't the shared renderer");

// ── 5 · only the renderer writes the card's markup; the Google tinted card stays ─────────────────────────────────────────
for (const [name, src] of sources.filter(([n]) => n.endsWith(".js") || n.endsWith(".html"))) {
  const m = /class=\\?["'`]ob-card(?:["'` ]|-h\b|-st\b|-f\b)/.exec(src);
  if (m) fail(`${name} writes the one card's markup by hand (only shared/admin-card.js may): …${src.slice(m.index, m.index + 80)}…`);
}
if (!/function adminGoogleCardHtml\(/.test(A) || !/\.ob-gcard \{|\.ob-gcard\{/.test(CSS)) fail("the Google tinted card (adminGoogleCardHtml + .ob-gcard) is gone: it stays as the On Google block (locked rule)");
const block = (CSS.split("THE ONE ADMIN CARD (approved card_notice_designs_v1")[1] || "").split("/* 🔒 admin_row9_done_v3")[0];
if (!block) fail("admin.css has no ONE ADMIN CARD block");
else if (/#[0-9a-f]{3,8}\b|rgb\(/i.test(noComments(block))) fail("the one card's CSS picks a colour instead of a state token");

// ── 6 · Leads, and the import ────────────────────────────────────────────────────────────────────────────────────────────
globalThis.rgaAdminCard = AC;
const lv = (o) => { try { return L.adminHtml(null, o); } catch (e) { return `THROW ${e.message}`; } };
const st = (h) => (/data-state="([a-z]+)"/.exec(h) || [])[1];
if (st(lv({ error: "HTTP 500" })) !== "failed") fail(`a Leads read that failed isn't the Failed card (${st(lv({ error: "HTTP 500" }))})`);
if (st(lv({ loading: true })) !== "rga") fail("a Leads card that is reading isn't RGA working");
if (!/data-lds-admin/.test(lv({ loading: true })) || !/Client sees: Dashboard/.test(lv({ loading: true }))) fail("the Leads card lost its data-lds-admin hook or its Client sees line");
if (!/^import "\/shared\/admin-card\.js\?v=[0-9a-z]+";/m.test(A)) fail("admin.js doesn't import shared/admin-card.js with a cache-buster");
if (A.indexOf('import "/shared/admin-card.js') > A.indexOf('import "/shared/leads.js')) fail("admin.js imports leads.js before the renderer it draws with");

// ── 2 · rendered, every state, with the shipped stylesheet ───────────────────────────────────────────────────────────────
let puppeteer; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer isn't installed"); process.exit(2); }
const SHOTS = (process.argv.find((a) => a.startsWith("--shots=")) || "").slice(8);
const FIX = {
  locked: { rows: [["Waits for", "8 Get website access"]], acts: '<button type="button" class="admin-button admin-button-secondary">Skip</button>', sees: "nothing yet" },
  you: { chip: { kind: "late", text: "2 days late" }, label: "Your move · draft it", rows: [["Keyword", "roofer culver city"]], acts: '<button type="button" class="admin-button is-busy">Run</button>' },
  client: { rows: [["They need to", "Add RGA's GitHub app"]] }, rga: { rows: [["Now", "Running PageSpeed…"]] }, google: { rows: [["Sent", "Mon to Fri 7 AM to 6 PM"]] },
  done: { result: { label: "On Google now", html: "<b>Book online</b>", note: "Read back from Google" } }, skipped: { rows: [["Reason", "The client doesn't want it"]], acts: '<button type="button" class="admin-button admin-button-secondary">Undo</button>' },
  failed: { result: { kind: "bad", label: "What went wrong", html: "GitHub refused the change (403)." } }, blocked: { result: { kind: "bad", label: "What stops it", html: "The RGA GitHub app was removed." } },
  unknown: { rows: [["Why", "Google Analytics answered 429."]] },
};
const cards = Object.keys(WANT).map((k) => AC.cardHtml({ state: k, tile: "8", title: `Fixture ${k}`, when: "Nov 11, 8:02 AM PT", ...FIX[k] })).join("");
const TOK = { you: ["--state-you", "--state-you-bg", "--state-you-line"], oth: ["--state-other", "--state-other-bg", "--state-other-line"], ok: ["--state-ok", "--state-ok-bg", "--state-ok-line"],
  bad: ["--state-bad", "--state-bad-bg", "--state-bad-line"], over: ["--state-over", "--state-over-bg", "--admin-border"], unk: ["--state-unk", "--state-unk-bg", "--state-over-edge"] };
let b;
try {
  b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 900 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="admin-body"><div id="host" style="padding:16px;display:grid;gap:12px">${cards}</div></body></html>`, { waitUntil: "load" });
  const got = await p.evaluate((WANT, TOK) => {
    const root = getComputedStyle(document.documentElement), probe = document.createElement("i"); document.body.appendChild(probe);
    const col = (v) => { probe.style.color = root.getPropertyValue(v).trim(); return getComputedStyle(probe).color; };
    return [...document.querySelectorAll("#host > .ob-card")].map((c) => {
      const k = c.getAttribute("data-state"), tone = WANT[k] ? WANT[k][1] : "", [ink, bg, line] = (TOK[tone] || []).map(col);
      const cs = (sel) => { const e = c.querySelector(sel); return e ? getComputedStyle(e) : null; };
      const h = cs(":scope > .ob-card-h"), band = cs(".ob-card-st"), disc = cs(".ob-card-ic"), res = c.querySelector(":scope > .ob-card-res");
      const words = [...c.querySelectorAll(".ob-card-w")].map((e) => e.textContent.trim());
      return { k, words, edge: getComputedStyle(c).borderTopColor, dashed: getComputedStyle(c).borderTopStyle, head: h && h.backgroundColor, band: band && band.color, disc: disc && disc.backgroundColor, ink, bg, line,
        res: res ? getComputedStyle(res).backgroundColor : null, resOk: col("--state-ok-bg"), resBad: col("--state-bad-bg"), when: (c.querySelector(".ob-card-when") || {}).textContent || "",
        icon: !!c.querySelector(".ob-card-ic svg path, .ob-card-ic svg circle, .ob-card-ic svg rect"), foot: !!c.querySelector(":scope > .ob-card-f") };
    });
  }, WANT, TOK);
  if (got.length !== 10) fail(`rendered ${got.length} cards, not 10`);
  for (const g of got) {
    const [word] = WANT[g.k] || [];
    if (g.words.length !== 1 || g.words[0] !== word) fail(`${g.k}: the band says ${JSON.stringify(g.words)}, not exactly "${word}"`);
    if (g.edge !== g.line) fail(`${g.k}: the card's edge is ${g.edge}, its state's line colour is ${g.line}`);
    if (g.head !== g.bg) fail(`${g.k}: the header tint is ${g.head}, its state's background is ${g.bg}`);
    if (g.band !== g.ink) fail(`${g.k}: the band is ${g.band}, its state's ink is ${g.ink}`);
    if (g.disc !== g.ink) fail(`${g.k}: the icon disc is ${g.disc}, its state's ink is ${g.ink}`);
    if (!g.icon) fail(`${g.k}: the band's icon isn't drawn`);
    if ((g.k === "unknown") !== (g.dashed === "dashed")) fail(`${g.k}: the edge is ${g.dashed} (only Couldn't check is dashed)`);
    if (g.k === "done" && g.res !== g.resOk) fail("Done doesn't draw its green result block");
    if ((g.k === "failed" || g.k === "blocked") && g.res !== g.resBad) fail(`${g.k} doesn't draw its red why block`);
  }
  const you = got.find((g) => g.k === "you");
  if (you && !/^Draft it · Nov 11/.test(you.when)) fail(`the label's own words didn't move to the when line ("${you && you.when}")`);
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, "one-admin-card.png"), fullPage: true }); }
  await p.setViewport({ width: 375, height: 800 });
  // measured on the cards themselves (admin.css can clip the page sideways, which would hide a card that is too wide)
  const wide = await p.evaluate(() => [...document.querySelectorAll("#host .ob-card, #host .ob-card *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length);
  if (wide) fail(`the cards run past a phone screen (${wide} pieces wider than 375px)`);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "one-admin-card-phone.png"), fullPage: true });
} catch (e) { console.error(`⚠️  INDETERMINATE — Chrome: ${e.message}`); if (b) await b.close(); process.exit(2); }
await b.close();

if (F.length) { console.error(`❌ check-one-admin-card: ${F.length} problem(s)\n${F.map((x) => `  · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ check-one-admin-card: ten states as drawn (words, colours, icons, result blocks); ob-zc + ob-ac moved with no old shell left; only shared/admin-card.js draws a card; the Google card stays");
