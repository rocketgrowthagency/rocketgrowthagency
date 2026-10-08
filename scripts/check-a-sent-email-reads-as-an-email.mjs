#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-sent-email-reads-as-an-email.mjs
//
// 🔴 WHY (Chris, 2026-10-08): "what is this #1? an email? if yes mockup this design its bad now."
// Step 1's sent confirmation rendered as the runner's log — raw `beta_unbilled`, ISO dates, one
// paragraph per hard-wrapped line, "Now set to: Hi Chris," · Change on a delivered email, and a
// Run again that does nothing. Approved: reports/mockups/admin_sent_email_card_v1.html.
//
// HOLDS (each RUN against the real functions, with the real record's shape):
//   1. a record with sent_to + subject + body + sent_at renders the email card — To / From / Subject
//   2. the plan reads in words (no tier code, no ISO date) and only when price_source exists
//   3. hard-wrapped lines join into one paragraph; a short line keeps its break; ALL-CAPS → heading
//   4. Open in Gmail only with a message id; a short body has no clip
//   5. a sent email is not a setting (no "Now set to") and offers no Run again
//   6. a record missing any of the four fields is NOT a sent email (falls back to the old output)
//
// exit 0 = a sent email reads as an email · 1 = it reads as a log again · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let admin;
try { admin = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }
const lift = (name) => { const a = admin.indexOf(`function ${name}(`); if (a < 0) return null; const b = admin.indexOf("\n}\n", a); return b < 0 ? null : admin.slice(a, b + 3); };
const fns = ["sentEmailOf", "sentEmailBodyHtml", "sentEmailCardHtml"].map(lift);
const labels = (admin.match(/const PACKAGE_LABELS = \{[\s\S]*?\n\};/) || [null])[0];
if (fns.some((x) => !x) || !labels) { console.error("⚠️  INDETERMINATE — sentEmailOf / sentEmailBodyHtml / sentEmailCardHtml / PACKAGE_LABELS not found"); process.exit(2); }

