#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// GENERATE THE GATE CATALOGUE INTO OPS MEMORY.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 WHY. 293 gates exist and memory names maybe forty of them. A future session asking "is this
// already covered?" has no way to find out except grepping 293 files, so it writes a duplicate —
// which happened on 2026-10-06, when `check-no-dormant-endpoints` was built on top of
// `check-orphan-functions` and could not even fail.
//
// 🔑 A HAND-WRITTEN CATALOGUE WOULD BE STALE IN A WEEK. This reads each gate's own header, so the
// catalogue cannot drift from the corpus: regenerate and it is right again.
//
//   node scripts/build-gate-catalogue.mjs
//
// → feedback_preflight_before_you_build · feedback_a_lift_list_is_a_promise_somebody_will_remember

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEM = process.env.RGA_MEMORY_DIR
  || "/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory";
const OUT = `${MEM}/reference_gate_catalogue.md`;

const gates = fs.readdirSync(HERE).filter((f) => /^check-.*\.mjs$/.test(f)).sort();
const sweep = (() => { try { return fs.readFileSync(`${HERE}/daily-health-check.sh`, "utf8"); } catch { return ""; } })();
const suites = (() => { try { return new Set(fs.readdirSync(`${HERE}/mutations`).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))); } catch { return new Set(); } })();
const mutCount = (n) => {
  try { return JSON.parse(fs.readFileSync(`${HERE}/mutations/${n}.json`, "utf8")).length; } catch { return null; }
};

/** The gate's own one-line purpose: the `run …` description in the sweep, else its first real header line. */
const purpose = (file) => {
  const m = sweep.match(new RegExp(`^run ${file.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} "([^"]+)"`, "m"));
  if (m) return m[1];
  const src = fs.readFileSync(`${HERE}/${file}`, "utf8").split("\n").slice(0, 40);
  for (const l of src) {
    const t = l.replace(/^\s*(\/\/|\*|\/\*\*?)\s?/, "").trim();
    if (!t || /^[═─=-]{3,}$/.test(t) || /\.mjs\b/.test(t) || t.startsWith("#!")) continue;
    if (t.length > 12) return t.replace(/\s+/g, " ").slice(0, 150);
  }
  return "(no description in the file)";
};

const rows = gates.map((g) => {
  const n = g.slice(0, -4);
  return { n, wired: new RegExp(`^run ${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m").test(sweep),
    mut: suites.has(n) ? mutCount(n) : null, why: purpose(g) };
});
const wired = rows.filter((r) => r.wired).length;
const withSuite = rows.filter((r) => r.mut != null).length;

const body = `---
name: reference-gate-catalogue
description: "📕 GENERATED — every gate in the Scraper repo, what it holds, whether it is in the daily sweep and whether a mutation suite proves it can fail. Regenerate: node scripts/build-gate-catalogue.mjs"
metadata:
  node_type: memory
  type: reference
  modified: ${new Date().toISOString()}
---

# 📕 THE GATE CATALOGUE — ${rows.length} gates

> 🔴 **GENERATED. Do not edit by hand** — \`node scripts/build-gate-catalogue.mjs\` rewrites it from
> each gate's own header, so it cannot drift from the corpus.
>
> 🔑 **READ THIS BEFORE WRITING A GATE.** On 2026-10-06 I built \`check-no-dormant-endpoints\` without
> asking whether it existed; \`check-orphan-functions\` had done the job since September, better — and
> mine could not fail. One grep here would have stopped it.
> → [[feedback_preflight_before_you_build]] · [[feedback_a_gate_that_cannot_fail]]

**${wired} run in the daily sweep** · ${rows.length - wired} excused with a reason in
\`check-every-gate-is-wired.mjs\` · **${withSuite} carry a mutation suite** proving they can fail
(\`node scripts/run-mutations.mjs\`) · the rest are a backlog that may only shrink.

| gate | sweep | mutations | what it holds |
|---|---|---|---|
${rows.map((r) => `| \`${r.n}\` | ${r.wired ? "✅" : "—"} | ${r.mut != null ? r.mut : "—"} | ${r.why.replace(/\|/g, "\\|")} |`).join("\n")}
`;
fs.writeFileSync(OUT, body);
console.log(`✅ ${rows.length} gates catalogued → ${OUT}`);
console.log(`   ${wired} wired · ${withSuite} with a mutation suite`);
