#!/usr/bin/env node
// check-no-dormant-exports.mjs — EVERY FUNCTION A BROWSER/SHARED FILE EXPORTS IS CALLED BY SOMETHING (checkers build 11-11; master map
// approved by Chris). Inventory class "Dormant code: exports / helpers": NONE before today.
//
// GUARDS: a helper in shared/, admin/ or portal/ that nothing calls is a feature that silently stopped being used (its caller was
// rewritten and the old path kept "just in case"), and the next reader trusts it as live. Dormant server functions are
// check-orphan-functions; dormant CSS is check-no-new-dormant-css; this is the helpers in between.
// HOLDS: every exported FUNCTION (export function/const, export { }, module.exports = { } or = api, exports.x =) of a shared/, admin/ or
// portal/ .js file is named by some OTHER file (website code or a Scraper script, gates included: a test seam is a use) or USED inside
// its own file. One that is neither is dormant, and fails unless it is in KEEP (with a reason) or in BACKLOG (the six found when this
// gate was built: printed every run, may only shrink; an entry that is used again, or gone, fails until it is taken off).
// Exported-but-only-used-inside counts are printed (the export is unneeded; the code is alive), never failed.
// 🔑 SELF-PROVING: the rules (scripts/lib/dormant-exports.mjs, read from SCRAPER_COPY_DIR when set) run on fixtures first; else INDETERMINATE.
// Exit 0 = no new dormant export · 1 = a dormant export (or a stale backlog line) · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const lib = fs.existsSync(path.join(SCR, "scripts/lib/dormant-exports.mjs")) ? path.join(SCR, "scripts/lib/dormant-exports.mjs") : path.join(REAL, "scripts/lib/dormant-exports.mjs");
const L = await import(pathToFileURL(lib).href);

const KEEP = {
  // "shared/x.js:name": "why it is exported with no caller",
};
// 🔒 FOUND 11-11 when this gate was built (no caller anywhere, not used in their own file). Printed every run; may only shrink. Removing
// them is a code change for the next website build.
const BACKLOG = ["admin/schedule-dialogs.js:ptHm24", "shared/deliverable-preview.js:serpPreview", "shared/deliverable-preview.js:listingPreview", "shared/setup-split.js:photosWords", "shared/setup-split.js:pastLine", "shared/step3-go-ahead.js:sameWeek"];

// ── self-test ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const files = new Map([
    ["shared/a.js", "export function used() {}\nexport function dead() {}\nexport const arrowDead = (x) => x;\nexport const LIMIT = 5;\nfunction inner() {}\nexport { inner };\nconst z = inner();"],
    ["shared/b.js", "(function(){ function helper(){ return 1; } function lonely(){ return 2; } const api = { helper, lonely, run: () => helper() }; if (typeof module !== 'undefined') module.exports = api; })();"],
    ["portal/portal.js", "import { used } from '/shared/a.js'; used(); const r = api.run();"],
  ]);
  const got = L.dormantExports(files, (f) => /^(shared|admin|portal)\//.test(f)).map((d) => `${d.file}:${d.name}:${d.internal ? "in" : "dead"}`).sort().join(",");
  const want = ["shared/a.js:arrowDead:dead", "shared/a.js:dead:dead", "shared/a.js:inner:in", "shared/b.js:helper:in", "shared/b.js:lonely:dead"].join(",");
  if (got !== want) idk(`self-test: the rules found [${got}], not [${want}]`);
}

// ── the real check ───────────────────────────────────────────────────────────────────────────────────────────────────────
const files = new Map();
const walk = (base, d) => { let es = []; try { es = fs.readdirSync(path.join(base, d), { withFileTypes: true }); } catch { return; } for (const e of es) { if (/^(node_modules|\.git|\.claude|\.netlify|v|reports|docs|output|coverage)$/.test(e.name)) continue; const r = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) walk(base, r); else if (/\.(js|mjs|cjs|html|gs)$/.test(e.name)) { try { files.set(base === SITE ? r : `__scraper/${r}`, fs.readFileSync(path.join(base, r), "utf8")); } catch { /* unreadable */ } } } };
walk(SITE, "");
walk(SCR, "scripts");
if (SCR !== REAL) walk(REAL, "scripts");   // scripts the mutation copy does not carry
for (const k of [...files.keys()]) if (k.endsWith("/check-no-dormant-exports.mjs")) files.delete(k);   // its own backlog names them
const owned = (f) => /^(shared|admin|portal)\/[^/]+\.m?js$/.test(f);
if ([...files.keys()].filter(owned).length < 20) idk("too few shared/admin/portal files read");
const found = L.dormantExports(files, owned);
const dead = found.filter((d) => !d.internal).map((d) => `${d.file}:${d.name}`);
const internal = found.filter((d) => d.internal).length;
const F = [];
for (const k of dead) if (!(k in KEEP) && !BACKLOG.includes(k)) F.push(`${k} is exported, and nothing calls it (not another file, not its own)`);
for (const k of BACKLOG) if (!dead.includes(k)) F.push(`${k} is on the dormant backlog, and it is used again or gone: take it off BACKLOG`);
for (const [k, why] of Object.entries(KEEP)) { if (!dead.includes(k)) F.push(`${k} is kept as dormant and is used again or gone: take it off KEEP`); if (String(why).length < 40) F.push(`${k} is kept without a real reason`); }
console.log(`ℹ️  dormant backlog (found 11-11, may only shrink): ${BACKLOG.length} · exported but used only inside their own file: ${internal}`);
if (F.length) { console.error(`🔴 a dormant export:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log(`✅ no new dormant export: ${found.length + 0} of the exported functions in ${[...files.keys()].filter(owned).length} shared/admin/portal files have no outside caller; none is dead beyond the ${BACKLOG.length}-line backlog`);
