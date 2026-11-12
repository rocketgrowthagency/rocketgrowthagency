#!/usr/bin/env node
// check-every-internal-call-carries-the-secret.mjs — A SERVER'S OWN CALL TO A GUARDED FUNCTION SENDS THE INTERNAL SECRET (11-11).
//
// 🔴 WHY. billing-daily-check POSTed to notify-client-stage with { "Content-Type": "application/json" } only. notify-client-stage
// accepts a staff login OR the internal secret; a cron has no login, so _auth refused every call, and the only trace was a
// console.warn. The day 8 / 15 / 18 past-due, warning and pause emails had NEVER sent, while every other caller
// (stripe-webhook, _auto-accept) carried `"x-internal-secret": process.env.INTERNAL_FN_SECRET || ""`. Found by master audit #9.
//
// THE RULE, with the distinction feedback_forwarding_a_request_must_not_add_the_secret draws:
//   · a function's OWN server call (a cron, a webhook, a job) to a function that checks the internal secret must SEND it;
//   · a function that FORWARDS a caller's request (spreads `...event.headers` / passes the caller's Authorization) must NOT add the
//     real secret unless it first checks the caller's own secret (an inbound check in the same file). Adding it vouches for
//     whoever called, and the forwarder's URL is public (flow-execute-heavy-background, 10-19).
// HOW: every `fetch(` in netlify/functions whose URL names `/.netlify/functions/<name>` is read with its options (brace-matched);
// <name> is "guarded" when its own source calls requireInternalSecret / requireCronOrInternal / requireWorkspaceForClientOrInternal
// or compares x-internal-secret against INTERNAL_FN_SECRET. A call whose URL is built elsewhere (a variable) can't be read and is
// counted, never guessed. The classifier proves itself on fixtures first: a gate that can't flag a known miss says INDETERMINATE.
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 a call is missing the secret, or a forwarder adds it · 2 can't tell
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const DIR = path.join(SITE, "netlify/functions");
if (!fs.existsSync(DIR)) { console.error(`⚠️  INDETERMINATE: no ${DIR}`); process.exit(2); }

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const GUARD = /requireInternalSecret\s*\(|requireCronOrInternal\s*\(|requireWorkspaceForClientOrInternal\s*\(|x-internal-secret["'\]]*\s*\]?\s*[!=]==?\s*(?:process\.env\.)?INTERNAL_FN_SECRET|(?:===|!==)\s*expected\b[\s\S]{0,200}INTERNAL_FN_SECRET|INTERNAL_FN_SECRET[\s\S]{0,300}x-internal-secret[\s\S]{0,120}(?:===|!==)/;
const INBOUND = /requireInternalSecret\s*\(|requireCronOrInternal\s*\(|requireWorkspaceForClientOrInternal\s*\(|(?:===|!==)\s*process\.env\.INTERNAL_FN_SECRET|process\.env\.INTERNAL_FN_SECRET\s*(?:===|!==)/;
const SENDS = /["']?x-internal-secret["']?\s*:\s*[^,}\n]*(?:INTERNAL_FN_SECRET|\bsecret\b|\bSECRET\b|internalSecret)/i;
// forwarding = the caller's own headers or login go along: `...event.headers`, `headers: event.headers`, or an Authorization read off event.headers
const FORWARDS = /\.\.\.\s*\(?\s*(?:event|evt|req)\.headers|headers\s*:\s*(?:event|evt|req)\.headers|["']?authorization["']?\s*:\s*[(\s]*(?:(?:event|evt|req)\.headers|auth\b|token\b|`Bearer \$\{token\}`)/i;

/** The text of a call starting at `fetch(`: up to its matching close paren. */
function callText(src, at) {
  let depth = 0, i = src.indexOf("(", at), q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === "\\") { j++; continue; } if (c === q) q = null; else if (q === "`" && c === "$" && src[j + 1] === "{") { /* template expr: count braces as code */ } continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return src.slice(at, j + 1); }
  }
  return src.slice(at, at + 600);
}
/** Header helpers a call can name instead of an inline object: `const H = () => ({ ... })` / `const H = { ... }` / `function H() {...}`. */
function helperCarries(src, name) {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*([\\s\\S]{0,400}?);\\s*\\n|function\\s+${name}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,400}?)\\n\\}`);
  const m = re.exec(src);
  return !!m && SENDS.test(m[1] || m[2] || "");
}
/** → { target, sends, forwards } for one call's text in one file's source. */
function classify(src, call) {
  const t = /\/\.netlify\/functions\/([a-z0-9_-]+)/i.exec(call);
  const opts = call.slice(call.indexOf(","));
  let sends = SENDS.test(opts);
  if (!sends) for (const m of opts.matchAll(/headers\s*:\s*(?:\{[^}]*\.\.\.\s*)?([A-Za-z_$][\w$]*)\s*\(?/g)) if (helperCarries(src, m[1])) sends = true;
  if (!sends) for (const m of opts.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)\s*\(?/g)) if (!/^(event|evt|req)$/.test(m[1]) && helperCarries(src, m[1])) sends = true;
  return { target: t ? t[1] : null, sends, forwards: FORWARDS.test(opts) };
}
function judge(file, src, guarded) {
  const out = { problems: [], calls: 0, unreadable: 0 };
  const code = stripComments(src), inbound = INBOUND.test(code);
  for (const m of code.matchAll(/\bfetch\s*\(/g)) {
    const call = callText(code, m.index);
    if (!/\/\.netlify\/functions\//.test(call.slice(0, 300))) {
      if (/^fetch\s*\(\s*[A-Za-z_$][\w$]*\s*[,)]/.test(call) && /\/\.netlify\/functions\//.test(code)) out.unreadable++;
      continue;
    }
    const c = classify(code, call);
    if (!c.target || !guarded.has(c.target)) continue;
    out.calls++;
    if (c.forwards && c.sends && !inbound) out.problems.push(`${file} forwards its caller's request to ${c.target} AND adds the real internal secret, without checking the caller's own secret first`);
    else if (!c.forwards && !c.sends) out.problems.push(`${file} calls ${c.target} (which needs the internal secret) without sending it: _auth refuses the call`);
  }
  return out;
}

// ── 1 · the classifier proves itself on fixtures ──────────────────────────────────────────────────────────────────────────────
{
  const G = new Set(["notify-client-stage"]);
  const cases = [
    ["a cron call with no secret", 'await fetch(`${SITE}/.netlify/functions/notify-client-stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });', 1],
    ["a cron call with the secret", 'await fetch(`${SITE}/.netlify/functions/notify-client-stage`, { method: "POST", headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_FN_SECRET || "" }, body: "{}" });', 0],
    ["a cron call through a header helper", 'const INTERNAL = () => ({ "x-internal-secret": process.env.INTERNAL_FN_SECRET || "" });\nawait fetch(`${SITE}/.netlify/functions/notify-client-stage`, { method: "POST", headers: INTERNAL(), body: "{}" });', 0],
    ["a forwarder that adds the secret", 'exports.handler = async (event) => { await fetch(`${B}/.netlify/functions/notify-client-stage`, { method: "POST", headers: { ...event.headers, "x-internal-secret": process.env.INTERNAL_FN_SECRET }, body: event.body }); };', 1],
    ["a forwarder that checks first", 'exports.handler = async (event) => { if (event.headers["x-internal-secret"] !== process.env.INTERNAL_FN_SECRET) return; await fetch(`${B}/.netlify/functions/notify-client-stage`, { method: "POST", headers: { ...event.headers, "x-internal-secret": process.env.INTERNAL_FN_SECRET }, body: event.body }); };', 0],
    ["a forwarder passing the caller's login", 'exports.handler = async (event) => { await fetch(`${B}/.netlify/functions/notify-client-stage`, { method: "POST", headers: { authorization: event.headers.authorization }, body: event.body }); };', 0],
    ["a call to an unguarded function", 'await fetch(`${SITE}/.netlify/functions/public-thing`, { method: "POST" });', 0],
  ];
  for (const [name, src, want] of cases) {
    const got = judge("fixture.js", src, G).problems.length;
    if (got !== want) { console.error(`⚠️  INDETERMINATE: the classifier gets "${name}" wrong (${got} problems, want ${want}); it can't be trusted on the code`); process.exit(2); }
  }
}

// ── 2 · the code ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8")]));
const guarded = new Set(files.filter((f) => GUARD.test(stripComments(src[f]))).map((f) => f.replace(/\.js$/, "")));
if (guarded.size < 10) { console.error(`⚠️  INDETERMINATE: only ${guarded.size} functions look secret-guarded; the guard pattern is stale`); process.exit(2); }
if (!guarded.has("notify-client-stage")) { console.error("⚠️  INDETERMINATE: notify-client-stage no longer reads as guarded; re-read the guard pattern"); process.exit(2); }
const problems = [];
let calls = 0, unreadable = 0;
for (const f of files) {
  const r = judge(f, src[f], guarded);
  problems.push(...r.problems); calls += r.calls; unreadable += r.unreadable;
}
if (calls < 10) { console.error(`⚠️  INDETERMINATE: only ${calls} internal calls found; the call reader is stale`); process.exit(2); }
console.log(`── internal calls carry the internal secret ──\n  ${guarded.size} secret-guarded functions · ${calls} server calls to them read${unreadable ? ` · ${unreadable} call(s) build their URL elsewhere and were not read` : ""}`);
if (problems.length) {
  console.error(`🔴 ${problems.length} internal call(s) break the rule:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("  A cron or webhook's OWN call sends \"x-internal-secret\": process.env.INTERNAL_FN_SECRET || \"\"; a forwarder checks its caller's secret first.");
  process.exit(1);
}
console.log("✅ every server call to a secret-guarded function sends the secret, and no forwarder adds it unchecked");
process.exit(0);
