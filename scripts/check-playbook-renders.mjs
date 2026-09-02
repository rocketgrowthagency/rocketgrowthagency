#!/usr/bin/env node
/**
 * check-playbook-renders.mjs — the playbook must actually RENDER, not merely parse.
 *
 * ─── WHY (2026-09-02) ──────────────────────────────────────────────────────────────────────────
 * `check-playbook-integrity.mjs` validates the DATA: block kinds, table widths, flow links, the
 * Airtable contract. All of that can be perfect while the page shows nothing — a renderer that
 * throws on the first tab, a tab strip that overflows, a guided-call button that renders but is not
 * clickable. Three tabs and four flow nodes were added today and NONE of it had ever been loaded in
 * a browser.
 *
 * > A structural gate cannot see a blank screen. This one opens the real page and looks.
 *
 * It renders `admin/playbook.js` against the real renderer in a headless browser, clicks through
 * every tab, and walks the guided call to a terminal node — the exact path a rep takes mid-call.
 *
 * Usage:  node scripts/check-playbook-renders.mjs [--json] [--headed]
 * Exit 0 = renders · 1 = a real rendering defect · 2 = could not run the browser (NOT healthy).
 */
import fs from 'node:fs';
import path from 'node:path';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const JSON_OUT = process.argv.includes('--json');
const HEADED = process.argv.includes('--headed');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('✗ playwright unavailable — cannot verify rendering. NOT reporting healthy.'); process.exit(2); }

