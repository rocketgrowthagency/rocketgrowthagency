// portal-cs.mjs — the CLIENT CARD SYSTEM helpers (portal.js, approved client_card_system_v1, Chris 10-29) as ONE string a gate
// can lift into its vm or page. Since batch 1 (steps 2–9) every CS step draws csCard / csEv / csChips / csSt / csNote / csFoot, and
// lockFootHtml / threadHtml ask CS_STEPS — a gate that lifts a renderer without these throws "csChips is not defined" and reads
// as broken when the product is fine.
//
// The block is everything between `// ── CS-BLOCK-START` and `// ── CS-BLOCK-END ──` in portal.js, plus the three drawn marks it
// leans on (PC_TICK · PC_OPEN · PC_DOWN, defined just above it). Top-level `const` becomes `var` so vm.runInContext exposes each
// name on the context (a `const` in a vm script is not a property of the sandbox).
//
// 🔴 A MISSING MARKER OR CONST IS "MOVED", NEVER A PASS — it exits 2 (INDETERMINATE) so the gate is re-read, not trusted.
// → feedback_a_gate_that_throws_is_not_a_gate_that_fails
//
//   csBlock(P)            → source defining PC_TICK, PC_OPEN, PC_DOWN, CS_STEPS, CS_ICON, csCard, csEv, csChips, csSt, csNote,
//                           csGcard, csFoot (needs escapeHtml, escapeAttribute, pcActs from the gate's own lift)
//   csBlock(P, already)   → leaves out PC_TICK/PC_OPEN/PC_DOWN when `already` declares them (planCardKit lifts them as const)
export const CS_START = "// ── CS-BLOCK-START";
export const CS_END = "// ── CS-BLOCK-END ──";
export const CS_CONSTS = ["PC_TICK", "PC_OPEN", "PC_DOWN"];

const moved = (what) => { console.error(`⚠️  INDETERMINATE — portal.js ${what} moved (scripts/lib/portal-cs.mjs). Re-read the CS block before trusting any gate that lifts it.`); process.exit(2); };

export function csBlock(P, already = "") {
  const parts = [];
  for (const name of CS_CONSTS) {
    const m = new RegExp(`^const ${name} = \`[^\`]*\`;$`, "m").exec(P);
    if (!m) moved(`const ${name}`);
    if (new RegExp(`(^|\\n)\\s*(const|var|let) ${name} =`).test(already)) continue;
    parts.push(m[0].replace(/^const /, "var "));
  }
  const a = P.indexOf(CS_START);
  if (a < 0) moved(`marker "${CS_START}"`);
  const b = P.indexOf(CS_END, a);
  if (b < 0) moved(`marker "${CS_END}"`);
  const block = P.slice(P.indexOf("\n", a) + 1, b);
  if (!/^const CS_STEPS = /m.test(block) || !/^const csCard = /m.test(block)) moved("CS block contents (CS_STEPS / csCard)");
  parts.push(block.replace(/^const /gm, "var "));
  return parts.join("\n");
}
