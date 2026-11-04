// step-map-print.mjs — a short fingerprint of everything in the playbook that the step sheet shows or that moves a number. build-step-map.mjs writes it on the sheet; check-the-step-map-is-current.mjs recomputes it.
import { createHash } from "node:crypto";
const SHOWN = ["id", "title", "type", "dependsOn", "actor", "clientLabel", "clientStepNo", "managedStepNo", "managedRole", "clientHint", "clientWhy", "instructions"];
export const stepMapPrint = (play) => createHash("sha256").update(JSON.stringify(Object.entries(play).map(([month, list]) => [month, (list.steps || list).map((s) => SHOWN.map((k) => s[k] ?? null))]))).digest("hex").slice(0, 12);
