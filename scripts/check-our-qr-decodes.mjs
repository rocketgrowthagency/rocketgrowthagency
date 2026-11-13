#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-our-qr-decodes.mjs
//
// 🔒 WHY (11-13, admin_two_step_setup_v3 — Chris: "i really like the QR of the mockup"): the admin's two-step setup draws its QR with
// RGA's OWN encoder (website shared/qr.js; outside code is not allowed into the sign-in path). A QR that doesn't scan locks nobody out
// (the key can be typed, and Supabase's own QR is the fallback), but it is a broken first step on the most important screen. So every
// day this renders codes from the real encoder in a real browser, at the setup screen's size, and macOS's OWN QR reader (Core Image,
// scripts/lib/qrdecode.swift) must read back exactly what was encoded: the authenticator link shape, versions 1–9, levels L and M.
// It also holds the admin's wiring: the short link (RGA:Admin, issuer RGA), base32-only keys, and the Supabase fallback.
// exit 0 = every code scans back exactly · 1 = a code doesn't · 2 = can't tell (no browser / no Swift)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = [];
let Q;
try { const src = fs.readFileSync(path.join(SITE, "shared/qr.js"), "utf8"); const m = { exports: {} }; new Function("module", "globalThis", src)(m, {}); Q = m.exports; }
catch (e) { console.log(`❌ shared/qr.js does not load: ${e.message}`); process.exit(1); }
if (!Q || typeof Q.svg !== "function" || typeof Q.encode !== "function") { console.log("❌ shared/qr.js no longer exports encode + svg"); process.exit(1); }

// the admin's wiring
{
  const A = fs.readFileSync(path.join(SITE, "admin/admin.js"), "utf8");
  if (!/import "\/shared\/qr\.js\?v=/.test(A)) F.push("admin.js no longer loads shared/qr.js (the setup QR falls back to Supabase's dense one)");
  if (!/globalThis\.rgaQr\.svg\(\[\{ mode: "byte", data: "otpauth:\/\/totp\/RGA\?secret=" \}, \{ mode: "alnum", data: raw \}\], \{ ecl: "L" \}\)/.test(A)) F.push("the setup QR isn't drawn as the short link (label RGA) with the key in alphanumeric mode at level L (the mockup's 29 × 29)");
  if (!/\/\^\[A-Z2-7\]\{16,64\}\$\/\.test\(raw\)/.test(A)) F.push("the key isn't checked to be base32 before it goes into the QR");
  if (!/img\.src = data\.totp\.qr_code;/.test(A)) F.push("there is no Supabase QR fallback if our drawing fails");
}

// macOS's own decoder
let dec = null;
if (process.platform !== "darwin") { console.error("⚠️  INDETERMINATE — this needs macOS's QR reader (Core Image)"); process.exit(2); }
try {
  dec = path.join(os.tmpdir(), "rga-qrdecode-" + crypto.createHash("sha1").update(fs.readFileSync(path.join(HERE, "lib/qrdecode.swift"))).digest("hex").slice(0, 10));
  if (!fs.existsSync(dec)) execFileSync("swiftc", ["-O", "-o", dec, path.join(HERE, "lib/qrdecode.swift")], { stdio: "ignore", timeout: 240000 });
} catch (e) { console.error(`⚠️  INDETERMINATE — the Swift QR reader won't build: ${String(e.message).slice(0, 120)}`); process.exit(2); }

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); } catch { console.error("⚠️  INDETERMINATE — puppeteer unavailable"); process.exit(2); }
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", rand = (n) => Array.from(crypto.randomBytes(n), (b) => B32[b % 32]).join("");
const cases = [];
for (let i = 0; i < 8; i++) { const k = rand(32); cases.push([[{ mode: "byte", data: "otpauth://totp/RGA?secret=" }, { mode: "alnum", data: k }], "L", `otpauth://totp/RGA?secret=${k}`]); }   // what the setup screen draws
cases.push([[{ mode: "alnum", data: "HELLO WORLD 123 $%*+-./:" }], "L", "HELLO WORLD 123 $%*+-./:"]);
cases.push([`otpauth://totp/RGA:Admin?secret=${rand(32)}&issuer=RGA`, "M"], ["HELLO", "L"], ["https://www.rocketgrowthagency.com/admin/", "M"], ["a".repeat(120), "L"], [`otpauth://totp/RGA:Admin?secret=${rand(32)}&issuer=RGA&x=${"y".repeat(110)}`, "L"]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rga-qr-"));
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const want = [];
try {
  const p = await b.newPage(); await p.setViewport({ width: 300, height: 300, deviceScaleFactor: 1 });
  for (const [i, [input, ecl, plain]] of cases.entries()) {
    const t = plain || input;
    let svg; try { svg = Q.svg(input, { ecl }); } catch (e) { F.push(`the encoder refused a ${t.length}-character code at ${ecl}: ${e.message}`); continue; }
    // the setup screen's box: 168px, 12px white padding
    await p.setContent(`<body style="margin:0;background:#0f1320"><div style="box-sizing:border-box;width:168px;height:168px;margin:20px;padding:12px;background:#fff;border-radius:12px">${svg}</div></body>`);
    const f = path.join(dir, `q${i}.png`); await p.screenshot({ path: f, clip: { x: 0, y: 0, width: 208, height: 208 } });
    want.push({ f, t, v: Q.encode(input, ecl).version });
  }
} finally { await b.close(); }
let got = {};
try { for (const line of execFileSync(dec, want.map((w) => w.f), { encoding: "utf8", timeout: 60000 }).split("\n")) { const k = line.indexOf("\t"); if (k > 0) got[line.slice(0, k)] = line.slice(k + 1); } }
catch (e) { console.error(`⚠️  INDETERMINATE — the QR reader failed to run: ${String(e.message).slice(0, 120)}`); process.exit(2); }
for (const w of want) if (got[w.f] !== w.t) F.push(`a version-${w.v} code read back as "${String(got[w.f] || "").slice(0, 50)}" (encoded ${w.t.slice(0, 40)}…)`);
fs.rmSync(dir, { recursive: true, force: true });
const setupV = want.length ? Q.encode(cases[0][0], "L").version : null;
if (setupV !== 3) F.push(`the setup code is version ${setupV} (${setupV * 4 + 17} × ${setupV * 4 + 17}); the approved mockup's grid is version 3, 29 × 29`);

if (F.length) { console.log(`❌ OUR QR CODE DOESN'T SCAN BACK (${F.length}):`); for (const x of F) console.log("   • " + x); process.exit(1); }
console.log(`✅ our QR encoder scans back exactly: ${want.length} codes (versions ${[...new Set(want.map((w) => w.v))].sort((a, z) => a - z).join(", ")}) read by macOS's own QR reader at the setup screen's size; the setup code is 29 × 29 (the mockup's grid)`);
process.exit(0);