const pbSrc = fs.readFileSync(path.join(WEBSITE, 'admin/playbook.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEBSITE, 'admin/admin.css'), 'utf8');

// Mount the REAL playbook.js against the same DOM hooks admin/index.html provides. If the module
// expects something that is missing, that is itself the defect we are hunting.
const html = `<!doctype html><meta charset="utf-8"><style>${cssSrc}</style>
<body class="admin-body" data-admin-view="playbook">
  <section id="playbookView"><div id="playbookMount"></div></section>
  <div id="pbDrawer"></div><div id="pbBackdrop"></div>
<script>window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));</script>
<script>${pbSrc}</script>
<script>
  // playbook.js does NOT self-render — it exposes window.RGAPlaybook.render(mount, opts) and
  // admin.js calls it into #playbookMount. Mount it the same way, or this checks nothing.
  try { window.RGAPlaybook.render(document.getElementById('playbookMount'), { compact: false }); }
  catch (e) { window.__errs.push('RGAPlaybook.render threw: ' + e.message); }
</script>`;

const defects = [];
const add = (t, d) => defects.push({ type: t, detail: d });
let browser;

try {
  browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrs = [];
  page.on('pageerror', (e) => consoleErrs.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // 1. Did the module throw on mount?
  const errs = await page.evaluate(() => window.__errs || []);
  for (const e of [...errs, ...consoleErrs]) {
    if (/favicon|net::ERR/i.test(e)) continue;
    add('render-threw', e.slice(0, 140));
  }

  const TAB_SEL0 = '#playbookView [data-pb-tab], #playbookView .pb-tab, #playbookView nav button, #playbookView nav a';

  // 2. Are the tabs actually in the DOM?
  const tabs = await page.$$eval('#playbookView [data-pb-tab], #playbookView .pb-tab, #playbookView nav button, #playbookView nav a',
    (els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean));
  const expected = [...pbSrc.matchAll(/tab: "([^"]+)"/g)].map((m) => m[1]);

  if (!tabs.length) {
    add('no-tabs-rendered', `${expected.length} tabs in the data, ZERO in the DOM — the playbook renders blank`);
  } else {
    for (const t of expected) {
      const norm = (s) => s.replace(/\s+/g, ' ').replace(/[—–]/g, '-').trim();
      if (!tabs.some((x) => norm(x).includes(norm(t)) || norm(t).includes(norm(x)))) {
        add('tab-missing-from-dom', `"${t}" is in the data but not on screen`);
      }
    }
  }

  // 3. Every tab's CONTENT must be in the DOM.
  //
  // 🔑 This renderer paints ALL tabs at once (289 blocks, all visible) — the tab strip scrolls to a
  // section, it does not swap panes. So "click a tab and count its blocks" measures nothing.
  // 🔴 And do NOT measure innerText length: the tab strip plus a tab's `sub` line is ~400 chars on an
  // ENTIRELY EMPTY tab, so a length check happily passed a tab whose blocks had all been deleted.
  // Count rendered block ELEMENTS against what the data says, and check each tab's title landed.
  const BLOCK_SEL = '.pb-say, .pb-dont, .pb-why, .pb-note, .pb-h, .pb-kpi, .pb-branch, .pb-table, .pb-obj';
  const renderedBlocks = await page.$$eval(`#playbookView ${BLOCK_SEL}`, (e) => e.length).catch(() => 0);
  const dataBlocks = (() => {
    try {
      const m2 = pbSrc.match(/const PB = \[[\s\S]*?\n {2}\];/);
      const PB2 = eval('(function(){const SAY=t=>({k:"say",t}),DONT=t=>({k:"dont",t}),WHY=t=>({k:"why",t}),'
        + 'NOTE=t=>({k:"note",t}),BRANCH=i=>({k:"branch",items:i});' + m2[0] + 'return PB;})()');
      return PB2.reduce((a, x) => a + (x.blocks || []).length, 0);
    } catch { return null; }
  })();

  if (!renderedBlocks) {
    add('nothing-rendered', `${dataBlocks ?? '?'} blocks in the data, ZERO painted — the playbook is blank`);
  } else if (dataBlocks && renderedBlocks < Math.ceil(dataBlocks * 0.9)) {
    add('blocks-missing-from-dom', `data has ${dataBlocks} blocks, only ${renderedBlocks} painted — a tab's content is not rendering`);
  }

  // Each tab's section must appear in the BODY, not just as a label in the strip.
  // 🔑 The renderer paints the `tab` value as the section heading, NOT `title` — checking `title`
  // reported a false defect on a tab that was rendering perfectly. Read the field the DOM uses.
  const bodyText = await page.evaluate(() => (document.querySelector('#playbookView')?.innerText || '').replace(/\s+/g, ' '));
  const norm = (x) => x.replace(/\s+/g, ' ').replace(/[—–]/g, '-').toLowerCase().trim();
  for (const t of [...pbSrc.matchAll(/tab: "([^"]+)"/g)].map((m) => m[1])) {
    if (!norm(bodyText).includes(norm(t))) add('tab-section-not-rendered', `"${t}" never painted into the body`);
  }

  // Every tab link must be clickable without throwing.
  for (let i = 0; i < (await page.$$(TAB_SEL0)).length; i++) {
    const handles = await page.$$(TAB_SEL0);
    const label = ((await handles[i].textContent()) || `#${i}`).trim();
    try { await handles[i].click({ timeout: 3000 }); await page.waitForTimeout(60); }
    catch { add('tab-not-clickable', label); }
  }

  // 4. The GUIDED CALL is the live path — walk it to a terminal node.
  //
  // 🔴 Re-QUERY before every interaction. Clicking a tab re-renders the pane, which DETACHES every
  // element handle captured earlier — a stale handle silently matches nothing and reads exactly like
  // "the feature is broken". That cost a false defect the first time this ran.
  const TAB_SEL = '#playbookView [data-pb-tab], #playbookView .pb-tab, #playbookView nav button, #playbookView nav a';
  const guidedTab = (await page.$$(TAB_SEL)).length
    ? await page.evaluateHandle((sel) => [...document.querySelectorAll(sel)].find((e) => /guided/i.test(e.textContent || '')), TAB_SEL)
    : null;
  const gEl = guidedTab && (await guidedTab.asElement());
  if (!gEl) {
    add('guided-tab-missing', 'no Guided call tab found in the DOM');
  } else {
    await gEl.click();
    await page.waitForTimeout(250);
    let steps = 0;
    const trail = [];
    while (steps < 14) {
      const n = await page.$$eval('#playbookView .pb-opt', (e) => e.length).catch(() => 0);
      if (!n) break;                                   // terminal node — no options left is CORRECT
      // 🔴 Compare the GUIDED PANE, not #playbookView — the first 300 chars of the view are the TAB
      // STRIP, which is identical on every node. Comparing that reported "pane unchanged" on a walk
      // that was working perfectly. Fingerprint = the node's options + its outcome text.
      const fingerprint = () => page.evaluate(() => {
        const opts = [...document.querySelectorAll('#playbookView .pb-opt')].map((e) => e.textContent.trim()).join('|');
        const out = document.querySelector('#playbookView .pb-out')?.textContent?.trim() || '';
        const crumbs = document.querySelector('#playbookView .pb-crumbs')?.textContent?.trim() || '';
        return `${opts}##${out}##${crumbs}`;
      });
      const before = await fingerprint();
      const label = await page.$$eval('#playbookView .pb-opt', (e) => (e[0].textContent || '').trim().slice(0, 30));
      try { await page.click('#playbookView .pb-opt', { timeout: 3000 }); }
      catch { add('guided-option-not-clickable', `step ${steps} ("${label}")`); break; }
      await page.waitForTimeout(180);
      const after = await fingerprint();
      if (before === after) { add('guided-click-did-nothing', `step ${steps} ("${label}") — pane unchanged`); break; }
      trail.push(label); steps++;
    }
    if (steps === 0) add('guided-no-options', 'the guided call rendered no clickable options at the start node — unusable mid-call');
    else {
      const ended = await page.$$eval('#playbookView .pb-out', (e) => e.length).catch(() => 0);
      if (!ended && steps >= 14) add('guided-never-terminates', `walked 14 steps without reaching an outcome — possible loop: ${trail.join(' → ')}`);
      console.log(`  walked ${steps} step(s): ${trail.join(' → ')}`);
    }
  }

  await browser.close(); browser = null;
} catch (e) {
  if (browser) await browser.close().catch(() => {});
  console.error(`✗ could not run the browser check (${String(e.message).slice(0, 90)}) — NOT healthy.`);
  process.exit(2);
}

if (JSON_OUT) { console.log(JSON.stringify({ defects }, null, 2)); process.exit(defects.length ? 1 : 0); }

console.log('\n===== PLAYBOOK RENDERS =====');
if (!defects.length) {
  console.log('  ✅ every tab renders with content · guided call walks to a terminal node · no JS errors');
  process.exit(0);
}
console.error(`\n✗ ${defects.length} rendering defect(s):`);
for (const d of defects) console.error(`     ${d.type.padEnd(28)} ${d.detail}`);
console.error('\n   A structural gate cannot see a blank screen. This is what a rep actually looks at.');
process.exit(1);
