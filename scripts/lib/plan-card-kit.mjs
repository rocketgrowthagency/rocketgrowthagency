// plan-card-kit.mjs — the shared pieces every plan card is drawn from (portal.js), as ONE string a gate can lift into its page or
// vm. Since steps_1_4 / steps_6_20 (10-23) every card is a pcCard; a gate that lifts a card function must lift these too, or it
// throws "pcCard is not defined" and reads as broken when the product is fine.
export function planCardKit(src, already = "") {
  // `already`: code the gate lifts anyway — any piece it already declares is left out (no "already declared")
  const line = (name) => (new RegExp(`^const ${name} = .*;$`, "m").exec(src) || [""])[0];
  const block = (startRe, endName) => { const m = startRe.exec(src); if (!m) return ""; const b = src.indexOf(`const ${endName} =`, m.index); return b < 0 ? "" : src.slice(m.index, src.indexOf("\n", b)); };
  const multi = (name) => { const m = new RegExp(`^const ${name} = `, "m").exec(src); if (!m) return ""; let d = 0, k = m.index, seen = false;
    for (; k < src.length; k++) { const ch = src[k]; if (ch === "{" || ch === "(") { d++; seen = true; } else if (ch === "}" || ch === ")") d--; else if (ch === ";" && seen && d === 0) return src.slice(m.index, k + 1); } return ""; };
  const parts = [block(/^const PC_TICK =/m, "pcActs"), line("KW_SPIN"), line("CLOSE_CAL_ICON"), line("STAR_ICON"), multi("hmSpan"), line("placeName"), multi("gbpProfileBits"), line("PLAN_CARD_DONE")];
  const declared = (part) => { const m = /^const (\w+) =/.exec(part); return m && new RegExp(`(^|\\n)\\s*const ${m[1]} =`).test(already); };
  return parts.filter(Boolean).filter((x) => !declared(x)).join("\n");
}
