#!/usr/bin/env node
// check-a-failed-mode-read-names-no-number.mjs — A FAILED MODE READ IS NOT A MODE, MANAGED IS THE ONE DEFAULT, AND THE DAILY WALK WALKS BOTH MODES
// (approved master mockup #16 portal modes, Chris 11-11: "ALL APPROVED. DO ALL RECOMMENDED").
//
// 🔴 WHY: _portal-mode.clientMode returned null when the database didn't answer, and null means "not chosen" = the 21-step numbers. So a
// managed client could be sent a self-serve step number during a Supabase hiccup: an unread answer treated as a value. Holds when:
//   · a failed read (an error status, a throw, an answer that isn't a list, no database settings) returns PM.UNREAD, never null; a client
//     with no mode is still null (not chosen); a wrong id is null
//   · every step number in an unread mode is null, so the shared words (portal-mode-words) name a step by title only, open moves carry no
//     number, and portal-message files the message under "Step: <title>"; nothing managed-only is allowed (isManaged is false)
//   · MANAGED IS THE DEFAULT, in one shared place (shared/portal-mode.js DEFAULT_MODE), which admin's new-client paths read
//   · the daily walk's test clients: Lone Star (the new-client walk) declared managed, Granite State (the Month 2 walk) declared self-serve
//     (null), so both modes are walked every day (the live rows follow with create-new-test-client.mjs --sync: Chris's step)
// Runs the shipped code on fakes. Exit 0 holds · 1 broken · 2 couldn't tell.
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SCRAPER_COPY_DIR || fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const F = [], fail = (m) => F.push(m), ind = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
let PM, PMF, Words, OM, PB, MSG, ADM, C;
try {
  PM = req("../../shared/portal-mode.js"); PMF = req("./_portal-mode.js"); Words = req("../../shared/portal-mode-words.js"); OM = req("./_open-moves.js");
  PB = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  MSG = fs.readFileSync(`${SITE}/netlify/functions/portal-message.js`, "utf8"); ADM = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  const cl = fs.existsSync(`${SCRAPER}/scripts/acceptance/clients.mjs`) ? `${SCRAPER}/scripts/acceptance/clients.mjs` : fileURLToPath(new URL("./acceptance/clients.mjs", import.meta.url));
  C = await import(pathToFileURL(cl).href);
} catch (e) { ind(`harness: ${e.message}`); }
if (!("UNREAD" in PM) || !("DEFAULT_MODE" in PM)) fail("shared/portal-mode.js has no UNREAD or DEFAULT_MODE");
const CID = "11111111-2222-4333-8444-555555555555";
const realFetch = globalThis.fetch;
const answer = async (how) => {
  process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  globalThis.fetch = async () => {
    if (how === "throw") throw new Error("ECONNRESET");
    if (how === "500") return { ok: false, status: 500, json: async () => ({}) };
    if (how === "object") return { ok: true, status: 200, json: async () => ({ message: "odd" }) };
    if (how === "managed") return { ok: true, status: 200, json: async () => [{ portal_mode: "managed" }] };
    if (how === "null") return { ok: true, status: 200, json: async () => [{ portal_mode: null }] };
    return { ok: true, status: 200, json: async () => [] };
  };
  const quiet = console.error; console.error = () => {};
  try { return await PMF.clientMode(CID); } finally { console.error = quiet; globalThis.fetch = realFetch; }
};
try {
  // ── the read ──
  for (const how of ["throw", "500", "object"]) { const m = await answer(how); if (m !== PM.UNREAD) fail(`a failed mode read (${how}) returns ${JSON.stringify(m)}, not "unread" (null means not chosen = the 21-step numbers)`); }
  if ((await answer("managed")) !== "managed") fail("a managed client no longer reads as managed");
  if ((await answer("null")) !== null) fail("a client with no mode chosen no longer reads as null (not chosen)");
  { delete process.env.SUPABASE_URL; const quiet = console.error; console.error = () => {}; const m = await PMF.clientMode(CID); console.error = quiet; if (m !== PM.UNREAD) fail(`no database settings reads as ${JSON.stringify(m)}, not unread`); }
  if ((await PMF.clientMode("not-a-uuid")) !== null) fail("a wrong client id no longer reads as null");

  // ── an unread mode names no number, anywhere ──
  const M1 = PB.month1 || [];
  const numbered = M1.filter((s) => s.clientStepNo != null || s.managedStepNo != null);
  if (!numbered.length) ind("the playbook has no numbered steps");
  for (const s of numbered) {
    if (PM.stepNo(s, PM.UNREAD) !== null) { fail(`${s.id} still has number ${PM.stepNo(s, PM.UNREAD)} when the mode couldn't be read`); break; }
    if (/^Step \d/.test(Words.name(s, PM.UNREAD, null))) { fail(`the shared words name ${s.id} "${Words.name(s, PM.UNREAD, null)}" on an unread mode`); break; }
    if (Words.sentence(s, PM.UNREAD, null) !== null) { fail(`the shared words say "${Words.sentence(s, PM.UNREAD, null)}" for ${s.id} on an unread mode`); break; }
  }
  if (PM.isManaged(PM.UNREAD)) fail("an unread mode counts as managed (managed-only actions would be allowed on a guess)");
  // the control: the same steps DO carry numbers in self-serve (so the check above can tell)
  if (!numbered.some((s) => /^Step \d/.test(Words.name(s, null, null)))) ind("no step carries a number even in self-serve: the check above can't tell");
  const moves = OM.openMoves({ playbooks: PB, data: { tasks: {} }, now: "2026-11-11T12:00:00.000Z", mode: PM.UNREAD });
  const named = moves.filter((m) => /Step \d/.test(String(m.step || "")));
  if (!moves.length) ind("no open moves on an empty record: nothing to read the names from");
  // the control: the same record in self-serve DOES name numbers, so the check above can tell
  if (!OM.openMoves({ playbooks: PB, data: { tasks: {} }, now: "2026-11-11T12:00:00.000Z", mode: null }).some((m) => /Step \d/.test(String(m.step || "")))) ind("open moves carry no step number even in self-serve: the check can't tell");
  if (named.length) fail(`open moves on an unread mode still carry step numbers (${named.slice(0, 2).map((m) => m.step).join(" · ")})`);
  if (!/function stepWhere\(step, mode\) \{\n\s*if \(mode === PMode\.UNREAD\) return `Step: \$\{step\.label\}`;/.test(MSG)) fail("portal-message files a message under a step number when the mode couldn't be read");

  // ── managed is the one default ──
  if (PM.DEFAULT_MODE !== "managed") fail(`the shared default mode is ${JSON.stringify(PM.DEFAULT_MODE)}, not managed`);
  if (!/const clientDefaultMode = \(\) => \(globalThis\.rgaPortalMode && globalThis\.rgaPortalMode\.DEFAULT_MODE\) \|\| "managed";/.test(ADM)) fail("admin doesn't read the shared default for a new client");
  const uses = (ADM.match(/portal_mode: clientDefaultMode\(\)/g) || []).length;
  if (uses < 2) fail(`admin's two new-client paths don't both use the shared default (${uses} of 2)`);

  // ── both modes walked daily ──
  if (!C.NEW_CLIENT_ROW || C.NEW_CLIENT_ROW.portal_mode !== "managed") fail("the new-client walk (Lone Star) isn't declared managed, so managed Setup with open steps has no daily walk");
  if (!C.MONTH2_CLIENT_ROW || !("portal_mode" in C.MONTH2_CLIENT_ROW) || C.MONTH2_CLIENT_ROW.portal_mode !== null) fail("the Month 2 walk (Granite State) isn't declared the self-serve walk (portal_mode null)");
} catch (e) { ind(`threw: ${String(e.stack || e.message).split("\n").slice(0, 3).join(" ")}`); }
finally { globalThis.fetch = realFetch; }

if (F.length) { console.error(`❌ portal modes — ${F.length} problem(s):`); for (const x of F) console.error(`  · ${x}`); process.exit(1); }
console.log("✅ a failed mode read names no number (unread, never null: titles only in the shared words, open moves and messages; nothing managed-only allowed), managed is the one shared default admin reads, and the daily walk declares Lone Star managed and Granite State self-serve");
