#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-client-emails-have-one-format.mjs
//
// 🔒 WHY (2026-10-09): Chris, on the kickoff recap — "can we get spacing corrected make sure all emails are drafted
// well … links must not show … mockup email design better". 22 client emails used four styles: ALL-CAPS headings,
// indents made of spaces that slip in Gmail, raw links (…/portal/#step-m1.gbp.photos) and four sign-offs. Approved
// mockup client_emails_one_format_v1: every 1:1 email is LETTER MARKUP rendered by netlify/functions/_letter.js
// (formatted HTML + plain twin, ONE sign-off with the phone); the billing/report documents keep their branded layout
// and gain the same sign-off.
// HOLDS:
//   1. _letter.js really renders: a link shows as WORDS in the HTML (the address only in href), "words (address)" in
//      the twin, "## " → a bold label, "- " → a list item, the sign-off exactly once
//   2. every 1:1 sender goes through it (markup: / letter(), html sent as multipart) — none sends a bare body
//   3. no sender writes a portal link as a bare address — only as [words](link)
//   4. no ALL-CAPS heading lines, no space-indented list lines, no hand-written sign-off inside markup
//   5. American copy: no "cancelled", "call me on", "suits you"
//   6. the branded documents carry the same sign-off, and their twin decodes every entity esc() makes
// exit 0 = one format · 1 = a sender drifted · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const noComments = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, "")).join("\n");
const F = []; const fail = (m) => F.push(m);

