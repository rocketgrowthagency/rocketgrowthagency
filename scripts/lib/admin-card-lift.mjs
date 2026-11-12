// lib/admin-card-lift.mjs — the one admin card for a gate that lifts admin.js code (card_notice_designs_v1 §1, 11-11). admin.js draws every card
// shell through `adminCard(o)` -> globalThis.rgaAdminCard (shared/admin-card.js, imported at the top in the browser). A lift that runs a card
// producer needs both, read from the SAME files the browser loads: the renderer's source, then admin.js's own adminCard line (so a mutation of
// either reaches the lifted code). Returns source text to put before the lifted functions (a vm context or a browser page alike).
import fs from "node:fs";
export function adminCardLift(site, adminSrc) {
  const r = fs.readFileSync(`${site}/shared/admin-card.js`, "utf8");
  const m = /^function adminCard\(o\) \{[^\n]*\}$/m.exec(adminSrc || fs.readFileSync(`${site}/admin/admin.js`, "utf8"));
  if (!m) throw new Error("adminCard moved out of admin.js");
  return `${r}\n${m[0]}\n`;
}
