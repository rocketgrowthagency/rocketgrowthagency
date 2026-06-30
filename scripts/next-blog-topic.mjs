#!/usr/bin/env node
/**
 * next-blog-topic.mjs — prints the next blog topic for the perpetual 1/day blog drip.
 * Reads config/blog-topics.json (50 industries first, then endless long-tail), prints the first
 * whose blog post doesn't yet exist. Prints ONLY the topic (or nothing + exit 3 if all done —
 * which should be rare; append more topics to blog-topics.json to extend indefinitely).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code', 'blog');
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let queue;
try { queue = JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'blog-topics.json'), 'utf8')).queue; }
catch (e) { console.error('[next-blog-topic] cannot read blog-topics.json:', e.message); process.exit(2); }
const next = queue.find((t) => !fs.existsSync(path.join(BLOG_DIR, `local-seo-for-${slugify(t)}`, 'index.html')));
if (!next) { console.error('[next-blog-topic] blog queue exhausted — append more topics to blog-topics.json.'); process.exit(3); }
process.stdout.write(next);
