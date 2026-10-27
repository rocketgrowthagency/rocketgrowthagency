#!/usr/bin/env node
// check-a-change-request-is-one-flow.mjs — 2026-10-27, approved client_ask_for_a_change_v1 (Chris on step 3's lock bar: "request a
// change. can we make this better"). RUNS the portal's lockFootHtml and _open-moves on every state:
//   · closed: ONE "Need a change? ›" on the lock line (bottom); the panel has both choices only where a change is allowed, our own
//     inline error, and NO `required` (the browser's grey popup); never the old "Not right?" + "Request a change" pair
//   · asked: ONE band at the top (what they wrote + Cancel my request), the bottom line drops "Need a change?", and the row's old
//     "we're looking into it" band is gone on a locked step; the pill reads "With RGA · since"
//   · the To do list: a flag or a change request — even on a FINISHED step — is RGA's move with a same-day promise
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const P = read("portal/portal.js");
const fnSrc = (n) => { const at = P.indexOf(`function ${n}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${n} moved`); process.exit(2); } return P.slice(at, P.indexOf("\n}\n", at) + 2); };
const line = (re, w) => { const m = P.match(re); if (!m) { console.error(`⚠️  INDETERMINATE — ${w} moved`); process.exit(2); } return m[0].replace(/^const /, "var "); };
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => (x ? "Oct 27" : "") });
vm.runInContext(`${line(/^const LOCK_ICON = [^\n]*;$/m, "LOCK_ICON")}\n${line(/^const CARD_OWNS_LOCK = [^\n]*;$/m, "CARD_OWNS_LOCK")}\n${line(/^const ASK_EXAMPLES = [^\n]*;$/m, "ASK_EXAMPLES")}\n${fnSrc("lockFootHtml")}`, ctx);
const lf = (task, lk, where) => vm.runInContext(`lockFootHtml("m1.access.website", ${JSON.stringify(task)}, ${JSON.stringify(lk)}, "${where}")`, ctx);
const LK = { why: "RGA signed in and confirmed access", edit: "request" }, LK0 = { why: "RGA confirmed it", edit: "none" };
{ const top = lf({}, LK, "top"), bot = lf({}, LK, "bottom");
  if (top) fail("a locked step with nothing asked draws a band at the top");
  if ((bot.match(/Need a change\? ›/g) || []).length !== 1) fail("the closed lock line doesn't carry exactly one \"Need a change? ›\"");
  if (/Not right\?|<summary>Request a change<\/summary>/.test(bot)) fail("the old Not right? / Request a change pair is back");
  if (/\brequired\b/.test(bot)) fail("the panel's box is `required` again — the browser's grey popup instead of our own line");
  if (!/value="wrong"/.test(bot) || !/value="change"/.test(bot) || !/class="pm-chg-err" hidden/.test(bot)) fail("the panel lost a choice or its own inline error");
  if (!/that's not our website, or we didn't add you/.test(bot)) fail("step 3's examples are gone from the choices"); }
{ const bot = lf({}, LK0, "bottom"); if (/value="change"/.test(bot) || !/name="kind" value="wrong"/.test(bot)) fail("a step that can't be changed offers \"I want to change something\" (only \"something's wrong\" fits)"); }
for (const [task, label, kw] of [[{ client_flagged: { at: "x", note: "That's not our site" } }, "a flag", /data-step-unflag/], [{ change_request: { at: "x", note: "Add my office manager" } }, "a change request", /data-chreq-cancel/]]) {
  const top = lf(task, LK, "top"), bot = lf(task, LK, "bottom");
  if ((top.match(/class="pm-chg-band"/g) || []).length !== 1 || !/<q>/.test(top) || !kw.test(top) || !/Cancel my request/.test(top)) fail(`${label}: not ONE band with what they wrote + Cancel my request`);
  if (/Need a change\?/.test(bot)) fail(`${label}: the bottom still offers Need a change? while one is open`);
}
if (!/flagged && !stepLk\n\s*\? `<p class="pm-flagged">/.test(P)) fail("the row's second \"we're looking into it\" band shows on a locked step again");
if (!/const ownerPill = askLk \? \{ text: `With RGA\$\{askAt \? ` · since \$\{monthDay\(askAt\)\}` : ""\}`, cls: "rga" \}/.test(P)) fail("a locked step asked about doesn't read \"With RGA · since\"");
// the lock line is the card's LAST line (Chris 10-27: "match mockup"): marked bottom, seated by the same pass that seats the how-to
if (!/data-lock-pos="bottom"/.test(lf({}, LK, "bottom")) || !/requestAnimationFrame\(\(\) => \{ _seatQueued = false; seatHowFolds\(\); seatLockFoots\(\); \}\)/.test(P) || !/card\.appendChild\(f\); f\.classList\.add\("in-card"\);/.test(P)) fail("the lock line isn't seated inside the card as its footer");
if (!/const DONE_STRIP = "[^"]*\.pm-lockfoot/.test(P)) fail("the lock line inside the card counts as a done card's record (DONE_STRIP)");
if (!/isDone && !askLk \? " is-done" : askLk \? " is-rga"/.test(P)) fail("a step with RGA still shows its done tick");
// the To do list, RUN
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let OM; try { OM = req(`${SITE}/netlify/functions/_open-moves.js`); } catch (e) { console.error(`⚠️  _open-moves won't load: ${e.message}`); process.exit(2); }
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const mk = (t3) => OM.openMoves({ playbooks: PB, data: { tasks: { "m1.access.website": t3 } }, now: "2026-10-27T20:00:00Z" });
{ const m = mk({ status: "done", access: { confirmed_at: "x" }, client_flagged: { at: "2026-10-27T19:00:00Z", note: "Not our site" } }).find((x) => x.step_id === "m1.access.website");
  if (!m || m.owner !== "rga" || m.kind !== "client_request" || !/wrong/.test(m.what)) fail("a flag on a FINISHED step never reaches the To do list as RGA's move"); }
{ const m = mk({ status: "done", access: { confirmed_at: "x" }, change_request: { at: "2026-10-27T19:00:00Z", note: "Add my office manager" } }).find((x) => x.step_id === "m1.access.website");
  if (!m || m.owner !== "rga" || !/change request/.test(m.what) || m.days !== OM.CONFIRM_DAYS) fail("a change request isn't RGA's same-day move in the To do list"); }
if (F.length) { console.error(`❌ a change request is one flow — ${F.length} regression(s):\n  · ${F.join("\n  · ")}`); process.exit(1); }
console.log("✅ a change request is one flow: one Need a change? on the lock line, a panel with its own inline error (no browser popup), both choices only where a change is allowed, ONE band with their words + Cancel, no second band, \"With RGA · since\", and RGA's same-day move in the To do list even on a finished step");
