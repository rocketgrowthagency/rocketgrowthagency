#!/usr/bin/env node
// check-a-service-area-business-is-not-flagged-for-a-hidden-address.mjs
// A service-area business hides its street address on purpose (flow-execute's schema step already omits it), so the
// website audit must NOT flag a missing address for it. It checks name, phone and service-area text instead. A
// storefront keeps the address check. An unknown model never claims an absence. File-only, stubbed: no network.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const require = createRequire(import.meta.url);
let facts, audit, flow, pb, scr;
try {
  facts = require(`${SITE}/netlify/functions/_site-facts.js`);
  audit = fs.readFileSync(`${SITE}/netlify/functions/v2-audit-website.js`, "utf8");
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
  pb = JSON.parse(fs.readFileSync(`${SITE}/data/playbooks/playbooks.json`, "utf8"));
  scr = fs.readFileSync(new URL("../flow/playbooks/month1.mjs", import.meta.url), "utf8");
} catch (e) { console.error("INDETERMINATE: cannot read the site files: " + e.message); process.exit(2); }
const fails = []; const F = (m) => fails.push(m);
const P = facts.publishesStreetAddress;
for (const [g, want] of [["single_location", true], ["multi_location", true], ["service_area", false], ["national_one_office", false], [undefined, false], [null, false], ["", false], ["hybrid", false]])
  if (P({ geography_model: g }) !== want) F(`publishesStreetAddress(${g}) should be ${want}`);
if (P(null) !== false || P(undefined) !== false) F("publishesStreetAddress throws or is true for no client");
const M = facts.mentionsServiceArea;
if (!M("We proudly serve Lisbon and Porto", "Lisboa, Portugal")) F("a non-US 'proudly serve' phrase is not seen");
if (!M("Cobertura em Medellín y alrededores", "Medellín, Colombia")) F("a non-ASCII market in the text is not seen");
if (!M("Plumbing across SPRINGFIELD", "Springfield, MO")) F("casing of the market matters");
if (M("Welcome to our plumbing company", "Springfield, MO")) F("service-area text claimed with nothing in the text");
if (M("", "Springfield")) F("empty page counted as service-area text");
if (M("Welcome", "")) F("an empty market matched everything");
if (M("Welcome to us", "ab")) F("a 2-letter market matched by accident");
// the audit wires it: storefront-only address finding, service_area branch, unknown model silent
if (!/if \(publishesStreetAddress\(geo\)\) \{\s*if \(!result\.nap\.address_found\) result\.issues\.push\("No street address/.test(audit)) F("the audit's address finding is not limited to storefront clients");
if (!/geo\.geography_model === "service_area"/.test(audit) || !/mentionsServiceArea\(text, geo\.primary_market\)/.test(audit)) F("the audit has no service-area branch");
if ((audit.match(/No street address detected/g) || []).length !== 1) F("the street address finding appears outside the storefront branch");
if (!/const storefront = publishesStreetAddress\(client\);/.test(flow)) F("flow-execute's schema step does not use the shared helper");
// the two copies of the step text agree and are not false for a service-area business
const inst = pb.month1.find((s) => s.id === "m1.web.nap_consistency")?.instructions || "";
if (!/service-area business/.test(inst)) F("nap_consistency instructions still say every business has a public address");
const tail = inst.split("\n").pop();
if (!scr.includes(tail)) F("the scraper's month1.mjs copy of nap_consistency differs from playbooks.json");
if (fails.length) { console.error("FAIL service-area address:"); for (const f of fails) console.error("   - " + f); process.exit(1); }
console.log("PASS service-area business is not flagged for a hidden address (stubbed, file-only): helper 8 models, 7 text cases, audit branch, both step texts agree");