// ── 1. the renderer, run for real ──
const require = createRequire(import.meta.url);
let L;
try { L = require(`${SITE}/netlify/functions/_letter.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — _letter.js did not load: ${e.message}`); process.exit(2); }
const URL_ = "https://www.rocketgrowthagency.com/portal/#step-m1.gbp.photos";
const sample = L.letter(`Hi Pat,\n\nThanks for the call.\n\n## What we still need\n- 19 more photos. [Add your photos](${URL_})\n✓ Google Analytics\n\nAnything at all, just reply.`);
const visible = sample.html.replace(/<[^>]+>/g, " ");
if (visible.includes("rocketgrowthagency.com/portal")) fail("_letter.js shows the link ADDRESS in the HTML — a link must read as its words");
if (!/<a href="https:\/\/www\.rocketgrowthagency\.com\/portal\/#step-m1\.gbp\.photos"[^>]*>Add your photos<\/a>/.test(sample.html)) fail("_letter.js no longer renders [words](link) as a link on the words");
if (!sample.text.includes(`Add your photos (${URL_})`)) fail("the plain twin no longer reads a link as \"words (address)\"");
if (!/<p style="[^"]*font-weight:700[^"]*">What we still need<\/p>/.test(sample.html)) fail("\"## \" no longer renders as a bold label");
if (!/<li[^>]*>19 more photos\./.test(sample.html)) fail("\"- \" no longer renders as a list item");
if (/##|^\s*-\s/m.test(visible)) fail("markup characters (## / -) leak into the HTML a client reads");
const sigCount = (s) => (s.match(/Rocket Growth Agency · \(\d{3}\) \d{3}-\d{4}/g) || []).length;
if (sigCount(sample.html) !== 1 || sigCount(sample.text) !== 1) fail(`the sign-off must appear exactly once (html ${sigCount(sample.html)}, text ${sigCount(sample.text)})`);
if (L.letter("Hi", { signOff: false }).text.includes("Rocket Growth Agency ·")) fail("signOff:false still signs");

// ── 2. every 1:1 sender goes through the letter ──
const S = {
  gmail: read("netlify/functions/_gmail.js"),
  recap: read("netlify/functions/send-kickoff-recap.js"),
  step: read("netlify/functions/send-step-email.js"),
  reply: read("netlify/functions/portal-reply.js"),
  notify: read("netlify/functions/notify-client-stage.js"),
  confirm: read("netlify/functions/send-confirmation-email.js"),
  flow: read("netlify/functions/flow-execute.js"),
  admin: read("admin/admin.js"),
  doc: read("shared/email-doc.js"),
  invoice: read("netlify/functions/send-invoice-email.js"),
  report: read("netlify/functions/send-monthly-report.js"),
  invite: read("netlify/functions/send-kickoff-invite.js"),
  // batch 3 (10-19): each call's invite title lives in _call-purpose.js (kickoff + Month 1 close-out)
  callpurpose: read("netlify/functions/_call-purpose.js"),
};
const C = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, noComments(v)]));
// every `name({ ... })` call in a source, braces balanced (a call may carry a nested object, e.g. notice: { clientId, code })
const callsOf = (src, name) => {
  const out = [], re = new RegExp(`${name.replace(/[.$]/g, "\\$&")}\\(\\{`, "g");
  for (let m; (m = re.exec(src));) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
    out.push(src.slice(m.index, i + 2));
  }
  return out;
};
if (!/markup != null\) \{ const l = require\("\.\/_letter"\)\.letter\(markup/.test(C.gmail) || !/toRaw\(\{[^}]*\bhtml\b/.test(C.gmail)) fail("_gmail.sendAsRga no longer renders markup through the letter and sends the HTML");
for (const k of ["recap", "step", "reply"]) {
  const call = (C[k].match(/sendAsRga\(\{[\s\S]*?\}\)/) || [""])[0];
  if (!call) { fail(`${k}: no sendAsRga call found`); continue; }
  if (!/\bmarkup:/.test(call)) fail(`${k}: sends a bare body — it must pass markup: so the email gets the one format`);
}
for (const k of ["notify", "confirm"]) {
  if (!/letter\((msg\.body|markup)\)/.test(C[k])) fail(`${k}: does not render its email through letter()`);
  if (!/toRaw\(\{[^}]*\bhtml: rendered\.html/.test(C[k])) fail(`${k}: does not send the formatted HTML (multipart)`);
}

// ── 3 + 4 + 5. the copy itself ──
const region = (src, startRe, endStr) => { const i = src.search(startRe); if (i < 0) return null; const j = src.indexOf(endStr, i); return src.slice(i, j < 0 ? i + 6000 : j); };
const copies = {
  "the kickoff recap composer": region(C.admin, /e\.target\.closest\("\[data-kickoff-recap\]"\)/, '].join("\\n");'),
  "the step nudge": region(C.admin, /function stepNudgeDraft\(/, "const text ="),
  "the kickoff passed note": region(C.admin, /async function kickoffPassedNote\(/, "const edited ="),
  "notify-client-stage": C.notify, "send-confirmation-email": C.confirm, "portal-reply": C.reply,
  "flow-execute (access drafts)": region(C.flow, /m1\.access\.analytics/, "m1.access.password_manager") || region(C.flow, /m1\.access\.analytics/, "\n};"),
};
for (const [name, src] of Object.entries(copies)) {
  if (!src) { console.error(`⚠️  INDETERMINATE — could not find ${name}`); process.exit(2); }
  const bare = src.match(/(?<!\]\()\$\{(PORTAL|portalUrl|link|PORTAL_URL)\}[^`"]*/);
  if (bare) fail(`${name}: a link is written as a bare address ("…${bare[0].slice(0, 40)}") — write [words](${bare[1]})`);
  const caps = src.match(/(?:["`]|\\n)([A-Z][A-Z ,'&/-]{7,}[A-Z])(?:["`]|\\n)/);
  if (caps) fail(`${name}: an ALL-CAPS heading ("${caps[1]}") — use "## Sentence case"`);
  const indent = src.match(/(?:["`]|\\n) {2,}[·•\-✓]/);
  if (indent) fail(`${name}: a space-indented list line — Gmail slips these; use "- item"`);
  if (/\\n\\nChris(\\n|["`])|["`]Chris["`],?\s*(\]|$)|— Chris\b|Best,\\nChris|Thanks,\\nChris/m.test(src)) fail(`${name}: a hand-written sign-off — the letter adds the one sign-off`);
  for (const [re, us] of [[/\bcancell(ed|ing)\b/i, "canceled"], [/call me on\b/i, "call me at"], [/\bsuits you\b/i, "works for you"]]) {
    const m = src.match(re); if (m && !/\bcancelled_at\b|"cancelled"|'cancelled'/.test(m.input.slice(Math.max(0, m.index - 2), m.index + 14))) fail(`${name}: British "${m[0]}" — say "${us}"`);
  }
}

// ── 6. the branded documents ──
if (!/Rocket Growth Agency · \(424\) 242-2040/.test(C.doc) || !/parts\.push\("", "Rocket Growth Agency · \(424\) 242-2040"\)/.test(C.doc)) fail("shared/email-doc.js lost the one sign-off (HTML or plain twin)");
try {
  process.removeAllListeners("warning");   // email-doc.js is ESM without "type": node's notice about it is noise here
  const doc = await import(pathToFileURL(`${SITE}/shared/email-doc.js`).href);
  const twin = doc.plainTwin({ title: "Receipt", intro: "Hi Pat, thanks for &quot;Pat&#39;s Plumbing&quot; &lt;LLC&gt; &amp; co.", lines: [], cta: { url: "https://x.example/portal", label: "Update your card →" } });
  if (/&quot;|&lt;|&gt;|&amp;|&#39;/.test(twin) || !twin.includes(`"Pat's Plumbing" <LLC> & co.`)) fail("the plain twin leaks an HTML entity (&quot; …) — strip must decode every entity esc() makes");
  if (/→/.test(twin)) fail("the plain twin's link label still carries the → arrow");
  if (!/\nRocket Growth Agency · /.test(twin)) fail("the plain twin is unsigned");
  const html = doc.buildBrandedEmail({ title: "T", intro: "Hi", bodyHtml: "<p>x</p>" });
  if (sigCount(html) !== 1) fail(`the branded email must carry the sign-off once (found ${sigCount(html)})`);
} catch (e) { console.error(`⚠️  INDETERMINATE — shared/email-doc.js did not load: ${e.message}`); process.exit(2); }
if (/label: "Pay in your portal"|\[Pay in your portal\]/.test(C.invoice)) fail("the invoice twin says \"Pay in your portal\" even when the card is charged automatically — use the email's own action");
// 11-11 (master client-messages, no em dash in client text): the receipt subject is "Receipt for invoice <ref>: <amount>"
if (!/(?:subject: |const subject = )`Receipt for invoice \$\{ref\}: \$\{amount\}`/.test(C.invoice)) fail("the receipt subject is not \"Receipt for invoice <ref>: <amount>\"");

// ── 8. (11-11, master client-messages E3 + decisions 4, 7) the end-of-service confirmation, the notice acknowledgment and the notes RGA
// approves are LETTER MARKUP through the one sender: no bare body, no raw address, no hand-written sign-off. (The first payment is ONE
// letter, the receipt for invoice #1, rendered through letter() in send-invoice-email: _payment-welcome.js only supplies its next step.) ──
{
  const off = noComments(read("netlify/functions/admin-offboarding-confirm.js"));
  const call = callsOf(off, "sendAsRga")[0] || "";
  if (!call) fail("admin-offboarding-confirm: no sendAsRga call found");
  else if (!/\bmarkup:/.test(call) || /\bbody:/.test(call)) fail("admin-offboarding-confirm (E3 service ended): sends a bare body: it must pass markup: so it gets the one format and the one sign-off");
  let OC; try { OC = require(`${SITE}/netlify/functions/admin-offboarding-confirm.js`); } catch (e) { console.error(`⚠️  INDETERMINATE — admin-offboarding-confirm did not load: ${e.message}`); process.exit(2); }
  const dr = OC.draftFor({ primary_contact_name: "Pat Lee", primary_contact_email: "pat@x.test" }, { ends_on: "2026-12-11", items: [{ key: "gbp", label: "Removed us from your Google profile", status: "done", evidence: "read back", at: "2026-12-12T10:00:00Z" }] });
  const l = L.letter(dr.body);
  if (l.html.replace(/<[^>]+>/g, " ").includes("rocketgrowthagency.com/client-login")) fail("E3 service ended: the sign-in link shows as an ADDRESS in the email: write [words](link)");
  if (/\n\s*Rocket Growth Agency\s*$/.test(dr.body) || sigCount(l.text) !== 1) fail(`E3 service ended: a hand-written sign-off, or the one sign-off is not there exactly once (found ${sigCount(l.text)})`);
  const pwSrc = noComments(read("netlify/functions/_payment-welcome.js")), qSrc = noComments(read("netlify/functions/_client-email-queue.js")), ackSrc = noComments(read("netlify/functions/_notice-ack.js"));
  if (/sendAsRga|users\/me\/messages\/send/.test(pwSrc)) fail("_payment-welcome.js sends its own email again: the first payment is one letter, the receipt (send-invoice-email)");
  if (!/\.\.\.letter\(markup, \{ doc \}\), firstPayment: true/.test(C.invoice)) fail("the first-payment letter is not rendered through letter() (the one format)");
  for (const [name, src] of [["the notes RGA approves (queue)", qSrc], ["the notice acknowledgment", ackSrc]]) {
    // its send call (sendAsRga directly, or through its deps.send, whose real wiring is sendAsRga) must carry markup:, never a body:
    const calls = [...callsOf(src, "sendAsRga"), ...callsOf(src, "deps.send")].filter((c) => !/^sendAsRga\(\{ supa, \.\.\.m \}\)$/.test(c));   // the deps wiring passes the call through
    if (!calls.length || calls.some((c) => !/\bmarkup:/.test(c) || /\bbody:/.test(c)) || (/deps\.send\(/.test(src) && !/send: \(m\) => require\("\.\/_gmail"\)\.sendAsRga\(/.test(src))) fail(`${name}: does not send letter markup through sendAsRga`);
  }
  const ON = require(`${SITE}/netlify/functions/_onboarding-notes.js`);
  for (const d of [ON.firstWeekDraft({ primary_contact_name: "Pat", business_name: "Acme" }, { lines: [{ text: "Your main category on Google is Plumber.", source: "Read from your Google profile" }] }), ON.day50Draft({ primary_contact_name: "Pat" }, { day: 52, done: ["Categories"], terms_sentence: null })]) {
    if (!d || !d.markup) { fail("a note RGA approves (first week / day 50) is not letter markup"); continue; }
    if (/Talk soon|\nRocket Growth Agency\s*$/.test(d.markup)) fail(`"${d.subject}": a hand-written sign-off: the letter adds the one sign-off`);
    if (sigCount(L.letter(d.markup).text) !== 1) fail(`"${d.subject}": the one sign-off is not there exactly once`);
  }
}
if (/geo-grid/.test(C.report)) fail("the monthly report email says \"geo-grid\" — say \"map coverage\"");
if (/Hi \$\{esc\(first\)\}, \$\{intro\}/.test(C.report) && /const intro = `Here's/.test(C.report)) fail("the monthly report reads \"Hi Pat, Here's\" — lower-case after the comma");
// 11-11: every call's title is now built by ONE function, callTitle(name, biz) (call_names_v1), so the "×" is looked for inside it too;
// reading only `title: (biz) => \`…\`` had gone blind the day the titles moved into callTitle.
{ const ct = (C.callpurpose.match(/function callTitle\([^)]*\)\s*\{[\s\S]*?\n\}/) || [""])[0];
  if (!ct && !/title: \(biz\) => `/.test(C.callpurpose)) fail("_call-purpose.js builds no call title this gate can read (neither callTitle nor title: (biz) => `…`)");
  if (/summary: `Kickoff call — [^`]*×/.test(C.invite) || /title: \(biz\) => `[^`]*×/.test(C.callpurpose) || /×/.test(ct)) fail("the calendar invite title uses \"×\" — say \"and\""); }
if (/\\n\$\{clientShareLink\(clientId\)\}/.test(C.invite)) fail("the calendar invite shows the report ADDRESS — link the words");

// 7. our shorthand never reaches a client: the welcome email's step list is written for them
if (!/\.replace\(\/\\bGBP\\b\/g, "Google profile"\)/.test(C.confirm)) fail("send-confirmation-email lists steps with our shorthand (GBP / GA4 / GSC) — the client reads \"Google profile\"");

if (!/function clientWords\(label\)[\s\S]{0,200}\\bGBP\\b\/g, "Google profile"/.test(C.admin)) fail("admin.js lost clientWords() — a nudge or a note can name a step in our shorthand");
for (const [where, re] of [["the nudge", /const short = clientWords\(label\);/], ["the setting-changed note", /const stepName = clientWords\(/]])
  if (!re.test(C.admin)) fail(`${where} names the step without clientWords() — "Turn on GBP messaging" reaches the client`);

// 🔒 approved client_emails_tinted_cards_v1 (10-20): an email card is the portal's tinted card — the state's light fill + a thin
// border, NO thick left edge — and its label line never carries a date (moved to the detail line, never dropped)
{ const k = L.letter(":: keep | ✓ Kept | Your main Google Business Profile | Phone (555) 010-0000\n\n:: gone | ✕ Removed | Old profile | x").html;
  if (/border-left:\s*[2-9]px/.test(k)) fail("an email card has a thick left edge again (the old style)");
  if (!/border:1px solid #cfe6c8;[^"]*background:#e3f1df/.test(k) || !/border:1px solid #f3cdc9;[^"]*background:#fee9e8/.test(k)) fail("an email card isn't the tinted fill + thin border of its state");
  for (const [mk, want] of [[":: keep | ✓ Kept · confirmed Oct 15, 2026 | T | D", "Confirmed Oct 15, 2026 · D"], [":: msg | Sent Oct 19 | T | ", "Oct 19"], [":: acct | Removed from | Google account | Signed in as a@b.co", "Signed in as a@b.co"]]) {
    const b = L.blocks(mk)[0];
    if (/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d/.test(b.small) || !b.small || b.detail !== want) fail(`an email card's label line keeps a date, or the date is lost ("${mk}" → label "${b.small}", detail "${b.detail}")`);
  }
}
if (F.length) { console.error("🔴 a client email left the one format:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ every client email has the one format: letter markup, links as words, one sign-off, American copy, documents signed");
