#!/usr/bin/env node
/**
 * build-playbook-pdf.mjs — the sales playbook as a PRINTABLE PDF.
 *
 * ─── WHY (2026-09-03) ──────────────────────────────────────────────────────────────────────────
 * Chris: *"i want all scripts given to my in pdf format. i want to print and then start reading and
 * studying."* The admin playbook is built for reading mid-call on a screen — dark cards, colour-coded
 * Say/Don't/Why, a scrolling tab strip. On paper that is unreadable and burns a cartridge.
 *
 * So this is not "print the admin page". It is a re-typeset document for STUDY:
 *   · black on white, serif body, generous margins — a printer's job, not a screen's
 *   · Say / Don't / Why carried by LABELS and rules, never by colour (survives a mono printer)
 *   · one tab per page, so a section is never split across a page turn mid-script
 *   · the guided call rendered as a decision TREE, which a screen shows one node at a time
 *   · a study contents page with what to learn in what order
 *
 * 🔑 ONE SOURCE. Every word comes from `admin/playbook.js`, so the printout cannot drift from the
 * live playbook. Re-run this after any playbook change.
 *
 *   node scripts/build-playbook-pdf.mjs            → docs/sales-playbook.pdf
 *   node scripts/build-playbook-pdf.mjs --open     → also open it
 *
 * Exit 0 = written · 1 = the playbook could not be read/parsed · 2 = no browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const WEBSITE = '/Users/chris/RGA/Rocket Growth Agency Website VS Code';
const OUT = path.join(WEBSITE, 'docs/sales-playbook.pdf');
const OPEN = process.argv.includes('--open');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('✗ playwright unavailable — cannot render a PDF.'); process.exit(2); }

const src = fs.readFileSync(path.join(WEBSITE, 'admin/playbook.js'), 'utf8');
const pbM = src.match(/const PB = \[[\s\S]*?\n {2}\];/);
const flM = src.match(/const FLOW = \{[\s\S]*?\n {2}\};/);
if (!pbM) { console.error('✗ could not locate the PB array.'); process.exit(1); }

const HELPERS = 'const SAY=t=>({k:"say",t}),DONT=t=>({k:"dont",t}),WHY=t=>({k:"why",t}),'
  + 'NOTE=t=>({k:"note",t}),BRANCH=i=>({k:"branch",items:i}),ACTION=i=>({k:"action",items:i}),'
  + 'SEE=(tab,h,lead)=>({k:"see",tab,h,lead});';
let PB, FLOW = {};
try { PB = eval(`(function(){${HELPERS}${pbM[0]}return PB;})()`); }
catch (e) { console.error(`✗ PB does not evaluate: ${e.message}`); process.exit(1); }
try { if (flM) FLOW = eval(`(function(){${HELPERS}${flM[0]}return FLOW;})()`); } catch {}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// [placeholders] print as underlined blanks — you fill them in from the lead card.
// <b> is the one tag the data carries — esc() printed it as literal "<b>" text until 2026-10-02.
const ph = (s) => esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>').replace(/\[([^\]]+)\]/g, '<u>$1</u>');
// Strip screen-only emoji: they print as tofu boxes on many printers and add nothing on paper.
const clean = (s) => String(s ?? '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '').replace(/\s{2,}/g, ' ').trim();

// Cut at a WORD boundary. A contents line ending "...find o" reads as a broken document, not a summary.
const trim = (s, n) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\u2014-]+$/, '') + '\u2026';
};

// ── SEE boxes: a pointer that works on PAPER (Chris, 2026-10-02: "this is a PDF so there is no way to
// click an arrow"). Each box prints the real page number of what it points at. Page numbers are not
// guessed: the document is printed, each target's page is READ BACK out of the PDF, and it is printed
// again with those numbers — repeated until the numbers stop moving. A box is also a live link when
// the PDF is opened on a screen.
let CUR_TAB = '';
let PAGES = {};
const slug = (x) => clean(String(x || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tid = (tab, h) => `t-${tab}-${slug(h)}`;
const SEE_TARGETS = new Set();
(function collect(list) { for (const b of list || []) { if (b.k === 'see') SEE_TARGETS.add(tid(b.tab, b.h)); if (b.k === 'obj') collect(b.a); } })(PB.flatMap((x) => x.blocks || []));
const TID_LIST = [...SEE_TARGETS];
// An invisible, absolutely-positioned marker: extractable by pdftotext, zero effect on layout.
const marker = (id) => SEE_TARGETS.has(id) ? `<span class="pgm">@@T${TID_LIST.indexOf(id)}@@</span>` : '';
const anchor = (id) => `<a id="${id}"></a>${marker(id)}`;

function block(b) {
  const t = ph(clean(b.t));
  switch (b.k) {
    case 'see': {
      const id = tid(b.tab, b.h);
      const sec = PB.find((x) => x.id === b.tab);
      const pg = PAGES[id];
      return `<a class="see" href="#${id}"><span class="lbl">SEE</span><span class="st">${b.lead ? `${ph(clean(b.lead))} &mdash; ` : ''}`
        + `<strong>${esc(clean(sec ? sec.tab : b.tab))}</strong>${b.h ? ` &middot; ${ph(clean(b.h))}` : ''}</span>`
        + `<span class="pg">page ${pg ? pg : '&nbsp;&nbsp;'}</span></a>`;
    }
    case 'h': return `<h3>${anchor(tid(CUR_TAB, b.t))}<span class="n">${b.n}</span>${esc(clean(b.t))}</h3>`;
    case 'say': return `<div class="say"><span class="lbl">SAY</span><p>${t}</p></div>`;
    case 'dont': return `<div class="dont"><span class="lbl">DON'T</span><p>${t}</p></div>`;
    case 'why': return `<div class="why"><span class="lbl">WHY</span><p>${t}</p></div>`;
    case 'note': return `<p class="note">${t}</p>`;
    case 'action': return `<div class="action"><span class="lbl">ACTION</span><ol>${b.items.map((i) => `<li>${ph(clean(i))}</li>`).join('')}</ol></div>`;
    case 'kpi': return `<table class="kpi"><tr>${b.items.map(([n]) => `<th>${esc(n)}</th>`).join('')}</tr><tr>${b.items.map(([, d]) => `<td>${esc(clean(d))}</td>`).join('')}</tr></table>`;
    case 'branch': return `<dl class="branch">${b.items.map(([q, a]) => `<dt>${ph(clean(q))}</dt><dd>${ph(clean(a))}</dd>`).join('')}</dl>`;
    case 'table': return `<table class="tbl"><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${ph(clean(String(c).replace(/<\/?b>/g, '')))}</td>`).join('')}</tr>`).join('')}</table>`;
    case 'obj': return `<div class="obj"><h4>${anchor(tid(CUR_TAB, b.q))}${ph(clean(b.q))}</h4>${b.a.map(block).join('')}</div>`;
    default: return '';
  }
}

// The guided call is a tree. A screen shows one node; paper can show the whole shape, which is the
// only way to learn it rather than follow it.
function flowTree() {
  if (!Object.keys(FLOW).length) return '';
  const seen = new Set();
  const node = (id, depth) => {
    const n = FLOW[id];
    if (!n || depth > 6) return '';
    const dup = seen.has(id);
    seen.add(id);
    const says = (n.b || []).filter((x) => x.k === 'say').map((x) => `<p class="fsay">${ph(clean(x.t))}</p>`).join('');
    const opts = (n.o || []).map(([label, to]) => {
      const target = FLOW[to] ? ` &rarr; <em>${esc(clean(FLOW[to].t || to))}</em>` : '';
      return `<li>${ph(clean(label))}${target}${FLOW[to] && !seen.has(to) ? node(to, depth + 1) : ''}</li>`;
    }).join('');
    return `<div class="fnode"><h4>${esc(clean(n.t || id))}${dup ? ' <span class="rep">(see above)</span>' : ''}</h4>`
      + (dup ? '' : says + (n.out ? `<p class="fout">LOG: ${esc(clean(n.out))}</p>` : '') + (opts ? `<ul class="fopts">${opts}</ul>` : ''))
      + `</div>`;
  };
  return `<section class="tab"><h2>Appendix &mdash; the guided call, as one map</h2>
    <p class="lead">On screen this shows one step at a time. Printed whole, you can see the shape of the
    call and learn it instead of following it. Indented items are what happens next.</p>
    ${node('start', 0)}</section>`;
}

const today = execFileSync('date', ['+%B %-d, %Y'], { encoding: 'utf8' }).trim();
const printable = PB.filter((s) => (s.blocks || []).length);

const makeHtml = () => `<!doctype html><meta charset="utf-8"><title>RGA Sales Playbook</title><style>
  @page { size: Letter; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 Georgia,"Times New Roman",serif; color:#000; margin:0; }
  h1 { font-size: 30pt; line-height:1.1; margin:0 0 6pt; letter-spacing:-.5pt; }
  h2 { font-size: 17pt; margin:0 0 3pt; padding-bottom:5pt; border-bottom:2.5pt solid #000; }
  h3 { font-size: 11.5pt; margin:15pt 0 5pt; text-transform:uppercase; letter-spacing:.7pt; }
  h3 .n { display:inline-block; min-width:15pt; }
  h4 { font-size:10.5pt; margin:10pt 0 4pt; }
  p { margin:0 0 6pt; orphans:3; widows:3; }
  .cover { height:222mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }
  .cover .sub { font-size:13pt; font-style:italic; margin-top:8pt; }
  .cover .meta { margin-top:26pt; font-size:9pt; border-top:1pt solid #000; padding-top:8pt; }
  .contents { page-break-after:always; }
  .contents ol { padding-left:16pt; } .contents li { margin-bottom:4pt; }
  .contents .study { border:1.5pt solid #000; padding:10pt 13pt; margin-top:16pt; }
  .tab { page-break-before:always; }
  .lead { font-style:italic; margin:6pt 0 12pt; }
  .say,.dont,.why,.action { margin:0 0 7pt; padding-left:52pt; position:relative; }
  .action ol { margin:0; padding-left:14pt; font-size:10pt; } .action li { margin-bottom:2pt; }
  .action .lbl { border-width:1.5pt; }
  .say p,.dont p,.why p { margin:0; }
  .lbl { position:absolute; left:0; top:1pt; font:bold 7.5pt/1.4 Helvetica,Arial,sans-serif;
         letter-spacing:.9pt; border:1pt solid #000; padding:1pt 4pt; }
  .say { border-left:3pt solid #000; padding-top:2pt; padding-bottom:2pt; margin-left:2pt; }
  .say p { font-size:11.5pt; }
  .dont .lbl { background:#000; color:#fff; }
  .why { font-size:9.5pt; }
  .why .lbl { border-style:dashed; }
  .note { font-size:9.5pt; padding-left:52pt; }
  .obj { break-inside:avoid; border-top:1pt solid #000; padding-top:8pt; margin-bottom:12pt; }
  .obj h4 { font-size:11.5pt; }
  table { width:100%; border-collapse:collapse; margin:8pt 0 12pt; font-size:9.5pt; break-inside:avoid; }
  th,td { border:.75pt solid #000; padding:4pt 6pt; text-align:left; vertical-align:top; }
  th { background:#eee; font:bold 8.5pt Helvetica,Arial,sans-serif; }
  .kpi th { font-size:14pt; text-align:center; } .kpi td { text-align:center; font-size:9pt; }
  .branch { margin:6pt 0 12pt; }
  .branch dt { font-weight:bold; margin-top:6pt; }
  .branch dd { margin:1pt 0 0 16pt; font-size:10pt; }
  .fnode { margin:8pt 0 8pt 0; padding-left:11pt; border-left:1.5pt solid #000; break-inside:avoid; }
  .fsay { font-size:10pt; }
  .fout { font:bold 9pt Helvetica,Arial,sans-serif; letter-spacing:.4pt; }
  .fopts { margin:4pt 0 0 12pt; padding:0; font-size:9.5pt; }
  .fopts li { margin-bottom:3pt; }
  .rep { font:italic 8.5pt Georgia,serif; }
  u { text-decoration:none; border-bottom:1pt solid #000; padding:0 8pt; }
  .pgm { position:absolute; font-size:2pt; color:#fff; }
  h2, h3, h4 { position:relative; }
  .see { display:flex; gap:10pt; align-items:baseline; margin:0 0 7pt; padding:4pt 8pt; border:1pt solid #000;
         color:#000; text-decoration:none; break-inside:avoid; font-size:9.5pt; }
  .see .lbl { position:static; font:bold 7.5pt/1.4 Helvetica,Arial,sans-serif; letter-spacing:.9pt;
              background:#000; color:#fff; padding:1pt 4pt; }
  .see .st { flex:1 1 auto; }
  .see .pg { font:bold 9.5pt Helvetica,Arial,sans-serif; white-space:nowrap; min-width:46pt; text-align:right; }
</style>
<body>

<div class="cover">
  <h1>RGA Sales Playbook</h1>
  <p class="sub">Every script, objection and beat &mdash; for study, off the screen.</p>
  <div class="meta">
    Rocket Growth Agency &middot; internal &middot; ${esc(today)}<br>
    ${printable.length} sections &middot; generated from <tt>admin/playbook.js</tt>, the single source.<br>
    <strong>If this and the admin playbook disagree, the admin playbook wins.</strong> Re-run
    <tt>build-playbook-pdf.mjs</tt> after any change.
  </div>
</div>

<section class="contents">
  <h2>Contents</h2>
  <ol>${printable.map((s) => `<li><strong>${esc(clean(s.tab))}</strong> &mdash; ${esc(trim(clean(s.sub || ''), 108))}</li>`).join('')}
  <li><strong>Appendix</strong> &mdash; the guided call as one map</li></ol>

  <div class="study">
    <h3>How to study this</h3>
    <p><strong>1. Guard &amp; tone first.</strong> It is the layer under everything else. You cannot sell
    to someone whose guard is up, and the same words land differently depending on how you say them.</p>
    <p><strong>2. Then the call, beats 1&ndash;8, in order.</strong> Learn the ORDER, not the wording.
    Nothing is offered until beat 7 &mdash; that is the whole point.</p>
    <p><strong>3. Then objections.</strong> Clarify before you answer. The objection they say is rarely
    the objection they have.</p>
    <p><strong>4. Drill the five moments</strong> in Training, not whole calls. Five minutes each.</p>
    <p><strong>Read the SAY lines out loud.</strong> A script you have only read silently comes out
    sounding read. That is what the prospect hears, and it is what puts the guard back up.</p>
  </div>
</section>

${printable.map((s) => { CUR_TAB = s.id; return `<section class="tab">
  <h2>${anchor(tid(s.id, null))}${esc(clean(s.tab))}</h2>
  ${s.sub ? `<p class="lead">${esc(clean(s.sub))}</p>` : ''}
  ${(s.blocks || []).map(block).join('')}
</section>`; }).join('')}

${flowTree()}
`;

const browser = await chromium.launch();
const page = await browser.newPage();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const PDF_OPTS = {
  format: 'Letter', printBackground: true,
  margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font:8pt Georgia,serif;color:#000;padding:0 16mm;'
    + 'display:flex;justify-content:space-between;"><span>RGA Sales Playbook &middot; internal</span>'
    + '<span class="pageNumber"></span></div>',
};
// Print → read each target's page back out of the PDF → print again, until the numbers settle.
const readPages = (file) => {
  const pages = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\f');
  const found = {};
  pages.forEach((txt, i) => { for (const m of txt.matchAll(/@@T(\d+)@@/g)) found[TID_LIST[Number(m[1])]] ??= i + 1; });
  return found;
};
let settled = false;
for (let pass = 1; pass <= 4 && !settled; pass++) {
  await page.setContent(makeHtml(), { waitUntil: 'load' });
  await page.pdf({ ...PDF_OPTS, path: OUT });
  const found = readPages(OUT);
  settled = TID_LIST.every((id) => found[id] && found[id] === PAGES[id]);
  PAGES = found;
}
await browser.close();
const unresolved = TID_LIST.filter((id) => !PAGES[id]);
if (unresolved.length || !settled) {
  console.error(`✗ SEE page numbers did not resolve (${unresolved.join(', ') || 'still moving after 4 passes'}) — refusing to ship a box that points at the wrong page.`);
  process.exit(1);
}
console.log(`   ${TID_LIST.length} SEE targets, every page number read back from the printed PDF`);

// 🔒 The receipt: WHICH playbook.js this PDF was printed from. check-playbook-integrity compares it
// to the live source, so a playbook change that never got reprinted fails a gate instead of quietly
// leaving the admin Docs tab and the Desktop copy behind. Chris, 2026-10-02: "so we dont ever lose
// it, forget or regress".
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(`${OUT}.source.json`, JSON.stringify({
  source: 'admin/playbook.js', sourceSha256: sha(src), pdfSha256: sha(fs.readFileSync(OUT)),
  builtAt: new Date().toISOString(),
}, null, 2) + '\n');

// 🔒 EVERY VERSION IS KEPT (Chris, 2026-10-02: "keep track of all versions"). When the playbook
// SOURCE changes, this print becomes a new numbered version in docs/playbook-versions/ and is added
// to versions.json — which admin-doc.js reads as its allowlist for that folder and admin → Docs lists.
// A rebuild of an unchanged source adds nothing, so re-running the script never invents a version.
const VDIR = path.join(WEBSITE, 'docs/playbook-versions');
const VJSON = path.join(VDIR, 'versions.json');
fs.mkdirSync(VDIR, { recursive: true });
let versions = [];
try { versions = JSON.parse(fs.readFileSync(VJSON, 'utf8')); } catch { /* first run */ }
const latest = versions[versions.length - 1];
if (!latest || latest.sourceSha256 !== sha(src)) {
  const v = (latest ? latest.v : 0) + 1;
  const date = new Date().toISOString().slice(0, 10);
  const file = `sales-playbook-v${v}-${date}.pdf`;
  fs.copyFileSync(OUT, path.join(VDIR, file));
  const note = (process.argv.find((a) => a.startsWith('--note=')) || '').slice(7) || 'Playbook updated';
  versions.push({ v, date, file, note, sourceSha256: sha(src) });
  fs.writeFileSync(VJSON, JSON.stringify(versions, null, 2) + '\n');
  console.log(`\n📚 Saved as version ${v}: docs/playbook-versions/${file}`);
} else {
  // Same source, fresh print: keep the archived copy byte-equal to what admin and the Desktop show.
  fs.copyFileSync(OUT, path.join(VDIR, latest.file));
}

