#!/usr/bin/env node
/**
 * check-heading-block-alignment.mjs — a heading must line up with the block it labels.
 *
 * ─── WHY (2026-08-28) ────────────────────────────────────────────────────────────────────────────
 * Chris: "check alignment of everything so if its centered the header matches. DO THIS ON ALL PAGES".
 *
 * 21 sections across 8 pages put a CENTRED content block under a LEFT-aligned heading:
 *
 *     WHY IT MATTERS                                   <- heading at the page gutter, x=60
 *     From buried to the Map Pack
 *              ┌───────────────┐ ┌───────────────┐     <- block centred, inset 250px BOTH sides
 *              │    BEFORE     │ │     AFTER     │
 *
 * The heading hangs out to the left of the thing it labels. Each piece is individually reasonable —
 * a full-width `.section-head`, and a `max-width` block with `margin:auto` — and neither knows the
 * other exists. Nothing is "broken"; they simply do not agree.
 *
 * > **Two elements that must line up will not do so by accident.** If one is centred by `margin:auto`
 * > and the other is placed by the section gutter, their agreement is a coincidence of widths — it
 * > holds at one viewport and breaks at the next.
 *
 * Invisible to any static check: the mismatch only exists once both boxes have real widths, and
 * `text-align` alone does not reveal it (a left-aligned heading over a centred block is two correct
 * declarations producing one wrong result). So this gate MEASURES GEOMETRY.
 *
 * Detects both directions:
 *   1. a centred block (equal inset both sides) under a non-centred heading
 *   2. a `.section-head.is-centered` whose heading is not actually centred on its section
 *
 * Headless only — never opens a window, safe at any hour.
 *
 * Usage:  node scripts/check-heading-block-alignment.mjs [--json]
 * Exit 0 = aligned · 1 = misaligned · 2 = could not tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.dirname(HERE);
const WEBSITE = path.join(path.dirname(SCRAPER), 'Rocket Growth Agency Website VS Code');
const JSON_OUT = process.argv.includes('--json');
const WIDTHS = [1440, 1024, 390];

if (!fs.existsSync(WEBSITE)) { console.error('✗ website repo not found'); process.exit(2); }

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('✗ playwright unavailable — cannot measure, refusing to report aligned.'); process.exit(2); }

// Page list from tracked HTML. /v/ outreach landings, mockups and frozen snapshots are excluded:
// they are not part of the marketing site's shared design.
let urls;
try {
  urls = [...new Set(execFileSync('git', ['ls-files', '*.html'], { cwd: WEBSITE, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
    .split('\n').filter(Boolean)
    .filter((f) => !f.startsWith('_site-snapshots/') && !f.startsWith('v/') && !path.basename(f).startsWith('mockup'))
    .map((f) => '/' + (path.dirname(f) === '.' ? '' : path.dirname(f) + '/')))];
} catch (e) { console.error(`✗ git ls-files failed: ${String(e.message).slice(0, 90)}`); process.exit(2); }
if (!urls.length) { console.error('✗ no pages resolved — refusing to judge over an empty set.'); process.exit(2); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let f = path.join(WEBSITE, decodeURIComponent((req.url || '/').split('?')[0]));
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch {}
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let browser;
try { browser = await chromium.launch(); }
catch (e) { server.close(); console.error(`✗ chromium would not launch: ${String(e.message).slice(0, 80)}`); process.exit(2); }

const findings = [];
let measured = 0;
try {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    for (const u of urls) {
      const pg = await ctx.newPage();
      try {
        const r = await pg.goto(BASE + u, { waitUntil: 'load', timeout: 15000 });
        if (!r || r.status() !== 200) { await pg.close(); continue; }
        await pg.waitForTimeout(70);
        const bad = await pg.evaluate(() => {
          const out = [];
          const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 2; };
          for (const sec of document.querySelectorAll('.section')) {
            const sr = sec.getBoundingClientRect(), cs = getComputedStyle(sec);
            const inL = sr.left + parseFloat(cs.paddingLeft), inR = sr.right - parseFloat(cs.paddingRight);
            const head = sec.querySelector(':scope > .section-head');
            const h = head ? head.querySelector('h1,h2') : sec.querySelector(':scope > h1, :scope > h2');
            if (!h || !vis(h)) continue;
            const centredHead = getComputedStyle(h).textAlign === 'center';

            // (2) claims centred but is not.
            // 🔴 A block-level <h2> has a FULL-WIDTH bounding box whatever its text-align, so its
            // rect can never reveal centring — measuring it made this check pass while the heading
            // was left-aligned. Measure the rendered TEXT extent with a Range instead.
            if (head && head.classList.contains('is-centered')) {
              const rng = document.createRange(); rng.selectNodeContents(h);
              const tr = rng.getBoundingClientRect(); rng.detach?.();
              if (tr.width > 4) {
                const off = Math.abs((tr.left + tr.right) / 2 - (inL + inR) / 2);
                if (off > 3) out.push({ kind: 'claims-centred', label: h.innerText.trim().slice(0, 40),
                  detail: `text off-centre by ${Math.round(off)}px (declared is-centered)` });
              }
              // deliberately NOT `continue` — a section that merely CLAIMS centring must still be
              // checked below, or neutering the shared rule hides it from both detectors at once.
            }
            // (1) centred block under a non-centred heading
            const hrng = document.createRange(); hrng.selectNodeContents(h);
            const htext = hrng.getBoundingClientRect(); hrng.detach?.();
            const hr = htext.width > 4 ? htext : (head || h).getBoundingClientRect();
            for (const c of [...sec.children]) {
              if (c === head || c.contains(h) || !vis(c)) continue;
              const cr = c.getBoundingClientRect();
              const gapL = Math.round(cr.left - inL), gapR = Math.round(inR - cr.right);
              if (gapL > 12 && Math.abs(gapL - gapR) <= 4 && !centredHead && Math.abs(cr.left - hr.left) > 12) {
                out.push({ kind: 'centred-block-left-head', label: h.innerText.trim().slice(0, 40),
                  detail: `head x=${Math.round(hr.left)}, block x=${Math.round(cr.left)} (inset ${gapL}px both sides)` });
                break;
              }
            }
          }
          return out;
        });
        measured++;
        for (const f of bad) findings.push({ url: u, width: w, ...f });
      } catch {}
      await pg.close();
    }
    await ctx.close();
  }
} finally {
  try { await browser.close(); } catch {}
  try { server.close(); } catch {}
}

const EXPECTED = urls.length * WIDTHS.length;
if (measured < EXPECTED * 0.8) {
  console.error(`✗ only measured ${measured}/${EXPECTED} page-widths — refusing to judge alignment.`);
  process.exit(2);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ pages: urls.length, widths: WIDTHS, measured, findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

console.log(`\n===== HEADING / BLOCK ALIGNMENT =====`);
console.log(`  measured  ${measured}/${EXPECTED} page-widths (${urls.length} pages × ${WIDTHS.length} widths)`);

if (!findings.length) {
  console.log(`\n✅ every heading lines up with the block it labels.`);
  process.exit(0);
}

const byUrl = new Map();
for (const f of findings) { if (!byUrl.has(f.url)) byUrl.set(f.url, []); byUrl.get(f.url).push(f); }
console.error(`\n✗ ${findings.length} misalignment(s) across ${byUrl.size} page(s):`);
for (const [u, list] of [...byUrl].slice(0, 12)) {
  console.error(`     ${u}`);
  for (const f of list.slice(0, 3)) console.error(`        @${f.width}px  [${f.kind}]  "${f.label}"  ${f.detail}`);
}
if (byUrl.size > 12) console.error(`     … and ${byUrl.size - 12} more pages`);
console.error(`\n   A block centred with margin:auto under a heading placed by the section gutter will`);
console.error(`   not line up. Add 'is-centered' to that section's .section-head (styled in style.css).`);
process.exit(1);
