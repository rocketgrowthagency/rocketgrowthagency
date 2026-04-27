#!/usr/bin/env node
// Quick CLI for logging non-email outreach attempts (phone, voicemail, SMS,
// FB-DM, IG-DM, LinkedIn, mail). Email sends are auto-logged by the Apps Script
// (gmail-to-airtable.gs) — don't use this for emails.
//
// Usage:
//   node log-outreach.mjs --lead="Pacific Plumbing" --channel=phone --outcome=voicemail --notes="left vm, 3 rings"
//   node log-outreach.mjs -l "lions hvac" -c phone -o conversation -n "talked to owner, interested, callback Tue"
//   node log-outreach.mjs --lead-id=recXXXX --channel=fb-dm --outcome=sent --subject="Initial DM" --notes="..."
//
// Flags:
//   --lead | -l         Lead name (fuzzy match across Leads + Leads No Email tables)
//   --lead-id           Skip search; use exact Airtable record ID
//   --channel | -c      phone | voicemail | sms | fb-dm | ig-dm | linkedin | mail
//   --direction | -d    outbound (default) | inbound
//   --outcome | -o      sent | no-answer | voicemail | conversation | interested |
//                       booked | not-interested | do-not-contact | replied
//   --subject | -s      Short summary line
//   --notes | -n        Long-form notes
//   --variant           A/B/C/D/E (for A/B testing)
//   --step              Sequence step (1=initial, 2=follow-up 1, ...)
//   --date              Override timestamp (default = now). ISO format.
//
// Exits non-zero if no lead match or required field missing.

import "dotenv/config";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) { console.error("Missing AIRTABLE_API_KEY/AIRTABLE_BASE_ID"); process.exit(1); }

const LEADS_TABLE = "Leads";
const NO_EMAIL_TABLE = "Leads No Email";
const LOG_TABLE = "Outreach Log";

function arg(short, long) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const equals = a.match(new RegExp(`^(?:--${long}|-${short})=(.*)$`));
    if (equals) return equals[1];
    if (a === `--${long}` || a === `-${short}`) return args[i + 1];
  }
  return null;
}

const leadName = arg("l", "lead");
const leadId = arg("", "lead-id");
const channel = arg("c", "channel");
const direction = arg("d", "direction") || "outbound";
const outcome = arg("o", "outcome");
const subject = arg("s", "subject") || "";
const notes = arg("n", "notes") || "";
const variant = arg("", "variant") || "";
const step = arg("", "step") || "";
const dateOverride = arg("", "date") || "";

if (!channel || !outcome || (!leadName && !leadId)) {
  console.error("Required: --channel, --outcome, AND (--lead OR --lead-id)");
  console.error("Run with --help-style flags or read the file header for the full schema.");
  process.exit(2);
}

const validChannels = ["email", "phone", "voicemail", "sms", "fb-dm", "ig-dm", "linkedin", "mail"];
if (!validChannels.includes(channel)) { console.error(`Invalid --channel. Use one of: ${validChannels.join(", ")}`); process.exit(2); }

async function airJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${url} → ${res.status}: ${(await res.text()).slice(0, 250)}`);
  return res.json();
}

async function findLead() {
  if (leadId) {
    // Try Leads first, then Leads No Email
    for (const t of [LEADS_TABLE, NO_EMAIL_TABLE]) {
      try {
        const r = await airJson(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(t)}/${leadId}`);
        return { id: r.id, name: r.fields["Business Name"], table: t };
      } catch {}
    }
    throw new Error(`No record found with id=${leadId} in either table`);
  }
  // Fuzzy name search across both tables
  const safe = String(leadName).replace(/"/g, '\\"');
  const formula = `OR(SEARCH(LOWER("${safe}"), LOWER({Business Name})), SEARCH(LOWER({Business Name}), LOWER("${safe}")))`;
  for (const t of [LEADS_TABLE, NO_EMAIL_TABLE]) {
    const u = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(t)}`);
    u.searchParams.set("filterByFormula", formula);
    u.searchParams.set("maxRecords", "5");
    u.searchParams.append("fields[]", "Business Name");
    u.searchParams.append("fields[]", "City");
    const data = await airJson(u.toString());
    if ((data.records || []).length === 1) {
      const r = data.records[0];
      return { id: r.id, name: r.fields["Business Name"], table: t, city: r.fields.City };
    }
    if ((data.records || []).length > 1) {
      console.error(`Multiple matches for "${leadName}" in ${t}:`);
      data.records.forEach((r, i) => console.error(`  ${i + 1}. [${r.id}] ${r.fields["Business Name"]} — ${r.fields.City || ""}`));
      console.error(`Re-run with --lead-id=<one-of-the-IDs-above>`);
      process.exit(3);
    }
  }
  throw new Error(`No lead found matching "${leadName}" in either table`);
}

const lead = await findLead();
console.log(`Found: ${lead.name} (${lead.table}, ${lead.id})`);

const date = dateOverride ? new Date(dateOverride) : new Date();
const fields = {
  Activity: `${channel} ${direction === "inbound" ? "←" : "→"} ${lead.name} — ${date.toISOString().slice(0, 10)}`,
  Date: date.toISOString(),
  Channel: channel,
  Direction: direction,
  Outcome: outcome,
};
if (subject) fields.Subject = subject;
if (notes) fields.Notes = notes;
if (variant) fields.Variant = variant;
if (step) fields["Sequence Step"] = Number(step);
if (lead.table === NO_EMAIL_TABLE) {
  fields["Lead (No Email)"] = [lead.id];
} else {
  fields.Lead = [lead.id];
}

const r = await airJson(
  `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(LOG_TABLE)}`,
  { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: true }) }
);
console.log(`✓ Logged: ${fields.Activity}`);
console.log(`  https://airtable.com/${AIRTABLE_BASE_ID}/${encodeURIComponent(LOG_TABLE)}/${r.records[0].id}`);
