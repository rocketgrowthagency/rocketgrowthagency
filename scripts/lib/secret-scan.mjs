// secret-scan.mjs — FIND A SECRET'S VALUE IN TEXT WITHOUT HOLDING OR PRINTING IT (checkers build 11-11). Used by
// check-no-secret-value-anywhere.mjs. → memory feedback_never_print_a_secret_value ("a filter selects LINES, it does not redact")
//
// 🔑 BY HASH. The secrets become a set of sha256 digests keyed to their NAME; each line is cut into tokens three ways (a secret can sit
// inside `?token=<v>&x`, `"KEY": "<v>"`, `Bearer <v>` or `KEY=<v>`), and each token of a plausible length is hashed and looked up.
// A finding is { name, file, line }: never the value, never the line.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sha = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
// which env names hold a secret (a publishable key, an id, a URL or a table name is not one)
export const isSecretName = (k) => /(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|ROLE_KEY|_KEY$|_PAT$)/.test(k) && !/PUBLISHABLE|_ID$|_URL$|_NAME$|ANCHOR/.test(k);
// the token cuts: a value is matched whole, after splitting on everything a secret of its kind cannot contain
const CUTS = [/[^A-Za-z0-9_\-+/=.~]+/, /[^A-Za-z0-9_\-+/.~]+/, /[^A-Za-z0-9_\-]+/, /[^A-Za-z0-9]+/];

/** env-like text → [{ name, digest, len }] for every secret-named value of 12+ characters (a short value would match by chance). */
export function secretsFrom(text, extra = {}) {
  const out = new Map();
  const add = (k, v) => {
    v = String(v || "").trim().replace(/^["']|["']$/g, "");
    if (!isSecretName(k) || v.length < 12 || /\s/.test(v)) return;
    out.set(sha(v), { name: k, digest: sha(v), len: v.length });
  };
  for (const line of String(text || "").split("\n")) { const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line); if (m) add(m[1], m[2]); }
  for (const [k, v] of Object.entries(extra)) add(k, v);
  return [...out.values()];
}

/** text → [{ name, line }] for every line holding one of the secrets. */
export function scanText(text, secrets) {
  if (!secrets.length) return [];
  const byDigest = new Map(secrets.map((s) => [s.digest, s.name]));
  const lens = new Set(secrets.map((s) => s.len)), min = Math.min(...lens), max = Math.max(...lens);
  const found = [];
  const lines = String(text).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length < min) continue;
    const hit = new Set();
    for (const cut of CUTS) for (const tok of l.split(cut)) {
      if (tok.length < min || tok.length > max || !lens.has(tok.length)) continue;
      const n = byDigest.get(sha(tok));
      if (n) hit.add(n);
    }
    for (const n of hit) found.push({ name: n, line: i + 1 });
  }
  return found;
}

const SKIP_EXT = /\.(mp4|mov|m4a|mp3|wav|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|sqlite|db|car|icns|scpt|DS_Store)$/i;
/** file → findings with the file name; binary, huge and media files are skipped (counted by the caller). */
export function scanFile(file, secrets, { maxBytes = 8 * 1024 * 1024 } = {}) {
  if (SKIP_EXT.test(file)) return { skipped: "media" };
  let st;
  try { st = fs.statSync(file); } catch { return { skipped: "unreadable" }; }
  if (!st.isFile()) return { skipped: "not a file" };
  if (st.size > maxBytes) return { skipped: "too big" };
  let buf;
  try { buf = fs.readFileSync(file); } catch { return { skipped: "unreadable" }; }
  if (buf.subarray(0, 8000).includes(0)) return { skipped: "binary" };
  return { found: scanText(buf.toString("utf8"), secrets).map((f) => ({ ...f, file })) };
}

/** every regular file under dir (no symlink follow), skipping node_modules/.git */
export function walk(dir, out = [], depth = 0) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 12) walk(p, out, depth + 1);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
