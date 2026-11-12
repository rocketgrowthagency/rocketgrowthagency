#!/usr/bin/env node
// check-no-secret-value-anywhere.mjs — NO SECRET'S VALUE SITS WHERE IT CAN BE READ, COPIED OR PUBLISHED (checkers build 11-11; master map
// approved by Chris). → memory feedback_never_print_a_secret_value · project_rga_videos_to_storage ("never write an env value in a note")
//
// GUARDS: access control was gated, but NOTHING looked for a secret's VALUE in the places it leaks to: a note in memory, a report, a gate's
// fixture, a launchd log in /tmp that printed a URL with ?token=, a committed file. Only Netlify's build-time secret scan did, and it
// refuses the deploy after the fact.
// HOW: the secret-named values in the Scraper .env (plus any secret-named variable already in this process's environment) become sha256
// digests; every line of every file below is cut into tokens and each token is hashed and looked up (scripts/lib/secret-scan.mjs). A
// finding prints the key NAME and file:line ONLY, never the value and never the line.
// WHERE: both repos' tracked files (git ls-files), the memory folder, website reports/ (tracked or not), and /tmp's RGA logs.
// 🔑 SELF-PROVING: every run first plants a freshly generated fake secret in a temp folder in four shapes (KEY=, ?token=…&, "KEY": "…",
// Bearer …) plus a near-miss, and the scanner must find exactly the four, by name, without the value in its own output; else INDETERMINATE.
// Inside the mutation harness (SCRAPER_COPY_DIR set) only the self-test runs, against the copy's scanner, so a mutation that blinds the
// scanner is caught without reading the real files.
// Exit 0 = no secret value anywhere · 1 = a secret value found (NAME at file:line) · 2 = INDETERMINATE (no .env, self-test failed).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const IN_COPY = !!process.env.SCRAPER_COPY_DIR;
const WEBSITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MEMORY = process.env.RGA_MEMORY_DIR || "/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const libPath = fs.existsSync(path.join(SCR, "scripts/lib/secret-scan.mjs")) ? path.join(SCR, "scripts/lib/secret-scan.mjs") : path.join(REAL, "scripts/lib/secret-scan.mjs");
const L = await import(pathToFileURL(libPath).href);

// ── the self-test: a fake secret made now, planted, and found ────────────────────────────────────────────────────────────
{
  const fake = `rga_${crypto.randomBytes(18).toString("base64url")}`;
  const T = fs.mkdtempSync(path.join(os.tmpdir(), "rga-secret-selftest-"));
  try {
    fs.writeFileSync(path.join(T, "note.md"), [
      "a line with nothing in it",
      `RGA_SELFTEST_TOKEN=${fake}`,
      `curl "https://example.test/fn?token=${fake}&limit=400"`,
      `{ "RGA_SELFTEST_TOKEN": "${fake}" }`,
      `Authorization: Bearer ${fake}`,
      `a near miss: ${fake.slice(0, -1)}`,
    ].join("\n"));
    const secrets = L.secretsFrom(`RGA_SELFTEST_TOKEN=${fake}\nRGA_SELFTEST_PUBLISHABLE_KEY=pk_not_a_secret_value_0123\nRGA_SELFTEST_SITE_ID=not-a-secret-value-at-all\n`);
    const files = L.walk(T);
    const found = files.flatMap((f) => L.scanFile(f, secrets).found || []);
    const lines = found.map((x) => x.line).sort((a, b) => a - b).join(",");
    const said = JSON.stringify(found);
    if (secrets.length !== 1) idk(`self-test: the scanner read ${secrets.length} secrets from a fixture with one (a secret-named key or a non-secret one is misread)`);
    if (lines !== "2,3,4,5") idk(`self-test: the planted fake secret was found on lines [${lines}], not [2,3,4,5] — the scanner is blind (or sees a near miss)`);
    if (!found.every((x) => x.name === "RGA_SELFTEST_TOKEN")) idk("self-test: a finding is not named by its key");
    if (said.includes(fake) || said.includes(fake.slice(0, 12))) idk("self-test: a finding carries the value itself — it would print the secret");
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
}
if (IN_COPY) { console.log("✅ self-test held (mutation copy: the real files are not read)"); process.exit(0); }

// ── the real secrets ─────────────────────────────────────────────────────────────────────────────────────────────────────
let envText = "";
try { envText = fs.readFileSync(path.join(REAL, ".env"), "utf8"); } catch { idk("no Scraper .env, so there is nothing to compare against"); }
const extra = Object.fromEntries(Object.entries(process.env).filter(([k]) => L.isSecretName(k) && !/^RGA_SELFTEST/.test(k)));
const secrets = L.secretsFrom(envText, extra);
if (secrets.length < 5) idk(`only ${secrets.length} secret-named values read from .env`);

// ── where to look ────────────────────────────────────────────────────────────────────────────────────────────────────────
const files = new Set();
for (const repo of [REAL, WEBSITE]) {
  try {
    for (const f of execFileSync("git", ["-C", repo, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0")) if (f) files.add(path.join(repo, f));
  } catch { idk(`git ls-files failed in ${repo}`); }
}
for (const dir of [MEMORY, path.join(WEBSITE, "reports")]) for (const f of L.walk(dir)) files.add(f);
let tmp = [];
try { tmp = fs.readdirSync("/tmp").filter((n) => /rga|com\.rga|overnight|deliverability|health-check|night-rehearsal|drip-content/i.test(n)); } catch { /* no /tmp */ }
for (const n of tmp) { const p = path.join("/tmp", n); try { if (fs.statSync(p).isDirectory()) L.walk(p).forEach((f) => files.add(f)); else files.add(p); } catch { /* gone */ } }

const findings = [];
let scanned = 0, skipped = 0;
for (const f of files) {
  if (/(^|\/)\.env(\.[^/]*)?$/.test(f) && !f.startsWith(REAL + "/.env.example")) {
    // the .env itself is where secrets belong; a TRACKED one is a finding of its own
    try { execFileSync("git", ["-C", path.dirname(f), "ls-files", "--error-unmatch", path.basename(f)], { stdio: "ignore" }); findings.push({ name: "(a whole .env)", file: f, line: 1 }); } catch { /* untracked: right where it belongs */ }
    continue;
  }
  const r = L.scanFile(f, secrets);
  if (r.skipped) { skipped++; continue; }
  scanned++;
  findings.push(...r.found);
}

const short = (f) => f.replace(`${WEBSITE}/`, "website ").replace(`${REAL}/`, "scraper ").replace(`${MEMORY}/`, "memory ");
if (findings.length) {
  const byName = {};
  for (const x of findings) (byName[x.name] ||= []).push(`${short(x.file)}:${x.line}`);
  console.error(`🔴 a secret's value is written where it can be read (${findings.length} place(s); names and places only, never the value):`);
  for (const [n, where] of Object.entries(byName)) console.error(`   · ${n}: ${where.slice(0, 12).join(" · ")}${where.length > 12 ? ` · and ${where.length - 12} more` : ""}`);
  console.error("   Remove the value (a log in /tmp can be deleted; a committed one must be rotated, since git history keeps it).");
  process.exit(1);
}
console.log(`✅ no secret value anywhere: ${secrets.length} secrets compared by hash across ${scanned} files (both repos, memory, reports, ${tmp.length} /tmp logs); ${skipped} media or binary files skipped`);
