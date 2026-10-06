import fs from "node:fs";
import { liftAdmin } from "./_lift-admin.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const playbooks = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
const m1 = playbooks.month1;
const lifted = liftAdmin(["obPageNumbers", "obPageOrdered", "obPhaseIndexOf", "obRespectDeps"]);
const steps = m1.map((s) => ({ obj: { flowId: s.id, sopType: s.type }, dependsOn: s.dependsOn || [] }));
const pageNo = lifted.call("obPageNumbers", [steps]);
const rows = m1.map((s, i) => ({ n: pageNo.get(i), id: s.id, title: s.title, who: s.who || s.owner || "", type: s.type || "", ph: s.ph || s.phase || "" }))
  .filter(r => r.n).sort((a, b) => a.n - b.n);
console.log(JSON.stringify(rows));
