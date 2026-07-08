/**
 * next-category-topic.mjs — prints the next TOPIC-post for the non-industry blog categories
 * (Maps SEO / GBP / Website). Reads config/blog-topics-categories.json, prints the first entry
 * (interleaved across categories) whose blog post doesn't yet exist, as: "<title>\t<category>".
 * Prints nothing + exit 3 if the queue is exhausted (append more topics to extend). Exit 2 on read error.
 * Mirrors the pair-a-day pattern of next-blog-topic.mjs. See [[project-blog-index-locked]].
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRAPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBSITE_DIR = path.join(path.dirname(SCRAPER_DIR), 'Rocket Growth Agency Website VS Code');
const BLOG_DIR = path.join(WEBSITE_DIR, 'blog');
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

let queue;
try { queue = JSON.parse(fs.readFileSync(path.join(SCRAPER_DIR, 'config', 'blog-topics-categories.json'), 'utf8')).queue; }
catch (e) { console.error('[next-category-topic] cannot read blog-topics-categories.json:', e.message); process.exit(2); }

const next = (queue || []).find((t) => t && t.title && !fs.existsSync(path.join(BLOG_DIR, slugify(t.title), 'index.html')));
if (!next) { console.error('[next-category-topic] category topic queue exhausted — append more to blog-topics-categories.json.'); process.exit(3); }

process.stdout.write(`${next.title}\t${next.category}`);
