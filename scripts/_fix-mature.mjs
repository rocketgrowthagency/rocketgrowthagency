// builds the admin-monthly-health "read" payload from the SHIPPED server code on fake deps (no network); writes JSON to argv[2]
import fs from "node:fs";
import { MH, world, row, frozen, CID } from "./_account-health-world.mjs";
const M = (n) => `2026-${String(n).padStart(2, "0")}-01`;
const cur = M(11);
const rows = [7, 8, 9, 10].map((m, i) => row(M(m), { closed: true, rank: 9 - i, frozen: frozen({ views: 400 + i * 20, calls: 30 + i, clicks: 100 + i * 5, pv: 380, pc: 29, pk: 98 }) })).concat([row(cur)]);
const numbers = { [M(7)]: 2, [M(8)]: 3, [M(9)]: 4, [M(10)]: 5, [cur]: 6 };
const w = world({ now: "2026-11-10T12:00:00Z", month: cur, number: 6, numbers, rows, lastLogin: "2026-11-08T10:00:00Z", keyword: "seo company" });
await MH.settle({ clientId: CID, month: cur, deps: w.d });
const d = await MH.readData({ clientId: CID, month: cur, deps: w.d });
fs.writeFileSync(process.argv[2], JSON.stringify(d));
console.log(Object.keys(d).join(","));
