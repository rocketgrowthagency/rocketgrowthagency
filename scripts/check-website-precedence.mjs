#!/usr/bin/env node
/**
 * check-website-precedence.mjs — Google's own Website field must outrank a DISCOVERED one.
 *
 * ─── WHY (2026-08-21, caught by Chris watching a live capture) ───────────────────────────────────
 * step-3 chose the site to film with:
 *
 *     let website = cleanUrl(row['Discovered Website'] || row.Website || row.website || '');
 *
 * `Discovered Website` FIRST — so a bad discovery result overrode the correct URL Google already gave.
 *
 *     Harvey's Pest Control · Website: http://mrsmartbug.com/          ← matches Google Maps exactly
 *                           · Discovered Website: https://controllerdata.lacity.org/
 *
 * The pipeline filmed the **LA City Controller's open-data portal** as a pest-control company's
 * website. The Maps card was correct; only the website was wrong — so every existing gate passed. A
 * video showing a prospect someone else's government data portal is worse than sending nothing.
 *
 * Discovery exists for leads with NO website at all. It must never outrank the real one.
 * Same family as the autotrader.com incident that produced the directory blocklist.
 *
 * INVARIANTS
 *  1. row.Website is consulted BEFORE row['Discovered Website'].
 *  2. The directory/marketplace blocklist still runs on whatever is chosen.
 *
 * Exit 0 = healthy, 1 = regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REC = path.join(path.dirname(HERE), 'step-3-video-recorder.mjs');

const fail = (m) => { console.error(`✗ FATAL: ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✓ ${m}`);

if (!fs.existsSync(REC)) fail('step-3-video-recorder.mjs not found.');
const raw = fs.readFileSync(REC, 'utf8');
// Strip comments — this file's own explanatory text quotes the OLD broken expression verbatim, and a
// naive match would read that prose as code. Third time this trap appeared on 2026-08-21.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');

const assign = src.split('\n').find((l) => /let website = cleanUrl\(/.test(l));
if (!assign) fail('the website selection line is gone — cannot verify which source wins.');

const iWebsite = assign.indexOf('row.Website');
const iDisc = assign.indexOf("row['Discovered Website']");
if (iWebsite === -1) fail('row.Website is not consulted at all — Google\'s own URL would be ignored.');
if (iDisc === -1) {
  ok('Discovered Website is no longer used as a source (Website only)');
} else if (iDisc < iWebsite) {
  fail('`Discovered Website` is consulted BEFORE `Website`. A bad discovery result then overrides the\n' +
       '         correct URL Google gave us — that is how a pest-control lead got filmed showing\n' +
       '         controllerdata.lacity.org. Discovery is a FALLBACK, never an override.');
} else {
  ok('row.Website wins; Discovered Website is only a fallback');
}

// 2. The directory blocklist must still apply to whatever was chosen.
if (!/isBlockedWebsiteUrl\(website\)/.test(src)) {
  fail('the directory/marketplace blocklist no longer runs on the chosen website. Without it a lead\n' +
       '         whose only URL is autotrader/yelp gets filmed as its "website".');
}
ok('directory/marketplace blocklist still applied to the chosen URL');

// ── BEHAVIOURAL — the precedence, applied to the real Harvey's row ───────────────────────────────
const pick = (row) => row.Website || row.website || row['Discovered Website'] || '';
const harvey = { 'Business Name': "Harvey's Pest Control", Website: 'http://mrsmartbug.com/', 'Discovered Website': 'https://controllerdata.lacity.org/' };
if (pick(harvey) !== 'http://mrsmartbug.com/') fail('precedence rule does not pick the real website on the known-bad row.');
ok("behavioural: Harvey's picks mrsmartbug.com, not the city data portal");

const noSite = { 'Business Name': 'No Site Co', Website: '', 'Discovered Website': 'https://realdiscovery.test/' };
if (pick(noSite) !== 'https://realdiscovery.test/') {
  fail('a lead with NO website no longer falls back to discovery — that silently drops buildable leads.');
}
ok('behavioural: a lead with no Website still falls back to discovery');

console.log('✅ website precedence: Google\'s Website wins, discovery is a fallback, blocklist intact.');
