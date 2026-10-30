#!/usr/bin/env node
// check-step-36-booking-every-scenario.mjs — 2026-10-29. Chris approved step36_booking_rga_does_it_v1 ("ok all approved. go live. must
// match mockup exactly … so we never forget or regress"). Batch A pinned AS BUILT, by RUNNING the lifted code with real-shaped records:
//   · admin step 36: the scenario each read gives (tested on 40 real businesses, 10 trades) — RGA's pick (page · tool · Google partner ·
//     quote page) → "RGA can do this" + Put it on Google; contact page only / nothing found → the client's move; couldn't read the site →
//     its own state (never "nothing found"); Google already shows a link that opens / offers none → settles; a broken link → replaced;
//     Google said no → Google's words + Use the other option; verify-again → waits
//   · the done card when RGA put it on (never "What the client sent"); never a "Book button" promise (Google picks the words)
//   · the server: the three checks; put = the client's own writer (type · tag · write · read back); refused while verify-again
//   · the client's To do: "We put your booking link on Google" (Keep it · Change it) until they answer, never late, off admin's chase list
//   · the Remind popup: the business name in the title, the email drawn by shared/letter.js (the renderer the server sends with), Not yet ·
//     Send reminder, no "Open in Gmail instead"; an X on every popup (admin dialogs, the hours popup, the portal's confirm / alert)
//   · the finder says "couldn't read" apart from "nothing found"
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const AJS = read("admin/admin.js"), PJS = read("portal/portal.js"), ACSS = read("admin/admin.css"), PCSS = read("portal/portal.css");
const FN = read("netlify/functions/admin-gbp-booking.js"), KEEP = read("netlify/functions/portal-booking-keep.js"), INPUT = read("netlify/functions/portal-step-input.js");
const ADM_MOVES = read("netlify/functions/admin-open-moves.js");
const require = createRequire(import.meta.url);
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── the admin block, run ─────────────────────────────────────────────────────────────────────────
const a0 = AJS.indexOf("const BK36_CHECK = "), a1 = AJS.indexOf("async function bk36Check(");
const d0 = AJS.indexOf("function bk36DoneCardHtml("), d1 = AJS.indexOf("\n}\n", d0);
if (a0 < 0 || a1 < a0 || d0 < 0 || d1 < 0) { console.error("⚠️  INDETERMINATE — admin step 36's block moved"); process.exit(2); }
const ctx = { Date, escapeHtml: esc, escapeAttribute: esc, OL_G: "<svg data-g></svg>", OB_WEB_TILE: "<svg data-web></svg>", G_ICON: { ok: "✓", rga: "↻", you: "!" },
  adminGcardWhen: () => "Oct 29, 4:20 PM" };
