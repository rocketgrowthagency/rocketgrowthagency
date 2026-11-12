// dormant-exports.mjs — WHAT A BROWSER/SHARED FILE EXPORTS, AND WHETHER ANYTHING CALLS IT (checkers build 11-11). Pure text rules, used by
// check-no-dormant-exports.mjs, which proves them on fixtures every run.

const blockAt = (src, open) => { let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}" && --d === 0) return [open, i + 1]; } return [open, open]; };
const splitTop = (body) => { const parts = []; let d = 0, cur = ""; for (const ch of body) { if ("{[(".includes(ch)) d++; else if ("}])".includes(ch)) d--; if (ch === "," && d === 0) { parts.push(cur); cur = ""; } else cur += ch; } parts.push(cur); return parts; };
const keysOf = (body) => splitTop(body).map((p) => p.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").trim()).map((p) => (/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:[:(]|$)/.exec(p) || /^["']([\w$]+)["']\s*:/.exec(p) || [])[1]).filter(Boolean);
const esc = (n) => n.replace(/\$/g, "\\$");

/** src → { names: [exported names], spans: [[start,end]] the export containers (so their own mentions don't count as uses) } */
export function exportsOf(src) {
  const names = new Set(), spans = [];
  for (const m of src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) { spans.push([m.index, m.index + m[0].length]); for (const p of m[1].split(",")) { const n = p.trim().split(/\s+as\s+/)[0].trim(); if (n) names.add(n); } }
  const fromObject = (open) => { const [a, b] = blockAt(src, open); spans.push([a, b]); keysOf(src.slice(a + 1, b - 1)).forEach((n) => names.add(n)); };
  for (const m of src.matchAll(/\bmodule\.exports\s*=\s*\{/g)) fromObject(m.index + m[0].length - 1);
  for (const m of src.matchAll(/\bmodule\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)) {
    const d = new RegExp(`(?:const|let|var)\\s+${esc(m[1])}\\s*=\\s*(?:Object\\.freeze\\()?\\{`).exec(src);
    if (d) fromObject(d.index + d[0].length - 1);
  }
  for (const m of src.matchAll(/\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  return { names: [...names], spans };
}

/** is NAME a function in src (a declaration, an arrow or function expression, or an object method)? */
export const isFunction = (src, n) => new RegExp(`function\\*?\\s+${esc(n)}\\s*\\(|\\b${esc(n)}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)|^\\s*(?:async\\s+)?${esc(n)}\\s*\\([^)]*\\)\\s*\\{`, "m").test(src);

/** how many times src USES name, leaving out the export containers and the name's own definition */
export function usesInOwnFile(src, n, spans) {
  // inside an export container only the entry's own NAME is left out (a shorthand `name` or a `name:` label); a value that calls it is a use
  let s = src;
  const re0 = new RegExp(`^\\s*${esc(n)}\\s*$`), lab = new RegExp(`^(\\s*)${esc(n)}\\s*:`);
  for (const [a, b] of [...spans].sort((x, y) => y[0] - x[0])) {
    const seg = src.slice(a, b), open = seg.indexOf("{");
    if (open < 0) { s = s.slice(0, a) + " ".repeat(b - a) + s.slice(b); continue; }
    const inner = seg.slice(open + 1, seg.lastIndexOf("}"));
    const kept = splitTop(inner).map((part) => (re0.test(part) ? "" : part.replace(lab, "$1"))).join(",");
    s = s.slice(0, a) + seg.slice(0, open + 1) + kept + "}" + s.slice(b);
  }
  s = s.replace(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\*?\\s+${esc(n)}\\s*\\(`, "g"), " (")
    .replace(new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${esc(n)}\\s*=`, "g"), " =")
    .replace(new RegExp(`(?:module\\.)?exports\\.${esc(n)}\\s*=`, "g"), " =")
    .replace(/^\s*\/\/.*$/gm, "");
  return (s.match(new RegExp(`(?<![\\w$])${esc(n)}(?![\\w$])`, "g")) || []).length;
}

/** files: Map(path → text); owned(path) → true for the files whose exports are judged. → [{ file, name, internal }] exports no OTHER file names */
export function dormantExports(files, owned) {
  const out = [];
  for (const [f, src] of files) {
    if (!owned(f)) continue;
    const { names, spans } = exportsOf(src);
    for (const n of names) {
      if (n.length < 3 || !isFunction(src, n)) continue;
      const re = new RegExp(`(?<![\\w$])${esc(n)}(?![\\w$])`);
      let elsewhere = false;
      for (const [g, t] of files) { if (g !== f && re.test(t)) { elsewhere = true; break; } }
      if (!elsewhere) out.push({ file: f, name: n, internal: usesInOwnFile(src, n, spans) > 0 });
    }
  }
  return out;
}
