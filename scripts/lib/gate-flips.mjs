// gate-flips.mjs — WHICH GATES FLIP BETWEEN PASS AND FAIL (checkers build 11-11). Pure: handed the verdict log's text and a clock, so
// check-no-gate-flips.mjs proves it on fixtures every run. The log: output/gate-verdicts.jsonl, one {"gate","exit","at"} per gate per run
// (daily-health-check.sh record_verdict). Exit 0 = pass, 1 = fail; 2 (could not tell) and anything else is not a side, so it neither
// flips nor breaks a flip.

/** → Map(gate → [{ at, exit }]) for the lines within `days` of now, oldest first */
export function verdictsSince(text, nowMs, days = 7) {
  const from = nowMs - days * 864e5, by = new Map();
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let v; try { v = JSON.parse(line); } catch { continue; }
    const at = Date.parse(v.at);
    if (!v.gate || !Number.isFinite(at) || at < from || at > nowMs) continue;
    (by.get(v.gate) || by.set(v.gate, []).get(v.gate)).push({ at, exit: Number(v.exit) });
  }
  for (const list of by.values()) list.sort((a, b) => a.at - b.at);
  return by;
}

/** a gate's verdicts → how many times it went pass→fail or fail→pass */
export function flipsOf(list) {
  let last = null, n = 0;
  for (const { exit } of list) {
    if (exit !== 0 && exit !== 1) continue;
    if (last !== null && exit !== last) n++;
    last = exit;
  }
  return n;
}

/** → [{ gate, flips, seq }] every gate that flipped more than `max` times */
export function flippers(by, max = 2) {
  const out = [];
  for (const [gate, list] of by) {
    const flips = flipsOf(list);
    if (flips > max) out.push({ gate, flips, seq: list.map((x) => (x.exit === 0 ? "P" : x.exit === 1 ? "F" : "?")).join("") });
  }
  return out.sort((a, b) => b.flips - a.flips);
}
