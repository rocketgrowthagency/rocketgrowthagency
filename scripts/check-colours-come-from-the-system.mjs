#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-colours-come-from-the-system.mjs
//
// 🔴 WHY (Chris, 2026-10-08): "audit all cards notices and color schemes … and make sure new work we
// do moving forward also … adheres to these mockup guidelines." The audit found 376 colours in use
// and "your turn" drawn yellow, orange, olive and BLUE on different surfaces — each picked alone.
// Approved: reports/mockups/rga_ui_state_system_v1.html · memory reference_ui_state_system.
//
// HOLDS:
//   1. the --state-* tokens exist in BOTH stylesheets with IDENTICAL values, declared once each
//   2. no token is declared twice with different values (the --portal-amber bug: olive won silently)
//   3. the state families that were merged never take a RETIRED shade again
//   4. the decisions hold: waiting-on-the-client and a live call are "not yours now" (blue)
//   5. RATCHET: the number of distinct colours per stylesheet can only go down
//
// exit 0 = the system holds · 1 = a colour was picked, not a state · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${rel}`); process.exit(2); } };
const files = { admin: read("admin/admin.css"), portal: read("portal/portal.css") };
const fails = []; const F = (m) => fails.push(m);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// 1 + 2 · tokens
const STATE = ["you", "you-bg", "you-line", "other", "other-bg", "other-line", "other-edge", "ok", "ok-bg", "ok-line", "ok-fill",
  "bad", "bad-bg", "bad-line", "bad-edge", "over", "over-bg", "over-edge", "unk", "unk-bg", "care", "care-bg", "care-line"];
const decls = (css) => { const m = new Map(); for (const d of strip(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) { const k = d[1], v = d[2].trim().toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k).push(v); } return m; };
const D = { admin: decls(files.admin), portal: decls(files.portal) };
for (const t of STATE) {
  const k = `--state-${t}`;
  const a = D.admin.get(k) || [], p = D.portal.get(k) || [];
  if (a.length !== 1) F(`admin.css declares ${k} ${a.length} time(s) — exactly once`);
  if (p.length !== 1) F(`portal.css declares ${k} ${p.length} time(s) — exactly once`);
  if (a[0] && p[0] && a[0] !== p[0]) F(`${k} differs: admin ${a[0]} vs portal ${p[0]} — one system, one value`);
}
for (const [name, m] of Object.entries(D)) {
  for (const [k, vs] of m) if (new Set(vs).size > 1 && !/^--(fs|lh|admin-shadow)/.test(k)) F(`${name}.css declares ${k} twice with different values (${[...new Set(vs)].join(" vs ")}) — the later one wins silently`);
}

// 3 · retired shades stay retired in the merged state families
const RETIRED = ["#eab308", "#f0b429", "#d98a00", "#fef3c7", "#92400e", "#dc2626", "#8f2519", "#8e1f0b", "#137a3d", "#15803d", "#166534", "#1a7f4b", "#12b76a", "#5e4200", "#a35a06", "#9a5b06", "#e8a400", "#f04438", "#1e9e4a", "#22c55e"];
const FAMILY = /\.(pm-nextstep|pm-notice|pm-badge-(warn|danger|info|neutral)|pm-btn\.amber|pm-status-card|pm-step\.warn|pm-action|ap-state|ap-action|portal-nav-badge|pm-flagged|kickoff-slot|pm-choice|portal-pill|portal-badge|portal-alert|pm-how-only|pm-slot|pm-oc|how-note|portal-photo-st|pm-recheck|admin-alert|admin-pill|admin-dot|admin-badge|admin-turn-owner|ob-step|ob-status|ob-state|ob-wait|ob-band|rga-modal-btn|admin-action-feedback|admin-section-status|kb-|ob-sm|ob-meter|pc-dot|mc-gate|mc-rstep|ax-dot|ax-pill|ob-vd|ob-context|kc-yes|ob-vol|ob-note|ob-verdict|ob-mail-st|docs-card|fct|fq|am-pill|admin-banner|ob-detchip|portal-inline-feedback)\b/;
for (const [name, css] of Object.entries(files)) {
  for (const r of strip(css).matchAll(/(?:^|(?<=[\n}]))([^{}@]*?)\{([^{}]*)\}/g)) {
    const sel = r[1].trim(), body = r[2].toLowerCase();
    if (!FAMILY.test(sel) || /\.ca-|rank|legend|series/.test(sel)) continue;
    for (const h of RETIRED) if (body.includes(h)) F(`${name}.css ${sel.slice(0, 70)} uses retired ${h} — take the state's token instead`);
  }
}

