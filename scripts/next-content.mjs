#!/usr/bin/env node
/**
 * next-content.mjs — prints the next industry to release in the 1/day inbound-content drip.
 * Picks the first vertical in config/content-release-queue.json whose industry page does NOT yet
 * exist in the Website repo. Prints ONLY the vertical name (or nothing + exit 3 if queue done).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IND_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code', 'industries');
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let queue;
try { queue = JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'content-release-queue.json'), 'utf8')).queue; }
catch (e) { console.error('[next-content] cannot read queue:', e.message); process.exit(2); }
const next = queue.find((v) => !fs.existsSync(path.join(IND_DIR, slugify(v), 'index.html')));
if (!next) { console.error('[next-content] queue complete — all industries released.'); process.exit(3); }
process.stdout.write(next);
