#!/usr/bin/env node
// check-the-schema-type-is-the-specific-one-or-local-business.mjs
// The LocalBusiness JSON-LD step writes the most specific schema.org type for the Google primary category, and plain
// LocalBusiness for anything it does not know (including a category in another language). Every mapped type must be on
// the defended list of real schema.org types. File-only, stubbed: pure function, no network.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const require = createRequire(import.meta.url);
let f, flow;
try { f = require(`${SITE}/netlify/functions/_site-facts.js`); flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch (e) { console.error("INDETERMINATE: cannot read the site files: " + e.message); process.exit(2); }
const fails = []; const F = (m) => fails.push(m);
const T = f.schemaTypeFor;
const must = { "Plumber": "Plumber", "  plumber ": "Plumber", "DENTIST": "Dentist", "Electrician": "Electrician", "Personal injury attorney": "Attorney",
  "HVAC contractor": "HVACBusiness", "Roofing contractor": "RoofingContractor", "Law firm": "LegalService", "Restaurant": "Restaurant" };
for (const [c, t] of Object.entries(must)) if (T(c) !== t) F(`"${c}" should be ${t}, got ${T(c)}`);
for (const c of ["Fontanero", "Zahnarzt", "配管工", "Dental supply store", "Plumbing supply store", "SEO agency", "", "   ", null, undefined, 42, {}, [], "constructor", "__proto__", "toString"])
  if (T(c) !== "LocalBusiness") F(`${JSON.stringify(c)} should fall back to LocalBusiness, got ${T(c)}`);
for (const [k, v] of Object.entries(f.CATEGORY_TO_TYPE)) {
  if (!f.SCHEMA_ORG_TYPES.includes(v)) F(`"${k}" maps to ${v}, which is not on the defended schema.org list`);
  if (k !== k.toLowerCase() || k !== k.trim()) F(`map key "${k}" is not normalized`);
}
// types we are NOT sure exist on schema.org must stay out
for (const bad of ["Chiropractor", "Landscaper", "PestControl", "CleaningService", "TattooParlor", "Contractor"])
  if (f.SCHEMA_ORG_TYPES.includes(bad)) F(`${bad} is on the list but is not a type we can defend`);
if (!/const schemaType = schemaTypeFor\(client\.gbp_primary_category\);/.test(flow) || !/"@type": schemaType, name: client\.business_name/.test(flow)) F("the schema step does not write the mapped type");
if (/"@context": "https:\/\/schema\.org", "@type": "LocalBusiness", name: client\.business_name/.test(flow)) F("the schema step still hardcodes LocalBusiness");
if (fails.length) { console.error("FAIL schema subtype:"); for (const x of fails) console.error("   - " + x); process.exit(1); }
console.log(`PASS schema subtype (stubbed, pure function): ${Object.keys(must).length} mapped, 16 fall back to LocalBusiness, ${Object.keys(f.CATEGORY_TO_TYPE).length} map entries all on the defended list`);