// 4 · the two decisions (approved 2026-10-08)
const rule = (css, sel) => { const m = strip(css).match(new RegExp(`(?:^|[\\n}])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`)); return m ? m[1] : null; };
const NEED = [
  ["admin", ".ob-wait", /--state-other/, "the waiting-on-the-client band is not blue (Decision 1)"],
  ["admin", ".admin-turn-owner.waiting", /--state-other/, "the waiting-on-the-client pill is not blue (Decision 1)"],
  ["admin", ".ob-status.active.is-wait", /--state-other/, "a step waiting on the client is not blue (Decision 1)"],
  ["admin", ".ob-status.active.is-live", /--state-other-edge/, "a live call is not blue (Decision 2)"],
  ["admin", ".admin-turn-owner.is-kick-live", /--state-other/, "the live-call pill is not blue (Decision 2)"],
  ["portal", ".pm-cd.live", /accent|--state-other/, "the client's live countdown is not blue (Decision 2)"],
  ["portal", ".pm-nextstep", /--portal-turn|--state-you/, "the client's your-move banner stripe is not the your-move colour"],
  ["portal", ".pm-notice.is-warn", /--state-you/, "a your-move notice is not the your-move colour"],
  ["admin", ".admin-alert.c .ic", /--state-bad/, "a critical alert has no red icon tile"],
];
// a "blue" decision must also carry NO amber or green anywhere in the rule (a half-reverted rule passed)
const NOT_BLUE = /#f0dcc0|#fffbf3|#8a5a00|#b45309|#fff6e8|#e8b96a|#0c5132|#e9f6ec|--state-you|--state-ok/i;
for (const [f, sel, re, why] of NEED) {
  const b = rule(files[f], sel);
  if (b == null) F(`${f}.css: ${sel} is gone — ${why}`);
  else if (!re.test(b)) F(`${f}.css: ${why}`);
  else if (/Decision/.test(why) && NOT_BLUE.test(b)) F(`${f}.css: ${sel} still carries an amber/green value — ${why}`);
}
if (/#portalStatusPill[^{]*\{[^}]*(background|color)\s*:(?!\s*currentColor)/.test(strip(files.portal))) F("portal.css: #portalStatusPill sets its own colour again — the state class must decide (it was forced green)");

// 4b · the card system's own wait/off tokens (approved client_card_system_v1, Chris 10-29) — declared ONCE in portal.css :root with
// the mockup's values; the two colours it ADDED (#5b6b8a, #d9dfea) used ONLY through the token (a literal one in a rule is picked)
const CS_TOK = { "--cs-wait": "#5b6b8a", "--cs-wait-bg": "#eef1f6", "--cs-wait-line": "#d9dfea", "--cs-off": "#9099a8" };
for (const [k, v] of Object.entries(CS_TOK)) {
  const p = D.portal.get(k) || [];
  if (p.length !== 1 || p[0] !== v) F(`portal.css declares ${k} ${p.length} time(s)${p[0] ? ` as ${p[0]}` : ""} — the card system's token, exactly once, ${v} (client_card_system_v1)`);
  // the two values the system ADDED (the other two were already in use elsewhere, before the tokens existed)
  if (!["--cs-wait", "--cs-wait-line"].includes(k)) continue;
  const lit = (strip(files.portal).match(new RegExp(v, "gi")) || []).length;
  if (lit > 1) F(`portal.css writes ${v} (${k}) ${lit - 1} more time(s) as a literal — use var(${k})`);
}

// 5 · ratchet
// 2026-10-08 after the merge (was 257 / 119). portal 107 → 109 on 2026-10-29: EXACTLY the card system's approved --cs-wait #5b6b8a
// and --cs-wait-line #d9dfea (the other two tokens' values were already in use) — bounded by 4b, which holds them to one declaration.
// admin 236 → 238 (Chris 10-30): the waiting Google card takes the client system's blue-grey (#5b6b8a, #d9dfea), so both portals match
// admin 238 -> 246 (Chris 11-12): the approved dark "Spotify-style" sign-in adds EXACTLY its --lock-* palette (declared in :root only; the old light
// sign-in colours that went away are netted in); check-admin-two-step-sign-in holds every lock RULE to var(--lock-*) with no literal.
const BASELINE = { admin: 246, portal: 109 };
const norm = (c) => { c = c.toLowerCase(); return c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c; };
for (const [name, css] of Object.entries(files)) {
  const n = new Set((strip(css).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(norm)).size;
  if (n > BASELINE[name]) F(`${name}.css now uses ${n} distinct colours, baseline ${BASELINE[name]} — a colour was picked instead of a state token`);
  else console.log(`  ${name}.css: ${n} distinct colours (baseline ${BASELINE[name]}; may only go down)`);
}

if (fails.length) { console.error("🔴 a colour was picked, not a state:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ the state system holds: one token set in both portals, no retired shades, both decisions, the count did not grow");