// A second copy on the Desktop is a FORK, and forks go stale silently — the exact failure this
// session kept finding. So: refresh it every build if it already exists, and only create it on
// request. That way the printed-from copy can never drift behind the live playbook.
// 🔑 The Desktop name carries the BUILD DATE. With one fixed name, an updated copy looked exactly like
// the previous one and Chris could not tell he had the new playbook (2026-10-02). Older dated copies
// are removed, so there is only ever ONE playbook on the Desktop.
const DESK_DIR = `${process.env.HOME}/Desktop`;
const isDeskPlaybook = (f) => /^RGA Sales Playbook.*\.pdf$/.test(f);
const priorDesk = fs.readdirSync(DESK_DIR).filter(isDeskPlaybook);
// Version number first: two prints on the same day had the SAME dated name, so v5 looked like v4.
const cur = versions[versions.length - 1];
const DESK = `${DESK_DIR}/RGA Sales Playbook - v${cur.v} - ${cur.date}.pdf`;
if (process.argv.includes('--desktop') || priorDesk.length) {
  for (const f of priorDesk) if (`${DESK_DIR}/${f}` !== DESK) fs.unlinkSync(`${DESK_DIR}/${f}`);
  fs.copyFileSync(OUT, DESK);
  console.log(`\n🖨  Desktop copy refreshed: ${DESK.replace(process.env.HOME, '~')}`);
}

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`\n✅ ${path.relative(WEBSITE, OUT)} — ${kb} KB · ${printable.length} sections + guided-call appendix`);
console.log('   Every word comes from admin/playbook.js. Re-run after any playbook change.');
if (OPEN) execFileSync('open', [OUT]);
