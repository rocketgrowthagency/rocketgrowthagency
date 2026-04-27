#!/usr/bin/env node
// Pick the highest-value leads from the Leads table to focus on first.
// Quality > quantity — these are the ones worth manual phone follow-up + extra
// attention on the email. For early days when total send volume is small.
//
// Score formula:
//   Top-3 rank ........... +40
//   Rank 4-5 ............. +20
//   Rank 6-10 ............ +10
//   Tier 1 city .......... +20  (Beverly Hills/Manhattan Beach/etc.)
//   Tier 2 city .......... +10
//   Has email ............ +25  (we can email)
//   Has phone ............ +5
//   Has website .......... +5
//   Status='new' (haven't contacted) ... +10
//   Has Video URL ........ +15  (video pipeline ran for them)
//   Avg ticket >= $5k vertical ... +10
//
// Usage:
//   node high-value-leads.mjs                # top 20 by score
//   node high-value-leads.mjs --limit=50
//   node high-value-leads.mjs --json         # machine-readable
//   node high-value-leads.mjs --vertical=Plumbers
//   node high-value-leads.mjs --city="Beverly Hills"

import "dotenv/config";

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
const LEADS_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads`;
const QUEUE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("Search Queue")}`;

const ARGS = process.argv.slice(2);
const LIMIT = Number((ARGS.find((a) => a.startsWith("--limit="))?.slice(8)) || 20);
const JSON_OUT = ARGS.includes("--json");
const FILTER_VERT = ARGS.find((a) => a.startsWith("--vertical="))?.slice(11);
const FILTER_CITY = ARGS.find((a) => a.startsWith("--city="))?.slice(7);

const TIER1_CITIES = new Set([
  "Beverly Hills", "Santa Monica", "Culver City", "Manhattan Beach", "Hermosa Beach",
  "Redondo Beach", "El Segundo", "Marina del Rey", "Pacific Palisades", "Brentwood",
  "Westwood", "West Hollywood", "Sherman Oaks", "Studio City", "Encino",
  "Calabasas", "Malibu", "Pasadena", "San Marino", "Hollywood",
  "San Francisco", "Palo Alto", "Mountain View", "Menlo Park", "Berkeley",
  "San Mateo", "Redwood City", "Cupertino", "Los Altos", "Sausalito",
  "Mill Valley", "Tiburon", "Walnut Creek", "San Rafael",
  "Newport Beach", "Laguna Beach", "Dana Point", "San Clemente", "Yorba Linda",
  "Laguna Niguel", "Coto de Caza",
  "La Jolla", "Del Mar", "Solana Beach", "Coronado", "Encinitas",
  "Carlsbad", "Poway", "Rancho Santa Fe",
]);

async function airJson(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function loadAll(api) {
  const all = [];
  let offset = null;
  do {
    const u = new URL(api);
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const d = await airJson(u.toString());
    all.push(...(d.records || []));
    offset = d.offset;
  } while (offset);
  return all;
}

// Pull queue rows so we can map vertical → avg ticket
const queue = await loadAll(QUEUE_API);
const verticalAvgTicket = {};
for (const q of queue) {
  const v = q.fields?.Vertical;
  if (v && q.fields?.["Avg Ticket"]) verticalAvgTicket[v] = q.fields["Avg Ticket"];
}

const leads = await loadAll(LEADS_API);

function scoreLead(f) {
  let score = 0;
  const rank = Number(f["Map Rank"]) || 99;
  if (rank >= 1 && rank <= 3) score += 40;
  else if (rank >= 4 && rank <= 5) score += 20;
  else if (rank >= 6 && rank <= 10) score += 10;

  if (TIER1_CITIES.has(f.City)) score += 20;
  else if (f.City) score += 10;

  if (f.Email) score += 25;
  if (f.Phone) score += 5;
  if (f.Website) score += 5;
  if (!f.Status || f.Status === "new") score += 10;
  if (f["Video URL"]) score += 15;

  const term = f["Search Term"] || "";
  const verticalKey = Object.keys(verticalAvgTicket).find((v) => term.toLowerCase().startsWith(v.toLowerCase()));
  if (verticalKey && verticalAvgTicket[verticalKey] >= 5000) score += 10;

  return score;
}

let scored = leads.map((r) => ({
  id: r.id,
  fields: r.fields || {},
  score: scoreLead(r.fields || {}),
}));

if (FILTER_VERT) scored = scored.filter((r) => (r.fields["Search Term"] || "").toLowerCase().includes(FILTER_VERT.toLowerCase()));
if (FILTER_CITY) scored = scored.filter((r) => (r.fields.City || "").toLowerCase() === FILTER_CITY.toLowerCase());

scored.sort((a, b) => b.score - a.score);
const top = scored.slice(0, LIMIT);

if (JSON_OUT) {
  console.log(JSON.stringify(top.map((r) => ({ id: r.id, score: r.score, name: r.fields["Business Name"], rank: r.fields["Map Rank"], city: r.fields.City, email: r.fields.Email, phone: r.fields.Phone })), null, 2));
  process.exit(0);
}

function pad(s, n) { s = String(s ?? ""); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); }

console.log(`\nTop ${top.length} high-value leads (of ${scored.length} total)\n`);
console.log(pad("Score", 6) + pad("Rank", 5) + pad("Business", 35) + pad("City", 16) + pad("Email", 35) + "Phone");
console.log("-".repeat(110));
for (const r of top) {
  const f = r.fields;
  console.log(
    pad(r.score, 6) +
    pad(`#${f["Map Rank"] || "?"}`, 5) +
    pad(f["Business Name"] || "(unnamed)", 35) +
    pad(f.City || "", 16) +
    pad(f.Email || "—", 35) +
    (f.Phone || "—")
  );
}
console.log("");
const withEmail = top.filter((r) => r.fields.Email).length;
const top3 = top.filter((r) => Number(r.fields["Map Rank"]) >= 1 && Number(r.fields["Map Rank"]) <= 3).length;
console.log(`Summary: ${withEmail}/${top.length} have email, ${top3}/${top.length} are top-3 ranked\n`);
console.log(`Open in Airtable: https://airtable.com/${AIRTABLE_BASE_ID}/tblhmmUwn9jdWCL3F\n`);
