#!/usr/bin/env node
// The morning check's handle on `acceptance-walk.mjs --as=month2` — daily-health-check's run() passes no arguments.
// The Month-2 test client (Month 1 finished, nothing sent this month) → website reports/acceptance/latest-month2.md.
// See scripts/acceptance/clients.mjs.
process.argv.push("--as=month2");
await import("./acceptance-walk.mjs");
