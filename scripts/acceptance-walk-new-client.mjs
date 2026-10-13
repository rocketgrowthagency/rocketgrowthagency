#!/usr/bin/env node
// The morning check's handle on `acceptance-walk.mjs --as=new` — daily-health-check's run() passes no arguments.
// The brand-new test client (day 0) → website reports/acceptance/latest-new-client.md. See scripts/acceptance/clients.mjs.
process.argv.push("--as=new");
await import("./acceptance-walk.mjs");