vm.createContext(ctx);
const zf = /^const ZC_FOLD_T = [^\n]*;$/m.exec(AJS);
if (!zf) { console.error("⚠️  INDETERMINATE — the fold control (ZC_FOLD_T) moved"); process.exit(2); }
try { vm.runInContext(`${zf[0]}\n${AJS.slice(a0, a1)}\n${AJS.slice(d0, d1 + 2)}\nthis.view = bk36View; this.card = bk36CardFor; this.done = bk36DoneCardHtml;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — admin step 36's block didn't run: ${e.message}`); process.exit(2); }
const T = (url, opens) => ({ types: [{ key: "url_appointment", label: "Appointment links", links: url ? [{ url, clean: url.replace(/^https?:\/\//, ""), opens }] : [] }] });
const page = (p, kind) => ({ url: `https://joes.com${p}`, label: `joes.com${p}`, kind });
const tool = (u, platform, partner) => ({ url: u, platform, partner });
const sc = (now, task = {}, rv = false) => ctx.view(now, task, rv);
const cases = [
  ["a booking page on their website", { ...T(), read: { ok: true }, pages: [page("/book", "book"), page("/contact", "contact")], tools: [] }, "pick"],
  ["a booking tool they use", { ...T(), read: { ok: true }, pages: [], tools: [tool("https://www.joinblvd.com/b/luxe/widget", "Boulevard", false)] }, "pick"],
  ["a Google booking partner", { ...T(), read: { ok: true }, pages: [], tools: [tool("https://clients.mindbodyonline.com/x", "Mindbody", true)] }, "pick"],
  ["a quote page", { ...T(), read: { ok: true }, pages: [page("/free-estimate", "quote")], tools: [] }, "pick"],
  ["only a contact page", { ...T(), read: { ok: true }, pages: [page("/contact", "contact")], tools: [] }, "contact"],
  ["their website, nothing found", { ...T(), read: { ok: true }, pages: [], tools: [] }, "none"],
  ["a website that didn't answer", { ...T(), read: { ok: false, status: 403, why: "http" }, pages: [], tools: [] }, "unread"],
  ["Google already shows a link that opens", { ...T("https://joes.com/book", true), read: { ok: true }, pages: [], tools: [] }, "keep"],
  ["Google shows a broken link", { ...T("https://joes.com/old", false), read: { ok: true }, pages: [page("/book", "book")], tools: [] }, "broken"],
  ["Google offers no booking link", { types: [], read: { ok: true }, pages: [page("/book", "book")], tools: [] }, "notoffered"],
];
for (const [name, now, want] of cases) { const v = sc(now); if (v.sc !== want) fail(`step 36: "${name}" should be ${want}, got ${v.sc}`); }
if (sc({ ...T(), read: { ok: true }, pages: [page("/book", "book")], tools: [] }, {}, true).sc !== "verify") fail("step 36: verify-again doesn't pause Put it on Google");
const err = { rga_put_error: { at: "2026-10-29T20:00:00Z", url: "https://joes.com/book", said: "Google didn't accept this link." } };
const said = sc({ ...T(), read: { ok: true }, pages: [page("/book", "book"), page("/estimate", "quote")], tools: [] }, err);
if (said.sc !== "said_no") fail("step 36: Google saying no isn't its own state");
// a partner tool is RGA's pick before a page; a contact page is only ever an option
const mix = sc({ ...T(), read: { ok: true }, pages: [page("/contact", "contact"), page("/book", "book")], tools: [tool("https://calendly.com/joe", "Calendly", false), tool("https://clients.mindbodyonline.com/x", "Mindbody", true)] });
if (mix.opts[0].platform !== "Mindbody" || mix.opts[mix.opts.length - 1].why !== "Their contact page") fail(`step 36: the order isn't partner → tool → page → contact (${mix.opts.map((o) => o.label).join(", ")})`);

// what each card says (the mockup's words)
const html = (now, task, rv) => { const v = sc(now, task, rv); return ctx.card(v, "c1", v.opts && v.opts[0] ? v.opts[0].url : ""); };
const pickH = html(cases[0][1]);
if (!/RGA can do this/.test(pickH) || !/Pick the link people book with · found on their homepage/.test(pickH) || !/RGA's pick/.test(pickH) || !/>option</.test(pickH)) fail("step 36: the pick card isn't the mockup (pill, label, RGA's pick, option)");
if (!/data-bk36-put disabled>Put it on Google</.test(pickH) || !/The client gets a To do: keep it or change it\./.test(pickH) || !/Remind the client instead…/.test(pickH)) fail("step 36: the pick card's footer isn't Put it on Google · the To do note · Remind the client instead…");
if (!/data-bk36-checks>.*Checking before anything is sent…/s.test(pickH)) fail("step 36: the pick card doesn't check before anything is sent");
if (!/type="radio"[^>]*value="https:\/\/joes\.com\/book"[^>]*checked/.test(pickH)) fail("step 36: RGA's pick isn't the selected tile");
const contactH = html(cases[4][1]), noneH = html(cases[5][1]), unreadH = html(cases[6][1]), keepH = html(cases[7][1]), brokenH = html(cases[8][1]), notH = html(cases[9][1]);
if (!/Found only their contact page/.test(contactH) || !/doesn't put a contact page on Google without asking/.test(contactH) || /data-bk36-put/.test(contactH)) fail("step 36: a contact page alone goes on Google (or the card doesn't say why it waits)");
if (!/We couldn't find a booking page on their website\./.test(noneH) || /they have none|has none|no booking page\b/i.test(noneH.replace("this never says they have none", ""))) fail("step 36: nothing found is said as \"they have none\"");
if (!/Couldn't read it/.test(unreadH) || !/Their website didn't answer us \(HTTP 403\)\./.test(unreadH) || !/data-bk36-again>Check again/.test(unreadH) || /couldn't find a booking page/.test(unreadH)) fail("step 36: a site we couldn't read reads as nothing found (or has no Check again)");
if (!/On Google · opens/.test(keepH) || !/Nothing to change; the step finishes\./.test(keepH)) fail("step 36: Google's own working link doesn't finish the step");
if (!/Google's link is broken/.test(brokenH) || !/RGA's pick replaces it\./.test(brokenH) || !/data-bk36-put/.test(brokenH)) fail("step 36: a broken Google link isn't replaced with RGA's pick");
if (!/Not offered/.test(notH) || !/Google doesn't offer a booking link for this kind of business\./.test(notH)) fail("step 36: Google offering no link isn't said");
const saidH = ctx.card(said, "c1", said.opts[1].url);
if (!/Google said no/.test(saidH) || !/Google didn't accept this link\./.test(saidH) || !/data-bk36-other>Use the other option/.test(saidH)) fail("step 36: Google saying no doesn't show Google's words + Use the other option");
const verH = html(cases[0][1], {}, true);
if (!/Waiting on verification/.test(verH) || !/Put it on Google is paused/.test(verH) || /data-bk36-put/.test(verH)) fail("step 36: verify-again doesn't pause the button");
// the done card (approved step36_done_card_v2): the result on top, the loop in one line, Try the link ↗ · Change the link…, a history line
const G1 = { state: "on_google", by: "rga", link: "https://joes.com/book", sent: "https://joes.com/book?utm_source=google", at: "2026-10-30T00:41:58Z" };
const doneH = ctx.done({ google_push: G1, rga_put: { at: "2026-10-30T00:41:58Z", url: "https://joes.com/book", ack: null } }, "c1");
if (!/On Google · read back/.test(doneH) || !/class="ob-dc-l">joes\.com\/book</.test(doneH)) fail("step 36 done: the header isn't ✓ On Google · read back + the link as the title");
if (!/ob-dc-loop n3/.test(doneH) || !/RGA's pick/.test(doneH) || !/read back 5:41 PM/.test(doneH) || !/ob-dc-st wait.*Client keeps or changes it.*in their To do · waiting/s.test(doneH)) fail("step 36 done: the loop isn't RGA's pick ✓ · On Google ✓ · the client's answer (waiting)");
if (!/Visits from Google are counted \(our tracking tag\)\./.test(doneH) || !/href="https:\/\/joes\.com\/book\?utm_source=google" target="_blank" rel="noopener noreferrer">Try the link ↗<\/a>/.test(doneH) || !/data-bk36-change="c1">Change the link…/.test(doneH)) fail("step 36 done: the note / Try the link ↗ / Change the link… aren't the mockup's");
if (!/History ▸/.test(doneH) || !/Put on Google by RGA · Oct 29, 5:41 PM · read back/.test(doneH)) fail("step 36 done: the history line isn't the latest event, folded");
if (/The client has a To do|tracking tag added|Undo/.test(doneH)) fail("step 36 done: v1's words (or an Undo) are back");
const keptH = ctx.done({ google_push: G1, rga_put: { url: "https://joes.com/book", at: "2026-10-30T00:41:58Z", ack: { decision: "keep", at: "2026-10-30T18:00:00Z" } } }, "c1");
if (/ob-dc-st wait/.test(keptH) || !/Client kept it/.test(keptH)) fail("step 36 done: the client's Keep it doesn't turn the third step green");
const ownH = ctx.done({ google_push: { state: "on_google", link: "https://joes.com/mine", at: "2026-10-30T18:00:00Z" }, client_input_at: "2026-10-30T18:00:00Z" }, "c1");
if (!/Their own link/.test(ownH) || !/ob-dc-loop n2/.test(ownH)) fail("step 36 done: the client's own link isn't the same card (Their own link ✓ · On Google ✓)");
const alrH = ctx.done({ google_push: { state: "on_google", by: "rga", reason: "already_on_google", link: "https://joes.com/book", at: "2026-10-30T18:00:00Z" } }, "c1");
if (!/Google already had it/.test(alrH) || !/nothing was sent/.test(alrH)) fail("step 36 done: Google's own link isn't the same card (Google already had it)");
// 🔒 fold_hide_control_v1 (approved Chris 10-29: "theres no link to close the expand. like hide?"): every ob-zc-more fold (steps 30 · 36 ·
// 38) says Hide ▴ when open, in the same spot; a history fold's open line is "History · N", never the latest line twice
if (!/<span class="c">History ▸<\/span><span class="o">Hide ▴<\/span>/.test(doneH) || !/<span class="o"><b>History<\/b> · 1 event<\/span>/.test(doneH)) fail("folds: step 36's history can't be closed (no Hide ▴) or repeats its line when open");
const folds = AJS.match(/<details class="ob-zc-more[^"]*"[^>]*><summary>[^\n]*/g) || [];
if (folds.length < 3 || folds.some((f) => !/\$\{ZC_FOLD_T\("(History|Show) ▸"\)\}/.test(f))) fail(`folds: a fold has no Hide ▴ (every ob-zc-more fold uses ZC_FOLD_T) — ${folds.length} found`);
if (!/\.ob-zc-more\[open\] > summary \.c \{ display:none; \} \.ob-zc-more\[open\] > summary \.o \{ display:inline; \}/.test(ACSS) || /\.ob-zc-more\[open\] > summary \.t \{ visibility:hidden; \}/.test(ACSS)) fail("folds: the open fold hides its control again (no way to close it)");
if (!/<span class="o"><b>History<\/b> · \$\{runs\.length \?/.test(AJS)) fail("folds: step 38's open history repeats its line instead of \"History · N runs\"");
// the card sits below the row, replacing "What this produced"; no Undo on the row; the old write-up is cleared on put
if (!/: o\.flowId === "m1\.gbp\.booking_link" && s\.task\?\.google_push\?\.state === "on_google" \? `<div class="ob-done-card">\$\{bk36DoneCardHtml\(s\.task, state\.selectedClient && state\.selectedClient\.id\)\}<\/div>`/.test(AJS)) fail("step 36 done: the card isn't the row's done card (the old \"What this produced\" shows)");
if (!/\(id === "m1\.gbp\.booking_link" && !!\(t && t\.google_push && t\.google_push\.state === "on_google"\)\);   \/\/ step36_done_card_v2: no Undo/.test(AJS)) fail("step 36 done: the row still has Undo / re-run");
if ((FN.match(/delete t\.auto_result;/g) || []).length !== 3) fail("step 36: put / settle don't clear the old write-up");
// Change the link…: the pick card again, the link on Google now named, never auto-settled
const chg = ctx.view({ ...T("https://joes.com/book", true), read: { ok: true }, pages: [page("/book", "book"), page("/estimate", "quote")], tools: [] }, {}, false, true);
if (chg.sc !== "pick" || !chg.change || chg.opts.some((o) => /\/book$/.test(o.url)) || chg.cur !== "joes.com/book") fail(`step 36 Change the link: not the pick card without the current link (${JSON.stringify(chg)})`);
const chgH = ctx.card(chg, "c1", chg.opts[0].url);
if (/RGA's pick/.test(chgH)) fail("step 36 Change the link: a tile is called RGA's pick (RGA chooses here; a contact page is never RGA's pick)");
if (!/Change the link/.test(chgH) || !/On Google now: joes\.com\/book/.test(chgH) || !/data-bk36-cancel>Keep the link on Google/.test(chgH) || /Remind the client instead/.test(chgH)) fail("step 36 Change the link: the card doesn't name the link on Google now / offer Keep the link on Google");
// 🔴 never a "Book button" promise anywhere in step 36 or the To do (Google picks the button's words — step10_booking_link_v2)
const bkBlock = AJS.slice(a0, a1) + AJS.slice(d0, d1);
if (/Shows as a Book button|a Book button|Book button opens|tap Book\b|tap <b>Book/i.test(bkBlock + doneH)) fail("step 36 promises a \"Book button\" (Google picks the button's words)");
if (!/if \(step\?\.flowId === "m1\.gbp\.booking_link" && task\?\.google_push && task\.google_push\.state === "on_google"\) return "";/.test(AJS)) fail("step 36: a link on Google shows \"What the client sent\" inside the row (its card is below the row)");
for (const c of [".ob-zc.bad {", ".ob-zc.care {", ".ob-zc-place.r.pick {", ".ob-zc-checks {", ".ob-zc-radio {"]) if (!ACSS.includes(c)) fail(`step 36: the style ${c} is gone`);

// ── the server ───────────────────────────────────────────────────────────────────────────────────
let FNM; try { FNM = require(`${SITE}/netlify/functions/admin-gbp-booking.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — admin-gbp-booking didn't load: ${e.message}`); process.exit(2); }
const ok = FNM.checksFor({ md: { hasVoiceOfMerchant: true, hasPendingEdits: false }, refused: null, open: { ok: true }, typeOk: true });
if (ok.length !== 3 || !ok.every((c) => c.ok)) fail("server: three passing checks don't pass");
if (FNM.checksFor({ md: { hasVoiceOfMerchant: true, hasPendingEdits: true }, refused: null, open: { ok: true }, typeOk: true })[0].ok) fail("server: Google's own pending edits don't stop Put it on Google");
if (FNM.checksFor({ md: { hasVoiceOfMerchant: true }, refused: null, open: { ok: false, status: 404 }, typeOk: true })[1].ok) fail("server: a link that doesn't open passes");
if (FNM.checksFor({ md: { hasVoiceOfMerchant: true }, refused: { said: "social" }, open: null, typeOk: true })[1].ok) fail("server: a link Google refuses passes");
if (!/if \(action !== "check" && rv && rv\.state === "lost"\) return json\(409/.test(FN)) fail("server: Put it on Google isn't refused while Google wants verification again");
if (!/const push = await applyForStep\(STEP, \{ value: url, choice, link_type: type\.key \}, deps\);/.test(FN)) fail("server: put isn't the client's own writer (type · tag · write · read back)");
if (!/if \(!passed\) \{ const f = checks\.find/.test(FN)) fail("server: put doesn't re-run the checks first");
if (!/rga_put: \{ at, url: push\.link, by: gate\.email \|\| "rga", ack: null \}/.test(FN)) fail("server: put doesn't open the client's veto (rga_put)");
if (!/const open = await B\.linkOpens\(link, deps\.fetch\);\s*if \(!open\.ok\) return json\(409/.test(FN) || !/if \(type\) return json\(409, \{ error: "Google offers this business a booking link/.test(FN)) fail("server: settle doesn't read Google before finishing the step");
if (!/validateOnly/.test(FN) === false && /validateOnly=true/.test(FN)) fail("server: a validateOnly the attributes update doesn't have");

// ── the client's To do ──────────────────────────────────────────────────────────────────────────
let OM; try { OM = require(`${SITE}/netlify/functions/_open-moves.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — _open-moves didn't load: ${e.message}`); process.exit(2); }
const PB = JSON.parse(read("data/playbooks/playbooks.json"));
const bkTasks = (ack) => ({ "m1.gbp.booking_link": { status: "done", rga_put: { at: "2026-10-29T20:00:00Z", url: "https://clients.mindbodyonline.com/x", ack }, google_push: { state: "on_google", by: "rga", platform: "Mindbody" } } });
const mv = OM.clientMoves(OM.openMoves({ playbooks: PB, data: { tasks: bkTasks(null) }, now: "2026-12-01T00:00:00Z" }), PB).find((m) => m.kind === "rga_put");
if (!mv || mv.late || mv.due || mv.link !== "clients.mindbodyonline.com/x" || mv.partner !== true) fail(`client To do: the booking-link veto is missing, late, or doesn't name its link (${JSON.stringify(mv)})`);
if (OM.openMoves({ playbooks: PB, data: { tasks: bkTasks({ decision: "keep" }) } }).some((m) => m.kind === "rga_put")) fail("client To do: Keep it doesn't clear the veto");
if (!/if \(m\.kind === "rga_put"\) continue;/.test(ADM_MOVES)) fail("admin's To do chases the booking-link veto (silence keeps it)");
if (!/if \(e\.kind === "rga_put" && e\.mv\) \{/.test(PJS) || !/<h4>We put your booking link on Google<\/h4>/.test(PJS) || !/data-bk-keep>Keep it<\/button><a class="portal-button" href="#step-\$\{escapeAttribute\(e\.step_id\)\}">Change it<\/a>/.test(PJS)) fail("client To do: the pane isn't \"We put your booking link on Google\" · Keep it · Change it");
if (!/fetch\("\/\.netlify\/functions\/portal-booking-keep"/.test(PJS) || !/ack: \{ decision: "keep", at, by: gate\.email \|\| null \}/.test(KEEP)) fail("client To do: Keep it doesn't record the answer");
if (!/if \(stepId === GSTEP\.BOOKING && prev\.rga_put && !prev\.rga_put\.ack\) tasks\[stepId\]\.rga_put = \{ \.\.\.prev\.rga_put, ack: \{ decision: "changed"/.test(INPUT)) fail("client To do: Change it (their own step 9 save) doesn't answer the veto");
const pane = PJS.slice(PJS.indexOf('if (e.kind === "rga_put" && e.mv) {'), PJS.indexOf('if (e.kind === "rga_put" && e.mv) {') + 1400);
if (/a Book button|Book button opens|tap <b>Book|tap Book\b/i.test(pane)) fail("client To do promises a \"Book button\"");

// ── the Remind popup + an X on every popup ───────────────────────────────────────────────────────
const nudge = AJS.slice(AJS.indexOf('const edited = await rgaDialog({\n    kind: "prompt", inputType: "textarea", tone: "outward", areaFont: "page",'), AJS.indexOf('const edited = await rgaDialog({\n    kind: "prompt", inputType: "textarea", tone: "outward", areaFont: "page",') + 1200);
if (!nudge || !/title: `Remind \$\{c\.business_name \|\| "the client"\} to \$\{remindWhat\(ctx\.o\)\}`/.test(nudge)) fail("Remind: the title doesn't name the business (\"Remind Rocket Growth Agency to …\")");
if (/Open in Gmail instead|k: "From"/.test(nudge) || !/okLabel: "Send reminder"/.test(nudge) || !/cancelLabel: "Not yet"/.test(nudge)) fail("Remind: not Not yet · Send reminder, or Gmail / From is back");
if (!/preview: \(text\) => globalThis\.rgaLetter\.letter\(text\)\.html/.test(nudge) || !/import "\/shared\/letter\.js\?v=/.test(AJS)) fail("Remind: the email isn't drawn by shared/letter.js (the renderer the server sends with)");
const rw = new vm.Script(`${AJS.slice(AJS.indexOf("function remindWhat("), AJS.indexOf("function stepNudgeDraft("))}; this.rw = remindWhat;`); const rc = {}; vm.createContext(rc); rw.runInContext(rc);
if (rc.rw({ clientLabel: "Add your booking link" }) !== "add their booking link" || rc.rw({ clientLabel: "Confirm what's true of your business" }) !== "confirm what's true of their business") fail("Remind: the step in the title isn't turned to \"their\"");
if (!/`\[Add my booking link\]\(\$\{link\}\)`\]\.join\("\\n"\)/.test(AJS)) fail("Remind: the booking email's link isn't written as words ([Add my booking link](…))");
if (!/subject: "One minute: your booking link on Google"/.test(AJS) || !/Your Google profile doesn't have a booking link yet/.test(AJS) || !/It takes about a minute\./.test(AJS)) fail("Remind: the booking email isn't the approved one (why · what we found · about a minute)");
let L; try { L = require(`${SITE}/netlify/functions/_letter.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — _letter.js didn't load: ${e.message}`); process.exit(2); }
if (!fs.existsSync(`${SITE}/shared/letter.js`) || L !== require(`${SITE}/shared/letter.js`)) fail("the server's _letter.js isn't the shared renderer (two copies of the email)");
if (!/<button type="button" class="rga-modal-x" data-act="x" aria-label="Close">\$\{RGA_MODAL_X\}<\/button>/.test(AJS) || !/wrap\.querySelector\('\[data-act="x"\]'\)\.addEventListener\("click", \(\) => done\(cancelVal\)\);/.test(AJS)) fail("X: admin's dialogs have no X (or it doesn't do what the safe choice does)");
if (!/id="kfX" aria-label="Close"/.test(AJS) || !/wrap\.querySelector\("#kfX"\)\.addEventListener\("click", close\);/.test(AJS)) fail("X: admin's booking-hours popup has no X");
if (!/data-pm-x aria-label="Close"/.test(PJS) || !/card\.querySelector\("\[data-pm-x\]"\)\.addEventListener\("click", \(\) => close\(alertOnly \? true : false\)\);/.test(PJS) || !/\.pm-modal-x \{/.test(PCSS)) fail("X: the portal's confirm / alert popups have no X");
if (!/\.rga-modal-x \{/.test(ACSS)) fail("X: admin's X has no style");

// ── the finder: couldn't read ≠ nothing found ────────────────────────────────────────────────────
let BL; try { BL = require(`${SITE}/netlify/functions/_booking-link.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — _booking-link didn't load: ${e.message}`); process.exit(2); }
const dead = await BL.findBookingPages("gone.com", async () => ({ ok: false, status: 403 }));
const bare = await BL.findBookingPages("plain.com", async () => ({ ok: true, url: "https://plain.com/", text: async () => "<p>Hello</p>" }));
if (!dead.read || dead.read.ok !== false || dead.read.status !== 403 || !bare.read || bare.read.ok !== true) fail(`finder: "couldn't read" isn't told apart from "nothing found" (${JSON.stringify(dead.read)} / ${JSON.stringify(bare.read)})`);

if (F.length) { console.error(`🔴 step 36 (step36_booking_rga_does_it_v1) drifted:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ step 36 holds every scenario (pick · tool · partner · quote · contact · none · couldn't read · keep · broken · not offered · said no · verify), Put it on Google with checks + read back, the client's Keep it / Change it, the Remind popup (business name, the real email, an X), an X on every popup");