const ctx = {
  escapeHtml: (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
  escapeAttribute: (x) => String(x == null ? "" : x).replace(/"/g, "&quot;"),
  Date, Number, String, Object, Array, encodeURIComponent,
};
vm.createContext(ctx);
vm.runInContext(`${labels}\n${fns.join("\n")}\nthis.of = sentEmailOf; this.card = sentEmailCardHtml; this.body = sentEmailBodyHtml;`, ctx);

const fails = []; const F = (m) => fails.push(m);
const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// The real record's shape (step 1, test client, sent 2026-09-24) — values are the stored ones.
const BODY = `Hi Chris,

Your signed agreement is on file — thank you. Here's where things stand.

PLAN SELECTED
Beta Engagement (unbilled) — no charge. You're on the founding cohort while we prove the system out.
Nothing bills, and nothing starts billing without you agreeing to it first.

NEXT STEPS
Nothing needed from you right now. I'll counter-sign, send your first invoice,
and then a short note with exactly what happens in week one.

You can see the signed agreement any time in your portal:

   https://www.rocketgrowthagency.com/portal/

Anything at all, just reply.

Chris
Rocket Growth Agency · (424) 242-2040`;
const REAL = { sent_to: "rocketgrowthagencyadmin@gmail.com", sent_from: "hello@rocketgrowthagency.com",
  subject: "You're all set — here's what happens next", body: BODY, sent_at: "2026-09-24T20:14:53.006Z",
  gmail_message_id: "1a0d50e8123b6b98", price_source: { tier: "beta_unbilled", signed_at: "2026-07-23T15:09:13.063+00:00", monthly_price: 0 } };

// 1 · the card
const mail = ctx.of({ outcome_data: REAL });
if (!mail) F("the real step-1 record is not recognised as a sent email");
const html = mail ? ctx.card(mail, { flowId: "m1.close.confirm" }) : "";
const txt = plain(html);
for (const [k, v] of [["To", REAL.sent_to], ["From", REAL.sent_from], ["Subject", "You're all set"]]) {
  if (!new RegExp(`${k} ${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(txt.replace(/Rocket Growth Agency </, "").replace(/>/, ""))) F(`the envelope does not show ${k}: ${v}`);
}
if (!/Sent/.test(txt)) F("the card does not say Sent");
// 2 · words, not codes
if (/beta_unbilled|_unbilled|\b\d{4}-\d{2}-\d{2}\b/.test(txt)) F("the card shows a raw tier code or an ISO date");
if (!/Plan stated Beta partner · \$0\/mo · from the agreement signed Jul 23, 2026/.test(txt)) F(`the plan line does not read in words: "${(txt.match(/Plan stated[^.]{0,80}/) || [""])[0]}"`);
if (/---|exactly what was sent|Gmail id/.test(txt)) F("the runner's log text leaked into the card");
// 3 · paragraphs
const b = ctx.body(BODY);
if (!/send your first invoice, and then a short note/.test(plain(b)) || /invoice,<br>/.test(b)) F("a hard-wrapped line was not joined into its paragraph");
if (!/Chris<br>Rocket Growth Agency/.test(b)) F("a short line (the signature) lost its line break");
if (!/<h4>PLAN SELECTED<\/h4>/.test(b) || !/<h4>NEXT STEPS<\/h4>/.test(b)) F("an ALL-CAPS line was not made a section heading");
if (!/<a href="https:\/\/www\.rocketgrowthagency\.com\/portal\/"[^>]*target="_blank"/.test(b)) F("a bare URL in the body is not a link");
// 4 · Gmail + clip
if (!/href="https:\/\/mail\.google\.com\/mail\/\?authuser=hello%40rocketgrowthagency\.com#all\/1a0d50e8123b6b98"/.test(html)) F("Open in Gmail does not open that exact message in the sender's mailbox");
if (!/data-sent-more/.test(html) || !/is-clip/.test(html)) F("a long body is not clipped behind Show the whole email");
const noId = ctx.card(ctx.of({ outcome_data: { ...REAL, gmail_message_id: undefined } }), {});
if (/Open in Gmail|forward it/.test(noId)) F("with no message id the card still offers Open in Gmail / forward it");
const short = ctx.card(ctx.of({ outcome_data: { ...REAL, body: "Hi,\n\nShort." } }), {});
if (/data-sent-more|is-clip/.test(short)) F("a short body is clipped");
// universal — no price source, unknown tier
if (/Plan stated/.test(ctx.card(ctx.of({ outcome_data: { ...REAL, price_source: undefined } }), {}))) F("no price_source still renders a plan line");
const odd = plain(ctx.card(ctx.of({ outcome_data: { ...REAL, price_source: { tier: "some_new_tier", monthly_price: 450 } } }), {}));
if (/some_new_tier/.test(odd) || !/Plan stated \$450\/mo/.test(odd)) F(`an unknown tier leaks its code or loses its price: "${(odd.match(/Plan stated[^.]{0,60}/) || [""])[0]}"`);
// 6 · not a sent email
for (const k of ["sent_to", "subject", "body", "sent_at"]) {
  if (ctx.of({ outcome_data: { ...REAL, [k]: "" } })) F(`a record with no ${k} is treated as a sent email`);
}
if (ctx.of({ outcome_data: { ...REAL, sent_at: "not a date" } })) F("an unparseable sent_at is treated as a sent email");
// 5 · wiring
if (!/const sentMail = sentEmailOf\(task\);\s*if \(sentMail\) return sentEmailCardHtml\(sentMail, o\)/.test(admin)) F("stepOutputHtml no longer renders the sent-email card first");
if (!/if \(sent && k === "body"\) continue;/.test(admin)) F("a sent email's body is offered as a setting again (\"Now set to: Hi Chris,\" · Change)");
if (!/const rerunBtn = [^\n]*!sentEmailOf\(s\.task\)/.test(admin)) F("a sent email offers Run again again");

console.log("  real record + 9 edge cases run through the real functions");
if (fails.length) { console.error("🔴 a sent email reads as a log again:"); for (const f of fails) console.error("   · " + f); process.exit(1); }
console.log("✅ a sent email reads as an email — envelope, plan in words, real paragraphs, no Change, no Run again");
