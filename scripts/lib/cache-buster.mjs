// cache-buster.mjs — WHICH ?v= REFERENCES DID NOT MOVE WITH THEIR FILE (checkers build 11-11). Pure: handed two snapshots, no git, no disk,
// so check-every-cache-buster-moved-with-its-file.mjs proves it on fixtures every run. → memory feedback_a_stale_cache_buster_hides_the_whole_fix
//
// A reference is `<script src="/admin/admin.js?v=X">`, `<link href="/admin/admin.css?v=X">`, `import … from "/shared/x.js?v=X"` or
// `import("/shared/x.js?v=X")`, in an HTML or JS file. It is STALE when the file it names changed between the two snapshots and the same
// referencing file named it with the same X in both: a browser holding the old X keeps the old file, so the fix never reaches it.
import path from "node:path";

const REF = /(?:\b(?:src|href)\s*=\s*["']|\bfrom\s*["']|\bimport\s*\(\s*["'])([^"'?#\s]+\.(?:m?js|css))\?v=([A-Za-z0-9._-]+)/g;

/** the references in one file's text → [{ asset, v }] with the asset as a site path ("admin/admin.js") */
export function refsIn(fromFile, text) {
  const out = [];
  for (const m of String(text || "").matchAll(REF)) {
    const raw = m[1];
    if (/^(https?:)?\/\//.test(raw)) continue;   // another site's file is not ours to bust
    const asset = raw.startsWith("/") ? raw.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), raw));
    out.push({ asset, v: m[2] });
  }
  return out;
}

/**
 * base, cur: Map(sitePath → text | null). scope(asset) → true for the assets this check owns.
 * → [{ from, asset, v }] every reference whose asset changed while its ?v= stayed the same.
 */
export function staleRefs(base, cur, scope = () => true) {
  const stale = [];
  for (const [from, text] of cur) {
    if (text == null || !/\.(html?|m?js)$/.test(from)) continue;
    const before = base.get(from);
    if (before == null) continue;   // a new referencing file has no old ?v= to compare with
    const oldV = new Map();
    for (const r of refsIn(from, before)) (oldV.get(r.asset) || oldV.set(r.asset, new Set()).get(r.asset)).add(r.v);
    for (const r of refsIn(from, text)) {
      if (!scope(r.asset)) continue;
      const a0 = base.get(r.asset), a1 = cur.get(r.asset);
      if (a0 == null || a1 == null || a0 === a1) continue;   // new, gone, or unchanged: nothing to bust
      if (oldV.has(r.asset) && oldV.get(r.asset).has(r.v)) stale.push({ from, asset: r.asset, v: r.v });
    }
  }
  return stale;
}
