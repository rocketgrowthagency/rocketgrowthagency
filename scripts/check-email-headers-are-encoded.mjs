#!/usr/bin/env node
/**
 * check-email-headers-are-encoded.mjs — a Subject with a dash in it must not arrive as mojibake.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-09, the first real confirmation email RGA ever sent landed in the client's inbox as:
 *
 *     Welcome aboard Ã¢Â€Â" here's what happens next
 *
 * The body was flawless. Only the subject was wrecked — and the subject is the one line a client
 * reads before deciding whether we look competent.
 *
 * 🔑 **A MIME BODY CAN DECLARE ITS CHARSET. A HEADER CANNOT.** `Content-Type: text/plain;
 * charset="UTF-8"` governs the body only. Any non-ASCII byte in a Subject/From/To must be an RFC
 * 2047 encoded-word (`=?UTF-8?B?…?=`) or the client guesses — and Gmail guessed Latin-1 on our
 * em dash.
 *
 * 🔴 Easy to miss precisely BECAUSE the body is fine. Every test that reads the body passes.
 *
 * TWO WAYS TO GET THIS WRONG, both checked:
 *   1. Interpolating a raw value into a header at all.
 *   2. "Encoding" it by splitting on BYTES — cutting a multi-byte character in half produces the
 *      exact corruption being fixed. Splitting must iterate characters.
 *
 * Exit 0 = headers are encoded · 1 = a header can ship raw UTF-8 · 2 = could not tell.
 */
import fs from "node:fs";
import path from "node:path";

const FNS = "/Users/chris/RGA/Rocket Growth Agency Website VS Code/netlify/functions";
const SABOTAGE = process.env.SABOTAGE === "1";

if (!fs.existsSync(FNS)) { console.error("  ✗ functions dir not found"); process.exit(2); }

// Any function that hands a raw RFC 2822 message to a mail API.
const senders = fs.readdirSync(FNS)
  .filter((f) => f.endsWith(".js"))
  .map((f) => ({ f, src: fs.readFileSync(path.join(FNS, f), "utf8") }))
  .filter(({ src }) => /Subject:\s*\$\{|Subject:\s*"/.test(src));

if (!senders.length) { console.log("  ▫️  no function builds a raw mail header — nothing to check"); process.exit(0); }

console.log("── a client-facing Subject must be RFC 2047 encoded ──");
const fails = [];

for (let { f, src } of senders) {
  if (SABOTAGE) src = src.replace(/Subject:\s*\$\{encodeHeaderValue\(subject\)\}/, "Subject: ${subject}");

  const raw = src.match(/`Subject:\s*\$\{([^}]*)\}`/);
  if (!raw) { console.log(`  ▫️  ${f}: subject is a literal, not interpolated`); continue; }
  const expr = raw[1].trim();

  if (/^(subject|title|subj)$/.test(expr)) {
    fails.push(`${f}: raw subject`);
    console.log(`  🔴 ${f} interpolates \`${expr}\` straight into the header — an em dash, an accent or`);
    console.log("     an emoji will arrive as mojibake (the body will look perfectly fine)");
    continue;
  }
  console.log(`  ✅ ${f} passes the subject through \`${expr.slice(0, 40)}\``);

  // The encoder must exist and must split on characters, not bytes.
  const enc = src.match(/function encodeHeaderValue[\s\S]{0,1400}?\n\}/);
  if (!enc) {
    fails.push(`${f}: no encoder`);
    console.log(`  🔴 ${f} references an encoder that is not defined here`);
    continue;
  }
  if (!/=\?UTF-8\?B\?/.test(enc[0])) {
    fails.push(`${f}: not RFC 2047`);
    console.log(`  🔴 ${f}'s encoder does not emit =?UTF-8?B?…?= encoded-words`);
  } else if (/\.split\(""\)|\.slice\(\s*i\s*,|for \(let i = 0; i < s\.length/.test(enc[0])
             && !/for \(const \w+ of /.test(enc[0])) {
    fails.push(`${f}: byte/index splitting`);
    console.log(`  🔴 ${f}'s encoder chunks by INDEX — it can cut a multi-byte character in half,`);
    console.log("     which is the very corruption this exists to prevent. Iterate code points.");
  } else {
    console.log(`  ✅ ${f} emits RFC 2047 encoded-words and chunks by character`);
  }
}

console.log("");
if (fails.length) {
  console.error(`🔴 a client-facing header can ship raw UTF-8 (${fails.join(", ")}).`);
  console.error("   A body declares its charset; a header cannot. The body being fine proves nothing.");
  process.exit(1);
}
console.log(`✅ ${senders.length} mail sender(s): every Subject is RFC 2047 encoded`);
